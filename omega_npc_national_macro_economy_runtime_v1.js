/* OMEGA NPC NATIONAL MACRO-ECONOMY RUNTIME v1.0.0
 * Data-driven country checkpoints. This first slice records evidence only:
 * it does not calculate GDP growth, national output value, inflation or unemployment changes.
 */
(function (g) {
  'use strict';

  const VERSION = '1.0.0';
  const HANDLER_ID = 'omega.npc-national-macro-economy.v1';
  const RULES_URL = 'npc_national_macro_economy_rules_v1.json';
  const runtime = {
    initialized: false,
    initPromise: null,
    ready: false,
    error: null,
    rules: null,
    manifest: null,
    profileMetadata: null,
    profilesByIso3: new Map(),
    coreCountryIds: new Set(),
    unregisterCountryHandler: null,
    commandHandlerRegistered: false,
    processedCountries: 0,
    skippedCountries: 0,
    deferredCountries: 0,
    failedCountries: 0,
    lastProcessedTurn: null
  };

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  };
  const clone = (value, seen = new WeakMap()) => {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const out = [];
      seen.set(value, out);
      for (const item of value) out.push(clone(item, seen));
      return out;
    }
    const out = {};
    seen.set(value, out);
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor') continue;
      const item = value[key];
      if (item !== undefined && typeof item !== 'function') out[key] = clone(item, seen);
    }
    return out;
  };
  const stable = value => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  };
  const fingerprint = value => {
    const input = stable(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  };
  const rootState = context => context?.state || g.Omega?.Simulation?.world?.state || g.Game?.state || g.gameState || null;
  const currentTurn = context => Math.max(0, Math.floor(finite(
    context?.turn ?? context?.simulationTurn ?? context?.event?.simulationTurn ??
    rootState(context)?.simulation?.turn ?? g.Omega?.Simulation?.clock?.turn
  ) ?? 0));

  function canonicalIso3(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const finance = g.OmegaFinanceMinistry || g.Omega?.FinanceMinistry;
    try {
      const profile = finance?.resolveCountry?.(raw);
      const iso3 = String(profile?.iso3 || '').trim().toUpperCase();
      if (iso3) return iso3;
    } catch (_) {}
    const bridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || g.Omega?.CanonicalIdentity;
    try {
      const resolved = bridge?.resolveCountry?.(raw);
      const row = resolved?.raw?.raw || resolved?.raw || {};
      const iso3 = String(row.iso3 || row.iso3Code || resolved?.iso3 || '').trim().toUpperCase();
      if (iso3) return iso3;
      if (/^[A-Z]{3}$/.test(String(resolved?.id || '').toUpperCase())) return String(resolved.id).toUpperCase();
    } catch (_) {}
    return /^[A-Z]{3}$/.test(raw.toUpperCase()) ? raw.toUpperCase() : null;
  }

  function findProfile(countryValue) {
    const iso3 = canonicalIso3(countryValue);
    return iso3 ? runtime.profilesByIso3.get(iso3) || null : null;
  }

  function isPlayerCountry(countryId, root) {
    const sim = g.Omega?.Simulation;
    const candidates = [
      root?.simulation?.session?.playerCountryId,
      root?.simulation?.playerCountryId,
      root?.playerCountryId,
      sim?.getPlayerCountryId?.()
    ];
    for (const candidate of candidates) {
      const resolved = canonicalIso3(candidate);
      if (resolved && resolved === countryId) return true;
    }
    return false;
  }

  async function fetchJson(path) {
    const fetcher = typeof g.fetchResilient === 'function' ? g.fetchResilient : g.fetch;
    if (typeof fetcher !== 'function') throw new Error('NPC_MACRO_FETCH_UNAVAILABLE');
    const result = await fetcher(path);
    if (isObject(result) && (result.ok === true || typeof result.json === 'function')) {
      if (result.ok === false) throw new Error('NPC_MACRO_HTTP_' + String(result.status || 'ERROR'));
      return result.json();
    }
    if (isObject(result)) return result;
    throw new Error('NPC_MACRO_JSON_RESPONSE_INVALID:' + path);
  }

  async function loadInputs() {
    const fixtures = g.__OMEGA_NPC_MACRO_FIXTURES__ || null;
    const rules = fixtures?.rules || await fetchJson(RULES_URL);
    const manifestPath = rules?.roster?.manifestPath;
    if (typeof manifestPath !== 'string' || !manifestPath.trim()) throw new Error('NPC_MACRO_ROSTER_MANIFEST_PATH_MISSING');
    const manifest = fixtures?.manifest || await fetchJson(manifestPath);
    if (!isObject(manifest?.countries) || !isObject(rules?.persistence) || typeof rules.persistence.commandType !== 'string' || !rules.persistence.commandType.trim() || typeof rules.persistence.ownerMinistry !== 'string' || !rules.persistence.ownerMinistry.trim() || !Array.isArray(rules?.baseline?.metrics) || !Array.isArray(rules?.liveSignals)) {
      throw new Error('NPC_MACRO_REGISTRY_OR_RULES_INVALID');
    }
    const coreIds = Object.keys(manifest.countries).map(value => String(value).trim().toUpperCase()).filter(Boolean).sort();
    const declaredCount = finite(manifest.counts?.countryEntities);
    if (!coreIds.length || (declaredCount !== null && declaredCount !== coreIds.length) || new Set(coreIds).size !== coreIds.length) {
      throw new Error('NPC_MACRO_CORE_ROSTER_COUNT_MISMATCH');
    }

    const finance = g.OmegaFinanceMinistry || g.Omega?.FinanceMinistry;
    if (!finance || typeof finance.getProfiles !== 'function' || typeof finance.resolveCountry !== 'function' ||
        typeof finance.getProfileMetadata !== 'function') throw new Error('NPC_MACRO_FINANCE_PROFILE_API_UNAVAILABLE');
    if (typeof finance.init === 'function') await finance.init();
    const profiles = finance.getProfiles();
    if (!Array.isArray(profiles)) throw new Error('NPC_MACRO_FINANCE_PROFILES_UNAVAILABLE');
    runtime.profilesByIso3 = new Map();
    for (const profile of profiles) {
      const iso3 = String(profile?.iso3 || '').trim().toUpperCase();
      if (iso3) runtime.profilesByIso3.set(iso3, profile);
    }
    const unresolved = coreIds.filter(iso3 => {
      const profile = finance.resolveCountry(iso3) || runtime.profilesByIso3.get(iso3);
      return !profile || String(profile.iso3 || '').trim().toUpperCase() !== iso3;
    });
    if (unresolved.length) throw new Error('NPC_MACRO_CORE_ROSTER_PROFILE_JOIN_FAILED:' + unresolved.length);
    runtime.profileMetadata = finance.getProfileMetadata();
    if (!isObject(runtime.profileMetadata)) throw new Error('NPC_MACRO_PROFILE_METADATA_UNAVAILABLE');
    runtime.coreCountryIds = new Set(coreIds);
    runtime.manifest = manifest;
    runtime.rules = rules;
  }

  function normalizedKey(value) {
    return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function countryAliases(profile, countryId) {
    return new Set([
      countryId, profile?.iso3, profile?.countryCode, profile?.economyKey,
      profile?.populationKey, profile?.name, profile?.officialName
    ].filter(Boolean).map(normalizedKey));
  }

  function countryRecord(root, domain, profile, countryId) {
    const section = root?.[domain];
    if (!isObject(section)) return null;
    const aliases = countryAliases(profile, countryId);
    for (const [key, value] of Object.entries(section)) {
      if (aliases.has(normalizedKey(key)) && isObject(value)) return value;
    }
    return null;
  }

  function readPath(root, profile, countryId, path) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (parts.length < 2) return undefined;
    const record = countryRecord(root, parts[0], profile, countryId);
    if (!record) return undefined;
    let value = record;
    for (const part of parts.slice(1)) {
      if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), part)) return undefined;
      value = value[part];
    }
    return value;
  }

  function metricRecord(value, metadata, fallback) {
    const numericValue = finite(value);
    if (numericValue === null) {
      return {
        value: null,
        availability: fallback === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNOBSERVED',
        unit: metadata.unit || null,
        currency: metadata.currency || null,
        authority: 'UNOBSERVED',
        source: null,
        year: null,
        confidence: null,
        note: null
      };
    }
    return {
      value: numericValue,
      availability: 'AVAILABLE',
      unit: metadata.unit || null,
      currency: metadata.currency || null,
      authority: metadata.authority || 'SOURCE_OBSERVATION',
      source: metadata.source || null,
      year: metadata.year ?? null,
      confidence: finite(metadata.confidence),
      note: metadata.note || null
    };
  }

  function buildBaseline(countryId, profile) {
    const rules = runtime.rules.baseline;
    const generalApi = g.Omega?.CountryGeneralData || g.OmegaCountryGeneralDataRuntime || null;
    let general = null;
    try {
      if (typeof generalApi?.getCountryRecord === 'function') general = generalApi.getCountryRecord(countryId);
    } catch (_) {}
    const metrics = {};
    for (const rule of rules.metrics) {
      const generalKey = rule.generalDataMetric;
      const generalValue = generalKey ? general?.metrics?.[generalKey] : null;
      const generalMeta = generalKey ? general?.metricMetadata?.[generalKey] : null;
      const profileValue = profile?.indicators?.[rule.profileMetric];
      const useGeneral = finite(generalValue) !== null;
      const value = useGeneral ? generalValue : profileValue;
      const meta = useGeneral
        ? {
            unit: rule.unit,
            currency: rule.currency || null,
            authority: generalMeta?.status ? 'COUNTRY_GENERAL_DATA_' + String(generalMeta.status).toUpperCase() : 'COUNTRY_GENERAL_DATA_OBSERVATION',
            source: generalMeta?.sourceName || generalMeta?.sourceId || general?.datasetId || null,
            sourceUrl: generalMeta?.sourceUrl || null,
            method: generalMeta?.method || null,
            sourceStatus: generalMeta?.status || null,
            freshness: generalMeta?.freshness ?? null,
            year: generalMeta?.year ?? null,
            confidence: generalMeta?.confidence ?? generalMeta?.sourceConfidence ?? null,
            note: generalMeta?.dataGap || generalMeta?.note || null
          }
        : {
            unit: rule.unit,
            currency: rule.currency || null,
            authority: profile?.profileStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'LOCAL_BASELINE_NOT_EXTERNALLY_REVALIDATED',
            source: profile?.provenance?.economicSource || runtime.profileMetadata?.economicBaselineSource || rules.source || null,
            year: runtime.profileMetadata?.baselineYear ?? null,
            confidence: null,
            note: profile?.profileStatus === 'UNAVAILABLE' ? 'Country economic baseline unavailable in the current local profile registry.' : 'Repository-local baseline; not independently revalidated against current official statistical series.'
          };
      let fallback = 'UNOBSERVED';
      if (profile?.metricAvailability?.[rule.profileMetric] === false || profile?.profileStatus === 'UNAVAILABLE') fallback = 'UNAVAILABLE';
      metrics[rule.id] = metricRecord(value, meta, fallback);
    }
    return {
      baselineYear: runtime.profileMetadata?.baselineYear ?? null,
      registry: rules.source || null,
      profileStatus: profile?.profileStatus || 'UNOBSERVED',
      provenance: clone(profile?.provenance || {}),
      metrics
    };
  }

  function readLiveSignal(root, profile, countryId, rule) {
    const raw = readPath(root, profile, countryId, rule.path);
    const missing = raw === undefined || raw === null;
    let value = null;
    let availability = missing ? 'UNOBSERVED' : 'AVAILABLE';
    if (!missing) {
      if (rule.type === 'number') value = finite(raw);
      else if (rule.type === 'presence') value = finite(raw) !== null;
      else if (rule.type === 'array-count') value = Array.isArray(raw) ? raw.length : null;
      else if (rule.type === 'settled-record-count') {
        value = Array.isArray(raw) ? raw.filter(row => String(row?.status || '').toUpperCase() === String(rule.requiredStatus || 'SETTLED').toUpperCase()).length : null;
      } else if (rule.type === 'status-counts') {
        if (Array.isArray(raw)) {
          value = {};
          for (const [group, statuses] of Object.entries(rule.statusGroups || {})) {
            const accepted = new Set((Array.isArray(statuses) ? statuses : []).map(item => String(item).toUpperCase()));
            value[group] = raw.filter(row => accepted.has(String(row?.status || '').toUpperCase())).length;
          }
        }
      }
      if (value === null) availability = 'UNOBSERVED';
    }
    return {
      value,
      availability,
      unit: rule.unit || null,
      authority: rule.authority || 'COUNTRY_RUNTIME_STATE',
      source: rule.path,
      meaning: rule.meaning || null
    };
  }

  function buildLiveActivity(root, profile, countryId) {
    const live = {};
    for (const rule of runtime.rules.liveSignals) live[rule.id] = readLiveSignal(root, profile, countryId, rule);
    return live;
  }

  function buildDeltas(previous, current) {
    const deltas = {};
    if (!isObject(previous) || !isObject(current)) return deltas;
    for (const [key, next] of Object.entries(current)) {
      const prior = previous[key];
      if (!prior || prior.availability !== 'AVAILABLE' || next?.availability !== 'AVAILABLE') continue;
      if (prior.unit !== next.unit) continue;
      const before = finite(prior.value), after = finite(next.value);
      if (before !== null && after !== null) deltas[key] = { value: after - before, unit: next.unit || null, authority: 'TURN_TO_TURN_SOURCE_SIGNAL_DELTA' };
    }
    return deltas;
  }

  function checkpointHandler(command, context) {
    const payload = command?.payload || {};
    const countryId = canonicalIso3(context?.countryId || payload.countryId);
    const checkpoint = payload.checkpoint;
    if (!countryId || !runtime.coreCountryIds.has(countryId) || !isObject(checkpoint) || checkpoint.countryId !== countryId) {
      return { accepted: false, reason: 'NPC_MACRO_CHECKPOINT_COUNTRY_OR_PAYLOAD_INVALID' };
    }
    const current = context.stateTransaction.get(runtime.rules.persistence.statePath);
    if (isObject(current) && finite(current.lastProcessedTurn) !== null && current.lastProcessedTurn >= checkpoint.lastProcessedTurn) {
      return { accepted: true, duplicate: true, noStateChangeAccepted: true, reason: 'COUNTRY_TURN_ALREADY_CHECKPOINTED' };
    }
    context.stateTransaction.set(runtime.rules.persistence.statePath, checkpoint);
    return { accepted: true, stateMutationAuthority: 'OMEGA_MINISTRY_STATE_TRANSACTION', countryId, lastProcessedTurn: checkpoint.lastProcessedTurn };
  }

  function registerIntegrations() {
    const interop = g.Omega?.MinistryInteroperability || g.OmegaMinistryInteroperability || null;
    const scheduler = g.Omega?.WorldSimulationScheduler || g.OmegaWorldSimulationScheduler || null;
    if (!interop || typeof interop.registerCommandHandler !== 'function' || typeof interop.dispatchCommand !== 'function') {
      throw new Error('NPC_MACRO_MINISTRY_INTEROPERABILITY_UNAVAILABLE');
    }
    if (!scheduler || typeof scheduler.registerCountryHandler !== 'function') throw new Error('NPC_MACRO_WORLD_SCHEDULER_UNAVAILABLE');
    if (!runtime.commandHandlerRegistered) {
      interop.registerCommandHandler(runtime.rules.persistence.commandType, runtime.rules.persistence.ownerMinistry, checkpointHandler);
      runtime.commandHandlerRegistered = true;
    }
    if (!runtime.unregisterCountryHandler) {
      runtime.unregisterCountryHandler = scheduler.registerCountryHandler(HANDLER_ID, processCountry, {
        tiers: runtime.rules.scheduler?.tiers || ['ACTIVE', 'MACRO'],
        priority: finite(runtime.rules.scheduler?.priority) ?? 30
      });
    }
  }

  async function processCountry(countryValue, context = {}) {
    if (!runtime.ready) {
      runtime.deferredCountries += 1;
      return { status: 'DEFERRED', reason: 'NPC_MACRO_RUNTIME_NOT_READY' };
    }
    const countryId = canonicalIso3(countryValue);
    if (!countryId || !runtime.coreCountryIds.has(countryId)) {
      runtime.skippedCountries += 1;
      return { status: 'SKIPPED', reason: 'COUNTRY_NOT_IN_CORE_GAME_ROSTER' };
    }
    const root = rootState(context);
    if (!isObject(root)) {
      runtime.deferredCountries += 1;
      return { status: 'DEFERRED', reason: 'AUTHORITATIVE_WORLD_STATE_UNAVAILABLE', countryId };
    }
    if (isPlayerCountry(countryId, root)) {
      runtime.skippedCountries += 1;
      return { status: 'SKIPPED', reason: 'PLAYER_COUNTRY_REMAINS_PLAYER_CONTROLLED', countryId };
    }
    const profile = findProfile(countryId);
    if (!profile) {
      runtime.deferredCountries += 1;
      return { status: 'DEFERRED', reason: 'COUNTRY_FINANCE_PROFILE_UNAVAILABLE', countryId };
    }
    const turn = currentTurn(context);
    const previous = readPath(root, profile, countryId, runtime.rules.persistence.statePath);
    if (isObject(previous) && finite(previous.lastProcessedTurn) !== null && previous.lastProcessedTurn >= turn) {
      return { status: 'ALREADY_PROCESSED', countryId, turn, fingerprint: previous.sourceFingerprint || null };
    }

    const baseline = buildBaseline(countryId, profile);
    const liveActivity = buildLiveActivity(root, profile, countryId);
    const baselineFingerprint = fingerprint(baseline);
    const sourceFingerprint = fingerprint({ baseline, liveActivity, modelVersion: runtime.rules.modelVersion });
    const history = Array.isArray(previous?.snapshots) ? previous.snapshots.slice() : [];
    const previousSnapshot = history.length ? history[history.length - 1] : null;
    const snapshot = {
      turn,
      sourceFingerprint,
      liveActivity: clone(liveActivity),
      deltasFromPrevious: buildDeltas(previousSnapshot?.liveActivity, liveActivity)
    };
    const historyLimit = Math.max(1, Math.floor(finite(runtime.rules.persistence.historyLimit) ?? 24));
    history.push(snapshot);
    const checkpoint = {
      schemaVersion: finite(runtime.rules.schemaVersion) ?? 1,
      modelVersion: String(runtime.rules.modelVersion || VERSION),
      countryId,
      lastProcessedTurn: turn,
      sourceFingerprint,
      baselineFingerprint,
      baseline,
      liveActivity,
      snapshots: history.slice(-historyLimit),
      provenance: {
        rosterManifest: runtime.rules.roster.manifestPath,
        rosterScope: runtime.manifest.scope || null,
        baselineRegistry: runtime.rules.baseline?.source || null,
        baselineMetadata: clone(runtime.profileMetadata?.provenance || {}),
        lastCheckpointAuthority: 'OMEGA_NPC_NATIONAL_MACRO_ECONOMY_RUNTIME',
        progressionStatus: 'EVIDENCE_CHECKPOINT_ONLY_NO_MACRO_PROGRESSION_FORMULA'
      }
    };
    const interop = g.Omega?.MinistryInteroperability || g.OmegaMinistryInteroperability;
    const commandId = 'NPC-MACRO-CHECKPOINT-' + countryId + '-T' + turn;
    const ownerMinistry = runtime.rules.persistence.ownerMinistry;
    const commandType = runtime.rules.persistence.commandType;
    const result = interop.dispatchCommand(ownerMinistry, commandType, countryId, { countryId, checkpoint }, {
      turn,
      commandId,
      commandType,
      ownerMinistry,
      correlationId: commandId,
      provenance: { source: HANDLER_ID, modelVersion: runtime.rules.modelVersion }
    });
    if (result?.status !== 'APPLIED') {
      runtime.failedCountries += 1;
      return { status: 'FAILED', reason: result?.reason || result?.result?.reason || result?.status || 'NPC_MACRO_CHECKPOINT_COMMIT_FAILED', countryId, turn };
    }
    runtime.processedCountries += 1;
    runtime.lastProcessedTurn = turn;
    return { status: 'CHECKPOINTED', countryId, turn, sourceFingerprint, baselineMetricCount: Object.keys(baseline.metrics).length, liveSignalCount: Object.keys(liveActivity).length, commandId };
  }

  async function init() {
    if (runtime.ready) return diagnostics();
    if (runtime.initPromise) return runtime.initPromise;
    runtime.initPromise = (async () => {
      await loadInputs();
      registerIntegrations();
      runtime.initialized = true;
      runtime.ready = true;
      runtime.error = null;
      return diagnostics();
    })();
    try {
      return await runtime.initPromise;
    } catch (error) {
      runtime.error = String(error?.message || error);
      runtime.initialized = false;
      runtime.ready = false;
      runtime.initPromise = null;
      throw error;
    }
  }

  function getSnapshot(countryValue) {
    const countryId = canonicalIso3(countryValue);
    if (!countryId || !runtime.coreCountryIds.has(countryId)) return null;
    const root = rootState();
    const profile = findProfile(countryId);
    if (!root || !profile) return null;
    const value = readPath(root, profile, countryId, runtime.rules?.persistence?.statePath || 'economy.npcMacroEconomy');
    return isObject(value) ? clone(value) : null;
  }

  function diagnostics() {
    return {
      version: VERSION,
      initialized: runtime.initialized,
      ready: runtime.ready,
      error: runtime.error,
      coreCountryCount: runtime.coreCountryIds.size,
      resolvedProfileCount: runtime.profilesByIso3.size,
      manifestSchemaVersion: runtime.manifest?.schemaVersion || null,
      modelVersion: runtime.rules?.modelVersion || null,
      profileBaselineYear: runtime.profileMetadata?.baselineYear ?? null,
      commandHandlerRegistered: runtime.commandHandlerRegistered,
      schedulerHandlerRegistered: typeof runtime.unregisterCountryHandler === 'function',
      schedulerTiers: clone(runtime.rules?.scheduler?.tiers || []),
      processedCountries: runtime.processedCountries,
      skippedCountries: runtime.skippedCountries,
      deferredCountries: runtime.deferredCountries,
      failedCountries: runtime.failedCountries,
      lastProcessedTurn: runtime.lastProcessedTurn
    };
  }

  const API = Object.freeze({ VERSION, init, processCountry, getSnapshot, diagnostics });
  g.Omega = g.Omega || {};
  g.Omega.NpcNationalMacroEconomy = API;
  g.OmegaNpcNationalMacroEconomy = API;

  if (typeof g.addEventListener === 'function') {
    g.addEventListener('OMEGA_READY', () => { init().catch(error => { runtime.error = String(error?.message || error); }); });
    g.addEventListener('load', () => { init().catch(error => { runtime.error = String(error?.message || error); }); }, { once: true });
  }
  if (g.document && (g.document.readyState === 'complete' || g.document.readyState === 'interactive')) {
    Promise.resolve().then(() => init().catch(error => { runtime.error = String(error?.message || error); }));
  }
})(typeof window !== 'undefined' ? window : globalThis);
