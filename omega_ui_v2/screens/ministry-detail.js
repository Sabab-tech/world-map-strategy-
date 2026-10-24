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
  var SECTIONS = ['dashboard','operations','assets','budget','reports'];
  var SECTION_LABELS = { dashboard:'Dashboard', operations:'Operations / Programmes', assets:'People & Assets', budget:'Budget', reports:'Reports' };
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
    if (!item || !/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path || ''))) return '';
    return '<figure class="omega-v2-photo"><img loading="lazy" decoding="async" src="' + esc(item.path) + '" alt="' + esc(alt || item.caption || 'Reference photo') + '"><figcaption>' + esc(item.caption || 'Reference photo') + '<small>Reference only</small></figcaption></figure>';
  }
  function visualRecord(id) {
    var registry = g.OmegaUIV2MinistryVisualRegistry;
    return registry && typeof registry.get === 'function' ? registry.get(id) : null;
  }
  function safeAssetPath(value) {
    var path = String(value || '');
    return /^assets\/[a-zA-Z0-9_ .()\/-]+\.(?:webp|png|jpe?g|svg)$/i.test(path) && path.indexOf('..') < 0 ? path : '';
  }
  function ministryVisualMarkup(id, row, visual) {
    visual = visual || visualRecord(id) || {};
    var title = String(visual.title || row && row.title || id || 'Ministry');
    var hero = safeAssetPath(visual.image);
    var seen = Object.create(null);
    var gallery = (Array.isArray(visual.gallery) ? visual.gallery : []).map(safeAssetPath).filter(function (path) {
      if (!path || path === hero || path === safeAssetPath(visual.logo) || seen[path]) return false;
      seen[path] = true;
      return true;
    }).slice(0, 4);
    if (!hero && !gallery.length) return '';
    return '<section class="omega-v2-ministry-detail-visuals" aria-label="' + esc(title) + ' visual assets">' +
      (hero ? '<figure class="omega-v2-ministry-detail-hero"><img loading="lazy" decoding="async" src="' + esc(hero) + '" alt="' + esc(visual.alt || title + ' reference image') + '"><figcaption>' + esc(title) + ' · local reference image</figcaption></figure>' : '') +
      (gallery.length ? '<div class="omega-v2-ministry-detail-gallery" aria-label="Additional local ministry images">' + gallery.map(function (path, index) {
        return '<figure><img loading="lazy" decoding="async" src="' + esc(path) + '" alt="' + esc(title + ' additional reference image ' + (index + 1)) + '"><figcaption>Reference image ' + (index + 1) + '</figcaption></figure>';
      }).join('') + '</div>' : '') +
      '<p class="omega-v2-card-meta">Images are loaded from bundled repository assets. Illustrative imagery does not assert current ownership, deployment or operational status.</p>' +
      '</section>';
  }
  function relatedLinks(id, options) {
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
  function operationalConsoleCard(id, options) {
    var available = options && typeof options.onOpenOperationalConsole === 'function';
    return '<article class="omega-v2-card omega-v2-operational-console-card">' +
      '<h2 class="omega-v2-card-title">Existing operational controls</h2>' +
      '<p class="omega-v2-card-meta">Actions not yet reimplemented in UI v2 remain available through the canonical gameplay console. This preserves existing command, staffing, budget and asset workflows.</p>' +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-operational-console="' + esc(id) + '"' +
      (available ? '' : ' disabled title="The existing operational-console bridge is unavailable."') +
      '>Open operational console</button></div></article>';
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'MINISTRY_DETAIL_ROOT_REQUIRED' };
    var id = String(options.ministryId || '').trim();
    var country = String(options.countryId || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '').trim().toUpperCase();
    var row = getMinistry(id);
    var domain = domainRecord(country, id);
    var section = SECTIONS.indexOf(options.section) >= 0 ? options.section : 'dashboard';
    var rawRows = scalarRows(domain && domain.record);
    var categories = options.sectionData && Array.isArray(options.sectionData[section]) ? options.sectionData[section] : null;
    var content;
    if (!row) {
      content = '<div class="omega-v2-empty">The selected ID is not present in the current ministry directory. No substitute ministry was created.</div>';
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
    var visual = visualRecord(id) || {};
    var logoPath = safeAssetPath(visual.logo);
    var defaultEmblem = row && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.ministryEmblem === 'function' ? g.OmegaUIV2Government.ministryEmblem(row) : '';
    var emblem = logoPath
      ? '<span class="omega-v2-ministry-detail-logo"><img loading="lazy" decoding="async" src="' + esc(logoPath) + '" alt="' + esc(visual.logoAlt || (row && row.title || id) + ' ministry logo') + '"></span>'
      : defaultEmblem;
    var visualSection = ministryVisualMarkup(id, row, visual);
    var activeMinisterName = row && row.ministerName || 'Minister not recorded';
    var portraitSlot = row && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.renderMinisterPortrait === 'function' ? g.OmegaUIV2Government.renderMinisterPortrait(row) : '';
    root.innerHTML = '<section class="omega-v2-shell omega-v2-ministry-detail">' +
      '<header class="omega-v2-heading"><div class="omega-v2-ministry-detail-mark">' + emblem + '<div><div class="omega-v2-eyebrow">ALL MINISTRIES · ' + esc(id.replace(/[_-]+/g,' ').toUpperCase()) + '</div><h1 class="omega-v2-title">' + esc(row ? row.title : id || 'Ministry') + '</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · registered ministry profile and source-backed domain record</p></div></div><span class="omega-v2-status" data-state="' + (domain && domain.record ? 'operational' : 'unknown') + '">' + (domain && domain.record ? 'DOMAIN RECORD AVAILABLE' : esc(domain.reason || 'DOMAIN RECORD NOT RECORDED')) + '</span></header>' +
      '<div class="omega-v2-card omega-v2-ministry-appointed-minister"><h2 class="omega-v2-card-title">Minister</h2><div class="omega-v2-minister-table-person">' + (portraitSlot || '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot><span class="omega-v2-minister-portrait-placeholder">MINISTER PORTRAIT</span><small>Image pending</small></div>') + '<strong>' + esc(activeMinisterName) + '</strong></div></div>' +
      (visualSection || (PHOTO_BY_MINISTRY[id] ? photo(PHOTO_BY_MINISTRY[id], (row && row.title || id) + ' reference image') : '')) +
      '<div class="omega-v2-filterbar" role="group" aria-label="Ministry page sections">' + SECTIONS.map(function (key) { return '<button type="button" class="omega-v2-button ' + (section === key ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-ministry-section="' + key + '" aria-pressed="' + (section === key ? 'true' : 'false') + '">' + esc(SECTION_LABELS[key]) + '</button>'; }).join('') + '</div>' +
      relatedLinks(id, options) +
      operationalConsoleCard(id, options) +
      '<div class="omega-v2-section-title">' + esc(SECTION_LABELS[section]) + '</div>' + content +
      '<p class="omega-v2-source">The current panel is read-only. Procurement, recruitment, resource transfers and project execution must route through an authoritative handler and display a result only after game state confirms it.</p></section>';
    if (!root.__omegaV2MinistryDetailBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-ministry-section]');
        if (tab && root.contains(tab)) {
          var current = root.__omegaV2MinistryDetailOptions || {};
          render(root, Object.assign({}, current, { section:tab.getAttribute('data-omega-v2-ministry-section') }));
          return;
        }
        var consoleButton = target.closest('[data-omega-v2-open-operational-console]');
        if (consoleButton && root.contains(consoleButton) && !consoleButton.disabled) {
          var consoleOptions = root.__omegaV2MinistryDetailOptions || {};
          if (typeof consoleOptions.onOpenOperationalConsole === 'function') {
            consoleOptions.onOpenOperationalConsole(consoleButton.getAttribute('data-omega-v2-open-operational-console'));
          }
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
    return { ok:true, ministryId:id, countryId:country || null, section:section, domainRecordAvailable:!!(domain && domain.record) };
  }
  g.OmegaUIV2MinistryDetail = Object.freeze({ version:'1.0.0', render:render, getMinistry:getMinistry, getDomainRecord:domainRecord });
})(typeof window !== 'undefined' ? window : globalThis);
