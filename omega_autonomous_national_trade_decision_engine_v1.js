/* OMEGA AUTONOMOUS NATIONAL TRADE DECISION ENGINE v1.0.0
 * Bounded national trade planner/orchestrator. Existing ministries remain authoritative.
 * No scheduler, market, inventory, FX, transport, contract or settlement authority is duplicated.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  var HANDLER_ID = 'omega.autonomous-national-trade-decision.country-runtime';
  var COMMAND_TYPE = 'OMEGA_AUTONOMOUS_NATIONAL_TRADE_CHECKPOINT';
  var RULES_URL = './omega_autonomous_national_trade_decision_rules_v1.json';
  var unregisterScheduler = null;
  var rulesPromise = null;
  var activeRules = null;
  var rulesStatus = 'NOT_LOADED';
  var commandRegistered = false;
  var runtimeStats = { visits: 0, skipped: 0, deferred: 0, planned: 0, marketSyncs: 0,
    proposals: 0, counteroffersEvaluated: 0, counteroffersAccepted: 0, counteroffersRejected: 0,
    checkpointFailures: 0, supplierScans: 0, errors: 0, lastCountryId: null, lastTurn: null, lastResult: null };

  function finite(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  function nonNegative(value) {
    var n = finite(value);
    return n === null ? null : Math.max(0, n);
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function token(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function id(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) if (seen[i][0] === value) return seen[i][1];
    var out = Array.isArray(value) ? [] : {};
    seen.push([value, out]);
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || typeof value[key] === 'function' || value[key] === undefined) return;
      out[key] = clone(value[key], seen);
    });
    return out;
  }
  function canonical(value) {
    var raw = value && typeof value === 'object'
      ? (value.iso3 || value.iso3Code || value.countryCode || value.countryId || value.code || value.id || value.name)
      : value;
    var direct = id(raw);
    if (/^[A-Z]{3}$/.test(direct)) return direct;
    var registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || g.Omega && g.Omega.CanonicalIdentity;
    try {
      var hit = registry && typeof registry.resolveCountry === 'function' ? registry.resolveCountry(raw) : null;
      var source = hit && hit.raw && hit.raw.raw || hit && hit.raw || hit || {};
      var iso = source.iso3 || source.iso3Code || hit && (hit.iso3 || hit.iso3Code);
      if (iso && /^[A-Z]{3}$/.test(id(iso))) return id(iso);
      if (hit && /^[A-Z]{3}$/.test(id(hit.id))) return id(hit.id);
    } catch (_) {}
    return direct;
  }
  function state() {
    return g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state ||
      g.Game && g.Game.state || g.gameState || {};
  }
  function turn(context) {
    var s = state();
    var value = finite(context && context.turn);
    if (value === null) value = finite(s.simulation && s.simulation.turn);
    if (value === null) value = finite(s.turn);
    if (value === null) value = finite(g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn);
    return value === null ? 0 : Math.max(0, Math.floor(value));
  }
  function bucket(countryId, domain) {
    var root = state()[domain], wanted = canonical(countryId);
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
    if (root[wanted] && typeof root[wanted] === 'object') return root[wanted];
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) if (canonical(keys[i]) === wanted) return root[keys[i]];
    return null;
  }
  function mapEntry(map, key) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return { found: false, value: null };
    if (Object.prototype.hasOwnProperty.call(map, key)) return { found: true, value: map[key] };
    var wanted = token(key), keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) if (token(keys[i]) === wanted) return { found: true, value: map[keys[i]] };
    return { found: false, value: null };
  }
  function rulesValid(input) {
    if (!input || input.schemaVersion !== VERSION || input.enabled !== true) return false;
    var limits = input.limits || {}, policy = input.policy || {}, scheduler = input.scheduler || {};
    return scheduler.existingSchedulerOnly === true &&
      Array.isArray(scheduler.tiers) && scheduler.tiers.indexOf('ACTIVE') >= 0 &&
      scheduler.tiers.indexOf('MACRO') >= 0 && scheduler.playerCountryAutomation === false &&
      finite(limits.maxResourceRows) >= 1 && finite(limits.maxResourceRows) <= 8 &&
      finite(limits.maxRelationshipCandidates) >= 1 && finite(limits.maxRelationshipCandidates) <= 16 &&
      finite(limits.maxCandidates) >= 1 && finite(limits.maxCandidates) <= 3 &&
      finite(limits.maxMarketIntelligenceSyncsPerCountryTurn) === 1 &&
      finite(limits.maxMarketSupplierScansPerCountryVisit) === 1 &&
      finite(limits.maxProposalsPerCountryTurn) === 1 &&
      finite(limits.maxCounterofferEvaluationsPerCountryTurn) === 1 &&
      finite(policy.targetCoverageDays) > 0 && finite(policy.exportReserveDays) > 0 &&
      finite(policy.deliveryIntervalDays) > 0 && finite(policy.maxPurchaseDays) >= policy.deliveryIntervalDays &&
      [12, 24, 60, 84, 120].indexOf(finite(policy.proposalDurationMonths)) >= 0 &&
      typeof input.autonomousProposals === 'boolean' &&
      typeof input.autonomousCounteroffers === 'boolean' &&
      typeof input.marketIntelligenceSyncEnabled === 'boolean' &&
      ((input.autonomousProposals === false && input.autonomousCounteroffers === false &&
        input.marketIntelligenceSyncEnabled === false) ||
       (input.autonomousProposals === true && input.autonomousCounteroffers === true &&
        input.marketIntelligenceSyncEnabled === true));
  }
  function prepare() {
    if (activeRules) return Promise.resolve({ status: 'READY' });
    if (rulesPromise) return rulesPromise;
    var supplied = g.__OmegaAutonomousNationalTradeDecisionRules;
    if (supplied && rulesValid(supplied)) {
      activeRules = clone(supplied);
      rulesStatus = 'READY';
      return Promise.resolve({ status: 'READY', source: 'INJECTED_RULES' });
    }
    if (typeof g.fetch !== 'function') {
      rulesStatus = 'UNAVAILABLE';
      return Promise.resolve({ status: rulesStatus, reason: 'FETCH_UNAVAILABLE' });
    }
    rulesStatus = 'LOADING';
    rulesPromise = g.fetch(RULES_URL, { cache: 'no-store' }).then(function (response) {
      if (!response || !response.ok) throw new Error('AUTONOMOUS_TRADE_RULES_NOT_AVAILABLE');
      return response.json();
    }).then(function (data) {
      if (!rulesValid(data)) throw new Error('AUTONOMOUS_TRADE_RULES_INVALID');
      activeRules = clone(data);
      rulesStatus = 'READY';
      return { status: 'READY', source: RULES_URL };
    }).catch(function (error) {
      rulesStatus = 'UNAVAILABLE';
      runtimeStats.errors++;
      return { status: rulesStatus, reason: String(error && error.message || error) };
    });
    return rulesPromise;
  }
  function interop() {
    return g.Omega && g.Omega.MinistryInteroperability || g.OmegaMinistryInteroperability || null;
  }
  function bilateral() {
    return g.Omega && g.Omega.BilateralTradeAgreementV1 || g.OmegaBilateralTradeAgreementV1 || null;
  }
  function market() { return g.Omega && g.Omega.GlobalMarket || g.OmegaGlobalMarket || null; }
  function globalTrade() { return g.Omega && g.Omega.GlobalTrade || g.OmegaGlobalTrade || null; }
  function playerCountryId() {
    var s = state();
    var candidates = [
      s.simulation && s.simulation.session && s.simulation.session.playerCountryId,
      g.Omega && g.Omega.Simulation && typeof g.Omega.Simulation.getPlayerCountryId === 'function'
        ? g.Omega.Simulation.getPlayerCountryId() : null,
      s.simulation && s.simulation.playerCountryId,
      s.session && s.session.playerCountryId,
      s.playerCountryId, s.playerCountryCode,
      g.Game && (g.Game.playerCountryId || g.Game.playerCountryCode || g.Game.playerCountry),
      g.OMEGA_PLAYER_COUNTRY_ID
    ];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = canonical(candidates[i]);
      if (/^[A-Z]{3}$/.test(candidate)) return candidate;
    }
    return null;
  }
  function makeCheckpoint(countryId) {
    return {
      schemaVersion: VERSION, countryId: countryId, revision: 0, lastProcessedTurn: -1,
      phase: 'PLAN', plan: null, candidateIndex: 0, nextDecisionTurn: 0,
      counterofferRetryById: {}, partnerExperience: {}, history: [],
      lastDecision: null, updatedTurn: null
    };
  }
  function currentCheckpoint(countryId) {
    var trade = bucket(countryId, 'trade') || {};
    var stored = trade.autonomousNationalTradeDecision;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) ||
        stored.schemaVersion !== VERSION || canonical(stored.countryId) !== canonical(countryId))
      return makeCheckpoint(countryId);
    var next = clone(stored);
    if (!next.partnerExperience || typeof next.partnerExperience !== 'object') next.partnerExperience = {};
    if (!next.counterofferRetryById || typeof next.counterofferRetryById !== 'object') next.counterofferRetryById = {};
    if (!Array.isArray(next.history)) next.history = [];
    return next;
  }
  function checkpointHandler(command, context) {
    var payload = command && command.payload || {};
    var cid = canonical(context && context.countryId);
    var next = payload.checkpoint;
    if (!cid || !next || typeof next !== 'object' || canonical(next.countryId) !== cid ||
        next.schemaVersion !== VERSION || !Number.isInteger(next.revision) ||
        !Number.isFinite(next.lastProcessedTurn))
      return { accepted: false, reason: 'AUTONOMOUS_TRADE_CHECKPOINT_SCOPE_OR_SCHEMA_INVALID' };
    var prior = context.stateTransaction.get('trade.autonomousNationalTradeDecision');
    if (prior && typeof prior === 'object') {
      var oldRevision = finite(prior.revision) || 0;
      var oldTurn = finite(prior.lastProcessedTurn) === null ? -1 : finite(prior.lastProcessedTurn);
      if (oldTurn > next.lastProcessedTurn || oldTurn === next.lastProcessedTurn && oldRevision >= next.revision)
        return { accepted: true, duplicate: true, noStateChangeAccepted: true };
    }
    context.stateTransaction.set('trade.autonomousNationalTradeDecision', clone(next));
    return { accepted: true, countryId: cid, revision: next.revision, lastProcessedTurn: next.lastProcessedTurn,
      stateMutationAuthority: 'OMEGA_MINISTRY_STATE_TRANSACTION' };
  }
  function persist(countryId, checkpoint, currentTurn) {
    var mesh = interop();
    if (!mesh || typeof mesh.dispatchCommand !== 'function') {
      runtimeStats.checkpointFailures++;
      return { accepted: false, reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    }
    checkpoint.countryId = canonical(countryId);
    checkpoint.lastProcessedTurn = currentTurn;
    checkpoint.updatedTurn = currentTurn;
    checkpoint.revision = (finite(checkpoint.revision) || 0) + 1;
    try {
      var result = mesh.dispatchCommand('trade', COMMAND_TYPE, countryId, { checkpoint: clone(checkpoint) }, {
        turn: currentTurn, commandType: COMMAND_TYPE,
        correlationId: COMMAND_TYPE + '-' + countryId + '-' + currentTurn + '-' + checkpoint.revision
      });
      var body = result && result.status === 'APPLIED' && result.result ? result.result : result;
      if (!body || body.accepted !== true) {
        runtimeStats.checkpointFailures++;
        return { accepted: false, reason: body && body.reason || result && result.reason || 'CHECKPOINT_WRITE_FAILED' };
      }
      return { accepted: true, revision: checkpoint.revision };
    } catch (error) {
      runtimeStats.checkpointFailures++;
      return { accepted: false, reason: String(error && error.message || error) };
    }
  }
  function evidenceNumber(row, key) {
    if (!row || !Object.prototype.hasOwnProperty.call(row, key)) return null;
    return finite(row[key]);
  }
  function demandRows(countryId) {
    var api = g.Omega && g.Omega.ResourceNationalDemandRuntime || g.OmegaResourceNationalDemandRuntime;
    if (!api || typeof api.evaluateDemand !== 'function') return [];
    var snapshot = null;
    try { snapshot = api.evaluateDemand(countryId); } catch (_) { return []; }
    if (!snapshot || !Array.isArray(snapshot.profiles) ||
        !['ACTIVE', 'PARTIAL'].includes(String(snapshot.status || '').toUpperCase())) return [];
    return snapshot.profiles.filter(function (row) {
      return row && typeof row === 'object' &&
        finite(row.demandPerDay) !== null && finite(row.demandPerDay) > 0 &&
        finite(row.spendableStockAfter) !== null &&
        finite(row.pendingImportQuantity) !== null &&
        finite(row.unresolvedImportRequestCount) !== null;
    }).sort(function (a, b) {
      function nationalNeedScore(row) {
        var daily = nonNegative(row.demandPerDay);
        var stock = nonNegative(row.spendableStockAfter);
        var inbound = nonNegative(row.pendingImportQuantity);
        if (daily === null || daily <= 0 || stock === null || inbound === null) return 0;
        var importGap = Math.max(0, daily * activeRules.policy.targetCoverageDays - stock - inbound);
        var exportable = Math.max(0, stock - daily * activeRules.policy.exportReserveDays);
        return Math.max(importGap, exportable) / Math.max(1, daily * activeRules.policy.targetCoverageDays);
      }
      return nationalNeedScore(b) - nationalNeedScore(a) ||
        (finite(b.priority) || 0) - (finite(a.priority) || 0) ||
        token(a.resourceId).localeCompare(token(b.resourceId));
    }).slice(0, activeRules.limits.maxResourceRows);
  }
  function relationEvidence(countryId, partnerId) {
    var ownForeign = bucket(countryId, 'foreign') || {};
    var partnerForeign = bucket(partnerId, 'foreign') || {};
    var own = mapEntry(ownForeign.relations, partnerId);
    var remote = mapEntry(partnerForeign.relations, countryId);
    var row = own.found ? own.value : remote.value;
    if (!row || typeof row !== 'object') return { status: 'UNKNOWN', relation: null, score: null };
    if (row.war_state === true || row.sanctions === true || row.tradeEmbargo === true)
      return { status: 'BLOCKED', relation: row, score: 0 };
    var trade = globalTrade(), score = null;
    try { if (trade && typeof trade.relationScore === 'function') score = finite(trade.relationScore(row)); } catch (_) {}
    if (score === null) {
      var values = ['overall', 'trade', 'trust', 'political'].map(function (key) {
        var n = finite(row[key]);
        return n === null ? null : clamp(n > 1 ? n / 100 : n, 0, 1);
      }).filter(function (n) { return n !== null; });
      if (values.length) score = values.reduce(function (sum, n) { return sum + n; }, 0) / values.length;
    }
    if (score === null) return { status: 'UNKNOWN', relation: row, score: null };
    score = clamp(score > 1 ? score / 100 : score, 0, 1);
    if (score < activeRules.policy.minimumRelationshipScore)
      return { status: 'BLOCKED', relation: row, score: score };
    return { status: 'KNOWN', relation: row, score: score };
  }
  function hasOpenProposalOrContract(countryId, partnerId, resourceId) {
    var api = bilateral();
    if (!api) return true;
    var proposals = api.getProposals(countryId) || {};
    var rows = (Array.isArray(proposals.outbox) ? proposals.outbox : [])
      .concat(Array.isArray(proposals.inbox) ? proposals.inbox : []);
    if (rows.some(function (row) {
      var status = id(row.status || row.inboxStatus);
      var relatedPartner = canonical(row.targetCountryId) === partnerId ||
        canonical(row.requestorCountryId) === partnerId;
      return relatedPartner && token(row.resourceId) === token(resourceId) &&
        ['PENDING', 'SENT', 'COUNTER', 'COUNTER_OFFERED', 'WAITING_DATA', 'ACCEPT_PENDING_RATIFICATION'].indexOf(status) >= 0;
    })) return true;
    var contracts = api.getContracts(countryId) || [];
    if (contracts.some(function (row) {
      return canonical(row.partnerCountryId) === partnerId && token(row.resourceId) === token(resourceId) &&
        ['ACTIVE', 'AT_RISK', 'RATIFICATION_PENDING'].indexOf(id(row.status)) >= 0;
    })) return true;
    return false;
  }
  function hasPendingImport(buyerId, sellerId, resourceId) {
    var trade = bucket(buyerId, 'trade') || {};
    var rows = Array.isArray(trade.importRequests) ? trade.importRequests : [];
    return rows.some(function (row) {
      return canonical(row.targetCountryId || row.sellerCountryId) === sellerId &&
        token(row.resourceId) === token(resourceId) &&
        ['SENT', 'COUNTER_OFFERED', 'ACCEPTED', 'SETTLEMENT_PREPARING', 'PENDING_SETTLEMENT', 'IN_TRANSIT'].indexOf(id(row.status)) >= 0;
    });
  }
  function bilateralHistory(checkpoint, countryId) {
    var api = bilateral();
    if (!api || typeof api.getContracts !== 'function') return;
    var contracts = api.getContracts(countryId) || [], byPartner = {};
    contracts.slice(-activeRules.limits.maxExperienceAgreements).forEach(function (row) {
      if (!row) return;
      var partner = canonical(row.partnerCountryId);
      if (!/^[A-Z]{3}$/.test(partner)) return;
      var completed = nonNegative(row.completedDeliveries), failed = nonNegative(row.failedDeliveries);
      if (completed === null && failed === null) return;
      var item = byPartner[partner] || { completedDeliveries: 0, failedDeliveries: 0, observedContracts: 0 };
      item.completedDeliveries += completed === null ? 0 : completed;
      item.failedDeliveries += failed === null ? 0 : failed;
      item.observedContracts++;
      byPartner[partner] = item;
    });
    var partners = Object.keys(byPartner);
    partners.forEach(function (partner) {
      var item = byPartner[partner], total = item.completedDeliveries + item.failedDeliveries;
      var prior = checkpoint.partnerExperience[partner] || {};
      var settled = null, balance = null;
      try {
        var result = api.getBilateralTradeBalance(countryId, partner);
        if (result && result.status === 'OBSERVED_SETTLEMENTS_ONLY') {
          settled = finite(result.settledTransactionCount);
          balance = finite(result.tradeBalance);
        }
      } catch (_) {}
      checkpoint.partnerExperience[partner] = {
        completedDeliveries: item.completedDeliveries,
        failedDeliveries: item.failedDeliveries,
        observedContracts: item.observedContracts,
        settledTransactions: settled === null ? finite(prior.settledTransactions) : settled,
        settledEvidenceStatus: settled === null ? (prior.settledEvidenceStatus || 'UNKNOWN') : 'KNOWN',
        reliability: total > 0 ? item.completedDeliveries / total : null,
        reliabilityStatus: total > 0 ? 'KNOWN' : 'UNKNOWN',
        bilateralBalance: balance,
        bilateralBalanceStatus: balance === null ? 'UNKNOWN' : 'KNOWN',
        updatedTurn: turn()
      };
    });
    var keys = Object.keys(checkpoint.partnerExperience);
    if (keys.length > activeRules.limits.maxExperiencePartners) {
      keys.sort(function (a, b) {
        return (finite(checkpoint.partnerExperience[a].updatedTurn) || 0) -
          (finite(checkpoint.partnerExperience[b].updatedTurn) || 0);
      });
      keys.slice(0, keys.length - activeRules.limits.maxExperiencePartners).forEach(function (key) {
        delete checkpoint.partnerExperience[key];
      });
    }
  }
  function partnerScore(checkpoint, partnerId) {
    var item = checkpoint.partnerExperience[partnerId];
    return item && item.reliabilityStatus === 'KNOWN' && finite(item.reliability) !== null
      ? finite(item.reliability) : null;
  }
  function candidateId(row) {
    return canonical(row && (row.countryId || row.iso3 || row.partnerCountryId));
  }
  function settlementUnitValue(buyer, seller, price) {
    var trade = globalTrade();
    if (!trade || typeof trade.settlementValues !== 'function') return null;
    try {
      var result = trade.settlementValues(buyer, seller, 1, price);
      return result ? finite(result.buyerValue) : null;
    } catch (_) { return null; }
  }
  function buildCandidates(countryId, checkpoint) {
    var demand = demandRows(countryId), marketApi = market(), tradeApi = globalTrade();
    if (!marketApi || typeof marketApi.executableLocalPrice !== 'function' ||
        typeof marketApi.suppliers !== 'function' || !tradeApi || typeof tradeApi.settlementValues !== 'function') return [];
    var candidates = [], policy = activeRules.policy;
    var foreign = bucket(countryId, 'foreign') || {};
    var relationMap = foreign.relations && typeof foreign.relations === 'object' ? foreign.relations : {};
    var partnerIds = Object.keys(relationMap).map(canonical).filter(function (partner) {
      return /^[A-Z]{3}$/.test(partner) && partner !== countryId;
    }).map(function (partner) {
      return { countryId: partner, relation: relationEvidence(countryId, partner) };
    }).filter(function (item) { return item.relation.status === 'KNOWN'; })
      .sort(function (a, b) { return b.relation.score - a.relation.score || a.countryId.localeCompare(b.countryId); })
      .slice(0, activeRules.limits.maxRelationshipCandidates);
    var knownPartners = {};
    partnerIds.forEach(function (item) { knownPartners[item.countryId] = item; });

    // GlobalMarket.suppliers() scans the country roster internally. Run it at most once
    // per planner visit, then retain only already-observed, trusted diplomatic partners.
    var importSupplierScanUsed = false;
    demand.forEach(function (row) {
      var rid = String(row.resourceId || '').trim();
      var daily = nonNegative(row.demandPerDay);
      var spendable = nonNegative(row.spendableStockAfter);
      var inbound = nonNegative(row.pendingImportQuantity);
      var unresolved = nonNegative(row.unresolvedImportRequestCount);
      if (!rid || daily === null || daily <= 0 || spendable === null || inbound === null || unresolved === null) return;
      if (unresolved > 0) return;
      var targetDays = policy.targetCoverageDays;
      var importGap = Math.max(0, daily * targetDays - spendable - inbound);
      if (importGap <= 1e-8 || importSupplierScanUsed) return;

      importSupplierScanUsed = true;
      runtimeStats.supplierScans++;
      var purchaseQty = Math.min(importGap, daily * policy.maxPurchaseDays);
      var suppliers = [];
      try { suppliers = marketApi.suppliers(rid, 0, countryId) || []; } catch (_) {}
      var rankedSuppliers = [];
      suppliers.forEach(function (supplier) {
        var partner = candidateId(supplier), available = nonNegative(supplier && supplier.available);
        var observedPartner = knownPartners[partner];
        if (!partner || partner === countryId || !observedPartner || available === null || available <= 0 ||
            hasOpenProposalOrContract(countryId, partner, rid) || hasPendingImport(countryId, partner, rid)) return;
        var price = finite(marketApi.executableLocalPrice(partner, rid));
        if (price === null || price <= 0) return;
        var qty = Math.min(purchaseQty, available, daily * policy.maxPurchaseDays);
        if (qty <= 0) return;
        var buyerCost = settlementUnitValue(countryId, partner, price);
        if (buyerCost === null || buyerCost <= 0) return;
        var reliability = partnerScore(checkpoint, partner);
        var urgency = clamp(importGap / Math.max(1, daily * targetDays), 0, 1);
        rankedSuppliers.push({
          direction: 'IMPORT', targetCountryId: partner, resourceId: rid, quantityPerDelivery: qty,
          unitPrice: price, expectedBuyerUnitCost: buyerCost, priceModel: 'MARKET_LINKED',
          relationshipScore: observedPartner.relation.score, reliability: reliability, source: 'NATIONAL_DEMAND_RUNTIME',
          priorityScore: urgency * 100 + observedPartner.relation.score * 10 +
            (reliability === null ? 0 : reliability * 5),
          evidence: { demand: 'KNOWN', spendableStock: 'KNOWN', pendingInbound: 'KNOWN',
            sellerSupply: 'GLOBAL_MARKET_SUPPLIERS', relationship: 'KNOWN',
            price: 'CLEARED_MARKET_PRICE', fx: 'KNOWN' }
        });
      });
      rankedSuppliers.sort(function (a, b) {
        return a.expectedBuyerUnitCost - b.expectedBuyerUnitCost ||
          b.priorityScore - a.priorityScore || a.targetCountryId.localeCompare(b.targetCountryId);
      });
      rankedSuppliers.slice(0, activeRules.limits.maxSupplierRows).forEach(function (candidate) {
        candidates.push(candidate);
      });
    });

    demand.forEach(function (row) {
      var rid = String(row.resourceId || '').trim();
      var daily = nonNegative(row.demandPerDay), spendable = nonNegative(row.spendableStockAfter);
      var unresolved = nonNegative(row.unresolvedImportRequestCount);
      if (!rid || daily === null || daily <= 0 || spendable === null || unresolved === null || unresolved > 0) return;
      var exportable = Math.max(0, spendable - daily * policy.exportReserveDays);
      if (exportable <= 1e-8) return;
      partnerIds.forEach(function (partnerRow) {
        var partner = partnerRow.countryId;
        if (hasOpenProposalOrContract(countryId, partner, rid) || hasPendingImport(partner, countryId, rid)) return;
        var remoteDemand = mapEntry(((bucket(partner, 'resource') || {}).demandRuntime || {}).byResource, rid);
        var need = remoteDemand.value;
        if (!need || typeof need !== 'object') return;
        var partnerDaily = nonNegative(need.demandPerDay);
        var partnerStock = nonNegative(need.spendableStockAfter);
        var partnerInbound = nonNegative(need.pendingImportQuantity);
        var partnerUnresolved = nonNegative(need.unresolvedImportRequestCount);
        if (partnerDaily === null || partnerDaily <= 0 || partnerStock === null ||
            partnerInbound === null || partnerUnresolved === null || partnerUnresolved > 0) return;
        var targetDays = policy.targetCoverageDays;
        var importNeed = Math.max(0, partnerDaily * targetDays - partnerStock - partnerInbound);
        if (importNeed <= 1e-8) return;
        var price = finite(marketApi.executableLocalPrice(countryId, rid));
        if (price === null || price <= 0) return;
        var qty = Math.min(exportable, importNeed, daily * policy.maxExportDeliveryDays);
        if (qty <= 0) return;
        var sellerValue = null;
        try {
          var settlement = tradeApi.settlementValues(partner, countryId, qty, price);
          sellerValue = settlement ? finite(settlement.sellerValue) : null;
        } catch (_) {}
        if (sellerValue === null || sellerValue <= 0) return;
        var reliability = partnerScore(checkpoint, partner);
        var urgency = clamp(importNeed / Math.max(1, partnerDaily * targetDays), 0, 1);
        candidates.push({
          direction: 'EXPORT', targetCountryId: partner, resourceId: rid, quantityPerDelivery: qty,
          unitPrice: price, expectedSellerValue: sellerValue, priceModel: 'MARKET_LINKED',
          relationshipScore: partnerRow.relation.score, reliability: reliability, source: 'PARTNER_DEMAND_RUNTIME',
          priorityScore: urgency * 100 + partnerRow.relation.score * 10 + (reliability === null ? 0 : reliability * 5),
          evidence: { exportableSurplus: 'KNOWN', partnerDemand: 'KNOWN', partnerInbound: 'KNOWN',
            relationship: 'KNOWN', price: 'CLEARED_MARKET_PRICE', fx: 'KNOWN' }
        });
      });
    });
    candidates.sort(function (a, b) {
      if (a.direction === b.direction && token(a.resourceId) === token(b.resourceId)) {
        if (a.direction === 'IMPORT') {
          return a.expectedBuyerUnitCost - b.expectedBuyerUnitCost ||
            b.priorityScore - a.priorityScore || a.targetCountryId.localeCompare(b.targetCountryId);
        }
        if (a.direction === 'EXPORT') {
          return b.expectedSellerValue - a.expectedSellerValue ||
            b.priorityScore - a.priorityScore || a.targetCountryId.localeCompare(b.targetCountryId);
        }
      }
      return b.priorityScore - a.priorityScore ||
        a.direction.localeCompare(b.direction) || a.targetCountryId.localeCompare(b.targetCountryId) ||
        token(a.resourceId).localeCompare(token(b.resourceId));
    });
    var unique = [], seen = {};
    candidates.forEach(function (candidate) {
      var key = candidate.direction + '|' + candidate.targetCountryId + '|' + token(candidate.resourceId);
      if (seen[key]) return;
      seen[key] = true;
      if (unique.length < activeRules.limits.maxCandidates) unique.push(candidate);
    });
    return unique;
  }
  function proposalPayload(candidate) {
    return {
      targetCountryId: candidate.targetCountryId,
      direction: candidate.direction,
      resourceId: candidate.resourceId,
      quantityPerDelivery: candidate.quantityPerDelivery,
      unitPrice: candidate.unitPrice,
      priceModel: 'MARKET_LINKED',
      marketAdjustmentPct: activeRules.policy.marketAdjustmentPct,
      durationMonths: activeRules.policy.proposalDurationMonths,
      intervalDays: activeRules.policy.deliveryIntervalDays,
      paymentSchedule: 'PER_DELIVERY_ON_SETTLEMENT',
      quantityTolerancePct: activeRules.policy.quantityTolerancePct,
      terminationPenaltyPct: activeRules.policy.terminationPenaltyPct
    };
  }
  function note(checkpoint, turnNumber, status, reason, candidate, detail) {
    checkpoint.lastDecision = {
      turn: turnNumber, status: status, reason: reason || null,
      direction: candidate && candidate.direction || null,
      targetCountryId: candidate && candidate.targetCountryId || null,
      resourceId: candidate && candidate.resourceId || null,
      detail: detail ? clone(detail) : null
    };
    checkpoint.history.push(clone(checkpoint.lastDecision));
    if (checkpoint.history.length > activeRules.limits.maxHistory) checkpoint.history.splice(0, checkpoint.history.length - activeRules.limits.maxHistory);
  }
  function advanceCandidate(checkpoint, turnNumber, reason, detail) {
    var plan = checkpoint.plan;
    var candidate = plan && plan.candidates && plan.candidates[checkpoint.candidateIndex] || null;
    note(checkpoint, turnNumber, 'HOLD', reason, candidate, detail);
    checkpoint.candidateIndex = (finite(checkpoint.candidateIndex) || 0) + 1;
    if (!plan || checkpoint.candidateIndex >= plan.candidates.length) {
      checkpoint.phase = 'PLAN';
      checkpoint.plan = null;
      checkpoint.candidateIndex = 0;
      checkpoint.nextDecisionTurn = turnNumber + activeRules.policy.decisionCooldownTurns;
    } else checkpoint.phase = 'MARKET_INTELLIGENCE';
  }
  function unwrap(result) {
    return result && result.status === 'APPLIED' && result.result ? result.result : result;
  }
  function syncMarket(countryId, targetId) {
    var api = bilateral();
    if (!api || typeof api.syncMarket !== 'function') return { accepted: false, reason: 'BILATERAL_MARKET_RUNTIME_UNAVAILABLE' };
    try { return unwrap(api.syncMarket(countryId, targetId)); }
    catch (error) { return { accepted: false, reason: String(error && error.message || error) }; }
  }
  function processCounteroffer(countryId, checkpoint, turnNumber) {
    if (activeRules.autonomousCounteroffers !== true) return { handled: false };
    var api = bilateral();
    if (!api || typeof api.getProposals !== 'function') return { handled: false };
    var proposals = api.getProposals(countryId) || {};
    var counter = (Array.isArray(proposals.outbox) ? proposals.outbox : []).find(function (row) {
      if (!row || id(row.status) !== 'COUNTER') return false;
      var retryAt = finite(checkpoint.counterofferRetryById[row.proposalId]);
      return retryAt === null || turnNumber >= retryAt;
    });
    if (!counter) return { handled: false };
    var target = canonical(counter.targetCountryId);
    if (!target || target === countryId) return { handled: false };
    var report = api.getMarketReport(countryId, target);
    if (!report || report.status !== 'CURRENT') {
      if (activeRules.marketIntelligenceSyncEnabled !== true) {
        checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferRetryTurns;
        note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_MARKET_INTELLIGENCE_SYNC_DISABLED', null, {
          proposalId: counter.proposalId
        });
        return { handled: true, status: 'WAITING_FOR_MARKET_INTELLIGENCE' };
      }
      var synced = syncMarket(countryId, target);
      if (synced && synced.accepted === true) {
        runtimeStats.marketSyncs++;
        checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferValidationDelayTurns;
        note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_MARKET_INTELLIGENCE_REFRESHED', null, {
          proposalId: counter.proposalId, syncStatus: 'ACCEPTED'
        });
      } else {
        checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferRetryTurns;
        note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_MARKET_INTELLIGENCE_UNAVAILABLE', null, synced);
      }
      return { handled: true, status: 'WAITING_FOR_MARKET_INTELLIGENCE', synced: synced };
    }
    runtimeStats.counteroffersEvaluated++;
    var terms = Object.assign({}, counter, clone(counter.counterTerms || {}));
    var sellerId = id(counter.direction) === 'EXPORT' ? countryId : target;
    var marketApi = market(), referencePrice = null;
    try { referencePrice = marketApi && finite(marketApi.executableLocalPrice(sellerId, counter.resourceId)); } catch (_) {}
    var counterPrice = finite(terms.unitPrice);
    if (referencePrice === null || referencePrice <= 0 || counterPrice === null || counterPrice <= 0) {
      checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferRetryTurns;
      note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_PRICE_EVIDENCE_UNKNOWN', null, { proposalId: counter.proposalId });
      return { handled: true, status: 'WAITING_FOR_PRICE_EVIDENCE' };
    }
    var direction = id(counter.direction);
    var withinCommercialPolicy = direction === 'IMPORT'
      ? counterPrice <= referencePrice * (1 + activeRules.policy.maxCounterPremiumPct / 100)
      : direction === 'EXPORT'
        ? counterPrice >= referencePrice * activeRules.policy.minExportCounterPricePct / 100
        : false;
    var preview = api.previewProposal(countryId, terms);
    if (withinCommercialPolicy && preview && preview.canSend === true && preview.status === 'FEASIBLE') {
      var accepted = api.acceptCounteroffer(countryId, counter.proposalId);
      if (accepted && accepted.accepted === true) {
        runtimeStats.counteroffersAccepted++;
        delete checkpoint.counterofferRetryById[counter.proposalId];
        note(checkpoint, turnNumber, 'ACCEPTED_COUNTER', 'COUNTEROFFER_FEASIBLE_AND_WITHIN_PRICE_POLICY', null, accepted);
        return { handled: true, status: 'ACCEPTED', result: accepted };
      }
      checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferRetryTurns;
      note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_ACCEPTANCE_NOT_FINALIZED', null, accepted);
      return { handled: true, status: 'WAITING', result: accepted };
    }
    if (!withinCommercialPolicy || preview && preview.status === 'INFEASIBLE') {
      var mesh = interop(), rejection = {
        proposalId: counter.proposalId,
        review: { decision: 'REJECT', reason: !withinCommercialPolicy
          ? 'AUTONOMOUS_COUNTEROFFER_OUTSIDE_MARKET_PRICE_POLICY'
          : preview.reason || 'AUTONOMOUS_COUNTEROFFER_NOT_FEASIBLE',
          decisionAuthority: 'OMEGA_AUTONOMOUS_NATIONAL_TRADE_DECISION_V1',
          evaluatedTurn: turnNumber }
      };
      var rejected = null;
      try {
        rejected = mesh && mesh.dispatchCommand('trade', 'OMEGA_BILATERAL_APPLY_RESPONSE', countryId, rejection, {
          turn: turnNumber, commandType: 'OMEGA_BILATERAL_APPLY_RESPONSE',
          correlationId: 'AUTO-COUNTER-REJECT-' + countryId + '-' + counter.proposalId + '-' + turnNumber
        });
      } catch (error) { rejected = { status: 'FAILED', reason: String(error && error.message || error) }; }
      var body = unwrap(rejected);
      if (body && body.accepted === true) {
        runtimeStats.counteroffersRejected++;
        delete checkpoint.counterofferRetryById[counter.proposalId];
        note(checkpoint, turnNumber, 'REJECTED_COUNTER', rejection.review.reason, null, body);
        return { handled: true, status: 'REJECTED', result: body };
      }
      checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferRetryTurns;
      note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_REJECTION_NOT_PERSISTED', null, body);
      return { handled: true, status: 'WAITING', result: body };
    }
    checkpoint.counterofferRetryById[counter.proposalId] = turnNumber + activeRules.policy.counterofferRetryTurns;
    note(checkpoint, turnNumber, 'WAITING', 'COUNTEROFFER_REQUIRES_KNOWN_FEASIBILITY', null, preview);
    return { handled: true, status: 'WAITING_FOR_EVIDENCE', preview: preview };
  }
  function processCountry(countryValue, context) {
    // Never make the authoritative turn scheduler wait for a network fetch.
    // Rules are preloaded at init; an unready engine yields immediately and tries next visit.
    if (!activeRules) {
      if (rulesStatus === 'NOT_LOADED') prepare();
      runtimeStats.deferred++;
      return Promise.resolve({ status: 'DEFERRED',
        reason: rulesStatus === 'LOADING' ? 'AUTONOMOUS_TRADE_RULES_LOADING' : 'AUTONOMOUS_TRADE_RULES_UNAVAILABLE',
        rulesStatus: rulesStatus });
    }
    return (async function () {
      var countryId = canonical(countryValue), turnNumber = turn(context);
      if (!/^[A-Z]{3}$/.test(countryId)) {
        runtimeStats.skipped++;
        return { status: 'SKIPPED', reason: 'COUNTRY_ID_INVALID' };
      }
      var player = playerCountryId();
      if (!player || countryId === player) {
        runtimeStats.skipped++;
        return { status: 'SKIPPED', reason: !player ? 'PLAYER_COUNTRY_NOT_SELECTED' : 'PLAYER_COUNTRY_AUTOMATION_DISABLED',
          countryId: countryId, playerCountryId: player };
      }
      if (!bucket(countryId, 'trade') || !bucket(countryId, 'resource')) {
        runtimeStats.skipped++;
        return { status: 'SKIPPED', reason: 'COUNTRY_ECONOMIC_STATE_NOT_READY', countryId: countryId };
      }
      var checkpoint = currentCheckpoint(countryId);
      if (finite(checkpoint.lastProcessedTurn) !== null && checkpoint.lastProcessedTurn >= turnNumber) {
        return { status: 'ALREADY_PROCESSED', countryId: countryId, turn: turnNumber, phase: checkpoint.phase };
      }
      runtimeStats.visits++;
      runtimeStats.lastCountryId = countryId;
      runtimeStats.lastTurn = turnNumber;
      bilateralHistory(checkpoint, countryId);
      var counterResult = processCounteroffer(countryId, checkpoint, turnNumber);
      if (counterResult.handled) {
        var counterSaved = persist(countryId, checkpoint, turnNumber);
        runtimeStats.lastResult = counterSaved.accepted ? counterResult.status : 'CHECKPOINT_FAILED';
        return Object.assign({ countryId: countryId, turn: turnNumber, phase: 'COUNTEROFFER',
          checkpoint: counterSaved }, counterResult);
      }
      var phaseResult = { status: 'COMPLETED', phase: checkpoint.phase };
      if (checkpoint.phase === 'PLAN' || !checkpoint.plan) {
        if (turnNumber < (finite(checkpoint.nextDecisionTurn) || 0) && checkpoint.lastDecision) {
          note(checkpoint, turnNumber, 'HOLD', 'DECISION_COOLDOWN_ACTIVE', null, {
            nextDecisionTurn: checkpoint.nextDecisionTurn
          });
          phaseResult = { status: 'HOLD', phase: 'PLAN', reason: 'DECISION_COOLDOWN_ACTIVE' };
        } else {
          var candidates = buildCandidates(countryId, checkpoint);
          checkpoint.plan = { createdTurn: turnNumber, candidates: candidates };
          checkpoint.candidateIndex = 0;
          checkpoint.phase = candidates.length && activeRules.autonomousProposals === true
            ? 'MARKET_INTELLIGENCE' : 'PLAN';
          if (candidates.length) {
            runtimeStats.planned++;
            if (activeRules.autonomousProposals === true) {
              note(checkpoint, turnNumber, 'PLANNED', 'RANKED_EVIDENCE_BACKED_TRADE_CANDIDATES', candidates[0], {
                candidateCount: candidates.length, maximumCandidates: activeRules.limits.maxCandidates
              });
              phaseResult = { status: 'PLANNED', phase: checkpoint.phase,
                candidateCount: candidates.length, topCandidate: clone(candidates[0]) };
            } else {
              checkpoint.nextDecisionTurn = turnNumber + activeRules.policy.decisionCooldownTurns;
              note(checkpoint, turnNumber, 'PLANNED_READ_ONLY', 'READ_ONLY_ROLLOUT_AUTONOMOUS_PROPOSALS_DISABLED', candidates[0], {
                candidateCount: candidates.length, maximumCandidates: activeRules.limits.maxCandidates,
                marketSyncEnabled: false, proposalsEnabled: false, counteroffersEnabled: false
              });
              phaseResult = { status: 'PLANNED_READ_ONLY', phase: 'PLAN',
                candidateCount: candidates.length, candidates: clone(candidates) };
            }
          } else {
            checkpoint.nextDecisionTurn = turnNumber + activeRules.policy.emptyPlanCooldownTurns;
            note(checkpoint, turnNumber, 'HOLD', 'NO_KNOWN_FEASIBLE_TRADE_NEED_OR_SURPLUS', null, {
              evidenceSource: 'RESOURCE_NATIONAL_DEMAND_RUNTIME_AND_GLOBAL_MARKET'
            });
            phaseResult = { status: 'HOLD', phase: 'PLAN', reason: 'NO_KNOWN_FEASIBLE_TRADE_NEED_OR_SURPLUS' };
          }
        }
      } else if (checkpoint.phase === 'MARKET_INTELLIGENCE') {
        var candidate = checkpoint.plan && checkpoint.plan.candidates[checkpoint.candidateIndex];
        if (!candidate) {
          checkpoint.phase = 'PLAN'; checkpoint.plan = null; checkpoint.candidateIndex = 0;
          phaseResult = { status: 'HOLD', phase: 'PLAN', reason: 'CANDIDATE_QUEUE_EXHAUSTED' };
        } else {
          var report = bilateral().getMarketReport(countryId, candidate.targetCountryId);
          if (!report || report.status !== 'CURRENT') {
            if (activeRules.marketIntelligenceSyncEnabled !== true) {
              note(checkpoint, turnNumber, 'WAITING', 'MARKET_INTELLIGENCE_SYNC_DISABLED', candidate, null);
              phaseResult = { status: 'WAITING_FOR_MARKET_INTELLIGENCE', phase: 'MARKET_INTELLIGENCE',
                reason: 'MARKET_INTELLIGENCE_SYNC_DISABLED', targetCountryId: candidate.targetCountryId };
            } else {
            var synced = syncMarket(countryId, candidate.targetCountryId);
            if (synced && synced.accepted === true) {
              runtimeStats.marketSyncs++;
              checkpoint.phase = 'VALIDATE';
              note(checkpoint, turnNumber, 'WAITING', 'MARKET_INTELLIGENCE_SYNCED_VALIDATION_NEXT_VISIT', candidate, {
                snapshotId: synced.report && synced.report.snapshotId || null
              });
              phaseResult = { status: 'MARKET_INTELLIGENCE_SYNCED', phase: 'VALIDATE',
                targetCountryId: candidate.targetCountryId };
            } else {
              advanceCandidate(checkpoint, turnNumber, 'MARKET_INTELLIGENCE_SYNC_FAILED', synced);
              phaseResult = { status: 'CANDIDATE_SKIPPED', phase: checkpoint.phase,
                reason: 'MARKET_INTELLIGENCE_SYNC_FAILED', detail: synced };
            }
            }
          } else {
            checkpoint.phase = 'VALIDATE';
            note(checkpoint, turnNumber, 'WAITING', 'CURRENT_MARKET_INTELLIGENCE_READY_VALIDATION_NEXT_VISIT', candidate, {
              snapshotId: report.report && report.report.snapshotId || null
            });
            phaseResult = { status: 'MARKET_INTELLIGENCE_CURRENT', phase: 'VALIDATE',
              targetCountryId: candidate.targetCountryId };
          }
        }
      } else if (checkpoint.phase === 'VALIDATE') {
        var selected = checkpoint.plan && checkpoint.plan.candidates[checkpoint.candidateIndex];
        if (!selected) {
          checkpoint.phase = 'PLAN'; checkpoint.plan = null; checkpoint.candidateIndex = 0;
          phaseResult = { status: 'HOLD', phase: 'PLAN', reason: 'CANDIDATE_QUEUE_EXHAUSTED' };
        } else {
          var api = bilateral();
          var payload = proposalPayload(selected);
          var preview = api.previewProposal(countryId, payload);
          if (preview && preview.canSend === true && preview.status === 'FEASIBLE' &&
              activeRules.autonomousProposals === true) {
            var created = api.createProposal(countryId, payload);
            if (created && created.accepted === true) {
              runtimeStats.proposals++;
              note(checkpoint, turnNumber, 'PROPOSAL_SENT', 'CURRENT_EVIDENCE_AND_EXISTING_BILATERAL_VALIDATION_PASSED', selected, {
                proposalId: created.proposal && created.proposal.proposalId || created.proposalId || null,
                feasibility: preview
              });
              checkpoint.plan = null;
              checkpoint.candidateIndex = 0;
              checkpoint.phase = 'PLAN';
              checkpoint.nextDecisionTurn = turnNumber + activeRules.policy.proposalCooldownTurns;
              phaseResult = { status: 'PROPOSAL_SENT', phase: 'PLAN',
                targetCountryId: selected.targetCountryId, resourceId: selected.resourceId,
                proposal: created };
            } else {
              advanceCandidate(checkpoint, turnNumber, 'BILATERAL_PROPOSAL_CREATION_FAILED', created);
              phaseResult = { status: 'CANDIDATE_SKIPPED', phase: checkpoint.phase,
                reason: 'BILATERAL_PROPOSAL_CREATION_FAILED', detail: created };
            }
          } else {
            var reason = !activeRules.autonomousProposals ? 'AUTONOMOUS_PROPOSALS_DISABLED' :
              preview && preview.reason || 'PROPOSAL_NOT_FEASIBLE_WITH_KNOWN_EVIDENCE';
            advanceCandidate(checkpoint, turnNumber, reason, preview);
            phaseResult = { status: 'CANDIDATE_SKIPPED', phase: checkpoint.phase, reason: reason, preview: preview };
          }
        }
      } else {
        checkpoint.phase = 'PLAN';
        checkpoint.plan = null;
        checkpoint.candidateIndex = 0;
        phaseResult = { status: 'RECOVERED', phase: 'PLAN', reason: 'UNKNOWN_PHASE_RESET' };
      }
      var saved = persist(countryId, checkpoint, turnNumber);
      if (!saved.accepted) {
        runtimeStats.lastResult = 'CHECKPOINT_FAILED';
        return { status: 'FAILED', reason: 'AUTONOMOUS_TRADE_CHECKPOINT_PERSISTENCE_FAILED',
          countryId: countryId, turn: turnNumber, detail: saved, phaseResult: phaseResult };
      }
      runtimeStats.lastResult = phaseResult.status;
      return Object.assign({ countryId: countryId, turn: turnNumber, checkpoint: saved }, phaseResult);
    })().catch(function (error) {
      runtimeStats.errors++;
      return { status: 'FAILED', reason: String(error && error.message || error) };
    });
  }
  function diagnostics() {
    var scheduler = g.Omega && g.Omega.WorldSimulationScheduler || g.OmegaWorldSimulationScheduler;
    return {
      version: VERSION, rulesStatus: rulesStatus, rulesEnabled: !!activeRules,
      rolloutMode: activeRules ? (activeRules.autonomousProposals === true ? 'AUTONOMOUS' : 'READ_ONLY_PLANNER') : 'DISABLED',
      autonomousProposals: activeRules ? activeRules.autonomousProposals === true : false,
      autonomousCounteroffers: activeRules ? activeRules.autonomousCounteroffers === true : false,
      marketIntelligenceSyncEnabled: activeRules ? activeRules.marketIntelligenceSyncEnabled === true : false,
      schedulerHandlerRegistered: typeof unregisterScheduler === 'function',
      commandHandlerRegistered: commandRegistered,
      schedulerTiers: activeRules && activeRules.scheduler ? clone(activeRules.scheduler.tiers) : ['ACTIVE', 'MACRO'],
      schedulerPriority: activeRules && activeRules.scheduler ? activeRules.scheduler.priority : 75,
      maximumMarketSyncsPerCountryTurn: 1, maximumMarketSupplierScansPerCountryVisit: 1, maximumProposalsPerCountryTurn: 1,
      maximumCounterofferEvaluationsPerCountryTurn: 1,
      playerCountryAutomation: false, usesExistingGlobalMarket: true, usesExistingGlobalTrade: true,
      usesExistingBilateralTrade: true, usesExistingMinistryStateTransaction: true,
      createsIndependentScheduler: false, usesTimersOrAnimationLoop: false,
      stats: clone(runtimeStats), lastCountryId: runtimeStats.lastCountryId,
      lastTurn: runtimeStats.lastTurn, schedulerAvailable: !!(scheduler && typeof scheduler.registerCountryHandler === 'function')
    };
  }
  function install() {
    var mesh = interop();
    if (mesh && typeof mesh.registerCommandHandler === 'function' && !commandRegistered) {
      try {
        if (typeof mesh.registerAction === 'function') mesh.registerAction(COMMAND_TYPE, {
          actionId: COMMAND_TYPE, stateOwnerMinistry: 'trade',
          authority: 'OMEGA_AUTONOMOUS_NATIONAL_TRADE_DECISION_V1'
        });
      } catch (_) {}
      try {
        mesh.registerCommandHandler(COMMAND_TYPE, 'trade', checkpointHandler);
        commandRegistered = true;
      } catch (error) {
        runtimeStats.errors++;
      }
    }
    var scheduler = g.Omega && g.Omega.WorldSimulationScheduler || g.OmegaWorldSimulationScheduler;
    if (scheduler && typeof scheduler.registerCountryHandler === 'function' && !unregisterScheduler) {
      try {
        unregisterScheduler = scheduler.registerCountryHandler(HANDLER_ID, processCountry, {
          tiers: ['ACTIVE', 'MACRO'], priority: 75
        });
      } catch (error) { runtimeStats.errors++; }
    }
    return diagnostics();
  }
  function init() {
    prepare();
    install();
    if (!g.__omegaAutonomousNationalTradeDecisionHook) {
      g.__omegaAutonomousNationalTradeDecisionHook = true;
      if (typeof g.addEventListener === 'function') {
        g.addEventListener('OMEGA_READY', function () { prepare(); install(); });
        g.addEventListener('OMEGA_GAME_SESSION_STARTED', function () { prepare(); install(); });
      }
    }
    return diagnostics();
  }
  var API = Object.freeze({
    VERSION: VERSION, HANDLER_ID: HANDLER_ID,
    prepare: prepare, processCountry: processCountry, diagnostics: diagnostics,
    getDecisionState: function (countryId) { return currentCheckpoint(canonical(countryId)); },
    getDecisionPlan: function (countryId) {
      var checkpoint = currentCheckpoint(canonical(countryId));
      return { countryId: checkpoint.countryId, phase: checkpoint.phase,
        candidates: clone(checkpoint.plan && checkpoint.plan.candidates || []),
        candidateIndex: checkpoint.candidateIndex, lastDecision: clone(checkpoint.lastDecision) };
    }
  });
  g.Omega = g.Omega || {};
  g.Omega.AutonomousNationalTradeDecisionV1 = API;
  g.OmegaAutonomousNationalTradeDecisionV1 = API;
  try { init(); } catch (error) { runtimeStats.errors++; g.OmegaAutonomousNationalTradeDecisionV1Error = String(error && error.message || error); }
})(typeof window !== 'undefined' ? window : globalThis);
