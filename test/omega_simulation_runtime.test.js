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
  const {sandbox,state,events}=makeSandbox();
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

test('real-time frame drops excess elapsed time instead of running a multi-turn catch-up burst',async()=>{
  const {sandbox,state,events}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  sandbox.Omega.Simulation.configure({state,worldEngine:{setAuthoritativeState(){},processSimulationTick(){return {advanced:true};}}});
  const sim=sandbox.Omega.Simulation;
  sim.createSession({playerCountryId:'BANGLADESH'});
  sim.startSession({playerCountryId:'BANGLADESH'});
  const frame=await sim.frame(15000*5);
  assert.equal(frame.steps,1,'a single coordinator frame must commit at most one in-game day');
  assert.equal(sim.clock.turn,1);
  assert.equal(sim.clock.accumulatorMs,0,'overdue days must not remain queued for a later burst');
  assert.equal(sim.clock.droppedScaledTimeMs,15000*4,'discarded scaled time must be visible in diagnostics');
  assert.equal(sim.diagnostics().clock.droppedScaledTimeMs,60000);
  assert.equal(sim.diagnostics().timeDiscards.totalScaledMs,60000);
  assert.equal(sim.diagnostics().timeDiscards.eventCount,1);
  assert.equal(events.filter(event=>event.type==='OMEGA_SIMULATION_TIME_DROPPED').length,1,
    'the dropped scaled time must be surfaced as a monitorable runtime event');
});

test('faster game speed preserves fractional calendar-day progress after a capped frame', async () => {
  const { sandbox, state } = makeSandbox();
  loadScript('omega_simulation_runtime.js', sandbox);
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine: { setAuthoritativeState() {}, processSimulationTick() { return { advanced:true }; } }
  });
  const sim = sandbox.Omega.Simulation;
  sim.createSession({ playerCountryId:'BANGLADESH' });
  sim.startSession({ playerCountryId:'BANGLADESH' });
  sim.clock.setSpeed(2);

  const frame = await sim.frame(8000);
  assert.equal(frame.steps, 1, 'a 2x frame with 16 seconds of scaled time commits one day only');
  assert.equal(sim.clock.turn, 1);
  assert.equal(sim.clock.accumulatorMs, 1000, 'the unconsumed partial day must be retained');
  assert.equal(sim.clock.droppedScaledTimeMs, 0, 'no complete extra day was skipped');
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
  assert.equal(sandbox.Omega.Simulation.clock.droppedScaledTimeMs, 49 * 15000,
    'overlapping frame time beyond the one-day pending cap must be visible in diagnostics');
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

test('large canonical save slots use gzip storage and restore the original world',async()=>{
  const {sandbox,state}=makeSandbox();
  Object.assign(sandbox,{
    Blob:globalThis.Blob,
    Response:globalThis.Response,
    ReadableStream:globalThis.ReadableStream,
    TextEncoder:globalThis.TextEncoder,
    CompressionStream:globalThis.CompressionStream,
    DecompressionStream:globalThis.DecompressionStream,
    btoa:globalThis.btoa,
    atob:globalThis.atob
  });
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.resource={BGD:{inventory:{coal:50},batches:[],auditLog:'OMEGA-CANONICAL-SAVE-'.repeat(12000)}};

  const result=await runtime.saveSlot('compressed-save');
  assert.equal(result.ok,true);
  assert.equal(result.compression,'GZIP_BASE64');
  assert.ok(result.storedBytes<result.originalBytes,
    'gzip envelope must be smaller than the canonical plain JSON');
  const stored=sandbox.localStorage.getItem(result.key);
  assert.ok(stored.startsWith('OMEGA_SIM_SAVE_GZIP_V1:'));

  state.resource.BGD.inventory.coal=999;
  const restored=await runtime.loadSlot('compressed-save');
  assert.equal(restored.lastLoadIntegrity,'VERIFIED');
  assert.equal(state.resource.BGD.inventory.coal,50,
    'compressed saves must restore the same authoritative world state');
  assert.equal(state.resource.BGD.auditLog,'OMEGA-CANONICAL-SAVE-'.repeat(12000));
});

