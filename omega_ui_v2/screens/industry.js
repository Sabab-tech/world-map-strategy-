/* OMEGA UI v2 Industry screen.
 * Read-only view over existing production assets, cycles, inventory and projects.
 * Does not execute factory construction, procurement, input transfer or production.
 */
(function (g) {
  'use strict';

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function num(value) { if (value === null || value === undefined || value === '') return null; var n = Number(value); return Number.isFinite(n) ? n : null; }
  function fmt(value, unit) { var n = num(value); return n === null ? 'Not recorded' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (unit ? ' ' + esc(unit) : ''); }
  function labelStatus(value) { var text = String(value == null ? '' : value).replace(/[_-]+/g, ' ').trim().toLowerCase(); return text ? text.replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) : 'Not recorded'; }
  function stateRoot() { return g.Game && g.Game.state || g.gameState || null; }
  function pickCountryBucket(root, country) {
    if (!root || typeof root !== 'object') return null;
    var code = String(country || '').trim().toUpperCase();
    if (code && root[code] && typeof root[code] === 'object') return root[code];
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i += 1) if (keys[i].trim().toUpperCase() === code && root[keys[i]] && typeof root[keys[i]] === 'object') return root[keys[i]];
    return null;
  }
  function countryContext(country) {
    var code = String(country || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '').trim().toUpperCase();
    var root = stateRoot() || {};
    return {
      countryId: code || null,
      resource: pickCountryBucket(root.resource, code) || pickCountryBucket(root.resources, code) || null,
      economy: pickCountryBucket(root.economy, code) || null
    };
  }
  function safeNetwork() { return g.OmegaResourceIndustrialNetwork || (g.Omega && g.Omega.ResourceIndustrialNetwork) || null; }
  function safeCatalog() { return g.OmegaResourceIndustrialCatalogData || (g.Omega && g.Omega.ResourceIndustrialCatalogData) || null; }

  function buildViewModel(options) {
    options = options || {};
    var context = countryContext(options.countryId);
    var resource = context.resource || {};
    var economy = context.economy || {};
    var industrial = resource.industrialNetwork && typeof resource.industrialNetwork === 'object' ? resource.industrialNetwork : {};
    var catalog = safeCatalog() || {};
    var assets = Array.isArray(economy.productionAssets) ? economy.productionAssets : [];
    var projects = Array.isArray(industrial.projects) ? industrial.projects : (Array.isArray(economy.projects) ? economy.projects : []);
    var cycles = industrial.factoryProductionCycles && typeof industrial.factoryProductionCycles === 'object' ? industrial.factoryProductionCycles : {};
    var runs = industrial.factoryRuntime && typeof industrial.factoryRuntime === 'object' ? industrial.factoryRuntime : {};
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger : (Array.isArray(resource.siteFlowLedger) ? resource.siteFlowLedger : []);
    var mappedAssets = assets.map(function (asset) {
      asset = asset && typeof asset === 'object' ? asset : {};
      var id = String(asset.id || asset.assetId || asset.projectId || '');
      var type = String(asset.factoryType || asset.type || asset.facilityType || '');
      var profile = profiles[type.toUpperCase()] || profiles[type] || {};
      var cycle = cycles[id] || null;
      var run = runs[id] || null;
      var health = asset.productionHealth && typeof asset.productionHealth === 'object' ? asset.productionHealth : {};
      var input = asset.inputInventory && typeof asset.inputInventory === 'object' ? asset.inputInventory : {};
      var inputRows = Object.keys(input).map(function (key) { return { resourceId: key, quantity: num(input[key]), rawValue: input[key] }; });
      var employment = asset.employment && typeof asset.employment === 'object' ? asset.employment : {};
      return {
        id: id || null,
        name: String(profile.name || asset.name || type || id || 'Unnamed registered factory'),
        type: type || 'Not recorded',
        recipeId: String(asset.recipeId || profile.defaultRecipeId || 'Not recorded'),
        status: String(asset.status || 'NOT_RECORDED'),
        capacityPerDay: num(asset.capacityPerDay !== undefined ? asset.capacityPerDay : asset.capacity !== undefined ? asset.capacity : asset.productionCapacity),
        productivityPct: num(health.productivityPct),
        healthStatus: String(health.status || 'NOT_RECORDED'),
        healthReason: String(health.reason || 'Not recorded'),
        location: String(asset.locationNodeKey || asset.location || 'Not recorded'),
        jobsFilled: num(employment.jobsFilled),
        jobSlots: num(employment.jobsSupported !== undefined ? employment.jobsSupported : profile.employment && profile.employment.jobsPerFactory),
        vacancies: num(employment.vacancies),
        inputRows: inputRows,
        cycle: cycle,
        lastRun: run,
        lastProductionTurn: run && (run.turn !== undefined ? run.turn : run.simulationTurn) !== undefined ? (run.turn !== undefined ? run.turn : run.simulationTurn) : (asset.lastProductionTurn !== undefined ? asset.lastProductionTurn : null),
        latestOutputs: run && (run.outputQuantities || run.outputs) || null,
        authority: String(profile.authority || asset.authority || 'NOT_RECORDED'),
        raw: asset
      };
    });
    var cyclesList = Object.keys(cycles).map(function (id) { return Object.assign({ factoryId: id }, cycles[id] || {}); });
    return {
      countryId: context.countryId,
      hasCountryState: !!(context.resource || context.economy),
      factoryCount: mappedAssets.length,
      factories: mappedAssets,
      projects: projects.slice(),
      cycles: cyclesList,
      recentFlowCount: flows.length,
      recentFlows: flows.slice(-20).reverse(),
      catalogProfileCount: Object.keys(profiles).length,
      catalogProfiles: profiles,
      inputInventoryCount: mappedAssets.reduce(function (total, row) { return total + row.inputRows.filter(function (input) { return input.quantity !== null && input.quantity > 0; }).length; }, 0),
      source: 'Game.state.resource[country].industrialNetwork + Game.state.economy[country].productionAssets + canonical industrial catalogue'
    };
  }

  function tabButton(id, label, active) {
    return '<button type="button" class="omega-v2-button ' + (active === id ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-industry-tab="' + esc(id) + '" aria-pressed="' + (active === id ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }
  function factoryVisual(type, label) {
    var catalog = g.OmegaFactoryVisualCatalog;
    if (catalog && typeof catalog.render === 'function') {
      try { return catalog.render(type, label); } catch (_) {}
    }
    return '<div class="omega-v2-photo-placeholder" aria-label="' + esc(label) + '">Factory art unavailable</div>';
  }
  function factoryPhoto(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var descriptor = [factory.type, factory.name, factory.recipeId, factory.category].join(' ').toUpperCase();
    var photoId = 'industrial-production-line';
    if (/(REFIN|PETRO|CHEMICAL|CHEM\b|OIL|GAS|FERTIL|FUEL)/.test(descriptor)) photoId = 'geelong-oil-refinery';
    else if (/(POWER|ENERGY|ELECTRIC|HYDRO|TURBINE|GENERATOR)/.test(descriptor)) photoId = 'hydroelectric-plant';
    else if (/(MINE|ORE|MINERAL|SMELT|STEEL|METAL|COPPER|ALUMIN)/.test(descriptor)) photoId = 'open-pit-mine';
    else if (/(AGRI|FOOD|WHEAT|GRAIN|SUGAR|COTTON|CEREAL)/.test(descriptor)) photoId = 'wheat-field';
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get(photoId):null;}catch(_){}
    var defaultFactoryPhotoPath = 'assets/ui-photos/industrial-production-line.webp';
    var fallbackPaths = {
      'industrial-production-line':defaultFactoryPhotoPath,
      'geelong-oil-refinery':'assets/ui-photos/geelong-oil-refinery.webp',
      'hydroelectric-plant':'assets/ui-photos/hydroelectric-plant.webp',
      'open-pit-mine':'assets/ui-photos/open-pit-mine.webp',
      'wheat-field':'assets/ui-photos/wheat-field.webp'
    };
    var path=item&&/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path||''))?item.path:(fallbackPaths[photoId]||fallbackPaths['industrial-production-line']);
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo omega-v2-photo--tile omega-v2-factory-photo"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="'+esc(factory.name||factory.type||'Industrial production')+', representative factory reference photograph"><figcaption><strong>'+esc(item&&item.caption||'INDUSTRIAL PRODUCTION')+'</strong>'+credit+'</figcaption></figure>';
  }
  function factoryCard(factory, options) {
    var status = factory.healthStatus || factory.status || 'NOT_RECORDED';
    var statusKey = /STOPPED|BLOCKED|FAILED|CLOSED/.test(status) ? 'blocked' : /ACTIVE|OPERAT|RUNNING|READY|IN_PROGRESS/.test(status) ? 'operational' : 'unknown';
    var inputRows = factory.inputRows.filter(function (row) { return row.quantity !== null && row.quantity > 0; }).map(function (row) {
      return '<div class="omega-v2-material-row"><span>' + esc(row.resourceId) + '</span><strong>' + fmt(row.quantity) + '</strong></div>';
    }).join('');
    var cycle = factory.cycle;
    var cycleLine = cycle && /IN_PROGRESS|PAUSED/.test(String(cycle.status || '').toUpperCase())
      ? labelStatus(cycle.status) + ' · ' + fmt(cycle.productionQuantity, 'units/cycle') + ' · ' + esc(cycle.finishDate || 'Finish date not recorded')
      : cycle ? esc(labelStatus(cycle.status || 'Cycle status not recorded')) : 'No active cycle recorded';
    var outputs = factory.latestOutputs;
    var outputRows = outputs && typeof outputs === 'object' ? Object.keys(outputs).slice(0, 16).map(function (key) {
      var value = outputs[key];
      if (value && typeof value === 'object') value = Array.isArray(value) ? value.join(', ') : Object.keys(value).map(function (part) { return part + ': ' + String(value[part]); }).join(' · ');
      return '<div class="omega-v2-material-row"><span>' + esc(labelStatus(key)) + '</span><strong>' + esc(value == null || value === '' ? 'Not recorded' : value) + '</strong></div>';
    }).join('') : '';
    var canOpen = options && typeof options.onOpenFactory === 'function';
    return '<article class="omega-v2-card" data-omega-v2-factory-card data-search="' + esc((factory.name + ' ' + factory.id + ' ' + factory.type + ' ' + factory.recipeId).toLowerCase()) + '">' +
      '<div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title">' + esc(factory.name) + '</h3><div class="omega-v2-card-meta">' + esc(labelStatus(factory.type)) + '</div></div><span class="omega-v2-status" data-state="' + statusKey + '">' + esc(labelStatus(status)) + '</span></div>' +
      '<div class="omega-v2-factory-art">' + factoryPhoto(factory) + '</div>' +
      '<div class="omega-v2-vehicle-stats">' +
      '<div><span>Recipe</span><strong>' + esc(factory.recipeId) + '</strong></div>' +
      '<div><span>Daily capacity</span><strong>' + fmt(factory.capacityPerDay) + '</strong></div>' +
      '<div><span>Productivity</span><strong>' + (factory.productivityPct === null ? 'Not recorded' : fmt(factory.productivityPct, '%')) + '</strong></div>' +
      '<div><span>Location</span><strong>' + esc(factory.location) + '</strong></div>' +
      '<div><span>Jobs filled / supported</span><strong>' + fmt(factory.jobsFilled) + ' / ' + fmt(factory.jobSlots) + '</strong></div>' +
      '<div><span>Vacancies</span><strong>' + fmt(factory.vacancies) + '</strong></div>' +
      '</div><h4 class="omega-v2-section-title">Production cycle</h4><p class="omega-v2-card-meta">' + cycleLine + '</p>' +
      '<h4 class="omega-v2-section-title">Tracked input inventory</h4>' + (inputRows ? '<div class="omega-v2-materials">' + inputRows + '</div>' : '<p class="omega-v2-card-meta">No input stock is recorded for this factory.</p>') +
      '<h4 class="omega-v2-section-title">Latest output</h4>' + (outputRows ? '<div class="omega-v2-materials">' + outputRows + '</div>' : '<p class="omega-v2-card-meta">Output has not been recorded yet.</p>') +
      
      '<div class="omega-v2-actions"><button class="omega-v2-button omega-v2-button--primary" data-omega-v2-open-factory="' + esc(factory.id || '') + '"' + (canOpen ? '' : ' disabled title="Factory detail is not available yet."') + '>View factory</button></div></article>';
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok: false, code: 'INDUSTRY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var active = options.tab || root.__omegaV2IndustryTab || 'factories';
    var content = '';
    if (active === 'factories') {
      content = model.factories.length ? '<div class="omega-v2-grid">' + model.factories.map(function (row) { return factoryCard(row, options); }).join('') + '</div>' : '<div class="omega-v2-empty">No commissioned production assets are recorded for ' + esc(model.countryId || 'the selected country') + '. Catalog profiles are not counted as owned factories.</div>';
    } else if (active === 'production-lines') {
      content = model.cycles.length ? '<div class="omega-v2-grid">' + model.cycles.map(function (cycle) {
        return '<article class="omega-v2-card"><h3 class="omega-v2-card-title">' + esc(cycle.factoryId) + '</h3><span class="omega-v2-status">' + esc(cycle.status || 'NOT_RECORDED') + '</span><div class="omega-v2-vehicle-stats"><div><span>Output quantity</span><strong>' + fmt(cycle.productionQuantity) + '</strong></div><div><span>Start date</span><strong>' + esc(cycle.startDate || 'Not recorded') + '</strong></div><div><span>Finish date</span><strong>' + esc(cycle.finishDate || 'Not recorded') + '</strong></div><div><span>Source batches</span><strong>' + fmt(Array.isArray(cycle.sourceBatchIds) ? cycle.sourceBatchIds.length : null) + '</strong></div></div></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No tracked production cycles were returned by this country’s industrial state.</div>';
    } else if (active === 'inventory') {
      var rows = [];
      model.factories.forEach(function (factory) { factory.inputRows.forEach(function (item) { rows.push({ factory: factory.id || factory.name, resource: item.resourceId, quantity: item.quantity }); }); });
      content = rows.length ? '<div class="omega-v2-card"><div class="omega-v2-table-wrap"><table><thead><tr><th>Factory</th><th>Input resource</th><th>Recorded quantity</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + esc(row.factory) + '</td><td>' + esc(row.resource) + '</td><td>' + fmt(row.quantity) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="omega-v2-source">Rows reflect per-factory input inventory only. They do not assert country-wide warehouse availability or a completed logistics receipt.</p></div>' : '<div class="omega-v2-empty">No per-factory input quantities are recorded. Shared warehouse stock is not inferred.</div>';
    } else {
      content = model.projects.length ? '<div class="omega-v2-grid">' + model.projects.slice().reverse().map(function (project) {
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(project.projectType || 'Industrial project') + '</h3><span class="omega-v2-status">' + esc(project.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Project ID</span><strong>' + esc(project.projectId || 'Not recorded') + '</strong></div><div><span>Site / factory</span><strong>' + esc(project.siteId || project.factoryId || 'Not recorded') + '</strong></div><div><span>Start turn</span><strong>' + fmt(project.createdTurn !== undefined ? project.createdTurn : project.startedTurn) + '</strong></div><div><span>Cost</span><strong>' + (num(project.costUsd) === null ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num(project.costUsd))) + '</strong></div></div></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No industrial or construction project rows are recorded for this country.</div>';
    }

    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-industry">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">INDUSTRY · PRODUCTION SYSTEM</div><h1 class="omega-v2-title">Factories & Production</h1><p class="omega-v2-subtitle">Country ' + esc(model.countryId || 'Not recorded') + ' · factories, input stock, output and build projects</p></div><span class="omega-v2-status">' + fmt(model.factoryCount) + ' commissioned assets</span></header>' +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Owned factory assets</span><strong>' + fmt(model.factoryCount) + '</strong></div><div class="omega-v2-kpi"><span>Tracked production cycles</span><strong>' + fmt(model.cycles.length) + '</strong></div><div class="omega-v2-kpi"><span>Tracked input rows</span><strong>' + fmt(model.inputInventoryCount) + '</strong></div><div class="omega-v2-kpi"><span>Available factory designs</span><strong>' + fmt(model.catalogProfileCount) + '</strong></div><div class="omega-v2-kpi"><span>Recent site flows</span><strong>' + fmt(model.recentFlowCount) + '</strong></div></div>' +
      '<div class="omega-v2-note">Use the tabs to review factory details, production cycles, input stock and construction projects.</div>' +
      '<div class="omega-v2-filterbar">' +
      tabButton('factories', 'My Factories', active) +
      tabButton('production-lines', 'Production Lines', active) +
      tabButton('inventory', 'Input Inventory', active) +
      tabButton('projects', 'Build Projects', active) +
      '</div><div data-omega-v2-industry-content>' + content + '</div>' +
      '</section>';

    if (!root.__omegaV2IndustryBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-industry-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaV2IndustryTab = tab.getAttribute('data-omega-v2-industry-tab');
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab }));
          return;
        }
        var factory = target.closest('[data-omega-v2-open-factory]');
        if (factory && root.contains(factory) && !factory.disabled) {
          var callback = root.__omegaV2IndustryOptions && root.__omegaV2IndustryOptions.onOpenFactory;
          if (typeof callback === 'function') callback(factory.getAttribute('data-omega-v2-open-factory'), model);
        }
      });
      root.__omegaV2IndustryBound = true;
    }
    root.__omegaV2IndustryOptions = options;
    root.__omegaV2IndustryTab = active;
    try {
      var visuals = g.OmegaFactoryVisualCatalog;
      if (visuals && typeof visuals.ready === 'function') visuals.ready().then(function () { if (typeof visuals.refresh === 'function') visuals.refresh(root); }).catch(function () {});
    } catch (_) {}
    return { ok: true, model: model };
  }

  g.OmegaUIV2Industry = Object.freeze({ version: '1.0.0', buildViewModel: buildViewModel, render: render });
})(typeof window !== 'undefined' ? window : globalThis);
