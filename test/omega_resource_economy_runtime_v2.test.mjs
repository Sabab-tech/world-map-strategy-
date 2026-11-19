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

const STORAGE_POLICY = {
  policyId:'OMEGA_STORAGE_DETERIORATION_MODEL_V1',version:1,simulationOnly:true,
  authority:'SIMULATED_GAMEPLAY_RULE',timeBasis:'ELIGIBLE_GAME_TURNS',
  defaultProfile:{class:'STABLE_CATALOG_COMMODITY',graceTurns:0,lossRatePerEligibleTurn:0},
  profiles:{grain:{class:'AGRICULTURAL_PERISHABLE',graceTurns:30,lossRatePerEligibleTurn:0.001}}
};

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
          quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,stage:'RAW',ownerCountryCode:'BGD',
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
        ownerCompanyId:'NOVA_CONSUMER_INDUSTRIES',resourceId:'iron_ore',quantity:20}]
    }}
  });
  context.dispatchEvent(eventFor(200));
  const availableAfterFirst=worldState.finance.BGD.available;
  const accountAfterFirst=JSON.stringify(worldState.economy.BGD.companyAccounts.NOVA_CONSUMER_INDUSTRIES);
  const workerFlowAfterFirst=worldState.economy.BGD.workerIncome.totalSinceRuntimeStart;
  const transportAfterFirst=worldState.transport.BGD.resourceRevenue.totalSinceRuntimeStart;
  const fiscalAfterFirst=worldState.finance.BGD.resourceFiscal.cumulative.total;
  const clearingAfterFirst=worldState.finance.BGD.resourceSettlementClearing.length;
  const commandCountAfterFirst=commands.size;
  const companyJournal=worldState.economy.BGD.companyAccounts.NOVA_CONSUMER_INDUSTRIES.cashFlowEntries;

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
  assert.equal(JSON.stringify(worldState.economy.BGD.companyAccounts.NOVA_CONSUMER_INDUSTRIES),accountAfterFirst,'company income/payroll/freight flows must not post twice');
  assert.equal(worldState.economy.BGD.workerIncome.totalSinceRuntimeStart,workerFlowAfterFirst);
  assert.equal(worldState.transport.BGD.resourceRevenue.totalSinceRuntimeStart,transportAfterFirst);
  assert.equal(worldState.finance.BGD.resourceFiscal.cumulative.total,fiscalAfterFirst);
  assert.equal(worldState.finance.BGD.resourceSettlementClearing.length,clearingAfterFirst);
  assert.equal(commands.size,commandCountAfterFirst,'saved stable command identities must be replay-safe');

  // Reusing a settlement identity with a different amount is a collision, not a second payment.
  delete context.__OmegaResourceFiscalizedSettlements[settlementId];
  context.dispatchEvent(eventFor(201));
  assert.equal(worldState.finance.BGD.available,availableAfterFirst);
  assert.equal(JSON.stringify(worldState.economy.BGD.companyAccounts.NOVA_CONSUMER_INDUSTRIES),accountAfterFirst);
  assert.equal(worldState.finance.BGD.resourceSettlementClearing.length,clearingAfterFirst);
  assert.ok(commandCollisions.some(x=>x.reason==='COMMAND_ID_COLLISION'),'same stable command ID with a changed payload must raise a persisted-command integrity collision');
});
test('private-company settlement fiscalization does not credit seller revenue or Treasury twice',async()=>{
  const {context,worldState,commands}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  const settlementId='PRIVATE-COMPANY-SETTLEMENT-ONCE';
  const sellerCompany='NOVA_CONSUMER_INDUSTRIES';
  const buyerCompany='ATLAS_TECHNOLOGY_CORPORATION';
  const account={
    companyId:sellerCompany,openingCashStatus:'UNKNOWN',runtimeNetCashFlow:200,
    grossRevenue:200,paymentsReceived:200,paymentsMade:0,taxPaid:0,
    workerIncomePaid:0,transportPaid:0,supplierRevenue:200,lastTurn:1,
    cashFlowJournalVersion:1,cashFlowJournalStartedAtTurn:1,cashFlowEntries:[{
      entryId:'PE-PRIVATE-IMPORT-RECEIPT:'+settlementId,companyId:sellerCompany,
      amount:200,direction:'CREDIT',category:'PRIVATE_COMPANY_EXPORT_SALE',
      currency:'USD',sourceId:settlementId,turn:1,status:'POSTED'
    }]
  };
  worldState.economy.BGD.companyAccounts={[sellerCompany]:account};
  const treasuryBefore=worldState.finance.BGD.available;
  const revenueBefore=account.grossRevenue;
  const receivedBefore=account.paymentsReceived;
  const send=()=>context.dispatchEvent(new CustomEventMock('OMEGA_TRADE_SETTLEMENT_COMPLETED',{
    detail:{payload:{
      settlementId,sellerCountryId:'BGD',resourceId:'iron_ore',totalValue:200,quantity:20,
      buyerCompanyId:buyerCompany,sellerCompanyId:sellerCompany,privateCompanyPurchase:true,
      sourceBatchIds:['PRIVATE-EXPORT-BATCH'],
      batchTransfers:[{sourceBatchId:'PRIVATE-EXPORT-BATCH',sourceBatchIds:['PRIVATE-EXPORT-BATCH'],
        ownerCompanyId:sellerCompany,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
        ownerAttributionStatus:'EXPLICIT_PRIVATE_COMPANY_ASSET_OWNER',resourceId:'iron_ore',quantity:20}]
    }}
  }));
  send();
  const afterFirst=worldState.economy.BGD.companyAccounts[sellerCompany];
  assert.equal(afterFirst.grossRevenue,revenueBefore,'private import completion already credited seller revenue');
  assert.equal(afterFirst.paymentsReceived,receivedBefore,'fiscalization must not post a second seller receipt');
  const fiscalReceipts=Number(worldState.finance.BGD.resourceFiscal?.cumulative?.total)||0;
  assert.equal(worldState.finance.BGD.available,treasuryBefore+fiscalReceipts,
    'only export taxes/royalties may reach Treasury; private company sale proceeds stay in the company wallet');
  assert.ok(fiscalReceipts<200,"public export receipts must not absorb the private company sale value");
  assert.equal((worldState.finance.BGD.resourceSettlementClearing||[]).length,0,'private seller proceeds must not be Treasury-cleared');
  const firstEntries=JSON.stringify(afterFirst.cashFlowEntries);
  const commandTypes=[...commands.values()].map(row=>JSON.parse(row.fingerprint).type);
  assert.equal(commandTypes.includes('OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY'),false);
  delete context.__OmegaResourceFiscalizedSettlements[settlementId];
  send();
  const afterReplay=worldState.economy.BGD.companyAccounts[sellerCompany];
  assert.equal(afterReplay.grossRevenue,revenueBefore,'replayed private settlement must not double-credit revenue');
  assert.equal(afterReplay.paymentsReceived,receivedBefore,'replayed private settlement must not double-credit cash receipts');
  assert.equal(JSON.stringify(afterReplay.cashFlowEntries),firstEntries,'replayed private settlement must not duplicate operating costs');
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
  // Run the real domestic-sale path with canonical private owner/operator identities.
  worldState.resource.BGD.batches[0].ownerCompanyId='NOVA_CONSUMER_INDUSTRIES';
  const privateFactory=worldState.economy.BGD.productionAssets[0];
  privateFactory.ownerType='PRIVATE_ENTERPRISE';
  privateFactory.ownerCompanyId='ATLAS_TECHNOLOGY_CORPORATION';
  privateFactory.operatorType='PRIVATE_COMPANY_OPERATOR';
  privateFactory.operatorCompanyId='MERIDIAN_ENGINEERING_GROUP';
  privateFactory.companyId='MERIDIAN_ENGINEERING_GROUP';
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  await context.OmegaResourceEconomy.runTurn();

  assert.equal(worldState.resource.BGD.inventory.iron_ore,50);
  assert.equal(worldState.resource.BGD.inventory.iron_intermediate,40);

  const fiscal=worldState.finance.BGD.resourceFiscal;
  assert.equal(fiscal.thisTurn.total,15,JSON.stringify(fiscal));
  assert.equal(fiscal.thisTurn.corporateTax,0,'corporate income tax is assessed on net profit at company period close, not gross mineral receipts');
  assert.equal(worldState.finance.BGD.available,1015);
  assert.equal(worldState.finance.BGD.resourceBudgetContribution,15);
  assert.equal(worldState.finance.BGD.resourceBudgetContributionThisTurn,15);

  const accounts=worldState.economy.BGD.companyAccounts;
  assert.equal(accounts.NOVA_CONSUMER_INDUSTRIES.runtimeNetCashFlow,415,
    'domestic sale revenue must credit the private legal owner of the consumed batch');
  assert.equal(accounts.MERIDIAN_ENGINEERING_GROUP.runtimeNetCashFlow,-500,
    'factory input/processing cash flow must be attributed to the explicit private operator');
  assert.equal(accounts.ATLAS_TECHNOLOGY_CORPORATION,undefined,
    'factory ownership must not receive operating expenses when a different operator is recorded');
  assert.equal(accounts.LEGACY_COMPANY_ATTRIBUTION,undefined,
    'legacy companyId must not override an explicit operator identity');
  assert.equal(worldState.trade.BGD.domesticSales[0].sale.supplierAllocations.NOVA_CONSUMER_INDUSTRIES,50,
    'settled domestic sale must retain the exact private-owner revenue allocation');
  const ownedOutputBatch=worldState.resource.BGD.batches.find(x=>x.resourceId==='iron_intermediate');
  assert.equal(ownedOutputBatch?.ownerCompanyId,'ATLAS_TECHNOLOGY_CORPORATION',
    'finished-goods export ownership must follow the asset owner rather than the factory operator');
  assert.equal(ownedOutputBatch?.operatorCompanyId,'MERIDIAN_ENGINEERING_GROUP',
    'the operator remains distinct from the legal finished-goods owner');

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
  assert.equal(dashboard.treasury.fiscalThisTurn.total,15);
  assert.equal(dashboard.mines.total,1);

  assert.equal(typeof context.CountryIOS.renderChapter5_Resources,'function',
    'the existing Resource Ministry UI entrypoint must remain registered');
  assert.equal(dashboard.mines.total,1);
  assert.equal(dashboard.treasury.fiscalThisTurn.total,15,
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

test('normalized legacy inventory keys reconcile against canonical batch IDs without duplicate stock',()=>{
  const {context,worldState}=createContext();
  const resource=worldState.resource.BGD;
  resource.inventory={coal_concentrate:100};
  resource.batches=[{
    batchId:'OUTPUT-COAL-CONCENTRATE-NORMALIZED-RECON',
    resourceId:'COAL_CONCENTRATE',materialIdentity:'COAL_CONCENTRATE',
    quantity:20,remainingQuantity:20,unit:'TONNES',stage:'FINISHED',status:'AVAILABLE',
    countryId:'BGD',sourceCountryId:'BGD',originCountryId:'BGD',ownerCountryCode:'BGD',
    destinationCountryId:'BGD',sourceBatchIds:[],createdTurn:1
  }];
  resource.inventoryLots={
    'OUTPUT-COAL-CONCENTRATE-NORMALIZED-RECON':{
      batchId:'OUTPUT-COAL-CONCENTRATE-NORMALIZED-RECON',resourceId:'COAL_CONCENTRATE',
      quantity:20,remainingQuantity:20,unit:'TONNES',stage:'FINISHED',countryId:'BGD',status:'AVAILABLE'
    }
  };
  resource.warehouse={
    warehouseId:'WH-BGD-RAW',countryId:'BGD',type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
    locationNodeKey:'WAREHOUSE:BGD:RAW',status:'OPERATIONAL',
    availableByResource:{},storedBatchIds:[],receipts:[]
  };
  resource.processedWarehouse={
    warehouseId:'WH-BGD-PROCESSED',countryId:'BGD',type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',
    locationNodeKey:'WAREHOUSE:BGD:PROCESSED',status:'OPERATIONAL',
    availableByResource:{COAL_CONCENTRATE:20},storedBatchIds:['OUTPUT-COAL-CONCENTRATE-NORMALIZED-RECON'],receipts:[]
  };
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  const result=context.OmegaResourceEconomy.reconcileCountry('BGD');
  assert.equal(result.status,'APPLIED');
  const normalized=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const inventoryKeys=Object.keys(resource.inventory).filter(key=>normalized(key)==='coal_concentrate');
  assert.deepEqual(inventoryKeys,['coal_concentrate'],
    'legacy inventory aliases must not be split into a second logical stock key');
  assert.equal(resource.inventory.coal_concentrate,100,
    'reconciliation must preserve the complete pre-existing aggregate stock');
  const batches=resource.batches.filter(row=>normalized(row.resourceId||row.materialIdentity)==='coal_concentrate');
  assert.equal(batches.reduce((sum,row)=>sum+Math.max(0,Number(row.remainingQuantity??row.quantity)||0),0),100,
    'the canonical finished batch and legacy opening balance must reconcile to the same aggregate');
  const warehouseQuantity=map=>Object.entries(map||{}).filter(([key])=>normalized(key)==='coal_concentrate')
    .reduce((sum,[,quantity])=>sum+Math.max(0,Number(quantity)||0),0);
  assert.equal(warehouseQuantity(resource.warehouse.availableByResource),80,
    'unallocated legacy stock must receive one raw-warehouse-backed batch');
  assert.equal(warehouseQuantity(resource.processedWarehouse.availableByResource),20,
    'the canonical finished batch must remain in the processed warehouse');
  assert.equal(resource.inventoryIntegrity.status,'HEALTHY',
    'normalized inventory, batch and warehouse ledgers must finish in a healthy state');
  const batchCount=resource.batches.length;
  context.OmegaResourceEconomy.reconcileCountry('BGD');
  assert.equal(resource.batches.length,batchCount,
    'replaying normalized reconciliation must not create another legacy top-up batch');
  assert.equal(resource.inventory.coal_concentrate,100);
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

test('private factory output keeps legal owner separate from operating company in batches and inventory lots',()=>{
  const {context,worldState}=createContext();
  const asset=worldState.economy.BGD.productionAssets[0];
  asset.ownerType='PRIVATE_ENTERPRISE';
  asset.ownerCompanyId='AURORA_INDUSTRIAL_GROUP';
  asset.operatorCompanyId='NOVA_CONSUMER_INDUSTRIES';
  asset.companyId='NOVA_CONSUMER_INDUSTRIES';
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  const result=context.OmegaResourceEconomy.executeCountryFactories('BGD');
  assert.equal(result.executed.length,1);
  const output=worldState.resource.BGD.batches.find(row=>row.resourceId==='iron_intermediate');
  assert.ok(output);
  assert.equal(output.ownerCompanyId,'AURORA_INDUSTRIAL_GROUP','finished goods belong to the legal private owner');
  assert.equal(output.operatorCompanyId,'NOVA_CONSUMER_INDUSTRIES','the operator remains separately recorded');
  assert.equal(output.ownerAttributionStatus,'EXPLICIT_ASSET_OWNER');
  const lot=worldState.resource.BGD.inventoryLots[output.batchId];
  assert.equal(lot.ownerCompanyId,'AURORA_INDUSTRIAL_GROUP');
  assert.equal(lot.operatorCompanyId,'NOVA_CONSUMER_INDUSTRIES');
  const ledger=worldState.resource.BGD.inventoryLedger.find(row=>row.type==='PRODUCTION_TRANSACTION_COMMITTED');
  assert.equal(ledger.ownerCompanyId,'AURORA_INDUSTRIAL_GROUP');
  assert.equal(ledger.operatorCompanyId,'NOVA_CONSUMER_INDUSTRIES');
  assert.equal(result.executed[0].companyId,'NOVA_CONSUMER_INDUSTRIES',
    'operating costs and production execution follow the operator');
  assert.equal(result.executed[0].ownerCompanyId,'AURORA_INDUSTRIAL_GROUP');
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

test('capacity upgrade requests persist only through their economy-owned country command',()=>{
  const {context,worldState,handlers}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});

  const type='OMEGA_RESOURCE_ECON_PUBLISH_CAPACITY_UPGRADE_REQUESTS';
  const registration=handlers.get(type);
  assert.ok(registration,'economy-owned capacity request publisher must be registered');
  assert.equal(registration.owner,'economy');

  const request={requestId:'CAPACITY-OWNER-1',countryId:'BGD',resourceId:'iron_ore',
    status:'UNDER_CONSTRUCTION',projectId:'PROJECT-CAPACITY-OWNER-1'};
  const legacyRequest={requestId:'CAPACITY-OWNER-LEGACY',resourceId:'iron_ore',status:'REQUESTED'};
  const saved=context.Omega.MinistryInteroperability.dispatchCommand('economy',type,'BGD',{
    requests:[request,legacyRequest]
  },{commandId:'CAPACITY-OWNER-SAVE-1'});
  assert.equal(saved.status,'APPLIED',JSON.stringify(saved));
  assert.equal(saved.result.accepted,true,JSON.stringify(saved));
  assert.equal(JSON.stringify(worldState.economy.BGD.capacityUpgradeRequests),
    JSON.stringify([request,{...legacyRequest,countryId:'BGD'}]),
    'legacy requests without an explicit country stay scoped to their existing country bucket');

  const rejected=context.Omega.MinistryInteroperability.dispatchCommand('economy',type,'BGD',{
    requests:[{...request,countryId:'KWT'}]
  },{commandId:'CAPACITY-OWNER-CROSS-COUNTRY-1'});
  assert.equal(rejected.status,'FAILED',JSON.stringify(rejected));
  assert.equal(rejected.result.reason,'CAPACITY_UPGRADE_REQUEST_COUNTRY_MISMATCH');
  assert.equal(JSON.stringify(worldState.economy.BGD.capacityUpgradeRequests),
    JSON.stringify([request,{...legacyRequest,countryId:'BGD'}]),
    'a foreign-country capacity request must never overwrite the BGD economy bucket');
});


test('resource economy resolves Bangladesh ISO2 aliases into the ISO3 BGD state bucket',()=>{
  const {context,worldState}=createContext();
  const registry={
    resolveCountry(value){
      const raw=value&&typeof value==='object'
        ?(value.iso3||value.iso3Code||value.countryCode||value.countryId||value.id||value.name)
        :String(value||'').trim().toUpperCase();
      if(['BD','BGD','BANGLADESH'].includes(String(raw).toUpperCase()))
        return{id:'BD',canonicalId:'BD',countryCode:'BD',raw:{countryCode:'BD',iso2:'BD'}};
      return{id:String(raw).toUpperCase(),raw:{countryCode:String(raw).toUpperCase()}};
    },
    list(){return[{id:'BD',countryCode:'BD',iso3:'BGD'}];}
  };
  context.OmegaCanonicalIdentityRegistry=registry;
  context.Omega.CanonicalIdentity=registry;
  context.ResourceMinistryEngine={
    normalizeCountryCode(value){
      const raw=String(value??'').trim().toUpperCase();
      if(raw==='BD'||raw==='BANGLADESH')return'BGD';
      return raw;
    }
  };
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});

  const dashboard=context.OmegaResourceEconomy.getCountryDashboard('BD');
  assert.equal(dashboard.countryId,'BGD');
  assert.equal(dashboard.mines.total,1);
  assert.equal(dashboard.inventory.actual.iron_ore,100);
  assert.equal(worldState.resource.BD,undefined,
    'an ISO2 display alias must not create a duplicate resource state bucket');
  assert.equal(context.OmegaResourceEconomy.diagnostics().countryCount,1);
});


test('resource company-flow writer preserves firm journal v2 and leaves unmapped rows unavailable',async()=>{
  const {context,worldState}=createContext();
  const code=readFileSync('omega_resource_economy_runtime_v2.js','utf8');
  vm.runInNewContext(code,context,{filename:'omega_resource_economy_runtime_v2.js'});
  const companyId='PHASE5_RESOURCE_FLOW_COMPANY';
  worldState.economy.BGD.companyAccounts={
    [companyId]:{
      companyId,openingCashStatus:'UNKNOWN',runtimeNetCashFlow:0,grossRevenue:0,paymentsReceived:0,
      paymentsMade:0,taxPaid:0,workerIncomePaid:0,transportPaid:0,supplierRevenue:0,lastTurn:1,
      cashFlowJournalVersion:2,cashFlowJournalStartedAtTurn:1,cashFlowEntries:[{
        entryId:'FIRM-JOURNAL-V2-EXISTING',companyId,amount:20,direction:'CREDIT',
        category:'PRIVATE_COMPANY_EXPORT_SALE',currency:'USD',sourceId:'FIRM-TRADE-SETTLEMENT',
        turn:1,status:'POSTED',
        sectorJournalV1:{schemaVersion:1,status:'POSTED',sectorId:'firm',
          sourceTransactionId:'FIRM-JOURNAL-V2-EXISTING',debitTotalMinor:2000,creditTotalMinor:2000}
      }]
    }
  };
  const result=context.Omega.MinistryInteroperability.dispatchCommand(
    'economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW','BGD',{
      companyId,amount:7.25,direction:'DEBIT',category:'WORKER_INCOME',
      settlementId:'PHASE5-UNMAPPED-RESOURCE-COMPANY-FLOW',
      idempotencyKey:'PHASE5-RESOURCE-COMPANY-FLOW-V2-1',currency:'USD'
    }
  );
  assert.equal(result.status,'APPLIED',JSON.stringify(result));
  const account=worldState.economy.BGD.companyAccounts[companyId];
  assert.equal(account.cashFlowJournalVersion,2,'resource flow must never downgrade the newer firm journal version');
  assert.equal(account.cashFlowEntries[0].sectorJournalV1.status,'POSTED',
    'the prior source-backed firm journal is not overwritten');
  const added=account.cashFlowEntries.find(row=>row.entryId==='PHASE5-RESOURCE-COMPANY-FLOW-V2-1');
  assert.ok(added);
  assert.equal(added.sectorJournalV1.status,'UNAVAILABLE');
  assert.equal(added.sectorJournalV1.reason,'RESOURCE_ECONOMY_COMPANY_FLOW_CATEGORY_NOT_MAPPED');
  assert.equal(added.sectorJournalV1.sourceAuthority,'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2');
  assert.equal(added.sectorJournalV1.countryId,'BGD');
  assert.equal(added.sectorJournalV1.companyId,companyId);
  assert.equal(added.sectorJournalV1.currency,'USD');
  assert.equal(account.runtimeNetCashFlow,-7.25);
  assert.equal(account.paymentsMade,7.25);
});


test('storage write-off and mine-haul transport loss commit physical balances and canonical loss events once',async()=>{
  const {context,worldState}=createContext();
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD;
  resource.inventoryLots={
    'MINE-BATCH-1':{batchId:'MINE-BATCH-1',resourceId:'iron_ore',quantity:100,remainingQuantity:100,
      unit:'TONNES',createdTurn:1,status:'AVAILABLE'}
  };
  resource.industrialNetwork={shipments:[],deliveries:[],siteFlowLedger:[]};
  const opening=api.captureStockFlowPeriod('BGD');
  assert.equal(opening.status,'APPLIED');
  assert.equal(opening.result.status,'CAPTURED');

  const beforeStorage=resource.inventory.iron_ore;
  const writeOff=api.writeOffInventory('BGD',{eventId:'STORAGE-WRITEOFF-1',resourceId:'iron_ore',
    quantity:7,unit:'TONNES',reason:'WAREHOUSE_DAMAGE'});
  assert.equal(writeOff.status,'APPLIED',JSON.stringify(writeOff));
  assert.equal(writeOff.result.accepted,true);
  assert.equal(resource.inventory.iron_ore,beforeStorage-7);
  assert.equal(resource.warehouse.availableByResource.iron_ore,93);
  assert.equal(resource.batches[0].remainingQuantity,93);
  assert.equal(resource.inventoryLedger.at(-1).type,'STORAGE_LOSS_COMMITTED');
  assert.equal(resource.stockLossLedger.length,1);
  const measuredStorage=api.processStorageDeterioration('BGD',{policy:STORAGE_POLICY,knownResourceIds:['iron_ore']});
  assert.equal(measuredStorage.status,'APPLIED',JSON.stringify(measuredStorage));
  assert.equal(measuredStorage.result.accepted,true);
  assert.equal(measuredStorage.result.measured,1);
  assert.equal(measuredStorage.result.measuredZero,1);
  assert.equal(resource.storageDeteriorationLedger.length,1);
  const afterMeasurement=JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    warehouse:resource.warehouse,lots:resource.inventoryLots,observations:resource.storageDeteriorationLedger});
  const replayMeasurement=api.processStorageDeterioration('BGD',{policy:STORAGE_POLICY,knownResourceIds:['iron_ore']});
  assert.equal(replayMeasurement.status,'APPLIED');
  assert.equal(JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    warehouse:resource.warehouse,lots:resource.inventoryLots,observations:resource.storageDeteriorationLedger}),afterMeasurement,
    'storage deterioration must be idempotent within a game turn');
  const afterStorage=JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    warehouse:resource.warehouse,losses:resource.stockLossLedger});
  const replayWriteOff=api.writeOffInventory('BGD',{eventId:'STORAGE-WRITEOFF-1',resourceId:'iron_ore',
    quantity:7,unit:'TONNES',reason:'WAREHOUSE_DAMAGE'});
  assert.equal(replayWriteOff.status,'APPLIED');
  assert.equal(JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    warehouse:resource.warehouse,losses:resource.stockLossLedger}),afterStorage,
    'same write-off event must not debit stock or append another loss');

  // Dispatch 20 of the remaining 93 tonnes from the 73-tonne warehouse remainder + 20 held cargo.
  resource.industrialNetwork={
    shipments:[{shipmentId:'MINE-HAUL-LOSS-1',shipmentType:'MINE_TO_WAREHOUSE',countryId:'BGD',
      siteId:'MINE_1',resourceId:'iron_ore',batchId:'MINE-BATCH-1',quantity:20,dispatchedQuantity:20,
      lostQuantity:0,lossEvents:[],unit:'TONNES',status:'IN_TRANSIT',createdTurn:0}],
    deliveries:[],
    siteFlowLedger:[{batchId:'MINE-BATCH-1',siteId:'MINE_1',resourceId:'iron_ore',
      mineHeldQuantity:20,mineWarehouseReceivedQuantity:73,mineLogisticsStockDebited:true,
      mineLogisticsRouteId:'ROUTE-1'}]
  };
  // The shipment source was debited from sovereign warehouse stock at dispatch.
  resource.inventory.iron_ore-=20;
  resource.warehouse.availableByResource.iron_ore-=20;
  const transportLoss=api.recordShipmentLoss('BGD',{eventId:'MINE-HAUL-LOSS-EVENT-1',
    shipmentId:'MINE-HAUL-LOSS-1',resourceId:'iron_ore',quantity:3,unit:'TONNES',reason:'CONFIRMED_CARGO_DAMAGE'});
  assert.equal(transportLoss.status,'APPLIED',JSON.stringify(transportLoss));
  assert.equal(transportLoss.result.accepted,true);
  assert.equal(resource.industrialNetwork.shipments[0].quantity,17);
  assert.equal(resource.industrialNetwork.shipments[0].lostQuantity,3);
  assert.equal(resource.industrialNetwork.siteFlowLedger[0].mineHeldQuantity,17);
  assert.equal(resource.batches[0].remainingQuantity,90);
  assert.equal(resource.inventoryLots['MINE-BATCH-1'].remainingQuantity,90);
  assert.equal(resource.stockLossLedger.length,2);
  const afterTransport=JSON.stringify({shipment:resource.industrialNetwork.shipments[0],
    flow:resource.industrialNetwork.siteFlowLedger[0],batches:resource.batches,
    lots:resource.inventoryLots,losses:resource.stockLossLedger});
  const replayTransport=api.recordShipmentLoss('BGD',{eventId:'MINE-HAUL-LOSS-EVENT-1',
    shipmentId:'MINE-HAUL-LOSS-1',resourceId:'iron_ore',quantity:3,unit:'TONNES',reason:'CONFIRMED_CARGO_DAMAGE'});
  assert.equal(replayTransport.status,'APPLIED');
  assert.equal(JSON.stringify({shipment:resource.industrialNetwork.shipments[0],
    flow:resource.industrialNetwork.siteFlowLedger[0],batches:resource.batches,
    lots:resource.inventoryLots,losses:resource.stockLossLedger}),afterTransport,
    'same shipment loss event must not reduce cargo twice');

  for(const source of ['STORAGE','TRANSPORT','PRODUCTION']){
    const result=api.attestStockLossCoverage('BGD',source);
    assert.equal(result.status,'APPLIED',JSON.stringify(result));
    assert.equal(result.result.coverageStatus,'COMPLETE',JSON.stringify(result.result));
  }
  const period=resource.stockFlowPeriods.find(row=>row.periodId==='GAME_TURN_1');
  assert.equal(period.lossCoverageStatus,'COMPLETE');
  assert.equal(period.lossCoverageBySource.STORAGE.lossEventsObserved,1);
  assert.equal(period.lossCoverageBySource.TRANSPORT.lossEventsObserved,1);
  assert.equal(period.lossCoverageBySource.PRODUCTION.status,'COMPLETE');

  const nextWriteOff=api.writeOffInventory('BGD',{eventId:'STORAGE-WRITEOFF-2',resourceId:'iron_ore',
    quantity:1,unit:'TONNES',reason:'CONTAMINATION'});
  assert.equal(nextWriteOff.status,'APPLIED');
  const invalidatedPeriod=resource.stockFlowPeriods.find(row=>row.periodId==='GAME_TURN_1');
  assert.equal(invalidatedPeriod.lossCoverageStatus,'UNOBSERVED_SOURCE_COVERAGE_NOT_ATTESTED',
    'a post-attestation mutation must invalidate stale period coverage');
  assert.equal(invalidatedPeriod.lossCoverageBySource.STORAGE.status,'INVALIDATED_BY_NEW_LOSS_EVENT');
});

