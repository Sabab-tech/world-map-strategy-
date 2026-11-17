import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function makeIndexedDbMemory(){
  const records=new Map();
  const database={
    objectStoreNames:{contains(){return true;}},
    transaction(){
      const callbacks=[];
      const transaction={error:null,objectStore(){
        return {
          put(value,key){
            records.set(String(key),value);
            const request={};
            callbacks.push(()=>request.onsuccess?.());
            return request;
          },
          get(key){
            const request={};
            callbacks.push(()=>{
              request.result=records.has(String(key))?records.get(String(key)):undefined;
              request.onsuccess?.();
            });
            return request;
          },
          delete(key){
            records.delete(String(key));
            const request={};
            callbacks.push(()=>request.onsuccess?.());
            return request;
          },
          getAllKeys(){
            const request={};
            callbacks.push(()=>{
              request.result=[...records.keys()];
              request.onsuccess?.();
            });
            return request;
          }
        };
      }};
      setTimeout(()=>{
        for(const callback of callbacks)callback();
        setTimeout(()=>transaction.oncomplete?.(),0);
      },0);
      return transaction;
    },
    close(){}
  };
  return {
    records,
    indexedDB:{open(){
      const request={};
      setTimeout(()=>{request.result=database;request.onsuccess?.();},0);
      return request;
    }}
  };
}

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

