/* OMEGA NPC NATIONAL MACRO-ECONOMY RUNTIME v1.2.0
 * Evidence-calibrated NPC progression. All country writes remain inside the existing
 * Finance-owned country checkpoint; no parallel national accounts or per-frame work.
 */
(function (g) {
  'use strict';

  const VERSION = '1.2.0';
  const HANDLER_ID = 'omega.npc-national-macro-economy.v1';
  const RULES_URL = 'npc_national_macro_economy_rules_v1.json';
  const INPUTS_URL = 'npc_national_macro_economy_inputs_v1.json';
  const runtime = {
    initialized: false,
    initPromise: null,
    ready: false,
    error: null,
    rules: null,
    manifest: null,
    profileMetadata: null,
    baselineInputsByIso3: new Map(),
    baselineInputMetadata: null,
    profilesByIso3: new Map(),
    coreCountryIds: new Set(),
    unregisterCountryHandler: null,
    commandHandlerRegistered: false,
    processedCountries: 0,
    skippedCountries: 0,
    deferredCountries: 0,
    failedCountries: 0,
    lastProcessedTurn: null,
    macroProgressedCountries: 0,
    lastProgressionTurn: null,
    lastProgressionStatus: null
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
    const expectedCoreCountryCount = fixtures ? coreIds.length : 197;
    if (!coreIds.length || coreIds.length !== expectedCoreCountryCount ||
        declaredCount !== coreIds.length || new Set(coreIds).size !== coreIds.length) {
      throw new Error('NPC_MACRO_CORE_ROSTER_COUNT_MISMATCH');
    }

    const inputsPath = String(rules.baseline.inputsPath || INPUTS_URL);
    const inputs = fixtures?.inputs || await fetchJson(inputsPath);
    const requiredMetricIds = rules.baseline.metrics.map(row => String(row?.id || '').trim());
    const inputMetricIds = Array.isArray(inputs?.metadata?.metricIds) ? inputs.metadata.metricIds.map(String) : [];
    const inputCountryIds = isObject(inputs?.countries)
      ? Object.keys(inputs.countries).map(value => String(value).trim().toUpperCase()).sort()
      : [];
    if (!isObject(inputs?.metadata) || inputs.metadata.datasetId !== 'OMEGA_NPC_NATIONAL_MACRO_ECONOMY_INPUTS_V1' ||
        Number(inputs.metadata.countryCount) !== coreIds.length ||
        stable(inputMetricIds) !== stable(requiredMetricIds) ||
        stable(inputCountryIds) !== stable(coreIds)) {
      throw new Error('NPC_MACRO_INPUT_BUNDLE_ROSTER_OR_SCHEMA_MISMATCH');
    }
    const baselineInputsByIso3 = new Map();
    for (const iso3 of coreIds) {
      const country = inputs.countries[iso3];
      if (!isObject(country?.metrics) || stable(Object.keys(country.metrics).sort()) !== stable(requiredMetricIds.slice().sort())) {
        throw new Error('NPC_MACRO_INPUT_COUNTRY_METRICS_INVALID:' + iso3);
      }
      for (const metricId of requiredMetricIds) {
        const metric = country.metrics[metricId];
        if (!isObject(metric) || (metric.value !== null && finite(metric.value) === null) ||
            (metric.year !== null && finite(metric.year) === null)) {
          throw new Error('NPC_MACRO_INPUT_METRIC_RECORD_INVALID:' + iso3 + ':' + metricId);
        }
      }
      baselineInputsByIso3.set(iso3, country);
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
    runtime.baselineInputsByIso3 = baselineInputsByIso3;
    runtime.baselineInputMetadata = {
      datasetId: inputs.metadata.datasetId,
      schemaVersion: inputs.metadata.schemaVersion || null,
      sourceMode: inputs.metadata.sourceMode || null,
      sourceRegistry: inputs.metadata.sourceRegistry || null,
      sourceRegistryGeneratedAt: inputs.metadata.sourceRegistryGeneratedAt || null,
      generatedAt: inputs.metadata.generatedAt || null,
      countryCount: inputs.metadata.countryCount,
      metricIds: clone(inputMetricIds),
      coverage: clone(inputs.coverage || {})
    };
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
        authority: metadata.authority || (fallback === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNOBSERVED'),
        source: metadata.source || null,
        sourceUrl: metadata.sourceUrl || null,
        method: metadata.method || null,
        sourceStatus: metadata.sourceStatus || null,
        freshness: finite(metadata.freshness),
        year: metadata.year ?? null,
        confidence: finite(metadata.confidence),
        note: metadata.note || null
      };
    }
    return {
      value: numericValue,
      availability: 'AVAILABLE',
      unit: metadata.unit || null,
      currency: metadata.currency || null,
      authority: metadata.authority || 'SOURCE_OBSERVATION',
      source: metadata.source || null,
      sourceUrl: metadata.sourceUrl || null,
      method: metadata.method || null,
      sourceStatus: metadata.sourceStatus || null,
      freshness: finite(metadata.freshness),
      year: metadata.year ?? null,
      confidence: finite(metadata.confidence),
      note: metadata.note || null
    };
  }

  function buildBaseline(countryId, profile) {
    const rules = runtime.rules.baseline;
    const countryInputs = runtime.baselineInputsByIso3.get(countryId);
    if (!countryInputs || !isObject(countryInputs.metrics)) throw new Error('NPC_MACRO_COUNTRY_INPUTS_NOT_LOADED:' + countryId);
    const metrics = {};
    for (const rule of rules.metrics) {
      const input = countryInputs.metrics[rule.id];
      const value = finite(input?.value);
      const sourceStatus = input?.sourceStatus || (value === null ? 'MISSING' : 'SOURCE_STATUS_UNKNOWN');
      const meta = {
        unit: rule.unit,
        currency: rule.currency || null,
        authority: 'COUNTRY_GENERAL_DATA_' + String(sourceStatus).toUpperCase(),
        source: input?.sourceName || input?.sourceId || runtime.baselineInputMetadata?.sourceRegistry || null,
        sourceUrl: input?.sourceUrl || null,
        method: input?.method || null,
        sourceStatus,
        freshness: finite(input?.freshness),
        year: input?.year ?? null,
        confidence: finite(input?.confidence),
        note: input?.dataGap || input?.note || null
      };
      let fallback = 'UNOBSERVED';
      if (profile?.metricAvailability?.[rule.profileMetric] === false || profile?.profileStatus === 'UNAVAILABLE') {
        fallback = 'UNAVAILABLE';
      }
      metrics[rule.id] = metricRecord(value, meta, fallback);
    }
    return {
      baselineYear: runtime.profileMetadata?.baselineYear ?? null,
      registry: runtime.baselineInputMetadata?.sourceRegistry || rules.source || null,
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

  function buildForeignInvestmentEvidence(root, profile, countryId, baseline, previousTurn, currentTurnValue) {
    const finance = countryRecord(root, 'finance', profile, countryId);
    const economy = countryRecord(root, 'economy', profile, countryId);
    const ledger = Array.isArray(finance?.omegaFinance?.foreignInvestmentLedger) ? finance.omegaFinance.foreignInvestmentLedger : null;
    const assets = Array.isArray(economy?.productionAssets) ? economy.productionAssets : null;
    if (!ledger || !assets) return {
      value: null, availability: 'UNOBSERVED', unit: 'USD_AND_FACTORY_EMPLOYMENT_COUNTS',
      authority: 'COUNTRY_FINANCE_FDI_LEDGER_AND_SHARED_PRODUCTION_ASSET_POOL',
      source: 'finance.omegaFinance.foreignInvestmentLedger+economy.productionAssets',
      note: 'Both the settled host-country FDI ledger and shared production asset pool are required.'
    };
    const fx = currencyAndFx(profile, baseline);
    const settled = ledger.filter(row => String(row?.status || '').toUpperCase() === 'SETTLED' &&
      finite(row?.turn) !== null && finite(row.turn) > previousTurn && finite(row.turn) <= currentTurnValue);
    const receiptsUsd = settled.reduce((sum, row) => sum + Math.max(0, finite(row?.amountUsd) ?? 0), 0);
    const catalog = g.OmegaResourceIndustrialCatalogData || g.Omega?.ResourceIndustrialCatalogData || {};
    const profiles = catalog.factoryProfiles || {};
    const foreignFunded = assets.filter(asset => Array.isArray(asset?.foreignInvestmentSources) &&
      asset.foreignInvestmentSources.some(source => finite(source?.amount) > 0));
    const active = foreignFunded.filter(asset => String(asset?.status || '').toUpperCase() === 'OPERATIONAL' && asset?.productionEnabled !== false);
    const jobs = asset => {
      const factoryProfile = profiles[String(asset?.factoryType || asset?.type || '').toUpperCase()] || {};
      return {
        supported: Math.max(0, Math.floor(finite(asset?.employment?.jobsSupported) ?? finite(factoryProfile.employment?.jobsPerFactory) ?? 0)),
        filled: Math.max(0, Math.floor(finite(asset?.employment?.jobsFilled) ?? 0))
      };
    };
    const jobTotals = active.reduce((sum, asset) => { const value = jobs(asset); sum.supported += value.supported; sum.filled += value.filled; return sum; }, { supported: 0, filled: 0 });
    const newlyCommissioned = foreignFunded.filter(asset => {
      const at = finite(asset?.foreignInvestmentCommissionedTurn);
      return at !== null && at > previousTurn && at <= currentTurnValue;
    });
    const capexLocal = newlyCommissioned.reduce((sum, asset) => sum + Math.max(0, finite(asset?.foreignInvestmentCapexAmount) ?? 0), 0);
    const capexCurrency = newlyCommissioned.map(asset => String(asset?.foreignInvestmentCurrency || '').trim().toUpperCase()).filter(Boolean);
    const capexCompatible = !capexCurrency.length || capexCurrency.every(code => code === fx.currencyCode);
    const capexUsd = fx.localPerUsd !== null && capexCompatible ? capexLocal / fx.localPerUsd : null;
    return {
      value: {
        settledForeignInvestmentReceiptUsd: Number(receiptsUsd.toFixed(4)),
        settledForeignInvestmentCount: settled.length,
        foreignFundedFactoryCount: foreignFunded.length,
        activeForeignFundedFactoryCount: active.length,
        newlyCommissionedForeignFundedFactoryCount: newlyCommissioned.length,
        newlyCommissionedForeignInvestmentCapexUsd: capexUsd === null ? null : Number(capexUsd.toFixed(4)),
        foreignFundedJobsSupported: jobTotals.supported,
        foreignFundedJobsFilled: jobTotals.filled,
        currencyCode: fx.currencyCode,
        fxLocalPerUsd: fx.localPerUsd
      },
      availability: 'AVAILABLE', unit: 'USD_AND_FACTORY_EMPLOYMENT_COUNTS',
      authority: 'SETTLED_CROSS_BORDER_FINANCE_LEDGER_AND_PRIVATE_FACTORIES_IN_SHARED_PRODUCTION_POOL',
      source: 'finance.omegaFinance.foreignInvestmentLedger+economy.productionAssets',
      note: 'Only settled FDI receipts and operational FDI-funded assets in the canonical country factory pool are counted; job counts use the existing simulated factory-employment reconciliation.'
    };
  }

  function buildLiveActivity(root, profile, countryId, baseline, previousTurn, currentTurnValue) {
    const live = {};
    for (const rule of runtime.rules.liveSignals) live[rule.id] = readLiveSignal(root, profile, countryId, rule);
    live.industrialOutputByResourceUnit = buildIndustrialOutputEvidence(root, profile, countryId);
    live.settledTradeActivity = buildSettledTradeEvidence(root, profile, countryId, baseline, previousTurn, currentTurnValue);
    live.foreignInvestmentEvidence = buildForeignInvestmentEvidence(root, profile, countryId, baseline, previousTurn, currentTurnValue);
    live.diplomaticPolicyContext = buildDiplomacyEvidence(root, profile, countryId);
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


  function currencyAndFx(profile, baseline) {
    const forex = g.OmegaForexMonetaryEngine || g.Omega?.ForexMonetaryEngine;
    let currency = null, localPerUsd = null;
    try { currency = forex?.getCurrencyCode?.(profile) || profile?.currencyCode || profile?.currency || null; } catch (_) {}
    const currencyCode = String(currency || '').trim().toUpperCase() || null;
    if (currencyCode === 'USD') localPerUsd = 1;
    if (localPerUsd === null && currencyCode) {
      try { localPerUsd = finite(forex?.getRate?.(currencyCode, 'SIMULATION')); } catch (_) {}
    }
    if (localPerUsd === null) localPerUsd = finite(baseline?.metrics?.exchangeRateLocalPerUsd?.value);
    return { currencyCode, localPerUsd: localPerUsd !== null && localPerUsd > 0 ? localPerUsd : null };
  }

  function buildIndustrialOutputEvidence(root, profile, countryId) {
    const resource = countryRecord(root, 'resource', profile, countryId);
    const ledger = Array.isArray(resource?.finishedGoodsLedger) ? resource.finishedGoodsLedger : null;
    const batches = Array.isArray(resource?.batches) ? resource.batches.slice(-4096) : [];
    if (!ledger) return {
      value: null, availability: 'UNOBSERVED', unit: 'RESOURCE_ID_AND_DECLARED_UNIT',
      authority: 'COUNTRY_FINISHED_GOODS_LEDGER', source: 'resource.finishedGoodsLedger',
      note: 'No authoritative finished-goods ledger is registered for this country.'
    };
    const byId = new Map();
    for (const row of batches.slice(-8192)) {
      const batchId = String(row?.batchId || '').trim();
      if (batchId) byId.set(batchId, row);
    }
    const rows = {};
    const seen = new Set();
    for (const record of ledger.slice(-256)) {
      const status = String(record?.status || '').toUpperCase();
      if (!['AVAILABLE_TO_ECONOMY', 'AVAILABLE', 'COMPLETED'].includes(status)) continue;
      const batchIds = Array.isArray(record?.createdBatchIds) ? record.createdBatchIds : [];
      for (const batchIdValue of batchIds) {
        const batchId = String(batchIdValue || '').trim();
        if (!batchId || seen.has(batchId)) continue;
        seen.add(batchId);
        const batch = byId.get(batchId);
        if (!batch) continue;
        const resourceId = String(batch.resourceId || batch.materialIdentity || '').trim().toLowerCase();
        const unit = String(batch.unit || '').trim();
        const quantity = finite(batch.quantity);
        if (!resourceId || !unit || quantity === null || quantity <= 0) continue;
        const key = resourceId + '|' + unit;
        if (!rows[key]) rows[key] = { resourceId, unit, quantity: 0, batchCount: 0 };
        rows[key].quantity += quantity;
        rows[key].batchCount += 1;
      }
    }
    return {
      value: { rows, sourceRecordCount: ledger.length, sampledRecordCount: Math.min(ledger.length, 256), sampledBatchCount: batches.length },
      availability: 'AVAILABLE', unit: 'RESOURCE_ID_AND_DECLARED_UNIT',
      authority: 'COUNTRY_FINISHED_GOODS_LEDGER', source: 'resource.finishedGoodsLedger',
      note: 'Quantities remain separated by canonical resource identity and declared unit; no unlike commodities are summed.'
    };
  }

  function buildSettledTradeEvidence(root, profile, countryId, baseline, previousTurn, turn) {
    const trade = countryRecord(root, 'trade', profile, countryId);
    const imports = Array.isArray(trade?.importLedger) ? trade.importLedger : null;
    const exports = Array.isArray(trade?.exportLedger) ? trade.exportLedger : null;
    if (!imports || !exports) return {
      value: null, availability: 'UNOBSERVED', unit: 'USD_PER_CHECKPOINT_INTERVAL',
      authority: 'GLOBAL_TRADE_SETTLEMENT_LEDGER', source: 'trade.importLedger+trade.exportLedger',
      note: 'Settled import/export value ledgers are not both available.'
    };
    const fx = currencyAndFx(profile, baseline);
    if (fx.localPerUsd === null) return {
      value: null, availability: 'UNOBSERVED', unit: 'USD_PER_CHECKPOINT_INTERVAL',
      authority: 'GLOBAL_TRADE_SETTLEMENT_LEDGER_WITHOUT_FX', source: 'trade.importLedger+trade.exportLedger',
      note: 'Settled values are recorded but no usable country currency-to-USD rate is available.'
    };
    const inPeriod = rows => rows.filter(row => {
      const rowTurn = finite(row?.turn);
      return rowTurn !== null && rowTurn > previousTurn && rowTurn <= turn;
    });
    const importRows = inPeriod(imports), exportRows = inPeriod(exports);
    const sum = rows => {
      let value = 0, count = 0, currency = null, valid = true;
      for (const row of rows) {
        const amount = finite(row?.totalValue);
        if (amount === null || amount < 0) { valid = false; continue; }
        const code = String(row?.currency || fx.currencyCode || '').trim().toUpperCase() || null;
        if (currency && code && currency !== code) valid = false;
        currency = currency || code;
        value += amount;
        count += 1;
      }
      return { value, count, currency, valid };
    };
    const imported = sum(importRows), exported = sum(exportRows);
    if (!imported.valid || !exported.valid ||
        (imported.currency && exported.currency && imported.currency !== exported.currency)) return {
      value: null, availability: 'UNOBSERVED', unit: 'USD_PER_CHECKPOINT_INTERVAL',
      authority: 'GLOBAL_TRADE_SETTLEMENT_LEDGER_CURRENCY_MISMATCH',
      source: 'trade.importLedger+trade.exportLedger',
      note: 'Mixed or invalid native currency amounts were excluded from macro aggregation.'
    };
    const importUsd = imported.value / fx.localPerUsd;
    const exportUsd = exported.value / fx.localPerUsd;
    return {
      value: {
        importValueUsd: Number(importUsd.toFixed(4)),
        exportValueUsd: Number(exportUsd.toFixed(4)),
        netTradeValueUsd: Number((exportUsd - importUsd).toFixed(4)),
        grossTradeValueUsd: Number((exportUsd + importUsd).toFixed(4)),
        importSettlementCount: imported.count,
        exportSettlementCount: exported.count,
        currencyCode: fx.currencyCode || imported.currency || exported.currency || null,
        localPerUsd: fx.localPerUsd
      },
      availability: 'AVAILABLE', unit: 'USD_PER_CHECKPOINT_INTERVAL',
      authority: 'SETTLED_TRADE_LEDGER_USD_NORMALIZED',
      source: 'trade.importLedger+trade.exportLedger',
      note: 'Only completed import/export settlement ledger values in one known country currency are normalized; order-book matches and pending requests are excluded.'
    };
  }

  function playerCountryId(root) {
    const candidates = [
      root?.simulation?.session?.playerCountryId,
      root?.simulation?.playerCountryId,
      g.Omega?.Simulation?.getPlayerCountryId?.()
    ];
    for (const value of candidates) {
      const resolved = canonicalIso3(value);
      if (resolved) return resolved;
    }
    return null;
  }

  function buildDiplomacyEvidence(root, profile, countryId) {
    const foreign = countryRecord(root, 'foreign', profile, countryId);
    const trade = countryRecord(root, 'trade', profile, countryId);
    const relations = isObject(foreign?.relations) ? foreign.relations : null;
    const treaties = isObject(foreign?.treaties) ? foreign.treaties : {};
    if (!relations) return {
      value: null, availability: 'UNOBSERVED', unit: 'BILATERAL_POLICY_SNAPSHOT',
      authority: 'FOREIGN_MINISTRY_STATE', source: 'foreign.relations+foreign.treaties',
      note: 'No country-owned foreign-relations register is available.'
    };
    const relationRows = Object.entries(relations).filter(([, row]) => isObject(row));
    const treatyRows = Object.entries(treaties).filter(([, row]) => isObject(row));
    const activeTreaties = treatyRows.filter(([, row]) =>
      /SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(String(row.status || row.stage || '').toUpperCase()));
    const warRows = relationRows.filter(([, row]) => row.war_state === true);
    const sanctionRows = relationRows.filter(([, row]) => row.sanctions === true);
    const disruptionRows = relationRows.filter(([, row]) => row.war_state === true || row.sanctions === true);
    const tradeAgreements = relationRows.filter(([, row]) => row.trade_agreement === true);
    const tradeTreaties = activeTreaties.filter(([, row]) =>
      /TRADE|ECONOMY|COMMERCE|SUPPLY|ENERGY|RESOURCE|CUSTOMS|MARKET|INVESTMENT/.test(
        String(row.treatyType || '') + ' ' + JSON.stringify(row.terms || {})
      ));
    const tradePartnerIds = new Set();
    for (const [partnerId] of tradeAgreements) tradePartnerIds.add(canonicalIso3(partnerId) || partnerId);
    for (const [partnerId] of tradeTreaties) tradePartnerIds.add(canonicalIso3(partnerId) || partnerId);
    const playerId = playerCountryId(root);
    const playerRelation = playerId ? (relations[playerId] ||
      relationRows.find(([key]) => canonicalIso3(key) === playerId)?.[1] || null) : null;
    const playerTreaty = playerId ? (treaties[playerId] ||
      treatyRows.find(([key]) => canonicalIso3(key) === playerId)?.[1] || null) : null;
    const bank = g.OmegaGovernmentBanking || g.Omega?.GovernmentBanking;
    let importTariffPct = finite(trade?.importTariffPct ?? trade?.policy?.importTariffPct ?? trade?.tradePolicy?.importTariffPct);
    try {
      const bankPolicy = bank?.getCountryPolicy?.(countryId);
      if (finite(bankPolicy?.importTariffPct) !== null) importTariffPct = finite(bankPolicy.importTariffPct);
    } catch (_) {}
    const foreignPolicy = foreign?.policy || foreign?.foreignPolicy || null;
    const tradePolicy = trade?.policy || trade?.tradePolicy || null;
    return {
      value: {
        observedRelationCount: relationRows.length,
        activeTreatyCount: activeTreaties.length,
        activeTradeTreatyCount: tradeTreaties.length,
        activeTradePartnerCount: tradePartnerIds.size,
        explicitTradeAgreementCount: tradeAgreements.length,
        warCountryCount: warRows.length,
        sanctionedCountryCount: sanctionRows.length,
        tradeDisruptionCountryCount: disruptionRows.length,
        playerCountryId: playerId,
        playerRelationObserved: !!playerRelation,
        playerRelationScore: finite(playerRelation?.overall ?? playerRelation?.trade ?? playerRelation?.trust),
        playerTradeAgreement: playerRelation?.trade_agreement === true ||
          !!playerTreaty && /SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(String(playerTreaty.status || playerTreaty.stage || '').toUpperCase()),
        playerWarState: playerRelation?.war_state === true,
        playerSanctions: playerRelation?.sanctions === true,
        importTariffPct,
        foreignPolicy: typeof foreignPolicy === 'string' ? foreignPolicy : (foreignPolicy?.stance || foreignPolicy?.type || null),
        tradePolicy: typeof tradePolicy === 'string' ? tradePolicy : (tradePolicy?.stance || tradePolicy?.mode || null)
      },
      availability: 'AVAILABLE', unit: 'BILATERAL_POLICY_SNAPSHOT',
      authority: 'FOREIGN_AND_TRADE_MINISTRY_STATE',
      source: 'foreign.relations+foreign.treaties+trade.policy',
      note: 'Only this country’s observed relations, treaty records and recorded trade policy are used; missing policy fields remain null.'
    };
  }

  function liveValue(live, key) {
    const row = live?.[key];
    return row?.availability === 'AVAILABLE' ? row.value : null;
  }

  function deriveProgression(baseline, live, previous, turn, stepDurationMs) {
    const rules = runtime.rules.progression || {};
    const priorLive = previous?.liveActivity || {};
    const priorProgression = previous?.progression || null;
    const elapsedTurns = Math.max(1, turn - (finite(previous?.lastProcessedTurn) ?? (turn - 1)));
    const durationMs = Math.max(0, finite(stepDurationMs) ?? finite(rules.simulationTurnDurationMs) ?? 86400000) * elapsedTurns;
    const years = durationMs / (finite(rules.annualizationMs) ?? 31536000000);
    const maxAnnualGrowth = Math.max(0.1, finite(rules.maxAnnualIndustryGrowthPct) ?? 18);
    const maxGrowthPp = Math.max(0.1, finite(rules.maxGrowthContributionPp) ?? 2.5);
    const metric = key => finite(baseline?.metrics?.[key]?.value);
    const currentMetric = key => liveValue(live, key);
    const baseGdp = currentMetric('currentNominalGdpUsd') ?? metric('gdpCurrentUsd');
    const baseGrowth = currentMetric('currentGdpGrowthPct') ?? metric('gdpGrowthPct');
    const baseInflation = currentMetric('currentInflationPct') ?? metric('inflationRatePct');
    const baseUnemployment = currentMetric('currentUnemploymentPct') ?? metric('unemploymentRatePct');
    const tradeEvidence = live?.settledTradeActivity?.availability === 'AVAILABLE' ? live.settledTradeActivity.value : null;
    const diplomacy = live?.diplomaticPolicyContext?.availability === 'AVAILABLE' ? live.diplomaticPolicyContext.value : null;
    const policyEffects = runtime.rules.policyEffects || {};
    const policyToken = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
    const policyFactor = (table, value) => {
      const raw = value ? finite(table?.[policyToken(value)]) : null;
      return raw !== null && raw > 0 ? raw : 1;
    };
    const tradePolicyFactor = policyFactor(policyEffects.tradePolicyFactors, diplomacy?.tradePolicy);
    const foreignPolicyFactor = policyFactor(policyEffects.foreignPolicyFactors, diplomacy?.foreignPolicy);
    const relationRaw = finite(diplomacy?.playerRelationScore);
    const relationNormalized = relationRaw === null ? null : (relationRaw > 1 ? relationRaw / 100 : relationRaw);
    const playerRelationFactor = relationNormalized === null ? 1 :
      Math.max(finite(policyEffects.minimumPlayerRelationFactor) ?? 0.85,
        Math.min(finite(policyEffects.maximumPlayerRelationFactor) ?? 1.15,
          (finite(policyEffects.playerRelationFactorBase) ?? 0.85) +
          relationNormalized * (finite(policyEffects.playerRelationFactorRange) ?? 0.30)));
    const policyAccessMultiplier = Math.max(finite(policyEffects.minimumCombinedFactor) ?? 0.60,
      Math.min(finite(policyEffects.maximumCombinedFactor) ?? 1.25,
        tradePolicyFactor * foreignPolicyFactor * playerRelationFactor));
    const projects = live?.autonomousProjectStatusCounts?.value || null;
    const priorProjects = priorLive?.autonomousProjectStatusCounts?.value || null;
    const projectDelta = projects && priorProjects
      ? Math.max(0, (finite(projects.completed) || 0) - (finite(priorProjects.completed) || 0)) : 0;
    const outputNow = live?.industrialOutputByResourceUnit?.availability === 'AVAILABLE'
      ? live.industrialOutputByResourceUnit.value?.rows || {} : null;
    const outputPrior = priorLive?.industrialOutputByResourceUnit?.availability === 'AVAILABLE'
      ? priorLive.industrialOutputByResourceUnit.value?.rows || {} : null;
    let outputGrowthRates = [];
    if (outputNow && outputPrior && years > 0) {
      for (const [key, row] of Object.entries(outputNow)) {
        const prior = outputPrior[key];
        const before = finite(prior?.quantity), after = finite(row?.quantity);
        if (!prior || prior.unit !== row.unit || before === null || after === null || before <= 0 || after <= 0) continue;
        const annualized = (Math.log(after / before) / years) * 100;
        if (Number.isFinite(annualized)) outputGrowthRates.push(Math.max(-maxAnnualGrowth, Math.min(maxAnnualGrowth, annualized)));
      }
    }
    const industrialOutputGrowthPct = outputGrowthRates.length
      ? outputGrowthRates.reduce((sum, value) => sum + value, 0) / outputGrowthRates.length : null;
    const industrySensitivity = finite(rules.industryGrowthSensitivity) ?? 0.20;
    const industryContributionPp = industrialOutputGrowthPct === null ? null :
      Math.max(-maxGrowthPp, Math.min(maxGrowthPp, industrialOutputGrowthPct * industrySensitivity));
    const tradeSensitivity = finite(rules.tradeBalanceToGdpSensitivity) ?? 0.08;
    let tradeContributionPp = null, tradeBalanceToGdpPct = null;
    if (tradeEvidence && baseGdp !== null && baseGdp > 0 && years > 0) {
      tradeBalanceToGdpPct = (finite(tradeEvidence.netTradeValueUsd) || 0) / (baseGdp * years) * 100;
      const treatyBoost = diplomacy
        ? 1 + Math.min(1, (finite(diplomacy.activeTradePartnerCount) ??
          finite(diplomacy.activeTradeTreatyCount) ?? 0) /
          Math.max(1, diplomacy.observedRelationCount)) *
          (finite(rules.treatyTradeAccessSensitivity) ?? 0.15) : 1;
      const disruption = diplomacy
        ? Math.max(0, 1 - (finite(diplomacy.tradeDisruptionCountryCount) ??
          (diplomacy.warCountryCount + diplomacy.sanctionedCountryCount)) *
          (finite(rules.tradeDisruptionPerCountry) ?? 0.12)) : 1;
      tradeContributionPp = Math.max(-maxGrowthPp, Math.min(maxGrowthPp,
        tradeBalanceToGdpPct * tradeSensitivity * treatyBoost * disruption * policyAccessMultiplier));
    }
    const grossCapitalFormationPctGdp = metric('grossCapitalFormationPctGdp');
    const foreignInvestment = live?.foreignInvestmentEvidence?.availability === 'AVAILABLE' ? live.foreignInvestmentEvidence.value : null;
    const foreignFactoryDelta = Math.max(0, finite(foreignInvestment?.newlyCommissionedForeignFundedFactoryCount) ?? 0);
    const investmentIndexPrior = finite(priorProgression?.investmentActivityIndex);
    const projectIndexStep = finite(rules.investmentIndexPointsPerCompletedProject) ?? 0.8;
    const maxInvestmentIndex = finite(rules.maximumInvestmentActivityIndex) ?? 250;
    const allInvestmentSteps = projectDelta + foreignFactoryDelta;
    const investmentActivityIndex = grossCapitalFormationPctGdp !== null
      ? Math.min(maxInvestmentIndex, (investmentIndexPrior ?? 100) + allInvestmentSteps * projectIndexStep)
      : (projects || foreignInvestment ? Math.min(maxInvestmentIndex, (investmentIndexPrior ?? 100) + allInvestmentSteps * projectIndexStep) : null);
    const investmentStatus = grossCapitalFormationPctGdp !== null
      ? (allInvestmentSteps ? 'SOURCE_BASELINE_PLUS_RECORDED_PROJECT_AND_FOREIGN_INVESTMENT_ACTIVITY' : 'SOURCE_BASELINE_ONLY')
      : (allInvestmentSteps ? 'PROJECT_AND_FDI_FACTORY_COUNT_PROXY_ONLY_NO_MONETARY_CAPEX' : 'UNOBSERVED');
    const domesticInvestmentContributionPp = grossCapitalFormationPctGdp !== null && projectDelta > 0 && years > 0
      ? Math.min(maxGrowthPp, projectDelta * (finite(rules.investmentGrowthPpPerCompletedProject) ?? 0.04) / years)
      : null;
    const foreignInvestmentContributionPp = foreignFactoryDelta > 0 && years > 0
      ? Math.min(maxGrowthPp, foreignFactoryDelta * (finite(rules.foreignInvestmentGrowthPpPerCommissionedFactory) ?? 0.04) / years)
      : null;
    const investmentParts = [domesticInvestmentContributionPp, foreignInvestmentContributionPp].filter(value => value !== null);
    const investmentContributionPp = investmentParts.length
      ? Math.max(0, Math.min(maxGrowthPp, investmentParts.reduce((sum, value) => sum + value, 0))) : null;
    const tariffPct = finite(diplomacy?.importTariffPct);
    const tariffInflationPp = tariffPct === null ? null :
      Math.max(0, Math.min(finite(rules.maximumTariffInflationPp) ?? 2, tariffPct * (finite(rules.tariffInflationSensitivity) ?? 0.025)));
    const warExposure = diplomacy ? (finite(diplomacy.tradeDisruptionCountryCount) ??
      (diplomacy.warCountryCount + diplomacy.sanctionedCountryCount)) : null;
    const warInflationPp = warExposure === null ? null :
      Math.min(finite(rules.maximumWarInflationPp) ?? 1.5, warExposure * (finite(rules.warInflationPpPerCountry) ?? 0.08));
    const producerNow = currentMetric('producerCostIndex');
    const producerBefore = finite(priorLive?.producerCostIndex?.value);
    const producerCostGrowthPct = producerNow !== null && producerBefore !== null && producerBefore > 0 && years > 0
      ? (Math.log(producerNow / producerBefore) / years) * 100 : null;
    const producerCostInflationPp = producerCostGrowthPct === null ? null :
      Math.max(-1, Math.min(3, producerCostGrowthPct * (finite(rules.producerCostInflationSensitivity) ?? 0.25)));
    const baseGrowthParts = [industryContributionPp, tradeContributionPp, investmentContributionPp].filter(value => value !== null);
    const totalGrowthContributionPp = baseGrowthParts.length
      ? Math.max(-maxGrowthPp, Math.min(maxGrowthPp, baseGrowthParts.reduce((sum, value) => sum + value, 0))) : null;
    const projectedGrowth = baseGrowth === null ? null : Math.max(
      finite(rules.minimumProjectedGrowthPct) ?? -25,
      Math.min(finite(rules.maximumProjectedGrowthPct) ?? 25, baseGrowth + (totalGrowthContributionPp || 0))
    );
    const gdpProjectionUsd = baseGdp === null || baseGdp <= 0 || projectedGrowth === null
      ? null : baseGdp * Math.pow(Math.max(0.01, 1 + projectedGrowth / 100), years);
    const outputIndexPrior = finite(priorProgression?.industrialOutputIndex);
    const industrialOutputIndex = outputNow && Object.keys(outputNow).length
      ? (outputIndexPrior === null ? 100 : industrialOutputGrowthPct === null ? outputIndexPrior :
        outputIndexPrior * Math.pow(Math.max(0.01, 1 + industrialOutputGrowthPct / 100), years))
      : null;
    const inflParts = [tariffInflationPp, warInflationPp, producerCostInflationPp].filter(value => value !== null);
    const inflationContributionPp = inflParts.length
      ? Math.max(-3, Math.min(4, inflParts.reduce((sum, value) => sum + value, 0))) : null;
    const inflationProjectionPct = baseInflation === null ? null :
      Math.max(0, Math.min(finite(rules.maximumProjectedInflationPct) ?? 100,
        baseInflation + (inflationContributionPp || 0)));
    const unemploymentSensitivity = finite(rules.unemploymentGrowthSensitivity) ?? 0.12;
    const unemploymentChangePp = baseUnemployment === null || projectedGrowth === null || baseGrowth === null
      ? null : Math.max(-finite(rules.maximumAnnualUnemploymentChangePp) || -2,
        Math.min(finite(rules.maximumAnnualUnemploymentChangePp) || 2,
          -(projectedGrowth - baseGrowth) * unemploymentSensitivity * years));
    const unemploymentProjectionPct = baseUnemployment === null ? null :
      Math.max(0, Math.min(100, baseUnemployment + (unemploymentChangePp || 0)));
    const status = baseGdp !== null && baseGrowth !== null ? 'PROGRESSION_CALIBRATED' :
      (industrialOutputGrowthPct !== null || tradeContributionPp !== null || foreignInvestmentContributionPp !== null ? 'PARTIAL_EVIDENCE_MODEL' : 'BASELINE_ONLY_OR_UNOBSERVED');
    return {
      status, modelVersion: String(runtime.rules.modelVersion || VERSION),
      interval: { fromTurn: finite(previous?.lastProcessedTurn) ?? Math.max(0, turn - 1), toTurn: turn, elapsedTurns, elapsedYears: years },
      gdpBaselineUsd: baseGdp, gdpProjectionUsd, gdpGrowthBaselinePct: baseGrowth, gdpGrowthProjectionPct: projectedGrowth,
      industrialOutputGrowthPct, industrialOutputIndex,
      tradeBalanceToGdpAnnualizedPct: tradeBalanceToGdpPct, tradeGrowthContributionPp: tradeContributionPp,
      investmentBaselineGrossCapitalFormationPctGdp: grossCapitalFormationPctGdp,
      investmentActivityIndex, investmentProgressionStatus: investmentStatus,
      foreignInvestmentGrowthContributionPp: foreignInvestmentContributionPp,
      foreignInvestmentEvidence: foreignInvestment ? clone(foreignInvestment) : null,
      inflationBaselinePct: baseInflation, inflationProjectionPct, inflationContributionPp,
      unemploymentBaselinePct: baseUnemployment, unemploymentProjectionPct, unemploymentChangePp,
      observedPolicy: diplomacy ? clone(diplomacy) : null,
      policyEffects: {
        tradePolicyFactor, foreignPolicyFactor, playerRelationFactor, policyAccessMultiplier,
        authority: 'GLOBAL_RULESET_POLICY_MULTIPLIERS_APPLIED_TO_OBSERVED_COUNTRY_POLICY'
      },
      evidenceAvailability: {
        gdp: baseGdp === null ? 'UNOBSERVED' : 'AVAILABLE',
        gdpGrowth: baseGrowth === null ? 'UNOBSERVED' : 'AVAILABLE',
        industrialOutput: outputNow === null ? 'UNOBSERVED' : 'AVAILABLE',
        settledTrade: tradeEvidence ? 'AVAILABLE' : 'UNOBSERVED',
        grossCapitalFormation: grossCapitalFormationPctGdp === null ? 'UNOBSERVED' : 'AVAILABLE',
        foreignInvestment: foreignInvestment ? 'AVAILABLE' : 'UNOBSERVED',
        inflation: baseInflation === null ? 'UNOBSERVED' : 'AVAILABLE',
        unemployment: baseUnemployment === null ? 'UNOBSERVED' : 'AVAILABLE'
      },
      authority: 'EVIDENCE_BACKED_MODELLED_PROJECTION_NOT_OFFICIAL_NATIONAL_ACCOUNTS'
    };
  }

  function deriveAutonomousEconomicDecisions(root, profile, countryId, baseline, liveActivity, progression, turn) {
    const resource = countryRecord(root, 'resource', profile, countryId) || {};
    const finance = countryRecord(root, 'finance', profile, countryId) || {};
    const economy = countryRecord(root, 'economy', profile, countryId) || {};
    const diplomacy = liveActivity?.diplomaticPolicyContext?.availability === 'AVAILABLE' ? liveActivity.diplomaticPolicyContext.value : null;
    const outputRows = liveActivity?.industrialOutputByResourceUnit?.availability === 'AVAILABLE'
      ? (liveActivity.industrialOutputByResourceUnit.value?.rows || {}) : {};
    const infl = finite(progression?.inflationProjectionPct ?? progression?.inflationBaselinePct);
    const growth = finite(progression?.gdpGrowthProjectionPct ?? progression?.gdpGrowthBaselinePct);
    const unemp = finite(progression?.unemploymentProjectionPct ?? progression?.unemploymentBaselinePct);
    const netTrade = finite(liveActivity?.settledTradeActivity?.value?.netTradeValueUsd);
    const treasuryAvail = finite(finance?.available ?? finance?.omegaFinance?.treasuryBalanceUsd);

    let fiscalStance = 'UNOBSERVED';
    if (infl !== null || growth !== null || unemp !== null) {
      if (infl !== null && infl > 8) fiscalStance = 'INFLATION_CONTAINMENT_TIGHTENING';
      else if ((growth !== null && growth < 1.5) || (unemp !== null && unemp > 8)) fiscalStance = 'COUNTER_CYCLICAL_INVESTMENT_STIMULUS';
      else fiscalStance = 'BALANCED_EXPANSION';
    }

    const tariffCurrent = finite(diplomacy?.importTariffPct);
    let recommendedTariffPct = null;
    if (tariffCurrent !== null) {
      const delta = fiscalStance === 'INFLATION_CONTAINMENT_TIGHTENING' ? -2 :
        (netTrade !== null && netTrade < 0 ? 1.5 : 0);
      recommendedTariffPct = Number(Math.max(0, Math.min(35, tariffCurrent + delta)).toFixed(2));
    }

    const productionDirectives = [];
    const tradeDirectives = [];
    const demandApi = g.OmegaResourceNationalDemandRuntime || g.Omega?.ResourceNationalDemandRuntime;
    let demandEval = null;
    try {
      if (demandApi && typeof demandApi.evaluateDemand === 'function') {
        demandEval = demandApi.evaluateDemand(countryId);
      }
    } catch (_) {}

    const demandRows = Array.isArray(demandEval?.profiles) ? demandEval.profiles : [];
    for (const row of demandRows) {
      if (!row?.resourceId) continue;
      const deficit = finite(row.deficit ?? row.unmetDemand);
      const surplus = finite(row.surplus);
      if (deficit !== null && deficit > 1e-6 && tradeDirectives.length < 5) {
        tradeDirectives.push({
          action: 'IMPORT_DEFICIT_COVERAGE',
          resourceId: row.resourceId,
          targetQuantity: Number(deficit.toFixed(4)),
          reason: 'DOMESTIC_DEMAND_DEFICIT_OBSERVED'
        });
        if (productionDirectives.length < 5) {
          productionDirectives.push({
            action: 'EXPAND_DOMESTIC_CAPACITY',
            resourceId: row.resourceId,
            targetAnnualGap: Number(deficit.toFixed(4)),
            reason: 'REDUCE_STRUCTURAL_IMPORT_DEPENDENCY'
          });
        }
      } else if (surplus !== null && surplus > 1e-6 && tradeDirectives.length < 5) {
        tradeDirectives.push({
          action: 'EXPORT_VERIFIED_SURPLUS',
          resourceId: row.resourceId,
          targetQuantity: Number((surplus * 0.25).toFixed(4)),
          reason: 'VERIFIED_SURPLUS_WITH_FOREIGN_MARKET_ELIGIBILITY'
        });
      }
    }

    const activeOutputKeys = Object.keys(outputRows);
    if (!productionDirectives.length && activeOutputKeys.length && treasuryAvail !== null && treasuryAvail > 0) {
      const topOut = outputRows[activeOutputKeys[0]];
      productionDirectives.push({
        action: 'MAINTAIN_OR_SCALE_FACTORY_UTILIZATION',
        resourceId: topOut.resourceId,
        observedOutput: topOut.quantity,
        unit: topOut.unit,
        reason: 'ACTIVE_INDUSTRIAL_OUTPUT_OBSERVED'
      });
    }

    const cap = finite(economy?.productionCapacity);
    const completedProjects = finite(liveActivity?.autonomousProjectStatusCounts?.value?.completed) ?? 0;
    const investmentBudgetRatio = fiscalStance === 'COUNTER_CYCLICAL_INVESTMENT_STIMULUS' ? 0.14 :
      (fiscalStance === 'INFLATION_CONTAINMENT_TIGHTENING' ? 0.06 : 0.10);

    return {
      status: (fiscalStance !== 'UNOBSERVED' || productionDirectives.length || tradeDirectives.length) ? 'PLANNED' : 'UNOBSERVED',
      turn,
      countryId,
      fiscalStance,
      targetPublicInvestmentShare: treasuryAvail !== null ? investmentBudgetRatio : null,
      observedProductionCapacity: cap,
      completedProjectsCount: completedProjects,
      recommendedTariffPct,
      productionDirectives: productionDirectives.slice(0, 5),
      tradeDirectives: tradeDirectives.slice(0, 5),
      autonomousExecutionMode: 'NON_MUTATING_CHECKPOINT_RECOMMENDATION_UNLESS_EXPLICITLY_DISPATCHED',
      authority: 'EVIDENCE_BACKED_NPC_AUTONOMOUS_POLICY_PLAN'
    };
  }

  function evaluateAutonomousActions(countryValue, context = {}) {
    const countryId = canonicalIso3(countryValue);
    if (!countryId) return { status: 'SKIPPED', reason: 'COUNTRY_ID_INVALID' };
    const root = rootState(context);
    if (!isObject(root)) return { status: 'DEFERRED', reason: 'AUTHORITATIVE_WORLD_STATE_UNAVAILABLE', countryId };
    if (isPlayerCountry(countryId, root)) return { status: 'SKIPPED', reason: 'PLAYER_COUNTRY_REMAINS_PLAYER_CONTROLLED', countryId };
    const profile = findProfile(countryId);
    if (!profile) return { status: 'DEFERRED', reason: 'COUNTRY_FINANCE_PROFILE_UNAVAILABLE', countryId };
    if (!runtime.ready) return { status: 'DEFERRED', reason: 'NPC_MACRO_RUNTIME_NOT_READY', countryId };
    const turn = currentTurn(context);
    const previous = readPath(root, profile, countryId, runtime.rules.persistence.statePath);
    const baseline = buildBaseline(countryId, profile);
    const previousTurn = finite(previous?.lastProcessedTurn) ?? Math.max(0, turn - 1);
    const liveActivity = buildLiveActivity(root, profile, countryId, baseline, previousTurn, turn);
    const progression = deriveProgression(baseline, liveActivity, previous, turn, context.stepDurationMs);
    return deriveAutonomousEconomicDecisions(root, profile, countryId, baseline, liveActivity, progression, turn);
  }

  function applyAutonomousEconomicDecisions(countryValue, options = {}) {
    const plan = evaluateAutonomousActions(countryValue, options);
    if (!plan || plan.status !== 'PLANNED') return plan;
    if (options.execute !== true) return Object.assign({}, plan, { executed: false, dispatchedActions: [] });
    const tradeApi = g.OmegaGlobalTrade || g.Omega?.GlobalTrade;
    const dispatchedActions = [];
    if (tradeApi && typeof tradeApi.createRequest === 'function') {
      for (const dir of plan.tradeDirectives || []) {
        if (dir.action !== 'IMPORT_DEFICIT_COVERAGE' || !dir.targetQuantity || !dir.targetCountryId) continue;
        try {
          const res = tradeApi.createRequest(plan.countryId, {
            resourceId: dir.resourceId,
            quantity: dir.targetQuantity,
            targetCountryId: dir.targetCountryId,
            source: 'NPC_AUTONOMOUS_MACRO_DECISION'
          });
          dispatchedActions.push({ action: dir.action, resourceId: dir.resourceId, result: res });
        } catch (_) {}
      }
    }
    return Object.assign({}, plan, { executed: true, dispatchedActions });
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
    const previousTurn = finite(previous?.lastProcessedTurn) ?? Math.max(0, turn - 1);
    const liveActivity = buildLiveActivity(root, profile, countryId, baseline, previousTurn, turn);
    const progression = deriveProgression(baseline, liveActivity, previous, turn, context.stepDurationMs);
    const autonomousPolicyPlan = deriveAutonomousEconomicDecisions(root, profile, countryId, baseline, liveActivity, progression, turn);
    const baselineFingerprint = fingerprint(baseline);
    const sourceFingerprint = fingerprint({ baseline, liveActivity, progression, autonomousPolicyPlan, modelVersion: runtime.rules.modelVersion });
    const history = Array.isArray(previous?.snapshots) ? previous.snapshots.slice() : [];
    const previousSnapshot = history.length ? history[history.length - 1] : null;
    const snapshot = {
      turn,
      sourceFingerprint,
      liveActivity: clone(liveActivity),
      progression: clone(progression),
      autonomousPolicyPlan: clone(autonomousPolicyPlan),
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
      progression,
      autonomousPolicyPlan,
      snapshots: history.slice(-historyLimit),
      provenance: {
        rosterManifest: runtime.rules.roster.manifestPath,
        rosterScope: runtime.manifest.scope || null,
        baselineRegistry: runtime.rules.baseline?.source || null,
        baselineMetadata: clone(runtime.profileMetadata?.provenance || {}),
        lastCheckpointAuthority: 'OMEGA_NPC_NATIONAL_MACRO_ECONOMY_RUNTIME',
        progressionStatus: progression.status,
        progressionAuthority: progression.authority,
        progressionModelVersion: progression.modelVersion
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
    runtime.macroProgressedCountries += progression.status === 'PROGRESSION_CALIBRATED' || progression.status === 'PARTIAL_EVIDENCE_MODEL' ? 1 : 0;
    runtime.lastProcessedTurn = turn;
    runtime.lastProgressionTurn = turn;
    runtime.lastProgressionStatus = progression.status;
    return { status: 'CHECKPOINTED', countryId, turn, sourceFingerprint, baselineMetricCount: Object.keys(baseline.metrics).length, liveSignalCount: Object.keys(liveActivity).length, progressionStatus: progression.status, commandId };
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
      baselineInputCountryCount: runtime.baselineInputsByIso3.size,
      baselineInputMetricIds: clone(runtime.baselineInputMetadata?.metricIds || []),
      baselineInputSourceRegistry: runtime.baselineInputMetadata?.sourceRegistry || null,
      baselineInputSourceMode: runtime.baselineInputMetadata?.sourceMode || null,
      baselineInputGeneratedAt: runtime.baselineInputMetadata?.generatedAt || null,
      baselineInputCoverage: clone(runtime.baselineInputMetadata?.coverage || {}),
      commandHandlerRegistered: runtime.commandHandlerRegistered,
      schedulerHandlerRegistered: typeof runtime.unregisterCountryHandler === 'function',
      schedulerTiers: clone(runtime.rules?.scheduler?.tiers || []),
      processedCountries: runtime.processedCountries,
      skippedCountries: runtime.skippedCountries,
      deferredCountries: runtime.deferredCountries,
      failedCountries: runtime.failedCountries,
      lastProcessedTurn: runtime.lastProcessedTurn,
      macroProgressedCountries: runtime.macroProgressedCountries,
      lastProgressionTurn: runtime.lastProgressionTurn,
      lastProgressionStatus: runtime.lastProgressionStatus,
      progressionModelVersion: runtime.rules?.modelVersion || null,
      progressionMode: 'EVIDENCE_BACKED_BOUNDED_PER_COUNTRY'
    };
  }

  const API = Object.freeze({ VERSION, init, processCountry, getSnapshot,
    getProgression: countryValue => getSnapshot(countryValue)?.progression || null,
    evaluateAutonomousActions, applyAutonomousEconomicDecisions, diagnostics });
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
