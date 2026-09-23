import assert from 'node:assert/strict';

globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent {
  constructor(type,init={}){this.type=String(type);this.detail=init.detail;}
};
if(typeof globalThis.dispatchEvent!=='function'){
  const target=new EventTarget();
  globalThis.dispatchEvent=target.dispatchEvent.bind(target);
  globalThis.addEventListener=target.addEventListener.bind(target);
  globalThis.removeEventListener=target.removeEventListener.bind(target);
}

globalThis.Game={
  state:{
    simulation:{turn:1,simulationTurn:1},
    finance:{
      BD:{available:100000,reserves:120000,committed:1000},
      SA:{available:200000,reserves:300000}
    },
    economy:{
      BD:{gdp:460000,debt:210000,production:500,productionCapacity:600},
      SA:{gdp:650000,debt:120000}
    },
    population:{
      BD:{labor:{available:5000,skilled:1200}}
    },
    resource:{
      BD:{inventory:{steel:10000},production:{steel:500},consumption:{steel:400},reserves:{steel:20000}}
    },
    cities:{
      BD:{housing:{available:1000,required:1200}}
    },
    projects:{
      BD:{registry:[]}
    },
    military:{
      BD:{forceStructure:{personnel:1000,units:10,organizedPersonnel:1000,personnelPerUnit:100},readiness:60,trainingQueue:[],equipmentQueue:[],equipmentInventory:{}},
      SA:{forceStructure:{personnel:50000,units:500},readiness:80}
    },
    relations:{
      BD:{
        SA:{overall:75,trade:80,trust:70,trade_agreement:true,sanctions:false,war_state:false}
      }
    },
    foreign:{
      BD:{
        relations:{SA:{overall:75,trade:80,trust:70,trade_agreement:true,sanctions:false,war_state:false}},
        treaties:{}
      }
    },
    trade:{BD:{relations:{SA:{overall:75,trade:80,trust:70}},marketPrice:{crude_oil:80},offerBook:{crude_oil:{unitPrice:80}},routeCapacity:{crude_oil:2000000}},SA:{offerBook:{crude_oil:{unitPrice:78}}}}
  }
};

await import('../omega_country_semantic_bridge.js');
const countryBridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await countryBridge.init();
globalThis.ResourceMinistryEngine={
  getIntegratedResourceState(countryId){
    return {countryId,inventory:{crude_oil:1000000},production:{crude_oil:500000},reserves:{crude_oil:5000000}};
  },
  getCountryResourceProfile(countryId){
    return {countryId,market:{prices:{crude_oil:countryId==='SA'?78:120}}};
  },
  deposits:[{countryCode:'SA',resourceId:'crude_oil'}]
};

await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_simulation_runtime.js');
await import('../opponent_country_rules.js');
await import('../omega_opponent_autonomy_system.js');

const autonomy=globalThis.OmegaOpponentAutonomy;
assert(autonomy,'autonomy API missing');
assert(autonomy.diagnostics().queueBridgeInstalled===true,'opponent queue bridge not installed');

const canonical=autonomy.canonicalCountry('Bangladesh');
assert.equal(canonical.id,'BD');
assert.equal(canonical.authority,'OMEGA_CANONICAL_COUNTRY_IDENTITY');
const namedRoute=autonomy.routeSubject('import','Bangladesh','Saudi Arabia');
assert.equal(namedRoute.countryId,'BD');
assert.equal(namedRoute.targetCountryId,'SA');
const kernelEvaluation=await globalThis.Omega.OpponentCountryRules.evaluateCountry('Bangladesh',1);
assert.equal(kernelEvaluation.countryId,'BD');

const sourceRoute=autonomy.findDataSources('treasury','Bangladesh');
assert.equal(sourceRoute.countryId,'BD');
assert.equal(sourceRoute.primaryMinistry,'finance');
const eventRoute=autonomy.resolveEventRoute('OMEGA_RESOURCE_IMPORT_REQUEST_SENT','Bangladesh');
assert.equal(eventRoute.countryId,'BD');
assert.equal(eventRoute.owner,'trade');


const importRoute=autonomy.routeSubject('import','BD','SA');
assert.equal(importRoute.primary,'trade');
assert.deepEqual(importRoute.targetCountryId,'SA');
assert(importRoute.files.includes('relations.json'));

