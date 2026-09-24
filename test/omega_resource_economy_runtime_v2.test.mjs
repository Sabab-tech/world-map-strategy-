import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

class EventTargetMock {
  constructor(){ this.listeners=new Map(); }
  addEventListener(type,fn){ const a=this.listeners.get(type)||[]; a.push(fn); this.listeners.set(type,a); }
  removeEventListener(type,fn){ const a=this.listeners.get(type)||[]; this.listeners.set(type,a.filter(x=>x!==fn)); }
  dispatchEvent(evt){ for(const fn of this.listeners.get(evt.type)||[]) fn(evt); return true; }
}
class CustomEventMock {
  constructor(type,opts={}){ this.type=type; this.detail=opts.detail; }
}

function deepGet(root,path){
  let cur=root;
  for(const p of path.split('.')){ if(cur==null)return undefined; cur=cur[p]; }
  return cur;
}
function deepSet(root,path,value){
  const parts=path.split('.');
  let cur=root;
  for(let i=0;i<parts.length-1;i++){ if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={}; cur=cur[parts[i]]; }
  cur[parts[parts.length-1]]=value;
}

function createContext(){
  const events=new EventTargetMock();
  const worldState={
    simulation:{turn:1},
    resource:{
      BGD:{
        mines:[{
          occurrenceKey:'MINE_1',depositName:'Test Iron Mine',resourceId:'iron_ore',
          operatorKey:'MINER_CO',reserveState:{residualQuantity:1000},operationalStatus:'OPERATING'
        }],
        mineOutputs:{
          MINE_1:{status:'OPERATING',producedQuantity:0,
            reserveBefore:{residualQuantity:1000},reserveAfter:{residualQuantity:1000}}
        },
        inventory:{iron_ore:100},
        batches:[{
          batchId:'MINE-BATCH-1',resourceId:'iron_ore',materialIdentity:'iron_ore',
          quantity:100,remainingQuantity:100,stage:'RAW',ownerCountryCode:'BGD',
          ownerCompanyId:'MINER_CO',sourceBatchIds:[],purity:0.62,grade:62,
          quality:0.62,qualityState:{purity:0.62,purityStatus:'OBSERVED',gradePercent:62},
          warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW'
        }],
        warehouse:{
          warehouseId:'WH-BGD-RAW',countryId:'BGD',type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
          locationNodeKey:'WAREHOUSE:BGD:RAW',status:'OPERATIONAL',
          availableByResource:{iron_ore:100},storedBatchIds:['MINE-BATCH-1'],receipts:[]
        }
      }
    },
    economy:{
      BGD:{
        productionAssets:[{
          id:'PROC_1',stage:'PROCESSING',capacity:50,
          inputCoefficients:{iron_ore:1},
          outputProfile:{iron_intermediate:0.8},
          companyId:'PROCESS_CO'
        }]
      }
    },
    finance:{BGD:{available:1000,reserves:2000,revenue:0,taxRevenue:0}},
    trade:{BGD:{marketPrice:{iron_ore:10},offerBook:[]}},
    transport:{BGD:{}}
  };

  const handlers=new Map();
  const stateTx=(countryId)=>({
    get(path){ return deepGet(worldState,path); },
    set(path,value){ deepSet(worldState,path,value); },
    _countryId:countryId
  });

  function state(){ return context.Game.state; }

  const interoperability={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,owner,handler){ handlers.set(type,{owner,handler}); },
    dispatchCommand(owner,type,countryId,payload){
      const item=handlers.get(type);
      if(!item)return {status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND'};
      const result=item.handler(
        {commandId:'TEST-'+type,commandType:type,payload},
        {countryId, stateTransaction:stateTx(countryId)}
      );
      return {status:'APPLIED',result};
    },
    emitEvent(type,countryId,source,payload,meta){
      events.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,payload,source,meta}}));
      return true;
    }
  };

  const countryRegistry={
    resolveCountry(v){ return {id:String(v).toUpperCase()}; },
    list(){ return ['BGD']; }
  };

  const document={
    readyState:'complete',
    head:{appendChild(){}},
    createElement(){ return {id:'',textContent:''}; },
    getElementById(){ return null; }
  };

  const context={
    console,
    Math,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    Date,
    Promise,
    Intl,
    JSON,
    fetch:async(url)=>({
      ok:true,
      async json(){
        if(String(url).includes('resource_ontology.json')) return {COMMODITY_ONTOLOGIES:{}};
        return {
          schemaVersion:'test',
          inventory:{legacyOpeningBalancePolicy:'PRESERVE_AND_MARK',batchConsumptionPolicy:'FIFO',sellableSurplusPolicy:'OBSERVED_INVENTORY_ONLY'},
          fiscal:{royaltyRate:0.02,resourceTaxRate:0.01,corporateTaxRate:0.20,exportDutyRate:0,otherReceiptRate:0},
          operatingAllocation:{workerIncomeRate:0.12,transportRevenueRate:0.05},
          runtime:{maxLedgerEntries:2048,maxBatches:8192},
          market:{offerFractionOfObservedInventory:0.25,minOfferQuantity:1}
        };
      }
    }),
    CustomEvent:CustomEventMock,
    addEventListener:events.addEventListener.bind(events),
    removeEventListener:events.removeEventListener.bind(events),
    dispatchEvent:events.dispatchEvent.bind(events),
    Game:{state:worldState},
    gameState:worldState,
    OmegaCanonicalIdentityRegistry:countryRegistry,
    CountryIOS:{
      activeChapter:5,
      switchChapter(){ this.switchCount=(this.switchCount||0)+1; },
      renderChapter5_Resources(){ return '<original>'; }
    },
    Omega:{
      MinistryInteroperability:interoperability,
      ResourceEconomy:null,
      CanonicalIdentity:countryRegistry
    },
    OmegaGlobalMarket:{
      localPrice(_country,rid){ return worldState.trade.BGD.marketPrice[rid] ?? null; },
      rebuild(){}
    },
    OmegaGlobalTrade:{processAll(){}}
  };
  context.globalThis=context;
  return {context,worldState,handlers,events};
}

