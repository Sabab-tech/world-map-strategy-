import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../omega_ui_v2/screens/resource-ministry.js";
import "../omega_ui_v2/resource-ministry-legacy-bridge.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));

test("resource icon manifest is complete, local, unique and integrated with Resource Ministry", () => {
  const manifest = json("assets/omega-industrial-icons-v1/manifest.json");
  assert.equal(manifest.resources.length, 42, "preserve all 42 existing resource SVG records");
  assert.equal(manifest.factories.length, 21, "preserve the canonical 21 factory icon records");
  assert.equal(new Set(manifest.resources.map((item) => item.id)).size, manifest.resources.length);
  const api = globalThis.OmegaUIV2ResourceMinistry;
  assert.ok(api, "Resource Ministry screen must be registered");
  for (const icon of manifest.resources) {
    const expected = "assets/omega-industrial-icons-v1/" + icon.file;
    assert.ok(fs.existsSync(path.join(root, expected)), "resource icon must exist: " + expected);
    assert.match(read(expected), /<svg\b/, "resource icon must contain SVG source: " + expected);
    assert.equal(api.resourceIconPath(icon.id), expected, "canonical icon mapping must be stable for " + icon.id);
  }
  assert.equal(api.resourceIconPath("unregistered_future_type"), "", "unknown types must use the safe text fallback");
});

test("Resource Ministry loads the active player's baseline and displays its live current stock", async () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const rules = json("resource_economy_rules.json");
  const resources = Object.keys(rules.demand.resourceProfiles).map((resourceId) => {
    const profile = rules.demand.resourceProfiles[resourceId] || {};
    return {
      resourceId,
      name: resourceId.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      unit: String(profile.unit || "").replace(/_PER_DAY$/i, "") || "TONNES",
      demandUnit: profile.unit || "TONNES_PER_DAY",
      profileKnown: true
    };
  });
  const previous = {
    Game:globalThis.Game,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    startup:globalThis.OmegaResourceStartupBaseline,
    industrial:globalThis.OmegaResourceIndustrialCatalogData,
    omega:globalThis.Omega
  };
  const calls = [];
  const listeners = Object.create(null);
  const screenRoot = {
    innerHTML:"",
    classList:{add(){}},
    addEventListener(type, handler) { (listeners[type] || (listeners[type] = [])).push(handler); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  globalThis.Game = { state:{
    simulation:{turn:1,session:{sessionId:"RESOURCE-UI-BGD",playerCountryId:"BGD",status:"READY"}},
    resource:{
      BGD:{
        inventory:{},
        inventoryUnits:{},
        batches:[],
        inventoryLots:{},
        warehouse:{warehouseId:"WH-BGD-RAW",availableByResource:{},receipts:[],storedBatchIds:[]},
        processedWarehouse:{warehouseId:"WH-BGD-PROCESSED",availableByResource:{},receipts:[],storedBatchIds:[]},
        mineAssets:[],
        industrialNetwork:{projects:[],shipments:[],siteFlowLedger:[]},
        inventoryLedger:[]
      }
    }
  }};
  globalThis.Omega = {};
  globalThis.OmegaCountryInventoryRuntime = { getResourceCatalog(){ return resources; } };
  globalThis.OmegaResourceIndustrialCatalogData = { factoryProfiles:{} };
  globalThis.OmegaResourceStartupBaseline = {
    getResourceCatalog(){ return resources; },
    getFactoryInputCoverageDays(){ return 100; },
    ensurePlayerCountryBaseline(countryId) {
      calls.push(countryId);
      const bucket = globalThis.Game.state.resource.BGD;
      bucket.inventory = { coal:320, iron_ore:82 };
      bucket.inventoryUnits = { coal:"TONNES", iron_ore:"TONNES" };
      bucket.factoryInputBaselineV1 = { targetCoverageDays:100, stockRows:[] };
      return Promise.resolve({ status:"COMPLETED", scope:"PLAYER_COUNTRY_ONLY", countryId:"BGD" });
    }
  };

  try {
    const first = api.render(screenRoot, { countryId:"USA", sites:[], tab:"dashboard" });
    assert.equal(first.code, "PLAYER_COUNTRY_BASELINE_LOADING");
    assert.match(screenRoot.innerHTML, /Loading BGD inventory/);
    assert.match(screenRoot.innerHTML, /Current Stock/,
      "the Resource Ministry must keep the live inventory view visible during opening-baseline initialization");
    assert.match(screenRoot.innerHTML, /Raw Resource Inventory/,
      "baseline loading must not replace the whole ministry with a blocking loading screen");
    await screenRoot.__omegaV2ResourceLoadPromise;

    assert.deepEqual(calls, ["BGD"], "the startup baseline must only receive the selected player country");
    assert.equal(screenRoot.__omegaV2ResourceLoadedCountry, "BGD");
    assert.match(screenRoot.innerHTML, /Current Stock/);
    assert.match(screenRoot.innerHTML, /Coal/);
    assert.match(screenRoot.innerHTML, /320(?:\.00)? TONNES/);
    assert.match(screenRoot.innerHTML, /Iron Ore/);
    assert.match(screenRoot.innerHTML, /82(?:\.00)? TONNES/);
    assert.doesNotMatch(screenRoot.innerHTML, /USA|Browse resource country/);
    assert.deepEqual(Object.keys(globalThis.Game.state.resource), ["BGD"],
      "rendering the ministry must not create inventory state for another country");
  } finally {
    api.unload(screenRoot);
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime;
    else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.startup === undefined) delete globalThis.OmegaResourceStartupBaseline;
    else globalThis.OmegaResourceStartupBaseline = previous.startup;
    if (previous.industrial === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = previous.industrial;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
  }
});


test("Resource Ministry dashboard avoids per-mine rendering and scales output ledger work linearly", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const previous = {
    Game:globalThis.Game,
    omega:globalThis.Omega,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    startup:globalThis.OmegaResourceStartupBaseline,
    industrial:globalThis.OmegaResourceIndustrialCatalogData
  };
  const siteCount = 36;
  let archetypeReads = 0;
  let flowSiteIdReads = 0;
  const sites = Array.from({length:siteCount}, (_, index) => {
    const row = {
      siteId:"BGD-LAZY-MINE-" + index,
      countryId:"BGD",
      resourceId:"coal",
      siteName:"Lazy Mine " + index,
      location:{region:"Sylhet"},
      operation:{status:"ACTIVE",commercialExtraction:true},
      quantitative:{
        reserve:{quantity:100000,unit:"TONNES",status:"SIMULATED"},
        production:{quantity:12,unit:"TONNES_PER_DAY",status:"SIMULATED"}
      },
      simulation:{reserve:{quantity:100000,unit:"TONNES",status:"SIMULATED"}}
    };
    Object.defineProperty(row,"siteType",{enumerable:true,get(){archetypeReads+=1;return "OPEN_PIT";}});
    return row;
  });
  const flows = sites.map((site) => {
    const row = {
      resourceId:"coal",quantity:5,unit:"TONNES",extractionTurn:1,status:"COMPLETED"
    };
    Object.defineProperty(row,"siteId",{enumerable:true,get(){flowSiteIdReads+=1;return site.siteId;}});
    return row;
  });
  const listeners = Object.create(null);
  const screenRoot = {
    innerHTML:"",
    classList:{add(){}},
    addEventListener(type, handler){(listeners[type]||(listeners[type]=[])).push(handler);},
    querySelector(){return null;},
    querySelectorAll(){return[];},
    contains(){return true;}
  };
  globalThis.Game = {state:{
    simulation:{turn:1,session:{sessionId:"RESOURCE-LAZY-BGD",playerCountryId:"BGD",status:"READY"}},
    resource:{BGD:{
      inventory:{},inventoryUnits:{},batches:[],inventoryLots:{},
      warehouse:{warehouseId:"WH-BGD-RAW",availableByResource:{},receipts:[],storedBatchIds:[]},
      processedWarehouse:{warehouseId:"WH-BGD-PROCESSED",availableByResource:{},receipts:[],storedBatchIds:[]},
      mineAssets:[],
      industrialNetwork:{projects:[],shipments:[],siteFlowLedger:flows},
      inventoryLedger:[]
    }},
    economy:{BGD:{productionAssets:[]}}
  }};
  globalThis.Omega = {};
  globalThis.OmegaCountryInventoryRuntime = {getResourceCatalog(){return[];}};
  globalThis.OmegaResourceStartupBaseline = undefined;
  globalThis.OmegaResourceIndustrialCatalogData = {factoryProfiles:{}};
  try {
    const dashboard = api.render(screenRoot,{countryId:"BGD",sites,tab:"dashboard"});
    assert.equal(dashboard.ok,true);
    assert.equal(archetypeReads,0,
      "opening Overview must not build Mine cards or read each mine's presentation metadata");
    assert.ok(flowSiteIdReads <= siteCount * 8,
      "the dashboard should aggregate the site-flow ledger in a bounded number of linear passes");
    assert.match(screenRoot.innerHTML,/Raw Resource Inventory/);

    const mines = api.render(screenRoot,{countryId:"BGD",sites,tab:"mines"});
    assert.equal(mines.ok,true);
    assert.ok(archetypeReads > 0,
      "the full mine-card presentation must still be built when the Mines tab is opened");
    assert.match(screenRoot.innerHTML,/data-omega-v2-site-card/);
  } finally {
    api.unload(screenRoot);
    const restore = {
      Game:"Game",omega:"Omega",inventory:"OmegaCountryInventoryRuntime",
      startup:"OmegaResourceStartupBaseline",industrial:"OmegaResourceIndustrialCatalogData"
    };
    for (const [key,target] of Object.entries(restore)) {
      if (previous[key] === undefined) delete globalThis[target];
      else globalThis[target] = previous[key];
    }
  }
});

test("inventory displays the canonical 41 resources and aggregate balances when warehouse projections are missing", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const rules = json("resource_economy_rules.json");
  const resources = Object.keys(rules.demand.resourceProfiles).map((resourceId) => {
    const profile = rules.demand.resourceProfiles[resourceId] || {};
    const unit = String(profile.unit || "").replace(/_PER_DAY$/i, "");
    return {
      resourceId,
      name: resourceId.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      unit: unit || null,
      demandUnit: profile.unit || null,
      priority: profile.priority ?? null,
      profileKnown: Number.isFinite(Number(profile.basePerMillionPopulation))
    };
  });
  const priorGame = globalThis.Game;
  const priorInventoryRuntime = globalThis.OmegaCountryInventoryRuntime;
  const priorIndustrialCatalog = globalThis.OmegaResourceIndustrialCatalogData;
  const listeners = Object.create(null);
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  globalThis.Game = {
    state: {
      simulation: { turn: 12, session: { playerCountryId: "BGD", status: "RUNNING" } },
      resource: {
        BGD: {
          inventory: { coal: 125, iron_ore: 0 },
          inventoryUnits: { coal: "TONNES", iron_ore: "TONNES" },
          batches: [{
            batchId: "STARTUP-BATCH-COAL", resourceId: "coal", quantity: 125,
            remainingQuantity: 125, unit: "TONNES", stage: "RAW",
            warehouseId: "WH-BGD-RAW", status: "AVAILABLE"
          }],
          warehouse: { warehouseId: "WH-BGD-RAW", availableByResource: {}, receipts: [], storedBatchIds: [] },
          processedWarehouse: { warehouseId: "WH-BGD-PROCESSED", availableByResource: { industrial_steel: 800 }, receipts: [], storedBatchIds: [] },
          factoryInputBaselineV1: { targetCoverageDays:100, stockRows:[{ productId:"industrial_steel", resourceId:"industrial_steel", quantity:800 }] },
          mineAssets: [],
          industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] },
          inventoryLedger: []
        }
      },
      economy: {
        BGD: {
          productionAssets: [{
            id: "STARTER-FAC-BGD-TEXTILE",
            name: "Bangladesh Textile Factory",
            factoryType: "TEXTILE_MILL",
            status: "OPERATIONAL",
            inputInventory: { cotton: 321, coal: 10 },
            inputUnits: { cotton: "TONNES", coal: "TONNES" }
          }]
        }
      }
    }
  };
  globalThis.OmegaCountryInventoryRuntime = {
    getResourceCatalog() { return resources; }
  };
  globalThis.OmegaResourceIndustrialCatalogData = { resourceRules: {} };
  try {
    const result = api.render(root, { countryId: "BGD", sites: [], tab: "inventory" });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /Raw resource types/);
    assert.match(root.innerHTML, /Current Stock/);

    assert.doesNotMatch(root.innerHTML, /SIMULATION(?:_RESOURCE)?_UNIT/i,
      "internal simulation unit labels are not exposed in the inventory table or batch list");
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorInventoryRuntime === undefined) delete globalThis.OmegaCountryInventoryRuntime;
    else globalThis.OmegaCountryInventoryRuntime = priorInventoryRuntime;
    if (priorIndustrialCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = priorIndustrialCatalog;
  }
});

