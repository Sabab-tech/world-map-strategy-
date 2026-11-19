import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const profileData=JSON.parse(readFileSync('economy_global_profiles_v1.json','utf8'));
const financeRules=JSON.parse(readFileSync('finance_runtime_rules_v1.json','utf8'));
const sectorRegistry=JSON.parse(readFileSync('finance_sector_registry_v1.json','utf8'));
const runtime=readFileSync('omega_finance_ministry_runtime_v1.js','utf8');
const indexHtml=readFileSync('index.html','utf8');
const layoutRepairCss=readFileSync('omega_ministry_layout_repair_v1.css','utf8');

test('all map country and area identities exist, and unknown values are explicit',()=>{
  assert.equal(profileData.countries.length,249);
  assert.equal(profileData.metadata.countryCount,249);
  assert.ok(profileData.metadata.mappedEconomicProfiles>=220);
  assert.ok(profileData.countries.every(p=>p.countryCode&&p.iso3&&p.name));
  const missing=profileData.countries.filter(p=>p.profileStatus==='UNAVAILABLE');
  assert.ok(missing.length>0);
  assert.ok(missing.every(p=>p.indicators.gdpCurrentUsd===null));
  assert.ok(profileData.countries.every(p=>p.indicators.policyInterestRatePct===null));
  assert.ok(profileData.countries.every(p=>p.indicators.economicInfluenceIndex===null||Number.isFinite(p.indicators.economicInfluenceIndex)));
  assert.equal(sectorRegistry.budgetSectors.reduce((sum,s)=>sum+s.defaultSharePct,0),100);
  assert.equal(sectorRegistry.economicSectors.reduce((sum,s)=>sum+s.outputSharePct,0),100);
  assert.equal(sectorRegistry.economicSectors.reduce((sum,s)=>sum+s.taxReceiptSharePct,0),100);
  assert.ok(sectorRegistry.economicSectors.every(s=>s.budgetSectorId&&sectorRegistry.budgetSectors.some(b=>b.id===s.budgetSectorId)));
  assert.ok(sectorRegistry.economicSectors.every(s=>s.budgetSectorId&&sectorRegistry.budgetSectors.some(b=>b.id===s.budgetSectorId)));
});
function createRuntime(options={}){
  const handlers=new Map();
  const schedulerHandlers=new Map();
  const scheduler={registerCountryHandler(id,handler,options={}){schedulerHandlers.set(id,{handler,options});return()=>schedulerHandlers.delete(id);}};
  const elements=new Map();
  const simulationEventListeners=new Map();
  const simulationEvents={
    subscribe(type,listener){
      const key=String(type||'*'),set=simulationEventListeners.get(key)||new Set();
      set.add(listener);simulationEventListeners.set(key,set);
      return()=>set.delete(listener);
    },
    emit(type,payload={},turn=0){
      const event={eventId:'OMEGA-SIM-EVT-'+turn,eventType:String(type||'UNKNOWN'),
        simulationTurn:turn,payload:JSON.parse(JSON.stringify(payload))};
      for(const listener of [...(simulationEventListeners.get(event.eventType)||[])])listener(event);
      for(const listener of [...(simulationEventListeners.get('*')||[])])listener(event);
      return event;
    },
    reset(){}
  };
  const document={readyState:'loading',addEventListener(type,fn){const k='doc:'+type;handlers.set(k,[...(handlers.get(k)||[]),fn]);},getElementById(id){return elements.get(id)||null;}};
  elements.set('ministry-dashboard-view',{className:'',style:{display:'none'}});
  elements.set('ministry-dashboard-content',{innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
  elements.set('dash-crumb-title',{textContent:''});
  elements.set('dash-layer-status',{textContent:''});
  const profile=profileData.countries.find(p=>p.iso3==='BGD');
  const economy=JSON.parse(JSON.stringify(profile.sourceValues));
  const session={sessionId:'OMEGA-FINANCE-TEST-SESSION',playerCountryId:'BGD',
    status:'READY',createdTurn:1,lastCommittedTurn:1};
  const state={economy:{BANGLADESH:economy},finance:{BGD:{available:4000000000,reserves:456}},population:{BGD:{population_2015:profile.indicators.population2015}},simulation:{turn:1,session}};
  const context={console,document,Intl,Math,Number,String,Object,Array,Map,Set,Promise,Date,JSON,WeakMap,WeakSet,
    CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    addEventListener(type,fn){handlers.set(type,[...(handlers.get(type)||[]),fn]);},
    dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);return true;},
    fetch:async url=>{
      const requested=String(url);
      if(options.emitSessionDuringRulesFetch&&requested.includes('finance_runtime_rules_v1.json')){
        const eventSession=JSON.parse(JSON.stringify(state.simulation.session));
        eventSession.status='READY';
        context.dispatchEvent(new context.CustomEvent('OMEGA_GAME_SESSION_CREATED',{
          detail:{session:eventSession}
        }));
        state.simulation.session.status='RUNNING';
        state.simulation.session.startedTurn=eventSession.createdTurn;
      }
      if(requested.includes('economy_global_profiles_v1.json'))return{ok:true,json:async()=>profileData};
      if(requested.includes('finance_runtime_rules_v1.json'))return{ok:true,json:async()=>financeRules};
      if(requested.includes('finance_sector_registry_v1.json'))return{ok:true,json:async()=>sectorRegistry};
      return Promise.reject(new Error('Unexpected fetch '+url));
    },
    Omega:{Simulation:{world:{state},clock:{turn:1,stepDurationMs:86400000},events:simulationEvents,getPlayerCountryId(){return 'BGD';}},WorldSimulationScheduler:scheduler},
    Game:{state:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},simulation:{turn:1}},currentActiveCountry:'BGD'},
    gameState:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},population:{},simulation:{turn:1}},
    CountryIOS:{activeCountry:'BGD'},OmegaCabinetUI:{renderMinistryDashboard(id){this.legacyMinistryId=id;return 'legacy';}}};
  context.window=context;context.globalThis=context;
  vm.runInNewContext(runtime,context,{filename:'omega_finance_ministry_runtime_v1.js'});
  if(options.emitGameSessionCreated!==false&&!options.emitSessionDuringRulesFetch){
    context.dispatchEvent(new context.CustomEvent('OMEGA_GAME_SESSION_CREATED',{
      detail:{session:JSON.parse(JSON.stringify(session))}
    }));
    // SimulationRuntime emits the creation event while READY, then startSession
    // moves the same session to RUNNING before asynchronous registries may load.
    state.simulation.session.status='RUNNING';
    state.simulation.session.startedTurn=1;
  }
  return {context,state,document,elements,schedulerHandlers,handlers};
}
test('initial fiscal period index uses the live Simulation clock duration',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=8760;
  context.Omega.Simulation.clock.turn=8760;
  context.Omega.Simulation.clock.stepDurationMs=3600000;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.equal(finance.fiscalYearIndex,1,
    '8,760 committed hourly turns represent one 365-day fiscal year');
  assert.equal(finance.fiscalPeriodAccount.periodIndex,1);
});

