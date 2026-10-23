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
  let activeTab = 'overview';
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
    if (n === null) return 'Not recorded';
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
    const gateway = g.OmegaCountryDataGateway || g.Omega?.CountryDataGateway || null;
    const sharedSnapshot = gateway?.getSnapshot?.(value) || null;
    const sharedHasCountry = !!(sharedSnapshot && sharedSnapshot.countryCode);
    const sharedMetric = (key, fallback) => {
      if (!sharedHasCountry) return { value: null, source: 'No published observation recorded' };
      const row = sharedSnapshot.fields?.[key];
      if (!row || row.status !== 'AVAILABLE' || num(row.value) === null)
        return { value: null, source: 'No published observation recorded' };
      return { value: num(row.value), source: [row.sourceName || row.sourceId || row.authority || 'REGISTERED SOURCE', row.year ? 'Year ' + row.year : null].filter(Boolean).join(' · ') };
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
      : '<p class="ocov-empty">No evidence-backed priority is available yet.</p>';

    const overviewHtml =
      '<div class="ocov-shell">' +
      '<div class="ocov-toolbar"><label for="ocov-country-select">Viewed country</label>' +
      '<select id="ocov-country-select" aria-label="Choose country">' + countryOptions(value) + '</select>' +
      '</div>' +
      '<section class="ocov-hero"><div class="ocov-hero-id"><span class="ocov-flag">' + esc(flag) + '</span><div>' +
      '<div class="ocov-eyebrow">OMEGA / COUNTRY PROFILE</div><h2>' + esc(name) + '</h2>' +
      '<p>' + esc(countryCode) + '</p></div></div>' +
      '<p class="ocov-summary">National indicators below retain their recorded source and observation year. Missing values are marked Not recorded.</p>' +
      '</section>' +
      '<div class="ocov-section-heading"><span>01</span><div><h3>Economic baseline</h3><p>National indicators with recorded source and year.</p></div></div>' +
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
      '<div class="ocov-section-heading"><span>02</span><div><h3>National institutions and context</h3><p>Country-specific context, institutions and strategic options.</p></div></div>' +
      '<div class="ocov-domain-grid">' +
      panel('Economic structure & development', 'Sector and trade details are shown only when registered in the country profile.',
        bulletList(
          evidenceItems(strategic?.economy?.tradePosition, 'Trade position')
            .concat(evidenceItems(strategic?.economy?.sectorProfile, 'Sector profile'))
            .concat(evidenceItems(strategic?.economy?.developmentSignals, 'Development signal')),
          'No separate sector or development-profile data is registered.')) +
      panel('Diplomacy & foreign relations', 'Country-specific foreign relations and priorities, when recorded.',
        '' +
        bulletList(arr(diplomacy.tendencies).concat(arr(diplomacy.highWeightFocus).map(x => 'Priority: ' + x))
          .concat(arr(diplomacy.cooperationSignals), arr(diplomacy.pressurePoints),
            arr(diplomacy.leverageSignals)),
          'No country-specific diplomatic behaviour was verified by available model evidence.') +
        '',
        'ocov-panel-diplomacy') +
      panel('Military context', 'Budget effort is not combat capability, readiness or equipment quality.',
        '<div class="ocov-single-metric"><strong>' + esc(compactNumber(militaryPct, '%')) + '</strong><span>military expenditure / GDP</span></div>' +
        '<p>' + esc(strategic?.military?.caveat || 'Operational force structure, readiness, equipment, sustainment and logistics require separate verified national data.') + '</p>' +
        bulletList(arr(strategic?.military?.strengthSignals).concat(arr(strategic?.military?.riskSignals),
          arr(strategic?.military?.capabilityGaps)),
          'No comparable force-capability estimate is recorded.'),
        'ocov-panel-military') +
      panel('Politics & institutions', 'Governance indicators are kept separate; no unsupported regime label.',
        '<div class="ocov-kpi-grid ocov-kpi-grid-small">' +
        metricCard('Government effectiveness', governmentEffectiveness, '', 'WGI estimate; scale is not 0–100') +
        metricCard('Political stability', politicalStability, '', 'WGI estimate; scale is not 0–100') +
        metricCard('Rule of law', strategicNumber(strategic, 'politics.ruleOfLawWgiEstimate'), '', 'WGI estimate; scale is not 0–100') +
        metricCard('Control of corruption', strategicNumber(strategic, 'politics.controlOfCorruptionWgiEstimate'), '', 'WGI estimate; scale is not 0–100') +
        '</div><p><strong>Political system:</strong> ' + esc(governance.regimeClassification || strategic?.politics?.politicalSystemClassification || 'Not recorded') + '</p>' +
        bulletList(arr(strategic?.politics?.governanceIndicatorPoints).concat(
          arr(strategic?.politics?.strengths), arr(strategic?.politics?.risks), arr(strategic?.politics?.limitations)),
          'No separately registered governance-risk points are available.'),
        'ocov-panel-politics') +
      panel('Dependencies & structural pressure', 'A signal tells the AI what to examine; it does not prove dependence on a named state.',
        bulletList(arr(strategic?.dependencies?.domains).concat(arr(strategic?.dependencies?.measurementGaps),
            arr(strategic?.economy?.pressurePoints)),
          'Named supplier, creditor and critical-import dependencies are not established in the available record.'),
        'ocov-panel-dependencies') +
      '</div>' +
      '<div class="ocov-domain-grid">' +
      panel('Country-specific strengths', 'Evidence-backed signals, not a single invented national score.',
        bulletList(strengths, 'No registered strength signal is available.')) +
      panel('Country-specific weaknesses & pressures', 'An unavailable field does not mean a country is weak.',
        bulletList(weaknesses, 'No registered weakness signal is available.')) +
      panel('Player advantages', 'Potential gameplay advantages grounded in the registered country profile.',
        bulletList(playerAdvantages, 'No country-specific player advantage has been established.')) +
      panel('Player challenges', 'Strategic challenges for the player; these are not automatic penalties.',
        bulletList(playerChallenges, 'No country-specific player challenge has been established.')) +
      panel('Registered strategic options', 'Country-specific strategic options recorded for this profile.',
        bulletList(registeredOptions, 'No separately registered strategic option is available.')) +
      panel('Recommended strategy from country profile', 'Recommendations are advice, not executed orders.',
        bulletList(recommendedStrategyItems, 'No separately registered country strategy recommendation is available.')) +
      '</div>' +
      '</div>';

    panelEl.innerHTML = overviewHtml;
    panelEl.dataset.countryId = String(value);
    panelEl.dataset.profileStatus = String(profileStatus);
    if (behaviorEngine() && typeof behaviorEngine().init === 'function') {
      Promise.resolve(behaviorEngine().init()).then(() => {
        if (activeTab === 'overview' && lastRenderedCountry === value &&
            (panelEl.dataset.resourceReady !== 'true')) {
          panelEl.dataset.resourceReady = 'true';
          renderCountryOverview();
        }
      }).catch(() => {});
    }
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
