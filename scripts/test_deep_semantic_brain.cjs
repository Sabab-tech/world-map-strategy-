(async () => {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  await import('../offline_semantic_brain.js');
  const brain = globalThis.OfflineSemanticBrain;
  assert.ok(brain, 'OfflineSemanticBrain must initialize');
  const datasets = ['resources.json','resources_2.json'].filter(fs.existsSync).map(f => JSON.parse(fs.readFileSync(f,'utf8')));
  const vocabulary = JSON.parse(fs.readFileSync('offline_language_vocabulary.json','utf8'));
  const runtime = brain.configure({datasets,vocabulary});
  assert.ok(runtime.countries >= 190, `Expected global country registry, got ${runtime.countries}`);
  const iron = runtime.resources.find(r => r.names.some(n => /iron/i.test(n)));
  const oil = runtime.resources.find(r => r.names.some(n => /oil|petroleum|crude/i.test(n)));
  assert.ok(iron, 'Runtime resource registry must contain an iron-like resource');
  assert.ok(oil, 'Runtime resource registry must contain an oil-like resource');
  function check(query, expected) {
    const result = brain.parse(query);
    assert.equal(result.entities.country.id, expected.country, `${query}: country`);
    assert.equal(result.entities.resource.id, expected.resource, `${query}: resource`);
    assert.equal(result.entities.asset.id, expected.asset, `${query}: asset`);
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
  assert.equal(unknown.entities.country.id, null);
  assert.equal(unknown.executable, false);
  assert.ok(unknown.unresolved.includes('COUNTRY'));
  console.log('Runtime multilingual semantic brain tests: PASS', runtime);
})().catch(error => { console.error(error); process.exitCode = 1; });
