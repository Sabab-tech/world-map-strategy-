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
  function countryBaselineReady(state) {
    return !!(state && Number(state.baselineVersion) >= 1 && state.baselineSource);
  }
  function countryIso3(value) {
    const resolvers=[g.OmegaCountryRuntimeData,g.OmegaCountryDataGateway,g.OmegaCanonicalIdentityRegistry,g.OmegaCountrySemanticBridge,g.Omega&&g.Omega.CanonicalIdentity];
    for (var i=0;i<resolvers.length;i++) {
      var resolver=resolvers[i];
      if (!resolver || typeof resolver.resolveCountry!=='function') continue;
      try {
        var row=resolver.resolveCountry(value);
        var id=row&&(row.iso3||row.iso3Code||row.countryIso3||row.alpha3||row.cca3||row.countryCode||row.id);
        if (id) return String(id).trim().toUpperCase();
      } catch (_) {}
    }
    return String(value||'').trim().toUpperCase();
  }
  function stateSummary(state, fleet) {
    state = state || {};
    var ready=countryBaselineReady(state);
    var vehicles = ready && state.vehiclesOwned && typeof state.vehiclesOwned === 'object' ? state.vehiclesOwned : null;
    var owned = vehicles ? Object.keys(vehicles).reduce(function (sum, key) { var value = num(vehicles[key]); return sum + (value === null ? 0 : Math.max(0, value)); }, 0) : null;
    var incidents = ready && Array.isArray(state.incidentLedger) ? state.incidentLedger : null;
    return [
      { label:'Police personnel', value:ready?fmt(state.policeCount):'Not recorded', source:ready?'Country Home Ministry state':'Country baseline loading status' },
      { label:'Operational efficiency', value:ready?String(Math.round(Number(state.policeEfficiency)||0))+'%':'Not recorded', source:ready?(state.openingConditionModel||'Country Home Ministry simulation state'):'Country baseline loading status' },
      { label:'Public trust', value:ready?String(Math.round(Number(state.policeTrust)||0))+'%':'Not recorded', source:ready?(state.openingConditionModel||'Country Home Ministry simulation state'):'Country baseline loading status' },
      { label:'Owned vehicle units', value:!ready?'Not recorded':(owned === null ? (fleet && num(fleet.ownedUnits) !== null ? fmt(fleet.ownedUnits) : 'Not recorded') : fmt(owned)), source:'Country fleet state' },
      { label:'Recorded incidents', value:ready&&incidents ? fmt(incidents.length) : 'Not recorded', source:'Country incident ledger' },
      { label:'Highest unlocked vehicle tier', value:ready?fmt(state.unlockedVehicleLevel):'Not recorded', source:'Country vehicle unlock state' }
    ];
  }
  function tabBar(active) {
    return '<div class="omega-v2-filterbar omega-v2-home-tabs" role="group" aria-label="Home Affairs sections">' + TABS.map(function (tab) {
      return '<button type="button" class="omega-v2-button ' + (tab.id === active ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-home-tab="' + tab.id + '" aria-pressed="' + (tab.id === active ? 'true' : 'false') + '">' + esc(tab.label) + '</button>';
    }).join('') + '</div>';
  }
  function dashboardHtml(state, fleet, country) {
    var summary = stateSummary(state, fleet);
    var baselineNotice=countryBaselineReady(state)?'':'<div class="omega-v2-note" role="status">Country-specific Home Ministry baseline is still loading or unavailable. Default placeholder numbers are withheld.</div>';
    return '<div class="omega-v2-home-dashboard">' + baselineNotice +
      (countryIso3(country)==='BGD' ? getPhoto('bangladesh-police-headquarters', 'Bangladesh police headquarters reference photo') : '') +
      '<div class="omega-v2-kpis">' + summary.map(function (item) { return '<div class="omega-v2-kpi"><span>' + esc(item.label) + '</span><strong>' + esc(item.value) + '</strong><small>' + esc(item.source) + '</small></div>'; }).join('') + '</div>' +
      '<h2 class="omega-v2-section-title">Operational sections</h2><div class="omega-v2-grid">' +
      [
        ['personnel','Personnel','Staff count, recruiting and training.'],
        ['fleet','Fleet','All 15 canonical vehicle tiers and country-owned inventory.'],
        ['patrols','Patrols & Deployment','Recorded patrol plan and supported deployment routing.'],
        ['facilities','Facilities & Equipment','Recorded station, academy and equipment levels.'],
        ['incidents','Incidents & Reports','Recorded security incidents and response status.']
      ].map(function (item) { return '<button type="button" class="omega-v2-card omega-v2-home-link" data-omega-v2-home-tab="' + item[0] + '"><span class="omega-v2-card-title">' + esc(item[1]) + '</span><span class="omega-v2-card-meta">' + esc(item[2]) + '</span></button>'; }).join('') +
      '</div><p class="omega-v2-source">Country context: ' + esc(country || 'Not recorded') + '. Values come from HomeMinistry state and the existing fleet snapshot.</p></div>';
  }
  function personnelHtml(state, country, quote, outcome, canRecruit) {
    state = state || {};
    var ready=countryBaselineReady(state);
    var payroll = ready && quote && quote.ok ? money(quote.addedDailyPayrollUsd) : 'Unavailable';
    var cost = ready && quote && quote.ok ? money(quote.upfrontCostUsd) : 'Unavailable';
    var forecast = ready && quote && quote.ok && quote.additionalIncidentsAvoidedPerYear !== null ? fmt(quote.additionalIncidentsAvoidedPerYear) : 'Not recorded';
    var message = outcome ? '<div class="omega-v2-note" role="status">' + esc(outcome) + '</div>' : '';
    var quoteWarning = !ready ? '<div class="omega-v2-note" role="status">Country-specific Home Ministry data is not ready. Recruitment is disabled until the country baseline loads.</div>' : (quote && !quote.ok ? '<div class="omega-v2-note">Recruitment estimate is blocked or unavailable (' + esc(quote.code || quote.reason || 'NO_QUOTE') + '). The official recruitment runtime will validate the action; no costs are guessed.</div>' : '');
    return '<div class="omega-v2-home-personnel">' + message + '<h2 class="omega-v2-section-title">Current personnel</h2>' +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Police officers</span><strong>' + (ready?fmt(state.policeCount):'Not recorded') + '</strong></div><div class="omega-v2-kpi"><span>Operational efficiency</span><strong>' + (ready?String(Math.round(Number(state.policeEfficiency)||0))+'%':'Not recorded') + '</strong></div><div class="omega-v2-kpi"><span>Public trust</span><strong>' + (ready?String(Math.round(Number(state.policeTrust)||0))+'%':'Not recorded') + '</strong></div><div class="omega-v2-kpi"><span>Special agents</span><strong>' + (ready?fmt(state.specialAgents):'Not recorded') + '</strong></div><div class="omega-v2-kpi"><span>Recruitment fee per officer</span><strong>' + (ready?money(state.recruitmentFeePerOfficerUsd):'Not recorded') + '</strong></div><div class="omega-v2-kpi"><span>Daily salary per officer</span><strong>' + (ready?money(state.dailySalaryPerOfficerUsd):'Not recorded') + '</strong></div></div>' +
      '<article class="omega-v2-card"><h2 class="omega-v2-title">Recruit Police</h2><p class="omega-v2-card-meta">Recruitment is executed through the existing Home Ministry engine. Recruitment costs, payroll, country rules and treasury checks remain authoritative.</p>' +
      '<label class="omega-v2-field-label" for="omega-v2-police-recruit-quantity">Number of officers</label><input class="omega-v2-number-input" id="omega-v2-police-recruit-quantity" type="number" min="1" max="100000" step="1" value="1" inputmode="numeric" data-omega-v2-recruit-quantity>' +
      '<div class="omega-v2-vehicle-stats"><div><span>Upfront cost estimate</span><strong data-omega-v2-recruit-cost>' + cost + '</strong></div><div><span>Added daily payroll estimate</span><strong data-omega-v2-recruit-payroll>' + payroll + '</strong></div><div><span>Projected annual incidents avoided</span><strong data-omega-v2-recruit-forecast>' + forecast + '</strong></div></div>' +
      quoteWarning + '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-action="recruit-police"' + (canRecruit ? '' : ' disabled title="Canonical police recruitment API is unavailable."') + '>Confirm recruitment</button></div>' +
      '<p class="omega-v2-source">A successful result is shown only after the authoritative engine returns an accepted mutation. After recruitment, staff still need valid training/availability before deployment.</p></article></div>';
  }
  function patrolsHtml(state, options) {
    if (!countryBaselineReady(state)) return '<h2 class="omega-v2-section-title">Recorded patrol plan</h2><div class="omega-v2-empty" role="status">Country-specific patrol data has not loaded. Generic patrol defaults are not displayed.</div>';
    var plan = state && state.patrolPlan && typeof state.patrolPlan === 'object' ? state.patrolPlan : null;
    var entries = plan ? Object.keys(plan).map(function (key) { return '<div class="omega-v2-material-row"><span>' + esc(key.replace(/[_-]+/g, ' ')) + '</span><strong>' + fmt(plan[key]) + '%</strong></div>'; }).join('') : '';
    return '<article class="omega-v2-card"><h2 class="omega-v2-section-title">Recorded patrol plan</h2>' +
      (entries ? '<div class="omega-v2-materials">' + entries + '</div>' : '<div class="omega-v2-empty">No authoritative patrol allocation was returned for this country.</div>') +
      '<p class="omega-v2-note">Assignment is only accepted when the real runtime confirms an owned/available vehicle, eligible personnel, country scope and mission requirements. This summary does not invent routes or active units.</p>' +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-home-tab="personnel">Review police personnel</button></div></article>';
  }
  function facilitiesHtml(state) {
    if (!countryBaselineReady(state)) return '<h2 class="omega-v2-section-title">Facilities &amp; Equipment</h2><div class="omega-v2-empty" role="status">Country-specific facility data has not loaded. Generic facility levels are not displayed.</div>';
    var facilities = state && state.facilityLevels && typeof state.facilityLevels === 'object' ? state.facilityLevels : null;
    var rows = facilities ? Object.keys(facilities).map(function (key) { return '<div class="omega-v2-kpi"><span>' + esc(key.replace(/[_-]+/g, ' ')) + '</span><strong>' + fmt(facilities[key]) + '</strong></div>'; }).join('') : '';
    return '<h2 class="omega-v2-section-title">Facilities & Equipment</h2>' +
      (rows ? '<div class="omega-v2-kpis">' + rows + '</div>' : '<div class="omega-v2-empty">Facility-level data is unavailable for this country. No default facility count is displayed.</div>') +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Training quality level</span><strong>' + fmt(state && state.trainingQualityLevel) + '</strong></div><div class="omega-v2-kpi"><span>Recruitment level</span><strong>' + fmt(state && state.policeRecruitmentLevel) + '</strong></div></div>';
  }
  function incidentsHtml(state) {
    if (!countryBaselineReady(state)) return '<h2 class="omega-v2-section-title">Recorded incidents</h2><div class="omega-v2-empty" role="status">Country incident state is not ready; no generic values are shown.</div>';
    var rows = state && Array.isArray(state.incidentLedger) ? state.incidentLedger.slice().reverse().slice(0, 30) : [];
    return '<h2 class="omega-v2-section-title">Recorded incidents</h2>' +
      (rows.length ? '<div class="omega-v2-grid">' + rows.map(function (item) {
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(String(item.type || 'Incident').replace(/[_-]+/g, ' ')) + '</h3><span class="omega-v2-status">' + esc(item.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-card-meta">Turn ' + fmt(item.simulationTurn) + ' · Week ' + fmt(item.simulationWeek) + '</div>' +
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
    return '<section class="omega-v2-home-laws"><h2 class="omega-v2-section-title">Home Affairs · Law &amp; Sections</h2><p class="omega-v2-card-meta">Legal records are read from the selected country and existing Home Affairs / country-data sources. Only registered law titles, sections and text are displayed.</p>' +
      (rows.length ? '<div class="omega-v2-table-wrap omega-v2-laws-table-wrap"><table><thead><tr><th scope="col">Law / Act</th><th scope="col">Section / Article</th><th scope="col">Title &amp; provision</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<div class="omega-v2-empty" role="status">No Home Affairs laws or section text are registered for ' + esc(country || 'the selected country') + '. The legal register is empty or unavailable; no act, article or punishment has been invented.</div>') +
      '<p class="omega-v2-source">Authoritative legal display requires jurisdiction, current version and a registered source. This view never substitutes fictional provisions for missing legal records.</p></section>';
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
    var baselineReady=countryBaselineReady(state);
    var quote = baselineReady ? estimateRecruitment(quoteQuantity, country) : { ok:false, code:'COUNTRY_BASELINE_NOT_READY' };
    var canRecruit = !!(e && typeof e.recruitPolice === 'function' && country && baselineReady);
    var content;
    if (active === 'personnel') content = personnelHtml(state, country, quote, root.__omegaV2RecruitOutcome || '', canRecruit);
    else if (active === 'fleet') content = baselineReady ? '<div data-omega-v2-home-fleet-root></div>' : '<div class="omega-v2-empty" role="status">Country-specific fleet baseline is loading or unavailable. No shared fleet data is displayed.</div>';
    else if (active === 'patrols') content = patrolsHtml(state, options);
    else if (active === 'facilities') content = facilitiesHtml(state);
    else if (active === 'incidents') content = incidentsHtml(state);
    else if (active === 'laws') content = lawsHtml(state, country);
    else content = dashboardHtml(state, fleet, country);

    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-home-affairs">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">CIVIL ADMINISTRATION · HOME AFFAIRS</div><h1 class="omega-v2-title">Public Safety & Police</h1><p class="omega-v2-subtitle">Country ' + esc(country || 'Not recorded') + ' · canonical personnel, fleet and incident state</p></div><span class="omega-v2-status" data-state="' + (baselineReady ? 'operational' : 'unknown') + '">' + (!e ? 'POLICE RUNTIME UNAVAILABLE' : baselineReady ? 'COUNTRY BASELINE READY' : 'COUNTRY BASELINE LOADING') + '</span></header>' +
      tabBar(active) + '<div data-omega-v2-home-content>' + content + '</div>' +
      '<p class="omega-v2-source">Police personnel, fleet and patrol records are managed within this UI v2 screen. The retired console is disconnected.</p></section>';

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
          if (result && result.ok) root.__omegaV2RecruitOutcome = 'Recruitment accepted by the canonical runtime for ' + fmt(amount) + ' officer(s). Recorded cost: ' + money(result.upfrontCostUsd !== undefined ? result.upfrontCostUsd : result.costUsd !== undefined ? result.costUsd : result.cost) + '.';
          else root.__omegaV2RecruitOutcome = 'Recruitment not executed: ' + String(result && (result.message || result.code || result.reason) || 'RUNTIME_REJECTED') + '.';
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
