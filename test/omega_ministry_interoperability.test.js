import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const MINISTRY_COUNT=17;
const ACTION_ID='CONCLUDE_TRADE_AGREEMENT_TEST';

function readRepositoryCountries(){
  return JSON.parse(fs.readFileSync(new URL('../countries.json',import.meta.url),'utf8'));
}

function loadBrowserScript(path,sandbox){
  const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  vm.runInNewContext(source,sandbox,{filename:path});
}

function createSandbox(options={}){
  const rows=readRepositoryCountries();
  const countryA=options.countryA||'TST-A';
  const countryB=options.countryB||'TST-B';
  const state=options.state||{
    simulationTurn:1,
    economy:{
      [countryA]:{gdp:100,debt:20,production:80,inflation:4,unemployment:5}
    },
    finance:{
      [countryA]:{reserves:50,taxRevenue:40,spending:30,budget:70}
    },
    foreign:{
      [countryA]:{
        relations:{[countryB]:55},
        treaties:{[countryB]:{status:'NOT_CONCLUDED'}},
        sanctions:{[countryB]:0},
        negotiations:{[countryB]:{status:'OPEN'}}
      }
    },
    trade:{
      [countryA]:{relations:{[countryB]:55},balance:5,exports:20,imports:15}
    },
    transport:{
      [countryA]:{logistics:80,infrastructure:{roads:70},ports:2,rail:1}
    },
    intelligence:{
      [countryA]:{threats:{[countryB]:10},state:{coverage:75},cyber:{readiness:60}}
    },
    defense:{[countryA]:{procurement:{queue:2},readiness:78}},
    military:{[countryA]:{combat:{active:false},readiness:75,forceStructure:{army:1},logistics:{score:70}}},
    interior:{[countryA]:{stability:75,corruption:25,security:80}},
    resource:{[countryA]:{inventory:{oil:10}}},
    health:{[countryA]:{state:{coverage:80},welfare:{coverage:75},hospitals:100}},
    education:{[countryA]:{state:{literacy:80},research:{programs:5},enrollment:70}},
    technology:{[countryA]:{research:{programs:5},innovation:{index:60},patents:12,rnd:10}},
    projects:{[countryA]:{registry:{p1:{status:'active'},p2:{status:'planned'}},legal:{clearance:true}}},
    culture:{[countryA]:{state:{cohesion:70},media:{reach:80},social:{cohesion:65}}},
    statistics:{[countryA]:{observations:{sampleSize:100}}},
    population:{[countryA]:{total:100000000}}
  };

  const listeners=new Map();
  const sandbox={
    console,
    Date,JSON,Object,Number,String,RegExp,Map,Set,WeakMap,Array,Math,Promise,
    URL,Intl,Error,TypeError,EventTarget,
    setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},
    performance:{now:()=>0},
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;},
    addEventListener(type,fn){const set=listeners.get(type)||new Set();set.add(fn);listeners.set(type,set);},
    gameState:state,
    Game:{state,countryId:countryA,currentActiveCountry:countryA},
    OmegaCabinetUI:{activeCountry:countryA,ministersDB:{}},
    OmegaMinistersDB:{},
    ResourceMinistryEngine:{
      deposits:[],
      getIntegratedResourceState:(countryId)=>state.resource?.[countryId]?{inventory:state.resource[countryId].inventory||{}}:null
    }
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.Omega={};

  loadBrowserScript('omega_ministry_registry.js',sandbox);
  loadBrowserScript('omega_ministry_knowledge_contract.js',sandbox);
  loadBrowserScript('omega_authoritative_state_authority.js',sandbox);
  loadBrowserScript('omega_ministry_state_provider.js',sandbox);
  sandbox.Omega.MinistryStateProvider.instance=sandbox.Omega.MinistryStateProvider.create({
    stateSource:state,
    countryRows:rows
  });
  loadBrowserScript('omega_ministry_information_policy.js',sandbox);
  loadBrowserScript('omega_ministry_decision_framework.js',sandbox);
  loadBrowserScript('omega_ministry_state_transaction.js',sandbox);
  loadBrowserScript('omega_kernel.js',sandbox);
  loadBrowserScript('omega_ministry_domain_engines.js',sandbox);
  loadBrowserScript('omega_ministry_interoperability_system.js',sandbox);
  loadBrowserScript('omega_ministry_runtime_v1.js',sandbox);

  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  const mesh=sandbox.Omega.MinistryInteroperability;
  const kernel=sandbox.Omega.Kernel;
  runtime.init(kernel);

  const store={countryId:countryA,policies:new Map(),decisions:new Map()};
  const blackboard={writeAtomic(){}};
  const ids=sandbox.OmegaMinistryRegistry.ids.slice();

  function tick(id,turn=state.simulationTurn){
    state.simulationTurn=turn;
    sandbox.Game.currentActiveCountry=countryA;
    sandbox.OmegaCabinetUI.activeCountry=countryA;
    return runtime.tick(id,16.7,turn,store,blackboard);
  }

  function tickAll(turn=state.simulationTurn){
    return ids.map(id=>tick(id,turn));
  }

  function registerTradeAction(){
    mesh.registerAction(ACTION_ID,{
      stateOwnerMinistry:'foreign',
      requirements:[
        {id:'foreign.relations',ministryId:'foreign',path:'foreign.relations',entityScoped:true,entityId:countryB},
        {id:'foreign.treaties',ministryId:'foreign',path:'foreign.treaties',entityScoped:true,entityId:countryB},
        {id:'foreign.sanctions',ministryId:'foreign',path:'foreign.sanctions',entityScoped:true,entityId:countryB},
        {id:'economy.production',ministryId:'economy',path:'economy.production'},
        {id:'finance.reserves',ministryId:'finance',path:'finance.reserves'},
        {id:'transport.logistics',ministryId:'transport',path:'transport.logistics'},
        {id:'intelligence.threats',ministryId:'intelligence',path:'intelligence.threats',entityScoped:true,entityId:countryB},
        {id:'trade.balance',ministryId:'trade',path:'trade.balance'}
      ],
      blockingConditions:[
        {fact:'foreign.sanctions',operator:'GT',value:0}
      ],
      warningConditions:[
        {fact:'trade.balance',operator:'LT',value:0}
      ],
      affectedMinistries:['foreign','economy','finance','transport','intelligence'],
      affectedStateDomains:['foreign','trade','economy','finance'],
      approvalRequirements:['foreign.authority'],
      expectedOutputs:['trade.agreement.command'],
      downstreamEffects:[
        'FOREIGN_TREATY_STATE',
        'TRADE_BALANCE',
        'FISCAL_CONDITION',
        'TRANSPORT_CAPACITY'
      ]
    });
    mesh.registerAuthorityPolicy(ACTION_ID,{
      proposerMinistries:['trade'],
      approverMinistries:['trade'],
      reviewRequired:false
    });
  }

  return {sandbox,rows,countryA,countryB,state,ids,runtime,mesh,kernel,store,blackboard,tick,tickAll,registerTradeAction};
}

