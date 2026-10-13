import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const source = read('resource_site_legacy_structural_candidates_v1.json');
const canonical = read('resource_site_canonical_catalog_v1.json');
const parts = [1, 2, 3, 4, 5].map(n => read('resource_site_legacy_gameplay_expansion_part_' + n + '_v1.json'));
const sites = parts.flatMap(x => x.records);
const ids = new Set(sites.map(s => s.siteId));
const metrics = ['reserve', 'production', 'grade', 'recovery', 'throughput', 'purity', 'capacity'];
const aliases = sites.filter(s => Boolean(s.runtime?.aliasOfSiteId));
const canonicalIds = new Set(canonical.sites.map(s => s.siteId));

assert.equal(source.records.length, 65, 'preserve all 65 legacy candidates');
assert.equal(parts.length, 5);
assert.deepEqual(parts.map(p => p.recordCount), [13, 13, 13, 13, 13]);
assert.equal(sites.length, 65, 'all 65 candidate records must be present');
assert.equal(ids.size, 65, 'all candidate IDs must be unique');
assert.equal(aliases.length, 10, 'six canonical aliases and four duplicate legacy aliases');
assert.equal(sites.filter(s => s.map?.markerEligible === true).length, 55, 'only distinct new physical assets receive independent markers');
assert.equal(sites.filter(s => s.map?.markerEligible === false).length, 10, 'aliases must not create duplicate markers');
for (const target of aliases) {
  assert(target.runtime.aliasOfSiteId, target.siteId + ': alias target missing');
  if (target.runtime.aliasOfSiteId.startsWith('SITE_') &&
      !sites.some(s => s.siteId === target.runtime.aliasOfSiteId)) {
    assert(canonicalIds.has(target.runtime.aliasOfSiteId), target.siteId + ': canonical alias target missing');
  }
}
for (const s of sites) {
  assert(/^[A-Z]{3}$/.test(s.countryId), s.siteId + ': country ISO-3 missing');
  assert.equal(s.identity.countryIso3, s.countryId, s.siteId + ': country identity mismatch');
  assert(s.identity.resourceTypeId, s.siteId + ': resource type missing');
  const { lat, lng } = s.location.coordinates;
  assert(Number.isFinite(lat) && lat >= -90 && lat <= 90, s.siteId + ': latitude invalid');
  assert(Number.isFinite(lng) && lng >= -180 && lng <= 180, s.siteId + ': longitude invalid');
  assert.equal(s.location.coordinateStatus, 'GAMEPLAY_REGIONAL_APPROXIMATION');
  assert.equal(s.map.countryIsolationKey, s.countryId);
  assert.equal(s.logistics.warehouseCountryId, s.countryId);
  assert.equal(s.logistics.transport.originCountryId, s.countryId);
  assert.equal(s.logistics.transport.destinationCountryId, s.countryId);
  assert.equal(s.simulation.factoryBinding.countryId, s.countryId);
  assert.equal(s.simulation.factoryBinding.requiresSameCountryWarehouse, true);
  assert.equal(s.runtime.pipeline.site, 'BOUND');
  assert.equal(s.runtime.pipeline.rawWarehouse, 'BOUND_TO_OWNER_COUNTRY');
  for (const key of metrics) {
    const q = s.quantitative[key];
    assert(q, s.siteId + ': ' + key + ' object missing');
    assert.equal(q.status, 'SIMULATED', s.siteId + ': ' + key + ' authority must be explicit');
    assert(q.unit, s.siteId + ': ' + key + ' unit missing');
  }
  assert(Number.isFinite(s.quantitative.reserve.quantity) && s.quantitative.reserve.quantity > 0, s.siteId + ': reserve missing');
  assert(Number.isFinite(s.quantitative.production.rate) && s.quantitative.production.rate > 0, s.siteId + ': rate missing');
  assert(Number.isFinite(s.quantitative.production.annual) && s.quantitative.production.annual > 0, s.siteId + ': annual production missing');
  assert(Number.isFinite(s.quantitative.grade.value) && s.quantitative.grade.value > 0, s.siteId + ': grade missing');
  assert(Number.isFinite(s.quantitative.purity.value) && s.quantitative.purity.value > 0 && s.quantitative.purity.value <= 100, s.siteId + ': purity invalid');
  assert(Number.isFinite(s.quantitative.recovery.value) && s.quantitative.recovery.value > 0 && s.quantitative.recovery.value <= 100, s.siteId + ': recovery invalid');
  assert(Number.isFinite(s.quantitative.throughput.value) && s.quantitative.throughput.value > 0, s.siteId + ': throughput missing');
  assert(s.quantitative.capacity.minimum > 0 &&
    s.quantitative.capacity.minimum <= s.quantitative.capacity.nominal &&
    s.quantitative.capacity.nominal <= s.quantitative.capacity.maximum, s.siteId + ': capacity ordering invalid');
  assert.equal(s.quantitative.quantitativeProvenance.authority, 'SCENARIO_SIMULATION_DATA');
  assert.equal(s.quantitative.quantitativeProvenance.externalMeasuredValuePromotion, false);
  assert(s.simulation.reserveHorizonYears >= 400 && s.simulation.reserveHorizonYears <= 440, s.siteId + ': gameplay reserve horizon out of range');
  assert(s.simulation.transportRoute.length > 0, s.siteId + ': per-site route missing');
  assert(s.processing.midstreamProcess, s.siteId + ': processing step missing');
  assert(s.processing.refinedOutputs.length > 0, s.siteId + ': product output missing');
  for (const fact of (s.observedFacts || [])) {
    assert(fact.status && fact.sourceUrl, s.siteId + ': observed fact must carry status and source URL');
    assert((s.sources || []).some(source => source.url === fact.sourceUrl), s.siteId + ': fact URL missing from source list');
  }
}
const exploration = sites.find(s => s.siteId === 'SITE_STP_joint_development_zone_oil_block_1');
assert.equal(exploration.operation.commercialExtraction, false, 'exploration block must not produce commercial output');
assert.equal(exploration.runtime.pipeline.extraction, 'LOCKED_UNTIL_DISCOVERY_AND_FINAL_INVESTMENT_DECISION');

