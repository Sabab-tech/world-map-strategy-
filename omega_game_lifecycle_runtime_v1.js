/* OMEGA Unified Game Lifecycle: one clock, one save slot, one persistent HUD. */
(function (g) {
  'use strict';

  var SLOT = 'default';
  var SAVE_KEY = 'omega.game.save.' + SLOT;
  var DB_NAME = 'omega-game-save-db-v1';
  var DB_STORE = 'slots';
  var DAY_MS = 86400000;
  var STATE_SAVE_DEBOUNCE_MS = 1200;
  var STATE_SAVE_MAX_WAIT_MS = 8000;
  var TURN_SAVE_INTERVAL_MS = 10000;
  var lastSavedTurn = -1;
  var lastSavedAt = 0;
  var stateSaveTimer = null;
  var stateSaveFirstAt = 0;
  var mutationRevision = 0;
  var persistedRevision = 0;
  var saveInProgress = false;
  var saveInFlightPromise = null;
  var saveQueued = false;
  var saveQueuedForce = false;
  var saveQueuedCommittedTurn = false;
  var pendingExitFlush = false;
  var exitSaveStarted = false;
  var saveCount = 0;
  var lastSavedChecksum = null;
  var lastSavedStorage = null;
  var lastSaveError = null;
  var storagePersistence = 'UNKNOWN';
  var hasSavedCommittedTurn = false;
  var lifecycleFinalizerUnregister = null;
  var lastKnownSpeed = 1;
  var hiddenWasRunning = false;
  var hiddenSnapshotSaved = false;
  var restoreFailed = false;
  var restoreFinished = false;
  var restoredFromSave = false;
  var manualCommandInFlight = false;
  var saveStatus = 'AUTOSAVE READY';
  // Gameplay automation is opt-in after every boot and remains paused in the background.
  var backgroundRunsEnabled = false;
  var lastResourceHudCountry = null;
  var lastResourceHudTurn = -1;
  var hudRefreshTimer = null;
  var lastHudRefreshAt = 0;
  var HUD_REFRESH_DEBOUNCE_MS = 180;
  var HUD_REFRESH_MIN_INTERVAL_MS = 500;

  function runtime() {
    return (g.Omega && (g.Omega.SimulationRuntime || g.Omega.Simulation)) || null;
  }

  function rootState() {
    var sim = runtime();
    return (sim && sim.world && sim.world.state) || (g.Game && g.Game.state) || g.gameState || {};
  }

  function countryCode(value) {
    if (value && typeof value === 'object') {
      value = value.iso3 || value.countryCode || value.countryId || value.code || value.id || value.alpha3;
    }
    var text = String(value == null ? '' : value).trim().toUpperCase();
    return text && text !== 'GLOBAL' && text !== 'WORLD' && text !== '[OBJECT OBJECT]' ? text : null;
  }

  function playerCountry(sim) {
    sim = sim || runtime();
    var session = sim && sim.world && sim.world.state && sim.world.state.simulation &&
      sim.world.state.simulation.session;
    var candidates = [
      session && session.playerCountryId,
      sim && typeof sim.getPlayerCountryId === 'function' ? safeCall(function () { return sim.getPlayerCountryId(); }) : null,
      g.CountryIOS && g.CountryIOS.activeCountry,
      g.Game && g.Game.currentActiveCountry,
      g.Game && g.Game.playerCountry,
      g.Game && g.Game.state && (g.Game.state.playerCountryId || g.Game.state.countryId || g.Game.state.countryCode),
      g.currentActiveCountry
    ];
    for (var i = 0; i < candidates.length; i++) {
      var value = countryCode(candidates[i]);
      if (value) return value;
    }
    return null;
  }

  function safeCall(fn) {
    try { return fn(); } catch (_) { return null; }
  }

  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function compact(value, maximumFractionDigits) {
    var n = number(value);
    if (n === null) return 'Not recorded';
    var abs = Math.abs(n);
    var divisor = 1;
    var suffix = '';
    if (abs >= 1e12) { divisor = 1e12; suffix = 'T'; }
    else if (abs >= 1e9) { divisor = 1e9; suffix = 'B'; }
    else if (abs >= 1e6) { divisor = 1e6; suffix = 'M'; }
    else if (abs >= 1e3) { divisor = 1e3; suffix = 'K'; }
    var decimals = maximumFractionDigits === undefined ? (suffix ? 2 : 0) : maximumFractionDigits;
    return (n / divisor).toLocaleString('en-US', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    }) + suffix;
  }

  function money(value) {
    var n = number(value);
    if (n === null) return 'Not recorded';
    return (n < 0 ? '-$' : '$') + compact(Math.abs(n), 2);
  }

  function findCountryBucket(domain, country) {
    var root = rootState();
    var table = root && root[domain];
    if (!table || typeof table !== 'object') return null;
    var wanted = String(country || '').trim().toUpperCase();
    if (table[wanted] && typeof table[wanted] === 'object') return table[wanted];
    var keys = Object.keys(table);
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).trim().toUpperCase() === wanted && table[keys[i]] && typeof table[keys[i]] === 'object') {
        return table[keys[i]];
      }
    }
    return null;
  }

  function currentFinance(country) {
    var finance = g.OmegaFinanceMinistry;
    if (finance && typeof finance.getFinanceState === 'function') {
      return safeCall(function () { return finance.getFinanceState(country); });
    }
    return null;
  }

  function resourceInventory(country) {
    var integrated = g.ResourceMinistryEngine;
    if (integrated && typeof integrated.getIntegratedResourceState === 'function') {
      var snapshot = safeCall(function () { return integrated.getIntegratedResourceState(country); });
      if (snapshot && snapshot.inventory && typeof snapshot.inventory === 'object') return {
        inventory: snapshot.inventory,
        units: snapshot.inventoryUnits || {}
      };
    }
    var resource = findCountryBucket('resource', country);
    if (resource && resource.inventory && typeof resource.inventory === 'object') {
      return { inventory: resource.inventory, units: resource.inventoryUnits || {} };
    }
    return null;
  }

  function setText(selector, value) {
    var node = g.document && g.document.querySelector(selector);
    var text = String(value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function setSaveStatus(value) {
    saveStatus = String(value || 'AUTOSAVE READY');
    setText('[data-omega-save]', saveStatus);
    setText('#status-autosave', saveStatus);
  }

  function ensureTimeHudPlacement() {
    var doc = g.document;
    if (!doc || !doc.body || typeof doc.body.appendChild !== 'function') return false;
    var hud = typeof doc.getElementById === 'function'
      ? doc.getElementById('omega-global-time-hud') : null;
    if (!hud && typeof doc.querySelector === 'function') hud = doc.querySelector('#omega-global-time-hud');
    if (!hud) return false;
    if (hud.parentNode !== doc.body) doc.body.appendChild(hud);
    return hud.parentNode === doc.body;
  }

  function ensurePauseButton() {
    var doc = g.document;
    if (!doc || typeof doc.createElement !== 'function' || typeof doc.querySelector !== 'function') return false;
    var existing = doc.querySelector('[data-omega-action="pause"]');
    if (existing) return true;
    var controls = doc.querySelector('#omega-global-time-hud .ogth-controls');
    if (!controls || typeof controls.appendChild !== 'function') return false;
    var button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('data-omega-action', 'pause');
    button.setAttribute('aria-label', 'Pause game');
    button.setAttribute('title', 'Pause');
    button.textContent = 'Ⅱ';
    controls.appendChild(button);
    return true;
  }

  function updateControls(sim) {
    if (!g.document) return;
    var status = String(sim && sim.status || 'READY').toUpperCase();
    var running = status === 'RUNNING' && !(sim.clock && sim.clock.paused);
    var toggle = g.document.querySelector('[data-omega-action="toggle"]');
    var pause = g.document.querySelector('[data-omega-action="pause"]');
    if (toggle) {
      var toggleLabel = running ? 'PAUSE TIME' : status === 'PAUSED' ? 'RESUME TIME' : status === 'ERROR' ? 'TIME ERROR' : 'START TIME';
      toggle.textContent = '▶';
      toggle.setAttribute('aria-label', status === 'PAUSED' ? 'Resume game' : status === 'ERROR' ? 'Game unavailable' : 'Play game');
      toggle.title = toggleLabel;
      toggle.setAttribute('aria-pressed', running ? 'true' : 'false');
    }
    if (pause) {
      pause.textContent = 'Ⅱ';
      pause.setAttribute('aria-label', 'Pause game');
      pause.title = 'Pause';
      pause.setAttribute('aria-pressed', running ? 'true' : 'false');
    }
    var effectiveSpeed = number(sim && sim.clock && sim.clock.speed);
    if (effectiveSpeed !== null && effectiveSpeed > 0) lastKnownSpeed = effectiveSpeed;
    var speedButtons = g.document.querySelectorAll('[data-omega-speed]');
    for (var i = 0; i < speedButtons.length; i++) {
      var speed = number(speedButtons[i].getAttribute('data-omega-speed'));
      speedButtons[i].classList.toggle('active', running && speed === effectiveSpeed);
    }
    var legacyButtons = g.document.querySelectorAll('.speed-btn');
    for (var j = 0; j < legacyButtons.length; j++) {
      var legacySpeed = number(legacyButtons[j].getAttribute('data-speed'));
      legacyButtons[j].classList.toggle('active', running ? legacySpeed === effectiveSpeed : legacySpeed === 0);
    }
    setText('[data-omega-game-status]', status);
    var manualBusy = manualCommandInFlight || !!(sim && sim.manualAdvanceInProgress);
    var countryReady = !!(sim && playerCountry(sim));
    var clockButtons = g.document.querySelectorAll('[data-omega-action="toggle"], [data-omega-action="pause"], [data-omega-speed], .speed-btn');
    var clockUnavailable = manualBusy || status === 'ERROR' || !countryReady;
    for (var c = 0; c < clockButtons.length; c++) {
      clockButtons[c].disabled = clockUnavailable;
    }
    if (toggle) toggle.disabled = clockUnavailable || running;
    if (pause) pause.disabled = clockUnavailable || !running;
    var turnBusy = !!(sim && (sim.stepInProgress || sim.frameInProgress));
    var manualButtons = g.document.querySelectorAll('[data-omega-action="step-day"], [data-omega-action="advance-days"]');
    for (var m = 0; m < manualButtons.length; m++) {
      manualButtons[m].disabled = !countryReady || manualBusy || turnBusy || status === 'ERROR';
    }
    var cancelButton = g.document.querySelector('[data-omega-action="cancel-advance"]');
    if (cancelButton) cancelButton.disabled = !manualBusy;
  }

  function updateClockProgress() {
    if (!g.document) return;
    var sim = runtime();
    var clock = sim && sim.clock;
    var elapsed = Math.max(0, Math.min(15000, number(clock && clock.accumulatorMs) || 0));
    var percent = Math.floor((elapsed / 15000) * 100);
    var status = String(sim && sim.status || 'READY').toUpperCase();
    var running = status === 'RUNNING' && !(clock && clock.paused);
    var bar = g.document.querySelector('[data-omega-clock-progress]');
    var fill = g.document.querySelector('[data-omega-clock-progress-fill]');
    var label = g.document.querySelector('[data-omega-clock-progress-label]');
    if (fill && fill.style) fill.style.width = percent + '%';
    if (bar && typeof bar.setAttribute === 'function') {
      bar.setAttribute('aria-valuenow', String(percent));
      bar.setAttribute('aria-label', 'Progress toward next game day: ' + percent + '%');
    }
    if (label) {
      var phase = status === 'ERROR' ? 'CLOCK ERROR' : running ? 'NEXT DAY' : 'DAY PROGRESS';
      label.textContent = phase + ' · ' + percent + '%';
    }
  }

  function scheduleHudRefresh() {
    if (hudRefreshTimer !== null) return;
    var now = Date.now();
    var delay = HUD_REFRESH_DEBOUNCE_MS;
    var remaining = HUD_REFRESH_MIN_INTERVAL_MS - (now - lastHudRefreshAt);
    if (remaining > delay) delay = remaining;
    hudRefreshTimer = g.setTimeout(function () {
      hudRefreshTimer = null;
      updateHud();
    }, Math.max(0, delay));
  }

  function updateHud() {
    var sim = runtime();
    if (!sim || !sim.clock || !g.document) return;
    if (hudRefreshTimer !== null) {
      try { g.clearTimeout(hudRefreshTimer); } catch (_) {}
      hudRefreshTimer = null;
    }
    lastHudRefreshAt = Date.now();
    var root = rootState();
    var turn = Math.max(0, Math.floor(number(sim.clock.turn) || 0));
    var isoDate = safeCall(function () { return sim.clock.simulationDate(); }) ||
      (root.simulation && root.simulation.date) || '';
    var date = String(isoDate).slice(0, 10);
    setText('[data-omega-game-date]', date || 'DATE NOT RECORDED');
    setText('[data-omega-game-day]', 'DAY ' + (turn + 1).toLocaleString('en-US') + ' · TURN ' + turn.toLocaleString('en-US'));
    setText('#status-clock', (date || 'DATE NOT RECORDED') + ' · DAY ' + (turn + 1).toLocaleString('en-US'));
    updateControls(sim);
    updateClockProgress();

    var country = playerCountry(sim);
    var refreshCountryResources = (country || null) !== lastResourceHudCountry || turn !== lastResourceHudTurn;
    if (refreshCountryResources && country && typeof g.updateGlobalResourceHUD === 'function') {
      try { g.updateGlobalResourceHUD(country); } catch (_) {}
    }

    var fm = country ? currentFinance(country) : null;
    var economyState = country ? findCountryBucket('economy', country) : null;
    var macroApi = g.OmegaMacroStabilityRuntime || (g.Omega && g.Omega.MacroStabilityRuntime) || null;
    var macro = country && macroApi && typeof macroApi.getIndicators === 'function'
      ? safeCall(function () { return macroApi.getIndicators(country); }) : null;
    var treasury = number(fm && fm.treasuryBalanceUsd);
    if (treasury === null) treasury = number(economyState && economyState.treasury);
    var gdp = number(macro && macro.gdpUsd);
    if (gdp === null) gdp = number(economyState && (
      economyState.gdp ?? economyState.nominal_gdp ?? economyState.gdpCurrentUsd ??
      economyState.gdp_current_usd ?? economyState.gdpUsd ?? economyState.gdp_usd ?? economyState.GDP
    ));
    var budgetBalance = number(macro && macro.annualBudgetBalanceUsd);
    if (budgetBalance === null) budgetBalance = number(fm && fm.fiscalModel && fm.fiscalModel.annualBudgetBalanceUsd);
    if (budgetBalance === null) budgetBalance = number(economyState && (
      economyState.budget_balance ?? economyState.budgetBalanceUsd ?? economyState.annualBudgetBalanceUsd
    ));
    var stabilityScore = number(macro && macro.stabilityScore);
    var stabilityStatus = String(macro && macro.stabilityStatus || '').trim();
    var econNode = g.document.querySelector('[data-omega-economy]');
    if (econNode) {
      var scoreLabel = stabilityScore === null ? 'Not recorded' : stabilityScore.toFixed(1) + '/100';
      var economyText = (country || 'COUNTRY NOT SELECTED') +
        '  GDP ' + (gdp === null ? 'Not recorded' : money(gdp)) +
        '  Treasury ' + (treasury === null ? 'Not recorded' : money(treasury)) +
        '  Budget balance ' + (budgetBalance === null ? 'Not recorded' : money(budgetBalance)) +
        '  Stability ' + scoreLabel + (stabilityStatus ? ' · ' + stabilityStatus : '');
      if (econNode.textContent !== economyText) econNode.textContent = economyText;
      var economyTitle = 'GDP, Treasury, annual budget balance and macro stability are read from the selected country Finance/Macro Stability game state. Missing values remain Not recorded.';
      if (econNode.title !== economyTitle) econNode.title = economyTitle;
    }

    var assetNode = g.document.querySelector('[data-omega-assets]');
    if (assetNode && refreshCountryResources) {
      var values = [];
      var inventory = country ? resourceInventory(country) : null;
      if (inventory) {
        var rows = Object.keys(inventory.inventory).filter(function (key) {
          return number(inventory.inventory[key]) !== null;
        }).sort(function (a, b) {
          return a.localeCompare(b);
        });
        for (var i = 0; i < rows.length && values.length < 4; i++) {
          var key = rows[i];
          var label = key.replace(/_/g, ' ');
          var amount = compact(inventory.inventory[key], 2);
          var unit = inventory.units && inventory.units[key] ? ' ' + inventory.units[key] : '';
          values.push(label + ' ' + amount + unit);
        }
      }
      var population = country ? findCountryBucket('population', country) : null;
      var manpower = number(population && (population.active_manpower ?? population.manpower ?? population.activePersonnel));
      if (manpower !== null) values.unshift('Manpower ' + compact(manpower));
      var economyBucket = country ? findCountryBucket('economy', country) : null;
      var energy = number(economyBucket && (economyBucket.energyProduction ?? economyBucket.energyProduced ?? economyBucket.electricityProduction));
      if (energy !== null) values.push('Energy ' + compact(energy) + (economyBucket.energyUnit || economyBucket.powerUnit ? ' ' + (economyBucket.energyUnit || economyBucket.powerUnit) : ''));
      var assetsText = values.length ? values.slice(0, 5).join('  ·  ') : 'Assets/resources not recorded';
      if (assetNode.textContent !== assetsText) assetNode.textContent = assetsText;
    }
    lastResourceHudCountry = country || null;
    lastResourceHudTurn = turn;
  }
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!g.indexedDB) { reject(new Error('INDEXED_DB_UNAVAILABLE')); return; }
      var request;
      try { request = g.indexedDB.open(DB_NAME, 1); } catch (error) { reject(error); return; }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'slot' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('INDEXED_DB_OPEN_FAILED')); };
      request.onblocked = function () { reject(new Error('INDEXED_DB_BLOCKED')); };
    });
  }

  function readIndexedSave() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readonly');
        var request = tx.objectStore(DB_STORE).get(SLOT);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error || new Error('INDEXED_DB_READ_FAILED')); };
        tx.oncomplete = function () { db.close(); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('INDEXED_DB_READ_FAILED')); };
      });
    });
  }

  // Legacy lifecycle IndexedDB is read-only from this version onward. New saves
  // use Simulation.saveSlot(), which owns the canonical IndexedDB slot and checksum.
  function isSimulationRunning(sim) {
    return !!(sim && String(sim.status || '').toUpperCase() === 'RUNNING' &&
      !(sim.clock && sim.clock.paused));
  }

  function writeSnapshotNow(options) {
    options = options || {};
    var sim = runtime();
    if (!sim || typeof sim.saveSlot !== 'function') return Promise.resolve(false);
    if (restoreFailed && !options.force) return Promise.resolve(false);
    if (!playerCountry(sim)) return Promise.resolve(false);
    if (String(sim.status || '').toUpperCase() === 'ERROR' && !options.allowErrorCheckpoint) {
      setSaveStatus('GAME ERROR · LAST COMPLETE SAVE PRESERVED');
      return Promise.resolve(false);
    }
    // A snapshot must represent a coherent turn. Exit requests made mid-turn are
    // remembered and flushed by the finalizer after every sector has completed.
    if (sim.stepInProgress && !options.committedTurn) {
      if (options.force) pendingExitFlush = true;
      setSaveStatus(lastSavedAt ? 'LAST COMPLETE TURN PRESERVED' : 'SAVE DEFERRED · TURN IN PROGRESS');
      return Promise.resolve(false);
    }

    var revisionAtStart = mutationRevision;
    var turn = Math.max(0, Math.floor(number(sim.clock && sim.clock.turn) || 0));
    var operation;
    try {
      // The canonical API serializes once and writes asynchronously to IndexedDB.
      // It avoids the previous deep-clone + JSON.stringify + synchronous localStorage
      // sequence on every small domain event.
      saveInProgress = true;
      operation = sim.saveSlot(SLOT, {
        synchronousLocalStorage: options.synchronousLocalStorage === true
      });
    } catch (error) {
      lastSaveError = String(error && error.message || error);
      setSaveStatus('SAVE FAILED · LAST COMPLETE SAVE PRESERVED');
      return Promise.resolve(false);
    } finally {
      saveInProgress = false;
    }

    setSaveStatus('SAVING DEVICE SAVE…');
    var flight;
    flight = Promise.resolve(operation).then(function (result) {
      if (!result || result.ok !== true) throw new Error('CANONICAL_SAVE_NOT_CONFIRMED');
      lastSavedTurn = Math.max(0, Math.floor(number(result.turn) === null ? turn : number(result.turn)));
      lastSavedAt = Date.now();
      persistedRevision = Math.max(persistedRevision, revisionAtStart);
      lastSavedStorage = result.storage || 'CANONICAL';
      lastSavedChecksum = result.checksum || null;
      lastSaveError = null;
      saveCount += 1;
      if (options.committedTurn) hasSavedCommittedTurn = true;
      if (persistedRevision >= mutationRevision) {
        pendingExitFlush = false;
        stateSaveFirstAt = 0;
      }
      setSaveStatus('AUTO-SAVED · DAY ' + (lastSavedTurn + 1));
      return true;
    }).catch(function (error) {
      lastSaveError = String(error && error.message || error);
      setSaveStatus('SAVE FAILED · LAST COMPLETE SAVE PRESERVED');
      return false;
    }).then(function (saved) {
      if (saveInFlightPromise === flight) saveInFlightPromise = null;
      if (!saved) {
        // Do not spin on a failing storage device. A later mutation, explicit
        // pause, or exit will retry without risking the previous good checkpoint.
        saveQueued = false;
        saveQueuedForce = false;
        saveQueuedCommittedTurn = false;
        return false;
      }

      var needsLatest = saveQueued || mutationRevision > persistedRevision || pendingExitFlush;
      var forceLatest = saveQueuedForce || pendingExitFlush;
      var committedLatest = saveQueuedCommittedTurn || !!options.committedTurn;
      saveQueued = false;
      saveQueuedForce = false;
      saveQueuedCommittedTurn = false;
      if (needsLatest) {
        if (sim.stepInProgress && !committedLatest) {
          if (forceLatest) pendingExitFlush = true;
          return true;
        }
        return writeSnapshotNow({
          force: forceLatest,
          committedTurn: committedLatest,
          synchronousLocalStorage: options.synchronousLocalStorage === true
        });
      }
      return true;
    });
    saveInFlightPromise = flight;
    return flight;
  }

  function saveNow(options) {
    options = options || {};
    var sim = runtime();
    if (!sim || typeof sim.saveSlot !== 'function') return Promise.resolve(false);
    if (saveInProgress) return saveInFlightPromise || Promise.resolve(true);
    if (sim.stepInProgress && !options.committedTurn) {
      if (options.force) pendingExitFlush = true;
      return Promise.resolve(false);
    }
    if (!options.force && mutationRevision <= persistedRevision) return Promise.resolve(true);
    if (saveInFlightPromise && options.synchronousLocalStorage !== true) {
      saveQueued = true;
      if (options.force) saveQueuedForce = true;
      if (options.committedTurn) saveQueuedCommittedTurn = true;
      return saveInFlightPromise;
    }
    return writeSnapshotNow(options);
  }
  saveNow.lastLocalSaved = false;
  saveNow.lastBackupPromise = Promise.resolve(false);

  function parseLocalSave() {
    try {
      if (!g.localStorage) return null;
      var raw = g.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? { slot: 'local', snapshot: parsed, savedAt: 0 } : null;
    } catch (_) { return null; }
  }

  function savedTurn(candidate) {
    return Math.max(0, Math.floor(number(candidate && candidate.snapshot && candidate.snapshot.clock && candidate.snapshot.clock.turn) || 0));
  }

  function syncSelectedCountry(country) {
    if (!country) return;
    try {
      if (g.Game) {
        g.Game.currentActiveCountry = country;
        if (typeof g.Game.playerCountry === 'string' || g.Game.playerCountry == null) g.Game.playerCountry = country;
      }
    } catch (_) {}
    try { if (g.CountryIOS) g.CountryIOS.activeCountry = country; } catch (_) {}
    try { g.currentActiveCountry = country; } catch (_) {}
  }

  function loadCandidate(sim, candidate) {
    if (!candidate || !candidate.snapshot) return false;
    try {
      sim.loadState(candidate.snapshot);
      var country = playerCountry(sim);
      if (!country) throw new Error('SAVED_PLAYER_COUNTRY_MISSING');
      syncSelectedCountry(country);
      lastSavedTurn = savedTurn(candidate);
      lastSavedAt = Date.now();
      setSaveStatus('SAVE RESTORED · DAY ' + (lastSavedTurn + 1));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function restoreOnReady() {
    if (restoreFinished) return;
    var sim = runtime();
    if (!sim || !sim.clock || typeof sim.loadSlot !== 'function') return;
    var authoritativeState = (g.Game && g.Game.state) || g.gameState;
    if (!g.Omega || !g.Omega.App || !authoritativeState || sim.world.state !== authoritativeState) return;
    restoreFinished = true;

    var restored = false;
    var canonicalError = null;
    var candidates = [];
    try {
      await sim.loadSlot(SLOT);
      var canonicalCountry = playerCountry(sim);
      if (!canonicalCountry) throw new Error('SAVED_PLAYER_COUNTRY_MISSING');
      syncSelectedCountry(canonicalCountry);
      lastSavedTurn = Math.max(0, Math.floor(number(sim.clock && sim.clock.turn) || 0));
      lastSavedAt = Date.now();
      persistedRevision = mutationRevision;
      lastSavedStorage = 'CANONICAL';
      restored = true;
    } catch (error) {
      canonicalError = error;
    }

    // Compatibility migration: the former lifecycle runtime stored an envelope
    // in omega-game-save-db-v1. Existing localStorage saves share the canonical
    // slot key and are already handled by Simulation.loadSlot().
    if (!restored) {
      // Keep the legacy localStorage record as a recovery candidate too:
      // an unreadable newer IndexedDB slot must not prevent restoring an older
      // valid local checkpoint.
      var local = parseLocalSave();
      if (local) candidates.push(local);
      var indexed = null;
      try { indexed = await readIndexedSave(); } catch (_) {}
      if (indexed && indexed.snapshot) candidates.push(indexed);
      candidates.sort(function (a, b) {
        var turnDifference = savedTurn(b) - savedTurn(a);
        if (turnDifference) return turnDifference;
        return (number(b.savedAt) || 0) - (number(a.savedAt) || 0);
      });
      for (var i = 0; i < candidates.length; i++) {
        if (loadCandidate(sim, candidates[i])) { restored = true; break; }
      }
    }

    var canonicalMissing = canonicalError &&
      /^SAVE_SLOT_NOT_FOUND:/.test(String(canonicalError.message || canonicalError)) &&
      !/INDEXEDDB:/.test(String(canonicalError.message || canonicalError));
    if (!restored && (candidates.length || (canonicalError && !canonicalMissing))) {
      restoreFailed = true;
      setSaveStatus('SAVE RESTORE FAILED · PRESERVED');
      updateHud();
      return;
    }

    if (restored) {
      restoredFromSave = true;
      var savedStatus = String(sim.status || '').toUpperCase();
      var savedSpeed = number(sim.clock.speed);
      if (savedStatus === 'ERROR') {
        backgroundRunsEnabled = false;
        setSaveStatus('GAME ERROR · LAST COMPLETE SAVE PRESERVED');
        updateHud();
        return;
      }
      if (savedSpeed !== null && savedSpeed > 0) lastKnownSpeed = savedSpeed;
      backgroundRunsEnabled = false;
      try { sim.clock.setSpeed(0); } catch (_) {}
      try {
        if (typeof sim.pauseSession === 'function') sim.pauseSession();
        else sim.status = 'PAUSED';
      } catch (_) { sim.status = 'PAUSED'; }
      updateHud();
      var restoredSave = await saveNow({ force: true });
      if (!restoredSave) setSaveStatus('SAVE FAILED · LAST COMPLETE SAVE PRESERVED');
      else setSaveStatus('BACKGROUND SYSTEMS PAUSED · PRESS PLAY TO RESUME');
      return;
    }

    var country = playerCountry(sim);
    if (country) {
      syncSelectedCountry(country);
      try {
        var session = sim.world && sim.world.state && sim.world.state.simulation &&
          sim.world.state.simulation.session;
        if ((!session || !session.playerCountryId) && typeof sim.createSession === 'function') {
          sim.createSession({ playerCountryId: country });
        }
        try { sim.clock.setSpeed(0); } catch (_) {}
        if (typeof sim.pauseSession === 'function') sim.pauseSession();
        else sim.status = 'PAUSED';
        backgroundRunsEnabled = false;
        lastKnownSpeed = 1;
        updateHud();
        var initialSave = await saveNow({ force: true });
        setSaveStatus(initialSave
          ? 'BACKGROUND SYSTEMS PAUSED · PRESS PLAY TO RESUME'
          : 'SAVE FAILED · LAST COMPLETE SAVE PRESERVED');
      } catch (error) {
        backgroundRunsEnabled = false;
        setSaveStatus('CLOCK READY · SELECT COUNTRY');
      }
    } else {
      backgroundRunsEnabled = false;
      setSaveStatus('SELECT COUNTRY TO START');
    }
    updateHud();
  }

  function setSpeed(value, explicitStart) {
    var sim = runtime();
    var speed = number(value);
    if (!sim || !sim.clock || speed === null || speed < 0 || speed > 8) return false;
    // Never turn an error checkpoint into an apparently healthy paused session.
    if (String(sim.status || '').toUpperCase() === 'ERROR') {
      setSaveStatus('GAME ERROR · LAST COMPLETE SAVE PRESERVED');
      updateHud();
      return false;
    }
    if (speed === 0) {
      lastKnownSpeed = number(sim.clock.speed) > 0 ? sim.clock.speed : lastKnownSpeed;
      backgroundRunsEnabled = false;
      try { sim.clock.setSpeed(0); } catch (_) {}
      try { if (typeof sim.pauseSession === 'function') sim.pauseSession(); } catch (_) {}
      saveNow({ force: true, synchronousLocalStorage: true });
      updateHud();
      setSaveStatus('BACKGROUND SYSTEMS PAUSED · PRESS PLAY TO RESUME');
      return true;
    }
    lastKnownSpeed = speed;
    try { sim.clock.setSpeed(speed); } catch (_) { return false; }
    var country = playerCountry(sim);
    if (!country) {
      backgroundRunsEnabled = false;
      setSaveStatus('SELECT COUNTRY TO START');
      updateHud();
      return false;
    }
    syncSelectedCountry(country);
    try {
      var status = String(sim.status || '').toUpperCase();
      if (status === 'PAUSED') sim.resumeSession();
      else if (status !== 'RUNNING' || explicitStart) sim.startSession({ playerCountryId: country });
      if (sim.clock.speed !== speed) sim.clock.setSpeed(speed);
      backgroundRunsEnabled = true;
      setSaveStatus('GAME RUNNING · AUTOSAVE ON');
      if (restoreFailed) { restoreFailed = false; saveNow({ force: true }); }
      else saveNow({ force: true });
      updateHud();
      return true;
    } catch (error) {
      backgroundRunsEnabled = false;
      setSaveStatus('CLOCK ERROR · ' + String(error && error.message || error).slice(0, 48));
      updateHud();
      return false;
    }
  }

  function beginManualAdvance(turns) {
    var sim = runtime();
    var count = Math.max(1, Math.min(365, Math.floor(number(turns) || 1)));
    if (!sim || typeof sim.advance !== 'function' || manualCommandInFlight) return false;
    if (String(sim.status || '').toUpperCase() === 'ERROR') {
      setSaveStatus('GAME ERROR · FIX FAILED SYSTEM BEFORE TESTING');
      updateHud();
      return false;
    }
    if (!playerCountry(sim)) {
      setSaveStatus('SELECT COUNTRY TO TEST TIME');
      updateHud();
      return false;
    }
    if (sim.frameInProgress || sim.stepInProgress || sim.manualAdvanceInProgress) {
      setSaveStatus('CURRENT DAY IS STILL COMMITTING · TRY AGAIN');
      updateHud();
      return false;
    }
    // Manual runs begin from a paused clock and always use the canonical day pipeline.
    if (String(sim.status || '').toUpperCase() !== 'PAUSED' || !(sim.clock && sim.clock.paused)) setSpeed(0);
    manualCommandInFlight = true;
    setText('[data-omega-manual-progress]', 'RUNNING · 0/' + count + ' DAYS');
    updateHud();
    Promise.resolve(sim.advance(count, { yieldEvery: 1 })).then(function (result) {
      if (result && result.status === 'ERROR') setSaveStatus('TIME TEST FAILED · INSPECT DIAGNOSTICS');
      else if (result && result.cancelled) setSaveStatus('MANUAL ADVANCE CANCELLED · ' + result.steps + ' DAYS COMMITTED');
      else setSaveStatus('MANUAL ADVANCE COMPLETE · ' + (result && result.steps || 0) + ' DAYS');
      var progress = result && result.cancelled ? 'CANCELLED' : (result && result.status === 'ERROR' ? 'ERROR' : 'COMPLETE');
      setText('[data-omega-manual-progress]', progress + ' · ' + (result && result.steps || 0) + '/' + count + ' DAYS');
      updateHud();
      return saveNow({ force: true });
    }).catch(function (error) {
      setSaveStatus('MANUAL ADVANCE FAILED · ' + String(error && error.message || error).slice(0, 42));
      setText('[data-omega-manual-progress]', 'FAILED · INSPECT DIAGNOSTICS');
      updateHud();
    }).finally(function () {
      manualCommandInFlight = false;
      updateHud();
    });
    return true;
  }

  function cancelManualAdvance() {
    var sim = runtime();
    if (!sim || typeof sim.cancelAdvance !== 'function' || !sim.cancelAdvance()) return false;
    setText('[data-omega-manual-progress]', 'CANCELLING AFTER CURRENT DAY…');
    updateHud();
    return true;
  }

  function toggleTimeDiagnostics() {
    var panel = g.document && g.document.querySelector('[data-omega-diagnostics]');
    var sim = runtime();
    if (!panel || !sim) return false;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      var report = {
        simulation: typeof sim.diagnostics === 'function' ? sim.diagnostics() : null,
        scheduler: g.Omega && g.Omega.WorldSimulationScheduler && typeof g.Omega.WorldSimulationScheduler.diagnostics === 'function'
          ? g.Omega.WorldSimulationScheduler.diagnostics() : null,
        lifecycle: {
          saveStatus: saveStatus, savePending: !!saveInFlightPromise || !!saveQueued,
          savedTurn: lastSavedTurn, savedStorage: lastSavedStorage, restoreFinished: restoreFinished,
          restoreFailed: restoreFailed, manualCommandInFlight: manualCommandInFlight
        }
      };
      panel.textContent = JSON.stringify(report, null, 2);
    }
    return true;
  }

  function queueTurnSave() {
    updateHud();
  }

  function armStateSaveTimer() {
    if (stateSaveTimer !== null) {
      try { g.clearTimeout(stateSaveTimer); } catch (_) {}
      stateSaveTimer = null;
    }
    var sim = runtime();
    if (!sim || mutationRevision <= persistedRevision || restoreFailed) return;
    var now = Date.now();
    if (!stateSaveFirstAt) stateSaveFirstAt = now;
    var dueAt = Math.min(now + STATE_SAVE_DEBOUNCE_MS, stateSaveFirstAt + STATE_SAVE_MAX_WAIT_MS);
    if (isSimulationRunning(sim) && lastSavedAt) {
      dueAt = Math.max(dueAt, lastSavedAt + TURN_SAVE_INTERVAL_MS);
    }
    stateSaveTimer = g.setTimeout(function () {
      stateSaveTimer = null;
      var current = runtime();
      if (!current || mutationRevision <= persistedRevision || restoreFailed) {
        stateSaveFirstAt = 0;
        return;
      }
      if (current.stepInProgress) return; // The committed-turn finalizer owns this checkpoint.
      if (isSimulationRunning(current) && lastSavedAt &&
          Date.now() - lastSavedAt < TURN_SAVE_INTERVAL_MS) {
        armStateSaveTimer();
        return;
      }
      stateSaveFirstAt = 0;
      saveNow();
    }, Math.max(0, dueAt - now));
  }

  function scheduleStateSave() {
    if (saveInProgress) return;
    mutationRevision += 1;
    var sim = runtime();
    // Preserve revisions during a turn; only the finalizer may snapshot a
    // fully-applied day. A timer is armed after the pipeline releases its lock.
    if (sim && sim.stepInProgress) return;
    armStateSaveTimer();
  }

  function installMutationEventSaveBridge() {
    if (g.__OMEGA_AUTOSAVE_MUTATION_EVENT_BRIDGE_V1__ || typeof g.dispatchEvent !== 'function') return;
    var nativeDispatch = g.dispatchEvent;
    var mutationEvent = /(?:_STATE_CHANGED|_STATE_UPDATED|_UPDATED|_APPLIED|_COMPLETED|_SETTLED|_ENACTED|_VOTED|_CREATED|_DELETED|_REMOVED|_SAVED|_TRANSFERRED|_COMMITTED|_RECONCILED|_EXECUTED|_REGISTERED|_ADDED|_CANCELLED|_CANCELED|_PROCESSED|_RESOLVED|_ACCEPTED|_SELECTED)$/;
    g.dispatchEvent = function (event) {
      var result = nativeDispatch.call(this, event);
      var type = String(event && event.type || '');
      if (mutationEvent.test(type)) scheduleStateSave();
      return result;
    };
    g.__OMEGA_AUTOSAVE_MUTATION_EVENT_BRIDGE_V1__ = true;
  }

  function onCountryContextChanged(event) {
    var detail = event && event.detail || {};
    // A map selection is the explicit player-country choice during a fresh game.
    // Opening a ministry is only a view change and must never switch ownership.
    if (detail.source !== 'map-country-selection') {
      updateHud();
      return;
    }
    var selectedCountry = countryCode(detail.countryId || detail.country);
    if (!selectedCountry || !/^[A-Z]{3}$/.test(selectedCountry)) {
      updateHud();
      return;
    }
    var sim = runtime();
    if (!sim || !sim.clock || typeof sim.createSession !== 'function') {
      updateHud();
      return;
    }

    var status = String(sim.status || 'READY').toUpperCase();
    var session = sim.world && sim.world.state && sim.world.state.simulation &&
      sim.world.state.simulation.session;
    var turn = Math.max(0, Math.floor(number(sim.clock.turn) || 0));
    var lastCommittedTurn = number(session && session.lastCommittedTurn);
    var createdTurn = number(session && session.createdTurn);
    var gameplayAlreadyStarted = turn > 0 ||
      (lastCommittedTurn !== null && lastCommittedTurn > 0) ||
      (createdTurn !== null && createdTurn > 0) ||
      number(sim.stepCount) > 0;

    // Never replace a restored checkpoint, a running/error/stopped game, or a
    // session after its first committed day. The default USA context is only a
    // boot placeholder until the player explicitly chooses a country on the map.
    if (restoredFromSave || restoreFailed || gameplayAlreadyStarted ||
        (status !== 'READY' && status !== 'PAUSED')) {
      updateHud();
      return;
    }

    var currentCountry = countryCode(session && session.playerCountryId);
    if (currentCountry === selectedCountry) {
      syncSelectedCountry(selectedCountry);
      updateHud();
      return;
    }

    try {
      sim.createSession({ playerCountryId: selectedCountry, startTurn: turn });
      if (typeof sim.pauseSession === 'function') sim.pauseSession();
      else sim.status = 'PAUSED';
      syncSelectedCountry(selectedCountry);
      setSaveStatus('PLAYER COUNTRY SELECTED · PRESS PLAY');
      updateHud();
      saveNow({ force: true, synchronousLocalStorage: true });
    } catch (error) {
      setSaveStatus('COUNTRY SELECTION FAILED · ' + String(error && error.message || error).slice(0, 40));
      updateHud();
    }
  }


  function registerLifecycleFinalizer() {
    var sim = runtime();
    if (!sim || typeof sim.registerTurnFinalizer !== 'function') return false;
    if (lifecycleFinalizerUnregister) {
      try { lifecycleFinalizerUnregister(); } catch (_) {}
      lifecycleFinalizerUnregister = null;
    }
    lifecycleFinalizerUnregister = sim.registerTurnFinalizer('omega.game-lifecycle.autosave', async function (context) {
      if (context && context.simulation && String(context.simulation.status || '').toUpperCase() === 'ERROR') {
        setSaveStatus('TURN FAILED · LAST COMPLETE SAVE PRESERVED');
        throw new Error('FAILED_TURN_NOT_SAVED');
      }
      mutationRevision += 1;
      var turn = Math.max(0, Math.floor(number(context && context.turn) || number(sim.clock && sim.clock.turn) || 0));
      var shouldPersist = !hasSavedCommittedTurn || pendingExitFlush ||
        !lastSavedAt || Date.now() - lastSavedAt >= TURN_SAVE_INTERVAL_MS;
      if (!shouldPersist) {
        // The pipeline releases stepInProgress after its finalizer phase; defer
        // timer arming by one task so the next snapshot cannot capture a partial day.
        g.setTimeout(function () { armStateSaveTimer(); }, 0);
        return { turn: turn, durableTarget: lastSavedStorage || 'PENDING', savedTurn: lastSavedTurn, deferred: true };
      }
      var saved = await saveNow({ force: true, committedTurn: true });
      if (!saved) throw new Error('CANONICAL_GAME_SAVE_FAILED');
      return { turn: turn, durableTarget: lastSavedStorage || 'CANONICAL', savedTurn: lastSavedTurn };
    }, { priority: Number.MAX_SAFE_INTEGER });
    return true;
  }

  function clickHandler(event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-omega-action="toggle"], [data-omega-action="pause"], [data-omega-action="step-day"], [data-omega-action="advance-days"], [data-omega-action="cancel-advance"], [data-omega-action="diagnostics"], [data-omega-speed], .speed-btn') : null;
    if (!target) return;
    // This is the authoritative game-clock route. Legacy listeners must not
    // overwrite a speed selection after this handler updates the simulation.
    if (event && event.cancelable) event.preventDefault();
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    var speed;
    if (target.hasAttribute('data-omega-action')) {
      var action = target.getAttribute('data-omega-action');
      if (action === 'toggle') {
        setSpeed(1, true);
      } else if (action === 'pause') {
        setSpeed(0);
      } else if (action === 'step-day') {
        beginManualAdvance(1);
      } else if (action === 'advance-days') {
        var daysInput = g.document && g.document.querySelector('[data-omega-days]');
        beginManualAdvance(daysInput && daysInput.value);
      } else if (action === 'cancel-advance') {
        cancelManualAdvance();
      } else if (action === 'diagnostics') {
        toggleTimeDiagnostics();
      }
      return;
    }
    if (target.hasAttribute('data-omega-speed')) speed = number(target.getAttribute('data-omega-speed'));
    else speed = number(target.getAttribute('data-speed'));
    if (speed !== null) setSpeed(speed);
  }

  function onVisibilityChange() {
    if (!g.document) return;
    if (g.document.visibilityState === 'hidden') {
      var sim = runtime();
      hiddenWasRunning = isSimulationRunning(sim) || !!(sim && sim.manualAdvanceInProgress);
      if (hiddenWasRunning && sim && String(sim.status || '').toUpperCase() !== 'ERROR') {
        var speed = number(sim.clock && sim.clock.speed);
        if (speed !== null && speed > 0) lastKnownSpeed = speed;
        backgroundRunsEnabled = false;
        try { sim.clock.setSpeed(0); } catch (_) {}
        try { if (typeof sim.pauseSession === 'function') sim.pauseSession(); } catch (_) {}
      }
      pendingExitFlush = true;
      hiddenSnapshotSaved = false;
      if (stateSaveTimer !== null) {
        try { g.clearTimeout(stateSaveTimer); } catch (_) {}
        stateSaveTimer = null;
      }
      var flush = saveNow({ force: true, synchronousLocalStorage: true });
      Promise.resolve(flush).then(function (saved) {
        hiddenSnapshotSaved = !!saved;
        if (hiddenWasRunning && sim && String(sim.status || '').toUpperCase() !== 'ERROR' && saved) {
          setSaveStatus('BACKGROUND SYSTEMS PAUSED · PRESS PLAY TO RESUME');
        }
      });
      if (hiddenWasRunning && sim && String(sim.status || '').toUpperCase() !== 'ERROR') {
        setSaveStatus('BACKGROUND SYSTEMS PAUSED · SAVING');
      }
    } else {
      hiddenWasRunning = false;
      hiddenSnapshotSaved = false;
      exitSaveStarted = false;
      var current = runtime();
      updateHud();
      if (current && String(current.status || '').toUpperCase() === 'PAUSED') {
        setSaveStatus('BACKGROUND SYSTEMS PAUSED · PRESS PLAY TO RESUME');
      }
    }
  }

  function onPageExit() {
    var exitingSimulation = runtime();
    if (exitingSimulation && exitingSimulation.manualAdvanceInProgress && typeof exitingSimulation.cancelAdvance === 'function') {
      exitingSimulation.cancelAdvance();
    }
    if (exitSaveStarted) return;
    // visibilitychange normally starts this flush first. Its promise is already
    // writing the same canonical slot, so do not start a duplicate exit write.
    if (g.document && g.document.visibilityState === 'hidden' &&
        (hiddenSnapshotSaved || saveInFlightPromise)) return;
    exitSaveStarted = true;
    pendingExitFlush = true;
    if (stateSaveTimer !== null) {
      try { g.clearTimeout(stateSaveTimer); } catch (_) {}
      stateSaveTimer = null;
    }
    saveNow({ force: true });
  }

  function requestPersistentStorage() {
    var storage = g.navigator && g.navigator.storage;
    if (!storage) { storagePersistence = 'UNSUPPORTED'; return; }
    var request;
    try {
      request = typeof storage.persist === 'function' ? storage.persist() :
        (typeof storage.persisted === 'function' ? storage.persisted() : null);
    } catch (_) {
      storagePersistence = 'UNKNOWN';
      return;
    }
    if (!request || typeof request.then !== 'function') {
      storagePersistence = 'UNSUPPORTED';
      return;
    }
    Promise.resolve(request).then(function (granted) {
      storagePersistence = granted ? 'GRANTED' : 'DENIED';
    }).catch(function () {
      storagePersistence = 'UNKNOWN';
    });
  }

  function init() {
    if (!g.document) return;
    ensureTimeHudPlacement();
    ensurePauseButton();
    registerLifecycleFinalizer();
    requestPersistentStorage();
    installMutationEventSaveBridge();
    g.document.addEventListener('click', clickHandler, true);
    g.document.addEventListener('visibilitychange', onVisibilityChange);
    g.document.addEventListener('freeze', onPageExit);
    g.document.addEventListener('resume', function () {
      if (!restoreFinished) restoreOnReady().catch(function () {});
      updateHud();
    });
    g.addEventListener && g.addEventListener('pagehide', onPageExit);
    g.addEventListener && g.addEventListener('beforeunload', onPageExit);
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', queueTurnSave);
    g.addEventListener && g.addEventListener('OMEGA_COUNTRY_CONTEXT_CHANGED', onCountryContextChanged);
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_STEP_COMPLETED', updateHud);
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_CLOCK_TICK', updateClockProgress);
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_BATCH_STARTED', updateHud);
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_BATCH_PROGRESS', function (event) {
      var detail = event && event.detail || {};
      setText('[data-omega-manual-progress]', 'RUNNING · ' + number(detail.completedTurns || 0) + '/' + number(detail.plannedTurns || 0) + ' DAYS');
      updateHud();
    });
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_BATCH_COMPLETED', updateHud);
    g.addEventListener && g.addEventListener('OMEGA_FINANCE_STATE_UPDATED', scheduleHudRefresh);
    g.addEventListener && g.addEventListener('OMEGA_MACRO_STABILITY_TURN_PROCESSED', scheduleHudRefresh);
    [
      'MINISTRY_STATE_CHANGED', 'RESOURCE_STATE_UPDATED', 'OMEGA_FINANCE_STATE_UPDATED',
      'FINANCE_STATE_UPDATED', 'DECISION_ENACTED', 'POLICY_VOTE_CAST',
      'OMEGA_COMMAND_APPLIED', 'OMEGA_COMMAND_EXECUTED', 'MINISTRY_COMMAND_EXECUTED',
      'OMEGA_RESOURCE_ACTION_COMMITTED', 'OMEGA_TREATY_STATE_UPDATED',
      'OMEGA_SIMULATION_SAVE_REQUESTED'
    ].forEach(function (type) {
      g.addEventListener && g.addEventListener(type, scheduleStateSave);
    });
    ['COUNTRY_SELECTED', 'COUNTRY_CHANGED', 'OMEGA_COUNTRY_SELECTED', 'OMEGA_PLAYER_COUNTRY_CHANGED', 'MINISTRY_SELECTED'].forEach(function (type) {
      g.addEventListener && g.addEventListener(type, function () { updateHud(); scheduleStateSave(); });
    });
    g.addEventListener && g.addEventListener('RESOURCE_STATE_UPDATED', scheduleHudRefresh);
    g.addEventListener && g.addEventListener('OMEGA_READY', function () {
      restoreOnReady().catch(function () {
        restoreFailed = true;
        setSaveStatus('SAVE RESTORE FAILED · PRESERVED');
      }).finally(registerLifecycleFinalizer);
    });
    updateHud();
    if (g.document.readyState === 'complete' || g.document.readyState === 'interactive') {
      g.setTimeout(function () {
        if (!restoreFinished) restoreOnReady().catch(function () {}).finally(registerLifecycleFinalizer);
        else registerLifecycleFinalizer();
      }, 600);
    }
  }

  g.Omega = g.Omega || {};
  g.Omega.GameLifecycle = {
    saveNow: saveNow,
    updateHud: updateHud,
    setSpeed: setSpeed,
    advanceDays: beginManualAdvance,
    cancelAdvance: cancelManualAdvance,
    toggleTimeDiagnostics: toggleTimeDiagnostics,
    stopAllBackgroundRuns: function () { return setSpeed(0); },
    startAllBackgroundRuns: function () { return setSpeed(lastKnownSpeed || 1, true); },
    restore: restoreOnReady,
    getDiagnostics: function () {
      var sim = runtime();
      return {
        slot: SLOT,
        saveKey: SAVE_KEY,
        savedTurn: lastSavedTurn,
        savedChecksum: lastSavedChecksum,
        status: saveStatus,
        savedStorage: lastSavedStorage,
        lastSaveError: lastSaveError,
        storagePersistence: storagePersistence,
        saveCount: saveCount,
        dirty: mutationRevision > persistedRevision,
        mutationRevision: mutationRevision,
        persistedRevision: persistedRevision,
        savePending: !!saveInFlightPromise || !!saveQueued,
        pendingExitFlush: pendingExitFlush,
        participantCount: sim && typeof sim.participantDiagnostics === 'function' ? sim.participantDiagnostics().length : null,
        restoreFinished: restoreFinished,
        restoreFailed: restoreFailed,
        running: !!(sim && sim.status === 'RUNNING'),
        backgroundRunsEnabled: backgroundRunsEnabled,
        manualCommandInFlight: manualCommandInFlight,
        manualAdvanceInProgress: !!(sim && sim.manualAdvanceInProgress),
        clock: sim && sim.clock && sim.clock.snapshot ? sim.clock.snapshot() : null
      };
    }
  };

  if (g.document) {
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