test("inventory cards show current stock coverage, provenance and shortage/surplus without counting mine-side stock", async () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const rules = json("resource_economy_rules.json");
  const resources = Object.keys(rules.demand.resourceProfiles).map((resourceId) => {
    const profile = rules.demand.resourceProfiles[resourceId] || {};
    return {
      resourceId,
      name: resourceId.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      unit: String(profile.unit || "").replace(/_PER_DAY$/i, "") || "TONNES",
      demandUnit: profile.unit || "TONNES_PER_DAY",
      profileKnown: true
    };
  });
  const priorGame = globalThis.Game;
  const priorInventoryRuntime = globalThis.OmegaCountryInventoryRuntime;
  const priorIndustrialCatalog = globalThis.OmegaResourceIndustrialCatalogData;
  const priorStartupBaseline = globalThis.OmegaResourceStartupBaseline;
  const calls = [];
  let savedDays = 100;
  const listeners = Object.create(null);
  const coverageInput = { value: "120" };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    querySelector(selector) {
      return selector === "[data-omega-v2-coverage-days-input]" ? coverageInput : null;
    },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  globalThis.Game = {
    state: {
      simulation: { turn: 12, session: { playerCountryId: "BGD", status: "RUNNING" } },
      resource: {
        BGD: {
          inventory: { coal: 125, iron_ore: 50 },
          inventoryUnits: { coal: "TONNES", iron_ore: "TONNES" },
          batches: [
            {
              batchId: "LOCAL-COAL-01", resourceId: "coal", quantity: 125, remainingQuantity: 125,
              unit: "TONNES", status: "AVAILABLE", warehouseId: "WH-BGD-RAW",
              sourceCountryId: "BGD", originCountryId: "BGD",
              transferType: "LOCAL_EXTRACTION", sourceSiteIds: ["SITE_BGD_COAL"]
            },
            {
              batchId: "MINE-SIDE-COAL-02", resourceId: "coal", quantity: 70, remainingQuantity: 70,
              unit: "TONNES", status: "AVAILABLE", sourceCountryId: "BGD", originCountryId: "BGD",
              transferType: "LOCAL_EXTRACTION", sourceSiteIds: ["SITE_BGD_COAL"]
            },
            {
              batchId: "IMPORT-ORE-01", resourceId: "iron_ore", quantity: 50, remainingQuantity: 50,
              unit: "TONNES", status: "AVAILABLE", warehouseId: "WH-BGD-RAW",
              sourceCountryId: "AUS", originCountryId: "AUS",
              transferType: "INTERNATIONAL_TRADE_IMPORT"
            }
          ],
          demandRuntime: {
            byResource: {
              coal: { demandPerDay: 25, status: "BALANCED", stockCoverageTargetDays: 4 },
              iron_ore: { demandPerDay: 10, status: "SHORTAGE", unmetDemand: 3, stockCoverageTargetDays: 10 }
            }
          },
          warehouse: { warehouseId: "WH-BGD-RAW", availableByResource: {}, receipts: [], storedBatchIds: [] },
          processedWarehouse: { warehouseId: "WH-BGD-PROCESSED", availableByResource: {}, receipts: [], storedBatchIds: [] },
          mineAssets: [],
          industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] },
          inventoryLedger: []
        }
      },
      trade: {
        BGD: {
          importRequests: [{
            requestId: "IMPORT-INBOUND-01", resourceId: "iron_ore", quantity: 20,
            remainingQuantity: 20, status: "IN_TRANSIT", supplierCountryId: "AUS"
          }]
        }
      }
    }
  };
  globalThis.OmegaCountryInventoryRuntime = { getResourceCatalog() { return resources; } };
  globalThis.OmegaResourceIndustrialCatalogData = { resourceRules: {} };
  globalThis.OmegaResourceStartupBaseline = {
    getFactoryInputCoverageDays() { return savedDays; },
    async setFactoryInputCoverageDays(countryId, days) {
      calls.push({ countryId, days });
      savedDays = days;
      return { status: "APPLIED", countryId, targetCoverageDays: days };
    }
  };
  try {
    const result = api.render(root, { countryId: "BGD", sites: [], tab: "inventory" });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /Current Stock/);
    assert.match(root.innerHTML, /125.*TONNES/);
    assert.match(root.innerHTML, /5 days/, "125 tonnes at 25 tonnes/day must cover five days");
    assert.match(root.innerHTML, /Surplus/, "stock above its runtime target must be shown as surplus");
    assert.match(root.innerHTML, /Shortage/, "runtime shortage status must be retained");
    assert.match(root.innerHTML, /Domestic mine/,
      "on-hand raw inventory shows domestic mine provenance");
    assert.match(root.innerHTML, /Foreign import/,
      "on-hand imported raw inventory is identified by source type");
    assert.match(root.innerHTML, /Supply source/,
      "raw-resource cards expose their supply-source section");
    assert.match(root.innerHTML, /AUS/,
      "import supplier identity is retained in the supply-source details");
    assert.doesNotMatch(root.innerHTML, /Batch ledger exceeds current stock by: 70/,
      "mine-side extraction must not be counted as current stock before warehouse receipt");
    assert.equal(globalThis.Game.state.resource.BGD.batches[0].transferType, "LOCAL_EXTRACTION",
      "domestic mine lineage remains in the authoritative batch ledger");
    assert.equal(globalThis.Game.state.resource.BGD.batches[2].sourceCountryId, "AUS",
      "import-origin data remains in the authoritative batch ledger");
    assert.match(root.innerHTML, /data-omega-v2-coverage-days-input/);
    assert.match(root.innerHTML, /max="3650"/);
    const applyButton = { disabled: false };
    const clickEvent = {
      target: {
        closest(selector) {
          return selector === "[data-omega-v2-coverage-apply]" ? applyButton : null;
        }
      }
    };
    for (const handler of listeners.click || []) handler(clickEvent);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [{ countryId: "BGD", days: 120 }],
      "the coverage control must call the authoritative startup-baseline setter");
    assert.match(root.innerHTML, /value="120"/, "the applied target is read back from runtime state");
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorInventoryRuntime === undefined) delete globalThis.OmegaCountryInventoryRuntime;
    else globalThis.OmegaCountryInventoryRuntime = priorInventoryRuntime;
    if (priorIndustrialCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = priorIndustrialCatalog;
    if (priorStartupBaseline === undefined) delete globalThis.OmegaResourceStartupBaseline;
    else globalThis.OmegaResourceStartupBaseline = priorStartupBaseline;
  }
});

test("mine archetype classifier keeps extraction-site silhouettes distinct", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  assert.equal(api.mineArchetype({ siteType: "underground mine" }), "UNDERGROUND_MINE");
  assert.equal(api.mineArchetype({ siteType: "limestone quarry" }), "QUARRY");
  assert.equal(api.mineArchetype({ siteType: "offshore platform" }), "OFFSHORE_PLATFORM");
  assert.equal(api.mineArchetype({ resourceId: "natural_gas" }), "OIL_GAS_FIELD");
  assert.equal(api.mineArchetype({ siteType: "open pit mine" }), "OPEN_PIT");
});

test("resource visual layer is wired into the offline-first app without remote dependencies", () => {
  const html = read("index.html");
  const sw = read("omega-offline-map-sw.js");
  const uiManifest = json("omega_ui_v2/manifest.json");
  const cssPath = "omega_ui_v2/resource-ministry-premium.css";
  const stylesheetTag = '<link rel="stylesheet" href="' + cssPath + '">';
  const handoffPath = "omega_ui_v2/resource-ministry-legacy-bridge.js";
  assert.ok(html.includes('<script src="' + handoffPath + '" defer></script>'), "legacy Resource Ministry entry points must be routed through the UI v2 guard");
  assert.ok(sw.includes(handoffPath), "legacy handoff guard must be precached offline");
  assert.equal(uiManifest.integrationPolicy.resourceMinistryLegacyBridge, handoffPath, "the UI manifest must document the Resource Ministry guard");
  assert.ok(html.includes(stylesheetTag), "premium resource stylesheet must be loaded by the app");
  assert.ok(sw.includes('"' + "./" + cssPath + '"'), "premium resource stylesheet must be precached offline");
  assert.ok(uiManifest.additionalStyles.includes(cssPath), "UI v2 manifest must document the resource style");
  assert.ok(Number(sw.match(/CACHE_NAME = "omega-offline-atlas-shell-v(\d+)"/)?.[1] || 0) >= 79, "offline cache must be invalidated for new visual assets");
  const coreAssets = sw.slice(sw.indexOf("const CORE_ASSETS"), sw.indexOf("];", sw.indexOf("const CORE_ASSETS")));
  assert.ok(coreAssets.includes('"./resource_economy_rules.json"'), "canonical resource identities remain in the shell precache list");
  const shellAssetPolicy = sw.slice(sw.indexOf("function isShellAsset"), sw.indexOf("function isLocalAppUrl"));
  assert.ok(shellAssetPolicy.includes(String.raw`resource_economy_rules\.json`),
    "the Service Worker must cache the canonical resource rules as an offline shell asset");
  assert.ok(coreAssets.includes('"./assets/omega-industrial-icons-v1/transport/route-mine-origin.svg"'));
  assert.ok(coreAssets.includes('"./assets/omega-industrial-icons-v1/transport/route-warehouse-destination.svg"'));
  assert.ok(coreAssets.includes('"./' + cssPath + '"'), "premium stylesheet belongs in the precache list");
  assert.match(sw,/\[\s*"factories"\s*,\s*"resources"\s*,\s*"transportVariants"\s*\]/,
    "offline install must enumerate all canonical icon manifest groups, including cargo-specific transport variants");
  assert.ok(sw.includes('new URL("./assets/omega-industrial-icons-v1/" + file, APP_BASE).href'),
    "offline install must resolve icon paths against the local application base");
  assert.equal(json("assets/omega-industrial-icons-v1/manifest.json").resources.length, 42);
  assert.doesNotMatch(cssText(), /https?:\/\//, "resource visual styling must not depend on remote assets");
});

function cssText() {
  return read("omega_ui_v2/resource-ministry-premium.css");
}

test("resource renderer uses the canonical image map and labels mine archetypes", () => {
  const source = read("omega_ui_v2/screens/resource-ministry.js");
  assert.match(source, /data-omega-v2-resource-icon/);
  assert.match(source, /loading=\"lazy\" decoding=\"async\"/);
  assert.match(source, /data-mine-archetype/);
  assert.match(source, /RESERVE_NOT_RECORDED|UNOBSERVED/);
});


test("mine command screen has the requested tabs, per-site actions and clean player-facing text", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game;
  const priorCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData;
  const row = {
    siteId: "SITE_BGD_TEST_COAL",
    countryId: "BGD",
    resourceId: "coal",
    siteName: "Test Coal Mine",
    status: "SIMULATED_OPERATIONAL_SCENARIO",
    location: { region: "Sylhet", coordinates: { lat: 24.9, lng: 91.8 } },
    operation: { commercialExtraction: true },
    quantitative: {
      reserve: { quantity: 1000000, unit: "TONNES", status: "SIMULATED" },
      production: { rate: 100, unit: "TONNES_PER_DAY", status: "SIMULATED" }
    },
    simulation: { reserve: { quantity: 1000000, unit: "TONNES", status: "SIMULATED" } }
  };
  globalThis.Game = { state: {
    simulation: { turn: 7, session: { playerCountryId: "BGD" } },
    resource: { BGD: {
      mineAssets: [{ siteId: row.siteId, resourceId: "coal", status: "OPERATIONAL", workersCommitted: 250, workersRequired: 300 }],
      industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [{
        flowId: "FLOW-TEST-1", siteId: row.siteId, countryId: "BGD", resourceId: "coal",
        batchId: "BATCH-TEST-1", quantity: 100, unit: "TONNES", status: "DELIVERED",
        extractionTurn: 7, stages: [{ stage: "EXTRACTION", status: "COMPLETED", turn: 7 }]
      }] },
      warehouse: { availableByResource: { coal: 500 }, receipts: [] },
      processedWarehouse: { availableByResource: { coal: 50 }, receipts: [] },
      demandByResource: { coal: { dailyDemand: 120 } },
      inventoryLedger: []
    } }
  } };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites: [row] };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  try {
    const rendered = api.render(root, { countryId: "BGD", sites: [row], tab: "mines" });
    assert.equal(rendered.ok, true);
    assert.match(root.innerHTML, /Overview/);
    assert.match(root.innerHTML, /Stock &amp; Logistics/);
    assert.match(root.innerHTML, /Inventory \/ Warehouse/);
    assert.match(root.innerHTML, /Reports/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="build"/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="extract"/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="demolish"/);
    assert.match(root.innerHTML, /data-balance-state="shortage"/);
    const visibleText = root.innerHTML.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&");
    assert.doesNotMatch(visibleText, /\b(simulated|modelled|modeled|catalog reference|source:|site id)\b/i);
    api.render(root, { countryId: "BGD", sites: [row], tab: "reports" });
    assert.match(root.innerHTML, /omega-v2-report-chart/);
    assert.match(root.innerHTML, /omega-v2-chart-bar/);
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorCatalog === undefined) delete globalThis.OmegaResourceSiteCanonicalCatalogData;
    else globalThis.OmegaResourceSiteCanonicalCatalogData = priorCatalog;
  }
});

