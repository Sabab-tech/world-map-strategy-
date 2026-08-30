(async () => {
  const assert = require('node:assert/strict');
  await import('../offline_semantic_brain.js');
  const brain = globalThis.OfflineSemanticBrain;
  assert.ok(brain, 'OfflineSemanticBrain must initialize');

  function check(query, expected) {
    const result = brain.parse(query);
    assert.equal(result.entities.country.id, expected.country, `${query}: country`);
    assert.equal(result.entities.resource.id, expected.resource, `${query}: resource`);
    assert.equal(result.entities.asset.id, expected.asset, `${query}: asset`);
    assert.equal(result.operation, expected.operation, `${query}: operation`);
    assert.equal(result.executable, true, `${query}: executable`);
  }

  check('How many iron mines are in Bangladesh?', { country:'BGD', resource:'IRON_ORE', asset:'MINE', operation:'COUNT' });
  check('বাংলাদেশে কয়টি লোহার খনি আছে?', { country:'BGD', resource:'IRON_ORE', asset:'MINE', operation:'COUNT' });
  check('Where are the oil fields in Bangladesh?', { country:'BGD', resource:'CRUDE_OIL', asset:'OIL_FIELD', operation:'LOCATION' });
  check('বাংলাদেশে তেল কোথায় আছে?', { country:'BGD', resource:'CRUDE_OIL', asset:null, operation:'LOCATION' });
  check('Why is Bangladesh dependent on imported oil?', { country:'BGD', resource:'CRUDE_OIL', asset:null, operation:'CAUSE' });
  check('Should Bangladesh increase iron production?', { country:'BGD', resource:'IRON_ORE', asset:null, operation:'POLICY' });

  const unknown = brain.parse('How many mines are in Atlantis?');
  assert.equal(unknown.entities.country.id, null);
  assert.equal(unknown.executable, false);
  assert.ok(unknown.unresolved.includes('COUNTRY'));

  console.log('Deep multilingual semantic brain tests: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
