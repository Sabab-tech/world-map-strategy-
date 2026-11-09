import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function loadScript(path,sandbox){
  const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  vm.runInNewContext(source,sandbox,{filename:path});
}

function makeSandbox(){
  const state={
    population:{},
    economy:{},
    relations:{},
    simulation:{}
  };
  const events=[];
  const sandbox={
    console,
    Date,
    JSON,
    Object,
    Number,
    String,
    Math,
    Map,
    Set,
    WeakMap,
    Error,
    TypeError,
    Promise,
    localStorage:{
      data:new Map(),
      setItem(k,v){this.data.set(k,String(v));},
      getItem(k){return this.data.get(k)||null;}
    },
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    dispatchEvent(event){events.push(event);return true;},
    addEventListener(){},
    Game:{state,currentActiveCountry:'BANGLADESH'},
    gameState:{population:{BANGLADESH:{population_2015:170000000}},economy:{BANGLADESH:{gdp:200}}}
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.Omega={};
  return {sandbox,state,events};
}

test('canonical simulation authority owns the clock and ordered turn pipeline',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);

  let worldSteps=0;
  let ministrySteps=0;
  const commandCalls=[];

  const worldEngine={
    setAuthoritativeState(root){assert.equal(root,state);},
    processSimulationTick(_dt,turn){
      worldSteps+=1;
      assert.equal(turn,worldSteps);
      return {tick:turn,advanced:true};
    }
  };
  const interop={
    advanceTurn(turn){assert.equal(turn,worldSteps);},
    dispatchCommand(source,action,country,payload,options){
      commandCalls.push({source,action,country,payload,turn:options.turn});
      return {status:'APPLIED',commandId:options.commandId};
    },
    saveState(){return {saved:true};},
    loadState(){return true;}
  };

  sandbox.Omega.Simulation.configure({
    state,
    worldEngine,
    interoperability:interop,
    ministryPump:({turn})=>{
      ministrySteps+=1;
      assert.equal(turn,worldSteps);
      return {count:17};
    },
    ministryRuntime:{saveState(){return {saved:true};},loadState(){return true;}}
  });

  const session=sandbox.Omega.GameSession.createSession({playerCountryId:'BANGLADESH',startTurn:0});
  assert.equal(session.playerCountryId,'BANGLADESH');

  sandbox.Omega.GameSession.enqueueCommand({
    sourceMinistryId:'foreign',
    actionId:'TEST_ACTION',
    countryId:'BANGLADESH',
    payload:{x:1}
  });

  const result=await sandbox.Omega.GameSession.advance(2);
  assert.equal(result.turn,2);
  assert.equal(worldSteps,2);
  assert.equal(ministrySteps,2);
  assert.equal(commandCalls.length,1);
  assert.equal(commandCalls[0].turn,1);
  assert.equal(state.simulation.turn,2);
  assert.equal(state.simulation.worldStateRevision,2);
  assert.equal(sandbox.Omega.Simulation.diagnostics().authoritativeState.worldStateLinked,true);
});

test('frame scheduler advances one calendar day per ten-second driver interval',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);

  let steps=0;
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine:{setAuthoritativeState(){},processSimulationTick(){steps+=1;return {advanced:true};}},
    interoperability:{advanceTurn(){},saveState(){return {};},loadState(){return true;}},
    ministryPump(){return null;}
  });

  sandbox.Omega.GameSession.createSession({playerCountryId:'BANGLADESH'});
  sandbox.Omega.GameSession.startSession();

  await sandbox.Omega.Simulation.frame(9999);
  assert.equal(steps,0);

  await sandbox.Omega.Simulation.frame(1);
  assert.equal(steps,1);
  assert.equal(sandbox.Omega.Simulation.clock.turn,1);

  await sandbox.Omega.Simulation.frame(10000);
  assert.equal(steps,2);
  assert.equal(sandbox.Omega.Simulation.clock.turn,2);
});