test("Resource Logistics shows configured per-site route cards separately from live shipments", async () => {
  const vm = await import("node:vm");
  const fetched = [];
  const savedFleetChanges = [];
  const rootListeners = Object.create(null);
  const route = {
    routeId: "ROUTE_TST_COAL_MINE",
    siteId: "TST-MINE-ROUTE-01",
    countryId: "TST",
    siteName: "Test Coal Mine",
    resourceId: "coal",
    resourceIconKey: "coal",
    planningProduction: { rate: 20, unit: "TONNES_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", sourceDatasetId: "TEST", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [
        { transportMode: "truck", estimatedDistanceKm: 40, designCapacityPerTrip: 25, designCapacityPerDay: 45, cycleHoursForOneDesignVehicle: 8 },
        { transportMode: "rail", estimatedDistanceKm: 80, designCapacityPerTrip: 5000, designCapacityPerDay: 5000, cycleHoursForOneDesignVehicle: 10 }
      ],
      estimatedRouteDistanceKm: 120,
      plannedTransitDays: 3,
      capacityBottleneckPerDay: 45,
      capacityUnit: "RAW_CARGO_TONNES_PER_DAY"
    }
  };
  const legacyGoldRoute = {
    routeId: "ROUTE_TST_GOLD_MINE",
    siteId: "TST-MINE-GOLD-02",
    countryId: "TST",
    siteName: "Test Gold Mine",
    resourceId: "gold",
    resourceIconKey: "gold",
    planningProduction: { rate: 12, unit: "TONNES_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", sourceDatasetId: "TEST", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      strategyCode: "MINE_HAULAGE_RAIL_LAST_MILE",
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [
        { transportMode: "truck", estimatedDistanceKm: 20, designCapacityPerTrip: 25, designCapacityPerDay: 30 },
        { transportMode: "rail", estimatedDistanceKm: 80, designCapacityPerTrip: 5000, designCapacityPerDay: 5000 },
        { transportMode: "truck", estimatedDistanceKm: 20, designCapacityPerTrip: 25, designCapacityPerDay: 30 }
      ],
      estimatedRouteDistanceKm: 120,
      plannedTransitDays: 3,
      capacityBottleneckPerDay: 30,
      capacityUnit: "RAW_CARGO_TONNES_PER_DAY"
    }
  };
  const genericCrudeOilRoute = {
    routeId: "ROUTE_TST_CRUDE_OIL",
    siteId: "TST-OIL-FIELD-04",
    countryId: "TST",
    siteName: "Test Crude Oil Field",
    resourceId: "crude_oil",
    resourceIconKey: "crude_oil",
    planningProduction: { rate: 250, unit: "BARRELS_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", sourceDatasetId: "TEST", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      strategyCode: "MINE_HAULAGE_RAIL_LAST_MILE",
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [
        { transportMode: "truck", estimatedDistanceKm: 20, designCapacityPerTrip: 25, designCapacityPerDay: 30 },
        { transportMode: "rail", estimatedDistanceKm: 80, designCapacityPerTrip: 5000, designCapacityPerDay: 5000 },
        { transportMode: "truck", estimatedDistanceKm: 20, designCapacityPerTrip: 25, designCapacityPerDay: 30 }
      ],
      estimatedRouteDistanceKm: 120,
      plannedTransitDays: 3,
      capacityBottleneckPerDay: 30,
      capacityUnit: "RAW_CARGO_TONNES_PER_DAY"
    }
  };
  const pipelineRoute = {
    routeId: "ROUTE_TST_GAS_PIPELINE",
    siteId: "TST-GAS-PIPELINE-03",
    countryId: "TST",
    siteName: "Test Gas Pipeline",
    resourceId: "natural_gas",
    resourceIconKey: "natural_gas",
    planningProduction: { rate: 1, unit: "BCM_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", sourceDatasetId: "TEST", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "PIPELINE",
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [{ transportMode: "pipeline", estimatedDistanceKm: 150, designCapacityPerDay: 500,
        designCapacityUnit: "MMCF_PER_DAY" }],
      estimatedRouteDistanceKm: 150,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 500,
      capacityUnit: "MMCF_PER_DAY"
    }
  };
  const liveProductionSite = {
    siteId: "TST-MINE-LIVE-05",
    countryId: "TST",
    resourceId: "coal",
    siteName: "Live Production Rate Mine",
    productionModel: {
      productionRate: 300,
      dailyRate: 300,
      rateUnit: "TONNES_PER_DAY",
      annualProduction: { value: 109500, unit: "TONNES_PER_YEAR" },
      productionAuthority: "SIMULATED"
    },
    quantitative: { production: { rate: 300, unit: "TONNES_PER_DAY", status: "SIMULATED" } }
  };
  const liveProductionRoute = {
    routeId: "ROUTE_TST_LIVE_PRODUCTION",
    siteId: "TST-MINE-LIVE-05",
    countryId: "TST",
    siteName: "Live Production Rate Mine",
    resourceId: "coal",
    resourceIconKey: "coal",
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "TRUCK",
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [{ transportMode: "truck", estimatedDistanceKm: 30, designCapacityPerTrip: 25,
        designCapacityPerTripUnit: "TONNES_PER_TRIP", designCapacityPerDay: 300,
        designCapacityUnit: "TONNES_PER_DAY", cycleHoursForOneDesignVehicle: 4 }],
      estimatedRouteDistanceKm: 30,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 300,
      capacityUnit: "TONNES_PER_DAY"
    }
  };
  const capacityTargetRoute = {
    routeId: "ROUTE_TST_CAPACITY_TARGET",
    siteId: "TST-MINE-CAPACITY-06",
    countryId: "TST",
    siteName: "Route Capacity Target Mine",
    resourceId: "phosphate",
    resourceIconKey: "phosphate",
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "TRUCK",
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [{ transportMode: "truck", estimatedDistanceKm: 40, designCapacityPerTrip: 25,
        designCapacityPerTripUnit: "TONNES_PER_TRIP", designCapacityPerDay: 200,
        designCapacityUnit: "RAW_CARGO_TONNES_PER_DAY", cycleHoursForOneDesignVehicle: 8 }],
      estimatedRouteDistanceKm: 40,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 200,
      capacityUnit: "RAW_CARGO_TONNES_PER_DAY"
    }
  };
  const dailyRateWithAnnualSummaryRoute = {
    routeId: "ROUTE_TST_DAILY_RATE_WITH_ANNUAL_SUMMARY",
    siteId: "TST-MINE-GAS-DAILY-07",
    countryId: "TST",
    siteName: "Daily Gas Rate Mine",
    resourceId: "natural_gas",
    resourceIconKey: "natural_gas",
    productionInput: { rate: 2185, annual: 797.52, unit: "MMCF_PER_DAY",
      authority: "SCENARIO_SIMULATION_DATA", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "TRUCK",
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [{ transportMode: "truck", estimatedDistanceKm: 48, designCapacityPerTrip: 50,
        designCapacityPerTripUnit: "MMCF_PER_TRIP", designCapacityPerDay: 5000,
        designCapacityUnit: "MMCF_PER_DAY", cycleHoursForOneDesignVehicle: 2.4 }],
      estimatedRouteDistanceKm: 48,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 5000,
      capacityUnit: "MMCF_PER_DAY"
    }
  };
  const trainUnitRoute = {
    routeId: "ROUTE_TST_TRAIN_PAYLOAD_UNIT",
    siteId: "TST-MINE-TRAIN-UNIT-08",
    countryId: "TST",
    siteName: "Train Payload Unit Mine",
    resourceId: "coal",
    resourceIconKey: "coal",
    productionInput: { rate: 100, unit: "TONNES_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "RAIL",
      legs: [{ transportMode: "rail", estimatedDistanceKm: 120, designCapacityPerTrip: 5000,
        designCapacityPerTripUnit: "TONNES_PER_TRAIN", designCapacityPerDay: 5000,
        designCapacityUnit: "TONNES_PER_DAY", cycleHoursForOneDesignVehicle: 24 }],
      estimatedRouteDistanceKm: 120,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 5000,
      capacityUnit: "TONNES_PER_DAY"
    }
  };
  const shipVesselUnitRoute = {
    routeId: "ROUTE_TST_SHIP_VESSEL_TONNES",
    siteId: "TST-MINE-SHIP-UNIT-09",
    countryId: "TST",
    siteName: "Vessel Payload Unit Mine",
    resourceId: "gold",
    resourceIconKey: "gold",
    productionInput: { rate: 100, unit: "TONNES_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "SHIP",
      legs: [{ transportMode: "ship", estimatedDistanceKm: 240, designCapacityPerTrip: 1000,
        designCapacityPerTripUnit: "TONNES_PER_VESSEL", designCapacityPerDay: 1000,
        designCapacityUnit: "TONNES_PER_DAY", cycleHoursForOneDesignVehicle: 24 }],
      estimatedRouteDistanceKm: 240,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 1000,
      capacityUnit: "TONNES_PER_DAY"
    }
  };
  const shipBarrelVesselRoute = {
    routeId: "ROUTE_TST_SHIP_VESSEL_BARRELS",
    siteId: "TST-OIL-SHIP-UNIT-10",
    countryId: "TST",
    siteName: "Oil Vessel Payload Unit Field",
    resourceId: "crude_oil",
    resourceIconKey: "crude_oil",
    productionInput: { rate: 100, unit: "BARRELS_PER_DAY", authority: "SCENARIO_SIMULATION_DATA", simulationOnly: true },
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeType: "SHIP",
      legs: [{ transportMode: "ship", estimatedDistanceKm: 240, designCapacityPerTrip: 1000,
        designCapacityPerTripUnit: "BARRELS_PER_VESSEL", designCapacityPerDay: 1000,
        designCapacityUnit: "BARRELS_PER_DAY", cycleHoursForOneDesignVehicle: 24 }],
      estimatedRouteDistanceKm: 240,
      plannedTransitDays: 1,
      capacityBottleneckPerDay: 1000,
      capacityUnit: "BARRELS_PER_DAY"
    }
  };
  const sandbox = {
    OmegaResourceIndustrialCatalogData: json("resource_industrial_catalog_v1.json"),
    setTimeout,
    clearTimeout,
    fetch: async (url) => {
      const name = String(url).replace(/^\.\//, "");
      fetched.push(name);
      if (name === "resource_site_logistics_routes_v1.json") {
        return { ok: true, json: async () => ({
          datasetId: "OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1",
          simulationOnly: true,
          countryToPart: { TST: 2 },
          parts: [{ part: 2, file: "resource_site_logistics_routes_v1_part_02.json" }]
        }) };
      }
      if (name === "resource_site_logistics_routes_v1_part_02.json") {
        return { ok: true, json: async () => ({ routes: [route, legacyGoldRoute, genericCrudeOilRoute, pipelineRoute, liveProductionRoute, capacityTargetRoute, dailyRateWithAnnualSummaryRoute, trainUnitRoute, shipVesselUnitRoute, shipBarrelVesselRoute] }) };
      }
      throw new Error("Unexpected logistics asset request: " + name);
    }
  };
  sandbox.OmegaResourceIndustrialNetwork = {
    setTransportFleet: (input) => {
      savedFleetChanges.push({countryId:input.countryId,siteId:input.siteId,transportType:input.transportType,count:input.count});
      return { status: "APPLIED" };
    },
    getTransportFleet: ({ countryId, siteId }) => ({
      status: "READY", countryId, siteId, individualVehicleIdsRequired: false,
      transportTypes: [
        { transportType: "truck", count: 3, configured: true },
        { transportType: "rail", count: 2, configured: true },
        { transportType: "ship", count: 0, configured: true },
        { transportType: "barge", count: null, configured: false },
        { transportType: "pipeline", count: 4, configured: true }
      ]
    })
  };
  sandbox.window = sandbox;
  vm.default.createContext(sandbox);
  vm.default.runInContext(read("omega_ui_v2/screens/resource-ministry.js"), sandbox, {
    filename: "omega_ui_v2/screens/resource-ministry.js"
  });
  const api = sandbox.OmegaUIV2ResourceMinistry;
  sandbox.Game = { state: {
    simulation: { turn: 1, session: { playerCountryId: "TST" } },
    resource: { TST: {
      mineAssets: [],
      industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [], factoryAssets: [] },
      warehouse: { availableByResource: {} },
      processedWarehouse: { availableByResource: {} },
      inventory: { batches: [] },
      inventoryLedger: [],
      demandByResource: {}
    } }
  } };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, listener) { rootListeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  const initial = api.render(root, { countryId: "TST", sites: [liveProductionSite], tab: "logistics" });
  assert.equal(initial.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(root.innerHTML, /Mine Site Route Plans/);
  assert.match(root.innerHTML, /Test Coal Mine/);
  assert.match(root.innerHTML, /Test Gold Mine/);
  assert.match(root.innerHTML, /Test Crude Oil Field/);
  assert.match(root.innerHTML, /data-logistics-mode-chain="pipeline"/,
    "crude oil preferred pipeline should replace the old generic truck-rail template");
  assert.match(root.innerHTML, /Test Gas Pipeline/);
  assert.match(root.innerHTML, /Design need unavailable/,
    "pipeline line needs must remain unknown without per-line capacity data");
  assert.match(root.innerHTML, /data-logistics-mode-chain="truck"/,
    "a generic gold truck-rail-truck template must display gold's preferred available truck mode");
  assert.doesNotMatch(root.innerHTML, /data-logistics-mode-chain="truck,rail,truck"/,
    "the generic intermodal template must not invent three physical route legs");
  assert.match(root.innerHTML, /120 km/);
  assert.match(root.innerHTML, /3 days/);
  assert.match(root.innerHTML, /45 tonnes\/day/);
  assert.doesNotMatch(root.innerHTML, /Transport Fleet Summary|data-omega-v2-logistics-fleet-overview/,
    "the redundant global fleet deck must not sit above the mine routes");
  assert.ok(root.innerHTML.includes("assets/omega-industrial-icons-v1/logistics/mine-site.svg"));
  assert.ok(root.innerHTML.includes("assets/omega-industrial-icons-v1/logistics/warehouse-node.svg"));
  const coalRouteStart = root.innerHTML.indexOf('data-logistics-plan-site-id="TST-MINE-ROUTE-01"');
  const coalRouteEnd = root.innerHTML.indexOf('</article>', coalRouteStart);
  assert.ok(coalRouteStart >= 0 && coalRouteEnd > coalRouteStart, "coal route card must render as one mine card");
  const coalRouteCard = root.innerHTML.slice(coalRouteStart, coalRouteEnd);
  assert.equal((coalRouteCard.match(/data-route-transport-mode=/g) || []).length, 2,
    "the coal route must display only its two actual modes once each");
  assert.match(coalRouteCard, /data-transport-mode="truck"[^>]*data-fleet-configured=/);
  assert.match(coalRouteCard, /data-transport-mode="rail"[^>]*data-fleet-configured=/);
  assert.doesNotMatch(coalRouteCard, /data-transport-mode="(?:ship|barge|pipeline)"|Cargo ships|River barges|Pipeline lines/,
    "a coal route must not display ship, barge or pipeline controls");
  assert.equal((coalRouteCard.match(/data-omega-v2-fleet-count-input/g) || []).length, 2,
    "the fleet editor must only expose controls for route modes");
  assert.match(coalRouteCard, /40 km/);
  assert.match(coalRouteCard, /80 km/);
  assert.match(coalRouteCard, /Route capacity 45 tonnes\/day/);
  assert.match(coalRouteCard, /Route capacity 5,000 tonnes\/day/);
  assert.doesNotMatch(coalRouteCard, /Distance by transport type|data-route-mode-distance=/);
  assert.ok(root.innerHTML.includes("assets/omega-industrial-icons-v1/transport/variants/mode-hero-road-truck.svg"));
  assert.ok(root.innerHTML.includes("assets/omega-industrial-icons-v1/transport/variants/mode-hero-freight-train.svg"));
  assert.ok(root.innerHTML.includes("assets/omega-industrial-icons-v1/transport/variants/mode-hero-cargo-ship.svg"));
  assert.ok(root.innerHTML.includes("assets/omega-industrial-icons-v1/transport/variants/mode-hero-pipeline.svg"));
  assert.match(root.innerHTML, /data-design-estimate-available="true"/);
  assert.match(root.innerHTML, /data-design-estimated-units="1"/);
  assert.match(root.innerHTML, /data-design-formula="ceil\(production per day/);
  assert.match(root.innerHTML, /data-design-capacity-per-unit-day="75"/,
    "the displayed per-vehicle daily capacity must derive from payload and round-trip cycle");
  const capacityTargetStart = root.innerHTML.indexOf('data-site-id="TST-MINE-CAPACITY-06"');
  const capacityTargetEnd = root.innerHTML.indexOf('</article>', capacityTargetStart);
  assert.ok(capacityTargetStart >= 0 && capacityTargetEnd > capacityTargetStart,
    "route-capacity target mine card must render");
  const capacityTargetHtml = root.innerHTML.slice(capacityTargetStart, capacityTargetEnd);
  assert.match(capacityTargetHtml, /data-design-estimate-available="true"/,
    "a known route capacity should size vehicles when production is missing");
  assert.match(capacityTargetHtml, /data-design-estimated-units="3"/,
    "200 tonnes/day divided by 75 tonnes/day per truck requires three trucks");
  assert.match(capacityTargetHtml, /Route capacity need: 3 trucks/);
  assert.match(capacityTargetHtml, /data-design-formula="ceil\(route capacity per day/);

  const annualSummaryStart = root.innerHTML.indexOf('data-site-id="TST-MINE-GAS-DAILY-07"');
  const annualSummaryEnd = root.innerHTML.indexOf('</article>', annualSummaryStart);
  assert.ok(annualSummaryStart >= 0 && annualSummaryEnd > annualSummaryStart,
    "daily production route with annual summary must render");
  assert.match(root.innerHTML.slice(annualSummaryStart, annualSummaryEnd), /data-design-estimated-units="5"/,
    "the declared 2,185 MMCF/day rate must not be overwritten by its 797.52 BCF/year summary");

  const assertRouteDesignNeed = (siteId, mode, expectedLabel, description) => {
    const start = root.innerHTML.indexOf('data-site-id="' + siteId + '"');
    const end = root.innerHTML.indexOf('</article>', start);
    assert.ok(start >= 0 && end > start, "route card must render for " + siteId);
    const html = root.innerHTML.slice(start, end);
    assert.match(html, new RegExp('data-transport-mode="' + mode + '"[^>]*data-fleet-configured='),
      "transport mode card must be present for " + siteId);
    assert.match(html, /data-design-estimate-available="true"/,
      "design fleet estimate must be available for " + siteId + ": " + description);
    assert.match(html, /data-design-estimated-units="1"/,
      "one design transport unit must be calculated for " + siteId + ": " + description);
    assert.match(html, new RegExp(expectedLabel),
      "the player-facing design count must be visible for " + siteId);
  };
  assertRouteDesignNeed("TST-MINE-TRAIN-UNIT-08", "rail", "Design need: 1 train set",
    "TONNES_PER_TRAIN must normalize to TONNES_PER_TRIP");
  assertRouteDesignNeed("TST-MINE-SHIP-UNIT-09", "ship", "Design need: 1 ship",
    "TONNES_PER_VESSEL must normalize to TONNES_PER_TRIP");
  assertRouteDesignNeed("TST-OIL-SHIP-UNIT-10", "ship", "Design need: 1 ship",
    "BARRELS_PER_VESSEL must normalize to BARRELS_PER_TRIP");

  assert.match(root.innerHTML, /Corridor bottleneck · line count unavailable/,
    "BCM/day production must compare against MMCF/day corridor capacity without inventing a pipeline line count");
  const liveCardStart = root.innerHTML.indexOf('data-site-id="TST-MINE-LIVE-05"');
  const liveCardEnd = root.innerHTML.indexOf('</article>', liveCardStart);
  assert.ok(liveCardStart >= 0 && liveCardEnd > liveCardStart, "live-production mine route card must render");
  assert.match(root.innerHTML.slice(liveCardStart, liveCardEnd), /data-design-estimated-units="2"/,
    "when route planningProduction is absent, use the selected mine's declared simulated daily production");
  assert.doesNotMatch(root.innerHTML, /Known configured vehicle subtotal|Known combined transport-unit subtotal|Pipeline lines recorded/,
    "duplicate national fleet rollups must not be repeated inside the mine route cards");
  assert.match(root.innerHTML, /Configure transport counts/);
  assert.match(root.innerHTML, /data-omega-v2-logistics-fleet-form/);
  assert.match(root.innerHTML, /data-omega-v2-fleet-count-input/);

  // Saving a per-mine count calls the aggregate fleet API, not a vehicle-ID registry.
  const countInput = { value: "4", getAttribute: (name) => name === "data-transport-mode" ? "truck" : null };
  const fleetForm = {
    matches: (selector) => selector === "[data-omega-v2-logistics-fleet-form]",
    getAttribute: (name) => name === "data-site-id" ? "TST-MINE-ROUTE-01" :
      name === "data-country-id" ? "TST" : null,
    querySelectorAll: (selector) => selector === "[data-omega-v2-fleet-count-input]" ? [countInput] : []
  };
  assert.equal(typeof rootListeners.submit, "function");
  rootListeners.submit({ target:fleetForm, preventDefault() {} });
  assert.deepEqual(savedFleetChanges, [{
    countryId:"TST",siteId:"TST-MINE-ROUTE-01",transportType:"truck",count:4
  }], "count editor must persist aggregate mode counts through the gameplay runtime");

  const foreignFleetForm = {
    matches: fleetForm.matches,
    getAttribute: (name) => name === "data-site-id" ? "USA-MINE-01" :
      name === "data-country-id" ? "USA" : null,
    querySelectorAll: fleetForm.querySelectorAll
  };
  rootListeners.submit({ target:foreignFleetForm, preventDefault() {} });
  assert.equal(savedFleetChanges.length,1,"fleet count changes outside the active player country must be rejected");
  assert.match(root.innerHTML, /Road trucks/);
  assert.match(root.innerHTML, /3 trucks/);
  assert.match(root.innerHTML, /Freight train sets/);
  assert.match(root.innerHTML, /2 train sets/);
  assert.match(root.innerHTML, /Cargo ships/);
  assert.match(root.innerHTML, /0 ships/);
  assert.match(root.innerHTML, /Pipeline lines/);
  assert.match(root.innerHTML, /4 lines/);
  assert.doesNotMatch(root.innerHTML, /River barges/,
    "no barge card should appear when the selected country's route plans contain no barge leg");
  assert.match(root.innerHTML, /Design need: 1 truck/);
  assert.match(root.innerHTML, /Design need: 1 train set/);
  assert.match(root.innerHTML, /trips\/day/);
  assert.doesNotMatch(root.innerHTML, /Calculated design units|data-omega-v2-logistics-fleet-overview/);
  assert.match(root.innerHTML, /logistics\/mine-site\.svg/);
  assert.match(root.innerHTML, /logistics\/warehouse-node\.svg/);
  assert.match(read("assets/omega-industrial-icons-v1/logistics/mine-site.svg"), /<title id="mine-title">Resource mine site<\/title>/);
  assert.match(read("assets/omega-industrial-icons-v1/logistics/warehouse-node.svg"), /<title id="warehouse-title">Raw resource warehouse<\/title>/);
  assert.doesNotMatch(root.innerHTML, /data-current-match=|Current Match/,
    "route plan cards must stay separate from the live shipment ledger");
  assert.doesNotMatch(root.innerHTML, /No active shipments or delivery records/);
  assert.deepEqual(fetched, [
    "resource_site_logistics_routes_v1.json",
    "resource_site_logistics_routes_v1_part_02.json"
  ], "only the selected country's route shard should be loaded");

  sandbox.Game.state.resource.TST.industrialNetwork.shipments = [{
    siteId: "TST-MINE-ROUTE-01",
    routeId: "ROUTE_TST_COAL_MINE",
    resourceId: "coal",
    quantity: 10,
    unit: "tonnes",
    status: "IN_TRANSIT",
    transportMode: "truck",
    destinationWarehouseId: "WH-TST-RAW",
    etaTurn: 2
  }];
  api.render(root, { countryId: "TST", sites: [liveProductionSite], tab: "logistics" });
  assert.match(root.innerHTML, /Current Shipments/);
});

test("resource status plating and charts stay local and unit-aware", () => {
  const css = cssText();
  assert.match(css, /omega-v2-mine-card\[data-balance-state="adequate"\]/);
  assert.match(css, /omega-v2-mine-card\[data-balance-state="shortage"\]/);
  assert.match(css, /omega-v2-mine-card\[data-balance-state="stopped"\]/);
  assert.match(css, /omega-v2-resource-icon[\s\S]*#f6fafc/);
  assert.doesNotMatch(css, /https?:\/\//);
});


test("all resource SVGs use a light metallic backplate for readable dark minerals", () => {
  const manifest = json("assets/omega-industrial-icons-v1/manifest.json");
  assert.equal(manifest.resources.length, 42);
  assert.equal(manifest.factories.length, 21);
  for (const item of manifest.resources) {
    const file = "assets/omega-industrial-icons-v1/" + item.file;
    const svg = read(file);
    const match = svg.match(/<linearGradient id="[^"]+-bg"[^>]*>([\s\S]*?)<\/linearGradient>/);
    assert.ok(match, file + ": backplate gradient required");
    assert.match(match[1], /stop-color="#f7fbfd"/, file + ": light upper metallic layer");
    assert.match(match[1], /stop-color="#dce7ec"/, file + ": silver main surface");
    assert.match(match[1], /stop-color="#b7c8d1"/, file + ": readable lower edge");
    assert.match(svg, /data-omega-icon-kind="resource"/);
  }
  assert.match(manifest.rendering.background, /light silver-metal.*factory SVGs retain their shared dark-navy/i);
  assert.ok(Number(read("omega-offline-map-sw.js").match(/CACHE_NAME = "omega-offline-atlas-shell-v(\d+)"/)?.[1] || 0) >= 79, "offline shell cache version must be current");
});


test("Resource Ministry is locked to the selected player country", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game;
  const priorResourceEngine = globalThis.ResourceMinistryEngine;
  const priorCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData;
  const site = (countryId, countryName, siteName, siteId) => ({
    siteId, countryId, siteName, resourceId: "coal",
    identity: { countryIso3: countryId, countryName, resourceTypeId: "coal" },
    location: { countryName, region: "Mining region", coordinates: { lat: 12, lng: 24 } },
    operation: { commercialExtraction: true, status: "REGISTERED" },
    quantitative: {
      reserve: { quantity: 100000, unit: "TONNES", status: "SIMULATED" },
      production: { rate: 10, unit: "TONNES_PER_DAY", status: "SIMULATED" }
    },
    simulation: { reserve: { quantity: 100000, unit: "TONNES", status: "SIMULATED" } }
  });
  const bangladesh = site("BGD", "Bangladesh", "Bangladesh Coal Mine", "SITE_BGD_COUNTRY_SELECTOR");
  const usa = site("USA", "United States", "United States Coal Mine", "SITE_USA_COUNTRY_SELECTOR");
  const listeners = Object.create(null);
  globalThis.Game = { state: {
    simulation: { turn: 4, session: { playerCountryId: "BGD" } },
    resource: {
      BGD: { mineAssets: [], industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] } },
      USA: { mineAssets: [], industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] } }
    }
  } };
  const foreignStateBefore = JSON.stringify(globalThis.Game.state.resource.USA);
  globalThis.ResourceMinistryEngine = {
    countryProfiles: {
      BGD: { identity: { iso3: "BGD", officialName: "Bangladesh" } },
      USA: { identity: { iso3: "USA", officialName: "United States" } }
    }
  };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites: [bangladesh, usa] };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  try {
    const first = api.render(root, { countryId: "BGD", sites: [bangladesh, usa], tab: "mines" });
    assert.equal(first.ok, true);
    assert.doesNotMatch(root.innerHTML, /data-omega-v2-resource-country/,
      "resource country is a fixed player-country label, not a browse selector");
    assert.match(root.innerHTML, /Bangladesh \(BGD\)/);
    assert.doesNotMatch(root.innerHTML, /United States \\(USA\\)/);
    assert.match(root.innerHTML, /Bangladesh Coal Mine/);
    assert.doesNotMatch(root.innerHTML, /United States Coal Mine/);

    listeners.change({
      target: {
        value: "USA",
        matches(selector) { return selector === "[data-omega-v2-resource-country]"; }
      }
    });
    assert.match(root.innerHTML, /Bangladesh \(BGD\)/,
      "a stale selector event cannot switch the ministry to another country");
    assert.doesNotMatch(root.innerHTML, /United States Coal Mine/);
    assert.equal(JSON.stringify(globalThis.Game.state.resource.USA), foreignStateBefore,
      "foreign-country state remains untouched");
    assert.doesNotMatch(root.innerHTML.replace(/<[^>]*>/g, " "), /\bSIMULATED\b/i);
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorResourceEngine === undefined) delete globalThis.ResourceMinistryEngine;
    else globalThis.ResourceMinistryEngine = priorResourceEngine;
    if (priorCatalog === undefined) delete globalThis.OmegaResourceSiteCanonicalCatalogData;
    else globalThis.OmegaResourceSiteCanonicalCatalogData = priorCatalog;
  }
});

