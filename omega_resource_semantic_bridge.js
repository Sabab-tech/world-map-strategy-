/* OMEGA RESOURCE SEMANTIC BRIDGE v3.0.0
 * Resource + Country data integration layer.
 *
 * PURPOSE
 * - Keep resource facts in JSON, never in JavaScript.
 * - Import resource ontology, resource datasets, and countries.json.
 * - Preserve canonical IDs and resolve resource -> country -> location relationships.
 * - Expose query/export APIs to the existing semantic runtime and bridge stack.
 * - Support worldwide resource queries without country-specific hardcoding.
 *
 * ARCHITECTURE
 * LANGUAGE / INTENT -> RESOURCE RESOLUTION -> RESOURCE DATA -> COUNTRY ID
 * -> COUNTRY JSON / GSRSK PROFILE -> LOCATION -> EXISTING BRIDGE -> PRESENTATION
 *
 * No new file is required. This replaces the existing bridge in-place.
 */
(function(g){
  'use strict';

  const VERSION='3.0.0-PRODUCTION';
  if(g.OmegaResourceSemanticBridge?.VERSION===VERSION)return;

  const S=v=>String(v==null?'':v).trim();
  const N=v=>S(v).normalize('NFKC')
    .replace(/[?!,.:;'"(){}\[\]<>]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
  const O=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const A=v=>Array.isArray(v)?v:[];
  const C=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return null;}};

  const state={
    ready:false,
    error:null,
    loadedAt:null,
    ontology:null,
    countriesRaw:null,
    resourcesRaw:[],
    resources:new Map(),
    resourceRecords:[],
    countries:new Map(),
    countryAliases:new Map(),
    resourceAliases:new Map(),
    profiles:new Map(),
    diagnostics:{
      countrySourceCount:0,
      countryProfileCount:0,
      countryIdCount:0,
      expectedCountryIdCount:197,
      resourceTypeCount:0,
      resourceRecordCount:0,
      linkedResourceCountryCount:0,
      unresolvedResourceCountryCount:0,
      exportReady:false
    }
  };

  function addAlias(map,key,id){
    const n=N(key);
    if(n&&!map.has(n))map.set(n,String(id).toUpperCase());
  }

  function canonicalToken(v){
    return S(v)
      .replace(/[^a-z0-9_]+/gi,'_')
      .replace(/^_+|_+$/g,'')
      .toUpperCase();
  }

  function first(v,keys=[]){
    if(!O(v))return null;
    for(const k of keys){
      const x=v[k];
      if(x!==undefined&&x!==null&&S(x)!=='')return x;
    }
    return null;
  }

  function resourceRoot(raw){
    if(!O(raw))return {};
    return raw?.COMMODITY_ONTOLOGIES
      ||raw?.resource_types
      ||raw?.resources
      ||raw?.resourceDatabase
      ||raw?.RESOURCE_DATABASE
      ||raw?.GSRSK_Master_Resource_Data_v14?.resource_types
      ||{};
  }

  function profileRoot(raw){
    if(Array.isArray(raw))return raw;
    return raw?.GSRSK_Master_CountryProfiles_v14?.countryProfiles
      ||raw?.countryProfiles
      ||raw?.countries
      ||raw?.data
      ||{};
  }

  function countryRows(raw){
    if(Array.isArray(raw))return raw;
    if(Array.isArray(raw?.countries))return raw.countries;
    if(Array.isArray(raw?.data))return raw.data;
    if(O(raw))return Object.entries(raw).map(([key,val])=>O(val)?({...val,__sourceKey:key}):({id:key,name:val,__sourceKey:key}));
    return [];
  }

  function countryIdentity(raw,fallbackKey=''){
    const i=O(raw?.identity)?raw.identity:raw;
    const iso2=S(first(i,['iso2','countryCode','code'])).toUpperCase();
    const iso3=S(first(i,['iso3','countryId','canonicalId','id'])).toUpperCase();
    const name=S(first(i,['name','officialName','countryName','shortName','displayName']))||S(raw?.name)||S(fallbackKey);
    const canonical=iso3||iso2||canonicalToken(name);
    return {iso2,iso3,name,id:canonical};
  }

  function registerCountry(raw,fallbackKey='',source='countries.json'){
    if(!O(raw))return null;
    const identity=countryIdentity(raw,fallbackKey);
    if(!identity.id)return null;

    const id=identity.id.toUpperCase();
    const existing=state.countries.get(id);
    const profile=O(raw?.identity)?raw:C(raw);
    const merged={
      id,
      iso2:identity.iso2||(existing?.iso2||''),
      iso3:identity.iso3||(existing?.iso3||''),
      name:identity.name||(existing?.name||''),
      mapData:source==='countries.json'?C(raw):(existing?.mapData||null),
      profile:source!=='countries.json'?C(profile):(existing?.profile||null),
      sources:[...new Set([...(existing?.sources||[]),source])]
    };

    state.countries.set(id,merged);
    for(const x of [id,identity.iso2,identity.iso3,identity.name,first(raw,['officialName','countryName','shortName'])].filter(Boolean))addAlias(state.countryAliases,x,id);
    return merged;
  }

  function ingestCountriesJson(raw){
    state.countriesRaw=C(raw);
    const rows=countryRows(raw);
    for(const row of rows)registerCountry(row,'','countries.json');
    state.diagnostics.countrySourceCount=rows.length;
  }

  function ingestProfiles(raw){
    const root=profileRoot(raw);
    const entries=Array.isArray(root)
      ?root.map((x,i)=>[x?.identity?.iso3||x?.identity?.iso2||x?.id||String(i+1),x])
      :Object.entries(root||{});

    for(const [key,p] of entries){
      if(!O(p))continue;
      const c=registerCountry(p,key,'GSRSK_Master_CountryProfiles');
      if(!c)continue;
      const countryId=c.id;
      state.profiles.set(countryId,C(p));
    }
    state.diagnostics.countryProfileCount=state.profiles.size;
  }

  function ingestOntology(raw){
    state.ontology=C(raw);
    const root=resourceRoot(raw);
    for(const [key,val] of Object.entries(root||{})){
      const id=canonicalToken(first(val,['id','key','resource_id'])||key);
      if(!id)continue;
      const names=[];
      if(O(val)){
        for(const k of ['name','resourceName','canonicalName','displayName','label','name_en','name_bn']){
          if(typeof val[k]==='string'&&val[k].trim())names.push(val[k]);
        }
      }
      names.push(key,id);
      const old=state.resources.get(id);
      const entry={
        id,
        names:[...new Set([...(old?.names||[]),...names])],
        raw:O(val)?C(val):{id:key,name:val}
      };
      state.resources.set(id,entry);
      for(const name of entry.names){
        addAlias(state.resourceAliases,name,id);
        addAlias(state.resourceAliases,String(name).replace(/_/g,' '),id);
      }
    }
    state.diagnostics.resourceTypeCount=state.resources.size;
  }

  function ingestResourceDataset(raw,source){
    if(!O(raw)&&!Array.isArray(raw))return;
    state.resourcesRaw.push({source,raw:C(raw)});

    const roots=[];
    for(const k of ['resources','resourceDatabase','RESOURCE_DATABASE','resource_types'])if(raw?.[k]!=null)roots.push([k,raw[k]]);
    if(raw?.GSRSK_Master_Resource_Data_v14?.resource_types)roots.push(['GSRSK_Master_Resource_Data_v14',raw.GSRSK_Master_Resource_Data_v14.resource_types]);
    if(!roots.length)roots.push(['root',raw]);

    const addRecord=(value,key,path)=>{
      if(value==null)return;
      const id=canonicalToken(first(value,['resourceInstanceId','instanceId','depositId','mineId','resource_id','resourceId','id'])||key||`${source}_${state.resourceRecords.length+1}`);
      const resourceTypeId=canonicalToken(first(value,['resourceTypeId','resource_type_id','resourceType','resource','commodityId','commodity'])||'');
      const countryIdRaw=first(value,['countryId','countryID','country_id','countryCode','iso3','iso2']);
      const countryResolved=resolveCountry(countryIdRaw);
      state.resourceRecords.push({
        id,
        resourceTypeId:resourceTypeId||null,
        countryId:countryResolved.id||S(countryIdRaw).toUpperCase()||null,
        source,
        path:path.join('.'),
        raw:C(value)
      });
    };

    for(const [rootKey,root] of roots){
      if(Array.isArray(root)){root.forEach((x,i)=>{if(O(x))addRecord(x,String(i),[rootKey,String(i)]);});continue;}
      if(O(root)){
        for(const [key,val] of Object.entries(root)){
          if(O(val))addRecord(val,key,[rootKey,key]);
        }
      }
    }

    state.diagnostics.resourceRecordCount=state.resourceRecords.length;
  }

  function resolveCountry(q){
    const x=N(q);
    if(!x)return{id:null,type:'COUNTRY',confidence:0,source:'UNRESOLVED'};
    const direct=state.countryAliases.get(x);
    if(direct){
      const c=state.countries.get(direct);
      return {id:direct,type:'COUNTRY',confidence:1,source:c?.sources?.join('+')||'COUNTRY_DATA',surface:x,raw:C(c)};
    }
    const compact=canonicalToken(q);
    const directToken=state.countries.get(compact);
    if(directToken)return{id:directToken.id,type:'COUNTRY',confidence:1,source:'COUNTRY_DATA',surface:x,raw:C(directToken)};

    let best=null;
    for(const c of state.countries.values()){
      for(const alias of [c.id,c.iso2,c.iso3,c.name].filter(Boolean)){
        const a=N(alias);
        if(a&&x.includes(a)){
          const score=Math.min(.98,.70+a.length/Math.max(100,x.length*2));
          if(!best||score>best.confidence)best={id:c.id,type:'COUNTRY',confidence:score,source:c.sources?.join('+')||'COUNTRY_DATA',surface:a,raw:C(c)};
        }
      }
    }
    return best||{id:null,type:'COUNTRY',confidence:0,source:'UNRESOLVED'};
  }

  function resourceNames(id){
    const r=state.resources.get(String(id).toUpperCase());
    return [...new Set([String(id),...(r?.names||[])].map(N).filter(Boolean))];
  }

  function resolveResource(q){
    const x=N(q);
    if(!x)return{id:null,type:'RESOURCE',confidence:0,source:'UNRESOLVED'};
    const direct=state.resourceAliases.get(x);
    if(direct&&state.resources.has(direct)){
      const r=state.resources.get(direct);
      return{id:r.id,type:'RESOURCE',confidence:1,source:'resource_ontology.json',surface:x,raw:C(r.raw)};
    }
    const compact=canonicalToken(q);
    if(state.resources.has(compact)){
      const r=state.resources.get(compact);
      return{id:r.id,type:'RESOURCE',confidence:1,source:'resource_ontology.json',surface:x,raw:C(r.raw)};
    }

    let best=null;
    for(const [id,r] of state.resources){
      for(const alias of r.names||[]){
        const a=N(alias);
        if(a&&x.includes(a)){
          const score=Math.min(.98,.70+a.length/Math.max(100,x.length*2));
          if(!best||score>best.confidence)best={id,type:'RESOURCE',confidence:score,source:'resource_ontology.json',surface:a,raw:C(r.raw)};
        }
      }
    }
    return best||{id:null,type:'RESOURCE',confidence:0,source:'UNRESOLVED'};
  }

  function containsResource(value,aliases){
    const text=N(typeof value==='string'?value:JSON.stringify(value));
    return aliases.some(a=>a&&text.includes(a));
  }

  const LOCATION_KEY=/(location|region|province|district|city|site|field|basin|deposit|address|area|zone|corridor|hub|mine|plant|facility|reservoir|coordinates|latitude|longitude|lat|lng|lon)/i;
  const IDENTIFIER_KEY=/(countryid|country_id|countrycode|iso2|iso3|resourceid|resource_id|resourcetypeid|mineid|depositid|instanceid|operatorid|ownerid)/i;

  function collectLocations(profile,resourceId){
    if(!O(profile))return[];
    const aliases=resourceNames(resourceId),out=[],seen=new Set();
    const push=(field,value,path,kind='location')=>{
      if(value==null||value==='')return;
      const key=`${path.join('.')}|${field}|${String(value)}`;
      if(seen.has(key))return;
      seen.add(key);
      out.push({field,value,path:path.join('.'),kind});
    };
    const walk=(value,path,linked=false)=>{
      if(Array.isArray(value)){value.forEach((x,i)=>walk(x,path.concat(String(i)),linked||containsResource(x,aliases)));return;}
      if(!O(value))return;
      for(const [k,v] of Object.entries(value)){
        const cp=path.concat(k);
        const local=linked||containsResource(k,aliases)||containsResource(v,aliases);
        if(typeof v==='string'){
          if(local&&LOCATION_KEY.test(k)&&!IDENTIFIER_KEY.test(k))push(k,v,cp,'location');
        }else if(O(v)||Array.isArray(v))walk(v,cp,local);
      }
    };
    walk(profile,[]);
    return out.slice(0,500);
  }

  function extractCountryIdFromValue(value){
    if(!O(value))return null;
    for(const k of ['countryId','countryID','country_id','countryCode','iso3','iso2']){
      const v=value[k];
      if(v!=null&&S(v)!==''){
        const r=resolveCountry(v);
        if(r.id)return r.id;
      }
    }
    const i=value.identity;
    if(O(i)){
      const r=resolveCountry(first(i,['countryId','iso3','iso2','code']));
      if(r.id)return r.id;
    }
    return null;
  }

  function queryResource({resourceId,countryId=null,operation='LOCATE',worldwide=false}={}){
    const rid=resolveResource(resourceId).id||canonicalToken(resourceId);
    if(!rid)return{ok:false,reason:'RESOURCE_UNRESOLVED'};
    const resolvedCountry=countryId?resolveCountry(countryId):{id:null};
    const cid=resolvedCountry.id;
    const matches=[];

    for(const record of state.resourceRecords){
      const typeMatch=!record.resourceTypeId||record.resourceTypeId===rid||resourceNames(rid).some(a=>a&&N(JSON.stringify(record.raw)).includes(a));
      if(!typeMatch)continue;
      if(cid&&record.countryId!==cid)continue;
      matches.push({
        kind:'RESOURCE_RECORD',
        id:record.id,
        resourceId:rid,
        countryId:record.countryId||null,
        country:record.countryId?C(state.countries.get(record.countryId)):null,
        locations:collectLocations(record.raw,rid),
        path:record.path,
        source:record.source,
        raw:C(record.raw)
      });
    }

    const profileEntries=cid
      ?[[cid,state.profiles.get(cid)]]
      :[...state.profiles.entries()];

    for(const [pcid,profile] of profileEntries){
      if(!profile)continue;
      const locations=collectLocations(profile,rid);
      const resourceMention=containsResource(profile,rid?resourceNames(rid):[]);
      if(locations.length||resourceMention){
        matches.push({
          kind:'COUNTRY_PROFILE',
          id:pcid,
          resourceId:rid,
          countryId:pcid,
          country:C(state.countries.get(pcid)),
          locations,
          path:'GSRSK_Master_CountryProfiles_v14.countryProfiles',
          source:'GSRSK_Master_CountryProfiles',
          raw:C(profile)
        });
      }
    }

    const linked=new Set(matches.filter(x=>x.countryId).map(x=>x.countryId));
    state.diagnostics.linkedResourceCountryCount=linked.size;
    state.diagnostics.unresolvedResourceCountryCount=matches.filter(x=>!x.countryId).length;

    if(operation==='COUNT'){
      return {ok:true,operation:'COUNT',resourceId:rid,countryId:cid,count:matches.length,countryIds:[...linked],source:'OMEGA_RESOURCE_DATA_EXPORT'};
    }

    if(operation==='LOCATE'){
      return {
        ok:true,
        operation:'LOCATE',
        resourceId:rid,
        countryId:cid,
        worldwide:!!worldwide,
        count:matches.length,
        countries:[...linked].map(id=>({countryId:id,country:C(state.countries.get(id))})),
        locations:matches.flatMap(x=>x.locations.map(location=>({
          ...location,
          entityId:x.id,
          entityKind:x.kind,
          resourceId:rid,
          countryId:x.countryId||null,
          country:C(x.countryId?state.countries.get(x.countryId):null),
          source:x.source,
          evidencePath:x.path
        }))),
        records:matches.map(x=>({id:x.id,kind:x.kind,resourceId:x.resourceId,countryId:x.countryId,source:x.source,path:x.path})) ,
        source:'OMEGA_RESOURCE_DATA_EXPORT'
      };
    }

    return {
      ok:true,
      operation,
      resourceId:rid,
      countryId:cid,
      count:matches.length,
      records:matches.map(x=>({id:x.id,kind:x.kind,resourceId:x.resourceId,countryId:x.countryId,source:x.source,path:x.path})) ,
      source:'OMEGA_RESOURCE_DATA_EXPORT'
    };
  }

  function parseWithBridge(prompt,ctx){
    const base=g.OmegaProductionSemanticRuntime;
    if(!base?.parse)return null;
    const parsed=base.__omegaResourceBridgeOriginalParse
      ?base.__omegaResourceBridgeOriginalParse(prompt,ctx)
      :base.parse(prompt,ctx);
    if(!parsed||typeof parsed!=='object')return parsed;

    const cr=resolveCountry(prompt);
    const rr=resolveResource(prompt);
    const entities={...(parsed.entities||{})};
    if(cr.id)entities.country=cr;
    if(rr.id)entities.resource=rr;

    const target=cr.id&&rr.id?'COUNTRY_RESOURCE':rr.id?'RESOURCE':cr.id?'COUNTRY':parsed.targetDomain||'GENERAL';
    const operation=String(parsed.operation||'').toUpperCase();
    const unresolved=(parsed.unresolved||[]).filter(x=>x!=='COUNTRY'&&x!=='RESOURCE');

    return {
      ...parsed,
      entities,
      targetDomain:target,
      operation,
      unresolved,
      executable:unresolved.length===0&&operation!=='UNKNOWN'
    };
  }

  function executeResource(parsed){
    const rid=parsed?.entities?.resource?.id;
    if(!rid)return null;
    const cid=parsed?.entities?.country?.id||null;
    const op=parsed.operation;
    if(op!=='LOCATE'&&op!=='COUNT'&&op!=='QUANTITY'&&op!=='IDENTIFY')return null;

    if(op==='QUANTITY')return null;
    if(op==='IDENTIFY'){
      const r=state.resources.get(String(rid).toUpperCase());
      return {ok:true,operation:'IDENTIFY',resourceId:rid,value:C(r?.raw),source:'resource_ontology.json'};
    }
    return queryResource({resourceId:rid,countryId:cid,operation:op,worldwide:!cid});
  }

  function diagnostics(){
    state.diagnostics.countryIdCount=state.countries.size;
    state.diagnostics.resourceTypeCount=state.resources.size;
    state.diagnostics.resourceRecordCount=state.resourceRecords.length;
    state.diagnostics.exportReady=state.ready&&state.diagnostics.countryIdCount>0;
    return {
      version:VERSION,
      ready:state.ready,
      loadedAt:state.loadedAt,
      countries:state.countries.size,
      countryProfiles:state.profiles.size,
      resources:state.resources.size,
      resourceRecords:state.resourceRecords.length,
      aliases:{countries:state.countryAliases.size,resources:state.resourceAliases.size},
      expectedCountryIds:state.diagnostics.expectedCountryIdCount,
      countryIdCoverage:`${state.countries.size}/${state.diagnostics.expectedCountryIdCount}`,
      countryIdCoverageComplete:state.countries.size>=state.diagnostics.expectedCountryIdCount,
      linkedResourceCountries:state.diagnostics.linkedResourceCountryCount,
      unresolvedResourceCountries:state.diagnostics.unresolvedResourceCountryCount,
      exportReady:state.diagnostics.exportReady,
      error:state.error
    };
  }

  function exportData({resourceId=null,countryId=null,operation='LOCATE'}={}){
    if(resourceId)return queryResource({resourceId,countryId,operation,worldwide:!countryId});
    return {
      ok:true,
      countries:[...state.countries.values()].map(C),
      resources:[...state.resources.values()].map(C),
      resourceRecords:state.resourceRecords.map(C),
      source:'OMEGA_RESOURCE_DATA_EXPORT'
    };
  }

  function install(){
    const base=g.OmegaProductionSemanticRuntime;
    if(!base||typeof base.parse!=='function'||typeof base.buildAnswerPlan!=='function')return false;

    if(!base.__omegaResourceBridgeV300){
      base.__omegaResourceBridgeOriginalParse=base.parse;
      base.__omegaResourceBridgeOriginalBuildAnswerPlan=base.buildAnswerPlan;

      base.parse=(prompt,ctx={})=>parseWithBridge(prompt,ctx);
      base.explain=(prompt,ctx={})=>{
        const p=base.parse(prompt,ctx);
        return {
          language:p?.language,
          question:p?.question,
          attribute:p?.attribute,
          assetClass:p?.assetClass,
          targetDomain:p?.targetDomain,
          operation:p?.operation,
          entities:p?.entities,
          unresolved:p?.unresolved,
          confidence:p?.confidence,
          executable:p?.executable
        };
      };

      base.buildAnswerPlan=(prompt,input={},world={},history=[])=>{
        const p=parseWithBridge(prompt,{...input,worldState:world});
        const original=base.__omegaResourceBridgeOriginalBuildAnswerPlan(prompt,input,world,history);
        const override=executeResource(p);
        if(override){
          return {
            ...original,
            version:VERSION,
            language:p.language,
            question:p.question,
            intent:p.targetDomain,
            operation:p.operation,
            entities:p.entities,
            semantic:p,
            result:override
          };
        }
        return {
          ...original,
          semantic:p,
          entities:p.entities,
          intent:p.targetDomain,
          operation:p.operation
        };
      };

      base.__omegaResourceBridgeV300=true;
    }

    const prev=g.OmegaAIIntegrity||{};
    g.OmegaAIIntegrity={...prev,VERSION:'6.0.0-RESOURCE-COUNTRY-GROUNDED',parse:base.parse};
    return true;
  }

  async function loadJson(path,optional=false){
    try{
      if(typeof process!=='undefined'&&process.versions?.node){
        const fs=await import('node:fs/promises');
        const cwd=typeof process.cwd==='function'?process.cwd():'.';
        return JSON.parse(await fs.readFile(`${cwd}/${path}`,'utf8'));
      }
      const r=await fetch(path,{cache:'no-store'});
      if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
      return await r.json();
    }catch(e){
      if(optional)return null;
      throw e;
    }
  }

  async function init(){
    try{
      const [ontology,countries,r1,r2]=await Promise.all([
        loadJson('resource_ontology.json'),
        loadJson('countries.json'),
        loadJson('resources.json'),
        loadJson('resources_2.json',true)
      ]);

      ingestCountriesJson(countries);
      ingestProfiles(r1);
      if(r2)ingestProfiles(r2);
      ingestOntology(ontology);
      ingestResourceDataset(r1,'resources.json');
      if(r2)ingestResourceDataset(r2,'resources_2.json');

      state.ready=true;
      state.loadedAt=Date.now();
      state.error=null;
      const diag=diagnostics();
      try{g.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_SEMANTIC_READY',{detail:diag}));}catch(_){}
      return diag;
    }catch(e){
      state.ready=false;
      state.error=e?.message||String(e);
      console.error('[OMEGA Resource Semantic Bridge]',state.error);
      return diagnostics();
    }
  }

  g.OmegaResourceSemanticBridge={
    VERSION,
    init,
    install,
    diagnostics,
    resolveCountry,
    resolveResource,
    queryResource,
    exportData,
    collectLocations,
    executeResource,
    ontology:()=>C(state.ontology)
  };

  const boot=setInterval(()=>{if(install()&&state.ready)clearInterval(boot);},50);
  setTimeout(()=>clearInterval(boot),15000);
  init();
})(typeof globalThis!=='undefined'?globalThis:window);
