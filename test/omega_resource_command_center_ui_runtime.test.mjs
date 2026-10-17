import test from 'node:test';
import assert from 'node:assert/strict';

const elements = new Map();
function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(), id: '', style: {}, innerHTML: '', listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    querySelectorAll() { return []; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name] ?? null; },
    hasAttribute(name) { return this[name] !== undefined; },
    closest() { return null; }
  };
}

globalThis.window = globalThis;
globalThis.document = {
  getElementById(id) { return elements.get(id) || null; },
  createElement(tag) { return makeElement(tag); },
  body: { appendChild(node) { elements.set(node.id, node); } }
};
globalThis.CustomEvent = class {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail || {}; }
};
globalThis.Game = {
  state: {
    playerCountryId: 'BGD',
    simulation: { turn: 1 },
    resource: {
      BGD: {
        inventory: { iron_ore: 100, crude_oil: 50 },
        production: { iron_ore: 10, crude_oil: 5 },
        consumption: { iron_ore: 3, crude_oil: 2 },
        reserves: { iron_ore: 900, crude_oil: 500 },
        endowment: { iron_ore: 1000 },
        tradeAvailability: { iron_ore: 90, crude_oil: 40 },
        warehouse: { warehouseId: 'WH-BGD-RAW', availableByResource: { iron_ore: 80 } },
        strategicReserve: { warehouseId: 'SPR-BGD', availableByResource: { iron_ore: 10 } },
        batches: [{ batchId: 'B1', resourceId: 'iron_ore', remainingQuantity: 80, unit: 'METRIC_TONNE', warehouseId: 'WH-BGD-RAW' }],
        industrialNetwork: {
          siteFlowLedger: [{ siteId: 'SITE-BGD-IRON', status: 'IN_TRANSIT', resourceId: 'iron_ore' }],
          projects: [{ projectId: 'FACTORY-P1', status: 'UNDER_CONSTRUCTION' }],
          technologyContracts: [{ projectId: 'TECH-P1', status: 'IN_PROGRESS' }],
          shipments: []
        },
        mineSiteReferences: [{ siteId: 'SITE-BGD-IRON', countryId: 'BGD', resourceId: 'iron_ore', name: 'Test Mine' }],
        surveyRequests: [], surveyResults: [], reserveBufferRequests: [],
        mineProductionLedger: [], logistics: { shipments: [] }, environment: { waterRecycling: { status: 'RESEARCH' } }, byproducts: []
      }
    },
    economy: {
      BGD: {
        productionAssets: [{
          id: 'FAC-BGD-IRON', resourceId: 'iron_ore', inputCoefficients: { iron_ore: 1 },
          outputProfile: { steel: 0.8 }, inputInventory: { iron_ore: 20 }, capacity: 50, status: 'OPERATIONAL'
        }],
        capacityUpgradeRequests: []
      }
    },
    finance: { BGD: { available: 100000, reserves: 50000, currencyCode: 'BDT', treasuryLedger: [] } },
    trade: { BGD: { importRequests: [], globalTradeLedger: { requests: [], decisions: [], settlements: [] } } },
    foreign: { BGD: { relations: { SAU: { trade_agreement: true } }, treaties: {} } },
    population: { BGD: {} }
  }
};
globalThis.CountryIOS = { activeCountry: 'BGD' };
globalThis.OmegaCanonicalIdentityRegistry = {
  resolveCountry(value) {
    const raw = String(value || '').trim().toUpperCase();
    return { id: raw === 'BANGLADESH' ? 'BGD' : raw };
  },
  list() { return [{ id: 'BGD' }, { id: 'SAU' }]; }
};
globalThis.ResourceMinistryEngine = {
  activeCountry: 'BGD',
  normalizeCountryCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    return raw === 'BANGLADESH' ? 'BGD' : raw;
  },
  resourceTypes: [
    { id: 'iron_ore', name: 'Iron Ore', unit: 'METRIC_TONNE', basePrice: 100, category: 'MINERAL', processChain: ['extraction', 'smelting'] },
    { id: 'crude_oil', name: 'Crude Oil', unit: 'BARREL', basePrice: 80, category: 'ENERGY' }
  ],
  deposits: [
    { name: 'Test Deposit', country: 'Bangladesh', countryCode: 'BGD', lat: 23.7, lng: 90.4, resourceId: 'iron_ore', reserves: 100, grade: 0.5, status: 'AVAILABLE' },
    { name: 'Other Country Deposit', country: 'Saudi Arabia', countryCode: 'SAU', lat: 24, lng: 45, resourceId: 'crude_oil', reserves: 250, status: 'AVAILABLE' }
  ],
  getAuthoritativeResourceSummary() {
    return {
      version: 'TEST_RUNTIME', briefing: 'Live test fixture', globalMetrics: { autonomyIndex: 50, strategicReservesTotalDays: 10 },
      resourcesList: [
        { id: 'iron_ore', name: 'Iron Ore', unit: 'METRIC_TONNE', inventory: 100, dailyProduction: 10, dailyConsumption: 2, netBalance: 8, reserve: 900, stockDays: 50, tradeAvailability: 90 },
        { id: 'crude_oil', name: 'Crude Oil', unit: 'BARREL', inventory: 50, dailyProduction: 5, dailyConsumption: 3, reserve: 500, stockDays: 20 }
      ]
    };
  },
  getCountryResourceProfile() { return { identity: { name: 'Bangladesh' } }; }
};
const sourceCards = Array.from({ length: 16 }, (_, index) => {
  const point = String(index + 1).padStart(2, '0');
  return '<div class="dept-card" style="border-color:#aaa"><span>' + point +
    '. Test Point</span><button onclick="window.ResourceMinistryEngine.openModal(\'BANGLADESH\', \'matrix\');">Open</button></div>';
}).join('');
globalThis.OmegaCabinetUI = { activeCountry: 'BGD', getResource16CardsHtml() { return sourceCards; } };
globalThis.Omega = {
  IndividualResourceSiteBinding: { sites: [
    { siteId: 'FILE-SITE-BGD-IRON', countryId: 'BGD', siteName: 'File-backed Bangladesh iron mine',
      real: { resourceId: 'iron_ore' }, operation: { status: 'ACTIVE_SITE_REFERENCE' }, extractionExecutable: false,
      quantitative: { reserve: { quantity: 700, unit: 'METRIC_TONNE' }, production: { rate: 5, unit: 'METRIC_TONNE_PER_DAY' } },
      simulation: { transportRoute: [{ routeId: 'ROUTE-BGD-IRON-1', routeName: 'Rail to smelter', mode: 'rail', from: 'FILE-SITE-BGD-IRON', to: 'FAC-BGD-IRON', distanceKm: 42 }] },
      processing: { upstreamProcess: 'Beneficiation', refinedOutputs: ['iron_concentrate'] },
      coordinates: { lat: 24, lng: 90 }, location: { countryName: 'Bangladesh' } }
  ] },
  MinistryInteroperability: {
    dispatchCommand() { return { status: 'APPLIED', result: { accepted: true } }; },
    registerCommandHandler() {}, registerAction() {}, configure() {}, emitEvent() { return { status: 'APPLIED' }; }
  }
};
globalThis.Omega.ResourceIndustrialNetwork = {
  diagnostics() { return { version: 'TEST_RUNTIME', projectCount: 1 }; },
  gameplayPipelineDiagnostics() {
    return { perCountry: [{ countryId: 'BGD', extractionFlows: 1, dispatched: 1, processed: 1, stages: { EXTRACTION: 1 } }] };
  },
  candidateFactories(country, resourceId) {
    return resourceId === 'iron_ore' ? [{ asset: Game.state.economy.BGD.productionAssets[0] }] : [];
  },
  executeSitePipeline() { return Promise.resolve({ status: 'BLOCKED', reason: 'TEST_FIXTURE' }); },
  executeFactoryCycle() { return { status: 'BLOCKED', reason: 'TEST_FIXTURE' }; },
  startFactoryProject() { return { status: 'STARTED', projectId: 'FACTORY-P2' }; },
  startTechnologyProject() { return { status: 'IN_PROGRESS', projectId: 'TECH-P2' }; }
};
globalThis.Omega.ResourceEndowmentRuntime = {
  countryMineSiteReferences() { return []; }, countryMines() { return []; }, diagnostics() { return {}; }
};
globalThis.Omega.ResourceLogisticsRuntime = { planFromFactoryInput() { return { status: 'APPLIED', result: { accepted: true } }; } };
globalThis.Omega.ResourceSystemHardening = {
  logisticsConstraints() { return { totalMultiplier: 1 }; }, diagnostics() { return {}; }
};
globalThis.OmegaGlobalMarket = {
  rebuild() { return { iron_ore: { orders: { bids: [], asks: [] } } }; },
  quote(resourceId) { return { resourceId, status: 'NO_CROSS', priceDiscovery: 'REFERENCE_ONLY', referencePrice: 100, referenceLiquidity: true, matches: [], matchedQuantity: 0 }; },
  diagnostics() { return { resourceMarkets: 2 }; },
  listings() { return [{ countryId: 'SAU', resourceId: 'crude_oil', quantity: 500, unit: 'BARREL', unitPrice: 75, currencyCode: 'SAR', priceUsd: null, status: 'AWAITING_FX', source: 'OMEGA_RESOURCE_ECON_AUTO_OFFER', priceAuthority: 'CATALOG_REFERENCE_PRICE', simulationTurn: 2, sourceBatchIds: ['BATCH-SAU-OIL'], sourceSiteIds: ['SAU-OIL-1'] }]; }
};
globalThis.OmegaGlobalTrade = { diagnostics() { return {}; }, createRequest() { return { accepted: true, status: 'SENT' }; } };
globalThis.OmegaResourceAuthoritativeAdapter = { install() { return true; } };
globalThis.OmegaCognitiveOS = {};

