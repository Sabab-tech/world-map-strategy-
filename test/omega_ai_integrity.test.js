import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../omega_ai_integrity_layer.js', import.meta.url), 'utf8');
const sandbox = { console, setInterval: () => 0, clearInterval: () => {}, Date, JSON, Object, Number, String, RegExp };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'omega_ai_integrity_layer.js' });

const api = sandbox.OmegaAIIntegrity;
assert.ok(api, 'integrity API must load');

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

const plan = api.buildAnswerPlan(
  'Are our rare-earth and oil stockpiles secure?',
  identity,
  {
    countryCode: 'BGD',
    gameState: {
      resources: {
        CRUDE_OIL: { stockpile: 20000, dailyDemand: 1000, dailyProduction: 0 },
        RARE_EARTHS: { stockpile: 500, dailyDemand: 10, dailyProduction: 0 }
      }
    }
  }
);

assert.deepEqual(plan.entities, ['CRUDE_OIL', 'RARE_EARTHS']);
assert.ok(plan.derived.some(x => x.metric === 'CRUDE_OIL.runwayDays' && x.value === 20));
assert.ok(plan.derived.some(x => x.metric === 'RARE_EARTHS.runwayDays' && x.value === 50));
assert.equal(plan.identity.name, 'Eng. Tariq Al-Hassan');

const identityPlan = api.buildAnswerPlan('What is your name?', identity, { gameState: {} });
assert.match(identityPlan.conclusion, /Tariq Al-Hassan/);

console.log('OMEGA AI integrity regression tests: PASS');
