import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('supplemental sites commission through the existing country resource runtime without promoting source facts', async () => {
  const gameState = { simulation: { turn: 7 }, resource: {} };
  const registered = [];
  const hydrated = [];
  const original = {
    registerSupplementalSiteCatalog(rows) {
      registered.splice(0, registered.length, ...rows.map(row => structuredClone(row)));
      return { status: 'READY', registeredCount: rows.length };
    },
    async hydrateCountry(countryId) {
      hydrated.push(countryId);
      return { status: 'APPLIED', countryId };
    }
  };
  const sites = [
    {
      siteId: 'GLOBAL_DEP_CHL_copper_test_deposit', sourceType: 'GLOBAL_MINERAL_OCCURRENCE',
      countryId: 'CHL', siteName: 'Test Copper Occurrence',
      identity: { countryIso3: 'CHL', resourceTypeId: 'copper' },
      real: { resourceId: 'copper', operationStatus: 'UNKNOWN' },
      coordinates: { lat: -22, lng: -69 }, location: { coordinates: { lat: -22, lng: -69 } },
      operation: { status: 'UNKNOWN', commercialExtraction: false },
      sourceSiteRecord: { sourceDataset: 'TEST_SOURCE', upstreamRecordId: 'MIN-1' }
    },
    {
      siteId: 'GLOBAL_DEP_CHL_gold_unlocated', sourceType: 'GLOBAL_MINERAL_OCCURRENCE',
      countryId: 'CHL', siteName: 'Unlocated Gold Occurrence',
      identity: { countryIso3: 'CHL', resourceTypeId: 'gold' },
      real: { resourceId: 'gold' }, coordinates: null,
      location: { coordinateStatus: 'MISSING_UPSTREAM_COORDINATES' },
      operation: { status: 'UNKNOWN', commercialExtraction: false }
    },
    {
      siteId: 'GLOBAL_DEP_UNRESOLVED_countryless', sourceType: 'GLOBAL_MINERAL_OCCURRENCE',
      countryId: null, siteName: 'Unassigned Deposit',
      identity: { countryIso3: null, resourceTypeId: 'copper' },
      real: { resourceId: 'copper' }, coordinates: { lat: 0, lng: 0 },
      operation: { status: 'UNKNOWN', commercialExtraction: false }
    }
  ];
  const context = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, JSON, Date,
    structuredClone, Game: { state: gameState }, Omega: { ResourceEndowmentRuntime: original },
    OmegaResourceEndowmentRuntime: original, addEventListener() {},
    document: { getElementById() { return null; } }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('omega_resource_supplemental_site_commissioning_v1.js'), context);

  const runtime = context.Omega.ResourceEndowmentRuntime;
  runtime.registerSupplementalSiteCatalog(sites);
  assert.equal(registered.length, 3, 'all source rows are passed to the same supplemental registration API');
  assert.equal(registered[0].operation.commercialExtraction, false, 'mineral occurrence is not auto-promoted into a real active mine');

  context.Omega.IndividualResourceSiteBinding = { sites };
  const blockedCountry = await runtime.commissionSupplementalSite(sites[2].siteId);
  const blockedCoordinates = await runtime.commissionSupplementalSite(sites[1].siteId);
  assert.equal(blockedCountry.reason, 'UNRESOLVED_COUNTRY_IDENTITY');
  assert.equal(blockedCoordinates.reason, 'MISSING_UPSTREAM_COORDINATES');

  const result = await runtime.commissionSupplementalSite(sites[0].siteId);
  assert.equal(result.status, 'COMMISSIONED_SIMULATION');
  assert.equal(result.countryId, 'CHL');
  assert.equal(hydrated.at(-1), 'CHL', 'commissioning rehydrates the exact sovereign country runtime');
  assert.equal(gameState.resource.CHL.siteCommissioning[sites[0].siteId].authority, 'GAMEPLAY_SIMULATION');
  const commissioned = registered.find(row => row.siteId === sites[0].siteId);
  const untouched = registered.find(row => row.siteId === sites[1].siteId);
  assert.equal(commissioned.operation.commercialExtraction, true, 'only player-commissioned site becomes simulation-operational');
  assert.equal(commissioned.operation.extractionEligibility, 'SIMULATION_COMMISSIONED');
  assert.equal(untouched.operation.commercialExtraction, false, 'other site identities retain their own independent lifecycle');
  assert.equal(commissioned.sourceSiteRecord.upstreamRecordId, 'MIN-1', 'source provenance survives commissioning');
});

test('commissioning bridge is loaded after Endowment and before the individual-site UI', () => {
  const html = read('index.html');
  const endowment = html.indexOf('src="omega_resource_endowment_runtime.js"');
  const bridge = html.indexOf('src="omega_resource_supplemental_site_commissioning_v1.js"');
  const binding = html.indexOf('src="omega_resource_gameplay_binding_v1.js"');
  assert.ok(endowment >= 0 && bridge > endowment && binding > bridge, 'the wrapper must install before the UI registers global sites');
});
