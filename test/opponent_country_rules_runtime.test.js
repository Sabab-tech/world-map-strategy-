import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../opponent_country_rules.js',import.meta.url),'utf8');

const countries=JSON.parse(fs.readFileSync(new URL('../countries.json',import.meta.url),'utf8'));
const populationData=JSON.parse(fs.readFileSync(new URL('../population.json',import.meta.url),'utf8'));
const economyData=JSON.parse(fs.readFileSync(new URL('../economy.json',import.meta.url),'utf8'));
const citiesData=JSON.parse(fs.readFileSync(new URL('../cities.json',import.meta.url),'utf8'));
const relationsData=JSON.parse(fs.readFileSync(new URL('../relations.json',import.meta.url),'utf8'));

let resourceRuntime={
  production:{crude_oil:80},
  consumption:{crude_oil:100},
  reserves:{crude_oil:30},
  inventory:{crude_oil:20}
};

const queued=[],actions=new Map(),handlers=new Map(),listeners=new Map();
const state={
  simulation:{turn:1,session:{playerCountryId:'AAA'}},
  population:{BD:{labor:{available:100,skilled:50}}},
  resource:{BD:{demand:{total:100,food:100,energy:100},supply:{effective:80,total:80,food:80,energy:80},inventory:20,reserve:30}},
  economy:{BD:{consumerDemand:{value:100,trend:'RISING'},investmentDemand:{value:100,trend:'RISING'},output:90,revenue:100,expenditure:80}},
  cities:{BD:{housing:{required:100,available:80}}},
  industry:{BD:{inputs:{required:80,available:60},demand:100,effectiveCapacity:120,currentOutput:90,capacity:120,output:90}},
  infrastructure:{BD:{load:80,capacity:120}},
  finance:{BD:{revenue:100,expenditure:80,capitalAvailable:50,operationalRequirement:40,liquidity:100}},
  trade:{BD:{imports:40,exports:20,externalDemand:80,currentExports:20,routeCapacity:100,routeLoad:20}},
  interior:{BD:{stability:{trend:'STABLE'},corruption:{trend:'STABLE'},serviceCapacity:100}},
  defense:{BD:{threatLevel:{trend:'LOW'},readiness:{trend:'RISING'}}},
  technology:{BD:{capability:{trend:'STABLE'},r_and_d:{trend:'RISING'}}},
  health:{BD:{capacity:100,pressure:{trend:'STABLE'},demand:100}},
  education:{BD:{capacity:100,demand:100}},
  projects:{BD:{maintenanceBacklog:{trend:'STABLE'}}},
  relations:{BD:{foreignTension:{trend:'STABLE'}}},
  events:[]
};

const fake={
  console:{log(){},error(){}},Map,Set,WeakMap,Object,Array,Number,String,JSON,Promise,Math,Date,
  CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
  addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},
  fetch:async()=>({ok:true,json:async()=>countries}),
  Game:{state},
  ResourceMinistryEngine:{getIntegratedResourceState(){return resourceRuntime;}},
  Omega:{
    Simulation:{clock:{turn:1},getPlayerCountryId(){return'AAA';},enqueueCommand(c){queued.push(c);return c;}},
    MinistryInteroperability:{
      registerAction(id,d){actions.set(id,d);return d;},
      registerCommandHandler(id,owner,fn){handlers.set(id,{owner,fn});return{id,owner};}
    }
  }
};

vm.createContext(fake);
vm.runInContext(source,fake,{filename:'opponent_country_rules.js'});
const api=fake.Omega.OpponentCountryRules;

assert.equal(api.VERSION,'4.2.0');
await api.initialize({fetchCountries:true});

api.setDataset('countries',countries);
api.setDataset('population',populationData);
api.setDataset('economy',economyData);
api.setDataset('cities',citiesData);
api.setDataset('relations',relationsData);

const bd=await api.evaluateCountry('BD',1);
assert.equal(bd.status,'COMPLETE');
assert.equal(bd.datasetObservations.population_2015.status,'AVAILABLE');
assert.equal(bd.datasetObservations.annual_growth_rate.status,'AVAILABLE');
assert.equal(bd.datasetObservations.gdp.status,'AVAILABLE');
assert.equal(bd.signals.POPULATION.value,populationData.BANGLADESH.population_2015);
assert.equal(bd.signals.POPULATION_GROWTH.value,populationData.BANGLADESH.annual_growth_rate);
assert.equal(bd.signals.GDP_GROWTH.value,economyData.BANGLADESH.gdp_growth);
assert.equal(bd.signals.INFLATION.value,economyData.BANGLADESH.inflation);
assert.equal(bd.signals.UNEMPLOYMENT.value,economyData.BANGLADESH.unemployment_rate);
assert.equal(bd.signals.FOREIGN_CURRENCY.value,economyData.BANGLADESH.reserves);
assert.equal(bd.signals.POPULATION.provenance.authoritative,false);

const deficit=bd.runtimeAnalysis.measurements.find(x=>x.kind==='RESOURCE_FLOW'&&x.resourceId==='crude_oil');
assert.ok(deficit);
assert.equal(deficit.status,'DEFICIT');
assert.equal(deficit.required,100);
assert.equal(deficit.available,80);
assert.equal(deficit.gap,20);
assert.equal(deficit.candidates[0].action,'IMPORT');
assert.equal(deficit.candidates[0].quantity,20);