test('Finance preserves existing finance data and enforces allocation, treasury and tax rules',async()=>{
  const {context,state}=createRuntime();const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.initialized,true);assert.equal(boot.profileCount,249);assert.equal(state.finance.BGD.available,4000000000);assert.equal(state.finance.BGD.reserves,456);
  assert.ok(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd>0);
  let r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:1000,spendType:'purchase'});
  assert.equal(r.ok,true,'the country starts with a configured budget sector');
  assert.equal(state.finance.BGD.available,4000000000-1000);
  r=context.OmegaFinanceMinistry.applyAction({type:'set-allocation',countryId:'BGD',department:'interior',amountUsd:100000000});
  assert.equal(r.ok,true);
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:200000000,spendType:'purchase'});
  assert.equal(r.ok,false);assert.equal(r.code,'ALLOCATION_LIMIT_EXCEEDED');
  const before=context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd;
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:5000000,spendType:'maintenance',description:'Repair fleet'});
  assert.equal(r.ok,true);assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd,before-5000000);assert.equal(state.finance.BGD.available,before-5000000);
  r=context.OmegaFinanceMinistry.applyAction({type:'set-tax-rate',countryId:'BGD',value:25});
  assert.equal(r.ok,true);assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').policy.taxRatePct,25);
});
test('Finance advances GDP and debt using simulation duration and ignores duplicate turns',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const e=state.economy.BANGLADESH,gdp=e.gdp,debt=e.debt;
  const out=context.OmegaFinanceMinistry.advanceTurn(25,financeRules.annualizationMs);
  assert.equal(out.ok,true);
  assert.equal(out.processed,context.OmegaFinanceMinistry.getProfiles().filter(p=>p.profileStatus!=='UNAVAILABLE'&&p.indicators.gdpCurrentUsd>0).length);
  assert.ok(e.gdp>gdp);assert.ok(e.debt>debt);
  const gdpAfter=e.gdp;const repeat=context.OmegaFinanceMinistry.advanceTurn(25,financeRules.annualizationMs);
  assert.equal(repeat.processed,0);assert.equal(e.gdp,gdpAfter);
});
test('Finance advances only scheduler-selected countries, preserves same-turn peers and is idempotent per country',async()=>{
  const {context,state,schedulerHandlers,handlers}=createRuntime();
  const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.schedulerHandlerRegistered,true);
  const registered=schedulerHandlers.get('omega-finance-ministry');
  assert.ok(registered,'Finance must register with the existing bounded world scheduler');
  assert.deepEqual(Array.from(registered.options.tiers),['PLAYER','ACTIVE','MACRO']);
  assert.equal(registered.options.priority,15);
  assert.equal(handlers.has('OMEGA_SIMULATION_TURN_COMMITTED'),false,
    'Finance must not retain its automatic all-profile committed-turn listener');

  const profiles=context.OmegaFinanceMinistry.getProfiles();
  const bgd=profiles.find(p=>p.iso3==='BGD'&&p.profileStatus!=='UNAVAILABLE');
  const nga=profiles.find(p=>p.iso3==='NGA'&&p.profileStatus!=='UNAVAILABLE');
  assert.ok(bgd?.economyKey&&nga?.economyKey,'Both test countries must resolve from the canonical Finance registry');
  const bgdEconomy=state.economy[bgd.economyKey],ngaEconomy=state.economy[nga.economyKey];
  const bgdGdp=bgdEconomy.gdp,ngaGdp=ngaEconomy.gdp;
  const turn=25,duration=financeRules.annualizationMs;
  const player=await registered.handler('BGD',{turn,stepDurationMs:duration,tier:'PLAYER',playerCountryId:'BGD'});
  assert.equal(player.processed,1,JSON.stringify(player));
  assert.ok(bgdEconomy.gdp>bgdGdp);
  const bgdAfter=bgdEconomy.gdp;
  const replay=await registered.handler('BGD',{turn,stepDurationMs:duration,tier:'PLAYER',playerCountryId:'BGD'});
  assert.equal(replay.processed,0);
  assert.equal(replay.duplicate,true);
  assert.equal(bgdEconomy.gdp,bgdAfter);

  const npc=await registered.handler('NGA',{turn,stepDurationMs:duration,tier:'MACRO',playerCountryId:'BGD'});
  assert.equal(npc.processed,1,JSON.stringify(npc));
  assert.ok(ngaEconomy.gdp>ngaGdp,'A different scheduler-selected NPC must advance during the same committed turn');
  assert.equal(context.OmegaFinanceMinistry.getFinanceState('NGA').lastProcessedTurn,turn);

  const beforeWrongTier=ngaEconomy.gdp;
  const wrongPlayerTier=await registered.handler('NGA',{turn:turn+1,stepDurationMs:duration,tier:'PLAYER',playerCountryId:'BGD'});
  assert.equal(wrongPlayerTier.skipped,true);
  assert.equal(wrongPlayerTier.reason,'PLAYER_TIER_COUNTRY_MISMATCH');
  assert.equal(ngaEconomy.gdp,beforeWrongTier);
  const wrongNpcTier=await registered.handler('BGD',{turn:turn+1,stepDurationMs:duration,tier:'MACRO',playerCountryId:'BGD'});
  assert.equal(wrongNpcTier.skipped,true);
  assert.equal(wrongNpcTier.reason,'PLAYER_COUNTRY_OUTSIDE_NPC_TIERS');
  assert.equal(bgdEconomy.gdp,bgdAfter);
});
test('Finance commands cannot change a non-player country',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const result=context.OmegaFinanceMinistry.applyAction({type:'set-tax-rate',countryId:'USA',value:40});
  assert.equal(result.ok,false);assert.equal(result.code,'PLAYER_COUNTRY_SCOPE_VIOLATION');
});


test('Finance Ministry follows the selected country context and computes each country budget independently',async()=>{
  const {context,elements}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const bangladesh=context.OmegaFinanceMinistry.getBudgetSnapshot('BGD').rows.find(row=>row.id==='interior').budgetUsd;
  const nigeria=context.OmegaFinanceMinistry.getBudgetSnapshot('NGA').rows.find(row=>row.id==='interior').budgetUsd;
  assert.notEqual(nigeria,bangladesh,'country-level interior ceilings must use each profile’s own fiscal model');

  context.OmegaMinistryViewCountry='NGA';
  assert.equal(context.OmegaFinanceMinistry.renderDashboard('finance'),true);
  const html=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(html.includes('Nigeria (NGA)'),'Finance should render the explicitly selected Nigerian profile');
  assert.ok(html.includes('READ-ONLY PROFILE'),'foreign profiles remain view-only');
  assert.ok(!html.includes('data-ofm-action="spend-budget"'),'country selection must not grant foreign spending permission');
  assert.equal(context.Omega.Simulation.getPlayerCountryId(),'BGD','viewing another country must not alter the player identity');

  const selected=context.OmegaFinanceMinistry.selectCountry('MO');
  assert.equal(selected.ok,true);
  assert.equal(context.OmegaMinistryViewCountry,'MO','Finance dropdown must publish the selected country to other ministry views');
  assert.equal(context.Omega.Simulation.getPlayerCountryId(),'BGD');
});

test('Finance reconciles treasury changes posted by existing ministries and resource systems',async()=>{
  const {context,state}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const before=state.finance.BGD.available;
  const externallyUpdated=before-125000;
  state.finance.BGD.available=externallyUpdated;
  const metrics=context.OmegaFinanceMinistry.getIndicators('BGD');
  assert.equal(metrics.treasuryBalanceUsd,externallyUpdated);
  assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd,externallyUpdated);
  assert.equal(state.finance.BGD.available,externallyUpdated);
  assert.equal(state.finance.BGD.reserves,456);
});
test('Finance route renders its dashboard through the existing Cabinet UI and locks foreign-country controls',async()=>{
  const {context,elements}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const opened=context.OmegaCabinetUI.renderMinistryDashboard('finance');
  assert.equal(opened,true);
  assert.equal(elements.get('ministry-dashboard-view').style.display,'flex');
  assert.equal(elements.get('dash-layer-status').textContent,'FINANCE & TREASURY CONTROL ROOM');
  const html=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(html.includes('Finance Ministry'));
  assert.ok(html.includes('data-ofm-tab="budget"'));
  assert.ok(html.includes('data-ofm-tab="treasury"'));
  assert.ok(!html.includes('data-ofm-action="set-allocation"'),'budget edit forms stay inside the Budget tab');
  assert.equal(context.OmegaFinanceMinistry.selectTab('budget').ok,true);
  const budgetHTML=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(budgetHTML.includes('data-ofm-action="set-allocation"'));
  assert.ok(budgetHTML.includes('data-ofm-action="set-sector-share"'));
  assert.ok(budgetHTML.includes('data-ofm-action="spend-budget"'));
  const selected=context.OmegaFinanceMinistry.selectCountry('USA');
  assert.equal(selected.ok,true);
  const readOnlyHTML=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(readOnlyHTML.includes('READ-ONLY PROFILE'));
  assert.ok(!readOnlyHTML.includes('data-ofm-action="spend-budget"'));
});

