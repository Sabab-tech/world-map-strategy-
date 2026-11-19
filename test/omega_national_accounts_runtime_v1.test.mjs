import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(here,'..','omega_national_accounts_runtime_v1.js'),'utf8');

function alphaCode(value){
  let n=value,code='';
  for(let i=0;i<3;i++){code=String.fromCharCode(65+(n%26))+code;n=Math.floor(n/26);}
  return code;
}
function harness(){
  const state={
    simulation:{turn:8,session:{playerCountryId:'BGD'}},
    finance:{BGD:{available:250,omegaFinance:{treasuryBalanceUsd:100000,treasurySource:'GAME_RULE_ESTIMATE',ledger:[
      {transactionId:'F-1',action:'EXPENSE',amountUsd:50},
      {transactionId:'F-2',action:'BORROW',amountUsd:100},
      {transactionId:'F-3',action:'BUDGET_TRANSFER_OUT',amountUsd:20}
    ]}}},
    trade:{BGD:{globalTradeLedger:{settlements:[
      {settlementId:'S-SETTLED',status:'SETTLED',turn:8},
      {settlementId:'S-PENDING',status:'PENDING',turn:8},
      {status:'SETTLED',turn:8}
    ]},importRequests:[{status:'PENDING'}],
      importLedger:[{settlementId:'S-SETTLED',totalValue:25,currency:'BDT'},
        {settlementId:'S-PENDING',totalValue:90,currency:'BDT'}],
      exportLedger:[{settlementId:'S-SETTLED',totalValue:2,currency:'USD'}]}},
    resource:{BGD:{batches:[
      {batchId:'B-1',resourceId:'IRON_ORE',unit:'TONNE',quantity:10,remainingQuantity:8},
      {batchId:'B-2',resourceId:'IRON_ORE',unit:'TONNE',quantity:4,remainingQuantity:3},
      {batchId:'B-3',resourceId:'IRON_ORE',unit:'KG',quantity:900,remainingQuantity:700}
    ]}},
    economy:{BGD:{gdp:500000,industrialRuntime:{productionLedger:[
      {transactionId:'P-1',status:'COMPLETED',outputQuantities:{IRON:3}},
      {transactionId:'P-2',status:'BLOCKED',outputQuantities:{}}
    ]}}}
  };
  const profiles=[{iso3:'BGD',countryCode:'BD',economyKey:'BGD',name:'Bangladesh',currencyCode:'BDT',
    indicators:{gdpCurrentUsd:450000}}];
  const handlers=new Map();
  const finance={async init(){return{initialized:true};},getProfiles(){return profiles.slice();},
    getProfileMetadata(){return{baselineYear:2015};},
    resolveCountry(value){return profiles.find(row=>[row.iso3,row.countryCode,row.name].includes(value))||null;}};
  const interop={
    registerCommandHandler(type,owner,handler){handlers.set(type,{owner,handler});},
    dispatchCommand(owner,type,countryId,payload,meta){
      const registered=handlers.get(type);assert.ok(registered,'command handler registered');assert.equal(registered.owner,owner);
      const tx={
        get(statePath){
          const [domain,...parts]=statePath.split('.');let value=state[domain]?.[countryId];
          for(const part of parts)value=value?.[part];
          return value==null?undefined:structuredClone(value);
        },
        set(statePath,value){
          const [domain,...parts]=statePath.split('.');let bucket=state[domain]||= {};
          bucket=bucket[countryId]||={};
          for(const part of parts.slice(0,-1))bucket=bucket[part]||={};
          bucket[parts.at(-1)]=structuredClone(value);
        }
      };
      const result=registered.handler({payload},{countryId,stateTransaction:tx});
      return result?.accepted===false?{status:'FAILED',result}:{status:'APPLIED',result,meta};
    }
  };
  let schedulerHandler=null;
  const scheduler={registerCountryHandler(id,handler,options){schedulerHandler={id,handler,options};return()=>{schedulerHandler=null;};}};
  const rules=JSON.parse(fs.readFileSync(path.join(here,'..','national_accounts_rules_v1.json'),'utf8'));
  const countryRows={BGD:{countryCode:'BGD'}};
  for(let i=0;Object.keys(countryRows).length<197;i++){
    const code=alphaCode(i);if(code!=='BGD')countryRows[code]={countryCode:code};
  }
  const manifest={scope:'TEST',countries:countryRows};
  const eventHandlers=new Map();
  const window={
    Omega:{FinanceMinistry:finance,MinistryInteroperability:interop,WorldSimulationScheduler:scheduler,
      PrivateEnterpriseLifecycleV1:{companyIds:[
        'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
        'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
      ]},
      Simulation:{world:{state},clock:{turn:8}}},
    addEventListener(type,handler){
      const set=eventHandlers.get(type)||new Set();set.add(handler);eventHandlers.set(type,set);
    },
    removeEventListener(type,handler){eventHandlers.get(type)?.delete(handler);},
    dispatch(type,detail){
      for(const handler of eventHandlers.get(type)||[])handler({type,detail});
    },
    fetch:async input=>{
      const file=String(input).split('/').pop();
      const data=file==='national_accounts_rules_v1.json'?rules:manifest;
      return{ok:true,json:async()=>structuredClone(data)};
    }
  };
  vm.runInNewContext(source,{window,console,Promise,Map,Set,WeakMap,Number,String,Math,Object,Array,JSON,Error});
  return{window,state,getScheduler:()=>schedulerHandler,dispatch:(type,detail)=>window.dispatch(type,detail)};
}

