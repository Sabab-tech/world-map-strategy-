/* OMEGA COUNTRY PRODUCT INVENTORY RUNTIME v1.0.0
 * Country-scoped, unbounded game inventory ledger.
 * All country records are persisted in Game.state.countryInventories. Only the
 * player-selected country may be mutated by this runtime; other country records
 * remain available for read-only inspection. Existing ResourceIndustrialNetwork
 * remains the authority for factory stock changes, so factory outputs are logged
 * here but are never credited a second time.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  var ROOT_KEY = 'countryInventories';
  var EPSILON = 1e-9;
  var initPromise = null;
  var countryNames = Object.create(null);
  var installed = false;

  function gameState() {
    return (g.Game && g.Game.state) || g.gameState ||
      (g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state) || {};
  }

  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function token(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function upper(value) { return String(value == null ? '' : value).trim().toUpperCase(); }

  function object(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function registry() {
    return g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge ||
      (g.Omega && g.Omega.CanonicalIdentity) || null;
  }

  function rawCountryRecord(resolved) {
    var raw = resolved && resolved.raw;
    if (raw && raw.raw && object(raw.raw)) return raw.raw;
    if (raw && raw.datasets && object(raw.datasets['countries.json'])) return raw.datasets['countries.json'];
    return object(raw) ? raw : {};
  }

  function canonicalCountry(value) {
    var raw = value && typeof value === 'object'
      ? (value.iso3 || value.iso3Code || value.countryCode || value.countryId || value.code || value.id)
      : value;
    var text = upper(raw);
    if (!text) return null;
    if (/^[A-Z]{3}$/.test(text)) return text;
    try {
      var r = registry();
      if (r && typeof r.resolveCountry === 'function') {
        var resolved = r.resolveCountry(text);
        if (resolved && resolved.id) {
          var row = rawCountryRecord(resolved);
          var iso3 = upper(row.iso3 || row.iso3Code || row.countryIso3 ||
            resolved.iso3 || resolved.iso3Code || resolved.countryIso3);
          if (/^[A-Z]{3}$/.test(iso3)) return iso3;
          if (/^[A-Z]{3}$/.test(upper(resolved.id))) return upper(resolved.id);
        }
      }
    } catch (_) {}
    return text;
  }

  function playerCountry() {
    var sim = g.Omega && (g.Omega.SimulationRuntime || g.Omega.Simulation);
    var state = gameState();
    var session = state && state.simulation && state.simulation.session;
    var candidates = [
      session && session.playerCountryId,
      sim && typeof sim.getPlayerCountryId === 'function' ? safeCall(function () { return sim.getPlayerCountryId(); }) : null,
      sim && sim.playerCountryId,
      state && state.playerCountryId,
      state && state.playerCountryCode,
      g.CountryIOS && g.CountryIOS.playerCountryId,
      g.Game && g.Game.playerCountryId,
      g.Game && g.Game.playerCountryCode,
      g.OMEGA_PLAYER_COUNTRY_ID,
      g.currentPlayerCountry,
      g.CountryIOS && g.CountryIOS.activeCountry
    ];
    for (var i = 0; i < candidates.length; i++) {
      var cid = canonicalCountry(candidates[i]);
      if (cid) return cid;
    }
    return null;
  }

  function safeCall(fn) {
    try { return fn(); } catch (_) { return null; }
  }

  function root() {
    var state = gameState();
    if (!object(state[ROOT_KEY])) state[ROOT_KEY] = {};
    var data = state[ROOT_KEY];
    data.schemaVersion = data.schemaVersion || VERSION;
    if (!object(data.countries)) data.countries = {};
    if (!object(data.productCatalog)) data.productCatalog = {};
    if (!object(data.countryNames)) data.countryNames = {};
    if (!number(data.nextSequence)) data.nextSequence = 0;
    return data;
  }

  function normalizeProductId(value) {
    var id = token(value);
    return id || null;
  }

  function displayName(value) {
    var raw = String(value == null ? '' : value).trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    if (!raw) return 'Unknown product';
    var acronyms = new Set(['CNG', 'DAP', 'DME', 'HDPE', 'LDPE', 'LNG', 'LPG', 'MAP', 'NPK', 'PET', 'PGE', 'PVC', 'REE', 'U3O8']);
    return raw.split(' ').map(function (word) {
      if (!word) return word;
      var upper = word.toUpperCase();
      if (acronyms.has(upper) || /^\d+$/.test(word)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  function isGenericName(name, productId) {
    return token(name) === token(productId) || !String(name || '').trim();
  }

  function productMeta(productId, name, unit) {
    var id = normalizeProductId(productId);
    if (!id) return null;
    var data = root(), existing = data.productCatalog[id];
    var nextName = String(name || '').trim();
    if (!nextName) nextName = existing && existing.name ? existing.name : displayName(productId);
    if (existing && !isGenericName(nextName, id)) existing.name = nextName;
    else if (existing && isGenericName(existing.name, id) && !isGenericName(nextName, id)) existing.name = nextName;
    else if (!existing) existing = { productId: id, sourceId: String(productId), name: nextName, unit: null };
    if (existing && !existing.productId) existing.productId = id;
    if (existing && (!existing.name || isGenericName(existing.name, id)) && nextName) existing.name = nextName;
    if (unit && String(unit).trim()) existing.unit = String(unit).trim();
    if (existing && !existing.sourceId) existing.sourceId = String(productId);
    data.productCatalog[id] = existing;
    return existing;
  }

  function rowsFromDataset(source) {
    if (Array.isArray(source)) return source;
    if (!object(source)) return [];
    if (Array.isArray(source.resources)) return source.resources;
    if (Array.isArray(source.resourceTypes)) return source.resourceTypes;
    if (Array.isArray(source.data)) return source.data;
    return Object.keys(source).map(function (key) {
      var value = source[key];
      return object(value) ? Object.assign({ __sourceKey: key }, value) : null;
    }).filter(Boolean);
  }

  function registerResourceRows(source) {
    rowsFromDataset(source).forEach(function (row) {
      if (!object(row)) return;
      var id = row.resourceId || row.resourceTypeId || row.commodityId || row.identityId ||
        row.id || row.code || row.__sourceKey;
      if (!id || typeof id !== 'string') return;
      var name = row.displayName || row.resourceName || row.commodityName || row.name || row.label;
      var unit = row.unit || row.baseUnit || row.measurementUnit || row.outputUnit;
      productMeta(id, name, unit);
    });
  }

  function registerMapKeys(map, unit) {
    if (!object(map)) return;
    Object.keys(map).forEach(function (id) {
      productMeta(id, null, unit || null);
    });
  }

  function scanRecipeNode(node, depth) {
    if (!node || depth > 9) return;
    if (Array.isArray(node)) {
      node.forEach(function (row) { scanRecipeNode(row, depth + 1); });
      return;
    }
    if (!object(node)) return;
    if (object(node.inputs)) registerMapKeys(node.inputs, node.inputUnit);
    if (object(node.outputs)) registerMapKeys(node.outputs, node.outputUnit);
    Object.keys(node).forEach(function (key) {
      if (key === 'inputs' || key === 'outputs') return;
      if (object(node[key]) || Array.isArray(node[key])) scanRecipeNode(node[key], depth + 1);
    });
  }

  function findProductCatalog() {
    var data = root();
    var cat = g.OmegaResourceIndustrialCatalogData ||
      (g.Omega && g.Omega.ResourceIndustrialCatalogData) ||
      g.OmegaCountryInventoryCatalogData || null;

    var resEngine = g.ResourceMinistryEngine || g.OmegaResourceMinistryEngine ||
      (g.Omega && g.Omega.ResourceMinistryEngine);
    registerResourceRows(resEngine && resEngine.resourceTypes);

    try {
      var r = registry();
      if (r && typeof r.getDataset === 'function') {
        registerResourceRows(r.getDataset('resources.json'));
        registerResourceRows(r.getDataset('resources_2.json'));
        if (!cat && typeof r.getDataset === 'function') cat = r.getDataset('resource_industrial_catalog_v1.json');
      }
    } catch (_) {}

    if (object(cat)) {
      registerMapKeys(cat.resourceRules, null);
      var processing = cat.processingRules || {};
      Object.keys(processing).forEach(function (id) {
        var recipe = processing[id] || {};
        productMeta(id, null, recipe.inputUnit || recipe.outputUnit);
        registerMapKeys(recipe.inputs, recipe.inputUnit);
        registerMapKeys(recipe.outputs, recipe.outputUnit);
      });
      scanRecipeNode(cat.downstreamFactoryRecipes, 0);
      scanRecipeNode(cat.factoryProfiles, 0);
    }

    Object.keys(data.productCatalog).forEach(function (id) {
      var p = data.productCatalog[id];
      if (p && !p.productId) p.productId = id;
      if (p && !p.name) p.name = displayName(id);
    });
    return Object.keys(data.productCatalog).length;
  }

  function countryRoster() {
    var r = registry(), source = null, rows = [];
    try {
      if (r && typeof r.getDataset === 'function') source = r.getDataset('countries.json');
      if (Array.isArray(source)) rows = source;
      if (!rows.length && r && typeof r.exportData === 'function') {
        var exported = r.exportData();
        if (exported && Array.isArray(exported.countries)) rows = exported.countries;
      }
    } catch (_) {}

    var found = Object.create(null);
    rows.forEach(function (row) {
      if (!object(row)) return;
      var raw = row.raw && object(row.raw) ? row.raw : row;
      var resolved = canonicalCountry(raw.iso3 || raw.iso3Code || raw.countryIso3 || row.iso3 ||
        row.iso3Code || row.countryCode || row.code || row.id);
      if (!resolved) return;
      var name = raw.name || raw.countryName || raw.officialName || row.name || row.countryName ||
        row.officialName || resolved;
      found[resolved] = String(name);
    });

    var state = gameState();
    ['resource', 'economy', 'transport', 'trade', 'finance', 'foreign', 'industry', 'military'].forEach(function (domain) {
      var table = state && state[domain];
      if (!object(table)) return;
      Object.keys(table).forEach(function (key) {
        var cid = canonicalCountry(key);
        if (cid && !found[cid]) found[cid] = countryNames[cid] || cid;
      });
    });

    Object.keys(countryNames).forEach(function (cid) {
      if (!found[cid]) found[cid] = countryNames[cid];
    });
    countryNames = Object.assign(Object.create(null), found);
    return Object.keys(found).sort().map(function (cid) {
      return { countryId: cid, countryName: found[cid] };
    });
  }

  function turn() {
    var state = gameState();
    var current = number(state && state.simulation && state.simulation.turn);
    if (current === null) current = number(state && state.turn);
    if (current === null) current = number(state && state.simulationTurn);
    return current === null ? 0 : current;
  }

  function resourceState(countryId, create) {
    var state = gameState();
    if (!object(state.resource)) {
      if (create !== true) return null;
      state.resource = {};
    }
    var cid = canonicalCountry(countryId);
    if (!cid) return null;
    if (!object(state.resource[cid])) {
      if (create !== true) return null;
      state.resource[cid] = {};
    }
    var row = state.resource[cid];
    if (!object(row.inventory) && create === true) row.inventory = {};
    return row;
  }

  function inventoryValues(countryId) {
    var cid = canonicalCountry(countryId);
    var map = Object.create(null);
    // Inactive countries expose their last saved snapshot only; their live state is not
    // polled or treated as an executing inventory while another country is the player.
    if (cid && cid !== playerCountry()) {
      var saved = root().countries[cid];
      var balances = saved && object(saved.observedBalances) ? saved.observedBalances : {};
      Object.keys(balances).forEach(function (key) {
        var pid = normalizeProductId(key), value = number(balances[key]);
        if (!pid || value === null) return;
        map[pid] = Math.max(0, value);
      });
      return map;
    }
    var row = resourceState(cid, false);
    var inventory = row && object(row.inventory) ? row.inventory : {};
    Object.keys(inventory).forEach(function (key) {
      var pid = normalizeProductId(key), value = number(inventory[key]);
      if (!pid || value === null) return;
      // Runtime state may receive direct writes from older subsystems. Repair a
      // negative balance at the authoritative inventory boundary, not just in the UI.
      if (value < 0) {
        inventory[key] = 0;
        value = 0;
      }
      map[pid] = Math.max(0, (number(map[pid]) || 0) + value);
    });
    return map;
  }

  function currentBalance(countryId, productId) {
    var map = inventoryValues(countryId);
    return number(map[normalizeProductId(productId)]) || 0;
  }

  function ensureCountry(countryId, name) {
    var cid = canonicalCountry(countryId);
    if (!cid) return null;
    var data = root();
    var row = data.countries[cid];
    if (!object(row)) {
      row = data.countries[cid] = {
        schemaVersion: VERSION,
        countryId: cid,
        countryName: String(name || countryNames[cid] || cid),
        active: false,
        products: {},
        observedBalances: {},
        ledger: [],
        eventIds: {},
        createdTurn: turn(),
        updatedTurn: turn(),
        openingSnapshotInitialized: false
      };
    } else {
      row.countryId = cid;
      if (!row.countryName) row.countryName = String(name || countryNames[cid] || cid);
      if (!object(row.products)) row.products = {};
      if (!object(row.observedBalances)) row.observedBalances = {};
      if (!Array.isArray(row.ledger)) row.ledger = [];
      if (!object(row.eventIds)) row.eventIds = {};
    }
    if (name) row.countryName = String(name);
    data.countryNames[cid] = row.countryName;
    return row;
  }

  function matchingInventoryKeys(inventory, productId) {
    var wanted = normalizeProductId(productId);
    return Object.keys(inventory || {}).filter(function (key) {
      return normalizeProductId(key) === wanted;
    });
  }

  function inventoryKey(inventory, productId) {
    var matches = matchingInventoryKeys(inventory, productId);
    if (matches.length > 1) return { key: null, ambiguous: matches };
    return { key: matches.length ? matches[0] : String(productId), ambiguous: null };
  }

  function baseProduct(countryId, productId, openingQuantity, name, unit) {
    var cid = canonicalCountry(countryId), row = ensureCountry(cid);
    var pid = normalizeProductId(productId);
    if (!row || !pid) return null;
    var meta = productMeta(productId, name, unit);
    var product = row.products[pid];
    if (!object(product)) {
      product = row.products[pid] = {
        productId: pid,
        sourceId: String(productId),
        name: (meta && meta.name) || displayName(productId),
        base: number(openingQuantity) === null ? 0 : number(openingQuantity),
        unit: (unit && String(unit)) || (meta && meta.unit) || 'SIMULATION_RESOURCE_UNIT'
      };
    } else {
      if (!product.name || isGenericName(product.name, pid)) product.name = (meta && meta.name) || displayName(productId);
      if (!product.unit) product.unit = (unit && String(unit)) || (meta && meta.unit) || 'SIMULATION_RESOURCE_UNIT';
      if (product.base === undefined || number(product.base) === null) product.base = number(openingQuantity) || 0;
    }
    return product;
  }

  function baselineCountry(countryId) {
    var cid = canonicalCountry(countryId);
    if (!cid) return { status: 'BLOCKED', reason: 'PLAYER_COUNTRY_NOT_SELECTED' };
    var row = ensureCountry(cid);
    var firstSnapshot = row.openingSnapshotInitialized !== true;
    var resource = resourceState(cid, true);
    var actual = inventoryValues(cid);
    var catalog = root().productCatalog;

    Object.keys(catalog).forEach(function (pid) {
      var sourceId = catalog[pid].sourceId || pid;
      var quantity = number(actual[pid]) || 0;
      var product = baseProduct(cid, sourceId, quantity, catalog[pid].name, catalog[pid].unit);
      if (firstSnapshot && product) product.base = quantity;
      row.observedBalances[pid] = quantity;
    });

    Object.keys(resource && object(resource.inventory) ? resource.inventory : {}).forEach(function (key) {
      var pid = normalizeProductId(key);
      if (!pid) return;
      var unit = resource.inventoryUnits && (resource.inventoryUnits[key] || resource.inventoryUnits[pid]);
      var quantity = number(actual[pid]) || 0;
      var product = baseProduct(cid, key, quantity, null, unit);
      if (firstSnapshot && product) product.base = quantity;
      row.observedBalances[pid] = quantity;
    });

    row.openingSnapshotInitialized = true;
    row.lastReconciledTurn = turn();
    row.updatedTurn = turn();
    return { status: 'READY', countryId: cid, productCount: Object.keys(row.products).length };
  }

  function refreshActiveCountry() {
    var data = root();
    var previousCountryId = data.activeCountryId || null;
    var cid = playerCountry();
    data.activeCountryId = cid;
    Object.keys(data.countries).forEach(function (key) {
      data.countries[key].active = key === cid;
    });
    if (!cid) return null;
    if (!data.countries[cid]) {
      var name = countryNames[cid] || cid;
      ensureCountry(cid, name);
    }
    var row = ensureCountry(cid);
    if (!row.openingSnapshotInitialized || previousCountryId !== cid) baselineCountry(cid);
    else {
      row.active = true;
      row.updatedTurn = turn();
    }
    return cid;
  }

  function appendEntry(countryId, action, productId, delta, detail) {
    detail = object(detail) ? detail : {};
    var cid = canonicalCountry(countryId), pid = normalizeProductId(productId);
    var amount = number(delta);
    if (!cid || !pid || amount === null || Math.abs(amount) <= EPSILON) {
      return { status: 'BLOCKED', reason: 'INVENTORY_LEDGER_ENTRY_INVALID' };
    }
    var row = ensureCountry(cid);
    var sourceId = detail.sourceProductId || productId;
    var liveBalance = currentBalance(cid, productId);
    var product = baseProduct(cid, sourceId,
      Object.prototype.hasOwnProperty.call(row.observedBalances, pid) ? row.observedBalances[pid] : 0,
      detail.productName, detail.unit);
    var eventId = String(detail.eventId || '');
    if (!eventId) {
      var data = root();
      data.nextSequence = (number(data.nextSequence) || 0) + 1;
      eventId = 'INV:' + cid + ':' + data.nextSequence;
    }
    if (Object.prototype.hasOwnProperty.call(row.eventIds, eventId)) {
      return { status: 'DUPLICATE', eventId: eventId, balance: liveBalance };
    }
    row.eventIds[eventId] = true;
    var actionName = String(action || 'ADJUSTMENT').toUpperCase();
    var sign = detail.deltaSign === -1 ? -1 : (detail.deltaSign === 1 ? 1 : (amount < 0 ? -1 : 1));
    var entry = {
      eventId: eventId,
      countryId: cid,
      turn: turn(),
      action: actionName,
      productId: pid,
      name: product.name,
      base: number(product.base) || 0,
      quantity: Math.abs(amount),
      delta: amount,
      unit: detail.unit || product.unit || 'SIMULATION_RESOURCE_UNIT',
      balanceAfter: liveBalance,
      source: String(detail.source || 'OMEGA_COUNTRY_INVENTORY_RUNTIME_V1'),
      referenceId: detail.referenceId || null,
      counterpartyCountryId: canonicalCountry(detail.counterpartyCountryId) || null,
      reason: detail.reason || null,
      metadata: object(detail.metadata) ? detail.metadata : {}
    };
    row.ledger.push(entry);
    row.observedBalances[pid] = liveBalance;
    row.updatedTurn = turn();
    return { status: 'RECORDED', entry: entry, balance: liveBalance };
  }

  function ensureFactoryInventoryDeltas(countryId, reference, inputMap, outputMap, inputSource) {
    var cid = canonicalCountry(countryId);
    if (!cid || cid !== playerCountry()) return { status: 'IGNORED', reason: 'INACTIVE_COUNTRY' };
    var row = ensureCountry(cid);
    var resource = resourceState(cid, true);
    var inventory = resource.inventory;
    var centralInput = !inputSource || String(inputSource).toUpperCase() === 'CENTRAL_INVENTORY';
    var inputs = Object.create(null), outputs = Object.create(null), products = Object.create(null);

    function collect(target, source) {
      if (!object(source)) return;
      Object.keys(source).forEach(function (rawId) {
        var pid = normalizeProductId(rawId), amount = number(source[rawId]);
        if (!pid || amount === null || amount <= 0) return;
        target[pid] = (number(target[pid]) || 0) + amount;
        products[pid] = true;
      });
    }
    collect(inputs, inputMap);
    collect(outputs, outputMap);

    var adjustments = [];
    Object.keys(products).forEach(function (pid) {
      var inputEventId = 'FACTORY:' + reference + ':CONSUMPTION:' + pid;
      var outputEventId = 'FACTORY:' + reference + ':PRODUCTION:' + pid;
      var consumed = Object.prototype.hasOwnProperty.call(row.eventIds, inputEventId) ? 0 : (number(inputs[pid]) || 0);
      var produced = Object.prototype.hasOwnProperty.call(row.eventIds, outputEventId) ? 0 : (number(outputs[pid]) || 0);
      // Country inventory reflects on-hand stock, not a second copy of factory-input lots.
      // Central inventory inputs are already debited by the factory engine. Inputs sourced
      // from a delivered/warehouse factory lot were moved out earlier, so do not debit them
      // again at the cycle boundary. Outputs are different: multi-input cycles may publish
      // only to processedWarehouse, so credit any production amount the country inventory
      // map has not received yet.
      var expectedDelta = produced - (centralInput ? consumed : 0);
      if (Math.abs(expectedDelta) <= EPSILON) return;

      var keyInfo = inventoryKey(inventory, pid);
      if (keyInfo.ambiguous) {
        adjustments.push({ status: 'BLOCKED', reason: 'AMBIGUOUS_INVENTORY_PRODUCT_KEYS', productId: pid, keys: keyInfo.ambiguous });
        return;
      }
      var key = keyInfo.key;
      var rawLive = number(inventory[key]);
      var live = Math.max(0, rawLive || 0);
      if (rawLive !== null && rawLive < 0) inventory[key] = 0;
      var previous = number(row.observedBalances[pid]);
      if (previous === null) previous = live;
      var observedDelta = live - previous;
      var correction = expectedDelta - observedDelta;
      if (Math.abs(correction) > EPSILON) {
        adjustments.push({ productId: pid, key: key, before: live, correction: correction, after: Math.max(0, live + correction) });
      }
    });

    var blocked = adjustments.find(function (row) { return row.status === 'BLOCKED'; });
    if (blocked) return blocked;
    adjustments.forEach(function (adjustment) {
      if (!adjustment.productId || !adjustment.key) return;
      inventory[adjustment.key] = adjustment.after;
      if (!object(resource.inventoryUnits)) resource.inventoryUnits = {};
      resource.inventoryUnits[adjustment.key] = resource.inventoryUnits[adjustment.key] || 'SIMULATION_RESOURCE_UNIT';
    });
    return { status: 'RECONCILED', adjustments: adjustments.filter(function (row) { return row.productId; }) };
  }

  function recordFactoryEvent(countryId, payload, fallbackReference) {
    var cid = canonicalCountry(countryId);
    if (!cid || cid !== playerCountry()) return { status: 'IGNORED', reason: 'INACTIVE_COUNTRY' };
    refreshActiveCountry();
    var p = object(payload) ? payload : {};
    var reference = p.transactionId || p.productionTransactionId || p.cycleId ||
      p.factoryCycleId || p.settlementId || p.batchId || fallbackReference ||
      ('TURN:' + turn() + ':FACTORY:' + String(p.factoryId || 'UNKNOWN'));
    var inputMap = object(p.inputQuantities) ? p.inputQuantities : null;
    var outputMap = object(p.outputQuantities) ? p.outputQuantities :
      (object(p.outputs) ? p.outputs : null);

    if (!inputMap && Array.isArray(p.consumedInputs)) {
      inputMap = {};
      p.consumedInputs.forEach(function (row) {
        if (!row || !(number(row.quantity) > 0)) return;
        var pid = row.resourceId || row.materialIdentity;
        if (!pid) return;
        var id = normalizeProductId(pid);
        inputMap[id] = (number(inputMap[id]) || 0) + Number(row.quantity);
      });
    }

    var balanceSync = ensureFactoryInventoryDeltas(cid, reference, inputMap, outputMap, p.inputSource);
    if (balanceSync.status === 'BLOCKED') return balanceSync;

    if (inputMap) {
      Object.keys(inputMap).forEach(function (pid) {
        var amount = number(inputMap[pid]);
        if (amount === null || amount <= 0) return;
        appendEntry(cid, 'CONSUMPTION', pid, -amount, {
          eventId: 'FACTORY:' + reference + ':CONSUMPTION:' + normalizeProductId(pid),
          source: 'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
          referenceId: reference,
          reason: 'FACTORY_INPUT_CONSUMED'
        });
      });
    }

    if (outputMap) {
      Object.keys(outputMap).forEach(function (pid) {
        var amount = number(outputMap[pid]);
        if (amount === null || amount <= 0) return;
        appendEntry(cid, 'PRODUCTION', pid, amount, {
          eventId: 'FACTORY:' + reference + ':PRODUCTION:' + normalizeProductId(pid),
          source: 'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
          referenceId: reference,
          reason: 'FACTORY_OUTPUT_COMMITTED'
        });
      });
    }
    syncSourceInventoryLedger(cid);
    reconcileCountry(cid, 'FACTORY_EVENT_RECONCILIATION');
    return { status: 'RECORDED', countryId: cid, referenceId: reference };
  }

  function syncSourceInventoryLedger(countryId) {
    var cid = canonicalCountry(countryId);
    if (!cid || cid !== playerCountry()) return { status: 'IGNORED', reason: 'INACTIVE_COUNTRY' };
    var resource = resourceState(cid, false), ledger = resource && Array.isArray(resource.inventoryLedger)
      ? resource.inventoryLedger : [];
    var copied = 0;
    ledger.forEach(function (sourceRow, index) {
      if (!object(sourceRow)) return;
      var type = String(sourceRow.type || sourceRow.action || '').toUpperCase();
      var action = null, deltaSign = 0;
      if (type === 'INTERNATIONAL_TRADE_EXPORT' || type === 'EXPORT' || type === 'TRADE_EXPORT') {
        action = 'EXPORT'; deltaSign = -1;
      } else if (type === 'INTERNATIONAL_TRADE_IMPORT' || type === 'IMPORT' || type === 'TRADE_IMPORT') {
        action = 'IMPORT'; deltaSign = 1;
      } else if (/^(CONSUMPTION|CONSUMED|RESOURCE_CONSUMPTION|INVENTORY_CONSUMED)$/.test(type)) {
        action = 'CONSUMPTION'; deltaSign = -1;
      }
      if (!action || !sourceRow.resourceId) return;
      var amount = number(sourceRow.quantity);
      if (amount === null || amount <= 0) return;
      var consumedBatchIds = Array.isArray(sourceRow.consumed)
        ? sourceRow.consumed.map(function (row) { return row && row.batchId; }).filter(Boolean).join(',')
        : '';
      // Multiple real consumption transactions can legitimately have the same product,
      // amount, reason and turn. Include batch lineage and row position in the fallback
      // identity so such transactions are not collapsed into one ledger event.
      var fallbackReference = type + ':T' + String(sourceRow.turn == null ? turn() : sourceRow.turn) + ':' +
        normalizeProductId(sourceRow.resourceId) + ':' + String(amount) + ':' +
        token(sourceRow.reason || sourceRow.action || 'UNSPECIFIED') + ':BATCHES:' +
        token(consumedBatchIds || 'NO_BATCH_IDS') + ':ROW:' + String(index);
      var reference = sourceRow.settlementId || sourceRow.transactionId || sourceRow.transferId ||
        sourceRow.consumptionId || sourceRow.batchId || fallbackReference;
      var result = appendEntry(cid, action, sourceRow.resourceId, deltaSign * amount, {
        eventId: 'SOURCE_LEDGER:' + type + ':' + reference + ':' + normalizeProductId(sourceRow.resourceId),
        source: 'EXISTING_RESOURCE_INVENTORY_LEDGER',
        referenceId: reference,
        counterpartyCountryId: sourceRow.sourceCountryId || sourceRow.destinationCountryId || null,
        reason: type
      });
      if (result.status === 'RECORDED') copied++;
    });
    return { status: 'SYNCED', copied: copied };
  }

  function reconcileCountry(countryId, reason) {
    var cid = canonicalCountry(countryId);
    if (!cid || cid !== playerCountry()) return { status: 'IGNORED', reason: 'INACTIVE_COUNTRY' };
    var row = ensureCountry(cid), current = inventoryValues(cid);
    var ids = Object.create(null);
    Object.keys(row.observedBalances).forEach(function (pid) { ids[pid] = true; });
    Object.keys(current).forEach(function (pid) { ids[pid] = true; });
    Object.keys(ids).forEach(function (pid) {
      var next = number(current[pid]) || 0;
      var previous = number(row.observedBalances[pid]);
      if (previous === null) {
        row.observedBalances[pid] = next;
        baseProduct(cid, pid, next, null, null);
        return;
      }
      var delta = next - previous;
      if (Math.abs(delta) <= EPSILON) {
        row.observedBalances[pid] = next;
        return;
      }
      appendEntry(cid, 'STATE_ADJUSTMENT', pid, delta, {
        eventId: 'RECONCILE:' + cid + ':' + turn() + ':' + pid + ':' + String(next),
        source: 'OMEGA_COUNTRY_INVENTORY_RUNTIME_V1',
        reason: reason || 'UNCLASSIFIED_STATE_CHANGE'
      });
    });
    row.lastReconciledTurn = turn();
    row.updatedTurn = turn();
    return { status: 'RECONCILED', productCount: Object.keys(ids).length };
  }

  function applySourceEvents(countryId) {
    var cid = canonicalCountry(countryId);
    if (!cid || cid !== playerCountry()) return { status: 'IGNORED', reason: 'INACTIVE_COUNTRY' };
    syncSourceInventoryLedger(cid);
    return reconcileCountry(cid, 'TURN_STATE_RECONCILIATION');
  }

  function addToWarehouse(countryId, productId, quantity, options) {
    var cid = canonicalCountry(countryId), resource = resourceState(cid, true);
    options = object(options) ? options : {};
    var stage = String(options.stage || 'FINISHED').toUpperCase();
    var processed = ['FINISHED', 'PROCESSED', 'INTERMEDIATE', 'REFINED', 'OUTPUT'].includes(stage);
    var prop = processed ? 'processedWarehouse' : 'warehouse';
    var kind = processed ? 'PROCESSED' : 'RAW';
    var warehouse = resource[prop];
    if (!object(warehouse)) {
      warehouse = resource[prop] = {
        warehouseId: 'WH-' + cid + '-' + kind,
        countryId: cid,
        type: processed ? 'SOVEREIGN_FINISHED_GOODS_WAREHOUSE' : 'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        locationNodeKey: 'WAREHOUSE:' + cid + ':' + kind,
        status: 'OPERATIONAL',
        availableByResource: {},
        reservedByResource: {},
        storedBatchIds: [],
        receipts: []
      };
    }
    if (!object(warehouse.availableByResource)) warehouse.availableByResource = {};
    if (!Array.isArray(warehouse.storedBatchIds)) warehouse.storedBatchIds = [];
    if (!Array.isArray(warehouse.receipts)) warehouse.receipts = [];
    var key = inventoryKey(warehouse.availableByResource, productId);
    if (key.ambiguous) return { status: 'BLOCKED', reason: 'AMBIGUOUS_WAREHOUSE_PRODUCT_KEYS', keys: key.ambiguous };
    warehouse.availableByResource[key.key] = (number(warehouse.availableByResource[key.key]) || 0) + quantity;
    var sequence = (number(root().nextSequence) || 0) + 1;
    root().nextSequence = sequence;
    var batchId = 'INV-' + String(options.action || 'IMPORT').toUpperCase() + ':' + cid + ':' + turn() + ':' + sequence;
    var pid = normalizeProductId(productId);
    var unit = String(options.unit || 'SIMULATION_RESOURCE_UNIT');
    var batch = {
      batchId: batchId, resourceId: pid, materialIdentity: pid,
      quantity: quantity, remainingQuantity: quantity, unit: unit, stage: stage,
      countryId: cid, sourceCountryId: options.sourceCountryId || cid,
      originCountryId: options.sourceCountryId || cid, destinationCountryId: cid,
      ownerCountryCode: cid, warehouseId: warehouse.warehouseId,
      locationNodeKey: warehouse.locationNodeKey, status: 'AVAILABLE',
      createdTurn: turn(), lastMovementTurn: turn(),
      provenance: { source: 'OMEGA_COUNTRY_INVENTORY_RUNTIME_V1', authority: 'GAME_TRANSACTION', simulationOnly: true }
    };
    if (!Array.isArray(resource.batches)) resource.batches = [];
    resource.batches.push(batch);
    if (!object(resource.inventoryLots)) resource.inventoryLots = {};
    resource.inventoryLots[batchId] = Object.assign({}, batch);
    warehouse.storedBatchIds.push(batchId);
    warehouse.receipts.push({
      receiptId: 'WH-REC-' + batchId, warehouseId: warehouse.warehouseId, countryId: cid,
      batchId: batchId, resourceId: pid, quantity: quantity, unit: unit,
      simulationTurn: turn(), status: 'RECEIVED'
    });
    return { status: 'RECORDED', batchId: batchId, warehouseId: warehouse.warehouseId };
  }

  function debitWarehouseAndBatches(countryId, productId, quantity, action) {
    var cid = canonicalCountry(countryId), resource = resourceState(cid, true);
    var remaining = quantity;
    var batches = Array.isArray(resource.batches) ? resource.batches : [];
    var lots = object(resource.inventoryLots) ? resource.inventoryLots : {};
    var inactive = new Set(['CONSUMED', 'EXPORTED', 'SOLD', 'TRANSFERRED_OUT', 'EXHAUSTED', 'DECOMMISSIONED']);
    var candidates = batches.filter(function (batch) {
      return normalizeProductId(batch.resourceId || batch.materialIdentity) === normalizeProductId(productId) &&
        !inactive.has(String(batch.status || '').toUpperCase()) &&
        Math.max(0, number(batch.remainingQuantity != null ? batch.remainingQuantity : batch.quantity) || 0) > EPSILON;
    }).sort(function (a, b) { return (number(a.createdTurn) || 0) - (number(b.createdTurn) || 0); });

    candidates.forEach(function (batch) {
      if (remaining <= EPSILON) return;
      var before = Math.max(0, number(batch.remainingQuantity != null ? batch.remainingQuantity : batch.quantity) || 0);
      var take = Math.min(before, remaining);
      if (take <= EPSILON) return;
      batch.remainingQuantity = before - take;
      batch.status = batch.remainingQuantity > EPSILON ? 'PARTIALLY_' + action : (action === 'EXPORT' ? 'EXPORTED' : 'CONSUMED');
      batch.lastMovementType = action;
      batch.lastMovementTurn = turn();
      var lot = lots[batch.batchId];
      if (lot) {
        lot.remainingQuantity = batch.remainingQuantity;
        lot.status = batch.status;
        lot.lastMovementType = action;
        lot.lastMovementTurn = turn();
      }
      var stage = String(batch.stage || 'RAW').toUpperCase();
      var prop = ['FINISHED', 'PROCESSED', 'INTERMEDIATE', 'REFINED', 'OUTPUT'].includes(stage)
        ? 'processedWarehouse' : 'warehouse';
      var warehouse = resource[prop];
      var available = warehouse && warehouse.availableByResource;
      if (object(available)) {
        var key = inventoryKey(available, productId);
        if (!key.ambiguous) available[key.key] = Math.max(0, (number(available[key.key]) || 0) - take);
      }
      remaining -= take;
    });

    if (remaining > EPSILON) {
      ['warehouse', 'processedWarehouse'].forEach(function (prop) {
        if (remaining <= EPSILON) return;
        var warehouse = resource[prop], available = warehouse && warehouse.availableByResource;
        if (!object(available)) return;
        var key = inventoryKey(available, productId);
        if (key.ambiguous) return;
        var stock = Math.max(0, number(available[key.key]) || 0);
        var take = Math.min(stock, remaining);
        available[key.key] = stock - take;
        remaining -= take;
      });
    }
    return { status: 'RECORDED', untrackedQuantity: Math.max(0, remaining) };
  }

  function applyTransaction(input) {
    input = object(input) ? input : {};
    var cid = canonicalCountry(input.countryId);
    var active = refreshActiveCountry();
    if (!cid || cid !== active) return { status: 'BLOCKED', reason: 'PLAYER_COUNTRY_ONLY', activeCountryId: active, countryId: cid };
    var productId = input.productId || input.resourceId || input.name;
    var pid = normalizeProductId(productId);
    var quantity = number(input.quantity);
    var action = String(input.action || 'ADJUSTMENT').toUpperCase();
    var positive = ['PRODUCTION', 'IMPORT', 'TRANSFER_IN', 'CREDIT', 'ADJUSTMENT_IN'].includes(action);
    var negative = ['CONSUMPTION', 'EXPORT', 'TRANSFER_OUT', 'DEBIT', 'ADJUSTMENT_OUT'].includes(action);
    if (!pid || quantity === null || quantity <= 0 || !Number.isFinite(quantity) || (!positive && !negative)) {
      return { status: 'BLOCKED', reason: 'INVENTORY_TRANSACTION_INVALID' };
    }
    var transactionEventId = String(input.eventId || '');
    var existingCountry = root().countries[cid];
    if (transactionEventId && existingCountry && existingCountry.eventIds &&
        Object.prototype.hasOwnProperty.call(existingCountry.eventIds, transactionEventId)) {
      return { status: 'DUPLICATE', reason: 'INVENTORY_TRANSACTION_ALREADY_APPLIED',
        countryId: cid, productId: pid, action: action,
        balance: currentBalance(cid, productId), eventId: transactionEventId };
    }
    var resource = resourceState(cid, true);
    var inventory = resource.inventory;
    var key = inventoryKey(inventory, productId);
    if (key.ambiguous) return { status: 'BLOCKED', reason: 'AMBIGUOUS_INVENTORY_PRODUCT_KEYS', keys: key.ambiguous };
    var current = number(inventory[key.key]) || 0;
    if (current < 0) {
      inventory[key.key] = 0;
      current = 0;
    }
    var delta = positive ? quantity : -quantity;
    if (negative && current + EPSILON < quantity) {
      return { status: 'BLOCKED', reason: 'INSUFFICIENT_INVENTORY', available: current, requested: quantity };
    }

    if (positive) {
      inventory[key.key] = current + quantity;
      if (!object(resource.inventoryUnits)) resource.inventoryUnits = {};
      resource.inventoryUnits[key.key] = String(input.unit || resource.inventoryUnits[key.key] || 'SIMULATION_RESOURCE_UNIT');
      if (action !== 'ADJUSTMENT_IN') {
        var warehouseResult = addToWarehouse(cid, productId, quantity, {
          stage: input.stage || (action === 'IMPORT' ? 'FINISHED' : 'FINISHED'),
          unit: input.unit, sourceCountryId: input.sourceCountryId || cid, action: action
        });
        if (warehouseResult.status !== 'RECORDED') return warehouseResult;
      }
    } else {
      inventory[key.key] = Math.max(0, current + delta);
      debitWarehouseAndBatches(cid, productId, quantity, action);
    }

    var result = appendEntry(cid, action, productId, delta, {
      eventId: input.eventId || null,
      source: input.source || 'PLAYER_GAME_TRANSACTION',
      referenceId: input.referenceId || input.transactionId || null,
      counterpartyCountryId: input.counterpartyCountryId || null,
      productName: input.productName || input.name || null,
      unit: input.unit || null,
      reason: input.reason || null,
      metadata: object(input.metadata) ? input.metadata : {}
    });
    reconcileCountry(cid, 'POST_TRANSACTION_RECONCILIATION');
    return { status: result.status === 'RECORDED' ? 'COMPLETED' : result.status,
      countryId: cid, productId: pid, action: action, delta: delta, balance: currentBalance(cid, pid),
      eventId: result.entry && result.entry.eventId || input.eventId || null };
  }

  function importProduct(input) {
    return applyTransaction(Object.assign({}, input, { action: 'IMPORT' }));
  }

  function exportProduct(input) {
    return applyTransaction(Object.assign({}, input, { action: 'EXPORT' }));
  }

  function consumeProduct(input) {
    return applyTransaction(Object.assign({}, input, { action: 'CONSUMPTION' }));
  }

  function recordSourceRow(countryId, type, payload) {
    payload = object(payload) ? payload : {};
    var cid = canonicalCountry(countryId || payload.countryId);
    if (!cid || cid !== playerCountry()) return { status: 'IGNORED', reason: 'INACTIVE_COUNTRY' };
    if (/^OMEGA_(INDUSTRIAL_PRODUCTION_COMPLETED|RESOURCE_PROCESSING_COMPLETED|RESOURCE_FINISHED_GOODS_AVAILABLE|FACTORY_PRODUCTION_CYCLE_COMPLETED)$/.test(type)) {
      return recordFactoryEvent(cid, payload, type + ':' + turn());
    }
    syncSourceInventoryLedger(cid);
    return reconcileCountry(cid, type || 'STATE_EVENT_RECONCILIATION');
  }

  function eventData(event) {
    var detail = event && object(event.detail) ? event.detail : {};
    var payload = object(detail.payload) ? detail.payload : detail;
    if (object(payload.payload) && (payload.source || payload.eventType)) payload = payload.payload;
    var cid = canonicalCountry(detail.countryId || payload.countryId || payload.ownerCountryCode ||
      payload.destinationCountryId || payload.sourceCountryId);
    return { countryId: cid, payload: payload, detail: detail };
  }

  function onFactoryEvent(event) {
    var data = eventData(event);
    if (!data.countryId || data.countryId !== playerCountry()) return;
    recordFactoryEvent(data.countryId, data.payload, event && event.type);
  }

  function onSourceEvent(event) {
    var data = eventData(event);
    var type = String(event && event.type || '');
    var active = playerCountry();
    if (!active) return;
    // Trade settlement emits a single cross-border event, but may identify only the
    // counterparty country. Reconcile the player's own committed trade ledger regardless
    // of which side the event payload names so exports are not missed by the seller.
    if (type === 'OMEGA_TRADE_SETTLEMENT_COMPLETED') {
      syncSourceInventoryLedger(active);
      reconcileCountry(active, 'TRADE_SETTLEMENT_RECONCILIATION');
      return;
    }
    if (!data.countryId || data.countryId !== active) return;
    recordSourceRow(data.countryId, type, data.payload);
  }

  function onTurnEvent() {
    var cid = refreshActiveCountry();
    if (!cid) return;
    applySourceEvents(cid);
  }

  function getCountryRecord(countryId) {
    var cid = canonicalCountry(countryId);
    if (!cid) return null;
    var row = root().countries[cid] || ensureCountry(cid);
    return clone(row);
  }

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

  function getInventory(countryId, options) {
    options = object(options) ? options : {};
    var cid = canonicalCountry(countryId || playerCountry());
    if (!cid) return { status: 'BLOCKED', reason: 'COUNTRY_NOT_RESOLVED', countryId: null, items: [], ledger: [] };
    var row = root().countries[cid] || ensureCountry(cid);
    var current = inventoryValues(cid);
    var data = root(), ids = Object.create(null);
    Object.keys(data.productCatalog).forEach(function (id) { ids[id] = true; });
    Object.keys(row.products || {}).forEach(function (id) { ids[id] = true; });
    Object.keys(current).forEach(function (id) { ids[id] = true; });
    var items = Object.keys(ids).sort().map(function (pid) {
      var meta = data.productCatalog[pid] || {};
      var product = row.products && row.products[pid] || {};
      var quantity = number(current[pid]) || 0;
      return {
        productId: pid,
        name: product.name || meta.name || displayName(pid),
        base: number(product.base) === null ? 0 : number(product.base),
        quantity: quantity,
        deltaFromBase: quantity - (number(product.base) || 0),
        unit: product.unit || meta.unit || 'SIMULATION_RESOURCE_UNIT',
        countryId: cid
      };
    }).filter(function (item) { return options.includeZero === true || Math.abs(item.quantity) > EPSILON; });
    return {
      status: 'READY',
      countryId: cid,
      countryName: row.countryName || countryNames[cid] || cid,
      active: cid === playerCountry(),
      readOnly: cid !== playerCountry(),
      unbounded: true,
      items: items,
      ledger: options.includeLedger === false ? [] : clone(row.ledger || []),
      totalLedgerEntries: Array.isArray(row.ledger) ? row.ledger.length : 0,
      updatedTurn: row.updatedTurn || 0,
      authority: 'OMEGA_COUNTRY_INVENTORY_RUNTIME_V1'
    };
  }

  function diagnostics() {
    var data = root();
    var active = refreshActiveCountry();
    var records = Object.keys(data.countries);
    var ledgerCount = records.reduce(function (sum, cid) {
      return sum + (Array.isArray(data.countries[cid].ledger) ? data.countries[cid].ledger.length : 0);
    }, 0);
    return {
      version: VERSION,
      status: active ? 'READY' : 'WAITING_FOR_PLAYER_COUNTRY',
      countryCount: records.length,
      productCatalogCount: Object.keys(data.productCatalog).length,
      activeCountryId: active,
      activeCountryOnly: true,
      capacityLimited: false,
      ledgerEntryLimit: null,
      totalLedgerEntries: ledgerCount,
      storage: 'Game.state.' + ROOT_KEY,
      authority: 'OMEGA_COUNTRY_INVENTORY_RUNTIME_V1'
    };
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      var r = registry();
      if (r && typeof r.init === 'function') {
        try { await r.init(); } catch (_) {}
      }
      var cat = g.OmegaResourceIndustrialCatalogData ||
        (g.Omega && g.Omega.ResourceIndustrialCatalogData) ||
        g.OmegaCountryInventoryCatalogData || null;
      if (!object(cat) && typeof g.fetch === 'function') {
        try {
          var response = await g.fetch('./resource_industrial_catalog_v1.json', { cache: 'no-store' });
          if (response && response.ok) {
            cat = await response.json();
            g.OmegaCountryInventoryCatalogData = cat;
          }
        } catch (_) {}
      }
      findProductCatalog();
      var roster = countryRoster();
      roster.forEach(function (row) { ensureCountry(row.countryId, row.countryName); });
      var active = refreshActiveCountry();
      if (active) {
        baselineCountry(active);
        applySourceEvents(active);
      }
      installEventListeners();
      return diagnostics();
    })();
    return initPromise;
  }

  function installEventListeners() {
    if (installed || typeof g.addEventListener !== 'function') return;
    installed = true;
    [
      'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',
      'OMEGA_RESOURCE_PROCESSING_COMPLETED',
      'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',
      'OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED'
    ].forEach(function (type) {
      g.addEventListener(type, onFactoryEvent);
    });
    [
      'OMEGA_TRADE_SETTLEMENT_COMPLETED',
      'OMEGA_RESOURCE_INVENTORY_CHANGED',
      'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
      'OMEGA_RESOURCE_BATCH_CREATED',
      'OMEGA_RESOURCE_IMPORT_COMPLETED',
      'OMEGA_RESOURCE_EXPORT_COMPLETED',
      'OMEGA_RESOURCE_CONSUMPTION_COMPLETED',
      'RESOURCE_STATE_UPDATED'
    ].forEach(function (type) {
      g.addEventListener(type, onSourceEvent);
    });
    [
      'OMEGA_SIMULATION_TURN_COMMITTED',
      'OMEGA_GAME_SESSION_STARTED',
      'OMEGA_COUNTRY_SELECTED',
      'COUNTRY_SELECTED',
      'OMEGA_COUNTRY_CONTEXT_CHANGED',
      'OMEGA_SELECTED_COUNTRY_CHANGED'
    ].forEach(function (type) {
      g.addEventListener(type, onTurnEvent);
    });
  }

  function ensureRuntime() {
    root();
    findProductCatalog();
    refreshActiveCountry();
    return { status: 'READY', version: VERSION };
  }

  var api = {
    VERSION: VERSION,
    init: init,
    ensureRuntime: ensureRuntime,
    getPlayerCountryId: playerCountry,
    refreshActiveCountry: refreshActiveCountry,
    getInventory: getInventory,
    getCountryRecord: getCountryRecord,
    registerProduct: function (productId, name, unit) {
      var meta = productMeta(productId, name, unit);
      var active = refreshActiveCountry();
      if (active) baselineCountry(active);
      return meta ? clone(meta) : null;
    },
    recordTransaction: applyTransaction,
    importProduct: importProduct,
    exportProduct: exportProduct,
    consumeProduct: consumeProduct,
    recordFactoryEvent: recordFactoryEvent,
    syncSourceInventoryLedger: syncSourceInventoryLedger,
    reconcileCountry: reconcileCountry,
    diagnostics: diagnostics
  };

  g.OmegaCountryInventoryRuntime = api;
  g.Omega = g.Omega || {};
  g.Omega.CountryInventoryRuntime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  installEventListeners();
  init().catch(function () {
    initPromise = null;
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
