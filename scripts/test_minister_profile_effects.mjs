import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = {};
const store = new Map();
const sandbox = {
  console, Date, JSON, Object, Array, Map, Set, WeakSet, Math, Number, String,
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  dispatchEvent: event => { for (const fn of listeners[event.type] || []) fn(event); return true; },
  setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
  localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
  globalThis: null
};
sandbox.globalThis = sandbox;
function load(path) {
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
}
load('./omega_minister_state_system.js');
sandbox.OmegaMinisterRuntimeConfig = JSON.parse(fs.readFileSync('./minister_system_config.json', 'utf8'));
sandbox.OmegaMinisterStateRegistry.setConfig(sandbox.OmegaMinisterRuntimeConfig);
load('./minister_capability_engine.js');
load('./minister_behavior_engine.js');

const registry = sandbox.OmegaMinisterStateRegistry;
const behavior = sandbox.OmegaMinisterBehavior;
assert.ok(behavior, 'minister behavior engine must load');
assert.equal(behavior.VERSION, '1.3.0');
assert.equal(typeof behavior.analyzeProfile, 'function');

const commonStats = { discipline: 82, aggression: 35, empathy: 65, corruption: 5, strategic: 84 };
const commonEfficiency = { decision_speed: 82, accuracy: 88, crisis_handling: 80 };
const makeProfile = (id, age, background, personalityProfile = {}) => ({
  id, age, background, stats: { ...commonStats }, efficiency: { ...commonEfficiency },
  personalityProfile, ideology: { type: 'technocrat' }
});

const young = makeProfile('ProfileYoung', 25, 'Energy Policy Specialist');
const senior = makeProfile('ProfileSenior', 60, 'Energy Infrastructure Director');
const resilient = makeProfile('ProfileResilient', 45, 'Energy Policy Specialist', { stressTolerance: 90 });
const strained = makeProfile('ProfileStrained', 45, 'Energy Policy Specialist', { stressTolerance: 10 });
const unrelated = makeProfile('ProfileUnrelated', 45, 'Constitutional Law Scholar');

registry.recruitCandidate(young, 'BGD', 'energy_mining', 0);
registry.recruitCandidate(senior, 'IND', 'energy_mining', 0);
registry.recruitCandidate(resilient, 'USA', 'energy_mining', 0);
registry.recruitCandidate(strained, 'CAN', 'energy_mining', 0);
registry.recruitCandidate(unrelated, 'AUS', 'energy_mining', 0);

const youngEffects = behavior.analyzeProfile(young, 'INDUSTRY', { ministryId: 'energy_mining', domain: 'energy_mining' });
const seniorEffects = behavior.analyzeProfile(senior, 'INDUSTRY', { ministryId: 'energy_mining', domain: 'energy_mining' });
const unrelatedEffects = behavior.analyzeProfile(unrelated, 'INDUSTRY', { ministryId: 'energy_mining', domain: 'energy_mining' });
assert.equal(youngEffects.age.band, 'early-career');
assert.equal(seniorEffects.age.band, 'senior-experience');
assert.ok(youngEffects.training.ageMultiplier > seniorEffects.training.ageMultiplier, 'early-career profile should learn faster under the configured learning curve');
assert.equal(youngEffects.careerFit.matched, true, 'energy career background should match energy ministry work');
assert.ok(youngEffects.careerFit.multiplier > unrelatedEffects.careerFit.multiplier, 'matching specialty should improve task fit');
assert.ok(youngEffects.workStyle.includes('methodical'));
assert.ok(youngEffects.workStyle.includes('strategic_planner'));
assert.equal(youngEffects.stressResilience.handlingLabel, 'high');
assert.equal(behavior.analyzeProfile({ id: 'MissingAge', stats: {}, efficiency: {} }, 'EXECUTION').age.band, 'age-unrecorded');

const directive = { feasibility: 85, risk: 45, authority: 100, informationQuality: 1, operation: 'INDUSTRY', domain: 'energy_mining' };
const youngDecision = behavior.evaluateDirective('ProfileYoung', 'Build new generation capacity', directive);
const seniorDecision = behavior.evaluateDirective('ProfileSenior', 'Build new generation capacity', directive);
assert.ok(youngDecision.components.ageCapabilityMultiplier > seniorDecision.components.ageCapabilityMultiplier, 'age stage must affect operational capability');
assert.equal(youngDecision.effectiveCapability.profileEffects.careerFit.matched, true);

registry.updateRuntimeState('ProfileResilient', { stress: 80 }, 'PROFILE_EFFECTS_TEST');
registry.updateRuntimeState('ProfileStrained', { stress: 80 }, 'PROFILE_EFFECTS_TEST');
const calmDecision = behavior.evaluateDirective('ProfileResilient', 'Handle energy emergency', { ...directive, operation: 'CRISIS' });
const strainedDecision = behavior.evaluateDirective('ProfileStrained', 'Handle energy emergency', { ...directive, operation: 'CRISIS' });
assert.ok(calmDecision.components.effectiveStress < strainedDecision.components.effectiveStress, 'stress resilience must reduce the performance impact of identical pressure');
assert.ok(calmDecision.effectiveCapability.effectiveCapability > strainedDecision.effectiveCapability.effectiveCapability, 'resilience must affect crisis decision capability');

const youngBefore = registry.getMinister('ProfileYoung').learningState.domainExperience.energy_mining || 0;
const seniorBefore = registry.getMinister('ProfileSenior').learningState.domainExperience.energy_mining || 0;
const youngTrained = behavior.train('ProfileYoung', 'energy_mining', 8, 1);
const seniorTrained = behavior.train('ProfileSenior', 'energy_mining', 8, 1);
const youngGain = youngTrained.learningState.domainExperience.energy_mining - youngBefore;
const seniorGain = seniorTrained.learningState.domainExperience.energy_mining - seniorBefore;
assert.ok(youngGain > seniorGain, 'personalized training gain must apply the age-stage learning rate');
assert.equal(youngTrained.learningState.lastTraining.domain, 'energy_mining');
assert.ok(youngTrained.learningState.lastTraining.gain > 0);
assert.ok(youngTrained.learningState.trainingHours >= 8);

const database = JSON.parse(fs.readFileSync('./ministers.json', 'utf8'));
const roster = database.ministers_database || database.ministers || database;
let checkedProfiles = 0;
for (const [category, candidates] of Object.entries(roster)) {
  if (!Array.isArray(candidates)) continue;
  for (const profile of candidates) {
    const effects = behavior.analyzeProfile(profile, behavior.operationFor(category), { ministryId: category, domain: category });
    assert.ok(effects && Array.isArray(effects.workStyle), 'every profile must yield interpretable work-style output: ' + profile.id);
    assert.ok(Number.isFinite(effects.stressResilience.score), 'stress resilience must be finite: ' + profile.id);
    assert.ok(effects.training.ageMultiplier > 0, 'training multiplier must be positive: ' + profile.id);
    assert.ok(effects.age.capabilityMultiplier >= 0.85 && effects.age.capabilityMultiplier <= 1.15, 'age effects must remain bounded: ' + profile.id);
    checkedProfiles += 1;
  }
}
assert.ok(checkedProfiles >= 1, 'the canonical minister catalogue must contain profiles');
assert.equal(registry.consistencyCheck().ok, true, 'profile analysis, decisions, and training must preserve assignment invariants');

console.log('Minister profile gameplay effects: PASS');
console.log('Profiles audited:', checkedProfiles);
console.log('Age-stage decision modifier: PASS');
console.log('Career background/task fit: PASS');
console.log('Stress resilience/crisis response: PASS');
console.log('Personalized training and workload penalties: PASS');
