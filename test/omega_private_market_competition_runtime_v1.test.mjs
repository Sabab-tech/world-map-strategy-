import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../omega_private_market_competition_runtime_v1.js',import.meta.url),'utf8');
const RIGHTS=['strategicOversight','licensingAndPermits','fiscalRegulation','labourSafetyEnvironmentalRegulation',
  'strategicSupplyOversight','strategicContracts','domesticSupplyDirection','exportControl','publicProcurement',
  'competitionOversight','foreignOwnershipReview','emergencyIntervention'];
const COMPANY='NOVA_CONSUMER_INDUSTRIES';
function metric({share=55,hhi=3000}={}){
  return{status:'AVAILABLE',countryId:'BGD',resourceId:'iron_ore',lookbackTurns:365,fromTurn:1,toTurn:10,
    privateCompanyHhi:hhi,privateSectorMarketSharePct:75,totalAttributedSettledMarketValue:1000,
    verifiedSettledSaleCount:10,firms:[
      {companyId:COMPANY,settledSalesValue:550,totalAttributedMarketSharePct:share,privateSectorSharePct:70},
      {companyId:'AURORA_INDUSTRIAL_GROUP',settledSalesValue:250,totalAttributedMarketSharePct:25,privateSectorSharePct:30}
    ]};
}
function harness(options={}){
  let currentMetric=options.metric||metric(),concentrationCalls=0;
  const state={simulation:{turn:10,session:{playerCountryId:'BGD'}},
    economy:{BGD:{productionAssets:[]}},
    trade:{BGD:{domesticSales:[{turn:10,status:'SETTLED',sale:{
      saleId:'SALE-1',countryId:'BGD',resourceId:'iron_ore',simulationTurn:10,status:'SETTLED',
      paymentStatus:'SETTLED',ownerAllocationStatus:'RECONCILED',totalValue:1000,quantity:100,
      supplierAllocations:{[COMPANY]:55,STATE_OWNED_SUPPLY:45}
    }}]}}};
  if(options.stateRights!==false){
    const stateControlRights=Object.fromEntries(RIGHTS.map(key=>[key,true]));
    stateControlRights.operationalControl='STATE_POLICY_ONLY';
    stateControlRights.authority='OMEGA_STATE_CONTROL_RIGHTS_V1';
    state.economy.BGD.productionAssets.push({id:'PRIVATE-FAC-1',countryId:'BGD',ownerType:'PRIVATE_ENTERPRISE',
      ownerCompanyId:COMPANY,status:'OPERATIONAL',privatePermitStatus:'ACTIVE',stateControlRights});
  }
  const handlers=new Map(),listeners=new Map(),commands=[];
  const mesh={
    instance:{ids:['trade']},configure(){},
    registerAction(){},
    registerCommandHandler(type,owner,handler){handlers.set(type,{owner,handler});},
    dispatchCommand(owner,type,countryId,payload){
      commands.push({owner,type,countryId,payload});
      const item=handlers.get(type);
      if(!item||item.owner!==owner)return{status:'REJECTED',result:{accepted:false,reason:'HANDLER_NOT_FOUND'}};
      const bucket=state.trade[countryId]||(state.trade[countryId]={});
      const ctx={countryId,stateTransaction:{
        get(path){if(path==='trade.marketCompetition')return bucket.marketCompetition;return undefined;},
        set(path,value){if(path==='trade.marketCompetition')bucket.marketCompetition=value;}
      }};
      const result=item.handler({payload},ctx);
      return{status:result.accepted?'APPLIED':'REJECTED',result};
    },
    emitEvent(){}
  };
  const sandbox={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,
    Game:{state},Omega:{MinistryInteroperability:mesh},
    OmegaPrivateEnterpriseLifecycleV1:{getPrivateMarketConcentration(input){
      concentrationCalls++;assert.equal(input.countryId,'BGD');return structuredClone(currentMetric);
    }},
    addEventListener(type,listener){listeners.set(type,listener);},
    dispatchEvent(){},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
  };
  sandbox.globalThis=sandbox;
  runInNewContext(source,sandbox,{filename:'omega_private_market_competition_runtime_v1.js'});
  return{state,sandbox,listeners,commands,handlers,setMetric(value){currentMetric=value;},
    get concentrationCalls(){return concentrationCalls;}};
}

