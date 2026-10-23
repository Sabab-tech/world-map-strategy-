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
  function activeMinisterProfile(ministryId) {
    var selector = g.OmegaLiveMinisterSelectorV9;
    if (!selector || typeof selector.active !== 'function') return null;
    try { var active = selector.active(ministryId); return active && (active.profile || active.staticProfile) || null; }
    catch (_) { return null; }
  }
  function ministryRows() {
    var db = ministryDatabase();
    var rows = [];
    if (db) {
      Object.keys(db).forEach(function (id) {
        var row = db[id];
        if (!row || id === 'cabinet_council' || row.id === 'cabinet_council') return;
        var canonicalId = String(row.id || id);
        var activeProfile = activeMinisterProfile(canonicalId) || {};
        rows.push({
          id: canonicalId,
          title: String(row.title || row.bnTitle || id.replace(/[_-]+/g, ' ')),
          subtitle: String(row.bnTitle || ''),
          category: categoryOf(row),
          status: String(row.status || 'NOT_RECORDED'),
          ministerName: activeProfile.baseName || activeProfile.name || activeProfile.ministerName || row.ministerName || null,
          ministerPortraitUrl: row.ministerPortraitUrl || row.portraitUrl || row.ministerPhotoUrl || row.ministerPhoto || activeProfile.portraitUrl || activeProfile.photoUrl || activeProfile.imageUrl || null,
          avatar: row.icon3D || row.avatar || null,
          activeMinisterProfile: activeProfile,
          source: 'OmegaCabinetUI.ministriesDatabase + canonical minister lifecycle',
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
  function ministryEmblem(row) {
    var symbols = {
      trade:'<path d="M3 8h12l-3-3m3 3-3 3M21 16H9l3-3m-3 3 3 3"/>',
      production:'<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8m0-14.2-2.8 2.8m-8.6 8.6-2.8 2.8"/>',
      taxes:'<path d="M4 19h16M6 15h3v-5H6zm5 0h3V6h-3zm5 0h3V9h-3z"/>',
      central_bank:'<path d="M3 9h18L12 4 3 9zm2 2v6m4-6v6m6-6v6m4-6v6M3 20h18"/>',
      laws:'<path d="M12 4v15m-6-13h12M6 6l-4 7h8L6 6zm12 0-4 7h8l-4-7zM8 22h8"/>',
      education:'<path d="M3 5c4-2 7-1 9 1 2-2 5-3 9-1v14c-4-2-7-1-9 1-2-2-5-3-9-1zM12 6v14"/>',
      infrastructure:'<path d="M3 20V8l9-5 9 5v12M3 12h18M7 12v8m5-8v8m5-8v8"/>',
      science_research:'<path d="M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/>',
      defense:'<path d="M12 2 20 5v6c0 5-3 8-8 11-5-3-8-6-8-11V5zM8 12l3 3 5-6"/>',
      foreign_affairs:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
      energy_mining:'<path d="M13 2 5 13h6l-1 9 9-13h-6z"/>',
      intelligence_cyber:'<path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
      agriculture_food:'<path d="M12 21V9m0 5C4 14 3 8 3 5c6 0 9 3 9 9m0-1c0-6 4-9 9-9 0 5-2 10-9 10"/>',
      interior_security:'<path d="M12 2 20 5v6c0 5-3 8-8 11-5-3-8-6-8-11V5zM8 13v-3l4-3 4 3v3M10 17v-4h4v4"/>',
      health_welfare:'<path d="M12 3v18M3 12h18"/>',
      treasury_finance:'<path d="M3 8h18l-9-5-9 5zm2 3v6m5-6v6m4-6v6m5-6v6M3 20h18"/>',
      mega_projects:'<path d="M4 21V8m0 0 7 4M4 8l9-5M13 3v12m0-12 6 2m-6 4h7l-2 3h-5m-10 9h18"/>'
    };
    var symbol = symbols[row.id] || '<circle cx="12" cy="12" r="7"/><path d="M12 8v8m-4-4h8"/>';
    return '<span class="omega-v2-ministry-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + symbol + '</svg></span>';
  }

  function ministerPortraitMarkup(row) {
    var profile = row && row.activeMinisterProfile || {};
    var source = String(row && row.ministerPortraitUrl || profile.portraitUrl || profile.photoUrl || profile.imageUrl || '').trim();
    var safeLocalImage = /^(assets|images)\/[a-z0-9/_-]+\.(webp|png|jpe?g)$/i.test(source);
    var name = row && row.ministerName || profile.baseName || profile.name || 'Minister not assigned';
    return '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot aria-label="Minister portrait slot for ' + esc(name) + '">' +
      (safeLocalImage ? '<img data-omega-v2-minister-portrait src="' + esc(source) + '" loading="lazy" decoding="async" alt="Portrait of ' + esc(name) + '">' : '<span class="omega-v2-minister-portrait-placeholder">MINISTER PORTRAIT</span><small>Image pending</small>') +
      '</div>';
  }
  function ministerRecruitmentTable(rows) {
    return '<div class="omega-v2-table-wrap omega-v2-minister-table-wrap"><table class="omega-v2-minister-table"><thead><tr><th scope="col">Ministry / Emblem</th><th scope="col">Minister &amp; portrait</th><th scope="col">Registry status</th><th scope="col">Recruitment</th><th scope="col">Details</th></tr></thead><tbody>' + rows.map(function (row) {
      var activeName = row.ministerName || 'Vacant / not recorded';
      return '<tr data-omega-v2-ministry-card data-search="' + esc((row.title + ' ' + row.subtitle + ' ' + row.id + ' ' + row.category + ' ' + activeName).toLowerCase()) + '" data-category="' + esc(row.category) + '">' +
        '<td><div class="omega-v2-minister-table-title">' + ministryEmblem(row) + '<div><strong>' + esc(row.title) + '</strong><small>' + esc(row.subtitle || CATEGORY_LABELS[row.category] || row.category) + '</small></div></div></td>' +
        '<td><div class="omega-v2-minister-table-person">' + ministerPortraitMarkup(row) + '<div><strong>' + esc(activeName) + '</strong><small>' + esc(row.activeMinisterProfile && (row.activeMinisterProfile.role || row.activeMinisterProfile.position) || 'Current assignment not independently recorded') + '</small></div></div></td>' +
        '<td><span class="omega-v2-status" data-state="unknown">' + esc(row.status || 'NOT_RECORDED') + '</span><small class="omega-v2-minister-source">' + esc(row.source || 'Registered ministry record') + '</small></td>' +
        '<td><button type="button" class="omega-v2-button omega-v2-button--accent" data-omega-v2-minister-recruitment="' + esc(row.id) + '">Recruit / Replace</button></td>' +
        '<td><button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-open-ministry="' + esc(row.id) + '">Open</button></td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
  }
  function recruitmentPanel(ministryId) {
    var row = ministryRows().find(function (item) { return item.id === ministryId; });
    return '<section class="omega-v2-card omega-v2-minister-recruitment-panel" data-omega-v2-minister-recruitment-panel data-ministry-id="' + esc(ministryId) + '" aria-labelledby="omega-v2-minister-recruitment-title">' +
      '<div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title" id="omega-v2-minister-recruitment-title">Minister recruitment · ' + esc(row && row.title || ministryId) + '</h3><p class="omega-v2-card-meta">Profiles come from the canonical minister roster; appointments use the existing minister lifecycle.</p></div><button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-cancel-minister-recruitment>Close</button></div>' +
      '<p class="omega-v2-card-meta" role="status" data-omega-v2-minister-roster-status>Loading verified candidate roster…</p>' +
      '<label class="omega-v2-field-label" for="omega-v2-minister-candidate">Candidate</label><select id="omega-v2-minister-candidate" data-omega-v2-minister-candidate disabled><option value="">Loading candidates…</option></select>' +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-confirm-minister disabled>Appoint selected minister</button></div>' +
      '<p class="omega-v2-source">If roster or appointment validation is unavailable, the UI reports the blocker; it does not fabricate candidates or silently change assignments.</p></section>';
  }
  function loadMinisterCandidates(root, ministryId, countryId) {
    var panel = root.querySelector('[data-omega-v2-minister-recruitment-panel]');
    if (!panel || panel.getAttribute('data-ministry-id') !== ministryId) return;
    var status = panel.querySelector('[data-omega-v2-minister-roster-status]');
    var select = panel.querySelector('[data-omega-v2-minister-candidate]');
    var button = panel.querySelector('[data-omega-v2-confirm-minister]');
    var engine = g.OmegaMinisterRecruitment;
    if (!engine || typeof engine.fetchRoster !== 'function') {
      if (status) status.textContent = 'Canonical minister roster unavailable. No candidates were fabricated.';
      return;
    }
    Promise.resolve().then(function () { return engine.fetchRoster(ministryId, countryId); }).then(function (candidates) {
      if (root.__omegaV2RecruitingMinistry !== ministryId || !select || !root.contains(panel)) return;
      var valid = Array.isArray(candidates) ? candidates.filter(function (item) { return item && (item.id || item.ministerId) && (item.baseName || item.name || item.ministerName); }) : [];
      root.__omegaV2MinisterCandidates = valid;
      select.innerHTML = '<option value="">Choose a verified candidate</option>' + valid.map(function (candidate) {
        var id = String(candidate.id || candidate.ministerId);
        var name = String(candidate.baseName || candidate.name || candidate.ministerName || id);
        return '<option value="' + esc(id) + '">' + esc(name) + '</option>';
      }).join('');
      select.disabled = valid.length === 0;
      if (button) button.disabled = true;
      if (status) status.textContent = valid.length ? valid.length + ' canonical candidate profile(s) loaded for ' + ministryId + '.' : 'No verified candidates returned. Appointment is disabled.';
    }).catch(function (error) {
      if (root.__omegaV2RecruitingMinistry !== ministryId) return;
      if (status) status.textContent = 'Roster unavailable: ' + String(error && error.message || error || 'UNKNOWN_ERROR') + '. No assignment was changed.';
    });
  }
  function directoryCard(row) {
    var icon = ministryEmblem(row);
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
          ministerRecruitmentTable(rows) + (root.__omegaV2RecruitingMinistry ? recruitmentPanel(root.__omegaV2RecruitingMinistry) : '') + '</section>') +
      '</section>';

    if (!root.__omegaV2GovernmentBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-government-view]');
        if (tab && root.contains(tab)) {
          root.__omegaV2GovernmentView = tab.getAttribute('data-omega-v2-government-view');
          var activeOptions = root.__omegaV2GovernmentOptions || {};
          if (typeof activeOptions.onViewChange === 'function') activeOptions.onViewChange(root.__omegaV2GovernmentView);
          render(root, Object.assign({}, activeOptions, { view: root.__omegaV2GovernmentView }));
          return;
        }
        var recruit = target.closest('[data-omega-v2-minister-recruitment]');
        if (recruit && root.contains(recruit)) {
          root.__omegaV2RecruitingMinistry = recruit.getAttribute('data-omega-v2-minister-recruitment');
          render(root, Object.assign({}, root.__omegaV2GovernmentOptions || {}, { view:'all-ministries' }));
          return;
        }
        var cancelRecruitment = target.closest('[data-omega-v2-cancel-minister-recruitment]');
        if (cancelRecruitment && root.contains(cancelRecruitment)) {
          root.__omegaV2RecruitingMinistry = null;
          render(root, Object.assign({}, root.__omegaV2GovernmentOptions || {}, { view:'all-ministries' }));
          return;
        }
        var confirmRecruitment = target.closest('[data-omega-v2-confirm-minister]');
        if (confirmRecruitment && root.contains(confirmRecruitment) && !confirmRecruitment.disabled) {
          var recruitingId = root.__omegaV2RecruitingMinistry;
          var selection = root.querySelector('[data-omega-v2-minister-candidate]');
          var candidateId = selection && selection.value;
          var candidates = root.__omegaV2MinisterCandidates || [];
          var candidate = candidates.find(function (item) { return String(item.id || item.ministerId) === String(candidateId); });
          var selector = g.OmegaLiveMinisterSelectorV9;
          var engine = g.OmegaMinisterRecruitment;
          var activeOptions = root.__omegaV2GovernmentOptions || {};
          var country = activeOptions.countryId || activeCountry();
          var status = root.querySelector('[data-omega-v2-minister-roster-status]');
          confirmRecruitment.disabled = true;
          if (!candidate || !recruitingId) { if (status) status.textContent = 'Choose a valid candidate. No assignment was changed.'; confirmRecruitment.disabled = false; return; }
          if (status) status.textContent = 'Submitting appointment to the canonical ministry lifecycle…';
          var appointment = selector && typeof selector.appoint === 'function'
            ? selector.appoint(recruitingId, candidate)
            : engine && typeof engine.recruit === 'function' ? engine.recruit(recruitingId, candidate, country) : Promise.reject(new Error('MINISTER_APPOINTMENT_RUNTIME_UNAVAILABLE'));
          Promise.resolve(appointment).then(function () {
            root.__omegaV2RecruitingMinistry = null;
            render(root, Object.assign({}, activeOptions, { view:'all-ministries' }));
          }).catch(function (error) {
            if (status) status.textContent = 'Appointment rejected: ' + String(error && error.message || error || 'RUNTIME_REJECTED') + '. No success was reported.';
            confirmRecruitment.disabled = false;
          });
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
        var target = event && event.target;
        if (!target || !target.matches) return;
        if (target.matches('[data-omega-v2-minister-candidate]')) {
          var appointButton = root.querySelector('[data-omega-v2-confirm-minister]');
          if (appointButton) appointButton.disabled = !target.value;
          return;
        }
        if (target.matches('[data-omega-v2-ministry-filter]')) applyDirectoryFilters(root);
      });
      root.__omegaV2GovernmentBound = true;
    }
    root.__omegaV2GovernmentOptions = options;
    root.__omegaV2GovernmentView = view;
    if (view === 'all-ministries') {
      applyDirectoryFilters(root);
      if (root.__omegaV2RecruitingMinistry) loadMinisterCandidates(root, root.__omegaV2RecruitingMinistry, options.countryId || activeCountry());
    }
    return { ok: true, view: view, ministryCount: rows.length, countryId: countryId || null };
  }

  g.OmegaUIV2Government = Object.freeze({
    version: '1.0.0',
    render: render,
    renderExecutiveOverview: overviewHtml,
    getMinistryRows: ministryRows,
    ministryEmblem: ministryEmblem,
    renderMinisterPortrait: ministerPortraitMarkup,
    getCountrySnapshot: snapshot,
    getMetricField: field
  });
})(typeof window !== 'undefined' ? window : globalThis);
