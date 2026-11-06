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
          companyId:'LEGACY_COMPANY_ATTRIBUTION',
          ownerCompanyId:'FACTORY_OWNER_CO',
          operatorCompanyId:'PROCESS_OPERATOR_CO'
        }]
      }
    },
    finance:{BGD:{available:1000,reserves:2000,revenue:0,taxRevenue:0}},
    trade:{BGD:{marketPrice:{iron_ore:10},offerBook:[]}},
    transport:{BGD:{}}
  };

  const handlers=new Map();
  const commands=new Map();
  const commandCollisions=[];
  let commandSequence=0;
  const stateTx=(countryId)=>({
    get(path){
      const parts=String(path).split('.');
      const domain=parts.shift();
      const bucket=worldState[domain]&&worldState[domain][countryId];
      if(bucket===undefined)return undefined;
      return parts.reduce((cur,key)=>cur==null?undefined:cur[key],bucket);
    },
    set(path,value){
      const parts=String(path).split('.');
      const domain=parts.shift();
      if(!worldState[domain])worldState[domain]={};
      if(!worldState[domain][countryId])worldState[domain][countryId]={};
      let cur=worldState[domain][countryId];
      for(let i=0;i<parts.length-1;i++){
        if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};
        cur=cur[parts[i]];
      }
      if(parts.length)cur[parts.at(-1)]=value;
      else worldState[domain][countryId]=value;
    },
    _countryId:countryId
  });

  function state(){ return context.Game.state; }

  const interoperability={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,owner,handler){ handlers.set(type,{owner,handler}); },
    dispatchCommand(owner,type,countryId,payload,options={}){
      const item=handlers.get(type);
      if(!item)return {status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND'};
      const commandId=String(options.commandId||('TEST-'+type+'-'+(++commandSequence)));
      const fingerprint=JSON.stringify({owner,type,countryId,payload});
      const previous=commands.get(commandId);
      if(previous){
        if(previous.fingerprint!==fingerprint){
          commandCollisions.push({commandId,reason:'COMMAND_ID_COLLISION',existingFingerprint:previous.fingerprint,incomingFingerprint:fingerprint});
          return {status:'FAILED',reason:'COMMAND_ID_COLLISION',commandId};
        }
        return {...previous.row,duplicate:true,idempotentReplay:true};
      }
      const result=item.handler(
        {commandId,commandType:type,payload},
        {countryId, stateTransaction:stateTx(countryId)}
      );
      const row={status:result&&result.accepted===false?'FAILED':'APPLIED',result,commandId};
      commands.set(commandId,{fingerprint,row});
      return row;
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
    requestAnimationFrame(){return 1;},
    Game:{state:worldState,playerCountryId:'BGD'},
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
  return {context,worldState,handlers,events,commands,commandCollisions,stateTx};
}

test('export settlement replay is idempotent across company flows, Treasury clearing and fiscal receipts',async()=>{
  const {context,worldState,commands,commandCollisions}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});

  const settlementId='EXPORT-SETTLEMENT-REPLAY-1';
  const eventFor=totalValue=>new CustomEventMock('OMEGA_TRADE_SETTLEMENT_COMPLETED',{
    detail:{payload:{
      settlementId,sellerCountryId:'BGD',resourceId:'iron_ore',
      totalValue,quantity:20,simulationTurn:1,
      sourceBatchIds:['EXPORT-BATCH-1'],
      batchTransfers:[{sourceBatchId:'EXPORT-BATCH-1',sourceBatchIds:['EXPORT-BATCH-1'],
        ownerCompanyId:'MINER_CO',resourceId:'iron_ore',quantity:20}]
    }}
  });
  context.dispatchEvent(eventFor(200));
  const availableAfterFirst=worldState.finance.BGD.available;
  const accountAfterFirst=JSON.stringify(worldState.economy.BGD.companyAccounts.MINER_CO);
  const workerFlowAfterFirst=worldState.economy.BGD.workerIncome.totalSinceRuntimeStart;
  const transportAfterFirst=worldState.transport.BGD.resourceRevenue.totalSinceRuntimeStart;
  const fiscalAfterFirst=worldState.finance.BGD.resourceFiscal.cumulative.total;
  const clearingAfterFirst=worldState.finance.BGD.resourceSettlementClearing.length;
  const commandCountAfterFirst=commands.size;
  const companyJournal=worldState.economy.BGD.companyAccounts.MINER_CO.cashFlowEntries;

  assert.ok(Array.isArray(companyJournal)&&companyJournal.length>=3,'settled receipts and actual operating costs must be journalled');
  assert.equal(new Set(companyJournal.map(row=>row.entryId)).size,companyJournal.length,'each company cash-flow entry has a unique idempotency key');
  assert.ok(companyJournal.some(row=>row.direction==='CREDIT'&&row.category==='SUPPLIER_SALE'));
  assert.ok(companyJournal.some(row=>row.direction==='DEBIT'&&row.category==='WORKER_INCOME'));
  assert.ok(companyJournal.some(row=>row.direction==='DEBIT'&&row.category==='TRANSPORT'));
  assert.equal(worldState.finance.BGD.resourceFiscal.cumulative.corporateTax,0,'corporate income tax must not be charged on gross receipts');
  assert.equal(clearingAfterFirst,1);
  assert.ok(commandCountAfterFirst>=6,'each payment, cost and receipt uses an authoritative command record');

  // Simulate event replay after reload: the volatile listener guard is intentionally removed.
  delete context.__OmegaResourceFiscalizedSettlements[settlementId];
  context.dispatchEvent(eventFor(200));
  assert.equal(worldState.finance.BGD.available,availableAfterFirst,'Treasury clearing and tax receipt must not post twice');
  assert.equal(JSON.stringify(worldState.economy.BGD.companyAccounts.MINER_CO),accountAfterFirst,'company income/payroll/freight flows must not post twice');
  assert.equal(worldState.economy.BGD.workerIncome.totalSinceRuntimeStart,workerFlowAfterFirst);
  assert.equal(worldState.transport.BGD.resourceRevenue.totalSinceRuntimeStart,transportAfterFirst);
  assert.equal(worldState.finance.BGD.resourceFiscal.cumulative.total,fiscalAfterFirst);
  assert.equal(worldState.finance.BGD.resourceSettlementClearing.length,clearingAfterFirst);
  assert.equal(commands.size,commandCountAfterFirst,'saved stable command identities must be replay-safe');

  // Reusing a settlement identity with a different amount is a collision, not a second payment.
  delete context.__OmegaResourceFiscalizedSettlements[settlementId];
  context.dispatchEvent(eventFor(201));
  assert.equal(worldState.finance.BGD.available,availableAfterFirst);
  assert.equal(JSON.stringify(worldState.economy.BGD.companyAccounts.MINER_CO),accountAfterFirst);
  assert.equal(worldState.finance.BGD.resourceSettlementClearing.length,clearingAfterFirst);
  assert.ok(commandCollisions.some(x=>x.reason==='COMMAND_ID_COLLISION'),'same stable command ID with a changed payload must raise a persisted-command integrity collision');
});
test('finished-goods material ownership follows explicit owner, never operator or legacy companyId',async()=>{
  const {context,worldState}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});

  context.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_PROCESSING_COMPLETED',{
    detail:{payload:{
      countryId:'BGD',transactionId:'FACTORYRUN:BGD:OWNER-OPERATOR-1:T1:1',
      factoryId:'OWNER-OPERATOR-1',companyId:'PROCESS_OPERATOR_CO',
      ownerCompanyId:'FACTORY_OWNER_CO',operatorCompanyId:'PROCESS_OPERATOR_CO',
      ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',outputQuantities:{iron_intermediate:25},createdBatchIds:['OUTPUT-1']
    }}
  }));
  assert.equal(worldState.economy.BGD.industrialRuntime.materialOwners.iron_intermediate,'FACTORY_OWNER_CO',
    'only the explicit asset owner owns the finished product and export material attribution');
  assert.notEqual(worldState.economy.BGD.industrialRuntime.materialOwners.iron_intermediate,'PROCESS_OPERATOR_CO');

  context.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_PROCESSING_COMPLETED',{
    detail:{payload:{
      countryId:'BGD',transactionId:'FACTORYRUN:BGD:LEGACY-OWNER:T1:2',
      factoryId:'LEGACY-OWNER',companyId:'LEGACY_OPERATOR_CO',
      ownerCompanyId:'LEGACY_COMPANY_CO',operatorCompanyId:'LEGACY_OPERATOR_CO',
      ownerAttributionStatus:'LEGACY_COMPANY_ATTRIBUTION_ROLE_UNCLASSIFIED',
      outputQuantities:{unclassified_intermediate:10}
    }}
  }));
  assert.equal(worldState.economy.BGD.industrialRuntime.materialOwners.unclassified_intermediate,undefined,
    'a legacy companyId must not be promoted into legal finished-goods ownership');
});
test('finished-goods economy ledger preserves owner and operator as separate parties',async()=>{
  const {context,worldState}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  context.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',{
    detail:{payload:{
      countryId:'BGD',transactionId:'FINISHED-OWNER-OPERATOR-1',factoryId:'OWNER-OPERATOR-1',
      companyId:'PROCESS_OPERATOR_CO',ownerCompanyId:'FACTORY_OWNER_CO',
      operatorCompanyId:'PROCESS_OPERATOR_CO',ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',
      outputQuantities:{iron_intermediate:25},sourceBatchIds:['SOURCE-1'],createdBatchIds:['OUTPUT-1'],
      authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'AVAILABLE'
    }}
  }));
  const row=worldState.economy.BGD.industrialRuntime.finishedGoodsLedger.find(x=>x.transactionId==='FINISHED-OWNER-OPERATOR-1');
  assert.ok(row);
  assert.equal(row.companyId,'PROCESS_OPERATOR_CO');
  assert.equal(row.ownerCompanyId,'FACTORY_OWNER_CO');
  assert.equal(row.operatorCompanyId,'PROCESS_OPERATOR_CO');
  assert.equal(row.ownerAttributionStatus,'EXPLICIT_ASSET_OWNER');
});
test('export settlement blocks unknown and multiple batch owners instead of guessing a company',async()=>{
  const {context,worldState}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  const beforeTreasury=worldState.finance.BGD.available;
  const beforeCompanies=JSON.stringify(worldState.economy.BGD.companyAccounts||{});
  const send=(payload)=>context.dispatchEvent(new CustomEventMock('OMEGA_TRADE_SETTLEMENT_COMPLETED',{detail:{payload}}));

  send({
    settlementId:'EXPORT-UNKNOWN-OWNER',sellerCountryId:'BGD',resourceId:'iron_ore',
    totalValue:200,quantity:20,sourceBatchIds:['UNKNOWN-BATCH'],
    batchTransfers:[{sourceBatchId:'UNKNOWN-BATCH',resourceId:'iron_ore',quantity:20,ownerCompanyId:null}]
  });
  assert.equal(worldState.finance.BGD.available,beforeTreasury,'unknown batch ownership must not draw public Treasury');
  assert.equal(JSON.stringify(worldState.economy.BGD.companyAccounts||{}),beforeCompanies,
    'unknown batch ownership must not create a company receipt');
  let blocked=worldState.economy.BGD.industrialRuntime.tradeSettlementOwnershipFailures;
  assert.equal(blocked.at(-1).settlementId,'EXPORT-UNKNOWN-OWNER');
  assert.equal(blocked.at(-1).reason,'EXPORT_BATCH_OWNER_UNOBSERVED');

  send({
    settlementId:'EXPORT-MULTIPLE-OWNERS',sellerCountryId:'BGD',resourceId:'iron_ore',
    totalValue:300,quantity:30,sourceBatchIds:['OWNER-A-BATCH','OWNER-B-BATCH'],
    batchTransfers:[
      {sourceBatchId:'OWNER-A-BATCH',resourceId:'iron_ore',quantity:15,ownerCompanyId:'OWNER_A'},
      {sourceBatchId:'OWNER-B-BATCH',resourceId:'iron_ore',quantity:15,ownerCompanyId:'OWNER_B'}
    ]
  });
  assert.equal(worldState.finance.BGD.available,beforeTreasury,'multi-owner export must not be credited to an arbitrary company');
  assert.equal(JSON.stringify(worldState.economy.BGD.companyAccounts||{}),beforeCompanies);
  blocked=worldState.economy.BGD.industrialRuntime.tradeSettlementOwnershipFailures;
  assert.equal(blocked.at(-1).settlementId,'EXPORT-MULTIPLE-OWNERS');
  assert.equal(blocked.at(-1).reason,'EXPORT_MULTIPLE_BATCH_OWNERS_REQUIRE_ALLOCATION');
});
test('domestic factory input transfer does not infer a seller from the mine operator when batch owner is unknown',async()=>{
  const {context,worldState}=createContext();
  delete worldState.resource.BGD.batches[0].ownerCompanyId;
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  await context.OmegaResourceEconomy.runTurn();

  const saleRow=worldState.trade.BGD.domesticSales.find(row=>row.sale&&row.sale.resourceId==='iron_ore');
  assert.ok(saleRow,'the physical factory-input movement must still be recorded');
  assert.equal(saleRow.sale.status,'PHYSICAL_TRANSFER_COMPLETED');
  assert.equal(saleRow.sale.paymentStatus,'UNOBSERVED_OWNER_ALLOCATION');
  assert.equal(saleRow.sale.ownerAllocationStatus,'UNRESOLVED');
  assert.equal(worldState.economy.BGD.companyAccounts.MINER_CO,undefined,
    'mine operator is not automatically the legal owner or seller of an unowned batch');
  assert.equal(worldState.economy.BGD.companyAccounts.PROCESS_OPERATOR_CO,undefined,
    'buyer-company cash must not be debited when the supplier payee is unknown');
});
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
  assert.equal(accounts.MINER_CO.runtimeNetCashFlow,415);
  assert.equal(accounts.PROCESS_OPERATOR_CO.runtimeNetCashFlow,-500,
    'factory input/processing cash flow must be attributed to the explicit operator before the legacy companyId or owner');
  assert.equal(accounts.FACTORY_OWNER_CO,undefined,
    'factory ownership must not receive operating expenses when a different operator is recorded');
  assert.equal(accounts.LEGACY_COMPANY_ATTRIBUTION,undefined,
    'legacy companyId must not override an explicit operator identity');
  assert.equal(worldState.economy.BGD.industrialRuntime.materialOwners.iron_intermediate,'FACTORY_OWNER_CO',
    'finished-goods export ownership must follow the asset owner rather than the factory operator');

  assert.equal(worldState.trade.BGD.domesticSales.length,1);
  assert.equal(worldState.trade.BGD.domesticSales[0].sale.status,'SETTLED');
  assert.ok(worldState.trade.BGD.offerBook.length>=2);
  assert.ok(worldState.trade.BGD.offerBook.every(x=>x.source==='OMEGA_RESOURCE_ECON_AUTO_OFFER'));
  assert.ok(worldState.trade.BGD.offerBook.some(x=>x.resourceId==='iron_intermediate'&&x.quantity>0&&x.priceAuthority),
    'finished goods with no observed quote must use an explicitly simulated market offer price');

  assert.equal(worldState.resource.BGD.warehouse.availableByResource.iron_ore,50);
  assert.equal(worldState.resource.BGD.warehouse.availableByResource.iron_intermediate||0,0);
  assert.equal(worldState.resource.BGD.processedWarehouse.availableByResource.iron_intermediate,40);
  const inputBatch=worldState.resource.BGD.batches.find(x=>x.batchId==='MINE-BATCH-1');
  assert.equal(inputBatch.remainingQuantity,50);
  const outputBatch=worldState.resource.BGD.batches.find(x=>x.resourceId==='iron_intermediate');
  assert.ok(outputBatch);
  assert.equal(outputBatch.quantity,40);
  assert.equal(outputBatch.warehouseId,'WH-BGD-PROCESSED');
  assert.equal(outputBatch.purity,0.62);
  assert.equal(outputBatch.qualityState.purityStatus,'INHERITED_FROM_INPUT');
  assert.deepEqual([...outputBatch.sourceBatchIds],['MINE-BATCH-1']);

  const dashboard=context.OmegaResourceEconomy.getCountryDashboard('BGD');
  assert.equal(dashboard.health.warehouseAuthoritative,true);
  assert.equal(dashboard.treasury.fiscalThisTurn.total,115);
  assert.equal(dashboard.mines.total,1);

  assert.equal(typeof context.CountryIOS.renderChapter5_Resources,'function',
    'the existing Resource Ministry UI entrypoint must remain registered');
  assert.equal(dashboard.mines.total,1);
  assert.equal(dashboard.treasury.fiscalThisTurn.total,115,
    'the runtime dashboard must expose the committed fiscal receipt independently of UI rendering');
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
  assert.equal(runtime.factoryInputEvents.at(-1).dispatchStatus,'PENDING_RAW_WAREHOUSE_RECEIPT');
  assert.equal(runtime.factoryInputEvents.at(-1).movementStatus,'AWAITING_CORE_NETWORK_DISPATCH');
  assert.equal(runtime.factoryInputEvents.at(-1).movementAuthority,'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1');
  assert.equal(runtime.factoryInputEvents.at(-1).logisticsPlans.length,0,
    'extraction availability must not create a second pre-warehouse shipment plan');
  assert.ok(events.listeners.has('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE'));
});