test('save and load restores the canonical session without creating a second state root',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);

  let steps=0;
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine:{setAuthoritativeState(){},processSimulationTick(){steps+=1;return {advanced:true};}},
    interoperability:{advanceTurn(){},saveState(){return {ledger:steps};},loadState(snapshot){assert.deepEqual(snapshot,{ledger:steps});return true;}},
    ministryPump(){return null;}
  });

  sandbox.Omega.GameSession.createSession({playerCountryId:'BANGLADESH'});
  await sandbox.Omega.GameSession.advance(3);
  const saved=sandbox.Omega.GameSession.saveState();
  assert.equal(saved.clock.turn,3);
  assert.equal(saved.worldState.simulation.turn,3);

  state.simulation.turn=999;
  sandbox.Omega.GameSession.loadState(saved);

  assert.equal(state.simulation.turn,3);
  assert.equal(sandbox.Omega.GameSession.clock.turn,3);
  assert.equal(sandbox.Omega.GameSession.diagnostics().authoritativeState.worldStateLinked,true);
  assert.equal(saved.checksum?.length,8,'new saves must carry a deterministic integrity checksum');
  assert.equal(sandbox.Omega.GameSession.diagnostics().lastLoadIntegrity,'VERIFIED');
});

test('slow in-flight frame caps accumulated catch-up work instead of freezing the UI',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  let engineSteps=0,releaseFirstTurn,notifyTurnStarted;
  const firstTurnGate=new Promise(resolve=>{releaseFirstTurn=resolve;});
  const turnStarted=new Promise(resolve=>{notifyTurnStarted=resolve;});
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine:{
      setAuthoritativeState(){},
      processSimulationTick(){engineSteps+=1;return {advanced:true};}
    },
    interoperability:{advanceTurn(){},saveState(){return {};},loadState(){return true;}},
    ministryPump:async()=>{
      if(engineSteps===1){notifyTurnStarted();await firstTurnGate;}
      return null;
    }
  });
  sandbox.Omega.GameSession.createSession({playerCountryId:'BANGLADESH'});
  sandbox.Omega.GameSession.startSession({playerCountryId:'BANGLADESH'});
  const activeFrame=sandbox.Omega.Simulation.frame(10000);
  await turnStarted;
  for(let i=0;i<50;i++){
    const pending=sandbox.Omega.Simulation.frame(10000);
    assert.equal((await pending).busy,true,'overlapping frames should only queue bounded time');
  }
  releaseFirstTurn();
  await activeFrame;
  const resumed=await sandbox.Omega.Simulation.frame(0);
  assert.equal(resumed.steps,1,'bounded pending time should allow at most one catch-up day at normal speed');
  assert.equal(sandbox.Omega.Simulation.clock.turn,2);
  const idle=await sandbox.Omega.Simulation.frame(0);
  assert.equal(idle.steps,0,'consumed frame backlog must not replay on later frames');
  assert.equal(sandbox.Omega.Simulation.clock.turn,2);
});

console.log('OMEGA SIMULATION AUTHORITY TESTS: PASS');

test('save checksum and resource ownership integrity reject corruption before changing live state',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.resource={
    BGD:{inventory:{coal:50},batches:[{batchId:'SAVE-BATCH-1',countryId:'BGD',ownerCountryCode:'BGD',resourceId:'coal',quantity:50,remainingQuantity:50,stage:'RAW_EXTRACTED'}]}
  };
  const saved=runtime.saveState();
  assert.equal(typeof saved.checksum,'string');
  const tampered=JSON.parse(JSON.stringify(saved));
  tampered.worldState.resource.BGD.inventory.coal=999;
  assert.throws(()=>runtime.loadState(tampered),/SIMULATION_SAVE_CHECKSUM_MISMATCH/);
  assert.equal(state.resource.BGD.inventory.coal,50,'checksum failure must not partially restore world state');

  state.resource.BGD.batches[0].ownerCountryCode='SAU';
  const semanticallyInvalid=runtime.saveState();
  state.resource.BGD.batches[0].ownerCountryCode='BGD';
  const before=JSON.stringify(state);
  assert.throws(()=>runtime.loadState(semanticallyInvalid),/SIMULATION_SAVE_STATE_INTEGRITY_FAILED/);
  assert.equal(JSON.stringify(state),before,'semantic integrity failure must be rejected before mutating live state');
});

test('legacy save snapshots remain loadable but are explicitly marked unverified',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.simulation.turn=17;
  const snapshot=runtime.saveState();
  delete snapshot.checksum;
  state.simulation.turn=20;
  runtime.loadState(snapshot);
  assert.equal(state.simulation.turn,17);
  assert.equal(runtime.diagnostics().lastLoadIntegrity,'LEGACY_UNVERIFIED');
});