test("Resource Ministry shows only canonical raw stock and preserves factory input ledgers on exit", async () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const prior = {
    Game:globalThis.Game,
    Omega:globalThis.Omega,
    ResourceMinistryEngine:globalThis.ResourceMinistryEngine,
    OmegaCountryInventoryRuntime:globalThis.OmegaCountryInventoryRuntime,
    OmegaResourceStartupBaseline:globalThis.OmegaResourceStartupBaseline,
    OmegaResourceSiteCanonicalCatalogData:globalThis.OmegaResourceSiteCanonicalCatalogData
  };
  const calls = [];
  const rules = json("resource_economy_rules.json");
  const catalog = Object.keys(rules.demand.resourceProfiles).map((resourceId) => ({
    resourceId, name:resourceId.replace(/[_-]+/g," ").replace(/\b\w/g,ch => ch.toUpperCase()),
    unit:"TONNES", profileKnown:true
  }));
  const root = {
    innerHTML:"",
    classList:{ add(){} },
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    contains(){ return true; }
  };
  // A stale compatibility snapshot points to USA; the simulation world is
  // authoritative and has BGD selected. The ministry must show only BGD.
  globalThis.Game = { state:{
    simulation:{ turn:2, session:{ sessionId:"STALE-COMPATIBILITY-SNAPSHOT", playerCountryId:"USA", status:"RUNNING" } },
    resource:{
      USA:{ inventory:{ coal:999999 }, inventoryUnits:{ coal:"TONNES" }, warehouse:{ availableByResource:{ coal:999999 } },
        processedWarehouse:{ availableByResource:{} }, batches:[], mineAssets:[], industrialNetwork:{projects:[],shipments:[],siteFlowLedger:[]} }
    }
  } };
  globalThis.Omega = { SimulationRuntime:{ world:{ state:{
    simulation:{ turn:7, session:{ sessionId:"RESOURCE-LAZY-1", playerCountryId:"BGD", status:"RUNNING" } },
    resource:{
      BGD:{ inventory:{ coal:1234, steel:5678 }, inventoryUnits:{ coal:"TONNES", steel:"TONNES" },
        warehouse:{ availableByResource:{ coal:1234, steel:5678 } },
        factoryInputBaselineV1:{ stockRows:[{ productId:"steel", quantity:5678, unit:"TONNES", state:"TOPPED_UP" }] },
        processedWarehouse:{ availableByResource:{} }, batches:[], mineAssets:[], industrialNetwork:{projects:[],shipments:[],siteFlowLedger:[]} }
    }
  } } } };
  globalThis.ResourceMinistryEngine = { countryProfiles:{
    BGD:{ identity:{ iso3:"BGD", officialName:"Bangladesh" } },
    USA:{ identity:{ iso3:"USA", officialName:"United States" } }
  } };
  globalThis.OmegaCountryInventoryRuntime = { getResourceCatalog(){ return catalog; } };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites:[
    {siteId:"BGD-COAL-LAZY",countryId:"BGD",siteName:"Bangladesh Mine",resourceId:"coal"},
    {siteId:"USA-COAL-LAZY",countryId:"USA",siteName:"United States Mine",resourceId:"coal"}
  ] };
  globalThis.OmegaResourceStartupBaseline = {
    getResourceCatalog(){ return catalog; },
    getFactoryInputCoverageDays(){ return 100; },
    ensurePlayerCountryBaseline(countryId){ calls.push(countryId); return Promise.resolve({status:"ALREADY_INITIALIZED",countryId}); }
  };
  try {
    const result = api.render(root,{countryId:"USA",sites:[
      {siteId:"BGD-COAL-LAZY",countryId:"BGD",siteName:"Bangladesh Mine",resourceId:"coal"},
      {siteId:"USA-COAL-LAZY",countryId:"USA",siteName:"United States Mine",resourceId:"coal"}
    ],tab:"dashboard"});
    assert.equal(result.code,"PLAYER_COUNTRY_BASELINE_LOADING");
    assert.match(root.innerHTML,/Loading BGD inventory/);
    await new Promise(resolve => setTimeout(resolve,0));
    assert.deepEqual(calls,["BGD"]);
    assert.match(root.innerHTML,/Current Stock/,
      "the default ministry overview must expose current stock without opening another tab");
    assert.match(root.innerHTML,/1,234(?:\.00)? TONNES/);
    const rawSectionStart = root.innerHTML.indexOf("data-omega-v2-raw-resource-inventory");
    const processedSectionStart = root.innerHTML.indexOf("Processed Goods Warehouse");
    assert.ok(rawSectionStart >= 0 && processedSectionStart > rawSectionStart,
      "the overview must render separate raw and processed warehouse sections");
    const rawSection = root.innerHTML.slice(rawSectionStart, processedSectionStart);
    const processedSection = root.innerHTML.slice(processedSectionStart);
    assert.doesNotMatch(rawSection,/steel|5,678/i,
      "factory input products are not added to the national raw-resource stock display");
    assert.doesNotMatch(processedSection,/steel|5,678/i,
      "a factory-input baseline or aggregate legacy balance is not promoted into processed warehouse stock");
    assert.equal(globalThis.Omega.SimulationRuntime.world.state.resource.BGD.factoryInputBaselineV1.stockRows[0].quantity, 5678,
      "the existing factory input baseline stays intact in authoritative game state");
    assert.match(root.innerHTML,/Raw resource types|Current Stock/);
    assert.match(root.innerHTML,/Bangladesh \(BGD\)/);
    assert.doesNotMatch(root.innerHTML,/United States Mine|999,999/);
    const unloaded = api.unload(root);
    assert.equal(unloaded.ok,true);
    assert.equal(root.__omegaV2ResourceActive,false);
    assert.equal(root.__omegaV2CurrentCountryKey,undefined);
    assert.equal(root.__omegaV2ResourceOptions,undefined);
  } finally {
    for (const key of Object.keys(prior)) {
      if (prior[key] === undefined) delete globalThis[key];
      else globalThis[key] = prior[key];
    }
  }
});


