/* OMEGA Unified Game Lifecycle: one clock, one save slot, one persistent HUD. */
(function (g) {
  'use strict';

  var SLOT = 'default';
  var SAVE_KEY = 'omega.game.save.' + SLOT;
  var DB_NAME = 'omega-game-save-db-v1';
  var DB_STORE = 'slots';
  var DAY_MS = 86400000;
  var lastSavedTurn = -1;
  var lastSavedAt = 0;
  var lastSavedSerialized = '';
  var stateSaveTimer = null;
  var saveInProgress = false;
  var lifecycleFinalizerUnregister = null;
  var lastKnownSpeed = 1;
  var hiddenWasRunning = false;
  var hiddenSnapshotSaved = false;
  var restoreFailed = false;
  var restoreFinished = false;
  var dbWriteChain = Promise.resolve();
  var saveStatus = 'AUTOSAVE READY';
  var tickSaveQueued = false;

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
    if (node) node.textContent = String(value);
  }

  function setSaveStatus(value) {
    saveStatus = String(value || 'AUTOSAVE READY');
    setText('[data-omega-save]', saveStatus);
    setText('#status-autosave', saveStatus);
  }

  function updateControls(sim) {
    if (!g.document) return;
    var status = String(sim && sim.status || 'READY').toUpperCase();
    var running = status === 'RUNNING' && !(sim.clock && sim.clock.paused);
    var toggle = g.document.querySelector('[data-omega-action="toggle"]');
    if (toggle) {
      toggle.textContent = running ? 'Ⅱ' : '▶';
      toggle.setAttribute('aria-label', running ? 'Pause game' : 'Resume game');
      toggle.title = running ? 'Pause game' : 'Resume game';
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
  }

  function updateHud() {
    var sim = runtime();
    if (!sim || !sim.clock || !g.document) return;
    var root = rootState();
    var turn = Math.max(0, Math.floor(number(sim.clock.turn) || 0));
    var isoDate = safeCall(function () { return sim.clock.simulationDate(); }) ||
      (root.simulation && root.simulation.date) || '';
    var date = String(isoDate).slice(0, 10);
    setText('[data-omega-game-date]', date || 'DATE NOT RECORDED');
    setText('[data-omega-game-day]', 'DAY ' + (turn + 1).toLocaleString('en-US') + ' · TURN ' + turn.toLocaleString('en-US'));
    setText('#status-clock', (date || 'DATE NOT RECORDED') + ' · DAY ' + (turn + 1).toLocaleString('en-US'));
    updateControls(sim);

    var country = playerCountry(sim);
    if (country && typeof g.updateGlobalResourceHUD === 'function') {
      try { g.updateGlobalResourceHUD(country); } catch (_) {}
    }
    var fm = country ? currentFinance(country) : null;
    var treasury = number(fm && fm.treasuryBalanceUsd);
    var annualRevenue = number(fm && fm.fiscalModel && fm.fiscalModel.annualRevenueUsd);
    var annualSpending = number(fm && fm.fiscalModel && fm.fiscalModel.annualSpendingUsd);
    if (treasury === null && country) {
      var economy = findCountryBucket('economy', country);
      treasury = number(economy && economy.treasury);
    }
    var dailyRevenue = annualRevenue === null ? null : annualRevenue / 365;
    var dailySpending = annualSpending === null ? null : annualSpending / 365;
    var dailyNet = dailyRevenue === null || dailySpending === null ? null : dailyRevenue - dailySpending;
    var flowTitle = 'Daily revenue, spending and net are modeled annual Finance figures divided by 365, not observed daily cash receipts.';
    var econNode = g.document.querySelector('[data-omega-economy]');
    if (econNode) {
      econNode.textContent = (country || 'COUNTRY NOT SELECTED') +
        '  Treasury ' + (treasury === null ? 'Not recorded' : money(treasury)) +
        '  Income/day ' + (dailyRevenue === null ? 'Not recorded' : money(dailyRevenue)) +
        '  Spend/day ' + (dailySpending === null ? 'Not recorded' : money(dailySpending)) +
        '  Net/day ' + (dailyNet === null ? 'Not recorded' : money(dailyNet));
      econNode.title = flowTitle;
    }

    var assetNode = g.document.querySelector('[data-omega-assets]');
    if (assetNode) {
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
      assetNode.textContent = values.length ? values.slice(0, 5).join('  ·  ') : 'Assets/resources not recorded';
    }
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

  function writeIndexedSave(snapshot) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({ slot: SLOT, snapshot: snapshot, savedAt: Date.now() });
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('INDEXED_DB_WRITE_FAILED')); };
        tx.onabort = function () { db.close(); reject(tx.error || new Error('INDEXED_DB_WRITE_ABORTED')); };
      });
    });
  }

  function persistBackup(snapshot) {
    dbWriteChain = dbWriteChain.catch(function () { return null; }).then(function () { return writeIndexedSave(snapshot); });
    return dbWriteChain;
  }

  function writeSnapshotNow(options) {
    options = options || {};
    var sim = runtime();
    if (!sim || typeof sim.saveState !== 'function') return false;
    if (restoreFailed && !options.force) return false;
    if (!playerCountry(sim)) return false;
    if (String(sim.status || '').toUpperCase() === 'ERROR' && !options.allowErrorCheckpoint) {
      setSaveStatus('GAME ERROR · LAST COMPLETE SAVE PRESERVED');
      return false;
    }
    // Do not overwrite the last coherent checkpoint with a half-applied day if
    // the OS backgrounds or terminates the app midway through an awaited turn.
    // The pipeline's final autosave uses committedTurn=true after all sectors finish.
    if (sim.stepInProgress && !options.committedTurn) {
      setSaveStatus(lastSavedSerialized ? 'LAST COMPLETE TURN PRESERVED' : 'SAVE DEFERRED · TURN IN PROGRESS');
      return false;
    }
    var turn = Math.max(0, Math.floor(number(sim.clock && sim.clock.turn) || 0));
    // Reconcile the displayed treasury/resources before taking the durable snapshot.
    // Rendering is best-effort and must never be allowed to block a save on exit.
    try { updateHud(); } catch (_) {}
    var snapshot;
    try { snapshot = sim.saveState(); }
    catch (error) {
      setSaveStatus('SAVE FAILED');
      return false;
    }
    var serialized;
    try { serialized = JSON.stringify(snapshot); }
    catch (_) {
      setSaveStatus('SAVE FAILED · SNAPSHOT NOT SERIALIZABLE');
      return false;
    }
    if (!options.force && serialized === lastSavedSerialized) return true;

    var localSaved = false;
    try {
      if (!g.localStorage) throw new Error('LOCAL_STORAGE_UNAVAILABLE');
      g.localStorage.setItem(SAVE_KEY, serialized);
      localSaved = true;
    } catch (_) {
      localSaved = false;
    }
    saveNow.lastLocalSaved = localSaved;
    var backupPromise = persistBackup(snapshot).then(function () {
      if (!localSaved) {
        lastSavedTurn = turn;
        lastSavedAt = Date.now();
        lastSavedSerialized = serialized;
        setSaveStatus('DEVICE BACKUP SAVED · DAY ' + (turn + 1));
      }
      return true;
    }).catch(function () {
      if (!localSaved) setSaveStatus('SAVE FAILED · LAST COMPLETE SAVE PRESERVED');
      return false;
    });

    if (localSaved) {
      lastSavedTurn = turn;
      lastSavedAt = Date.now();
      lastSavedSerialized = serialized;
      setSaveStatus('AUTO-SAVED · DAY ' + (turn + 1));
    } else {
      setSaveStatus('SAVING DEVICE BACKUP…');
    }
    // Exposed promise lets diagnostics and tests observe IndexedDB completion when available.
    saveNow.lastBackupPromise = backupPromise;
    return localSaved || !!g.indexedDB;
  }

  function saveNow(options) {
    if (saveInProgress) return true;
    saveInProgress = true;
    try { return writeSnapshotNow(options); }
    finally { saveInProgress = false; }
  }
  saveNow.lastBackupPromise = Promise.resolve(false);
  saveNow.lastLocalSaved = false;

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
    if (!sim || !sim.clock || typeof sim.loadState !== 'function') return;
    // Do not restore into a temporary boot state before Game.state is linked.
    // The fallback timer may fire before window.load on slow Android devices.
    var authoritativeState = (g.Game && g.Game.state) || g.gameState;
    if (!g.Omega || !g.Omega.App || !authoritativeState || sim.world.state !== authoritativeState) return;
    restoreFinished = true;

    var local = parseLocalSave();
    var indexed = null;
    try { indexed = await readIndexedSave(); } catch (_) {}
    var candidates = [];
    if (local) candidates.push(local);
    if (indexed && indexed.snapshot) candidates.push(indexed);
    candidates.sort(function (a, b) {
      var turnDifference = savedTurn(b) - savedTurn(a);
      if (turnDifference) return turnDifference;
      // Prefer localStorage on equal turns because page-exit snapshots are synchronous.
      if (a.slot === 'local' && b.slot !== 'local') return -1;
      if (b.slot === 'local' && a.slot !== 'local') return 1;
      return (number(b.savedAt) || 0) - (number(a.savedAt) || 0);
    });

    var restored = false;
    for (var i = 0; i < candidates.length; i++) {
      if (loadCandidate(sim, candidates[i])) { restored = true; break; }
    }
    if (candidates.length && !restored) {
      restoreFailed = true;
      setSaveStatus('SAVE RESTORE FAILED · PRESERVED');
      updateHud();
      return;
    }

    if (restored) {
      var savedStatus = String(sim.status || '').toUpperCase();
      var savedSpeed = number(sim.clock.speed);
      if (savedStatus === 'PAUSED') {
        sim.pauseSession();
      } else if (savedStatus !== 'ERROR') {
        var country = playerCountry(sim);
        if (country) {
          sim.clock.setSpeed(savedSpeed !== null && savedSpeed > 0 ? savedSpeed : 1);
          if (typeof sim.resumeSession === 'function') sim.resumeSession();
          lastKnownSpeed = sim.clock.speed;
        }
      }
      updateHud();
      return;
    }

    var country = playerCountry(sim);
    if (country) {
      syncSelectedCountry(country);
      try {
        sim.clock.setSpeed(1);
        if (String(sim.status || '').toUpperCase() === 'PAUSED') sim.resumeSession();
        else if (String(sim.status || '').toUpperCase() !== 'RUNNING') sim.startSession({ playerCountryId: country });
        lastKnownSpeed = 1;
        setSaveStatus('AUTOSAVE READY');
        saveNow({ force: true });
      } catch (error) {
        setSaveStatus('CLOCK READY · SELECT COUNTRY');
      }
    } else {
      setSaveStatus('SELECT COUNTRY TO START');
    }
    updateHud();
  }

  function setSpeed(value, explicitStart) {
    var sim = runtime();
    var speed = number(value);
    if (!sim || !sim.clock || speed === null || speed < 0) return false;
    if (speed === 0) {
      lastKnownSpeed = number(sim.clock.speed) > 0 ? sim.clock.speed : lastKnownSpeed;
      try { sim.clock.setSpeed(0); } catch (_) {}
      try { if (typeof sim.pauseSession === 'function') sim.pauseSession(); } catch (_) {}
      saveNow({ force: true });
      updateHud();
      return true;
    }
    if (String(sim.status || '').toUpperCase() === 'ERROR') {
      setSaveStatus('GAME ERROR · LAST COMPLETE SAVE PRESERVED');
      updateHud();
      return false;
    }
    lastKnownSpeed = speed;
    try { sim.clock.setSpeed(speed); } catch (_) { return false; }
    var country = playerCountry(sim);
    if (!country) {
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
      setSaveStatus('GAME RUNNING · AUTOSAVE ON');
      if (restoreFailed) { restoreFailed = false; saveNow({ force: true }); }
      else saveNow({ force: true });
      updateHud();
      return true;
    } catch (error) {
      setSaveStatus('CLOCK ERROR · ' + String(error && error.message || error).slice(0, 48));
      updateHud();
      return false;
    }
  }

  function queueTurnSave() {
    // This listener runs inside the canonical pipeline; the high-priority save
    // participant persists after every sector participant has completed.
    updateHud();
  }

  function scheduleStateSave() {
    if (saveInProgress) return; // The outer save snapshots after its reconciliation work.
    var sim = runtime();
    // Avoid persisting a half-applied sector turn. The committed-turn finalizer
    // will save synchronously once the ordered pipeline finishes.
    if (sim && sim.stepInProgress) return;
    if (stateSaveTimer !== null) {
      try { g.clearTimeout(stateSaveTimer); } catch (_) {}
      stateSaveTimer = null;
    }
    // Collapse bursts of domain events into one synchronous snapshot. pagehide,
    // freeze and visibilitychange still flush immediately if the app exits first.
    stateSaveTimer = g.setTimeout(function () {
      stateSaveTimer = null;
      saveNow();
    }, 80);
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

  function registerLifecycleFinalizer() {
    var sim = runtime();
    if (!sim || typeof sim.registerTurnFinalizer !== 'function') return false;
    if (lifecycleFinalizerUnregister) {
      try { lifecycleFinalizerUnregister(); } catch (_) {}
      lifecycleFinalizerUnregister = null;
    }
    lifecycleFinalizerUnregister = sim.registerTurnFinalizer('omega.game-lifecycle.autosave', async function (context) {
      // A failed sector turn is not a coherent checkpoint. Preserve the last known-good
      // save instead of writing a partially applied day over it.
      if (context && context.simulation && String(context.simulation.status || '').toUpperCase() === 'ERROR') {
        setSaveStatus('TURN FAILED · LAST COMPLETE SAVE PRESERVED');
        throw new Error('FAILED_TURN_NOT_SAVED');
      }
      // Runs after all sector participants, the publish hook, and the checkpoint phase.
      // Never report success unless localStorage or the IndexedDB transaction completed.
      var started = saveNow({ force: true, committedTurn: true });
      if (!started) throw new Error('NO_DURABLE_SAVE_TARGET');
      if (!saveNow.lastLocalSaved) {
        var backupSaved = await saveNow.lastBackupPromise;
        if (!backupSaved) throw new Error('LOCAL_STORAGE_AND_INDEXEDDB_SAVE_FAILED');
      }
      return { turn: context && context.turn, durableTarget: saveNow.lastLocalSaved ? 'localStorage' : 'IndexedDB', savedTurn: lastSavedTurn };
    }, { priority: Number.MAX_SAFE_INTEGER });
    return true;
  }

  function clickHandler(event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-omega-action="toggle"], [data-omega-speed], .speed-btn') : null;
    if (!target) return;
    var speed;
    if (target.hasAttribute('data-omega-action')) {
      var sim = runtime();
      var running = sim && String(sim.status || '').toUpperCase() === 'RUNNING' &&
        !(sim.clock && sim.clock.paused);
      if (running) setSpeed(0);
      else setSpeed(lastKnownSpeed || 1);
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
      hiddenWasRunning = !!(sim && String(sim.status || '').toUpperCase() === 'RUNNING' &&
        !(sim.clock && sim.clock.paused));
      hiddenSnapshotSaved = saveNow({ force: true });
      if (hiddenWasRunning && sim && typeof sim.pauseSession === 'function') {
        try { sim.pauseSession(); } catch (_) {}
      }
    } else if (hiddenWasRunning) {
      hiddenWasRunning = false;
      hiddenSnapshotSaved = false;
      var current = runtime();
      if (current) {
        var speed = number(current.clock && current.clock.speed);
        setSpeed(speed !== null && speed > 0 ? speed : lastKnownSpeed || 1);
      }
    }
  }

  function onPageExit() {
    // visibilitychange has already written the running state before pausing the live page.
    if (hiddenWasRunning && hiddenSnapshotSaved && g.document && g.document.visibilityState === 'hidden') return;
    if (stateSaveTimer !== null) {
      try { g.clearTimeout(stateSaveTimer); } catch (_) {}
      stateSaveTimer = null;
    }
    saveNow({ force: true });
  }

  function init() {
    if (!g.document) return;
    registerLifecycleFinalizer();
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
    g.addEventListener && g.addEventListener('OMEGA_SIMULATION_STEP_COMPLETED', updateHud);
    g.addEventListener && g.addEventListener('OMEGA_FINANCE_STATE_UPDATED', updateHud);
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
    g.addEventListener && g.addEventListener('RESOURCE_STATE_UPDATED', updateHud);
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
    restore: restoreOnReady,
    getDiagnostics: function () {
      var sim = runtime();
      return {
        slot: SLOT,
        saveKey: SAVE_KEY,
        savedTurn: lastSavedTurn,
        savedChecksum: lastSavedSerialized ? (sim && sim.saveState ? safeCall(function () { return sim.saveState().checksum; }) : null) : null,
        status: saveStatus,
        participantCount: sim && typeof sim.participantDiagnostics === 'function' ? sim.participantDiagnostics().length : null,
        restoreFinished: restoreFinished,
        restoreFailed: restoreFailed,
        running: !!(sim && sim.status === 'RUNNING'),
        clock: sim && sim.clock && sim.clock.snapshot ? sim.clock.snapshot() : null
      };
    }
  };

  if (g.document) {
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
