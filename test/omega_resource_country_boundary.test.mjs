import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

class EventTargetMock {
  constructor(){ this.listeners=new Map(); }
  addEventListener(type,fn){ const list=this.listeners.get(type)||[]; list.push(fn); this.listeners.set(type,list); }
  dispatchEvent(evt){ for(const fn of this.listeners.get(evt.type)||[]) fn(evt); return true; }
}

class CustomEventMock {
  constructor(type,init={}){ this.type=type; this.detail=init.detail; }
}

function makeCountryIdentity(){
  const names={BGD:'Bangladesh',IND:'India'};
  return {
    resolveCountry(value){
      const raw=String(value||'').trim().toUpperCase();
      if(raw==='BANGLADESH'||raw==='BD')return{id:'BGD'};
      if(raw==='INDIA'||raw==='IN')return{id:'IND'};
      return{id:raw};
    },
    list(){ return ['BGD','IND']; },
    exportData(){ return {countries:[{code:'BGD',name:'Bangladesh'},{code:'IND',name:'India'}]}; },
    names
  };
}

function stateTransaction(state,countryId){
  return {
    get(path){
      const parts=String(path).split('.');
      const domain=parts.shift();
      let current=state[domain]?.[countryId];
      for(const key of parts){ if(current==null)return undefined; current=current[key]; }
      return current;
    },
    set(path,value){
      const parts=String(path).split('.');
      const domain=parts.shift();
      if(!state[domain])state[domain]={};
      if(!state[domain][countryId])state[domain][countryId]={};
      let current=state[domain][countryId];
      for(let i=0;i<parts.length-1;i++){
        if(!current[parts[i]]||typeof current[parts[i]]!=='object')current[parts[i]]={};
        current=current[parts[i]];
      }
      current[parts.at(-1)]=value;
    }
  };
}

function makeInterop(state){
  const events=new EventTargetMock();
  const handlers=new Map();
  const interop={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,_owner,handler){ handlers.set(type,handler); },
    dispatchCommand(_owner,type,countryId,payload){
      const handler=handlers.get(type);
      if(!handler)return{status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND'};
      const result=handler(
        {commandId:'TEST-'+type,payload},
        {countryId,stateTransaction:stateTransaction(state,countryId)}
      );
      return{status:result?.accepted===false?'REJECTED':'APPLIED',result};
    },
    emitEvent(type,countryId,source,payload,meta){
      events.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,source,payload,meta}}));
      return true;
    }
  };
  return{interop,events,handlers};
}