test('Budget sector distribution sums to 100% and rejects an over-allocation',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const snapshot=context.OmegaFinanceMinistry.getBudgetSnapshot('BGD');
  assert.equal(snapshot.rows.length,22);
  assert.ok(Math.abs(snapshot.totalSharePct-100)<0.0001);
  const before=context.OmegaFinanceMinistry.getFinanceState('BGD').allocations;
  const first=sectorRegistry.budgetSectors[0],second=sectorRegistry.budgetSectors[1];
  const reduce=context.OmegaFinanceMinistry.applyAction({type:'set-sector-share',countryId:'BGD',sectorId:first.id,sharePct:first.defaultSharePct-1});
  assert.equal(reduce.ok,true);
  const excess=context.OmegaFinanceMinistry.applyAction({type:'set-sector-share',countryId:'BGD',sectorId:second.id,sharePct:100});
  assert.equal(excess.ok,false);assert.equal(excess.code,'BUDGET_SHARES_EXCEED_100');
  const latest=context.OmegaFinanceMinistry.getBudgetSnapshot('BGD');
  assert.ok(latest.totalSharePct<=100.0001);
  assert.ok(before[first.id].budgetUsd>=latest.rows.find(r=>r.id===first.id).budgetUsd);
});

test('ministry budget transfer reallocates existing unspent ceilings without moving Treasury cash',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const before=finance.getFinanceState('BGD');
  const source=before.allocations.defense,target=before.allocations.interior;
  assert.ok(source&&target,'both ministries need existing canonical budget allocations');
  const amount=Math.min(250000,source.remainingUsd/2);
  assert.ok(amount>0,'source ministry needs unspent allocated funds');
  const treasuryBefore=before.treasuryBalanceUsd;
  const sourceBudgetBefore=source.budgetUsd,targetBudgetBefore=target.budgetUsd;
  const transferRequest={type:'transfer-budget',countryId:'BGD',sourceDepartment:'defense',
    targetDepartment:'interior',amountUsd:amount,description:'Test inter-ministry reallocation',idempotencyKey:'test-same-transfer-request'};
  const result=finance.applyAction(transferRequest);
  assert.equal(result.ok,true);
  assert.equal(result.code,'BUDGET_TRANSFER_POSTED');
  assert.equal(result.treasuryCashMoved,false);
  assert.equal(state.finance.BGD.available,treasuryBefore,'allocation-only transfers must not move treasury cash');
  const after=finance.getFinanceState('BGD');
  const revisionAfterFirst=after.revision;
  const duplicate=finance.applyAction(transferRequest);
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true,'replaying the same request must not apply the allocation change twice');
  assert.equal(duplicate.transferId,result.transferId);
  const keyConflict=finance.applyAction({...transferRequest,amountUsd:amount+1});
  assert.equal(keyConflict.ok,false);
  assert.equal(keyConflict.code,'BUDGET_TRANSFER_IDEMPOTENCY_CONFLICT');
  const afterDuplicate=finance.getFinanceState('BGD');
  assert.equal(afterDuplicate.revision,revisionAfterFirst);
  assert.ok(Math.abs(afterDuplicate.allocations.defense.budgetUsd-after.allocations.defense.budgetUsd)<0.01);
  assert.ok(Math.abs(afterDuplicate.allocations.interior.budgetUsd-after.allocations.interior.budgetUsd)<0.01);
  assert.ok(Math.abs(after.allocations.defense.budgetUsd-(sourceBudgetBefore-amount))<0.01);
  assert.ok(Math.abs(after.allocations.interior.budgetUsd-(targetBudgetBefore+amount))<0.01);
  assert.ok(Math.abs(after.allocations.defense.remainingUsd-(source.remainingUsd-amount))<0.01);
  const paired=after.ledger.filter(row=>row.transferId===result.transferId);
  assert.equal(paired.length,2,'transfer must write paired debit/credit audit rows');
  assert.deepEqual(paired.map(row=>row.action).sort(),['BUDGET_TRANSFER_IN','BUDGET_TRANSFER_OUT']);
  assert.ok(paired.every(row=>row.category==='inter_ministry_budget_transfer'));
  assert.equal(paired.find(row=>row.action==='BUDGET_TRANSFER_OUT').counterpartyDepartment,'interior');
  assert.equal(paired.find(row=>row.action==='BUDGET_TRANSFER_IN').counterpartyDepartment,'defense');
});

test('ministry budget transfer rejects same-ministry, invalid, overdrawn and foreign-country requests',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const before=finance.getFinanceState('BGD');
  let result=finance.applyAction({type:'transfer-budget',countryId:'BGD',sourceDepartment:'defense',
    targetDepartment:'defense',amountUsd:10});
  assert.equal(result.ok,false);assert.equal(result.code,'BUDGET_TRANSFER_SAME_MINISTRY');
  result=finance.applyAction({type:'transfer-budget',countryId:'BGD',sourceDepartment:'not-a-sector',
    targetDepartment:'interior',amountUsd:10});
  assert.equal(result.ok,false);assert.equal(result.code,'BUDGET_TRANSFER_SECTOR_INVALID');
  result=finance.applyAction({type:'transfer-budget',countryId:'BGD',sourceDepartment:'defense',
    targetDepartment:'interior',amountUsd:before.allocations.defense.remainingUsd+1});
  assert.equal(result.ok,false);assert.equal(result.code,'BUDGET_TRANSFER_EXCEEDS_REMAINING');
  result=finance.applyAction({type:'transfer-budget',countryId:'USA',sourceDepartment:'defense',
    targetDepartment:'interior',amountUsd:10});
  assert.equal(result.ok,false);assert.equal(result.code,'PLAYER_COUNTRY_SCOPE_VIOLATION');
  const after=finance.getFinanceState('BGD');
  assert.equal(after.treasuryBalanceUsd,before.treasuryBalanceUsd);
  assert.equal(after.allocations.defense.budgetUsd,before.allocations.defense.budgetUsd);
  assert.equal(after.allocations.interior.budgetUsd,before.allocations.interior.budgetUsd);
});

test('budget UI presents same-country ministry transfers only in the editable player profile',async()=>{
  const {context,elements}=createRuntime();await context.OmegaFinanceMinistry.init();
  assert.equal(context.OmegaFinanceMinistry.selectTab('budget').ok,true);
  let html=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(html.includes('Ministry-to-ministry budget transfer'));
  assert.ok(html.includes('data-ofm-action="transfer-budget"'));
  assert.ok(html.includes('name="sourceDepartment"'));
  assert.ok(html.includes('name="targetDepartment"'));
  assert.equal(context.OmegaFinanceMinistry.selectCountry('USA').ok,true);
  html=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(html.includes('READ-ONLY PROFILE'));
  assert.ok(!html.includes('data-ofm-action="transfer-budget"'));
});

test('Modeled tax receipts accrue to the existing Finance ledger over simulation time',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const beforeTax=Number(state.finance.BGD.taxRevenue)||0;
  const beforeCash=state.finance.BGD.available;
  const out=context.OmegaFinanceMinistry.advanceTurn(25,financeRules.annualizationMs);
  assert.equal(out.ok,true);
  assert.ok(state.finance.BGD.taxRevenue>beforeTax);
  assert.ok(state.finance.BGD.available>beforeCash);
  assert.ok(state.finance.BGD.revenue>=state.finance.BGD.taxRevenue);
  const revenueSnapshot=context.OmegaFinanceMinistry.getRevenueSnapshot('BGD');
  const sectorReceipts=revenueSnapshot.industries.reduce((sum,row)=>sum+(Number(row.collectedTaxReceiptsUsd)||0),0);
  const fiscalState=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.ok(sectorReceipts>0,'each simulated tax collection should be allocated across economic-sector rows');
  assert.ok(Math.abs(sectorReceipts-fiscalState.currentYearTaxRevenueUsd)<0.01,
    'sector receipts must reconcile to modeled current-year tax receipts');
});

