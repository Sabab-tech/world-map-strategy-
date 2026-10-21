const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'server_bootstrap.js'), 'utf8');
const ministerBootstrap = fs.readFileSync(path.join(root, 'omega_minister_bootstrap.js'), 'utf8');

const start = '<!-- OMEGA_CANONICAL_PRODUCTION_RUNTIME_START -->';
const end = '<!-- OMEGA_CANONICAL_PRODUCTION_RUNTIME_END -->';
const startAt = html.indexOf(start);
const endAt = html.indexOf(end);
assert.ok(startAt >= 0 && endAt > startAt, 'static index must declare the canonical production runtime block');

const runtimeBlock = html.slice(startAt, endAt);
const staticSources = [...runtimeBlock.matchAll(/<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi)].map(m => m[2]);
const expected = [
  'omega_language_system.js',
  'omega_language_batch03_semantic_extension.js',
  'omega_universal_entity_identity_engine.js',
  'omega_country_semantic_bridge.js',
  'omega_resource_semantic_bridge.js',
  'offline_semantic_brain.js',
  'offline_query_engine.js',
  'omega_production_semantic_runtime_v3.js',
  'resource_ministry_engine.js',
  'omega_resource_part04_identity_runtime.js',
  'omega_resource_part05_reserve_extraction_runtime.js',
  'omega_resource_production_capacity_contract_v1.js',
  'omega_resource_realism_runtime_v1.js',
  'omega_resource_production_model_v2.js',
  'omega_resource_research_runtime_v1.js',
  'omega_minister_state_system.js',
  'minister_capability_engine.js',
  'omega_minister_runtime_v2.js',
  'minister_behavior_engine.js',
  'omega_minister_integration.js',
  'minister_communication_engine.js',
  'minister_recruitment_engine.js',
  'omega_minister_bootstrap.js',
  'omega_ai_integrity_layer.js',
  'omega_ai_integrity_canonical_bridge.js',
  'omega_cognitive_engine.js',
  'omega_reasoning_dispatcher.js',
  'omega_universal_ai_runtime.js',
  'omega_minister_intelligence_pipeline_v1.js',
  'omega_ai_context_bridge.js',
  'omega_resource_country_boundary_guard.js',
  'omega_resource_site_integrity_v1.js',
  'omega_resource_strategic_policy_runtime_v1.js',
  'omega_resource_endowment_runtime.js',
  'omega_resource_logistics_runtime_v1.js',
  'omega_resource_economy_runtime_v2.js',
  'omega_resource_national_demand_runtime_v1.js',
  'omega_resource_industrial_network_v1.js',
  'omega_resource_authoritative_adapter.js',
  'omega_resource_action_execution_runtime.js',
  'omega_opponent_deep_memory_system.js',
  'omega_opponent_memory_trace_log_system.js',
  'omega_opponent_intelligence_evolution_system.js',
  'omega_country_general_data_runtime_v1.js',
  'omega_country_data_gateway_v1.js',
  'omega_country_behavior_engine_v1.js',
  'omega_opponent_adaptive_strategy_system.js',
  'omega_opponent_autonomy_system.js',
  'omega_global_market_system.js',
  'omega_global_trade_system.js',
  'omega_opponent_treaty_lifecycle_system.js',
  'omega_opponent_second_order_consequence_system.js',
];
assert.deepEqual(staticSources, expected, 'GitHub Pages runtime assets must be loaded exactly once in canonical order');
for (const src of staticSources) {
  assert.ok(!src.startsWith('/'), 'GitHub Pages assets must use project-subpath-safe relative URLs: ' + src);
  assert.ok(fs.existsSync(path.join(root, src)), 'Missing checked-in production runtime asset: ' + src);
}

const canonicalArray = bootstrap.match(/const CANONICAL_AI_SCRIPTS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(canonicalArray, 'Node server must expose the same canonical runtime asset list');
const nodeSources = [...canonicalArray[1].matchAll(/'([^']+\.js)'/g)].map(m => m[1]);
assert.deepEqual(nodeSources, expected, 'Node server and GitHub Pages must share one runtime asset order');

for (const src of ['minister_behavior_engine.js', 'omega_minister_integration.js', 'minister_communication_engine.js']) {
  assert.ok(ministerBootstrap.includes("src:'" + src + "'"), 'minister bootstrap must use relative script URLs: ' + src);
}
assert.ok(ministerBootstrap.includes("fetch('minister_system_config.json'"), 'minister config fetch must be project-subpath-safe');
assert.ok(ministerBootstrap.includes("fetch('ministers.json'"), 'minister profile fetch must be project-subpath-safe');
assert.ok(!/src:'\/(?:minister_behavior_engine|omega_minister_integration|minister_communication_engine)\.js'/.test(ministerBootstrap),
  'minister bootstrap must not inject root-relative scripts that break on GitHub Pages');

console.log('OMEGA STATIC PAGES MINISTER RUNTIME: PASS');
console.log('Runtime assets are present and loaded exactly once in canonical order:', expected.length);
console.log('Node and GitHub Pages runtime order parity: PASS');
console.log('Minister bootstrap relative asset/config/data paths: PASS');
