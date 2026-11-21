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
      BGD:{available:100000,reserves:120000,committed:1000},
      SAU:{available:200000,reserves:300000}
    },
    economy:{
      BGD:{gdp:460000,debt:210000,production:500,productionCapacity:600},
      SAU:{gdp:650000,debt:120000}
    },
    population:{
      BGD:{labor:{available:5000,skilled:1200}}
    },
    resource:{
      BGD:{inventory:{steel:10000},production:{steel:500},consumption:{steel:400},reserves:{steel:20000}}
    },
    cities:{
      BGD:{housing:{available:1000,required:1200}}
    },
    projects:{
      BGD:{registry:[]}
    },
    military:{
      BGD:{forceStructure:{personnel:1000,units:10,organizedPersonnel:1000,personnelPerUnit:100},readiness:60,trainingQueue:[],equipmentQueue:[],equipmentInventory:{}},
      SAU:{forceStructure:{personnel:50000,units:500},readiness:80}
    },
    relations:{
      BGD:{
        SAU:{overall:75,trade:80,trust:70,trade_agreement:true,sanctions:false,war_state:false}
      }
    },
    foreign:{
      BGD:{
        relations:{SAU:{overall:75,trade:80,trust:70,trade_agreement:true,sanctions:false,war_state:false}},
        treaties:{}
      }
    },
    trade:{BGD:{relations:{SAU:{overall:75,trade:80,trust:70}},marketPrice:{crude_oil:80},offerBook:{crude_oil:{unitPrice:80}},routeCapacity:{crude_oil:2000000}},SAU:{offerBook:{crude_oil:{unitPrice:78}}}}
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
    return {countryId,market:{prices:{crude_oil:countryId==='SAU'?78:120}}};
  },
  deposits:[{countryCode:'SAU',resourceId:'crude_oil'}]
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
assert.equal(canonical.id,'BGD');
assert.equal(canonical.authority,'OMEGA_CANONICAL_COUNTRY_IDENTITY');
const namedRoute=autonomy.routeSubject('import','Bangladesh','Saudi Arabia');
assert.equal(namedRoute.countryId,'BGD');
assert.equal(namedRoute.targetCountryId,'SAU');
const kernelEvaluation=await globalThis.Omega.OpponentCountryRules.evaluateCountry('BGD',1);
assert.equal(kernelEvaluation.countryId,'BGD');

const sourceRoute=autonomy.findDataSources('treasury','Bangladesh');
assert.equal(sourceRoute.countryId,'BGD');
assert.equal(sourceRoute.primaryMinistry,'finance');
const eventRoute=autonomy.resolveEventRoute('OMEGA_RESOURCE_IMPORT_REQUEST_SENT','Bangladesh');
assert.equal(eventRoute.countryId,'BGD');
assert.equal(eventRoute.owner,'trade');


const importRoute=autonomy.routeSubject('import','BGD','SAU');
assert.equal(importRoute.primary,'trade');
assert.deepEqual(importRoute.targetCountryId,'SAU');
assert(importRoute.checks.some(row=>row.path==='foreign.relations'),
  'import routing must consume the selected country’s observed bilateral relation state');

const evidence=autonomy.collectEvidence('BGD',['treasury','labor','materials','debt','housing','military','relations'],'SAU');
for(const key of ['treasury','labor','materials','debt','housing','military','relations'])assert(evidence.subjects[key],key+' route missing');

const reserved=autonomy.dispatch('OMEGA_AUTO_RESERVE','BGD',{
  reservationId:'TEST-RES-1',decisionId:'TEST-DEC-1',money:10000,labor:100,materials:{steel:500}
});
assert.equal(reserved.status,'APPLIED');
assert.equal(globalThis.Game.state.cabinet.BGD.autonomyReservations.length,1);
const oversubscribe=autonomy.dispatch('OMEGA_AUTO_RESERVE','BGD',{
  reservationId:'TEST-RES-OVER',decisionId:'TEST-DEC-OVER',money:95000,labor:0,materials:{steel:1}
});
assert.equal(oversubscribe.status,'FAILED');
assert.equal(oversubscribe.result?.accepted,false);
assert.equal(oversubscribe.result?.reason,'INSUFFICIENT_UNRESERVED_TREASURY');
assert.equal(globalThis.Game.state.cabinet.BGD.autonomyReservations.length,1,
  'a rejected reservation must not be committed to the national ledger');
