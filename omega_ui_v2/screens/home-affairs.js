/* OMEGA UI v2 Home Affairs / Police.
 * Fleet visuals and recruit/order/service actions use existing canonical engines.
 */
(function (g) {
  'use strict';

  var TABS = [
    { id:'dashboard', label:'Dashboard' },
    { id:'personnel', label:'Personnel' },
    { id:'fleet', label:'Fleet' },
    { id:'patrols', label:'Patrols & Deployment' },
    { id:'facilities', label:'Facilities & Equipment' },
    { id:'incidents', label:'Incidents & Reports' },
    { id:'laws', label:'Laws & Sections' }
  ];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function fmt(v) { var n = num(v); return n === null ? 'Not recorded' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function displayStatus(value) { var text = String(value == null ? '' : value).replace(/[_-]+/g, ' ').trim().toUpperCase(); var labels = { SIMULATED:'Estimated', MODELED:'Estimated', MODELLED:'Estimated', UNOBSERVED:'Not measured', NOT_RECORDED:'Not recorded', OPERATIONAL:'Operational', ACTIVE:'Active', INACTIVE:'Inactive', IN_TRANSIT:'In transit', DELIVERED:'Delivered', BLOCKED:'Blocked', FAILED:'Failed' }; return labels[text] || (text ? text.toLowerCase().replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) : 'Not recorded'); }
  function money(v) { var n = num(v); return n === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n); }
  function countryId(options) {
    return String(options && options.countryId || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || g.playerCountryId || '').trim().toUpperCase();
  }
  function engine() { return g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry) || null; }
  function engineState(country) {
    var e = engine();
    if (!e || typeof e.getState !== 'function') return null;
    try { return e.getState(country); } catch (_) { return null; }
  }
  function fleetSnapshot(country) {
    var e = engine();
    if (!e || typeof e.getCountryFleetSnapshot !== 'function') return null;
    try { return e.getCountryFleetSnapshot(country); } catch (_) { return null; }
  }
  function estimateRecruitment(amount, country) {
    var e = engine();
    if (!e || typeof e.estimateRecruitmentImpact !== 'function') return { ok:false, code:'RECRUITMENT_QUOTE_UNAVAILABLE' };
    try { return e.estimateRecruitmentImpact(amount, country); } catch (_) { return { ok:false, code:'RECRUITMENT_QUOTE_FAILED' }; }
  }
  function getPhoto(id, alt) {
    var lib = g.OmegaUIPhotoAssets;
    var item = lib && typeof lib.get === 'function' ? lib.get(id) : null;
    if (!item || !/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path || ''))) return '';
    return '<figure class="omega-v2-photo"><img src="' + esc(item.path) + '" loading="lazy" decoding="async" alt="' + esc(alt || item.caption || 'Reference photo') + '"><figcaption>' + esc(item.caption || 'Reference image') + '<small>Reference image, not evidence of current operations</small></figcaption></figure>';
  }
  function stateSummary(state, fleet) {
    state = state || {};
    var vehicles = state.vehiclesOwned && typeof state.vehiclesOwned === 'object' ? state.vehiclesOwned : null;
    var owned = vehicles ? Object.keys(vehicles).reduce(function (sum, key) { var value = num(vehicles[key]); return sum + (value === null ? 0 : Math.max(0, value)); }, 0) : null;
    var incidents = Array.isArray(state.incidentLedger) ? state.incidentLedger : null;
    return [
      { label:'Police personnel', value:fmt(state.policeCount), source:'Current Home Ministry state' },
      { label:'Owned vehicle units', value:owned === null ? (fleet && num(fleet.ownedUnits) !== null ? fmt(fleet.ownedUnits) : 'Not recorded') : fmt(owned), source:'Country fleet state' },
      { label:'Recorded incidents', value:incidents ? fmt(incidents.length) : 'Not recorded', source:'Incident ledger' },
      { label:'Highest unlocked vehicle tier', value:fmt(state.unlockedVehicleLevel), source:'Vehicle unlock state' }
    ];
  }
  function tabBar(active) {
    return '<div class="omega-v2-filterbar omega-v2-home-tabs" role="group" aria-label="Home Affairs sections">' + TABS.map(function (tab) {
      return '<button type="button" class="omega-v2-button ' + (tab.id === active ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-home-tab="' + tab.id + '" aria-pressed="' + (tab.id === active ? 'true' : 'false') + '">' + esc(tab.label) + '</button>';
    }).join('') + '</div>';
  }
  function dashboardHtml(state, fleet, country) {
    var summary = stateSummary(state, fleet);
    return '<div class="omega-v2-home-dashboard">' +
      getPhoto('bangladesh-police-headquarters', 'Police headquarters reference photo') +
      '<div class="omega-v2-kpis">' + summary.map(function (item) { return '<div class="omega-v2-kpi"><span>' + esc(item.label) + '</span><strong>' + esc(item.value) + '</strong></div>'; }).join('') + '</div>' +
      '<h2 class="omega-v2-section-title">Operational sections</h2><div class="omega-v2-grid">' +
      [
        ['personnel','Personnel','Staff count, recruiting and training.'],
        ['fleet','Fleet','All 15 canonical vehicle tiers and country-owned inventory.'],
        ['patrols','Patrols & Deployment','Recorded patrol plan and supported deployment routing.'],
        ['facilities','Facilities & Equipment','Recorded station, academy and equipment levels.'],
        ['incidents','Incidents & Reports','Recorded security incidents and response status.']
      ].map(function (item) { return '<button type="button" class="omega-v2-card omega-v2-home-link" data-omega-v2-home-tab="' + item[0] + '"><span class="omega-v2-card-title">' + esc(item[1]) + '</span><span class="omega-v2-card-meta">' + esc(item[2]) + '</span></button>'; }).join('') +
      '</div><p class="omega-v2-source"></p></div>';
  }
  function personnelHtml(state, country, quote, outcome, canRecruit) {
    state = state || {};
    var payroll = quote && quote.ok ? money(quote.addedDailyPayrollUsd) : 'Unavailable';
    var cost = quote && quote.ok ? money(quote.upfrontCostUsd) : 'Unavailable';
    var forecast = quote && quote.ok && quote.additionalIncidentsAvoidedPerYear !== null ? fmt(quote.additionalIncidentsAvoidedPerYear) : 'Not recorded';
    var message = outcome ? '<div class="omega-v2-note" role="status">' + esc(outcome) + '</div>' : '';
    var quoteWarning = quote && !quote.ok ? '<div class="omega-v2-note">Recruitment costs are unavailable for this country. Check the selected country and treasury before confirming.</div>' : '';
    return '<div class="omega-v2-home-personnel">' + message + '<h2 class="omega-v2-section-title">Current personnel</h2>' +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Police officers</span><strong>' + fmt(state.policeCount) + '</strong></div><div class="omega-v2-kpi"><span>Special agents</span><strong>' + fmt(state.specialAgents) + '</strong></div><div class="omega-v2-kpi"><span>Recruitment fee per officer</span><strong>' + money(state.recruitmentFeePerOfficerUsd) + '</strong></div><div class="omega-v2-kpi"><span>Daily salary per officer</span><strong>' + money(state.dailySalaryPerOfficerUsd) + '</strong></div></div>' +
      '<article class="omega-v2-card"><h2 class="omega-v2-title">Recruit Police</h2><p class="omega-v2-card-meta">Recruit officers, then train and assign them before deployment. Upfront costs and daily payroll are shown before confirmation.</p>' +
      '<label class="omega-v2-field-label" for="omega-v2-police-recruit-quantity">Number of officers</label><input class="omega-v2-number-input" id="omega-v2-police-recruit-quantity" type="number" min="1" max="100000" step="1" value="1" inputmode="numeric" data-omega-v2-recruit-quantity>' +
      '<div class="omega-v2-vehicle-stats"><div><span>Upfront cost estimate</span><strong data-omega-v2-recruit-cost>' + cost + '</strong></div><div><span>Added daily payroll estimate</span><strong data-omega-v2-recruit-payroll>' + payroll + '</strong></div><div><span>Projected annual incidents avoided</span><strong data-omega-v2-recruit-forecast>' + forecast + '</strong></div></div>' +
      quoteWarning + '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-action="recruit-police"' + (canRecruit ? '' : ' disabled title="Canonical police recruitment API is unavailable."') + '>Confirm recruitment</button></div>' +
      '<p class="omega-v2-source">New officers must complete training and be available before deployment.</p></article></div>';
  }
  function patrolsHtml(state, options) {
    var plan = state && state.patrolPlan && typeof state.patrolPlan === 'object' ? state.patrolPlan : null;
    var entries = plan ? Object.keys(plan).map(function (key) { return '<div class="omega-v2-material-row"><span>' + esc(key.replace(/[_-]+/g, ' ')) + '</span><strong>' + fmt(plan[key]) + '%</strong></div>'; }).join('') : '';
    return '<article class="omega-v2-card"><h2 class="omega-v2-section-title">Recorded patrol plan</h2>' +
      (entries ? '<div class="omega-v2-materials">' + entries + '</div>' : '<div class="omega-v2-empty">No authoritative patrol allocation was returned for this country.</div>') +
      '<p class="omega-v2-note">Patrol assignments require available vehicles, eligible staff and a valid mission.</p>' +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-home-tab="personnel">Review police personnel</button></div></article>';
  }
  function facilitiesHtml(state) {
    var facilities = state && state.facilityLevels && typeof state.facilityLevels === 'object' ? state.facilityLevels : null;
    var rows = facilities ? Object.keys(facilities).map(function (key) { return '<div class="omega-v2-kpi"><span>' + esc(key.replace(/[_-]+/g, ' ')) + '</span><strong>' + fmt(facilities[key]) + '</strong></div>'; }).join('') : '';
    return '<h2 class="omega-v2-section-title">Facilities & Equipment</h2>' +
      (rows ? '<div class="omega-v2-kpis">' + rows + '</div>' : '<div class="omega-v2-empty">Facility-level data is unavailable for this country. No default facility count is displayed.</div>') +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Training quality level</span><strong>' + fmt(state && state.trainingQualityLevel) + '</strong></div><div class="omega-v2-kpi"><span>Recruitment level</span><strong>' + fmt(state && state.policeRecruitmentLevel) + '</strong></div></div>';
  }
  function incidentsHtml(state) {
    var rows = state && Array.isArray(state.incidentLedger) ? state.incidentLedger.slice().reverse().slice(0, 30) : [];
    return '<h2 class="omega-v2-section-title">Recorded incidents</h2>' +
      (rows.length ? '<div class="omega-v2-grid">' + rows.map(function (item) {
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(String(item.type || 'Incident').replace(/[_-]+/g, ' ')) + '</h3><span class="omega-v2-status">' + esc(displayStatus(item.status || 'NOT_RECORDED')) + '</span></div><div class="omega-v2-card-meta">Turn ' + fmt(item.simulationTurn) + ' · Week ' + fmt(item.simulationWeek) + '</div>' +
          '<div class="omega-v2-card-meta">Detection: ' + (item.detected === true ? 'Detected' : item.detected === false ? 'Not detected' : 'Not recorded') + '</div>' +
          (item.targetAssetName ? '<div class="omega-v2-card-meta">Target asset: ' + esc(item.targetAssetName) + '</div>' : '') +
          (item.assetImpact && item.assetImpact.assetId ? '<div class="omega-v2-card-meta">Recorded impact: ' + esc(item.assetImpact.assetId) + ' · ' + esc(item.assetImpact.condition || 'condition not recorded') + '</div>' : '') +
          '</article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No security incident history is recorded for this country yet.</div>');
  }
  function legalRowsFromSource(source, sourceName) {
    var rows = [], seen = Object.create(null);
    function push(item, lawName, sectionName) {
      if (!item || typeof item !== 'object') return;
      var law = item.actName || item.lawName || item.law || item.act || lawName || item.name || item.title || 'Law not named';
      var parts = Array.isArray(item.sections) ? item.sections : Array.isArray(item.articles) ? item.articles : Array.isArray(item.provisions) ? item.provisions : null;
      if (parts && parts.length) { parts.forEach(function (section) { push(section, law, section.number || section.section || section.article || null); }); return; }
      var section = item.sectionNumber || item.articleNumber || item.section || item.article || item.number || sectionName || 'General';
      var title = item.title || item.heading || item.provisionTitle || item.name || (section !== 'General' ? 'Section ' + section : law);
      var body = item.text || item.description || item.summary || item.provision || item.content || item.body || '';
      if (!body && !item.title && !item.name && !item.heading && !item.provisionTitle && section === 'General') return;
      var key = String(law) + '|' + String(section) + '|' + String(title);
      if (seen[key]) return;
      seen[key] = true;
      rows.push({ law:String(law), section:String(section), title:String(title), body:String(body || 'Full provision text not recorded'), status:String(item.status || item.state || 'NOT_RECORDED'), source:String(item.source || item.sourceId || item.authority || sourceName) });
    }
    if (Array.isArray(source)) source.forEach(function (item) { push(item, null, null); });
    else if (source && typeof source === 'object') Object.keys(source).forEach(function (key) {
      var item = source[key];
      if (item && typeof item === 'object') push(Object.assign({ lawName:key }, item), key, null);
      else if (typeof item === 'string') push({ lawName:key, title:key, text:item }, key, null);
    });
    return rows;
  }
  function lawsHtml(state, country) {
    var gameState = g.Game && g.Game.state || {};
    var key = String(country || '').toUpperCase();
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    var domain = null;
    try { domain = gateway && typeof gateway.getDomainRecord === 'function' ? gateway.getDomainRecord(country, 'interior') : null; } catch (_) {}
    var sources = [
      [state && state.laws, 'Home Ministry state'], [state && state.legislation, 'Home Ministry legislation'],
      [state && state.legalCode, 'Home Ministry legal code'], [state && state.lawRegistry, 'Home Ministry law registry'],
      [state && state.legalArticles, 'Home Ministry legal articles'], [state && state.homeAffairsLaws, 'Home Affairs law registry'], [state && state.articles, 'Home Ministry articles'], [state && state.acts, 'Home Ministry acts'], [state && state.regulations, 'Home Ministry regulations'],
      [gameState.laws && (gameState.laws[key] || gameState.laws[country]), 'Game law registry'],
      [domain && domain.record && (domain.record.laws || domain.record.homeAffairsLaws || domain.record.legislation || domain.record.legalCode || domain.record.lawRegistry || domain.record.legalArticles || domain.record.articles || domain.record.acts || domain.record.regulations), 'Country Data Gateway · interior']
    ];
    var rows = [];
    sources.forEach(function (entry) {
      var source = entry[0];
      if (!source || typeof source !== 'object') return;
      var legal = source.laws || source.homeAffairsLaws || source.legislation || source.legalCode || source.lawRegistry || source.legalArticles || source.articles || source.acts || source.regulations || source;
      rows = rows.concat(legalRowsFromSource(legal, entry[1]));
    });
    var unique = Object.create(null);
    rows = rows.filter(function (row) { var id = row.law + '|' + row.section + '|' + row.title; if (unique[id]) return false; unique[id] = true; return true; });
    var body = rows.map(function (row) { return '<tr><td>' + esc(row.law) + '</td><td>' + esc(row.section) + '</td><td><strong>' + esc(row.title) + '</strong><p>' + esc(row.body) + '</p></td><td>' + esc(row.status) + '</td><td>' + esc(row.source) + '</td></tr>'; }).join('');
    return '<section class="omega-v2-home-laws"><h2 class="omega-v2-section-title">Home Affairs · Law &amp; Sections</h2><p class="omega-v2-card-meta">Browse the laws and sections recorded for the selected country.</p>' +
      (rows.length ? '<div class="omega-v2-table-wrap omega-v2-laws-table-wrap"><table><thead><tr><th scope="col">Law / Act</th><th scope="col">Section / Article</th><th scope="col">Title &amp; provision</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<div class="omega-v2-empty" role="status">No laws or sections are recorded for ' + esc(country || 'the selected country') + ' yet.</div>') +
      '</section>';
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'HOME_AFFAIRS_ROOT_REQUIRED' };
    var country = countryId(options);
    var e = engine();
    var state = engineState(country);
    var fleet = fleetSnapshot(country);
    var active = options.tab || root.__omegaV2HomeTab || 'dashboard';
    var quoteQuantity = 1;
    var quote = estimateRecruitment(quoteQuantity, country);
    var canRecruit = !!(e && typeof e.recruitPolice === 'function' && country);
    var content;
    if (active === 'personnel') content = personnelHtml(state, country, quote, root.__omegaV2RecruitOutcome || '', canRecruit);
    else if (active === 'fleet') content = '<div data-omega-v2-home-fleet-root></div>';
    else if (active === 'patrols') content = patrolsHtml(state, options);
    else if (active === 'facilities') content = facilitiesHtml(state);
    else if (active === 'incidents') content = incidentsHtml(state);
    else if (active === 'laws') content = lawsHtml(state, country);
    else content = dashboardHtml(state, fleet, country);

    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-home-affairs">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">CIVIL ADMINISTRATION · HOME AFFAIRS</div><h1 class="omega-v2-title">Public Safety & Police</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · staff, fleet, patrols and incident records</p></div><span class="omega-v2-status" data-state="' + (e ? 'operational' : 'unknown') + '">' + (e ? 'POLICE RECORDS AVAILABLE' : 'POLICE RECORDS UNAVAILABLE') + '</span></header>' +
      tabBar(active) + '<div data-omega-v2-home-content>' + content + '</div>' +
      '</section>';

    if (!root.__omegaV2HomeBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-omega-v2-home-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaV2HomeTab = tab.getAttribute('data-omega-v2-home-tab');
          render(root, Object.assign({}, root.__omegaV2HomeOptions || {}, { tab:root.__omegaV2HomeTab }));
          return;
        }
        var action = target.closest('[data-omega-v2-action]');
        if (!action || !root.contains(action) || action.disabled) return;
        var actionId = action.getAttribute('data-omega-v2-action');
        var currentOptions = root.__omegaV2HomeOptions || {};
        if (actionId === 'recruit-police') {
          var input = root.querySelector('[data-omega-v2-recruit-quantity]');
          var amount = Math.floor(num(input && input.value) || 0);
          var estimate = estimateRecruitment(amount, countryId(currentOptions));
          if (!estimate.ok) {
            root.__omegaV2RecruitOutcome = 'Recruitment blocked: ' + (estimate.code || estimate.reason || 'QUOTE_UNAVAILABLE') + '. No recruitment was committed.';
            render(root, Object.assign({}, currentOptions, { tab:'personnel' }));
            return;
          }
          var engineNow = engine();
          var result;
          try { result = engineNow.recruitPolice(amount, countryId(currentOptions)); }
          catch (error) { result = { ok:false, code:'RECRUITMENT_RUNTIME_EXCEPTION', message:String(error && error.message || error) }; }
          if (result && result.ok) root.__omegaV2RecruitOutcome = 'Recruitment confirmed: ' + fmt(amount) + ' officer(s). Cost: ' + money(result.upfrontCostUsd !== undefined ? result.upfrontCostUsd : result.costUsd !== undefined ? result.costUsd : result.cost) + '.';
          else root.__omegaV2RecruitOutcome = 'Recruitment was not completed. Review the selected country, available funds and recruitment requirements.';
          render(root, Object.assign({}, currentOptions, { tab:'personnel' }));
        }
      });
      root.addEventListener('input', function (event) {
        var target = event && event.target;
        if (!target || !target.matches || !target.matches('[data-omega-v2-recruit-quantity]')) return;
        var amount = Math.floor(num(target.value) || 0);
        var quote = estimateRecruitment(amount, countryId(root.__omegaV2HomeOptions || {}));
        var cost = root.querySelector('[data-omega-v2-recruit-cost]');
        var payroll = root.querySelector('[data-omega-v2-recruit-payroll]');
        var forecast = root.querySelector('[data-omega-v2-recruit-forecast]');
        if (cost) cost.textContent = quote.ok ? money(quote.upfrontCostUsd) : 'Unavailable';
        if (payroll) payroll.textContent = quote.ok ? money(quote.addedDailyPayrollUsd) : 'Unavailable';
        if (forecast) forecast.textContent = quote.ok && quote.additionalIncidentsAvoidedPerYear !== null ? fmt(quote.additionalIncidentsAvoidedPerYear) : 'Not recorded';
      });
      root.__omegaV2HomeBound = true;
    }
    root.__omegaV2HomeOptions = options;
    root.__omegaV2HomeTab = active;
    if (active === 'fleet') {
      var fleetRoot = root.querySelector('[data-omega-v2-home-fleet-root]');
      if (fleetRoot && g.OmegaUIV2PoliceFleet && typeof g.OmegaUIV2PoliceFleet.render === 'function') {
        g.OmegaUIV2PoliceFleet.render(fleetRoot, { countryId:country });
      }
    }
    return { ok:true, tab:active, countryId:country || null, runtimeAvailable:!!e, stateAvailable:!!state };
  }

  g.OmegaUIV2HomeAffairs = Object.freeze({ version:'1.0.0', tabs:TABS, render:render });
  function getPhoto(id, alt) { return getPhotoImpl(id, alt); }
  function getPhotoImpl(id, alt) {
    var lib = g.OmegaUIPhotoAssets;
    var item = lib && typeof lib.get === 'function' ? lib.get(id) : null;
    if (!item || !/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path || ''))) return '';
    return '<figure class="omega-v2-photo"><img src="' + esc(item.path) + '" loading="lazy" decoding="async" alt="' + esc(alt || item.caption || 'Reference photo') + '"><figcaption>' + esc(item.caption || 'Reference image') + '<small>Reference image, not evidence of current operations</small></figcaption></figure>';
  }
})(typeof window !== 'undefined' ? window : globalThis);
