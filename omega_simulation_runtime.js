/**
 * OMEGA SIMULATION AUTHORITY RUNTIME v1.0.0
 *
 * Canonical orchestration layer for the playable simulation.
 *
 * Responsibilities:
 *   - one simulation clock
 *   - one authoritative world-state root
 *   - one game-session lifecycle
 *   - deterministic command queue
 *   - ordered simulation phases
 *   - world-causal engine integration
 *   - ministry runtime integration
 *   - unified save/load envelope
 *
 * This layer orchestrates existing engines; it does not become a second domain database.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
  const SESSION_VERSION=1;
  const DAY_MS=86400000;
  const STEP_MS=15000;
  // A rendered frame may commit at most one day. Excess elapsed time is discarded
  // and measured instead of creating a burst of synchronous catch-up turns.
  const MAX_STEPS_PER_FRAME=1;
  const MAX_PENDING_REAL_DELTA_MS=STEP_MS;
  const MAX_MANUAL_ADVANCE_TURNS=365;
  const MAX_PARTICIPANTS_PER_SLICE=4;
  const MAX_EVENT_HISTORY=2000;
  const MAX_COMMAND_HISTORY=2000;

  const PHASES=Object.freeze([
    'INPUT',
    'VALIDATE',
    'SIMULATE',
    'COMMIT',
    'PUBLISH',
    'CHECKPOINT',
    'FINALIZE'
  ]);

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){
      const out=[];seen.set(value,out);
      for(const item of value)out.push(clone(item,seen));
      return out;
    }
    if(value instanceof Date)return new Date(value.getTime());
    const out={};seen.set(value,out);
    for(const key of Object.keys(value)){
      if(key==='__proto__'||key==='constructor')continue;
      const item=value[key];
      if(typeof item!=='function'&&item!==undefined)out[key]=clone(item,seen);
    }
    return out;
  }

  function stableStringify(value,omitRootChecksum=false){
    if(value===null)return 'null';
    if(value===undefined)return 'null';
    if(value instanceof Date)return JSON.stringify(value.toISOString());
    if(typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(item=>stableStringify(item)).join(',')+']';
    return '{'+Object.keys(value).filter(key=>key!=='__proto__'&&key!=='constructor'&&
      !(omitRootChecksum&&key==='checksum')&&typeof value[key]!=='function'&&value[key]!==undefined).sort()
      .map(key=>JSON.stringify(key)+':'+stableStringify(value[key])).join(',')+'}';
  }

  function checksumText(text){
    let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0).toString(16).padStart(8,'0');
  }

  function* stableJsonChunks(value,omitRootChecksum=false,isRoot=true){
    if(value===null||value===undefined){yield 'null';return;}
    if(value instanceof Date){yield JSON.stringify(value.toISOString());return;}
    if(typeof value!=='object'){
      const encoded=JSON.stringify(value);
      yield encoded===undefined?'null':encoded;
      return;
    }
    if(Array.isArray(value)){
      yield '[';
      for(let index=0;index<value.length;index++){
        if(index)yield ',';
        yield* stableJsonChunks(value[index],false,false);
      }
      yield ']';
      return;
    }
    const keys=Object.keys(value).filter(key=>key!=='__proto__'&&key!=='constructor'&&
      !(isRoot&&omitRootChecksum&&key==='checksum')&&typeof value[key]!=='function'&&value[key]!==undefined).sort();
    yield '{';
    for(let index=0;index<keys.length;index++){
      if(index)yield ',';
      const key=keys[index];
      yield JSON.stringify(key);
      yield ':';
      yield* stableJsonChunks(value[key],false,false);
    }
    yield '}';
  }

  function updateChecksumHash(hash,text){
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return hash>>>0;
  }

  function checksumSnapshot(value){
    // Hash canonical chunks in-place. Do not materialize a second full-world JSON string.
    let hash=2166136261;
    for(const chunk of stableJsonChunks(value||{},true,true))hash=updateChecksumHash(hash,chunk);
    return (hash>>>0).toString(16).padStart(8,'0');
  }

  function* saveSnapshotJsonChunks(snapshot){
    // Hash exactly the canonical JSON chunks as they are emitted. Appending
    // the checksum after the canonical closing brace preserves the same
    // checksum contract while avoiding a second traversal of a mutable root.
    let hash=2166136261;
    const emit=function*(chunk){
      hash=updateChecksumHash(hash,chunk);
      yield chunk;
    };
    yield* emit('{');
    const keys=Object.keys(snapshot||{}).filter(key=>key!=='__proto__'&&key!=='constructor'&&
      key!=='checksum'&&typeof snapshot[key]!=='function'&&snapshot[key]!==undefined).sort();
    for(let index=0;index<keys.length;index++){
      if(index)yield* emit(',');
      const key=keys[index];
      yield* emit(JSON.stringify(key));
      yield* emit(':');
      for(const chunk of stableJsonChunks(snapshot[key],false,false))yield* emit(chunk);
    }
    hash=updateChecksumHash(hash,'}');
    const checksum=(hash>>>0).toString(16).padStart(8,'0');
    if(keys.length)yield ',';
    yield '"checksum":'+JSON.stringify(checksum);
    yield '}';
  }

  function createSaveJsonStream(snapshot){
    if(typeof global.ReadableStream!=='function'||typeof global.TextEncoder!=='function')return null;
    const iterator=saveSnapshotJsonChunks(snapshot);
    const encoder=new global.TextEncoder();
    let originalBytes=0;
    const stream=new global.ReadableStream({
      pull(controller){
        try{
          let text='';
          while(text.length<65536){
            const next=iterator.next();
            if(next.done){
              if(text){
                const bytes=encoder.encode(text);originalBytes+=bytes.byteLength;controller.enqueue(bytes);
              }
              controller.close();return;
            }
            text+=next.value;
          }
          const bytes=encoder.encode(text);originalBytes+=bytes.byteLength;controller.enqueue(bytes);
        }catch(error){controller.error(error);}
      },
      cancel(){try{iterator.return?.();}catch(_){}}
    });
    return{stream,get originalBytes(){return originalBytes;}};
  }

  function serializeSaveSnapshot(snapshot){
    const canonical=stableStringify(snapshot,true);
    const checksum=checksumSnapshot(snapshot);
    return canonical.slice(0,1)+'"checksum":'+JSON.stringify(checksum)+
      (canonical.length>2?',':'')+canonical.slice(1);
  }

  function createSaveSnapshot(runtime,options={},referenceWorldState=false){
    const snapshot={
      schemaVersion:SESSION_VERSION,
      runtimeVersion:VERSION,
      status:runtime.status,
      clock:runtime.clock.snapshot(),
      // saveSlot holds the simulation save barrier while a bounded JSON
      // stream reads the authoritative root. Public saveState() keeps the
      // detached deep-clone contract by default.
      worldState:referenceWorldState?runtime.world.state:runtime.world.snapshot(),
      commands:runtime.commandQueue.snapshot(),
      events:runtime.events.snapshot(),
      ministryRuntime:runtime.ministryRuntime?.saveState?.()||null,
      interoperability:runtime.interoperability?.saveState?.()||null,
      worldEngine:runtime.worldEngine?.exportSaveState?.({authoritativeState:true})||null
    };
    // Phase 6 contributes only a compact calculation-provenance snapshot.
    // It is an optional extension outside the authoritative world tree, so older
    // saves remain compatible and no country/economy state is mutated.
    const phase6Api=global.OmegaPhase6NationalCapacity||global.Omega?.Phase6NationalCapacity;
    const phase6Snapshot=phase6Api?.saveState?.();
    if(phase6Snapshot)snapshot.phase6NationalCapacity=clone(phase6Snapshot);
    // Volatile diagnostics duplicate large participant results already held in
    // runtime memory. Callers can omit them from routine durable autosaves.
    if(options.includeDiagnostics!==false)snapshot.diagnostics=runtime.diagnostics();
    return snapshot;
  }

  const SAVE_COMPRESSION_PREFIX='OMEGA_SIM_SAVE_GZIP_V1:';

  function bytesToBase64(bytes){
    if(typeof global.btoa!=='function')throw new Error('SAVE_BASE64_ENCODER_UNAVAILABLE');
    let binary='';
    const chunkSize=0x8000;
    for(let offset=0;offset<bytes.length;offset+=chunkSize){
      const chunk=bytes.subarray(offset,Math.min(bytes.length,offset+chunkSize));
      binary+=String.fromCharCode.apply(null,chunk);
    }
    return global.btoa(binary);
  }

  function base64ToBytes(value){
    if(typeof global.atob!=='function')throw new Error('SAVE_BASE64_DECODER_UNAVAILABLE');
    const binary=global.atob(String(value||''));
    const bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    return bytes;
  }

  function encodeStoredSave(serialized){
    const originalBytes=typeof global.Blob==='function'
      ? new global.Blob([serialized]).size : String(serialized).length;
    // Preserve the original synchronous plain-JSON path when compression is
    // unavailable. pagehide/visibility flushes must not add a microtask before
    // localStorage receives the latest coherent checkpoint.
    if(typeof global.CompressionStream!=='function'||
       typeof global.DecompressionStream!=='function'||
       typeof global.Blob!=='function'||
       typeof global.Response!=='function'){
      return {
        value:serialized,
        compression:'NONE',
        originalBytes,
        storedBytes:String(serialized).length
      };
    }
    return (async function(){
      try{
        const source=new global.Blob([serialized]);
        const compressedStream=source.stream().pipeThrough(new global.CompressionStream('gzip'));
        const response=new global.Response(compressedStream);

        // IndexedDB supports structured-clone Blob values. Store the gzip stream
        // as a Blob rather than expanding it into a base64 string: large 197-country
        // snapshots otherwise need simultaneous plain JSON, compressed bytes,
        // binary-string and base64-string copies in the renderer process.
        if(global.indexedDB&&typeof global.indexedDB.open==='function'&&
           typeof response.blob==='function'){
          const compressedBlob=await response.blob();
          const encodedBlob=new global.Blob([SAVE_COMPRESSION_PREFIX,compressedBlob],
            {type:'application/x-omega-simulation-save'});
          if(encodedBlob.size<source.size){
            return {
              value:encodedBlob,
              compression:'GZIP_BLOB',
              originalBytes:source.size,
              storedBytes:encodedBlob.size
            };
          }
          return {
            value:serialized,
            compression:'NONE',
            originalBytes:source.size,
            storedBytes:String(serialized).length
          };
        }

        // Browsers without IndexedDB retain the compatible string envelope for
        // localStorage. This branch is intentionally not used for normal modern
        // IndexedDB saves because base64 increases renderer memory and stored size.
        if(typeof global.btoa!=='function'||typeof global.atob!=='function'){
          return {
            value:serialized,
            compression:'NONE',
            originalBytes:source.size,
            storedBytes:String(serialized).length
          };
        }
        const compressedBytes=new Uint8Array(await response.arrayBuffer());
        const encoded=SAVE_COMPRESSION_PREFIX+bytesToBase64(compressedBytes);
        if(encoded.length>=String(serialized).length){
          return {
            value:serialized,
            compression:'NONE',
            originalBytes:source.size,
            storedBytes:String(serialized).length
          };
        }
        return {
          value:encoded,
          compression:'GZIP_BASE64',
          originalBytes:source.size,
          storedBytes:encoded.length
        };
      }catch(error){
        // Compression is an optional storage optimization. A browser without a
        // functioning CompressionStream retains the established plain JSON path.
        return {
          value:serialized,
          compression:'NONE',
          originalBytes,
          storedBytes:String(serialized).length,
          compressionError:String(error&&error.message||error)
        };
      }
    })();
  }

  function encodeStoredSnapshot(snapshot,options={}){
    // A page-exit emergency checkpoint is synchronous. Normal no-IndexedDB
    // saves still use the established gzip/base64 storage optimization.
    if((!global.indexedDB||typeof global.indexedDB.open!=='function')&&
       options.synchronousLocalStorage===true){
      const value=serializeSaveSnapshot(snapshot);
      return{value,compression:'NONE',originalBytes:value.length,storedBytes:value.length};
    }
    if(!global.indexedDB||typeof global.indexedDB.open!=='function')
      return encodeStoredSave(serializeSaveSnapshot(snapshot));
    const canStream=typeof global.CompressionStream==='function'&&
      typeof global.DecompressionStream==='function'&&
      typeof global.Blob==='function'&&
      typeof global.Response==='function'&&
      typeof global.ReadableStream==='function'&&
      typeof global.TextEncoder==='function';
    if(!canStream)return encodeStoredSave(serializeSaveSnapshot(snapshot));

    return (async function(){
      const source=createSaveJsonStream(snapshot);
      if(!source)return encodeStoredSave(serializeSaveSnapshot(snapshot));
      try{
        // Serialize and gzip incrementally. The previous implementation first
        // materialized the complete canonical JSON string, then copied it into
        // a Blob before compression; a 197-country world could exhaust the
        // Chromium renderer before IndexedDB was even reached.
        const compressedStream=source.stream.pipeThrough(new global.CompressionStream('gzip'));
        const compressedBlob=await new global.Response(compressedStream).blob();
        const value=new global.Blob([SAVE_COMPRESSION_PREFIX,compressedBlob],{
          type:'application/x-omega-simulation-save'
        });
        return{
          value,compression:'GZIP_BLOB',
          originalBytes:source.originalBytes,storedBytes:value.size
        };
      }catch(error){
        // Preserve compatibility if a browser exposes stream APIs but cannot
        // complete gzip. The legacy serializer is used only on this fallback.
        const legacy=encodeStoredSave(serializeSaveSnapshot(snapshot));
        const stored=legacy&&typeof legacy.then==='function'?await legacy:legacy;
        return{...stored,compressionError:String(error&&error.message||error)};
      }
    })();
  }

  async function decodeStoredSave(stored){
    if(typeof global.Blob==='function'&&stored instanceof global.Blob){
      if(typeof global.Response!=='function')throw new Error('SIMULATION_SAVE_BLOB_READER_UNAVAILABLE');
      const header=await new global.Response(stored.slice(0,SAVE_COMPRESSION_PREFIX.length)).text();
      if(header!==SAVE_COMPRESSION_PREFIX)return new global.Response(stored).text();
      if(typeof global.DecompressionStream!=='function')
        throw new Error('SIMULATION_SAVE_GZIP_DECOMPRESSION_UNAVAILABLE');
      const compressed=stored.slice(SAVE_COMPRESSION_PREFIX.length);
      const stream=compressed.stream().pipeThrough(new global.DecompressionStream('gzip'));
      return new global.Response(stream).text();
    }
    const value=String(stored==null?'':stored);
    if(!value.startsWith(SAVE_COMPRESSION_PREFIX))return value;
    if(typeof global.DecompressionStream!=='function'||
       typeof global.Blob!=='function'||
       typeof global.Response!=='function'){
      throw new Error('SIMULATION_SAVE_GZIP_DECOMPRESSION_UNAVAILABLE');
    }
    const bytes=base64ToBytes(value.slice(SAVE_COMPRESSION_PREFIX.length));
    const compressed=new global.Blob([bytes]);
    const stream=compressed.stream().pipeThrough(new global.DecompressionStream('gzip'));
    return new global.Response(stream).text();
  }

  function indexedDbSaveRequest(indexedDB,operation,key,value){
    return new Promise((resolve,reject)=>{
      let database=null,settled=false;
      const finish=(error,result)=>{
        if(settled)return;
        settled=true;
        try{if(database)database.close();}catch(_){}
        if(error)reject(error);else resolve(result);
      };
      let opening;
      try{opening=indexedDB.open('omega-simulation-save-slots',1);}
      catch(error){finish(error);return;}
      opening.onupgradeneeded=()=>{
        const db=opening.result;
        if(!db.objectStoreNames.contains('slots'))db.createObjectStore('slots');
      };
      opening.onerror=()=>finish(opening.error||new Error('SAVE_DATABASE_OPEN_FAILED'));
      opening.onblocked=()=>finish(new Error('SAVE_DATABASE_OPEN_BLOCKED'));
      opening.onsuccess=()=>{
        database=opening.result;
        let transaction;
        try{transaction=database.transaction('slots',operation==='put'?'readwrite':'readonly');}
        catch(error){finish(error);return;}
        let request,result=null;
        transaction.oncomplete=()=>finish(null,result);
        transaction.onerror=()=>finish(transaction.error||new Error('SAVE_DATABASE_TRANSACTION_FAILED'));
        transaction.onabort=()=>finish(transaction.error||new Error('SAVE_DATABASE_TRANSACTION_ABORTED'));
        try{
          const store=transaction.objectStore('slots');
          const storedValue=typeof global.Blob==='function'&&value instanceof global.Blob?value:String(value);
          request=operation==='put'?store.put(storedValue,String(key)):store.get(String(key));
          request.onsuccess=()=>{result=request.result===undefined?null:request.result;};
          request.onerror=()=>finish(request.error||new Error('SAVE_DATABASE_REQUEST_FAILED'));
        }catch(error){try{transaction.abort();}catch(_){}finish(error);}
      };
    });
  }

  function validateWorldSaveState(root){
    const issues=[];
    if(!root||typeof root!=='object'||Array.isArray(root))return[{type:'WORLD_STATE_ROOT_INVALID'}];
    if(!root.simulation||typeof root.simulation!=='object'||Array.isArray(root.simulation))issues.push({type:'SIMULATION_STATE_MISSING'});
    const globalBatchIds=new Map();
    for(const [countryId,resource] of Object.entries(root.resource||{})){
      if(!resource||typeof resource!=='object'||Array.isArray(resource)){issues.push({type:'RESOURCE_COUNTRY_STATE_INVALID',countryId});continue;}
      for(const batch of Array.isArray(resource.batches)?resource.batches:[]){
        const batchId=String(batch?.batchId||'').trim();
        if(batchId){
          if(globalBatchIds.has(batchId))issues.push({type:'DUPLICATE_BATCH_ID',batchId,firstCountryId:globalBatchIds.get(batchId),countryId});
          else globalBatchIds.set(batchId,countryId);
        }
        for(const field of ['countryId','ownerCountryCode']){
          const owner=String(batch?.[field]||'').trim().toUpperCase();
          if(/^[A-Z]{3}$/.test(owner)&&/^[A-Z]{3}$/.test(String(countryId).toUpperCase())&&owner!==String(countryId).toUpperCase())
            issues.push({type:'CROSS_COUNTRY_BATCH_OWNER',countryId,batchId,field,ownerCountryId:owner});
        }
        for(const field of ['quantity','remainingQuantity']){
          if(batch?.[field]===undefined||batch?.[field]===null)continue;
          const quantity=Number(batch[field]);
          if(!Number.isFinite(quantity)||quantity< -1e-9)issues.push({type:'INVALID_BATCH_QUANTITY',countryId,batchId,field,value:batch[field]});
        }
      }
      for(const [resourceId,value] of Object.entries(resource.inventory||{})){
        const quantity=Number(value);
        if(!Number.isFinite(quantity)||quantity< -1e-9)issues.push({type:'INVALID_INVENTORY_QUANTITY',countryId,resourceId,value});
      }
      for(const [batchId,lot] of Object.entries(resource.inventoryLots||{})){
        for(const field of ['quantity','remainingQuantity']){
          if(lot?.[field]===undefined||lot?.[field]===null)continue;
          const quantity=Number(lot[field]);
          if(!Number.isFinite(quantity)||quantity< -1e-9)issues.push({type:'INVALID_INVENTORY_LOT_QUANTITY',countryId,batchId,field,value:lot[field]});
        }
      }
    }
    return issues.slice(0,256);
  }

  function replaceContents(target,source){
    for(const key of Object.keys(target)){
      if(key==='__proto__'||key==='constructor')continue;
      delete target[key];
    }
    if(source&&typeof source==='object'){
      for(const [key,value] of Object.entries(source)){
        if(key==='__proto__'||key==='constructor')continue;
        target[key]=clone(value);
      }
    }
    return target;
  }

  // Turn participant returns are diagnostic summaries, not authoritative state.
  // Do not deep-clone arbitrary result graphs: resource/factory handlers may return
  // large row collections that are already committed in their owning ledgers.
  function compactTurnParticipantResult(result) {
    if (result === null || typeof result !== 'object') return result === undefined ? null : result;
    var summary = {};
    ['status', 'reason', 'countryId', 'factoryId', 'cycleId', 'turn',
      'startedCount', 'completedCount', 'processedCount', 'blockedCount',
      'awaitingCount', 'warehouseTransferCount'].forEach(function (key) {
      var value = result[key];
      if (value === null || ['string', 'number', 'boolean'].indexOf(typeof value) >= 0) {
        if (value !== undefined) summary[key] = typeof value === 'string' ? value.slice(0, 160) : value;
      }
    });
    return Object.keys(summary).length ? summary : null;
  }

  function persistedTurnParticipantResults(rows) {
    return (Array.isArray(rows) ? rows : []).slice(-256).map(function (row) {
      var compact = {
        id: String(row && row.id || ''),
        turn: finite(row && row.turn, 0),
        status: String(row && row.status || 'UNKNOWN')
      };
      if (row && row.error) compact.error = String(row.error).slice(0, 500);
      var summary = compactTurnParticipantResult(row && row.result);
      if (summary !== null) compact.result = summary;
      return compact;
    });
  }

  function finite(value,fallback){
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  }

  function yieldToBrowser(){
    return new Promise(resolve=>{
      if(typeof global.setTimeout==='function'){
        global.setTimeout(resolve,0);
        return;
      }
      Promise.resolve().then(resolve);
    });
  }

  function dispatchRuntimeEvent(type,detail){
    try{
      const event=typeof global.CustomEvent==='function'
        ?new global.CustomEvent(type,{detail:clone(detail)})
        :{type,detail:clone(detail)};
      global.dispatchEvent?.(event);
    }catch(_){}
  }

  function monotonicNow(){
    try{
      if(global.performance&&typeof global.performance.now==='function')return global.performance.now();
    }catch(_){}
    return Date.now();
  }

  function recordPerformanceSpan(id,start,end,metadata){
    const monitor=global.OmegaBootPerformanceMonitor;
    if(!monitor||typeof monitor.recordSpan!=='function')return null;
    try{return monitor.recordSpan(id,start,end,metadata||{});}catch(_){return null;}
  }

  class SimulationClock{
    constructor(options={}){
      this.version=VERSION;
      this.turn=finite(options.turn,0);
      this.simulationTimeMs=finite(options.simulationTimeMs,0);
      this.stepDurationMs=Math.max(1,finite(options.stepDurationMs,DAY_MS));
      this.accumulatorMs=Math.max(0,finite(options.accumulatorMs,0));
      this.speed=Math.min(8,Math.max(0,finite(options.speed,1)));
      this.droppedScaledTimeMs=Math.max(0,finite(options.droppedScaledTimeMs,0));
      this.running=false;
      this.paused=false;
      this.startEpochMs=finite(options.startEpochMs,Date.UTC(2015,0,1));
    }

    setSpeed(value){
      const speed=finite(value,1);
      if(speed<0||speed>8)throw new Error('SIMULATION_SPEED_INVALID');
      this.speed=speed;
      return this.speed;
    }

    start(){
      this.running=true;
      this.paused=false;
    }

    pause(){
      this.paused=true;
      this.running=false;
    }

    resume(){
      this.running=true;
      this.paused=false;
    }

    stop(){
      this.running=false;
      this.paused=false;
      this.accumulatorMs=0;
    }

    advanceTurn(){
      this.turn+=1;
      this.simulationTimeMs+=this.stepDurationMs;
      return this.snapshot();
    }

    consumeRealDelta(realDeltaMs){
      if(!this.running||this.paused||this.speed===0)return 0;
      const delta=Math.max(0,finite(realDeltaMs,0));
      const projected=this.accumulatorMs+delta*this.speed;
      const dueDays=Math.floor(projected/STEP_MS);
      if(dueDays<1){
        this.accumulatorMs=projected;
        return 0;
      }
      // Commit one day per frame; discard only additional complete due days.
      // Preserve the partial-day remainder so higher speeds stay accurate over time.
      if(dueDays>1)this.droppedScaledTimeMs+=(dueDays-1)*STEP_MS;
      this.accumulatorMs=projected-(dueDays*STEP_MS);
      return MAX_STEPS_PER_FRAME;
    }

    simulationDate(){
      return new Date(this.startEpochMs+this.simulationTimeMs).toISOString();
    }

    snapshot(){
      return {
        version:this.version,
        turn:this.turn,
        simulationTimeMs:this.simulationTimeMs,
        stepDurationMs:this.stepDurationMs,
        accumulatorMs:this.accumulatorMs,
        speed:this.speed,
        droppedScaledTimeMs:this.droppedScaledTimeMs,
        running:this.running,
        paused:this.paused,
        startEpochMs:this.startEpochMs,
        simulationDate:this.simulationDate()
      };
    }

    restore(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_CLOCK_SNAPSHOT');
      this.turn=finite(snapshot.turn,0);
      this.simulationTimeMs=finite(snapshot.simulationTimeMs,0);
      this.stepDurationMs=Math.max(1,finite(snapshot.stepDurationMs,this.stepDurationMs));
      this.accumulatorMs=Math.max(0,finite(snapshot.accumulatorMs,0));
      this.speed=Math.min(8,Math.max(0,finite(snapshot.speed,1)));
      this.droppedScaledTimeMs=Math.max(0,finite(snapshot.droppedScaledTimeMs,0));
      this.running=Boolean(snapshot.running);
      this.paused=Boolean(snapshot.paused);
      this.startEpochMs=finite(snapshot.startEpochMs,this.startEpochMs);
      return this.snapshot();
    }
  }

  class DeterministicQueue{
    constructor(limit){
      this.limit=limit;
      this.sequence=0;
      this.items=[];
      this.history=[];
    }

    enqueue(command){
      const row=clone(command||{});
      this.sequence+=1;
      row.sequence=Number.isFinite(Number(row.sequence))?Number(row.sequence):this.sequence;
      row.sequence=this.sequence;
      row.status='QUEUED';
      this.items.push(row);
      if(this.items.length>this.limit)this.items.splice(0,this.items.length-this.limit);
      return clone(row);
    }

    drain(){
      const out=this.items.splice(0,this.items.length);
      return out.sort((a,b)=>a.sequence-b.sequence);
    }

    record(row){
      this.history.push(clone(row));
      if(this.history.length>this.limit)this.history.splice(0,this.history.length-this.limit);
    }

    snapshot(){
      return {
        sequence:this.sequence,
        items:clone(this.items),
        history:clone(this.history)
      };
    }

    restore(snapshot){
      this.sequence=finite(snapshot?.sequence,0);
      this.items=Array.isArray(snapshot?.items)?clone(snapshot.items):[];
      this.history=Array.isArray(snapshot?.history)?clone(snapshot.history):[];
    }

    reset(){
      this.sequence=0;
      this.items=[];
      this.history=[];
    }
  }

  class SimulationEventLedger{
    constructor(limit=MAX_EVENT_HISTORY){
      this.limit=limit;
      this.sequence=0;
      this.events=[];
      this.listeners=new Map();
    }

    emit(type,payload={},turn=0){
      const event={
        eventId:'OMEGA-SIM-EVT-'+String(turn)+'-'+String(++this.sequence),
        eventType:String(type||'UNKNOWN'),
        simulationTurn:finite(turn,0),
        payload:clone(payload)
      };
      this.events.push(event);
      if(this.events.length>this.limit)this.events.splice(0,this.events.length-this.limit);
      const subscribers=this.listeners.get(event.eventType)||[];
      for(const listener of [...subscribers]){
        try{listener(clone(event));}catch(error){try{console.error('[OMEGA SIM EVENT]',error);}catch(_){}}
      }
      const all=this.listeners.get('*')||[];
      for(const listener of [...all]){
        try{listener(clone(event));}catch(error){try{console.error('[OMEGA SIM EVENT]',error);}catch(_){}}
      }
      return clone(event);
    }

    subscribe(type,listener){
      if(typeof listener!=='function')throw new Error('SIMULATION_EVENT_LISTENER_REQUIRED');
      const key=String(type||'*');
      const set=this.listeners.get(key)||new Set();
      set.add(listener);
      this.listeners.set(key,set);
      return ()=>set.delete(listener);
    }

    snapshot(){
      return {sequence:this.sequence,events:clone(this.events)};
    }

    restore(snapshot){
      this.sequence=finite(snapshot?.sequence,0);
      this.events=Array.isArray(snapshot?.events)?clone(snapshot.events):[];
    }

    reset(){
      this.sequence=0;
      this.events=[];
    }
  }

  class AuthoritativeWorldState{
    constructor(existingState){
      const candidate=existingState&&typeof existingState==='object'
        ?existingState
        :((global.Game&&global.Game.state)||global.gameState||{});
      this.state=candidate;
      this.ensureCore();
    }

    ensureCore(){
      const s=this.state;
      if(!s.simulation||typeof s.simulation!=='object')s.simulation={};
      if(!s.simulation.session||typeof s.simulation.session!=='object')s.simulation.session={};
      if(!s.simulation.domains||typeof s.simulation.domains!=='object')s.simulation.domains={};
      if(!s.simulation.subsystemTurns||typeof s.simulation.subsystemTurns!=='object')s.simulation.subsystemTurns={};
      if(!s.worldEcosystem||typeof s.worldEcosystem!=='object')s.worldEcosystem={};
      if(!s.worldEcosystem.countryProfiles||typeof s.worldEcosystem.countryProfiles!=='object'){
        s.worldEcosystem.countryProfiles={};
      }
      return s;
    }

    hydrateCompatibility(){
      const legacy=global.gameState;
      const s=this.state;
      if(!legacy||legacy===s||typeof legacy!=='object')return;
      for(const key of ['population','economy']){
        const target=s[key];
        const source=legacy[key];
        if(source&&typeof source==='object'&&
           (!target||typeof target!=='object'||Object.keys(target).length===0)){
          s[key]=source;
        }
      }
      this.ensureCore();
    }

    setSession(session){
      this.state.simulation.session=clone(session||{});
      return clone(this.state.simulation.session);
    }

    snapshot(){
      return clone(this.state);
    }

    restore(snapshot,options={}){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_AUTHORITATIVE_WORLD_SNAPSHOT');
      replaceContents(this.state,snapshot);
      this.ensureCore();
      // loadState consumes the restored root directly. Avoid creating a second
      // full detached snapshot when its caller does not use the return value.
      return options.returnSnapshot===false?this.state:this.snapshot();
    }
  }

  class SimulationCoordinator{
    constructor(options={}){
      this.version=VERSION;
      this.clock=new SimulationClock(options.clock||{});
      this.world=new AuthoritativeWorldState(options.state);
      this.commandQueue=new DeterministicQueue(MAX_COMMAND_HISTORY);
      this.events=new SimulationEventLedger(MAX_EVENT_HISTORY);
      this.phaseHandlers=new Map();
      this.ministryPump=null;
      this.worldEngine=null;
      this.interoperability=null;
      this.ministryRuntime=null;
      this.status='READY';
      this.stepInProgress=false;
      this.saveBarrier=null;
      // Save supersession is slot-scoped: a write to `default` must never
      // invalidate an independent named-slot checkpoint (or vice versa).
      this.saveSlotSequences=new Map();
      this.lastError=null;
      this.lastLoadIntegrity='NOT_LOADED';
      this.lastStepSummary=null;
      this.stepCount=0;
      this.checkpointInterval=Math.max(0,finite(options.checkpointInterval,0));
      this.autoCheckpointCounter=0;
      this.hooks={};
      this.frameInProgress=false;
      this.pendingRealDeltaMs=0;
      this.manualAdvanceInProgress=false;
      this.manualAdvanceCancelled=false;
      this.manualAdvanceProgress=null;
      this.turnParticipants=new Map();
      this.turnParticipantSequence=0;
      this.lastTurnParticipantResults=[];
      // Bounded, process-local diagnostics do not enter the durable simulation snapshot.
      this.participantTimings=new Map();
      this.phaseTimings=new Map();
      this.lastTurnPhaseTimings=[];
      this.lastTurnPerformance=null;
      this.turnPerformanceHistory=[];
      this.timeDropDiagnostics={count:0,last:null};
      this.turnFinalizers=new Map();
      this.turnFinalizerSequence=0;
      this.finalizerTimings=new Map();
      this.lastTurnFinalizerResults=[];
      this.installDefaultHandlers();
    }

    registerTurnParticipant(id,handler,options={}){
      const key=String(id||'').trim();
      if(!key)throw new Error('SIMULATION_PARTICIPANT_ID_REQUIRED');
      if(typeof handler!=='function')throw new Error('SIMULATION_PARTICIPANT_HANDLER_REQUIRED');
      const previous=this.turnParticipants.get(key);
      const entry={
        id:key,
        handler,
        priority:finite(options.priority)??0,
        sequence:previous?.sequence??(++this.turnParticipantSequence),
        token:{}
      };
      this.turnParticipants.set(key,entry);
      return ()=>{
        const current=this.turnParticipants.get(key);
        if(current&&current.token===entry.token)this.turnParticipants.delete(key);
      };
    }

    registerSubsystem(id,handler,options={}){
      return this.registerTurnParticipant(id,handler,options);
    }

    async runTurnParticipants(event){
      const rows=[...this.turnParticipants.values()].sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence);
      const browserEvent=typeof global.CustomEvent==='function'
        ?new global.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:clone(event)})
        :{type:'OMEGA_SIMULATION_TURN_COMMITTED',detail:clone(event)};
      const turn=Math.max(0,finite(event?.simulationTurn,0));
      const results=[];
      global.__OMEGA_SIMULATION_PIPELINE_ACTIVE__=true;
      let participantSliceCount=0;
      try{
      for(const entry of rows){
        if(this.turnParticipants.get(entry.id)!==entry)continue;
        const participantStartedAt=monotonicNow();
        try{
          const value=await entry.handler.call(global,browserEvent,{
            turn,
            day:turn+1,
            stepDurationMs:this.clock.stepDurationMs,
            simulationDate:this.clock.simulationDate(),
            countryId:this.getPlayerCountryId(),
            state:this.world.state,
            clock:this.clock,
            simulation:this
          });
          const participantEndedAt=monotonicNow();
          const performanceMetrics=recordPerformanceSpan('simulation.participant.'+entry.id,
            participantStartedAt,participantEndedAt,{turn});
          const durationMs=this.recordParticipantDuration(entry.id,participantEndedAt-participantStartedAt,performanceMetrics);
          this.world.state.simulation.subsystemTurns=this.world.state.simulation.subsystemTurns||{};
          this.world.state.simulation.subsystemTurns[entry.id]=turn;
          results.push({id:entry.id,turn,status:'COMPLETED',durationMs,
            mainThreadBlockingMs:Number.isFinite(performanceMetrics?.mainThreadBlockingMs)?performanceMetrics.mainThreadBlockingMs:null,
            longTaskCount:Number.isFinite(performanceMetrics?.longTaskCount)?performanceMetrics.longTaskCount:null,
            maxLongTaskMs:Number.isFinite(performanceMetrics?.maxLongTaskMs)?performanceMetrics.maxLongTaskMs:null,
            result:compactTurnParticipantResult(value)});
        }catch(error){
          const participantEndedAt=monotonicNow();
          const performanceMetrics=recordPerformanceSpan('simulation.participant.'+entry.id,
            participantStartedAt,participantEndedAt,{turn,status:'FAILED'});
          const durationMs=this.recordParticipantDuration(entry.id,participantEndedAt-participantStartedAt,performanceMetrics);
          const failure={id:entry.id,turn,status:'FAILED',durationMs,
            mainThreadBlockingMs:Number.isFinite(performanceMetrics?.mainThreadBlockingMs)?performanceMetrics.mainThreadBlockingMs:null,
            longTaskCount:Number.isFinite(performanceMetrics?.longTaskCount)?performanceMetrics.longTaskCount:null,
            maxLongTaskMs:Number.isFinite(performanceMetrics?.maxLongTaskMs)?performanceMetrics.maxLongTaskMs:null,
            error:String(error?.message||error)};
          results.push(failure);
          // Stop the world immediately rather than silently let one sector miss a day.
          this.status='ERROR';
          this.clock.pause();
          this.lastError='TURN_PARTICIPANT_FAILED:'+entry.id+':'+failure.error;
          const session=this.world.state.simulation.session||{};
          session.status='ERROR';
          session.lastError=this.lastError;
          session.failedParticipant=entry.id;
          this.world.setSession(session);
          try{console.error('[OMEGA TURN PARTICIPANT]',failure);}catch(_){}
        }
        participantSliceCount+=1;
        if(participantSliceCount>=MAX_PARTICIPANTS_PER_SLICE){
          participantSliceCount=0;
          await yieldToBrowser();
        }
      }
      }finally{
        global.__OMEGA_SIMULATION_PIPELINE_ACTIVE__=false;
      }
      // Persist the compact participant trace once per turn, not once per handler.
      // The previous per-handler rewrite repeatedly cloned the growing result list.
      this.lastTurnParticipantResults=results.slice(-256);
      this.world.state.simulation.lastTurnParticipantResults=persistedTurnParticipantResults(this.lastTurnParticipantResults);
      return results;
    }

    registerTurnFinalizer(id,handler,options={}){
      const key=String(id||'').trim();
      if(!key)throw new Error('SIMULATION_FINALIZER_ID_REQUIRED');
      if(typeof handler!=='function')throw new Error('SIMULATION_FINALIZER_HANDLER_REQUIRED');
      const previous=this.turnFinalizers.get(key);
      const entry={
        id:key,
        handler,
        priority:finite(options.priority)??0,
        sequence:previous?.sequence??(++this.turnFinalizerSequence),
        token:{}
      };
      this.turnFinalizers.set(key,entry);
      return ()=>{
        const current=this.turnFinalizers.get(key);
        if(current&&current.token===entry.token)this.turnFinalizers.delete(key);
      };
    }

    async runTurnFinalizers(context,registeredAtTurnStart){
      const rows=(registeredAtTurnStart||[...this.turnFinalizers.values()])
        .slice().sort((a,b)=>{
          // Durable autosave is a reserved system finalizer and must run after
          // every present or future optional finalizer, regardless of its priority.
          if(a.id==='omega.game-lifecycle.autosave')return 1;
          if(b.id==='omega.game-lifecycle.autosave')return -1;
          return a.priority-b.priority||a.sequence-b.sequence;
        });
      const results=[];
      for(const entry of rows){
        if(this.turnFinalizers.get(entry.id)!==entry)continue;
        const finalizerStartedAt=monotonicNow();
        try{
          const value=await entry.handler.call(global,context);
          results.push({id:entry.id,turn:context.turn,status:'COMPLETED',result:value===undefined?null:clone(value)});
        }catch(error){
          const failure={id:entry.id,turn:context.turn,status:'FAILED',error:String(error?.message||error)};
          results.push(failure);
          this.status='ERROR';
          this.clock.pause();
          this.lastError=this.lastError||('TURN_FINALIZER_FAILED:'+entry.id+':'+failure.error);
          const session=this.world.state.simulation.session||{};
          session.status='ERROR';
          session.lastError=this.lastError;
          session.failedFinalizer=entry.id;
          this.world.setSession(session);
          try{console.error('[OMEGA TURN FINALIZER]',failure);}catch(_){}
        }
        const finalizerEndedAt=monotonicNow();
        this.recordFinalizerDuration(entry.id,finalizerEndedAt-finalizerStartedAt,
          recordPerformanceSpan('simulation.finalizer.'+entry.id,finalizerStartedAt,finalizerEndedAt,
            {turn:context.turn}));
        this.lastTurnFinalizerResults=results.slice(-64);
        this.world.state.simulation.lastTurnFinalizerResults=clone(this.lastTurnFinalizerResults);
      }
      return results;
    }

    finalizerDiagnostics(){
      return [...this.turnFinalizers.values()]
        .sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence)
        .map(entry=>{
          const timing=this.finalizerTimings.get(entry.id);
          return{id:entry.id,priority:entry.priority,sequence:entry.sequence,
            sampleCount:timing?.count||0,lastDurationMs:timing?.lastMs??null,
            averageDurationMs:timing?.count?Number((timing.totalMs/timing.count).toFixed(2)):null,
            maxDurationMs:timing?.maxMs??null,
            lastMainThreadBlockingMs:timing?.lastMainThreadBlockingMs??null};
        });
    }

    recordFinalizerDuration(id,duration,metrics){
      const durationMs=Math.round(Math.max(0,finite(duration,0))*100)/100;
      let row=this.finalizerTimings.get(id);
      if(!row){row={count:0,totalMs:0,maxMs:0,lastMs:0,lastMainThreadBlockingMs:null};this.finalizerTimings.set(id,row);}
      row.count++;row.totalMs+=durationMs;row.lastMs=durationMs;row.maxMs=Math.max(row.maxMs,durationMs);
      if(Number.isFinite(metrics?.mainThreadBlockingMs))row.lastMainThreadBlockingMs=metrics.mainThreadBlockingMs;
      while(this.finalizerTimings.size>128)this.finalizerTimings.delete(this.finalizerTimings.keys().next().value);
      return durationMs;
    }

    recordParticipantDuration(id,duration,metrics){
      const durationMs=Math.round(Math.max(0,finite(duration,0))*100)/100;
      let row=this.participantTimings.get(id);
      if(!row){
        row={count:0,totalMs:0,maxMs:0,lastMs:0,samples:[],blockingSamples:[],
          lastMainThreadBlockingMs:null,maxMainThreadBlockingMs:0,lastLongTaskCount:null,maxLongTaskMs:0};
        this.participantTimings.set(id,row);
      }
      row.count++;row.totalMs+=durationMs;row.lastMs=durationMs;row.maxMs=Math.max(row.maxMs,durationMs);
      row.samples.push(durationMs);if(row.samples.length>32)row.samples.shift();
      if(Number.isFinite(metrics?.mainThreadBlockingMs)){
        row.lastMainThreadBlockingMs=metrics.mainThreadBlockingMs;
        row.maxMainThreadBlockingMs=Math.max(row.maxMainThreadBlockingMs,metrics.mainThreadBlockingMs);
        row.blockingSamples.push(metrics.mainThreadBlockingMs);
        if(row.blockingSamples.length>32)row.blockingSamples.shift();
      }
      if(Number.isFinite(metrics?.longTaskCount))row.lastLongTaskCount=metrics.longTaskCount;
      if(Number.isFinite(metrics?.maxLongTaskMs))row.maxLongTaskMs=Math.max(row.maxLongTaskMs,metrics.maxLongTaskMs);
      while(this.participantTimings.size>256)this.participantTimings.delete(this.participantTimings.keys().next().value);
      return durationMs;
    }

    recordPhaseDuration(id,start,end,metadata){
      const durationMs=Math.round(Math.max(0,finite(end,0)-finite(start,0))*100)/100;
      const metrics=recordPerformanceSpan('simulation.phase.'+id,start,end,metadata||{});
      let row=this.phaseTimings.get(id);
      if(!row){row={count:0,totalMs:0,maxMs:0,lastMs:0,samples:[],blockingSamples:[],lastMainThreadBlockingMs:null};this.phaseTimings.set(id,row);}
      row.count++;row.totalMs+=durationMs;row.lastMs=durationMs;row.maxMs=Math.max(row.maxMs,durationMs);
      row.samples.push(durationMs);if(row.samples.length>32)row.samples.shift();
      if(Number.isFinite(metrics?.mainThreadBlockingMs)){
        row.lastMainThreadBlockingMs=metrics.mainThreadBlockingMs;
        row.blockingSamples.push(metrics.mainThreadBlockingMs);
        if(row.blockingSamples.length>32)row.blockingSamples.shift();
      }
      while(this.phaseTimings.size>32)this.phaseTimings.delete(this.phaseTimings.keys().next().value);
      return{id,durationMs,mainThreadBlockingMs:Number.isFinite(metrics?.mainThreadBlockingMs)?metrics.mainThreadBlockingMs:null,
        longTaskCount:Number.isFinite(metrics?.longTaskCount)?metrics.longTaskCount:null,
        maxLongTaskMs:Number.isFinite(metrics?.maxLongTaskMs)?metrics.maxLongTaskMs:null,
        longAnimationFrameCount:Number.isFinite(metrics?.longAnimationFrameCount)?metrics.longAnimationFrameCount:null};
    }

    phaseDiagnostics(){
      const percentile=values=>{
        const sorted=values.slice().sort((a,b)=>a-b);
        return sorted.length?Number(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*0.95)-1)].toFixed(2)):null;
      };
      return [...this.phaseTimings.entries()].map(([id,row])=>({
        id,sampleCount:row.count,rollingSampleCount:row.samples.length,lastDurationMs:row.lastMs,
        averageDurationMs:Number((row.totalMs/Math.max(1,row.count)).toFixed(2)),maxDurationMs:row.maxMs,
        p95DurationMs:percentile(row.samples),lastMainThreadBlockingMs:row.lastMainThreadBlockingMs,
        p95MainThreadBlockingMs:percentile(row.blockingSamples)
      }));
    }

    recordDroppedScaledTime(amount,source){
      const droppedScaledMs=Math.max(0,finite(amount,0));
      if(!(droppedScaledMs>0))return null;
      const detail={
        droppedScaledMs:Number(droppedScaledMs.toFixed(2)),
        totalDroppedScaledMs:Number(this.clock.droppedScaledTimeMs.toFixed(2)),
        turn:this.clock.turn,
        speed:this.clock.speed,
        source:String(source||'CLOCK_CATCH_UP_CAP'),
        timestamp:Date.now()
      };
      this.timeDropDiagnostics.count+=1;
      this.timeDropDiagnostics.last=detail;
      dispatchRuntimeEvent('OMEGA_SIMULATION_TIME_DROPPED',detail);
      return detail;
    }

    participantDiagnostics(){
      return [...this.turnParticipants.values()]
        .sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence)
        .map(entry=>{
          const timing=this.participantTimings.get(entry.id);
          const samples=timing?timing.samples.slice().sort((a,b)=>a-b):[];
          const p95=samples.length?samples[Math.min(samples.length-1,Math.ceil(samples.length*0.95)-1)]:0;
          return {
            id:entry.id,priority:entry.priority,sequence:entry.sequence,
            sampleCount:timing?timing.count:0,
            lastDurationMs:timing?timing.lastMs:null,
            averageDurationMs:timing?Number((timing.totalMs/timing.count).toFixed(2)):null,
            maxDurationMs:timing?timing.maxMs:null,
            p95DurationMs:timing?Number(p95.toFixed(2)):null,
            rollingSampleCount:samples.length,
            lastMainThreadBlockingMs:timing?.lastMainThreadBlockingMs??null,
            averageMainThreadBlockingMs:timing?.blockingSamples?.length
              ?Number((timing.blockingSamples.reduce((sum,value)=>sum+value,0)/timing.blockingSamples.length).toFixed(2)):null,
            maxMainThreadBlockingMs:timing?.maxMainThreadBlockingMs??null,
            lastLongTaskCount:timing?.lastLongTaskCount??null,
            maxLongTaskMs:timing?.maxLongTaskMs??null
          };
        });
    }

    installDefaultHandlers(){
      this.phaseHandlers.set('INPUT',async({commands,turn})=>{
        const results=[];
        for(const command of commands){
          try{
            if(!this.interoperability?.dispatchCommand){
              results.push({...command,status:'UNROUTABLE',error:'INTEROPERABILITY_COMMAND_ROUTER_UNAVAILABLE'});
              continue;
            }
            const source=String(command.sourceMinistryId||command.source||'');
            const action=String(command.actionId||command.commandType||'');
            const country=String(command.countryId||this.getPlayerCountryId()||'').trim().toUpperCase();
            const result=this.interoperability.dispatchCommand(source,action,country,command.payload||{},{
              ...clone(command.options||{}),
              turn,
              commandId:command.commandId,
              commandType:command.commandType||action,
              correlationId:command.correlationId||null,
              causationId:command.causationId||null
            });
            results.push(result);
          }catch(error){
            results.push({...command,status:'FAILED',error:String(error?.message||error)});
          }
        }
        return results;
      });

      this.phaseHandlers.set('VALIDATE',async({turn})=>{
        const s=this.world.state.simulation;
        s.turn=turn;
        s.date=this.clock.simulationDate();
        s.lifecycle=this.status;
        return {
          turn,
          countryId:this.getPlayerCountryId(),
          stateRootAuthority:'OMEGA_AUTHORITATIVE_WORLD_STATE',
          worldStateRevision:s.worldStateRevision||0
        };
      });

      this.phaseHandlers.set('SIMULATE',async({turn,stepDurationMs})=>{
        const worldEngine=this.worldEngine||global.WorldEcosystemEngine||null;
        let worldResult=null;
        if(worldEngine?.setAuthoritativeState){
          worldEngine.setAuthoritativeState(this.world.state);
        }
        if(worldEngine?.processSimulationTick){
          worldResult=worldEngine.processSimulationTick(stepDurationMs,turn);
        }

        let ministryResult=null;
        if(typeof this.ministryPump==='function'){
          ministryResult=await this.ministryPump({turn,stepDurationMs,countryId:this.getPlayerCountryId(),state:this.world.state});
        }

        return {worldResult,ministryResult};
      });

      this.phaseHandlers.set('COMMIT',async({turn,simulationResult})=>{
        const s=this.world.state.simulation;
        s.turn=turn;
        s.step=turn;
        s.worldStateRevision=finite(s.worldStateRevision,0)+1;
        s.subsystemTurns.worldEcosystem=turn;
        s.subsystemTurns.ministries=turn;
        if(this.interoperability?.advanceTurn)this.interoperability.advanceTurn(turn);
        return {
          turn,
          worldStateRevision:s.worldStateRevision,
          committed:true,
          simulationResult:clone(simulationResult)
        };
      });

      this.phaseHandlers.set('PUBLISH',async({turn,commandResults})=>{
        const event=this.events.emit('OMEGA_SIMULATION_TURN_COMMITTED',{
          turn,
          day:turn+1,
          stepDurationMs:this.clock.stepDurationMs,
          simulationDate:this.clock.simulationDate(),
          countryId:this.getPlayerCountryId(),
          commandCount:commandResults.length,
          stateRevision:this.world.state.simulation.worldStateRevision
        },turn);
        const participantResults=await this.runTurnParticipants(event);
        try{
          global.__OMEGA_SIMULATION_PIPELINE_DISPATCH__=true;
          global.dispatchEvent?.(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:clone(event)}));
        }catch(_){
        }finally{
          global.__OMEGA_SIMULATION_PIPELINE_DISPATCH__=false;
        }
        if(typeof this.hooks.onPublish==='function'){
          await this.hooks.onPublish({
            turn,
            state:this.world.state,
            event:clone(event)
          });
        }
        return {event,participants:clone(participantResults)};
      });

      this.phaseHandlers.set('CHECKPOINT',async({turn})=>{
        this.autoCheckpointCounter+=1;
        if(this.checkpointInterval>0&&this.autoCheckpointCounter%this.checkpointInterval===0){
          const snapshot=this.saveState();
          if(typeof this.hooks.onCheckpoint==='function')await this.hooks.onCheckpoint(snapshot,turn);
        }
        return {checkpointed:false,turn};
      });
    }

    configure(options={}){
      if(options.state)this.world=new AuthoritativeWorldState(options.state);
      if(options.interoperability)this.interoperability=options.interoperability;
      if(options.worldEngine)this.worldEngine=options.worldEngine;
      if(options.ministryRuntime)this.ministryRuntime=options.ministryRuntime;
      if(typeof options.ministryPump==='function')this.ministryPump=options.ministryPump;
      if(typeof options.playerCountryResolver==='function')this.hooks.playerCountryResolver=options.playerCountryResolver;
      if(options.checkpointInterval!==undefined){
        this.checkpointInterval=Math.max(0,finite(options.checkpointInterval,0));
      }
      return this.diagnostics();
    }

    setPhaseHandler(phase,handler){
      if(!PHASES.includes(String(phase)))throw new Error('UNKNOWN_SIMULATION_PHASE:'+phase);
      if(typeof handler!=='function')throw new Error('SIMULATION_PHASE_HANDLER_REQUIRED');
      this.phaseHandlers.set(String(phase),handler);
    }

    resolvePlayerCountry(){
      const candidates=[
        typeof this.hooks.playerCountryResolver==='function'?this.hooks.playerCountryResolver():null,
        this.world.state.simulation?.session?.playerCountryId,
        this.world.state.playerCountryId,
        global.OmegaCabinetUI?.activeCountry,
        global.CountryIOS?.activeCountry,
        global.Game?.currentActiveCountry,
        global.Game?.state?.countryCode,
        global.Game?.state?.countryId
      ];
      for(const value of candidates){
        const id=String(value||'').trim().toUpperCase();
        if(id)return id;
      }
      return null;
    }

    getPlayerCountryId(){
      return this.resolvePlayerCountry();
    }

    createSession(options={}){
      const countryId=String(options.playerCountryId||options.countryId||this.getPlayerCountryId()||'').trim().toUpperCase();
      this.clock.stop();
      this.clock.turn=finite(options.startTurn,this.clock.turn);
      this.clock.simulationTimeMs=finite(options.simulationTimeMs,this.clock.turn*this.clock.stepDurationMs);
      const session={
        schemaVersion:SESSION_VERSION,
        sessionId:String(options.sessionId||('OMEGA-SESSION-'+Math.max(0,this.clock.turn+1))),
        playerCountryId:countryId||null,
        status:'READY',
        createdTurn:this.clock.turn,
        lastCommittedTurn:this.clock.turn
      };
      this.world.setSession(session);
      this.commandQueue.reset();
      this.events.reset();
      this.clock.accumulatorMs=0;
      this.status='READY';
      this.lastError=null;
      this.stepCount=0;
      this.world.state.simulation.turn=this.clock.turn;
      this.world.state.simulation.date=this.clock.simulationDate();
      this.events.emit('OMEGA_GAME_SESSION_CREATED',{session:clone(session)},this.clock.turn);
      return clone(session);
    }

    startSession(options={}){
      if(options.playerCountryId||options.countryId){
        const current=this.world.state.simulation?.session||{};
        if(current.playerCountryId!==String(options.playerCountryId||options.countryId).trim().toUpperCase()){
          this.createSession({playerCountryId:options.playerCountryId||options.countryId,startTurn:options.startTurn});
        }
      }
      const session=this.world.state.simulation?.session||{};
      if(!session.playerCountryId){
        const resolved=this.getPlayerCountryId();
        if(!resolved)throw new Error('PLAYER_COUNTRY_REQUIRED');
        session.playerCountryId=resolved;
      }
      session.status='RUNNING';
      session.startedTurn=this.clock.turn;
      this.world.setSession(session);
      this.status='RUNNING';
      this.clock.start();
      this.events.emit('OMEGA_GAME_SESSION_STARTED',{session:clone(session)},this.clock.turn);
      return this.diagnostics();
    }

    pauseSession(){
      this.clock.pause();
      // Time collected while a slow turn was active must not replay after resume.
      this.pendingRealDeltaMs=0;
      this.status='PAUSED';
      const session=this.world.state.simulation?.session||{};
      session.status='PAUSED';
      session.pausedTurn=this.clock.turn;
      this.world.setSession(session);
      this.events.emit('OMEGA_GAME_SESSION_PAUSED',{turn:this.clock.turn},this.clock.turn);
      return this.diagnostics();
    }

    resumeSession(){
      const session=this.world.state.simulation?.session||{};
      if(!session.playerCountryId)throw new Error('PLAYER_COUNTRY_REQUIRED');
      this.status='RUNNING';
      session.status='RUNNING';
      this.world.setSession(session);
      this.clock.resume();
      this.events.emit('OMEGA_GAME_SESSION_RESUMED',{turn:this.clock.turn},this.clock.turn);
      return this.diagnostics();
    }

    stopSession(){
      this.clock.stop();
      this.status='STOPPED';
      const session=this.world.state.simulation?.session||{};
      session.status='STOPPED';
      this.world.setSession(session);
      this.events.emit('OMEGA_GAME_SESSION_STOPPED',{turn:this.clock.turn},this.clock.turn);
      return this.diagnostics();
    }

    async frame(realDeltaMs){
      const delta=Math.max(0,finite(realDeltaMs,0));
      if(this.manualAdvanceInProgress)return {steps:0,turn:this.clock.turn,status:this.status,busy:true,reason:'MANUAL_ADVANCE_IN_PROGRESS'};
      if(this.frameInProgress){
        if(this.status!=='RUNNING'||this.clock.paused){
          this.pendingRealDeltaMs=0;
        }else{
          const accumulated=this.pendingRealDeltaMs+delta;
          const retained=Math.min(MAX_PENDING_REAL_DELTA_MS,accumulated);
          this.pendingRealDeltaMs=retained;
          const dropped=accumulated-retained;
          if(dropped>0){
            const scaledDropped=dropped*Math.max(0,finite(this.clock.speed,0));
            this.clock.droppedScaledTimeMs+=scaledDropped;
            this.recordDroppedScaledTime(scaledDropped,'IN_FLIGHT_FRAME_QUEUE_CAP');
          }
        }
        return {steps:0,turn:this.clock.turn,status:this.status,busy:true};
      }
      if(this.status!=='RUNNING')return {steps:0,turn:this.clock.turn,status:this.status};
      this.frameInProgress=true;
      try{
        // Compatibility roots are hydrated in step() when a real game day commits.
        // Sub-day clock frames only accumulate elapsed time and must not rescan world roots.
        const combinedDelta=delta+this.pendingRealDeltaMs;
        this.pendingRealDeltaMs=0;
        const droppedBefore=this.clock.droppedScaledTimeMs;
        const scheduledSteps=this.clock.consumeRealDelta(combinedDelta);
        const newlyDropped=this.clock.droppedScaledTimeMs-droppedBefore;
        if(newlyDropped>0)this.recordDroppedScaledTime(newlyDropped,'CLOCK_MAX_STEPS_PER_FRAME');
        let completedSteps=0,last=null;
        for(let i=0;i<scheduledSteps&&this.status==='RUNNING';i++){
          last=await this.step();
          if(last&&last.skipped)break;
          completedSteps+=1;
        }
        return {steps:completedSteps,scheduledSteps,turn:this.clock.turn,last,status:this.status};
      }finally{
        this.frameInProgress=false;
      }
    }

    async advance(turns=1,options={}){
      const requestedTurns=Math.max(0,Math.floor(finite(turns,0)));
      const count=Math.min(MAX_MANUAL_ADVANCE_TURNS,requestedTurns);
      if(this.status==='ERROR')return {turn:this.clock.turn,steps:0,last:null,status:'ERROR',reason:'SIMULATION_IN_ERROR'};
      if(this.frameInProgress||this.stepInProgress||this.manualAdvanceInProgress)
        return {turn:this.clock.turn,steps:0,last:null,status:this.status,busy:true,reason:'SIMULATION_TURN_BUSY'};
      if(count===0)return {turn:this.clock.turn,steps:0,last:null,status:this.status,empty:true};

      const previousStatus=this.status;
      const yieldEvery=Math.max(1,Math.min(4,Math.floor(finite(options.yieldEvery,1))));
      let last=null,completed=0,cancelled=false;
      this.manualAdvanceInProgress=true;
      this.manualAdvanceCancelled=false;
      this.manualAdvanceProgress={status:'RUNNING',requestedTurns,plannedTurns:count,completedTurns:0,turn:this.clock.turn,percent:0};
      this.status='RUNNING';
      const started={requestedTurns,plannedTurns:count,turn:this.clock.turn,countryId:this.getPlayerCountryId()};
      this.events.emit('OMEGA_SIMULATION_BATCH_STARTED',started,this.clock.turn);
      dispatchRuntimeEvent('OMEGA_SIMULATION_BATCH_STARTED',started);
      try{
        for(let index=0;index<count;index++){
          if(this.manualAdvanceCancelled){cancelled=true;break;}
          if(this.status==='ERROR')break;
          if(this.status!=='RUNNING'){cancelled=true;break;}
          last=await this.step();
          if(last&&last.skipped)break;
          completed+=1;
          const progress={requestedTurns,plannedTurns:count,completedTurns:completed,turn:this.clock.turn,
            percent:Math.round(completed/count*100),lastTurnStatus:this.status};
          this.manualAdvanceProgress={...progress,status:'RUNNING'};
          this.events.emit('OMEGA_SIMULATION_BATCH_PROGRESS',progress,this.clock.turn);
          dispatchRuntimeEvent('OMEGA_SIMULATION_BATCH_PROGRESS',progress);
          if(index+1<count&&completed%yieldEvery===0)await yieldToBrowser();
        }
        cancelled=cancelled||this.manualAdvanceCancelled;
        // An external Pause/Stop during a running-origin batch is authoritative:
        // never restore the pre-batch RUNNING status after the caller interrupted it.
        const restoreStatus=cancelled&&this.status!=='RUNNING'?this.status:previousStatus;
        if(this.status!=='ERROR'){
          this.status=restoreStatus;
          const session=this.world.state.simulation?.session||{};
          if(restoreStatus==='RUNNING'){
            this.clock.resume();
            session.status='RUNNING';
          }else if(restoreStatus==='PAUSED'){
            this.clock.pause();
            session.status='PAUSED';
          }else if(restoreStatus==='STOPPED'){
            this.clock.stop();
            session.status='STOPPED';
          }else{
            this.clock.running=false;
            this.clock.paused=false;
            session.status=restoreStatus||'READY';
          }
          this.world.setSession(session);
        }
        const result={turn:this.clock.turn,steps:completed,last,status:this.status,cancelled,
          requestedTurns,plannedTurns:count,limited:requestedTurns>count};
        this.manualAdvanceProgress={...result,status:this.status==='ERROR'?'ERROR':cancelled?'CANCELLED':'COMPLETED',
          completedTurns:completed,percent:Math.round(completed/count*100)};
        this.events.emit('OMEGA_SIMULATION_BATCH_COMPLETED',result,this.clock.turn);
        dispatchRuntimeEvent('OMEGA_SIMULATION_BATCH_COMPLETED',result);
        return result;
      }finally{
        this.manualAdvanceInProgress=false;
        this.manualAdvanceCancelled=false;
      }
    }

    cancelAdvance(){
      if(!this.manualAdvanceInProgress)return false;
      this.manualAdvanceCancelled=true;
      return true;
    }

    async step(){
      // A durable streaming save reads the authoritative root over multiple
      // chunks. Hold the next turn until the save has reached IndexedDB.
      if(this.saveBarrier){
        await this.saveBarrier;
        // A frame may have queued this step before the app was backgrounded.
        // Recheck after the wait so a visibility/pagehide pause cannot be
        // undone by a step that resumes after its save barrier releases.
        if(this.status!=='RUNNING')return {turn:this.clock.turn,steps:0,status:this.status,skipped:true};
      }
      if(this.stepInProgress)throw new Error('SIMULATION_STEP_REENTRANT');
      if(this.status==='ERROR')throw new Error('SIMULATION_IN_ERROR:'+String(this.lastError||'UNKNOWN'));
      this.stepInProgress=true;
      this.lastError=null;
      const finalizersAtTurnStart=[...this.turnFinalizers.values()];
      const commandResults=[];
      const stepStartedAt=monotonicNow();
      const phaseTimings={};
      try{
        this.world.hydrateCompatibility();
        const time=this.clock.advanceTurn();
        const turn=time.turn;
        this.status='RUNNING';

        const commands=this.commandQueue.drain();
        for(const command of commands)this.commandQueue.record({...command,status:'PROCESSING',simulationTurn:turn});

        const context={
          turn,
          stepDurationMs:this.clock.stepDurationMs,
          state:this.world.state,
          commands,
          commandResults
        };

        const phaseResults={};
        phaseTimings.PREPARE=this.recordPhaseDuration('PREPARE',stepStartedAt,monotonicNow(),{turn});
        const runPhase=async(name,work)=>{
          const startedAt=monotonicNow();
          try{
            const value=await work();
            phaseTimings[name]=this.recordPhaseDuration(name,startedAt,monotonicNow(),{turn});
            return value;
          }catch(error){
            phaseTimings[name]=this.recordPhaseDuration(name,startedAt,monotonicNow(),{turn,status:'FAILED'});
            throw error;
          }
        };
        const inputResult=await runPhase('INPUT',()=>this.phaseHandlers.get('INPUT')(context));
        commandResults.push(...(Array.isArray(inputResult)?inputResult:[]));
        phaseResults.INPUT=clone(inputResult);

        phaseResults.VALIDATE=clone(await runPhase('VALIDATE',()=>this.phaseHandlers.get('VALIDATE')({...context,commandResults})));
        phaseResults.SIMULATE=clone(await runPhase('SIMULATE',()=>this.phaseHandlers.get('SIMULATE')({...context,commandResults})));
        phaseResults.COMMIT=clone(await runPhase('COMMIT',()=>this.phaseHandlers.get('COMMIT')({...context,commandResults,simulationResult:phaseResults.SIMULATE})));
        phaseResults.PUBLISH=clone(await runPhase('PUBLISH',()=>this.phaseHandlers.get('PUBLISH')({...context,commandResults,phaseResults})));
        phaseResults.CHECKPOINT=clone(await runPhase('CHECKPOINT',()=>this.phaseHandlers.get('CHECKPOINT')({...context,commandResults,phaseResults})));

        // Mark the world/session as committed before the finalizer phase so its
        // durable snapshot contains the exact date, turn, and completion metadata.
        const session=this.world.state.simulation?.session||{};
        if(this.status==='ERROR'){
          session.failedTurn=turn;
          session.failedTurnDate=this.clock.simulationDate();
        }else{
          session.lastCommittedTurn=turn;
        }
        session.status=this.status;
        this.world.setSession(session);
        this.stepCount+=1;
        this.lastStepSummary={
          turn,
          phases:clone(phaseResults),
          commandResults:clone(commandResults),
          stateRevision:this.world.state.simulation.worldStateRevision,
          phaseTimings:clone(phaseTimings)
        };
        this.lastTurnPhaseTimings=clone(phaseTimings);
        this.events.emit('OMEGA_SIMULATION_STEP_COMPLETED',this.lastStepSummary,turn);

        // The save finalizer executes after all state mutations and the completion
        // event, so the durable snapshot represents the completed turn, not a preview.
        const finalizerStartedAt=monotonicNow();
        phaseResults.FINALIZE=clone(await this.runTurnFinalizers({
          turn,
          day:turn+1,
          stepDurationMs:this.clock.stepDurationMs,
          simulationDate:this.clock.simulationDate(),
          countryId:this.getPlayerCountryId(),
          state:this.world.state,
          clock:this.clock,
          simulation:this
        },finalizersAtTurnStart));
        phaseTimings.FINALIZE=this.recordPhaseDuration('FINALIZE',finalizerStartedAt,monotonicNow(),{turn});
        phaseTimings.TOTAL=this.recordPhaseDuration('TOTAL',stepStartedAt,monotonicNow(),{turn});
        this.lastTurnPhaseTimings=clone(phaseTimings);
        this.lastTurnPerformance={turn,totalDurationMs:phaseTimings.TOTAL.durationMs,
          phases:clone(phaseTimings),browser:global.OmegaBootPerformanceMonitor?.snapshot?.()||null,
          participants:this.lastTurnParticipantResults.map(row=>({
            id:row.id,status:row.status,durationMs:row.durationMs??null,
            mainThreadBlockingMs:row.mainThreadBlockingMs??null,
            longTaskCount:row.longTaskCount??null,maxLongTaskMs:row.maxLongTaskMs??null
          }))};
        this.turnPerformanceHistory.push(clone(this.lastTurnPerformance));
        if(this.turnPerformanceHistory.length>16)this.turnPerformanceHistory.shift();
        this.lastStepSummary.phases=clone(phaseResults);
        this.lastStepSummary.phaseTimings=clone(phaseTimings);
        this.lastStepSummary.performance=clone(this.lastTurnPerformance);
        return clone(this.lastStepSummary);
      }catch(error){
        phaseTimings.TOTAL=this.recordPhaseDuration('TOTAL',stepStartedAt,monotonicNow(),
          {turn:this.clock.turn,status:'FAILED'});
        this.lastTurnPhaseTimings=clone(phaseTimings);
        this.lastTurnPerformance={turn:this.clock.turn,totalDurationMs:phaseTimings.TOTAL.durationMs,
          phases:clone(phaseTimings),browser:global.OmegaBootPerformanceMonitor?.snapshot?.(),
          participants:this.lastTurnParticipantResults.map(row=>({
            id:row.id,status:row.status,durationMs:row.durationMs??null,
            mainThreadBlockingMs:row.mainThreadBlockingMs??null,
            longTaskCount:row.longTaskCount??null,maxLongTaskMs:row.maxLongTaskMs??null
          })),status:'FAILED'};
        this.turnPerformanceHistory.push(clone(this.lastTurnPerformance));
        if(this.turnPerformanceHistory.length>16)this.turnPerformanceHistory.shift();
        this.lastError=String(error?.message||error);
        this.status='ERROR';
        this.clock.pause();
        const session=this.world.state.simulation?.session||{};
        session.status='ERROR';
        session.lastError=this.lastError;
        this.world.setSession(session);
        this.events.emit('OMEGA_SIMULATION_STEP_FAILED',{turn:this.clock.turn,error:this.lastError},this.clock.turn);
        throw error;
      }finally{
        this.stepInProgress=false;
      }
    }

    enqueueCommand(command){
      const row={
        ...clone(command),
        commandId:String(command?.commandId||'OMI-PLAYER-CMD-'+String(this.commandQueue.sequence+1)),
        countryId:String(command?.countryId||this.getPlayerCountryId()||'').trim().toUpperCase()
      };
      if(!row.sourceMinistryId)throw new Error('COMMAND_SOURCE_MINISTRY_REQUIRED');
      if(!row.actionId&&!row.commandType)throw new Error('COMMAND_ACTION_REQUIRED');
      return this.commandQueue.enqueue(row);
    }

    saveState(options={}){
      const snapshot=createSaveSnapshot(this,options);
      snapshot.checksum=checksumSnapshot(snapshot);
      return snapshot;
    }

    loadState(snapshot){
      if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error('INVALID_SIMULATION_SAVE');
      if(Number(snapshot.schemaVersion)!==SESSION_VERSION)throw new Error('SIMULATION_SAVE_SCHEMA_MISMATCH');
      if(!snapshot.worldState||typeof snapshot.worldState!=='object'||Array.isArray(snapshot.worldState))
        throw new Error('SIMULATION_SAVE_WORLD_STATE_MISSING');
      if(!snapshot.clock||typeof snapshot.clock!=='object'||!Number.isFinite(Number(snapshot.clock.turn))||Number(snapshot.clock.turn)<0)
        throw new Error('SIMULATION_SAVE_CLOCK_INVALID');
      if(snapshot.checksum!==undefined&&snapshot.checksum!==null&&String(snapshot.checksum)!==checksumSnapshot(snapshot))
        throw new Error('SIMULATION_SAVE_CHECKSUM_MISMATCH');
      const stateIssues=validateWorldSaveState(snapshot.worldState);
      if(stateIssues.length)throw new Error('SIMULATION_SAVE_STATE_INTEGRITY_FAILED:'+stateIssues.map(x=>x.type).join(','));
      // Snapshots without a checksum are accepted only as legacy saves for compatibility;
      // all newly generated snapshots are checksummed before persistence.
      this.lastLoadIntegrity=snapshot.checksum?'VERIFIED':'LEGACY_UNVERIFIED';
      // Restore the validated save into the existing authoritative root. The
      // recursive copy keeps caller-provided and cross-realm parsed snapshots
      // isolated, while skipping the unused second detached snapshot.
      this.world.restore(snapshot.worldState,{returnSnapshot:false});
      // Migrate legacy hourly saves into the canonical daily-turn timeline.
      // A simulation turn is one game day; wall-clock speed is controlled separately.
      const restoredClock=clone(snapshot.clock);
      const clockTurn=Math.max(0,finite(restoredClock.turn,0));
      const worldTurn=Math.max(0,finite(snapshot.worldState.simulation?.turn,0));
      const savedTurn=Math.max(clockTurn,worldTurn);
      const savedDate=snapshot.worldState.simulation?.date;
      const savedEpoch=Date.parse(String(savedDate||''));
      const startEpoch=Number(restoredClock.startEpochMs);
      const legacyClock=Number(restoredClock.stepDurationMs)!==DAY_MS;
      restoredClock.turn=savedTurn;
      if(legacyClock){
        // The saved calendar date is the migration anchor. Rebase elapsed time to it,
        // then apply one full day to each future turn.
        restoredClock.stepDurationMs=DAY_MS;
        if(Number.isFinite(savedEpoch)&&Number.isFinite(startEpoch)){
          restoredClock.simulationTimeMs=Math.max(0,savedEpoch-startEpoch);
        }else if(worldTurn>clockTurn||
          restoredClock.simulationTimeMs===null||restoredClock.simulationTimeMs===undefined||
          !Number.isFinite(Number(restoredClock.simulationTimeMs))){
          restoredClock.simulationTimeMs=savedTurn*DAY_MS;
        }
      }else if(worldTurn>clockTurn){
        // Early legacy snapshots may have updated Game.state before the clock existed.
        // Prefer its saved calendar date when present; otherwise never rewind to the
        // stale default clock turn.
        restoredClock.simulationTimeMs=Number.isFinite(savedEpoch)&&Number.isFinite(startEpoch)
          ?Math.max(0,savedEpoch-startEpoch)
          :savedTurn*DAY_MS;
      }
      restoredClock.stepDurationMs=DAY_MS;
      restoredClock.accumulatorMs=0;
      this.clock.restore(restoredClock);
      this.world.state.simulation.turn=this.clock.turn;
      this.world.state.simulation.date=this.clock.simulationDate();
      this.commandQueue.restore(snapshot.commands);
      this.events.restore(snapshot.events);
      if(snapshot.ministryRuntime&&this.ministryRuntime?.loadState)this.ministryRuntime.loadState(snapshot.ministryRuntime);
      if(snapshot.interoperability&&this.interoperability?.loadState)this.interoperability.loadState(snapshot.interoperability);
      if(snapshot.worldEngine&&this.worldEngine?.setAuthoritativeState){
        this.worldEngine.setAuthoritativeState(this.world.state);
        if(this.worldEngine.importSaveState)this.worldEngine.importSaveState(snapshot.worldEngine);
      }
      // Phase 6 provenance is optional and checksum-covered. Restore it only as
      // a validation reference; Phase 6 always recalculates from current sources
      // before accepting the saved fingerprint.
      const phase6Api=global.OmegaPhase6NationalCapacity||global.Omega?.Phase6NationalCapacity;
      const phase6Snapshot=Object.prototype.hasOwnProperty.call(snapshot,'phase6NationalCapacity')
        ?clone(snapshot.phase6NationalCapacity):null;
      if(phase6Api&&typeof phase6Api.loadState==='function'){
        try{phase6Api.loadState(phase6Snapshot);}catch(_){}
      }else{
        global.__OMEGA_PENDING_PHASE6_NATIONAL_CAPACITY_SAVE__=phase6Snapshot;
      }
      this.status=String(snapshot.status||this.world.state.simulation?.session?.status||'READY');
      this.lastError=null;
      return this.diagnostics();
    }

    async saveSlot(slot='default',options={}){
      const key='omega.game.save.'+String(slot||'default');
      const previousSave=this.saveBarrier;
      const sequences=this.saveSlotSequences || (this.saveSlotSequences=new Map());
      const sequence=(sequences.get(key)||0)+1;
      sequences.set(key,sequence);
      let releaseSave;
      const currentSave=new Promise(resolve=>{releaseSave=resolve;});
      this.saveBarrier=currentSave;
      let released=false;
      const releaseCurrentSave=()=>{
        if(released)return;
        released=true;
        releaseSave();
        if(this.saveBarrier===currentSave)this.saveBarrier=null;
      };
      try{
        // Exit flushes must not be queued behind an earlier compression promise.
        if(previousSave&&options.synchronousLocalStorage!==true)await previousSave;
        // Volatile diagnostics are omitted. Canonical JSON and its checksum
        // are emitted together as a stream, avoiding a full-size JSON duplicate.
        const snapshot=createSaveSnapshot(this,{includeDiagnostics:false},true);
      // Keep the checksum over the canonical plain JSON snapshot, but store a
      // gzip envelope when the browser supports both compression directions.
      // Large 197-country saves can exceed localStorage/IndexedDB quotas.
      const persistStoredSave = stored => {
        // Prevent an older asynchronous save from overwriting a newer
        // page-exit checkpoint when it resolves later.
        if(sequence!==this.saveSlotSequences.get(key))
          return {ok:true,skipped:true,storage:'SUPERSEDED',turn:this.clock.turn,
            compression:stored.compression,storedBytes:stored.storedBytes};
        const result = {
          ok:true,key,turn:this.clock.turn,
          compression:stored.compression,
          originalBytes:stored.originalBytes,
          storedBytes:stored.storedBytes
        };
        if(global.indexedDB&&typeof global.indexedDB.open==='function'){
          return indexedDbSaveRequest(global.indexedDB,'put',key,stored.value).then(() => ({
            ...result,storage:'INDEXEDDB'
          })).catch(async indexedDbError => {
            try{
              if(typeof global.localStorage==='undefined')throw new Error('SAVE_STORAGE_UNAVAILABLE');
              let fallbackValue=stored.value,fallbackCompression=stored.compression,fallbackBytes=stored.storedBytes;
              if(typeof global.Blob==='function'&&fallbackValue instanceof global.Blob){
                const header=await new global.Response(fallbackValue.slice(0,SAVE_COMPRESSION_PREFIX.length)).text();
                if(header===SAVE_COMPRESSION_PREFIX&&typeof global.btoa==='function'){
                  const compressed=fallbackValue.slice(SAVE_COMPRESSION_PREFIX.length);
                  const bytes=new Uint8Array(await new global.Response(compressed).arrayBuffer());
                  fallbackValue=SAVE_COMPRESSION_PREFIX+bytesToBase64(bytes);
                  fallbackCompression='GZIP_BASE64';
                  fallbackBytes=fallbackValue.length;
                }else{
                  fallbackValue=serializeSaveSnapshot(snapshot);
                  fallbackCompression='NONE';
                  fallbackBytes=String(fallbackValue).length;
                }
              }
              global.localStorage.setItem(key,fallbackValue);
              return {...result,compression:fallbackCompression,storedBytes:fallbackBytes,storage:'LOCAL_STORAGE_FALLBACK'};
            }catch(localStorageError){
              throw new Error('LOCAL_STORAGE_AND_INDEXEDDB_SAVE_FAILED:'+String(localStorageError&&localStorageError.message||localStorageError)+'; INDEXEDDB:'+String(indexedDbError&&indexedDbError.message||indexedDbError)+'; COMPRESSION:'+stored.compression+'; STORED_BYTES:'+stored.storedBytes);
            }
          });
        }
        if(typeof global.localStorage==='undefined')throw new Error('SAVE_STORAGE_UNAVAILABLE');
        // This stays synchronous for the legacy no-compression path, preserving
        // the previous pagehide/visibility flush contract on older webviews.
        global.localStorage.setItem(key,stored.value);
        return {...result,storage:'LOCAL_STORAGE_FALLBACK'};
      };
      const stored=encodeStoredSnapshot(snapshot,options);
      if(stored&&typeof stored.then==='function')
        return Promise.resolve(stored).then(persistStoredSave).finally(releaseCurrentSave);
      // Keep a plain-JSON/no-IndexedDB fallback synchronous. pagehide and
      // beforeunload cannot rely on another promise microtask before teardown.
      const persisted=persistStoredSave(stored);
      if(persisted&&typeof persisted.then==='function')
        return persisted.finally(releaseCurrentSave);
      releaseCurrentSave();
      return persisted;
      }catch(error){
        releaseCurrentSave();
        throw error;
      }
    }

    async loadSlot(slot='default'){
      const key='omega.game.save.'+String(slot||'default');
      let raw=null,indexedDbError=null;
      if(global.indexedDB&&typeof global.indexedDB.open==='function'){
        try{raw=await indexedDbSaveRequest(global.indexedDB,'get',key);}
        catch(error){indexedDbError=error;}
      }
      // Read legacy localStorage saves when no IndexedDB record exists. Existing
      // saves remain valid and are not deleted during migration.
      if(raw===null||raw===undefined){
        if(typeof global.localStorage!=='undefined')raw=global.localStorage.getItem(key);
      }
      if(!raw){
        if(indexedDbError)throw new Error('SAVE_SLOT_NOT_FOUND:'+key+'; INDEXEDDB:'+String(indexedDbError.message||indexedDbError));
        throw new Error('SAVE_SLOT_NOT_FOUND:'+key);
      }
      // Plain JSON from earlier versions is still accepted. New saves may use
      // a gzip-prefixed payload to fit large country-state snapshots in quota.
      const decoded=await decodeStoredSave(raw);
      return this.loadState(JSON.parse(decoded));
    }

    diagnostics(){
      return {
        version:VERSION,
        status:this.status,
        phaseOrder:PHASES.slice(),
        clock:this.clock.snapshot(),
        session:clone(this.world.state.simulation?.session||{}),
        authoritativeState:{
          root:'Game.state',
          worldStateLinked:Boolean(global.Game?.state&&this.world.state===global.Game.state),
          compatibilityGameStatePresent:Boolean(global.gameState),
          worldEcosystemBucket:Boolean(this.world.state.worldEcosystem?.countryProfiles)
        },
        queues:{
          commands:this.commandQueue.items.length,
          commandHistory:this.commandQueue.history.length,
          events:this.events.events.length
        },
        stepCount:this.stepCount,
        frameInProgress:this.frameInProgress,
        pendingRealDeltaMs:this.pendingRealDeltaMs,
        manualAdvanceInProgress:this.manualAdvanceInProgress,
        manualAdvanceProgress:clone(this.manualAdvanceProgress),
        lastStep:clone(this.lastStepSummary),
        lastError:this.lastError,
        lastLoadIntegrity:this.lastLoadIntegrity,
        turnParticipantCount:this.turnParticipants.size,
        turnParticipants:this.participantDiagnostics(),
        lastTurnParticipantResults:clone(this.lastTurnParticipantResults),
        phaseTimings:this.phaseDiagnostics(),
        lastTurnPhaseTimings:clone(this.lastTurnPhaseTimings),
        lastTurnPerformance:clone(this.lastTurnPerformance),
        recentTurnPerformance:clone(this.turnPerformanceHistory.slice(-8)),
        browserPerformance:global.OmegaBootPerformanceMonitor?.snapshot?.()||null,
        timeDiscards:{
          totalScaledMs:Number(this.clock.droppedScaledTimeMs.toFixed(2)),
          eventCount:this.timeDropDiagnostics.count,
          last:clone(this.timeDropDiagnostics.last)
        },
        turnFinalizerCount:this.turnFinalizers.size,
        turnFinalizers:this.finalizerDiagnostics(),
        lastTurnFinalizerResults:clone(this.lastTurnFinalizerResults)
      };
    }
  }

  // Durable, domain-scoped checkpoints live inside the existing authoritative
  // Simulation state so the existing save envelope persists them automatically.
  // This foundation does not schedule or execute any economy phase by itself.
  const ECONOMY_PHASE_CHECKPOINT_SCHEMA=1;
  const ECONOMY_PHASE_MUTATION_LIMIT=8192;
  const ECONOMY_PHASE_DOMAINS=new Set(['resources','industrial','fiscal']);
  function economyPhaseState(){
    const root=simulation.world.state;
    if(!root.simulation||typeof root.simulation!=='object'||Array.isArray(root.simulation))root.simulation={};
    let store=root.simulation.economyPhaseArchitectureV1;
    if(!store){
      store={schemaVersion:ECONOMY_PHASE_CHECKPOINT_SCHEMA,checkpoints:{},mutations:{}};
      root.simulation.economyPhaseArchitectureV1=store;
    }else if(typeof store!=='object'||Array.isArray(store)||Number(store.schemaVersion)!==ECONOMY_PHASE_CHECKPOINT_SCHEMA){
      throw new Error('ECONOMY_PHASE_CHECKPOINT_SCHEMA_UNSUPPORTED');
    }
    if(!store.checkpoints)store.checkpoints={};
    else if(typeof store.checkpoints!=='object'||Array.isArray(store.checkpoints))throw new Error('ECONOMY_PHASE_CHECKPOINT_DATA_INVALID');
    if(!store.mutations)store.mutations={};
    else if(typeof store.mutations!=='object'||Array.isArray(store.mutations))throw new Error('ECONOMY_PHASE_MUTATION_JOURNAL_INVALID');
    return store;
  }
  function economyPhaseScope(input={}){
    const domain=String(input.domain||'').trim().toLowerCase();
    const countryId=String(input.countryId||'').trim().toUpperCase();
    const session=rootSession();
    const sessionId=String(input.sessionId||'').trim();
    if(!ECONOMY_PHASE_DOMAINS.has(domain))return{error:domain==='food'?'DOMAIN_NOT_ENABLED':'INVALID_DOMAIN'};
    if(!/^[A-Z0-9]{2,3}$/.test(countryId))return{error:'CANONICAL_COUNTRY_ID_REQUIRED'};
    if(!sessionId)return{error:'SESSION_ID_REQUIRED'};
    if(domain==='resources'||domain==='industrial'){
      if(!session||!session.sessionId||!session.playerCountryId)return{error:'ACTIVE_PLAYER_SESSION_REQUIRED'};
      if(countryId!==String(session.playerCountryId).trim().toUpperCase()||
         sessionId!==String(session.sessionId).trim())return{error:'PLAYER_SESSION_IDENTITY_MISMATCH'};
    }
    return{domain,countryId,sessionId,key:[domain,countryId,sessionId].map(encodeURIComponent).join('|')};
  }
  function rootSession(){
    return simulation.world.state?.simulation?.session||null;
  }
  function economyPhaseDefaultCheckpoint(scope){
    return{schemaVersion:ECONOMY_PHASE_CHECKPOINT_SCHEMA,domain:scope.domain,countryId:scope.countryId,
      sessionId:scope.sessionId,lastProcessedTurn:0,lastProcessedDate:null,pendingThroughTurn:0,
      pendingElapsedDays:0,lastSuccessfulPhase:null,lastProcessedEventId:null,status:'READY',
      activeExecution:null,lastExecution:null,revision:0};
  }
  function economyPhaseGetCheckpoint(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const existing=simulation.world.state?.simulation?.economyPhaseArchitectureV1;
    if(existing&&Number(existing.schemaVersion)!==ECONOMY_PHASE_CHECKPOINT_SCHEMA)
      return{status:'UNSUPPORTED_SCHEMA',reason:'ECONOMY_PHASE_CHECKPOINT_SCHEMA_UNSUPPORTED'};
    const row=existing?economyPhaseState().checkpoints[scope.key]||null:null;
    return{status:'OK',checkpoint:clone(row||economyPhaseDefaultCheckpoint(scope))};
  }
  function economyPhaseSeed(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const baselineTurn=finite(input.baselineTurn);
    if(baselineTurn===null||baselineTurn<0||Math.floor(baselineTurn)!==baselineTurn)
      return{status:'INVALID',reason:'BASELINE_TURN_INVALID'};
    const store=economyPhaseState();
    let row=store.checkpoints[scope.key];
    if(row){
      if(row.baseline?.source===String(input.source||'LEGACY_SAVE_MIGRATION')&&
         Number(row.baseline?.turn)===baselineTurn)
        return{status:'ALREADY_SEEDED',checkpoint:clone(row)};
      const untouched=Number(row.revision||0)===0&&!row.activeExecution&&!row.lastExecution&&
        Number(row.lastProcessedTurn||0)===0&&Number(row.pendingThroughTurn||0)===0&&
        Number(row.pendingElapsedDays||0)===0;
      if(!untouched)return{status:'ALREADY_INITIALIZED',reason:'CHECKPOINT_ALREADY_HAS_PROGRESS',checkpoint:clone(row)};
    }else{
      row=store.checkpoints[scope.key]=economyPhaseDefaultCheckpoint(scope);
    }
    row.lastProcessedTurn=baselineTurn;
    row.pendingThroughTurn=baselineTurn;
    row.pendingElapsedDays=0;
    row.lastProcessedDate=input.baselineDate==null?row.lastProcessedDate:String(input.baselineDate);
    row.lastSuccessfulPhase='LEGACY_SAVE_BASELINE';
    row.lastProcessedEventId='BASELINE:'+String(input.source||'LEGACY_SAVE_MIGRATION');
    row.baseline={turn:baselineTurn,source:String(input.source||'LEGACY_SAVE_MIGRATION'),
      evidenceId:String(input.evidenceId||'').trim()||null};
    row.activeExecution=null;row.lastExecution=null;row.status='READY';
    row.revision=Number(row.revision||0)+1;
    return{status:'SEEDED',checkpoint:clone(row)};
  }
  function economyPhaseBegin(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const executionId=String(input.executionId||'').trim();
    const targetTurn=finite(input.targetTurn);
    if(!executionId)return{status:'INVALID',reason:'EXECUTION_ID_REQUIRED'};
    if(targetTurn===null||targetTurn<0||Math.floor(targetTurn)!==targetTurn)return{status:'INVALID',reason:'TARGET_TURN_INVALID'};
    const store=economyPhaseState(),row=store.checkpoints[scope.key]||(store.checkpoints[scope.key]=economyPhaseDefaultCheckpoint(scope));
    if(row.activeExecution){
      return{status:row.activeExecution.executionId===executionId?'RECOVERY_REQUIRED':'BUSY',
        reason:row.activeExecution.executionId===executionId?'EXECUTION_REQUIRES_RECONCILIATION':'ANOTHER_EXECUTION_IS_ACTIVE',
        checkpoint:clone(row)};
    }
    if(targetTurn<=Number(row.lastProcessedTurn||0)&&Number(row.pendingThroughTurn||0)<=Number(row.lastProcessedTurn||0))
      return{status:'ALREADY_PROCESSED',checkpoint:clone(row)};
    row.pendingThroughTurn=Math.max(Number(row.pendingThroughTurn||0),targetTurn);
    row.pendingElapsedDays=Math.max(0,row.pendingThroughTurn-Number(row.lastProcessedTurn||0));
    if(row.pendingElapsedDays<=0)return{status:'ALREADY_PROCESSED',checkpoint:clone(row)};
    row.activeExecution={executionId,fromTurn:Number(row.lastProcessedTurn||0)+1,
      throughTurn:row.pendingThroughTurn,requestedTurn:targetTurn,
      pendingElapsedDays:row.pendingElapsedDays};
    row.status='RUNNING';row.revision=Number(row.revision||0)+1;
    return{status:'STARTED',execution:clone(row.activeExecution),checkpoint:clone(row)};
  }
  function economyPhaseResume(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const store=economyPhaseState(),row=store.checkpoints[scope.key];
    const executionId=String(input.executionId||'').trim(),evidence=input.reconciliation||{};
    if(!row?.activeExecution||row.activeExecution.executionId!==executionId)
      return{status:'NOT_FOUND',reason:'ACTIVE_EXECUTION_NOT_FOUND'};
    if(evidence.status!=='RECONCILED'||!String(evidence.evidenceId||'').trim())
      return{status:'RECONCILIATION_REQUIRED',reason:'RECOVERY_REQUIRES_LEDGER_EVIDENCE',checkpoint:clone(row)};
    row.activeExecution.recoveryEvidenceId=String(evidence.evidenceId).trim();
    row.status='RUNNING';row.lastRecoveryEvidenceId=row.activeExecution.recoveryEvidenceId;
    row.revision=Number(row.revision||0)+1;
    return{status:'RESUMED',execution:clone(row.activeExecution),checkpoint:clone(row)};
  }
  function economyPhaseCommit(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const store=economyPhaseState(),row=store.checkpoints[scope.key];
    const executionId=String(input.executionId||'').trim(),evidence=input.reconciliation||{};
    if(!row?.activeExecution||row.activeExecution.executionId!==executionId)
      return{status:'NOT_FOUND',reason:'ACTIVE_EXECUTION_NOT_FOUND'};
    if(evidence.status!=='RECONCILED'||!String(evidence.evidenceId||'').trim())
      return{status:'RECONCILIATION_REQUIRED',reason:'AUTHORITATIVE_LEDGER_RECONCILIATION_REQUIRED'};
    const processedThroughTurn=finite(input.processedThroughTurn);
    if(processedThroughTurn===null||Math.floor(processedThroughTurn)!==processedThroughTurn||
       processedThroughTurn<=Number(row.lastProcessedTurn||0)||processedThroughTurn>Number(row.activeExecution.throughTurn))
      return{status:'INVALID',reason:'PROCESSED_TURN_OUT_OF_RANGE'};
    row.lastProcessedTurn=processedThroughTurn;
    row.lastProcessedDate=input.processedDate==null?row.lastProcessedDate:String(input.processedDate);
    row.pendingElapsedDays=Math.max(0,Number(row.pendingThroughTurn||0)-row.lastProcessedTurn);
    row.lastSuccessfulPhase=String(input.phase||scope.domain.toUpperCase()).trim();
    row.lastProcessedEventId=input.lastProcessedEventId==null?row.lastProcessedEventId:String(input.lastProcessedEventId);
    row.lastReconciliationEvidenceId=String(evidence.evidenceId).trim();
    row.lastExecution={executionId,status:'COMMITTED',processedThroughTurn,
      reconciliationEvidenceId:row.lastReconciliationEvidenceId};
    row.activeExecution=null;row.status=row.pendingElapsedDays>0?'CATCHING_UP':'READY';
    row.revision=Number(row.revision||0)+1;
    return{status:'COMMITTED',checkpoint:clone(row)};
  }
  function economyPhaseFail(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const store=economyPhaseState(),row=store.checkpoints[scope.key];
    const executionId=String(input.executionId||'').trim();
    if(!row?.activeExecution||row.activeExecution.executionId!==executionId)
      return{status:'NOT_FOUND',reason:'ACTIVE_EXECUTION_NOT_FOUND'};
    row.status='FAILED';row.lastError=String(input.error||'PHASE_EXECUTION_FAILED');
    row.revision=Number(row.revision||0)+1;
    return{status:'FAILED',checkpoint:clone(row)};
  }
  function economyPhaseIdempotencyKey(input={}){
    const scope=economyPhaseScope(input);if(scope.error)return{status:'INVALID',reason:scope.error};
    const executionId=String(input.executionId||'').trim(),operationId=String(input.operationId||'').trim();
    if(!executionId||!operationId)return{status:'INVALID',reason:'EXECUTION_AND_OPERATION_IDS_REQUIRED'};
    return{status:'OK',key:['OMEGA-ECONOMY-PHASE-V1',scope.domain,scope.countryId,scope.sessionId,executionId,operationId]
      .map(value=>encodeURIComponent(value)).join(':')};
  }
  function economyPhaseReserveMutation(input={}){
    const key=String(input.key||'').trim(),scope=economyPhaseScope(input);
    if(scope.error)return{status:'INVALID',reason:scope.error};
    if(!key)return{status:'INVALID',reason:'IDEMPOTENCY_KEY_REQUIRED'};
    if(!String(input.executionId||'').trim()||!String(input.operationId||'').trim())
      return{status:'INVALID',reason:'EXECUTION_AND_OPERATION_IDS_REQUIRED'};
    const store=economyPhaseState(),existing=store.mutations[key];
    if(existing&&(existing.domain!==scope.domain||existing.countryId!==scope.countryId||existing.sessionId!==scope.sessionId||existing.executionId!==String(input.executionId)))
      return{status:'INVALID',reason:'IDEMPOTENCY_SCOPE_MISMATCH'};
    if(existing?.status==='POSTED')return{status:'DUPLICATE',mutation:clone(existing)};
    if(existing?.status==='PENDING')return{status:'RECONCILIATION_REQUIRED',mutation:clone(existing)};
    if(existing?.status==='RETRYABLE'){
      existing.status='PENDING';existing.retryCount=Number(existing.retryCount||0)+1;
      return{status:'RETRY_ALLOWED',mutation:clone(existing)};
    }
    if(Object.keys(store.mutations).length>=ECONOMY_PHASE_MUTATION_LIMIT)
      return{status:'CAPACITY_REACHED',reason:'MUTATION_JOURNAL_FULL_FAIL_CLOSED'};
    const row={key,domain:scope.domain,countryId:scope.countryId,sessionId:scope.sessionId,
      executionId:String(input.executionId||''),operationId:String(input.operationId||''),status:'PENDING',retryCount:0};
    store.mutations[key]=row;
    return{status:'RESERVED',mutation:clone(row)};
  }
  function economyPhaseCompleteMutation(input={}){
    const key=String(input.key||'').trim(),evidence=input.evidence||{},store=economyPhaseState(),row=store.mutations[key];
    if(!row)return{status:'NOT_FOUND'};
    if(row.status==='POSTED')return{status:'DUPLICATE',mutation:clone(row)};
    if(row.status!=='PENDING')return{status:'RECONCILIATION_REQUIRED',mutation:clone(row)};
    if(evidence.status!=='POSTED'||!String(evidence.evidenceId||'').trim())
      return{status:'EVIDENCE_REQUIRED',reason:'POSTED_LEDGER_EVIDENCE_REQUIRED'};
    row.status='POSTED';row.evidenceId=String(evidence.evidenceId).trim();
    return{status:'POSTED',mutation:clone(row)};
  }
  function economyPhaseReconcileMutation(input={}){
    const key=String(input.key||'').trim(),evidence=input.evidence||{},store=economyPhaseState(),row=store.mutations[key];
    if(!row)return{status:'NOT_FOUND'};
    if(row.status==='POSTED')return{status:'DUPLICATE',mutation:clone(row)};
    if(evidence.status==='POSTED'&&String(evidence.evidenceId||'').trim()){
      row.status='POSTED';row.evidenceId=String(evidence.evidenceId).trim();
      return{status:'POSTED',mutation:clone(row)};
    }
    if(evidence.status==='NOT_POSTED'&&String(evidence.evidenceId||'').trim()){
      row.status='RETRYABLE';row.reconciliationEvidenceId=String(evidence.evidenceId).trim();
      return{status:'RETRYABLE',mutation:clone(row)};
    }
    return{status:'RECONCILIATION_REQUIRED',reason:'AUTHORITATIVE_LEDGER_EVIDENCE_REQUIRED',mutation:clone(row)};
  }
  function economyPhasePending(){
    const existing=simulation.world.state?.simulation?.economyPhaseArchitectureV1;
    if(!existing)return[];
    if(Number(existing.schemaVersion)!==ECONOMY_PHASE_CHECKPOINT_SCHEMA)
      throw new Error('ECONOMY_PHASE_CHECKPOINT_SCHEMA_UNSUPPORTED');
    const store=economyPhaseState();
    return Object.keys(store.checkpoints).map(key=>store.checkpoints[key])
      .filter(row=>row&&row.status!=='READY'&&row.status!=='COMPLETED')
      .map(row=>clone(row));
  }
  const EconomyPhaseCheckpointAPI=Object.freeze({
    VERSION:'1.0.0',SCHEMA_VERSION:ECONOMY_PHASE_CHECKPOINT_SCHEMA,
    get:economyPhaseGetCheckpoint,seed:economyPhaseSeed,begin:economyPhaseBegin,resume:economyPhaseResume,
    commit:economyPhaseCommit,fail:economyPhaseFail,pending:economyPhasePending,
    idempotencyKey:economyPhaseIdempotencyKey,reserveMutation:economyPhaseReserveMutation,
    completeMutation:economyPhaseCompleteMutation,reconcileMutation:economyPhaseReconcileMutation
  });

  const simulation=new SimulationCoordinator({
    state:global.Game?.state||global.gameState||{},
    worldEngine:global.WorldEcosystemEngine||null,
    interoperability:global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null,
    ministryRuntime:global.OMEGA_MINISTRY_RUNTIME_V1||null
  });

  global.Omega=global.Omega||{};
  global.Omega.EconomyPhaseCheckpoints=EconomyPhaseCheckpointAPI;
  global.Omega.SimulationRuntime=simulation;
  global.Omega.Simulation=simulation;
  global.Omega.GameSession=simulation;
  global.Omega.AuthoritativeWorldState=simulation.world;
  global.Omega.SimulationClock=SimulationClock;

  // Legacy compatibility bridge: every window-level turn listener becomes an awaited
  // participant. New subsystems should use registerTurnParticipant/registerSubsystem.
  // The final browser event is still emitted for external tools, but wrapped listeners are
  // suppressed during that dispatch to prevent a second execution of the same turn.
  (function installEventLedgerTurnBridge(){
    const ledger=simulation.events;
    if(ledger.__OMEGA_TURN_LEDGER_BRIDGE_V1__)return;
    const nativeSubscribe=ledger.subscribe.bind(ledger);
    const registries=new Map();
    let sequence=0;
    ledger.subscribe=function(type,listener){
      const key=String(type||'*');
      if((key!=='OMEGA_SIMULATION_TURN_COMMITTED'&&key!=='*')||typeof listener!=='function')
        return nativeSubscribe(type,listener);
      let registry=registries.get(key);
      if(!registry){registry=new WeakMap();registries.set(key,registry);}
      const previous=registry.get(listener);
      if(previous)return previous.remove;
      const id='legacy.event-ledger.'+(++sequence)+':'+key;
      let unregisterTurn=()=>{},unsubscribeNative=()=>{};
      if(key==='OMEGA_SIMULATION_TURN_COMMITTED'){
        unregisterTurn=simulation.registerTurnParticipant(id,event=>listener.call(global,clone(event.detail)));
      }else{
        // Preserve wildcard semantics for other ledger event types, but route their
        // turn-commit observation through the awaited participant list exactly once.
        const filtered=event=>{
          if(event&&event.eventType==='OMEGA_SIMULATION_TURN_COMMITTED')return;
          return listener.call(global,event);
        };
        unsubscribeNative=nativeSubscribe('*',filtered);
        unregisterTurn=simulation.registerTurnParticipant(id,event=>listener.call(global,clone(event.detail)));
      }
      const remove=()=>{
        unsubscribeNative();
        unregisterTurn();
        registry.delete(listener);
      };
      registry.set(listener,{remove});
      return remove;
    };
    ledger.__OMEGA_TURN_LEDGER_BRIDGE_V1__=true;
  })();

  (function installTurnEventBridge(){
    if(global.__OMEGA_TURN_EVENT_BRIDGE_V1__)return;
    const nativeAdd=global.addEventListener;
    const nativeRemove=global.removeEventListener;
    if(typeof nativeAdd!=='function'||typeof nativeRemove!=='function')return;
    const records=new Map();
    let legacySequence=0;
    const captureOf=options=>typeof options==='boolean'?options:!!(options&&options.capture);
    global.addEventListener=function(type,listener,options){
      if(type!=='OMEGA_SIMULATION_TURN_COMMITTED'||!listener){
        return nativeAdd.call(this,type,listener,options);
      }
      if(options&&typeof options==='object'&&options.signal?.aborted)return;
      const capture=captureOf(options);
      const bucket=records.get(listener)||[];
      const existing=bucket.find(row=>row.type===type&&row.capture===capture);
      if(existing)return;
      const id='legacy.turn-listener.'+(++legacySequence);
      // Keep a non-mutating registration map so slow legacy participants can be
      // traced back to their original file/function without changing dispatch.
      const listenerDiagnostics=global.__OMEGA_LEGACY_TURN_LISTENER_DIAGNOSTICS__
        ||(global.__OMEGA_LEGACY_TURN_LISTENER_DIAGNOSTICS__=[]);
      let registrationStack='';
      try{registrationStack=String(new Error('OMEGA_LEGACY_TURN_LISTENER_REGISTRATION').stack||'');}catch(_){}
      const currentScript=global.document?.currentScript||null;
      listenerDiagnostics.push({
        id,
        listenerName:typeof listener==='function'?(listener.name||'<anonymous>'):
          (typeof listener?.handleEvent==='function'?(listener.handleEvent.name||'handleEvent'):'<listener-object>'),
        registrationScript:currentScript?.src||currentScript?.getAttribute?.('src')||null,
        registrationStack
      });
      const once=!!(options&&typeof options==='object'&&options.once);
      let called=false,unregister=()=>{};
      const invoke=async event=>{
        if(once&&called)return;
        if(once){called=true;unregister();}
        if(typeof listener==='function')return listener.call(global,event);
        if(listener&&typeof listener.handleEvent==='function')return listener.handleEvent.call(listener,event);
      };
      unregister=simulation.registerTurnParticipant(id,invoke);
      const wrapped=function(event){
        if(global.__OMEGA_SIMULATION_PIPELINE_ACTIVE__===true||global.__OMEGA_SIMULATION_PIPELINE_DISPATCH__===true)return;
        const value=invoke(event);
        if(value&&typeof value.catch==='function')value.catch(error=>{try{console.error('[OMEGA LEGACY TURN LISTENER]',error);}catch(_){}});
      };
      const row={type,capture,wrapped,unregister,signal:options&&typeof options==='object'?options.signal:null,onAbort:null};
      bucket.push(row);records.set(listener,bucket);
      nativeAdd.call(this,type,wrapped,options);
      if(row.signal&&typeof row.signal.addEventListener==='function'){
        row.onAbort=()=>global.removeEventListener(type,listener,capture);
        row.signal.addEventListener('abort',row.onAbort,{once:true});
      }
    };
    global.removeEventListener=function(type,listener,options){
      if(type!=='OMEGA_SIMULATION_TURN_COMMITTED'||!listener){
        return nativeRemove.call(this,type,listener,options);
      }
      const bucket=records.get(listener)||[];
      const capture=captureOf(options);
      const index=bucket.findIndex(row=>row.type===type&&row.capture===capture);
      if(index<0)return nativeRemove.call(this,type,listener,options);
      const row=bucket.splice(index,1)[0];
      if(!bucket.length)records.delete(listener);
      nativeRemove.call(this,type,row.wrapped,options);
      row.unregister();
      if(row.signal&&row.onAbort)row.signal.removeEventListener('abort',row.onAbort);
    };
    global.__OMEGA_TURN_EVENT_BRIDGE_V1__=true;
  })();

  global.Omega.Simulation.configure({
    worldEngine:global.WorldEcosystemEngine||null,
    interoperability:global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null,
    ministryRuntime:global.OMEGA_MINISTRY_RUNTIME_V1||null
  });

  if(typeof global.addEventListener==='function'){
    global.addEventListener('OMEGA_READY',()=>{
      try{
        const runtime=global.Omega?.Simulation;
        runtime?.configure({
          state:global.Game?.state||global.gameState||runtime.world.state,
          worldEngine:global.WorldEcosystemEngine||null,
          interoperability:global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null,
          ministryRuntime:global.OMEGA_MINISTRY_RUNTIME_V1||null
        });
        const country=runtime?.getPlayerCountryId?.();
        if(country&&!runtime.world.state.simulation.session?.playerCountryId){
          runtime.createSession({playerCountryId:country});
        }
        try{global.__LOG_EVENT__?.('SIMULATION_AUTHORITY_READY');}catch(_){}
      }catch(error){
        try{console.error('[OMEGA SIM] Ready hook failed:',error);}catch(_){}
      }
    });
  }

  console.log('[OMEGA SIM] Simulation Authority Runtime v'+VERSION+' loaded.');
})(typeof window!=='undefined'?window:globalThis);
