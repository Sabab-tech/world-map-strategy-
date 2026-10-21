import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
globalThis.window=globalThis;
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async input=>{
  const request=String(input);
  // Browser-oriented runtime modules use bare relative asset paths (for example
  // "countries.json"), while some modules use "./asset.json". Resolve both to
  // repository files in this Node integration test; leave absolute/network URLs
  // to native fetch.
  const isRelativeAsset=!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(request)&&!request.startsWith('/');
  if(isRelativeAsset){
    const relative=request.replace(/^\.\//,'').split(/[?#]/)[0];
    const full=path.resolve(projectRoot,relative);
    if(full!==projectRoot&&!full.startsWith(projectRoot+path.sep))return{ok:false,status:400,json:async()=>{throw new Error('INVALID_TEST_PATH')}};
    try{
      const body=fs.readFileSync(full,'utf8');
      return{ok:true,status:200,json:async()=>JSON.parse(body)};
    }catch(error){
      return{ok:false,status:404,json:async()=>{throw error}};
    }
  }
  return nativeFetch(input);
};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const bridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
assert.equal(await bridge.init(),true,'canonical identity datasets must load from repository assets');
assert.equal(bridge.diagnostics().ready,true,'canonical identity registry must be ready before behavior scoring');
assert.ok(bridge.diagnostics().countryCount>150,'canonical identity registry must load the country roster');
await import('../omega_country_runtime_data_v1.js');
assert.equal(await globalThis.OmegaCountryRuntimeData.ready,true,'shared country identity runtime must initialise');
await import('../omega_country_general_data_runtime_v1.js');
assert.equal(await globalThis.OmegaCountryGeneralDataRuntime.init(),true,'shared country source registry must initialise');
await import('../omega_country_behavior_engine_v1.js');
assert.equal(await globalThis.OmegaCountryBehaviorEngine.init(),true,'country behaviour evidence must initialise');
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

const identity=globalThis.OmegaCountryRuntimeData.resolveCountry('Bangladesh');
assert.equal(identity.countryCode,'BD','canonical identity must resolve before behaviour is scored');
const behavior=globalThis.OmegaCountryBehaviorEngine.getBehaviorProfile(identity.iso3);
assert.notEqual(behavior.status,'ENGINE_ERROR','resolved country must produce a behaviour profile');
const adaptive=globalThis.OmegaOpponentAdaptiveStrategy;
const strategyScore=adaptive.scoreAction('BD','HOUSING_BUILD');
assert.equal(strategyScore.known,true,'country profile must inform the candidate action score');

const autonomy=globalThis.OmegaOpponentAutonomy;
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
const candidate=route.route.candidateEvaluations.find(row=>row.action==='HOUSING_BUILD');
assert(candidate,'autonomy must evaluate the country-specific candidate');
assert.equal(candidate.strategyEvaluation.score,strategyScore.score,
  'autonomy candidate evaluation must consume the same adaptive country score');
assert.equal(candidate.factors.strategy,strategyScore.score,
  'country strategy score must reach the autonomy factor model before queueing');
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