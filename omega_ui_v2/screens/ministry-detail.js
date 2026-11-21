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

  function tradeRegistryCompatibilityMarkup() {
    var registry = g.OmegaUIV2MinistryVisualRegistry;
    var visual = registry && typeof registry.get === 'function' ? registry.get('trade') : null;
    if (!visual) return '';
    // Keep legacy registry URLs discoverable, but fetch only a pre-cached SVG.
    var refs = [visual.image].concat(Array.isArray(visual.gallery) ? visual.gallery : [])
      .filter(function (path) { return !!safeVisualPath(path); })
      .map(function (path) { return '<span data-reference-image="' + esc(path) + '" hidden></span>'; }).join('');
    return '<section class="omega-v2-ministry-visual" data-omega-v2-ministry-visual="trade" aria-label="Trade & Commerce visual profile">' +
      refs +
      '<img class="omega-v2-ministry-detail-cover-image" loading="lazy" decoding="async" src="assets/omega-global-market/market-header.svg" alt="Local Trade and Commerce illustration">' +
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
    if (!country) return { ok:false, countryId:null, turn:0, imports:[], exports:[], importTotalByCurrency:[], exportTotalByCurrency:[], openCount:0 };
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
        startTurn:startTurn,
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
      openCount:imports.length + exports.length,
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
  function tradeCountryFlag(value) {
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    var flag = null;
    try {
      if (runtime && typeof runtime.flagFor === 'function') flag = runtime.flagFor(value);
    } catch (_) {}
    if (flag) return String(flag);
    var profile = null;
    try {
      if (runtime && typeof runtime.resolveCountry === 'function') profile = runtime.resolveCountry(value);
    } catch (_) {}
    var code = String(profile && (profile.countryCode || profile.iso2 || profile.cca2 || profile.alpha2) || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code)
      ? Array.from(code,function (letter) { return String.fromCodePoint(0x1F1E6 + letter.charCodeAt(0) - 65); }).join('')
      : '🏳️';
  }
  function contractCard(row) {
    var raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    var product = String(row.productId || 'Product not recorded')
      .replace(/[_-]+/g,' ')
      .replace(/\b\w/g,function (ch) { return ch.toUpperCase(); });
    var partnerRole = row.direction === 'IMPORT' ? 'SELLER' : 'BUYER';
    var flag = tradeCountryFlag(row.partnerCountryId);
    var quantity = finiteTradeNumber(row.quantityPerDelivery);
    var deliveries = finiteTradeNumber(row.plannedDeliveryCount);
    var amount = quantity !== null && deliveries !== null
      ? quantity * deliveries
      : finiteTradeNumber(raw.totalQuantity !== undefined ? raw.totalQuantity
        : raw.totalAmount !== undefined ? raw.totalAmount
        : raw.amount !== undefined ? raw.amount : raw.quantity);
    var unit = String(raw.quantityUnit || raw.unitOfMeasure || raw.unit || '').trim();
    var amountText = amount === null ? 'Not recorded' : numberTrade(amount) + (unit ? ' ' + unit : '');
    var amountDetails = [];
    if (quantity !== null) amountDetails.push(numberTrade(quantity) + ' per delivery');
    if (deliveries !== null) amountDetails.push(numberTrade(deliveries) + ' planned');
    if (row.completedDeliveries !== null) amountDetails.push(numberTrade(row.completedDeliveries) + ' completed');
    var value = row.remainingValue !== null ? row.remainingValue : row.totalValue;
    var valueText = value !== null
      ? contractMoney(value,row.currency)
      : (row.priceModel === 'MARKET_LINKED' || row.priceModel === 'INDEX_LINKED'
        ? 'Market-linked' : 'Not recorded');
    var valueNote = row.remainingValue !== null ? 'Remaining commitment'
      : row.totalValue !== null ? 'Full agreement value'
      : (row.priceModel === 'MARKET_LINKED' || row.priceModel === 'INDEX_LINKED'
        ? 'Final value follows market terms' : 'Price not recorded');
    var validityText = row.remainingTurns !== null ? numberTrade(row.remainingTurns) + ' turns left'
      : row.endTurn !== null ? 'Until Turn ' + numberTrade(row.endTurn)
      : row.durationMonths !== null ? numberTrade(row.durationMonths) + ' months'
      : 'Not recorded';
    var validityNote = row.startTurn !== null && row.endTurn !== null
      ? 'Turn ' + numberTrade(row.startTurn) + ' → ' + numberTrade(row.endTurn)
      : row.endTurn !== null ? 'Expires at Turn ' + numberTrade(row.endTurn)
      : 'Validity period not recorded';
    var statusLabel = String(row.status || 'UNKNOWN').replace(/[_-]+/g,' ');
    return '<article class="omega-trade-contract-card omega-trade-agreement-card" data-direction="' + esc(row.direction) +
      '" data-partner-country="' + esc(row.partnerCountryId || 'UNKNOWN') + '">' +
      '<div class="omega-trade-contract-head omega-trade-agreement-head">' +
        '<div class="omega-trade-agreement-product"><span class="omega-trade-agreement-kicker">PRODUCT</span>' +
          '<h3>' + esc(product) + '</h3><small class="omega-trade-contract-id">AGREEMENT · ' + esc(row.agreementId) + '</small></div>' +
        '<div class="omega-trade-agreement-partner"><small>' + partnerRole + '</small><strong><span class="omega-trade-country-flag" aria-label="' +
          esc(row.partnerName || 'Partner country') + ' flag">' + esc(flag) + '</span><span>' +
          esc(row.partnerName || 'Partner not recorded') + '</span></strong><small>' + esc(row.partnerCountryId || 'Country not recorded') + '</small></div>' +
      '</div>' +
      '<div class="omega-trade-contract-values omega-trade-agreement-values">' +
        '<div class="omega-trade-agreement-metric omega-trade-agreement-amount"><small>AMOUNT</small><strong>' + esc(amountText) +
          '</strong><span>' + esc(amountDetails.join(' · ') || 'Quantity not fully recorded') + '</span></div>' +
        '<div class="omega-trade-agreement-metric omega-trade-agreement-value"><small>' +
          (row.direction === 'IMPORT' ? 'COST' : 'INCOME') + '</small><strong>' + esc(valueText) +
          '</strong><span>' + esc(valueNote) + '</span></div>' +
        '<div class="omega-trade-agreement-metric omega-trade-agreement-validity"><small>VALIDITY</small><strong>' +
          esc(validityText) + '</strong><span>' + esc(validityNote) + '</span></div>' +
      '</div>' +
      '<div class="omega-trade-agreement-foot"><span class="omega-trade-contract-status" data-status="' + esc(row.status) + '">' +
        esc(statusLabel) + '</span><span class="omega-trade-agreement-direction">' +
        (row.direction === 'IMPORT' ? 'IMPORT AGREEMENT' : 'EXPORT AGREEMENT') + '</span></div>' +
    '</article>';
  }
  function tradePartnerGroupsMarkup(rows) {
    if (!rows.length) return '<div class="omega-v2-empty">No active bilateral agreement is recorded by partner country.</div>';
    var groups = Object.create(null);
    rows.forEach(function (row) {
      var key = String(row.partnerCountryId || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    var entries = Object.keys(groups).map(function (key) {
      var items = groups[key];
      var first = items[0] || {};
      var imports = items.filter(function (row) { return row.direction === 'IMPORT'; }).length;
      var exports = items.length - imports;
      return {
        key:key, rows:items, name:String(first.partnerName || 'Partner not recorded'),
        flag:tradeCountryFlag(key), imports:imports, exports:exports
      };
    }).sort(function (a,b) { return a.name.localeCompare(b.name); });
    return '<section class="omega-trade-country-agreements" data-omega-trade-country-agreements>' +
      '<div class="omega-trade-country-heading"><div><span>COUNTRY-BY-COUNTRY PORTFOLIO</span>' +
        '<h3>Bilateral agreements</h3><p>Expand a country to review every active import and export agreement with that partner.</p></div>' +
        '<span class="omega-trade-country-total">' + numberTrade(rows.length) + ' TOTAL</span></div>' +
      '<div class="omega-trade-country-groups">' + entries.map(function (entry) {
        return '<details class="omega-trade-country-group" data-partner-country="' + esc(entry.key) + '">' +
          '<summary><span class="omega-trade-country-group-flag">' + esc(entry.flag) + '</span>' +
            '<span class="omega-trade-country-group-copy"><strong>' + esc(entry.name) + '</strong>' +
              '<small>' + esc(entry.key) + ' · ' + numberTrade(entry.imports) + ' import · ' +
                numberTrade(entry.exports) + ' export</small></span>' +
            '<span class="omega-trade-country-group-count">' + numberTrade(entry.rows.length) + '</span>' +
            '<span class="omega-trade-country-chevron" aria-hidden="true">⌄</span></summary>' +
          '<div class="omega-trade-country-group-body">' + entry.rows.map(contractCard).join('') + '</div>' +
        '</details>';
      }).join('') + '</div></section>';
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
    var allAgreements = model.imports.concat(model.exports);
    return '<div class="omega-trade-settlement" data-omega-trade-settlement-view="true">' +
      '<div class="omega-trade-settlement-intro"><div><span>TRADE AGREEMENTS · TURN ' + esc(model.turn) + '</span>' +
        '<h2>Trade Settlement</h2><p>' + esc(country) + ' · current bilateral commitments</p></div>' +
        '<span class="omega-trade-settlement-count">' + esc(model.openCount) + ' open agreement(s)</span></div>' +
      '<div class="omega-trade-settlement-kpis">' +
        '<div><small>Import agreements</small><strong>' + esc(model.importCount) + '</strong></div>' +
        '<div><small>Export agreements</small><strong>' + esc(model.exportCount) + '</strong></div>' +
        '<div><small>Current game turn</small><strong>' + esc(model.turn) + '</strong></div></div>' +
      '<div class="omega-trade-settlement-tabs" role="tablist" aria-label="Import and export agreements">' +
        '<button type="button" data-omega-v2-trade-settlement-tab="imports" aria-selected="' +
          (tab === 'imports' ? 'true' : 'false') + '">IMPORT · ' + esc(model.importCount) + '</button>' +
        '<button type="button" data-omega-v2-trade-settlement-tab="exports" aria-selected="' +
          (tab === 'exports' ? 'true' : 'false') + '">EXPORT · ' + esc(model.exportCount) + '</button></div>' +
      '<div class="omega-trade-settlement-summary"><span>' + esc(totalLabel) + '</span>' +
        settlementTotalMarkup(totals,direction) + '</div>' +
      '<section class="omega-trade-agreement-ledger" data-omega-trade-primary-list="' + tab + '">' +
        '<div class="omega-trade-agreement-ledger-heading"><div><span>ACTIVE COMMITMENTS</span>' +
          '<h3>' + direction + ' agreements</h3></div><small>' + numberTrade(rows.length) + ' RECORD(S)</small></div>' +
        (rows.length ? '<div class="omega-trade-contract-grid">' + rows.map(contractCard).join('') + '</div>' :
          '<div class="omega-v2-empty">No active ' + direction.toLowerCase() + ' agreement is recorded for this country.</div>') +
      '</section>' +
      tradePartnerGroupsMarkup(allAgreements) +
      '<p class="omega-trade-settlement-ownership">Agreements are future commitments. Actual cargo movement, payment and completed transactions remain in the existing Global Trade, Treasury and Transactions ledgers. This screen is read-only and does not repeat or alter settled transaction history.</p>' +
    '</div>';
  }

  function tradeCommandIconMarkup(kind) {
    var prefix = 'omega-trade-' + String(kind || 'overview').replace(/[^a-z0-9-]/gi,'');
    var accent = {
      overview:'#62dfff', commodities:'#ffc979', settlement:'#63e4bb',
      transactions:'#8bbaff', 'black-market':'#d49aff'
    }[kind] || '#62dfff';
    var defs = '<defs>' +
      '<linearGradient id="' + prefix + '-steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0fbff"/><stop offset=".32" stop-color="#78badc"/><stop offset=".68" stop-color="#28658f"/><stop offset="1" stop-color="#102e50"/></linearGradient>' +
      '<linearGradient id="' + prefix + '-cyan" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#dbfbff"/><stop offset=".35" stop-color="#55d8f4"/><stop offset=".72" stop-color="#1689bf"/><stop offset="1" stop-color="#075078"/></linearGradient>' +
      '<linearGradient id="' + prefix + '-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1bb"/><stop offset=".42" stop-color="#f4bf66"/><stop offset="1" stop-color="#99551f"/></linearGradient>' +
      '<linearGradient id="' + prefix + '-dark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#354b70"/><stop offset=".45" stop-color="#172d4c"/><stop offset="1" stop-color="#07182d"/></linearGradient>' +
      '<linearGradient id="' + prefix + '-rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f1fbff"/><stop offset=".2" stop-color="' + accent + '"/><stop offset=".58" stop-color="#286b91"/><stop offset="1" stop-color="#061527"/></linearGradient>' +
      '<radialGradient id="' + prefix + '-glow" cx=".34" cy=".2" r=".8"><stop stop-color="#ffffff" stop-opacity=".72"/><stop offset=".25" stop-color="#8ceaff" stop-opacity=".18"/><stop offset="1" stop-color="#0a2845" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + prefix + '-shadow" x="-35%" y="-35%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.8"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".55"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>';
    var art = {
      overview:
        '<g filter="url(#' + prefix + '-shadow)"><circle cx="31" cy="27" r="18.5" fill="url(#' + prefix + '-steel)" stroke="#d3f4ff" stroke-width="1.3"/><path d="M16 22Q31 9 46 22L47 32Q31 44 15 32Z" fill="url(#' + prefix + '-cyan)" opacity=".92"/><path d="M31 9C23 17 22 35 31 45M31 9C39 17 40 35 31 45M13 27h36M17 18q14 8 28 0M17 36q14-8 28 0" fill="none" stroke="#e0faff" stroke-width="1.25" opacity=".88"/><ellipse cx="31" cy="27" rx="24" ry="10" transform="rotate(-27 31 27)" fill="none" stroke="url(#' + prefix + '-gold)" stroke-width="2.2"/><path d="m48 11 4 1-2 4" fill="none" stroke="#fff0b5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="17" r="2.8" fill="url(#' + prefix + '-gold)" stroke="#fff0c5"/></g><ellipse cx="21" cy="14" rx="10" ry="4" fill="url(#' + prefix + '-glow)"/>',
      commodities:
        '<g filter="url(#' + prefix + '-shadow)" stroke-linejoin="round"><path d="m9 25 15-9 15 7-15 9Z" fill="url(#' + prefix + '-steel)" stroke="#d4f3ff" stroke-width="1"/><path d="m9 25 15 7v18L9 42Z" fill="url(#' + prefix + '-dark)" stroke="#6ea8ca"/><path d="m24 32 15-9v19l-15 8Z" fill="url(#' + prefix + '-cyan)" stroke="#9ceaff"/><path d="m28 16 13-8 14 7-14 8Z" fill="url(#' + prefix + '-gold)" stroke="#fff0c3"/><path d="m28 16 13 7v17l-13-7Z" fill="#98612f" stroke="#f7d49b"/><path d="m41 23 14-8v18l-14 7Z" fill="#c78a43" stroke="#ffe2ad"/><path d="M13 27v13m4-11v14m11-8v12m4-13v11m12-16v12m4-15v12" stroke="#e8f9ff" stroke-width="1" opacity=".72"/><path d="M9 42 24 50l15-8 16-10" fill="none" stroke="#66def6" stroke-width="1.4"/></g><path d="m13 25 11-7 11 6" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.4"/>',
      "black-market":
        '<g filter="url(#' + prefix + '-shadow)" stroke-linejoin="round"><path d="m11 17 24-9 20 8-24 10Z" fill="url(#' + prefix + '-steel)" stroke="#b6d8ee"/><path d="m11 17 20 9v26L11 42Z" fill="url(#' + prefix + '-dark)" stroke="#4a779b"/><path d="m31 26 24-10v26L31 52Z" fill="#102642" stroke="#5a8db5"/><path d="m17 22 14-6 15 6-15 6Z" fill="url(#' + prefix + '-gold)" stroke="#ffebba"/><path d="m17 22 14 6v17l-14-7Z" fill="#a66e37" stroke="#ffdc9e"/><path d="m31 28 15-6v17l-15 6Z" fill="#7b4f2c" stroke="#d9a96b"/><circle cx="31" cy="35" r="10" fill="url(#' + prefix + '-steel)" stroke="#d8f5ff" stroke-width="1.8"/><circle cx="31" cy="35" r="6.6" fill="url(#' + prefix + '-dark)" stroke="#61c8eb" stroke-width="1.5"/><path d="M31 31v8m-3-4h6" stroke="#f7d995" stroke-width="2.2" stroke-linecap="round"/><path d="m46 18 5 2v7l-5-2Z" fill="#d94d55" stroke="#ffb0a4"/></g>',
      transactions:
        '<g filter="url(#' + prefix + '-shadow)" stroke-linejoin="round"><path d="m11 15 25-7 17 8-25 8Z" fill="url(#' + prefix + '-steel)" stroke="#d7f2ff"/><path d="m11 15 17 9v27l-17-10Z" fill="#173b60" stroke="#85b5d3"/><path d="m28 24 25-8v27l-25 8Z" fill="url(#' + prefix + '-dark)" stroke="#7ebce0"/><path d="m18 19 8-2m-8 7 7-2m-7 7 7-2m4 0 15-5m-15 11 13-4m-13 10 11-3" stroke="#d2f0ff" stroke-width="1.6" stroke-linecap="round"/><circle cx="45" cy="39" r="9.5" fill="url(#' + prefix + '-gold)" stroke="#fff0bf" stroke-width="1.2"/><circle cx="45" cy="39" r="6.2" fill="none" stroke="#9b5c26" stroke-width="1.1"/><path d="M45 34v10m-3-7h5m-5 5h5" stroke="#75451f" stroke-width="1.35" stroke-linecap="round"/><path d="m17 12 18-5 13 6" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="1.3"/></g>',
      settlement:
        '<g filter="url(#' + prefix + '-shadow)" stroke-linejoin="round"><path d="M7 36h49l-7 12-29 3-13-8Z" fill="url(#' + prefix + '-dark)" stroke="#a2d5eb" stroke-width="1.2"/><path d="m13 35 5-10h11v10Zm14 0 5-13h12v13Z" fill="url(#' + prefix + '-cyan)" stroke="#b4efff"/><path d="m18 25 5-5h11l-5 5Zm14-3 5-5h12l-5 5Z" fill="url(#' + prefix + '-steel)" stroke="#e1f8ff"/><path d="M19 27v8m6-8v8m13-11v11m6-11v11" stroke="#e6f8ff" stroke-width="1.15" opacity=".7"/><path d="M7 43q22 7 49-2" fill="none" stroke="#4bd5f4" stroke-width="2"/><path d="M11 53q9-3 18 0t18 0" fill="none" stroke="#63cde8" stroke-width="1.4"/><circle cx="49" cy="12" r="8.5" fill="url(#' + prefix + '-gold)" stroke="#fff2c8"/><path d="m45 12 3 3 5-6" fill="none" stroke="#315b70" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M15 34h34" stroke="#fff" stroke-opacity=".45" stroke-width="1.3"/>'
    };
    return '<svg class="omega-trade-command-svg" viewBox="0 0 64 56" aria-hidden="true" focusable="false">' +
      defs +
      '<ellipse cx="32" cy="51" rx="17" ry="3" fill="#020914" opacity=".72"/>' +
      '<circle cx="32" cy="28" r="25.2" fill="url(#' + prefix + '-dark)" stroke="url(#' + prefix + '-rim)" stroke-width="1.8"/>' +
      '<circle cx="32" cy="28" r="22.4" fill="#0b2139" stroke="' + accent + '" stroke-opacity=".68" stroke-width=".9"/>' +
      '<circle cx="32" cy="28" r="20.3" fill="none" stroke="#dff8ff" stroke-opacity=".16" stroke-width=".8"/>' +
      '<path d="M12 25Q18 6 32 5Q47 6 52 25" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.4" stroke-linecap="round"/>' +
      '<ellipse cx="23" cy="12" rx="13" ry="5" fill="url(#' + prefix + '-glow)"/>' +
      (art[kind] || art.overview) + '</svg>';
  }

  function tradeCommandNavigationMarkup(section, marketTab) {
    var routes = [
      { id:'overview', label:'Overview', section:'dashboard', attributes:'data-omega-v2-ministry-section="dashboard"', icon:'overview' },
      { id:'commodities', label:'Commodity<br>Market', section:'market', tab:'commodities', attributes:'data-omega-v2-ministry-section="market" data-omega-v2-trade-market-tab="commodities"', icon:'commodities' },
      { id:'settlement', label:'Trade<br>Settlement', section:'settlement', attributes:'data-omega-v2-ministry-section="settlement"', icon:'settlement' },
      { id:'transactions', label:'Transactions', section:'market', tab:'transactions', attributes:'data-omega-v2-ministry-section="market" data-omega-v2-trade-market-tab="transactions"', icon:'transactions' },
      { id:'black-market', label:'Black<br>Market', section:'market', tab:'black-market', attributes:'data-omega-v2-ministry-section="market" data-omega-v2-trade-market-tab="black-market"', icon:'black-market' }
    ];
    return '<nav class="omega-trade-command-nav" data-omega-trade-command-nav role="navigation" aria-label="Trade & Commerce navigation">' +
      routes.map(function (route, index) {
        var active = route.section === section && (!route.tab || route.tab === marketTab);
        return '<button type="button" class="omega-trade-command-button' + (active ? ' is-active' : '') + '"' +
          ' ' + route.attributes +
          ' data-omega-trade-route="' + route.id + '" aria-current="' + (active ? 'page' : 'false') + '"' +
          ' aria-label="' + esc(route.label.replace(/<br>/g,' ')) + '">' +
          '<span class="omega-trade-command-icon">' + tradeCommandIconMarkup(route.icon) + '</span>' +
          '<span class="omega-trade-command-label">' + route.label + '</span>' +
          '<span class="omega-trade-command-index">' + String(index + 1).padStart(2,'0') + '</span>' +
        '</button>';
      }).join('') + '</nav>';
  }

  function tradeDashboardOverviewMarkup(country) {
    // Read the selected country's existing Finance / Banking / settled-Trade model.
    // No world scan, polling, new ledger, or network dependency is introduced.
    var model = null;
    try {
      var financeApi = g.OmegaUIV2Economy;
      if (financeApi && typeof financeApi.buildViewModel === 'function') {
        model = financeApi.buildViewModel({ countryId:country });
      }
    } catch (_) { model = null; }
    model = model || {};
    var trends = model.trends || {};
    var homeCurrency = model.currencyCode || 'Home currency';
    var cover = 'assets/omega-global-market/market-header.svg';
    var marketImage = 'assets/omega-global-market/raw-mining.svg';
    var factoryImage = 'assets/omega-global-market/factory-refinery.svg';
    var shipImage = 'assets/omega-industrial-icons-v1/transport/cargo/general-cargo/ship.svg';

    function moneyTrade(value, currency) {
      var amount = finiteTradeNumber(value);
      if (amount === null) return 'Not recorded';
      var code = String(currency || 'USD').trim().toUpperCase() || 'USD';
      try {
        return new Intl.NumberFormat('en-US',{style:'currency',currency:code,maximumFractionDigits:2}).format(amount);
      } catch (_) { return numberTrade(amount) + ' ' + code; }
    }
    function recordText(record, kind) {
      if (!record || finiteTradeNumber(record.value) === null) return 'Not recorded';
      if (kind === 'money') return moneyTrade(record.value,record.unit || 'USD');
      if (kind === 'percent' || record.unit === '%') return numberTrade(record.value) + '%';
      return numberTrade(record.value) + (record.unit ? ' ' + String(record.unit) : '');
    }
    function recordNote(record, fallback) {
      var source = record && (record.source || record.sourceName);
      if (!source) source = record && record.status === 'AVAILABLE' ? 'Recorded game value' : (fallback || 'Source not recorded');
      return String(source) + (record && record.year ? ' · ' + record.year : '');
    }
    function trendMarkup(trend) {
      if (!trend || trend.status === 'NO_BASELINE') return '<span class="omega-economy-trend omega-economy-trend--none">No baseline</span>';
      if (trend.status === 'NEW') return '<span class="omega-economy-trend omega-economy-trend--none">New record</span>';
      if (trend.status === 'FLAT') return '<span class="omega-economy-trend omega-economy-trend--none">0.0% · unchanged</span>';
      var change = finiteTradeNumber(trend.changePct);
      if (change === null) return '<span class="omega-economy-trend omega-economy-trend--none">No baseline</span>';
      var up = trend.status === 'UP';
      return '<span class="omega-economy-trend ' + (up ? 'omega-economy-trend--up' : 'omega-economy-trend--down') + '">' +
        (up ? '▲ +' : '▼ ') + numberTrade(Math.abs(change)) + '%</span>';
    }
    function metric(label, value, note, trend, modifier) {
      return '<article class="omega-trade-overview-metric ' + esc(modifier || '') + '">' +
        '<span class="omega-trade-overview-metric-label">' + esc(label) + '</span>' +
        '<strong class="omega-trade-overview-metric-value">' + esc(value) + '</strong>' +
        (trend ? trendMarkup(trend) : '') +
        (note ? '<small class="omega-trade-overview-metric-note">' + esc(note) + '</small>' : '') +
      '</article>';
    }
    function partnerValue(partner) {
      if (!partner || finiteTradeNumber(partner.value) === null) return 'Not recorded';
      return String(partner.name || partner.countryId || 'Partner') + ' · ' + moneyTrade(partner.value,partner.currency || homeCurrency);
    }
    function galleryImage(src, alt, caption) {
      var safe = safeVisualPath(src);
      if (!safe) return '';
      return '<figure class="omega-trade-overview-gallery-item"><img loading="lazy" decoding="async" src="' +
        esc(safe) + '" alt="' + esc(alt) + '"><figcaption>' + esc(caption) + '</figcaption></figure>';
    }

    var balanceValue = model.tradeBalance ? finiteTradeNumber(model.tradeBalance.value) : null;
    var balanceModifier = balanceValue === null ? '' : balanceValue > 0 ? 'is-positive' : balanceValue < 0 ? 'is-negative' : '';
    var position = String(model.tradePosition || 'Not recorded');
    var foreignAccounts = Array.isArray(model.foreignAccounts) ? model.foreignAccounts : [];
    var foreignAccountValue = model.foreignAccountsUsd !== null && model.foreignAccountsUsd !== undefined
      ? moneyTrade(model.foreignAccountsUsd,'USD')
      : foreignAccounts.length ? foreignAccounts.length + ' account(s)' : 'Not recorded';
    var foreignAccountNote = foreignAccounts.length
      ? foreignAccounts.length + ' foreign currency account(s) · USD equivalent only when FX quote exists'
      : 'No foreign currency account balance recorded';
    var dependency = model.tradeDependencyProfile || { label:'Not recorded', detail:'Import/export dependency evidence is unavailable' };
    var countryName = model.countryName || model.countryId || country || 'Selected country';
    var turn = Math.max(0,Math.floor(finiteTradeNumber(model.currentTurn) || 0));

    return '<div class="omega-trade-dashboard omega-trade-overview" data-omega-trade-overview="true">' +
      '<header class="omega-trade-overview-hero">' +
        '<img class="omega-trade-overview-hero-image" loading="lazy" decoding="async" src="' + esc(cover) + '" alt="International container port">' +
        '<div class="omega-trade-overview-hero-copy">' +
          '<span class="omega-trade-overview-eyebrow">TRADE & COMMERCE · NATIONAL OVERVIEW</span>' +
          '<h2>National trade overview</h2>' +
          '<p>' + esc(countryName) + ' · current recorded commercial position</p>' +
          '<span class="omega-trade-overview-turn">GAME TURN ' + esc(turn) + '</span>' +
        '</div>' +
        '<div class="omega-trade-overview-hero-balance">' +
          '<small>NET TRADE POSITION</small><strong>' + esc(recordText(model.tradeBalance,'money')) + '</strong>' +
          '<span class="' + (balanceModifier === 'is-positive' ? 'is-positive' : balanceModifier === 'is-negative' ? 'is-negative' : 'is-neutral') + '">' + esc(position) + '</span>' +
          trendMarkup(trends.tradeBalance) +
        '</div>' +
      '</header>' +
      '<section class="omega-trade-overview-section" aria-label="International trade results">' +
        '<div class="omega-trade-overview-section-heading"><div><span>01 / TRADE RESULTS</span><h3>International trade position</h3></div>' +
          '<span class="omega-trade-overview-section-tag">' + esc(position) + '</span></div>' +
        '<div class="omega-trade-overview-grid omega-trade-overview-grid--four">' +
          metric('Total imports',recordText(model.imports,'money'),recordNote(model.imports,'Settled import ledger or country baseline'),trends.imports) +
          metric('Total exports',recordText(model.exports,'money'),recordNote(model.exports,'Settled export ledger or country baseline'),trends.exports) +
          metric('Trade balance',recordText(model.tradeBalance,'money'),recordNote(model.tradeBalance,'Currency-comparable settled trade or baseline'),trends.tradeBalance,balanceModifier) +
          metric('Foreign direct investment',recordText(model.foreignDirectInvestment,'money'),recordNote(model.foreignDirectInvestment,'FDI source not recorded'),trends.fdi) +
        '</div>' +
      '</section>' +
      '<section class="omega-trade-overview-section" aria-label="National liquidity and reserves">' +
        '<div class="omega-trade-overview-section-heading"><div><span>02 / CURRENCY & RESERVES</span><h3>National liquidity</h3></div>' +
          '<span class="omega-trade-overview-section-tag">' + esc(homeCurrency) + '</span></div>' +
        '<div class="omega-trade-overview-grid">' +
          metric('Domestic currency balance',moneyTrade(model.domesticCurrencyBalance,homeCurrency),'Home-currency account · ' + homeCurrency,trends.localCurrency) +
          metric('Foreign currency accounts',foreignAccountValue,foreignAccountNote,trends.foreignAccounts) +
          metric('Foreign-exchange reserves',recordText(model.foreignExchangeReserves,'money'),recordNote(model.foreignExchangeReserves,'Official FX reserve source not recorded'),trends.fxReserves) +
          metric('Government Treasury cash',moneyTrade(model.treasuryCash,'USD'),'Available Treasury cash · USD, separate from FX reserves',trends.treasury) +
          metric('Treasury reserves',moneyTrade(model.treasuryReserves,'USD'),'Finance reserve field · separate from official FX reserves',trends.treasuryReserves) +
        '</div>' +
        (foreignAccounts.length ? '<div class="omega-trade-overview-currency-list"><span>RECORDED FOREIGN ACCOUNTS</span>' +
          foreignAccounts.map(function (row) {
            return '<div><span><strong>' + esc(row.currencyCode) + '</strong><small>' + esc(row.currencyName || row.currencyCode) + '</small></span>' +
              '<b>' + esc(finiteTradeNumber(row.balance) === null ? 'Not recorded' : numberTrade(row.balance) + ' ' + row.currencyCode) + '</b>' +
              '<small>' + esc(row.usdValue === null ? 'USD quote unavailable' : moneyTrade(row.usdValue,'USD')) + '</small></div>';
          }).join('') + '</div>' : '') +
      '</section>' +
      '<section class="omega-trade-overview-section" aria-label="Trade dependency and international partners">' +
        '<div class="omega-trade-overview-section-heading"><div><span>03 / PARTNERS & DEPENDENCY</span><h3>Trade relationships</h3></div></div>' +
        '<div class="omega-trade-overview-grid">' +
          metric('Trade orientation',dependency.label,dependency.detail,null) +
          metric('Import dependency',recordText(model.importDependency,'percent'),recordNote(model.importDependency,'Import dependency source not recorded'),trends.importDependency) +
          metric('Export dependency',recordText(model.exportDependency,'percent'),recordNote(model.exportDependency,'Export dependency source not recorded'),trends.exportDependency) +
          metric('Largest import partner',partnerValue(model.importPartner),model.importPartner ? numberTrade(model.importPartner.count || 0) + ' settled import(s)' : 'No comparable settled import evidence',null) +
          metric('Largest export partner',partnerValue(model.exportPartner),model.exportPartner ? numberTrade(model.exportPartner.count || 0) + ' settled export(s)' : 'No comparable settled export evidence',null) +
          metric('Largest overall trade partner',partnerValue(model.tradePartner),model.tradePartner ? numberTrade(model.tradePartner.importCount || 0) + ' import · ' + numberTrade(model.tradePartner.exportCount || 0) + ' export settlement(s)' : 'No comparable settled partner evidence',null) +
        '</div>' +
        '<p class="omega-trade-overview-data-note">Trade totals use deduplicated SETTLED ledger rows. Pending offers and bilateral commitments are not counted as completed trade. Missing values remain unavailable rather than being replaced with zero.</p>' +
      '</section>' +
      '<section class="omega-trade-overview-gallery" aria-label="Trade and industry visual references">' +
        galleryImage(marketImage,'Raw commodities at a mining and trade origin','COMMODITY SUPPLY') +
        galleryImage(factoryImage,'Industrial processing and production','INDUSTRIAL OUTPUT') +
        galleryImage(shipImage,'Cargo ship and international freight','CROSS-BORDER LOGISTICS') +
      '</section>' +
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
        action('Transactions','Review the existing read-only world trade ledger',transactionIcon,'market','transactions','','Open transactions') +
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
    var marketTab = options.marketTab === 'black-market' ? 'black-market' : options.marketTab === 'transactions' ? 'transactions' : 'commodities';
    var rawRows = scalarRows(domain && domain.record);
    var categories = options.sectionData && Array.isArray(options.sectionData[section]) ? options.sectionData[section] : null;
    var content;
    if (!row) {
      content = '<div class="omega-v2-empty">The selected ID is not present in the current ministry directory. No substitute ministry was created.</div>';
    } else if (id === 'trade' && section === 'dashboard') {
      content = tradeDashboardOverviewMarkup(country);
    } else if (id === 'trade' && section === 'settlement') {
      content = renderTradeSettlement(country, options.settlementTab);
    } else if (id === 'trade' && section === 'market') {
      content = marketTab === 'black-market'
        ? '<div class="omega-v2-trade-market-host" data-omega-v2-black-market-host aria-label="Black Market"></div>'
        : '<div class="omega-v2-trade-market-host" data-omega-v2-trade-market-host aria-label="Global Commodity Market"></div>';
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
    if (id === 'trade') {
      var tradePageTitle = section === 'dashboard' ? 'Overview'
        : section === 'settlement' ? 'Trade Settlement'
        : marketTab === 'black-market' ? 'Black Market'
        : marketTab === 'transactions' ? 'Market Transactions' : 'Market Commodities';
      var tradeSubtitle = 'Country ' + esc(country || 'Not recorded') + ' · international markets, completed transactions and bilateral commitments';
      var tradeHeader = '<header class="omega-v2-heading omega-trade-command-heading">' +
        '<div class="omega-v2-ministry-detail-mark">' + emblem +
          '<div><div class="omega-v2-eyebrow">ALL MINISTRIES · TRADE & COMMERCE</div>' +
          '<h1 class="omega-v2-title">Trade & Commerce</h1>' +
          '<p class="omega-v2-subtitle">' + tradeSubtitle + '</p></div></div>' +
        '<span class="omega-v2-status" data-state="' + (domain && domain.record ? 'operational' : 'unknown') + '">' +
          (domain && domain.record ? 'DOMAIN RECORD AVAILABLE' : esc(domain.reason || 'COUNTRY VIEW')) + '</span></header>';
      var ministerCard = '<div class="omega-v2-card omega-v2-ministry-appointed-minister omega-trade-command-minister">' +
        '<h2 class="omega-v2-card-title">Minister</h2><div class="omega-v2-minister-table-person">' +
        (portraitSlot || '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot><span class="omega-v2-minister-portrait-placeholder">MINISTER PORTRAIT</span><small>Image pending</small></div>') +
        '<strong>' + esc(activeMinisterName) + '</strong></div></div>';
      root.innerHTML = '<section class="omega-v2-shell omega-v2-ministry-detail omega-v2-trade-command-page" data-omega-v2-trade-ministry-page="true">' +
        tradeHeader +
        tradeCommandNavigationMarkup(section,marketTab) +
        ministerCard +
        (section === 'dashboard' ? tradeRegistryCompatibilityMarkup() : '') +
        '<div class="omega-v2-section-title omega-trade-command-section-title">' + esc(tradePageTitle) + '</div>' +
        content +
        '<p class="omega-v2-source">Existing Global Trade, Treasury, Transactions and bilateral-agreement records remain authoritative. This navigation changes the view only; it does not duplicate or alter any market, payment or settlement ledger.</p></section>';
    } else {
      root.innerHTML = '<section class="omega-v2-shell omega-v2-ministry-detail">' +
        '<header class="omega-v2-heading"><div class="omega-v2-ministry-detail-mark">' + emblem + '<div><div class="omega-v2-eyebrow">ALL MINISTRIES · ' + esc(id.replace(/[_-]+/g,' ').toUpperCase()) + '</div><h1 class="omega-v2-title">' + esc(row ? row.title : id || 'Ministry') + '</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · registered ministry profile and source-backed domain record</p></div></div><span class="omega-v2-status" data-state="' + (domain && domain.record ? 'operational' : 'unknown') + '">' + (domain && domain.record ? 'DOMAIN RECORD AVAILABLE' : esc(domain.reason || 'DOMAIN RECORD NOT RECORDED')) + '</span></header>' +
        '<div class="omega-v2-card omega-v2-ministry-appointed-minister"><h2 class="omega-v2-card-title">Minister</h2><div class="omega-v2-minister-table-person">' + (portraitSlot || '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot><span class="omega-v2-minister-portrait-placeholder">MINISTER PORTRAIT</span><small>Image pending</small></div>') + '<strong>' + esc(activeMinisterName) + '</strong></div></div>' +
        ministryVisualMarkup(id, row) +
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
            marketTab:nextMarketTab === 'black-market' || nextMarketTab === 'transactions' ? nextMarketTab : (nextSection === 'market' ? 'commodities' : current.marketTab)
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
          scheduleRender(root, Object.assign({}, marketOptions, { section:'market', marketTab:marketTabButton.getAttribute('data-omega-v2-trade-market-tab') }), 'Opening ' + (marketTabButton.getAttribute('data-omega-v2-trade-market-tab') === 'black-market' ? 'Black Market' : marketTabButton.getAttribute('data-omega-v2-trade-market-tab') === 'transactions' ? 'Market Transactions' : 'Market Commodities'));
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
          else if (marketTab === 'transactions' && typeof marketHost.querySelector === 'function') {
            var transactionViewButton = marketHost.querySelector('[data-market-view="transactions"]');
            if (transactionViewButton && typeof transactionViewButton.click === 'function') transactionViewButton.click();
          }
        } else if (marketHost) marketHost.textContent = 'The Global Commodity Market UI is unavailable in this session.';
      }
    }
    return { ok:true, ministryId:id, countryId:country || null, section:section,
      domainRecordAvailable:!!(domain && domain.record), marketMounted:marketMounted };
  }
  g.OmegaUIV2MinistryDetail = Object.freeze({ version:'2.0.0', render:render, getMinistry:getMinistry, getDomainRecord:domainRecord, buildTradeSettlementModel:buildTradeSettlementModel });
})(typeof window !== 'undefined' ? window : globalThis);
