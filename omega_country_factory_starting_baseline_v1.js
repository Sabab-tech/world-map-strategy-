/* OMEGA COUNTRY FACTORY STARTING BASELINE v1.0.0
 * Explicit game-scaled industrial starting counts for all 197 core countries
 * and all 21 canonical factory types. Counts are a gameplay baseline, not a
 * physical factory census, and are kept separate from commissioned live assets.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  var DATA_PATH = './country_factory_starting_baseline_v1.json';
  var CATALOG_PATH = './resource_industrial_catalog_v1.json';
  var COUNTRY_CONTEXT_PATH = './resource_country_resource_context_index.json';
  var ECONOMY_PROFILE_PATH = './economy_global_profiles_v1.json';
  var loaded = null;
  var loadPromise = null;
  var loadError = null;
  var pendingInitialization = Promise.resolve(null);
  var pendingSession = null;
  var simulationUnsubscribe = null;
  var installed = false;
  var lastReport = null;
  var running = Object.create(null);

  function own(value, key) {
    return !!value && Object.prototype.hasOwnProperty.call(value, key);
  }
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function text(value) {
    return String(value == null ? '' : value).trim();
  }
  function id(value) {
    return text(value).toUpperCase();
  }
  function token(value) {
    return text(value).normalize('NFKC').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function finite(value) {
    var n = Number(value);
    return value !== null && value !== '' && Number.isFinite(n) ? n : null;
  }
  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) {
      if (seen[i][0] === value) return seen[i][1];
    }
    var out = Array.isArray(value) ? [] : {};
    seen.push([value, out]);
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor') return;
      if (value[key] === undefined || typeof value[key] === 'function') return;
      out[key] = clone(value[key], seen);
    });
    return out;
  }
  function rootState() {
    return (g.Game && g.Game.state) || g.gameState ||
      (g.Omega && g.Omega.SimulationRuntime && g.Omega.SimulationRuntime.world &&
        g.Omega.SimulationRuntime.world.state) ||
      (g.Omega && g.Omega.Simulation && g.Omega.Simulation.world &&
        g.Omega.Simulation.world.state) || null;
  }
  function sessionFromState(state) {
    return state && state.simulation && isObject(state.simulation.session)
      ? state.simulation.session : null;
  }
  function currentTurn(state) {
    state = state || rootState() || {};
    var values = [
      state.simulation && state.simulation.turn,
      state.turn,
      state.simulationTurn,
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn
    ];
    for (var i = 0; i < values.length; i++) {
      var n = finite(values[i]);
      if (n !== null) return Math.max(0, n);
    }
    return 0;
  }
  function dispatchEvent(type, detail) {
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
        g.dispatchEvent(new g.CustomEvent(type, { detail: clone(detail || {}) }));
      }
    } catch (_) {}
  }
  function fetchJson(path) {
    if (typeof g.fetch !== 'function') {
      return Promise.reject(new Error('COUNTRY_FACTORY_STARTING_BASELINE_FETCH_UNAVAILABLE:' + path));
    }
    return g.fetch(path, { cache: 'default' }).then(function (response) {
      if (!response || response.ok === false) {
        throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_FETCH_FAILED:' + path);
      }
      return response.json();
    });
  }
  function validateSources(values) {
    var baseline = values[0];
    var catalog = values[1];
    var countryContext = values[2];
    var economy = values[3];
    if (!isObject(baseline) || !isObject(baseline.countries) ||
        !Array.isArray(baseline.factoryTypes) || !isObject(catalog) ||
        !isObject(catalog.factoryProfiles) || !isObject(countryContext) ||
        !isObject(countryContext.countries) || !Array.isArray(economy.countries)) {
      throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_SOURCE_SCHEMA_INVALID');
    }
    var countryIds = Object.keys(baseline.countries).sort();
    var contextIds = Object.keys(countryContext.countries).sort();
    var factoryIds = Object.keys(catalog.factoryProfiles).sort();
    var recordedFactoryIds = baseline.factoryTypes.map(function (row) { return id(row && row.id); }).sort();
    if (baseline.countryCount !== 197 || countryIds.length !== 197 ||
        countryContext.countryCount !== 197 || contextIds.length !== 197) {
      throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_COUNTRY_COUNT_MISMATCH');
    }
    if (baseline.factoryTypeCount !== 21 || factoryIds.length !== 21 ||
        recordedFactoryIds.length !== 21 || factoryIds.join('|') !== recordedFactoryIds.join('|')) {
      throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_FACTORY_CATALOG_MISMATCH');
    }
    if (countryIds.join('|') !== contextIds.join('|')) {
      throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_COUNTRY_ROSTER_MISMATCH');
    }
    var economyByCode = Object.create(null);
    economy.countries.forEach(function (profile) {
      var code = id(profile && profile.iso3);
      if (code) economyByCode[code] = profile;
    });
    var totalFactoryUnits = 0;
    countryIds.forEach(function (countryId) {
      var row = baseline.countries[countryId];
      var counts = row && row.factoryCounts;
      if (!isObject(row) || id(row.countryId) !== countryId || !isObject(counts)) {
        throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_COUNTRY_RECORD_INVALID:' + countryId);
      }
      var countKeys = Object.keys(counts).sort();
      if (countKeys.length !== 21 || countKeys.join('|') !== factoryIds.join('|')) {
        throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_TYPE_ROW_INCOMPLETE:' + countryId);
      }
      var total = 0;
      factoryIds.forEach(function (factoryType) {
        var quantity = counts[factoryType];
        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_INVALID_COUNT:' + countryId + ':' + factoryType);
        }
        total += quantity;
      });
      if (total !== row.totalStartingFactoryUnits) {
        throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_TOTAL_MISMATCH:' + countryId);
      }
      var economicProfile = economyByCode[countryId];
      if (!economicProfile || text(economicProfile.name) !== text(row.countryName)) {
        throw new Error('COUNTRY_FACTORY_STARTING_BASELINE_ECONOMY_PROFILE_MISMATCH:' + countryId);
      }
      totalFactoryUnits += total;
    });
    return {
      baseline: baseline,
      catalog: catalog,
      countryContext: countryContext,
      economyProfiles: economyByCode,
      countryIds: countryIds,
      factoryIds: factoryIds,
      totalFactoryUnits: totalFactoryUnits
    };
  }
  function loadSources() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetchJson(DATA_PATH),
      fetchJson(CATALOG_PATH),
      fetchJson(COUNTRY_CONTEXT_PATH),
      fetchJson(ECONOMY_PROFILE_PATH)
    ]).then(function (values) {
      loaded = validateSources(values);
      loadError = null;
      var report = {
        version: VERSION,
        status: 'READY',
        countryCount: loaded.countryIds.length,
        factoryTypeCount: loaded.factoryIds.length,
        totalStartingFactoryUnits: loaded.totalFactoryUnits,
        modelAuthority: 'SIMULATED_COUNTRY_STARTING_INDUSTRY_PROFILE_V1'
      };
      dispatchEvent('OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_READY', report);
      return report;
    }).catch(function (error) {
      loaded = null;
      loadError = text(error && error.message) || 'COUNTRY_FACTORY_STARTING_BASELINE_LOAD_FAILED';
      loadPromise = null;
      dispatchEvent('OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_FAILED', {
        version: VERSION, status: 'BLOCKED', reason: loadError
      });
      return { version: VERSION, status: 'BLOCKED', reason: loadError };
    });
    return loadPromise;
  }
  function findCountryRow(countryId) {
    if (!loaded) return null;
    var wanted = token(countryId);
    var direct = loaded.baseline.countries[id(countryId)];
    if (direct) return direct;
    if (!wanted) return null;
    for (var i = 0; i < loaded.countryIds.length; i++) {
      var row = loaded.baseline.countries[loaded.countryIds[i]];
      var profile = loaded.economyProfiles[row.countryId] || {};
      var aliases = [row.countryId, row.countryCode, row.countryName, profile.name,
        profile.economyKey, profile.populationKey, profile.countryCode, profile.iso2]
        .filter(Boolean);
      if (aliases.some(function (alias) { return token(alias) === wanted; })) return row;
    }
    return null;
  }
  function eligibleSession(state, session) {
    if (!session) return false;
    var turn = currentTurn(state);
    var createdTurn = finite(session.createdTurn);
    if (turn > 1 || (createdTurn !== null && createdTurn > 1)) return false;
    var status = id(session.status);
    if (['READY', 'RUNNING', 'PAUSED'].indexOf(status) < 0) return false;
    var player = id(session.playerCountryId);
    return !!player && player !== 'GLOBAL' && player !== 'WORLD';
  }
  function initializeForSession(sessionInput) {
    return loadSources().then(function (ready) {
      if (!ready || ready.status !== 'READY' || !loaded) {
        return { version: VERSION, status: 'BLOCKED', reason: ready && ready.reason || loadError || 'STARTING_BASELINE_NOT_READY' };
      }
      var state = rootState();
      if (!isObject(state)) return { version: VERSION, status: 'BLOCKED', reason: 'AUTHORITATIVE_GAME_STATE_UNAVAILABLE' };
      var currentSession = sessionFromState(state);
      var session = isObject(sessionInput) ? sessionInput : currentSession;
      if (!session) return { version: VERSION, status: 'BLOCKED', reason: 'GAME_SESSION_NOT_AVAILABLE' };
      var expectedId = text(session.sessionId);
      var liveId = text(currentSession && currentSession.sessionId);
      if (expectedId && liveId && expectedId !== liveId) {
        return { version: VERSION, status: 'STALE_SESSION_IGNORED', expectedSessionId: expectedId, liveSessionId: liveId };
      }
      var effectiveSession = currentSession || session;
      if (!eligibleSession(state, effectiveSession)) {
        return { version: VERSION, status: 'SKIPPED_NOT_NEW_GAME', sessionId: expectedId, turn: currentTurn(state) };
      }
      var sessionId = text(effectiveSession.sessionId);
      var runningKey = sessionId || (id(effectiveSession.playerCountryId) + ':' + currentTurn(state));
      if (running[runningKey]) return running[runningKey];
      var globalMarker = state.simulation && state.simulation.countryFactoryStartingBaselineV1;
      if (isObject(globalMarker) && globalMarker.version === VERSION &&
          globalMarker.sessionId === sessionId && globalMarker.status === 'COMPLETED' &&
          globalMarker.initializedCountryCount === loaded.countryIds.length) {
        lastReport = clone(globalMarker);
        return { version: VERSION, status: 'ALREADY_INITIALIZED', report: diagnostics() };
      }
      running[runningKey] = Promise.resolve().then(function () {
        if (!isObject(state.simulation)) {
          if (own(state, 'simulation') && state.simulation !== null) {
            return { version: VERSION, status: 'BLOCKED', reason: 'SIMULATION_STATE_INVALID' };
          }
          state.simulation = {};
        }
        var currentGlobalMarker = state.simulation.countryFactoryStartingBaselineV1;
        if (isObject(currentGlobalMarker) && currentGlobalMarker.sessionId &&
            currentGlobalMarker.sessionId !== sessionId &&
            isObject(currentGlobalMarker.countries) &&
            Object.keys(currentGlobalMarker.countries).length >= loaded.countryIds.length) {
          lastReport = clone(currentGlobalMarker);
          return { version: VERSION, status: 'EXISTING_BASELINE_PRESERVED', reason: 'PRIOR_SESSION_BASELINE_NOT_OVERWRITTEN' };
        }
        var countryAllocations = Object.create(null);
        loaded.countryIds.forEach(function (countryId) {
          var row = loaded.baseline.countries[countryId];
          countryAllocations[countryId] = {
            countryId: countryId,
            countryName: row.countryName,
            industryArchetype: row.industryArchetype,
            totalStartingFactoryUnits: row.totalStartingFactoryUnits,
            factoryCounts: clone(row.factoryCounts),
            specializations: clone(row.specializations || []),
            authority: 'SIMULATED_COUNTRY_STARTING_INDUSTRY_PROFILE_V1',
            simulationOnly: true,
            realWorldFacilityCounts: false,
            liveProductionAssetsCreated: false
          };
        });
        var summary = {
          version: VERSION,
          datasetVersion: loaded.baseline.version,
          sessionId: sessionId || null,
          playerCountryId: id(effectiveSession.playerCountryId),
          initializedAtTurn: currentTurn(state),
          countryCount: loaded.countryIds.length,
          factoryTypeCount: loaded.factoryIds.length,
          totalStartingFactoryUnits: loaded.totalFactoryUnits,
          countriesCreated: loaded.countryIds.length,
          countriesPreserved: 0,
          countriesBlocked: 0,
          countryFailures: [],
          initializedCountryCount: loaded.countryIds.length,
          countries: countryAllocations,
          authority: 'SIMULATED_COUNTRY_STARTING_INDUSTRY_PROFILE_V1',
          simulationOnly: true,
          realWorldFacilityCounts: false,
          productionAssetsCreated: 0,
          existingSaveDataOverwritten: false,
          economyStateModified: false
        };
        summary.status = summary.countriesBlocked ? 'COMPLETED_WITH_REPORTED_GAPS' : 'COMPLETED';
        state.simulation.countryFactoryStartingBaselineV1 = clone(summary);
        lastReport = clone(summary);
        dispatchEvent('OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_INITIALIZED', summary);
        return { version: VERSION, status: summary.status, report: diagnostics() };
      }).finally(function () {
        delete running[runningKey];
      });
      return running[runningKey];
    });
  }
  function onSessionCreated(event) {
    var detail = event && event.detail !== undefined ? event.detail
      : (event && event.payload !== undefined ? event.payload : event || {});
    if (detail && detail.payload && !detail.session && detail.payload.session) detail = detail.payload;
    var session = isObject(detail.session) ? detail.session : detail;
    if (!session || !session.playerCountryId) return;
    pendingSession = clone(session);
    pendingInitialization = loadSources().then(function (ready) {
      if (!pendingSession) return ready;
      if (!ready || ready.status !== 'READY') {
        lastReport = { version: VERSION, status: 'BLOCKED', reason: ready && ready.reason || loadError };
        dispatchEvent('OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_FAILED', lastReport);
        return ready;
      }
      var target = pendingSession;
      var state = rootState();
      var current = sessionFromState(state);
      if (current && target.sessionId && current.sessionId !== target.sessionId) {
        return { version: VERSION, status: 'STALE_SESSION_IGNORED', sessionId: target.sessionId };
      }
      return initializeForSession(target);
    }).catch(function (error) {
      lastReport = { version: VERSION, status: 'BLOCKED', reason: text(error && error.message) };
      dispatchEvent('OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_FAILED', lastReport);
      return lastReport;
    }).then(function (result) {
      if (pendingSession && pendingSession.sessionId === session.sessionId) pendingSession = null;
      return result;
    });
  }
  function attachSimulationEventBus() {
    if (simulationUnsubscribe) return true;
    var runtime = g.Omega && (g.Omega.SimulationRuntime || g.Omega.Simulation);
    var ledger = runtime && runtime.events;
    if (!ledger || typeof ledger.subscribe !== 'function') return false;
    try {
      simulationUnsubscribe = ledger.subscribe('OMEGA_GAME_SESSION_CREATED', function (row) {
        var payload = row && row.payload !== undefined ? row.payload : row;
        onSessionCreated({ detail: payload });
      });
      return typeof simulationUnsubscribe === 'function' || !!simulationUnsubscribe;
    } catch (error) {
      simulationUnsubscribe = null;
      loadError = 'SIMULATION_EVENT_SUBSCRIPTION_FAILED:' + text(error && error.message);
      return false;
    }
  }
  function install() {
    if (installed) return;
    installed = true;
    if (typeof g.addEventListener === 'function') {
      g.addEventListener('OMEGA_GAME_SESSION_CREATED', onSessionCreated);
      g.addEventListener('OMEGA_READY', attachSimulationEventBus);
      if (g.document && typeof g.document.addEventListener === 'function') {
        if (g.document.readyState === 'loading') {
          g.document.addEventListener('DOMContentLoaded', attachSimulationEventBus, { once: true });
        } else {
          attachSimulationEventBus();
        }
      }
    }
    attachSimulationEventBus();
  }
  function diagnostics() {
    var state = rootState();
    var report = state && state.simulation && isObject(state.simulation.countryFactoryStartingBaselineV1)
      ? state.simulation.countryFactoryStartingBaselineV1 : lastReport;
    return {
      version: VERSION,
      status: report && report.status || (loaded ? 'READY' : loadPromise ? 'LOADING' : 'NOT_READY'),
      reason: loadError || null,
      sessionId: report && report.sessionId || null,
      countryCount: loaded ? loaded.countryIds.length : 0,
      factoryTypeCount: loaded ? loaded.factoryIds.length : 0,
      totalStartingFactoryUnits: loaded ? loaded.totalFactoryUnits : 0,
      initializedCountryCount: report && report.initializedCountryCount || 0,
      countriesCreated: report && report.countriesCreated || 0,
      countriesPreserved: report && report.countriesPreserved || 0,
      countriesBlocked: report && report.countriesBlocked || 0,
      sourcePaths: {
        baseline: DATA_PATH,
        catalog: CATALOG_PATH,
        countryContext: COUNTRY_CONTEXT_PATH,
        economyProfiles: ECONOMY_PROFILE_PATH
      },
      simulationOnly: true,
      realWorldFacilityCounts: false,
      existingSaveDataOverwritten: false
    };
  }

  var api = {
    VERSION: VERSION,
    init: function () { install(); return loadSources(); },
    get ready() { return loadSources(); },
    getCountryBaseline: function (countryId) {
      if (!loaded) return null;
      var row = findCountryRow(countryId);
      return row ? clone(row) : null;
    },
    initializeForSession: initializeForSession,
    waitForPendingInitialization: function () { return pendingInitialization; },
    diagnostics: diagnostics,
    getSourceStatus: function () {
      return {
        version: VERSION,
        status: loaded ? 'READY' : (loadPromise ? 'LOADING' : 'BLOCKED'),
        reason: loadError,
        sourcePaths: {
          baseline: DATA_PATH,
          catalog: CATALOG_PATH,
          countryContext: COUNTRY_CONTEXT_PATH,
          economyProfiles: ECONOMY_PROFILE_PATH
        }
      };
    }
  };

  g.OmegaCountryFactoryStartingBaselineV1 = api;
  g.Omega = g.Omega || {};
  g.Omega.CountryFactoryStartingBaselineV1 = api;
  install();
  loadSources();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
