import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../omega_resource_endowment_runtime.js', import.meta.url), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, 'missing source section: ' + start);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, 'missing section boundary: ' + end);
  return source.slice(from, to);
}

test('Resource Endowment boot initializes core datasets sequentially and yields between them', () => {
  const init = section('async function initialize(options={})', "// A country's resource extraction pass");
  const reserve = init.indexOf('await loadSimulationReserveData()');
  const yieldAfterReserve = init.indexOf('await yieldResourceInitializationToUi()', reserve);
  const catalog = init.indexOf('await loadCanonicalSiteCatalogData()', yieldAfterReserve);
  const yieldAfterCatalog = init.indexOf('await yieldResourceInitializationToUi()', catalog);
  assert.ok(reserve >= 0 && yieldAfterReserve > reserve && catalog > yieldAfterReserve && yieldAfterCatalog > catalog);
  assert.doesNotMatch(init, /Promise\.all\([^)]*load(?:ResearchEvidence|LosslessResourceReference|MasterResourceResearch)Data/);
  assert.match(init, /coreOnly=options\?\.coreOnly===true/);
});

test('research and lossless enrichment runs sequentially as a retryable supplemental stage', () => {
  const loader = section('async function loadSupplementalResourceData()', 'let supplementalResourceSchedulePromise');
  const lossless = loader.indexOf('await loadLosslessResourceReferenceData()');
  const yieldOne = loader.indexOf('await yieldResourceInitializationToUi()', lossless);
  const master = loader.indexOf('await loadMasterResourceResearchData()', yieldOne);
  const yieldTwo = loader.indexOf('await yieldResourceInitializationToUi()', master);
  const evidence = loader.indexOf('await loadResearchEvidenceData()', yieldTwo);
  assert.ok(lossless >= 0 && yieldOne > lossless && master > yieldOne && yieldTwo > master && evidence > yieldTwo);
  assert.match(loader, /supplementalResourceDataReport=report\.status==='READY'\?report:null/);
  assert.match(source, /catch\(e\)\{losslessReferenceMap=null/);
  assert.match(source, /catch\(e\)\{masterResearchMap=null/);
  assert.match(source, /catch\(e\)\{researchEvidenceMap=null/);
});

test('startup schedules one core initialization during idle time and supplemental work later', () => {
  const scheduler = section('function scheduleResourceInitialization()', 'let supplementalResourceDataPromise');
  assert.match(scheduler, /requestIdleCallback\(start,\{timeout:1800\}\)/);
  assert.match(scheduler, /scheduleResourceTask\(start,650\)/);
  const supplemental = section('function scheduleResourceSupplementalData()', 'async function initialize(options={})');
  assert.match(supplemental, /requestIdleCallback\(start,\{timeout:5000\}\)/);
  assert.match(supplemental, /scheduleResourceTask\(start,2500\)/);
  assert.match(scheduler, /initialize\(\{coreOnly:true\}\)/);
});

test('player extraction and site binding use core data without waiting for optional research packs', () => {
  const startProduction = section('async function startCountryProduction', 'function extractAll()');
  assert.match(startProduction, /initialize\(\{coreOnly:true\}\)/);
  const turnExtraction = section('function extractAll()', 'function onReady()');
  assert.match(turnExtraction, /initialize\(\{coreOnly:true\}\)/);
  const bindingBootstrap = section('function onSiteBindingReady()', 'function diagnostics()');
  assert.match(bindingBootstrap, /initialize\(\{coreOnly:true\}\)/);
});

test('large legacy expansion downloads have bounded concurrency and preserve all six pack checks', () => {
  assert.match(source, /mapWithConcurrency\(LEGACY_GAMEPLAY_EXPANSION_FILES,2/);
  assert.match(source, /legacyGameplayExpansionLoadedParts===6/);
  assert.match(source, /legacyGameplayExpansionRows\.length===115/);
});

test('background initialization is deferred from the immediate boot path', () => {
  const init = section('function init(){', 'function registerCanonicalSiteSimulationRecord');
  assert.match(init, /if\(engine\(\)\?\.isReady\)void scheduleResourceInitialization\(\)/);
  const ready = section('function onReady(){', 'function publishBootstrapStatus');
  assert.match(ready, /scheduleResourceInitialization\(\)/);
  assert.match(ready, /scheduleResourceSupplementalData\(\)/);
});