test('Treasury reconciliation detects exact balance, mismatch and missing evidence',()=>{
  const api=harness().window.Omega.NationalAccounts;
  assert.equal(api.reconcileTreasury({openingCash:100,inflows:50,outflows:20,closingCash:130}).status,'RECONCILED');
  assert.equal(api.reconcileTreasury({openingCash:100,inflows:50,outflows:20,closingCash:129}).status,'UNRECONCILED');
  assert.equal(api.reconcileTreasury({openingCash:100,inflows:null,outflows:20,closingCash:80}).status,'PARTIAL');
  assert.equal(api.reconcileTreasury({}).status,'UNOBSERVED');
});

test('Goods conservation is grouped by resource identity and unit',()=>{
  const api=harness().window.Omega.NationalAccounts;
  const rows=[
    {resourceId:'IRON_ORE',unit:'TONNE',openingQuantity:10,production:5,imports:2,consumption:3,exports:1,losses:1,closingQuantity:12},
    {resourceId:'IRON_ORE',unit:'KG',openingQuantity:100,production:50,imports:0,consumption:25,exports:5,losses:0,closingQuantity:120}
  ];
  const result=api.reconcileGoodsFlow(rows);
  assert.equal(result.status,'RECONCILED');
  assert.equal(result.items.length,2,'different units must not be aggregated');
  assert.equal(api.reconcileGoodsFlow([{resourceId:'IRON_ORE',unit:'TONNE',openingQuantity:10,production:null,
    imports:0,consumption:1,exports:0,losses:0,closingQuantity:9}]).status,'PARTIAL');
  assert.equal(api.reconcileGoodsFlow([]).status,'UNOBSERVED');
});

test('GDP requires all three approaches on the same currency and period',()=>{
  const api=harness().window.Omega.NationalAccounts;
  assert.equal(api.reconcileGDP({production:{value:10,currency:'USD',period:'FY1',complete:true}}).status,'PARTIAL');
  const all={
    production:{value:100,currency:'USD',period:'FY1',complete:true},
    expenditure:{value:100.2,currency:'USD',period:'FY1',complete:true},
    income:{value:99.9,currency:'USD',period:'FY1',complete:true}
  };
  assert.equal(api.reconcileGDP(all).status,'RECONCILED');
  assert.equal(api.reconcileGDP({...all,income:{...all.income,value:120}}).status,'UNRECONCILED');
  assert.equal(api.reconcileGDP({...all,income:{...all.income,currency:'BDT'}}).reason,'GDP_APPROACH_BASIS_MISMATCH');
});

test('Runtime registers one bounded selected-country handler for the 197-country core roster',async()=>{
  const h=harness(),diagnostics=await h.window.Omega.NationalAccounts.init();
  assert.equal(diagnostics.coreCountryCount,197);
  assert.equal(diagnostics.ready,true);
  assert.equal(h.getScheduler().id,'omega.national-accounts.phase4a');
  assert.deepEqual(Array.from(h.getScheduler().options.tiers),['PLAYER','ACTIVE','MACRO']);
  assert.equal(h.getScheduler().options.priority,40);
});