test('A+B: registry and 17 independent engines are authoritative',()=>{
  const s=createSandbox();
  assert.equal(s.ids.length,MINISTRY_COUNT);
  assert.equal(new Set(s.ids).size,MINISTRY_COUNT);
  const health=s.runtime.health();
  assert.equal(health.independent,MINISTRY_COUNT);
  assert.equal(health.uniqueInstances,MINISTRY_COUNT);
  assert.equal(health.engineRegistryHealthy,true);
});

test('C+D: every route transports and target engines actually process packets',()=>{
  const s=createSandbox();
  const turn=1;
  for(const source of s.ids){
    const port=s.mesh.createPort(source,s.countryA);
    for(const target of s.ids)port.send(target,'mesh.probe',{probe:true},{
      messageType:'STATE_UPDATE',turn,countryId:s.countryA
    });
  }
  for(const id of s.ids)s.tick(id,turn);
  for(const source of s.ids){
    for(const target of s.ids){
      const route=s.mesh.getConnection(source,target);
      assert.equal(route.messagesSent,1,source+'->'+target+' sent');
      assert.equal(route.messagesDelivered,1,source+'->'+target+' delivered');
      assert.equal(route.messagesAccepted,1,source+'->'+target+' accepted');
      const engine=s.sandbox.OmegaMinistryDomainEngines.get(target);
      assert.equal(engine.getCoordinationState(s.countryA).processedCount>=1,true);
    }
  }
});

