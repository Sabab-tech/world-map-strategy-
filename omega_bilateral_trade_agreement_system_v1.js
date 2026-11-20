/* OMEGA BILATERAL TRADE AGREEMENT SYSTEM v1.0.0
 * Separate negotiated-trade channel beside Open Market.
 * Uses existing country state, ministry transactions, Global Market,
 * Global Trade, Foreign Affairs/Treaty and bounded country scheduler.
 * Unknown evidence remains unknown; no resource identity or market fact is invented.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  if (g.OmegaBilateralTradeAgreementV1 && g.OmegaBilateralTradeAgreementV1.VERSION === VERSION) return;

  var MAX_PRODUCTS = 128;
  var MAX_PROPOSALS = 128;
  var MAX_REVIEWS_PER_COUNTRY_TURN = 2;
  var MAX_CONTRACTS_PER_COUNTRY_TURN = 24;
  var MAX_REPORT_AGE_TURNS = 30;
  var DURATION_MONTHS = Object.freeze([12, 24, 60, 84, 120]);
  var processedTurns = new Set();
  var unregisterScheduler = null;
  var installed = { ready: false, registered: 0, total: 9, errors: [] };

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
  function num(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      var n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    if (value && typeof value === 'object') {
      var candidate = value.availableQuantity ?? value.remainingQuantity ?? value.quantity ?? value.value ?? value.amount;
      if (candidate !== value) return num(candidate);
    }
    return null;
  }
  function id(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
  function token(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function clamp(value, min, max) {
    var x = num(value);
    return x === null ? null : Math.max(min, Math.min(max, x));
  }
  function state() { return g.Game && g.Game.state ? g.Game.state : (g.gameState || {}); }
  function canonical(value) {
    var raw = value && typeof value === 'object'
      ? (value.iso3 || value.iso3Code || value.countryCode || value.countryId || value.code || value.id || value.name)
      : value;
    var direct = id(raw);
    if (/^[A-Z]{3}$/.test(direct)) return direct;
    var registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || g.Omega && g.Omega.CanonicalIdentity;
    try {
      var resolved = registry && typeof registry.resolveCountry === 'function' ? registry.resolveCountry(raw) : null;
      var source = resolved && resolved.raw && resolved.raw.raw || resolved && resolved.raw || resolved || {};
      var iso = source.iso3 || source.iso3Code || resolved && (resolved.iso3 || resolved.iso3Code);
      if (iso && /^[A-Z]{3}$/.test(id(iso))) return id(iso);
      if (resolved && /^[A-Z]{3}$/.test(id(resolved.id))) return id(resolved.id);
    } catch (_) {}
    return direct;
  }
  function turn() {
    var s = state();
    var value = num(s.simulation && s.simulation.turn);
    if (value === null) value = num(s.turn);
    if (value === null) value = num(s.simulationTurn);
    if (value === null) value = num(g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn);
    return value === null ? 0 : value;
  }
  function simulationDate() {
    var s = state(), clock = g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock;
    var raw = clock && (clock.simulationDate || clock.date) || s.simulation && (s.simulation.date || s.simulation.simulationDate);
    if (!raw) return null;
    var date = raw instanceof Date ? new Date(raw.getTime()) : new Date(String(raw));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  // OMEGA advances one calendar day per committed turn. stepDurationMs is wall-clock pacing, not game-time length.
  function turnDays() { return 1; }
  function monthsToTurns(months) {
    var start = simulationDate();
    if (!start) return Math.max(1, Math.ceil(months * 30));
    var startDay = start.getUTCDate();
    var targetMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    var lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
    targetMonth.setUTCDate(Math.min(startDay, lastDay));
    return Math.max(1, Math.ceil((targetMonth.getTime() - start.getTime()) / 86400000));
  }
  function intervalToTurns(days) { return Math.max(1, Math.ceil(days)); }
  function bucket(country, domain) {
    var root = state()[domain], cid = canonical(country);
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
    if (root[cid] && typeof root[cid] === 'object') return root[cid];
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) if (canonical(keys[i]) === cid) return root[keys[i]];
    return null;
  }
  function deep(root, path) {
    var parts = String(path || '').split('.');
    var cursor = root;
    for (var i = 0; i < parts.length; i++) {
      if (cursor == null || !Object.prototype.hasOwnProperty.call(Object(cursor), parts[i])) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }
  function mapEntry(map, key) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return { found: false, value: null };
    if (Object.prototype.hasOwnProperty.call(map, key)) return { found: true, value: map[key] };
    var wanted = token(key);
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) if (token(keys[i]) === wanted) return { found: true, value: map[keys[i]] };
    return { found: false, value: null };
  }
  function evidence(value, status, source, detail) {
    return { value: value === undefined ? null : value, status: status || 'UNKNOWN', source: source || null, detail: detail || null };
  }
  function hash(value) {
    var text = typeof value === 'string' ? value : JSON.stringify(value);
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function globalTrade() { return g.OmegaGlobalTrade || g.Omega && g.Omega.GlobalTrade || null; }
  function globalMarket() { return g.OmegaGlobalMarket || g.Omega && g.Omega.GlobalMarket || null; }
  function interop() { return g.Omega && g.Omega.MinistryInteroperability || g.OmegaMinistryInteroperability || null; }
  function countryIds() {
    var rows = [];
    try { rows = g.OmegaCanonicalIdentityRegistry && g.OmegaCanonicalIdentityRegistry.list
      ? g.OmegaCanonicalIdentityRegistry.list('COUNTRY') : []; } catch (_) {}
    if (!Array.isArray(rows)) rows = [];
    var ids = rows.map(canonical).filter(function (c) { return /^[A-Z]{3}$/.test(c); });
    if (!ids.length) {
      ['trade', 'resource', 'finance'].forEach(function (domain) {
        var root = state()[domain];
        if (root && typeof root === 'object') Object.keys(root).forEach(function (key) {
          var c = canonical(key);
          if (/^[A-Z]{3}$/.test(c)) ids.push(c);
        });
      });
    }
    return Array.from(new Set(ids)).sort();
  }
  function dispatch(owner, type, country, payload) {
    var mesh = interop(), cid = canonical(country);
    if (!mesh || typeof mesh.dispatchCommand !== 'function') return { status: 'UNAVAILABLE', reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    try {
      var correlation = payload && (payload.requestId || payload.proposalId || payload.agreementId || payload.snapshotId) || type + '-' + cid + '-' + turn();
      return mesh.dispatchCommand(owner, type, cid, clone(payload || {}), {
        turn: turn(), commandType: type, correlationId: String(correlation)
      });
    } catch (error) {
      return { status: 'FAILED', reason: String(error && error.message || error) };
    }
  }
  function unwrap(result) {
    if (result && result.status === 'APPLIED' && result.result) return result.result;
    return result;
  }
  function succeeded(result) {
    return !!result && (result.status === 'APPLIED' || result.accepted === true) &&
      !(result.result && result.result.accepted === false) && result.accepted !== false;
  }
  function tradeCurrency(country) {
    var trade = globalTrade();
    try { if (trade && typeof trade.currencyOf === 'function') return trade.currencyOf(canonical(country)); } catch (_) {}
    var finance = bucket(country, 'finance') || {};
    var code = finance.currencyCode || finance.settlementCurrency || deep(bucket(country, 'trade') || {}, 'settlementCurrency');
    return code ? id(code) : null;
  }
  function relationFor(a, b) {
    var aa = bucket(a, 'foreign') || {}, bb = bucket(b, 'foreign') || {};
    var first = mapEntry(aa.relations, canonical(b));
    var relation = first.found ? clone(first.value) : clone(mapEntry(bb.relations, canonical(a)).value);
    if (!relation || typeof relation !== 'object') return null;
    var adjustment = mapEntry(aa.relationAdjustments, canonical(b));
    var adjustments = adjustment.found && Array.isArray(adjustment.value) ? adjustment.value : [];
    var delta = adjustments.reduce(function (sum, row) { return sum + (num(row && row.delta) || 0); }, 0);
    if (delta) ['overall', 'trade', 'trust', 'political'].forEach(function (key) {
      var value = num(relation[key]);
      if (value !== null) relation[key] = clamp(value + delta, 0, 100);
    });
    return relation;
  }
  function relationScore(relation) {
    var trade = globalTrade();
    try { if (trade && typeof trade.relationScore === 'function') return trade.relationScore(relation); } catch (_) {}
    if (!relation || typeof relation !== 'object') return null;
    if (relation.war_state === true || relation.sanctions === true) return 0;
    var values = [['overall', 0.35], ['trade', 0.35], ['trust', 0.2], ['political', 0.1]]
      .map(function (entry) {
        var value = num(relation[entry[0]]);
        if (value === null) return null;
        return [value > 1 ? value / 100 : value, entry[1]];
      }).filter(Boolean);
    if (!values.length) return null;
    var weight = values.reduce(function (sum, row) { return sum + row[1]; }, 0);
    return clamp(values.reduce(function (sum, row) { return sum + row[0] * row[1]; }, 0) / weight, 0, 1);
  }
  function getProductDemand(country, resourceId) {
    var resource = bucket(country, 'resource') || {};
    var runtime = resource.demandRuntime || {};
    var found = mapEntry(runtime.byResource, resourceId);
    if (found.found && found.value && typeof found.value === 'object') return found.value;
    if (Array.isArray(runtime.resources)) {
      var row = runtime.resources.find(function (item) { return token(item && (item.resourceId || item.id)) === token(resourceId); });
      if (row) return row;
    }
    return null;
  }
  function readProduct(country, product) {
    var resourceId = String(product && (product.id || product.productId) || '').trim();
    var resource = bucket(country, 'resource') || {};
    var inventory = resource.inventory || {};
    var processed = resource.processedWarehouse || {};
    var inventoryValue = mapEntry(inventory, resourceId);
    var processedValue = mapEntry(processed.availableByResource || {}, resourceId);
    var stock = inventoryValue.found ? num(inventoryValue.value) : processedValue.found ? num(processedValue.value) : null;
    var stockSource = inventoryValue.found ? 'resource.inventory' : processedValue.found ? 'resource.processedWarehouse.availableByResource' : null;
    var reserveMap = resource.reserves || resource.strategicReserve && resource.strategicReserve.availableByResource || null;
    var reserveValue = mapEntry(reserveMap, resourceId);
    var reserve = reserveValue.found ? num(reserveValue.value) : reserveMap && typeof reserveMap === 'object' ? 0 : null;
    var reserveSource = reserveValue.found ? 'resource.reserves' : reserve !== null ? 'explicit reserve map; product key absent' : null;
    var productionEntry = mapEntry(resource.production || {}, resourceId);
    var production = productionEntry.found ? num(productionEntry.value) : null;
    var demand = getProductDemand(country, resourceId);
    var demandPerDay = num(demand && (demand.consumerDemandPerDay ?? demand.demandPerDay ?? demand.demand));
    var unmetDemand = num(demand && demand.unmetDemand);
    var pendingImport = num(demand && demand.pendingImportQuantity);
    var coverageDays = num(demand && (demand.stockCoverageDays ?? demand.stockCoverageTurns));
    var quote = null, marketPrice = null, priceStatus = 'UNKNOWN', priceSource = null;
    var market = globalMarket();
    try {
      if (market && typeof market.quote === 'function') quote = market.quote(resourceId);
      if (market && typeof market.localPrice === 'function') marketPrice = num(market.localPrice(country, resourceId));
    } catch (_) {}
    if (quote && String(quote.status || '').toUpperCase() === 'CLEARED' && marketPrice !== null) {
      priceStatus = 'KNOWN';
      priceSource = 'OMEGA_GLOBAL_MARKET_CLEARED_QUOTE';
    } else if (marketPrice !== null || quote && num(quote.referencePrice) !== null) {
      priceStatus = 'ESTIMATED';
      priceSource = 'OMEGA_GLOBAL_MARKET_REFERENCE_ONLY';
    }
    return {
      resourceId: resourceId,
      name: String(product && (product.name || product.label) || resourceId),
      productType: String(product && product.productType || 'UNCLASSIFIED'),
      unit: product && product.unit || null,
      stock: evidence(stock, stock === null ? 'UNKNOWN' : 'KNOWN', stockSource),
      reserve: evidence(reserve, reserve === null ? 'UNKNOWN' : 'KNOWN', reserveSource),
      production: evidence(production, production === null ? 'UNKNOWN' : 'KNOWN', productionEntry.found ? 'resource.production' : null),
      demandPerDay: evidence(demandPerDay, demandPerDay === null ? 'UNKNOWN' : 'KNOWN', demand ? 'resource.demandRuntime.byResource' : null),
      unmetDemand: evidence(unmetDemand, unmetDemand === null ? 'UNKNOWN' : 'KNOWN', demand ? 'resource.demandRuntime.byResource.unmetDemand' : null),
      pendingImportQuantity: evidence(pendingImport, pendingImport === null ? 'UNKNOWN' : 'KNOWN', demand ? 'resource.demandRuntime.byResource.pendingImportQuantity' : null),
      stockCoverageDays: evidence(coverageDays, coverageDays === null ? 'UNKNOWN' : 'KNOWN', demand ? 'resource.demandRuntime.byResource.stockCoverageDays' : null),
      exportableStock: evidence(stock === null || reserve === null ? null : Math.max(0, stock - reserve),
        stock === null || reserve === null ? 'UNKNOWN' : 'KNOWN', stockSource && reserveSource ? stockSource + ' minus ' + reserveSource : null),
      expectedPrice: evidence(marketPrice, priceStatus, priceSource, quote && quote.status || null),
      marketQuoteStatus: quote && quote.status || 'UNKNOWN',
      demandEvidenceStatus: demand ? 'OBSERVED' : 'UNKNOWN'
    };
  }
  function productCatalog() {
    var market = globalMarket(), rows = [];
    try { rows = market && typeof market.productCatalog === 'function' ? market.productCatalog() : []; } catch (_) {}
    if (!Array.isArray(rows)) return [];
    return rows.filter(function (row) {
      return row && typeof row === 'object' && row.id && ['RAW_RESOURCE', 'FACTORY_PRODUCT'].includes(String(row.productType || '').toUpperCase());
    }).slice(0, MAX_PRODUCTS).map(function (row) { return clone(row); });
  }
  function readFinance(country) {
    var finance = bucket(country, 'finance') || {};
    var available = num(finance.available);
    var reserves = num(finance.reserves);
    return {
      available: evidence(available, available === null ? 'UNKNOWN' : 'KNOWN', available === null ? null : 'finance.available'),
      reserves: evidence(reserves, reserves === null ? 'UNKNOWN' : 'KNOWN', reserves === null ? null : 'finance.reserves'),
      currency: evidence(tradeCurrency(country), tradeCurrency(country) ? 'KNOWN' : 'UNKNOWN', tradeCurrency(country) ? 'finance.currencyCode / GlobalTrade.currencyOf' : null)
    };
  }
  function requestIdList(country) {
    var trade = bucket(country, 'trade') || {};
    return Array.isArray(trade.importRequests) ? trade.importRequests : [];
  }
  function contractList(country) {
    var trade = bucket(country, 'trade') || {};
    return Array.isArray(trade.bilateralContracts) ? trade.bilateralContracts : [];
  }
  function sourceFingerprint(country, partner, productIds) {
    var products = productIds.map(function (rid) {
      var row = readProduct(country, { id: rid });
      return [rid, row.stock.value, row.reserve.value, row.production.value, row.demandPerDay.value,
        row.unmetDemand.value, row.pendingImportQuantity.value, row.expectedPrice.value, row.marketQuoteStatus];
    });
    var foreign = bucket(country, 'foreign') || {};
    var relations = mapEntry(foreign.relations, partner).value || null;
    var treaties = mapEntry(foreign.treaties, partner).value || null;
    var relationAdjustments = mapEntry(foreign.relationAdjustments, partner).value || null;
    var finance = readFinance(country);
    var tradeBucket = bucket(country, 'trade') || {};
    var requests = requestIdList(country).slice(-MAX_PROPOSALS).map(function (row) {
      return [row.requestId, row.resourceId, row.quantity, row.status, row.stage, row.targetCountryId];
    });
    var contracts = contractList(country)
      .map(function (row) { return [row.agreementId, canonical(row.partnerCountryId), row.status,
        row.quantityPerDelivery, row.nextDeliveryTurn, row.deliveredQuantity, row.currentRequestId]; });
    return hash({ products: products, relations: relations, treaties: treaties, relationAdjustments: relationAdjustments, finance: finance,
      requests: requests, contracts: contracts, tradePolicy: tradeBucket.policy || tradeBucket.tradePolicy || null });
  }
  function alternativeMarketReport(player, target, products, importNeeds, exportSurpluses) {
    var market = globalMarket(), output = { suppliersForImports: [], competingBuyersForExports: [] };
    if (!market) return { status: 'UNKNOWN', reason: 'GLOBAL_MARKET_RUNTIME_UNAVAILABLE', suppliersForImports: [], competingBuyersForExports: [] };
    importNeeds.slice(0, 8).forEach(function (need) {
      var rid = need.resourceId, quantity = num(need.unmetDemand.value) || num(need.demandPerDay.value) || 0, suppliers = [];
      try { suppliers = typeof market.suppliers === 'function' ? market.suppliers(rid, quantity, target) : []; } catch (_) {}
      var rows = (Array.isArray(suppliers) ? suppliers : []).filter(function (row) {
        return row && canonical(row.countryId) !== canonical(player) && canonical(row.countryId) !== canonical(target);
      }).map(function (row) {
        var price = null;
        try { price = typeof market.localPrice === 'function' ? num(market.localPrice(row.countryId, rid)) : null; } catch (_) {}
        return { countryId: canonical(row.countryId), availableQuantity: num(row.available),
          expectedUnitPrice: price, currency: tradeCurrency(row.countryId),
          priceStatus: price === null ? 'UNKNOWN' : row.marketQuote && row.marketQuote.status === 'CLEARED' ? 'KNOWN' : 'ESTIMATED',
          relationshipObserved: row.relationObserved === true };
      }).sort(function (a, b) {
        if (a.expectedUnitPrice === null) return 1;
        if (b.expectedUnitPrice === null) return -1;
        return a.expectedUnitPrice - b.expectedUnitPrice;
      }).slice(0, 5);
      output.suppliersForImports.push({ resourceId: rid, requestedQuantity: quantity, status: rows.length ? 'OBSERVED' : 'UNKNOWN', alternatives: rows });
    });
    var ids = countryIds();
    exportSurpluses.slice(0, 8).forEach(function (surplus) {
      var rid = surplus.resourceId, candidates = [];
      ids.forEach(function (countryId) {
        if (countryId === canonical(player) || countryId === canonical(target)) return;
        var demand = getProductDemand(countryId, rid), unmet = num(demand && demand.unmetDemand),
          daily = num(demand && (demand.consumerDemandPerDay ?? demand.demandPerDay ?? demand.demand));
        if (unmet !== null && unmet <= 0 && (daily === null || daily <= 0)) return;
        var pending = requestIdList(countryId).filter(function (row) {
          return canonical(row.targetCountryId || row.sellerCountryId) === canonical(target) &&
            token(row.resourceId) === token(rid) && ['SENT','COUNTER_OFFERED','ACCEPTED','SETTLEMENT_PREPARING','PENDING_SETTLEMENT'].indexOf(id(row.status)) >= 0;
        });
        // Expose only a potential buyer country. Exact national demand and
        // pending bid terms are private commercial intelligence and stay inside
        // the country AI rather than its player-facing market report.
        candidates.push({ countryId: countryId, status: 'POTENTIAL_BUYER',
          demandEvidenceStatus: unmet === null && daily === null ? 'UNKNOWN' : 'NOT_DISCLOSED',
          competingBidDisclosure: 'PRIVATE' });
      });
      output.competingBuyersForExports.push({ resourceId: rid, status: candidates.length ? 'OBSERVED' : 'UNKNOWN', alternatives: candidates.slice(0, 8) });
    });
    return output;
  }
  function alternativeMarketSourceFingerprint(player, target, importNeeds, exportSurpluses) {
    var market = globalMarket(), suppliers = [], competingBuyerSources = [];
    importNeeds.slice(0, 8).forEach(function (need) {
      var rid = need.resourceId, quantity = num(need.unmetDemand.value) || num(need.demandPerDay.value) || 0, rows = [];
      try { rows = market && typeof market.suppliers === 'function' ? market.suppliers(rid, quantity, target) : []; } catch (_) {}
      var observed = (Array.isArray(rows) ? rows : []).filter(function (row) {
        return row && canonical(row.countryId) !== canonical(player) && canonical(row.countryId) !== canonical(target);
      }).map(function (row) {
        var price = null;
        try { price = market && typeof market.localPrice === 'function' ? num(market.localPrice(row.countryId, rid)) : null; } catch (_) {}
        return [canonical(row.countryId), num(row.available), price, row.marketQuote && row.marketQuote.status || null,
          row.relationObserved === true];
      }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
      suppliers.push([rid, quantity, observed]);
    });
    var ids = countryIds();
    exportSurpluses.slice(0, 8).forEach(function (surplus) {
      var rid = surplus.resourceId;
      ids.forEach(function (countryId) {
        if (countryId === canonical(player) || countryId === canonical(target)) return;
        var demand = getProductDemand(countryId, rid);
        var unmet = num(demand && demand.unmetDemand);
        var daily = num(demand && (demand.consumerDemandPerDay ?? demand.demandPerDay ?? demand.demand));
        var requests = requestIdList(countryId).filter(function (row) {
          return canonical(row.targetCountryId || row.sellerCountryId) === canonical(target) &&
            token(row.resourceId) === token(rid) &&
            ['SENT','COUNTER_OFFERED','ACCEPTED','SETTLEMENT_PREPARING','PENDING_SETTLEMENT'].indexOf(id(row.status)) >= 0;
        }).map(function (row) {
          return [row.requestId || null, num(row.quantity), num(row.unitPrice), id(row.status), num(row.createdTurn)];
        }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
        if (unmet !== null && unmet <= 0 && (daily === null || daily <= 0) && !requests.length) return;
        // This digest captures private demand and offer changes without
        // returning those values or individual bids in the player-facing report.
        competingBuyerSources.push([rid, countryId, unmet, daily, requests]);
      });
    });
    return hash({ suppliers: suppliers, competingBuyerSources: competingBuyerSources });
  }

  function buildReport(playerCountry, targetCountry) {
    var player = canonical(playerCountry), target = canonical(targetCountry), catalog = productCatalog();
    if (!player || !target || player === target) return { accepted: false, reason: 'BILATERAL_MARKET_SCOPE_INVALID' };
    if (!catalog.length) return { accepted: false, reason: 'CANONICAL_MARKET_PRODUCT_CATALOG_UNAVAILABLE' };
    var rows = catalog.map(function (product) {
      var row = readProduct(target, product);
      var commitments = activeContractCommitment(target, row.resourceId, intervalToTurns(30));
      var accepted = totalAcceptedTradeRequests(target, row.resourceId);
      var demandPerDay = row.demandPerDay.status === 'KNOWN' ? row.demandPerDay.value : null;
      var stock = row.stock.value, reserve = row.reserve.value;
      var exportable = stock === null || reserve === null || demandPerDay === null ? null :
        Math.max(0, stock - reserve - commitments - accepted.quantity - demandPerDay * 30);
      row.contractCommitment = evidence(commitments, 'KNOWN', 'trade.bilateralContracts');
      row.acceptedPendingRequests = evidence(accepted.quantity, 'KNOWN', 'trade.importRequests');
      row.exportableStock = evidence(exportable, exportable === null ? 'UNKNOWN' : 'KNOWN',
        exportable === null ? null : 'inventory minus reserve, domestic 30-day demand, accepted requests and due agreements');
      return row;
    });
    var foreign = bucket(target, 'foreign') || {};
    var relation = mapEntry(foreign.relations, player).value || mapEntry((bucket(player, 'foreign') || {}).relations, target).value || null;
    var treaty = mapEntry(foreign.treaties, player).value || null;
    var targetAgreements = contractList(target);
    var agreements = targetAgreements.filter(function (row) { return canonical(row.partnerCountryId) === player; });
    var imports = requestIdList(target).filter(function (row) {
      return ['SENT', 'COUNTER_OFFERED', 'ACCEPTED', 'SETTLEMENT_PREPARING', 'PENDING_SETTLEMENT'].includes(id(row.status));
    });
    var needs = rows.filter(function (row) { return row.unmetDemand.status === 'KNOWN' && row.unmetDemand.value > 0; })
      .sort(function (a, b) { return b.unmetDemand.value - a.unmetDemand.value; }).slice(0, 12);
    var surpluses = rows.filter(function (row) { return row.exportableStock.status === 'KNOWN' && row.exportableStock.value > 0; })
      .sort(function (a, b) { return b.exportableStock.value - a.exportableStock.value; }).slice(0, 12);
    var alternatives = alternativeMarketReport(player, target, rows, needs, surpluses);
    var alternativesVersion = alternativeMarketSourceFingerprint(player, target, needs, surpluses);
    var counts = { known: 0, estimated: 0, unknown: 0 };
    rows.forEach(function (row) {
      [row.stock, row.reserve, row.production, row.demandPerDay, row.unmetDemand, row.expectedPrice].forEach(function (item) {
        counts[String(item.status || 'UNKNOWN').toLowerCase()] = (counts[String(item.status || 'UNKNOWN').toLowerCase()] || 0) + 1;
      });
    });
    var generated = turn();
    var syncedAt = new Date();
    var simulatedAt = simulationDate();
    var sourceVersion = sourceFingerprint(target, player, rows.map(function (r) { return r.resourceId; }));
    var dataVersion = hash([VERSION, sourceVersion, alternativesVersion]);
    var report = {
      schemaVersion: VERSION,
      dataVersion: dataVersion,
      snapshotId: 'BILAT-MKT-' + player + '-' + target + '-' + generated + '-' + hash(rows.map(function (r) { return [r.resourceId, r.stock.value, r.unmetDemand.value, r.expectedPrice.value]; })),
      playerCountryId: player,
      targetCountryId: target,
      generatedAt: syncedAt.toISOString(),
      simulationDate: simulatedAt ? simulatedAt.toISOString() : null,
      generatedTurn: generated,
      maxAgeTurns: MAX_REPORT_AGE_TURNS,
      freshnessStatus: 'CURRENT',
      currency: readFinance(target).currency,
      // Treasury balances are private. The counterpart receives an explicit
      // disclosure state; the negotiating AI still evaluates the exact value
      // internally through readFinance()/reservedBuyerCurrency().
      availableForeignCurrency: evidence(null, 'UNKNOWN', null, 'COUNTERPARTY_TREASURY_NOT_PUBLIC'),
      paymentCapacity: evidence('NOT_DISCLOSED', 'UNKNOWN', null, 'Counterparty Treasury balances are not public intelligence'),
      relationship: evidence(relation ? relationScore(relation) : null, relation ? 'KNOWN' : 'UNKNOWN', relation ? 'foreign.relations' : null),
      diplomaticStatus: evidence(relation ? { war: relation.war_state === true, sanctions: relation.sanctions === true,
        tradeAgreement: relation.trade_agreement === true } : null, relation ? 'KNOWN' : 'UNKNOWN', relation ? 'foreign.relations' : null),
      existingTreaty: evidence(treaty ? { status: treaty.status || treaty.stage || 'UNKNOWN', treatyType: treaty.treatyType || null } : null,
        treaty ? 'KNOWN' : 'UNKNOWN', treaty ? 'foreign.treaties' : null),
      activeBilateralAgreementCount: targetAgreements.filter(function (row) { return id(row.status) === 'ACTIVE'; }).length,
      agreementsWithPlayerCount: agreements.filter(function (row) { return id(row.status) === 'ACTIVE'; }).length,
      pendingImportRequestCount: imports.length,
      catalogProductCount: rows.length,
      evidenceCounts: counts,
      importNeeds: needs,
      exportSurpluses: surpluses,
      products: rows,
      alternativeMarkets: alternatives,
      productIds: rows.map(function (row) { return row.resourceId; }),
      sourceFingerprint: sourceFingerprint(target, player, rows.map(function (row) { return row.resourceId; })),
      alternativeMarketFingerprint: alternativesVersion
    };
    return { accepted: true, report: report };
  }
  function currentReport(playerCountry, targetCountry, verifyAlternatives) {
    var player = canonical(playerCountry), target = canonical(targetCountry);
    var stored = mapEntry((bucket(player, 'trade') || {}).bilateralMarketIntelligence || {}, target);
    if (!stored.found || !stored.value) return { status: 'NOT_SYNCED', report: null, reason: 'MARKET_INTELLIGENCE_SYNC_REQUIRED' };
    var report = clone(stored.value);
    var age = turn() - num(report.generatedTurn);
    var fingerprint = sourceFingerprint(target, player, Array.isArray(report.productIds) ? report.productIds : []);
    var alternativeFingerprint = null;
    if (verifyAlternatives === true) {
      alternativeFingerprint = alternativeMarketSourceFingerprint(player, target,
        report.importNeeds || [], report.exportSurpluses || []);
    }
    var stale = age > (num(report.maxAgeTurns) || MAX_REPORT_AGE_TURNS) || fingerprint !== report.sourceFingerprint ||
      verifyAlternatives === true && alternativeFingerprint !== report.alternativeMarketFingerprint;
    report.ageTurns = age;
    report.freshnessStatus = stale ? 'STALE' : 'CURRENT';
    report.staleReason = stale ? (age > (num(report.maxAgeTurns) || MAX_REPORT_AGE_TURNS) ? 'MAX_REPORT_AGE_EXCEEDED' : fingerprint !== report.sourceFingerprint ? 'SOURCE_DATA_CHANGED' : 'ALTERNATIVE_MARKET_DATA_CHANGED') : null;
    return { status: report.freshnessStatus, report: report, reason: report.staleReason };
  }
  function syncMarket(playerCountry, targetCountry) {
    var player = canonical(playerCountry), target = canonical(targetCountry);
    if (!player || !target || player === target) return { accepted: false, reason: 'BILATERAL_MARKET_SCOPE_INVALID' };
    var raw = dispatch('trade', 'OMEGA_BILATERAL_SYNC_MARKET', player, { targetCountryId: target, requestedTurn: turn() });
    return unwrap(raw);
  }
  function getMarketReport(playerCountry, targetCountry) {
    return currentReport(playerCountry, targetCountry);
  }
  function recordArray(root, key) { return Array.isArray(root && root[key]) ? clone(root[key]) : []; }
  function totalAcceptedTradeRequests(sellerCountry, resourceId) {
    var total = 0, count = 0;
    var ids = countryIds();
    ids.forEach(function (buyer) {
      requestIdList(buyer).forEach(function (row) {
        if (canonical(row && (row.targetCountryId || row.sellerCountryId)) !== canonical(sellerCountry) ||
            token(row && row.resourceId) !== token(resourceId) ||
            !['SENT', 'COUNTER_OFFERED', 'ACCEPTED', 'SETTLEMENT_PREPARING', 'PENDING_SETTLEMENT', 'IN_TRANSIT'].includes(id(row && row.status))) return;
        total += Math.max(0, num(row.quantity) || 0);
        count++;
      });
    });
    return { quantity: total, count: count };
  }
  function activeContractCommitment(sellerCountry, resourceId, intervalTurns) {
    return contractList(sellerCountry).filter(function (row) {
      return canonical(row.sellerCountryId) === canonical(sellerCountry) &&
        token(row.resourceId) === token(resourceId) && id(row.status) === 'ACTIVE' &&
        num(row.nextDeliveryTurn) !== null && row.nextDeliveryTurn <= turn() + intervalTurns &&
        !row.currentRequestId;
    }).reduce(function (sum, row) { return sum + Math.max(0, num(row.quantityPerDelivery) || 0); }, 0);
  }
  function marketPriceFor(sellerCountry, resourceId) {
    var product = readProduct(sellerCountry, { id: resourceId });
    return product.expectedPrice && product.expectedPrice.status === 'KNOWN' ? num(product.expectedPrice.value) : null;
  }
  function settlementValues(buyer, seller, quantity, unitPrice) {
    var trade = globalTrade();
    try {
      if (trade && typeof trade.settlementValues === 'function') return trade.settlementValues(buyer, seller, quantity, unitPrice);
    } catch (_) {}
    if (tradeCurrency(buyer) && tradeCurrency(buyer) === tradeCurrency(seller)) {
      var value = num(quantity) * num(unitPrice);
      return { buyerValue: value, sellerValue: value, fx: 1, buyerCurrency: tradeCurrency(buyer), sellerCurrency: tradeCurrency(seller) };
    }
    return { buyerValue: null, sellerValue: null, fx: null, reason: 'FX_SETTLEMENT_EVIDENCE_UNAVAILABLE' };
  }
  function reservedBuyerCurrency(buyerCountry, intervalTurns) {
    var buyer = canonical(buyerCountry), total = 0, requestCount = 0, agreementCount = 0, unknownReasons = [], requestIds = new Set();
    var pendingStatuses = ['SENT', 'COUNTER_OFFERED', 'ACCEPTED', 'SETTLEMENT_PREPARING', 'PENDING_SETTLEMENT', 'IN_TRANSIT'];
    requestIdList(buyer).forEach(function (request) {
      if (!request || !pendingStatuses.includes(id(request.status))) return;
      var requestId = String(request.requestId || '');
      if (requestId) requestIds.add(requestId);
      var seller = canonical(request.targetCountryId || request.sellerCountryId), quantity = num(request.quantityApproved ?? request.quantity),
        price = num(request.unitPrice ?? (request.lastCounterpartyDecision && request.lastCounterpartyDecision.unitPrice));
      if (!seller || quantity === null || price === null) { unknownReasons.push('PENDING_IMPORT_REQUEST_TERMS_UNKNOWN'); return; }
      var values = settlementValues(buyer, seller, quantity, price), amount = num(values && values.buyerValue);
      if (amount === null) unknownReasons.push('PENDING_IMPORT_REQUEST_FX_UNKNOWN');
      else { total += amount; requestCount++; }
    });
    contractList(buyer).forEach(function (contract) {
      if (!contract || id(contract.role) !== 'BUYER' || !['ACTIVE', 'AT_RISK'].includes(id(contract.status)) ||
          num(contract.nextDeliveryTurn) === null ||
          num(contract.nextDeliveryTurn) > turn() + Math.max(1, num(intervalTurns) || 1)) return;
      if (contract.currentRequestId) {
        if (!requestIds.has(String(contract.currentRequestId))) unknownReasons.push('BILATERAL_CURRENT_DELIVERY_REQUEST_MISSING');
        return;
      }
      var seller = canonical(contract.sellerCountryId || contract.partnerCountryId);
      if (!seller || !contract.resourceId) { unknownReasons.push('BILATERAL_BUYER_CONTRACT_TERMS_UNKNOWN'); return; }
      var price = num(contract.unitPrice);
      if (id(contract.priceModel || 'FIXED') === 'MARKET_LINKED') {
        var marketPrice = readProduct(seller, { id: contract.resourceId }).expectedPrice;
        price = marketPrice && marketPrice.status === 'KNOWN' && num(marketPrice.value) !== null
          ? num(marketPrice.value) * (1 + (num(contract.marketAdjustmentPct) || 0) / 100) : null;
      }
      var quantity = num(contract.quantityPerDelivery);
      if (quantity === null || price === null) { unknownReasons.push('BILATERAL_BUYER_CONTRACT_FX_UNKNOWN'); return; }
      var values = settlementValues(buyer, seller, quantity, price), amount = num(values && values.buyerValue);
      if (amount === null) unknownReasons.push('BILATERAL_BUYER_CONTRACT_FX_UNKNOWN');
      else { total += amount; agreementCount++; }
    });
    return { status: unknownReasons.length ? 'UNKNOWN' : 'KNOWN', amount: unknownReasons.length ? null : total,
      requestCount: requestCount, agreementCount: agreementCount, reasons: unknownReasons };
  }

  function previewProposal(playerCountry, payload) {
    var player = canonical(playerCountry), p = payload || {}, target = canonical(p.targetCountryId);
    var direction = id(p.direction || 'IMPORT');
    var resourceId = String(p.resourceId || '').trim();
    var quantity = num(p.quantityPerDelivery ?? p.quantity);
    var unitPrice = num(p.unitPrice);
    var durationMonths = num(p.durationMonths);
    var intervalDays = num(p.intervalDays ?? 30);
    if (!player || !target || player === target || !resourceId || !['IMPORT', 'EXPORT'].includes(direction))
      return { status: 'INVALID', canSend: false, reason: 'PROPOSAL_IDENTITY_OR_DIRECTION_INVALID' };
    if (quantity === null || quantity <= 0 || unitPrice === null || unitPrice <= 0)
      return { status: 'INVALID', canSend: false, reason: 'QUANTITY_AND_UNIT_PRICE_MUST_BE_POSITIVE' };
    if (DURATION_MONTHS.indexOf(durationMonths) < 0)
      return { status: 'INVALID', canSend: false, reason: 'UNSUPPORTED_AGREEMENT_DURATION' };
    if (intervalDays === null || intervalDays < 1 || intervalDays > 365)
      return { status: 'INVALID', canSend: false, reason: 'DELIVERY_INTERVAL_OUT_OF_RANGE' };
    var paymentSchedule = id(p.paymentSchedule || 'PER_DELIVERY_ON_SETTLEMENT');
    if (paymentSchedule !== 'PER_DELIVERY_ON_SETTLEMENT')
      return { status: 'INVALID', canSend: false, reason: 'UNSUPPORTED_PAYMENT_SCHEDULE' };
    if (!['FIXED', 'MARKET_LINKED'].includes(id(p.priceModel || 'FIXED')))
      return { status: 'INVALID', canSend: false, reason: 'UNSUPPORTED_AGREEMENT_PRICE_MODEL' };
    var snapshot = currentReport(player, target, true);
    if (snapshot.status !== 'CURRENT') return { status: snapshot.status, canSend: false, reason: snapshot.reason };
    var seller = direction === 'EXPORT' ? player : target;
    var buyer = direction === 'IMPORT' ? player : target;
    var intervalTurns = intervalToTurns(intervalDays);
    var supply = readProduct(seller, { id: resourceId });
    var finance = readFinance(buyer);
    var commitments = activeContractCommitment(seller, resourceId, intervalTurns);
    var accepted = totalAcceptedTradeRequests(seller, resourceId);
    var domesticDaily = supply.demandPerDay.status === 'KNOWN' ? supply.demandPerDay.value : null;
    var domesticBuffer = domesticDaily === null ? null : domesticDaily * intervalDays;
    var stock = supply.stock.value, reserve = supply.reserve.value;
    var exportable = stock === null || reserve === null || domesticBuffer === null
      ? null : Math.max(0, stock - reserve - commitments - accepted.quantity - domesticBuffer);
    var quotePrice = marketPriceFor(seller, resourceId);
    var priceModel = id(p.priceModel || 'FIXED');
    var marketAdjustmentPct = clamp(p.marketAdjustmentPct ?? 0, -50, 100);
    var clearedPrice = supply.expectedPrice.status === 'KNOWN' ? supply.expectedPrice.value : null;
    var priceForAgreement = priceModel === 'MARKET_LINKED' && clearedPrice !== null
      ? clearedPrice * (1 + (marketAdjustmentPct || 0) / 100) : unitPrice;
    var values = settlementValues(buyer, seller, quantity, priceForAgreement);
    var buyerAmount = num(values && values.buyerValue);
    var currencyCommitments = reservedBuyerCurrency(buyer, intervalTurns);
    var grossAvailableMoney = finance.available.value;
    var availableMoney = grossAvailableMoney === null || currencyCommitments.status !== 'KNOWN' ? null :
      Math.max(0, grossAvailableMoney - currencyCommitments.amount);
    var issues = [];
    if (stock === null) issues.push('SELLER_STOCK_UNKNOWN');
    if (reserve === null) issues.push('SELLER_RESERVE_UNKNOWN');
    if (domesticBuffer === null) issues.push('DOMESTIC_DEMAND_UNKNOWN');
    if (finance.available.status !== 'KNOWN') issues.push('BUYER_AVAILABLE_FOREIGN_CURRENCY_UNKNOWN');
    if (currencyCommitments.status !== 'KNOWN') issues.push('BUYER_FOREIGN_CURRENCY_COMMITMENTS_UNKNOWN');
    if (buyerAmount === null) issues.push('FX_SETTLEMENT_VALUE_UNKNOWN');
    if (quotePrice === null) issues.push('MARKET_PRICE_UNKNOWN');
    if (priceModel === 'MARKET_LINKED' && clearedPrice === null) issues.push('MARKET_LINKED_PRICE_NOT_CLEARED');
    var supplyOK = exportable !== null && exportable + 1e-8 >= quantity;
    var fundsOK = buyerAmount !== null && availableMoney !== null && availableMoney + 1e-8 >= buyerAmount;
    var hardUnknown = stock === null || reserve === null || finance.available.status !== 'KNOWN' || currencyCommitments.status !== 'KNOWN' ||
      buyerAmount === null || priceModel === 'MARKET_LINKED' && clearedPrice === null;
    var status = hardUnknown || domesticBuffer === null ? 'CONDITIONAL' : supplyOK && fundsOK ? 'FEASIBLE' : 'INFEASIBLE';
    var canSend = status === 'FEASIBLE' || status === 'CONDITIONAL' && p.acceptUnknownRisk === true && supplyOK && fundsOK;
    return {
      status: status, canSend: canSend, reason: status === 'FEASIBLE' ? 'CURRENT_STOCK_AND_PAYMENT_CAPACITY_OBSERVED' :
        status === 'INFEASIBLE' ? (!supplyOK ? 'EXPORTABLE_SUPPLY_INSUFFICIENT' : 'BUYER_FOREIGN_CURRENCY_INSUFFICIENT') : 'SOME_REQUIRED_EVIDENCE_UNKNOWN',
      direction: direction, buyerCountryId: buyer, sellerCountryId: seller, targetCountryId: target,
      resourceId: resourceId, quantityPerDelivery: quantity, unitPrice: priceForAgreement,
      priceModel: priceModel, marketAdjustmentPct: marketAdjustmentPct,
      indicativeUnitPrice: unitPrice, priceCurrency: tradeCurrency(seller), expectedMarketPrice: quotePrice,
      sellerStock: stock, sellerReserve: reserve, commitments: commitments, acceptedPendingRequests: accepted.quantity,
      domesticRequirementPerInterval: domesticBuffer, exportableSupply: exportable,
      // Exact buyer liquidity is shown only to the buyer country itself. A
      // seller receives feasibility and an outcome, never the buyer Treasury.
      buyerAvailableForeignCurrency: buyer === player ? availableMoney : null,
      buyerGrossAvailableForeignCurrency: buyer === player ? grossAvailableMoney : null,
      buyerReservedForeignCurrency: buyer === player ? currencyCommitments.amount : null,
      buyerCurrencyCommitments: buyer === player ? currencyCommitments : {
        status: 'PRIVATE', amount: null, requestCount: null, agreementCount: null, reasons: []
      },
      buyerCurrency: tradeCurrency(buyer), buyerSettlementAmount: buyerAmount,
      invoiceCurrency: tradeCurrency(seller), paymentCurrency: tradeCurrency(buyer),
      paymentSchedule: paymentSchedule,
      fx: num(values && values.fx), durationMonths: durationMonths, durationTurns: monthsToTurns(durationMonths),
      intervalDays: intervalDays, intervalTurns: intervalTurns, quantityTolerancePct: clamp(p.quantityTolerancePct ?? 0, 0, 50),
      terminationPenaltyPct: clamp(p.terminationPenaltyPct ?? 0, 0, 100),
      relationshipPenaltyPoints: clamp(p.relationshipPenaltyPoints ?? 5, 0, 100), evidenceIssues: issues,
      marketSnapshotId: snapshot.report.snapshotId
    };
  }
  function proposalId(country, target, resourceId, input) {
    return 'BTP-' + canonical(country) + '-' + canonical(target) + '-' + turn() + '-' +
      hash([resourceId, input.direction, input.quantityPerDelivery, input.unitPrice, input.durationMonths, input.intervalDays]);
  }
  function createProposal(playerCountry, payload) {
    var player = canonical(playerCountry), p = clone(payload || {}), target = canonical(p.targetCountryId);
    var preview = previewProposal(player, p);
    if (!preview.canSend) return { accepted: false, reason: preview.reason, feasibility: preview };
    var pid = String(p.proposalId || proposalId(player, target, p.resourceId, p)).trim();
    var proposal = {
      schemaVersion: VERSION, proposalId: pid, requestorCountryId: player, targetCountryId: target,
      direction: preview.direction, buyerCountryId: preview.buyerCountryId, sellerCountryId: preview.sellerCountryId,
      resourceId: preview.resourceId, quantityPerDelivery: preview.quantityPerDelivery, unitPrice: preview.unitPrice,
      currency: preview.priceCurrency, invoiceCurrency: preview.invoiceCurrency,
      paymentCurrency: preview.paymentCurrency, paymentSchedule: preview.paymentSchedule,
      priceModel: preview.priceModel, marketAdjustmentPct: preview.marketAdjustmentPct,
      durationMonths: preview.durationMonths, durationTurns: preview.durationTurns,
      intervalDays: preview.intervalDays, intervalTurns: preview.intervalTurns,
      quantityTolerancePct: preview.quantityTolerancePct, terminationPenaltyPct: preview.terminationPenaltyPct,
      relationshipPenaltyPoints: preview.relationshipPenaltyPoints,
      previousAgreementId: String(p.previousAgreementId || '') || null,
      createdTurn: turn(), status: 'SENT', stage: 'OPEN', feasibility: clone(preview),
      marketSnapshotId: preview.marketSnapshotId, decision: null, counterTerms: null
    };
    var created = unwrap(dispatch('trade', 'OMEGA_BILATERAL_CREATE_PROPOSAL', player, { proposal: proposal }));
    if (!created || created.accepted !== true) return { accepted: false, reason: created && created.reason || 'PROPOSAL_PERSISTENCE_FAILED', detail: created };
    var received = unwrap(dispatch('trade', 'OMEGA_BILATERAL_RECEIVE_PROPOSAL', target, { proposal: proposal }));
    if (!received || received.accepted !== true) {
      return { accepted: false, partial: true, reason: received && received.reason || 'COUNTERPARTY_INBOX_WRITE_FAILED',
        proposal: proposal, senderPersisted: true };
    }
    emit('OMEGA_BILATERAL_TRADE_PROPOSAL_SENT', player, { proposalId: pid, targetCountryId: target, direction: proposal.direction });
    return { accepted: true, status: 'SENT', proposal: proposal, feasibility: preview };
  }
  function evaluateProposal(country, proposal) {
    var target = canonical(country), buyer = canonical(proposal.buyerCountryId), seller = canonical(proposal.sellerCountryId);
    var resourceId = String(proposal.resourceId || ''), quantity = num(proposal.quantityPerDelivery), price = num(proposal.unitPrice);
    var relation = relationFor(target, canonical(proposal.requestorCountryId));
    var rel = relationScore(relation);
    var result = { proposalId: proposal.proposalId, decision: 'WAITING_DATA', reason: null, confidence: 0.45,
      decisionFactors: {}, terms: null, evaluatedTurn: turn() };
    if (!target || !buyer || !seller || !resourceId || quantity === null || price === null) {
      result.reason = 'PROPOSAL_TERMS_INCOMPLETE'; return result;
    }
    if (relation && (relation.war_state === true || relation.sanctions === true)) {
      result.decision = 'REJECT'; result.reason = relation.war_state === true ? 'WAR_STATE_PROHIBITED' : 'SANCTIONS_PROHIBIT_TRADE';
      result.confidence = 1; return result;
    }
    var supplier = readProduct(seller, { id: resourceId });
    var buyerFinance = readFinance(buyer);
    var marketPrice = marketPriceFor(seller, resourceId);
    var obligations = activeContractCommitment(seller, resourceId, num(proposal.intervalTurns) || 1);
    var accepted = totalAcceptedTradeRequests(seller, resourceId);
    var dailyDemand = supplier.demandPerDay.status === 'KNOWN' ? supplier.demandPerDay.value : null;
    var domesticBuffer = dailyDemand === null ? null : dailyDemand * (num(proposal.intervalDays) || 30);
    var available = supplier.stock.value === null || supplier.reserve.value === null || domesticBuffer === null
      ? null : Math.max(0, supplier.stock.value - supplier.reserve.value - obligations - accepted.quantity - domesticBuffer);
    var settlement = settlementValues(buyer, seller, quantity, price);
    var buyerCost = num(settlement && settlement.buyerValue);
    var currencyCommitments = reservedBuyerCurrency(buyer, num(proposal.intervalTurns) || 1);
    var grossFunds = buyerFinance.available.value;
    var funds = grossFunds === null || currencyCommitments.status !== 'KNOWN' ? null : Math.max(0, grossFunds - currencyCommitments.amount);
    if (available === null || funds === null || buyerCost === null) {
      result.reason = available === null ? 'SELLER_EXPORTABLE_STOCK_OR_DOMESTIC_BUFFER_UNKNOWN' :
        funds === null ? currencyCommitments.status !== 'KNOWN' ? 'BUYER_FOREIGN_CURRENCY_COMMITMENTS_UNKNOWN' : 'BUYER_AVAILABLE_FOREIGN_CURRENCY_UNKNOWN' : 'CROSS_CURRENCY_SETTLEMENT_UNKNOWN';
      return result;
    }
    if (quantity <= 0 || price <= 0) { result.decision = 'REJECT'; result.reason = 'NON_POSITIVE_TRADE_TERMS'; return result; }
    var proposedQuantity = quantity, proposedPrice = price, adjustments = [];
    if (id(proposal.priceModel || 'FIXED') === 'MARKET_LINKED') {
      var linkedPriceEvidence = supplier.expectedPrice;
      if (!linkedPriceEvidence || linkedPriceEvidence.status !== 'KNOWN' || num(linkedPriceEvidence.value) === null)
        return Object.assign(result, { reason: 'MARKET_LINKED_PRICE_NOT_CLEARED' });
      proposedPrice = Number((num(linkedPriceEvidence.value) * (1 + (num(proposal.marketAdjustmentPct) || 0) / 100)).toFixed(8));
    }
    if (available + 1e-8 < proposedQuantity) {
      if (available <= 0) { result.decision = 'REJECT'; result.reason = 'NO_EXPORTABLE_STOCK_AFTER_DOMESTIC_AND_CONTRACT_COMMITMENTS'; return result; }
      proposedQuantity = Math.min(proposedQuantity, available);
      adjustments.push('QUANTITY_REDUCED_TO_EXPORTABLE_STOCK');
    }
    var values = settlementValues(buyer, seller, proposedQuantity, proposedPrice);
    var neededFunds = num(values && values.buyerValue);
    if (neededFunds !== null && funds + 1e-8 < neededFunds) {
      var affordable = neededFunds > 0 ? proposedQuantity * funds / neededFunds : 0;
      if (affordable <= 1e-8) { result.decision = 'REJECT'; result.reason = 'BUYER_CANNOT_FINANCE_ANY_DELIVERY'; return result; }
      proposedQuantity = Math.min(proposedQuantity, affordable);
      adjustments.push('QUANTITY_REDUCED_TO_AVAILABLE_FOREIGN_CURRENCY');
    }
    if (marketPrice !== null && target === seller && proposedPrice < marketPrice * 0.95) {
      proposedPrice = marketPrice;
      adjustments.push('SELLER_COUNTERED_TO_OBSERVED_MARKET_FLOOR');
    } else if (marketPrice !== null && target === buyer && proposedPrice > marketPrice * 1.05) {
      proposedPrice = marketPrice;
      adjustments.push('BUYER_COUNTERED_TO_OBSERVED_SELLER_MARKET_LEVEL');
    }
    var buyerDemand = getProductDemand(buyer, resourceId);
    var unmet = num(buyerDemand && buyerDemand.unmetDemand);
    var daily = num(buyerDemand && (buyerDemand.consumerDemandPerDay ?? buyerDemand.demandPerDay));
    var demandNeed = unmet !== null && unmet > 0 ? unmet : daily !== null ? daily * (num(proposal.intervalDays) || 30) : null;
    var demandScore = demandNeed === null ? 0.5 : clamp(demandNeed / Math.max(quantity, 1e-9), 0, 1);
    var supplyScore = clamp(available / Math.max(quantity, 1e-9), 0, 1);
    var scoredSettlement = settlementValues(buyer, seller, proposedQuantity, proposedPrice);
    buyerCost = num(scoredSettlement && scoredSettlement.buyerValue);
    var liquidityScore = buyerCost === null ? 0 : clamp(funds / Math.max(buyerCost, 1e-9), 0, 1);
    var priceScore = marketPrice === null ? 0.5 : target === buyer
      ? clamp(marketPrice / Math.max(proposedPrice, 1e-9), 0, 1)
      : clamp(proposedPrice / Math.max(marketPrice, 1e-9), 0, 1);
    var relationshipScore = rel === null ? 0.5 : rel;
    var partnerContracts = contractList(target).filter(function (row) { return canonical(row.partnerCountryId) === canonical(proposal.requestorCountryId); });
    var historyCompleted = partnerContracts.reduce(function (sum, row) { return sum + (num(row.completedDeliveries) || 0); }, 0);
    var historyFailed = partnerContracts.reduce(function (sum, row) { return sum + (num(row.failedDeliveries) || 0); }, 0);
    var reliabilityScore = historyCompleted + historyFailed > 0 ? clamp(historyCompleted / (historyCompleted + historyFailed), 0, 1) : 0.5;
    var relationshipHistoryScore = clamp(0.70 * relationshipScore + 0.30 * reliabilityScore + Math.min(partnerContracts.length, 5) * 0.02, 0, 1);
    var bilateralBalance = tradeBalance(target, canonical(proposal.requestorCountryId));
    var bilateralBalanceScore = 0.5;
    if (bilateralBalance && bilateralBalance.settledTransactionCount > 0) {
      if (target === buyer) bilateralBalanceScore = bilateralBalance.tradeBalance >= 0 ? 0.65 : 0.35;
      else bilateralBalanceScore = bilateralBalance.tradeBalance <= 0 ? 0.70 : 0.40;
    }
    var strategicScore = demandScore;
    var totalScore = 0.20 * supplyScore + 0.20 * liquidityScore + 0.20 * priceScore +
      0.15 * strategicScore + 0.10 * relationshipHistoryScore + 0.10 * bilateralBalanceScore + 0.05 * reliabilityScore;
    var alternativeEvidence = { status: 'UNKNOWN', betterSupplierCount: 0, competingBuyerCount: 0, bestAlternativePrice: null };
    if (target === buyer) {
      var supplierOptions = null;
      try { supplierOptions = globalMarket()?.suppliers?.(resourceId, proposedQuantity, buyer) || null; } catch (_) {}
      if (Array.isArray(supplierOptions)) {
        var priceOptions = supplierOptions.filter(function (row) { return row && canonical(row.countryId) !== canonical(seller); })
          .map(function (row) {
            var value = null, buyerCost = null;
            try { value = num(globalMarket()?.localPrice?.(row.countryId, resourceId)); } catch (_) {}
            if (value !== null) {
              var converted = settlementValues(buyer, row.countryId, 1, value);
              buyerCost = num(converted && converted.buyerValue);
            }
            return { countryId: canonical(row.countryId), available: num(row.available), price: value,
              currency: tradeCurrency(row.countryId), buyerCost: buyerCost, buyerCurrency: tradeCurrency(buyer) };
          }).filter(function (row) { return row.price !== null && row.buyerCost !== null &&
            row.available !== null && row.available >= proposedQuantity; })
          .sort(function (a, b) { return a.buyerCost - b.buyerCost; });
        var proposalBuyerUnitCost = num(settlementValues(buyer, seller, 1, proposedPrice).buyerValue);
        alternativeEvidence = { status: priceOptions.length ? 'OBSERVED' : 'UNKNOWN',
          betterSupplierCount: proposalBuyerUnitCost === null ? 0 : priceOptions.filter(function (row) { return row.buyerCost < proposalBuyerUnitCost; }).length,
          competingBuyerCount: 0, bestAlternativePrice: priceOptions.length ? priceOptions[0].price : null,
          bestAlternativeBuyerCost: priceOptions.length ? priceOptions[0].buyerCost : null,
          buyerCostCurrency: tradeCurrency(buyer), suppliers: priceOptions.slice(0, 5) };
      }
    } else {
      var competing = [];
      countryIds().forEach(function (candidate) {
        if (candidate === canonical(target) || candidate === canonical(buyer)) return;
        var demand = getProductDemand(candidate, resourceId), pending = requestIdList(candidate).filter(function (row) {
          return canonical(row.targetCountryId || row.sellerCountryId) === canonical(seller) && token(row.resourceId) === token(resourceId) &&
            ['SENT','COUNTER_OFFERED','ACCEPTED','SETTLEMENT_PREPARING','PENDING_SETTLEMENT'].indexOf(id(row.status)) >= 0;
        });
        var unmetCandidate = num(demand && demand.unmetDemand);
        if (pending.length || unmetCandidate !== null && unmetCandidate > 0)
          competing.push({ countryId: candidate, unmetDemand: unmetCandidate, requests: pending.map(function (row) { return { quantity: num(row.quantity), unitPrice: num(row.unitPrice) }; }) });
      });
      var alternativeBuyerPrices = competing.reduce(function (values, row) {
        return values.concat((row.requests || []).map(function (request) { return num(request.unitPrice); }).filter(function (value) { return value !== null; }));
      }, []);
      alternativeEvidence = { status: competing.length ? 'OBSERVED' : 'UNKNOWN', betterSupplierCount: 0, competingBuyerCount: competing.length,
        bestAlternativePrice: null, bestAlternativeBuyerPrice: alternativeBuyerPrices.length ? Math.max.apply(null, alternativeBuyerPrices) : null, buyers: competing.slice(0, 8) };
    }
    if (target === buyer && alternativeEvidence.bestAlternativeBuyerCost !== null) {
      var currentBuyerUnitCost = num(settlementValues(buyer, seller, 1, proposedPrice).buyerValue);
      var sellerUnitFx = num(settlementValues(buyer, seller, 1, 1).buyerValue);
      if (currentBuyerUnitCost !== null && sellerUnitFx !== null && sellerUnitFx > 0 &&
          alternativeEvidence.bestAlternativeBuyerCost < currentBuyerUnitCost * 0.95) {
        proposedPrice = alternativeEvidence.bestAlternativeBuyerCost / sellerUnitFx;
        adjustments.push('COUNTERED_TO_BETTER_OBSERVED_ALTERNATIVE_SUPPLIER_PRICE');
        settlement = settlementValues(buyer, seller, proposedQuantity, proposedPrice);
        buyerCost = num(settlement && settlement.buyerValue);
      }
    }
    if (target === seller && alternativeEvidence.bestAlternativeBuyerPrice !== null && alternativeEvidence.bestAlternativeBuyerPrice > proposedPrice * 1.15) {
      result.decisionFactors = { exportableSupply: available, buyerAvailableForeignCurrency: funds, buyerSettlementCost: buyerCost,
        observedSellerMarketPrice: marketPrice, buyerDemandPerInterval: demandNeed, alternativeMarketEvidence: alternativeEvidence,
        relationshipScore: rel, score: Number(totalScore.toFixed(4)), scoreBasis: 'DETERMINISTIC_MULTI_FACTOR' };
      result.decision = 'REJECT'; result.reason = 'BETTER_COMPETING_BUYER_OFFER_AVAILABLE'; result.confidence = 0.8;
      return result;
    }
    result.decisionFactors = {
      exportableSupply: available, buyerAvailableForeignCurrency: funds, buyerGrossAvailableForeignCurrency: grossFunds,
      buyerReservedForeignCurrency: currencyCommitments.amount, buyerCurrencyCommitments: currencyCommitments, buyerSettlementCost: buyerCost,
      observedSellerMarketPrice: marketPrice, buyerDemandPerInterval: demandNeed,
      alternativeMarketEvidence: alternativeEvidence, relationshipScore: rel,
      existingPartnerAgreementCount: partnerContracts.length, partnerDeliveryReliability: reliabilityScore,
      relationshipHistoryScore: relationshipHistoryScore, bilateralTradeBalance: bilateralBalance, bilateralBalanceScore: bilateralBalanceScore,
      weights: { supply: 0.20, liquidity: 0.20, price: 0.20, buyerDemand: 0.15, relationshipHistory: 0.10, bilateralTradeBalance: 0.10, deliveryReliability: 0.05 },
      score: Number(totalScore.toFixed(4)), scoreBasis: 'DETERMINISTIC_MULTI_FACTOR_WITH_HISTORY_AND_BILATERAL_BALANCE'
    };
    if (adjustments.length) {
      result.decision = 'COUNTER';
      result.reason = adjustments.join(';');
      result.terms = Object.assign({}, proposal, { quantityPerDelivery: proposedQuantity, unitPrice: proposedPrice });
      result.confidence = 0.9;
      return result;
    }
    if (demandNeed !== null && demandNeed <= 0) {
      result.decision = 'REJECT'; result.reason = 'NO_OBSERVED_BUYER_DEMAND'; result.confidence = 0.8; return result;
    }
    if (totalScore >= 0.55) {
      result.decision = 'ACCEPT'; result.reason = 'COMMERCIAL_AND_ECONOMIC_TERMS_ACCEPTABLE'; result.terms = clone(proposal);
      result.confidence = marketPrice === null || demandNeed === null || rel === null ? 0.7 : 0.9;
    } else if (totalScore >= 0.35) {
      result.decision = 'COUNTER'; result.reason = 'ECONOMIC_RISK_REQUIRES_REVISED_TERMS';
      result.terms = Object.assign({}, proposal, { quantityPerDelivery: proposedQuantity, unitPrice: marketPrice || proposedPrice });
      result.confidence = 0.65;
    } else {
      result.decision = 'REJECT'; result.reason = 'EXPECTED_ECONOMIC_RETURN_BELOW_ACCEPTANCE_THRESHOLD';
      result.confidence = 0.8;
    }
    return result;
  }
  function publicReviewForCountry(review, viewerCountry, proposal) {
    var safe = clone(review || {});
    var viewer = canonical(viewerCountry), buyer = canonical(proposal && proposal.buyerCountryId);
    if (buyer && viewer && buyer !== viewer) {
      var factors = safe.decisionFactors && typeof safe.decisionFactors === 'object' ? safe.decisionFactors : {};
      ['buyerAvailableForeignCurrency', 'buyerGrossAvailableForeignCurrency',
        'buyerReservedForeignCurrency'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(factors, key)) factors[key] = null;
      });
      if (Object.prototype.hasOwnProperty.call(factors, 'buyerCurrencyCommitments'))
        factors.buyerCurrencyCommitments = { status: 'PRIVATE', amount: null };
      safe.decisionFactors = factors;
      safe.privateEvidence = safe.privateEvidence || {};
      safe.privateEvidence.buyerTreasury = 'NOT_DISCLOSED_TO_COUNTERPARTY';
    }
    // Keep the evaluated country's competing offers and demand private.
    // A seller must not learn a buyer's alternative supplier quotations, while
    // a buyer must not learn a seller's competing buyer identities or bids.
    // Redact by the viewer's contractual role, rather than relying on which
    // side happened to be the evaluator. This also creates explicit empty
    // arrays when the private market source has no observations.
    var evaluator = canonical(proposal && proposal.targetCountryId);
    var seller = canonical(proposal && proposal.sellerCountryId);
    if (evaluator && viewer && evaluator !== viewer && safe.decisionFactors &&
        safe.decisionFactors.alternativeMarketEvidence) {
      var alternatives = safe.decisionFactors.alternativeMarketEvidence;
      if (viewer === seller) {
        alternatives.suppliers = [];
        alternatives.bestAlternativePrice = null;
        alternatives.bestAlternativeBuyerCost = null;
        alternatives.buyerCostCurrency = null;
        alternatives.competingSupplierQuoteDisclosure = 'PRIVATE';
        safe.decisionFactors.buyerDemandPerInterval = null;
      } else if (viewer === buyer) {
        alternatives.buyers = [];
        alternatives.bestAlternativeBuyerPrice = null;
        alternatives.competingBuyerBidDisclosure = 'PRIVATE';
      }
    }
    return safe;
  }
  function publicEvaluateProposal(country, proposal) {
    // Public callers are the proposing country; never treat the target AI's
    // private treasury as evidence that should be returned to the proposer.
    var requester = proposal && proposal.requestorCountryId || country;
    return publicReviewForCountry(evaluateProposal(country, proposal), requester, proposal);
  }

  function upsertProposalHandler(kind) {
    return function (cmd, ctx) {
      var p = cmd && cmd.payload || {}, proposal = clone(p.proposal || {});
      if (!proposal.proposalId || !canonical(proposal.requestorCountryId) || !canonical(proposal.targetCountryId))
        return { accepted: false, reason: 'BILATERAL_PROPOSAL_IDENTITY_INVALID' };
      var key = kind === 'inbox' ? 'trade.bilateralProposalInbox' : 'trade.bilateralProposalOutbox';
      var prior = ctx.stateTransaction.get(key), rows = Array.isArray(prior) ? clone(prior) : [];
      var existing = rows.find(function (row) { return String(row.proposalId) === String(proposal.proposalId); });
      if (existing) {
        var same = hash([existing.requestorCountryId, existing.targetCountryId, existing.resourceId,
          existing.quantityPerDelivery, existing.unitPrice, existing.durationMonths]) ===
          hash([proposal.requestorCountryId, proposal.targetCountryId, proposal.resourceId,
            proposal.quantityPerDelivery, proposal.unitPrice, proposal.durationMonths]);
        return same ? { accepted: true, duplicate: true, proposal: clone(existing) } :
          { accepted: false, reason: 'BILATERAL_PROPOSAL_ID_COLLISION' };
      }
      if (kind === 'inbox' && canonical(ctx.countryId) !== canonical(proposal.targetCountryId))
        return { accepted: false, reason: 'BILATERAL_PROPOSAL_RECIPIENT_MISMATCH' };
      if (kind === 'outbox' && canonical(ctx.countryId) !== canonical(proposal.requestorCountryId))
        return { accepted: false, reason: 'BILATERAL_PROPOSAL_SENDER_MISMATCH' };
      rows.push(kind === 'inbox' ? Object.assign({}, proposal, { inboxStatus: 'PENDING' }) : proposal);
      ctx.stateTransaction.set(key, rows.slice(-MAX_PROPOSALS));
      return { accepted: true, proposalId: proposal.proposalId };
    };
  }
  function syncHandler(cmd, ctx) {
    var target = canonical(cmd && cmd.payload && cmd.payload.targetCountryId), player = canonical(ctx.countryId);
    var built = buildReport(player, target);
    if (!built.accepted) return built;
    var current = ctx.stateTransaction.get('trade.bilateralMarketIntelligence');
    var next = current && typeof current === 'object' ? clone(current) : {};
    next[target] = built.report;
    ctx.stateTransaction.set('trade.bilateralMarketIntelligence', next);
    return { accepted: true, report: clone(built.report) };
  }
  function reviewRecordHandler(cmd, ctx) {
    var p = cmd && cmd.payload || {}, prior = ctx.stateTransaction.get('trade.bilateralProposalInbox');
    var rows = Array.isArray(prior) ? clone(prior) : [];
    var index = rows.findIndex(function (row) { return String(row.proposalId) === String(p.proposalId); });
    if (index < 0) return { accepted: false, reason: 'BILATERAL_INBOX_PROPOSAL_NOT_FOUND' };
    rows[index].review = clone(p.review || {});
    rows[index].inboxStatus = String(p.inboxStatus || (p.review && p.review.decision === 'WAITING_DATA' ? 'PENDING' : p.review && p.review.decision) || 'PENDING');
    rows[index].lastReviewedTurn = turn();
    ctx.stateTransaction.set('trade.bilateralProposalInbox', rows);
    return { accepted: true, proposalId: p.proposalId };
  }
  function applyResponseHandler(cmd, ctx) {
    var p = cmd && cmd.payload || {}, prior = ctx.stateTransaction.get('trade.bilateralProposalOutbox');
    var rows = Array.isArray(prior) ? clone(prior) : [];
    var index = rows.findIndex(function (row) { return String(row.proposalId) === String(p.proposalId); });
    if (index < 0) return { accepted: false, reason: 'BILATERAL_OUTBOX_PROPOSAL_NOT_FOUND' };
    rows[index].decision = clone(p.review || {});
    rows[index].status = String(p.review && p.review.decision || 'WAITING_DATA');
    rows[index].counterTerms = p.review && p.review.decision === 'COUNTER' ? clone(p.review.terms || {}) : null;
    rows[index].lastResponseTurn = turn();
    ctx.stateTransaction.set('trade.bilateralProposalOutbox', rows);
    return { accepted: true, proposal: clone(rows[index]) };
  }
  function putContractHandler(cmd, ctx) {
    var p = cmd && cmd.payload || {}, contract = clone(p.contract || {});
    if (!contract.agreementId || !canonical(contract.partnerCountryId) || !canonical(ctx.countryId))
      return { accepted: false, reason: 'BILATERAL_CONTRACT_IDENTITY_INVALID' };
    var prior = ctx.stateTransaction.get('trade.bilateralContracts'), rows = Array.isArray(prior) ? clone(prior) : [];
    var index = rows.findIndex(function (row) { return String(row.agreementId) === String(contract.agreementId); });
    if (index >= 0) {
      var old = rows[index];
      if (old.proposalId !== contract.proposalId || old.resourceId !== contract.resourceId ||
          old.quantityPerDelivery !== contract.quantityPerDelivery || old.unitPrice !== contract.unitPrice)
        return { accepted: false, reason: 'BILATERAL_CONTRACT_ID_COLLISION' };
      rows[index] = Object.assign({}, old, contract);
    } else rows.push(contract);
    ctx.stateTransaction.set('trade.bilateralContracts', rows.slice(-MAX_PROPOSALS));
    return { accepted: true, contract: clone(contract), duplicate: index >= 0 };
  }
  function updateContractHandler(cmd, ctx) {
    var p = cmd && cmd.payload || {}, rows = recordArray({ rows: ctx.stateTransaction.get('trade.bilateralContracts') }, 'rows');
    var index = rows.findIndex(function (row) { return String(row.agreementId) === String(p.agreementId); });
    if (index < 0) return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_FOUND' };
    rows[index] = Object.assign({}, rows[index], clone(p.patch || {}), { updatedTurn: turn() });
    ctx.stateTransaction.set('trade.bilateralContracts', rows);
    return { accepted: true, contract: clone(rows[index]) };
  }
  function relationAdjustmentHandler(cmd, ctx) {
    var p = cmd && cmd.payload || {}, target = canonical(p.targetCountryId);
    if (!target) return { accepted: false, reason: 'RELATION_ADJUSTMENT_TARGET_REQUIRED' };
    var prior = ctx.stateTransaction.get('foreign.relationAdjustments');
    var map = prior && typeof prior === 'object' ? clone(prior) : {};
    var existing = Array.isArray(map[target]) ? map[target] : [];
    var adjustmentId = String(p.adjustmentId || '');
    if (existing.some(function (row) { return String(row.adjustmentId || '') === adjustmentId; }))
      return { accepted: true, duplicate: true };
    existing.push({ adjustmentId: adjustmentId, delta: num(p.delta), reason: p.reason || 'BILATERAL_TRADE_BREACH', turn: turn() });
    map[target] = existing.slice(-128);
    ctx.stateTransaction.set('foreign.relationAdjustments', map);
    return { accepted: true, targetCountryId: target, delta: num(p.delta) };
  }
  function recordPenaltyClaim(country, claim) {
    var raw = dispatch('trade', 'OMEGA_BILATERAL_RECORD_PENALTY_CLAIM', country, { claim: claim });
    return unwrap(raw);
  }
  function penaltyClaimHandler(cmd, ctx) {
    var claim = clone(cmd && cmd.payload && cmd.payload.claim || {});
    if (!claim.claimId || !claim.agreementId) return { accepted: false, reason: 'BILATERAL_PENALTY_CLAIM_ID_REQUIRED' };
    var prior = ctx.stateTransaction.get('trade.bilateralPenaltyClaims');
    var rows = Array.isArray(prior) ? clone(prior) : [];
    var found = rows.find(function (row) { return String(row.claimId) === String(claim.claimId); });
    if (found) return { accepted: true, duplicate: true, claim: clone(found) };
    rows.push(claim);
    ctx.stateTransaction.set('trade.bilateralPenaltyClaims', rows.slice(-MAX_PROPOSALS));
    return { accepted: true, claim: claim };
  }
  function activateContract(proposal, acceptedTerms) {
    var terms = Object.assign({}, clone(proposal), clone(acceptedTerms || {}));
    var seller = canonical(proposal.sellerCountryId), buyer = canonical(proposal.buyerCountryId);
    var durationMonths = num(terms.durationMonths), intervalDays = num(terms.intervalDays);
    var paymentSchedule = id(terms.paymentSchedule || 'PER_DELIVERY_ON_SETTLEMENT');
    if (!seller || !buyer || seller === buyer || DURATION_MONTHS.indexOf(durationMonths) < 0 ||
        !num(terms.quantityPerDelivery) || num(terms.quantityPerDelivery) <= 0 ||
        !num(terms.unitPrice) || num(terms.unitPrice) <= 0 || intervalDays === null || intervalDays <= 0)
      return { accepted: false, reason: 'BILATERAL_CONTRACT_TERMS_INVALID' };
    if (paymentSchedule !== 'PER_DELIVERY_ON_SETTLEMENT')
      return { accepted: false, reason: 'UNSUPPORTED_PAYMENT_SCHEDULE' };
    var agreementId = 'BTA-' + seller + '-' + buyer + '-' + (num(proposal.createdTurn) ?? turn()) + '-' + hash([proposal.proposalId, terms.resourceId]);
    var previousAgreementId = String(proposal.previousAgreementId || '').trim();
    var previousBuyerContract = null, previousSellerContract = null, previousRenewalError = null;
    if (previousAgreementId) {
      previousBuyerContract = contractList(buyer).find(function (row) { return String(row.agreementId) === previousAgreementId; }) || null;
      previousSellerContract = contractList(seller).find(function (row) { return String(row.agreementId) === previousAgreementId; }) || null;
      if (!previousBuyerContract || !previousSellerContract ||
          canonical(previousBuyerContract.partnerCountryId) !== seller || canonical(previousSellerContract.partnerCountryId) !== buyer ||
          token(previousBuyerContract.resourceId) !== token(terms.resourceId) || token(previousSellerContract.resourceId) !== token(terms.resourceId)) {
        return { accepted: false, reason: 'PREVIOUS_AGREEMENT_MIRROR_OR_PRODUCT_MISMATCH' };
      }
      [previousBuyerContract, previousSellerContract].forEach(function (row) {
        var status = id(row.status);
        if (row.currentRequestId) previousRenewalError = 'RENEWAL_BLOCKED_BY_PENDING_DELIVERY';
        else if (!['ACTIVE', 'AT_RISK', 'COMPLETED', 'EXPIRED'].includes(status) &&
            !(status === 'RENEWED' && String(row.supersededByAgreementId || '') === agreementId))
          previousRenewalError = 'PREVIOUS_AGREEMENT_NOT_RENEWABLE';
      });
      if (previousRenewalError) return { accepted: false, reason: previousRenewalError };
    }
    var durationTurns = monthsToTurns(durationMonths), intervalTurns = intervalToTurns(intervalDays);
    var deliveries = Math.max(1, Math.floor(durationTurns / intervalTurns));
    var contract = {
      schemaVersion: VERSION, agreementId: agreementId, proposalId: proposal.proposalId,
      buyerCountryId: buyer, sellerCountryId: seller,
      partnerCountryId: null, role: null,
      resourceId: String(terms.resourceId), quantityPerDelivery: num(terms.quantityPerDelivery),
      quantityTolerancePct: clamp(terms.quantityTolerancePct ?? 0, 0, 50),
      unitPrice: num(terms.unitPrice), currency: tradeCurrency(seller),
      invoiceCurrency: tradeCurrency(seller), paymentCurrency: tradeCurrency(buyer),
      paymentSchedule: paymentSchedule,
      paymentTiming: 'AT_EACH_DELIVERY_SETTLEMENT',
      priceModel: id(terms.priceModel || 'FIXED'), marketAdjustmentPct: clamp(terms.marketAdjustmentPct ?? 0, -50, 100),
      priceHistory: [{ turn: turn(), unitPrice: num(terms.unitPrice), model: id(terms.priceModel || 'FIXED') }],
      durationMonths: durationMonths, durationTurns: durationTurns,
      intervalDays: intervalDays, intervalTurns: intervalTurns,
      terminationPenaltyPct: clamp(terms.terminationPenaltyPct ?? 0, 0, 100),
      relationshipPenaltyPoints: clamp(terms.relationshipPenaltyPoints, 0, 100),
      startTurn: turn(), endTurn: turn() + durationTurns,
      nextDeliveryTurn: turn() + intervalTurns,
      plannedDeliveryCount: deliveries, deliveredQuantity: 0, completedDeliveries: 0,
      currentRequestId: null, currentRequestUnitPrice: null, failedDeliveries: 0, deliveries: [],
      status: 'ACTIVE', renewalStatus: 'NOT_DUE', createdTurn: turn(), updatedTurn: turn(),
      termsProvenance: { source: 'BILATERAL_MUTUAL_ACCEPTANCE', proposalId: proposal.proposalId }
    };
    var treatyTerms = Object.assign({}, contract, { treatyType: 'BILATERAL_TRADE_AGREEMENT' });
    var mesh = interop();
    if (!mesh || typeof mesh.dispatchCommand !== 'function')
      return { accepted: false, reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    var buyerTreaty = dispatch('foreign', 'OMEGA_TREATY_ACTIVATE', buyer, {
      negotiationId: proposal.proposalId, targetCountryId: seller, terms: treatyTerms, treatyType: 'BILATERAL_TRADE_AGREEMENT'
    });
    var sellerTreaty = dispatch('foreign', 'OMEGA_TREATY_ACTIVATE', seller, {
      negotiationId: proposal.proposalId, targetCountryId: buyer, terms: treatyTerms, treatyType: 'BILATERAL_TRADE_AGREEMENT'
    });
    if (!succeeded(buyerTreaty) || !succeeded(sellerTreaty))
      return { accepted: false, status: 'RATIFICATION_PENDING', reason: 'BILATERAL_TREATY_TWO_SIDED_RATIFICATION_INCOMPLETE',
        buyerStatus: buyerTreaty && buyerTreaty.status, sellerStatus: sellerTreaty && sellerTreaty.status };
    var buyerContract = Object.assign({}, contract, { partnerCountryId: seller, role: 'BUYER' });
    var sellerContract = Object.assign({}, contract, { partnerCountryId: buyer, role: 'SELLER' });
    var buyerSaved = unwrap(dispatch('trade', 'OMEGA_BILATERAL_PUT_CONTRACT', buyer, { contract: buyerContract }));
    var sellerSaved = unwrap(dispatch('trade', 'OMEGA_BILATERAL_PUT_CONTRACT', seller, { contract: sellerContract }));
    if (!buyerSaved || buyerSaved.accepted !== true || !sellerSaved || sellerSaved.accepted !== true)
      return { accepted: false, status: 'CONTRACT_REPLICATION_PENDING', reason: 'BILATERAL_CONTRACT_TWO_SIDED_PERSISTENCE_INCOMPLETE',
        buyer: buyerSaved, seller: sellerSaved, agreementId: agreementId };
    if (previousAgreementId) {
      var renewalPatch = { status: 'RENEWED', renewalStatus: 'RENEWED', renewedTurn: turn(),
        endTurn: turn(), nextDeliveryTurn: null, supersededByAgreementId: agreementId };
      var priorBuyerUpdated = unwrap(dispatch('trade', 'OMEGA_BILATERAL_UPDATE_CONTRACT', buyer,
        { agreementId: previousAgreementId, patch: renewalPatch }));
      var priorSellerUpdated = unwrap(dispatch('trade', 'OMEGA_BILATERAL_UPDATE_CONTRACT', seller,
        { agreementId: previousAgreementId, patch: renewalPatch }));
      if (!priorBuyerUpdated || priorBuyerUpdated.accepted !== true || !priorSellerUpdated || priorSellerUpdated.accepted !== true)
        return { accepted: false, status: 'RENEWAL_FINALIZATION_PENDING', reason: 'PREVIOUS_AGREEMENT_NOT_SUPERSEDED_ON_BOTH_SIDES',
          agreementId: agreementId, previousAgreementId: previousAgreementId, buyer: priorBuyerUpdated, seller: priorSellerUpdated };
    }
    emit('OMEGA_BILATERAL_TRADE_AGREEMENT_ACTIVATED', buyer, { agreementId: agreementId, sellerCountryId: seller, proposalId: proposal.proposalId });
    emit('OMEGA_BILATERAL_TRADE_AGREEMENT_ACTIVATED', seller, { agreementId: agreementId, buyerCountryId: buyer, proposalId: proposal.proposalId });
    return { accepted: true, status: 'ACTIVE', contract: contract };
  }
  function emit(type, country, detail) {
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function')
        g.dispatchEvent(new g.CustomEvent(type, { detail: Object.assign({ countryId: canonical(country), simulationTurn: turn() }, clone(detail || {})) }));
    } catch (_) {}
  }
  function updateContract(country, agreementId, patch) {
    return unwrap(dispatch('trade', 'OMEGA_BILATERAL_UPDATE_CONTRACT', country, { agreementId: agreementId, patch: patch }));
  }
  function mirrorContract(country, partner, agreementId, patch) {
    updateContract(country, agreementId, patch);
    updateContract(partner, agreementId, patch);
  }
  function recordTerminationConsent(country, agreementId, agreed) {
    var c = canonical(country), contract = contractList(c).find(function (row) {
      return String(row.agreementId) === String(agreementId);
    });
    if (!contract) return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_FOUND' };
    if (!['ACTIVE', 'AT_RISK', 'RATIFICATION_PENDING'].includes(id(contract.status)))
      return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_ACTIVE' };
    if (contract.currentRequestId)
      return { accepted: false, reason: 'TERMINATION_BLOCKED_BY_PENDING_DELIVERY',
        agreementId: contract.agreementId, requestId: contract.currentRequestId };
    var partner = canonical(contract.partnerCountryId);
    if (!partner || c !== canonical(contract.buyerCountryId) && c !== canonical(contract.sellerCountryId))
      return { accepted: false, reason: 'TERMINATION_CONSENT_PARTY_MISMATCH' };
    var consents = Array.isArray(contract.terminationConsents) ?
      contract.terminationConsents.map(canonical).filter(Boolean) : [];
    consents = consents.filter(function (countryId) { return countryId !== c; });
    if (agreed === true) consents.push(c);
    consents = Array.from(new Set(consents)).sort();
    var saved = updateContract(c, contract.agreementId, {
      terminationConsents: consents, terminationConsentTurn: turn()
    });
    if (!saved || saved.accepted !== true)
      return { accepted: false, reason: 'TERMINATION_CONSENT_PERSISTENCE_FAILED', detail: saved };
    return { accepted: true, status: consents.indexOf(partner) >= 0 ? 'MUTUALLY_APPROVED' : agreed ? 'WAITING_FOR_PARTNER_CONSENT' : 'CONSENT_REVOKED',
      agreementId: contract.agreementId, consentedBy: consents };
  }
  function findImportRequest(country, requestId) {
    return requestIdList(country).find(function (row) { return String(row.requestId) === String(requestId); }) || null;
  }
  function processContract(country, contract) {
    var c = canonical(country), partner = canonical(contract.partnerCountryId), role = id(contract.role);
    if (!partner) return { status: 'SKIPPED' };
    if (id(contract.status) === 'AT_RISK') {
      var retryTurn = num(contract.retryEligibleTurn);
      if (retryTurn === null || turn() < retryTurn) return { status: 'AT_RISK', retryEligibleTurn: retryTurn };
      var resumedPatch = { status: 'ACTIVE', nextDeliveryTurn: Math.min(num(contract.nextDeliveryTurn) || retryTurn, retryTurn), retryEligibleTurn: null };
      mirrorContract(c, partner, contract.agreementId, resumedPatch);
      contract = Object.assign({}, contract, resumedPatch);
    }
    if (id(contract.status) !== 'ACTIVE') return { status: 'SKIPPED' };
    if (role === 'BUYER' && contract.currentRequestId) {
      var request = findImportRequest(c, contract.currentRequestId);
      if (!request) return { status: 'WAITING', reason: 'CONTRACT_DELIVERY_REQUEST_NOT_FOUND' };
      var sellerMirror = contractList(partner).find(function (row) { return String(row.agreementId) === String(contract.agreementId); });
      if (!sellerMirror) {
        var partnerTreaty = mapEntry((bucket(partner, 'foreign') || {}).treaties || {}, c).value;
        if (!partnerTreaty || !['ACTIVE', 'IMPLEMENTED'].includes(id(partnerTreaty.status || partnerTreaty.stage)))
          return { status: 'BLOCKED', reason: 'SELLER_AGREEMENT_OR_TREATY_MIRROR_MISSING' };
        var sellerCopy = Object.assign({}, clone(contract), { partnerCountryId: c, role: 'SELLER' });
        var restored = unwrap(dispatch('trade', 'OMEGA_BILATERAL_PUT_CONTRACT', partner, { contract: sellerCopy }));
        if (!restored || restored.accepted !== true) return { status: 'WAITING', reason: 'SELLER_CONTRACT_MIRROR_RECOVERY_FAILED', detail: restored };
        sellerMirror = sellerCopy;
      }
      if (id(sellerMirror.status) !== 'ACTIVE' ||
          sellerMirror.currentRequestId && String(sellerMirror.currentRequestId) !== String(request.requestId))
        return { status: 'BLOCKED', reason: 'BUYER_SELLER_CONTRACT_STATE_MISMATCH' };
      var reservedRequestPrice = num(contract.currentRequestUnitPrice);
      if (reservedRequestPrice === null) {
        reservedRequestPrice = id(contract.priceModel || 'FIXED') === 'FIXED'
          ? num(contract.unitPrice) : num(request.unitPrice);
        if (reservedRequestPrice === null || reservedRequestPrice <= 0)
          return { status: 'BLOCKED', reason: 'CONTRACT_DELIVERY_PRICE_UNKNOWN' };
        var buyerPriceMirror = unwrap(dispatch('trade', 'OMEGA_BILATERAL_UPDATE_CONTRACT', c, {
          agreementId: contract.agreementId, patch: { currentRequestUnitPrice: reservedRequestPrice }
        }));
        if (!buyerPriceMirror || buyerPriceMirror.accepted !== true)
          return { status: 'WAITING', reason: 'BUYER_DELIVERY_PRICE_MIRROR_RECOVERY_FAILED' };
        contract = Object.assign({}, contract, { currentRequestUnitPrice: reservedRequestPrice });
      }
      if (!sellerMirror.currentRequestId || num(sellerMirror.currentRequestUnitPrice) === null) {
        var sellerRequestMirror = unwrap(dispatch('trade', 'OMEGA_BILATERAL_UPDATE_CONTRACT', partner, {
          agreementId: contract.agreementId, patch: { currentRequestId: request.requestId,
            currentRequestUnitPrice: reservedRequestPrice,
            lastRequestTurn: contract.lastRequestTurn || turn() }
        }));
        if (!sellerRequestMirror || sellerRequestMirror.accepted !== true)
          return { status: 'WAITING', reason: 'SELLER_DELIVERY_REQUEST_MIRROR_RECOVERY_FAILED' };
      }
      if (id(request.status) === 'SETTLED' && !contract.deliveries.some(function (row) { return row.requestId === request.requestId; })) {
        var actualQuantity = num(request.quantity) || 0;
        var tolerancePct = clamp(contract.quantityTolerancePct ?? 0, 0, 50) || 0;
        var minimumQuantity = (num(contract.quantityPerDelivery) || 0) * (1 - tolerancePct / 100);
        var maximumQuantity = (num(contract.quantityPerDelivery) || 0) * (1 + tolerancePct / 100);
        var withinTolerance = actualQuantity + 1e-8 >= minimumQuantity && actualQuantity <= maximumQuantity + 1e-8;
        var delivery = { requestId: request.requestId, settlementId: request.settlementId || null,
          quantity: actualQuantity, minAllowedQuantity: minimumQuantity, maxAllowedQuantity: maximumQuantity,
          withinTolerance: withinTolerance, unitPrice: num(request.unitPrice),
          settledTurn: num(request.settledTurn ?? request.turn) ?? turn(),
          resourceId: contract.resourceId, status: withinTolerance ? 'SETTLED' : 'SETTLED_OUTSIDE_TOLERANCE' };
        var nextDue = (num(contract.nextDeliveryTurn) || turn()) + (num(contract.intervalTurns) || 1);
        var completed = (num(contract.completedDeliveries) || 0) + 1;
        var priceHistory = (contract.priceHistory || []).concat([{ turn: delivery.settledTurn, unitPrice: delivery.unitPrice, requestId: delivery.requestId }]).slice(-128);
        var patch = { deliveries: (contract.deliveries || []).concat([delivery]).slice(-128),
          deliveredQuantity: (num(contract.deliveredQuantity) || 0) + delivery.quantity,
          completedDeliveries: completed, currentRequestId: null, currentRequestUnitPrice: null,
          nextDeliveryTurn: nextDue, priceHistory: priceHistory,
          lastDeliveryTurn: delivery.settledTurn, lastDeliveryStatus: delivery.status,
          lastToleranceResult: { withinTolerance: withinTolerance, minimumQuantity: minimumQuantity, maximumQuantity: maximumQuantity, actualQuantity: actualQuantity } };
        if (!withinTolerance) {
          patch.status = 'AT_RISK'; patch.retryEligibleTurn = nextDue;
          patch.lastFailureReason = 'DELIVERY_OUTSIDE_AGREED_QUANTITY_TOLERANCE';
        } else if (completed >= num(contract.plannedDeliveryCount)) patch.status = 'COMPLETED';
        mirrorContract(c, partner, contract.agreementId, patch);
        return { status: 'DELIVERY_SETTLED', requestId: request.requestId, agreementId: contract.agreementId };
      }
      if (['REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(id(request.status))) {
        mirrorContract(c, partner, contract.agreementId, { currentRequestId: null, currentRequestUnitPrice: null, status: 'AT_RISK',
          failedDeliveries: (num(contract.failedDeliveries) || 0) + 1,
          lastDeliveryStatus: id(request.status), lastFailureReason: request.reason || request.stage || request.status,
          retryEligibleTurn: turn() + (num(contract.intervalTurns) || 1) });
        return { status: 'DELIVERY_FAILED', agreementId: contract.agreementId };
      }
      return { status: 'DELIVERY_PENDING', requestId: request.requestId };
    }
    if (turn() > num(contract.endTurn)) {
      mirrorContract(c, partner, contract.agreementId, { status: 'EXPIRED', expiredTurn: turn() });
      return { status: 'EXPIRED', agreementId: contract.agreementId };
    }
    if (turn() >= num(contract.endTurn) - (num(contract.intervalTurns) || 1) && contract.renewalStatus !== 'DUE') {
      mirrorContract(c, partner, contract.agreementId, { renewalStatus: 'DUE', renewalReviewTurn: turn() });
      emit('OMEGA_BILATERAL_TRADE_RENEWAL_DUE', c, { agreementId: contract.agreementId, partnerCountryId: partner, endTurn: contract.endTurn });
    }
    if (role !== 'BUYER') return { status: 'MONITORING' };
    if (turn() < (num(contract.retryEligibleTurn) || num(contract.nextDeliveryTurn) || 0)) return { status: 'NOT_DUE' };
    var trade = globalTrade();
    if (!trade || typeof trade.createRequest !== 'function') return { status: 'BLOCKED', reason: 'GLOBAL_TRADE_SETTLEMENT_AUTHORITY_UNAVAILABLE' };
    var sequence = (num(contract.completedDeliveries) || 0) + (num(contract.failedDeliveries) || 0) + 1;
    var requestId = String(contract.agreementId) + '-DELIVERY-' + String(sequence).padStart(4, '0');
    var deliveryUnitPrice = num(contract.unitPrice);
    if (id(contract.priceModel || 'FIXED') === 'MARKET_LINKED') {
      var linkedPrice = readProduct(contract.sellerCountryId, { id: contract.resourceId }).expectedPrice;
      if (!linkedPrice || linkedPrice.status !== 'KNOWN' || num(linkedPrice.value) === null)
        return { status: 'BLOCKED', reason: 'MARKET_LINKED_PRICE_NOT_CLEARED' };
      deliveryUnitPrice = Number((num(linkedPrice.value) * (1 + (num(contract.marketAdjustmentPct) || 0) / 100)).toFixed(8));
    }
    // Global Trade may review/authorize the request synchronously inside
    // createRequest(). Reserve the exact request ID on both contract mirrors
    // first, so seller-side BTA authorization can verify it atomically.
    var requestReservation = { currentRequestId: requestId, currentRequestUnitPrice: deliveryUnitPrice, lastDeliveryStatus: 'REQUESTING',
      lastRequestTurn: turn(), retryEligibleTurn: null, status: 'ACTIVE' };
    var buyerReservation = updateContract(c, contract.agreementId, requestReservation);
    if (!buyerReservation || buyerReservation.accepted !== true)
      return { status: 'WAITING', reason: 'BUYER_CONTRACT_DELIVERY_RESERVATION_FAILED', detail: buyerReservation };
    var sellerReservation = updateContract(partner, contract.agreementId, requestReservation);
    if (!sellerReservation || sellerReservation.accepted !== true) {
      updateContract(c, contract.agreementId, { currentRequestId: null, currentRequestUnitPrice: null, status: 'AT_RISK',
        lastFailureReason: 'SELLER_CONTRACT_DELIVERY_RESERVATION_FAILED',
        retryEligibleTurn: turn() + (num(contract.intervalTurns) || 1) });
      return { status: 'WAITING', reason: 'SELLER_CONTRACT_DELIVERY_RESERVATION_FAILED', detail: sellerReservation };
    }
    var created;
    try {
      created = trade.createRequest(c, {
        requestId: requestId, targetCountryId: contract.sellerCountryId, resourceId: contract.resourceId,
        quantity: contract.quantityPerDelivery, unitPrice: deliveryUnitPrice, currency: contract.currency,
        governmentContractId: contract.agreementId, source: 'OMEGA_BILATERAL_TRADE_AGREEMENT'
      });
    } catch (error) {
      created = { accepted: false, reason: String(error && error.message || error) };
    }
    if (!created || created.accepted !== true) {
      mirrorContract(c, partner, contract.agreementId, { currentRequestId: null, currentRequestUnitPrice: null, status: 'AT_RISK',
        lastFailureReason: created && created.reason || 'TRADE_REQUEST_CREATE_FAILED',
        failedDeliveries: (num(contract.failedDeliveries) || 0) + 1, retryEligibleTurn: turn() + (num(contract.intervalTurns) || 1) });
      return { status: 'DELIVERY_REQUEST_FAILED', reason: created && created.reason || 'TRADE_REQUEST_CREATE_FAILED' };
    }
    mirrorContract(c, partner, contract.agreementId, { lastDeliveryStatus: 'REQUESTED',
      lastRequestTurn: turn(), retryEligibleTurn: null, status: 'ACTIVE' });
    return { status: 'DELIVERY_REQUESTED', agreementId: contract.agreementId, requestId: requestId };
  }
  function processInbox(country) {
    var c = canonical(country), rows = recordArray(bucket(c, 'trade'), 'bilateralProposalInbox');
    var pending = rows.filter(function (row) { return ['PENDING', 'WAITING_DATA', 'ACCEPT_PENDING_RATIFICATION'].includes(id(row.inboxStatus)) && num(row.createdTurn) !== null && num(row.createdTurn) < turn(); })
      .slice(0, MAX_REVIEWS_PER_COUNTRY_TURN);
    var results = [];
    pending.forEach(function (proposal) {
      var recovering = id(proposal.inboxStatus) === 'ACCEPT_PENDING_RATIFICATION' && proposal.review && proposal.review.decision === 'ACCEPT';
      var review = recovering ? clone(proposal.review) : evaluateProposal(c, proposal);
      var inboxStatus = review.decision === 'WAITING_DATA' ? 'PENDING' : recovering ? 'ACCEPT_PENDING_RATIFICATION' : review.decision;
      var recorded = unwrap(dispatch('trade', 'OMEGA_BILATERAL_RECORD_REVIEW', c, {
        proposalId: proposal.proposalId, review: review, inboxStatus: inboxStatus
      }));
      if (!recorded || recorded.accepted !== true) {
        results.push({ proposalId: proposal.proposalId, status: 'FAILED', reason: recorded && recorded.reason || 'COUNTERPARTY_REVIEW_WRITE_FAILED' });
        return;
      }
      var proposerReview = publicReviewForCountry(review, proposal.requestorCountryId, proposal);
      var applied = unwrap(dispatch('trade', 'OMEGA_BILATERAL_APPLY_RESPONSE', proposal.requestorCountryId, {
        proposalId: proposal.proposalId, review: proposerReview
      }));
      if (!applied || applied.accepted !== true) {
        if (review.decision === 'ACCEPT') dispatch('trade', 'OMEGA_BILATERAL_RECORD_REVIEW', c, {
          proposalId: proposal.proposalId, review: review, inboxStatus: 'ACCEPT_PENDING_RATIFICATION'
        });
        results.push({ proposalId: proposal.proposalId, status: 'FAILED', reason: applied && applied.reason || 'PROPOSER_RESPONSE_WRITE_FAILED' });
        return;
      }
      if (review.decision === 'ACCEPT') {
        var activated = activateContract(proposal, review.terms);
        dispatch('trade', 'OMEGA_BILATERAL_RECORD_REVIEW', c, {
          proposalId: proposal.proposalId, review: review,
          inboxStatus: activated.accepted ? 'ACTIVE' : 'ACCEPT_PENDING_RATIFICATION'
        });
        results.push({ proposalId: proposal.proposalId, status: activated.status || 'ACCEPTED', activation: activated });
      } else results.push({ proposalId: proposal.proposalId, status: review.decision, reason: review.reason, terms: review.terms || null });
    });
    return results;
  }
  function processCountry(country) {
    var c = canonical(country);
    if (!c) return { status: 'SKIPPED', reason: 'BILATERAL_COUNTRY_ID_REQUIRED' };
    var tokenKey = c + ':' + turn();
    if (processedTurns.has(tokenKey)) return { status: 'ALREADY_PROCESSED', countryId: c, turn: turn(), processed: 0 };
    processedTurns.add(tokenKey);
    if (processedTurns.size > 512) processedTurns.delete(processedTurns.values().next().value);
    var proposals = processInbox(c);
    var contracts = contractList(c).slice(0, MAX_CONTRACTS_PER_COUNTRY_TURN);
    var contractResults = [];
    contracts.forEach(function (contract) { contractResults.push(processContract(c, contract)); });
    return { status: 'COMPLETED', countryId: c, turn: turn(), proposals: proposals, contracts: contractResults,
      automaticWorldRosterScan: false };
  }
  function acceptCounteroffer(country, proposalIdValue) {
    var c = canonical(country), rows = recordArray(bucket(c, 'trade'), 'bilateralProposalOutbox');
    var proposal = rows.find(function (row) { return String(row.proposalId) === String(proposalIdValue); });
    if (!proposal || id(proposal.status) !== 'COUNTER') return { accepted: false, reason: 'COUNTEROFFER_NOT_FOUND' };
    var terms = clone(proposal.counterTerms || {});
    var report = currentReport(c, proposal.targetCountryId);
    if (report.status !== 'CURRENT') return { accepted: false, reason: 'MARKET_INTELLIGENCE_STALE', detail: report };
    var updated = Object.assign({}, proposal, terms, { marketSnapshotId: report.report.snapshotId });
    var preview = previewProposal(c, Object.assign({}, updated, { direction: updated.direction }));
    if (!preview.canSend) return { accepted: false, reason: preview.reason, feasibility: preview };
    var activated = activateContract(updated, terms);
    if (activated.accepted) {
      var acceptedReview = { decision: 'ACCEPTED_COUNTER', terms: terms, acceptedTurn: turn() };
      dispatch('trade', 'OMEGA_BILATERAL_APPLY_RESPONSE', c, { proposalId: proposalIdValue, review: acceptedReview });
      dispatch('trade', 'OMEGA_BILATERAL_RECORD_REVIEW', proposal.targetCountryId, { proposalId: proposalIdValue, review: acceptedReview });
    }
    return activated;
  }
  function renewContract(country, agreementId, durationMonths) {
    var c = canonical(country), rows = contractList(c);
    var contract = rows.find(function (row) { return String(row.agreementId) === String(agreementId); });
    if (!contract) return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_FOUND' };
    var partner = canonical(contract.partnerCountryId);
    if (!partner) return { accepted: false, reason: 'BILATERAL_CONTRACT_PARTNER_UNKNOWN' };
    if (contract.currentRequestId) return { accepted: false, reason: 'RENEWAL_BLOCKED_BY_PENDING_DELIVERY' };
    if (!['ACTIVE', 'AT_RISK', 'COMPLETED', 'EXPIRED'].includes(id(contract.status)))
      return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_RENEWABLE' };
    var direction = id(contract.role) === 'BUYER' ? 'IMPORT' : 'EXPORT';
    var report = currentReport(c, partner, true);
    if (report.status !== 'CURRENT') {
      var synced = syncMarket(c, partner);
      if (!synced || synced.accepted !== true) return { accepted: false, reason: 'RENEWAL_MARKET_SYNC_FAILED', detail: synced };
    }
    return createProposal(c, {
      targetCountryId: partner, direction: direction, resourceId: contract.resourceId,
      quantityPerDelivery: contract.quantityPerDelivery, unitPrice: contract.unitPrice,
      priceModel: contract.priceModel || 'FIXED', marketAdjustmentPct: contract.marketAdjustmentPct || 0,
      durationMonths: durationMonths, intervalDays: contract.intervalDays,
      quantityTolerancePct: contract.quantityTolerancePct, terminationPenaltyPct: contract.terminationPenaltyPct,
      relationshipPenaltyPoints: contract.relationshipPenaltyPoints, previousAgreementId: contract.agreementId
    });
  }
  function terminateContract(country, agreementId, reason, options) {
    var c = canonical(country), opts = options || {};
    var rows = contractList(c), contract = rows.find(function (row) { return String(row.agreementId) === String(agreementId); });
    if (!contract) return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_FOUND' };
    if (['TERMINATED', 'EXPIRED', 'RENEWED'].includes(id(contract.status)))
      return { accepted: true, duplicate: true, status: contract.status };
    if (!['ACTIVE', 'AT_RISK', 'RATIFICATION_PENDING'].includes(id(contract.status)))
      return { accepted: false, reason: 'BILATERAL_CONTRACT_NOT_ACTIVE' };
    if (contract.currentRequestId)
      return { accepted: false, reason: 'TERMINATION_BLOCKED_BY_PENDING_DELIVERY',
        agreementId: contract.agreementId, requestId: contract.currentRequestId };
    var partner = canonical(contract.partnerCountryId), buyer = canonical(contract.buyerCountryId), seller = canonical(contract.sellerCountryId);
    var remainingDeliveries = Math.max(0, (num(contract.plannedDeliveryCount) || 0) - (num(contract.completedDeliveries) || 0));
    var pct = num(contract.terminationPenaltyPct) || 0;
    var penaltyBase = remainingDeliveries * (num(contract.quantityPerDelivery) || 0) * (num(contract.unitPrice) || 0) * pct / 100;
    var relationship = relationFor(c, partner) || {};
    var verifiedForceMajeure = relationship.war_state === true || relationship.sanctions === true;
    if (opts.forceMajeure === true && !verifiedForceMajeure)
      return { accepted: false, reason: 'FORCE_MAJEURE_EVIDENCE_NOT_VERIFIED' };
    var consents = Array.isArray(contract.terminationConsents) ? contract.terminationConsents.map(canonical) : [];
    var mutual = opts.mutualAgreement === true && consents.indexOf(c) >= 0 && consents.indexOf(partner) >= 0;
    if (opts.mutualAgreement === true && !mutual)
      return { accepted: false, reason: 'MUTUAL_TERMINATION_REQUIRES_BOTH_PARTY_APPROVALS',
        agreementId: contract.agreementId, consentedBy: consents };
    var forceMajeure = opts.forceMajeure === true && verifiedForceMajeure;
    var penalty = { status: 'WAIVED', amount: 0, reason: forceMajeure ? 'VERIFIED_FORCE_MAJEURE' : mutual ? 'MUTUAL_TERMINATION' : 'NO_PENALTY_CLAUSE' };
    if (!forceMajeure && !mutual && penaltyBase > 0) {
      var trade = globalTrade(), values = settlementValues(buyer, seller, 1, penaltyBase);
      var breakerIsSeller = c === seller;
      var debtor = c, creditor = partner;
      var debtorAmount = breakerIsSeller ? num(values.sellerValue) : num(values.buyerValue);
      var creditorAmount = breakerIsSeller ? num(values.buyerValue) : num(values.sellerValue);
      var claimId = 'BILAT-PENALTY-' + contract.agreementId;
      if (trade && num(debtorAmount) !== null && num(creditorAmount) !== null) {
        var debit = dispatch('finance', 'OMEGA_TRADE_FINANCE_DEBIT', debtor, {
          amount: debtorAmount, settlementId: claimId + '-DEBIT', reason: 'BILATERAL_AGREEMENT_EARLY_TERMINATION'
        });
        if (succeeded(debit)) {
          var credit = dispatch('finance', 'OMEGA_TRADE_FINANCE_CREDIT', creditor, {
            amount: creditorAmount, settlementId: claimId + '-CREDIT', reason: 'BILATERAL_AGREEMENT_TERMINATION_PENALTY'
          });
          if (succeeded(credit)) penalty = { status: 'PAID', claimId: claimId, amount: penaltyBase,
            debtorAmount: debtorAmount, creditorAmount: creditorAmount };
          else {
            dispatch('finance', 'OMEGA_TRADE_FINANCE_CREDIT', debtor, {
              amount: debtorAmount, settlementId: claimId + '-COMPENSATION', reason: 'BILATERAL_PENALTY_CREDIT_FAILED_REFUND'
            });
            penalty = { status: 'PENDING', claimId: claimId, reason: 'CREDITOR_PENALTY_CREDIT_FAILED' };
          }
        } else penalty = { status: 'PENDING', claimId: claimId, reason: debit && debit.reason || 'DEBTOR_PENALTY_DEBIT_FAILED' };
      } else penalty = { status: 'PENDING', claimId: claimId, reason: 'PENALTY_FX_OR_TREASURY_AUTHORITY_UNKNOWN' };
      recordPenaltyClaim(creditor, { claimId: claimId, agreementId: contract.agreementId, debtorCountryId: debtor,
        creditorCountryId: creditor, amount: penaltyBase, currency: contract.currency, status: penalty.status, createdTurn: turn() });
    }
    var patch = { status: 'TERMINATED', terminationTurn: turn(), terminationReason: reason || 'PARTY_TERMINATED',
      terminationAuthority: c, penaltyOutcome: penalty, forceMajeure: forceMajeure, mutualAgreement: mutual };
    mirrorContract(c, partner, contract.agreementId, patch);
    var relationPenalty = num(contract.relationshipPenaltyPoints);
    if (!forceMajeure && !mutual && relationPenalty !== null && relationPenalty > 0) {
      dispatch('foreign', 'OMEGA_BILATERAL_RELATION_ADJUSTMENT', c, {
        targetCountryId: partner, adjustmentId: 'BILAT-BREACH-' + contract.agreementId,
        delta: -relationPenalty, reason: 'BILATERAL_TRADE_AGREEMENT_BREACH'
      });
      dispatch('foreign', 'OMEGA_BILATERAL_RELATION_ADJUSTMENT', partner, {
        targetCountryId: c, adjustmentId: 'BILAT-BREACH-' + contract.agreementId,
        delta: -relationPenalty, reason: 'BILATERAL_TRADE_AGREEMENT_BREACH'
      });
    }
    dispatch('foreign', 'OMEGA_TREATY_TERMINATE', c, { targetCountryId: partner });
    dispatch('foreign', 'OMEGA_TREATY_TERMINATE', partner, { targetCountryId: c });
    emit('OMEGA_BILATERAL_TRADE_AGREEMENT_TERMINATED', c, { agreementId: contract.agreementId, partnerCountryId: partner, penalty: penalty });
    return { accepted: true, status: 'TERMINATED', agreementId: contract.agreementId, penalty: penalty };
  }
  function tradeBalance(country, partner, productId) {
    var c = canonical(country), p = canonical(partner);
    if (!c || !p || c === p) return { status: 'INVALID', countryId: c, partnerCountryId: p };
    var ledgers = [bucket(c, 'trade'), bucket(p, 'trade')], unique = new Map();
    ledgers.forEach(function (trade) {
      var rows = trade && trade.globalTradeLedger && trade.globalTradeLedger.settlements;
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        if (!row || id(row.status) !== 'SETTLED' || !row.settlementId) return;
        if (productId && token(row.resourceId) !== token(productId)) return;
        if (canonical(row.buyerCountryId) !== c && canonical(row.sellerCountryId) !== c) return;
        if (canonical(row.buyerCountryId) !== p && canonical(row.sellerCountryId) !== p) return;
        var key = String(row.settlementId);
        if (!unique.has(key)) unique.set(key, clone(row));
      });
    });
    var exports = 0, imports = 0, rows = [], years = {};
    unique.forEach(function (row) {
      var value = canonical(row.sellerCountryId) === c ? num(row.sellerValue) :
        canonical(row.buyerCountryId) === c ? num(row.buyerValue) : null;
      if (value === null) return;
      if (canonical(row.sellerCountryId) === c) exports += value;
      else if (canonical(row.buyerCountryId) === c) imports += value;
      var settledTurn = num(row.turn) === null ? turn() : num(row.turn);
      var currentDate = simulationDate();
      var settlementDate = currentDate ? new Date(currentDate.getTime() - Math.max(0, turn() - settledTurn) * 86400000) : null;
      var year = settlementDate && Number.isFinite(settlementDate.getTime()) ? settlementDate.getUTCFullYear() : Math.floor(settledTurn / 365) + 1;
      if (!years[year]) years[year] = { year: year, exports: 0, imports: 0, balance: 0, currency: tradeCurrency(c), yearBasis: settlementDate ? 'SIMULATION_CALENDAR_YEAR' : '365_DAY_SIMULATION_YEAR_FALLBACK' };
      if (canonical(row.sellerCountryId) === c) years[year].exports += value;
      else years[year].imports += value;
      rows.push({ settlementId: row.settlementId, requestId: row.requestId || null, resourceId: row.resourceId,
        quantity: num(row.quantity), turn: num(row.turn), direction: canonical(row.sellerCountryId) === c ? 'EXPORT' : 'IMPORT',
        value: value, currency: canonical(row.sellerCountryId) === c ? row.sellerCurrency || row.currency : row.buyerCurrency || row.currency });
    });
    var byYear = Object.keys(years).map(function (key) {
      var row = years[key]; return Object.assign({}, row, { balance: row.exports - row.imports });
    }).sort(function (a, b) { return a.year - b.year; });
    var contracts = contractList(c).filter(function (row) {
      return canonical(row.partnerCountryId) === p && ['ACTIVE', 'AT_RISK', 'RATIFICATION_PENDING'].includes(id(row.status));
    });
    var outstanding = contracts.reduce(function (sum, row) {
      var remaining = Math.max(0, (num(row.plannedDeliveryCount) || 0) - (num(row.completedDeliveries) || 0));
      return sum + remaining * (num(row.quantityPerDelivery) || 0);
    }, 0);
    return {
      status: 'OBSERVED_SETTLEMENTS_ONLY', countryId: c, partnerCountryId: p, currency: tradeCurrency(c),
      totalExportValue: exports, totalImportValue: imports, tradeBalance: exports - imports,
      tradePosition: exports > imports ? 'SURPLUS' : exports < imports ? 'DEFICIT' : 'BALANCED',
      settledTransactionCount: rows.length, settledRows: rows, annual: byYear,
      outstandingContractQuantity: outstanding,
      inTransitStatus: 'NOT_INFERRED_FROM_SETTLEMENT_LEDGER',
      source: 'DEDUPLICATED trade.globalTradeLedger.settlements; SETTLED ONLY'
    };
  }
  function globalTradeBalance(country) {
    var c = canonical(country), partners = new Map();
    if (!c) return { status: 'INVALID' };
    var own = bucket(c, 'trade'), rows = own && own.globalTradeLedger && own.globalTradeLedger.settlements;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || id(row.status) !== 'SETTLED') return;
      var partner = canonical(row.sellerCountryId) === c ? canonical(row.buyerCountryId) : canonical(row.sellerCountryId);
      if (!partner) return;
      var balance = tradeBalance(c, partner);
      partners.set(partner, balance);
    });
    var exportValue = 0, importValue = 0;
    partners.forEach(function (row) { exportValue += row.totalExportValue; importValue += row.totalImportValue; });
    return { status: 'OBSERVED_SETTLEMENTS_ONLY', countryId: c, currency: tradeCurrency(c),
      totalExportValue: exportValue, totalImportValue: importValue, tradeBalance: exportValue - importValue,
      partnerCount: partners.size, partners: Array.from(partners.values()) };
  }
  function diagnostics() {
    var scheduler = g.Omega && g.Omega.WorldSimulationScheduler || g.OmegaWorldSimulationScheduler;
    return { version: VERSION, handlersInstalled: installed.ready, handlersRegistered: installed.registered,
      handlerCount: installed.total, errors: clone(installed.errors), schedulerRegistered: typeof unregisterScheduler === 'function',
      scheduledTiers: ['PLAYER', 'ACTIVE', 'MACRO'], schedulerPriority: 70,
      onDemandMarketSync: true, maximumSnapshotAgeTurns: MAX_REPORT_AGE_TURNS,
      productCatalogAuthority: 'OMEGA_GLOBAL_MARKET.productCatalog', worldRosterScansOnTurn: false,
      schedulerAvailable: !!(scheduler && typeof scheduler.registerCountryHandler === 'function') };
  }
  function install() {
    var mesh = interop();
    if (!mesh || typeof mesh.registerCommandHandler !== 'function') {
      installed = { ready: false, registered: 0, total: 9, errors: ['MINISTRY_COMMAND_REGISTRY_UNAVAILABLE'] };
      return false;
    }
    var definitions = [
      ['OMEGA_BILATERAL_SYNC_MARKET', 'trade', syncHandler],
      ['OMEGA_BILATERAL_CREATE_PROPOSAL', 'trade', upsertProposalHandler('outbox')],
      ['OMEGA_BILATERAL_RECEIVE_PROPOSAL', 'trade', upsertProposalHandler('inbox')],
      ['OMEGA_BILATERAL_RECORD_REVIEW', 'trade', reviewRecordHandler],
      ['OMEGA_BILATERAL_APPLY_RESPONSE', 'trade', applyResponseHandler],
      ['OMEGA_BILATERAL_PUT_CONTRACT', 'trade', putContractHandler],
      ['OMEGA_BILATERAL_UPDATE_CONTRACT', 'trade', updateContractHandler],
      ['OMEGA_BILATERAL_RECORD_PENALTY_CLAIM', 'trade', penaltyClaimHandler],
      ['OMEGA_BILATERAL_RELATION_ADJUSTMENT', 'foreign', relationAdjustmentHandler]
    ];
    var report = { ready: false, registered: 0, total: definitions.length, errors: [] };
    definitions.forEach(function (row) {
      try {
        mesh.registerAction && mesh.registerAction(row[0], { actionId: row[0], stateOwnerMinistry: row[1], authority: 'OMEGA_BILATERAL_TRADE_AGREEMENT_V1' });
      } catch (_) {}
      try { mesh.registerCommandHandler(row[0], row[1], row[2]); report.registered++; }
      catch (error) { report.errors.push({ type: row[0], reason: String(error && error.message || error) }); }
    });
    installed = report;
    return report.ready = report.registered === report.total;
  }
  function installScheduler() {
    var scheduler = g.Omega && g.Omega.WorldSimulationScheduler || g.OmegaWorldSimulationScheduler;
    if (!scheduler || typeof scheduler.registerCountryHandler !== 'function') return false;
    if (unregisterScheduler) return true;
    unregisterScheduler = scheduler.registerCountryHandler('omega.bilateral-trade-agreement.country-runtime', processCountry,
      { tiers: ['PLAYER', 'ACTIVE', 'MACRO'], priority: 70 });
    return typeof unregisterScheduler === 'function';
  }
  function init() {
    install();
    installScheduler();
    if (!g.__omegaBilateralTradeAgreementHook) {
      g.__omegaBilateralTradeAgreementHook = true;
      g.addEventListener && g.addEventListener('OMEGA_READY', function () { install(); installScheduler(); });
      g.addEventListener && g.addEventListener('OMEGA_GAME_SESSION_STARTED', function () { install(); installScheduler(); });
    }
    return diagnostics();
  }

  var API = Object.freeze({
    VERSION: VERSION,
    diagnostics: diagnostics,
    syncMarket: syncMarket,
    getMarketReport: getMarketReport,
    previewProposal: previewProposal,
    createProposal: createProposal,
    acceptCounteroffer: acceptCounteroffer,
    renewContract: renewContract,
    terminateContract: terminateContract,
    recordTerminationConsent: recordTerminationConsent,
    processCountry: processCountry,
    evaluateProposal: publicEvaluateProposal,
    getProposals: function (country) {
      var trade = bucket(country, 'trade') || {};
      return { outbox: recordArray(trade, 'bilateralProposalOutbox'), inbox: recordArray(trade, 'bilateralProposalInbox') };
    },
    getContracts: function (country) { return recordArray(bucket(country, 'trade'), 'bilateralContracts'); },
    getBilateralTradeBalance: tradeBalance,
    getGlobalTradeBalance: globalTradeBalance
  });
  g.Omega = g.Omega || {};
  g.Omega.BilateralTradeAgreementV1 = API;
  g.OmegaBilateralTradeAgreementV1 = API;
  try { init(); } catch (error) { g.OmegaBilateralTradeAgreementV1Error = String(error && error.message || error); }
})(typeof window !== 'undefined' ? window : globalThis);
