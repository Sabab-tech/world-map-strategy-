/* OMEGA Ministry Country Overview UI v1.0.0
 * Shared, read-only country briefing mounted inside the existing ministry dashboard.
 * All facts come from the shared country runtime and runtime behavior engine.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0';
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
      escalationTolerance: 'Escalation tolerance'
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
    const sourceStatus = behavior?.evidence?.baselineStatus || base?.provenance?.status || 'SOURCE STATUS NOT RECORDED';

    const gdp = sourceNumber(base, ['gdpCurrentUsd', 'gdp', 'grossDomesticProductUsd']);
    const pop = sourceNumber(base, ['populationTotal', 'population2015', 'population_2015', 'population']);
    const growth = sourceNumber(base, ['gdpGrowthPct', 'gdp_growth', 'growthRatePct']);
    const inflation = sourceNumber(base, ['inflationRatePct', 'inflationPct', 'inflation']);
    const unemployment = sourceNumber(base, ['unemploymentRatePct', 'unemployment_rate', 'unemploymentPct']);
    const debtRatio = sourceNumber(base, ['publicDebtToGdpPct', 'debtToGdpPct']);
    const budget = sourceNumber(base, ['governmentBudgetBalanceUsd', 'budget_balance', 'budgetBalance']);
    const tradeRatio = sourceNumber(base, ['tradeBalanceToGdpPct', 'tradeBalancePctGdp']);
    const tradeBalance = sourceNumber(base, ['tradeBalanceUsd', 'trade_balance', 'tradeBalance']);
    const reserves = sourceNumber(base, ['foreignExchangeReservesUsd', 'fxReservesUsd', 'reserves']);
    const fx = num(base?.indicators?.foreignExchangeReservesUsd ?? base?.indicators?.fxReservesUsd ?? base?.sourceValues?.reserves);
    const militaryPct = strategicNumber(strategic, 'military.militaryExpenditurePctGdp') ??
      num(base?.indicators?.militaryExpenditurePctGdp);
    const governance = strategic?.politics || behavior?.domainSignals?.politics || {};
    const resources = behavior?.domainSignals?.resources || {};
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
      '<div class="ocov-section-heading"><span>01</span><div><h3>Economic baseline</h3><p>Recorded inputs, not invented national statistics.</p></div></div>' +
      '<div class="ocov-kpi-grid">' +
      metricCard('GDP', gdp.value, 'USD', gdp.source || 'economy baseline') +
      metricCard('Population', pop.value, 'people', pop.source || 'population baseline') +
      metricCard('GDP growth', growth.value, '%', growth.source || 'not recorded') +
      metricCard('Inflation', inflation.value, '%', inflation.source || 'not recorded') +
      metricCard('Unemployment', unemployment.value, '%', unemployment.source || 'not recorded') +
      metricCard('Public debt / GDP', debtRatio.value, '%', debtRatio.source || 'not recorded') +
      metricCard('Budget balance', budget.value, 'USD', budget.source || 'not recorded') +
      metricCard('Trade balance', tradeBalance.value, 'USD', tradeBalance.source || 'not recorded') +
      metricCard('Trade balance / GDP', tradeRatio.value, '%', tradeRatio.source || 'not recorded') +
      metricCard('Foreign-exchange reserves', fx ?? reserves.value, 'USD', reserves.source || 'not recorded') +
      '</div>' +
      '<div class="ocov-domain-grid">' +
      panel('Resources & industrial options', 'Gameplay assets only; reserve values are not treated as factual national geology.',
        '<div class="ocov-resource-stat"><strong>' + (num(resources.siteCount) === null ? 'NOT LOADED' : esc(resources.siteCount)) +
        '</strong><span>registered gameplay sites</span><strong>' +
        (num(resources.resourceDiversity) === null ? 'NOT LOADED' : esc(resources.resourceDiversity)) +
        '</strong><span>distinct resource identifiers</span></div>' +
        '<p class="ocov-source-line">Catalog status: ' + esc(resources.availability || 'UNKNOWN') + '</p>' +
        bulletList(arr(resources.resources).map(x => String(x)), 'No registered gameplay resource-site information for this country.'),
        'ocov-panel-resources') +
      panel('Diplomacy & foreign relations', 'Only named game-model signals are treated as country-specific.',
        '<p><strong>Evidence mode:</strong> ' + esc(diplomacy.evidenceMode || 'NOT ESTABLISHED') + '</p>' +
        '<p><strong>Modelled posture:</strong> ' + esc(diplomacy.strategicPosture || 'NOT ESTABLISHED') + '</p>' +
        bulletList(arr(diplomacy.tendencies).concat(arr(diplomacy.highWeightFocus).map(x => 'Priority: ' + x))
          .concat(arr(diplomacy.cooperationSignals)), 'No country-specific diplomatic behaviour was verified by available model evidence.') +
        (dependencies.status ? '<p><strong>Dependency status:</strong> ' + esc(dependencies.status) + '</p>' : ''),
        'ocov-panel-diplomacy') +
      panel('Military context', 'Budget effort is not combat capability, readiness or equipment quality.',
        '<div class="ocov-single-metric"><strong>' + esc(compactNumber(militaryPct, '%')) + '</strong><span>military expenditure / GDP</span></div>' +
        '<p>' + esc(strategic?.military?.caveat || 'Operational force structure, readiness, equipment, sustainment and logistics require separate verified runtime records.') + '</p>' +
        bulletList(arr(strategic?.military?.strengthSignals).concat(arr(strategic?.military?.riskSignals)),
          'No comparable force-capability estimate is recorded.'),
        'ocov-panel-military') +
      panel('Politics & institutions', 'Governance indicators are kept separate; no unsupported regime label.',
        '<div class="ocov-kpi-grid ocov-kpi-grid-small">' +
        metricCard('Government effectiveness', governance.governmentEffectivenessWgiEstimate, '', 'WGI estimate; scale is not 0–100') +
        metricCard('Political stability', governance.politicalStabilityWgiEstimate, '', 'WGI estimate; scale is not 0–100') +
        metricCard('Rule of law', strategicNumber(strategic, 'politics.ruleOfLawWgiEstimate'), '', 'WGI estimate; scale is not 0–100') +
        metricCard('Control of corruption', strategicNumber(strategic, 'politics.controlOfCorruptionWgiEstimate'), '', 'WGI estimate; scale is not 0–100') +
        '</div><p><strong>Political system:</strong> ' + esc(governance.regimeClassification || strategic?.politics?.politicalSystemClassification || 'NOT CLASSIFIED') + '</p>' +
        bulletList(arr(strategic?.politics?.risks), 'No separately registered governance-risk points are available.'),
        'ocov-panel-politics') +
      panel('Dependencies & structural pressure', 'A signal tells the AI what to examine; it does not prove dependence on a named state.',
        bulletList(arr(dependencies.modelSignals).concat(arr(strategic?.economy?.pressurePoints)),
          'Named supplier, creditor and critical-import dependencies are not established in the available record.'),
        'ocov-panel-dependencies') +
      '</div>' +
      '<div class="ocov-section-heading"><span>02</span><div><h3>Executable behaviour profile</h3><p>These dimensions flow into adaptive action scoring. They are simulation policies, not real-world intent labels.</p></div></div>' +
      '<div class="ocov-behaviour-summary"><span>Behaviour engine: ' + esc(behavior?.engineVersion || 'UNAVAILABLE') + '</span>' +
      '<span>Derived dimensions: ' + esc(behavior?.evidence?.derivedDimensionCount ?? arr(behavior?.evidence?.availableDimensions).length) + '/10</span>' +
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
      '</div>' +
      '<div class="ocov-section-heading"><span>03</span><div><h3>Priority stack</h3><p>Current candidate priorities generated from this country’s available evidence.</p></div></div>' +
      '<section class="ocov-panel"><div class="ocov-panel-body">' + priorityBody + '</div></section>' +
      panel('Evidence quality & limits', 'The simulation should not turn missing data into false certainty.',
        '<p><strong>Baseline source:</strong> ' + esc(base?.provenance?.economicSource || behavior?.evidence?.baselineSource || 'NOT RECORDED') + '</p>' +
        '<p><strong>Baseline status:</strong> ' + esc(sourceStatus) + '</p>' +
        bulletList(arr(behavior?.evidence?.limitations).concat(arr(strategic?.assessmentCriteria?.peerComparison ? [
          strategic.assessmentCriteria.peerComparison.rule,
          strategic.assessmentCriteria.peerComparison.interpretation
        ] : [])).concat(arr(strategic?.dataQuality?.limitations)),
          'Evidence limitations are not separately documented for this record.'),
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
      lastRenderedCountry
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
