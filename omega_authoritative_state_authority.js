/*
 * OMEGA AUTHORITATIVE STATE AUTHORITY v1.0.0
 *
 * Single write boundary for the canonical country-scoped game state.
 * The authority owns the state object; transactions are only staged write plans.
 * No ministry engine receives direct write access to another ministry's state.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const k of Object.keys(value)){
      if(k==='__proto__'||k==='constructor')continue;
      const v=value[k];
      if(v!==undefined&&typeof v!=='function')out[k]=clone(v,seen);
    }
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

  function normalizeCountryId(value){
    const id=String(value??'').trim().toUpperCase();
    if(!id)throw new Error('COUNTRY_ID_REQUIRED');
    return id;
  }

  function readPath(root,path){
    let cur=root;
    for(const part of String(path||'').split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
      cur=cur[part];
    }
    return cur;
  }

  class AuthoritativeStateAuthority{
    constructor(options={}){
      this.version=VERSION;
      this.stateSource=options.stateSource||null;
      this.transactionLedger=new Map();
      this.revisionLedger=new Map();
    }

    root(){
      return this.stateSource||global.Game?.state||global.gameState||global.Omega?.World?.state||null;
    }

    bind(stateSource){
      if(stateSource)this.stateSource=stateSource;
      return !!this.root();
    }

    countryContainer(countryId,domain,create=false){
      const state=this.root();
      if(!state)throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
      const id=normalizeCountryId(countryId);
      if(!state[domain]||typeof state[domain]!=='object'){
        if(!create)return null;
        state[domain]={};
      }
      if(!state[domain][id]||typeof state[domain][id]!=='object'){
        if(!create)return null;
        state[domain][id]={};
      }
      return state[domain][id];
    }

    read(countryId,path){
      const id=normalizeCountryId(countryId);
      const parts=String(path||'').split('.');
      if(!parts[0])return undefined;
      const bucket=this.countryContainer(id,parts.shift(),false);
      if(!bucket)return undefined;
      let cur=bucket;
      for(const part of parts){
        if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
        cur=cur[part];
      }
      return clone(cur);
    }

    readDomain(countryId,domain){
      const bucket=this.countryContainer(countryId,String(domain||''),false);
      return bucket?clone(bucket):null;
    }

    revision(countryId,domain){
      const id=normalizeCountryId(countryId);
      const d=String(domain||'').trim();
      const key=id+'::'+d;
      const current=this.readDomain(id,d);
      if(current===null)return null;
      const rev='CONTENT:'+hash(current);
      this.revisionLedger.set(key,rev);
      return rev;
    }

    begin(ownerMinistry,countryId,turn,commandId){
      const transactionFactory=global.OmegaMinistryStateTransaction;
      if(!transactionFactory?.create)throw new Error('STATE_TRANSACTION_SYSTEM_UNAVAILABLE');
      return transactionFactory.create(ownerMinistry,normalizeCountryId(countryId),turn,commandId,this);
    }

    commitTransaction(transaction){
      if(!transaction||typeof transaction!=='object')throw new Error('INVALID_STATE_TRANSACTION');
      const state=this.root();
      if(!state)throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
      const id=normalizeCountryId(transaction.countryId);
      const owner=String(transaction.ownerMinistry||'');
      if(!owner)throw new Error('STATE_OWNER_REQUIRED');
      const canonicalIds=Array.isArray(global.OmegaMinistryRegistry?.ids)
        ?global.OmegaMinistryRegistry.ids.map(String)
        :null;
      if(canonicalIds&& !canonicalIds.includes(owner))throw new Error('STATE_OWNER_UNKNOWN:'+owner);
      const operations=Array.isArray(transaction.operations)?transaction.operations:[];
      const transactionId=String(transaction.transactionId||('OMI-TX-'+transaction.turn+'-'+owner+'-'+transaction.commandId));

      // Semantic idempotency: the same committed command is never applied twice.
      const existing=this.transactionLedger.get(transactionId);
      if(existing&&existing.status!=='CONFLICT'){
        return Object.freeze({...clone(existing),duplicate:true,status:'ALREADY_PROCESSED'});
      }
      if(existing?.status==='CONFLICT')this.transactionLedger.delete(transactionId);

      const aliases={resourceSummary:'resource',resourceInventory:'resource',resourceDeposits:'resource'};
      const firstDomain=String(operations[0]?.path||'').split('.')[0]||owner;
      const primaryDomain=aliases[firstDomain]||firstDomain;
      const currentRevision=this.revision(id,primaryDomain);
      const expectedRevision=transaction.expectedRevision===undefined
        ? currentRevision
        : transaction.expectedRevision;

      // Optimistic concurrency: the writer must commit against the revision it observed.
      if(String(expectedRevision??'NULL')!==String(currentRevision??'NULL')){
        const conflict={
          transactionId,
          commandId:String(transaction.commandId||''),
          ownerMinistry:owner,
          countryId:id,
          simulationTurn:Number(transaction.turn)||0,
          status:'CONFLICT',
          conflictType:'OPTIMISTIC_CONCURRENCY',
          expectedRevision:expectedRevision??null,
          currentRevision:currentRevision??null
        };
        this.transactionLedger.set(transactionId,clone(conflict));
        throw new Error('STATE_REVISION_CONFLICT:'+String(expectedRevision??'NULL')+':'+String(currentRevision??'NULL'));
      }

      const beforeDigest=hash(state);
      const beforeDomainRevision=currentRevision;
      const stagedDomains=new Map();
      const applied=[];

      // Preflight and stage every operation on cloned country-domain buckets.
      // Nothing in authoritative state is mutated until the entire transaction validates.
      for(const operation of operations){
        const path=String(operation?.path||'');
        const pieces=path.split('.');
        const domain=pieces.shift();
        if(!domain||pieces.length===0||!(domain===owner||(owner==='resource'&&['resourceSummary','resourceInventory','resourceDeposits'].includes(domain)))){
          throw new Error('STATE_PATH_NOT_OWNED_BY_MINISTRY:'+path);
        }
        if(operation.op!=='SET'&&operation.op!=='DELETE')throw new Error('UNKNOWN_STATE_OPERATION:'+operation.op);
        const aliases={resourceSummary:'resource',resourceInventory:'resource',resourceDeposits:'resource'};
        const actualDomain=aliases[domain]||domain;
        let bucket=stagedDomains.get(actualDomain);
        if(!bucket){
          const existingDomain=state[actualDomain];
          const existingBucket=existingDomain&&typeof existingDomain==='object'?existingDomain[id]:undefined;
          bucket=existingBucket&&typeof existingBucket==='object'?clone(existingBucket):{};
          stagedDomains.set(actualDomain,bucket);
        }
        let cursor=bucket;
        for(let i=0;i<pieces.length-1;i++){
          const part=pieces[i];
          if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};
          cursor=cursor[part];
        }
        const leaf=pieces[pieces.length-1];
        const before=clone(cursor[leaf]);
        if(operation.op==='DELETE')delete cursor[leaf];
        else cursor[leaf]=clone(operation.after);
        applied.push({op:operation.op,path,before,after:clone(cursor[leaf])});
      }

      // Atomic publish of staged country buckets after all validation/application succeeded.
      for(const [domain,bucket] of stagedDomains.entries()){
        if(!state[domain]||typeof state[domain]!=='object')state[domain]={};
        state[domain][id]=bucket;
      }

            const afterDigest=hash(state);
      const afterDomainRevision=this.revision(id,primaryDomain);
      const record={
        transactionId,
        commandId:String(transaction.commandId||''),
        ownerMinistry:owner,
        countryId:id,
        simulationTurn:Number(transaction.turn)||0,
        changed:beforeDigest!==afterDigest,
        operations:applied,
        beforeRevision:beforeDomainRevision,
        afterRevision:afterDomainRevision,
        expectedRevision:expectedRevision??null
      };
      this.transactionLedger.set(transactionId,clone(record));
      while(this.transactionLedger.size>256){
        const first=this.transactionLedger.keys().next().value;
        if(first)this.transactionLedger.delete(first);else break;
      }
      if(record.changed){
        for(const operation of applied){
          const domain=String(operation.path).split('.')[0];
          const actual=({
            resourceSummary:'resource',
            resourceInventory:'resource',
            resourceDeposits:'resource'
          })[domain]||domain;
          this.revisionLedger.set(id+'::'+actual,'CONTENT:'+hash(this.readDomain(id,actual)));
        }
      }
      return Object.freeze(record);
    }

    getTransaction(transactionId){
      return clone(this.transactionLedger.get(String(transactionId||''))||null);
    }

    reconstructState(baseState=null,options={}){
      const source=baseState&&typeof baseState==='object'
        ?clone(baseState)
        :clone(this.root()||{});
      const from=Number.isFinite(Number(options.fromTurn))?Number(options.fromTurn):-Infinity;
      const to=Number.isFinite(Number(options.toTurn))?Number(options.toTurn):Infinity;
      const rows=[...this.transactionLedger.values()]
        .filter(row=>row&&row.status!=='CONFLICT'&&Number(row.simulationTurn)>=from&&Number(row.simulationTurn)<=to)
        .sort((a,b)=>Number(a.simulationTurn)-Number(b.simulationTurn)||String(a.transactionId).localeCompare(String(b.transactionId)));
      const apply=(state,transaction)=>{
        for(const operation of transaction.operations||[]){
          const pieces=String(operation.path||'').split('.');
          const domainAlias={resourceSummary:'resource',resourceInventory:'resource',resourceDeposits:'resource'};
          const declaredDomain=pieces.shift();
          if(!declaredDomain||!pieces.length)continue;
          const domainKey=domainAlias[declaredDomain]||declaredDomain;
          if(!state[domainKey]||typeof state[domainKey]!=='object')state[domainKey]={};
          const countryId=normalizeCountryId(transaction.countryId);
          if(!state[domainKey][countryId]||typeof state[domainKey][countryId]!=='object')state[domainKey][countryId]={};
          let cursor=state[domainKey][countryId];
          for(let i=0;i<pieces.length-1;i++){
            const part=pieces[i];
            if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};
            cursor=cursor[part];
          }
          const leaf=pieces[pieces.length-1];
          if(operation.op==='DELETE')delete cursor[leaf];
          else if(operation.op==='SET')cursor[leaf]=clone(operation.after);
        }
      };
      for(const transaction of rows)apply(source,transaction);
      return {
        schemaVersion:1,
        mode:'AUTHORITATIVE_TRANSACTION_REPLAY',
        fromTurn:options.fromTurn??null,
        toTurn:options.toTurn??null,
        appliedTransactionCount:rows.length,
        appliedTransactions:rows.map(row=>({
          transactionId:row.transactionId,
          commandId:row.commandId,
          ownerMinistry:row.ownerMinistry,
          countryId:row.countryId,
          simulationTurn:row.simulationTurn,
          changed:row.changed===true
        })),
        state:source,
        digest:hash(source)
      };
    }

    exportState(){
      return {
        schemaVersion:1,
        version:VERSION,
        revisions:clone(Object.fromEntries(this.revisionLedger)),
        transactions:clone(Object.fromEntries(this.transactionLedger))
      };
    }

    importState(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_STATE_AUTHORITY_SAVE');
      this.revisionLedger=new Map(Object.entries(snapshot.revisions||{}));
      this.transactionLedger=new Map(Object.entries(snapshot.transactions||{}));
      return true;
    }

    diagnostics(){
      return {
        version:VERSION,
        stateAvailable:!!this.root(),
        transactionRecords:this.transactionLedger.size,
        revisionRecords:this.revisionLedger.size
      };
    }
  }

  const instance=new AuthoritativeStateAuthority();
  const api=Object.freeze({
    VERSION,
    instance,
    bind:state=>instance.bind(state),
    root:()=>instance.root(),
    read:(countryId,path)=>instance.read(countryId,path),
    readDomain:(countryId,domain)=>instance.readDomain(countryId,domain),
    revision:(countryId,domain)=>instance.revision(countryId,domain),
    begin:(owner,country,turn,commandId)=>instance.begin(owner,country,turn,commandId),
    commitTransaction:tx=>instance.commitTransaction(tx),
    getTransaction:id=>instance.getTransaction(id),
    saveState:()=>instance.exportState(),
    loadState:s=>instance.importState(s),
    reconstructState:(baseState,options)=>instance.reconstructState(baseState,options),
    diagnostics:()=>instance.diagnostics()
  });

  global.Omega=global.Omega||{};
  global.Omega.AuthoritativeStateAuthority=api;
  global.OmegaAuthoritativeStateAuthority=api;
})(typeof window!=='undefined'?window:globalThis);
