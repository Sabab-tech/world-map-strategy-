/* OMEGA UI v2 report index.
 * All report cards are source-linked summaries; the report UI is not a data authority.
 */
(function (g) {
  'use strict';
  var CATEGORIES = [
    { id:'national-snapshot', title:'National Snapshot', subtitle:'Country identity and headline indicators', domain:null, group:'government', fields:['gdp','population','gdpGrowth','inflation','unemployment'] },
    { id:'economy-finance', title:'Economy & Finance', subtitle:'Treasury context, fiscal indicators and trade', domain:'treasury_finance', group:'economy', fields:['gdp','debt','debtToGdpPct','tradeBalance','reserves'] },
    { id:'resources-mining', title:'Resources & Mining', subtitle:'Registered mine sites, stock/flow and source coverage', domain:'energy_mining', group:'resources' },
    { id:'industry-production', title:'Industry & Production', subtitle:'Commissioned factories, production cycles and projects', domain:'production', group:'industry' },
    { id:'security-police', title:'Security & Public Safety', subtitle:'Police staffing, fleet readiness and recorded incidents', domain:'interior_security', group:'security' },
    { id:'diplomacy', title:'Diplomacy & Treaties', subtitle:'Registered relations, missions and international commitments', domain:'foreign_affairs', group:'diplomacy' },
    { id:'society-culture', title:'Society, Culture & Religion', subtitle:'Recorded demographic and social indicators', domain:'health_welfare', group:'society' },
    { id:'mega-projects', title:'National Projects', subtitle:'Recorded milestones, schedules and completion states', domain:'mega_projects', group:'projects' },
    { id:'data-quality', title:'Data Coverage & Missing Fields', subtitle:'Which source fields are available, missing or unquantified', domain:null, group:'quality' }
  ];
  var ROUTES = {
    'treasury_finance':'treasury_finance',
    'energy_mining':'energy_mining',
    'production':'production',
    'interior_security':'interior_security',
    'foreign_affairs':'foreign_affairs',
    'mega_projects':'mega_projects',
    'health_welfare':'health_welfare'
  };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function bucket(root, country) {
    if (!root || typeof root !== 'object') return null;
    var key = String(country || '').trim().toUpperCase();
    if (root[key]) return root[key];
    var names = Object.keys(root);
    for (var i = 0; i < names.length; i += 1) if (names[i].trim().toUpperCase() === key) return root[names[i]];
    return null;
  }
  function liveState(country) {
    var root = g.Game && g.Game.state || g.gameState || {};
    return { root: root, resource: bucket(root.resource, country) || bucket(root.resources, country) || null,
      economy: bucket(root.economy, country), interior: bucket(root.interior, country) || bucket(root.home, country) };
  }
  function getSnapshot(country) {
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    if (!gateway || typeof gateway.getSnapshot !== 'function') return null;
    try { return gateway.getSnapshot(country); } catch (_) { return null; }
  }
  function availableMetrics(snapshot) {
    var fields = snapshot && snapshot.fields || {};
    var all = Object.keys(fields);
    var available = all.filter(function (key) { return fields[key] && fields[key].status === 'AVAILABLE'; });
    var missing = all.filter(function (key) { return !fields[key] || fields[key].status !== 'AVAILABLE'; });
    return { registered: all.length, available: available.length, missing: missing.length, availableKeys: available, missingKeys: missing };
  }
  function buildViewModel(options) {
    options = options || {};
    var country = String(options.countryId || g.OmegaMinistryViewCountry || g.currentActiveCountry || '').trim().toUpperCase();
    var snapshot = getSnapshot(country);
    var state = liveState(country);
    var resources = state.resource || {};
    var network = resources.industrialNetwork || {};
    var factories = Array.isArray((state.economy || {}).productionAssets) ? state.economy.productionAssets : [];
    var projects = Array.isArray(network.projects) ? network.projects : Array.isArray((state.economy || {}).projects) ? state.economy.projects : [];
    var sites = g.OmegaResourceSiteCanonicalCatalogData || (g.Omega && g.Omega.ResourceSiteCanonicalCatalogData);
    var siteRows = sites && Array.isArray(sites.sites) ? sites.sites.filter(function (site) { return String(site.countryId || site.identity && site.identity.countryIso3 || '').trim().toUpperCase() === country; }) : [];
    var fleetEngine = g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry);
    var fleetSummary = null;
    try { if (fleetEngine && typeof fleetEngine.getCountryFleetSnapshot === 'function') fleetSummary = fleetEngine.getCountryFleetSnapshot(country); } catch (_) {}
    var policeState = null;
    try { if (fleetEngine && typeof fleetEngine.getState === 'function') policeState = fleetEngine.getState(country); } catch (_) {}
    var fields = availableMetrics(snapshot);
    var records = {
      'national-snapshot': fields.available,
      'economy-finance': ['gdp','debt','debtToGdpPct','tradeBalance','reserves'].filter(function (key) { return snapshot && snapshot.fields && snapshot.fields[key] && snapshot.fields[key].status === 'AVAILABLE'; }).length,
      'resources-mining': siteRows.length,
      'industry-production': factories.length + projects.length,
      'security-police': policeState ? (Number.isFinite(Number(policeState.policeCount)) ? 1 : 0) + (fleetSummary && fleetSummary.available ? 1 : 0) + (Array.isArray(policeState.incidentLedger) ? 1 : 0) : 0,
      'diplomacy': (state.root.relations && bucket(state.root.relations, country)) ? 1 : 0,
      'society-culture': snapshot && snapshot.fields ? ['population','urbanization','humanDevelopmentIndex'].filter(function (key) { return snapshot.fields[key] && snapshot.fields[key].status === 'AVAILABLE'; }).length : 0,
      'mega-projects': projects.length,
      'data-quality': fields.missing
    };
    var available = {
      'national-snapshot': !!snapshot && fields.available > 0,
      'economy-finance': records['economy-finance'] > 0,
      'resources-mining': siteRows.length > 0,
      'industry-production': factories.length + projects.length > 0,
      'security-police': !!policeState,
      'diplomacy': records.diplomacy > 0,
      'society-culture': records['society-culture'] > 0,
      'mega-projects': projects.length > 0,
      'data-quality': !!snapshot
    };
    return { countryId:country || null, snapshot:snapshot, fields:fields, records:records, available:available, categories:CATEGORIES.slice(),
      sourceStateAvailable:!!(state.resource || state.economy || snapshot), siteCount:siteRows.length, factoryCount:factories.length, projectCount:projects.length,
      fleetSummary:fleetSummary, policeStateAvailable:!!policeState };
  }
  function openDomain(domain, options) {
    if (!domain) {
      if (options && typeof options.onOpenDomain === 'function') return options.onOpenDomain('country-overview');
      return false;
    }
    if (options && typeof options.onOpenDomain === 'function') return options.onOpenDomain(domain);
    var route = ROUTES[domain];
    var manager = g.OmegaLayerManager;
    if (route && manager && typeof manager.setLayer === 'function') return manager.setLayer(2, { ministryId:route });
    return false;
  }
  function card(category, model) {
    var hasData = !!model.available[category.id];
    var n = model.records[category.id];
    var value = category.id === 'data-quality'
      ? (model.fields ? model.fields.missing + ' missing fields' : 'Unavailable')
      : category.id === 'resources-mining' ? n + ' registered site(s)'
      : category.id === 'industry-production' ? model.factoryCount + ' factory / ' + model.projectCount + ' project record(s)'
      : category.id === 'security-police' ? (model.policeStateAvailable ? 'Police records available' : 'No police records yet')
      : category.id === 'mega-projects' ? n + ' project record(s)'
      : category.id === 'national-snapshot' ? n + ' sourced indicator(s)' : n + ' source record(s)';
    var canOpen = !!(category.domain && ROUTES[category.domain]) || !!category.domain && typeof model.onOpenDomain === 'function' || !category.domain && category.id === 'national-snapshot';
    return '<article class="omega-v2-card"><div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title">' + esc(category.title) + '</h3><p class="omega-v2-card-meta">' + esc(category.subtitle) + '</p></div><span class="omega-v2-status" data-state="' + (hasData ? 'operational' : 'unknown') + '">' + (hasData ? 'RECORDS AVAILABLE' : 'NO RECORDS YET') + '</span></div>' +
      '<div class="omega-v2-kpi"><span>Records found</span><strong>' + esc(value) + '</strong></div>' +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-report="' + esc(category.id) + '" data-domain="' + esc(category.domain || '') + '"' + (canOpen ? '' : ' disabled title="This report is not available yet."') + ' >Open report</button></div></article>';
  }
  function photoMarkup(id,alt,caption) {
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get(id):null;}catch(_){}
    var safe=/^[a-z0-9-]+$/.test(String(id||''))?String(id):'',path=item&&/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path||''))?item.path:(safe?'assets/ui-photos/'+safe+'.webp':'');
    if(!path)return '<div class="omega-v2-photo-placeholder" role="img" aria-label="'+esc(alt)+'">LOCAL PHOTO UNAVAILABLE</div>';
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo omega-v2-photo--hero"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="'+esc(alt)+'"><figcaption><strong>'+esc(item&&item.caption||caption)+'</strong><small>Representative reference imagery, not evidence of current ownership or operation.</small>'+credit+'</figcaption></figure>';
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'REPORTS_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    model.onOpenDomain = options.onOpenDomain;
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-reports"><header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">CROSS-MINISTRY REPORTS</div><h1 class="omega-v2-title">Reports & Data Quality</h1><p class="omega-v2-subtitle">Country ' + esc(model.countryId || 'Not recorded') + ' · reports across ministries</p></div><span class="omega-v2-status" data-state="' + (model.sourceStateAvailable ? 'operational' : 'unknown') + '">' + (model.sourceStateAvailable ? 'REPORT DATA AVAILABLE' : 'REPORT DATA UNAVAILABLE') + '</span></header>' +
      photoMarkup('wind-farm', 'Wind farm, representative energy and reporting reference image', 'REPORTS & EVIDENCE') +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Country indicators</span><strong>' + esc(model.fields.available + ' / ' + model.fields.registered) + '</strong></div><div class="omega-v2-kpi"><span>Unrecorded indicators</span><strong>' + esc(model.fields.missing) + '</strong></div><div class="omega-v2-kpi"><span>Mine/resource sites</span><strong>' + esc(model.siteCount) + '</strong></div><div class="omega-v2-kpi"><span>Factories</span><strong>' + esc(model.factoryCount) + '</strong></div></div>' +
      '<p class="omega-v2-note">Only recorded values are shown. Missing information is marked Not recorded.</p>' +
      '<div class="omega-v2-grid">' + model.categories.map(function (category) { return card(category, model); }).join('') + '</div></section>';
    if (!root.__omegaV2ReportsBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var button = target.closest('[data-omega-v2-open-report]');
        if (!button || !root.contains(button) || button.disabled) return;
        var categoryId = button.getAttribute('data-omega-v2-open-report');
        var category = CATEGORIES.find(function (item) { return item.id === categoryId; });
        if (category) openDomain(category.domain, root.__omegaV2ReportsOptions || {});
      });
      root.__omegaV2ReportsBound = true;
    }
    root.__omegaV2ReportsOptions = options;
    return { ok:true, model:model };
  }

  g.OmegaUIV2Reports = Object.freeze({ version:'1.0.0', categories:CATEGORIES, buildViewModel:buildViewModel, render:render });
})(typeof window !== 'undefined' ? window : globalThis);
