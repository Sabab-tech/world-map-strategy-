/* OMEGA UI v2 — mobile-first economy overview.
 * Read-only projection of existing Finance, FX, Trade and country records.
 * No charting, world scans, network requests or state initialization on render.
 */
(function (g) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function firstNum() {
    for (var i = 0; i < arguments.length; i += 1) {
      var n = num(arguments[i]);
      if (n !== null) return n;
    }
    return null;
  }
  function number(v, digits) {
    var n = num(v);
    if (n === null) return 'Not recorded';
    try {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: digits == null ? 2 : digits
      }).format(n);
    } catch (_) {
      return String(Math.round(n * 100) / 100);
    }
  }
  function money(v, currency) {
    var n = num(v);
    if (n === null) return 'Not recorded';
    var code = String(currency || 'USD').trim().toUpperCase();
    var absolute = Math.abs(n);
    var divisor = 1;
    var suffix = '';
    if (absolute >= 1e12) { divisor = 1e12; suffix = 'T'; }
    else if (absolute >= 1e9) { divisor = 1e9; suffix = 'B'; }
    else if (absolute >= 1e6) { divisor = 1e6; suffix = 'M'; }
    var digits = suffix ? 2 : 2;
    return (n < 0 ? '-' : '') + code + ' ' + number(Math.abs(n) / divisor, digits) + suffix;
  }
  function countryProfile(value) {
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    if (runtime && typeof runtime.resolveCountry === 'function') {
      try {
        var profile = runtime.resolveCountry(value);
        if (profile) return profile;
      } catch (_) {}
    }
    return null;
  }
  function countryAliases(value) {
    var aliases = [], seen = Object.create(null);
    function add(item) {
      var key = String(item == null ? '' : item).trim().toUpperCase();
      if (key && !seen[key]) { seen[key] = true; aliases.push(key); }
    }
    add(value);
    var profile = countryProfile(value);
    var identity = profile && (profile.identity || profile.country || profile);
    [
      profile && profile.iso3, profile && profile.alpha3, profile && profile.cca3,
      profile && profile.countryCode, profile && profile.numericCode,
      profile && profile.name, profile && profile.officialName, profile && profile.shortName,
      profile && profile.economyKey, profile && profile.populationKey,
      identity && identity.iso3, identity && identity.countryIso3, identity && identity.countryCode,
      identity && identity.name, identity && identity.officialName
    ].forEach(add);
    return aliases;
  }
  function canonicalCountry(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    var profile = countryProfile(raw);
    var identity = profile && (profile.identity || profile.country || profile);
    var code = String(
      profile && (profile.iso3 || profile.alpha3 || profile.cca3 || profile.countryIso3) ||
      identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3) || ''
    ).trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : raw.toUpperCase();
  }
  function getBucket(root, country) {
    if (!root || typeof root !== 'object') return null;
    var aliases = countryAliases(country);
    for (var i = 0; i < aliases.length; i += 1) {
      if (root[aliases[i]] && typeof root[aliases[i]] === 'object') return root[aliases[i]];
    }
    var keys = Object.keys(root);
    for (var j = 0; j < keys.length; j += 1) {
      if (aliases.indexOf(keys[j].trim().toUpperCase()) >= 0 &&
          root[keys[j]] && typeof root[keys[j]] === 'object') return root[keys[j]];
    }
    return null;
  }
  function getCountrySnapshot(country) {
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    try {
      if (gateway && typeof gateway.getSnapshotForView === 'function') return gateway.getSnapshotForView(country);
      return gateway && typeof gateway.getSnapshot === 'function' ? gateway.getSnapshot(country) : null;
    } catch (_) {
      return null;
    }
  }
  function fieldRecord(snapshot, id) {
    var fields = snapshot && snapshot.fields || {};
    var field = fields[id];
    if (!field || field.status !== 'AVAILABLE' || num(field.value) === null) {
      return {
        value:null, unit:field && field.unit || null,
        source:field && (field.sourceName || field.sourceId) || null,
        year:field && field.year || null, status:field && field.status || 'UNAVAILABLE'
      };
    }
    return {
      value:num(field.value), unit:field.unit || null,
      source:field.sourceName || field.sourceId || null,
      year:field.year || null, status:'AVAILABLE'
    };
  }
  function rawMetric(snapshot, keys, unit) {
    var raw = snapshot && snapshot.raw || {};
    var general = raw.countryGeneralRecord || {};
    var metrics = general.metrics || {};
    var metadata = general.metricMetadata || {};
    var economy = raw.economy || {};
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = firstNum(metrics[key], economy[key]);
      if (value === null) continue;
      var meta = metadata[key] || {};
      return {
        value:value, unit:meta.unit || unit || null,
        source:meta.sourceName || meta.sourceId || general.datasetId || 'Country economic baseline',
        year:meta.year || general.year || null,
        status:'AVAILABLE'
      };
    }
    return { value:null, unit:unit || null, source:null, year:null, status:'UNAVAILABLE' };
  }
  function seriesValues(source, metric) {
    if (!source || typeof source !== 'object') return [];
    var keys = ['historyByMetric','metricHistory','history','metricsHistory','indicatorHistory'];
    for (var i = 0; i < keys.length; i += 1) {
      var root = source[keys[i]];
      if (!root) continue;
      var candidate = Array.isArray(root) ? root.filter(function (row) {
        return row && String(row.metric || row.key || row.field || '').toLowerCase() === metric.toLowerCase();
      }) : root[metric];
      if (!Array.isArray(candidate)) continue;
      var values = candidate.map(function (row) {
        return num(row && typeof row === 'object'
          ? (row.value !== undefined ? row.value : row.amount !== undefined ? row.amount : row.balance)
          : row);
      }).filter(function (value) { return value !== null; });
      if (values.length >= 2) return values;
    }
    return [];
  }
  function trendFor(metric, sources) {
    for (var i = 0; i < sources.length; i += 1) {
      var values = seriesValues(sources[i], metric);
      if (values.length < 2) continue;
      var previous = values[values.length - 2];
      var current = values[values.length - 1];
      if (previous === 0) return {
        status:current === 0 ? 'FLAT' : 'NEW',
        changePct:null, previous:previous, current:current
      };
      var change = ((current - previous) / Math.abs(previous)) * 100;
      return {
        status:change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'FLAT',
        changePct:change, previous:previous, current:current
      };
    }
    return { status:'NO_BASELINE', changePct:null, previous:null, current:null };
  }
  function currentTurn(root) {
    return Math.max(0, Math.floor(firstNum(
      root && root.simulation && root.simulation.turn,
      root && root.turn, root && root.simulationTurn
    ) || 0));
  }
  function currencyRate(code) {
    if (String(code || '').toUpperCase() === 'USD') return 1;
    var fx = g.OmegaForexMonetaryEngine || (g.Omega && g.Omega.ForexMonetaryEngine);
    if (!fx || typeof fx.getRate !== 'function') return null;
    try {
      var rate = num(fx.getRate(code, 'SIMULATION'));
      return rate !== null && rate > 0 ? rate : null;
    } catch (_) {
      return null;
    }
  }
  function bankingBook(root, country) {
    var banking = root && root.governmentBanking;
    var books = banking && banking.accountsByCountry;
    if (!books || typeof books !== 'object') return null;
    return getBucket(books, country);
  }
  function accountRows(book, homeCurrency) {
    var accounts = book && book.accounts;
    if (!accounts || typeof accounts !== 'object') return [];
    return Object.keys(accounts).map(function (key) {
      var row = accounts[key] || {};
      var code = String(row.currencyCode || key || '').trim().toUpperCase();
      var balance = num(row.balance);
      var rate = code ? currencyRate(code) : null;
      return {
        currencyCode:code || null,
        currencyName:row.currencyName || code || 'Unknown currency',
        balance:balance,
        usdValue:balance !== null && rate !== null ? balance / rate : null,
        source:row.source || null,
        lastUpdatedTurn:num(row.lastUpdatedTurn),
        isHomeCurrency:code === String(homeCurrency || '').toUpperCase()
      };
    }).filter(function (row) { return !!row.currencyCode; }).sort(function (a, b) {
      if (a.isHomeCurrency !== b.isHomeCurrency) return a.isHomeCurrency ? -1 : 1;
      return a.currencyCode.localeCompare(b.currencyCode);
    });
  }
  function localSettlements(root, country, homeCurrency) {
    var trade = getBucket(root && root.trade, country) || {};
    var ledger = trade.globalTradeLedger && trade.globalTradeLedger.settlements;
    var rows = Array.isArray(ledger) ? ledger : [];
    var seen = Object.create(null);
    var imports = [], exports = [];
    rows.forEach(function (row) {
      if (!row || String(row.status || '').toUpperCase() !== 'SETTLED') return;
      var id = String(row.settlementId || row.transactionId || '').trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      var ledgerType = String(row.ledgerType || '').toUpperCase();
      var buyer = String(row.buyerCountryId || '').trim().toUpperCase();
      var seller = String(row.sellerCountryId || '').trim().toUpperCase();
      var direction = null;
      if (seller === country || ledgerType.indexOf('SELLER') >= 0) direction = 'EXPORT';
      else if (buyer === country || ledgerType.indexOf('BUYER') >= 0 || !buyer) direction = 'IMPORT';
      if (!direction) return;
      var partner = direction === 'EXPORT'
        ? (row.buyerCountryId || row.targetCountryId || row.counterpartyCountryId || row.supplier)
        : (row.sellerCountryId || row.supplier || row.targetCountryId || row.counterpartyCountryId);
      var currency = String(
        direction === 'EXPORT'
          ? (row.sellerCurrency || row.sellerCurrencyCode || row.currency)
          : (row.buyerCurrency || row.buyerCurrencyCode || row.currency)
      ).trim().toUpperCase();
      var value = firstNum(
        direction === 'EXPORT'
          ? row.sellerValue
          : row.buyerValue,
        direction === 'EXPORT'
          ? row.sellerTotalLocal
          : row.buyerDebitLocal,
        row.totalValue
      );
      var item = {
        settlementId:id, direction:direction, partnerCountryId:String(partner || '').trim().toUpperCase() || null,
        resourceId:row.resourceId || row.productId || null,
        value:value, currency:currency || String(homeCurrency || '').toUpperCase() || null,
        turn:firstNum(row.turn, row.settledTurn, row.simulationTurn)
      };
      (direction === 'EXPORT' ? exports : imports).push(item);
    });
    function summarize(list) {
      var totals = Object.create(null), partners = Object.create(null);
      var complete = list.length > 0;
      list.forEach(function (row) {
        if (row.value === null || !row.currency) { complete = false; return; }
        totals[row.currency] = (totals[row.currency] || 0) + row.value;
        if (row.partnerCountryId) {
          if (!partners[row.partnerCountryId]) partners[row.partnerCountryId] = { countryId:row.partnerCountryId, value:0, currency:row.currency, count:0 };
          if (partners[row.partnerCountryId].currency !== row.currency) {
            partners[row.partnerCountryId].value = null;
          } else if (partners[row.partnerCountryId].value !== null) {
            partners[row.partnerCountryId].value += row.value;
          }
          partners[row.partnerCountryId].count += 1;
        }
      });
      var currencies = Object.keys(totals);
      var commonCurrency = currencies.length === 1 ? currencies[0] : null;
      var total = complete && commonCurrency ? totals[commonCurrency] : null;
      var partnerRows = Object.keys(partners).map(function (key) { return partners[key]; })
        .filter(function (row) { return row.value !== null; })
        .sort(function (a, b) { return b.value - a.value; });
      return {
        count:list.length, totalValue:total, currency:commonCurrency,
        byCurrency:currencies.map(function (code) { return { currency:code, value:totals[code] }; }),
        topPartner:partnerRows[0] || null, rows:list
      };
    }
    return {
      imports:summarize(imports), exports:summarize(exports),
      settlementCount:imports.length + exports.length
    };
  }
  function countryName(value) {
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    if (runtime && typeof runtime.resolveCountry === 'function') {
      try {
        var profile = runtime.resolveCountry(value);
        if (profile) return profile.name || profile.officialName || profile.shortName || value;
      } catch (_) {}
    }
    return value || 'Not recorded';
  }
  function buildViewModel(options) {
    options = options || {};
    var country = canonicalCountry(
      options.countryId || g.OmegaMinistryViewCountry ||
      (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || ''
    );
    var root = g.Game && g.Game.state || g.gameState ||
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state || {};
    var finance = getBucket(root.finance, country) || {};
    var economy = getBucket(root.economy, country) || {};
    var snapshot = getCountrySnapshot(country);
    var fields = snapshot && snapshot.fields || {};
    var general = snapshot && snapshot.raw && snapshot.raw.countryGeneralRecord || {};
    var rawEconomy = snapshot && snapshot.raw && snapshot.raw.economy || {};
    var homeCurrency = String(
      (bankingBook(root, country) || {}).homeCurrencyCode ||
      finance.currencyCode || economy.currencyCode || economy.currency_code || ''
    ).trim().toUpperCase() || null;
    var book = bankingBook(root, country);
    var accounts = accountRows(book, homeCurrency);
    var localAccount = accounts.find(function (row) { return row.isHomeCurrency; }) || null;
    var foreignAccounts = accounts.filter(function (row) { return !row.isHomeCurrency; });
    var foreignAccountsUsd = foreignAccounts.length && foreignAccounts.every(function (row) { return row.usdValue !== null; })
      ? foreignAccounts.reduce(function (sum, row) { return sum + row.usdValue; }, 0) : null;
    var settled = localSettlements(root, country, homeCurrency);
    var gdp = fieldRecord(snapshot, 'gdp');
    var gdpGrowth = fieldRecord(snapshot, 'gdpGrowth');
    var inflation = fieldRecord(snapshot, 'inflation');
    var debt = fieldRecord(snapshot, 'debt');
    var debtToGdp = fieldRecord(snapshot, 'debtToGdpPct');
    var fxReserves = fieldRecord(snapshot, 'reserves');
    var tradeBalanceField = fieldRecord(snapshot, 'tradeBalance');
    var importsBaseline = rawMetric(snapshot, ['importsUsd','imports','totalImportsUsd'], 'USD');
    var exportsBaseline = rawMetric(snapshot, ['exportsUsd','exports','totalExportsUsd'], 'USD');
    var fdi = rawMetric(snapshot, ['foreignDirectInvestmentUsd','foreignInvestmentUsd','fdiUsd'], 'USD');
    var importDependency = rawMetric(snapshot, ['importDependencyPct','importDependency'], '%');
    var exportDependency = rawMetric(snapshot, ['exportDependencyPct','exportDependency'], '%');
    var importsLive = settled.imports.count > 0
      ? { value:settled.imports.totalValue, unit:settled.imports.currency, source:'Settled trade ledger', status:settled.imports.totalValue === null ? 'PARTIAL' : 'AVAILABLE' }
      : importsBaseline;
    var exportsLive = settled.exports.count > 0
      ? { value:settled.exports.totalValue, unit:settled.exports.currency, source:'Settled trade ledger', status:settled.exports.totalValue === null ? 'PARTIAL' : 'AVAILABLE' }
      : exportsBaseline;
    var comparableLiveTrade = settled.imports.count > 0 && settled.exports.count > 0 &&
      settled.imports.totalValue !== null && settled.exports.totalValue !== null &&
      settled.imports.currency === settled.exports.currency;
    var tradeBalance = comparableLiveTrade
      ? { value:settled.exports.totalValue - settled.imports.totalValue, unit:settled.exports.currency, source:'Settled trade ledger', status:'AVAILABLE' }
      : tradeBalanceField;
    var topImport = settled.imports.topPartner;
    var topExport = settled.exports.topPartner;
    var importPosition = tradeBalance.value === null ? 'Not recorded'
      : tradeBalance.value > 0 ? 'Trade surplus'
      : tradeBalance.value < 0 ? 'Trade deficit' : 'Balanced trade';
    var homeBalance = localAccount ? localAccount.balance : null;
    var fdiRecord = fdi.value === null
      ? { value:null, unit:'USD', source:null, year:null, status:'UNAVAILABLE' }
      : fdi;
    var trends = {
      treasury:trendFor('treasuryCash',[finance,economy]),
      treasuryReserves:trendFor('treasuryReserves',[finance]),
      localCurrency:trendFor('domesticCurrencyBalance',[book,finance,economy]),
      foreignAccounts:trendFor('foreignCurrencyAccounts',[book,finance,economy]),
      fxReserves:trendFor('reserves',[economy,finance,general]),
      tradeBalance:trendFor('tradeBalance',[economy,finance,rawEconomy]),
      imports:trendFor('importsUsd',[economy,finance,rawEconomy,general]),
      exports:trendFor('exportsUsd',[economy,finance,rawEconomy,general]),
      importDependency:trendFor('importDependencyPct',[economy,rawEconomy,general]),
      exportDependency:trendFor('exportDependencyPct',[economy,rawEconomy,general]),
      fdi:trendFor('foreignDirectInvestmentUsd',[economy,finance,general]),
      gdp:trendFor('gdp',[economy,rawEconomy,general]),
      gdpGrowth:trendFor('gdpGrowth',[economy,rawEconomy,general]),
      inflation:trendFor('inflation',[economy,rawEconomy,general]),
      debtToGdp:trendFor('debtToGdpPct',[economy,rawEconomy,general])
    };
    return {
      countryId:country || null,
      countryName:countryName(country),
      snapshot:snapshot,
      treasuryCash:firstNum(finance.available,finance.cash),
      treasuryReserves:num(finance.reserves),
      currencyCode:homeCurrency,
      domesticCurrencyBalance:homeBalance,
      domesticCurrencyAccount:localAccount,
      foreignAccounts:foreignAccounts,
      foreignAccountsUsd:foreignAccountsUsd,
      foreignExchangeReserves:fxReserves,
      revenue:num(finance.revenue),
      expenditure:num(finance.expenditure),
      budgetBalance:num(finance.budgetBalance),
      debt:debt,
      debtToGdp:debtToGdp,
      gdp:gdp,
      gdpGrowth:gdpGrowth,
      inflation:inflation,
      tradeBalance:tradeBalance,
      imports:importsLive,
      exports:exportsLive,
      importDependency:importDependency,
      exportDependency:exportDependency,
      importPartner:topImport ? Object.assign({},topImport,{name:countryName(topImport.countryId)}) : null,
      exportPartner:topExport ? Object.assign({},topExport,{name:countryName(topExport.countryId)}) : null,
      foreignDirectInvestment:fdiRecord,
      fxReserves:fxReserves,
      settledTradeCount:settled.settlementCount,
      tradePosition:importPosition,
      fiscalLedgerCount:Array.isArray(finance.ledger) ? finance.ledger.length : Array.isArray(finance.transactions) ? finance.transactions.length : null,
      currentTurn:currentTurn(root),
      trends:trends,
      source:'Existing country Finance / Banking / Trade state and read-only country data snapshot'
    };
  }

  function trendMarkup(trend) {
    if (!trend || trend.status === 'NO_BASELINE') {
      return '<span class="omega-economy-trend omega-economy-trend--none">No baseline</span>';
    }
    if (trend.status === 'NEW') {
      return '<span class="omega-economy-trend omega-economy-trend--none">New record</span>';
    }
    if (trend.status === 'FLAT') {
      return '<span class="omega-economy-trend omega-economy-trend--none">0.0% · unchanged</span>';
    }
    var up = trend.status === 'UP';
    var sign = up ? '+' : '';
    return '<span class="omega-economy-trend ' + (up ? 'omega-economy-trend--up' : 'omega-economy-trend--down') + '">' +
      (up ? '▲ ' : '▼ ') + sign + number(trend.changePct,1) + '%</span>';
  }
  function sourceLine(record) {
    if (!record) return '';
    var source = record.source || (record.status === 'AVAILABLE' ? 'Recorded game value' : 'Source not recorded');
    return esc(source + (record.year ? ' · ' + record.year : ''));
  }
  function value(record, unit) {
    if (!record || num(record.value) === null) return 'Not recorded';
    return unit === 'money' ? money(record.value,record.unit || 'USD') : number(record.value,2) + (record.unit ? ' ' + record.unit : '');
  }
  function card(label, content, sub, trend, className) {
    return '<article class="omega-economy-metric ' + esc(className || '') + '">' +
      '<span class="omega-economy-label">' + esc(label) + '</span>' +
      '<strong class="omega-economy-value">' + esc(content) + '</strong>' +
      (trend ? trendMarkup(trend) : '') +
      (sub ? '<small class="omega-economy-source">' + esc(sub) + '</small>' : '') +
    '</article>';
  }
  function inlineIcon(name) {
    var icons = {
      overview:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z"/><path d="M3.8 9h16.4M3.8 15h16.4M12 3c2.4 2.4 3.6 5.4 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z"/></svg>',
      market:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-2-5H5L3 9Z"/><path d="M5 9v11h14V9M9 20v-6h6v6M3 9c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0"/></svg>',
      black:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3M9 11v5M15 11v5"/></svg>',
      transaction:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15l-3-3M20 17H5l3 3M4 7v4M20 13v4"/></svg>',
      settlement:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h18M5 8l1 11h12l1-11M8 8V5h8v3M8 13h8M12 11v4M10 17h4"/></svg>'
    };
    return icons[name] || icons.overview;
  }
  function safeImage(value) {
    var path = String(value || '');
    return /^assets\/[A-Za-z0-9_ .()\/-]+\.(?:webp|png|jpe?g|svg)$/i.test(path) && path.indexOf('..') < 0 ? path : '';
  }
  function actionCard(title,description,icon,action,asset,tag) {
    var image = safeImage(asset);
    return '<article class="omega-economy-action-card">' +
      (image ? '<div class="omega-economy-action-media"><img loading="lazy" decoding="async" src="' + esc(image) + '" alt="' + esc(title) + ' reference image"></div>' : '') +
      '<div class="omega-economy-action-copy"><span class="omega-economy-action-icon">' + inlineIcon(icon) + '</span>' +
      '<div><h3>' + esc(title) + '</h3><p>' + esc(description) + '</p></div></div>' +
      '<button type="button" class="omega-economy-action-button" ' + action + '><span>' + esc(tag || 'Open') + '</span><span aria-hidden="true">›</span></button>' +
    '</article>';
  }
  function scheduleRender(root, options) {
    options = options || {};
    var scheduler = options.onScheduleRender;
    if (typeof scheduler === 'function') {
      return scheduler(function () { return render(root,options); }, 'Opening economy overview', root);
    }
    return render(root,options);
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'ECONOMY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    // These small SVGs are already in the service worker's core offline cache.
    var cover = 'assets/omega-global-market/market-header.svg';
    var commodityImage = 'assets/omega-global-market/raw-mining.svg';
    var settlementImage = 'assets/omega-industrial-icons-v1/transport/cargo/general-cargo/ship.svg';
    var trend = model.trends || {};
    var accountNote = model.domesticCurrencyAccount
      ? 'Account · ' + model.domesticCurrencyAccount.currencyCode
      : 'Domestic currency account not recorded';
    var foreignNote = model.foreignAccounts.length
      ? model.foreignAccounts.length + ' currency account(s) · USD equivalent only when FX quote exists'
      : 'No foreign-currency account balance recorded';
    var importNote = model.imports.source || (model.imports.status === 'PARTIAL' ? 'Some settled values are unavailable' : 'No settled import ledger value');
    var exportNote = model.exports.source || (model.exports.status === 'PARTIAL' ? 'Some settled values are unavailable' : 'No settled export ledger value');
    var importPartner = model.importPartner
      ? model.importPartner.name + ' · ' + money(model.importPartner.value,model.importPartner.currency)
      : 'Not recorded';
    var exportPartner = model.exportPartner
      ? model.exportPartner.name + ' · ' + money(model.exportPartner.value,model.exportPartner.currency)
      : 'Not recorded';
    var currencyTitle = model.currencyCode || 'Home currency';
    var html =
      '<section class="omega-v2-shell omega-economy-overview">' +
        '<header class="omega-economy-heading">' +
          '<div class="omega-economy-heading-mark">' + inlineIcon('overview') + '</div>' +
          '<div class="omega-economy-heading-copy"><div class="omega-v2-eyebrow">NATIONAL ECONOMY</div><h1>Economy Overview</h1>' +
            '<p>' + esc(model.countryName || model.countryId || 'Selected country') + ' · current recorded position</p></div>' +
          '<span class="omega-economy-turn">TURN ' + esc(model.currentTurn) + '</span>' +
        '</header>' +
        '<div class="omega-economy-hero">' +
          '<div class="omega-economy-hero-copy"><span class="omega-economy-kicker">SOVEREIGN FINANCIAL POSITION</span>' +
            '<h2>Treasury cash</h2><strong>' + esc(money(model.treasuryCash,'USD')) + '</strong>' +
            trendMarkup(trend.treasury) +
            '<small>Available government Treasury · USD. This is not the national GDP or the FX reserve.</small></div>' +
          '<div class="omega-economy-hero-image"><img loading="lazy" decoding="async" src="' + esc(cover) + '" alt="Container ship at a trade port"></div>' +
        '</div>' +
        '<section class="omega-economy-section">' +
          '<div class="omega-economy-section-heading"><div><span>01 / CURRENCY & RESERVES</span><h2>National liquidity</h2></div><span class="omega-economy-section-mark">FINANCE</span></div>' +
          '<div class="omega-economy-metric-grid">' +
            card('Domestic currency · ' + currencyTitle,model.domesticCurrencyBalance === null ? 'Not recorded' : money(model.domesticCurrencyBalance,model.currencyCode),accountNote,trend.localCurrency) +
            card('Foreign currency accounts',model.foreignAccountsUsd === null ? number(model.foreignAccounts.length,0) + (model.foreignAccounts.length ? ' account(s)' : '') : money(model.foreignAccountsUsd,'USD'),foreignNote,trend.foreignAccounts) +
            card('Foreign-exchange reserves',value(model.foreignExchangeReserves,'money'),sourceLine(model.foreignExchangeReserves),trend.fxReserves) +
            card('Treasury reserves',model.treasuryReserves === null ? 'Not recorded' : money(model.treasuryReserves,'USD'),'Finance reserve field · separate from official FX reserves',trend.treasuryReserves) +
          '</div>' +
          (model.foreignAccounts.length ? '<div class="omega-economy-currency-list"><div class="omega-economy-currency-list-title">Recorded currency accounts</div>' +
            model.foreignAccounts.map(function (row) {
              return '<div class="omega-economy-currency-row"><span><strong>' + esc(row.currencyCode) + '</strong><small>' + esc(row.currencyName) + '</small></span><b>' +
                esc(row.balance === null ? 'Not recorded' : number(row.balance,2) + ' ' + row.currencyCode) + '</b><small>' +
                esc(row.usdValue === null ? 'USD quote unavailable' : money(row.usdValue,'USD')) + '</small></div>';
            }).join('') + '</div>' : '') +
        '</section>' +
        '<section class="omega-economy-section">' +
          '<div class="omega-economy-section-heading"><div><span>02 / INTERNATIONAL COMMERCE</span><h2>Trade position</h2></div><span class="omega-economy-position">' + esc(model.tradePosition) + '</span></div>' +
          '<div class="omega-economy-metric-grid">' +
            card('Trade balance',value(model.tradeBalance,'money'),sourceLine(model.tradeBalance),trend.tradeBalance,model.tradeBalance.value === null ? '' : model.tradeBalance.value >= 0 ? 'is-positive' : 'is-negative') +
            card('Total imports',value(model.imports,'money'),importNote,trend.imports) +
            card('Total exports',value(model.exports,'money'),exportNote,trend.exports) +
            card('Import dependency',value(model.importDependency),sourceLine(model.importDependency),trend.importDependency) +
            card('Export dependency',value(model.exportDependency),sourceLine(model.exportDependency),trend.exportDependency) +
            card('Foreign direct investment',value(model.foreignDirectInvestment,'money'),sourceLine(model.foreignDirectInvestment),trend.fdi) +
            card('Largest import partner',importPartner,model.importPartner ? number(model.importPartner.count,0) + ' settled deal(s)' : 'No settled partner evidence',null) +
            card('Largest export partner',exportPartner,model.exportPartner ? number(model.exportPartner.count,0) + ' settled deal(s)' : 'No settled partner evidence',null) +
          '</div>' +
          '<p class="omega-economy-data-note">Trade totals use this country’s deduplicated SETTLED ledger rows. Baseline values are labelled by source and year; pending offers and agreements are not counted as completed trade.</p>' +
        '</section>' +
        '<section class="omega-economy-section">' +
          '<div class="omega-economy-section-heading"><div><span>03 / MACRO INDICATORS</span><h2>Economic fundamentals</h2></div></div>' +
          '<div class="omega-economy-metric-grid">' +
            card('GDP',value(model.gdp,'money'),sourceLine(model.gdp),trend.gdp) +
            card('GDP growth',value(model.gdpGrowth),sourceLine(model.gdpGrowth),trend.gdpGrowth) +
            card('Inflation',value(model.inflation),sourceLine(model.inflation),trend.inflation) +
            card('Public debt / GDP',value(model.debtToGdp),sourceLine(model.debtToGdp),trend.debtToGdp) +
          '</div>' +
        '</section>' +
        '<section class="omega-economy-section omega-economy-actions-section">' +
          '<div class="omega-economy-section-heading"><div><span>04 / ECONOMIC CONTROL</span><h2>Markets, contracts & transactions</h2></div></div>' +
          '<div class="omega-economy-action-grid">' +
            actionCard('Commodity Market','Buy, sell and monitor recorded commodity offers','market',
              'data-omega-v2-open-trade-section="market" data-omega-v2-market-tab="commodities"',commodityImage,'Open market') +
            actionCard('Black Market','Restricted and shadow-market operations','black',
              'data-omega-v2-open-trade-section="market" data-omega-v2-market-tab="black-market"','','Open black market') +
            actionCard('Transactions','Open the existing financial transaction ledger','transaction',
              'data-omega-v2-open-economic-ministry="treasury_finance"','','Open transactions') +
            actionCard('Trade Settlement','Review bilateral import and export agreements','settlement',
              'data-omega-v2-open-trade-section="settlement"',settlementImage,'View agreements') +
          '</div>' +
        '</section>' +
        '<footer class="omega-economy-footer">Read-only overview · no new ledger, no online data refresh, and no world-wide country scan is performed while this page opens.</footer>' +
      '</section>';

    root.classList.add('omega-v2-screen');
    root.innerHTML = html;
    if (!root.__omegaV2EconomyBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tradeButton = target.closest('[data-omega-v2-open-trade-section]');
        if (tradeButton && root.contains(tradeButton) && !tradeButton.disabled) {
          var current = root.__omegaV2EconomyOptions || {};
          if (typeof current.onOpenTradeSection === 'function') {
            current.onOpenTradeSection(
              tradeButton.getAttribute('data-omega-v2-open-trade-section'),
              tradeButton.getAttribute('data-omega-v2-market-tab') || 'commodities'
            );
          }
          return;
        }
        var ministryButton = target.closest('[data-omega-v2-open-economic-ministry]');
        if (ministryButton && root.contains(ministryButton) && !ministryButton.disabled) {
          var optionsNow = root.__omegaV2EconomyOptions || {};
          var id = ministryButton.getAttribute('data-omega-v2-open-economic-ministry');
          if (typeof optionsNow.onOpenMinistry === 'function') optionsNow.onOpenMinistry(id);
          else if (g.OmegaLayerManager && typeof g.OmegaLayerManager.setLayer === 'function') {
            g.OmegaLayerManager.setLayer(2,{ministryId:id});
          }
        }
      });
      root.__omegaV2EconomyBound = true;
    }
    root.__omegaV2EconomyOptions = options;
    root.__omegaV2EconomyTab = 'overview';
    return { ok:true, model:model, tab:'overview' };
  }

  g.OmegaUIV2Economy = Object.freeze({
    version:'2.0.0',
    tabs:[{id:'overview',label:'Overview'}],
    buildViewModel:buildViewModel,
    render:render,
    trendFor:trendFor,
    localSettlements:localSettlements
  });
})(typeof window !== 'undefined' ? window : globalThis);