test('Debt repayment reduces principal and treasury by the posted amount',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const economy=state.economy.BANGLADESH;
  const debtBefore=economy.debt;
  const cashBefore=state.finance.BGD.available;
  const amount=1000000;
  const result=context.OmegaFinanceMinistry.applyAction({type:'repay-debt',countryId:'BGD',amountUsd:amount,description:'Test principal payment'});
  assert.equal(result.ok,true);
  assert.equal(economy.debt,debtBefore-amount);
  assert.equal(state.finance.BGD.available,cashBefore-amount);
});

test('Emergency and debt-service categories are restricted to matching budget sectors',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  let r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'defense',amountUsd:10,spendType:'emergency'});
  assert.equal(r.ok,false);assert.equal(r.code,'EMERGENCY_SECTOR_REQUIRED');
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'defense',amountUsd:10,spendType:'debt_service'});
  assert.equal(r.ok,false);assert.equal(r.code,'DEBT_SERVICE_SECTOR_REQUIRED');
});

test('Finance tabs place cash and macro details behind separate icons while overview stays compact',async()=>{
  const {context,elements}=createRuntime();await context.OmegaFinanceMinistry.init();
  assert.equal(context.OmegaCabinetUI.renderMinistryDashboard('finance'),true);
  const overview=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(overview.includes('data-ofm-tab="budget"'));
  assert.ok(overview.includes('data-ofm-tab="treasury"'));
  assert.ok(overview.includes('data-ofm-tab="fx"'));
  assert.ok(overview.includes('data-ofm-tab="macro"'));
  assert.ok(!overview.includes('data-ofx-container'),'FX panel should not mount in the default overview tab');
  assert.ok(!overview.includes('data-omss-container'),'macro panel should not mount in the default overview tab');
  assert.ok(overview.includes('Budget plan status'));
  assert.ok(!overview.includes('Available Treasury'),'cash values should live in the Treasury tab');
  assert.ok(!overview.includes('Current-year cashflow'),'cashflow amount should live in the Treasury tab');
  assert.ok(!overview.includes('$'),'the overview should not scatter currency amounts across the page');
  assert.ok(!overview.includes('GDP (current baseline)'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('budget').ok,true);
  const budget=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(budget.includes('Chemical Industry &amp; Advanced Materials')||budget.includes('Chemical Industry & Advanced Materials'));
  assert.ok(budget.includes('data-ofm-action="set-sector-share"'));
  assert.ok(budget.includes('data-ofm-action="spend-budget"'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('treasury').ok,true);
  const treasury=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(treasury.includes('Treasury cash'));
  assert.ok(treasury.includes('data-ofm-action="borrow"'));
  assert.ok(treasury.includes('data-ofm-action="repay-debt"'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('income').ok,true);
  const income=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(income.includes('Estimated output'));
  assert.ok(income.includes('Collected this FY'),'industry rows should show the accrued sector receipts for this fiscal year');
  assert.ok(income.includes('NOT AVAILABLE'),'missing live receipts must not be fabricated');
  assert.ok(income.includes('Annual budget'));
  assert.ok(income.includes('Spent'));
  assert.ok(income.includes('Remaining'));
  assert.ok(income.includes('Budget sector'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('fx').ok,true);
  const fx=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(fx.includes('data-ofx-container'),'FX engine must have a dedicated mount target');
  assert.ok(fx.includes('Foreign Exchange & Government Banking'));
  assert.ok(!fx.includes('data-ofx-panel'),'FX runtime owns rendering into the tab host');
  assert.equal(context.OmegaFinanceMinistry.selectTab('macro').ok,true);
  const macro=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(macro.includes('data-omss-container'),'macro engine must have a dedicated mount target');
  assert.ok(macro.includes('Macroeconomic Stability'));
  assert.ok(!macro.includes('data-ofx-container'),'only the active integration panel should be mounted');
});


test('all nine Finance section buttons respond to click delegation',async()=>{
  const {context,elements}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  assert.equal(context.OmegaCabinetUI.renderMinistryDashboard('finance'),true);
  const content=elements.get('ministry-dashboard-content');
  const click=content.listeners.click;
  assert.equal(typeof click,'function');
  const markers={fx:'data-ofx-container',macro:'data-omss-container',analytics:'data-ofa-container',worldbank:'data-owb-container'};
  for(const [tab,marker] of Object.entries(markers)){
    const button={getAttribute(name){return name==='data-ofm-tab'?tab:null;}};
    click({target:{closest(selector){return selector==='[data-ofm-tab]'?button:null;}}});
    assert.ok(content.innerHTML.includes(marker),tab+' should mount its own content');
  }
});

test('ministry viewport layout confines scrolling and keeps Finance navigation compact',()=>{
  assert.ok(existsSync('omega_ministry_layout_repair_v1.css'), 'legacy layout CSS file remains present');
  assert.doesNotMatch(indexHtml, /<link[^>]+href="omega_ministry_layout_repair_v1\.css"/i);
  assert.match(indexHtml, /<link[^>]+href="omega_ui_v2\/omega-ui-v2\.css"/);
  assert.match(layoutRepairCss,/height: 100dvh !important/);
  assert.match(layoutRepairCss,/overflow: hidden !important/);
  assert.match(layoutRepairCss,/min-height: 0 !important/);
  assert.match(layoutRepairCss,/grid-template-columns: repeat\(9, minmax\(0, 1fr\)\)/);
});

test('World Bank tab is part of the Finance API and its host is mounted only when selected',async()=>{
  const {context,elements}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  assert.equal(context.OmegaFinanceMinistry.selectTab('worldbank').ok,true);
  const html=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(html.includes('data-owb-container'),'World Bank runtime must receive a dedicated tab mount point');
  assert.ok(html.includes('International Lending Institution'));
  assert.ok(!html.includes('data-ofx-container'),'the FX mount must not leak into the World Bank tab');
});


test('Finance exposes source baseline metadata through a read-only profile metadata API',async()=>{
  const {context}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const metadata=context.OmegaFinanceMinistry.getProfileMetadata();
  assert.equal(metadata.baselineYear,profileData.metadata.baselineYear);
  assert.equal(metadata.countryCount,profileData.metadata.countryCount);
  assert.equal(metadata.provenanceWarning,profileData.metadata.provenanceWarning);
  metadata.baselineYear=-1;
  assert.equal(context.OmegaFinanceMinistry.getProfileMetadata().baselineYear,profileData.metadata.baselineYear,
    'metadata accessor returns a clone rather than mutable Finance runtime state');
});


test('new-game Finance opening cash is captured before the first fiscal flows and labelled by provenance',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.initialized,true);
  const fm=context.OmegaFinanceMinistry.getFinanceState('BGD');
  const account=fm.fiscalPeriodAccount;
  assert.equal(account.periodIndex,0);
  assert.equal(account.openingTurn,1);
  assert.equal(account.openingBalanceUsd,4000000000);
  assert.equal(account.openingBalanceQuality,'GAME_STATE');
  assert.equal(account.openingBalanceSource,'EXISTING_RUNTIME_FINANCE_AVAILABLE');
  assert.equal(account.flowCoverage,'COMPLETE_FROM_PERIOD_START');
  assert.equal(account.totalInflowsUsd,0);
  assert.equal(account.totalOutflowsUsd,0);
  assert.equal(account.reconciliationStatus,'GAME_STATE_RECONCILED');
});


test('Finance captures a genuine opening from the canonical Simulation EventLedger',async()=>{
  const {context,state}=createRuntime({emitGameSessionCreated:false});
  const session=JSON.parse(JSON.stringify(state.simulation.session));
  context.Omega.Simulation.events.emit('OMEGA_GAME_SESSION_CREATED',{session},1);
  state.simulation.session.status='RUNNING';
  state.simulation.session.startedTurn=1;
  await context.OmegaFinanceMinistry.init();
  const account=context.OmegaFinanceMinistry.getFinanceState('BGD').fiscalPeriodAccount;
  assert.equal(account.openingTurn,1);
  assert.equal(account.openingBalanceUsd,4000000000);
  assert.equal(account.openingBalanceSource,'EXISTING_RUNTIME_FINANCE_AVAILABLE');
  assert.equal(account.flowCoverage,'COMPLETE_FROM_PERIOD_START');
  assert.equal(account.reconciliationStatus,'GAME_STATE_RECONCILED');
});

test('session-created event received between profile load and country indexing keeps trusted opening evidence',async()=>{
  const {context,state}=createRuntime({emitGameSessionCreated:false,emitSessionDuringRulesFetch:true});
  const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.initialized,true);
  const account=context.OmegaFinanceMinistry.getFinanceState('BGD').fiscalPeriodAccount;
  assert.equal(state.simulation.session.status,'RUNNING');
  assert.equal(account.openingTurn,1);
  assert.equal(account.openingBalanceUsd,4000000000);
  assert.equal(account.openingBalanceSource,'EXISTING_RUNTIME_FINANCE_AVAILABLE');
  assert.equal(account.flowCoverage,'COMPLETE_FROM_PERIOD_START');
  assert.equal(account.reconciliationStatus,'GAME_STATE_RECONCILED');
});

test('a lifecycle auto-created session at a legacy turn cannot establish a new-game opening',async()=>{
  const {context,state}=createRuntime({emitGameSessionCreated:false,emitSessionDuringRulesFetch:true});
  state.simulation.turn=10;
  state.simulation.session.createdTurn=10;
  state.simulation.session.lastCommittedTurn=10;
  // The active session exists, but it represents a legacy save whose session
  // field was synthesized by the lifecycle runtime rather than a new game.
  const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.initialized,true);
  const account=context.OmegaFinanceMinistry.getFinanceState('BGD').fiscalPeriodAccount;
  assert.equal(account.openingBalanceUsd,null);
  assert.equal(account.openingBalanceSource,'LEGACY_OPENING_NOT_RECORDED');
  assert.equal(account.openingBalanceQuality,'UNOBSERVED');
  assert.equal(account.flowCoverage,'INCOMPLETE_LEGACY');
  assert.equal(account.reconciliationStatus,'PARTIAL');
});

