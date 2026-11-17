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
      {settlementId:'S-PENDING',status:'PENDING',turn:8}
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
  const window={
    Omega:{FinanceMinistry:finance,MinistryInteroperability:interop,WorldSimulationScheduler:scheduler,
      Simulation:{world:{state},clock:{turn:8}}},
    addEventListener(){},
    fetch:async input=>{
      const file=String(input).split('/').pop();
      const data=file==='national_accounts_rules_v1.json'?rules:manifest;
      return{ok:true,json:async()=>structuredClone(data)};
    }
  };
  vm.runInNewContext(source,{window,console,Promise,Map,Set,WeakMap,Number,String,Math,Object,Array,JSON,Error});
  return{window,state,getScheduler:()=>schedulerHandler};
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
  assert.equal(statement.industry.completedProductionRecords,1);
  assert.equal(statement.treasury.closingBalance,100000);
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
