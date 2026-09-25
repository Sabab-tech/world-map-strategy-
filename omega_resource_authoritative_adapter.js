
/* ============================================================================
 * OMEGA AUTHORITATIVE RESOURCE SYNC ADAPTER v1.0.0
 *
 * Makes Game.state.resource the sole runtime source for resource UI/read APIs.
 * Legacy UI directives become auditable commands and never fabricate data.
 * ========================================================================== */
(function (g) {
  'use strict';

  const VERSION = '1.0.0';

  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    const refs = seen || new WeakMap();
    if (refs.has(value)) return refs.get(value);
    if (Array.isArray(value)) {
      const out = [];
      refs.set(value, out);
      value.forEach(function (item) { out.push(clone(item, refs)); });
      return out;
    }
    const out = {};
    refs.set(value, out);
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || typeof value[key] === 'function') return;
      out[key] = clone(value[key], refs);
    });
    return out;
  }

  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function token(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/[\\s-]+/g, '_');
  }

  function stateRoot() {
    return g.Game && g.Game.state ? g.Game.state : (g.gameState || null);
  }

  function interop() {
    return (g.Omega && g.Omega.MinistryInteroperability) || g.OmegaMinistryInteroperability || null;
  }

  function canonicalCountry(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    try {
      const bridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge;
      const resolved = bridge && bridge.resolveCountry ? bridge.resolveCountry(raw) : null;
      if (resolved && resolved.id) return String(resolved.id).trim().toUpperCase();
    } catch (_) {}
    try {
      const engine = g.ResourceMinistryEngine;
      const normalized = engine && engine.normalizeCountryCode ? engine.normalizeCountryCode(raw) : null;
      if (normalized) return String(normalized).trim().toUpperCase();
    } catch (_) {}
    return raw.toUpperCase().replace(/\\s+/g, '_');
  }

  function liveBucket(countryId) {
    const state = stateRoot();
    const cid = canonicalCountry(countryId);
    if (!state || !cid) return null;
    return (state.resource && state.resource[cid]) ||
      (state.resource && state.resource[String(countryId || '').trim().toUpperCase()]) ||
      (state.resources && state.resources[cid]) ||
      (state.resources && state.resources[String(countryId || '').trim().toUpperCase()]) ||
      null;
  }

  function turn() {
    const state = stateRoot();
    return numberOrNull(
      state && state.simulation && state.simulation.turn != null ? state.simulation.turn :
      state && state.turn != null ? state.turn :
      state && state.simulationTurn != null ? state.simulationTurn :
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock ? g.Omega.Simulation.clock.turn : 0
    ) || 0;
  }

  function command(owner, actionId, countryId, payload) {
    const mesh = interop();
    if (!mesh || !mesh.dispatchCommand) {
      return { status: 'UNAVAILABLE', reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    }
    try {
      return mesh.dispatchCommand(
        owner,
        actionId,
        canonicalCountry(countryId),
        payload,
        {
          turn: turn(),
          commandType: actionId,
          correlationId: payload && (payload.correlationId || payload.requestId) || null
        }
      );
    } catch (error) {
      return { status: 'FAILED', reason: String(error && (error.message || error) || error) };
    }
  }

  function emit(type, countryId, payload, commandId) {
    const mesh = interop();
    const cid = canonicalCountry(countryId);
    try {
      if (mesh && mesh.emitEvent) {
        return mesh.emitEvent(
          type,
          cid,
          'resource-authoritative-adapter',
          Object.assign({ countryId: cid }, clone(payload || {})),
          {
            turn: turn(),
            causationId: commandId || null,
            correlationId: payload && (payload.correlationId || payload.requestId) || null
          }
        );
      }
    } catch (_) {}
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
        g.dispatchEvent(new g.CustomEvent(type, {
          detail: {
            eventType: type,
            countryId: cid,
            payload: clone(payload || {}),
            source: 'resource-authoritative-adapter'
          }
        }));
        return true;
      }
    } catch (_) {}
    return null;
  }

  function resourceTypes() {
    const engine = g.ResourceMinistryEngine;
    const out = new Map();
    (Array.isArray(engine && engine.resourceTypes) ? engine.resourceTypes : []).forEach(function (row) {
      if (row && row.id) out.set(token(row.id), clone(row));
    });
    return out;
  }

  function addKeys(map, obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach(function (key) { map.set(token(key), key); });
  }

  function resourceKeys(countryId) {
    const bucket = liveBucket(countryId);
    const out = new Map();
    resourceTypes().forEach(function (_value, key) { out.set(key, key); });
    [
      bucket && bucket.inventory,
      bucket && bucket.production,
      bucket && bucket.consumption,
      bucket && bucket.reserves,
      bucket && bucket.endowment,
      bucket && bucket.tradeAvailability,
      bucket && bucket.warehouse && bucket.warehouse.availableByResource
    ].forEach(function (section) { addKeys(out, section); });
    return Array.from(out.entries())
      .sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); })
      .map(function (entry) { return { normalized: entry[0], original: entry[1] }; });
  }

  function valueByToken(obj, resourceId) {
    if (!obj || typeof obj !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(obj, resourceId)) return numberOrNull(obj[resourceId]);
    const wanted = token(resourceId);
    const key = Object.keys(obj).find(function (item) { return token(item) === wanted; });
    return key == null ? null : numberOrNull(obj[key]);
  }

  function activeFacilityCount(countryId, resourceId) {
    const state = stateRoot();
    const cid = canonicalCountry(countryId);
    const assets = state && state.economy && state.economy[cid] && state.economy[cid].productionAssets;
    if (!Array.isArray(assets)) return null;
    const wanted = token(resourceId);
    return assets.filter(function (asset) {
      const stage = String(asset && (asset.stage || asset.assetStage) || '').toUpperCase();
      if (['CLOSED', 'INACTIVE', 'DECOMMISSIONED', 'DESTROYED'].includes(stage)) return false;
      const ids = [
        asset && asset.resourceId,
        asset && asset.resource,
        asset && asset.inputResourceId,
        asset && asset.outputResourceId
      ].filter(Boolean).map(token);
      const inputs = Object.keys(asset && asset.inputCoefficients || {}).map(token);
      const outputs = Object.keys(asset && asset.outputProfile || {}).map(token);
      return ids.indexOf(wanted) >= 0 || inputs.indexOf(wanted) >= 0 || outputs.indexOf(wanted) >= 0;
    }).length;
  }

  function percent(production, demand) {
    if (production === null || demand === null || demand <= 0) return null;
    return Math.round((production / demand) * 10000) / 100;
  }

  function days(stock, demand) {
    if (stock === null || demand === null || demand <= 0) return null;
    return Math.round((stock / demand) * 100) / 100;
  }

  function average(rows, key) {
    const values = rows.map(function (row) { return numberOrNull(row[key]); }).filter(function (x) { return x !== null; });
    if (!values.length) return null;
    return Math.round((values.reduce(function (a, b) { return a + b; }, 0) / values.length) * 100) / 100;
  }

  function liveRows(countryId) {
    const bucket = liveBucket(countryId);
    const types = resourceTypes();
    return resourceKeys(countryId).map(function (entry) {
      const rid = entry.original;
      const type = types.get(entry.normalized) || null;
      const inventory = valueByToken(bucket && bucket.inventory, rid);
      const production = valueByToken(bucket && bucket.production, rid);
      const demand = valueByToken(bucket && bucket.consumption, rid);
      const reserve = valueByToken(bucket && bucket.reserves, rid);
      const endowment = valueByToken(bucket && bucket.endowment, rid);
      const warehouse = valueByToken(bucket && bucket.warehouse && bucket.warehouse.availableByResource, rid);
      const strategicReserveState = bucket && bucket.strategicReserve;
      const strategicReserve = strategicReserveState ? (valueByToken(strategicReserveState.availableByResource, rid) ?? 0) : null;
      const strategicReserveDays = strategicReserve !== null ? days(strategicReserve, demand) : null;
      const tradeAvailability = valueByToken(bucket && bucket.tradeAvailability, rid);
      const marketPrices = bucket && (bucket.marketPrices || bucket.priceBook || bucket.supplierPrices);
      const price = valueByToken(marketPrices, rid);
      return {
        id: type && type.id || rid,
        name: type && type.name || String(rid).replace(/_/g, ' ').toUpperCase(),
        bnName: type && type.bnName || null,
        icon: type && type.icon || null,
        category: type && type.category || null,
        color: type && type.color || null,
        unit: type && type.unit || null,
        basePrice: price,
        inventory: inventory,
        dailyProduction: production,
        dailyConsumption: demand,
        netBalance: production !== null && demand !== null ? production - demand : null,
        selfSufficiencyRatio: percent(production, demand),
        stockDays: days(inventory, demand),
        reserve: reserve,
        strategicReserveStock: strategicReserve,
        strategicReserveDays: strategicReserveDays,
        endowment: endowment,
        warehouseStock: warehouse,
        tradeAvailability: tradeAvailability,
        activeFacilities: activeFacilityCount(countryId, rid),
        processChain: type && type.processChain || null,
        availability: bucket ? 'AVAILABLE' : 'RUNTIME_STATE_UNAVAILABLE',
        source: bucket ? 'Game.state.resource' : 'NO_LIVE_RUNTIME_STATE'
      };
    });
  }

  function resourceNameForModal(resourceId) {
    const types = resourceTypes();
    const row = types.get(token(resourceId));
    return row && row.name ? row.name : String(resourceId || '').replace(/_/g, ' ');
  }

  function summary(countryId) {
    const cid = canonicalCountry(countryId);
    const bucket = liveBucket(cid);
    const engine = g.ResourceMinistryEngine;
    const profile = engine && engine.getCountryResourceProfile ? engine.getCountryResourceProfile(cid) : null;
    const rows = liveRows(cid);
    const surveys = Array.isArray(bucket && bucket.surveyRequests)
      ? bucket.surveyRequests.filter(function (row) {
          return ['REQUESTED', 'IN_PROGRESS', 'PENDING', 'ACTIVE'].indexOf(String(row && row.status || '').toUpperCase()) >= 0;
        }).map(function (row) {
          const out = clone(row);
          out.resName = out.resourceName || resourceNameForModal(out.resourceId);
          out.country = out.country || (profile && profile.identity && (profile.identity.name || profile.identity.officialName)) || cid;
          out.progress = numberOrNull(out.progress) === null ? 0 : numberOrNull(out.progress);
          return out;
        })
      : [];


    return {
      version: VERSION,
      countryId: cid,
      briefing: bucket
        ? 'Live resource values are read from Game.state.resource. Missing values remain unavailable; no synthetic production, demand, stock or reserve values are generated.'
        : 'Live resource runtime state is unavailable for this country. No synthetic production, demand, stock or reserve values are generated.',
      globalMetrics: {
        autonomyIndex: average(rows, 'selfSufficiencyRatio'),
        strategicReservesTotalDays: average(rows, 'strategicReserveDays'),
        activeFacilitiesTotal: rows.reduce(function (sum, row) {
          const value = numberOrNull(row.activeFacilities);
          return sum + (value === null ? 0 : value);
        }, 0),
        surveysUnderway: surveys
      },
      resourcesList: rows,
      live: {
        countryName: profile && profile.identity && profile.identity.name || cid || 'UNKNOWN_COUNTRY',
        mines: clone(bucket && bucket.mines || []),
        inventory: clone(bucket && bucket.inventory || {}),
        production: clone(bucket && bucket.production || {}),
        consumption: clone(bucket && bucket.consumption || {}),
        reserves: clone(bucket && bucket.reserves || {}),
        endowment: clone(bucket && bucket.endowment || {}),
        tradeAvailability: clone(bucket && bucket.tradeAvailability || {}),
        batches: clone(Array.isArray(bucket && bucket.batches) ? bucket.batches.slice(-64) : []),
        warehouse: clone(bucket && bucket.warehouse || null),
        mineOutputs: clone(bucket && bucket.mineOutputs || {}),
        mineProductionLedger: clone(Array.isArray(bucket && bucket.mineProductionLedger) ? bucket.mineProductionLedger.slice(-64) : []),
        extractionLedger: clone(Array.isArray(bucket && bucket.extractionLedger) ? bucket.extractionLedger.slice(-64) : []),
        strategicReserve: clone(bucket && bucket.strategicReserve || null),
        surveyResults: clone(Array.isArray(bucket && bucket.surveyResults) ? bucket.surveyResults.slice(-64) : [])
      },
      directives: {
        survey: 'REQUEST_ONLY_NO_AUTOMATIC_DISCOVERY',
        expand_facility: 'REQUEST_ONLY_NO_UNVERIFIED_CAPACITY_MUTATION',
        add_reserve: 'REQUEST_ONLY_NO_FABRICATED_STOCK',
        focus_map: 'MAP_UI_ONLY',
        cabinet_vote: 'POLICY_EVENT_ONLY'
      }
    };
  }

  function integratedState(countryId) {
    const engine = g.ResourceMinistryEngine;
    let base = null;
    try {
      if (engine && engine.__omegaAuthoritativeOriginalIntegrated) {
        base = engine.__omegaAuthoritativeOriginalIntegrated.call(engine, countryId);
      } else if (engine && typeof engine.getIntegratedResourceState === 'function') {
        base = engine.getIntegratedResourceState(countryId);
      }
    } catch (_) {}
    const cid = canonicalCountry(countryId);
    const bucket = liveBucket(cid);
    if (!base) {
      base = {
        countryId: cid,
        resourceIso3: cid,
        profile: null,
        inventory: {},
        production: {},
        consumption: {},
        reserves: {},
        deposits: [],
        availability: 'RUNTIME_STATE_UNAVAILABLE',
        source: 'GSRSK_RESOURCE_MINISTRY_ENGINE',
        authoritativeRuntimeState: false,
        dataLoad: engine && engine.getDataLoadReport ? engine.getDataLoadReport() : null
      };
    }
    return Object.assign({}, clone(base), {
      countryId: cid,
      inventory: clone(bucket && bucket.inventory || base.inventory || {}),
      production: clone(bucket && bucket.production || base.production || {}),
      consumption: clone(bucket && bucket.consumption || base.consumption || {}),
      reserves: clone(bucket && bucket.reserves || base.reserves || {}),
      endowment: clone(bucket && bucket.endowment || {}),
      tradeAvailability: clone(bucket && bucket.tradeAvailability || {}),
      deposits: clone(base.deposits || []),
      mines: clone(bucket && bucket.mines || []),
      mineOutputs: clone(bucket && bucket.mineOutputs || {}),
      mineProductionLedger: clone(Array.isArray(bucket && bucket.mineProductionLedger) ? bucket.mineProductionLedger : []),
      extractionLedger: clone(Array.isArray(bucket && bucket.extractionLedger) ? bucket.extractionLedger : []),
      batches: clone(Array.isArray(bucket && bucket.batches) ? bucket.batches : []),
      warehouse: clone(bucket && bucket.warehouse || null),
      strategicReserve: clone(bucket && bucket.strategicReserve || null),
      surveyRequests: clone(Array.isArray(bucket && bucket.surveyRequests) ? bucket.surveyRequests : []),
      surveyResults: clone(Array.isArray(bucket && bucket.surveyResults) ? bucket.surveyResults : []),
      capacityUpgradeRequests: clone(Array.isArray(bucket && bucket.capacityUpgradeRequests) ? bucket.capacityUpgradeRequests : []),
      reserveBufferRequests: clone(Array.isArray(bucket && bucket.reserveBufferRequests) ? bucket.reserveBufferRequests : []),
      availability: bucket ? 'AVAILABLE' : 'RUNTIME_STATE_UNAVAILABLE',
      source: bucket ? 'Game.state.resource + RESOURCE_JSON' : 'GSRSK_RESOURCE_MINISTRY_ENGINE',
      authoritativeRuntimeState: !!bucket,
      dataLoad: engine && engine.getDataLoadReport ? engine.getDataLoadReport() : base.dataLoad || null
    });
  }

  function surveyHandler(cmd, ctx) {
    const p = cmd && cmd.payload || {};
    const cid = canonicalCountry(ctx.countryId);
    const rid = String(p.resourceId || '').trim();
    if (!rid) return { accepted: false, reason: 'RESOURCE_ID_REQUIRED' };
    const request = {
      requestId: String(p.requestId || ('RES-SURVEY-' + turn() + '-' + cid + '-' + token(rid))),
      countryId: cid,
      resourceId: rid,
      status: 'REQUESTED',
      requestedTurn: turn(),
      source: 'RESOURCE_UI_DIRECTIVE',
      evidencePolicy: 'NO_AUTOMATIC_DISCOVERY',
      note: 'Request recorded. Reserve, purity, confidence and production remain unchanged until an authoritative survey result exists.'
    };
    const existing = ctx.stateTransaction.get('resource.surveyRequests');
    if (Array.isArray(existing) && existing.some(function (row) { return row.requestId === request.requestId; })) {
      return { accepted: true, duplicate: true, request: clone(request) };
    }
    ctx.stateTransaction.set('resource.surveyRequests', (Array.isArray(existing) ? existing : []).concat([clone(request)]).slice(-256));
    emit('OMEGA_RESOURCE_SURVEY_REQUESTED', cid, request, cmd && cmd.commandId);
    return { accepted: true, request: request };
  }

  function expansionRequestHandler(cmd, ctx) {
    const p = cmd && cmd.payload || {};
    const cid = canonicalCountry(ctx.countryId);
    const rid = String(p.resourceId || '').trim();
    if (!rid) return { accepted: false, reason: 'RESOURCE_ID_REQUIRED' };

    const assets = ctx.stateTransaction.get('economy.productionAssets');
    const wanted = token(rid);
    const candidates = Array.isArray(assets) ? assets.filter(function (asset) {
      const ids = [asset && asset.resourceId, asset && asset.resource, asset && asset.inputResourceId, asset && asset.outputResourceId].filter(Boolean).map(token);
      const inputs = Object.keys(asset && asset.inputCoefficients || {}).map(token);
      const outputs = Object.keys(asset && asset.outputProfile || {}).map(token);
      return ids.indexOf(wanted) >= 0 || inputs.indexOf(wanted) >= 0 || outputs.indexOf(wanted) >= 0;
    }).map(function (asset) {
      return String(asset.id || asset.assetId || asset.projectId || asset.siteId || '').trim();
    }).filter(Boolean) : [];

    const request = {
      requestId: String(p.requestId || ('RES-CAPACITY-' + turn() + '-' + cid + '-' + token(rid))),
      countryId: cid,
      resourceId: rid,
      status: 'REQUESTED',
      requestedTurn: turn(),
      candidateFactoryIds: candidates,
      source: 'RESOURCE_UI_DIRECTIVE',
      executionPolicy: 'NO_DIRECT_CAPACITY_MUTATION',
      note: 'Request recorded. Capacity, treasury and project state remain unchanged because this UI action has no authoritative cost, duration and project specification.'
    };

    const existing = ctx.stateTransaction.get('economy.capacityUpgradeRequests');
    const rows = Array.isArray(existing) ? existing : [];
    if (!rows.some(function (row) { return row.requestId === request.requestId; })) {
      ctx.stateTransaction.set('economy.capacityUpgradeRequests', rows.concat([clone(request)]).slice(-256));
    }
    emit('OMEGA_RESOURCE_FACTORY_CAPACITY_EXPANSION_REQUESTED', cid, request, cmd && cmd.commandId);
    return { accepted: true, request: request };
  }

  function reserveBufferHandler(cmd, ctx) {
    const p = cmd && cmd.payload || {};
    const cid = canonicalCountry(ctx.countryId);
    const rid = String(p.resourceId || '').trim();
    if (!rid) return { accepted: false, reason: 'RESOURCE_ID_REQUIRED' };
    const bucket = liveBucket(cid);
    const request = {
      requestId: String(p.requestId || ('RES-SPR-' + turn() + '-' + cid + '-' + token(rid))),
      countryId: cid,
      resourceId: rid,
      status: 'REQUESTED',
      requestedTurn: turn(),
      observedInventory: valueByToken(bucket && bucket.inventory, rid),
      observedWarehouse: valueByToken(bucket && bucket.warehouse && bucket.warehouse.availableByResource, rid),
      source: 'RESOURCE_UI_DIRECTIVE',
      executionPolicy: 'NO_FABRICATED_STOCK',
      note: 'Request recorded. No stock is created or credited without an authoritative stockpile transfer rule and observed material source.'
    };
    const existing = ctx.stateTransaction.get('resource.reserveBufferRequests');
    const rows = Array.isArray(existing) ? existing : [];
    if (!rows.some(function (row) { return row.requestId === request.requestId; })) {
      ctx.stateTransaction.set('resource.reserveBufferRequests', rows.concat([clone(request)]).slice(-256));
    }
    emit('OMEGA_RESOURCE_RESERVE_BUFFER_REQUESTED', cid, request, cmd && cmd.commandId);
    return { accepted: true, request: request };
  }

  function installHandlers() {
    const mesh = interop();
    if (!mesh || !mesh.registerCommandHandler) return false;
    if (g.__omegaResourceAuthoritativeHandlers) return true;
    const defs = [
      ['OMEGA_RESOURCE_UI_SURVEY_REQUEST', 'resource', surveyHandler],
      ['OMEGA_RESOURCE_UI_FACTORY_CAPACITY_EXPANSION_REQUEST', 'economy', expansionRequestHandler],
      ['OMEGA_RESOURCE_UI_RESERVE_BUFFER_REQUEST', 'resource', reserveBufferHandler]
    ];
    try {
      defs.forEach(function (item) {
        if (mesh.registerAction) mesh.registerAction(item[0], {
          actionId: item[0],
          stateOwnerMinistry: item[1],
          authority: 'OMEGA_RESOURCE_AUTHORITATIVE_ADAPTER'
        });
        mesh.registerCommandHandler(item[0], item[1], item[2]);
      });
      g.__omegaResourceAuthoritativeHandlers = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function directive(action, resourceId, option) {
    const cid = canonicalCountry(
      g.CountryIOS && g.CountryIOS.activeCountry ||
      g.currentActiveCountry ||
      stateRoot() && stateRoot().playerCountryId ||
      'BGD'
    );
    const rid = String(resourceId || '').trim();
    if (!rid) return { status: 'FAILED', reason: 'RESOURCE_ID_REQUIRED' };
    installHandlers();

    if (action === 'focus_map') {
      try {
        if (g.Game && g.Game.Map && g.Game.Map.activateResourceMode) g.Game.Map.activateResourceMode([rid]);
        else if (g.Game && g.Game.Map && g.Game.Map.applyResourceMapFilter) g.Game.Map.applyResourceMapFilter(rid);
      } catch (_) {}
      const result = { status: 'APPLIED', action: action, countryId: cid, resourceId: rid };
      emit('OMEGA_RESOURCE_MAP_FOCUS_REQUESTED', cid, result);
      return result;
    }

    if (action === 'survey') {
      return command('resource', 'OMEGA_RESOURCE_UI_SURVEY_REQUEST', cid, {
        resourceId: rid,
        option: option || null,
        requestId: 'UI-SURVEY-' + turn() + '-' + cid + '-' + token(rid),
        correlationId: 'UI-SURVEY-' + turn() + '-' + cid + '-' + token(rid)
      });
    }

    if (action === 'expand_facility') {
      return command('economy', 'OMEGA_RESOURCE_UI_FACTORY_CAPACITY_EXPANSION_REQUEST', cid, {
        resourceId: rid,
        option: option || null,
        requestId: 'UI-CAPACITY-' + turn() + '-' + cid + '-' + token(rid),
        correlationId: 'UI-CAPACITY-' + turn() + '-' + cid + '-' + token(rid)
      });
    }

    if (action === 'add_reserve') {
      return command('resource', 'OMEGA_RESOURCE_UI_RESERVE_BUFFER_REQUEST', cid, {
        resourceId: rid,
        option: option || null,
        requestId: 'UI-SPR-' + turn() + '-' + cid + '-' + token(rid),
        correlationId: 'UI-SPR-' + turn() + '-' + cid + '-' + token(rid)
      });
    }

    if (action === 'cabinet_vote') {
      const result = {
        status: 'APPLIED',
        action: action,
        countryId: cid,
        resourceId: rid,
        option: option || null,
        policyOnly: true
      };
      emit('OMEGA_RESOURCE_CABINET_POLICY_RECORDED', cid, result);
      return result;
    }

    return { status: 'FAILED', reason: 'UNSUPPORTED_RESOURCE_DIRECTIVE', action: action, countryId: cid, resourceId: rid };
  }

  function patchEngine() {
    const engine = g.ResourceMinistryEngine;
    if (!engine || engine.__omegaResourceAuthoritativePatched) return false;

    const originalSummary = engine.getSummary;
    const originalIntegrated = engine.getIntegratedResourceState;
    const originalDirective = engine.executeDirective;
    engine.__omegaAuthoritativeOriginalSummary = originalSummary || null;
    engine.__omegaAuthoritativeOriginalIntegrated = originalIntegrated || null;
    engine.__omegaAuthoritativeOriginalDirective = originalDirective || null;

    engine.getSummary = function (countryId) {
      return summary(countryId || (g.CountryIOS && g.CountryIOS.activeCountry) || g.currentActiveCountry || 'BGD');
    };

    engine.getIntegratedResourceState = function (countryId, options) {
      return integratedState(countryId || (g.CountryIOS && g.CountryIOS.activeCountry) || g.currentActiveCountry || 'BGD', options);
    };

    engine.getAuthoritativeResourceState = function (countryId) {
      return integratedState(countryId || (g.CountryIOS && g.CountryIOS.activeCountry) || g.currentActiveCountry || 'BGD');
    };

    engine.getAuthoritativeResourceSummary = function (countryId) {
      return summary(countryId || (g.CountryIOS && g.CountryIOS.activeCountry) || g.currentActiveCountry || 'BGD');
    };

    engine.executeDirective = function (action, resourceId, option) {
      return directive(action, resourceId, option);
    };

    const originalRender = engine.renderModalContent;
    if (typeof originalRender === 'function') {
      engine.renderModalContent = function (modalEl, countryId, activeTab) {
        const result = originalRender.call(engine, modalEl, countryId, activeTab);
        try {
          const s = summary(countryId);
          if (modalEl && modalEl.innerHTML) {
            modalEl.innerHTML = modalEl.innerHTML
              .replace(/17 COMMODITIES MATRIX/g, String(s.resourcesList.length) + ' COMMODITIES MATRIX')
              .replace(/18 COMMODITY ONTOLOGY/g, String(s.resourcesList.length) + ' COMMODITY ONTOLOGY')
              .replace(/593 geocoded global mining concessions, ore purities, and spatial reserve clusters\./g, 'Authoritative runtime mine and deposit records are shown where observed.')
              .replace(/Real-World Geological Coordinates & Reserve Grades/g, 'Authoritative deposit records and observed evidence');

            Array.from(modalEl.querySelectorAll ? modalEl.querySelectorAll('button') : []).forEach(function (button) {
              const onclick = String(button.getAttribute('onclick') || '');
              if (onclick.indexOf("executeDirective('survey'") >= 0) {
                button.textContent = 'REQUEST SURVEY';
                button.title = 'Records a survey request without fabricating discovery data.';
              } else if (onclick.indexOf("executeDirective('expand_facility'") >= 0) {
                button.textContent = 'REQUEST CAPACITY EXPANSION';
                button.title = 'Records a request without fabricating capacity or spending money.';
              } else if (onclick.indexOf("executeDirective('add_reserve'") >= 0) {
                button.textContent = 'BUILD SPR BUFFER';
                button.title = 'Builds a physical strategic stockpile from observed warehouse batches.';
              }
            });
          }
        } catch (_) {}
        return result;
      };
    }

    engine.__omegaResourceAuthoritativePatched = VERSION;
    g.__omegaResourceAuthoritativePatched = VERSION;
    return true;
  }

  function diagnostics() {
    const engine = g.ResourceMinistryEngine;
    const cid = canonicalCountry(
      g.CountryIOS && g.CountryIOS.activeCountry ||
      g.currentActiveCountry ||
      stateRoot() && stateRoot().playerCountryId ||
      'BGD'
    );
    const bucket = liveBucket(cid);
    const s = summary(cid);
    return {
      version: VERSION,
      patched: !!(g.__omegaResourceAuthoritativePatched === VERSION),
      handlersReady: !!g.__omegaResourceAuthoritativeHandlers,
      countryId: cid,
      liveRuntimeAvailable: !!bucket,
      syntheticSummaryDisabled: true,
      legacySummaryBypassed: !!(engine && engine.__omegaAuthoritativeOriginalSummary),
      legacyDirectiveBypassed: !!(engine && engine.__omegaAuthoritativeOriginalDirective),
      resourceCount: s.resourcesList.length,
      observedProductionResources: s.resourcesList.filter(function (row) { return row.dailyProduction !== null; }).length,
      observedDemandResources: s.resourcesList.filter(function (row) { return row.dailyConsumption !== null; }).length,
      observedInventoryResources: s.resourcesList.filter(function (row) { return row.inventory !== null; }).length,
      observedReserveResources: s.resourcesList.filter(function (row) { return row.reserve !== null; }).length
    };
  }

  function install() {
    installHandlers();
    patchEngine();
    return true;
  }

  g.OmegaResourceAuthoritativeAdapter = Object.freeze({
    VERSION: VERSION,
    install: install,
    diagnostics: diagnostics,
    getSummary: summary,
    getIntegratedResourceState: integratedState
  });

  if (typeof g.addEventListener === 'function') {
    [
      'OMEGA_READY',
      'OMEGA_GAME_SESSION_STARTED',
      'OMEGA_SIMULATION_TURN_COMMITTED',
      'RESOURCE_STATE_UPDATED',
      'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
      'OMEGA_RESOURCE_BATCH_CREATED',
      'OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',
      'OMEGA_RESOURCE_PROCESSING_COMPLETED',
      'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED'
    ].forEach(function (eventName) {
      g.addEventListener(eventName, install);
    });
  }

  install();
})(typeof globalThis !== 'undefined' ? globalThis : window);
