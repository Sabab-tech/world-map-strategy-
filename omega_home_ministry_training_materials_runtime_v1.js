/* OMEGA POLICE CAPABILITY MATERIALS TRANSACTION RUNTIME v1.0.0
 * Resource debits for police training/recruitment upgrades are transactional.
 * Only live, country-scoped inventory outside protected reserves can be consumed.
 */
(function (g) {
  'use strict';
  if (g.OmegaHomePoliceTrainingMaterialsRuntime && g.OmegaHomePoliceTrainingMaterialsRuntime.VERSION === '1.0.0') return;

  var VERSION = '1.0.0';
  var COMMAND = 'OMEGA_HOME_POLICE_CAPABILITY_MATERIALS';
  var MAX_LEDGER = 2048;
  var handlerRegistered = false;
  var lastError = null;

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (key !== '__proto__' && key !== 'constructor' && typeof value[key] !== 'function') out[key] = clone(value[key]);
    });
    return out;
  }
  function token(value) { return String(value == null ? '' : value).trim().toLowerCase().replace(/[\\s-]+/g, '_'); }
  function number(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }
  function state() { return g.Game && g.Game.state || g.gameState || {}; }
  function interop() { return g.Omega && g.Omega.MinistryInteroperability || g.OmegaMinistryInteroperability || null; }
  function event(type, details) {
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function')
        g.dispatchEvent(new g.CustomEvent(type, { detail: clone(details || {}) }));
    } catch (_) {}
  }
  function mapEntry(map, resourceId) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return { key: null, value: null, quantity: null };
    var wanted = token(resourceId);
    var key = Object.keys(map).find(function (item) { return token(item) === wanted; });
    if (key === undefined) return { key: null, value: null, quantity: null };
    var value = map[key], raw = value;
    if (value && typeof value === 'object' && !Array.isArray(value))
      raw = value.availableQuantity != null ? value.availableQuantity :
        value.available != null ? value.available :
        value.quantity != null ? value.quantity :
        value.amount != null ? value.amount :
        value.value != null ? value.value :
        value.stock != null ? value.stock : value.total;
    return { key: key, value: value, quantity: number(raw) };
  }
  function withQuantity(raw, quantity) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      var next = clone(raw);
      var field = ['availableQuantity','available','quantity','amount','value','stock','total'].find(function (key) {
        return Object.prototype.hasOwnProperty.call(next, key);
      }) || 'quantity';
      next[field] = quantity;
      return next;
    }
    return quantity;
  }
  function getBatchResource(row) {
    return row && (row.resourceId || row.resource_id || row.materialId || row.commodityId ||
      row.resourceTypeId || row.resource || row.commodity || row.material || row.typeId) || null;
  }
  function getBatchQuantity(row) {
    if (!row || typeof row !== 'object') return 0;
    var n = number(row.remainingQuantity != null ? row.remainingQuantity :
      row.availableQuantity != null ? row.availableQuantity :
      row.quantity != null ? row.quantity : row.amount);
    return Math.max(0, n == null ? 0 : n);
  }
  function batchIsReserved(row) {
    var status = token(row && (row.lifecycleStatus || row.status || row.availabilityStatus) || '');
    var stage = token(row && (row.stage || row.storageStage || row.destinationType) || '');
    return /(^|_)(reserved|locked|in_transit|consumed|depleted|used|sold|exported)(_|$)/.test(status) ||
      /strategic_reserve|strategic_stockpile|reserve_buffer/.test(stage);
  }
  function appendLedger(ledger, row) {
    var rows = Array.isArray(ledger) ? ledger.map(clone) : [];
    rows.push(row);
    return rows.slice(-MAX_LEDGER);
  }
  function reject(reason, detail) { return { accepted: false, reason: reason, detail: detail || null }; }

  function consume(payload, context, tx) {
    var countryId = String(context && context.countryId || '').toUpperCase();
    var projectId = String(payload.projectId || '').trim();
    var requirements = Array.isArray(payload.materials) ? payload.materials : [];
    if (!countryId || !projectId || requirements.length < 1 || requirements.length > 12)
      return reject('CAPABILITY_MATERIAL_REQUEST_INVALID');
    var inventory = tx.get('resource.inventory');
    var tradeAvailability = tx.get('resource.tradeAvailability');
    var reserveState = tx.get('resource.strategicReserve');
    var batches = tx.get('resource.batches');
    var warehouse = tx.get('resource.warehouse');
    var ledger = tx.get('resource.inventoryLedger');
    if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory))
      return reject('AUTHORITATIVE_RESOURCE_INVENTORY_UNAVAILABLE');
    inventory = clone(inventory);
    tradeAvailability = tradeAvailability && typeof tradeAvailability === 'object' ? clone(tradeAvailability) : {};
    reserveState = reserveState && typeof reserveState === 'object' ? clone(reserveState) : {};
    batches = Array.isArray(batches) ? clone(batches) : [];
    warehouse = warehouse && typeof warehouse === 'object' ? clone(warehouse) : null;
    ledger = Array.isArray(ledger) ? clone(ledger) : [];

    var duplicate = ledger.find(function (row) {
      return row && row.type === 'POLICE_CAPABILITY_MATERIAL_CONSUMPTION' &&
        row.projectId === projectId && row.status === 'CONSUMED';
    });
    if (duplicate) return reject('CAPABILITY_MATERIAL_REQUEST_DUPLICATE', { projectId: projectId });

    var planned = [];
    var totalDeductions = [];
    for (var index = 0; index < requirements.length; index++) {
      var requirement = requirements[index] || {};
      var resourceId = String(requirement.resourceId || '').trim().toUpperCase();
      var quantity = number(requirement.quantity);
      if (!resourceId || quantity == null || quantity <= 0)
        return reject('CAPABILITY_MATERIAL_REQUIREMENT_INVALID', { index: index });
      var entry = mapEntry(inventory, resourceId);
      if (entry.key == null || entry.quantity == null)
        return reject('RESOURCE_STOCK_UNAVAILABLE', { resourceId: resourceId });
      var tradeEntry = mapEntry(tradeAvailability, resourceId);
      var reserveEntry = mapEntry(reserveState.availableByResource, resourceId);
      var reserved = Math.max(0, reserveEntry.quantity == null ? 0 : reserveEntry.quantity);
      var available = tradeEntry.quantity == null ? Math.max(0, entry.quantity - reserved) : Math.max(0, tradeEntry.quantity);
      if (available + 1e-9 < quantity)
        return reject('INSUFFICIENT_UNRESERVED_RESOURCE_STOCK', {
          resourceId: resourceId, requiredQuantity: quantity, availableQuantity: available
        });

      var matchingBatchRows = [];
      var hasResourceBatches = false;
      batches.forEach(function (batch, batchIndex) {
        if (token(getBatchResource(batch)) !== token(resourceId)) return;
        hasResourceBatches = true;
        if (batchIsReserved(batch)) return;
        var availableBatchQuantity = getBatchQuantity(batch);
        if (availableBatchQuantity > 0) matchingBatchRows.push({ index: batchIndex, before: availableBatchQuantity, take: 0 });
      });
      var batchTotal = matchingBatchRows.reduce(function (sum, item) { return sum + item.before; }, 0);
      if (hasResourceBatches && batchTotal + 1e-9 < quantity)
        return reject('INSUFFICIENT_UNRESERVED_BATCH_STOCK', {
          resourceId: resourceId, requiredQuantity: quantity, availableBatchQuantity: batchTotal
        });
      if (!hasResourceBatches) matchingBatchRows = [];

      var warehouseMap = warehouse && warehouse.availableByResource;
      var warehouseEntry = mapEntry(warehouseMap, resourceId);
      if (warehouseEntry.key != null && warehouseEntry.quantity != null && warehouseEntry.quantity + 1e-9 < quantity)
        return reject('INSUFFICIENT_WAREHOUSE_STOCK', {
          resourceId: resourceId, requiredQuantity: quantity, availableWarehouseQuantity: warehouseEntry.quantity
        });

      var tradeBeforeExists = tradeEntry.key != null;
      planned.push({
        resourceId: resourceId, quantity: quantity, inventoryKey: entry.key, inventoryBefore: clone(entry.value),
        tradeKey: tradeEntry.key, tradeBeforeExists: tradeBeforeExists, tradeBefore: clone(tradeEntry.value),
        availableBefore: available, reservedQuantity: reserved,
        warehouseKey: warehouseEntry.key, warehouseBefore: clone(warehouseEntry.value),
        batchRows: matchingBatchRows.map(function (item) {
          var batch = batches[item.index];
          return {
            index: item.index, batchId: batch && (batch.id || batch.batchId || batch.batch_id) || null,
            remainingQuantityBefore: batch && batch.remainingQuantity,
            availableQuantityBefore: batch && batch.availableQuantity,
            quantityBefore: batch && batch.quantity,
            lifecycleStatusBefore: batch && batch.lifecycleStatus,
            statusBefore: batch && batch.status,
            before: item.before
          };
        })
      });
    }

    planned.forEach(function (row) {
      var entry = mapEntry(inventory, row.resourceId);
      inventory[row.inventoryKey] = withQuantity(entry.value, Math.max(0, entry.quantity - row.quantity));
      var tradeEntry = mapEntry(tradeAvailability, row.resourceId);
      if (tradeEntry.key != null && tradeEntry.quantity != null)
        tradeAvailability[tradeEntry.key] = withQuantity(tradeEntry.value, Math.max(0, tradeEntry.quantity - row.quantity));
      else if (row.tradeBeforeExists === false) {
        var protectedReserve = row.reservedQuantity || 0;
        tradeAvailability[row.inventoryKey] = Math.max(0, entry.quantity - row.quantity - protectedReserve);
      }

      var remainingToConsume = row.quantity;
      row.batchRows.forEach(function (batchRef) {
        if (remainingToConsume <= 1e-9) return;
        var batch = batches[batchRef.index];
        var take = Math.min(getBatchQuantity(batch), remainingToConsume);
        if (take <= 0) return;
        if (batch.remainingQuantity != null) batch.remainingQuantity = Math.max(0, number(batch.remainingQuantity) - take);
        else if (batch.availableQuantity != null) batch.availableQuantity = Math.max(0, number(batch.availableQuantity) - take);
        else batch.remainingQuantity = Math.max(0, batchRef.before - take);
        if (getBatchQuantity(batch) <= 1e-9) {
          if (Object.prototype.hasOwnProperty.call(batch, 'lifecycleStatus')) batch.lifecycleStatus = 'CONSUMED';
          else if (Object.prototype.hasOwnProperty.call(batch, 'status')) batch.status = 'CONSUMED';
          else batch.lifecycleStatus = 'CONSUMED';
        }
        batchRef.take = take;
        remainingToConsume -= take;
      });

      if (row.warehouseKey != null && warehouse && warehouse.availableByResource) {
        var w = mapEntry(warehouse.availableByResource, row.resourceId);
        if (w.key != null && w.quantity != null)
          warehouse.availableByResource[w.key] = withQuantity(w.value, Math.max(0, w.quantity - row.quantity));
      }
    });
    var receipt = {
      type: 'POLICE_CAPABILITY_MATERIAL_CONSUMPTION', projectId: projectId, countryId: countryId,
      status: 'CONSUMED', consumedAtTurn: Number(context && context.simulationTurn) || 0,
      materials: planned.map(function (row) { return { resourceId: row.resourceId, quantity: row.quantity }; }),
      stockAdjustments: planned, batchAdjustments: planned.reduce(function (out, row) {
        return out.concat(row.batchRows.filter(function (item) { return item.take > 0; }));
      }, [])
    };
    ledger = appendLedger(ledger, receipt);
    tx.set('resource.inventory', inventory);
    tx.set('resource.tradeAvailability', tradeAvailability);
    if (Array.isArray(tx.get('resource.batches'))) tx.set('resource.batches', batches);
    if (warehouse) tx.set('resource.warehouse', warehouse);
    tx.set('resource.inventoryLedger', ledger);
    event('OMEGA_RESOURCE_POLICE_CAPABILITY_MATERIALS_CONSUMED', {
      countryId: countryId, projectId: projectId, materials: receipt.materials, turn: receipt.consumedAtTurn
    });
    return { accepted: true, status: 'CONSUMED', receipt: {
      projectId: projectId, countryId: countryId, materials: clone(receipt.materials), consumedAtTurn: receipt.consumedAtTurn
    } };
  }

  function refund(payload, context, tx) {
    var countryId = String(context && context.countryId || '').toUpperCase();
    var projectId = String(payload.projectId || '').trim();
    if (!countryId || !projectId) return reject('CAPABILITY_MATERIAL_REFUND_INVALID');
    var inventory = tx.get('resource.inventory');
    var tradeAvailability = tx.get('resource.tradeAvailability');
    var batches = tx.get('resource.batches');
    var warehouse = tx.get('resource.warehouse');
    var ledger = tx.get('resource.inventoryLedger');
    inventory = inventory && typeof inventory === 'object' ? clone(inventory) : null;
    tradeAvailability = tradeAvailability && typeof tradeAvailability === 'object' ? clone(tradeAvailability) : {};
    batches = Array.isArray(batches) ? clone(batches) : [];
    warehouse = warehouse && typeof warehouse === 'object' ? clone(warehouse) : null;
    ledger = Array.isArray(ledger) ? clone(ledger) : [];
    if (!inventory) return reject('AUTHORITATIVE_RESOURCE_INVENTORY_UNAVAILABLE');

    var index = -1;
    for (var i = ledger.length - 1; i >= 0; i--) {
      if (ledger[i] && ledger[i].type === 'POLICE_CAPABILITY_MATERIAL_CONSUMPTION' &&
          ledger[i].projectId === projectId && ledger[i].status === 'CONSUMED') { index = i; break; }
    }
    if (index < 0) {
      var alreadyRefunded = ledger.some(function (row) {
        return row && row.type === 'POLICE_CAPABILITY_MATERIAL_REFUND' && row.projectId === projectId;
      });
      return alreadyRefunded ? { accepted: true, duplicate: true, status: 'ALREADY_REFUNDED', projectId: projectId } :
        reject('CAPABILITY_MATERIAL_REFUND_RECEIPT_NOT_FOUND', { projectId: projectId });
    }

    var receipt = ledger[index], adjustments = Array.isArray(receipt.stockAdjustments) ? receipt.stockAdjustments : [];
    adjustments.forEach(function (row) {
      if (!Object.prototype.hasOwnProperty.call(inventory, row.inventoryKey)) return;
      inventory[row.inventoryKey] = clone(row.inventoryBefore);
      if (row.tradeKey != null && Object.prototype.hasOwnProperty.call(tradeAvailability, row.tradeKey))
        tradeAvailability[row.tradeKey] = clone(row.tradeBefore);
      else if (row.tradeBeforeExists === false) {
        var newKey = Object.keys(tradeAvailability).find(function (key) { return token(key) === token(row.resourceId); });
        if (newKey != null) delete tradeAvailability[newKey];
      }
      if (row.warehouseKey != null && warehouse && warehouse.availableByResource)
        warehouse.availableByResource[row.warehouseKey] = clone(row.warehouseBefore);
    });
    (Array.isArray(receipt.batchAdjustments) ? receipt.batchAdjustments : []).forEach(function (row) {
      var batch = batches[row.index];
      if (!batch) return;
      if (row.remainingQuantityBefore !== undefined) batch.remainingQuantity = row.remainingQuantityBefore;
      if (row.availableQuantityBefore !== undefined) batch.availableQuantity = row.availableQuantityBefore;
      if (row.quantityBefore !== undefined) batch.quantity = row.quantityBefore;
      if (row.lifecycleStatusBefore !== undefined) batch.lifecycleStatus = row.lifecycleStatusBefore;
      else if (Object.prototype.hasOwnProperty.call(batch, 'lifecycleStatus')) delete batch.lifecycleStatus;
      if (row.statusBefore !== undefined) batch.status = row.statusBefore;
      else if (Object.prototype.hasOwnProperty.call(batch, 'status')) delete batch.status;
    });
    receipt.status = 'REFUNDED';
    receipt.refundedAtTurn = Number(context && context.simulationTurn) || 0;
    ledger[index] = receipt;
    ledger = appendLedger(ledger, {
      type: 'POLICE_CAPABILITY_MATERIAL_REFUND', projectId: projectId, countryId: countryId,
      status: 'REFUNDED', referencedConsumption: projectId, materials: clone(receipt.materials),
      refundedAtTurn: Number(context && context.simulationTurn) || 0
    });
    tx.set('resource.inventory', inventory);
    tx.set('resource.tradeAvailability', tradeAvailability);
    if (Array.isArray(tx.get('resource.batches'))) tx.set('resource.batches', batches);
    if (warehouse) tx.set('resource.warehouse', warehouse);
    tx.set('resource.inventoryLedger', ledger);
    event('OMEGA_RESOURCE_POLICE_CAPABILITY_MATERIALS_REFUNDED', {
      countryId: countryId, projectId: projectId, materials: receipt.materials, turn: receipt.refundedAtTurn
    });
    return { accepted: true, status: 'REFUNDED', projectId: projectId, materials: clone(receipt.materials) };
  }

  function handle(command, context) {
    var payload = command && command.payload || command || {};
    var tx = context && context.stateTransaction;
    if (!tx || typeof tx.get !== 'function' || typeof tx.set !== 'function') return reject('AUTHORITATIVE_STATE_TRANSACTION_UNAVAILABLE');
    var mode = String(payload.mode || '').toUpperCase();
    if (mode === 'CONSUME') return consume(payload, context, tx);
    if (mode === 'REFUND') return refund(payload, context, tx);
    return reject('CAPABILITY_MATERIAL_MODE_INVALID');
  }
  function register() {
    var mesh = interop();
    if (!mesh || typeof mesh.registerCommandHandler !== 'function') {
      lastError = 'MINISTRY_INTEROPERABILITY_UNAVAILABLE';
      return false;
    }
    try {
      mesh.registerCommandHandler(COMMAND, 'resource', handle);
      handlerRegistered = true;
      lastError = null;
      return true;
    } catch (error) {
      lastError = String(error && error.message || error);
      handlerRegistered = lastError.indexOf('DUPLICATE') >= 0;
      return handlerRegistered;
    }
  }
  function init() { register(); return diagnostics(); }
  function diagnostics() {
    var mesh = interop();
    return {
      version: VERSION, ready: !!(handlerRegistered && mesh && typeof mesh.dispatchCommand === 'function'),
      registered: handlerRegistered, command: COMMAND, ownerMinistry: 'resource', error: lastError
    };
  }

  var api = Object.freeze({ VERSION: VERSION, COMMAND: COMMAND, init: init, register: register, handle: handle, diagnostics: diagnostics });
  g.OmegaHomePoliceTrainingMaterialsRuntime = api;
  if (g.document) {
    var start = function () { init(); };
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', start, { once: true });
    else Promise.resolve().then(start);
  } else init();
})(typeof window !== 'undefined' ? window : globalThis);