test('a late turn-one session-created event cannot retroactively certify an opening after play advances',async()=>{
  const {context,state}=createRuntime({emitGameSessionCreated:false});
  state.simulation.turn=2;
  state.simulation.session.createdTurn=1;
  state.simulation.session.lastCommittedTurn=2;
  state.simulation.session.status='READY';
  // Re-deliver the old creation payload after the second committed turn.
  context.dispatchEvent(new context.CustomEvent('OMEGA_GAME_SESSION_CREATED',{
    detail:{session:{
      sessionId:state.simulation.session.sessionId,
      playerCountryId:'BGD',status:'READY',createdTurn:1,lastCommittedTurn:1
    }}
  }));
  await context.OmegaFinanceMinistry.init();
  const account=context.OmegaFinanceMinistry.getFinanceState('BGD').fiscalPeriodAccount;
  assert.equal(account.openingBalanceUsd,null);
  assert.equal(account.openingBalanceSource,'LEGACY_OPENING_NOT_RECORDED');
  assert.equal(account.openingBalanceQuality,'UNOBSERVED');
  assert.equal(account.flowCoverage,'INCOMPLETE_LEGACY');
  assert.equal(account.reconciliationStatus,'PARTIAL');
});

test('low turn without a verified game-session-created event remains PARTIAL and UNOBSERVED',async()=>{
  const {context,state}=createRuntime({emitGameSessionCreated:false});
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const fm=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.equal(fm.fiscalPeriodAccount.openingBalanceUsd,null);
  assert.equal(fm.fiscalPeriodAccount.openingBalanceSource,'LEGACY_OPENING_NOT_RECORDED');
  assert.equal(fm.fiscalPeriodAccount.openingBalanceQuality,'UNOBSERVED');
  assert.equal(fm.fiscalPeriodAccount.flowCoverage,'INCOMPLETE_LEGACY');
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'PARTIAL');
});

test('new-game estimated opening cash stays explicitly MODELLED, not observed',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  delete state.finance.BGD.available;
  delete state.economy.BANGLADESH.treasury;
  await context.OmegaFinanceMinistry.init();
  const fm=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.ok(fm.treasuryBalanceUsd>0);
  assert.equal(fm.treasurySource,'GAME_RULE_ESTIMATE');
  assert.equal(fm.fiscalPeriodAccount.openingBalanceUsd,fm.treasuryBalanceUsd);
  assert.equal(fm.fiscalPeriodAccount.openingBalanceSource,'GAME_RULE_ESTIMATE');
  assert.equal(fm.fiscalPeriodAccount.openingBalanceQuality,'MODELLED');
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'MODELLED_RECONCILED');
});

test('borrowing is counted once as a Treasury inflow while paired budget transfers remain non-cash reallocation',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const borrow=finance.applyAction({type:'borrow',countryId:'BGD',amountUsd:1000000,description:'Phase 4B fiscal test'});
  assert.equal(borrow.ok,true);
  let fm=finance.getFinanceState('BGD');
  assert.equal(fm.currentYearBorrowingUsd,1000000);
  assert.equal(fm.fiscalPeriodAccount.flowComponents.borrowingProceedsUsd,1000000);
  assert.equal(fm.fiscalPeriodAccount.totalInflowsUsd,1000000);
  assert.equal(fm.fiscalPeriodAccount.totalOutflowsUsd,0);
  const cashBeforeTransfer=fm.treasuryBalanceUsd;
  const inflowsBeforeTransfer=fm.fiscalPeriodAccount.totalInflowsUsd;
  const outflowsBeforeTransfer=fm.fiscalPeriodAccount.totalOutflowsUsd;
  const transfer=finance.applyAction({
    type:'transfer-budget',countryId:'BGD',sourceDepartment:'defense',
    targetDepartment:'interior',amountUsd:100,description:'Internal reallocation only',
    idempotencyKey:'phase4b-no-cash-transfer'
  });
  assert.equal(transfer.ok,true);
  assert.equal(transfer.treasuryCashMoved,false);
  fm=finance.getFinanceState('BGD');
  assert.equal(fm.treasuryBalanceUsd,cashBeforeTransfer);
  assert.equal(fm.fiscalPeriodAccount.totalInflowsUsd,inflowsBeforeTransfer);
  assert.equal(fm.fiscalPeriodAccount.totalOutflowsUsd,outflowsBeforeTransfer);
  assert.equal(state.finance.BGD.available,cashBeforeTransfer);
});