test('resource economy v2 completes mine-backed processing, domestic settlement and treasury receipt flow', async()=>{
  const {context,worldState}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  await context.OmegaResourceEconomy.runTurn();

  assert.equal(worldState.resource.BGD.inventory.iron_ore,50);
  assert.equal(worldState.resource.BGD.inventory.iron_intermediate,40);

  const fiscal=worldState.finance.BGD.resourceFiscal;
  assert.equal(fiscal.thisTurn.total,115);
  assert.equal(worldState.finance.BGD.available,1115);
  assert.equal(worldState.finance.BGD.resourceBudgetContribution,115);
  assert.equal(worldState.finance.BGD.resourceBudgetContributionThisTurn,115);

  const accounts=worldState.economy.BGD.companyAccounts;
  assert.equal(accounts.MINER_CO.runtimeNetCashFlow,300);
  assert.equal(accounts.PROCESS_CO.runtimeNetCashFlow,-500);

  assert.equal(worldState.trade.BGD.domesticSales.length,1);
  assert.equal(worldState.trade.BGD.domesticSales[0].sale.status,'SETTLED');
  assert.equal(worldState.trade.BGD.offerBook.length,1);
  assert.equal(worldState.trade.BGD.offerBook[0].source,'OMEGA_RESOURCE_ECON_AUTO_OFFER');

  assert.equal(worldState.resource.BGD.warehouse.availableByResource.iron_ore,50);
  assert.equal(worldState.resource.BGD.warehouse.availableByResource.iron_intermediate,40);
  const inputBatch=worldState.resource.BGD.batches.find(x=>x.batchId==='MINE-BATCH-1');
  assert.equal(inputBatch.remainingQuantity,50);
  const outputBatch=worldState.resource.BGD.batches.find(x=>x.resourceId==='iron_intermediate');
  assert.ok(outputBatch);
  assert.equal(outputBatch.quantity,40);
  assert.equal(outputBatch.purity,0.62);
  assert.equal(outputBatch.qualityState.purityStatus,'INHERITED_FROM_INPUT');
  assert.deepEqual(outputBatch.sourceBatchIds,['MINE-BATCH-1']);

  const dashboard=context.OmegaResourceEconomy.getCountryDashboard('BGD');
  assert.equal(dashboard.health.warehouseAuthoritative,true);
  assert.equal(dashboard.treasury.fiscalThisTurn.total,115);
  assert.equal(dashboard.mines.total,1);

  const html=context.CountryIOS.renderChapter5_Resources('BGD');
  assert.match(html,/DEPOSIT/);
  assert.match(html,/TREASURY/);
  assert.match(html,/OPERATING MINE REGISTER/);
});

