import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('live operations panel is loaded after its data-owning engines', () => {
  const html = read('index.html');
  const economy = html.indexOf('src="omega_resource_economy_runtime_v2.js"');
  const network = html.indexOf('src="omega_resource_industrial_network_v1.js"');
  const trade = html.indexOf('src="omega_global_trade_system.js"');
  const view = html.indexOf('src="omega_live_operations_observability_v1.js"');
  assert.ok(economy >= 0 && network > economy && trade > network && view > trade,
    'observability UI must load after resource, industrial-network and trade engines');
  for (const id of ['res-cash','res-power','res-manpower','res-energy','res-oil']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /\$100M|850 PP|12\.4 GW|500K BBL|\+5K\/s|\+150\/s|60 FPS/,
    'HUD must not ship fabricated starting balances, growth rates or FPS');
});

test('ministry trend chart uses observed turn history rather than generated historical values', () => {
  const source = read('ministry_engine.js');
  const start = source.indexOf("renderRechartsChart(containerId, activeCountry, ministryId = 'economy')");
  assert.ok(start >= 0, 'ministry trend renderer exists');
  const end = source.indexOf('\n    },', start);
  assert.ok(end > start, 'ministry trend renderer boundary exists');
  const method = source.slice(start, end);
  assert.match(method, /OmegaLiveOpsObservability/);
  assert.match(method, /getTrendSeries/);
  assert.match(method, /NO RECORDED MULTI-TURN HISTORY/);
  assert.doesNotMatch(method, /2020|2021|2022|2023|2024|2025|2026/,
    'chart renderer cannot synthesize a historical timeline');
  assert.doesNotMatch(method, /pFactor|sFactor|tFactor|rawGdp\s*\|\|/);
});

test('country intelligence charts use recorded economy and demographic fields', () => {
  const source = read('country-ios.js');
  const economyStart = source.indexOf('renderChapter4_Economy(countryKey, econ, pop) {');
  const economyEnd = source.indexOf('renderChapter5_Resources(countryKey)', economyStart);
  assert.ok(economyStart >= 0 && economyEnd > economyStart, 'economy chart renderer exists');
  const economy = source.slice(economyStart, economyEnd);
  assert.match(economy, /OmegaLiveOpsObservability/);
  assert.match(economy, /getTrendSeries/);
  assert.match(economy, /sectoralBreakdown/);
  assert.match(economy, /No multi-turn GDP history is recorded/);
  assert.match(economy, /No example percentages are substituted/);
  assert.doesNotMatch(economy, /68\.4%|23\.2%|8\.4%|2022|2023|2024|2025|2026 PROJ/,
    'economy charts cannot embed sample shares or a fabricated year sequence');

  const societyStart = source.indexOf('renderChapter10_Society(countryKey, pop) {');
  const societyEnd = source.indexOf('renderChapter11_Operations(countryKey)', societyStart);
  assert.ok(societyStart >= 0 && societyEnd > societyStart, 'society chart renderer exists');
  const society = source.slice(societyStart, societyEnd);
  assert.match(society, /ageGroups|ageDistribution/);
  assert.match(society, /No age-group population records are available/);
  assert.doesNotMatch(society, /0-18 Yrs \(18%\)|19-64 Yrs \(62%\)|65\+ Yrs \(20%\)/,
    'demographic chart cannot show hardcoded population distributions');
});