test("legacy Resource & Mining renderer entry points hand off to UI v2 without duplicate rendering", () => {
  const bridge = globalThis.OmegaUIV2ResourceLegacyBridge;
  assert.ok(bridge, "Resource Ministry legacy bridge must be registered");
  const previous = {
    document: globalThis.document,
    cabinet: globalThis.OmegaCabinetUI,
    integration: globalThis.OmegaUIV2Integration,
    app: globalThis.OmegaUIV2App,
    notification: globalThis.showOmegaNotification
  };
  const attributes = Object.create(null);
  const root = {
    style: {},
    __omegaUIV2State: null,
    setAttribute(key, value) { attributes[key] = String(value); },
    getAttribute(key) { return attributes[key] || null; },
    removeAttribute(key) { delete attributes[key]; }
  };
  const dashboard = { style: {}, setAttribute() {} };
  const mountCalls = [];
  const openCalls = [];
  const deferredOpenCalls = [];
  let legacyCalls = 0;
  globalThis.document = {
    getElementById(id) {
      if (id === "cabinet-full-window") return root;
      if (id === "ministry-dashboard-view") return dashboard;
      return null;
    }
  };
  globalThis.OmegaUIV2Integration = {
    isEnabled() { return true; },
    mountIntoCabinet(node, options) {
      mountCalls.push({ node, options });
      node.setAttribute("data-omega-ui-v2-active", "true");
      node.__omegaUIV2State = { route: "resources", ministryId: "energy_mining", section: "dashboard" };
      return { ok: true, route: "resources" };
    }
  };
  globalThis.OmegaUIV2App = {
    openMinistry(node, id, deferRender) {
      openCalls.push(id);
      deferredOpenCalls.push(deferRender);
      node.__omegaUIV2State = { route: "resources", ministryId: id, section: "dashboard" };
      return true;
    }
  };
  globalThis.showOmegaNotification = () => {};
  const legacy = {
    activeCountry: "BGD",
    getActiveCountryKey() { return "BGD"; },
    renderMinistryDashboard() { legacyCalls += 1; },
    renderResourceMinistryDashboard() { legacyCalls += 1; }
  };
  globalThis.OmegaCabinetUI = legacy;
  try {
    assert.equal(bridge.install(), true);
    assert.equal(legacy.renderMinistryDashboard("energy_mining"), true);
    assert.equal(mountCalls.length, 1, "direct ministry entry must mount the unified UI once");
    assert.equal(mountCalls[0].options.initialRoute, "resources");
    assert.equal(mountCalls[0].options.initialMinistryId, "energy_mining");
    assert.equal(mountCalls[0].options.ministryId, undefined);
    assert.equal(mountCalls[0].options.countryId, "BGD");
    assert.equal(legacy.renderResourceMinistryDashboard({ id: "energy_mining" }, {}), true);
    assert.deepEqual(openCalls, ["energy_mining"], "an active UI v2 screen must be reused rather than re-mounted");
    assert.deepEqual(deferredOpenCalls, [true], "an active ministry navigation must yield before rendering the destination");
    assert.equal(legacyCalls, 0, "retired resource renderers must never produce legacy markup");
    legacy.renderMinistryDashboard("defense");
    assert.equal(legacyCalls, 1, "unrelated ministry rendering must remain unchanged");
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.cabinet === undefined) delete globalThis.OmegaCabinetUI; else globalThis.OmegaCabinetUI = previous.cabinet;
    if (previous.integration === undefined) delete globalThis.OmegaUIV2Integration; else globalThis.OmegaUIV2Integration = previous.integration;
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App = previous.app;
    if (previous.notification === undefined) delete globalThis.showOmegaNotification; else globalThis.showOmegaNotification = previous.notification;
  }
});