test('resource country boundary guard rejects foreign ownership, destination and warehouse', async()=>{
  const sandbox={console,Map,Set,WeakMap,Object,Array,Number,String,JSON};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('omega_resource_country_boundary_guard.js','utf8'),sandbox,{filename:'omega_resource_country_boundary_guard.js'});
  const guard=sandbox.OmegaResourceCountryBoundaryGuard;
  assert.ok(guard);
  assert.equal(guard.validateLocalBatch({
    countryId:'BGD',sourceCountryId:'BGD',originCountryId:'BGD',ownerCountryCode:'BGD',
    destinationCountryId:'BGD',warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW',
    batchId:'BGD-1'
  },'BGD').ok,true);
  for(const batch of [
    {countryId:'BGD',sourceCountryId:'IND',ownerCountryCode:'BGD',warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW'},
    {countryId:'BGD',sourceCountryId:'BGD',destinationCountryId:'IND',warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW'},
    {countryId:'BGD',sourceCountryId:'BGD',ownerCountryCode:'BGD',warehouseId:'WH-IND-RAW',locationNodeKey:'WAREHOUSE:IND:RAW'}
  ]){
    assert.equal(guard.validateLocalBatch(batch,'BGD').ok,false);
  }
});

test('global extraction evaluates every modeled country and keeps each mine output in its own country', async()=>{
  const state={simulation:{turn:1},resource:{}};
  const identity=makeCountryIdentity();
  const {interop,events}=makeInterop(state);
  const reserves=new Map([
    ['OCC-BGD-IRON',{occurrenceKey:'OCC-BGD-IRON',geologicalQuantity:1000,recoverableQuantity:800,residualQuantity:800,operationalStatus:'ACTIVE_EXTRACTION',unit:'TONNES',stateVersion:1}],
    ['OCC-IND-IRON',{occurrenceKey:'OCC-IND-IRON',geologicalQuantity:1200,recoverableQuantity:900,residualQuantity:900,operationalStatus:'ACTIVE_EXTRACTION',unit:'TONNES',stateVersion:1}]
  ]);
  const capacities=new Map([
    ['OCC-BGD-IRON',{nominalRate:25,dailyRate:25,unit:'TONNES',assetReference:'ASSET-BGD',computeWindowCapacity(){return{windowCapacity:25};}}],
    ['OCC-IND-IRON',{nominalRate:30,dailyRate:30,unit:'TONNES',assetReference:'ASSET-IND',computeWindowCapacity(){return{windowCapacity:30};}}]
  ]);
  const occurrences={
    BGD:[{occurrenceKey:'OCC-BGD-IRON',depositKey:'DEP-BGD-IRON',resourceTypeId:'iron_ore',resourceTypeKey:'iron_ore',ownerKey:'OWNER-BGD',operatorKey:'OP-BGD',locationNodeKey:'LOC-BGD'}],
    IND:[{occurrenceKey:'OCC-IND-IRON',depositKey:'DEP-IND-IRON',resourceTypeId:'iron_ore',resourceTypeKey:'iron_ore',ownerKey:'OWNER-IND',operatorKey:'OP-IND',locationNodeKey:'LOC-IND'}]
  };
  const deposits=[
    {id:'DEP-BGD-IRON',name:'Bangladesh Iron Mine',country:'Bangladesh',countryCode:'BGD',resId:'iron_ore',grade:'62% Fe',status:'ACTIVE_PRODUCING'},
    {id:'DEP-IND-IRON',name:'India Iron Mine',country:'India',countryCode:'IND',resId:'iron_ore',grade:'58% Fe',status:'ACTIVE_PRODUCING'}
  ];
  const engine={
    isReady:true,
    countryProfiles:{
      BGD:{identity:{countryId:'BGD',iso3:'BGD',name:'Bangladesh'}},
      IND:{identity:{countryId:'IND',iso3:'IND',name:'India'}}
    },
    deposits,
    resourceTypes:[{id:'iron_ore',name:'IRON ORE',unit:'TONNES'}],
    getDataLoadReport(){return{status:'READY',authority:'RESOURCE_JSON',depositCount:2};}
  };
  const identityRegistry={
    getOccurrencesByCountry(c){return occurrences[String(c).toUpperCase()]||[];},
    getDeposit(key){return deposits.find(x=>x.id===key)||null;}
  };
  const reserveRegistry={
    reserveStates:new Map(reserves),
    accessibilityStates:new Map(),
    getReserveState(k){return reserves.get(k)||null;},
    registerReserveState(v){reserves.set(v.occurrenceKey,v);return v;},
    getCapacityForOccurrence(k){return capacities.get(k)||null;},
    getRecoverabilityModelForResource(){return null;}
  };
  const Part05={
    TemporalWindowUnit:{PER_DAY:'PER_DAY'},
    ExtractionMethodEnum:{UNKNOWN:'UNKNOWN'},
    ExtractionResultStatus:{APPROVED:'APPROVED',PARTIALLY_APPROVED:'PARTIALLY_APPROVED'},
    OverdrawPolicyEnum:{CAP:'CAP'},
    ExtractionRequest:class{constructor(p){Object.assign(this,p);}},
    ReserveState:class{constructor(p){Object.assign(this,p);} toJSON(){return{...this};}},
    compileReserves(){return{registry:reserveRegistry};},
    executeExtraction(_request,reserve,opts){
      const q=Math.min(
        reserve.residualQuantity,
        capacities.get(reserve.occurrenceKey).nominalRate
      );
      const reserveBefore={...reserve};
      const reserveAfter={...reserve,residualQuantity:reserve.residualQuantity-q,stateVersion:(reserve.stateVersion||1)+1,operationalStatus:'RESERVE_DEPLETING'};
      return{
        status:'APPROVED',
        approvedQuantity:q,
        reserveBefore,
        reserveAfter,
        producedBatch:{batchId:'P5-'+reserve.occurrenceKey+'-T1',unit:'TONNES',purity:0.62,grade:62},
        calculationTrace:{kind:'TEST_DETERMINISTIC'},
        transition:{from:'ACTIVE_EXTRACTION',to:'RESERVE_DEPLETING'},
        provenance:{source:'TEST_RESOURCE_JSON'}
      };
    }
  };
  const Part04={compileIdentities(){return{registry:identityRegistry};}};
  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
    CustomEvent:CustomEventMock,
    addEventListener:events.addEventListener.bind(events),
    dispatchEvent:events.dispatchEvent.bind(events),
    Game:{state},
    gameState:state,
    OmegaCanonicalIdentityRegistry:identity,
    ResourceMinistryEngine:engine,
    Omega:{MinistryInteroperability:interop,CanonicalIdentity:identity},
    GSRSK_Part04:Part04,
    GSRSK_Part05:Part05
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(readFileSync('omega_resource_country_boundary_guard.js','utf8'),context,{filename:'omega_resource_country_boundary_guard.js'});
  vm.runInContext(readFileSync('omega_resource_endowment_runtime.js','utf8'),context,{filename:'omega_resource_endowment_runtime.js'});
  const runtime=context.OmegaResourceEndowmentRuntime;
  assert.equal((await runtime.initialize()).status,'READY');
  const globalResult=await runtime.extractAll();
  assert.equal(globalResult.status,'COMPLETED');
  assert.equal(globalResult.results.length,2);

  for(const country of ['BGD','IND']){
    const bucket=state.resource[country];
    assert.ok(bucket);
    assert.equal(bucket.batches.length,1);
    const batch=bucket.batches[0];
    assert.equal(batch.countryId,country);
    assert.equal(batch.sourceCountryId,country);
    assert.equal(batch.originCountryId,country);
    assert.equal(batch.ownerCountryCode,country);
    assert.equal(batch.destinationCountryId,country);
    assert.equal(batch.warehouseId,'WH-'+country+'-RAW');
    assert.ok(bucket.warehouse.storedBatchIds.includes(batch.batchId));
  }
  assert.equal(state.resource.BGD.batches.some(x=>x.countryId==='IND'),false);
  assert.equal(state.resource.IND.batches.some(x=>x.countryId==='BGD'),false);
  const eventsSeen=[];
  events.addEventListener('OMEGA_RESOURCE_BATCH_CREATED',e=>eventsSeen.push(e.detail));
  await runtime.extractCountry('BGD',['OCC-IND-IRON']);
  assert.equal(state.resource.BGD.batches.length,1);
});

test('trade resource mutation requires explicit settlement authorization', async()=>{
  const state={
    simulation:{turn:1},
    resource:{
      BGD:{inventory:{iron_ore:100}},
      IND:{inventory:{iron_ore:50}}
    }
  };
  const identity=makeCountryIdentity();
  const {interop}=makeInterop(state);
  const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Promise,CustomEvent:CustomEventMock,
    addEventListener(){},dispatchEvent(){return true},Game:{state},Omega:{MinistryInteroperability:interop,CanonicalIdentity:identity},OmegaCanonicalIdentityRegistry:identity};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(readFileSync('omega_global_trade_system.js','utf8'),context,{filename:'omega_global_trade_system.js'});
  const denied=interop.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_CREDIT','BGD',{resourceId:'iron_ore',quantity:10});
  assert.equal(denied.status,'REJECTED');
  assert.equal(state.resource.BGD.inventory.iron_ore,100);

  const auth={type:'TRADE_SETTLEMENT',settlementId:'SET-1',requestId:'REQ-1',sourceCountryId:'IND',destinationCountryId:'BGD'};
  const credited=interop.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_CREDIT','BGD',{resourceId:'iron_ore',quantity:10,transferAuthorization:auth});
  assert.equal(credited.status,'APPLIED');
  assert.equal(state.resource.BGD.inventory.iron_ore,110);

  const wrongSource=interop.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','BGD',{resourceId:'iron_ore',quantity:10,transferAuthorization:{...auth,sourceCountryId:'IND'}});
  assert.equal(wrongSource.status,'REJECTED');
  assert.equal(state.resource.BGD.inventory.iron_ore,110);
  const sellerAuth={...auth,sourceCountryId:'IND',destinationCountryId:'BGD'};
  const sellerDebit=interop.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','IND',{resourceId:'iron_ore',quantity:10,transferAuthorization:sellerAuth});
  assert.equal(sellerDebit.status,'APPLIED');
  assert.equal(state.resource.IND.inventory.iron_ore,40);
});
console.log('OMEGA RESOURCE COUNTRY BOUNDARY TESTS PASSED');