test('Finance cash transaction IDs are idempotent within one country and fiscal period',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const transactionId='PHASE4B-BORROW-IDEMPOTENCY-01';
  const first=finance.applyAction({
    type:'borrow',countryId:'BGD',amountUsd:1000000,transactionId,
    description:'Fiscal-period idempotency regression'
  });
  assert.equal(first.ok,true);
  const firstState=finance.getFinanceState('BGD');
  const firstCash=firstState.treasuryBalanceUsd;
  const firstDebt=state.economy.BANGLADESH.debt;
  const firstRevision=firstState.revision;
  assert.equal(firstState.currentYearBorrowingUsd,1000000);
  assert.equal(firstState.fiscalPeriodAccount.flowComponents.borrowingProceedsUsd,1000000);

  const duplicate=finance.applyAction({
    type:'borrow',countryId:'BGD',amountUsd:1000000,transactionId,
    description:'Replayed identical transaction'
  });
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.transactionId,first.transactionId);
  let after=finance.getFinanceState('BGD');
  assert.equal(after.treasuryBalanceUsd,firstCash);
  assert.equal(state.economy.BANGLADESH.debt,firstDebt);
  assert.equal(after.currentYearBorrowingUsd,1000000);
  assert.equal(after.revision,firstRevision);

  const conflict=finance.applyAction({
    type:'borrow',countryId:'BGD',amountUsd:2000000,transactionId,
    description:'Same ID with a different principal'
  });
  assert.equal(conflict.ok,false);
  assert.equal(conflict.code,'FINANCE_TRANSACTION_IDEMPOTENCY_CONFLICT');
  after=finance.getFinanceState('BGD');
  assert.equal(after.treasuryBalanceUsd,firstCash);
  assert.equal(state.economy.BANGLADESH.debt,firstDebt);

  state.simulation.turn=365;
  const rollover=finance.advanceCountry('BGD',{
    turn:365,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(rollover.processed,1);
  after=finance.getFinanceState('BGD');
  assert.equal(after.fiscalPeriodAccount.periodIndex,1);
  const nextPeriod=finance.applyAction({
    type:'borrow',countryId:'BGD',amountUsd:1000000,transactionId,
    description:'Same canonical ID in the next fiscal period'
  });
  assert.equal(nextPeriod.ok,true);
  assert.notEqual(nextPeriod.duplicate,true);
  after=finance.getFinanceState('BGD');
  assert.equal(after.currentYearBorrowingUsd,1000000);
  assert.equal(after.fiscalPeriodAccount.flowComponents.borrowingProceedsUsd,1000000);
});

test('expense and authorized rollback update the same fiscal cash-flow aggregate exactly once',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const opening=finance.getFinanceState('BGD').treasuryBalanceUsd;
  const expense=finance.applyAction({
    type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:1000,
    spendType:'purchase',description:'OMEGA_HOME_BUDGET:phase4b-rollback-test'
  });
  assert.equal(expense.ok,true);
  let fm=finance.getFinanceState('BGD');
  assert.equal(fm.currentYearSpendingUsd,1000);
  assert.equal(fm.fiscalPeriodAccount.totalOutflowsUsd,1000);
  assert.equal(fm.treasuryBalanceUsd,opening-1000);
  const rollback=finance.applyAction({
    type:'rollback-home-ministry-expense',countryId:'BGD',transactionId:expense.transactionId
  });
  assert.equal(rollback.ok,true);
  fm=finance.getFinanceState('BGD');
  assert.equal(fm.currentYearSpendingUsd,0);
  assert.equal(fm.fiscalPeriodAccount.totalOutflowsUsd,0);
  assert.equal(fm.treasuryBalanceUsd,opening);
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
  const duplicate=finance.applyAction({
    type:'rollback-home-ministry-expense',countryId:'BGD',transactionId:expense.transactionId
  });
  assert.equal(duplicate.ok,false);
});

test('World Bank debt service posts one cash outflow but reduces debt by principal only',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const debtBefore=state.economy.BANGLADESH.debt;
  const cashBefore=finance.getFinanceState('BGD').treasuryBalanceUsd;
  const transactionId='WB-DEBT-SERVICE-BGD-TEST-1';
  const result=finance.applyAction({
    type:'world-bank-debt-service',countryId:'BGD',authorization:'OMEGA_WORLD_BANK_LENDING',
    amountUsd:100,principalPaidUsd:80,interestPaidUsd:20,transactionId,
    description:'Principal and interest split'
  });
  assert.equal(result.ok,true);
  const fm=finance.getFinanceState('BGD');
  assert.equal(state.economy.BANGLADESH.debt,debtBefore-80);
  assert.equal(fm.treasuryBalanceUsd,cashBefore-100);
  assert.equal(fm.currentYearDebtPrincipalRepaymentUsd,80);
  assert.equal(fm.currentYearInterestUsd,20);
  assert.equal(fm.fiscalPeriodAccount.totalOutflowsUsd,100);
  assert.equal(fm.fiscalPeriodAccount.flowComponents.principalRepaymentUsd,80);
  assert.equal(fm.fiscalPeriodAccount.flowComponents.interestPaidUsd,20);
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');

  const duplicate=finance.applyAction({
    type:'world-bank-debt-service',countryId:'BGD',authorization:'OMEGA_WORLD_BANK_LENDING',
    amountUsd:100,principalPaidUsd:80,interestPaidUsd:20,transactionId,
    description:'Replayed World Bank settlement'
  });
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.transactionId,result.transactionId);
  const afterDuplicate=finance.getFinanceState('BGD');
  assert.equal(state.economy.BANGLADESH.debt,debtBefore-80);
  assert.equal(afterDuplicate.treasuryBalanceUsd,cashBefore-100);
  assert.equal(afterDuplicate.currentYearDebtPrincipalRepaymentUsd,80);
  assert.equal(afterDuplicate.currentYearInterestUsd,20);
  assert.equal(afterDuplicate.fiscalPeriodAccount.totalOutflowsUsd,100);
});

test('external Treasury cash deltas are recorded once and never inferred from the bounded Finance ledger',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const opening=finance.getFinanceState('BGD').treasuryBalanceUsd;
  state.finance.BGD.available=opening+75;
  let fm=finance.getFinanceState('BGD');
  assert.equal(fm.currentYearExternalInflowUsd,75);
  assert.equal(fm.fiscalPeriodAccount.flowComponents.externalCreditsUsd,75);
  assert.equal(fm.fiscalPeriodAccount.totalInflowsUsd,75);
  assert.equal(fm.treasuryBalanceUsd,opening+75);
  fm=finance.getFinanceState('BGD');
  assert.equal(fm.currentYearExternalInflowUsd,75);
  assert.equal(fm.fiscalPeriodAccount.totalInflowsUsd,75);
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
});

