import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

async function loadCanonicalRegistry() {
  const bridgeModule = await import('../omega_country_semantic_bridge.js');
  void bridgeModule;

  const registry = globalThis.OmegaCanonicalIdentityRegistry;
  assert.ok(registry, 'canonical country identity registry must load');
  assert.equal(
    typeof registry.init,
    'function',
    'canonical country identity registry must expose async init()'
  );

  const initialized = await registry.init();
  assert.equal(initialized, true, 'canonical country identity registry must initialize');
  assert.equal(
    registry.diagnostics?.().ready,
    true,
    'canonical country identity registry must be ready before semantic brain configuration'
  );

  return registry;
}

test('Omega AI Integrity Suite', async () => {
  // The canonical registry is asynchronous. Do not configure the semantic brain
  // until its country dataset has finished loading and the registry reports ready.
  const canonicalRegistry = await loadCanonicalRegistry();

  const brainSource = fs.readFileSync(new URL('offline_semantic_brain.js', root), 'utf8');
  const engineSource = fs.readFileSync(new URL('offline_query_engine.js', root), 'utf8');
  const integritySource = fs.readFileSync(new URL('omega_ai_integrity_layer.js', root), 'utf8');
  const resourceBridgeSource = fs.readFileSync(new URL('omega_resource_semantic_bridge.js', root), 'utf8');
  const countries = JSON.parse(fs.readFileSync(new URL('countries.json', root), 'utf8'));
  const knowledge = JSON.parse(fs.readFileSync(new URL('offline_semantic_knowledge.json', root), 'utf8'));
  const resources = JSON.parse(fs.readFileSync(new URL('resources.json', root), 'utf8'));

  assert.ok(Array.isArray(countries) && countries.length > 0, 'countries.json must contain records');

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
    Math,
    process,
    OmegaCanonicalIdentityRegistry: canonicalRegistry
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(brainSource, sandbox, { filename: 'offline_semantic_brain.js' });
  vm.runInNewContext(engineSource, sandbox, { filename: 'offline_query_engine.js' });
  vm.runInNewContext(resourceBridgeSource, sandbox, { filename: 'omega_resource_semantic_bridge.js' });

  const configured = sandbox.OfflineSemanticBrain.configure({
    datasets: [
      Object.assign(countries, { __datasetName: 'countries.json' }),
      Object.assign(resources, { __datasetName: 'resources.json' })
    ],
    knowledge
  });

  assert.equal(
    configured.countries,
    countries.length,
    `semantic brain must expose every canonical country record (Expected ${countries.length}, got ${configured.countries})`
  );
  assert.equal(configured.identityAuthority, 'OMEGA_CANONICAL_IDENTITY_BRIDGE');

  vm.runInNewContext(integritySource, sandbox, { filename: 'omega_ai_integrity_layer.js' });
  const api = sandbox.OmegaAIIntegrity;
  assert.ok(api, 'integrity API must load');
  assert.equal(api.VERSION, '2.1.0');

  const first = countries[0];
  const last = countries[countries.length - 1];
  const identity = api.canonicalMinisterIdentity({
    countryCode: first.code,
    countryName: first.name,
    ministryId: 'runtime_test_ministry',
    ministerId: `${first.code}:runtime_test_ministry:001`,
    ministerName: 'Runtime Test Minister',
    ministerRole: 'Runtime Test Role'
  });
  assert.equal(identity.countryCode, String(first.code).toUpperCase());

  for (const row of [first, last]) {
    const expected = String(row.code).toUpperCase();
    const plan = api.buildAnswerPlan(`What is ${row.name}`, identity, { gameState: {} });
    assert.equal(
      String(plan.semantic.entities.country?.id || '').toUpperCase(),
      expected,
      `explicit country resolution failed for ${row.name}`
    );
    assert.equal(plan.semantic.targetDomain, 'COUNTRY');
    assert.match(api.formatOfflineAnswer(plan), new RegExp(expected));
  }

  const about = api.buildAnswerPlan(`Tell me about ${last.name}`, identity, { gameState: {} });
  assert.equal(
    String(about.semantic.entities.country?.id || '').toUpperCase(),
    String(last.code).toUpperCase()
  );
  assert.notEqual(
    String(about.semantic.entities.country?.id || '').toUpperCase(),
    String(first.code).toUpperCase()
  );

  const resourceApi = sandbox.OmegaResourceSemanticBridge;
  assert.ok(resourceApi, 'resource bridge must load');
  let resourceCandidate = null;
  for (const id of ['CRUDE_OIL', 'NATURAL_GAS', 'COAL', 'IRON_ORE', 'LITHIUM', 'COPPER', 'GOLD', 'URANIUM']) {
    try {
      const resource = resourceApi.resolveResource(id);
      if (resource?.id) {
        resourceCandidate = resource;
        break;
      }
    } catch (_) {}
  }

  if (resourceCandidate) {
    const resourceName = resourceCandidate.surface || resourceCandidate.name || resourceCandidate.id;
    const resourcePlan = api.buildAnswerPlan(`What is ${resourceName}`, identity, { gameState: {} });
    assert.equal(
      String(resourcePlan.semantic.entities.resource?.id || '').toUpperCase(),
      String(resourceCandidate.id).toUpperCase(),
      'resource must resolve to resource entity'
    );
    assert.equal(
      resourcePlan.semantic.entities.country?.id || null,
      null,
      'resource-only query must not inherit active country'
    );
    assert.equal(resourcePlan.semantic.targetDomain, 'RESOURCE');
    assert.ok(!/arableLandClass/i.test(api.formatOfflineAnswer(resourcePlan)), 'resource answer must not leak country-profile fields');

    const mixed = api.buildAnswerPlan(`${last.name} ${resourceName}`, identity, { gameState: {} });
    assert.equal(
      String(mixed.semantic.entities.country?.id || '').toUpperCase(),
      String(last.code).toUpperCase()
    );
    assert.equal(
      String(mixed.semantic.entities.resource?.id || '').toUpperCase(),
      String(resourceCandidate.id).toUpperCase()
    );
  }

  console.log('OMEGA strict entity integrity regression tests: PASS');
  console.log('Country records indexed:', configured.countries);
  console.log('Canonical country registry authority: PASS');
  console.log('Explicit country beats active-country context: PASS');
  console.log('Resource entity remains separate from country entity: PASS');
});