const evidence=autonomy.collectEvidence('BD',['treasury','labor','materials','debt','housing','military','relations'],'SA');
for(const key of ['treasury','labor','materials','debt','housing','military','relations'])assert(evidence.subjects[key],key+' route missing');

const reserved=autonomy.dispatch('OMEGA_AUTO_RESERVE','BD',{
  reservationId:'TEST-RES-1',decisionId:'TEST-DEC-1',money:10000,labor:100,materials:{steel:500}
});
assert.equal(reserved.status,'APPLIED');
assert.equal(globalThis.Game.state.cabinet.BD.autonomyReservations.length,1);
const oversubscribe=autonomy.dispatch('OMEGA_AUTO_RESERVE','BD',{
  reservationId:'TEST-RES-OVER',decisionId:'TEST-DEC-OVER',money:95000,labor:0,materials:{steel:1}
});
assert.equal(oversubscribe.status,'FAILED');
assert.equal(oversubscribe.reason,'INSUFFICIENT_UNRESERVED_TREASURY');


const importRequest=autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST','BD',{
  requestId:'TEST-IMP-1',decisionId:'TEST-DEC-2',resourceId:'crude_oil',
  targetCountryId:'SA',quantity:1000000,unitPrice:80,reservationId:'TEST-RES-1'
});
assert.equal(importRequest.status,'APPLIED');
assert.equal(globalThis.Game.state.trade.BD.importRequests[0].targetCountryId,'SA');
assert.equal(globalThis.Game.state.trade.BD.importRequests[0].status,'SENT');
assert.equal(globalThis.Game.state.trade.BD.importRequests[0].stage,'COUNTERPARTY_DECISION_PENDING');
const supplier=autonomy.chooseImportSupplier('Bangladesh',{
  countryId:'Bangladesh',
  scenarioId:'RESOURCE_DEFICIT',
  runtimeMeasurement:{resourceId:'crude_oil',required:1000000}
});
assert.equal(supplier.countryId,'SA');
assert.equal(supplier.unitPrice,78);


const housing=autonomy.dispatch('OMEGA_AUTO_HOUSING_COMMISSION','BD',{
  project:{projectId:'HOUSE-1',quantity:200,decisionId:'TEST-HOUSING'}
});
assert.equal(housing.status,'APPLIED');
assert.equal(globalThis.Game.state.cities.BD.housing.available,1200);
const projectReservation=autonomy.dispatch('OMEGA_AUTO_RESERVE','BD',{
  reservationId:'TEST-RES-PROJECT',decisionId:'TEST-PROJECT',money:1000,labor:50,materials:{steel:50}
});
assert.equal(projectReservation.status,'APPLIED');
const project=autonomy.dispatch('OMEGA_AUTO_PROJECT_CREATE','BD',{
  projectId:'HOUSE-PROJECT-1',action:'HOUSING_BUILD',kind:'HOUSING',
  scenarioId:'HOUSING_SHORTAGE',decisionId:'TEST-PROJECT',reservationId:'TEST-RES-PROJECT',
  quantity:50,cost:1000,labor:50,materials:{steel:50},durationTurns:1
});
assert.equal(project.status,'APPLIED');
globalThis.Game.state.simulation.turn=2;
const projectTick=autonomy.dispatch('OMEGA_AUTO_PROJECT_TICK','BD',{});
assert.equal(projectTick.status,'APPLIED');
assert(globalThis.Game.state.projects.BD.registry.some(x=>x.projectId==='HOUSE-PROJECT-1'&&x.status==='COMPLETED'));
assert.equal(globalThis.Game.state.cities.BD.housing.available,1250);
assert.equal(globalThis.Game.state.resource.BD.inventory.steel,9950);


const factory=autonomy.dispatch('OMEGA_AUTO_FACTORY_COMMISSION','BD',{
  project:{projectId:'FACTORY-1',quantity:50,decisionId:'TEST-FACTORY'}
});
assert.equal(factory.status,'APPLIED');
assert.equal(globalThis.Game.state.economy.BD.productionCapacity,650);

const recruit=autonomy.dispatch('OMEGA_AUTO_MILITARY_RECRUIT','BD',{
  quantity:250,decisionId:'TEST-RECRUIT'
});
assert.equal(recruit.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BD.forceStructure.personnel,1250);

