import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const manifest = JSON.parse(read('resource_site_verified_legacy_restoration_v1.json'));
const catalog = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const master = JSON.parse(read('resource_site_master_registry_v1.json'));
const reserves = JSON.parse(read('resource_site_reserve_simulation_v1.json'));
const archive = JSON.parse(read('resource_site_legacy_map_recovery_candidates_v1.json'));
const synthesized = JSON.parse(read('resource_site_legacy_profile_marker_reconstruction_v1.json'));
const scenarioSource = read('omega_resource_scenario_engineering_data_v1.js');
const match = scenarioSource.match(/const DATA=(\{[\s\S]*?\});\s*g\.OmegaResourceScenarioEngineeringData/);
assert(match, 'scenario DATA block must remain parseable');
const scenario = JSON.parse(match[1]);

const expected = manifest.baselineCanonicalSiteCount + manifest.restoredSiteCount;
assert.equal(manifest.baselineCanonicalSiteCount, 250);
assert.equal(manifest.restoredSiteCount, 10);
assert.equal(manifest.expectedCanonicalSiteCount, expected);
assert.equal(manifest.syntheticProfileMarkersPromoted, 0);
assert.equal(manifest.historicalArchiveUnmodified, true);
assert.equal(manifest.records.length, 10);

for (const [label, data, rows] of [
  ['catalog', catalog, catalog.sites],
  ['master', master, master.sites],
  ['reserve', reserves, reserves.records],
  ['scenario', scenario, scenario.records]
]) {
  assert.equal(label === 'scenario' ? data.recordCount : data.siteCount, expected, label + ' declared count');
  assert.equal(rows.length, expected, label + ' row count');
  assert.equal(new Set(rows.map(row => row.siteId)).size, expected, label + ' unique site IDs');
}
assert.equal(reserves.commercialSiteCount, 256);
assert.equal(reserves.notApplicableSiteCount, 4);
const catalogById = new Map(catalog.sites.map(site => [site.siteId, site]));
const masterById = new Map(master.sites.map(site => [site.siteId, site]));
const reserveById = new Map(reserves.records.map(site => [site.siteId, site]));
const scenarioById = new Map(scenario.records.map(site => [site.siteId, site]));

for (const restored of manifest.records) {
  const id = restored.siteId;
  const canonical = catalogById.get(id);
  const masterSite = masterById.get(id);
  const reserve = reserveById.get(id);
  const engineered = scenarioById.get(id);
  assert(canonical && masterSite && reserve && engineered, id + ': all runtime authorities must contain this restored identity');
  assert.equal(canonical.countryId, restored.countryId);
  assert.equal(canonical.identity.countryIso3, restored.countryId);
  assert.equal(canonical.identity.resourceTypeId, restored.resourceId);
  assert.equal(masterSite.countryId, restored.countryId);
  assert.equal(masterSite.real.resourceId, restored.resourceId);
  assert.equal(reserve.countryId, restored.countryId);
  assert.equal(reserve.resourceId, restored.resourceId);
  assert.equal(engineered.countryId, restored.countryId);
  assert.equal(engineered.resourceId, restored.resourceId);
  assert.equal(canonical.operation.commercialExtraction, true);
  assert.equal(canonical.map.markerEligible, true);
  assert.equal(canonical.map.countryIsolationKey, restored.countryId);
  assert.equal(canonical.runtime.identityAuthority, 'CANONICAL_CATALOG');
  assert.equal(canonical.runtime.countryWarehouseId, 'WH-' + restored.countryId + '-RAW');
  assert.equal(reserve.reserve.status, 'SIMULATED');
  assert(Number.isFinite(reserve.reserve.quantity) && reserve.reserve.quantity > 0);
  assert.equal(reserve.provenance.authority, 'SCENARIO_SIMULATION_DATA');
  assert.equal(canonical.sourceReference.recoveryProvenance.decision, restored.decision);
  assert(canonical.sourceReference.evidence.length > 0);
  assert(canonical.sourceReference.evidence.every(item => /^https:\/\//.test(item.url)));
  assert(restored.sourceArchiveRecordIds.length > 0);
  for (const field of ['reserve','production','grade','recovery','throughput','purity','capacity']) {
    const quantitative = canonical.quantitative[field];
    assert(quantitative && typeof quantitative.status === 'string', id + ': typed ' + field);
    if (['UNOBSERVED','UNQUANTIFIED'].includes(quantitative.status)) {
      for (const key of ['value','quantity','annual','rate','nominal','minimum','maximum']) {
        if (Object.prototype.hasOwnProperty.call(quantitative, key)) assert.equal(quantitative[key], null, id + ': unknown ' + field + '.' + key + ' remains null');
      }
    }
  }
}
assert.equal(archive.records.length, 114);
assert.equal(archive.resourcesJsonDeposits.length, 62);
assert.equal(synthesized.records.length, 1095);
assert(synthesized.records.every(row => row.eligibleForCanonicalMinePipeline === false));
assert(!manifest.records.some(row => row.siteId.startsWith('PROFILE_MARKER_')), 'synthetic offset markers must not be promoted');
assert.equal(catalogById.get('SITE_BGD_titas_gas_deposit').quantitative.production.year, 2020);
assert.equal(catalogById.get('SITE_AUS_greenbushes_lithium_mine').quantitative.grade.unit, 'PERCENT_LI2O');
assert.equal(catalogById.get('SITE_CHN_bayan_obo_main_iron_ore_mine').identity.resourceTypeId, 'iron_ore');

console.log(JSON.stringify({
  certificate: 'OMEGA-VERIFIED-LEGACY-RESOURCE-RESTORATION',
  status: 'PASS',
  baselineSiteCount: manifest.baselineCanonicalSiteCount,
  restoredSiteCount: manifest.restoredSiteCount,
  canonicalSiteCount: expected,
  commercialSiteCount: reserves.commercialSiteCount,
  historicalArchiveRowsPreserved: archive.records.length + archive.resourcesJsonDeposits.length + synthesized.records.length,
  syntheticMarkersPromoted: 0
}, null, 2));