resourceRuntime={production:{crude_oil:120},consumption:{crude_oil:100},reserves:{crude_oil:30},inventory:{crude_oil:20}};
const surplusRun=await api.evaluateCountry('BD',2);
const surplus=surplusRun.runtimeAnalysis.measurements.find(x=>x.kind==='RESOURCE_FLOW'&&x.resourceId==='crude_oil');
assert.equal(surplus.status,'SURPLUS');
assert.equal(surplus.candidates[0].action,'EXPORT');
assert.equal(surplus.candidates[0].quantity,20);

resourceRuntime={production:{crude_oil:100},consumption:{crude_oil:100},reserves:{crude_oil:30},inventory:{crude_oil:20}};
const balancedRun=await api.evaluateCountry('BD',3);
const balanced=balancedRun.runtimeAnalysis.measurements.find(x=>x.kind==='RESOURCE_FLOW'&&x.resourceId==='crude_oil');
assert.equal(balanced.status,'BALANCED');
assert.equal(balanced.candidates[0].action,'HOLD');
assert.equal(balanced.candidates[0].quantity,0);

const runtimeDecision=bd.decisions.find(x=>x.decisionOrigin==='RUNTIME_CALCULATION'&&x.runtimeMeasurement?.kind==='RESOURCE_FLOW');
assert.ok(runtimeDecision);
assert.equal(runtimeDecision.selectedActions[0],'IMPORT');

const importedScenario=runtimeDecision.scenarioId;
assert.ok(api.SCENARIO_REGISTRY.some(x=>x.id===importedScenario));
const importHandler=handlers.get('OCR_V42_'+importedScenario);
assert.ok(importHandler);

const txStore=new Map();
const tx={get(k){return txStore.get(k);},set(k,v){txStore.set(k,v);}};
const runtimeHandled=importHandler.fn({
  commandId:'runtime-import-test',
  countryId:'BD',
  sourceMinistryId:importHandler.owner,
  payload:{opponentDecision:runtimeDecision}
},{stateTransaction:tx,simulationTurn:1,emitEvent(){}});
assert.equal(runtimeHandled.accepted,true);
assert.equal(runtimeHandled.batch.executionApplied,false);
assert.equal(runtimeHandled.batch.plans[0].transactionId!==undefined,true);
assert.equal(runtimeHandled.batch.plans[0].quantity,20);
assert.equal(runtimeHandled.batch.plans[0].stateMutationAuthority,false);
assert.equal(runtimeHandled.batch.plans[0].requirements.amountKnown,true);
assert.ok(txStore.has(importHandler.owner+'.executionOrders'));

const projectDecision={
  decisionId:'DEC-PROJECT-1',countryId:'BD',simulationTurn:4,scenarioId:'FACTORY_EXPANSION',
  selectedActions:['DOMESTIC_EXPANSION'],evidence:{test:true}
};
const projectHandler=handlers.get('OCR_V42_FACTORY_EXPANSION');
assert.ok(projectHandler);
const projectHandled=projectHandler.fn({countryId:'BD',sourceMinistryId:projectHandler.owner,payload:{opponentDecision:projectDecision}},
  {stateTransaction:tx,simulationTurn:4,emitEvent(){}});
assert.equal(projectHandled.accepted,true);
assert.equal(projectHandled.batch.executionApplied,false);
assert.equal(projectHandled.batch.plans[0].stateMutationAuthority,false);
assert.ok(txStore.has('projects.executionOrders'));

const outcome=api.handleOutcome({countryId:'BD',projectId:projectHandled.batch.plans[0].projectId,status:'COMPLETED',eventType:'OMEGA_PROJECT_COMPLETED',impactedNodes:['industry'],affectedActors:['AAA']});
assert.ok(outcome.dirty.includes('OUTPUT'));
assert.ok(outcome.affectedActors.includes('AAA'));

const trace=api.getTrace();
assert.ok(trace.some(x=>x.layer==='L26_EVIDENCE_TRACE'));
assert.ok(!trace.some(x=>x.type==='RUNTIME_COVERAGE'));

const diagnostics=api.diagnostics();
assert.equal(diagnostics.layers,28);
assert.ok(diagnostics.executedLayers>0 && diagnostics.executedLayers<=diagnostics.layers);
assert.ok(diagnostics.unexecutedLayers>=0);
assert.ok(diagnostics.runtimeCalculation.enginePresent);
assert.ok(diagnostics.approvedPolicyLayer.scenarioRules>=20);
assert.equal(diagnostics.approvedPolicyLayer.numericStateTransitions,0);
assert.equal(diagnostics.dataTruth.syntheticFallbackTraceEntries,0);

const saved=api.saveState();
assert.equal(saved.schemaVersion,6);
api.loadState(saved);

console.log('OMEGA AUTONOMOUS WORLD CORE TEST PASSED');
console.log(JSON.stringify({
  countries:countries.length,
  activeScenarios:bd.scenarios.length,
  policyDecisions:bd.decisions.filter(x=>x.decisionOrigin!=='RUNTIME_CALCULATION').length,
  runtimeComparisons:diagnostics.runtimeCalculation.automaticComparisons,
  deficitAction:deficit.candidates[0].action,
  surplusAction:surplus.candidates[0].action,
  balancedAction:balanced.candidates[0].action,
  transactionQuantity:runtimeHandled.batch.plans[0].quantity,
  executedLayers:diagnostics.executedLayers,
  unexecutedLayers:diagnostics.unexecutedLayers
}));