test('E+F: duplicate, invalid and expired messages are rejected safely',()=>{
  const s=createSandbox();
  const msg=s.mesh.send('finance','trade','duplicate.test',{value:1},{countryId:s.countryA,turn:1,messageId:'DUPLICATE-1'});
  const first=s.mesh.acceptMessage(s.countryA,'trade',msg,1);
  assert.equal(first.ok,true,JSON.stringify(first));
  const duplicate=s.mesh.acceptMessage(s.countryA,'trade',msg,1);
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true);

  const malformedSource={...msg,sourceMinistryId:'intruder',source:'intruder'};
  const rejectedSource=s.mesh.acceptMessage(s.countryA,'trade',malformedSource,1);
  assert.equal(rejectedSource.ok,false);
  assert.equal(rejectedSource.status,'REJECTED');

  const malformedTarget={...msg,targetMinistryId:'cabinet',target:'cabinet'};
  const rejectedTarget=s.mesh.acceptMessage(s.countryA,'trade',malformedTarget,1);
  assert.equal(rejectedTarget.ok,false);
  assert.equal(rejectedTarget.status,'REJECTED');

  const expired=s.mesh.send('finance','trade','expiry.test',{value:1},{countryId:s.countryA,turn:1,expiryTurn:1});
  s.mesh.advanceTurn(2);
  const expiredResult=s.mesh.acceptMessage(s.countryA,'trade',expired,2);
  assert.equal(expiredResult.ok,false);
  assert.equal(expiredResult.status,'EXPIRED');

  const acknowledged=s.mesh.send('finance','trade','ack.test',{value:1},{countryId:s.countryA,turn:3});
  const ack=s.mesh.acknowledge('trade',acknowledged,{countryId:s.countryA,turn:3});
  assert.equal(ack.messageType,'ACK');
  assert.equal(ack.correlationId,acknowledged.messageId);
});

test('G: request/response lifecycle remains correlated and durable',()=>{
  const s=createSandbox();
  const request=s.mesh.request('finance','trade','trade.context.request',{
    requestedFacts:['trade.balance']
  },{countryId:s.countryA,turn:1,expiryTurn:4});
  const delivered=s.mesh.getRequest(request.correlationId);
  assert.equal(delivered.status,'DELIVERED');
  s.runtime.handleMessage('trade',request);
  assert.equal(s.mesh.getRequest(request.correlationId).status,'PROCESSING');
  const response=s.mesh.reply('trade',request,'trade.context.response',{
    tradeBalanceObserved:true
  },{countryId:s.countryA,turn:2});
  assert.equal(response.correlationId,request.correlationId);
  assert.equal(s.mesh.getRequest(request.correlationId).status,'RESPONDED');
});

test('H+16: budget requests remain requests, not invented requirements, and appear in government ledger',()=>{
  const s=createSandbox();
  s.mesh.recordBudgetRequest('education',{
    requestedAmount:500,
    requiredAmount:null,
    fundingGap:null,
    priority:'HIGH',
    urgency:'HIGH',
    purpose:'future-capacity'
  },{countryId:s.countryA,turn:2,target:'finance'});
  const financeBriefing=s.mesh.getMinistryBriefing('finance',s.countryA,{currentTurn:2});
  const cabinetBriefing=s.mesh.getMinistryBriefing('cabinet',s.countryA,{currentTurn:2});
  const row=financeBriefing.governmentLedger.budgetRequests.find(x=>x.sourceMinistryId==='education');
  assert.ok(row);
  assert.equal(row.requestedAmount,500);
  assert.equal(row.requiredAmount,null);
  assert.equal(row.fundingGap,null);
  assert.ok(cabinetBriefing.governmentLedger.budgetRequests.some(x=>x.sourceMinistryId==='education'));
});

test('I+17: project signal is visible without treating missing fields as zero',()=>{
  const s=createSandbox();
  s.mesh.publishProjectStatus('projects',{
    projectId:'PROJECT-1',
    status:'BLOCKED',
    phase:'PLANNING',
    cost:null,
    committedFunding:null,
    blockers:['approval']
  },{countryId:s.countryA,turn:2});
  const trade=s.mesh.getMinistryBriefing('trade',s.countryA,{currentTurn:2});
  const project=s.mesh.getMinistryBriefing('cabinet',s.countryA,{currentTurn:2}).governmentLedger.projects.find(x=>x.projectId==='PROJECT-1');
  assert.ok(project);
  assert.equal(project.cost,null);
  assert.equal(project.committedFunding,null);
  assert.ok(trade.governmentLedger.projects.some(x=>x.projectId==='PROJECT-1'));
});

