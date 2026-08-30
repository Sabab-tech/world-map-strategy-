import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../omega_ai_integrity_layer.js', import.meta.url), 'utf8');
const sandbox = {
  console,
  setInterval: () => 0,
  clearInterval: () => {},
  Date,
  JSON,
  Object,
  Number,
  String,
  RegExp,
  Intl,
  Map,
  Array,
  Math
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'omega_ai_integrity_layer.js' });

const api = sandbox.OmegaAIIntegrity;
assert.ok(api, 'integrity API must load');
assert.equal(api.VERSION, '2.0.0');

const identity = api.canonicalMinisterIdentity({
  countryCode: 'BGD',
  countryName: 'Bangladesh',
  ministryId: 'energy_mining',
  ministerId: 'BGD:energy_mining:001',
  ministerName: 'Eng. Tariq Al-Hassan',
  ministerRole: 'Minister of Strategic Fuel & Resources'
});
assert.equal(identity.name, 'Eng. Tariq Al-Hassan');
assert.equal(identity.countryCode, 'BGD');

const world = {
  countryCode: 'BGD',
  gameState: {
    resources: {
      CRUDE_OIL: { stockpile: 20000, dailyDemand: 1000, dailyProduction: 0 },
      RARE_EARTHS: { stockpile: 500, dailyDemand: 10, dailyProduction: 0 }
    }
  }
};

const plan = api.buildAnswerPlan(
  'Are our rare-earth and oil stockpiles secure?',
  identity,
  world
);

assert.deepEqual(plan.entities, ['CRUDE_OIL', 'RARE_EARTHS']);
assert.ok(plan.derived.some(x => x.metric === 'CRUDE_OIL.runwayDays' && x.value === 20));
assert.ok(plan.derived.some(x => x.metric === 'RARE_EARTHS.runwayDays' && x.value === 50));
assert.equal(plan.identity.name, 'Eng. Tariq Al-Hassan');
assert.equal(plan.operation, 'SECURITY');

const securityAnswer = api.formatOfflineAnswer(plan);
assert.match(securityAnswer, /20/);
assert.match(securityAnswer, /50/);
assert.doesNotMatch(securityAnswer, /Rajesh Malhotra/);

const identityPlan = api.buildAnswerPlan('What is your name?', identity, { gameState: {} });
assert.equal(identityPlan.operation, 'IDENTITY');
assert.match(api.formatOfflineAnswer(identityPlan), /Tariq Al-Hassan/);

const followUp = api.buildAnswerPlan(
  'How long will it last?',
  identity,
  world,
  [{ question: 'Tell me about oil', intent: 'RESOURCE_STATUS', operation: 'STATUS', entities: ['CRUDE_OIL'] }]
);
assert.deepEqual(followUp.entities, ['CRUDE_OIL']);
assert.equal(followUp.operation, 'SECURITY');
assert.ok(followUp.derived.some(x => x.metric === 'CRUDE_OIL.runwayDays' && x.value === 20));

const missingPlan = api.buildAnswerPlan(
  'Are our lithium stockpiles secure?',
  identity,
  { gameState: { resources: {} } }
);
const missingAnswer = api.formatOfflineAnswer(missingPlan);
assert.match(missingAnswer, /not exposed|not currently|missing|অজানা|নেই/i);
assert.doesNotMatch(missingAnswer, /20\.0K|28 days|90 days/);

const BengaliPlan = api.buildAnswerPlan(
  'আমাদের তেল কতদিন চলবে?',
  identity,
  world
);
assert.equal(BengaliPlan.language, 'bn');
assert.equal(BengaliPlan.operation, 'SECURITY');
assert.match(api.formatOfflineAnswer(BengaliPlan), /দিন/);

console.log('OMEGA AI contextual offline regression tests: PASS');
