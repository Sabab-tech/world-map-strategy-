/* OMEGA SOVEREIGN INVESTMENT & INTERNATIONAL DEVELOPMENT RUNTIME v1.0.0
 * Government-to-government and domestic public investment.
 *
 * Finance.available remains the sovereign cash authority. Restricted project funds,
 * investment positions, foreign debt and project-linked return evidence are recorded
 * under Finance.omegaFinance.governmentInvestmentV1 through Finance-owned commands.
 * No private-company wallet is used and no production, jobs, profit or payback is fabricated.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  var AUTHORITY = 'OMEGA_GOVERNMENT_SOVEREIGN_INVESTMENT_V1';
  var INTERVAL_TURNS = 30;
  var NPC_INVESTORS_PER_CYCLE = 4;
  var NPC_HOSTS_PER_CYCLE = 3;
  var MAX_PROPOSALS = 2048;
  var MAX_LEDGER = 4096;
  var HANDLERS = {
    create: 'OMEGA_GOV_INVEST_CREATE_PROPOSAL_V1',
    decide: 'OMEGA_GOV_INVEST_DECIDE_PROPOSAL_V1',
    reserve: 'OMEGA_GOV_INVEST_TREASURY_RESERVE_V1',
    receive: 'OMEGA_GOV_INVEST_HOST_RECEIPT_V1',
    settle: 'OMEGA_GOV_INVEST_INVESTOR_SETTLE_V1',
    confirm: 'OMEGA_GOV_INVEST_HOST_CONFIRM_V1',
    refundReceipt: 'OMEGA_GOV_INVEST_HOST_REFUND_V1',
    refundCash: 'OMEGA_GOV_INVEST_INVESTOR_REFUND_V1',
    releaseMine: 'OMEGA_GOV_INVEST_MINE_RELEASE_V1',
    commitCapex: 'OMEGA_GOV_INVEST_PROJECT_CAPEX_V1',
    rollbackCapex: 'OMEGA_GOV_INVEST_PROJECT_CAPEX_ROLLBACK_V1',
    recapitalize: 'OMEGA_GOV_INVEST_EXISTING_PROJECT_RECAPITALIZE_V1',
    loanDebit: 'OMEGA_GOV_INVEST_LOAN_REPAYMENT_DEBIT_V1',
    loanCredit: 'OMEGA_GOV_INVEST_LOAN_REPAYMENT_CREDIT_V1',
    profitDebit: 'OMEGA_GOV_INVEST_PROFIT_DISTRIBUTION_DEBIT_V1',
    profitCredit: 'OMEGA_GOV_INVEST_PROFIT_DISTRIBUTION_CREDIT_V1',
    updateProposal: 'OMEGA_GOV_INVEST_UPDATE_PROPOSAL_V1', rollbackMine: 'OMEGA_GOV_INVEST_MINE_RELEASE_ROLLBACK_V1',
    linkProject: 'OMEGA_GOV_INVEST_LINK_PROJECT_V1', registerLoan: 'OMEGA_GOV_INVEST_REGISTER_LOAN_V1', updateLoan: 'OMEGA_GOV_INVEST_UPDATE_LOAN_V1'
  };

  var ready = false;
  var registered = false;
  var initPromise = null;
  var lastError = null;
  var npcCycleCount = 0;
  var npcProposalCount = 0;
  var lastNpcCycleTurn = null;
  var pendingTransfers = new Set();

  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) {
    if (v === null || v === undefined) return v;
    return JSON.parse(JSON.stringify(v));
  }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function round(v, places) {
    var factor = Math.pow(10, places == null ? 2 : places);
    return Math.round((Number(v) + Number.EPSILON) * factor) / factor;
  }
  function code(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function id(v) { return String(v == null ? '' : v).trim(); }
  function validIso3(v) { return /^[A-Z]{3}$/.test(code(v)); }
  function state() { return g.Game && g.Game.state || g.gameState || {}; }
  function turn() {
    var s = state();
    return num(s.simulation && s.simulation.turn) !== null ? num(s.simulation.turn) :
      num(s.turn) !== null ? num(s.turn) : num(s.simulationTurn) || 0;
  }
  function playerCountry() {
    var simulation = g.Omega && g.Omega.Simulation;
    var value = simulation && typeof simulation.getPlayerCountryId === 'function'
      ? simulation.getPlayerCountryId() : null;
    value = value || g.Game && g.Game.playerCountry || g.currentActiveCountry ||
      state().simulation && state().simulation.session && state().simulation.session.playerCountryId;
    return canonicalCountry(value);
  }
  function canonicalCountry(value) {
    var raw = code(value);
    if (!raw) return null;
    if (validIso3(raw)) return raw;
    var runtime = g.OmegaCountryRuntimeData;
    try {
      var profile = runtime && typeof runtime.getProfile === 'function' ? runtime.getProfile(raw) : null;
      var iso = code(profile && (profile.iso3 || profile.countryCode));
      if (validIso3(iso)) return iso;
    } catch (_) {}
    var finance = g.OmegaFinanceMinistry || g.Omega && g.Omega.FinanceMinistry;
    try {
      var resolved = finance && typeof finance.resolveCountry === 'function' ? finance.resolveCountry(raw) : null;
      var iso2 = code(resolved && (resolved.iso3 || resolved.countryCode));
      if (validIso3(iso2)) return iso2;
    } catch (_) {}
    return null;
  }
  function dependencies() {
    return {
      finance: g.OmegaFinanceMinistry || g.Omega && g.Omega.FinanceMinistry || null,
      forex: g.OmegaForexMonetaryEngine || g.Omega && g.Omega.ForexMonetaryEngine || null,
      countries: g.OmegaCountryRuntimeData || null,
      interop: g.OmegaMinistryInteroperability || g.Omega && g.Omega.MinistryInteroperability || null,
      network: g.OmegaResourceIndustrialNetwork || g.Omega && g.Omega.ResourceIndustrialNetwork || null,
      state: state()
    };
  }
  function financeBucket(root, country) {
    var finance = root && root.finance || {};
    if (finance[country] && isObject(finance[country])) return finance[country];
    var keys = Object.keys(finance);
    for (var i = 0; i < keys.length; i++) if (canonicalCountry(keys[i]) === country) return finance[keys[i]];
    return null;
  }
  function countryFinanceRoot(country) {
    var bucket = financeBucket(state(), country);
    return bucket && isObject(bucket.omegaFinance) ? bucket.omegaFinance : null;
  }
  function investmentRoot(financeRoot, create) {
    if (!isObject(financeRoot.governmentInvestmentV1) && create) {
      financeRoot.governmentInvestmentV1 = {
        schemaVersion: 1,
        restrictedFundsUsd: 0,
        outboundEscrowUsd: 0,
        investedCapitalUsd: 0,
        outboundInvestedCapitalUsd: 0,
        capitalizedProjectCapitalUsd: 0,
        receivedCapitalUsd: 0,
        proposals: [],
        transfers: {},
        receipts: {},
        investments: [],
        loans: [],
        distributions: [],
        events: [],
        revision: 0
      };
    }
    return isObject(financeRoot.governmentInvestmentV1) ? financeRoot.governmentInvestmentV1 : null;
  }
  function currencyFor(country, deps) {
    deps = deps || dependencies();
    var profile = null;
    try {
      if (deps.countries && typeof deps.countries.getProfile === 'function') profile = deps.countries.getProfile(country);
      if (!profile && deps.finance && typeof deps.finance.resolveCountry === 'function') profile = deps.finance.resolveCountry(country);
    } catch (_) {}
    if (!profile) return { status: 'UNAVAILABLE', countryId: country, reason: 'COUNTRY_CURRENCY_PROFILE_UNAVAILABLE' };
    var currency = null, rate = null;
    try {
      currency = code(deps.forex && typeof deps.forex.getCurrencyCode === 'function'
        ? deps.forex.getCurrencyCode(profile) : profile.currencyCode || profile.currency);
      rate = num(deps.forex && typeof deps.forex.getRate === 'function' ? deps.forex.getRate(currency) : null);
    } catch (_) {}
    if (!/^[A-Z]{3}$/.test(currency) || rate === null || rate <= 0)
      return { status: 'UNAVAILABLE', countryId: country, currencyCode: currency || null, reason: 'CURRENT_FX_RATE_UNAVAILABLE' };
    return { status: 'READY', countryId: country, currencyCode: currency, localPerUsd: rate, authority: 'OMEGA_FOREX_MONETARY_ENGINE' };
  }
  function budgetFor(country, deps) {
    deps = deps || dependencies();
    var bucket = financeBucket(deps.state, country);
    var cash = num(bucket && bucket.available);
    var fm = null;
    try { fm = deps.finance && typeof deps.finance.getFinanceState === 'function' ? deps.finance.getFinanceState(country) : null; } catch (_) {}
    if (cash === null) cash = num(fm && fm.treasuryBalanceUsd);
    if (cash === null || cash < 0) return { status: 'UNAVAILABLE', countryId: country, treasuryCashUsd: cash, availableInvestmentBudgetUsd: 0, reason: 'SOVEREIGN_TREASURY_BALANCE_UNAVAILABLE' };
    var annualSpending = num(fm && fm.fiscalModel && fm.fiscalModel.annualSpendingUsd);
    var reservePct = num(fm && fm.policy && fm.policy.minimumReservePctOfAnnualSpending);
    var dueDebt = num(fm && (fm.debtServiceDueUsd || fm.mandatoryDebtServiceDueUsd ||
      fm.fiscalModel && (fm.fiscalModel.debtServiceDueUsd || fm.fiscalModel.mandatoryDebtServiceDueUsd))) || 0;
    var reserve = annualSpending !== null && annualSpending > 0
      ? annualSpending * Math.max(0, Math.min(60, reservePct === null ? 10 : reservePct)) / 100
      : cash * 0.10;
    var policyStatus = annualSpending !== null && annualSpending > 0 ? 'FINANCE_RESERVE_POLICY' : 'CONSERVATIVE_10_PERCENT_CASH_BUFFER';
    var free = Math.max(0, round(cash - reserve - dueDebt, 2));
    var maxPerProject = round(free * 0.35, 2);
    return {
      status: 'READY',
      countryId: country,
      currencyCode: currencyFor(country, deps).currencyCode || 'USD',
      treasuryCashUsd: round(cash, 2),
      protectedReserveUsd: round(reserve, 2),
      mandatoryDebtServiceDueUsd: round(dueDebt, 2),
      availableInvestmentBudgetUsd: free,
      maximumPerProjectUsd: maxPerProject,
      concentrationLimitPct: 35,
      policyStatus: policyStatus,
      authority: 'FINANCE_MINISTRY_TREASURY_AND_RESERVE_POLICY'
    };
  }
  function appendLedger(root, row) {
    root.ledger = Array.isArray(root.ledger) ? root.ledger : [];
    if (root.ledger.some(function (x) { return x && String(x.transactionId || '') === String(row.transactionId || ''); })) return false;
    var entry = Object.assign({ turn: turn(), currency: 'USD', status: 'POSTED' }, row);
    if (!entry.transactionId) return false;
    var amountMinor = Math.round(Math.abs(Number(entry.amountUsd || 0)) * 100);
    if (amountMinor > 0 && Number.isSafeInteger(amountMinor)) {
      var debit = String(entry.debitAccount || 'GOVERNMENT:UNCLASSIFIED_DEBIT');
      var credit = String(entry.creditAccount || 'GOVERNMENT:UNCLASSIFIED_CREDIT');
      entry.sectorJournalV1 = {
        schemaVersion: 1,
        status: 'POSTED',
        sectorId: 'government',
        sourceAuthority: AUTHORITY,
        sourceTransactionId: entry.transactionId,
        sourceTransactionType: entry.action || entry.type,
        correlationId: entry.correlationId || entry.transactionId,
        countryId: entry.countryId || null,
        countryCode: entry.countryCode || null,
        currency: 'USD',
        turn: entry.turn,
        accountingBasis: 'RECORDED_SOVEREIGN_INVESTMENT_TRANSACTION',
        provenance: AUTHORITY,
        counterEntryComplete: true,
        debitTotalMinor: amountMinor,
        creditTotalMinor: amountMinor,
        lines: [
          { lineId: entry.transactionId + ':D', lineNumber: 1, accountId: debit, side: 'DEBIT', amountMinor: amountMinor, amountUsd: amountMinor / 100, currency: 'USD', sourceTransactionId: entry.transactionId, turn: entry.turn },
          { lineId: entry.transactionId + ':C', lineNumber: 2, accountId: credit, side: 'CREDIT', amountMinor: amountMinor, amountUsd: amountMinor / 100, currency: 'USD', sourceTransactionId: entry.transactionId, turn: entry.turn }
        ]
      };
    }
    root.ledger.push(entry);
    if (root.ledger.length > MAX_LEDGER) root.ledger.splice(0, root.ledger.length - MAX_LEDGER);
    return true;
  }
  function recordEvent(inv, type, data) {
    inv.events = Array.isArray(inv.events) ? inv.events : [];
    inv.events.push({ eventId: type + ':' + String(data && (data.proposalId || data.transferId || data.projectId) || '') + ':' + turn(),
      type: type, turn: turn(), data: clone(data || {}) });
    if (inv.events.length > MAX_LEDGER) inv.events.splice(0, inv.events.length - MAX_LEDGER);
    inv.revision = (num(inv.revision) || 0) + 1;
  }
  function getPath(ctx, path) {
    try { return ctx && ctx.stateTransaction && ctx.stateTransaction.get(path); } catch (_) { return undefined; }
  }
  function setPath(ctx, path, value) {
    try { return ctx && ctx.stateTransaction && ctx.stateTransaction.set(path, value); } catch (_) { return false; }
  }
  function rootForContext(ctx) {
    var root = getPath(ctx, 'finance.omegaFinance');
    return isObject(root) ? clone(root) : {};
  }
  function saveContext(ctx, root, cash) {
    if (cash !== undefined) {
      cash = round(cash, 2);
      setPath(ctx, 'finance.available', cash);
      root.treasuryBalanceUsd = cash;
      root.lastSyncedTreasuryBalanceUsd = cash;
    }
    setPath(ctx, 'finance.omegaFinance', root);
    return true;
  }
  function result(status, fields) { return Object.assign({ status: status }, fields || {}); }
  function handlerResult(ok, fields) { return Object.assign({ accepted: ok === true }, fields || {}); }
  function sameFingerprint(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }
  function pushUnique(rows, row, key) {
    rows = Array.isArray(rows) ? rows : [];
    var existing = rows.find(function (x) { return x && String(x[key] || '') === String(row[key] || ''); });
    if (existing) return { rows: rows, duplicate: sameFingerprint(existing, row), collision: !sameFingerprint(existing, row), existing: existing };
    rows.push(row);
    if (rows.length > MAX_PROPOSALS) rows.splice(0, rows.length - MAX_PROPOSALS);
    return { rows: rows, duplicate: false, collision: false, existing: null };
  }

  function createHandler(command, ctx) {
    var p = command && command.payload || {};
    var cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.countryId) !== cid || !p.proposal || !p.proposal.proposalId)
      return handlerResult(false, { reason: 'PROPOSAL_COUNTRY_OR_ID_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    var proposal = clone(p.proposal);
    var direction = String(p.direction || 'INBOUND');
    proposal.direction = direction;
    var rows = pushUnique(inv.proposals, proposal, 'proposalId');
    if (rows.collision) return handlerResult(false, { reason: 'PROPOSAL_IDEMPOTENCY_COLLISION' });
    inv.proposals = rows.rows;
    if (!rows.duplicate) recordEvent(inv, 'GOVERNMENT_INVESTMENT_PROPOSAL_CREATED', { proposalId: proposal.proposalId, direction: direction, investorCountryId: proposal.investorCountryId, hostCountryId: proposal.hostCountryId });
    saveContext(ctx, root);
    return handlerResult(true, { status: rows.duplicate ? 'DUPLICATE' : 'CREATED', proposalId: proposal.proposalId, duplicate: rows.duplicate });
  }
  function decideHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.proposalId) return handlerResult(false, { reason: 'PROPOSAL_DECISION_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    var proposal = inv.proposals.find(function (x) { return x && x.proposalId === p.proposalId; });
    if (!proposal) return handlerResult(false, { reason: 'PROPOSAL_NOT_FOUND' });
    if (proposal.status === 'APPROVED' || proposal.status === 'PROJECT_STARTED' || proposal.status === 'SETTLED') return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    if (proposal.status !== 'PENDING_HOST_APPROVAL') return handlerResult(false, { reason: 'PROPOSAL_NOT_PENDING' });
    var decision = String(p.decision || '').toUpperCase();
    if (decision !== 'ACCEPT' && decision !== 'DECLINE') return handlerResult(false, { reason: 'PROPOSAL_DECISION_INVALID' });
    proposal.status = decision === 'ACCEPT' ? 'APPROVED' : 'DECLINED';
    proposal.hostDecision = { decision: decision, actorType: p.actorType || 'PLAYER', countryId: cid, reason: p.reason || null, turn: turn(), authority: p.actorType === 'NPC' ? 'BOUNDED_NPC_HOST_DECISION_V1' : 'PLAYER_HOST_GOVERNMENT_DECISION' };
    proposal.updatedTurn = turn();
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_PROPOSAL_' + decision, { proposalId: p.proposalId, actorType: p.actorType || 'PLAYER' });
    saveContext(ctx, root);
    return handlerResult(true, { status: proposal.status, proposalId: proposal.proposalId });
  }
  function updateProposalHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.countryId) !== cid || !p.proposalId || !isObject(p.patch)) return handlerResult(false, { reason: 'PROPOSAL_UPDATE_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    var proposal = inv.proposals.find(function (x) { return x && x.proposalId === p.proposalId; });
    if (!proposal) return handlerResult(false, { reason: 'PROPOSAL_NOT_FOUND' });
    Object.keys(p.patch).forEach(function (key) { if (['status','projectId','projectCostUsd','capitalAppliedUsd','constructionDays','project','projectFailure','updatedTurn','remainingRefundedUsd','hostDecision','funding','settledTurn'].includes(key)) proposal[key] = clone(p.patch[key]); });
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_PROPOSAL_UPDATED', { proposalId: p.proposalId, status: proposal.status });
    saveContext(ctx, root); return handlerResult(true, { status: 'UPDATED', proposalId: p.proposalId });
  }
  function registerLoanHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    var role = String(p.ownerRole || 'BORROWER').toUpperCase();
    if (!cid || !['BORROWER', 'LENDER'].includes(role) ||
        (role === 'BORROWER' ? canonicalCountry(p.hostCountryId) !== cid : canonicalCountry(p.investorCountryId) !== cid) ||
        !p.loan || !p.loan.loanId) return handlerResult(false, { reason: 'LOAN_REGISTER_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true); inv.loans = Array.isArray(inv.loans) ? inv.loans : [];
    var prior = inv.loans.find(function (x) { return x && x.loanId === p.loan.loanId && x.ownerRole === role; });
    if (prior) return sameFingerprint(prior, Object.assign({}, p.loan, { ownerRole: role }))
      ? handlerResult(true, { status: 'DUPLICATE', duplicate: true })
      : handlerResult(false, { reason: 'LOAN_IDEMPOTENCY_COLLISION' });
    inv.loans.push(Object.assign(clone(p.loan), { ownerRole: role }));
    recordEvent(inv, 'GOVERNMENT_FOREIGN_LOAN_REGISTERED', { loanId: p.loan.loanId, proposalId: p.loan.proposalId, ownerRole: role });
    saveContext(ctx, root); return handlerResult(true, { status: 'REGISTERED', loanId: p.loan.loanId, ownerRole: role });
  }
  function updateLoanHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    var role = String(p.ownerRole || 'BORROWER').toUpperCase();
    if (!cid || !['BORROWER', 'LENDER'].includes(role) ||
        (role === 'BORROWER' ? canonicalCountry(p.hostCountryId) !== cid : canonicalCountry(p.investorCountryId) !== cid) ||
        !p.loanId || !isObject(p.patch)) return handlerResult(false, { reason: 'LOAN_UPDATE_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true), loans = Array.isArray(inv.loans) ? inv.loans : [];
    var loan = loans.find(function (x) { return x && x.loanId === p.loanId && x.ownerRole === role; });
    if (!loan) return handlerResult(false, { reason: 'LOAN_NOT_FOUND' });
    Object.keys(p.patch).forEach(function (key) {
      if (['principalOutstandingUsd','graceInstallmentsRemaining','remainingInstallments','nextDueTurn','status','missedPayments',
        'lastFailedPaymentTurn','installmentNumber','lastPaymentTurn','totalInterestPaidUsd','totalPrincipalPaidUsd',
        'pendingPayment','lastPaymentAmountUsd'].includes(key)) loan[key] = clone(p.patch[key]);
    });
    saveContext(ctx, root); return handlerResult(true, { status: 'UPDATED', loanId: p.loanId, ownerRole: role });
  }
  function reserveHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.investorCountryId) !== cid || !p.transferId) return handlerResult(false, { reason: 'INVESTOR_RESERVATION_SCOPE_INVALID' });
    var amount = num(p.amountUsd);
    if (amount === null || amount <= 0 || Math.abs(amount - round(amount, 2)) > 1e-7) return handlerResult(false, { reason: 'INVESTMENT_AMOUNT_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    inv.transfers = isObject(inv.transfers) ? inv.transfers : {};
    var prior = inv.transfers[p.transferId];
    if (prior) {
      if (Math.abs((num(prior.amountUsd) || 0) - amount) > 0.01 || prior.hostCountryId !== canonicalCountry(p.hostCountryId))
        return handlerResult(false, { reason: 'GOVERNMENT_TRANSFER_IDEMPOTENCY_COLLISION' });
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true, transferId: p.transferId });
    }
    var cash = num(getPath(ctx, 'finance.available'));
    if (cash === null || cash < amount) return handlerResult(false, { reason: 'INSUFFICIENT_SOVEREIGN_TREASURY', available: cash, required: amount });
    var after = round(cash - amount, 2);
    var entryId = p.transferId + ':RESERVE';
    if (!appendLedger(root, { transactionId: entryId, type: 'GOVERNMENT_INTERNATIONAL_INVESTMENT_RESERVE',
      action: 'GOVERNMENT_INVESTMENT_RESERVE', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'TRANSFER', debitAccount: 'GOVERNMENT:FOREIGN_INVESTMENT_ASSET',
      creditAccount: 'GOVERNMENT:SOVEREIGN_TREASURY_CASH', hostCountryId: canonicalCountry(p.hostCountryId),
      proposalId: p.proposalId, correlationId: p.transferId, balanceAfterUsd: after })) {
      if ((root.ledger || []).some(function (x) { return x && x.transactionId === entryId; })) return handlerResult(false, { reason: 'GOVERNMENT_RESERVE_LEDGER_DUPLICATE' });
    }
    inv.outboundEscrowUsd = round((num(inv.outboundEscrowUsd) || 0) + amount, 2);
    inv.transfers[p.transferId] = { transferId: p.transferId, proposalId: p.proposalId, investorCountryId: cid,
      hostCountryId: canonicalCountry(p.hostCountryId), amountUsd: amount, status: 'RESERVED', reservedTurn: turn(), currencyCode: p.investorCurrencyCode || 'USD' };
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_TREASURY_RESERVED', { transferId: p.transferId, proposalId: p.proposalId, amountUsd: amount });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'RESERVED', transferId: p.transferId, balanceAfterUsd: after });
  }
  function receiveHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.transferId) return handlerResult(false, { reason: 'HOST_RECEIPT_SCOPE_INVALID' });
    var amount = num(p.amountUsd);
    if (amount === null || amount <= 0) return handlerResult(false, { reason: 'HOST_RECEIPT_AMOUNT_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    inv.receipts = isObject(inv.receipts) ? inv.receipts : {};
    var prior = inv.receipts[p.transferId];
    if (prior) {
      if (Math.abs((num(prior.amountUsd) || 0) - amount) > 0.01 || prior.investorCountryId !== canonicalCountry(p.investorCountryId))
        return handlerResult(false, { reason: 'HOST_RECEIPT_IDEMPOTENCY_COLLISION' });
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true, transferId: p.transferId });
    }
    var instrument = String(p.instrument || 'EQUITY').toUpperCase();
    var account = instrument === 'LOAN' ? 'GOVERNMENT:FOREIGN_SOVEREIGN_DEBT'
      : instrument === 'GRANT' ? 'GOVERNMENT:FOREIGN_DEVELOPMENT_GRANT'
      : instrument === 'DOMESTIC_PUBLIC_CAPEX' ? 'GOVERNMENT:DOMESTIC_PUBLIC_CAPITAL'
      : 'GOVERNMENT:FOREIGN_EQUITY_CAPITAL';
    var receiptId = p.transferId + ':RECEIPT';
    appendLedger(root, { transactionId: receiptId, type: 'GOVERNMENT_FOREIGN_INVESTMENT_RECEIPT',
      action: 'GOVERNMENT_INVESTMENT_RECEIPT', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'TRANSFER', debitAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH', creditAccount: account,
      investorCountryId: canonicalCountry(p.investorCountryId), proposalId: p.proposalId,
      instrument: p.instrument, correlationId: p.transferId, balanceAfterUsd: num(getPath(ctx, 'finance.available')) }));
    inv.restrictedFundsUsd = round((num(inv.restrictedFundsUsd) || 0) + amount, 2);
    inv.receivedCapitalUsd = round((num(inv.receivedCapitalUsd) || 0) + amount, 2);
    inv.receipts[p.transferId] = { transferId: p.transferId, proposalId: p.proposalId,
      investorCountryId: canonicalCountry(p.investorCountryId), hostCountryId: cid, amountUsd: amount,
      remainingUsd: amount, instrument: String(p.instrument || 'EQUITY').toUpperCase(), status: 'RECEIVED',
      receivedTurn: turn(), currencyCode: p.hostCurrencyCode || 'USD', fxSnapshot: clone(p.fxSnapshot || null) };
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_HOST_RECEIPT', { transferId: p.transferId, proposalId: p.proposalId, amountUsd: amount });
    saveContext(ctx, root);
    return handlerResult(true, { status: 'RECEIVED', transferId: p.transferId, restrictedFundsUsd: inv.restrictedFundsUsd });
  }
  function settleHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.investorCountryId) !== cid || !p.transferId) return handlerResult(false, { reason: 'INVESTOR_SETTLEMENT_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true), transfer = inv.transfers && inv.transfers[p.transferId];
    if (!transfer) return handlerResult(false, { reason: 'INVESTOR_RESERVATION_NOT_FOUND' });
    if (transfer.status === 'SETTLED') return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    if (transfer.status !== 'RESERVED') return handlerResult(false, { reason: 'INVESTOR_TRANSFER_NOT_RESERVED' });
    transfer.status = 'SETTLED'; transfer.settledTurn = turn();
    inv.outboundEscrowUsd = Math.max(0, round((num(inv.outboundEscrowUsd) || 0) - transfer.amountUsd, 2));
    var domestic = canonicalCountry(transfer.hostCountryId) === cid;
    inv.investedCapitalUsd = round((num(inv.investedCapitalUsd) || 0) + transfer.amountUsd, 2);
    if (!domestic) inv.outboundInvestedCapitalUsd = round((num(inv.outboundInvestedCapitalUsd) || 0) + transfer.amountUsd, 2);
    appendLedger(root, { transactionId: p.transferId + ':SETTLE', type: 'GOVERNMENT_INTERNATIONAL_INVESTMENT_SETTLEMENT',
      action: 'GOVERNMENT_INVESTMENT_SETTLEMENT', countryId: cid, countryCode: cid, amountUsd: transfer.amountUsd,
      direction: 'MEMO', debitAccount: domestic ? 'GOVERNMENT:DOMESTIC_PUBLIC_CAPITAL' : 'GOVERNMENT:FOREIGN_EQUITY_INVESTMENT',
      creditAccount: 'GOVERNMENT:INVESTMENT_ESCROW', hostCountryId: transfer.hostCountryId,
      proposalId: transfer.proposalId, correlationId: p.transferId, balanceAfterUsd: num(getPath(ctx, 'finance.available')) });
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_SETTLED', { transferId: p.transferId, proposalId: p.proposalId });
    saveContext(ctx, root);
    return handlerResult(true, { status: 'SETTLED', transferId: p.transferId });
  }
  function confirmHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.transferId) return handlerResult(false, { reason: 'HOST_CONFIRM_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true), receipt = inv.receipts && inv.receipts[p.transferId];
    if (!receipt) return handlerResult(false, { reason: 'HOST_RECEIPT_NOT_FOUND' });
    if (receipt.status === 'SETTLED') return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    if (receipt.status !== 'RECEIVED') return handlerResult(false, { reason: 'HOST_RECEIPT_NOT_SETTLEABLE' });
    receipt.status = 'SETTLED'; receipt.settledTurn = turn();
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_RECEIPT_CONFIRMED', { transferId: p.transferId, proposalId: receipt.proposalId });
    saveContext(ctx, root);
    return handlerResult(true, { status: 'SETTLED', transferId: p.transferId });
  }
  function refundReceiptHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.transferId) return handlerResult(false, { reason: 'HOST_REFUND_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx), inv = investmentRoot(root, true);
    var receipt = inv.receipts && inv.receipts[p.transferId];
    if (!receipt || amount === null || amount <= 0 || amount > (num(receipt.remainingUsd) || 0) + 1e-7)
      return handlerResult(false, { reason: 'HOST_REFUND_AMOUNT_INVALID' });
    var refundId = p.transferId + ':HOST-REFUND:' + String(p.refundRequestId || '1');
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === refundId; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    receipt.remainingUsd = round(receipt.remainingUsd - amount, 2);
    inv.restrictedFundsUsd = Math.max(0, round((num(inv.restrictedFundsUsd) || 0) - amount, 2));
    receipt.status = receipt.remainingUsd > 0 ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
    receipt.updatedTurn = turn();
    appendLedger(root, { transactionId: refundId, type: 'GOVERNMENT_INVESTMENT_REFUND_OUT',
      action: 'GOVERNMENT_INVESTMENT_REFUND', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'TRANSFER', debitAccount: 'GOVERNMENT:FOREIGN_EQUITY_CAPITAL', creditAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH',
      investorCountryId: receipt.investorCountryId, proposalId: receipt.proposalId, correlationId: p.transferId });
    saveContext(ctx, root);
    return handlerResult(true, { status: receipt.status, amountUsd: amount, remainingUsd: receipt.remainingUsd });
  }
  function refundCashHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.investorCountryId) !== cid || !p.transferId)
      return handlerResult(false, { reason: 'INVESTOR_REFUND_SCOPE_INVALID' });
    var amount = num(p.amountUsd), cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null)
      return handlerResult(false, { reason: 'INVESTOR_REFUND_AMOUNT_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    var transfer = inv.transfers && inv.transfers[p.transferId];
    if (!transfer || !['SETTLED', 'RESERVED'].includes(transfer.status))
      return handlerResult(false, { reason: 'INVESTOR_TRANSFER_NOT_REFUNDABLE' });
    var wasReserved = transfer.status === 'RESERVED';
    var alreadyRefunded = num(transfer.refundedUsd) || 0;
    var refundable = wasReserved ? (num(transfer.amountUsd) || 0) : Math.max(0, (num(transfer.amountUsd) || 0) - alreadyRefunded);
    if (amount > refundable + 1e-7)
      return handlerResult(false, { reason: 'INVESTOR_REFUND_AMOUNT_EXCEEDS_UNREFUNDED_CAPITAL',
        refundableUsd: refundable, requestedUsd: amount });
    var requestId = String(p.refundRequestId || 'FULL');
    var refundTxId = p.transferId + ':INVESTOR-REFUND:' + requestId;
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === refundTxId; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    transfer.refundedUsd = round(alreadyRefunded + amount, 2);
    transfer.refundedTurn = turn();
    if (wasReserved) {
      inv.outboundEscrowUsd = Math.max(0, round((num(inv.outboundEscrowUsd) || 0) - amount, 2));
    } else {
      inv.investedCapitalUsd = Math.max(0, round((num(inv.investedCapitalUsd) || 0) - amount, 2));
      inv.outboundInvestedCapitalUsd = Math.max(0, round((num(inv.outboundInvestedCapitalUsd) || 0) - amount, 2));
    }
    if (transfer.refundedUsd + 1e-7 >= (num(transfer.amountUsd) || 0)) transfer.status = 'REFUNDED';
    else if (wasReserved) transfer.status = 'RESERVED';
    else transfer.status = 'SETTLED';
    var after = round(cash + amount, 2);
    appendLedger(root, { transactionId: refundTxId, type: 'GOVERNMENT_INVESTMENT_REFUND_IN',
      action: 'GOVERNMENT_INVESTMENT_REFUND', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'TRANSFER', debitAccount: 'GOVERNMENT:SOVEREIGN_TREASURY_CASH',
      creditAccount: 'GOVERNMENT:FOREIGN_INVESTMENT_ASSET',
      hostCountryId: transfer.hostCountryId, proposalId: transfer.proposalId,
      correlationId: p.transferId, balanceAfterUsd: after });
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_REFUNDED', { transferId: p.transferId, amountUsd: amount });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'REFUNDED', balanceAfterUsd: after,
      refundedUsd: transfer.refundedUsd, remainingRefundableUsd: Math.max(0, refundable - amount) });
  }
  function releaseMineHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.proposalId || !p.releaseId) return handlerResult(false, { reason: 'MINE_RELEASE_SCOPE_INVALID' });
    var amount = num(p.amountUsd), cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null) return handlerResult(false, { reason: 'MINE_RELEASE_AMOUNT_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true);
    var receipt = inv.receipts && inv.receipts[p.transferId];
    if (!receipt || receipt.status !== 'SETTLED' || (num(receipt.remainingUsd) || 0) + 1e-7 < amount)
      return handlerResult(false, { reason: 'RESTRICTED_INVESTMENT_FUNDS_INSUFFICIENT' });
    inv.mineReleases = isObject(inv.mineReleases) ? inv.mineReleases : {};
    var prior = inv.mineReleases[p.releaseId];
    if (prior) return Math.abs((num(prior.amountUsd) || 0) - amount) < 0.01
      ? handlerResult(true, { status: 'DUPLICATE', duplicate: true }) : handlerResult(false, { reason: 'MINE_RELEASE_IDEMPOTENCY_COLLISION' });
    var after = round(cash + amount, 2);
    inv.mineReleases[p.releaseId] = { releaseId: p.releaseId, proposalId: p.proposalId, transferId: p.transferId, amountUsd: amount, status: 'RELEASED', turn: turn() };
    appendLedger(root, { transactionId: p.releaseId + ':RELEASE', type: 'GOVERNMENT_INVESTMENT_PROJECT_FUND_RELEASE',
      action: 'GOVERNMENT_INVESTMENT_RELEASE', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'TRANSFER', debitAccount: 'GOVERNMENT:PROJECT_TREASURY_CASH', creditAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH',
      projectId: p.projectId, proposalId: p.proposalId, correlationId: p.transferId, balanceAfterUsd: after });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'RELEASED', amountUsd: amount, balanceAfterUsd: after });
  }
  function rollbackMineReleaseHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.releaseId) return handlerResult(false, { reason: 'MINE_RELEASE_ROLLBACK_SCOPE_INVALID' });
    var amount = num(p.amountUsd), cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null || cash + 1e-7 < amount) return handlerResult(false, { reason: 'MINE_RELEASE_ROLLBACK_CASH_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true), release = inv.mineReleases && inv.mineReleases[p.releaseId];
    if (!release) return handlerResult(false, { reason: 'MINE_RELEASE_NOT_FOUND' });
    if (release.status === 'REVERSED') return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    var after = round(cash - amount, 2); release.status = 'REVERSED'; release.reversedTurn = turn();
    appendLedger(root, { transactionId: p.releaseId + ':ROLLBACK', type: 'GOVERNMENT_INVESTMENT_PROJECT_FUND_RELEASE_REVERSAL', action: 'GOVERNMENT_INVESTMENT_RELEASE_REVERSAL', countryId: cid, countryCode: cid, amountUsd: amount, direction: 'REVERSAL', debitAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH', creditAccount: 'GOVERNMENT:PROJECT_TREASURY_CASH', projectId: p.projectId || null, proposalId: p.proposalId || null, correlationId: p.releaseId, balanceAfterUsd: after });
    saveContext(ctx, root, after); return handlerResult(true, { status: 'REVERSED', balanceAfterUsd: after });
  }
  function commitCapexHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.proposalId || !p.transferId || !p.projectId)
      return handlerResult(false, { reason: 'CAPEX_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx), inv = investmentRoot(root, true);
    var receipt = inv.receipts && inv.receipts[p.transferId];
    if (!receipt || receipt.status !== 'SETTLED' || amount === null || amount <= 0 ||
        amount > (num(receipt.remainingUsd) || 0) + 1e-7) return handlerResult(false, { reason: 'CAPEX_RESTRICTED_FUNDS_INSUFFICIENT' });
    var capexId = p.transferId + ':CAPEX:' + p.projectId;
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === capexId; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    receipt.remainingUsd = round(receipt.remainingUsd - amount, 2);
    inv.restrictedFundsUsd = Math.max(0, round((num(inv.restrictedFundsUsd) || 0) - amount, 2));
    inv.investedCapitalUsd = round((num(inv.investedCapitalUsd) || 0) + amount, 2);
    inv.capitalizedProjectCapitalUsd = round((num(inv.capitalizedProjectCapitalUsd) || 0) + amount, 2);
    appendLedger(root, { transactionId: capexId, type: 'GOVERNMENT_INVESTMENT_PROJECT_CAPEX',
      action: 'GOVERNMENT_INVESTMENT_CAPEX', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'CAPITALIZATION', debitAccount: 'GOVERNMENT:PUBLIC_PROJECT_CAPITAL_ASSET',
      creditAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH', projectId: p.projectId,
      proposalId: p.proposalId, investorCountryId: receipt.investorCountryId, correlationId: p.transferId });
    inv.receipts[p.transferId] = receipt;
    inv.investments = Array.isArray(inv.investments) ? inv.investments : [];
    inv.investments.push({ proposalId: p.proposalId, transferId: p.transferId, projectId: p.projectId,
      investorCountryId: receipt.investorCountryId, hostCountryId: cid, instrument: receipt.instrument,
      equityShareBps: Math.max(0, Math.floor(num(p.equityShareBps) || 0)), durationYears: num(p.durationYears),
      investedCapitalUsd: amount, remainingEscrowUsd: receipt.remainingUsd, turn: turn(), status: 'PROJECT_CAPITALIZED' });
    recordEvent(inv, 'GOVERNMENT_INVESTMENT_PROJECT_CAPITALIZED', { proposalId: p.proposalId, projectId: p.projectId, amountUsd: amount });
    saveContext(ctx, root);
    return handlerResult(true, { status: 'CAPITALIZED', projectId: p.projectId, investedCapitalUsd: amount, remainingUsd: receipt.remainingUsd });
  }
  function rollbackCapexHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.transferId || !p.capexTransactionId)
      return handlerResult(false, { reason: 'CAPEX_ROLLBACK_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx), inv = investmentRoot(root, true);
    var receipt = inv.receipts && inv.receipts[p.transferId];
    if (!receipt || amount === null || amount <= 0) return handlerResult(false, { reason: 'CAPEX_ROLLBACK_RECEIPT_UNAVAILABLE' });
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === p.capexTransactionId + ':ROLLBACK'; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    receipt.remainingUsd = round((num(receipt.remainingUsd) || 0) + amount, 2);
    inv.restrictedFundsUsd = round((num(inv.restrictedFundsUsd) || 0) + amount, 2);
    inv.investedCapitalUsd = Math.max(0, round((num(inv.investedCapitalUsd) || 0) - amount, 2));
    appendLedger(root, { transactionId: p.capexTransactionId + ':ROLLBACK', type: 'GOVERNMENT_INVESTMENT_PROJECT_CAPEX_REVERSAL',
      action: 'GOVERNMENT_INVESTMENT_CAPEX_REVERSAL', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'REVERSAL', debitAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH',
      creditAccount: 'GOVERNMENT:PUBLIC_PROJECT_CAPITAL_ASSET', projectId: p.projectId,
      proposalId: p.proposalId, correlationId: p.transferId });
    saveContext(ctx, root);
    return handlerResult(true, { status: 'REVERSED', amountUsd: amount });
  }
  function linkProjectHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.transferId || !p.pendingProjectId || !p.projectId) return handlerResult(false, { reason: 'PROJECT_LINK_SCOPE_INVALID' });
    var root = rootForContext(ctx), inv = investmentRoot(root, true), investments = Array.isArray(inv.investments) ? inv.investments : [];
    var row = investments.find(function (x) { return x && x.transferId === p.transferId && x.projectId === p.pendingProjectId; });
    if (!row) return handlerResult(false, { reason: 'PENDING_PROJECT_CAPITAL_RECORD_NOT_FOUND' });
    row.projectId = p.projectId; row.linkedTurn = turn();
    (root.ledger || []).forEach(function (entry) { if (entry && entry.transactionId === p.transferId + ':CAPEX:' + p.pendingProjectId) entry.projectId = p.projectId; });
    saveContext(ctx, root); return handlerResult(true, { status: 'LINKED', projectId: p.projectId });
  }
  function recapitalizeHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.transferId || !p.projectId)
      return handlerResult(false, { reason: 'PROJECT_RECAPITALIZATION_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx), inv = investmentRoot(root, true), receipt = inv.receipts && inv.receipts[p.transferId];
    if (amount === null || amount <= 0 || !receipt || receipt.status !== 'SETTLED' ||
        amount > (num(receipt.remainingUsd) || 0) + 1e-7)
      return handlerResult(false, { reason: 'PROJECT_RECAPITALIZATION_ESCROW_INSUFFICIENT' });
    var txId = p.transferId + ':RECAPITALIZE:' + p.projectId;
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === txId; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    receipt.remainingUsd = round(receipt.remainingUsd - amount, 2);
    inv.restrictedFundsUsd = Math.max(0, round((num(inv.restrictedFundsUsd) || 0) - amount, 2));
    inv.investedCapitalUsd = round((num(inv.investedCapitalUsd) || 0) + amount, 2);
    inv.capitalizedProjectCapitalUsd = round((num(inv.capitalizedProjectCapitalUsd) || 0) + amount, 2);
    inv.projectWorkingCapitalUsd = isObject(inv.projectWorkingCapitalUsd) ? inv.projectWorkingCapitalUsd : {};
    inv.projectWorkingCapitalUsd[p.projectId] = round((num(inv.projectWorkingCapitalUsd[p.projectId]) || 0) + amount, 2);
    appendLedger(root, { transactionId: txId, type: 'GOVERNMENT_PROJECT_RECAPITALIZATION',
      action: 'GOVERNMENT_INVESTMENT_RECAPITALIZATION', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'CAPITALIZATION', debitAccount: 'GOVERNMENT:PROJECT_WORKING_CAPITAL_ASSET',
      creditAccount: 'GOVERNMENT:RESTRICTED_INVESTMENT_CASH', projectId: p.projectId,
      investorCountryId: receipt.investorCountryId, proposalId: p.proposalId, correlationId: p.transferId });
    inv.investments = Array.isArray(inv.investments) ? inv.investments : [];
    inv.investments.push({ proposalId: p.proposalId, transferId: p.transferId, projectId: p.projectId,
      investorCountryId: receipt.investorCountryId, hostCountryId: cid, instrument: receipt.instrument,
      equityShareBps: Math.max(0, Math.floor(num(p.equityShareBps) || 0)), durationYears: num(p.durationYears),
      investedCapitalUsd: amount, remainingEscrowUsd: receipt.remainingUsd, turn: turn(),
      status: 'PROJECT_WORKING_CAPITAL_RESERVED', deploymentStatus: 'EARMARKED_NOT_YET_SPENT_BY_PROJECT_RUNTIME' });
    recordEvent(inv, 'GOVERNMENT_PROJECT_WORKING_CAPITAL_RESERVED', { proposalId: p.proposalId, projectId: p.projectId, amountUsd: amount });
    saveContext(ctx, root);
    return handlerResult(true, { status: 'RECAPITALIZED', amountUsd: amount,
      projectWorkingCapitalUsd: inv.projectWorkingCapitalUsd[p.projectId],
      deploymentStatus: 'EARMARKED_NOT_YET_SPENT_BY_PROJECT_RUNTIME' });
  }
  function loanDebitHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.paymentId)
      return handlerResult(false, { reason: 'LOAN_DEBIT_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx);
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === p.paymentId + ':DEBIT'; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    var cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null || cash + 1e-7 < amount)
      return handlerResult(false, { reason: 'LOAN_REPAYMENT_TREASURY_SHORTFALL', available: cash, required: amount });
    var after = round(cash - amount, 2);
    appendLedger(root, { transactionId: p.paymentId + ':DEBIT', type: 'GOVERNMENT_FOREIGN_LOAN_REPAYMENT',
      action: 'GOVERNMENT_LOAN_REPAYMENT', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'OUTFLOW', debitAccount: 'GOVERNMENT:FOREIGN_SOVEREIGN_DEBT',
      creditAccount: 'GOVERNMENT:SOVEREIGN_TREASURY_CASH', investorCountryId: p.investorCountryId,
      projectId: p.projectId, proposalId: p.proposalId, correlationId: p.paymentId, balanceAfterUsd: after });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'PAID', balanceAfterUsd: after });
  }
  function loanCreditHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.investorCountryId) !== cid || !p.paymentId)
      return handlerResult(false, { reason: 'LOAN_CREDIT_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx);
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === p.paymentId + ':CREDIT'; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    var cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null)
      return handlerResult(false, { reason: 'LOAN_CREDIT_AMOUNT_INVALID' });
    var inv = investmentRoot(root, true), after = round(cash + amount, 2);
    appendLedger(root, { transactionId: p.paymentId + ':CREDIT', type: 'GOVERNMENT_FOREIGN_LOAN_REPAYMENT_RECEIPT',
      action: 'GOVERNMENT_LOAN_REPAYMENT_RECEIPT', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'INFLOW', debitAccount: 'GOVERNMENT:SOVEREIGN_TREASURY_CASH',
      creditAccount: 'GOVERNMENT:FOREIGN_LOAN_RECEIVABLE', hostCountryId: p.hostCountryId,
      projectId: p.projectId, proposalId: p.proposalId, correlationId: p.paymentId, balanceAfterUsd: after });
    recordEvent(inv, 'GOVERNMENT_LOAN_REPAYMENT_RECEIVED', { paymentId: p.paymentId, amountUsd: amount });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'RECEIVED', balanceAfterUsd: after });
  }
  function profitDebitHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.hostCountryId) !== cid || !p.distributionId)
      return handlerResult(false, { reason: 'PROFIT_DISTRIBUTION_DEBIT_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx);
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === p.distributionId + ':DEBIT'; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    var cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null || cash + 1e-7 < amount)
      return handlerResult(false, { reason: 'PROJECT_PROFIT_CASH_SHORTFALL', available: cash, required: amount });
    var after = round(cash - amount, 2);
    appendLedger(root, { transactionId: p.distributionId + ':DEBIT', type: 'GOVERNMENT_PROJECT_PROFIT_DISTRIBUTION',
      action: 'GOVERNMENT_PROJECT_PROFIT_DISTRIBUTION', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'OUTFLOW', debitAccount: 'GOVERNMENT:PROJECT_DISTRIBUTION_PAYABLE',
      creditAccount: 'GOVERNMENT:SOVEREIGN_TREASURY_CASH', projectId: p.projectId,
      investorCountryId: p.investorCountryId, proposalId: p.proposalId, sourceProfitTransactionId: p.sourceTransactionId,
      correlationId: p.distributionId, balanceAfterUsd: after });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'PAID', balanceAfterUsd: after });
  }
  function profitCreditHandler(command, ctx) {
    var p = command && command.payload || {}, cid = canonicalCountry(ctx && ctx.countryId);
    if (!cid || canonicalCountry(p.investorCountryId) !== cid || !p.distributionId)
      return handlerResult(false, { reason: 'PROFIT_DISTRIBUTION_CREDIT_SCOPE_INVALID' });
    var amount = num(p.amountUsd), root = rootForContext(ctx);
    if ((root.ledger || []).some(function (x) { return x && x.transactionId === p.distributionId + ':CREDIT'; }))
      return handlerResult(true, { status: 'DUPLICATE', duplicate: true });
    var cash = num(getPath(ctx, 'finance.available'));
    if (amount === null || amount <= 0 || cash === null)
      return handlerResult(false, { reason: 'PROFIT_DISTRIBUTION_CREDIT_INVALID' });
    var inv = investmentRoot(root, true), after = round(cash + amount, 2);
    appendLedger(root, { transactionId: p.distributionId + ':CREDIT', type: 'GOVERNMENT_PROJECT_INVESTMENT_RETURN',
      action: 'GOVERNMENT_PROJECT_INVESTMENT_RETURN', countryId: cid, countryCode: cid, amountUsd: amount,
      direction: 'INFLOW', debitAccount: 'GOVERNMENT:SOVEREIGN_TREASURY_CASH',
      creditAccount: 'GOVERNMENT:PROJECT_INVESTMENT_INCOME', hostCountryId: p.hostCountryId,
      projectId: p.projectId, proposalId: p.proposalId, sourceProfitTransactionId: p.sourceTransactionId,
      correlationId: p.distributionId, balanceAfterUsd: after });
    recordEvent(inv, 'GOVERNMENT_PROJECT_INVESTMENT_RETURN_RECEIVED', { distributionId: p.distributionId, amountUsd: amount });
    saveContext(ctx, root, after);
    return handlerResult(true, { status: 'RECEIVED', balanceAfterUsd: after });
  }
  function registerHandlers(deps) {
    if (registered) return true;
    if (!deps.interop || typeof deps.interop.registerCommandHandler !== 'function' ||
        typeof deps.interop.dispatchCommand !== 'function' || !g.OmegaMinistryStateTransaction && !(g.Omega && g.Omega.MinistryStateTransaction))
      throw new Error('GOVERNMENT_INVESTMENT_FINANCE_TRANSACTION_BOUNDARY_UNAVAILABLE');
    var handlers = [
      [HANDLERS.create, createHandler], [HANDLERS.decide, decideHandler], [HANDLERS.updateProposal, updateProposalHandler],
      [HANDLERS.registerLoan, registerLoanHandler], [HANDLERS.updateLoan, updateLoanHandler],
      [HANDLERS.reserve, reserveHandler], [HANDLERS.receive, receiveHandler],
      [HANDLERS.settle, settleHandler], [HANDLERS.confirm, confirmHandler],
      [HANDLERS.refundReceipt, refundReceiptHandler], [HANDLERS.refundCash, refundCashHandler],
      [HANDLERS.releaseMine, releaseMineHandler], [HANDLERS.rollbackMine, rollbackMineReleaseHandler], [HANDLERS.commitCapex, commitCapexHandler],
      [HANDLERS.rollbackCapex, rollbackCapexHandler], [HANDLERS.linkProject, linkProjectHandler], [HANDLERS.recapitalize, recapitalizeHandler],
      [HANDLERS.loanDebit, loanDebitHandler], [HANDLERS.loanCredit, loanCreditHandler],
      [HANDLERS.profitDebit, profitDebitHandler], [HANDLERS.profitCredit, profitCreditHandler]
    ];
    handlers.forEach(function (entry) { deps.interop.registerCommandHandler(entry[0], 'finance', entry[1]); });
    registered = true;
    return true;
  }
  function dispatch(deps, type, country, payload, correlationId) {
    var requestId = String(payload && (payload.requestId || payload.proposalId || payload.transferId ||
      payload.projectId || payload.paymentId || payload.distributionId) || correlationId || type);
    var commandId = 'GOVINV:' + requestId + ':' + type + ':' + canonicalCountry(country);
    var response = deps.interop.dispatchCommand('finance', type, country, payload, {
      turn: turn(), commandId: commandId, commandType: type, ownerMinistry: 'finance',
      correlationId: correlationId || requestId,
      provenance: { source: AUTHORITY, version: VERSION }
    });
    var body = response && response.result || response || {};
    if (!response || response.status !== 'APPLIED' || body.accepted === false)
      return { ok: false, status: response && response.status || 'FAILED', reason: body.reason || response && response.reason || 'GOVERNMENT_INVESTMENT_FINANCE_COMMAND_FAILED', result: body };
    return { ok: true, status: body.status || 'APPLIED', duplicate: body.duplicate === true, result: body };
  }
  async function init() {
    if (ready) return diagnostics();
    if (initPromise) return initPromise;
    initPromise = (async function () {
      var d = dependencies();
      if (!d.finance || typeof d.finance.init !== 'function' || !d.forex || !d.network || !d.countries)
        throw new Error('GOVERNMENT_INVESTMENT_DEPENDENCIES_UNAVAILABLE');
      await Promise.resolve(d.finance.init());
      await Promise.resolve(d.countries.ready || true);
      if (typeof d.network.loadCatalog === 'function') await Promise.resolve(d.network.loadCatalog());
      registerHandlers(d);
      ready = true;
      lastError = null;
      if (typeof g.dispatchEvent === 'function' && typeof g.Event === 'function') {
        try { g.dispatchEvent(new g.Event('OMEGA_GOVERNMENT_INVESTMENT_RUNTIME_READY')); } catch (_) {}
      }
      return diagnostics();
    })();
    try { return await initPromise; }
    catch (e) { lastError = String(e && e.message || e); initPromise = null; throw e; }
  }

  function currentCatalog() {
    return g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData ||
      g.OmegaResourceIndustrialNetwork && g.OmegaResourceIndustrialNetwork.catalog || {};
  }
  function projectInCountry(country, projectId) {
    var resource = state().resource || {}, bucket = resource[country] || {};
    var network = bucket.industrialNetwork || {};
    var rows = Array.isArray(network.projects) ? network.projects : [];
    return rows.find(function (x) { return x && String(x.projectId || '') === String(projectId || ''); }) || null;
  }
  function siteRecord(country, siteId) {
    var registry = g.OmegaResourceSiteCanonicalCatalogData || g.Omega && g.Omega.ResourceSiteCanonicalCatalogData || {};
    var sites = Array.isArray(registry.sites) ? registry.sites : [];
    return sites.find(function (x) {
      var siteCountry = canonicalCountry(x.countryId || x.countryCode || x.sourceSiteRecord && x.sourceSiteRecord.countryCode);
      return siteCountry === country && String(x.siteId || x.id || '') === String(siteId || '');
    }) || null;
  }
  function quoteProject(input) {
    input = input || {};
    var d = dependencies(), country = canonicalCountry(input.hostCountryId), type = String(input.projectType || '').toUpperCase();
    if (!country || !d.network) return result('BLOCKED', { reason: 'PROJECT_COUNTRY_OR_NETWORK_UNAVAILABLE' });
    if (type === 'EXISTING_PROJECT') {
      var existing = projectInCountry(country, input.existingProjectId);
      if (!existing || !['UNDER_CONSTRUCTION', 'COMPLETED'].includes(String(existing.status || '').toUpperCase()))
        return result('BLOCKED', { reason: 'EXISTING_PROJECT_NOT_ELIGIBLE' });
      var existingCost = num(existing.costUsd);
      if (existingCost === null || existingCost <= 0)
        return result('BLOCKED', { reason: 'EXISTING_PROJECT_USD_CAPEX_EVIDENCE_UNAVAILABLE',
          note: 'GAME_CURRENCY_UNITS are not converted or relabelled as USD.' });
      var contribution = num(input.costUsd || input.amountUsd);
      if (contribution === null || contribution <= 0 || contribution > existingCost * 0.25 + 1e-7)
        return result('BLOCKED', { reason: 'EXISTING_PROJECT_RECAPITALIZATION_LIMIT',
          maximumUsd: round(existingCost * 0.25, 2), referenceProjectCapexUsd: existingCost });
      return result('QUOTED', { countryId: country, projectType: type, projectId: existing.projectId,
        projectCostUsd: contribution, referenceProjectCapexUsd: existingCost,
        constructionDays: num(existing.durationDays), existingProject: true,
        effect: 'RESTRICTED_CAPITAL_RELEASED_TO_HOST_TREASURY_AS_PROJECT_WORKING_CAPITAL; NO_NEW_ASSET_OR_CAPACITY_CREATED',
        authority: 'EXISTING_RESOURCE_INDUSTRIAL_NETWORK_PROJECT_RECORD' });
    }
    if (type === 'MINE') {
      var site = siteRecord(country, input.siteId);
      if (!site) return result('BLOCKED', { reason: 'CANONICAL_MINE_SITE_NOT_FOUND', siteId: input.siteId || null });
      if (typeof d.network.quoteMineProject !== 'function') return result('BLOCKED', { reason: 'MINE_PROJECT_QUOTE_API_UNAVAILABLE' });
      var mineQuote;
      try {
        mineQuote = d.network.quoteMineProject({ countryId: country, siteId: input.siteId,
          resourceId: input.resourceId || site.resourceId, quantity: input.quantity || 1,
          assignedWorkers: num(input.assignedWorkers) });
      } catch (e) { return result('BLOCKED', { reason: 'MINE_PROJECT_QUOTE_FAILED', detail: String(e && e.message || e) }); }
      if (!mineQuote || mineQuote.status !== 'QUOTED') return result('BLOCKED', { reason: mineQuote && mineQuote.reason || 'MINE_PROJECT_QUOTE_UNAVAILABLE', quote: mineQuote || null });
      var mineCost = num(mineQuote.costUsd);
      if (mineCost === null || mineCost <= 0) return result('BLOCKED', { reason: 'MINE_PROJECT_CAPEX_UNAVAILABLE', quote: mineQuote });
      if (!mineQuote.materialsReady || !mineQuote.staffingReady || !mineQuote.commissioningReady)
        return result('BLOCKED', { reason: 'MINE_PROJECT_NOT_CONSTRUCTION_READY', quote: mineQuote });
      return result('QUOTED', { countryId: country, projectType: type, projectCostUsd: mineCost,
        constructionDays: mineQuote.durationDays, workersRequired: mineQuote.workersRequired,
        materials: clone(mineQuote.materials || []), quote: clone(mineQuote),
        costAuthority: 'EXISTING_MINE_CONSTRUCTION_QUOTE_GAMEPLAY_ESTIMATE_NOT_REAL_VENDOR_PRICE',
        authority: 'CANONICAL_MINE_CONSTRUCTION_QUOTE' });
    }
    if (type === 'FACTORY') {
      var catalog = currentCatalog(), profiles = catalog.factoryProfiles || {};
      var factoryType = String(input.factoryType || '').trim().toUpperCase(), profile = profiles[factoryType];
      if (!profile) return result('BLOCKED', { reason: 'CANONICAL_FACTORY_TYPE_NOT_FOUND', factoryType: factoryType || null });
      var contributionUsd = num(input.costUsd || input.projectFundingUsd || input.amountUsd);
      if (contributionUsd === null || contributionUsd <= 0)
        return result('BLOCKED', { reason: 'EXPLICIT_GOVERNMENT_FACTORY_CONTRIBUTION_USD_REQUIRED',
          catalogConstructionCost: num(profile.constructionCost), catalogCostUnit: profile.unit || 'UNKNOWN' });
      if (typeof d.network.factoryConstructionMaterialQuote !== 'function') return result('BLOCKED', { reason: 'FACTORY_CONSTRUCTION_BOM_API_UNAVAILABLE' });
      var bom;
      try { bom = d.network.factoryConstructionMaterialQuote(country, profile); }
      catch (e) { return result('BLOCKED', { reason: 'FACTORY_CONSTRUCTION_BOM_QUOTE_FAILED', detail: String(e && e.message || e) }); }
      if (!bom || bom.status !== 'QUOTED' || !Array.isArray(bom.materials) || bom.materials.some(function (x) { return x.sufficient !== true; }))
        return result('BLOCKED', { reason: 'FACTORY_CONSTRUCTION_MATERIALS_NOT_READY', quote: bom || null });
      return result('QUOTED', { countryId: country, projectType: type, factoryType: factoryType,
        recipeId: input.recipeId || profile.defaultRecipeId || null, projectCostUsd: round(contributionUsd, 2),
        factoryCatalogConstructionCost: num(profile.constructionCost),
        factoryCatalogCostUnit: String(profile.unit || 'UNKNOWN'),
        constructionDays: num(input.buildDays) || num(profile.constructionDays), materials: clone(bom.materials),
        fundingBasis: 'GOVERNMENT_CONTRIBUTION_USD; CATALOG_CONSTRUCTION_COST_REMAINS_IN_ITS_DECLARED_GAME_UNIT; NO_FX_EQUIVALENCE_ASSUMED',
        quote: clone(bom), authority: 'CANONICAL_FACTORY_PROFILE_AND_CONSTRUCTION_BOM' });
    }
    if (type === 'INFRASTRUCTURE') {
      var infrastructureType = String(input.infrastructureType || '').trim().toLowerCase();
      var distanceKm = num(input.distanceKm), capacity = num(input.capacityPerDay);
      var infrastructureCost = num(input.costUsd || input.projectFundingUsd || input.amountUsd);
      if (!infrastructureType || distanceKm === null || distanceKm < 0 || capacity === null || capacity <= 0 ||
          infrastructureCost === null || infrastructureCost <= 0)
        return result('BLOCKED', { reason: 'INFRASTRUCTURE_PROJECT_SCOPE_OR_COST_INVALID' });
      return result('QUOTED', { countryId: country, projectType: type, infrastructureType: infrastructureType,
        projectCostUsd: round(infrastructureCost, 2), constructionDays: num(input.buildDays) || null,
        capacityPerDay: capacity, distanceKm: distanceKm, costAuthority: 'PLAYER_CONFIGURED_SIMULATION_PROJECT_BUDGET',
        authority: 'EXISTING_INFRASTRUCTURE_PROJECT_API_WITH_EXPLICIT_BUDGET' });
    }
    return result('BLOCKED', { reason: 'GOVERNMENT_INVESTMENT_SECTOR_NOT_SUPPORTED',
      supportedProjectTypes: ['FACTORY', 'MINE', 'INFRASTRUCTURE', 'EXISTING_PROJECT'] });
  }
  function validateInstrument(input, domestic) {
    var instrument = String(input.instrument || (domestic ? 'DOMESTIC_PUBLIC_CAPEX' : 'EQUITY')).toUpperCase();
    if (domestic && instrument !== 'DOMESTIC_PUBLIC_CAPEX') return { ok: false, reason: 'DOMESTIC_INVESTMENT_MUST_USE_PUBLIC_CAPEX_INSTRUMENT' };
    if (!domestic && instrument === 'DOMESTIC_PUBLIC_CAPEX') return { ok: false, reason: 'DOMESTIC_PUBLIC_CAPEX_CANNOT_CROSS_BORDERS' };
    if (!['EQUITY', 'JOINT_VENTURE', 'LOAN', 'GRANT', 'DOMESTIC_PUBLIC_CAPEX'].includes(instrument))
      return { ok: false, reason: 'INVESTMENT_INSTRUMENT_INVALID' };
    var duration = num(input.durationYears);
    if (instrument === 'GRANT' || instrument === 'DOMESTIC_PUBLIC_CAPEX') duration = 0;
    else if (duration === null || !Number.isInteger(duration) || duration < 1 || duration > 30)
      return { ok: false, reason: 'INVESTMENT_DURATION_OUT_OF_RANGE', minimumYears: 1, maximumYears: 30 };
    var share = num(input.equityShareBps);
    if (instrument === 'EQUITY' || instrument === 'JOINT_VENTURE') {
      if (share === null) share = instrument === 'JOINT_VENTURE' ? 3000 : 2000;
      if (!Number.isInteger(share) || share < 100 || share > 7500)
        return { ok: false, reason: 'EQUITY_SHARE_OUT_OF_RANGE', minimumBps: 100, maximumBps: 7500 };
    } else share = 0;
    var rate = num(input.annualInterestRateBps), grace = num(input.gracePeriodYears);
    if (instrument === 'LOAN') {
      if (rate === null) rate = 500;
      if (!Number.isInteger(rate) || rate < 0 || rate > 2000)
        return { ok: false, reason: 'LOAN_INTEREST_RATE_OUT_OF_RANGE', maximumBps: 2000 };
      if (grace === null) grace = 0;
      if (!Number.isInteger(grace) || grace < 0 || grace > 5 || grace >= duration)
        return { ok: false, reason: 'LOAN_GRACE_PERIOD_INVALID' };
    } else { rate = 0; grace = 0; }
    return { ok: true, instrument: instrument, durationYears: duration,
      equityShareBps: share, annualInterestRateBps: rate, gracePeriodYears: grace };
  }
  function proposalFingerprint(p) {
    return JSON.stringify({ investorCountryId: p.investorCountryId, hostCountryId: p.hostCountryId,
      amountUsd: p.amountUsd, instrument: p.instrument, durationYears: p.durationYears,
      equityShareBps: p.equityShareBps, annualInterestRateBps: p.annualInterestRateBps,
      projectType: p.projectType, existingProjectId: p.existingProjectId || null,
      factoryType: p.factoryType || null, siteId: p.siteId || null, resourceId: p.resourceId || null,
      quantity: num(p.quantity) || 1, assignedWorkers: num(p.assignedWorkers),
      infrastructureType: p.infrastructureType || null, distanceKm: num(p.distanceKm), capacityPerDay: num(p.capacityPerDay) });
  }
  function getProposal(country, proposalId) {
    var root = countryFinanceRoot(country), inv = root && investmentRoot(root, false);
    var proposal = inv && Array.isArray(inv.proposals) ? inv.proposals.find(function (x) { return x && x.proposalId === proposalId; }) || null : null;
    return proposal ? clone(proposal) : null;
  }
  function storeProposal(country, proposal, direction) {
    var d = dependencies();
    var response = dispatch(d, HANDLERS.create, country,
      { countryId: country, proposal: clone(proposal), direction: direction }, proposal.proposalId);
    return response.ok ? result(response.result.status || 'CREATED', { proposalId: proposal.proposalId, duplicate: response.duplicate }) :
      result('BLOCKED', { reason: response.reason, detail: response.result });
  }
  function updateProposalRecord(country, proposalId, patch) {
    var d = dependencies();
    return dispatch(d, HANDLERS.updateProposal, country, { countryId: country, proposalId: proposalId, patch: clone(patch || {}) }, proposalId);
  }
  function persistProposalEverywhere(proposal, patch) {
    Object.assign(proposal, clone(patch || {}));
    var host = updateProposalRecord(proposal.hostCountryId, proposal.proposalId, patch);
    if (!host.ok) return { ok: false, reason: host.reason, stage: 'HOST_PROPOSAL_UPDATE' };
    if (proposal.investorCountryId !== proposal.hostCountryId) {
      var investor = updateProposalRecord(proposal.investorCountryId, proposal.proposalId, patch);
      if (!investor.ok) return { ok: false, reason: investor.reason, stage: 'INVESTOR_PROPOSAL_UPDATE' };
    }
    return { ok: true };
  }
  function debtRatioFor(country, deps) {
    try {
      var indicators = deps.finance && typeof deps.finance.getIndicators === 'function' ? deps.finance.getIndicators(country) : null;
      return num(indicators && (indicators.publicDebtToGdpPct || indicators.debtToGdpPct));
    } catch (_) { return null; }
  }
  function npcHostDecision(proposal) {
    var d = dependencies(), hostDebt = debtRatioFor(proposal.hostCountryId, d);
    var hostProfile = null;
    try { hostProfile = d.finance && d.finance.resolveCountry(proposal.hostCountryId); } catch (_) {}
    var hostGdp = num(hostProfile && (hostProfile.gdpCurrentUsd || hostProfile.gdpUsd || hostProfile.gdp));
    if (hostGdp === null) {
      var indicators = null;
      try { indicators = d.finance && d.finance.getIndicators(proposal.hostCountryId); } catch (_) {}
      hostGdp = num(indicators && indicators.gdpCurrentUsd);
    }
    if (hostGdp !== null && proposal.amountUsd > hostGdp * 0.10)
      return { decision: 'DECLINE', reason: 'FOREIGN_GOVERNMENT_EXPOSURE_EXCEEDS_TEN_PERCENT_OF_HOST_GDP', hostDebtToGdpPct: hostDebt, hostGdpUsd: hostGdp };
    if (proposal.instrument === 'LOAN' && hostDebt !== null && hostDebt > 120)
      return { decision: 'DECLINE', reason: 'HOST_SOVEREIGN_DEBT_RISK_LIMIT', hostDebtToGdpPct: hostDebt, hostGdpUsd: hostGdp };
    if (hostDebt !== null && hostDebt > 180 && proposal.instrument !== 'GRANT')
      return { decision: 'DECLINE', reason: 'HOST_SOVEREIGN_DEBT_RISK_LIMIT', hostDebtToGdpPct: hostDebt, hostGdpUsd: hostGdp };
    if (hostGdp === null || hostDebt === null)
      return { decision: 'REVIEW', reason: 'HOST_MACRO_RISK_EVIDENCE_UNOBSERVED', hostDebtToGdpPct: hostDebt, hostGdpUsd: hostGdp };
    return { decision: 'ACCEPT', reason: 'PROJECT_READINESS_AND_SOVEREIGN_EXPOSURE_LIMITS_PASSED',
      hostDebtToGdpPct: hostDebt, hostGdpUsd: hostGdp };
  }
  async function submitProposal(input) {
    input = input || {};
    try { if (!ready) await init(); } catch (e) { return result('WAITING', { reason: String(e && e.message || e) }); }
    var d = dependencies(), investor = canonicalCountry(input.investorCountryId || playerCountry()),
      host = canonicalCountry(input.hostCountryId), actorType = String(input.actorType || 'PLAYER').toUpperCase(),
      projectType = code(input.projectType);
    if (!investor || !host) return result('BLOCKED', { reason: 'VALID_ISO3_INVESTOR_AND_HOST_COUNTRIES_REQUIRED' });
    if (actorType === 'PLAYER' && investor !== playerCountry()) return result('BLOCKED', { reason: 'PLAYER_INVESTOR_COUNTRY_SCOPE_VIOLATION' });
    if (!['PLAYER', 'NPC'].includes(actorType)) return result('BLOCKED', { reason: 'PROPOSAL_ACTOR_INVALID' });
    if (actorType === 'NPC' && input.__omegaNpcDecisionAuthority !== AUTHORITY)
      return result('BLOCKED', { reason: 'NPC_INVESTMENT_ENGINE_AUTHORITY_REQUIRED' });
    var requestId = String(input.requestId || '').trim();
    if (!/^[A-Z0-9:_-]{6,140}$/i.test(requestId)) return result('BLOCKED', { reason: 'GOVERNMENT_INVESTMENT_REQUEST_ID_INVALID' });
    var domestic = investor === host;
    var instrument = validateInstrument(input, domestic);
    if (!instrument.ok) return result('BLOCKED', { reason: instrument.reason, detail: instrument });
    var investorFx = currencyFor(investor, d), hostFx = currencyFor(host, d);
    if (investorFx.status !== 'READY' || hostFx.status !== 'READY')
      return result('BLOCKED', { reason: 'CROSS_BORDER_FX_RATE_UNAVAILABLE', investorFx: investorFx, hostFx: hostFx });
    var amountLocal = num(input.amount), amountUsd = num(input.amountUsd);
    if (amountUsd === null && amountLocal !== null) amountUsd = amountLocal / investorFx.localPerUsd;
    if (amountLocal === null && amountUsd !== null) amountLocal = amountUsd * investorFx.localPerUsd;
    if (amountUsd === null || amountUsd <= 0 || amountUsd > 9e15 || Math.abs(amountUsd - round(amountUsd, 2)) > 1e-7)
      return result('BLOCKED', { reason: 'GOVERNMENT_INVESTMENT_AMOUNT_INVALID' });
    amountUsd = round(amountUsd, 2);
    amountLocal = round(amountLocal, 2);
    var budget = budgetFor(investor, d);
    if (budget.status !== 'READY') return result('BLOCKED', { reason: budget.reason || 'INVESTOR_TREASURY_UNAVAILABLE', budget: budget });
    if (amountUsd > budget.maximumPerProjectUsd + 1e-7)
      return result('BLOCKED', { reason: 'SOVEREIGN_INVESTMENT_CONCENTRATION_LIMIT',
        requestedUsd: amountUsd, maximumPerProjectUsd: budget.maximumPerProjectUsd, budget: budget });
    var projectQuote = null;
    if (projectType !== 'EXISTING_PROJECT') {
      projectQuote = quoteProject(Object.assign({}, input, { hostCountryId: host,
        projectType: projectType,
        costUsd: ['FACTORY', 'INFRASTRUCTURE'].includes(projectType) ? amountUsd : (input.costUsd || input.projectFundingUsd || input.costUsd) }));
      if (projectQuote.status !== 'QUOTED') return result('BLOCKED', { reason: projectQuote.reason, projectQuote: projectQuote });
      if (input.projectType === 'MINE') {
        if (amountUsd > projectQuote.projectCostUsd + 1e-7)
          return result('BLOCKED', { reason: 'MINE_CONTRIBUTION_EXCEEDS_PROJECT_CAPEX',
            maximumContributionUsd: projectQuote.projectCostUsd, projectQuote: projectQuote });
        var hostBudget = budgetFor(host, d);
        var combinedMineBudget = hostBudget.status !== 'READY' ? 0 : hostBudget.availableInvestmentBudgetUsd + (investor === host ? 0 : amountUsd);
        if (hostBudget.status !== 'READY' || combinedMineBudget + 1e-7 < projectQuote.projectCostUsd)
          return result('BLOCKED', { reason: 'HOST_TREASURY_AND_INVESTMENT_CANNOT_COVER_MINE_CAPEX',
            hostInvestmentBudgetUsd: hostBudget.availableInvestmentBudgetUsd || 0,
            investorContributionUsd: amountUsd, combinedFundingCapacityUsd: combinedMineBudget,
            requiredMineCapexUsd: projectQuote.projectCostUsd, projectQuote: projectQuote });
        projectQuote.hostTreasuryCoFundingUsd = round(projectQuote.projectCostUsd - amountUsd, 2);
      } else if (amountUsd + 1e-7 < projectQuote.projectCostUsd || Math.abs(amountUsd - projectQuote.projectCostUsd) > 0.01) {
        return result('BLOCKED', { reason: 'INVESTMENT_MUST_MATCH_APPROVED_PROJECT_FUNDING',
          requestedUsd: amountUsd, requiredProjectFundingUsd: projectQuote.projectCostUsd, projectQuote: projectQuote });
      }
    } else {
      projectQuote = quoteProject({ hostCountryId: host, projectType: projectType, existingProjectId: input.existingProjectId, costUsd: amountUsd });
      if (projectQuote.status !== 'QUOTED') return result('BLOCKED', { reason: projectQuote.reason, projectQuote: projectQuote });
      if (amountUsd > projectQuote.projectCostUsd * 0.25 + 1e-7)
        return result('BLOCKED', { reason: 'EXISTING_PROJECT_RECAPITALIZATION_LIMIT', maximumUsd: projectQuote.projectCostUsd * 0.25 });
    }
    var transferId = 'GOVINV:' + investor + ':' + host + ':' + requestId;
    var proposalId = transferId + ':PROPOSAL';
    var existing = getProposal(investor, proposalId);
    if (existing) {
      var fingerprintCandidate = { investorCountryId: investor, hostCountryId: host, amountUsd: amountUsd,
        instrument: instrument.instrument, durationYears: instrument.durationYears,
        equityShareBps: instrument.equityShareBps, annualInterestRateBps: instrument.annualInterestRateBps,
        projectType: projectType, existingProjectId: input.existingProjectId || null,
        factoryType: code(input.factoryType) || null, siteId: input.siteId || null, resourceId: input.resourceId || null,
        quantity: num(input.quantity) || 1, assignedWorkers: num(input.assignedWorkers),
        infrastructureType: input.infrastructureType || null, distanceKm: num(input.distanceKm), capacityPerDay: num(input.capacityPerDay) };
      if (proposalFingerprint(existing) !== proposalFingerprint(fingerprintCandidate))
        return result('BLOCKED', { reason: 'GOVERNMENT_PROPOSAL_IDEMPOTENCY_COLLISION', proposalId: proposalId });
      return result(existing.status || 'PENDING_HOST_APPROVAL', { proposal: clone(existing), duplicate: true });
    }
    var proposal = {
      schemaVersion: 1, proposalId: proposalId, requestId: requestId, transferId: transferId,
      investorCountryId: investor, hostCountryId: host, investorActorType: actorType,
      amountUsd: amountUsd, investorAmountLocal: amountLocal, investorCurrencyCode: investorFx.currencyCode,
      hostAmountLocal: round(amountUsd * hostFx.localPerUsd, 2), hostCurrencyCode: hostFx.currencyCode,
      fxSnapshot: { investorLocalPerUsd: investorFx.localPerUsd, hostLocalPerUsd: hostFx.localPerUsd,
        investorCurrencyCode: investorFx.currencyCode, hostCurrencyCode: hostFx.currencyCode, turn: turn(), authority: 'OMEGA_FOREX_MONETARY_ENGINE' },
      instrument: instrument.instrument, durationYears: instrument.durationYears,
      domesticPublicCapex: instrument.instrument === 'DOMESTIC_PUBLIC_CAPEX',
      equityShareBps: instrument.equityShareBps, annualInterestRateBps: instrument.annualInterestRateBps,
      gracePeriodYears: instrument.gracePeriodYears, projectType: projectType,
      existingProjectId: input.existingProjectId || null, factoryType: code(input.factoryType) || null,
      recipeId: input.recipeId || projectQuote.recipeId || null, siteId: input.siteId || null,
      resourceId: input.resourceId || null, quantity: num(input.quantity) || 1,
      assignedWorkers: num(input.assignedWorkers), infrastructureType: input.infrastructureType || null,
      distanceKm: num(input.distanceKm), capacityPerDay: num(input.capacityPerDay),
      projectCostUsd: projectQuote.projectCostUsd, constructionDays: projectQuote.constructionDays,
      factoryCatalogConstructionCost: projectQuote.factoryCatalogConstructionCost || null,
      factoryCatalogCostUnit: projectQuote.factoryCatalogCostUnit || null,
      projectQuote: clone(projectQuote), projectDescription: String(input.projectDescription || ''),
      submittedTurn: turn(), updatedTurn: turn(), status: 'PENDING_HOST_APPROVAL',
      returnPolicy: 'NO_GUARANTEED_RETURN; EQUITY_DISTRIBUTIONS_REQUIRE_PROJECT_LINKED_REALIZED_NET_PROFIT',
      forecast: { expectedAnnualReturnUsd: null, expectedReturnPct: null, paybackYears: null,
        status: 'UNAVAILABLE_UNTIL_PROJECT_LEVEL_REALIZED_NET_PROFIT_IS_RECORDED' },
      authority: AUTHORITY
    };
    var hostStored = storeProposal(host, proposal, host === investor ? 'DOMESTIC' : 'INBOUND');
    if (hostStored.status === 'BLOCKED') return hostStored;
    if (host !== investor) {
      var investorStored = storeProposal(investor, proposal, 'OUTBOUND');
      if (investorStored.status === 'BLOCKED') return investorStored;
    }
    if (host !== playerCountry()) {
      var decision = npcHostDecision(proposal);
      if (decision.decision === 'ACCEPT' || decision.decision === 'DECLINE') {
        var resolved = await respondProposal({ hostCountryId: host, proposalId: proposalId,
          decision: decision.decision, actorType: 'NPC', __omegaNpcDecisionAuthority: AUTHORITY, reason: decision.reason });
        if (decision.decision === 'ACCEPT' && resolved.status === 'PROJECT_STARTED')
          return result('PROJECT_STARTED', { proposal: resolved.proposal, project: resolved.project, hostDecision: decision, budget: budget });
        if (decision.decision === 'DECLINE') return result('DECLINED', { proposal: getProposal(host, proposalId), hostDecision: decision });
        return resolved;
      }
      return result('PENDING_HOST_REVIEW', { proposal: getProposal(host, proposalId), hostDecision: decision, budget: budget });
    }
    if (host === investor) {
      var domestic = await respondProposal({ hostCountryId: host, proposalId: proposalId,
        decision: 'ACCEPT', actorType: actorType === 'NPC' ? 'NPC' : 'PLAYER',
        __omegaNpcDecisionAuthority: input.__omegaNpcDecisionAuthority, reason: 'DOMESTIC_PUBLIC_INVESTMENT' });
      return domestic;
    }
    return result('PENDING_HOST_APPROVAL', { proposal: getProposal(host, proposalId), budget: budget });
  }

  function createLoanRecord(proposal, projectId, principalUsd) {
    if (proposal.instrument !== 'LOAN') return null;
    var principal = num(principalUsd) || num(proposal.amountUsd);
    var quarters = Math.max(1, Math.round(proposal.durationYears * 4));
    var graceQuarters = Math.max(0, Math.round(proposal.gracePeriodYears * 4));
    return {
      loanId: proposal.proposalId + ':LOAN',
      proposalId: proposal.proposalId, transferId: proposal.transferId,
      projectId: projectId, investorCountryId: proposal.investorCountryId,
      hostCountryId: proposal.hostCountryId, originalPrincipalUsd: principal,
      principalOutstandingUsd: principal, annualInterestRateBps: proposal.annualInterestRateBps,
      durationYears: proposal.durationYears, gracePeriodYears: proposal.gracePeriodYears,
      paymentFrequencyDays: 90, totalInstallments: quarters,
      graceInstallmentsRemaining: graceQuarters, remainingInstallments: Math.max(1, quarters - graceQuarters),
      nextDueTurn: turn() + 90, status: 'ACTIVE', missedPayments: 0, installmentNumber: 0,
      currency: 'USD', createdTurn: turn(), authority: AUTHORITY
    };
  }
  function registerLoanPositions(proposal, projectId, principalUsd) {
    var loan = createLoanRecord(proposal, projectId, principalUsd);
    if (!loan) return { ok: true, status: 'NOT_APPLICABLE' };
    var d = dependencies();
    var borrower = dispatch(d, HANDLERS.registerLoan, proposal.hostCountryId,
      { hostCountryId: proposal.hostCountryId, investorCountryId: proposal.investorCountryId, ownerRole: 'BORROWER', loan: loan }, loan.loanId);
    if (!borrower.ok) return { ok: false, reason: borrower.reason, stage: 'BORROWER_LOAN_REGISTER' };
    if (proposal.investorCountryId !== proposal.hostCountryId) {
      var lender = dispatch(d, HANDLERS.registerLoan, proposal.investorCountryId,
        { hostCountryId: proposal.hostCountryId, investorCountryId: proposal.investorCountryId,
          ownerRole: 'LENDER', loan: loan }, loan.loanId);
      if (!lender.ok) return { ok: false, reason: lender.reason, stage: 'LENDER_LOAN_REGISTER' };
    }
    return { ok: true, loanId: loan.loanId };
  }
  async function startFundedProject(proposal) {
    var d = dependencies(), net = d.network, host = proposal.hostCountryId;
    var hostRoot = countryFinanceRoot(host), hostInvestment = hostRoot && investmentRoot(hostRoot, false);
    var receipt = hostInvestment && hostInvestment.receipts && hostInvestment.receipts[proposal.transferId];
    if (!receipt || receipt.status !== 'SETTLED') return result('BLOCKED', { reason: 'SETTLED_HOST_INVESTMENT_RECEIPT_REQUIRED' });
    if (proposal.projectType === 'EXISTING_PROJECT') {
      var existing = projectInCountry(host, proposal.existingProjectId);
      if (!existing) return result('BLOCKED', { reason: 'EXISTING_PROJECT_DISAPPEARED' });
      var contribution = Math.min(proposal.amountUsd, num(receipt.remainingUsd) || 0);
      var recap = dispatch(d, HANDLERS.recapitalize, host, { hostCountryId: host,
        investorCountryId: proposal.investorCountryId, transferId: proposal.transferId,
        projectId: existing.projectId, proposalId: proposal.proposalId, amountUsd: contribution,
        equityShareBps: proposal.equityShareBps, durationYears: proposal.durationYears }, proposal.transferId);
      if (!recap.ok) return result('RECONCILIATION_REQUIRED', { reason: recap.reason, projectId: existing.projectId });
      proposal.projectId = existing.projectId;
      proposal.projectCostUsd = contribution;
      proposal.capitalAppliedUsd = contribution;
      proposal.status = 'PROJECT_STARTED';
      proposal.updatedTurn = turn();
      return result('PROJECT_STARTED', { project: clone(existing), recapitalized: true,
        projectEffect: 'PROJECT_LINKED_WORKING_CAPITAL_EARMARKED; EXISTING OUTPUT_NOT_ASSUMED_TO_INCREASE' });
    }
    if (proposal.projectType === 'MINE') {
      if (typeof net.startMineProject !== 'function') return result('BLOCKED', { reason: 'MINE_CONSTRUCTION_API_UNAVAILABLE' });
      var quote = net.quoteMineProject({ countryId: host, siteId: proposal.siteId, resourceId: proposal.resourceId,
        quantity: proposal.quantity, assignedWorkers: proposal.assignedWorkers });
      if (!quote || quote.status !== 'QUOTED' || !quote.materialsReady || !quote.staffingReady || !quote.commissioningReady)
        return result('BLOCKED', { reason: 'MINE_PROJECT_NOT_READY_AT_FUNDING', quote: quote || null });
      var mineCost = num(quote.costUsd), investorContribution = Math.min(num(proposal.amountUsd) || 0, num(receipt.remainingUsd) || 0);
      var hostCashBeforeMine = num(financeBucket(state(), host) && financeBucket(state(), host).available);
      if (mineCost === null || mineCost <= 0 || investorContribution <= 0 ||
          hostCashBeforeMine === null || hostCashBeforeMine + investorContribution + 1e-7 < mineCost)
        return result('BLOCKED', { reason: 'MINE_PROJECT_HOST_AND_INVESTOR_CAPITAL_INSUFFICIENT',
          requiredMineCapexUsd: mineCost, investorContributionUsd: investorContribution,
          hostTreasuryAvailableUsd: hostCashBeforeMine, restrictedEscrowUsd: receipt.remainingUsd });
      var releaseId = proposal.transferId + ':MINE:' + proposal.siteId;
      var release = dispatch(d, HANDLERS.releaseMine, host, { hostCountryId: host, proposalId: proposal.proposalId,
        transferId: proposal.transferId, releaseId: releaseId, projectId: 'MINE:' + host + ':' + proposal.siteId,
        amountUsd: investorContribution }, proposal.transferId);
      if (!release.ok) return result('BLOCKED', { reason: release.reason, stage: 'MINE_FUND_RELEASE' });
      var mine;
      try {
        mine = net.startMineProject({ countryId: host, siteId: proposal.siteId, resourceId: proposal.resourceId,
          quantity: proposal.quantity, assignedWorkers: proposal.assignedWorkers,
          requestId: 'GOVINV_BUILD:' + proposal.proposalId });
      } catch (e) { mine = { status: 'FAILED', reason: String(e && e.message || e) }; }
      if (!mine || mine.status !== 'UNDER_CONSTRUCTION') {
        var rollbackRelease = dispatch(d, HANDLERS.rollbackMine, host, { hostCountryId: host, releaseId: releaseId,
          projectId: 'MINE:' + host + ':' + proposal.siteId, proposalId: proposal.proposalId, amountUsd: mineCost }, releaseId);
        return result(rollbackRelease.ok ? 'BLOCKED' : 'RECONCILIATION_REQUIRED', {
          reason: mine && mine.reason || 'MINE_PROJECT_START_FAILED', stage: 'MINE_PROJECT_START',
          cashReversal: rollbackRelease.status, requiredManualReconciliation: !rollbackRelease.ok });
      }
      var capex = dispatch(d, HANDLERS.commitCapex, host, { hostCountryId: host, proposalId: proposal.proposalId,
        transferId: proposal.transferId, projectId: mine.projectId, amountUsd: investorContribution,
        equityShareBps: proposal.equityShareBps, durationYears: proposal.durationYears }, proposal.transferId);
      if (!capex.ok) return result('RECONCILIATION_REQUIRED', { reason: capex.reason, project: mine, stage: 'MINE_CAPEX_COMMIT' });
      proposal.projectId = mine.projectId; proposal.totalProjectCapexUsd = mineCost;
      proposal.projectCostUsd = mineCost; proposal.capitalAppliedUsd = investorContribution;
      proposal.hostTreasuryCoFundingUsd = round(mineCost - investorContribution, 2);
      proposal.constructionDays = quote.durationDays;
      proposal.status = 'PROJECT_STARTED'; proposal.updatedTurn = turn();
      var loanResult = registerLoanPositions(proposal, mine.projectId, investorContribution);
      if (!loanResult.ok) return result('RECONCILIATION_REQUIRED', { reason: loanResult.reason, stage: loanResult.stage, project: mine });
      return result('PROJECT_STARTED', { project: clone(mine), constructionDays: quote.durationDays,
        totalProjectCapexUsd: mineCost, investorContributionUsd: investorContribution,
        hostTreasuryCoFundingUsd: round(mineCost - investorContribution, 2),
        remainingEscrowUsd: capex.result.remainingUsd, loanId: loanResult.loanId || null });
    }
    if (proposal.projectType === 'FACTORY') {
      var catalog = currentCatalog(), profile = catalog.factoryProfiles && catalog.factoryProfiles[proposal.factoryType];
      if (!profile || typeof net.startFactoryProject !== 'function') return result('BLOCKED', { reason: 'CANONICAL_FACTORY_PROJECT_API_UNAVAILABLE' });
      var contribution = num(proposal.projectCostUsd);
      var constructionUnits = num(proposal.factoryCatalogConstructionCost);
      if (contribution === null || contribution <= 0 || constructionUnits === null || constructionUnits <= 0 ||
          (num(receipt.remainingUsd) || 0) + 1e-7 < contribution)
        return result('BLOCKED', { reason: 'FACTORY_PROJECT_FUNDING_OR_CATALOG_COST_UNAVAILABLE' });
      var bom = net.factoryConstructionMaterialQuote(host, profile);
      if (!bom || bom.status !== 'QUOTED' || !Array.isArray(bom.materials) || bom.materials.some(function (x) { return x.sufficient !== true; }))
        return result('BLOCKED', { reason: 'FACTORY_CONSTRUCTION_MATERIALS_CHANGED_BEFORE_FUNDING', quote: bom || null });
      var pendingId = 'PENDING_FACTORY:' + proposal.proposalId;
      var capexFactory = dispatch(d, HANDLERS.commitCapex, host, { hostCountryId: host,
        proposalId: proposal.proposalId, transferId: proposal.transferId, projectId: pendingId,
        amountUsd: contribution, equityShareBps: proposal.equityShareBps, durationYears: proposal.durationYears }, proposal.transferId);
      if (!capexFactory.ok) return result('BLOCKED', { reason: capexFactory.reason, stage: 'FACTORY_CAPEX_RESERVATION' });
      var factory;
      try {
        factory = net.startFactoryProject({ countryId: host, factoryType: proposal.factoryType,
          recipeId: proposal.recipeId, cost: constructionUnits, costUnit: proposal.factoryCatalogCostUnit || profile.unit,
          buildDays: proposal.constructionDays, requestId: 'GOVINV_BUILD:' + proposal.proposalId,
          ownerType: 'STATE_OWNED_ENTERPRISE', operatorType: 'STATE_ENTERPRISE_OPERATOR' });
      } catch (e2) { factory = { status: 'FAILED', reason: String(e2 && e2.message || e2) }; }
      if (!factory || factory.status !== 'UNDER_CONSTRUCTION') {
        var rollback = dispatch(d, HANDLERS.rollbackCapex, host, { hostCountryId: host,
          transferId: proposal.transferId, proposalId: proposal.proposalId, projectId: pendingId,
          capexTransactionId: proposal.transferId + ':CAPEX:' + pendingId, amountUsd: contribution }, proposal.transferId);
        return result(rollback.ok ? 'BLOCKED' : 'RECONCILIATION_REQUIRED', {
          reason: factory && factory.reason || 'FACTORY_PROJECT_START_FAILED', rollback: rollback.status });
      }
      var link = dispatch(d, HANDLERS.linkProject, host, { hostCountryId: host, transferId: proposal.transferId,
        pendingProjectId: pendingId, projectId: factory.projectId }, proposal.transferId);
      if (!link.ok) return result('RECONCILIATION_REQUIRED', { reason: link.reason, stage: 'FACTORY_PROJECT_LINK', project: factory });
      proposal.projectId = factory.projectId; proposal.projectCostUsd = contribution;
      proposal.capitalAppliedUsd = contribution; proposal.constructionDays = num(factory.durationDays);
      proposal.status = 'PROJECT_STARTED'; proposal.updatedTurn = turn();
      var factoryLoan = registerLoanPositions(proposal, factory.projectId, contribution);
      if (!factoryLoan.ok) return result('RECONCILIATION_REQUIRED', { reason: factoryLoan.reason, stage: factoryLoan.stage, project: factory });
      return result('PROJECT_STARTED', { project: clone(factory), constructionDays: factory.durationDays,
        governmentContributionUsd: contribution, factoryCatalogConstructionCost: constructionUnits,
        factoryCatalogCostUnit: proposal.factoryCatalogCostUnit, remainingEscrowUsd: capexFactory.result.remainingUsd,
        loanId: factoryLoan.loanId || null });
    }
    if (proposal.projectType === 'INFRASTRUCTURE') {
      if (typeof net.startInfrastructureProject !== 'function') return result('BLOCKED', { reason: 'INFRASTRUCTURE_PROJECT_API_UNAVAILABLE' });
      var infraCost = num(proposal.projectCostUsd);
      if (infraCost === null || infraCost <= 0 || (num(receipt.remainingUsd) || 0) + 1e-7 < infraCost)
        return result('BLOCKED', { reason: 'INFRASTRUCTURE_PROJECT_ESCROW_BELOW_CAPEX' });
      var pendingInfraId = 'PENDING_INFRA:' + proposal.proposalId;
      var infraCapex = dispatch(d, HANDLERS.commitCapex, host, { hostCountryId: host,
        proposalId: proposal.proposalId, transferId: proposal.transferId, projectId: pendingInfraId,
        amountUsd: infraCost, equityShareBps: proposal.equityShareBps, durationYears: proposal.durationYears }, proposal.transferId);
      if (!infraCapex.ok) return result('BLOCKED', { reason: infraCapex.reason });
      var infra;
      try {
        infra = net.startInfrastructureProject({ countryId: host, infrastructureType: proposal.infrastructureType,
          distanceKm: proposal.distanceKm, capacityPerDay: proposal.capacityPerDay,
          cost: infraCost, buildDays: proposal.constructionDays, requestId: 'GOVINV_BUILD:' + proposal.proposalId });
      } catch (e3) { infra = { status: 'FAILED', reason: String(e3 && e3.message || e3) }; }
      if (!infra || infra.status !== 'UNDER_CONSTRUCTION') {
        var rollbackInfra = dispatch(d, HANDLERS.rollbackCapex, host, { hostCountryId: host,
          transferId: proposal.transferId, proposalId: proposal.proposalId, projectId: pendingInfraId,
          capexTransactionId: proposal.transferId + ':CAPEX:' + pendingInfraId, amountUsd: infraCost }, proposal.transferId);
        return result(rollbackInfra.ok ? 'BLOCKED' : 'RECONCILIATION_REQUIRED', {
          reason: infra && infra.reason || 'INFRASTRUCTURE_PROJECT_START_FAILED', rollback: rollbackInfra.status });
      }
      var infraLink = dispatch(d, HANDLERS.linkProject, host, { hostCountryId: host, transferId: proposal.transferId,
        pendingProjectId: pendingInfraId, projectId: infra.projectId }, proposal.transferId);
      if (!infraLink.ok) return result('RECONCILIATION_REQUIRED', { reason: infraLink.reason, stage: 'INFRASTRUCTURE_PROJECT_LINK', project: infra });
      proposal.projectId = infra.projectId; proposal.projectCostUsd = infraCost;
      proposal.capitalAppliedUsd = infraCost; proposal.constructionDays = num(infra.durationDays);
      proposal.status = 'PROJECT_STARTED'; proposal.updatedTurn = turn();
      var infraLoan = registerLoanPositions(proposal, infra.projectId, infraCost);
      if (!infraLoan.ok) return result('RECONCILIATION_REQUIRED', { reason: infraLoan.reason, stage: infraLoan.stage, project: infra });
      return result('PROJECT_STARTED', { project: clone(infra), constructionDays: infra.durationDays,
        projectCostUsd: infraCost, remainingEscrowUsd: infraCapex.result.remainingUsd, loanId: infraLoan.loanId || null });
    }
    return result('BLOCKED', { reason: 'GOVERNMENT_PROJECT_TYPE_NOT_SUPPORTED' });
  }

  async function fundAndExecute(proposal) {
    var d = dependencies(), investor = proposal.investorCountryId, host = proposal.hostCountryId, transferId = proposal.transferId;
    var budget = budgetFor(investor, d);
    if (budget.status !== 'READY' || proposal.amountUsd > budget.maximumPerProjectUsd + 1e-7)
      return result('BLOCKED', { reason: 'SOVEREIGN_BUDGET_CHANGED_SINCE_PROPOSAL',
        currentBudget: budget, requestedUsd: proposal.amountUsd });
    var reserve = dispatch(d, HANDLERS.reserve, investor, { investorCountryId: investor, hostCountryId: host,
      proposalId: proposal.proposalId, transferId: transferId, amountUsd: proposal.amountUsd,
      investorCurrencyCode: proposal.investorCurrencyCode }, transferId);
    if (!reserve.ok) return result('BLOCKED', { reason: reserve.reason, stage: 'INVESTOR_TREASURY_RESERVATION', detail: reserve.result });
    var received = dispatch(d, HANDLERS.receive, host, { hostCountryId: host, investorCountryId: investor,
      proposalId: proposal.proposalId, transferId: transferId, amountUsd: proposal.amountUsd,
      instrument: proposal.instrument, hostCurrencyCode: proposal.hostCurrencyCode, fxSnapshot: proposal.fxSnapshot }, transferId);
    if (!received.ok) {
      var refund = dispatch(d, HANDLERS.refundCash, investor, { investorCountryId: investor,
        transferId: transferId, amountUsd: proposal.amountUsd }, transferId);
      return result(refund.ok ? 'REFUNDED' : 'RECONCILIATION_REQUIRED', {
        reason: received.reason, stage: 'HOST_RECEIPT', refundStatus: refund.status, transferId: transferId });
    }
    var settled = dispatch(d, HANDLERS.settle, investor, { investorCountryId: investor,
      hostCountryId: host, proposalId: proposal.proposalId, transferId: transferId }, transferId);
    if (!settled.ok) { pendingTransfers.add(transferId); return result('SETTLEMENT_PENDING', { reason: settled.reason, transferId: transferId, retryable: true }); }
    var confirmed = dispatch(d, HANDLERS.confirm, host, { hostCountryId: host,
      proposalId: proposal.proposalId, transferId: transferId }, transferId);
    if (!confirmed.ok) { pendingTransfers.add(transferId); return result('SETTLEMENT_PENDING', { reason: confirmed.reason, transferId: transferId, retryable: true }); }
    pendingTransfers.delete(transferId);
    var executed = await startFundedProject(proposal);
    if (executed.status !== 'PROJECT_STARTED') {
      var failurePatch = { status: 'FUNDED_AWAITING_PROJECT_RESOLUTION',
        projectFailure: { reason: executed.reason, status: executed.status, turn: turn(), stage: executed.stage || null },
        updatedTurn: turn() };
      var failedSave = persistProposalEverywhere(proposal, failurePatch);
      return result(failedSave.ok ? executed.status : 'RECONCILIATION_REQUIRED', {
        reason: executed.reason, stage: executed.stage || 'PROJECT_CREATION', proposal: clone(proposal),
        project: executed.project || null, transferId: transferId, proposalPersistence: failedSave });
    }
    var successPatch = { status: 'PROJECT_STARTED', projectId: proposal.projectId,
      projectCostUsd: proposal.projectCostUsd, capitalAppliedUsd: proposal.capitalAppliedUsd,
      constructionDays: proposal.constructionDays,
      project: { projectId: proposal.projectId, projectType: proposal.projectType,
        constructionDays: proposal.constructionDays, contributionUsd: proposal.capitalAppliedUsd },
      projectFailure: null, updatedTurn: turn() };
    var saved = persistProposalEverywhere(proposal, successPatch);
    if (!saved.ok) return result('RECONCILIATION_REQUIRED', { reason: saved.reason, stage: saved.stage,
      proposal: clone(proposal), project: executed.project, transferId: transferId });
    return result('PROJECT_STARTED', { proposal: clone(proposal), project: clone(executed.project),
      investment: { amountUsd: proposal.amountUsd, projectContributionUsd: proposal.capitalAppliedUsd,
        remainingEscrowUsd: round(proposal.amountUsd - (num(proposal.capitalAppliedUsd) || 0), 2),
        instrument: proposal.instrument, equityShareBps: proposal.equityShareBps,
        estimatedAnnualReturnUsd: null, estimatedPaybackYears: null,
        returnStatus: 'NO_GUARANTEED_RETURN; PROJECT_LEVEL_NET_PROFIT_EVIDENCE_REQUIRED',
        factoryCatalogConstructionCost: proposal.factoryCatalogConstructionCost || null,
        factoryCatalogCostUnit: proposal.factoryCatalogCostUnit || null } });
  }
  async function respondProposal(input) {
    input = input || {};
    try { if (!ready) await init(); } catch (e) { return result('WAITING', { reason: String(e && e.message || e) }); }
    var host = canonicalCountry(input.hostCountryId || playerCountry()), proposalId = String(input.proposalId || '');
    var actorType = String(input.actorType || 'PLAYER').toUpperCase(), decision = String(input.decision || '').toUpperCase();
    if (!host || !proposalId || !['ACCEPT', 'DECLINE'].includes(decision))
      return result('BLOCKED', { reason: 'HOST_DECISION_FIELDS_INVALID' });
    if (actorType === 'PLAYER' && host !== playerCountry()) return result('BLOCKED', { reason: 'PLAYER_HOST_COUNTRY_SCOPE_VIOLATION' });
    if (actorType === 'NPC' && input.__omegaNpcDecisionAuthority !== AUTHORITY)
      return result('BLOCKED', { reason: 'NPC_DECISION_ENGINE_AUTHORITY_REQUIRED' });
    if (!['PLAYER', 'NPC'].includes(actorType)) return result('BLOCKED', { reason: 'HOST_DECISION_ACTOR_INVALID' });
    var proposal = getProposal(host, proposalId);
    if (!proposal) return result('BLOCKED', { reason: 'INCOMING_GOVERNMENT_PROPOSAL_NOT_FOUND' });
    if (proposal.status === 'PROJECT_STARTED') return result('PROJECT_STARTED', { proposal: proposal, duplicate: true });
    if (proposal.status === 'DECLINED') return result('DECLINED', { proposal: proposal, duplicate: true });
    var d = dependencies();
    var recorded = dispatch(d, HANDLERS.decide, host, { hostCountryId: host, proposalId: proposalId,
      decision: decision, actorType: actorType, reason: input.reason || null }, proposalId);
    if (!recorded.ok) return result('BLOCKED', { reason: recorded.reason });
    if (decision === 'DECLINE') {
      var declined = persistProposalEverywhere(proposal, { status: 'DECLINED', updatedTurn: turn() });
      return result(declined.ok ? 'DECLINED' : 'RECONCILIATION_REQUIRED', {
        proposal: clone(proposal), persistence: declined });
    }
    proposal = getProposal(host, proposalId) || proposal;
    return fundAndExecute(proposal);
  }

  function refundInvestment(input) {
    input = input || {};
    var host = canonicalCountry(input.hostCountryId), investor = canonicalCountry(input.investorCountryId), proposalId = String(input.proposalId || '');
    if (!host || !investor || !proposalId) return result('BLOCKED', { reason: 'REFUND_FIELDS_INVALID' });
    if (host !== playerCountry() && String(input.actorType || '').toUpperCase() !== 'NPC') return result('BLOCKED', { reason: 'HOST_REFUND_AUTHORITY_REQUIRED' });
    var proposal = getProposal(host, proposalId), d = dependencies();
    if (!proposal || proposal.investorCountryId !== investor) return result('BLOCKED', { reason: 'REFUND_PROPOSAL_NOT_FOUND' });
    var root = countryFinanceRoot(host), inv = root && investmentRoot(root, false), receipt = inv && inv.receipts && inv.receipts[proposal.transferId];
    var amount = num(receipt && receipt.remainingUsd) || 0;
    if (amount <= 0) return result('DUPLICATE', { reason: 'NO_UNSPENT_INVESTMENT_ESCROW' });
    var hostRefund = dispatch(d, HANDLERS.refundReceipt, host, { hostCountryId: host, transferId: proposal.transferId,
      amountUsd: amount, refundRequestId: 'UNSPENT-' + turn() }, proposal.transferId);
    if (!hostRefund.ok) return result('RECONCILIATION_REQUIRED', { reason: hostRefund.reason, stage: 'HOST_REFUND' });
    var investorRefund = dispatch(d, HANDLERS.refundCash, investor, { investorCountryId: investor,
      transferId: proposal.transferId, amountUsd: amount }, proposal.transferId);
    if (!investorRefund.ok) return result('RECONCILIATION_REQUIRED', { reason: investorRefund.reason, stage: 'INVESTOR_REFUND' });
    var saved = persistProposalEverywhere(proposal, { remainingRefundedUsd: round((num(proposal.remainingRefundedUsd) || 0) + amount, 2),
      status: amount + 1e-7 >= (num(receipt.amountUsd) || 0) ? 'REFUNDED' : 'PARTIALLY_REFUNDED', updatedTurn: turn() });
    return result(saved.ok ? 'REFUNDED' : 'RECONCILIATION_REQUIRED', { amountUsd: amount, proposal: clone(proposal), persistence: saved });
  }
  function reconcileTransfer(input) {
    input = input || {};
    var proposalId = String(input.proposalId || ''), host = canonicalCountry(input.hostCountryId), investor = canonicalCountry(input.investorCountryId);
    if (!proposalId || !host || !investor) return result('BLOCKED', { reason: 'RECONCILIATION_FIELDS_INVALID' });
    var proposal = getProposal(host, proposalId);
    if (!proposal) return result('WAITING', { reason: 'HOST_PROPOSAL_NOT_FOUND' });
    var d = dependencies(), receiptRoot = countryFinanceRoot(host), receiptInv = receiptRoot && investmentRoot(receiptRoot, false);
    var receipt = receiptInv && receiptInv.receipts && receiptInv.receipts[proposal.transferId];
    var investorRoot = countryFinanceRoot(investor), investorInv = investorRoot && investmentRoot(investorRoot, false);
    var transfer = investorInv && investorInv.transfers && investorInv.transfers[proposal.transferId];
    if (!receipt && transfer && transfer.status === 'RESERVED') {
      var refunded = dispatch(d, HANDLERS.refundCash, investor, { investorCountryId: investor,
        transferId: proposal.transferId, amountUsd: transfer.amountUsd }, proposal.transferId);
      return refunded.ok ? result('REFUNDED', { transferId: proposal.transferId }) : result('RECONCILIATION_REQUIRED', { reason: refunded.reason });
    }
    if (!receipt || !transfer) return result('WAITING', { reason: 'TRANSFER_RECEIPT_OR_RESERVATION_NOT_FOUND' });
    if (receipt.status !== 'SETTLED') {
      var confirmed = dispatch(d, HANDLERS.confirm, host, { hostCountryId: host,
        proposalId: proposalId, transferId: proposal.transferId }, proposal.transferId);
      if (!confirmed.ok) return result('RECONCILIATION_REQUIRED', { reason: confirmed.reason });
    }
    if (transfer.status !== 'SETTLED') {
      var settled = dispatch(d, HANDLERS.settle, investor, { investorCountryId: investor,
        hostCountryId: host, proposalId: proposalId, transferId: proposal.transferId }, proposal.transferId);
      if (!settled.ok) return result('RECONCILIATION_REQUIRED', { reason: settled.reason });
    }
    return result('SETTLED', { proposalId: proposalId, transferId: proposal.transferId });
  }

  function serviceLoans(countryValue) {
    var host = canonicalCountry(countryValue || playerCountry());
    if (!host) return result('BLOCKED', { reason: 'LOAN_SERVICING_COUNTRY_INVALID' });
    var root = countryFinanceRoot(host), inv = root && investmentRoot(root, false);
    var loans = inv && Array.isArray(inv.loans) ? clone(inv.loans) : [];
    var d = dependencies(), paid = [], arrears = [], evaluated = 0;
    var due = loans.filter(function (loan) {
      return loan && loan.ownerRole !== 'LENDER' &&
        ['ACTIVE', 'IN_ARREARS', 'RECONCILIATION_REQUIRED'].includes(String(loan.status || '')) &&
        num(loan.nextDueTurn) !== null && loan.nextDueTurn <= turn();
    }).slice(0, 40);
    function persistLoan(loan, patch) {
      return dispatch(d, HANDLERS.updateLoan, host, { hostCountryId: host,
        investorCountryId: loan.investorCountryId, ownerRole: 'BORROWER', loanId: loan.loanId, patch: patch }, loan.loanId);
    }
    function persistLender(loan, patch) {
      return dispatch(d, HANDLERS.updateLoan, loan.investorCountryId, { hostCountryId: host,
        investorCountryId: loan.investorCountryId, ownerRole: 'LENDER', loanId: loan.loanId, patch: patch }, loan.loanId);
    }
    for (var i = 0; i < due.length; i++) {
      var loan = due[i], principal = Math.max(0, num(loan.principalOutstandingUsd) || 0);
      evaluated++;
      if (loan.pendingPayment) {
        var pending = loan.pendingPayment;
        var retryCredit = dispatch(d, HANDLERS.loanCredit, loan.investorCountryId, {
          investorCountryId: loan.investorCountryId, hostCountryId: host,
          paymentId: pending.paymentId, amountUsd: pending.amountUsd, projectId: loan.projectId,
          proposalId: loan.proposalId }, pending.paymentId);
        if (!retryCredit.ok) {
          arrears.push({ loanId: loan.loanId, paymentId: pending.paymentId, reason: retryCredit.reason, reconciliationRequired: true });
          continue;
        }
        var pendingPatch = clone(pending.loanPatch || {});
        pendingPatch.pendingPayment = null;
        pendingPatch.status = pendingPatch.principalOutstandingUsd <= 0.01 ? 'REPAID' : 'ACTIVE';
        var updatePending = persistLoan(loan, pendingPatch);
        if (!updatePending.ok) {
          arrears.push({ loanId: loan.loanId, paymentId: pending.paymentId, reason: updatePending.reason, reconciliationRequired: true });
          continue;
        }
        persistLender(loan, pendingPatch);
        paid.push({ loanId: loan.loanId, paymentId: pending.paymentId, amountUsd: pending.amountUsd,
          reconciled: true, remainingPrincipalUsd: pendingPatch.principalOutstandingUsd });
        continue;
      }
      if (principal <= 0.005) {
        persistLoan(loan, { status: 'REPAID', nextDueTurn: null });
        continue;
      }
      var rate = Math.max(0, num(loan.annualInterestRateBps) || 0) / 10000 / 4;
      var interest = round(principal * rate, 2), principalPayment = 0, payment = interest;
      var graceLeft = Math.max(0, num(loan.graceInstallmentsRemaining) || 0);
      var remaining = Math.max(1, num(loan.remainingInstallments) || 1);
      if (graceLeft > 0) {
        graceLeft -= 1;
      } else {
        var periodic = rate > 0 ? principal * rate / (1 - Math.pow(1 + rate, -remaining)) : principal / remaining;
        payment = round(periodic, 2);
        principalPayment = Math.min(principal, Math.max(0, round(payment - interest, 2)));
        payment = round(interest + principalPayment, 2);
        remaining = Math.max(0, remaining - 1);
      }
      var installmentNumber = (num(loan.installmentNumber) || 0) + 1;
      var paymentId = loan.loanId + ':PAYMENT:' + String(installmentNumber);
      var nextPrincipal = round(Math.max(0, principal - principalPayment), 2);
      var loanPatch = {
        principalOutstandingUsd: nextPrincipal, graceInstallmentsRemaining: graceLeft,
        remainingInstallments: remaining, installmentNumber: installmentNumber,
        totalInterestPaidUsd: round((num(loan.totalInterestPaidUsd) || 0) + interest, 2),
        totalPrincipalPaidUsd: round((num(loan.totalPrincipalPaidUsd) || 0) + principalPayment, 2),
        lastPaymentTurn: turn(), nextDueTurn: turn() + 90,
        status: nextPrincipal <= 0.01 ? 'REPAID' : 'ACTIVE',
        missedPayments: 0, pendingPayment: null
      };
      var debit = dispatch(d, HANDLERS.loanDebit, host, { hostCountryId: host, investorCountryId: loan.investorCountryId,
        paymentId: paymentId, amountUsd: payment, projectId: loan.projectId, proposalId: loan.proposalId }, paymentId);
      if (!debit.ok) {
        var arrearsPatch = { installmentNumber: installmentNumber, status: 'IN_ARREARS',
          missedPayments: (num(loan.missedPayments) || 0) + 1, lastFailedPaymentTurn: turn(), nextDueTurn: turn() + 90 };
        persistLoan(loan, arrearsPatch);
        arrears.push({ loanId: loan.loanId, amountDueUsd: payment, reason: debit.reason, missedPayments: arrearsPatch.missedPayments });
        continue;
      }
      var credit = dispatch(d, HANDLERS.loanCredit, loan.investorCountryId, { investorCountryId: loan.investorCountryId,
        hostCountryId: host, paymentId: paymentId, amountUsd: payment, projectId: loan.projectId, proposalId: loan.proposalId }, paymentId);
      if (!credit.ok) {
        var pendingPatch = { installmentNumber: installmentNumber, status: 'RECONCILIATION_REQUIRED',
          nextDueTurn: turn() + 30,
          pendingPayment: { paymentId: paymentId, amountUsd: payment, loanPatch: loanPatch } };
        persistLoan(loan, pendingPatch);
        arrears.push({ loanId: loan.loanId, amountDueUsd: payment, reason: credit.reason,
          paymentId: paymentId, reconciliationRequired: true });
        continue;
      }
      var updated = persistLoan(loan, loanPatch);
      if (!updated.ok) {
        arrears.push({ loanId: loan.loanId, amountDueUsd: payment, reason: updated.reason, paymentId: paymentId,
          reconciliationRequired: true });
        continue;
      }
      persistLender(loan, loanPatch);
      paid.push({ loanId: loan.loanId, paymentId: paymentId, amountUsd: payment,
        interestUsd: interest, principalUsd: principalPayment, remainingPrincipalUsd: nextPrincipal });
    }
    return result(arrears.length ? 'PARTIAL' : 'PROCESSED',
      { countryId: host, paid: paid, arrears: arrears, evaluated: evaluated });
  }

  function distributeProjectProfit(input) {
    input = input || {};
    var host = canonicalCountry(input.hostCountryId), investor = canonicalCountry(input.investorCountryId);
    var projectId = String(input.projectId || ''), sourceId = String(input.sourceTransactionId || '');
    if (!host || !investor || !projectId || !sourceId)
      return result('BLOCKED', { reason: 'PROJECT_PROFIT_FIELDS_REQUIRED' });
    var root = countryFinanceRoot(host), inv = root && investmentRoot(root, false);
    var positions = inv && Array.isArray(inv.investments) ? inv.investments : [];
    var position = positions.find(function (x) {
      return x && x.projectId === projectId && x.investorCountryId === investor && x.equityShareBps > 0;
    });
    if (!position) return result('BLOCKED', { reason: 'GOVERNMENT_EQUITY_POSITION_NOT_FOUND' });
    var rows = root && Array.isArray(root.ledger) ? root.ledger : [];
    var source = rows.find(function (x) { return x && x.transactionId === sourceId; });
    if (!source || String(source.status || '').toUpperCase() !== 'POSTED' ||
        String(source.projectId || '') !== projectId || num(source.distributableNetProfitUsd) === null ||
        num(source.distributableNetProfitUsd) <= 0)
      return result('BLOCKED', { reason: 'VERIFIED_PROJECT_DISTRIBUTABLE_NET_PROFIT_NOT_FOUND',
        evidencePolicy: 'Requires a posted Finance entry for this exact projectId with explicit distributableNetProfitUsd. Gross sales, gross margin and unverified estimates are not distributable profit.' });
    var share = position.equityShareBps / 10000;
    var amount = round(num(source.distributableNetProfitUsd) * share, 2);
    if (amount <= 0) return result('BLOCKED', { reason: 'DISTRIBUTABLE_RETURN_ROUNDED_TO_ZERO' });
    var distributionId = 'GOVINV:DISTRIBUTION:' + sourceId + ':' + investor;
    var d = dependencies();
    var debit = dispatch(d, HANDLERS.profitDebit, host, { hostCountryId: host, investorCountryId: investor,
      distributionId: distributionId, amountUsd: amount, projectId: projectId, proposalId: position.proposalId,
      sourceTransactionId: sourceId }, distributionId);
    if (!debit.ok) return result('BLOCKED', { reason: debit.reason });
    var credit = dispatch(d, HANDLERS.profitCredit, investor, { investorCountryId: investor, hostCountryId: host,
      distributionId: distributionId, amountUsd: amount, projectId: projectId, proposalId: position.proposalId,
      sourceTransactionId: sourceId }, distributionId);
    if (!credit.ok) return result('RECONCILIATION_REQUIRED', { reason: credit.reason, distributionId: distributionId });
    return result('DISTRIBUTED', { distributionId: distributionId, projectId: projectId, amountUsd: amount,
      equitySharePct: round(position.equityShareBps / 100, 2), sourceTransactionId: sourceId,
      realizedNetProfitEvidenceUsd: source.distributableNetProfitUsd });
  }

  async function runNpcDecisionCycle(input) {
    input = input || {};
    if (!ready) return result('WAITING', { reason: 'RUNTIME_NOT_READY' });
    var d = dependencies(), roster = [];
    try { roster = d.countries && typeof d.countries.listProfiles === 'function' ? d.countries.listProfiles() : []; } catch (_) {}
    roster = roster.map(function (p) {
      return { countryId: canonicalCountry(p.iso3 || p.countryCode), name: p.name };
    }).filter(function (p) { return p.countryId; });
    var resources = d.state.resource || {}, financeState = d.state.finance || {};
    var activeHosts = Object.keys(resources).filter(function (key) {
      var n = resources[key] && resources[key].industrialNetwork;
      return canonicalCountry(key) && n && Array.isArray(n.projects) && n.projects.some(function (p) {
        return p && String(p.status || '').toUpperCase() !== 'CANCELLED';
      });
    });
    Object.keys(financeState).forEach(function (key) {
      var country = canonicalCountry(key), root = financeBucket(d.state, country);
      var inv = root && root.omegaFinance && investmentRoot(root.omegaFinance, false);
      if (country && inv && Array.isArray(inv.proposals) &&
          inv.proposals.some(function (p) { return p && p.hostCountryId === country &&
            ['PENDING_HOST_APPROVAL', 'PENDING_HOST_REVIEW'].includes(p.status); }) &&
          activeHosts.indexOf(country) < 0) activeHosts.push(country);
    });
    activeHosts.sort();
    var hostLimit = Math.max(1, Math.min(NPC_HOSTS_PER_CYCLE,
      num(input.maxHostCountries) || NPC_HOSTS_PER_CYCLE));
    var hosts;
    if (Array.isArray(input.hostCountryIds)) {
      hosts = input.hostCountryIds.map(canonicalCountry).filter(Boolean).slice(0, hostLimit);
    } else {
      hosts = [];
      var playerHost = playerCountry();
      if (playerHost && activeHosts.includes(playerHost)) hosts.push(playerHost);
      var rotatingHosts = activeHosts.filter(function (x) { return x !== playerHost; });
      var hostStart = Math.floor(turn() / INTERVAL_TURNS) * Math.max(1, hostLimit - hosts.length) %
        Math.max(1, rotatingHosts.length);
      for (var h = 0; h < rotatingHosts.length && hosts.length < hostLimit; h++)
        hosts.push(rotatingHosts[(hostStart + h) % rotatingHosts.length]);
    }
    var investorLimit = Math.max(1, Math.min(NPC_INVESTORS_PER_CYCLE,
      num(input.maxInvestorCountries) || NPC_INVESTORS_PER_CYCLE));
    var start = Math.floor(turn() / INTERVAL_TURNS) * investorLimit % Math.max(1, roster.length);
    var investors = [];
    for (var i = 0; i < Math.min(investorLimit, roster.length); i++) {
      var candidate = roster[(start + i) % roster.length];
      if (candidate && candidate.countryId && candidate.countryId !== playerCountry() && !hosts.includes(candidate.countryId)) investors.push(candidate);
    }
    var pendingDecisions = [], candidates = [], rejected = [], accepted = [];
    var evaluated = 0, proposalLimit = 12;
    hosts.forEach(function (host) {
      serviceLoans(host);
      var hostRoot = countryFinanceRoot(host), hostInv = hostRoot && investmentRoot(hostRoot, false);
      var pending = hostInv && Array.isArray(hostInv.proposals) ? hostInv.proposals.filter(function (p) {
        return p && p.hostCountryId === host && p.investorCountryId !== host &&
          ['PENDING_HOST_APPROVAL', 'PENDING_HOST_REVIEW'].includes(p.status);
      }).slice(0, 2) : [];
      pending.forEach(function (p) { pendingDecisions.push({ hostCountryId: host, proposalId: p.proposalId, proposal: clone(p) }); });
      var bucket = resources[host] || {}, projects = bucket.industrialNetwork && bucket.industrialNetwork.projects || [];
      var eligible = projects.filter(function (p) {
        return p && p.projectId && ['UNDER_CONSTRUCTION', 'COMPLETED'].includes(String(p.status || '').toUpperCase()) &&
          num(p.costUsd) !== null && num(p.costUsd) > 0;
      }).sort(function (a, b) { return (num(b.costUsd) || 0) - (num(a.costUsd) || 0); }).slice(0, 2);
      var investments = hostInv && Array.isArray(hostInv.investments) ? hostInv.investments : [];
      var hostProposals = hostInv && Array.isArray(hostInv.proposals) ? hostInv.proposals : [];
      eligible.forEach(function (project) {
        var attached = investments.filter(function (x) { return x && x.projectId === project.projectId; });
        var totalEquity = attached.reduce(function (sum, x) { return sum + (num(x.equityShareBps) || 0); }, 0);
        if (totalEquity >= 7000) return;
        investors.forEach(function (investor) {
          if (investor.countryId === host || candidates.length >= proposalLimit) return;
          if (attached.some(function (x) { return x.investorCountryId === investor.countryId; })) return;
          if (hostProposals.some(function (p) {
            return p && p.investorCountryId === investor.countryId && p.projectId === project.projectId &&
              ['PENDING_HOST_APPROVAL', 'PENDING_HOST_REVIEW', 'APPROVED', 'PROJECT_STARTED', 'FUNDED_AWAITING_PROJECT_RESOLUTION'].includes(p.status);
          })) return;
          evaluated++;
          var budget = budgetFor(investor.countryId, d), projectCost = num(project.costUsd);
          if (budget.status !== 'READY' || projectCost === null || projectCost <= 0) return;
          var amountUsd = round(Math.min(budget.maximumPerProjectUsd, projectCost * 0.15), 2);
          if (amountUsd < 1000) return;
          var fx = currencyFor(investor.countryId, d);
          if (fx.status !== 'READY') return;
          var req = 'NPC' + turn() + ':' + investor.countryId + ':' + host + ':' +
            String(project.projectId).replace(/[^A-Z0-9:_-]/gi, '').slice(-45);
          candidates.push({
            investorCountryId: investor.countryId, hostCountryId: host, projectId: project.projectId,
            requestId: req, amountUsd: amountUsd, amount: round(amountUsd * fx.localPerUsd, 2),
            equityShareBps: Math.min(1500, Math.max(100, Math.round(amountUsd / projectCost * 10000)))
          });
        });
      });
    });
    var pendingResults = [];
    for (var pIndex = 0; pIndex < pendingDecisions.length; pIndex++) {
      var item = pendingDecisions[pIndex], decision = npcHostDecision(item.proposal);
      if (decision.decision === 'REVIEW') continue;
      var decisionResult = await respondProposal({
        hostCountryId: item.hostCountryId, proposalId: item.proposalId,
        decision: decision.decision, actorType: 'NPC',
        __omegaNpcDecisionAuthority: AUTHORITY, reason: decision.reason
      });
      pendingResults.push({ hostCountryId: item.hostCountryId, proposalId: item.proposalId,
        decision: decision.decision, status: decisionResult.status, reason: decision.reason });
    }
    var proposalResults = [];
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j];
      var submitted = await submitProposal({
        investorCountryId: c.investorCountryId, hostCountryId: c.hostCountryId,
        actorType: 'NPC', __omegaNpcDecisionAuthority: AUTHORITY,
        requestId: c.requestId, amountUsd: c.amountUsd, amount: c.amount,
        projectType: 'EXISTING_PROJECT', existingProjectId: c.projectId,
        instrument: 'EQUITY', durationYears: 5, equityShareBps: c.equityShareBps,
        projectDescription: 'Bounded sovereign co-investment screening of an existing public project'
      });
      if (['PENDING_HOST_APPROVAL', 'PENDING_HOST_REVIEW', 'PROJECT_STARTED'].includes(submitted.status))
        accepted.push({ investorCountryId: c.investorCountryId, hostCountryId: c.hostCountryId,
          projectId: c.projectId, status: submitted.status });
      else rejected.push({ investorCountryId: c.investorCountryId, hostCountryId: c.hostCountryId,
        projectId: c.projectId, status: submitted.status, reason: submitted.reason || null });
      proposalResults.push({ investorCountryId: c.investorCountryId, hostCountryId: c.hostCountryId,
        projectId: c.projectId, result: submitted.status });
    }
    npcCycleCount += 1;
    npcProposalCount += accepted.length;
    lastNpcCycleTurn = turn();
    return result('COMPLETED', {
      turn: turn(), investorsConsidered: investors.length, hostsConsidered: hosts.length,
      projectsAndProposalsEvaluated: evaluated, pendingHostDecisions: pendingResults,
      proposalsCreated: proposalResults.length, proposals: proposalResults, accepted: accepted, rejected: rejected,
      bounds: { intervalTurns: INTERVAL_TURNS, maxInvestorCountries: investorLimit,
        maxHostCountries: hostLimit, maxNewProposalsPerCycle: proposalLimit,
        maximumPendingHostReviewsPerHost: 2 }
    });
  }

  function getPortfolio(countryValue) {
    var country = canonicalCountry(countryValue || playerCountry());
    if (!country) return null;
    var root = countryFinanceRoot(country), inv = root && investmentRoot(root, false);
    var proposals = inv && Array.isArray(inv.proposals) ? clone(inv.proposals) : [];
    var outbound = proposals.filter(function (p) { return p && p.investorCountryId === country; });
    var inbound = proposals.filter(function (p) { return p && p.hostCountryId === country; });
    var projectRows = [], financeState = state().finance || {};
    Object.keys(financeState).forEach(function (hostKey) {
      var host = canonicalCountry(hostKey);
      if (!host) return;
      var hostBucket = financeBucket(state(), host);
      var hostRoot = hostBucket && hostBucket.omegaFinance;
      var hostInv = hostRoot && investmentRoot(hostRoot, false);
      var records = hostInv && Array.isArray(hostInv.investments) ? hostInv.investments : [];
      records.forEach(function (position) {
        if (!position || (position.investorCountryId !== country && host !== country)) return;
        var project = projectInCountry(host, position.projectId);
        projectRows.push({ hostCountryId: host, projectId: position.projectId,
          project: project ? clone(project) : null, position: clone(position),
          projectStatus: project && project.status || 'PROJECT_RECORD_NOT_LOADED' });
      });
    });
    var loans = inv && Array.isArray(inv.loans) ? clone(inv.loans) : [];
    return {
      countryId: country,
      inboundProposals: inbound.filter(function (p) { return ['PENDING_HOST_APPROVAL', 'PENDING_HOST_REVIEW'].includes(p.status); }),
      outboundProposals: outbound,
      investments: projectRows,
      loans: loans,
      restrictedFundsUsd: num(inv && inv.restrictedFundsUsd) || 0,
      investedCapitalUsd: num(inv && inv.investedCapitalUsd) || 0,
      outboundInvestedCapitalUsd: num(inv && inv.outboundInvestedCapitalUsd) || 0,
      capitalizedProjectCapitalUsd: num(inv && inv.capitalizedProjectCapitalUsd) || 0,
      projectWorkingCapitalUsd: clone(inv && inv.projectWorkingCapitalUsd || {}),
      receivedCapitalUsd: num(inv && inv.receivedCapitalUsd) || 0,
      ledger: clone((root && root.ledger || []).filter(function (x) {
        return String(x && x.type || '').indexOf('GOVERNMENT_') === 0;
      }).slice(-100))
    };
  }
  function getRiskSnapshot(countryValue) {
    var country = canonicalCountry(countryValue), d = dependencies();
    if (!country) return null;
    var indicators = null;
    try { indicators = d.finance && d.finance.getIndicators(country); } catch (_) {}
    var budget = budgetFor(country, d);
    var debt = num(indicators && (indicators.publicDebtToGdpPct || indicators.debtToGdpPct));
    var stability = num(indicators && indicators.economicStabilityIndex);
    return { countryId: country, riskStatus: debt === null ? 'PARTIALLY_UNOBSERVED' : debt > 150 ? 'HIGH' : debt > 100 ? 'ELEVATED' : 'OBSERVED_WITHIN_POLICY',
      publicDebtToGdpPct: debt, economicStabilityIndex: stability,
      availableInvestmentBudgetUsd: budget.availableInvestmentBudgetUsd,
      reservePolicyStatus: budget.policyStatus, fxStatus: currencyFor(country, d).status,
      returnForecastStatus: 'NOT_GUARANTEED; ACTUAL PROJECT CASHFLOW REQUIRED',
      authority: 'AVAILABLE_FINANCE_AND_MACRO_INDICATORS_ONLY' };
  }
  function diagnostics() {
    return { version: VERSION, authority: AUTHORITY, ready: ready, registered: registered,
      handlerCount: registered ? Object.keys(HANDLERS).length : 0, handlerTypes: Object.values(HANDLERS),
      activeCountryScope: 'COUNTRY_SCOPED_FINANCE_STATE_TRANSACTION',
      cashAuthority: 'Game.state.finance[ISO3].available',
      currencyAuthority: 'OMEGA_FOREX_MONETARY_ENGINE',
      projectAuthority: 'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
      projectTypes: ['FACTORY', 'MINE', 'INFRASTRUCTURE', 'EXISTING_PROJECT'],
      instruments: ['EQUITY', 'JOINT_VENTURE', 'LOAN', 'GRANT'],
      npcCycleIntervalTurns: INTERVAL_TURNS, npcInvestorsPerCycle: NPC_INVESTORS_PER_CYCLE,
      npcHostsPerCycle: NPC_HOSTS_PER_CYCLE, npcCyclesCompleted: npcCycleCount,
      npcProposalsCreated: npcProposalCount, lastNpcCycleTurn: lastNpcCycleTurn,
      pendingReconciliationCount: pendingTransfers.size,
      guaranteedReturn: false, syntheticProfit: false, syntheticJobs: false };
  }

  var API = Object.freeze({
    VERSION: VERSION, AUTHORITY: AUTHORITY, init: init,
    submitProposal: submitProposal, invest: submitProposal, respondProposal: respondProposal,
    refundInvestment: refundInvestment, reconcileTransfer: reconcileTransfer,
    quoteProject: quoteProject, getBudget: function (country) { return budgetFor(canonicalCountry(country || playerCountry())); },
    getRiskSnapshot: getRiskSnapshot, getPortfolio: getPortfolio,
    serviceLoans: serviceLoans, distributeProjectProfit: distributeProjectProfit,
    runNpcDecisionCycle: runNpcDecisionCycle, diagnostics: diagnostics,
    HANDLERS: clone(HANDLERS)
  });
  g.Omega = g.Omega || {};
  g.Omega.GovernmentInvestmentRuntimeV1 = API;
  g.OmegaGovernmentInvestmentRuntimeV1 = API;
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('OMEGA_READY', function () { init().catch(function (e) { lastError = String(e && e.message || e); }); });
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', function () {
      var current = turn(), player = playerCountry();
      if (!ready || !player) return;
      if (current > 0 && current % INTERVAL_TURNS === 0 && lastNpcCycleTurn !== current) {
        lastNpcCycleTurn = current;
        runNpcDecisionCycle({ maxInvestorCountries: NPC_INVESTORS_PER_CYCLE, maxHostCountries: NPC_HOSTS_PER_CYCLE })
          .catch(function (e) { lastError = String(e && e.message || e); });
      }
      serviceLoans(player);
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