test('J: missing data remains explicit and never becomes zero',()=>{
  const s=createSandbox();
  delete s.state.finance[s.countryA].reserves;
  delete s.state.projects[s.countryA].registry;
  s.tick('finance',3);
  s.tick('projects',3);
  const finance=s.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:3});
  const projects=s.mesh.getPeerState('trade','projects',s.countryA,{currentTurn:3});
  assert.equal(finance.publishedFacts['finance.reserves'].value,null);
  assert.equal(finance.publishedFacts['finance.reserves'].availability,'UNOBSERVED');
  assert.notEqual(finance.publishedFacts['finance.reserves'].value,0);
  assert.equal(projects.projects.knownCount,null);
  assert.ok(['UNAVAILABLE','UNOBSERVED'].includes(projects.publishedFacts['projects.registry'].availability));
});

test('K+11: stale state is explicitly marked stale',()=>{
  const s=createSandbox();
  s.tick('finance',1);
  const stale=s.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:3});
  assert.equal(stale.publishedFacts['finance.reserves'].availability,'STALE');
  assert.equal(stale.freshness.status,'STALE');
});

test('L+M+N: Trade receives separate Foreign facts and permitted cross-ministry evidence',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.registerTradeAction();
  const context=s.mesh.getMinistryBriefing('trade',s.countryA,{currentTurn:1});
  assert.equal(context.peerStates.foreign.publishedFacts['foreign.relations'].value[s.countryB],55);
  assert.equal(
    context.peerStates.foreign.publishedFacts['foreign.treaties'].value[s.countryB].status,
    'NOT_CONCLUDED'
  );
  assert.equal(context.peerStates.foreign.publishedFacts['foreign.sanctions'].value[s.countryB],0);
  assert.equal(context.peerStates.intelligence.publishedFacts['intelligence.sources'].access.granted,false);
  const decision=s.mesh.evaluateAction('trade',ACTION_ID,{countryId:s.countryA,currentTurn:1});
  assert.equal(decision.status,'OBSERVED');
  assert.equal(decision.missing.length,0);
  assert.equal(decision.blockers.length,0);
  assert.equal(decision.evidence.length,8);
});

test('O: country A and country B state remain isolated',()=>{
  const s=createSandbox({
    countryA:'AA',
    countryB:'BB',
    state:{
      simulationTurn:1,
      finance:{
        AA:{reserves:10},
        BB:{reserves:900}
      }
    }
  });
  s.tick('finance',1);
  const originalCountry=s.store.countryId;
  s.store.countryId='BB';
  s.sandbox.Game.currentActiveCountry='BB';
  s.sandbox.OmegaCabinetUI.activeCountry='BB';
  s.runtime.tick('finance',16.7,1,s.store,s.blackboard);
  s.store.countryId=originalCountry;
  const a=s.mesh.getPeerState('trade','finance','AA',{currentTurn:1});
  const b=s.mesh.getPeerState('trade','finance','BB',{currentTurn:1});
  assert.equal(a.publishedFacts['finance.reserves'].value,10);
  assert.equal(b.publishedFacts['finance.reserves'].value,900);
  assert.notDeepEqual(a.publishedFacts['finance.reserves'].value,b.publishedFacts['finance.reserves'].value);
});

test('P: ministry cannot directly mutate another ministry private coordination state',()=>{
  const s=createSandbox();
  const finance=s.sandbox.OmegaMinistryDomainEngines.get('finance');
  const economy=s.sandbox.OmegaMinistryDomainEngines.get('economy');
  const before=economy.getCoordinationState(s.countryA).processedCount;
  assert.equal(finance._coordination,undefined);
  assert.equal(economy.getCoordinationState(s.countryA).processedCount,before);
  s.mesh.send('finance','economy','coordination.probe',{x:1},{countryId:s.countryA,turn:1});
  s.runtime.handleMessage('economy',s.mesh.getMinistryInbox(s.countryA,'economy')[0]);
  assert.equal(economy.getCoordinationState(s.countryA).processedCount,before+1);
});