const audit = read('resource_site_legacy_quantitative_audit_v1.json');
assert.equal(audit.counts.candidateCount, 65);
assert.equal(audit.counts.fullyQuantifiedCandidates, 65);
for (const key of metrics) {
  assert.equal(audit.quantitativeCoverage[key].rowsWithNumericOrValue, 65, key + ': coverage must be 65/65');
  assert.equal(audit.quantitativeCoverage[key].rowsUnobserved, 0, key + ': no missing gameplay values');
  assert.equal(audit.quantitativeCoverage[key].rowsMissingStatus, 0, key + ': status must be explicit');
}

const endowment = fs.readFileSync(new URL('../omega_resource_endowment_runtime.js', import.meta.url), 'utf8');
const binding = fs.readFileSync(new URL('../omega_resource_gameplay_binding_v1.js', import.meta.url), 'utf8');
for (const part of [1, 2, 3, 4, 5]) {
  const file = 'resource_site_legacy_gameplay_expansion_part_' + part + '_v1.json';
  assert(endowment.includes(file), 'endowment runtime must load ' + file);
  assert(binding.includes(file), 'map/detail runtime must load ' + file);
}
assert(endowment.includes('loadLegacyGameplayExpansionRows'), 'endowment data loader is wired');
assert(binding.includes('activeLegacySites'), 'map site loader is wired');
assert(endowment.includes('simulationReserveQuantity:runtimeReserveQuantity'), 'scenario reserve must enter site extraction modelling');
assert(endowment.includes('productionModel:clone(runtimeProductionModel)'), 'site-specific production/capacity/recovery must enter extraction modelling');
assert(endowment.includes('quantitative:clone(rawSite.quantitative||{})'), 'site quantitative fields must survive country reference binding');
assert(binding.includes('production.rate') && binding.includes('grade.value') &&
  binding.includes('purity.value') && binding.includes('throughput.value'), 'site detail exposes per-site metrics');
const realism = fs.readFileSync(new URL('../omega_resource_realism_runtime_v1.js', import.meta.url), 'utf8');
assert(realism.includes('const scenarioOnlyInput=metricAuthorityInputs.some'), 'explicit scenario values must not be relabelled observed');
assert(realism.includes("productionObserved=!scenarioOnlyInput"), 'scenario production authority stays simulated');

console.log(JSON.stringify({
  certificate: 'OMEGA-65-LEGACY-GAMEPLAY-QUANTITATIVE-COVERAGE',
  status: 'PASS',
  candidateRecords: sites.length,
  uniqueCandidateIds: ids.size,
  completeMetricCoverage: Object.fromEntries(metrics.map(k => [k, sites.filter(s => s.quantitative[k]?.status === 'SIMULATED' && s.quantitative[k].unit).length])),
  uniqueNewRuntimeAssets: 55,
  aliasesNotIndependentlyExecutable: aliases.length,
  sourcedFactRows: sites.filter(s => (s.observedFacts || []).length).length,
  runtimeWiring: 'STATIC_ASSERTIONS_PASSED',
  endToEndGameplayPipeline: 'NOT_CLAIMED_BY_THIS_DATA_COVERAGE_TEST'
}, null, 2));
