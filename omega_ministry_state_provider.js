/*
 * OMEGA CANONICAL MINISTRY STATE PROVIDER v1.0.0
 *
 * Read-only boundary between raw/canonical game data and ministry systems.
 * It never invents missing values and never mutates authoritative state.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
  const AVAILABILITY=Object.freeze({
    AVAILABLE:'AVAILABLE',
    UNOBSERVED:'UNOBSERVED',
    UNAVAILABLE:'UNAVAILABLE',
    STALE:'STALE',
    INVALID:'INVALID',
    NOT_APPLICABLE:'NOT_APPLICABLE',
    ESTIMATED:'ESTIMATED'
  });

  function clone(value,seen=new WeakMap()){
    if(value===null || typeof value!=='object') return value;
    if(seen.has(value)) return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    if(value instanceof Map){const out={};seen.set(value,out);for(const [k,v] of value.entries())out[String(k)]=clone(v,seen);return out;}
    if(value instanceof Set){const out=[];seen.set(value,out);for(const v of value.values())out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const key of Object.keys(value)){if(key==='__proto__'||key==='constructor')continue;const v=value[key];if(v!==undefined&&typeof v!=='function')out[key]=clone(v,seen);}
    return out;
  }

  function readPath(root,path){
    if(root==null || !path)return undefined;
    let cur=root;
    for(const part of String(path).split('.')){
      if(cur==null || !Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
      cur=cur[part];
    }
    return cur;
  }

  function normalizeId(value){return String(value??'').trim().toUpperCase();}

  function stable(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value instanceof Map){const o={};for(const [k,v] of value.entries())o[String(k)]=v;return stable(o);}
    if(value instanceof Set)return '['+[...value].map(stable).sort().join(',')+']';
    const keys=Object.keys(value).filter(k=>k!=='__proto__'&&k!=='constructor').sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  }

  function hash(value){
    let h=2166136261;
    const input=stable(value);
    for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }

  function topDomain(path){
    const first=String(path??'').split('.')[0];
    return first || null;
  }

  const DATASET_DOMAIN_MAP=Object.freeze({
    economy:'economy.json',
    population:'population.json'
  });
  const DATASET_INPUT_CONTRACT=Object.freeze({
    schemaVersion:1,
    identityAuthority:'OMEGA_CANONICAL_IDENTITY_BRIDGE',
    acceptedShapes:['COUNTRY_KEYED_OBJECT','COUNTRY_RECORD_ARRAY','COUNTRY_RECORD_OBJECT'],
    canonicalCountryField:'countryId',
    acceptedCountryFields:Object.freeze(['countryId','countryCode','country_code','iso2','iso3','code','id','name','countryName','country_name']),
    countryKeyedObjects:true,
    valuesAreOpaque:true,
    noImplicitDefaults:true
  });

  const COUNTRY_SCOPED_DOMAINS=Object.freeze(new Set([
    'finance','economy','trade','foreign','intelligence','defense','military',
    'interior','transport','resource','health','education','technology',
    'projects','culture','statistics','population','relations','cities'
  ]));

  class MinistryStateProvider{
    constructor(options={}){
      this.version=VERSION;
      this.stateSource=options.stateSource||null;
      this.countryRegistry=options.countryRegistry||null;
      this.datasetRows=Array.isArray(options.countryRows)?options.countryRows:null;
      this.revisionOverrides=options.revisionOverrides||null;
      this.turnOverrides=options.turnOverrides||null;
    }

    root(){
      return this.stateSource || global.OmegaAuthoritativeStateAuthority?.instance?.root?.() ||
        global.Omega?.AuthoritativeStateAuthority?.instance?.root?.() ||
        global.Game?.state || global.gameState || global.Omega?.World?.state || {};
    }

    authority(){
      return global.OmegaAuthoritativeStateAuthority?.instance ||
        global.Omega?.AuthoritativeStateAuthority?.instance || null;
    }

    _canonicalDatasetRecord(countryId,domain){
      const dataset=DATASET_DOMAIN_MAP[String(domain||'')];
      if(!dataset)return null;
      const registry=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||null;
      try{
        const record=registry?.getDatasetRecord?.(dataset,countryId);
        return record===undefined?null:clone(record);
      }catch(_){return null;}
    }

    simulationTurn(){
      const state=this.root();
      const candidates=[
        state.simulationTurn,state.currentTurn,state.turn,
        global.OmegaSimulation?.currentTurn,global.Omega?.Simulation?.currentTurn
      ];
      for(const v of candidates){const n=Number(v);if(Number.isFinite(n))return n;}
      return null;
    }

    _identityRows(){
      if(this.datasetRows)return this.datasetRows;
      const registry=this.countryRegistry||global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge;
      try{
        const exported=registry?.exportData?.();
        if(Array.isArray(exported?.countries))return exported.countries;
      }catch(_){}
      return [];
    }

    canonicalCountryId(value){
      const registry=this.countryRegistry||global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge;
      try{
        const hit=registry?.canonicalCountryId?.(value);
        if(hit)return String(hit).toUpperCase();
        const resolved=registry?.resolveCountry?.(value);
        if(resolved?.id)return String(resolved.id).toUpperCase();
      }catch(_){}
      return normalizeId(value)||null;
    }

    validateDatasetShape(dataset,options={}){
      const contract=DATASET_INPUT_CONTRACT;
      const value=dataset;
      const errors=[];
      if(value===null||value===undefined)errors.push('DATASET_EMPTY');
      if(Array.isArray(value)){
        value.forEach((row,index)=>{
          if(!row||typeof row!=='object')errors.push('ROW_'+index+'_NOT_OBJECT');
          else if(!this.canonicalCountryId(row.countryId||row.countryCode||row.country_code||row.iso2||row.iso3||row.code||row.id||row.name||row.countryName||row.country_name)){
            errors.push('ROW_'+index+'_COUNTRY_ID_UNRESOLVED');
          }
        });
      }else if(typeof value==='object'){
        for(const [key,row] of Object.entries(value)){
          if(!row||typeof row!=='object'){errors.push('KEY_'+key+'_VALUE_NOT_OBJECT');continue;}
          const resolved=this.canonicalCountryId(row.countryId||row.countryCode||row.country_code||row.iso2||row.iso3||row.code||row.id||row.name||row.countryName||row.country_name||key);
          if(!resolved)errors.push('KEY_'+key+'_COUNTRY_ID_UNRESOLVED');
        }
      }else errors.push('DATASET_NOT_OBJECT_OR_ARRAY');
      const result={...contract,valid:errors.length===0,errors};
      if(options.strict&&errors.length)throw new Error('DATASET_CONTRACT_INVALID:'+errors.join(','));
      return result;
    }

    hydrateDataset(dataset,domain,options={}){
      const d=String(domain||'').trim();
      if(!d)throw new Error('DATASET_DOMAIN_REQUIRED');
      const contract=this.validateDatasetShape(dataset,{strict:options.strict===true});
      const rows=[];
      if(Array.isArray(dataset)){
        dataset.forEach(row=>{
          const id=this.canonicalCountryId(row?.countryId||row?.countryCode||row?.country_code||row?.iso2||row?.iso3||row?.code||row?.id||row?.name||row?.countryName||row?.country_name);
          if(id)rows.push([id,clone(row),'']);
        });
      }else if(dataset&&typeof dataset==='object'){
        for(const [key,row] of Object.entries(dataset)){
          const id=this.canonicalCountryId(row?.countryId||row?.countryCode||row?.country_code||row?.iso2||row?.iso3||row?.code||row?.id||row?.name||row?.countryName||row?.country_name||key);
          if(id){
            rows.push([id,clone(row),String(key)]);
          }
        }
      }
      const state=this.root();
      if(!state[d]||typeof state[d]!=='object')state[d]={};
      const written=[];
      const aliases=new Map();
      for(const [id,row,sourceKey=''] of rows){
        state[d][id]=row;
        written.push(id);
        const rawKey=String(sourceKey||'').trim();
        if(rawKey&&rawKey!==id)aliases.set(rawKey,id);
      }
      // Non-enumerable compatibility aliases keep legacy UI reads working without
      // duplicating authoritative country records or polluting canonical iteration.
      for(const [alias,id] of aliases){
        try{
          Object.defineProperty(state[d],alias,{
            configurable:true,
            enumerable:false,
            get(){return state[d][id];},
            set(value){state[d][id]=value;}
          });
        }catch(_){}
      }
      return {
        schemaVersion:1,
        domain:d,
        countryCount:written.length,
        countryIds:[...new Set(written)],
        contract,
        authority:'OMEGA_MINISTRY_STATE_PROVIDER'
      };
    }

    countryRecord(countryId){
      const id=normalizeId(countryId);
      if(!id)return null;
      const registry=this.countryRegistry||global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge;
      try{
        const hit=registry?.resolveCountry?.(id);
        if(hit?.id && normalizeId(hit.id)===id)return clone(hit.raw||hit);
      }catch(_){}
      const row=this._identityRows().find(r=>normalizeId(r?.id||r?.code)===id);
      return row?clone(row):null;
    }

    _directPath(countryId,path){
      const state=this.root();
      const rawPath=String(path??'');
      if(!rawPath)return undefined;      const datasetParts=rawPath.split('.');
      const datasetDomain=datasetParts[0];
      const datasetRecord=this._canonicalDatasetRecord(countryId,datasetDomain);
      if(datasetRecord!==null){
        let datasetValue=datasetRecord;
        for(const part of datasetParts.slice(1)){
          if(datasetValue==null||!Object.prototype.hasOwnProperty.call(Object(datasetValue),part)) { datasetValue=undefined; break; }
          datasetValue=datasetValue[part];
        }
        if(datasetValue!==undefined)return datasetValue;
      }

      if(rawPath==='countryRecord'||rawPath==='country.identity')return this.countryRecord(countryId);

      const parts=rawPath.split('.');
      const domain=parts.shift();
      if(!domain)return undefined;
      const section=state?.[domain];

      if(COUNTRY_SCOPED_DOMAINS.has(domain)){
        if(!section||typeof section!=='object'||!countryId)return undefined;
        let countryBucket=section[countryId];
        if(countryBucket===undefined){
          const key=Object.keys(section).find(k=>String(k).toUpperCase()===String(countryId).toUpperCase());
          if(key!==undefined)countryBucket=section[key];
        }
        if(countryBucket===undefined||countryBucket===null)return undefined;
        let cur=countryBucket;
        for(const part of parts){
          if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
          cur=cur[part];
        }
        return cur;
      }

      let cur=state?.[domain];
      if(cur===undefined)return undefined;
      for(const part of parts){
        if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
        cur=cur[part];
      }
      return cur;
    }
    _specialPath(countryId,path){
      if(path==='resourceSummary'){
        const state=this.root();
        const section=state?.resources||state?.resourceSummary||null;
        if(section&&typeof section==='object'&&countryId&&section[countryId]!==undefined)return clone(section[countryId]);
        return section===undefined?undefined:clone(section);
      }
      if(path==='resourceInventory'||path==='resourceDeposits'||path==='resourceEngineState'){
        const engine=global.ResourceMinistryEngine;
        try{
          if(!engine?.getIntegratedResourceState)return undefined;
          const state=engine.getIntegratedResourceState(countryId);
          if(path==='resourceEngineState')return state;
          if(path==='resourceInventory')return state?.inventory;
          if(path==='resourceDeposits')return engine.deposits;
        }catch(_){}
      }
      return undefined;
    }

    get(countryId,path){
      const id=normalizeId(countryId);
      const special=this._specialPath(id,String(path??''));
      if(special!==undefined)return clone(special);
      const value=this._directPath(id,path);
      return value===undefined?undefined:clone(value);
    }

    getSnapshot(countryId,domain){
      const id=normalizeId(countryId);
      const d=String(domain??'').trim();
      if(d==='country'||d==='identity')return this.countryRecord(id);
      const value=this.get(id,d);
      if(value!==undefined)return value;
      return null;
    }

    getRevision(countryId,domain){
      const id=normalizeId(countryId);
      const d=String(domain??'').trim();
      const authority=this.authority();
      if(authority?.revision){
        const revision=authority.revision(id,d);
        if(revision!==null&&revision!==undefined)return String(revision);
      }
      const state=this.root();
      const override=readPath(this.revisionOverrides,[id,d].join('.')) ??
        readPath(state,['stateRevisions',id,d].join('.')) ??
        readPath(state,['revisions',id,d].join('.')) ??
        readPath(state,['domainRevisions',id,d].join('.'));
      if(override!==undefined&&override!==null)return String(override);
      const snapshot=this.getSnapshot(id,d);
      if(snapshot===null||snapshot===undefined)return null;
      return 'CONTENT:'+hash(snapshot);
    }

    getAvailability(countryId,path,options={}){
      const id=normalizeId(countryId);
      const p=String(path??'');
      if(!id||!p)return {status:AVAILABILITY.NOT_APPLICABLE,reason:'INVALID_ID_OR_PATH'};
      const state=this.root();
      let value=this.get(id,p);
      if((p==='country.identity'||p==='countryRecord') && this.countryRecord(id)){
        value=this.countryRecord(id);
      }
      if(value===undefined||value===null){
        const d=topDomain(p);
        const section=state?.[d];
        const hasDomain=section!==undefined&&section!==null;
        return {
          status:hasDomain?AVAILABILITY.UNAVAILABLE:AVAILABILITY.UNOBSERVED,
          reason:hasDomain?'FIELD_NOT_AVAILABLE':'DOMAIN_NOT_OBSERVED'
        };
      }
      if(value && typeof value==='object' && value.status==='INVALID' && Object.prototype.hasOwnProperty.call(value,'value')){
        return {value:null,status:AVAILABILITY.INVALID,reason:'SOURCE_MARKED_INVALID'};
      }
      if(value && typeof value==='object' && value.estimated===true && Object.prototype.hasOwnProperty.call(value,'value')){
        value=clone(value.value);
        return {value,status:AVAILABILITY.ESTIMATED,reason:'SOURCE_MARKED_ESTIMATED'};
      }

      const observedTurn=Number(
        options.sourceTurn ??
        readPath(value,'simulationTurn') ??
        readPath(value,'turn') ??
        this.simulationTurn()
      );
      const currentTurn=Number(options.currentTurn ?? this.simulationTurn());
      const maxAge=Number.isFinite(Number(options.maxAgeTurns))?Number(options.maxAgeTurns):1;
      if(Number.isFinite(observedTurn)&&Number.isFinite(currentTurn)&&currentTurn-observedTurn>maxAge){
        return {value:clone(value),status:AVAILABILITY.STALE,reason:'SOURCE_TURN_TOO_OLD',observedTurn,currentTurn,maxAgeTurns:maxAge};
      }
      return {value:clone(value),status:AVAILABILITY.AVAILABLE,reason:'OBSERVED'};
    }

    getProvenance(countryId,path,options={}){
      const id=normalizeId(countryId);
      const p=String(path??'');
      const availability=this.getAvailability(id,p,options);
      const repositoryIdentity=(p==='country.identity'||p==='countryRecord') && !!this.countryRecord(id);
      return {
        provider:'OmegaMinistryStateProvider',
        countryId:id||null,
        fieldPath:p||null,
        sourceType:repositoryIdentity?'CANONICAL_REPOSITORY_DATA':'AUTHORITATIVE_RUNTIME_STATE',
        source:repositoryIdentity?'countries.json / canonical country registry':(DATASET_DOMAIN_MAP[topDomain(p)]||'AUTHORITATIVE_STATE_AUTHORITY'),
        sourceRevision:this.getRevision(id,topDomain(p)),
        simulationTurn:this.simulationTurn(),
        availability:availability.status,
        reason:availability.reason
      };
    }

    describe(countryId,path,options={}){
      const id=normalizeId(countryId);
      const availability=this.getAvailability(id,path,options);
      const value=availability.value!==undefined?availability.value:this.get(id,path);
      return {
        countryId:id,
        path:String(path??''),
        value:value===undefined?null:value,
        availability:availability.status,
        availabilityReason:availability.reason,
        provenance:this.getProvenance(id,path,options)
      };
    }

    hydrate(countryId,paths=[]){
      const id=normalizeId(countryId);
      const values={};
      for(const path of paths){
        const d=this.describe(id,path);
        values[path]=d;
      }
      return {countryId:id,simulationTurn:this.simulationTurn(),values};
    }

    getInputContract(){
      return clone(DATASET_INPUT_CONTRACT);
    }

    diagnostics(countryId=null,paths=[]){
      const checks=[];
      if(countryId && paths.length){
        for(const path of paths)checks.push(this.describe(countryId,path));
      }
      const counts={};
      for(const row of checks)counts[row.availability]=(counts[row.availability]||0)+1;
      return {
        version:VERSION,
        stateSourceAvailable:!!this.root(),
        canonicalCountryAuthority:!!(this.countryRegistry||global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge),
        simulationTurn:this.simulationTurn(),
        checkedFields:checks.length,
        availabilityCounts:counts
      };
    }
  }

  const api={
    VERSION,
    Availability:AVAILABILITY,
    create:(options={})=>new MinistryStateProvider(options),
    inputContract:clone(DATASET_INPUT_CONTRACT),
    validateDatasetShape:(dataset,options={})=>api.instance.validateDatasetShape(dataset,options),
    hydrateDataset:(dataset,domain,options={})=>api.instance.hydrateDataset(dataset,domain,options),
    instance:new MinistryStateProvider()
  };

  global.Omega=global.Omega||{};
  global.Omega.MinistryStateProvider=api;
  global.OmegaMinistryStateProvider=api;
})(typeof window!=='undefined'?window:globalThis);