test('factory input availability event is persisted as an economy runtime event without creating a duplicate batch', async()=>{
  const {context,worldState,events}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  await context.OmegaResourceEconomy.runTurn();

  const beforeCount=worldState.resource.BGD.batches.length;
  context.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',{
    detail:{
      eventType:'OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',
      countryId:'BGD',
      payload:{
        countryId:'BGD',extractionId:'EXT-1',batch:{batchId:'MINE-BATCH-1'},
        resourceId:'iron_ore',quantity:25,purity:0.62,gradePercent:62,warehouseId:'WH-BGD-RAW',
        simulationTurn:1,sourceAuthority:'RESOURCE_JSON'
      }
    }
  }));

  const runtime=worldState.economy.BGD.industrialRuntime;
  assert.ok(Array.isArray(runtime.factoryInputEvents));
  assert.equal(runtime.factoryInputEvents.at(-1).batchId,'MINE-BATCH-1');
  assert.equal(runtime.factoryInputEvents.at(-1).purity,0.62);
  assert.equal(worldState.resource.BGD.batches.length,beforeCount);
  assert.deepEqual(runtime.factoryInputEvents.at(-1).candidateFactoryIds,['PROC_1']);
  assert.equal(runtime.factoryInputEvents.at(-1).dispatchStatus,'AVAILABLE_TO_MATCHING_FACTORIES');
  assert.ok(events.listeners.has('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE'));
});

test('legacy opening inventory reconciliation creates a warehouse-backed unobserved batch', async()=>{
  const {context,worldState}=createContext();
  worldState.resource.BGD.inventory.copper=25;
  delete worldState.resource.BGD.warehouse.availableByResource.copper;
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  context.OmegaResourceEconomy.reconcileCountry('BGD');

  const legacy=worldState.resource.BGD.batches.find(x=>x.batchId==='LEGACY_OPENING_BGD_COPPER');
  assert.ok(legacy);
  assert.equal(legacy.remainingQuantity,25);
  assert.equal(legacy.purity,null);
  assert.equal(legacy.qualityState.purityStatus,'UNOBSERVED');
  assert.equal(worldState.resource.BGD.warehouse.availableByResource.copper,25);
  assert.ok(worldState.resource.BGD.warehouse.storedBatchIds.includes(legacy.batchId));
});

test('factory input failure does not consume a resource that lacks the other required input', async()=>{
  const {context,state}=createContext();
  worldState.economy.BGD.productionAssets.push({
    id:'FACTORY_2',stage:'FACTORY',capacity:10,
    inputCoefficients:{iron_ore:1,copper:1},
    outputProfile:{finished_alloy:1},
    companyId:'FACTORY_CO'
  });
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  await context.OmegaResourceEconomy.runTurn();

  const blocked=worldState.economy.BGD.industrialRuntime.blockedFacilities.find(x=>x.facilityId==='FACTORY_2');
  assert.ok(blocked);
  assert.equal(blocked.reason,'INPUT_STOCK_UNAVAILABLE');
  assert.equal(worldState.resource.BGD.inventory.copper,undefined);
});

test('all modeled mine rows are not capped by the removed legacy 512-row limiter',()=>{
  const code=readFileSync('omega_resource_endowment_runtime.js','utf8');
  assert.doesNotMatch(code,/MAX_MINES/);
  assert.doesNotMatch(code,/slice\(0,\s*MAX_MINES\)/);
  assert.match(code,/OMEGA_RESOURCE_EXTRACT_TICK/);
});