test('committed game turn records market investigation and applies a state-authorised expansion hold at dominance',()=>{
  const h=harness();
  const commit=h.listeners.get('OMEGA_SIMULATION_TURN_COMMITTED');
  assert.equal(typeof commit,'function','competition runtime subscribes to the committed-turn event');
  const result=commit({detail:{countryId:'BGD'}});
  assert.equal(result.status,'COMPLETED',JSON.stringify(result));
  const state=h.state.trade.BGD.marketCompetition;
  assert.equal(state.lastProcessedTurn,10);
  assert.equal(state.cases.length,1);
  assert.equal(state.cases[0].stage,'INTERVENTION');
  assert.equal(state.cases[0].interventionStatus,'ACTIVE');
  assert.equal(state.cases[0].stateControlProof.verified,true);
  assert.equal(state.activeRestrictions.length,1);
  assert.equal(state.activeRestrictions[0].restrictionType,'PRIVATE_FACTORY_EXPANSION_HOLD');
  assert.equal(h.sandbox.OmegaPrivateMarketCompetitionRuntime.getCompanyExpansionRestriction(
    'BGD',COMPANY,'iron_ore').caseId,state.cases[0].caseId);
});

test('same committed turn is idempotent and does not append a second case or event',()=>{
  const h=harness(),api=h.sandbox.OmegaPrivateMarketCompetitionRuntime;
  assert.equal(api.processCountry('BGD').status,'COMPLETED');
  const eventCount=h.state.trade.BGD.marketCompetition.events.length;
  assert.equal(api.processCountry('BGD').status,'ALREADY_UPDATED');
  assert.equal(h.state.trade.BGD.marketCompetition.cases.length,1);
  assert.equal(h.state.trade.BGD.marketCompetition.events.length,eventCount);
  assert.equal(h.commands.length,1);
});

test('expansion hold survives short dips and releases only after three consecutive turns below watch thresholds',()=>{
  const h=harness(),api=h.sandbox.OmegaPrivateMarketCompetitionRuntime;
  api.processCountry('BGD');
  h.setMetric(metric({share:20,hhi:1000}));
  for(let count=1;count<=2;count++){
    h.state.simulation.turn++;
    api.processCountry('BGD');
    assert.equal(h.state.trade.BGD.marketCompetition.cases[0].belowThresholdTurns,count);
    assert.equal(api.getCompanyExpansionRestriction('BGD',COMPANY,'iron_ore')?.status,'ACTIVE');
  }
  h.state.simulation.turn++;
  api.processCountry('BGD');
  assert.equal(h.state.trade.BGD.marketCompetition.cases[0].status,'RESOLVED');
  assert.equal(h.state.trade.BGD.marketCompetition.cases[0].interventionStatus,'LIFTED');
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,0);
  assert.equal(api.getCompanyExpansionRestriction('BGD',COMPANY,'iron_ore'),null);
});

test('high HHI or 40 percent leader share opens an investigation without automatically imposing an expansion hold',()=>{
  const h=harness({metric:metric({share:45,hhi:2600})});
  const result=h.sandbox.OmegaPrivateMarketCompetitionRuntime.processCountry('BGD');
  assert.equal(result.status,'COMPLETED');
  const row=h.state.trade.BGD.marketCompetition.cases[0];
  assert.equal(row.stage,'INVESTIGATION');
  assert.equal(row.interventionStatus,'NOT_REQUIRED');
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,0);
});

test('watch, investigation and intervention boundaries are inclusive and advance only on committed turns',()=>{
  const h=harness({metric:metric({share:30,hhi:1499})}),api=h.sandbox.OmegaPrivateMarketCompetitionRuntime;
  assert.equal(api.processCountry('BGD').status,'COMPLETED');
  let row=h.state.trade.BGD.marketCompetition.cases[0];
  assert.equal(row.stage,'WATCH');
  assert.equal(row.leaderTotalMarketSharePct,30);

  h.setMetric(metric({share:40,hhi:1499}));
  h.state.simulation.turn++;
  assert.equal(api.processCountry('BGD').status,'COMPLETED');
  row=h.state.trade.BGD.marketCompetition.cases[0];
  assert.equal(row.stage,'INVESTIGATION');
  assert.equal(row.leaderTotalMarketSharePct,40);

  h.setMetric(metric({share:40,hhi:5000}));
  h.state.simulation.turn++;
  assert.equal(api.processCountry('BGD').status,'COMPLETED');
  row=h.state.trade.BGD.marketCompetition.cases[0];
  assert.equal(row.stage,'INTERVENTION');
  assert.equal(row.interventionStatus,'ACTIVE');
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,1);
});

