/* OMEGA UI v2 host shell.
 * Mount explicitly into a supplied root; it never replaces the production app on its own.
 */
(function (g) {
  'use strict';

  var ROUTES = ['map', 'overview', 'government', 'economy', 'more', 'industry', 'reports', 'religion'];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function currentCountry() {
    var candidates = [g.OmegaMinistryViewCountry, g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry,
      g.CountryIOS && g.CountryIOS.activeCountry, g.Game && (g.Game.currentActiveCountry || g.Game.selectedCountryId),
      g.currentActiveCountry, g.playerCountryId, g.playerCountry];
    for (var i = 0; i < candidates.length; i += 1) if (candidates[i] != null && String(candidates[i]).trim()) return String(candidates[i]).trim().toUpperCase();
    return '';
  }
  function stateFor(root) { return root.__omegaUIV2State; }
  function photoCount() {
    var lib = g.OmegaUIPhotoAssets;
    try { return lib && typeof lib.list === 'function' ? lib.list().length : null; } catch (_) { return null; }
  }
  function navButton(id, label, active) {
    var selected = active === id || (id === 'more' && ['industry','reports','religion','home-affairs','resources','ministry-detail','mine-detail'].indexOf(active) >= 0);
    return '<button type="button" class="omega-v2-nav-button' + (selected ? ' is-active' : '') + '" data-omega-v2-global-nav="' + esc(id) + '" aria-current="' + (selected ? 'page' : 'false') + '">' + esc(label) + '</button>';
  }
  function jumpMenuMarkup(activeRoute) {
    var nav = g.OmegaUIV2Navigation || {};
    var registry = g.OmegaUIV2MinistryVisualRegistry;
    var rows = g.OmegaUIV2Government && typeof g.OmegaUIV2Government.getMinistryRows === 'function'
      ? g.OmegaUIV2Government.getMinistryRows() : [];
    var labels = Object.create(null);
    rows.forEach(function (row) { labels[row.id] = row.title; });
    var ids = Array.isArray(nav.ministryIds) ? nav.ministryIds : (registry && Array.isArray(registry.ids) ? registry.ids : []);
    var globalRoutes = [
      ['map','World map'],['overview','Country overview'],['government','Government'],
      ['economy','Economy & finance'],['industry','Factories & industry'],['reports','Reports'],
      ['more','More modules'],['religion','Religion & ideology']
    ];
    return '<details class="omega-v2-route-switcher"><summary aria-label="Jump to any screen or ministry">Jump anywhere ▾</summary>' +
      '<div class="omega-v2-route-menu"><section><h2>MAIN SCREENS</h2><div class="omega-v2-route-menu-grid">' +
      globalRoutes.map(function (item) {
        return '<button type="button" class="omega-v2-route-link' + (activeRoute === item[0] ? ' is-current' : '') +
          '" data-omega-v2-jump-route="' + esc(item[0]) + '">' + esc(item[1]) + '</button>';
      }).join('') + '</div></section><section><h2>ALL 18 MINISTRIES</h2><div class="omega-v2-route-menu-grid">' +
      ids.map(function (id) {
        var visual = registry && typeof registry.get === 'function' ? registry.get(id) : null;
        var label = labels[id] || (visual && visual.title) || id.replace(/[_-]+/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
        return '<button type="button" class="omega-v2-route-link" data-omega-v2-jump-ministry="' + esc(id) + '">' + esc(label) + '</button>';
      }).join('') + '</div></section></div></details>';
  }
  function ministryOptions(root) {
    var state = stateFor(root);
    return {
      countryId: state.countryId,
      view: state.governmentView,
      onOpenMinistry: function (id) { return openMinistry(root, id); },
      onOpenDomain: function (domain) { return openDomain(root, domain); },
      onNavigate: function (destination) { return navigate(root, destination); },
      onViewChange: function (view) {
        state.governmentView = view === 'all-ministries' ? 'all-ministries' : 'executive-ministry';
      },
      onCountryChange: function (countryId) {
        state.countryId = String(countryId || '').trim().toUpperCase();
        g.OmegaMinistryViewCountry = state.countryId;
      }
    };
  }
  function historySnapshot(state) {
    return { route:state.route, ministryId:state.ministryId, section:state.section,
      resourceSiteId:state.resourceSiteId, governmentView:state.governmentView };
  }
  function routeName(id) {
    var value = String(id || '');
    if (value === 'cabinet_council') return 'government';
    if (value === 'production') return 'industry';
    if (value === 'energy_mining') return 'resources';
    if (value === 'interior_security') return 'home-affairs';
    return 'ministry-detail';
  }
  function openMinistry(root, id) {
    var state = stateFor(root);
    id = String(id || '').trim();
    if (!id) return false;
    if (id === 'cabinet_council') {
      if (state.route !== 'government' || state.governmentView !== 'executive-ministry') state.history.push(historySnapshot(state));
      state.route = 'government';
      state.ministryId = null;
      state.section = 'dashboard';
      state.resourceSiteId = null;
      state.governmentView = 'executive-ministry';
      render(root);
      return true;
    }
    var next = routeName(id);
    if (state.route === next && state.ministryId === id && state.section === 'dashboard') return true;
    state.history.push(historySnapshot(state));
    state.ministryId = id;
    state.section = 'dashboard';
    state.resourceSiteId = null;
    state.route = next;
    if (next === 'government') state.governmentView = 'executive-ministry';
    render(root);
    return true;
  }
  function openDomain(root, domain) {
    if (domain === 'country-overview' || domain === 'executive-ministry') return navigate(root, 'government');
    if (domain === 'resources-mining' || domain === 'energy_mining') return openMinistry(root, 'energy_mining');
    if (domain === 'industry-production' || domain === 'production') return openMinistry(root, 'production');
    if (domain === 'security-police' || domain === 'interior_security') return openMinistry(root, 'interior_security');
    if (domain === 'diplomacy') return openMinistry(root, 'foreign_affairs');
    if (domain === 'society-culture' || domain === 'health_welfare') return openMinistry(root, 'health_welfare');
    if (domain === 'economy-finance' || domain === 'treasury_finance') return navigate(root, 'economy');
    if (domain === 'mega-projects' || domain === 'mega_projects') return openMinistry(root, 'mega_projects');
    return false;
  }
  function navigate(root, route) {
    var state = stateFor(root);
    route = String(route || '').trim();
    if (!route) return false;
    if (route === 'world') route = 'map';
    if (route === 'executive-ministry') return openMinistry(root, 'cabinet_council');
    if (route === 'all-ministries' || route === 'ministry-directory') {
      if (state.route !== 'government' || state.governmentView !== 'all-ministries') state.history.push(historySnapshot(state));
      state.route = 'government';
      state.ministryId = null;
      state.section = 'dashboard';
      state.governmentView = 'all-ministries';
      render(root);
      return true;
    }
    var ministryIds = g.OmegaUIV2Navigation && g.OmegaUIV2Navigation.ministryIds;
    if (Array.isArray(ministryIds) && ministryIds.indexOf(route) >= 0) return openMinistry(root, route);
    if (ROUTES.indexOf(route) >= 0 || route === 'home-affairs' || route === 'resources' ||
        route === 'ministry-detail' || route === 'mine-detail') {
      if (state.route === route && !(route === 'government' && state.governmentView !== 'executive-ministry')) return true;
      state.history.push(historySnapshot(state));
      state.route = route;
      state.ministryId = null;
      state.section = 'dashboard';
      state.resourceSiteId = null;
      if (route === 'government') state.governmentView = 'executive-ministry';
      render(root);
      return true;
    }
    return false;
  }
  function back(root) {
    var state = stateFor(root);
    var previous = state.history.pop();
    if (!previous) {
      if (typeof state.options.onBackToMap === 'function') return state.options.onBackToMap();
      state.route = 'map';
      state.ministryId = null;
      render(root);
      return true;
    }
    state.route = previous.route || 'map';
    state.ministryId = previous.ministryId || null;
    state.section = previous.section || 'dashboard';
    state.resourceSiteId = previous.resourceSiteId || null;
    state.governmentView = previous.governmentView === 'all-ministries' ? 'all-ministries' : 'executive-ministry';
    render(root);
    return true;
  }
  function exitToMap(root) {
    var state = stateFor(root);
    if (!state) return false;
    state.history.length = 0;
    state.route = 'map';
    state.ministryId = null;
    state.section = 'dashboard';
    state.resourceSiteId = null;
    state.governmentView = 'executive-ministry';
    if (state.options && typeof state.options.onBackToMap === 'function') {
      state.options.onBackToMap();
      return true;
    }
    render(root);
    return true;
  }
  function photoMarkup(id,alt,caption,tile) {
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get(id):null;}catch(_){}
    var safe=/^[a-z0-9-]+$/.test(String(id||''))?String(id):'';
    var path=item&&/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path||''))?item.path:(safe?'assets/ui-photos/'+safe+'.webp':'');
    if(!path)return '<div class="omega-v2-photo-placeholder" role="img" aria-label="'+esc(alt)+'">LOCAL PHOTO UNAVAILABLE</div>';
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo '+(tile?'omega-v2-photo--tile':'omega-v2-photo--hero')+'"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="'+esc(alt)+'"><figcaption><strong>'+esc(item&&item.caption||caption)+'</strong><small>Representative reference imagery, not evidence of current ownership or operation.</small>'+credit+'</figcaption></figure>';
  }
  function renderOverview(root,content) {
    var s=stateFor(root),candidate=s.countryId||g.OmegaMinistryViewCountry||(g.CountryIOS&&g.CountryIOS.activeCountry)||(g.Game&&(g.Game.currentActiveCountry||g.Game.selectedCountryId));
    if(candidate&&typeof candidate==='object')candidate=candidate.countryCode||candidate.iso3||candidate.countryId||candidate.code||candidate.name||candidate.id;
    var country=String(candidate||'').trim().toUpperCase(),gateway=g.OmegaCountryDataGateway||(g.Omega&&g.Omega.CountryDataGateway),snap=null;
    try{if(country&&gateway&&typeof gateway.getSnapshot==='function')snap=gateway.getSnapshot(country);}catch(_){}
    var fields=snap&&snap.fields||{},keys=Object.keys(fields),available=keys.filter(function(k){return fields[k]&&fields[k].status==='AVAILABLE'&&fields[k].value!=null;}).length;
    function value(k){var r=fields[k];if(!r||r.status!=='AVAILABLE'||r.value==null||r.value==='')return'Not recorded';var v=r.value;if(typeof v==='number'&&Number.isFinite(v))v=v.toLocaleString('en-US',{maximumFractionDigits:2});return String(v)+(r.unit?' '+r.unit:'');}
    var finance=((g.Game&&g.Game.state&&g.Game.state.finance)||{})[country]||{},cash=finance.available!=null?finance.available:finance.cash;
    if(cash==null||cash==='')cash='Not recorded';else if(typeof cash==='number'&&Number.isFinite(cash))cash=cash.toLocaleString('en-US',{maximumFractionDigits:2})+(finance.currencyCode?' '+finance.currencyCode:'');
    content.innerHTML='<section class="omega-v2-shell omega-v2-overview"><header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ATLAS COMMAND / NATIONAL BRIEFING</div><h1 class="omega-v2-title">Country Overview</h1><p class="omega-v2-subtitle">Country '+esc(country||'Not recorded')+' · sourced indicators and current game state</p></div><span class="omega-v2-status" data-state="'+(snap?'operational':'unknown')+'">'+(snap?'SOURCE LINK CONNECTED':'SOURCE DATA UNAVAILABLE')+'</span></header>'+
    photoMarkup('dhaka-skyline','Urban skyline, representative reference image for national infrastructure','NATIONAL CONTEXT',false)+
    '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>GDP</span><strong>'+esc(value('gdp'))+'</strong><small>Source: '+esc(fields.gdp&&(fields.gdp.sourceName||fields.gdp.sourceId)||'Not recorded')+'</small></div><div class="omega-v2-kpi"><span>Population</span><strong>'+esc(value('population'))+'</strong><small>Published indicator only</small></div><div class="omega-v2-kpi"><span>GDP growth</span><strong>'+esc(value('gdpGrowth'))+'</strong><small>Period: '+esc(fields.gdpGrowth&&fields.gdpGrowth.year||'Not recorded')+'</small></div><div class="omega-v2-kpi"><span>Inflation</span><strong>'+esc(value('inflation'))+'</strong><small>Published indicator only</small></div><div class="omega-v2-kpi"><span>Available treasury</span><strong>'+esc(cash)+'</strong><small>Canonical game finance state</small></div><div class="omega-v2-kpi"><span>Recorded indicators</span><strong>'+available+' / '+keys.length+'</strong><small>Missing values remain unrecorded</small></div></div>'+
    '<div class="omega-v2-note">Photographs are illustrative, not proof of ownership or current activity. Published indicators and simulated treasury values are separate sources; absent values are never filled with invented zeros.</div><h2 class="omega-v2-section-title">Continue command</h2><div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-global-nav="government">Government and ministries</button><button type="button" class="omega-v2-button" data-omega-v2-global-nav="economy">Economy & treasury</button><button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-global-nav="more">All strategic domains</button></div></section>';
    return{ok:true,route:'overview',countryId:country||null,available:available,registered:keys.length};
  }
  function renderMore(root,content) {
    var items=[
      {title:'Industry & Factories',desc:'Production lines, inputs, factory sites and output.',photo:'industrial-production-line',route:'industry'},
      {title:'Resources & Mining',desc:'Registered sites, extraction, reserves, stock and material flow.',photo:'open-pit-mine',ministry:'energy_mining'},
      {title:'Public Safety',desc:'Police staffing, fleet, operations and incidents.',photo:'bangladesh-police-headquarters',ministry:'interior_security'},
      {title:'Logistics & Trade',desc:'Shipping, trade, contracts and markets.',photo:'container-ship',ministry:'trade'},
      {title:'Foreign Affairs',desc:'Diplomacy, treaties and international commitments.',photo:'un-assembly-building',ministry:'foreign_affairs'},
      {title:'Defense',desc:'Readiness, assets, procurement and defense logistics.',photo:'uss-nimitz',ministry:'defense'},
      {title:'Intelligence & Research',desc:'Research priorities and strategic reports.',photo:'hydroelectric-plant',ministry:'science_research'},
      {title:'Society & Infrastructure',desc:'Infrastructure, food systems and public services.',photo:'wheat-field',ministry:'infrastructure'},
      {title:'Events & Projects',desc:'Project schedules, milestones and completion state.',photo:'dhaka-skyline',ministry:'mega_projects'},
      {title:'Reports & Data Quality',desc:'Source coverage and missing fields.',photo:'wind-farm',route:'reports'},
      {title:'Religion & Ideology',desc:'Open the existing religion and ideology policy system.',photo:'mosque-architecture',route:'religion'},
      {title:'Health & Welfare',desc:'Public health, medical facilities and welfare programs.',photo:'chittagong-hospital',ministry:'health_welfare'},
      {title:'Agriculture & Food',desc:'Agriculture, food security and production systems.',photo:'wheat-field',ministry:'agriculture_food'}
    ];
    function card(x){var action=x.route?'<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-global-nav="'+esc(x.route)+'">Open section ↗</button>':'<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-more-ministry="'+esc(x.ministry)+'">Open ministry ↗</button>';
      return '<article class="omega-v2-card omega-v2-domain-card">'+photoMarkup(x.photo,x.title+', representative reference photograph',x.title,true)+'<div class="omega-v2-domain-card-body"><span class="omega-v2-eyebrow">STRATEGIC DOMAIN</span><h3 class="omega-v2-card-title">'+esc(x.title)+'</h3><p class="omega-v2-card-meta">'+esc(x.desc)+'</p><div class="omega-v2-domain-card-action">'+action+'</div></div></article>';}
    function core(id,title,desc,pic){return '<article class="omega-v2-card omega-v2-command-card">'+photoMarkup(pic,title+', representative reference image',title.toUpperCase(),true)+'<div class="omega-v2-domain-card-body"><h3 class="omega-v2-card-title">'+esc(title)+'</h3><p class="omega-v2-card-meta">'+esc(desc)+'</p><button type="button" class="omega-v2-button" data-omega-v2-global-nav="'+id+'">Open '+esc(title)+' ↗</button></div></article>';}
    content.innerHTML='<section class="omega-v2-shell omega-v2-more-page"><header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">OMEGA / ATLAS COMMAND</div><h1 class="omega-v2-title">Command Center</h1><p class="omega-v2-subtitle">One navigation system for the whole game. Existing simulation engines retain authority over country data and actions.</p></div><span class="omega-v2-status" data-state="operational">LOCAL-FIRST UI</span></header>'+photoMarkup('dhaka-skyline','Urban skyline, representative national infrastructure image','NATIONAL CONTEXT',false)+'<div class="omega-v2-note">Images are illustrative, not proof of ownership. Actions use existing canonical modules and never claim success without confirmation.</div><h2 class="omega-v2-section-title">Core command</h2><div class="omega-v2-grid omega-v2-core-grid">'+core('overview','Overview','National briefing and sourced indicators.','dhaka-skyline')+core('government','Government','Executive Ministry and All Ministries.','bangladesh-parliament')+core('economy','Economy','Treasury state and macro indicators.','container-ship')+'</div><h2 class="omega-v2-section-title">Strategic domains</h2><div class="omega-v2-grid omega-v2-domain-grid">'+items.map(card).join('')+'</div></section>';
  }
  function renderReligion(root,content) {
    var candidate=stateFor(root).countryId||g.OmegaMinistryViewCountry||'',country=String(candidate||'').trim().toUpperCase();
    content.innerHTML='<section class="omega-v2-shell omega-v2-religion"><header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ATLAS COMMAND / SOCIETY</div><h1 class="omega-v2-title">Religion & Ideology</h1><p class="omega-v2-subtitle">Country '+esc(country||'Not recorded')+' · existing religion and ideology system</p></div><span class="omega-v2-status" data-state="operational">CANONICAL HANDOFF</span></header>'+
      photoMarkup('mosque-architecture','Mosque architecture, representative reference image for religion and society','RELIGION & IDEOLOGY',false)+
      '<div class="omega-v2-note">The photo is illustrative and does not indicate that the selected country follows a particular religion. Religious shares and government ideology are shown only by the existing authoritative system.</div>'+
      '<section class="omega-v2-card omega-v2-domain-handoff"><div class="omega-v2-eyebrow">RELIGION & IDEOLOGY</div><h2 class="omega-v2-card-title">Recorded policy overview</h2><p class="omega-v2-card-meta">This view remains inside UI v2. Registered religion and ideology information is displayed without opening the retired interface or duplicating game state.</p><div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-global-nav="government">Return to Government</button><button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-global-nav="more">All strategic domains</button></div></section></section>';
    return {ok:true,route:'religion',countryId:country||null,canonicalHandoff:true};
  }
  function routeScreen(root, content) {
    var state = stateFor(root);
    var options = state.options || {};
    if (state.route === 'overview') {
      return renderOverview(root, content);
    } else if (state.route === 'more') {
      return renderMore(root, content);
    } else if (state.route === 'religion') {
      return renderReligion(root, content);
    } else if (state.route === 'government') {
      if (g.OmegaUIV2Government && typeof g.OmegaUIV2Government.render === 'function') {
        return g.OmegaUIV2Government.render(content, ministryOptions(root));
      }
    } else if (state.route === 'economy') {
      if (g.OmegaUIV2Economy && typeof g.OmegaUIV2Economy.render === 'function') {
        return g.OmegaUIV2Economy.render(content, Object.assign({}, options, { countryId:state.countryId, onOpenMinistry:function (id) { return openMinistry(root, id); } }));
      }
    } else if (state.route === 'industry' || (state.route === 'ministry-detail' && state.ministryId === 'production')) {
      if (g.OmegaUIV2Industry && typeof g.OmegaUIV2Industry.render === 'function') return g.OmegaUIV2Industry.render(content, Object.assign({}, options, { countryId:state.countryId, onOpenFactory:options.onOpenFactory }));
    } else if (state.route === 'home-affairs' || (state.route === 'ministry-detail' && state.ministryId === 'interior_security')) {
      if (g.OmegaUIV2HomeAffairs && typeof g.OmegaUIV2HomeAffairs.render === 'function') return g.OmegaUIV2HomeAffairs.render(content, Object.assign({}, options, { countryId:state.countryId, tab:state.section }));
    } else if (state.route === 'resources' || (state.route === 'ministry-detail' && state.ministryId === 'energy_mining')) {
      if (g.OmegaUIV2ResourceMinistry && typeof g.OmegaUIV2ResourceMinistry.render === 'function') {
        return g.OmegaUIV2ResourceMinistry.render(content, Object.assign({}, options, { countryId:state.countryId,
          onOpenSite:function (siteId) { state.resourceSiteId = siteId; return navigate(root, 'mine-detail'); },
          onLocateSite:options.onLocateMine, getInventoryForSite:options.getInventoryForSite }));
      }
    } else if (state.route === 'mine-detail') {
      if (g.OmegaUIV2MineDetail && typeof g.OmegaUIV2MineDetail.render === 'function') return g.OmegaUIV2MineDetail.render(content, Object.assign({}, options, { countryId:state.countryId, siteId:state.resourceSiteId, onBack:function () { back(root); } }));
    } else if (state.route === 'reports') {
      if (g.OmegaUIV2Reports && typeof g.OmegaUIV2Reports.render === 'function') return g.OmegaUIV2Reports.render(content, Object.assign({}, options, { countryId:state.countryId, onOpenDomain:function (id) { return openDomain(root, id); } }));
    } else if (state.route === 'ministry-detail') {
      if (g.OmegaUIV2MinistryDetail && typeof g.OmegaUIV2MinistryDetail.render === 'function') {
        return g.OmegaUIV2MinistryDetail.render(content, Object.assign({}, options, { countryId:state.countryId, ministryId:state.ministryId,
          onNavigate:function (destination) { return navigate(root, destination); }, section:state.section }));
      }
    }
    if (state.route === 'map') {
      if (typeof options.renderMap === 'function') return options.renderMap(content, { countryId:state.countryId, onOpenGovernment:function () { navigate(root, 'government'); } });
      content.innerHTML = '<section class="omega-v2-shell"><header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">WORLD MAP</div><h1 class="omega-v2-title">Global Map Command</h1><p class="omega-v2-subtitle">The authoritative world map stays in the existing map engine. UI v2 does not create a duplicate map or own country coordinates.</p></div></header><div class="omega-v2-card"><h2 class="omega-v2-card-title">Open the map runtime</h2><p class="omega-v2-card-meta">Mount the UI v2 shell with a host-provided map renderer or a Back to Map callback to return to the live map without rebuilding its state.</p><div class="omega-v2-actions"><button class="omega-v2-button omega-v2-button--primary" type="button" data-omega-v2-action="back-to-map"' + (typeof options.onBackToMap === 'function' ? '' : ' disabled') + '>Return to live world map</button><button class="omega-v2-button" type="button" data-omega-v2-global-nav="government">Government</button></div></div></section>';
      return { ok:true, route:'map', mapAdapterAvailable:false };
    }
    content.innerHTML = '<section class="omega-v2-shell"><div class="omega-v2-empty">This screen module has not been loaded. The game state was not altered.</div></section>';
    return { ok:false, code:'SCREEN_MODULE_UNAVAILABLE', route:state.route };
  }
  function render(root) {
    var state = stateFor(root);
    var countryChoices = Array.isArray(state.options.countryOptions) ? state.options.countryOptions : [];
    var countryControl = countryChoices.length
      ? '<select class="omega-v2-country-select" data-omega-v2-country aria-label="Selected country">' + countryChoices.map(function (item) {
        var id = typeof item === 'string' ? item : item.id || item.iso3 || item.countryCode || item.value;
        var label = typeof item === 'string' ? item : item.name || item.label || id;
        return '<option value="' + esc(id) + '"' + (String(id).toUpperCase() === String(state.countryId).toUpperCase() ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('') + '</select>'
      : '<span class="omega-v2-country-badge">COUNTRY ' + esc(state.countryId || 'NOT RECORDED') + '</span>';
    var oldMain = root.querySelector && root.querySelector('[data-omega-v2-main]');
    if (oldMain && g.OmegaUIV2Government && typeof g.OmegaUIV2Government.stopAutoRotation === 'function') g.OmegaUIV2Government.stopAutoRotation(oldMain);
    root.classList.add('omega-v2-app-root');
    root.innerHTML = '<div class="omega-v2-app-frame">' +
      '<header class="omega-v2-app-header"><button class="omega-v2-button omega-v2-button--quiet" type="button" data-omega-v2-back aria-label="Go back">‹ Back</button><div class="omega-v2-app-brand"><span class="omega-v2-brand-mark">Ω</span><div><strong>OMEGA</strong><small>GLOBAL COMMAND</small></div></div>' +
      jumpMenuMarkup(state.route) + countryControl +
      '<button class="omega-v2-button omega-v2-button--exit" type="button" data-omega-v2-exit aria-label="Exit to live world map" title="Exit to live world map">Exit ↗</button></header>' +
      '<main class="omega-v2-app-main" data-omega-v2-main></main>' +
      '<nav class="omega-v2-bottom-nav" aria-label="Main navigation">' +
      navButton('map','World',state.route) + navButton('overview','Overview',state.route) + navButton('government','Government',state.route) + navButton('economy','Economy',state.route) + navButton('more','More',state.route) +
      '</nav></div>';
    var main = root.querySelector('[data-omega-v2-main]');
    var result = routeScreen(root, main);
    var backButton = root.querySelector('[data-omega-v2-back]');
    if (backButton) backButton.disabled = !state.history.length && state.route === 'map';
    root.setAttribute('data-omega-v2-route', state.route);
    return result;
  }
  function mount(root, options) {
    options = options || {};
    if (typeof root === 'string') root = g.document && g.document.querySelector(root);
    if (!root) return { ok:false, code:'UI_V2_ROOT_NOT_FOUND' };
    if (!g.document || typeof root.addEventListener !== 'function') return { ok:false, code:'UI_V2_DOM_UNAVAILABLE' };
    if (!root.__omegaUIV2Bound) {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        // Stop app-owned controls at the UI v2 boundary after screen-local handlers
        // have run. This prevents document-level map and retired UI listeners from
        // acting on the same tap and duplicating expensive state transitions.
        var ownControl = target.closest('button,a[href],[role="button"],summary');
        if (ownControl && root.contains(ownControl) && event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        var exit = target.closest('[data-omega-v2-exit]');
        if (exit && root.contains(exit)) {
          if (event.preventDefault) event.preventDefault();
          exitToMap(root);
          return;
        }
        var jumpMinistry = target.closest('[data-omega-v2-jump-ministry]');
        if (jumpMinistry && root.contains(jumpMinistry)) { if (event.preventDefault) event.preventDefault(); openMinistry(root, jumpMinistry.getAttribute('data-omega-v2-jump-ministry')); return; }
        var jumpRoute = target.closest('[data-omega-v2-jump-route]');
        if (jumpRoute && root.contains(jumpRoute)) { if (event.preventDefault) event.preventDefault(); navigate(root, jumpRoute.getAttribute('data-omega-v2-jump-route')); return; }
        var nav = target.closest('[data-omega-v2-global-nav]');
        if (nav && root.contains(nav)) { if (event.preventDefault) event.preventDefault(); navigate(root, nav.getAttribute('data-omega-v2-global-nav')); return; }
        var domain = target.closest('[data-omega-v2-more-ministry]');
        if (domain && root.contains(domain)) { if (event.preventDefault) event.preventDefault(); openMinistry(root, domain.getAttribute('data-omega-v2-more-ministry')); return; }
        if (target.closest('[data-omega-v2-back]') && root.contains(target)) { if (event.preventDefault) event.preventDefault(); back(root); return; }
        if (target.closest('[data-omega-v2-action="back-to-map"]') && root.contains(target)) {
          if (event.preventDefault) event.preventDefault();
          exitToMap(root);
          return;
        }
      });
      root.addEventListener('change', function (event) {
        var target = event && event.target;
        if (!target || !target.matches || !target.matches('[data-omega-v2-country]')) return;
        var state = stateFor(root);
        state.countryId = String(target.value || '').trim().toUpperCase();
        g.OmegaMinistryViewCountry = state.countryId;
        if (state.options && typeof state.options.onCountryChange === 'function') state.options.onCountryChange(state.countryId);
        render(root);
      });
      root.addEventListener('keydown', function (event) {
        if (!event || (event.key !== 'Escape' && !(event.altKey && event.key === 'ArrowLeft'))) return;
        var isEscape = event.key === 'Escape';
        var target = event.target;
        var openMenu = isEscape && root.querySelector && root.querySelector('.omega-v2-route-switcher[open]');
        if (openMenu) {
          openMenu.removeAttribute('open');
          if (event.preventDefault) event.preventDefault();
          return;
        }
        if (isEscape && target && typeof target.closest === 'function' &&
            target.closest('input, select, textarea, [contenteditable="true"]')) return;
        if (event.preventDefault) event.preventDefault();
        back(root);
      });
      root.__omegaUIV2Bound = true;
    }
    var internalRoutes = ['home-affairs', 'resources', 'ministry-detail', 'mine-detail'];
    var acceptedRoutes = ROUTES.concat(internalRoutes);
    var initialRoute = acceptedRoutes.indexOf(options.initialRoute) >= 0 ? options.initialRoute : 'map';
    var initialHistory = Array.isArray(options.initialHistory) ? options.initialHistory.map(function (item) {
      item = item || {};
      return {
        route:item.route || 'map',
        ministryId:item.ministryId || null,
        section:item.section || 'dashboard',
        resourceSiteId:item.resourceSiteId || null,
        governmentView:item.governmentView === 'all-ministries' ? 'all-ministries' : 'executive-ministry'
      };
    }) : [];
    root.__omegaUIV2State = {
      route:initialRoute,
      ministryId:options.initialMinistryId ? String(options.initialMinistryId) : null,
      section:options.initialSection || 'dashboard',
      resourceSiteId:options.initialResourceSiteId || null,
      governmentView:options.initialGovernmentView === 'all-ministries' ? 'all-ministries' : 'executive-ministry',
      countryId:String(options.countryId || currentCountry() || '').toUpperCase(),
      history:initialHistory, options:options
    };
    return Object.assign({ mounted:true }, render(root));
  }
  function unmount(root) {
    if (typeof root === 'string') root = g.document && g.document.querySelector(root);
    if (!root || !root.__omegaUIV2State) return { ok:false, code:'UI_V2_NOT_MOUNTED' };
    root.innerHTML = '';
    delete root.__omegaUIV2State;
    root.classList.remove('omega-v2-app-root');
    return { ok:true };
  }

  g.OmegaUIV2App = Object.freeze({ version:'1.0.0', mount:mount, render:render, navigate:navigate, back:back, openMinistry:openMinistry, unmount:unmount, destinations:ROUTES.slice() });
})(typeof window !== 'undefined' ? window : globalThis);
