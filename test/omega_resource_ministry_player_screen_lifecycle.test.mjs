import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../omega_ui_v2/screens/resource-ministry.js";

const rootPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => fs.readFileSync(path.join(rootPath, file), "utf8");
const json = (file) => JSON.parse(read(file));

test("Resource Ministry waits for the selected player's inventory, then renders only that country's stock", async () => {
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
  assert.equal(resources.length, 41, "the canonical raw-resource catalogue remains complete");

  const priorGame = globalThis.Game;
  const priorInventory = globalThis.OmegaCountryInventoryRuntime;
  const priorBaseline = globalThis.OmegaResourceStartupBaseline;
  const priorIndustrial = globalThis.OmegaResourceIndustrialCatalogData;
  const priorAddEvent = globalThis.addEventListener;
  const priorRemoveEvent = globalThis.removeEventListener;
  const globalBindings = new Map();
  const localBindings = new Map();
  let completeBaseline;
  let inventoryInitCalls = 0;
  let baselineCalls = 0;

  globalThis.addEventListener = (type, handler) => {
    const rows = globalBindings.get(type) || new Set();
    rows.add(handler);
    globalBindings.set(type, rows);
  };
  globalThis.removeEventListener = (type, handler) => {
    const rows = globalBindings.get(type);
    if (rows) rows.delete(handler);
  };

  const screenRoot = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, handler) {
      const rows = localBindings.get(type) || new Set();
      rows.add(handler);
      localBindings.set(type, rows);
    },
    removeEventListener(type, handler) {
      const rows = localBindings.get(type);
      if (rows) rows.delete(handler);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };

  globalThis.Game = {
    state: {
      simulation: { turn: 7, session: { playerCountryId: "BGD", status: "RUNNING" } },
      resource: {
        BGD: {
          inventory: { coal: 125, iron_ore: 42 },
          inventoryUnits: { coal: "TONNES", iron_ore: "TONNES" },
          batches: [],
          warehouse: { warehouseId: "WH-BGD-RAW", availableByResource: {}, receipts: [], storedBatchIds: [] },
          processedWarehouse: { warehouseId: "WH-BGD-PROCESSED", availableByResource: {}, receipts: [], storedBatchIds: [] },
          mineAssets: [],
          industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] },
          inventoryLedger: []
        },
        USA: {
          inventory: { coal: 999999, iron_ore: 888888 },
          inventoryUnits: { coal: "TONNES", iron_ore: "TONNES" },
          batches: [],
          warehouse: { availableByResource: {} },
          processedWarehouse: { availableByResource: {} },
          mineAssets: [],
          industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] }
        }
      }
    }
  };
  globalThis.OmegaCountryInventoryRuntime = {
    init() {
      inventoryInitCalls += 1;
      return Promise.resolve({ status: "READY" });
    },
    getResourceCatalog() { return resources; }
  };
  globalThis.OmegaResourceStartupBaseline = {
    getResourceCatalog() { return resources; },
    getFactoryInputCoverageDays() { return 100; },
    ensureCurrentSession() {
      baselineCalls += 1;
      return new Promise((resolve) => { completeBaseline = resolve; });
    }
  };
  globalThis.OmegaResourceIndustrialCatalogData = { resourceRules: {} };

  try {
    const first = api.render(screenRoot, { countryId: "USA", sites: [], tab: "inventory" });
    assert.equal(first.code, "RESOURCE_SCREEN_LOADING");
    assert.equal(first.countryId, "BGD", "the requested view cannot switch away from the active player country");
    assert.match(screenRoot.innerHTML, /Loading player country resources/);
    assert.doesNotMatch(screenRoot.innerHTML, /USA|999999/);
    await Promise.resolve();
    assert.equal(inventoryInitCalls, 1, "inventory initialization starts on Resource Ministry entry");
    assert.equal(baselineCalls, 1, "the player-only startup baseline is awaited on entry");
    assert.equal(typeof completeBaseline, "function");

    completeBaseline({ status: "COMPLETED" });
    await screenRoot.__omegaV2ResourceScreenSession.promise;

    assert.match(screenRoot.innerHTML, /Raw resource types/);
    assert.match(screenRoot.innerHTML, /<strong>41<\/strong>/);
    assert.match(screenRoot.innerHTML, /Coal/);
    assert.match(screenRoot.innerHTML, /125(?:\.00)? TONNES/);
    assert.match(screenRoot.innerHTML, /Iron Ore/);
    assert.doesNotMatch(screenRoot.innerHTML, /999999|888888|Browse resource country/);
    assert.doesNotMatch(screenRoot.innerHTML, /data-omega-v2-resource-country/,
      "Resource Ministry must not offer a second-country inventory selector");

    const session = screenRoot.__omegaV2ResourceScreenSession;
    assert.ok(session && session.active);
    assert.ok(localBindings.size > 0, "screen-owned controls are wired while the screen is active");
    assert.ok(globalBindings.size > 0, "resource runtime events are observed only while this screen is active");

    api.deactivate(screenRoot);
    assert.equal(session.controller.signal.aborted, true, "screen-owned requests are cancelled on exit");
    assert.equal(screenRoot.__omegaV2ResourceScreenSession, undefined);
    assert.equal(screenRoot.innerHTML, "", "screen-specific rendered data is cleared on exit");
    assert.equal([...localBindings.values()].reduce((sum, rows) => sum + rows.size, 0), 0,
      "screen-owned DOM listeners are removed on exit");
    assert.equal([...globalBindings.values()].reduce((sum, rows) => sum + rows.size, 0), 0,
      "global listeners captured by the screen are removed on exit");
  } finally {
    api.deactivate(screenRoot);
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorInventory === undefined) delete globalThis.OmegaCountryInventoryRuntime;
    else globalThis.OmegaCountryInventoryRuntime = priorInventory;
    if (priorBaseline === undefined) delete globalThis.OmegaResourceStartupBaseline;
    else globalThis.OmegaResourceStartupBaseline = priorBaseline;
    if (priorIndustrial === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = priorIndustrial;
    if (priorAddEvent === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = priorAddEvent;
    if (priorRemoveEvent === undefined) delete globalThis.removeEventListener; else globalThis.removeEventListener = priorRemoveEvent;
  }
});

test("UI navigation explicitly unloads Resource Ministry when its route closes", () => {
  const app = read("omega_ui_v2/app.js");
  assert.match(app, /previousRoute === 'resources' && nextRoute !== 'resources'/);
  assert.match(app, /resourceScreen\.deactivate\(resourceRoot\)/);
  assert.match(app, /resourceScreen\.deactivate\(activeMain\)/,
    "unmounting the UI also releases the active resource screen");
});
