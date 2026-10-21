/* OMEGA foreign-reserve reference data + live reserve-account bridge v1.0.0.
 * Reference registry is immutable. Live reserve assets are stored separately from Treasury cash.
 */
(function (global) {
  'use strict';
  if (global.OmegaForeignReserveRuntime && global.OmegaForeignReserveRuntime.VERSION === '1.0.0') return;

  const VERSION = '1.0.0';
  const DATA_PATH = 'foreign_exchange_reserve_profiles_v1.json';
  let finance = null;
  let profiles = [];
  let registryRows = [];
  let byIdentity = new Map();
  let initialized = false;
  let initPromise = null;
  let eventsBound = false;
  let registryStatus = 'NOT_LOADED';
  let registryError = null;
  let baselineYear = null;

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => !!value && Object.prototype.hasOwnProperty.call(value, key);
  const finite = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  };
  const norm = value => String(value == null ? '' : value).normalize('NFKC').trim().toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };
  function ensureObject(parent, key) {
    if (!isObject(parent[key])) parent[key] = {};
    return parent[key];
  }
  function rootState() {
    const candidates = [
      global.Omega && global.Omega.Simulation && global.Omega.Simulation.world && global.Omega.Simulation.world.state,
      global.Omega && global.Omega.World && global.Omega.World.state,
      global.Game && global.Game.state,
      global.gameState
    ];
    const unique = candidates.filter((value, index) => isObject(value) && candidates.indexOf(value) === index);
    return unique.find(value => isObject(value.economy) && Object.keys(value.economy).length > 0)
      || unique.find(value => isObject(value.economy))
      || unique[0]
      || (global.gameState = { economy: {}, finance: {}, simulation: { turn: 0 } });
  }
  function currentTurn(eventTurn) {
    const supplied = finite(eventTurn);
    if (supplied !== null) return supplied;
    const root = rootState();
    const values = [
      root && root.simulation && root.simulation.turn,
      root && root.simulation && root.simulation.currentTurn,
      root && root.turn,
      global.Omega && global.Omega.Simulation && global.Omega.Simulation.clock && global.Omega.Simulation.clock.turn
    ];
    for (const value of values) {
      const number = finite(value);
      if (number !== null) return number;
    }
    return 0;
  }
  function bankingState(create) {
    const root = rootState();
    const bank = isObject(root.governmentBanking) ? root.governmentBanking
      : (create ? ensureObject(root, 'governmentBanking') : null);
    if (!bank) return null;
    const fx = isObject(bank.forex) ? bank.forex : (create ? ensureObject(bank, 'forex') : null);
    if (!fx) return null;
    if (create && !isObject(fx.reserveAccountsByCountry)) fx.reserveAccountsByCountry = {};
    if (create && !isObject(fx.reserveRegistry)) fx.reserveRegistry = {};
    return { root: root, bank: bank, fx: fx };
  }
  function profileIds(profile) {
    return [profile && profile.iso3, profile && profile.countryCode, profile && profile.code,
      profile && profile.iso2, profile && profile.numericCode, profile && profile.name,
      profile && profile.economyKey].filter(Boolean).map(norm);
  }
  function indexProfiles() {
    byIdentity = new Map();
    profiles.forEach(profile => profileIds(profile).forEach(key => {
      if (!byIdentity.has(key)) byIdentity.set(key, profile);
    }));
  }
  function resolveProfile(value) {
    if (value && typeof value === 'object') value = value.iso3 || value.countryCode || value.code
      || value.iso2 || value.numericCode || value.economyKey || value.name;
    return byIdentity.get(norm(value)) || null;
  }
  function findRegistryRow(profile) {
    const keys = profileIds(profile);
    for (const row of registryRows) {
      const rowKeys = profileIds({ iso3: row.iso3, countryCode: row.countryCode,
        numericCode: row.numericCode, name: row.countryName, economyKey: row.economyKey });
      if (rowKeys.some(key => keys.indexOf(key) >= 0)) return row;
    }
    return null;
  }
  function economyRecord(profile, root) {
    const state = root || rootState();
    const row = profile && profile.economyKey && state.economy && state.economy[profile.economyKey];
    return isObject(row) ? row : null;
  }
  function currencyFor(profile) {
    try {
      const fx = global.OmegaForexMonetaryEngine;
      if (fx && typeof fx.getCurrencyCode === 'function') {
        const code = fx.getCurrencyCode(profile);
        if (code) return String(code).trim().toUpperCase();
      }
    } catch (_) {}
    const row = findRegistryRow(profile);
    const source = profile && profile.sourceValues;
    return String((row && row.currencyCode) || (source && source.currency_code) || '').trim().toUpperCase() || null;
  }
  function currencyNameFor(profile, code) {
    const row = findRegistryRow(profile);
    return row && row.currencyCode === code && row.currencyName
      || profile && profile.sourceValues && profile.sourceValues.currency_name || code || 'Currency unavailable';
  }
  function simulationRate(code) {
    if (!code) return null;
    const fx = global.OmegaForexMonetaryEngine;
    try {
      const rate = fx && typeof fx.getRate === 'function' ? finite(fx.getRate(code, 'SIMULATION')) : null;
      return rate !== null && rate > 0 ? rate : null;
    } catch (_) { return null; }
  }
  function canonicalRecord(profile) {
    const row = findRegistryRow(profile);
    if (row) return {
      referenceReservesUsd: finite(row.referenceReservesUsd),
      baselineYear: finite(row.baselineYear) ?? baselineYear,
      source: row.sourceFile && row.sourceField ? row.sourceFile + ':' + row.sourceField : 'FOREIGN_RESERVE_REFERENCE_REGISTRY',
      status: row.status || (finite(row.referenceReservesUsd) === null ? 'NOT_RECORDED' : 'RECORDED_BASELINE')
    };
    const source = profile && profile.sourceValues || {};
    const indicators = profile && profile.indicators || {};
    const candidates = [finite(source.reserves), finite(indicators.foreignExchangeReservesUsd)].filter(value => value !== null);
    if (new Set(candidates).size > 1) {
      return { referenceReservesUsd: null, baselineYear: 2015, source: 'PROFILE_SOURCE_CONFLICT', status: 'SOURCE_CONFLICT' };
    }
    return {
      referenceReservesUsd: candidates.length ? candidates[0] : null,
      baselineYear: 2015,
      source: 'FINANCE_PROFILE_FALLBACK',
      status: candidates.length ? 'PROFILE_FALLBACK_BASELINE' : 'NOT_RECORDED'
    };
  }
  function liveAccountStore() {
    const refs = bankingState(true);
    return refs.fx.reserveAccountsByCountry;
  }
  function accountKey(profile) {
    return norm(profile && (profile.iso3 || profile.countryCode || profile.code || profile.name));
  }
  function writeAccountProjections(profile, account, detail) {
    const refs = bankingState(true);
    const root = refs.root;
    const econ = economyRecord(profile, root);
    if (econ && account.balanceUsd !== null) econ.reserves = account.balanceUsd;
    const currencyCode = account.domesticCurrencyCode;
    const localPerUsd = simulationRate(currencyCode);
    const record = {
      countryCode: profile.countryCode || profile.code || profile.iso2 || null,
      iso3: profile.iso3 || null,
      countryName: profile.name || 'Unknown',
      currencyCode: currencyCode,
      currencyName: account.domesticCurrencyName,
      foreignReserveCurrencyCode: 'USD',
      foreignExchangeReservesUsd: account.balanceUsd,
      foreignExchangeReservesBaselineUsd: account.referenceReservesUsd,
      foreignReserveBaselineYear: account.baselineYear,
      foreignReserveStatus: account.status,
      foreignReserveSource: account.source,
      reserveUpdatedTurn: account.updatedTurn,
      localPerUsd: localPerUsd,
      usdPerLocalUnit: localPerUsd !== null ? 1 / localPerUsd : null
    };
    const countryKey = norm(profile.countryCode || profile.code || profile.iso2 || profile.iso3);
    refs.bank.countries = isObject(refs.bank.countries) ? refs.bank.countries : {};
    if (countryKey) refs.bank.countries[countryKey] = Object.assign({}, refs.bank.countries[countryKey] || {}, record);
    if (profile.iso3) {
      const financeRoot = ensureObject(root, 'finance');
      const financeCountry = ensureObject(financeRoot, profile.iso3);
      financeCountry.governmentBanking = Object.assign({}, financeCountry.governmentBanking || {}, record);
    }
    refs.fx.reserveRegistry = Object.assign({}, refs.fx.reserveRegistry || {}, {
      version: VERSION,
      status: registryStatus,
      baselineYear: baselineYear,
      countryAreaCount: registryRows.length,
      recordsWithReferenceReservesUsd: registryRows.filter(row => finite(row.referenceReservesUsd) !== null).length,
      recordsWithoutReferenceReservesUsd: registryRows.filter(row => finite(row.referenceReservesUsd) === null).length,
      updatedTurn: currentTurn(detail && detail.turn),
      error: registryError
    });
  }
  function ensureAccount(profile) {
    if (!profile) return null;
    const store = liveAccountStore();
    const key = accountKey(profile);
    if (!key) return null;
    const old = store[key];
    const root = rootState();
    const econ = economyRecord(profile, root);
    const reference = canonicalRecord(profile);
    const activeEconomyReserve = finite(econ && econ.reserves);
    if (isObject(old) && own(old, 'balanceUsd')) {
      if (old.referenceReservesUsd === undefined) old.referenceReservesUsd = reference.referenceReservesUsd;
      if (old.baselineYear === undefined) old.baselineYear = reference.baselineYear;
      if (!old.domesticCurrencyCode) old.domesticCurrencyCode = currencyFor(profile);
      if (!old.domesticCurrencyName) old.domesticCurrencyName = currencyNameFor(profile, old.domesticCurrencyCode);
      if (old.balanceUsd === null) old.status = 'NOT_RECORDED';
      return old;
    }
    const seededBalance = activeEconomyReserve !== null && activeEconomyReserve >= 0
      ? activeEconomyReserve : reference.referenceReservesUsd;
    const balance = seededBalance !== null && seededBalance >= 0 ? seededBalance : null;
    const account = {
      schemaVersion: VERSION,
      countryCode: profile.countryCode || profile.code || profile.iso2 || null,
      iso3: profile.iso3 || null,
      countryName: profile.name || 'Unknown',
      domesticCurrencyCode: currencyFor(profile),
      domesticCurrencyName: currencyNameFor(profile, currencyFor(profile)),
      reserveCurrencyCode: 'USD',
      referenceReservesUsd: reference.referenceReservesUsd,
      balanceUsd: balance,
      baselineYear: reference.baselineYear,
      status: balance === null ? 'NOT_RECORDED' : (reference.referenceReservesUsd === null
        ? 'LIVE_GAME_VALUE_WITHOUT_REFERENCE_BASELINE' : 'LIVE'),
      source: activeEconomyReserve !== null && activeEconomyReserve >= 0
        ? 'EXISTING_GAME_STATE' : (reference.referenceReservesUsd !== null ? 'REFERENCE_BASELINE_SEED' : 'NOT_RECORDED'),
      referenceSource: reference.source,
      updatedTurn: currentTurn(),
      revision: 0
    };
    store[key] = account;
    writeAccountProjections(profile, account, null);
    return account;
  }
  function buildFallbackRegistry() {
    registryRows = profiles.map(profile => {
      const ref = canonicalRecordWithoutRegistry(profile);
      return {
        countryCode: profile.countryCode || profile.iso2 || null,
        iso3: profile.iso3 || null,
        numericCode: profile.numericCode || null,
        countryName: profile.name || 'Unknown',
        economyKey: profile.economyKey || null,
        currencyCode: currencyForWithoutRegistry(profile),
        currencyName: profile.sourceValues && profile.sourceValues.currency_name || null,
        baselineYear: 2015,
        referenceReservesUsd: ref.referenceReservesUsd,
        status: ref.referenceReservesUsd === null ? 'NOT_RECORDED' : 'PROFILE_FALLBACK_BASELINE'
      };
    });
    registryStatus = 'PROFILE_FALLBACK_NO_REGISTRY_FETCH';
    baselineYear = 2015;
  }
  function canonicalRecordWithoutRegistry(profile) {
    const source = profile && profile.sourceValues || {};
    const indicators = profile && profile.indicators || {};
    const values = [finite(source.reserves), finite(indicators.foreignExchangeReservesUsd)].filter(value => value !== null);
    return { referenceReservesUsd: new Set(values).size > 1 ? null : (values.length ? values[0] : null) };
  }
  function currencyForWithoutRegistry(profile) {
    const sourceCode = profile && profile.sourceValues && profile.sourceValues.currency_code;
    const indicatorCode = profile && profile.indicators && profile.indicators.currencyCode;
    const codes = [sourceCode, indicatorCode].filter(value => typeof value === 'string' && value.trim());
    return new Set(codes).size > 1 ? null : (codes[0] || null);
  }
  async function fetchRegistry() {
    let data = null;
    if (typeof global.fetchResilient === 'function') {
      try { data = await global.fetchResilient(DATA_PATH); } catch (_) {}
    }
    if (!isObject(data) && typeof global.fetch === 'function') {
      const response = await global.fetch(DATA_PATH + '?v=' + encodeURIComponent(VERSION), { cache: 'no-store' });
      if (!response || response.ok === false) throw new Error('RESERVE_REGISTRY_HTTP_ERROR');
      data = await response.json();
    }
    if (!isObject(data) || !Array.isArray(data.reserves) || data.schemaVersion !== '1.0.0') {
      throw new Error('RESERVE_REGISTRY_SCHEMA_INVALID');
    }
    const seen = new Set();
    data.reserves.forEach(row => {
      const id = norm(row && (row.iso3 || row.countryCode));
      const amount = finite(row && row.referenceReservesUsd);
      if (!id || seen.has(id)) throw new Error('RESERVE_REGISTRY_ID_INVALID');
      if (amount !== null && amount < 0) throw new Error('RESERVE_REGISTRY_AMOUNT_INVALID');
      if ((amount === null) !== (row.status === 'NOT_RECORDED')) throw new Error('RESERVE_REGISTRY_STATUS_INVALID');
      seen.add(id);
    });
    registryRows = data.reserves.map(row => clone(row));
    baselineYear = finite(data.metadata && data.metadata.baselineYear) ?? 2015;
    registryStatus = 'LOADED';
    registryError = null;
  }
  function syncFromEconomy(detail) {
    if (!initialized) return { ok: false, code: 'NOT_INITIALIZED' };
    const turn = currentTurn(detail && detail.turn);
    let changed = 0;
    profiles.forEach(profile => {
      const account = ensureAccount(profile);
      const econ = economyRecord(profile, rootState());
      const observed = finite(econ && econ.reserves);
      if (!account || observed === null || observed < 0) return;
      if (account.balanceUsd === null || Math.abs(account.balanceUsd - observed) > 0.0001) {
        account.balanceUsd = observed;
        account.status = account.referenceReservesUsd === null ? 'LIVE_GAME_VALUE_WITHOUT_REFERENCE_BASELINE' : 'LIVE';
        account.source = 'OMEGA_FX_SIMULATION_SYNC';
        account.updatedTurn = turn;
        account.revision = (finite(account.revision) || 0) + 1;
        writeAccountProjections(profile, account, { turn: turn });
        changed += 1;
      }
    });
    if (changed) dispatch('OMEGA_FOREIGN_RESERVE_ACCOUNT_UPDATED', {
      turn: turn, changed, countryAreaCount: profiles.length, source: 'OMEGA_FX_SIMULATION_SYNC'
    });
    return { ok: true, changed, turn: turn };
  }
  function syncIntervention(detail) {
    if (!initialized || !isObject(detail)) return { ok: false, code: 'NOT_INITIALIZED' };
    const profile = resolveProfile(detail.countryCode || detail.iso3 || detail.countryId);
    const amount = finite(detail.reserveAfterUsd);
    if (!profile || amount === null || amount < 0) return { ok: false, code: 'INTERVENTION_RESERVE_SNAPSHOT_INVALID' };
    const account = ensureAccount(profile);
    if (!account) return { ok: false, code: 'RESERVE_ACCOUNT_UNAVAILABLE' };
    account.balanceUsd = amount;
    account.status = account.referenceReservesUsd === null ? 'LIVE_GAME_VALUE_WITHOUT_REFERENCE_BASELINE' : 'LIVE';
    account.source = 'CENTRAL_BANK_INTERVENTION';
    account.updatedTurn = currentTurn(detail.turn);
    account.revision = (finite(account.revision) || 0) + 1;
    writeAccountProjections(profile, account, detail);
    dispatch('OMEGA_FOREIGN_RESERVE_ACCOUNT_UPDATED', {
      turn: account.updatedTurn, countryCode: profile.countryCode, iso3: profile.iso3,
      balanceUsd: account.balanceUsd, source: account.source
    });
    return { ok: true, account: clone(account) };
  }
  function dispatch(type, detail) {
    try {
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(type, { detail: detail || {} }));
      }
    } catch (_) {}
  }
  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    if (typeof global.addEventListener !== 'function') return;
    global.addEventListener('OMEGA_FX_INTERVENTION_SETTLED', event => syncIntervention(event && event.detail || {}));
    global.addEventListener('OMEGA_FX_MARKET_UPDATED', event => syncFromEconomy(event && event.detail || {}));
    global.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', event => syncFromEconomy(event && event.detail || {}));
    global.addEventListener('OMEGA_FOREIGN_RESERVE_RUNTIME_READY', () => refreshView());
  }
  function refreshView() {
    if (!initialized) return false;
    profiles.forEach(profile => {
      const account = ensureAccount(profile);
      if (account) writeAccountProjections(profile, account, null);
    });
    try {
      const financeRuntime = global.OmegaFinanceMinistry;
      if (financeRuntime && typeof financeRuntime.renderDashboard === 'function') {
        const root = rootState();
        if (root && root.ui && root.ui.activeMinistry === 'finance') financeRuntime.renderDashboard('finance');
      }
    } catch (_) {}
    return true;
  }
  async function init() {
    if (initialized) return diagnostics();
    if (initPromise) return initPromise;
    initPromise = (async function () {
      finance = global.OmegaFinanceMinistry || global.Omega && global.Omega.FinanceMinistry || null;
      if (!finance || typeof finance.getProfiles !== 'function') throw new Error('FINANCE_RUNTIME_NOT_READY');
      if (typeof finance.init === 'function') await finance.init();
      profiles = finance.getProfiles() || [];
      if (!Array.isArray(profiles) || !profiles.length) throw new Error('COUNTRY_PROFILE_REGISTRY_EMPTY');
      indexProfiles();
      try {
        await fetchRegistry();
      } catch (error) {
        registryError = String(error && error.message || error);
        buildFallbackRegistry();
      }
      const refs = bankingState(true);
      refs.fx.reserveAccountsByCountry = isObject(refs.fx.reserveAccountsByCountry) ? refs.fx.reserveAccountsByCountry : {};
      profiles.forEach(profile => ensureAccount(profile));
      profiles.forEach(profile => {
        const account = ensureAccount(profile);
        if (account) writeAccountProjections(profile, account, null);
      });
      initialized = true;
      bindEvents();
      dispatch('OMEGA_FOREIGN_RESERVE_RUNTIME_READY', diagnostics());
      return diagnostics();
    })();
    try { return await initPromise; }
    finally { if (!initialized) initPromise = null; }
  }
  function getAccount(countryValue) {
    const profile = resolveProfile(countryValue);
    if (!profile) return null;
    const account = ensureAccount(profile);
    if (!account) return null;
    const localPerUsd = simulationRate(account.domesticCurrencyCode);
    const localEquivalent = account.balanceUsd !== null && localPerUsd !== null
      ? account.balanceUsd * localPerUsd : null;
    return clone(Object.assign({}, account, {
      localPerUsd: localPerUsd,
      usdPerLocalUnit: localPerUsd !== null ? 1 / localPerUsd : null,
      localEquivalent: localEquivalent,
      localEquivalentCurrencyCode: account.domesticCurrencyCode,
      referenceLocalEquivalent: account.referenceReservesUsd !== null && localPerUsd !== null
        ? account.referenceReservesUsd * localPerUsd : null,
      liveAndReferenceDiffer: account.balanceUsd !== null && account.referenceReservesUsd !== null
        ? Math.abs(account.balanceUsd - account.referenceReservesUsd) > 0.0001 : null
    }));
  }
  function getReserveProfiles() { return registryRows.map(row => clone(row)); }
  function getPlayerAccount() {
    let player = null;
    try { player = finance && typeof finance.getPlayerCountry === 'function' ? finance.getPlayerCountry() : null; } catch (_) {}
    return getAccount(player);
  }
  function diagnostics() {
    const rows = profiles.map(profile => getAccount(profile)).filter(Boolean);
    return {
      version: VERSION,
      initialized: initialized,
      registryStatus: registryStatus,
      registryError: registryError,
      baselineYear: baselineYear,
      countryAreaCount: profiles.length,
      registryRecordCount: registryRows.length,
      accountsWithLiveReserves: rows.filter(row => finite(row.balanceUsd) !== null).length,
      accountsWithoutLiveReserves: rows.filter(row => finite(row.balanceUsd) === null).length,
      recordsWithReferenceReserves: registryRows.filter(row => finite(row.referenceReservesUsd) !== null).length,
      recordsWithoutReferenceReserves: registryRows.filter(row => finite(row.referenceReservesUsd) === null).length,
      playerCountry: getPlayerAccount()
    };
  }
  const api = {
    VERSION: VERSION,
    init: init,
    diagnostics: diagnostics,
    getAccount: getAccount,
    getPlayerAccount: getPlayerAccount,
    getReserveProfiles: getReserveProfiles,
    syncFromEconomy: syncFromEconomy
  };
  global.OmegaForeignReserveRuntime = api;

  if (global.addEventListener) {
    global.addEventListener('OMEGA_FX_MONETARY_RUNTIME_READY', function () {
      init().catch(error => console.error('[OMEGA FOREIGN RESERVES INIT]', error));
    });
    global.addEventListener('OMEGA_FINANCE_RUNTIME_READY', function () {
      init().catch(error => console.error('[OMEGA FOREIGN RESERVES INIT]', error));
    });
    global.addEventListener('OMEGA_READY', function () {
      init().catch(error => console.error('[OMEGA FOREIGN RESERVES INIT]', error));
    });
  }
  if (global.document) {
    if (global.document.readyState === 'complete' || global.document.readyState === 'interactive') {
      Promise.resolve().then(() => init().catch(error => console.error('[OMEGA FOREIGN RESERVES INIT]', error)));
    } else if (global.document.addEventListener) {
      global.document.addEventListener('DOMContentLoaded', function () {
        init().catch(error => console.error('[OMEGA FOREIGN RESERVES INIT]', error));
      }, { once: true });
    }
    global.addEventListener && global.addEventListener('load', function () {
      init().catch(error => console.error('[OMEGA FOREIGN RESERVES INIT]', error));
    }, { once: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