test('frame scheduler advances one calendar day per fifteen-second driver interval',async()=>{
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

  await sandbox.Omega.Simulation.frame(14999);
  assert.equal(steps,0);

  await sandbox.Omega.Simulation.frame(1);
  assert.equal(steps,1);
  assert.equal(sandbox.Omega.Simulation.clock.turn,1);
  assert.equal(sandbox.Omega.Simulation.clock.simulationTimeMs,86400000);

  await sandbox.Omega.Simulation.frame(15000);
  assert.equal(steps,2);
  assert.equal(sandbox.Omega.Simulation.clock.turn,2);
  assert.equal(sandbox.Omega.Simulation.clock.simulationTimeMs,172800000);
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
  const activeFrame=sandbox.Omega.Simulation.frame(15000);
  await turnStarted;
  for(let i=0;i<50;i++){
    const pending=sandbox.Omega.Simulation.frame(15000);
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

test('streamed save checksum matches the canonical sorted JSON checksum without materializing it',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  state.resource={BGD:{inventory:{coal:50},batches:[{batchId:'STREAM-CHECKSUM',quantity:20}]}};
  const runtime=sandbox.Omega.Simulation;
  const snapshot=runtime.saveState({includeDiagnostics:false});
  const stable=value=>{
    if(value===null)return 'null';
    if(value===undefined)return 'null';
    if(value instanceof Date)return JSON.stringify(value.toISOString());
    if(typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    return '{'+Object.keys(value).filter(key=>key!=='__proto__'&&key!=='constructor'&&key!=='checksum'&&
      typeof value[key]!=='function'&&value[key]!==undefined).sort()
      .map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  };
  let hash=2166136261;
  const textValue=stable(snapshot);
  for(let i=0;i<textValue.length;i++){hash^=textValue.charCodeAt(i);hash=Math.imul(hash,16777619);}
  assert.equal(snapshot.checksum,(hash>>>0).toString(16).padStart(8,'0'));
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

test('large canonical save slots are chunked, committed by manifest and restored intact',async()=>{
  const {sandbox,state}=makeSandbox();
  const memory=makeIndexedDbMemory();
  sandbox.indexedDB=memory.indexedDB;
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  const payload='x'.repeat(9*1024*1024);
  state.resource={BGD:{inventory:{coal:50},largePayload:payload,batches:[]}};
  const saved=await runtime.saveSlot('large-chunked-save');
  assert.equal(saved.ok,true);
  assert.equal(saved.storage,'INDEXEDDB_CHUNKED');
  const manifest=memory.records.get(saved.key);
  assert.equal(manifest.__omegaSaveManifest,'OMEGA_CHUNKED_SAVE_V1');
  assert.ok(manifest.chunkCount>1);
  const chunkPrefix=manifest.chunkPrefix;
  assert.equal(typeof chunkPrefix,'string');
  assert.ok(chunkPrefix.startsWith(saved.key+'.stage.'));
  const chunkKeys=[...memory.records.keys()].filter(key=>key.startsWith(chunkPrefix));
  assert.equal(chunkKeys.length,manifest.chunkCount);
  assert.ok(chunkKeys.every(key=>memory.records.get(key).length<=2*1024*1024));

  state.resource.BGD.largePayload='changed';
  const sandboxArray=vm.runInNewContext('Array',sandbox);
  const originalJoin=sandboxArray.prototype.join;
  let fullSaveJoinAttempted=false;
  sandboxArray.prototype.join=function(separator){
    if(separator===''&&this.length>1&&this.every(value=>
      typeof value==='string'&&value.length>1024*1024)){
      fullSaveJoinAttempted=true;
      throw new Error('CHUNKED_SAVE_RESTORE_MUST_NOT_JOIN_FULL_PAYLOAD');
    }
    return originalJoin.call(this,separator);
  };
  let loaded;
  try{
    loaded=await runtime.loadSlot('large-chunked-save');
  }finally{
    sandboxArray.prototype.join=originalJoin;
  }
  assert.equal(fullSaveJoinAttempted,false,
    'chunked restore must parse/checksum the chunks without joining the whole save string');
  assert.equal(loaded.lastLoadIntegrity,'VERIFIED');
  assert.equal(state.resource.BGD.largePayload,payload,
    'the chunk manifest must restore the exact canonical world payload');
  assert.strictEqual(runtime.world.state,state);
});

test('very large canonical save slots use structured IndexedDB snapshots and restore without joining one JSON string',async()=>{
  const {sandbox,state}=makeSandbox();
  const memory=makeIndexedDbMemory();
  sandbox.indexedDB=memory.indexedDB;
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  const payload='y'.repeat(17*1024*1024);
  state.resource={BGD:{inventory:{coal:50},largePayload:payload,batches:[]}};

  const saved=await runtime.saveSlot('large-structured-save');
  assert.equal(saved.ok,true);
  assert.equal(saved.storage,'INDEXEDDB_STRUCTURED');
  const record=memory.records.get(saved.key);
  assert.ok(record.serializedLength>16*1024*1024);
  assert.equal(record.__omegaSaveSnapshot,'OMEGA_STRUCTURED_SAVE_V1');
  assert.equal(record.checksum,saved.checksum);
  assert.equal(record.turn,runtime.clock.turn);
  assert.equal(record.snapshot.worldState.resource.BGD.largePayload,payload);
  assert.equal([...memory.records.keys()].filter(key=>
    key.startsWith(saved.key+'.chunk.')||key.startsWith(saved.key+'.stage.')).length,0,
    'staged chunks must be removed only after the structured snapshot record commits');

  state.resource.BGD.largePayload='changed-before-restore';
  const loaded=await runtime.loadSlot('large-structured-save');
  assert.equal(loaded.lastLoadIntegrity,'VERIFIED');
  assert.equal(state.resource.BGD.largePayload,payload,
    'structured snapshots restore the exact canonical payload without a giant JSON join');
  assert.strictEqual(runtime.world.state,state);
});

test('a compact replacement save removes stale chunks only after the new slot is committed',async()=>{
  const {sandbox,state}=makeSandbox();
  const memory=makeIndexedDbMemory();
  sandbox.indexedDB=memory.indexedDB;
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.resource={BGD:{largePayload:'x'.repeat(9*1024*1024)}};
  const first=await runtime.saveSlot('replace-chunked-save');
  assert.equal(first.storage,'INDEXEDDB_CHUNKED');
  state.resource.BGD.largePayload='compact';
  const second=await runtime.saveSlot('replace-chunked-save');
  assert.equal(second.storage,'INDEXEDDB');
  assert.equal(memory.records.get(second.key).startsWith('{'),true);
  assert.equal([...memory.records.keys()].filter(key=>
    key.startsWith(second.key+'.chunk.')||key.startsWith(second.key+'.stage.')).length,0);
  state.resource.BGD.largePayload='mutated';
  await runtime.loadSlot('replace-chunked-save');
  assert.equal(state.resource.BGD.largePayload,'compact');
});

test('the canonical save envelope stores ministry interoperability only once',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  let optionsSeen=null;
  sandbox.Omega.Simulation.configure({
    state,
    ministryRuntime:{
      saveState(options){optionsSeen=options;return {ministries:{finance:{ticks:1}}};},
      loadState(){return true;}
    },
    interoperability:{
      saveState(){return {deliveryLedger:{one:{status:'DELIVERED'}}};},
      loadState(){return true;}
    }
  });
  const snapshot=sandbox.Omega.Simulation.saveState({includeDiagnostics:false});
  assert.equal(optionsSeen.includeInteroperability,false);
  assert.equal(snapshot.ministryRuntime.interoperability,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.interoperability)),{deliveryLedger:{one:{status:'DELIVERED'}}});
});

test('turn autosave uses the canonical IndexedDB slot and retains legacy recovery',()=>{
  const lifecycle=fs.readFileSync(new URL('../omega_game_lifecycle_runtime_v1.js',import.meta.url),'utf8');
  const runtime=fs.readFileSync(new URL('../omega_simulation_runtime.js',import.meta.url),'utf8');

  assert.match(lifecycle,/operation = sim\.saveSlot\(SLOT\)/,
    'the lifecycle must persist through the canonical Simulation save API');
  assert.match(lifecycle,/await sim\.loadSlot\(SLOT\)/,
    'the lifecycle must restore through the same canonical slot');
  assert.match(runtime,/async saveSlot\(slot='default'\)/);
  assert.match(runtime,/persistCanonicalSave\(global\.indexedDB,key,snapshot,this\.clock\.turn\)/,
    'the canonical save API must stream its checksummed snapshot to IndexedDB in bounded chunks');
  assert.match(runtime,/LOCAL_STORAGE_FALLBACK/,
    'the canonical slot must retain a localStorage fallback when IndexedDB is unavailable');
  assert.match(lifecycle,/function readIndexedSave\(/,
    'old lifecycle IndexedDB saves remain available for migration');
  assert.match(lifecycle,/var local = parseLocalSave\(\)/,
    'legacy localStorage saves remain available when the canonical slot cannot be restored');
  assert.doesNotMatch(lifecycle,/function writeIndexedSave\(/,
    'the retired lifecycle database must not receive a duplicate write for each canonical save');
});