test("Resource & Mining never falls back to the retired UI when UI v2 is unavailable", () => {
  const bridge = globalThis.OmegaUIV2ResourceLegacyBridge;
  const previous = {
    document: globalThis.document,
    cabinet: globalThis.OmegaCabinetUI,
    integration: globalThis.OmegaUIV2Integration,
    app: globalThis.OmegaUIV2App,
    notification: globalThis.showOmegaNotification
  };
  const root = { style: {}, getAttribute() { return null; } };
  let legacyCalls = 0;
  globalThis.document = { getElementById(id) { return id === "cabinet-full-window" ? root : null; } };
  globalThis.OmegaUIV2Integration = undefined;
  globalThis.OmegaUIV2App = undefined;
  globalThis.showOmegaNotification = () => {};
  const legacy = {
    renderMinistryDashboard() { legacyCalls += 1; },
    renderResourceMinistryDashboard() { legacyCalls += 1; }
  };
  globalThis.OmegaCabinetUI = legacy;
  try {
    assert.equal(bridge.install(), true);
    assert.equal(legacy.renderMinistryDashboard("resource"), false);
    assert.equal(legacy.renderResourceMinistryDashboard({ id: "resource" }), false);
    assert.equal(legacyCalls, 0, "a failed UI v2 mount must not revive the previous Resource Ministry UI");
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.cabinet === undefined) delete globalThis.OmegaCabinetUI; else globalThis.OmegaCabinetUI = previous.cabinet;
    if (previous.integration === undefined) delete globalThis.OmegaUIV2Integration; else globalThis.OmegaUIV2Integration = previous.integration;
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App = previous.app;
    if (previous.notification === undefined) delete globalThis.showOmegaNotification; else globalThis.showOmegaNotification = previous.notification;
  }
});


test("v2 Build opens an actionable plan and Start construction calls the authoritative mine runtime", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game, priorCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData;
  const priorNetwork = globalThis.OmegaResourceIndustrialNetwork, priorMineUi = globalThis.OmegaResourceMineManagementUI;
  const listeners = Object.create(null), starts = [];
  let legacyOpens = 0;
  const row = { siteId:"SITE_BGD_BUILD_FLOW", countryId:"BGD", resourceId:"coal", siteName:"Build Flow Coal Mine",
    operation:{commercialExtraction:true}, location:{region:"Sylhet"},
    quantitative:{reserve:{quantity:100000,unit:"TONNES",status:"SIMULATED"},production:{rate:12,unit:"TONNES_PER_DAY",status:"SIMULATED"}},
    simulation:{reserve:{quantity:100000,unit:"TONNES",status:"SIMULATED"}} };
  const countInput={value:"2"}, workerInput={value:"1200"}, previewNode={innerHTML:""};
  const root={innerHTML:"",classList:{add(){}},addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},
    querySelector(s){if(s==="[data-omega-v2-build-count]")return countInput;if(s==="[data-omega-v2-build-workers]")return workerInput;if(s==="[data-omega-v2-build-preview]")return previewNode;return null;},
    querySelectorAll(){return[];},contains(){return true;}};
  globalThis.Game={state:{simulation:{turn:3,session:{playerCountryId:"BGD"}},resource:{BGD:{mineAssets:[],
    industrialNetwork:{projects:[],shipments:[],siteFlowLedger:[]},
    warehouse:{availableByResource:{coal:100000,iron_ore:100000,copper:100000,limestone:100000,construction_aggregate:100000}}}},finance:{BGD:{available:1000000000}}}};
  globalThis.OmegaResourceSiteCanonicalCatalogData={sites:[row]};
  globalThis.OmegaResourceMineManagementUI={open(){legacyOpens+=1;}};
  globalThis.OmegaResourceIndustrialNetwork={
    quoteMineProject(input){return{status:"QUOTED",countryId:input.countryId,siteId:input.siteId,resourceId:input.resourceId,assetCount:input.quantity,
      costUsd:96000000,unitCostUsd:48000000,durationDays:180,estimatedTurns:6,workersRequired:1200,workersRequiredPerAsset:600,assignedWorkers:input.assignedWorkers,
      staffingReady:input.assignedWorkers>=1200,materialsReady:true,commissioningReady:true,ready:input.quantity===2&&input.assignedWorkers>=1200,
      treasury:{available:1000000000,required:96000000,sufficient:true},
      materials:[{resourceId:"iron_ore",required:17000,available:100000,shortfall:0,unit:"SIMULATION_RESOURCE_UNIT",sufficient:true}]}},
    startMineProject(input){starts.push(input);const project={projectId:"MINE-TEST-STARTED",projectType:"MINE_CONSTRUCTION",siteId:input.siteId,resourceId:input.resourceId,
      status:"UNDER_CONSTRUCTION",assetCount:input.quantity,costUsd:96000000,durationDays:180,progressDays:0,progressPct:0,remainingDays:180,
      expectedCompletionDate:"2027-01-01",workersCommitted:input.assignedWorkers,workersRequired:1200,
      materialsRequired:[{resourceId:"iron_ore",quantity:17000,unit:"SIMULATION_RESOURCE_UNIT"}]};
      globalThis.Game.state.resource.BGD.industrialNetwork.projects.push(project);return project;}
  };
  function fire(type,event){(listeners[type]||[]).forEach(function(fn){fn(event);});}
  function click(selector,attrs){const button={disabled:false,getAttribute(name){return attrs[name]||null;}};fire("click",{target:{closest(v){return v===selector?button:null;}}});}
  try{
    api.render(root,{countryId:"BGD",sites:[row],tab:"mines"});
    click("[data-omega-v2-mine-action]",{"data-omega-v2-mine-action":"build","data-site-id":row.siteId});
    assert.match(root.innerHTML,/data-omega-v2-build-plan/);
    assert.match(root.innerHTML,/data-omega-v2-build-count/);
    assert.match(root.innerHTML,/data-omega-v2-build-workers/);
    assert.match(root.innerHTML,/Start construction/);
    assert.equal(legacyOpens,0,"Build must not merely open the retired modal");
    fire("input",{target:{value:"2",matches(s){return s==="[data-omega-v2-build-count]";}}});
    assert.match(previewNode.innerHTML,/data-omega-v2-build-submit>(Start construction)<\/button>/,"ready quote must enable Start construction");
    assert.match(previewNode.innerHTML,/Resources needed to establish this mine/,"build preview should explain why these resources are listed");
    assert.match(previewNode.innerHTML,/class="omega-v2-build-material-resource"/,"each required resource gets a compact icon-and-label row");
    assert.match(previewNode.innerHTML,/assets\/omega-industrial-icons-v1\/resources\/iron-ore\.svg/,"the existing canonical resource SVG is shown beside the name");
    assert.match(previewNode.innerHTML,/Need <span[^>]*>17K<\/span>/,"resource requirements use compact thousands notation");
    assert.match(previewNode.innerHTML,/Available: <span[^>]*>100K<\/span>/,"available inventory uses compact thousands notation");
    assert.doesNotMatch(previewNode.innerHTML,/SIMULATION(?:_RESOURCE)?_UNIT/i,"internal simulation unit labels stay out of the player UI");
    const buildCss=read("omega_ui_v2/omega-ui-v2.css");
    const premiumCss=read("omega_ui_v2/resource-ministry-premium.css");
    assert.match(buildCss,/\.omega-v2-mine-build-plan/,"fallback styling is scoped to the mine build section");
    assert.match(buildCss,/text-decoration:\s*none\s*!important/i,"underlines are removed in the shared stylesheet");
    const previousPremiumRule=premiumCss.indexOf(".omega-v2-resource-premium .omega-v2-build-material {");
    const finalCascadeRule=premiumCss.lastIndexOf(".omega-v2-resource-premium .omega-v2-mine-build-plan .omega-v2-build-material {");
    assert.ok(previousPremiumRule >= 0 && finalCascadeRule > previousPremiumRule,
      "final mine-build styles must override older premium resource rules loaded in the same stylesheet");
    assert.match(premiumCss, /\.omega-v2-resource-premium \.omega-v2-mine-build-plan \.omega-v2-build-material \{[^}]*display:\s*grid/s,
      "the live material row remains a compact icon-and-quantity grid after premium styles load");
    assert.match(premiumCss, /\.omega-v2-resource-premium \.omega-v2-mine-build-plan \* \{[^}]*text-decoration:\s*none\s*!important/s,
      "the active premium cascade removes underlines from the build panel");
    click("[data-omega-v2-build-submit]",{"data-omega-v2-build-submit":"true"});
    assert.equal(starts.length,1,"authoritative startMineProject must run exactly once");
    assert.equal(starts[0].countryId,"BGD");assert.equal(starts[0].siteId,row.siteId);assert.equal(starts[0].resourceId,"coal");
    assert.equal(starts[0].quantity,2);assert.equal(starts[0].assignedWorkers,1200);
    assert.match(starts[0].requestId,/^MINE_UI_V2:BGD:SITE_BGD_BUILD_FLOW:N2:W1200:/);
    assert.match(root.innerHTML,/Construction in progress/);assert.match(root.innerHTML,/180 days remaining/);assert.match(root.innerHTML,/2027-01-01/);
  }finally{
    if(priorGame===undefined)delete globalThis.Game;else globalThis.Game=priorGame;
    if(priorCatalog===undefined)delete globalThis.OmegaResourceSiteCanonicalCatalogData;else globalThis.OmegaResourceSiteCanonicalCatalogData=priorCatalog;
    if(priorNetwork===undefined)delete globalThis.OmegaResourceIndustrialNetwork;else globalThis.OmegaResourceIndustrialNetwork=priorNetwork;
    if(priorMineUi===undefined)delete globalThis.OmegaResourceMineManagementUI;else globalThis.OmegaResourceMineManagementUI=priorMineUi;
  }
});