test('Checkpoint reads existing authority and writes only Economy-owned nationalAccounts state',async()=>{
  const h=harness();await h.window.Omega.NationalAccounts.init();
  const before={finance:structuredClone(h.state.finance),trade:structuredClone(h.state.trade),resource:structuredClone(h.state.resource)};
  const result=await h.window.Omega.NationalAccounts.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  const statement=h.state.economy.BGD.nationalAccounts;
  assert.equal(statement.gdp.status,'UNOBSERVED');
  assert.equal(statement.gdp.modelledReference.value,500000);
  assert.equal(statement.trade.settlementCount,1,'pending requests must not count as settled');
  assert.equal(statement.trade.importValueByCurrency[0].totalValue,25);
  assert.equal(statement.goods.inventory.closingStockByIdentity.find(row=>row.unit==='TONNE').closingQuantity,11);
  assert.equal(statement.goods.inventory.closingStockByIdentity.find(row=>row.unit==='KG').closingQuantity,700);
  assert.equal(statement.goods.inventory.closingStockByIdentity.find(row=>row.unit==='TONNE').status,'CLOSING_STOCK_ONLY');
  assert.equal(statement.industry.completedProductionRecords,1);
  assert.equal(statement.treasury.status,'MODELLED_CLOSING_BALANCE_ONLY');
  assert.equal(statement.treasury.closingBalance,100000);
  assert.equal(statement.treasury.currency,'USD');
  assert.equal(statement.treasury.availableLiquidity,250);
  assert.equal(statement.treasury.availableLiquidityCurrency,'BDT');
  assert.equal(statement.gdp.modelledReference.currency,'USD');
  assert.deepEqual(h.state.finance,before.finance);
  assert.deepEqual(h.state.trade,before.trade);
  assert.deepEqual(h.state.resource,before.resource);
  assert.equal(statement.provenance.missingDataPolicy,'MISSING_IS_UNOBSERVED_NOT_ZERO');
  assert.equal(h.window.Omega.NationalAccounts.getSnapshot('BGD').lastProcessedTurn,8);
});

test('Same country and game turn is idempotent',async()=>{
  const h=harness();await h.window.Omega.NationalAccounts.init();
  const first=await h.window.Omega.NationalAccounts.processCountry('BGD',{turn:8,state:h.state});
  const revision=h.state.economy.BGD.nationalAccounts.revision;
  const second=await h.window.Omega.NationalAccounts.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(first.status,'CHECKPOINTED');
  assert.equal(second.status,'ALREADY_PROCESSED');
  assert.equal(h.state.economy.BGD.nationalAccounts.revision,revision);
});

test('Non-roster identity is skipped without fabricating a country record',async()=>{
  const h=harness();await h.window.Omega.NationalAccounts.init();
  assert.equal((await h.window.Omega.NationalAccounts.processCountry('ZZZ',{turn:8,state:h.state})).status,'SKIPPED');
  assert.equal(h.state.economy.BGD.nationalAccounts,undefined);
});


test('National Accounts reads Finance-owned fiscal period flows without mutating Finance state',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  const financeBucket=h.state.finance.BGD;
  financeBucket.omegaFinance.treasuryBalanceUsd=130;
  financeBucket.omegaFinance.treasurySource='EXISTING_RUNTIME_FINANCE_AVAILABLE';
  financeBucket.omegaFinance.fiscalPeriodAccount={
    schemaVersion:1,periodIndex:0,periodLabel:'2015',currency:'USD',
    openingTurn:0,openingBalanceUsd:100,openingBalanceSource:'NEW_GAME_FINANCE_OPENING',
    openingBalanceQuality:'GAME_STATE',flowCoverage:'COMPLETE_FROM_PERIOD_START',
    flowComponents:{
      taxRevenueUsd:20,borrowingProceedsUsd:10,externalCreditsUsd:20,
      governmentSpendingUsd:5,interestPaidUsd:5,principalRepaymentUsd:5,externalDebitsUsd:5
    },
    totalInflowsUsd:50,totalOutflowsUsd:20,closingBalanceUsd:130,
    expectedClosingBalanceUsd:130,varianceUsd:0,
    reconciliationStatus:'GAME_STATE_RECONCILED',status:'GAME_STATE_RECONCILED'
  };
  const before=structuredClone(h.state.finance);
  await api.init();
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  const statement=h.state.economy.BGD.nationalAccounts;
  assert.equal(statement.treasury.status,'GAME_STATE_RECONCILED');
  assert.equal(statement.treasury.openingBalance,100);
  assert.equal(statement.treasury.inflows,50);
  assert.equal(statement.treasury.outflows,20);
  assert.equal(statement.treasury.closingBalance,130);
  assert.equal(statement.treasury.reconciliation.expectedClosingCash,130);
  assert.equal(statement.completeness.treasuryOpeningAndFlows,'RECONCILED');
  assert.equal(statement.provenance.treasuryAuthority,'FINANCE_MINISTRY_FISCAL_PERIOD_ACCOUNT');
  assert.deepEqual(h.state.finance,before,'National Accounts must only read Finance-owned period snapshots');
});

