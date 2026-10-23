/* OMEGA Ministry Country Overview UI v1.0.0
 * Shared, read-only country briefing mounted inside the existing ministry dashboard.
 * All facts come from the shared country runtime and runtime behavior engine.
 */
(function (g) {
  'use strict';
  const VERSION = '1.2.0';
  if (g.OmegaCountryOverviewMinistryUI?.VERSION === VERSION) return;

  const s = v => String(v == null ? '' : v);
  const cleanCountryDisplayText = value => s(value)
    .replace(/\b(?:SIMULATED(?:[\s_-]+FOR[\s_-]+GAMEPLAY[\s_-]+ONLY)?|SIMULATION(?:[\s_-]+ONLY)?|REAL[\s_-]+DATA|DERIVED[\s_-]+SIMULATION[\s_-]+POLICY)\b/gi, '')
    .replace(/\b(?:UNOBSERVED|UNAVAILABLE|NOT[\s_-]+LOADED|NOT[\s_-]*CLASSIFIED|NOT[\s_-]*ESTABLISHED)\b/gi, 'Not recorded')
    .replace(/\b(?:SIMULATION|RUNTIME|LIVE[\s_-]+STATE|SOURCE[\s_-]+BASELINE|REGISTERED[\s_-]+SOURCE)\b/gi, '')
    .replace(/\bOMEGA_[A-Z0-9_]+\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([·,:;])/g, '$1')
    .replace(/([·,:;])\s*([·,:;])/g, '$1')
    .replace(/^[\s·,:;|]+|[\s·,:;|]+$/g, '');
  const esc = v => cleanCountryDisplayText(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
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
  let activeTab = 'overview';
  let lastRenderedCountry = null;
  let countryDataInitPromise = null;

  const runtime = () => g.OmegaCountryRuntimeData || null;
  const behaviorEngine = () => g.OmegaCountryBehaviorEngine || g.Omega?.CountryBehaviorEngine || null;
  const adaptiveEngine = () => g.OmegaOpponentAdaptiveStrategy || g.Omega?.OpponentAdaptiveStrategy || null;

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
    if (n === null) return 'NOT RECORDED';
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

  function countryDataApi() {
    return g.OmegaCountryGeneralDataRuntime || g.Omega?.CountryGeneralData || null;
  }

  function ensureCountryDataReady() {
    const api = countryDataApi();
    if (!api || typeof api.getCountryRecord !== 'function') return Promise.resolve(false);
    if (api.diagnostics?.().ready) return Promise.resolve(true);
    if (countryDataInitPromise) return countryDataInitPromise;
    countryDataInitPromise = Promise.resolve(typeof api.init === 'function' ? api.init() : false)
      .then(() => !!api.diagnostics?.().ready)
      .catch(() => false);
    return countryDataInitPromise;
  }

  function humanizeCountryDataKey(key) {
    return String(key || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b[a-z]/g, character => character.toUpperCase());
  }

  function hasCountryDataValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.some(hasCountryDataValue);
    if (isObj(value)) return Object.values(value).some(hasCountryDataValue);
    return true;
  }

  function formatCountryDataValue(value, unit, depth) {
    const level = depth || 0;
    if (!hasCountryDataValue(value)) return 'Not recorded';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      const shown = value.toLocaleString(undefined, { maximumFractionDigits: 3 });
      return shown + (unit ? ' ' + unit : '');
    }
    if (typeof value === 'string') return cleanCountryDisplayText(value) || 'Not recorded';
    if (Array.isArray(value)) {
      const shown = value.slice(0, 8).map(item => formatCountryDataValue(item, null, level + 1));
      return shown.join(', ') + (value.length > 8 ? ' · +' + (value.length - 8) + ' more' : '');
    }
    if (isObj(value)) {
      const entries = Object.entries(value).filter(([, item]) => hasCountryDataValue(item));
      if (!entries.length) return 'Not recorded';
      if (level >= 3) return 'Details available';
      return entries.slice(0, 6).map(([key, item]) =>
        humanizeCountryDataKey(key) + ': ' + formatCountryDataValue(item, null, level + 1)
      ).join(' · ') + (entries.length > 6 ? ' · +' + (entries.length - 6) + ' more' : '');
    }
    return String(value);
  }

  const COUNTRY_METRIC_GROUPS = [
    { title: 'Economy & public finance', pattern: /^(gdp|inflation|unemployment|publicDebt|government|budget|taxRevenue|fiscal|domesticCredit|grossCapital|policyInterest)/i },
    { title: 'Trade & foreign exchange', pattern: /(trade|exports|imports|currentAccount|fxReserves|exchangeRate|foreignDirectInvestment|externalDebt)/i },
    { title: 'Population & human development', pattern: /^(population|birthRate|deathRate|fertilityRate|lifeExpectancy|literacyRate|urbanization|malePopulation|femalePopulation|poverty|healthSpend|educationSpend|humanDevelopment|migrationRate)/i },
    { title: 'Industry, infrastructure & environment', pattern: /(agriculture|industry|servicesValue|manufacturing|rAndD|internet|electricity|co2|renewable|energy|forest|emission|protected|research|urbanization)/i },
    { title: 'Governance, defence & public safety', pattern: /(Wgi|democracy|corruption|globalPeace|fragileStates|pressFreedom|military|homicide|crime|ruleOfLaw|politicalStability|governmentEffectiveness|regulatoryQuality|voiceAccountability)/i }
  ];

  function countryMetricGroup(key) {
    const match = COUNTRY_METRIC_GROUPS.find(group => group.pattern.test(key));
    return match ? match.title : 'Other indicators';
  }

  function countryMetricIsInternal(key, record) {
    const meta = record?.metricMetadata?.[key] || {};
    return /GAME_DERIVED|SIMULATION|GAMEPLAY|SCENARIO|MODELED|MODELLED|DERIVED_HEURISTIC|DERIVED_SIMULATION|POLICY_ONLY/i.test(s(meta.status)) ||
      /SIMULATION|GAMEPLAY|RUNTIME|MODELLED|MODELED|OMEGA_/i.test(s(meta.note));
  }

  function countryMetricDisplayValue(key, record) {
    return countryMetricIsInternal(key, record) ? null : record?.metrics?.[key];
  }

  function countryDataRow(label, value, unit, year) {
    const safeLabel = cleanCountryDisplayText(label) || 'Country field';
    const safeValue = typeof value === 'string' ? (cleanCountryDisplayText(value) || 'Not recorded') : value;
    const available = hasCountryDataValue(safeValue);
    return '<div class="ocov-country-data-row' + (available ? '' : ' is-missing') + '">' +
      '<span class="ocov-country-data-label">' + esc(safeLabel) + '</span>' +
      '<strong class="ocov-country-data-value">' + esc(formatCountryDataValue(safeValue, unit, 0)) + '</strong>' +
      (available && year !== null && year !== undefined && year !== '' && Number.isFinite(Number(year))
        ? '<small>Year ' + esc(String(year)) + '</small>' : '') +
      '</div>';
  }

  const INTERNAL_COUNTRY_META_KEY = /^(status|availability|source|sourceId|sourceName|sourceUrl|datasetId|authority|provenance|confidence|method|observationYear|schemaVersion|version|coverageStatus|dataStatus)$/i;

  function countryExtraRows(value, prefix, rows, depth) {
    const level = depth || 0;
    if (isObj(value) && level < 3) {
      const entries = Object.entries(value).filter(([key]) => !INTERNAL_COUNTRY_META_KEY.test(key));
      if (!entries.length) rows.push(countryDataRow(humanizeCountryDataKey(prefix), null, null, null));
      else entries.forEach(([key, item]) =>
        countryExtraRows(item, prefix ? prefix + '.' + key : key, rows, level + 1)
      );
      return;
    }
    rows.push(countryDataRow(String(prefix).split('.').map(humanizeCountryDataKey).join(' · '), value, null, null));
  }

  function flattenCountryAuditFields(value, prefix, output) {
    if (Array.isArray(value)) {
      output.push(prefix);
      return;
    }
    if (isObj(value)) {
      const entries = Object.entries(value).filter(([key]) => !INTERNAL_COUNTRY_META_KEY.test(key));
      if (!entries.length) {
        output.push(prefix);
        return;
      }
      entries.forEach(([key, child]) => flattenCountryAuditFields(child, prefix ? prefix + '.' + key : key, output));
      return;
    }
    output.push(prefix);
  }

  function countryValueAtPath(record, path) {
    return String(path || '').split('.').reduce((value, key) =>
      value === null || value === undefined ? undefined : value[key], record);
  }

  function renderCountryDataCoverage(country, record) {
    const api = countryDataApi();
    if (!record || !api) {
      return '<section class="ocov-country-data"><div class="ocov-section-heading"><span>01A</span><div>' +
        '<h3>Country data & indicators</h3><p>Detailed country indicators are not available for this selection.</p></div></div></section>';
    }
    const metrics = Object.keys(record.metrics || {}).map(key => [key, countryMetricDisplayValue(key, record)]);
    const facts = Object.entries(record.generalFacts || {}).filter(([key]) => !INTERNAL_COUNTRY_META_KEY.test(key));
    const identity = record.identity || {};
    const identityFacts = ['officialName', 'continent', 'subregion']
      .filter(key => Object.prototype.hasOwnProperty.call(identity, key))
      .map(key => [key, identity[key]]);
    const allFacts = identityFacts.concat(facts);
    const availableMetrics = metrics.filter(([, value]) => hasCountryDataValue(value)).length;
    const missingMetrics = metrics.length - availableMetrics;
    const availableFacts = allFacts.filter(([, value]) => hasCountryDataValue(value)).length;
    const missingFacts = allFacts.length - availableFacts;
    const groups = new Map();
    metrics.forEach(entry => {
      const name = countryMetricGroup(entry[0]);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(entry);
    });
    const generalHtml = allFacts.map(([key, value]) =>
      countryDataRow(humanizeCountryDataKey(key), value, null, null)
    ).join('');
    const groupsHtml = Array.from(groups.entries()).map(([title, entries], index) => {
      const available = entries.filter(([, value]) => hasCountryDataValue(value)).length;
      const body = entries.map(([key, value]) => {
        const definition = api.getMetricDefinition?.(key) || {};
        const metadata = record.metricMetadata?.[key] || {};
        return countryDataRow(definition.name || definition.title || humanizeCountryDataKey(key),
          value, definition.unit || null, metadata.year);
      }).join('');
      return '<details class="ocov-country-data-group"' + (index === 0 ? ' open' : '') + '>' +
        '<summary>' + esc(title) + '<span>' + available + '/' + entries.length + ' recorded</span></summary>' +
        '<div class="ocov-country-data-rows">' + body + '</div></details>';
    }).join('');
    const extras = [
      ['Local geography', record.localGeography],
      ['Natural resources & energy context', record.naturalResources],
      ['Public safety context', record.publicSafety]
    ];
    const extrasHtml = extras.map(([title, value]) => {
      if (!isObj(value) || !Object.keys(value).length) return '';
      const rows = [];
      countryExtraRows(value, title, rows, 0);
      const available = rows.filter(row => !row.includes('class="ocov-country-data-row is-missing"')).length;
      return '<details class="ocov-country-data-group"><summary>' + esc(title) +
        '<span>' + available + '/' + rows.length + ' recorded</span></summary>' +
        '<div class="ocov-country-data-rows">' + rows.join('') + '</div></details>';
    }).join('');
    return '<section class="ocov-country-data" data-ocov-country-data data-country-id="' + esc(country) + '">' +
      '<div class="ocov-section-heading"><span>01A</span><div><h3>Country data & indicators</h3>' +
      '<p>Browse the full recorded country profile. Missing values are shown instead of being hidden or filled with zero.</p></div></div>' +
      '<div class="ocov-country-data-summary">' +
      '<div><strong>' + availableMetrics + '/' + metrics.length + '</strong><span>Indicators recorded</span></div>' +
      '<div><strong>' + missingMetrics + '</strong><span>Indicators not recorded</span></div>' +
      '<div><strong>' + (availableFacts) + '/' + allFacts.length + '</strong><span>General facts recorded</span></div>' +
      '<div><strong>' + (missingFacts) + '</strong><span>General facts not recorded</span></div>' +
      '</div>' +
      '<details class="ocov-country-data-group" open><summary>General country facts<span>' +
      availableFacts + '/' + allFacts.length + ' recorded</span></summary><div class="ocov-country-data-rows">' +
      generalHtml + '</div></details>' +
      groupsHtml + extrasHtml +
      '<div class="ocov-country-data-audit"><div><strong>Country-by-country data gaps</strong>' +
      '<p>Review every country and the indicators that have no recorded value.</p></div>' +
      '<button type="button" data-ocov-audit-all>Review all country data</button>' +
      '<pre data-ocov-audit-results role="status" aria-live="polite">Select “Review all country data” to list missing fields across the country registry.</pre></div>' +
      '</section>';
  }

  function runCountryDataAudit(output) {
    const api = countryDataApi();
    if (!output) return;
    if (!api || typeof api.getCountryRecord !== 'function') {
      output.textContent = 'Country indicator records are unavailable.';
      return;
    }
    output.textContent = 'Reviewing country indicator coverage…';
    ensureCountryDataReady().then(ready => {
      if (!ready) {
        output.textContent = 'Country indicator records could not be loaded.';
        return;
      }
      const countries = identities();
      const firstCountry = countries[0];
      const firstCode = firstCountry && (firstCountry.iso3 || firstCountry.countryCode || firstCountry.code || firstCountry.name);
      const template = firstCode ? api.getCountryRecord(firstCode) : null;
      if (!countries.length || !template) {
        output.textContent = 'Country records could not be enumerated for this review.';
        return;
      }
      const metricKeys = Object.keys(template.metrics || {});
      const factKeys = Object.keys(template.generalFacts || {});
      const identityKeys = ['officialName', 'continent', 'subregion']
        .filter(key => Object.prototype.hasOwnProperty.call(template.identity || {}, key))
        .map(key => 'identity.' + key);
      const contextKeys = [];
      [['localGeography', template.localGeography], ['naturalResources', template.naturalResources],
        ['publicSafety', template.publicSafety]].forEach(([rootKey, value]) =>
          flattenCountryAuditFields(value, rootKey, contextKeys)
        );
      const metricMissing = Object.fromEntries(metricKeys.map(key => [key, 0]));
      const countryGaps = [];
      let missingMetricCells = 0;
      let missingFactCells = 0;
      let missingContextCells = 0;
      let unavailableRecords = 0;
      countries.forEach(countryRow => {
        const code = countryRow.iso3 || countryRow.countryCode || countryRow.code || countryRow.name;
        const record = api.getCountryRecord(code);
        if (!record) {
          unavailableRecords += 1;
          missingMetricCells += metricKeys.length;
          missingFactCells += factKeys.length + identityKeys.length;
          missingContextCells += contextKeys.length;
          metricKeys.forEach(key => { metricMissing[key] += 1; });
          countryGaps.push({
            name: countryRow.name || countryRow.officialName || String(code),
            code, metrics: metricKeys.slice(), facts: factKeys.slice(), identity: identityKeys.slice(),
            context: contextKeys.slice()
          });
          return;
        }
        const missingMetrics = metricKeys.filter(key => !hasCountryDataValue(record.metrics?.[key]) || countryMetricIsInternal(key, record));
        const missingFacts = factKeys.filter(key => !hasCountryDataValue(record.generalFacts?.[key]));
        const missingIdentity = identityKeys.filter(key => !hasCountryDataValue(countryValueAtPath(record, key)));
        const missingContext = contextKeys.filter(key => !hasCountryDataValue(countryValueAtPath(record, key)) || /SIMULATED|SIMULATION|REAL DATA|RUNTIME|OMEGA_/i.test(s(countryValueAtPath(record, key))));
        missingMetrics.forEach(key => { metricMissing[key] += 1; });
        missingMetricCells += missingMetrics.length;
        missingFactCells += missingFacts.length + missingIdentity.length;
        missingContextCells += missingContext.length;
        if (missingMetrics.length || missingFacts.length || missingIdentity.length || missingContext.length) {
          countryGaps.push({
            name: countryRow.name || countryRow.officialName || record.identity?.name || String(code),
            code, metrics: missingMetrics, facts: missingFacts, identity: missingIdentity, context: missingContext
          });
        }
      });
      const metricNames = key => {
        const definition = api.getMetricDefinition?.(key) || {};
        return definition.name || definition.title || humanizeCountryDataKey(key);
      };
      const friendlyPath = key => String(key).split('.').map(humanizeCountryDataKey).join(' · ');
      const mostMissing = Object.entries(metricMissing)
        .sort((left, right) => right[1] - left[1])
        .filter(([, count]) => count > 0).slice(0, 12)
        .map(([key, count]) => '  ' + metricNames(key) + ': missing in ' + count + ' countries');
      const lines = [
        'COUNTRY DATA COVERAGE REVIEW',
        'Countries checked: ' + countries.length,
        'Indicator fields: ' + metricKeys.length + ' per country',
        'Indicator values not recorded: ' + missingMetricCells + ' of ' + (countries.length * metricKeys.length),
        'General and identity fact fields: ' + (factKeys.length + identityKeys.length) + ' per country',
        'General and identity fact values not recorded: ' + missingFactCells + ' of ' + (countries.length * (factKeys.length + identityKeys.length)),
        'Additional context fields not recorded: ' + missingContextCells + ' of ' + (countries.length * contextKeys.length),
        'Country records unavailable: ' + unavailableRecords,
        '',
        'MOST FREQUENTLY MISSING INDICATORS',
        ...(mostMissing.length ? mostMissing : ['  No missing indicator values were found.']),
        '',
        'MISSING FIELDS BY COUNTRY'
      ];
      countryGaps.forEach(row => {
        lines.push('', row.name + ' (' + row.code + ')');
        lines.push('  Indicators: ' + (row.metrics.length ? row.metrics.map(metricNames).join(', ') : 'All listed indicators recorded'));
        lines.push('  General facts: ' + (row.facts.length || row.identity.length
          ? row.identity.concat(row.facts.map(key => 'generalFacts.' + key)).map(friendlyPath).join(', ')
          : 'All listed general facts recorded'));
        lines.push('  Additional context: ' + (row.context.length ? row.context.map(friendlyPath).join(', ') : 'All listed context fields recorded'));
      });
      if (!countryGaps.length) lines.push('All checked country fields have recorded values.');
      output.textContent = lines.join('\n');
    }).catch(() => {
      output.textContent = 'Country indicator review could not be completed.';
    });
  }

  function bulletList(items, emptyLabel) {
    const rows = arr(items).filter(x => x !== null && x !== undefined && s(x).trim() !== '');
    if (!rows.length) return '<p class="ocov-empty">' + esc(emptyLabel || 'No registered evidence for this section.') + '</p>';
    return '<ul class="ocov-list">' + rows.slice(0, 10).map(item => {
      if (typeof item === 'string' || typeof item === 'number') return '<li><em>' + esc(item) + '</em></li>';
      if (isObj(item)) {
        const label = item.title || item.signal || item.key || item.name || item.metric || item.domain || 'Signal';
        const detail = item.detail || item.meaning || item.interpretation || item.basis || item.reason || '';
        const source = item.source ? ' · Source: ' + item.source : '';
        const value = item.value !== null && item.value !== undefined ? ' · Value: ' + item.value : '';
        return '<li><strong>' + esc(label) + '</strong>' + (detail ? '<span><em>' + esc(detail) + '</em></span>' : '') +
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

  function isExecutiveMinistryView() {
    // The overview belongs to the Executive Ministry view only. Never mount it
    // alongside the separate All Ministries list.
    return g.OmegaCabinetUI?.mainCabinetView !== 'ministries';
  }

  function ensureGovernmentOverviewMount() {
    const doc = g.document;
    const cabinet = doc?.getElementById?.('cabinet-full-window');
    const container = cabinet?.querySelector?.('.parchment-cabinet-container');
    if (!cabinet || !container) return false;

    // Remove the former extra two-button navigation. The overview is content
    // inside Executive Ministry, not a third/fourth top-level destination.
    const legacyNav = doc.getElementById('omega-government-overview-tabs');
    if (legacyNav?.parentElement) legacyNav.parentElement.removeChild(legacyNav);

    let panelEl = doc.getElementById('omega-government-overview-panel');
    const executiveActive = isExecutiveMinistryView();
    activeTab = executiveActive ? 'overview' : 'cabinet';

    if (!executiveActive) {
      if (panelEl?.parentElement) panelEl.parentElement.removeChild(panelEl);
      container.classList.remove('ocov-government-overview-active');
      return false;
    }

    const mainNavigation = container.querySelector('.omega-cabinet-main-navigation');
    if (panelEl && panelEl.parentElement === container) {
      if (mainNavigation && panelEl.previousElementSibling !== mainNavigation) {
        mainNavigation.insertAdjacentElement('afterend', panelEl);
        return true;
      }
      panelEl.hidden = false;
      container.classList.remove('ocov-government-overview-active');
      return false;
    }
    if (panelEl?.parentElement) panelEl.parentElement.removeChild(panelEl);

    panelEl = doc.createElement('section');
    panelEl.id = 'omega-government-overview-panel';
    panelEl.className = 'omega-country-overview-panel';
    panelEl.setAttribute('aria-label', 'Country Overview');
    panelEl.setAttribute('role', 'region');
    panelEl.hidden = false;

    const topHud = container.querySelector('.parchment-top-hud');
    if (mainNavigation && mainNavigation.parentElement === container) {
      mainNavigation.insertAdjacentElement('afterend', panelEl);
    } else if (topHud && topHud.parentElement === container) {
      topHud.insertAdjacentElement('afterend', panelEl);
    } else {
      container.insertBefore(panelEl, container.firstChild);
    }
    container.classList.remove('ocov-government-overview-active');
    return true;
  }

  function applyGovernmentViewState() {
    const doc = g.document;
    const panelEl = doc?.getElementById?.('omega-government-overview-panel');
    const container = panelEl?.parentElement;
    if (!panelEl || !container) return false;

    const executiveActive = isExecutiveMinistryView();
    panelEl.hidden = !executiveActive;
    container.classList.remove('ocov-government-overview-active');
    return executiveActive;
  }

  function renderCountryOverview() {
    const doc = g.document;
    const panelEl = doc?.getElementById?.('omega-government-overview-panel');
    if (!panelEl || !isExecutiveMinistryView()) return false;
    const requested = selectedCountry || defaultCountry();
    const resolved = resolve(requested);
    const identity = resolved.identity || {};
    const value = resolved.canonical || requested;
    selectedCountry = value;
    lastRenderedCountry = value;

    const base = baselineFor(value);
    const generalApi = g.OmegaCountryGeneralDataRuntime || g.Omega?.CountryGeneralData || null;
    let generalRecord = null;
    try { generalRecord = generalApi?.getCountryRecord?.(value) || null; } catch (_) {}
    if (!generalRecord && generalApi?.init && panelEl.dataset.countryDataInitAttempted !== String(value)) {
      panelEl.dataset.countryDataInitAttempted = String(value);
      Promise.resolve(generalApi.init()).then(() => {
        if (isExecutiveMinistryView() && lastRenderedCountry === value) renderCountryOverview();
      }).catch(() => {});
    }
    const generalFacts = generalRecord?.generalFacts || {};
    const metricMetadata = generalRecord?.metricMetadata || {};
    const hiddenDataStatus = status => /GAME_DERIVED|SIMULATION|GAMEPLAY|SCENARIO|MODELED|MODELLED|DERIVED_HEURISTIC|DERIVED_SIMULATION|POLICY_ONLY/i.test(s(status));
    const displayMetric = key => {
      const raw = generalRecord?.metrics?.[key];
      const meta = metricMetadata[key] || {};
      if (hiddenDataStatus(meta.status)) return {value:null,source:'Not recorded'};
      const value = num(raw);
      if (value === null) return {value:null,source:'Not recorded'};
      const status = s(meta.status).toUpperCase();
      let source = '';
      if (status.includes('WORLD_BANK_API_OBSERVATION')) source = 'World Bank';
      else if (status.includes('UNDP_HDR_OBSERVATION')) source = 'UNDP';
      else if (status.includes('TRANSPARENCY_INTERNATIONAL_CPI')) source = 'Transparency International';
      else if (status.includes('DERIVED_SAME_YEAR_OBSERVATIONS')) source = 'Calculated from same-year data';
      else if (status.includes('LEGACY') || status.includes('LOCAL_BASELINE')) source = 'Earlier recorded data';
      else {
        const name = s(meta.sourceName || meta.sourceId);
        if (name && !/OMEGA_|GAME|SIMULATION|RUNTIME|LOCAL_GAME|SCENARIO|MODEL/i.test(name) && !/\.json$/i.test(name)) source = name;
      }
      const year = num(meta.year);
      const detail = [source, year === null ? null : 'Year ' + year].filter(Boolean).join(' · ');
      return {value,source:detail || 'Recorded observation'};
    };
    const factDisplay = value => {
      if (value === null || value === undefined || value === '') return 'Not recorded';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) return value.length ? value.map(factDisplay).join(', ') : 'Not recorded';
      if (isObj(value)) {
        const rows = Object.entries(value).filter(([,item]) => item !== null && item !== undefined && item !== '');
        return rows.length ? rows.map(([key,item]) => key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b[a-z]/g,ch=>ch.toUpperCase()) + ': ' + factDisplay(item)).join(' · ') : 'Not recorded';
      }
      return String(value);
    };
    const countryFacts = Object.entries(generalFacts)
      .filter(([key]) => !/status|source|provenance|diagnostic/i.test(key))
      .map(([key,value]) => {
        const label = key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b[a-z]/g,ch=>ch.toUpperCase());
        return '<li><strong>' + esc(label) + ':</strong> ' + esc(factDisplay(value)) + '</li>';
      });
    const metricEntries = Object.entries(generalRecord?.metrics || {});
    const missingMetrics = metricEntries.filter(([key,value]) => num(value) === null || hiddenDataStatus(metricMetadata[key]?.status));
    const recordedMetricCount = metricEntries.length - missingMetrics.length;
    const fieldTitle = key => {
      const definition = generalApi?.getMetricDefinition?.(key);
      return definition?.name || definition?.title || key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b[a-z]/g,ch=>ch.toUpperCase());
    };
    const gateway = g.OmegaCountryDataGateway || g.Omega?.CountryDataGateway || null;
    const sharedSnapshot = gateway?.getSnapshot?.(value) || null;
    const sharedHasCountry = !!(sharedSnapshot && sharedSnapshot.countryCode);
    const sharedMetric = (key, fallback) => {
      if (!sharedHasCountry) return fallback;
      const row = sharedSnapshot.fields?.[key];
      if (!row || row.status !== 'AVAILABLE' || num(row.value) === null)
        return { value: null, source: 'Not recorded' };
      const source = [row.sourceName || row.authority || null, row.year ? 'Year ' + row.year : null].filter(Boolean).join(' · ');
      return { value: num(row.value), source: source || 'Recorded observation' };
    };
    const strategic = runtime()?.getStrategicProfile?.(value) || null;
    let behavior = null;
    try { behavior = behaviorEngine()?.getBehaviorProfile?.(value) || null; } catch (_) {}

    let adaptive = null;
    try { adaptive = adaptiveEngine()?.profile?.(value) || null; } catch (_) {}

    if (!base && runtime()?.ready && typeof runtime().isSettled === 'function' && !runtime().isSettled()) {
      panelEl.innerHTML = '<div class="ocov-loading"><div class="ocov-eyebrow">OMEGA / COUNTRY OVERVIEW</div><h2>Loading country records…</h2><p>Waiting for the canonical country registry. No substitute data is being displayed.</p></div>';
      Promise.resolve(runtime().ready).then(() => { if (isExecutiveMinistryView()) renderCountryOverview(); }).catch(() => {});
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
      : '<p class="ocov-empty">No planning priority is recorded for this country.</p>';

    const overviewHtml =
      '<div class="ocov-shell">' +
      '<div class="ocov-toolbar"><label for="ocov-country-select">Country</label>' +
      '<select id="ocov-country-select" aria-label="Choose country">' + countryOptions(value) + '</select>' +
      '<span class="ocov-baseline-label">National data profile</span></div>' +
      '<section class="ocov-hero"><div class="ocov-hero-id"><span class="ocov-flag">' + esc(flag) + '</span><div>' +
      '<div class="ocov-eyebrow">COUNTRY PROFILE</div><h2>' + esc(name) + '</h2>' +
      '<p>' + esc(countryCode) + '</p></div></div>' +
      '<p class="ocov-summary">National facts and indicators are listed below. Missing values are marked Not recorded.</p>' +
      '</section>' +
      '<div class="ocov-section-heading"><span>01</span><div><h3>National indicators</h3><p>Observation years and source names are shown where available.</p></div></div>' +
      '<div class="ocov-kpi-grid">' +
      metricCard('GDP', displayMetric('gdpCurrentUsd').value, 'USD', displayMetric('gdpCurrentUsd').source) +
      metricCard('Population', displayMetric('populationTotal').value, 'people', displayMetric('populationTotal').source) +
      metricCard('GDP growth', displayMetric('gdpGrowthPct').value, '%', displayMetric('gdpGrowthPct').source) +
      metricCard('Inflation', displayMetric('inflationPct').value, '%', displayMetric('inflationPct').source) +
      metricCard('Unemployment', displayMetric('unemploymentRatePct').value, '%', displayMetric('unemploymentRatePct').source) +
      metricCard('Public debt / GDP', displayMetric('publicDebtToGdpPct').value, '%', displayMetric('publicDebtToGdpPct').source) +
      metricCard('Government revenue / GDP', displayMetric('governmentRevenuePctGdp').value, '%', displayMetric('governmentRevenuePctGdp').source) +
      metricCard('Government expenditure / GDP', displayMetric('governmentExpenditurePctGdp').value, '%', displayMetric('governmentExpenditurePctGdp').source) +
      metricCard('Trade balance', displayMetric('tradeBalanceUsd').value, 'USD', displayMetric('tradeBalanceUsd').source) +
      metricCard('Foreign-exchange reserves', displayMetric('fxReservesUsd').value, 'USD', displayMetric('fxReservesUsd').source) +
      '</div>' +
      renderCountryDataCoverage(value, generalRecord) +
      '<div class="ocov-domain-grid">' +
      panel('General country facts', 'Identity, geography, currency, languages, and country classifications.', '<ul class="ocov-list">' +
        (countryFacts.length ? countryFacts.join('') : '<li>General facts are not recorded yet.</li>') + '</ul>') +
      panel('Data coverage & missing fields', metricEntries.length
        ? (recordedMetricCount + ' of ' + metricEntries.length + ' registered indicators have recorded values.')
        : 'The country indicator register is not available yet.',
        '<p>' + (missingMetrics.length + ' indicators are currently not recorded or are not country-source observations.') + '</p>' +
        (missingMetrics.length ? '<details open><summary>Fields without a displayable source value (' + missingMetrics.length + ')</summary><ul class="ocov-list">' +
          missingMetrics.map(([key]) => '<li><strong>' + esc(fieldTitle(key)) + '</strong><span>' + esc(key) + '</span></li>').join('') +
          '</ul></details>' : '<p class="ocov-empty">All registered indicators have a displayable value.</p>')) +
      '</div>' +
      '</div>';
    panelEl.innerHTML = overviewHtml;
    panelEl.dataset.countryId = String(value);
    return true;
  }

  function setActiveTab() {
    // Backwards-compatible API: the active Cabinet view determines visibility,
    // not a separate Overview tab.
    activeTab = isExecutiveMinistryView() ? 'overview' : 'cabinet';
    ensureGovernmentOverviewMount();
    applyGovernmentViewState();
    if (isExecutiveMinistryView()) renderCountryOverview();
    return true;
  }

  function onClick(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return;
    const auditButton = target.closest('[data-ocov-audit-all]');
    if (auditButton) {
      event.preventDefault();
      const auditRoot = auditButton.closest('.ocov-country-data-audit');
      runCountryDataAudit(auditRoot?.querySelector?.('[data-ocov-audit-results]'));
      return;
    }
    if (target.closest('#cabinet-full-window .parchment-card-btn[data-ministry-id]')) {
      setActiveTab('cabinet');
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
    if (isExecutiveMinistryView()) renderCountryOverview();
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
      lastRenderedCountry
    };
  }

  function init() {
    if (initialized || !g.document) return initialized;
    initialized = true;
    if (!selectedCountry) selectedCountry = defaultCountry();
    g.document.addEventListener('click', onClick);
    g.document.addEventListener('change', onChange);

    const cabinet = g.document.getElementById('cabinet-full-window');
    if (cabinet && typeof g.MutationObserver === 'function') {
      const observer = new g.MutationObserver(() => {
        const mounted = ensureGovernmentOverviewMount();
        if (mounted) {
          applyGovernmentViewState();
          if (isExecutiveMinistryView()) renderCountryOverview();
        }
      });
      observer.observe(cabinet, { childList: true, subtree: true });
    }
    if (ensureGovernmentOverviewMount()) {
      applyGovernmentViewState();
      if (isExecutiveMinistryView()) renderCountryOverview();
    }

    g.addEventListener?.('OMEGA_COUNTRY_CONTEXT_CHANGED', onCountryContext);
    g.addEventListener?.('OMEGA_COUNTRY_BEHAVIOR_READY', () => {
      if (isExecutiveMinistryView()) renderCountryOverview();
    });
    g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED', () => {
      if (isExecutiveMinistryView()) renderCountryOverview();
    });
    Promise.resolve(runtime()?.ready).then(() => {
      if (isExecutiveMinistryView()) renderCountryOverview();
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
