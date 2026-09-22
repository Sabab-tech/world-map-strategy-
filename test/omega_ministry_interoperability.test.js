import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const IDS=[
  'cabinet','defense','military','finance','economy','trade','foreign',
  'intelligence','interior','transport','resource','health','education',
  'technology','projects','culture','statistics'
];

function loadBrowserScript(path,sandbox){
  const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  vm.runInNewContext(source,sandbox,{filename:path});
}

function makeSandbox(){
  const listeners=new Map();
  let perf=0;
  const gameState={
    economy:{
      BANGLADESH:{
        gdp:100,
        debt:20,
        budget:15,
        inflation:4,
        unemployment:5,
        production:80
      }
    },
    population:{BANGLADESH:{total:100000000}},
    relations:{BANGLADESH:{INDIA:{score:55}}},
    resources:{BANGLADESH:{oil:10}},
    finance:{BANGLADESH:{reserves:50,taxRevenue:40,spending:30}},
    foreign:{BANGLADESH:{relations:70,treaties:{count:2,concluded:true},sanctions:0,embassies:3}},
    transport:{BANGLADESH:{logistics:80,infrastructure:{roads:70},ports:2,rail:1}},
    intelligence:{BANGLADESH:{threats:10,state:{coverage:75},cyber:{readiness:60}}},
    defense:{BANGLADESH:{procurement:{queue:2},readiness:78}},
    military:{BANGLADESH:{combat:{active:false},readiness:75,forceStructure:{army:1},logistics:{score:70}}},
    trade:{BANGLADESH:{relations:{INDIA:55},balance:5,exports:20,imports:15}},
    interior:{BANGLADESH:{stability:75,corruption:25,security:80}},
    resource:{BANGLADESH:{inventory:{oil:10}}},
    health:{BANGLADESH:{state:{coverage:80},welfare:{coverage:75},hospitals:100}},
    education:{BANGLADESH:{state:{literacy:80},research:{programs:5},enrollment:70}},
    technology:{BANGLADESH:{research:{programs:5},innovation:{index:60},patents:12,rnd:10}},
    projects:{BANGLADESH:{registry:{p1:{status:'active'},p2:{status:'planned'}},legal:{clearance:true},budget:10,transport:{link:1}}},
    culture:{BANGLADESH:{state:{cohesion:70},media:{reach:80},social:{cohesion:65}}},
    statistics:{BANGLADESH:{sampleSize:100}}
  };

  const sandbox={
    console,
    Date,
    JSON,
    Object,
    Number,
    String,
    RegExp,
    Map,
    Set,
    WeakMap,
    Array,
    Math,
    Promise,
    URL,
    Intl,
    Error,
    TypeError,
    queueMicrotask:fn=>Promise.resolve().then(fn),
    setTimeout,
    clearTimeout,
    setInterval:()=>1,
    clearInterval:()=>{},
    performance:{now:()=>++perf},
    CustomEvent:class CustomEvent{
      constructor(type,init={}){this.type=type;this.detail=init.detail;}
    },
    dispatchEvent(event){
      for(const fn of listeners.get(event.type)||[]) fn(event);
      return true;
    },
    addEventListener(type,fn){
      const set=listeners.get(type)||new Set();
      set.add(fn);
      listeners.set(type,set);
    },
    gameState,
    Game:{
      state:{...gameState,countryId:'BANGLADESH',playerCountryId:'BANGLADESH'},
      currentActiveCountry:'BANGLADESH'
    },
    OmegaCabinetUI:{activeCountry:'BANGLADESH',ministersDB:{}},
    OmegaMinistersDB:{},
    ResourceMinistryEngine:{
      deposits:[],
      getIntegratedResourceState:()=>({inventory:{crude_oil:10,refined_steel:20,enriched_uranium:1}})
    },
    EducationEngine:{}
  };
  sandbox.Omega={};
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  return sandbox;
}

function makeCallback(sandbox){
  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  return {
    onMessage(message){
      runtime.handleMessage(message.receiver || message.target, message);
    },
    onMinistryTick(dt,turn,store,blackboard){
      runtime.tick(''+this.__id,dt,turn,store,blackboard);
    }
  };
}

function pump(sandbox,id,turn){
  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  const kernel=sandbox.Omega.Kernel;
  kernel.pumpOrchestratedPipelineTick(id,16.7,turn,{
    onMessage:(message)=>runtime.handleMessage(id,message),
    onMinistryTick:(dt,currentTurn,store,blackboard)=>runtime.tick(id,dt,currentTurn,store,blackboard)
  });
}

