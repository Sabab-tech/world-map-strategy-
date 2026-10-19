/* OMEGA GOVERNMENT BANKING + CROSS-BORDER CLEARING v1.0.0
 * Additive state/account layer. Finance Ministry remains Treasury authority.
 * All monetary operations are in-game simulation transactions; no real bank rail exists.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0';
  if (g.OmegaGovernmentBanking && g.OmegaGovernmentBanking.VERSION === VERSION) return;

  const DAY_MS = 86400000;
  const USD = 'USD';
  const CACHE_KEY = 'omega.government-banking.v1';
  const DEFAULT_RULES = Object.freeze({
    schemaVersion: '1.0.0',
    baselineYear: 2015,
    fxFeeBps: 15,
    defaultImportTariffPct: 2.5,
    maximumImportTariffPct: 80,
    defaultTransferDelayTurns: 0,
    maximumTransferDelayTurns: 365,
    maximumSingleTransferPctOfGDP: 2,
    defaultCorrespondentLimitUsd: 250000000,
    defaultDailyTransferLimitUsd: 1000000000,
    highRiskSingleTransferLimitUsd: 10000000,
    maximumCounterpartyRiskPct: 95,
    riskDebtToGdpPct: 300,
    riskInflationPct: 50,
    lowReserveToGdpPct: 5,
    maximumLedgerEntries: 4096,
    maximumHistoryEntries: 256,
    currencyRateMode: 'SIMULATION',
    missingRatePolicy: 'REJECT',
    openingAccountSource: 'EXISTING_FINANCE_TREASURY',
    reconciliationPolicy: 'EXPLICIT_LEDGER_DELTA',
    tradePolicyEnabled: true
  });

  let finance = null;
  let fx = null;
  let profiles = [];
  let byId = new Map();
  let rules = Object.assign({}, DEFAULT_RULES);
  let initialized = false;
  let initPromise = null;
  let panelObserver = null;
  let panelQueued = false;

  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function num(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = v => { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; } };
  function norm(v) {
    return String(v == null ? '' : v).normalize('NFKC').trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(v) {
    const n = num(v);
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
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n); }
    catch (_) { return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  }
  function qty(v, digits) {
    const n = num(v);
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
    try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits == null ? 4 : digits }).format(n); }
    catch (_) { return String(n); }
  }
  function dispatch(type, detail) {
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function')
        g.dispatchEvent(new g.CustomEvent(type, { detail: clone(detail || {}) }));
    } catch (_) {}
  }
  function stateCandidates() {
    const all = [
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state,
      g.Omega && g.Omega.World && g.Omega.World.state,
      g.Game && g.Game.state, g.gameState
    ];
    return all.filter((s, i) => obj(s) && all.indexOf(s) === i);
  }
  function rootState() {
    const all = stateCandidates();
    return all.find(s => obj(s.economy) && Object.keys(s.economy).length > 0)
      || all.find(s => obj(s.finance) && Object.keys(s.finance).length > 0)
      || all[0]
      || (g.gameState = { economy: {}, finance: {}, simulation: { turn: 0 } });
  }
  function turn() {
    const root = rootState();
    const values = [
      root.simulation && root.simulation.turn,
      root.turn, root.simulationTurn,
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn
    ];
    for (const v of values) { const n = num(v); if (n !== null) return n; }
    return 0;
  }
  function bankingState(create) {
    const root = rootState();
    if (!obj(root.governmentBanking)) {
      if (!create) return null;
      root.governmentBanking = {};
    }
    const bank = root.governmentBanking;
    if (create) {
      if (!obj(bank.accountsByCountry)) bank.accountsByCountry = {};
      if (!obj(bank.tradePolicies)) bank.tradePolicies = {};
      if (!obj(bank.pendingTransfers)) bank.pendingTransfers = {};
      if (!obj(bank.pendingTradeSettlements)) bank.pendingTradeSettlements = {};
      if (!obj(bank.inFlightSettlements)) bank.inFlightSettlements = {};
      if (!obj(bank.idempotency)) bank.idempotency = {};
      if (!obj(bank.riskRegister)) bank.riskRegister = {};
      if (!obj(bank.diagnostics)) bank.diagnostics = { reconciliationErrors: [], rejections: {} };
      if (!Array.isArray(bank.ledger)) bank.ledger = [];
      if (!Array.isArray(bank.events)) bank.events = [];
      if (!obj(bank.fxClearingHouse)) bank.fxClearingHouse = {};
      if (!num(bank.nextSequence) || bank.nextSequence < 1) bank.nextSequence = 1;
      if (!num(bank.settledVolumeUsd)) bank.settledVolumeUsd = 0;
      if (!num(bank.feeRevenueUsd)) bank.feeRevenueUsd = 0;
      if (!num(bank.pendingEscrowUsd)) bank.pendingEscrowUsd = 0;
      bank.schemaVersion = VERSION;
      bank.baseCurrency = USD;
      bank.quoteConvention = 'LOCAL_UNITS_PER_USD';
    }
    return bank;
  }
  function emitLedgerEvent(type, detail) {
    const bank = bankingState(true);
    const event = Object.assign({ type, turn: turn(), timestamp: new Date().toISOString() }, clone(detail || {}));
    bank.events.push(event);
    bank.events = bank.events.slice(-Number(rules.maximumHistoryEntries || 256));
    dispatch(type, event);
    return event;
  }
  function rate(code, mode) {
    if (!fx || typeof fx.getRate !== 'function') return null;
    const r = num(fx.getRate(code, mode || 'SIMULATION'));
    return r !== null && r > 0 ? r : null;
  }
  function currencyCode(profile) {
    try { return fx && typeof fx.getCurrencyCode === 'function' ? fx.getCurrencyCode(profile) : null; }
    catch (_) { return null; }
  }
  function currencyName(code) {
    const row = fx && typeof fx.getCurrencies === 'function'
      ? fx.getCurrencies().find(c => String(c.code).toUpperCase() === String(code).toUpperCase()) : null;
    return row && row.name || code;
  }
  function profileId(profile) { return norm(profile && (profile.iso3 || profile.countryCode || profile.code || profile.iso2)); }
  function resolveProfile(value) {
    if (!value) return null;
    if (finance && typeof finance.resolveCountry === 'function') {
      try { const p = finance.resolveCountry(value); if (p) return p; } catch (_) {}
    }
    return byId.get(norm(value)) || profiles.find(p =>
      [p.name, p.iso3, p.countryCode, p.iso2, p.economyKey].some(v => v && norm(v) === norm(value))) || null;
  }
  function playerProfile() {
    if (finance && typeof finance.getPlayerCountry === 'function') {
      try { const p = finance.getPlayerCountry(); if (p) return p; } catch (_) {}
    }
    const root = rootState();
    const raw = root.simulation && (root.simulation.session && root.simulation.session.playerCountryId || root.simulation.playerCountryId);
    return resolveProfile(raw) || resolveProfile('BGD') || profiles[0] || null;
  }
  function treasuryBucket(profile, create) {
    const root = rootState();
    if (!obj(root.finance)) {
      if (!create) return null;
      root.finance = {};
    }
    const keys = [profile && profile.iso3, profile && profile.countryCode, profile && profile.economyKey, profile && profile.name]
      .filter(Boolean).map(String);
    for (const key of keys) if (obj(root.finance[key])) return root.finance[key];
    if (!create || !profile) return null;
    const key = String(profile.iso3 || profile.countryCode);
    root.finance[key] = {};
    return root.finance[key];
  }
  function readTreasuryUsd(profile) {
    let model = null;
    try {
      if (finance && typeof finance.getFinanceState === 'function')
        model = finance.getFinanceState(profile.countryCode || profile.iso3 || profile.code);
    } catch (_) {}
    const rootBucket = treasuryBucket(profile, false);
    const value = num(rootBucket && rootBucket.available)
      ?? num(model && model.treasuryBalanceUsd)
      ?? num(model && model.available);
    return value !== null && value >= 0 ? value : null;
  }
  function writeTreasuryUsd(profile, value, source) {
    const amount = num(value);
    if (!profile || amount === null || amount < -1e-8) return { ok: false, code: 'TREASURY_VALUE_INVALID' };
    const clean = Math.max(0, amount);
    const bucket = treasuryBucket(profile, true);
    const prior = num(bucket.available);
    bucket.available = clean;
    bucket.governmentBankingLastWrite = {
      source: source || 'GOVERNMENT_BANKING',
      amountUsd: clean, turn: turn(), transactionId: null
    };
    try {
      if (finance && typeof finance.getFinanceState === 'function')
        finance.getFinanceState(profile.countryCode || profile.iso3 || profile.code);
    } catch (_) {}
    bucket.available = clean;
    return { ok: true, previousUsd: prior, balanceUsd: clean };
  }
  function currentMacro(profile) {
    const root = rootState();
    const economy = obj(root.economy) && profile.economyKey && obj(root.economy[profile.economyKey])
      ? root.economy[profile.economyKey] : {};
    const indicators = obj(profile.indicators) ? profile.indicators : {};
    const gdp = num(economy.gdp) ?? num(indicators.gdpCurrentUsd);
    const debt = num(economy.debt) ?? num(indicators.publicDebtUsd);
    const reserves = num(economy.reserves) ?? num(indicators.foreignExchangeReservesUsd);
    const inflation = num(economy.inflation) ?? num(indicators.inflationRatePct);
    const trade = num(economy.trade_balance) ?? num(indicators.tradeBalanceUsd);
    return {
      gdpUsd: gdp, debtUsd: debt, debtToGdpPct: gdp > 0 && debt !== null ? debt / gdp * 100 : num(indicators.publicDebtToGdpPct),
      reservesUsd: reserves, reservesToGdpPct: gdp > 0 && reserves !== null ? reserves / gdp * 100 : num(indicators.reservesToGdpPct),
      inflationPct: inflation, tradeBalanceUsd: trade,
      economy: economy
    };
  }
  function riskScore(profile) {
    const m = currentMacro(profile);
    let score = 45, evidence = 0;
    if (m.debtToGdpPct !== null) { score += clamp(m.debtToGdpPct / Number(rules.riskDebtToGdpPct || 300), 0, 1) * 25; evidence++; }
    if (m.inflationPct !== null) { score += clamp(m.inflationPct / Number(rules.riskInflationPct || 50), 0, 1) * 15; evidence++; }
    if (m.reservesToGdpPct !== null) { score += (1 - clamp(m.reservesToGdpPct / Number(rules.lowReserveToGdpPct || 5), 0, 1)) * 15; evidence++; }
    const bank = bankingState(false);
    const other = bank && bank.riskRegister && bank.riskRegister[profileId(profile)];
    if (other && num(other.confidenceIndex) !== null) score += clamp((50 - other.confidenceIndex) / 50, 0, 1) * 15;
    return { score: clamp(score, 0, 100), confidence: evidence >= 2 ? 'MEDIUM' : 'LOW', evidenceCount: evidence };
  }
  function countryRelations(a, b) {
    const root = rootState();
    const from = profileId(a), to = profileId(b);
    const candidates = [
      root.foreign && root.foreign[from] && root.foreign[from].relations && root.foreign[from].relations[to],
      root.foreign && root.foreign[a.countryCode] && root.foreign[a.countryCode].relations && root.foreign[a.countryCode].relations[b.countryCode],
      root.trade && root.trade[from] && root.trade[from].relations && root.trade[from].relations[to]
    ].filter(obj);
    return candidates[0] || null;
  }
  function sanctionDecision(from, to, direction) {
    const bank = bankingState(true);
    const a = profileId(from), b = profileId(to);
    const pA = ensurePolicy(from), pB = ensurePolicy(to);
    const relation = countryRelations(from, to) || countryRelations(to, from);
    const sanctioned = (pA.sanctionedCountryCodes || []).map(norm).includes(b)
      || (pB.sanctionedCountryCodes || []).map(norm).includes(a)
      || !!(relation && (relation.sanctions === true || relation.war_state === true || relation.embargo === true));
    if (sanctioned) return { allowed: false, reason: 'BILATERAL_SANCTION_OR_WAR', direction };
    return { allowed: true, reason: null, direction };
  }
  function ensurePolicy(profile) {
    const bank = bankingState(true), code = profileId(profile);
    if (!obj(bank.tradePolicies[code])) {
      bank.tradePolicies[code] = {
        schemaVersion: VERSION, countryCode: code, source: 'CONFIGURED_GAME_RULE_DEFAULTS',
        importTariffPct: Number(rules.defaultImportTariffPct || 0),
        defaultPaymentDelayTurns: Number(rules.defaultTransferDelayTurns || 0),
        maximumTransferPctOfGDP: Number(rules.maximumSingleTransferPctOfGDP || 2),
        correspondentLimitUsd: Number(rules.defaultCorrespondentLimitUsd || 250000000),
        dailyTransferLimitUsd: Number(rules.defaultDailyTransferLimitUsd || 1000000000),
        counterpartyRiskTolerancePct: Number(rules.maximumCounterpartyRiskPct || 95),
        sanctionedCountryCodes: [], counterpartyRiskOverrides: {}, revision: 0
      };
    }
    return bank.tradePolicies[code];
  }
  function ensureCountry(profile) {
    if (!profile) return null;
    const bank = bankingState(true), id = profileId(profile);
    if (!obj(bank.accountsByCountry[id])) {
      const home = currencyCode(profile);
      const cashUsd = readTreasuryUsd(profile);
      const homeRate = home ? rate(home, 'SIMULATION') : null;
      const accounts = {};
      accounts.USD = {
        currencyCode: USD, currencyName: currencyName(USD), balance: cashUsd,
        source: cashUsd === null ? 'TREASURY_UNAVAILABLE' : 'FINANCE_TREASURY_MIRROR',
        openingBalance: cashUsd, lastUpdatedTurn: turn(), revision: 0, accountType: 'SOVEREIGN_CLEARING'
      };
      if (home && home !== USD) accounts[home] = {
        currencyCode: home, currencyName: currencyName(home), balance: 0,
        source: 'UNFUNDED_SECONDARY_ACCOUNT', openingBalance: 0,
        lastUpdatedTurn: turn(), revision: 0, accountType: 'SOVEREIGN_CLEARING'
      };
      bank.accountsByCountry[id] = {
        schemaVersion: VERSION, countryCode: id, countryName: profile.name,
        homeCurrencyCode: home, accounts: accounts, openingTreasuryUsd: cashUsd,
        lastTreasuryUsd: cashUsd, openingSource: cashUsd === null ? 'UNAVAILABLE' : 'FINANCE_TREASURY_MIRROR',
        lastReconciliationTurn: turn(), revision: 0, reservedUsd: 0, integrity: 'INITIALIZED'
      };
    }
    ensurePolicy(profile);
    const book = bank.accountsByCountry[id];
    if (!obj(book.accounts)) book.accounts = {};
    const home = currencyCode(profile);
    if (home && !obj(book.accounts[home])) book.accounts[home] = {
      currencyCode: home, currencyName: currencyName(home), balance: 0,
      source: 'UNFUNDED_SECONDARY_ACCOUNT', openingBalance: 0,
      lastUpdatedTurn: turn(), revision: 0, accountType: 'SOVEREIGN_CLEARING'
    };
    if (!obj(book.accounts.USD)) book.accounts.USD = {
      currencyCode: USD, currencyName: currencyName(USD), balance: 0,
      source: 'UNFUNDED_SECONDARY_ACCOUNT', openingBalance: 0,
      lastUpdatedTurn: turn(), revision: 0, accountType: 'SOVEREIGN_CLEARING'
    };
    return book;
  }
  function ensureAccount(profile, code) {
    const bank = ensureCountry(profile);
    const c = String(code || '').trim().toUpperCase();
    if (!bank || !/^[A-Z]{3}$/.test(c)) return null;
    if (!obj(bank.accounts[c])) bank.accounts[c] = {
      currencyCode: c, currencyName: currencyName(c), balance: 0,
      source: 'UNFUNDED_SECONDARY_ACCOUNT', openingBalance: 0,
      lastUpdatedTurn: turn(), revision: 0, accountType: 'SOVEREIGN_CLEARING'
    };
    return bank.accounts[c];
  }
  function balanceOf(profile, code) {
    const a = ensureAccount(profile, code);
    return a ? num(a.balance) : null;
  }
  function heldUsd(profileIdValue, exceptKey) {
    const bank = bankingState(false);
    if (!bank) return 0;
    let total = 0;
    const p = bank.pendingTransfers || {};
    for (const [key, row] of Object.entries(p)) {
      if (key === exceptKey || row.status !== 'PENDING') continue;
      if (norm(row.sourceCountryCode) !== norm(profileIdValue)) continue;
      total += Math.max(0, num(row.amountUsd) || 0);
    }
    const t = bank.pendingTradeSettlements || {};
    for (const [key, row] of Object.entries(t)) {
      if (key === exceptKey || row.status !== 'PENDING') continue;
      if (norm(row.buyerCountryCode) !== norm(profileIdValue)) continue;
      total += Math.max(0, num(row.buyerDebitUsd) || 0);
    }
    const active = bank.inFlightSettlements || {};
    for (const [key, row] of Object.entries(active)) {
      if (key === exceptKey || !row || ['SETTLED','CANCELLED','COMPENSATED'].includes(String(row.status || '').toUpperCase())) continue;
      if (norm(row.buyerCountryCode) !== norm(profileIdValue)) continue;
      const prepared = bank.pendingTradeSettlements && bank.pendingTradeSettlements[key];
      total += Math.max(0, num(prepared && prepared.buyerDebitUsd) || 0);
    }
    return total;
  }
  function countryBookValueUsd(profile) {
    const book = ensureCountry(profile);
    if (!book) return null;
    let total = 0, seen = 0;
    for (const [code, account] of Object.entries(book.accounts || {})) {
      const amount = num(account.balance);
      if (amount === null) continue;
      const quote = rate(code, 'SIMULATION');
      if (quote === null) {
        if (Math.abs(amount) > 1e-8) return null;
        continue;
      }
      total += amount / quote;
      seen++;
    }
    return seen ? Math.max(0, total) : null;
  }
  function treasuryGap(profile) {
    const cash = readTreasuryUsd(profile);
    const value = countryBookValueUsd(profile);
    return { treasuryUsd: cash, accountsUsd: value, gapUsd: cash !== null && value !== null ? cash - value : null };
  }
  function appendAccountLedger(profile, entry) {
    const bank = bankingState(true), book = ensureCountry(profile);
    const row = Object.assign({
      transactionId: entry.transactionId || nextId('GB'), countryCode: profileId(profile),
      countryName: profile.name, turn: turn(), timestamp: new Date().toISOString(),
      status: 'POSTED', authority: entry.authority || 'OMEGA_GOVERNMENT_BANKING'
    }, clone(entry));
    const ledger = Array.isArray(book.ledger) ? book.ledger : [];
    ledger.push(row);
    book.ledger = ledger.slice(-Number(rules.maximumHistoryEntries || 256));
    book.revision = (num(book.revision) || 0) + 1;
    return row;
  }
  function nextId(prefix) {
    const bank = bankingState(true);
    const seq = Math.max(1, Math.floor(num(bank.nextSequence) || 1));
    bank.nextSequence = seq + 1;
    return String(prefix || 'GB') + '-' + String(turn()) + '-' + String(seq).padStart(8, '0');
  }
  function existingTransaction(key) {
    const bank = bankingState(false);
    const id = String(key || '').trim();
    if (!bank || !id) return null;
    if (obj(bank.idempotency[id])) return bank.idempotency[id];
    return (bank.ledger || []).find(x => String(x.transactionId || x.idempotencyKey || '') === id) || null;
  }
  function addGlobalLedger(entry) {
    const bank = bankingState(true);
    const row = Object.assign({ transactionId: nextId('GB'), turn: turn(), timestamp: new Date().toISOString() }, clone(entry || {}));
    const key = String(row.idempotencyKey || '').trim();
    if (key) {
      // A delayed payment is one transaction that changes state; update its journal row
      // from PENDING to SETTLED/CANCELLED rather than leaving two contradictory "latest" rows.
      const priorIndex = bank.ledger.findIndex(x => String(x.idempotencyKey || '') === key);
      if (priorIndex >= 0) bank.ledger[priorIndex] = row;
      else bank.ledger.push(row);
      bank.idempotency[key] = { transactionId: row.transactionId, status: row.status, result: clone(row) };
    } else {
      bank.ledger.push(row);
    }
    bank.ledger = bank.ledger.slice(-Number(rules.maximumLedgerEntries || 4096));
    return row;
  }
  function getOpenTransferRows(countryCode) {
    const bank = bankingState(false);
    return Object.values(bank && bank.pendingTransfers || {}).filter(row =>
      row.status === 'PENDING' && (!countryCode || norm(row.sourceCountryCode) === norm(countryCode)));
  }
  function availableBalance(profile, code, exceptTransactionId) {
    const balance = balanceOf(profile, code);
    if (balance === null) return null;
    let held = 0;
    const id = profileId(profile);
    const bank = bankingState(false);
    for (const [key, row] of Object.entries(bank && bank.pendingTransfers || {})) {
      if (key === exceptTransactionId || row.status !== 'PENDING' || row.sourceCountryCode !== id || row.sourceCurrencyCode !== code) continue;
      const r = rate(code, 'SIMULATION');
      held += r ? (num(row.amountUsd) || 0) * r : 0;
    }
    for (const [key, row] of Object.entries(bank && bank.pendingTradeSettlements || {})) {
      if (key === exceptTransactionId || row.status !== 'PENDING' || row.buyerCountryCode !== id || row.buyerCurrencyCode !== code) continue;
      held += num(row.buyerDebitLocal) || 0;
    }
    return Math.max(0, balance - held);
  }
  function setAccountBalance(profile, code, value) {
    const a = ensureAccount(profile, code);
    const n = num(value);
    if (!a || n === null || n < -1e-8) return { ok: false, code: 'ACCOUNT_BALANCE_INVALID' };
    a.balance = Math.max(0, n);
    a.lastUpdatedTurn = turn();
    a.revision = (num(a.revision) || 0) + 1;
    return { ok: true, account: a };
  }
  function ensureNoSanction(from, to, direction) {
    const result = sanctionDecision(from, to, direction || 'TRANSFER');
    if (!result.allowed) {
      const bank = bankingState(true);
      bank.diagnostics.rejections[result.reason] = (num(bank.diagnostics.rejections[result.reason]) || 0) + 1;
    }
    return result;
  }
  function checkTransferLimits(from, to, usdAmount) {
    const policyA = ensurePolicy(from), policyB = ensurePolicy(to);
    const risk = riskScore(to);
    const maxSingle = Math.min(
      num(policyA.correspondentLimitUsd) ?? Number(rules.defaultCorrespondentLimitUsd),
      num(policyB.correspondentLimitUsd) ?? Number(rules.defaultCorrespondentLimitUsd)
    );
    if (usdAmount > maxSingle) return { ok: false, code: 'CORRESPONDENT_LIMIT_EXCEEDED', maxSingleUsd: maxSingle };
    const root = rootState(), dayTurns = 24;
    const used = (bankingState(false).ledger || []).filter(row =>
      row.type === 'CROSS_BORDER_TRANSFER' &&
      norm(row.sourceCountryCode) === profileId(from) &&
      turn() - (num(row.turn) || 0) < dayTurns &&
      row.status === 'SETTLED'
    ).reduce((sum, row) => sum + (num(row.amountUsd) || 0), 0);
    const dailyLimit = Math.min(
      num(policyA.dailyTransferLimitUsd) ?? Number(rules.defaultDailyTransferLimitUsd),
      num(policyB.dailyTransferLimitUsd) ?? Number(rules.defaultDailyTransferLimitUsd)
    );
    if (used + usdAmount > dailyLimit) return { ok: false, code: 'DAILY_TRANSFER_LIMIT_EXCEEDED', usedUsd: used, dailyLimitUsd: dailyLimit };
    if (risk.score > (num(policyA.counterpartyRiskTolerancePct) ?? Number(rules.maximumCounterpartyRiskPct))
      && usdAmount > Number(rules.highRiskSingleTransferLimitUsd || 10000000)) {
      return { ok: false, code: 'COUNTERPARTY_RISK_LIMIT_EXCEEDED', riskScore: risk.score, confidence: risk.confidence };
    }
    return { ok: true, risk };
  }
  function setAccountUsdBalance(profile, deltaUsd, txId, mode) {
    const book = ensureCountry(profile);
    if (!book) return { ok: false, code: 'BANK_ACCOUNT_BOOK_UNAVAILABLE' };
    let remaining = num(deltaUsd);
    if (remaining === null) return { ok: false, code: 'USD_DELTA_INVALID' };
    if (Math.abs(remaining) < 1e-8) return { ok: true, affected: [] };
    const accounts = book.accounts;
    const home = book.homeCurrencyCode;
    const ordered = Object.keys(accounts).sort((a, b) => {
      const priority = code => code === USD ? 0 : code === home ? 1 : 2;
      return priority(a) - priority(b) || a.localeCompare(b);
    });
    const affected = [];
    if (remaining > 0) {
      const acc = ensureAccount(profile, USD);
      acc.balance = (num(acc.balance) || 0) + remaining;
      acc.lastUpdatedTurn = turn(); acc.revision = (num(acc.revision) || 0) + 1;
      affected.push({ currencyCode: USD, amount: remaining, direction: 'CREDIT' });
      return { ok: true, affected };
    }
    let toDebitUsd = -remaining;
    for (const code of ordered) {
      if (toDebitUsd <= 1e-8) break;
      const acc = accounts[code], quote = rate(code, 'SIMULATION');
      if (!acc || quote === null) continue;
      let available = num(acc.balance) || 0;
      if (code === USD) available -= heldUsd(profileId(profile), txId);
      const canUsd = Math.min(Math.max(0, available / quote), toDebitUsd);
      if (canUsd <= 1e-8) continue;
      const localAmount = canUsd * quote;
      acc.balance = Math.max(0, (num(acc.balance) || 0) - localAmount);
      acc.lastUpdatedTurn = turn(); acc.revision = (num(acc.revision) || 0) + 1;
      affected.push({ currencyCode: code, amount: localAmount, amountUsd: canUsd, direction: 'DEBIT' });
      toDebitUsd -= canUsd;
    }
    if (toDebitUsd > 1e-6) return { ok: false, code: 'BANK_ACCOUNT_ASSETS_INSUFFICIENT', shortfallUsd: toDebitUsd };
    return { ok: true, affected };
  }
  function reconcileCountry(profile, options) {
    const activeBank = bankingState(false), activeId = profileId(profile);
    if (!(options && options.force) && activeBank && obj(activeBank.inFlightSettlements)
      && Object.values(activeBank.inFlightSettlements).some(row => row && (row.buyerCountryCode === activeId || row.sellerCountryCode === activeId)))
      return { ok: true, changed: false, deferred: true, code: 'TRADE_SETTLEMENT_IN_FLIGHT' };
    const book = ensureCountry(profile);
    if (!book) return { ok: false, code: 'BANK_ACCOUNT_BOOK_UNAVAILABLE' };
    const cash = readTreasuryUsd(profile);
    if (cash === null) return { ok: false, code: 'TREASURY_UNAVAILABLE' };
    const value = countryBookValueUsd(profile);
    if (value === null) return { ok: false, code: 'ACCOUNT_VALUATION_UNAVAILABLE' };
    const gap = cash - value;
    if (Math.abs(gap) <= 0.01) {
      book.lastTreasuryUsd = cash; book.lastReconciliationTurn = turn(); book.integrity = 'RECONCILED';
      return { ok: true, gapUsd: gap, changed: false };
    }
    if (options && options.skipDelta) {
      book.lastTreasuryUsd = cash;
      book.integrity = Math.abs(gap) <= 1 ? 'RECONCILED' : 'BALANCE_GAP';
      book.lastReconciliationTurn = turn();
      return { ok: true, gapUsd: gap, changed: false, preservedGap: true };
    }
    const delta = setAccountUsdBalance(profile, gap, null, 'RECONCILIATION');
    if (!delta.ok) {
      book.integrity = 'DEGRADED';
      const bank = bankingState(true);
      bank.diagnostics.reconciliationErrors = (bank.diagnostics.reconciliationErrors || []).concat([{
        countryCode: book.countryCode, turn: turn(), treasuryUsd: cash, accountsUsd: value,
        gapUsd: gap, reason: delta.code
      }]).slice(-128);
      return { ok: false, code: 'RECONCILIATION_FAILED', detail: delta };
    }
    appendAccountLedger(profile, {
      type: 'TREASURY_RECONCILIATION', transactionId: nextId('RECON'), currencyCode: USD,
      amount: Math.abs(gap), direction: gap > 0 ? 'CREDIT' : 'DEBIT',
      amountUsd: Math.abs(gap), source: 'EXTERNAL_FINANCE_RUNTIME_DELTA',
      description: 'Reconciled existing Finance Treasury activity to currency sub-ledgers.'
    });
    book.lastTreasuryUsd = cash; book.lastReconciliationTurn = turn(); book.integrity = 'RECONCILED';
    return { ok: true, gapUsd: gap, changed: true, delta };
  }
  function syncTreasuryToAccounts(profile, source, transactionId) {
    const book = ensureCountry(profile);
    const amount = countryBookValueUsd(profile);
    if (!book || amount === null) return { ok: false, code: 'ACCOUNT_VALUATION_UNAVAILABLE' };
    const written = writeTreasuryUsd(profile, amount, source || 'GOVERNMENT_BANKING');
    if (!written.ok) return written;
    book.lastTreasuryUsd = amount;
    book.lastReconciliationTurn = turn();
    if (transactionId) book.lastTransactionId = transactionId;
    return { ok: true, treasuryBalanceUsd: amount };
  }

  function appendAccountMovements(profile, moves, metadata) {
    for (const move of moves) {
      const account = ensureAccount(profile, move.currencyCode);
      if (!account) continue;
      appendAccountLedger(profile, Object.assign({}, metadata || {}, move));
    }
  }
  function policySnapshot(profile) {
    const p = ensurePolicy(profile);
    return clone(p);
  }
  function updateTradePolicy(action) {
    const player = playerProfile();
    const target = resolveProfile(action.countryId || action.countryCode) || player;
    if (!player || !target || profileId(target) !== profileId(player))
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION', message: 'Only the active player country policy can be changed here.' };
    const p = ensurePolicy(target);
    const tariff = num(action.importTariffPct), delay = num(action.defaultPaymentDelayTurns),
      one = num(action.correspondentLimitUsd), daily = num(action.dailyTransferLimitUsd),
      risk = num(action.counterpartyRiskTolerancePct);
    if (tariff === null || tariff < 0 || tariff > Number(rules.maximumImportTariffPct || 80))
      return { ok: false, code: 'IMPORT_TARIFF_OUT_OF_RANGE' };
    if (delay === null || delay < 0 || delay > Number(rules.maximumTransferDelayTurns || 365) || Math.floor(delay) !== delay)
      return { ok: false, code: 'PAYMENT_DELAY_OUT_OF_RANGE' };
    for (const [v, label] of [[one, 'CORRESPONDENT_LIMIT'], [daily, 'DAILY_LIMIT']])
      if (v === null || v <= 0 || v > 1e15) return { ok: false, code: label + '_INVALID' };
    if (risk === null || risk < 0 || risk > 100) return { ok: false, code: 'COUNTERPARTY_RISK_TOLERANCE_OUT_OF_RANGE' };
    p.importTariffPct = tariff; p.defaultPaymentDelayTurns = delay;
    p.correspondentLimitUsd = one; p.dailyTransferLimitUsd = daily;
    p.counterpartyRiskTolerancePct = risk; p.updatedTurn = turn(); p.revision = (num(p.revision) || 0) + 1;
    emitLedgerEvent('OMEGA_GOVERNMENT_BANKING_POLICY_UPDATED', {
      countryCode: profileId(target), importTariffPct: tariff,
      defaultPaymentDelayTurns: delay, correspondentLimitUsd: one,
      dailyTransferLimitUsd: daily, counterpartyRiskTolerancePct: risk
    });
    return { ok: true, message: 'Government Banking policy updated for the active player country.' };
  }

  function quoteTransfer(input) {
    input = obj(input) ? input : {};
    const from = resolveProfile(input.sourceCountryId || input.fromCountryId || input.countryId);
    const to = resolveProfile(input.destinationCountryId || input.toCountryId);
    if (!from || !to) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    const fromCode = String(input.fromCurrencyCode || input.fromCode || currencyCode(from) || '').toUpperCase();
    const toCode = String(input.toCurrencyCode || input.toCode || currencyCode(to) || '').toUpperCase();
    const amount = num(input.amount);
    if (amount === null || amount <= 0) return { ok: false, code: 'TRANSFER_AMOUNT_INVALID' };
    const rf = rate(fromCode, 'SIMULATION'), rt = rate(toCode, 'SIMULATION');
    if (rf === null || rt === null) return { ok: false, code: 'FX_RATE_UNAVAILABLE', fromCode, toCode };
    const usdNotional = amount / rf;
    const feeBps = clamp(num(input.feeBps) ?? Number(rules.fxFeeBps || 15), 0, 1000);
    const feeUsd = usdNotional * feeBps / 10000;
    const amountTarget = Math.max(0, usdNotional - feeUsd) * rt;
    const limit = checkTransferLimits(from, to, usdNotional);
    if (!limit.ok) return Object.assign({}, limit, { amount, fromCode, toCode, usdNotional, feeUsd, amountTarget });
    const sanctions = ensureNoSanction(from, to, input.direction || 'CROSS_BORDER_TRANSFER');
    if (!sanctions.allowed) return { ok: false, code: sanctions.reason, amount, fromCode, toCode, usdNotional, feeUsd, amountTarget };
    return {
      ok: true, amount, fromCode, toCode, usdNotional, feeUsd, amountTarget,
      amountGrossTarget: usdNotional * rt, feeTarget: feeUsd * rt,
      crossRate: rt / rf, route: fromCode === USD || toCode === USD ? 'DIRECT_USD' : 'SOURCE_TO_USD_TO_TARGET',
      sourceRateLocalPerUsd: rf, destinationRateLocalPerUsd: rt,
      feeBps, counterpartyRisk: limit.risk,
      quoteSource: 'OMEGA_SIMULATION', quoteTurn: turn(),
      referenceRateDate: bankingState(true).fxMarket && bankingState(true).fxMarket.referenceRateDate || null
    };
  }
  function addHold(profile, key, amountUsd, details) {
    const bank = bankingState(true), id = String(key);
    const book = ensureCountry(profile);
    if (bank.pendingTransfers[id] || bank.pendingTradeSettlements[id])
      return { ok: true, duplicate: true, pending: true, transactionId: id };
    const available = readTreasuryUsd(profile);
    if (available === null || amountUsd > available - heldUsd(profileId(profile), id) + 1e-8)
      return { ok: false, code: 'INSUFFICIENT_UNCOMMITTED_TREASURY' };
    const row = Object.assign({
      transactionId: id, sourceCountryCode: profileId(profile),
      amountUsd: amountUsd, createdTurn: turn(), dueTurn: turn(), status: 'PENDING'
    }, clone(details || {}));
    bank.pendingTransfers[id] = row;
    if (book) book.reservedUsd = heldUsd(profileId(profile));
    return { ok: true, pending: true, row: clone(row) };
  }
  function settleTransfer(input, internal) {
    input = obj(input) ? input : {};
    const key = String(input.idempotencyKey || input.transactionId || '').trim();
    const prior = key ? existingTransaction(key) : null;
    const from = resolveProfile(input.sourceCountryId || input.fromCountryId || input.countryId);
    const to = resolveProfile(input.destinationCountryId || input.toCountryId);
    if (!from || !to) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
    if (prior) {
      const saved = prior.result || prior;
      const samePayload = String(saved.type || '') === 'CROSS_BORDER_TRANSFER'
        && norm(saved.sourceCountryCode) === profileId(from)
        && norm(saved.destinationCountryCode) === profileId(to)
        && (!input.fromCurrencyCode && !input.fromCode || String(saved.fromCurrencyCode || '').toUpperCase() === String(input.fromCurrencyCode || input.fromCode).toUpperCase())
        && (!input.toCurrencyCode && !input.toCode || String(saved.toCurrencyCode || '').toUpperCase() === String(input.toCurrencyCode || input.toCode).toUpperCase())
        && (num(input.amount) === null || Math.abs((num(saved.amount) || 0) - num(input.amount)) < 1e-8);
      if (['SETTLED','PENDING'].includes(String(prior.status || '').toUpperCase()) && !samePayload)
        return { ok: false, code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', transactionId: prior.transactionId };
      if (prior && String(prior.status || '').toUpperCase() === 'SETTLED')
        return { ok: true, duplicate: true, transactionId: prior.transactionId, transaction: clone(prior.result || prior) };
      if (prior && ['CANCELLED','FAILED','COMPENSATED','REVERSED'].includes(String(prior.status || '').toUpperCase()))
        return { ok: false, code: 'IDEMPOTENCY_KEY_FINALIZED', transactionId: prior.transactionId, status: prior.status };
      const pending = bankingState(true).pendingTransfers[key];
      if (pending && turn() < num(pending.dueTurn))
        return { ok: true, pending: true, code: 'PAYMENT_PENDING', dueTurn: pending.dueTurn, transactionId: key };
    }
    const player = playerProfile();
    if (!internal && (!player || profileId(from) !== profileId(player)))
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION', message: 'Transfers can be funded only by the active player country.' };
    if (profileId(from) === profileId(to) && String(input.fromCurrencyCode || input.fromCode) === String(input.toCurrencyCode || input.toCode))
      return { ok: false, code: 'SAME_ACCOUNT_TRANSFER' };
    const delay = num(input.paymentDelayTurns) ?? num(ensurePolicy(from).defaultPaymentDelayTurns) ?? 0;
    if (delay < 0 || delay > Number(rules.maximumTransferDelayTurns || 365) || Math.floor(delay) !== delay)
      return { ok: false, code: 'PAYMENT_DELAY_OUT_OF_RANGE' };
    const quote = quoteTransfer(input);
    if (!quote.ok) return quote;
    const sourceBook = ensureCountry(from), destBook = ensureCountry(to);
    const sourceBalance = num(availableBalance(from, quote.fromCode, key));
    if (sourceBalance === null || sourceBalance + 1e-8 < quote.amount) {
      const sourceUsd = readTreasuryUsd(from);
      return { ok: false, code: 'INSUFFICIENT_CURRENCY_ACCOUNT_BALANCE',
        available: sourceBalance, requested: quote.amount,
        treasuryAvailableUsd: sourceUsd, note: 'Fund this currency account from a conversion or recorded receipt first.' };
    }
    if (delay > 0 && !internal) {
      if (!key) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED_FOR_DELAYED_PAYMENT' };
      const held = addHold(from, key, quote.usdNotional, {
        destinationCountryCode: profileId(to), fromCurrencyCode: quote.fromCode,
        toCurrencyCode: quote.toCode, amount: quote.amount, amountTarget: quote.amountTarget,
        feeUsd: quote.feeUsd, feeBps: quote.feeBps, paymentDelayTurns: delay,
        quoteSource: quote.quoteSource, quoteTurn: quote.quoteTurn, reference: String(input.reference || '').slice(0, 160),
        category: String(input.category || 'INTERNATIONAL_TRANSFER')
      });
      if (!held.ok) return held;
      held.row.dueTurn = turn() + delay;
      held.row.status = 'PENDING';
      bankingState(true).pendingTransfers[key] = held.row;
      bankingState(true).pendingEscrowUsd = (num(bankingState(true).pendingEscrowUsd) || 0) + quote.usdNotional;
      addGlobalLedger({
        transactionId: key, idempotencyKey: key, type: 'CROSS_BORDER_TRANSFER',
        status: 'PENDING', sourceCountryCode: profileId(from), destinationCountryCode: profileId(to),
        fromCurrencyCode: quote.fromCode, toCurrencyCode: quote.toCode,
        amount: quote.amount, amountTarget: quote.amountTarget, amountUsd: quote.usdNotional,
        feeUsd: quote.feeUsd, dueTurn: held.row.dueTurn, paymentDelayTurns: delay,
        reference: String(input.reference || '').slice(0, 160), quoteSource: quote.quoteSource
      });
      return { ok: true, pending: true, code: 'PAYMENT_SCHEDULED', transactionId: key, dueTurn: held.row.dueTurn, quote };
    }
    return settleImmediateTransfer(input, quote, from, to, key, internal);
  }
  function settleImmediateTransfer(input, quote, from, to, key, internal) {
    const bank = bankingState(true), sourceBook = ensureCountry(from), destBook = ensureCountry(to);
    const sourceAcct = ensureAccount(from, quote.fromCode), destAcct = ensureAccount(to, quote.toCode);
    if (!sourceAcct || !destAcct) return { ok: false, code: 'BANK_ACCOUNT_UNAVAILABLE' };
    const sourceAvailable = availableBalance(from, quote.fromCode, input.idempotencyKey || input.transactionId);
    if (sourceAvailable === null || sourceAvailable + 1e-8 < quote.amount)
      return { ok: false, code: 'INSUFFICIENT_CURRENCY_ACCOUNT_BALANCE', available: sourceAvailable };
    const fromOriginal = num(sourceAcct.balance) || 0, toOriginal = num(destAcct.balance) || 0;
    const sourceCash = readTreasuryUsd(from), destCash = readTreasuryUsd(to);
    if (sourceCash === null || destCash === null) return { ok: false, code: 'TREASURY_UNAVAILABLE' };
    const sameCountry = profileId(from) === profileId(to);
    const nextSourceCash = sameCountry ? sourceCash - quote.feeUsd : sourceCash - quote.usdNotional;
    const nextDestCash = sameCountry ? nextSourceCash : destCash + quote.usdNotional - quote.feeUsd;
    if (nextSourceCash < -1e-8) return { ok: false, code: 'INSUFFICIENT_TREASURY' };
    if (key && existingTransaction(key)?.status === 'SETTLED')
      return { ok: true, duplicate: true, transactionId: key };
    sourceAcct.balance = Math.max(0, fromOriginal - quote.amount);
    destAcct.balance = toOriginal + quote.amountTarget;
    sourceAcct.lastUpdatedTurn = destAcct.lastUpdatedTurn = turn();
    sourceAcct.revision = (num(sourceAcct.revision) || 0) + 1;
    destAcct.revision = (num(destAcct.revision) || 0) + 1;
    const sourceW = writeTreasuryUsd(from, nextSourceCash, 'GOVERNMENT_BANKING_TRANSFER');
    if (!sourceW.ok) { sourceAcct.balance = fromOriginal; destAcct.balance = toOriginal; return sourceW; }
    if (!sameCountry) {
      const destW = writeTreasuryUsd(to, nextDestCash, 'GOVERNMENT_BANKING_TRANSFER');
      if (!destW.ok) {
        sourceAcct.balance = fromOriginal; destAcct.balance = toOriginal;
        writeTreasuryUsd(from, sourceCash, 'GOVERNMENT_BANKING_ROLLBACK'); return destW;
      }
    }
    const id = key || nextId('GB-XFER');
    const wasPending = !!bank.pendingTransfers[id];
    const row = addGlobalLedger({
      transactionId: id, idempotencyKey: key || null, type: 'CROSS_BORDER_TRANSFER',
      status: 'SETTLED', sourceCountryCode: profileId(from), sourceCountryName: from.name,
      destinationCountryCode: profileId(to), destinationCountryName: to.name,
      fromCurrencyCode: quote.fromCode, toCurrencyCode: quote.toCode,
      amount: quote.amount, amountTarget: quote.amountTarget,
      amountUsd: quote.usdNotional, feeUsd: quote.feeUsd, feeTarget: quote.feeTarget,
      crossRate: quote.crossRate, settlementRoute: quote.route, quoteSource: quote.quoteSource,
      reference: String(input.reference || '').slice(0, 160), settledTurn: turn(),
      counterpartyRisk: quote.counterpartyRisk, authority: internal ? 'OMEGA_INTERNAL_SETTLEMENT' : 'PLAYER_AUTHORIZED'
    });
    appendAccountLedger(from, {
      transactionId: id, type: 'TRANSFER_DEBIT', direction: 'DEBIT',
      currencyCode: quote.fromCode, amount: quote.amount, amountUsd: quote.usdNotional,
      counterpartyCountryCode: profileId(to), reference: row.reference, category: row.type
    });
    appendAccountLedger(to, {
      transactionId: id, type: 'TRANSFER_CREDIT', direction: 'CREDIT',
      currencyCode: quote.toCode, amount: quote.amountTarget,
      amountUsd: quote.usdNotional - quote.feeUsd, counterpartyCountryCode: profileId(from),
      reference: row.reference, category: row.type
    });
    if (wasPending) {
      const pendingRow = bank.pendingTransfers[id];
      bank.pendingEscrowUsd = Math.max(0, (num(bank.pendingEscrowUsd) || 0) - (num(pendingRow && pendingRow.amountUsd) || quote.usdNotional));
      delete bank.pendingTransfers[id];
    }
    bank.settledVolumeUsd = (num(bank.settledVolumeUsd) || 0) + quote.usdNotional;
    bank.feeRevenueUsd = (num(bank.feeRevenueUsd) || 0) + quote.feeUsd;
    bank.fxClearingHouse.settledVolumeUsd = bank.settledVolumeUsd;
    bank.fxClearingHouse.feeRevenueUsd = bank.feeRevenueUsd;
    bank.fxClearingHouse.transactionCount = (num(bank.fxClearingHouse.transactionCount) || 0) + 1;
    bank.fxClearingHouse.lastSettlement = clone(row);
    sourceBook.lastTreasuryUsd = nextSourceCash; sourceBook.lastReconciliationTurn = turn();
    destBook.lastTreasuryUsd = nextDestCash; destBook.lastReconciliationTurn = turn();
    emitLedgerEvent('OMEGA_GOVERNMENT_BANKING_TRANSFER_SETTLED', {
      transactionId: id, sourceCountryCode: profileId(from), destinationCountryCode: profileId(to),
      fromCurrencyCode: quote.fromCode, toCurrencyCode: quote.toCode,
      amount: quote.amount, amountTarget: quote.amountTarget, amountUsd: quote.usdNotional,
      feeUsd: quote.feeUsd, settledTurn: turn()
    });
    return { ok: true, transactionId: id, transaction: clone(row), quote: quote };
  }

  function convert(input) {
    const player = playerProfile();
    const country = resolveProfile(input && (input.countryId || input.countryCode)) || player;
    if (!player || !country || profileId(country) !== profileId(player))
      return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION' };
    const from = String(input.fromCurrencyCode || input.fromCode || '').toUpperCase();
    const to = String(input.toCurrencyCode || input.toCode || '').toUpperCase();
    if (from === to) return { ok: false, code: 'SAME_CURRENCY_CONVERSION' };
    const result = settleTransfer({
      sourceCountryId: country.iso3 || country.countryCode,
      destinationCountryId: country.iso3 || country.countryCode,
      amount: input.amount, fromCurrencyCode: from, toCurrencyCode: to,
      paymentDelayTurns: 0, idempotencyKey: input.idempotencyKey || nextId('GB-CNV'),
      reference: input.reference || 'FX conversion',
      category: 'CURRENCY_CONVERSION'
    }, true);
    if (result.ok) {
      result.mode = 'SIMULATION';
      const q = result.quote || {};
      result.fromCode = q.fromCode || from;
      result.toCode = q.toCode || to;
      result.amount = num(input.amount);
      result.amountTarget = q.amountTarget;
      result.grossTarget = q.amountGrossTarget;
      result.crossRate = q.crossRate;
      result.feeUsd = q.feeUsd;
      result.feeTarget = q.feeTarget;
      result.usdNotional = q.usdNotional;
      result.route = q.route;
    }
    return result;
  }
  function tradeExposure(country) {
    const bank = bankingState(true), id = profileId(country);
    const entries = (bank.ledger || []).filter(row => row.type === 'TRADE_SETTLEMENT' && row.buyerCountryCode === id);
    return entries.reduce((sum, row) => sum + (num(row.buyerDebitUsd) || 0), 0);
  }
  function prepareTradeSettlement(input) {
    input = obj(input) ? input : {};
    if (input.authorization !== 'OMEGA_GLOBAL_TRADE')
      return { ok: false, code: 'TRADE_AUTHORIZATION_REQUIRED' };
    const buyer = resolveProfile(input.buyerCountryId), seller = resolveProfile(input.sellerCountryId);
    if (!buyer || !seller || profileId(buyer) === profileId(seller)) return { ok: false, code: 'TRADE_COUNTERPARTY_INVALID' };
    const id = String(input.settlementId || '').trim();
    const requestId = String(input.requestId || '').trim();
    if (!id || !requestId) return { ok: false, code: 'TRADE_ID_REQUIRED' };
    const bank = bankingState(true);
    const done = existingTransaction(id);
    if (done && done.status === 'SETTLED') {
      const priorRow = done.result || done;
      const samePayload = String(priorRow.type || '') === 'TRADE_SETTLEMENT'
        && norm(priorRow.buyerCountryCode) === profileId(buyer)
        && norm(priorRow.sellerCountryCode) === profileId(seller)
        && (!input.requestId || !priorRow.requestId || String(priorRow.requestId) === String(requestId))
        && (!input.resourceId || String(priorRow.resourceId || '') === String(input.resourceId))
        && (!input.buyerCurrency || String(priorRow.buyerCurrencyCode || '').toUpperCase() === String(input.buyerCurrency).toUpperCase())
        && (!input.sellerCurrency || String(priorRow.sellerCurrencyCode || '').toUpperCase() === String(input.sellerCurrency).toUpperCase())
        && (num(input.sellerTotal) === null || Math.abs((num(priorRow.sellerTotalLocal) || 0) - num(input.sellerTotal)) < 1e-8);
      if (!samePayload) return { ok: false, code: 'SETTLEMENT_ID_PAYLOAD_MISMATCH', settlementId: id };
      return { ok: true, duplicate: true, settlementId: id, transaction: clone(done.result || done) };
    }
    if (done && ['CANCELLED','FAILED','COMPENSATED','REVERSED'].includes(String(done.status || '').toUpperCase()))
      return { ok: false, code: 'SETTLEMENT_ID_FINALIZED', settlementId: id, status: done.status };
    let pending = bank.pendingTradeSettlements[id];
    const delay = pending ? num(pending.paymentDelayTurns) || 0
      : num(input.paymentDelayTurns) ?? num(ensurePolicy(buyer).defaultPaymentDelayTurns) ?? 0;
    if (delay < 0 || delay > Number(rules.maximumTransferDelayTurns || 365) || Math.floor(delay) !== delay)
      return { ok: false, code: 'PAYMENT_DELAY_OUT_OF_RANGE' };
    const sanctions = ensureNoSanction(buyer, seller, 'TRADE_SETTLEMENT');
    if (!sanctions.allowed) return { ok: false, code: sanctions.reason };
    const buyerCode = String(input.buyerCurrency || currencyCode(buyer) || '').toUpperCase();
    const sellerCode = String(input.sellerCurrency || currencyCode(seller) || '').toUpperCase();
    const rb = rate(buyerCode, 'SIMULATION'), rs = rate(sellerCode, 'SIMULATION');
    if (rb === null || rs === null) return { ok: false, code: 'TRADE_FX_RATE_UNAVAILABLE', buyerCode, sellerCode };
    const sellerLocal = num(input.sellerTotal);
    const providedBuyerLocal = num(input.buyerTotal);
    if (sellerLocal === null || sellerLocal < 0 || providedBuyerLocal === null || providedBuyerLocal < 0)
      return { ok: false, code: 'TRADE_VALUE_INVALID' };
    const sellerUsd = sellerLocal / rs;
    const buyerLocal = sellerLocal * rb / rs;
    const tariffPct = clamp(num(input.importTariffPct) ?? num(ensurePolicy(buyer).importTariffPct) ?? Number(rules.defaultImportTariffPct || 0), 0, Number(rules.maximumImportTariffPct || 80));
    const tariffLocal = buyerLocal * tariffPct / 100;
    const buyerGrossLocal = buyerLocal + tariffLocal;
    const tariffUsd = tariffLocal / rb;
    const buyerDebitUsd = buyerGrossLocal / rb;
    const risk = riskScore(seller);
    const buyerBook = ensureCountry(buyer), sellerBook = ensureCountry(seller);
    const buyerCash = readTreasuryUsd(buyer);
    if (buyerCash === null) return { ok: false, code: 'BUYER_TREASURY_UNAVAILABLE' };
    const freeUsd = buyerCash - heldUsd(profileId(buyer), id);
    if (buyerDebitUsd > freeUsd + 1e-8) return { ok: false, code: 'INSUFFICIENT_TREASURY', availableUsd: Math.max(0, freeUsd), requiredUsd: buyerDebitUsd };
    const buyerPolicy = ensurePolicy(buyer);
    const sellerPolicy = ensurePolicy(seller);
    // Capture any Treasury activity posted by Finance (tax receipts, payroll or other ministries).
    // The account ledger is reconciled before trade snapshots are frozen.
    const buyerReconciliation = reconcileCountry(buyer);
    const sellerReconciliation = reconcileCountry(seller);
    if (!buyerReconciliation.ok) return { ok: false, code: 'BUYER_BANK_RECONCILIATION_FAILED', detail: buyerReconciliation };
    if (!sellerReconciliation.ok) return { ok: false, code: 'SELLER_BANK_RECONCILIATION_FAILED', detail: sellerReconciliation };
    const limits = checkTransferLimits(buyer, seller, sellerUsd);
    if (!limits.ok) {
      // Trade exposure uses the larger of the explicitly configured correspondent limit and the
      // country-specific modelled single-trade allowance. Missing limit input stays a game-rule default.
      if (limits.code !== 'COUNTERPARTY_RISK_LIMIT_EXCEEDED') return limits;
    }
    const maxTradeUsd = (num(currentMacro(buyer).gdpUsd) || 0) * (num(buyerPolicy.maximumTransferPctOfGDP) ?? Number(rules.maximumSingleTransferPctOfGDP || 2)) / 100;
    if (maxTradeUsd > 0 && sellerUsd > maxTradeUsd) return { ok: false, code: 'TRADE_SINGLE_TRANSACTION_LIMIT', maxTradeUsd, sellerUsd };
    const priorEscrowUsd = pending && pending.status === 'PENDING' ? (num(pending.buyerDebitUsd) || 0) : 0;
    const requestRow = pending || {
      settlementId: id, requestId, buyerCountryCode: profileId(buyer), sellerCountryCode: profileId(seller),
      buyerCurrencyCode: buyerCode, sellerCurrencyCode: sellerCode, resourceId: input.resourceId || null,
      sellerTotalLocal: sellerLocal, buyerTotalLocal: buyerLocal,
      buyerDebitLocal: buyerGrossLocal, sellerCreditLocal: sellerLocal,
      buyerDebitUsd: buyerDebitUsd, sellerCreditUsd: sellerUsd, tariffLocal, tariffUsd,
      importTariffPct: tariffPct, counterpartyRisk: risk, amountUsd: sellerUsd,
      buyerTreasuryBeforeUsd: buyerCash, sellerTreasuryBeforeUsd: readTreasuryUsd(seller),
      buyerRateLocalPerUsd: rb, sellerRateLocalPerUsd: rs,
      paymentDelayTurns: delay, dueTurn: turn() + delay,
      createdTurn: turn(), status: delay > 0 ? 'PENDING' : 'READY',
      quoteSource: 'OMEGA_SIMULATION', referenceRateDate: bankingState(true).fxMarket && bankingState(true).fxMarket.referenceRateDate || null,
      quoteTurn: turn()
    };
    bank.pendingTradeSettlements[id] = requestRow;
    if (!pending && delay > 0) {
      bank.pendingEscrowUsd = (num(bank.pendingEscrowUsd) || 0) + buyerDebitUsd;
      buyerBook.reservedUsd = heldUsd(profileId(buyer));
    }
    if (delay > 0 && turn() < num(requestRow.dueTurn)) {
      emitLedgerEvent('OMEGA_GOVERNMENT_BANKING_TRADE_PAYMENT_DELAYED', {
        settlementId: id, requestId, buyerCountryCode: profileId(buyer),
        sellerCountryCode: profileId(seller), amountUsd: buyerDebitUsd, dueTurn: requestRow.dueTurn
      });
      return { ok: false, waiting: true, code: 'PAYMENT_DELAYED', dueTurn: requestRow.dueTurn, settlementId: id };
    }
    if (priorEscrowUsd > 0) bank.pendingEscrowUsd = Math.max(0, (num(bank.pendingEscrowUsd) || 0) - priorEscrowUsd + buyerDebitUsd);
    Object.assign(requestRow, {
      sellerTotalLocal: sellerLocal, buyerTotalLocal: buyerLocal, buyerDebitLocal: buyerGrossLocal,
      sellerCreditLocal: sellerLocal, buyerDebitUsd: buyerDebitUsd, sellerCreditUsd: sellerUsd,
      tariffLocal: tariffLocal, tariffUsd: tariffUsd, importTariffPct: tariffPct,
      counterpartyRisk: risk, buyerTreasuryBeforeUsd: buyerCash,
      sellerTreasuryBeforeUsd: readTreasuryUsd(seller), buyerRateLocalPerUsd: rb,
      sellerRateLocalPerUsd: rs, quoteTurn: turn()
    });
    requestRow.status = 'READY';
    bank.pendingTradeSettlements[id] = requestRow;
    bank.inFlightSettlements[id] = {
      settlementId: id, buyerCountryCode: profileId(buyer), sellerCountryCode: profileId(seller),
      startedTurn: turn(), buyerTreasuryBeforeUsd: buyerCash,
      sellerTreasuryBeforeUsd: readTreasuryUsd(seller), status: 'PREPARED'
    };
    return { ok: true, settlementId: id, buyerCurrency: buyerCode, sellerCurrency: sellerCode,
      buyerTotalLocal: buyerLocal, buyerGrossLocal, sellerTotalLocal: sellerLocal,
      buyerDebitUsd, sellerCreditUsd: sellerUsd, tariffPct, tariffLocal, tariffUsd,
      buyerRateLocalPerUsd: rb, sellerRateLocalPerUsd: rs, counterpartyRisk: risk, paymentDelayTurns: delay,
      quoteSource: requestRow.quoteSource, buyerTreasuryBeforeUsd: requestRow.buyerTreasuryBeforeUsd,
      sellerTreasuryBeforeUsd: requestRow.sellerTreasuryBeforeUsd };
  }
  function commitTradeSettlement(input) {
    input = obj(input) ? input : {};
    const id = String(input.settlementId || '').trim();
    const existing = existingTransaction(id);
    if (existing && existing.status === 'SETTLED')
      return { ok: true, duplicate: true, transactionId: id, transaction: clone(existing.result || existing) };
    const bank = bankingState(true), quote = bank.pendingTradeSettlements[id];
    if (!quote || quote.status !== 'READY') return { ok: false, code: 'TRADE_SETTLEMENT_NOT_PREPARED' };
    const buyer = resolveProfile(quote.buyerCountryCode), seller = resolveProfile(quote.sellerCountryCode);
    if (!buyer || !seller) return { ok: false, code: 'TRADE_COUNTERPARTY_INVALID' };
    const buyerBook = ensureCountry(buyer), sellerBook = ensureCountry(seller);
    const buyerCurrency = quote.buyerCurrencyCode, sellerCurrency = quote.sellerCurrencyCode;
    const buyerGrossLocal = num(quote.buyerDebitLocal), tariffLocal = num(quote.tariffLocal) || 0;
    const sellerLocal = num(quote.sellerCreditLocal), sellerUsd = num(quote.sellerCreditUsd);
    const buyerGrossUsd = num(quote.buyerDebitUsd), tariffUsd = num(quote.tariffUsd) || 0;
    if (buyerGrossLocal === null || sellerLocal === null || sellerUsd === null || buyerGrossUsd === null)
      return { ok: false, code: 'TRADE_SETTLEMENT_QUOTE_CORRUPT' };
    const bAcct = ensureAccount(buyer, USD), bLocal = ensureAccount(buyer, buyerCurrency);
    const sAcct = ensureAccount(seller, sellerCurrency);
    if (!bAcct || !bLocal || !sAcct) return { ok: false, code: 'TRADE_BANK_ACCOUNT_UNAVAILABLE' };
    const bUsdBefore = num(bAcct.balance) || 0, bLocalBefore = num(bLocal.balance) || 0;
    const sLocalBefore = num(sAcct.balance) || 0;
    const buyerSourceCash = readTreasuryUsd(buyer), sellerSourceCash = readTreasuryUsd(seller);
    if (buyerSourceCash === null || sellerSourceCash === null) return { ok: false, code: 'TRADE_TREASURY_UNAVAILABLE' };
    const buyerBeforeUsd = num(quote.buyerTreasuryBeforeUsd), sellerBeforeUsd = num(quote.sellerTreasuryBeforeUsd);
    if (buyerBeforeUsd === null || sellerBeforeUsd === null) return { ok: false, code: 'TRADE_TREASURY_SNAPSHOT_MISSING' };
    const buyerNextUsd = buyerBeforeUsd - sellerUsd;
    const sellerNextUsd = sellerBeforeUsd + sellerUsd;
    if (buyerNextUsd < -1e-8) return { ok: false, code: 'BUYER_TREASURY_NEGATIVE' };
    if (Math.abs(buyerSourceCash - buyerNextUsd) > 0.05 || Math.abs(sellerSourceCash - sellerNextUsd) > 0.05)
      return { ok: false, code: 'TRADE_TREASURY_DELTA_MISMATCH',
        buyerExpectedUsd: buyerNextUsd, buyerActualUsd: buyerSourceCash,
        sellerExpectedUsd: sellerNextUsd, sellerActualUsd: sellerSourceCash };
    const buyerNextLocal = bLocalBefore + tariffLocal;
    const sellerNextLocal = sLocalBefore + sellerLocal;
    const buyerRate = rate(buyerCurrency, 'SIMULATION'), sellerRate = rate(sellerCurrency, 'SIMULATION');
    if (buyerRate === null || sellerRate === null) return { ok: false, code: 'TRADE_FX_RATE_UNAVAILABLE' };
    const buyerPortfolioBeforeUsd = countryBookValueUsd(buyer), sellerPortfolioBeforeUsd = countryBookValueUsd(seller);
    if (buyerPortfolioBeforeUsd === null || sellerPortfolioBeforeUsd === null) return { ok: false, code: 'TRADE_PORTFOLIO_VALUATION_UNAVAILABLE' };
    const buyerAccountsAfterUsd = buyerPortfolioBeforeUsd - buyerGrossUsd + tariffUsd;
    const sellerAccountsAfterUsd = sellerPortfolioBeforeUsd + sellerUsd;
    if (Math.abs(buyerAccountsAfterUsd - buyerNextUsd) > 0.05 || Math.abs(sellerAccountsAfterUsd - sellerNextUsd) > 0.05)
      return { ok: false, code: 'TRADE_CLEARING_BALANCE_MISMATCH',
        buyerBeforeUsd: buyerPortfolioBeforeUsd, buyerAfterUsd: buyerAccountsAfterUsd, buyerTreasuryAfterUsd: buyerNextUsd,
        sellerBeforeUsd: sellerPortfolioBeforeUsd, sellerAfterUsd: sellerAccountsAfterUsd, sellerTreasuryAfterUsd: sellerNextUsd };
    const buyerLocalHasCash = bLocalBefore + 1e-8 >= buyerGrossLocal;
    let buyerPaymentCurrency = USD, buyerPaymentAmount = buyerGrossUsd;
    if (buyerLocalHasCash) {
      buyerPaymentCurrency = buyerCurrency; buyerPaymentAmount = buyerGrossLocal;
      bLocal.balance = Math.max(0, bLocalBefore - buyerGrossLocal + tariffLocal);
      bLocal.revision = (num(bLocal.revision) || 0) + 1; bLocal.lastUpdatedTurn = turn();
    } else {
      if (bUsdBefore + 1e-8 < buyerGrossUsd)
        return { ok: false, code: 'BUYER_USD_CLEARING_LIQUIDITY_INSUFFICIENT', availableUsd: bUsdBefore, requiredUsd: buyerGrossUsd };
      bAcct.balance = Math.max(0, bUsdBefore - buyerGrossUsd);
      bAcct.revision = (num(bAcct.revision) || 0) + 1; bAcct.lastUpdatedTurn = turn();
      bLocal.balance = bLocalBefore + tariffLocal;
      bLocal.revision = (num(bLocal.revision) || 0) + 1; bLocal.lastUpdatedTurn = turn();
    }
    sAcct.balance = sellerNextLocal;
    sAcct.revision = (num(sAcct.revision) || 0) + 1; sAcct.lastUpdatedTurn = turn();
    // Finance's debit/credit handlers own the authoritative USD Treasury cash movement.
    // The sub-ledger therefore records matching values and never re-applies the cash delta here.
    buyerBook.lastTreasuryUsd = buyerNextUsd; sellerBook.lastTreasuryUsd = sellerNextUsd;
    buyerBook.lastReconciliationTurn = sellerBook.lastReconciliationTurn = turn();
    appendAccountMovements(buyer, [
      { type: 'TRADE_PAYMENT', direction: 'DEBIT', currencyCode: buyerPaymentCurrency, amount: buyerPaymentAmount, amountUsd: buyerGrossUsd, counterpartyCountryCode: profileId(seller), category: 'IMPORT_PAYMENT' },
      { type: 'IMPORT_TARIFF_REVENUE', direction: 'CREDIT', currencyCode: buyerCurrency, amount: tariffLocal, amountUsd: tariffUsd, counterpartyCountryCode: profileId(seller), category: 'CUSTOMS_DUTY' }
    ], { transactionId: id, authority: 'OMEGA_GLOBAL_TRADE' });
    appendAccountMovements(seller, [
      { type: 'TRADE_RECEIPT', direction: 'CREDIT', currencyCode: sellerCurrency, amount: sellerLocal, amountUsd: sellerUsd, counterpartyCountryCode: profileId(buyer), category: 'EXPORT_RECEIPT' }
    ], { transactionId: id, authority: 'OMEGA_GLOBAL_TRADE' });
    const row = addGlobalLedger({
      transactionId: id, idempotencyKey: id, type: 'TRADE_SETTLEMENT', status: 'SETTLED',
      buyerCountryCode: profileId(buyer), sellerCountryCode: profileId(seller), resourceId: quote.resourceId,
      sellerTotalLocal: sellerLocal, buyerTotalLocal: quote.buyerTotalLocal, buyerDebitLocal: buyerGrossLocal,
      buyerCurrencyCode: buyerCurrency, sellerCurrencyCode: sellerCurrency,
      buyerDebitUsd: buyerGrossUsd, sellerCreditUsd: sellerUsd, tariffPct: quote.importTariffPct,
      tariffLocal: tariffLocal, tariffUsd: tariffUsd, paymentDelayTurns: quote.paymentDelayTurns,
      dueTurn: quote.dueTurn, settledTurn: turn(), counterpartyRisk: clone(quote.counterpartyRisk),
      requestId: quote.requestId || input.requestId || null,
      batchTransfers: Array.isArray(input.batchTransfers) ? clone(input.batchTransfers) : [],
      createdBatchIds: Array.isArray(input.createdBatchIds) ? clone(input.createdBatchIds) : [],
      sourceBatchIds: Array.isArray(input.sourceBatchIds) ? clone(input.sourceBatchIds) : [],
      quoteSource: quote.quoteSource, referenceRateDate: quote.referenceRateDate, source: 'GOVERNMENT_BANKING'
    });
    bank.settledVolumeUsd = (num(bank.settledVolumeUsd) || 0) + sellerUsd;
    bank.feeRevenueUsd = num(bank.feeRevenueUsd) || 0;
    bank.fxClearingHouse.settledVolumeUsd = bank.settledVolumeUsd;
    bank.fxClearingHouse.feeRevenueUsd = bank.feeRevenueUsd;
    bank.fxClearingHouse.transactionCount = (num(bank.fxClearingHouse.transactionCount) || 0) + 1;
    bank.fxClearingHouse.lastSettlement = clone(row);
    quote.status = 'SETTLED'; quote.settledTurn = turn();
    if (Number(quote.paymentDelayTurns) > 0)
      bank.pendingEscrowUsd = Math.max(0, (num(bank.pendingEscrowUsd) || 0) - (num(quote.buyerDebitUsd) || 0));
    delete bank.pendingTradeSettlements[id];
    delete bank.inFlightSettlements[id];
    emitLedgerEvent('OMEGA_GOVERNMENT_BANKING_TRADE_SETTLED', {
      transactionId: id, buyerCountryCode: profileId(buyer), sellerCountryCode: profileId(seller),
      resourceId: quote.resourceId, sellerTotalLocal: sellerLocal, buyerDebitUsd: buyerGrossUsd,
      tariffUsd: tariffUsd, settledTurn: turn()
    });
    return { ok: true, transactionId: id, transaction: clone(row) };
  }
  function cancelTradeSettlement(settlementId, reason) {
    const bank = bankingState(true), id = String(settlementId || '');
    const row = bank.pendingTradeSettlements[id];
    if (!row) { delete bank.inFlightSettlements[id]; return { ok: true, missing: true }; }
    if (row.status === 'SETTLED') return { ok: false, code: 'TRADE_ALREADY_SETTLED' };
    if (Number(row.paymentDelayTurns) > 0)
      bank.pendingEscrowUsd = Math.max(0, (num(bank.pendingEscrowUsd) || 0) - (num(row.buyerDebitUsd) || 0));
    delete bank.pendingTradeSettlements[id];
    delete bank.inFlightSettlements[id];
    if (row.buyerCountryCode) {
      const book = bank.accountsByCountry[normalizeCountryCode(row.buyerCountryCode)];
      if (book) book.reservedUsd = heldUsd(row.buyerCountryCode);
    }
    addGlobalLedger({ transactionId: id, idempotencyKey: id, type: 'TRADE_SETTLEMENT', status: 'CANCELLED', reason: reason || 'SETTLEMENT_ABORTED', cancelledTurn: turn() });
    return { ok: true, transactionId: id, reason: reason || 'SETTLEMENT_ABORTED' };
  }
  function normalizeCountryCode(v) { return norm(v); }
  function getReservedTreasuryUsd(countryCode, exceptId) { return heldUsd(countryCode, exceptId); }
  function accountSummary(countryValue) {
    const profile = resolveProfile(countryValue) || playerProfile();
    if (!profile) return null;
    const book = ensureCountry(profile);
    const accounts = Object.values(book.accounts || {}).map(a => {
      const r = rate(a.currencyCode, 'SIMULATION');
      return {
        currencyCode: a.currencyCode, currencyName: a.currencyName, balance: num(a.balance) || 0,
        availableBalance: availableBalance(profile, a.currencyCode),
        usdValue: r === null ? null : (num(a.balance) || 0) / r,
        source: a.source, revision: a.revision, lastUpdatedTurn: a.lastUpdatedTurn
      };
    }).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
    return {
      countryCode: profileId(profile), countryName: profile.name, homeCurrencyCode: book.homeCurrencyCode,
      treasuryBalanceUsd: readTreasuryUsd(profile), accountPortfolioUsd: countryBookValueUsd(profile),
      heldTreasuryUsd: heldUsd(profileId(profile)), availableTreasuryUsd: Math.max(0, (readTreasuryUsd(profile) || 0) - heldUsd(profileId(profile))),
      integrity: book.integrity, openingSource: book.openingSource, accounts: accounts,
      ledger: (book.ledger || []).slice(-16).reverse()
    };
  }
  function updateFxReference(metadata) {
    const bank = bankingState(true);
    const md = metadata || {};
    bank.fxMarket = Object.assign({}, bank.fxMarket || {}, {
      provider: md.provider || 'UNKNOWN', referenceRateDate: md.date || md.referenceRateDate || null,
      referenceStatus: md.status || 'UNKNOWN', updatedTurn: turn()
    });
  }
  function reconcileAll(options) {
    const rows = [];
    for (const p of profiles) {
      try {
        const result = reconcileCountry(p, options || {});
        rows.push({ countryCode: profileId(p), ok: !!result.ok, changed: !!result.changed, code: result.code || null, gapUsd: result.gapUsd });
      } catch (error) {
        rows.push({ countryCode: profileId(p), ok: false, code: String(error && error.message || error) });
      }
    }
    return rows;
  }
  function processPendingTransfers() {
    const bank = bankingState(true);
    const rows = Object.values(bank.pendingTransfers || {});
    const out = [];
    for (const row of rows) {
      if (row.status !== 'PENDING' || turn() < (num(row.dueTurn) || 0)) continue;
      const input = {
        sourceCountryId: row.sourceCountryCode, destinationCountryId: row.destinationCountryCode,
        fromCurrencyCode: row.fromCurrencyCode, toCurrencyCode: row.toCurrencyCode,
        amount: row.amount, idempotencyKey: row.transactionId, paymentDelayTurns: 0,
        reference: row.reference, category: row.category
      };
      const result = settleTransfer(input, true);
      if (!result.ok) {
        bank.pendingTransfers[row.transactionId] = row;
        out.push({ transactionId: row.transactionId, ok: false, code: result.code });
      } else out.push({ transactionId: row.transactionId, ok: true });
    }
    return out;
  }
  function setRiskProfile(input) {
    input = obj(input) ? input : {};
    const player = playerProfile(), target = resolveProfile(input.countryId) || player;
    if (!player || !target || profileId(player) !== profileId(target)) return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION' };
    const confidence = num(input.confidenceIndex);
    if (confidence === null || confidence < 0 || confidence > 100) return { ok: false, code: 'CONFIDENCE_INDEX_OUT_OF_RANGE' };
    const bank = bankingState(true);
    bank.riskRegister[profileId(target)] = {
      confidenceIndex: confidence, source: 'PLAYER_MODEL_INPUT',
      updatedTurn: turn(), notes: String(input.notes || '').slice(0, 160)
    };
    emitLedgerEvent('OMEGA_GOVERNMENT_BANKING_RISK_UPDATED', { countryCode: profileId(target), confidenceIndex: confidence });
    return { ok: true, code: 'RISK_PROFILE_UPDATED' };
  }

  function policyUi(panel) {
    const profile = playerProfile(), policy = ensurePolicy(profile);
    const accounts = accountSummary(profile), target = resolveProfile('NGA') || resolveProfile('BDG') || profiles.find(p => profileId(p) !== profileId(profile));
    if (!accounts || !profile) return '';
    const currencyOptions = (selected) => {
      const list = fx && fx.getCurrencies ? fx.getCurrencies() : [];
      return list.slice().sort((a, b) => a.code.localeCompare(b.code)).map(c =>
        '<option value="' + esc(c.code) + '"' + (String(c.code) === String(selected) ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name) + '</option>'
      ).join('');
    };
    const countryOptions = (selected) => profiles.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p =>
      '<option value="' + esc(profileId(p)) + '"' + (profileId(p) === profileId(selected || {}) ? ' selected' : '') + '>' + esc(p.name + ' (' + profileId(p) + ')') + '</option>'
    ).join('');
    return '<section class="ofx-section" data-gbank-panel>' +
      '<div class="ofx-heading"><div><h4>Government Banking · Account &amp; Payment Rail</h4><p>Each country balance is a USD-valued portfolio of currency accounts. Treasury remains denominated in USD; cross-border payments settle through USD and use explicit rates, limits and audit entries.</p></div></div>' +
      '<div class="ofx-kpis">' +
      '<article><span>Player Treasury</span><strong>' + esc(money(accounts.treasuryBalanceUsd)) + '</strong><small>' + esc(accounts.integrity) + ' · holds ' + esc(money(accounts.heldTreasuryUsd)) + '</small></article>' +
      '<article><span>Portfolio valuation</span><strong>' + esc(money(accounts.accountPortfolioUsd)) + '</strong><small>Valued using OMEGA simulation FX rates</small></article>' +
      '<article><span>Home currency</span><strong>' + esc(policy.homeCurrencyCode || accounts.homeCurrencyCode || 'N/A') + '</strong><small>Secondary accounts start unfunded</small></article>' +
      '<article><span>Clearing fees</span><strong>' + esc(money(bankingState(true).feeRevenueUsd)) + '</strong><small>Modeled revenue · USD</small></article></div>' +
      '<section class="ofx-section"><h4>Multi-currency settlement</h4>' +
      '<form class="ofx-form" data-gbank-action="transfer">' +
      '<label>Destination country<select name="destinationCountryId">' + countryOptions(target) + '</select></label>' +
      '<label>Send amount<input name="amount" type="number" min="0.000001" step="any" value="1000" required></label>' +
      '<label>Source currency<select name="fromCurrencyCode">' + currencyOptions(accounts.homeCurrencyCode) + '</select></label>' +
      '<label>Destination currency<select name="toCurrencyCode">' + currencyOptions(target ? currencyCode(target) : 'USD') + '</select></label>' +
      '<label>Payment delay (turns)<input name="paymentDelayTurns" type="number" min="0" max="' + Number(rules.maximumTransferDelayTurns || 365) + '" step="1" value="' + esc(String(policy.defaultPaymentDelayTurns || 0)) + '" required></label>' +
      '<label>Idempotency / payment reference<input name="idempotencyKey" type="text" maxlength="96" placeholder="Optional stable payment key"></label>' +
      '<label>Purpose<input name="reference" type="text" maxlength="160" placeholder="Government import / transfer" required></label>' +
      '<button type="submit">Submit bank transfer</button></form>' +
      '<div class="ofx-result" data-gbank-transfer-result role="status">Currency accounts are not automatically filled with invented local-currency cash. Convert from the funded USD account first.</div></section>' +
      '<section class="ofx-section"><h4>Player country banking &amp; trade controls</h4>' +
      '<form class="ofx-form" data-gbank-action="policy">' +
      '<label>Import tariff (%)<input name="importTariffPct" type="number" min="0" max="' + Number(rules.maximumImportTariffPct || 80) + '" step="0.1" value="' + esc(String(policy.importTariffPct)) + '" required></label>' +
      '<label>Default payment delay (turns)<input name="defaultPaymentDelayTurns" type="number" min="0" max="' + Number(rules.maximumTransferDelayTurns || 365) + '" step="1" value="' + esc(String(policy.defaultPaymentDelayTurns)) + '" required></label>' +
      '<label>Correspondent limit (USD)<input name="correspondentLimitUsd" type="number" min="1" step="any" value="' + esc(String(policy.correspondentLimitUsd)) + '" required></label>' +
      '<label>Daily transfer limit (USD)<input name="dailyTransferLimitUsd" type="number" min="1" step="any" value="' + esc(String(policy.dailyTransferLimitUsd)) + '" required></label>' +
      '<label>Counterparty-risk tolerance (0–100)<input name="counterpartyRiskTolerancePct" type="number" min="0" max="100" step="1" value="' + esc(String(policy.counterpartyRiskTolerancePct)) + '" required></label>' +
      '<button type="submit">Save banking policy</button></form>' +
      '<div class="ofx-result" data-gbank-policy-result role="status">War, sanctions, foreign-exchange availability, counterparty risk and correspondent limits are checked before settlement.</div></section>' +
      '<section class="ofx-section"><h4>Currency accounts</h4><div class="ofx-table-scroll"><table class="ofx-table"><thead><tr><th>Currency</th><th>Account balance</th><th>Available</th><th>USD value</th><th>Account source</th><th>Updated turn</th></tr></thead><tbody data-gbank-account-rows>' +
      accounts.accounts.map(a => '<tr><td>' + esc(a.currencyCode + ' · ' + a.currencyName) + '</td><td>' + esc(qty(a.balance, 4)) + '</td><td>' + esc(qty(a.availableBalance, 4)) + '</td><td>' + esc(money(a.usdValue)) + '</td><td>' + esc(a.source || 'UNKNOWN') + '</td><td>' + esc(a.lastUpdatedTurn) + '</td></tr>').join('') +
      '</tbody></table></div></section>' +
      '<section class="ofx-section"><h4>Recent Government Banking ledger</h4><div class="ofx-table-scroll"><table class="ofx-table"><thead><tr><th>Turn</th><th>Transaction</th><th>From → To</th><th>Amount</th><th>USD notional</th><th>Fee / tariff</th><th>Status</th></tr></thead><tbody data-gbank-ledger-rows>' +
      renderLedgerRows(12) + '</tbody></table></div></section>' +
      '<p class="ofx-note">Source accounts are funded from the existing Finance Treasury USD mirror, not from guessed national income. FX conversions move value among sub-accounts and charge the configured clearing fee. Delayed payments hold funds and settle on a future simulation turn. This is game banking, not real-money transfer.</p></section>';
  }
  function renderLedgerRows(maximum) {
    const bank = bankingState(true);
    return (bank.ledger || []).slice(-(maximum || 12)).reverse().map(row => {
      const from = row.sourceCountryCode || row.buyerCountryCode || '—';
      const to = row.destinationCountryCode || row.sellerCountryCode || '—';
      return '<tr><td>' + esc(row.turn) + '</td><td>' + esc(row.type || '') + '</td><td>' + esc(from + ' → ' + to) + '</td>' +
        '<td>' + esc(qty(row.amount, 3) + ' ' + (row.fromCurrencyCode || row.currencyCode || '')) + '</td>' +
        '<td>' + esc(money(row.amountUsd ?? row.buyerDebitUsd ?? row.sellerCreditUsd)) + '</td>' +
        '<td>' + esc(money(row.feeUsd ?? row.tariffUsd)) + '</td><td>' + esc(row.status || 'POSTED') + '</td></tr>';
    }).join('') || '<tr><td colspan="7">No Government Banking transactions.</td></tr>';
  }
  function renderPanel() {
    if (!g.document || !initialized) return false;
    const content = g.document.getElementById('ministry-dashboard-content');
    const fxPanel = content && content.querySelector('[data-ofx-panel]');
    const host = fxPanel && fxPanel.querySelector('[data-gbank-panel]');
    if (!fxPanel || host) return false;
    fxPanel.insertAdjacentHTML('beforeend', policyUi(fxPanel));
    bindPanelEvents();
    return true;
  }
  function queueRender() {
    if (panelQueued) return;
    panelQueued = true;
    const run = function () { panelQueued = false; renderPanel(); };
    if (typeof g.requestAnimationFrame === 'function') g.requestAnimationFrame(run);
    else if (typeof g.setTimeout === 'function') g.setTimeout(run, 0);
    else run();
  }
  function bindPanelEvents() {
    if (!g.document || g.document.__omegaGovernmentBankingBound) return;
    g.document.__omegaGovernmentBankingBound = true;
    g.document.addEventListener('submit', function (event) {
      const form = event.target;
      const action = form && form.getAttribute && form.getAttribute('data-gbank-action');
      if (!action) return;
      event.preventDefault();
      const panel = g.document.getElementById('ministry-dashboard-content')?.querySelector('[data-gbank-panel]');
      const data = {};
      Array.from(form.elements || []).forEach(el => { if (el && el.name) data[el.name] = el.value; });
      if (action === 'transfer') {
        data.amount = num(data.amount); data.paymentDelayTurns = num(data.paymentDelayTurns);
        const result = settleTransfer(data, false);
        const output = panel && panel.querySelector('[data-gbank-transfer-result]');
        if (output) {
          output.textContent = result && result.ok
            ? (result.pending ? 'Payment scheduled for turn ' + result.dueTurn + '. Funds are held and cannot be spent twice.'
              : 'Payment settled. Transaction ' + result.transactionId + ' was recorded with an auditable FX quote.')
            : 'Payment rejected: ' + String(result && result.code || 'UNKNOWN_ERROR');
          output.classList.toggle('is-error', !result || result.ok !== true);
          output.classList.toggle('is-ok', !!result && result.ok === true);
        }
      } else if (action === 'policy') {
        ['importTariffPct','defaultPaymentDelayTurns','correspondentLimitUsd','dailyTransferLimitUsd','counterpartyRiskTolerancePct'].forEach(k => { data[k] = num(data[k]); });
        const result = updateTradePolicy({ ...data, countryId: profileId(playerProfile()) });
        const output = panel && panel.querySelector('[data-gbank-policy-result]');
        if (output) {
          output.textContent = result && result.ok ? result.message : 'Policy rejected: ' + String(result && result.code || 'UNKNOWN_ERROR');
          output.classList.toggle('is-error', !result || result.ok !== true);
          output.classList.toggle('is-ok', !!result && result.ok === true);
        }
      }
      refreshPanel();
    });
    g.document.addEventListener('change', function (event) {
      const el = event.target;
      if (el && el.matches && el.matches('[data-gbank-action="transfer"] select[name="destinationCountryId"]')) {
        const target = resolveProfile(el.value);
        const to = g.document.querySelector('[data-gbank-action="transfer"] select[name="toCurrencyCode"]');
        if (target && to) to.value = currencyCode(target) || USD;
      }
    });
  }
  function refreshPanel() {
    const content = g.document && g.document.getElementById('ministry-dashboard-content');
    const panel = content && content.querySelector('[data-gbank-panel]');
    if (!panel) return;
    const summary = accountSummary(playerProfile());
    const rows = panel.querySelector('[data-gbank-account-rows]');
    if (summary && rows) rows.innerHTML = summary.accounts.map(a =>
      '<tr><td>' + esc(a.currencyCode + ' · ' + a.currencyName) + '</td><td>' + esc(qty(a.balance, 4)) + '</td>' +
      '<td>' + esc(qty(a.availableBalance, 4)) + '</td><td>' + esc(money(a.usdValue)) + '</td>' +
      '<td>' + esc(a.source || 'UNKNOWN') + '</td><td>' + esc(a.lastUpdatedTurn) + '</td></tr>'
    ).join('');
    const ledger = panel.querySelector('[data-gbank-ledger-rows]');
    if (ledger) ledger.innerHTML = renderLedgerRows(12);
  }
  function installObserver() {
    if (!g.document || panelObserver || typeof g.MutationObserver !== 'function') return;
    const content = g.document.getElementById('ministry-dashboard-content');
    if (!content) return;
    panelObserver = new g.MutationObserver(function () {
      const now = g.document.getElementById('ministry-dashboard-content');
      if (now && now.querySelector('[data-ofx-panel]') && !now.querySelector('[data-gbank-panel]')) queueRender();
    });
    panelObserver.observe(content, { childList: true, subtree: true });
  }
  function revalueOrReconcileAll() {
    const results = [];
    for (const p of profiles) {
      try {
        if (!obj(bankingState(false).accountsByCountry[profileId(p)])) continue;
        // A Finance cash delta outside Government Banking (payroll, spending, new receipts)
        // is preserved and explicitly reconciled into the USD clearing sub-account.
        results.push({ countryCode: profileId(p), result: reconcileCountry(p) });
      } catch (error) { results.push({ countryCode: profileId(p), error: String(error && error.message || error) }); }
    }
    return results;
  }
  function diagnostics() {
    const bank = bankingState(true);
    const accounts = Object.values(bank.accountsByCountry || {});
    const pending = Object.values(bank.pendingTransfers || {}).filter(x => x.status === 'PENDING').length
      + Object.values(bank.pendingTradeSettlements || {}).filter(x => x.status === 'PENDING').length;
    const ids = Object.keys(bank.idempotency || {});
    return {
      version: VERSION, initialized, profileCount: profiles.length,
      countryAccountBooks: accounts.length,
      currencyAccountCount: accounts.reduce((sum, b) => sum + Object.keys(b.accounts || {}).length, 0),
      pendingPayments: pending, idempotencyKeys: ids.length,
      settledTransactions: (bank.ledger || []).filter(x => x.status === 'SETTLED').length,
      ledgerCount: (bank.ledger || []).length, heldEscrowUsd: num(bank.pendingEscrowUsd) || 0,
      fxReferenceRateDate: bank.fxMarket && bank.fxMarket.referenceRateDate || null,
      playerCountryCode: playerProfile() && profileId(playerProfile()),
      clearingBaseCurrency: USD,
      tradeSettlementIntegration: typeof api.prepareTradeSettlement === 'function',
      currentTurn: turn(),
      lastReconciliationErrors: clone((bank.diagnostics && bank.diagnostics.reconciliationErrors) || []).slice(-8)
    };
  }
  async function init() {
    if (initialized) { installObserver(); queueRender(); return diagnostics(); }
    if (initPromise) return initPromise;
    initPromise = (async function () {
      finance = g.OmegaFinanceMinistry || g.Omega && g.Omega.FinanceMinistry || null;
      fx = g.OmegaForexMonetaryEngine || null;
      if (!finance || typeof finance.getProfiles !== 'function') throw new Error('FINANCE_RUNTIME_NOT_READY');
      if (!fx || typeof fx.getRate !== 'function') throw new Error('FX_RUNTIME_NOT_READY');
      if (typeof finance.init === 'function') await finance.init();
      if (typeof fx.init === 'function') await fx.init();
      profiles = finance.getProfiles() || [];
      if (!Array.isArray(profiles) || !profiles.length) throw new Error('ECONOMIC_PROFILE_REGISTRY_EMPTY');
      byId = new Map();
      profiles.forEach(p => [p.name, p.iso3, p.countryCode, p.iso2, p.economyKey].filter(Boolean).forEach(k => byId.set(norm(k), p)));
      const fetcher = typeof g.fetchResilient === 'function'
        ? g.fetchResilient : (url => g.fetch(url + '?v=' + encodeURIComponent(VERSION)).then(res => {
          if (!res || res.ok === false) throw new Error('BANK_RULES_FETCH_FAILED');
          return res.json();
        }));
      try {
        const loaded = await fetcher('government_banking_rules_v1.json');
        if (obj(loaded)) rules = Object.assign({}, DEFAULT_RULES, loaded);
      } catch (_) {}
      const bank = bankingState(true);
      bank.provider = 'OMEGA_SIMULATION_CLEARING';
      bank.initializedTurn = turn();
      bank.referenceDataPolicy = 'OFFICIAL_REFERENCE_RATES_ARE_QUOTES_ONLY';
      profiles.forEach(p => {
        // Create only identities/empty account catalogues at boot; existing Treasury balances
        // are seeded lazily as USD at first use so boot does not build 249 heavy dashboards.
        ensurePolicy(p);
      });
      initialized = true;
      g.Omega = g.Omega || {};
      g.Omega.GovernmentBanking = api;
      g.OmegaGovernmentBanking = api;
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED', function () {
        processPendingTransfers();
        revalueOrReconcileAll();
        refreshPanel();
      });
      g.addEventListener?.('OMEGA_FX_MARKET_UPDATED', function (event) {
        const d = event && event.detail || {};
        updateFxReference({ provider: 'FRANKFURTER_V2', date: d.referenceRateDate, status: 'SIMULATION_MARKET_UPDATED' });
        refreshPanel();
      });
      g.addEventListener?.('OMEGA_FINANCE_STATE_UPDATED', function () { revalueOrReconcileAll(); refreshPanel(); });
      g.addEventListener?.('OMEGA_FINANCE_RUNTIME_READY', function () { init().catch(() => {}); });
      g.addEventListener?.('OMEGA_READY', function () { init().catch(() => {}); });
      installObserver(); queueRender();
      dispatch('OMEGA_GOVERNMENT_BANKING_READY', diagnostics());
      return diagnostics();
    })();
    try { return await initPromise; } finally { if (!initialized) initPromise = null; }
  }
  const api = {
    VERSION, init, diagnostics, accountSummary, resolveCountry: resolveProfile,
    getTransaction: transactionId => existingTransaction(transactionId),
    quoteTransfer, transfer: (input) => settleTransfer(input, false), convert,
    updateTradePolicy, setRiskProfile, riskScore,
    prepareTradeSettlement, commitTradeSettlement, cancelTradeSettlement,
    getReservedTreasuryUsd, reconcile: reconcileAll, processPendingTransfers,
    getCountryAccount: countryValue => accountSummary(countryValue),
    getCountryPolicy: countryValue => {
      const p = resolveProfile(countryValue);
      return p ? policySnapshot(p) : null;
    },
    getState: () => clone(bankingState(true)),
    getCountryBalances: countryValue => {
      const p = resolveProfile(countryValue);
      return p ? accountSummary(p) : null;
    },
    getRiskReport: countryValue => {
      const p = resolveProfile(countryValue);
      return p ? riskScore(p) : null;
    }
  };
  g.Omega = g.Omega || {};
  g.Omega.GovernmentBanking = api;
  g.OmegaGovernmentBanking = api;
  if (g.document) {
    g.addEventListener?.('load', function () { init().catch(error => console.error('[OMEGA GOVERNMENT BANKING INIT]', error)); }, { once: true });
    if (g.document.readyState === 'complete' || g.document.readyState === 'interactive')
      Promise.resolve().then(() => init().catch(error => console.error('[OMEGA GOVERNMENT BANKING INIT]', error)));
    else g.document.addEventListener?.('DOMContentLoaded', function () { init().catch(error => console.error('[OMEGA GOVERNMENT BANKING INIT]', error)); }, { once: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
