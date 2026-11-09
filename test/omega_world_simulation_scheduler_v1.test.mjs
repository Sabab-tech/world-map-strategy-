import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../omega_world_simulation_scheduler_v1.js',import.meta.url),'utf8');
function harness(count=197,existingState=null,userAgent=''){
 const ids=[],profiles=[],byId=new Map();
 for(let i=0;i<count;i++){const id=String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),row={countryCode:id,iso3:'X'+String(i).padStart(2,'0')};ids.push(id);profiles.push(row);byId.set(id,row);}
 const participants=new Map(),listeners=new Set(),evaluations=[],queued=[],handled=[];let yields=0;
 const state=existingState||{simulation:{turn:0,session:{playerCountryId:'AA',status:'RUNNING'}},projects:{BB:{registry:[{projectId:'P1',autonomy:true,status:'UNDER_CONSTRUCTION'}]}},military:{CC:{trainingQueue:[{trainingId:'T1',status:'IN_TRAINING'}]}},trade:{}};
 const simulation={world:{state},clock:{turn:0,stepDurationMs:10000},getPlayerCountryId:()=>state.simulation.session?.playerCountryId||null,registerTurnParticipant(id,handler,options){participants.set(id,{handler,options});return()=>participants.delete(id);},events:{subscribe(type,handler){if(type==='*')listeners.add(handler);return()=>listeners.delete(handler);}}};
 let rosterCalls=0;
 const rules={async listCountryIds(){rosterCalls++;return ids;},async evaluateCountry(countryId,turn){evaluations.push({countryId,turn});return{status:'COMPLETE',decisions:[{decisionId:'D-'+countryId+'-'+turn,scenarioId:'RESOURCE_DEFICIT',priorityScore:1,selected:{action:'IMPORT'}}]};},queueDecision(decision,turn){queued.push({decisionId:decision.decisionId,turn});return{commandId:decision.decisionId};}};
 const sandbox={console,Promise,Map,Set,WeakMap,Object,Array,Number,String,Math,Date,JSON,...(userAgent?{navigator:{userAgent,deviceMemory:2,hardwareConcurrency:4}}:{}),Omega:{Simulation:simulation,OpponentCountryRules:rules},OmegaCountryRuntimeData:{resolveCountry(v){return byId.get(String(v).toUpperCase())||null;},listProfiles(){return profiles;}},Game:{state},addEventListener(){},removeEventListener(){},setTimeout(callback){yields++;queueMicrotask(callback);return 0;}};
 vm.runInNewContext(source,sandbox,{filename:'omega_world_simulation_scheduler_v1.js'});
 const scheduler=sandbox.Omega.WorldSimulationScheduler,participant=participants.get('omega.world-simulation.scheduler.v1');
 assert.ok(participant,'scheduler must register one canonical turn participant');
 scheduler.registerCountryHandler('test.player-active-handler',async(cid,ctx)=>handled.push({countryId:cid,tier:ctx.tier,turn:ctx.turn}),{tiers:['PLAYER','ACTIVE']});
 return{ids,participants,listeners,evaluations,queued,handled,yields:()=>yields,rosterCalls:()=>rosterCalls,state,simulation,scheduler,participant};
}
test('100-game-day schedule is bounded and all 196 non-player test countries are evaluated',async()=>{
 const h=harness(197);
 for(let turn=1;turn<=100;turn++){h.state.simulation.turn=turn;h.simulation.clock.turn=turn;const r=await h.participant.handler({}, {turn,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation,stepDurationMs:10000});assert.equal(r.status,'COMPLETED');assert.ok(r.active.selected<=4);assert.ok(r.macro.selected<=8);assert.ok(r.active.selected+r.macro.selected<=12);assert.ok(!r.active.results.some(x=>x.countryId==='AA'));assert.ok(!r.macro.results.some(x=>x.countryId==='AA'));}
 const processed=new Set(h.evaluations.map(x=>x.countryId));
 assert.equal(processed.size,196,'every non-player country, including active-tier countries, should be evaluated');
 assert.equal(processed.has('AA'),false,'player must remain outside opponent AI');
 assert.ok(h.evaluations.length<=1200);assert.ok(h.queued.length<=h.evaluations.length);assert.ok(h.yields()>0,'large turns must yield cooperatively to the browser');
 assert.equal(h.scheduler.LIMITS.COUNTRY_BATCH_BUDGET_MS,8,'country execution slices must have a bounded time budget');assert.equal(h.scheduler.diagnostics().lastTurn,100);
});
test('trade events promote both counterparties and duplicate event IDs are ignored',async()=>{
 const h=harness(197),event={eventId:'SETTLEMENT-1',eventType:'OMEGA_TRADE_SETTLEMENT_COMPLETED',simulationTurn:1,payload:{sourceCountryId:'BB',destinationCountryId:'CC'}};
 assert.equal(h.scheduler.enqueueEvent(event).status,'QUEUED');assert.equal(h.scheduler.enqueueEvent(event).status,'DUPLICATE');h.state.simulation.turn=1;
 const r=await h.participant.handler({}, {turn:1,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation});assert.ok(r.active.results.some(x=>x.countryId==='BB'));assert.ok(r.active.results.some(x=>x.countryId==='CC'));
});
test('active countries and event intake are capped and unknown IDs are ignored at dispatch',async()=>{
 const h=harness(197);for(let i=1;i<80;i++)h.scheduler.activateCountry(h.ids[i],{turn:1,reason:'WAR',priority:100});assert.ok(h.scheduler.diagnostics().activeCountryCount<=48);
 for(let i=0;i<300;i++)h.scheduler.enqueueEvent({eventId:'EVENT-'+i,eventType:'OMEGA_TRADE_REQUEST_CREATED',simulationTurn:1,payload:{countryId:'BB'}});
 assert.ok(h.scheduler.diagnostics().pendingEvents<=256);assert.ok(h.scheduler.diagnostics().eventOverflowCount>0);
 assert.equal(h.scheduler.activateCountry('ZZ',{turn:1,reason:'TRADE',priority:100}).status,'ACTIVATED');h.state.simulation.turn=1;
 const result=await h.participant.handler({}, {turn:1,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation});
 assert.equal(result.active.results.some(row=>row.countryId==='ZZ'),false);
 assert.equal(h.state.simulation.worldSimulationScheduler.activeCountries.ZZ,undefined);
});
test('event queue and deduplication survive scheduler recreation',()=>{
 const first=harness(10);
 first.scheduler.enqueueEvent({eventId:'LOW-1',eventType:'OMEGA_TRADE_REQUEST_CREATED',simulationTurn:1,payload:{countryId:'BB'}});
 const second=harness(10,first.state);
 assert.equal(second.scheduler.diagnostics().pendingEvents,1);
 assert.equal(second.scheduler.enqueueEvent({eventId:'LOW-1',eventType:'OMEGA_TRADE_REQUEST_CREATED',simulationTurn:1,payload:{countryId:'BB'}}).status,'DUPLICATE');
 for(let i=0;i<300;i++)second.scheduler.enqueueEvent({eventId:'TRADE-'+i,eventType:'OMEGA_TRADE_REQUEST_CREATED',simulationTurn:1,payload:{countryId:'BB'}});
 const before=second.scheduler.diagnostics().pendingEvents;assert.equal(before,256);
 assert.equal(second.scheduler.enqueueEvent({eventId:'WAR-1',eventType:'OMEGA_WAR_DECLARED',simulationTurn:1,payload:{countryId:'CC'}}).status,'QUEUED');
 assert.equal(second.scheduler.diagnostics().pendingEvents,before);
 assert.ok(second.state.simulation.worldSimulationScheduler.pendingEvents.some(row=>row.eventId==='WAR-1'));
});
test('constrained Android devices use a smaller bounded scheduler budget',async()=>{
 const h=harness(197,null,'Android 9');h.state.simulation.turn=1;h.simulation.clock.turn=1;
 const result=await h.participant.handler({}, {turn:1,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation});
 assert.equal(result.status,'COMPLETED');assert.equal(result.budget.profile,'CONSTRAINED');
 assert.ok(result.active.selected<=2);assert.ok(result.macro.selected<=4);
 assert.ok(h.yields()>=result.active.selected+result.macro.selected);
});
test('same turn commits are idempotent',async()=>{
 const h=harness(20);h.state.simulation.turn=1;const ctx={turn:1,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation};
 const first=await h.participant.handler({},ctx),before=h.evaluations.length,second=await h.participant.handler({},ctx);assert.equal(first.status,'COMPLETED');assert.equal(second.status,'ALREADY_PROCESSED');assert.equal(h.evaluations.length,before);
});
test('missing player identity does not fabricate a default player country',async()=>{
 const h=harness(4);h.state.simulation.session.playerCountryId=null;h.state.playerCountryId=null;const r=await h.participant.handler({}, {turn:1,countryId:null,state:h.state,simulation:h.simulation});assert.equal(r.status,'WAITING');assert.equal(r.reason,'PLAYER_COUNTRY_REQUIRED');assert.equal(h.scheduler.diagnostics().installed,true);
});
test('scheduler reuses canonical simulation clock and country roster APIs',()=>{
 const h=harness(3);assert.equal(h.scheduler.engineIntegrated,true);assert.equal(typeof h.scheduler.registerCountryHandler,'function');assert.equal(typeof h.scheduler.getCountryRoster,'function');
 h.scheduler.diagnostics();assert.equal(h.state.simulation.worldSimulationScheduler?.schemaVersion,1);
 assert.equal(h.state.worldClock,undefined,'scheduler must not create a second clock');
});

