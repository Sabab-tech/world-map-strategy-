/* OMEGA Country Behaviour Engine v1.0.0
 * Converts each country's registered indicators, gameplay-site inventory and
 * current simulation state into transparent decision modifiers.
 *
 * These are simulation heuristics, not claims about a real government's intent.
 * Missing evidence stays null; reserve quantities are never treated as real data.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0';
  if (g.OmegaCountryBehaviorEngine && g.OmegaCountryBehaviorEngine.VERSION === VERSION) return;

  const DIMENSIONS = Object.freeze([
    'riskAppetite', 'diplomaticPreference', 'fiscalDiscipline', 'mobilizationTolerance',
    'strategicTimeHorizon', 'tradeDependence', 'selfSufficiencyPriority', 'innovationPreference',
    'domesticStabilityPriority', 'escalationTolerance'
  ]);
  const state = { siteRows: null, siteStatus: 'NOT_LOADED', sitePromise: null, siteError: null };
  const num = v => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const clamp = (v, low, high) => {
    const n = num(v);
    return n === null ? null : Math.max(low === undefined ? 0 : low, Math.min(high === undefined ? 1 : high, n));
  };
  const id = v => String(v == null ? '' : v).trim().toUpperCase();
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => obj(o) && Object.prototype.hasOwnProperty.call(o, k);
  const clone = (v, seen) => {
    if (v === null || typeof v !== 'object') return v;
    seen = seen || new WeakMap();
    if (seen.has(v)) return seen.get(v);
    const out = Array.isArray(v) ? [] : {};
    seen.set(v, out);
    Object.keys(v).forEach(k => {
      if (k !== '__proto__' && k !== 'constructor' && typeof v[k] !== 'function' && v[k] !== undefined) {
        out[k] = clone(v[k], seen);
      }
    });
    return out;
  };
  const runtime = () => g.OmegaCountryRuntimeData || null;
  const identityBridge = () => g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || g.Omega?.CanonicalIdentity || null;
  const gameState = () => g.Game?.state || g.gameState || g.Omega?.Simulation?.state || {};

  function resolveIdentity(value) {
    let identity = null;
    try { identity = runtime()?.resolveCountry?.(value) || null; } catch (_) {}
    let canonical = null;
    try { canonical = identityBridge()?.resolveCountry?.(value) || null; } catch (_) {}
    const raw = identity || canonical?.raw || canonical || {};
    const countryCode = id(raw.countryCode || raw.iso2 || raw.code || '');
    const iso3 = id(raw.iso3 || raw.countryIso3 || (canonical && canonical.id) || '');
    const name = String(raw.name || raw.officialName || (typeof value === 'string' ? value : '')).trim();
    if (!countryCode && !iso3 && !name) return null;
    return {
      countryCode: countryCode || (iso3.length === 2 ? iso3 : ''),
      iso3: iso3.length === 3 ? iso3 : '',
      canonicalId: id(canonical?.id || iso3 || countryCode || name),
      name: name || iso3 || countryCode,
      officialName: String(raw.officialName || raw.name || name || ''),
      economyKey: id(raw.economyKey || ''),
      populationKey: id(raw.populationKey || '')
    };
  }

  function aliasKeys(identity) {
    return Array.from(new Set([
      identity?.canonicalId, identity?.iso3, identity?.countryCode,
      identity?.name, identity?.officialName, identity?.economyKey, identity?.populationKey
    ].map(id).filter(Boolean)));
  }

  function liveBucket(domain, identity) {
    const root = gameState();
    const bucketRoot = root && root[domain];
    if (!obj(bucketRoot)) return null;
    const keys = aliasKeys(identity);
    for (const key of keys) {
      if (own(bucketRoot, key) && obj(bucketRoot[key])) return bucketRoot[key];
    }
    const found = Object.keys(bucketRoot).find(k => keys.includes(id(k)));
    return found ? bucketRoot[found] : null;
  }

  function liveMetric(identity, domains, fields) {
    for (const domain of domains) {
      const bucket = liveBucket(domain, identity);
      if (!bucket) continue;
      for (const key of fields) {
        const value = num(bucket[key]);
        if (value !== null) return { value, source: 'LIVE_GAME_STATE.' + domain + '.' + key, key, status: 'LIVE' };
      }
    }
    return null;
  }

  function recordedMetric(profile, fields) {
    const sources = [
      ['indicators', profile?.indicators],
      ['metrics', profile?.metrics],
      ['sourceValues', profile?.sourceValues],
      ['populationValues', profile?.populationValues],
      ['profile', profile]
    ];
    for (const [label, container] of sources) {
      if (!obj(container)) continue;
      for (const key of fields) {
        const value = num(container[key]);
        if (value !== null) return {
          value, source: (profile?.provenance?.economicSource || 'economy_global_profiles_v1.json') + ':' + label + '.' + key,
          key, status: 'RECORDED_BASELINE'
        };
      }
    }
    return null;
  }

  function readMetric(identity, base, spec) {
    const live = liveMetric(identity, spec.domains || [], spec.live || spec.fields);
    if (live) return live;
    return recordedMetric(base, spec.fields || []);
  }

  function pct(value) {
    return value === null || value === undefined ? null : clamp(value / 100, 0, 1);
  }

  function loadSiteCatalog() {
    if (state.sitePromise) return state.sitePromise;
    if (typeof g.fetch !== 'function') {
      state.siteStatus = 'FETCH_UNAVAILABLE';
      return Promise.resolve(false);
    }
    state.siteStatus = 'LOADING';
    state.sitePromise = Promise.resolve().then(() => g.fetch('./resource_site_reserve_simulation_v1.json', { cache: 'default' }))
      .then(response => {
        if (!response || response.ok === false) throw new Error('RESOURCE_SITE_CATALOG_FETCH_FAILED');
        return response.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data.records)) throw new Error('RESOURCE_SITE_CATALOG_SCHEMA_INVALID');
        state.siteRows = data.records.filter(row => obj(row) && row.countryId && row.resourceId);
        state.siteStatus = 'AVAILABLE';
        state.siteError = null;
        try {
          if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
            g.dispatchEvent(new g.CustomEvent('OMEGA_COUNTRY_BEHAVIOR_READY', {
              detail: { version: VERSION, siteCatalogCount: state.siteRows.length }
            }));
          }
        } catch (_) {}
        return true;
      })
      .catch(error => {
        state.siteRows = null;
        state.siteStatus = 'UNAVAILABLE';
        state.siteError = String(error?.message || error);
        return false;
      });
    return state.sitePromise;
  }

  function getSiteStats(identity) {
    const endowment = g.OmegaResourceEndowmentRuntime || g.Omega?.ResourceEndowmentRuntime;
    let liveRows = null;
    if (endowment && typeof endowment.countryMineSiteReferences === 'function') {
      for (const key of [identity.iso3, identity.countryCode, identity.canonicalId, identity.name]) {
        if (!key) continue;
        try {
          const rows = endowment.countryMineSiteReferences(key);
          if (Array.isArray(rows) && rows.length) { liveRows = rows; break; }
        } catch (_) {}
      }
    }
    let rows = [];
    let source = null;
    if (state.siteRows) {
      rows = state.siteRows.filter(row => id(row.countryId) === id(identity.iso3) ||
        id(row.countryId) === id(identity.countryCode) || id(row.countryId) === id(identity.canonicalId));
      source = 'resource_site_reserve_simulation_v1.json';
    }
    if (liveRows) {
      const byId = new Map(rows.map(row => [String(row.siteId || row.id || ''), row]));
      liveRows.forEach(row => {
        const siteId = String(row.siteId || row.id || '');
        if (siteId) byId.set(siteId, row);
      });
      rows = Array.from(byId.values());
      source = source ? source + '+LIVE_SITE_REFERENCES' : 'LIVE_SITE_REFERENCES';
    }
    if (!source) return {
      availability: 'UNAVAILABLE', siteCount: null, resourceDiversity: null,
      resources: [], simulatedReserveQuantitiesUsed: false, source: null,
      reason: state.siteStatus === 'LOADING' || state.siteStatus === 'NOT_LOADED' ? 'SITE_CATALOG_LOADING' : state.siteError || 'SITE_CATALOG_UNAVAILABLE'
    };
    const usable = rows.filter(row => row && row.resourceId && row.commercialExtraction !== false);
    const resources = Array.from(new Set(usable.map(row => String(row.resourceId).trim()).filter(Boolean))).sort();
    return {
      availability: 'AVAILABLE', siteCount: usable.length, resourceDiversity: resources.length,
      resources, source, simulatedReserveQuantitiesUsed: false,
      interpretation: 'Counts registered gameplay site identities only; simulated reserve quantities are not factual national reserves.'
    };
  }

  function firstValue(values) {
    for (const item of values) if (item && item.value !== null && item.value !== undefined && Number.isFinite(item.value)) return item;
    return null;
  }

  function averageEvidence(entries) {
    const valid = entries.filter(item => item && item.value !== null && Number.isFinite(item.value));
    if (!valid.length) return null;
    return {
      value: valid.reduce((sum, item) => sum + item.value, 0) / valid.length,
      evidence: valid.flatMap(item => item.evidence || []),
      confidence: Math.min(0.95, 0.3 + 0.16 * valid.length)
    };
  }

  function buildProfile(value) {
    const identity = resolveIdentity(value);
    if (!identity) return null;
    const rt = runtime();
    let base = null;
    let strategic = null;
    try { base = rt?.getProfile?.(value) || rt?.getProfile?.(identity.iso3) || rt?.getProfile?.(identity.countryCode) || null; } catch (_) {}
    try { strategic = rt?.getStrategicProfile?.(value) || rt?.getStrategicProfile?.(identity.iso3) || null; } catch (_) {}

    const get = (name, fields, domains, liveFields) => readMetric(identity, base, { fields, domains, live: liveFields });
    const gdp = get('gdp', ['gdpCurrentUsd', 'gdp', 'grossDomesticProductUsd'], ['economy'], ['gdpCurrentUsd', 'gdp', 'gdpUsd', 'grossDomesticProduct']);
    const population = get('population', ['populationTotal', 'population2015', 'population_2015', 'population'], ['population', 'economy'], ['populationTotal', 'population', 'population_2015']);
    const growth = get('growth', ['gdpGrowthPct', 'gdp_growth', 'growthRatePct'], ['economy'], ['gdpGrowthPct', 'gdp_growth', 'growthRatePct']);
    const inflation = get('inflation', ['inflationRatePct', 'inflationPct', 'inflation'], ['economy', 'finance', 'monetary'], ['inflationRatePct', 'inflationPct', 'inflation']);
    const unemployment = get('unemployment', ['unemploymentRatePct', 'unemployment_rate', 'unemploymentPct'], ['economy', 'labor', 'population'], ['unemploymentRatePct', 'unemployment_rate', 'unemployment']);
    const debtNominal = get('debt', ['publicDebtUsd', 'publicDebt', 'debt'], ['finance'], ['publicDebtUsd', 'publicDebt', 'debt', 'totalDebt']);
    const debtRatioRecorded = get('debtRatio', ['publicDebtToGdpPct', 'debtToGdpPct'], ['finance'], ['publicDebtToGdpPct', 'debtToGdpPct']);
    const budgetNominal = get('budgetBalance', ['governmentBudgetBalanceUsd', 'budget_balance', 'budgetBalance'], ['finance'], ['governmentBudgetBalanceUsd', 'budgetBalance', 'budget_balance']);
    const budgetRatioRecorded = get('budgetRatio', ['budgetBalanceToGdpPct', 'budgetBalancePctGdp'], ['finance'], ['budgetBalanceToGdpPct', 'budgetBalancePctGdp']);
    const tradeNominal = get('tradeBalance', ['tradeBalanceUsd', 'trade_balance', 'tradeBalance'], ['trade', 'economy'], ['tradeBalanceUsd', 'tradeBalance', 'trade_balance', 'balance']);
    const tradeRatioRecorded = get('tradeRatio', ['tradeBalanceToGdpPct', 'tradeBalancePctGdp'], ['trade', 'economy'], ['tradeBalanceToGdpPct', 'tradeBalancePctGdp']);
    const exports = get('exports', ['exportsUsd', 'exports'], ['trade'], ['exportsUsd', 'exports', 'exportValue']);
    const imports = get('imports', ['importsUsd', 'imports'], ['trade'], ['importsUsd', 'imports', 'importValue']);
    const internet = get('internet', ['internetUsersPct', 'internetUsersPercent', 'internetUsers'], ['technology', 'infrastructure', 'economy'], ['internetUsersPct', 'internetUsersPercent', 'internetUsers']);
    const electricity = get('electricity', ['electricityAccessPct', 'electricityAccess'], ['infrastructure', 'energy', 'economy'], ['electricityAccessPct', 'electricityAccess']);
    const reserves = get('reserves', ['foreignExchangeReservesUsd', 'fxReservesUsd', 'reserves'], ['finance'], ['foreignExchangeReservesUsd', 'fxReservesUsd', 'reserves']);

    const debtRatio = debtRatioRecorded || (debtNominal && gdp && gdp.value > 0
      ? { value: debtNominal.value / gdp.value * 100, source: 'DERIVED_FROM_LIVE_OR_BASELINE_DEBT_AND_GDP', key: 'publicDebtToGdpPct', status: 'DERIVED' } : null);
    const budgetRatio = budgetRatioRecorded || (budgetNominal && gdp && gdp.value > 0
      ? { value: budgetNominal.value / gdp.value * 100, source: 'DERIVED_FROM_LIVE_OR_BASELINE_BUDGET_BALANCE_AND_GDP', key: 'budgetBalanceToGdpPct', status: 'DERIVED' } : null);
    const tradeRatio = tradeRatioRecorded || (tradeNominal && gdp && gdp.value > 0
      ? { value: tradeNominal.value / gdp.value * 100, source: 'DERIVED_FROM_LIVE_OR_BASELINE_TRADE_BALANCE_AND_GDP', key: 'tradeBalanceToGdpPct', status: 'DERIVED' } : null);

    const fiscalRisk = get('fiscalRisk', ['fiscalRiskIndex'], ['finance', 'economy'], ['fiscalRiskIndex']);
    const govEffect = strategic?.politics?.governmentEffectivenessWgiEstimate != null
      ? { value: num(strategic.politics.governmentEffectivenessWgiEstimate), source: 'COUNTRY_STRATEGIC_PROFILE_V2.politics.governmentEffectivenessWgiEstimate', key: 'governmentEffectivenessWgiEstimate', status: 'REGISTERED_PROFILE' }
      : firstValue([
        recordedMetric(base, ['governmentEffectivenessWgiEstimate']),
        liveMetric(identity, ['governance'], ['governmentEffectivenessWgiEstimate'])
      ]);
    const politicalStability = strategic?.politics?.politicalStabilityWgiEstimate != null
      ? { value: num(strategic.politics.politicalStabilityWgiEstimate), source: 'COUNTRY_STRATEGIC_PROFILE_V2.politics.politicalStabilityWgiEstimate', key: 'politicalStabilityWgiEstimate', status: 'REGISTERED_PROFILE' }
      : firstValue([
        recordedMetric(base, ['politicalStabilityWgiEstimate']),
        liveMetric(identity, ['governance'], ['politicalStabilityWgiEstimate'])
      ]);
    const militaryPct = num(strategic?.military?.militaryExpenditurePctGdp) !== null
      ? { value: num(strategic.military.militaryExpenditurePctGdp), source: 'COUNTRY_STRATEGIC_PROFILE_V2.military.militaryExpenditurePctGdp', key: 'militaryExpenditurePctGdp', status: 'REGISTERED_PROFILE' }
      : firstValue([
        recordedMetric(base, ['militaryExpenditurePctGdp']),
        liveMetric(identity, ['defense', 'military'], ['militaryExpenditurePctGdp', 'defenseSpendingPctGdp'])
      ]);

    const macro = {
      gdpUsd: gdp?.value ?? null,
      population: population?.value ?? null,
      gdpGrowthPct: growth?.value ?? null,
      inflationPct: inflation?.value ?? null,
      unemploymentPct: unemployment?.value ?? null,
      debtToGdpPct: debtRatio?.value ?? null,
      budgetBalanceToGdpPct: budgetRatio?.value ?? null,
      tradeBalanceUsd: tradeNominal?.value ?? null,
      tradeBalanceToGdpPct: tradeRatio?.value ?? null,
      exportsUsd: exports?.value ?? null,
      importsUsd: imports?.value ?? null,
      fxReservesUsd: reserves?.value ?? null,
      internetUsersPct: internet?.value ?? null,
      electricityAccessPct: electricity?.value ?? null,
      militaryExpenditurePctGdp: militaryPct?.value ?? null,
      governmentEffectivenessWgiEstimate: govEffect?.value ?? null,
      politicalStabilityWgiEstimate: politicalStability?.value ?? null,
      fiscalRiskIndex: fiscalRisk?.value ?? null
    };
    const evidenceByMetric = {
      gdpUsd: gdp, population, gdpGrowthPct: growth, inflationPct: inflation,
      unemploymentPct: unemployment, debtToGdpPct: debtRatio, budgetBalanceToGdpPct: budgetRatio,
      tradeBalanceToGdpPct: tradeRatio, exportsUsd: exports, importsUsd: imports, fxReservesUsd: reserves,
      internetUsersPct: internet, electricityAccessPct: electricity, militaryExpenditurePctGdp: militaryPct,
      governmentEffectivenessWgiEstimate: govEffect, politicalStabilityWgiEstimate: politicalStability,
      fiscalRiskIndex: fiscalRisk
    };
    const evidenceCount = Object.values(evidenceByMetric).filter(x => x && x.value !== null && Number.isFinite(x.value)).length;
    const sites = getSiteStats(identity);

    const fiscalParts = [];
    if (debtRatio) fiscalParts.push({ value: clamp(Math.max(0, debtRatio.value) / 150), evidence: [{ metric: 'debtToGdpPct', value: debtRatio.value, source: debtRatio.source }] });
    if (budgetRatio) fiscalParts.push({ value: clamp(Math.max(0, -budgetRatio.value) / 20), evidence: [{ metric: 'budgetBalanceToGdpPct', value: budgetRatio.value, source: budgetRatio.source }] });
    if (inflation) fiscalParts.push({ value: clamp(Math.max(0, inflation.value) / 25), evidence: [{ metric: 'inflationPct', value: inflation.value, source: inflation.source }] });
    if (unemployment) fiscalParts.push({ value: clamp(Math.max(0, unemployment.value) / 30), evidence: [{ metric: 'unemploymentPct', value: unemployment.value, source: unemployment.source }] });
    if (fiscalRisk) fiscalParts.push({ value: clamp(fiscalRisk.value / 100), evidence: [{ metric: 'fiscalRiskIndex', value: fiscalRisk.value, source: fiscalRisk.source }] });
    const fiscalStress = averageEvidence(fiscalParts);

    const domesticParts = [];
    if (inflation) domesticParts.push({ value: clamp(Math.max(0, inflation.value) / 20), evidence: [{ metric: 'inflationPct', value: inflation.value, source: inflation.source }] });
    if (unemployment) domesticParts.push({ value: clamp(Math.max(0, unemployment.value) / 25), evidence: [{ metric: 'unemploymentPct', value: unemployment.value, source: unemployment.source }] });
    if (politicalStability) domesticParts.push({ value: clamp((2.5 - politicalStability.value) / 5), evidence: [{ metric: 'politicalStabilityWgiEstimate', value: politicalStability.value, source: politicalStability.source }] });
    if (growth) domesticParts.push({ value: clamp((2 - growth.value) / 12), evidence: [{ metric: 'gdpGrowthPct', value: growth.value, source: growth.source }] });
    const domesticStress = averageEvidence(domesticParts);

    const openness = gdp && gdp.value > 0 && exports && imports
      ? clamp((Math.max(0, exports.value) + Math.max(0, imports.value)) / gdp.value / 2) : null;
    const tradePressure = tradeRatio ? clamp(Math.max(0, -tradeRatio.value) / 30) : null;
    const govCapacity = govEffect ? clamp((govEffect.value + 2.5) / 5) : null;
    const growthCapacity = growth ? clamp((growth.value + 5) / 15) : null;
    const fiscalRoom = fiscalStress ? 1 - fiscalStress.value : null;
    const siteCapability = sites.availability === 'AVAILABLE'
      ? clamp(0.55 * Math.min(1, (sites.resourceDiversity || 0) / 6) + 0.45 * Math.min(1, (sites.siteCount || 0) / 12))
      : null;

    const dimensions = {};
    const setDim = (key, value, evidence, interpretation, confidence, source) => {
      const value01 = clamp(value);
      dimensions[key] = {
        value: value01 === null ? null : Number(value01.toFixed(3)),
        availability: value01 === null ? 'UNOBSERVED' : 'DERIVED_SIMULATION_POLICY',
        source: value01 === null ? null : (source || 'OMEGA_COUNTRY_BEHAVIOR_ENGINE_V1'),
        confidence: value01 === null ? 0 : Number(clamp(confidence == null ? 0.5 : confidence, 0, 1).toFixed(2)),
        evidence: value01 === null ? [] : clone(evidence || []),
        interpretation: value01 === null ? 'Not enough country-specific evidence to derive this dimension.' : interpretation
      };
    };
    const conf = count => Math.min(0.9, 0.28 + count * 0.14);

    setDim('fiscalDiscipline', fiscalStress ? 0.25 + 0.7 * fiscalStress.value : null,
      fiscalStress?.evidence, 'Priority to contain fiscal and price pressure; this is a game policy response, not a judgement of national virtue.',
      fiscalStress ? conf(fiscalParts.length) : 0);
    setDim('riskAppetite', fiscalStress ? 0.15 + 0.75 * (1 - fiscalStress.value) : (growthCapacity !== null ? 0.25 + 0.55 * growthCapacity : null),
      fiscalStress ? fiscalStress.evidence : (growth ? [{ metric: 'gdpGrowthPct', value: growth.value, source: growth.source }] : []),
      'Modelled fiscal room for discretionary or riskier commitments; not a claim about real-world leadership psychology.',
      fiscalStress ? conf(fiscalParts.length) : (growth ? 0.38 : 0));
    setDim('domesticStabilityPriority', domesticStress ? 0.25 + 0.7 * domesticStress.value : null,
      domesticStress?.evidence, 'Pressure-driven priority for price, jobs and stability; governance indicators remain separate observations.',
      domesticStress ? conf(domesticParts.length) : 0);
    setDim('tradeDependence', openness === null ? null : 0.2 + 0.75 * openness,
      openness === null ? [] : [
        { metric: 'exportsUsd', value: exports.value, source: exports.source },
        { metric: 'importsUsd', value: imports.value, source: imports.source },
        { metric: 'gdpUsd', value: gdp.value, source: gdp.source }
      ],
      'Trade-exposure proxy calculated only when GDP, exports and imports are all present; trade deficit alone is not treated as foreign dependence.',
      openness === null ? 0 : 0.72);
    setDim('selfSufficiencyPriority',
      siteCapability === null && tradePressure === null ? null :
        0.2 + 0.45 * (siteCapability === null ? 0.25 : siteCapability) + 0.35 * (tradePressure === null ? 0 : tradePressure),
      [
        ...(sites.availability === 'AVAILABLE' ? [{ metric: 'gameplaySiteCount', value: sites.siteCount, diversity: sites.resourceDiversity, source: sites.source, status: 'SIMULATION_SITE_CATALOGUE_ONLY' }] : []),
        ...(tradeRatio ? [{ metric: 'tradeBalanceToGdpPct', value: tradeRatio.value, source: tradeRatio.source }] : [])
      ],
      'Modelled incentive to build domestic processing, substitute inputs or protect supply chains. Site counts are game assets, not verified national reserves.',
      siteCapability !== null && tradePressure !== null ? 0.72 : 0.45);
    const innovationParts = [];
    if (internet) innovationParts.push({ value: clamp(internet.value / 100), evidence: [{ metric: 'internetUsersPct', value: internet.value, source: internet.source }] });
    if (electricity) innovationParts.push({ value: clamp(electricity.value / 100), evidence: [{ metric: 'electricityAccessPct', value: electricity.value, source: electricity.source }] });
    const innovation = averageEvidence(innovationParts);
    setDim('innovationPreference', innovation ? 0.25 + 0.65 * innovation.value : null, innovation?.evidence,
      'Investment-readiness proxy from observed digital/electricity access, not a measured national preference for innovation.',
      innovation ? conf(innovationParts.length) : 0);
    const horizonParts = [];
    if (govCapacity !== null) horizonParts.push({ value: govCapacity, evidence: [{ metric: 'governmentEffectivenessWgiEstimate', value: govEffect.value, source: govEffect.source }] });
    if (growthCapacity !== null) horizonParts.push({ value: growthCapacity, evidence: [{ metric: 'gdpGrowthPct', value: growth.value, source: growth.source }] });
    if (fiscalRoom !== null) horizonParts.push({ value: fiscalRoom, evidence: fiscalStress.evidence });
    const horizon = averageEvidence(horizonParts);
    setDim('strategicTimeHorizon', horizon ? 0.25 + 0.65 * horizon.value : null, horizon?.evidence,
      'Modelled capacity to sustain longer-term projects from recorded institutions, growth and fiscal pressure; not an observed national doctrine.',
      horizon ? conf(horizonParts.length) : 0);
    setDim('mobilizationTolerance', militaryPct ? 0.2 + 0.7 * clamp(militaryPct.value / 6) : null,
      militaryPct ? [{ metric: 'militaryExpenditurePctGdp', value: militaryPct.value, source: militaryPct.source }] : [],
      'Defence-budget-effort proxy only. It does not establish personnel, readiness, equipment, logistics or willingness to escalate.',
      militaryPct ? 0.48 : 0);
    const diplomacy = strategic?.diplomacy || {};
    const parameters = obj(diplomacy.parameters) ? diplomacy.parameters : {};
    const evidenceMode = String(diplomacy.evidenceMode || '');
    const hasSpecificDiplomacyModel = evidenceMode === 'COUNTRY_SPECIFIC_LEGACY_GAME_PARAMETERS' ||
      String(diplomacy.relationProfileStatus || '') === 'COUNTRY_SPECIFIC_PARAMETERS';
    const cooperationSignals = Object.entries(parameters)
      .filter(([key, value]) => hasSpecificDiplomacyModel && num(value) !== null && /AID|DEPENDENCY|SANCTION|ECON_SECURITY|TRADE/i.test(key))
      .map(([key, value]) => ({ metric: key, value: num(value), source: 'COUNTRY_SPECIFIC_OMEGA_RELATION_MODEL' }));
    const cooperation = averageEvidence(cooperationSignals.map(item => ({ value: clamp(item.value / 100), evidence: [item] })));
    const diplomaticValue = cooperation ? 0.25 + 0.65 * cooperation.value :
      (openness === null ? null : 0.3 + 0.55 * openness);
    setDim('diplomaticPreference', diplomaticValue,
      cooperation ? cooperation.evidence : (openness === null ? [] : [{ metric: 'tradeOpennessProxy', value: openness, source: 'exports+imports / GDP' }]),
      cooperation ? 'Cooperation incentive from country-specific OMEGA model signals; those signals are game-model inputs, not verified diplomatic facts.' :
        'Economic openness is used only as a low-confidence cooperation proxy; no alliance, treaty or diplomatic posture is inferred.',
      cooperation ? 0.56 : (openness === null ? 0 : 0.4));
    const explicitEscalation = num(diplomacy.escalationTolerance ?? diplomacy.parameters?.escalationTolerance);
    setDim('escalationTolerance', explicitEscalation === null ? null : (explicitEscalation > 1 ? explicitEscalation / 100 : explicitEscalation),
      explicitEscalation === null ? [] : [{ metric: 'escalationTolerance', value: explicitEscalation, source: 'EXPLICIT_COUNTRY_STRATEGIC_PROFILE' }],
      'Explicitly registered game-doctrine value only; it is not synthesized from military spending or generic diplomatic defaults.',
      explicitEscalation === null ? 0 : 0.85,
      'COUNTRY_PROFILE_EXPLICIT_POLICY');

    const priorities = [];
    if (fiscalStress && fiscalStress.value >= 0.55) priorities.push({
      domain: 'ECONOMY', priority: 1, title: 'Reduce the strongest fiscal or price pressure',
      basis: 'REGISTERED_MACRO_INDICATORS', evidence: fiscalStress.evidence
    });
    if (domesticStress && domesticStress.value >= 0.5) priorities.push({
      domain: 'DOMESTIC_STABILITY', priority: 2, title: 'Prioritise jobs, prices and domestic stability',
      basis: 'REGISTERED_MACRO_AND_GOVERNANCE_SIGNALS', evidence: domesticStress.evidence
    });
    if (sites.availability === 'AVAILABLE' && sites.siteCount > 0) priorities.push({
      domain: 'RESOURCES_AND_INDUSTRY', priority: 3, title: 'Connect registered resource sites to processing and logistics',
      basis: 'SIMULATION_SITE_CATALOGUE', evidence: [{ metric: 'gameplaySiteCount', value: sites.siteCount, source: sites.source }]
    });
    if (sites.availability === 'AVAILABLE' && sites.siteCount === 0 && tradePressure !== null && tradePressure > 0.3) priorities.push({
      domain: 'SUPPLY_SECURITY', priority: 3, title: 'Review supplier diversity and import-substitution options',
      basis: 'TRADE_PRESSURE_PLUS_GAME_SITE_CATALOGUE', evidence: [{ metric: 'tradeBalanceToGdpPct', value: tradeRatio.value, source: tradeRatio.source }]
    });
    if (innovation && innovation.value >= 0.65) priorities.push({
      domain: 'TECHNOLOGY', priority: 4, title: 'Use the recorded digital and electricity-access base to support productivity investment',
      basis: 'REGISTERED_ACCESS_INDICATORS', evidence: innovation.evidence
    });
    if (militaryPct && militaryPct.value >= 3) priorities.push({
      domain: 'DEFENSE', priority: 5, title: 'Balance defence-budget effort against fiscal and civilian requirements',
      basis: 'MILITARY_EXPENDITURE_SHARE_ONLY', evidence: [{ metric: 'militaryExpenditurePctGdp', value: militaryPct.value, source: militaryPct.source }]
    });
    if (!priorities.length) priorities.push({
      domain: 'EVIDENCE', priority: 1, title: 'Improve country evidence before high-cost commitments',
      basis: 'LIMITED_OR_NON-COMPARABLE_EVIDENCE', evidence: []
    });

    const dynamicArchetype = strategic?.archetype || (
      (evidenceCount < 2 && (!sites.siteCount || sites.siteCount === 0)) ? 'INSUFFICIENT EVIDENCE' :
      sites.availability === 'AVAILABLE' && sites.resourceDiversity >= 3 && sites.siteCount >= 4 ? 'RESOURCE-DIVERSE GAMEPLAY ECONOMY' :
      openness !== null && openness >= 0.7 ? 'TRADE-EXPOSED ECONOMY' :
      fiscalStress && fiscalStress.value >= 0.62 ? 'MACRO-PRESSURE STATE' :
      gdp && gdp.value > 0 && population && population.value > 0 && gdp.value / population.value >= 25000 ? 'HIGH-INCOME-CAPACITY ECONOMY' :
      'DEVELOPMENT-FOCUSED ECONOMY'
    );
    const availableDimensions = DIMENSIONS.filter(key => dimensions[key]?.value !== null);
    const nonResourceDimensions = availableDimensions.filter(key => key !== 'selfSufficiencyPriority');
    const profileStatus = evidenceCount === 0 && nonResourceDimensions.length === 0
      ? 'INSUFFICIENT_EVIDENCE' : (availableDimensions.length >= 4 ? 'PARTIAL_EVIDENCE_PROFILE' : 'LIMITED_EVIDENCE_PROFILE');
    return {
      schemaVersion: 'OMEGA_COUNTRY_BEHAVIOR_PROFILE_V1',
      engineVersion: VERSION,
      countryId: identity.canonicalId,
      identity: clone(identity),
      status: profileStatus,
      classificationStatus: strategic?.archetype ? 'COUNTRY_PROFILE_REGISTERED_CLASSIFICATION' : 'DERIVED_GAMEPLAY_ARCHETYPE',
      archetype: dynamicArchetype,
      strategicProfileVersion: strategic?.profileVersion || null,
      evidence: {
        registeredMacroMetricCount: evidenceCount,
        derivedDimensionCount: availableDimensions.length,
        availableDimensions,
        baselineSource: base?.provenance?.economicSource || 'economy_global_profiles_v1.json',
        baselineStatus: base?.provenance?.status || base?.profileStatus || 'SOURCE_STATUS_NOT_RECORDED',
        strategicProfileAvailable: !!strategic,
        resourceSiteCatalogStatus: sites.availability,
        missingDataPolicy: 'UNOBSERVED_VALUES_REMAIN_NULL; NO DEFAULT COUNTRY SCORE',
        limitations: [
          'Behaviour dimensions are simulation decision modifiers, not verified descriptions of government intentions.',
          'The local macroeconomic baseline is game data and has not been independently revalidated by this engine.',
          'Registered resource sites are gameplay assets; simulated reserve quantities are not used as real-world facts.',
          'Military spending is contextual budget effort, not evidence of combat readiness or force capability.',
          'Trade balance alone does not prove dependence on a named foreign supplier.'
        ]
      },
      metrics: clone(macro),
      metricSources: Object.fromEntries(Object.entries(evidenceByMetric).filter(([, v]) => v).map(([k, v]) => [k, { value: v.value, source: v.source, status: v.status || 'RECORDED' }])),
      dimensions: clone(dimensions),
      domainSignals: {
        economy: { fiscalStress: fiscalStress?.value ?? null, domesticStress: domesticStress?.value ?? null, tradeOpennessProxy: openness, tradeDeficitPressure: tradePressure },
        resources: clone(sites),
        diplomacy: {
          evidenceMode: diplomacy.evidenceMode || 'NO_REGISTERED_COUNTRY_SPECIFIC_DIPLOMACY_PROFILE',
          strategicPosture: hasSpecificDiplomacyModel ? diplomacy.strategicPosture || null : 'NOT_ESTABLISHED',
          countrySpecificModelParameters: hasSpecificDiplomacyModel,
          cooperationSignalCount: cooperationSignals.length
        },
        military: { expenditurePctGdp: militaryPct?.value ?? null, status: militaryPct ? 'BUDGET_EFFORT_ONLY' : 'NO_COMPARABLE_MILITARY_INDICATOR' },
        politics: {
          governmentEffectivenessWgiEstimate: govEffect?.value ?? null,
          politicalStabilityWgiEstimate: politicalStability?.value ?? null,
          regimeClassification: strategic?.politics?.politicalSystemClassification || 'NOT_CLASSIFIED',
          status: strategic?.politics?.classificationStatus || 'GOVERNANCE_INDICATORS_ARE_NOT_A_REGIME_LABEL'
        },
        dependencies: {
          registeredSignals: clone(strategic?.dependencies?.modelSignals || []),
          namedSupplierDependenceMeasured: false,
          status: Array.isArray(strategic?.dependencies?.modelSignals) && strategic.dependencies.modelSignals.length
            ? 'GAME_MODEL_SIGNALS_AVAILABLE_NOT_VERIFIED_DEPENDENCE' : 'NAMED_DEPENDENCY_DATA_NOT_REGISTERED'
        }
      },
      priorityStack: priorities.sort((a, b) => a.priority - b.priority).map(item => ({ ...item, evidence: clone(item.evidence) }))
    };
  }

  function getBehaviorProfile(value) {
    try { return buildProfile(value); } catch (error) {
      return {
        schemaVersion: 'OMEGA_COUNTRY_BEHAVIOR_PROFILE_V1', engineVersion: VERSION,
        countryId: id(value), status: 'ENGINE_ERROR', archetype: 'UNCLASSIFIED',
        dimensions: Object.fromEntries(DIMENSIONS.map(key => [key, { value: null, availability: 'UNOBSERVED', confidence: 0, source: null, evidence: [], interpretation: 'Profile could not be computed.' }])),
        evidence: { error: String(error?.message || error), missingDataPolicy: 'UNOBSERVED_VALUES_REMAIN_NULL' },
        priorityStack: []
      };
    }
  }

  function diagnostics() {
    const list = runtime()?.listProfiles?.();
    return {
      version: VERSION,
      canonicalProfileCount: Array.isArray(list) ? list.length : null,
      siteCatalogStatus: state.siteStatus,
      siteCatalogCount: Array.isArray(state.siteRows) ? state.siteRows.length : null,
      siteCatalogError: state.siteError,
      dimensionCount: DIMENSIONS.length,
      profilePolicy: 'EVIDENCE_BACKED_HEURISTICS; NO_HARDCODED_PER_COUNTRY_SCORE'
    };
  }

  const API = Object.freeze({
    VERSION, DIMENSIONS, init: loadSiteCatalog, getBehaviorProfile, diagnostics
  });
  g.Omega = g.Omega || {};
  g.Omega.CountryBehaviorEngine = API;
  g.OmegaCountryBehaviorEngine = API;
  loadSiteCatalog();
})(typeof window !== 'undefined' ? window : globalThis);
