import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const IDS=[
  'cabinet','defense','military','finance','economy','trade','foreign',
  'intelligence','interior','transport','resource','health','education',
  'technology','projects','culture','statistics'
];
const RUNTIME_VERSION='1.3.0';
const ENGINE_VERSION='1.0.0';

function loadBrowserScript(path,sandbox){
  const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  vm.runInNewContext(source,sandbox,{filename:path});
}

function setPath(root,path,value){
  const parts=path.split('.');
  let cursor=root;
  for(let i=0;i<parts.length-1;i++){
    cursor[parts[i]]=cursor[parts[i]]||{};
    cursor=cursor[parts[i]];
  }
  cursor[parts[parts.length-1]]=value;
}

function fixtureForEngine(engine){
  const ctx={
    ministryId:engine.id,
    countryId:'BANGLADESH',
    turn:42,
    dt:16.7,
    gameState:{
      economy:{BANGLADESH:{gdp:100,debt:20,budget:15,inflation:4,unemployment:5,production:80}},
      population:{BANGLADESH:{total:100000000}},
      relations:{BANGLADESH:{INDIA:{score:55}}},
      resources:{BANGLADESH:{oil:10}}
    },
    countryRecord:{code:'BD',name:'Bangladesh'},
    ministers:{sample:{id:'sample'}},
    resourceSummary:{oil:10},
    resourceInventory:{oil:10},
    resourceDeposits:[{id:'oil-1'}],
    resourceEngineState:{inventory:{oil:10}},
    educationEngine:{renderDashboard(){}},
    store:{policies:new Map([['p',{}]]),decisions:new Map([['d',{}]])}
  };

  const seed={
    defense:{procurement:{queue:1},readiness:80},
    military:{combat:{active:false},readiness:75,forceStructure:{army:1},logistics:{score:70}},
    finance:{reserves:50,taxRevenue:30,spending:25},
    trade:{relations:{INDIA:55},balance:5,exports:20,imports:15},
    foreign:{relations:{INDIA:55},treaties:{count:2},sanctions:0,embassies:3},
    intelligence:{state:{coverage:70},cyber:{readiness:60},threats:1,sources:4},
    interior:{stability:75,corruption:25,security:80},
    transport:{infrastructure:{roads:70},logistics:{score:65},ports:2,rail:1},
    health:{state:{coverage:80},welfare:{coverage:75},hospitals:100},
    education:{state:{literacy:80},research:{programs:5},enrollment:70},
    technology:{research:{programs:5},innovation:{index:60},patents:12,rnd:10},
    projects:{registry:{p1:{status:'active'}},legal:{clearance:true},budget:10,transport:{link:1}},
    culture:{state:{cohesion:70},media:{reach:80},social:{cohesion:65}}
  };

  for(const [section,values] of Object.entries(seed)){
    for(const [key,value] of Object.entries(values)) setPath(ctx,section+'.'+key,value);
  }
  return ctx;
}

