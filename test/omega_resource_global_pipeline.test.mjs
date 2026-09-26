import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

class EventTargetMock{
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}
}
class CustomEventMock{constructor(type,init={}){this.type=type;this.detail=init.detail;}}

function loadJson(path){return JSON.parse(readFileSync(path,'utf8'));}

function buildEngine(){
  const a=loadJson('resources.json'),b=loadJson('resources_2.json');
  const profiles={
    ...(a.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{}),
    ...(b.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{})
  };
  const deposits=[...(a.runtime_deposits||[]),...(b.runtime_deposits||[])];
  const resourceTypes={...(a.resource_types||{}),...(b.resource_types||{}),...(a.GSRSK_Master_Resource_Data_v14?.resource_types||{}),...(b.GSRSK_Master_Resource_Data_v14?.resource_types||{})};
  const mineSiteReferenceCount=Object.values(profiles).reduce((sum,p)=>{
    const sites=p?.resource_infrastructure_context?.mineSites||p?.infrastructure_context?.mineSites||[];
    return sum+(Array.isArray(sites)?sites.length:0);
  },0);
  return{
    isReady:true,countryProfiles:profiles,deposits,
    resourceTypes:Object.values(resourceTypes),
    getDataLoadReport(){return{authority:'RESOURCE_JSON',countryProfileCount:Object.keys(profiles).length,depositCount:deposits.length};},
    normalizeCountryCode(v){return String(v||'').trim().toUpperCase();}
  };
}

function txFactory(state,countryId){
  return{
    get(path){
      const parts=String(path).split('.');
      const domain=parts.shift();
      let cur=state[domain]?.[countryId];
      for(const p of parts){if(cur==null)return undefined;cur=cur[p];}
      return cur;
    },
    set(path,value){
      const parts=String(path).split('.');
      const domain=parts.shift();
      if(!state[domain])state[domain]={};
      if(!state[domain][countryId])state[domain][countryId]={};
      let cur=state[domain][countryId];
      for(let i=0;i<parts.length-1;i++){
        if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};
        cur=cur[parts[i]];
      }
      cur[parts.at(-1)]=value;
    }
  };
}

function makeInterop(state){
  const handlers=new Map(),events=new EventTargetMock();
  const interop={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,_owner,fn){handlers.set(type,fn);},
    dispatchCommand(_owner,type,countryId,payload={}){
      const fn=handlers.get(type);
      if(!fn)return{status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND'};
      const result=fn({commandId:'TEST-'+type,payload},{countryId,stateTransaction:txFactory(state,countryId)});
      return{status:result?.accepted===false?'REJECTED':'APPLIED',result};
    },
    emitEvent(type,countryId,source,payload,meta){
      events.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,source,payload,meta}}));
      return true;
    }
  };
  return{interop,events};
}

