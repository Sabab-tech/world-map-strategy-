/* OMEGA WORLD BANK REFERENCE + SOVEREIGN LENDING ENGINE v1.0.0
 * Uses public World Bank WDI country data as reference observations.
 * All lending, repayment and score outcomes remain in-game simulation state.
 */
(function (global) {
  'use strict';
  const VERSION = '1.0.0';
  if (global.OmegaWorldBankLending && global.OmegaWorldBankLending.VERSION === VERSION) return;

  const DAY_MS = 86400000;
  const CACHE_KEY = 'omega.world-bank-lending.reference.v1';
  const WB_BASE = 'https://api.worldbank.org/v2';
  const REFRESH_TTL_MS = DAY_MS;
  const RETRY_BACKOFF_MS = 60 * 60 * 1000;
  const DEFAULT_FACILITY_CAPACITY_USD = 1_000_000_000_000;
  const MAX_HISTORY = 5000;
  const MAX_LOAN_LEDGER = 4000;
  const INDICATORS = Object.freeze([
    { key: 'gdpUsd', code: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)' },
    { key: 'gdpGrowthPct', code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)' },
    { key: 'inflationPct', code: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)' },
    { key: 'unemploymentPct', code: 'SL.UEM.TOTL.ZS', label: 'Unemployment, total (% of labor force)' },
    { key: 'publicDebtPctGdp', code: 'GC.DOD.TOTL.GD.ZS', label: 'Central government debt (% of GDP)' },
    { key: 'population', code: 'SP.POP.TOTL', label: 'Population, total' },
    { key: 'reservesUsd', code: 'FI.RES.TOTL.CD', label: 'Total reserves including gold (current US$)' }
  ]);
  const SCORE_PARTS = Object.freeze([
    { key: 'debt', weight: 0.315 },
    { key: 'inflation', weight: 0.18 },
    { key: 'growth', weight: 0.18 },
    { key: 'reserves', weight: 0.135 },
    { key: 'fiscal', weight: 0.09 },
    { key: 'history', weight: 0.10 }
  ]);
  const TERMS = Object.freeze({
    IDA: { label: 'IDA-style concessional facility', rate: 1.25, years: 35, grace: 5 },
    IDA_BLEND: { label: 'Blend facility', rate: 2.25, years: 30, grace: 4 },
    IBRD: { label: 'IBRD-style development facility', rate: 3.25, years: 20, grace: 3 }
  });

  let finance = null;
  let profiles = [];
  let byId = new Map();
  let initialized = false;
  let initPromise = null;
  let refreshPromise = null;
  let observer = null;
  let uiState = { search: '', notice: null };
  let uiRoot = null;

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
  function finite(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function round(value, digits) {
    const n = finite(value);
    if (n === null) return null;
    const factor = Math.pow(10, digits === undefined ? 4 : digits);
    return Math.round(n * factor) / factor;
  }
  function clone(value) {
    if (value === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }
  function norm(value) {
    return String(value == null ? '' : value).toUpperCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function codeOf(profile) { return String(profile && (profile.countryCode || profile.iso3 || profile.code) || '').trim().toUpperCase(); }
  function iso3Of(profile) { return String(profile && (profile.iso3 || profile.countryCode || profile.code) || '').trim().toUpperCase(); }
  function iso2Of(profile) { return String(profile && profile.iso2 || '').trim().toUpperCase(); }
  function dateValue(value) {
    const n = finite(value);
    if (n !== null) return n;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function currentTurn() {
    const root = rootState();
    const values = [root.simulation && root.simulation.turn, root.simulation && root.simulation.currentTurn,
      root.turn, global.Omega && global.Omega.Simulation && global.Omega.Simulation.clock && global.Omega.Simulation.clock.turn];
    for (const value of values) { const n = finite(value); if (n !== null) return n; }
    return 0;
  }
  function stateCandidates() {
    const candidates = [
      global.Omega && global.Omega.Simulation && global.Omega.Simulation.world && global.Omega.Simulation.world.state,
      global.Omega && global.Omega.World && global.Omega.World.state,
      global.Game && global.Game.state,
      global.gameState
    ];
    return candidates.filter((state, index) => isObject(state) && candidates.indexOf(state) === index);
  }
  function rootState() {
    const candidates = stateCandidates();
    return candidates.find(state => isObject(state.economy) && Object.keys(state.economy).length > 0)
      || candidates.find(state => isObject(state.finance) && Object.keys(state.finance).length > 0)
      || candidates[0]
      || (global.gameState = { economy: {}, finance: {}, simulation: { turn: 0 } });
  }
  function store(create) {
    const root = rootState();
    if (!isObject(root.governmentBanking)) {
      if (!create) return null;
      root.governmentBanking = {};
    }
    if (!isObject(root.governmentBanking.worldBankLending)) {
      if (!create) return null;
      root.governmentBanking.worldBankLending = {};
    }
    const bank = root.governmentBanking.worldBankLending;
    if (create) {
      bank.schemaVersion = VERSION;
      if (!isObject(bank.assessmentsByCountry)) bank.assessmentsByCountry = {};
      if (!isObject(bank.loansByCountry)) bank.loansByCountry = {};
      if (!isObject(bank.idempotency)) bank.idempotency = {};
      if (!Array.isArray(bank.applications)) bank.applications = [];
      if (!Array.isArray(bank.ledger)) bank.ledger = [];
      if (!Array.isArray(bank.history)) bank.history = [];
      if (!finite(bank.nextSequence) || bank.nextSequence < 1) bank.nextSequence = 1;
      if (!isObject(bank.reference)) bank.reference = {};
      if (!isObject(bank.reference.countries)) bank.reference.countries = {};
      if (finite(bank.facilityCapacityUsd) === null || finite(bank.facilityCapacityUsd) < 0) bank.facilityCapacityUsd = DEFAULT_FACILITY_CAPACITY_USD;
      if (!isObject(bank.reference.indicatorStatus)) bank.reference.indicatorStatus = {};
      if (!bank.reference.provider) bank.reference.provider = 'WORLD_BANK_WDI_V2';
      if (!bank.reference.status) bank.reference.status = 'UNAVAILABLE';
      if (!finite(bank.lastEvaluatedTurn)) bank.lastEvaluatedTurn = -1;
    }
    return bank;
  }
  function resolveProfile(value) {
    if (value && typeof value === 'object') value = value.countryCode || value.iso3 || value.code || value.name || value.id;
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    try {
      if (finance && typeof finance.resolveCountry === 'function') {
        const profile = finance.resolveCountry(raw);
        if (profile) return profile;
      }
    } catch (_) {}
    return byId.get(raw.toUpperCase()) || byId.get(norm(raw)) || null;
  }
  function playerProfile() {
    try {
      if (finance && typeof finance.getPlayerCountry === 'function') {
        const profile = finance.getPlayerCountry();
        if (profile) return profile;
      }
    } catch (_) {}
    const root = rootState();
    const value = root.simulation && ((root.simulation.session && root.simulation.session.playerCountryId)
      || root.simulation.playerCountryId);
    return resolveProfile(value) || null;
  }
  function currentCountryProfile() {
    return resolveProfile(global.OmegaMinistryViewCountry)
      || resolveProfile(global.OmegaFinanceMinistry && global.OmegaFinanceMinistry.getPlayerCountry
        ? global.OmegaFinanceMinistry.getPlayerCountry() : null)
      || playerProfile();
  }
  function buildProfileIndex() {
    byId = new Map();
    profiles.forEach(profile => {
      [profile.name, profile.countryCode, profile.iso3, profile.iso2, profile.numericCode, profile.economyKey]
        .filter(Boolean).forEach(value => { byId.set(String(value).toUpperCase(), profile); byId.set(norm(value), profile); });
    });
  }
  function findEconomy(profile, root) {
    root = root || rootState();
    if (!profile || !isObject(root.economy)) return {};
    const keys = [profile.economyKey, profile.countryCode, profile.iso3, profile.name].filter(Boolean);
    for (const key of keys) if (isObject(root.economy[key])) return root.economy[key];
    return isObject(profile.sourceValues) ? profile.sourceValues : {};
  }
  function profileIndicators(profile) {
    try {
      if (finance && typeof finance.getIndicators === 'function') {
        const snapshot = finance.getIndicators(codeOf(profile));
        if (isObject(snapshot)) return snapshot;
      }
    } catch (_) {}
    return isObject(profile && profile.indicators) ? profile.indicators : {};
  }
  function financeModel(profile) {
    try {
      if (finance && typeof finance.getFinanceState === 'function') {
        const model = finance.getFinanceState(codeOf(profile));
        if (isObject(model)) return model;
      }
    } catch (_) {}
    const root = rootState();
    const buckets = [codeOf(profile), iso3Of(profile), profile && profile.economyKey, profile && profile.name].filter(Boolean);
    for (const key of buckets) if (isObject(root.finance && root.finance[key] && root.finance[key].omegaFinance)) return root.finance[key].omegaFinance;
    return {};
  }
  function referenceFor(profile) {
    const bank = store(true);
    const refs = bank.reference.countries || {};
    return refs[codeOf(profile)] || refs[iso3Of(profile)] || refs[iso2Of(profile)] || {};
  }
  function referenceValue(reference, key) {
    return finite(reference && reference.data && reference.data[key] && reference.data[key].value);
  }
  function countryFacts(value) {
    const profile = resolveProfile(value);
    if (!profile) return null;
    const root = rootState();
    const economy = findEconomy(profile, root);
    const indicators = profileIndicators(profile);
    const model = financeModel(profile);
    const reference = referenceFor(profile);
    const refData = reference.data || {};
    const gdp = finite(economy.gdp) ?? finite(indicators.gdpCurrentUsd) ?? referenceValue(reference, 'gdpUsd');
    const referenceDebtRatio = referenceValue(reference, 'publicDebtPctGdp');
    let debt = finite(economy.debt) ?? finite(indicators.publicDebtUsd);
    if (debt === null && gdp !== null && referenceDebtRatio !== null) debt = gdp * referenceDebtRatio / 100;
    const debtToGdp = gdp !== null && gdp > 0 && debt !== null
      ? debt / gdp * 100 : referenceDebtRatio;
    const growth = finite(economy.gdp_growth) ?? finite(indicators.gdpGrowthPct) ?? referenceValue(reference, 'gdpGrowthPct');
    const inflation = finite(economy.inflation) ?? finite(indicators.inflationRatePct) ?? referenceValue(reference, 'inflationPct');
    const unemployment = finite(economy.unemployment_rate) ?? finite(indicators.unemploymentRatePct) ?? referenceValue(reference, 'unemploymentPct');
    const reserves = finite(economy.reserves) ?? finite(indicators.foreignExchangeReservesUsd) ?? referenceValue(reference, 'reservesUsd');
    const reservesToGdp = gdp !== null && gdp > 0 && reserves !== null ? reserves / gdp * 100 : null;
    const fiscalBalance = finite(economy.budget_balance) ?? finite(indicators.governmentBudgetBalanceUsd)
      ?? finite(model.fiscalModel && model.fiscalModel.annualBudgetBalanceUsd);
    const fiscalBalanceToGdp = gdp !== null && gdp > 0 && fiscalBalance !== null ? fiscalBalance / gdp * 100 : null;
    const population = finite(profile.populationValues && profile.populationValues.population_2015)
      ?? finite(indicators.population2015) ?? referenceValue(reference, 'population');
    const treasury = finite(model.treasuryBalanceUsd)
      ?? finite(root.finance && root.finance[codeOf(profile)] && root.finance[codeOf(profile)].available)
      ?? finite(economy.treasury);
    const meta = isObject(reference.metadata) ? reference.metadata : {};
    const sourceYears = {};
    Object.keys(refData).forEach(key => { sourceYears[key] = finite(refData[key] && refData[key].year); });
    return {
      countryCode: codeOf(profile), iso3: iso3Of(profile), iso2: iso2Of(profile), name: profile.name,
      profileStatus: profile.profileStatus || 'UNKNOWN',
      gdpUsd: gdp, debtUsd: debt, debtToGdpPct: debtToGdp,
      gdpGrowthPct: growth, inflationPct: inflation, unemploymentPct: unemployment,
      reservesUsd: reserves, reservesToGdpPct: reservesToGdp,
      fiscalBalanceUsd: fiscalBalance, fiscalBalanceToGdpPct: fiscalBalanceToGdp,
      population: population, treasuryUsd: treasury,
      incomeLevel: meta.incomeLevel && (meta.incomeLevel.value || meta.incomeLevel.id) || null,
      incomeLevelId: meta.incomeLevel && meta.incomeLevel.id || null,
      region: meta.region && (meta.region.value || meta.region.id) || null,
      lendingType: meta.lendingType && (meta.lendingType.value || meta.lendingType.id) || null,
      lendingTypeId: meta.lendingType && meta.lendingType.id || null,
      sourceYears: sourceYears,
      referenceStatus: store(true).reference.status || 'UNAVAILABLE',
      referenceUpdatedAt: store(true).reference.refreshedAt || null
    };
  }
  function creditHistory(value) {
    const profile = resolveProfile(value);
    if (!profile) return { score: null, contracts: 0, repaidContracts: 0, arrearsContracts: 0, arrearsUsd: 0 };
    const rows = (store(true).loansByCountry[codeOf(profile)] || []).filter(loan => loan && loan.loanId);
    const repaid = rows.filter(loan => loan.status === 'REPAID').length;
    const arrearsLoans = rows.filter(loan => loan.status === 'ARREARS' || (finite(loan.arrearsUsd) || 0) > 0.01).length;
    const totalOriginal = rows.reduce((sum, loan) => sum + Math.max(0, finite(loan.originalPrincipalUsd) || 0), 0);
    const arrears = rows.reduce((sum, loan) => sum + Math.max(0, finite(loan.arrearsUsd) || 0), 0);
    const hasPerformanceEvidence = rows.some(loan => repaid > 0 || (finite(loan.totalPrincipalPaidUsd) || 0) > 0.01
      || (finite(loan.totalInterestPaidUsd) || 0) > 0.01 || (finite(loan.arrearsUsd) || 0) > 0.01);
    if (!rows.length || !hasPerformanceEvidence) {
      return { score: null, contracts: rows.length, repaidContracts: repaid,
        arrearsContracts: arrearsLoans, arrearsUsd: round(arrears, 2) || 0 };
    }
    const arrearsRatio = totalOriginal > 0 ? arrears / totalOriginal : 0;
    const defaultRatio = arrearsLoans / rows.length;
    const repaymentRatio = repaid / rows.length;
    const score = clamp(90 - Math.min(60, arrearsRatio * 300) - Math.min(35, defaultRatio * 35)
      + repaymentRatio * 10, 0, 100);
    return {
      score: round(score, 1), contracts: rows.length, repaidContracts: repaid,
      arrearsContracts: arrearsLoans, arrearsUsd: round(arrears, 2) || 0
    };
  }
  function scoreCountry(value) {
    const facts = countryFacts(value);
    if (!facts) return null;
    const components = {};
    if (facts.debtToGdpPct !== null && facts.debtToGdpPct >= 0) {
      components.debt = clamp(100 - facts.debtToGdpPct * 0.40, 0, 100);
    }
    if (facts.inflationPct !== null) {
      components.inflation = clamp(100 - Math.max(0, facts.inflationPct - 2) * 2.2, 0, 100);
    }
    if (facts.gdpGrowthPct !== null) {
      components.growth = clamp(50 + facts.gdpGrowthPct * 4, 0, 100);
    }
    if (facts.reservesToGdpPct !== null && facts.reservesToGdpPct >= 0) {
      components.reserves = clamp(facts.reservesToGdpPct * 4, 0, 100);
    }
    if (facts.fiscalBalanceToGdpPct !== null) {
      components.fiscal = clamp(50 + facts.fiscalBalanceToGdpPct * 2, 0, 100);
    }
    const history = creditHistory(facts.countryCode);
    if (history.score !== null) components.history = history.score;
    let scoreTotal = 0, usedWeight = 0;
    SCORE_PARTS.forEach(part => {
      if (finite(components[part.key]) === null) return;
      scoreTotal += components[part.key] * part.weight;
      usedWeight += part.weight;
    });
    const score = usedWeight > 0 ? round(scoreTotal / usedWeight, 1) : null;
    const confidence = round(usedWeight * 100, 1);
    const program = lendingProgram(facts);
    const reasons = [];
    if (facts.gdpUsd === null || facts.gdpUsd <= 0) reasons.push('GDP is unavailable; no safe loan ceiling can be calculated.');
    if (facts.debtToGdpPct === null) reasons.push('Public debt / GDP is unavailable.');
    if (confidence < 60) reasons.push('Too few credit indicators are available for a reliable lending decision.');
    if (facts.debtToGdpPct !== null && facts.debtToGdpPct >= 250) reasons.push('Debt / GDP is at or above the game model’s 250% lending guardrail.');
    if (facts.inflationPct !== null && facts.inflationPct >= 30) reasons.push('Inflation stress requires additional stabilization before standard lending.');
    if (history.arrearsContracts > 0) reasons.push('Prior simulated loan record contains overdue payments; the history component lowers the next credit score.');
    if (history.contracts === 0) reasons.push('No prior simulated World Bank loan contract exists; credit history is not penalized, but this component is unavailable.');
    if (program === 'NONE') reasons.push('World Bank country metadata lists no standard lending window.');
    const criticalDataMissing = facts.gdpUsd === null || facts.gdpUsd <= 0 || facts.debtToGdpPct === null;
    let decision = 'DATA_INSUFFICIENT';
    if (!criticalDataMissing && program === 'NONE') decision = 'NO_LENDING_WINDOW';
    else if (!criticalDataMissing && confidence < 60) decision = 'CONDITIONAL_DATA_GAP';
    else if (!criticalDataMissing && (score === null || score < 35 || facts.debtToGdpPct >= 250)) decision = 'REJECT_HIGH_RISK';
    else if (!criticalDataMissing && score >= 72 && confidence >= 70) decision = 'ELIGIBLE';
    else if (!criticalDataMissing && score >= 55) decision = 'CONDITIONAL';
    else if (!criticalDataMissing) decision = 'WATCHLIST';

    const debtCapUsd = facts.gdpUsd !== null && facts.debtToGdpPct !== null
      ? Math.max(0, facts.gdpUsd * 2.5 - (facts.debtUsd !== null ? facts.debtUsd : facts.gdpUsd * facts.debtToGdpPct / 100))
      : 0;
    const capPct = score !== null && score >= 80 ? 3
      : score !== null && score >= 70 ? 2.5
      : score !== null && score >= 60 ? 2
      : score !== null && score >= 55 ? 1
      : 0;
    let maxLoanUsd = facts.gdpUsd !== null && facts.gdpUsd > 0
      ? Math.min(facts.gdpUsd * capPct / 100 * (confidence / 100), debtCapUsd, facts.gdpUsd * 0.05)
      : 0;
    if (decision !== 'ELIGIBLE' && decision !== 'CONDITIONAL') maxLoanUsd = 0;
    if (program === 'NONE' || criticalDataMissing || confidence < 60) maxLoanUsd = 0;
    maxLoanUsd = round(Math.max(0, maxLoanUsd), 2);
    const riskBand = score === null ? 'UNRATED' : score >= 80 ? 'A / LOW RISK'
      : score >= 70 ? 'B / MODERATE-LOW' : score >= 55 ? 'C / MODERATE' : score >= 35 ? 'D / HIGH' : 'E / VERY HIGH';
    const result = {
      countryCode: facts.countryCode, iso3: facts.iso3, iso2: facts.iso2, countryName: facts.name,
      score: score, confidencePct: confidence, components: components,
      decision: decision, riskBand: riskBand, program: program,
      maxLoanUsd: maxLoanUsd, debtCapacityUsd: round(Math.max(0, debtCapUsd), 2),
      debtToGdpPct: round(facts.debtToGdpPct, 2), gdpUsd: round(facts.gdpUsd, 2),
      debtUsd: round(facts.debtUsd, 2), gdpGrowthPct: round(facts.gdpGrowthPct, 2),
      inflationPct: round(facts.inflationPct, 2), reservesUsd: round(facts.reservesUsd, 2),
      reservesToGdpPct: round(facts.reservesToGdpPct, 2), treasuryUsd: round(facts.treasuryUsd, 2),
      fiscalBalanceToGdpPct: round(facts.fiscalBalanceToGdpPct, 2), population: facts.population,
      incomeLevel: facts.incomeLevel, region: facts.region, lendingType: facts.lendingType,
      referenceStatus: facts.referenceStatus, referenceUpdatedAt: facts.referenceUpdatedAt,
      sourceYears: facts.sourceYears, reasons: reasons,
      creditHistory: clone(history),
      assessedTurn: currentTurn(), assessedAt: new Date().toISOString()
    };
    return result;
  }
  function lendingProgram(facts) {
    const id = String(facts && facts.lendingTypeId || '').trim().toUpperCase();
    const label = String(facts && facts.lendingType || '').trim().toUpperCase();
    if (id === 'IDA' || label === 'IDA') return 'IDA';
    if (id === 'IDX' || id === 'BLEND' || label === 'BLEND' || label.indexOf('IDA/IBRD') >= 0) return 'IDA_BLEND';
    if (id === 'IBD' || id === 'IBRD' || label === 'IBRD') return 'IBRD';
    if (id === 'LNX' || id === 'NA' || label === 'NOT APPLICABLE' || label === 'N/A') return 'NONE';
    const income = String(facts && facts.incomeLevelId || '').toUpperCase();
    if (income === 'LIC' || income === 'L' || /LOW INCOME/.test(String(facts && facts.incomeLevel || '').toUpperCase())) return 'PROVISIONAL_IDA';
    if (facts && facts.incomeLevel) return 'PROVISIONAL_IBRD';
    return 'PROVISIONAL_IBRD';
  }
  function termsFor(assessment, purpose) {
    const sourceProgram = String(assessment && assessment.program || '');
    const program = sourceProgram.replace(/^PROVISIONAL_/, '');
    const base = TERMS[program] || TERMS.IBRD;
    let rate = Number(base.rate) + Math.max(0, 70 - (finite(assessment && assessment.score) || 0)) * 0.03;
    rate += Math.max(0, (finite(assessment && assessment.inflationPct) || 0) - 10) * 0.02;
    let years = Number(base.years), grace = Number(base.grace);
    if (String(purpose || '').toLowerCase() === 'emergency') {
      rate += 0.75;
      years = Math.min(years, 15);
      grace = 1;
    }
    rate = round(clamp(rate, 0.5, 8.5), 3);
    return {
      program: sourceProgram, facilityLabel: base.label + (sourceProgram.indexOf('PROVISIONAL_') === 0 ? ' (provisional gameplay window)' : ''),
      annualInterestRatePct: rate, termYears: years, graceYears: grace,
      annualPaymentPerDollar: annualPayment(1, rate, years - grace)
    };
  }
  function annualPayment(principal, ratePct, years) {
    const p = Math.max(0, finite(principal) || 0), r = Math.max(0, finite(ratePct) || 0) / 100;
    const n = Math.max(1 / 365, finite(years) || 1 / 365);
    if (p <= 0) return 0;
    if (r <= 0.0000001) return p / n;
    const denom = 1 - Math.pow(1 + r, -n);
    return denom > 0 ? p * r / denom : p / n;
  }
  function bankLedger(row) {
    const bank = store(true);
    const entry = Object.assign({ turn: currentTurn(), timestamp: new Date().toISOString() }, clone(row || {}));
    bank.ledger.push(entry);
    bank.ledger = bank.ledger.slice(-MAX_LOAN_LEDGER);
    bank.history.push(entry);
    bank.history = bank.history.slice(-MAX_HISTORY);
    try {
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('OMEGA_WORLD_BANK_LENDING_UPDATED', { detail: clone(entry) }));
      }
    } catch (_) {}
    return entry;
  }
  function evaluateAll() {
    const bank = store(true);
    const next = {};
    let eligible = 0, conditional = 0, insufficient = 0;
    for (const profile of profiles) {
      const assessment = scoreCountry(profile);
      if (!assessment) continue;
      next[assessment.countryCode] = assessment;
      if (assessment.decision === 'ELIGIBLE') eligible++;
      else if (assessment.decision === 'CONDITIONAL') conditional++;
      else if (assessment.decision === 'DATA_INSUFFICIENT') insufficient++;
      const previous = bank.assessmentsByCountry[assessment.countryCode];
      const materiallyChanged = !previous
        || previous.decision !== assessment.decision
        || (finite(previous.score) === null) !== (finite(assessment.score) === null)
        || (finite(previous.score) !== null && Math.abs(previous.score - assessment.score) >= 1)
        || Math.abs((finite(previous.maxLoanUsd) || 0) - (finite(assessment.maxLoanUsd) || 0)) >= 1000000;
      if (materiallyChanged) bankLedger({
        type: 'COUNTRY_CREDIT_ASSESSMENT', countryCode: assessment.countryCode,
        countryName: assessment.countryName, decision: assessment.decision,
        creditScore: assessment.score, confidencePct: assessment.confidencePct,
        suggestedFacilityUsd: assessment.maxLoanUsd
      });
    }
    bank.assessmentsByCountry = next;
    bank.lastEvaluatedTurn = currentTurn();
    bank.lastEvaluatedAt = new Date().toISOString();
    return {
      ok: true, turn: bank.lastEvaluatedTurn, countriesAssessed: Object.keys(next).length,
      eligible: eligible, conditional: conditional, insufficient: insufficient
    };
  }
  function getLoanList(value) {
    const profile = resolveProfile(value);
    if (profile) return clone((store(true).loansByCountry[codeOf(profile)] || []).slice());
    const all = [];
    Object.keys(store(true).loansByCountry).forEach(code => all.push(...(store(true).loansByCountry[code] || [])));
    return clone(all);
  }
  function getOutstandingBalance(value) {
    const loans = getLoanList(value);
    return round(loans.filter(loan => loan.status !== 'REPAID')
      .reduce((sum, loan) => sum + Math.max(0, finite(loan.outstandingPrincipalUsd) || 0)
        + Math.max(0, finite(loan.accruedInterestUsd) || 0), 0), 2) || 0;
  }
  function getOutstandingPrincipal(value) {
    return round(getLoanList(value).filter(loan => loan.status !== 'REPAID')
      .reduce((sum, loan) => sum + Math.max(0, finite(loan.outstandingPrincipalUsd) || 0), 0), 2) || 0;
  }
  function requestLoan(input) {
    input = isObject(input) ? input : {};
    if (!initialized) return { ok: false, code: 'WORLD_BANK_RUNTIME_NOT_READY' };
    const profile = resolveProfile(input.countryId || input.countryCode || currentCountryProfile());
    if (!profile) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    const player = playerProfile();
    if (!player || codeOf(player) !== codeOf(profile)) {
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION', message: 'Only the active player country can issue the Finance Treasury borrowing action.' };
    }
    const bank = store(true);
    const requestId = String(input.requestId || ('WB-' + codeOf(profile) + '-' + currentTurn() + '-' + bank.nextSequence)).slice(0, 120);
    const allowedPurposes = ['infrastructure', 'health', 'education', 'climate', 'emergency', 'budget-support'];
    const purpose = allowedPurposes.includes(String(input.purpose || '').toLowerCase())
      ? String(input.purpose).toLowerCase() : 'infrastructure';
    if (bank.idempotency[requestId]) {
      const previousLoanId = bank.idempotency[requestId];
      const existing = getLoanList(profile).find(loan => loan.loanId === previousLoanId);
      if (!existing) return { ok: false, code: 'IDEMPOTENCY_REFERENCE_MISSING', loanId: previousLoanId };
      const requestedAmount = finite(input.amountUsd);
      if ((requestedAmount !== null && Math.abs(requestedAmount - existing.originalPrincipalUsd) > 0.01)
          || purpose !== existing.purpose) {
        return { ok: false, code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', message: 'This request ID was already used for a different loan amount or purpose.' };
      }
      return { ok: true, duplicate: true, loan: clone(existing), loanId: previousLoanId };
    }
    const assessment = scoreCountry(profile);
    if (!assessment || (assessment.decision !== 'ELIGIBLE' && assessment.decision !== 'CONDITIONAL') || assessment.maxLoanUsd <= 0) {
      return { ok: false, code: 'WORLD_BANK_CREDIT_REJECTED', assessment: assessment, message: 'The current country assessment does not support a new facility.' };
    }
    const amount = finite(input.amountUsd) ?? assessment.maxLoanUsd;
    if (amount <= 0 || amount > assessment.maxLoanUsd + 0.01) {
      return { ok: false, code: 'WORLD_BANK_AMOUNT_OUT_OF_RANGE', maxLoanUsd: assessment.maxLoanUsd, message: 'Requested principal must be positive and not exceed the current approved game-model ceiling.' };
    }
    if (!finance || typeof finance.applyAction !== 'function') return { ok: false, code: 'FINANCE_RUNTIME_UNAVAILABLE' };
    const terms = termsFor(assessment, purpose);
    const financeResult = finance.applyAction({
      type: 'borrow', countryId: codeOf(profile), amountUsd: amount,
      description: 'Simulated World Bank ' + terms.program + ' facility / ' + purpose
    });
    if (!financeResult || financeResult.ok !== true) {
      return { ok: false, code: financeResult && financeResult.code || 'FINANCE_BORROW_REJECTED',
        message: financeResult && financeResult.message || 'The authoritative Finance runtime rejected this borrowing action.',
        financeResult: clone(financeResult || null) };
    }
    const sequence = Number(bank.nextSequence || 1);
    bank.nextSequence = sequence + 1;
    const loanId = 'WB-' + codeOf(profile) + '-' + currentTurn() + '-' + sequence;
    const loan = {
      loanId: loanId, requestId: requestId, countryCode: codeOf(profile), countryName: profile.name,
      program: terms.program, facilityLabel: terms.facilityLabel, purpose: purpose,
      originalPrincipalUsd: round(amount, 2), outstandingPrincipalUsd: round(amount, 2), accruedInterestUsd: 0,
      annualInterestRatePct: terms.annualInterestRatePct, termYears: terms.termYears, graceYears: terms.graceYears,
      ageYears: 0, issuedTurn: currentTurn(), lastAccruedTurn: currentTurn(), lastInterestAccruedUsd: 0,
      arrearsUsd: 0, status: 'ACTIVE', source: 'SIMULATED_WORLD_BANK_LENDING',
      approvedCreditScore: assessment.score, approvedConfidencePct: assessment.confidencePct,
      approvedDebtToGdpPct: assessment.debtToGdpPct, issuedAt: new Date().toISOString(),
      totalInterestPaidUsd: 0, totalPrincipalPaidUsd: 0, lastServiceTurn: null
    };
    if (!Array.isArray(bank.loansByCountry[codeOf(profile)])) bank.loansByCountry[codeOf(profile)] = [];
    bank.loansByCountry[codeOf(profile)].push(loan);
    bank.idempotency[requestId] = loanId;
    bank.applications.push({
      requestId: requestId, loanId: loanId, countryCode: codeOf(profile), countryName: profile.name,
      status: 'APPROVED_AND_POSTED', amountUsd: round(amount, 2), program: terms.program,
      creditScore: assessment.score, turn: currentTurn(), timestamp: new Date().toISOString()
    });
    bank.applications = bank.applications.slice(-MAX_HISTORY);
    bankLedger({
      type: 'WORLD_BANK_LOAN_ISSUED', loanId: loanId, countryCode: codeOf(profile),
      countryName: profile.name, amountUsd: round(amount, 2), program: terms.program,
      annualInterestRatePct: terms.annualInterestRatePct, termYears: terms.termYears,
      graceYears: terms.graceYears, purpose: purpose
    });
    evaluateAll();
    return { ok: true, loan: clone(loan), loanId: loanId, financeResult: clone(financeResult) };
  }
  function accrueInterest(value, years, turnNumber) {
    const profile = resolveProfile(value);
    if (!profile) return 0;
    const elapsedYears = Math.max(0, finite(years) || 0);
    if (elapsedYears <= 0) return 0;
    const turn = finite(turnNumber) ?? currentTurn();
    const loans = store(true).loansByCountry[codeOf(profile)] || [];
    let interestTotal = 0;
    for (const loan of loans) {
      if (loan.status === 'REPAID') continue;
      if (finite(loan.lastAccruedTurn) !== null && turn <= loan.lastAccruedTurn) continue;
      const balance = Math.max(0, finite(loan.outstandingPrincipalUsd) || 0) + Math.max(0, finite(loan.accruedInterestUsd) || 0);
      const rate = Math.max(0, finite(loan.annualInterestRatePct) || 0) / 100;
      const interest = balance * (Math.pow(1 + rate, elapsedYears) - 1);
      loan.accruedInterestUsd = round((finite(loan.accruedInterestUsd) || 0) + interest, 6);
      loan.lastInterestAccruedUsd = interest;
      loan.ageYears = Math.max(0, finite(loan.ageYears) || 0) + elapsedYears;
      loan.lastAccruedTurn = turn;
      interestTotal += interest;
    }
    return round(interestTotal, 6) || 0;
  }
  function serviceDebt(value, years, treasuryAfterInterestUsd, gdpUsd, turnNumber) {
    const profile = resolveProfile(value);
    if (!profile) return { ok: false, paidUsd: 0, principalPaidUsd: 0, interestPaidUsd: 0, arrearsUsd: 0, entries: [] };
    const elapsedYears = Math.max(0, finite(years) || 0);
    const turn = finite(turnNumber) ?? currentTurn();
    let cash = Math.max(0, finite(treasuryAfterInterestUsd) || 0);
    const gdp = Math.max(0, finite(gdpUsd) || 0);
    const reserveFloor = gdp * 0.005;
    cash = Math.max(0, cash - reserveFloor);
    const bank = store(true);
    const loans = bank.loansByCountry[codeOf(profile)] || [];
    let totalPaid = 0, principalPaid = 0, interestPaid = 0, totalArrears = 0;
    const entries = [];
    if (elapsedYears <= 0) return { ok: true, paidUsd: 0, principalPaidUsd: 0, interestPaidUsd: 0, arrearsUsd: 0, entries: [] };
    for (const loan of loans) {
      if (loan.status === 'REPAID') continue;
      const principal = Math.max(0, finite(loan.outstandingPrincipalUsd) || 0);
      const accrued = Math.max(0, finite(loan.accruedInterestUsd) || 0);
      const rate = Math.max(0, finite(loan.annualInterestRatePct) || 0);
      const age = Math.max(0, finite(loan.ageYears) || 0);
      const term = Math.max(1 / 365, finite(loan.termYears) || 1);
      const grace = Math.max(0, finite(loan.graceYears) || 0);
      const overdue = Math.max(0, finite(loan.arrearsUsd) || 0);
      let due;
      if (age <= grace) due = Math.max(0, finite(loan.lastInterestAccruedUsd) || 0) + overdue;
      else if (age >= term) due = principal + accrued;
      else due = annualPayment(principal, rate, Math.max(1 / 365, term - age)) * elapsedYears + overdue;
      due = Math.min(principal + accrued, Math.max(0, due));
      if (due <= 0) {
        loan.lastServiceTurn = turn;
        continue;
      }
      const paid = Math.min(due, cash);
      const paidInterest = Math.min(accrued, paid);
      const paidPrincipal = Math.min(principal, Math.max(0, paid - paidInterest));
      loan.accruedInterestUsd = round(Math.max(0, accrued - paidInterest), 6);
      loan.outstandingPrincipalUsd = round(Math.max(0, principal - paidPrincipal), 6);
      loan.totalInterestPaidUsd = round((finite(loan.totalInterestPaidUsd) || 0) + paidInterest, 6);
      loan.totalPrincipalPaidUsd = round((finite(loan.totalPrincipalPaidUsd) || 0) + paidPrincipal, 6);
      loan.arrearsUsd = round(Math.max(0, due - paid), 6);
      loan.lastServiceTurn = turn;
      loan.status = loan.outstandingPrincipalUsd <= 0.01 && loan.accruedInterestUsd <= 0.01
        ? 'REPAID' : loan.arrearsUsd > 0.01 ? 'ARREARS' : 'ACTIVE';
      cash -= paid;
      totalPaid += paid;
      principalPaid += paidPrincipal;
      interestPaid += paidInterest;
      totalArrears += loan.arrearsUsd;
      if (paid > 0.01) {
        entries.push({
          type: 'WORLD_BANK_DEBT_SERVICE', loanId: loan.loanId, countryCode: codeOf(profile),
          principalPaidUsd: round(paidPrincipal, 2), interestPaidUsd: round(paidInterest, 2),
          amountUsd: round(paid, 2), status: loan.status, turn: turn
        });
      }
      if (cash <= 0.01) break;
    }
    entries.forEach(entry => bankLedger(entry));
    return {
      ok: true, paidUsd: round(totalPaid, 2) || 0,
      principalPaidUsd: round(principalPaid, 2) || 0,
      interestPaidUsd: round(interestPaid, 2) || 0,
      arrearsUsd: round(totalArrears, 2) || 0, entries: clone(entries)
    };
  }
  function applyManualRepayment(value, amountUsd) {
    const profile = resolveProfile(value);
    if (!profile) return { ok: false, code: 'COUNTRY_NOT_FOUND', amountAppliedUsd: 0 };
    let remaining = Math.max(0, finite(amountUsd) || 0);
    const loans = (store(true).loansByCountry[codeOf(profile)] || [])
      .filter(loan => loan.status !== 'REPAID').sort((a, b) => Number(a.issuedTurn || 0) - Number(b.issuedTurn || 0));
    let applied = 0;
    for (const loan of loans) {
      if (remaining <= 0) break;
      const principal = Math.max(0, finite(loan.outstandingPrincipalUsd) || 0);
      const paid = Math.min(principal, remaining);
      loan.outstandingPrincipalUsd = round(principal - paid, 6);
      loan.totalPrincipalPaidUsd = round((finite(loan.totalPrincipalPaidUsd) || 0) + paid, 6);
      remaining -= paid;
      applied += paid;
      if (loan.outstandingPrincipalUsd <= 0.01 && (finite(loan.accruedInterestUsd) || 0) <= 0.01) loan.status = 'REPAID';
    }
    if (applied > 0) bankLedger({ type: 'WORLD_BANK_MANUAL_PRINCIPAL_REPAYMENT', countryCode: codeOf(profile), amountUsd: round(applied, 2) });
    return { ok: true, amountAppliedUsd: round(applied, 2) || 0, unappliedUsd: round(remaining, 2) || 0 };
  }

  async function fetchWB(url) {
    if (typeof global.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
    let controller = null, timer = null;
    try { if (typeof global.AbortController === 'function') controller = new global.AbortController(); } catch (_) {}
    const request = global.fetch(url, { headers: { Accept: 'application/json' }, signal: controller ? controller.signal : undefined });
    if (typeof global.setTimeout === 'function') {
      const timeout = new Promise((_, reject) => {
        timer = global.setTimeout(() => {
          try { if (controller) controller.abort(); } catch (_) {}
          reject(new Error('WORLD_BANK_REQUEST_TIMEOUT'));
        }, 12000);
      });
      try {
        const response = await Promise.race([request, timeout]);
        if (!response || response.ok === false) throw new Error('WORLD_BANK_HTTP_ERROR');
        const body = await response.json();
        if (!Array.isArray(body) || !Array.isArray(body[1])) throw new Error('WORLD_BANK_RESPONSE_INVALID');
        return body[1];
      } finally { if (timer !== null && typeof global.clearTimeout === 'function') global.clearTimeout(timer); }
    }
    const response = await request;
    if (!response || response.ok === false) throw new Error('WORLD_BANK_HTTP_ERROR');
    const body = await response.json();
    if (!Array.isArray(body) || !Array.isArray(body[1])) throw new Error('WORLD_BANK_RESPONSE_INVALID');
    return body[1];
  }
  function persistReference(reference) {
    try {
      if (global.localStorage && typeof global.localStorage.setItem === 'function') {
        global.localStorage.setItem(CACHE_KEY, JSON.stringify(reference));
      }
    } catch (_) {}
  }
  function loadReferenceCache() {
    const bank = store(true);
    const current = bank.reference;
    if (Object.keys(current.countries || {}).length > 0 && dateValue(current.refreshedAt) !== null) return;
    try {
      if (!global.localStorage || typeof global.localStorage.getItem !== 'function') return;
      const cached = JSON.parse(global.localStorage.getItem(CACHE_KEY) || 'null');
      if (isObject(cached) && isObject(cached.countries) && dateValue(cached.refreshedAt) !== null) {
        bank.reference = cached;
        if (!isObject(bank.reference.indicatorStatus)) bank.reference.indicatorStatus = {};
      }
    } catch (_) {}
  }
  function matchProfileForISO(iso3, iso2) {
    const profile = resolveProfile(iso3) || resolveProfile(iso2);
    if (profile) return profile;
    return profiles.find(item => (iso3 && iso3Of(item) === String(iso3).toUpperCase())
      || (iso2 && iso2Of(item) === String(iso2).toUpperCase())) || null;
  }
  async function refreshWorldBankData(force) {
    if (!initialized && !finance) return { ok: false, code: 'WORLD_BANK_RUNTIME_NOT_READY' };
    if (refreshPromise) return refreshPromise;
    const bank = store(true);
    const previous = bank.reference;
    const lastUpdated = dateValue(previous.refreshedAt);
    const lastAttempt = dateValue(previous.lastAttemptAt);
    const now = Date.now();
    if (!force && previous.status === 'LIVE' && lastUpdated !== null && now - lastUpdated < REFRESH_TTL_MS) {
      return { ok: true, cached: true, status: previous.status, refreshedAt: previous.refreshedAt };
    }
    if (!force && lastAttempt !== null && now - lastAttempt < RETRY_BACKOFF_MS) {
      return { ok: previous.status === 'LIVE', cached: true, status: previous.status || 'UNAVAILABLE',
        refreshedAt: previous.refreshedAt || null, lastAttemptAt: previous.lastAttemptAt || null };
    }
    refreshPromise = (async function () {
      const errors = [];
      const previousHasData = Object.values(previous.countries || {}).some(country => {
        if (!isObject(country)) return false;
        const dataValues = Object.values(isObject(country.data) ? country.data : {});
        return dataValues.some(row => finite(row && row.value) !== null)
          || Object.keys(isObject(country.metadata) ? country.metadata : {}).length > 0;
      });
      const indicatorJobs = INDICATORS.map(async indicator => {
        try {
          const url = WB_BASE + '/country/all/indicator/' + encodeURIComponent(indicator.code)
            + '?format=json&per_page=20000&date=2000%3A2026';
          const records = await fetchWB(url);
          const latest = {};
          records.forEach(row => {
            if (!row || row.value === null || row.value === undefined || row.value === '') return;
            const recordCode = String(row.countryiso3code || (row.country && row.country.id) || '').toUpperCase();
            const recordIso2 = String(row.country && row.country.id || '').toUpperCase();
            const profile = matchProfileForISO(recordCode, recordIso2);
            if (!profile) return;
            const year = finite(row.date);
            const value = finite(row.value);
            if (year === null || value === null) return;
            const code = codeOf(profile);
            if (!latest[code] || year > latest[code].year) {
              latest[code] = { value: value, year: year, indicatorCode: indicator.code, source: 'WORLD_BANK_WDI_API_V2' };
            }
          });
          return { indicator: indicator, latest: latest, ok: true };
        } catch (error) {
          errors.push({ source: indicator.code, message: String(error && error.message || error) });
          return { indicator: indicator, latest: {}, ok: false };
        }
      });
      const metadataJob = (async function () {
        try {
          const rows = await fetchWB(WB_BASE + '/country?format=json&per_page=400');
          const map = {};
          rows.forEach(row => {
            if (!row) return;
            const profile = matchProfileForISO(row.id || row.iso3Code, row.iso2Code);
            if (!profile) return;
            map[codeOf(profile)] = {
              id: row.id || iso3Of(profile),
              iso2Code: row.iso2Code || iso2Of(profile),
              name: row.name || profile.name,
              region: clone(row.region || null),
              incomeLevel: clone(row.incomeLevel || null),
              lendingType: clone(row.lendingType || null),
              source: 'WORLD_BANK_COUNTRY_METADATA_API_V2'
            };
          });
          return { ok: true, map: map };
        } catch (error) {
          errors.push({ source: 'country-metadata', message: String(error && error.message || error) });
          return { ok: false, map: {} };
        }
      })();
      const results = await Promise.all(indicatorJobs);
      const metadataResult = await metadataJob;
      let successCount = results.filter(result => result.ok).length + (metadataResult.ok ? 1 : 0);
      const countries = clone(previous.countries || {});
      profiles.forEach(profile => {
        const code = codeOf(profile);
        if (!countries[code]) countries[code] = { countryCode: code, iso3: iso3Of(profile), iso2: iso2Of(profile), data: {}, metadata: {} };
        if (!isObject(countries[code].data)) countries[code].data = {};
        if (!isObject(countries[code].metadata)) countries[code].metadata = {};
      });
      results.filter(result => result.ok).forEach(result => {
        Object.keys(result.latest).forEach(code => {
          if (!countries[code]) countries[code] = { countryCode: code, data: {}, metadata: {} };
          if (!isObject(countries[code].data)) countries[code].data = {};
          countries[code].data[result.indicator.key] = result.latest[code];
        });
      });
      if (metadataResult.ok) {
        Object.keys(metadataResult.map).forEach(code => {
          if (!countries[code]) countries[code] = { countryCode: code, data: {}, metadata: {} };
          countries[code].metadata = metadataResult.map[code];
        });
      }
      const complete = successCount === INDICATORS.length + 1;
      const status = successCount === 0
        ? (previousHasData ? 'OFFLINE_STALE' : 'UNAVAILABLE')
        : complete ? 'LIVE' : 'PARTIAL';
      const reference = {
        provider: 'WORLD_BANK_WDI_V2',
        status: status,
        countries: countries,
        indicatorStatus: Object.assign({}, previous.indicatorStatus || {}),
        refreshedAt: successCount > 0 ? new Date(now).toISOString() : previous.refreshedAt || null,
        lastAttemptAt: new Date(now).toISOString(),
        indicatorCodes: INDICATORS.map(item => item.code),
        errors: errors.slice(0, 12)
      };
      results.forEach(result => {
        reference.indicatorStatus[result.indicator.key] = {
          indicatorCode: result.indicator.code, label: result.indicator.label,
          status: result.ok ? 'OK' : 'UNAVAILABLE', observedCountries: Object.keys(result.latest).length,
          updatedAt: result.ok ? reference.refreshedAt : (previous.indicatorStatus[result.indicator.key] && previous.indicatorStatus[result.indicator.key].updatedAt) || null
        };
      });
      bank.reference = reference;
      persistReference(reference);
      evaluateAll();
      queueRender(true);
      return { ok: successCount > 0, status: status, successfulSources: successCount,
        expectedSources: INDICATORS.length + 1, countriesWithReference: Object.keys(countries).filter(code => Object.keys(countries[code].data || {}).length > 0).length,
        errors: clone(errors.slice(0, 12)), refreshedAt: reference.refreshedAt };
    })();
    try { return await refreshPromise; } finally { refreshPromise = null; }
  }
  function money(value) {
    const n = finite(value);
    if (n === null) return 'N/A';
    const abs = Math.abs(n);
    const scales = abs >= 1e12 ? [1e12, 'T'] : abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : null;
    if (scales) return (n < 0 ? '-$' : '$') + (abs / scales[0]).toLocaleString('en-US', { maximumFractionDigits: 2 }) + scales[1];
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function number(value, digits) {
    const n = finite(value);
    return n === null ? 'N/A' : n.toLocaleString('en-US', { maximumFractionDigits: digits === undefined ? 2 : digits });
  }
  function percent(value) {
    const n = finite(value);
    return n === null ? 'N/A' : n.toFixed(2) + '%';
  }
  function formatDate(value) {
    if (!value) return 'Not yet refreshed';
    const parsed = dateValue(value);
    return parsed === null ? 'Unknown' : new Date(parsed).toLocaleString();
  }
  function decisionLabel(value) {
    const map = {
      ELIGIBLE: 'Eligible',
      CONDITIONAL: 'Conditional',
      WATCHLIST: 'Watch list',
      REJECT_HIGH_RISK: 'High risk / reject',
      DATA_INSUFFICIENT: 'Data insufficient',
      CONDITIONAL_DATA_GAP: 'More data required',
      NO_LENDING_WINDOW: 'No standard lending window'
    };
    return map[value] || String(value || 'Unrated');
  }
  function decisionClass(value) {
    if (value === 'ELIGIBLE') return 'owb-good';
    if (value === 'CONDITIONAL') return 'owb-warn';
    if (value === 'REJECT_HIGH_RISK' || value === 'NO_LENDING_WINDOW') return 'owb-bad';
    return 'owb-neutral';
  }
  function countryTableRows(search) {
    const bank = store(true);
    const all = Object.values(bank.assessmentsByCountry || {}).sort((a, b) => {
      const scoreA = finite(a.score), scoreB = finite(b.score);
      if (scoreA === null && scoreB === null) return String(a.countryName).localeCompare(String(b.countryName));
      if (scoreA === null) return 1;
      if (scoreB === null) return -1;
      return scoreB - scoreA;
    });
    const query = norm(search);
    const filtered = query ? all.filter(row => norm(row.countryName).includes(query) || norm(row.countryCode).includes(query)) : all;
    const shown = filtered.slice(0, query ? 50 : 25);
    const html = shown.map(row => '<tr><td><button type="button" class="owb-country-link" data-owb-view-country="' + esc(row.countryCode) + '">' +
      esc(row.countryName) + ' <small>' + esc(row.countryCode) + '</small></button></td><td>' +
      esc(row.score === null ? 'N/A' : number(row.score, 1)) + '</td><td>' +
      '<span class="owb-state ' + decisionClass(row.decision) + '">' + esc(decisionLabel(row.decision)) + '</span></td><td>' +
      esc(money(row.maxLoanUsd)) + '</td><td>' + esc(row.program || 'N/A') + '</td><td>' + esc(number(row.confidencePct, 0)) + '%</td></tr>').join('');
    return {
      html: html || '<tr><td colspan="6" class="owb-empty">No country records match this search.</td></tr>',
      total: filtered.length, shown: shown.length, totalCountries: all.length
    };
  }
  function activeLoansTable(profile) {
    const loans = getLoanList(profile).filter(loan => loan.status !== 'REPAID');
    if (!loans.length) return '<p class="owb-empty">No active simulated World Bank facility for this country.</p>';
    return '<div class="owb-table-wrap"><table class="owb-table"><thead><tr><th>Facility</th><th>Outstanding</th><th>Principal</th><th>Accrued interest</th><th>Rate</th><th>Annual payment estimate</th><th>Term</th><th>Status</th></tr></thead><tbody>' +
      loans.map(loan => '<tr><td><strong>' + esc(loan.loanId) + '</strong><small>' + esc(loan.purpose) + '</small></td><td>' +
        esc(money((finite(loan.outstandingPrincipalUsd) || 0) + (finite(loan.accruedInterestUsd) || 0))) + '</td><td>' +
        esc(money(loan.outstandingPrincipalUsd)) + '</td><td>' + esc(money(loan.accruedInterestUsd)) + '</td><td>' +
        esc(percent(loan.annualInterestRatePct)) + '</td><td>' + esc(money(annualPayment(Math.max(0, finite(loan.outstandingPrincipalUsd) || 0), Math.max(0, finite(loan.annualInterestRatePct) || 0), Math.max(1 / 365, (finite(loan.termYears) || 1) - Math.max(finite(loan.ageYears) || 0, finite(loan.graceYears) || 0))))) + '</td><td>' + esc(number(loan.termYears, 1)) + 'y / ' + esc(number(loan.graceYears, 1)) + 'y grace</td><td>' +
        '<span class="owb-state ' + (loan.status === 'ARREARS' ? 'owb-bad' : 'owb-good') + '">' + esc(loan.status) + '</span></td></tr>').join('') +
      '</tbody></table></div>';
  }
  function ensureStyles() {
    const doc = global.document;
    if (!doc || !doc.createElement || !doc.head || doc.getElementById('omega-world-bank-lending-styles')) return;
    const style = doc.createElement('style');
    style.id = 'omega-world-bank-lending-styles';
    style.textContent = '.owb-panel{color:var(--omega-text,#e7edf5);display:grid;gap:14px}.owb-header,.owb-section-head,.owb-flex{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.owb-header h3,.owb-section h4{margin:0}.owb-sub{color:var(--omega-muted,#94a3b8);font-size:12px;line-height:1.5}.owb-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.owb-kpi,.owb-section{border:1px solid var(--omega-border,rgba(148,163,184,.25));border-radius:12px;padding:12px;background:rgba(15,23,42,.3);min-width:0}.owb-kpi small,.owb-table small{display:block;color:var(--omega-muted,#94a3b8);font-size:11px;margin-top:4px}.owb-kpi strong{display:block;font-size:19px;margin-top:5px;overflow-wrap:anywhere}.owb-section{display:grid;gap:10px}.owb-state{display:inline-block;border-radius:99px;padding:4px 8px;font-size:11px;font-weight:700;background:rgba(148,163,184,.13)}.owb-good{color:#86efac}.owb-warn{color:#fcd34d}.owb-bad{color:#fca5a5}.owb-neutral{color:#cbd5e1}.owb-table-wrap{width:100%;overflow:auto}.owb-table{border-collapse:collapse;width:100%;font-size:12px;min-width:670px}.owb-table th,.owb-table td{text-align:left;padding:9px 8px;border-bottom:1px solid rgba(148,163,184,.15);vertical-align:top}.owb-table th{color:var(--omega-muted,#94a3b8);font-weight:600}.owb-country-link{background:none;border:0;color:inherit;cursor:pointer;text-align:left;font:inherit;padding:0}.owb-country-link:hover{text-decoration:underline}.owb-btn{border:1px solid rgba(148,163,184,.4);border-radius:8px;padding:8px 11px;background:rgba(148,163,184,.12);color:inherit;cursor:pointer;font:inherit}.owb-btn:disabled{opacity:.45;cursor:not-allowed}.owb-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.owb-field{display:grid;gap:5px;font-size:12px}.owb-field input,.owb-field select,.owb-search{min-width:0;width:100%;box-sizing:border-box;padding:9px;border-radius:7px;border:1px solid rgba(148,163,184,.3);background:rgba(2,6,23,.45);color:inherit}.owb-notice{padding:10px 12px;border-radius:8px;background:rgba(148,163,184,.12);font-size:12px}.owb-empty{color:var(--omega-muted,#94a3b8);font-size:12px}.owb-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.owb-data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.owb-data-grid>div{padding:8px;border-radius:8px;background:rgba(148,163,184,.07)}.owb-data-grid small{display:block;color:var(--omega-muted,#94a3b8);font-size:11px}.owb-data-grid strong{display:block;margin-top:4px;overflow-wrap:anywhere}@media(max-width:760px){.owb-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.owb-form-grid,.owb-two-col,.owb-data-grid{grid-template-columns:1fr}.owb-table{min-width:620px}}';
    doc.head.appendChild(style);
  }
  function renderPanelHTML() {
    const profile = currentCountryProfile();
    if (!profile) return '<div class="owb-panel"><p class="owb-empty">Finance country profile is not available yet.</p></div>';
    const assessment = scoreCountry(profile);
    const bank = store(true);
    const reference = bank.reference;
    const player = playerProfile();
    const canAct = !!player && codeOf(player) === codeOf(profile);
    const table = countryTableRows(uiState.search);
    const loans = getLoanList(profile);
    const activePrincipal = loans.filter(loan => loan.status !== 'REPAID')
      .reduce((sum, loan) => sum + Math.max(0, finite(loan.outstandingPrincipalUsd) || 0), 0);
    const activeBalance = getOutstandingBalance(profile);
    const wbStatus = String(reference.status || 'UNAVAILABLE');
    const sourceAge = dateValue(reference.refreshedAt);
    const stale = sourceAge === null || Date.now() - sourceAge >= REFRESH_TTL_MS;
    let notice = uiState.notice ? '<div class="owb-notice" role="status">' + esc(uiState.notice) + '</div>' : '';
    let form = '';
    if (canAct && assessment && assessment.maxLoanUsd > 0
        && (assessment.decision === 'ELIGIBLE' || assessment.decision === 'CONDITIONAL')) {
      form = '<form class="owb-section" data-owb-form="request-loan" data-owb-request-id="WB-UI-' + esc(codeOf(profile)) + '-' + esc(currentTurn()) + '-' + esc(bank.nextSequence) + '"><div class="owb-section-head"><h4>Request simulated facility</h4><span class="owb-state ' + decisionClass(assessment.decision) + '">' + esc(decisionLabel(assessment.decision)) + '</span></div>' +
        '<div class="owb-form-grid"><label class="owb-field">Purpose<select name="purpose"><option value="infrastructure">Infrastructure</option><option value="health">Health</option><option value="education">Education</option><option value="climate">Climate resilience</option><option value="emergency">Emergency stabilization</option><option value="budget-support">Budget support</option></select></label>' +
        '<label class="owb-field">Loan principal (USD)<input name="amountUsd" type="number" min="1" max="' + esc(String(Math.floor(assessment.maxLoanUsd))) + '" step="1" value="' + esc(String(Math.floor(assessment.maxLoanUsd))) + '" required></label>' +
        '<div class="owb-flex"><button class="owb-btn" type="submit">Issue loan</button><span class="owb-sub">Limit ' + esc(money(assessment.maxLoanUsd)) + '</span></div></div>' +
        '<p class="owb-sub">Issuance posts through Finance Treasury. Rate and maturity are gameplay assumptions, not a quote or promise from the real World Bank.</p></form>';
    } else if (canAct) {
      form = '<section class="owb-section"><h4>New facility not available</h4><p class="owb-sub">' +
        esc((assessment && assessment.reasons && assessment.reasons.join(' ')) || 'The current assessment has no eligible loan ceiling.') + '</p></section>';
    } else {
      form = '<section class="owb-section"><h4>Read-only country profile</h4><p class="owb-sub">You can inspect this country’s recommendation. A loan can only be issued for the active player country through the Finance Treasury control.</p></section>';
    }
    const reasons = assessment && assessment.reasons && assessment.reasons.length
      ? '<ul class="owb-sub">' + assessment.reasons.map(reason => '<li>' + esc(reason) + '</li>').join('') + '</ul>'
      : '<p class="owb-sub">No model guardrail is currently triggered. This remains a gameplay assessment, not a real credit rating.</p>';
    const registerSearch = '<input class="owb-search" type="search" data-owb-country-filter="true" placeholder="Search any country name or code" value="' + esc(uiState.search) + '" aria-label="Search country lending register">';
    return '<div class="owb-panel" data-owb-panel><div class="owb-header"><div><div class="ofm-eyebrow">OMEGA / WORLD BANK SIMULATION</div><h3>Country credit & lending decisions</h3><p class="owb-sub">Selected profile: ' + esc(profile.name) + ' (' + esc(codeOf(profile)) + '). Live game values are reassessed each simulation turn; public World Bank reference observations refresh at most once per 24 hours.</p></div>' +
      '<div class="owb-flex"><button type="button" class="owb-btn" data-owb-action="recalculate">Recalculate countries</button><button type="button" class="owb-btn" data-owb-action="refresh-data">Refresh World Bank data</button></div></div>' +
      notice +
      '<div class="owb-kpis"><article class="owb-kpi"><small>Country credit score</small><strong>' + esc(assessment && assessment.score !== null ? number(assessment.score, 1) + '/100' : 'N/A') + '</strong><small>' + esc(assessment && assessment.riskBand || 'Unrated') + '</small></article>' +
      '<article class="owb-kpi"><small>Current recommendation</small><strong class="owb-state ' + decisionClass(assessment && assessment.decision) + '">' + esc(decisionLabel(assessment && assessment.decision)) + '</strong><small>Confidence ' + esc(number(assessment && assessment.confidencePct, 0)) + '%</small></article>' +
      '<article class="owb-kpi"><small>Maximum modeled facility</small><strong>' + esc(money(assessment && assessment.maxLoanUsd)) + '</strong><small>' + esc(assessment && assessment.program || 'No window') + '</small></article>' +
      '<article class="owb-kpi"><small>World Bank exposure</small><strong>' + esc(money(activeBalance)) + '</strong><small>Principal ' + esc(money(activePrincipal)) + '</small></article></div>' +
      '<div class="owb-section"><div class="owb-section-head"><h4>Country financial snapshot</h4><span class="owb-state ' + (stale ? 'owb-warn' : 'owb-good') + '">' + esc(wbStatus) + '</span></div>' +
      '<div class="owb-data-grid"><div><small>GDP</small><strong>' + esc(money(assessment && assessment.gdpUsd)) + '</strong></div><div><small>Public debt / GDP</small><strong>' + esc(percent(assessment && assessment.debtToGdpPct)) + '</strong></div><div><small>GDP growth</small><strong>' + esc(percent(assessment && assessment.gdpGrowthPct)) + '</strong></div><div><small>Inflation</small><strong>' + esc(percent(assessment && assessment.inflationPct)) + '</strong></div><div><small>FX reserves</small><strong>' + esc(money(assessment && assessment.reservesUsd)) + '</strong></div><div><small>Treasury cash</small><strong>' + esc(money(assessment && assessment.treasuryUsd)) + '</strong></div><div><small>Income level</small><strong>' + esc(assessment && assessment.incomeLevel || 'N/A') + '</strong></div><div><small>WB lending category</small><strong>' + esc(assessment && assessment.lendingType || assessment && assessment.program || 'N/A') + '</strong></div><div><small>Prior loan record</small><strong>' + esc(assessment && assessment.creditHistory && assessment.creditHistory.score !== null ? number(assessment.creditHistory.score, 1) + '/100' : (assessment && assessment.creditHistory && assessment.creditHistory.contracts > 0 ? 'No repayment history yet' : 'No record')) + '</strong><small>' + esc(number(assessment && assessment.creditHistory && assessment.creditHistory.repaidContracts, 0)) + ' repaid / ' + esc(number(assessment && assessment.creditHistory && assessment.creditHistory.contracts, 0)) + ' contracts · arrears ' + esc(money(assessment && assessment.creditHistory && assessment.creditHistory.arrearsUsd)) + '</small></div><div><small>Latest reference refresh</small><strong>' + esc(formatDate(reference.refreshedAt)) + '</strong></div></div>' +
      '<p class="owb-sub">Reference status: ' + esc(wbStatus) + '. Latest observation years vary by indicator and country; missing observations remain N/A. ' + esc(reasons && '') + '</p>' +
      (assessment && assessment.reasons && assessment.reasons.length ? '<ul class="owb-sub">' + assessment.reasons.map(reason => '<li>' + esc(reason) + '</li>').join('') + '</ul>' : '') +
      '</div>' + form +
      '<section class="owb-section"><div class="owb-section-head"><h4>Loan contracts & repayment</h4><span class="owb-sub">Automatic scheduled servicing protects a 0.5% of GDP Treasury cash floor where possible.</span></div>' +
      activeLoansTable(profile) + '</section>' +
      '<section class="owb-section"><div class="owb-section-head"><div><h4>All-country lending register</h4><p class="owb-sub">Assesses each Finance country profile separately. Select a row to inspect its country profile.</p></div><div class="owb-sub" data-owb-register-count>Showing ' + esc(table.shown) + ' of ' + esc(table.total) + ' matches (' + esc(table.totalCountries) + ' country profiles).</div></div>' +
      registerSearch + '<div class="owb-table-wrap"><table class="owb-table"><thead><tr><th>Country</th><th>Score</th><th>Decision</th><th>Modeled limit</th><th>Window</th><th>Confidence</th></tr></thead><tbody data-owb-country-rows>' + table.html + '</tbody></table></div></section>' +
      '<p class="owb-sub">This is a game institution using public data for reference. It does not connect to World Bank internal loan approval systems, request real funding, or move real money.</p></div>';
  }
  function renderPanel(force) {
    const doc = global.document;
    if (!doc || typeof doc.querySelector !== 'function') return false;
    const host = doc.querySelector('[data-owb-container]');
    if (!host) { uiRoot = null; return false; }
    if (!force && host.dataset && host.dataset.owbMounted === 'true') return true;
    ensureStyles();
    host.innerHTML = renderPanelHTML();
    if (host.dataset) host.dataset.owbMounted = 'true';
    uiRoot = host;
    return true;
  }
  function queueRender(force) {
    if (typeof global.setTimeout === 'function') {
      global.setTimeout(() => renderPanel(!!force), 0);
    } else renderPanel(!!force);
  }
  function installUiEvents() {
    const content = global.document && global.document.getElementById && global.document.getElementById('ministry-dashboard-content');
    if (!content || content.__omegaWorldBankLendingBound) return;
    content.__omegaWorldBankLendingBound = true;
    content.addEventListener('click', event => {
      const action = event.target && event.target.closest && event.target.closest('[data-owb-action]');
      if (action) {
        const command = action.getAttribute('data-owb-action');
        if (command === 'recalculate') {
          const result = evaluateAll();
          uiState.notice = 'Reassessed ' + result.countriesAssessed + ' country profiles for simulation turn ' + result.turn + '.';
          renderPanel(true);
        } else if (command === 'refresh-data') {
          action.disabled = true;
          refreshWorldBankData(true).then(result => {
            uiState.notice = result.ok
              ? 'World Bank reference refresh completed: ' + result.status + ', ' + result.successfulSources + '/' + result.expectedSources + ' sources.'
              : 'World Bank could not be reached. Cached observations and live Finance data were preserved.';
            renderPanel(true);
          }).catch(error => {
            uiState.notice = 'World Bank refresh failed: ' + String(error && error.message || error);
            renderPanel(true);
          });
        }
        return;
      }
      const countryLink = event.target && event.target.closest && event.target.closest('[data-owb-view-country]');
      if (countryLink) {
        const country = countryLink.getAttribute('data-owb-view-country');
        if (finance && typeof finance.selectCountry === 'function') finance.selectCountry(country);
        if (finance && typeof finance.selectTab === 'function') finance.selectTab('worldbank');
      }
    });
    content.addEventListener('input', event => {
      const search = event.target && event.target.closest && event.target.closest('[data-owb-country-filter]');
      if (!search) return;
      uiState.search = String(search.value || '').slice(0, 80);
      const host = global.document.querySelector('[data-owb-container]');
      if (!host) return;
      const rowsHost = host.querySelector('[data-owb-country-rows]');
      const countHost = host.querySelector('[data-owb-register-count]');
      const table = countryTableRows(uiState.search);
      if (rowsHost) rowsHost.innerHTML = table.html;
      if (countHost) countHost.textContent = 'Showing ' + table.shown + ' of ' + table.total + ' matches (' + table.totalCountries + ' country profiles).';
    });
    content.addEventListener('submit', async event => {
      const form = event.target;
      if (!form || !form.getAttribute || form.getAttribute('data-owb-form') !== 'request-loan') return;
      event.preventDefault();
      const data = new FormData(form);
      const profile = currentCountryProfile();
      const result = requestLoan({
        countryId: codeOf(profile),
        requestId: String(form.getAttribute('data-owb-request-id') || ''),
        amountUsd: finite(data.get('amountUsd')),
        purpose: String(data.get('purpose') || 'infrastructure')
      });
      uiState.notice = result.ok
        ? 'Loan issued: ' + result.loanId + ' for ' + money(result.loan.originalPrincipalUsd) + '. Finance Treasury and public debt were updated.'
        : 'Loan not issued (' + (result.code || 'REJECTED') + '): ' + (result.message || 'The Finance runtime did not authorize this action.');
      renderPanel(true);
    });
  }
  function installObserver() {
    installUiEvents();
    const target = global.document && global.document.getElementById && global.document.getElementById('ministry-dashboard-content');
    if (!target || observer || typeof global.MutationObserver !== 'function') return;
    observer = new global.MutationObserver(() => {
      const host = target.querySelector && target.querySelector('[data-owb-container]');
      if (host && (!host.dataset || host.dataset.owbMounted !== 'true')) renderPanel(false);
    });
    observer.observe(target, { childList: true, subtree: true });
  }
  function diagnostics() {
    const bank = store(true);
    return {
      version: VERSION, initialized: initialized, profileCount: profiles.length,
      assessedCountries: Object.keys(bank.assessmentsByCountry).length,
      activeLoans: getLoanList().filter(loan => loan.status !== 'REPAID').length,
      outstandingBalanceUsd: getLoanList().reduce((sum, loan) => sum
        + (loan.status === 'REPAID' ? 0 : Math.max(0, finite(loan.outstandingPrincipalUsd) || 0)
          + Math.max(0, finite(loan.accruedInterestUsd) || 0)), 0),
      referenceStatus: bank.reference.status || 'UNAVAILABLE',
      referenceUpdatedAt: bank.reference.refreshedAt || null,
      lastEvaluatedTurn: bank.lastEvaluatedTurn
    };
  }
  async function init() {
    if (initialized) { installObserver(); queueRender(false); return diagnostics(); }
    if (initPromise) return initPromise;
    initPromise = (async function () {
      finance = global.OmegaFinanceMinistry || (global.Omega && global.Omega.FinanceMinistry) || null;
      if (!finance || typeof finance.getProfiles !== 'function') throw new Error('FINANCE_RUNTIME_NOT_READY');
      if (typeof finance.init === 'function') await finance.init();
      profiles = finance.getProfiles() || [];
      if (!Array.isArray(profiles) || profiles.length === 0) throw new Error('ECONOMIC_PROFILE_REGISTRY_EMPTY');
      buildProfileIndex();
      store(true);
      loadReferenceCache();
      evaluateAll();
      await refreshWorldBankData(false).catch(() => ({ ok: false, status: 'UNAVAILABLE' }));
      evaluateAll();
      initialized = true;
      installObserver();
      global.addEventListener && global.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', function (event) {
        evaluateAll();
        refreshWorldBankData(false).catch(() => {});
        queueRender(true);
      });
      global.addEventListener && global.addEventListener('OMEGA_FINANCE_STATE_UPDATED', function () {
        evaluateAll();
        queueRender(true);
      });
      global.addEventListener && global.addEventListener('OMEGA_WORLD_BANK_LENDING_UPDATED', function () {
        queueRender(true);
      });
      try {
        global.Omega = global.Omega || {};
        global.Omega.WorldBankLending = api;
      } catch (_) {}
      queueRender(false);
      return diagnostics();
    })();
    try { return await initPromise; } finally { if (!initialized) initPromise = null; }
  }
  const api = {
    VERSION: VERSION,
    init: init,
    diagnostics: diagnostics,
    assessCountry: scoreCountry,
    getCreditHistory: creditHistory,
    evaluateAll: evaluateAll,
    refreshWorldBankData: refreshWorldBankData,
    requestLoan: requestLoan,
    getLoans: getLoanList,
    getOutstandingBalance: getOutstandingBalance,
    getOutstandingPrincipal: getOutstandingPrincipal,
    accrueInterest: accrueInterest,
    serviceDebt: serviceDebt,
    applyManualRepayment: applyManualRepayment,
    getState: function () { return clone(store(true)); }
  };
  global.OmegaWorldBankLending = api;
  global.Omega = global.Omega || {};
  global.Omega.WorldBankLending = api;
  if (global.document) {
    global.addEventListener && global.addEventListener('load', function () {
      init().catch(error => {
        try { console.error('[OMEGA WORLD BANK LENDING INIT]', error); } catch (_) {}
      });
    });
    if (global.document.readyState === 'complete' && typeof global.setTimeout === 'function') {
      global.setTimeout(function () { init().catch(() => {}); }, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