test('National Accounts keeps legacy Finance accounts PARTIAL and never guesses a period opening',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  h.state.finance.BGD.omegaFinance.fiscalPeriodAccount={
    schemaVersion:1,periodIndex:0,periodLabel:'2015',currency:'USD',
    openingTurn:8,openingBalanceUsd:null,openingBalanceSource:'LEGACY_OPENING_NOT_RECORDED',
    openingBalanceQuality:'UNOBSERVED',flowCoverage:'INCOMPLETE_LEGACY',
    flowComponents:{taxRevenueUsd:50,borrowingProceedsUsd:0,externalCreditsUsd:0,
      governmentSpendingUsd:10,interestPaidUsd:0,principalRepaymentUsd:0,externalDebitsUsd:0},
    totalInflowsUsd:50,totalOutflowsUsd:10,reconciliationStatus:'PARTIAL',status:'PARTIAL'
  };
  await api.init();
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  const treasury=h.state.economy.BGD.nationalAccounts.treasury;
  assert.equal(treasury.status,'PARTIAL');
  assert.equal(treasury.openingBalance,null);
  assert.equal(treasury.reconciliation.status,'PARTIAL');
  assert.equal(h.state.economy.BGD.nationalAccounts.completeness.treasuryOpeningAndFlows,'PARTIAL');
});

test('local available liquidity is never substituted for Treasury cash',async()=>{
  const h=harness();
  delete h.state.finance.BGD.omegaFinance.treasuryBalanceUsd;
  await h.window.Omega.NationalAccounts.init();
  const result=await h.window.Omega.NationalAccounts.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  const treasury=h.state.economy.BGD.nationalAccounts.treasury;
  assert.equal(treasury.status,'UNOBSERVED');
  assert.equal(treasury.closingBalance,null);
  assert.equal(treasury.currency,null);
  assert.equal(treasury.availableLiquidity,250);
  assert.equal(treasury.availableLiquidityCurrency,'BDT');
});


test('unchanged country turns skip ledger scans until an authoritative source event invalidates the account',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  const first=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(first.status,'CHECKPOINTED');
  assert.ok(first.sourceRowsScanned>0);
  const revision=h.state.economy.BGD.nationalAccounts.revision;
  const unchanged=await api.processCountry('BGD',{turn:9,state:h.state});
  assert.equal(unchanged.status,'UNCHANGED');
  assert.equal(unchanged.sourceRowsScanned,0);
  assert.equal(h.state.economy.BGD.nationalAccounts.revision,revision);
  assert.equal(api.diagnostics().unchangedCountries,1);
  h.dispatch('OMEGA_FINANCE_STATE_UPDATED',{countryCode:'BD',revision:revision+1});
  assert.equal(api.diagnostics().dirtyCountryCount,1);
  const refreshed=await api.processCountry('BGD',{turn:9,state:h.state});
  assert.equal(refreshed.status,'CHECKPOINTED');
  assert.ok(refreshed.sourceRowsScanned>0);
  assert.equal(api.diagnostics().dirtyCountryCount,0);
  assert.ok(api.diagnostics().sourceInvalidations>=1);
  assert.equal(h.state.economy.BGD.nationalAccounts.revision,revision+1);
});

test('trade events invalidate both recorded counterparty countries',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  h.dispatch('OMEGA_TRADE_SETTLEMENT_COMPLETED',{
    countryId:'BGD',targetCountryId:'AAB',settlementId:'SETTLEMENT-1'
  });
  assert.equal(api.diagnostics().dirtyCountryCount,2);
  assert.equal(api.diagnostics().sourceInvalidations,2);
});

