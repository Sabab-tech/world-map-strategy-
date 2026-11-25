/*
 * OMEGA MINISTRY STATE TRANSACTION SYSTEM v1.0.0
 *
 * Deterministic write boundary for authoritative country-scoped state.
 * Commands may mutate their ministry-owned state plus explicitly allowlisted command-scoped paths.
 * Real timestamps are never used for simulation decisions.
 */
(function(global){
  'use strict';

  const VERSION='1.1.0';
  // Cross-ministry writes are granted only to a registered command type and exact paths.
  // Command payloads cannot add capabilities to this allowlist.
  const COMMAND_CROSS_DOMAIN_WRITE_PATHS=Object.freeze({
    OMEGA_TRADE_RESOURCE_DEBIT:Object.freeze(['trade.stateDirectiveSettlements']),
    OMEGA_STATE_PRIVATE_GOVERNMENT_PROCUREMENT:Object.freeze([
      'resource.batches','resource.inventoryLots','resource.processedWarehouse',
      'resource.inventoryLedger','economy.companyAccounts','trade.stateGovernmentProcurementLedger'
    ])
  });

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const k of Object.keys(value)){if(k==='__proto__'||k==='constructor')continue;const v=value[k];if(v!==undefined&&typeof v!=='function')out[k]=clone(v,seen);}
    return out;
  }

  function stable(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    const keys=Object.keys(value).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  }

  function hash(value){
    const input=stable(value);
    let h=2166136261;
    for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }

  // Compact command transactions use a strictly bounded conflict signature.
  // Never enumerate a complete inventory/ledger array or object: the former
  // "bounded-depth" implementation still visited every array element and every
  // object key, so staging and commit remained O(size of the full country ledger).
  // Transactional writers are serialized by the exact write-set check; this
  // lightweight sample also detects direct and common nested external mutations.
  function compactShape(value,depth=3,seen=new WeakSet()){
    if(value===null)return 'null';
    const type=typeof value;
    if(type!=='object')return type+':'+String(JSON.stringify(value));
    if(seen.has(value))return 'cycle';
    if(depth<=0)return Array.isArray(value)?'array:'+value.length:'object';
    seen.add(value);
    if(Array.isArray(value)){
      const length=value.length,indices=new Set();
      for(let i=0;i<Math.min(4,length);i++)indices.add(i);
      for(let i=Math.max(4,length-4);i<length;i++)indices.add(i);
      const sample=[];
      for(const i of indices)sample.push(i+':'+compactShape(value[i],depth-1,seen));
      return 'A'+length+'['+sample.join(',')+']';
    }
    const sampleKeys=[];
    for(const key in value){
      if(!Object.prototype.hasOwnProperty.call(value,key)||key==='__proto__'||key==='constructor')continue;
      sampleKeys.push(key);
      if(sampleKeys.length===8)break;
    }
    return 'O{'+sampleKeys.map(key=>JSON.stringify(key)+':'+compactShape(value[key],depth-1,seen)).join(',')+'}';
  }

  function validId(value){return String(value??'').trim().length>0;}

  function canonicalCountryId(value){
    const raw=String(value??'').trim();
    if(!raw)return '';
    // An ISO 3166-1 alpha-3 key is already the canonical country identity.
    // Keep it out of the semantic resolver hot path used for every state transaction.
    const direct=raw.toUpperCase();
    if(/^[A-Z]{3}$/.test(direct))return direct;
    const registry=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||global.Omega?.CanonicalIdentity;
    if(registry&&typeof registry.resolveCountry==='function'){
      for(const candidate of [raw,raw.replace(/[_-]+/g,' ')]){
        try{
          const hit=registry.resolveCountry(candidate);
          if(hit&&hit.id){
            const row=hit.raw?.raw||hit.raw||null;
            const iso3=row?.iso3||row?.iso3Code||row?.ISO_A3||row?.iso_a3;
            return String(iso3||hit.id).trim().toUpperCase();
          }
        }catch(_){}
      }
    }
    return raw.toUpperCase();
  }

  function countryAliasKeys(countryId){
    // Preserve the canonical ISO3 key without invoking the semantic resolver
    // during every country-scoped state read on older WebView runtimes.
    const direct=String(countryId??'').trim().toUpperCase();
    if(/^[A-Z]{3}$/.test(direct))return [direct];
    const registry=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||global.Omega?.CanonicalIdentity;
    if(!registry||typeof registry.resolveCountry!=='function')return [];
    for(const candidate of [countryId,String(countryId??'').replace(/[_-]+/g,' ')]){
      try{
        const hit=registry.resolveCountry(candidate);
        if(!hit||!hit.id)continue;
        const row=hit.raw?.raw||hit.raw||{};
        return [...new Set([row.iso3,row.iso3Code,row.ISO_A3,row.iso_a3,row.iso2,row.code,hit.id,row.name,row.officialName,...(Array.isArray(row.aliases)?row.aliases:[])].filter(Boolean).map(x=>String(x).trim().toUpperCase()))];
      }catch(_){}
    }
    return [];
  }

  function countryBucketKey(section,countryId){
    if(!section||typeof section!=='object')return null;
    if(Object.prototype.hasOwnProperty.call(section,countryId))return countryId;
    for(const alias of countryAliasKeys(countryId))if(Object.prototype.hasOwnProperty.call(section,alias))return alias;
    for(const key of Object.keys(section))if(canonicalCountryId(key)===countryId)return key;
    return null;
  }

  class StateTransaction{
    constructor(stateSource,ownerMinistry,countryId,turn,commandId,transactionOptions={}){
      this.version=VERSION;
      this.state=stateSource||global.Game?.state||global.gameState||null;
      this.ownerMinistry=String(ownerMinistry||'');
      this.countryId=canonicalCountryId(countryId);
      this.turn=Number.isFinite(Number(turn))?Number(turn):0;
      this.commandId=String(commandId||'');
      this.commandType=String(transactionOptions.commandType||'');
      // Standalone transaction callers retain full before/after evidence. The
      // Interoperability command ledger opts out to avoid retaining large copies.
      this.includeOperationValues=transactionOptions.includeOperationValues!==false;
      const commandPaths=Object.prototype.hasOwnProperty.call(COMMAND_CROSS_DOMAIN_WRITE_PATHS,this.commandType)
        ?COMMAND_CROSS_DOMAIN_WRITE_PATHS[this.commandType]:[];
      this.authorizedCrossDomainWritePaths=new Set(commandPaths);
      this.transactionId='OMI-TX-'+this.turn+'-'+this.ownerMinistry+'-'+this.commandId;
      this.operations=[];
      this.writeBaseline=new Map();
      this.closed=false;
    }

    _assertOpen(){
      if(this.closed)throw new Error('STATE_TRANSACTION_CLOSED');
      if(!this.state)throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
      if(!validId(this.ownerMinistry)||!validId(this.countryId))throw new Error('INVALID_TRANSACTION_SCOPE');
      if(!this.commandId)throw new Error('COMMAND_ID_REQUIRED');
    }

    _assertOwnedPath(path){
      const p=String(path||'').trim();
      if(!p)throw new Error('STATE_PATH_REQUIRED');
      const first=p.split('.')[0];
      const aliases={
        resourceSummary:'resource',
        resourceInventory:'resource',
        resourceDeposits:'resource',
        cities:'interior'
      };
      const owner=aliases[first]||first;
      if(owner!==this.ownerMinistry&&!this.authorizedCrossDomainWritePaths.has(p))
        throw new Error('STATE_PATH_NOT_OWNED_BY_MINISTRY:'+p);
      return p;
    }

    _scopeSnapshot(){
      const out={};
      const domains=new Set([this.ownerMinistry,...this.operations.map(operation=>String(operation.path||'').split('.')[0]).filter(Boolean)]);
      for(const domain of domains){
        const section=this.state?.[domain],key=countryBucketKey(section,this.countryId);
        out[domain]=key===null?null:clone(section[key]);
      }
      return out;
    }

    _readLivePath(path,cloneValue=true){
      const ref=this._countryContainer(path,false);
      if(!ref)return undefined;
      let cur=ref.container;
      for(const part of ref.parts){
        if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
        cur=cur[part];
      }
      return cloneValue?clone(cur):cur;
    }

    _valueFingerprint(value,path){
      // Detailed standalone transactions preserve their full content fingerprint.
      // Compact command transactions need conflict evidence, not a second complete
      // serialization of multi-megabyte country ledgers.
      return this.includeOperationValues
        ?hash({present:value!==undefined,value})
        :hash({path:String(path||''),present:value!==undefined,shape:compactShape(value)});
    }

    _captureWriteBaseline(path){
      if(this.writeBaseline.has(path))return;
      // Compact command transactions need only an optimistic-concurrency
      // fingerprint. Retaining a deep copy of every large country ledger here
      // duplicates the same state that get() already snapshots for the handler.
      const value=this._readLivePath(path,this.includeOperationValues);
      this.writeBaseline.set(path,this.includeOperationValues?value:this._valueFingerprint(value,path));
    }

    _writeSetFingerprint(readCurrent=false,cloneCurrent=true){
      const paths=[...this.writeBaseline.keys()].sort();
      if(!this.includeOperationValues){
        const rows=paths.map(path=>({
          path,
          fingerprint:readCurrent
            ?this._valueFingerprint(this._readLivePath(path,cloneCurrent),path)
            :this.writeBaseline.get(path)
        }));
        return hash(rows);
      }
      const rows=paths.map(path=>{
        const value=readCurrent?this._readLivePath(path,cloneCurrent):this.writeBaseline.get(path);
        return{path,present:value!==undefined,value};
      });
      return hash(rows);
    }

    _countryContainer(path,create){
      const parts=String(path).split('.');
      const domain=parts.shift();
      if(!this.state[domain]||typeof this.state[domain]!=='object'){
        if(!create)return null;
        this.state[domain]={};
      }
      const key=countryBucketKey(this.state[domain],this.countryId);
      let countryKey=key;
      if(countryKey===null){
        if(!create)return null;
        countryKey=this.countryId;
        this.state[domain][countryKey]={};
      }
      if(!this.state[domain][countryKey]||typeof this.state[domain][countryKey]!=='object'){
        if(!create)return null;
        this.state[domain][countryKey]={};
      }
      return {domain,countryKey,container:this.state[domain][countryKey],parts};
    }

    set(path,value){
      this._assertOpen();
      const p=this._assertOwnedPath(path);
      this._captureWriteBaseline(p);
      // Compact command-ledger transactions do not persist before/after values.
      // Avoid cloning the same live path a second time just to discard its snapshot.
      const before=this.includeOperationValues?this.get(p):undefined;
      this.operations.push({op:'SET',path:p,before,after:clone(value)});
      // The staged value is already isolated from the caller. Compact command
      // handlers may receive their own input reference without another deep copy.
      return this.includeOperationValues?clone(value):value;
    }

    setOwned(path,value){
      this._assertOpen();
      if(this.includeOperationValues)throw new Error('STATE_TRANSACTION_SET_OWNED_REQUIRES_COMPACT_MODE');
      const p=this._assertOwnedPath(path);
      this._captureWriteBaseline(p);
      // Ownership-transfer path for handlers that built the value from get()'s
      // detached snapshot. Do not mutate or retain the value after this call.
      // This avoids a second full deep clone while preserving transaction isolation.
      this.operations.push({op:'SET',path:p,before:undefined,after:value});
      return value;
    }

    delete(path){
      this._assertOpen();
      const p=this._assertOwnedPath(path);
      this._captureWriteBaseline(p);
      const existing=this.get(p);
      this.operations.push({op:'DELETE',path:p,before:clone(existing),after:undefined});
      return existing;
    }

    get(path){
      this._assertOpen();
      const p=String(path||'');
      const staged=[...this.operations].reverse().find(op=>op.path===p);
      if(staged)return clone(staged.after);
      const ref=this._countryContainer(p,false);
      if(!ref)return undefined;
      let cur=ref.container;
      for(const part of ref.parts){
        if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
        cur=cur[part];
      }
      return clone(cur);
    }

    getReference(path){
      this._assertOpen();
      const p=String(path||'');
      for(let i=this.operations.length-1;i>=0;i--){
        const operation=this.operations[i];
        if(operation.path===p)return operation.after;
      }
      const ref=this._countryContainer(p,false);
      if(!ref)return undefined;
      let cur=ref.container;
      for(const part of ref.parts){
        if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
        cur=cur[part];
      }
      // READ-ONLY: callers must not mutate the returned live state. Use copy-on-write
      // for any container that needs to be changed before staging it with set().
      return cur;
    }

    commit(){
      this._assertOpen();
      // Transactions are sovereign/country scoped. Hash only the owned country
      // state instead of the entire global Game.state. The previous global hash made
      // every country commit scan all already-materialized countries, producing O(N²)
      // extraction cost during world-scale resource simulation.
      // Guard only the exact write set. Unrelated values in this country or
      // other countries can still change without forcing a transaction retry.
      const beforeDigest=this._writeSetFingerprint(false);
      for(const [path,expected] of this.writeBaseline.entries()){
        // Fingerprinting is read-only; do not deep-clone the live value before hashing.
        const actual=this._readLivePath(path,false);
        const expectedFingerprint=this.includeOperationValues?this._valueFingerprint(expected):expected;
        const actualFingerprint=this._valueFingerprint(actual,path);
        if(actualFingerprint!==expectedFingerprint){
          this.closed=true;
          const conflict=new Error('STATE_TRANSACTION_CONFLICT');
          conflict.code='STATE_TRANSACTION_CONFLICT';
          conflict.transactionId=this.transactionId;
          conflict.path=path;
          conflict.expectedRevision='CONTENT:'+expectedFingerprint;
          conflict.actualRevision='CONTENT:'+actualFingerprint;
          throw conflict;
        }
      }
      const applied=[];
      for(const operation of this.operations){
        const ref=this._countryContainer(operation.path,true);
        let cur=ref.container;
        for(let i=0;i<ref.parts.length-1;i++){
          const part=ref.parts[i];
          if(!cur[part]||typeof cur[part]!=='object')cur[part]={};
          cur=cur[part];
        }
        const leaf=ref.parts[ref.parts.length-1];
        // set() already isolated the staged value. Compact command transactions
        // can transfer that owned snapshot directly into state and release it below.
        if(operation.op==='SET')cur[leaf]=this.includeOperationValues?clone(operation.after):operation.after;
        else if(operation.op==='DELETE')delete cur[leaf];
        if(this.includeOperationValues){
          applied.push({
            op:operation.op,
            path:operation.path,
            before:clone(operation.before),
            after:clone(operation.after)
          });
        }else{
          // The authoritative before/after values already live in Game.state.
          // The transaction-wide content revisions retain integrity evidence without
          // duplicating multi-megabyte domain snapshots in each command row.
          applied.push({
            op:operation.op,
            path:operation.path
          });
        }
      }
      const afterDigest=this._writeSetFingerprint(true,false);
      this.closed=true;
      // Release the transaction's temporary full-value copies immediately. Keep
      // the compact path list on the transaction object because the command router
      // reads operations.length to count authoritative writes after commit().
      this.operations=applied;
      this.writeBaseline.clear();
      return Object.freeze({
        transactionId:this.transactionId,
        commandId:this.commandId,
        ownerMinistry:this.ownerMinistry,
        countryId:this.countryId,
        simulationTurn:this.turn,
        changed:beforeDigest!==afterDigest,
        operations:clone(applied),
        beforeRevision:'CONTENT:'+beforeDigest,
        afterRevision:'CONTENT:'+afterDigest
      });
    }

    rollback(){
      this.closed=true;
      this.operations=[];
      this.writeBaseline.clear();
      return true;
    }
  }

  const api=Object.freeze({
    VERSION,
    create:(ownerMinistry,countryId,turn,commandId,stateSource,transactionOptions={})=>new StateTransaction(
      stateSource||global.Game?.state||global.gameState||null,
      ownerMinistry,countryId,turn,commandId,transactionOptions
    )
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryStateTransaction=api;
  global.OmegaMinistryStateTransaction=api;
})(typeof window!=='undefined'?window:globalThis);
