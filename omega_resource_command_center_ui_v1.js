/* OMEGA Resource Command Center UI v1.0.0
 * Binds all sixteen Resource Ministry cards to scoped live-data panels.
 * Actions report authoritative runtime outcomes; unavailable systems never report success.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0';
  const PANELS = [
    { id: 'matrix', num: '01', title: 'Unit standards & metrology' },
    { id: 'ontology', num: '02', title: 'Commodity ontology' },
    { id: 'reserves', num: '03', title: 'Reserves & in-situ ledger' },
    { id: 'deposits', num: '04', title: 'Deposit registry' },
    { id: 'extraction', num: '05', title: 'Extraction & depletion' },
    { id: 'processing', num: '06', title: 'Processing & smelting' },
    { id: 'inventory', num: '07', title: 'Strategic reserve inventory' },
    { id: 'logistics', num: '08', title: 'Transport corridors' },
    { id: 'industrial', num: '09', title: 'Industrial value chain' },
    { id: 'market', num: '10', title: 'Commodity market' },
    { id: 'trade', num: '11', title: 'Supply contracts & tariffs' },
    { id: 'value', num: '12', title: 'Resource rent & sovereign wealth' },
    { id: 'cascade', num: '13', title: 'Cascade disruption sandbox' },
    { id: 'cognitive', num: '14', title: 'Cognitive decision gate' },
    { id: 'power', num: '15', title: 'Power systems & energy projects' },
    { id: 'environment', num: '16', title: 'Circular industry & environmental controls' }
  ];
  const ALIASES = { profile: 'cognitive', inventory: 'inventory', deposits: 'deposits', matrix: 'matrix' };
  let countryId = null;
  let activePanel = 'matrix';
  let lastOutcome = '';
  let lastCascade = null;

  function state() { return (g.Game && g.Game.state) || g.gameState || {}; }
  function engine() { return g.ResourceMinistryEngine || null; }
  function text(value) { return value == null || value === '' ? 'Unavailable' : String(value); }
  function esc(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function number(value, unit) {
    if (value === null || value === undefined || value === '') return 'Unavailable';
    if (typeof value === 'object') return shortJson(value);
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() + (unit || '') : esc(value);
  }
  function shortJson(value) {
    try { return esc(JSON.stringify(value)); } catch (_) { return 'Unavailable'; }
  }
  function normaliseCountry(raw) {
    const candidate = String(raw || '').trim();
    if (!candidate) return 'BGD';
    try {
      const e = engine();
      if (e && typeof e.normalizeCountryCode === 'function') {
        const code = e.normalizeCountryCode(candidate);
        if (code) return String(code).trim().toUpperCase();
      }
    } catch (_) {}
    try {
      const resolved = (g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge);
      const hit = resolved && resolved.resolveCountry && resolved.resolveCountry(candidate);
      if (hit && hit.id) return String(hit.id).trim().toUpperCase();
    } catch (_) {}
    return candidate.toUpperCase().replace(/[\s-]+/g, '_');
  }
  function activeCountry(raw) {
    return normaliseCountry(raw || countryId ||
      (g.CountryIOS && g.CountryIOS.activeCountry) ||
      (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) ||
      (g.Game && g.Game.currentActiveCountry) || state().playerCountryId || 'BGD');
  }
  function bucket(domain, country) {
    const root = state()[domain];
    const c = activeCountry(country);
    if (!root || typeof root !== 'object') return {};
    return root[c] || root[c.toLowerCase()] || root[String(country || '').trim().toUpperCase()] || {};
  }
  function resourceBucket(country) {
    const s = state();
    const c = activeCountry(country);
    return (s.resource && (s.resource[c] || s.resource[String(country || '').toUpperCase()])) ||
      (s.resources && (s.resources[c] || s.resources[String(country || '').toUpperCase()])) || {};
  }
  function aiCountrySnapshot(country) {
    const s = state() || {};
    const code = activeCountry(country);
    function countryState(domain) {
      const root = s[domain];
      if (!root || typeof root !== 'object') return {};
      const key = Object.keys(root).find(function (name) { return String(name).trim().toUpperCase() === code; });
      return key ? (root[key] || {}) : {};
    }
    const r = Object.keys(s.resource || {}).length ? countryState('resource') : countryState('resources');
    const fin = countryState('finance');
    const eco = countryState('economy');
    const impact = r.environmentalImpact && typeof r.environmentalImpact === 'object' ? r.environmentalImpact : {};
    const bySite = impact.bySite && typeof impact.bySite === 'object' ? impact.bySite : {};
    const boundedSites = {};
    Object.keys(bySite).slice(0, 40).forEach(function (siteId) {
      const site = bySite[siteId] || {};
      boundedSites[siteId] = {
        siteId: site.siteId || siteId,
        landIndex: site.landIndex,
        waterIndex: site.waterIndex,
        wasteIndex: site.wasteIndex
      };
    });
    return {
      simulation: { turn: s.simulation && s.simulation.turn != null ? s.simulation.turn : (s.turn != null ? s.turn : s.simulationTurn) },
      finance: { [code]: { available: fin.available, cash: fin.cash, reserves: fin.reserves, currencyCode: fin.currencyCode } },
      economy: { [code]: { currencyCode: eco.currencyCode || eco.currency_code } },
      resource: { [code]: {
        inventory: r.inventory || {},
        reserves: r.reserves || {},
        production: r.production || {},
        carbonQuota: r.carbonQuota || null,
        carbonEmissionsLedger: (Array.isArray(r.carbonEmissionsLedger) ? r.carbonEmissionsLedger : []).slice(-50),
        environmentalImpact: { revision: impact.revision, bySite: boundedSites },
        powerProjects: (Array.isArray(r.powerProjects) ? r.powerProjects : []).slice(-12),
        powerAssets: (Array.isArray(r.powerAssets) ? r.powerAssets : []).slice(-12),
        environmentalLedger: (Array.isArray(r.environmentalLedger) ? r.environmentalLedger : []).slice(-12)
      } }
    };
  }
  function engineSummary(country) {
    try {
      const e = engine();
      if (e && typeof e.getAuthoritativeResourceSummary === 'function') return e.getAuthoritativeResourceSummary(country);
      if (e && typeof e.getSummary === 'function') return e.getSummary(country);
    } catch (_) {}
    return { resourcesList: [], globalMetrics: {}, briefing: 'Authoritative resource summary is unavailable.' };
  }
  function resources(country) {
    const rows = engineSummary(country).resourcesList;
    return Array.isArray(rows) ? rows : [];
  }
  function resourceTypes() {
    const e = engine();
    return e && Array.isArray(e.resourceTypes) ? e.resourceTypes : [];
  }
  const UNIT_DEFINITIONS = Object.freeze({
    kg: { label: 'Kilogram (kg)', dimension: 'MASS', factor: 1, base: 'kg' },
    metric_tonne: { label: 'Metric tonne (t)', dimension: 'MASS', factor: 1000, base: 'kg' },
    lb: { label: 'Pound (lb)', dimension: 'MASS', factor: 0.45359237, base: 'kg' },
    litre: { label: 'Litre (L)', dimension: 'VOLUME', factor: 1, base: 'L' },
    bbl: { label: 'Oil barrel (bbl)', dimension: 'VOLUME', factor: 158.987294928, base: 'L' },
    cubic_metre: { label: 'Cubic metre (m³)', dimension: 'VOLUME', factor: 1000, base: 'L' },
    gj: { label: 'Gigajoule (GJ)', dimension: 'ENERGY', factor: 1, base: 'GJ' },
    mmbtu: { label: 'Million Btu (MMBtu)', dimension: 'ENERGY', factor: 1.05505585262, base: 'GJ' },
    kwh: { label: 'Kilowatt-hour (kWh)', dimension: 'ENERGY', factor: 0.0036, base: 'GJ' }
  });
  function convertUnits(value, fromUnit, toUnit) {
    if (value === null || value === undefined || String(value).trim() === '') return { status: 'BLOCKED', reason: 'QUANTITY_REQUIRED' };
    const amount = Number(value), from = UNIT_DEFINITIONS[String(fromUnit || '')], to = UNIT_DEFINITIONS[String(toUnit || '')];
    if (!Number.isFinite(amount)) return { status: 'BLOCKED', reason: 'FINITE_QUANTITY_REQUIRED' };
    if (!from || !to) return { status: 'BLOCKED', reason: 'UNKNOWN_UNIT' };
    if (from.dimension !== to.dimension) return { status: 'BLOCKED', reason: 'UNIT_DIMENSION_MISMATCH', fromDimension: from.dimension, toDimension: to.dimension };
    const converted = amount * from.factor / to.factor;
    if (!Number.isFinite(converted)) return { status: 'BLOCKED', reason: 'CONVERSION_RESULT_NOT_FINITE' };
    return { status: 'APPLIED', value: Number(converted.toPrecision(12)), unit: toUnit, label: to.label, dimension: to.dimension, baseUnit: from.base, source: 'FIXED_CANONICAL_UNIT_DEFINITIONS' };
  }
  function deposits() {
    const e = engine();
    return e && Array.isArray(e.deposits) ? e.deposits : [];
  }
  function countryList() {
    const out = new Set([activeCountry()]);
    ['resource', 'resources', 'economy', 'finance', 'trade', 'foreign', 'population'].forEach(function (domain) {
      const group = state()[domain];
      if (group && typeof group === 'object') Object.keys(group).forEach(function (key) {
        if (/^[A-Za-z0-9_-]{2,20}$/.test(key)) out.add(normaliseCountry(key));
      });
    });
    try {
      const registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge;
      const rows = registry && registry.list && (registry.list('COUNTRY') || registry.list());
      if (Array.isArray(rows)) rows.forEach(function (row) {
        const id = typeof row === 'string' ? row :
          (row.iso3 || row.iso3Code || row.countryCode || row.countryId || row.id || row.code);
        if (id) out.add(normaliseCountry(id));
      });
    } catch (_) {}
    return Array.from(out).filter(Boolean).sort();
  }
  function resourceName(id) {
    const row = resourceTypes().find(function (x) { return String(x.id) === String(id); });
    return row ? (row.name || id) : String(id || 'Resource');
  }
  function viewTitle(id) {
    return (PANELS.find(function (p) { return p.id === id; }) || PANELS[0]).title;
  }
  function card(title, meta, body, actions) {
    return '<article class="omega-rescc-card" data-search-item>' +
      '<div class="omega-rescc-cardhead"><strong>' + esc(title) + '</strong>' +
      (meta ? '<span class="omega-rescc-pill">' + esc(meta) + '</span>' : '') + '</div>' +
      '<div class="omega-rescc-cardbody">' + (body || '') + '</div>' +
      (actions ? '<div class="omega-rescc-actions">' + actions + '</div>' : '') +
      '</article>';
  }
  function actionButton(action, label, attrs, disabled) {
    let extra = '';
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] !== null && attrs[key] !== undefined) extra += ' data-' + key + '="' + esc(attrs[key]) + '"';
    });
    return '<button type="button" class="omega-rescc-button" data-action="' + esc(action) + '"' + extra +
      (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }
  function kv(label, value, unit) {
    return '<div class="omega-rescc-kv"><span>' + esc(label) + '</span><strong>' + number(value, unit) + '</strong></div>';
  }
  function empty(message) {
    return '<div class="omega-rescc-empty">' + esc(message) + '</div>';
  }
  function rowsList(list, titleFn, bodyFn, emptyMessage) {
    if (!Array.isArray(list) || !list.length) return empty(emptyMessage || 'No matching live records are available.');
    return list.map(function (row) {
      return card(titleFn(row), row.status || row.operationalStatus || '', bodyFn(row), '');
    }).join('');
  }
  function diagnosticCard(title, value) {
    return card(title, 'RUNTIME DIAGNOSTIC', '<pre class="omega-rescc-json">' + shortJson(value) + '</pre>', '');
  }
  function statusRows(list) {
    if (!Array.isArray(list) || !list.length) return empty('No requests or events have been recorded for this country.');
    return list.slice(-80).reverse().map(function (row) {
      const body = '<div class="omega-rescc-kv"><span>ID</span><strong>' + esc(row.requestId || row.eventId || row.batchId || row.shipmentId || row.projectId || '—') + '</strong></div>' +
        '<div class="omega-rescc-kv"><span>Resource / stage</span><strong>' + esc(row.resourceId || row.stage || row.type || row.projectType || '—') + '</strong></div>' +
        '<div class="omega-rescc-kv"><span>Turn</span><strong>' + esc(row.requestedTurn ?? row.createdTurn ?? row.simulationTurn ?? row.turn ?? '—') + '</strong></div>' +
        (row.reason || row.blockReason ? '<div class="omega-rescc-warning">' + esc(row.reason || row.blockReason) + '</div>' : '');
      return card(row.title || row.name || row.status || row.projectType || row.eventType || 'Runtime record', row.status || 'RECORDED', body, '');
    }).join('');
  }
  function matchingAssets(country, resourceId) {
    const network = g.Omega && g.Omega.ResourceIndustrialNetwork;
    if (network && typeof network.candidateFactories === 'function' && resourceId) {
      try {
        const candidates = network.candidateFactories(country, resourceId);
        if (Array.isArray(candidates)) return candidates.map(function (row) { return row && row.asset; }).filter(Boolean);
      } catch (_) {}
    }
    const econ = bucket('economy', country);
    const r = resourceBucket(country);
    const assets = Array.isArray(econ.productionAssets) ? econ.productionAssets :
      (Array.isArray(r.productionAssets) ? r.productionAssets : []);
    const wanted = String(resourceId || '').toLowerCase().replace(/[\s-]+/g, '_');
    return assets.filter(function (asset) {
      const values = [asset.resourceId, asset.resource, asset.inputResourceId, asset.outputResourceId]
        .concat(Object.keys(asset.inputCoefficients || {}), Object.keys(asset.outputProfile || {}))
        .filter(Boolean).map(function (x) { return String(x).toLowerCase().replace(/[\s-]+/g, '_'); });
      return !wanted || values.indexOf(wanted) >= 0;
    });
  }
  function allFactories(country) {
    const econ = bucket('economy', country);
    const r = resourceBucket(country);
    const rows = Array.isArray(econ.productionAssets) ? econ.productionAssets :
      (Array.isArray(r.productionAssets) ? r.productionAssets : []);
    return rows.filter(function (x) { return x && (x.id || x.assetId || x.factoryId || x.projectId); });
  }
  function authority(row, field) {
    const value = row && (row[field + 'Authority'] || row[field + 'State'] ||
      (row.provenance && row.provenance[field + 'Authority']));
    return value || 'NOT_RECORDED';
  }
  function panelMatrix(country) {
    const summary = engineSummary(country);
    const rows = resources(country);
    const metrics = summary.globalMetrics || {};
    const unitOptions = Object.keys(UNIT_DEFINITIONS).map(function (id) {
      const unit = UNIT_DEFINITIONS[id];
      return '<option value="' + esc(id) + '">' + esc(unit.label) + '</option>';
    }).join('');
    const metrology = '<form class="omega-rescc-form" data-search-item data-form="metrology"><h3>Canonical unit conversion</h3>' +
      '<div class="omega-rescc-formgrid">' +
      '<label>Quantity<input name="value" type="number" step="any" required placeholder="Enter quantity"></label>' +
      '<label>From unit<select name="fromUnit" required>' + unitOptions + '</select></label>' +
      '<label>To unit<select name="toUnit" required>' + unitOptions + '</select></label></div>' +
      '<p class="omega-rescc-note">Only conversions within the same physical dimension are allowed. Volume, mass and energy are never converted across dimensions.</p>' +
      '<button class="omega-rescc-button" type="submit">Convert quantity</button></form>';
    const top = metrology + '<div class="omega-rescc-metrics">' +
      '<div><span>Autonomy index</span><strong>' + number(metrics.autonomyIndex, '%') + '</strong></div>' +
      '<div><span>Reserve duration</span><strong>' + number(metrics.strategicReservesTotalDays, ' days') + '</strong></div>' +
      '<div><span>Runtime source</span><strong>' + esc(summary.version || 'Unavailable') + '</strong></div></div>' +
      '<p class="omega-rescc-note">' + esc(summary.briefing || 'Missing values remain unavailable; no synthetic values are shown.') + '</p>';
    const content = rows.map(function (r) {
      return card(r.name || r.id, r.id + ' · ' + (r.unit || 'unit not specified'),
        '<div class="omega-rescc-grid2">' + kv('Production/day', r.dailyProduction) +
        kv('Demand/day', r.dailyConsumption) + kv('Net balance', r.netBalance) +
        kv('Inventory', r.inventory) + kv('Reserve', r.reserve) + kv('Stock days', r.stockDays) + '</div>' +
        '<div class="omega-rescc-muted">Production authority: ' + esc(r.productionAuthority || 'NOT_RECORDED') +
        ' · Reserve authority: ' + esc(r.reserveAuthority || 'NOT_RECORDED') + '</div>',
        actionButton('survey', 'Request survey', { 'resource-id': r.id }) +
        actionButton('expansion', 'Request capacity review', { 'resource-id': r.id }) +
        actionButton('reserve', 'Request SPR transfer', { 'resource-id': r.id }) +
        actionButton('focus-map', 'Focus map', { 'resource-id': r.id }));
    }).join('');
    return top + (content || empty('No authoritative commodity rows are available for this country.'));
  }
  function panelOntology(country) {
    const types = resourceTypes();
    if (!types.length) return empty('Commodity ontology catalog is not loaded.');
    return '<p class="omega-rescc-note">Canonical resource identifiers, units and process chains exposed by the installed catalog. Unset chemistry or grade fields are not inferred.</p>' +
      types.map(function (r) {
        return card(r.name || r.id, r.id + ' · ' + (r.unit || 'unit not specified'),
          '<div class="omega-rescc-grid2">' + kv('Category', r.category) + kv('Unit', r.unit) +
          kv('Base price evidence', r.basePrice) + kv('Chemical formula', r.chemicalFormula || r.formula) + '</div>' +
          '<div class="omega-rescc-kv"><span>Process chain</span><strong>' +
          esc(Array.isArray(r.processChain) ? r.processChain.join(' → ') : (r.processChain || 'Not recorded')) + '</strong></div>',
          actionButton('focus-map', 'Locate deposits', { 'resource-id': r.id }));
      }).join('');
  }
  function panelReserves(country) {
    const rows = resources(country);
    const r = resourceBucket(country);
    const endowment = r.endowment || {};
    const reserves = r.reserves || {};
    const inventory = r.inventory || {};
    const body = rows.map(function (row) {
      const rid = row.id;
      const ev = Object.prototype.hasOwnProperty.call(endowment, rid) ? endowment[rid] : null;
      const rv = Object.prototype.hasOwnProperty.call(reserves, rid) ? reserves[rid] : row.reserve;
      const iv = Object.prototype.hasOwnProperty.call(inventory, rid) ? inventory[rid] : row.inventory;
      return card(row.name || rid, rid,
        '<div class="omega-rescc-grid2">' + kv('Endowment', ev) + kv('Reserve balance', rv) +
        kv('Available inventory', iv) + kv('Reserve authority', row.reserveAuthority || 'NOT_RECORDED') +
        kv('Unit', row.unit) + kv('Grade / purity', row.grade ?? row.purity) + '</div>',
        actionButton('reserve', 'Request SPR transfer', { 'resource-id': rid }));
    }).join('');
    return '<p class="omega-rescc-note">This ledger shows runtime values as stored. A missing reserve is not zero; SIMULATED values are identified as such.</p>' +
      body + (body ? '' : empty('No reserve records are available.'));
  }
  function panelDeposits(country) {
    const rows = deposits();
    if (!rows.length) return empty('Deposit registry is unavailable.');
    return '<p class="omega-rescc-note">Global deposit registry: ' + rows.length +
      ' records found. Country-specific counts and coordinate fields come from the registry, not a hard-coded concession count.</p>' +
      rows.map(function (d) {
        const lat = Number(d.lat), lng = Number(d.lng ?? d.lon);
        const validCoords = Number.isFinite(lat) && Number.isFinite(lng);
        const rid = d.resourceId || d.resId || d.resourceTypeId || d.resource || '';
        const body = '<div class="omega-rescc-grid2">' + kv('Country', d.country || d.countryCode || d.countryId) +
          kv('Resource', rid || d.name) + kv('Latitude', validCoords ? lat.toFixed(5) : null) +
          kv('Longitude', validCoords ? lng.toFixed(5) : null) + kv('Reserves', d.reserves) +
          kv('Grade', d.grade ?? d.purity) + kv('Operator', d.operator || d.owner) + '</div>';
        return card(d.name || d.depositName || d.siteId || 'Unnamed deposit', d.status || 'STATUS NOT RECORDED', body,
          (validCoords ? actionButton('fly-deposit', 'Fly to coordinates', { lat: lat, lng: lng, 'deposit-name': d.name || d.depositName || 'Deposit' }) : '') +
          (rid ? actionButton('survey', 'Request resource survey', { 'resource-id': rid }) : ''));
      }).join('');
  }
  function siteRows(country) {
    const out = [];
    const r = resourceBucket(country);
    const candidates = [];
    if (Array.isArray(r.mineSiteReferences)) candidates.push.apply(candidates, r.mineSiteReferences);
    if (Array.isArray(r.mines)) candidates.push.apply(candidates, r.mines);
    try {
      const e = g.Omega && g.Omega.ResourceEndowmentRuntime;
      const refs = e && e.countryMineSiteReferences && e.countryMineSiteReferences(country);
      if (Array.isArray(refs)) candidates.push.apply(candidates, refs);
      const mines = e && e.countryMines && e.countryMines(country);
      if (Array.isArray(mines)) candidates.push.apply(candidates, mines);
    } catch (_) {}
    const seen = new Set();
    candidates.forEach(function (site) {
      if (!site || typeof site !== 'object') return;
      const id = site.siteId || site.canonicalSiteId || site.occurrenceKey || site.id;
      if (!id || seen.has(String(id))) return;
      const sc = site.countryId || site.countryCode || site.country;
      if (sc && normaliseCountry(sc) !== activeCountry(country)) return;
      seen.add(String(id));
      out.push(Object.assign({}, site, { siteId: String(id) }));
    });
    return out;
  }
  function panelExtraction(country) {
    const r = resourceBucket(country);
    const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
    const surveys = Array.isArray(r.surveyRequests) ? r.surveyRequests : [];
    const results = Array.isArray(r.surveyResults) ? r.surveyResults : [];
    const explorations = Array.isArray(r.explorationProjects) ? r.explorationProjects : [];
    const commissionedSites = Array.isArray(r.commissionedSites) ? r.commissionedSites : [];
    const sites = siteRows(country);
    const diag = g.Omega && g.Omega.ResourceIndustrialNetwork && g.Omega.ResourceIndustrialNetwork.diagnostics ?
      g.Omega.ResourceIndustrialNetwork.diagnostics(country) : null;
    const siteCards = sites.map(function (s) {
      const rid = s.resourceId || s.resId || s.real && s.real.resourceId || s.sourceSiteRecord && s.sourceSiteRecord.resourceId || '';
      const body = '<div class="omega-rescc-grid2">' + kv('Site ID', s.siteId) + kv('Resource', rid || s.resourceName) +
        kv('Reserve', s.reserveQuantity ?? s.remainingReserve ?? s.reserves) +
        kv('Production authority', s.productionAuthority || s.productionModel && s.productionModel.authority || 'NOT_RECORDED') +
        kv('Quality authority', s.qualityAuthority || s.qualityState && s.qualityState.qualityAuthority || 'NOT_RECORDED') + '</div>';
      return card(s.name || s.siteName || s.depositName || s.siteId, s.operationalStatus || s.status || 'STATUS NOT RECORDED', body,
        actionButton('extract-site', 'Run authoritative site pipeline', {
          'site-id': s.siteId, 'resource-id': rid, quantity: 1
        }, !(g.Omega && g.Omega.ResourceIndustrialNetwork && g.Omega.ResourceIndustrialNetwork.executeSitePipeline && rid)) +
        actionButton('start-exploration', 'Start canonical exploration', { 'site-id': s.siteId },
          !(policy && typeof policy.startExploration === 'function' && s.siteId)) +
        (rid ? actionButton('survey', 'Request survey', { 'resource-id': rid }) : ''));
    }).join('');
    const explorationCards = explorations.map(function (p) {
      const status = String(p.status || '').toUpperCase();
      const action = status === 'DISCOVERED_PENDING_INVESTMENT'
        ? actionButton('approve-exploration-investment', 'Approve required site investment', { 'project-id': p.projectId }, !(policy && typeof policy.approveInvestment === 'function'))
        : status === 'INVESTMENT_APPROVED'
          ? actionButton('commission-exploration-site', 'Commission site', { 'project-id': p.projectId, 'site-id': p.siteId }, !(policy && typeof policy.commissionSite === 'function'))
          : '';
      return card(p.siteId || p.projectId || 'Exploration project', status || 'STATUS NOT RECORDED',
        '<div class="omega-rescc-grid2">' + kv('Project ID', p.projectId) + kv('Progress (%)', p.progress) +
        kv('Progress turns', p.progressTurns) + kv('Required turns', p.requiredTurns) +
        kv('Investment status', p.investmentStatus) + kv('Authority', p.authority) + '</div>', action);
    }).join('');
    const rows = resources(country).map(function (x) {
      return card(x.name || x.id, x.id,
        '<div class="omega-rescc-grid2">' + kv('Observed production/day', x.dailyProduction) +
        kv('Observed reserve', x.reserve) + kv('Production authority', x.productionAuthority || 'NOT_RECORDED') + '</div>',
        actionButton('survey', 'Request survey', { 'resource-id': x.id }));
    }).join('');
    return '<div class="omega-rescc-metrics"><div><span>Canonical runnable site records</span><strong>' +
      number(sites.length) + '</strong></div><div><span>Survey requests</span><strong>' + number(surveys.length) +
      '</strong></div><div><span>Survey results</span><strong>' + number(results.length) + '</strong></div></div>' +
      (diag ? diagnosticCard('Extraction runtime diagnostics', diag) : '') +
      '<h3 class="omega-rescc-section-title">Canonical site registry</h3>' +
      (siteCards || empty('No country-scoped runnable canonical site IDs were returned. Deposit records alone are not treated as executable mine sites.')) +
      '<h3 class="omega-rescc-section-title">Resource survey requests</h3>' + statusRows(surveys) +
      '<h3 class="omega-rescc-section-title">Completed survey evidence</h3>' + statusRows(results) +
      '<h3 class="omega-rescc-section-title">Authoritative exploration projects</h3>' + (explorationCards || empty('No exploration projects have been recorded.')) +
      '<h3 class="omega-rescc-section-title">Commissioned site records</h3>' + statusRows(commissionedSites) +
      '<h3 class="omega-rescc-section-title">Commodity survey shortcuts</h3>' + (rows || empty('No commodity rows are available.'));
  }
  function panelProcessing(country) {
    const assets = allFactories(country);
    const requests = bucket('economy', country).capacityUpgradeRequests || resourceBucket(country).capacityUpgradeRequests || [];
    const content = assets.map(function (asset) {
      const id = asset.id || asset.assetId || asset.factoryId || asset.projectId;
      const resourcesForAsset = Object.keys(asset.inputCoefficients || {}).concat(Object.keys(asset.outputProfile || []));
      const rid = asset.resourceId || asset.inputResourceId || resourcesForAsset[0] ||
        (resources(country)[0] && resources(country)[0].id) || '';
      const body = '<div class="omega-rescc-grid2">' + kv('Factory ID', id) +
        kv('Stage', asset.stage || asset.facilityType || asset.factoryType) + kv('Capacity', asset.capacity) +
        kv('Input stock', asset.inputInventory && asset.inputInventory[rid]) +
        kv('Inputs', esc(Object.keys(asset.inputCoefficients || {}).join(', ') || 'Not recorded')) +
        kv('Outputs', esc(Object.keys(asset.outputProfile || {}).join(', ') || 'Not recorded')) + '</div>';
      return card(asset.name || asset.factoryName || id, asset.status || asset.stage || 'STATUS NOT RECORDED', body,
        actionButton('process-factory', 'Run one real factory cycle', { 'factory-id': id, 'resource-id': rid, quantity: asset.capacity || 1 },
          !(g.Omega && g.Omega.ResourceIndustrialNetwork && g.Omega.ResourceIndustrialNetwork.executeFactoryCycle && id && rid)) +
        (rid ? actionButton('expansion', 'Request capacity expansion', { 'resource-id': rid }) : ''));
    }).join('');
    const resourceIndustrial = resourceBucket(country).industrialNetwork || {};
    const projectRows = Array.isArray(resourceIndustrial.projects) ? resourceIndustrial.projects :
      (Array.isArray(bucket('economy', country).projects) ? bucket('economy', country).projects :
      (Array.isArray(bucket('economy', country).industrialProjects) ? bucket('economy', country).industrialProjects : []));
    const resourceOptions = resources(country).map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(r.name || r.id) + '</option>';
    }).join('');
    const projectForm = '<form class="omega-rescc-form" data-search-item data-form="factory-project">' +
      '<h3>Start a catalog-backed factory project</h3><div class="omega-rescc-formgrid">' +
      '<label>Resource<select name="resourceId" required>' + resourceOptions + '</select></label>' +
      '<label>Budget cost<input type="number" name="cost" min="1" step="1" required></label>' +
      '<label>Capacity per day<input type="number" name="capacityPerDay" min="1" step="1" required></label>' +
      '<label>Build days<input type="number" name="buildDays" min="1" step="1" value="180" required></label></div>' +
      '<p class="omega-rescc-note">This API records a construction project; a treasury debit is not part of this project-creation call.</p>' +
      '<button class="omega-rescc-button" type="submit">Create factory project</button></form>';
    return '<h3 class="omega-rescc-section-title">Production and processing assets</h3>' +
      (content || empty('No matching production assets are registered in the selected country.')) +
      '<h3 class="omega-rescc-section-title">Capacity requests</h3>' + statusRows(requests) +
      '<h3 class="omega-rescc-section-title">Industrial construction projects</h3>' + statusRows(projectRows) + projectForm;
  }
  function panelInventory(country) {
    const r = resourceBucket(country);
    const warehouse = r.warehouse || {};
    const spr = r.strategicReserve || {};
    const batches = Array.isArray(r.batches) ? r.batches : [];
    const requests = Array.isArray(r.reserveBufferRequests) ? r.reserveBufferRequests : [];
    const stock = resources(country).map(function (row) {
      const id = row.id;
      const wh = warehouse.availableByResource && warehouse.availableByResource[id];
      const reserved = spr.availableByResource && spr.availableByResource[id];
      return card(row.name || id, id,
        '<div class="omega-rescc-grid2">' + kv('Inventory', row.inventory) +
        kv('Warehouse available', wh) + kv('SPR protected stock', reserved) +
        kv('Trade availability', row.tradeAvailability) + kv('Stock days', row.stockDays) +
        kv('Unit', row.unit) + '</div>',
        actionButton('reserve', 'Request stock-backed SPR transfer', { 'resource-id': id }));
    }).join('');
    const batchCards = batches.map(function (b) {
      return card(b.batchId || 'Resource batch', b.stage || 'STAGE NOT RECORDED',
        '<div class="omega-rescc-grid2">' + kv('Resource', b.resourceId) +
        kv('Remaining', b.remainingQuantity ?? b.quantity) + kv('Unit', b.unit) +
        kv('Warehouse', b.warehouseId) + kv('Purity', b.purity) + kv('Grade', b.grade) + '</div>', '');
    }).join('');
    return '<div class="omega-rescc-metrics"><div><span>Raw warehouse</span><strong>' + esc(warehouse.warehouseId || 'Not registered') +
      '</strong></div><div><span>Strategic reserve</span><strong>' + esc(spr.warehouseId || 'Not registered') +
      '</strong></div><div><span>Observed batches</span><strong>' + number(batches.length) + '</strong></div></div>' +
      '<p class="omega-rescc-note">SPR actions create a request. They do not fabricate stock; a later authoritative action tick must transfer observed material.</p>' +
      stock + '<h3 class="omega-rescc-section-title">Observed batches</h3>' +
      (batchCards || empty('No resource batches are recorded.')) +
      '<h3 class="omega-rescc-section-title">SPR request history</h3>' + statusRows(requests);
  }
  function panelLogistics(country) {
    const r = resourceBucket(country);
    const log = r.logistics || {};
    const shipments = Array.isArray(log.shipments) ? log.shipments : [];
    const batches = Array.isArray(r.batches) ? r.batches : [];
    const factoryRows = allFactories(country);
    const cards = batches.map(function (batch) {
      const id = batch.batchId;
      const rid = batch.resourceId || batch.materialIdentity || '';
      const qty = batch.remainingQuantity ?? batch.quantity;
      const warehouse = batch.warehouseId || r.warehouse && r.warehouse.warehouseId || '';
      const candidates = matchingAssets(country, rid).filter(function (a) { return a.id || a.assetId || a.factoryId || a.projectId; });
      const candIds = candidates.map(function (a) { return a.id || a.assetId || a.factoryId || a.projectId; });
      return card(id || 'Unidentified batch', rid || 'Resource not recorded',
        '<div class="omega-rescc-grid2">' + kv('Quantity', qty) + kv('Unit', batch.unit) +
        kv('Warehouse', warehouse) + kv('Compatible factories', candIds.length) + '</div>',
        actionButton('plan-shipment', 'Plan warehouse-to-factory route', {
          'batch-id': id, 'resource-id': rid, quantity: qty, unit: batch.unit || '',
          'warehouse-id': warehouse, 'factory-ids': candIds.join(',')
        }, !(id && rid && warehouse && candIds.length && g.Omega && g.Omega.ResourceLogisticsRuntime && g.Omega.ResourceLogisticsRuntime.planFromFactoryInput)));
    }).join('');
    const shipmentsHtml = shipments.slice(-100).reverse().map(function (s) {
      return card(s.shipmentId || s.routeId || 'Shipment', s.status || s.deliveryStatus || 'STATUS NOT RECORDED',
        '<div class="omega-rescc-grid2">' + kv('Resource', s.resourceId) + kv('Quantity', s.quantity) +
        kv('Factory', s.factoryId) + kv('Transport mode', s.transportMode) +
        kv('ETA turn', s.timing && s.timing.etaTurn) + kv('Constraint source', s.sourceAuthority || 'NOT_RECORDED') + '</div>' +
        (s.reason ? '<div class="omega-rescc-warning">' + esc(s.reason) + '</div>' : ''), '');
    }).join('');
    return '<div class="omega-rescc-metrics"><div><span>Recorded shipments</span><strong>' + number(shipments.length) +
      '</strong></div><div><span>Factories in state</span><strong>' + number(factoryRows.length) +
      '</strong></div><div><span>Last plan turn</span><strong>' + number(log.lastPlanTurn) + '</strong></div></div>' +
      '<p class="omega-rescc-note">Routes are planned from an observed warehouse batch to a compatible factory. A planned route is not the same as delivered material; delivery is shown by shipment status and ETA turn.</p>' +
      '<h3 class="omega-rescc-section-title">Available warehouse batches</h3>' +
      (cards || empty('No batches with a compatible registered factory are available for route planning.')) +
      '<h3 class="omega-rescc-section-title">Shipment state</h3>' +
      (shipmentsHtml || empty('No shipments have been recorded.'));
  }
  function panelIndustrial(country) {
    const network = g.Omega && g.Omega.ResourceIndustrialNetwork;
    const diag = network && network.diagnostics ? network.diagnostics(country) : null;
    const pipeline = network && network.gameplayPipelineDiagnostics ? network.gameplayPipelineDiagnostics() : null;
    const perCountry = pipeline && Array.isArray(pipeline.perCountry) ?
      pipeline.perCountry.find(function (x) { return normaliseCountry(x.countryId) === activeCountry(country); }) : null;
    const r = resourceBucket(country);
    const econ = bucket('economy', country);
    const industrialState = r.industrialNetwork || {};
    const flows = Array.isArray(industrialState.siteFlowLedger) ? industrialState.siteFlowLedger :
      (Array.isArray(r.siteFlows) ? r.siteFlows : (Array.isArray(r.siteFlowLedger) ? r.siteFlowLedger : (Array.isArray(r.extractionFlows) ? r.extractionFlows : [])));
    const projects = Array.isArray(industrialState.projects) ? industrialState.projects :
      (Array.isArray(econ.projects) ? econ.projects : []);
    const technologyContracts = Array.isArray(industrialState.technologyContracts) ? industrialState.technologyContracts : [];
    const stages = perCountry && perCountry.stages || {};
    return (diag ? diagnosticCard('Country industrial network diagnostics', diag) : empty('Industrial network runtime is unavailable.')) +
      (perCountry ? diagnosticCard('End-to-end site pipeline state', perCountry) : '') +
      '<div class="omega-rescc-metrics"><div><span>Extraction flows</span><strong>' + number(perCountry && perCountry.extractionFlows) +
      '</strong></div><div><span>Dispatched shipments</span><strong>' + number(perCountry && perCountry.dispatched) +
      '</strong></div><div><span>Processed flows</span><strong>' + number(perCountry && perCountry.processed) + '</strong></div></div>' +
      '<h3 class="omega-rescc-section-title">Observed flow ledger</h3>' +
      (Array.isArray(flows) ? statusRows(flows) : empty('No site flow ledger is exposed at this state path.')) +
      '<h3 class="omega-rescc-section-title">Construction projects</h3>' + statusRows(projects) +
      '<h3 class="omega-rescc-section-title">Technology project contracts</h3>' + statusRows(technologyContracts) +
      (Object.keys(stages).length ? diagnosticCard('Pipeline stage counts', stages) : '');
  }
  function panelMarket(country) {
    const market = g.OmegaGlobalMarket || g.Omega && g.Omega.GlobalMarket;
    if (!market || !market.quote) return empty('Global market runtime is unavailable; no price is fabricated.');
    let books = {};
    try { books = market.rebuild ? market.rebuild() : g.__OmegaMarketBooks || {}; } catch (_) { books = g.__OmegaMarketBooks || {}; }
    const rows = resources(country).map(function (r) {
      const q = market.quote(r.id);
      const book = books[r.id] || {};
      const matches = Array.isArray(q.matches) ? q.matches : [];
      const referenceMatched = matches.some(function (m) { return m.referenceLiquidity === true; });
      const body = '<div class="omega-rescc-grid2">' + kv('Clearing price (USD)', q.clearingPriceUsd) +
        kv('Reference quote', q.referencePrice) + kv('Best bid (USD)', q.bestBidUsd) +
        kv('Best ask (USD)', q.bestAskUsd) + kv('Matched quantity', q.matchedQuantity) +
        kv('Bid / ask depth', (q.bidDepth ?? '—') + ' / ' + (q.askDepth ?? '—')) +
        kv('Price discovery', q.priceDiscovery) + kv('Turn', q.generatedTurn) + '</div>' +
        (referenceMatched || q.priceDiscovery === 'REFERENCE_ONLY' ?
          '<div class="omega-rescc-warning">Reference-only liquidity contributed to this quote. This is not proof of a completed physical transfer.</div>' : '') +
        '<div class="omega-rescc-muted">Order rows: ' + number((book.orders && book.orders.bids || []).length) +
        ' bids / ' + number((book.orders && book.orders.asks || []).length) + ' asks · Discovery status: ' + esc(q.status || 'UNAVAILABLE') + '</div>';
      return card(r.name || r.id, q.status || 'NO MARKET RESULT', body, '');
    }).join('');
    const diag = market.diagnostics ? market.diagnostics() : null;
    return '<p class="omega-rescc-note">Price discovery is read from the existing order-book runtime. Quotes that include reference-only resource availability are labeled and are not treated as trades.</p>' +
      (diag ? diagnosticCard('Global market diagnostics', diag) : '') +
      actionButton('refresh-market', 'Rebuild current market snapshot', {}) +
      (rows || empty('No resource IDs are available to quote.'));
  }
  function panelTrade(country) {
    const trade = g.OmegaGlobalTrade || g.Omega && g.Omega.GlobalTrade;
    const requests = Array.isArray(bucket('trade', country).importRequests) ? bucket('trade', country).importRequests : [];
    const ledger = bucket('trade', country).globalTradeLedger || {};
    const others = countryList().filter(function (c) { return c !== activeCountry(country); });
    const countries = others.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    const resourceOpts = resources(country).map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(r.name || r.id) + '</option>';
    }).join('');
    const form = '<form class="omega-rescc-form" data-search-item data-form="trade-request">' +
      '<h3>Create bilateral supply request</h3><div class="omega-rescc-formgrid">' +
      '<label>Seller country<select name="targetCountryId" required>' + countries + '</select></label>' +
      '<label>Resource<select name="resourceId" required>' + resourceOpts + '</select></label>' +
      '<label>Quantity<input name="quantity" type="number" min="0.000001" step="any" required></label>' +
      '<label>Offered unit price<input name="unitPrice" type="number" min="0" step="any" required></label></div>' +
      '<p class="omega-rescc-note">Submitting records a request as SENT/OPEN. Counterparty review, observed relations, sanctions, price evidence, stock and settlement rules determine what happens next.</p>' +
      '<button class="omega-rescc-button" type="submit"' + ((!trade || typeof trade.createRequest !== 'function' || !others.length || !resourceOpts) ? ' disabled' : '') +
      '>Submit supply request</button></form>';
    return (trade && trade.diagnostics ? diagnosticCard('Global trade diagnostics', trade.diagnostics()) : empty('Global trade engine is not available.')) +
      form + '<h3 class="omega-rescc-section-title">Import requests and settlement status</h3>' + statusRows(requests) +
      '<h3 class="omega-rescc-section-title">Global trade ledger</h3>' + diagnosticCard('Ledger counters', {
        requests: Array.isArray(ledger.requests) ? ledger.requests.length : 0,
        decisions: Array.isArray(ledger.decisions) ? ledger.decisions.length : 0,
        settlements: Array.isArray(ledger.settlements) ? ledger.settlements.length : 0
      }) + statusRows(Array.isArray(ledger.settlements) ? ledger.settlements : []);
  }
  function panelValue(country) {
    const fin = bucket('finance', country);
    const econ = bucket('economy', country);
    const t = bucket('trade', country);
    const r = resourceBucket(country);
    const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
    const fund = r.sovereignWealthFund || fin.sovereignWealthFund || fin.sovereign_wealth_fund || econ.sovereignWealthFund || econ.sovereign_wealth_fund || null;
    const tradeLedger = t.globalTradeLedger || {};
    const receipts = fin.treasuryLedger || fin.treasuryEntries || fin.ledger || [];
    const contributions = fund && Array.isArray(fund.contributions) ? fund.contributions : [];
    const swfForm = '<form class="omega-rescc-form" data-search-item data-form="swf-capitalise"><h3>Capitalise sovereign wealth fund</h3>' +
      '<p class="omega-rescc-note">This transfers native treasury units. No USD conversion or independent FX rate is assumed.</p>' +
      '<label>Contribution amount (native treasury units)<input name="amount" type="number" min="0.000001" step="any" required placeholder="Enter amount"></label>' +
      '<button class="omega-rescc-button" type="submit"' + (!(policy && typeof policy.capitalizeSovereignWealthFund === 'function') ? ' disabled' : '') + '>Debit treasury and capitalise fund</button></form>';
    return '<div class="omega-rescc-metrics"><div><span>Available treasury balance</span><strong>' + number(fin.available ?? fin.cash) +
      '</strong></div><div><span>Financial reserves</span><strong>' + number(fin.reserves) +
      '</strong></div><div><span>Currency</span><strong>' + esc(fin.currencyCode || t.settlementCurrency || 'Not recorded') + '</strong></div></div>' +
      card('Sovereign Wealth Fund state', fund ? 'RUNTIME RECORD FOUND' : 'NOT REGISTERED',
        fund ? '<pre class="omega-rescc-json">' + shortJson(fund) + '</pre>' :
          '<div class="omega-rescc-warning">No fund is capitalised yet. The form below uses an authoritative treasury debit and records a contribution only after that debit succeeds.</div>', '') +
      swfForm + '<h3 class="omega-rescc-section-title">Fund contribution ledger</h3>' + statusRows(contributions) +
      card('Recorded fiscal and trade activity', 'OBSERVED LEDGER COUNTS',
        '<div class="omega-rescc-grid2">' + kv('Treasury records', Array.isArray(receipts) ? receipts.length : null) +
        kv('Trade requests', Array.isArray(r.importRequests) ? r.importRequests.length : (Array.isArray(t.importRequests) ? t.importRequests.length : 0)) +
        kv('Settlements', Array.isArray(tradeLedger.settlements) ? tradeLedger.settlements.length : 0) +
        kv('Resource batches', Array.isArray(r.batches) ? r.batches.length : 0) + '</div>', '') +
      '<h3 class="omega-rescc-section-title">Treasury records</h3>' +
      (Array.isArray(receipts) ? statusRows(receipts) : empty('No treasury ledger array is exposed at the common state paths.')) +
      '<h3 class="omega-rescc-section-title">Recent settled trades</h3>' +
      statusRows(Array.isArray(tradeLedger.settlements) ? tradeLedger.settlements : []);
  }
  function panelCascade(country) {
    const r = resourceBucket(country);
    const shipments = Array.isArray(r.logistics && r.logistics.shipments) ? r.logistics.shipments : [];
    const hardening = g.OmegaResourceSystemHardening || g.Omega && g.Omega.ResourceSystemHardening;
    const form = '<form class="omega-rescc-form" data-search-item data-form="cascade">' +
      '<h3>Evaluate transport constraint scenario</h3><p class="omega-rescc-note">This is non-mutating. It reports active policy blockades separately from player-entered hypothetical multipliers.</p><div class="omega-rescc-formgrid">' +
      '<label>Destination country (optional ISO3)<input name="targetCountryId" type="text" maxlength="3" placeholder="e.g. SAU"></label>' +
      '<label>Resource ID<input name="resourceId" type="text" required value="crude_oil"></label>' +
      '<label>Transport mode<select name="transportMode"><option value="ship">Ship</option><option value="pipeline">Pipeline</option><option value="rail">Rail</option><option value="truck">Truck</option></select></label>' +
      '<label>Route ID (optional)<input name="routeId" type="text"></label>' +
      '<label>Factory ID (optional)<input name="factoryId" type="text"></label>' +
      '<label>Terrain multiplier<input name="terrainMultiplier" type="number" min="0.1" max="1" step="0.05" value="1"></label>' +
      '<label>Infrastructure multiplier<input name="infrastructureMultiplier" type="number" min="0.1" max="1" step="0.05" value="1"></label>' +
      '<label>War effect<select name="atWar"><option value="false">No observed war constraint</option><option value="true">Apply war multiplier</option></select></label>' +
      '<label>Sanctions effect<select name="sanctioned"><option value="false">No sanctions multiplier</option><option value="true">Apply sanctions multiplier</option></select></label>' +
      '<label>Border state<select name="borderOpen"><option value="true">Open</option><option value="false">Closed</option></select></label>' +
      '<label>Blockade state<select name="blockaded"><option value="false">Not blockaded</option><option value="true">Blockaded</option></select></label></div>' +
      '<button class="omega-rescc-button" type="submit"' + (!hardening || !hardening.logisticsConstraints ? ' disabled' : '') +
      '>Calculate constraint multipliers</button></form>';
    return (hardening && hardening.diagnostics ? diagnosticCard('Hardening runtime diagnostics', hardening.diagnostics()) : empty('Logistics hardening runtime is unavailable.')) +
      form + (lastCascade ? diagnosticCard('Last sandbox calculation (non-mutating)', lastCascade) : '') +
      '<h3 class="omega-rescc-section-title">Current shipment consequences</h3>' +
      (shipments.length ? statusRows(shipments) : empty('No shipment state is recorded for this country.'));
  }
  function panelCognitive(country) {
    const profile = engine() && engine().getCountryResourceProfile ? engine().getCountryResourceProfile(country) : null;
    const os = g.OmegaCognitiveOS || g.Omega && (g.Omega.CognitiveOS || g.Omega.Cognitive);
    const questions = [
      'Are the resource quantities based on observed or explicitly simulated values?',
      'Is a compatible production or extraction asset registered?',
      'Is there enough unreserved material for the proposed action?',
      'Are reserve and inventory units compatible?',
      'Is the expected transport path open?',
      'Are relevant sanctions or conflict constraints known?',
      'Is a seller price backed by a real offer or only a reference?',
      'Can the treasury afford the cost with an observed balance?',
      'Are technology prerequisites satisfied?',
      'Does the action preserve site and country identity?',
      'Is downstream factory capacity available?',
      'Is the consequence visible in an authoritative ledger?'
    ];
    const options = '<option value="">Select assessment</option><option value="proceed">Verified / proceed</option>' +
      '<option value="review">Uncertain / review</option><option value="block">Failed / block</option>';
    const form = '<form class="omega-rescc-form" data-search-item data-form="cognitive"><h3>12-question server AI decision gate</h3>' +
      '<p class="omega-rescc-note">Answers and a country-scoped game snapshot are evaluated by the server-side Gemini AI endpoint. Only a validated AI response can create an approval for high-impact actions. If the API key, model, or response is unavailable, no verdict is recorded and those actions remain blocked. Simulation values and AI recommendations are not real-world measurements or guaranteed facts.</p>' +
      questions.map(function (q, i) {
        return '<label class="omega-rescc-question"><span>' + (i + 1) + '. ' + esc(q) + '</span>' +
          '<select name="q' + (i + 1) + '" required>' + options + '</select></label>';
      }).join('') + '<button class="omega-rescc-button" type="submit">Evaluate with server AI</button></form>';
    const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
    const decisions = Array.isArray(resourceBucket(country).cognitiveDecisionLedger) ? resourceBucket(country).cognitiveDecisionLedger : [];
    return card('Cognitive runtime availability', policy && typeof policy.evaluateCognitiveGate === 'function' ? 'LOCAL POLICY PERSISTENCE READY' : (os ? 'COGNITIVE OBJECT FOUND; PERSISTENCE API UNAVAILABLE' : 'NO COGNITIVE GATE API CONFIRMED'),
      '<div class="omega-rescc-grid2">' + kv('Runtime object', os ? 'Available' : null) +
      kv('Policy decision persistence', policy && typeof policy.evaluateCognitiveGate === 'function' ? 'Available' : null) +
      kv('Profile record', profile && profile.identity && (profile.identity.name || profile.identity.officialName)) + '</div>' +
      '<p class="omega-rescc-note">Only a server-generated AI assessment with a valid authority marker can authorize nuclear construction or SWF capitalization. Player answers alone cannot approve an action. PROCEED is still subject to deterministic blocker checks; REVIEW, BLOCK, expired, missing, or failed assessments prevent the action.</p>', '') +
      form + '<h3 class="omega-rescc-section-title">Persisted strategic gate decisions</h3>' + statusRows(decisions);
  }
  function panelPower(country) {
    const network = g.Omega && g.Omega.ResourceIndustrialNetwork;
    const r = resourceBucket(country);
    const energyRows = resources(country).filter(function (x) {
      return /oil|gas|uranium|coal|power|energy|hydrogen/i.test(String(x.id) + ' ' + String(x.name));
    });
    const projects = Array.isArray(r.industrialNetwork && r.industrialNetwork.projects) ? r.industrialNetwork.projects :
      (Array.isArray(bucket('economy', country).projects) ? bucket('economy', country).projects : []);
    const technologyContracts = Array.isArray(r.industrialNetwork && r.industrialNetwork.technologyContracts) ? r.industrialNetwork.technologyContracts : [];
    const researchProjects = Array.isArray(r.technologyResearchProjects) ? r.technologyResearchProjects : [];
    const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
    const powerProjects = Array.isArray(r.powerProjects) ? r.powerProjects : [];
    const powerAssets = Array.isArray(r.powerAssets) ? r.powerAssets : [];
    const generation = r.powerGeneration || {};
    const generationLedger = Array.isArray(r.powerGenerationLedger) ? r.powerGenerationLedger : [];
    const controls = '<div class="omega-rescc-actions">' +
      actionButton('power-project', 'Start 2.4 GW nuclear baseload project', { 'project-type': 'NUCLEAR_BASELOAD' },
        !(policy && typeof policy.startPowerProject === 'function')) +
      actionButton('industry-tech', 'Start advanced gas-compression research', { 'technology-id': 'ADVANCED_GAS_COMPRESSION', mode: 'RESEARCH' },
        !(network && network.startTechnologyProject)) +
      actionButton('industry-tech', 'Start enhanced oil-recovery research', { 'technology-id': 'ENHANCED_OIL_RECOVERY', mode: 'RESEARCH' },
        !(network && network.startTechnologyProject)) + '</div>';
    return '<div class="omega-rescc-warning">Nuclear power is a simulated ruleset project, not measured plant capacity. Construction charges native treasury units (not a claimed USD conversion), advances by simulation turns, then generates only when fuel inventory and carbon quota checks allow it. Generation factors are scenario assumptions.</div>' +
      '<div class="omega-rescc-metrics"><div><span>Installed power capacity (MW)</span><strong>' + number(generation.installedCapacityMw) + '</strong></div><div><span>Generated energy this turn (MWh)</span><strong>' + number(generation.generatedMwh) + '</strong></div></div>' +
      controls + '<h3 class="omega-rescc-section-title">Power construction projects</h3>' + statusRows(powerProjects) +
      '<h3 class="omega-rescc-section-title">Commissioned power assets</h3>' + statusRows(powerAssets) +
      '<h3 class="omega-rescc-section-title">Power generation ledger</h3>' + statusRows(generationLedger) +
      '<h3 class="omega-rescc-section-title">Observed energy resource state</h3>' +
      (energyRows.map(function (x) {
        return card(x.name || x.id, x.id, '<div class="omega-rescc-grid2">' +
          kv('Production/day', x.dailyProduction) + kv('Inventory', x.inventory) +
          kv('Reserve', x.reserve) + kv('Unit', x.unit) + '</div>', '');
      }).join('') || empty('No matching energy resource rows are recorded.')) +
      controls + '<h3 class="omega-rescc-section-title">Energy and infrastructure project records</h3>' + statusRows(projects) +
      '<h3 class="omega-rescc-section-title">Industrial technology contracts</h3>' + statusRows(technologyContracts) +
      '<h3 class="omega-rescc-section-title">Resource research runtime projects</h3>' + statusRows(researchProjects) +
      '<h3 class="omega-rescc-section-title">Current mine and power-related outputs</h3>' +
      statusRows(Array.isArray(r.mineProductionLedger) ? r.mineProductionLedger : []);
  }
  function panelEnvironment(country) {
    const network = g.Omega && g.Omega.ResourceIndustrialNetwork;
    const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
    const r = resourceBucket(country);
    const env = r.environment || r.environmental || bucket('economy', country).environment || {};
    const projects = Array.isArray(r.industrialNetwork && r.industrialNetwork.projects) ? r.industrialNetwork.projects :
      (Array.isArray(bucket('economy', country).projects) ? bucket('economy', country).projects : []);
    const technologyContracts = Array.isArray(r.industrialNetwork && r.industrialNetwork.technologyContracts) ? r.industrialNetwork.technologyContracts : [];
    const researchProjects = Array.isArray(r.technologyResearchProjects) ? r.technologyResearchProjects : [];
    const quota = r.carbonQuota || null;
    const carbonLedger = Array.isArray(r.carbonEmissionsLedger) ? r.carbonEmissionsLedger : [];
    const envLedger = Array.isArray(r.environmentalLedger) ? r.environmentalLedger : [];
    const quotaForm = '<form class="omega-rescc-form" data-search-item data-form="carbon-quota"><h3>Set carbon allowance</h3>' +
      '<p class="omega-rescc-note">Separate CO₂-equivalent accounting in tonnes. Factors are simulated gameplay assumptions, not measured national emissions.</p>' +
      '<div class="omega-rescc-formgrid"><label>Allowance (tonnes CO₂e)<input name="allowanceTonnesCo2e" type="number" min="0" step="any" required value="' + esc(quota && quota.allowanceTonnesCo2e != null ? quota.allowanceTonnesCo2e : '') + '" placeholder="Enter allowance"></label>' +
      '<label>Period (turns)<input name="periodTurns" type="number" min="1" step="1" required value="' + esc(quota && quota.periodTurns != null ? quota.periodTurns : 365) + '"></label></div>' +
      '<button class="omega-rescc-button" type="submit"' + (!(policy && typeof policy.setCarbonQuota === 'function') ? ' disabled' : '') + '>Save authoritative quota</button></form>';
    const emissionForm = '<form class="omega-rescc-form" data-search-item data-form="carbon-emission"><h3>Record explicit CO₂e scenario value</h3>' +
      '<p class="omega-rescc-note">This is a user-entered simulation record, not a sensor reading.</p><div class="omega-rescc-formgrid">' +
      '<label>Quantity (tonnes CO₂e)<input name="quantityTonnesCo2e" type="number" min="0.000001" step="any" required></label>' +
      '<label>Source label<input name="source" type="text" required placeholder="e.g. user-entered scenario"></label></div>' +
      '<button class="omega-rescc-button" type="submit"' + (!(policy && typeof policy.recordCarbonEmission === 'function') ? ' disabled' : '') + '>Record emission entry</button></form>';
    const remediationForm = '<form class="omega-rescc-form" data-search-item data-form="remediation"><h3>Fund site remediation</h3>' +
      '<p class="omega-rescc-note">Uses the authoritative treasury debit and environmental ledger. Amount is a site-index reduction, not tonnes of pollution removed.</p>' +
      '<div class="omega-rescc-formgrid"><label>Canonical site ID<input name="siteId" type="text" required placeholder="SITE_..."></label>' +
      '<label>Remediation amount (site index)<input name="amount" type="number" min="1" max="25" step="any" required value="1"></label></div>' +
      '<button class="omega-rescc-button" type="submit"' + (!(policy && typeof policy.remediateSite === 'function') ? ' disabled' : '') + '>Debit treasury and remediate</button></form>';
    const controls = '<div class="omega-rescc-actions">' +
      actionButton('industry-tech', 'Research water recycling', { 'technology-id': 'WATER_RECYCLING', mode: 'RESEARCH' }, !(network && network.startTechnologyProject)) +
      actionButton('industry-tech', 'Research tailings reprocessing', { 'technology-id': 'TAILINGS_REPROCESSING', mode: 'RESEARCH' }, !(network && network.startTechnologyProject)) + '</div>';
    return '<p class="omega-rescc-note">Environmental impact, emissions accounting, quotas and remediation are distinct state records. Emission factors are marked as simulated and are never presented as measured data.</p>' +
      card('Environmental runtime state', Object.keys(env).length ? 'STATE FOUND' : 'NO LEGACY ENVIRONMENT OBJECT',
        Object.keys(env).length ? '<pre class="omega-rescc-json">' + shortJson(env) + '</pre>' : empty('No legacy environment object is recorded; see authoritative environmental/carbon ledgers below.'), '') +
      card('Active carbon quota', quota ? String(quota.status || 'UNKNOWN') : 'NO ACTIVE QUOTA',
        '<div class="omega-rescc-grid2">' + kv('Quota ID', quota && quota.quotaId) + kv('Allowance (tonnes CO₂e)', quota && quota.allowanceTonnesCo2e) +
        kv('Period (turns)', quota && quota.periodTurns) + kv('Start turn', quota && quota.startTurn) + kv('Unit', quota && quota.unit) + '</div>', '') +
      quotaForm + emissionForm + remediationForm + controls +
      '<h3 class="omega-rescc-section-title">CO₂e emission ledger</h3>' + statusRows(carbonLedger) +
      '<h3 class="omega-rescc-section-title">Environmental impact and remediation ledger</h3>' + statusRows(envLedger) +
      '<h3 class="omega-rescc-section-title">Construction projects</h3>' + statusRows(projects) +
      '<h3 class="omega-rescc-section-title">Industrial technology contracts</h3>' + statusRows(technologyContracts) +
      '<h3 class="omega-rescc-section-title">Resource research runtime projects</h3>' + statusRows(researchProjects) +
      '<h3 class="omega-rescc-section-title">Tailings and by-product records</h3>' +
      statusRows(Array.isArray(r.byproducts) ? r.byproducts : (Array.isArray(r.tailings) ? r.tailings : []));
  }
  function panelContent(panel, country) {
    switch (panel) {
      case 'matrix': return panelMatrix(country);
      case 'ontology': return panelOntology(country);
      case 'reserves': return panelReserves(country);
      case 'deposits': return panelDeposits(country);
      case 'extraction': return panelExtraction(country);
      case 'processing': return panelProcessing(country);
      case 'inventory': return panelInventory(country);
      case 'logistics': return panelLogistics(country);
      case 'industrial': return panelIndustrial(country);
      case 'market': return panelMarket(country);
      case 'trade': return panelTrade(country);
      case 'value': return panelValue(country);
      case 'cascade': return panelCascade(country);
      case 'cognitive': return panelCognitive(country);
      case 'power': return panelPower(country);
      case 'environment': return panelEnvironment(country);
      default: return panelMatrix(country);
    }
  }
  function css() {
    return '.omega-rescc-shell{width:96vw;max-width:1440px;height:92vh;max-height:980px;display:flex;flex-direction:column;overflow:hidden;background:#07111f;color:#e2e8f0;border:1px solid #1e7890;border-radius:14px;box-shadow:0 18px 64px #000b;font:13px/1.45 system-ui,sans-serif}' +
      '.omega-rescc-top{padding:13px 16px;background:#0b1b2c;border-bottom:1px solid #1e4560;display:flex;flex-direction:column;gap:10px;flex-shrink:0}' +
      '.omega-rescc-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}' +
      '.omega-rescc-heading h2{font-size:16px;margin:0;color:#67e8f9;letter-spacing:.03em}' +
      '.omega-rescc-headtools{display:flex;gap:7px;align-items:center;flex-wrap:wrap}' +
      '.omega-rescc-input,.omega-rescc-form input,.omega-rescc-form select,.omega-rescc-top select{background:#030b15;color:#f1f5f9;border:1px solid #334b60;border-radius:6px;padding:8px;min-width:0;font:inherit}' +
      '.omega-rescc-search{flex:1;min-width:160px}' +
      '.omega-rescc-nav{display:flex;gap:5px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:thin}' +
      '.omega-rescc-nav button{white-space:nowrap;background:#0a1625;color:#a8c3d3;border:1px solid #253b4f;border-radius:6px;padding:7px 9px;cursor:pointer;font:inherit;font-size:11px}' +
      '.omega-rescc-nav button[aria-current=true]{background:#0e7490;color:#fff;border-color:#67e8f9}' +
      '.omega-rescc-status{padding:9px 16px;background:#0a1523;border-bottom:1px solid #21364b;color:#a5f3fc;font-size:12px;flex-shrink:0}' +
      '.omega-rescc-content{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}' +
      '.omega-rescc-note,.omega-rescc-muted{color:#9fb3c8;font-size:12px;margin:0}' +
      '.omega-rescc-warning{border-left:3px solid #f59e0b;background:#251b0b;color:#fde68a;padding:9px 11px;border-radius:4px;font-size:12px;margin:7px 0}' +
      '.omega-rescc-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}' +
      '.omega-rescc-metrics>div{border:1px solid #263d51;background:#0a1a2b;border-radius:8px;padding:11px;display:flex;flex-direction:column;gap:3px;min-width:0}' +
      '.omega-rescc-metrics span{font-size:11px;color:#91a9bd}.omega-rescc-metrics strong{font-size:15px;color:#cffafe;overflow-wrap:anywhere}' +
      '.omega-rescc-card{border:1px solid #243e53;border-radius:9px;background:#0a1726;padding:11px;display:flex;flex-direction:column;gap:9px;min-width:0}' +
      '.omega-rescc-cardhead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.omega-rescc-cardhead strong{font-size:13px;color:#e2f6ff;overflow-wrap:anywhere}' +
      '.omega-rescc-pill{font-size:10px;color:#a5f3fc;border:1px solid #155e75;border-radius:20px;padding:2px 7px;white-space:nowrap;max-width:50%;overflow:hidden;text-overflow:ellipsis}' +
      '.omega-rescc-cardbody{display:flex;flex-direction:column;gap:6px;min-width:0}.omega-rescc-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px}' +
      '.omega-rescc-kv{display:flex;flex-direction:column;gap:2px;background:#06101c;border:1px solid #172a3b;padding:7px;border-radius:5px;min-width:0;overflow-wrap:anywhere}' +
      '.omega-rescc-kv span{color:#819aaf;font-size:10px}.omega-rescc-kv strong{color:#dcebf7;font-size:12px;font-weight:600;overflow-wrap:anywhere}' +
      '.omega-rescc-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}' +
      '.omega-rescc-button{background:#0b4b63;color:#e0f2fe;border:1px solid #1686a7;border-radius:6px;padding:8px 10px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}' +
      '.omega-rescc-button:disabled{opacity:.38;cursor:not-allowed}.omega-rescc-button:hover:not(:disabled){background:#0e7490}' +
      '.omega-rescc-empty{padding:18px;border:1px dashed #345065;border-radius:8px;color:#9eb3c7;text-align:center}' +
      '.omega-rescc-json{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;color:#cbd5e1;background:#030b15;border-radius:6px;padding:9px;margin:0;font-size:11px}' +
      '.omega-rescc-section-title{font-size:13px;color:#67e8f9;margin:8px 0 0}.omega-rescc-form{border:1px solid #25475f;border-radius:9px;padding:13px;display:flex;flex-direction:column;gap:10px;background:#081625}' +
      '.omega-rescc-form h3{font-size:13px;margin:0;color:#a5f3fc}.omega-rescc-formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:9px}' +
      '.omega-rescc-form label,.omega-rescc-question{display:flex;flex-direction:column;gap:5px;color:#cbd5e1;font-size:11px;min-width:0}' +
      '.omega-rescc-question{border:1px solid #1b3245;border-radius:7px;padding:8px}.omega-rescc-question span{line-height:1.4}' +
      '@media(max-width:600px){.omega-rescc-shell{width:100vw;height:100dvh;max-height:none;border-radius:0}.omega-rescc-heading h2{font-size:13px}.omega-rescc-top{padding:9px}.omega-rescc-content{padding:9px}.omega-rescc-headtools{width:100%}.omega-rescc-search{width:100%;flex-basis:100%}}';
  }
  function ensureModal() {
    if (!g.document) return null;
    let modal = g.document.getElementById('gsrsk-intelligence-modal');
    if (!modal) {
      modal = g.document.createElement('div');
      modal.id = 'gsrsk-intelligence-modal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;width:100vw;height:100vh;background:rgba(2,7,15,.94);z-index:999999;justify-content:center;align-items:center;padding:8px;box-sizing:border-box';
      g.document.body.appendChild(modal);
    }
    if (!modal.__omegaResccBound) {
      modal.__omegaResccBound = true;
      modal.addEventListener('click', function (event) {
        const target = event.target && event.target.closest ? event.target.closest('button') : null;
        if (!target) return;
        if (target.hasAttribute('data-panel')) {
          event.preventDefault();
          openPanel(target.getAttribute('data-panel'));
          return;
        }
        const action = target.getAttribute('data-action');
        if (!action) return;
        event.preventDefault();
        performAction(action, target);
      });
      modal.addEventListener('input', function (event) {
        if (event.target && event.target.id === 'omega-rescc-search') applySearch(event.target.value);
      });
      modal.addEventListener('change', function (event) {
        if (event.target && event.target.id === 'omega-rescc-country') {
          countryId = activeCountry(event.target.value);
          lastOutcome = '';
          render();
        }
      });
      modal.addEventListener('submit', function (event) {
        const form = event.target && event.target.closest ? event.target.closest('form[data-form]') : null;
        if (!form) return;
        event.preventDefault();
        submitForm(form);
      });
    }
    return modal;
  }
  function applySearch(query) {
    const modal = g.document && g.document.getElementById('gsrsk-intelligence-modal');
    if (!modal) return;
    const q = String(query || '').trim().toLowerCase();
    Array.from(modal.querySelectorAll('[data-search-item]')).forEach(function (node) {
      node.style.display = !q || node.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
    });
  }
  function panelId(value) {
    const raw = String(value || 'matrix').trim().toLowerCase();
    const id = ALIASES[raw] || raw;
    return PANELS.some(function (p) { return p.id === id; }) ? id : 'matrix';
  }
  function render(country, panel, modalOverride) {
    const modal = modalOverride || ensureModal();
    if (!modal) return;
    countryId = activeCountry(country || countryId);
    activePanel = panelId(panel || activePanel);
    const options = countryList().map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === countryId ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    const nav = PANELS.map(function (p) {
      return '<button type="button" data-panel="' + p.id + '" aria-current="' + (p.id === activePanel ? 'true' : 'false') + '">' +
        p.num + ' · ' + esc(p.title) + '</button>';
    }).join('');
    modal.innerHTML = '<style>' + css() + '</style><div class="omega-rescc-shell" role="dialog" aria-modal="true" aria-label="OMEGA Resource Command Center">' +
      '<div class="omega-rescc-top"><div class="omega-rescc-heading"><h2>OMEGA RESOURCE COMMAND CENTER · ' + esc(VERSION) + '</h2>' +
      '<div class="omega-rescc-headtools"><select id="omega-rescc-country" aria-label="Country scope">' + options + '</select>' +
      '<button type="button" class="omega-rescc-button" data-action="refresh-panel">Refresh</button>' +
      '<button type="button" class="omega-rescc-button" data-action="close">Close</button></div></div>' +
      '<div class="omega-rescc-headtools"><input id="omega-rescc-search" class="omega-rescc-input omega-rescc-search" type="search" placeholder="Search the current panel…" aria-label="Search current panel">' +
      '<span class="omega-rescc-muted">Scope: ' + esc(countryId) + '</span></div><nav class="omega-rescc-nav" aria-label="Sixteen resource command panels">' + nav + '</nav></div>' +
      '<div id="omega-rescc-status" class="omega-rescc-status">' + esc(lastOutcome || ('Panel: ' + viewTitle(activePanel) + ' · Live state is read when available; missing data is not converted to zero.')) + '</div>' +
      '<main id="omega-rescc-content" class="omega-rescc-content"><h3 class="omega-rescc-section-title">' + esc(viewTitle(activePanel)) + '</h3>' +
      panelContent(activePanel, countryId) + '</main></div>';
    modal.style.display = 'flex';
  }
  function openPanel(panel) { render(countryId, panel); }
  function close() {
    const modal = g.document && g.document.getElementById('gsrsk-intelligence-modal');
    if (modal) modal.style.display = 'none';
  }
  function resultMessage(label, result) {
    const outer = result || {};
    const inner = outer.result && typeof outer.result === 'object' ? outer.result : outer;
    const status = String(inner.status || outer.status || (inner.accepted === false ? 'REJECTED' : 'RECORDED')).toUpperCase();
    const acceptedFalse = outer.status === 'APPLIED' && inner.accepted === false;
    const fail = acceptedFalse || ['FAILED', 'UNAVAILABLE', 'REJECTED', 'BLOCKED', 'ERROR'].indexOf(status) >= 0;
    const request = inner.request || inner.shipment || inner.project || inner.result || {};
    const reason = inner.reason || outer.reason || inner.blockReason || '';
    const id = request.requestId || request.shipmentId || request.projectId || inner.requestId || '';
    return label + ' · ' + (fail ? 'NOT COMPLETED' : 'Runtime response received') + ' · Status: ' + status +
      (id ? ' · ID: ' + id : '') + (reason ? ' · Reason: ' + reason : '');
  }
  function setOutcome(label, result) {
    lastOutcome = resultMessage(label, result);
    render(countryId, activePanel);
  }
  function uniqueRequestId(prefix, resourceId) {
    return prefix + '-' + activeCountry() + '-' + String(resourceId || 'ACTION').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + Date.now();
  }
  function dispatchResourceCommand(action, c, rid) {
    const defs = {
      survey: ['resource', 'OMEGA_RESOURCE_UI_SURVEY_REQUEST'],
      expansion: ['economy', 'OMEGA_RESOURCE_UI_FACTORY_CAPACITY_EXPANSION_REQUEST'],
      reserve: ['resource', 'OMEGA_RESOURCE_UI_RESERVE_BUFFER_REQUEST']
    };
    const def = defs[action];
    if (!def) return { status: 'FAILED', reason: 'UNSUPPORTED_RESOURCE_ACTION' };
    const adapter = g.OmegaResourceAuthoritativeAdapter;
    if (adapter && typeof adapter.install === 'function') adapter.install();
    const mesh = g.Omega && g.Omega.MinistryInteroperability || g.OmegaMinistryInteroperability;
    if (!mesh || typeof mesh.dispatchCommand !== 'function') return { status: 'UNAVAILABLE', reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    const prefix = action === 'survey' ? 'UI-SURVEY' : action === 'expansion' ? 'UI-CAPACITY' : 'UI-SPR';
    const id = uniqueRequestId(prefix, rid);
    return mesh.dispatchCommand(def[0], def[1], activeCountry(c), {
      resourceId: rid,
      requestId: id,
      correlationId: id,
      source: 'OMEGA_RESOURCE_COMMAND_CENTER_UI'
    }, { commandType: def[1], correlationId: id });
  }
  async function performAction(action, button) {
    const c = activeCountry();
    const d = button.dataset || {};
    let result;
    try {
      if (action === 'close') { close(); return; }
      if (action === 'refresh-panel') { render(c, activePanel); return; }
      if (action === 'start-exploration' || action === 'approve-exploration-investment' || action === 'commission-exploration-site') {
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy) result = { status: 'UNAVAILABLE', reason: 'STRATEGIC_RESOURCE_POLICY_RUNTIME_UNAVAILABLE' };
        else if (action === 'start-exploration' && typeof policy.startExploration === 'function')
          result = policy.startExploration(c, { siteId: d['site-id'], projectId: uniqueRequestId('EXPLORE', d['site-id']) });
        else if (action === 'approve-exploration-investment' && typeof policy.approveInvestment === 'function')
          result = policy.approveInvestment(c, { projectId: d['project-id'] });
        else if (action === 'commission-exploration-site' && typeof policy.commissionSite === 'function')
          result = policy.commissionSite(c, { projectId: d['project-id'], siteId: d['site-id'] });
        else result = { status: 'UNAVAILABLE', reason: 'EXPLORATION_ACTION_API_UNAVAILABLE' };
        setOutcome('Exploration lifecycle action', result);
        render(c, activePanel);
        return;
      }
      if (action === 'power-project') {
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy || typeof policy.startPowerProject !== 'function') result = { status: 'UNAVAILABLE', reason: 'POWER_PROJECT_RUNTIME_UNAVAILABLE' };
        else result = policy.startPowerProject(c, { projectId: uniqueRequestId('POWER', d['project-type'] || 'NUCLEAR_BASELOAD'), projectType: d['project-type'] || 'NUCLEAR_BASELOAD' });
        setOutcome('Nuclear baseload project', result);
        return;
      }
      if (action === 'survey' || action === 'expansion' || action === 'reserve') {
        result = dispatchResourceCommand(action, c, d.resourceId);
        setOutcome(action + ' request for ' + (d.resourceId || 'resource'), result);
        return;
      }
      if (action === 'focus-map') {
        const map = g.Game && g.Game.Map;
        if (map && typeof map.activateResourceMode === 'function') {
          map.activateResourceMode([d.resourceId]);
          setOutcome('Map focus', { status: 'APPLIED', result: { accepted: true, resourceId: d.resourceId } });
        } else if (map && typeof map.applyResourceMapFilter === 'function') {
          map.applyResourceMapFilter(d.resourceId);
          setOutcome('Map filter', { status: 'APPLIED', result: { accepted: true, resourceId: d.resourceId } });
        } else setOutcome('Map focus', { status: 'UNAVAILABLE', reason: 'RESOURCE_MAP_FILTER_API_UNAVAILABLE' });
        return;
      }
      if (action === 'fly-deposit') {
        const lat = Number(d.lat), lng = Number(d.lng);
        const map = g.Game && g.Game.Map;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !map) {
          setOutcome('Deposit map focus', { status: 'UNAVAILABLE', reason: 'VALID_COORDINATES_OR_MAP_REQUIRED' });
          return;
        }
        const leaf = map.map || map.leafletMap || map.instance;
        if (leaf && typeof leaf.flyTo === 'function') { leaf.flyTo([lat, lng], 6); result = { status: 'APPLIED' }; }
        else if (typeof map.flyTo === 'function') { map.flyTo([lat, lng], 6); result = { status: 'APPLIED' }; }
        else { setOutcome('Deposit map focus', { status: 'UNAVAILABLE', reason: 'MAP_FLYTO_API_UNAVAILABLE' }); return; }
        setOutcome('Deposit map focus for ' + (d.depositName || 'deposit'), result);
        return;
      }
      if (action === 'extract-site') {
        const net = g.Omega && g.Omega.ResourceIndustrialNetwork;
        if (!net || typeof net.executeSitePipeline !== 'function') result = { status: 'UNAVAILABLE', reason: 'SITE_PIPELINE_API_UNAVAILABLE' };
        else result = await net.executeSitePipeline({ countryId: c, siteId: d.siteId, resourceId: d.resourceId, quantity: Number(d.quantity) || 1 });
        setOutcome('Site pipeline ' + (d.siteId || ''), result);
        return;
      }
      if (action === 'process-factory') {
        const net = g.Omega && g.Omega.ResourceIndustrialNetwork;
        if (!net || typeof net.executeFactoryCycle !== 'function') result = { status: 'UNAVAILABLE', reason: 'FACTORY_CYCLE_API_UNAVAILABLE' };
        else result = net.executeFactoryCycle({ countryId: c, factoryId: d.factoryId, resourceId: d.resourceId, quantity: Number(d.quantity) || 1 });
        setOutcome('Factory cycle ' + (d.factoryId || ''), result);
        return;
      }
      if (action === 'plan-shipment') {
        const runtime = g.Omega && g.Omega.ResourceLogisticsRuntime;
        const ids = String(d.factoryIds || '').split(',').filter(Boolean);
        if (!runtime || typeof runtime.planFromFactoryInput !== 'function') result = { status: 'UNAVAILABLE', reason: 'LOGISTICS_PLAN_API_UNAVAILABLE' };
        else if (!ids.length) result = { status: 'BLOCKED', reason: 'NO_COMPATIBLE_FACTORY' };
        else result = runtime.planFromFactoryInput({
          countryId: c, warehouseId: d.warehouseId, batchId: d.batchId, resourceId: d.resourceId,
          quantity: Number(d.quantity) || 0, unit: d.unit || null, candidateFactoryIds: ids,
          sourceAuthority: 'OBSERVED_RESOURCE_BATCH'
        });
        setOutcome('Logistics plan for ' + (d.batchId || ''), result);
        return;
      }
      if (action === 'industry-tech') {
        const net = g.Omega && g.Omega.ResourceIndustrialNetwork;
        if (!net || typeof net.startTechnologyProject !== 'function') result = { status: 'UNAVAILABLE', reason: 'INDUSTRIAL_TECHNOLOGY_API_UNAVAILABLE' };
        else result = net.startTechnologyProject({ countryId: c, technologyId: d.technologyId, mode: d.mode || 'RESEARCH' });
        setOutcome('Technology project ' + (d.technologyId || ''), result);
        return;
      }
      if (action === 'refresh-market') {
        const market = g.OmegaGlobalMarket || g.Omega && g.Omega.GlobalMarket;
        if (!market || typeof market.rebuild !== 'function') result = { status: 'UNAVAILABLE', reason: 'GLOBAL_MARKET_REBUILD_API_UNAVAILABLE' };
        else result = { status: 'APPLIED', result: { accepted: true, resourceCount: Object.keys(market.rebuild() || {}).length } };
        setOutcome('Market snapshot rebuild', result);
        return;
      }
      setOutcome(action, { status: 'FAILED', reason: 'UNHANDLED_UI_ACTION' });
    } catch (error) {
      setOutcome(action, { status: 'FAILED', reason: String(error && error.message || error) });
    }
  }
  async function submitForm(form) {
    const data = new FormData(form);
    const kind = form.getAttribute('data-form');
    const c = activeCountry();
    let result;
    try {
      if (kind === 'metrology') {
        const converted = convertUnits(data.get('value'), data.get('fromUnit'), data.get('toUnit'));
        if (converted.status !== 'APPLIED') {
          setOutcome('Metrology conversion', converted);
          return;
        }
        lastOutcome = 'Metrology conversion · ' + Number(converted.value).toLocaleString(undefined, { maximumFractionDigits: 10 }) +
          ' ' + converted.label + ' · Dimension: ' + converted.dimension + ' · ' + converted.source;
        render(countryId, activePanel);
        return;
      }
      if (kind === 'carbon-quota') {
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy || typeof policy.setCarbonQuota !== 'function') result = { status: 'UNAVAILABLE', reason: 'CARBON_QUOTA_RUNTIME_UNAVAILABLE' };
        else result = policy.setCarbonQuota(c, {
          quotaId: uniqueRequestId('CARBON-QUOTA', 'tonnes-co2e'),
          allowanceTonnesCo2e: Number(data.get('allowanceTonnesCo2e')), periodTurns: Number(data.get('periodTurns'))
        });
        setOutcome('Carbon quota', result); return;
      }
      if (kind === 'carbon-emission') {
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy || typeof policy.recordCarbonEmission !== 'function') result = { status: 'UNAVAILABLE', reason: 'CARBON_EMISSION_RUNTIME_UNAVAILABLE' };
        else result = policy.recordCarbonEmission(c, {
          transactionId: uniqueRequestId('CO2E', data.get('source')), quantity: Number(data.get('quantityTonnesCo2e')),
          unit: 'TONNES_CO2E', source: String(data.get('source') || 'USER_ENTERED_SCENARIO'),
          provenance: 'USER_ENTERED_SCENARIO_VALUE'
        });
        setOutcome('User-entered CO₂e scenario record', result); return;
      }
      if (kind === 'remediation') {
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy || typeof policy.remediateSite !== 'function') result = { status: 'UNAVAILABLE', reason: 'REMEDIATION_RUNTIME_UNAVAILABLE' };
        else result = policy.remediateSite(c, { siteId: data.get('siteId'), amount: Number(data.get('amount')), transactionId: uniqueRequestId('REMEDIATION', data.get('siteId')) });
        setOutcome('Environmental remediation', result); return;
      }
      if (kind === 'swf-capitalise') {
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy || typeof policy.capitalizeSovereignWealthFund !== 'function') result = { status: 'UNAVAILABLE', reason: 'SWF_CAPITALIZATION_RUNTIME_UNAVAILABLE' };
        else result = policy.capitalizeSovereignWealthFund(c, {
          transactionId: uniqueRequestId('SWF-CAPITAL', data.get('amount')), amount: Number(data.get('amount'))
        });
        setOutcome('Sovereign wealth fund capitalization', result);
        return;
      }
      if (kind === 'trade-request') {
        const trade = g.OmegaGlobalTrade || g.Omega && g.Omega.GlobalTrade;
        if (!trade || typeof trade.createRequest !== 'function') result = { status: 'UNAVAILABLE', reason: 'TRADE_REQUEST_CREATION_API_UNAVAILABLE' };
        else result = trade.createRequest(c, {
          requestId: uniqueRequestId('TRADE-UI', data.get('resourceId')),
          targetCountryId: data.get('targetCountryId'), resourceId: data.get('resourceId'),
          quantity: Number(data.get('quantity')), unitPrice: Number(data.get('unitPrice')),
          source: 'OMEGA_RESOURCE_COMMAND_CENTER_UI'
        });
        setOutcome('Bilateral supply request', result);
        return;
      }
      if (kind === 'factory-project') {
        const net = g.Omega && g.Omega.ResourceIndustrialNetwork;
        if (!net || typeof net.startFactoryProject !== 'function') result = { status: 'UNAVAILABLE', reason: 'FACTORY_PROJECT_API_UNAVAILABLE' };
        else result = net.startFactoryProject({
          countryId: c, resourceId: data.get('resourceId'), cost: Number(data.get('cost')),
          capacityPerDay: Number(data.get('capacityPerDay')), buildDays: Number(data.get('buildDays'))
        });
        setOutcome('Factory construction project', result);
        return;
      }
      if (kind === 'cascade') {
        const hardening = g.OmegaResourceSystemHardening || g.Omega && g.Omega.ResourceSystemHardening;
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        const hypothetical = hardening && typeof hardening.logisticsConstraints === 'function'
          ? hardening.logisticsConstraints({
            terrainMultiplier: Number(data.get('terrainMultiplier')),
            infrastructureMultiplier: Number(data.get('infrastructureMultiplier')),
            atWar: data.get('atWar') === 'true',
            sanctioned: data.get('sanctioned') === 'true',
            borderOpen: data.get('borderOpen') === 'true',
            blockaded: data.get('blockaded') === 'true'
          }) : { status: 'UNAVAILABLE', reason: 'LOGISTICS_CONSTRAINT_API_UNAVAILABLE' };
        const target = String(data.get('targetCountryId') || '').trim().toUpperCase();
        const scope = { resourceId: String(data.get('resourceId') || '').trim(), transportMode: String(data.get('transportMode') || 'ship'),
          routeId: String(data.get('routeId') || '').trim() || null, factoryId: String(data.get('factoryId') || '').trim() || null };
        const routeChecks = [];
        if (policy && typeof policy.isRouteBlocked === 'function') {
          routeChecks.push({ countryId: c, ...policy.isRouteBlocked(c, scope) });
          if (target && target !== c) routeChecks.push({ countryId: target, ...policy.isRouteBlocked(target, scope) });
        }
        lastCascade = { hypotheticalConstraints: hypothetical,
          authoritativeRoutePolicy: { checked: routeChecks.length > 0, scope, status: routeChecks.some(x => x.blocked) ? 'BLOCKED' : (routeChecks.length ? 'NO_ACTIVE_BLOCKADE_FOUND' : 'UNAVAILABLE'),
            checks: routeChecks, mutatesGameplay: false } };
        result = { status: routeChecks.length || hypothetical.status !== 'UNAVAILABLE' ? 'APPLIED' : 'UNAVAILABLE',
          result: { accepted: routeChecks.length > 0 || hypothetical.status !== 'UNAVAILABLE', simulation: 'NON_MUTATING_SCENARIO', constraints: lastCascade } };
        setOutcome('Transport constraint and active policy screening', result);
        return;
      }
      if (kind === 'cognitive') {
        const vals = [];
        for (let i = 1; i <= 12; i++) vals.push(String(data.get('q' + i) || '').toLowerCase());
        if (vals.some(function (x) { return ['proceed', 'review', 'block'].indexOf(x) < 0; })) {
          setOutcome('Server AI decision', { status: 'BLOCKED', reason: 'ALL_12_QUESTIONS_REQUIRE_ANSWERS' });
          return;
        }
        const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
        if (!policy || typeof policy.evaluateCognitiveGate !== 'function') {
          setOutcome('Server AI decision', { status: 'UNAVAILABLE', reason: 'COGNITIVE_CHECKLIST_RUNTIME_UNAVAILABLE' });
          return;
        }
        if (typeof g.fetch !== 'function') {
          setOutcome('Server AI decision', { status: 'UNAVAILABLE', reason: 'SERVER_AI_FETCH_UNAVAILABLE' });
          return;
        }
        const decisionId = uniqueRequestId('COGNITIVE-AI', 'screen');
        let response, body;
        try {
          response = await g.fetch('/api/resource-decision/ai-evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryId: c, decisionId, answers: vals, gameState: aiCountrySnapshot(c) })
          });
          body = await response.json();
        } catch (error) {
          setOutcome('Server AI decision', { status: 'UNAVAILABLE', reason: 'SERVER_AI_REQUEST_FAILED', detail: String(error && error.message || error) });
          return;
        }
        const liveState = state() || {};
        const liveTurn = liveState.simulation && liveState.simulation.turn != null
          ? Number(liveState.simulation.turn)
          : (liveState.turn != null ? Number(liveState.turn) : (liveState.simulationTurn != null ? Number(liveState.simulationTurn) : null));
        const assessedTurn = body && body.context && body.context.simulationTurn != null ? Number(body.context.simulationTurn) : null;
        const responseMatchesRequest = body && body.decisionId === decisionId && body.context && body.context.countryId === c;
        const contextStillCurrent = assessedTurn === null || liveTurn === null || assessedTurn === liveTurn;
        if (!response.ok || !body || body.ok !== true || body.status !== 'COMPLETED' ||
            !responseMatchesRequest || !contextStillCurrent ||
            !body.assessment || body.assessment.aiGenerated !== true ||
            body.assessment.authority !== 'OMEGA_SERVER_RESOURCE_DECISION_AI') {
          setOutcome('Server AI decision', {
            status: 'UNAVAILABLE',
            reason: !responseMatchesRequest ? 'AI_RESPONSE_CONTEXT_OR_CORRELATION_MISMATCH' :
              (!contextStillCurrent ? 'SIMULATION_STATE_CHANGED_DURING_AI_REVIEW' :
                (body && body.error || body && body.message || 'SERVER_AI_VERDICT_UNAVAILABLE')),
            httpStatus: response.status,
            verdictRecorded: false
          });
          return;
        }
        result = policy.evaluateCognitiveGate(c, {
          decisionId,
          answers: vals,
          aiAssessment: body.assessment
        });
        setOutcome('Server AI decision', result);
        render(c, activePanel);
        return;
      }
      setOutcome('Form submit', { status: 'FAILED', reason: 'UNHANDLED_FORM' });
    } catch (error) {
      setOutcome(kind, { status: 'FAILED', reason: String(error && error.message || error) });
    }
  }
  function install() {
    const e = engine();
    if (!e || e.__omegaResourceCommandCenterUIPatched === VERSION) return false;
    e.__omegaResourceCommandCenterUIPatched = VERSION;
    e.openModal = function (country, panel) { render(country, panel || 'matrix'); };
    e.renderModalContent = function (modal, country, panel) { render(country, panel || 'matrix', modal); };
    e.closeModal = close;
    const cabinet = g.OmegaCabinetUI;
    if (cabinet) {
      if (typeof cabinet.getResource16CardsHtml === 'function' && !cabinet.__omegaResccCardPatch) {
        const oldCards = cabinet.getResource16CardsHtml;
        cabinet.getResource16CardsHtml = function () {
          let html = oldCards.call(this);
          const routeCountry = activeCountry(this.activeCountry || countryId);
          const panelByPoint = {
            '01': 'matrix', '02': 'ontology', '03': 'reserves', '04': 'deposits',
            '05': 'extraction', '06': 'processing', '07': 'inventory', '08': 'logistics',
            '09': 'industrial', '10': 'market', '11': 'trade', '12': 'value',
            '13': 'cascade', '14': 'cognitive', '15': 'power', '16': 'environment'
          };
          html = html.replace(/<div class="dept-card" style=[\s\S]*?(?=<div class="dept-card" style=|$)/g, function (block) {
            const point = block.match(/<span>(\d{2})\.\s/);
            if (!point || !panelByPoint[point[1]]) return block;
            const panel = panelByPoint[point[1]];
            return block.replace(/onclick="[^"]*"/, 'onclick="window.ResourceMinistryEngine.openModal(\'' + routeCountry + '\', \'' + panel + '\');"');
          });
          html = html.replace('18 Commodity Ontology Matrix', 'Commodity Ontology Matrix')
            .replace('593 geocoded global mining concessions, ore purities, and spatial reserve clusters.', 'Authoritative global deposit registry; missing values remain unavailable.')
            .replace('Upgrade Extraction & RRR ($800M)', 'Open Extraction & Depletion Console')
            .replace('Commission Smelter Complex ($1.2B)', 'Open Processing & Factory Console')
            .replace('Drawdown / Expand SPR Silos', 'Inspect Inventory / Request SPR Transfer')
            .replace('Negotiate Supply Agreements', 'Create Bilateral Supply Request')
            .replace('Capitalize National SWF', 'Open Treasury & SWF Console')
            .replace('Build 2.4GW Nuclear Baseload ($2.0B)', 'Open Power Systems Console')
            .replace('Deploy Green Infrastructure ($600M)', 'Open Environmental Controls')
            .replace('Power Grid & 2.4GW Baseload Mix', 'Power Systems & Energy Projects')
            .replace('2,400MW nuclear baseload, combined-cycle gas peakers, offshore wind, and black-start capability.', 'A simulated 2.4 GW project uses native treasury units, turn-based construction, available uranium inventory and carbon-quota checks. Output is scenario-derived, not observed plant data.')
            .replace('Cognitive Situation & 12-Question Gate', 'Cognitive Review & 12-Question Gate')
            .replace('Red-Team counterfactual critics, 10-dimensional health evaluations, and AI briefing generation.', 'A player-entered 12-question screening decision is persisted. PROCEED gates power/SWF actions; REVIEW or BLOCK prevents them. It is not AI-generated.')
            .replace('Run AI Cognitive Decision Gate', 'Open 12-Question Decision Review')
            .replace('Tailings reprocessing, emissions cap-and-trade, industrial water recycling, and green transition.', 'Inspect tonnes-CO2e quota enforcement, emission provenance, by-product records and treasury-backed site-index remediation. Emission factors are simulated assumptions, not measured data.')
            .replace('Canonical conversion factors for MMBTU, BBL, Metric Tons and Murmur64 checksum validation.', 'Canonical mass, volume and energy conversion with physical-dimension checks.')
            .replace('Verified proven reserves, daily extraction mutation rates, and sovereign resource balance sheets.', 'Observed or explicitly simulated reserve balances, extraction records, and source-authority labels.')
            .replace('Block caving, open-cast stripping, and Reserve Replacement Ratio (RRR) optimization.', 'Site-specific extraction eligibility, reserve depletion, and survey/request status from the installed runtime.')
            .replace('Continuous clearing, order book matching, Brent/WTI arbitrage, and derivative hedging.', 'Observed order-book matching, reference-only quotes, and clearing history; no derivatives engine is assumed.')
            .replace('Long-term bilateral offtake agreements, Letters of Credit, import/export tariffs, and sanctions.', 'Bilateral import requests, counterparty review, observed relations and sanctions, and settlement ledger.')
            .replace('Resource rent capture, Sovereign Wealth Fund capitalization, and Dutch Disease mitigation.', 'Inspect native treasury balances and the ledger-backed sovereign-fund contribution history. No unsupported USD conversion is assumed.')
            .replace('Non-linear supply shock propagation, chokepoint blockades, and contingency war-gaming.', 'Non-mutating transport-constraint multipliers and current shipment exposure; no unverified consequence is applied.')
            .replace('Open Commodity Trading Desk', 'Inspect Commodity Market & Price Discovery')
            .replace('Open Power Systems Console', 'Inspect Energy Assets & Research Projects')
            .replace('Open Environmental Controls', 'Open Environmental & Carbon Controls')
            .replace('Cognitive Review & 12-Question Gate', 'Cognitive Risk-Screening Checklist')
            .replace('Open 12-Question Decision Review', 'Open 12-Question Screening Checklist')
            .replace('Carbon Quotas & Circular Remediation', 'Environmental Records & Circular Industry');
          return html;
        };
        cabinet.__omegaResccCardPatch = true;
      }
      cabinet.executeResource16Point = function (pointKey, directiveType) {
        const routes = { p01: 'matrix', p02: 'ontology', p03: 'reserves', p04: 'deposits', p05: 'extraction', p06: 'processing', p07: 'inventory', p08: 'logistics', p09: 'industrial', p10: 'market', p11: 'trade', p12: 'value', p13: 'cascade', p14: 'cognitive', p15: 'power', p16: 'environment' };
        const route = routes[String(pointKey || '').toLowerCase()];
        if (route) { render(activeCountry(), route); return { status: 'OPENED_PANEL', panel: route }; }
        if (typeof cabinet.executeResourceDirective === 'function') {
          const result = cabinet.executeResourceDirective(directiveType);
          const outer = result || { status: 'UNAVAILABLE', reason: 'DIRECTIVE_RETURNED_NO_RESULT' };
          if (g.OmegaCognitiveOS && typeof g.OmegaCognitiveOS.learnFromExecution === 'function') {
            const inner = outer.result || outer;
            const accepted = outer.status === 'APPLIED' && inner.accepted !== false;
            if (accepted) g.OmegaCognitiveOS.learnFromExecution({ success: true, result: inner, notes: 'Resource action result was confirmed by its runtime.' }, pointKey);
          }
          return outer;
        }
        return { status: 'UNAVAILABLE', reason: 'RESOURCE_DIRECTIVE_RUNTIME_UNAVAILABLE' };
      };
      cabinet.executeResourceDirective = function (directiveType, resourceId) {
        const eNow = engine();
        if (!eNow || typeof eNow.executeDirective !== 'function') return { status: 'UNAVAILABLE', reason: 'RESOURCE_DIRECTIVE_RUNTIME_UNAVAILABLE' };
        const result = eNow.executeDirective(directiveType, resourceId);
        const outer = result || { status: 'UNAVAILABLE', reason: 'DIRECTIVE_RETURNED_NO_RESULT' };
        if (outer.status === 'FAILED' || outer.status === 'UNAVAILABLE' || outer.status === 'REJECTED') {
          if (g.showOmegaNotification) g.showOmegaNotification('RESOURCE ACTION NOT COMPLETED', String(outer.reason || outer.status), 'warning');
        }
        return outer;
      };
      cabinet.initLiveResourceGraph = function () {
        const canvas = g.document && g.document.getElementById('resource-live-canvas');
        if (!canvas || !canvas.getContext) return;
        if (g._resourceChartTimer) { g.clearInterval(g._resourceChartTimer); g._resourceChartTimer = null; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width || 800;
        canvas.height = rect.height || 160;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#a5f3fc';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('AUTHORITATIVE TIME-SERIES NOT AVAILABLE', 16, 30);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('No synthetic random telemetry is shown. Use the resource panels for current observed/runtime values.', 16, 54);
      };
    }
    return true;
  }
  const API = Object.freeze({
    VERSION,
    install,
    openPanel: function (panel) { render(countryId, panel); },
    open: function (country, panel) { render(country, panel); },
    close,
    convertUnits,
    getState: function () { return { countryId: countryId, panel: activePanel, lastOutcome: lastOutcome }; }
  });
  g.Omega = g.Omega || {};
  g.Omega.ResourceCommandCenterUI = API;
  g.OmegaResourceCommandCenterUI = API;
  try { install(); } catch (e) { g.OmegaResourceCommandCenterUIError = String(e && e.message || e); }
})(typeof window !== 'undefined' ? window : globalThis);