test('same-turn source changes remain dirty and are applied on the next committed turn',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  assert.equal((await api.processCountry('BGD',{turn:8,state:h.state})).status,'CHECKPOINTED');
  h.dispatch('OMEGA_RESOURCE_INVENTORY_CHANGED',{countryId:'BGD',resourceId:'IRON_ORE',delta:1});
  const replay=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(replay.status,'ALREADY_PROCESSED');
  assert.equal(api.diagnostics().dirtyCountryCount,1);
  const next=await api.processCountry('BGD',{turn:9,state:h.state});
  assert.equal(next.status,'CHECKPOINTED');
  assert.equal(api.diagnostics().dirtyCountryCount,0);
});

test('country lookup uses direct canonical keys without enumerating country registries',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  const enumerations={finance:0,trade:0,resource:0,economy:0};
  for(const domain of Object.keys(enumerations)){
    const target=h.state[domain];
    h.state[domain]=new Proxy(target,{
      ownKeys(object){enumerations[domain]++;return Reflect.ownKeys(object);}
    });
  }
  await api.init();
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  assert.deepEqual(enumerations,{finance:0,trade:0,resource:0,economy:0});
});

test('pending import request summarization is capped and reports truncation',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  h.state.trade.BGD.importRequests=Array.from({length:1000},(_,index)=>({
    requestId:'REQ-'+index,status:index<988?'REJECTED':'PENDING'
  }));
  await api.init();
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  const trade=h.state.economy.BGD.nationalAccounts.trade;
  assert.equal(trade.pendingRequestCount,12);
  assert.equal(trade.pendingRequestRowsObserved,512);
  assert.equal(trade.pendingRequestWindowTruncated,true);
  assert.equal(trade.pendingRequestCoverage,'BOUNDED_LAST_N_RECORDS');
});


test('source invalidations arriving during cooperative browser yields remain dirty until refreshed',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  h.state.resource.BGD.batches=Array.from({length:600},(_,index)=>({
    batchId:'YIELD-BATCH-'+index,resourceId:'IRON_ORE',unit:'TONNE',remainingQuantity:1
  }));
  let injected=false;
  h.window.requestIdleCallback=callback=>{
    if(!injected){
      injected=true;
      h.dispatch('OMEGA_RESOURCE_INVENTORY_CHANGED',{countryId:'BGD',resourceId:'IRON_ORE',delta:1});
    }
    callback();
  };
  await api.init();
  const first=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(first.status,'CHECKPOINTED');
  assert.equal(api.diagnostics().yieldCount,1);
  assert.equal(api.diagnostics().dirtyCountryCount,1,
    'an event received while a sliced read is yielding must not be cleared by the checkpoint commit');
  assert.equal((await api.processCountry('BGD',{turn:8,state:h.state})).status,'ALREADY_PROCESSED');
  assert.equal(api.diagnostics().dirtyCountryCount,1);
  assert.equal((await api.processCountry('BGD',{turn:9,state:h.state})).status,'CHECKPOINTED');
  assert.equal(api.diagnostics().dirtyCountryCount,0);
});


test('resource economy publication invalidates the country from its dashboard snapshot',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  assert.equal((await api.processCountry('BGD',{turn:8,state:h.state})).status,'CHECKPOINTED');
  h.dispatch('OMEGA_RESOURCE_ECONOMY_UPDATED',{countryId:'BGD',turn:8,inventoryDelta:{IRON_ORE:2}});
  assert.equal(api.diagnostics().dirtyCountryCount,1);
  assert.equal(api.diagnostics().sourceInvalidations,1);
  assert.equal((await api.processCountry('BGD',{turn:9,state:h.state})).status,'CHECKPOINTED');
  assert.equal(api.diagnostics().dirtyCountryCount,0);
});

test('replacing the authoritative world-state root forces a safe rehydration',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  assert.equal((await api.processCountry('BGD',{turn:8,state:h.state})).status,'CHECKPOINTED');
  const restoredState=structuredClone(h.state);
  restoredState.simulation.turn=9;
  const refreshed=await api.processCountry('BGD',{turn:9,state:restoredState});
  assert.equal(refreshed.status,'CHECKPOINTED');
  assert.equal(api.diagnostics().rootResets,1);
  assert.equal(api.diagnostics().initializedCountryCount,1);
});



