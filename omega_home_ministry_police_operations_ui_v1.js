/* OMEGA HOME MINISTRY POLICE OPERATIONS UI v1.0.0
 * All actions call the country-scoped Home Ministry runtime; no presentation-only counters.
 */
(function (g) {
  'use strict';
  if (g.OmegaHomePoliceOperationsUI && g.OmegaHomePoliceOperationsUI.VERSION === '1.0.0') return;
  var VERSION = '1.0.0', activeTab = 'overview', statusText = '', statusType = '';
  var ui = g.OMEGA_UI_ADAPTER;
  var CATEGORIES = [
    ['theft','Theft'],['robbery','Robbery'],['streetRobbery','Street robbery'],
    ['drugTrafficking','Drug trafficking'],['contrabandSmuggling','Contraband / smuggling'],
    ['assault','Assault'],['cybercrime','Cybercrime'],['homicide','Homicide']
  ];
  function engine() { return g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry) || null; }
  function finance() { return g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry) || null; }
  function country() { var e = engine(); try { return e && e.getCurrentCountryId ? e.getCurrentCountryId() : (g.CountryIOS && g.CountryIOS.activeCountry) || 'USA'; } catch (_) { return 'USA'; } }
  function host() {
    if (!g.document) return null;
    return g.document.getElementById('home-ministry-command-root') || g.document.getElementById('cabinet-body') || g.document.getElementById('ministry-content');
  }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function number(v, d) { var n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); }
  function money(v) { var n = Number(v); return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : 'Unavailable'; }
  function percent(v, digits) { return Number.isFinite(Number(v)) ? Number(v).toFixed(digits === undefined ? 1 : digits) + '%' : 'N/A'; }
  function formatCount(v) { return Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : 'N/A'; }
  function getData() {
    var e = engine();
    if (!e || typeof e.getState !== 'function') return { ready: false, reason: 'HOME_MINISTRY_RUNTIME_UNAVAILABLE' };
    var cid = country(), s;
    try { s = e.getState(cid); } catch (error) { return { ready: false, reason: String(error && error.message || error) }; }
    var baseline = typeof e.getCountryPoliceBaseline === 'function' ? e.getCountryPoliceBaseline(cid) : null;
    var crime = typeof e.getCrimeSnapshot === 'function' ? e.getCrimeSnapshot(cid) : { available: false, reason: 'CRIME_RUNTIME_UNAVAILABLE' };
    var budget = typeof e.getHomeBudgetSnapshot === 'function' ? e.getHomeBudgetSnapshot(cid) : { available: false, reason: 'HOME_BUDGET_API_UNAVAILABLE' };
    var dailyCost = typeof e.getDailyOperatingCost === 'function' ? e.getDailyOperatingCost(cid) : null;
    return { ready: true, engine: e, countryId: cid, state: s, baseline: baseline, crime: crime, budget: budget, dailyCost: dailyCost };
  }
  function setStatus(message, type) { statusText = String(message || ''); statusType = type || ''; }
  function statusHtml() {
    return statusText ? '<div class="ohpu-status ' + (statusType === 'error' ? 'is-error' : statusType === 'ok' ? 'is-ok' : '') + '" role="status">' + esc(statusText) + '</div>' : '';
  }
  function ensureStyle() {
    if (!g.document || g.document.getElementById('ohpu-style-v1')) return;
    var style = g.document.createElement('style');
    style.id = 'ohpu-style-v1';
    style.textContent =
      '.ohpu{box-sizing:border-box;color:#ecf5ff;background:radial-gradient(ellipse at 50% 0%,rgba(23,63,97,.7),transparent 45%),linear-gradient(150deg,#071421,#050b13 70%);border:1px solid rgba(218,177,75,.48);border-radius:16px;padding:clamp(12px,2.5vw,24px);margin:12px auto 34px;max-width:1040px;font-family:Inter,system-ui,sans-serif;box-shadow:0 16px 42px rgba(0,0,0,.34);overflow:visible}' +
      '.ohpu-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:5px 0 15px;border-bottom:1px solid rgba(154,189,215,.16)}' +
      '.ohpu-title{margin:0;color:#f3d27b;font-size:clamp(17px,3vw,24px);font-weight:900;letter-spacing:.055em}.ohpu-sub{font-size:11px;line-height:1.55;color:#a7bed1;margin-top:5px;max-width:760px}' +
      '.ohpu-tag{display:inline-flex;align-items:center;border:1px solid rgba(117,185,218,.3);background:rgba(37,137,177,.1);border-radius:5px;padding:5px 7px;color:#b5eafa;font-size:9px;font-weight:800;letter-spacing:.05em}' +
      '.ohpu-tabs{display:flex;gap:7px;overflow-x:auto;padding:12px 0}.ohpu-tab{white-space:nowrap;border:1px solid #304d62;border-radius:7px;padding:9px 10px;background:#0d1b29;color:#b9cede;font-size:10px;font-weight:900;letter-spacing:.045em;touch-action:manipulation}.ohpu-tab.is-active{background:linear-gradient(135deg,#735623,#272117);color:#ffe7a2;border-color:#d7b664}' +
      '.ohpu-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.ohpu-card{box-sizing:border-box;min-width:0;padding:12px;border:1px solid rgba(115,163,195,.22);border-radius:10px;background:linear-gradient(145deg,rgba(20,43,63,.96),rgba(6,15,25,.98))}.ohpu-card h3{font-size:12px;line-height:1.4;margin:6px 0;color:#edf5fe}.ohpu-card p{font-size:11px;line-height:1.55;color:#9fb6c9;margin:7px 0}.ohpu-label{display:block;color:#e8c777;font-size:9px;letter-spacing:.09em;font-weight:900;text-transform:uppercase;margin-bottom:6px}.ohpu-value{color:#f7f9fd;font-weight:900;font-size:clamp(16px,2vw,21px);overflow-wrap:anywhere}.ohpu-small{font-size:10px;line-height:1.55;color:#9eb4c8}.ohpu-muted{font-size:11px;line-height:1.6;color:#9fb4c7;margin:9px 0}.ohpu-section{margin:12px 0 16px}.ohpu-section-title{font-size:12px;color:#f1d17a;letter-spacing:.08em;font-weight:900;margin:16px 0 10px}' +
      '.ohpu-btn{min-height:39px;border:1px solid #3f6279;border-radius:8px;background:linear-gradient(140deg,#233f53,#0d1a27);color:#eef7fd;padding:9px 12px;font-size:10px;font-weight:900;letter-spacing:.035em;touch-action:manipulation}.ohpu-btn-main{background:linear-gradient(135deg,#80612d,#302518);border-color:#dfbd69;color:#ffe9af}.ohpu-btn-green{border-color:#36785f;background:linear-gradient(135deg,#194b43,#0b1d20)}.ohpu-btn:disabled{opacity:.4;cursor:not-allowed}.ohpu-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.ohpu-actions .ohpu-btn{flex:1 1 150px}' +
      '.ohpu-field{box-sizing:border-box;width:100%;min-width:0;min-height:38px;background:#06111d;color:#f1f7fc;border:1px solid #3b5a71;border-radius:7px;padding:8px 9px;font-size:12px;margin:3px 0 9px}.ohpu-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ohpu-note{margin:8px 0;border:1px solid rgba(120,164,193,.24);border-radius:8px;padding:10px;background:rgba(0,0,0,.16);font-size:11px;line-height:1.6;color:#b4c9db}.ohpu-note.is-error,.ohpu-status.is-error{border-color:#a54d4a;color:#ffd2cd}.ohpu-note.is-ok,.ohpu-status.is-ok{border-color:#3a8a66;color:#c6f4d9}.ohpu-status{margin:9px 0;border:1px solid #36566c;border-radius:8px;padding:10px;background:rgba(0,0,0,.16);font-size:11px;line-height:1.55;color:#c1d5e3}' +
      '.ohpu-table-wrap{overflow-x:auto;border:1px solid rgba(118,164,195,.2);border-radius:8px}.ohpu-table{width:100%;border-collapse:collapse;font-size:11px}.ohpu-table th,.ohpu-table td{padding:8px 7px;border-bottom:1px solid rgba(148,181,204,.15);text-align:left;vertical-align:top}.ohpu-table th{font-size:9px;letter-spacing:.07em;color:#e5c674;text-transform:uppercase;background:rgba(0,0,0,.16)}.ohpu-table tr:last-child td{border-bottom:0}.ohpu-mono{font-variant-numeric:tabular-nums}.ohpu-car-art{display:block;width:100%;height:76px;object-fit:contain;margin:0 auto 7px;filter:drop-shadow(0 5px 6px rgba(0,0,0,.35))}.ohpu-fleet-card{display:flex;flex-direction:column;gap:4px}.ohpu-fleet-card .ohpu-actions{margin-top:auto}.ohpu-rule-card{display:flex;flex-direction:column;gap:5px}.ohpu-rule-card .ohpu-actions{margin-top:auto}.ohpu-effects{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.ohpu-effect{padding:4px 6px;border:1px solid rgba(108,183,151,.28);border-radius:5px;background:rgba(26,116,79,.13);color:#b6f0d7;font-size:9px;font-weight:800}.ohpu-risk{border-color:rgba(223,171,86,.35);background:rgba(120,77,23,.12);color:#f7d59a}.ohpu-bar{height:7px;border-radius:99px;background:#07101a;overflow:hidden;margin:6px 0}.ohpu-bar span{display:block;height:100%;background:linear-gradient(90deg,#43a9b8,#e7c36b);border-radius:99px}.ohpu-barchart{display:flex;align-items:end;gap:4px;height:105px;padding:8px 2px 0}.ohpu-barcol{flex:1;min-width:4px;display:flex;flex-direction:column;justify-content:end;align-items:stretch;height:100%;text-align:center}.ohpu-barcol span{display:block;min-height:2px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#e5c36a,#34899a)}.ohpu-barcol small{font-size:8px;color:#8fa8bd;margin-top:4px}' +
      '@media(max-width:650px){.ohpu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ohpu{margin:8px auto 28px;padding:11px}.ohpu-card{padding:9px}.ohpu-table{font-size:10px}.ohpu-table th,.ohpu-table td{padding:7px 5px}}@media(max-width:410px){.ohpu-grid{grid-template-columns:1fr}.ohpu-form-grid{grid-template-columns:1fr}.ohpu-tabs .ohpu-tab{padding:8px}.ohpu-card{padding:10px}}';
    (g.document.head || g.document.documentElement).appendChild(style);
  }
  function kpi(label, value, sub) {
    return '<article class="ohpu-card"><span class="ohpu-label">' + esc(label) + '</span><div class="ohpu-value">' + esc(value) + '</div>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</article>';
  }
  function budgetHtml(d) {
    var b = d.budget;
    if (!b || !b.available) {
      return '<div class="ohpu-note is-error"><strong>FINANCE ALLOCATION NOT READY</strong><br>' + esc(b && (b.reason || b.code) || 'HOME_BUDGET_UNAVAILABLE') +
        '. Police hiring, vehicle orders, repairs and paid policies stay blocked until Finance has an available Interior allocation and treasury balance. Opening baseline assets cost nothing.</div>' +
        '<div class="ohpu-actions"><button type="button" class="ohpu-btn ohpu-btn-main" id="ohpu-open-finance">OPEN FINANCE MINISTRY BUDGET</button></div>';
    }
    var rows = ['personnel','vehicles','maintenance','facilities','training','operations'].map(function (id) {
      var row = b.categories && b.categories[id]; if (!row) return '';
      return '<tr><td>' + esc(row.label) + '</td><td class="ohpu-mono">' + esc(money(row.budgetUsd)) + '</td><td class="ohpu-mono">' + esc(money(row.spentUsd)) + '</td><td class="ohpu-mono">' + esc(money(row.remainingUsd)) + '</td></tr>';
    }).join('');
    return '<div class="ohpu-section-title">FINANCE → HOME MINISTRY · LIVE ALLOCATION</div>' +
      '<div class="ohpu-grid">' +
      kpi('Interior annual ceiling',money(b.parentBudgetUsd),'Finance Ministry authorised this sector ceiling.') +
      kpi('Interior remaining',money(b.parentRemainingUsd),'Shared parent ceiling; each purchase checks it.') +
      kpi('National treasury',money(b.treasuryBalanceUsd),'Cash must be available when an action executes.') +
      '</div><div class="ohpu-table-wrap"><table class="ohpu-table"><thead><tr><th>Home budget category</th><th>Ceiling</th><th>Spent</th><th>Remaining</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="ohpu-small">A sub-budget cannot spend beyond its remaining amount, the remaining Interior envelope, or national treasury. The initial scenario fleet is inherited inventory and is not charged a second time.</p>' +
      '<div class="ohpu-actions"><button type="button" class="ohpu-btn" id="ohpu-open-finance">CHANGE FINANCE ALLOCATION</button><button type="button" class="ohpu-btn" id="ohpu-open-budget-control">HOME MINISTRY SUB-BUDGETS</button></div>';
  }
  function bindFinanceButtons(root) {
    var open = root.querySelector('#ohpu-open-finance');
    if (open) open.onclick = function () {
      var f = finance();
      if (!f) { setStatus('Finance runtime is unavailable. No spending was processed.', 'error'); render(); return; }
      try {
        if (typeof f.selectTab === 'function') f.selectTab('budget');
        else if (typeof f.renderDashboard === 'function') f.renderDashboard('finance');
      } catch (error) { setStatus('Could not open Finance: ' + String(error && error.message || error), 'error'); render(); }
    };
    var homeBudget = root.querySelector('#ohpu-open-budget-control');
    if (homeBudget) homeBudget.onclick = function () {
      var budgetApi = g.OmegaHomeMinistryBudgetUI;
      if (budgetApi && typeof budgetApi.open === 'function') budgetApi.open();
      else setStatus('Home Ministry budget UI has not initialized yet.', 'error');
      render();
    };
  }
  function navHtml() {
    return [['overview','LIVE OVERVIEW'],['staff','POLICE RECRUITMENT'],['fleet','VEHICLE PROCUREMENT'],['crime','CRIME & PATROL'],['rules','POLICE RULES']].map(function (row) {
      return '<button type="button" class="ohpu-tab ' + (activeTab === row[0] ? 'is-active' : '') + '" data-ohpu-tab="' + row[0] + '">' + row[1] + '</button>';
    }).join('');
  }
  function overviewHtml(d) {
    var s = d.state, b = d.baseline || {}, crime = d.crime || {}, history = Array.isArray(s.crimeHistory) ? s.crimeHistory.slice(-14) : [];
    var maxIncidents = Math.max(1, ...history.map(function (r) { return number(r.incidents); }));
    var chart = history.length ? '<div class="ohpu-barchart">' + history.map(function (row) {
      var h = Math.max(2, Math.round(number(row.incidents) / maxIncidents * 82));
      return '<div class="ohpu-barcol" title="Day ' + esc(row.day) + ': ' + esc(formatCount(row.incidents)) + ' incidents"><span style="height:' + h + 'px"></span><small>' + esc(row.day) + '</small></div>';
    }).join('') + '</div>' : '<div class="ohpu-note">Daily incident history begins as the simulation advances. The engine does not invent historical game events.</div>';
    var pop = crime.population;
    var official = crime.categories && crime.categories.homicide;
    return '<section class="ohpu-section"><div class="ohpu-grid">' +
      kpi('Active police',formatCount(s.policeCount),crime.policePer100k===null?'Police per 100k unavailable':percent(crime.policePer100k,1)+' officers per 100k residents') +
      kpi('Police efficiency',percent(s.policeEfficiency,1),'Improved by training, effective facilities and research.') +
      kpi('Public satisfaction',percent(crime.publicSatisfaction,1),'Affected by service quality, case handling and oversight policies.') +
      kpi('Operational fleet',formatCount(Object.values(s.vehiclesOwned||{}).reduce(function(sum,x){return sum+number(x);},0)), 'Opening scenario inventory is not a new purchase.') +
      kpi('Projected crime index',crime.projectedCrimeIndex===undefined?'Unavailable':percent(crime.projectedCrimeIndex,1),'The opening baseline is 100; lower is better, higher means worsening risk.') +
      kpi('Justice backlog',formatCount(s.justiceBacklog),'Daily case processing runs with the simulation clock.') +
      '</div></section>' +
      '<section class="ohpu-section"><div class="ohpu-section-title">COUNTRY DATA & BASELINE PROVENANCE</div><div class="ohpu-grid">' +
      kpi('Country',b.name||d.countryId,'Country-scoped state and Finance transactions.') +
      kpi('Population',pop===null?'Unavailable':formatCount(pop), 'Source: ' + (crime.populationSource||'unavailable') + (crime.populationYear?' · observation year '+crime.populationYear:'')) +
      kpi('Initial police baseline',formatCount(s.baselinePolicePersonnel),'Modelled starting force; not a verified police roster.') +
      kpi('Fleet replacement value',money(s.baselineFleetReplacementValueUsd),'Estimated value of already-owned baseline vehicles.') +
      kpi('Daily operating cost',money(d.dailyCost),'Payroll, fleet service and active policy running costs.') +
      kpi('Misconduct / abuse risk',percent(crime.misconductRiskPct,1),'Independent audits and body-camera rules lower this risk.') +
      '</div>' +
      '<div class="ohpu-note">Population data: ' + esc(crime.populationSource||'unavailable') + '. Homicide: ' +
      esc(official ? (official.observed ? 'observed World Bank indicator, year '+(official.observationYear||'not specified') : official.source) : 'baseline unavailable') +
      '. Theft, robbery, street robbery, drugs, smuggling, assault and cybercrime rates are labelled game estimates unless an observed source is explicitly supplied.</div>' +
      '<div class="ohpu-section-title">RECENT SIMULATED INCIDENTS · LAST ' + history.length + ' RECORDED DAYS</div>' + chart +
      '<div class="ohpu-muted">This is a day-by-day game simulation. It estimates incidents from population and crime-rate baselines, then applies staffing, skill, facilities, vehicle readiness, patrol allocation and activated policy effects.</div></section>';
  }
  function recruitmentHtml(d) {
    var e=d.engine,s=d.state,b=d.baseline||{},crime=d.crime||{},unitFee=e.getRecruitmentFeePerOfficer?e.getRecruitmentFeePerOfficer(d.countryId):e.estimateRecruitCost(1,d.countryId);
    var daily=e.getPoliceSalaryPerDay?e.getPoliceSalaryPerDay(d.countryId):e.POLICE_SALARY_PER_DAY;
    var impact=e.estimateRecruitmentImpact?e.estimateRecruitmentImpact(100,d.countryId):null;
    var disabled=!d.budget||!d.budget.available;
    return '<section class="ohpu-section"><div class="ohpu-grid">' +
      kpi('Current personnel',formatCount(s.policeCount),formatCount(crime.policePer100k)+' police per 100k') +
      kpi('One-off recruitment fee',money(unitFee),'Per new officer in this country’s game economy.') +
      kpi('Daily salary',money(daily),'Per officer per simulation day.') +
      '</div><article class="ohpu-card" style="margin-top:10px"><div class="ohpu-section-title">HIRE POLICE OFFICERS</div>' +
      '<p>Choose an exact number. Hiring checks the personnel sub-budget, total Finance Interior allocation and treasury. Successful hiring adds staff to persistent country state and raises daily payroll.</p>' +
      '<div class="ohpu-form-grid"><label class="ohpu-label">Officer count<input class="ohpu-field" id="ohpu-hire-quantity" type="number" min="1" max="100000" step="1" inputmode="numeric" value="100"></label>' +
      '<div><span class="ohpu-label">Upfront fee</span><div class="ohpu-value" id="ohpu-hire-cost">' + esc(money(100*unitFee)) + '</div><span class="ohpu-small">Additional payroll: ' + esc(money(100*daily)) + ' / day</span></div></div>' +
      '<div id="ohpu-hire-impact" class="ohpu-note">' + (impact && impact.ok ? 'Adding 100 officers changes the projected annual incident estimate by ' + esc(formatCount(impact.additionalIncidentsAvoidedPerYear)) + ' incidents / year at the current skill and vehicle mix. This is a modeled estimate, not a guarantee.' : 'Incident impact estimate is unavailable until country baselines load.') + '</div>' +
      '<button type="button" class="ohpu-btn ohpu-btn-main" id="ohpu-hire-button" ' + (disabled?'disabled':'') + '>CONFIRM HIRING · CHARGE FINANCE</button></article>' +
      '<div class="ohpu-note">Staffing only reduces crime according to the active model, and the marginal effect of each extra officer diminishes as force size grows. Training, working vehicles, patrol allocation, investigations, public satisfaction and case clearance also matter.</div></section>';
  }
  function fleetHtml(d) {
    var e=d.engine,s=d.state,b=d.baseline||{},vehicles=Array.isArray(e.VEHICLES)?e.VEHICLES:[],pending=s.pendingVehicleOrder;
    var budget=d.budget && d.budget.categories && d.budget.categories.vehicles,disabled=!d.budget||!d.budget.available;
    var cards=vehicles.map(function(v){
      var owned=number(s.vehiclesOwned&&s.vehiclesOwned[v.level]),freeLevel=number(s.unlockedVehicleLevel,1)>=v.level;
      var unitValue=number(v.cost),ownedValue=owned*unitValue;
      var row = b.baselineFleet && b.baselineFleet.countsByTier && b.baselineFleet.countsByTier[String(v.level)];
      var locked=!freeLevel;
      return '<article class="ohpu-card ohpu-fleet-card"><div class="ohpu-small">TIER ' + v.level + ' · ' + esc(v.className||v.role||'POLICE VEHICLE') + '</div>' +
        (typeof e.getVehicleSvg==='function'?'<div class="ohpu-car-art">'+e.getVehicleSvg(v):'') + '</div>' +
        '<h3>' + esc(v.name) + '</h3><div class="ohpu-value">' + esc(money(unitValue)) + '</div><div class="ohpu-small">replacement value per vehicle</div>' +
        '<div class="ohpu-note">Owned: <strong>' + esc(formatCount(owned)) + '</strong> · Estimated owned value: <strong>' + esc(money(ownedValue)) + '</strong><br>Daily upkeep per unit: ' + esc(money(v.maintenancePerDay)) + '<br>Original baseline quantity: ' + esc(formatCount(row||0)) + '</div>' +
        '<label class="ohpu-label">Quantity to purchase<input class="ohpu-field" data-ohpu-buy-qty="' + v.level + '" type="number" min="1" max="100" step="1" value="1" inputmode="numeric"></label>' +
        '<div class="ohpu-small" data-ohpu-buy-quote="' + v.level + '">Order total: ' + esc(money(unitValue)) + '</div>' +
        '<div class="ohpu-actions"><button type="button" class="ohpu-btn ' + (locked?'':'ohpu-btn-main') + '" data-ohpu-buy="' + v.level + '" ' + (disabled||locked||!!pending?'disabled':'') + '>' +
        (locked?'TIER LOCKED':pending?'PROCUREMENT IN TRANSIT':'PURCHASE VEHICLE') + '</button></div>' +
        (locked?'<div class="ohpu-small">Unlocks after the prior procurement tier is delivered.</div>':'') + '</article>';
    }).join('');
    return '<section class="ohpu-section"><div class="ohpu-grid">' +
      kpi('Fleet units owned',formatCount(Object.values(s.vehiclesOwned||{}).reduce(function(sum,x){return sum+number(x);},0)),'Starting fleets are seeded as already-owned national assets.') +
      kpi('Estimated fleet value',money(s.baselineFleetReplacementValueUsd),'Original opening-inventory replacement estimate, not cash to spend.') +
      kpi('Remaining vehicle budget',budget?money(budget.remainingUsd):'Unavailable','Orders require the vehicle sub-budget plus available treasury.') +
      '</div>' +
      (pending?'<div class="ohpu-note">Order in transit: Tier ' + esc(pending.level) + ', ' + esc(pending.quantity) + ' vehicles, ' + esc(money(pending.totalCost)) + '. Delivery time remaining: ' + esc(Math.max(0,Math.ceil((pending.completesAtMs-e.getSimulationTimeMs())/86400000))) + ' simulation days.</div>':'') +
      '<div class="ohpu-grid">' + cards + '</div>' +
      '<div class="ohpu-note">Each tier has different response, patrol, protection, crowd-control, surveillance, off-road, command and anti-smuggling capability. The purchased price and upkeep are the existing game’s tier prices; opening baseline assets are not charged retroactively.</div></section>';
  }
  function crimeHtml(d) {
    var e=d.engine,s=d.state,crime=d.crime||{},rows=crime.categories||{};
    var crimeCards=CATEGORIES.map(function(pair){
      var row=rows[pair[0]]; if(!row)return '';
      var isObserved=row.observed;
      return '<article class="ohpu-card"><span class="ohpu-label">' + esc(pair[1]) + '</span><div class="ohpu-value">' + esc(number(row.projectedRatePer100k).toFixed(2)) + '</div><div class="ohpu-small">projected incidents / 100,000 people / year</div>' +
        '<div class="ohpu-bar"><span style="width:' + Math.max(0,Math.min(100,number(row.reductionPct,0))) + '%"></span></div>' +
        '<div class="ohpu-effects"><span class="ohpu-effect">' + esc(row.reductionPct>=0?'↓ ':'↑ ') + esc(percent(Math.abs(row.reductionPct),2)) + '</span><span class="ohpu-effect ' + (isObserved?'':'ohpu-risk') + '">' + esc(isObserved?'OBSERVED BASELINE':'MODELED ESTIMATE') + '</span></div>' +
        '<div class="ohpu-small">Baseline: ' + esc(number(row.baselineRatePer100k).toFixed(2)) + '/100k · Annual estimate: ' + esc(formatCount(row.projectedAnnualIncidents)) +
        '<br>Incidents avoided vs baseline: ' + esc(formatCount(row.estimatedAnnualIncidentsAvoided)) +
        (row.observationYear?' · Observation year '+esc(row.observationYear):'') + '</div></article>';
    }).join('');
    var plan=s.patrolPlan||{},keys=[['urban','Urban'],['rural','Rural'],['highway','Highway'],['border','Border & customs'],['drugs','Drug markets'],['investigations','Investigations'],['cyber','Cybercrime'],['community','Community safety']];
    var fields=keys.map(function(row){return '<label class="ohpu-label">' + esc(row[1]) + ' (%)<input class="ohpu-field" type="number" min="0" max="100" step="0.1" data-ohpu-patrol="' + row[0] + '" value="' + esc(plan[row[0]]===undefined?0:plan[row[0]]) + '"></label>';}).join('');
    var total=keys.reduce(function(sum,row){return sum+number(plan[row[0]]);},0);
    return '<section class="ohpu-section"><div class="ohpu-grid">' +
      kpi('Baseline annual incidents',formatCount(crime.baselineAnnualIncidentEstimate),'Calculated from population × baseline category rate when population is available.') +
      kpi('Projected annual incidents',formatCount(crime.projectedAnnualIncidentEstimate),'Changes as staffing, skill, facilities, fleet readiness and rules change.') +
      kpi('Annual incidents avoided',formatCount(crime.annualIncidentsAvoided),'Negative means the modeled situation is worse than the starting baseline.') +
      kpi('Case clearance',percent(s.crimeModel&&s.crimeModel.activeCaseClearancePct,1),'Police efficiency, investigators, forensics and case rules.') +
      kpi('Cases awaiting justice',formatCount(s.justiceBacklog),'Backlog changes each simulated day; speeding up processing has a cost.') +
      kpi('Privacy risk',percent(s.privacyRiskPct,1),'Data-led patrol tools can improve coverage but need privacy safeguards.') +
      '</div><div class="ohpu-section-title">CRIME BY CATEGORY</div><div class="ohpu-grid">' + crimeCards + '</div>' +
      '<article class="ohpu-card" style="margin-top:12px"><div class="ohpu-section-title">INTERACTIVE PATROL DEPLOYMENT PLAN</div>' +
      '<p>Distribute the police operations plan among urban, rural, highway, border, drug, investigations, cyber and community patrol. The allocation is a share of existing operational capacity, not extra staff or money. The total must stay at or below 100%.</p>' +
      '<div class="ohpu-form-grid">' + fields + '</div><div class="ohpu-note" id="ohpu-patrol-total">Allocated ' + esc(total.toFixed(1)) + '%; unassigned ' + esc(Math.max(0,100-total).toFixed(1)) + '%.</div>' +
      '<button class="ohpu-btn ohpu-btn-main" id="ohpu-save-patrol" type="button">SAVE PATROL ALLOCATION</button></article>' +
      '<div class="ohpu-note">Observed homicide-rate data is kept separate from simulated results. Theft, street robbery, general robbery, assault, drug trafficking, contraband and cybercrime values are modelled baseline rates where country-level observations are not in the local dataset.</div></section>';
  }
  function effectsHtml(rule) {
    var map = {theft:'theft',robbery:'robbery',streetRobbery:'street robbery',drugTrafficking:'drug trafficking',contrabandSmuggling:'smuggling',assault:'assault',homicide:'homicide',cybercrime:'cybercrime'};
    var result = Object.keys(rule.crimeEffects||{}).map(function(key) {
      var value = number(rule.crimeEffects[key])*100;
      return '<span class="ohpu-effect">−' + esc(value.toFixed(0)) + '% ' + esc(map[key]||key) + '</span>';
    }).join('');
    if(!result) result='<span class="ohpu-effect">Governance / oversight effect</span>';
    if(number(rule.trustDelta))result+='<span class="ohpu-effect">Trust +' + esc(rule.trustDelta) + '</span>';
    if(number(rule.clearanceDelta))result+='<span class="ohpu-effect">Case clearance +' + esc(rule.clearanceDelta) + '</span>';
    if(number(rule.justiceDelta))result+='<span class="ohpu-effect">Justice speed +' + esc(rule.justiceDelta) + '</span>';
    if(number(rule.privacyDelta)>0)result+='<span class="ohpu-effect ohpu-risk">Privacy risk +' + esc(rule.privacyDelta) + '</span>';
    if(number(rule.vehicleWearPct)>0)result+='<span class="ohpu-effect ohpu-risk">Vehicle wear +' + esc(rule.vehicleWearPct) + '%</span>';
    if(number(rule.misconductMultiplier)<1)result+='<span class="ohpu-effect">Misconduct risk ×' + esc(number(rule.misconductMultiplier).toFixed(2)) + '</span>';
    return result;
  }
  function rulesHtml(d) {
    var e=d.engine,s=d.state,rules=typeof e.getPolicePolicyRules==='function'?e.getPolicePolicyRules():[],budget=d.budget&&d.budget.categories;
    var cards=rules.map(function(rule) {
      var on=!!(s.policeRules&&s.policeRules[rule.id]),department=rule.department==='training'?'training':rule.department==='facilities'?'facilities':'operations';
      var remaining=budget&&budget[department]?money(budget[department].remainingUsd):'Unavailable';
      return '<article class="ohpu-card ohpu-rule-card"><div class="ohpu-effects"><span class="ohpu-tag">' + esc(on?'ACTIVE RULE':'OPTIONAL RULE') + '</span><span class="ohpu-tag">' + esc(department.toUpperCase()) + '</span></div>' +
        '<h3>' + esc(rule.name) + '</h3><p>' + esc(rule.description) + '</p><div class="ohpu-small">Setup cost: <strong>' + esc(money(rule.setupCostUsd)) + '</strong> · Daily cost: <strong>' + esc(money(rule.dailyCostUsd)) + '</strong><br>Current category budget remaining: ' + esc(remaining) + '</div>' +
        '<div class="ohpu-effects">' + effectsHtml(rule) + '</div>' +
        '<div class="ohpu-actions"><button type="button" class="ohpu-btn ' + (on?'':'ohpu-btn-main') + '" data-ohpu-rule="' + esc(rule.id) + '" data-ohpu-enabled="' + (on?'false':'true') + '">' + (on?'DEACTIVATE RULE':'ENABLE RULE · CHARGE FINANCE') + '</button></div>' +
        (on?'<div class="ohpu-small">When disabled, future daily running costs stop. The one-time setup cost is not refunded.</div>':'') +
        '</article>';
    }).join('');
    return '<section class="ohpu-section"><div class="ohpu-grid">' +
      kpi('Public satisfaction',percent(s.publicSatisfaction,1),'Trust increases when oversight and service quality improve.') +
      kpi('Misconduct risk',percent(s.misconductRiskPct,1),'Independent audit, body cameras and professional training reduce risk.') +
      kpi('Active policy rules',formatCount(rules.filter(function(rule){return !!(s.policeRules&&s.policeRules[rule.id]);}).length),'Every toggle changes the persistent simulation state.') +
      '</div><div class="ohpu-grid">' + cards + '</div>' +
      '<div class="ohpu-note">Rules have setup costs and recurring operating costs. An enable action is rejected if Finance does not have funds in the matching Home Ministry budget category. Deactivation does not refund setup expenses.</div></section>';
  }
  function render() {
    var root=host(),d=getData();
    if(!root)return;
    ensureStyle();
    if(!d.ready){
      root.innerHTML='<section class="ohpu"><h2 class="ohpu-title">POLICE OPERATIONS CONSOLE</h2><div class="ohpu-note is-error">' + esc(d.reason||'Home Ministry is not ready') + '</div><button type="button" class="ohpu-btn" id="ohpu-close-failed">BACK TO HOME MINISTRY</button></section>';
      var closeFailure=root.querySelector('#ohpu-close-failed'); if(closeFailure)closeFailure.onclick=function(){if(ui&&ui.renderHomeMinistryDashboard)ui.renderHomeMinistryDashboard();};
      return;
    }
    var body;
    if(activeTab==='staff')body=recruitmentHtml(d);
    else if(activeTab==='fleet')body=fleetHtml(d);
    else if(activeTab==='crime')body=crimeHtml(d);
    else if(activeTab==='rules')body=rulesHtml(d);
    else body=overviewHtml(d);
    root.innerHTML='<section class="ohpu"><header class="ohpu-head"><div><h2 class="ohpu-title">POLICE COMMAND · PUBLIC SAFETY</h2><div class="ohpu-sub">' +
      esc(d.baseline&&d.baseline.name||d.countryId) + ' · live recruitment, fleet procurement, crime model, patrol allocation and accountable police policy.</div></div>' +
      '<span class="ohpu-tag">COUNTRY-BOUND RUNTIME</span></header>' +
      '<nav class="ohpu-tabs">' + navHtml() + '</nav>' + statusHtml() + budgetHtml(d) +
      '<div class="ohpu-section-title">' + esc(({overview:'LIVE COUNTRY OVERVIEW',staff:'POLICE RECRUITMENT & STAFFING',fleet:'VEHICLE INVENTORY & PROCUREMENT',crime:'CRIME RATES & PATROL ALLOCATION',rules:'POLICE RULES & OVERSIGHT'})[activeTab]||'POLICE CONTROL') + '</div>' +
      body +
      '<div class="ohpu-actions"><button type="button" class="ohpu-btn" id="ohpu-back-home">BACK TO HOME MINISTRY</button></div>' +
      '<div class="ohpu-small">State updates and spending are executed by the Home Ministry engine. No mock balances or successful actions are shown when a Finance transaction fails.</div></section>';
    bindFinanceButtons(root);
    Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-tab]'),function(btn){btn.onclick=function(){activeTab=btn.getAttribute('data-ohpu-tab');setStatus('','');render();};});
    var back=root.querySelector('#ohpu-back-home');if(back)back.onclick=function(){if(ui&&ui.renderHomeMinistryDashboard)ui.renderHomeMinistryDashboard();};
    var hireInput=root.querySelector('#ohpu-hire-quantity'),hireCost=root.querySelector('#ohpu-hire-cost'),hireImpact=root.querySelector('#ohpu-hire-impact');
    function updateHireQuote(){
      if(!hireInput)return;
      var q=Math.max(0,Math.min(100000,Math.floor(number(hireInput.value))));
      if(hireCost)hireCost.textContent=money(d.engine.estimateRecruitCost(q,d.countryId));
      if(hireImpact&&q>0&&d.engine.estimateRecruitmentImpact){
        var impact=d.engine.estimateRecruitmentImpact(q,d.countryId);
        hireImpact.textContent=impact&&impact.ok?'Hiring '+formatCount(q)+' officers adds '+money(impact.upfrontCostUsd)+' upfront and '+money(impact.addedDailyPayrollUsd)+' / day payroll; modeled annual incidents avoided: '+formatCount(impact.additionalIncidentsAvoidedPerYear)+'.':'Crime impact estimate unavailable: '+String(impact&&impact.code||'UNKNOWN');
      }
    }
    if(hireInput)hireInput.onchange=updateHireQuote;
    var hireBtn=root.querySelector('#ohpu-hire-button');
    if(hireBtn)hireBtn.onclick=function(){
      var q=Math.floor(number(hireInput&&hireInput.value));
      var result=d.engine.recruitPolice(q,d.countryId);
      if(!result||!result.ok){setStatus('Hiring rejected: '+String(result&&(result.message||result.reason||result.code)||'UNKNOWN_ERROR')+'. No officers were added.', 'error');}
      else setStatus('Hiring completed: '+formatCount(q)+' officers added. One-off cost '+money(result.cost)+'; extra daily payroll '+money(result.addedDailyPayroll)+'. Updated crime projection is recalculated from the new staffing and skill.', 'ok');
      render();
    };
    Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-buy-qty]'),function(input){
      function update(){var level=number(input.getAttribute('data-ohpu-buy-qty')),vehicle=d.engine.VEHICLES.find(function(v){return v.level===level;});
        var q=Math.max(0,Math.min(100,Math.floor(number(input.value))));
        var quote=root.querySelector('[data-ohpu-buy-quote="'+level+'"]');if(quote&&vehicle)quote.textContent='Order total: '+money(vehicle.cost*q);
        var button=root.querySelector('[data-ohpu-buy="'+level+'"]');if(button&&vehicle)button.textContent=(number(d.state.unlockedVehicleLevel,1)<level?'TIER LOCKED':d.state.pendingVehicleOrder?'PROCUREMENT IN TRANSIT':'PURCHASE · '+money(vehicle.cost*q));
      }
      input.onchange=update;input.oninput=update;
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-buy]'),function(btn){
      btn.onclick=function(){var level=number(btn.getAttribute('data-ohpu-buy')),input=root.querySelector('[data-ohpu-buy-qty="'+level+'"]'),q=Math.floor(number(input&&input.value));
        var result=d.engine.orderVehicle(level,q,d.countryId);
        if(!result||!result.ok)setStatus('Vehicle order rejected: '+String(result&&(result.message||result.reason||result.code)||'UNKNOWN_ERROR')+'. No vehicle was ordered.', 'error');
        else setStatus('Procurement recorded: '+formatCount(q)+' × Tier '+level+'. Finance charged '+money(result.cost)+'. Estimated delivery is shown in Fleet Procurement.', 'ok');
        activeTab='fleet';render();
      };
    });
    var savePatrol=root.querySelector('#ohpu-save-patrol');
    if(savePatrol)savePatrol.onclick=function(){
      var plan={};Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-patrol]'),function(input){plan[input.getAttribute('data-ohpu-patrol')]=number(input.value);});
      var result=d.engine.setPatrolPlan(plan,d.countryId);
      if(!result||!result.ok)setStatus('Patrol allocation rejected: '+String(result&&(result.message||result.code)||'UNKNOWN_ERROR')+'. Total share must be at most 100%.','error');
      else setStatus('Patrol allocation saved. Crime projections now use the new urban/rural/highway/border/investigation shares.','ok');
      activeTab='crime';render();
    };
    function recalcPatrolTotal(){
      var total=0;Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-patrol]'),function(input){total+=Math.max(0,number(input.value));});
      var node=root.querySelector('#ohpu-patrol-total');if(node)node.textContent='Allocated '+total.toFixed(1)+'%; unassigned '+Math.max(0,100-total).toFixed(1)+'%. '+(total>100?'Saving is blocked until total is 100% or less.':'');
      if(savePatrol)savePatrol.disabled=total>100.0001;
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-patrol]'),function(input){input.oninput=recalcPatrolTotal;});recalcPatrolTotal();
    Array.prototype.forEach.call(root.querySelectorAll('[data-ohpu-rule]'),function(btn){
      btn.onclick=function(){
        var id=btn.getAttribute('data-ohpu-rule'),enabled=btn.getAttribute('data-ohpu-enabled')==='true';
        var result=d.engine.setPolicePolicyRule(id,enabled,d.countryId);
        if(!result||!result.ok)setStatus('Police rule rejected: '+String(result&&(result.message||result.reason||result.code)||'UNKNOWN_ERROR')+'. No rule was enabled.','error');
        else setStatus((enabled?'Policy activated: ':'Policy deactivated: ')+String(result.rule&&result.rule.name||id)+(enabled?'. Finance charged '+money(result.cost)+' upfront; daily operating cost is '+money(result.dailyOperatingCostUsd)+'.':'. Future daily operating charges stop; the one-off setup cost is not refunded.'),'ok');
        activeTab='rules';render();
      };
    });
  }
  function addLaunchButton() {
    var root=host();if(!root||!g.document)return;
    var shell=root.querySelector('.home-police-shell'),actions=shell&&shell.querySelector('.home-police-actions');
    if(!actions||root.querySelector('#ohpu-open-console'))return;
    var button=g.document.createElement('button');button.type='button';button.id='ohpu-open-console';button.className='home-police-btn home-police-btn-gold';button.textContent='📊 CRIME ANALYTICS & POLICE RULES';
    button.onclick=function(){activeTab='overview';setStatus('','');render();};
    actions.appendChild(button);
  }
  function install() {
    ensureStyle();
    if(ui&&!ui.__omegaPoliceOperationsWrapped&&typeof ui.renderHomeMinistryDashboard==='function'){
      ui.__omegaPoliceOperationsWrapped=true;
      var original=ui.renderHomeMinistryDashboard;
      ui.renderHomeMinistryDashboard=function(){
        var result=original.apply(this,arguments);
        addLaunchButton();
        return result;
      };
    }
    if(g.addEventListener&&!g.__OMEGA_HOME_POLICE_OPERATIONS_REFRESH_LISTENER__){
      g.__OMEGA_HOME_POLICE_OPERATIONS_REFRESH_LISTENER__=true;
      g.addEventListener('OMEGA_HOME_POLICE_BASELINE_READY',function(){addLaunchButton();});
      g.addEventListener('OMEGA_HOME_POLICE_WORLD_BASELINE_READY',function(){addLaunchButton();});
      g.addEventListener('OMEGA_FINANCE_RUNTIME_READY',function(){});
    }
  }
  var api=Object.freeze({VERSION:VERSION,open:render,render:render,diagnostics:function(){var d=getData();return{version:VERSION,ready:!!d.ready,activeTab:activeTab,countryId:d.countryId||null,financeAvailable:!!(d.budget&&d.budget.available),crimeAvailable:!!(d.crime&&d.crime.available)};}});
  g.OmegaHomePoliceOperationsUI=api;
  if(g.document){
    if(g.document.readyState==='loading')g.document.addEventListener('DOMContentLoaded',install,{once:true});
    else Promise.resolve().then(install);
  }
})(typeof window!=='undefined'?window:globalThis);
