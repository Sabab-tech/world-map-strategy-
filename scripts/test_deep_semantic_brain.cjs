const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

const datasets = {
  countries: readJson('countries.json'),
  economy: readJson('economy.json'),
  population: readJson('population.json'),
  resourceOntology: readJson('resource_ontology.json'),
  relation: readJson('relation_generation_engine.json'),
  resources: readJson('resources.json')
};
const vocabulary = readJson('offline_language_vocabulary.json');
const semanticKnowledge = readJson('offline_semantic_knowledge.json');

(async () => {
  await import(pathToUrl(path.join(root, 'omega_country_semantic_bridge.js')));
  const countryRegistry = globalThis.OmegaCanonicalIdentityRegistry || globalThis.OmegaCountrySemanticBridge;
  assert.ok(countryRegistry, 'Canonical country identity registry must initialize');
  assert.equal(await countryRegistry.init(), true, 'Canonical country identity registry must load');

  await import(pathToUrl(path.join(root, 'omega_resource_semantic_bridge.js')));
  const resourceBridge = globalThis.OmegaResourceSemanticBridge;
  assert.ok(resourceBridge, 'Canonical resource bridge must initialize');
  const resourceInit = await resourceBridge.init?.();
  assert.ok(resourceInit?.ready === true || resourceBridge.diagnostics?.().ready === true, 'Canonical resource bridge must be ready');
  const resourceDiagnostics = resourceBridge.diagnostics?.() || {};
  assert.equal(resourceDiagnostics.countryIdCoverageComplete, true, 'Resource bridge must cover every canonical country');

  await import(pathToUrl(path.join(root, 'omega_production_semantic_runtime_v3.js')));
  await import(pathToUrl(path.join(root, 'offline_semantic_brain.js')));
  const brain = globalThis.OfflineSemanticBrain;
  assert.ok(brain, 'Offline Semantic Brain must initialize');
  const runtime = brain.configure({ datasets, vocabulary, semanticKnowledge });

  assert.equal(runtime.countries, countryRegistry.exportData().countries.length, 'Semantic Brain country count must come from canonical registry');
  assert.ok(runtime.countries >= 190, `Expected complete global country registry, got ${runtime.countries}`);

  const iron = runtime.resources.find(r => r.names.some(n => /iron/i.test(n)));
  const oil = runtime.resources.find(r => r.names.some(n => /oil|petroleum|crude/i.test(n)));
  assert.ok(iron, 'Runtime resource registry must contain an iron-like resource');
  assert.ok(oil, 'Runtime resource registry must contain an oil-like resource');

  function check(query, expected) {
    const result = brain.parse(query);
    assert.equal(result.entities.country?.id ?? null, expected.country ?? null, `${query}: country`);
    assert.equal(result.entities.resource?.id ?? null, expected.resource ?? null, `${query}: resource`);
    assert.equal(result.entities.asset?.id ?? null, expected.asset ?? null, `${query}: asset`);
    assert.equal(result.operation, expected.operation, `${query}: operation`);
    assert.equal(result.executable, true, `${query}: executable`);
  }

  check('How many iron mines are in Bangladesh?', { country:'BGD', resource:iron.id, asset:'MINE', operation:'COUNT' });
  check('বাংলাদেশে কয়টি লোহার খনি আছে?', { country:'BGD', resource:iron.id, asset:'MINE', operation:'COUNT' });
  check('Where are the oil fields in Bangladesh?', { country:'BGD', resource:oil.id, asset:'OIL_FIELD', operation:'LOCATE' });
  check('বাংলাদেশে তেল কোথায় আছে?', { country:'BGD', resource:oil.id, asset:null, operation:'LOCATE' });
  check('Why is Bangladesh dependent on imported oil?', { country:'BGD', resource:oil.id, asset:null, operation:'ANALYZE_CAUSE' });
  check('Should Bangladesh increase iron production?', { country:'BGD', resource:iron.id, asset:null, operation:'EVALUATE_POLICY' });

  const unknown = brain.parse('How many mines are in Atlantis?');
  assert.equal(unknown.entities.country?.id ?? null, null);
  assert.equal(unknown.executable, false);
  assert.ok(unknown.unresolved.includes('COUNTRY'));

  console.log('Runtime multilingual semantic brain tests: PASS', { countries: runtime.countries, resources: runtime.resources.length, resourceBridge: resourceDiagnostics });
})().catch(error => {
  console.error(error);
  process.exit(1);
});

function pathToUrl(filePath) {
  const { pathToFileURL } = require('node:url');
  return pathToFileURL(filePath).href;
}