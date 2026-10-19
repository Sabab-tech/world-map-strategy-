/* OMEGA GLOBAL FX + MONETARY ENGINE v1.0.0
 * Additive finance extension: preserves Finance Ministry ownership of treasury actions.
 * Reference data provider: Frankfurter v2; no API key or third-party runtime bundle.
 */
(function (global) {
  'use strict';
  if (global.OmegaForexMonetaryEngine && global.OmegaForexMonetaryEngine.VERSION === '1.0.0') return;

  const VERSION = '1.0.0';
  const DAY_MS = 86400000;
  const HOUR_MS = 3600000;
  const YEAR_MS = 31536000000;
  const API = 'https://api.frankfurter.dev/v2';
  const CACHE_KEY = 'omega.forex.monetary.v1';
  const RATE_REFRESH_MS = 6 * HOUR_MS;
  const HISTORY_DAYS = 30;
  const FX_FEE_BPS = 15;
  const CURRENCY_OVERRIDES = Object.freeze({
    ALA: 'EUR', ATA: null, BES: 'USD', BVT: null, IOT: 'USD', ATF: 'EUR',
    GGY: 'GBP', HMD: 'AUD', IMN: 'GBP', JEY: 'GBP', MYT: 'EUR', REU: 'EUR',
    BLM: 'EUR', SHN: 'SHP', MAF: 'EUR', SPM: 'EUR', SGS: 'GBP', SJM: 'NOK', UMI: 'USD'
  });
  const CURRENCY_NAME_OVERRIDES = Object.freeze({
    SHP: 'Saint Helena pound', EUR: 'Euro', USD: 'United States dollar',
    GBP: 'Pound sterling', AUD: 'Australian dollar', NOK: 'Norwegian krone'
  });
  const RATE_ALIASES = Object.freeze({ SHP: 'GBP' });
  const DEFAULT_POLICY = Object.freeze({
    inflationTargetPct: 3, moneySupplyGrowthPct: 4, currencyRegime: 'MANAGED_FLOAT',
    regimeBandPct: 0.5, interventionFeeBps: FX_FEE_BPS
  });

  let finance = null;
  let profiles = [];
  let profileByCode = new Map();
  let anchorByCurrency = new Map();
  let currencies = new Map();
  let state = null;
  let initialized = false;
  let initPromise = null;
  let observer = null;
  let renderQueued = false;

  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function finite(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function ensureObject(parent, key) {
    if (!isObject(parent[key])) parent[key] = {};
    return parent[key];
  }
  function safeCopy(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }
  function normalizeCode(code) {
    return String(code == null ? '' : code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function numberText(value, maximumFractionDigits) {
    const n = finite(value);
    if (n === null) return 'N/A';
    const abs = Math.abs(n);
    const scale = abs >= 1e12 ? { value: 1e12, label: 'trillion' }
      : abs >= 1e9 ? { value: 1e9, label: 'billion' }
      : abs >= 1e6 ? { value: 1e6, label: 'million' }
      : abs >= 1e3 ? { value: 1e3, label: 'thousand' } : null;
    if (scale) {
      let amount;
      try { amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(abs / scale.value); }
      catch (_) { amount = (abs / scale.value).toFixed(2).replace(/\.?0+$/, ''); }
      return (n < 0 ? '-' : '') + amount + ' ' + scale.label;
    }
    try {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: maximumFractionDigits == null ? 4 : maximumFractionDigits
      }).format(n);
    } catch (_) { return String(Number(n.toFixed(4))); }
  }
  function moneyText(value) {
    const n = finite(value);
    if (n === null) return 'N/A';
    const abs = Math.abs(n);
    const scale = abs >= 1e12 ? { value: 1e12, label: 'trillion' }
      : abs >= 1e9 ? { value: 1e9, label: 'billion' }
      : abs >= 1e6 ? { value: 1e6, label: 'million' }
      : abs >= 1e3 ? { value: 1e3, label: 'thousand' } : null;
    if (scale) {
      let amount;
      try { amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(abs / scale.value); }
      catch (_) { amount = (abs / scale.value).toFixed(2).replace(/\.?0+$/, ''); }
      return (n < 0 ? '-$' : '$') + amount + ' ' + scale.label;
    }
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', maximumFractionDigits: 0
      }).format(n);
    } catch (_) { return (n < 0 ? '-$' : '$') + Math.round(abs).toLocaleString('en-US'); }
  }
  function percentageText(value) {
    const n = finite(value);
    return n === null ? 'N/A' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function dispatch(name, detail) {
    try {
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(name, { detail: detail || {} }));
      }
    } catch (_) {}
  }
  function dateOnly(date) {
    return new Date(date).toISOString().slice(0, 10);
  }
  function localStorageRead() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function localStorageWrite() {
    try {
      if (!global.localStorage || !state) return;
      const compact = {
        referenceRates: state.referenceRates,
        referenceRateDate: state.referenceRateDate,
        referenceUpdatedAt: state.referenceUpdatedAt,
        referenceHistory: state.referenceHistory,
        currencyCatalog: Array.from(currencies.entries()).map(x => x[1]).slice(0, 400)
      };
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(compact));
    } catch (_) {}
  }

  function rootState() {
    const candidates = [
      global.Omega && global.Omega.Simulation && global.Omega.Simulation.world && global.Omega.Simulation.world.state,
      global.Omega && global.Omega.World && global.Omega.World.state,
      global.Game && global.Game.state,
      global.gameState
    ];
    const unique = candidates.filter((x, i) => isObject(x) && candidates.indexOf(x) === i);
    return unique.find(x => isObject(x.economy) && Object.keys(x.economy).length > 0)
      || unique.find(x => isObject(x.economy))
      || unique[0]
      || (global.gameState = { economy: {}, finance: {}, simulation: {} });
  }
  function bankingRoot() {
    return ensureObject(rootState(), 'governmentBanking');
  }
  function ensureForexState() {
    const bank = bankingRoot();
    const fx = ensureObject(bank, 'forex');
    if (fx.version !== VERSION) {
      fx.version = VERSION;
      fx.provider = 'FRANKFURTER_V2';
      fx.baseCurrency = 'USD';
      fx.referenceRates = isObject(fx.referenceRates) ? fx.referenceRates : { USD: 1 };
      fx.simulationRates = isObject(fx.simulationRates) ? fx.simulationRates : {};
      fx.referenceHistory = isObject(fx.referenceHistory) ? fx.referenceHistory : {};
      fx.simulationHistory = isObject(fx.simulationHistory) ? fx.simulationHistory : {};
      fx.policies = isObject(fx.policies) ? fx.policies : {};
      fx.countries = isObject(fx.countries) ? fx.countries : {};
      fx.ledger = Array.isArray(fx.ledger) ? fx.ledger : [];
      fx.nextTransactionId = finite(fx.nextTransactionId) || 1;
      fx.simulationDay = finite(fx.simulationDay) || 0;
      fx.elapsedSimulationMs = finite(fx.elapsedSimulationMs) || 0;
      fx.lastProcessedTurn = finite(fx.lastProcessedTurn);
      fx.referenceRateDate = fx.referenceRateDate || null;
      fx.referenceUpdatedAt = finite(fx.referenceUpdatedAt);
      fx.referenceStatus = fx.referenceStatus || 'NOT_LOADED';
      fx.referenceError = null;
      fx.viewMode = fx.viewMode === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
      fx.settledVolumeUsd = finite(fx.settledVolumeUsd) || 0;
      fx.settlementFeesUsd = finite(fx.settlementFeesUsd) || 0;
    } else {
      fx.referenceRates = isObject(fx.referenceRates) ? fx.referenceRates : { USD: 1 };
      fx.simulationRates = isObject(fx.simulationRates) ? fx.simulationRates : {};
      fx.referenceHistory = isObject(fx.referenceHistory) ? fx.referenceHistory : {};
      fx.simulationHistory = isObject(fx.simulationHistory) ? fx.simulationHistory : {};
      fx.policies = isObject(fx.policies) ? fx.policies : {};
      fx.countries = isObject(fx.countries) ? fx.countries : {};
      fx.ledger = Array.isArray(fx.ledger) ? fx.ledger : [];
    }
    state = fx;
    return fx;
  }

  function sourceValues(profile) {
    return isObject(profile && profile.sourceValues) ? profile.sourceValues : {};
  }
  function getCountryCurrency(profile) {
    if (!profile) return null;
    const iso3 = normalizeCode(profile.iso3 || profile.numericCode);
    const saved = normalizeCode(sourceValues(profile).currency_code || profile.currency_code || profile.currencyCode);
    if (saved && saved.length === 3) return saved;
    if (own(CURRENCY_OVERRIDES, iso3)) return CURRENCY_OVERRIDES[iso3];
    return null;
  }
  function getCountryCurrencyName(profile, code) {
    return sourceValues(profile).currency_name
      || CURRENCY_NAME_OVERRIDES[code]
      || (currencies.get(code) && currencies.get(code).name)
      || (code ? code + ' (name not supplied)' : 'No national currency / not applicable');
  }
  function effectiveRateCode(code) {
    const normalized = normalizeCode(code);
    return RATE_ALIASES[normalized] || normalized;
  }
  function getProfileId(profile) {
    return normalizeCode(profile && (profile.countryCode || profile.code || profile.iso2 || profile.iso3));
  }
  function getEconomyRecord(profile) {
    if (!profile || !profile.economyKey) return null;
    const root = rootState();
    if (isObject(root.economy) && isObject(root.economy[profile.economyKey])) return root.economy[profile.economyKey];
    return null;
  }
  function getPlayerProfile() {
    try {
      const p = finance && typeof finance.getPlayerCountry === 'function' ? finance.getPlayerCountry() : null;
      if (p) return p;
    } catch (_) {}
    const root = rootState();
    const id = root && root.simulation && (root.simulation.session && root.simulation.session.playerCountryId || root.simulation.playerCountryId);
    return profileByCode.get(normalizeCode(id)) || profileByCode.get('BD') || profiles[0] || null;
  }
  function getMacro(profile) {
    const e = getEconomyRecord(profile) || {};
    const ind = isObject(profile && profile.indicators) ? profile.indicators : {};
    const src = sourceValues(profile);
    const gdp = finite(e.gdp) ?? finite(ind.gdpCurrentUsd) ?? finite(src.gdp);
    const debt = finite(e.debt) ?? finite(ind.publicDebtUsd) ?? finite(src.debt);
    const trade = finite(e.trade_balance) ?? finite(ind.tradeBalanceUsd) ?? finite(src.trade_balance);
    const reserves = finite(e.reserves) ?? finite(ind.foreignExchangeReservesUsd) ?? finite(src.reserves);
    const inflation = finite(e.inflation) ?? finite(ind.inflationRatePct) ?? finite(src.inflation);
    const growth = finite(e.gdp_growth) ?? finite(ind.gdpGrowthPct) ?? finite(src.gdp_growth);
    const debtRatio = gdp > 0 && debt !== null ? debt / gdp * 100 : finite(ind.publicDebtToGdpPct);
    const tradeRatio = gdp > 0 && trade !== null ? trade / gdp * 100 : finite(ind.tradeBalanceToGdpPct);
    const reserveRatio = gdp > 0 && reserves !== null ? reserves / gdp * 100 : finite(ind.reservesToGdpPct);
    let policyRate = finite(ind.policyInterestRatePct);
    try {
      const fm = finance && typeof finance.getFinanceState === 'function' ? finance.getFinanceState(profile.countryCode || profile.iso3) : null;
      policyRate = finite(fm && fm.policy && fm.policy.interestRateAnnualPct) ?? policyRate;
    } catch (_) {}
    if (policyRate === null) policyRate = finite(e.policy_interest_rate_model_pct) ?? 3;
    return {
      gdp: gdp, debt: debt, trade: trade, reserves: reserves, inflation: inflation,
      growth: growth, debtToGdpPct: debtRatio, tradeToGdpPct: tradeRatio,
      reservesToGdpPct: reserveRatio, policyRatePct: policyRate
    };
  }
  function buildCurrencyRegistry() {
    currencies = new Map();
    profileByCode = new Map();
    anchorByCurrency = new Map();
    profiles.forEach(function (profile) {
      const ids = [profile.countryCode, profile.code, profile.iso2, profile.iso3, profile.name];
      ids.filter(Boolean).forEach(function (id) { profileByCode.set(normalizeCode(id), profile); });
      const code = getCountryCurrency(profile);
      if (!code) return;
      const info = currencies.get(code) || {
        code: code, name: getCountryCurrencyName(profile, code), symbol: null,
        countryCount: 0, countries: [], marketCode: effectiveRateCode(code)
      };
      info.countryCount += 1;
      if (info.countries.length < 6) info.countries.push(profile.name);
      if (!info.name || info.name.indexOf('name not supplied') >= 0) info.name = getCountryCurrencyName(profile, code);
      currencies.set(code, info);
      const macro = getMacro(profile);
      const previous = anchorByCurrency.get(code);
      const preferUS = code === 'USD' && normalizeCode(profile.iso3) === 'USA';
      const score = (preferUS ? 1e18 : 0) + Math.max(0, finite(macro.gdp) || 0);
      if (!previous || score > previous.score) anchorByCurrency.set(code, { profile: profile, score: score });
    });
    if (!currencies.has('USD')) currencies.set('USD', {
      code: 'USD', name: 'United States dollar', symbol: '$', countryCount: 1,
      countries: ['United States'], marketCode: 'USD'
    });
    currencies.forEach(function (info, code) {
      const alias = effectiveRateCode(code);
      if (currencies.has(alias)) {
        const known = currencies.get(alias);
        if (!info.symbol && known.symbol) info.symbol = known.symbol;
      }
    });
  }
  function currencyPolicy(code) {
    const policies = state.policies;
    const policy = ensureObject(policies, code);
    const anchor = anchorByCurrency.get(code);
    const macro = anchor ? getMacro(anchor.profile) : {};
    const baselineInflation = finite(macro.inflation) ?? DEFAULT_POLICY.inflationTargetPct;
    if (finite(policy.inflationTargetPct) === null) policy.inflationTargetPct = clamp(baselineInflation, 0, 15);
    if (finite(policy.moneySupplyGrowthPct) === null) policy.moneySupplyGrowthPct = finite(macro.growth) ?? DEFAULT_POLICY.moneySupplyGrowthPct;
    if (!['FLOAT', 'MANAGED_FLOAT', 'PEG'].includes(policy.currencyRegime)) policy.currencyRegime = DEFAULT_POLICY.currencyRegime;
    if (finite(policy.regimeBandPct) === null) policy.regimeBandPct = DEFAULT_POLICY.regimeBandPct;
    if (finite(policy.interventionFeeBps) === null) policy.interventionFeeBps = FX_FEE_BPS;
    return policy;
  }
  function rateValue(map, code) {
    if (!isObject(map)) return null;
    const normalized = normalizeCode(code);
    const alias = effectiveRateCode(normalized);
    const raw = finite(map[normalized]);
    if (raw !== null && raw > 0) return raw;
    const aliasValue = finite(map[alias]);
    return aliasValue !== null && aliasValue > 0 ? aliasValue : null;
  }
  function rateFor(code, mode) {
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    if (normalized === 'USD') return 1;
    if (mode === 'REFERENCE') return rateValue(state.referenceRates, normalized);
    const item = state.simulationRates[normalized] || state.simulationRates[effectiveRateCode(normalized)];
    const value = finite(isObject(item) ? item.localPerUsd : item);
    return value !== null && value > 0 ? value : null;
  }
  function allRateValues(mode) {
    const out = { USD: 1 };
    currencies.forEach(function (_, code) {
      const value = rateFor(code, mode);
      if (value !== null && value > 0) out[code] = value;
    });
    return out;
  }

  function calculateConversion(amount, fromCode, toCode, localPerUsdRates, feeBps) {
    const value = finite(amount);
    const from = normalizeCode(fromCode);
    const to = normalizeCode(toCode);
    if (value === null || value <= 0) return { ok: false, code: 'INVALID_AMOUNT' };
    if (!from || !to) return { ok: false, code: 'CURRENCY_REQUIRED' };
    const fromRate = rateValue(localPerUsdRates, from);
    const toRate = rateValue(localPerUsdRates, to);
    if (from === 'USD' && fromRate === null) return { ok: false, code: 'SOURCE_RATE_UNAVAILABLE' };
    if (to === 'USD' && toRate === null) return { ok: false, code: 'TARGET_RATE_UNAVAILABLE' };
    if (fromRate === null) return { ok: false, code: 'SOURCE_RATE_UNAVAILABLE' };
    if (toRate === null) return { ok: false, code: 'TARGET_RATE_UNAVAILABLE' };
    const usdNotional = value / fromRate;
    const bps = clamp(finite(feeBps) ?? FX_FEE_BPS, 0, 1000);
    const feeUsd = usdNotional * bps / 10000;
    const grossTarget = usdNotional * toRate;
    const netTarget = grossTarget - feeUsd * toRate;
    return {
      ok: true, amount: value, fromCode: from, toCode: to,
      usdNotional: usdNotional, grossTarget: grossTarget, amountTarget: netTarget,
      feeUsd: feeUsd, feeTarget: feeUsd * toRate,
      fromLocalPerUsd: fromRate, toLocalPerUsd: toRate,
      crossRate: toRate / fromRate, feeBps: bps,
      route: from === 'USD' || to === 'USD' ? 'DIRECT_USD' : 'SOURCE_TO_USD_TO_TARGET'
    };
  }
  function computeAnnualDrift(input) {
    input = isObject(input) ? input : {};
    const localInflation = finite(input.localInflationPct) ?? 0;
    const usInflation = finite(input.usInflationPct) ?? 0;
    const localRate = finite(input.localPolicyRatePct) ?? 3;
    const usRate = finite(input.usPolicyRatePct) ?? 3;
    const localGrowth = finite(input.localGrowthPct) ?? 0;
    const usGrowth = finite(input.usGrowthPct) ?? 0;
    const trade = finite(input.tradeBalanceToGdpPct) ?? 0;
    const debt = finite(input.debtToGdpPct) ?? 0;
    const reserves = finite(input.reservesToGdpPct) ?? 0;
    const moneySupply = finite(input.moneySupplyGrowthPct) ?? 0;
    const capitalFlow = finite(input.capitalFlowToGdpPct);
    const confidence = finite(input.confidenceIndex);
    const reserveCover = finite(input.reserveCoverMonths);
    const pegAttack = Math.max(0, finite(input.pegAttackPressurePct) ?? 0);
    const shock = finite(input.shockPct) ?? 0;
    const capitalFlowPressure = capitalFlow === null ? 0 : -capitalFlow * 0.08;
    const confidencePressure = confidence === null ? 0 : Math.max(0, 50 - clamp(confidence, 0, 100)) * 0.10;
    const reserveCoverPressure = reserveCover === null ? 0 : Math.max(0, 3 - Math.max(0, reserveCover)) * 1.8;
    const pegAttackEffect = pegAttack * 0.25;
    const annual = (localInflation - usInflation) * 0.90
      - (localRate - usRate) * 0.22
      - (localGrowth - usGrowth) * 0.10
      - trade * 0.035
      + Math.max(0, debt - 60) * 0.012
      - Math.max(0, reserves - 10) * 0.012
      + moneySupply * 0.10 + capitalFlowPressure + confidencePressure + reserveCoverPressure + pegAttackEffect + shock;
    return clamp(annual, -60, 120);
  }
  function evolveInflation(input) {
    input = isObject(input) ? input : {};
    const current = finite(input.currentInflationPct) ?? 3;
    const target = finite(input.targetInflationPct) ?? current;
    const policy = finite(input.policyRatePct) ?? 3;
    const money = finite(input.moneySupplyGrowthPct) ?? 0;
    const growth = finite(input.gdpGrowthPct) ?? 0;
    const depreciation = Math.max(0, finite(input.currencyDepreciationAnnualPct) ?? 0);
    const deltaAnnual = (target - current) * 0.06
      - (policy - target) * 0.025
      + (money - growth) * 0.025
      + depreciation * 0.06;
    const years = Math.max(0, finite(input.years) ?? 0);
    return clamp(current + deltaAnnual * years, -5, 1000);
  }
  function appendHistoryPoint(history, point, maximum) {
    const cap = Math.max(1, Math.floor(finite(maximum) ?? HISTORY_DAYS));
    const result = Array.isArray(history) ? history.slice() : [];
    const rate = finite(point && point.rate);
    const date = String(point && point.date || '');
    if (!date || rate === null || rate <= 0) return result.slice(-cap);
    const next = { date: date, rate: rate };
    const index = result.findIndex(function (x) { return x && x.date === date; });
    if (index >= 0) result[index] = next; else result.push(next);
    result.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    return result.slice(-cap);
  }
  function seedSimulationRates() {
    const source = state.simulationRates;
    currencies.forEach(function (_, code) {
      if (code === 'USD') {
        source.USD = { localPerUsd: 1, source: 'USD_NUMERAIRE', updatedTurn: 0, annualDriftPct: 0 };
        return;
      }
      const current = source[code];
      if (finite(isObject(current) ? current.localPerUsd : current) > 0) return;
      const anchor = anchorByCurrency.get(code);
      const p = anchor && anchor.profile;
      const macro = p ? getMacro(p) : {};
      const baseline = p ? finite(sourceValues(p).exchange_rate_usd) ?? finite(p.indicators && p.indicators.exchangeRateLocalPerUsd) : null;
      const reference = rateValue(state.referenceRates, code);
      const start = baseline !== null && baseline > 0 ? baseline : reference;
      if (start !== null && start > 0) {
        source[code] = {
          localPerUsd: start,
          source: baseline !== null && baseline > 0 ? 'GAME_BASELINE_2015' : 'LIVE_RATE_SEED',
          updatedTurn: 0, annualDriftPct: 0,
          startingInflationPct: finite(macro.inflation)
        };
      } else {
        source[code] = { localPerUsd: null, source: 'RATE_UNAVAILABLE', updatedTurn: 0, annualDriftPct: null };
      }
      if (p && !Array.isArray(state.simulationHistory[code])) {
        const seed = finite(start);
        state.simulationHistory[code] = seed > 0
          ? [{ date: 'SIM DAY 000', rate: seed }]
          : [];
      }
    });
  }
  function loadCachedReferenceData() {
    const cached = localStorageRead();
    if (!isObject(cached)) return;
    if (isObject(cached.referenceRates)) {
      const merged = Object.assign({}, cached.referenceRates, state.referenceRates || {});
      state.referenceRates = merged;
      if (cached.referenceUpdatedAt > (finite(state.referenceUpdatedAt) || 0)) {
        state.referenceUpdatedAt = finite(cached.referenceUpdatedAt);
        state.referenceRateDate = cached.referenceRateDate || state.referenceRateDate;
      }
    }
    if (isObject(cached.referenceHistory)) {
      state.referenceHistory = Object.assign({}, cached.referenceHistory, state.referenceHistory || {});
    }
    if (Array.isArray(cached.currencyCatalog)) {
      cached.currencyCatalog.forEach(function (item) {
        if (!item || !item.code) return;
        const previous = currencies.get(normalizeCode(item.code)) || {};
        currencies.set(normalizeCode(item.code), Object.assign({}, item, previous, {
          code: normalizeCode(item.code), marketCode: effectiveRateCode(item.code)
        }));
      });
    }
  }
  async function fetchJSON(url, timeoutMs) {
    if (typeof global.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
    const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    let timer = null;
    try {
      const options = controller ? { signal: controller.signal, cache: 'no-store' } : { cache: 'no-store' };
      if (controller && typeof global.setTimeout === 'function') {
        timer = global.setTimeout(function () { controller.abort(); }, timeoutMs || 6500);
      }
      const response = await global.fetch(url, options);
      if (!response || response.ok === false) throw new Error('HTTP_' + String(response && response.status || 'FAILED'));
      return await response.json();
    } finally {
      if (timer !== null && typeof global.clearTimeout === 'function') global.clearTimeout(timer);
    }
  }
  function mergeReferenceRates(rows) {
    if (!Array.isArray(rows)) throw new Error('REFERENCE_RATE_PAYLOAD_INVALID');
    const rates = { USD: 1 };
    let latestDate = null;
    rows.forEach(function (row) {
      const code = normalizeCode(row && row.quote);
      const value = finite(row && row.rate);
      if (code.length === 3 && value !== null && value > 0) rates[code] = value;
      if (row && row.date && (!latestDate || String(row.date) > latestDate)) latestDate = String(row.date);
    });
    if (Object.keys(rates).length < 2) throw new Error('REFERENCE_RATES_EMPTY');
    return { rates: rates, date: latestDate };
  }
  async function loadCurrencyMetadata() {
    try {
      const rows = await fetchJSON(API + '/currencies?scope=all', 6500);
      if (!Array.isArray(rows)) return;
      rows.forEach(function (row) {
        const code = normalizeCode(row && (row.iso_code || row.code));
        if (!code || code.length !== 3) return;
        const previous = currencies.get(code) || { code: code, countryCount: 0, countries: [], marketCode: effectiveRateCode(code) };
        currencies.set(code, Object.assign({}, previous, {
          name: row.name || previous.name || code,
          symbol: row.symbol || previous.symbol || null,
          numericCode: row.iso_numeric || row.numeric_code || null,
          marketCode: effectiveRateCode(code)
        }));
      });
    } catch (_) {}
  }
  async function refreshReferenceRates(force) {
    if (!state) return { ok: false, code: 'NOT_INITIALIZED' };
    const now = Date.now();
    if (!force && finite(state.referenceUpdatedAt) && now - state.referenceUpdatedAt < RATE_REFRESH_MS
      && Object.keys(state.referenceRates || {}).length > 1) {
      return { ok: true, cached: true, date: state.referenceRateDate };
    }
    if (global.navigator && global.navigator.onLine === false) {
      state.referenceStatus = Object.keys(state.referenceRates || {}).length > 1 ? 'STALE_CACHE' : 'OFFLINE';
      return { ok: false, code: 'OFFLINE' };
    }
    state.referenceStatus = 'UPDATING';
    try {
      const rows = await fetchJSON(API + '/rates?base=USD', 6500);
      const result = mergeReferenceRates(rows);
      state.referenceRates = result.rates;
      state.referenceRateDate = result.date;
      state.referenceUpdatedAt = now;
      state.referenceStatus = 'LIVE_REFERENCE';
      state.referenceError = null;
      await loadCurrencyMetadata();
      currencies.forEach(function (_, code) {
        const item = state.simulationRates[code];
        if (code !== 'USD' && (!item || finite(isObject(item) ? item.localPerUsd : item) === null)) {
          const v = rateValue(state.referenceRates, code);
          if (v !== null) state.simulationRates[code] = {
            localPerUsd: v, source: 'LIVE_RATE_SEED', updatedTurn: 0, annualDriftPct: 0
          };
        }
      });
      seedSimulationRates();
      localStorageWrite();
      syncAllCountries();
      dispatch('OMEGA_FX_REFERENCE_RATES_UPDATED', {
        provider: 'FRANKFURTER_V2', date: state.referenceRateDate,
        currencyCount: Object.keys(state.referenceRates).length
      });
      refreshPanelMetrics();
      return { ok: true, date: state.referenceRateDate, currencyCount: Object.keys(state.referenceRates).length };
    } catch (error) {
      state.referenceError = String(error && error.message || error || 'REFERENCE_RATE_FETCH_FAILED');
      state.referenceStatus = Object.keys(state.referenceRates || {}).length > 1 ? 'STALE_CACHE' : 'UNAVAILABLE';
      localStorageWrite();
      refreshPanelMetrics();
      return { ok: false, code: state.referenceStatus, message: state.referenceError };
    }
  }
  async function loadReferenceHistory(code, force) {
    const normalized = normalizeCode(code);
    if (!normalized) return [];
    if (normalized === 'USD') {
      const points = [];
      for (let i = HISTORY_DAYS - 1; i >= 0; i -= 1) {
        points.push({ date: dateOnly(Date.now() - i * DAY_MS), rate: 1 });
      }
      state.referenceHistory.USD = points;
      return points;
    }
    const cached = state.referenceHistory[normalized];
    const today = dateOnly(Date.now());
    if (!force && Array.isArray(cached) && cached.length >= 10 && cached[cached.length - 1].date >= dateOnly(Date.now() - 3 * DAY_MS)) {
      return cached.slice(-HISTORY_DAYS);
    }
    if (global.navigator && global.navigator.onLine === false) return Array.isArray(cached) ? cached.slice(-HISTORY_DAYS) : [];
    const end = today;
    const start = dateOnly(Date.now() - (HISTORY_DAYS + 3) * DAY_MS);
    try {
      const url = API + '/rates?base=USD&quotes=' + encodeURIComponent(effectiveRateCode(normalized))
        + '&from=' + encodeURIComponent(start) + '&to=' + encodeURIComponent(end);
      const rows = await fetchJSON(url, 8000);
      const points = [];
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        const value = finite(row && row.rate);
        if (value !== null && value > 0 && row.date) points.push({ date: String(row.date), rate: value });
      });
      state.referenceHistory[normalized] = points.slice(-HISTORY_DAYS);
      localStorageWrite();
      return state.referenceHistory[normalized];
    } catch (_) {
      return Array.isArray(cached) ? cached.slice(-HISTORY_DAYS) : [];
    }
  }
  function simulationHistory(code) {
    const list = state.simulationHistory[normalizeCode(code)];
    return Array.isArray(list) ? list.slice(-HISTORY_DAYS) : [];
  }
  async function chartHistory(code, mode, force) {
    if (mode === 'REFERENCE') return loadReferenceHistory(code, !!force);
    return simulationHistory(code);
  }
  function currentDayLabel() {
    return 'SIM DAY ' + String(Math.max(0, Math.floor(finite(state.simulationDay) || 0))).padStart(3, '0');
  }
  function appendSimHistories() {
    currencies.forEach(function (_, code) {
      const rate = rateFor(code, 'SIMULATION');
      if (rate === null) return;
      state.simulationHistory[code] = appendHistoryPoint(state.simulationHistory[code], {
        date: currentDayLabel(), rate: rate
      }, HISTORY_DAYS);
    });
  }

  function syncAllCountries() {
    if (!state || !finance) return;
    const root = rootState();
    const bank = bankingRoot();
    const countries = ensureObject(bank, 'countries');
    const fxMarket = ensureObject(bank, 'fxMarket');
    fxMarket.version = VERSION;
    fxMarket.baseCurrency = 'USD';
    fxMarket.activeDisplayMode = state.viewMode;
    fxMarket.provider = 'FRANKFURTER_V2';
    fxMarket.referenceRateDate = state.referenceRateDate;
    fxMarket.referenceUpdatedAt = state.referenceUpdatedAt;
    fxMarket.referenceStatus = state.referenceStatus;
    fxMarket.referenceRates = Object.assign({ USD: 1 }, state.referenceRates || {});
    fxMarket.simulationRates = {};
    currencies.forEach(function (_, code) {
      const r = rateFor(code, 'SIMULATION');
      if (r !== null) fxMarket.simulationRates[code] = r;
    });
    profiles.forEach(function (profile) {
      const id = getProfileId(profile);
      const code = getCountryCurrency(profile);
      const source = sourceValues(profile);
      const econ = getEconomyRecord(profile) || {};
      const macro = getMacro(profile);
      const simulated = code ? rateFor(code, 'SIMULATION') : null;
      const reference = code ? rateFor(code, 'REFERENCE') : null;
      const currencyName = getCountryCurrencyName(profile, code);
      const fm = finance && typeof finance.getFinanceState === 'function'
        ? finance.getFinanceState(profile.countryCode || profile.iso3) : null;
      const record = {
        countryCode: profile.countryCode || profile.code || profile.iso2 || null,
        iso3: profile.iso3 || null,
        countryName: profile.name || 'Unknown',
        currencyCode: code,
        currencyName: currencyName,
        localPerUsd: state.viewMode === 'REFERENCE' ? reference : simulated,
        usdPerLocalUnit: state.viewMode === 'REFERENCE'
          ? (reference ? 1 / reference : null) : (simulated ? 1 / simulated : null),
        referenceLocalPerUsd: reference,
        simulationLocalPerUsd: simulated,
        rateSource: state.viewMode === 'REFERENCE'
          ? (reference !== null ? state.referenceStatus : 'REFERENCE_RATE_UNAVAILABLE')
          : (state.simulationRates[code] && state.simulationRates[code].source || 'SIMULATION_RATE_UNAVAILABLE'),
        inflationPct: finite(econ.inflation) ?? finite(macro.inflation),
        policyInterestRatePct: finite(fm && fm.policy && fm.policy.interestRateAnnualPct) ?? finite(macro.policyRatePct),
        gdpUsd: finite(econ.gdp) ?? finite(macro.gdp),
        debtUsd: finite(econ.debt) ?? finite(macro.debt),
        debtToGdpPct: macro.gdp > 0 && macro.debt !== null ? macro.debt / macro.gdp * 100 : null,
        foreignExchangeReservesUsd: finite(econ.reserves) ?? finite(macro.reserves),
        treasuryBalanceUsd: finite(fm && fm.treasuryBalanceUsd),
        dataStatus: profile.profileStatus || (source.currency_code ? 'PARTIAL_LOCAL_BASELINE' : 'CURRENCY_ONLY')
      };
      if (id) countries[id] = record;
      if (profile.iso3) {
        const financeRoot = ensureObject(root, 'finance');
        const financeCountry = ensureObject(financeRoot, profile.iso3);
        financeCountry.governmentBanking = record;
      }
      if (profile.economyKey && state.viewMode !== 'REFERENCE' && simulated !== null) {
        const economy = ensureObject(root, 'economy');
        const current = ensureObject(economy, profile.economyKey);
        current.exchange_rate_usd = simulated;
      }
    });
    bank.forexSummary = {
      version: VERSION, countryAreaCount: profiles.length, currencyCount: currencies.size,
      baseCurrency: 'USD', referenceStatus: state.referenceStatus,
      referenceRateDate: state.referenceRateDate, simulationDay: state.simulationDay,
      fxTransactions: state.ledger.length
    };
    dispatch('OMEGA_GOVERNMENT_BANKING_FX_SYNCED', {
      countryAreaCount: profiles.length, currencyCount: currencies.size,
      referenceStatus: state.referenceStatus, referenceRateDate: state.referenceRateDate
    });
  }

  function getPolicyForPlayer() {
    const player = getPlayerProfile();
    const code = getCountryCurrency(player);
    if (!player || !code) return { player: player, code: code, policy: null };
    return { player: player, code: code, policy: currencyPolicy(code) };
  }
  function applyMonetaryPolicy(action) {
    action = isObject(action) ? action : {};
    const current = getPolicyForPlayer();
    if (!current.player || !current.code || !current.policy) return { ok: false, code: 'PLAYER_CURRENCY_UNAVAILABLE' };
    const target = finite(action.inflationTargetPct);
    const moneyGrowth = finite(action.moneySupplyGrowthPct);
    const interest = finite(action.policyInterestRatePct);
    const regime = String(action.currencyRegime || current.policy.currencyRegime).toUpperCase();
    if (target === null || target < 0 || target > 50) return { ok: false, code: 'INFLATION_TARGET_OUT_OF_RANGE', message: 'Inflation target must be between 0% and 50%.' };
    if (moneyGrowth === null || moneyGrowth < -50 || moneyGrowth > 100) return { ok: false, code: 'MONEY_SUPPLY_OUT_OF_RANGE', message: 'Money-supply growth must be between -50% and 100%.' };
    if (!['FLOAT', 'MANAGED_FLOAT', 'PEG'].includes(regime)) return { ok: false, code: 'CURRENCY_REGIME_INVALID' };
    if (interest === null || interest < 0 || interest > 40) return { ok: false, code: 'POLICY_RATE_OUT_OF_RANGE', message: 'Policy rate must be between 0% and 40%.' };
    if (!finance || typeof finance.applyAction !== 'function') return { ok: false, code: 'FINANCE_RUNTIME_UNAVAILABLE' };
    const applied = finance.applyAction({
      type: 'set-interest-rate',
      countryId: current.player.countryCode || current.player.iso3,
      value: interest
    });
    if (!applied || applied.ok !== true) return applied || { ok: false, code: 'POLICY_UPDATE_FAILED' };
    current.policy.inflationTargetPct = target;
    current.policy.moneySupplyGrowthPct = moneyGrowth;
    current.policy.currencyRegime = regime;
    current.policy.updatedAt = new Date().toISOString();
    current.policy.updatedTurn = currentTurn();
    if (regime === 'PEG') {
      const currentRate = rateFor(current.code, 'SIMULATION');
      if (currentRate !== null) current.policy.pegTargetLocalPerUsd = currentRate;
    } else current.policy.pegTargetLocalPerUsd = null;
    syncAllCountries();
    dispatch('OMEGA_MONETARY_POLICY_UPDATED', {
      countryCode: current.player.countryCode, currencyCode: current.code,
      inflationTargetPct: target, moneySupplyGrowthPct: moneyGrowth,
      policyInterestRatePct: interest, currencyRegime: regime
    });
    return { ok: true, message: 'Monetary policy saved. Inflation, currency drift and peg pressure update on simulation turns.' };
  }
  function applyFxIntervention(action) {
    action = isObject(action) ? action : {};
    const current = getPolicyForPlayer();
    if (!current.player || !current.code) return { ok: false, code: 'PLAYER_CURRENCY_UNAVAILABLE' };
    const amount = finite(action.amountUsd);
    const direction = String(action.direction || '').toUpperCase();
    if (amount === null || amount <= 0) return { ok: false, code: 'INTERVENTION_AMOUNT_INVALID' };
    if (amount > 1e15) return { ok: false, code: 'INTERVENTION_AMOUNT_TOO_LARGE' };
    if (!['SUPPORT_CURRENCY', 'WEAKEN_CURRENCY'].includes(direction)) return { ok: false, code: 'INTERVENTION_DIRECTION_INVALID' };
    if (current.code === 'USD') return { ok: false, code: 'USD_NUMERAIRE_FIXED', message: 'USD is the model base currency; select a non-USD player currency to intervene.' };
    const profile = current.player;
    const econ = getEconomyRecord(profile);
    const macro = getMacro(profile);
    const reserveBefore = finite(econ && econ.reserves) ?? finite(macro.reserves);
    const gdp = finite(econ && econ.gdp) ?? finite(macro.gdp);
    if (reserveBefore === null || reserveBefore < 0) return { ok: false, code: 'FX_RESERVES_UNAVAILABLE', message: 'A verified/modelled FX-reserve balance is required before this intervention.' };
    if (direction === 'SUPPORT_CURRENCY' && amount > reserveBefore) {
      return { ok: false, code: 'INSUFFICIENT_FX_RESERVES', message: 'Intervention rejected: the central bank cannot spend more FX reserves than it holds.' };
    }
    const oldRate = rateFor(current.code, 'SIMULATION');
    if (oldRate === null || oldRate <= 0) return { ok: false, code: 'SIMULATION_RATE_UNAVAILABLE' };
    const effect = clamp(amount / Math.max(1, reserveBefore || gdp || 1) * 0.05, 0.0001, 0.08);
    const newRate = direction === 'SUPPORT_CURRENCY'
      ? oldRate * (1 - effect)
      : oldRate * (1 + effect);
    if (direction === 'SUPPORT_CURRENCY') {
      const reserveAfter = reserveBefore - amount;
      if (econ) econ.reserves = reserveAfter;
    } else if (econ) {
      // The modeled central bank issues local liabilities to buy USD; assets and liabilities both expand.
      econ.reserves = reserveBefore + amount;
      const policy = current.policy;
      if (gdp > 0) policy.moneySupplyGrowthPct = clamp((finite(policy.moneySupplyGrowthPct) || 0) + amount / gdp * 100, -50, 100);
    }
    state.simulationRates[current.code] = Object.assign({}, state.simulationRates[current.code], {
      localPerUsd: newRate, source: 'CENTRAL_BANK_INTERVENTION',
      updatedTurn: currentTurn(), annualDriftPct: finite(state.simulationRates[current.code].annualDriftPct) || 0
    });
    const entry = {
      id: 'FXI-' + String(state.nextTransactionId++), turn: currentTurn(),
      timestamp: new Date().toISOString(), type: 'CENTRAL_BANK_INTERVENTION',
      countryCode: profile.countryCode || profile.iso3, countryName: profile.name,
      currencyCode: current.code, direction: direction, amountUsd: amount,
      reserveBeforeUsd: reserveBefore, reserveAfterUsd: direction === 'SUPPORT_CURRENCY' ? reserveBefore - amount : reserveBefore + amount,
      oldLocalPerUsd: oldRate, newLocalPerUsd: newRate,
      source: 'OMEGA_MONETARY_MODEL'
    };
    state.ledger.push(entry);
    state.ledger = state.ledger.slice(-500);
    syncAllCountries();
    dispatch('OMEGA_FX_INTERVENTION_SETTLED', safeCopy(entry));
    refreshPanelMetrics();
    return { ok: true, message: direction === 'SUPPORT_CURRENCY'
      ? 'Central bank spent FX reserves to support the domestic currency.'
      : 'Central bank sold local currency to accumulate USD reserves; modeled money supply increased.',
      transaction: safeCopy(entry) };
  }

  function executeConversion(action) {
    action = isObject(action) ? action : {};
    const player = getPlayerProfile();
    const mode = String(action.mode || state.viewMode || 'SIMULATION').toUpperCase() === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
    const rates = allRateValues(mode);
    const result = calculateConversion(action.amount, action.fromCode, action.toCode, rates, FX_FEE_BPS);
    if (!result.ok) return result;
    const entry = {
      id: 'FX-' + String(state.nextTransactionId++), turn: currentTurn(),
      timestamp: new Date().toISOString(), type: 'CURRENCY_CONVERSION',
      playerCountryCode: player && (player.countryCode || player.iso3) || null,
      playerCountryName: player && player.name || null,
      mode: mode, provider: mode === 'REFERENCE' ? 'FRANKFURTER_V2' : 'OMEGA_SIMULATION',
      fromCode: result.fromCode, toCode: result.toCode, amountFrom: result.amount,
      usdNotional: result.usdNotional, crossRate: result.crossRate,
      amountGrossTo: result.grossTarget, amountTo: result.amountTarget,
      feeBps: result.feeBps, feeUsd: result.feeUsd, feeTo: result.feeTarget,
      settlementRoute: result.route, source: 'GOVERNMENT_BANKING_FX_CLEARING'
    };
    state.ledger.push(entry);
    state.ledger = state.ledger.slice(-500);
    state.settledVolumeUsd = (finite(state.settledVolumeUsd) || 0) + result.usdNotional;
    state.settlementFeesUsd = (finite(state.settlementFeesUsd) || 0) + result.feeUsd;
    const bank = bankingRoot();
    const clearing = ensureObject(bank, 'fxClearingHouse');
    clearing.settledVolumeUsd = state.settledVolumeUsd;
    clearing.feeRevenueUsd = state.settlementFeesUsd;
    clearing.transactionCount = finite(clearing.transactionCount) === null ? 1 : clearing.transactionCount + 1;
    clearing.lastSettlement = safeCopy(entry);
    syncAllCountries();
    dispatch('OMEGA_FX_TRANSACTION_SETTLED', safeCopy(entry));
    return Object.assign({ ok: true }, result, { transaction: safeCopy(entry) });
  }

  function simulationTick(turn, durationMs) {
    if (!initialized || !state) return { ok: false, code: 'NOT_INITIALIZED' };
    const currentTurnValue = finite(turn);
    const last = finite(state.lastProcessedTurn);
    const turnNumber = currentTurnValue === null ? (last === null ? 1 : last + 1) : currentTurnValue;
    if (last !== null && turnNumber <= last) return { ok: true, duplicate: true, turn: turnNumber };
    const dt = clamp(finite(durationMs) ?? HOUR_MS, 0, 30 * DAY_MS);
    const years = dt / YEAR_MS;
    if (years <= 0) return { ok: true, turn: turnNumber, processed: 0 };
    const usAnchor = anchorByCurrency.get('USD');
    const usMacro = usAnchor ? getMacro(usAnchor.profile) : {};
    const usInflation = finite(usMacro.inflation) ?? 2;
    const usGrowth = finite(usMacro.growth) ?? 2;
    const usPolicyRate = finite(usMacro.policyRatePct) ?? 3;

    currencies.forEach(function (_, code) {
      if (code === 'USD') return;
      const anchorRecord = anchorByCurrency.get(code);
      const profile = anchorRecord && anchorRecord.profile;
      const rateItem = state.simulationRates[code];
      const oldRate = finite(rateItem && rateItem.localPerUsd);
      if (!profile || oldRate === null || oldRate <= 0) return;
      const macro = getMacro(profile);
      const policy = currencyPolicy(code);
      const localInflation = finite(macro.inflation) ?? 3;
      const localPolicyRate = finite(macro.policyRatePct) ?? 3;
      const localGrowth = finite(macro.growth) ?? 0;
      const hash = code.split('').reduce(function (sum, ch) { return sum + ch.charCodeAt(0); }, 0);
      const shock = Math.sin((turnNumber + hash) * 1.61803398875) * 0.35;
      const bankState = rootState().governmentBanking || {};
      const monetaryStress = (bankState.monetaryStressByCurrency && bankState.monetaryStressByCurrency[code])
        || (global.OmegaEconomicTransmissionRuntime && global.OmegaEconomicTransmissionRuntime.getMonetaryStress
          ? global.OmegaEconomicTransmissionRuntime.getMonetaryStress(code) : null) || {};
      const drift = computeAnnualDrift({
        localInflationPct: localInflation, usInflationPct: usInflation,
        localPolicyRatePct: localPolicyRate, usPolicyRatePct: usPolicyRate,
        localGrowthPct: localGrowth, usGrowthPct: usGrowth,
        tradeBalanceToGdpPct: macro.tradeToGdpPct, debtToGdpPct: macro.debtToGdpPct,
        reservesToGdpPct: macro.reservesToGdpPct,
        moneySupplyGrowthPct: policy.moneySupplyGrowthPct,
        capitalFlowToGdpPct: finite(monetaryStress.capitalFlowToGdpPct),
        confidenceIndex: finite(monetaryStress.confidenceIndex),
        reserveCoverMonths: finite(monetaryStress.reserveCoverMonths),
        pegAttackPressurePct: finite(monetaryStress.pegAttackPressurePct), shockPct: shock
      });
      let nextRate = oldRate * Math.pow(Math.max(0.0001, 1 + drift / 100), years);
      if (policy.currencyRegime === 'MANAGED_FLOAT') {
        nextRate = oldRate + (nextRate - oldRate) * 0.55;
      } else if (policy.currencyRegime === 'PEG') {
        const target = finite(policy.pegTargetLocalPerUsd) ?? oldRate;
        const band = clamp(finite(policy.regimeBandPct) ?? 0.5, 0.1, 10) / 100;
        const lower = target * (1 - band);
        const upper = target * (1 + band);
        if (nextRate > upper) {
          const excess = nextRate - upper;
          const reserveDemand = Math.max(0, finite(macro.reserves) || 0);
          if (reserveDemand > 0) {
            const cost = Math.min(reserveDemand, reserveDemand * Math.min(0.10, excess / Math.max(upper, 0.0001)));
            const e = getEconomyRecord(profile);
            if (e) e.reserves = Math.max(0, reserveDemand - cost);
            nextRate = reserveDemand - cost > 0 ? upper : nextRate;
          }
        } else if (nextRate < lower) nextRate = lower;
        nextRate = clamp(nextRate, target * (1 - band * 2), target * (1 + band * 2));
      }
      nextRate = clamp(nextRate, 0.00000001, 1e12);
      state.simulationRates[code] = Object.assign({}, rateItem, {
        localPerUsd: nextRate, source: 'OMEGA_MONETARY_MODEL',
        updatedTurn: turnNumber, annualDriftPct: drift
      });
      const econ = getEconomyRecord(profile);
      if (econ) {
        const updatedInflation = evolveInflation({
          currentInflationPct: localInflation,
          targetInflationPct: policy.inflationTargetPct,
          policyRatePct: localPolicyRate,
          moneySupplyGrowthPct: policy.moneySupplyGrowthPct,
          gdpGrowthPct: localGrowth,
          currencyDepreciationAnnualPct: Math.max(0, drift),
          years: years
        });
        if (Number.isFinite(updatedInflation)) econ.inflation = updatedInflation;
        econ.exchange_rate_usd = nextRate;
      }
    });

    const dayBefore = finite(state.simulationDay) || 0;
    state.elapsedSimulationMs = (finite(state.elapsedSimulationMs) || 0) + dt;
    while (state.elapsedSimulationMs >= DAY_MS) {
      state.elapsedSimulationMs -= DAY_MS;
      state.simulationDay = (finite(state.simulationDay) || 0) + 1;
      appendSimHistories();
    }
    state.lastProcessedTurn = turnNumber;
    syncAllCountries();
    if (Math.floor(turnNumber) % 24 === 0) localStorageWrite();
    dispatch('OMEGA_FX_MARKET_UPDATED', {
      turn: turnNumber, simulationDay: state.simulationDay,
      currencyCount: currencies.size, baseCurrency: 'USD'
    });
    refreshPanelMetrics();
    if ((finite(state.simulationDay) || 0) !== dayBefore) renderCurrentCharts(false);
    return { ok: true, turn: turnNumber, processed: currencies.size, simulationDay: state.simulationDay };
  }

  function fmtRate(value) {
    const n = finite(value);
    if (n === null || n <= 0) return 'N/A';
    const digits = n >= 1000 ? 2 : n >= 10 ? 4 : n >= 1 ? 5 : 7;
    return numberText(n, digits);
  }
  function currencyLabel(code) {
    const c = currencies.get(normalizeCode(code));
    return normalizeCode(code) + ' · ' + (c && c.name || CURRENCY_NAME_OVERRIDES[code] || 'Currency');
  }
  function currencyOptions(selected) {
    return Array.from(currencies.values()).sort(function (a, b) { return a.code.localeCompare(b.code); }).map(function (c) {
      return '<option value="' + escapeHTML(c.code) + '"' + (c.code === selected ? ' selected' : '') + '>'
        + escapeHTML(c.code + ' · ' + (c.name || c.code)) + '</option>';
    }).join('');
  }
  function rateModeOptions(selected) {
    return '<option value="SIMULATION"' + (selected === 'SIMULATION' ? ' selected' : '') + '>OMEGA Game Simulation</option>'
      + '<option value="REFERENCE"' + (selected === 'REFERENCE' ? ' selected' : '') + '>World Reference Rates (online)</option>';
  }
  function renderCurrencyMarketTable(mode) {
    return Array.from(currencies.values()).sort(function (a, b) { return a.code.localeCompare(b.code); }).map(function (c) {
      const ref = rateFor(c.code, 'REFERENCE');
      const sim = rateFor(c.code, 'SIMULATION');
      const live = state.simulationRates[c.code];
      return '<tr><td>' + escapeHTML(c.code) + '</td><td>' + escapeHTML(c.name || c.code) + '</td>'
        + '<td>' + escapeHTML(String(c.countryCount || 0)) + '</td>'
        + '<td>' + escapeHTML(fmtRate(sim)) + '</td><td>' + escapeHTML(fmtRate(ref)) + '</td>'
        + '<td>' + escapeHTML(fmtRate(sim ? 1 / sim : null)) + '</td><td>' + escapeHTML(fmtRate(ref ? 1 / ref : null)) + '</td>'
        + '<td>' + escapeHTML(String(live && live.source || 'N/A')) + '</td></tr>';
    }).join('');
  }
  function renderBankingCountryTable(query, mode) {
    const q = String(query || '').trim().toLowerCase();
    const rows = profiles.filter(function (p) {
      const code = getCountryCurrency(p);
      return !q || String(p.name || '').toLowerCase().includes(q)
        || String(p.iso2 || p.countryCode || '').toLowerCase().includes(q)
        || String(p.iso3 || '').toLowerCase().includes(q)
        || String(code || '').toLowerCase().includes(q);
    });
    return rows.map(function (p) {
      const code = getCountryCurrency(p);
      const macro = getMacro(p);
      const ref = code ? rateFor(code, 'REFERENCE') : null;
      const sim = code ? rateFor(code, 'SIMULATION') : null;
      const fm = finance && typeof finance.getFinanceState === 'function'
        ? finance.getFinanceState(p.countryCode || p.iso3) : null;
      const economy = getEconomyRecord(p) || {};
      return '<tr><td>' + escapeHTML(p.name) + '</td><td>' + escapeHTML(p.iso3 || p.countryCode || '') + '</td>'
        + '<td>' + escapeHTML(code || 'N/A') + '</td><td>' + escapeHTML(fmtRate(mode === 'REFERENCE' ? ref : sim)) + '</td>'
        + '<td>' + escapeHTML(fmtRate(mode === 'REFERENCE' ? (ref ? 1 / ref : null) : (sim ? 1 / sim : null))) + '</td>'
        + '<td>' + escapeHTML(percentageText(finite(economy.inflation) ?? macro.inflation)) + '</td>'
        + '<td>' + escapeHTML(moneyText(finite(fm && fm.treasuryBalanceUsd))) + '</td>'
        + '<td>' + escapeHTML(moneyText(finite(economy.reserves) ?? macro.reserves)) + '</td>'
        + '<td>' + escapeHTML(String(p.profileStatus || 'PARTIAL')) + '</td></tr>';
    }).join('');
  }
  function renderPanel() {
    if (!global.document || !state || !finance) return false;
    const content = global.document.getElementById('ministry-dashboard-content');
    const dashboard = content && content.querySelector('.ofm-dashboard');
    const host = dashboard && dashboard.querySelector('[data-ofx-container]');
    if (!dashboard || !host || dashboard.querySelector('[data-ofx-panel]')) return false;
    const player = getPlayerProfile();
    const playerCode = getCountryCurrency(player) || 'USD';
    const defaultTo = currencies.has('NGN') && playerCode !== 'NGN' ? 'NGN' : 'USD';
    const mode = state.viewMode === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
    const rate = rateFor(playerCode, mode);
    const policy = currencyPolicy(playerCode);
    const sourceLine = mode === 'REFERENCE'
      ? 'Reference provider date: ' + (state.referenceRateDate || 'unavailable') + ' · ' + state.referenceStatus
      : 'Game rate source: ' + String(state.simulationRates[playerCode] && state.simulationRates[playerCode].source || 'unavailable');
    const panel = global.document.createElement('section');
    panel.className = 'ofx-panel';
    panel.setAttribute('data-ofx-panel', 'true');
    panel.innerHTML =
      '<section class="ofx-section ofx-hero"><div><div class="ofx-eyebrow">OMEGA / GLOBAL FOREIGN EXCHANGE</div>'
      + '<h3>Currency Market &amp; Monetary Authority</h3>'
      + '<p>USD is the settlement numeraire. Every conversion uses source currency → USD → destination currency.</p></div>'
      + '<div class="ofx-status" data-ofx-live="status">' + escapeHTML(state.referenceStatus) + '</div></section>'
      + '<div class="ofx-kpis">'
      + '<article><span>Active country currency</span><strong data-ofx-live="player-currency">' + escapeHTML(playerCode) + '</strong><small>' + escapeHTML(getCountryCurrencyName(player, playerCode)) + '</small></article>'
      + '<article><span>Local units per USD</span><strong data-ofx-live="player-rate">' + escapeHTML(fmtRate(rate)) + '</strong><small>' + escapeHTML(sourceLine) + '</small></article>'
      + '<article><span>USD per local unit</span><strong data-ofx-live="usd-per-local">' + escapeHTML(rate ? fmtRate(1 / rate) : 'N/A') + '</strong><small>Reciprocal FX quote</small></article>'
      + '<article><span>Known currency codes</span><strong data-ofx-live="currency-count">' + escapeHTML(String(currencies.size)) + '</strong><small>Shared currency zones use one rate</small></article>'
      + '</div>'
      + '<section class="ofx-section"><div class="ofx-heading"><div><h4>Cross-Currency Clearing</h4><p>Convert currencies directly, including BDT ↔ NGN. Settlements are recorded in Government Banking.</p></div>'
      + '<button type="button" class="ofx-secondary" data-ofx-refresh>Refresh reference rates</button></div>'
      + '<form class="ofx-form" data-ofx-action="ofx-convert">'
      + '<label>Amount<input name="amount" type="number" min="0.000001" step="any" value="1000" required></label>'
      + '<label>Sell currency<select name="fromCode">' + currencyOptions(playerCode) + '</select></label>'
      + '<label>Buy currency<select name="toCode">' + currencyOptions(defaultTo) + '</select></label>'
      + '<label>Rate source<select name="mode">' + rateModeOptions(mode) + '</select></label>'
      + '<button type="submit">Simulate &amp; record exchange</button>'
      + '</form><div class="ofx-result" data-ofx-conversion-result role="status">Choose two supported currencies and submit to calculate the cross-rate.</div>'
      + '<p class="ofx-note">Model settlement fee: ' + escapeHTML((FX_FEE_BPS / 100).toFixed(2)) + '% of USD notional. This records a simulated clearing transaction; it does not silently withdraw money from the sovereign treasury.</p>'
      + '</section>'
      + '<section class="ofx-section"><div class="ofx-heading"><div><h4>Central Bank &amp; Monetary Policy</h4><p>Policy changes affect subsequent game turns, inflation and currency pressure.</p></div></div>'
      + '<form class="ofx-form" data-ofx-action="ofx-policy">'
      + '<label>Inflation target (%)<input name="inflationTargetPct" type="number" min="0" max="50" step="0.1" value="' + escapeHTML(String(policy.inflationTargetPct)) + '" required></label>'
      + '<label>Money-supply growth (%)<input name="moneySupplyGrowthPct" type="number" min="-50" max="100" step="0.1" value="' + escapeHTML(String(policy.moneySupplyGrowthPct)) + '" required></label>'
      + '<label>Policy interest rate (%)<input name="policyInterestRatePct" type="number" min="0" max="40" step="0.1" value="' + escapeHTML(String((finance.getFinanceState(player && (player.countryCode || player.iso3)) || {}).policy && finance.getFinanceState(player && (player.countryCode || player.iso3)).policy.interestRateAnnualPct || 3)) + '" required></label>'
      + '<label>Exchange-rate regime<select name="currencyRegime">'
      + '<option value="FLOAT"' + (policy.currencyRegime === 'FLOAT' ? ' selected' : '') + '>Free float</option>'
      + '<option value="MANAGED_FLOAT"' + (policy.currencyRegime === 'MANAGED_FLOAT' ? ' selected' : '') + '>Managed float</option>'
      + '<option value="PEG"' + (policy.currencyRegime === 'PEG' ? ' selected' : '') + '>Currency peg</option>'
      + '</select></label><button type="submit">Apply monetary policy</button></form>'
      + '<p class="ofx-note">A high inflation rate, rapid money creation, weak reserves or fiscal risk tends to weaken a currency. Higher real policy rates and stronger reserves can support it. A peg requires adequate reserves.</p>'
      + '<form class="ofx-form ofx-intervention" data-ofx-action="ofx-intervention">'
      + '<label>Intervention (USD)<input name="amountUsd" type="number" min="1" step="any" placeholder="e.g. 50000000" required></label>'
      + '<label>Operation<select name="direction"><option value="SUPPORT_CURRENCY">Spend FX reserves to support currency</option><option value="WEAKEN_CURRENCY">Sell local currency to buy USD reserves</option></select></label>'
      + '<button type="submit">Execute central-bank intervention</button></form>'
      + '<div class="ofx-result" data-ofx-policy-result role="status">Policy controls apply to the active player country only.</div></section>'
      + '<section class="ofx-section"><div class="ofx-heading"><div><h4>One-Month Currency Trend</h4><p>Daily reference observations or the last 30 in-game day closes. Missing observations are not fabricated.</p></div>'
      + '<label class="ofx-inline-label">Currency<select id="ofx-chart-currency">' + currencyOptions(playerCode) + '</select></label>'
      + '<label class="ofx-inline-label">Series<select id="ofx-chart-mode">' + rateModeOptions(mode) + '</select></label></div>'
      + '<div class="ofx-chart-grid"><article class="ofx-chart"><h5>USD exchange rate line</h5><p>Local units for 1 USD</p><canvas id="ofx-line-chart" aria-label="One-month exchange rate line chart"></canvas></article>'
      + '<article class="ofx-chart"><h5>Daily rate movement</h5><p>Positive = local currency weakened; negative = strengthened</p><canvas id="ofx-bar-chart" aria-label="Daily local currency depreciation and appreciation bar chart"></canvas></article>'
      + '<article class="ofx-chart"><h5>Appreciation / depreciation days</h5><p>How often the local currency weakened, strengthened or stayed flat</p><canvas id="ofx-pie-chart" aria-label="Currency depreciation and appreciation day share pie chart"></canvas>'
      + '<div class="ofx-chart-legend" data-ofx-pie-legend></div></article></div>'
      + '<div class="ofx-note" data-ofx-history-status>Loading one-month observations...</div></section>'
      + '<details class="ofx-section"><summary>Global Currency Catalogue · ' + escapeHTML(String(currencies.size)) + ' ISO-style currency codes</summary>'
      + '<div class="ofx-table-scroll"><table class="ofx-table"><thead><tr><th>Code</th><th>Currency</th><th>Areas using it</th><th>Game units / USD</th><th>Reference units / USD</th><th>Game USD / Unit</th><th>Reference USD / Unit</th><th>Game rate source</th></tr></thead>'
      + '<tbody data-ofx-currency-table>' + renderCurrencyMarketTable(mode) + '</tbody></table></div></details>'
      + '<details class="ofx-section" data-ofx-banking-details><summary>Government Banking Registry · ' + escapeHTML(String(profiles.length)) + ' countries / areas</summary>'
      + '<label class="ofx-search">Filter country, ISO code or currency<input type="search" data-ofx-bank-filter placeholder="Bangladesh, NGA, BDT..."></label>'
      + '<div class="ofx-table-scroll"><table class="ofx-table"><thead><tr><th>Country / area</th><th>ISO</th><th>Currency</th><th>Local units / USD</th><th>USD / local currency unit</th><th>Inflation</th><th>Treasury (USD)</th><th>FX reserves (USD)</th><th>Data state</th></tr></thead>'
      + '<tbody data-ofx-banking-table></tbody></table></div></details>'
      + '<section class="ofx-section"><div class="ofx-heading"><div><h4>Recent FX Settlements</h4><p>Ledger shared with the Government Banking state.</p></div></div>'
      + '<div class="ofx-table-scroll"><table class="ofx-table"><thead><tr><th>Turn / date</th><th>Transaction</th><th>Pair</th><th>USD notional</th><th>Fee</th><th>Settlement route</th></tr></thead>'
      + '<tbody data-ofx-ledger-table></tbody></table></div></section>'
      + '<p class="ofx-footnote">Reference rates are daily central-bank/official-source observations, not live tick-by-tick quotes. Game rates begin from the repository baseline where available and then follow OMEGA policy and macroeconomic rules. Shared currency codes share a single FX rate.</p>';
    host.appendChild(panel);
    const table = panel.querySelector('[data-ofx-ledger-table]');
    if (table) table.innerHTML = renderLedger();
    const status = panel.querySelector('[data-ofx-history-status]');
    if (status) status.textContent = mode === 'REFERENCE'
      ? 'Reference series is fetched from the rate provider when online.'
      : 'Simulation series records one point per 24 hours of game time.';
    refreshPanelMetrics();
    renderCurrentCharts(false);
    return true;
  }

  function renderLedger() {
    if (!state.ledger.length) return '<tr><td colspan="6">No FX settlements recorded.</td></tr>';
    return state.ledger.slice(-12).reverse().map(function (entry) {
      const date = String(entry.timestamp || '').replace('T', ' ').slice(0, 16) || 'T' + String(entry.turn || 0);
      const pair = entry.type === 'CURRENCY_CONVERSION'
        ? entry.fromCode + ' → ' + entry.toCode
        : entry.currencyCode + ' · ' + entry.direction;
      return '<tr><td>' + escapeHTML(date) + '</td><td>' + escapeHTML(entry.type || '') + '</td>'
        + '<td>' + escapeHTML(pair) + '</td><td>' + escapeHTML(moneyText(entry.usdNotional ?? entry.amountUsd)) + '</td>'
        + '<td>' + escapeHTML(moneyText(entry.feeUsd)) + '</td><td>' + escapeHTML(entry.settlementRoute || 'CENTRAL_BANK') + '</td></tr>';
    }).join('');
  }
  function refreshPanelMetrics() {
    if (!global.document || !state) return;
    const content = global.document.getElementById('ministry-dashboard-content');
    const panel = content && content.querySelector('[data-ofx-panel]');
    if (!panel) return;
    const player = getPlayerProfile();
    const code = getCountryCurrency(player) || 'USD';
    const modeEl = panel.querySelector('#ofx-chart-mode');
    const mode = modeEl && modeEl.value === 'REFERENCE' ? 'REFERENCE' : state.viewMode;
    const activeRate = rateFor(code, mode);
    const values = {
      status: state.referenceStatus,
      'player-currency': code,
      'player-rate': fmtRate(activeRate),
      'usd-per-local': activeRate ? fmtRate(1 / activeRate) : 'N/A',
      'currency-count': String(currencies.size)
    };
    panel.querySelectorAll('[data-ofx-live]').forEach(function (node) {
      const key = node.getAttribute('data-ofx-live');
      if (own(values, key)) node.textContent = values[key];
    });
    const marketTbody = panel.querySelector('[data-ofx-currency-table]');
    if (marketTbody) marketTbody.innerHTML = renderCurrencyMarketTable(mode);
    const bankDetails = panel.querySelector('[data-ofx-banking-details]');
    const bankTbody = panel.querySelector('[data-ofx-banking-table]');
    if (bankDetails && bankDetails.open && bankTbody) {
      const filter = panel.querySelector('[data-ofx-bank-filter]');
      bankTbody.innerHTML = renderBankingCountryTable(filter && filter.value, mode);
    }
    const ledger = panel.querySelector('[data-ofx-ledger-table]');
    if (ledger) ledger.innerHTML = renderLedger();
  }

  function chartCanvas(canvas, height) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, Math.round(rect.width || canvas.parentElement && canvas.parentElement.clientWidth || 300));
    const h = height || 190;
    const ratio = Math.min(2, Math.max(1, finite(global.devicePixelRatio) || 1));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(h * ratio);
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, h);
    return { ctx: ctx, width: width, height: h };
  }
  function drawNoData(canvas, message) {
    const c = chartCanvas(canvas, 190);
    if (!c) return;
    c.ctx.fillStyle = '#9ba9ba';
    c.ctx.font = '12px system-ui';
    c.ctx.textAlign = 'center';
    c.ctx.fillText(message || 'One-month data unavailable', c.width / 2, c.height / 2);
  }
  function drawLineChart(canvas, points) {
    if (!Array.isArray(points) || points.length < 2) { drawNoData(canvas, 'Need at least two observations'); return; }
    const c = chartCanvas(canvas, 190); if (!c) return;
    const ctx = c.ctx, w = c.width, h = c.height;
    const left = 44, right = 12, top = 12, bottom = 28;
    const values = points.map(p => finite(p.rate)).filter(v => v !== null && v > 0);
    if (values.length < 2) { drawNoData(canvas, 'Rate data unavailable'); return; }
    let min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { min *= 0.995; max *= 1.005; }
    const spread = max - min; min -= spread * 0.08; max += spread * 0.08;
    const x = i => left + (w - left - right) * i / Math.max(1, points.length - 1);
    const y = v => top + (max - v) / (max - min) * (h - top - bottom);
    ctx.strokeStyle = '#24364a'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const yy = top + (h - top - bottom) * i / 3;
      ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(w - right, yy); ctx.stroke();
    }
    ctx.fillStyle = '#9ba9ba'; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(numberText(max, 3), left - 5, top + 4);
    ctx.fillText(numberText(min, 3), left - 5, h - bottom + 4);
    ctx.strokeStyle = '#42d4f4'; ctx.lineWidth = 2; ctx.beginPath();
    points.forEach(function (p, i) {
      const v = finite(p.rate); if (v === null || v <= 0) return;
      if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
    ctx.fillStyle = '#d8e6f3'; ctx.textAlign = 'left';
    ctx.fillText(String(points[0].date).slice(-8), left, h - 8);
    ctx.textAlign = 'right';
    ctx.fillText(String(points[points.length - 1].date).slice(-8), w - right, h - 8);
  }
  function dailyChanges(points) {
    const out = [];
    for (let i = 1; i < points.length; i += 1) {
      const a = finite(points[i - 1].rate), b = finite(points[i].rate);
      if (a !== null && b !== null && a > 0 && b > 0) {
        out.push({ date: points[i].date, changePct: (b / a - 1) * 100 });
      }
    }
    return out;
  }
  function drawBarChart(canvas, changes) {
    if (!Array.isArray(changes) || changes.length < 1) { drawNoData(canvas, 'Daily changes unavailable'); return; }
    const c = chartCanvas(canvas, 190); if (!c) return;
    const ctx = c.ctx, w = c.width, h = c.height, left = 28, right = 8, top = 12, bottom = 28;
    const maxAbs = Math.max(0.02, ...changes.map(x => Math.abs(finite(x.changePct) || 0)));
    const zeroY = top + (h - top - bottom) / 2;
    ctx.strokeStyle = '#24364a'; ctx.beginPath(); ctx.moveTo(left, zeroY); ctx.lineTo(w - right, zeroY); ctx.stroke();
    const usableW = w - left - right, barW = Math.max(2, usableW / changes.length * 0.64);
    changes.forEach(function (row, i) {
      const v = finite(row.changePct) || 0;
      const xx = left + usableW * i / changes.length + (usableW / changes.length - barW) / 2;
      const height = Math.abs(v) / maxAbs * ((h - top - bottom) / 2 - 4);
      ctx.fillStyle = v > 0.000001 ? '#f59e0b' : v < -0.000001 ? '#34d399' : '#64748b';
      ctx.fillRect(xx, v >= 0 ? zeroY - height : zeroY, barW, Math.max(1, height));
    });
    ctx.fillStyle = '#9ba9ba'; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
    ctx.fillText('+' + numberText(maxAbs, 2) + '%', left, top + 4);
    ctx.fillText('-' + numberText(maxAbs, 2) + '%', left, h - bottom + 12);
  }
  function drawPieChart(canvas, changes) {
    const c = chartCanvas(canvas, 160); if (!c) return;
    const ctx = c.ctx;
    let up = 0, down = 0, flat = 0;
    (changes || []).forEach(function (x) {
      const v = finite(x.changePct) || 0;
      if (v > 0.0001) up += 1; else if (v < -0.0001) down += 1; else flat += 1;
    });
    const total = up + down + flat;
    if (!total) { drawNoData(canvas, 'No movement observations'); return; }
    const pieces = [
      { count: up, color: '#f59e0b' },
      { count: down, color: '#34d399' },
      { count: flat, color: '#64748b' }
    ];
    let start = -Math.PI / 2;
    const cx = c.width / 2, cy = 78, radius = 52;
    pieces.forEach(function (piece) {
      if (!piece.count) return;
      const end = start + Math.PI * 2 * piece.count / total;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath();
      ctx.fillStyle = piece.color; ctx.fill(); start = end;
    });
    ctx.fillStyle = '#d8e6f3'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(String(total) + ' daily moves', cx, c.height - 9);
    const legend = global.document && global.document.querySelector('[data-ofx-pie-legend]');
    if (legend) legend.innerHTML = '<span><i style="background:#f59e0b"></i>Weakened (rate ↑) ' + up + '</span>'
      + '<span><i style="background:#34d399"></i>Strengthened (rate ↓) ' + down + '</span>'
      + '<span><i style="background:#64748b"></i>Flat ' + flat + '</span>';
  }
  async function renderCurrentCharts(force) {
    if (!global.document || !state) return;
    const content = global.document.getElementById('ministry-dashboard-content');
    const panel = content && content.querySelector('[data-ofx-panel]');
    if (!panel) return;
    const codeEl = panel.querySelector('#ofx-chart-currency');
    const modeEl = panel.querySelector('#ofx-chart-mode');
    const code = normalizeCode(codeEl && codeEl.value || getCountryCurrency(getPlayerProfile()) || 'USD');
    const mode = modeEl && modeEl.value === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
    if (mode === 'REFERENCE') await refreshReferenceRates(false);
    const points = await chartHistory(code, mode, !!force);
    const line = panel.querySelector('#ofx-line-chart');
    const bar = panel.querySelector('#ofx-bar-chart');
    const pie = panel.querySelector('#ofx-pie-chart');
    const changes = dailyChanges(points);
    drawLineChart(line, points);
    drawBarChart(bar, changes);
    drawPieChart(pie, changes);
    const status = panel.querySelector('[data-ofx-history-status]');
    if (status) status.textContent = mode === 'REFERENCE'
      ? (points.length ? 'Source: Frankfurter daily reference series · ' + points.length + ' observations ending ' + points[points.length - 1].date
        : 'Reference history unavailable; online access or provider coverage is required.')
      : (points.length ? 'Source: OMEGA simulated market · ' + points.length + ' in-game daily closes'
        : 'No simulated daily closes yet. The game must advance for 24 hours of simulation time.');
  }

  function showConversionResult(panel, result) {
    const output = panel && panel.querySelector('[data-ofx-conversion-result]');
    if (!output) return;
    if (!result || result.ok !== true) {
      output.textContent = 'Conversion unavailable: ' + String(result && result.code || 'unknown rate or amount');
      output.classList.add('is-error'); output.classList.remove('is-ok');
      return;
    }
    output.classList.add('is-ok'); output.classList.remove('is-error');
    output.textContent = numberText(result.amount, 6) + ' ' + result.fromCode
      + ' = ' + numberText(result.amountTarget, 6) + ' ' + result.toCode
      + ' (gross ' + numberText(result.grossTarget, 6) + ', cross-rate '
      + numberText(result.crossRate, 8) + ' ' + result.toCode + '/' + result.fromCode
      + ', fee ' + moneyText(result.feeUsd) + ', settlement via USD). Transaction recorded in Government Banking.';
  }
  function showPolicyResult(panel, result) {
    const output = panel && panel.querySelector('[data-ofx-policy-result]');
    if (!output) return;
    output.textContent = result && result.message || (result && result.ok ? 'Policy applied.' : 'Action rejected: ' + String(result && result.code || 'unknown'));
    output.classList.toggle('is-error', !result || result.ok !== true);
    output.classList.toggle('is-ok', !!result && result.ok === true);
  }
  function readForm(form) {
    const out = {};
    Array.from(form.elements || []).forEach(function (el) {
      if (el && el.name) out[el.name] = el.value;
    });
    return out;
  }
  function bindGlobalEvents() {
    if (!global.document || global.document.__omegaForexEventsBound) return;
    global.document.__omegaForexEventsBound = true;
    global.document.addEventListener('submit', function (event) {
      const form = event.target;
      const action = form && form.getAttribute && form.getAttribute('data-ofx-action');
      if (!action || action.indexOf('ofx-') !== 0) return;
      event.preventDefault();
      const content = global.document.getElementById('ministry-dashboard-content');
      const panel = content && content.querySelector('[data-ofx-panel]');
      const data = readForm(form);
      if (action === 'ofx-convert') {
        const mode = data.mode === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
        state.viewMode = mode;
        const result = executeConversion({
          amount: finite(data.amount), fromCode: data.fromCode, toCode: data.toCode, mode: mode
        });
        showConversionResult(panel, result);
        refreshPanelMetrics();
      } else if (action === 'ofx-policy') {
        const result = applyMonetaryPolicy({
          inflationTargetPct: finite(data.inflationTargetPct),
          moneySupplyGrowthPct: finite(data.moneySupplyGrowthPct),
          policyInterestRatePct: finite(data.policyInterestRatePct),
          currencyRegime: data.currencyRegime
        });
        showPolicyResult(panel, result);
        if (result && result.ok) {
          const newPolicy = getPolicyForPlayer().policy;
          const target = form.querySelector('[name="inflationTargetPct"]');
          const money = form.querySelector('[name="moneySupplyGrowthPct"]');
          if (target) target.value = String(newPolicy.inflationTargetPct);
          if (money) money.value = String(newPolicy.moneySupplyGrowthPct);
        }
      } else if (action === 'ofx-intervention') {
        const result = applyFxIntervention({ amountUsd: finite(data.amountUsd), direction: data.direction });
        showPolicyResult(panel, result);
      }
      if (panel) {
        const ledger = panel.querySelector('[data-ofx-ledger-table]');
        if (ledger) ledger.innerHTML = renderLedger();
      }
    });
    global.document.addEventListener('change', function (event) {
      const target = event.target;
      if (!target) return;
      if (target.id === 'ofx-chart-mode') {
        state.viewMode = target.value === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
        syncAllCountries();
        renderCurrentCharts(false);
        refreshPanelMetrics();
      } else if (target.id === 'ofx-chart-currency') {
        renderCurrentCharts(false);
      } else if (target.matches && target.matches('[data-ofx-bank-filter]')) {
        const content = global.document.getElementById('ministry-dashboard-content');
        const panel = content && content.querySelector('[data-ofx-panel]');
        const body = panel && panel.querySelector('[data-ofx-banking-table]');
        if (body) body.innerHTML = renderBankingCountryTable(target.value, state.viewMode);
      } else if (target.matches && target.matches('[data-ofx-action="ofx-convert"] select[name="mode"]')) {
        state.viewMode = target.value === 'REFERENCE' ? 'REFERENCE' : 'SIMULATION';
      }
    });
    global.document.addEventListener('input', function (event) {
      const target = event.target;
      if (target && target.matches && target.matches('[data-ofx-bank-filter]')) {
        const panel = target.closest('[data-ofx-panel]');
        const body = panel && panel.querySelector('[data-ofx-banking-table]');
        if (body && panel.querySelector('[data-ofx-banking-details]').open) {
          body.innerHTML = renderBankingCountryTable(target.value, state.viewMode);
        }
      }
    });
    global.document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest && event.target.closest('[data-ofx-refresh]');
      if (!target) return;
      refreshReferenceRates(true).then(function () {
        renderCurrentCharts(true);
        refreshPanelMetrics();
      });
    });
    global.document.addEventListener('toggle', function (event) {
      const target = event.target;
      if (!target || !target.matches || !target.matches('[data-ofx-banking-details]') || !target.open) return;
      const panel = target.closest('[data-ofx-panel]');
      const filter = panel && panel.querySelector('[data-ofx-bank-filter]');
      const body = panel && panel.querySelector('[data-ofx-banking-table]');
      if (body) body.innerHTML = renderBankingCountryTable(filter && filter.value, state.viewMode);
    }, true);
    global.addEventListener && global.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', function (event) {
      const detail = event && event.detail || {};
      const turn = finite(detail.simulationTurn) ?? finite(detail.payload && detail.payload.turn) ?? finite(detail.turn);
      const duration = finite(global.Omega && global.Omega.Simulation && global.Omega.Simulation.clock
        && global.Omega.Simulation.clock.stepDurationMs) ?? HOUR_MS;
      simulationTick(turn, duration);
    });
    global.addEventListener && global.addEventListener('OMEGA_FINANCE_STATE_UPDATED', function () {
      syncAllCountries();
      refreshPanelMetrics();
    });
    global.addEventListener && global.addEventListener('visibilitychange', function () {
      if (!global.document || global.document.visibilityState !== 'visible') return;
      refreshReferenceRates(false);
    });
    global.addEventListener && global.addEventListener('OMEGA_FINANCE_RUNTIME_READY', function () {
      initialize().catch(function (error) { console.error('[OMEGA FX INIT]', error); });
    });
    global.addEventListener && global.addEventListener('OMEGA_READY', function () {
      initialize().catch(function (error) { console.error('[OMEGA FX INIT]', error); });
    });
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    const work = function () {
      renderQueued = false;
      renderPanel();
    };
    if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(work);
    else if (typeof global.setTimeout === 'function') global.setTimeout(work, 0);
    else work();
  }
  function attachDashboardObserver() {
    if (!global.document || observer || typeof global.MutationObserver !== 'function') return;
    const target = global.document.getElementById('ministry-dashboard-content') || global.document.body;
    if (!target) return;
    observer = new global.MutationObserver(function () {
      const content = global.document.getElementById('ministry-dashboard-content');
      if (content && content.querySelector('.ofm-dashboard [data-ofx-container]') && !content.querySelector('[data-ofx-panel]')) queueRender();
    });
    observer.observe(target, { childList: true, subtree: true });
  }
  function currentTurn() {
    const root = rootState();
    const vals = [
      root && root.simulation && root.simulation.turn,
      root && root.simulation && root.simulation.currentTurn,
      root && root.turn,
      global.Omega && global.Omega.Simulation && global.Omega.Simulation.clock && global.Omega.Simulation.clock.turn
    ];
    for (let i = 0; i < vals.length; i += 1) {
      const n = finite(vals[i]);
      if (n !== null) return n;
    }
    return 0;
  }
  async function initialize() {
    if (initialized) {
      attachDashboardObserver();
      queueRender();
      return diagnostics();
    }
    if (initPromise) return initPromise;
    initPromise = (async function () {
      finance = global.OmegaFinanceMinistry || global.Omega && global.Omega.FinanceMinistry || null;
      if (!finance || typeof finance.getProfiles !== 'function') throw new Error('FINANCE_RUNTIME_NOT_READY');
      if (typeof finance.init === 'function') await finance.init();
      profiles = finance.getProfiles() || [];
      if (!Array.isArray(profiles) || !profiles.length) throw new Error('COUNTRY_PROFILE_REGISTRY_EMPTY');
      state = ensureForexState();
      buildCurrencyRegistry();
      loadCachedReferenceData();
      buildCurrencyRegistryFromExisting();
      seedSimulationRates();
      profiles.forEach(function (profile) {
        const code = getCountryCurrency(profile);
        if (code) currencyPolicy(code);
      });
      initialized = true;
      bindGlobalEvents();
      attachDashboardObserver();
      syncAllCountries();
      loadCurrencyMetadata().then(function () {
        localStorageWrite();
        queueRender();
      });
      queueRender();
      refreshReferenceRates(false).then(function () {
        seedSimulationRates();
        syncAllCountries();
        queueRender();
      });
      dispatch('OMEGA_FX_MONETARY_RUNTIME_READY', diagnostics());
      return diagnostics();
    })();
    try { return await initPromise; }
    finally { if (!initialized) initPromise = null; }
  }
  function buildCurrencyRegistryFromExisting() {
    if (!state || !isObject(state.referenceRates)) return;
    Object.keys(state.referenceRates).forEach(function (code) {
      const normalized = normalizeCode(code);
      if (normalized.length !== 3 || currencies.has(normalized)) return;
      currencies.set(normalized, {
        code: normalized, name: CURRENCY_NAME_OVERRIDES[normalized] || normalized + ' currency',
        symbol: null, countryCount: 0, countries: [], marketCode: effectiveRateCode(normalized)
      });
    });
  }
  function diagnostics() {
    return {
      version: VERSION, initialized: initialized, countryAreaCount: profiles.length,
      currencyCount: currencies.size,
      currenciesWithSimulationRate: currencies.size ? Array.from(currencies.keys()).filter(code => rateFor(code, 'SIMULATION') !== null).length : 0,
      currenciesWithReferenceRate: currencies.size ? Array.from(currencies.keys()).filter(code => rateFor(code, 'REFERENCE') !== null).length : 0,
      referenceStatus: state && state.referenceStatus || 'NOT_INITIALIZED',
      referenceRateDate: state && state.referenceRateDate || null,
      simulationDay: state && state.simulationDay || 0,
      activePlayerCountry: getPlayerProfile() && getPlayerProfile().name || null,
      activePlayerCurrency: getCountryCurrency(getPlayerProfile()),
      transactionCount: state && state.ledger ? state.ledger.length : 0,
      governmentBankingConnected: !!(rootState() && rootState().governmentBanking)
    };
  }
  const api = {
    VERSION: VERSION,
    init: initialize,
    diagnostics: diagnostics,
    refreshReferenceRates: refreshReferenceRates,
    loadReferenceHistory: loadReferenceHistory,
    simulationTick: simulationTick,
    syncGovernmentBanking: syncAllCountries,
    getProfiles: function () { return profiles.slice(); },
    getCurrencies: function () { return Array.from(currencies.values()).map(safeCopy); },
    getRate: rateFor,
    getRates: allRateValues,
    getCurrencyCode: getCountryCurrency,
    getPolicy: function (code) { return safeCopy(currencyPolicy(normalizeCode(code))); },
    applyMonetaryPolicy: applyMonetaryPolicy,
    intervene: applyFxIntervention,
    convert: executeConversion,
    getState: function () { return safeCopy(state); },
    math: {
      calculateConversion: calculateConversion,
      computeAnnualDrift: computeAnnualDrift,
      evolveInflation: evolveInflation,
      appendHistoryPoint: appendHistoryPoint,
      getCountryCurrency: getCountryCurrency,
      effectiveRateCode: effectiveRateCode
    }
  };
  global.OmegaForexMonetaryEngine = api;

  if (global.document) {
    global.addEventListener && global.addEventListener('load', function () {
      initialize().catch(function (error) { console.error('[OMEGA FX INIT]', error); });
    }, { once: true });
    if (global.document.readyState === 'complete' || global.document.readyState === 'interactive') {
      Promise.resolve().then(function () { initialize().catch(function (error) { console.error('[OMEGA FX INIT]', error); }); });
    } else {
      global.document.addEventListener('DOMContentLoaded', function () {
        initialize().catch(function (error) { console.error('[OMEGA FX INIT]', error); });
      }, { once: true });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