test('authoritative world-engine saves do not duplicate root-owned market and country state',()=>{
  const {sandbox,state}=makeSandbox();
  state.worldEcosystem={
    countryProfiles:{BGD:{countryId:'BGD',population:170000000}},
    market:{coal:{price:100}},
    causalEventLog:[{eventId:'EVT-1'}],
    causalLogCounter:2
  };
  loadScript('world_ecosystem_engine.js',sandbox);
  const engine=sandbox.WorldEcosystemEngine;
  engine.setAuthoritativeState(state);

  const legacy=engine.exportSaveState();
  assert.equal(legacy.stateRegistry.BGD.countryId,'BGD');
  assert.equal(legacy.globalMarket.coal.price,100);
  assert.equal(legacy.causalEventLog.length,1);

  const authoritative=engine.exportSaveState({authoritativeState:true});
  assert.equal(Object.hasOwn(authoritative,'stateRegistry'),false);
  assert.equal(Object.hasOwn(authoritative,'globalMarket'),false);
  assert.equal(Object.hasOwn(authoritative,'causalEventLog'),false);
  assert.equal(authoritative.currentSimulationTick,0);
});

test('compact autosave snapshots retain gameplay state and deterministic integrity checks',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.resource={BGD:{inventory:{coal:50},batches:[{
    batchId:'SAVE-BATCH-COMPACT',countryId:'BGD',ownerCountryCode:'BGD',
    resourceId:'coal',quantity:50,remainingQuantity:50,stage:'RAW_EXTRACTED'
  }]}};

  const full=runtime.saveState();
  const compact=runtime.saveState({includeDiagnostics:false});
  assert.equal(Object.hasOwn(full,'diagnostics'),true);
  assert.equal(Object.hasOwn(compact,'diagnostics'),false);
  assert.equal(compact.worldState.resource.BGD.inventory.coal,50);
  assert.match(compact.checksum,/^[0-9a-f]{8}$/);
  assert.equal(runtime.loadState(compact).lastLoadIntegrity,'VERIFIED');
  assert.equal(runtime.world.state.resource.BGD.inventory.coal,50);
});

test('durable save slots checksum the canonical serialized world without a second JSON traversal',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.resource={BGD:{inventory:{coal:50},batches:[{
    batchId:'SAVE-BATCH-SINGLE-PASS',countryId:'BGD',ownerCountryCode:'BGD',
    resourceId:'coal',quantity:50,remainingQuantity:50,stage:'RAW_EXTRACTED'
  }]}};

  const result=await runtime.saveSlot('single-pass-save');
  assert.equal(result.ok,true);
  assert.equal(result.storage,'LOCAL_STORAGE_FALLBACK');
  const serialized=sandbox.localStorage.getItem(result.key);
  assert.equal(typeof serialized,'string');
  const snapshot=JSON.parse(serialized);
  assert.match(snapshot.checksum,/^[0-9a-f]{8}$/);
  assert.equal(snapshot.checksum,runtime.saveState({includeDiagnostics:false}).checksum,
    'saveSlot checksum must match the public deterministic saveState checksum');
  assert.equal(snapshot.worldState.resource.BGD.inventory.coal,50);

  state.resource.BGD.inventory.coal=999;
  assert.equal((await runtime.loadSlot('single-pass-save')).lastLoadIntegrity,'VERIFIED');
  assert.equal(runtime.world.state,state,'loadSlot must preserve the single authoritative Game.state root');
  assert.equal(state.resource.BGD.inventory.coal,50,
    'single-pass serialized saves must restore the authoritative world state');
});

test('turn autosave uses IndexedDB first and keeps localStorage as a recovery fallback',()=>{
  const lifecycle=fs.readFileSync(new URL('../omega_game_lifecycle_runtime_v1.js',import.meta.url),'utf8');
  assert.match(lifecycle,/includeDiagnostics:\s*options\.committedTurn !== true && options\.includeDiagnostics !== false/);
  const indexedStart=lifecycle.indexOf('if (options.committedTurn && g.indexedDB)');
  const serializedStart=lifecycle.indexOf('var serialized;',indexedStart);
  assert.ok(indexedStart>=0&&serializedStart>indexedStart,'committed-turn IndexedDB branch must precede synchronous JSON serialization');
  const indexedBranch=lifecycle.slice(indexedStart,serializedStart);
  assert.ok(indexedBranch.includes('persistBackup(snapshot)'),'committed turns must wait for the IndexedDB snapshot');
  assert.ok(indexedBranch.indexOf('persistBackup(snapshot)')<indexedBranch.indexOf('g.localStorage.setItem(SAVE_KEY, fallbackSerialized)'),
    'localStorage may only be written from the IndexedDB-failure fallback');
  assert.ok(indexedBranch.includes('JSON.stringify(snapshot)'),'the fallback must retain a durable save path');
});
