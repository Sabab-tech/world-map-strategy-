/* OMEGA AUTONOMOUS PRIVATE INVESTMENT DECISION ENGINE v1.0.0
 * Bounded NPC private-company investment selection over the existing world scheduler.
 * The only money movement is delegated to the existing cross-border FDI settlement API.
 * It never creates factories, approves permits, production, debt or sovereign spending.
 */
(function (g) {
  'use strict';
  var VERSION = '1.0.0';
  var HANDLER_ID = 'omega.autonomous-private-investment.country-runtime';
  var COMMAND_TYPE = 'OMEGA_AUTONOMOUS_PRIVATE_INVESTMENT_CHECKPOINT';
  var RULES_URL = './omega_autonomous_private_investment_rules_v1.json';
  var COMPANY_IDS = [
    'AURORA_INDUSTRIAL_GROUP',
    'MERIDIAN_ENGINEERING_GROUP',
    'NOVA_CONSUMER_INDUSTRIES',
    'ATLAS_TECHNOLOGY_CORPORATION',
    'TERRA_INFRASTRUCTURE_GROUP'
  ];
  var rulesPromise = null;
  var activeRules = null;
  var rulesStatus = 'NOT_LOADED';
  var commandRegistered = false;
  var unregisterScheduler = null;
  var hostRoster = null;
  var hostRosterTurn = -1;
  var inFlight = new Map();
  var stats = {
    visits: 0, skipped: 0, deferred: 0, scans: 0, qualifiedHosts: 0,
    investmentsSettled: 0, investmentsPending: 0, investmentsBlocked: 0,
    checkpointFailures: 0, errors: 0, lastCountryId: null,
    lastTurn: null, lastResult: null
  };

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function finite(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  function nonNegative(value) {
    var parsed = finite(value);
    return parsed === null ? null : Math.max(0, parsed);
  }
  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }
  function id(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }
  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) {
      if (seen[i][0] === value) return seen[i][1];
    }
    var output = Array.isArray(value) ? [] : {};
    seen.push([value, output]);
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || typeof value[key] === 'function' || value[key] === undefined) return;
      output[key] = clone(value[key], seen);
    });
    return output;
  }
  function rootState() {
    return g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state ||
      g.Omega && g.Omega.World && g.Omega.World.state ||
      g.Game && g.Game.state || g.gameState || {};
  }
  function canonicalCountry(value) {
    var raw = id(value && typeof value === 'object'
      ? (value.iso3 || value.iso3Code || value.countryCode || value.countryId || value.code || value.id)
      : value);
    if (/^[A-Z]{3}$/.test(raw)) return raw;
    // The world scheduler's canonical countryId is often ISO2. Resolve it
    // through the existing country-profile runtime before reading ISO3 ledgers.
    try {
      var countryRuntime = g.OmegaCountryRuntimeData || g.Omega && g.Omega.CountryRuntimeData;
      var profile = countryRuntime && typeof countryRuntime.getProfile === 'function'
        ? countryRuntime.getProfile(value)
        : countryRuntime && typeof countryRuntime.resolveCountry === 'function'
          ? countryRuntime.resolveCountry(value) : null;
      var profileIso3 = id(profile && (profile.iso3 || profile.iso3Code));
      if (/^[A-Z]{3}$/.test(profileIso3)) return profileIso3;
    } catch (_) {}
    var registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge ||
      g.Omega && g.Omega.CanonicalIdentity;
    try {
      var resolved = registry && typeof registry.resolveCountry === 'function' ? registry.resolveCountry(value) : null;
      var row = resolved && resolved.raw && (resolved.raw.raw || resolved.raw);
      var iso3 = id(row && (row.iso3 || row.iso3Code) || resolved && (resolved.iso3 || resolved.iso3Code));
      if (/^[A-Z]{3}$/.test(iso3)) return iso3;
      // Some canonical bridges expose the ISO2 id first; ask the country
      // runtime once more with that resolved identity rather than persisting it.
      var bridgeProfile = countryRuntime && typeof countryRuntime.getProfile === 'function'
        ? countryRuntime.getProfile(resolved && (resolved.countryCode || resolved.id) || value) : null;
      var bridgeIso3 = id(bridgeProfile && (bridgeProfile.iso3 || bridgeProfile.iso3Code));
      if (/^[A-Z]{3}$/.test(bridgeIso3)) return bridgeIso3;
    } catch (_) {}
    return '';
  }
  function turn(context) {
    var state = rootState();
    var value = finite(context && context.turn);
    if (value === null) value = finite(context && context.simulationTurn);
    if (value === null) value = finite(state.simulation && state.simulation.turn);
    if (value === null) value = finite(state.turn);
    if (value === null) value = finite(g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock &&
      g.Omega.Simulation.clock.turn);
    return value === null ? 0 : Math.max(0, Math.floor(value));
  }
  function playerCountryId() {
    var state = rootState();
    var values = [
      state.simulation && state.simulation.session && state.simulation.session.playerCountryId,
      g.Omega && g.Omega.Simulation && typeof g.Omega.Simulation.getPlayerCountryId === 'function'
        ? g.Omega.Simulation.getPlayerCountryId() : null,
      state.simulation && state.simulation.playerCountryId,
      state.playerCountryId,
      g.Game && (g.Game.playerCountryId || g.Game.playerCountryCode || g.Game.playerCountry)
    ];
    for (var i = 0; i < values.length; i++) {
      var value = canonicalCountry(values[i]);
      if (value) return value;
    }
    return null;
  }
  function bucket(root, domain, countryId) {
    var rows = root && root[domain];
    if (!isObject(rows)) return null;
    if (isObject(rows[countryId])) return rows[countryId];
    var keys = Object.keys(rows);
    for (var i = 0; i < keys.length; i++) {
      if (canonicalCountry(keys[i]) === countryId && isObject(rows[keys[i]])) return rows[keys[i]];
    }
    return null;
  }
  function economyRecord(root, countryId) {
    return bucket(root, 'economy', countryId) || null;
  }
  function relationRecord(root, countryId, partnerId) {
    var own = bucket(root, 'foreign', countryId);
    var rows = own && own.relations;
    if (!isObject(rows)) return null;
    if (isObject(rows[partnerId])) return rows[partnerId];
    var keys = Object.keys(rows);
    for (var i = 0; i < keys.length; i++) {
      if (canonicalCountry(keys[i]) === partnerId && isObject(rows[keys[i]])) return rows[keys[i]];
    }
    return null;
  }
  function dependencies() {
    return {
      investment: g.OmegaPrivateInternationalInvestmentRuntimeV1 ||
        g.Omega && g.Omega.PrivateInternationalInvestmentRuntimeV1,
      capital: g.OmegaPrivateCompanyCapitalRuntimeV1 ||
        g.Omega && g.Omega.PrivateCompanyCapitalRuntimeV1,
      registry: g.OmegaPrivateEnterpriseRegistryV1 ||
        g.Omega && g.Omega.PrivateEnterpriseRegistryV1,
      interop: g.OmegaMinistryInteroperability || g.Omega && g.Omega.MinistryInteroperability,
      scheduler: g.OmegaWorldSimulationScheduler || g.Omega && g.Omega.WorldSimulationScheduler
    };
  }
  function validateRules(input) {
    var limits = input && input.limits || {};
    var policy = input && input.policy || {};
    var scoring = input && input.scoring || {};
    return !!input && input.schemaVersion === VERSION && input.enabled === true &&
      input.scheduler && input.scheduler.existingSchedulerOnly === true &&
      input.scheduler.playerCountryAutomation === false &&
      Array.isArray(input.scheduler.tiers) &&
      input.scheduler.tiers.indexOf('ACTIVE') >= 0 && input.scheduler.tiers.indexOf('MACRO') >= 0 &&
      finite(input.scheduler.priority) !== null &&
      finite(limits.maxHostCandidatesPerVisit) >= 1 && finite(limits.maxHostCandidatesPerVisit) <= 24 &&
      finite(limits.maxHistory) >= 4 && finite(limits.maxHistory) <= 40 &&
      finite(limits.maxInboundInvestmentsPerHostWindow) >= 1 &&
      finite(policy.scanIntervalTurns) >= 1 &&
      finite(policy.investmentCooldownTurns) >= finite(policy.scanIntervalTurns) &&
      finite(policy.sameHostCompanyCooldownTurns) >= finite(policy.investmentCooldownTurns) &&
      finite(policy.inboundWindowTurns) >= finite(policy.scanIntervalTurns) &&
      finite(policy.investmentPercentOfAvailableCapital) > 0 &&
      finite(policy.investmentPercentOfAvailableCapital) <= 5 &&
      finite(policy.minimumInvestmentLocal) > 0 &&
      finite(policy.minimumInvestmentScore) >= 0 && finite(policy.minimumInvestmentScore) <= 100 &&
      finite(policy.minimumRelationshipScore) >= 0 && finite(policy.minimumRelationshipScore) <= 100 &&
      finite(policy.maximumInflationPct) > 0 &&
      finite(policy.minimumGdpGrowthPct) <= 0 &&
      finite(policy.maximumDebtToGdpPct) > 0 &&
      finite(scoring.relationshipWeight) > 0 &&
      finite(scoring.growthWeight) > 0 &&
      finite(scoring.inflationWeight) > 0 &&
      finite(scoring.marketSizeWeight) > 0 &&
      finite(scoring.debtWeight) >= 0;
  }
  function prepare() {
    if (activeRules) return Promise.resolve({ status: 'READY' });
    if (rulesPromise) return rulesPromise;
    var injected = g.__OmegaAutonomousPrivateInvestmentRules;
    if (injected) {
      if (!validateRules(injected)) {
        rulesStatus = 'UNAVAILABLE';
        stats.errors++;
        return Promise.resolve({ status: rulesStatus, reason: 'AUTONOMOUS_PRIVATE_INVESTMENT_RULES_INVALID' });
      }
      activeRules = clone(injected);
      rulesStatus = 'READY';
      return Promise.resolve({ status: 'READY', source: 'INJECTED_RULES' });
    }
    if (typeof g.fetch !== 'function') {
      rulesStatus = 'UNAVAILABLE';
      return Promise.resolve({ status: rulesStatus, reason: 'FETCH_UNAVAILABLE' });
    }
    rulesStatus = 'LOADING';
    rulesPromise = g.fetch(RULES_URL, { cache: 'no-store' }).then(function (response) {
      if (!response || !response.ok) throw new Error('AUTONOMOUS_PRIVATE_INVESTMENT_RULES_NOT_AVAILABLE');
      return response.json();
    }).then(function (data) {
      if (!validateRules(data)) throw new Error('AUTONOMOUS_PRIVATE_INVESTMENT_RULES_INVALID');
      activeRules = clone(data);
      rulesStatus = 'READY';
      return { status: 'READY', source: RULES_URL };
    }).catch(function (error) {
      rulesStatus = 'UNAVAILABLE';
      stats.errors++;
      return { status: rulesStatus, reason: String(error && error.message || error) };
    });
    return rulesPromise;
  }
  function makeCheckpoint(countryId) {
    return {
      schemaVersion: VERSION,
      countryId: countryId,
      revision: 0,
      lastProcessedTurn: -1,
      lastScanTurn: null,
      lastInvestmentTurn: null,
      candidateCursor: 0,
      nextCompanyIndex: 0,
      pendingTransfer: null,
      lastByHostCompany: {},
      lastDecision: null,
      history: [],
      updatedTurn: null
    };
  }
  function currentCheckpoint(countryId) {
    var finance = bucket(rootState(), 'finance', countryId);
    var stored = finance && finance.omegaFinance &&
      finance.omegaFinance.autonomousPrivateInvestmentDecision;
    if (!isObject(stored) || stored.schemaVersion !== VERSION ||
        canonicalCountry(stored.countryId) !== countryId) return makeCheckpoint(countryId);
    var next = clone(stored);
    if (!isObject(next.lastByHostCompany)) next.lastByHostCompany = {};
    if (!Array.isArray(next.history)) next.history = [];
    if (!Number.isInteger(next.candidateCursor) || next.candidateCursor < 0) next.candidateCursor = 0;
    if (!Number.isInteger(next.nextCompanyIndex) || next.nextCompanyIndex < 0) next.nextCompanyIndex = 0;
    return next;
  }
  function pushHistory(checkpoint, row) {
    checkpoint.history.push(clone(row));
    if (checkpoint.history.length > activeRules.limits.maxHistory) {
      checkpoint.history.splice(0, checkpoint.history.length - activeRules.limits.maxHistory);
    }
  }
  function checkpointHandler(command, context) {
    var payload = command && command.payload || {};
    var countryId = canonicalCountry(context && context.countryId);
    var next = payload.checkpoint;
    if (!countryId || !isObject(next) || canonicalCountry(next.countryId) !== countryId ||
        next.schemaVersion !== VERSION || !Number.isInteger(next.revision) ||
        finite(next.lastProcessedTurn) === null || !isObject(next.lastByHostCompany) ||
        !Array.isArray(next.history)) {
      return { accepted: false, reason: 'AUTONOMOUS_PRIVATE_INVESTMENT_CHECKPOINT_INVALID' };
    }
    var previous = context.stateTransaction.get('finance.omegaFinance');
    var old = previous && previous.autonomousPrivateInvestmentDecision;
    if (old && isObject(old)) {
      var oldTurn = finite(old.lastProcessedTurn) === null ? -1 : finite(old.lastProcessedTurn);
      var newTurn = finite(next.lastProcessedTurn);
      var oldRevision = finite(old.revision) || 0;
      if (oldTurn > newTurn || oldTurn === newTurn && oldRevision >= next.revision) {
        return { accepted: true, duplicate: true, noStateChangeAccepted: true };
      }
    }
    var root = isObject(previous) ? clone(previous) : {};
    root.autonomousPrivateInvestmentDecision = clone(next);
    context.stateTransaction.set('finance.omegaFinance', root);
    return {
      accepted: true,
      countryId: countryId,
      revision: next.revision,
      lastProcessedTurn: next.lastProcessedTurn,
      stateMutationAuthority: 'OMEGA_MINISTRY_STATE_TRANSACTION'
    };
  }
  function persist(countryId, checkpoint, currentTurn) {
    var mesh = dependencies().interop;
    if (!mesh || typeof mesh.dispatchCommand !== 'function') {
      stats.checkpointFailures++;
      return { accepted: false, reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    }
    checkpoint.countryId = countryId;
    checkpoint.lastProcessedTurn = currentTurn;
    checkpoint.updatedTurn = currentTurn;
    checkpoint.revision = (finite(checkpoint.revision) || 0) + 1;
    try {
      var result = mesh.dispatchCommand('finance', COMMAND_TYPE, countryId,
        { checkpoint: clone(checkpoint) }, {
          turn: currentTurn,
          commandId: COMMAND_TYPE + ':' + countryId + ':' + currentTurn + ':' + checkpoint.revision,
          commandType: COMMAND_TYPE,
          ownerMinistry: 'finance',
          correlationId: COMMAND_TYPE + ':' + countryId + ':' + currentTurn
        });
      var body = result && result.status === 'APPLIED' && result.result ? result.result : result;
      if (!body || body.accepted !== true) {
        stats.checkpointFailures++;
        return { accepted: false, reason: body && body.reason || result && result.reason || 'CHECKPOINT_WRITE_FAILED' };
      }
      return { accepted: true, revision: checkpoint.revision };
    } catch (error) {
      stats.checkpointFailures++;
      return { accepted: false, reason: String(error && error.message || error) };
    }
  }
  function hostCountryIds(registry, currentTurn) {
    if (hostRoster && currentTurn - hostRosterTurn < 120) return hostRoster.slice();
    if (!registry || typeof registry.listCountryIds !== 'function') return [];
    var ids = registry.listCountryIds().map(canonicalCountry).filter(function (value) {
      return /^[A-Z]{3}$/.test(value);
    });
    hostRoster = Array.from(new Set(ids)).sort();
    hostRosterTurn = currentTurn;
    return hostRoster.slice();
  }
  function bilateralRelations(root, investorId, hostId) {
    var forward = relationRecord(root, investorId, hostId);
    var reverse = relationRecord(root, hostId, investorId);
    var rows = [];
    if (isObject(forward)) rows.push(forward);
    if (isObject(reverse) && reverse !== forward) rows.push(reverse);
    return { rows: rows, forward: forward, reverse: reverse };
  }
  function scoreHost(root, investorId, hostId) {
    if (investorId === hostId) return { eligible: false, reason: 'SAME_COUNTRY' };
    var hostEconomy = economyRecord(root, hostId);
    var investorEconomy = economyRecord(root, investorId);
    if (!hostEconomy || !investorEconomy) return { eligible: false, reason: 'COUNTRY_ECONOMIC_STATE_UNAVAILABLE' };
    if (hostEconomy.activeCrisis === true || investorEconomy.activeCrisis === true) {
      return { eligible: false, reason: 'ACTIVE_ECONOMIC_CRISIS' };
    }
    var hostMilitary = bucket(root, 'military', hostId);
    var investorMilitary = bucket(root, 'military', investorId);
    if (hostMilitary && hostMilitary.activeConflict === true ||
        investorMilitary && investorMilitary.activeConflict === true) {
      return { eligible: false, reason: 'ACTIVE_CONFLICT' };
    }
    var gdp = nonNegative(hostEconomy.gdp);
    var growth = finite(hostEconomy.gdp_growth);
    var inflation = finite(hostEconomy.inflation);
    if (gdp === null || gdp <= 0 || growth === null || inflation === null) {
      return { eligible: false, reason: 'MACRO_EVIDENCE_INCOMPLETE' };
    }
    if (growth < activeRules.policy.minimumGdpGrowthPct) {
      return { eligible: false, reason: 'HOST_ECONOMY_IN_RECESSION' };
    }
    if (inflation > activeRules.policy.maximumInflationPct) {
      return { eligible: false, reason: 'HOST_INFLATION_RISK_TOO_HIGH' };
    }
    var relation = bilateralRelations(root, investorId, hostId);
    if (!relation.rows.length) return { eligible: false, reason: 'BILATERAL_RELATIONSHIP_EVIDENCE_UNAVAILABLE' };
    for (var r = 0; r < relation.rows.length; r++) {
      if (relation.rows[r].sanctions === true) return { eligible: false, reason: 'SANCTIONS_RESTRICTION' };
      if (relation.rows[r].war_state === true) return { eligible: false, reason: 'WAR_RESTRICTION' };
    }
    var relationshipValues = [];
    ['overall', 'trust', 'trade', 'political'].forEach(function (key) {
      relation.rows.forEach(function (row) {
        var value = finite(row[key]);
        if (value !== null && value >= 0 && value <= 100) relationshipValues.push(value);
      });
    });
    if (!relationshipValues.length) {
      return { eligible: false, reason: 'BILATERAL_RELATIONSHIP_SCORE_UNAVAILABLE' };
    }
    var relationshipScore = relationshipValues.reduce(function (sum, value) {
      return sum + value;
    }, 0) / relationshipValues.length;
    if (relationshipScore < activeRules.policy.minimumRelationshipScore) {
      return { eligible: false, reason: 'BILATERAL_RELATIONSHIP_TOO_WEAK', relationshipScore: relationshipScore };
    }
    var debt = nonNegative(hostEconomy.debt);
    var debtToGdp = debt !== null ? debt / gdp * 100 : null;
    if (debtToGdp !== null && debtToGdp > activeRules.policy.maximumDebtToGdpPct) {
      return { eligible: false, reason: 'HOST_PUBLIC_DEBT_RISK_TOO_HIGH', debtToGdpPct: debtToGdp };
    }
    var weights = activeRules.scoring;
    var relationPoints = relationshipScore;
    var growthPoints = clamp(50 + growth * 4, 0, 100);
    var inflationPoints = clamp(100 - Math.max(0, inflation) * 3, 0, 100);
    var marketSizePoints = clamp((Math.log(gdp) / Math.LN10 - 8) * 8, 0, 100);
    var debtPoints = debtToGdp === null ? null : clamp(100 - Math.max(0, debtToGdp - 40) * 0.5, 0, 100);
    var denominator = weights.relationshipWeight + weights.growthWeight +
      weights.inflationWeight + weights.marketSizeWeight +
      (debtPoints === null ? 0 : weights.debtWeight);
    var score = (
      relationPoints * weights.relationshipWeight +
      growthPoints * weights.growthWeight +
      inflationPoints * weights.inflationWeight +
      marketSizePoints * weights.marketSizeWeight +
      (debtPoints === null ? 0 : debtPoints * weights.debtWeight)
    ) / denominator;
    var riskComplete = relation.rows.length > 1 &&
      relation.rows.every(function (row) {
        return typeof row.sanctions === 'boolean' && typeof row.war_state === 'boolean';
      });
    if (!riskComplete) score = Math.max(0, score - activeRules.policy.partialRiskEvidencePenalty);
    return {
      eligible: true,
      countryId: hostId,
      score: Number(score.toFixed(3)),
      relationshipScore: Number(relationshipScore.toFixed(3)),
      hostGrowthPct: growth,
      hostInflationPct: inflation,
      hostGdp: gdp,
      debtToGdpPct: debtToGdp,
      riskEvidenceStatus: riskComplete ? 'COMPLETE' : 'PARTIAL',
      economicEvidenceStatus: debtToGdp === null ? 'PARTIAL' : 'COMPLETE',
      hostIndustryArchetype: hostEconomy.industryArchetype || null,
      evidence: {
        bilateralRelationRecords: relation.rows.length,
        relationshipMetrics: relationshipValues.length,
        gdp: 'COUNTRY_ECONOMY_STATE',
        growth: 'COUNTRY_ECONOMY_STATE',
        inflation: 'COUNTRY_ECONOMY_STATE',
        debtToGdp: debtToGdp === null ? 'NOT_RECORDED' : 'COUNTRY_ECONOMY_STATE',
        sectorFit: 'NOT_ASSESSED_NO_COMPARABLE_LIVE_SECTOR_INDICATOR'
      }
    };
  }
  function recentInboundCount(investmentApi, hostId, currentTurn) {
    if (!investmentApi || typeof investmentApi.getCountryLedger !== 'function') return null;
    var rows = investmentApi.getCountryLedger(hostId);
    if (!Array.isArray(rows)) return null;
    var floor = currentTurn - activeRules.policy.inboundWindowTurns;
    return rows.filter(function (row) {
      var recordedTurn = finite(row && (row.settledTurn !== undefined ? row.settledTurn : row.turn));
      return row && row.status === 'SETTLED' &&
        canonicalCountry(row.hostCountryId) === hostId &&
        recordedTurn !== null && recordedTurn >= floor && recordedTurn <= currentTurn;
    }).length;
  }
  function chooseCompany(investorId, hostId, checkpoint, currentTurn) {
    var investmentApi = dependencies().investment;
    if (!investmentApi || typeof investmentApi.getCompanyCapital !== 'function') {
      return { status: 'WAITING', reason: 'PRIVATE_COMPANY_CAPITAL_READ_API_UNAVAILABLE' };
    }
    for (var step = 0; step < COMPANY_IDS.length; step++) {
      var index = (checkpoint.nextCompanyIndex + step) % COMPANY_IDS.length;
      var companyId = COMPANY_IDS[index];
      var pairKey = hostId + '|' + companyId;
      var lastPairTurn = finite(checkpoint.lastByHostCompany[pairKey]);
      if (lastPairTurn !== null &&
          currentTurn - lastPairTurn < activeRules.policy.sameHostCompanyCooldownTurns) continue;
      var account = investmentApi.getCompanyCapital(investorId, companyId);
      var available = nonNegative(account && account.availableBalance);
      if (available === null) continue;
      var amount = Math.floor(available *
        activeRules.policy.investmentPercentOfAvailableCapital / 100 * 100) / 100;
      if (amount + 1e-9 < activeRules.policy.minimumInvestmentLocal) continue;
      return {
        status: 'READY',
        companyId: companyId,
        companyIndex: index,
        currencyCode: account.currency || null,
        availableBalance: available,
        amount: Number(amount.toFixed(2)),
        retainedBalanceAfterReservation: Number((available - amount).toFixed(2))
      };
    }
    return { status: 'BLOCKED', reason: 'NO_COMPANY_HAS_DEPLOYABLE_CAPITAL_OR_PAIR_IS_COOLDOWN' };
  }
  function saveDecision(countryId, checkpoint, currentTurn, decision) {
    checkpoint.lastDecision = clone(decision);
    pushHistory(checkpoint, decision);
    var saved = persist(countryId, checkpoint, currentTurn);
    return saved;
  }
  function finishPending(countryId, checkpoint, currentTurn, result) {
    var pending = checkpoint.pendingTransfer;
    if (!pending) return { status: 'SKIPPED', reason: 'NO_PENDING_INVESTMENT' };
    if (result && result.status === 'SETTLED') {
      checkpoint.pendingTransfer = null;
      checkpoint.lastInvestmentTurn = currentTurn;
      checkpoint.lastByHostCompany[pending.hostCountryId + '|' + pending.companyId] = currentTurn;
      checkpoint.nextCompanyIndex = (pending.companyIndex + 1) % COMPANY_IDS.length;
      stats.investmentsSettled++;
      var decision = {
        status: 'SETTLED',
        investorCountryId: countryId,
        hostCountryId: pending.hostCountryId,
        companyId: pending.companyId,
        amount: pending.amount,
        currencyCode: pending.currencyCode,
        score: pending.hostScore,
        requestId: pending.requestId,
        turn: currentTurn,
        capitalRetainedPct: Number((100 - activeRules.policy.investmentPercentOfAvailableCapital).toFixed(2)),
        factoryApprovalStatus: 'NOT_REQUESTED',
        authority: 'EXISTING_PRIVATE_COMPANY_FDI_SETTLEMENT'
      };
      var saved = saveDecision(countryId, checkpoint, currentTurn, decision);
      if (!saved.accepted) {
        checkpoint.pendingTransfer = pending;
        stats.investmentsPending++;
        return { status: 'SETTLED_CHECKPOINT_PENDING', reason: saved.reason, transferId: pending.requestId };
      }
      return { status: 'SETTLED', decision: decision };
    }
    if (result && result.status === 'REFUNDED') {
      checkpoint.pendingTransfer = null;
      stats.investmentsBlocked++;
      var refunded = saveDecision(countryId, checkpoint, currentTurn, {
        status: 'REFUNDED',
        investorCountryId: countryId,
        hostCountryId: pending.hostCountryId,
        companyId: pending.companyId,
        requestId: pending.requestId,
        reason: result.reason || 'HOST_RECEIPT_FAILED_REFUNDED',
        turn: currentTurn
      });
      return { status: refunded.accepted ? 'REFUNDED' : 'CHECKPOINT_FAILED', reason: refunded.reason || null };
    }
    if (result && (result.status === 'BLOCKED' || result.status === 'STALE_COUNTRY_RESULT')) {
      checkpoint.pendingTransfer = null;
      stats.investmentsBlocked++;
      var blocked = saveDecision(countryId, checkpoint, currentTurn, {
        status: 'BLOCKED',
        investorCountryId: countryId,
        hostCountryId: pending.hostCountryId,
        companyId: pending.companyId,
        requestId: pending.requestId,
        reason: result.reason || result.status,
        turn: currentTurn
      });
      return { status: blocked.accepted ? 'BLOCKED' : 'CHECKPOINT_FAILED', reason: blocked.reason || result.reason };
    }
    checkpoint.pendingTransfer.lastResult = clone(result || { status: 'UNKNOWN' });
    checkpoint.pendingTransfer.lastAttemptTurn = currentTurn;
    stats.investmentsPending++;
    var pendingSave = persist(countryId, checkpoint, currentTurn);
    return {
      status: pendingSave.accepted ? 'SETTLEMENT_PENDING' : 'CHECKPOINT_FAILED',
      reason: result && (result.reason || result.status) || pendingSave.reason,
      transferId: pending.requestId
    };
  }
  async function attemptPending(countryId, checkpoint, currentTurn) {
    var pending = checkpoint.pendingTransfer;
    var investmentApi = dependencies().investment;
    if (!investmentApi || typeof investmentApi.invest !== 'function') {
      return { status: 'DEFERRED', reason: 'PRIVATE_INTERNATIONAL_INVESTMENT_RUNTIME_UNAVAILABLE' };
    }
    // Replaying the same immutable request is safe: the underlying FDI ledger is idempotent.
    var result = await investmentApi.invest({
      investorCountryId: pending.investorCountryId,
      hostCountryId: pending.hostCountryId,
      companyId: pending.companyId,
      requestId: pending.requestId,
      amount: pending.amount
    });
    return finishPending(countryId, checkpoint, currentTurn, result);
  }
  async function processCountry(countryValue, context) {
    context = context || {};
    var countryId = canonicalCountry(countryValue);
    var currentTurn = turn(context);
    stats.visits++;
    stats.lastCountryId = countryId || null;
    stats.lastTurn = currentTurn;
    if (!/^[A-Z]{3}$/.test(countryId)) {
      stats.skipped++;
      return { status: 'SKIPPED', reason: 'COUNTRY_ID_INVALID' };
    }
    var player = playerCountryId();
    if (!player || countryId === player) {
      stats.skipped++;
      return { status: 'SKIPPED', reason: !player ? 'PLAYER_COUNTRY_NOT_SELECTED' : 'PLAYER_COUNTRY_AUTOMATION_DISABLED' };
    }
    if (context.tier && ['ACTIVE', 'MACRO'].indexOf(String(context.tier).toUpperCase()) < 0) {
      stats.skipped++;
      return { status: 'SKIPPED', reason: 'UNSUPPORTED_SCHEDULER_TIER' };
    }
    if (!activeRules) {
      if (rulesStatus === 'NOT_LOADED') prepare();
      stats.deferred++;
      return { status: 'DEFERRED', reason: 'AUTONOMOUS_PRIVATE_INVESTMENT_RULES_NOT_READY', rulesStatus: rulesStatus };
    }
    if (inFlight.has(countryId)) return inFlight.get(countryId);
    var task = (async function () {
      var checkpoint = currentCheckpoint(countryId);
      if (finite(checkpoint.lastProcessedTurn) !== null && checkpoint.lastProcessedTurn >= currentTurn) {
        return { status: 'DUPLICATE', reason: 'COUNTRY_TURN_ALREADY_PROCESSED' };
      }
      if (checkpoint.pendingTransfer) {
        return attemptPending(countryId, checkpoint, currentTurn);
      }
      if (finite(checkpoint.lastScanTurn) !== null &&
          currentTurn - checkpoint.lastScanTurn < activeRules.policy.scanIntervalTurns) {
        stats.deferred++;
        return { status: 'COOLDOWN', nextScanTurn: checkpoint.lastScanTurn + activeRules.policy.scanIntervalTurns };
      }
      if (finite(checkpoint.lastInvestmentTurn) !== null &&
          currentTurn - checkpoint.lastInvestmentTurn < activeRules.policy.investmentCooldownTurns) {
        stats.deferred++;
        return { status: 'INVESTMENT_COOLDOWN', nextInvestmentTurn: checkpoint.lastInvestmentTurn + activeRules.policy.investmentCooldownTurns };
      }
      var deps = dependencies();
      if (!deps.investment || typeof deps.investment.invest !== 'function' ||
          typeof deps.investment.getCompanyCapital !== 'function' ||
          !deps.capital || typeof deps.capital.ensureCountryInitializedForInvestment !== 'function' ||
          !deps.registry || typeof deps.registry.getCountryBaseline !== 'function' ||
          typeof deps.registry.listCountryIds !== 'function') {
        stats.deferred++;
        return { status: 'DEFERRED', reason: 'PRIVATE_INVESTMENT_DEPENDENCIES_NOT_READY' };
      }
      try {
        await Promise.resolve(deps.registry.ready);
      } catch (_) {
        stats.deferred++;
        return { status: 'DEFERRED', reason: 'PRIVATE_ENTERPRISE_BASELINE_NOT_READY' };
      }
      var investorBaseline = deps.registry.getCountryBaseline(countryId);
      if (!investorBaseline || investorBaseline.status !== 'READY') {
        stats.deferred++;
        return { status: 'DEFERRED', reason: 'INVESTOR_PRIVATE_ENTERPRISE_BASELINE_NOT_READY' };
      }
      var opening = await deps.capital.ensureCountryInitializedForInvestment(countryId);
      if (!opening || ['INITIALIZED', 'ALREADY_INITIALIZED', 'PARTIALLY_INITIALIZED'].indexOf(opening.status) < 0) {
        stats.deferred++;
        return { status: 'DEFERRED', reason: opening && opening.reason || 'INVESTOR_COMPANY_WALLETS_NOT_READY' };
      }
      var countries = hostCountryIds(deps.registry, currentTurn);
      if (countries.length < 2) {
        stats.deferred++;
        return { status: 'DEFERRED', reason: 'CANONICAL_PRIVATE_COMPANY_COUNTRY_ROSTER_UNAVAILABLE' };
      }
      var root = context.state || rootState();
      var batchSize = activeRules.limits.maxHostCandidatesPerVisit;
      var start = checkpoint.candidateCursor % countries.length;
      var assessed = 0;
      var qualified = [];
      for (var i = 0; i < batchSize && i < countries.length; i++) {
        var hostId = countries[(start + i) % countries.length];
        if (hostId === countryId) continue;
        assessed++;
        var candidate = scoreHost(root, countryId, hostId);
        if (candidate.eligible) qualified.push(candidate);
      }
      checkpoint.candidateCursor = (start + batchSize) % countries.length;
      checkpoint.lastScanTurn = currentTurn;
      checkpoint.lastProcessedTurn = currentTurn;
      stats.scans++;
      stats.qualifiedHosts += qualified.length;
      qualified.sort(function (a, b) {
        return b.score - a.score || a.countryId.localeCompare(b.countryId);
      });
      var viable = qualified.filter(function (row) {
        return row.score >= activeRules.policy.minimumInvestmentScore;
      });
      if (!viable.length) {
        var noHost = {
          status: 'NO_QUALIFIED_HOST',
          investorCountryId: countryId,
          assessedCountryCount: assessed,
          qualifiedHostCount: qualified.length,
          bestScore: qualified.length ? qualified[0].score : null,
          turn: currentTurn,
          reason: qualified.length ? 'MINIMUM_INVESTMENT_SCORE_NOT_MET' : 'NO_HOST_WITH_COMPLETE_MINIMUM_EVIDENCE'
        };
        var noHostSaved = saveDecision(countryId, checkpoint, currentTurn, noHost);
        return noHostSaved.accepted ? noHost : { status: 'CHECKPOINT_FAILED', reason: noHostSaved.reason };
      }
      var chosen = null;
      for (var h = 0; h < viable.length; h++) {
        var recent = recentInboundCount(deps.investment, viable[h].countryId, currentTurn);
        if (recent === null) continue;
        if (recent >= activeRules.limits.maxInboundInvestmentsPerHostWindow) continue;
        var company = chooseCompany(countryId, viable[h].countryId, checkpoint, currentTurn);
        if (company.status === 'WAITING') {
          stats.deferred++;
          return { status: 'DEFERRED', reason: company.reason };
        }
        if (company.status !== 'READY') continue;
        chosen = { host: viable[h], company: company, recentInboundCount: recent };
        break;
      }
      if (!chosen) {
        var portfolioBlocked = {
          status: 'NO_QUALIFIED_INVESTMENT',
          investorCountryId: countryId,
          assessedCountryCount: assessed,
          qualifiedHostCount: viable.length,
          reason: 'HOST_CAPACITY_OR_COMPANY_CAPITAL_UNAVAILABLE',
          turn: currentTurn
        };
        var portfolioSaved = saveDecision(countryId, checkpoint, currentTurn, portfolioBlocked);
        return portfolioSaved.accepted ? portfolioBlocked : { status: 'CHECKPOINT_FAILED', reason: portfolioSaved.reason };
      }
      var requestId = 'NPCFDI-' + countryId + '-' + chosen.host.countryId + '-' +
        chosen.company.companyId + '-' + currentTurn;
      var pending = {
        investorCountryId: countryId,
        hostCountryId: chosen.host.countryId,
        companyId: chosen.company.companyId,
        companyIndex: chosen.company.companyIndex,
        amount: chosen.company.amount,
        currencyCode: chosen.company.currencyCode,
        requestId: requestId,
        hostScore: chosen.host.score,
        createdTurn: currentTurn
      };
      checkpoint.pendingTransfer = clone(pending);
      var pendingSaved = persist(countryId, checkpoint, currentTurn);
      if (!pendingSaved.accepted) {
        checkpoint.pendingTransfer = null;
        return { status: 'CHECKPOINT_FAILED', reason: pendingSaved.reason };
      }
      var result = await deps.investment.invest({
        investorCountryId: countryId,
        hostCountryId: pending.hostCountryId,
        companyId: pending.companyId,
        requestId: pending.requestId,
        amount: pending.amount
      });
      var completed = finishPending(countryId, checkpoint, currentTurn, result);
      stats.lastResult = clone(completed);
      return completed;
    })().catch(function (error) {
      stats.errors++;
      return { status: 'ERROR', reason: String(error && error.message || error) };
    }).finally(function () {
      if (inFlight.get(countryId) === task) inFlight.delete(countryId);
    });
    inFlight.set(countryId, task);
    return task;
  }
  function install() {
    var deps = dependencies();
    if (!commandRegistered && deps.interop &&
        typeof deps.interop.registerCommandHandler === 'function' &&
        typeof deps.interop.dispatchCommand === 'function') {
      try {
        if (typeof deps.interop.registerAction === 'function') {
          deps.interop.registerAction(COMMAND_TYPE, {
            actionId: COMMAND_TYPE,
            stateOwnerMinistry: 'finance',
            authority: 'OMEGA_AUTONOMOUS_PRIVATE_INVESTMENT_DECISION_V1'
          });
        }
      } catch (_) {}
      try {
        deps.interop.registerCommandHandler(COMMAND_TYPE, 'finance', checkpointHandler);
        commandRegistered = true;
      } catch (error) {
        stats.errors++;
      }
    }
    if (!unregisterScheduler && deps.scheduler &&
        typeof deps.scheduler.registerCountryHandler === 'function') {
      try {
        unregisterScheduler = deps.scheduler.registerCountryHandler(HANDLER_ID, processCountry, {
          tiers: ['ACTIVE', 'MACRO'],
          priority: activeRules && activeRules.scheduler.priority || 76
        });
      } catch (error) {
        stats.errors++;
      }
    }
    return diagnostics();
  }
  function init() {
    prepare();
    install();
    if (!g.__omegaAutonomousPrivateInvestmentHook && typeof g.addEventListener === 'function') {
      g.__omegaAutonomousPrivateInvestmentHook = true;
      g.addEventListener('OMEGA_READY', function () { prepare(); install(); });
      g.addEventListener('OMEGA_GAME_SESSION_STARTED', function () { prepare(); install(); });
    }
    return diagnostics();
  }
  function diagnostics() {
    return {
      version: VERSION,
      rulesStatus: rulesStatus,
      rulesEnabled: !!activeRules,
      schedulerHandlerRegistered: typeof unregisterScheduler === 'function',
      checkpointCommandRegistered: commandRegistered,
      schedulerTiers: activeRules ? clone(activeRules.scheduler.tiers) : ['ACTIVE', 'MACRO'],
      schedulerPriority: activeRules ? activeRules.scheduler.priority : 76,
      playerCountryAutomation: false,
      maximumHostCandidatesPerVisit: activeRules ? activeRules.limits.maxHostCandidatesPerVisit : null,
      maximumInboundInvestmentsPerHostWindow: activeRules ? activeRules.limits.maxInboundInvestmentsPerHostWindow : null,
      usesExistingFDISettlement: true,
      usesExistingPrivateCompanyWallets: true,
      usesExistingPrivateEnterpriseCountryRoster: true,
      usesExistingWorldScheduler: true,
      usesTimersOrAnimationLoop: false,
      createsFactoriesOrProduction: false,
      approvesHostGovernmentPermits: false,
      debitsSovereignTreasury: false,
      hostRosterCount: hostRoster ? hostRoster.length : 0,
      inFlightCountryCount: inFlight.size,
      stats: clone(stats)
    };
  }
  var API = Object.freeze({
    VERSION: VERSION,
    HANDLER_ID: HANDLER_ID,
    COMMAND_TYPE: COMMAND_TYPE,
    COMPANY_IDS: COMPANY_IDS.slice(),
    init: init,
    prepare: prepare,
    install: install,
    processCountry: processCountry,
    scoreHost: function (investorId, hostId, inputState) {
      return scoreHost(inputState || rootState(), canonicalCountry(investorId), canonicalCountry(hostId));
    },
    getDecisionState: function (countryId) { return currentCheckpoint(canonicalCountry(countryId)); },
    diagnostics: diagnostics
  });
  g.Omega = g.Omega || {};
  g.Omega.AutonomousPrivateInvestmentDecisionEngineV1 = API;
  g.OmegaAutonomousPrivateInvestmentDecisionEngineV1 = API;
  init();
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
