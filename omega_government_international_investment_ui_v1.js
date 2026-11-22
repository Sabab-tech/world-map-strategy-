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
        var code = countryCode(p), flag = null;
        try { flag = engine && typeof engine.flagFor === 'function' ? engine.flagFor(p.countryCode || code) : null; } catch (_) {}
        return { code: code, name: p.name || p.countryName || code, currency: p.currencyCode || p.currency || 'USD', flag: flag || '' };
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
      var country = String(row.countryId || row.countryCode || row.identity && row.identity.countryIso3 || row.sourceSiteRecord && row.sourceSiteRecord.countryCode || '').toUpperCase();
      var siteId = String(row.siteId || row.id || '');
      var resource = row.resourceId || row.real && row.real.resourceId || row.identity && row.identity.resourceTypeId;
      return country === host && siteId && resource &&
        !(row.runtime && row.runtime.aliasOfSiteId);
    });
  }
  function projectsFor(host) {
    var state = gameState(), rows = state.resource && state.resource[host] &&
      state.resource[host].industrialNetwork && state.resource[host].industrialNetwork.projects;
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return row && row.projectId && number(row.costUsd) > 0 &&
        ['UNDER_CONSTRUCTION', 'COMPLETED'].includes(String(row.status || '').toUpperCase());
    });
  }
  function opportunitiesFor(host, selectedSector) {
    host = String(host || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(host)) return { hostCountryId: '', projectTypes: [], sectors: [], factories: [], mines: [], projects: [] };
    var factoryProfiles = catalog().factoryProfiles || {};
    var factories = Object.keys(factoryProfiles).sort().map(function (key) {
      var profile = factoryProfiles[key] || {};
      return { value: key, label: String(profile.displayName || profile.name || key).replace(/_/g, ' '),
        category: String(profile.category || '').toUpperCase(),
        constructionCost: number(profile.constructionCost), costUnit: String(profile.unit || 'UNKNOWN'),
        recipeId: profile.defaultRecipeId || null };
    });
    var sector = String(selectedSector || '').toUpperCase();
    if (sector && !['MINING', 'INFRASTRUCTURE', 'EXISTING_PROJECT'].includes(sector))
      factories = factories.filter(function (row) { return row.category === sector; });
    var sectors = sectorsFor(host);
    var mines = sitesFor(host).map(function (site) {
      var siteId = site.siteId || site.id;
      return { value: siteId, label: site.siteName || site.name || siteId,
        resourceId: site.resourceId || site.real && site.real.resourceId ||
          site.identity && site.identity.resourceTypeId || null,
        region: site.location && (site.location.region || site.location.name) ||
          site.regionName || site.region || null };
    });
    var projects = projectsFor(host).map(function (project) {
      return { value: project.projectId, label: project.projectName || project.projectId,
        status: String(project.status || '').toUpperCase(), costUsd: number(project.costUsd) };
    });
    var types = [];
    if (factories.length) types.push({ value: 'FACTORY', label: 'Factory construction' });
    if (mines.length) types.push({ value: 'MINE', label: 'Mine construction · canonical sites' });
    types.push({ value: 'INFRASTRUCTURE', label: 'New infrastructure project' });
    if (projects.length) types.push({ value: 'EXISTING_PROJECT', label: 'Existing project capital' });
    if (sector === 'MINING') types = types.filter(function (row) { return row.value === 'MINE'; });
    else if (sector === 'INFRASTRUCTURE') types = types.filter(function (row) { return row.value === 'INFRASTRUCTURE'; });
    else if (sector === 'EXISTING_PROJECT') types = types.filter(function (row) { return row.value === 'EXISTING_PROJECT'; });
    else if (sector) types = types.filter(function (row) { return row.value === 'FACTORY'; });
    return { hostCountryId: host, projectTypes: types, sectors: sectors, factories: factories, mines: mines, projects: projects };
  }
  function selectedOption(value, current) { return String(value) === String(current) ? ' selected' : ''; }
  function options(rows, current, placeholder) {
    return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') + rows.map(function (row) {
      return '<option value="' + esc(row.value) + '"' + selectedOption(row.value, current) + '>' + esc(row.label) + '</option>';
    }).join('');
  }

  function sectorDisplayName(value) {
    return String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (x) { return x.toUpperCase(); });
  }
  function sectorsFor(host) {
    host = String(host || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(host)) return [];
    var factoryProfiles = catalog().factoryProfiles || {}, categories = {};
    Object.keys(factoryProfiles).forEach(function (key) {
      var category = String(factoryProfiles[key] && factoryProfiles[key].category || '').trim().toUpperCase();
      if (category) categories[category] = true;
    });
    var rows = Object.keys(categories).sort().map(function (category) {
      return { value: category, label: sectorDisplayName(category) };
    });
    if (sitesFor(host).length) rows.push({ value: 'MINING', label: 'Mining & Natural Resources' });
    rows.push({ value: 'INFRASTRUCTURE', label: 'Infrastructure' });
    if (projectsFor(host).length) rows.push({ value: 'EXISTING_PROJECT', label: 'Existing Projects' });
    return rows;
  }
  function projectTypeForSector(sector) {
    sector = String(sector || '').trim().toUpperCase();
    if (sector === 'MINING') return 'MINE';
    if (sector === 'INFRASTRUCTURE') return 'INFRASTRUCTURE';
    if (sector === 'EXISTING_PROJECT') return 'EXISTING_PROJECT';
    return sector ? 'FACTORY' : '';
  }
  function proposalSector(proposal) {
    var type = String(proposal && proposal.projectType || '').toUpperCase();
    if (type === 'FACTORY') {
      var profile = catalog().factoryProfiles && catalog().factoryProfiles[proposal.factoryType];
      return String(proposal.sector || profile && profile.category || '').toUpperCase();
    }
    if (type === 'MINE') return 'MINING';
    if (type === 'INFRASTRUCTURE') return 'INFRASTRUCTURE';
    if (type === 'EXISTING_PROJECT') return 'EXISTING_PROJECT';
    return '';
  }
  function estimateAcceptanceRate(investor, host, terms) {
    investor = String(investor || '').toUpperCase();
    host = String(host || '').toUpperCase();
    terms = terms || {};
    var state = gameState(), finance = state.finance || {}, seen = {}, decisions = [];
    [investor, host].forEach(function (country) {
      var bucket = finance[country], root = bucket && bucket.omegaFinance && bucket.omegaFinance.governmentInvestmentV1;
      (root && Array.isArray(root.proposals) ? root.proposals : []).forEach(function (proposal) {
        if (!proposal || !proposal.proposalId || seen[proposal.proposalId]) return;
        seen[proposal.proposalId] = true;
        if (proposal.investorCountryId !== investor || proposal.hostCountryId !== host) return;
        var outcome = String(proposal.hostDecision && proposal.hostDecision.decision || proposal.status || '').toUpperCase();
        var accepted = ['ACCEPT', 'ACCEPTED', 'APPROVED', 'PROJECT_STARTED', 'SETTLED'].includes(outcome);
        var declined = ['DECLINE', 'DECLINED', 'REJECT', 'REJECTED'].includes(outcome);
        if (!accepted && !declined) return;
        if (String(proposal.projectType || '').toUpperCase() !== String(terms.projectType || '').toUpperCase()) return;
        if (String(proposal.instrument || '').toUpperCase() !== String(terms.instrument || '').toUpperCase()) return;
        if (proposalSector(proposal) !== String(terms.sector || '').toUpperCase()) return;
        var priorAmount = number(proposal.amountUsd), currentAmount = number(terms.amountUsd);
        if (priorAmount === null || currentAmount === null || currentAmount <= 0 ||
            priorAmount < currentAmount * 0.8 || priorAmount > currentAmount * 1.25) return;
        var priorDuration = number(proposal.durationYears), currentDuration = number(terms.durationYears);
        if (priorDuration === null || currentDuration === null || Math.abs(priorDuration - currentDuration) > 2) return;
        var priorShare = number(proposal.equityShareBps) || 0, currentShare = number(terms.equityShareBps) || 0;
        if (Math.abs(priorShare - currentShare) > 750) return;
        var priorRate = number(proposal.annualInterestRateBps) || 0, currentRate = number(terms.annualInterestRateBps) || 0;
        if (Math.abs(priorRate - currentRate) > 200) return;
        decisions.push(accepted ? 1 : 0);
      });
    });
    var acceptedCount = decisions.reduce(function (sum, value) { return sum + value; }, 0);
    return {
      available: decisions.length >= 3,
      ratePct: decisions.length >= 3 ? Math.round(acceptedCount / decisions.length * 1000) / 10 : null,
      accepted: acceptedCount,
      rejected: decisions.length - acceptedCount,
      sampleSize: decisions.length,
      requiredSampleSize: 3,
      basis: 'OBSERVED_COMPARABLE_BILATERAL_GOVERNMENT_DECISIONS'
    };
  }
  function formValues(form) {
    var values = {};
    Array.prototype.forEach.call(form && form.elements || [], function (element) {
      if (element && element.name) values[element.name] = element.value;
    });
    return values;
  }
  function dealPreview(form, investorCountry, host, sector, type) {
    if (!host || !sector) return '<p class="ogiv-note">Choose a destination country and investment sector to calculate the deal preview.</p>';
    var values = formValues(form), instrument = String(values.instrument || 'LOAN').toUpperCase();
    var amountLocal = number(values.amount), fx = fxFor(investorCountry);
    var amountUsd = amountLocal !== null && amountLocal > 0 && fx.rate !== null ? amountLocal / fx.rate : null;
    var duration = instrument === 'GRANT' || instrument === 'DOMESTIC_PUBLIC_CAPEX' ? 0 : number(values.durationYears);
    var sharePct = number(values.equitySharePct), interestPct = number(values.interestPct);
    var shareBps = ['EQUITY', 'JOINT_VENTURE'].includes(instrument) ? Math.round((sharePct || 0) * 100) : 0;
    var interestBps = instrument === 'LOAN' ? Math.round((interestPct || 0) * 100) : 0;
    var history = estimateAcceptanceRate(investorCountry, host, {
      projectType: type, sector: sector, instrument: instrument, amountUsd: amountUsd,
      durationYears: duration, equityShareBps: shareBps, annualInterestRateBps: interestBps
    });
    var api = runtime(), risk = null;
    try { risk = api && typeof api.getRiskSnapshot === 'function' ? api.getRiskSnapshot(host) : null; } catch (_) {}
    var relation = relationshipSnapshot(investorCountry, host);
    var destination = profiles().find(function (row) { return row.code === host; });
    var amountText = amountUsd === null ? 'Enter an amount and confirm current FX' : money(amountUsd, 'USD');
    var profitHtml = '';
    if (instrument === 'LOAN' && amountUsd !== null && duration !== null && interestPct !== null) {
      var annualInterest = amountUsd * interestPct / 100;
      var totalInterest = annualInterest * duration;
      profitHtml = '<div><small>Estimated annual interest (' + interestPct + '%)</small><strong>' + money(annualInterest, 'USD') +
        '</strong></div><div><small>Total simple interest over term</small><strong>' + money(totalInterest, 'USD') +
        '</strong></div><div><small>Total principal + interest</small><strong>' + money(amountUsd + totalInterest, 'USD') +
        '</strong></div>';
    } else if (['EQUITY', 'JOINT_VENTURE'].includes(instrument)) {
      profitHtml = '<div><small>Ownership share</small><strong>' + (sharePct === null ? 'Select a share' : sharePct + '%') +
        '</strong></div><div><small>Profit entitlement</small><strong>Share of verified distributable profit</strong></div>';
    } else {
      profitHtml = '<div><small>Financial return</small><strong>Grant / public CAPEX — no repayment return</strong></div>';
    }
    var termHtml = '';
    var durationText = duration === null ? 'Select duration' : duration === 0 ? 'No fixed repayment term' : duration + ' years';
    var acceptanceHtml = history.available
      ? '<strong>' + history.ratePct + '%</strong><span>Observed acceptance: ' + history.accepted + ' accepted / ' +
        history.rejected + ' declined from ' + history.sampleSize + ' comparable deals</span>'
      : '<strong>Insufficient comparable history</strong><span>' + history.sampleSize + ' comparable final decisions recorded; ' +
        history.requiredSampleSize + ' required before a percentage is shown. No invented probability is used.</span>';
    var riskText = risk
      ? statusLabel(risk.riskStatus) + (number(risk.publicDebtToGdpPct) === null ? '' : ' · Public debt/GDP ' + number(risk.publicDebtToGdpPct).toFixed(1) + '%')
      : 'Country risk evidence unavailable';
    var relationText = relation.score === null ? statusLabel(relation.status) : relation.score.toFixed(1) + ' / 100';
    return '<div class="ogiv-preview-title"><strong>' + esc((destination && destination.flag ? destination.flag + ' ' : '') +
      (destination && destination.name || host)) + '</strong><span>' + esc(sectorDisplayName(sector)) + '</span></div>' +
      '<div class="ogiv-preview-grid"><div><small>Investment amount</small><strong>' + money(amountLocal, fx.currency) +
      ' · ' + amountText + '</strong></div><div><small>Deal structure</small><strong>' + esc(instrumentLabel(instrument)) +
      '</strong></div>' + termHtml + '<div><small>Duration</small><strong>' + esc(durationText) + '</strong></div>' +
      profitHtml + '<div><small>Host country risk</small><strong>' + esc(riskText) + '</strong></div>' +
      '<div><small>Bilateral relationship</small><strong>' + esc(relationText) + '</strong></div>' +
      '<div class="ogiv-acceptance"><small>Historical acceptance rate</small>' + acceptanceHtml + '</div></div>' +
      '<p class="ogiv-note">Financial figures are projections from the selected contract terms. Loan interest uses simple interest for this preview; actual loan servicing follows the signed schedule. Equity returns are not guaranteed and require recorded project profit. Historical acceptance uses only comparable, completed decisions for this exact country pair and similar terms.</p>';
  }
  function projectTypeLabel(value) {
    return ({ FACTORY: 'Factory construction', MINE: 'Mine construction', INFRASTRUCTURE: 'Infrastructure', EXISTING_PROJECT: 'Existing project capital' })[value] || value;
  }
  function instrumentLabel(value) {
    return ({ EQUITY: 'Equity investment', JOINT_VENTURE: 'Government joint venture', LOAN: 'Sovereign project loan', GRANT: 'Development grant', DOMESTIC_PUBLIC_CAPEX: 'Domestic public capital expenditure' })[value] || value;
  }
  function statusLabel(value) { return String(value || 'UNKNOWN').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (x) { return x.toUpperCase(); }); }
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
    var adjustments = foreign[host] && foreign[host].relationAdjustments && foreign[host].relationAdjustments[investor];
    if (!Array.isArray(adjustments)) adjustments = foreign[investor] && foreign[investor].relationAdjustments && foreign[investor].relationAdjustments[host];
    var delta = (Array.isArray(adjustments) ? adjustments : []).reduce(function (sum, item) { return sum + (number(item && item.delta) || 0); }, 0);
    var fields = [['overall', .35], ['trade', .35], ['trust', .20], ['political', .10]];
    var total = 0, weight = 0;
    fields.forEach(function (item) { var value = number(row[item[0]]); if (value !== null) { value = value > 1 ? value : value * 100; value = Math.max(0, Math.min(100, value + delta)); total += value * item[1]; weight += item[1]; } });
    return { score: weight ? Math.round(total / weight * 100) / 100 : null, delta: delta, status: weight ? 'OBSERVED' : 'RELATIONSHIP_SCORE_UNAVAILABLE' };
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
    var countryOptions = options(countryRows.map(function (p) {
      return { value: p.code, label: (p.flag ? p.flag + ' ' : '') + p.name + ' (' + p.code + ')' };
    }), '', 'Select destination country');
    var foreignInvestorOptions = options(countryRows.filter(function (p) { return p.code !== country; }).map(function (p) {
      return { value: p.code, label: (p.flag ? p.flag + ' ' : '') + p.name + ' (' + p.code + ')' };
    }), '', 'Select a foreign government');
    var factoryProfiles = catalog().factoryProfiles || {};
    var factoryOptions = options(Object.keys(factoryProfiles).sort().map(function (key) {
      return { value: key, label: String(factoryProfiles[key].displayName || factoryProfiles[key].name || key).replace(/_/g, ' ') };
    }), '', 'Select an existing factory type');
    var amountSliderMax = budget && budget.status === 'READY' && fx.rate !== null
      ? Math.max(1, Math.floor(budget.maximumPerProjectUsd * fx.rate)) : 1000000;
    var amountDefault = Math.min(10000, amountSliderMax);
    var amountSliderDefault = amountSliderMax > 1 ? Math.round(Math.log(Math.max(1, amountDefault)) / Math.log(amountSliderMax) * 1000) : 0;
    var html = '<style data-ogiv-style>.ogiv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.ogiv-stat,.ogiv-card,.ogiv-form{border:1px solid var(--border-color,rgba(128,128,128,.25));border-radius:12px;padding:12px;min-width:0}.ogiv-stat small,.ogiv-card small,.ogiv-mini-card small{display:block;color:var(--text-secondary,#8b929c);font-size:12px}.ogiv-stat strong{display:block;font-size:19px;margin-top:5px;overflow-wrap:anywhere}.ogiv-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ogiv-form{display:grid;gap:12px}.ogiv-form label{display:grid;gap:5px;font-size:13px}.ogiv-form input,.ogiv-form select{width:100%;min-width:0;padding:10px;border:1px solid var(--border-color,rgba(128,128,128,.3));border-radius:8px;background:var(--surface-primary,transparent);color:inherit}.ogiv-form .ogiv-actions,.ogiv-actions{display:flex;gap:8px;flex-wrap:wrap}.ogiv-actions button{padding:9px 13px;border:0;border-radius:8px;background:var(--accent,#2674df);color:white}.ogiv-actions button.is-secondary{background:var(--surface-tertiary,#555);color:inherit}.ogiv-card{margin:9px 0}.ogiv-card-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.ogiv-card-head strong,.ogiv-card-head span{display:block}.ogiv-card-head span,.ogiv-note{font-size:12px;color:var(--text-secondary,#8b929c);margin-top:4px}.ogiv-status{font-size:11px;padding:5px 7px;border-radius:6px;background:var(--surface-tertiary,rgba(128,128,128,.15));white-space:nowrap}.ogiv-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.ogiv-facts strong{display:block;font-size:13px;overflow-wrap:anywhere}.ogiv-actions{margin-top:10px}.ogiv-warning{color:#d18b29;font-size:13px}.ogiv-mini-card{padding:9px 0;border-bottom:1px solid var(--border-color,rgba(128,128,128,.2))}.ogiv-mini-card strong,.ogiv-mini-card span{display:block}.ogiv-form[aria-busy=true]{opacity:.65;pointer-events:none}@media(max-width:540px){.ogiv-grid-2{grid-template-columns:1fr}.ogiv-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}.ogiv-grid{align-items:stretch;margin:14px 0}.ogiv-stat{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(18,36,61,.96),rgba(10,20,36,.94));border-color:rgba(77,153,235,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 8px 22px rgba(0,0,0,.16)}.ogiv-stat:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,#55b7ff,#2874d8)}.ogiv-stat small{letter-spacing:.045em;text-transform:uppercase;font-size:10px}.ogiv-stat strong{color:#edf6ff;font-size:clamp(17px,2vw,23px);font-variant-numeric:tabular-nums}.ogiv-form{background:linear-gradient(150deg,rgba(18,31,51,.94),rgba(11,20,34,.96));border-color:rgba(100,155,213,.25);box-shadow:0 12px 28px rgba(0,0,0,.15);padding:clamp(13px,2vw,20px)}.ogiv-form h4{margin:0;color:#e8f3ff;font-size:16px;letter-spacing:.01em}.ogiv-form label{color:#c5d4e6;font-weight:600}.ogiv-form input,.ogiv-form select{background:rgba(5,13,25,.72);border-color:rgba(130,166,205,.3);min-height:42px;transition:border-color .16s ease,box-shadow .16s ease}.ogiv-form input:focus,.ogiv-form select:focus{outline:none;border-color:#55aaff;box-shadow:0 0 0 3px rgba(55,145,235,.16)}.ogiv-card{position:relative;background:linear-gradient(145deg,rgba(19,34,55,.96),rgba(11,21,36,.97));border-color:rgba(93,150,211,.25);box-shadow:0 8px 20px rgba(0,0,0,.14);padding:15px;transition:border-color .16s ease,transform .16s ease}.ogiv-card:hover{border-color:rgba(85,170,255,.48);transform:translateY(-1px)}.ogiv-card-head{align-items:center;padding-bottom:10px;border-bottom:1px solid rgba(125,160,197,.14)}.ogiv-card-head strong{color:#edf6ff;font-size:14px;letter-spacing:.01em}.ogiv-card-head span{color:#91a8c2;font-size:11px;line-height:1.45}.ogiv-status{background:rgba(52,125,198,.15);border:1px solid rgba(91,165,235,.24);color:#a9d6ff;font-weight:700;letter-spacing:.035em;text-transform:uppercase}.ogiv-facts{gap:8px;margin-top:12px}.ogiv-facts>div{min-width:0;padding:9px 10px;border:1px solid rgba(117,153,190,.13);border-radius:9px;background:rgba(5,14,27,.42)}.ogiv-facts small{font-size:9px;letter-spacing:.045em;text-transform:uppercase;color:#8ea6c1;line-height:1.35}.ogiv-facts strong{margin-top:4px;color:#e5f1ff;font-size:13px;line-height:1.4;font-variant-numeric:tabular-nums}.ogiv-note{color:#91a5bd;line-height:1.55}.ogiv-warning{padding:9px 11px;border:1px solid rgba(220,160,70,.28);border-radius:8px;background:rgba(150,94,24,.12);line-height:1.5}.ogiv-actions{gap:9px}.ogiv-actions button{min-height:40px;padding:10px 15px;border:1px solid rgba(112,181,255,.28);background:linear-gradient(135deg,#287bd0,#1856a0);font-weight:700;letter-spacing:.01em;box-shadow:0 4px 12px rgba(15,75,145,.2)}.ogiv-actions button:hover{filter:brightness(1.12)}.ogiv-actions button.is-secondary{border-color:rgba(151,170,194,.2);background:rgba(87,105,128,.2);color:#d2deeb;box-shadow:none}.ogiv-mini-card{padding:12px 2px;border-bottom-color:rgba(125,160,197,.16)}.ogiv-mini-card strong{color:#e6f2ff;font-size:13px}.ogiv-mini-card span{color:#a4b8cf;font-size:12px;margin-top:3px}.ogiv-form[hidden],.ogiv-form [hidden]{display:none!important}.ogiv-form[aria-busy=true]{filter:saturate(.65)}@media(min-width:900px){.ogiv-facts{grid-template-columns:repeat(3,minmax(0,1fr))}.ogiv-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:540px){.ogiv-grid-2{grid-template-columns:1fr}.ogiv-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.ogiv-card{padding:12px}.ogiv-card-head{align-items:flex-start}.ogiv-actions button{flex:1 1 130px}}@media(prefers-reduced-motion:reduce){.ogiv-card,.ogiv-form input,.ogiv-form select{transition:none}}.ogiv-opportunity-summary{display:grid;gap:5px;margin:11px 0;padding:12px;border:1px solid rgba(85,170,255,.24);border-radius:10px;background:rgba(7,19,34,.65);color:#b8cce2;font-size:12px;line-height:1.5}.ogiv-opportunity-summary strong{color:#edf6ff;font-size:14px}.ogiv-quote-ready{color:#8fd7b2;font-weight:700}.ogiv-opportunity-summary .ogiv-warning{margin-top:4px}.ogiv-form input[type=range]{padding:0;min-height:24px;accent-color:#55aaff;background:transparent;border:0;box-shadow:none}.ogiv-range-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(92px,132px);align-items:center;gap:10px}.ogiv-range-pair input[type=number]{min-height:38px}.ogiv-live-preview{margin:12px 0;padding:14px;border:1px solid rgba(85,170,255,.28);border-radius:12px;background:linear-gradient(145deg,rgba(11,27,47,.94),rgba(7,17,31,.95))}.ogiv-preview-title{display:flex;justify-content:space-between;gap:12px;align-items:center;padding-bottom:9px;border-bottom:1px solid rgba(125,160,197,.16)}.ogiv-preview-title strong{font-size:15px;color:#edf6ff}.ogiv-preview-title span{font-size:11px;color:#91a8c2;text-align:right}.ogiv-preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.ogiv-preview-grid>div{min-width:0;padding:9px;border:1px solid rgba(117,153,190,.13);border-radius:8px;background:rgba(5,14,27,.42)}.ogiv-preview-grid small,.ogiv-acceptance small{display:block;color:#8ea6c1;font-size:9px;letter-spacing:.04em;text-transform:uppercase}.ogiv-preview-grid strong{display:block;margin-top:4px;color:#e5f1ff;font-size:12px;overflow-wrap:anywhere}.ogiv-acceptance{grid-column:1/-1}.ogiv-acceptance strong{font-size:16px;color:#a9d6ff}.ogiv-acceptance span{display:block;margin-top:4px;color:#a8bbd0;font-size:11px}@media(max-width:540px){.ogiv-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ogiv-range-pair{grid-template-columns:minmax(0,1fr) 100px}}</style>';
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
      html += '<form class="ogiv-form" data-gov-invest-form><h4>Explore and configure a government investment</h4>' +
        '<p class="ogiv-note">Choose the country and sector yourself. The sector list comes from the canonical industrial catalogue and the selected country’s existing mine/project records.</p>' +
        '<div class="ogiv-grid-2"><label>Destination country<select name="hostCountryId" data-gov-host-country required>' + countryOptions + '</select></label>' +
        '<label>Investment sector<select name="sector" data-gov-sector required disabled>' + options([], '', 'Select destination first') + '</select></label></div>' +
        '<select name="projectType" data-gov-project-type hidden><option value="">Select a sector first</option></select>' +
        '<div class="ogiv-opportunity-summary" data-gov-opportunity-summary aria-live="polite">Select a destination country to browse available investment sectors.</div>' +
        '<div class="ogiv-grid-2"><label>Investment amount (' + esc(fx.currency) + ')<div class="ogiv-range-pair"><input type="range" data-gov-amount-slider min="0" max="1000" step="1" value="' + amountSliderDefault + '"' + (budget && budget.status === 'READY' && fx.rate !== null ? '' : ' disabled') + '><input type="number" name="amount" min="1" max="' + amountSliderMax + '" step="0.01" value="' + amountDefault + '" required placeholder="Amount"></div></label>' +
        '<label>Deal structure<select name="instrument" data-gov-instrument><option value="LOAN" selected>Sovereign project loan</option><option value="EQUITY">Equity investment</option><option value="JOINT_VENTURE">Government joint venture</option><option value="GRANT">Development grant</option></select></label></div>' +
        '<div class="ogiv-grid-2" data-gov-field="equity"><label>Ownership share (%)<div class="ogiv-range-pair"><input type="range" data-gov-share-slider min="1" max="75" step="1" value="20"><input name="equitySharePct" type="number" min="1" max="75" step="1" value="20"></div></label></div>' +
        '<div data-gov-field="loan"><div class="ogiv-grid-2"><label>Annual loan interest (%)<div class="ogiv-range-pair"><input type="range" data-gov-interest-slider min="0" max="20" step="0.1" value="10"><input name="interestPct" type="number" min="0" max="20" step="0.1" value="10"></div></label>' +
        '<label>Grace period (years)<input name="gracePeriodYears" type="number" min="0" max="5" step="1" value="1"></label></div></div>' +
        '<div class="ogiv-grid-2" data-gov-field="duration"><label>Investment duration<select name="durationYears"><option value="1" selected>1 year</option><option value="2">2 years</option><option value="3">3 years</option><option value="5">5 years</option><option value="10">10 years</option><option value="15">15 years</option><option value="20">20 years</option><option value="30">30 years</option></select></label></div>' +
        '<div data-gov-field="factory"><label>Factory category<select name="factoryType" data-gov-factory-type>' + factoryOptions + '</select></label><p class="ogiv-note">Factory construction remains country-level because the current Factory runtime does not accept a district, region or coordinate. Catalog construction cost keeps its declared unit; it is not converted to USD.</p></div>' +
        '<div data-gov-field="mine"><div class="ogiv-grid-2"><label>Canonical mine site<select name="siteId" data-gov-site><option value="">Select a mine site in the host country</option></select></label>' +
        '<label>Mine quantity<input name="quantity" type="number" min="1" max="100" step="1" value="1"></label></div>' +
        '<label>Assigned workers<input name="assignedWorkers" type="number" min="1" step="1" value="50"></label></div>' +
        '<div data-gov-field="infrastructure"><div class="ogiv-grid-2"><label>Infrastructure type<input name="infrastructureType" placeholder="Road, rail, port, pipeline, grid"></label>' +
        '<label>Construction duration (game days)<input name="buildDays" type="number" min="1" step="1" value="180"></label></div>' +
        '<div class="ogiv-grid-2"><label>Distance (km)<input name="distanceKm" type="number" min="0" step="0.1"></label>' +
        '<label>Capacity per day<input name="capacityPerDay" type="number" min="1" step="1"></label></div></div>' +
        '<div data-gov-field="existing"><label>Existing host project<select name="existingProjectId" data-gov-existing-project><option value="">Select a project with USD CAPEX evidence</option></select></label>' +
        '<p class="ogiv-note">Existing-project funding is earmarked as working capital. It does not claim additional capacity or production until a project operating runtime consumes it.</p></div>' +
        '<div class="ogiv-live-preview" data-gov-live-preview aria-live="polite">Select a destination and sector to preview the deal.</div>' +
        '<div class="ogiv-actions"><button type="submit" data-gov-submit>Review & submit proposal</button></div>' +
        '<p class="ogiv-note">The preview updates as terms change. Treasury, FX, project readiness, sanctions, sovereign risk and final host approval remain authoritative at submission and negotiation.</p></form>';
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
  function opportunitySummary(form, investorCountry, host, type, data) {
    if (!host) return 'Select a destination country to browse its current opportunities.';
    if (!type) return data.projectTypes.length + ' supported project categories are available for this destination. Select one to inspect its targets.';
    var api = runtime(), values = {};
    Array.prototype.forEach.call(form.elements || [], function (el) { if (el.name) values[el.name] = el.value; });
    var selected = null, details = '';
    if (type === 'FACTORY') {
      selected = data.factories.find(function (x) { return x.value === values.factoryType; }) || null;
      if (!selected) return data.factories.length + ' factory categories are available from the canonical industrial catalogue. Select a category to continue. Regional placement is not supported by the current Factory runtime.';
      details = '<strong>' + esc(selected.label) + '</strong><span>Catalog construction cost: ' +
        (selected.constructionCost === null ? 'Not specified' : esc(selected.constructionCost.toLocaleString('en-US'))) +
        ' ' + esc(selected.costUnit) + '</span><span>Placement: ' + esc(host) + ' · country-level</span>';
    } else if (type === 'MINE') {
      selected = data.mines.find(function (x) { return x.value === values.siteId; }) || null;
      if (!selected) return data.mines.length + ' canonical mine sites are recorded for ' + esc(host) + '. Select a site to request its current construction quote.';
      details = '<strong>' + esc(selected.label) + '</strong><span>Resource: ' + esc(selected.resourceId || 'Not classified') +
        ' · Site ID: ' + esc(selected.value) + '</span><span>Location: ' + esc(selected.region || 'Canonical site; no finer region label recorded') + '</span>';
    } else if (type === 'EXISTING_PROJECT') {
      selected = data.projects.find(function (x) { return x.value === values.existingProjectId; }) || null;
      if (!selected) return data.projects.length + ' eligible project records have positive USD CAPEX evidence and an active supported status. Select a project to review its funding limit.';
      details = '<strong>' + esc(selected.label) + '</strong><span>' + esc(statusLabel(selected.status)) +
        ' · Recorded CAPEX: ' + money(selected.costUsd, 'USD') + '</span><span>Target: ' + esc(host) + ' · Project ID: ' + esc(selected.value) + '</span>';
    } else if (type === 'INFRASTRUCTURE') {
      details = '<strong>Player-defined infrastructure scope</strong><span>Enter the infrastructure type, distance, daily capacity and construction duration. The current infrastructure investment API records the host country and project specifications, but no district or coordinate.</span>';
    }
    var amountLocal = number(values.amount), fx = fxFor(investorCountry);
    var amountUsd = amountLocal !== null && amountLocal > 0 && fx.rate !== null ? amountLocal / fx.rate : null;
    var quoteInput = { hostCountryId: host, projectType: type, amountUsd: amountUsd, costUsd: amountUsd,
      factoryType: values.factoryType, siteId: values.siteId, assignedWorkers: number(values.assignedWorkers),
      quantity: number(values.quantity) || 1, resourceId: selected && selected.resourceId,
      existingProjectId: values.existingProjectId, infrastructureType: values.infrastructureType,
      distanceKm: number(values.distanceKm), capacityPerDay: number(values.capacityPerDay),
      buildDays: number(values.buildDays) };
    var canQuote = type === 'MINE' ? !!(selected && api && typeof api.quoteProject === 'function') :
      type === 'FACTORY' || type === 'EXISTING_PROJECT' ? !!(selected && amountUsd > 0 && api && typeof api.quoteProject === 'function') :
      type === 'INFRASTRUCTURE' ? !!(values.infrastructureType && number(values.distanceKm) !== null &&
        number(values.capacityPerDay) > 0 && number(values.buildDays) > 0 && amountUsd > 0 &&
        api && typeof api.quoteProject === 'function') : false;
    if (!canQuote) {
      if (type === 'FACTORY' || type === 'EXISTING_PROJECT') details += '<span>Enter an investment amount to request a live Finance project quote.</span>';
      return details;
    }
    var quote;
    try { quote = api.quoteProject(quoteInput); } catch (_) { quote = { status: 'BLOCKED', reason: 'PROJECT_QUOTE_FAILED' }; }
    if (!quote || quote.status !== 'QUOTED') {
      details += '<span class="ogiv-warning">Current project quote: ' + esc(statusLabel(quote && quote.reason || 'QUOTE_UNAVAILABLE')) + '</span>';
    } else {
      details += '<span class="ogiv-quote-ready">Finance project quote: ' + money(quote.projectCostUsd, 'USD') +
        (quote.constructionDays ? ' · ' + esc(quote.constructionDays) + ' days' : '') + '</span>';
      var materials = quote.materials || quote.quote && quote.quote.materials;
      if (Array.isArray(materials) && materials.length) {
        var ready = materials.filter(function (x) { return x && x.sufficient === true; }).length;
        details += '<span>Construction materials: ' + ready + ' / ' + materials.length + ' verified sufficient</span>';
      }
    }
    return details + '<span class="ogiv-note">This is a project-readiness quote only. Final Treasury, FX, risk and host-approval checks run when the proposal is submitted.</span>';
  }
  function refreshForm(form, investorCountry, changedNode) {
    if (!form || !form.querySelector) return;
    var hostNode = form.querySelector('[data-gov-host-country]');
    var host = String(hostNode && hostNode.value || '').toUpperCase();
    var sectorNode = form.querySelector('[data-gov-sector]');
    var sector = String(sectorNode && sectorNode.value || '').toUpperCase();
    var sectorChoices = sectorsFor(host);
    if (!sectorChoices.some(function (row) { return row.value === sector; })) sector = '';
    if (sectorNode) {
      sectorNode.innerHTML = options(sectorChoices, sector, host ? 'Select an investment sector' : 'Select destination first');
      sectorNode.disabled = !host || !sectorChoices.length;
    }
    var typeNode = form.querySelector('[data-gov-project-type]');
    var type = projectTypeForSector(sector) || String(typeNode && typeNode.value || '').toUpperCase();
    var data = opportunitiesFor(host, sector);
    if (typeNode) {
      var typeChoices = data.projectTypes;
      if (!typeChoices.some(function (x) { return x.value === type; })) type = '';
      typeNode.innerHTML = options(typeChoices, type, host ? 'Select an investment opportunity' : 'Select a destination first');
      typeNode.value = type;
      typeNode.disabled = !host || !typeChoices.length;
    }
    var instrument = form.querySelector('[data-gov-instrument]');
    if (instrument) {
      var isDomestic = !!host && host === String(investorCountry).toUpperCase();
      var choices = !host ? [] : isDomestic ? [['DOMESTIC_PUBLIC_CAPEX', 'Domestic public capital expenditure']] :
        [['EQUITY', 'Equity investment'], ['JOINT_VENTURE', 'Government joint venture'],
          ['LOAN', 'Sovereign project loan'], ['GRANT', 'Development grant']];
      var prior = instrument.value;
      instrument.innerHTML = choices.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join('');
      instrument.value = choices.some(function (x) { return x[0] === prior; }) ? prior : (choices[0] && choices[0][0] || '');
      instrument.disabled = !host;
    }
    var factoryNode = form.querySelector('[data-gov-factory-type]');
    if (factoryNode) {
      var currentFactory = factoryNode.value;
      factoryNode.innerHTML = options(data.factories, currentFactory, 'Select a factory category');
      factoryNode.disabled = !host || !data.factories.length;
    }
    var siteNode = form.querySelector('[data-gov-site]');
    if (siteNode) {
      var currentSite = siteNode.value;
      siteNode.innerHTML = options(data.mines, currentSite, 'Select a canonical mine site in this country');
      siteNode.disabled = !host || !data.mines.length;
    }
    var projectNode = form.querySelector('[data-gov-existing-project]');
    if (projectNode) {
      var currentProject = projectNode.value;
      projectNode.innerHTML = options(data.projects.map(function (project) {
        return { value: project.value, label: project.label + ' · ' + statusLabel(project.status) + ' · ' + money(project.costUsd, 'USD') };
      }), currentProject, 'Select an eligible existing project');
      projectNode.disabled = !host || !data.projects.length;
    }
    function syncRange(rangeSelector, inputSelector) {
      var range = form.querySelector(rangeSelector), input = form.querySelector(inputSelector);
      if (!range || !input) return;
      if (changedNode === range) input.value = range.value;
      else if (changedNode === input) range.value = input.value;
      else if (input.value !== '') range.value = input.value;
      else input.value = range.value;
    }
    var amountRange = form.querySelector('[data-gov-amount-slider]'), amountInput = form.querySelector('[name="amount"]');
    if (amountRange && amountInput) {
      var amountMin = number(amountInput.min) || 1, amountMax = number(amountInput.max) || amountMin;
      if (changedNode === amountRange) {
        var position = Math.max(0, Math.min(1000, number(amountRange.value) || 0));
        amountInput.value = String(Math.round(amountMin * Math.pow(amountMax / amountMin, position / 1000) * 100) / 100);
      } else {
        var amountValue = number(amountInput.value);
        if (amountValue === null) amountValue = amountMin;
        amountValue = Math.max(amountMin, Math.min(amountMax, amountValue));
        amountRange.value = String(amountMax > amountMin ? Math.round(Math.log(amountValue / amountMin) / Math.log(amountMax / amountMin) * 1000) : 0);
      }
    }
    syncRange('[data-gov-share-slider]', '[name="equitySharePct"]');
    syncRange('[data-gov-interest-slider]', '[name="interestPct"]');
    Array.prototype.forEach.call(form.querySelectorAll('[data-gov-field]'), function (node) {
      var field = node.getAttribute('data-gov-field');
      var visible = !!host && !!type && (field === 'equity' ? ['EQUITY','JOINT_VENTURE'].includes(instrument && instrument.value) :
        field === 'loan' ? instrument && instrument.value === 'LOAN' :
        field === 'duration' ? !['GRANT','DOMESTIC_PUBLIC_CAPEX'].includes(instrument && instrument.value) :
        field === 'factory' ? type === 'FACTORY' :
        field === 'mine' ? type === 'MINE' :
        field === 'infrastructure' ? type === 'INFRASTRUCTURE' :
        field === 'existing' ? type === 'EXISTING_PROJECT' : true);
      node.hidden = !visible;
    });
    var summaryNode = form.querySelector('[data-gov-opportunity-summary]');
    if (summaryNode) summaryNode.innerHTML = opportunitySummary(form, investorCountry, host, type, data);
    var previewNode = form.querySelector('[data-gov-live-preview]');
    if (previewNode) previewNode.innerHTML = dealPreview(form, investorCountry, host, sector, type);
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
    listOpportunities: opportunitiesFor, estimateAcceptanceRate: estimateAcceptanceRate,
    submit: submit, requestInvestment: requestInvestment, decide: decide
  });
  g.OmegaGovernmentInvestmentUIV1 = API;
  g.Omega = g.Omega || {};
  g.Omega.GovernmentInvestmentUIV1 = API;
})(typeof window !== 'undefined' ? window : globalThis);
