import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const json = name => JSON.parse(read(name));
const canonical = json('resource_site_canonical_catalog_v1.json');
const reserve = json('resource_site_reserve_simulation_v1.json');
const mineplayBase = json('resource_site_country_mineplay_batch_20261020_v1.json');
const mineplayExpanded = json('resource_site_country_mineplay_batch_20261024_v1.json');
const legacyPacks = [1,2,3,4,5,6].map(n => json('resource_site_legacy_gameplay_expansion_part_' + n + '_v1.json'));

const aliasMap = {
  SITE_AUS_olympic_dam_uranium_copper: 'SITE_AUS_olympic_dam_mine',
  SITE_BRA_carajas_iron_ore_mine_legacy2: 'SITE_BRA_carajas_iron_ore_mine',
  SITE_CHL_escondida_copper_mine_legacy2: 'SITE_CHL_escondida_copper_mine',
  SITE_IDN_grasberg_copper_gold_mine: 'SITE_IDN_grasberg_mine',
  SITE_COD_tenke_fungurume_copper_cobalt_complex: 'SITE_COD_tenke_fungurume_mine',
  SITE_COD_kibali_gold_mine_complex: 'SITE_COD_kibali_gold_mine',
  SITE_CAN_voiseys_bay_nickel_mine: 'SITE_CAN_voisey_s_bay_nickel_mine',
  SITE_GBR_boulby_mine: 'SITE_GBR_boulby_potash_mine',
  SITE_SWE_kiruna_iron_ore_mine: 'SITE_SWE_kiruna_iron_mine',
  SITE_PRK_musan_iron_ore_mine: 'SITE_PRK_musan_iron_mine'
};
const normalizeCountry = row => String(row?.countryId || row?.identity?.countryIso3 || row?.countryCode || row?.location?.countryBoundaryKey || '').trim().toUpperCase();
const siteId = row => String(row?.siteId || row?.id || '').trim();
const coordsValid = row => {
  const c = row?.location?.coordinates || {};
  return Number.isFinite(Number(c.lat)) && Number(c.lat) >= -90 && Number(c.lat) <= 90 &&
    Number.isFinite(Number(c.lng)) && Number(c.lng) >= -180 && Number(c.lng) <= 180;
};

// Reproduce the production loader's additive source merge, including identity and alias guards.
const registryById = new Map();
for (const row of canonical.sites) registryById.set(siteId(row), row);
const ids = new Set(registryById.keys());
const legacyRows = new Map();
for (const pack of legacyPacks.sort((a,b) => Number(a.part) - Number(b.part))) {
  for (const row of pack.records || []) if (siteId(row) && !legacyRows.has(siteId(row))) legacyRows.set(siteId(row), row);
}
for (const row of legacyRows.values()) {
  const id = siteId(row), country = normalizeCountry(row);
  if (!id || row.runtime?.aliasOfSiteId || row.map?.aliasOfSiteId || aliasMap[id] ||
      ids.has(id) || !/^[A-Z]{3}$/.test(country) || !coordsValid(row)) continue;
  ids.add(id);
  registryById.set(id, row);
}
const mineplayUnique = new Map();
for (const row of [...(mineplayBase.records || []), ...(mineplayExpanded.records || [])]) {
  if (siteId(row)) mineplayUnique.set(siteId(row), row);
}
for (const row of mineplayUnique.values()) {
  const id = siteId(row), country = normalizeCountry(row);
  if (!id || row.runtime?.aliasOfSiteId || row.map?.aliasOfSiteId ||
      row.map?.markerEligible === false || ids.has(id) ||
      !/^[A-Z]{3}$/.test(country) || !coordsValid(row)) continue;
  ids.add(id);
  registryById.set(id, row);
}

const context = vm.createContext({
  console, Math, Number, String, Object, Array, Set, Map, WeakMap, JSON, Date,
  Intl, globalThis: null
});
context.globalThis = context;
new vm.Script(read('omega_resource_site_integrity_v1.js'), {
  filename: 'omega_resource_site_integrity_v1.js'
}).runInContext(context);
const integrity = context.Omega.ResourceSiteIntegrity;
assert.equal(typeof integrity.buildSimulationPipelineProfile, 'function',
  'unified site simulation pipeline profile builder must be exported');

const rows = [...registryById.values()].map(source => {
  const normalized = integrity.normalizeSiteRecord(source);
  return integrity.buildSimulationPipelineProfile(normalized, { aliasMap, year: 2026 });
});
assert.equal(rows.length, 514, 'single runtime registry must retain canonical plus additive records without duplicate IDs');
assert.equal(new Set(rows.map(siteId)).size, rows.length, 'runtime site IDs must remain unique');

