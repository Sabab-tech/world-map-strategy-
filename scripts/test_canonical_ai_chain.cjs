const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`CANONICAL CHAIN TEST FAILED: ${message}`); };

const packageJson = JSON.parse(read('package.json'));
const bootstrap = read('server_bootstrap.js');
const gateway = read('omega_server_ai_gateway.js');
const contextBridge = read('omega_ai_context_bridge.js');
const resourceBridge = read('omega_resource_semantic_bridge.js');
const integrityBridge = read('omega_ai_integrity_canonical_bridge.js');
const universal = read('omega_universal_ai_runtime.js');
const server = read('server.js');
const router = read('minister_query_router.js');
const dispatcher = read('omega_reasoning_dispatcher.js');
const batch03 = read('omega_language_batch03_semantic_extension.js');
const ontology = JSON.parse(read('resource_ontology.json'));

assert(packageJson.dependencies?.express, 'express must be a declared runtime dependency');
assert(packageJson.scripts?.test?.includes('scripts/test_canonical_ai_chain.cjs'), 'canonical test must be part of npm test');
assert(packageJson.scripts?.build?.includes('npm run test:canonical'), 'canonical test must be part of npm build');

const requiredScripts = [
  'omega_language_system.js',
  'omega_language_batch03_semantic_extension.js',
  'omega_country_semantic_bridge.js',
  'omega_resource_semantic_bridge.js',
  'omega_minister_runtime_v2.js',
  'omega_ai_integrity_layer.js',
  'omega_ai_integrity_canonical_bridge.js',
  'omega_cognitive_engine.js',
  'omega_reasoning_dispatcher.js',
  'omega_universal_ai_runtime.js',
  'omega_ai_context_bridge.js'
];
requiredScripts.forEach(file => assert(fs.existsSync(path.join(root, file)), `missing canonical script: ${file}`));

const bootOrder = requiredScripts.map(name => bootstrap.indexOf(`'${name}'`));
assert(bootOrder.every(i => i >= 0), 'bootstrap manifest is incomplete');
assert(bootOrder.every((v, i) => i === 0 || v > bootOrder[i - 1]), 'canonical bootstrap order is not strictly monotonic');
assert(!bootstrap.includes('omega_semantic_runtime_v32'), 'legacy V3.2 must not be injected by canonical bootstrap');
assert(bootstrap.includes('Canonical AI script missing'), 'bootstrap must fail fast when a canonical asset is absent');
assert(bootstrap.includes("html = html.replace(canonicalTags(name), '')"), 'bootstrap must normalize/remove duplicate canonical script tags before reinsertion');

const routerSyntax = spawnSync(process.execPath, ['--check', path.join(root, 'minister_query_router.js')], { encoding: 'utf8' });
assert(routerSyntax.status === 0, `minister_query_router.js syntax gate failed: ${routerSyntax.stderr || routerSyntax.stdout}`);
assert(router.includes("replace(/[?!,.:;\\\"'“”‘’(){}\\[\\]<>—–\\/\\\\]/g"), 'router tokenizer must use a valid escaped slash character class');

assert(gateway.includes('AsyncLocalStorage'), 'server gateway must remain request-scoped');
assert(gateway.includes('canonicalSemanticPlan'), 'server gateway must preserve canonical semantic plan');
assert(gateway.includes('canonicalContextPacket'), 'server gateway must preserve canonical context packet');
assert(gateway.includes("name==='parse'"), 'semantic parser bridge must be request-scoped');

assert(contextBridge.includes('function build(question, request={})'), 'context bridge must accept the exact request body');
assert(contextBridge.includes('canonicalSemanticPlan:packet.semanticPlan'), 'context bridge must attach canonical semantic plan');
assert(contextBridge.includes('canonicalContextPacket:{'), 'context bridge must attach canonical context packet');
assert(contextBridge.includes('reservesData'), 'context bridge must preserve reserves/telemetry context');
assert(contextBridge.includes('timeHorizon'), 'context bridge must preserve time horizon');
assert(contextBridge.includes('canonicalAuthority'), 'context bridge must attach canonical authority');

assert(resourceBridge.includes('resource_ontology.json'), 'resource bridge must load canonical ontology');
assert(resourceBridge.includes('cognitiveOntologyInjected'), 'resource bridge must expose cognitive ontology injection diagnostics');
assert(resourceBridge.includes('L2_SemanticMemory.clear'), 'resource bridge must purge bootstrap-time cognitive ontology fallback');
assert(resourceBridge.includes('cognitiveMemorySize===Object.keys(matrix).length'), 'resource bridge must verify cognitive ontology size equality');
assert(resourceBridge.includes('instance.L2_SemanticMemory.set'), 'resource bridge must bind ontology to the cognitive memory layer');
assert(!resourceBridge.includes("String(v==null?'':'')"), 'resource normalizer must consume its input');
assert(Object.keys(ontology.COMMODITY_ONTOLOGIES || {}).length > 0, 'canonical resource ontology must contain entries');

assert(integrityBridge.includes("return rt.parse(question,context)"), 'integrity semantic parser must delegate directly to canonical runtime');
assert(!integrityBridge.includes('return typeof previous'), 'integrity layer must not fall back to a second semantic parser');