test('canonical roster is reused between refresh boundaries',async()=>{
 const h=harness(12);
 for(let turn=1;turn<=5;turn++){
  h.state.simulation.turn=turn;h.simulation.clock.turn=turn;
  await h.participant.handler({}, {turn,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation,stepDurationMs:10000});
 }
 assert.equal(h.rosterCalls(),1,'roster API should not be called once per game day');
 h.state.simulation.turn=31;h.simulation.clock.turn=31;
 await h.participant.handler({}, {turn:31,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation,stepDurationMs:10000});
 assert.equal(h.rosterCalls(),2,'roster should be refreshed at its 30-turn boundary');
});


test('concurrent callbacks for one turn share one execution and do not duplicate handlers',async()=>{
 const h=harness(24);h.state.simulation.turn=1;h.simulation.clock.turn=1;
 let releaseSlow,slowCalls=0,signalStarted;
 const started=new Promise(resolve=>{signalStarted=resolve;});
 const gate=new Promise(resolve=>{releaseSlow=resolve;});
 h.scheduler.registerCountryHandler('test.concurrent-turn-gate',async()=>{
   slowCalls++;signalStarted();await gate;return'RELEASED';
 },{tiers:['PLAYER'],priority:10});
 const ctx={turn:1,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation,stepDurationMs:10000};
 const first=h.participant.handler({},ctx);
 await started;
 const second=h.participant.handler({},ctx);
 assert.strictEqual(first,second,'overlapping requests for the same turn must share the in-flight promise');
 assert.equal(h.scheduler.diagnostics().processing,true);
 assert.equal(h.scheduler.diagnostics().inFlightTurn,1);
 releaseSlow();
 const [a,b]=await Promise.all([first,second]);
 assert.strictEqual(a,b,'both callers receive the same committed turn result');
 assert.equal(a.status,'COMPLETED');
 assert.equal(slowCalls,1,'player handler must execute once for the turn');
 assert.equal(h.handled.filter(x=>x.countryId==='AA'&&x.tier==='PLAYER').length,1,
   'normal player handlers must not be repeated by concurrent clock callbacks');
 assert.equal(h.evaluations.length,a.active.selected+a.macro.selected,
   'opponent evaluations must not be doubled');
 assert.equal(h.scheduler.diagnostics().processing,false);
 assert.equal(h.scheduler.diagnostics().inFlightTurn,null);
});
