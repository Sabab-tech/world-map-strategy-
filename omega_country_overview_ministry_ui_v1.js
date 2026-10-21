/* OMEGA Ministry Country Overview UI v1.0.0
 * Shared, read-only country briefing mounted inside the existing ministry dashboard.
 * All facts come from the shared country runtime and runtime behavior engine.
 */
(function (g) {
  'use strict';
  const VERSION = '1.1.0';
  if (g.OmegaCountryOverviewMinistryUI?.VERSION === VERSION) return;

  const s = v => String(v == null ? '' : v);
  const esc = v => s(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = v => {
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const clamp01 = v => {
    const n = num(v);
    return n === null ? null : Math.max(0, Math.min(1, n));
  };
  const arr = v => Array.isArray(v) ? v : [];
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  let initialized = false;
  let selectedCountry = null;
  let activeTab = 'ministry';
  let lastRenderedCountry = null;
  const sectorProfileState = {
    promise: null, ready: false, error: null, data: null, schema: null,
    byIso3: new Map(), byAlias: new Map(), registryPromise: null, registryError: null
  };

  const runtime = () => g.OmegaCountryRuntimeData || null;
  const behaviorEngine = () => g.OmegaCountryBehaviorEngine || g.Omega?.CountryBehaviorEngine || null;
  const adaptiveEngine = () => g.OmegaOpponentAdaptiveStrategy || g.Omega?.OpponentAdaptiveStrategy || null;
  const countryGeneralRuntime = () => g.OmegaCountryGeneralDataRuntime || g.Omega?.CountryGeneralData || null;

  function defaultCountry() {
    let simulatedPlayerCountry = null;
    try { simulatedPlayerCountry = g.Omega?.Simulation?.getPlayerCountryId?.() || null; } catch (_) {}
    const candidates = [
      g.OmegaMinistryViewCountry,
      g.CountryIOS?.activeCountry,
      g.OmegaCabinetUI?.activeCountry,
      g.Game?.currentActiveCountry,
      simulatedPlayerCountry,
      g.Game?.state?.playerCountryId,
      g.Game?.state?.playerCountryCode,
      g.Game?.playerCountryId,
      g.Game?.playerCountryCode,
      g.Game?.playerCountry,
      g.Game?.countryId,
      g.Game?.state?.simulation?.currentCountry,
      g.currentActiveCountry,
      g.playerCountry,
      'USA'
    ];
    const api = runtime();
    for (const candidate of candidates) {
      if (!candidate) continue;
      const identity = api?.resolveCountry?.(candidate);
      if (identity) return identity.iso3 || identity.countryCode || String(candidate);
      // Keep the requested country while the async identity registry is still loading.
      // The first Country Overview render after runtime.ready canonicalizes it.
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (isObj(candidate)) {
        const raw = candidate.countryId || candidate.countryCode || candidate.iso3 || candidate.iso2 || candidate.code || candidate.name;
        if (raw) return String(raw);
      }
    }
    return 'USA';
  }

  function identities() {
    const rows = runtime()?.listProfiles?.();
    if (Array.isArray(rows) && rows.length) return rows;
    return [];
  }

  function resolve(value) {
    const api = runtime();
    const identity = api?.resolveCountry?.(value) || null;
    const canonical = identity?.iso3 || identity?.countryCode || (typeof value === 'string' ? value : '');
    return { identity, canonical };
  }

  function baselineFor(value) {
    const api = runtime();
    if (!api) return null;
    try {
      return api.getProfile?.(value) || api.getProfile?.(resolve(value).canonical) || null;
    } catch (_) { return null; }
  }


  function normalizeProfileAlias(value) {
    return s(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' AND ').replace(/[_'-]+/g, ' ')
      .replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
  }

  function loadCountrySectorProfiles() {
    if (sectorProfileState.ready) return Promise.resolve(true);
    if (sectorProfileState.promise) return sectorProfileState.promise;
    sectorProfileState.error = null;
    sectorProfileState.promise = Promise.all([
      g.fetch('./country_sector_profiles_v1.json', { cache: 'default' }),
      g.fetch('./country_sector_profile_schema_v1.json', { cache: 'default' })
    ]).then(responses => {
      if (responses.some(response => !response || response.ok === false))
        throw new Error('COUNTRY_SECTOR_PROFILE_ASSET_FETCH_FAILED');
      return Promise.all(responses.map(response => response.json()));
    }).then(([data, schema]) => {
      if (!Array.isArray(data?.countries) || !Array.isArray(schema?.sectors) || !schema.sectors.length)
        throw new Error('COUNTRY_SECTOR_PROFILE_SCHEMA_INVALID');
      const expected = num(data.metadata?.countryAndTerritoryCount);
      if (expected === null || expected !== data.countries.length)
        throw new Error('COUNTRY_SECTOR_PROFILE_ROSTER_COUNT_MISMATCH');
      const byIso3 = new Map();
      const byAlias = new Map();
      for (const row of data.countries) {
        const identity = row?.identity || {};
        const iso3 = s(identity.iso3).trim().toUpperCase();
        if (!iso3 || byIso3.has(iso3)) throw new Error('COUNTRY_SECTOR_PROFILE_IDENTITY_INVALID:' + iso3);
        if (row?.sourceRegistryRef?.identityValue && s(row.sourceRegistryRef.identityValue).toUpperCase() !== iso3)
          throw new Error('COUNTRY_SECTOR_PROFILE_SOURCE_REFERENCE_MISMATCH:' + iso3);
        byIso3.set(iso3, row);
        for (const alias of [iso3, identity.iso2, identity.numericCode, identity.name, identity.officialName]) {
          const key = normalizeProfileAlias(alias);
          if (key && !byAlias.has(key)) byAlias.set(key, row);
        }
      }
      const schemaIds = schema.sectors.map(item => item.id);
      if (new Set(schemaIds).size !== schemaIds.length)
        throw new Error('COUNTRY_SECTOR_SCHEMA_HAS_DUPLICATE_SECTORS');
      for (const row of data.countries) {
        const keys = Object.keys(row.sectors || {}).sort();
        if (keys.length !== schemaIds.length || schemaIds.some(id => !Object.hasOwn(row.sectors || {}, id)))
          throw new Error('COUNTRY_SECTOR_PROFILE_SECTOR_COVERAGE_MISMATCH:' + row.identity.iso3);
      }
      sectorProfileState.data = data;
      sectorProfileState.schema = schema;
      sectorProfileState.byIso3 = byIso3;
      sectorProfileState.byAlias = byAlias;
      sectorProfileState.ready = true;
      sectorProfileState.error = null;
      return true;
    }).catch(error => {
      sectorProfileState.error = s(error?.message || error) || 'COUNTRY_SECTOR_PROFILE_LOAD_FAILED';
      sectorProfileState.ready = false;
      sectorProfileState.byIso3.clear();
      sectorProfileState.byAlias.clear();
      throw error;
    }).finally(() => { sectorProfileState.promise = null; });
    return sectorProfileState.promise;
  }

  function profileForCountry(value, identity) {
    const aliases = [identity?.iso3, identity?.iso2, identity?.numericCode,
      identity?.countryCode, identity?.name, identity?.officialName, value];
    for (const alias of aliases) {
      const key = normalizeProfileAlias(alias);
      const hit = sectorProfileState.byAlias.get(key);
      if (hit) return hit;
    }
    return null;
  }

  function profileLabel(key) {
    return s(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ').trim().replace(/\b\w/g, char => char.toUpperCase());
  }

  function profileValueText(value, unit) {
    if (value === null || value === undefined || value === '') return 'NOT RECORDED';
    if (typeof value === 'number' && Number.isFinite(value)) {
      const unitText = s(unit);
      const isMoney = /(^USD$|US dollars?|USD per person)/i.test(unitText);
      if (isMoney && Math.abs(value) >= 1e9) return compactNumber(value, 'USD');
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 }) + (unitText ? ' ' + unitText : '');
    }
    if (typeof value === 'boolean') return value ? 'YES' : 'NO';
    if (Array.isArray(value)) return value.length ? value.map(item => profileValueText(item, '')).join(', ') : 'NOT RECORDED';
    if (isObj(value)) return Object.keys(value).length ? 'REGISTERED OBJECT (' + Object.keys(value).length + ' fields)' : 'NOT RECORDED';
    return s(value);
  }

  function profileObservation(ref, generalRecord, profile, metricCatalog) {
    const key = s(ref?.key);
    if (!key) return { key: '', value: null, status: 'INVALID_REFERENCE' };
    if (ref.refType === 'METRIC') {
      const value = generalRecord?.metrics?.[key];
      const meta = generalRecord?.metricMetadata?.[key] || {};
      const definition = metricCatalog.get(key) || {};
      return {
        key, value: value === undefined ? null : value, unit: definition.unit || null,
        status: meta.status || (value == null ? 'NOT_RECORDED' : 'REGISTERED_SOURCE_VALUE'),
        sourceId: meta.sourceId || generalRecord?.datasetId || 'country_general_data_registry_v1.json',
        sourceName: meta.sourceName || meta.sourceId || 'Canonical country registry',
        year: meta.year ?? null, sourceUrl: meta.sourceUrl || null,
        confidence: meta.confidence ?? meta.sourceConfidence ?? null,
        note: meta.note || null
      };
    }
    if (ref.refType === 'DERIVED_METRIC') return profile?.derivedMetrics?.[key] || { key, value: null, status: 'DERIVED_METRIC_NOT_FOUND' };
    if (ref.refType === 'EXTERNAL_METRIC') return profile?.externalMetrics?.[key] || { key, value: null, status: 'EXTERNAL_METRIC_NOT_IMPORTED' };
    if (ref.refType === 'ANALYTICS') return profile?.analytics?.[key] || { key, value: null, status: 'ANALYTICS_NOT_AVAILABLE' };
    if (ref.refType === 'GENERAL_FACT') {
      const value = generalRecord?.generalFacts?.[key];
      const statuses = generalRecord?.generalFacts?.factsSourceStatus || {};
      return {
        key, value: value === undefined ? null : value,
        status: value === null || value === undefined || value === '' ? 'NOT_RECORDED' : 'COUNTRY_FACT_RECORDED',
        sourceId: generalRecord?.datasetId || 'country_general_data_registry_v1.json',
        sourceName: Object.keys(statuses).filter(id => statuses[id]).join(' / ') || 'Canonical country facts'
      };
    }
    if (ref.refType === 'SOURCE_GROUP') {
      const value = generalRecord?.[key];
      return {
        key, value: value === undefined ? null : value,
        status: value && isObj(value) ? 'CANONICAL_SOURCE_GROUP' : 'SOURCE_GROUP_NOT_AVAILABLE',
        sourceId: generalRecord?.datasetId || 'country_general_data_registry_v1.json',
        sourceName: 'Canonical ' + profileLabel(key)
      };
    }
    return { key, value: null, status: 'UNSUPPORTED_REFERENCE_TYPE:' + s(ref.refType) };
  }

  function profileObservationRow(label, observation, refType) {
    const value = observation?.value;
    const missing = value === null || value === undefined || value === '';
    const shown = (refType === 'SOURCE_GROUP' || refType === 'ANALYTICS' && isObj(value))
      ? profileValueText(value, observation?.unit)
      : profileValueText(value, observation?.unit);
    const source = observation?.sourceName || observation?.sourceId || 'Source not recorded';
    const year = observation?.year == null ? '' : ' · Year ' + observation.year;
    const confidence = num(observation?.confidence);
    const confidenceText = confidence === null ? '' : ' · Confidence ' + Math.round(Math.max(0, Math.min(1, confidence)) * 100) + '%';
    const sourceUrl = /^https?:\/\//i.test(s(observation?.sourceUrl)) ? observation.sourceUrl : '';
    return '<div class="ocov-pack-field" style="padding:8px 0;border-bottom:1px solid rgba(148,163,184,.14);display:grid;grid-template-columns:minmax(115px,.8fr) minmax(0,1.5fr);gap:8px">' +
      '<strong style="font-size:11px;overflow-wrap:anywhere">' + esc(label) + '</strong>' +
      '<div style="min-width:0"><div style="font-size:12px;overflow-wrap:anywhere;' + (missing ? 'color:#94a3b8' : 'color:#e2e8f0;font-weight:650') + '">' + esc(shown) + '</div>' +
      '<small style="display:block;color:#94a3b8;line-height:1.45;margin-top:3px;overflow-wrap:anywhere">' +
      esc(s(observation?.status || (missing ? 'NOT_RECORDED' : 'RECORDED')).replace(/_/g, ' ')) + ' · ' + esc(source) +
      esc(year + confidenceText) + '</small>' +
      (observation?.note ? '<small style="display:block;color:#94a3b8;margin-top:3px;overflow-wrap:anywhere">' + esc(observation.note) + '</small>' : '') +
      (sourceUrl ? '<a href="' + esc(sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:4px;color:#8dbdff;font-size:10px">Source record</a>' : '') +
      (isObj(value) || Array.isArray(value) ? '<details style="margin-top:5px"><summary style="cursor:pointer;color:#a6b9d5;font-size:10px">Inspect registered fields</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto;font-size:10px;color:#cbd5e1">' + esc(JSON.stringify(value, null, 2)) + '</pre></details>' : '') +
      '</div></div>';
  }

  function renderCountrySectorDataPack(value, identity) {
    if (!sectorProfileState.ready) {
      if (sectorProfileState.error) {
        return panel('Complete country data pack', 'The canonical pack was not loaded. Existing profile data remains available above.',
          '<p class="ocov-empty">' + esc(sectorProfileState.error) + '</p>' +
          '<button type="button" data-ocov-profile-retry style="padding:8px 12px;border:1px solid #64748b;border-radius:7px;background:#172033;color:#e2e8f0;cursor:pointer;font-weight:700">RETRY COUNTRY DATA LOAD</button>',
          'ocov-sector-data-pack');
      }
      if (!sectorProfileState.promise) {
        const requestedCountry = s(value);
        loadCountrySectorProfiles().then(() => {
          if (activeTab === 'country' && lastRenderedCountry === requestedCountry) renderCountryOverview();
        }).catch(() => {
          if (activeTab === 'country' && lastRenderedCountry === requestedCountry) renderCountryOverview();
        });
      }
      return panel('Complete country data pack', 'Loading the compact, source-linked profile for all world identities…',
        '<p class="ocov-empty">Loading the country-sector registry. Source data is not replaced with estimated values.</p>',
        'ocov-sector-data-pack');
    }

    const profile = profileForCountry(value, identity);
    if (!profile) return panel('Complete country data pack', 'No matching sector record was found for this canonical identity.',
      '<p class="ocov-empty">Country identity: ' + esc(value) + ' · Status: PROFILE_NOT_FOUND</p>',
      'ocov-sector-data-pack');

    const generalApi = countryGeneralRuntime();
    let generalRecord = null;
    try { generalRecord = generalApi?.getCountryRecord?.(profile.identity.iso3) || null; } catch (_) {}
    if (!generalRecord && typeof generalApi?.init === 'function' && !generalApi?.diagnostics?.().ready) {
      if (!sectorProfileState.registryPromise) {
        sectorProfileState.registryPromise = Promise.resolve(generalApi.init()).then(() => {
          const diagnostics = generalApi.diagnostics?.() || {};
          sectorProfileState.registryError = diagnostics.ready ? null : (diagnostics.error || 'CANONICAL_REGISTRY_NOT_READY');
          if (activeTab === 'country' && lastRenderedCountry === s(value)) renderCountryOverview();
        }).catch(error => {
          sectorProfileState.registryError = s(error?.message || error);
          if (activeTab === 'country' && lastRenderedCountry === s(value)) renderCountryOverview();
        });
      }
      return panel('Complete country data pack', 'Connecting profile references to canonical country facts and indicator observations.',
        '<p class="ocov-empty">' + esc(sectorProfileState.registryError || 'Connecting to the shared country registry. This does not create another country database.') + '</p>',
        'ocov-sector-data-pack');
    }

    const metricCatalogue = runtime()?.getSourceDataset?.('country_general_data_registry_v1.json')?.fieldCatalogue || [];
    const metricCatalog = new Map(metricCatalogue.filter(item => item?.key).map(item => [item.key, item]));
    const definitions = sectorProfileState.schema.sectors;
    const sectorRows = definitions.map(definition => {
      const section = profile.sectors?.[definition.id] || {};
      const fieldRows = [];
      for (const [key, ref] of Object.entries(section.indicators || {})) {
        const observation = profileObservation(ref, generalRecord, profile, metricCatalog);
        const catalog = metricCatalog.get(key);
        const label = catalog?.name || definition.metricLabels?.[key] || profileLabel(key);
        fieldRows.push(profileObservationRow(label, observation, ref.refType));
      }
      for (const [key, ref] of Object.entries(section.facts || {})) {
        const observation = profileObservation(ref, generalRecord, profile, metricCatalog);
        fieldRows.push(profileObservationRow(profileLabel(key), observation, ref.refType));
      }
      if (section.sourceGroup) {
        const observation = profileObservation(section.sourceGroup, generalRecord, profile, metricCatalog);
        fieldRows.push(profileObservationRow(profileLabel(section.sourceGroup.key || definition.sourceGroup || 'Source group'),
          observation, section.sourceGroup.refType));
      }
      for (const [key, ref] of Object.entries(section.analytics || {})) {
        const observation = profileObservation(ref, generalRecord, profile, metricCatalog);
        fieldRows.push(profileObservationRow(profileLabel(key), observation, ref.refType));
      }
      const extensionSlots = arr(definition.extensionSlots);
      const extensionHtml = extensionSlots.length
        ? '<div style="margin-top:10px"><strong style="font-size:11px">Additional data fields / known gaps</strong><ul class="ocov-list">' +
          extensionSlots.map(slot => '<li><strong>' + esc(profileLabel(slot.key)) + '</strong><span>' +
            esc(slot.description || 'Additional field defined in the profile schema.') + '</span><small>' +
            esc(s(slot.emptyStatus || 'NOT_SOURCED').replace(/_/g, ' ')) +
            ' · ' + esc('Field is defined; an observation is not included in this profile row yet.') + '</small></li>').join('') +
          '</ul></div>' : '';
      const unavailable = arr(sectorProfileState.schema.unavailableModelSlots).filter(slot => slot.sectorId === definition.id);
      const modelHtml = unavailable.length
        ? '<div style="margin-top:10px"><strong style="font-size:11px">Scores not generated without required inputs</strong><ul class="ocov-list">' +
          unavailable.map(slot => '<li><strong>' + esc(slot.title || profileLabel(slot.id)) + '</strong><span>' +
            esc(slot.note || 'Required source data has not been imported.') + '</span><small>' +
            esc(s(slot.status || 'NOT_SCORED_REQUIRED_DATA_MISSING').replace(/_/g, ' ')) +
            ' · Required: ' + esc(arr(slot.missingInputs).join(', ')) + '</small></li>').join('') +
          '</ul></div>' : '';
      const body = (fieldRows.length ? fieldRows.join('') :
        '<p class="ocov-empty">No indicators are currently registered for this sector.</p>') +
        extensionHtml + modelHtml;
      const countAvailable = fieldRows.filter((html, index) => {
        const refs = [...Object.values(section.indicators || {}), ...Object.values(section.facts || {}), ...Object.values(section.analytics || {})];
        const ref = refs[index];
        if (!ref) return false;
        const resolved = profileObservation(ref, generalRecord, profile, metricCatalog);
        return resolved.value !== null && resolved.value !== undefined && resolved.value !== '';
      }).length;
      const status = s(section.status || 'NO_DATA').replace(/_/g, ' ');
      return '<details class="ocov-pack-sector" style="border:1px solid rgba(148,163,184,.2);border-radius:10px;background:rgba(15,23,42,.55);padding:10px;min-width:0">' +
        '<summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;list-style-position:inside">' +
        '<strong style="font-size:12px">' + esc(definition.title || profileLabel(definition.id)) + '</strong>' +
        '<span style="font-size:10px;color:#a7c4e8;white-space:nowrap">' + esc(status) + ' · ' + countAvailable + ' shown values</span></summary>' +
        (definition.description ? '<p style="font-size:11px;color:#94a3b8;margin:8px 0">' + esc(definition.description) + '</p>' : '') +
        '<div style="margin-top:8px">' + body + '</div></details>';
    }).join('');

    const rawRecord = {
      identity: generalRecord?.identity || profile.identity,
      generalFacts: generalRecord?.generalFacts || null,
      metrics: generalRecord?.metrics || null,
      metricMetadata: generalRecord?.metricMetadata || null,
      naturalResources: generalRecord?.naturalResources || null,
      publicSafety: generalRecord?.publicSafety || null,
      localGeography: generalRecord?.localGeography || null,
      dataStatus: generalRecord?.dataStatus || null,
      sectorProfile: profile
    };
    const dataNote = 'Generated ' + s(sectorProfileState.data.metadata?.generatedAt || 'date not recorded') +
      ' · Canonical roster ' + s(sectorProfileState.data.metadata?.countryAndTerritoryCount || sectorProfileState.data.countries.length) +
      ' · ' + definitions.length + ' sectors · ' + s(generalRecord?.datasetId || 'canonical source reference unresolved');
    const coverage = sectorProfileState.data.metadata?.sectorCoverage || {};
    const coverageHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:9px 0 12px">' +
      definitions.map(definition => {
        const item = coverage[definition.id] || {};
        return '<span style="padding:5px 7px;border:1px solid rgba(148,163,184,.2);border-radius:7px;font-size:10px;color:#cbd5e1">' +
          esc(definition.title || definition.id) + ': ' + esc(item.available || 0) + ' full / ' +
          esc(item.partial || 0) + ' partial / ' + esc(item.noData || 0) + ' gaps</span>';
      }).join('') + '</div>';
    const relative = profile.relativeSignals || {};
    const signalLine = items => arr(items).map(item =>
      profileLabel(item.title || item.metricKey || 'Relative signal') +
      ': ' + profileValueText(item.value, item.unit) +
      (item.year == null ? '' : ' · Year ' + item.year) +
      (item.peerPercentile == null ? '' : ' · Peer percentile ' + item.peerPercentile) +
      (item.sourceName || item.sourceId ? ' · ' + (item.sourceName || item.sourceId) : '')
    );
    const signalHtml = '<details style="margin-top:10px"><summary style="cursor:pointer">Country-relative evidence signals (' +
      (arr(relative.strengths).length + arr(relative.vulnerabilities).length) + ')</summary><div class="ocov-domain-grid" style="margin-top:8px">' +
      panel('Relative strengths', 'Peer-relative signals, not official rankings or causal proof.',
        bulletList(signalLine(relative.strengths), 'No eligible, sourced relative-strength signal was calculated.')) +
      panel('Relative vulnerabilities', 'Peer-relative signals, not an overall national rating.',
        bulletList(signalLine(relative.vulnerabilities), 'No eligible, sourced relative-vulnerability signal was calculated.')) +
      '</div><p class="ocov-note">' + esc(relative.policy || 'Peer-relative signals retain their source and observation year.') + '</p></details>';
    const rawHtml = '<details style="margin-top:10px"><summary style="cursor:pointer">Inspect complete resolved country record</summary>' +
      '<p class="ocov-note">Read-only projection assembled from canonical registry values and references. This is not a second stored dataset.</p>' +
      '<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;padding:10px;border-radius:8px;background:rgba(2,6,23,.55);font:10px/1.45 monospace;color:#cbd5e1">' +
      esc(JSON.stringify(rawRecord, null, 2)) + '</pre></details>';
    const counts = {
      metricCount: Object.keys(generalRecord?.metrics || {}).length,
      observedMetrics: Object.values(generalRecord?.metrics || {}).filter(item => item !== null && item !== undefined).length
    };
    const body = '<p class="ocov-note">' + esc(dataNote) + ' · ' +
      counts.observedMetrics + '/' + counts.metricCount + ' canonical metrics have recorded values for this country. Missing values remain unknown, never zero.</p>' +
      coverageHtml +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:9px">' + sectorRows + '</div>' +
      signalHtml + rawHtml;
    return panel('Complete country data pack', 'All profile sectors resolve references back to one canonical registry. Values carry status/source/year where available; gaps and unscored models are exposed explicitly.',
      body, 'ocov-sector-data-pack');
  }

  function sourceNumber(profile, keys) {
    const roots = [
      profile?.indicators,
      profile?.metrics,
      profile?.sourceValues,
      profile?.populationValues,
      profile?.rawValues,
      profile
    ];
    for (const root of roots) {
      if (!isObj(root)) continue;
      for (const key of keys) {
        const value = num(root[key]);
        if (value !== null) return { value, source: key };
      }
    }
    return { value: null, source: null };
  }

  function preferBehaviorMetric(behavior, key, fallback) {
    const value = num(behavior?.metrics?.[key]);
    if (value === null) return fallback;
    const record = behavior?.metricSources?.[key] || {};
    return { value, source: record.source || record.status || 'OMEGA_COUNTRY_BEHAVIOR_ENGINE_V1' };
  }

  function strategicNumber(profile, path) {
    let value = profile;
    for (const part of path.split('.')) value = value == null ? null : value[part];
    return num(value);
  }

  function compactNumber(value, unit) {
    const n = num(value);
    if (n === null) return 'NOT OBSERVED';
    if (unit === 'USD') {
      const abs = Math.abs(n);
      const sign = n < 0 ? '−' : '';
      if (abs >= 1e12) return sign + (abs / 1e12).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'T USD';
      if (abs >= 1e9) return sign + (abs / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'B USD';
      if (abs >= 1e6) return sign + (abs / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M USD';
      return sign + abs.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' USD';
    }
    if (unit === 'people') return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (unit ? ' ' + unit : '');
  }

  function metricCard(title, value, unit, detail) {
    const shown = compactNumber(value, unit);
    const missing = num(value) === null;
    return '<article class="ocov-kpi' + (missing ? ' is-missing' : '') + '">' +
      '<div class="ocov-kpi-label">' + esc(title) + '</div>' +
      '<div class="ocov-kpi-value">' + esc(shown) + '</div>' +
      (detail ? '<div class="ocov-kpi-detail">' + esc(detail) + '</div>' : '') +
      '</article>';
  }

  function bulletList(items, emptyLabel) {
    const rows = arr(items).filter(x => x !== null && x !== undefined && s(x).trim() !== '');
    if (!rows.length) return '<p class="ocov-empty">' + esc(emptyLabel || 'No registered evidence for this section.') + '</p>';
    return '<ul class="ocov-list">' + rows.slice(0, 10).map(item => {
      if (typeof item === 'string' || typeof item === 'number') return '<li>' + esc(item) + '</li>';
      if (isObj(item)) {
        const label = item.title || item.signal || item.key || item.name || item.metric || item.domain || 'Signal';
        const detail = item.detail || item.meaning || item.interpretation || item.basis || item.reason || '';
        const source = item.source ? ' · Source: ' + item.source : '';
        const value = item.value !== null && item.value !== undefined ? ' · Value: ' + item.value : '';
        return '<li><strong>' + esc(label) + '</strong>' + (detail ? '<span>' + esc(detail) + '</span>' : '') +
          (value || source ? '<small>' + esc(value + source) + '</small>' : '') + '</li>';
      }
      return '';
    }).join('') + '</ul>';
  }

  function evidenceItems(value, prefix) {
    const lead = prefix ? String(prefix) + ' / ' : '';
    if (Array.isArray(value)) return value.flatMap(item => isObj(item)
      ? [Object.fromEntries(Object.entries(item).map(([key, val]) => [key, val]))]
      : [item]);
    if (isObj(value)) return Object.entries(value).map(([key, val]) => ({
      title: lead + key,
      detail: isObj(val) || Array.isArray(val) ? JSON.stringify(val) : s(val)
    }));
    return value === null || value === undefined || value === '' ? [] : [String(value)];
  }

  function panel(title, subtitle, body, extraClass) {
    return '<section class="ocov-panel ' + esc(extraClass || '') + '">' +
      '<header class="ocov-panel-header"><h3>' + esc(title) + '</h3>' +
      (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</header>' +
      '<div class="ocov-panel-body">' + body + '</div></section>';
  }

  function dimensionLabel(key) {
    const labels = {
      riskAppetite: 'Risk appetite',
      diplomaticPreference: 'Diplomatic cooperation incentive',
      fiscalDiscipline: 'Fiscal restraint priority',
      mobilizationTolerance: 'Defence-budget effort proxy',
      strategicTimeHorizon: 'Long-term investment capacity',
      tradeDependence: 'Trade exposure',
      selfSufficiencyPriority: 'Domestic supply / self-sufficiency',
      innovationPreference: 'Technology investment readiness',
      domesticStabilityPriority: 'Domestic stability pressure',
      escalationTolerance: 'Escalation tolerance',
      economicCapacity: 'Economic capacity / investment headroom'
    };
    return labels[key] || key;
  }

  function dimensionCards(profile) {
    const dims = profile?.dimensions || {};
    const keys = Object.keys(dims);
    if (!keys.length) return '<p class="ocov-empty">Behaviour profile is not ready. No default national scores have been substituted.</p>';
    return '<div class="ocov-dimension-grid">' + keys.map(key => {
      const row = dims[key] || {};
      const value = clamp01(row.value);
      const percent = value === null ? null : Math.round(value * 100);
      const confidence = clamp01(row.confidence);
      const status = row.availability || (value === null ? 'UNOBSERVED' : 'DERIVED_SIMULATION_POLICY');
      return '<article class="ocov-dimension' + (value === null ? ' is-missing' : '') + '">' +
        '<div class="ocov-dimension-top"><strong>' + esc(dimensionLabel(key)) + '</strong>' +
        '<span>' + (percent === null ? 'NOT OBSERVED' : percent + '/100') + '</span></div>' +
        '<div class="ocov-meter"><span style="width:' + (percent === null ? 0 : percent) + '%"></span></div>' +
        '<small>' + esc(status.replace(/_/g, ' ')) +
        (confidence === null ? '' : ' · Confidence ' + Math.round(confidence * 100) + '%') + '</small>' +
        (row.interpretation ? '<p>' + esc(row.interpretation) + '</p>' : '') +
        (arr(row.evidence).length ? '<details><summary>Evidence inputs (' + row.evidence.length + ')</summary>' +
          bulletList(row.evidence.map(e => (e.metric || e.key || 'input') + ': ' + e.value + (e.source ? ' · ' + e.source : '')), 'No listed input rows.') +
          '</details>' : '') +
        '</article>';
    }).join('') + '</div>';
  }

  function countryOptions(selected) {
    const rows = identities();
    if (!rows.length) return '<option value="' + esc(selected) + '">' + esc(selected) + '</option>';
    const resolved = resolve(selected);
    const selectKey = resolved.identity?.iso3 || resolved.identity?.countryCode || String(selected);
    return rows.map(row => {
      const value = row.iso3 || row.countryCode;
      if (!value) return '';
      const label = row.name || row.officialName || value;
      return '<option value="' + esc(value) + '"' + (String(value).toUpperCase() === String(selectKey).toUpperCase() ? ' selected' : '') +
        '>' + esc(label) + ' · ' + esc(row.iso3 || row.countryCode) + '</option>';
    }).join('');
  }

  function renderCountryOverview() {
    const doc = g.document;
    const panelEl = doc?.getElementById?.('omega-country-overview-panel');
    if (!panelEl) return false;
    const requested = selectedCountry || defaultCountry();
    const resolved = resolve(requested);
    const identity = resolved.identity || {};
    const value = resolved.canonical || requested;
    selectedCountry = value;
    lastRenderedCountry = value;

    const base = baselineFor(value);
    const gateway = g.OmegaCountryDataGateway || g.Omega?.CountryDataGateway || null;
    const sharedSnapshot = gateway?.getSnapshot?.(value) || null;
    const sharedHasCountry = !!(sharedSnapshot && sharedSnapshot.countryCode);
    const sharedMetric = (key, fallback) => {
      if (!sharedHasCountry) return fallback;
      const row = sharedSnapshot.fields?.[key];
      if (!row || row.status !== 'AVAILABLE' || num(row.value) === null)
        return { value: null, source: 'NOT RECORDED IN SHARED COUNTRY SOURCES' };
      return { value: num(row.value), source: [row.sourceName || row.sourceId || row.authority || 'REGISTERED SOURCE', row.year ? 'Year ' + row.year : null].filter(Boolean).join(' · ') };
    };
    const strategic = runtime()?.getStrategicProfile?.(value) || null;
    let behavior = null;
    try { behavior = behaviorEngine()?.getBehaviorProfile?.(value) || null; } catch (_) {}
    let adaptive = null;
    try { adaptive = adaptiveEngine()?.profile?.(value) || null; } catch (_) {}

    if (!base && runtime()?.ready && typeof runtime().isSettled === 'function' && !runtime().isSettled()) {
      panelEl.innerHTML = '<div class="ocov-loading"><div class="ocov-eyebrow">OMEGA / COUNTRY OVERVIEW</div><h2>Loading country records…</h2><p>Waiting for the canonical country registry. No substitute data is being displayed.</p></div>';
      Promise.resolve(runtime().ready).then(() => { if (activeTab === 'country') renderCountryOverview(); }).catch(() => {});
      return true;
    }

    const name = identity.name || base?.name || base?.officialName || value;
    const flag = runtime()?.flagFor?.(value) || '';
    const countryCode = identity.iso3 || identity.countryCode || value;
    const profileStatus = behavior?.status || (strategic ? 'STRATEGIC PROFILE AVAILABLE' : (base?.profileStatus || 'BASELINE LIMITED'));
    const archetype = behavior?.archetype || strategic?.archetype || 'NOT CLASSIFIED';
    const sourceStatus = sharedHasCountry
      ? (sharedSnapshot.diagnostics?.errors?.length ? 'DATA INTEGRITY ERRORS' : sharedSnapshot.diagnostics?.warnings?.length ? 'SOURCE DIFFERENCES NEED REVIEW' : 'SHARED COUNTRY GATEWAY')
      : (behavior?.evidence?.baselineStatus || base?.provenance?.status || 'SOURCE STATUS NOT RECORDED');

    const gdp = sharedMetric('gdp', preferBehaviorMetric(behavior, 'gdpUsd', sourceNumber(base, ['gdpCurrentUsd', 'gdp', 'grossDomesticProductUsd'])));
    const pop = sharedMetric('population', preferBehaviorMetric(behavior, 'population', sourceNumber(base, ['populationTotal', 'population2015', 'population_2015', 'population'])));
    const growth = sharedMetric('gdpGrowthPct', preferBehaviorMetric(behavior, 'gdpGrowthPct', sourceNumber(base, ['gdpGrowthPct', 'gdp_growth', 'growthRatePct'])));
    const inflation = sharedMetric('inflationPct', preferBehaviorMetric(behavior, 'inflationPct', sourceNumber(base, ['inflationRatePct', 'inflationPct', 'inflation'])));
    const unemployment = sharedMetric('unemploymentRatePct', preferBehaviorMetric(behavior, 'unemploymentPct', sourceNumber(base, ['unemploymentRatePct', 'unemployment_rate', 'unemploymentPct'])));
    const debtRatio = sharedMetric('debtToGdpPct', preferBehaviorMetric(behavior, 'debtToGdpPct', sourceNumber(base, ['publicDebtToGdpPct', 'debtToGdpPct'])));
    const budget = sharedMetric('budgetBalanceToGdpPct', sharedHasCountry ? {value:null,source:'NOT RECORDED IN SHARED COUNTRY SOURCES'} : preferBehaviorMetric(behavior, 'budgetBalanceToGdpPct', sourceNumber(base, ['budgetBalanceToGdpPct'])));
    const tradeRatio = sharedMetric('tradeBalanceToGdpPct', preferBehaviorMetric(behavior, 'tradeBalanceToGdpPct', sourceNumber(base, ['tradeBalanceToGdpPct', 'tradeBalancePctGdp'])));
    const tradeBalance = sharedMetric('tradeBalance', preferBehaviorMetric(behavior, 'tradeBalanceUsd', sourceNumber(base, ['tradeBalanceUsd', 'trade_balance', 'tradeBalance'])));
    const reserves = sharedMetric('fxReservesUsd', preferBehaviorMetric(behavior, 'fxReservesUsd', sourceNumber(base, ['foreignExchangeReservesUsd', 'fxReservesUsd', 'reserves'])));
    const fx = num(sharedHasCountry ? sharedSnapshot.fields?.fxReservesUsd?.value : null) ?? (sharedHasCountry ? null : (num(behavior?.metrics?.fxReservesUsd) ?? num(base?.indicators?.foreignExchangeReservesUsd ?? base?.indicators?.fxReservesUsd ?? base?.sourceValues?.reserves)));
    const militaryValue = sharedMetric('militaryExpenditurePctGdp', { value: num(behavior?.metrics?.militaryExpenditurePctGdp) ?? strategicNumber(strategic, 'military.militaryExpenditurePctGdp') ?? num(base?.indicators?.militaryExpenditurePctGdp), source: 'Country strategic profile / behaviour engine' });
    const militaryPct = militaryValue.value;
    const governance = strategic?.politics || behavior?.domainSignals?.politics || {};
    const governmentEffectiveness = sharedMetric('governmentEffectivenessWgiEstimate', {value:num(behavior?.metrics?.governmentEffectivenessWgiEstimate) ?? num(governance.governmentEffectivenessWgiEstimate),source:'Country governance profile'}).value;
    const politicalStability = sharedMetric('politicalStabilityWgiEstimate', {value:num(behavior?.metrics?.politicalStabilityWgiEstimate) ?? num(governance.politicalStabilityWgiEstimate),source:'Country governance profile'}).value;
    const resources = behavior?.domainSignals?.resources || {};
    const resourceRuntime = resources.runtimeState || {};
    const diplomacy = strategic?.diplomacy || behavior?.domainSignals?.diplomacy || {};
    const dependencies = strategic?.dependencies || behavior?.domainSignals?.dependencies || {};
    const narrative = behavior?.profileNarrative || {};
    const strengths = Array.from(new Set([
      ...arr(strategic?.overallStrengths),
      ...arr(strategic?.economy?.strengths),
      ...arr(behavior?.domainSignals?.economy?.registeredStrengths),
      ...arr(narrative.overallStrengths)
    ].map(x => typeof x === 'string' ? x : (isObj(x) ? x.title || x.detail || x.signal || '' : s(x))).filter(Boolean)));
    const weaknesses = Array.from(new Set([
      ...arr(strategic?.overallWeaknesses),
      ...arr(strategic?.economy?.vulnerabilities),
      ...arr(behavior?.domainSignals?.economy?.registeredVulnerabilities),
      ...arr(narrative.overallWeaknesses),
      ...arr(strategic?.economy?.pressurePoints).map(x => isObj(x) ? x.title || x.detail : x),
      ...arr(behavior?.domainSignals?.economy?.registeredPressurePoints).map(x => isObj(x) ? x.title || x.detail : x)
    ].map(x => typeof x === 'string' ? x : (isObj(x) ? x.title || x.detail || x.signal || '' : s(x))).filter(Boolean)));
    const playerAdvantages = arr(strategic?.playerAdvantages).length ? arr(strategic.playerAdvantages) : arr(narrative.playerAdvantages);
    const playerChallenges = arr(strategic?.playerChallenges).length ? arr(strategic.playerChallenges) : arr(narrative.playerChallenges);
    const recommendedStrategyItems = evidenceItems(strategic?.recommendedStrategy || narrative.recommendedStrategy, 'Recommended strategy');
    const registeredOptions = arr(adaptive?.registeredStrategyOptions).length
      ? arr(adaptive.registeredStrategyOptions) : arr(strategic?.strategyOptions);
    const actionPreferences = isObj(adaptive?.actionPreferences) ? adaptive.actionPreferences :
      (isObj(behavior?.actionPreferences) ? behavior.actionPreferences : {});
    const actionPreferenceRows = Object.entries(actionPreferences)
      .filter(([, row]) => isObj(row) && num(row.value) !== null)
      .sort((a, b) => (num(b[1].value) || 0) - (num(a[1].value) || 0));
    const priorities = arr(behavior?.priorityStack).length ? arr(behavior.priorityStack) : arr(strategic?.strategyOptions);
    const priorityBody = priorities.length ? '<ol class="ocov-priority-list">' + priorities.slice(0, 6).map((row, i) =>
      '<li><span class="ocov-priority-number">' + (i + 1) + '</span><div><strong>' + esc(row.title || row.action || row.domain || 'Strategic priority') +
      '</strong><p>' + esc(row.detail || row.basis || row.reason || row.description || 'Based on currently registered evidence.') + '</p>' +
      (row.basis ? '<small>Basis: ' + esc(row.basis) + '</small>' : '') + '</div></li>').join('') +
      '</ol><p class="ocov-note">These are candidate priorities, not executed orders. Live decisions still pass through the simulation\'s action, finance, materials and authority checks.</p>'
      : '<p class="ocov-empty">No evidence-backed priority is available yet.</p>';

    const overviewHtml =
      '<div class="ocov-shell">' +
      '<div class="ocov-toolbar"><label for="ocov-country-select">Viewed country</label>' +
      '<select id="ocov-country-select" aria-label="Choose country">' + countryOptions(value) + '</select>' +
      '<span class="ocov-baseline-label">Read-only briefing · Simulation state remains unchanged</span></div>' +
      '<section class="ocov-hero"><div class="ocov-hero-id"><span class="ocov-flag">' + esc(flag) + '</span><div>' +
      '<div class="ocov-eyebrow">OMEGA / NATIONAL PROFILE & BEHAVIOUR</div><h2>' + esc(name) + '</h2>' +
      '<p>' + esc(countryCode) + ' · ' + esc(archetype) + '</p></div></div>' +
      '<div class="ocov-status"><span>' + esc(profileStatus.replace(/_/g, ' ')) + '</span><small>' + esc(sourceStatus.replace(/_/g, ' ')) + '</small></div>' +
      (strategic?.executiveSummary ? '<p class="ocov-summary">' + esc(strategic.executiveSummary) + '</p>' :
        '<p class="ocov-summary">The behaviour profile is derived from registered country indicators and gameplay systems. Missing evidence remains unobserved.</p>') +
      '</section>' +
      '<div class="ocov-section-heading"><span>00</span><div><h3>Complete world country data pack</h3><p>Canonical source values, profile analytics, and visible data gaps.</p></div></div>' +
      renderCountrySectorDataPack(value, identity) +
      '<div class="ocov-section-heading"><span>01</span><div><h3>Economic baseline</h3><p>Recorded inputs, not invented national statistics.</p></div></div>' +
      '<div class="ocov-kpi-grid">' +
      metricCard('GDP', gdp.value, 'USD', gdp.source || 'economy baseline') +
      metricCard('Population', pop.value, 'people', pop.source || 'population baseline') +
      metricCard('GDP growth', growth.value, '%', growth.source || 'not recorded') +
      metricCard('Inflation', inflation.value, '%', inflation.source || 'not recorded') +
      metricCard('Unemployment', unemployment.value, '%', unemployment.source || 'not recorded') +
      metricCard('Public debt / GDP', debtRatio.value, '%', debtRatio.source || 'not recorded') +
      metricCard('Budget balance / GDP', budget.value, '%', budget.source || 'not recorded') +
      metricCard('Trade balance', tradeBalance.value, 'USD', tradeBalance.source || 'not recorded') +
      metricCard('Trade balance / GDP', tradeRatio.value, '%', tradeRatio.source || 'not recorded') +
      metricCard('Foreign-exchange reserves', fx ?? reserves.value, 'USD', reserves.source || 'not recorded') +
      '</div>' +
      '<div class="ocov-domain-grid">' +
      panel('Resources & industrial options', 'Gameplay assets are separated from live stock, consumption and production measurements.',
        '<div class="ocov-resource-stat"><strong>' + (num(resources.siteCount) === null ? 'NOT LOADED' : esc(resources.siteCount)) +
        '</strong><span>registered gameplay sites</span><strong>' +
        (num(resources.resourceDiversity) === null ? 'NOT LOADED' : esc(resources.resourceDiversity)) +
        '</strong><span>distinct resource identifiers</span></div>' +
        '<p class="ocov-source-line">Site catalog: ' + esc(resources.availability || 'UNKNOWN') + ' · Live resource state: ' +
          esc(resourceRuntime.availability || 'UNAVAILABLE') + '</p>' +
        '<div class="ocov-resource-runtime-metrics">' +
          '<div><strong>' + (num(resourceRuntime.inventoryObservedCount) === null ? 'NOT OBSERVED' : esc(resourceRuntime.inventoryObservedCount)) + '</strong><span>observed inventories</span></div>' +
          '<div><strong>' + (num(resourceRuntime.productionObservedCount) === null ? 'NOT OBSERVED' : esc(resourceRuntime.productionObservedCount)) + '</strong><span>observed production rates</span></div>' +
          '<div><strong>' + (num(resourceRuntime.consumptionObservedCount) === null ? 'NOT OBSERVED' : esc(resourceRuntime.consumptionObservedCount)) + '</strong><span>observed consumption rates</span></div>' +
          '<div><strong>' + (num(resourceRuntime.productionDeficitCount) === null ? 'NOT OBSERVED' : esc(resourceRuntime.productionDeficitCount)) + '</strong><span>resources with observed production gaps</span></div>' +
        '</div>' +
        (resourceRuntime.averageSelfSufficiencyPct === null || resourceRuntime.averageSelfSufficiencyPct === undefined
          ? '<p class="ocov-empty">National resource-runtime supply metrics are not yet observed; the game does not substitute invented stock or production.</p>'
          : '<p class="ocov-source-line">Average observed production / consumption ratio: ' + esc(compactNumber(resourceRuntime.averageSelfSufficiencyPct, '%')) + ' · ' + esc(resourceRuntime.source || 'resource runtime') + '</p>') +
        bulletList(arr(resourceRuntime.productionDeficitResources).map(row =>
          (row.name || row.resourceId || 'Resource') + ': observed production ' +
          compactNumber(row.dailyProduction, '') + ', consumption ' + compactNumber(row.dailyConsumption, '') +
          ', self-sufficiency ' + compactNumber(row.selfSufficiencyPct, '%') +
          (num(row.stockDays) === null ? '' : ', stock cover ' + compactNumber(row.stockDays, 'days')),
        ), 'No observed resource production deficit is currently registered.') +
        bulletList(arr(resources.resources).map(x => String(x)), 'No registered gameplay resource-site information for this country.'),
        'ocov-panel-resources') +
      panel('Economic structure & development', 'Sector and trade details are shown only when registered in the country profile.',
        bulletList(
          evidenceItems(strategic?.economy?.tradePosition, 'Trade position')
            .concat(evidenceItems(strategic?.economy?.sectorProfile, 'Sector profile'))
            .concat(evidenceItems(strategic?.economy?.developmentSignals, 'Development signal')),
          'No separate sector or development-profile data is registered.')) +
      panel('Diplomacy & foreign relations', 'Only named game-model signals are treated as country-specific.',
        '<p><strong>Evidence mode:</strong> ' + esc(diplomacy.evidenceMode || 'NOT ESTABLISHED') + '</p>' +
        '<p><strong>Modelled posture:</strong> ' + esc(diplomacy.strategicPosture || 'NOT ESTABLISHED') + '</p>' +
        bulletList(arr(diplomacy.tendencies).concat(arr(diplomacy.highWeightFocus).map(x => 'Priority: ' + x))
          .concat(arr(diplomacy.cooperationSignals), arr(diplomacy.pressurePoints),
            arr(diplomacy.leverageSignals), arr(diplomacy.modelSignals)),
          'No country-specific diplomatic behaviour was verified by available model evidence.') +
        (dependencies.status ? '<p><strong>Dependency status:</strong> ' + esc(dependencies.status) + '</p>' : ''),
        'ocov-panel-diplomacy') +
      panel('Military context', 'Budget effort is not combat capability, readiness or equipment quality.',
        '<div class="ocov-single-metric"><strong>' + esc(compactNumber(militaryPct, '%')) + '</strong><span>military expenditure / GDP</span></div>' +
        '<p>' + esc(strategic?.military?.caveat || 'Operational force structure, readiness, equipment, sustainment and logistics require separate verified runtime records.') + '</p>' +
        bulletList(arr(strategic?.military?.strengthSignals).concat(arr(strategic?.military?.riskSignals),
          arr(strategic?.military?.capabilityGaps), arr(strategic?.military?.gameModelMilitarySignals)),
          'No comparable force-capability estimate is recorded.'),
        'ocov-panel-military') +
      panel('Politics & institutions', 'Governance indicators are kept separate; no unsupported regime label.',
        '<div class="ocov-kpi-grid ocov-kpi-grid-small">' +
        metricCard('Government effectiveness', governmentEffectiveness, '', 'WGI estimate; scale is not 0–100') +
        metricCard('Political stability', politicalStability, '', 'WGI estimate; scale is not 0–100') +
        metricCard('Rule of law', strategicNumber(strategic, 'politics.ruleOfLawWgiEstimate'), '', 'WGI estimate; scale is not 0–100') +
        metricCard('Control of corruption', strategicNumber(strategic, 'politics.controlOfCorruptionWgiEstimate'), '', 'WGI estimate; scale is not 0–100') +
        '</div><p><strong>Political system:</strong> ' + esc(governance.regimeClassification || strategic?.politics?.politicalSystemClassification || 'NOT CLASSIFIED') + '</p>' +
        bulletList(arr(strategic?.politics?.governanceIndicatorPoints).concat(
          arr(strategic?.politics?.strengths), arr(strategic?.politics?.risks), arr(strategic?.politics?.limitations)),
          'No separately registered governance-risk points are available.'),
        'ocov-panel-politics') +
      panel('Dependencies & structural pressure', 'A signal tells the AI what to examine; it does not prove dependence on a named state.',
        bulletList(arr(dependencies.modelSignals)
          .concat(arr(strategic?.dependencies?.domains), arr(strategic?.dependencies?.measurementGaps),
            arr(strategic?.economy?.pressurePoints)),
          'Named supplier, creditor and critical-import dependencies are not established in the available record.'),
        'ocov-panel-dependencies') +
      '</div>' +
      '<div class="ocov-section-heading"><span>02</span><div><h3>Executable behaviour profile</h3><p>These dimensions flow into adaptive action scoring. They are simulation policies, not real-world intent labels.</p></div></div>' +
      '<div class="ocov-behaviour-summary"><span>Behaviour engine: ' + esc(behavior?.engineVersion || 'UNAVAILABLE') + '</span>' +
      '<span>Derived dimensions: ' + esc(behavior?.evidence?.derivedDimensionCount ?? arr(behavior?.evidence?.availableDimensions).length) + '/' + esc(Object.keys(behavior?.dimensions || {}).length || 11) + '</span>' +
      '<span>Adaptive AI source: ' + esc(adaptive?.behaviorSource || (adaptive?.derivedDimensionCount > 0 ? 'CONNECTED' : 'WAITING/EXPLICIT DOCTRINE')) + '</span></div>' +
      dimensionCards(adaptive?.dimensions || behavior?.dimensions) +
      panel('Runtime action preference signals', 'Derived from current evidence and registered country strategy options; the score influences AI ranking but does not execute an order.',
        actionPreferenceRows.length
          ? '<ul class="ocov-action-pref-list">' + actionPreferenceRows.slice(0, 12).map(([action, row]) =>
              '<li><div><strong>' + esc(action.replace(/_/g, ' ')) + '</strong><small>' + esc(row.title || row.domain || row.source || 'Country strategic option') +
              '</small></div><span>' + Math.round(Math.max(0, Math.min(1, Number(row.value))) * 100) + '/100</span></li>').join('') + '</ul>'
          : '<p class="ocov-empty">No action-specific priority signal is registered for this country yet.</p>') +
      '<div class="ocov-domain-grid">' +
      panel('Country-specific strengths', 'Evidence-backed signals, not a single invented national score.',
        bulletList(strengths, 'No registered strength signal is available.')) +
      panel('Country-specific weaknesses & pressures', 'An unavailable field does not mean a country is weak.',
        bulletList(weaknesses, 'No registered weakness signal is available.')) +
      panel('Player advantages', 'Potential gameplay advantages grounded in the registered country profile.',
        bulletList(playerAdvantages, 'No country-specific player advantage has been established.')) +
      panel('Player challenges', 'Strategic challenges for the player; these are not automatic penalties.',
        bulletList(playerChallenges, 'No country-specific player challenge has been established.')) +
      panel('Registered strategic options', 'Profile-builder options retained alongside current runtime priorities.',
        bulletList(registeredOptions, 'No separately registered strategic option is available.')) +
      panel('Recommended strategy from country profile', 'Recommendations are advice, not executed orders.',
        bulletList(recommendedStrategyItems, 'No separately registered country strategy recommendation is available.')) +
      '</div>' +
      '<div class="ocov-section-heading"><span>03</span><div><h3>Priority stack</h3><p>Current candidate priorities generated from this country’s available evidence.</p></div></div>' +
      '<section class="ocov-panel"><div class="ocov-panel-body">' + priorityBody + '</div></section>' +
      panel('Data integrity & evidence quality', 'One selected-country contract is shared across the map, Country IOS and ministry views. Source conflicts are reported, not silently reconciled.',
        '<p><strong>Gateway:</strong> ' + esc(gateway?.VERSION || 'NOT LOADED') + ' · <strong>Country identity:</strong> ' + esc(sharedSnapshot?.countryCode || 'UNRESOLVED') + '</p>' +
        '<p><strong>Integrity status:</strong> ' + esc(sharedSnapshot?.diagnostics?.errors?.length ? 'ERRORS DETECTED' : (sharedSnapshot?.diagnostics?.warnings?.length ? 'WARNINGS DETECTED' : (sharedHasCountry ? 'NO CONFLICT DETECTED IN CHECKED SOURCES' : 'GATEWAY COUNTRY UNRESOLVED'))) + '</p>' +
        '<p><strong>Errors:</strong> ' + esc(sharedSnapshot?.diagnostics?.errors?.length ?? 'NOT CHECKED') + ' · <strong>Warnings:</strong> ' + esc(sharedSnapshot?.diagnostics?.warnings?.length ?? 'NOT CHECKED') + ' · <strong>Missing fields:</strong> ' + esc(sharedSnapshot?.diagnostics?.missingFields?.length ?? 'NOT CHECKED') + '</p>' +
        '<p><strong>Baseline source:</strong> ' + esc(base?.provenance?.economicSource || behavior?.evidence?.baselineSource || 'NOT RECORDED') + '</p>' +
        '<p><strong>Baseline status:</strong> ' + esc(sourceStatus) + '</p>' +
        '<button type="button" data-ocov-audit-all style="padding:8px 12px;border:1px solid #64748b;border-radius:7px;background:#172033;color:#e2e8f0;cursor:pointer;font-weight:700">AUDIT ALL COUNTRY RECORDS</button>' +
        '<pre data-ocov-audit-results style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;font:11px/1.5 monospace;color:#cbd5e1"></pre>' +
        bulletList(arr(sharedSnapshot?.diagnostics?.errors).map(x => '[ERROR] ' + (x.code || 'DATA_INTEGRITY') + (x.field ? ' · ' + x.field : '') + ' · ' + JSON.stringify(x))
          .concat(arr(sharedSnapshot?.diagnostics?.warnings).map(x => '[WARNING] ' + (x.code || 'SOURCE_DIFFERENCE') + (x.field ? ' · ' + x.field : '') + ' · ' + JSON.stringify(x)))
          .concat(arr(behavior?.evidence?.limitations)).concat(arr(strategic?.dataQuality?.limitations)),
          'No identity/source mismatch was detected in the sources checked; unobserved values remain unavailable.'),
        'ocov-panel-methodology') +
      '</div>';

    panelEl.innerHTML = overviewHtml;
    panelEl.dataset.countryId = String(value);
    panelEl.dataset.profileStatus = String(profileStatus);
    if (behaviorEngine() && typeof behaviorEngine().init === 'function') {
      Promise.resolve(behaviorEngine().init()).then(() => {
        if (activeTab === 'country' && lastRenderedCountry === value &&
            (panelEl.dataset.resourceReady !== 'true')) {
          panelEl.dataset.resourceReady = 'true';
          renderCountryOverview();
        }
      }).catch(() => {});
    }
    return true;
  }

  function setActiveTab(tab) {
    const requested = tab === 'country' ? 'country' : 'ministry';
    activeTab = requested;
    const doc = g.document;
    const nav = doc?.getElementById?.('omega-country-overview-tabs');
    const panelEl = doc?.getElementById?.('omega-country-overview-panel');
    const ministry = doc?.getElementById?.('ministry-dashboard-content');
    if (!nav || !panelEl || !ministry) return false;
    nav.querySelectorAll('[data-omega-ministry-view]').forEach(button => {
      const active = button.getAttribute('data-omega-ministry-view') === requested;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const countryActive = requested === 'country';
    panelEl.hidden = !countryActive;
    ministry.classList.toggle('ocov-ministry-hidden', countryActive);
    if (countryActive) renderCountryOverview();
    return true;
  }

  function onClick(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return;
    const profileRetry = target.closest('[data-ocov-profile-retry]');
    if (profileRetry) {
      event.preventDefault();
      sectorProfileState.error = null;
      sectorProfileState.promise = null;
      sectorProfileState.registryError = null;
      sectorProfileState.registryPromise = null;
      renderCountryOverview();
      return;
    }
    const auditButton = target.closest('[data-ocov-audit-all]');
    if (auditButton) {
      event.preventDefault();
      const output = auditButton.parentElement?.querySelector?.('[data-ocov-audit-results]');
      const gateway = g.OmegaCountryDataGateway || g.Omega?.CountryDataGateway;
      if (!gateway || typeof gateway.auditAllCountries !== 'function') {
        if (output) output.textContent = 'Country data gateway is not loaded.';
        return;
      }
      const report = gateway.auditAllCountries();
      const samples = [...(report.errors || []).slice(0, 12).map(row => 'ERROR ' + row.countryCode + ' ' + row.code + ' ' + (row.field || '') + ' ' + JSON.stringify(row)),
        ...(report.warnings || []).slice(0, 12).map(row => 'WARNING ' + row.countryCode + ' ' + row.code + ' ' + (row.field || '') + ' ' + JSON.stringify(row))];
      if (output) output.textContent = 'Countries checked: ' + report.countryCount +
        '\nErrors: ' + report.errorCount + '\nWarnings: ' + (report.warnings || []).length +
        '\nMissing values (not errors by themselves): ' + report.missingFieldCount +
        '\n' + (samples.length ? samples.join('\n') : 'No identity/source discrepancies detected in the checks performed.');
      return;
    }
    const tab = target.closest('[data-omega-ministry-view]');
    if (tab && tab.closest('#omega-country-overview-tabs')) {
      event.preventDefault();
      setActiveTab(tab.getAttribute('data-omega-ministry-view'));
      return;
    }
    if (target.closest('#cabinet-full-window .parchment-card-btn[data-ministry-id]')) {
      setActiveTab('ministry');
    }
  }

  function onChange(event) {
    if (event?.target?.id !== 'ocov-country-select') return;
    const value = String(event.target.value || '').trim();
    if (!value) return;
    selectedCountry = resolve(value).canonical || value;
    renderCountryOverview();
  }

  function onCountryContext(event) {
    const detail = event?.detail || {};
    const candidate = detail.countryId || detail.country || null;
    if (!candidate) return;
    selectedCountry = resolve(candidate).canonical || String(candidate);
    if (activeTab === 'country') renderCountryOverview();
  }

  function diagnostics() {
    return {
      version: VERSION,
      initialized,
      activeTab,
      selectedCountry,
      runtimeReady: !!runtime()?.isReady?.(),
      countryCount: identities().length,
      behaviorEngineAvailable: !!behaviorEngine(),
      behaviorEngine: behaviorEngine()?.diagnostics?.() || null,
      lastRenderedCountry,
      countrySectorProfilesReady: sectorProfileState.ready,
      countrySectorProfileCount: sectorProfileState.data?.countries?.length || 0,
      countrySectorProfileError: sectorProfileState.error,
      countrySectorRegistryError: sectorProfileState.registryError
    };
  }

  function init() {
    if (initialized || !g.document) return initialized;
    initialized = true;
    if (!selectedCountry) selectedCountry = defaultCountry();
    g.document.addEventListener('click', onClick);
    g.document.addEventListener('change', onChange);
    g.addEventListener?.('OMEGA_COUNTRY_CONTEXT_CHANGED', onCountryContext);
    g.addEventListener?.('OMEGA_COUNTRY_BEHAVIOR_READY', () => {
      if (activeTab === 'country') renderCountryOverview();
    });
    g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED', () => {
      if (activeTab === 'country') renderCountryOverview();
    });
    Promise.resolve(runtime()?.ready).then(() => {
      if (activeTab === 'country') renderCountryOverview();
    }).catch(() => {});
    return true;
  }

  const API = Object.freeze({ VERSION, init, renderCountryOverview, setActiveTab, diagnostics });
  g.Omega = g.Omega || {};
  g.Omega.CountryOverviewMinistryUI = API;
  g.OmegaCountryOverviewMinistryUI = API;
  if (g.document?.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
