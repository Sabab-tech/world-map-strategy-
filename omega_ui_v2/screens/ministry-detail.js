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
  var SECTION_LABELS = { dashboard:'Overview', operations:'Operations', assets:'People & Assets', budget:'Budget & Finance', reports:'Reports & Data' };
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
  function sectionForField(value) {
    var key = String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
    if (/budget|revenue|expenditure|treasury|tax|debt|cost|expense|currency|balance|salary|payroll|finance|fund/.test(key)) return 'budget';
    if (/staff|personnel|minister|employee|recruit|training|fleet|vehicle|equipment|inventory|warehouse|stock|resource|mine|site|asset|owner|operator|facility|facilities|workforce/.test(key)) return 'assets';
    if (/operation|operational|activity|status|incident|shipment|transport|route|production|output|project|progress|milestone|cycle|capacity|service|deployment|inspection|readiness|programme|program/.test(key)) return 'operations';
    if (/report|source|coverage|missing|audit|year|history|evidence|quality|provenance|update/.test(key)) return 'reports';
    return 'dashboard';
  }
  function scalarRows(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
    var rows = [];
    var seen = [];
    function flatten(value, label, depth) {
      if (rows.length >= 72 || depth > 4) return;
      if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        if (!label) return;
        rows.push({
          key:label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g,' '),
          section:sectionForField(label),
          value:value == null || value === '' ? 'Not recorded' : String(value)
        });
        return;
      }
      if (typeof value !== 'object' || seen.indexOf(value) >= 0) return;
      seen.push(value);
      if (Array.isArray(value)) {
        value.slice(0, 10).forEach(function (item, index) {
          flatten(item, label + ' ' + (index + 1), depth + 1);
        });
      } else {
        Object.keys(value).slice(0, 24).forEach(function (key) {
          flatten(value[key], label ? label + ' ' + key : key, depth + 1);
        });
      }
    }
    flatten(record, '', 0);
    return rows;
  }
  function rowsForSection(rows, section) {
    return (rows || []).filter(function (item) { return item.section === section; });
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
    return '<figure class="omega-v2-photo"><img loading="lazy" decoding="async" width="1280" height="720" src="' + esc(path) + '" alt="' + esc(alt || caption) + '"><figcaption>' + esc(caption) + '' + credit + '</figcaption></figure>';
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
        '</figure>';
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
      '<h2 class="omega-v2-card-title">Available actions</h2>' +
      '<p class="omega-v2-card-meta">Actions not available on this page can be opened from the relevant ministry section.</p>' +
      '<div class="omega-v2-status" data-state="unknown">More options in ministry sections</div></article>';
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
    var sectionRows = rowsForSection(rawRows, section);
    var categories = options.sectionData && Array.isArray(options.sectionData[section]) ? options.sectionData[section] : null;
    var content;
    if (!row) {
      content = '<div class="omega-v2-empty">This ministry page is unavailable. Return to the ministry directory and choose a listed ministry.</div>';
    } else if (!domain || !domain.record) {
      content = '<div class="omega-v2-empty">No country-specific details have been recorded for this section yet.</div>';
    } else if (categories) {
      content = categories.length ? '<div class="omega-v2-grid">' + categories.map(function (item) {
        return '<div class="omega-v2-card"><div class="omega-v2-card-title">' + esc(item.label || item.key || 'Recorded field') + '</div><div class="omega-v2-card-meta">' + esc(item.value == null ? 'Not recorded' : item.value) + '</div></div>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No details have been recorded for this section yet.</div>';
    } else {
      content = sectionRows.length
        ? '<div class="omega-v2-grid">' + sectionRows.map(function (item) {
            return '<article class="omega-v2-card omega-v2-ministry-field-card"><h3 class="omega-v2-card-title">' + esc(item.key) + '</h3><p class="omega-v2-card-meta">' + esc(item.value) + '</p></article>';
          }).join('') + '</div>'
        : '<div class="omega-v2-empty">No details have been recorded for this section yet.</div>';
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
      '<header class="omega-v2-heading"><div class="omega-v2-ministry-detail-mark">' + emblem + '<div><div class="omega-v2-eyebrow">ALL MINISTRIES · ' + esc(id.replace(/[_-]+/g,' ').toUpperCase()) + '</div><h1 class="omega-v2-title">' + esc(row ? row.title : id || 'Ministry') + '</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · ministry profile and country details</p></div></div><span class="omega-v2-status" data-state="' + (domain && domain.record ? 'operational' : 'unknown') + '">' + (domain && domain.record ? 'DETAILS AVAILABLE' : 'DETAILS NOT RECORDED') + '</span></header>' +
      '<div class="omega-v2-card omega-v2-ministry-appointed-minister"><h2 class="omega-v2-card-title">Minister</h2><div class="omega-v2-minister-table-person">' + (portraitSlot || '<div class="omega-v2-minister-portrait" data-omega-v2-minister-portrait-slot><span class="omega-v2-minister-portrait-placeholder">NO PHOTO</span></div>') + '<strong>' + esc(activeMinisterName) + '</strong></div></div>' +
      ministryVisualMarkup(id, row) +
      '<div class="omega-v2-filterbar" role="group" aria-label="Ministry page sections">' + SECTIONS.map(function (key) { return '<button type="button" class="omega-v2-button ' + (section === key ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-ministry-section="' + key + '" aria-pressed="' + (section === key ? 'true' : 'false') + '">' + esc(SECTION_LABELS[key]) + '</button>'; }).join('') + '</div>' +
      relatedLinks(id, options) +
      '<div class="omega-v2-section-title">' + esc(SECTION_LABELS[section]) + '</div>' + content +
      '</section>';
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
