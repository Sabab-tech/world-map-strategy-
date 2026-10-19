'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const pipelineSource = read('omega_minister_intelligence_pipeline_v1.js');
const languageVocabulary = JSON.parse(read('offline_language_vocabulary.json'));

new Function(pipelineSource);

const listeners = new Map();
const events = [];
class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || {};
  }
}
const minister = {
  ministerId: 'minister-finance-01',
  staticProfile: {
    ministerId: 'minister-finance-01',
    baseName: 'Dr. Amina Rahman',
    background: 'Public finance and macroeconomic policy',
    baseAge: 47,
    baseStats: { accuracy: 86, strategic: 82 },
    efficiencyProfile: { fiscal: 88 },
    ideology: { type: 'technocrat' },
    ministryId: 'finance'
  },
  runtimeState: {
    ministerId: 'minister-finance-01',
    countryId: 'BGD',
    ministryId: 'finance',
    status: 'ACTIVE',
    workload: 20,
    stress: 10,
    confidence: 80,
    trust: 75,
    activeTasks: []
  },
  learningState: { totalServiceTime: 12, domainExperience: { fiscal: 8 } },
  memoryState: {},
  effectiveCapability: 84
};
const messages = [];
const episodes = [];
const contextUpdates = [];
const registry = {
  VERSION: 'TEST_CANONICAL_REGISTRY',
  getMinister(id) { return String(id) === minister.ministerId ? minister : null; },
  getActiveMinister(countryId, ministryId) {
    if (String(countryId) === 'BGD' && String(ministryId) === 'finance' && minister.runtimeState.status === 'ACTIVE') return minister;
    return null;
  },
  getRegistry() { return new Map(); },
  getAssignments() { return new Map(); },
  retrieveMemory() { return messages.slice(-12); },
  sendMessage(id, message) { assert.equal(String(id), minister.ministerId); messages.push(message); return message; },
  storeEpisode(id, episode) { assert.equal(String(id), minister.ministerId); episodes.push(episode); return episode; },
  consistencyCheck() { return { ok: true, errors: [], count: 0 }; }
};
const languageSystem = {
  VERSION: 'TEST_LANGUAGE',
  diagnostics() { return { ready: true }; },
  setContext(value) { contextUpdates.push(value); },
  parse(question, context) {
    return { raw: question, surface: question, language: /[\u0980-\u09FF]/.test(question) ? 'bn' : 'en',
      operation: 'ASK', targetDomain: 'MINISTER', entities: { minister: { id: context.ministerId } } };
  }
};
const cognitive = {
  async askMinisterWithAI(question, profile, countryId, countryDetails) {
    assert.equal(profile.ministerId, minister.ministerId);
    assert.equal(countryId, 'BGD');
    assert.equal(profile.ministryId, 'finance');
    assert.ok(profile.parsedIntent);
    assert.ok(countryDetails);
    return { text: 'বাজেটের ঝুঁকি বিশ্লেষণ করছি এবং প্রমাণ যাচাই করে সুপারিশ দেব।' };
  }
};