test('automatic storage deterioration debits free physical stock once and carries fractional loss',async()=>{
  const {context,worldState}=createContext();
  worldState.simulation.turn=32;
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD;
  resource.inventory.grain=100;
  resource.batches=[{batchId:'GRAIN-BATCH-1',resourceId:'grain',materialIdentity:'grain',
    quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,stage:'RAW',status:'AVAILABLE',
    warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW'}];
  resource.inventoryLots={'GRAIN-BATCH-1':{batchId:'GRAIN-BATCH-1',resourceId:'grain',
    quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,status:'AVAILABLE'}};
  resource.warehouse.availableByResource.grain=100;
  resource.warehouse.storedBatchIds=['GRAIN-BATCH-1'];
  const result=api.processStorageDeterioration('BGD',{policy:STORAGE_POLICY,knownResourceIds:['grain']});
  assert.equal(result.status,'APPLIED',JSON.stringify(result));
  assert.equal(result.result.accepted,true);
  assert.equal(result.result.lossEventsCommitted,1);
  assert.equal(resource.inventory.grain,99.9);
  assert.equal(resource.warehouse.availableByResource.grain,99.9);
  assert.equal(resource.batches[0].remainingQuantity,99.9);
  assert.equal(resource.inventoryLots['GRAIN-BATCH-1'].remainingQuantity,99.9);
  assert.equal(resource.stockLossLedger.length,1);
  assert.equal(resource.stockLossLedger[0].evidenceAuthority,'ATOMIC_AUTOMATIC_STORAGE_DETERIORATION');
  assert.equal(resource.inventoryLedger.at(-1).type,'STORAGE_LOSS_COMMITTED');
  const snapshot=JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    lots:resource.inventoryLots,warehouse:resource.warehouse,losses:resource.stockLossLedger});
  api.processStorageDeterioration('BGD',{policy:STORAGE_POLICY,knownResourceIds:['grain']});
  assert.equal(JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    lots:resource.inventoryLots,warehouse:resource.warehouse,losses:resource.stockLossLedger}),snapshot);
});