await import('../omega_resource_command_center_ui_v1.js');
const ui = globalThis.OmegaResourceCommandCenterUI;

test('all seventeen panels render without runtime exceptions', () => {
  const panels = ['matrix','ontology','reserves','deposits','extraction','processing','inventory','logistics','industrial','market','trade','value','cascade','cognitive','power','environment','offers'];
  for (const panel of panels) {
    ui.open('BGD', panel);
    assert.equal(ui.getState().panel, panel);
    const modal = elements.get('gsrsk-intelligence-modal');
    assert.ok(modal && modal.innerHTML.includes('Resource Command Center'), panel + ' should render the command center shell');
    assert.ok(modal.innerHTML.includes('value="' + panel + '" selected'), panel + ' should be the sole selected section in the compact navigator');
    assert.equal((modal.innerHTML.match(/<button[^>]*data-panel=/g) || []).length, 0, 'the panel must not duplicate all sixteen points as visible buttons');
  }
});

test('live country offers display seller, quantity, asking price and FX status from runtime data', () => {
  ui.open('BGD', 'offers');
  const modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Live country offers/);
  assert.match(modal.innerHTML, /SAU/);
  assert.match(modal.innerHTML, /crude_oil/);
  assert.match(modal.innerHTML, /500/);
  assert.match(modal.innerHTML, /75/);
  assert.match(modal.innerHTML, /WAITING FOR FX/);
  assert.match(modal.innerHTML, /Batch \/ site lineage/);
});

