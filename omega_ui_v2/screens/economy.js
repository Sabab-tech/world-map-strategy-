/* OMEGA UI v2 economy summary. This is a view over existing ledgers, not a new ledger. */
(function (g) {
  'use strict';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function fmt(v, unit) {
    var n = num(v);
    if (n === null) return v == null || v === '' ? 'Not recorded' : esc(v);
    if (String(unit || '').toUpperCase() === 'USD') return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:1, notation:Math.abs(n) >= 1e9 ? 'compact' : 'standard' }).format(n);
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
    var source = record.source ? String(record.source) + (record.year ? ' · ' + record.year : '') : 'Source not recorded';
    return item(label, fmt(record.value, record.unit), source);
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'ECONOMY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var links = [
      ['treasury_finance','Treasury & Finance','Budget allocations, expenditure and fiscal ledger'],
      ['taxes','Taxes & Revenue','Recorded tax rules and collections'],
      ['central_bank','Central Bank','Monetary indicators and FX references'],
      ['trade','Trade & Commerce','Imports, exports and partner routes']
    ];
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-economy">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ECONOMY · FINANCE</div><h1 class="omega-v2-title">Economy & Treasury</h1><p class="omega-v2-subtitle">Country ' + esc(model.countryId || 'Not recorded') + ' · recorded game ledger and country indicators</p></div><span class="omega-v2-status" data-state="' + (model.snapshot ? 'operational' : 'unknown') + '">' + (model.snapshot ? 'DATA GATEWAY CONNECTED' : 'REFERENCE SNAPSHOT UNAVAILABLE') + '</span></header>' +
      '<div class="omega-v2-note">Game cash, national debt and published macroeconomic indicators are separate concepts. Reference exchange rates never execute a treasury transfer; missing figures are not filled with defaults.</div>' +
      '<h2 class="omega-v2-section-title">Live game treasury ledger</h2><div class="omega-v2-kpis">' +
      item('Available treasury', fmt(model.treasuryCash,'USD'), 'Game finance state') +
      item('Treasury reserves', fmt(model.treasuryReserves,'USD'), 'Game finance state') +
      item('Recorded revenue', fmt(model.revenue,'USD'), 'Game finance state') +
      item('Recorded expenditure', fmt(model.expenditure,'USD'), 'Game finance state') +
      item('Budget balance', fmt(model.budgetBalance,'USD'), 'Game finance state') +
      item('Currency', model.currencyCode || 'Not recorded', 'Game finance/economy state') +
      item('Ledger rows', fmt(model.fiscalLedgerCount), 'Recorded transactions only') + '</div>' +
      '<h2 class="omega-v2-section-title">Country macro indicators</h2><div class="omega-v2-kpis">' +
      metric('GDP',model.gdp) + metric('Inflation',model.inflation) + metric('Public debt / GDP',model.debtToGdp) + metric('Public debt',model.debt) + metric('Trade balance',model.tradeBalance) + metric('Foreign-exchange reserves',model.fxReserves) + '</div>' +
      '<h2 class="omega-v2-section-title">Open a source ministry</h2><div class="omega-v2-grid">' +
      links.map(function (link) { var enabled = !!(options && typeof options.onOpenMinistry === 'function') || !!(g.OmegaLayerManager && typeof g.OmegaLayerManager.setLayer === 'function'); return '<article class="omega-v2-card"><h3 class="omega-v2-card-title">' + esc(link[1]) + '</h3><p class="omega-v2-card-meta">' + esc(link[2]) + '</p><div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-economic-ministry="' + esc(link[0]) + '"' + (enabled ? '' : ' disabled') + '>Open ministry</button></div></article>'; }).join('') +
      '</div><p class="omega-v2-source">Data authority: ' + esc(model.source) + '</p></section>';
    if (!root.__omegaV2EconomyBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        var button = target && typeof target.closest === 'function' ? target.closest('[data-omega-v2-open-economic-ministry]') : null;
        if (!button || !root.contains(button) || button.disabled) return;
        var id = button.getAttribute('data-omega-v2-open-economic-ministry');
        var callback = root.__omegaV2EconomyOptions && root.__omegaV2EconomyOptions.onOpenMinistry;
        if (typeof callback === 'function') callback(id);
        else if (g.OmegaLayerManager && typeof g.OmegaLayerManager.setLayer === 'function') g.OmegaLayerManager.setLayer(2, { ministryId:id });
      });
      root.__omegaV2EconomyBound = true;
    }
    root.__omegaV2EconomyOptions = options;
    return { ok:true, model:model };
  }
  g.OmegaUIV2Economy = Object.freeze({ version:'1.0.0', buildViewModel:buildViewModel, render:render });
})(typeof window !== 'undefined' ? window : globalThis);
