/* OMEGA UI v2 economy summary. This is a view over existing ledgers, not a new ledger. */
(function (g) {
  'use strict';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function fmt(v, unit) {
    var n = num(v);
    if (n === null) return v == null || v === '' ? 'Not recorded' : esc(v);
    if (String(unit || '').toUpperCase() === 'USD') {
      // Android 9's Chromium 66 WebView can reject currency formatting when
      // maximumFractionDigits is below the currency's default minimum (2).
      // Its Intl.NumberFormat also predates the "notation" compact option, so
      // scale large values explicitly and provide a valid minimum/maximum pair.
      var absolute = Math.abs(n);
      var divisor = 1;
      var suffix = '';
      if (absolute >= 1e12) { divisor = 1e12; suffix = 'T'; }
      else if (absolute >= 1e9) { divisor = 1e9; suffix = 'B'; }
      var fractionDigits = suffix ? 1 : 2;
      var minimumFractionDigits = suffix ? 0 : 2;
      var formatted = new Intl.NumberFormat('en-US', {
        style:'currency',
        currency:'USD',
        minimumFractionDigits:minimumFractionDigits,
        maximumFractionDigits:fractionDigits
      }).format(n / divisor);
      return formatted + suffix;
    }
    return new Intl.NumberFormat('en-US', { maximumFractionDigits:2 }).format(n) + (unit ? ' ' + esc(unit) : '');
  }
  function getBucket(root, country) {
    if (!root || typeof root !== 'object') return null;
    var key = String(country || '').toUpperCase();
    if (root[key]) return root[key];
    return Object.keys(root).reduce(function (found, k) { return found || (k.toUpperCase() === key ? root[k] : null); }, null);
  }
  function getCountrySnapshot(country) {
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    try { return gateway && gateway.getSnapshot ? gateway.getSnapshot(country) : null; } catch (_) { return null; }
  }
  function buildViewModel(options) {
    options = options || {};
    var country = String(options.countryId || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '').toUpperCase();
    var root = g.Game && g.Game.state || g.gameState || {};
    var finance = getBucket(root.finance, country) || {};
    var economy = getBucket(root.economy, country) || {};
    var snapshot = getCountrySnapshot(country);
    var fields = snapshot && snapshot.fields || {};
    function sourced(id) {
      var field = fields[id];
      return field && field.status === 'AVAILABLE'
        ? { value: field.value, unit: field.unit || null, source: field.sourceName || field.sourceId || null, year: field.year || null, status:'AVAILABLE' }
        : { value:null, unit:field && field.unit || null, source:field && (field.sourceName || field.sourceId) || null, year:field && field.year || null, status:field && field.status || 'UNAVAILABLE' };
    }
    return {
      countryId: country || null,
      snapshot: snapshot,
      treasuryCash: num(finance.available !== undefined ? finance.available : finance.cash),
      treasuryReserves: num(finance.reserves),
      currencyCode: finance.currencyCode || economy.currencyCode || economy.currency_code || null,
      revenue: num(finance.revenue),
      expenditure: num(finance.expenditure),
      budgetBalance: num(finance.budgetBalance),
      debt: sourced('debt'),
      debtToGdp: sourced('debtToGdpPct'),
      gdp: sourced('gdp'),
      inflation: sourced('inflation'),
      tradeBalance: sourced('tradeBalance'),
      fxReserves: sourced('reserves'),
      fiscalLedgerCount: Array.isArray(finance.ledger) ? finance.ledger.length : Array.isArray(finance.transactions) ? finance.transactions.length : null,
      source:'Game.state.finance[country] / Game.state.economy[country] / OmegaCountryDataGateway'
    };
  }
  function item(label, value, source) {
    return '<div class="omega-v2-kpi"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong>' + (source ? '<small>' + esc(source) + '</small>' : '') + '</div>';
  }
  function metric(label, record) {
    var source = record.year ? 'Year ' + String(record.year) : '';
    return item(label, fmt(record.value, record.unit), source);
  }
  function photoMarkup(id,alt,caption) {
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get(id):null;}catch(_){}
    var safe=/^[a-z0-9-]+$/.test(String(id||''))?String(id):'',path=item&&/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path||''))?item.path:(safe?'assets/ui-photos/'+safe+'.webp':'');
    if(!path)return '<div class="omega-v2-photo-placeholder" role="img" aria-label="'+esc(alt)+'">LOCAL PHOTO UNAVAILABLE</div>';
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo omega-v2-photo--hero"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="'+esc(alt)+'"><figcaption><strong>'+esc(item&&item.caption||caption)+'</strong><small>Representative reference imagery, not evidence of current ownership or operation.</small>'+credit+'</figcaption></figure>';
  }
  var TABS = [
    { id:'overview', label:'Overview' }, { id:'treasury', label:'Treasury & Ledger' },
    { id:'budget', label:'Budget' }, { id:'debt', label:'Debt & Fiscal' },
    { id:'monetary', label:'Monetary & FX' }, { id:'trade', label:'Trade & Revenue' }
  ];
  function tabBar(active) {
    return '<div class="omega-v2-filterbar omega-v2-finance-tabs" role="tablist" aria-label="Finance sections">' + TABS.map(function (tab) {
      var selected = tab.id === active;
      return '<button type="button" role="tab" aria-selected="' + (selected ? 'true' : 'false') + '" aria-pressed="' + (selected ? 'true' : 'false') + '" class="omega-v2-button ' + (selected ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-economy-tab="' + esc(tab.id) + '">' + esc(tab.label) + '</button>';
    }).join('') + '</div>';
  }
  function financeLinks(links, options) {
    return '<div class="omega-v2-grid">' + links.map(function (link) {
      var enabled = !!(options && typeof options.onOpenMinistry === 'function') || !!(g.OmegaLayerManager && typeof g.OmegaLayerManager.setLayer === 'function');
      return '<article class="omega-v2-card"><h3 class="omega-v2-card-title">' + esc(link[1]) + '</h3><p class="omega-v2-card-meta">' + esc(link[2]) + '</p><div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-economic-ministry="' + esc(link[0]) + '"' + (enabled ? '' : ' disabled') + '>Open ministry</button></div></article>';
    }).join('') + '</div>';
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'ECONOMY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var requestedTab = options.tab || root.__omegaV2EconomyTab || 'overview';
    var active = TABS.some(function (tab) { return tab.id === requestedTab; }) ? requestedTab : 'overview';
    var links = [
      ['treasury_finance','Treasury & Finance','Budget allocations, expenditure and fiscal ledger'],
      ['taxes','Taxes & Revenue','Recorded tax rules and collections'],
      ['central_bank','Central Bank','Monetary indicators and FX references'],
      ['trade','Trade & Commerce','Imports, exports and partner routes']
    ];
    var content = '';
    if (active === 'overview') {
      content = photoMarkup('container-ship', 'Container ship at an international port, representative trade reference image', 'TRADE & NATIONAL ACCOUNTS') +
        '<div class="omega-v2-note">Treasury balances, public debt and national economic indicators describe different parts of the economy.</div>' +
        '<h2 class="omega-v2-section-title">National finance snapshot</h2><div class="omega-v2-kpis">' +
        item('Available treasury', fmt(model.treasuryCash,'USD'), 'Treasury ledger') + item('Recorded revenue', fmt(model.revenue,'USD'), 'Game finance state') +
        item('Recorded expenditure', fmt(model.expenditure,'USD'), 'Game finance state') + item('Budget balance', fmt(model.budgetBalance,'USD'), 'Game finance state') +
        metric('GDP',model.gdp) + metric('Inflation',model.inflation) + metric('Public debt / GDP',model.debtToGdp) + metric('Foreign-exchange reserves',model.fxReserves) + '</div>';
    } else if (active === 'treasury') {
      content = '<div class="omega-v2-note">Review the current treasury balance, reserves and recorded transactions.</div><h2 class="omega-v2-section-title">Treasury &amp; ledger</h2><div class="omega-v2-kpis">' +
        item('Available treasury',fmt(model.treasuryCash,'USD'),'Game finance state') + item('Treasury reserves',fmt(model.treasuryReserves,'USD'),'Game finance state') +
        item('Currency',model.currencyCode || 'Not recorded','Selected currency') + item('Ledger rows',fmt(model.fiscalLedgerCount),'Recorded transactions only') + '</div>' + financeLinks([links[0]],options);
    } else if (active === 'budget') {
      content = '<h2 class="omega-v2-section-title">Budget &amp; fiscal period</h2><div class="omega-v2-kpis">' +
        item('Recorded revenue',fmt(model.revenue,'USD'),'Game finance state') + item('Recorded expenditure',fmt(model.expenditure,'USD'),'Game finance state') +
        item('Budget balance',fmt(model.budgetBalance,'USD'),'Game finance state') + '</div><div class="omega-v2-note">Revenue, expenditure and budget balance are separate figures. Unavailable values remain Not recorded.</div>' + financeLinks([links[0],links[1]],options);
    } else if (active === 'debt') {
      content = '<h2 class="omega-v2-section-title">Public debt &amp; fiscal sustainability</h2><div class="omega-v2-kpis">' +
        metric('Public debt',model.debt) + metric('Public debt / GDP',model.debtToGdp) + metric('GDP',model.gdp) + '</div><div class="omega-v2-note">Debt schedules and maturity details appear when they have been recorded.</div>' + financeLinks([links[0]],options);
    } else if (active === 'monetary') {
      content = '<h2 class="omega-v2-section-title">Monetary indicators &amp; foreign exchange</h2><div class="omega-v2-kpis">' +
        item('Currency',model.currencyCode || 'Not recorded','Game finance/economy state') + metric('Inflation',model.inflation) + metric('Foreign-exchange reserves',model.fxReserves) + '</div><div class="omega-v2-note">Economic indicators describe the economy; they do not change treasury balances.</div>' + financeLinks([links[2]],options);
    } else {
      content = '<h2 class="omega-v2-section-title">Trade balance &amp; national revenue links</h2><div class="omega-v2-kpis">' +
        metric('Trade balance',model.tradeBalance) + item('Recorded revenue',fmt(model.revenue,'USD'),'Game finance state') + '</div>' + financeLinks([links[3],links[1]],options);
    }
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-economy">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ECONOMY · FINANCE</div><h1 class="omega-v2-title">Economy &amp; Treasury</h1><p class="omega-v2-subtitle">Country ' + esc(model.countryId || 'Not recorded') + ' · national accounts and government finances</p></div><span class="omega-v2-status" data-state="' + (model.snapshot ? 'operational' : 'unknown') + '">' + (model.snapshot ? 'INDICATORS AVAILABLE' : 'INDICATORS UNAVAILABLE') + '</span></header>' +
      tabBar(active) + '<section class="omega-v2-finance-tab-panel" role="tabpanel" data-omega-v2-finance-panel="' + esc(active) + '">' + content + '</section>' +
      '</section>';
    if (!root.__omegaV2EconomyBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tabButton = target.closest('[data-omega-v2-economy-tab]');
        if (tabButton && root.contains(tabButton)) {
          render(root, Object.assign({}, root.__omegaV2EconomyOptions || {}, { tab:tabButton.getAttribute('data-omega-v2-economy-tab') }));
          return;
        }
        var button = target.closest('[data-omega-v2-open-economic-ministry]');
        if (!button || !root.contains(button) || button.disabled) return;
        var id = button.getAttribute('data-omega-v2-open-economic-ministry');
        var callback = root.__omegaV2EconomyOptions && root.__omegaV2EconomyOptions.onOpenMinistry;
        if (typeof callback === 'function') callback(id);
        else if (g.OmegaLayerManager && typeof g.OmegaLayerManager.setLayer === 'function') g.OmegaLayerManager.setLayer(2, { ministryId:id });
      });
      root.__omegaV2EconomyBound = true;
    }
    root.__omegaV2EconomyOptions = options;
    root.__omegaV2EconomyTab = active;
    return { ok:true, model:model, tab:active };
  }
  g.OmegaUIV2Economy =  g.OmegaUIV2Economy = Object.freeze({ version:'1.0.0', tabs:TABS.slice(), buildViewModel:buildViewModel, render:render });
})(typeof window !== 'undefined' ? window : globalThis);
