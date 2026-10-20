/* OMEGA LIVE OPERATIONS OBSERVABILITY v1.0.0
 * Read-only presentation over authoritative Game.state and existing engine ledgers.
 * It never creates gameplay records, guesses missing values, or runs simulation actions.
 * Expensive scans run only while the panel is open; no permanent polling loop.
 */
(function (g) {
  'use strict';
  if (g.OmegaLiveOpsObservability && g.OmegaLiveOpsObservability.VERSION) return;

  const MAX_EVENTS = 400;
  const MAX_TURNS = 160;
  const HOT_EVENTS = [
    'OMEGA_READY','OMEGA_GAME_SESSION_STARTED','OMEGA_RESOURCE_SITE_BINDING_READY','OMEGA_RESOURCE_BOOTSTRAP_STATUS',
    'OMEGA_SIMULATION_TURN_COMMITTED','OMEGA_RESOURCE_EXTRACTION_BLOCKED',
    'OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_EXTRACTION_PLAN_CREATED',
    'OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE','OMEGA_RESOURCE_FACTORY_INPUT_LEDGER_RECONCILED',
    'OMEGA_RESOURCE_FACTORY_ROUTE_PLANNED','OMEGA_RESOURCE_BATCH_CREATED',
    'OMEGA_RESOURCE_INVENTORY_CHANGED','OMEGA_RESOURCE_INVENTORY_RECONCILED',
    'OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',
    'OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED','OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',
    'OMEGA_RESOURCE_SHIPMENT_CREATED','OMEGA_RESOURCE_DELIVERY_BLOCKED',
    'OMEGA_RESOURCE_DELIVERY_COMPLETED','OMEGA_RESOURCE_SITE_FLOW_BLOCKED',
    'OMEGA_RESOURCE_SITE_FLOW_PROCESSED','OMEGA_RESOURCE_SITE_PIPELINE_STARTED',
    'OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED','OMEGA_TRADE_COUNTER_OFFERED',
    'OMEGA_TRADE_REQUEST_ACCEPTED','OMEGA_TRADE_REQUEST_REJECTED',
    'OMEGA_TRADE_REQUEST_RETRY_CREATED','OMEGA_TRADE_REQUEST_RETRY_SCHEDULED',
    'OMEGA_TRADE_SETTLEMENT_COMPLETED','OMEGA_TRADE_SETTLEMENT_FAILED',
    'OMEGA_TRADE_SHIPMENT_CREATED','OMEGA_TRADE_DIPLOMATIC_RELATION_ADJUSTED',
    'OMEGA_MINISTRY_MESSAGE_CREATED','OMEGA_FACTORY_PROJECT_STARTED',
    'OMEGA_PROJECT_COMPLETED','RESOURCE_STATE_UPDATED','OMEGA_RESOURCE_ECONOMY_UPDATED',
    'MINISTRY_STATE_CHANGED','MINISTRY_SELECTED','DECISION_ENACTED','POLICY_APPROVED'
  ];
  const store = g.__OMEGA_LIVEOPS_STORE__ || (g.__OMEGA_LIVEOPS_STORE__ = {
    events: [], history: Object.create(null), lastTurnByCountry: Object.create(null), eventSequence: 0
  });
  let countryScope = null;
  let currentTab = 'overview';
  let currentResource = '';
  let currentFilter = 'ALL';
  let refreshHandle = null;
  let renderScheduleHandle = null;
  let lastRenderedTab = null;
  let lastPolledTurn = null;
  let root = null;
  let panelOpen = false;

  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const obj = x => x && typeof x === 'object' ? x : {};
  const arr = x => Array.isArray(x) ? x : [];
  const id = x => String(x == null ? '' : x).trim().toUpperCase();
  function canonicalCountryId(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge ||
      obj(g.Omega).CanonicalIdentity;
    try {
      const resolved = registry && typeof registry.resolveCountry === 'function' ? registry.resolveCountry(raw) : null;
      const candidate = resolved && (resolved.id || resolved.iso3 || resolved.countryId || resolved.code || resolved.countryCode);
      if (candidate) return id(candidate);
    } catch (_) {}
    const lookup = obj(g.Game && g.Game.countryLookup);
    const entry = Object.entries(lookup).find(([key, row]) =>
      id(key) === id(raw) || id(row && row.name) === id(raw) ||
      id(row && row.countryName) === id(raw) || id(row && row.commonName) === id(raw));
    if (entry) {
      const [key, rowValue] = entry, row = obj(rowValue);
      const candidate = row.iso3 || row.iso_a3 || row.alpha3 || row.countryId ||
        row.countryCode3 || row.id || (id(key).length === 3 ? key : row.code || key);
      if (candidate) return id(candidate);
    }
    try {
      const candidate = g.Game && typeof g.Game.getCountryId === 'function' ? g.Game.getCountryId(raw) : null;
      if (candidate && id(candidate) !== id(raw)) return id(candidate);
    } catch (_) {}
    return id(raw).replace(/[-\s]+/g, '_');
  }
  function resourceSiteRecords() {
    const binding = obj(obj(g.Omega).IndividualResourceSiteBinding || g.OmegaIndividualResourceSiteBinding);
    return arr(binding.sites);
  }  const txt = x => String(x == null ? '' : x);
  const numeric = x => {
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x === 'string' && x.trim() !== '' && /^-?\d+(?:\.\d+)?$/.test(x.trim())) {
      const n = Number(x); return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const firstNum = (...xs) => {
    for (const x of xs) { const n = numeric(x); if (n !== null) return n; }
    return null;
  };
  const h = x => txt(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = (x, digits = 2) => {
    const n = numeric(x);
    if (n === null) return 'Not recorded';
    const formatter = g.OmegaNumberFormat;
    return formatter && typeof formatter.compact === 'function'
      ? formatter.compact(n, { maximumFractionDigits: digits })
      : n.toLocaleString(undefined, { maximumFractionDigits: digits });
  };
  const gameState = () => obj(g.Game && g.Game.state || g.gameState || g.Omega && g.Omega.Simulation && g.Omega.Simulation.state);
  const currentTurn = () => {
    const s = gameState();
    return firstNum(s.simulation && s.simulation.turn, s.turn, s.simulationTurn,
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn);
  };
  const dataDomains = ['resource','economy','finance','trade','transport','foreign','military','industry','government','politics','society','population','intelligence','technology'];
  function bucket(domain, countryId) {
    const s = gameState(), map = obj(s[domain]);
    const raw = String(countryId == null ? '' : countryId).trim();
    if (raw && own(map, raw)) return obj(map[raw]);
    const normalized = id(raw), canonical = canonicalCountryId(raw);
    const exactKey = Object.keys(map).find(k => id(k) === normalized);
    if (exactKey) return obj(map[exactKey]);
    const aliasKey = Object.keys(map).find(k => {
      if (!k || ['SCHEMAVERSION','VERSION','METADATA','DEFAULTS','GLOBAL','SHARED'].includes(id(k))) return false;
      return canonicalCountryId(k) === canonical;
    });
    return aliasKey ? obj(map[aliasKey]) : {};
  }
  function countryIds() {
    const s = gameState(), found = new Set();
    const add = value => {
      const key = canonicalCountryId(value);
      if (key && !['SCHEMAVERSION','VERSION','METADATA','DEFAULTS','GLOBAL','SHARED'].includes(key)) found.add(key);
    };
    dataDomains.forEach(domain => Object.keys(obj(s[domain])).forEach(add));
    resourceSiteRecords().forEach(site => add(site && (site.countryId ||
      obj(site.identity).countryIso3 || obj(site.sourceSiteRecord).countryId)));
    [playerCountry(), selectedCountry()].forEach(add);
    return [...found].filter(Boolean).sort();
  }
  function playerCountry() {
    const s = gameState(), p = obj(s.player), country = obj(p.country);
    const choices = [
      s.playerCountryId, s.playerCountryCode, s.sovereignCountryId,
      p.countryId, p.countryCode, country.iso3, country.countryId, country.id, country.code, country.name,
      g.Game && (g.Game.playerCountryId || g.Game.playerCountryCode),
      g.OMEGA_PLAYER_COUNTRY_ID
    ];
    for (const c of choices) if (typeof c === 'string' && c.trim()) return canonicalCountryId(c);
    return null;
  }
  function selectedCountry() {
    const choices = [
      g.Game && (g.Game.selectedCountryId || g.Game.activeCountry || g.Game.currentActiveCountry),
      g.currentActiveCountry, g.CountryIOS && g.CountryIOS.activeCountry, g.Game && g.Game.countryId
    ];
    for (const c of choices) if (typeof c === 'string' && c.trim()) return canonicalCountryId(c);
    return null;
  }
  function countryName(cid) {
    const key = canonicalCountryId(cid) || id(cid);
    const lookup = obj(g.Game && g.Game.countryLookup);
    const entry = Object.entries(lookup).find(([k, row]) =>
      canonicalCountryId(k) === key || canonicalCountryId(row && (row.name || row.countryName || row.commonName)) === key);
    const row = obj(entry && entry[1]);
    if (row.name || row.countryName || row.commonName) return txt(row.name || row.countryName || row.commonName);
    try {
      const registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || obj(g.Omega).CanonicalIdentity;
      const resolved = registry && typeof registry.resolveCountry === 'function' ? registry.resolveCountry(key) : null;
      if (resolved && (resolved.name || resolved.canonicalName || resolved.displayName)) {
        return txt(resolved.name || resolved.canonicalName || resolved.displayName);
      }
    } catch (_) {}
    const site = resourceSiteRecords().find(s => canonicalCountryId(s && s.countryId) === key);
    if (site) {
      const source = obj(site.sourceSiteRecord), location = obj(site.location);
      if (location.countryName || source.countryName) return txt(location.countryName || source.countryName);
    }
    const b = bucket('resource', key);
    return txt(b.countryName || b.name || key);
  }
  function resolveCountryId(value) {
    const key = canonicalCountryId(value);
    return key || null;
  }
  function selectedIds() {
    return countryScope && id(countryScope) !== 'WORLD'
      ? [resolveCountryId(countryScope) || id(countryScope)] : countryIds();
  }
  function turnOf(row) { return firstNum(row && row.simulationTurn, row && row.turn, row && row.simulation && row.simulation.turn); }
  function pushEvent(type, detail, source) {
    const envelope = obj(detail);
    const d = obj(envelope.detail || envelope.eventDetail || envelope);
    const p = obj(d.payload || d.data || d.eventPayload || d.context || d);
    const nestedCountry = typeof d.country === 'string' ? d.country :
      (d.country && (d.country.id || d.country.iso3 || d.country.countryId || d.country.code || d.country.name));
    const payloadCountry = typeof p.country === 'string' ? p.country :
      (p.country && (p.country.id || p.country.iso3 || p.country.countryId || p.country.code || p.country.name));
    const countryValue = d.countryId || d.countryCode || nestedCountry ||
      p.countryId || p.countryCode || payloadCountry || obj(p.context).countryId || '';
    const summary = d.summary || d.eventSummary || p.summary || p.reason || p.message ||
      p.status || p.stage || p.resourceId || p.siteId || p.mineId || p.batchId ||
      p.shipmentId || p.requestId || p.topic || '';
    const record = {
      sequence: ++store.eventSequence,
      type: txt(d.eventType || d.type || p.eventType || p.type || type || 'ENGINE_EVENT'),
      countryId: canonicalCountryId(countryValue),
      turn: firstNum(d.simulationTurn, p.simulationTurn, d.turn, p.turn,
        d.simulation && d.simulation.turn, p.simulation && p.simulation.turn, currentTurn()),
      summary: txt(summary),
      payload: p,
      source: source || d.source || p.source || 'BROWSER_EVENT',
      observedAt: Date.now()
    };
    store.events.push(record);
    if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);
    if (panelOpen) scheduleRender();
  }
  function valueAt(o, paths) {
    for (const path of paths) {
      let cur = o;
      for (const part of path.split('.')) cur = cur == null ? undefined : cur[part];
      const n = numeric(cur);
      if (n !== null) return n;
    }
    return null;
  }
  function metricsFor(cid) {
    const s = gameState(), e = bucket('economy', cid), f = bucket('finance', cid);
    const soc = bucket('society', cid), pop = bucket('population', cid), mil = bucket('military', cid);
    const t = bucket('trade', cid);
    return {
      gdp: valueAt(e, ['gdp','GDP','nominalGDP','nominalGdp','gdpValue']),
      treasury: valueAt(f, ['available','reserves','treasury','balance','cash','total']),
      population: valueAt(soc, ['population.total','population','totalPopulation','populationCount']) ??
        valueAt(pop, ['total','population','count']),
      military: valueAt(mil, ['power','strength','readiness','combatReadiness','militaryPower']),
      tradeRequests: arr(t.importRequests).length,
      tradeSettled: arr(t.importRequests).filter(r => id(r && r.status) === 'SETTLED').length,
      _hasState: ['resource','economy','finance','trade'].some(domain =>
        Object.keys(obj(s[domain])).some(key => canonicalCountryId(key) === canonicalCountryId(cid)))
    };
  }
  function getMineLedger(cid) {
    const r = bucket('resource', cid);
    return arr(r.mineProductionLedger || r.mineProductionHistory || r.productionLedger);
  }
  function sampleCountry(cid, turn) {
    if (turn === null) return;
    const key = id(cid), prev = store.lastTurnByCountry[key];
    if (prev === turn) return;
    const metrics = metricsFor(key);
    const production = Object.create(null);
    getMineLedger(key).forEach(row => {
      if (turnOf(row) !== turn) return;
      const q = firstNum(row.quantity, row.producedQuantity, row.outputQuantity);
      if (q === null) return;
      const resource = txt(row.resourceId || row.resource || row.commodityId || 'UNKNOWN');
      const unit = txt(row.unit || row.quantityUnit || '');
      const k = resource + '|' + unit;
      production[k] = (production[k] || 0) + q;
    });
    const record = { turn, metrics, production };
    const hist = store.history[key] || (store.history[key] = []);
    const existing = hist.findIndex(x => x.turn === turn);
    if (existing >= 0) hist[existing] = record;
    else hist.push(record);
    hist.sort((a,b) => a.turn - b.turn);
    if (hist.length > MAX_TURNS) hist.splice(0, hist.length - MAX_TURNS);
    store.lastTurnByCountry[key] = turn;
  }
  function updateHud() {
    if (!g.document) return;
    const cid = playerCountry() || selectedCountry();
    const known = !!cid && metricsFor(cid)._hasState;
    const f = bucket('finance', cid || ''), e = bucket('economy', cid || ''), p = bucket('politics', cid || ''), gov = bucket('government', cid || ''), mil = bucket('military', cid || ''), r = bucket('resource', cid || '');
    const set = (key, value) => { const node = g.document.getElementById(key); if (node) node.textContent = value; };
    const currency = txt(f.currencyCode || f.currency || e.currencyCode || e.currency_code || '').trim();
    const cash = firstNum(f.available, f.reserves, f.balance, f.treasury, f.cash, e.treasury, e.cash);
    const power = firstNum(p.politicalPower, p.power, p.politicalCapital, gov.politicalPower, gov.power);
    const manpower = firstNum(mil.manpower, mil.personnel, mil.activePersonnel, mil.totalPersonnel, mil.troops, mil.armedForces && mil.armedForces.personnel);
    const energy = firstNum(e.energyProduction, e.energyProduced, e.powerProduction, e.electricityProduction, e.powerSystem && e.powerSystem.production);
    const inventory = obj(r.inventory), oilKey = Object.keys(inventory).find(k => /(^|_)(crude_?oil|oil|petroleum)(_|$)/i.test(k));
    const oil = oilKey ? numeric(inventory[oilKey]) : null;
    const date = gameState().simulation && gameState().simulation.date;
    const t = currentTurn();
    set('res-cash', cash === null ? 'Not recorded' : fmt(cash)+' '+currency);
    set('res-power', power === null ? 'Not recorded' : fmt(power));
    set('res-manpower', manpower === null ? 'Not recorded' : fmt(manpower));
    set('res-energy', energy === null ? 'Not recorded' : fmt(energy)+(e.energyUnit || e.powerUnit ? ' '+(e.energyUnit || e.powerUnit) : ' (unit not recorded)'));
    set('res-oil', oil === null ? 'Not recorded' : fmt(oil)+(obj(r.inventoryUnits)[oilKey] ? ' '+obj(r.inventoryUnits)[oilKey] : ' (unit not recorded)'));
    set('status-clock', (date ? txt(date) : 'GAME TIME NOT RECORDED')+(t === null ? '' : ' · TURN '+fmt(t,0)));
    set('status-autosave', 'SAVE STATUS UNKNOWN');
    set('status-link', known ? 'ENGINE STATE LINKED' : 'STATE NOT LINKED');
    set('status-fps', 'FPS N/A');
  }
  function sampleAll(recordCommittedTurn = false, committedTurn = null) {
    const turn = firstNum(committedTurn, currentTurn());
    // History is sampled only at an authoritative turn-commit event.
    // Opening or refreshing the UI must not freeze a mid-turn snapshot.
    if (recordCommittedTurn && turn !== null) {
      // Keep turn-commit work bounded: sample the player/currently selected country,
      // plus the explicit country being inspected. Do not scan every country on each turn.
      const observe = new Set([playerCountry(), selectedCountry()]);
      if (panelOpen && countryScope && id(countryScope) !== 'WORLD') observe.add(resolveCountryId(countryScope));
      observe.forEach(cid => { if (cid) sampleCountry(cid, turn); });
    }
    updateHud();
  }
  function getTrendSeries(countryId, ministryId) {
    const cid = resolveCountryId(countryId) || id(countryId), hist = arr(store.history[cid]);
    const ministry = id(ministryId || 'economy').toLowerCase();
    const output = [];
    if (!hist.length) return output;
    if (['resource','resources','energy_mining','industry','transport'].includes(ministry)) {
      const resourceKeys = new Set();
      hist.forEach(hrow => Object.keys(obj(hrow.production)).forEach(k => resourceKeys.add(k)));
      [...resourceKeys].sort().forEach(k => {
        const split = k.split('|');
        const points = hist.filter(r => own(obj(r.production), k)).map(r => ({turn:r.turn, value:r.production[k]}));
        if (points.length) output.push({ key:'production:'+k, label:split[0]+' production', unit:split[1], points });
      });
      return output;
    }
    if (['trade','foreign','foreign_affairs','diplomacy'].includes(ministry)) {
      [['tradeRequests','Recorded trade requests'],['tradeSettled','Settled trade requests']].forEach(([key,label]) => {
        const points = hist.filter(r => numeric(r.metrics[key]) !== null).map(r => ({turn:r.turn,value:r.metrics[key]}));
        if (points.length) output.push({key,label,unit:'records',points});
      });
      return output;
    }
    const specs = [
      ['gdp','GDP', ''],
      ['treasury','Available treasury', ''],
      ['population','Population','people'],
      ['military','Military power/readiness','index']
    ];
    const preferred = ['defense','military','intelligence'].includes(ministry) ? ['military','treasury','gdp','population'] :
      ['health','education','society'].includes(ministry) ? ['population','gdp','treasury','military'] :
      ['finance','economy','cabinet','trade'].includes(ministry) ? ['gdp','treasury','population','military'] :
      ['gdp','treasury','population','military'];
    preferred.forEach(key => {
      const spec = specs.find(x => x[0] === key);
      const points = hist.filter(r => numeric(r.metrics[key]) !== null).map(r => ({turn:r.turn,value:r.metrics[key]}));
      if (points.length >= 2) output.push({key,label:spec[1],unit:spec[2],points});
    });
    return output;
  }
  function statusText(row) { return txt(row && (row.status || row.stage || row.processingStatus || row.shipmentStatus || row.dispatchStatus) || 'STATUS_NOT_RECORDED'); }
  function minesFor(ids) {
    const rows = new Map();
    const includedCountries = new Set(arr(ids).map(value => canonicalCountryId(value) || id(value)));
    const inScope = country => {
      if (!includedCountries.size) return true;
      const key = canonicalCountryId(country) || id(country);
      return includedCountries.has(key);
    };
    const upsert = (countryId, siteId, record) => {
      const country = canonicalCountryId(countryId) || id(countryId);
      const site = txt(siteId || record.siteId || record.mineId || record.id || record.occurrenceKey || 'SITE_ID_MISSING').trim();
      if (!country || !site) return;
      const key = country + '|' + site, previous = rows.get(key) || {};
      const next = { ...previous, countryId: country, siteId: site };
      Object.entries(record).forEach(([field, value]) => {
        if (value === undefined) return;
        const preserve = ['name','resourceId','unit','quantity','turn','batchId',
          'profileDailyRate','profileRateUnit','coordinates','coordinateStatus','sourcePath','siteType'];
        if ((value === null || value === '') && own(previous, field) && preserve.includes(field)) return;
        next[field] = value;
      });
      next.runtimeRecorded = previous.runtimeRecorded === true || record.runtimeRecorded === true;
      next.registryRecord = previous.registryRecord === true || record.registryRecord === true;
      rows.set(key, next);
    };

    // Reuse the existing canonical site registry. A static profile is not a live extraction.
    resourceSiteRecords().forEach(site => {
      if (!site || typeof site !== 'object') return;
      const source = obj(site.sourceSiteRecord), identity = obj(site.identity);
      const country = canonicalCountryId(site.countryId || identity.countryIso3 || source.countryId);
      const siteId = txt(site.siteId || source.siteId || source.id || '');
      if (!country || !siteId || !inScope(country)) return;
      const coordinates = obj(site.coordinates || obj(site.location).coordinates);
      const quantitative = obj(site.quantitative || source.quantitative);
      const production = obj(quantitative.production || obj(site.simulation).production);
      const operation = obj(site.operation || site.operationProfile || site.real || source.operation);
      const simulation = obj(site.simulation || source.simulation);
      const siteLogistics = obj(site.logistics || source.logistics);
      const routeValue = simulation.transportRoute || simulation.transportRoutes || site.transportRoute || siteLogistics.routes || site.routes ||
        obj(source.simulation).transportRoute || obj(source.simulation).transportRoutes || source.transportRoute ||
        obj(source.logistics).routes || source.routes || [];
      const profileRoutes = Array.isArray(routeValue) ? routeValue : (routeValue ? [routeValue] : []);
      upsert(country, siteId, {
        name: txt(site.siteName || source.siteName || source.name || siteId),
        resourceId: txt(obj(site.real).resourceId || source.resourceId || source.resourceTypeId ||
          source.resourceTypeKey || source.resId || identity.resourceTypeId || ''),
        unit: txt(production.unit || obj(site.simulation).productionRateUnit || ''),
        status: txt(operation.status || operation.operationalStatus || obj(site.real).operationStatus || 'PROFILE_ONLY'),
        quantity: null, turn: null, batchId: '',
        profileDailyRate: firstNum(production.rate, simulation.productionRate),
        profileRateUnit: txt(production.unit || simulation.productionRateUnit || ''),
        profileRoutes,
        siteType: txt(identity.siteType || site.siteType || source.siteType || source.type || ''),
        coordinates,
        coordinateStatus: txt(obj(site.location).coordinateStatus || obj(site.real).coordinateStatus ||
          source.coordinateStatus || obj(source.provenance).coordinateStatus || ''),
        sourcePath: txt(site.sourcePath || obj(site.sourceReference).source || source.source || ''),
        recordSource: 'CANONICAL_RESOURCE_SITE_REGISTRY',
        registryRecord: true,
        runtimeRecorded: false
      });
    });

    ids.forEach(cid => {
      const r = bucket('resource', cid), outputMap = obj(r.mineOutputs);
      const matchingOutputKeys = new Set();
      // Retained history is merged before current runtime state so latest state wins.
      getMineLedger(cid).slice(-500).forEach((row, index) => {
        const siteId = txt(row && (row.siteId || row.mineId || row.occurrenceKey || row.depositId) ||
          'PRODUCTION_LEDGER_ROW_' + index);
        upsert(cid, siteId, {
          name: txt(row && (row.mineName || row.siteName || row.depositName || row.name) || ''),
          resourceId: txt(row && (row.resourceId || row.resource || row.commodityId) || ''),
          unit: txt(row && (row.unit || row.quantityUnit) || ''),
          status: txt(row && (row.status || row.stage) || 'PRODUCTION_LEDGER_RECORD'),
          quantity: firstNum(row && row.quantity, row && row.producedQuantity, row && row.outputQuantity),
          turn: turnOf(row), batchId: txt(row && row.batchId || ''),
          recordSource: 'GAME_STATE_PRODUCTION_LEDGER', runtimeRecorded: true
        });
      });
      arr(r.mines).forEach(m => {
        const siteId = txt(m && (m.siteId || m.mineId || m.id || m.occurrenceKey) || '');
        const occurrence = txt(m && m.occurrenceKey || ''), mineId = txt(m && (m.mineId || m.id) || '');
        [occurrence, siteId, mineId].filter(Boolean).forEach(key => matchingOutputKeys.add(key));
        const output = obj(outputMap[occurrence] || outputMap[siteId] || outputMap[mineId]);
        upsert(cid, siteId, {
          name: txt(m && (m.depositName || m.siteName || m.name || m.mineName || '') || ''),
          resourceId: txt(m && m.resourceId || output.resourceId || ''),
          unit: txt(output.unit || output.quantityUnit || (m && (m.unit || m.quantityUnit)) || ''),
          status: statusText(output.status ? output : m),
          quantity: firstNum(output.producedQuantity, output.quantity, output.outputQuantity),
          turn: firstNum(output.turn, output.simulationTurn, turnOf(m)),
          batchId: txt(output.batchId || (m && m.lastBatchId) || ''),
          recordSource: 'GAME_STATE_RUNTIME', runtimeRecorded: true
        });
      });
      Object.entries(outputMap).forEach(([key, outputValue]) => {
        const output = obj(outputValue);
        if (!Object.keys(output).length || matchingOutputKeys.has(key)) return;
        const siteId = txt(output.siteId || output.mineId || output.occurrenceKey || key);
        upsert(cid, siteId, {
          name: txt(output.siteName || output.mineName || output.depositName || ''),
          resourceId: txt(output.resourceId || output.resource || ''),
          unit: txt(output.unit || output.quantityUnit || ''),
          status: statusText(output),
          quantity: firstNum(output.producedQuantity, output.quantity, output.outputQuantity),
          turn: firstNum(output.turn, output.simulationTurn),
          batchId: txt(output.batchId || ''),
          recordSource: 'GAME_STATE_RUNTIME', runtimeRecorded: true
        });
      });
    });
    return [...rows.values()].sort((a, b) =>
      a.countryId.localeCompare(b.countryId) || a.name.localeCompare(b.name) || a.siteId.localeCompare(b.siteId));
  }
  function allShipments(ids) {
    const rows = [], seen = new Set();
    ids.forEach(owner => {
      const r = bucket('resource', owner), tr = bucket('transport', owner), t = bucket('trade', owner);
      const net = obj(r.industrialNetwork);
      const candidates = arr(net.shipments).concat(arr(net.deliveries),arr(tr.shipments),arr(t.shipments),arr(t.importShipments),arr(t.exportShipments));
      candidates.forEach((x,i) => {
        const source = id(x.sourceCountryId || x.originCountryId || x.sellerCountryId || x.fromCountryId || x.countryId || owner);
        const dest = id(x.destinationCountryId || x.targetCountryId || x.buyerCountryId || x.toCountryId || x.counterpartyCountryId || '');
        const shipmentId = txt(x.shipmentId || x.id || x.batchId || (owner+':'+i+':'+txt(x.resourceId)));
        const key = source+'|'+dest+'|'+shipmentId;
        if (seen.has(key)) return; seen.add(key);
        const scoped = countryScope && id(countryScope) !== 'WORLD' ? canonicalCountryId(countryScope) : null;
        if (scoped && canonicalCountryId(source) !== scoped && canonicalCountryId(dest) !== scoped && canonicalCountryId(owner) !== scoped) return;
        rows.push({source,dest,id:shipmentId,resourceId:txt(x.resourceId || x.commodityId || ''),quantity:firstNum(x.quantity,x.dispatchedQuantity,x.remainingQuantity),
          unit:txt(x.unit || x.quantityUnit || ''),status:statusText(x),turn:turnOf(x),siteId:txt(x.sourceSiteId || x.siteId || x.occurrenceKey || ''),
          batchId:txt(x.batchId || ''),factoryId:txt(x.factoryId || ''),row:x});
      });
    });
    return rows;
  }
  function tradeRequests(ids) {
    const rows = [], seen = new Set();
    ids.forEach(owner => {
      const t = bucket('trade', owner);
      ['importRequests','exportRequests','requests','tradeRequests'].forEach(field => {
        arr(t[field]).forEach(r => {
          const rid = txt(r.requestId || r.id || r.correlationId || '');
          const key = owner+'|'+(rid || JSON.stringify([r.resourceId,r.status,r.quantity,r.turn]));
          if (seen.has(key)) return; seen.add(key);
          rows.push({owner,buyer:canonicalCountryId(r.buyerCountryId || r.importerCountryId || r.sourceCountryId || owner),
            seller:canonicalCountryId(r.sellerCountryId || r.exporterCountryId || r.targetCountryId || r.counterpartyCountryId || r.supplierCountryId || ''),
            requestId:rid,resourceId:txt(r.resourceId || r.commodityId || ''),quantity:firstNum(r.quantity,r.requestedQuantity,r.amount),
            unit:txt(r.unit || r.quantityUnit || ''),status:statusText(r),turn:turnOf(r),stage:txt(r.stage || ''),row:r});
        });
      });
    });
    return rows;
  }
  function eventRows(ids) {
    const scopedCountry = countryScope && id(countryScope) !== 'WORLD' ? canonicalCountryId(countryScope) : null;
    const rows = store.events.filter(e => !scopedCountry || !e.countryId || canonicalCountryId(e.countryId) === scopedCountry).map(e => ({
      turn:e.turn,type:e.type,countryId:e.countryId,summary:e.summary || '',source:e.source,observedAt:e.observedAt
    }));
    ids.forEach(cid => {
      const r = bucket('resource', cid), e = bucket('economy', cid), n = obj(r.industrialNetwork);
      arr(n.events).concat(arr(n.siteFlowLedger),arr(n.siteExecutions),arr(n.deliveries),
        arr(r.mineProductionLedger),arr(e.industrialRuntime && e.industrialRuntime.factoryInputEvents)).forEach(row => {
          const type = txt(row.eventType || row.type || row.stage || row.status || 'ENGINE_LEDGER_RECORD');
          const summary = txt(row.message || row.reason || row.resourceId || row.siteId || row.mineId || row.batchId || row.shipmentId || '');
          rows.push({turn:turnOf(row),type,countryId:cid,summary,source:'ENGINE_LEDGER',observedAt:firstNum(row.timestamp,row.createdAt)});
        });
    });
    const unique = new Map();
    rows.forEach((row,i) => {
      const key = [row.turn,row.type,row.countryId,row.summary,row.source,row.observedAt || i].join('|');
      unique.set(key,row);
    });
    return [...unique.values()].sort((a,b) => {
      if (a.turn !== null && b.turn !== null) return b.turn-a.turn;
      return (b.observedAt || 0)-(a.observedAt || 0);
    }).slice(0,100);
  }
  function flowRows(ids) {
    const out = [], seen = new Set();
    ids.forEach(cid => {
      const net = obj(bucket('resource',cid).industrialNetwork);
      arr(net.siteExecutions).concat(arr(net.siteFlowLedger)).forEach(row => {
        const siteId = txt(row.siteId || row.occurrenceKey || row.depositId || '');
        const turn = turnOf(row);
        const k = cid+'|'+siteId+'|'+(turn === null ? 'NA' : turn);
        if (!siteId || seen.has(k)) return;
        seen.add(k);
        out.push({countryId:cid,siteId,resourceId:txt(row.resourceId || ''),batchId:txt(row.batchId || ''),
          status:statusText(row),turn,shipmentId:txt(row.shipmentId || ''),factoryId:txt(row.factoryId || ''),
          reason:txt(row.reason || row.blockReason || row.lastResidualBlockReason || '')});
      });
    });
    return out.sort((a,b) => (b.turn || -1)-(a.turn || -1)).slice(0,200);
  }
  function communications(ids) {
    const rows = [];
    ids.forEach(cid => {
      const f = bucket('foreign', cid);
      ['communicationLedger','communicationLog','messages','messageLedger','diplomaticLog','contacts','contactHistory','diplomacyEvents'].forEach(k => {
        arr(f[k]).forEach(row => rows.push({countryId:cid,turn:turnOf(row),type:txt(row.eventType || row.type || row.topic || row.kind || k),
          peer:canonicalCountryId(row.targetCountryId || row.counterpartyCountryId || row.peerCountryId || row.toCountryId || row.countryId || ''),
          status:statusText(row),summary:txt(row.message || row.topic || row.reason || row.requestId || row.id || ''),source:'COUNTRY_LEDGER'}));
      });
    });
    store.events.filter(e => /MESSAGE|COMMUNICATION|CONTACT|DIPLOM|TREATY|RELATION|MINISTRY_REQUEST|MINISTRY_RESPONSE/i.test(e.type)).forEach(e =>
      rows.push({countryId:e.countryId,turn:e.turn,type:e.type,peer:id(e.payload && (e.payload.targetCountryId || e.payload.counterpartyCountryId || e.payload.toCountryId || e.payload.peerCountryId) || ''),
        status:txt(e.payload && e.payload.status || ''),summary:e.summary,source:'LIVE_EVENT_TAPE'}));
    const unique = new Map();
    rows.forEach((r,i) => unique.set([r.countryId,r.turn,r.type,r.peer,r.summary,r.source,i < rows.length ? '' : i].join('|'),r));
    return [...unique.values()].sort((a,b) => (b.turn || -1)-(a.turn || -1)).slice(0,100);
  }
  function countsByStatus(rows) {
    const out = Object.create(null);
    rows.forEach(r => { const s = txt(r.status || 'STATUS_NOT_RECORDED').toUpperCase(); out[s] = (out[s] || 0) + 1; });
    return Object.keys(out).sort().map(k => ({label:k,count:out[k]}));
  }
  function siteRouteProfiles(ids) {
    return minesFor(ids).flatMap(site => arr(site.profileRoutes).map((route,index) => {
      const row = obj(route);
      return {
        countryId:site.countryId, siteId:site.siteId,
        routeId:txt(row.routeId || row.id || ''),
        routeName:txt(row.routeName || row.name || row.routeId || row.id || ('Route '+(index+1))),
        profileOnly:true,
        source:'CANONICAL_RESOURCE_SITE_REGISTRY',
        route
      };
    }));
  }
  function observedStateSummary(ids) {
    const mine = minesFor(ids), shipments = allShipments(ids), requests = tradeRequests(ids), flows = flowRows(ids);
    const turn = currentTurn();
    return {
      countryCount: ids.length,
      mineRecords: mine.length,
      registeredResourceSites: mine.filter(row => row.registryRecord === true).length,
      runtimeMineRecords: mine.filter(row => row.runtimeRecorded === true).length,
      siteRouteProfiles: mine.reduce((count,row) => count + arr(row.profileRoutes).length, 0),
      currentTurnMineOutputs: mine.filter(row => row.runtimeRecorded === true &&
        row.turn !== null && turn !== null && row.turn === turn && row.quantity !== null).length,
      inTransit: shipments.filter(s => /IN_TRANSIT|DISPATCHED|SHIPPED|MOVING/.test(s.status)).length,
      shipmentRecords: shipments.length,
      tradeRequests: requests.length,
      pendingRequests: requests.filter(r => /SENT|ACCEPTED|PENDING|WAITING|NEGOTIAT/.test(r.status)).length,
      settledRequests: requests.filter(r => /SETTLED|COMPLETED/.test(r.status)).length,
      siteFlowRecords: flows.length,
      liveEvents: store.events.length
    };
  }
  function card(label,value) {
    return '<article class="omega-liveops-card"><span>'+h(label)+'</span><strong>'+h(value)+'</strong></article>';
  }
  function table(headers, rows, empty) {
    if (!rows.length) return '<p class="omega-liveops-empty">'+h(empty || 'No records are present in the current data source.')+'</p>';
    return '<div class="omega-liveops-table-wrap"><table class="omega-liveops-table"><thead><tr>'+headers.map(x=>'<th>'+h(x)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.join('')+'</tbody></table></div>';
  }
  function tr(cells) { return '<tr>'+cells.map(x=>'<td>'+h(x === '' || x == null ? 'Not recorded' : x)+'</td>').join('')+'</tr>'; }
  function sourceNote() { return ''; }
  function renderProductionReadiness() {
    const snapshot=g.__omegaResourceEndowmentLastBootstrap;
    if(!snapshot){
      const count=resourceSiteRecords().length;
      return '<div class="omega-liveops-section"><h3>Mine production readiness</h3><p class="omega-liveops-empty">Runtime activation report has not arrived yet. '+h(fmt(count,0))+' site profiles are currently visible; profile counts alone do not prove production.</p></div>';
    }
    const capable=snapshot.productionCapableSiteCount;
    const total=snapshot.commercialCandidateCount;
    const turnActive=snapshot.currentTurnProducingSiteCount;
    const blockedCount=snapshot.blockedSiteCount;
    const hasPercent=snapshot.productionCapablePercent!==null&&snapshot.productionCapablePercent!==undefined&&Number.isFinite(Number(snapshot.productionCapablePercent));
    const readyValue=capable!==null&&capable!==undefined&&Number.isFinite(Number(capable))&&total!==null&&total!==undefined
      ?fmt(capable,0)+' / '+fmt(total,0)
      :'Not evaluated';
    const percent=hasPercent?Number(snapshot.productionCapablePercent).toFixed(1)+'%':'Not evaluated';
    const active=turnActive!==null&&turnActive!==undefined&&Number.isFinite(Number(turnActive))?fmt(turnActive,0):'Not evaluated';
    const blocked=blockedCount!==null&&blockedCount!==undefined&&Number.isFinite(Number(blockedCount))?fmt(blockedCount,0):'Not evaluated';
    const rows=arr(snapshot.blockedSites).slice(0,30).map(site=>tr([
      site.countryId,site.siteName||site.siteId,site.siteId,site.reason
    ]));
    const stateNote=snapshot.status==='FAILED'
      ?'Bootstrap failed: '+txt(snapshot.reason||'runtime initialisation failed')
      :snapshot.status==='DEGRADED'
        ?'Some country extraction commands failed. Check the site-level blocker list and recorded engine events.'
        :snapshot.status==='NO_OUTPUT'
          ?'The bootstrap pass ran, but no current-turn production batches were confirmed.'
          :'The status is based on current Game.state, attached extraction controllers and current-turn production/batch ledgers.';
    return '<div class="omega-liveops-section"><h3>Mine production readiness</h3><div class="omega-liveops-grid">'+
      card('Production-capable sites',readyValue,'Commercial site profiles with an attached, unblocked simulation extraction path')+
      card('Production-capable share',percent,'Of bound commercial site candidates; gameplay simulation, not real-world output')+
      card('Producing sites this turn',active,'Unique site IDs with positive current-turn output')+
      card('Sites requiring repair',blocked,'Missing controller/occurrence link or a current extraction blocker')+
      '</div><p class="omega-liveops-empty">'+h(stateNote)+'</p>'+
      '<p class="omega-liveops-empty">Data boundary: simulated reserves/rates are game values unless explicitly marked OBSERVED. This report does not assign market prices or post sale revenue.</p>'+
      '<h4>Sites not confirmed production-capable</h4>'+
      table(['Country','Site','Site ID','Current blocker'],rows,
        Number(snapshot.unverifiedSiteCount)>0?'Runtime did not finish. Site eligibility remains unverified for '+fmt(snapshot.unverifiedSiteCount,0)+' commercial candidates.':'No blocked site details were returned for this snapshot.')+
      '</div>';
  }
  function renderOverview(ids) {
    const sum = observedStateSummary(ids), scoped = countryScope === 'WORLD' ? 'all indexed countries' : countryName(countryScope || '');
    const hasState = ids.some(cid => metricsFor(cid)._hasState);
    return '<div class="omega-liveops-grid">'+
      card('Countries in scope',fmt(sum.countryCount,0),scoped)+
      card('Registered resource sites',fmt(sum.registeredResourceSites,0),'Canonical site profiles; not proof of extraction')+
      card('Live site records',fmt(sum.runtimeMineRecords,0),'Existing Game.state mines, outputs and production ledgers')+
      card('Saved route profiles',fmt(sum.siteRouteProfiles,0),'Existing site route definitions; not active shipments')+
      card('Recorded outputs this turn',fmt(sum.currentTurnMineOutputs,0),'Only runtime rows with explicit current-turn quantities')+
      card('Shipments in transit',fmt(sum.inTransit,0),'Existing shipments with an in-transit status')+
      card('Trade requests',fmt(sum.tradeRequests,0),'Existing import/export request records')+
      card('Site flow records',fmt(sum.siteFlowRecords,0),'Existing site execution/flow ledger rows')+
      '</div>'+renderProductionReadiness()+sourceNote(sum.registeredResourceSites || hasState
        ? 'Source: existing canonical resource-site registry + Game.state country buckets and runtime ledgers. Registry profiles are not counted as live production; missing numeric fields remain unknown. The event tape starts when this UI loads; older activity is shown only where an engine ledger retains it.'
        : 'No canonical site profiles or country-scoped Game.state records were found for the current scope. This screen does not invent replacement numbers.')+
      '<div class="omega-liveops-section"><h3>Latest engine activity</h3>'+renderEventTable(ids,12)+'</div>';
  }
  function renderEventTable(ids, limit) {
    const rows = eventRows(ids).slice(0,limit).map(r => tr([r.turn === null ? 'Turn unavailable' : 'T'+r.turn,r.type,r.countryId || 'Global',r.summary || 'Payload has no short summary',r.source]));
    return table(['Turn','Event / ledger type','Country','Recorded detail','Source'],rows,'No engine event or ledger rows are available in this scope.');
  }
  function renderFeed(ids) {
    const rows = eventRows(ids).filter(r => {
      if (currentFilter === 'RESOURCE') return /RESOURCE|MINE|FACTORY|SHIPMENT|INVENTORY|PRODUCTION|SITE_FLOW|DELIVERY/i.test(r.type);
      if (currentFilter === 'TRADE') return /TRADE|SETTLEMENT|OFFER|IMPORT|EXPORT/i.test(r.type);
      if (currentFilter === 'COMMUNICATION') return /MESSAGE|COMMUNICATION|CONTACT|DIPLOM|TREATY|RELATION|REQUEST|RESPONSE/i.test(r.type);
      return true;
    }).map(r => tr([r.turn === null ? 'Turn unavailable' : 'T'+r.turn,r.type,r.countryId || 'Global',r.summary || 'No short payload field',r.source]));
    return '<div class="omega-liveops-toolbar"><label>Event filter <select id="omega-liveops-event-filter">'+
      ['ALL','RESOURCE','TRADE','COMMUNICATION'].map(v=>'<option value="'+v+'"'+(currentFilter===v?' selected':'')+'>'+v+'</option>').join('')+
      '</select></label></div>'+table(['Turn','Event','Country','Details','Source'],rows,'No matching event records were observed or retained by an engine ledger.');
  }
  function profileRouteLabel(routes) {
    const valueLabel = value => {
      if (value === null || value === undefined || value === '') return '';
      if (typeof value !== 'object') return txt(value);
      return txt(value.name || value.label || value.id || value.siteId || value.countryId || JSON.stringify(value));
    };
    const rows = arr(routes);
    if (!rows.length) return 'Not recorded';
    return rows.map(routeValue => {
      if (!routeValue || typeof routeValue !== 'object') return valueLabel(routeValue) || 'Unnamed route';
      const route = obj(routeValue);
      const name = valueLabel(route.routeName || route.name || route.routeId || route.id);
      const from = valueLabel(route.from || route.source || route.origin || route.fromNode || route.fromSiteId || route.sourceSiteId);
      const to = valueLabel(route.to || route.target || route.destination || route.toNode || route.toSiteId || route.destinationSiteId);
      const endpoints = [from,to].filter(Boolean).join(' → ');
      return [name,endpoints].filter(Boolean).join(' · ') || JSON.stringify(route);
    }).join(' | ');
  }
  function renderResources(ids) {
    const mines = minesFor(ids), resourceNames = [...new Set(mines.map(m=>m.resourceId).filter(Boolean))].sort();
    if (!currentResource || !resourceNames.includes(currentResource)) currentResource = resourceNames[0] || '';
    const filtered = mines.filter(m => !currentResource || m.resourceId === currentResource);
    const ledgerRows = ids.flatMap(cid => getMineLedger(cid).map(m => ({countryId:canonicalCountryId(cid),row:m})))
      .sort((a,b) => (turnOf(b.row) || -1)-(turnOf(a.row) || -1)).slice(0,100);
    return '<div class="omega-liveops-toolbar"><label>Commodity/site filter <select id="omega-liveops-resource-filter"><option value="">All recorded commodities</option>'+
      resourceNames.map(v=>'<option value="'+h(v)+'"'+(currentResource===v?' selected':'')+'>'+h(v)+'</option>').join('')+
      '</select></label><span>Rows combine canonical site profiles and explicit live state. Profile rates and saved routes are not current-turn activity.</span></div>'+
      '<div class="omega-liveops-section"><h3>Canonical site profiles with live runtime overlay</h3>'+table(
        ['Country','Site identity','Resource','Status','Recorded output','Unit','Profile daily rate','Saved route profile','Turn','Batch'],
        filtered.slice(0,250).map(m=>tr([
          m.countryId,m.siteId,m.resourceId,m.status,
          m.quantity===null?'Not recorded':fmt(m.quantity),m.unit,
          m.profileDailyRate===null||m.profileDailyRate===undefined?'Not recorded':fmt(m.profileDailyRate)+(m.profileRateUnit?' '+m.profileRateUnit:''),
          profileRouteLabel(m.profileRoutes),
          m.turn===null?'Not recorded':m.turn,m.batchId
        ])),
        'No canonical resource-site profiles or runtime site records exist in the selected country scope.')+'</div>'+
      '<div class="omega-liveops-section"><h3>Production ledger</h3>'+table(['Country','Turn','Mine/site','Resource','Quantity','Unit','Batch','Purity'],
        ledgerRows.filter(x=>!currentResource||txt(x.row.resourceId)===currentResource).map(x=>tr([
          x.countryId,turnOf(x.row)===null?'Not recorded':turnOf(x.row),
          x.row.mineName||x.row.siteName||x.row.mineId||x.row.siteId,x.row.resourceId,
          firstNum(x.row.quantity,x.row.producedQuantity,x.row.outputQuantity)===null?'Not recorded':fmt(firstNum(x.row.quantity,x.row.producedQuantity,x.row.outputQuantity)),
          x.row.unit||x.row.quantityUnit,x.row.batchId,
          firstNum(x.row.purity,x.row.quality&&x.row.quality.purity)===null?'Not recorded':fmt(firstNum(x.row.purity,x.row.quality&&x.row.quality.purity))
        ])),
        'The engine has not retained mine production ledger rows in this scope.')+'</div>';
  }
  function renderTrade(ids) {
    const requests = tradeRequests(ids), shipments = allShipments(ids);
    return '<div class="omega-liveops-section"><h3>Trade requests / negotiation state</h3>'+table(['Buyer','Seller / counterpart','Request ID','Commodity','Quantity','Status','Turn','Stage'],requests.slice(0,200).map(r=>tr([r.buyer,r.seller,r.requestId,r.resourceId,r.quantity===null?'Not recorded':fmt(r.quantity)+' '+r.unit,r.status,r.turn===null?'Not recorded':r.turn,r.stage])), 'No trade request rows are stored in trade state.')+'</div>'+
      '<div class="omega-liveops-section"><h3>Cross-country shipments</h3>'+table(['Origin country','Destination country','Shipment ID','Site','Resource','Quantity','Status','Turn','Batch','Factory'],shipments.slice(0,250).map(s=>tr([s.source,s.dest,s.id,s.siteId,s.resourceId,s.quantity===null?'Not recorded':fmt(s.quantity)+' '+s.unit,s.status,s.turn===null?'Not recorded':s.turn,s.batchId,s.factoryId])), 'No shipment records are stored in the visible resource/transport/trade ledgers.')+'</div>';
  }
  function renderCommunications(ids) {
    const rows = communications(ids).map(r => tr([r.countryId,r.peer,r.turn===null?'Turn unavailable':'T'+r.turn,r.type,r.status,r.summary,r.source]));
    return sourceNote('Communication history is read from retained country ledgers and real browser events observed during this session. A missing row means no such record was found; it does not prove that no contact occurred in the world simulation.')+
      table(['Country','Counterpart','Turn','Contact type','Status','Details','Source'],rows,'No communication/contact history has been exposed by a country ledger or observed in this session.');
  }
  function barChart(title, rows, labelName) {
    if (!rows.length) return '<div class="omega-liveops-section"><h3>'+h(title)+'</h3><p class="omega-liveops-empty">No comparable recorded values are available for this chart.</p></div>';
    const max = Math.max(1,...rows.map(r=>numeric(r.value) || 0));
    return '<div class="omega-liveops-section"><h3>'+h(title)+'</h3><div class="omega-liveops-bars">'+rows.map(r=>'<div class="omega-liveops-barrow"><div class="omega-liveops-barlab"><span>'+h(r.label)+'</span><b>'+h(fmt(r.value))+(r.unit?' '+h(r.unit):'')+'</b></div><div class="omega-liveops-track"><i style="width:'+Math.max(0,Math.min(100,(numeric(r.value)||0)/max*100)).toFixed(2)+'%"></i></div></div>').join('')+'</div></div>';
  }
  function chartHistory(cid, ministryId) {
    const series = getTrendSeries(cid, ministryId);
    const valid = series.filter(s => arr(s.points).length >= 2);
    if (!valid.length) return '<div class="omega-liveops-section"><h3>Actual turn-by-turn history</h3><p class="omega-liveops-empty">No metric has two or more real, committed-turn observations yet. This chart deliberately does not synthesize past years or fill missing values with estimates.</p></div>';
    return valid.map(s => {
      const points = s.points.slice(-24), values = points.map(p=>p.value).filter(v=>numeric(v)!==null);
      if (values.length < 2) return '';
      const min = Math.min(...values), max = Math.max(...values), span = max-min || Math.max(1,Math.abs(max)*0.1);
      const coords = points.map((p,i) => ({x:30+(i/Math.max(1,points.length-1))*580,y:84-((p.value-min)/span)*56,value:p.value,turn:p.turn}));
      const poly = coords.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
      const last = coords[coords.length-1];
      return '<div class="omega-liveops-section"><h3>'+h(s.label)+' <small>'+h(s.unit || 'unit not declared')+'</small></h3><svg class="omega-liveops-linechart" viewBox="0 0 640 118" role="img" aria-label="'+h(s.label)+' by simulation turn"><line x1="30" y1="88" x2="610" y2="88" stroke="#334155"/><polyline fill="none" stroke="#38bdf8" stroke-width="3" points="'+poly+'"/>'+coords.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3" fill="#38bdf8"><title>T'+p.turn+': '+h(p.value)+'</title></circle>').join('')+'<text x="30" y="108" fill="#94a3b8" font-size="11">T'+h(points[0].turn)+'</text><text x="610" y="108" text-anchor="end" fill="#94a3b8" font-size="11">T'+h(points[points.length-1].turn)+'</text><text x="610" y="15" text-anchor="end" fill="#e2e8f0" font-size="12">'+h(fmt(last.value))+'</text></svg>'+sourceNote('Source: numeric fields retained in live Game.state snapshots from committed simulation turns.')+'</div>';
    }).join('');
  }
  function renderCharts(ids) {
    const mineRows = minesFor(ids);
    const rows = mineRows.filter(m => m.quantity !== null && (!currentResource || m.resourceId === currentResource));
    const resNames = [...new Set(rows.map(r=>r.resourceId).filter(Boolean))].sort();
    if (!currentResource || !resNames.includes(currentResource)) currentResource = resNames[0] || currentResource;
    const selected = rows.filter(r => !currentResource || r.resourceId === currentResource);
    const production = selected.map(m=>({label:m.name+' ('+m.countryId+')',value:m.quantity,unit:m.unit}));
    const flows = flowRows(ids), ship = allShipments(ids), req = tradeRequests(ids);
    const flowStatuses = countsByStatus(flows).map(r=>({label:r.label,value:r.count,unit:'records'}));
    const shipmentStatuses = countsByStatus(ship).map(r=>({label:r.label,value:r.count,unit:'records'}));
    const requestStatuses = countsByStatus(req).map(r=>({label:r.label,value:r.count,unit:'requests'}));
    return '<div class="omega-liveops-toolbar"><label>Production commodity <select id="omega-liveops-resource-filter"><option value="">All available site records</option>'+
      [...new Set(mineRows.map(m=>m.resourceId).filter(Boolean))].sort().map(v=>'<option value="'+h(v)+'"'+(currentResource===v?' selected':'')+'>'+h(v)+'</option>').join('')+
      '</select></label></div>'+
      barChart('Recorded site output by mine (same selected commodity)',production.slice(0,50),'site')+
      barChart('Actual site-flow status records',flowStatuses)+
      barChart('Actual shipment status records',shipmentStatuses)+
      barChart('Actual trade-request status records',requestStatuses)+
      (countryScope && countryScope !== 'WORLD' ? chartHistory(countryScope, 'economy') : '<div class="omega-liveops-section"><h3>Actual turn-by-turn history</h3><p class="omega-liveops-empty">Select one country to plot its timeline. A world total is not synthesized from different currencies, resource units or country-specific metrics.</p></div>');
  }
  function renderFlow(ids) {
    const flows = flowRows(ids), factoryRows = [];
    ids.forEach(cid => {
      const runtime = obj(bucket('economy',cid).industrialRuntime);
      arr(runtime.factoryInputEvents).forEach(x => factoryRows.push({countryId:cid,row:x}));
    });
    return '<div class="omega-liveops-section"><h3>Per-site extraction / transport / factory flow</h3>'+table(['Country','Site','Resource','Batch','Shipment','Factory','Recorded status','Turn','Block reason'],flows.map(f=>tr([f.countryId,f.siteId,f.resourceId,f.batchId,f.shipmentId,f.factoryId,f.status,f.turn===null?'Not recorded':f.turn,f.reason])), 'No site execution or site-flow ledger rows are stored for this scope.')+'</div>'+
      '<div class="omega-liveops-section"><h3>Factory input receipts</h3>'+table(['Country','Turn','Event','Source site','Batch','Resource','Quantity','Unit','Dispatch status'],factoryRows.slice(-200).reverse().map(x=>tr([x.countryId,turnOf(x.row)===null?'Not recorded':turnOf(x.row),x.row.eventType||'FACTORY_INPUT_EVENT',x.row.siteId||x.row.mineId||x.row.occurrenceKey,x.row.batchId,x.row.resourceId,firstNum(x.row.quantity)===null?'Not recorded':fmt(firstNum(x.row.quantity)),x.row.unit,x.row.dispatchStatus||x.row.status])), 'No factory-input receipt events exist in the country economy runtime.')+'</div>';
  }
  function render() {
    if (!panelOpen || !root) return;
    const ids = selectedIds();
    const main = root.querySelector('#omega-liveops-main');
    if (!main) return;
    const panel = root.querySelector('#omega-liveops-panel') || main;
    const previousTab = lastRenderedTab;
    const scrollTop = previousTab === currentTab ? (panel.scrollTop || 0) : 0;
    const scrollLeft = previousTab === currentTab ? (panel.scrollLeft || 0) : 0;
    const turn = currentTurn();
    const title = root.querySelector('#omega-liveops-state');
    if (title) title.textContent = 'TURN ' + (turn === null ? 'NOT REPORTED' : fmt(turn,0)) + ' · ' + (countryScope === 'WORLD' ? 'WORLD VIEW' : countryScope ? countryName(countryScope) : 'COUNTRY NOT SELECTED');
    const tabs = {
      overview: () => renderOverview(ids),
      feed: () => renderFeed(ids),
      resources: () => renderResources(ids),
      flow: () => renderFlow(ids),
      trade: () => renderTrade(ids),
      communications: () => renderCommunications(ids),
      charts: () => renderCharts(ids)
    };
    main.innerHTML = (tabs[currentTab] || tabs.overview)();
    root.querySelectorAll('[data-omega-liveops-tab]').forEach(btn => {
      const active = btn.getAttribute('data-omega-liveops-tab') === currentTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const selector = root.querySelector('#omega-liveops-country');
    if (selector && selector.value !== (countryScope || 'WORLD')) selector.value = countryScope || 'WORLD';
    const resourceSelector = root.querySelector('#omega-liveops-resource-filter');
    if (resourceSelector) resourceSelector.value = currentResource;
    const filterSelector = root.querySelector('#omega-liveops-event-filter');
    if (filterSelector) filterSelector.value = currentFilter;
    panel.scrollTop = scrollTop;
    panel.scrollLeft = scrollLeft;
    lastRenderedTab = currentTab;
  }
  function scheduleRender() {
    if (!panelOpen || renderScheduleHandle !== null) return;
    if (typeof g.setTimeout !== 'function') { render(); return; }
    renderScheduleHandle = g.setTimeout(() => {
      renderScheduleHandle = null;
      if (panelOpen) render();
    }, 300);
  }
  function injectUI() {
    if (!g.document || !g.document.body || g.document.getElementById('omega-liveops-root')) return;
    const style = g.document.createElement('style');
    style.id = 'omega-liveops-style';
    style.textContent = '#omega-liveops-root{position:fixed;inset:0;z-index:1000011;display:none;background:rgba(2,6,15,.93);color:#e2e8f0;font:13px/1.45 system-ui,sans-serif}#omega-liveops-panel{position:absolute;inset:2.5%;display:flex;flex-direction:column;background:#07111f;border:1px solid #27445f;border-radius:12px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}#omega-liveops-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #24384d;background:#0c1c2e;flex-wrap:wrap}#omega-liveops-header strong{font-size:13px;letter-spacing:.5px}#omega-liveops-header small{display:block;color:#94a3b8;font-size:10px}#omega-liveops-actions{display:flex;gap:6px;flex-wrap:wrap}#omega-liveops-root button,#omega-liveops-root select{font:inherit}#omega-liveops-root button{background:#102338;border:1px solid #2b4863;color:#dbeafe;border-radius:6px;padding:7px 9px;cursor:pointer}#omega-liveops-root button.active{border-color:#38bdf8;color:#7dd3fc;background:#102d43}#omega-liveops-tabs{display:flex;gap:5px;overflow-x:auto;padding:7px;background:#081522;border-bottom:1px solid #21374b;flex-shrink:0}#omega-liveops-tabs button{white-space:nowrap;font-size:11px}#omega-liveops-toolbar{padding:8px 12px;border-bottom:1px solid #21374b;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}#omega-liveops-toolbar label,.omega-liveops-toolbar label{display:flex;gap:7px;align-items:center;color:#a9bdcf;font-size:11px}#omega-liveops-country,#omega-liveops-root select{max-width:56vw;background:#0b192a;color:#e2e8f0;border:1px solid #37536d;border-radius:5px;padding:6px}#omega-liveops-state{color:#7dd3fc;font:10px monospace}#omega-liveops-main{padding:12px;overflow:visible;overscroll-behavior:contain;flex:0 0 auto;min-height:0;min-width:0}#omega-liveops-main h3{font-size:12px;color:#7dd3fc;margin:5px 0 10px;letter-spacing:.3px}#omega-liveops-main h3 small{color:#94a3b8;font-weight:400}#omega-liveops-main p{margin:7px 0}#omega-liveops-main .omega-liveops-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.omega-liveops-card{border:1px solid #243d53;background:#0b1a2a;border-radius:8px;padding:10px;min-width:0}.omega-liveops-card span{display:block;color:#91a9be;font-size:10px}.omega-liveops-card strong{display:block;font-size:22px;color:#e2e8f0;margin:5px 0;overflow-wrap:anywhere}.omega-liveops-card small{display:block;color:#6f879c;font-size:10px}.omega-liveops-section{margin-top:12px;border:1px solid #20364b;border-radius:8px;padding:10px;background:#091725}.omega-liveops-table-wrap{width:100%;overflow:auto;max-height:48vh}.omega-liveops-table{width:100%;border-collapse:collapse;font-size:11px;min-width:680px}.omega-liveops-table th{position:sticky;top:0;background:#102237;color:#91dfff;text-align:left;font-weight:600}.omega-liveops-table th,.omega-liveops-table td{padding:7px 8px;border-bottom:1px solid #203449;vertical-align:top;white-space:normal;overflow-wrap:anywhere}.omega-liveops-table td{color:#cbd5e1}.omega-liveops-empty{padding:14px;border:1px dashed #34495d;border-radius:7px;color:#9bb0c3;background:#0a1724}.omega-liveops-source{font-size:10px;color:#849ab0;border-left:2px solid #37536d;padding-left:8px}.omega-liveops-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;color:#8199af;font-size:10px}.omega-liveops-bars{display:flex;flex-direction:column;gap:9px}.omega-liveops-barrow{min-width:0}.omega-liveops-barlab{display:flex;justify-content:space-between;gap:10px;font-size:11px;margin-bottom:4px}.omega-liveops-barlab span{overflow-wrap:anywhere}.omega-liveops-barlab b{white-space:nowrap;color:#cbd5e1}.omega-liveops-track{height:7px;background:#142539;border-radius:5px;overflow:hidden}.omega-liveops-track i{height:100%;display:block;background:#38bdf8;border-radius:5px}.omega-liveops-linechart{display:block;width:100%;max-height:180px}.omega-liveops-error{color:#fca5a5}@media(max-width:700px){#omega-liveops-panel{inset:0;border-radius:0}#omega-liveops-main .omega-liveops-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.omega-liveops-card strong{font-size:19px}#omega-liveops-header{padding:8px}#omega-liveops-main{padding:8px}}';
    g.document.head.appendChild(style);
    root = g.document.createElement('div');
    root.id = 'omega-liveops-root';
    root.innerHTML = '<section id="omega-liveops-panel" role="dialog" aria-modal="true" aria-label="Live operations and engine observability">'+
      '<header id="omega-liveops-header"><div><strong>OMEGA · LIVE OPERATIONS</strong><small id="omega-liveops-state">Reading game state…</small></div><div id="omega-liveops-actions"><label><select id="omega-liveops-country" aria-label="Country scope"></select></label><button type="button" data-omega-liveops-action="refresh">Refresh</button><button type="button" data-omega-liveops-action="export">Export data</button><button type="button" data-omega-liveops-action="close" aria-label="Close live operations">Close</button></div></header>'+
      '<nav id="omega-liveops-tabs" role="tablist" aria-label="Operations views">'+
      [['overview','Overview'],['feed','Event feed'],['resources','Mines & stock'],['flow','Pipeline'],['trade','Trade & shipments'],['communications','Contacts'],['charts','Charts']].map(x=>'<button type="button" role="tab" data-omega-liveops-tab="'+x[0]+'" aria-selected="false">'+x[1]+'</button>').join('')+
      '</nav><main id="omega-liveops-main"></main></section>';
    g.document.body.appendChild(root);
    root.addEventListener('click', ev => {
      const tab = ev.target && ev.target.closest ? ev.target.closest('[data-omega-liveops-tab]') : null;
      if (tab) { currentTab = tab.getAttribute('data-omega-liveops-tab') || 'overview'; render(); return; }
      const action = ev.target && ev.target.closest ? ev.target.closest('[data-omega-liveops-action]') : null;
      if (action) {
        const act = action.getAttribute('data-omega-liveops-action');
        if (act === 'close') closePanel();
        else if (act === 'refresh') { buildCountrySelect(); sampleAll(); render(); }
        else if (act === 'export') exportData();
      }
    });
    root.addEventListener('change', ev => {
      const target = ev.target;
      if (!target) return;
      if (target.id === 'omega-liveops-country') { countryScope = target.value || 'WORLD'; currentResource = ''; render(); }
      if (target.id === 'omega-liveops-resource-filter') { currentResource = target.value || ''; render(); }
      if (target.id === 'omega-liveops-event-filter') { currentFilter = target.value || 'ALL'; render(); }
    });
    root.addEventListener('keydown', ev => { if (ev.key === 'Escape') closePanel(); });
  }
  function buildCountrySelect() {
    if (!root) return;
    const el = root.querySelector('#omega-liveops-country');
    if (!el) return;
    const countries = countryIds();
    const own = playerCountry(), selected = selectedCountry();
    if (!countryScope) countryScope = own || selected || 'WORLD';
    const options = ['<option value="WORLD">WORLD · all indexed countries</option>'].concat(countries.map(cid =>
      '<option value="'+h(cid)+'">'+h(countryName(cid))+' ['+h(cid)+']</option>'));
    el.innerHTML = options.join('');
    el.value = countryScope;
    if (el.value !== countryScope) { countryScope = 'WORLD'; el.value = 'WORLD'; }
  }
  function openPanel() {
    if (!root) return;
    panelOpen = true;
    root.style.display = 'block';
    sampleAll();
    render();
    lastPolledTurn = currentTurn();
    if (refreshHandle !== null) g.clearInterval(refreshHandle);
    // Keep the low-cost HUD current; rebuild the expensive view only after a new turn/event
    // or an explicit user refresh. This avoids repeated full-ledger scans on a short timer.
    refreshHandle = g.setInterval(() => {
      if (!panelOpen) return;
      sampleAll();
      const turn = currentTurn();
      if (turn !== lastPolledTurn) {
        lastPolledTurn = turn;
        scheduleRender();
      }
    }, 15000);
  }
  function closePanel() {
    panelOpen = false;
    if (root) root.style.display = 'none';
    if (refreshHandle !== null) g.clearInterval(refreshHandle);
    refreshHandle = null;
    if (renderScheduleHandle !== null && typeof g.clearTimeout === 'function') g.clearTimeout(renderScheduleHandle);
    renderScheduleHandle = null;
  }
  function exportData() {
    if (!g.Blob || !g.URL || !g.URL.createObjectURL || !g.document) return;
    const data = {
      schemaVersion:'OMEGA_LIVEOPS_EXPORT_V1', exportedAt:new Date().toISOString(),
      dataSourceContract:'OMEGA_SHARED_AUTHORITATIVE_STATE_V1',
      authoritativeSources:{gameStateRoot:g.Game && g.Game.state ? 'Game.state' : (g.gameState ? 'gameState compatibility root' : 'NOT_AVAILABLE'),
        canonicalResourceSiteRegistryAvailable:resourceSiteRecords().length>0,
        canonicalResourceSiteCount:resourceSiteRecords().length},
      turn:currentTurn(), scope:countryScope || 'WORLD', summary:observedStateSummary(selectedIds()),
      events:eventRows(selectedIds()), mines:minesFor(selectedIds()), siteRouteProfiles:siteRouteProfiles(selectedIds()),
      shipments:allShipments(selectedIds()), tradeRequests:tradeRequests(selectedIds()), flows:flowRows(selectedIds()),
      communications:communications(selectedIds()),
      trends:obj(store.history)
    };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = g.URL.createObjectURL(blob), a = g.document.createElement('a');
    a.href = url; a.download = 'OMEGA_LIVEOPS_T'+(currentTurn()===null?'unknown':currentTurn())+'.json';
    g.document.body.appendChild(a); a.click(); a.remove(); g.URL.revokeObjectURL(url);
  }
  function diagnostics() {
    const ids = countryIds(), summary = observedStateSummary(selectedIds());
    return {version:'1.2.0',readOnly:true,scope:countryScope || 'WORLD',countryCount:ids.length,
      registeredResourceSites:summary.registeredResourceSites,runtimeMineRecords:summary.runtimeMineRecords,
      retainedLiveEvents:store.events.length,countriesWithTurnHistory:Object.keys(store.history).length,
      historyTurns:Object.keys(store.history).reduce((n,c)=>n+arr(store.history[c]).length,0),
      authoritativeStateRoot:g.Game && g.Game.state ? 'Game.state' : (g.gameState ? 'gameState compatibility root' : 'NOT_AVAILABLE'),
      canonicalSiteRegistryAvailable:resourceSiteRecords().length>0,
      dataSource:'Game.state + existing canonical resource-site registry + existing engine ledgers',
      polling:panelOpen?'active while the panel is open':'inactive while the panel is closed'};
  }
  const api = {
    VERSION:'1.2.0', open:openPanel, close:closePanel, diagnostics, resolveCountryId, getCountryMetrics:countryId => metricsFor(resolveCountryId(countryId) || id(countryId)), getCountryOperationalSummary:countryId => observedStateSummary([resolveCountryId(countryId) || id(countryId)]), getTrendSeries, snapshot:()=>({
      turn:currentTurn(),scope:countryScope || 'WORLD',summary:observedStateSummary(selectedIds()),
      events:eventRows(selectedIds()),mines:minesFor(selectedIds()),siteRouteProfiles:siteRouteProfiles(selectedIds()),
      shipments:allShipments(selectedIds()),tradeRequests:tradeRequests(selectedIds()),flows:flowRows(selectedIds()),communications:communications(selectedIds())
    })
  };
  g.OmegaLiveOpsObservability = Object.freeze(api);
  HOT_EVENTS.forEach(type => {
    try { g.addEventListener(type, e => {
      if (type === 'OMEGA_SIMULATION_TURN_COMMITTED') {
        const detail = obj(e && e.detail);
        const reportedTurn = firstNum(detail.turn, detail.simulationTurn, currentTurn());
        if (reportedTurn !== null) {
          sampleAll(true, reportedTurn);
          pushEvent(type,{...detail,simulationTurn:reportedTurn},'SIMULATION_EVENT');
        } else pushEvent(type,detail,'SIMULATION_EVENT');
      } else pushEvent(type,e && e.detail,'ENGINE_EVENT');
    }); } catch (_) {}
  });
  function init() {
    injectUI();
    if (playerCountry() || selectedCountry()) {
      if (!countryScope) countryScope = playerCountry() || selectedCountry();
    }
    sampleAll();
    buildCountrySelect();
  }
  if (g.document) {
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded',init,{once:true});
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