test('factory-bound transport loss is atomic for raw and processed warehouse shipments',async()=>{
  for(const shipmentType of ['WAREHOUSE_TO_FACTORY','FACTORY_INPUT']){
    const {context,worldState}=createContext();
    vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
      {filename:'omega_resource_economy_runtime_v2.js'});
    const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD,
      processed=shipmentType==='FACTORY_INPUT',
      warehouseId=processed?'WH-BGD-PROCESSED':'WH-BGD-RAW',
      shipmentId='FACTORY-BOUND-LOSS-'+shipmentType;
    resource.inventoryLots={'MINE-BATCH-1':{batchId:'MINE-BATCH-1',resourceId:'iron_ore',
      quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,status:'AVAILABLE'}};
    resource.batches[0].warehouseId=warehouseId;
    resource.batches[0].locationNodeKey=processed?'WAREHOUSE:BGD:PROCESSED':'WAREHOUSE:BGD:RAW';
    resource.warehouse.reservedByResource={};
    if(processed)resource.processedWarehouse={warehouseId,countryId:'BGD',availableByResource:{iron_ore:100},
      reservedByResource:{iron_ore:20},storedBatchIds:['MINE-BATCH-1'],receipts:[]};
    else resource.warehouse.reservedByResource.iron_ore=20;
    const shipment={shipmentId,shipmentType,countryId:'BGD',factoryId:'PROC_1',resourceId:'iron_ore',
      quantity:20,dispatchedQuantity:20,lostQuantity:0,unit:'TONNES',batchId:'MINE-BATCH-1',
      sourceWarehouseId:warehouseId,warehouseId,reservationId:shipmentId,status:'IN_TRANSIT',createdTurn:1,
      ...(processed?{targetQuantity:40,targetUnit:'TONNES_EQUIVALENT',
        unitBridge:{factor:2,sourceUnit:'TONNES',targetUnit:'TONNES_EQUIVALENT'}}:{})};
    resource.industrialNetwork={shipments:[shipment],deliveries:[],siteFlowLedger:[],
      reservations:processed?{}:{[shipmentId]:{resourceId:'iron_ore',quantity:20,status:'RESERVED',warehouseId,warehouseKind:'RAW'}}};
    api.captureStockFlowPeriod('BGD');
    const loss=api.recordShipmentLoss('BGD',{eventId:shipmentId+':LOSS-1',shipmentId,
      resourceId:'iron_ore',quantity:3,unit:'TONNES',reason:'CONFIRMED_FACTORY_BOUND_CARGO_DAMAGE'});
    assert.equal(loss.status,'APPLIED',JSON.stringify(loss));
    assert.equal(loss.result.accepted,true);
    assert.equal(loss.result.remainingShipmentQuantity,17);
    assert.equal(resource.inventory.iron_ore,97);
    const sourceWarehouse=processed?resource.processedWarehouse:resource.warehouse;
    assert.equal(sourceWarehouse.availableByResource.iron_ore,97);
    assert.equal(sourceWarehouse.reservedByResource.iron_ore,17);
    assert.equal(resource.batches[0].remainingQuantity,97);
    assert.equal(resource.inventoryLots['MINE-BATCH-1'].remainingQuantity,97);
    assert.equal(resource.industrialNetwork.shipments[0].quantity,17);
    if(processed)assert.equal(resource.industrialNetwork.shipments[0].targetQuantity,34);
    else assert.equal(resource.industrialNetwork.reservations[shipmentId].quantity,17);
    const snapshot=JSON.stringify({inventory:resource.inventory,batches:resource.batches,lots:resource.inventoryLots,
      raw:resource.warehouse,processed:resource.processedWarehouse,network:resource.industrialNetwork,
      losses:resource.stockLossLedger});
    const replay=api.recordShipmentLoss('BGD',{eventId:shipmentId+':LOSS-1',shipmentId,
      resourceId:'iron_ore',quantity:3,unit:'TONNES',reason:'CONFIRMED_FACTORY_BOUND_CARGO_DAMAGE'});
    assert.equal(replay.status,'APPLIED');
    assert.equal(JSON.stringify({inventory:resource.inventory,batches:resource.batches,lots:resource.inventoryLots,
      raw:resource.warehouse,processed:resource.processedWarehouse,network:resource.industrialNetwork,
      losses:resource.stockLossLedger}),snapshot,'loss-event replay must not consume reserved source stock again');
    const storedShipment=resource.industrialNetwork.shipments[0];
    storedShipment.status='DELIVERED';storedShipment.deliveryStatus='DELIVERED_TO_FACTORY';
    storedShipment.deliveredTurn=1;storedShipment.lossMeasurementStatus='MEASURED_EVENTS';
    storedShipment.lossMeasurementAuthority='OMEGA_RESOURCE_ECONOMY_RUNTIME_V2';
    storedShipment.lossMeasurementBasis='CONFIRMED_CARGO_RECEIPT_WITH_LOSSES';
    storedShipment.lossMeasurementTurn=1;storedShipment.lossMeasurementComplete=true;
    resource.industrialNetwork.deliveries.push({shipmentId,shipmentType,resourceId:'iron_ore',
      quantity:17,sourceQuantity:17,unit:'TONNES',turn:1,createdTurn:1});
    const coverage=api.attestStockLossCoverage('BGD','TRANSPORT');
    assert.equal(coverage.status,'APPLIED');
    assert.equal(coverage.result.coverageStatus,'COMPLETE',JSON.stringify(coverage.result));
  }
});