test('global resource pipeline runs every RESOURCE_JSON mine and keeps each result sovereign',async()=>{
  const engine=buildEngine();
  const state={simulation:{turn:1},resource:{},finance:{}};
  const identity={
    resolveCountry(v){
      const raw=String(v||'').trim().toUpperCase();
      for(const [k,p] of Object.entries(engine.countryProfiles)){
        const i=p?.identity||p;
        if(k.toUpperCase()===raw||String(i.iso3||'').toUpperCase()===raw||String(i.iso2||'').toUpperCase()===raw||String(i.name||'').toUpperCase()===raw)return{id:k};
      }
      return{id:raw};
    },
    list(){return Object.keys(engine.countryProfiles);}
  };
  const {interop}=makeInterop(state);

  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
    CustomEvent:CustomEventMock,
    addEventListener(){},dispatchEvent(){return true},
    Game:{state},gameState:state,
    OmegaCanonicalIdentityRegistry:identity,
    Omega:{MinistryInteroperability:interop,CanonicalIdentity:identity},
    ResourceMinistryEngine:engine
  };
  context.globalThis=context;
  vm.createContext(context);

  vm.runInContext(readFileSync('omega_resource_part04_identity_runtime.js','utf8'),context,{filename:'omega_resource_part04_identity_runtime.js'});
  vm.runInContext(readFileSync('omega_resource_part05_reserve_extraction_runtime.js','utf8'),context,{filename:'omega_resource_part05_reserve_extraction_runtime.js'});
  vm.runInContext(readFileSync('omega_resource_country_boundary_guard.js','utf8'),context,{filename:'omega_resource_country_boundary_guard.js'});

  const part04=context.GSRSK_Part04,part05=context.GSRSK_Part05;
  const knowledge={sovereignEntities:{resourceTypes:engine.resourceTypes},refCatalog:{allReferences:engine.deposits}};
  const idResult=part04.compileIdentities(knowledge);
  const reserveResult=part05.compileReserves(idResult,null,knowledge,{});
  assert.equal(idResult.occurrenceCount,engine.deposits.length);
  assert.equal(reserveResult.occurrenceCount,engine.deposits.length);
  assert.equal(reserveResult.reserveCount,engine.deposits.length);
  assert.equal(reserveResult.capacityCount,engine.deposits.length);
  assert.equal(idResult.siteReferenceCount,mineSiteReferenceCount);
  const siteRefs=idResult.registry.listMineSiteReferences();
  assert.equal(siteRefs.length,mineSiteReferenceCount);
  assert.equal(new Set(siteRefs.map(x=>x.siteReferenceKey)).size,mineSiteReferenceCount);
  assert.equal(new Set(siteRefs.map(x=>x.countryId+'|'+x.siteName)).size,mineSiteReferenceCount);
  assert.ok(siteRefs.every(x=>x.status==='ACTIVE_SITE_REFERENCE'));
  assert.ok(siteRefs.every(x=>x.extractionExecutable===false));

  const byCountry={};
  for(const d of engine.deposits){const c=d.countryCode;byCountry[c]=(byCountry[c]||0)+1;}
  assert.ok(Object.keys(byCountry).length>=2);

  let fiscalPendingCount=0;
  interop.registerCommandHandler('OMEGA_RESOURCE_ECON_EXTRACTION_FISCAL_PENDING','finance',(cmd,ctx)=>{
    fiscalPendingCount++;
    const arr=Array.isArray(ctx.stateTransaction.get('finance.resourceExtractionFiscalLedger'))?ctx.stateTransaction.get('finance.resourceExtractionFiscalLedger').slice():[];
    arr.push({...cmd.payload.record,status:'PENDING_MARKET_VALUATION',turn:state.simulation.turn});
    ctx.stateTransaction.set('finance.resourceExtractionFiscalLedger',arr);
    return{accepted:true};
  });

  vm.runInContext(readFileSync('omega_resource_endowment_runtime.js','utf8'),context,{filename:'omega_resource_endowment_runtime.js'});
  const runtime=context.OmegaResourceEndowmentRuntime;
  const init=await runtime.initialize();
  assert.equal(init.status,'READY');
  assert.equal(init.countries,Object.keys(engine.countryProfiles).length);

  const globalResult=await runtime.extractAll();
  assert.equal(globalResult.status,'COMPLETED');
  const nonEmptyResults=globalResult.results.filter(x=>x.result?.result?.extracted>0);
  const extractedRecords=nonEmptyResults.flatMap(x=>x.result.result.records||[]);
  const executableOccurrenceKeys=new Set(extractedRecords.map(x=>String(x.occurrenceKey||'')).filter(Boolean));
  assert.ok(executableOccurrenceKeys.size>=engine.deposits.length,'Every source-backed deposit must produce at least one executable occurrence stream');
  for(const record of extractedRecords){
    const countryId=record.countryId;
    const row=state.resource[countryId];
    assert.ok(row, 'Missing country resource state for '+countryId);
    assert.equal(record.status,'APPROVED');
    assert.ok((Number(record.approvedQuantity)||0)>0);
    assert.ok(row.mineOutputs?.[record.occurrenceKey]);
    assert.ok((Number(row.mineOutputs[record.occurrenceKey].producedQuantity)||0)>0);
    assert.equal(row.mineOutputs[record.occurrenceKey].batchId,record.producedBatch.batchId);
    assert.ok(row.minePaths?.[record.occurrenceKey]);
    assert.ok((row.minePaths[record.occurrenceKey].batchIds||[]).includes(record.producedBatch.batchId));
    assert.ok(row.inventoryLots?.[record.producedBatch.batchId]);
    assert.equal(row.inventoryLots[record.producedBatch.batchId].occurrenceKey,record.occurrenceKey);
    assert.equal(row.inventoryLots[record.producedBatch.batchId].countryId,countryId);
    assert.equal(row.inventoryLots[record.producedBatch.batchId].warehouseId,'WH-'+countryId+'-RAW');
  }
  const productionLedgerCount=Object.values(state.resource).reduce((sum,row)=>sum+(Array.isArray(row?.mineProductionLedger)?row.mineProductionLedger.length:0),0);
  assert.equal(productionLedgerCount,engine.deposits.length);

  const mineCount=Object.values(state.resource).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.length:0),0);
  const primaryStructuredMineCount=Object.values(state.resource).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.filter(x=>x?.assetType==='STRUCTURED_DEPOSIT').length:0),0);
  const structuredOccurrenceStreamCount=Object.values(state.resource).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.filter(x=>x?.assetType==='STRUCTURED_RESOURCE_OCCURRENCE').length:0),0);
  const activeSiteReferenceCount=Object.values(state.resource).reduce((sum,row)=>sum+(Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences.length:0),0);
  const siteControllerCount=Object.values(state.resource).reduce((sum,row)=>sum+(row?.mineSiteControllers&&typeof row.mineSiteControllers==='object'?Object.keys(row.mineSiteControllers).length:0),0);
  assert.equal(activeSiteReferenceCount,mineSiteReferenceCount);
  assert.equal(siteControllerCount,mineSiteReferenceCount);
  assert.equal(Object.values(state.resource).reduce((sum,row)=>sum+(Number(row?.mineSiteReferenceCount)||0),0),mineSiteReferenceCount);
  assert.equal(Object.values(state.resource).reduce((sum,row)=>sum+(Object.values(row?.mineSiteControllers||{}).filter(x=>x?.controllerStatus==='RUNNING').length||0),0),mineSiteReferenceCount);
  const batchCount=Object.values(state.resource).reduce((sum,row)=>sum+(Array.isArray(row?.batches)?row.batches.length:0),0);
  const pathCount=Object.values(state.resource).reduce((sum,row)=>sum+(row?.minePaths&&typeof row.minePaths==='object'?Object.keys(row.minePaths).length:0),0);
  const sitePathCount=Object.values(state.resource).reduce((sum,row)=>sum+Object.keys(row?.mineSiteControllers||{}).filter(k=>row.minePaths?.[k]).length,0);
  const lotCount=Object.values(state.resource).reduce((sum,row)=>sum+(row?.inventoryLots&&typeof row.inventoryLots==='object'?Object.keys(row.inventoryLots).length:0),0);
  assert.equal(primaryStructuredMineCount,engine.deposits.length);
  assert.equal(primaryStructuredMineCount+structuredOccurrenceStreamCount,mineCount);
  assert.equal(batchCount,extractedRecords.length);
  assert.equal(sitePathCount,mineSiteReferenceCount);
  assert.equal(pathCount,mineSiteReferenceCount+extractedRecords.length);
  assert.equal(lotCount,extractedRecords.length);

  for(const [countryId,row] of Object.entries(state.resource)){
    const batches=Array.isArray(row.batches)?row.batches:[];
    const lots=row.inventoryLots&&typeof row.inventoryLots==='object'?row.inventoryLots:{};
    const paths=row.minePaths&&typeof row.minePaths==='object'?row.minePaths:{};
    for(const batch of batches){
      assert.equal(batch.countryId,countryId);
      assert.equal(batch.sourceCountryId,countryId);
      assert.equal(batch.originCountryId,countryId);
      assert.equal(batch.ownerCountryCode,countryId);
      assert.equal(batch.destinationCountryId,countryId);
      assert.equal(batch.warehouseId,'WH-'+countryId+'-RAW');
      assert.ok(lots[batch.batchId]);
      assert.equal(lots[batch.batchId].countryId,countryId);
      assert.equal(lots[batch.batchId].pathId,'MINE_PATH:'+countryId+':'+batch.originKey);
    }
    for(const path of Object.values(paths)){
      assert.equal(path.countryId,countryId);
      assert.equal(path.sourceCountryId,countryId);
      assert.equal(path.destinationCountryId,countryId);
      assert.ok(path.batchIds.length>=1);
      assert.ok(path.inventoryAllocations.length>=1);
    }
    for(const [rid,quantity] of Object.entries(row.inventory||{})){
      const batchTotal=batches.filter(b=>String(b.resourceId)===String(rid)).reduce((sum,b)=>sum+(Number(b.remainingQuantity)||0),0);
      assert.equal(Number(quantity),batchTotal);
      assert.equal(Number(row.warehouse?.availableByResource?.[rid]||0),batchTotal);
    }
  }

  const crossCountryViolations=[];
  const countryIds=Object.keys(state.resource);
  for(const a of countryIds)for(const b of countryIds)if(a!==b){
    if((state.resource[a].batches||[]).some(x=>x.countryId===b))crossCountryViolations.push([a,b]);
  }
  assert.equal(crossCountryViolations.length,0);
  assert.equal(fiscalPendingCount,engine.deposits.length);
  const siteRefsByCountry=new Map();
  for(const s of siteRefs){
    const arr=siteRefsByCountry.get(s.countryId)||[];arr.push(s.siteName);siteRefsByCountry.set(s.countryId,arr);
  }
  for(const [countryId,row] of Object.entries(state.resource)){
    const expected=siteRefsByCountry.get(countryId)||[];
    const actual=Array.isArray(row.mineSiteReferences)?row.mineSiteReferences.map(x=>x.siteName):[];
    assert.equal(actual.length,expected.length);
    assert.deepEqual(new Set(actual),new Set(expected));
  }
});