test('large IndexedDB save slots retain gzip as Blob without base64 expansion',async()=>{
  const {sandbox,state}=makeSandbox();
  const records=new Map();
  const database={
    objectStoreNames:{contains(){return true;}},
    close(){},
    transaction(){
      const transaction={};
      transaction.objectStore=()=>({
        put(value,key){
          const request={};
          queueMicrotask(()=>{
            records.set(String(key),value);
            request.result=String(key);
            request.onsuccess?.();
            transaction.oncomplete?.();
          });
          return request;
        },
        get(key){
          const request={};
          queueMicrotask(()=>{
            request.result=records.get(String(key))??null;
            request.onsuccess?.();
            transaction.oncomplete?.();
          });
          return request;
        }
      });
      return transaction;
    }
  };
  sandbox.indexedDB={
    open(){
      const request={};
      queueMicrotask(()=>{
        request.result=database;
        request.onsuccess?.();
      });
      return request;
    }
  };
  Object.assign(sandbox,{
    Blob:globalThis.Blob,
    Response:globalThis.Response,
    ReadableStream:globalThis.ReadableStream,
    TextEncoder:globalThis.TextEncoder,
    CompressionStream:globalThis.CompressionStream,
    DecompressionStream:globalThis.DecompressionStream,
    btoa:globalThis.btoa,
    atob:globalThis.atob
  });
  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  const audit=('OMEGA-IDB-BLOB-SAVE-বাংলা-😀-').repeat(12000);
  state.resource={BGD:{inventory:{coal:50},batches:[],auditLog:audit}};

  const result=await runtime.saveSlot('indexeddb-blob-save');
  assert.equal(result.ok,true);
  assert.equal(result.storage,'INDEXEDDB');
  assert.equal(result.compression,'GZIP_BLOB');
  assert.ok(result.storedBytes<result.originalBytes,
    'the IndexedDB gzip Blob must remain smaller than the canonical snapshot');

  const stored=records.get(result.key);
  assert.ok(stored instanceof globalThis.Blob,
    'IndexedDB must retain a structured-clone Blob, not a base64-expanded string');
  const prefix=await new globalThis.Response(stored.slice(0,'OMEGA_SIM_SAVE_GZIP_V1:'.length)).text();
  assert.equal(prefix,'OMEGA_SIM_SAVE_GZIP_V1:');

  state.resource.BGD.inventory.coal=999;
  const restored=await runtime.loadSlot('indexeddb-blob-save');
  assert.equal(restored.lastLoadIntegrity,'VERIFIED');
  assert.equal(state.resource.BGD.inventory.coal,50);
  assert.equal(state.resource.BGD.auditLog,audit);
  assert.equal(runtime.world.state,state,
    'Blob-backed IndexedDB restore must preserve the authoritative Game.state root');
});

