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
    if (code === 'USD') {
      if (absolute >= 1e12) return (n < 0 ? '-$' : '$') + number(absolute / 1e12,0) + 'T';
      if (absolute >= 1e9) return (n < 0 ? '-$' : '$') + number(absolute / 1e9,1) + 'B';
      return (n < 0 ? '-$' : '$') + new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(absolute);
    }
    return (n < 0 ? '-' : '') + code + ' ' + number(absolute,2);
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
  function summarizeTopTradePartner(importRows, exportRows) {
    var byCountry = Object.create(null);
    function include(rows, direction) {
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        if (!row || !row.partnerCountryId) return;
        var countryId = String(row.partnerCountryId).trim().toUpperCase();
        if (!countryId) return;
        var entry = byCountry[countryId];
        if (!entry) {
          entry = byCountry[countryId] = {
            countryId:countryId, value:0, currency:null, count:0,
            importCount:0, exportCount:0, complete:true
          };
        }
        entry.count += 1;
        if (direction === 'IMPORT') entry.importCount += 1;
        else entry.exportCount += 1;
        var amount = num(row.value);
        var currency = String(row.currency || '').trim().toUpperCase();
        if (amount === null || !currency) {
          entry.complete = false;
          return;
        }
        if (entry.currency && entry.currency !== currency) {
          entry.complete = false;
          return;
        }
        entry.currency = currency;
        entry.value += amount;
      });
    }
    include(importRows, 'IMPORT');
    include(exportRows, 'EXPORT');
    var ranked = Object.keys(byCountry).map(function (key) { return byCountry[key]; })
      .filter(function (row) { return row.complete && row.currency && row.count > 0; })
      .sort(function (a, b) { return b.value - a.value || a.countryId.localeCompare(b.countryId); });
    return ranked[0] || null;
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
  // Game.state.finance[country] remains the canonical Treasury authority; this view is read-only.
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
    var topTradePartner = summarizeTopTradePartner(settled.imports.rows, settled.exports.rows);
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
    var importDependencyValue = num(importDependency.value);
    var exportDependencyValue = num(exportDependency.value);
    var tradeDependencyProfile = {
      label:importDependencyValue === null || exportDependencyValue === null ? 'Not recorded'
        : importDependencyValue > exportDependencyValue ? 'Import-dependent'
        : exportDependencyValue > importDependencyValue ? 'Export-oriented'
        : 'Balanced dependency',
      status:importDependencyValue === null || exportDependencyValue === null ? 'UNAVAILABLE' : 'AVAILABLE',
      detail:importDependencyValue === null || exportDependencyValue === null
        ? 'Both import and export dependency indicators are required'
        : number(importDependencyValue,1) + '% import dependency · ' + number(exportDependencyValue,1) + '% export dependency'
    };
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
      tradePartner:topTradePartner ? Object.assign({},topTradePartner,{name:countryName(topTradePartner.countryId)}) : null,
      tradeDependencyProfile:tradeDependencyProfile,
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

  function tabBar(active) {
    return '<div class="omega-v2-filterbar omega-v2-finance-tabs" role="tablist" aria-label="Finance sections">' +
      [{id:'overview',label:'Overview'},{id:'treasury',label:'Treasury & Ledger'},{id:'budget',label:'Budget'},
       {id:'debt',label:'Debt & Fiscal'},{id:'monetary',label:'Monetary & FX'},{id:'trade',label:'Trade & Revenue'}]
        .map(function (tab) { return '<button type="button" data-omega-v2-economy-tab="' + tab.id + '" aria-selected="' + (tab.id === active ? 'true' : 'false') + '">' + esc(tab.label) + '</button>'; }).join('') +
      '</div>';
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
  function economySvgIcon(name) {
    var icons = {
      bank:'<path d="M3 9h18L12 3 3 9Zm2 2v7m4-7v7m6-7v7m4-7v7M3 21h18M2 18h20"/>',
      domestic:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.6-.8-1.6-1.2-3-1.2-1.8 0-3 .9-3 2.2 0 3 6.5 1.2 6.5 4.5 0 1.4-1.3 2.5-3.4 2.5-1.5 0-2.7-.5-3.5-1.5M12 5v14"/>',
      foreign:'<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z"/>',
      reserve:'<path d="M4 7h16v13H4zM7 4h10M8 11h8m-8 3h5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
      imports:'<path d="M12 3v12m-5-5 5 5 5-5M4 19h16"/>',
      exports:'<path d="M12 21V9m-5 5 5-5 5 5M4 5h16"/>',
      balance:'<path d="M12 3v18M5 7h14M4 7l-3 7h6L4 7Zm16 0-3 7h6l-3-7ZM8 21h8"/>',
      dependency:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M3 12h3m12 0h3"/>',
      partner:'<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m7 7.5 3 2.5m7-2.5-3 2.5M7 16.5l3-2.5m7 2.5-3-2.5"/>',
      investment:'<path d="M4 21V8l8-5 8 5v13M8 21v-7h8v7M8 9h.01M12 9h.01M16 9h.01"/>',
      gdp:'<path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6"/><path d="M15 7h4v4"/>',
      growth:'<path d="m4 17 6-6 4 3 6-8M14 6h6v6"/>',
      inflation:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2M7 4 5 2m12 2 2-2"/>',
      debt:'<path d="M12 3 20 6v6c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6l8-3Z"/><path d="M8 12h8m-4-4v8"/>',
      revenue:'<path d="M4 18V6m0 12h16M7 14l3-3 3 2 5-6"/><path d="M14 7h4v4"/>',
      spending:'<path d="M12 3v13m-5-5 5 5 5-5M4 20h16"/>',
      budget:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h4m4 0h2"/>'
    };
    var glyph = icons[name] || icons.bank;
    return '<svg class="omega-economy-v3-icon-svg omega-economy-v3-icon-svg--3d" viewBox="0 0 40 40" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="omega-economy-medallion" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e0faff"/><stop offset=".28" stop-color="#55c6ec"/><stop offset=".7" stop-color="#14537d"/><stop offset="1" stop-color="#061d37"/></linearGradient><linearGradient id="omega-economy-glyph" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#b5edff"/><stop offset="1" stop-color="#5bb9e3"/></linearGradient><radialGradient id="omega-economy-gloss" cx=".3" cy=".14" r=".9"><stop stop-color="#fff" stop-opacity=".58"/><stop offset=".35" stop-color="#a4efff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="20" cy="20" r="17.5" fill="url(#omega-economy-medallion)" stroke="#c6f4ff" stroke-opacity=".8" stroke-width="1.1"/>' +
      '<circle cx="20" cy="20" r="14.5" fill="none" stroke="#75d9fa" stroke-opacity=".48" stroke-width=".8"/>' +
      '<ellipse cx="15" cy="10.2" rx="10" ry="4.8" fill="url(#omega-economy-gloss)"/>' +
      '<g transform="translate(9 9)" fill="none" stroke="#04182c" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round" opacity=".88">' + glyph + '</g>' +
      '<g transform="translate(8 8)" fill="none" stroke="url(#omega-economy-glyph)" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">' + glyph + '</g></svg>';
  }
  function economySourceText(record) {
    if (!record) return 'Source not recorded';
    var source = record.source || (record.status === 'AVAILABLE' ? 'Recorded game value' : 'Source not recorded');
    return source + (record.year ? ' · ' + record.year : '');
  }
  function economyMetricCard(label, valueText, note, trend, iconName, tone) {
    var toneClass = tone === 'positive' ? ' is-positive' : tone === 'negative' ? ' is-negative' : '';
    return '<article class="omega-economy-v3-metric' + toneClass + '">' +
      '<div class="omega-economy-v3-metric-head"><span class="omega-economy-v3-icon">' + economySvgIcon(iconName) + '</span>' +
        '<span class="omega-economy-v3-metric-label">' + esc(label) + '</span></div>' +
      '<strong class="omega-economy-v3-metric-value">' + esc(valueText) + '</strong>' +
      (trend ? trendMarkup(trend) : '') +
      (note ? '<small class="omega-economy-v3-metric-note">' + esc(note) + '</small>' : '') +
      '</article>';
  }
  function economySectionHeading(numberLabel, eyebrow, title, description, iconName, tag) {
    return '<div class="omega-economy-v3-section-heading"><span class="omega-economy-v3-section-icon">' +
      economySvgIcon(iconName) + '</span><div><span class="omega-economy-v3-section-eyebrow">' + esc(numberLabel + ' / ' + eyebrow) +
      '</span><h2>' + esc(title) + '</h2><p>' + esc(description) + '</p></div>' +
      (tag ? '<span class="omega-economy-v3-section-tag">' + esc(tag) + '</span>' : '') + '</div>';
  }
  function renderEconomyDashboard(model, cover) {
    var trend = model.trends || {};
    var currencyTitle = model.currencyCode || 'Home currency';
    var domesticValue = model.domesticCurrencyBalance === null
      ? 'Not recorded' : money(model.domesticCurrencyBalance,model.currencyCode);
    var foreignValue = model.foreignAccountsUsd === null
      ? number(model.foreignAccounts.length,0) + (model.foreignAccounts.length ? ' account(s)' : ' accounts')
      : money(model.foreignAccountsUsd,'USD');
    var tradeTone = model.tradePosition === 'Trade surplus' ? 'positive'
      : model.tradePosition === 'Trade deficit' ? 'negative' : '';
    var tradeValue = value(model.tradeBalance,'money');
    var importPartner = model.importPartner
      ? model.importPartner.name + ' · ' + money(model.importPartner.value,model.importPartner.currency)
      : 'Not recorded';
    var exportPartner = model.exportPartner
      ? model.exportPartner.name + ' · ' + money(model.exportPartner.value,model.exportPartner.currency)
      : 'Not recorded';
    var overallPartner = model.tradePartner
      ? model.tradePartner.name + ' · ' + money(model.tradePartner.value,model.tradePartner.currency)
      : 'Not recorded';
    var tradePartnerNote = model.tradePartner
      ? number(model.tradePartner.importCount,0) + ' import · ' + number(model.tradePartner.exportCount,0) + ' export settlement(s)'
      : 'No complete, currency-comparable settled partner evidence';
    var foreignRows = model.foreignAccounts.length
      ? '<div class="omega-economy-v3-account-list"><div class="omega-economy-v3-account-heading"><span>FOREIGN CURRENCY ACCOUNTS</span><span>RECORDED BALANCE</span><span>USD EQUIVALENT</span></div>' +
        model.foreignAccounts.map(function (row) {
          return '<div class="omega-economy-v3-account-row"><div><strong>' + esc(row.currencyCode) + '</strong><small>' + esc(row.currencyName) +
            '</small></div><b>' + esc(row.balance === null ? 'Not recorded' : number(row.balance,2) + ' ' + row.currencyCode) +
            '</b><small>' + esc(row.usdValue === null ? 'FX quote unavailable' : money(row.usdValue,'USD')) + '</small></div>';
        }).join('') + '</div>'
      : '<div class="omega-economy-v3-empty">No foreign-currency account balance is recorded for this country.</div>';
    var tradeToneClass = tradeTone ? ' is-' + tradeTone : '';
    return '<section class="omega-v2-shell omega-economy-overview omega-economy-v3" data-omega-economy-v3="true">' +
      '<header class="omega-economy-v3-heading"><span class="omega-economy-v3-brand-mark">' + economySvgIcon('bank') + '</span>' +
        '<div class="omega-economy-v3-heading-copy"><span>OMEGA · NATIONAL ECONOMY</span><h1>Economy Overview</h1>' +
          '<p>' + esc(model.countryName || model.countryId || 'Selected country') + ' · sovereign financial position</p></div>' +
        '<div class="omega-economy-v3-turn"><small>GAME TURN</small><strong>' + esc(model.currentTurn) + '</strong></div></header>' +
      '<section class="omega-economy-v3-hero" aria-label="Government Treasury overview">' +
        '<img class="omega-economy-v3-hero-image" loading="lazy" decoding="async" src="' + esc(cover) + '" alt="International trade port">' +
        '<div class="omega-economy-v3-hero-shade"></div><div class="omega-economy-v3-hero-content">' +
          '<div class="omega-economy-v3-hero-top"><span>SOVEREIGN FINANCIAL POSITION</span><span class="omega-economy-v3-record"><i></i> GAME RECORD</span></div>' +
          '<div class="omega-economy-v3-hero-main"><div class="omega-economy-v3-hero-primary"><small>AVAILABLE GOVERNMENT TREASURY</small>' +
            '<strong>' + esc(money(model.treasuryCash,'USD')) + '</strong>' + trendMarkup(trend.treasury) +
            '<p>Treasury cash is separate from domestic currency supply and official foreign-exchange reserves.</p></div>' +
            '<div class="omega-economy-v3-hero-side"><div><span>TRADE POSITION</span><strong class="' + tradeToneClass + '">' + esc(model.tradePosition) +
              '</strong></div><div><span>SETTLED TRADE RECORDS</span><strong>' + esc(number(model.settledTradeCount,0)) + '</strong></div></div></div></div></section>' +
      '<section class="omega-economy-v3-section">' +
        economySectionHeading('01','CURRENCY & RESERVES','National liquidity','Domestic money, foreign currency accounts and sovereign reserves.','reserve','4 INDICATORS') +
        '<div class="omega-economy-v3-grid omega-economy-v3-grid--four">' +
          economyMetricCard('Domestic currency · ' + currencyTitle,domesticValue,model.domesticCurrencyAccount ? 'Account · ' + model.domesticCurrencyAccount.currencyCode : 'Domestic currency account not recorded',trend.localCurrency,'domestic') +
          economyMetricCard('Foreign currency accounts',foreignValue,model.foreignAccounts.length + ' recorded foreign account(s) · USD conversion only when an FX quote exists',trend.foreignAccounts,'foreign') +
          economyMetricCard('Foreign-exchange reserves',value(model.foreignExchangeReserves,'money'),economySourceText(model.foreignExchangeReserves),trend.fxReserves,'reserve') +
          economyMetricCard('Treasury reserves',model.treasuryReserves === null ? 'Not recorded' : money(model.treasuryReserves,'USD'),'Finance reserve field · separate from available Treasury cash',trend.treasuryReserves,'bank') +
        '</div>' + foreignRows + '</section>' +
      '<section class="omega-economy-v3-section">' +
        economySectionHeading('02','INTERNATIONAL COMMERCE','Trade position','Settled imports and exports, trade dependency and the country’s leading partners.','balance',model.tradePosition.toUpperCase()) +
        '<div class="omega-economy-v3-trade-banner' + tradeToneClass + '"><div><small>NET TRADE BALANCE</small><strong>' + esc(tradeValue) +
          '</strong><span>' + esc(economySourceText(model.tradeBalance)) + '</span></div><span class="omega-economy-v3-trade-status">' + esc(model.tradePosition) + '</span></div>' +
        '<div class="omega-economy-v3-grid omega-economy-v3-grid--three">' +
          economyMetricCard('Total imports',value(model.imports,'money'),economySourceText(model.imports),trend.imports,'imports') +
          economyMetricCard('Total exports',value(model.exports,'money'),economySourceText(model.exports),trend.exports,'exports') +
          economyMetricCard('Import dependency',value(model.importDependency),economySourceText(model.importDependency),trend.importDependency,'dependency') +
          economyMetricCard('Export dependency',value(model.exportDependency),economySourceText(model.exportDependency),trend.exportDependency,'growth') +
          economyMetricCard('Trade dependency profile',model.tradeDependencyProfile.label,model.tradeDependencyProfile.detail,null,'balance') +
          economyMetricCard('Settled trade records',number(model.settledTradeCount,0),'Deduplicated completed settlements only',null,'partner') +
        '</div>' +
        '<div class="omega-economy-v3-partners"><div class="omega-economy-v3-partners-title"><span>TRADE NETWORK</span><strong>Leading commercial partners</strong></div>' +
          '<div class="omega-economy-v3-grid omega-economy-v3-grid--three">' +
            economyMetricCard('Largest import partner',importPartner,model.importPartner ? number(model.importPartner.count,0) + ' settled deal(s)' : 'No settled partner evidence',null,'partner') +
            economyMetricCard('Largest export partner',exportPartner,model.exportPartner ? number(model.exportPartner.count,0) + ' settled deal(s)' : 'No settled partner evidence',null,'partner') +
            economyMetricCard('Largest overall trade partner',overallPartner,tradePartnerNote,null,'foreign') +
          '</div></div>' +
        '<p class="omega-economy-v3-data-note">Trade totals use this country’s deduplicated SETTLED ledger rows. Baseline values retain their source and year; pending agreements are not counted as completed trade.</p>' +
      '</section>' +
      '<section class="omega-economy-v3-section">' +
        economySectionHeading('03','INVESTMENT & MACROECONOMY','Economic fundamentals','Capital inflows and national indicators from the existing country data registry.','investment','SOURCE-AWARE') +
        '<div class="omega-economy-v3-investment"><img loading="lazy" decoding="async" src="assets/omega-global-market/factory-refinery.svg" alt="Industrial refinery illustration">' +
          '<div><span>FOREIGN DIRECT INVESTMENT</span><strong>' + esc(value(model.foreignDirectInvestment,'money')) + '</strong>' +
            trendMarkup(trend.fdi) + '<small>' + esc(economySourceText(model.foreignDirectInvestment)) + '</small></div></div>' +
        '<div class="omega-economy-v3-grid omega-economy-v3-grid--four">' +
          economyMetricCard('GDP',value(model.gdp,'money'),economySourceText(model.gdp),trend.gdp,'gdp') +
          economyMetricCard('GDP growth',value(model.gdpGrowth),economySourceText(model.gdpGrowth),trend.gdpGrowth,'growth') +
          economyMetricCard('Inflation',value(model.inflation),economySourceText(model.inflation),trend.inflation,'inflation') +
          economyMetricCard('Public debt / GDP',value(model.debtToGdp),economySourceText(model.debtToGdp),trend.debtToGdp,'debt') +
          economyMetricCard('Recorded government revenue',model.revenue === null ? 'Not recorded' : money(model.revenue,'USD'),'Existing Finance revenue field',null,'revenue') +
          economyMetricCard('Recorded government expenditure',model.expenditure === null ? 'Not recorded' : money(model.expenditure,'USD'),'Existing Finance expenditure field',null,'spending') +
          economyMetricCard('Budget balance',model.budgetBalance === null ? 'Not recorded' : money(model.budgetBalance,'USD'),'Existing Finance budget balance field',null,'budget') +
        '</div>' +
        '<div class="omega-economy-v3-image-row"><figure><img loading="lazy" decoding="async" src="assets/omega-global-market/raw-mining.svg" alt="Raw commodity handling"><figcaption>GLOBAL COMMODITY FLOWS</figcaption></figure>' +
          '<figure><img loading="lazy" decoding="async" src="assets/omega-global-market/factory-refinery.svg" alt="Industrial refining"><figcaption>INDUSTRIAL VALUE CHAIN</figcaption></figure></div>' +
      '</section>' +
      '<div class="omega-economy-v3-ministry-link"><div><span>TRADE & COMMERCE MINISTRY</span><strong>Markets, transactions and agreements</strong><small>Open the existing ministry to manage Commodity Market, Black Market, Transactions and Trade Settlement.</small></div>' +
        '<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-economic-ministry="trade">OPEN MINISTRY <span aria-hidden="true">›</span></button></div>' +
      '<footer class="omega-economy-v3-footer">Read-only economic overview · selected-country data only · no chart engine, online refresh, world scan or new ledger is started when this screen opens.</footer>' +
    '</section>';
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'ECONOMY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var requestedPanel = String(options.tab || 'overview');
    var panelId = ['overview','treasury','budget','debt','monetary','trade'].indexOf(requestedPanel) >= 0 ? requestedPanel : 'overview';
    // The dashboard uses only SVG artwork already precached by the offline shell.
    var cover = 'assets/omega-global-market/market-header.svg';
    var html = renderEconomyDashboard(model, cover);

    root.classList.add('omega-v2-screen');
    html = html.replace('<section class="omega-v2-shell omega-economy-overview omega-economy-v3" data-omega-economy-v3="true">', '<section class="omega-v2-shell omega-economy-overview omega-economy-v3" data-omega-economy-v3="true" data-omega-v2-finance-panel="' + panelId + '">');
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
    return { ok:true, model:model, tab:panelId };
  }

  g.OmegaUIV2Economy = Object.freeze({
    version:'2.0.0',
    tabs:[
      {id:'overview',label:'Overview'}, {id:'treasury',label:'Treasury & Ledger'},
      {id:'budget',label:'Budget'}, {id:'debt',label:'Debt & Fiscal'},
      {id:'monetary',label:'Monetary & FX'}, {id:'trade',label:'Trade & Revenue'}
    ],
    buildViewModel:buildViewModel,
    render:render,
    trendFor:trendFor,
    localSettlements:localSettlements
  });
})(typeof window !== 'undefined' ? window : globalThis);
