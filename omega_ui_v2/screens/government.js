/* OMEGA UI v2 Government surfaces.
 * Country Overview reads the shared Country Data Gateway.
 * The ministry directory reads actual registered ministry records.
 */
(function (g) {
  'use strict';

  var CATEGORY_LABELS = {
    economy: 'Economy & Finance',
    defense: 'Security & Defense',
    infrastructure: 'Infrastructure',
    governance: 'Governance & Law',
    social: 'Health & Social',
    agriculture: 'Energy & Food'
  };
  var PHOTO_BY_MINISTRY = {
    interior_security: 'bangladesh-police-headquarters',
    health_welfare: 'chittagong-hospital',
    energy_mining: 'open-pit-mine',
    production: 'industrial-production-line',
    foreign_affairs: 'un-assembly-building',
    agriculture_food: 'wheat-field',
    infrastructure: 'container-ship'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function fmt(value, unit) {
    var n = finite(value);
    if (n === null) return value == null || value === '' ? 'Not recorded' : esc(value);
    if (unit === 'USD' || /USD|dollar/i.test(String(unit || ''))) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 1, notation: Math.abs(n) >= 1e9 ? 'compact' : 'standard' }).format(n);
    }
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) + (unit ? ' ' + esc(unit) : '');
  }
  function activeCountry() {
    var candidates = [
      g.OmegaMinistryViewCountry,
      g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry,
      g.CountryIOS && g.CountryIOS.activeCountry,
      g.Game && (g.Game.currentActiveCountry || g.Game.selectedCountryId),
      g.currentActiveCountry,
      g.playerCountryId,
      g.playerCountry
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] != null && String(candidates[i]).trim()) return String(candidates[i]).trim();
    }
    return '';
  }
  function snapshot(countryId) {
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    if (!gateway || typeof gateway.getSnapshot !== 'function') return null;
    try { return gateway.getSnapshot(countryId); } catch (_) { return null; }
  }
  function field(snapshotData, key) {
    var row = snapshotData && snapshotData.fields && snapshotData.fields[key];
    if (!row || row.status !== 'AVAILABLE') return { value: null, unit: row && row.unit || null, sourceName: row && row.sourceName || null, year: row && row.year || null, authority: row && row.authority || 'NONE', status: row && row.status || 'UNAVAILABLE' };
    return { value: row.value, unit: row.unit || null, sourceName: row.sourceName || row.sourceId || null, year: row.year || null, authority: row.authority || 'RECORDED', status: row.status };
  }
  function photoMarkup(id, alt) {
    var library = g.OmegaUIPhotoAssets;
    var item = library && typeof library.get === 'function' ? library.get(id) : null;
    if (!item || !/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path || ''))) return '<div class="omega-v2-photo-placeholder" aria-label="' + esc(alt) + '">OMEGA</div>';
    return '<figure class="omega-v2-photo"><img loading="lazy" decoding="async" src="' + esc(item.path) + '" alt="' + esc(alt || item.caption || 'Reference photograph') + '"><figcaption>' + esc(item.caption || 'Reference photograph') + '<small>Reference image · not evidence of current country status</small></figcaption></figure>';
  }
  function categoryOf(row) {
    return String(row && row.category || 'other');
  }
  function ministryDatabase() {
    var candidates = [
      g.OmegaCabinetUI && g.OmegaCabinetUI.ministriesDatabase,
      g.OmegaMinistry && g.OmegaMinistry.ministriesDatabase,
      g.OmegaMinistryEngine && g.OmegaMinistryEngine.ministriesDatabase
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] && typeof candidates[i] === 'object') return candidates[i];
    }
    return null;
  }
  function ministryRows() {
    var db = ministryDatabase();
    var rows = [];
    if (db) {
      Object.keys(db).forEach(function (id) {
        var row = db[id];
        if (!row || id === 'cabinet_council' || row.id === 'cabinet_council') return;
        rows.push({
          id: String(row.id || id),
          title: String(row.title || row.bnTitle || id.replace(/[_-]+/g, ' ')),
          subtitle: String(row.bnTitle || ''),
          category: categoryOf(row),
          status: String(row.status || 'NOT_RECORDED'),
          ministerName: row.ministerName || null,
          avatar: row.icon3D || row.avatar || null,
          source: 'OmegaCabinetUI.ministriesDatabase',
          raw: row
        });
      });
      return rows;
    }
    var navigation = g.OmegaUIV2Navigation;
    var ids = navigation && Array.isArray(navigation.ministryIds) ? navigation.ministryIds : [];
    return ids.map(function (id) {
      return { id: id, title: id.replace(/[_-]+/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }), subtitle: '', category: 'other', status: 'NOT_RECORDED', ministerName: null, avatar: null, source: 'OmegaUIV2Navigation fallback', raw: null };
    });
  }
  function findMinistry(id) {
    var rows = ministryRows();
    for (var i = 0; i < rows.length; i += 1) if (rows[i].id === String(id)) return rows[i];
    return null;
  }
  function callOpenMinistry(id, options) {
    if (options && typeof options.onOpenMinistry === 'function') return options.onOpenMinistry(id, findMinistry(id));
    var manager = g.OmegaLayerManager;
    if (manager && typeof manager.setLayer === 'function') {
      return manager.setLayer(2, { ministryId: id });
    }
    return false;
  }
  function metricCard(title, metric) {
    var source = metric.sourceName ? String(metric.sourceName) : 'Source not recorded';
    var year = metric.year ? ' · ' + metric.year : '';
    var detail = source + year + (metric.status && metric.status !== 'AVAILABLE' ? ' · ' + metric.status : '');
    return '<div class="omega-v2-kpi"><span>' + esc(title) + '</span><strong>' + fmt(metric.value, metric.unit) + '</strong><small>' + esc(detail) + '</small></div>';
  }
  function overviewHtml(countryId, options) {
    var data = snapshot(countryId);
    if (!data || !data.identity) {
      return '<section class="omega-v2-overview"><div class="omega-v2-empty">Country overview data is not available for ' + esc(countryId || 'the selected country') + '. The source gateway did not return a resolved identity; no country statistics were invented.</div></section>';
    }
    var identity = data.identity || {};
    var displayName = identity.officialName || identity.name || data.countryCode || countryId;
    var coverage = data.diagnostics && data.diagnostics.missingFields;
    var fields = [
      ['GDP', 'gdp'], ['Population', 'population'], ['GDP growth', 'gdpGrowth'],
      ['Inflation', 'inflation'], ['Unemployment', 'unemployment'],
      ['Public debt / GDP', 'debtToGdpPct'], ['Trade balance', 'tradeBalance'], ['FX reserves', 'reserves']
    ];
    var cards = fields.map(function (entry) { return metricCard(entry[0], field(data, entry[1])); }).join('');
    var rows = ministryRows();
    var shortcutIds = ['treasury_finance', 'energy_mining', 'production', 'interior_security', 'foreign_affairs', 'mega_projects'];
    var shortcuts = rows.filter(function (row) { return shortcutIds.indexOf(row.id) >= 0; }).map(function (row) {
      var photoId = PHOTO_BY_MINISTRY[row.id];
      return '<article class="omega-v2-card"><div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title">' + esc(row.title) + '</h3><div class="omega-v2-card-meta">' + esc(row.subtitle || CATEGORY_LABELS[row.category] || 'Ministry') + '</div></div></div>' +
        (photoId ? photoMarkup(photoId, row.title + ' reference photograph') : '') +
        '<div class="omega-v2-actions"><button class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-ministry="' + esc(row.id) + '">Open ministry</button></div></article>';
    }).join('');
    return '<section class="omega-v2-overview">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">EXECUTIVE MINISTRY · COUNTRY OVERVIEW</div><h1 class="omega-v2-title">' + esc(displayName) + '</h1><p class="omega-v2-subtitle">Country snapshot from registered sources and the current simulation. Missing fields are never displayed as zero.</p></div>' +
      '<span class="omega-v2-status" data-state="' + (data.status === 'OK' || data.status === 'AVAILABLE' ? 'operational' : 'attention') + '">' + esc(data.status || 'DATA STATUS NOT RECORDED') + '</span></header>' +
      (String(data.countryCode || '').toUpperCase() === 'BGD' ? photoMarkup('bangladesh-parliament', 'Bangladesh parliament building, reference image') : photoMarkup('un-assembly-building', 'United Nations Assembly building, international reference image')) +
      '<h2 class="omega-v2-section-title">National snapshot</h2><div class="omega-v2-kpis">' + cards + '</div>' +
      '<h2 class="omega-v2-section-title">Executive priorities and alerts</h2><div class="omega-v2-note">Only alerts and decisions returned by a registered gameplay source should be placed here. This UI foundation does not invent crisis alerts.</div>' +
      '<h2 class="omega-v2-section-title">Government, security, resources and industry</h2><div class="omega-v2-grid">' + shortcuts + '</div>' +
      '<h2 class="omega-v2-section-title">Data coverage & missing fields</h2><div class="omega-v2-card"><div class="omega-v2-card-title">' +
      (coverage && coverage.length ? Math.max(0, Object.keys(data.fields || {}).length - coverage.length) + ' recorded field(s) · ' + coverage.length + ' missing field(s)' : Object.keys(data.fields || {}).length + ' field(s) returned by the gateway') +
      '</div>' + (coverage && coverage.length ? '<details><summary>Inspect missing fields</summary><ul>' + coverage.map(function (row) { return '<li>' + esc(typeof row === 'string' ? row : row.field || row.name || JSON.stringify(row)) + '</li>'; }).join('') + '</ul></details>' : '<p class="omega-v2-card-meta">The gateway did not report a missing-field list for this snapshot.</p>') + '</div>' +
      '</section>';
  }
  function directoryCard(row) {
    var icon = row.avatar && /^[\u0000-\uFFFF]{1,4}$/.test(String(row.avatar)) ? '<span class="omega-v2-ministry-icon" aria-hidden="true">' + esc(row.avatar) + '</span>' : '<span class="omega-v2-ministry-icon" aria-hidden="true">▣</span>';
    var photoId = PHOTO_BY_MINISTRY[row.id];
    var status = row.status || 'NOT_RECORDED';
    var img = photoId ? photoMarkup(photoId, row.title + ' reference photograph') : '';
    return '<article class="omega-v2-card" data-omega-v2-ministry-card data-search="' + esc((row.title + ' ' + row.subtitle + ' ' + row.id + ' ' + row.category).toLowerCase()) + '" data-category="' + esc(row.category) + '">' +
      '<div class="omega-v2-card-header"><div>' + icon + '<h3 class="omega-v2-card-title">' + esc(row.title) + '</h3><div class="omega-v2-card-meta">' + esc(row.subtitle || CATEGORY_LABELS[row.category] || row.category) + '</div></div><span class="omega-v2-status" data-state="unknown">Registered profile</span></div>' +
      img +
      '<div class="omega-v2-card-meta">Minister: ' + esc(row.ministerName || 'Not recorded') + '</div>' +
      '<div class="omega-v2-card-meta">Profile label: ' + esc(status || 'Not recorded') + ' · Live operational state is shown only when supplied by a verified runtime.</div>' +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-ministry="' + esc(row.id) + '">Open ministry</button></div>' +
      '</article>';
  }
  function applyDirectoryFilters(root) {
    var queryNode = root.querySelector('[data-omega-v2-ministry-search]');
    var filterNode = root.querySelector('[data-omega-v2-ministry-filter]');
    var q = String(queryNode && queryNode.value || '').trim().toLowerCase();
    var filter = String(filterNode && filterNode.value || 'all');
    var cards = root.querySelectorAll('[data-omega-v2-ministry-card]');
    Array.prototype.forEach.call(cards, function (card) {
      card.hidden = !!((q && String(card.getAttribute('data-search') || '').indexOf(q) < 0) ||
        (filter !== 'all' && card.getAttribute('data-category') !== filter));
    });
    var countNode = root.querySelector('[data-omega-v2-ministry-count]');
    var visible = root.querySelectorAll('[data-omega-v2-ministry-card]:not([hidden])').length;
    if (countNode) countNode.textContent = String(visible);
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok: false, code: 'GOVERNMENT_ROOT_REQUIRED' };
    var countryId = options.countryId || activeCountry();
    var view = options.view === 'all-ministries' ? 'all-ministries' : 'executive-ministry';
    var rows = ministryRows();
    var nav = g.OmegaUIV2Navigation;
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-government">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">GOVERNMENT</div><h1 class="omega-v2-title">National Government</h1><p class="omega-v2-subtitle">Selected country: ' + esc(countryId || 'Not recorded') + '</p></div></header>' +
      '<div class="omega-v2-government-tabs" role="group" aria-label="Government destinations">' +
      '<button type="button" class="omega-v2-button ' + (view === 'executive-ministry' ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-government-view="executive-ministry" aria-pressed="' + (view === 'executive-ministry' ? 'true' : 'false') + '">Executive Ministry</button>' +
      '<button type="button" class="omega-v2-button ' + (view === 'all-ministries' ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-government-view="all-ministries" aria-pressed="' + (view === 'all-ministries' ? 'true' : 'false') + '">All Ministries</button></div>' +
      (view === 'executive-ministry'
        ? overviewHtml(countryId, options)
        : '<section class="omega-v2-ministry-directory"><header class="omega-v2-heading"><div><h2 class="omega-v2-title">All Ministries</h2><p class="omega-v2-subtitle">Only registered ministry records are shown. Executive Ministry is a separate destination, not a duplicate directory card.</p></div><span class="omega-v2-status">' + rows.length + ' registered records</span></header>' +
          (rows.length !== 18 ? '<div class="omega-v2-note">The existing operational ministry database exposes ' + rows.length + ' regular records. Its former “18 Ministries” label includes a separate cabinet record; this directory does not duplicate it or invent a filler ministry.</div>' : '') +
          '<div class="omega-v2-filterbar"><input type="search" aria-label="Search ministries" placeholder="Search a ministry" data-omega-v2-ministry-search>' +
          '<select aria-label="Filter ministry category" data-omega-v2-ministry-filter><option value="all">All categories</option>' +
          Object.keys(CATEGORY_LABELS).map(function (key) { return '<option value="' + esc(key) + '">' + esc(CATEGORY_LABELS[key]) + '</option>'; }).join('') +
          '</select></div><p class="omega-v2-card-meta">Showing <strong data-omega-v2-ministry-count>' + rows.length + '</strong> ministry record(s).</p>' +
          '<div class="omega-v2-grid">' + rows.map(directoryCard).join('') + '</div></section>') +
      '</section>';

    if (!root.__omegaV2GovernmentBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-government-view]');
        if (tab && root.contains(tab)) {
          root.__omegaV2GovernmentView = tab.getAttribute('data-omega-v2-government-view');
          render(root, Object.assign({}, root.__omegaV2GovernmentOptions || {}, { view: root.__omegaV2GovernmentView }));
          return;
        }
        var ministry = target.closest('[data-omega-v2-open-ministry]');
        if (ministry && root.contains(ministry)) {
          callOpenMinistry(ministry.getAttribute('data-omega-v2-open-ministry'), root.__omegaV2GovernmentOptions || {});
        }
      });
      root.addEventListener('input', function (event) {
        if (event && event.target && event.target.matches && event.target.matches('[data-omega-v2-ministry-search]')) applyDirectoryFilters(root);
      });
      root.addEventListener('change', function (event) {
        if (event && event.target && event.target.matches && event.target.matches('[data-omega-v2-ministry-filter]')) applyDirectoryFilters(root);
      });
      root.__omegaV2GovernmentBound = true;
    }
    root.__omegaV2GovernmentOptions = options;
    root.__omegaV2GovernmentView = view;
    if (view === 'all-ministries') applyDirectoryFilters(root);
    return { ok: true, view: view, ministryCount: rows.length, countryId: countryId || null };
  }

  g.OmegaUIV2Government = Object.freeze({
    version: '1.0.0',
    render: render,
    renderExecutiveOverview: overviewHtml,
    getMinistryRows: ministryRows,
    getCountrySnapshot: snapshot,
    getMetricField: field
  });
})(typeof window !== 'undefined' ? window : globalThis);