test('concurrent IndexedDB saves to different slots do not supersede each other',async()=>{
  const {sandbox,state}=makeSandbox();
  const records=new Map();
  const database={
    objectStoreNames:{contains(){return true;}},
    close(){},
    transaction(){
      const transaction={};
      transaction.objectStore=()=>({
        put(value,key){
          const request={};
          queueMicrotask(()=>{
            records.set(String(key),value);
            request.result=String(key);
            request.onsuccess?.();
            transaction.oncomplete?.();
          });
          return request;
        },
        get(key){
          const request={};
          queueMicrotask(()=>{
            request.result=records.get(String(key))??null;
            request.onsuccess?.();
            transaction.oncomplete?.();
          });
          return request;
        }
      });
      return transaction;
    }
  };
  sandbox.indexedDB={
    open(){
      const request={};
      queueMicrotask(()=>{
        request.result=database;
        request.onsuccess?.();
      });
      return request;
    }
  };

  let signalCompressionStarted;
  const compressionStarted=new Promise(resolve=>{signalCompressionStarted=resolve;});
  let releaseCompression;
  const compressionGate=new Promise(resolve=>{releaseCompression=resolve;});
  let heldFirstChunk=false;
  class ControlledCompressionStream{
    constructor(){
      return new globalThis.TransformStream({
        async transform(chunk,controller){
          if(!heldFirstChunk){
            heldFirstChunk=true;
            signalCompressionStarted();
            await compressionGate;
          }
          controller.enqueue(chunk);
        }
      });
    }
  }
  class PassThroughDecompressionStream{
    constructor(){return new globalThis.TransformStream();}
  }
  Object.assign(sandbox,{
    Blob:globalThis.Blob,
    Response:globalThis.Response,
    ReadableStream:globalThis.ReadableStream,
    TextEncoder:globalThis.TextEncoder,
    TransformStream:globalThis.TransformStream,
    CompressionStream:ControlledCompressionStream,
    DecompressionStream:PassThroughDecompressionStream
  });

  loadScript('omega_simulation_runtime.js',sandbox);
  const runtime=sandbox.Omega.Simulation;
  state.resource={BGD:{inventory:{coal:50},batches:[],saveMarker:'SHARED_WORLD_STATE'}};

  // Hold the first slot inside stream compression, then start another slot.
  // A process-wide sequence counter incorrectly superseded the first checkpoint.
  const mineSavePromise=runtime.saveSlot('mine-e2e-checkpoint');
  await compressionStarted;
  const defaultSavePromise=runtime.saveSlot('default');
  releaseCompression();

  const [mineSave,defaultSave]=await Promise.all([mineSavePromise,defaultSavePromise]);
  assert.equal(mineSave.ok,true);
  assert.equal(defaultSave.ok,true);
  assert.equal(mineSave.storage,'INDEXEDDB');
  assert.equal(defaultSave.storage,'INDEXEDDB');
  assert.equal(records.has(mineSave.key),true,
    'an unrelated default-slot write must not cancel the mine E2E checkpoint');
  assert.equal(records.has(defaultSave.key),true,
    'the default lifecycle save must also remain durable');

  state.resource.BGD.inventory.coal=999;
  await runtime.loadSlot('mine-e2e-checkpoint');
  assert.equal(state.resource.BGD.inventory.coal,50,
    'the named checkpoint must survive a later write to the default slot');
  await runtime.loadSlot('default');
  assert.equal(state.resource.BGD.inventory.coal,50,
    'the default checkpoint must remain independently loadable');
});

