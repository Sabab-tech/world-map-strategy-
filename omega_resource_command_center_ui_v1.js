/* OMEGA Resource Command Center UI v1.1.0
 * Binds all sixteen Resource Ministry cards to scoped live-data panels.
 * Actions report authoritative runtime outcomes; unavailable systems never report success.
 */
(function (g) {
  'use strict';
  const VERSION = '1.1.0';
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
  function identityOfRow(row) {
    if (!row || typeof row !== 'object') return 'VALUE:' + String(row);
    for (const key of ['requestId','eventId','batchId','shipmentId','projectId','reservationId','siteId',
      'canonicalSiteId','siteReferenceKey','mineId','occurrenceKey','commandId','correlationId','routeId','id']) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return key + ':' + String(row[key]);
    }
    try { return 'JSON:' + JSON.stringify(row); } catch (_) { return 'OBJECT:' + String(row); }
  }
  function mergeDataValues(base, incoming) {
    if (incoming === undefined || incoming === null || incoming === '') return base;
    if (Array.isArray(base) && Array.isArray(incoming)) {
      const out = [], index = new Map();
      const add = row => {
        const key = identityOfRow(row);
        if (index.has(key)) out[index.get(key)] = mergeDataValues(out[index.get(key)], row);
        else { index.set(key, out.length); out.push(row); }
      };
      base.forEach(add); incoming.forEach(add); return out;
    }
    if (base && incoming && typeof base === 'object' && typeof incoming === 'object' &&
        !Array.isArray(base) && !Array.isArray(incoming)) {
      const out = Object.assign({}, base);
      Object.keys(incoming).forEach(key => {
        if (key === '__proto__' || key === 'constructor') return;
        out[key] = Object.prototype.hasOwnProperty.call(out,key) ? mergeDataValues(out[key],incoming[key]) : incoming[key];
      });
      return out;
    }
    return incoming;
  }
  function countryBucket(domain, country) {
    const group = state()[domain], canonical = activeCountry(country);
    if (!group || typeof group !== 'object' || Array.isArray(group)) return {};
    const keys = Object.keys(group).filter(key =>
      key && !['SCHEMAVERSION','VERSION','METADATA','DEFAULTS','GLOBAL','SHARED'].includes(String(key).trim().toUpperCase()) &&
      normaliseCountry(key) === canonical && group[key] && typeof group[key] === 'object' && !Array.isArray(group[key]));
    // Keep old display-name buckets as fallback data, while canonical-key values win conflicts.
    keys.sort((a,b) => Number(String(a).trim().toUpperCase() === canonical) - Number(String(b).trim().toUpperCase() === canonical));
    return keys.reduce((out,key) => mergeDataValues(out,group[key]),{});
  }
  function bucket(domain, country) { return countryBucket(domain,country); }
  function resourceBucket(country) {
    return mergeDataValues(countryBucket('resources',country),countryBucket('resource',country));
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
    const primaryResourceState = countryState('resource');
    const r = Object.keys(primaryResourceState).length ? primaryResourceState : countryState('resources');
    const fin = countryState('finance');
    const eco = countryState('economy');
    const impact = r.environmentalImpact && typeof r.environmentalImpact === 'object' ? r.environmentalImpact : {};
    const bySite = impact.bySite && typeof impact.bySite === 'object' ? impact.bySite : {};
    const boundedSites = {};
    Object.keys(bySite).slice(-40).forEach(function (siteId) {
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
        carbonQuotaEnforcementLedger: (Array.isArray(r.carbonQuotaEnforcementLedger) ? r.carbonQuotaEnforcementLedger : []).slice(-12),
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
    g: { label: 'Gram (g)', dimension: 'MASS', factor: 0.001, base: 'kg' },
    kg: { label: 'Kilogram (kg)', dimension: 'MASS', factor: 1, base: 'kg' },
    metric_tonne: { label: 'Metric tonne (t)', dimension: 'MASS', factor: 1000, base: 'kg' },
    kilotonne: { label: 'Kilotonne (kt)', dimension: 'MASS', factor: 1000000, base: 'kg' },
    megatonne: { label: 'Megatonne (Mt)', dimension: 'MASS', factor: 1000000000, base: 'kg' },
    lb: { label: 'Pound (lb)', dimension: 'MASS', factor: 0.45359237, base: 'kg' },
    litre: { label: 'Litre (L)', dimension: 'VOLUME', factor: 1, base: 'L' },
    bbl: { label: 'Oil barrel (bbl)', dimension: 'VOLUME', factor: 158.987294928, base: 'L' },
    cubic_metre: { label: 'Cubic metre (m³)', dimension: 'VOLUME', factor: 1000, base: 'L' },
    gj: { label: 'Gigajoule (GJ)', dimension: 'ENERGY', factor: 1, base: 'GJ' },
    mmbtu: { label: 'Million Btu (MMBtu)', dimension: 'ENERGY', factor: 1.05505585262, base: 'GJ' },
    kwh: { label: 'Kilowatt-hour (kWh)', dimension: 'ENERGY', factor: 0.0036, base: 'GJ' },
    mwh: { label: 'Megawatt-hour (MWh)', dimension: 'ENERGY', factor: 3.6, base: 'GJ' },
    gwh: { label: 'Gigawatt-hour (GWh)', dimension: 'ENERGY', factor: 3600, base: 'GJ' }
  });
  function unitIdFromDeclaration(candidate) {
    if (candidate && typeof candidate === 'object') {
      for (const key of ['unit', 'standardUnit', 'declaredStandardUnit', 'unitOfMeasure', 'measurementUnit', 'symbol', 'value', 'name']) {
        if (candidate[key] !== undefined && candidate[key] !== null) {
          const resolved = unitIdFromDeclaration(candidate[key]);
          if (resolved) return resolved;
        }
      }
      return null;
    }
    if (candidate === undefined || candidate === null || String(candidate).trim() === '') return null;
    const original = String(candidate).trim();
    if (original === 'Mt') return 'megatonne';
    const key = original.toUpperCase().replace(/[\s-]+/g, '_').replace(/[().]/g, '');
    const aliases = {
      G: 'g', GRAM: 'g', GRAMS: 'g', GM: 'g',
      KG: 'kg', KGS: 'kg', KILOGRAM: 'kg', KILOGRAMS: 'kg',
      T: 'metric_tonne', TON: 'metric_tonne', TONS: 'metric_tonne', TONNE: 'metric_tonne', TONNES: 'metric_tonne',
      METRIC_TON: 'metric_tonne', METRIC_TONS: 'metric_tonne', METRIC_TONNE: 'metric_tonne', METRIC_TONNES: 'metric_tonne',
      MT: 'metric_tonne', METRIC_TONNES: 'metric_tonne',
      KT: 'kilotonne', KTON: 'kilotonne', KTONS: 'kilotonne', KILOTON: 'kilotonne', KILOTONS: 'kilotonne',
      KILOTONNE: 'kilotonne', KILOTONNES: 'kilotonne', THOUSAND_TONNES: 'kilotonne',
      MEGATON: 'megatonne', MEGATONS: 'megatonne', MEGATONNE: 'megatonne', MEGATONNES: 'megatonne',
      MILLION_TONNES: 'megatonne', MILLION_TONS: 'megatonne', MT_OF: 'megatonne',
      LB: 'lb', LBS: 'lb', POUND: 'lb', POUNDS: 'lb',
      L: 'litre', LT: 'litre', LITER: 'litre', LITERS: 'litre', LITRE: 'litre', LITRES: 'litre',
      BBL: 'bbl', BBLS: 'bbl', BARREL: 'bbl', BARRELS: 'bbl', BOE: 'bbl',
      M3: 'cubic_metre', CUBIC_METER: 'cubic_metre', CUBIC_METERS: 'cubic_metre',
      CUBIC_METRE: 'cubic_metre', CUBIC_METRES: 'cubic_metre',
      GJ: 'gj', GIGAJOULE: 'gj', GIGAJOULES: 'gj',
      MMBTU: 'mmbtu', BTU: 'mmbtu',
      KWH: 'kwh', KILOWATT_HOUR: 'kwh', KILOWATT_HOURS: 'kwh',
      MWH: 'mwh', MEGAWATT_HOUR: 'mwh', MEGAWATT_HOURS: 'mwh',
      GWH: 'gwh', GIGAWATT_HOUR: 'gwh', GIGAWATT_HOURS: 'gwh'
    };
    if (aliases[key]) return aliases[key];
    return Object.keys(UNIT_DEFINITIONS).find(function (id) { return id.toUpperCase() === key; }) || null;
  }
  function resourceKey(value) {
    return String(value === undefined || value === null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  }
  function resourceUnitId(resourceId, country) {
    const wanted = resourceKey(resourceId);
    if (!wanted) return null;
    const type = resourceTypes().find(function (row) {
      return resourceKey(row && (row.id || row.code || row.resourceId || row.resourceTypeId)) === wanted;
    });
    const summary = resources(country).find(function (row) {
      return resourceKey(row && (row.id || row.code || row.resourceId || row.resourceTypeId)) === wanted;
    });
    const sites = deposits().filter(function (site) {
      const id = site && (site.resourceId || site.resourceTypeId || site.resId);
      return resourceKey(id) === wanted && siteBelongsToCountry(site, country);
    });
    const candidates = [];
    [type, summary].filter(Boolean).forEach(function (row) {
      ['declaredStandardUnit', 'standardUnit', 'unitOfMeasure', 'measurementUnit', 'quantityUnit', 'unit'].forEach(function (key) {
        if (row[key] !== undefined && row[key] !== null) candidates.push(row[key]);
      });
    });
    sites.forEach(function (site) {
      ['reserve', 'recoverableReserve', 'quantitative', 'quantity'].forEach(function (key) {
        if (site[key] !== undefined && site[key] !== null) candidates.push(site[key]);
      });
      ['reserveUnit', 'standardUnit', 'unitOfMeasure', 'measurementUnit', 'unit'].forEach(function (key) {
        if (site[key] !== undefined && site[key] !== null) candidates.push(site[key]);
      });
    });
    for (const candidate of candidates) {
      const resolved = unitIdFromDeclaration(candidate);
      if (resolved) return resolved;
    }
    return null;
  }
  function siteBelongsToCountry(site, country) {
    const siteCountry = site && (site.countryId || site.countryCode || site.countryIso3 || site.country || site.hostCountryIso3);
    if (!siteCountry) return false;
    let siteCode = String(siteCountry).trim().toUpperCase();
    let countryCode = String(country || activeCountry()).trim().toUpperCase();
    try {
      if (typeof normaliseCountry === 'function') {
        siteCode = normaliseCountry(siteCode);
        countryCode = normaliseCountry(countryCode);
      }
    } catch (_) {}
    return siteCode === countryCode;
  }
  function sitesForResource(country, resourceId) {
    const wanted = resourceKey(resourceId);
    if (!wanted) return [];
    return deposits().filter(function (site) {
      const id = site && (site.resourceId || site.resourceTypeId || site.resId);
      return resourceKey(id) === wanted && siteBelongsToCountry(site, country);
    });
  }
  function resourceChoices(country) {
    const byId = new Map();
    resourceTypes().concat(resources(country)).forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      const id = row.id || row.code || row.resourceId || row.resourceTypeId;
      if (!id) return;
      const key = resourceKey(id);
      const existing = byId.get(key) || {};
      byId.set(key, Object.assign({}, existing, row, { id: String(id), name: row.name || row.label || existing.name || String(id) }));
    });
    return Array.from(byId.values()).sort(function (a, b) {
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
  }
  function unitOptionsHtml(unitId, selectedUnitId) {
    if (!unitId || !UNIT_DEFINITIONS[unitId]) {
      return '<option value="" selected disabled>Unit not declared in source data</option>';
    }
    const dimension = UNIT_DEFINITIONS[unitId].dimension;
    return Object.keys(UNIT_DEFINITIONS).filter(function (id) {
      return UNIT_DEFINITIONS[id].dimension === dimension;
    }).map(function (id) {
      return '<option value="' + esc(id) + '"' + (id === selectedUnitId ? ' selected' : '') + '>' +
        esc(UNIT_DEFINITIONS[id].label) + '</option>';
    }).join('');
  }
  function locationOptionsHtml(country, resourceId) {
    const sites = sitesForResource(country, resourceId);
    const options = sites.map(function (site, index) {
      const id = site.siteId || site.id || site.siteKey || site.assetId || site.siteName || ('DEPOSIT_' + index);
      const name = site.siteName || site.name || site.label || String(id);
      const region = site.region || site.locality || site.adminRegion;
      return '<option value="' + esc(id) + '">' + esc(region ? name + ' · ' + region : name) + '</option>';
    }).join('');
    return '<option value="">All locations / no specific site</option>' +
      (options || '<option value="" disabled>No matching site records for this resource and country</option>');
  }
  function targetUnitId(sourceUnitId) {
    const source = UNIT_DEFINITIONS[sourceUnitId];
    if (!source) return null;
    const preferred = {
      g: 'kg', kg: 'metric_tonne', metric_tonne: 'kg', kilotonne: 'metric_tonne',
      megatonne: 'kilotonne', lb: 'kg', litre: 'cubic_metre', bbl: 'litre',
      cubic_metre: 'litre', gj: 'mwh', mmbtu: 'gj', kwh: 'gj', mwh: 'gj', gwh: 'mwh'
    }[sourceUnitId];
    if (preferred && UNIT_DEFINITIONS[preferred] && UNIT_DEFINITIONS[preferred].dimension === source.dimension) return preferred;
    return Object.keys(UNIT_DEFINITIONS).find(function (id) {
      return UNIT_DEFINITIONS[id].dimension === source.dimension && id !== sourceUnitId;
    }) || sourceUnitId;
  }
  function replaceSelectOptions(select, optionsHtml, selectedValue) {
    if (!select) return;
    select.innerHTML = optionsHtml;
    if (selectedValue !== undefined && selectedValue !== null) select.value = String(selectedValue);
  }
  function syncTargetUnitOptions(form, sourceUnitId, preferredTarget) {
    if (!form || typeof form.querySelector !== 'function') return;
    const target = form.querySelector('[name="toUnit"]');
    const source = UNIT_DEFINITIONS[sourceUnitId];
    if (!target) return;
    if (!source) {
      replaceSelectOptions(target, '<option value="" selected disabled>Select a resource with a declared unit</option>', '');
      return;
    }
    const candidates = Object.keys(UNIT_DEFINITIONS).filter(function (id) {
      return UNIT_DEFINITIONS[id].dimension === source.dimension;
    });
    const selected = candidates.indexOf(preferredTarget) >= 0 ? preferredTarget :
      (candidates.find(function (id) { return id !== sourceUnitId; }) || sourceUnitId);
    replaceSelectOptions(target, candidates.map(function (id) {
      return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(UNIT_DEFINITIONS[id].label) + '</option>';
    }).join(''), selected);
  }
  function syncResourceForm(form, country) {
    if (!form || typeof form.querySelector !== 'function') return;
    const resourceSelect = form.querySelector('#omega-rescc-resource-select');
    const sourceSelect = form.querySelector('[name="fromUnit"]');
    const targetSelect = form.querySelector('[name="toUnit"]');
    const locationSelect = form.querySelector('#omega-rescc-location-select');
    const help = form.querySelector('#omega-rescc-unit-help');
    const submit = form.querySelector('button[type="submit"]');
    const resourceId = resourceSelect && resourceSelect.value;
    const unitId = resourceUnitId(resourceId, country);
    const choices = unitOptionsHtml(unitId, unitId);
    replaceSelectOptions(sourceSelect, choices, unitId || '');
    syncTargetUnitOptions(form, unitId, targetUnitId(unitId));
    if (locationSelect) replaceSelectOptions(locationSelect, locationOptionsHtml(country, resourceId), '');
    if (help) help.textContent = unitId
      ? 'Unit auto-selected from the resource catalog/site data. Available conversions are limited to the same physical dimension.'
      : 'No unit is declared for this resource. A safe conversion cannot be offered until its source data defines one.';
    if (submit) submit.disabled = !unitId;
  }
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
  // Raw runtime objects are for diagnostics/API consumers, not the player-facing screen.
  function diagnosticCard() { return ''; }
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
    const choices = resourceChoices(country);
    const selectedId = choices.length ? String(choices[0].id) : '';
    const declaredUnit = selectedId ? resourceUnitId(selectedId, country) : null;
    const defaultTarget = targetUnitId(declaredUnit);
    const resourceOptions = choices.length ? choices.map(function (row) {
      const id = String(row.id);
      const unit = resourceUnitId(id, country);
      const detail = unit && UNIT_DEFINITIONS[unit] ? ' · ' + UNIT_DEFINITIONS[unit].label : ' · unit not recorded';
      return '<option value="' + esc(id) + '"' + (id === selectedId ? ' selected' : '') + '>' +
        esc(row.name || id) + esc(detail) + '</option>';
    }).join('') : '<option value="" selected disabled>No resource catalog entries loaded</option>';
    const locationOptions = locationOptionsHtml(country, selectedId);
    const metrology = '<form class="omega-rescc-form omega-rescc-resource-form" data-search-item data-form="metrology">' +
      '<h3>Resource quantity &amp; unit workspace</h3>' +
      '<div class="omega-rescc-formgrid omega-rescc-resource-grid">' +
      '<label>Resource<select id="omega-rescc-resource-select" name="resourceId" required>' + resourceOptions + '</select></label>' +
      '<label>Location / deposit<select id="omega-rescc-location-select" name="siteId">' + locationOptions + '</select></label>' +
      '<label>Quantity<input name="value" type="number" min="0" step="any" required placeholder="Enter amount"></label>' +
      '<label>Current unit<select id="omega-rescc-from-unit" name="fromUnit" required>' + unitOptionsHtml(declaredUnit, declaredUnit) + '</select></label>' +
      '<label>Convert to<select id="omega-rescc-to-unit" name="toUnit" required>' + unitOptionsHtml(declaredUnit, defaultTarget) + '</select></label></div>' +
      '<div id="omega-rescc-unit-help" class="omega-rescc-unit-note">' +
      (declaredUnit && UNIT_DEFINITIONS[declaredUnit]
        ? 'Unit defaults from this resource’s declared catalog/site data. You can choose another unit of the same physical dimension.'
        : 'This resource has no resolvable declared unit. Conversion stays unavailable until the source data defines one.') +
      '</div>' +
      '<button class="omega-rescc-button" type="submit"' + (!declaredUnit ? ' disabled' : '') + '>Convert quantity</button></form>';
    const top = metrology + '<div class="omega-rescc-metrics">' +
      '<div><span>Autonomy index</span><strong>' + number(metrics.autonomyIndex, '%') + '</strong></div>' +
      '<div><span>Reserve duration</span><strong>' + number(metrics.strategicReservesTotalDays, ' days') + '</strong></div>' +
      '<div><span>Runtime source</span><strong>' + esc(summary.version || 'Unavailable') + '</strong></div></div>' +
      '<p class="omega-rescc-note">' + esc(summary.briefing || 'Missing values remain unavailable; no synthetic values are shown.') + '</p>';
    const table = rows.length ? '<div class="omega-rescc-table-wrap"><table class="omega-rescc-table" aria-label="Resource balances">' +
      '<thead><tr><th>Resource</th><th>Unit</th><th>Production/day</th><th>Demand/day</th><th>Net balance</th><th>Inventory</th><th>Reserve</th><th>Stock days</th><th>Actions</th></tr></thead><tbody>' +
      rows.map(function (row) {
        const rid = row.id || row.resourceId || row.resourceTypeId || '';
        const unit = row.unit || (resourceUnitId(rid, country) && UNIT_DEFINITIONS[resourceUnitId(rid, country)].label) || 'Not recorded';
        const actions = '<details class="omega-rescc-row-actions"><summary>Open</summary><div class="omega-rescc-actions">' +
          actionButton('survey', 'Request survey', { 'resource-id': rid }) +
          actionButton('expansion', 'Request capacity review', { 'resource-id': rid }) +
          actionButton('reserve', 'Request SPR transfer', { 'resource-id': rid }) +
          actionButton('focus-map', 'Focus map', { 'resource-id': rid }) +
          '</div></details>';
        return '<tr><th scope="row">' + esc(row.name || rid || 'Resource') + '</th>' +
          '<td>' + esc(unit) + '</td><td>' + number(row.dailyProduction) + '</td><td>' + number(row.dailyConsumption) +
          '</td><td>' + number(row.netBalance) + '</td><td>' + number(row.inventory) + '</td><td>' + number(row.reserve) +
          '</td><td>' + number(row.stockDays, ' days') + '</td><td>' + actions + '</td></tr>';
      }).join('') + '</tbody></table></div>' : empty('No authoritative commodity rows are available for this country.');
    return top + table;
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
    const rows=resources(country),r=resourceBucket(country),endowment=r.endowment||{},reserves=r.reserves||{},inventory=r.inventory||{};
    const body=rows.map(row=>{
      const rid=row.id,ev=Object.prototype.hasOwnProperty.call(endowment,rid)?endowment[rid]:null,rv=Object.prototype.hasOwnProperty.call(reserves,rid)?reserves[rid]:row.reserve,iv=Object.prototype.hasOwnProperty.call(inventory,rid)?inventory[rid]:row.inventory;
      return card(row.name||rid,rid,'<div class="omega-rescc-grid2">'+kv('Runtime endowment',ev)+kv('Runtime reserve balance',rv)+kv('Runtime available inventory',iv)+kv('Runtime reserve authority',row.reserveAuthority||'NOT_RECORDED')+kv('Unit',row.unit)+kv('Observed grade / purity',row.grade??row.purity)+'</div>',actionButton('reserve','Request SPR transfer',{'resource-id':rid}));
    }).join('');
    const profileRows=siteRows(country).map(site=>{
      const src=site.sourceSiteRecord&&typeof site.sourceSiteRecord==='object'?site.sourceSiteRecord:{},q=site.quantitative||src.quantitative||(site.real&&site.real.quantitative)||{},sim=site.simulation||src.simulation||{},valueObject=q.reserve||q.recoverableReserve||sim.reserve||sim.recoverableReserve||site.reserve;
      const value=valueObject&&typeof valueObject==='object'?(valueObject.quantity??valueObject.value??valueObject.amount??valueObject.reserves??null):(valueObject??site.reserveQuantity??site.simulationReserveQuantity??null);
      if(value===null||value===undefined||value==='')return null;
      const unit=valueObject&&typeof valueObject==='object'?(valueObject.unit||valueObject.quantityUnit):null,authority=(q.quantitativeProvenance&&(q.quantitativeProvenance.reserveAuthority||q.quantitativeProvenance.quantityAuthority))||(valueObject&&typeof valueObject==='object'&&(valueObject.authority||valueObject.dataAuthority))||site.sourceAuthority||src.sourceAuthority||src.dataAuthority||'SOURCE_STATUS_NOT_RECORDED';
      return{site,value,unit:unit||site.unit||'',authority};
    }).filter(Boolean);
    const profileCards=profileRows.slice(0,150).map(row=>card(row.site.siteName||row.site.name||row.site.siteId,'FILE-BACKED SITE PROFILE',
      '<div class="omega-rescc-grid2">'+kv('Site ID',row.site.siteId)+kv('Commodity',row.site.resourceId||row.site.real&&row.site.real.resourceId||row.site.identity&&row.site.identity.resourceTypeId)+kv('Profile reserve',row.value,row.unit?' '+row.unit:'')+kv('Authority / provenance',row.authority)+'</div>','')).join('');
    return '<p class="omega-rescc-note">Runtime balances are read from shared country state. File-backed reserve facts below are reference profiles, not live inventory.</p>'+
      (body||empty('No live commodity reserve state is recorded.'))+'<h3 class="omega-rescc-section-title">Site reserve facts from existing data files</h3>'+
      (profileCards||empty('No quantified reserve field is recorded in this country site profile.'))+
      (profileRows.length>150?'<p class="omega-rescc-note">Showing 150 of '+profileRows.length+' reserve profiles.</p>':'');
  }
  function panelDeposits(country) {
    const all=deposits(),selected=activeCountry(country);
    const rows=selected==='WORLD'?all:all.filter(d=>{
      const cid=d&&(d.countryCode||d.countryId||d.country||d.countryName||d.sovereignCountryId);
      return cid&&normaliseCountry(cid)===selected;
    });
    if(!rows.length)return empty('No deposits matched '+selected+' in the loaded JSON registry.')+'<p class="omega-rescc-note">'+esc(sourceDataStatus(country))+'</p>';
    const visible=rows.slice(0,250);
    return '<p class="omega-rescc-note">Country-scoped JSON deposit registry: '+rows.length+' records matched '+esc(selected)+'. Showing '+visible.length+'; missing fields stay unavailable.</p>'+
      visible.map(d=>{
        const lat=Number(d.lat??d.latitude??(d.coordinates&&d.coordinates.lat)),lng=Number(d.lng??d.lon??d.longitude??(d.coordinates&&(d.coordinates.lng??d.coordinates.lon)));
        const valid=Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180,rid=d.resourceId||d.resId||d.resourceTypeId||d.resource||'';
        const body='<div class="omega-rescc-grid2">'+kv('Country',d.country||d.countryCode||d.countryId)+kv('Resource',rid||d.name)+kv('Latitude',valid?lat.toFixed(5):null)+kv('Longitude',valid?lng.toFixed(5):null)+kv('Reserves',d.reserves??d.reserve)+kv('Grade',d.grade??d.purity)+kv('Operator',d.operator||d.owner)+'</div>';
        return card(d.name||d.depositName||d.siteName||d.siteId||'Unnamed deposit',d.status||'STATUS NOT RECORDED',body,
          (valid?actionButton('fly-deposit','Fly to coordinates',{lat,lng,'deposit-name':d.name||d.depositName||'Deposit'}):'')+(rid?actionButton('survey','Request resource survey',{'resource-id':rid}):''));
      }).join('')+(rows.length>visible.length?'<p class="omega-rescc-note">Showing the first '+visible.length+' of '+rows.length+' matched records.</p>':'');
  }
  function siteRows(country) {
    const selected=activeCountry(country),r=resourceBucket(country),candidates=[];
    const append=(rows,countryHint)=>{
      if(!Array.isArray(rows))return;
      rows.forEach(site=>{
        if(!site||typeof site!=='object')return;
        const source=site.sourceSiteRecord&&typeof site.sourceSiteRecord==='object'?site.sourceSiteRecord:{};
        const identity=site.identity&&typeof site.identity==='object'?site.identity:{};
        const ownCountry=site.countryId||site.countryCode||site.country||identity.countryIso3||identity.countryId||source.countryId||source.countryCode||countryHint;
        if(!ownCountry)return;
        candidates.push(Object.assign({},site,{countryId:normaliseCountry(ownCountry)}));
      });
    };
    // Source profile and the canonical site binding are primary identity sources.
    try{
      const e=engine(),profile=e&&typeof e.getCountryResourceProfile==='function'?e.getCountryResourceProfile(country):null;
      const ctx=profile&&(profile.resource_infrastructure_context||profile.infrastructure_context)||{};
      append(ctx.mineSites||ctx.resourceSites||(profile&&profile.mineSites),selected);
    }catch(_){}
    try{
      const binding=g.Omega&&g.Omega.IndividualResourceSiteBinding||g.OmegaIndividualResourceSiteBinding;
      append(binding&&binding.sites,null);
    }catch(_){}
    try{
      const master=g.OmegaResourceSiteMasterResearchData||(g.Omega&&g.Omega.ResourceSiteMasterResearchData);
      append(master&&master.sites,null);
    }catch(_){}
    // Existing runtime records overlay the file-backed profile rows.
    append(r.mineSiteReferences,selected);
    append(r.mines,selected);
    try{
      const runtime=g.Omega&&g.Omega.ResourceEndowmentRuntime;
      append(runtime&&runtime.countryMineSiteReferences&&runtime.countryMineSiteReferences(country),selected);
      append(runtime&&runtime.countryMines&&runtime.countryMines(country),selected);
    }catch(_){}
    const unique=new Map();
    candidates.forEach(site=>{
      const src=site&&site.sourceSiteRecord&&typeof site.sourceSiteRecord==='object'?site.sourceSiteRecord:{};
      const ident=site&&site.identity&&typeof site.identity==='object'?site.identity:{};
      const cid=site&&(site.countryId||site.countryCode||site.country||ident.countryIso3||ident.countryId||src.countryId||src.countryCode);
      if(!site||typeof site!=='object'||!cid||normaliseCountry(cid)!==selected)return;
      const id=site.siteId||site.canonicalSiteId||site.siteReferenceKey||site.occurrenceKey||site.id||src.siteId||src.id;
      if(!id)return;
      const key=selected+'|'+String(id),row=Object.assign({},site,{siteId:String(id),countryId:selected});
      unique.set(key,unique.has(key)?mergeDataValues(unique.get(key),row):row);
    });
    return [...unique.values()].sort((a,b)=>String(a.siteName||a.name||a.depositName||a.siteId).localeCompare(String(b.siteName||b.name||b.depositName||b.siteId)));
  }
  function siteRouteRows(country){
    return siteRows(country).flatMap(site=>{
      const src=site.sourceSiteRecord&&typeof site.sourceSiteRecord==='object'?site.sourceSiteRecord:{};
      const sim=site.simulation||src.simulation||{},log=site.logistics||src.logistics||{};
      const value=sim.transportRoute||sim.transportRoutes||site.transportRoute||log.routes||site.routes||src.transportRoute||src.routes||[];
      return(Array.isArray(value)?value:(value?[value]:[])).map((route,index)=>({
        siteId:site.siteId,siteName:site.siteName||site.name||site.depositName||site.siteId,
        routeId:route&&(route.routeId||route.id)||'',
        routeName:route&&(route.routeName||route.name||route.routeId||route.id)||('Route '+(index+1)),
        mode:route&&(route.mode||route.transportMode||route.routeType)||'',
        from:route&&(route.from||route.source||route.origin||route.fromNode||route.sourceNode)||'',
        to:route&&(route.to||route.target||route.destination||route.toNode||route.destinationNode)||'',
        distanceKm:route&&route.distanceKm!==undefined?route.distanceKm:(route&&route.distance!==undefined?route.distance:null),
        authority:route&&(route.authority||route.sourceAuthority)||site.sourceAuthority||src.sourceAuthority||'SOURCE_PROFILE',
        profileOnly:true,route
      }));
    });
  }
  function sourceDataStatus(country){
    const e=engine();let report={};try{report=e&&(e.getDataLoadReport?e.getDataLoadReport():e.dataLoadReport)||{};}catch(_){}
    const profile=e&&typeof e.getCountryResourceProfile==='function'?e.getCountryResourceProfile(country):null;
    const ctx=profile&&(profile.resource_infrastructure_context||profile.infrastructure_context)||{};
    const datasets=Object.entries(report.datasets||{}).map(([name,row])=>name+': '+String(row&&row.status||'NOT_RECORDED')).join(' · ');
    return 'JSON source '+String(report.status||(e&&e.isReady?'READY':'NOT_READY'))+
      ' · commodities '+String(report.resourceTypeCount??(e&&Array.isArray(e.resourceTypes)?e.resourceTypes.length:0))+
      ' · deposits '+String(report.depositCount??(e&&Array.isArray(e.deposits)?e.deposits.length:0))+
      ' · country profiles '+String(report.countryProfileCount??(e&&e.countryProfiles?Object.keys(e.countryProfiles).length:0))+
      ' · selected-country site profiles '+String(siteRows(country).length||((ctx.mineSites||[]).length||0))+
      (datasets?' · '+datasets:'');
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
        kv('Reserve', s.reserveQuantity ?? s.remainingReserve ?? s.reserves ?? (s.quantitative && s.quantitative.reserve && (s.quantitative.reserve.quantity ?? s.quantitative.reserve.value))) +
        kv('Production authority', s.productionAuthority || s.productionModel && s.productionModel.authority || 'NOT_RECORDED') +
        kv('Quality authority', s.qualityAuthority || s.qualityState && s.qualityState.qualityAuthority || 'NOT_RECORDED') + '</div>';
      return card(s.name || s.siteName || s.depositName || s.siteId, s.operationalStatus || s.status || 'STATUS NOT RECORDED', body,
        actionButton('extract-site', 'Run authoritative site pipeline', {
          'site-id': s.siteId, 'resource-id': rid, quantity: 1
        }, !(g.Omega && g.Omega.ResourceIndustrialNetwork && g.Omega.ResourceIndustrialNetwork.executeSitePipeline && rid && s.extractionExecutable !== false && !(s.runtime && s.runtime.extractionExecutable === false))) +
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
    return '<div class="omega-rescc-metrics"><div><span>Country site profiles</span><strong>' +
      number(sites.length) + '</strong></div><div><span>Runtime mine records</span><strong>' + number(Array.isArray(r.mines) ? r.mines.length : 0) +
      '</strong></div><div><span>Survey requests</span><strong>' + number(surveys.length) + '</strong></div><div><span>Survey results</span><strong>' + number(results.length) + '</strong></div></div>' +
      (diag ? diagnosticCard('Extraction runtime diagnostics', diag) : '') +
      '<h3 class="omega-rescc-section-title">Canonical site registry</h3>' +
      (siteCards || empty('No country-scoped site profile matched the existing canonical registry or loaded JSON profile. ' + sourceDataStatus(country))) +
      '<h3 class="omega-rescc-section-title">Resource survey requests</h3>' + statusRows(surveys) +
      '<h3 class="omega-rescc-section-title">Completed survey evidence</h3>' + statusRows(results) +
      '<h3 class="omega-rescc-section-title">Authoritative exploration projects</h3>' + (explorationCards || empty('No exploration projects have been recorded.')) +
      '<h3 class="omega-rescc-section-title">Commissioned site records</h3>' + statusRows(commissionedSites) +
      '<h3 class="omega-rescc-section-title">Commodity survey shortcuts</h3>' + (rows || empty('No commodity rows are available.'));
  }
  function panelProcessing(country) {
    const assets=allFactories(country),requests=bucket('economy',country).capacityUpgradeRequests||resourceBucket(country).capacityUpgradeRequests||[];
    const liveCards=assets.map(asset=>{
      const id=asset.id||asset.assetId||asset.factoryId||asset.projectId,inputs=Object.keys(asset.inputCoefficients||{}),outputs=Object.keys(asset.outputProfile||{}),rid=asset.resourceId||asset.inputResourceId||inputs[0]||(resources(country)[0]&&resources(country)[0].id)||'';
      const body='<div class="omega-rescc-grid2">'+kv('Factory ID',id)+kv('Stage',asset.stage||asset.facilityType||asset.factoryType)+kv('Capacity',asset.capacity)+kv('Input stock',asset.inputInventory&&asset.inputInventory[rid])+kv('Inputs',inputs.join(', ')||'Not recorded')+kv('Outputs',outputs.join(', ')||'Not recorded')+'</div>';
      return card(asset.name||asset.factoryName||id,asset.status||asset.stage||'STATUS NOT RECORDED',body,actionButton('process-factory','Run one real factory cycle',{'factory-id':id,'resource-id':rid,quantity:asset.capacity||1},!(g.Omega&&g.Omega.ResourceIndustrialNetwork&&g.Omega.ResourceIndustrialNetwork.executeFactoryCycle&&id&&rid))+(rid?actionButton('expansion','Request capacity expansion',{'resource-id':rid}):''));
    }).join('');
    const profiles=siteRows(country).map(site=>{
      const src=site.sourceSiteRecord&&typeof site.sourceSiteRecord==='object'?site.sourceSiteRecord:{},p=site.processing||src.processing||site.processingProfile||{},sim=site.simulation||src.simulation||{};
      const outputs=p.refinedOutputs||p.factoryOutputs||site.factoryOutputs||sim.factoryOutputs||sim.refinedOutputs||[],up=p.upstreamProcess||site.upstreamProcess||sim.upstreamProcess,mid=p.midstreamProcess||site.midstreamProcess||sim.midstreamProcess,down=p.downstreamSectors||site.downstreamSectors;
      return([outputs,up,mid,down].some(v=>Array.isArray(v)?v.length>0:v!==null&&v!==undefined&&v!=='')?{site,outputs,up,mid,down}:null);
    }).filter(Boolean);
    const profileCards=profiles.slice(0,150).map(x=>card(x.site.siteName||x.site.name||x.site.siteId,'FILE-BACKED PROCESSING PROFILE',
      '<div class="omega-rescc-grid2">'+kv('Site ID',x.site.siteId)+kv('Commodity',x.site.resourceId||x.site.real&&x.site.real.resourceId||x.site.identity&&x.site.identity.resourceTypeId)+kv('Upstream',x.up)+kv('Midstream',x.mid)+kv('Outputs',x.outputs)+kv('Downstream sectors',x.down)+'</div>','')).join('');
    const industrial=resourceBucket(country).industrialNetwork||{},econ=bucket('economy',country),projects=Array.isArray(industrial.projects)?industrial.projects:(Array.isArray(econ.projects)?econ.projects:(Array.isArray(econ.industrialProjects)?econ.industrialProjects:[]));
    const options=resources(country).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+'</option>').join('');
    const form='<form class="omega-rescc-form" data-search-item data-form="factory-project"><h3>Start a catalog-backed factory project</h3><div class="omega-rescc-formgrid"><label>Resource<select name="resourceId" required>'+options+'</select></label><label>Budget cost<input type="number" name="cost" min="1" step="1" required></label><label>Capacity per day<input type="number" name="capacityPerDay" min="1" step="1" required></label><label>Build days<input type="number" name="buildDays" min="1" step="1" value="180" required></label></div><p class="omega-rescc-note">Project creation does not itself debit treasury.</p><button class="omega-rescc-button" type="submit">Create factory project</button></form>';
    return '<h3 class="omega-rescc-section-title">Live production and processing assets</h3>'+(liveCards||empty('No factory asset is recorded in this country runtime.'))+
      '<h3 class="omega-rescc-section-title">Processing capabilities from existing site files</h3>'+(profileCards||empty('No per-site processing/output profile is recorded for this country.'))+
      (profiles.length>150?'<p class="omega-rescc-note">Showing 150 of '+profiles.length+' site profiles.</p>':'')+
      '<h3 class="omega-rescc-section-title">Capacity requests</h3>'+statusRows(requests)+'<h3 class="omega-rescc-section-title">Industrial construction projects</h3>'+statusRows(projects)+form;
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
  function panelLogistics(country){
    const r=resourceBucket(country),log=r.logistics||{},shipments=Array.isArray(log.shipments)?log.shipments:[],batches=Array.isArray(r.batches)?r.batches:[],factories=allFactories(country);
    const batchCards=batches.map(batch=>{
      const id=batch.batchId,rid=batch.resourceId||batch.materialIdentity||'',qty=batch.remainingQuantity??batch.quantity,warehouse=batch.warehouseId||r.warehouse&&r.warehouse.warehouseId||'';
      const compatible=matchingAssets(country,rid).filter(a=>a&&(a.id||a.assetId||a.factoryId||a.projectId)),ids=compatible.map(a=>a.id||a.assetId||a.factoryId||a.projectId);
      return card(id||'Unidentified batch',rid||'Resource not recorded','<div class="omega-rescc-grid2">'+kv('Quantity',qty)+kv('Unit',batch.unit)+kv('Warehouse',warehouse)+kv('Compatible factories',ids.length)+'</div>',
        actionButton('plan-shipment','Plan warehouse-to-factory route',{'batch-id':id,'resource-id':rid,quantity:qty,unit:batch.unit||'','warehouse-id':warehouse,'factory-ids':ids.join(',')},!(id&&rid&&warehouse&&ids.length&&g.Omega&&g.Omega.ResourceLogisticsRuntime&&g.Omega.ResourceLogisticsRuntime.planFromFactoryInput)));
    }).join('');
    const routes=siteRouteRows(country),routeCards=routes.slice(0,200).map(x=>card(x.routeName||x.routeId||'Saved route profile','PROFILE ONLY · NOT DISPATCHED',
      '<div class="omega-rescc-grid2">'+kv('Route ID',x.routeId)+kv('Site',x.siteName)+kv('Site ID',x.siteId)+kv('Transport mode',x.mode)+kv('From',x.from)+kv('To',x.to)+kv('Distance (km)',x.distanceKm)+kv('Route authority',x.authority)+'</div>'+
      '<p class="omega-rescc-note">A saved route definition is not a shipment or proof that material moved.</p>','')).join('');
    const shipmentCards=shipments.slice(-100).reverse().map(s=>card(s.shipmentId||s.routeId||'Shipment',s.status||s.deliveryStatus||'STATUS NOT RECORDED',
      '<div class="omega-rescc-grid2">'+kv('Resource',s.resourceId)+kv('Quantity',s.quantity)+kv('Factory',s.factoryId)+kv('Transport mode',s.transportMode)+kv('ETA turn',s.timing&&s.timing.etaTurn)+kv('Constraint source',s.sourceAuthority||'NOT_RECORDED')+'</div>'+(s.reason?'<div class="omega-rescc-warning">'+esc(s.reason)+'</div>':''),'')).join('');
    return '<div class="omega-rescc-metrics"><div><span>Available raw batches</span><strong>'+number(batches.length)+'</strong></div><div><span>Factories in state</span><strong>'+number(factories.length)+'</strong></div><div><span>Saved site routes</span><strong>'+number(routes.length)+'</strong></div></div>'+
      '<p class="omega-rescc-note">Saved route definitions and active shipment transactions are separate records.</p>'+
      '<h3 class="omega-rescc-section-title">Available warehouse batches</h3>'+(batchCards||empty('No physical batch is recorded for shipment planning.'))+
      '<h3 class="omega-rescc-section-title">Saved route profiles from existing data files</h3>'+(routeCards||empty('No saved route definition is recorded for this country.'))+
      '<h3 class="omega-rescc-section-title">Actual shipment state</h3>'+(shipmentCards||empty('No shipments have been recorded.'));
  }
  function panelIndustrial(country){
    const network = g.Omega && g.Omega.ResourceIndustrialNetwork;
    const diag = network && network.diagnostics ? network.diagnostics(country) : null;
    const pipeline = network && network.gameplayPipelineDiagnostics ? network.gameplayPipelineDiagnostics() : null;
    const perCountry = pipeline && Array.isArray(pipeline.perCountry)
      ? pipeline.perCountry.find(x => normaliseCountry(x.countryId) === activeCountry(country)) : null;
    const r = resourceBucket(country);
    const econ = bucket('economy', country);
    const industrialState = r.industrialNetwork || {};
    const flows = Array.isArray(industrialState.siteFlowLedger) ? industrialState.siteFlowLedger :
      (Array.isArray(r.siteFlows) ? r.siteFlows : (Array.isArray(r.siteFlowLedger) ? r.siteFlowLedger : (Array.isArray(r.extractionFlows) ? r.extractionFlows : [])));
    const projects = Array.isArray(industrialState.projects) ? industrialState.projects : (Array.isArray(econ.projects) ? econ.projects : []);
    const contracts = Array.isArray(industrialState.technologyContracts) ? industrialState.technologyContracts : [];
    const stages = perCountry && perCountry.stages || {}, sites = siteRows(country);
    return (diag ? diagnosticCard('Country industrial network diagnostics', diag) : empty('Industrial network runtime is unavailable.')) +
      (perCountry ? diagnosticCard('End-to-end site pipeline state', perCountry) : '') +
      '<div class="omega-rescc-metrics"><div><span>Country site profiles</span><strong>'+number(sites.length)+'</strong></div><div><span>Extraction flows</span><strong>'+number(perCountry&&perCountry.extractionFlows)+'</strong></div><div><span>Dispatched shipments</span><strong>'+number(perCountry&&perCountry.dispatched)+'</strong></div><div><span>Processed flows</span><strong>'+number(perCountry&&perCountry.processed)+'</strong></div></div>'+
      '<h3 class="omega-rescc-section-title">Observed flow ledger</h3>'+(flows.length?statusRows(flows):empty('No site execution or flow records are present in this country runtime.'))+
      '<h3 class="omega-rescc-section-title">Construction projects</h3>'+statusRows(projects)+
      '<h3 class="omega-rescc-section-title">Technology project contracts</h3>'+statusRows(contracts)+
      (Object.keys(stages).length?diagnosticCard('Pipeline stage counts',stages):'');
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
      '<p class="omega-rescc-note">Select exactly which action is being reviewed. Nuclear construction costs and timing come from the ruleset; SWF reviews are bound to the entered treasury amount. A valid server-side Gemini assessment is required, and each approval is limited to one matching action. If the API key, model, or response is unavailable, no verdict is recorded. These are simulation assumptions, not real-world measurements or guaranteed facts.</p>' +
      '<label class="omega-rescc-question"><span>Action under review</span><select name="operation" required><option value="">Select action</option><option value="POWER_PROJECT">Nuclear baseload construction (2.4 GW ruleset)</option><option value="SWF_CAPITALIZATION">Sovereign wealth fund capitalization</option></select></label>' +
      '<label class="omega-rescc-question"><span>SWF contribution amount (native treasury units; required only for SWF)</span><input type="number" name="requestedAmount" min="0.01" step="any" placeholder="Leave blank for nuclear construction" /></label>' +
      questions.map(function (q, i) {
        return '<label class="omega-rescc-question"><span>' + (i + 1) + '. ' + esc(q) + '</span>' +
          '<select name="q' + (i + 1) + '" required>' + options + '</select></label>';
      }).join('') + '<button class="omega-rescc-button" type="submit">Evaluate selected action with server AI</button></form>';
    const policy = g.OmegaResourceStrategicPolicyRuntime || g.Omega && g.Omega.ResourceStrategicPolicyRuntime;
    const decisions = Array.isArray(resourceBucket(country).cognitiveDecisionLedger) ? resourceBucket(country).cognitiveDecisionLedger : [];
    return card('Cognitive runtime availability', policy && typeof policy.evaluateCognitiveGate === 'function' ? 'LOCAL POLICY PERSISTENCE READY' : (os ? 'COGNITIVE OBJECT FOUND; PERSISTENCE API UNAVAILABLE' : 'NO COGNITIVE GATE API CONFIRMED'),
      '<div class="omega-rescc-grid2">' + kv('Runtime object', os ? 'Available' : null) +
      kv('Policy decision persistence', policy && typeof policy.evaluateCognitiveGate === 'function' ? 'Available' : null) +
      kv('Profile record', profile && profile.identity && (profile.identity.name || profile.identity.officialName)) + '</div>' +
      '<p class="omega-rescc-note">A PROCEED verdict is bound to the selected operation and, for SWF, its exact amount. A new high-impact action requires a fresh AI assessment. Player answers alone cannot approve actions. REVIEW, BLOCK, expired, missing, mismatched, or failed assessments prevent the action.</p>', '') +
      form + '<h3 class="omega-rescc-section-title">Persisted strategic gate decisions</h3>' + statusRows(decisions);
  }
  function panelPower(country){
    const network=g.Omega&&g.Omega.ResourceIndustrialNetwork,r=resourceBucket(country);
    const energy=resources(country).filter(x=>/oil|gas|uranium|coal|power|energy|hydrogen/i.test(String(x.id)+' '+String(x.name)));
    const sites=siteRows(country).filter(site=>/oil|gas|uranium|coal|power|energy|hydrogen/i.test(String(site.resourceId||site.real&&site.real.resourceId||site.identity&&site.identity.resourceTypeId||'')+' '+String(site.siteName||site.name||'')));
    const profileCards=sites.slice(0,120).map(site=>{
      const src=site.sourceSiteRecord&&typeof site.sourceSiteRecord==='object'?site.sourceSiteRecord:{},q=site.quantitative||src.quantitative||{},prod=q.production||{},reserve=q.reserve||site.simulation&&site.simulation.reserve||{},rv=reserve&&typeof reserve==='object'?(reserve.quantity??reserve.value??reserve.amount):reserve;
      return card(site.siteName||site.name||site.siteId,'FILE-BACKED SITE PROFILE','<div class="omega-rescc-grid2">'+kv('Site ID',site.siteId)+kv('Commodity',site.resourceId||site.real&&site.real.resourceId||site.identity&&site.identity.resourceTypeId)+kv('Profile production rate',prod.rate??site.productionRate??site.dailyRate,prod.unit||site.unit?' '+(prod.unit||site.unit):'')+kv('Profile reserve',rv,reserve&&typeof reserve==='object'?reserve.unit||'':'')+kv('Source authority',site.sourceAuthority||src.sourceAuthority||src.dataAuthority||'NOT_RECORDED')+'</div><p class="omega-rescc-note">Profile data is not proof of current-turn production.</p>','');
    }).join('');
    const projects=Array.isArray(r.industrialNetwork&&r.industrialNetwork.projects)?r.industrialNetwork.projects:(Array.isArray(bucket('economy',country).projects)?bucket('economy',country).projects:[]);
    const contracts=Array.isArray(r.industrialNetwork&&r.industrialNetwork.technologyContracts)?r.industrialNetwork.technologyContracts:[];
    const research=Array.isArray(r.technologyResearchProjects)?r.technologyResearchProjects:[];
    const policy=g.OmegaResourceStrategicPolicyRuntime||g.Omega&&g.Omega.ResourceStrategicPolicyRuntime;
    const powerProjects=Array.isArray(r.powerProjects)?r.powerProjects:[];
    const powerAssets=Array.isArray(r.powerAssets)?r.powerAssets:[];
    const generation=r.powerGeneration||{};
    const generationLedger=Array.isArray(r.powerGenerationLedger)?r.powerGenerationLedger:[];
    const controls='<div class="omega-rescc-actions">'+
      actionButton('power-project','Start 2.4 GW nuclear baseload project',{'project-type':'NUCLEAR_BASELOAD'},!(policy&&typeof policy.startPowerProject==='function'))+
      actionButton('industry-tech','Start advanced gas-compression research',{'technology-id':'ADVANCED_GAS_COMPRESSION',mode:'RESEARCH'},!(network&&network.startTechnologyProject))+
      actionButton('industry-tech','Start enhanced oil-recovery research',{'technology-id':'ENHANCED_OIL_RECOVERY',mode:'RESEARCH'},!(network&&network.startTechnologyProject))+'</div>';
    return '<div class="omega-rescc-warning">Nuclear power is a simulated ruleset project, not measured plant capacity. Construction charges native treasury units (not a claimed USD conversion), advances by simulation turns, then generates only when fuel inventory and carbon quota checks allow it. Generation factors are scenario assumptions.</div>'+
      '<div class="omega-rescc-metrics"><div><span>Installed power capacity (MW)</span><strong>'+number(generation.installedCapacityMw)+'</strong></div><div><span>Generated energy this turn (MWh)</span><strong>'+number(generation.generatedMwh)+'</strong></div></div>'+
      controls+
      '<h3 class="omega-rescc-section-title">Power construction projects</h3>'+statusRows(powerProjects)+
      '<h3 class="omega-rescc-section-title">Commissioned power assets</h3>'+statusRows(powerAssets)+
      '<h3 class="omega-rescc-section-title">Power generation ledger</h3>'+statusRows(generationLedger)+
      '<h3 class="omega-rescc-section-title">Live energy commodity state</h3>'+
      (energy.map(x=>card(x.name||x.id,x.id,'<div class="omega-rescc-grid2">'+kv('Production/day',x.dailyProduction)+kv('Inventory',x.inventory)+kv('Reserve',x.reserve)+kv('Unit',x.unit)+'</div>','')).join('')||empty('No matching energy resource rows are recorded in live commodity state.'))+
      '<h3 class="omega-rescc-section-title">Energy site profiles from existing data files</h3>'+(profileCards||empty('No energy-related site profile is recorded for this country.'))+(sites.length>120?'<p class="omega-rescc-note">Showing 120 of '+sites.length+' profiles.</p>':'')+
      '<h3 class="omega-rescc-section-title">Energy and infrastructure project records</h3>'+statusRows(projects)+
      '<h3 class="omega-rescc-section-title">Industrial technology contracts</h3>'+statusRows(contracts)+
      '<h3 class="omega-rescc-section-title">Resource research runtime projects</h3>'+statusRows(research)+
      '<h3 class="omega-rescc-section-title">Current mine and power-related outputs</h3>'+statusRows(Array.isArray(r.mineProductionLedger)?r.mineProductionLedger:[]);
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
    const enforcementLedger = Array.isArray(r.carbonQuotaEnforcementLedger) ? r.carbonQuotaEnforcementLedger : [];
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
      '<h3 class="omega-rescc-section-title">Carbon quota enforcement violations and remediation follow-up</h3>' +
      (enforcementLedger.length ? statusRows(enforcementLedger) : empty('No quota violation has been recorded. Blocked attempts are kept separately from emissions actually committed.')) +
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
    return '.omega-rescc-shell{width:96vw;max-width:1440px;height:92vh;max-height:980px;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:#07111f;color:#e2e8f0;border:1px solid #1e7890;border-radius:14px;box-shadow:0 18px 64px #000b;font:13px/1.45 system-ui,sans-serif}' +
      '.omega-rescc-top{padding:13px 16px;background:#0b1b2c;border-bottom:1px solid #1e4560;display:flex;flex-direction:column;gap:10px;flex-shrink:0}' +
      '.omega-rescc-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}' +
      '.omega-rescc-heading h2{font-size:16px;margin:0;color:#67e8f9;letter-spacing:.03em}' +
      '.omega-rescc-headtools{display:flex;gap:7px;align-items:center;flex-wrap:wrap}' +
      '.omega-rescc-input,.omega-rescc-form input,.omega-rescc-form select,.omega-rescc-top select{background:#030b15;color:#f1f5f9;border:1px solid #334b60;border-radius:6px;padding:8px;min-width:0;font:inherit}' +
      '.omega-rescc-search{flex:1;min-width:160px}' +
      '.omega-rescc-nav{display:flex;align-items:center;gap:8px;min-width:0;padding:2px 0}' +
      '.omega-rescc-panel-label{flex:0 0 auto;color:#a8c3d3;font-size:11px;white-space:nowrap}' +
      '.omega-rescc-nav select{flex:1;min-width:0;max-width:100%;background:#030b15;color:#f1f5f9;border:1px solid #334b60;border-radius:6px;padding:8px;font:inherit}' +
      '.omega-rescc-status{padding:9px 16px;background:#0a1523;border-bottom:1px solid #21364b;color:#a5f3fc;font-size:12px;flex-shrink:0}' +
      '.omega-rescc-content{flex:0 0 auto;min-height:0;min-width:0;overflow:visible;padding:14px;display:flex;flex-direction:column;gap:10px}' +
      '.omega-rescc-note{display:none!important}' +
      '.omega-rescc-muted{color:#9fb3c8;font-size:12px;margin:0}' +
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
      '.omega-rescc-resource-grid{grid-template-columns:repeat(auto-fit,minmax(145px,1fr));align-items:end}.omega-rescc-unit-note{color:#8fb8c9;font-size:11px;line-height:1.4}' +
      '.omega-rescc-table-wrap{width:100%;max-width:100%;overflow:auto;border:1px solid #243e53;border-radius:8px;background:#071421;-webkit-overflow-scrolling:touch}' +
      '.omega-rescc-table{width:100%;min-width:760px;border-collapse:collapse;font-size:11px}.omega-rescc-table th,.omega-rescc-table td{padding:8px 9px;border-bottom:1px solid #1c3042;text-align:left;white-space:nowrap}.omega-rescc-table thead th{position:sticky;top:0;background:#102438;color:#9feafa;font-weight:700}.omega-rescc-table tbody th{color:#e2f6ff;font-weight:600}.omega-rescc-table tbody tr:hover{background:#0c2032}.omega-rescc-row-actions summary{color:#a5f3fc;cursor:pointer;border:1px solid #315267;border-radius:5px;padding:5px 7px}.omega-rescc-row-actions .omega-rescc-actions{min-width:180px;flex-direction:column}' +
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
        if (event.target && event.target.id === 'omega-rescc-panel-select') {
          openPanel(event.target.value);
          return;
        }
        if (event.target && event.target.id === 'omega-rescc-country') {
          countryId = activeCountry(event.target.value);
          lastOutcome = '';
          render();
          return;
        }
        if (event.target && event.target.id === 'omega-rescc-resource-select') {
          const form = event.target.closest && event.target.closest('form[data-form="metrology"]');
          if (form) syncResourceForm(form, countryId);
          return;
        }
        if (event.target && event.target.id === 'omega-rescc-from-unit') {
          const form = event.target.closest && event.target.closest('form[data-form="metrology"]');
          if (form) syncTargetUnitOptions(form, event.target.value, form.querySelector('[name="toUnit"]') && form.querySelector('[name="toUnit"]').value);
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
  let resourceDataWarmupAttempted = false, resourceDataWarmupPromise = null, resourceDataRefreshBound = false;
  function visibleModal() { return g.document && g.document.getElementById('gsrsk-intelligence-modal'); }
  function refreshVisiblePanel() {
    const modal = visibleModal();
    if (!modal || !modal.style || modal.style.display === 'none') return;
    const old = modal.querySelector ? modal.querySelector('#omega-rescc-content') : null;
    const scrollTop = old ? old.scrollTop : 0, scrollLeft = old ? old.scrollLeft : 0;
    render(countryId, activePanel, modal);
    const current = modal.querySelector ? modal.querySelector('#omega-rescc-content') : null;
    if (current) { current.scrollTop = scrollTop; current.scrollLeft = scrollLeft; }
  }
  function ensureResourceDataReady(force) {
    if (resourceDataWarmupPromise) return resourceDataWarmupPromise;
    if (!force && resourceDataWarmupAttempted) return null;
    resourceDataWarmupAttempted = true;
    const e = engine(), endowment = g.Omega && g.Omega.ResourceEndowmentRuntime;
    const needsEngine = !!(e && !e.isReady && typeof e.init === 'function');
    const needsEndowment = !!(e && e.isReady && endowment && typeof endowment.initialize === 'function' && !g.__omegaResourceEndowmentReady);
    if (!needsEngine && !needsEndowment) return null;
    resourceDataWarmupPromise = (async function () {
      if (needsEngine) { try { await e.init(); } catch (_) {} }
      if (e && e.isReady && endowment && typeof endowment.initialize === 'function' && !g.__omegaResourceEndowmentReady) {
        try { await endowment.initialize(); } catch (_) {}
      }
    })().then(refreshVisiblePanel).catch(refreshVisiblePanel).finally(function () { resourceDataWarmupPromise = null; });
    return resourceDataWarmupPromise;
  }
  function bindResourceDataRefreshEvents() {
    if (resourceDataRefreshBound || typeof g.addEventListener !== 'function') return;
    resourceDataRefreshBound = true;
    [
      'RESOURCE_STATE_UPDATED','OMEGA_RESOURCE_SITE_BINDING_READY','OMEGA_READY','OMEGA_GAME_SESSION_STARTED',
      'OMEGA_SIMULATION_TURN_COMMITTED','OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_BATCH_CREATED',
      'OMEGA_RESOURCE_INVENTORY_CHANGED','OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_TRADE_SETTLEMENT_COMPLETED'
    ].forEach(function (name) {
      try { g.addEventListener(name, function () { resourceDataWarmupAttempted = false; refreshVisiblePanel(); }); } catch (_) {}
    });
  }
  function render(country, panel, modalOverride) {
    const modal = modalOverride || ensureModal();
    if (!modal) return;
    countryId = activeCountry(country || countryId);
    activePanel = panelId(panel || activePanel);
    const options = countryList().map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === countryId ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    const navOptions = PANELS.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === activePanel ? ' selected' : '') + '>' +
        p.num + ' · ' + esc(p.title) + '</option>';
    }).join('');
    modal.innerHTML = '<style>' + css() + '</style><div class="omega-rescc-shell" role="dialog" aria-modal="true" aria-label="Resource Command Center">' +
      '<div class="omega-rescc-top"><div class="omega-rescc-heading"><h2>Resource Command Center</h2>' +
      '<div class="omega-rescc-headtools"><select id="omega-rescc-country" aria-label="Country scope">' + options + '</select>' +
      '<button type="button" class="omega-rescc-button" data-action="refresh-panel">Refresh</button>' +
      '<button type="button" class="omega-rescc-button" data-action="close">Close</button></div></div>' +
      '<div class="omega-rescc-headtools"><input id="omega-rescc-search" class="omega-rescc-input omega-rescc-search" type="search" placeholder="Search this section…" aria-label="Search current section"></div>' +
      '<nav class="omega-rescc-nav" aria-label="Resource section selector"><label class="omega-rescc-panel-label" for="omega-rescc-panel-select">Section</label><select id="omega-rescc-panel-select" aria-label="Resource section">' + navOptions + '</select></nav></div>' +
      (lastOutcome ? '<div id="omega-rescc-status" class="omega-rescc-status" role="status">' + esc(lastOutcome) + '</div>' : '') +
      '<main id="omega-rescc-content" class="omega-rescc-content"><h3 class="omega-rescc-section-title">' + esc(viewTitle(activePanel)) + '</h3>' +
      panelContent(activePanel, countryId) + '</main></div>';
    modal.style.display = 'flex';
    bindResourceDataRefreshEvents();
    ensureResourceDataReady(false);
  }
  function openPanel(panel) { lastOutcome = ''; render(countryId, panel); }
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
      if (action === 'refresh-panel') { resourceDataWarmupAttempted = false; render(c, activePanel); ensureResourceDataReady(true); return; }
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
        const resourceId = String(data.get('resourceId') || '');
        const declaredUnit = resourceUnitId(resourceId, c);
        const fromUnit = String(data.get('fromUnit') || '');
        const toUnit = String(data.get('toUnit') || '');
        if (!declaredUnit || !UNIT_DEFINITIONS[declaredUnit]) {
          setOutcome('Resource quantity conversion', { status: 'BLOCKED', reason: 'RESOURCE_UNIT_NOT_DECLARED' });
          return;
        }
        if (!UNIT_DEFINITIONS[fromUnit] || UNIT_DEFINITIONS[fromUnit].dimension !== UNIT_DEFINITIONS[declaredUnit].dimension) {
          setOutcome('Resource quantity conversion', { status: 'BLOCKED', reason: 'SOURCE_UNIT_DOES_NOT_MATCH_RESOURCE_DIMENSION' });
          return;
        }
        const converted = convertUnits(data.get('value'), fromUnit, toUnit);
        if (converted.status !== 'APPLIED') {
          setOutcome('Resource quantity conversion', converted);
          return;
        }
        const selectedSiteId = String(data.get('siteId') || '');
        const selectedSite = selectedSiteId ? sitesForResource(c, resourceId).find(function (site) {
          return String(site.siteId || site.id || site.siteKey || site.assetId || site.siteName || '') === selectedSiteId;
        }) : null;
        const context = selectedSite ? ' · Location: ' + String(selectedSite.siteName || selectedSite.name || selectedSite.siteId || selectedSiteId) : '';
        lastOutcome = resourceName(resourceId) + ' · ' + Number(converted.value).toLocaleString(undefined, { maximumFractionDigits: 10 }) +
          ' ' + converted.label + ' · Dimension: ' + converted.dimension + context +
          ' · Conversion only; live reserves, inventory and production are unchanged.';
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
        const operation = String(data.get('operation') || '').toUpperCase();
        const projectType = operation === 'POWER_PROJECT' ? 'NUCLEAR_BASELOAD' : null;
        const requestedAmountText = String(data.get('requestedAmount') || '').trim();
        const requestedAmount = requestedAmountText === '' ? null : Number(requestedAmountText);
        if (vals.some(function (x) { return ['proceed', 'review', 'block'].indexOf(x) < 0; })) {
          setOutcome('Server AI decision', { status: 'BLOCKED', reason: 'ALL_12_QUESTIONS_REQUIRE_ANSWERS' });
          return;
        }
        if (['POWER_PROJECT', 'SWF_CAPITALIZATION'].indexOf(operation) < 0 ||
            (operation === 'SWF_CAPITALIZATION' && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) ||
            (operation === 'POWER_PROJECT' && requestedAmount !== null)) {
          setOutcome('Server AI decision', { status: 'BLOCKED', reason: 'DECISION_OPERATION_OR_AMOUNT_INVALID' });
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
        const reviewedGameState = aiCountrySnapshot(c);
        const reviewedGameStateJson = JSON.stringify(reviewedGameState);
        let response, body;
        try {
          response = await g.fetch('/api/resource-decision/ai-evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryId: c, decisionId, operation, projectType, requestedAmount, answers: vals, gameState: reviewedGameState })
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
        const amountMatches = body && body.context &&
          ((requestedAmount === null && body.context.requestedAmount == null) || Number(body.context.requestedAmount) === requestedAmount);
        const projectTypeMatches = body && body.context &&
          ((projectType === null && body.context.projectType == null) || body.context.projectType === projectType);
        const responseMatchesRequest = body && body.decisionId === decisionId && body.context &&
          body.context.countryId === c && body.context.operation === operation && projectTypeMatches &&
          body.assessment && body.assessment.operation === operation &&
          ((projectType === null && body.assessment.projectType == null) || body.assessment.projectType === projectType) &&
          amountMatches &&
          ((requestedAmount === null && body.assessment.requestedAmount == null) || Number(body.assessment.requestedAmount) === requestedAmount);
        const liveSnapshotMatches = JSON.stringify(aiCountrySnapshot(c)) === reviewedGameStateJson;
        const contextStillCurrent = assessedTurn !== null && liveTurn !== null &&
          assessedTurn === liveTurn && liveSnapshotMatches;
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
          operation,
          projectType,
          requestedAmount,
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
    bindResourceDataRefreshEvents();
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
            .replace('Red-Team counterfactual critics, 10-dimensional health evaluations, and AI briefing generation.', 'The selected nuclear or SWF action is assessed by the server-side Gemini endpoint against a bounded country-state snapshot. Only a valid, scope-matched, current assessment can be persisted for a one-time approval. Missing AI configuration or a failed/stale response blocks approval.')
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
    getResourceUnit: function (resourceId, country) { return resourceUnitId(resourceId, country || countryId); },
    getState: function () { return { countryId: countryId, panel: activePanel, lastOutcome: lastOutcome }; }
  });
  g.Omega = g.Omega || {};
  g.Omega.ResourceCommandCenterUI = API;
  g.OmegaResourceCommandCenterUI = API;
  try { install(); } catch (e) { g.OmegaResourceCommandCenterUIError = String(e && e.message || e); }
})(typeof window !== 'undefined' ? window : globalThis);