test('factory by-product residue coverage reconciles real output batches without double-debiting stock',async()=>{
  const {context,worldState}=createContext();
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD;
  api.captureStockFlowPeriod('BGD');
  const event={eventId:'RESIDUE:FACTORY-RESIDUE-TX-1:BLAST_FURNACE_SLAG',
    sourceEventId:'FACTORY-RESIDUE-TX-1',sourceType:'PRODUCTION_RESIDUE',productRole:'BY_PRODUCT_RESIDUE',
    resourceId:'BLAST_FURNACE_SLAG',quantity:1.5,unit:'TONNES',
    batchId:'OUTPUT:FACTORY-RESIDUE-TX-1:BLAST_FURNACE_SLAG',transactionId:'FACTORY-RESIDUE-TX-1',
    factoryId:'STEEL-PLANT-1',recipeId:'STEEL_PRIMARY_ROUTE_V1',turn:1,
    authority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',status:'MEASURED',physicalMutationCommitted:true};
  const batch={batchId:event.batchId,resourceId:event.resourceId,quantity:1.5,remainingQuantity:1.5,
    unit:'TONNES',stage:'FINISHED',status:'AVAILABLE',warehouseId:'WH-BGD-PROCESSED',
    locationNodeKey:'WAREHOUSE:BGD:PROCESSED',createdTurn:1,productRole:'BY_PRODUCT_RESIDUE',
    residueMeasurementEventId:event.eventId};
  resource.batches.push(batch);
  resource.productionResidueLedger=[{transactionId:event.transactionId,countryId:'BGD',factoryId:event.factoryId,
    recipeId:event.recipeId,turn:1,periodId:'GAME_TURN_1',status:'MEASURED_EVENTS',
    basis:'MEASURED_PROCESS_OUTPUT_RESIDUE',authority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
    measurements:[event]}];
  resource.inventoryLedger=[{type:'FACTORY_MULTI_INPUT_PROCESSING_COMMITTED',transactionId:event.transactionId,
    factoryId:event.factoryId,recipeId:event.recipeId,inputQuantities:{iron_concentrate:6},
    outputs:{STEEL:6,BLAST_FURNACE_SLAG:1.5},createdBatchIds:[event.batchId],turn:1,periodId:'GAME_TURN_1',
    lossMeasurementStatus:'MEASURED_EVENTS',lossMeasurementAuthority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
    lossMeasurementBasis:'MEASURED_PROCESS_OUTPUT_RESIDUE',residueMeasurements:[event]}];
  const coverage=api.attestStockLossCoverage('BGD','PRODUCTION');
  assert.equal(coverage.status,'APPLIED');
  assert.equal(coverage.result.coverageStatus,'COMPLETE',JSON.stringify(coverage.result));
  assert.equal(coverage.result.lossEventsObserved,1);
  assert.equal((resource.stockLossLedger||[]).length,0,
    'residue already credited as product must not be booked as an additional physical loss');
});

test('automatic storage deterioration debits free physical stock once and carries fractional loss',async()=>{
  const {context,worldState}=createContext();
  worldState.simulation.turn=32;
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD;
  resource.inventory.grain=100;
  resource.batches=[{batchId:'GRAIN-BATCH-1',resourceId:'grain',materialIdentity:'grain',
    quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,stage:'RAW',status:'AVAILABLE',
    warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW'}];
  resource.inventoryLots={'GRAIN-BATCH-1':{batchId:'GRAIN-BATCH-1',resourceId:'grain',
    quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,status:'AVAILABLE'}};
  resource.warehouse.availableByResource.grain=100;
  resource.warehouse.storedBatchIds=['GRAIN-BATCH-1'];
  api.captureStockFlowPeriod('BGD');
  const result=api.processStorageDeterioration('BGD',{policy:STORAGE_POLICY,knownResourceIds:['grain']});
  assert.equal(result.status,'APPLIED',JSON.stringify(result));
  assert.equal(result.result.accepted,true);
  assert.equal(result.result.lossEventsCommitted,1);
  assert.equal(resource.inventory.grain,99.9);
  assert.equal(resource.warehouse.availableByResource.grain,99.9);
  assert.equal(resource.batches[0].remainingQuantity,99.9);
  assert.equal(resource.inventoryLots['GRAIN-BATCH-1'].remainingQuantity,99.9);
  assert.equal(resource.stockLossLedger.length,1);
  assert.equal(resource.stockLossLedger[0].evidenceAuthority,'ATOMIC_AUTOMATIC_STORAGE_DETERIORATION');
  assert.equal(resource.inventoryLedger.at(-1).type,'STORAGE_LOSS_COMMITTED');
  const snapshot=JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    lots:resource.inventoryLots,warehouse:resource.warehouse,losses:resource.stockLossLedger});
  api.processStorageDeterioration('BGD',{policy:STORAGE_POLICY,knownResourceIds:['grain']});
  assert.equal(JSON.stringify({inventory:resource.inventory,batches:resource.batches,
    lots:resource.inventoryLots,warehouse:resource.warehouse,losses:resource.stockLossLedger}),snapshot);
});

test('factory-bound transport loss is atomic for raw and processed warehouse shipments',async()=>{
  for(const shipmentType of ['WAREHOUSE_TO_FACTORY','FACTORY_INPUT']){
    const {context,worldState}=createContext();
    vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
      {filename:'omega_resource_economy_runtime_v2.js'});
    const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD,
      processed=shipmentType==='FACTORY_INPUT',
      warehouseId=processed?'WH-BGD-PROCESSED':'WH-BGD-RAW',
      shipmentId='FACTORY-BOUND-LOSS-'+shipmentType;
    resource.inventoryLots={'MINE-BATCH-1':{batchId:'MINE-BATCH-1',resourceId:'iron_ore',
      quantity:100,remainingQuantity:100,unit:'TONNES',createdTurn:1,status:'AVAILABLE'}};
    resource.batches[0].warehouseId=warehouseId;
    resource.batches[0].locationNodeKey=processed?'WAREHOUSE:BGD:PROCESSED':'WAREHOUSE:BGD:RAW';
    resource.warehouse.reservedByResource={};
    if(processed)resource.processedWarehouse={warehouseId,countryId:'BGD',availableByResource:{iron_ore:100},
      reservedByResource:{iron_ore:20},storedBatchIds:['MINE-BATCH-1'],receipts:[]};
    else resource.warehouse.reservedByResource.iron_ore=20;
    const shipment={shipmentId,shipmentType,countryId:'BGD',factoryId:'PROC_1',resourceId:'iron_ore',
      quantity:20,dispatchedQuantity:20,lostQuantity:0,unit:'TONNES',batchId:'MINE-BATCH-1',
      sourceWarehouseId:warehouseId,warehouseId,reservationId:shipmentId,status:'IN_TRANSIT',createdTurn:1,
      ...(processed?{targetQuantity:40,targetUnit:'TONNES_EQUIVALENT',
        unitBridge:{factor:2,sourceUnit:'TONNES',targetUnit:'TONNES_EQUIVALENT'}}:{})};
    resource.industrialNetwork={shipments:[shipment],deliveries:[],siteFlowLedger:[],
      reservations:processed?{}:{[shipmentId]:{resourceId:'iron_ore',quantity:20,status:'RESERVED',warehouseId,warehouseKind:'RAW'}}};
    api.captureStockFlowPeriod('BGD');
    const loss=api.recordShipmentLoss('BGD',{eventId:shipmentId+':LOSS-1',shipmentId,
      resourceId:'iron_ore',quantity:3,unit:'TONNES',reason:'CONFIRMED_FACTORY_BOUND_CARGO_DAMAGE'});
    assert.equal(loss.status,'APPLIED',JSON.stringify(loss));
    assert.equal(loss.result.accepted,true);
    assert.equal(loss.result.remainingShipmentQuantity,17);
    assert.equal(resource.inventory.iron_ore,97);
    const sourceWarehouse=processed?resource.processedWarehouse:resource.warehouse;
    assert.equal(sourceWarehouse.availableByResource.iron_ore,97);
    assert.equal(sourceWarehouse.reservedByResource.iron_ore,17);
    assert.equal(resource.batches[0].remainingQuantity,97);
    assert.equal(resource.inventoryLots['MINE-BATCH-1'].remainingQuantity,97);
    assert.equal(resource.industrialNetwork.shipments[0].quantity,17);
    if(processed)assert.equal(resource.industrialNetwork.shipments[0].targetQuantity,34);
    else assert.equal(resource.industrialNetwork.reservations[shipmentId].quantity,17);
    const snapshot=JSON.stringify({inventory:resource.inventory,batches:resource.batches,lots:resource.inventoryLots,
      raw:resource.warehouse,processed:resource.processedWarehouse,network:resource.industrialNetwork,
      losses:resource.stockLossLedger});
    const replay=api.recordShipmentLoss('BGD',{eventId:shipmentId+':LOSS-1',shipmentId,
      resourceId:'iron_ore',quantity:3,unit:'TONNES',reason:'CONFIRMED_FACTORY_BOUND_CARGO_DAMAGE'});
    assert.equal(replay.status,'APPLIED');
    assert.equal(JSON.stringify({inventory:resource.inventory,batches:resource.batches,lots:resource.inventoryLots,
      raw:resource.warehouse,processed:resource.processedWarehouse,network:resource.industrialNetwork,
      losses:resource.stockLossLedger}),snapshot,'loss-event replay must not consume reserved source stock again');
    const storedShipment=resource.industrialNetwork.shipments[0];
    storedShipment.status='DELIVERED';storedShipment.deliveryStatus='DELIVERED_TO_FACTORY';
    storedShipment.deliveredTurn=1;storedShipment.lossMeasurementStatus='MEASURED_EVENTS';
    storedShipment.lossMeasurementAuthority='OMEGA_RESOURCE_ECONOMY_RUNTIME_V2';
    storedShipment.lossMeasurementBasis='CONFIRMED_CARGO_RECEIPT_WITH_LOSSES';
    storedShipment.lossMeasurementTurn=1;storedShipment.lossMeasurementComplete=true;
    resource.industrialNetwork.deliveries.push({shipmentId,shipmentType,resourceId:'iron_ore',
      quantity:17,sourceQuantity:17,unit:'TONNES',turn:1,createdTurn:1});
    const coverage=api.attestStockLossCoverage('BGD','TRANSPORT');
    assert.equal(coverage.status,'APPLIED');
    assert.equal(coverage.result.coverageStatus,'COMPLETE',JSON.stringify(coverage.result));
  }
});