const sandbox = {
  console,
  CustomEvent: TestCustomEvent,
  dispatchEvent(event) { events.push(event); for (const fn of listeners.get(event.type) || []) fn(event); return true; },
  addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
  removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  OmegaMinisterStateRegistry: registry,
  OmegaLanguageSystem: languageSystem,
  OmegaCognitiveOS: cognitive,
  Game: { state: { countryCode: 'BGD', countryName: 'Bangladesh', treasury: 100 } },
  OmegaCabinetUI: { activeCountry: 'BGD', currentMinistryId: 'finance', currentInterrogatedMinister: {
    ministerId: minister.ministerId, name: 'Dr. Amina Rahman', countryCode: 'BGD', ministryId: 'finance', role: 'Finance Minister'
  } }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(pipelineSource, sandbox, { filename: 'omega_minister_intelligence_pipeline_v1.js' });
const pipeline = sandbox.OmegaMinisterIntelligencePipeline;
assert.ok(pipeline, 'The new pipeline must register its public API.');
assert.equal(pipeline.VERSION, '1.0.0');
assert.equal(pipeline.shouldHandleQuestion({ countryId: 'BGD', ministryId: 'finance', ministerId: minister.ministerId }, 'বাজেটের ঝুঁকি কত?'), true);
assert.equal(pipeline.shouldHandleQuestion({ countryId: 'BGD', ministryId: 'finance', ministerId: 'unknown' }, 'What is the budget risk?'), false);

(async () => {
  const answer = await pipeline.ask('বাজেটের ঝুঁকি কত?', {
    countryId: 'BGD',
    countryCode: 'BGD',
    countryName: 'Bangladesh',
    ministryId: 'finance',
    ministerId: minister.ministerId,
    ministerRole: 'Finance Minister',
    countryDetails: { treasury: 100 },
    gameState: { treasury: 100 }
  });

  assert.equal(answer.ok, true, JSON.stringify({ status: answer.status, error: answer.error }));
  assert.equal(answer.source, 'OMEGA_MINISTER_INTELLIGENCE_PIPELINE');
  assert.equal(answer.language, 'bn');
  assert.match(answer.text, /বাজেটের ঝুঁকি বিশ্লেষণ করছি/);
  assert.equal(answer.route[0], 'OMEGA_LANGUAGE_SYSTEM');
  assert.equal(answer.route[1], 'CANONICAL_MINISTER_STATE');
  assert.equal(answer.route[2], 'OMEGA_COGNITIVE_OS');
  assert.equal(answer.route[3], 'MINISTER_RELATIONAL_MEMORY');
  assert.equal(messages.length, 2, 'Both player and minister turns must enter canonical relational memory.');
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'assistant');
  assert.equal(episodes.length, 1, 'A structured conversation episode must be stored.');
  assert.equal(episodes[0].type, 'MINISTER_CONVERSATION');
  assert.ok(contextUpdates.length > 0, 'The language runtime must receive minister/country context.');
  assert.ok(events.some(event => event.type === 'OMEGA_MINISTER_CONVERSATION_COMPLETED'));

  const diagnostics = pipeline.diagnostics();
  assert.equal(diagnostics.canonicalRegistryAvailable, true);
  assert.equal(diagnostics.languageSystemAvailable, true);
  assert.equal(diagnostics.cognitiveEngineAvailable, true);

  const server = read('server.js');
  const bootstrap = read('server_bootstrap.js');
  const universal = read('omega_universal_ai_runtime.js');
  const ministerBootstrap = read('omega_minister_bootstrap.js');
  const communication = read('minister_communication_engine.js');

  assert.ok(server.includes('MINISTER_INTELLIGENCE_PIPELINE_SCRIPT'));
  assert.ok(server.includes('omega_minister_intelligence_pipeline_v1.js'));
  assert.ok(bootstrap.includes("'omega_minister_intelligence_pipeline_v1.js'"));
  assert.ok(universal.includes("source:'MINISTER_INTELLIGENCE_PIPELINE'"));
  assert.ok(universal.indexOf('const ministerPipeline=global.OmegaMinisterIntelligencePipeline') < universal.indexOf('const conversation=localConversation(question)'),
    'The active minister must get first refusal before generic conversation handling.');
  assert.ok(ministerBootstrap.includes('MAX_BOOT_ATTEMPTS'));
  assert.ok(ministerBootstrap.includes('scheduleRetry'));
  assert.ok(communication.includes('global.OmegaMinisterStateRegistry||global.OmegaMinisterState?.registry'),
    'Communication must prefer the canonical state registry.');

  for (const lang of ['en', 'bn']) {
    for (const attr of ['intelligence', 'recommendation', 'capability', 'decision_quality', 'institutional_memory']) {
      assert.ok(Array.isArray(languageVocabulary.languages[lang].attributes[attr]), lang + ' attribute missing: ' + attr);
      assert.ok(languageVocabulary.languages[lang].attributes[attr].length > 0);
    }
    for (const op of ['analyze', 'recommend', 'consult', 'delegate', 'coordinate']) {
      assert.ok(Array.isArray(languageVocabulary.languages[lang].operators[op]), lang + ' operator missing: ' + op);
    }
  }
  for (const intent of ['MINISTER_CONSULT', 'MINISTER_RECOMMENDATION', 'MINISTER_INTELLIGENCE', 'MINISTER_STATUS', 'MINISTER_EXPLANATION', 'MINISTER_STRATEGY', 'MINISTER_MEMORY']) {
    assert.ok(languageVocabulary.languages.conversation.intentRules[intent], 'Bilingual dialog intent missing: ' + intent);
    assert.ok(languageVocabulary.languages.conversation.intentRules[intent].phrases.en.length > 0);
    assert.ok(languageVocabulary.languages.conversation.intentRules[intent].phrases.bn.length > 0);
  }

  console.log('OMEGA MINISTER INTELLIGENCE PIPELINE V1: PASS');
  console.log('Canonical active-minister resolution: PASS');
  console.log('Bengali language-context parsing: PASS');
  console.log('Cognitive minister dialogue dispatch: PASS');
  console.log('Canonical conversation memory and episode persistence: PASS');
  console.log('Browser/server boot integration and retry contracts: PASS');
  console.log('Bilingual minister-intelligence vocabulary: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