test('turn autosave uses the canonical IndexedDB slot and retains legacy recovery',()=>{
  const lifecycle=fs.readFileSync(new URL('../omega_game_lifecycle_runtime_v1.js',import.meta.url),'utf8');
  const runtime=fs.readFileSync(new URL('../omega_simulation_runtime.js',import.meta.url),'utf8');

  assert.match(lifecycle,/operation = sim\.saveSlot\(SLOT,\s*\{/,
    'the lifecycle must persist through the canonical Simulation save API');
  assert.match(lifecycle,/await sim\.loadSlot\(SLOT\)/,
    'the lifecycle must restore through the same canonical slot');
  assert.match(runtime,/async saveSlot\(slot='default',\s*options=/);
  assert.match(runtime,/const stored=encodeStoredSnapshot\(snapshot,\s*options\)/,
    'the canonical save API must stream the authoritative snapshot into a compressed-or-plain storage envelope');
  assert.match(runtime,/function\* saveSnapshotJsonChunks\(snapshot\)/,
    'the streaming serializer must emit canonical JSON in bounded chunks');
  assert.match(runtime,/hash=updateChecksumHash\(hash,chunk\)/,
    'the persisted checksum must be calculated from the exact chunks written');
  assert.match(runtime,/if\(this\.saveBarrier\)\{\s*await this\.saveBarrier;/,
    'the next game turn must wait while the authoritative save stream is being written');
  assert.match(runtime,/indexedDbSaveRequest\(global\.indexedDB,'put',key,stored\.value\)/,
    'the canonical save API must write its storage envelope to IndexedDB first');
  assert.match(runtime,/const decoded=await decodeStoredSave\(raw\)/,
    'the canonical save API must decode compressed slots while retaining plain JSON compatibility');
  assert.match(runtime,/LOCAL_STORAGE_FALLBACK/,
    'the canonical slot must retain a localStorage fallback when IndexedDB is unavailable');
  assert.match(lifecycle,/function readIndexedSave\(/,
    'old lifecycle IndexedDB saves remain available for migration');
  assert.match(lifecycle,/var local = parseLocalSave\(\)/,
    'legacy localStorage saves remain available when the canonical slot cannot be restored');
  assert.doesNotMatch(lifecycle,/function writeIndexedSave\(/,
    'the retired lifecycle database must not receive a duplicate write for each canonical save');
});

test('manual day batches use the full pipeline and restore the paused session state',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  let participantTurns=0;
  sandbox.Omega.Simulation.configure({state,worldEngine:{setAuthoritativeState(){},processSimulationTick(){return {advanced:true};}}});
  const sim=sandbox.Omega.Simulation;
  sim.createSession({playerCountryId:'BANGLADESH'});
  sim.registerTurnParticipant('test.manual-day-observer',async(_event,context)=>{participantTurns+=1;return {turn:context.turn};});
  sim.pauseSession();
  const result=await sim.advance(4,{yieldEvery:1});
  assert.equal(result.steps,4);
  assert.equal(result.turn,4);
  assert.equal(participantTurns,4,'manual advance must run every authoritative participant once per day');
  assert.equal(state.simulation.date,'2015-01-05T00:00:00.000Z');
  assert.equal(sim.status,'PAUSED','manual testing must not silently resume automatic time');
  assert.equal(sim.clock.paused,true);
  assert.equal(sim.clock.running,false);
  assert.equal(sim.manualAdvanceInProgress,false);
});

test('manual day batches can be cancelled after the current authoritative day commits',async()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  let release,notifyStarted;
  const gate=new Promise(resolve=>{release=resolve;});
  const started=new Promise(resolve=>{notifyStarted=resolve;});
  sandbox.Omega.Simulation.configure({state,worldEngine:{setAuthoritativeState(){},processSimulationTick(){return {advanced:true};}}});
  const sim=sandbox.Omega.Simulation;
  sim.createSession({playerCountryId:'BANGLADESH'});
  sim.pauseSession();
  sim.registerTurnParticipant('test.manual-cancellable',async()=>{notifyStarted();await gate;});
  const running=sim.advance(5);
  await started;
  assert.equal(sim.cancelAdvance(),true);
  release();
  const result=await running;
  assert.equal(result.steps,1,'cancellation must finish the in-flight day but not start another');
  assert.equal(result.cancelled,true);
  assert.equal(sim.clock.turn,1);
  assert.equal(sim.status,'PAUSED');
});

test('pausing during a slow turn discards pending real-time frames before resume', async () => {
  const { sandbox, state } = makeSandbox();
  loadScript('omega_simulation_runtime.js', sandbox);
  let release, notifyStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { notifyStarted = resolve; });
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine: { setAuthoritativeState() {}, processSimulationTick() { return { advanced:true }; } },
    ministryPump: async () => { notifyStarted(); await gate; }
  });
  const sim = sandbox.Omega.Simulation;
  sim.createSession({ playerCountryId:'BANGLADESH' });
  sim.startSession({ playerCountryId:'BANGLADESH' });
  const inFlight = sim.frame(15000);
  await started;
  await sim.frame(15000);
  assert.equal(sim.pendingRealDeltaMs, 15000);
  sim.pauseSession();
  assert.equal(sim.pendingRealDeltaMs, 0, 'pause must clear elapsed time queued behind an active turn');
  release();
  await inFlight;
  assert.equal(sim.status, 'PAUSED');
  assert.equal(sim.clock.paused, true);
  sim.resumeSession();
  const resumed = await sim.frame(0);
  assert.equal(resumed.steps, 0, 'resume must not replay elapsed time collected before the pause');
  assert.equal(sim.clock.turn, 1);
});


test('manual batch respects an external pause when the prior session was running', async () => {
  const { sandbox, state } = makeSandbox();
  loadScript('omega_simulation_runtime.js', sandbox);
  let release, notifyStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { notifyStarted = resolve; });
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine: { setAuthoritativeState() {}, processSimulationTick() { return { advanced:true }; } }
  });
  const sim = sandbox.Omega.Simulation;
  sim.createSession({ playerCountryId:'BANGLADESH' });
  sim.startSession({ playerCountryId:'BANGLADESH' });
  sim.registerTurnParticipant('test.running-manual-pause', async () => {
    notifyStarted();
    await gate;
  });
  const batch = sim.advance(3);
  await started;
  sim.pauseSession();
  release();
  const result = await batch;
  assert.equal(result.steps, 1);
  assert.equal(result.cancelled, true);
  assert.equal(sim.status, 'PAUSED', 'an external pause must not be overwritten by the pre-batch RUNNING state');
  assert.equal(sim.clock.paused, true);
});



