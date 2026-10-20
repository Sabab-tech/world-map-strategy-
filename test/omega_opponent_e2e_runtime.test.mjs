import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async input => {
  const relative = String(input).replace(/^\\.?\\//, '').split(/[?#]/)[0];
  const fullPath = path.resolve(repoRoot, relative);
  if (!fullPath.startsWith(repoRoot + path.sep)) return { ok:false, status:403, json:async()=>{throw new Error('PATH_OUTSIDE_REPO');} };
  try {
    const body = await fs.readFile(fullPath, 'utf8');
    return { ok:true, status:200, json:async()=>JSON.parse(body) };
  } catch (_) {
    return { ok:false, status:404, json:async()=>{throw new Error('NOT_FOUND:'+relative);} };
  }
};

globalThis.Game={state:{
  simulation:{turn:1,simulationTurn:1},
  finance:{BD:{available:100000,reserves:120000,committed:0}},
  economy:{BD:{gdp:1000000,debt:100000,productionCapacity:500}},
  population:{BD:{labor:{available:10000}}},
  resource:{BD:{inventory:{steel:10000},production:{steel:100},consumption:{steel:50},reserves:{steel:20000}}},
  cities:{BD:{housing:{available:1000,required:1200}}},
  projects:{BD:{registry:[]}},
  military:{BD:{forceStructure:{personnel:1000,units:10,organizedPersonnel:1000},readiness:60,trainingQueue:[],equipmentInventory:{}}},
  foreign:{BD:{relations:{SA:{overall:75,trade:80,trust:70,political:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}}},
  trade:{BD:{relations:{SA:{overall:75,trade:80,trust:70}},marketPrice:{crude_oil:80},routeCapacity:{crude_oil:2000000}}}
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const bridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await bridge.init();
await import('../omega_country_runtime_data_v1.js');
assert.equal(await globalThis.OmegaCountryRuntimeData.ready,true,'canonical country runtime must load');
await import('../omega_country_general_data_runtime_v1.js');
assert.equal(await globalThis.OmegaCountryGeneralDataRuntime.init(),true,'source-backed country registry must load');
await import('../omega_country_behavior_engine_v1.js');
assert.equal(await globalThis.OmegaCountryBehaviorEngine.init(),true,'country behaviour engine must load');
const canonicalBangladesh=bridge.resolveCountry('Bangladesh');
assert.equal(canonicalBangladesh?.id,'BD','country identity must resolve before decisions are scored');
const countryProfile=globalThis.OmegaCountryBehaviorEngine.getBehaviorProfile('Bangladesh');
assert.notEqual(countryProfile.status,'ENGINE_ERROR','country identity must build a behaviour profile');
assert.equal(countryProfile.identity.countryCode,'BD');
assert.equal(countryProfile.metricSources.gdpUsd.isCurrentGameState,true,'live Game.state GDP must override historical country GDP');
assert.equal(countryProfile.metricSources.gdpUsd.year,null,'a live game-state value must not inherit the historical observation year');
assert.equal(countryProfile.metricSources.gdpUsd.confidence,1,'live game-state evidence must be distinguished from historical data');
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_simulation_runtime.js');
await import('../omega_opponent_deep_memory_system.js');
await import('../omega_opponent_adaptive_strategy_system.js');
await import('../opponent_country_rules.js');
await import('../omega_opponent_autonomy_system.js');
await import('../omega_global_trade_system.js');
await import('../omega_opponent_treaty_lifecycle_system.js');
await import('../omega_opponent_second_order_consequence_system.js');

const rules=globalThis.Omega.OpponentCountryRules;
const evalResult=await rules.evaluateCountry('BD',1);
assert.equal(evalResult.countryId,'BD');
assert.equal(evalResult.status,'COMPLETE');

const autonomy=globalThis.OmegaOpponentAutonomy;
const adaptive=globalThis.OmegaOpponentAdaptiveStrategy;
const candidateScore=adaptive.scoreAction('Bangladesh','HOUSING_BUILD');
assert.equal(candidateScore.known,true,'country profile must reach the adaptive candidate scorer');
const route=autonomy.routeDecision({
  decisionId:'E2E-HOUSING-1',
  countryId:'BD',
  scenarioId:'HOUSING_SHORTAGE',
  candidateActions:['HOUSING_BUILD'],
  runtimeMeasurement:{
    required:1200,available:1000,gap:200,cost:1000,labor:50,materials:{steel:50},durationTurns:1,
    selected:{action:'HOUSING_BUILD',quantity:200,cost:1000,labor:50,materials:{steel:50},durationTurns:1}
  }
},1);
assert.equal(route.status,'READY_TO_QUEUE');
assert(route.command);
assert.equal(route.route.selectedAction,'HOUSING_BUILD');
assert.equal(route.route.selected.strategyEvaluation.known,true,'the selected candidate must carry the country strategy score');
assert.equal(route.route.selected.strategyEvaluation.profile.behaviorSource,'OMEGA_COUNTRY_BEHAVIOR_ENGINE_V1',
  'decision selection must consume the country behaviour profile, not only resolve a country label');
assert.ok(route.route.selected.strategyEvaluation.confidence>=0&&route.route.selected.strategyEvaluation.confidence<=1);
const scoredHousing=route.route.candidateEvaluations.find(x=>x.action==='HOUSING_BUILD');
assert.equal(scoredHousing.strategyEvaluation.score,candidateScore.score,'the real autonomy candidate must use the same country-specific scorer');
const sim=globalThis.Omega.Simulation;
await sim.advance(1);
assert.equal(globalThis.Game.state.projects.BD.registry[0].status,'UNDER_CONSTRUCTION');
await sim.advance(1);
await sim.advance(1);
assert.equal(globalThis.Game.state.cities.BD.housing.available,1200);
assert.equal(globalThis.Game.state.projects.BD.registry[0].status,'COMPLETED');
assert.equal(globalThis.Game.state.resource.BD.inventory.steel,9950);
assert(globalThis.Game.state.cabinet.BD.autonomyReservations.some(x=>x.status==='RELEASED'));
assert(globalThis.Game.state.simulation.worldStateRevision>=3);
assert(globalThis.OmegaOpponentDeepMemory?.diagnostics().handlerInstalled===true);
console.log('OMEGA OPPONENT E2E RUNTIME TEST PASSED');