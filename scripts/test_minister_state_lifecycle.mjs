import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../omega_minister_state_system.js', import.meta.url), 'utf8');
const store = new Map();
const events = [];
const sandbox = {
  console,
  Date,
  JSON,
  Object,
  Array,
  Math,
  Map,
  Set,
  Number,
  String,
  WeakSet,
  localStorage: {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v)
  },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  addEventListener: (type, fn) => { sandbox.__listeners ||= {}; (sandbox.__listeners[type] ||= []).push(fn); },
  dispatchEvent: event => { events.push(event); for (const fn of sandbox.__listeners?.[event.type] || []) fn(event); return true; },
  setTimeout: fn => { fn(); return 1; },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  globalThis: null
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'omega_minister_state_system.js' });

const registry = sandbox.OmegaMinisterStateRegistry;
assert.ok(registry);

const profileA = {
  id: 'Finance_3', age: 47, background: 'Macroeconomic Strategist', gender: 'male',
  stats: { discipline: 75, aggression: 50, empathy: 45, corruption: 25, strategic: 85 },
  efficiency: { decision_speed: 80, accuracy: 82, crisis_handling: 78 },
  ideology: { type: 'secular' }
};
const profileB = {
  id: 'Finance_4', age: 60, background: 'Treasury Auditor General', gender: 'female',
  stats: { discipline: 92, aggression: 30, empathy: 55, corruption: 2, strategic: 90 },
  efficiency: { decision_speed: 75, accuracy: 95, crisis_handling: 88 },
  ideology: { type: 'nationalist' }
};

registry.recruitCandidate(profileA, 'BGD', 'treasury_finance', 0);
assert.equal(registry.getActiveMinister('BGD', 'treasury_finance').ministerId, 'Finance_3');

registry.addTask('Finance_3', { taskId: 'T1', type: 'POLICY_DECISION', domain: 'fiscal', complexity: 70, urgency: 80, cognitiveDemand: 85, deadlinePressure: 60, planning: true });
registry.recomputeWorkload('Finance_3');
assert.ok(registry.getMinister('Finance_3').runtimeState.workload > 0);

registry.updateStress('Finance_3', { economicCondition: 80, politicalCondition: 70, crisisExposure: 40, timePressure: 60, uncertainty: 50 });
const stressed = registry.getMinister('Finance_3');
assert.ok(stressed.runtimeState.stress > 0);

registry.finishTask('Finance_3', 'T1', 'SUCCESS', 10, { text: 'Completed fiscal decision under pressure', domain: 'fiscal', confidence: 0.9 });
const afterTask = registry.getMinister('Finance_3');
assert.ok(afterTask.learningState.domainExperience.fiscal > 0);
assert.ok(afterTask.memorySummary.counts.lessons > 0);

registry.onGameTime(8760, { unit: 'hours', stableConditions: 20 });
const afterYear = registry.getMinister('Finance_3');
assert.equal(afterYear.staticProfile.baseAge, 47);
assert.ok(afterYear.learningState.totalServiceTime > 0);

registry.removeMinister('Finance_3', 'FIRED', 9000);
assert.equal(registry.getMinister('Finance_3').status, 'FIRED');
assert.equal(registry.getActiveMinister('BGD', 'treasury_finance'), null);
assert.ok(registry.getMinister('Finance_3').memorySummary.counts.lessons > 0);

registry.recruitCandidate(profileB, 'BGD', 'treasury_finance', 9001);
assert.equal(registry.getActiveMinister('BGD', 'treasury_finance').ministerId, 'Finance_4');
assert.equal(registry.getMinister('Finance_3').isActive, false);
assert.equal(registry.getMinister('Finance_4').isActive, true);
assert.equal(registry.getMinister('Finance_4').staticProfile.background, 'Treasury Auditor General');

const saved = registry.saveObject();
assert.equal(saved.assignments['BGD:treasury_finance'], 'Finance_4');
registry.persist();
assert.ok(store.has('OMEGA_MINISTER_STATE_V2'));

const diagnostics = registry.consistencyCheck();
assert.equal(diagnostics.ok, true);
assert.equal(events.some(e => e.type === 'MINISTER_RECRUITED'), true);
assert.equal(events.some(e => e.type === 'MINISTER_FIRED'), true);

console.log('Minister lifecycle invariants: PASS');
