const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const routerSource = fs.readFileSync('./minister_query_router.js', 'utf8');
const resources1 = JSON.parse(fs.readFileSync('./resources.json', 'utf8'));
const resources2 = JSON.parse(fs.readFileSync('./resources_2.json', 'utf8'));
const dataset = {
  countryProfiles: Object.assign({},
    resources1?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {},
    resources2?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {}
  )
};

const sandbox = {
  console,
  Date,
  JSON,
  Object,
  Array,
  Map,
  Set,
  Math,
  RegExp,
  String,
  Number,
  Intl,
  localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.setInterval = () => 0;
sandbox.clearInterval = () => {};
vm.runInNewContext(routerSource, sandbox, { filename: 'minister_query_router.js' });

const router = sandbox.MinisterQueryRouter;
assert.ok(router);
assert.equal(router.VERSION, '3.0.0');

const q1 = router.resolveKnowledgeQuery('How many iron mines are in Bangladesh?', { dataset });
assert.equal(q1.country.id, 'BGD');
assert.equal(q1.resource.id, 'IRON_ORE');
assert.equal(q1.intent, router.QueryIntent.RESOURCE_MINING_DISCOVERY);
assert.equal(q1.operation, 'COUNT');
assert.ok(q1.dataFound, 'Bangladesh profile must resolve from the supplied resource dataset');

const q2 = router.resolveKnowledgeQuery('বাংলাদেশে কয়টি তেল খনি আছে?', { dataset });
assert.equal(q2.country.id, 'BGD');
assert.equal(q2.resource.id, 'CRUDE_OIL');
assert.equal(q2.intent, router.QueryIntent.RESOURCE_MINING_DISCOVERY);
assert.equal(q2.operation, 'COUNT');

const q3 = router.resolveKnowledgeQuery('How many mines are in India?', { dataset });
assert.equal(q3.country.id, 'IND');
assert.equal(q3.intent, router.QueryIntent.RESOURCE_MINING_DISCOVERY);

const unknown = router.resolveKnowledgeQuery('How many mines are in Atlantis?', { dataset });
assert.equal(unknown.country.id, null);

const learned = router.learn('our black gold', { resourceId: 'CRUDE_OIL' });
assert.equal(learned, true);
assert.equal(router.recall('OUR BLACK GOLD').mapping.resourceId, 'CRUDE_OIL');

console.log('Deep semantic country-resource router tests: PASS');