test('economy phase checkpoint seeds a legacy baseline once without replaying old turns',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const sim=sandbox.Omega.Simulation,session=sim.createSession({playerCountryId:'USA',startTurn:27});
  const checkpoints=sandbox.Omega.EconomyPhaseCheckpoints;
  const scope={domain:'resources',countryId:'USA',sessionId:session.sessionId};
  const seeded=checkpoints.seed({...scope,baselineTurn:27,source:'LEGACY_SAVE_MIGRATION'});
  assert.equal(seeded.status,'SEEDED');
  assert.equal(seeded.checkpoint.lastProcessedTurn,27);
  assert.equal(seeded.checkpoint.pendingElapsedDays,0);
  assert.equal(state.simulation.economyPhaseArchitectureV1.checkpoints[
    'resources|USA|'+encodeURIComponent(session.sessionId)
  ]?.baseline?.turn,27);
  assert.equal(checkpoints.seed({...scope,baselineTurn:27,source:'LEGACY_SAVE_MIGRATION'}).status,'ALREADY_SEEDED');
  assert.equal(checkpoints.seed({...scope,baselineTurn:12,source:'LEGACY_SAVE_MIGRATION'}).status,'ALREADY_INITIALIZED');
  const next=checkpoints.begin({...scope,executionId:'RES-USA-28',targetTurn:29});
  assert.equal(next.status,'STARTED');
  assert.equal(next.execution.fromTurn,28,'legacy turns before the seeded baseline must never be replayed');
  assert.equal(next.checkpoint.pendingElapsedDays,2);
});

test('economy phase checkpoints accumulate elapsed turns without skipping pending days',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const sim=sandbox.Omega.Simulation,session=sim.createSession({playerCountryId:'USA'});
  const checkpoints=sandbox.Omega.EconomyPhaseCheckpoints;
  const scope={domain:'resources',countryId:'USA',sessionId:session.sessionId};
  const started=checkpoints.begin({...scope,executionId:'RES-USA-3',targetTurn:3});
  assert.equal(started.status,'STARTED');
  assert.equal(started.checkpoint.pendingElapsedDays,3);
  const partial=checkpoints.commit({...scope,executionId:'RES-USA-3',processedThroughTurn:2,
    processedDate:'2026-11-27',phase:'RESOURCE_RECONCILIATION',
    reconciliation:{status:'RECONCILED',evidenceId:'RESOURCE-LEDGER-2'}});
  assert.equal(partial.status,'COMMITTED');
  assert.equal(partial.checkpoint.lastProcessedTurn,2);
  assert.equal(partial.checkpoint.pendingElapsedDays,1);
  assert.equal(partial.checkpoint.status,'CATCHING_UP');
  const next=checkpoints.begin({...scope,executionId:'RES-USA-4',targetTurn:4});
  assert.equal(next.status,'STARTED');
  assert.equal(next.execution.fromTurn,3);
  assert.equal(next.execution.throughTurn,4);
  assert.equal(next.checkpoint.pendingElapsedDays,2);
  const complete=checkpoints.commit({...scope,executionId:'RES-USA-4',processedThroughTurn:4,
    processedDate:'2026-11-29',phase:'RESOURCE_RECONCILIATION',
    reconciliation:{status:'RECONCILED',evidenceId:'RESOURCE-LEDGER-4'}});
  assert.equal(complete.checkpoint.lastProcessedTurn,4);
  assert.equal(complete.checkpoint.pendingElapsedDays,0);
  assert.equal(complete.checkpoint.status,'READY');
  assert.equal(state.simulation.economyPhaseArchitectureV1.schemaVersion,1);
});