test('synchronous Ministry checkpoint commit time is included in CPU diagnostics',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  const interop=h.window.Omega.MinistryInteroperability;
  const original=interop.dispatchCommand.bind(interop);
  interop.dispatchCommand=(...args)=>{
    const start=Date.now();
    while(Date.now()-start<20){}
    return original(...args);
  };
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  assert.ok(api.diagnostics().maxSyncSegmentMs>=18,
    'the synchronous state-transaction commit must be measured as an accounting segment');
  assert.ok(api.diagnostics().totalSyncSegmentMs>=18);
});

test('large ledger inputs remain hard-bounded to the configured accounting workload',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  const make=(count,fn)=>Array.from({length:count},(_,index)=>fn(index));
  h.state.finance.BGD.omegaFinance.ledger=make(1500,index=>({
    transactionId:'FIN-'+index,action:'EXPENSE',amountUsd:1
  }));
  h.state.trade.BGD.globalTradeLedger.settlements=make(1400,index=>({
    settlementId:'SETTLED-'+index,status:'SETTLED',turn:8
  }));
  h.state.trade.BGD.importLedger=make(1600,index=>({
    settlementId:'SETTLED-'+index,totalValue:1,currency:'BDT'
  }));
  h.state.trade.BGD.exportLedger=make(1600,index=>({
    settlementId:'SETTLED-'+index,totalValue:1,currency:'USD'
  }));
  h.state.trade.BGD.importRequests=make(1200,index=>({
    requestId:'REQUEST-'+index,status:'PENDING'
  }));
  h.state.resource.BGD.batches=make(9000,index=>({
    batchId:'BATCH-'+index,resourceId:'IRON_ORE',unit:'TONNE',remainingQuantity:1
  }));
  h.state.economy.BGD.industrialRuntime.productionLedger=make(4000,index=>({
    transactionId:'PRODUCTION-'+index,status:'COMPLETED',outputQuantities:{IRON:1}
  }));
  await api.init();
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  assert.equal(result.sourceRowsScanned,8692);
  const workload=h.state.economy.BGD.nationalAccounts.workload;
  assert.deepEqual(workload,{
    financeLedgerRowsObserved:500,
    tradeRowsObserved:2048,
    inventoryBatchRowsObserved:4096,
    productionLedgerRowsObserved:2048,
    companyCashFlowRowsObserved:0,
    sourceRowsScanned:8692
  });
  assert.equal(api.diagnostics().lastSourceRowsScanned,8692);
  assert.equal(api.diagnostics().maxSourceRowsScanned,8692);
  assert.ok(api.diagnostics().yieldCount>=10,
    'large inventory and production ledger reads must yield between bounded 512-row synchronous slices');
});


const apiTestCompanyIds=[
  'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
  'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
];

function testJournal(countryId,sectorId,companyId,transactionId,currency,periodId,sourceAuthority){
  const amount=1250,accountPrefix=sectorId==='firm'?'FIRM:'+companyId:'GOVERNMENT';
  return{
    schemaVersion:1,status:'POSTED',sectorId,
    sourceAuthority:sourceAuthority||(sectorId==='firm'?'OMEGA_PRIVATE_ENTERPRISE_CASHFLOW':'OMEGA_FINANCE_MINISTRY'),
    sourceTransactionId:transactionId,sourceTransactionType:'TEST',countryId,companyId:companyId||undefined,
    currency,periodId,accountingBasis:'TEST_SOURCE_POSTING',provenance:'TEST_FIXTURE',
    counterEntryComplete:true,debitTotalMinor:amount,creditTotalMinor:amount,
    lines:[
      {lineId:transactionId+':L1',lineNumber:1,accountId:accountPrefix+':TEST_DEBIT',side:'DEBIT',
        amountMinor:amount,currency,countryId,companyId:companyId||undefined,sourceTransactionId:transactionId},
      {lineId:transactionId+':L2',lineNumber:2,accountId:accountPrefix+':TEST_CREDIT',side:'CREDIT',
        amountMinor:amount,currency,countryId,companyId:companyId||undefined,sourceTransactionId:transactionId}
    ]
  };
}