test("logistics cards expose an accessible route diagram with existing SVG cargo art", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game;
  const shipment = {
    shipmentId: "SHIPMENT_VISUAL_TEST_01",
    resourceId: "coal",
    quantity: 8200,
    unit: "TONNES",
    status: "IN_TRANSIT",
    sourceSiteName: "Sylhet Coal Mine",
    destinationFactoryName: "Dhaka Steel Factory",
    transportMode: "ROAD",
    etaTurn: 12
  };
  const shipmentWithoutTransportMode = {
    shipmentId: "SHIPMENT_VISUAL_TEST_02",
    resourceId: "iron_ore",
    quantity: 1200,
    unit: "TONNES",
    status: "IN_TRANSIT",
    sourceSiteName: "Chittagong Ore Depot",
    destinationFactoryName: "Dhaka Steel Factory",
    etaTurn: 14
  };
  const listeners = Object.create(null);
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  globalThis.Game = {
    state: {
      simulation: { turn: 10, session: { playerCountryId: "BGD" } },
      resource: {
        BGD: {
          mineAssets: [],
          industrialNetwork: { projects: [], shipments: [shipment, shipmentWithoutTransportMode], siteFlowLedger: [] },
          warehouse: { availableByResource: { coal: 8200 } }
        }
      }
    }
  };
  try {
    const result = api.render(root, { countryId: "BGD", sites: [], tab: "logistics" });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /omega-v2-logistics-card/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="origin"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="transport"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="factory"/);
    assert.match(root.innerHTML, /data-omega-v2-resource-icon="coal"/);
    assert.match(root.innerHTML, /Sylhet Coal Mine/);
    assert.match(root.innerHTML, /Dhaka Steel Factory/);
    assert.match(root.innerHTML, /Road/);
    assert.match(root.innerHTML, /8,200 TONNES/);
    assert.match(root.innerHTML, /Turn 12/);
    assert.match(root.innerHTML, /Transport mode not recorded/,
      "a shipment with no recorded mode must not invent a truck, ship or other transport");
    assert.doesNotMatch(root.innerHTML, /data-omega-v2-transport-mode="unknown"|src=""/,
      "a missing mode must not render a blank or fabricated transport image");
    const css = cssText();
    assert.match(css, /omega-v2-logistics-card::before/);
    assert.match(css, /omega-v2-logistics-path/);
    assert.match(css, /input:focus-visible/);
    assert.match(css, /omega-v2-build-plan-fields/);
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
  }
});


