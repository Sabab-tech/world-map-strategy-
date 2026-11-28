import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../omega_daily_workload_scheduler_v1.js',import.meta.url),'utf8');
function harness({mobile=false}={}){
  const state={simulation:{turn:0,session:{playerCountryId:'BGD',sessionId:'SESSION-1'}}};
  const progress={resources:0,industrial:0};
  const calls=[];
  let clock=0,yields=0,failResource=false;
  const sandbox={console,Promise,Map,Set,Object,Array,Number,String,Math,Date,JSON,
    performance:{now(){return clock;}},
    navigator:mobile?{userAgent:'Android Mobile',deviceMemory:2,hardwareConcurrency:4}:{userAgent:'desktop'},
    setTimeout(callback){yields++;clock+=1;queueMicrotask(callback);return 0;},
    Omega:{Simulation:{world:{state},clock:{turn:0}}},
    Game:{state}};
  vm.runInNewContext(source,sandbox,{filename:'omega_daily_workload_scheduler_v1.js'});
  const api=sandbox.Omega.DailyWorkloadScheduler;
  api.registerDomain({id:'resources',label:'Mining',pageId:'resource-ministry',priority:10,
    getProgress(){return{lastProcessedTurn:progress.resources};},
    async runSlice(ctx){calls.push(['resources',ctx.periodTurn]);clock+=3;
      if(failResource)return{status:'FAILED',reason:'MINE_LEDGER_NOT_RECONCILED'};
      progress.resources=ctx.periodTurn;return{status:'COMPLETED'};}});
  api.registerDomain({id:'industrial',label:'Industrial',pageId:'industry',priority:20,dependencies:['resources'],
    getProgress(){return{lastProcessedTurn:progress.industrial};},
    async runSlice(ctx){calls.push(['industrial',ctx.periodTurn]);clock+=3;
      progress.industrial=ctx.periodTurn;return{status:'COMPLETED'};}});
  api.registerDomain({id:'food',label:'Food & Agriculture',pageId:'food',enabled:false,
    disabledReason:'AUTHORITATIVE_FOOD_RUNTIME_NOT_AVAILABLE',priority:30});
  return{state,progress,calls,api,sandbox,yields:()=>yields,setTurn(v){state.simulation.turn=v;sandbox.Omega.Simulation.clock.turn=v;},
    fail(v){failResource=v;}};
}
test('universal planner processes daily resource/industrial periods in dependency order and retains page mappings',async()=>{
  const h=harness();
  for(let turn=1;turn<=100;turn++){
    h.setTurn(turn);
    const result=await h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:turn,maxSlices:8,budgetMs:10000});
    assert.equal(result.status,'COMPLETED',JSON.stringify(result));
    assert.equal(h.progress.resources,turn);
    assert.equal(h.progress.industrial,turn);
  }
  assert.deepEqual(h.calls.slice(0,4),[['resources',1],['industrial',1],['resources',2],['industrial',2]]);
  const domains=h.api.diagnostics().registeredDomains;
  assert.equal(domains.find(x=>x.id==='resources').pageId,'resource-ministry');
  assert.equal(domains.find(x=>x.id==='industrial').pageId,'industry');
  assert.equal(domains.find(x=>x.id==='food').enabled,false);
  assert.equal(domains.find(x=>x.id==='food').pageId,'food');
  assert.equal(h.api.diagnostics().domainCount,3);
});
test('catch-up automatically divides backlog into bounded reconciled period slices',async()=>{
  const h=harness({mobile:true});h.setTurn(8);
  const first=await h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:8,maxSlices:4,budgetMs:10000});
  assert.equal(first.processedSlices,4);
  assert.equal(first.status,'CATCHING_UP');
  assert.equal(h.progress.resources,2);
  assert.equal(h.progress.industrial,2);
  assert.ok(first.pending.every(row=>row.pendingDays===6));
  const second=await h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:8,maxSlices:4,budgetMs:10000});
  assert.equal(second.processedSlices,4);
  assert.equal(h.progress.resources,4);
  assert.equal(h.progress.industrial,4);
});
test('a failed prerequisite stops downstream work without advancing it',async()=>{
  const h=harness();h.setTurn(2);h.fail(true);
  const failed=await h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:2,maxSlices:8,budgetMs:10000});
  assert.equal(failed.status,'FAILED');
  assert.equal(h.progress.resources,0);
  assert.equal(h.progress.industrial,0);
  assert.equal(h.calls.some(row=>row[0]==='industrial'),false);
  h.fail(false);
  const recovered=await h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:2,maxSlices:8,budgetMs:10000});
  assert.equal(recovered.status,'COMPLETED');
  assert.equal(h.progress.resources,2);
  assert.equal(h.progress.industrial,2);
});
test('identity mismatch fails closed and duplicate in-flight turn requests share one plan',async()=>{
  const h=harness();h.setTurn(1);
  const mismatch=await h.api.runPlan({countryId:'USA',sessionId:'SESSION-1',targetTurn:1});
  assert.equal(mismatch.status,'FAILED');
  assert.equal(mismatch.reason,'ACTIVE_PLAYER_SESSION_IDENTITY_MISMATCH');
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let calls=0;
  h.api.registerDomain({id:'resources',label:'Mining',pageId:'resource-ministry',priority:10,
    getProgress(){return{lastProcessedTurn:0};},
    async runSlice(ctx){calls++;await gate;h.progress.resources=ctx.periodTurn;return{status:'COMPLETED'};}});
  const a=h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:1});
  const b=h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:1});
  assert.strictEqual(a,b);
  release();
  const [ra,rb]=await Promise.all([a,b]);
  assert.strictEqual(ra,rb);
  assert.equal(calls,1);
});
test('disabled domain cannot execute and unknown dependency is rejected before any mutation',async()=>{
  const h=harness();h.setTurn(1);
  h.api.registerDomain({id:'agriculture-extension',label:'Agriculture',pageId:'food',priority:1,
    dependencies:['missing-authority'],getProgress(){return{lastProcessedTurn:0};},
    runSlice(){throw new Error('must not run');}});
  const result=await h.api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:1});
  assert.equal(result.status,'FAILED');
  assert.equal(result.reason,'DAILY_WORKLOAD_DEPENDENCY_UNAVAILABLE');
  assert.equal(h.progress.resources,0);
});