test('sector journal reader validates Finance and company-owned postings without cross-currency aggregation',async()=>{
  const api=harness().window.Omega.NationalAccounts;
  const financeRows=[
    {transactionId:'GOV-J-1',action:'EXPENSE',sectorJournalV1:testJournal('BGD','government',null,'GOV-J-1','USD','FY-1')},
    {transactionId:'FIRM-FIN-1',type:'PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL',companyId:'AURORA_INDUSTRIAL_GROUP',
      sectorJournalV1:testJournal('BGD','firm','AURORA_INDUSTRIAL_GROUP','FIRM-FIN-1','BDT','TURN-8','OMEGA_PRIVATE_ENTERPRISE_FINANCE_LEDGER')}
  ];
  const companyAccounts={AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',cashFlowJournalVersion:2,cashFlowEntries:[
    {entryId:'FIRM-CASH-1',companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED',
      sectorJournalV1:testJournal('BGD','firm','AURORA_INDUSTRIAL_GROUP','FIRM-CASH-1','BDT','TURN-8')}
  ]}};
  const result=await api.reconcileSectorJournals({countryId:'BGD',financeRows,financeSourceRowsTotal:2,
    companyAccounts,maxCompanyAccounts:5,companyCashFlowRowsPerCompany:256,financeLedgerRows:500});
  assert.equal(result.status,'PARTIAL','this read model never claims whole-economy completeness');
  assert.equal(result.integrityStatus,'RECONCILED');
  assert.equal(result.sourceCoverageStatus,'PARTIAL',
    'other canonical company records remain unobserved in this fixture');
  assert.equal(result.postedTransactionCount,3);
  assert.equal(result.invalidTransactionCount,0);
  assert.equal(result.duplicateTransactionCount,0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.currencyPeriodCoverage)),[
    {sectorId:'firm',currency:'BDT',periodId:'TURN-8',postedTransactionCount:2,unavailableTransactionCount:0},
    {sectorId:'government',currency:'USD',periodId:'FY-1',postedTransactionCount:1,unavailableTransactionCount:0}
  ]);
  assert.equal(result.amountsAggregated,false);
});

test('sector journal reader rejects unbalanced, wrong-country and duplicate source postings',async()=>{
  const api=harness().window.Omega.NationalAccounts;
  const bad=testJournal('BGD','government',null,'BAD-1','USD','FY-1');
  bad.creditTotalMinor=1249;
  bad.lines[1].amountMinor=1249;
  const wrong=testJournal('USA','government',null,'WRONG-1','USD','FY-1');
  const duplicate=testJournal('BGD','firm','AURORA_INDUSTRIAL_GROUP','DUP-1','BDT','TURN-8'),
    duplicateWithChangedAuthority=structuredClone(duplicate);
  duplicateWithChangedAuthority.sourceAuthority='UNEXPECTED_SECOND_AUTHORITY';
  const result=await api.reconcileSectorJournals({countryId:'BGD',financeRows:[
    {transactionId:'BAD-1',action:'EXPENSE',sectorJournalV1:bad},
    {transactionId:'WRONG-1',action:'BORROW',sectorJournalV1:wrong}
  ],companyAccounts:{AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',cashFlowEntries:[
    {entryId:'DUP-1',companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED',sectorJournalV1:duplicate},
    {entryId:'DUP-1',companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED',sectorJournalV1:duplicateWithChangedAuthority}
  ]}}});
  assert.equal(result.integrityStatus,'UNRECONCILED');
  assert.ok(result.invalidTransactionCount>=2);
  assert.equal(result.duplicateTransactionCount,1);
});