test('the commodity market has a visible route to the country offers tab', () => {
  ui.open('BGD', 'market');
  const modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Open live country offers/);
  assert.match(modal.innerHTML, /data-action="open-offers"/);
});

test('all sixteen legacy card buttons route to their own panel, including filtered cards', () => {
  const expected = ['matrix','ontology','reserves','deposits','extraction','processing','inventory','logistics','industrial','market','trade','value','cascade','cognitive','power','environment'];
  const result = globalThis.OmegaCabinetUI.getResource16CardsHtml();
  assert.equal(typeof result, 'string');
  const blocks = result.split('<div class="dept-card" style=').slice(1);
  assert.equal(blocks.length, 16);
  blocks.forEach((block, index) => {
    const onclick = (block.match(/onclick="([^"]+)"/) || [])[1];
    assert.ok(onclick, 'point ' + (index + 1) + ' must have an action');
    assert.ok(onclick.includes(", '" + expected[index] + "');"), 'point ' + (index + 1) + ' must route to ' + expected[index] + ', got ' + onclick);
    assert.ok(onclick.includes("openModal('BGD'"), 'point ' + (index + 1) + ' must use the selected country scope');
  });
});


test('canonical site profiles appear in relevant tabs without becoming live production or shipments', () => {
  ui.open('BGD', 'extraction');
  let modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /File-backed Bangladesh iron mine/);
  assert.match(modal.innerHTML, /Country site profiles/);
  assert.match(modal.innerHTML, /FILE-SITE-BGD-IRON/);
  assert.match(modal.innerHTML, /Runtime mine records/);

  ui.open('BGD', 'reserves');
  modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Site reserve facts from existing data files/);
  assert.match(modal.innerHTML, /700/);
  assert.match(modal.innerHTML, /Runtime reserve balance/);

  ui.open('BGD', 'logistics');
  modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Saved route profiles from existing data files/);
  assert.match(modal.innerHTML, /ROUTE-BGD-IRON-1/);
  assert.match(modal.innerHTML, /PROFILE ONLY/);
  assert.match(modal.innerHTML, /Actual shipment state/);

  ui.open('BGD', 'processing');
  modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Processing capabilities from existing site files/);
  assert.match(modal.innerHTML, /Beneficiation/);
});

test('deposit view filters loaded JSON deposits to the selected country', () => {
  ui.open('BGD', 'deposits');
  const modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Test Deposit/);
  assert.doesNotMatch(modal.innerHTML, /Other Country Deposit/);
  assert.match(modal.innerHTML, /Country-scoped JSON deposit registry/);
});

test('resource state readers merge name-keyed country data into canonical country views', () => {
  Game.state.resource.BANGLADESH = {
    batches: [{ batchId: 'B-ALIAS-1', resourceId: 'iron_ore', remainingQuantity: 17, unit: 'METRIC_TONNE' }],
    mineSiteReferences: [{ siteId: 'SITE-ALIAS-1', countryId: 'BANGLADESH', resourceId: 'iron_ore', siteName: 'Alias-keyed mine' }]
  };
  ui.open('BGD', 'inventory');
  let modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /B-ALIAS-1/);
  assert.match(modal.innerHTML, /17/);
  ui.open('BGD', 'extraction');
  modal = elements.get('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML, /Alias-keyed mine/);
});
