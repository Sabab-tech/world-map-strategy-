import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const canonical = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const notApplicable = (canonical.sites || []).filter(row =>
  String(row?.operation?.status || row?.operation?.operationalStatus || row?.status || '').toUpperCase() === 'NOT_APPLICABLE'
);
assert.equal(notApplicable.length, 4, 'the canonical registry must retain four explicit non-applicable country coverage records');
assert.deepEqual(notApplicable.map(row => row.countryId).sort(), ['LIE','MCO','SMR','VAT']);

const sandbox = {
  console,
  OmegaResourceSiteCanonicalCatalogData: { datasetId: 'TEST_CANONICAL_REGISTRY', sites: notApplicable }
};
sandbox.Omega = { ResourceSiteCanonicalCatalogData: sandbox.OmegaResourceSiteCanonicalCatalogData };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(read('omega_ui_v2/screens/resource-ministry.js'), {
  filename: 'omega_ui_v2/screens/resource-ministry.js'
}).runInContext(sandbox);

const api = sandbox.OmegaUIV2ResourceMinistry;
assert.ok(api && typeof api.buildViewModel === 'function', 'resource ministry view model must be available');
const model = api.buildViewModel({});
assert.equal(model.siteCount, 4, 'resource ministry must not filter out records with no commodity identity');
assert.deepEqual(model.sites.map(row => row.countryId).sort(), ['LIE','MCO','SMR','VAT']);
for (const item of model.sites) {
  assert.equal(item.resourceId, 'NOT_APPLICABLE', item.siteId + ': show an explicit non-resource category label');
  assert.equal(item.notApplicable, true, item.siteId + ': UI must mark the row as non-applicable');
  assert.equal(item.status, 'NOT_APPLICABLE', item.siteId + ': preserve authoritative non-applicable status');
  assert.equal(item.raw.operation.commercialExtraction, false, item.siteId + ': do not enable commercial extraction');
  assert.equal(item.raw.runtime.pipeline.extractionExecutable, false, item.siteId + ': do not enable runtime extraction');
  assert.equal(item.raw.simulation.productionRate, undefined, item.siteId + ': do not invent a production rate');
  assert.equal(item.raw.simulation.reserve, undefined, item.siteId + ': do not invent a reserve');
}
const modeledSite = {
  siteId: 'SITE_TEST_SIMULATED_GOLD_MINE',
  countryId: 'UZB',
  siteName: 'Test Simulated Gold Mine',
  resourceId: 'gold',
  operation: { status: 'SIMULATED_ACTIVE', commercialExtraction: true },
  quantitative: {
    reserve: { quantity: null, unit: null, status: 'UNOBSERVED' },
    production: { rate: null, annual: null, unit: null, status: 'UNOBSERVED' }
  },
  simulation: {
    simulationOnly: true,
    productionRate: 125,
    productionRateUnit: 'TONNES_PER_DAY',
    pipelineProfileAuthority: 'SIMULATION_ONLY_RUNTIME_COMPLETION'
  }
};
const modeledModel = api.buildViewModel({ sites: [modeledSite] });
assert.equal(modeledModel.siteCount, 1);
assert.equal(modeledModel.sites[0].production.value, null, 'modelled output must not replace the measured production field');
assert.equal(modeledModel.sites[0].modeledProduction.modeledValue, 125, 'gameplay rate must be visible separately');
assert.equal(modeledModel.sites[0].modeledProduction.unit, 'TONNES_PER_DAY');
assert.equal(modeledModel.sites[0].modeledProduction.status, 'SIMULATED');
const screenSource = read('omega_ui_v2/screens/resource-ministry.js');
assert.ok(screenSource.includes('Modeled gameplay rate'), 'the Mines & Fields card must expose its separate simulation rate');
assert.ok(screenSource.includes('No verified commercial mining site is registered for this country'),
  'N/A cards must state why no production is possible');
assert.ok(screenSource.includes('No physical mine marker exists for this record.'),
  'N/A records must not offer a functional map-lookup action');
console.log(JSON.stringify({
  certificate: 'OMEGA-RESOURCE-MINISTRY-NOT-APPLICABLE-SITE-VISIBILITY',
  status: 'PASS',
  visibleNonApplicableCountryRecords: model.siteCount,
  extractableNonApplicableRecords: 0,
  modeledReservesInvented: false,
  modeledProductionRatesInvented: false
}, null, 2));