const aliases = rows.filter(row => integrity.isAlias(row, aliasMap));
const physical = rows.filter(row => !integrity.isAlias(row, aliasMap));
assert.equal(physical.length, 503, 'all 503 unique physical site records must be in the unified registry');
assert.equal(aliases.length, 11, 'known aliases remain references and never become a second producing site');
assert.equal(physical.filter(row => row.operation?.commercialExtraction === true).length, 492,
  'commercially eligible site count must remain explicit and stable');

const notApplicable = physical.filter(row =>
  String(row.operation?.status || row.operation?.operationalStatus || '').toUpperCase() === 'NOT_APPLICABLE');
assert.deepEqual(notApplicable.map(row => row.countryId).sort(), ['LIE','MCO','SMR','VAT'],
  'the four no-commercial-mining country records must stay in the unified registry');
for (const row of notApplicable) {
  assert.equal(row.operation.commercialExtraction, false, row.siteId + ': N/A must never become extractable');
  assert.equal(row.runtime.pipeline.extraction, 'NOT_APPLICABLE', row.siteId + ': N/A pipeline classification');
  assert.equal(row.runtime.pipeline.extractionExecutable, false, row.siteId + ': N/A must not emit production');
  assert.notEqual(row.simulation.pipelineProfileStatus, 'READY', row.siteId + ': N/A cannot receive a fake mine profile');
  assert.equal(row.simulation.productionRate, undefined, row.siteId + ': no resource means no simulated output rate');
  assert.equal(row.simulation.reserve?.quantity, undefined, row.siteId + ': no resource means no simulated reserve');
}

const resourceRows = physical.filter(row => row.resourceId && row.resourceId !== 'unknown');
assert.equal(resourceRows.length, 499, 'all resource-classified sites must have a commodity identity');
assert.equal(new Set(resourceRows.map(row => String(row.resourceId).toLowerCase())).size, 41,
  'the resource system must preserve all 41 registered resource types');