test('canonical semantic bridge extends a frozen AI integrity API copy-on-write', () => {
  const bridgeSource = fs.readFileSync(new URL('../omega_ai_integrity_canonical_bridge.js', import.meta.url), 'utf8');
  const original = Object.freeze({
    VERSION: '2.1.0',
    canonicalMinisterIdentity: value => value,
    detectIntent: () => ({ intent: 'LEGACY', confidence: 0.25 })
  });
  const sandbox = {
    OmegaAIIntegrity: original,
    __OMEGA_AI_INTEGRITY__: { version: '2.1.0', api: original },
    OmegaProductionSemanticRuntime: {
      VERSION: '3.0.0',
      parse: (question, context) => ({ targetDomain: 'COUNTRY', operation: 'LOOKUP', confidence: 0.93, question, context })
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(bridgeSource, sandbox, { filename: 'omega_ai_integrity_canonical_bridge.js' });
  assert.equal(sandbox.OmegaAIIntegrityCanonicalBridge.install(), true);
  const bridged = sandbox.OmegaAIIntegrity;
  assert.notEqual(bridged, original, 'bridge must not mutate the frozen base object');
  assert.equal(Object.isFrozen(original), true, 'original integrity API remains immutable');
  assert.equal(Object.isFrozen(bridged), true, 'extended public API is frozen after complete assembly');
  assert.equal(bridged.CANONICAL_SEMANTIC_VERSION, '3.0.0');
  assert.equal(bridged.SEMANTIC_AUTHORITY, 'OmegaProductionSemanticRuntime');
  const parsed = bridged.parse('What is Bangladesh?', { countryId: 'BGD' });
  assert.equal(parsed.targetDomain, 'COUNTRY');
  assert.equal(parsed.context.countryId, 'BGD');
  assert.equal(bridged.detectIntent('What is Bangladesh?').intent, 'COUNTRY');
  assert.equal(sandbox.__OMEGA_AI_INTEGRITY__.api, bridged, 'metadata must point to the canonical extended API');
});