test('U: command -> authoritative owner -> canonical event -> republish -> peer observation',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.registerTradeAction();
  s.mesh.registerCommandHandler(ACTION_ID,'foreign',(command,{stateTransaction,emitEvent})=>{
    if(!stateTransaction)return {accepted:false,reason:'STATE_TRANSACTION_UNAVAILABLE'};
    const target=s.countryB;
    const treaties=stateTransaction.get('foreign.treaties')||{};
    treaties[target]={status:'SIGNED'};
    stateTransaction.set('foreign.treaties',treaties);
    emitEvent('TREATY_SIGNED',{targetCountryId:target,agreementId:'TEST-AGREEMENT-1'});
    return {accepted:true};
  });
  const command=s.mesh.dispatchCommand(
    'trade',ACTION_ID,s.countryA,{targetCountryId:s.countryB},
    {turn:2,commandType:ACTION_ID}
  );
  assert.equal(command.status,'APPLIED');
  assert.equal(command.stateOwnerMinistryId,'foreign');
  assert.equal(command.stateChanged,true);
  assert.equal(command.transaction.changed,true);
  const foreignEvents=[...s.mesh.instance.events.values()].filter(event=>event.eventType==='TREATY_SIGNED');
  assert.ok(foreignEvents.length>=1);
  s.tick('foreign',2);
  const tradeForeign=s.mesh.getPeerState('trade','foreign',s.countryA,{currentTurn:2});
  assert.equal(tradeForeign.publishedFacts['foreign.treaties'].value[s.countryB].status,'SIGNED');
});

test('Q: newly populated data is hot-plugged on the next publication',()=>{
  const s=createSandbox();
  delete s.state.finance[s.countryA].available;
  s.tick('finance',1);
  let first=s.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:1});
  assert.equal(first.publishedFacts['finance.available'].availability,'UNAVAILABLE');
  s.state.finance[s.countryA].available=42;
  s.tick('finance',2);
  const second=s.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:2});
  assert.equal(second.publishedFacts['finance.available'].availability,'AVAILABLE');
  assert.equal(second.publishedFacts['finance.available'].value,42);
});

test('R: save/load restores logically equivalent interoperability state',()=>{
  const s=createSandbox();
  s.tickAll(1);
  const request=s.mesh.request('trade','foreign','foreign.state.request',{targetCountry:s.countryB},{
    countryId:s.countryA,turn:2,expiryTurn:5
  });
  const saved=s.runtime.saveState();
  const restored=createSandbox({state:JSON.parse(JSON.stringify(s.state))});
  restored.runtime.loadState(saved);
  assert.equal(
    JSON.stringify(stripTelemetry(restored.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:1}))),
    JSON.stringify(stripTelemetry(s.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:1})))
  );
  assert.equal(restored.mesh.getRequest(request.correlationId).status,s.mesh.getRequest(request.correlationId).status);
  const restoredCoord=restored.sandbox.OmegaMinistryDomainEngines.get('foreign').getCoordinationState(s.countryA);
  assert.equal(restoredCoord.processedCount,s.sandbox.OmegaMinistryDomainEngines.get('foreign').getCoordinationState(s.countryA).processedCount);
});

test('S: deterministic identifiers, state revisions and decision results do not depend on wall-clock time',()=>{
  const a=createSandbox();
  const b=createSandbox();
  a.tickAll(1);b.tickAll(1);
  a.registerTradeAction();b.registerTradeAction();
  const am=a.mesh.send('trade','foreign','deterministic.test',{v:1},{countryId:a.countryA,turn:2});
  const bm=b.mesh.send('trade','foreign','deterministic.test',{v:1},{countryId:b.countryA,turn:2});
  assert.equal(am.messageId,bm.messageId);
  const ad=a.mesh.evaluateAction('trade',ACTION_ID,{countryId:a.countryA,currentTurn:1});
  const bd=b.mesh.evaluateAction('trade',ACTION_ID,{countryId:b.countryA,currentTurn:1});
  assert.equal(JSON.stringify(stripTelemetry(ad)),JSON.stringify(stripTelemetry(bd)));
});

test('T: actual repository country data crosses the canonical provider -> ministry -> interoperability path',()=>{
  const rows=readRepositoryCountries();
  assert.ok(Array.isArray(rows)&&rows.length>0);
  const first=rows[0];
  const last=rows[rows.length-1];
  const state={
    simulationTurn:1,
    statistics:{[String(first.code).toUpperCase()]:{
      observations:{source:'countries.json'}
    }}
  };
  const s=createSandbox({
    countryA:String(first.code).toUpperCase(),
    countryB:String(last.code).toUpperCase(),
    state
  });
  s.tick('statistics',1);
  const publicState=s.mesh.getPeerState('cabinet','statistics',s.countryA,{currentTurn:1});
  const identity=publicState.publishedFacts['country.identity'];
  assert.equal(identity.availability,'AVAILABLE');
  assert.equal(identity.provenance.sourceType,'CANONICAL_REPOSITORY_DATA');
  assert.equal(identity.value.code||identity.value.id,first.code);
});