assert.equal(globalThis.Game.state.cabinet.BGD.autonomyReservations[0].money,10000,
  'the rejected command must preserve the already committed reservation only');


const importRequest=autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST','BGD',{
  requestId:'TEST-IMP-1',decisionId:'TEST-DEC-2',resourceId:'crude_oil',
  targetCountryId:'SAU',quantity:1000000,unitPrice:80,reservationId:'TEST-RES-1'
});
assert.equal(importRequest.status,'APPLIED');
assert.equal(globalThis.Game.state.trade.BGD.importRequests[0].targetCountryId,'SAU');
assert.equal(globalThis.Game.state.trade.BGD.importRequests[0].status,'SENT');
assert.equal(globalThis.Game.state.trade.BGD.importRequests[0].stage,'COUNTERPARTY_DECISION_PENDING');
const supplier=autonomy.chooseImportSupplier('Bangladesh',{
  countryId:'Bangladesh',
  scenarioId:'RESOURCE_DEFICIT',
  runtimeMeasurement:{resourceId:'crude_oil',required:1000000}
});
assert.equal(supplier.countryId,'SAU');
assert.equal(supplier.unitPrice,78);


const housing=autonomy.dispatch('OMEGA_AUTO_HOUSING_COMMISSION','BGD',{
  project:{projectId:'HOUSE-1',quantity:200,decisionId:'TEST-HOUSING'}
});
assert.equal(housing.status,'APPLIED');
assert.equal(globalThis.Game.state.cities.BGD.housing.available,1200);
const projectReservation=autonomy.dispatch('OMEGA_AUTO_RESERVE','BGD',{
  reservationId:'TEST-RES-PROJECT',decisionId:'TEST-PROJECT',money:1000,labor:50,materials:{steel:50}
});
assert.equal(projectReservation.status,'APPLIED');
const project=autonomy.dispatch('OMEGA_AUTO_PROJECT_CREATE','BGD',{
  projectId:'HOUSE-PROJECT-1',action:'HOUSING_BUILD',kind:'HOUSING',
  scenarioId:'HOUSING_SHORTAGE',decisionId:'TEST-PROJECT',reservationId:'TEST-RES-PROJECT',
  quantity:50,cost:1000,labor:50,materials:{steel:50},durationTurns:1
});
assert.equal(project.status,'APPLIED');
globalThis.Game.state.simulation.turn=2;
const projectTick=autonomy.dispatch('OMEGA_AUTO_PROJECT_TICK','BGD',{});
assert.equal(projectTick.status,'APPLIED');
assert(globalThis.Game.state.projects.BGD.registry.some(x=>x.projectId==='HOUSE-PROJECT-1'&&x.status==='COMMISSIONING'&&x.settlementReady===true));
const projectFinalize=autonomy.dispatch('OMEGA_AUTO_PROJECT_FINALIZE','BGD',{
  projectId:'HOUSE-PROJECT-1',decisionId:'TEST-PROJECT',reservationId:'TEST-RES-PROJECT',correlationId:'TEST-PROJECT'
});
assert.equal(projectFinalize.status,'APPLIED');
assert(globalThis.Game.state.projects.BGD.registry.some(x=>x.projectId==='HOUSE-PROJECT-1'&&x.status==='COMPLETED'&&x.phase==='OPERATIONAL'));
assert.equal(globalThis.Game.state.cities.BGD.housing.available,1250);
assert.equal(globalThis.Game.state.resource.BGD.inventory.steel,9950);


const factory=autonomy.dispatch('OMEGA_AUTO_FACTORY_COMMISSION','BGD',{
  project:{projectId:'FACTORY-1',quantity:50,decisionId:'TEST-FACTORY'}
});
assert.equal(factory.status,'APPLIED');
assert.equal(globalThis.Game.state.economy.BGD.productionCapacity,650);