const training=autonomy.dispatch('OMEGA_AUTO_MILITARY_TRAIN','BD',{
  quantity:250,durationTurns:1,decisionId:'TEST-TRAIN'
});
assert.equal(training.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BD.trainingQueue.length,1);

globalThis.Game.state.simulation.turn=2;
const tick=autonomy.dispatch('OMEGA_AUTO_MILITARY_TICK','BD',{});
assert.equal(tick.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BD.trainingQueue[0].status,'COMPLETED');
const organize=autonomy.dispatch('OMEGA_AUTO_MILITARY_ORGANIZE','BD',{
  quantity:200,personnelPerUnit:100,decisionId:'TEST-ORG'
});
assert.equal(organize.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BD.forceStructure.units,12);
assert.equal(globalThis.Game.state.military.BD.forceStructure.organizedPersonnel,1200);

globalThis.Game.state.simulation.turn=3;
const training2=autonomy.dispatch('OMEGA_AUTO_MILITARY_TRAIN','BD',{
  quantity:200,durationTurns:1,readinessDelta:5,decisionId:'TEST-TRAIN-2'
});
assert.equal(training2.status,'APPLIED');
const tick2=autonomy.dispatch('OMEGA_AUTO_MILITARY_TICK','BD',{});
assert.equal(tick2.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BD.readiness,65);

const equipment=autonomy.dispatch('OMEGA_AUTO_MILITARY_EQUIP','BD',{
  quantity:20,item:'APC',cost:1000,materials:{steel:100},decisionId:'TEST-EQUIP'
});
assert.equal(equipment.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BD.equipmentInventory.APC,20);


const treaty=autonomy.startTreatyNegotiation('BD','SA',{
  treatyType:'ENERGY_SUPPLY',
  terms:{resourceId:'crude_oil',quantity:1000000},
  decisionId:'TEST-TREATY'
});
assert.equal(treaty.status,'APPLIED');
assert.equal(globalThis.Game.state.foreign.BD.negotiations.SA.counterpartyDecision,'PENDING');

const threat=autonomy.assessThreat('BD','SA');
assert.equal(threat.targetCountryId,'SA');
assert('confidence' in threat);
assert('uncertainty' in threat);

const decision=autonomy.planDecision({
  decisionId:'TEST-DECISION',
  countryId:'BD',
  scenarioId:'HOUSING_SHORTAGE',
  runtimeMeasurement:{
    required:1200,available:1000,gap:200,
    selected:{action:'HOUSING_BUILD',quantity:200}
  }
});
assert(decision.factorModel.treasury>0);
assert(decision.factorModel.labor>0);
assert(decision.factorModel.materials>0);
assert(decision.factorModel.debt>0);
assert(decision.factorModel.existingProjects>0);
assert(decision.factorModel.strategicPriority>0);
assert(decision.factorModel.time>0);
assert(decision.factorModel.risk>0);
assert(decision.factorModel.relations>0);
assert(decision.selected?.factors?.needPressure!==null);
assert(decision.selected?.factors?.treasury!==null);
assert(decision.selected?.factors?.labor!==null);
assert(decision.selected?.factors?.materials!==null);
assert(decision.selected?.factors?.debt!==null);
assert(decision.selected?.factors?.existingProjects!==null);
assert(decision.selected?.factors?.strategicPriority!==null);
assert(decision.selected?.factors?.time!==null);
assert(decision.selected?.factors?.risk!==null);
assert.equal(decision.status,'ROUTED');
assert(decision.candidateEvaluations.length>0);

console.log('OMEGA OPPONENT AUTONOMY SYSTEM TEST PASSED');
console.log(JSON.stringify({
  version:autonomy.VERSION,
  queueBridgeInstalled:autonomy.diagnostics().queueBridgeInstalled,
  routeCount:autonomy.diagnostics().routeCount,
  eventRouteCount:autonomy.diagnostics().eventRouteCount,
  reservationCount:globalThis.Game.state.cabinet.BD.autonomyReservations.length,
  importRequests:globalThis.Game.state.trade.BD.importRequests.length,
  housingAvailable:globalThis.Game.state.cities.BD.housing.available,
  productionCapacity:globalThis.Game.state.economy.BD.productionCapacity,
  militaryPersonnel:globalThis.Game.state.military.BD.forceStructure.personnel
},null,2));