test('sector journal reader exposes legacy, unavailable and truncated source coverage instead of zero-filling it',async()=>{
  const api=harness().window.Omega.NationalAccounts;
  const entries=Array.from({length:300},(_,index)=>({entryId:'LEGACY-'+index,companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED'}));
  entries.push({entryId:'UNAVAILABLE-1',companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED',
    sectorJournalV1:{schemaVersion:1,status:'UNAVAILABLE',sourceTransactionId:'UNAVAILABLE-1',
      sourceAuthority:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2',countryId:'BGD',companyId:'AURORA_INDUSTRIAL_GROUP'}});
  const result=await api.reconcileSectorJournals({countryId:'BGD',
    financeRows:[{transactionId:'LEGACY-FIN-1',action:'BORROW'}],financeSourceRowsTotal:600,
    companyAccounts:{AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',cashFlowJournalDroppedEntries:2,cashFlowEntries:entries}},
    maxCompanyAccounts:5,companyCashFlowRowsPerCompany:256,financeLedgerRows:500});
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.sourceCoverageStatus,'PARTIAL');
  assert.equal(result.sourceWindows.financeLedger.windowTruncated,true);
  assert.equal(result.sourceWindows.companyCashFlow.windowTruncated,true);
  assert.equal(result.sourceWindows.companyCashFlow.droppedSourceRows,2);
  assert.ok(result.unaccountedSourceRowCount>0);
  assert.equal(result.unavailableTransactionCount,1);
  assert.equal(result.integrityStatus,'UNOBSERVED');
});



test('country checkpoint reads existing private-firm journals without mutating company cash or Finance sources',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  const journal=testJournal('BGD','firm','AURORA_INDUSTRIAL_GROUP','COMPANY-FLOW-1','BDT','TURN-8');
  h.state.economy.BGD.companyAccounts={
    AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',cashFlowJournalVersion:2,cashFlowEntries:[
      {entryId:'COMPANY-FLOW-1',companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED',sectorJournalV1:journal}
    ]}
  };
  const financeBefore=structuredClone(h.state.finance);
  const companyBefore=structuredClone(h.state.economy.BGD.companyAccounts);
  await api.init();
  const result=await api.processCountry('BGD',{turn:8,state:h.state});
  assert.equal(result.status,'CHECKPOINTED');
  const statement=h.state.economy.BGD.nationalAccounts;
  assert.equal(statement.sectorJournals.postedTransactionCount,1);
  assert.equal(statement.sectorJournals.integrityStatus,'RECONCILED');
  assert.equal(statement.completeness.sectorJournalDoubleEntryIntegrity,'RECONCILED');
  assert.deepEqual(h.state.finance,financeBefore,'the read model must not mutate Finance cash or source rows');
  assert.deepEqual(h.state.economy.BGD.companyAccounts,companyBefore,
    'the read model must not mutate private-company wallet or cash-flow source rows');
});

test('private-enterprise lifecycle mutations invalidate the country journal checkpoint',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts;
  await api.init();
  assert.equal((await api.processCountry('BGD',{turn:8,state:h.state})).status,'CHECKPOINTED');
  h.state.economy.BGD.companyAccounts={
    AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',cashFlowEntries:[
      {entryId:'PRIVATE-SETTLEMENT-1',companyId:'AURORA_INDUSTRIAL_GROUP',status:'POSTED',
        sectorJournalV1:testJournal('BGD','firm','AURORA_INDUSTRIAL_GROUP',
          'PRIVATE-SETTLEMENT-1','BDT','TURN-9')}
    ]}
  };
  h.dispatch('OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_CHANGED',{
    countryId:'BGD',eventType:'PRIVATE_COMPANY_PROCUREMENT_SETTLED'
  });
  assert.equal(api.diagnostics().dirtyCountryCount,1);
  const refreshed=await api.processCountry('BGD',{turn:9,state:h.state});
  assert.equal(refreshed.status,'CHECKPOINTED');
  assert.equal(h.state.economy.BGD.nationalAccounts.sectorJournals.postedTransactionCount,1);
  assert.equal(api.diagnostics().dirtyCountryCount,0);
});

test('country checkpoint caps private-firm journal work to configured canonical company and row windows',async()=>{
  const h=harness(),api=h.window.Omega.NationalAccounts,companyAccounts={},companyIds=apiTestCompanyIds;
  for(const companyId of companyIds){
    companyAccounts[companyId]={companyId,cashFlowJournalDroppedEntries:0,cashFlowEntries:
      Array.from({length:300},(_,index)=>({entryId:companyId+'-'+index,companyId,status:'POSTED'}))};
  }
  const result=await api.reconcileSectorJournals({countryId:'BGD',financeRows:[],financeSourceRowsTotal:0,
    companyAccounts,maxCompanyAccounts:3,companyCashFlowRowsPerCompany:256,financeLedgerRows:500});
  assert.equal(result.sourceWindows.companyCashFlow.companyAccountsAvailable,5);
  assert.equal(result.sourceWindows.companyCashFlow.companyAccountsObserved,3);
  assert.equal(result.sourceWindows.companyCashFlow.companyAccountsTruncated,true);
  assert.equal(result.sourceWindows.companyCashFlow.observedRows,3*256);
  assert.equal(result.sourceWindows.companyCashFlow.windowTruncated,true);
  assert.equal(result.sourceRowsScanned,3*256);
  assert.equal(result.sourceCoverageStatus,'PARTIAL');
  assert.equal(api.diagnostics().yieldCount>=1,true,
    'the bounded company window must yield cooperatively at 512-row intervals');
});