test('runtime projection reads real ledgers and records turn-based observations without writing to gameplay state', () => {
  const source = read('omega_live_operations_observability_v1.js');
  const listeners = new Map();
  const gameState = {
    simulation: { turn: 1, date: '2026-10-15' },
    playerCountryId: 'BGD',
    resource: {
      BGD: {
        mines: [{ siteId:'MINE-A', occurrenceKey:'MINE-A', depositName:'Test coal mine', resourceId:'coal', operationalStatus:'ACTIVE' }],
        mineOutputs: { 'MINE-A': { producedQuantity:10, resourceId:'coal', unit:'tonnes', status:'ACTIVE', turn:1, batchId:'B-1' } },
        mineProductionLedger: [{ turn:1, mineId:'MINE-A', mineName:'Test coal mine', resourceId:'coal', quantity:10, unit:'tonnes', batchId:'B-1' }],
        inventory: { coal:100 },
        industrialNetwork: {
          shipments: [{ shipmentId:'S-1', sourceCountryId:'BGD', destinationCountryId:'IND', resourceId:'coal', quantity:10, unit:'tonnes', status:'IN_TRANSIT', turn:1, batchId:'B-1' }],
          siteExecutions: [{ siteId:'MINE-A', resourceId:'coal', batchId:'B-1', shipmentId:'S-1', factoryId:'F-1', status:'IN_TRANSIT', turn:1 }],
          events: []
        }
      }
    },
    economy: { BGD: { gdp:1000, industrialRuntime:{ factoryInputEvents:[] } } },
    finance: { BGD: { available:500, currencyCode:'USD' } },
    trade: { BGD: { importRequests:[{ requestId:'R-1', buyerCountryId:'BGD', sellerCountryId:'IND', resourceId:'coal', quantity:20, unit:'tonnes', status:'SENT', turn:1 }] } }
  };
  const sandbox = {
    console, Date, Math, JSON, Object, Array, String, Number, RegExp, Map, Set, WeakMap,
    Game: { state: gameState },
    addEventListener(type, listener) {
      const set = listeners.get(type) || [];
      set.push(listener); listeners.set(type,set);
    },
    clearInterval() {},
    setInterval() { return 1; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename:'omega_live_operations_observability_v1.js' });

  const commit = (turn) => {
    const before = JSON.stringify(gameState);
    (listeners.get('OMEGA_SIMULATION_TURN_COMMITTED') || [])
      .forEach(fn => fn({ type:'OMEGA_SIMULATION_TURN_COMMITTED', detail:{ turn, simulationTurn:turn, countryId:'BGD' } }));
    assert.equal(JSON.stringify(gameState), before,
      'observability must not mutate Game.state to display or sample data');
  };
  commit(1);

  gameState.simulation.turn = 2;
  gameState.finance.BGD.available = 450;
  gameState.economy.BGD.gdp = 1100;
  gameState.resource.BGD.mineOutputs['MINE-A'] = { producedQuantity:12, resourceId:'coal', unit:'tonnes', status:'ACTIVE', turn:2, batchId:'B-2' };
  gameState.resource.BGD.mineProductionLedger.push({ turn:2, mineId:'MINE-A', mineName:'Test coal mine', resourceId:'coal', quantity:12, unit:'tonnes', batchId:'B-2' });
  commit(2);

  const api = sandbox.OmegaLiveOpsObservability;
  assert.equal(api.VERSION, '1.1.0');
  const data = api.snapshot();
  assert.equal(data.mines.length, 1);
  assert.equal(data.mines[0].siteId, 'MINE-A');
  assert.equal(data.shipments.length, 1);
  assert.equal(data.shipments[0].source, 'BGD');
  assert.equal(data.shipments[0].dest, 'IND');
  assert.equal(data.tradeRequests.length, 1);
  assert.equal(data.tradeRequests[0].status, 'SENT');

  const resourceSeries = api.getTrendSeries('BGD','resource');
  const coal = resourceSeries.find(series => series.key === 'production:coal|tonnes');
  assert.ok(coal, 'resource trend is bound to recorded mine-production rows');
  assert.deepEqual(JSON.parse(JSON.stringify(coal.points)), [{turn:1,value:10},{turn:2,value:12}]);

  const economySeries = api.getTrendSeries('BGD','economy');
  const gdp = economySeries.find(series => series.key === 'gdp');
  const treasury = economySeries.find(series => series.key === 'treasury');
  assert.deepEqual(JSON.parse(JSON.stringify(gdp.points)), [{turn:1,value:1000},{turn:2,value:1100}]);
  assert.deepEqual(JSON.parse(JSON.stringify(treasury.points)), [{turn:1,value:500},{turn:2,value:450}]);
  assert.equal(api.diagnostics().readOnly, true);
});

test('no trend is emitted for a single observed turn or missing numeric data', () => {
  const source = read('omega_live_operations_observability_v1.js');
  const listeners = new Map();
  const gameState = { simulation:{turn:3}, playerCountryId:'BGD', economy:{BGD:{}}, resource:{BGD:{mineProductionLedger:[]}} };
  const sandbox = {
    console, Date, Math, JSON, Object, Array, String, Number, RegExp, Map, Set, WeakMap,
    Game:{state:gameState},
    addEventListener(type,fn) { const set=listeners.get(type)||[];set.push(fn);listeners.set(type,set); },
    setInterval(){return 1;}, clearInterval(){}
  };
  sandbox.window=sandbox; sandbox.globalThis=sandbox;
  vm.runInNewContext(source,sandbox,{filename:'omega_live_operations_observability_v1.js'});
  (listeners.get('OMEGA_SIMULATION_TURN_COMMITTED')||[]).forEach(fn=>fn({detail:{turn:3}}));
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.OmegaLiveOpsObservability.getTrendSeries('BGD','economy'))), []);
});


