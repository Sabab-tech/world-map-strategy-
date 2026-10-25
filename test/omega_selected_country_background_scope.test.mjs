import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const between = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'missing source marker: ' + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'missing end marker: ' + endMarker);
  return source.slice(start, end);
};

test('Home Ministry turn work uses the player identity, not the browsed country list', () => {
  const source = read('omega_home_ministry_engine_v1.js');
  const turn = between(source, 'function onTurnCommitted(){', 'function processSelectedCountryTurn(event)');
  assert.match(turn, /const cid=playerCountry\(\)/);
  assert.doesNotMatch(turn, /simulationCountryIds\(\)/);
  assert.match(source, /function playerCountry\(\)[\s\S]*?return normalizeCountry\(raw\);/);
  assert.doesNotMatch(between(source, 'function playerCountry(){', 'function rootState()'), /currentActiveCountry|CountryIOS\.activeCountry|OmegaMinistryViewCountry|'USA'/);
});

test('Home Ministry budget panel does not invent USA when country identity is unavailable', () => {
  const source = read('omega_home_ministry_budget_ui_v2.js');
  const country = between(source, 'function country() {', 'function esc(');
  assert.doesNotMatch(country, /\|\|\s*'USA'/);
});

test('factory and resource-research background ticks are scoped to one player country', () => {
  const factory = read('omega_resource_industrial_network_v1.js');
  const factoryBoot = between(factory, 'function boot(){', "boot();");
  const factoryTurn = between(factoryBoot, "g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED'", "g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED'");
  assert.match(factoryTurn, /playerSimulationCountryId\(\)/);
  assert.doesNotMatch(factoryTurn, /runtimeCountryIds\(\)|for\s*\(const countryId of countries\)/);

  const research = read('omega_resource_research_runtime_v1.js');
  assert.match(research, /function processPlayerCountryForTurn\(\)/);
  assert.match(research, /g\.addEventListener\('OMEGA_SIMULATION_TURN_COMMITTED',processPlayerCountryForTurn\)/);
  assert.doesNotMatch(research, /g\.addEventListener\('OMEGA_SIMULATION_TURN_COMMITTED',\(\)=>processAll\(\)\)/);
});

test('resource economy and mine/action pipelines never call world-wide processing on the turn event', () => {
  const economy = read('omega_resource_economy_runtime_v2.js');
  const runTurn = between(economy, 'function runTurn(){', 'var uiOriginal=null;');
  assert.match(runTurn, /playerSimulationCountryId\(\)/);
  assert.match(runTurn, /endowment\.extractCountry\(cid\)/);
  assert.doesNotMatch(runTurn, /extractAll\(\)|countries\(\)\.forEach|GlobalTrade\.processAll/);
  const turnListener = between(economy, "g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED'", "g.addEventListener('OMEGA_READY'");
  assert.match(turnListener, /playerSimulationCountryId\(\)/);

  const actions = read('omega_resource_action_execution_runtime.js');
  assert.match(actions, /function onTurn\(\)\{const countryId=playerSimulationCountryId\(\);if\(countryId\)return processCountry\(countryId\)/);
  assert.match(actions, /g\.addEventListener\('OMEGA_SIMULATION_TURN_COMMITTED',onTurn\)/);

  const policy = read('omega_resource_strategic_policy_runtime_v1.js');
  const turnIndex = policy.indexOf("g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED'");
  assert.notEqual(turnIndex, -1);
  const policyTurn = policy.slice(turnIndex, policy.indexOf('\n }', turnIndex));
  assert.match(policyTurn, /playerSimulationCountryId\(\)/);
  assert.match(policyTurn, /processPowerCountry\(selected\)/);
  assert.doesNotMatch(policyTurn, /for\s*\(const c of countryIds\(\)\)/);
});

test('global market and trade background handlers do not write or tick every country', () => {
  const market = read('omega_global_market_system.js');
  const marketTurn = between(market, 'function onTurn(){', 'function diagnostics(){');
  assert.match(marketTurn, /playerSimulationCountryId\(\)/);
  assert.match(marketTurn, /rebuildCountry\(selected\)/);
  assert.doesNotMatch(marketTurn, /for\s*\(const c of countries\(\)\)/);

  const trade = read('omega_global_trade_system.js');
  assert.match(trade, /function onTurn\(\)\{return processPlayerCountryTurn\(\);\}/);
  assert.match(trade, /function processPlayerCountryTurn\(\)/);
});