test('legacy opening inventory reconciliation creates a warehouse-backed unobserved batch', async()=>{
  const {context,worldState}=createContext();
  worldState.resource.BGD.inventory.copper=25;
  delete worldState.resource.BGD.warehouse.availableByResource.copper;
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  const reconResult=context.OmegaResourceEconomy.reconcileCountry('BGD');
  assert.equal(reconResult.status,'APPLIED');

  const legacy=worldState.resource.BGD.batches.find(x=>x.batchId==='LEGACY_OPENING_BGD_COPPER');
  assert.ok(legacy);
  assert.equal(legacy.remainingQuantity,25);
  assert.equal(legacy.purity,null);
  assert.equal(legacy.qualityState.purityStatus,'UNOBSERVED');
  assert.equal(worldState.resource.BGD.warehouse.availableByResource.copper,25);
  assert.ok(worldState.resource.BGD.warehouse.storedBatchIds.includes(legacy.batchId));
});

test('factory input failure does not consume a resource that lacks the other required input', async()=>{
  const {context,worldState}=createContext();
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

test('factory production yields between bounded batches without skipping eligible facilities',async()=>{
  const {context,worldState}=createContext();
  let yieldCount=0;
  context.navigator={userAgent:'Android',deviceMemory:2,hardwareConcurrency:2};
  context.setTimeout=callback=>{yieldCount++;return setImmediate(callback);};
  context.requestAnimationFrame=callback=>{yieldCount++;return 1;};
  for(let index=1;index<=8;index++){
    worldState.economy.BGD.productionAssets.push({
      id:'PROC_EXTRA_'+index,stage:'PROCESSING',capacity:1,
      inputCoefficients:{iron_ore:1},outputProfile:{iron_intermediate:0.8},
      companyId:'PROCESS_CO_'+index
    });
  }
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  await context.OmegaResourceEconomy.runTurn();
  const runtime=worldState.economy.BGD.industrialRuntime;
  assert.equal(runtime.productionLedger.length,9,'all nine eligible facilities must complete their production transaction');
  assert.equal(runtime.blockedFacilities.length,0,'bounded yielding must not turn eligible facilities into blocked work');
  assert.ok(yieldCount>=5,'mobile production must yield repeatedly during planning and transaction commits');
  assert.equal(worldState.resource.BGD.inventory.iron_ore,42);
  assert.ok(Math.abs(worldState.resource.BGD.inventory.iron_intermediate-46.4)<1e-9,'floating-point output should remain within numerical tolerance');
  assert.equal(worldState.resource.BGD.warehouse.availableByResource.iron_ore,42);
});

test('all modeled mine rows are not capped by the removed legacy 512-row limiter',()=>{
  const code=readFileSync('omega_resource_endowment_runtime.js','utf8');
  assert.doesNotMatch(code,/MAX_MINES/);
  assert.doesNotMatch(code,/slice\(0,\s*MAX_MINES\)/);
  assert.match(code,/OMEGA_RESOURCE_EXTRACT_TICK/);
});