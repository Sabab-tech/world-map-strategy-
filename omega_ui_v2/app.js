/* OMEGA UI v2 host shell.
 * Mount explicitly into a supplied root; it never replaces the production app on its own.
 */
(function (g) {
  'use strict';

  var ROUTES = ['map', 'government', 'economy', 'industry', 'reports'];
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
    return '<button type="button" class="omega-v2-nav-button' + (active === id ? ' is-active' : '') + '" data-omega-v2-global-nav="' + esc(id) + '" aria-current="' + (active === id ? 'page' : 'false') + '">' + esc(label) + '</button>';
  }
  function ministryOptions(root) {
    var state = stateFor(root);
    return {
      countryId: state.countryId,
      view: state.governmentView,
      onOpenMinistry: function (id) { return openMinistry(root, id); },
      onOpenDomain: function (domain) { return openDomain(root, domain); },
      onNavigate: function (destination) { return navigate(root, destination); },
      onCountryChange: function (countryId) {
        state.countryId = String(countryId || '').trim().toUpperCase();
        g.OmegaMinistryViewCountry = state.countryId;
        render(root);
      }
    };
  }
  function routeName(id) {
    return ({
      'executive-ministry': 'government',
      'all-ministries': 'government',
      'country-overview': 'government',
      'treasury_finance':'economy',
      'taxes':'economy',
      'central_bank':'economy',
      'trade':'economy',
      'production':'industry',
      'energy_mining':'resources',
      'interior_security':'home-affairs',
      'mega_projects':'ministry-detail'
    })[String(id)] || 'ministry-detail';
  }
  function openMinistry(root, id) {
    var state = stateFor(root);
    id = String(id || '').trim();
    if (!id) return false;
    state.history.push({ route: state.route, ministryId: state.ministryId, section: state.section, resourceSiteId: state.resourceSiteId });
    state.ministryId = id;
    state.section = 'dashboard';
    var next = routeName(id);
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
    if (domain === 'economy-finance' || domain === 'treasury_finance') return navigate(root, 'economy');
    if (domain === 'mega-projects' || domain === 'mega_projects') return openMinistry(root, 'mega_projects');
    return false;
  }
  function navigate(root, route) {
    var state = stateFor(root);
    if (ROUTES.indexOf(route) >= 0 && state.route !== route) {
      state.history.push({ route: state.route, ministryId: state.ministryId, section: state.section, resourceSiteId: state.resourceSiteId });
      state.route = route;
      if (route === 'government') state.governmentView = 'executive-ministry';
      render(root);
      return true;
    }
    if (route === 'home-affairs' || route === 'resources' || route === 'ministry-detail') {
      state.history.push({ route: state.route, ministryId: state.ministryId, section: state.section, resourceSiteId: state.resourceSiteId });
      state.route = route;
      render(root);
      return true;
    }
    if (route === 'mine-detail') {
      state.history.push({ route: state.route, ministryId: state.ministryId, section: state.section, resourceSiteId: state.resourceSiteId });
      state.route = route;
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
    render(root);
    return true;
  }
  function routeScreen(root, content) {
    var state = stateFor(root);
    var options = state.options || {};
    if (state.route === 'government') {
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
    root.classList.add('omega-v2-app-root');
    root.innerHTML = '<div class="omega-v2-app-frame">' +
      '<header class="omega-v2-app-header"><button class="omega-v2-button omega-v2-button--quiet" type="button" data-omega-v2-back aria-label="Go back">‹ Back</button><div class="omega-v2-app-brand"><span class="omega-v2-brand-mark">Ω</span><div><strong>OMEGA</strong><small>GLOBAL COMMAND</small></div></div>' + countryControl + '</header>' +
      '<main class="omega-v2-app-main" data-omega-v2-main></main>' +
      '<nav class="omega-v2-bottom-nav" aria-label="Main navigation">' +
      navButton('map','Map',state.route) + navButton('government','Government',state.route) + navButton('economy','Economy',state.route) + navButton('industry','Industry',state.route) + navButton('reports','Reports',state.route) +
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
        var nav = target.closest('[data-omega-v2-global-nav]');
        if (nav && root.contains(nav)) { navigate(root, nav.getAttribute('data-omega-v2-global-nav')); return; }
        if (target.closest('[data-omega-v2-back]') && root.contains(target)) { back(root); return; }
        if (target.closest('[data-omega-v2-action="back-to-map"]') && root.contains(target)) {
          var state = stateFor(root);
          if (state.options && typeof state.options.onBackToMap === 'function') state.options.onBackToMap();
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
      root.__omegaUIV2Bound = true;
    }
    root.__omegaUIV2State = {
      route: options.initialRoute && ROUTES.indexOf(options.initialRoute) >= 0 ? options.initialRoute : 'map',
      ministryId:null, section:'dashboard', resourceSiteId:null, governmentView:'executive-ministry',
      countryId:String(options.countryId || currentCountry() || '').toUpperCase(),
      history:[], options:options
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