test("Resource Ministry cancels a shared country route shard after its last active screen unloads", async () => {
  const vm = await import("node:vm");
  const requested = [];
  const signals = [];
  const sandbox = {
    AbortController,
    setTimeout,
    clearTimeout,
    OmegaResourceIndustrialCatalogData: json("resource_industrial_catalog_v1.json"),
    fetch(url, options) {
      const name = String(url).replace(/^\.\//, "");
      requested.push(name);
      if (name === "resource_site_logistics_routes_v1.json") {
        return Promise.resolve({ ok:true, json:async () => ({
          datasetId:"OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1",
          simulationOnly:true,
          countryToPart:{ TST:1 },
          parts:[{ part:1, file:"resource_site_logistics_routes_v1_part_01.json" }]
        }) });
      }
      if (name === "resource_site_logistics_routes_v1_part_01.json") {
        const signal = options && options.signal;
        signals.push(signal);
        return new Promise((resolve, reject) => {
          if (!signal) return;
          signal.addEventListener("abort", () => {
            const error = new Error("route shard request aborted");
            error.name = "AbortError";
            reject(error);
          }, { once:true });
        });
      }
      return Promise.reject(new Error("Unexpected route request: " + name));
    }
  };
  sandbox.window = sandbox;
  vm.default.createContext(sandbox);
  vm.default.runInContext(read("omega_ui_v2/screens/resource-ministry.js"), sandbox, {
    filename:"omega_ui_v2/screens/resource-ministry.js"
  });
  sandbox.Game = { state:{
    simulation:{ turn:1, session:{ playerCountryId:"TST" } },
    resource:{ TST:{
      mineAssets:[],
      industrialNetwork:{ projects:[], shipments:[], siteFlowLedger:[] },
      warehouse:{ availableByResource:{} },
      processedWarehouse:{ availableByResource:{} },
      inventory:{},
      inventoryLedger:[]
    } }
  } };
  const makeRoot = () => ({
    innerHTML:"",
    classList:{ add(){} },
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    contains(){ return true; }
  });
  const api = sandbox.OmegaUIV2ResourceMinistry;
  const first = makeRoot();
  const second = makeRoot();
  try {
    api.render(first, { countryId:"TST", sites:[], tab:"logistics" });
    api.render(second, { countryId:"TST", sites:[], tab:"logistics" });
    for (let attempt=0; attempt<8 && !signals.length; attempt++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.deepEqual(requested, [
      "resource_site_logistics_routes_v1.json",
      "resource_site_logistics_routes_v1_part_01.json"
    ], "one route manifest and one selected-country shard should be shared");
    assert.equal(signals.length, 1);
    assert.ok(signals[0], "the large route shard must receive an abort signal");
    api.unload(first);
    assert.equal(signals[0].aborted, false,
      "a request stays active while another screen still waits for the same country");
    api.unload(second);
    assert.equal(signals[0].aborted, true,
      "the shard request is cancelled as soon as the last requesting screen leaves");
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    api.unload(first);
    api.unload(second);
  }
});


test("raw-resource inventory cards show icon, stock, demand, status and named supplier without mixing product warehouse balances", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const rules = json("resource_economy_rules.json");
  const resources = Object.keys(rules.demand.resourceProfiles).map((resourceId) => {
    const profile = rules.demand.resourceProfiles[resourceId] || {};
    return {
      resourceId,
      name: resourceId.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
      unit: String(profile.unit || "").replace(/_PER_DAY$/i, "") || "TONNES",
      demandUnit: profile.unit || "TONNES_PER_DAY"
    };
  });
  const prior = {
    Game:globalThis.Game,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    catalog:globalThis.OmegaResourceIndustrialCatalogData,
    country:globalThis.OmegaCountryRuntimeData,
    startup:globalThis.OmegaResourceStartupBaseline
  };
  const root = {
    innerHTML:"",
    classList:{add(){}},
    addEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    contains(){return true;}
  };
  globalThis.Game = { state:{
    simulation:{turn:8,session:{playerCountryId:"BGD",status:"RUNNING"}},
    resource:{BGD:{
      inventory:{coal:125,iron_ore:50,copper:60},
      inventoryUnits:{coal:"TONNES",iron_ore:"TONNES",copper:"TONNES"},
      batches:[
        {batchId:"RAW-MINE-COAL-01",resourceId:"coal",stage:"RAW",quantity:125,remainingQuantity:125,unit:"TONNES",status:"AVAILABLE",warehouseId:"WH-BGD-RAW",sourceCountryId:"BGD",transferType:"LOCAL_EXTRACTION",sourceSiteIds:["SITE-BGD-COAL"]},
        {batchId:"RAW-IMPORT-ORE-01",resourceId:"iron_ore",stage:"RAW",quantity:50,remainingQuantity:50,unit:"TONNES",status:"AVAILABLE",warehouseId:"WH-BGD-RAW",sourceCountryId:"AUS",transferType:"INTERNATIONAL_TRADE_IMPORT"},
        {batchId:"STARTUP-STOCK-V1-BGD-COPPER",resourceId:"copper",stage:"RAW",quantity:60,remainingQuantity:60,unit:"TONNES",status:"AVAILABLE",warehouseId:"WH-BGD-RAW",sourceCountryId:"BGD",transferType:"LOCAL_RUNTIME",provenance:{source:"SIMULATED_STARTUP_BASELINE_V1",authority:"SIMULATED_STARTUP_BASELINE_V1"}},
        {batchId:"PROCESSED-STEEL-01",resourceId:"steel",stage:"FINISHED",quantity:900,remainingQuantity:900,unit:"TONNES",status:"AVAILABLE",warehouseId:"WH-BGD-PROCESSED"}
      ],
      demandRuntime:{byResource:{
        coal:{demandPerDay:25,status:"BALANCED",stockCoverageDays:5,stockCoverageTargetDays:4},
        iron_ore:{demandPerDay:10,status:"SHORTAGE",unmetDemand:2,stockCoverageDays:5,stockCoverageTargetDays:10}
      }},
      warehouse:{warehouseId:"WH-BGD-RAW",availableByResource:{coal:125,iron_ore:50,copper:60},receipts:[]},
      processedWarehouse:{warehouseId:"WH-BGD-PROCESSED",availableByResource:{steel:900},unitsByProduct:{steel:"TONNES"},receipts:[]},
      mineAssets:[],industrialNetwork:{projects:[],shipments:[],siteFlowLedger:[]},inventoryLedger:[]
    }},
    economy:{BGD:{productionAssets:[{
      id:"FAC-BGD-STEEL",name:"Bangladesh Steel Works",factoryType:"STEEL_MILL",status:"OPERATIONAL",
      inputInventory:{iron_ore:12},inputUnits:{iron_ore:"TONNES"}
    }]}},
    trade:{BGD:{importRequests:[{resourceId:"iron_ore",quantity:20,remainingQuantity:20,status:"IN_TRANSIT",supplierCountryId:"AUS"}]}}
  }};
  globalThis.OmegaCountryInventoryRuntime = {getResourceCatalog(){return resources;}};
  globalThis.OmegaResourceIndustrialCatalogData = {resourceRules:{}};
  globalThis.OmegaCountryRuntimeData = {resolveCountry(code){
    return code==="AUS" ? {countryCode:"AU",iso3:"AUS",name:"Australia",officialName:"Commonwealth of Australia"} : null;
  }};
  globalThis.OmegaResourceStartupBaseline = null;
  try {
    const result = api.render(root,{countryId:"BGD",sites:[],tab:"inventory"});
    assert.equal(result.ok,true);
    assert.match(root.innerHTML,/data-omega-v2-raw-resource-inventory/);
    assert.match(root.innerHTML,/data-resource-id="coal"/);
    assert.match(root.innerHTML,/Current stock/);
    assert.match(root.innerHTML,/Daily demand/);
    const coalCard = root.innerHTML.slice(root.innerHTML.indexOf('data-resource-id="coal"'), root.innerHTML.indexOf('data-resource-id="coal"') + 1400);
    const orderedFields = [
      coalCard.indexOf('omega-v2-resource-icon-image'),
      coalCard.indexOf('<h3>Coal</h3>'),
      coalCard.indexOf('Current stock'),
      coalCard.indexOf('Daily demand'),
      coalCard.indexOf('<strong>Status</strong>'),
      coalCard.indexOf('Supply source')
    ];
    assert.ok(orderedFields.every((value) => value >= 0));
    assert.deepEqual(orderedFields, orderedFields.slice().sort((a, b) => a - b),
      "resource icon, name, current stock, demand, status and supply source must render in the requested order");
    assert.match(root.innerHTML,/125(?:\.00)? TONNES/);
    assert.match(root.innerHTML,/25(?:\.00)? [A-Z ]+PER DAY/i);
    assert.match(root.innerHTML,/Domestic mine/);
    assert.match(root.innerHTML,/Foreign import/);
    assert.match(root.innerHTML,/\(Australia\)/);
    assert.match(root.innerHTML,/Opening allocation/);
    assert.match(root.innerHTML,/41 resource identities/);
    assert.match(root.innerHTML,/Shortage/);
    assert.match(root.innerHTML,/data-omega-v2-processed-goods-inventory/);
    assert.match(root.innerHTML,/Processed Goods Warehouse/);
    assert.match(root.innerHTML,/Steel/);
    assert.match(root.innerHTML,/900(?:\.00)? TONNES/);
    const rawSection = root.innerHTML.slice(root.innerHTML.indexOf('data-omega-v2-raw-resource-inventory'),root.innerHTML.indexOf('data-omega-v2-processed-goods-inventory'));
    assert.doesNotMatch(rawSection,/data-product-id="steel"|900(?:\.00)? TONNES/,
      "finished-goods stock must never appear in the natural-resource inventory");
    assert.match(root.innerHTML,/Factory-held input/);
    assert.match(root.innerHTML,/Bangladesh Steel Works/);
    assert.match(root.innerHTML,/12(?:\.00)? TONNES/,
      "factory-held raw input must remain in its separate factory-owned section");
    const dashboard = api.render(root,{countryId:"BGD",sites:[],tab:"dashboard"});
    assert.equal(dashboard.ok,true);
    assert.match(root.innerHTML,/Raw Resource Inventory/);
    assert.match(root.innerHTML,/Processed Goods Warehouse/);
  } finally {
    api.unload(root);
    if(prior.Game===undefined)delete globalThis.Game;else globalThis.Game=prior.Game;
    if(prior.inventory===undefined)delete globalThis.OmegaCountryInventoryRuntime;else globalThis.OmegaCountryInventoryRuntime=prior.inventory;
    if(prior.catalog===undefined)delete globalThis.OmegaResourceIndustrialCatalogData;else globalThis.OmegaResourceIndustrialCatalogData=prior.catalog;
    if(prior.country===undefined)delete globalThis.OmegaCountryRuntimeData;else globalThis.OmegaCountryRuntimeData=prior.country;
    if(prior.startup===undefined)delete globalThis.OmegaResourceStartupBaseline;else globalThis.OmegaResourceStartupBaseline=prior.startup;
  }
});


test("Resource Ministry logistics manifest and country-shard requests are time-bounded and retryable", async () => {
  const vm = await import("node:vm");
  const requested = [];
  const timers = new Map();
  let nextTimerId = 1;
  let manifestCalls = 0;
  let shardCalls = 0;
  const sandbox = {
    AbortController,
    setTimeout(callback) {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      const name = String(url).replace(/^\.\//, "");
      requested.push(name);
      if (name === "resource_site_logistics_routes_v1.json") {
        manifestCalls += 1;
        if (manifestCalls === 1) return new Promise(() => {});
        return Promise.resolve({ ok:true, json:async () => ({
          datasetId:"OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1",
          simulationOnly:true,
          countryToPart:{ TST:1 },
          parts:[{ part:1, file:"resource_site_logistics_routes_v1_part_01.json" }]
        }) });
      }
      if (name === "resource_site_logistics_routes_v1_part_01.json") {
        shardCalls += 1;
        if (shardCalls === 1) return new Promise(() => {});
        return Promise.resolve({ ok:true, json:async () => ({ routes:[] }) });
      }
      return Promise.reject(new Error("Unexpected route request: " + name));
    }
  };
  sandbox.window = sandbox;
  vm.default.createContext(sandbox);
  vm.default.runInContext(read("omega_ui_v2/screens/resource-ministry.js"), sandbox, {
    filename:"omega_ui_v2/screens/resource-ministry.js"
  });
  sandbox.Game = { state:{ simulation:{ turn:1, session:{ playerCountryId:"TST" } }, resource:{ TST:{
    mineAssets:[],
    industrialNetwork:{ projects:[], shipments:[], siteFlowLedger:[] },
    warehouse:{ availableByResource:{} },
    processedWarehouse:{ availableByResource:{} },
    inventory:{},
    inventoryLedger:[]
  } } } };
  const api = sandbox.OmegaUIV2ResourceMinistry;
  const makeRoot = () => ({
    innerHTML:"",
    classList:{ add(){} },
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    contains(){ return true; }
  });
  const flush = async () => {
    for (let attempt=0; attempt<8; attempt++) await new Promise(resolve => setImmediate(resolve));
  };
  const expireNextTimer = () => {
    const entry = timers.entries().next().value;
    assert.ok(entry, "a pending route request must always have a timeout");
    timers.delete(entry[0]);
    entry[1]();
  };

  const manifestRoot = makeRoot();
  api.render(manifestRoot, { countryId:"TST", sites:[], tab:"logistics" });
  await flush();
  assert.equal(manifestCalls, 1);
  assert.ok(requested.includes("resource_site_logistics_routes_v1.json"));
  expireNextTimer();
  await flush();
  assert.equal(timers.size, 0, "timed-out manifest requests must release their timer");
  assert.ok(manifestRoot.innerHTML.length > 0, "the Logistics screen remains rendered after a route manifest timeout");
  api.unload(manifestRoot);

  const shardRoot = makeRoot();
  api.render(shardRoot, { countryId:"TST", sites:[], tab:"logistics" });
  await flush();
  assert.equal(manifestCalls, 2, "a failed shared manifest request must be cleared so a later visit can retry");
  assert.equal(shardCalls, 1, "the selected country's route shard should start after the manifest succeeds");
  expireNextTimer();
  await flush();
  assert.equal(timers.size, 0, "timed-out country shards must release their timer");
  assert.ok(shardRoot.innerHTML.length > 0, "the Logistics screen remains rendered after a shard timeout");
  api.unload(shardRoot);

  const retryRoot = makeRoot();
  api.render(retryRoot, { countryId:"TST", sites:[], tab:"logistics" });
  await flush();
  assert.equal(shardCalls, 2, "a timed-out country shard must be fetched again on the next Logistics visit");
  assert.equal(timers.size, 0, "successful route requests must clear their timeout handles");
  assert.ok(retryRoot.innerHTML.length > 0);
  api.unload(retryRoot);
});


test("Resource Ministry coalesces runtime event bursts into one in-place refresh and cancels it on unload", async () => {
  const vm = await import("node:vm");
  const timers = new Map();
  const globalListeners = Object.create(null);
  let nextTimer = 1;
  let writes = 0;
  let html = "";
  let deferredNavigationCalls = 0;
  const sandbox = {
    AbortController,
    OmegaResourceIndustrialCatalogData: json("resource_industrial_catalog_v1.json"),
    setTimeout(callback, delay) {
      assert.equal(delay, 350, "runtime event bursts must share one bounded refresh window");
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, callback) {
      (globalListeners[type] || (globalListeners[type] = [])).push(callback);
    },
    removeEventListener(type, callback) {
      globalListeners[type] = (globalListeners[type] || []).filter((fn) => fn !== callback);
    }
  };
  sandbox.window = sandbox;
  vm.default.createContext(sandbox);
  vm.default.runInContext(read("omega_ui_v2/screens/resource-ministry.js"), sandbox, {
    filename:"omega_ui_v2/screens/resource-ministry.js"
  });
  sandbox.Game = { state:{
    simulation:{ turn:1, session:{ playerCountryId:"TST" } },
    resource:{ TST:{
      inventory:{ coal:10 }, inventoryUnits:{ coal:"TONNES" },
      mineAssets:[],
      industrialNetwork:{ projects:[], shipments:[], siteFlowLedger:[] },
      warehouse:{ availableByResource:{ coal:10 } },
      processedWarehouse:{ availableByResource:{} },
      inventoryLedger:[]
    } }
  } };
  const root = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = String(value); writes += 1; },
    classList:{ add(){} },
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    contains(){ return true; }
  };
  const api = sandbox.OmegaUIV2ResourceMinistry;
  const options = {
    countryId:"TST", sites:[], tab:"inventory",
    onScheduleRender() { deferredNavigationCalls += 1; }
  };
  try {
    api.render(root, options);
    const initialWrites = writes;
    const emit = (name, detail) => {
      for (const callback of globalListeners[name] || []) callback({ type:name, detail:detail || {} });
    };

    emit("OMEGA_RESOURCE_MINE_PROJECT_PROGRESS", { countryId:"TST" });
    assert.equal(timers.size, 0,
      "mine-project progress must not rebuild an unrelated Inventory tab");

    emit("OMEGA_RESOURCE_INVENTORY_CHANGED", { countryId:"USA" });
    assert.equal(timers.size, 0,
      "updates belonging to a different country must not refresh the player inventory");

    for (let i=0;i<40;i+=1) {
      emit(i%2 ? "OMEGA_RESOURCE_INVENTORY_CHANGED" : "OMEGA_RESOURCE_CONSUMPTION_COMPLETED",
        { countryId:"TST" });
    }
    assert.equal(timers.size, 1,
      "a burst of gameplay events must schedule exactly one screen refresh");
    assert.equal(writes, initialWrites,
      "runtime events must not synchronously replace the live screen with a loading panel");
    assert.equal(deferredNavigationCalls, 0,
      "data refreshes must not enter the navigation progress/cancellation pipeline");

    sandbox.Game.state.resource.TST.inventory.coal = 25;
    const [timerId, refresh] = timers.entries().next().value;
    timers.delete(timerId);
    refresh();
    assert.equal(writes, initialWrites + 1,
      "the complete event burst must cause only one in-place DOM render");
    assert.equal(deferredNavigationCalls, 0);
    assert.equal(root.__omegaV2ResourceRefreshTimer, null);

    emit("OMEGA_RESOURCE_INVENTORY_CHANGED", { countryId:"TST" });
    assert.equal(timers.size, 1);
    api.unload(root);
    assert.equal(timers.size, 0,
      "leaving Resource Ministry must cancel a queued refresh instead of leaving background UI work");
    assert.equal(root.__omegaV2ResourceRefreshTimer, null);
  } finally {
    api.unload(root);
  }
});