for (const row of resourceRows) {
  const country = row.countryId, resourceId = String(row.resourceId).toLowerCase();
  const sim = row.simulation || {}, runtime = row.runtime || {}, pipeline = runtime.pipeline || {};
  assert.equal(sim.pipelineProfileStatus, 'READY', row.siteId + ': simulation pipeline profile status');
  assert.equal(sim.pipelineProfileAuthority, 'SIMULATION_ONLY_RUNTIME_COMPLETION',
    row.siteId + ': generated values must remain simulation-only');
  assert.equal(sim.simulationOnly, true, row.siteId + ': scenario fields must be labelled simulated');
  assert.equal(sim.pipelineProfile?.sourceSiteId, row.siteId, row.siteId + ': profile source identity');
  assert.equal(sim.pipelineProfile?.countryId, country, row.siteId + ': profile country binding');
  assert.equal(sim.pipelineProfile?.resourceId, resourceId, row.siteId + ': profile resource binding');

  assert.equal(sim.reserve?.status, 'SIMULATED', row.siteId + ': simulated reserve status');
  assert.ok(Number(sim.reserve?.quantity) > 0, row.siteId + ': positive simulated reserve');
  assert.ok(String(sim.reserve?.unit || '').length > 0, row.siteId + ': reserve unit');
  assert.ok(Number(sim.productionRate) > 0, row.siteId + ': simulated daily rate');
  assert.ok(String(sim.productionRateUnit || '').length > 0, row.siteId + ': production rate unit');
  assert.ok(Number(sim.annualProduction) > 0, row.siteId + ': annual production');
  assert.ok(String(sim.annualProductionUnit || '').length > 0, row.siteId + ': annual production unit');
  assert.ok(Number(sim.nominalDailyCapacity) > 0, row.siteId + ': nominal capacity');
  assert.ok(Number(sim.minimumDailyCapacity) > 0 && Number(sim.minimumDailyCapacity) <= Number(sim.nominalDailyCapacity),
    row.siteId + ': minimum <= nominal capacity');
  assert.ok(Number(sim.maximumDailyCapacity) >= Number(sim.nominalDailyCapacity), row.siteId + ': nominal <= maximum capacity');
  const gradeValue = typeof sim.grade === 'object' ? sim.grade?.value : sim.grade;
  const purityValue = typeof sim.purity === 'object' ? sim.purity?.value : sim.purity;
  const throughputValue = typeof sim.throughput === 'object' ? sim.throughput?.value : sim.throughput;
  assert.ok(Number(gradeValue) > 0, row.siteId + ': explicit simulated grade/quality value');
  assert.ok(Number(sim.recovery) > 0, row.siteId + ': simulated recovery');
  assert.ok(Number(purityValue) > 0, row.siteId + ': simulated product purity');
  assert.ok(Number(throughputValue) > 0, row.siteId + ': simulated throughput');

  assert.equal(runtime.countryWarehouseId, 'WH-' + country + '-RAW', row.siteId + ': country-bound raw warehouse');
  assert.equal(row.logistics?.warehouseCountryId, country, row.siteId + ': logistics warehouse country');
  assert.equal(row.logistics?.warehouseSiteId, 'WH-' + country + '-RAW', row.siteId + ': logistics warehouse ID');
  assert.equal(sim.factoryBinding?.countryId, country, row.siteId + ': factory country isolation');
  assert.equal(String(sim.factoryBinding?.inputResourceId).toLowerCase(), resourceId, row.siteId + ': factory input commodity');
  assert.equal(sim.factoryBinding?.requiresSameCountryWarehouse, true, row.siteId + ': same-country factory guard');
  assert.ok(Array.isArray(sim.transportRoute) && sim.transportRoute.length > 0, row.siteId + ': route exists');
  const route = sim.transportRoute[0];
  assert.equal(route.countryId, country, row.siteId + ': route country');
  assert.equal(route.originSiteId, row.siteId, row.siteId + ': route source site');
  assert.equal(route.warehouseId, 'WH-' + country + '-RAW', row.siteId + ': route warehouse');
  assert.equal(route.factoryId, sim.factoryBinding.factoryId, row.siteId + ': route factory identity');
  assert.ok(Number(route.distanceKm) > 0, row.siteId + ': positive route distance');
  assert.ok(Number(route.estimatedTravelDays) > 0, row.siteId + ': route travel duration');
  assert.ok(Number(route.routeCapacityPerDay) >= Number(sim.productionRate), row.siteId + ': route can carry nominal rate');
  assert.equal(row.logistics?.transport?.originCountryId, country, row.siteId + ': transport origin country');
  assert.equal(row.logistics?.transport?.destinationCountryId, country, row.siteId + ': transport destination country');
  assert.equal(row.logistics?.transport?.originSiteId, row.siteId, row.siteId + ': transport origin identity');

  assert.equal(pipeline.site, 'BOUND', row.siteId + ': shared pipeline site binding');
  assert.equal(pipeline.batch, 'SITE_ID_KEYED', row.siteId + ': shared batch identity');
  assert.equal(pipeline.rawWarehouse, 'BOUND_TO_OWNER_COUNTRY', row.siteId + ': shared warehouse stage');
  assert.equal(pipeline.transport, 'SIMULATED_STRATEGIC_ROUTE_READY', row.siteId + ': shared transport stage');
  assert.equal(pipeline.factory, 'SITE_AND_COUNTRY_BOUND', row.siteId + ': shared factory stage');
  assert.equal(pipeline.processing, 'RESOURCE_SPECIFIC_SIMULATED_PROCESS', row.siteId + ': shared processing stage');
  assert.equal(pipeline.output, 'SIMULATED_PRODUCT_STREAM', row.siteId + ': shared output stage');
  assert.equal(pipeline.economy, 'COUNTRY_ISOLATED_SIMULATED_OUTPUT', row.siteId + ': shared economy stage');
  if (row.operation?.commercialExtraction === false) {
    assert.equal(pipeline.extractionExecutable, false, row.siteId + ': non-commercial record must remain gated');
  }
}

const integrityReport = integrity.auditRegistry(rows, { aliasMap });
assert.equal(integrityReport.status, 'PASS', JSON.stringify(integrityReport.errors.slice(0, 10)));
assert.equal(integrityReport.siteCount, rows.length);
console.log(JSON.stringify({
  certificate: 'OMEGA-UNIFIED-RESOURCE-SITE-PIPELINE-PROFILE',
  status: 'PASS',
  runtimeRecords: rows.length,
  uniquePhysicalSites: physical.length,
  simulatedPipelineProfiles: resourceRows.length,
  resourceTypeCount: new Set(resourceRows.map(row => String(row.resourceId).toLowerCase())).size,
  commercialSitesEligible: physical.filter(row => row.operation?.commercialExtraction === true).length,
  aliases: aliases.length,
  nonApplicable: notApplicable.length
}, null, 2));
