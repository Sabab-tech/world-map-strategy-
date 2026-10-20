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
  const DEFAULT_OPENING_LIQUIDITY_USD = 250_000_000_000;
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
    CONCESSIONAL_SIM: { label: 'Concessional-style simulation facility', rate: 1.25, years: 35, grace: 5 },
    BLEND_SIM: { label: 'Blended simulation facility', rate: 2.25, years: 30, grace: 4 },
    STANDARD_SIM: { label: 'Standard development simulation facility', rate: 3.25, years: 20, grace: 3 }
  });

  let finance = null;
  let profiles = [];
  let byId = new Map();
  let ambiguousAliases = new Set();
  let byISO3 = new Map();
  let byISO2 = new Map();
  let ambiguousISO3 = new Set();
  let ambiguousISO2 = new Set();
  let initialized = false;
  let initPromise = null;
  let refreshPromise = null;
  let observer = null;
  let uiState = { search: '', notice: null, tab: 'overview' };
  let uiRoot = null;
  let renderQueued = false;
  let renderForcePending = false;
  let assessmentQueued = false;
  let forceAssessmentPending = false;

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
  function iso2Of(profile) { const code = String(profile && (profile.iso2 || profile.countryCode) || '').trim().toUpperCase(); return code.length === 2 ? code : ''; }
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
      if (!isObject(bank.liquidity)) bank.liquidity = {};
      if (finite(bank.liquidity.cashBalanceUsd) === null || finite(bank.liquidity.cashBalanceUsd) < 0)
        bank.liquidity.cashBalanceUsd = DEFAULT_OPENING_LIQUIDITY_USD;
      if (finite(bank.liquidity.initialCapitalUsd) === null || finite(bank.liquidity.initialCapitalUsd) < 0)
        bank.liquidity.initialCapitalUsd = bank.liquidity.cashBalanceUsd;
      if (!bank.liquidity.source) bank.liquidity.source = 'SIMULATION_RULE_OPENING_CAPITAL';
      if (!Array.isArray(bank.fundingLoans)) bank.fundingLoans = [];
      if (!Array.isArray(bank.fundingOffers)) bank.fundingOffers = [];
      if (!isObject(bank.partnersByCountry)) bank.partnersByCountry = {};
      if (!isObject(bank.insolvencyByCountry)) bank.insolvencyByCountry = {};
      if (!Array.isArray(bank.restructuringProposals)) bank.restructuringProposals = [];
      if (!finite(bank.lastInstitutionTurn)) bank.lastInstitutionTurn = -1;
      if (!isObject(bank.reference.indicatorStatus)) bank.reference.indicatorStatus = {};
      if (!bank.reference.provider) bank.reference.provider = 'WORLD_BANK_WDI_V2';
      if (!bank.reference.status) bank.reference.status = 'UNAVAILABLE';
      if (!finite(bank.lastEvaluatedTurn)) bank.lastEvaluatedTurn = -1;
    }
    return bank;
  }
  function resolveProfile(value) {
    if (value && typeof value === 'object') {
      const row = value;
      const iso3 = String(row.iso3 || (String(row.countryCode || '').trim().length === 3 ? row.countryCode : '') || '').trim().toUpperCase();
      const iso2 = String(row.iso2 || (String(row.countryCode || '').trim().length === 2 ? row.countryCode : '') || '').trim().toUpperCase();
      const exact3 = iso3 && /^[A-Z]{3}$/.test(iso3) && !ambiguousISO3.has(iso3) ? byISO3.get(iso3) || null : null;
      const exact2 = iso2 && /^[A-Z]{2}$/.test(iso2) && !ambiguousISO2.has(iso2) ? byISO2.get(iso2) || null : null;
      if ((iso3 && ambiguousISO3.has(iso3)) || (iso2 && ambiguousISO2.has(iso2))) return null;
      if (exact3 && exact2 && exact3 !== exact2) return null;
      if (exact3 || exact2) return exact3 || exact2;
      value = row.name || row.countryName || row.code || row.id;
    }
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (/^[A-Z]{3}$/.test(upper)) {
      if (ambiguousISO3.has(upper)) return null;
      const exact3 = byISO3.get(upper);
      if (exact3) return exact3;
    }
    if (/^[A-Z]{2}$/.test(upper)) {
      if (ambiguousISO2.has(upper)) return null;
      const exact2 = byISO2.get(upper);
      if (exact2) return exact2;
    }
    if (ambiguousAliases.has(upper) || ambiguousAliases.has(norm(raw))) return null;
    const exact = byId.get(upper) || byId.get(norm(raw));
    if (exact) return exact;
    try {
      if (finance && typeof finance.resolveCountry === 'function') {
        const profile = finance.resolveCountry(raw);
        if (profile && profile !== value) {
          const f3 = String(profile.iso3 || '').trim().toUpperCase();
          const f2 = String(profile.iso2 || (String(profile.countryCode || '').length === 2 ? profile.countryCode : '') || '').trim().toUpperCase();
          if ((f3 && ambiguousISO3.has(f3)) || (f2 && ambiguousISO2.has(f2))) return null;
          if (f3 && f2 && byISO3.get(f3) && byISO2.get(f2) && byISO3.get(f3) !== byISO2.get(f2)) return null;
          return profile;
        }
      }
    } catch (_) {}
    return null;
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
    ambiguousAliases = new Set();
    byISO3 = new Map();
    byISO2 = new Map();
    ambiguousISO3 = new Set();
    ambiguousISO2 = new Set();
    function addExact(index, ambiguous, code, profile) {
      const key = String(code || '').trim().toUpperCase();
      if (!key) return;
      if (ambiguous.has(key)) return;
      const previous = index.get(key);
      if (previous && previous !== profile) {
        index.delete(key);
        ambiguous.add(key);
        return;
      }
      index.set(key, profile);
    }
    function addAlias(value, profile) {
      const keys = [String(value || '').trim().toUpperCase(), norm(value)].filter(Boolean);
      for (const key of keys) {
        if (ambiguousAliases.has(key)) continue;
        const previous = byId.get(key);
        if (previous && previous !== profile) {
          byId.delete(key);
          ambiguousAliases.add(key);
        } else {
          byId.set(key, profile);
        }
      }
    }
    profiles.forEach(profile => {
      [profile.name, profile.countryCode, profile.iso3, profile.iso2, profile.numericCode, profile.economyKey]
        .filter(Boolean).forEach(value => addAlias(value, profile));
      addExact(byISO3, ambiguousISO3, profile.iso3, profile);
      addExact(byISO2, ambiguousISO2, profile.iso2 || (String(profile.countryCode || '').length === 2 ? profile.countryCode : ''), profile);
    });
  }
  function findLiveEconomy(profile, root) {
    root = root || rootState();
    if (!profile || !profile.economyKey || !isObject(root.economy)) return null;
    const record = root.economy[profile.economyKey];
    return isObject(record) ? record : null;
  }
  function findLiveFinanceModel(profile, root) {
    root = root || rootState();
    if (!profile || !isObject(root.finance)) return null;
    const keys = [profile.iso3, profile.countryCode].filter(Boolean);
    for (const key of keys) {
      const bucket = root.finance[key];
      if (isObject(bucket) && isObject(bucket.omegaFinance)) return bucket.omegaFinance;
    }
    return null;
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
  function countryFacts(value, context) {
    const profile = resolveProfile(value);
    if (!profile) return null;
    const root = context && context.root || rootState();
    const economy = findLiveEconomy(profile, root);
    const model = findLiveFinanceModel(profile, root);
    const populationRecord = isObject(root.population)
      ? (root.population[profile.populationKey] || root.population[profile.economyKey] || null) : null;
    const population = finite(populationRecord && (populationRecord.population || populationRecord.populationCurrent || populationRecord.population_2015))
      ?? finite(profile.populationValues && profile.populationValues.population_2015);
    const gdp = finite(economy && economy.gdp);
    const debt = finite(economy && economy.debt);
    const debtToGdp = gdp !== null && gdp > 0 && debt !== null ? debt / gdp * 100 : null;
    const growth = finite(economy && economy.gdp_growth);
    const inflation = finite(economy && economy.inflation);
    const unemployment = finite(economy && economy.unemployment_rate);
    const reserves = finite(economy && economy.reserves);
    const reservesToGdp = gdp !== null && gdp > 0 && reserves !== null ? reserves / gdp * 100 : null;
    const fiscalBalance = finite(economy && economy.budget_balance)
      ?? finite(model && model.fiscalModel && model.fiscalModel.annualBudgetBalanceUsd);
    const fiscalBalanceToGdp = gdp !== null && gdp > 0 && fiscalBalance !== null ? fiscalBalance / gdp * 100 : null;
    const treasury = finite(model && model.treasuryBalanceUsd)
      ?? finite(root.finance && root.finance[iso3Of(profile)] && root.finance[iso3Of(profile)].available);
    const fx = global.OmegaForexMonetaryEngine || (global.Omega && global.Omega.ForexMonetaryEngine) || null;
    let currencyCode = null, fxRateLocalPerUsd = null;
    try {
      if (fx && typeof fx.getCurrencyCode === 'function') currencyCode = fx.getCurrencyCode(profile);
      if (currencyCode && typeof fx.getRate === 'function') fxRateLocalPerUsd = finite(fx.getRate(currencyCode));
    } catch (_) {}
    return {
      countryCode: codeOf(profile), iso3: iso3Of(profile), iso2: iso2Of(profile), countryName: profile.name,
      profileStatus: profile.profileStatus || 'UNKNOWN', simulationDataAvailable: !!economy && finite(economy.gdp) !== null,
      gdpUsd: gdp, debtUsd: debt, debtToGdpPct: debtToGdp,
      gdpGrowthPct: growth, inflationPct: inflation, unemploymentPct: unemployment,
      reservesUsd: reserves, reservesToGdpPct: reservesToGdp,
      fiscalBalanceUsd: fiscalBalance, fiscalBalanceToGdpPct: fiscalBalanceToGdp,
      population: population, gdpPerCapitaUsd: gdp !== null && population !== null && population > 0 ? gdp / population : null,
      treasuryUsd: treasury, currencyCode: currencyCode,
      fxRateLocalPerUsd: fxRateLocalPerUsd,
      financeModelAvailable: !!model
    };
  }
  function creditHistory(value, bankOverride) {
    const profile = resolveProfile(value);
    if (!profile) return { score: null, contracts: 0, repaidContracts: 0, arrearsContracts: 0, arrearsUsd: 0 };
    const bank = bankOverride || store(true);
    const rows = (bank.loansByCountry[codeOf(profile)] || []).filter(loan => loan && loan.loanId);
    const repaid = rows.filter(loan => loan.status === 'REPAID').length;
    const defaultedLoans = rows.filter(loan => loan.everDefaulted === true || ['DEFAULTED', 'INSOLVENT'].includes(String(loan.status || '').toUpperCase())).length;
    const arrearsLoans = rows.filter(loan => loan.status === 'ARREARS' || (finite(loan.arrearsUsd) || 0) > 0.01).length;
    const totalOriginal = rows.reduce((sum, loan) => sum + Math.max(0, finite(loan.originalPrincipalUsd) || 0), 0);
    const arrears = rows.reduce((sum, loan) => sum + Math.max(0, finite(loan.arrearsUsd) || 0), 0);
    const hasPerformanceEvidence = rows.some(loan => repaid > 0 || (finite(loan.totalPrincipalPaidUsd) || 0) > 0.01
      || (finite(loan.totalInterestPaidUsd) || 0) > 0.01 || (finite(loan.arrearsUsd) || 0) > 0.01 || loan.everDefaulted === true);
    if (!rows.length || !hasPerformanceEvidence) {
      return { score: null, contracts: rows.length, repaidContracts: repaid,
        arrearsContracts: arrearsLoans, arrearsUsd: round(arrears, 2) || 0 };
    }
    const arrearsRatio = totalOriginal > 0 ? arrears / totalOriginal : 0;
    const defaultRatio = arrearsLoans / rows.length;
    const repaymentRatio = repaid / rows.length;
    const score = clamp(90 - Math.min(60, arrearsRatio * 300) - Math.min(35, defaultRatio * 35)
      - Math.min(25, defaultedLoans * 15) + repaymentRatio * 10, 0, 100);
    return {
      score: round(score, 1), contracts: rows.length, repaidContracts: repaid,
      arrearsContracts: arrearsLoans, defaultedContracts: defaultedLoans, arrearsUsd: round(arrears, 2) || 0
    };
  }
  function scoreCountry(value, context) {
    const facts = countryFacts(value, context);
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
    const history = creditHistory(facts.countryCode, context && context.bank);
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
    const insolvency = (context && context.bank ? context.bank : store(true)).insolvencyByCountry
      && (context && context.bank ? context.bank : store(true)).insolvencyByCountry[facts.countryCode];
    const insolventHold = !!insolvency && ['DEFAULTED', 'INSOLVENCY_REVIEW', 'BANKRUPTCY_PROCEEDING'].includes(String(insolvency.status || '').toUpperCase());
    if (insolventHold) reasons.push('New lending is frozen by the simulated sovereign default/workout status: ' + String(insolvency.status) + '.');
    if (!facts.simulationDataAvailable) reasons.push('This country has no live game-economy record; no reference data is substituted.');
    if (facts.gdpUsd === null || facts.gdpUsd <= 0) reasons.push('Current simulated GDP is unavailable; no safe loan ceiling can be calculated.');
    if (facts.debtToGdpPct === null) reasons.push('Public debt / GDP is unavailable.');
    if (confidence < 60) reasons.push('Too few credit indicators are available for a reliable lending decision.');
    if (facts.debtToGdpPct !== null && facts.debtToGdpPct >= 250) reasons.push('Debt / GDP is at or above the game model’s 250% lending guardrail.');
    if (facts.inflationPct !== null && facts.inflationPct >= 30) reasons.push('Inflation stress requires additional stabilization before standard lending.');
    if (history.arrearsContracts > 0) reasons.push('Prior simulated loan record contains overdue payments; the history component lowers the next credit score.');
    if (history.contracts === 0) reasons.push('No prior simulated World Bank loan contract exists; credit history is not penalized, but this component is unavailable.');
    if (facts.gdpPerCapitaUsd === null) reasons.push('Population is missing from game state; the standard simulation facility tier is used.');
    const criticalDataMissing = !facts.simulationDataAvailable || facts.gdpUsd === null || facts.gdpUsd <= 0 || facts.debtToGdpPct === null;
    let decision = 'DATA_INSUFFICIENT';
    if (insolventHold) decision = 'REJECT_HIGH_RISK';
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
    if (criticalDataMissing || confidence < 60 || insolventHold) maxLoanUsd = 0;
    const facility = context && context.facility || getFacilitySnapshot(context && context.bank);
    maxLoanUsd = Math.min(maxLoanUsd, facility.availableCapacityUsd);
    maxLoanUsd = round(Math.max(0, maxLoanUsd), 2);
    const riskBand = score === null ? 'UNRATED' : score >= 80 ? 'A / LOW RISK'
      : score >= 70 ? 'B / MODERATE-LOW' : score >= 55 ? 'C / MODERATE' : score >= 35 ? 'D / HIGH' : 'E / VERY HIGH';
    const result = {
      countryCode: facts.countryCode, iso3: facts.iso3, iso2: facts.iso2, countryName: facts.countryName,
      score: score, confidencePct: confidence, components: components,
      decision: decision, riskBand: riskBand, program: program,
      maxLoanUsd: maxLoanUsd, debtCapacityUsd: round(Math.max(0, debtCapUsd), 2),
      facilityCapacityUsd: facility.capacityUsd, facilityExposureUsd: facility.outstandingPrincipalUsd,
      facilityAvailableUsd: facility.availableCapacityUsd,
      debtToGdpPct: round(facts.debtToGdpPct, 2), gdpUsd: round(facts.gdpUsd, 2),
      debtUsd: round(facts.debtUsd, 2), gdpGrowthPct: round(facts.gdpGrowthPct, 2),
      inflationPct: round(facts.inflationPct, 2), reservesUsd: round(facts.reservesUsd, 2),
      reservesToGdpPct: round(facts.reservesToGdpPct, 2), treasuryUsd: round(facts.treasuryUsd, 2),
      fiscalBalanceToGdpPct: round(facts.fiscalBalanceToGdpPct, 2), population: facts.population,
      gdpPerCapitaUsd: round(facts.gdpPerCapitaUsd, 2), currencyCode: facts.currencyCode,
      fxRateLocalPerUsd: round(facts.fxRateLocalPerUsd, 6),
      simulationDataAvailable: facts.simulationDataAvailable, financeModelAvailable: facts.financeModelAvailable,
      reasons: reasons,
      creditHistory: clone(history),
      assessedTurn: currentTurn(), assessedAt: new Date().toISOString()
    };
    return result;
  }
  function lendingProgram(facts) {
    const gdpPerCapita = finite(facts && facts.gdpPerCapitaUsd);
    if (gdpPerCapita === null || gdpPerCapita < 0) return 'STANDARD_SIM';
    if (gdpPerCapita < 3500) return 'CONCESSIONAL_SIM';
    if (gdpPerCapita < 15000) return 'BLEND_SIM';
    return 'STANDARD_SIM';
  }
  function termsFor(assessment, purpose) {
    const sourceProgram = String(assessment && assessment.program || '');
    const program = sourceProgram.replace(/^PROVISIONAL_/, '');
    const base = TERMS[program] || TERMS.STANDARD_SIM;
    let rate = Number(base.rate) + Math.max(0, 70 - (finite(assessment && assessment.score) || 0)) * 0.03;
    const observedInflation = finite(assessment && assessment.inflationPct);
    if (observedInflation !== null) rate += Math.max(0, observedInflation - 10) * 0.02;
    let years = Number(base.years), grace = Number(base.grace);
    if (String(purpose || '').toLowerCase() === 'emergency') {
      rate += 0.75;
      years = Math.min(years, 15);
      grace = 1;
    }
    rate = round(clamp(rate, 0.5, 8.5), 3);
    return {
      program: sourceProgram, facilityLabel: base.label,
      annualInterestRatePct: rate, termYears: years, graceYears: grace,
      annualPaymentPerDollar: annualPayment(1, rate, years - grace)
    };
  }
  function negotiationBounds(assessment, purpose) {
    const base = termsFor(assessment, purpose);
    const score = finite(assessment && assessment.score) ?? 0;
    const discount = score >= 80 ? 0.75 : score >= 70 ? 0.5 : 0;
    const surcharge = score >= 80 ? 0.75 : score >= 70 ? 1 : score >= 55 ? 1.25 : 0;
    const termFlex = score >= 80 ? 5 : score >= 70 ? 3 : score >= 55 ? 2 : 0;
    const graceFlex = score >= 80 ? 2 : score >= 70 ? 1 : score >= 55 ? 1 : 0;
    return {
      base: base,
      minimumRatePct: round(Math.max(0.5, base.annualInterestRatePct - discount), 3),
      maximumRatePct: round(Math.min(8.5, base.annualInterestRatePct + surcharge), 3),
      minimumTermYears: Math.max(5, Math.floor(base.termYears - termFlex)),
      maximumTermYears: Math.min(40, Math.ceil(base.termYears + termFlex)),
      minimumGraceYears: Math.max(0, Math.floor(base.graceYears - graceFlex)),
      maximumGraceYears: Math.min(6, Math.ceil(base.graceYears + graceFlex)),
      reason: score >= 80 ? 'Strong current game credit permits modest concessions.'
        : score >= 70 ? 'Moderate credit permits limited rate and maturity negotiation.'
          : score >= 55 ? 'Conditional credit permits small changes; concessions are restricted.'
            : 'Credit score does not support a negotiable facility.'
    };
  }
  function negotiateTerms(assessment, purpose, input) {
    const range = negotiationBounds(assessment, purpose);
    const rate = finite(input && input.annualInterestRatePct) ?? range.base.annualInterestRatePct;
    const years = finite(input && input.termYears) ?? range.base.termYears;
    const grace = finite(input && input.graceYears) ?? range.base.graceYears;
    if (rate < range.minimumRatePct - 0.0001 || rate > range.maximumRatePct + 0.0001)
      return { ok: false, code: 'RATE_OUTSIDE_NEGOTIATION_RANGE', range: range };
    if (!Number.isInteger(years) || years < range.minimumTermYears || years > range.maximumTermYears)
      return { ok: false, code: 'TERM_OUTSIDE_NEGOTIATION_RANGE', range: range };
    if (!Number.isInteger(grace) || grace < range.minimumGraceYears || grace > range.maximumGraceYears || grace >= years)
      return { ok: false, code: 'GRACE_PERIOD_OUTSIDE_NEGOTIATION_RANGE', range: range };
    return {
      ok: true, range: range,
      terms: Object.assign({}, range.base, {
        annualInterestRatePct: round(rate, 3), termYears: years, graceYears: grace,
        annualPaymentPerDollar: annualPayment(1, rate, years - grace)
      })
    };
  }
  function currencySnapshot(code) {
    const normalized = String(code || 'USD').trim().toUpperCase();
    if (normalized === 'USD') return { ok: true, currencyCode: 'USD', localPerUsd: 1 };
    const fx = global.OmegaForexMonetaryEngine || (global.Omega && global.Omega.ForexMonetaryEngine) || null;
    if (!/^[A-Z]{3}$/.test(normalized) || !fx || typeof fx.getRate !== 'function')
      return { ok: false, code: 'FX_RATE_UNAVAILABLE', currencyCode: normalized };
    const currencies = typeof fx.getCurrencies === 'function' ? fx.getCurrencies() : [];
    if (!currencies.some(row => String(row && row.code || '').toUpperCase() === normalized))
      return { ok: false, code: 'CURRENCY_NOT_SUPPORTED', currencyCode: normalized };
    const rate = finite(fx.getRate(normalized));
    if (rate === null || rate <= 0) return { ok: false, code: 'FX_RATE_UNAVAILABLE', currencyCode: normalized };
    return { ok: true, currencyCode: normalized, localPerUsd: rate };
  }
  function annualPayment(principal, ratePct, years) {
    const p = Math.max(0, finite(principal) || 0), r = Math.max(0, finite(ratePct) || 0) / 100;
    const n = Math.max(1 / 365, finite(years) || 1 / 365);
    if (p <= 0) return 0;
    if (r <= 0.0000001) return p / n;
    const denom = 1 - Math.pow(1 + r, -n);
    return denom > 0 ? p * r / denom : p / n;
  }
  function bankLedger(row, silent) {
    const bank = store(true);
    const entry = Object.assign({ turn: currentTurn(), timestamp: new Date().toISOString() }, clone(row || {}));
    bank.ledger.push(entry);
    bank.ledger = bank.ledger.slice(-MAX_LOAN_LEDGER);
    bank.history.push(entry);
    bank.history = bank.history.slice(-MAX_HISTORY);
    if (!silent) {
      try {
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('OMEGA_WORLD_BANK_LENDING_UPDATED', { detail: clone(entry) }));
        }
      } catch (_) {}
    }
    return entry;
  }
  function evaluateAll(force) {
    const bank = store(true);
    const turnNumber = currentTurn();
    if (!force && finite(bank.lastEvaluatedTurn) === turnNumber && isObject(bank.lastEvaluationSummary))
      return Object.assign({ cached: true }, clone(bank.lastEvaluationSummary));
    const root = rootState();
    const facility = getFacilitySnapshot(bank);
    const next = {};
    let eligible = 0, conditional = 0, insufficient = 0, materialChangeCount = 0;
    for (const profile of profiles) {
      const assessment = scoreCountry(profile, { root: root, bank: bank, facility: facility });
      if (!assessment) continue;
      next[assessment.countryCode] = assessment;
      if (assessment.decision === 'ELIGIBLE') eligible++;
      else if (assessment.decision === 'CONDITIONAL') conditional++;
      else if (assessment.decision === 'DATA_INSUFFICIENT') insufficient++;
      const previous = bank.assessmentsByCountry[assessment.countryCode];
      const previousScore = finite(previous && previous.score);
      const currentScore = finite(assessment.score);
      const previousLimit = Math.max(0, finite(previous && previous.maxLoanUsd) || 0);
      const currentLimit = Math.max(0, finite(assessment.maxLoanUsd) || 0);
      const materiallyChanged = !previous
        || previous.decision !== assessment.decision
        || (previousScore === null) !== (currentScore === null)
        || (previousScore !== null && currentScore !== null && Math.abs(previousScore - currentScore) >= 2)
        || Math.abs(previousLimit - currentLimit) >= Math.max(50000000, previousLimit * 0.01);
      if (materiallyChanged) {
        bankLedger({
          type: 'COUNTRY_CREDIT_ASSESSMENT', countryCode: assessment.countryCode,
          countryName: assessment.countryName, decision: assessment.decision,
          creditScore: assessment.score, confidencePct: assessment.confidencePct,
          suggestedFacilityUsd: assessment.maxLoanUsd
        }, true);
        materialChangeCount++;
      }
    }
    bank.assessmentsByCountry = next;
    bank.lastEvaluatedTurn = turnNumber;
    bank.lastEvaluatedAt = new Date().toISOString();
    bank.lastEvaluationSummary = {
      ok: true, turn: turnNumber, countriesAssessed: Object.keys(next).length,
      eligible: eligible, conditional: conditional, insufficient: insufficient,
      materiallyChangedCountries: materialChangeCount
    };
    if (materialChangeCount > 0) {
      try {
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('OMEGA_WORLD_BANK_ASSESSMENTS_UPDATED', { detail: clone(bank.lastEvaluationSummary) }));
        }
      } catch (_) {}
    }
    return clone(bank.lastEvaluationSummary);
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
  function getFacilitySnapshot(bankOverride) {
    const bank = bankOverride || store(true);
    let exposure = 0, activeContracts = 0, fundingPrincipalUsd = 0, activeFundingContracts = 0;
    Object.keys(bank.loansByCountry || {}).forEach(code => {
      const loans = bank.loansByCountry[code];
      if (!Array.isArray(loans)) return;
      loans.forEach(loan => {
        if (!loan || loan.status === 'REPAID') return;
        exposure += Math.max(0, finite(loan.outstandingPrincipalUsd) || 0);
        activeContracts += 1;
      });
    });
    for (const loan of bank.fundingLoans || []) {
      if (!loan || ['REPAID', 'CANCELLED'].includes(String(loan.status || '').toUpperCase())) continue;
      fundingPrincipalUsd += Math.max(0, finite(loan.outstandingPrincipalUsd) || 0);
      activeFundingContracts += 1;
    }
    const capacity = Math.max(0, finite(bank.facilityCapacityUsd) ?? DEFAULT_FACILITY_CAPACITY_USD);
    const cash = Math.max(0, finite(bank.liquidity && bank.liquidity.cashBalanceUsd) || 0);
    return {
      capacityUsd: round(capacity, 2) || 0,
      outstandingPrincipalUsd: round(exposure, 2) || 0,
      availableCapacityUsd: round(Math.max(0, capacity - exposure), 2) || 0,
      activeContracts: activeContracts,
      liquidityUsd: round(cash, 2) || 0,
      externalFundingPrincipalUsd: round(fundingPrincipalUsd, 2) || 0,
      activeFundingContracts: activeFundingContracts,
      model: 'CONFIGURABLE_SIMULATED_REVOLVING_CAPACITY'
    };
  }
  function ensureInstitutionLiquidity(amountUsd, borrowerProfile) {
    const bank = store(true);
    const amount = Math.max(0, finite(amountUsd) || 0);
    const liquidity = bank.liquidity;
    let cash = Math.max(0, finite(liquidity.cashBalanceUsd) || 0);
    if (cash + 0.01 >= amount) return { ok: true, borrowedUsd: 0, cashBalanceUsd: cash };
    let needed = amount - cash;
    const root = rootState();
    const fxBank = global.OmegaGovernmentBanking || (global.Omega && global.Omega.GovernmentBanking) || null;
    if (!fxBank || typeof fxBank.fundWorldBankLiquidity !== 'function') {
      return { ok: false, code: 'WORLD_BANK_FUNDING_CONNECTOR_UNAVAILABLE', neededUsd: needed, cashBalanceUsd: cash };
    }
    const player = playerProfile();
    const facility = getFacilitySnapshot(bank);
    const candidates = [];
    for (const profile of profiles) {
      if (!profile || codeOf(profile) === codeOf(borrowerProfile)) continue;
      const partnerRecord = bank.partnersByCountry[codeOf(profile)] || null;
      if (player && codeOf(profile) === codeOf(player)
          && String(partnerRecord && partnerRecord.role || '') !== 'LENDER') continue;
      const facts = countryFacts(profile, { root: root, bank: bank });
      if (!facts || !facts.simulationDataAvailable || facts.gdpUsd === null || facts.gdpUsd <= 0
          || facts.treasuryUsd === null || facts.debtToGdpPct === null || facts.debtToGdpPct > 180) continue;
      if (facts.inflationPct !== null && facts.inflationPct > 20) continue;
      if (facts.gdpGrowthPct !== null && facts.gdpGrowthPct < -10) continue;
      const credit = scoreCountry(profile, { root: root, bank: bank, facility: facility });
      if (!credit || credit.score === null || credit.score < 65 || credit.confidencePct < 60) continue;
      const reserveFloor = Math.max(1000000, facts.gdpUsd * 0.005);
      const availableTreasury = Math.max(0, facts.treasuryUsd - reserveFloor);
      const perDrawCap = facts.gdpUsd * 0.005;
      const partner = partnerRecord || {};
      const defaultCommitment = facts.gdpUsd * 0.02;
      const committed = Math.max(0, finite(partner.commitmentLimitUsd) ?? defaultCommitment);
      const drawn = Math.max(0, finite(partner.totalDrawnUsd) || 0);
      const commitmentRemaining = Math.max(0, committed - drawn);
      const available = Math.min(availableTreasury, perDrawCap, commitmentRemaining);
      if (available <= 100000) continue;
      candidates.push({ profile: profile, facts: facts, credit: credit, availableUsd: available, commitmentLimitUsd: committed });
    }
    candidates.sort((a, b) => b.availableUsd - a.availableUsd || (b.credit.score || 0) - (a.credit.score || 0)
      || String(a.profile.name).localeCompare(String(b.profile.name)));
    let totalBorrowed = 0;
    for (const candidate of candidates) {
      if (needed <= 0.01) break;
      const amount = Math.min(needed, candidate.availableUsd);
      const rate = round(clamp(2.5 + Math.max(0, 80 - candidate.credit.score) * 0.035, 2.5, 5.25), 3);
      const turn = currentTurn();
      const contractId = 'WBF-' + codeOf(candidate.profile) + '-' + turn + '-' + String(bank.nextSequence);
      const result = fxBank.fundWorldBankLiquidity({
        authorization: 'OMEGA_WORLD_BANK_LENDING', action: 'DRAW',
        countryId: codeOf(candidate.profile), contractId: contractId, amountUsd: amount,
        minimumReserveUsd: Math.max(1000000, candidate.facts.gdpUsd * 0.005),
        annualInterestRatePct: rate, termYears: 5
      });
      if (!result || result.ok !== true) continue;
      bank.nextSequence = Number(bank.nextSequence || 1) + 1;
      const loan = {
        contractId: contractId, lenderCountryCode: codeOf(candidate.profile),
        lenderCountryName: candidate.profile.name, borrowerInstitution: 'OMEGA_SIMULATED_WORLD_BANK',
        originalPrincipalUsd: round(amount, 2), outstandingPrincipalUsd: round(amount, 2),
        accruedInterestUsd: 0, totalPrincipalPaidUsd: 0, totalInterestPaidUsd: 0,
        annualInterestRatePct: rate, termYears: 5, graceYears: 1, ageYears: 0,
        issuedTurn: turn, lastAccruedTurn: turn, daysPastDue: 0, arrearsUsd: 0,
        status: 'ACTIVE', source: 'SIMULATED_SOVEREIGN_PARTNER_FUNDING',
        lenderCreditScore: candidate.credit.score, lastPaymentTurn: null
      };
      bank.fundingLoans.push(loan);
      bank.fundingOffers.push({ contractId, countryCode: loan.lenderCountryCode,
        countryName: loan.lenderCountryName, amountUsd: loan.originalPrincipalUsd,
        annualInterestRatePct: rate, termYears: 5, status: 'ACCEPTED', turn: turn });
      bank.fundingOffers = bank.fundingOffers.slice(-MAX_HISTORY);
      const priorPartner = bank.partnersByCountry[loan.lenderCountryCode] || {};
      bank.partnersByCountry[loan.lenderCountryCode] = Object.assign({}, priorPartner, {
        countryCode: loan.lenderCountryCode, countryName: loan.lenderCountryName,
        role: 'LENDER', joinedTurn: priorPartner.joinedTurn ?? turn,
        commitmentLimitUsd: candidate.commitmentLimitUsd,
        totalDrawnUsd: (finite(priorPartner.totalDrawnUsd) || 0) + amount,
        lastFundingTurn: turn, source: priorPartner.source === 'PLAYER_EXPLICIT_CONSENT' ? priorPartner.source : 'AI_SOVEREIGN_LIQUIDITY_OFFER'
      });
      liquidity.cashBalanceUsd = Math.max(0, (finite(liquidity.cashBalanceUsd) || 0) + amount);
      liquidity.borrowedPrincipalUsd = (finite(liquidity.borrowedPrincipalUsd) || 0) + amount;
      totalBorrowed += amount;
      needed -= amount;
      bankLedger({ type: 'WORLD_BANK_PARTNER_FUNDING_DRAW', contractId,
        countryCode: loan.lenderCountryCode, countryName: loan.lenderCountryName,
        amountUsd: loan.originalPrincipalUsd, annualInterestRatePct: rate, termYears: 5 });
      cash = Math.max(0, finite(liquidity.cashBalanceUsd) || 0);
    }
    return {
      ok: cash + 0.01 >= amount,
      code: cash + 0.01 >= amount ? 'LIQUIDITY_AVAILABLE' : 'WORLD_BANK_LIQUIDITY_SHORTFALL',
      neededUsd: round(needed, 2) || 0,
      borrowedUsd: round(totalBorrowed, 2) || 0,
      cashBalanceUsd: round(cash, 2) || 0
    };
  }
  function registerFundingPartner(input) {
    input = isObject(input) ? input : {};
    if (!initialized) return { ok: false, code: 'WORLD_BANK_RUNTIME_NOT_READY' };
    const profile = resolveProfile(input.countryId || currentCountryProfile());
    if (!profile) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    const player = playerProfile();
    if (!player || codeOf(player) !== codeOf(profile))
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION', message: 'Only the active player country can approve its own lender participation.' };
    const bank = store(true);
    const root = rootState();
    const facts = countryFacts(profile, { root: root, bank: bank });
    const assessment = scoreCountry(profile, { root: root, bank: bank, facility: getFacilitySnapshot(bank) });
    if (!facts || !facts.simulationDataAvailable || facts.gdpUsd === null || facts.gdpUsd <= 0
        || facts.treasuryUsd === null || facts.debtToGdpPct === null)
      return { ok: false, code: 'PARTNER_DATA_INSUFFICIENT' };
    if (!assessment || assessment.score === null || assessment.score < 65 || assessment.confidencePct < 60)
      return { ok: false, code: 'PARTNER_CREDIT_BELOW_THRESHOLD', score: assessment && assessment.score };
    if (facts.debtToGdpPct > 180 || (facts.inflationPct !== null && facts.inflationPct > 20))
      return { ok: false, code: 'PARTNER_MACRO_RISK_ABOVE_LIMIT' };
    const reserveFloor = Math.max(1000000, facts.gdpUsd * 0.005);
    const code = codeOf(profile);
    const prior = bank.partnersByCountry[code] || {};
    const alreadyDrawn = Math.max(0, finite(prior.totalDrawnUsd) || 0);
    const freshCapacity = Math.max(0, Math.min(facts.gdpUsd * 0.02, facts.treasuryUsd - reserveFloor + alreadyDrawn));
    const maxCommitment = Math.max(alreadyDrawn, freshCapacity);
    const commitment = finite(input.commitmentLimitUsd);
    if (commitment === null || commitment < Math.max(1000000, alreadyDrawn) || commitment > maxCommitment + 0.01)
      return { ok: false, code: 'PARTNER_COMMITMENT_OUT_OF_RANGE',
        minimumUsd: round(Math.max(1000000, alreadyDrawn), 2), maximumUsd: round(maxCommitment, 2) || 0,
        message: 'Commitments cannot fall below already-drawn principal or exceed the available reserve-adjusted limit.' };
    bank.partnersByCountry[code] = Object.assign({}, prior, {
      countryCode: code, countryName: profile.name, role: 'LENDER',
      commitmentLimitUsd: round(commitment, 2), consentTurn: currentTurn(),
      joinedTurn: prior.joinedTurn ?? currentTurn(),
      totalDrawnUsd: Math.max(0, finite(prior.totalDrawnUsd) || 0),
      source: 'PLAYER_EXPLICIT_CONSENT'
    });
    bankLedger({ type: 'SOVEREIGN_LENDER_PARTNERSHIP_REGISTERED', countryCode: code,
      countryName: profile.name, commitmentLimitUsd: round(commitment, 2), score: assessment.score });
    queueRender(true);
    return { ok: true, partner: clone(bank.partnersByCountry[code]), maximumCommitmentUsd: round(maxCommitment, 2) };
  }
  function requestLoan(input) {
    input = isObject(input) ? input : {};
    if (!initialized) return { ok: false, code: 'WORLD_BANK_RUNTIME_NOT_READY' };
    const profile = resolveProfile(input.countryId || input.countryCode || currentCountryProfile());
    if (!profile) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    const player = playerProfile();
    if (!player || codeOf(player) !== codeOf(profile))
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION', message: 'Only the active player country can issue the Finance Treasury borrowing action.' };
    const bank = store(true);
    const requestId = String(input.requestId || ('WB-' + codeOf(profile) + '-' + currentTurn() + '-' + bank.nextSequence)).slice(0, 120);
    const allowedPurposes = ['infrastructure', 'health', 'education', 'climate', 'emergency', 'budget-support'];
    const purpose = allowedPurposes.includes(String(input.purpose || '').toLowerCase())
      ? String(input.purpose).toLowerCase() : 'infrastructure';
    const insolvency = bank.insolvencyByCountry && bank.insolvencyByCountry[codeOf(profile)];
    if (insolvency && ['DEFAULTED', 'INSOLVENCY_REVIEW', 'BANKRUPTCY_PROCEEDING'].includes(String(insolvency.status || '').toUpperCase()))
      return { ok: false, code: 'SOVEREIGN_INSOLVENCY_HOLD', insolvency: clone(insolvency),
        message: 'New lending is blocked during simulated default/insolvency review. Submit a bounded restructuring proposal first.' };
    const institutionStatus = String(bank.liquidity && bank.liquidity.institutionStatus || 'ACTIVE').toUpperCase();
    if (['DEFAULTED', 'BANKRUPTCY_PROCEEDING', 'RECONCILIATION_REQUIRED'].includes(institutionStatus))
      return { ok: false, code: 'INSTITUTION_LIQUIDITY_HOLD', institutionStatus: institutionStatus,
        message: 'The simulated institution has suspended new lending while funding arrears or a ledger reconciliation issue is resolved.' };
    if (bank.idempotency[requestId]) {
      const previousLoanId = bank.idempotency[requestId];
      const existing = getLoanList(profile).find(loan => loan.loanId === previousLoanId);
      if (!existing) return { ok: false, code: 'IDEMPOTENCY_REFERENCE_MISSING', loanId: previousLoanId };
      const requestedAmount = finite(input.amountUsd);
      const rateInput = finite(input.annualInterestRatePct);
      const termInput = finite(input.termYears);
      const graceInput = finite(input.graceYears);
      const currencyInput = String(input.currencyCode || existing.settlementCurrencyCode || 'USD').toUpperCase();
      if ((requestedAmount !== null && Math.abs(requestedAmount - existing.originalPrincipalUsd) > 0.01)
          || purpose !== existing.purpose
          || (rateInput !== null && Math.abs(rateInput - existing.annualInterestRatePct) > 0.0001)
          || (termInput !== null && termInput !== existing.termYears)
          || (graceInput !== null && graceInput !== existing.graceYears)
          || currencyInput !== String(existing.settlementCurrencyCode || 'USD').toUpperCase()) {
        return { ok: false, code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', message: 'This request ID was already used for different financing terms.' };
      }
      return { ok: true, duplicate: true, loan: clone(existing), loanId: previousLoanId };
    }
    const root = rootState();
    const facility = getFacilitySnapshot(bank);
    const assessment = scoreCountry(profile, { root: root, bank: bank, facility: facility });
    if (!assessment || (assessment.decision !== 'ELIGIBLE' && assessment.decision !== 'CONDITIONAL') || assessment.maxLoanUsd <= 0)
      return { ok: false, code: 'WORLD_BANK_CREDIT_REJECTED', assessment: assessment,
        message: 'The current simulated-country assessment does not support a new facility.' };
    const amount = finite(input.amountUsd) ?? assessment.maxLoanUsd;
    if (amount <= 0 || amount > assessment.maxLoanUsd + 0.01)
      return { ok: false, code: 'WORLD_BANK_AMOUNT_OUT_OF_RANGE', maxLoanUsd: assessment.maxLoanUsd,
        message: 'Requested principal must be positive and not exceed the current game-credit ceiling.' };
    const currencyCode = String(input.currencyCode || assessment.currencyCode || 'USD').trim().toUpperCase();
    const fxQuote = currencySnapshot(currencyCode);
    if (!fxQuote.ok) return { ok: false, code: fxQuote.code, currencyCode: currencyCode };
    const negotiated = negotiateTerms(assessment, purpose, input);
    if (!negotiated.ok)
      return { ok: false, code: negotiated.code, negotiation: {
        minimumRatePct: negotiated.range.minimumRatePct, maximumRatePct: negotiated.range.maximumRatePct,
        minimumTermYears: negotiated.range.minimumTermYears, maximumTermYears: negotiated.range.maximumTermYears,
        minimumGraceYears: negotiated.range.minimumGraceYears, maximumGraceYears: negotiated.range.maximumGraceYears
      } };
    if (!finance || typeof finance.applyAction !== 'function') return { ok: false, code: 'FINANCE_RUNTIME_UNAVAILABLE' };
    const liquidity = ensureInstitutionLiquidity(amount, profile);
    if (!liquidity.ok) return { ok: false, code: liquidity.code, liquidity: liquidity,
      message: 'The simulated institution does not currently have sufficient cash or approved partner funding.' };
    const terms = negotiated.terms;
    const financeResult = finance.applyAction({
      type: 'borrow', countryId: codeOf(profile), amountUsd: amount,
      description: 'Simulated institutional ' + terms.program + ' facility / ' + purpose
    });
    if (!financeResult || financeResult.ok !== true)
      return { ok: false, code: financeResult && financeResult.code || 'FINANCE_BORROW_REJECTED',
        message: financeResult && financeResult.message || 'The authoritative Finance runtime rejected this borrowing action.',
        financeResult: clone(financeResult || null) };
    bank.liquidity.cashBalanceUsd = Math.max(0, (finite(bank.liquidity.cashBalanceUsd) || 0) - amount);
    bank.liquidity.totalDisbursedUsd = (finite(bank.liquidity.totalDisbursedUsd) || 0) + amount;
    bank.liquidity.lastDisbursementTurn = currentTurn();
    const sequence = Number(bank.nextSequence || 1);
    bank.nextSequence = sequence + 1;
    const loanId = 'WB-' + codeOf(profile) + '-' + currentTurn() + '-' + sequence;
    const loan = {
      loanId: loanId, requestId: requestId, countryCode: codeOf(profile), countryName: profile.name,
      program: terms.program, facilityLabel: terms.facilityLabel, purpose: purpose,
      originalPrincipalUsd: round(amount, 2), outstandingPrincipalUsd: round(amount, 2), accruedInterestUsd: 0,
      annualInterestRatePct: terms.annualInterestRatePct, termYears: terms.termYears, graceYears: terms.graceYears,
      ageYears: 0, issuedTurn: currentTurn(), lastAccruedTurn: currentTurn(), lastInterestAccruedUsd: 0,
      arrearsUsd: 0, daysPastDue: 0, defaultedTurn: null, penaltySpreadPct: 0,
      status: 'ACTIVE', source: 'SIMULATED_WORLD_BANK_LENDING',
      settlementCurrencyCode: currencyCode, issueFxRateLocalPerUsd: fxQuote.localPerUsd,
      originalPrincipalCurrency: round(amount * fxQuote.localPerUsd, 2),
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
      graceYears: terms.graceYears, purpose: purpose, settlementCurrencyCode: currencyCode,
      issueFxRateLocalPerUsd: fxQuote.localPerUsd, originalPrincipalCurrency: loan.originalPrincipalCurrency
    });
    evaluateAll(true);
    return { ok: true, loan: clone(loan), loanId: loanId, financeResult: clone(financeResult), liquidity: liquidity };
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
      const baseRate = Math.max(0, finite(loan.annualInterestRatePct) || 0);
      const daysPastDue = Math.max(0, finite(loan.daysPastDue) || 0);
      const penaltySpread = daysPastDue > 0 || ['ARREARS', 'DEFAULTED', 'INSOLVENT'].includes(String(loan.status || '').toUpperCase()) ? 2 : 0;
      const effectiveRate = clamp(baseRate + penaltySpread, 0, 10.5);
      loan.penaltySpreadPct = penaltySpread;
      const interest = balance * (Math.pow(1 + effectiveRate / 100, elapsedYears) - 1);
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
    const elapsedDays = Math.max(0, elapsedYears * 365);
    const turn = finite(turnNumber) ?? currentTurn();
    let cash = Math.max(0, finite(treasuryAfterInterestUsd) || 0);
    const gdp = Math.max(0, finite(gdpUsd) || 0);
    const reserveFloor = gdp * 0.005;
    cash = Math.max(0, cash - reserveFloor);
    const bank = store(true);
    if (!isObject(bank.insolvencyByCountry)) bank.insolvencyByCountry = {};
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
      else if (age >= term) due = principal + accrued + overdue;
      else due = annualPayment(principal, rate, Math.max(1 / 365, term - age)) * elapsedYears + overdue;
      due = Math.min(principal + accrued, Math.max(0, due));
      if (due <= 0) {
        loan.lastServiceTurn = turn;
        if (!finite(loan.daysPastDue)) loan.daysPastDue = 0;
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
      if (loan.arrearsUsd > 0.01) {
        loan.daysPastDue = Math.max(0, finite(loan.daysPastDue) || 0) + elapsedDays;
        loan.firstMissedPaymentTurn = finite(loan.firstMissedPaymentTurn) ?? turn;
        loan.penaltySpreadPct = 2;
        loan.status = loan.daysPastDue >= 180 ? 'DEFAULTED' : 'ARREARS';
        if (loan.daysPastDue >= 180) loan.everDefaulted = true;
        const insolvencyStatus = loan.daysPastDue >= 360 ? 'BANKRUPTCY_PROCEEDING'
          : loan.daysPastDue >= 270 ? 'INSOLVENCY_REVIEW'
            : loan.daysPastDue >= 180 ? 'DEFAULTED' : 'ARREARS';
        const existing = bank.insolvencyByCountry[codeOf(profile)] || {};
        const rank = { ARREARS: 1, DEFAULTED: 2, INSOLVENCY_REVIEW: 3, BANKRUPTCY_PROCEEDING: 4 };
        const oldRank = rank[String(existing.status || '').toUpperCase()] || 0;
        if ((rank[insolvencyStatus] || 0) > oldRank) {
          bank.insolvencyByCountry[codeOf(profile)] = {
            countryCode: codeOf(profile), countryName: profile.name, status: insolvencyStatus,
            loanId: loan.loanId, overdueDays: Math.floor(loan.daysPastDue), overdueUsd: loan.arrearsUsd,
            updatedTurn: turn,
            reason: insolvencyStatus === 'BANKRUPTCY_PROCEEDING'
              ? '360 simulated days in arrears; new credit is frozen while a sovereign workout is reviewed.'
              : insolvencyStatus === 'INSOLVENCY_REVIEW'
                ? '270 simulated days in arrears; a restructuring review is required.'
                : insolvencyStatus === 'DEFAULTED'
                  ? '180 simulated days in arrears; a default hold is active.'
                  : 'A payment is overdue; the simulated notice and mediation sequence has started.'
          };
          bankLedger({ type: 'SOVEREIGN_PAYMENT_STATUS_CHANGED', loanId: loan.loanId,
            countryCode: codeOf(profile), countryName: profile.name, status: insolvencyStatus,
            overdueDays: Math.floor(loan.daysPastDue), arrearsUsd: loan.arrearsUsd });
        }
      } else {
        loan.daysPastDue = 0;
        loan.firstMissedPaymentTurn = null;
        loan.arrearsUsd = 0;
        loan.penaltySpreadPct = 0;
        loan.status = loan.outstandingPrincipalUsd <= 0.01 && loan.accruedInterestUsd <= 0.01
          ? 'REPAID' : (loan.restructuredAtTurn !== undefined && loan.restructuredAtTurn !== null ? 'RESTRUCTURED' : (loan.everDefaulted ? 'DEFAULTED' : 'ACTIVE'));
      }
      cash -= paid;
      totalPaid += paid;
      principalPaid += paidPrincipal;
      interestPaid += paidInterest;
      totalArrears += loan.arrearsUsd;
      if (paid > 0.01) entries.push({
        type: 'WORLD_BANK_DEBT_SERVICE', loanId: loan.loanId, countryCode: codeOf(profile),
        principalPaidUsd: round(paidPrincipal, 2), interestPaidUsd: round(paidInterest, 2),
        amountUsd: round(paid, 2), status: loan.status, turn: turn
      });
      if (cash <= 0.01) break;
    }
    if (totalPaid > 0.01) {
      bank.liquidity.cashBalanceUsd = Math.max(0, (finite(bank.liquidity.cashBalanceUsd) || 0) + totalPaid);
      bank.liquidity.totalRepaymentsReceivedUsd = (finite(bank.liquidity.totalRepaymentsReceivedUsd) || 0) + totalPaid;
      bank.liquidity.lastRepaymentTurn = turn;
    }
    entries.forEach(entry => bankLedger(entry, true));
    const insolvencyState = bank.insolvencyByCountry[codeOf(profile)];
    if (insolvencyState && ['DEFAULTED', 'INSOLVENCY_REVIEW', 'BANKRUPTCY_PROCEEDING'].includes(String(insolvencyState.status || '').toUpperCase())
        && loans.every(loan => loan.status === 'REPAID' || (loan.status === 'RESTRUCTURED' && (finite(loan.arrearsUsd) || 0) <= 0.01))) {
      insolvencyState.status = 'CLEARED';
      insolvencyState.resolvedTurn = turn;
      insolvencyState.reason = 'All overdue amounts were cured or moved to an approved simulated restructuring; the new-credit hold was lifted.';
      bankLedger({ type: 'SOVEREIGN_WORKOUT_HOLD_CLEARED', countryCode: codeOf(profile), countryName: profile.name, turn: turn }, true);
    }
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
    if (applied > 0) {
      bank.liquidity.cashBalanceUsd = Math.max(0, (finite(bank.liquidity.cashBalanceUsd) || 0) + applied);
      bank.liquidity.totalRepaymentsReceivedUsd = (finite(bank.liquidity.totalRepaymentsReceivedUsd) || 0) + applied;
      bankLedger({ type: 'WORLD_BANK_MANUAL_PRINCIPAL_REPAYMENT', countryCode: codeOf(profile), amountUsd: round(applied, 2) });
    }
    return { ok: true, amountAppliedUsd: round(applied, 2) || 0, unappliedUsd: round(remaining, 2) || 0 };
  }

  function requestRestructuring(input) {
    input = isObject(input) ? input : {};
    const profile = resolveProfile(input.countryId || currentCountryProfile());
    if (!profile) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    const player = playerProfile();
    if (!player || codeOf(player) !== codeOf(profile))
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION' };
    const bank = store(true);
    const loanId = String(input.loanId || '').trim();
    const loan = getLoanList(profile).find(item => item.loanId === loanId && item.status !== 'REPAID');
    if (!loan) return { ok: false, code: 'ACTIVE_LOAN_NOT_FOUND' };
    const overdue = Math.max(0, finite(loan.daysPastDue) || 0);
    if (overdue < 90 && !['DEFAULTED', 'INSOLVENT'].includes(String(loan.status || '').toUpperCase()))
      return { ok: false, code: 'RESTRUCTURING_NOT_YET_ELIGIBLE', minimumDaysPastDue: 90,
        message: 'The simulated mediation window starts after 90 overdue days unless the contract has already defaulted.' };
    const currentRate = Math.max(0.5, finite(loan.annualInterestRatePct) || 0.5);
    const rate = finite(input.annualInterestRatePct) ?? currentRate;
    const term = finite(input.termYears) ?? finite(loan.termYears);
    const grace = finite(input.graceYears) ?? 0;
    if (rate < Math.max(0.5, currentRate - 1) || rate > Math.min(10.5, currentRate + 2))
      return { ok: false, code: 'RESTRUCTURE_RATE_OUT_OF_RANGE', minimumRatePct: Math.max(0.5, currentRate - 1), maximumRatePct: Math.min(10.5, currentRate + 2) };
    if (!Number.isInteger(term) || term < Math.max(5, Math.ceil(finite(loan.termYears) || 5)) || term > Math.min(40, Math.ceil(finite(loan.termYears) || 5) + 5))
      return { ok: false, code: 'RESTRUCTURE_TERM_OUT_OF_RANGE', minimumTermYears: Math.max(5, Math.ceil(finite(loan.termYears) || 5)), maximumTermYears: Math.min(40, Math.ceil(finite(loan.termYears) || 5) + 5) };
    if (!Number.isInteger(grace) || grace < 0 || grace > 2)
      return { ok: false, code: 'RESTRUCTURE_GRACE_OUT_OF_RANGE', minimumGraceYears: 0, maximumGraceYears: 2 };
    const facts = countryFacts(profile);
    const assessment = scoreCountry(profile);
    if (!facts || !facts.simulationDataAvailable || facts.gdpUsd === null || facts.debtToGdpPct === null || facts.debtToGdpPct >= 300)
      return { ok: false, code: 'RESTRUCTURING_FISCAL_REVIEW_REQUIRED', message: 'Core game-economic data must be available and debt/GDP must remain below the 300% hard stop.' };
    if (!Array.isArray(bank.restructuringProposals)) bank.restructuringProposals = [];
    const proposalId = 'WBR-' + codeOf(profile) + '-' + currentTurn() + '-' + String(bank.nextSequence++);
    const proposed = {
      proposalId: proposalId, loanId: loanId, countryCode: codeOf(profile), countryName: profile.name,
      status: 'APPROVED_SIMULATED_WORKOUT', priorStatus: loan.status, overdueDaysAtProposal: overdue,
      annualInterestRatePct: round(rate, 3), termYears: term, graceYears: grace,
      createdTurn: currentTurn(), resolvedTurn: currentTurn(),
      terms: 'GAME_RULE_RESTRUCTURE_NOT_REAL_INTERNATIONAL_LAW'
    };
    loan.preRestructure = { status: loan.status, rate: loan.annualInterestRatePct,
      termYears: loan.termYears, graceYears: loan.graceYears, overdueDays: overdue };
    loan.outstandingPrincipalUsd = round(Math.max(0, finite(loan.outstandingPrincipalUsd) || 0), 6);
    loan.accruedInterestUsd = round(Math.max(0, finite(loan.accruedInterestUsd) || 0) + Math.max(0, finite(loan.arrearsUsd) || 0), 6);
    loan.arrearsUsd = 0;
    loan.daysPastDue = 0;
    loan.firstMissedPaymentTurn = null;
    loan.penaltySpreadPct = 0;
    loan.annualInterestRatePct = round(rate, 3);
    loan.termYears = term;
    loan.graceYears = grace;
    loan.ageYears = 0;
    loan.status = 'RESTRUCTURED';
    loan.restructuredAtTurn = currentTurn();
    loan.restructuringCount = (finite(loan.restructuringCount) || 0) + 1;
    loan.lastAccruedTurn = currentTurn();
    bank.insolvencyByCountry[codeOf(profile)] = {
      countryCode: codeOf(profile), countryName: profile.name, status: 'RESTRUCTURED',
      loanId: loanId, proposalId: proposalId, updatedTurn: currentTurn(),
      reason: 'A bounded OMEGA simulation workout reset the repayment schedule. Capital and accrued obligations remain recorded.'
    };
    bank.restructuringProposals.push(proposed);
    bank.restructuringProposals = bank.restructuringProposals.slice(-MAX_HISTORY);
    bankLedger({ type: 'SOVEREIGN_LOAN_RESTRUCTURED', countryCode: codeOf(profile), loanId: loanId,
      proposalId: proposalId, annualInterestRatePct: rate, termYears: term, graceYears: grace,
      score: assessment && assessment.score, reason: String(input.reason || 'Liquidity-stress workout').slice(0, 180) });
    evaluateAll(true);
    return { ok: true, proposal: clone(proposed), loan: clone(loan) };
  }

  function processTurn(turnNumber, stepDurationMs) {
    const bank = store(true);
    const turn = finite(turnNumber) ?? currentTurn();
    if (finite(bank.lastInstitutionTurn) === turn) return { ok: true, cached: true, turn: turn, processed: 0 };
    const dt = Math.max(0, finite(stepDurationMs) || 0);
    const years = dt / DAY_MS / 365;
    if (years <= 0) return { ok: true, turn: turn, processed: 0 };
    let processed = 0, repayments = 0, accrued = 0;
    const banking = global.OmegaGovernmentBanking || (global.Omega && global.Omega.GovernmentBanking) || null;
    for (const loan of bank.fundingLoans || []) {
      if (!loan || ['REPAID', 'CANCELLED'].includes(String(loan.status || '').toUpperCase())) continue;
      if (finite(loan.lastAccruedTurn) !== null && turn <= loan.lastAccruedTurn) continue;
      const principal = Math.max(0, finite(loan.outstandingPrincipalUsd) || 0);
      const interestBalance = Math.max(0, finite(loan.accruedInterestUsd) || 0);
      const baseRate = Math.max(0, finite(loan.annualInterestRatePct) || 0);
      const daysPastDue = Math.max(0, finite(loan.daysPastDue) || 0);
      const penaltySpread = daysPastDue > 0 ? 2 : 0;
      const effectiveRate = clamp(baseRate + penaltySpread, 0, 10.5);
      const newInterest = (principal + interestBalance) * (Math.pow(1 + effectiveRate / 100, years) - 1);
      const unsynced = Math.max(0, finite(loan.unsyncedInterestUsd) || 0) + newInterest;
      if (unsynced > 0) {
        if (!banking || typeof banking.fundWorldBankLiquidity !== 'function') {
          loan.unsyncedInterestUsd = unsynced;
          bank.liquidity.institutionStatus = 'RECONCILIATION_REQUIRED';
          continue;
        }
        const sync = banking.fundWorldBankLiquidity({
          authorization: 'OMEGA_WORLD_BANK_LENDING', action: 'ACCRUE',
          countryId: loan.lenderCountryCode, contractId: loan.contractId,
          accrualId: loan.contractId + ':TURN:' + String(turn), amountUsd: unsynced
        });
        if (!sync || sync.ok !== true) {
          loan.unsyncedInterestUsd = unsynced;
          bank.liquidity.institutionStatus = 'RECONCILIATION_REQUIRED';
          bankLedger({ type: 'WORLD_BANK_FUNDING_ACCRUAL_SYNC_FAILED', contractId: loan.contractId,
            countryCode: loan.lenderCountryCode, turn: turn, code: sync && sync.code || 'UNKNOWN' });
          continue;
        }
        loan.unsyncedInterestUsd = 0;
        loan.accruedInterestUsd = interestBalance + unsynced;
        accrued += unsynced;
      }
      loan.ageYears = Math.max(0, finite(loan.ageYears) || 0) + years;
      loan.lastAccruedTurn = turn;
      let due = loan.ageYears <= Math.max(0, finite(loan.graceYears) || 0)
        ? newInterest + Math.max(0, finite(loan.arrearsUsd) || 0)
        : annualPayment(principal, effectiveRate, Math.max(1 / 365, (finite(loan.termYears) || 1) - loan.ageYears)) * years + Math.max(0, finite(loan.arrearsUsd) || 0);
      if (loan.ageYears >= Math.max(1 / 365, finite(loan.termYears) || 1)) due = principal + loan.accruedInterestUsd;
      due = Math.max(0, Math.min(principal + loan.accruedInterestUsd, due));
      const cashPool = Math.max(0, finite(bank.liquidity.cashBalanceUsd) || 0);
      const poolFloor = Math.max(1000000, (finite(bank.liquidity.initialCapitalUsd) || DEFAULT_OPENING_LIQUIDITY_USD) * 0.01);
      const availableCash = Math.max(0, cashPool - poolFloor);
      const pay = Math.min(due, availableCash);
      const paidInterest = Math.min(loan.accruedInterestUsd, pay);
      const paidPrincipal = Math.min(principal, Math.max(0, pay - paidInterest));
      if (pay > 0.01 && banking && typeof banking.fundWorldBankLiquidity === 'function') {
        const settled = banking.fundWorldBankLiquidity({
          authorization: 'OMEGA_WORLD_BANK_LENDING', action: 'REPAY',
          countryId: loan.lenderCountryCode, contractId: loan.contractId,
          amountUsd: pay, principalPaidUsd: paidPrincipal, interestPaidUsd: paidInterest
        });
        if (!settled || settled.ok !== true) {
          bank.liquidity.institutionStatus = 'RECONCILIATION_REQUIRED';
          bankLedger({ type: 'WORLD_BANK_FUNDING_REPAYMENT_SYNC_FAILED', contractId: loan.contractId,
            countryCode: loan.lenderCountryCode, turn: turn, code: settled && settled.code || 'UNKNOWN' });
          continue;
        }
        loan.outstandingPrincipalUsd = round(Math.max(0, principal - paidPrincipal), 6);
        loan.accruedInterestUsd = round(Math.max(0, loan.accruedInterestUsd - paidInterest), 6);
        loan.totalPrincipalPaidUsd = (finite(loan.totalPrincipalPaidUsd) || 0) + paidPrincipal;
        loan.totalInterestPaidUsd = (finite(loan.totalInterestPaidUsd) || 0) + paidInterest;
        loan.arrearsUsd = round(Math.max(0, due - pay), 6);
        bank.liquidity.cashBalanceUsd = Math.max(0, cashPool - pay);
        bank.liquidity.totalFundingDebtServiceUsd = (finite(bank.liquidity.totalFundingDebtServiceUsd) || 0) + pay;
        repayments += pay;
      } else {
        loan.arrearsUsd = round(Math.max(0, due - pay), 6);
      }
      if (loan.arrearsUsd > 0.01) {
        loan.daysPastDue = Math.max(0, finite(loan.daysPastDue) || 0) + years * 365;
        loan.status = loan.daysPastDue >= 180 ? 'DEFAULTED' : 'ARREARS';
      } else if (loan.outstandingPrincipalUsd <= 0.01 && loan.accruedInterestUsd <= 0.01) {
        loan.status = 'REPAID';
        loan.daysPastDue = 0;
      } else {
        loan.status = 'ACTIVE';
        loan.daysPastDue = 0;
      }
      if (loan.daysPastDue >= 360) {
        bank.liquidity.institutionStatus = 'BANKRUPTCY_PROCEEDING';
        bank.liquidity.institutionInsolvency = { status: 'BANKRUPTCY_PROCEEDING', contractId: loan.contractId,
          lenderCountryCode: loan.lenderCountryCode, overdueDays: Math.floor(loan.daysPastDue), turn: turn,
          reason: 'OMEGA failed to service simulated sovereign partner funding for 360 days.' };
      } else if (loan.daysPastDue >= 180 && bank.liquidity.institutionStatus !== 'BANKRUPTCY_PROCEEDING') {
        bank.liquidity.institutionStatus = 'DEFAULTED';
      } else if (!['DEFAULTED', 'BANKRUPTCY_PROCEEDING', 'RECONCILIATION_REQUIRED'].includes(bank.liquidity.institutionStatus)) {
        bank.liquidity.institutionStatus = 'ACTIVE';
      }
      processed++;
    }
    const activeFunding = (bank.fundingLoans || []).filter(loan =>
      loan && !['REPAID', 'CANCELLED'].includes(String(loan.status || '').toUpperCase()));
    const reconciliationPending = activeFunding.some(loan => (finite(loan.unsyncedInterestUsd) || 0) > 0.000001);
    const overdueFunding = activeFunding.filter(loan => (finite(loan.arrearsUsd) || 0) > 0.01);
    const maxOverdueDays = overdueFunding.reduce((maximum, loan) =>
      Math.max(maximum, finite(loan.daysPastDue) || 0), 0);
    if (reconciliationPending) {
      bank.liquidity.institutionStatus = 'RECONCILIATION_REQUIRED';
    } else if (maxOverdueDays >= 360) {
      bank.liquidity.institutionStatus = 'BANKRUPTCY_PROCEEDING';
    } else if (maxOverdueDays >= 180) {
      bank.liquidity.institutionStatus = 'DEFAULTED';
    } else if (maxOverdueDays > 0) {
      bank.liquidity.institutionStatus = 'ARREARS';
    } else {
      bank.liquidity.institutionStatus = 'ACTIVE';
      if (bank.liquidity.institutionInsolvency) bank.liquidity.institutionInsolvency.resolvedTurn = turn;
      delete bank.liquidity.institutionInsolvency;
    }
    bank.lastInstitutionTurn = turn;
    return { ok: true, turn: turn, processed: processed, repaymentsUsd: round(repayments, 2) || 0,
      interestAccruedUsd: round(accrued, 2) || 0, cashBalanceUsd: bank.liquidity.cashBalanceUsd,
      status: bank.liquidity.institutionStatus || 'ACTIVE' };
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
    const a = String(iso3 || '').trim().toUpperCase();
    const b = String(iso2 || '').trim().toUpperCase();
    const profile3 = a && !ambiguousISO3.has(a) ? byISO3.get(a) || null : null;
    const profile2 = b && !ambiguousISO2.has(b) ? byISO2.get(b) || null : null;
    if (profile3 && profile2 && profile3 !== profile2) return null;
    return profile3 || profile2 || null;
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
      const indicatorJob = (async function () {
        try {
          const codes = INDICATORS.map(indicator => indicator.code).join(';');
          const url = WB_BASE + '/country/all/indicator/' + codes
            + '?format=json&per_page=20000&mrnev=1&source=2';
          const records = await fetchWB(url);
          const byIndicator = {};
          INDICATORS.forEach(indicator => { byIndicator[indicator.key] = {}; });
          const keyByCode = {};
          INDICATORS.forEach(indicator => { keyByCode[indicator.code] = indicator.key; });
          records.forEach(row => {
            if (!row || row.value === null || row.value === undefined || row.value === '') return;
            const indicatorCode = String(row.indicator && row.indicator.id || '').toUpperCase();
            const key = keyByCode[indicatorCode];
            if (!key) return;
            const recordCode = String(row.countryiso3code || '').toUpperCase();
            const recordIso2 = String(row.country && row.country.id || '').toUpperCase();
            const profile = matchProfileForISO(recordCode, recordIso2);
            if (!profile) return;
            const year = finite(row.date);
            const value = finite(row.value);
            if (year === null || value === null) return;
            const country = codeOf(profile);
            const current = byIndicator[key][country];
            if (!current || year > current.year) {
              byIndicator[key][country] = {
                value: value, year: year, indicatorCode: indicatorCode,
                source: 'WORLD_BANK_WDI_API_V2_MRNEV'
              };
            }
          });
          return {
            ok: true,
            results: INDICATORS.map(indicator => ({
              indicator: indicator, latest: byIndicator[indicator.key], ok: true
            }))
          };
        } catch (error) {
          errors.push({ source: 'world-bank-multi-indicator', message: String(error && error.message || error) });
          return {
            ok: false,
            results: INDICATORS.map(indicator => ({ indicator: indicator, latest: {}, ok: false }))
          };
        }
      })();
      const metadataJob = (async function () {
        try {
          const rows = await fetchWB(WB_BASE + '/country?format=json&per_page=400');
          const map = {};
          rows.forEach(row => {
            if (!row) return;
            const profile = matchProfileForISO(row.iso3Code, row.iso2Code || row.id);
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
      const [indicatorBatch, metadataResult] = await Promise.all([indicatorJob, metadataJob]);
      const results = indicatorBatch.results;
      let successCount = (indicatorBatch.ok ? 1 : 0) + (metadataResult.ok ? 1 : 0);
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
      const complete = successCount === 2;
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
        expectedSources: 2, countriesWithReference: Object.keys(countries).filter(code => Object.keys(countries[code].data || {}).length > 0).length,
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
    return '<div class="owb-table-wrap"><table class="owb-table"><thead><tr><th>Facility</th><th>Outstanding</th><th>Principal</th><th>Accrued interest</th><th>Rate</th><th>FX equivalent</th><th>Annual payment estimate</th><th>Term</th><th>Status</th></tr></thead><tbody>' +
      loans.map(loan => '<tr><td><strong>' + esc(loan.loanId) + '</strong><small>' + esc(loan.purpose) + '</small><small>Principal repaid: ' + esc(money(loan.totalPrincipalPaidUsd)) + '</small><small>Interest paid: ' + esc(money(loan.totalInterestPaidUsd)) + '</small></td><td>' +
        esc(money((finite(loan.outstandingPrincipalUsd) || 0) + (finite(loan.accruedInterestUsd) || 0))) + '</td><td>' +
        esc(money(loan.outstandingPrincipalUsd)) + '</td><td>' + esc(money(loan.accruedInterestUsd)) + '</td><td>' +
        esc(percent(loan.annualInterestRatePct)) + '</td><td>' + (function(){const currency=String(loan.settlementCurrencyCode||'USD').toUpperCase();const quote=currencySnapshot(currency);const equivalent=quote.ok?number((Math.max(0,finite(loan.outstandingPrincipalUsd)||0)+Math.max(0,finite(loan.accruedInterestUsd)||0))*quote.localPerUsd,2)+' '+currency:'N/A';return esc(equivalent)+'<small>Issue snapshot: '+esc(number(loan.originalPrincipalCurrency,2))+' '+esc(currency)+'</small>';})() + '</td><td>' + esc(money(annualPayment(Math.max(0, finite(loan.outstandingPrincipalUsd) || 0), Math.max(0, finite(loan.annualInterestRatePct) || 0), Math.max(1 / 365, (finite(loan.termYears) || 1) - Math.max(finite(loan.ageYears) || 0, finite(loan.graceYears) || 0))))) + '</td><td>' + esc(number(loan.termYears, 1)) + 'y / ' + esc(number(loan.graceYears, 1)) + 'y grace</td><td>' +
        '<span class="owb-state ' + (['ARREARS', 'DEFAULTED', 'INSOLVENT'].includes(String(loan.status || '').toUpperCase()) ? 'owb-bad' : loan.status === 'RESTRUCTURED' ? 'owb-warn' : 'owb-good') + '">' + esc(loan.status) + '</span><small>' + esc(number(loan.daysPastDue, 0)) + ' overdue days</small></td></tr>').join('') +
      '</tbody></table></div>';
  }
  function ensureStyles() {
    const doc = global.document;
    if (!doc || !doc.createElement || !doc.head || doc.getElementById('omega-world-bank-lending-styles')) return;
    const style = doc.createElement('style');
    style.id = 'omega-world-bank-lending-styles';
    style.textContent = '.owb-panel{color:var(--omega-text,#e7edf5);display:grid;gap:14px}.owb-header,.owb-section-head,.owb-flex{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.owb-header h3,.owb-section h4{margin:0}.owb-sub{color:var(--omega-muted,#94a3b8);font-size:12px;line-height:1.5}.owb-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.owb-kpi,.owb-section{border:1px solid var(--omega-border,rgba(148,163,184,.25));border-radius:12px;padding:12px;background:rgba(15,23,42,.3);min-width:0}.owb-kpi small,.owb-table small{display:block;color:var(--omega-muted,#94a3b8);font-size:11px;margin-top:4px}.owb-kpi strong{display:block;font-size:19px;margin-top:5px;overflow-wrap:anywhere}.owb-section{display:grid;gap:10px}.owb-state{display:inline-block;border-radius:99px;padding:4px 8px;font-size:11px;font-weight:700;background:rgba(148,163,184,.13)}.owb-good{color:#86efac}.owb-warn{color:#fcd34d}.owb-bad{color:#fca5a5}.owb-neutral{color:#cbd5e1}.owb-table-wrap{width:100%;overflow:auto}.owb-table{border-collapse:collapse;width:100%;font-size:12px;min-width:670px}.owb-table th,.owb-table td{text-align:left;padding:9px 8px;border-bottom:1px solid rgba(148,163,184,.15);vertical-align:top}.owb-table th{color:var(--omega-muted,#94a3b8);font-weight:600}.owb-country-link{background:none;border:0;color:inherit;cursor:pointer;text-align:left;font:inherit;padding:0}.owb-country-link:hover{text-decoration:underline}.owb-btn{border:1px solid rgba(148,163,184,.4);border-radius:8px;padding:8px 11px;background:rgba(148,163,184,.12);color:inherit;cursor:pointer;font:inherit}.owb-btn:disabled{opacity:.45;cursor:not-allowed}.owb-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.owb-field{display:grid;gap:5px;font-size:12px}.owb-field input,.owb-field select,.owb-search{min-width:0;width:100%;box-sizing:border-box;padding:9px;border-radius:7px;border:1px solid rgba(148,163,184,.3);background:rgba(2,6,23,.45);color:inherit}.owb-notice{padding:10px 12px;border-radius:8px;background:rgba(148,163,184,.12);font-size:12px}.owb-empty{color:var(--omega-muted,#94a3b8);font-size:12px}.owb-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.owb-data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.owb-data-grid>div{padding:8px;border-radius:8px;background:rgba(148,163,184,.07)}.owb-data-grid small{display:block;color:var(--omega-muted,#94a3b8);font-size:11px}.owb-data-grid strong{display:block;margin-top:4px;overflow-wrap:anywhere}@media(max-width:760px){.owb-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.owb-form-grid,.owb-two-col,.owb-data-grid{grid-template-columns:1fr}.owb-table{min-width:620px}}' + '.owb-icon{width:16px;height:16px;flex:0 0 16px;display:inline-block}.owb-subtabs{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:2px 0 8px;padding-bottom:8px;border-bottom:1px solid rgba(148,163,184,.25)}.owb-subtab{display:flex;align-items:center;justify-content:flex-start;gap:7px;min-width:0;min-height:46px;padding:8px 9px;border:1px solid rgba(148,163,184,.25);border-radius:9px;background:rgba(15,23,42,.28);color:inherit;cursor:pointer;font:600 11px/1.3 system-ui,sans-serif;text-align:left;transition:background .12s ease,border-color .12s ease}.owb-subtab:hover{background:rgba(71,111,142,.2);border-color:rgba(148,163,184,.65)}.owb-subtab.is-active{background:rgba(45,103,104,.23);border-color:rgba(110,231,190,.8);box-shadow:inset 0 -2px 0 rgba(110,231,190,.6);color:#d8fff0}.owb-subtab span{overflow-wrap:anywhere}.owb-inner-content{display:grid;gap:12px;min-width:0}.owb-primary{display:inline-flex;align-items:center;gap:8px;justify-content:center;border-color:rgba(110,231,190,.55);background:rgba(24,107,86,.28)}.owb-term-guard{padding:12px;border-left:3px solid #e5b567;border-radius:8px;background:rgba(130,88,24,.12);color:inherit;font-size:12px;line-height:1.55;overflow-wrap:anywhere}.owb-term-guard>strong{font-weight:800;color:#fde2a0}.owb-term-guard p{margin:5px 0}.owb-term-guard ul{margin:8px 0 0;padding-left:19px}.owb-term-guard li{margin:5px 0}.owb-metric{display:grid;gap:4px;min-width:0;padding:9px;border:1px solid rgba(148,163,184,.15);border-radius:8px;background:rgba(148,163,184,.05)}.owb-metric small{color:var(--omega-muted,#94a3b8);font-size:11px}.owb-metric strong{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.owb-risk-box{border:1px solid rgba(248,113,113,.4);background:rgba(127,29,29,.13)}.owb-reasons{margin:0;padding-left:20px;color:var(--omega-muted,#94a3b8);font-size:12px;line-height:1.5}.owb-reasons li{margin:5px 0}.owb-field small{font-size:11px;color:var(--omega-muted,#94a3b8);line-height:1.4}.owb-header .owb-btn{display:inline-flex;align-items:center;gap:7px}@media(max-width:1050px){.owb-subtabs{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:600px){.owb-subtabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.owb-subtab{min-height:44px;padding:8px 7px;font-size:11px}.owb-header{align-items:flex-start}.owb-header>.owb-flex{width:100%;justify-content:flex-start}.owb-header .owb-btn{flex:1;justify-content:center}.owb-form-grid{grid-template-columns:minmax(0,1fr)}.owb-term-guard{font-size:11px}.owb-section{padding:10px}}';
    doc.head.appendChild(style);
  }
  function svgIcon(name) {
    const paths = {
      overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      loan: '<path d="M12 3v18"/><path d="M17 7H9.5a3.5 3.5 0 0 0 0 7H14a3 3 0 0 1 0 6H6"/>',
      contracts: '<path d="M8 3h8l4 4v14H4V3z"/><path d="M16 3v5h4M8 12h8M8 16h8"/>',
      countries: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
      partners: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6M17 11h6"/>',
      reference: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
      rules: '<path d="M12 3 20 7v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7z"/><path d="m9 12 2 2 4-4"/>',
      refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/>',
      calculate: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 7h6M9 12h1m4 0h1M9 16h1m4 0h1"/>',
      arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
      shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>'
    };
    return '<svg class="owb-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.overview) + '</svg>';
  }
  function subtabButton(id, label, icon) {
    return '<button type="button" class="owb-subtab' + (uiState.tab === id ? ' is-active' : '')
      + '" data-owb-subtab="' + esc(id) + '" aria-pressed="' + (uiState.tab === id ? 'true' : 'false') + '">'
      + svgIcon(icon) + '<span>' + esc(label) + '</span></button>';
  }
  function renderOverviewPane(profile, assessment, facility, bank, canAct) {
    const facts = countryFacts(profile);
    const activeLoans = getLoanList(profile).filter(loan => loan.status !== 'REPAID');
    const insolvency = bank.insolvencyByCountry && bank.insolvencyByCountry[codeOf(profile)];
    const liquidity = bank.liquidity || {};
    const currency = facts && facts.currencyCode || 'USD';
    const fx = currencySnapshot(currency);
    const localEquivalent = fx.ok && assessment && assessment.gdpUsd !== null
      ? number(assessment.gdpUsd * fx.localPerUsd, 2) + ' ' + currency : 'N/A';
    const history = assessment && assessment.creditHistory || {};
    const historyLabel = finite(history.score) !== null ? number(history.score, 1) + '/100 · '
      + number(history.repaidContracts, 0) + ' repaid / ' + number(history.contracts, 0) + ' contracts'
      : (finite(history.contracts) > 0 ? 'No repayment performance yet' : 'No prior simulated record');
    const metrics = [
      ['Simulated GDP', money(assessment && assessment.gdpUsd)],
      ['Public debt / GDP', percent(assessment && assessment.debtToGdpPct)],
      ['GDP growth', percent(assessment && assessment.gdpGrowthPct)],
      ['Inflation', percent(assessment && assessment.inflationPct)],
      ['Treasury cash', money(assessment && assessment.treasuryUsd)],
      ['FX reserves', money(assessment && assessment.reservesUsd)],
      ['Prior repayment record', historyLabel]
    ];
    const cards = metrics.map(item => '<div class="owb-metric"><small>' + esc(item[0]) + '</small><strong>' + esc(item[1]) + '</strong></div>').join('');
    const reasons = assessment && assessment.reasons && assessment.reasons.length
      ? '<ul class="owb-reasons">' + assessment.reasons.map(reason => '<li>' + esc(reason) + '</li>').join('') + '</ul>'
      : '<p class="owb-sub">No credit guardrail is currently triggered. The score is a game heuristic, not an official rating.</p>';
    const institutionStatus = String(liquidity.institutionStatus || 'ACTIVE').toUpperCase();
    const institutionHold = ['DEFAULTED', 'BANKRUPTCY_PROCEEDING', 'RECONCILIATION_REQUIRED'].includes(institutionStatus)
      ? '<div class="owb-notice owb-risk-box"><strong>IMPORTANT · INSTITUTIONAL ' + esc(institutionStatus.replace(/_/g, ' ')) + '</strong><p>New loan disbursements are frozen. Resolve partner arrears or ledger reconciliation before issuing new credit.</p></div>'
      : '';
    return institutionHold + '<section class="owb-section"><div class="owb-section-head"><h4>Selected country · ' + esc(profile.name) + '</h4><span class="owb-state ' + decisionClass(assessment && assessment.decision) + '">' + esc(decisionLabel(assessment && assessment.decision)) + '</span></div>'
      + '<div class="owb-kpis"><article class="owb-kpi"><small>Credit score</small><strong>' + esc(assessment && assessment.score !== null ? number(assessment.score, 1) + '/100' : 'N/A') + '</strong><small>' + esc(assessment && assessment.riskBand || 'Unrated') + '</small></article>'
      + '<article class="owb-kpi"><small>Maximum new facility</small><strong>' + esc(money(assessment && assessment.maxLoanUsd)) + '</strong><small>USD · confidence ' + esc(number(assessment && assessment.confidencePct, 0)) + '%</small></article>'
      + '<article class="owb-kpi"><small>Active borrower contracts</small><strong>' + esc(number(activeLoans.length, 0)) + '</strong><small>Exposure ' + esc(money(getOutstandingBalance(profile))) + '</small></article>'
      + '<article class="owb-kpi"><small>Institution liquidity</small><strong>' + esc(money(liquidity.cashBalanceUsd)) + '</strong><small>Available simulated cash pool</small></article>'
      + '<article class="owb-kpi"><small>Revolving capacity left</small><strong>' + esc(money(facility.availableCapacityUsd)) + '</strong><small>of ' + esc(money(facility.capacityUsd)) + ' game capacity</small></article></div>'
      + '<div class="owb-data-grid">' + cards + '<div class="owb-metric"><small>Simulation currency</small><strong>' + esc(currency) + '</strong><small>Current simulated equivalent</small><strong>' + esc(localEquivalent) + '</strong></div>'
      + '<div class="owb-metric"><small>Game funding sources</small><strong>' + esc(number(facility.activeFundingContracts, 0)) + ' partner contracts</strong><small>Outstanding ' + esc(money(facility.externalFundingPrincipalUsd)) + '</small></div></div>'
      + (insolvency ? '<div class="owb-notice owb-risk-box"><strong>IMPORTANT · ' + esc(String(insolvency.status || 'INSOLVENCY REVIEW')) + '</strong><p>' + esc(insolvency.reason || 'New borrowing is frozen pending the simulated workout process.') + '</p></div>' : '')
      + '<div class="owb-section"><div class="owb-section-head"><h4>Decision guardrails</h4><span class="owb-sub">Live game-state inputs only</span></div>' + reasons + '</div>'
      + '<p class="owb-sub">Published World Bank observations are isolated in the Reference data tab and never substituted into the simulated credit calculation. Internal contract accounting is USD; the local-currency figure above is a display equivalent using the current simulated FX quote.</p>'
      + '</section>';
  }
  function renderLoanPane(profile, assessment, canAct, bank) {
    const institutionStatus = String(bank && bank.liquidity && bank.liquidity.institutionStatus || 'ACTIVE').toUpperCase();
    if (['DEFAULTED', 'BANKRUPTCY_PROCEEDING', 'RECONCILIATION_REQUIRED'].includes(institutionStatus))
      return '<section class="owb-section"><div class="owb-term-guard"><strong>IMPORTANT · NEW LENDING FROZEN</strong><p>The simulated institution is in ' + esc(institutionStatus.replace(/_/g, ' ')) + ' status. Clear overdue partner funding or reconciliation first.</p></div></section>';
    if (!assessment || assessment.maxLoanUsd <= 0 || !['ELIGIBLE', 'CONDITIONAL'].includes(assessment.decision)) {
      return '<section class="owb-section"><h4>New facility unavailable</h4><p class="owb-sub">' + esc(assessment && assessment.reasons && assessment.reasons.join(' ') || 'The current simulation does not support a new facility.') + '</p></section>';
    }
    if (!canAct) return '<section class="owb-section"><h4>Read-only country</h4><p class="owb-sub">You can inspect terms for this country. Issuance is restricted to the active player country.</p></section>';
    const base = termsFor(assessment, 'infrastructure');
    const bounds = negotiationBounds(assessment, 'infrastructure');
    const currencies = global.OmegaForexMonetaryEngine && typeof global.OmegaForexMonetaryEngine.getCurrencies === 'function'
      ? global.OmegaForexMonetaryEngine.getCurrencies() : [];
    const currencyCode = assessment.currencyCode || 'USD';
    const currencyOptions = ['USD', ...currencies.map(row => String(row.code || '').toUpperCase()).filter(code => /^[A-Z]{3}$/.test(code) && code !== 'USD')]
      .filter((code, index, list) => list.indexOf(code) === index).map(code =>
        '<option value="' + esc(code) + '"' + (code === currencyCode ? ' selected' : '') + '>' + esc(code) + '</option>').join('');
    return '<form class="owb-section" data-owb-form="request-loan" data-owb-request-id="WB-UI-' + esc(codeOf(profile)) + '-' + esc(currentTurn()) + '-' + esc(bank.nextSequence) + '">'
      + '<div class="owb-section-head"><h4>New simulated loan proposal</h4><span class="owb-state ' + decisionClass(assessment.decision) + '">' + esc(decisionLabel(assessment.decision)) + '</span></div>'
      + '<div class="owb-form-grid"><label class="owb-field">Purpose<select name="purpose" data-owb-purpose><option value="infrastructure">Infrastructure</option><option value="health">Health</option><option value="education">Education</option><option value="climate">Climate resilience</option><option value="emergency">Emergency stabilisation</option><option value="budget-support">Budget support</option></select></label>'
      + '<label class="owb-field">Principal requested · USD<input name="amountUsd" type="number" min="1" max="' + esc(String(Math.floor(assessment.maxLoanUsd))) + '" step="1" value="' + esc(String(Math.floor(assessment.maxLoanUsd))) + '" required></label>'
      + '<label class="owb-field">Local-currency equivalent<select name="currencyCode">' + currencyOptions + '</select><small>USD remains the authoritative debt ledger. Equivalent uses simulation FX only.</small></label>'
      + '<label class="owb-field">Annual interest / financing return<input name="annualInterestRatePct" type="number" min="' + esc(String(bounds.minimumRatePct)) + '" max="' + esc(String(bounds.maximumRatePct)) + '" step="0.05" value="' + esc(String(base.annualInterestRatePct)) + '" required></label>'
      + '<label class="owb-field">Term · years<input name="termYears" type="number" min="' + esc(String(bounds.minimumTermYears)) + '" max="' + esc(String(bounds.maximumTermYears)) + '" step="1" value="' + esc(String(base.termYears)) + '" required></label>'
      + '<label class="owb-field">Grace period · years<input name="graceYears" type="number" min="' + esc(String(bounds.minimumGraceYears)) + '" max="' + esc(String(bounds.maximumGraceYears)) + '" step="1" value="' + esc(String(base.graceYears)) + '" required></label></div>'
      + '<div class="owb-term-guard"><strong>IMPORTANT · Negotiation limits</strong><p>Rate: ' + esc(percent(bounds.minimumRatePct)) + ' to ' + esc(percent(bounds.maximumRatePct)) + '. Term: ' + esc(bounds.minimumTermYears) + '–' + esc(bounds.maximumTermYears) + ' years. Grace: ' + esc(bounds.minimumGraceYears) + '–' + esc(bounds.maximumGraceYears) + ' years.</p>'
      + '<p>Penalty spread is capped at 2 percentage points. Missed-payment notices start after 30 simulated days; a default hold is possible after 180 days, and insolvency review after 360 days in arrears.</p></div>'
      + '<div class="owb-flex"><button class="owb-btn owb-primary" type="submit">' + svgIcon('loan') + ' Issue simulated loan</button><span class="owb-sub">Credit limit ' + esc(money(assessment.maxLoanUsd)) + '</span></div>'
      + '<p class="owb-sub">Illustrative contract, not real World Bank approval. Interest, term and FX are bounded game rules. Missing live game inputs stop disbursement.</p></form>';
  }
  function renderContractsPane(profile, bank) {
    const loans = getLoanList(profile);
    const insolvency = bank.insolvencyByCountry && bank.insolvencyByCountry[codeOf(profile)];
    const active = loans.filter(loan => loan.status !== 'REPAID');
    const defaulted = active.filter(loan => ['DEFAULTED', 'INSOLVENT'].includes(String(loan.status || '').toUpperCase())).length;
    const restructuring = insolvency && insolvency.status ? '<div class="owb-notice owb-risk-box"><strong>IMPORTANT · ' + esc(insolvency.status) + '</strong><p>' + esc(insolvency.reason || 'New credit is suspended during the simulated workout.') + '</p>'
      + '<p><strong>Workout rules:</strong> existing payments continue where possible; automatic new borrowing stays frozen until the restructuring is accepted or overdues are cured.</p></div>' : '';
    const player = playerProfile();
    const canAct = !!player && codeOf(player) === codeOf(profile);
    const workoutLoan = active.find(loan => Math.max(0, finite(loan.daysPastDue) || 0) >= 90
      || ['DEFAULTED', 'INSOLVENT'].includes(String(loan.status || '').toUpperCase()));
    let workoutForm = '';
    if (canAct && workoutLoan) {
      const rate = Math.max(0.5, finite(workoutLoan.annualInterestRatePct) || 1);
      const minRate = Math.max(0.5, rate - 1);
      const maxRate = Math.min(10.5, rate + 2);
      const oldTerm = Math.max(5, Math.ceil(finite(workoutLoan.termYears) || 5));
      const maxTerm = Math.min(40, oldTerm + 5);
      workoutForm = '<form class="owb-section" data-owb-form="restructure" data-owb-loan-id="' + esc(workoutLoan.loanId) + '"><div class="owb-section-head"><h4>Request bounded restructuring</h4><span class="owb-state owb-warn">' + esc(number(workoutLoan.daysPastDue, 0)) + ' days overdue</span></div>'
        + '<div class="owb-form-grid"><label class="owb-field">Proposed annual rate<input type="number" name="annualInterestRatePct" min="' + esc(String(minRate)) + '" max="' + esc(String(maxRate)) + '" step="0.05" value="' + esc(String(rate)) + '" required></label>'
        + '<label class="owb-field">New repayment term<input type="number" name="termYears" min="' + esc(String(oldTerm)) + '" max="' + esc(String(maxTerm)) + '" step="1" value="' + esc(String(maxTerm)) + '" required></label>'
        + '<label class="owb-field">Temporary grace period<input type="number" name="graceYears" min="0" max="2" step="1" value="1" required></label>'
        + '<label class="owb-field">Reason<select name="reason"><option value="temporary-liquidity-shock">Temporary liquidity shock</option><option value="revenue-collapse">Revenue collapse</option><option value="currency-stress">Currency stress</option><option value="disaster-recovery">Disaster recovery</option></select></label></div>'
        + '<p class="owb-term-guard"><strong>IMPORTANT:</strong> rate range ' + esc(percent(minRate)) + '–' + esc(percent(maxRate)) + '; maturity ' + esc(oldTerm) + '–' + esc(maxTerm) + ' years; grace period at most two years. Accrued obligations remain on record.</p>'
        + '<button class="owb-btn owb-primary" type="submit">' + svgIcon('shield') + ' Submit workout proposal</button></form>';
    }
    return '<section class="owb-section"><div class="owb-section-head"><h4>Loan contracts & repayment</h4><span class="owb-sub">' + esc(active.length) + ' active · ' + esc(defaulted) + ' in default</span></div>'
      + restructuring + activeLoansTable(profile) + workoutForm
      + '<div class="owb-term-guard"><strong>IMPORTANT · Simulated sovereign workout protocol</strong><p>30 days overdue: formal notice. 90 days: mediation review. 180 days: default and new-credit hold. 270 days: restructuring review. 360 days: insolvency/bankruptcy review.</p>'
      + '<p>These are OMEGA gameplay rules inspired by debt-workout processes, not a statement of binding real-world international law.</p></div></section>';
  }
  function renderCountriesPane(table) {
    const registerSearch = '<input class="owb-search" type="search" data-owb-country-filter="true" placeholder="Search country name or ISO code" value="' + esc(uiState.search) + '" aria-label="Search country lending register">';
    return '<section class="owb-section"><div class="owb-section-head"><h4>Country lending register</h4><span class="owb-sub" data-owb-register-count>Showing ' + esc(table.shown) + ' of ' + esc(table.total) + ' matches (' + esc(table.totalCountries) + ' profiles)</span></div>'
      + registerSearch + '<div class="owb-table-wrap"><table class="owb-table"><thead><tr><th>Country</th><th>Score</th><th>Decision</th><th>Modeled limit</th><th>Simulation tier</th><th>Confidence</th></tr></thead><tbody data-owb-country-rows>' + table.html + '</tbody></table></div>'
      + '<p class="owb-sub">Country rows use their exact canonical identity. Missing simulation facts remain unavailable; World Bank reference observations are not used to fill credit fields.</p></section>';
  }
  function renderPartnersPane(profile, assessment, bank, canAct, facility) {
    const liquidity = bank.liquidity || {};
    const partners = Object.values(bank.partnersByCountry || {});
    const rows = partners.length ? '<div class="owb-table-wrap"><table class="owb-table"><thead><tr><th>Partner country</th><th>Role</th><th>Committed cap</th><th>Drawn</th><th>Joined turn</th></tr></thead><tbody>'
      + partners.map(row => '<tr><td>' + esc(row.countryName || row.countryCode) + '</td><td>' + esc(row.role || 'MEMBER') + '</td><td>' + esc(money(row.commitmentLimitUsd)) + '</td><td>' + esc(money(row.totalDrawnUsd)) + '</td><td>' + esc(number(row.joinedTurn, 0)) + '</td></tr>').join('')
      + '</tbody></table></div>' : '<p class="owb-empty">No registered sovereign funding partners yet.</p>';
    const facts = countryFacts(profile);
    const currentPartner = bank.partnersByCountry && bank.partnersByCountry[codeOf(profile)];
    const alreadyDrawn = Math.max(0, finite(currentPartner && currentPartner.totalDrawnUsd) || 0);
    const reserveFloor = facts && facts.gdpUsd !== null ? Math.max(1000000, facts.gdpUsd * 0.005) : null;
    const freshCapacity = facts && facts.gdpUsd !== null && facts.treasuryUsd !== null && reserveFloor !== null
      ? Math.max(0, Math.min(facts.gdpUsd * 0.02, facts.treasuryUsd - reserveFloor + alreadyDrawn)) : 0;
    const maxCommit = Math.max(alreadyDrawn, freshCapacity);
    let form = '<div class="owb-notice"><strong>IMPORTANT · Voluntary participation</strong><p>A player-controlled country is never auto-debited as a lender unless you explicitly register it. NPC lender countries may offer capped liquidity under the same reserve/credit rules.</p></div>';
    if (canAct && assessment && assessment.score >= 65 && maxCommit > 0) {
      form += '<form class="owb-section" data-owb-form="partner"><div class="owb-section-head"><h4>' + (currentPartner && currentPartner.role === 'LENDER' ? 'Update lender commitment' : 'Register as a sovereign funding partner') + '</h4></div>'
        + '<label class="owb-field">Maximum aggregate commitment · USD<input type="number" name="commitmentLimitUsd" min="' + esc(String(Math.max(1000000, alreadyDrawn))) + '" max="' + esc(String(Math.floor(maxCommit))) + '" step="1000000" value="' + esc(String(Math.floor(currentPartner && currentPartner.commitmentLimitUsd || Math.max(1000000, Math.min(maxCommit, facts.gdpUsd * 0.005)))) ) + '" required></label>'
        + '<p class="owb-sub">Maximum ' + esc(money(maxCommit)) + '. Minimum cash reserve remains protected; per-draw cap is 0.5% of GDP. Funds move only when the simulated institution is short and records a repayable funding contract.</p>'
        + '<button class="owb-btn owb-primary" type="submit">' + svgIcon('partners') + ' Save partner consent</button></form>';
    } else if (canAct) {
      form += '<p class="owb-sub">This country does not currently satisfy the simulated partner-credit, data or reserve threshold.</p>';
    } else {
      form += '<p class="owb-sub">Inspect partner status read-only. Only the active player country can register its own consent.</p>';
    }
    return '<div class="owb-kpis"><article class="owb-kpi"><small>Institution cash pool</small><strong>' + esc(money(liquidity.cashBalanceUsd)) + '</strong></article>'
      + '<article class="owb-kpi"><small>Partner principal outstanding</small><strong>' + esc(money(facility.externalFundingPrincipalUsd)) + '</strong></article>'
      + '<article class="owb-kpi"><small>Registered funding partners</small><strong>' + esc(number(partners.filter(p => p.role === 'LENDER').length, 0)) + '</strong></article>'
      + '<article class="owb-kpi"><small>Current country commitment</small><strong>' + esc(money(currentPartner && currentPartner.commitmentLimitUsd)) + '</strong></article></div>'
      + form + '<section class="owb-section"><h4>Funding partner register</h4>' + rows + '</section>'
      + '<p class="owb-sub">Partner finance is simulated, ledgered and repayable; it does not represent a real World Bank syndication or external bank account.</p>';
  }
  function renderReferencePane(profile, bank) {
    const reference = bank.reference || {};
    const row = referenceFor(profile);
    const data = row.data || {};
    const rows = INDICATORS.map(indicator => {
      const item = data[indicator.key] || {};
      return '<tr><td>' + esc(indicator.label) + '</td><td>' + esc(item.value === null || item.value === undefined ? 'N/A' : number(item.value, 3)) + '</td><td>' + esc(item.year || 'Not recorded') + '</td><td>' + esc(item.indicatorCode || indicator.code) + '</td></tr>';
    }).join('');
    const metadata = row.metadata || {};
    return '<section class="owb-section"><div class="owb-section-head"><h4>Published World Bank reference snapshot · ' + esc(profile.name) + '</h4><span class="owb-state ' + (reference.status === 'LIVE' ? 'owb-good' : 'owb-warn') + '">' + esc(reference.status || 'UNAVAILABLE') + '</span></div>'
      + '<div class="owb-term-guard"><strong>IMPORTANT · Reference data only</strong><p>These external observations do not enter OMEGA Credit Score, lending limits, simulated Treasury or daily economic decisions. Only the country’s game-state data can control lending.</p></div>'
      + '<p class="owb-sub">Provider refresh: ' + esc(formatDate(reference.refreshedAt)) + ' · last attempt: ' + esc(formatDate(reference.lastAttemptAt)) + '</p>'
      + '<div class="owb-table-wrap"><table class="owb-table"><thead><tr><th>Indicator</th><th>Value</th><th>Observation year</th><th>Source code</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="owb-data-grid"><div class="owb-metric"><small>Provider region</small><strong>' + esc(metadata.region && metadata.region.value || 'N/A') + '</strong></div>'
      + '<div class="owb-metric"><small>Provider income class</small><strong>' + esc(metadata.incomeLevel && metadata.incomeLevel.value || 'N/A') + '</strong></div>'
      + '<div class="owb-metric"><small>Provider lending metadata</small><strong>' + esc(metadata.lendingType && metadata.lendingType.value || 'N/A') + '</strong></div></div>'
      + '<p class="owb-sub">The official reference values may be delayed, revised or absent. They are kept separate from the game’s simulated values and never overwrite a country’s runtime economy.</p></section>';
  }
  function renderRulesPane(assessment) {
    const terms = termsFor(assessment, 'infrastructure');
    const bounds = negotiationBounds(assessment, 'infrastructure');
    return '<section class="owb-section"><h4>Credit, interest and repayment rules</h4>'
      + '<div class="owb-data-grid"><div class="owb-metric"><small>Base facility rate</small><strong>' + esc(percent(terms.annualInterestRatePct)) + '</strong></div>'
      + '<div class="owb-metric"><small>Negotiated rate range</small><strong>' + esc(percent(bounds.minimumRatePct)) + '–' + esc(percent(bounds.maximumRatePct)) + '</strong></div>'
      + '<div class="owb-metric"><small>Term range</small><strong>' + esc(bounds.minimumTermYears) + '–' + esc(bounds.maximumTermYears) + ' years</strong></div>'
      + '<div class="owb-metric"><small>Grace range</small><strong>' + esc(bounds.minimumGraceYears) + '–' + esc(bounds.maximumGraceYears) + ' years</strong></div></div>'
      + '<div class="owb-term-guard"><strong>IMPORTANT · Contract requirements</strong><ul><li><strong>Currency:</strong> sovereign obligations are recorded in USD; the selected local currency is an FX equivalent snapshot.</li>'
      + '<li><strong>Rate:</strong> negotiation stays inside the credit-score-specific band, absolute model bounds 0.5%–8.5%.</li>'
      + '<li><strong>Term:</strong> whole years only, bounded between 5 and 40; grace period must be shorter than maturity.</li>'
      + '<li><strong>Penalty:</strong> late-payment spread is capped at 2 percentage points above the agreed rate, with total effective rate capped at 10.5%.</li>'
      + '<li><strong>Default sequence:</strong> notice at 30 days, mediation review at 90 days, default/new-credit hold at 180 days, restructuring review at 270 days, insolvency review at 360 days overdue.</li>'
      + '<li><strong>Institution liquidity:</strong> no new loan is posted unless simulation cash exists or an eligible partner has funded the cash pool.</li>'
      + '<li><strong>Data integrity:</strong> missing game GDP or debt/GDP blocks approval. External reference observations cannot fill missing inputs.</li></ul></div>'
      + '<p class="owb-sub">Rules are explicit game mechanics inspired by lending and sovereign workout concepts. They are not claims about actual World Bank term sheets or binding international law.</p></section>';
  }
  function renderPanelHTML() {
    const profile = currentCountryProfile();
    if (!profile) return '<div class="owb-panel"><p class="owb-empty">Finance country profile is not available yet.</p></div>';
    const assessment = scoreCountry(profile);
    const bank = store(true);
    const facility = getFacilitySnapshot(bank);
    const player = playerProfile();
    const canAct = !!player && codeOf(player) === codeOf(profile);
    const table = countryTableRows(uiState.search);
    const tabs = [
      ['overview', 'Overview', 'overview'],
      ['lend', 'Loan desk', 'loan'],
      ['contracts', 'Contracts', 'contracts'],
      ['countries', 'Countries', 'countries'],
      ['partners', 'Partners & liquidity', 'partners'],
      ['reference', 'Reference data', 'reference'],
      ['rules', 'Rules & safeguards', 'rules']
    ];
    const activeTab = tabs.some(row => row[0] === uiState.tab) ? uiState.tab : 'overview';
    let body = '';
    if (activeTab === 'overview') body = renderOverviewPane(profile, assessment, facility, bank, canAct);
    else if (activeTab === 'lend') body = renderLoanPane(profile, assessment, canAct, bank);
    else if (activeTab === 'contracts') body = renderContractsPane(profile, bank);
    else if (activeTab === 'countries') body = renderCountriesPane(table);
    else if (activeTab === 'partners') body = renderPartnersPane(profile, assessment, bank, canAct, facility);
    else if (activeTab === 'reference') body = renderReferencePane(profile, bank);
    else body = renderRulesPane(assessment);
    const liquidity = bank.liquidity || {};
    const headerButtons = '<button type="button" class="owb-btn" data-owb-action="recalculate" title="Recalculate game-state scores">' + svgIcon('calculate') + '<span>Recalculate</span></button>'
      + '<button type="button" class="owb-btn" data-owb-action="refresh-data" title="Refresh separate public reference cache">' + svgIcon('refresh') + '<span>Refresh reference</span></button>';
    const subtabs = tabs.map(row => subtabButton(row[0], row[1], row[2])).join('');
    const notice = uiState.notice ? '<div class="owb-notice" role="status">' + esc(uiState.notice) + '</div>' : '';
    return '<div class="owb-panel" data-owb-panel><header class="owb-header"><div><div class="ofm-eyebrow">OMEGA / SIMULATED SOVEREIGN FINANCE</div><h3>International lending institution</h3>'
      + '<p class="owb-sub">Current country: <strong>' + esc(profile.name) + '</strong> · game turn ' + esc(currentTurn()) + ' · pool cash ' + esc(money(liquidity.cashBalanceUsd)) + '</p></div><div class="owb-flex">' + headerButtons + '</div></header>'
      + notice + '<nav class="owb-subtabs" aria-label="World Bank simulation sections">' + subtabs + '</nav>'
      + '<div class="owb-inner-content" data-owb-current-tab="' + esc(activeTab) + '">' + body + '</div>'
      + '<p class="owb-sub">This is a game-only institution. It neither creates real funding nor connects to internal World Bank systems. Public reference data are separated and used only in the Reference data tab.</p></div>';
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
    renderForcePending = renderForcePending || !!force;
    if (renderQueued) return;
    if (typeof global.setTimeout === 'function') {
      renderQueued = true;
      global.setTimeout(() => {
        const doForce = renderForcePending;
        renderQueued = false;
        renderForcePending = false;
        renderPanel(doForce);
      }, 0);
    } else {
      const doForce = renderForcePending;
      renderForcePending = false;
      renderPanel(doForce);
    }
  }
  function scheduleAssessment(force) {
    forceAssessmentPending = forceAssessmentPending || !!force;
    if (assessmentQueued) return;
    if (typeof global.setTimeout !== 'function') {
      const runForce = forceAssessmentPending;
      forceAssessmentPending = false;
      evaluateAll(runForce);
      queueRender(true);
      return;
    }
    assessmentQueued = true;
    global.setTimeout(() => {
      const runForce = forceAssessmentPending;
      assessmentQueued = false;
      forceAssessmentPending = false;
      evaluateAll(runForce);
      queueRender(true);
    }, 0);
  }
  function installUiEvents() {
    const content = global.document && global.document.getElementById && global.document.getElementById('ministry-dashboard-content');
    if (!content || content.__omegaWorldBankLendingBound) return;
    content.__omegaWorldBankLendingBound = true;
    content.addEventListener('click', event => {
      const subtab = event.target && event.target.closest && event.target.closest('[data-owb-subtab]');
      if (subtab) {
        const next = String(subtab.getAttribute('data-owb-subtab') || '');
        if (['overview', 'lend', 'contracts', 'countries', 'partners', 'reference', 'rules'].includes(next)) {
          uiState.tab = next;
          uiState.notice = null;
          renderPanel(true);
        }
        return;
      }
      const action = event.target && event.target.closest && event.target.closest('[data-owb-action]');
      if (action) {
        const command = action.getAttribute('data-owb-action');
        if (command === 'recalculate') {
          const result = evaluateAll(true);
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
        uiState.tab = 'overview';
        uiState.notice = null;
        if (finance && typeof finance.selectCountry === 'function') finance.selectCountry(country);
        if (finance && typeof finance.selectTab === 'function') finance.selectTab('worldbank');
      }
    });
    content.addEventListener('change', event => {
      const purposeSelect = event.target && event.target.closest && event.target.closest('[data-owb-purpose]');
      if (!purposeSelect) return;
      const form = purposeSelect.closest && purposeSelect.closest('[data-owb-form="request-loan"]');
      const profile = currentCountryProfile();
      if (!form || !profile) return;
      const assessment = scoreCountry(profile);
      const purpose = String(purposeSelect.value || 'infrastructure');
      const base = termsFor(assessment, purpose);
      const bounds = negotiationBounds(assessment, purpose);
      const rateInput = form.querySelector('[name="annualInterestRatePct"]');
      const termInput = form.querySelector('[name="termYears"]');
      const graceInput = form.querySelector('[name="graceYears"]');
      if (rateInput) { rateInput.min = bounds.minimumRatePct; rateInput.max = bounds.maximumRatePct; rateInput.value = base.annualInterestRatePct; }
      if (termInput) { termInput.min = bounds.minimumTermYears; termInput.max = bounds.maximumTermYears; termInput.value = base.termYears; }
      if (graceInput) { graceInput.min = bounds.minimumGraceYears; graceInput.max = bounds.maximumGraceYears; graceInput.value = base.graceYears; }
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
      if (!form || !form.getAttribute) return;
      const formType = form.getAttribute('data-owb-form');
      if (formType !== 'request-loan' && formType !== 'partner' && formType !== 'restructure') return;
      event.preventDefault();
      const data = new FormData(form);
      const profile = currentCountryProfile();
      let result;
      if (formType === 'restructure') {
        result = requestRestructuring({
          countryId: codeOf(profile),
          loanId: String(form.getAttribute('data-owb-loan-id') || ''),
          annualInterestRatePct: finite(data.get('annualInterestRatePct')),
          termYears: finite(data.get('termYears')),
          graceYears: finite(data.get('graceYears')),
          reason: String(data.get('reason') || 'payment-difficulty')
        });
        uiState.notice = result.ok
          ? 'Restructuring approved under the game’s bounded workout rules. Accrued obligations remain on the loan record.'
          : 'Restructuring rejected (' + (result.code || 'REJECTED') + '): ' + (result.message || 'The workout conditions were not met.');
      } else if (formType === 'partner') {
        result = registerFundingPartner({
          countryId: codeOf(profile), commitmentLimitUsd: finite(data.get('commitmentLimitUsd'))
        });
        uiState.notice = result.ok
          ? 'Funding-partner consent saved. No money moved; funds can be drawn only under the recorded reserve and commitment caps.'
          : 'Partner registration rejected (' + (result.code || 'REJECTED') + '): ' + (result.message || 'The country did not meet the partner rules.');
      } else {
        result = requestLoan({
          countryId: codeOf(profile),
          requestId: String(form.getAttribute('data-owb-request-id') || ''),
          amountUsd: finite(data.get('amountUsd')),
          purpose: String(data.get('purpose') || 'infrastructure'),
          currencyCode: String(data.get('currencyCode') || 'USD'),
          annualInterestRatePct: finite(data.get('annualInterestRatePct')),
          termYears: finite(data.get('termYears')),
          graceYears: finite(data.get('graceYears'))
        });
        uiState.notice = result.ok
          ? 'Loan issued: ' + result.loanId + ' for ' + money(result.loan.originalPrincipalUsd) + '. Treasury, debt and institutional cash-pool entries were posted.'
          : 'Loan not issued (' + (result.code || 'REJECTED') + '): ' + (result.message || 'The Finance runtime did not authorize this action.');
      }
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
      evaluateAll(true);
      initialized = true;
      installObserver();
      global.addEventListener && global.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', function (event) {
        evaluateAll(false);
        refreshWorldBankData(false).catch(() => {});
        queueRender(true);
      });
      global.addEventListener && global.addEventListener('OMEGA_FINANCE_STATE_UPDATED', function (event) {
        const detail = event && event.detail || {};
        scheduleAssessment(!!detail.action);
        queueRender(true);
      });
      global.addEventListener && global.addEventListener('OMEGA_WORLD_BANK_LENDING_UPDATED', function () {
        queueRender(true);
      });
      global.addEventListener && global.addEventListener('OMEGA_WORLD_BANK_ASSESSMENTS_UPDATED', function () {
        queueRender(true);
      });
      try {
        global.Omega = global.Omega || {};
        global.Omega.WorldBankLending = api;
      } catch (_) {}
      queueRender(false);
      refreshWorldBankData(false).then(result => {
        if (result && result.ok) evaluateAll(true);
        queueRender(true);
      }).catch(() => queueRender(true));
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
    resolveWorldBankCountry: matchProfileForISO,
    getNegotiationBounds: function (value, purpose) { const assessment = scoreCountry(value); if (!assessment) return null; const b = negotiationBounds(assessment, purpose || 'infrastructure'); return { minimumRatePct: b.minimumRatePct, maximumRatePct: b.maximumRatePct, minimumTermYears: b.minimumTermYears, maximumTermYears: b.maximumTermYears, minimumGraceYears: b.minimumGraceYears, maximumGraceYears: b.maximumGraceYears, base: clone(b.base) }; },
    evaluateAll: evaluateAll,
    refreshWorldBankData: refreshWorldBankData,
    requestLoan: requestLoan,
    getLoans: getLoanList,
    getOutstandingBalance: getOutstandingBalance,
    getOutstandingPrincipal: getOutstandingPrincipal,
    getFacilitySnapshot: getFacilitySnapshot,
    accrueInterest: accrueInterest,
    serviceDebt: serviceDebt,
    applyManualRepayment: applyManualRepayment,
    requestRestructuring: requestRestructuring,
    registerFundingPartner: registerFundingPartner,
    processTurn: processTurn,
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