test('OMEGA full ministry interoperability system builds and verifies a real 17x17 directed mesh',()=>{
  const sandbox=makeSandbox();
  loadBrowserScript('omega_kernel.js',sandbox);
  loadBrowserScript('omega_ministry_domain_engines.js',sandbox);
  loadBrowserScript('omega_ministry_interoperability_system.js',sandbox);
  loadBrowserScript('omega_ministry_runtime_v1.js',sandbox);

  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  const mesh=sandbox.Omega.MinistryInteroperability;
  const kernel=sandbox.Omega.Kernel;

  assert.ok(mesh);
  assert.equal(runtime.init(kernel),true);

  const topology=mesh.verifyFullMesh();
  assert.equal(topology.ok,true);
  assert.equal(topology.ministries,17);
  assert.equal(topology.connectionCells,289);
  assert.equal(topology.crossMinistryConnections,272);
  assert.equal(topology.loopbackConnections,17);

  for(const id of IDS) pump(sandbox,id,1);

  const initialHealth=mesh.health();
  assert.equal(initialHealth.meshOk,true);
  assert.equal(initialHealth.publishedMinistries,17);
  assert.equal(runtime.health().interoperability.connections,289);

  let sent=0;
  for(const source of IDS){
    const port=mesh.createPort(source);
    for(const target of IDS){
      const msg=port.send(target,'mesh.integration.probe',{source,target,probe:true},{
        messageType:'STATE_UPDATE',
        countryId:'BANGLADESH',
        turn:2
      });
      assert.equal(msg.source,source);
      assert.equal(msg.target,target);
      sent+=1;
    }
  }
  assert.equal(sent,289);

  for(const id of IDS) pump(sandbox,id,2);

  for(const source of IDS){
    for(const target of IDS){
      const route=mesh.getConnection(source,target);
      assert.equal(route.messagesSent,1,source+'->'+target+' send');
      assert.equal(route.messagesReceived,1,source+'->'+target+' receive');
    }
  }

  const postTransport=mesh.health();
  assert.equal(postTransport.metrics.sent,289);
  assert.equal(postTransport.metrics.received,289);
  assert.equal(postTransport.metrics.rejected,0);
  assert.equal(postTransport.metrics.dropped,0);

  const finance=mesh.createPort('finance');
  const trade=mesh.createPort('trade');
  const request=finance.request('trade','trade.agreement.context.request',{
    targetCountry:'INDIA',
    requestedFacts:['foreign.treaties','foreign.relations','foreign.sanctions','transport.logistics','finance.reserves','intelligence.threats']
  },{countryId:'BANGLADESH',turn:3});

  pump(sandbox,'trade',3);
  const tradeEngine=sandbox.OmegaMinistryDomainEngines.get('trade');
  assert.equal(tradeEngine.getCoordinationState().pendingRequests.length>0,true);

  const response=trade.reply(request,'trade.agreement.context.response',{
    treatyObserved:true,
    foreignRelationshipObserved:true,
    logisticsObserved:true
  },{countryId:'BANGLADESH',turn:4});

  assert.equal(response.source,'trade');
  assert.equal(response.target,'finance');
  pump(sandbox,'finance',4);
  assert.equal(mesh.getMinistryInbox('finance').some(m=>m.messageId===response.messageId),true);

  mesh.recordBudgetRequest('education',{
    amount:12,
    currency:'B',
    purpose:'education-capacity',
    urgency:'HIGH',
    evidence:{source:'education.engine'}
  },{countryId:'BANGLADESH',turn:5,target:'finance'});
  pump(sandbox,'finance',5);

  mesh.publishProjectStatus('projects',{
    projectCount:2,
    activeCount:1,
    committedBudget:10,
    status:'UPDATED',
    blockers:[]
  },{countryId:'BANGLADESH',turn:5,target:'cabinet'});
  pump(sandbox,'cabinet',5);

  const tradeBriefing=mesh.getMinistryBriefing('trade');
  assert.equal(Object.keys(tradeBriefing.peers).length,17);
  assert.equal(tradeBriefing.peers.finance.fiscal.reserves,50);
  assert.equal(tradeBriefing.peers.foreign.operations.facts['foreign.treaties'].concluded,true);
  assert.equal(tradeBriefing.peers.transport.operations.facts['transport.logistics'],80);
  assert.equal(tradeBriefing.peers.intelligence.operations.facts['intelligence.threats'],10);
  assert.equal(tradeBriefing.government.budgetNeeds.some(x=>x.ministryId==='education'),true);
  assert.equal(tradeBriefing.government.projects.some(x=>x.ministryId==='projects' && x.knownCount===2),true);

  const tradeDecisionContext=mesh.evaluateAction('trade','CONCLUDE_TRADE_AGREEMENT');
  assert.equal(tradeDecisionContext.status,'OBSERVED');
  assert.equal(tradeDecisionContext.missing.length,0);
  assert.equal(tradeDecisionContext.blockers.length,0);
  assert.equal(tradeDecisionContext.evidence.length>=5,true);

  for(const ministryId of IDS){
    const ministryContext=mesh.getContext(ministryId,{turn:6,dt:16.7});
    assert.equal(Object.keys(ministryContext.nationalPicture).length,17);
    assert.equal(ministryContext.nationalPicture.finance?.ministryId,'finance');
    assert.equal(ministryContext.nationalPicture.projects?.ministryId,'projects');
    assert.equal(ministryContext.nationalPicture.education?.ministryId,'education');
    assert.equal(ministryContext.government.budgetNeeds.some(x=>x.ministryId==='education'),true);
  }

  const runtimeContext=mesh.getContext('trade',{turn:6,dt:16.7});
  assert.equal(runtimeContext.ministryId,'trade');
  assert.equal(Object.keys(runtimeContext.nationalPicture).length,17);
  assert.equal(runtimeContext.government.budgetNeeds.some(x=>x.ministryId==='education'),true);
  assert.equal(typeof runtimeContext.mesh.send,'function');
  assert.equal(typeof runtimeContext.mesh.request,'function');
  assert.equal(typeof runtimeContext.mesh.getDecisionContext,'function');

  const engineCoordination=tradeEngine.getCoordinationState();
  assert.equal(engineCoordination.processedCount>=18,true);
  assert.equal(Array.isArray(engineCoordination.received),true);

  console.log('OMEGA MINISTRY INTEROPERABILITY SYSTEM TEST: PASS');
  console.log('Ministries:',17);
  console.log('Logical connection cells:',289);
  console.log('Cross-ministry directed routes:',272);
  console.log('Loopback routes:',17);
  console.log('Pairwise transport verified:',289+'/289');
  console.log('Government situational snapshots:',mesh.health().publishedMinistries+'/17');
  console.log('Trade decision-context evidence:',tradeDecisionContext.evidence.length);
});
