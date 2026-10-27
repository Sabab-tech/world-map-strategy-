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
    var visualRegistry = g.OmegaUIV2MinistryVisualRegistry;
    var visual = visualRegistry && typeof visualRegistry.get === 'function' ? visualRegistry.get(id) : null;
    var visualLogo = visual && safeVisualPath(visual.logo);
    var emblem = visualLogo
      ? '<img class="omega-v2-ministry-detail-logo" loading="lazy" decoding="async" src="' + esc(visualLogo) + '" alt="' + esc(visual.logoAlt || visual.title || id) + '">'
      : (row && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.ministryEmblem === 'function' ? g.OmegaUIV2Government.ministryEmblem(row) : '');
    var activeMinisterName = row && row.ministerName || 'Minister not recorded';
    var portraitSlot = row && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.renderMinisterPortrait === 'function' ? g.OmegaUIV2Government.renderMinisterPortrait(row) : '';
    root.innerHTML = '<section class="omega-v2-shell omega-v2-ministry-detail">' +
      '<header class="omega-v2-heading"><div class="omega-v2-ministry-detail-mark">' + emblem + '<div><div class="omega-v2-eyebrow">ALL MINISTRIES · ' + esc(id.replace(/[_-]+/g,' ').toUpperCase()) + '</div><h1 class="omega-v2-title">' + esc(row ? row.title : id || 'Ministry') + '</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · registered ministry profile and source-backed domain record</p></div></div><span class="omega-v2-status" data-state="' + (domain && domain.record ? 'operational' : 'unknown') + '">' + (domain && domain.record ? 'DOMAIN RECORD AVAILABLE' : esc(domain.reason || 'DOMAIN RECORD NOT RECORDED')) + '</span></header>' +
      '<div class="omega-v2-card omega-v2-ministry-appointed-minister"><h2 class="omega-v2-card-title">Minister</h2><div class="omega-v2-minister-table-person">' + (portraitSlot || '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot><span class="omega-v2-minister-portrait-placeholder">MINISTER PORTRAIT</span><small>Image pending</small></div>') + '<strong>' + esc(activeMinisterName) + '</strong></div></div>' +
      ministryVisualMarkup(id, row) +
      '<div class="omega-v2-filterbar" role="group" aria-label="Ministry page sections">' + SECTIONS.map(function (key) { return '<button type="button" class="omega-v2-button ' + (section === key ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-ministry-section="' + key + '" aria-pressed="' + (section === key ? 'true' : 'false') + '">' + esc(SECTION_LABELS[key]) + '</button>'; }).join('') + '</div>' +
      relatedLinks(id, options) +
      '<div class="omega-v2-section-title">' + esc(SECTION_LABELS[section]) + '</div>' + content +
      '<p class="omega-v2-source">The current panel is read-only. Procurement, recruitment, resource transfers and project execution must route through an authoritative handler and display a result only after game state confirms it.</p></section>';
    if (!root.__omegaV2MinistryDetailBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-ministry-section]');
        if (tab && root.contains(tab)) {
          var current = root.__omegaV2MinistryDetailOptions || {};
          scheduleRender(root, Object.assign({}, current, { section:tab.getAttribute('data-omega-v2-ministry-section') }));
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