test('failed economy phase cannot advance and recovery requires reconciliation evidence',()=>{
  const {sandbox}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const sim=sandbox.Omega.Simulation,session=sim.createSession({playerCountryId:'USA'});
  const checkpoints=sandbox.Omega.EconomyPhaseCheckpoints;
  const scope={domain:'industrial',countryId:'USA',sessionId:session.sessionId};
  assert.equal(checkpoints.begin({...scope,executionId:'IND-USA-2',targetTurn:2}).status,'STARTED');
  const failed=checkpoints.fail({...scope,executionId:'IND-USA-2',error:'WAREHOUSE_RECONCILIATION_FAILED'});
  assert.equal(failed.status,'FAILED');
  assert.equal(failed.checkpoint.lastProcessedTurn,0);
  assert.equal(failed.checkpoint.pendingElapsedDays,2);
  assert.equal(checkpoints.resume({...scope,executionId:'IND-USA-2'}).status,'RECONCILIATION_REQUIRED');
  const resumed=checkpoints.resume({...scope,executionId:'IND-USA-2',
    reconciliation:{status:'RECONCILED',evidenceId:'WAREHOUSE-REVIEW-2'}});
  assert.equal(resumed.status,'RESUMED');
  const committed=checkpoints.commit({...scope,executionId:'IND-USA-2',processedThroughTurn:2,
    phase:'INDUSTRIAL_RECONCILIATION',
    reconciliation:{status:'RECONCILED',evidenceId:'WAREHOUSE-LEDGER-2'}});
  assert.equal(committed.status,'COMMITTED');
  assert.equal(committed.checkpoint.lastProcessedTurn,2);
});

test('economy mutation journal suppresses duplicates and only retries after NOT_POSTED proof',()=>{
  const {sandbox}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const sim=sandbox.Omega.Simulation,session=sim.createSession({playerCountryId:'USA'});
  const checkpoints=sandbox.Omega.EconomyPhaseCheckpoints;
  const scope={domain:'resources',countryId:'USA',sessionId:session.sessionId,
    executionId:'RES-USA-1',operationId:'MINE_ROYALTY_POST'};
  const generated=checkpoints.idempotencyKey(scope);
  assert.equal(generated.status,'OK');
  const mutation={...scope,key:generated.key};
  assert.equal(checkpoints.reserveMutation(mutation).status,'RESERVED');
  assert.equal(checkpoints.reserveMutation(mutation).status,'RECONCILIATION_REQUIRED');
  assert.equal(checkpoints.completeMutation({...mutation,evidence:{status:'POSTED',evidenceId:'TREASURY-LEDGER-1'}}).status,'POSTED');
  assert.equal(checkpoints.reserveMutation(mutation).status,'DUPLICATE');
  const second={...scope,operationId:'WAREHOUSE_CREDIT'};
  second.key=checkpoints.idempotencyKey(second).key;
  assert.equal(checkpoints.reserveMutation(second).status,'RESERVED');
  assert.equal(checkpoints.reconcileMutation({...second,evidence:{status:'NOT_POSTED',evidenceId:'WAREHOUSE-AUDIT-1'}}).status,'RETRYABLE');
  assert.equal(checkpoints.reserveMutation(second).status,'RETRY_ALLOWED');
  assert.equal(checkpoints.reserveMutation({...mutation,countryId:'CAN'}).reason,'PLAYER_SESSION_IDENTITY_MISMATCH');
});