const recruit=autonomy.dispatch('OMEGA_AUTO_MILITARY_RECRUIT','BGD',{
  quantity:250,decisionId:'TEST-RECRUIT'
});
assert.equal(recruit.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.forceStructure.personnel,1250);

const training=autonomy.dispatch('OMEGA_AUTO_MILITARY_TRAIN','BGD',{
  quantity:250,durationTurns:1,decisionId:'TEST-TRAIN'
});
assert.equal(training.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.trainingQueue.length,1);
assert.equal(globalThis.Game.state.military.BGD.trainingQueue[0].status,'IN_TRAINING');
assert.equal(globalThis.Game.state.military.BGD.trainingQueue[0].completionTurn,3);

globalThis.Game.state.simulation.turn=3;
const tick=autonomy.dispatch('OMEGA_AUTO_MILITARY_TICK','BGD',{});
assert.equal(tick.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.trainingQueue[0].status,'COMPLETED',
  'a one-day training order must complete on the following game day');
assert.equal(globalThis.Game.state.military.BGD.trainingQueue[0].completedTurn,3);
const organize=autonomy.dispatch('OMEGA_AUTO_MILITARY_ORGANIZE','BGD',{
  quantity:200,personnelPerUnit:100,decisionId:'TEST-ORG'
});
assert.equal(organize.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.forceStructure.units,12);
assert.equal(globalThis.Game.state.military.BGD.forceStructure.organizedPersonnel,1200);

globalThis.Game.state.simulation.turn=4;
const training2=autonomy.dispatch('OMEGA_AUTO_MILITARY_TRAIN','BGD',{
  quantity:200,durationTurns:1,readinessDelta:5,decisionId:'TEST-TRAIN-2'
});
assert.equal(training2.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.trainingQueue.at(-1).status,'IN_TRAINING');
assert.equal(globalThis.Game.state.military.BGD.trainingQueue.at(-1).completionTurn,5);
globalThis.Game.state.simulation.turn=5;
const tick2=autonomy.dispatch('OMEGA_AUTO_MILITARY_TICK','BGD',{});
assert.equal(tick2.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.readiness,65);

const equipment=autonomy.dispatch('OMEGA_AUTO_MILITARY_EQUIP','BGD',{
  quantity:20,item:'APC',cost:1000,materials:{steel:100},decisionId:'TEST-EQUIP'
});
assert.equal(equipment.status,'APPLIED');
assert.equal(globalThis.Game.state.military.BGD.equipmentInventory.APC,20);


const treaty=autonomy.startTreatyNegotiation('BGD','SAU',{
  treatyType:'ENERGY_SUPPLY',
  terms:{resourceId:'crude_oil',quantity:1000000},
  decisionId:'TEST-TREATY'
});
assert.equal(treaty.status,'APPLIED');
assert.equal(globalThis.Game.state.foreign.BGD.negotiations.SAU.counterpartyDecision,'PENDING');

const threat=autonomy.assessThreat('BGD','SAU');
assert.equal(threat.targetCountryId,'SAU');
assert('confidence' in threat);
assert('uncertainty' in threat);

const decision=autonomy.planDecision({
  decisionId:'TEST-DECISION',
  countryId:'BGD',
  scenarioId:'HOUSING_SHORTAGE',
  runtimeMeasurement:{
    required:1200,available:1000,gap:200,
    cost:1000,durationTurns:2,labor:50,materials:{steel:50},
    selected:{action:'HOUSING_BUILD',quantity:200,cost:1000,durationTurns:2,labor:50,materials:{steel:50}}
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
  reservationCount:globalThis.Game.state.cabinet.BGD.autonomyReservations.length,
  importRequests:globalThis.Game.state.trade.BGD.importRequests.length,
  housingAvailable:globalThis.Game.state.cities.BGD.housing.available,
  productionCapacity:globalThis.Game.state.economy.BGD.productionCapacity,
  militaryPersonnel:globalThis.Game.state.military.BGD.forceStructure.personnel
},null,2));