test('OMEGA data contract canonicalizes name-keyed repository datasets without duplicating authoritative country records',async()=>{
  const countries=JSON.parse(fs.readFileSync(new URL('../countries.json',import.meta.url),'utf8'));
  const cities=JSON.parse(fs.readFileSync(new URL('../cities.json',import.meta.url),'utf8'));
  const economy=JSON.parse(fs.readFileSync(new URL('../economy.json',import.meta.url),'utf8'));
  const events=[];
  const files={'countries.json':countries,'cities.json':cities,'economy.json':economy};
  const sandbox={
    console,Date,JSON,Object,Number,String,RegExp,Map,Set,WeakMap,Array,Math,Promise,URL,
    fetch:async path=>({ok:true,json:async()=>files[String(path).replace(/^\//,'').replace(/\?.*$/,'')]}),
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    dispatchEvent(event){events.push(event);return true},
    addEventListener(){},removeEventListener(){},
    Game:{state:{},currentActiveCountry:'Bangladesh'},
    Omega:{}
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  loadBrowserScript('omega_country_semantic_bridge.js',sandbox);
  const bridge=sandbox.OmegaCanonicalIdentityRegistry;
  assert.ok(bridge);
  assert.equal(await bridge.init(),true);
  const providerSource=fs.readFileSync(new URL('../omega_ministry_state_provider.js',import.meta.url),'utf8');
  vm.runInNewContext(providerSource,sandbox,{filename:'omega_ministry_state_provider.js'});
  const provider=sandbox.Omega.MinistryStateProvider.create({stateSource:sandbox.Game.state});
  sandbox.Omega.MinistryStateProvider.instance=provider;
  const contract=provider.validateDatasetShape(economy,{strict:true});
  assert.equal(contract.valid,true);
  const result=provider.hydrateDataset(economy,'economy',{strict:true});
  const bd=String(countries.find(row=>row.name==='Bangladesh').code).toUpperCase();
  assert.ok(sandbox.Game.state.economy[bd]);
  assert.equal(sandbox.Game.state.economy[bd].gdp,economy.BANGLADESH.gdp);
  assert.equal(Object.keys(sandbox.Game.state.economy).includes('BANGLADESH'),false);
  assert.equal(sandbox.Game.state.economy.BANGLADESH.gdp,economy.BANGLADESH.gdp);
  assert.equal(result.countryIds.includes(bd),true);
});

test('the production Game.Simulation adapter delegates to the canonical government runtime instead of owning legacy simulation mutations',()=>{
  const source=fs.readFileSync(new URL('../map-engine-2.js',import.meta.url),'utf8');
  const calls=[];
  const sandbox={
    console,Date,JSON,Object,Number,String,RegExp,Map,Set,WeakMap,Array,Math,Promise,URL,
    window:null,
    Game:{
      state:{simulationTurn:7,economy:{}},
      worldState:{turn:7},
      currentActiveCountry:'BD',
      getCountryId(value){return String(value||'').toUpperCase();}
    },
    OMEGA_MINISTRY_RUNTIME_V1:{
      runWorldTurn(turn,dt){calls.push({turn,dt});return {mode:'WORLD_TURN',turn,status:'COMMITTED'};}
    },
    document:{addEventListener(){},querySelectorAll(){return[]},getElementById(){return null}},
    setTimeout(){return 1},
    clearTimeout(){},
    ResourceMinistryEngine:{},
    Omega:{}
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  const simStart=source.indexOf('Game.Simulation = {');
  const simEnd=source.indexOf('\n\nGame.Diplomacy',simStart);
  assert.ok(simStart>=0&&simEnd>simStart,'canonical Game.Simulation adapter must be present');
  vm.runInNewContext(source.slice(simStart,simEnd),sandbox,{filename:'map-engine-2.js:canonical-simulation'});
  const result=sandbox.Game.Simulation.tick(16.7);
  assert.equal(result.status,'COMMITTED');
  assert.equal(calls.length,1);
  assert.equal(calls[0].turn,8);
  assert.ok(!source.includes('Math.random()'), 'legacy random simulation authority must not remain in Game.Simulation.tick');
});

test('the production HTML loop has one canonical ministry simulation authority and waits for the data contract',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.includes('Game.Simulation.tick(dt)'));
  assert.ok(html.includes('OMEGA_MINISTRY_RUNTIME_V1'));
  assert.ok(html.includes('runWorldTurn'));
  assert.ok(html.includes('OMEGA_DATA_CONTRACT_READY'));
  assert.ok(html.includes('if (!dataContractReady)'));
  assert.equal(/kernel\.pumpOrchestratedPipelineTick\(id, dt, tick/.test(html),false);
  assert.equal(/ministryRuntimeController\?\.tick\?\.\(id, tickDt, currentTurn/.test(html),false);
  assert.ok(html.includes('Canonical ministry mutation is owned'));
});
test('OMEGA canonical 17-ministry runtime is independently engine-backed and binding-aware',()=>{
  const events=[];
  const kernelStates=new Map(IDS.map(id=>[id,'RUNNING']));
  const registered=[];

  const kernel={
    registerMinistry(id){ registered.push(id); },
    getMinistryState(id){ return kernelStates.get(id)||'STOPPED'; },
    createBridge(){
      return { emitEvent(topic,payload){ events.push({topic,payload}); } };
    }
  };

  const sandbox={
    console,
    Date,
    JSON,
    Object,
    Number,
    Math,
    Map,
    Set,
    WeakMap,
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    dispatchEvent(event){events.push({topic:event.type,payload:event.detail});},
    Omega:{Kernel:kernel},
    GLOBAL_MINISTRY_MANIFEST:IDS.map(id=>({id,status:'READY'})),
    Game:{
      state:{
        economy:{BANGLADESH:{gdp:100,debt:20,budget:15,inflation:4,unemployment:5,production:80}},
        population:{BANGLADESH:{total:100000000}},
        relations:{BANGLADESH:{INDIA:{score:55}}},
        resources:{BANGLADESH:{oil:10}}
      },
      currentActiveCountry:'BANGLADESH'
    },
    OmegaCabinetUI:{activeCountry:'BANGLADESH',ministersDB:{}},
    OmegaMinistersDB:{},
    ResourceMinistryEngine:{deposits:[],getIntegratedResourceState:()=>({inventory:{}})},
    EducationEngine:{}
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;

  loadBrowserScript('omega_country_semantic_bridge.js',sandbox);
  loadBrowserScript('omega_ministry_registry.js',sandbox);
  loadBrowserScript('omega_ministry_knowledge_contract.js',sandbox);
  loadBrowserScript('omega_ministry_information_policy.js',sandbox);
  loadBrowserScript('omega_ministry_decision_framework.js',sandbox);
  loadBrowserScript('omega_ministry_state_transaction.js',sandbox);
  loadBrowserScript('omega_authoritative_state_authority.js',sandbox);
  loadBrowserScript('omega_ministry_state_provider.js',sandbox);
  loadBrowserScript('omega_ministry_domain_engines.js',sandbox);
  loadBrowserScript('omega_ministry_interoperability_system.js',sandbox);
  loadBrowserScript('omega_ministry_runtime_v1.js',sandbox);

  const engines=sandbox.OmegaMinistryDomainEngines;
  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;

  assert.ok(engines,'independent domain engine registry must load');
  assert.ok(runtime,'runtime controller must load');
  assert.equal(engines.version,ENGINE_VERSION);
  assert.equal(runtime.version,RUNTIME_VERSION);
  assert.deepEqual(Array.from(runtime.getIds()),IDS);
  assert.deepEqual(Array.from(engines.ids),IDS);

  const engineObjects=IDS.map(id=>engines.get(id));
  assert.equal(new Set(engineObjects).size,IDS.length,'every ministry must own a unique engine instance');
  for(const engine of engineObjects){
    assert.equal(engine.independent,true);
    assert.equal(engine.sharedExecutionDependency,null);
    assert.equal(typeof engine.execute,'function');
    assert.equal(engine.engineVersion,ENGINE_VERSION);
    assert.equal(engine.id,engineObjects.find(x=>x===engine).id);
  }

  const registryHealth=engines.health();
  assert.equal(registryHealth.count,17);
  assert.equal(registryHealth.independent,17);
  assert.equal(registryHealth.uniqueInstances,17);
  assert.equal(registryHealth.sharedExecutionDependencies,0);

  assert.equal(runtime.init(kernel),true);
  assert.equal(registered.length,17);

  for(const id of IDS){
    const engine=runtime.getEngine(id);
    assert.strictEqual(engine,engines.get(id));
    assert.equal(runtime.getEngineBinding(id).independent,true);
    assert.deepEqual(
      JSON.parse(JSON.stringify(runtime.getEngineBinding(id).resolved)),
      [{
        id,
        version:ENGINE_VERSION,
        independent:true
      }]
    );

    const store={
      policies:new Map(),
      knowledgeGraph:new Map(),
      goalStack:[]
    };
    const telemetry=runtime.tick(id,16.7,42,store,null);
    assert.equal(telemetry.id,id);
    assert.equal(telemetry.engineId,id);
    assert.equal(telemetry.engineVersion,ENGINE_VERSION);
    assert.equal(telemetry.independent,true);
    assert.equal(telemetry.domain,runtime.specs[id].domain);
    assert.equal(telemetry.active,true);
    assert.equal(telemetry.domainExecution.status,'EXECUTED');
    assert.equal(telemetry.domainExecution.engineId,id);
    assert.equal(telemetry.domainExecution.independent,true);
    assert.ok(telemetry.domainExecution.availableInputCount>=0);
    assert.ok(telemetry.domainExecution.availableInputCount<=telemetry.domainExecution.requiredInputCount);
    assert.ok(Array.isArray(telemetry.domainExecution.missingInputs));
    assert.equal(store.policies.size,0,'runtime telemetry must not mutate store.policies');
    assert.equal(store.knowledgeGraph.size,0,'runtime telemetry must not mutate store.knowledgeGraph');
    assert.deepEqual(store.goalStack,[],'runtime telemetry must not mutate store.goalStack');
    assert.equal(runtime.getState(id).ticks,1);
  }

  const health=runtime.health();
  assert.equal(health.version,RUNTIME_VERSION);
  assert.equal(health.count,17);
  assert.equal(health.active,17);
  assert.equal(health.ticked,17);
  assert.equal(health.failed,0);
  assert.equal(health.independent,17);
  assert.equal(health.uniqueInstances,17);
  assert.equal(health.engineRegistryHealthy,true);
  assert.ok(events.some(e=>e.topic==='OMEGA_17_MINISTRY_RUNTIME_READY'));
  const tickEvents=events.filter(e=>e.topic==='OMEGA_MINISTRY_RUNTIME_TICK');
  assert.equal(tickEvents.length,34);
  assert.equal(
    new Set(tickEvents.map(e=>e.payload?.id).filter(Boolean)).size,
    17,
    'both runtime event sinks must report all 17 ministries'
  );

  const ministrySource=fs.readFileSync(new URL('../ministry_engine.js',import.meta.url),'utf8');
  const databaseOffset=ministrySource.indexOf('ministriesDatabase:');
  assert.ok(databaseOffset>0,'ministry_engine.js must expose the legacy configuration database');
  const databaseSource=ministrySource.slice(databaseOffset);
  const legacyRefs=runtime.legacyConfigReferences;
  for(const id of IDS){
    for(const legacyId of legacyRefs[id]){
      const exists=databaseSource
        .split('\n')
        .some(line=>line.trim().startsWith(legacyId+': {'));
      assert.equal(
        exists,
        true,
        'legacy config reference '+legacyId+' for '+id+' must resolve to a real existing database entry'
      );
    }
  }

  assert.equal(/nativeAdapter/.test(fs.readFileSync(new URL('../omega_ministry_runtime_v1.js',import.meta.url),'utf8')),false,'old native-adapter execution path must be gone');

  console.log('OMEGA 17-MINISTRY INDEPENDENT ENGINE TEST: PASS');
  console.log('Canonical ministries:',IDS.length);
  console.log('Unique engine instances:',new Set(engineObjects).size);
  console.log('Runtime independent engines:',health.independent);
  console.log('Legacy config references validated: PASS');
  console.log('Runtime version contract:',runtime.version);
});

test('canonical government scheduler executes deterministic multi-phase turn spine',()=>{
  const kernelStates=new Map(IDS.map(id=>[id,'RUNNING']));
  const kernel={
    registerMinistry(){},
    getMinistryState(id){return kernelStates.get(id)||'STOPPED';},
    createBridge(){return {emitEvent(){}};}
  };
  const sandbox={
    console,Date,JSON,Object,Number,Math,Map,Set,WeakMap,CustomEvent,
    dispatchEvent(){},
    Omega:{Kernel:kernel},
    GLOBAL_MINISTRY_MANIFEST:IDS.map(id=>({id,status:'READY'})),
    Game:{state:{economy:{BANGLADESH:{gdp:100}}},currentActiveCountry:'BANGLADESH'},
    OmegaCabinetUI:{activeCountry:'BANGLADESH',ministersDB:{}},
    OmegaMinistersDB:{},
    ResourceMinistryEngine:{deposits:[],getIntegratedResourceState:()=>({inventory:{}})}
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  loadBrowserScript('omega_ministry_registry.js',sandbox);
  loadBrowserScript('omega_authoritative_state_authority.js',sandbox);
  loadBrowserScript('omega_ministry_state_transaction.js',sandbox);
  loadBrowserScript('omega_ministry_state_provider.js',sandbox);
  loadBrowserScript('omega_ministry_domain_engines.js',sandbox);
  loadBrowserScript('omega_ministry_runtime_v1.js',sandbox);

  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  assert.equal(runtime.init(kernel),true);

  const result=runtime.runTurn(43,16.7,{countryId:'BANGLADESH'},null);
  assert.equal(result.turn,43);
  assert.equal(result.status,'COMMITTED');
  assert.deepEqual(result.phases.map(row=>row.phase),[
    'TURN_START','WORLD_UPDATE','OBSERVE','INFORMATION','ASSESS',
    'COORDINATE','DECIDE','AUTHORIZE','EXECUTE','COMMIT',
    'PUBLISH','REACT','VERIFY','TURN_END'
  ]);
  assert.equal(Object.keys(result.assessments).length,17);
  const dependencyPlan=runtime.createDependencyPlan();
  assert.deepEqual(Array.from(result.deterministicOrder),Array.from(dependencyPlan.order));
  assert.deepEqual(Array.from(result.deterministicOrder).sort(),IDS.slice().sort());
  assert.equal(runtime.getOrchestrationState().turn,43);
});


test('canonical dataset contract accepts a single country record and rejects unknown country identities in strict mode',async()=>{
  const sandbox={
    console,Date,JSON,Object,Number,String,RegExp,Map,Set,WeakMap,Array,Math,Promise,URL,
    fetch:async path=>{
      const key=String(path).replace(/^\//,'').replace(/\?.*$/,'');
      if(key==='countries.json')return{ok:true,json:async()=>[{code:'BD',name:'Bangladesh'}]};
      if(key==='cities.json')return{ok:true,json:async()=>({})};
      return{ok:true,json:async()=>({})};
    },
    CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},
    dispatchEvent(){return true},addEventListener(){},removeEventListener(){},
    Game:{state:{},currentActiveCountry:'BD'},Omega:{},OmegaCabinetUI:{}
  };
  sandbox.window=sandbox;sandbox.globalThis=sandbox;
  loadBrowserScript('omega_country_semantic_bridge.js',sandbox);
  assert.equal(await sandbox.OmegaCanonicalIdentityRegistry.init(),true);
  loadBrowserScript('omega_ministry_registry.js',sandbox);
  loadBrowserScript('omega_authoritative_state_authority.js',sandbox);
  loadBrowserScript('omega_ministry_state_provider.js',sandbox);
  const provider=sandbox.Omega.MinistryStateProvider.create({stateSource:sandbox.Game.state});
  sandbox.Omega.MinistryStateProvider.instance=provider;
  const single={countryId:'BD',metric:12};
  assert.equal(provider.validateDatasetShape(single,{strict:true}).valid,true);
  assert.equal(provider.hydrateDataset(single,'statistics',{strict:true}).countryCount,1);
  assert.equal(sandbox.Game.state.statistics.BD.metric,12);
  assert.throws(()=>provider.validateDatasetShape({MARS:{metric:1}},{strict:true}),/DATASET_CONTRACT_INVALID/);
});
test('canonical world-turn runtime processes multiple country scopes through one global turn boundary',()=>{
  const kernelStates=new Map(IDS.map(id=>[id,'RUNNING']));
  const kernel={
    registerMinistry(){},
    getMinistryState(id){return kernelStates.get(id)||'STOPPED';},
    createBridge(){return {emitEvent(){}};}
  };
  const sandbox={
    console,Date,JSON,Object,Number,String,RegExp,Map,Set,WeakMap,CustomEvent,
    dispatchEvent(){},
    Omega:{Kernel:kernel},
    GLOBAL_MINISTRY_MANIFEST:IDS.map(id=>({id,status:'READY'})),
    Game:{
      state:{
        simulationTurn:1,
        economy:{
          'BD':{gdp:100},
          'IN':{gdp:200}
        }
      },
      currentActiveCountry:'BD'
    },
    OmegaCabinetUI:{activeCountry:'TST-A',ministersDB:{}},
    OmegaMinistersDB:{},
    ResourceMinistryEngine:{deposits:[],getIntegratedResourceState:()=>({inventory:{}})}
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  loadBrowserScript('omega_ministry_registry.js',sandbox);
  loadBrowserScript('omega_ministry_state_provider.js',sandbox);
  loadBrowserScript('omega_ministry_domain_engines.js',sandbox);
  loadBrowserScript('omega_ministry_runtime_v1.js',sandbox);
  const runtime=sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  assert.equal(runtime.init(kernel),true);
  const result=runtime.runWorldTurn(2,16.7,{countryIds:['IN','BD']});
  assert.equal(result.mode,'WORLD_TURN');
  assert.equal(result.turn,2);
  assert.equal(result.countryCount,2);
  assert.equal(result.processedCountries,2);
  assert.equal(result.failedCountries,0);
  assert.equal(result.status,'COMMITTED');
  assert.deepEqual(Array.from(result.deterministicCountryOrder),['BD','IN']);
  assert.equal(result.countries.length,2);
  for(const countryResult of result.countries){
    assert.equal(countryResult.turn,2);
    assert.equal(countryResult.status,'COMMITTED');
    assert.equal(countryResult.phases.length,14);
    assert.equal(Object.keys(countryResult.assessments).length,17);
  }
});

test('production Game.Simulation is the single global simulation entry point',()=>{
  const source=fs.readFileSync(new URL('../map-engine-2.js',import.meta.url),'utf8');
  const simStart=source.indexOf('Game.Simulation = {');
  const simEnd=source.indexOf('\n\nGame.Diplomacy',simStart);
  assert.ok(simStart>=0&&simEnd>simStart);
  const calls=[];
  const sandbox={
    console,Date,JSON,Object,Number,String,RegExp,Map,Set,WeakMap,Array,Math,
    Game:{
      state:{
        simulationTurn:9,
        economy:{'BD':{},'IN':{}}
      },
      worldState:{turn:9},
      currentActiveCountry:'BD'
    },
    window:null,
    Omega:{},
    OMEGA_MINISTRY_RUNTIME_V1:{
      runWorldTurn(turn,dt){
        calls.push({turn,dt});
        return {mode:'WORLD_TURN',turn,status:'COMMITTED'};
      }
    },
    setTimeout(){return 1},
    clearTimeout(){},
    document:{getElementById(){return null}},
    fetch:async()=>({ok:false,status:404,json:async()=>({})})
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  vm.runInNewContext(source.slice(simStart,simEnd),sandbox,{filename:'map-engine-2.js:canonical-simulation'});
  const result=sandbox.Game.Simulation.tick(16.7);
  assert.equal(result.status,'COMMITTED');
  assert.deepEqual(calls,[{turn:10,dt:16.7}]);
  assert.equal(sandbox.Game.Simulation.getCurrentTurn(),9);
});
