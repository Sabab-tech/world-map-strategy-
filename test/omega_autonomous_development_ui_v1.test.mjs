import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../omega_ui_v2/screens/autonomous-development.js';
const API=globalThis.OmegaUIV2AutonomousDevelopment;

test('dashboard reads existing runtimes and does not mutate canonical state',()=>{
 const previous={Omega:globalThis.Omega,Game:globalThis.Game};
 const calls={trade:0,macro:0,scheduler:0,autonomy:0,plans:[],projects:[]};
 const state={economy:{NPL:{npcMacroEconomy:{marker:1}}}};
 globalThis.Game={state};
 globalThis.Omega={
  AutonomousNationalTradeDecisionV1:{
   diagnostics(){calls.trade++;return{rulesStatus:'READY',rulesEnabled:true,rolloutMode:'AUTONOMOUS',autonomousProposals:true,
    autonomousCounteroffers:true,marketIntelligenceSyncEnabled:true,schedulerHandlerRegistered:true,commandHandlerRegistered:true,
    playerCountryAutomation:false,createsIndependentScheduler:false,usesTimersOrAnimationLoop:false,usesExistingGlobalMarket:true,
    usesExistingGlobalTrade:true,usesExistingBilateralTrade:true,usesExistingMinistryStateTransaction:true,lastCountryId:'NPL',
    stats:{visits:8,skipped:1,deferred:0,planned:4,marketSyncs:2,proposals:2,counteroffersAccepted:1,errors:0,
    checkpointFailures:0,supplierScans:5,lastCountryId:'NPL'}};},
   getDecisionPlan(id){calls.plans.push(id);return{countryId:id,phase:'VALIDATE',candidateIndex:0,lastDecision:{status:'FEASIBLE'},
    candidates:[{direction:'IMPORT',resourceId:'iron_ore',targetCountryId:'AUS',quantityPerDelivery:12}]};}
  },
  NpcNationalMacroEconomy:{diagnostics(){calls.macro++;return{initialized:true,ready:true,error:null,coreCountryCount:196,
   processedCountries:194,skippedCountries:3,deferredCountries:1,failedCountries:0,lastProcessedTurn:9,
   lastProgressionTurn:9,lastProgressionStatus:'CHECKPOINTED',schedulerHandlerRegistered:true};}},
  WorldSimulationScheduler:{diagnostics(){calls.scheduler++;return{installed:true,rosterCount:197,activeCountryCount:1,
   registeredCountryHandlers:5,totalQueued:11,pendingEvents:2,totalEvaluationErrors:0,processing:false,lastTurn:9};}},
  OpponentAutonomy:{diagnostics(){calls.autonomy++;return{queueBridgeInstalled:true,interoperabilityAvailable:true,routeCount:17,
   eventRouteCount:8,projectExecutor:true,housingExecutor:true,factoryExecutor:true,militaryRecruitmentExecutor:true,
   militaryTrainingExecutor:true,militaryEquipmentExecutor:true,treatyInitiator:true,counterpartyResponse:false,
   threatFusion:true,reservationLedger:true};},
   activeProjects(id){calls.projects.push(id);return[{id:'NPL-PROJECT-1',name:'Hydropower expansion',status:'UNDER_CONSTRUCTION',progressPct:40}];}},
  GlobalTrade:{diagnostics(){return{requests:6,pending:2,settled:4};}}
 };
 try{
  const model=API.buildViewModel({countryId:'BGD'});
  assert.equal(model.trade.state,'healthy');assert.equal(model.macro.state,'healthy');
  assert.equal(model.scheduler.state,'healthy');assert.equal(model.autonomy.state,'pending');
  assert.equal(model.npcCountry,'NPL');assert.equal(model.trade.plan.candidates[0].targetCountryId,'AUS');
  assert.equal(model.projects.rows.length,1);assert.deepEqual(calls.plans,['NPL']);
  assert.deepEqual(calls.projects,['NPL']);assert.deepEqual(globalThis.Game.state,state);
  const root={innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const rendered=API.render(root,{countryId:'BGD'});
  assert.equal(rendered.ok,true);assert.equal(rendered.pipelineLayers,28);
  assert.match(root.innerHTML,/Autonomous Trade Command/);
  assert.match(root.innerHTML,/<svg[^>]+width="24"[^>]+height="24"[^>]+viewBox="0 0 24 24"/);
  assert.match(root.innerHTML,/Candidate only · not a confirmed contract/);
  assert.match(root.innerHTML,/Authority boundaries/);
  assert.match(root.innerHTML,/omega-v2-autonomy-status--healthy/);
  assert.match(root.innerHTML,/omega-v2-autonomy-status--pending/);
  assert.match(root.innerHTML,/How a national trade decision moves/);
  assert.equal(calls.trade,2);assert.equal(calls.macro,2);assert.equal(calls.scheduler,2);assert.equal(calls.autonomy,2);
 }finally{
  if(previous.Omega===undefined)delete globalThis.Omega;else globalThis.Omega=previous.Omega;
  if(previous.Game===undefined)delete globalThis.Game;else globalThis.Game=previous.Game;
 }
});

test('missing runtime evidence remains UNKNOWN, not a fabricated healthy zero',()=>{
 const previous=globalThis.Omega;globalThis.Omega={};
 try{
  const model=API.buildViewModel({countryId:'BGD'});
  assert.equal(model.trade.state,'unknown');assert.equal(model.macro.state,'unknown');
  assert.equal(model.scheduler.state,'unknown');assert.equal(model.autonomy.state,'unknown');
  assert.equal(model.projects.available,false);
  const root={innerHTML:''};API.render(root,{countryId:'BGD'});
  assert.match(root.innerHTML,/Partial telemetry/);
  assert.match(root.innerHTML,/Project data not exposed/);
  assert.match(root.innerHTML,/Not reported/);
 }finally{if(previous===undefined)delete globalThis.Omega;else globalThis.Omega=previous;}
});

test('autonomous screen is wired to the shared route and offline shell',()=>{
 const app=readFileSync(new URL('../omega_ui_v2/app.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../omega-offline-map-sw.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../omega_ui_v2/omega-ui-v2.css',import.meta.url),'utf8');
 const tradeCss=readFileSync(new URL('../omega_ui_v2/autonomous-trade-command.css',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../omega_ui_v2/manifest.json',import.meta.url),'utf8'));
 assert.match(app,/autonomous-development/);
 assert.match(index,/<script src="omega_ui_v2\/screens\/autonomous-development\.js" defer><\/script>/);
 assert.match(sw,/omega-offline-atlas-shell-v133/);
 assert.match(sw,/"\.\/omega_ui_v2\/screens\/autonomous-development\.js"/);
 assert.match(css,/\.omega-v2-autonomy-status--healthy/);
 assert.match(css,/\.omega-v2-autonomy-status--pending/);
 assert.match(css,/\.omega-v2-autonomy-status--blocked/);
 assert.ok(index.indexOf('omega_ui_v2/autonomous-trade-command.css')>index.indexOf('omega_ui_unified_visual_system_v1.css'),'trade command overrides must load after the global visual system');
 assert.match(sw,/\.\/omega_ui_v2\/autonomous-trade-command\.css/);
 assert.match(tradeCss,/\.omega-v2-autonomy-page \.oa-hero h1/);
 assert.match(tradeCss,/svg\.omega-v2-autonomy-icon/);
 assert.ok(manifest.additionalStyles.includes('omega_ui_v2/autonomous-trade-command.css'));
 assert.equal(manifest.screens.autonomousDevelopment,'omega_ui_v2/screens/autonomous-development.js');
 assert.equal(API.VERSION,'1.1.0');
});