test('economy phase checkpoints and mutation journal survive canonical save/load',()=>{
  const {sandbox,state}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const sim=sandbox.Omega.Simulation,session=sim.createSession({playerCountryId:'USA'});
  const checkpoints=sandbox.Omega.EconomyPhaseCheckpoints;
  const scope={domain:'resources',countryId:'USA',sessionId:session.sessionId};
  checkpoints.begin({...scope,executionId:'SAVE-RECOVERY-1',targetTurn:5});
  const key=checkpoints.idempotencyKey({...scope,executionId:'SAVE-RECOVERY-1',operationId:'MINE_OUTPUT'}).key;
  checkpoints.reserveMutation({...scope,executionId:'SAVE-RECOVERY-1',operationId:'MINE_OUTPUT',key});
  const saved=sim.saveState();
  assert.equal(saved.worldState.simulation.economyPhaseArchitectureV1.checkpoints[
    'resources|USA|'+encodeURIComponent(session.sessionId)].status,'RUNNING');
  state.simulation.turn=99;
  sim.loadState(saved);
  const restored=checkpoints.get(scope);
  assert.equal(restored.checkpoint.status,'RUNNING');
  assert.equal(restored.checkpoint.pendingElapsedDays,5);
  assert.equal(checkpoints.reserveMutation({...scope,executionId:'SAVE-RECOVERY-1',operationId:'MINE_OUTPUT',key}).status,'RECONCILIATION_REQUIRED');
  assert.equal(sim.diagnostics().lastLoadIntegrity,'VERIFIED');
});

test('checkpoint foundation preserves player-country and active-session identity and keeps Food disabled',()=>{
  const {sandbox}=makeSandbox();
  loadScript('omega_simulation_runtime.js',sandbox);
  const sim=sandbox.Omega.Simulation,session=sim.createSession({playerCountryId:'USA'});
  const checkpoints=sandbox.Omega.EconomyPhaseCheckpoints;
  assert.equal(checkpoints.begin({domain:'resources',countryId:'CAN',sessionId:session.sessionId,
    executionId:'WRONG-COUNTRY',targetTurn:1}).reason,'PLAYER_SESSION_IDENTITY_MISMATCH');
  assert.equal(checkpoints.begin({domain:'resources',countryId:'USA',sessionId:'OLD-SESSION',
    executionId:'OLD-SESSION',targetTurn:1}).reason,'PLAYER_SESSION_IDENTITY_MISMATCH');
  assert.equal(checkpoints.begin({domain:'food',countryId:'USA',sessionId:session.sessionId,
    executionId:'FOOD-1',targetTurn:1}).reason,'DOMAIN_NOT_ENABLED');
});


test('simulation diagnostics measure each participant with bounded rolling samples',async()=>{
  const {sandbox,state}=makeSandbox();
  let now=100;
  sandbox.performance={now:()=>now};
  loadScript('omega_simulation_runtime.js',sandbox);
  sandbox.Omega.Simulation.configure({
    state,
    worldEngine:{setAuthoritativeState(){},processSimulationTick(){return{advanced:true};}}
  });
  const sim=sandbox.Omega.Simulation;
  sim.createSession({playerCountryId:'BANGLADESH'});
  sim.registerTurnParticipant('test.timed-participant',async()=>{
    now+=12.5;
    return{result:'measured'};
  });
  const result=await sim.advance(1);
  assert.equal(result.steps,1);
  const diagnostics=sim.diagnostics();
  const timing=diagnostics.turnParticipants.find(row=>row.id==='test.timed-participant');
  assert.equal(timing.sampleCount,1);
  assert.equal(timing.rollingSampleCount,1);
  assert.equal(timing.lastDurationMs,12.5);
  assert.equal(timing.averageDurationMs,12.5);
  assert.equal(timing.maxDurationMs,12.5);
  assert.equal(timing.p95DurationMs,12.5);
  assert.equal(diagnostics.lastTurnParticipantResults.find(row=>row.id==='test.timed-participant').durationMs,12.5);
  assert.equal(state.simulation.participantTimings,undefined,
    'process-local timing samples must not create another durable save-state authority');
});
