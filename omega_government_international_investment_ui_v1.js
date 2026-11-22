/* OMEGA Government Investment UI v1.0.0
 * Finance Ministry surface for domestic public CAPEX and international sovereign investment.
 * All cash, contract and project mutations are delegated to the Finance-owned investment runtime.
 */
(function (g) {
  'use strict';
  var VERSION = '1.0.0';
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function money(value, currency) {
    var n = number(value);
    if (n === null) return 'N/A';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n); }
    catch (_) { return (currency || 'USD') + ' ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  }
  function runtime() { return g.OmegaGovernmentInvestmentRuntimeV1 || g.Omega && g.Omega.GovernmentInvestmentRuntimeV1 || null; }
  function countryRuntime() { return g.OmegaCountryRuntimeData || g.Omega && g.Omega.CountryRuntimeData || null; }
  function forex() { return g.OmegaForexMonetaryEngine || g.Omega && g.Omega.ForexMonetaryEngine || null; }
  function gameState() { return g.Game && g.Game.state || g.gameState || {}; }
  function countryCode(profile) { return String(profile && (profile.iso3 || profile.countryCode || profile.countryId) || '').trim().toUpperCase(); }
  function profiles() {
    var engine = countryRuntime();
    try {
      var rows = engine && typeof engine.listProfiles === 'function' ? engine.listProfiles() : [];
      return (Array.isArray(rows) ? rows : []).map(function (p) {
        return { code: countryCode(p), name: p.name || p.countryName || countryCode(p), currency: p.currencyCode || p.currency || 'USD' };
      }).filter(function (p) { return /^[A-Z]{3}$/.test(p.code); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    } catch (_) { return []; }
  }
  function fxFor(country) {
    var engine = countryRuntime(), fx = forex(), profile = null;
    try { profile = engine && engine.getProfile(country); } catch (_) {}
    if (!profile || !fx || typeof fx.getRate !== 'function') return { currency: 'USD', rate: null };
    var currency = String(typeof fx.getCurrencyCode === 'function' ? fx.getCurrencyCode(profile) : profile.currencyCode || 'USD').toUpperCase();
    var rate = number(fx.getRate(currency));
    return { currency: currency, rate: rate !== null && rate > 0 ? rate : null };
  }
  function catalog() {
    return g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData ||
      g.OmegaResourceIndustrialNetwork && g.OmegaResourceIndustrialNetwork.catalog || {};
  }
  function sitesFor(host) {
    var data = g.OmegaResourceSiteCanonicalCatalogData || g.Omega && g.Omega.ResourceSiteCanonicalCatalogData;
    var rows = Array.isArray(data && data.sites) ? data.sites : [];
    return rows.filter(function (row) {
      var country = String(row.countryId || row.countryCode || row.identity && row.identity.countryIso3 || '').toUpperCase();
      var siteId = String(row.siteId || row.id || '');
      var resource = row.resourceId || row.real && row.real.resourceId || row.identity && row.identity.resourceTypeId;
      return country === host && siteId && resource && !(row.map && row.map.markerEligible === false) &&
        !(row.runtime && row.runtime.aliasOfSiteId);
    });
  }
  function projectsFor(host) {
    var state = gameState(), rows = state.resource && state.resource[host] &&
      state.resource[host].industrialNetwork && state.resource[host].industrialNetwork.projects;
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return row && row.projectId && number(row.costUsd) > 0 &&
        !['CANCELLED', 'FAILED'].includes(String(row.status || '').toUpperCase());
    });
  }
  function selectedOption(value, current) { return String(value) === String(current) ? ' selected' : ''; }
  function options(rows, current, placeholder) {
    return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') + rows.map(function (row) {
      return '<option value="' + esc(row.value) + '"' + selectedOption(row.value, current) + '>' + esc(row.label) + '</option>';
    }).join('');
  }
  function projectTypeLabel(value) {
    return ({ FACTORY: 'Factory construction', MINE: 'Mine construction', INFRASTRUCTURE: 'Infrastructure', EXISTING_PROJECT: 'Existing project capital' })[value] || value;
  }
  function instrumentLabel(value) {
    return ({ EQUITY: 'Equity investment', JOINT_VENTURE: 'Government joint venture', LOAN: 'Sovereign project loan', GRANT: 'Development grant', DOMESTIC_PUBLIC_CAPEX: 'Domestic public capital expenditure' })[value] || value;
  }
  function statusLabel(value) { return String(value || 'UNKNOWN').replace(/_/g, ' ').toLowerCase().replace(/\\b\\w/g, function (x) { return x.toUpperCase(); }); }
  function sectorLabel(proposal) {
    var type = String(proposal && proposal.projectType || '').toUpperCase();
    if (type === 'FACTORY') {
      var profile = catalog().factoryProfiles && catalog().factoryProfiles[proposal.factoryType];
      return 'Factory · ' + String(profile && (profile.displayName || profile.name) || proposal.factoryType || 'Unspecified').replace(/_/g, ' ');
    }
    if (type === 'MINE') {
      var site = sitesFor(proposal.hostCountryId).find(function (x) { return String(x.siteId || x.id) === String(proposal.siteId); });
      return 'Mining · ' + String(site && (site.siteName || site.name) || proposal.siteId || 'Unspecified');
    }
    if (type === 'INFRASTRUCTURE') return 'Infrastructure · ' + String(proposal.infrastructureType || 'Unspecified').replace(/_/g, ' ');
    if (type === 'EXISTING_PROJECT') return 'Existing project · ' + String(proposal.existingProjectId || proposal.projectId || 'Unspecified');
    return projectTypeLabel(type);
  }
  function relationshipSnapshot(investor, host) {
    var state = gameState(), foreign = state.foreign || {};
    var a = foreign[host] && foreign[host].relations && foreign[host].relations[investor];
    var b = foreign[investor] && foreign[investor].relations && foreign[investor].relations[host];
    var row = a || b || null;
    if (!row) return { score: null, status: 'RELATIONSHIP_DATA_UNAVAILABLE' };
    if (row.war_state === true || row.sanctions === true) return { score: 0, status: row.war_state ? 'WAR' : 'SANCTIONS' };
    var fields = [['overall', .35], ['trade', .35], ['trust', .20], ['political', .10]];
    var total = 0, weight = 0;
    fields.forEach(function (item) { var value = number(row[item[0]]); if (value !== null) { total += (value > 1 ? value / 100 : value) * item[1]; weight += item[1]; } });
    return { score: weight ? Math.round(total / weight * 100) : null, status: weight ? 'OBSERVED' : 'RELATIONSHIP_SCORE_UNAVAILABLE' };
  }
  function proposalCard(proposal, incoming, editable) {
    var investor = proposal.investorCountryId, host = proposal.hostCountryId;
    var remaining = Math.max(0, (number(proposal.amountUsd) || 0) - (number(proposal.capitalAppliedUsd) || 0));
    var projectCost = number(proposal.projectCostUsd), investorContribution = number(proposal.amountUsd);
    var hostContribution = number(proposal.hostTreasuryCoFundingUsd);
    if (hostContribution === null && projectCost !== null && investorContribution !== null)
      hostContribution = Math.max(0, projectCost - investorContribution);
    var relation = relationshipSnapshot(investor, host);
    var profitStatus = proposal.forecast && proposal.forecast.status || 'PROJECT_LEVEL_REVENUE_AND_OPERATING_COST_EVIDENCE_REQUIRED';
    var html = '<article class="ogiv-card"><div class="ogiv-card-head"><div><strong>' +
      esc(investor + ' → ' + host) +
      '</strong><span>' + esc(sectorLabel(proposal)) + ' · ' + esc(instrumentLabel(proposal.instrument)) +
      '</span></div><b class="ogiv-status">' + esc(statusLabel(proposal.status)) + '</b></div>' +
      '<div class="ogiv-facts"><div><small>Total project investment cost</small><strong>' + money(projectCost === null ? investorContribution : projectCost, 'USD') +
      '</strong></div><div><small>Investor contribution</small><strong>' + money(investorContribution, 'USD') +
      '</strong></div><div><small>Host contribution</small><strong>' + money(hostContribution, 'USD') +
      '</strong></div><div><small>Expected annual revenue</small><strong>' + (number(proposal.forecast && proposal.forecast.expectedAnnualRevenueUsd) === null ? 'Not yet evidenced' : money(proposal.forecast.expectedAnnualRevenueUsd, 'USD')) +
      '</strong></div><div><small>Expected annual operating cost</small><strong>' + (number(proposal.forecast && proposal.forecast.expectedAnnualOperatingCostUsd) === null ? 'Not yet evidenced' : money(proposal.forecast.expectedAnnualOperatingCostUsd, 'USD')) +
      '</strong></div><div><small>Expected annual net profit</small><strong>' + (number(proposal.forecast && proposal.forecast.expectedAnnualReturnUsd) === null ? 'Not yet evidenced' : money(proposal.forecast.expectedAnnualReturnUsd, 'USD')) +
      '</strong></div><div><small>ROI / payback</small><strong>' + (number(proposal.forecast && proposal.forecast.expectedReturnPct) === null ? 'Unavailable' : number(proposal.forecast.expectedReturnPct).toFixed(2) + '%') +
      ' · ' + (number(proposal.forecast && proposal.forecast.paybackYears) === null ? 'N/A' : proposal.forecast.paybackYears + ' years') +
      '</strong></div><div><small>Ownership / duration</small><strong>' +
      (number(proposal.equityShareBps) ? esc((proposal.equityShareBps / 100).toFixed(2) + '%') : 'No equity') + ' · ' +
      (number(proposal.durationYears) === 0 ? 'No fixed term' : (number(proposal.durationYears) === null ? 'N/A' : esc(proposal.durationYears + ' years'))) +
      '</strong></div><div><small>Current bilateral relationship</small><strong>' +
      (relation.score === null ? 'Unavailable' : relation.score + ' / 100') + ' · ' + esc(statusLabel(relation.status)) + '</strong></div><div><small>Relationship impact</small><strong>Awaiting diplomatic decision</strong></div></div>';
    html += '<p class="ogiv-note">Profit status: ' + esc(statusLabel(profitStatus)) +
      '. Profit, ROI and payback are not fabricated; they require verified project sales revenue and operating-cost evidence.</p>';
    if (proposal.hostAmountLocal !== null && proposal.hostCurrencyCode)
      html += '<p class="ogiv-note">Host settlement: ' + money(proposal.hostAmountLocal, proposal.hostCurrencyCode) +
        ' at proposal-time FX. The exchange-rate snapshot is preserved.</p>';
    if (proposal.projectFailure) html += '<p class="ogiv-warning">Project resolution: ' + esc(proposal.projectFailure.reason || proposal.projectFailure.status) + '</p>';
    if (remaining > 0.01) html += '<p class="ogiv-note">Unspent restricted amount: ' + money(remaining, 'USD') + '. It is not project expenditure until an approved CAPEX release is recorded.</p>';
    if (incoming && editable && ['PENDING_HOST_APPROVAL', 'PENDING_HOST_REVIEW'].includes(proposal.status)) {
      html += '<div class="ogiv-actions"><button type="button" data-gov-invest-action="accept" data-proposal-id="' + esc(proposal.proposalId) + '">Approve & fund</button>' +
        '<button type="button" class="is-secondary" data-gov-invest-action="decline" data-proposal-id="' + esc(proposal.proposalId) + '">Decline</button></div>';
    } else if (incoming && editable && remaining > 0.01 && ['FUNDED_AWAITING_PROJECT_RESOLUTION', 'PROJECT_STARTED'].includes(proposal.status)) {
      html += '<div class="ogiv-actions"><button type="button" class="is-secondary" data-gov-invest-action="refund" data-proposal-id="' +
        esc(proposal.proposalId) + '" data-investor-country="' + esc(investor) + '">Return unused funds</button></div>';
    }
    return html + '</article>';
  }
  function investmentCard(row) {
    var position = row.position || {}, project = row.project || {}, lifecycle = row.lifecycle || {};
    var projectType = String(project.projectType || position.projectType || 'Project').replace(/_/g, ' ');
    var deployed = number(position.investedCapitalUsd), hostContribution = number(position.hostContributionUsd);
    var profit = number(position.realizedNetProfitUsd);
    return '<article class="ogiv-card"><div class="ogiv-card-head"><div><strong>' +
      esc((position.investorCountryId || 'N/A') + ' → ' + row.hostCountryId) + '</strong><span>' +
      esc(projectType + ' · ' + (project.factoryType || project.infrastructureType || project.siteId || project.projectId || row.projectId || '')) +
      '</span></div><b class="ogiv-status">' + esc(statusLabel(row.projectStatus)) + '</b></div>' +
      '<div class="ogiv-facts"><div><small>Investor capital deployed</small><strong>' + money(deployed, 'USD') +
      '</strong></div><div><small>Host co-investment</small><strong>' + money(hostContribution, 'USD') +
      '</strong></div><div><small>Verified realized net profit</small><strong>' + (profit === null ? 'Not yet recorded' : money(profit, 'USD')) +
      '</strong></div><div><small>Ownership</small><strong>' + (number(position.equityShareBps) ? esc((position.equityShareBps / 100).toFixed(2) + '%') : 'No equity') +
      '</strong></div></div>' +
      '<p class="ogiv-note">Investment ID: ' + esc(row.investmentId || position.investmentId || 'Legacy record') +
      ' · Lifecycle: ' + esc(statusLabel(lifecycle.stage || row.projectStatus)) +
      (number(lifecycle.progressPct) === null ? '' : ' · Construction progress: ' + esc((lifecycle.progressPct * 100).toFixed(1)) + '%') +
      '</p><p class="ogiv-note">Profit distributions and ROI require posted project-linked financial evidence. Missing operating costs or sales data remain unavailable, not zero.</p></article>';
  }
  function loanCard(loan) {
    return '<article class="ogiv-mini-card"><strong>' + esc(loan.loanId) + '</strong><span>' +
      esc(loan.ownerRole || 'Loan') + ' · ' + esc(statusLabel(loan.status)) + '</span><small>Outstanding principal: ' +
      money(loan.principalOutstandingUsd, 'USD') + ' · Annual interest: ' +
      (number(loan.annualInterestRateBps) === null ? 'N/A' : esc((loan.annualInterestRateBps / 100).toFixed(2) + '%')) +
      ' · Next due turn: ' + esc(loan.nextDueTurn == null ? 'N/A' : loan.nextDueTurn) + '</small></article>';
  }
  function render(country, editable, notice) {
    var api = runtime();
    if (!api) return '<section class="ofm-section"><h3>Government Investment</h3><p class="ofm-warning">Sovereign investment runtime has not loaded.</p></section>';
    try { api.init().catch(function () {}); } catch (_) {}
    var budget = editable ? api.getBudget(country) : null;
    var portfolio = api.getPortfolio(country) || { inboundProposals: [], outboundProposals: [], fundingRequests: [], investments: [], loans: [] };
    var risk = api.getRiskSnapshot(country) || {};
    var fx = fxFor(country);
    var countryRows = profiles();
    var countryOptions = options(countryRows.map(function (p) { return { value: p.code, label: p.name + ' (' + p.code + ')' }; }), country, null);
    var foreignInvestorOptions = options(countryRows.filter(function (p) { return p.code !== country; }).map(function (p) {
      return { value: p.code, label: p.name + ' (' + p.code + ')' };
    }), '', 'Select a foreign government');
    var factoryProfiles = catalog().factoryProfiles || {};
    var factoryOptions = options(Object.keys(factoryProfiles).sort().map(function (key) {
      return { value: key, label: String(factoryProfiles[key].displayName || factoryProfiles[key].name || key).replace(/_/g, ' ') };
    }), '', 'Select an existing factory type');
    var html = '<style data-ogiv-style>.ogiv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.ogiv-stat,.ogiv-card,.ogiv-form{border:1px solid var(--border-color,rgba(128,128,128,.25));border-radius:12px;padding:12px;min-width:0}.ogiv-stat small,.ogiv-card small,.ogiv-mini-card small{display:block;color:var(--text-secondary,#8b929c);font-size:12px}.ogiv-stat strong{display:block;font-size:19px;margin-top:5px;overflow-wrap:anywhere}.ogiv-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ogiv-form{display:grid;gap:12px}.ogiv-form label{display:grid;gap:5px;font-size:13px}.ogiv-form input,.ogiv-form select{width:100%;min-width:0;padding:10px;border:1px solid var(--border-color,rgba(128,128,128,.3));border-radius:8px;background:var(--surface-primary,transparent);color:inherit}.ogiv-form .ogiv-actions,.ogiv-actions{display:flex;gap:8px;flex-wrap:wrap}.ogiv-actions button{padding:9px 13px;border:0;border-radius:8px;background:var(--accent,#2674df);color:white}.ogiv-actions button.is-secondary{background:var(--surface-tertiary,#555);color:inherit}.ogiv-card{margin:9px 0}.ogiv-card-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.ogiv-card-head strong,.ogiv-card-head span{display:block}.ogiv-card-head span,.ogiv-note{font-size:12px;color:var(--text-secondary,#8b929c);margin-top:4px}.ogiv-status{font-size:11px;padding:5px 7px;border-radius:6px;background:var(--surface-tertiary,rgba(128,128,128,.15));white-space:nowrap}.ogiv-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.ogiv-facts strong{display:block;font-size:13px;overflow-wrap:anywhere}.ogiv-actions{margin-top:10px}.ogiv-warning{color:#d18b29;font-size:13px}.ogiv-mini-card{padding:9px 0;border-bottom:1px solid var(--border-color,rgba(128,128,128,.2))}.ogiv-mini-card strong,.ogiv-mini-card span{display:block}.ogiv-form[aria-busy=true]{opacity:.65;pointer-events:none}@media(max-width:540px){.ogiv-grid-2{grid-template-columns:1fr}.ogiv-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>';
    html += '<section class="ofm-section"><div class="ofm-section-heading"><h3>Government Investment & International Development</h3><span>Domestic public capital · sovereign FDI · joint ventures · loans · grants</span></div>';
    if (notice) html += '<div class="ofm-notice ' + (notice.ok ? 'is-ok' : 'is-error') + '" role="status">' + esc(notice.message) + '</div>';
    html += '<p class="ofm-data-note">Governments invest from their own Treasury. The host must approve foreign proposals. Each project uses its existing construction and production lifecycle; no automatic jobs, output or profit are created.</p>';
    if (editable && budget && budget.status === 'READY') {
      var localMax = fx.rate === null ? null : budget.maximumPerProjectUsd * fx.rate;
      html += '<div class="ogiv-grid"><div class="ogiv-stat"><small>Available investment budget · USD</small><strong>' + money(budget.availableInvestmentBudgetUsd, 'USD') + '</strong></div>' +
        '<div class="ogiv-stat"><small>Maximum per new project · USD</small><strong>' + money(budget.maximumPerProjectUsd, 'USD') + '</strong></div>' +
        '<div class="ogiv-stat"><small>Protected Treasury reserve · USD</small><strong>' + money(budget.protectedReserveUsd, 'USD') + '</strong></div>' +
        '<div class="ogiv-stat"><small>Approx. local maximum · ' + esc(fx.currency) + '</small><strong>' + (localMax === null ? 'FX unavailable' : money(localMax, fx.currency)) + '</strong></div></div>';
      html += '<p class="ogiv-note">Budget is calculated after the country’s protected reserve and mandatory debt service. Per-project concentration is capped at 35% of the available investment budget. FX values are proposal-time snapshots.</p>';
    } else if (editable) html += '<p class="ogiv-warning">Treasury budget or reserve evidence is unavailable. New proposals are disabled until Finance data is ready.</p>';
    if (!editable) html += '<p class="ogiv-note">Read-only country portfolio. Investment actions are available only for the active player country.</p>';
    if (editable) {
      html += '<form class="ogiv-form" data-gov-invest-form><h4>Create a government investment proposal</h4>' +
        '<div class="ogiv-grid-2"><label>Host country<select name="hostCountryId" data-gov-host-country>' + countryOptions + '</select></label>' +
        '<label>Investment sector<select name="projectType" data-gov-project-type required>' +
        '<option value="FACTORY">Factory construction</option><option value="MINE">Mine construction</option>' +
        '<option value="INFRASTRUCTURE">Infrastructure</option><option value="EXISTING_PROJECT">Existing project capital</option></select></label></div>' +
        '<div class="ogiv-grid-2"><label>Investment amount (' + esc(fx.currency) + ')<input type="number" name="amount" min="0.01" step="0.01" required placeholder="Amount in investor currency"></label>' +
        '<label>Financial instrument<select name="instrument" data-gov-instrument><option value="EQUITY">Equity investment</option><option value="JOINT_VENTURE">Government joint venture</option><option value="LOAN">Sovereign project loan</option><option value="GRANT">Development grant</option></select></label></div>' +
        '<div class="ogiv-grid-2" data-gov-field="equity"><label>Ownership share (%)<input name="equitySharePct" type="number" min="1" max="75" step="0.1" value="20"></label>' +
        '<label>Investment duration (years)<input name="durationYears" type="number" min="1" max="30" step="1" value="5"></label></div>' +
        '<div class="ogiv-grid-2" data-gov-field="loan"><label>Annual loan interest (%)<input name="interestPct" type="number" min="0" max="20" step="0.1" value="5"></label>' +
        '<label>Grace period (years)<input name="gracePeriodYears" type="number" min="0" max="5" step="1" value="1"></label></div>' +
        '<div data-gov-field="factory"><label>Factory category<select name="factoryType">' + factoryOptions + '</select></label><p class="ogiv-note">The factory catalog construction cost remains in its canonical game unit; no USD conversion is assumed. This contribution is recorded separately.</p></div>' +
        '<div data-gov-field="mine"><div class="ogiv-grid-2"><label>Canonical mine site<select name="siteId" data-gov-site><option value="">Select a mine site in the host country</option></select></label>' +
        '<label>Mine quantity<input name="quantity" type="number" min="1" max="100" step="1" value="1"></label></div>' +
        '<label>Assigned workers<input name="assignedWorkers" type="number" min="1" step="1" value="50"></label></div>' +
        '<div data-gov-field="infrastructure"><div class="ogiv-grid-2"><label>Infrastructure type<input name="infrastructureType" placeholder="Road, rail, port, pipeline, grid"></label>' +
        '<label>Construction duration (game days)<input name="buildDays" type="number" min="1" step="1" value="180"></label></div>' +
        '<div class="ogiv-grid-2"><label>Distance (km)<input name="distanceKm" type="number" min="0" step="0.1"></label>' +
        '<label>Capacity per day<input name="capacityPerDay" type="number" min="1" step="1"></label></div></div>' +
        '<div data-gov-field="existing"><label>Existing host project<select name="existingProjectId" data-gov-existing-project><option value="">Select a project with USD CAPEX evidence</option></select></label>' +
        '<p class="ogiv-note">Existing-project funding is earmarked as working capital. It does not claim additional capacity or production until a project operating runtime consumes it.</p></div>' +
        '<div class="ogiv-actions"><button type="submit" data-gov-submit>Review & submit proposal</button></div>' +
        '<p class="ogiv-note">The system checks Treasury reserves, debt service, FX, project readiness, materials and the host project. Foreign investment requires host approval; a domestic proposal uses public CAPEX rather than foreign ownership.</p></form>';
    }
    html += '<section class="ofm-section"><div class="ofm-section-heading"><h3>Incoming government proposals</h3><span>Foreign governments seeking to invest in this country</span></div>';
    html += portfolio.inboundProposals.length ? portfolio.inboundProposals.map(function (p) { return proposalCard(p, true, editable); }).join('') :
      '<p class="ofm-empty">No pending incoming government proposals.</p></section>';
    html += '<section class="ofm-section"><div class="ofm-section-heading"><h3>Outbound government proposals</h3><span>Public capital proposed or deployed abroad</span></div>';
    html += portfolio.outboundProposals.length ? portfolio.outboundProposals.slice().reverse().map(function (p) { return proposalCard(p, false, editable); }).join('') :
      '<p class="ofm-empty">No outbound government proposals.</p></section>';
    html += '<section class="ofm-section"><div class="ofm-section-heading"><h3>Request investment from another government</h3><span>Ask one selected foreign government to finance a project in this country</span></div>';
    if (editable) {
      var requestFactoryOptions = options(Object.keys(factoryProfiles).sort().map(function (key) {
        return { value: key, label: String(factoryProfiles[key].displayName || factoryProfiles[key].name || key).replace(/_/g, ' ') };
      }), '', 'Select a factory type');
      var requestMineOptions = options(sitesFor(country).map(function (site) {
        var siteId = site.siteId || site.id;
        var resource = site.resourceId || site.real && site.real.resourceId || site.identity && site.identity.resourceTypeId || 'Resource';
        return { value: siteId, label: (site.siteName || site.name || siteId) + ' · ' + resource };
      }), '', 'Select a mine site');
      html += '<form class="ogiv-form" data-gov-funding-request-form><div class="ogiv-grid-2">' +
        '<label>Target government<select name="targetInvestorCountryId" required>' + foreignInvestorOptions + '</select></label>' +
        '<label>Project type<select name="projectType" data-gov-request-project-type required><option value="FACTORY">Factory</option><option value="MINE">Mine</option><option value="INFRASTRUCTURE">Infrastructure</option></select></label></div>' +
        '<div class="ogiv-grid-2"><label>Funding requested (USD)<input name="amountUsd" type="number" min="0.01" step="0.01" required></label>' +
        '<label>Proposed instrument<select name="instrument"><option value="JOINT_VENTURE">Government joint venture</option><option value="EQUITY">Equity investment</option><option value="LOAN">Sovereign project loan</option><option value="GRANT">Development grant</option></select></label></div>' +
        '<div class="ogiv-grid-2" data-gov-request-field="equity"><label>Proposed equity share (%)<input name="equitySharePct" type="number" min="1" max="75" step="0.1" value="25"></label>' +
        '<label>Duration (years)<input name="durationYears" type="number" min="1" max="30" value="5"></label></div>' +
        '<div class="ogiv-grid-2" data-gov-request-field="loan"><label>Annual interest (%)<input name="interestPct" type="number" min="0" max="20" step="0.1" value="5"></label>' +
        '<label>Grace period (years)<input name="gracePeriodYears" type="number" min="0" max="5" value="1"></label></div>' +
        '<label data-gov-request-field="factory">Factory type<select name="factoryType">' + requestFactoryOptions + '</select></label>' +
        '<div class="ogiv-grid-2" data-gov-request-field="mine"><label>Mine site<select name="siteId">' + requestMineOptions + '</select></label>' +
        '<label>Mine quantity<input name="quantity" type="number" min="1" max="100" step="1" value="1"></label><label>Assigned workers<input name="assignedWorkers" type="number" min="1" step="1" value="50"></label></div>' +
        '<div data-gov-request-field="infrastructure"><div class="ogiv-grid-2"><label>Infrastructure type<input name="infrastructureType" placeholder="Road, rail, port, pipeline"></label>' +
        '<label>Construction duration (game days)<input name="buildDays" type="number" min="1" step="1" value="180"></label>' +
        '<label>Distance (km)<input name="distanceKm" type="number" min="0" step="0.1"></label>' +
        '<label>Capacity per day<input name="capacityPerDay" type="number" min="1" step="1"></label></div></div>' +
        '<label>Project purpose (optional)<input name="projectDescription" maxlength="240" placeholder="Explain why the country needs this investment"></label>' +
        '<div class="ogiv-actions"><button type="submit" data-gov-funding-submit>Send investment request</button></div>' +
        '<p class="ogiv-note">Sending a request does not transfer funds. The target government screens its own Treasury and macroeconomic risk, then may issue a formal offer. This country must approve the offer before money is reserved or transferred.</p></form>';
    }
    html += portfolio.fundingRequests && portfolio.fundingRequests.length ? portfolio.fundingRequests.slice().reverse().map(function (request) {
      return '<article class="ogiv-mini-card"><strong>' + esc(request.targetInvestorCountryId) + ' · ' + money(request.amountUsd, 'USD') + '</strong><span>' +
        esc(statusLabel(request.status)) + ' · ' + esc(projectTypeLabel(request.projectType)) + '</span><small>Investment ID: ' +
        esc(request.investmentId) + (request.proposalId ? ' · Offer: ' + esc(request.proposalId) : '') +
        (request.lastReviewReason ? ' · ' + esc(request.lastReviewReason) : '') + '</small></article>';
    }).join('') : '<p class="ofm-empty">No government funding requests.</p>';
    html += '</section>';
    html += '<section class="ofm-section"><div class="ofm-section-heading"><h3>Government investment positions</h3><span>Project-linked sovereign capital and ownership</span></div>';
    html += portfolio.investments.length ? portfolio.investments.map(investmentCard).join('') :
      '<p class="ofm-empty">No government investment positions recorded.</p></section>';
    html += '<section class="ofm-section"><div class="ofm-section-heading"><h3>Sovereign loan book</h3><span>Quarterly repayment and arrears tracking</span></div>';
    html += portfolio.loans.length ? portfolio.loans.map(loanCard).join('') : '<p class="ofm-empty">No sovereign investment loans.</p>';
    html += '<p class="ogiv-note">Return estimates remain unavailable until project-level realized net-profit evidence is recorded. Loan payments follow their contract and can enter arrears if the borrower Treasury cannot pay.</p></section>';
    html += '</section>';
    if (editable) html += '<script type="application/json" data-ogiv-country>' + esc(country) + '</script>';
    return html;
  }
  function refreshFundingRequestForm(form) {
    if (!form || !form.querySelector) return;
    var type = String(form.querySelector('[data-gov-request-project-type]')?.value || 'FACTORY').toUpperCase();
    var instrument = String(form.querySelector('[name="instrument"]')?.value || 'JOINT_VENTURE').toUpperCase();
    Array.prototype.forEach.call(form.querySelectorAll('[data-gov-request-field]'), function (node) {
      var field = node.getAttribute('data-gov-request-field');
      var visible = field === 'factory' ? type === 'FACTORY' : field === 'mine' ? type === 'MINE' :
        field === 'infrastructure' ? type === 'INFRASTRUCTURE' :
        field === 'equity' ? ['EQUITY','JOINT_VENTURE'].includes(instrument) : field === 'loan' ? instrument === 'LOAN' : true;
      node.hidden = !visible;
    });
  }
  function refreshForm(form, investorCountry) {
    if (!form || !form.querySelector) return;
    var hostNode = form.querySelector('[data-gov-host-country]');
    var host = String(hostNode && hostNode.value || investorCountry).toUpperCase();
    var typeNode = form.querySelector('[data-gov-project-type]');
    var type = String(typeNode && typeNode.value || 'FACTORY').toUpperCase();
    var instrument = form.querySelector('[data-gov-instrument]');
    if (instrument) {
      var isDomestic = host === String(investorCountry).toUpperCase();
      var choices = isDomestic ? [['DOMESTIC_PUBLIC_CAPEX', 'Domestic public capital expenditure']] :
        [['EQUITY', 'Equity investment'], ['JOINT_VENTURE', 'Government joint venture'],
          ['LOAN', 'Sovereign project loan'], ['GRANT', 'Development grant']];
      var prior = instrument.value;
      instrument.innerHTML = choices.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join('');
      instrument.value = choices.some(function (x) { return x[0] === prior; }) ? prior : choices[0][0];
    }
    Array.prototype.forEach.call(form.querySelectorAll('[data-gov-field]'), function (node) {
      var field = node.getAttribute('data-gov-field');
      var show = field === 'equity' ? ['EQUITY', 'JOINT_VENTURE'].includes(instrument && instrument.value) :
        field === 'loan' ? instrument && instrument.value === 'LOAN' :
        field === 'factory' ? type === 'FACTORY' :
        field === 'mine' ? type === 'MINE' :
        field === 'infrastructure' ? type === 'INFRASTRUCTURE' :
        field === 'existing' ? type === 'EXISTING_PROJECT' : true;
      node.hidden = !show;
    });
    var siteNode = form.querySelector('[data-gov-site]');
    if (siteNode) {
      var currentSite = siteNode.value;
      var sites = sitesFor(host).map(function (site) {
        var siteId = site.siteId || site.id;
        var resource = site.resourceId || site.real && site.real.resourceId ||
          site.identity && site.identity.resourceTypeId || 'Resource';
        var label = site.siteName || site.name || siteId;
        return { value: siteId, label: label + ' · ' + resource };
      });
      siteNode.innerHTML = options(sites, currentSite, 'Select a mine site in the host country');
    }
    var projectNode = form.querySelector('[data-gov-existing-project]');
    if (projectNode) {
      var currentProject = projectNode.value;
      projectNode.innerHTML = options(projectsFor(host).map(function (project) {
        return { value: project.projectId, label: (project.projectName || project.projectId) + ' · ' +
          statusLabel(project.status) + ' · ' + money(project.costUsd, 'USD') };
      }), currentProject, 'Select a project with USD CAPEX evidence');
    }
  }
  async function submit(form, investorCountry) {
    var api = runtime();
    if (!api || !form) return { status: 'BLOCKED', reason: 'GOVERNMENT_INVESTMENT_RUNTIME_UNAVAILABLE' };
    var values = {};
    Array.prototype.forEach.call(form.elements || [], function (el) { if (el.name) values[el.name] = el.value; });
    var fx = fxFor(investorCountry);
    var amount = number(values.amount);
    if (amount === null || amount <= 0) return { status: 'BLOCKED', reason: 'INVESTMENT_AMOUNT_INVALID' };
    var instrument = String(values.instrument || '').toUpperCase();
    var payload = {
      investorCountryId: investorCountry,
      hostCountryId: String(values.hostCountryId || '').toUpperCase(),
      actorType: 'PLAYER',
      requestId: 'GOVUI:' + investorCountry + ':' + String((g.Game && g.Game.state && g.Game.state.simulation && g.Game.state.simulation.turn) || 0) + ':' + Date.now().toString(36),
      amount: amount,
      projectType: String(values.projectType || '').toUpperCase(),
      instrument: instrument,
      durationYears: instrument === 'DOMESTIC_PUBLIC_CAPEX' || instrument === 'GRANT' ? 0 : number(values.durationYears),
      equityShareBps: ['EQUITY', 'JOINT_VENTURE'].includes(instrument) ? Math.round((number(values.equitySharePct) || 20) * 100) : 0,
      annualInterestRateBps: instrument === 'LOAN' ? Math.round((number(values.interestPct) || 0) * 100) : 0,
      gracePeriodYears: instrument === 'LOAN' ? number(values.gracePeriodYears) : 0,
      factoryType: values.factoryType || null,
      siteId: values.siteId || null,
      resourceId: null,
      quantity: number(values.quantity) || 1,
      assignedWorkers: number(values.assignedWorkers),
      infrastructureType: values.infrastructureType || null,
      distanceKm: number(values.distanceKm),
      capacityPerDay: number(values.capacityPerDay),
      buildDays: number(values.buildDays),
      existingProjectId: values.existingProjectId || null
    };
    if (fx.rate === null) return { status: 'BLOCKED', reason: 'INVESTOR_FX_RATE_UNAVAILABLE' };
    return api.submitProposal(payload);
  }
  async function requestInvestment(form, hostCountry) {
    var api = runtime();
    if (!api || !form) return { status: 'BLOCKED', reason: 'GOVERNMENT_INVESTMENT_RUNTIME_UNAVAILABLE' };
    var values = {};
    Array.prototype.forEach.call(form.elements || [], function (el) { if (el.name) values[el.name] = el.value; });
    var instrument = String(values.instrument || 'JOINT_VENTURE').toUpperCase();
    var amountUsd = number(values.amountUsd);
    if (amountUsd === null || amountUsd <= 0) return { status: 'BLOCKED', reason: 'GOVERNMENT_FUNDING_REQUEST_AMOUNT_INVALID' };
    return api.requestGovernmentInvestment({
      hostCountryId: hostCountry, targetInvestorCountryId: String(values.targetInvestorCountryId || '').toUpperCase(),
      requestId: 'GOVREQ:' + hostCountry + ':' + String(values.targetInvestorCountryId || '').toUpperCase() + ':' +
        String((gameState().simulation && gameState().simulation.turn) || 0) + ':' + Date.now().toString(36),
      amountUsd: amountUsd, projectType: String(values.projectType || 'FACTORY').toUpperCase(),
      instrument: instrument, durationYears: instrument === 'GRANT' ? 0 : number(values.durationYears),
      equityShareBps: ['EQUITY','JOINT_VENTURE'].includes(instrument) ? Math.round((number(values.equitySharePct) || 25) * 100) : 0,
      annualInterestRateBps: instrument === 'LOAN' ? Math.round((number(values.interestPct) || 0) * 100) : 0,
      gracePeriodYears: instrument === 'LOAN' ? number(values.gracePeriodYears) : 0,
      factoryType: values.factoryType || null, siteId: values.siteId || null,
      quantity: number(values.quantity) || 1, assignedWorkers: number(values.assignedWorkers),
      infrastructureType: values.infrastructureType || null, distanceKm: number(values.distanceKm),
      capacityPerDay: number(values.capacityPerDay), buildDays: number(values.buildDays),
      projectDescription: values.projectDescription || ''
    });
  }
  async function decide(action, proposalId, country) {
    var api = runtime();
    if (!api) return { status: 'BLOCKED', reason: 'GOVERNMENT_INVESTMENT_RUNTIME_UNAVAILABLE' };
    if (action === 'refund') {
      var portfolio = api.getPortfolio(country), proposal = (portfolio && portfolio.inboundProposals || []).find(function (x) { return x.proposalId === proposalId; });
      if (!proposal) {
        var outgoing = portfolio && portfolio.outboundProposals || [];
        proposal = outgoing.find(function (x) { return x.proposalId === proposalId; });
      }
      if (!proposal) return { status: 'BLOCKED', reason: 'GOVERNMENT_INVESTMENT_PROPOSAL_NOT_FOUND' };
      return api.refundInvestment({ hostCountryId: country, investorCountryId: proposal.investorCountryId, proposalId: proposalId });
    }
    return api.respondProposal({ hostCountryId: country, proposalId: proposalId, decision: action === 'accept' ? 'ACCEPT' : 'DECLINE' });
  }
  var API = Object.freeze({
    VERSION: VERSION, render: render, refreshForm: refreshForm, refreshFundingRequestForm: refreshFundingRequestForm,
    submit: submit, requestInvestment: requestInvestment, decide: decide
  });
  g.OmegaGovernmentInvestmentUIV1 = API;
  g.Omega = g.Omega || {};
  g.Omega.GovernmentInvestmentUIV1 = API;
})(typeof window !== 'undefined' ? window : globalThis);
