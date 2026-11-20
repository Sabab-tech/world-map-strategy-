/* OMEGA UI v2 common ministry detail surface.
 * Domain values are surfaced only when a registered gateway/runtime record exists.
 */
(function (g) {
  'use strict';
  var DOMAIN_BY_MINISTRY = {
    trade:'trade', production:'economy', taxes:'economy', central_bank:'finance', laws:'justice',
    education:'education', infrastructure:'infrastructure', science_research:'technology',
    defense:'defense', foreign_affairs:'foreign', energy_mining:'resource',
    intelligence_cyber:'intelligence', agriculture_food:'agriculture', interior_security:'interior',
    health_welfare:'health', treasury_finance:'finance', mega_projects:'projects'
  };
  var SECTIONS = ['dashboard','operations','assets','budget','reports','market','settlement'];
  var SECTION_LABELS = { dashboard:'Dashboard', operations:'Operations / Programmes', assets:'People & Assets', budget:'Budget', reports:'Reports', market:'Global Commodity Market', settlement:'Trade Settlement' };
  var PHOTO_BY_MINISTRY = {
    interior_security:'bangladesh-police-headquarters', health_welfare:'chittagong-hospital',
    energy_mining:'open-pit-mine', production:'industrial-production-line',
    foreign_affairs:'un-assembly-building', agriculture_food:'wheat-field', infrastructure:'container-ship'
  };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function pickNumber(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function getMinistry(id) {
    var government = g.OmegaUIV2Government;
    var rows = government && typeof government.getMinistryRows === 'function' ? government.getMinistryRows() : [];
    for (var i = 0; i < rows.length; i += 1) if (rows[i].id === String(id)) return rows[i];
    return null;
  }
  function domainRecord(country, id) {
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    var domain = DOMAIN_BY_MINISTRY[id];
    if (!gateway || typeof gateway.getDomainRecord !== 'function' || !domain) return { ok:false, record:null, reason:'DOMAIN_SOURCE_GATEWAY_UNAVAILABLE', domain:domain || null };
    try { return gateway.getDomainRecord(country, domain); } catch (_) { return { ok:false, record:null, reason:'DOMAIN_RECORD_READ_FAILED', domain:domain }; }
  }
  function scalarRows(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
    return Object.keys(record).filter(function (key) {
      var value = record[key];
      return value === null || ['string','number','boolean'].indexOf(typeof value) >= 0;
    }).slice(0, 16).map(function (key) {
      var value = record[key];
      return { key:key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g,' '), value:value == null || value === '' ? 'Not recorded' : String(value) };
    });
  }
  function photo(id, alt) {
    var lib = g.OmegaUIPhotoAssets;
    var item = lib && typeof lib.get === 'function' ? lib.get(id) : null;
    var safeId = /^[a-z0-9-]+$/.test(String(id || '')) ? String(id) : '';
    var path = item && /^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path || ''))
      ? item.path : (safeId ? 'assets/ui-photos/' + safeId + '.webp' : '');
    if (!path) return '<div class="omega-v2-photo-placeholder" role="img" aria-label="' + esc(alt || 'Reference photo') + '">PHOTO UNAVAILABLE</div>';
    var caption = item && item.caption || alt || 'Reference photo';
    var credit = item && item.author && item.sourcePageUrl && item.licenseUrl
      ? '<small class="omega-v2-photo-credit">Photo: <a href="' + esc(item.sourcePageUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(item.author) + '</a> · <a href="' + esc(item.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(item.licenseShortName || 'License') + '</a></small>'
      : '';
    return '<figure class="omega-v2-photo"><img loading="lazy" decoding="async" width="1280" height="720" src="' + esc(path) + '" alt="' + esc(alt || caption) + '"><figcaption>' + esc(caption) + '<small>Reference only; imagery does not establish current ownership or operation.</small>' + credit + '</figcaption></figure>';
  }
  function safeVisualPath(value) {
    var path = String(value || '');
    return /^assets\/[a-zA-Z0-9_ .()\/-]+\.(?:webp|png|jpe?g|svg)$/i.test(path) && path.indexOf('..') < 0 ? path : '';
  }
  function ministryVisualMarkup(id, row) {
    var registry = g.OmegaUIV2MinistryVisualRegistry;
    var visual = registry && typeof registry.get === 'function' ? registry.get(id) : null;
    if (!visual) {
      var fallback = PHOTO_BY_MINISTRY[id];
      return fallback ? photo(fallback, (row && row.title || id) + ' reference image') : '';
    }
    function image(path, alt, className) {
      var safe = safeVisualPath(path);
      if (!safe) return '';
      return '<img class="' + className + '" loading="lazy" decoding="async" src="' + esc(safe) + '" alt="' + esc(alt || visual.title || id) + '">';
    }
    var cover = image(visual.image, visual.alt || visual.title || id, 'omega-v2-ministry-detail-cover-image');
    var gallery = Array.isArray(visual.gallery) ? visual.gallery.filter(function (path) { return !!safeVisualPath(path); }).slice(0, 4) : [];
    var galleryMarkup = gallery.map(function (path, index) {
      return '<figure class="omega-v2-ministry-detail-gallery-item">' +
        image(path, visual.title + ' additional reference ' + (index + 1), 'omega-v2-ministry-detail-gallery-image') +
        '<figcaption>Additional reference asset</figcaption></figure>';
    }).join('');
    if (!cover && !galleryMarkup) return '';
    return '<section class="omega-v2-ministry-visual" data-omega-v2-ministry-visual="' + esc(id) + '" aria-label="' + esc((visual.title || id) + ' visual profile') + '">' +
      (cover ? '<figure class="omega-v2-ministry-detail-cover">' + cover +
        '<figcaption><strong>' + esc(visual.title || row && row.title || id) + '</strong><small>' +
        esc(visual.alt || 'Local ministry reference image') +
        ' · Illustrative imagery, not proof of current ownership or activity</small></figcaption></figure>' : '') +
      (galleryMarkup ? '<div class="omega-v2-ministry-detail-gallery" aria-label="Additional ministry assets">' + galleryMarkup + '</div>' : '') +
      '</section>';
  }
  function relatedLinks(id, options, section) {
    if (id === 'trade') return '';
    var routes = {
      energy_mining:['resources','Open Mines & Fields'],
      production:['industry','Open Factories & Production'],
      interior_security:['home-affairs','Open Home Affairs'],
      treasury_finance:['economy','Open Economy & Treasury']
    };
    var route = routes[id];
    if (!route) return '';
    var enabled = options && typeof options.onNavigate === 'function';
    return '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-detail-navigate="' + esc(route[0]) + '"' + (enabled ? '' : ' disabled title="Navigation callback is unavailable."') + '>' + esc(route[1]) + '</button></div>';
  }

  function canonicalTradeCountry(value) {
    var raw = String(value || '').trim().toUpperCase();
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    try {
      var profile = runtime && typeof runtime.resolveCountry === 'function' ? runtime.resolveCountry(value) : null;
      var iso = String(profile && (profile.iso3 || profile.alpha3 || profile.countryCode) || '').trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(iso)) return iso;
    } catch (_) {}
    return /^[A-Z]{3}$/.test(raw) ? raw : raw;
  }
  function tradeStateRoot() {
    return g.Game && g.Game.state || g.gameState ||
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state || {};
  }
  function tradeCountryRecord(section, country) {
    var rows = tradeStateRoot()[section];
    if (!rows || typeof rows !== 'object') return null;
    var keys = [country];
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    try {
      var profile = runtime && runtime.resolveCountry ? runtime.resolveCountry(country) : null;
      [profile && profile.iso3, profile && profile.countryCode, profile && profile.name,
        profile && profile.economyKey, profile && profile.shortName].forEach(function (key) {
          if (key) keys.push(String(key).trim().toUpperCase());
        });
    } catch (_) {}
    for (var i = 0; i < keys.length; i += 1) {
      if (rows[keys[i]] && typeof rows[keys[i]] === 'object') return rows[keys[i]];
    }
    var aliases = keys.map(function (key) { return key.toUpperCase(); });
    var found = Object.keys(rows).find(function (key) {
      return aliases.indexOf(key.trim().toUpperCase()) >= 0;
    });
    return found ? rows[found] : null;
  }
  function finiteTradeNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function buildTradeSettlementModel(countryValue) {
    var country = canonicalTradeCountry(countryValue);
    if (!country) return { ok:false, countryId:null, turn:0, imports:[], exports:[], importTotalByCurrency:[], exportTotalByCurrency:[] };
    var root = tradeStateRoot();
    var simulation = root.simulation || {};
    var turn = Math.max(0, Math.floor(finiteTradeNumber(simulation.turn !== undefined ? simulation.turn : root.turn) || 0));
    var api = g.OmegaBilateralTradeAgreementV1 ||
      (g.Omega && g.Omega.BilateralTradeAgreementV1);
    var rawContracts = [];
    try {
      if (api && typeof api.getContracts === 'function') rawContracts = api.getContracts(country) || [];
      else {
        var ownTrade = tradeCountryRecord('trade', country) || {};
        rawContracts = Array.isArray(ownTrade.bilateralContracts) ? ownTrade.bilateralContracts : [];
      }
    } catch (_) { rawContracts = []; }
    if (!Array.isArray(rawContracts)) rawContracts = [];
    var seen = Object.create(null);
    var imports = [], exports = [];
    var terminal = ['EXPIRED','TERMINATED','RENEWED','CANCELLED','REJECTED','COMPLETED','CLOSED'];
    rawContracts.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var agreementId = String(raw.agreementId || raw.contractId || '').trim();
      if (!agreementId || seen[agreementId]) return;
      seen[agreementId] = true;
      var status = String(raw.status || 'UNKNOWN').trim().toUpperCase();
      if (terminal.indexOf(status) >= 0) return;
      var buyer = canonicalTradeCountry(raw.buyerCountryId || '');
      var seller = canonicalTradeCountry(raw.sellerCountryId || '');
      var role = String(raw.role || '').trim().toUpperCase();
      var direction = null;
      if (role === 'BUYER' || role === 'IMPORT') direction = 'IMPORT';
      else if (role === 'SELLER' || role === 'EXPORT') direction = 'EXPORT';
      else if (buyer === country) direction = 'IMPORT';
      else if (seller === country) direction = 'EXPORT';
      if (!direction) return;
      var oppositeCountry = direction === 'IMPORT' ? seller : buyer;
      var partnerId = String(raw.partnerCountryId || oppositeCountry || raw.counterpartyCountryId || '').trim().toUpperCase();
      if (partnerId === country) partnerId = String(oppositeCountry || raw.counterpartyCountryId || '').trim().toUpperCase();
      var planned = finiteTradeNumber(raw.plannedDeliveryCount);
      var completed = finiteTradeNumber(raw.completedDeliveries);
      var quantity = finiteTradeNumber(raw.quantityPerDelivery);
      var unitPrice = finiteTradeNumber(raw.unitPrice);
      var priceModel = String(raw.priceModel || '').trim().toUpperCase();
      var fixedPrice = (!priceModel || priceModel === 'FIXED') && unitPrice !== null && unitPrice >= 0;
      var totalValue = fixedPrice && planned !== null && quantity !== null
        ? planned * quantity * unitPrice : null;
      var remainingDeliveries = planned !== null && completed !== null
        ? Math.max(0, planned - completed) : null;
      var remainingValue = fixedPrice && remainingDeliveries !== null && quantity !== null
        ? remainingDeliveries * quantity * unitPrice : null;
      var startTurn = finiteTradeNumber(raw.startTurn);
      var endTurn = finiteTradeNumber(raw.endTurn);
      if (endTurn === null && startTurn !== null && finiteTradeNumber(raw.durationTurns) !== null) {
        endTurn = startTurn + finiteTradeNumber(raw.durationTurns);
      }
      var remainingTurns = endTurn === null ? null : Math.max(0, endTurn - turn);
      var localFinance = tradeCountryRecord('finance', country) || {};
      var localEconomy = tradeCountryRecord('economy', country) || {};
      var currency = String(raw.currency || raw.settlementCurrency || localFinance.currencyCode || localEconomy.currencyCode || localEconomy.currency_code || '').trim().toUpperCase() || 'Currency not recorded';
      var partnerName = partnerId;
      var countryRuntime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
      try {
        var partnerProfile = countryRuntime && countryRuntime.resolveCountry && countryRuntime.resolveCountry(partnerId);
        if (partnerProfile) partnerName = partnerProfile.name || partnerProfile.officialName || partnerProfile.shortName || partnerId;
      } catch (_) {}
      var item = {
        agreementId:agreementId, direction:direction, partnerCountryId:partnerId || null,
        partnerName:partnerName || 'Partner not recorded',
        productId:String(raw.resourceId || raw.productId || '').trim() || 'Product not recorded',
        quantityPerDelivery:quantity, unitPrice:unitPrice,
        currency:currency, priceModel:priceModel || 'FIXED',
        totalValue:totalValue, remainingValue:remainingValue,
        plannedDeliveryCount:planned, completedDeliveries:completed,
        remainingDeliveries:remainingDeliveries,
        nextDeliveryTurn:finiteTradeNumber(raw.nextDeliveryTurn),
        endTurn:endTurn, remainingTurns:remainingTurns,
        durationMonths:finiteTradeNumber(raw.durationMonths),
        intervalDays:finiteTradeNumber(raw.intervalDays),
        intervalTurns:finiteTradeNumber(raw.intervalTurns),
        status:status, raw:raw
      };
      (direction === 'IMPORT' ? imports : exports).push(item);
    });
    function sortRows(rows) {
      rows.sort(function (a,b) {
        var an = a.nextDeliveryTurn === null ? Number.MAX_SAFE_INTEGER : a.nextDeliveryTurn;
        var bn = b.nextDeliveryTurn === null ? Number.MAX_SAFE_INTEGER : b.nextDeliveryTurn;
        return an - bn || a.agreementId.localeCompare(b.agreementId);
      });
      var totals = Object.create(null);
      rows.forEach(function (row) {
        if (row.totalValue === null) return;
        totals[row.currency] = (totals[row.currency] || 0) + row.totalValue;
      });
      return Object.keys(totals).sort().map(function (currency) {
        return { currency:currency, value:totals[currency] };
      });
    }
    var importTotals = sortRows(imports);
    var exportTotals = sortRows(exports);
    return {
      ok:true, countryId:country, turn:turn,
      imports:imports, exports:exports,
      importTotalByCurrency:importTotals, exportTotalByCurrency:exportTotals,
      importCount:imports.length, exportCount:exports.length,
      activeCount:imports.length + exports.length,
      source:'Current country trade.bilateralContracts via OMEGA_BILATERAL_TRADE_AGREEMENT_V1'
    };
  }
  function contractMoney(value, currency) {
    return value === null || value === undefined ? 'Not recorded'
      : String(currency || '') + ' ' + new Intl.NumberFormat('en-US', { maximumFractionDigits:2 }).format(value);
  }
  function settlementTotalMarkup(rows, label) {
    if (!rows.length) return '<div class="omega-v2-empty">No fixed-value total is recorded for these agreements.</div>';
    return '<div class="omega-trade-total-list">' + rows.map(function (row) {
      return '<span><small>' + esc(label) + ' · ' + esc(row.currency) + '</small><strong>' +
        esc(contractMoney(row.value,row.currency)) + '</strong></span>';
    }).join('') + '</div>';
  }
  function contractCard(row) {
    var product = row.productId.replace(/[_-]+/g,' ').replace(/\b\w/g,function (ch) { return ch.toUpperCase(); });
    var pricing = row.totalValue === null
      ? (row.priceModel === 'MARKET_LINKED' || row.priceModel === 'INDEX_LINKED'
        ? 'Variable price · final value not fixed' : 'Total value not fully recorded')
      : contractMoney(row.totalValue,row.currency);
    var remaining = row.remainingValue === null ? 'Not recorded' : contractMoney(row.remainingValue,row.currency);
    var qty = row.quantityPerDelivery === null ? 'Not recorded' : numberTrade(row.quantityPerDelivery) + ' per delivery';
    var price = row.unitPrice === null ? 'Not recorded' : contractMoney(row.unitPrice,row.currency) + ' / unit';
    var delivery = row.completedDeliveries === null || row.plannedDeliveryCount === null
      ? 'Not recorded' : numberTrade(row.completedDeliveries) + ' / ' + numberTrade(row.plannedDeliveryCount);
    var next = row.nextDeliveryTurn === null ? 'Not recorded' : 'Turn ' + row.nextDeliveryTurn;
    var time = row.remainingTurns === null ? 'Not recorded' : row.remainingTurns + ' turn(s)';
    var statusLabel = row.status.replace(/[_-]+/g,' ');
    return '<article class="omega-trade-contract-card">' +
      '<div class="omega-trade-contract-head"><div><span class="omega-trade-contract-id">AGREEMENT · ' + esc(row.agreementId) + '</span>' +
        '<h3>' + esc(product) + '</h3><p>' + esc(row.direction === 'IMPORT' ? 'Import from ' : 'Export to ') +
        esc(row.partnerName) + (row.partnerCountryId ? ' · ' + esc(row.partnerCountryId) : '') + '</p></div>' +
        '<span class="omega-trade-contract-status" data-status="' + esc(row.status) + '">' + esc(statusLabel) + '</span></div>' +
      '<div class="omega-trade-contract-values"><div><small>' + esc(row.direction === 'IMPORT' ? 'Total agreement cost' : 'Total agreement income') + '</small><strong>' + esc(pricing) + '</strong></div>' +
        '<div><small>Remaining commitment</small><strong>' + esc(remaining) + '</strong></div></div>' +
      '<div class="omega-trade-contract-details">' +
        '<div><small>Quantity / delivery</small><strong>' + esc(qty) + '</strong></div>' +
        '<div><small>Agreed unit price</small><strong>' + esc(price) + '</strong></div>' +
        '<div><small>Deliveries complete</small><strong>' + esc(delivery) + '</strong></div>' +
        '<div><small>Next delivery</small><strong>' + esc(next) + '</strong></div>' +
        '<div><small>Time remaining</small><strong>' + esc(time) + '</strong></div>' +
        '<div><small>Delivery interval</small><strong>' + esc(row.intervalDays === null ? 'Not recorded' : row.intervalDays + ' days') + '</strong></div>' +
      '</div></article>';
  }
  function numberTrade(value) {
    try { return new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(value); }
    catch (_) { return String(value); }
  }
  function renderTradeSettlement(country, selectedTab) {
    var model = buildTradeSettlementModel(country);
    var tab = selectedTab === 'exports' ? 'exports' : 'imports';
    var rows = tab === 'imports' ? model.imports : model.exports;
    var totals = tab === 'imports' ? model.importTotalByCurrency : model.exportTotalByCurrency;
    var direction = tab === 'imports' ? 'Import' : 'Export';
    var totalLabel = tab === 'imports' ? 'Total contracted import cost' : 'Total contracted export income';
    return '<div class="omega-trade-settlement">' +
      '<div class="omega-trade-settlement-intro"><div><span>TRADE AGREEMENTS · TURN ' + esc(model.turn) + '</span>' +
        '<h2>Trade Settlement</h2><p>Country ' + esc(country) + ' · only the selected country’s agreement records are shown</p></div>' +
        '<span class="omega-trade-settlement-count">' + esc(model.activeCount) + ' active agreement(s)</span></div>' +
      '<div class="omega-trade-settlement-kpis"><div><small>Import agreements</small><strong>' + esc(model.importCount) + '</strong></div>' +
        '<div><small>Export agreements</small><strong>' + esc(model.exportCount) + '</strong></div>' +
        '<div><small>Current game turn</small><strong>' + esc(model.turn) + '</strong></div></div>' +
      '<div class="omega-trade-settlement-tabs" role="tablist" aria-label="Import and export agreements">' +
        '<button type="button" data-omega-v2-trade-settlement-tab="imports" aria-selected="' + (tab === 'imports' ? 'true' : 'false') + '">Imports · ' + esc(model.importCount) + '</button>' +
        '<button type="button" data-omega-v2-trade-settlement-tab="exports" aria-selected="' + (tab === 'exports' ? 'true' : 'false') + '">Exports · ' + esc(model.exportCount) + '</button></div>' +
      '<div class="omega-trade-settlement-summary"><span>' + esc(totalLabel) + '</span>' +
        settlementTotalMarkup(totals,direction) + '</div>' +
      (rows.length ? '<div class="omega-trade-contract-grid">' + rows.map(contractCard).join('') + '</div>' :
        '<div class="omega-v2-empty">No active ' + direction.toLowerCase() + ' agreement is recorded for this country.</div>') +
      '<p class="omega-trade-settlement-ownership">Agreements are future commitments. Actual cargo movement, payment and completed transactions remain in the existing Global Trade, Treasury and Transactions ledgers. This screen is read-only and does not repeat or alter settled transaction history.</p>' +
    '</div>';
  }
  function tradeDashboardMarkup(country) {
    // Reuse tiny SVG artwork that is already precached for offline sessions.
    var cover = 'assets/omega-global-market/market-header.svg';
    var marketImage = 'assets/omega-global-market/raw-mining.svg';
    var settlementImage = 'assets/omega-industrial-icons-v1/transport/cargo/general-cargo/ship.svg';
    function action(title, description, icon, section, marketTab, image, label, route) {
      var safe = safeVisualPath(image);
      return '<article class="omega-trade-action-card">' +
        (safe ? '<div class="omega-trade-action-media"><img loading="lazy" decoding="async" src="' + esc(safe) + '" alt="' + esc(title) + ' reference"></div>' : '') +
        '<div class="omega-trade-action-copy"><span class="omega-trade-action-icon">' + icon + '</span><div><h3>' + esc(title) +
        '</h3><p>' + esc(description) + '</p></div></div>' +
        '<button type="button" class="omega-v2-button omega-v2-button--primary" ' +
        (route ? 'data-omega-v2-detail-navigate="' + esc(route) + '"' :
          'data-omega-v2-ministry-section="' + esc(section) + '" data-omega-v2-trade-market-tab="' + esc(marketTab || 'commodities') + '"') +
        '>' + esc(label) + ' <span aria-hidden="true">›</span></button></article>';
    }
    var commodityIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-2-5H5L3 9Zm2 0v11h14V9M9 20v-6h6v6"/></svg>';
    var blackIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3M9 11v5M15 11v5"/></svg>';
    var transactionIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15l-3-3M20 17H5l3 3M4 7v4M20 13v4"/></svg>';
    var settlementIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h18M5 8l1 11h12l1-11M8 8V5h8v3M8 13h8M12 11v4"/></svg>';
    return '<div class="omega-trade-dashboard">' +
      '<div class="omega-trade-dashboard-hero"><img loading="lazy" decoding="async" src="' + esc(cover) + '" alt="International container port">' +
        '<div><span>TRADE & COMMERCE</span><h2>National trade control</h2><p>Manage market access, bilateral commitments and the records of completed trade.</p></div></div>' +
      '<div class="omega-trade-dashboard-grid">' +
        action('Commodity Market','Browse offers, buy or sell existing commodities',commodityIcon,'market','commodities',marketImage,'Open market') +
        action('Black Market','Restricted and shadow-market operations',blackIcon,'market','black-market','','Open black market') +
        action('Transactions','Review existing financial transaction records',transactionIcon,'','','','Open transactions','treasury_finance') +
        action('Trade Settlement','Review bilateral import and export agreements',settlementIcon,'settlement','','','Open agreements') +
      '</div>' +
      '<div class="omega-trade-dashboard-gallery">' +
        (marketImage ? '<img loading="lazy" decoding="async" src="' + esc(marketImage) + '" alt="Trade market reference image">' : '') +
        (settlementImage ? '<img loading="lazy" decoding="async" src="' + esc(settlementImage) + '" alt="Global trade network reference image">' : '') +
      '</div>' +
      '<p class="omega-trade-dashboard-note">Completed payments and deliveries are recorded by the existing trade and finance systems. Agreements shown under Trade Settlement are commitments, not completed sales.</p>' +
    '</div>';
  }

  function operationalCoverageCard(id) {
    return '<article class="omega-v2-card omega-v2-operational-console-card">' +
      '<h2 class="omega-v2-card-title">Operational coverage</h2>' +
      '<p class="omega-v2-card-meta">This ministry is displayed inside UI v2. Legacy screen navigation is disconnected; only actions implemented in the current screen are enabled.</p>' +
      '<div class="omega-v2-status" data-state="attention">V2 CONTROLS ONLY</div></article>';
  }
  function scheduleRender(root, options, label) {
    options = options || {};
    var scheduler = options.onScheduleRender;
    if (typeof scheduler === 'function') {
      return scheduler(function () { return render(root, options); }, label || 'Updating this section', root);
    }
    return render(root, options);
  }

  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'MINISTRY_DETAIL_ROOT_REQUIRED' };
    var id = String(options.ministryId || '').trim();
    var country = String(options.countryId || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '').trim().toUpperCase();
    var row = getMinistry(id);
    var domain = domainRecord(country, id);
    var allowedSections = id === 'trade' ? ['dashboard','settlement','market'] : SECTIONS.filter(function (key) { return key !== 'market' && key !== 'settlement'; });
    var section = allowedSections.indexOf(options.section) >= 0 ? options.section : 'dashboard';
    var marketTab = options.marketTab === 'black-market' ? 'black-market' : 'commodities';
    var rawRows = scalarRows(domain && domain.record);
    var categories = options.sectionData && Array.isArray(options.sectionData[section]) ? options.sectionData[section] : null;
    var content;
    if (!row) {
      content = '<div class="omega-v2-empty">The selected ID is not present in the current ministry directory. No substitute ministry was created.</div>';
    } else if (id === 'trade' && section === 'dashboard') {
      content = tradeDashboardMarkup(country);
    } else if (id === 'trade' && section === 'settlement') {
      content = renderTradeSettlement(country, options.settlementTab);
    } else if (id === 'trade' && section === 'market') {
      content = '<div class="omega-v2-trade-market-host" data-omega-v2-trade-market-host aria-label="Global Commodity Market"></div>';
    } else if (!domain || !domain.record) {
      content = '<div class="omega-v2-empty">No usable country-domain record is registered for this section yet. Use the owning runtime or source coverage report to see which data is missing.</div>';
    } else if (categories) {
      content = '<div class="omega-v2-grid">' + categories.map(function (item) {
        return '<div class="omega-v2-card"><div class="omega-v2-card-title">' + esc(item.label || item.key || 'Recorded field') + '</div><div class="omega-v2-card-meta">' + esc(item.value == null ? 'Not recorded' : item.value) + '</div></div>';
      }).join('') + '</div>';
    } else {
      content = '<div class="omega-v2-card"><div class="omega-v2-card-header"><div><h2 class="omega-v2-card-title">Registered domain record</h2><p class="omega-v2-card-meta">Domain: ' + esc(domain.domain || DOMAIN_BY_MINISTRY[id] || 'Not recorded') + '</p></div><span class="omega-v2-status" data-state="operational">' + esc(domain.authority || 'RECORD AVAILABLE') + '</span></div>' +
        '<p class="omega-v2-card-meta">Source: ' + esc(domain.sourceId || 'Not recorded') + '</p>' +
        (rawRows.length ? '<div class="omega-v2-vehicle-stats">' + rawRows.map(function (item) { return '<div><span>' + esc(item.key) + '</span><strong>' + esc(item.value) + '</strong></div>'; }).join('') + '</div>' : '<p class="omega-v2-card-meta">The registered domain record contains no scalar fields suitable for this overview.</p>') + '</div>';
    }
    root.classList.add('omega-v2-screen');
    var visualRegistry = g.OmegaUIV2MinistryVisualRegistry;
    var visual = visualRegistry && typeof visualRegistry.get === 'function' ? visualRegistry.get(id) : null;
    var visualLogo = visual && safeVisualPath(visual.logo);
    var emblem = visualLogo
      ? '<img class="omega-v2-ministry-detail-logo" loading="lazy" decoding="async" src="' + esc(visualLogo) + '" alt="' + esc(visual.logoAlt || visual.title || id) + '">'
      : (row && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.ministryEmblem === 'function' ? g.OmegaUIV2Government.ministryEmblem(row) : '');
    var activeMinisterName = row && row.ministerName || 'Minister not recorded';
    var portraitSlot = row && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.renderMinisterPortrait === 'function' ? g.OmegaUIV2Government.renderMinisterPortrait(row) : '';
    var visibleSections = allowedSections;
    if (id === 'trade' && section === 'market') {
      root.innerHTML = '<style>.omega-v2-trade-market-page{width:100%;max-width:none!important;min-width:0;box-sizing:border-box}' +
        '.omega-v2-trade-market-tabs{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}' +
        '.omega-v2-trade-market-tabs button{min-height:36px;padding:7px 13px;border:1px solid rgba(92,164,207,.45);border-radius:8px;background:linear-gradient(145deg,#102c47,#081a30);color:#cfe8f8;font:inherit;font-size:11px;font-weight:800}' +
        '.omega-v2-trade-market-tabs button[aria-current="page"]{border-color:#29c9ff;background:linear-gradient(145deg,#0c5274,#0a2947);color:#effaff;box-shadow:inset 0 1px rgba(255,255,255,.12),0 0 12px rgba(32,180,240,.16)}' +
        '.omega-v2-trade-market-tabs button:disabled{opacity:.52;cursor:not-allowed;border-style:dashed}' +
        '@media(max-width:560px){.omega-v2-trade-market-tabs button{flex:1;min-width:0}}</style>' +
        '<section class="omega-v2-shell omega-v2-ministry-detail omega-v2-trade-market-page">' +
        '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">TRADE & COMMERCE</div><h1 class="omega-v2-title">' + (marketTab === 'black-market' ? 'Black Market' : 'Market Commodities') + '</h1>' +
        '<p class="omega-v2-subtitle">' + (marketTab === 'black-market' ? 'Shadow commerce, restricted supply, tariff arbitrage and evidence-based exposure.' : 'Raw resources, factory products, food products, international offers and recorded prices.') + '</p></div>' +
        '<button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-ministry-section="dashboard">Back to Trade & Commerce</button></header>' +
        '<nav class="omega-v2-trade-market-tabs" aria-label="Trade market sections">' +
        '<button type="button" aria-current="' + (marketTab === 'commodities' ? 'page' : 'false') + '" data-omega-v2-trade-market-tab="commodities">Market Commodities</button>' +
        '<button type="button" aria-current="' + (marketTab === 'black-market' ? 'page' : 'false') + '" data-omega-v2-trade-market-tab="black-market">Black Market</button></nav>' +
        (marketTab === 'black-market' ? '<div class="omega-v2-trade-market-host" data-omega-v2-black-market-host aria-label="Black Market"></div>' : '<div class="omega-v2-trade-market-host" data-omega-v2-trade-market-host aria-label="Market Commodities"></div>') + '</section>';
    } else {
      root.innerHTML = '<section class="omega-v2-shell omega-v2-ministry-detail">' +
        '<header class="omega-v2-heading"><div class="omega-v2-ministry-detail-mark">' + emblem + '<div><div class="omega-v2-eyebrow">ALL MINISTRIES · ' + esc(id.replace(/[_-]+/g,' ').toUpperCase()) + '</div><h1 class="omega-v2-title">' + esc(row ? row.title : id || 'Ministry') + '</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · registered ministry profile and source-backed domain record</p></div></div><span class="omega-v2-status" data-state="' + (domain && domain.record ? 'operational' : 'unknown') + '">' + (domain && domain.record ? 'DOMAIN RECORD AVAILABLE' : esc(domain.reason || 'DOMAIN RECORD NOT RECORDED')) + '</span></header>' +
        '<div class="omega-v2-card omega-v2-ministry-appointed-minister"><h2 class="omega-v2-card-title">Minister</h2><div class="omega-v2-minister-table-person">' + (portraitSlot || '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot><span class="omega-v2-minister-portrait-placeholder">MINISTER PORTRAIT</span><small>Image pending</small></div>') + '<strong>' + esc(activeMinisterName) + '</strong></div></div>' +
        (id === 'trade' ? '' : ministryVisualMarkup(id, row)) +
        '<div class="omega-v2-filterbar" role="group" aria-label="Ministry page sections">' + visibleSections.map(function (key) { return '<button type="button" class="omega-v2-button ' + (section === key ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-ministry-section="' + key + '" aria-pressed="' + (section === key ? 'true' : 'false') + '">' + esc(SECTION_LABELS[key]) + '</button>'; }).join('') + '</div>' +
        relatedLinks(id, options, section) +
        '<div class="omega-v2-section-title">' + esc(SECTION_LABELS[section]) + '</div>' + content +
        '<p class="omega-v2-source">The current panel is read-only. Procurement, recruitment, resource transfers and project execution must route through an authoritative handler and display a result only after game state confirms it.</p></section>';
    }
    if (!root.__omegaV2MinistryDetailBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-ministry-section]');
        if (tab && root.contains(tab)) {
          var current = root.__omegaV2MinistryDetailOptions || {};
          var nextSection = tab.getAttribute('data-omega-v2-ministry-section');
          var nextMarketTab = tab.getAttribute('data-omega-v2-trade-market-tab');
          scheduleRender(root, Object.assign({}, current, {
            section:nextSection,
            marketTab:nextMarketTab === 'black-market' ? 'black-market' : (nextSection === 'market' ? 'commodities' : current.marketTab)
          }));
          return;
        }
        var settlementTabButton = target.closest('[data-omega-v2-trade-settlement-tab]');
        if (settlementTabButton && root.contains(settlementTabButton)) {
          var settlementOptions = root.__omegaV2MinistryDetailOptions || {};
          scheduleRender(root, Object.assign({}, settlementOptions, { section:'settlement', settlementTab:settlementTabButton.getAttribute('data-omega-v2-trade-settlement-tab') }), 'Opening ' + (settlementTabButton.getAttribute('data-omega-v2-trade-settlement-tab') === 'exports' ? 'Export' : 'Import') + ' agreements');
          return;
        }
        var marketTabButton = target.closest('[data-omega-v2-trade-market-tab]');
        if (marketTabButton && root.contains(marketTabButton)) {
          var marketOptions = root.__omegaV2MinistryDetailOptions || {};
          scheduleRender(root, Object.assign({}, marketOptions, { section:'market', marketTab:marketTabButton.getAttribute('data-omega-v2-trade-market-tab') }), 'Opening ' + (marketTabButton.getAttribute('data-omega-v2-trade-market-tab') === 'black-market' ? 'Black Market' : 'Market Commodities'));
          return;
        }
        var route = target.closest('[data-omega-v2-detail-navigate]');
        if (route && root.contains(route) && !route.disabled) {
          var opts = root.__omegaV2MinistryDetailOptions || {};
          if (typeof opts.onNavigate === 'function') opts.onNavigate(route.getAttribute('data-omega-v2-detail-navigate'));
        }
      });
      root.__omegaV2MinistryDetailBound = true;
    }
    root.__omegaV2MinistryDetailOptions = options;
    var marketMounted = false;
    if (id === 'trade' && section === 'market') {
      if (marketTab === 'black-market') {
        var blackHost = typeof root.querySelector === 'function' ? root.querySelector('[data-omega-v2-black-market-host]') : null;
        var blackUI = g.OmegaBlackMarketUI || (g.Omega && g.Omega.BlackMarketUI);
        if (blackHost && blackUI && typeof blackUI.render === 'function') {
          var blackResult = blackUI.render(blackHost, country); marketMounted = !!(blackResult && blackResult.ok !== false);
          if (!marketMounted) blackHost.textContent = 'Black Market is unavailable until its runtime dependencies are ready.';
        } else if (blackHost) blackHost.textContent = 'Black Market runtime is unavailable in this session.';
      } else {
        var marketHost = typeof root.querySelector === 'function' ? root.querySelector('[data-omega-v2-trade-market-host]') : null;
        var marketUI = g.OmegaResourceCommandCenterUI || (g.Omega && g.Omega.ResourceCommandCenterUI);
        if (marketHost && marketUI && typeof marketUI.renderMarketDashboard === 'function') {
          var mountResult = marketUI.renderMarketDashboard(marketHost, country, { onClose:function () { var current = root.__omegaV2MinistryDetailOptions || options; scheduleRender(root, Object.assign({}, current, { section:'dashboard' }), 'Returning to Trade & Commerce'); } });
          marketMounted = !!(mountResult && mountResult.ok !== false);
          if (!marketMounted) marketHost.textContent = 'The Global Commodity Market could not be mounted. The market runtime and settlement records remain unchanged.';
        } else if (marketHost) marketHost.textContent = 'The Global Commodity Market UI is unavailable in this session.';
      }
    }
    return { ok:true, ministryId:id, countryId:country || null, section:section,
      domainRecordAvailable:!!(domain && domain.record), marketMounted:marketMounted };
  }
  g.OmegaUIV2MinistryDetail = Object.freeze({ version:'2.0.0', render:render, getMinistry:getMinistry, getDomainRecord:domainRecord, buildTradeSettlementModel:buildTradeSettlementModel });
})(typeof window !== 'undefined' ? window : globalThis);
