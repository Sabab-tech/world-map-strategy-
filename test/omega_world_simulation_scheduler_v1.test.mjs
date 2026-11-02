import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../omega_world_simulation_scheduler_v1.js',import.meta.url),'utf8');
function harness(count=197){
 const ids=[],profiles=[],byId=new Map();
 for(let i=0;i<count;i++){const id=String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),row={countryCode:id,iso3:'X'+String(i).padStart(2,'0')};ids.push(id);profiles.push(row);byId.set(id,row);}
 const participants=new Map(),listeners=new Set(),evaluations=[],queued=[],handled=[];
 const state={simulation:{turn:0,session:{playerCountryId:'AA',status:'RUNNING'}},projects:{BB:{registry:[{projectId:'P1',autonomy:true,status:'UNDER_CONSTRUCTION'}]}},military:{CC:{trainingQueue:[{trainingId:'T1',status:'IN_TRAINING'}]}},trade:{}};
 const simulation={world:{state},clock:{turn:0,stepDurationMs:10000},getPlayerCountryId:()=> 'AA',registerTurnParticipant(id,handler,options){participants.set(id,{handler,options});return()=>participants.delete(id);},events:{subscribe(type,handler){if(type==='*')listeners.add(handler);return()=>listeners.delete(handler);}}};
 const rules={async listCountryIds(){return ids;},async evaluateCountry(countryId,turn){evaluations.push({countryId,turn});return{status:'COMPLETE',decisions:[{decisionId:'D-'+countryId+'-'+turn,scenarioId:'RESOURCE_DEFICIT',priorityScore:1,selected:{action:'IMPORT'}}]};},queueDecision(decision,turn){queued.push({decisionId:decision.decisionId,turn});return{commandId:decision.decisionId};}};
 const sandbox={console,Promise,Map,Set,WeakMap,Object,Array,Number,String,Math,Date,JSON,Omega:{Simulation:simulation,OpponentCountryRules:rules},OmegaCountryRuntimeData:{resolveCountry(v){return byId.get(String(v).toUpperCase())||null;},listProfiles(){return profiles;}},Game:{state},addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(source,sandbox,{filename:'omega_world_simulation_scheduler_v1.js'});
 const scheduler=sandbox.Omega.WorldSimulationScheduler,participant=participants.get('omega.world-simulation.scheduler.v1');
 assert.ok(participant,'scheduler must register one canonical turn participant');
 scheduler.registerCountryHandler('test.player-active-handler',async(cid,ctx)=>handled.push({countryId:cid,tier:ctx.tier,turn:ctx.turn}),{tiers:['PLAYER','ACTIVE']});
 return{ids,participants,listeners,evaluations,queued,handled,state,simulation,scheduler,participant};
}
test('100-game-day schedule is bounded and all 196 non-player test countries are evaluated',async()=>{
 const h=harness(197);
 for(let turn=1;turn<=100;turn++){h.state.simulation.turn=turn;h.simulation.clock.turn=turn;const r=await h.participant.handler({}, {turn,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation,stepDurationMs:10000});assert.equal(r.status,'COMPLETED');assert.ok(r.active.selected<=4);assert.ok(r.macro.selected<=8);assert.ok(r.active.selected+r.macro.selected<=12);assert.ok(!r.active.results.some(x=>x.countryId==='AA'));assert.ok(!r.macro.results.some(x=>x.countryId==='AA'));}
 const processed=new Set(h.evaluations.map(x=>x.countryId));
 assert.equal(processed.size,196,'every non-player country, including active-tier countries, should be evaluated');
 assert.equal(processed.has('AA'),false,'player must remain outside opponent AI');
 assert.ok(h.evaluations.length<=1200);assert.ok(h.queued.length<=h.evaluations.length);assert.equal(h.scheduler.diagnostics().lastTurn,100);
});
test('trade events promote both counterparties and duplicate event IDs are ignored',async()=>{
 const h=harness(12),event={eventId:'SETTLEMENT-1',eventType:'OMEGA_TRADE_SETTLEMENT_COMPLETED',simulationTurn:1,payload:{sourceCountryId:'BB',destinationCountryId:'CC'}};
 assert.equal(h.scheduler.enqueueEvent(event).status,'QUEUED');assert.equal(h.scheduler.enqueueEvent(event).status,'DUPLICATE');h.state.simulation.turn=1;
 const r=await h.participant.handler({}, {turn:1,countryId:'AA',playerCountryId:'AA',state:h.state,simulation:h.simulation});assert.ok(r.active.results.some(x=>x.countryId==='BB'));assert.ok(r.active.results.some(x=>x.countryId==='CC'));
});
test('active countries and event intake are capped',()=>{
 const h=harness(197);for(let i=1;i<80;i++)h.scheduler.activateCountry(h.ids[i],{turn:1,reason:'WAR',priority:100});assert.ok(h.scheduler.diagnostics().activeCountryCount<=48);
 for(let i=0;i<300;i++)h.scheduler.enqueueEvent({eventId:'EVENT-'+i,eventType:'OMEGA_TRADE_REQUEST_CREATED',simulationTurn:1,payload:{countryId:'BB'}});
 assert.ok(h.scheduler.diagnostics().pendingEvents<=256);assert.ok(h.scheduler.diagnostics().eventOverflowCount>0);
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
 assert.equal(h.state.simulation.worldSimulationScheduler?.schemaVersion,1);
 assert.equal(h.state.clock,undefined,'scheduler must not create a second clock');
});