test('country resource and diplomacy panels never substitute example facilities, rates or relationship nodes', () => {
  const source = read('country-ios.js');
  const forbidden = [
    'Bibiyana Mega Field (940 MMSCFD)',
    'Bay of Bengal Methane Hydrates (17-25 TCF)',
    'Rooppur VVER-1200 Nuclear Power Plant (2.4 GW)',
    'Matarbari Deep Sea Port',
    'Eastern Refinery Ltd (ERL-2)',
    '593 WORLD DEPOSITS',
    'PARTS 01–13 ACTIVE',
    '28 Nations',
    '94.2 Score',
    '175 Global Embassies',
    'EXPAND (+25%)',
    'SPR (+50K)',
    '0-18 Yrs (18%)',
    '19-64 Yrs (62%)',
    '65+ Yrs (20%)'
  ];
  for (const value of forbidden) assert.equal(source.includes(value), false, 'removed fabricated UI value: ' + value);
  assert.match(source, /DRAWDOWN UNAVAILABLE/);
  assert.match(source, /REQUEST CAPACITY/);
  assert.match(source, /REQUEST SPR BUFFER/);
  assert.match(source, /No bilateral relationship records are available/);
});
test('resource authoritative adapter preserves unknown numeric values and only reports observed request progress', () => {
  const source = read('omega_resource_authoritative_adapter.js');
  assert.match(source, /if \(value === null \|\| value === undefined \|\| value === ''\) return null/);
  assert.match(source, /out\.progress = numberOrNull\(out\.progress\);/);
  assert.doesNotMatch(source, /out\.progress = numberOrNull\(out\.progress\) === null \? 0/);
  assert.match(source, /strategicReserve=strategicReserveState\?valueByToken\(strategicReserveState\.availableByResource,rid\):null/);
  assert.match(source, /No stock was fabricated or transferred/);
  assert.match(source, /Factory capacity, treasury and project state were not changed/);
});


test('Live Operations joins canonical site profiles to shared country state by canonical country and site identity', () => {
  const source = read('omega_live_operations_observability_v1.js');
  const listeners = new Map();
  const gameState = {
    simulation: { turn: 3 },
    playerCountryId: 'BGD',
    resource: {
      BANGLADESH: {
        mines: [{ siteId: 'SITE-BGD-1', occurrenceKey: 'SITE-BGD-1', depositName: 'Bangladesh coal mine', resourceId: 'coal', operationalStatus: 'ACTIVE' }],
        mineOutputs: { 'SITE-BGD-1': { siteId: 'SITE-BGD-1', producedQuantity: 4, resourceId: 'coal', unit: 'tonnes', status: 'ACTIVE', turn: 3, batchId: 'B-3' } },
        mineProductionLedger: [{ turn: 3, siteId: 'SITE-BGD-1', mineName: 'Bangladesh coal mine', resourceId: 'coal', quantity: 4, unit: 'tonnes', batchId: 'B-3' }]
      }
    },
    economy: { BANGLADESH: { gdp: 1000 } }
  };
  const identityRegistry = {
    resolveCountry(value) {
      const key = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
      if (['BANGLADESH', 'BGD'].includes(key)) return { id: 'BGD', iso3: 'BGD', name: 'Bangladesh' };
      if (['INDIA', 'IND'].includes(key)) return { id: 'IND', iso3: 'IND', name: 'India' };
      return null;
    }
  };
  const sandbox = {
    console, Date, Math, JSON, Object, Array, String, Number, RegExp, Map, Set, WeakMap,
    Game: { state: gameState, currentActiveCountry: 'Bangladesh' },
    OmegaCanonicalIdentityRegistry: identityRegistry,
    Omega: {
      IndividualResourceSiteBinding: {
        sites: [
          { siteId: 'SITE-BGD-1', countryId: 'BGD', siteName: 'Canonical Bangladesh coal mine',
            real: { resourceId: 'coal' }, operation: { status: 'ACTIVE' },
            quantitative: { production: { rate: 5, unit: 'tonnes/day' } },
            coordinates: { lat: 24, lng: 90 }, location: { countryName: 'Bangladesh', coordinateStatus: 'VERIFIED' } },
          { siteId: 'SITE-IND-1', countryId: 'IND', siteName: 'Canonical India iron mine',
            real: { resourceId: 'iron_ore' }, operation: { status: 'ACTIVE' },
            coordinates: { lat: 20, lng: 78 }, location: { countryName: 'India' } }
        ]
      }
    },
    addEventListener(type, listener) {
      const set = listeners.get(type) || [];
      set.push(listener); listeners.set(type, set);
    },
    clearInterval() {},
    setInterval() { return 1; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'omega_live_operations_observability_v1.js' });

  const api = sandbox.OmegaLiveOpsObservability;
  const snapshot = api.snapshot();
  assert.equal(api.resolveCountryId('Bangladesh'), 'BGD');
  assert.equal(snapshot.summary.countryCount, 2);
  assert.equal(snapshot.mines.length, 2, 'canonical sites should appear before every site has runtime production');
  const bangladeshMine = snapshot.mines.find(row => row.siteId === 'SITE-BGD-1');
  assert.ok(bangladeshMine);
  assert.equal(bangladeshMine.countryId, 'BGD', 'country aliases must resolve to the canonical identity');
  assert.equal(bangladeshMine.registryRecord, true);
  assert.equal(bangladeshMine.runtimeRecorded, true, 'runtime data overlays the registry profile rather than duplicating it');
  assert.equal(bangladeshMine.quantity, 4);
  assert.equal(bangladeshMine.profileDailyRate, 5);
  assert.equal(snapshot.summary.registeredResourceSites, 2);
  assert.equal(snapshot.summary.runtimeMineRecords, 1);
  assert.equal(snapshot.summary.currentTurnMineOutputs, 1);
  assert.equal(snapshot.mines.filter(row => row.siteId === 'SITE-BGD-1').length, 1,
    'a site in the canonical registry and Game.state must merge by canonical country + site ID');
});
