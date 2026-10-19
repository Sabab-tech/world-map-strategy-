/* OMEGA FINANCIAL TRANSMISSION + MACRO STRESS RUNTIME v1.0.0
 * Connects Finance, FX, Government Banking, Macro Stability, trade pricing and national demand.
 * Source observations remain separate from game-rule assumptions. No real-world forecast claim.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0', YEAR_MS = 31536000000, HOUR_MS = 3600000, DAY_MS = 86400000;
  const MAX_HISTORY = 31;
  if (g.OmegaEconomicTransmissionRuntime && g.OmegaEconomicTransmissionRuntime.VERSION === VERSION) return;

  let finance = null, fx = null, banking = null, macro = null, profiles = [], byId = new Map(), rules = {}, rawCache = new Map();
  let store = null, initialized = false, initPromise = null, observer = null, renderQueued = false, eventBound = false;

  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function num(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = v => { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; } };
  function norm(v) { return String(v == null ? '' : v).normalize('NFKC').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ''); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function fmt(v, d) { const n = num(v); if (n === null) return 'N/A'; try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: d == null ? 2 : d }).format(n); } catch (_) { return String(n); } }
  function pct(v) { const n = num(v); return n === null ? 'N/A' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function indexText(v) { return num(v) === null ? 'N/A' : fmt(v, 1); }
  function dispatch(type, detail) {
    try { if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') g.dispatchEvent(new g.CustomEvent(type, { detail: clone(detail || {}) })); } catch (_) {}
  }
  function candidates() {
    const all = [g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state,
      g.Omega && g.Omega.World && g.Omega.World.state, g.Game && g.Game.state, g.gameState];
    return all.filter((s, i) => obj(s) && all.indexOf(s) === i);
  }
  function rootState() {
    const all = candidates();
    return all.find(s => obj(s.economy) && Object.keys(s.economy).length)
      || all.find(s => obj(s.finance) && Object.keys(s.finance).length) || all[0]
      || (g.gameState = { economy: {}, finance: {}, simulation: { turn: 0 } });
  }
  function currentTurn() {
    const s = rootState(), list = [s.simulation && s.simulation.turn, s.simulation && s.simulation.currentTurn, s.turn,
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn];
    for (const x of list) { const n = num(x); if (n !== null) return n; }
    return 0;
  }
  function profileId(p) { return norm(p && (p.iso3 || p.countryCode || p.code || p.iso2)); }
  function resolveProfile(v) {
    if (!v) return null;
    const key = norm(v);
    return byId.get(key) || profiles.find(p => [p.name, p.iso3, p.countryCode, p.iso2, p.economyKey].some(x => x && norm(x) === key)) || null;
  }
  function activePlayer() {
    try { const p = finance && finance.getPlayerCountry && finance.getPlayerCountry(); if (p) return p; } catch (_) {}
    const s = rootState(), id = s.simulation && (s.simulation.session && s.simulation.session.playerCountryId || s.simulation.playerCountryId);
    return resolveProfile(id) || resolveProfile('BGD') || profiles[0] || null;
  }
  function rootTransmissionStore() {
    const root = rootState();
    if (!obj(root.governmentBanking)) root.governmentBanking = {};
    const bank = root.governmentBanking;
    if (!obj(bank.economicTransmissionByCountry)) bank.economicTransmissionByCountry = {};
    if (!obj(bank.monetaryStressByCurrency)) bank.monetaryStressByCurrency = {};
    if (!Array.isArray(bank.economicTransmissionLedger)) bank.economicTransmissionLedger = [];
    if (!obj(bank.economicTransmissionDiagnostics)) bank.economicTransmissionDiagnostics = { errors: [], turnCount: 0 };
    if (num(bank.nextEconomicTransmissionSequence) === null || bank.nextEconomicTransmissionSequence < 1) bank.nextEconomicTransmissionSequence = 1;
    return bank;
  }
  function sourceRaw(p) {
    const key = profileId(p);
    if (rawCache.has(key)) return rawCache.get(key);
    try { return macro && typeof macro.getRawProfile === 'function' ? macro.getRawProfile(p.iso3 || p.countryCode) : null; } catch (_) { return null; }
  }
  function firstValue(objects, keys) {
    for (const o of objects) {
      if (!obj(o)) continue;
      for (const k of keys) {
        const v = num(o[k]);
        if (v !== null) return { value: v, source: k };
      }
    }
    return { value: null, source: null };
  }
  function factRows(p) {
    const root = rootState(), eco = obj(root.economy) && p.economyKey && obj(root.economy[p.economyKey]) ? root.economy[p.economyKey] : {};
    const indicators = obj(p.indicators) ? p.indicators : {};
    const values = obj(p.sourceValues) ? p.sourceValues : {};
    const raw = sourceRaw(p) || {};
    const ri = obj(raw.rawIndicators) ? raw.rawIndicators : (obj(raw.indicators) ? raw.indicators : {});
    const sources = [eco, ri, indicators, values];
    const choose = (keys) => firstValue(sources, keys);
    const gdp = choose(['gdp','gdpCurrentUsd','nominalGdpUsd','gdp_usd','nominal_gdp_usd']);
    const growth = choose(['gdp_growth','gdpGrowthPct','gdpGrowthAnnualPct','gdpGrowthAnnualPct','gdpGrowthAnnual','gdp_growth_annual_pct']);
    const inflation = choose(['inflation','inflationRatePct','inflationAnnualPct','inflationAnnualPct','inflation_rate_pct']);
    const unemployment = choose(['unemployment_rate','unemploymentRatePct','unemployment_rate_pct']);
    const debt = choose(['debt','publicDebtUsd','public_debt_usd']);
    const trade = choose(['trade_balance','tradeBalanceUsd','trade_balance_usd']);
    const reserves = choose(['reserves','foreignExchangeReservesUsd','foreign_exchange_reserves_usd']);
    const imports = choose(['importsUsd','imports_usd','annualImportsUsd','annual_imports_usd','importsCurrentUsd']);
    const exports = choose(['exportsUsd','exports_usd','annualExportsUsd','annual_exports_usd']);
    const wageGrowth = choose(['averageWageGrowthAnnualPct','average_wage_growth_annual_pct','wageGrowthAnnualPct','wage_growth_annual_pct','nominalWageGrowthPct']);
    const currentAccount = choose(['currentAccountBalanceUsd','current_account_balance_usd']);
    const fxRate = p => {
      const code = fx && typeof fx.getCurrencyCode === 'function' ? fx.getCurrencyCode(p) : null;
      const r = code && fx && typeof fx.getRate === 'function' ? num(fx.getRate(code, 'SIMULATION')) : null;
      return { value: r, code: code || null, source: r === null ? null : 'OMEGA_SIMULATION_FX' };
    };
    let fiscal = null;
    try { fiscal = finance && finance.getFinanceState && finance.getFinanceState(p.countryCode || p.iso3); } catch (_) {}
    const gdpValue = gdp.value;
    const growthValue = growth.value ?? 0;
    const inflationValue = inflation.value ?? 0;
    const unemploymentValue = unemployment.value;
    const debtValue = debt.value;
    const tradeValue = trade.value;
    const reservesValue = reserves.value;
    const importValue = imports.value;
    const exportValue = exports.value;
    const rate = fxRate(p);
    const currentAccountValue = currentAccount.value;
    const wageGrowthValue = wageGrowth.value;
    let importExposurePct = null, importExposureSource = null;
    if (importValue !== null && gdpValue > 0) {
      importExposurePct = clamp(importValue / gdpValue * 100, Number(rules.minimumImportExposurePct || 3), Number(rules.maximumImportExposurePct || 90));
      importExposureSource = 'SOURCE_IMPORTS_TO_GDP_RATIO';
    } else {
      importExposurePct = Number(rules.defaultImportExposurePct || 25);
      importExposureSource = 'MODEL_ASSUMPTION_DEFAULT_IMPORT_EXPOSURE';
    }
    const currentAccountToGdp = currentAccountValue !== null && gdpValue > 0 ? currentAccountValue / gdpValue * 100 : null;
    const tradeToGdp = tradeValue !== null && gdpValue > 0 ? tradeValue / gdpValue * 100 : null;
    let capitalFlowToGdpPct = currentAccountToGdp, capitalFlowSource = currentAccountToGdp === null ? null : 'SOURCE_CURRENT_ACCOUNT_PROXY';
    if (capitalFlowToGdpPct === null && tradeToGdp !== null) {
      capitalFlowToGdpPct = tradeToGdp * 0.35;
      capitalFlowSource = 'MODEL_ASSUMPTION_TRADE_BALANCE_PROXY';
    }
    const reserveCoverMonths = reservesValue !== null && importValue !== null && importValue > 0 ? reservesValue / (importValue / 12) : null;
    let policy = null;
    try { policy = fx && fx.getPolicy && rate.code ? fx.getPolicy(rate.code) : null; } catch (_) {}
    return {
      raw, rawIndicators: ri, economy: eco, sourceValues: values,
      gdp: gdpValue, gdpSource: gdp.source || null,
      growthPct: growthValue, growthSource: growth.source || 'PROFILE_OR_MACRO_BASELINE',
      inflationPct: inflationValue, inflationSource: inflation.source || 'PROFILE_OR_MACRO_BASELINE',
      unemploymentPct: unemploymentValue, debtUsd: debtValue, tradeBalanceUsd: tradeValue, reservesUsd: reservesValue,
      importsUsd: importValue, exportsUsd: exportValue, wageGrowthPct: wageGrowthValue, wageGrowthSource: wageGrowth.source,
      annualSpendingUsd: num(fiscal && fiscal.fiscalModel && fiscal.fiscalModel.annualSpendingUsd),
      currencyCode: rate.code, localPerUsd: rate.value, currentAccountToGdpPct: currentAccountToGdp,
      tradeBalanceToGdpPct: tradeToGdp, capitalFlowToGdpPct: capitalFlowToGdpPct,
      capitalFlowSource: capitalFlowSource, reserveCoverMonths: reserveCoverMonths,
      importExposurePct: importExposurePct, importExposureSource: importExposureSource,
      policy: policy || {},
      assumptions: wageGrowthValue === null ? ['WAGE_GROWTH_PROXY_FROM_GDP_GROWTH'] : []
    };
  }
  function bankRiskProfile(p) {
    try { return banking && typeof banking.getRiskReport === 'function' ? banking.getRiskReport(p.iso3 || p.countryCode) : null; } catch (_) { return null; }
  }
  function macroTarget(p, facts) {
    const currency = facts.currencyCode;
    try {
      const fxPolicy = fx && fx.getPolicy && currency ? fx.getPolicy(currency) : null;
      if (num(fxPolicy && fxPolicy.inflationTargetPct) !== null) return num(fxPolicy.inflationTargetPct);
    } catch (_) {}
    try {
      const policy = macro && macro.getMacroState && macro.getMacroState(p.iso3 || p.countryCode);
      if (num(policy && policy.targetInflationPct) !== null) return num(policy.targetInflationPct);
    } catch (_) {}
    return num(rules.targetInflationPct) ?? 3;
  }
  function modelTemplate(p, facts, prior) {
    const base = prior || {};
    const spending = facts.annualSpendingUsd;
    const baseSpending = num(base.baseAnnualSpendingUsd) ?? spending;
    const baseGDP = num(base.baseGDPUsd) ?? facts.gdp;
    const baseFX = num(base.baseLocalPerUsd) ?? facts.localPerUsd;
    const baseUnemployment = num(base.baseUnemploymentPct) ?? facts.unemploymentPct;
    return {
      schemaVersion: VERSION, countryCode: profileId(p), countryName: p.name,
      baselineYear: Number(rules.baselineYear || 2015), baselineSource: 'EXISTING_GAME_FINANCE_AND_MACRO_STATE',
      lastProcessedTurn: num(base.lastProcessedTurn), lastHistoryDay: num(base.lastHistoryDay) ?? -1,
      baseGDPUsd: baseGDP, baseAnnualSpendingUsd: baseSpending, baseLocalPerUsd: baseFX,
      baseUnemploymentPct: baseUnemployment,
      cpiIndex: num(base.cpiIndex) ?? 100,
      nominalWageIndex: num(base.nominalWageIndex) ?? 100,
      importCostIndex: num(base.importCostIndex) ?? 100,
      producerCostIndex: num(base.producerCostIndex) ?? 100,
      nominalPublicSpendingIndex: num(base.nominalPublicSpendingIndex) ?? 100,
      lastLocalPerUsd: num(base.lastLocalPerUsd) ?? facts.localPerUsd,
      lastInflationPct: num(base.lastInflationPct) ?? facts.inflationPct,
      latest: obj(base.latest) ? clone(base.latest) : null,
      history: Array.isArray(base.history) ? base.history.slice(-MAX_HISTORY) : [],
      revision: num(base.revision) || 0, provenance: obj(base.provenance) ? clone(base.provenance) : {},
      assumptions: Array.isArray(base.assumptions) ? base.assumptions.slice() : [],
      initializedTurn: num(base.initializedTurn) ?? currentTurn()
    };
  }
  function updateOne(profile, turnNumber, dt, globalInflationPct, simDay) {
    if (!profile || !profile.economyKey) return null;
    const root = rootState(), bankStore = rootTransmissionStore(), id = profileId(profile);
    const facts = factRows(profile);
    if (facts.gdp === null || facts.gdp <= 0) {
      const previous = bankStore.economicTransmissionByCountry[id];
      if (previous) {
        previous.dataStatus = 'BASELINE_UNAVAILABLE';
        previous.lastProcessedTurn = turnNumber;
      }
      return previous || null;
    }
    const previous = obj(bankStore.economicTransmissionByCountry[id]) ? bankStore.economicTransmissionByCountry[id] : null;
    let model = modelTemplate(profile, facts, previous);
    const years = clamp(dt / YEAR_MS, 0, 2);
    if (num(model.lastProcessedTurn) !== null && turnNumber <= model.lastProcessedTurn) return model.latest;
    const targetInflation = macroTarget(profile, facts);
    const wageGrowthPct = facts.wageGrowthPct !== null
      ? clamp(facts.wageGrowthPct, Number(rules.minimumModeledWageGrowthPct || -30), Number(rules.maximumModeledWageGrowthPct || 50))
      : clamp(facts.growthPct * Number(rules.defaultWageGrowthShareOfGdpGrowth || 0.65), Number(rules.minimumModeledWageGrowthPct || -30), Number(rules.maximumModeledWageGrowthPct || 50));
    const wageSource = facts.wageGrowthPct !== null ? 'SOURCE_WAGE_GROWTH' : 'MODEL_ASSUMPTION_GDP_GROWTH_PROXY';
    const currentRate = facts.localPerUsd;
    const lastRate = num(model.lastLocalPerUsd);
    const currencyDepreciationPct = currentRate !== null && lastRate !== null && lastRate > 0 && currentRate > 0 && years > 0
      ? (Math.pow(currentRate / lastRate, 1 / years) - 1) * 100 : 0;
    const domesticInflation = clamp(facts.inflationPct, -95, 1000);
    const worldInflation = num(globalInflationPct) ?? 2;
    const importExposure = clamp((num(facts.importExposurePct) || 25) / 100,
      Number(rules.minimumImportExposurePct || 3) / 100, Number(rules.maximumImportExposurePct || 90) / 100);
    const bankState = rootState().governmentBanking || {};
    const countryTradePolicy = bankState.tradePolicies && bankState.tradePolicies[profileId(profile)] || {};
    const importTariffPct = clamp(num(countryTradePolicy.importTariffPct) ?? 0, 0, 80);
    const importInflation = clamp(worldInflation + currencyDepreciationPct + importTariffPct, -95, 1000);
    const configuredImportWeight = clamp(Number(rules.importProducerCostWeight || 0.35), 0.05, 0.8);
    const defaultExposure = clamp(Number(rules.defaultImportExposurePct || 25) / 100,
      Number(rules.minimumImportExposurePct || 3) / 100, Number(rules.maximumImportExposurePct || 90) / 100);
    const producerImportWeight = clamp(importExposure * configuredImportWeight / defaultExposure, 0.05, 0.8);
    const producerInflation = clamp(domesticInflation * (1 - producerImportWeight)
      + importInflation * producerImportWeight, -95, 1000);
    model.cpiIndex = Math.max(0.001, model.cpiIndex * Math.pow(Math.max(0.0001, 1 + domesticInflation / 100), years));
    model.nominalWageIndex = Math.max(0.001, model.nominalWageIndex * Math.pow(Math.max(0.0001, 1 + wageGrowthPct / 100), years));
    model.importCostIndex = Math.max(0.001, model.importCostIndex * Math.pow(Math.max(0.0001, 1 + importInflation / 100), years));
    model.producerCostIndex = Math.max(0.001, model.producerCostIndex * Math.pow(Math.max(0.0001, 1 + producerInflation / 100), years));
    if (facts.annualSpendingUsd !== null && model.baseAnnualSpendingUsd > 0)
      model.nominalPublicSpendingIndex = clamp(100 * facts.annualSpendingUsd / model.baseAnnualSpendingUsd, 0.001, 1e6);
    const realWageIndex = 100 * model.nominalWageIndex / model.cpiIndex;
    const unemployment = facts.unemploymentPct;
    const baseU = num(model.baseUnemploymentPct);
    const employmentFactor = unemployment !== null && baseU !== null
      ? clamp((100 - clamp(unemployment, 0, 99.9)) / Math.max(0.1, 100 - clamp(baseU, 0, 99.9)), 0.05, 5) : 1;
    const householdPowerIndex = realWageIndex * Math.pow(employmentFactor, Number(rules.householdEmploymentWeight || 0.35));
    const realGDPIndex = facts.gdp !== null && model.baseGDPUsd > 0 ? 100 * facts.gdp / model.baseGDPUsd * 100 / model.cpiIndex : null;
    const publicPurchasingPowerIndex = 100 * model.nominalPublicSpendingIndex * 100 / model.cpiIndex;
    const exportCompetitivenessIndex = currentRate !== null && model.baseLocalPerUsd !== null && model.baseLocalPerUsd > 0
      ? clamp(100 * currentRate / model.baseLocalPerUsd, 1, 100000) : null;
    const debtToGdpPct = facts.gdp > 0 && facts.debtUsd !== null ? facts.debtUsd / facts.gdp * 100 : null;
    const inflationGap = Math.max(0, domesticInflation - targetInflation);
    const realWageLoss = Math.max(0, 100 - realWageIndex);
    const importCostRise = Math.max(0, model.importCostIndex - 100);
    const unemploymentGap = unemployment === null ? null : Math.max(0, unemployment - Number(rules.targetUnemploymentPct || 6));
    const debtStress = debtToGdpPct === null ? 0 : Math.max(0, debtToGdpPct - 60) / 5;
    const fxDepStress = Math.max(0, currencyDepreciationPct);
    const weights = rules.weights || {};
    const stressNumerator = inflationGap * (num(weights.inflationGap) || 0.22)
      + realWageLoss * (num(weights.realWageLoss) || 0.23)
      + importCostRise * (num(weights.importCostIncrease) || 0.14)
      + (unemploymentGap || 0) * (num(weights.unemploymentGap) || 0.16)
      + debtStress * (num(weights.debtStress) || 0.12)
      + fxDepStress * (num(weights.currencyDepreciation) || 0.13);
    const dataConfidence = [facts.inflationPct, facts.unemploymentPct, debtToGdpPct, currentRate, facts.reservesUsd].filter(x => num(x) !== null).length;
    const stabilityIndex = clamp(100 - stressNumerator, 0, 100);
    const importedInputCostMultiplier = clamp(model.importCostIndex / 100, 0.4, 5);
    const producerCostMultiplier = clamp(model.producerCostIndex / 100, 0.5, 3);
    const purchasingPowerMultiplier = clamp(householdPowerIndex / 100, 0.2, 1.5);
    const importedGoodsInflationPct = importInflation;
    const sourceFacts = {
      gdp: facts.gdpSource || 'CURRENT_GAME_ECONOMY_OR_COUNTRY_PROFILE',
      inflation: facts.inflationSource || 'CURRENT_GAME_ECONOMY_OR_COUNTRY_PROFILE',
      wageGrowth: wageSource, importExposure: facts.importExposureSource,
      capitalFlow: facts.capitalFlowSource || 'NOT_AVAILABLE',
      reserveCoverMonths: facts.reserveCoverMonths === null ? 'NOT_AVAILABLE' : 'DERIVED_FROM_RESERVES_AND_IMPORTS'
    };
    model.assumptions = [...new Set([...(facts.assumptions || []),
      ...(facts.wageGrowthPct === null ? ['Nominal wage growth estimated at configured share of GDP growth; no wage data was fabricated.'] : []),
      ...(facts.importExposureSource === 'MODEL_ASSUMPTION_DEFAULT_IMPORT_EXPOSURE' ? ['Import exposure uses the configured gameplay default because source imports were unavailable.'] : []),
      ...(facts.capitalFlowSource === 'MODEL_ASSUMPTION_TRADE_BALANCE_PROXY' ? ['Capital-flow pressure uses a clearly marked trade-balance proxy.'] : [])
    ])];
    model.provenance = { sourceFacts, sourceDataYear: Number(rules.baselineYear || 2015), updatedTurn: turnNumber, dtMs: dt };
    model.latest = {
      countryCode: id, countryName: profile.name, turn: turnNumber,
      inflationPct: domesticInflation, targetInflationPct: targetInflation,
      currencyCode: facts.currencyCode, localPerUsd: currentRate,
      depreciationAnnualPct: currencyDepreciationPct, importInflationPct: importedGoodsInflationPct,
      cpiIndex: model.cpiIndex, nominalWageIndex: model.nominalWageIndex,
      realWageIndex: realWageIndex, householdPurchasingPowerIndex: householdPowerIndex,
      importCostIndex: model.importCostIndex, producerCostIndex: model.producerCostIndex,
      producerImportWeightPct: producerImportWeight * 100, importTariffPct: importTariffPct,
      nominalPublicSpendingIndex: model.nominalPublicSpendingIndex, realPublicPurchasingPowerIndex: publicPurchasingPowerIndex,
      realGDPIndex: realGDPIndex, exportCompetitivenessIndex: exportCompetitivenessIndex,
      unemploymentPct: unemployment, unemploymentGapPp: unemploymentGap,
      debtToGdpPct: debtToGdpPct, economicStabilityIndex: stabilityIndex,
      economicPressureIndex: 100 - stabilityIndex, dataConfidence: dataConfidence >= 4 ? 'MEDIUM' : 'LOW',
      importExposurePct: facts.importExposurePct, importExposureSource: facts.importExposureSource,
      wageGrowthPctUsed: wageGrowthPct, wageGrowthSource: wageSource,
      annualSpendingUsd: facts.annualSpendingUsd, gdpUsd: facts.gdp,
      capitalFlowToGdpPct: facts.capitalFlowToGdpPct, capitalFlowSource: facts.capitalFlowSource,
      reservesUsd: facts.reservesUsd, reserveCoverMonths: facts.reserveCoverMonths,
      assumptions: model.assumptions.slice(), provenance: clone(model.provenance)
    };
    model.lastProcessedTurn = turnNumber;
    model.lastInflationPct = domesticInflation;
    model.lastLocalPerUsd = currentRate;
    model.revision = (num(model.revision) || 0) + 1;
    bankStore.economicTransmissionByCountry[id] = clone(model);
    if (profile.economyKey && obj(root.economy) && obj(root.economy[profile.economyKey]))
      root.economy[profile.economyKey].financialTransmission = clone(model.latest);
    appendHistory(model, simDay, turnNumber);
    aggregateCurrencyStress(bankStore);
    return model.latest;
  }
  function appendHistory(model, simDay, turnNumber) {
    if (simDay === null || simDay <= (num(model.lastHistoryDay) ?? -1)) return;
    const d = Math.max(0, Math.floor(simDay));
    const row = Object.assign({ simulationDay: d, label: 'SIM DAY ' + String(d).padStart(3, '0') }, clone(model.latest || {}));
    model.history = [...(model.history || []), row].slice(-MAX_HISTORY);
    model.lastHistoryDay = d;
    const bankStore = rootTransmissionStore();
    bankStore.economicTransmissionByCountry[model.countryCode] = clone(model);
    bankStore.economicTransmissionLedger.push({
      sequence: Number(bankStore.nextEconomicTransmissionSequence++), countryCode: model.countryCode,
      turn: turnNumber, simulationDay: d, cpiIndex: row.cpiIndex, realWageIndex: row.realWageIndex,
      importCostIndex: row.importCostIndex, producerCostIndex: row.producerCostIndex,
      economicStabilityIndex: row.economicStabilityIndex
    });
    bankStore.economicTransmissionLedger = bankStore.economicTransmissionLedger.slice(-2048);
  }
  function currentSimulationDay() {
    try {
      const s = fx && fx.getState && fx.getState();
      const d = num(s && s.simulationDay);
      if (d !== null) return d;
    } catch (_) {}
    return Math.floor(currentTurn() / 24);
  }
  function globalInflationMean() {
    const vals = [];
    for (const p of profiles) {
      const e = rootState().economy && p.economyKey && rootState().economy[p.economyKey];
      const v = num(e && e.inflation) ?? num(p.indicators && p.indicators.inflationRatePct);
      if (v !== null) vals.push(v);
    }
    if (!vals.length) return 2;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  }
  function aggregateCurrencyStress(bankStore) {
    const grouped = {};
    for (const p of profiles) {
      const model = bankStore.economicTransmissionByCountry[profileId(p)];
      const latest = model && model.latest;
      if (!latest || !latest.currencyCode) continue;
      const gdp = Math.max(1, num(latest.gdpUsd) || 1);
      const confidence = 100 - (num(latest.economicPressureIndex) || 0);
      const flow = num(latest.capitalFlowToGdpPct);
      const reserveCover = num(latest.reserveCoverMonths);
      let policy = {};
      try { policy = fx && fx.getPolicy && fx.getPolicy(latest.currencyCode) || {}; } catch (_) {}
      const currentRate = num(latest.localPerUsd);
      const baseRate = num(model.baseLocalPerUsd);
      let pegAttack = 0;
      if (String(policy.currencyRegime || '').toUpperCase() === 'PEG') {
        const peg = num(policy.pegTargetLocalPerUsd);
        if (peg !== null && peg > 0 && currentRate !== null) {
          const deviation = Math.abs(currentRate / peg - 1) * 100;
          const band = num(policy.regimeBandPct) || 0.5;
          pegAttack = clamp((deviation - band) * 2, 0, 40);
        }
      }
      const code = String(latest.currencyCode).toUpperCase();
      if (!grouped[code]) grouped[code] = { weight: 0, flow: 0, flowWeight: 0, confidence: 0, reserve: 0, reserveWeight: 0, pegAttack: 0, rows: 0 };
      const item = grouped[code];
      item.weight += gdp; item.confidence += confidence * gdp; item.rows++;
      if (flow !== null) { item.flow += flow * gdp; item.flowWeight += gdp; }
      if (reserveCover !== null) { item.reserve += reserveCover * gdp; item.reserveWeight += gdp; }
      item.pegAttack = Math.max(item.pegAttack, pegAttack);
    }
    const out = {};
    for (const [code, x] of Object.entries(grouped)) {
      out[code] = {
        currencyCode: code,
        capitalFlowToGdpPct: x.flowWeight > 0 ? x.flow / x.flowWeight : null,
        confidenceIndex: x.weight > 0 ? x.confidence / x.weight : null,
        reserveCoverMonths: x.reserveWeight > 0 ? x.reserve / x.reserveWeight : null,
        pegAttackPressurePct: x.pegAttack,
        source: 'OMEGA_FINANCIAL_TRANSMISSION_SIMULATION',
        countryCount: x.rows, updatedTurn: currentTurn()
      };
    }
    bankStore.monetaryStressByCurrency = out;
  }
  function step(turnNumber, durationMs) {
    if (!initialized) return { ok: false, code: 'NOT_INITIALIZED' };
    const t = num(turnNumber) ?? currentTurn() + 1;
    if (store && num(store.lastProcessedTurn) !== null && t <= store.lastProcessedTurn)
      return { ok: true, duplicate: true, turn: t, processed: 0 };
    const dt = clamp(num(durationMs) ?? HOUR_MS, 0, 7 * DAY_MS);
    if (dt <= 0) return { ok: true, turn: t, processed: 0 };
    const averageInflation = globalInflationMean();
    const simDay = currentSimulationDay();
    const failures = [];
    let processed = 0;
    for (const p of profiles) {
      if (!p || !p.economyKey) continue;
      try {
        const result = updateOne(p, t, dt, averageInflation, simDay);
        if (result) processed++;
      } catch (error) {
        failures.push({ countryCode: profileId(p), error: String(error && error.message || error) });
      }
    }
    const bankStore = rootTransmissionStore();
    store = bankStore;
    bankStore.lastProcessedTurn = t;
    bankStore.economicTransmissionDiagnostics = {
      version: VERSION, turn: t, processedCountryCount: processed,
      failureCount: failures.length, errors: failures.slice(-16), historyDay: currentSimulationDay()
    };
    dispatch('OMEGA_ECONOMIC_TRANSMISSION_UPDATED', { version: VERSION, turn: t, processed, failureCount: failures.length });
    refreshPanel();
    return { ok: failures.length === 0, turn: t, processed, failureCount: failures.length, failures: failures.slice(0, 8) };
  }
  function getState(countryValue) {
    const p = resolveProfile(countryValue) || activePlayer();
    if (!p) return null;
    const bankStore = rootTransmissionStore();
    const item = bankStore.economicTransmissionByCountry[profileId(p)];
    if (!item) return null;
    return clone(item);
  }
  function getLatest(countryValue) {
    const item = getState(countryValue);
    return item && item.latest ? clone(item.latest) : null;
  }
  function getHistory(countryValue) {
    const item = getState(countryValue);
    return item && Array.isArray(item.history) ? clone(item.history) : [];
  }
  function getProducerCostMultiplier(countryValue) {
    const row = getLatest(countryValue);
    return row ? clamp((num(row.producerCostIndex) || 100) / 100, 0.5, 3) : 1;
  }
  function getImportCostMultiplier(countryValue) {
    const row = getLatest(countryValue);
    return row ? clamp((num(row.importCostIndex) || 100) / 100, 0.4, 5) : 1;
  }
  function getHouseholdPurchasingPowerMultiplier(countryValue) {
    const row = getLatest(countryValue);
    return row ? clamp((num(row.householdPurchasingPowerIndex) || 100) / 100, 0.2, 1.5) : 1;
  }
  function getPublicPurchasingPowerMultiplier(countryValue) {
    const row = getLatest(countryValue);
    return row ? clamp((num(row.realPublicPurchasingPowerIndex) || 100) / 100, 0.2, 2) : 1;
  }
  function getMonetaryStress(currencyCode) {
    const bankStore = rootTransmissionStore();
    const hit = bankStore.monetaryStressByCurrency && bankStore.monetaryStressByCurrency[String(currencyCode || '').toUpperCase()];
    return hit ? clone(hit) : null;
  }
  function runStressScenario(input) {
    input = obj(input) ? input : {};
    const p = resolveProfile(input.countryCode || input.countryId) || activePlayer();
    if (!p) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    const code = String(input.scenario || 'inflation-shock');
    const scenario = rules.scenarios && rules.scenarios[code];
    if (!scenario) return { ok: false, code: 'SCENARIO_UNKNOWN', scenarios: Object.keys(rules.scenarios || {}) };
    const before = getLatest(p), facts = factRows(p);
    if (!before || facts.localPerUsd === null) return { ok: false, code: 'MODEL_BASELINE_UNAVAILABLE' };
    const years = clamp(num(input.years) ?? 1, 1 / 365, 5);
    const us = resolveProfile('USA');
    const uf = us ? factRows(us) : null;
    const currency = facts.currencyCode, policy = facts.policy || {};
    const simPolicy = fx && fx.getPolicy && currency ? fx.getPolicy(currency) : {};
    const callDrift = fx && fx.math && fx.math.computeAnnualDrift;
    if (typeof callDrift !== 'function') return { ok: false, code: 'FX_STRESS_FORMULA_UNAVAILABLE' };
    const reservesBase = facts.reservesUsd;
    const reservesAfter = reservesBase === null ? null : Math.max(0, reservesBase * (1 - (num(scenario.reserveLossPct) || 0) / 100));
    const inflation = clamp(facts.inflationPct + (num(scenario.inflationDeltaPp) || 0), -5, 1000);
    const tradePct = (facts.tradeBalanceToGdpPct || 0) + (num(scenario.tradeSurplusDeltaPctGdp) || 0);
    const flowPct = (facts.capitalFlowToGdpPct || 0) + (num(scenario.capitalFlowDeltaPctGdp) || 0);
    const debtToGdp = facts.gdp > 0 && facts.debtUsd !== null ? facts.debtUsd / facts.gdp * 100 : 0;
    const reservesToGdp = facts.gdp > 0 && reservesAfter !== null ? reservesAfter / facts.gdp * 100 : 0;
    const cover = facts.importsUsd > 0 && reservesAfter !== null ? reservesAfter / (facts.importsUsd / 12) : facts.reserveCoverMonths;
    const confidence = clamp((num(getMonetaryStress(currency)?.confidenceIndex) ?? (100 - before.economicPressureIndex)) + (num(scenario.confidenceDelta) || 0), 0, 100);
    const usInflation = num(uf && uf.inflationPct) ?? 2;
    const usRate = num(uf && uf.policy && uf.policy.interestRateAnnualPct) ?? 3;
    const drift = callDrift({
      localInflationPct: inflation, usInflationPct: usInflation,
      localPolicyRatePct: (num(simPolicy.interestRateAnnualPct) ?? num(policy.interestRateAnnualPct) ?? 3) + (num(scenario.policyRateDeltaPp) || 0),
      usPolicyRatePct: usRate, localGrowthPct: facts.growthPct, usGrowthPct: num(uf && uf.growthPct) ?? 2,
      tradeBalanceToGdpPct: tradePct, debtToGdpPct: debtToGdp, reservesToGdpPct: reservesToGdp,
      moneySupplyGrowthPct: num(simPolicy.moneySupplyGrowthPct) ?? 0,
      capitalFlowToGdpPct: flowPct, confidenceIndex: confidence, reserveCoverMonths: cover,
      pegAttackPressurePct: num(scenario.pegAttackPressurePct) || 0, shockPct: 0
    });
    let nextRate = facts.localPerUsd * Math.pow(Math.max(0.0001, 1 + drift / 100), years);
    const regime = String(simPolicy.currencyRegime || 'MANAGED_FLOAT').toUpperCase();
    if (regime === 'MANAGED_FLOAT') nextRate = facts.localPerUsd + (nextRate - facts.localPerUsd) * 0.55;
    if (regime === 'PEG') {
      const peg = num(simPolicy.pegTargetLocalPerUsd) ?? facts.localPerUsd;
      const band = (num(simPolicy.regimeBandPct) ?? 0.5) / 100;
      nextRate = clamp(nextRate, peg * (1 - band * 2), peg * (1 + band * 2));
    }
    const depreciationPct = (nextRate / facts.localPerUsd - 1) * 100;
    const postInflation = clamp(inflation + ((num(scenario.inflationDeltaPp) || 0) * 0.25)
      + Math.max(0, depreciationPct) * 0.10 - Math.max(0, (num(simPolicy.interestRateAnnualPct) || 3) - (num(simPolicy.inflationTargetPct) || 3)) * 0.10, -5, 1000);
    const postCpi = before.cpiIndex * Math.pow(Math.max(0.0001, 1 + postInflation / 100), years);
    const postWages = before.nominalWageIndex * Math.pow(Math.max(0.0001, 1 + before.wageGrowthPctUsed / 100), years);
    const postRealWage = 100 * postWages / postCpi;
    const postImportCost = before.importCostIndex * Math.pow(Math.max(0.0001, 1 + usInflation + Math.max(0, depreciationPct) / years), years);
    const result = {
      ok: true, scenario: code, label: scenario.label, countryCode: profileId(p), countryName: p.name, projectionYears: years,
      assumption: 'COUNTERFACTUAL_GAME_MODEL_ONLY_NO_STATE_MUTATION',
      before: { localPerUsd: facts.localPerUsd, inflationPct: facts.inflationPct, cpiIndex: before.cpiIndex, realWageIndex: before.realWageIndex, importCostIndex: before.importCostIndex, economicStabilityIndex: before.economicStabilityIndex, reserveUsd: reservesBase, reserveCoverMonths: facts.reserveCoverMonths },
      after: { localPerUsd: nextRate, currencyDepreciationPct: depreciationPct, inflationPct: postInflation, cpiIndex: postCpi,
        realWageIndex: postRealWage, importCostIndex: postImportCost, reserveUsd: reservesAfter, reserveCoverMonths: cover },
      annualFxPressurePct: drift, currencyRegime: regime,
      interpretation: 'Scenario output is deterministic gameplay analysis. It does not change Treasury, market rates, reservations or account balances.'
    };
    return result;
  }

  function currentCountryForPanel() {
    const host = g.document && g.document.getElementById('ministry-dashboard-content');
    const select = host && host.querySelector('#ofm-country-select');
    return resolveProfile(select && select.value) || activePlayer();
  }
  function panelHTML(p) {
    const row = getLatest(p) || {};
    const hist = getHistory(p);
    return '<section class="ofx-section" id="oetx-panel" data-oetx-panel data-country-code="' + esc(profileId(p)) + '">' +
      '<div class="ofx-heading"><div><h4>Economic Transmission &amp; Real Purchasing Power</h4>' +
      '<p>Domestic prices, nominal/real wages, imported inputs, producer costs, public purchasing power and stability indicators. Values are indices (100 = this model’s opening baseline), not official observed national series.</p></div></div>' +
      '<div class="ofx-kpis">' +
      '<article><span>Consumer price index</span><strong data-oetx-value="cpiIndex">' + esc(indexText(row.cpiIndex)) + '</strong><small>Inflation compounds by game time</small></article>' +
      '<article><span>Real wage index</span><strong data-oetx-value="realWageIndex">' + esc(indexText(row.realWageIndex)) + '</strong><small>Nominal wage proxy ÷ CPI</small></article>' +
      '<article><span>Household purchasing power</span><strong data-oetx-value="householdPurchasingPowerIndex">' + esc(indexText(row.householdPurchasingPowerIndex)) + '</strong><small>Real wage and employment factor</small></article>' +
      '<article><span>Imported input cost</span><strong data-oetx-value="importCostIndex">' + esc(indexText(row.importCostIndex)) + '</strong><small>External inflation + exchange-rate pressure</small></article>' +
      '<article><span>Producer cost index</span><strong data-oetx-value="producerCostIndex">' + esc(indexText(row.producerCostIndex)) + '</strong><small>Domestic and imported input costs</small></article>' +
      '<article><span>Public purchasing power</span><strong data-oetx-value="realPublicPurchasingPowerIndex">' + esc(indexText(row.realPublicPurchasingPowerIndex)) + '</strong><small>Fiscal spending index ÷ CPI</small></article>' +
      '<article><span>Real GDP proxy</span><strong data-oetx-value="realGDPIndex">' + esc(indexText(row.realGDPIndex)) + '</strong><small>Nominal GDP index ÷ CPI</small></article>' +
      '<article><span>Economic stability</span><strong data-oetx-value="economicStabilityIndex">' + esc(indexText(row.economicStabilityIndex)) + '/100</strong><small data-oetx-value="dataConfidence">' + esc(row.dataConfidence || 'LOW') + ' data coverage</small></article>' +
      '</div>' +
      '<div class="ofx-chart-grid"><article class="ofx-chart"><h5>One-month transmission trends</h5><p>CPI, real wages, imported prices and production costs (index)</p><canvas id="oetx-index-chart" aria-label="One month macroeconomic transmission line chart"></canvas></article>' +
      '<article class="ofx-chart"><h5>Counterfactual stress test</h5><p>Compare a policy or external shock without mutating the running game state.</p>' +
      '<form class="ofx-form" data-oetx-action="run-scenario"><label>Scenario<select name="scenario">' +
      Object.keys(rules.scenarios || {}).map(k => '<option value="' + esc(k) + '">' + esc(rules.scenarios[k].label || k) + '</option>').join('') +
      '</select></label><label>Projection (years)<input name="years" type="number" min="0.08" max="5" step="0.25" value="1" required></label><button type="submit">Run stress test</button></form>' +
      '<div class="ofx-result" data-oetx-scenario-result role="status">Scenario results will appear here. They are model outputs, not forecasts.</div></article></div>' +
      '<p class="ofx-note" data-oetx-data-note>' + esc('Source year: ' + Number(rules.baselineYear || 2015) + '. ' + (row.wageGrowthSource || 'Wage growth proxy is not yet available.') + '. ' + (row.importExposureSource || 'Import exposure source not available.') + '. Missing source fields stay N/A or use an explicitly tagged game-rule proxy.') + '</p>' +
      '<p class="ofx-note">Transmission outputs feed future global trade pricing and domestic demand appetite. Actual Finance Treasury, bank accounts, physical resources and policy rates remain owned by their authoritative runtimes.</p></section>';
  }
  function injectPanel() {
    if (!g.document || !initialized) return false;
    const content = g.document.getElementById('ministry-dashboard-content');
    const dashboard = content && content.querySelector('.ofm-dashboard');
    const mount = dashboard && dashboard.querySelector('[data-omss-container]');
    if (!dashboard || !mount) return false;
    const p = currentCountryForPanel();
    if (!p) return false;
    const old = mount.querySelector('#oetx-panel');
    if (old && old.getAttribute('data-country-code') === profileId(p)) { drawHistoryChart(p); refreshPanel(); return true; }
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const tmp = g.document.createElement('div');
    tmp.innerHTML = panelHTML(p);
    if (tmp.firstElementChild) mount.appendChild(tmp.firstElementChild);
    drawHistoryChart(p); bindPanelEvents();
    return true;
  }
  function chartCanvas(canvas, h) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const w = Math.max(240, Math.round(canvas.getBoundingClientRect().width || canvas.parentElement && canvas.parentElement.clientWidth || 300));
    const height = h || 190, ratio = clamp(num(g.devicePixelRatio) || 1, 1, 2);
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(height * ratio); canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0,0,w,height);
    return {ctx,w,h:height};
  }
  function drawHistoryChart(p) {
    const content = g.document && g.document.getElementById('ministry-dashboard-content');
    const panel = content && content.querySelector('#oetx-panel');
    if (!panel) return;
    const canvas = panel.querySelector('#oetx-index-chart'), hist = getHistory(p);
    if (!hist.length) return;
    const chart = chartCanvas(canvas,190); if (!chart) return;
    const {ctx,w,h} = chart, left=34,right=8,top=12,bottom=27;
    const series = [
      {key:'cpiIndex',color:'#f59e0b',label:'CPI'},
      {key:'realWageIndex',color:'#34d399',label:'Real wage'},
      {key:'importCostIndex',color:'#60a5fa',label:'Import cost'},
      {key:'producerCostIndex',color:'#c084fc',label:'Producer cost'}
    ];
    const values = hist.flatMap(row=>series.map(s=>num(row[s.key])).filter(v=>v!==null));
    if (values.length < 2) { ctx.fillStyle='#9fb3c8';ctx.font='12px system-ui';ctx.fillText('Daily history accumulates as the simulation advances.',12,h/2);return; }
    let min=Math.min(...values),max=Math.max(...values);
    if(max===min){min-=1;max+=1;}
    const pad=(max-min)*0.08;min-=pad;max+=pad;
    const x=i=>left+(w-left-right)*i/Math.max(1,hist.length-1);
    const y=v=>top+(max-v)/(max-min)*(h-top-bottom);
    ctx.strokeStyle='#263d53';ctx.lineWidth=1;
    for(let n=0;n<4;n++){const yy=top+(h-top-bottom)*n/3;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();}
    ctx.font='10px system-ui';ctx.fillStyle='#a9bbcd';ctx.textAlign='right';
    ctx.fillText(fmt(max,1),left-4,top+4);ctx.fillText(fmt(min,1),left-4,h-bottom+4);
    for(const s of series){
      ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.beginPath();let first=true;
      hist.forEach((row,i)=>{const v=num(row[s.key]);if(v===null)return;const xx=x(i),yy=y(v);if(first){ctx.moveTo(xx,yy);first=false;}else ctx.lineTo(xx,yy);});
      ctx.stroke();
    }
    ctx.fillStyle='#c1d2e1';ctx.textAlign='left';ctx.fillText(String(hist[0].label||''),left,h-8);
    ctx.textAlign='right';ctx.fillText(String(hist[hist.length-1].label||''),w-right,h-8);
    let legend=panel.querySelector('[data-oetx-chart-legend]');
    if(!legend){legend=g.document.createElement('div');legend.className='ofx-chart-legend';canvas.parentNode.appendChild(legend);legend.setAttribute('data-oetx-chart-legend','');}
    legend.innerHTML=series.map(s=>'<span><i style="background:'+s.color+'"></i>'+esc(s.label)+'</span>').join('');
  }
  function refreshPanel() {
    if (!g.document || !initialized) return;
    const content = g.document.getElementById('ministry-dashboard-content');
    const dashboard = content && content.querySelector('.ofm-dashboard');
    const mount = dashboard && dashboard.querySelector('[data-omss-container]');
    if (!mount) return;
    const panel = mount.querySelector('#oetx-panel');
    if (!panel || panel.getAttribute('data-country-code') !== profileId(currentCountryForPanel())) { injectPanel(); return; }
    const latest = getLatest(panel.getAttribute('data-country-code'));
    if (!latest) return;
    for (const [k,v] of Object.entries(latest)) {
      const item = panel.querySelector('[data-oetx-value="'+k+'"]');
      if (item) item.textContent = k === 'dataConfidence' ? String(v) : (String(k).toLowerCase().includes('pct') ? pct(v) : indexText(v));
    }
    const note=panel.querySelector('[data-oetx-data-note]');
    if(note)note.textContent='Source year: '+Number(rules.baselineYear||2015)+'. Wage growth: '+String(latest.wageGrowthSource||'N/A')+'. Import exposure: '+String(latest.importExposureSource||'N/A')+'. Missing raw fields remain unavailable or are marked as configured game-rule assumptions.';
    drawHistoryChart(resolveProfile(panel.getAttribute('data-country-code'))||activePlayer());
  }
  function bindPanelEvents() {
    const doc=g.document;if(!doc||doc.__omegaTransmissionPanelBound)return;doc.__omegaTransmissionPanelBound=true;
    doc.addEventListener('submit',function(event){
      const form=event.target,action=form&&form.getAttribute&&form.getAttribute('data-oetx-action');if(action!=='run-scenario')return;
      event.preventDefault();
      const data={};Array.from(form.elements||[]).forEach(el=>{if(el&&el.name)data[el.name]=el.value;});
      const p=currentCountryForPanel();const result=runStressScenario({countryCode:profileId(p),scenario:data.scenario,years:num(data.years)});
      const out=form.closest('#oetx-panel')?.querySelector('[data-oetx-scenario-result]');
      if(out){
        if(!result.ok){out.textContent='Stress test unavailable: '+String(result.code||'UNKNOWN');out.classList.add('is-error');out.classList.remove('is-ok');}
        else {
          const b=result.before,a=result.after;
          out.textContent=result.label+' · '+result.countryName+' · '+result.projectionYears+'y | FX: '+fmt(b.localPerUsd,6)+' → '+fmt(a.localPerUsd,6)+' local/USD ('+pct(a.currencyDepreciationPct)+') | Inflation: '+pct(b.inflationPct)+' → '+pct(a.inflationPct)+' | CPI: '+indexText(b.cpiIndex)+' → '+indexText(a.cpiIndex)+' | Real wage: '+indexText(b.realWageIndex)+' → '+indexText(a.realWageIndex)+' | Import cost: '+indexText(b.importCostIndex)+' → '+indexText(a.importCostIndex)+' | Model FX pressure: '+pct(result.annualFxPressurePct)+'. No live state changed.';
          out.classList.add('is-ok');out.classList.remove('is-error');
        }
      }
    });
  }
  function installObserver() {
    if(!g.document||observer||typeof g.MutationObserver!=='function')return;
    const host=g.document.getElementById('ministry-dashboard-content')||g.document.body;
    if(!host)return;
    observer=new g.MutationObserver(function(){
      const content=g.document.getElementById('ministry-dashboard-content'),dashboard=content&&content.querySelector('.ofm-dashboard');
      if(dashboard&&dashboard.querySelector('[data-omss-container]')&&!dashboard.querySelector('#oetx-panel'))queueRender();
    });
    observer.observe(host,{childList:true,subtree:true});
  }
  function queueRender(){if(renderQueued)return;renderQueued=true;const run=()=>{renderQueued=false;injectPanel();};if(typeof g.requestAnimationFrame==='function')g.requestAnimationFrame(run);else if(typeof g.setTimeout==='function')g.setTimeout(run,0);else run();}
  async function fetchRules() {
    const fetcher=typeof g.fetchResilient==='function'?g.fetchResilient:(url=>g.fetch(url,{cache:'no-store'}).then(r=>{if(!r||!r.ok)throw new Error('RULES_FETCH_FAILED');return r.json();}));
    try{const r=await fetcher('financial_transmission_rules_v1.json');if(obj(r))rules=Object.assign({},r);}catch(_){rules={schemaVersion:'1.0.0',baselineYear:2015,annualizationMs:YEAR_MS,historyDays:30,historyMaxPoints:31,defaultImportExposurePct:25,defaultWageGrowthShareOfGdpGrowth:.65,weights:{},scenarios:{}};}
  }
  async function initialize(){
    if(initialized){installObserver();queueRender();return diagnostics();}
    if(initPromise)return initPromise;
    initPromise=(async function(){
      finance=g.OmegaFinanceMinistry||g.Omega&&g.Omega.FinanceMinistry||null;
      fx=g.OmegaForexMonetaryEngine||g.Omega&&g.Omega.ForexMonetaryEngine||null;
      banking=g.OmegaGovernmentBanking||g.Omega&&g.Omega.GovernmentBanking||null;
      macro=g.OmegaMacroStabilityRuntime||g.Omega&&g.Omega.MacroStabilityRuntime||null;
      if(!finance||typeof finance.getProfiles!=='function')throw new Error('FINANCE_RUNTIME_NOT_READY');
      if(!fx||typeof fx.getRate!=='function')throw new Error('FX_RUNTIME_NOT_READY');
      if(typeof finance.init==='function')await finance.init();
      if(typeof fx.init==='function')await fx.init();
      if(macro&&typeof macro.init==='function')await macro.init();
      profiles=finance.getProfiles()||[];
      if(!profiles.length)throw new Error('COUNTRY_PROFILE_REGISTRY_EMPTY');
      byId=new Map();profiles.forEach(p=>[p.name,p.iso3,p.countryCode,p.iso2,p.economyKey].filter(Boolean).forEach(k=>byId.set(norm(k),p)));
      rawCache=new Map();
      for(const p of profiles){const key=profileId(p);try{rawCache.set(key,macro&&macro.getRawProfile?macro.getRawProfile(p.iso3||p.countryCode):null);}catch(_){rawCache.set(key,null);}}
      await fetchRules();
      store=rootTransmissionStore();
      initialized=true;
      attachEvents();installObserver();queueRender();
      const result=diagnostics();dispatch('OMEGA_ECONOMIC_TRANSMISSION_READY',result);
      return result;
    })();
    try{return await initPromise;}finally{if(!initialized)initPromise=null;}
  }
  function attachEvents(){
    if(eventBound)return;eventBound=true;
    g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',function(event){
      const d=event&&event.detail||{};
      const t=num(d.simulationTurn)??num(d.payload&&d.payload.turn)??num(d.turn)??currentTurn()+1;
      const dt=num(d.stepDurationMs)??num(d.durationMs)??num(g.Omega&&g.Omega.Simulation&&g.Omega.Simulation.clock&&g.Omega.Simulation.clock.stepDurationMs)??HOUR_MS;
      step(t,dt);
    });
    g.addEventListener?.('OMEGA_FINANCE_RUNTIME_READY',function(){initialize().catch(()=>{});});
    g.addEventListener?.('OMEGA_FX_MONETARY_RUNTIME_READY',function(){initialize().catch(()=>{});});
    g.addEventListener?.('OMEGA_MACRO_STABILITY_READY',function(){initialize().catch(()=>{});});
    g.addEventListener?.('OMEGA_FINANCE_STATE_UPDATED',function(){refreshPanel();});
    g.addEventListener?.('OMEGA_FX_MARKET_UPDATED',function(){refreshPanel();});
    g.addEventListener?.('OMEGA_GOVERNMENT_BANKING_TRANSFER_SETTLED',function(){refreshPanel();});
    g.addEventListener?.('OMEGA_GOVERNMENT_BANKING_TRADE_SETTLED',function(){refreshPanel();});
    g.addEventListener?.('OMEGA_READY',function(){initialize().catch(()=>{});});
  }
  function diagnostics(){
    const bankStore=rootTransmissionStore(),rows=Object.values(bankStore.economicTransmissionByCountry||{});
    return {version:VERSION,initialized,profileCount:profiles.length,modeledCountryCount:rows.filter(x=>x&&x.latest).length,
      latestTurn:num(bankStore.lastProcessedTurn),currencyStressCount:Object.keys(bankStore.monetaryStressByCurrency||{}).length,
      historyPointCount:rows.reduce((sum,x)=>sum+(Array.isArray(x&&x.history)?x.history.length:0),0),
      scenarios:Object.keys(rules.scenarios||{}),missingRawFieldsRemainNull:true,
      downstreamConnections:['GLOBAL_TRADE_PRODUCER_COST','NATIONAL_DEMAND_PURCHASING_POWER','FX_CURRENCY_STRESS']};
  }
  const api={
    VERSION,init:initialize,diagnostics,advanceTurn:step,getState,getLatest,getHistory,
    getProducerCostMultiplier,getImportCostMultiplier,getHouseholdPurchasingPowerMultiplier,getPublicPurchasingPowerMultiplier,
    getMonetaryStress,runStressScenario,refreshPanel
  };
  g.OmegaEconomicTransmissionRuntime=api;
  g.Omega=g.Omega||{};g.Omega.EconomicTransmission=api;
  if(g.document){
    g.addEventListener?.('load',()=>initialize().catch(e=>g.console&&g.console.error&&g.console.error('[OMEGA TRANSMISSION INIT]',e)),{once:true});
    if(g.document.readyState==='complete'||g.document.readyState==='interactive')Promise.resolve().then(()=>initialize().catch(e=>g.console&&g.console.error&&g.console.error('[OMEGA TRANSMISSION INIT]',e)));
    else g.document.addEventListener?.('DOMContentLoaded',()=>initialize().catch(e=>g.console&&g.console.error&&g.console.error('[OMEGA TRANSMISSION INIT]',e)),{once:true});
  }
})(typeof window!=='undefined'?window:globalThis);