assert(server.includes("import './omega_cognitive_engine.js'"), 'server must load the cognitive engine');
assert(server.includes("import './omega_reasoning_dispatcher.js'"), 'server must load the reasoning dispatcher');
assert(server.includes('function runCognitiveBridge('), 'server must expose the canonical cognitive bridge');
assert(server.includes('const cognitive = runCognitiveBridge('), 'minister consultation must execute the cognitive bridge before Gemini');
assert(server.includes('40-STAGE GROUNDED COGNITIVE PACKET'), 'Gemini request must explicitly include the 40-stage packet');
assert(server.includes('NO_UNGROUNDED_DEFAULTS'), 'server must enforce grounded-answer policy');
assert(server.includes('cognitive40:'), 'grounded dossier must carry 40-stage cognitive trace');
assert(server.includes('cognitiveBridge:'), 'AI status must expose cognitive bridge diagnostics');

assert(dispatcher.includes("const VERSION='2.1.1'"), 'dispatcher version must be 2.1.1');
assert(dispatcher.includes('stageCount:40'), 'dispatcher must expose full 40-stage count');
for (const id of ['EVIDENCE_LEDGER','PROVENANCE_AUDIT','DATA_COMPLETENESS_AUDIT','CONSISTENCY_AND_CONFLICT_CHECK','BELIEF_REVISION','TEMPORAL_CONTEXT_MODEL','CAUSAL_LINK_GRAPH','DEPENDENCY_RECONSTRUCTION','RESOURCE_BALANCE_ANALYSIS','CAPACITY_CONSTRAINT_ANALYSIS','TRADE_AND_CHOKEPOINT_EXPOSURE','STRATEGIC_VULNERABILITY_SYNTHESIS','OPTION_EVIDENCE_ALIGNMENT','COUNTERFACTUAL_FRAME','MEMORY_CONSOLIDATION','RED_TEAM_RECHECK','DECISION_CONFIDENCE_SYNTHESIS','ANSWER_EVIDENCE_PACKET','ANSWER_CONTRACT','FINAL_AI_HANDOFF']) {
  assert(dispatcher.includes(`name:'${id}'`), `dispatcher stage responsibility missing: ${id}`);
}
assert(dispatcher.includes("groundingBoundary:'RUNTIME_STAGE_ARTIFACTS_ONLY'"), 'AI handoff must be bounded by runtime stage artifacts');
assert(dispatcher.includes('doNotInventMissingValues:true'), 'answer contract must prohibit invention');
assert(dispatcher.includes('source:\'LIVE_GAME_STATE\''), 'cognitive bridge must record live telemetry source');
assert(dispatcher.includes("const originals=stages.slice(20,40)"), 'dispatcher must preserve existing 21-40 stage slots and wrap them');

assert(batch03.includes('DISCOURSE_LEXICON'), 'Batch 03 must contain contextual discourse lexicon');
for (const id of ['GREETING','GRATITUDE','GRATITUDE_DECLINED','WELCOME','FAREWELL','APOLOGY','ACKNOWLEDGEMENT','AFFIRMATION','NEGATION','DISAGREEMENT','HESITATION','CONTINUATION','CLOSURE_REQUEST','WELLBEING']) {
  assert(batch03.includes(`${id}:Object.freeze`), `discourse intent missing: ${id}`);
}
assert(batch03.includes('contextualResolution'), 'context-sensitive discourse resolution missing');
assert(batch03.includes("HESITATION_AFTER_QUESTION"), 'hesitation must use prior-question context');
assert(batch03.includes("CONSENT_OR_AFFIRMATION"), 'affirmation must expose contextual interpretation');
assert(batch03.includes("REFUSAL_OR_NEGATION"), 'negation must expose contextual interpretation');

assert(universal.includes("loadScript('omega_language_system.js')"), 'universal runtime must be able to recover the language layer');
assert(universal.includes("loadScript('omega_language_batch03_semantic_extension.js')"), 'universal runtime must load Batch 03 discourse semantics');
assert(universal.includes("loadScript('omega_production_semantic_runtime_v3.js')"), 'universal runtime must load the production semantic runtime');
assert(universal.includes('new URL(p,document.baseURI)'), 'universal runtime assets must be document-relative');
assert(universal.includes('function conversationIntent('), 'universal runtime must expose contextual conversation classification');
assert(universal.includes('function questionSignals('), 'universal runtime must distinguish question signals from exclamations');
assert(universal.includes('contextMethod'), 'universal runtime must retain contextual resolution method');
assert(universal.includes('historyContext()'), 'universal runtime must consult conversation history');
assert(universal.includes('conversationVocabulary'), 'universal runtime must use data-driven conversation vocabulary');
assert(universal.includes('EXCLAMATION_GUARD'), 'exclamatory input must be protected from question classification');
assert(universal.includes('OFFLINE_CONTEXTUAL_CONVERSATION'), 'contextual conversation result must be surfaced explicitly');

console.log('CANONICAL CHAIN TEST PASSED');
console.log(`Ontology entries: ${Object.keys(ontology.COMMODITY_ONTOLOGIES || {}).length}`);
console.log(`Canonical scripts: ${requiredScripts.length}`);
console.log('40-stage cognitive bridge: structurally connected to server/Gemini');
console.log('Contextual discourse: Batch 03 + universal runtime integration validated');
