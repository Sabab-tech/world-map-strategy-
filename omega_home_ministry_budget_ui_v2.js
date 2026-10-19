/* OMEGA HOME MINISTRY BUDGET UI v2.0.0
 * Additive Finance-to-Interior budget controls. Existing UI and state are preserved.
 */
(function (g) {
  'use strict';
  if (g.__OMEGA_HOME_MINISTRY_BUDGET_UI_V2__) return;
  g.__OMEGA_HOME_MINISTRY_BUDGET_UI_V2__ = true;
  var ui = g.OMEGA_UI_ADAPTER;
  var categories = [
    ['personnel', 'Personnel & salaries'],
    ['vehicles', 'Vehicle procurement'],
    ['maintenance', 'Repair & maintenance'],
    ['facilities', 'Police facilities'],
    ['training', 'Training & research'],
    ['operations', 'Operations & other costs']
  ];
  function engine() { return g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry) || null; }
  function finance() { return g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry) || null; }
  function country() {
    var e = engine();
    try { if (e && e.getCurrentCountryId) return e.getCurrentCountryId(); } catch (_) {}
    var sim = g.Omega && g.Omega.Simulation;
    return (sim && sim.getPlayerCountryId && sim.getPlayerCountryId()) ||
      (g.CountryIOS && g.CountryIOS.activeCountry) || (g.Game && (g.Game.currentActiveCountry || g.Game.playerCountry || g.Game.countryId)) || 'USA';
  }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function money(v) {
    var e = engine();
    if (e && e.formatMoney) return e.formatMoney(v);
    var n = Number(v);
    return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : 'Unavailable';
  }
  function host() { return g.document && (g.document.getElementById('home-ministry-command-root') || g.document.getElementById('cabinet-body') || g.document.getElementById('ministry-content')); }
  function style() {
    if (!g.document || g.document.getElementById('omega-home-ministry-budget-style-v2')) return;
    var node = g.document.createElement('style');
    node.id = 'omega-home-ministry-budget-style-v2';
    node.textContent =
      '.ohmb-access{margin:14px 0;padding:14px;border:1px solid rgba(221,183,90,.42);border-radius:13px;background:linear-gradient(145deg,rgba(18,39,59,.97),rgba(5,13,23,.98));color:#eef6ff}' +
      '.ohmb-access-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
      '.ohmb-access h2,.ohmb-screen h2{font-size:15px;color:#f2d47b;margin:0 0 6px;letter-spacing:.04em}' +
      '.ohmb-muted{font-size:12px;line-height:1.55;color:#a8bed1;margin:6px 0 12px}' +
      '.ohmb-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}' +
      '.ohmb-kpi{padding:9px;border:1px solid rgba(111,166,199,.22);border-radius:8px;background:rgba(0,0,0,.18);min-width:0}' +
      '.ohmb-kpi strong{display:block;color:#f7f9fc;font-size:13px;overflow-wrap:anywhere}.ohmb-kpi span{display:block;color:#9eb4c7;font-size:10px;margin-top:4px}' +
      '.ohmb-button{border:1px solid rgba(231,197,115,.42);border-radius:8px;padding:10px 12px;min-height:40px;background:linear-gradient(135deg,#283e50,#101c29);color:#f4f8fb;font-weight:800;font-size:11px;letter-spacing:.04em;cursor:pointer;touch-action:manipulation}' +
      '.ohmb-button-main{background:linear-gradient(135deg,#80602a,#3e301c);border-color:#e8c66d}.ohmb-button:disabled{opacity:.45;cursor:not-allowed}' +
      '.ohmb-screen{box-sizing:border-box;color:#eff5fc;margin:10px 0;padding:15px;border:1px solid rgba(221,183,90,.38);border-radius:13px;background:linear-gradient(145deg,#12283b,#06101c);min-width:0}' +
      '.ohmb-table{width:100%;border-collapse:collapse;font-size:12px}.ohmb-table th,.ohmb-table td{padding:9px 6px;border-bottom:1px solid rgba(140,178,205,.17);text-align:left;vertical-align:middle}.ohmb-table th{color:#e9cb7e;font-size:10px;text-transform:uppercase;letter-spacing:.06em}' +
      '.ohmb-category{font-weight:800;color:#eaf2fa}.ohmb-category small{display:block;font-weight:500;color:#9bb2c7;font-size:10px;margin-top:3px}' +
      '.ohmb-field{box-sizing:border-box;width:100%;min-width:0;min-height:38px;background:#071421;color:#f2f7fb;border:1px solid #36556b;border-radius:7px;padding:7px;font-size:12px}' +
      '.ohmb-status{font-size:12px;line-height:1.5;border:1px solid rgba(124,166,195,.26);border-radius:8px;padding:10px;margin:10px 0;color:#b8cddd;background:rgba(0,0,0,.15)}.ohmb-status.is-error{color:#ffd1cc;border-color:#b94d4d}.ohmb-status.is-ok{color:#bff3d8;border-color:#368e69}' +
      '.ohmb-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.ohmb-total{font-weight:800;color:#f6dc9a}.ohmb-tag{display:inline-block;border-radius:6px;padding:4px 6px;background:rgba(75,184,210,.12);color:#afe9f7;font-size:10px}' +
      '@media(max-width:560px){.ohmb-kpis{grid-template-columns:1fr}.ohmb-table{font-size:11px}.ohmb-table th,.ohmb-table td{padding:7px 4px}.ohmb-screen{padding:10px}.ohmb-field{font-size:11px}}';
    (g.document.head || g.document.documentElement).appendChild(node);
  }
  function snapshot() {
    var e = engine();
    if (!e || typeof e.getHomeBudgetSnapshot !== 'function') return { available: false, reason: 'HOME_BUDGET_API_UNAVAILABLE' };
    try { return e.getHomeBudgetSnapshot(country()); } catch (err) { return { available: false, reason: String(err && err.message || err) }; }
  }
  function statusMessage(message, type) {
    var node = g.document && g.document.getElementById('ohmb-form-status');
    if (node) { node.className = 'ohmb-status' + (type === 'error' ? ' is-error' : type === 'ok' ? ' is-ok' : ''); node.textContent = String(message || ''); }
  }
  function insertAccessPanel() {
    var root = host(), e = engine();
    if (!root || !e || !g.document) return;
    style();
    var old = g.document.getElementById('omega-home-budget-access-v2');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var target = root.querySelector && root.querySelector('.home-police-shell') || root;
    var snap = snapshot();
    var title = snap.available ? money(snap.parentBudgetUsd) : 'Not allocated';
    var remaining = snap.available ? money(snap.parentRemainingUsd) : 'Unavailable';
    var cash = snap.available ? money(snap.treasuryBalanceUsd) : 'Unavailable';
    var html = '<section class="ohmb-access" id="omega-home-budget-access-v2">' +
      '<div class="ohmb-access-head"><div><h2>HOME MINISTRY · BUDGET & EXPENDITURE</h2><div class="ohmb-muted">Finance ceiling is linked to Interior. This panel splits it into salaries, vehicles, repairs, facilities, training and operations.</div></div>' +
      '<div class="ohmb-actions"><button type="button" class="ohmb-button ohmb-button-main" id="ohmb-open-budget">MINISTRY BUDGET CONTROL</button>' +
      '<button type="button" class="ohmb-button" id="ohmb-open-finance">OPEN FINANCE BUDGET</button></div></div>' +
      '<div class="ohmb-kpis"><div class="ohmb-kpi"><strong>' + esc(title) + '</strong><span>Annual Finance allocation</span></div>' +
      '<div class="ohmb-kpi"><strong>' + esc(remaining) + '</strong><span>Interior allocation remaining</span></div>' +
      '<div class="ohmb-kpi"><strong>' + esc(cash) + '</strong><span>Available treasury</span></div></div>' +
      (!snap.available ? '<div class="ohmb-status is-error">Finance allocation is unavailable for this country. Status: ' + esc(snap.reason || 'UNAVAILABLE') + '.</div>' :
        (snap.canEdit === false ? '<div class="ohmb-status">READ-ONLY COUNTRY VIEW. This country’s own allocation and treasury are shown; budget edits and purchases remain restricted to the active player country.</div>' :
        (!snap.valid ? '<div class="ohmb-status is-error">Sub-budget categories exceed the Finance allocation. Adjust the category plan before purchasing.</div>' :
        '<div class="ohmb-status">Every paid Home Ministry action checks its category limit, the parent Finance ceiling and available Treasury.</div>'))) +
      '</section>';
    target.insertAdjacentHTML('beforeend', html);
    var open = g.document.getElementById('ohmb-open-budget');
    if (open) open.onclick = function () { renderBudgetScreen(); };
    var financeButton = g.document.getElementById('ohmb-open-finance');
    if (financeButton) financeButton.onclick = function () {
      var f = finance();
      if (!f) { statusMessage('Finance Ministry runtime is unavailable. No funds were allocated.', 'error'); return; }
      try {
        if (typeof f.selectTab === 'function') f.selectTab('budget');
        else if (typeof f.renderDashboard === 'function') f.renderDashboard('finance');
      } catch (error) { statusMessage('Finance budget could not be opened: ' + String(error && error.message || error), 'error'); }
    };
  }
  function renderBudgetScreen(statusText, statusType) {
    var root = host(), e = engine(), f = finance();
    if (!root || !e || !g.document) return;
    style();
    var s = e.getState(country()), snap = snapshot();
    var plan = snap.plan || s.homeBudgetPlan || {};
    var envelope = snap.available ? Number(snap.parentBudgetUsd) || 0 : 0;
    var rows = categories.map(function (c) {
      var id = c[0], label = c[1], spec = plan[id] || { mode: 'percent', value: 0 };
      var stat = snap.categories && snap.categories[id];
      return '<tr><td class="ohmb-category">' + esc(label) + '<small>' +
        (stat ? 'Spent ' + esc(money(stat.spentUsd)) + ' · Remaining ' + esc(money(stat.remainingUsd)) : 'Waiting for Finance allocation') +
        '</small></td><td><select class="ohmb-field" data-ohmb-mode="' + id + '">' +
        '<option value="percent"' + (spec.mode === 'percent' ? ' selected' : '') + '>Percent (%)</option>' +
        '<option value="amount"' + (spec.mode === 'amount' ? ' selected' : '') + '>Fixed USD</option></select></td>' +
        '<td><input class="ohmb-field" type="number" min="0" step="any" inputmode="decimal" data-ohmb-value="' + id + '" value="' + esc(spec.value == null ? 0 : spec.value) + '"></td>' +
        '<td data-ohmb-estimate="' + id + '">' + esc(money(stat ? stat.budgetUsd : (spec.mode === 'amount' ? Number(spec.value) || 0 : envelope * (Number(spec.value) || 0) / 100))) + '</td></tr>';
    }).join('');
    var fail = !snap.available ? '<div class="ohmb-status is-error">Finance allocation is not available: ' + esc(snap.reason || 'UNKNOWN') + '. In Finance Ministry, allocate a positive share to “Internal Security & Civil Administration” first.</div>' :
      (snap.canEdit === false ? '<div class="ohmb-status">READ-ONLY COUNTRY VIEW. The displayed budget belongs to ' + esc(snap.countryId || country()) + '. Budget-plan changes and purchases are disabled for this country.</div>' : '');
    root.innerHTML = '<section class="ohmb-screen"><h2>HOME MINISTRY BUDGET CONTROL</h2>' +
      '<div class="ohmb-muted">Choose a percentage of the Home Ministry allocation or enter a fixed USD amount for each category. The sum of all six categories must not exceed the Finance Ministry Interior ceiling.</div>' +
      '<div class="ohmb-kpis"><div class="ohmb-kpi"><strong>' + esc(snap.available ? money(snap.parentBudgetUsd) : 'Not allocated') + '</strong><span>Annual Interior ceiling</span></div>' +
      '<div class="ohmb-kpi"><strong>' + esc(snap.available ? money(snap.parentRemainingUsd) : 'Unavailable') + '</strong><span>Parent budget remaining</span></div>' +
      '<div class="ohmb-kpi"><strong>' + esc(snap.available ? money(snap.treasuryBalanceUsd) : 'Unavailable') + '</strong><span>National treasury</span></div></div>' +
      fail + '<div id="ohmb-form-status" class="ohmb-status' + (statusType ? ' ' + statusType : '') + '">' + esc(statusText || 'Allocation changes take effect only after the Save button succeeds.') + '</div>' +
      '<form id="ohmb-budget-form"><div style="overflow-x:auto"><table class="ohmb-table"><thead><tr><th>Category</th><th>Allocation type</th><th>Value</th><th>Calculated ceiling</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="ohmb-kpis"><div class="ohmb-kpi"><strong id="ohmb-plan-total" class="ohmb-total">' + esc(money(snap.planTotalUsd || 0)) + '</strong><span>Total planned categories</span></div>' +
      '<div class="ohmb-kpi"><strong>' + esc(snap.available ? money(snap.unplannedBudgetUsd) : 'Unavailable') + '</strong><span>Unassigned Interior ceiling</span></div>' +
      '<div class="ohmb-kpi"><strong>' + esc(snap.available ? (snap.valid ? 'WITHIN LIMIT' : 'OVER LIMIT') : 'BLOCKED') + '</strong><span>Plan validation</span></div></div>' +
      '<div class="ohmb-actions"><button type="submit" class="ohmb-button ohmb-button-main" id="ohmb-save-budget" ' + (!snap.available || snap.canEdit === false ? 'disabled' : '') + '>SAVE MINISTRY ALLOCATIONS</button>' +
      '<button type="button" class="ohmb-button" id="ohmb-budget-back">BACK TO HOME MINISTRY</button></div></form>' +
      '<div class="ohmb-muted">Vehicle orders charge the Vehicles category; police recruitment and payroll charge Personnel; repair charges Maintenance; facility work charges Facilities; research/training charges Training. The Finance Ministry remains the treasury authority.</div>' +
      '</section>';
    var form = g.document.getElementById('ohmb-budget-form');
    var status = g.document.getElementById('ohmb-form-status');
    function readPlan() {
      var out = {};
      categories.forEach(function (c) {
        var id = c[0], modeNode = form.querySelector('[data-ohmb-mode="' + id + '"]'), valueNode = form.querySelector('[data-ohmb-value="' + id + '"]');
        out[id] = { mode: modeNode && modeNode.value === 'amount' ? 'amount' : 'percent', value: Math.max(0, Number(valueNode && valueNode.value) || 0) };
      });
      return out;
    }
    function recalc() {
      if (!form) return;
      var p = readPlan(), total = 0;
      categories.forEach(function (c) {
        var id = c[0], row = p[id], amount = row.mode === 'amount' ? row.value : envelope * row.value / 100;
        total += amount;
        var cell = form.querySelector('[data-ohmb-estimate="' + id + '"]');
        if (cell) cell.textContent = money(amount);
      });
      var totalNode = g.document.getElementById('ohmb-plan-total');
      if (totalNode) totalNode.textContent = money(total);
      var over = snap.available && total > envelope + 0.01;
      if (status) { status.className = 'ohmb-status' + (over ? ' is-error' : ''); status.textContent = over ? 'Planned categories total ' + money(total) + ', above the Finance ceiling of ' + money(envelope) + '. Save is blocked until the plan fits.' : 'Planned categories: ' + money(total) + ' of ' + money(envelope) + '.'; }
      var save = g.document.getElementById('ohmb-save-budget');
      if (save) save.disabled = !snap.available || over;
    }
    if (form) {
      form.addEventListener('input', recalc);
      form.addEventListener('change', recalc);
      form.onsubmit = function (event) {
        event.preventDefault();
        var api = engine(), plan = readPlan();
        if (!api || typeof api.setHomeBudgetPlan !== 'function') {
          if (status) { status.className = 'ohmb-status is-error'; status.textContent = 'Home Ministry budget API is unavailable. No allocation was saved.'; }
          return;
        }
        var result;
        try { result = api.setHomeBudgetPlan(plan, country()); } catch (err) { result = { ok: false, code: String(err && err.message || err) }; }
        if (!result || !result.ok) {
          if (status) { status.className = 'ohmb-status is-error'; status.textContent = 'Allocation rejected: ' + String(result && (result.message || result.code) || 'UNKNOWN_ERROR') + '. No money was spent.'; }
          return;
        }
        renderBudgetScreen('Budget plan saved. Actual purchases will still be checked against treasury and the remaining category allocation.', 'is-ok');
      };
    }
    var back = g.document.getElementById('ohmb-budget-back');
    if (back) back.onclick = function () { if (ui && ui.renderHomeMinistryDashboard) ui.renderHomeMinistryDashboard(); };
    recalc();
  }
  function wrapUi() {
    if (!ui || ui.__omegaHomeBudgetUiWrapped) return;
    ui.__omegaHomeBudgetUiWrapped = true;
    if (typeof ui.renderHomeMinistryDashboard === 'function') {
      var original = ui.renderHomeMinistryDashboard;
      ui.renderHomeMinistryDashboard = function () {
        var result = original.apply(this, arguments);
        insertAccessPanel();
        return result;
      };
    }
  }
  function ready() {
    wrapUi();
    if (g.addEventListener) {
      ['OMEGA_FINANCE_RUNTIME_READY','OMEGA_FINANCE_STATE_UPDATED','OMEGA_HOME_POLICE_BASELINE_READY','OMEGA_HOME_POLICE_WORLD_BASELINE_READY','OMEGA_HOME_POLICE_ACTION_COMPLETED','OMEGA_HOME_MINISTRY_TRANSACTION'].forEach(function (type) {
        g.addEventListener(type, function () {
          if (g.document && (g.document.getElementById('omega-home-budget-access-v2') || g.document.getElementById('home-ministry-command-root'))) insertAccessPanel();
        });
      });
    }
  }
  if (g.document && g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
  g.OmegaHomeMinistryBudgetUI = Object.freeze({ open: renderBudgetScreen, refresh: insertAccessPanel, VERSION: '2.0.0' });
})(typeof window !== 'undefined' ? window : globalThis);
