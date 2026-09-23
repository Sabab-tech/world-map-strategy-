import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../opponent_country_rules.js',import.meta.url),'utf8');
const queued=[],actions=new Map(),handlers=new Map();
const state={
  simulation:{turn:4,session:{playerCountryId:'AAA'}},
  economy:{BBB:{investmentDemand:{trend:'RISING'},consumerDemand:{trend:'RISING'},revenue:80,expenditure:120,output:50}},
  resource:{BBB:{demand:{total:100,food:80,energy:120},supply:{effective:50,total:60,food:30,energy:90},inventory:20,reserve:40}},
  population:{BBB:{population:1000,growth_rate:{trend:'RISING'},labor:{available:40,skilled:20},migrationPressure:{trend:'RISING'}}},
  cities:{BBB:{housing:{required:100,available:70}}},
  industry:{BBB:{inputs:{required:80,available:40},demand:100,effectiveCapacity:60,currentOutput:50,capacity:60,output:50}},
  infrastructure:{BBB:{load:120,capacity:100}},
  finance:{BBB:{revenue:80,expenditure:120,capitalAvailable:200,operationalRequirement:100,liquidity:150,foreignCurrency:100}},
  trade:{BBB:{imports:120,exports:80,externalDemand:200,currentExports:80,routeCapacity:100,routeLoad:40}},
  interior:{BBB:{stability:{trend:'FALLING'},corruption:{trend:'RISING'},serviceCapacity:100}},
  defense:{BBB:{threatLevel:{trend:'RISING'},readiness:{trend:'FALLING'}}},
  technology:{BBB:{capability:{trend:'FALLING'},r_and_d:{trend:'RISING'}}},
  health:{BBB:{capacity:80,pressure:{trend:'RISING'},demand:100}},
  education:{BBB:{capacity:80,demand:100}},
  projects:{BBB:{maintenanceBacklog:{trend:'RISING'}}},
  relations:{BBB:{foreignTension:{trend:'RISING'},targetCountryId:'CCC'}},
  events:[{eventType:'EXTERNAL_SHOCK_ACTIVE',countryId:'BBB',resolved:false,impactedSignals:['RESOURCE_STOCK']}]
};
const listeners=new Map();
const sandbox={
  console,Map,Set,WeakMap,Object,Array,Number,String,JSON,Promise,Math,
  CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
  addEventListener(type,fn){(listeners.get(type)||listeners.set(type,[]).get(type)).push(fn);},
  fetch:async()=>({ok:true,json:async()=>({countries:[{code:'AAA',name:'Alpha'},{code:'BBB',name:'Bravo'},{code:'CCC',name:'Charlie'}]})}),
  Game:{state},
  Omega:{
    Simulation:{clock:{turn:4},getPlayerCountryId(){return 'AAA';},enqueueCommand(c){queued.push(c);return c;}},
    MinistryInteroperability:{
      registerAction(id,d){actions.set(id,d);return d;},
      registerCommandHandler(id,owner,fn){handlers.set(id,{owner,fn});return {id,owner};}
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'opponent_country_rules.js'});
const api=sandbox.Omega.OpponentCountryRules;
assert.equal(api.VERSION,'4.2.0');
await api.initialize({fetchCountries:true,turn:4});
assert.equal((await api.listCountryIds()).join(','),'AAA,BBB,CCC');

const profile=api.getDatasetProfile('countries');
assert.ok(profile && profile.schema && profile.identityFields.length>0);
api.setDataset('population',[{code:'BBB',population_total:1234,growth_rate:'RISING'}]);
const populationProfile=api.getDatasetProfile('population');
assert.ok(populationProfile && populationProfile.fieldMeaning.POPULATION);
assert.ok(api.getHydratedState('BBB').signals.POPULATION.status==='AVAILABLE');
assert.equal(api.getHydratedState('BBB').signals.POPULATION.value,1234);

assert.equal(api.evaluateDirection('INFLATION',{trend:'RISING'},'RISING').state,'TRUE');
const run=await api.evaluateCountry('BBB',4);
assert.equal(run.status,'COMPLETE');
assert.ok(Array.from(run.scenarios).some(x=>x.id==='RESOURCE_DEFICIT'));
assert.ok(Array.from(run.scenarios).some(x=>x.id==='FOOD_SHORTAGE'));
assert.ok(Array.from(run.scenarios).some(x=>x.id==='ENERGY_SHORTAGE'));
assert.ok(Array.from(run.scenarios).some(x=>x.id==='HOUSING_SHORTAGE'));
assert.ok(run.gapPressure.gaps.RESOURCE.required===100);
assert.ok(run.gapPressure.gaps.RESOURCE.available===50);
assert.equal(run.reconciliation.status,'PASS');

const projectDecision=Array.from(run.decisions).find(d=>Array.from(d.selectedActions||[]).some(a=>String(api.ACTION_TYPES[a]?.execution||'').includes('PROJECT')));
assert.ok(projectDecision);
const projectAction=Array.from(projectDecision.selectedActions).find(a=>String(api.ACTION_TYPES[a]?.execution||'').includes('PROJECT'));
const projectAid='OCR_V42_'+projectDecision.scenarioId;
const projectHandler=handlers.get(projectAid);
assert.ok(projectHandler);
const txContext={get(){return undefined;},set(){}};
const handled=projectHandler.fn({commandId:'cmd-project',countryId:'BBB',sourceMinistryId:projectHandler.owner,payload:{opponentDecision:{...projectDecision,selectedActions:[projectAction]}}},{stateTransaction:txContext,simulationTurn:4,emitEvent(){}});
assert.equal(handled.accepted,true);
assert.equal(handled.batch.executionApplied,false);
assert.ok(Array.from(handled.batch.plans).some(x=>x.projectId));

const txScenario=run.scenarios.find(x=>x.actions.includes('IMPORT'));
assert.ok(txScenario);
const txHandler=handlers.get('OCR_V42_'+txScenario.id);
const txDecision={...projectDecision,scenarioId:txScenario.id,decisionId:'DEC-TX-1',selectedActions:['IMPORT']};
const txHandled=txHandler.fn({commandId:'cmd-tx',countryId:'BBB',sourceMinistryId:txHandler.owner,payload:{opponentDecision:txDecision}},{stateTransaction:txContext,simulationTurn:4,emitEvent(){}});
assert.equal(txHandled.accepted,true);
assert.ok(Array.from(txHandled.batch.plans).some(x=>x.transactionId));

const policyHandler=handlers.get('OCR_V42_'+run.scenarios.find(x=>x.actions.includes('DEMAND_MANAGEMENT'))?.id);
if(policyHandler){
  const policyDecision={...projectDecision,scenarioId:run.scenarios.find(x=>x.actions.includes('DEMAND_MANAGEMENT'))?.id,decisionId:'DEC-POL-1',selectedActions:['DEMAND_MANAGEMENT']};
  const policyHandled=policyHandler.fn({commandId:'cmd-policy',countryId:'BBB',sourceMinistryId:policyHandler.owner,payload:{opponentDecision:policyDecision}},{stateTransaction:txContext,simulationTurn:4,emitEvent(){}});
  assert.equal(policyHandled.accepted,true);
  assert.ok(Array.from(policyHandled.batch.plans).some(x=>x.policyId));
  const outcomePolicy=api.handleOutcome({countryId:'BBB',policyId:policyHandled.batch.plans.find(x=>x.policyId).policyId,scenarioId:policyDecision.scenarioId,status:'COMPLETED',eventType:'OMEGA_POLICY_EXECUTED',affectedActors:['CCC']});
  assert.ok(outcomePolicy.reconciliation);
}
const outcome=api.handleOutcome({countryId:'BBB',projectId:handled.batch.plans[0].projectId,scenarioId:projectDecision.scenarioId,status:'COMPLETED',eventType:'OMEGA_PROJECT_COMPLETED',impactedNodes:['industry'],affectedActors:['CCC']});
assert.ok(Array.from(outcome.dirty).includes('OUTPUT'));
assert.ok(trace.some(x=>x.type==='EXECUTION_STARTED'));
assert.ok(trace.some(x=>x.type==='NEXT_EVALUATION_SCHEDULED'));
assert.ok(Array.from(outcome.affectedActors).includes('CCC'));

const trace=api.getTrace();
const traceLayers=new Set(trace.map(x=>x.layer));
for(const layer of api.LAYERS.map(x=>x.id))assert.ok(traceLayers.has(layer),layer+' missing');
assert.ok(trace.some(x=>x.layer==='L26_EVIDENCE_TRACE'));

const firstForecast=run.forecasts;
state.economy.BBB.output=60;
const second=await api.evaluateCountry('BBB',5);
assert.equal(second.status,'COMPLETE');
assert.ok(Object.keys(second.forecasts.trend).length>=1);

const reasoning=api.setReasoningAdapter(async ctx=>({scenarioCount:ctx.scenarios.length}));
assert.equal(reasoning.status,'BOUND');
const reasoned=await api.reason('BBB',5);
assert.equal(reasoned.mutationAuthority,false);
assert.equal(reasoned.status,'RETURNED');

const diagnostics=api.diagnostics();
assert.equal(diagnostics.layers,28);
assert.equal(diagnostics.runtimeLayers,28);
assert.equal(diagnostics.scenarioCount,25);
assert.equal(diagnostics.directionalSignals,63);
assert.equal(diagnostics.actionTypes,27);
assert.equal(diagnostics.traceLayers.length,28);

const saved=api.saveState();
assert.equal(saved.schemaVersion,6);
api.loadState(saved);

console.log('OMEGA AUTONOMOUS WORLD CORE TEST PASSED');
console.log(JSON.stringify({
  layers:diagnostics.layers,
  scenarios:diagnostics.scenarioCount,
  directionalSignals:diagnostics.directionalSignals,
  actionTypes:diagnostics.actionTypes,
  activeScenarios:run.scenarios.length,
  decisions:run.decisions.length,
  traceEntries:trace.length,
  projectPlans:handled.batch.plans.length,
  transactionPlans:txHandled.batch.plans.length,
  queued:queued.length
}));