test('N2: relationship is not substituted for treaty status',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.registerTradeAction();
  const sourceSnapshot=s.mesh.getPeerState('trade','foreign',s.countryA,{currentTurn:1});
  const altered=JSON.parse(JSON.stringify(sourceSnapshot));
  delete altered.publishedFacts['foreign.treaties'].value[s.countryB];
  const briefing=s.mesh.getMinistryBriefing('trade',s.countryA,{currentTurn:1});
  briefing.peerStates.foreign=altered;
  const framework=s.sandbox.Omega.MinistryDecisionFramework.instance;
  const decision=framework.evaluate({
    ministryId:'trade',
    actionId:ACTION_ID,
    countryId:s.countryA,
    currentTurn:1,
    briefing
  });
  assert.equal(decision.status,'UNKNOWN');
  assert.ok(decision.missing.some(item=>item.requirement?.id==='foreign.treaties'));
});



test('V: country-scoped provider cannot fall back to global domain state',()=>{
  const state={
    simulationTurn:1,
    finance:{
      AA:{reserves:10},
      reserves:999999
    }
  };
  const s=createSandbox({countryA:'AA',countryB:'BB',state});
  s.tick('finance',1);
  const aa=s.mesh.getPeerState('trade','finance','AA',{currentTurn:1});
  assert.equal(aa.publishedFacts['finance.reserves'].value,10);
  assert.equal(aa.publishedFacts['finance.reserves'].availability,'AVAILABLE');

  s.store.countryId='BB';
  s.sandbox.Game.currentActiveCountry='BB';
  s.sandbox.OmegaCabinetUI.activeCountry='BB';
  s.runtime.tick('finance',16.7,1,s.store,s.blackboard);
  const bb=s.mesh.getPeerState('trade','finance','BB',{currentTurn:1});
  assert.equal(bb.publishedFacts['finance.reserves'].value,null);
  assert.equal(bb.publishedFacts['finance.reserves'].availability,'UNAVAILABLE');
});

function stripTelemetry(value){
  if(value===null||value===undefined)return value;
  if(Array.isArray(value))return value.map(stripTelemetry);
  if(typeof value!=='object')return value;
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(k==='timestamp'||k==='publishedAt'||k==='timestampIsTelemetry')continue;
    out[k]=stripTelemetry(v);
  }
  return out;
}

console.log('OMEGA GOVERNMENT INTEROPERABILITY TEST MATRIX READY');
console.log('Tests:',20);
console.log('Canonical ministry count:',MINISTRY_COUNT);


test('T2: actual repository economy data crosses raw JSON -> authoritative state -> provider -> ministry -> interoperability',()=>{
  const economy=JSON.parse(fs.readFileSync(new URL('../economy.json',import.meta.url),'utf8'));
  const ids=Object.keys(economy).filter(Boolean);
  assert.ok(ids.length>0);
  const countryId=String(ids[0]).toUpperCase();
  const state={simulationTurn:1,economy};
  const s=createSandbox({countryA:countryId,countryB:countryId==='AA'?'BB':'AA',state});
  s.tick('economy',1);
  const publicState=s.mesh.getPeerState('cabinet','economy',countryId,{currentTurn:1});
  const fact=publicState.publishedFacts['economy.gdp'];
  assert.equal(fact.availability,'AVAILABLE');
  assert.equal(fact.value,economy[ids[0]].gdp);
  assert.equal(fact.provenance.sourceType,'AUTHORITATIVE_RUNTIME_STATE');
  assert.ok(fact.stateRevision);
});

test('T3: incomplete fiscal data stays explicitly unavailable and does not become zero',()=>{
  const s=createSandbox({state:{simulationTurn:1}});
  s.tick('finance',1);
  const finance=s.mesh.getPeerState('trade','finance',s.countryA,{currentTurn:1});
  assert.equal(finance.publishedFacts['finance.reserves'].availability,'UNAVAILABLE');
  assert.notEqual(finance.publishedFacts['finance.reserves'].value,0);
});