test('factory by-product residue coverage reconciles real output batches without double-debiting stock',async()=>{
  const {context,worldState}=createContext();
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD;
  api.captureStockFlowPeriod('BGD');
  const event={eventId:'RESIDUE:FACTORY-RESIDUE-TX-1:BLAST_FURNACE_SLAG',
    sourceEventId:'FACTORY-RESIDUE-TX-1',sourceType:'PRODUCTION_RESIDUE',productRole:'BY_PRODUCT_RESIDUE',
    resourceId:'BLAST_FURNACE_SLAG',quantity:1.5,unit:'TONNES',
    batchId:'OUTPUT:FACTORY-RESIDUE-TX-1:BLAST_FURNACE_SLAG',transactionId:'FACTORY-RESIDUE-TX-1',
    factoryId:'STEEL-PLANT-1',recipeId:'STEEL_PRIMARY_ROUTE_V1',turn:1,
    authority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',status:'MEASURED',physicalMutationCommitted:true};
  const batch={batchId:event.batchId,resourceId:event.resourceId,quantity:1.5,remainingQuantity:1.5,
    unit:'TONNES',stage:'FINISHED',status:'AVAILABLE',warehouseId:'WH-BGD-PROCESSED',
    locationNodeKey:'WAREHOUSE:BGD:PROCESSED',createdTurn:1,productRole:'BY_PRODUCT_RESIDUE',
    residueMeasurementEventId:event.eventId};
  resource.batches.push(batch);
  resource.productionResidueLedger=[{transactionId:event.transactionId,countryId:'BGD',factoryId:event.factoryId,
    recipeId:event.recipeId,turn:1,periodId:'GAME_TURN_1',status:'MEASURED_EVENTS',
    basis:'MEASURED_PROCESS_OUTPUT_RESIDUE',authority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
    measurements:[event]}];
  resource.inventoryLedger=[{type:'FACTORY_MULTI_INPUT_PROCESSING_COMMITTED',transactionId:event.transactionId,
    factoryId:event.factoryId,recipeId:event.recipeId,inputQuantities:{iron_concentrate:6},
    outputs:{STEEL:6,BLAST_FURNACE_SLAG:1.5},createdBatchIds:[event.batchId],turn:1,periodId:'GAME_TURN_1',
    lossMeasurementStatus:'MEASURED_EVENTS',lossMeasurementAuthority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
    lossMeasurementBasis:'MEASURED_PROCESS_OUTPUT_RESIDUE',residueMeasurements:[event]}];
  const coverage=api.attestStockLossCoverage('BGD','PRODUCTION');
  assert.equal(coverage.status,'APPLIED');
  assert.equal(coverage.result.coverageStatus,'COMPLETE',JSON.stringify(coverage.result));
  assert.equal(coverage.result.lossEventsObserved,1);
  assert.equal((resource.stockLossLedger||[]).length,0,
    'residue already credited as product must not be booked as an additional physical loss');
});

test('production loss evidence is source-bound, atomic, and cannot exceed consumed input',async()=>{
  const {context,worldState}=createContext();
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,resource=worldState.resource.BGD;
  api.captureStockFlowPeriod('BGD');
  const mesh=context.Omega.MinistryInteroperability;
  const payload={transactionId:'FACTORY-LOSS-TX-1',facilityId:'PROC_1',
    inputs:[{resourceId:'iron_ore',quantity:20,unit:'TONNES'}],
    outputs:[{resourceId:'iron_intermediate',quantity:18,unit:'TONNES',stage:'INTERMEDIATE'}],
    lossEvents:[{eventId:'FACTORY-PROCESS-LOSS-1',sourceType:'PRODUCTION',lossType:'PRODUCTION',
      resourceId:'iron_ore',quantity:2,unit:'TONNES',reason:'MEASURED_PROCESS_RESIDUE'}],
    lossMeasurementStatus:'MEASURED_EVENTS',lossMeasurementAuthority:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2',
    lossMeasurementBasis:'MEASURED_PROCESS_INPUT_RESIDUE'};
  const result=mesh.dispatchCommand('resource','OMEGA_RESOURCE_ECON_APPLY_PRODUCTION','BGD',payload,
    {commandId:'FACTORY-LOSS-TX-1',turn:1});
  assert.equal(result.status,'APPLIED',JSON.stringify(result));
  assert.equal(result.result.lossEventsCommitted,1);
  assert.equal(resource.inventory.iron_ore,80);
  assert.equal(resource.inventory.iron_intermediate,18);
  assert.equal(resource.stockLossLedger.length,1);
  assert.equal(resource.stockLossLedger[0].sourceEventId,'FACTORY-LOSS-TX-1');
  assert.equal(resource.stockLossLedger[0].quantity,2);
  assert.equal(resource.inventoryLedger.find(row=>row.transactionId==='FACTORY-LOSS-TX-1').lossEvents.length,1);

  const tooLarge=mesh.dispatchCommand('resource','OMEGA_RESOURCE_ECON_APPLY_PRODUCTION','BGD',{
    transactionId:'FACTORY-LOSS-TX-INVALID',facilityId:'PROC_1',
    inputs:[{resourceId:'iron_ore',quantity:1,unit:'TONNES'}],
    outputs:[{resourceId:'iron_intermediate',quantity:1,unit:'TONNES'}],
    lossEvents:[{eventId:'FACTORY-PROCESS-LOSS-INVALID',resourceId:'iron_ore',
      quantity:2,unit:'TONNES',reason:'INVALID_EXCESS_LOSS'}],
    lossMeasurementStatus:'MEASURED_EVENTS',lossMeasurementAuthority:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2',
    lossMeasurementBasis:'MEASURED_PROCESS_INPUT_RESIDUE'
  },{commandId:'FACTORY-LOSS-TX-INVALID',turn:1});
  assert.equal(tooLarge.status,'FAILED');
  assert.equal(tooLarge.result.reason,'PRODUCTION_LOSS_EXCEEDS_INPUT');
  assert.equal(resource.stockLossLedger.length,1,'rejected loss must not enter the authoritative loss ledger');

  const unmeasured=mesh.dispatchCommand('resource','OMEGA_RESOURCE_ECON_APPLY_PRODUCTION','BGD',{
    transactionId:'FACTORY-LOSS-TX-UNMEASURED',facilityId:'PROC_1',
    inputs:[{resourceId:'iron_ore',quantity:1,unit:'TONNES'}],
    outputs:[{resourceId:'iron_intermediate',quantity:1,unit:'TONNES'}]
  },{commandId:'FACTORY-LOSS-TX-UNMEASURED',turn:1});
  assert.equal(unmeasured.status,'APPLIED',JSON.stringify(unmeasured));
  const unmeasuredRow=resource.inventoryLedger.find(row=>row.transactionId==='FACTORY-LOSS-TX-UNMEASURED');
  assert.equal(unmeasuredRow.lossMeasurementStatus,'UNOBSERVED');
  const productionCoverage=api.attestStockLossCoverage('BGD','PRODUCTION');
  assert.equal(productionCoverage.status,'APPLIED');
  assert.equal(productionCoverage.result.coverageStatus,'PARTIAL');
  assert.ok(productionCoverage.result.integrityErrors.some(x=>x.startsWith('PRODUCTION_LOSS_MEASUREMENT_UNOBSERVED')));
});


test('explicit measured-zero production evidence can attest coverage without fabricating loss rows',async()=>{
  const {context,worldState}=createContext();
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,
    {filename:'omega_resource_economy_runtime_v2.js'});
  const api=context.Omega.ResourceEconomy,mesh=context.Omega.MinistryInteroperability,resource=worldState.resource.BGD;
  api.captureStockFlowPeriod('BGD');
  const result=mesh.dispatchCommand('resource','OMEGA_RESOURCE_ECON_APPLY_PRODUCTION','BGD',{
    transactionId:'FACTORY-MEASURED-ZERO-1',facilityId:'PROC-UNIT-1',
    inputs:[{resourceId:'iron_ore',quantity:1,unit:'TONNES'}],
    outputs:[{resourceId:'iron_intermediate',quantity:1,unit:'TONNES'}],
    lossEvents:[],lossMeasurementStatus:'MEASURED_ZERO',
    lossMeasurementAuthority:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2',
    lossMeasurementBasis:'MEASURED_ZERO_PROCESS_RESIDUE'
  },{commandId:'FACTORY-MEASURED-ZERO-1',turn:1});
  assert.equal(result.status,'APPLIED',JSON.stringify(result));
  const row=resource.inventoryLedger.find(item=>item.transactionId==='FACTORY-MEASURED-ZERO-1');
  assert.equal(row.lossMeasurementStatus,'MEASURED_ZERO');
  assert.equal(resource.stockLossLedger.length,0,'a measured zero must not create a synthetic loss row');
  const coverage=api.attestStockLossCoverage('BGD','PRODUCTION');
  assert.equal(coverage.status,'APPLIED');
  assert.equal(coverage.result.coverageStatus,'COMPLETE');
  assert.equal(coverage.result.lossEventsObserved,0);
});