test('fiscal rollover archives the old closing balance and opens the next period before tax and interest accrue',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  assert.equal(finance.applyAction({type:'borrow',countryId:'BGD',amountUsd:1000000}).ok,true);
  const beforeRollover=finance.getFinanceState('BGD');
  const expectedNewOpening=beforeRollover.treasuryBalanceUsd;
  state.simulation.turn=365;
  const result=finance.advanceCountry('BGD',{
    turn:365,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(result.processed,1);
  const after=finance.getFinanceState('BGD');
  assert.equal(after.fiscalPeriodHistory.length,1);
  assert.equal(after.fiscalPeriodHistory[0].periodIndex,0);
  assert.equal(after.fiscalPeriodHistory[0].closingBalanceUsd,expectedNewOpening);
  assert.equal(after.fiscalPeriodHistory[0].reconciliationStatus,'GAME_STATE_RECONCILED');
  assert.equal(after.fiscalPeriodAccount.periodIndex,1);
  assert.equal(after.fiscalPeriodAccount.openingTurn,365);
  assert.equal(after.fiscalPeriodAccount.openingBalanceUsd,expectedNewOpening);
  assert.equal(after.fiscalPeriodAccount.openingBalanceSource,'PREVIOUS_PERIOD_FINANCE_CLOSING');
  assert.equal(after.currentYearBorrowingUsd,0);
  assert.ok(after.currentYearTaxRevenueUsd>0);
  assert.equal(after.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
});

test('scheduler fiscal rollover uses its committed step duration over a stale UI clock',async()=>{
  const {context,state}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const before=finance.getFinanceState('BGD');
  const priorClosing=before.treasuryBalanceUsd;
  // Simulate a stale/hourly UI clock while the scheduler commits a daily turn.
  context.Omega.Simulation.clock.stepDurationMs=3600000;
  state.finance.BGD.available=priorClosing+25;
  state.simulation.turn=365;
  const result=finance.advanceCountry('BGD',{
    turn:365,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(result.processed,1);
  const after=finance.getFinanceState('BGD');
  assert.equal(after.fiscalPeriodHistory.length,1,
    'the committed daily turn, not the stale hourly read clock, crosses the fiscal boundary');
  assert.equal(after.fiscalPeriodHistory[0].closingBalanceUsd,priorClosing);
  assert.equal(after.fiscalPeriodAccount.periodIndex,1);
  assert.equal(after.fiscalPeriodAccount.openingBalanceUsd,priorClosing);
  assert.equal(after.fiscalPeriodAccount.flowComponents.externalCreditsUsd,25);
  assert.equal(after.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
  const external=after.ledger.filter(row=>row.action==='EXTERNAL_TREASURY_CREDIT').at(-1);
  assert.equal(external.turn,365,
    'the external cash ledger entry records the scheduler committed turn');
});

test('external Treasury delta on fiscal rollover belongs to the newly opened period exactly once',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const before=finance.getFinanceState('BGD');
  const priorClosing=before.treasuryBalanceUsd;
  state.finance.BGD.available=priorClosing+75;
  state.simulation.turn=365;
  let after=finance.getFinanceState('BGD');
  const previous=after.fiscalPeriodHistory[0];
  assert.equal(previous.periodIndex,0);
  assert.equal(previous.closingBalanceUsd,priorClosing,
    'the old period must close at the pre-reconciliation authoritative balance');
  assert.equal(previous.flowComponents.externalCreditsUsd,0,
    'the boundary cash delta must not be attributed to the previous period');
  assert.equal(after.fiscalPeriodAccount.periodIndex,1);
  assert.equal(after.fiscalPeriodAccount.openingBalanceUsd,priorClosing,
    'the new period opens from the carried pre-delta closing balance');
  assert.equal(after.fiscalPeriodAccount.openingBalanceSource,'PREVIOUS_PERIOD_FINANCE_CLOSING');
  assert.equal(after.currentYearExternalInflowUsd,75);
  assert.equal(after.fiscalPeriodAccount.flowComponents.externalCreditsUsd,75);
  assert.ok(after.fiscalPeriodAccount.totalInflowsUsd>=75);
  assert.equal(after.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
  assert.equal(after.lastSyncedTreasuryBalanceUsd,priorClosing+75);
  const result=finance.advanceCountry('BGD',{
    turn:365,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(result.processed,1);
  after=finance.getFinanceState('BGD');
  assert.equal(after.currentYearExternalInflowUsd,75,
    'the scheduler must not replay a cash delta already reconciled by a dashboard read');
  assert.equal(after.fiscalPeriodAccount.flowComponents.externalCreditsUsd,75);
  assert.equal(after.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
  const duplicate=finance.advanceCountry('BGD',{
    turn:365,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(duplicate.processed,0);
  assert.equal(duplicate.duplicate,true);
  after=finance.getFinanceState('BGD');
  assert.equal(after.currentYearExternalInflowUsd,75,
    'replaying the boundary turn must not duplicate its external cash delta');
  assert.equal(after.fiscalPeriodAccount.flowComponents.externalCreditsUsd,75);
  assert.equal(after.fiscalPeriodHistory.length,1,
    'replaying the same turn must not archive the period twice');
});

test('legacy Finance saves stay PARTIAL until the next trustworthy fiscal-year boundary',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=10;
  state.finance.BGD.omegaFinance={
    version:'1.1.0',countryCode:'BGD',countryName:'Bangladesh',
    treasuryBalanceUsd:4000000000,treasurySource:'EXISTING_RUNTIME_FINANCE_AVAILABLE',
    lastSyncedTreasuryBalanceUsd:4000000000,fiscalYearIndex:0,lastProcessedTurn:9,
    currentYearTaxRevenueUsd:1200,currentYearSpendingUsd:500,currentYearInterestUsd:50,
    currentYearDebtPrincipalRepaymentUsd:0,currentYearExternalInflowUsd:0,currentYearExternalOutflowUsd:0,
    cumulativeRevenueUsd:1200,cumulativeSpendingUsd:500,cumulativeInterestUsd:50,
    ledger:[{transactionId:'LEGACY-1',turn:9,action:'EXPENSE',amountUsd:500}]
  };
  await context.OmegaFinanceMinistry.init();
  let fm=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.equal(fm.fiscalPeriodAccount.openingBalanceUsd,null);
  assert.equal(fm.fiscalPeriodAccount.openingBalanceSource,'LEGACY_OPENING_NOT_RECORDED');
  assert.equal(fm.fiscalPeriodAccount.flowCoverage,'INCOMPLETE_LEGACY');
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'PARTIAL');
  const closingBeforeRollover=fm.treasuryBalanceUsd;
  state.simulation.turn=365;
  const result=context.OmegaFinanceMinistry.advanceCountry('BGD',{
    turn:365,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(result.processed,1);
  fm=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.equal(fm.fiscalPeriodHistory[0].reconciliationStatus,'PARTIAL');
  assert.equal(fm.fiscalPeriodAccount.openingTurn,365);
  assert.equal(fm.fiscalPeriodAccount.openingBalanceUsd,closingBeforeRollover);
  assert.equal(fm.fiscalPeriodAccount.flowCoverage,'COMPLETE_FROM_PERIOD_START');
  assert.equal(fm.fiscalPeriodAccount.reconciliationStatus,'GAME_STATE_RECONCILED');
});

test('Finance version migration preserves the prior country checkpoint turn and prevents duplicate accrual',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=9;
  state.finance.BGD.omegaFinance={
    version:'1.1.0',countryCode:'BGD',countryName:'Bangladesh',
    treasuryBalanceUsd:4000000000,treasurySource:'EXISTING_RUNTIME_FINANCE_AVAILABLE',
    lastSyncedTreasuryBalanceUsd:4000000000,initializedTurn:1,lastProcessedTurn:9,
    fiscalYearIndex:0,currentYearTaxRevenueUsd:1000,currentYearSpendingUsd:0,
    currentYearInterestUsd:0,currentYearDebtPrincipalRepaymentUsd:0,
    currentYearExternalInflowUsd:0,currentYearExternalOutflowUsd:0,
    cumulativeRevenueUsd:1000,cumulativeSpendingUsd:0,cumulativeInterestUsd:0,ledger:[]
  };
  await context.OmegaFinanceMinistry.init();
  const before=state.finance.BGD.omegaFinance.treasuryBalanceUsd;
  const migrated=context.OmegaFinanceMinistry.getFinanceState('BGD');
  assert.equal(migrated.lastProcessedTurn,9);
  assert.equal(migrated.fiscalPeriodAccount.flowCoverage,'INCOMPLETE_LEGACY');
  const result=context.OmegaFinanceMinistry.advanceCountry('BGD',{
    turn:9,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
  });
  assert.equal(result.processed,0);
  assert.equal(result.duplicate,true);
  assert.equal(state.finance.BGD.omegaFinance.treasuryBalanceUsd,before,
    'migrating Finance schema must not replay tax or interest on an already committed game turn');
});

test('Fiscal period history remains capped at twelve periods',async()=>{
  const {context,state}=createRuntime();
  state.simulation.turn=0;
  await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  for(let period=1;period<=14;period++){
    const turn=365*period;
    state.simulation.turn=turn;
    const result=finance.advanceCountry('BGD',{
      turn,stepDurationMs:86400000,tier:'PLAYER',playerCountryId:'BGD'
    });
    assert.equal(result.processed,1);
  }
  const fm=finance.getFinanceState('BGD');
  assert.equal(fm.fiscalPeriodAccount.periodIndex,14);
  assert.equal(fm.fiscalPeriodHistory.length,12);
  assert.equal(fm.fiscalPeriodHistory[0].periodIndex,2);
});

test('Phase 5 records balanced Government cash postings inside the existing Finance source ledger',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const request={type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:1234.56,
    spendType:'purchase',description:'Phase 5 government journal fixture',idempotencyKey:'phase5-government-expense-001'};
  const posted=finance.applyAction(request);
  assert.equal(posted.ok,true);
  const state=finance.getFinanceState('BGD');
  const source=state.ledger.find(row=>row.transactionId===posted.transactionId);
  assert.ok(source,'the existing Finance transaction remains the source record');
  const journal=source.sectorJournalV1;
  assert.equal(journal.status,'POSTED');
  assert.equal(journal.sectorId,'government');
  assert.equal(journal.sourceAuthority,'OMEGA_FINANCE_MINISTRY');
  assert.equal(journal.currency,'USD');
  assert.equal(journal.countryCode,'BGD');
  assert.equal(journal.sourceTransactionId,source.transactionId);
  assert.equal(journal.counterEntryComplete,true);
  assert.equal(journal.debitTotalMinor,123456);
  assert.equal(journal.creditTotalMinor,123456);
  assert.deepEqual(journal.lines.map(line=>[line.side,line.accountId,line.amountMinor]),[
    ['DEBIT','GOVERNMENT:EXPENSE:interior:purchase',123456],
    ['CREDIT','GOVERNMENT:TREASURY_CASH',123456]
  ]);

  const duplicate=finance.applyAction(request);
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true);
  const afterDuplicate=finance.getFinanceState('BGD');
  assert.equal(afterDuplicate.ledger.filter(row=>row.transactionId===posted.transactionId).length,1,
    'Finance idempotency must prevent a second source transaction and journal');

  const sourceAllocation=afterDuplicate.allocations.defense;
  const targetAllocation=afterDuplicate.allocations.interior;
  assert.ok(sourceAllocation&&targetAllocation);
  const transfer=finance.applyAction({type:'transfer-budget',countryId:'BGD',sourceDepartment:'defense',
    targetDepartment:'interior',amountUsd:10,description:'Non-cash budget reallocation',
    idempotencyKey:'phase5-government-budget-transfer-001'});
  assert.equal(transfer.ok,true);
  const transferRows=finance.getFinanceState('BGD').ledger.filter(row=>row.transferId===transfer.transferId);
  assert.equal(transferRows.length,2);
  assert.ok(transferRows.every(row=>!row.sectorJournalV1),
    'budget authority transfers do not move Treasury cash and must not enter the cash journal');
});

test('Phase 5 reversals, borrowing, repayment and World Bank debt service use correct counter-entries',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  const spend=finance.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:250,
    spendType:'maintenance',description:'OMEGA_HOME_BUDGET:PHASE5_REVERSAL_FIXTURE'});
  assert.equal(spend.ok,true);
  const rollback=finance.applyAction({type:'rollback-home-ministry-expense',countryId:'BGD',
    transactionId:spend.transactionId});
  assert.equal(rollback.ok,true);
  let ledger=finance.getFinanceState('BGD').ledger;
  const reversal=ledger.find(row=>row.transactionId===rollback.transactionId);
  assert.equal(reversal.sectorJournalV1.status,'POSTED');
  assert.deepEqual(reversal.sectorJournalV1.lines.map(line=>[line.side,line.accountId,line.amountMinor]),[
    ['DEBIT','GOVERNMENT:TREASURY_CASH',25000],
    ['CREDIT','GOVERNMENT:EXPENSE:interior:maintenance',25000]
  ]);
  assert.equal(reversal.sectorJournalV1.referenceTransactionId,spend.transactionId);

  const borrowing=finance.applyAction({type:'borrow',countryId:'BGD',amountUsd:100000,
    description:'Phase 5 sovereign borrowing fixture'});
  assert.equal(borrowing.ok,true);
  ledger=finance.getFinanceState('BGD').ledger;
  const borrowRow=ledger.find(row=>row.action==='BORROW'&&row.description==='Phase 5 sovereign borrowing fixture');
  assert.equal(borrowRow.sectorJournalV1.status,'POSTED');
  assert.deepEqual(borrowRow.sectorJournalV1.lines.map(line=>[line.side,line.accountId,line.amountMinor]),[
    ['DEBIT','GOVERNMENT:TREASURY_CASH',10000000],
    ['CREDIT','GOVERNMENT:PUBLIC_DEBT',10000000]
  ]);

  const repayment=finance.applyAction({type:'repay-debt',countryId:'BGD',amountUsd:1000,
    description:'Phase 5 principal repayment fixture'});
  assert.equal(repayment.ok,true);
  ledger=finance.getFinanceState('BGD').ledger;
  const repaymentRow=ledger.find(row=>row.action==='DEBT_REPAYMENT'&&row.description==='Phase 5 principal repayment fixture');
  assert.equal(repaymentRow.sectorJournalV1.status,'POSTED');
  assert.deepEqual(repaymentRow.sectorJournalV1.lines.map(line=>[line.side,line.accountId,line.amountMinor]),[
    ['DEBIT','GOVERNMENT:PUBLIC_DEBT',100000],
    ['CREDIT','GOVERNMENT:TREASURY_CASH',100000]
  ]);

  const service=finance.applyAction({type:'world-bank-debt-service',countryId:'BGD',amountUsd:30,
    principalPaidUsd:20,interestPaidUsd:10,authorization:'OMEGA_WORLD_BANK_LENDING'});
  assert.equal(service.ok,true);
  ledger=finance.getFinanceState('BGD').ledger;
  const serviceRow=ledger.find(row=>row.action==='WORLD_BANK_DEBT_SERVICE');
  assert.equal(serviceRow.sectorJournalV1.status,'POSTED');
  assert.equal(serviceRow.sectorJournalV1.debitTotalMinor,3000);
  assert.equal(serviceRow.sectorJournalV1.creditTotalMinor,3000);
  assert.deepEqual(serviceRow.sectorJournalV1.lines.map(line=>[line.side,line.accountId,line.amountMinor]),[
    ['DEBIT','GOVERNMENT:PUBLIC_DEBT',2000],
    ['DEBIT','GOVERNMENT:INTEREST_EXPENSE',1000],
    ['CREDIT','GOVERNMENT:TREASURY_CASH',3000]
  ]);
});

test('Phase 5 Government journal API is read-only, bounded and explicitly partial',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const finance=context.OmegaFinanceMinistry;
  finance.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:75,
    spendType:'general',description:'Phase 5 journal read-only fixture'});
  const before=finance.getFinanceState('BGD').ledger.length;
  const journal=finance.getSectorJournal('BGD');
  assert.equal(journal.status,'PARTIAL');
  assert.equal(journal.complete,false);
  assert.equal(journal.coverage,'BOUNDED_FINANCE_LEDGER_WINDOW');
  assert.ok(journal.sourceLedgerWindow.maximumEntries>0);
  assert.ok(journal.journalTransactionCount>=1);
  assert.ok(journal.excludedFlowClasses.includes('MODELED_TAX_REVENUE_WITHOUT_TRANSACTION_LEVEL_TAXPAYER_COUNTERPARTY'));
  assert.ok(journal.excludedFlowClasses.includes('HOUSEHOLD_AND_FIRM_SECTOR_SOURCES_ARE_NOT_COMPLETE_IN_THIS_SLICE'));
  assert.equal(Object.prototype.hasOwnProperty.call(journal,'totalRevenueUsd'),false,
    'a partial journal must not publish synthetic sector totals');
  const row=journal.transactions.find(item=>item.sourceTransactionType==='EXPENSE');
  assert.ok(row);
  row.journal.lines[0].amountMinor=-1;
  assert.ok(finance.getFinanceState('BGD').ledger.length===before);
  const fresh=finance.getSectorJournal('BGD').transactions.find(item=>item.sourceTransactionType==='EXPENSE');
  assert.ok(fresh.journal.lines[0].amountMinor>0,'the accessor returns defensive copies');
});