test('a missing competition-oversight right blocks intervention even when the asset permit is otherwise active',()=>{
  const h=harness(),asset=h.state.economy.BGD.productionAssets[0];
  asset.stateControlRights.competitionOversight=false;
  const result=h.sandbox.OmegaPrivateMarketCompetitionRuntime.processCountry('BGD');
  assert.equal(result.status,'COMPLETED');
  const row=h.state.trade.BGD.marketCompetition.cases[0];
  assert.equal(row.stage,'INTERVENTION');
  assert.equal(row.interventionStatus,'BLOCKED_STATE_CONTROL');
  assert.equal(row.stateControlProof.reason,'PRIVATE_ASSET_STATE_CONTROL_RIGHTS_INCOMPLETE');
  assert.deepEqual(row.stateControlProof.unverifiedAssetIds,['PRIVATE-FAC-1']);
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,0);
});

test('dominance cannot trigger an expansion hold unless every private asset proves the full state-control rights',()=>{
  const h=harness({metric:metric({share:55,hhi:6000}),stateRights:false});
  const result=h.sandbox.OmegaPrivateMarketCompetitionRuntime.processCountry('BGD');
  assert.equal(result.status,'COMPLETED');
  const row=h.state.trade.BGD.marketCompetition.cases[0];
  assert.equal(row.stage,'INTERVENTION');
  assert.equal(row.interventionStatus,'BLOCKED_STATE_CONTROL');
  assert.equal(row.stateControlProof.reason,'NO_PRIVATE_ASSET_STATE_CONTROL_RECORD');
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,0);
});

test('missing sales evidence does not count as a below-threshold turn or release an existing hold',()=>{
  const h=harness(),api=h.sandbox.OmegaPrivateMarketCompetitionRuntime;
  api.processCountry('BGD');
  h.state.trade.BGD.domesticSales[0].sale.paymentStatus='UNOBSERVED';
  h.state.trade.BGD.domesticSales[0].sale.ownerAllocationStatus='UNRESOLVED';
  h.state.simulation.turn++;
  const result=api.processCountry('BGD');
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.resourcesChecked,0);
  assert.equal(h.state.trade.BGD.marketCompetition.cases[0].belowThresholdTurns,0);
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,1);
});

test('private-company HHI alone can open an investigation, but it does not imply dominance by itself',()=>{
  const h=harness({metric:metric({share:25,hhi:2600})});
  const result=h.sandbox.OmegaPrivateMarketCompetitionRuntime.processCountry('BGD');
  assert.equal(result.status,'COMPLETED');
  assert.equal(h.state.trade.BGD.marketCompetition.cases[0].stage,'INVESTIGATION');
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,0);
});

test('only the active player country may process a market competition turn',()=>{
  const h=harness();
  assert.equal(h.sandbox.OmegaPrivateMarketCompetitionRuntime.processCountry('SAU').reason,'PLAYER_COUNTRY_SCOPE_ONLY');
  assert.equal(h.sandbox.OmegaPrivateMarketCompetitionRuntime.getCountryStatus('SAU').reason,'PLAYER_COUNTRY_SCOPE_ONLY');
  assert.equal(h.commands.length,0);
});

test('unpaid or unreconciled physical transfers do not trigger competition monitoring',()=>{
  const h=harness();
  h.state.trade.BGD.domesticSales[0].sale.paymentStatus='UNOBSERVED';
  h.state.trade.BGD.domesticSales[0].sale.ownerAllocationStatus='UNRESOLVED';
  const result=h.sandbox.OmegaPrivateMarketCompetitionRuntime.processCountry('BGD');
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.resourcesChecked,0);
  assert.equal(h.concentrationCalls,0);
  assert.equal(h.state.trade.BGD.marketCompetition.cases.length,0);
  assert.equal(h.state.trade.BGD.marketCompetition.activeRestrictions.length,0);
});