test('U2: state mutation is owner-bound through the canonical authority, then marks publication dirty',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.registerTradeAction();
  s.mesh.registerCommandHandler(ACTION_ID,'foreign',(command,{stateTransaction})=>{
    const treaties=stateTransaction.get('foreign.treaties')||{};
    treaties[s.countryB]={status:'SIGNED'};
    stateTransaction.set('foreign.treaties',treaties);
    return {accepted:true};
  });
  const before=s.mesh.getPeerState('trade','foreign',s.countryA,{currentTurn:1}).publishedFacts['foreign.treaties'].value[s.countryB].status;
  const cmd=s.mesh.dispatchCommand('trade',ACTION_ID,s.countryA,{targetCountryId:s.countryB},{turn:2,commandType:ACTION_ID});
  assert.equal(cmd.stateChanged,true);
  assert.equal(s.state.foreign[s.countryA].treaties[s.countryB].status,'SIGNED');
  assert.notEqual(before,'SIGNED');
  const dirty=s.mesh.getDirtyPublications(s.countryA,'foreign');
  assert.ok(dirty.length>=1);
});

test('U3: failed authoritative transaction is atomic',()=>{
  const s=createSandbox();
  const authority=s.sandbox.OmegaAuthoritativeStateAuthority.instance;
  const before=authority.read(s.countryA,'foreign.treaties');
  const tx=s.sandbox.OmegaMinistryStateTransaction.create(
    'foreign',s.countryA,2,'ATOMIC-FAIL-1',authority
  );
  tx.operations.push(
    {op:'SET',path:'foreign.treaties',after:{[s.countryB]:{status:'SIGNED'}}},
    {op:'INVALID',path:'foreign.relations',after:{[s.countryB]:99}}
  );
  assert.throws(()=>tx.commit(),/UNKNOWN_STATE_OPERATION/);
  assert.deepEqual(authority.read(s.countryA,'foreign.treaties'),before);
});

test('U4: domain revision used for dirty publication matches source publication revision',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.registerTradeAction();
  s.mesh.registerCommandHandler(ACTION_ID,'foreign',(command,{stateTransaction})=>{
    const treaties=stateTransaction.get('foreign.treaties')||{};
    treaties[s.countryB]={status:'SIGNED'};
    stateTransaction.set('foreign.treaties',treaties);
    return {accepted:true};
  });
  const cmd=s.mesh.dispatchCommand('trade',ACTION_ID,s.countryA,{targetCountryId:s.countryB},{turn:2,commandType:ACTION_ID});
  assert.equal(cmd.stateChanged,true);
  const dirtyBefore=s.mesh.getDirtyPublications(s.countryA,'foreign');
  assert.equal(dirtyBefore.length,1);
  assert.equal(cmd.stateRevisionAfter,dirtyBefore[0].stateRevision);
  s.tick('foreign',2);
  assert.equal(s.mesh.getDirtyPublications(s.countryA,'foreign').length,0);
});

test('V2: authoritative revision drift is exposed as STALE until source republishes',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.state.foreign[s.countryA].treaties[s.countryB]={status:'SIGNED'};
  const stale=s.mesh.getPeerState('trade','foreign',s.countryA,{currentTurn:1});
  assert.equal(stale.freshness.status,'STALE');
  assert.equal(stale.publishedFacts['foreign.treaties'].availability,'STALE');
  s.tick('foreign',2);
  const fresh=s.mesh.getPeerState('trade','foreign',s.countryA,{currentTurn:2});
  assert.equal(fresh.publishedFacts['foreign.treaties'].availability,'AVAILABLE');
});

test('W: declarative production action is available from the ministry knowledge contract',()=>{
  const s=createSandbox();
  const def=s.mesh.instance.decisionFramework.getAction('CONCLUDE_TRADE_AGREEMENT');
  assert.ok(def);
  assert.ok(def.requirements.some(r=>r.id==='foreign.relations'));
  assert.ok(def.requirements.some(r=>r.id==='foreign.treaties'));
  assert.ok(def.requirements.some(r=>r.id==='finance.reserves'));
  assert.ok(def.requirements.some(r=>r.id==='transport.logistics'));
  assert.ok(def.requirements.some(r=>r.id==='intelligence.threats'));
});


