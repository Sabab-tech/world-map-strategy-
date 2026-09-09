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

assert(universal.includes("loadScript('omega_language_system.js')"), 'universal runtime must be able to recover the language layer');
assert(universal.includes("loadScript('omega_production_semantic_runtime_v3.js')"), 'universal runtime must load the production semantic runtime');
assert(universal.includes('new URL(p,document.baseURI)'), 'universal runtime assets must be document-relative');
assert(server.includes("app.post('/api/ai/minister-consult'"), 'minister consultation endpoint missing');
assert(server.includes("app.post('/api/ai/semantic-query'"), 'semantic query endpoint missing');

console.log('CANONICAL CHAIN TEST PASSED');
console.log(`Ontology entries: ${Object.keys(ontology.COMMODITY_ONTOLOGIES || {}).length}`);
console.log(`Canonical scripts: ${requiredScripts.length}`);