test('architectural transaction concurrency rejects stale writers and permits retry',()=>{
  const s=createSandbox();
  const authority=s.sandbox.OmegaAuthoritativeStateAuthority.instance;
  const first=s.sandbox.OmegaMinistryStateTransaction.create('foreign',s.countryA,2,'TX-A',authority);
  const second=s.sandbox.OmegaMinistryStateTransaction.create('foreign',s.countryA,2,'TX-B',authority);
  const treaties=first.get('foreign.treaties')||{};
  treaties[s.countryB]={status:'SIGNED'};
  first.set('foreign.treaties',treaties);
  const committed=first.commit();
  assert.equal(committed.changed,true);
  const secondTreaties=second.get('foreign.treaties')||{};
  secondTreaties[s.countryB]={status:'SUSPENDED'};
  second.set('foreign.treaties',secondTreaties);
  assert.throws(()=>second.commit(),/STATE_REVISION_CONFLICT/);

  const retry=s.sandbox.OmegaMinistryStateTransaction.create('foreign',s.countryA,3,'TX-C',authority);
  const retryTreaties=retry.get('foreign.treaties')||{};
  retryTreaties[s.countryB]={status:'SUSPENDED'};
  retry.set('foreign.treaties',retryTreaties);
  assert.equal(retry.commit().changed,true);
});

test('architectural event outbox preserves state/event ordering and causal reaction routing',()=>{
  const s=createSandbox();
  s.tickAll(1);
  s.registerTradeAction();
  let received=0;
  s.mesh.subscribeEvent('TREATY_SIGNED','trade',(event)=>{
    received+=1;
    assert.equal(event.sourceMinistryId,'foreign');
    assert.equal(event.stateRevision!==null,true);
    return {accepted:true};
  });
  s.mesh.registerCausalRule('TREATY_TO_TRADE',{
    eventTypes:['TREATY_SIGNED'],
    sourceMinistries:['foreign'],
    targetMinistries:['trade'],
    createReaction:(event)=>({
      sourceMinistryId:event.sourceMinistryId,
      targetMinistries:['trade'],
      payload:{causedBy:event.eventId}
    })
  });
  s.mesh.registerCommandHandler(ACTION_ID,'foreign',(command,{stateTransaction,emitEvent})=>{
    const treaties=stateTransaction.get('foreign.treaties')||{};
    treaties[s.countryB]={status:'SIGNED'};
    stateTransaction.set('foreign.treaties',treaties);
    emitEvent('TREATY_SIGNED',{targetCountryId:s.countryB});
    return {accepted:true};
  });
  const command=s.mesh.dispatchCommand('trade',ACTION_ID,s.countryA,{targetCountryId:s.countryB},{turn:2,commandType:ACTION_ID});
  assert.equal(command.status,'APPLIED');
  assert.equal(received,1);
  assert.ok(s.mesh.instance.eventOutbox.size>=1);
  assert.ok(s.mesh.instance.reactionQueue.length>=1);
  const reactions=s.mesh.processReactionQueue(2);
  assert.equal(reactions[0].status,'DISPATCHED');
  assert.equal(s.mesh.getMinistryInbox(s.countryA,'trade').length>0,true);
  assert.equal(s.mesh.getEventLog({countryId:s.countryA,fromTurn:2,toTurn:2}).length>=2,true);
});

test('architectural workflow and authority lifecycle remain explicit without prefilled government data',()=>{
  const s=createSandbox();
  s.mesh.registerWorkflow('POLICY_CASE',{
    states:['ASSESSING','REVIEW','APPROVED','EXECUTING','CLOSED'],
    transitions:{
      ASSESSING:['REVIEW'],
      REVIEW:['APPROVED'],
      APPROVED:['EXECUTING'],
      EXECUTING:['CLOSED']
    },
    approvalStages:['REVIEW']
  });
  const row=s.mesh.createCase({
    workflowId:'POLICY_CASE',
    countryId:s.countryA,
    ownerMinistry:'cabinet'
  });
  assert.equal(row.status,'ASSESSING');
  assert.equal(s.mesh.advanceCase(row.caseId,'REVIEW').status,'REVIEW');
  assert.equal(s.mesh.advanceCase(row.caseId,'APPROVED',{approvalState:'APPROVED'}).approvalState,'APPROVED');
  assert.equal(s.mesh.advanceCase(row.caseId,'EXECUTING').status,'EXECUTING');
  assert.equal(s.mesh.advanceCase(row.caseId,'CLOSED').status,'CLOSED');
});
