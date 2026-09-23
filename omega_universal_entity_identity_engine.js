
/* OMEGA UNIVERSAL ENTITY IDENTITY ENGINE v1.0.0
 * One shared identity, selector, schema-discovery and record-link layer.
 * Unknown country identities never become synthetic canonical IDs.
 */
(function(g){
  'use strict';
  if(g.OmegaUniversalEntityIdentityEngine && g.OmegaUniversalEntityIdentityEngine.VERSION==='1.0.0') return;

  const VERSION='1.0.0';
  const S=v=>String(v==null?'':v).trim();
  const U=v=>S(v).toUpperCase();
  const N=v=>S(v).normalize('NFKC').replace(/[?!,.:;'"“”‘’(){}[\]<>\u2014\u2013/\\]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  const O=v=>v!==null&&typeof v==='object';
  const A=v=>Array.isArray(v)?v:[];
  const C=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object') return v;
    if(seen.has(v)) return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(C(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const [k,x] of Object.entries(v)) if(k!=='__proto__'&&k!=='constructor'&&typeof x!=='function') o[k]=C(x,seen);
    return o;
  };

  const ID_KEY=/^(id|key|code|canonicalid|canonical_id|iso2|iso3|isocode|countryid|country_id|countrycode|country_code|nationid|nation_id|nationcode|nation_code|resourceid|resource_id|resourcetypeid|resource_type_id|mineid|mine_id|depositid|deposit_id|instanceid|instance_id|actorid|actor_id|organizationid|organization_id|companyid|company_id|institutionid|institution_id)$/i;
  const COUNTRY_KEY=/(^|[_\.])(country|nation)([_\.]|$)|^(iso2|iso3|countrycode|country_code|countryid|country_id)$/i;
  const NAME_KEY=/^(name|countryname|country_name|nationname|nation_name|officialname|official_name|displayname|display_name|label|title|canonicalname|canonical_name)$/i;

  const state={
    entities:new Map(),
    aliases:new Map(),
    records:new Map(),
    datasets:new Map()
  };

  function mapFor(root,key){ let m=root.get(key); if(!m){m=new Map();root.set(key,m);} return m; }

  function addAlias(type,surface,id){
    const t=U(type), n=N(surface), canonical=U(id);
    if(!t||!n||!canonical)return;
    const m=mapFor(state.aliases,t), set=m.get(n)||new Set();
    set.add(canonical); m.set(n,set);
  }

  function addEntity(type,id,surfaces,raw,source,authority){
    const t=U(type), canonical=U(id);
    if(!t||!canonical)return null;
    const m=mapFor(state.entities,t);
    const old=m.get(canonical)||{id:canonical,type:t,surfaces:[],raw:null,sources:[],authority:'LOCAL'};
    const next={
      id:canonical,type:t,
      surfaces:[...new Set([...(old.surfaces||[]),...A(surfaces).map(S).filter(Boolean)])],
      raw:old.raw==null?C(raw):old.raw,
      sources:[...new Set([...(old.sources||[]),source].filter(Boolean))],
      authority:old.authority==='CANONICAL'?'CANONICAL':(authority||old.authority||'LOCAL')
    };
    m.set(canonical,next);
    for(const x of next.surfaces)addAlias(t,x,canonical);
    addAlias(t,canonical,canonical);
    return C(next);
  }

  function registerCanonical(type,id,raw=null,surfaces=[]){
    return addEntity(type,id,surfaces,raw,'CANONICAL_REGISTRY','CANONICAL');
  }

  function canonicalRegistry(type){
    if(U(type)==='COUNTRY') return g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||null;
    if(U(type)==='RESOURCE') return g.OmegaResourceSemanticBridge||null;
    return null;
  }

  function canonicalResolve(surface,type){
    const t=U(type), q=S(surface), r=canonicalRegistry(t);
    if(!q)return null;
    const local=state.aliases.get(t);
    const localIds=local&&local.get(N(q));
    if(localIds&&localIds.size===1){const id=[...localIds][0],entity=state.entities.get(t)&&state.entities.get(t).get(id);if(entity&&entity.authority==='CANONICAL')return{status:'RESOLVED',id,type:t,surface:q,raw:C(entity.raw),source:'UNIVERSAL_CANONICAL_REGISTRY',authority:'CANONICAL'};}
    if(!r)return null;
    try{
      const fn=t==='COUNTRY'?r.resolveCountry:(t==='RESOURCE'?r.resolveResource:null);
      if(typeof fn!=='function')return null;
      const hit=fn.call(r,q);
      if(!hit||!hit.id)return null;
      const id=U(hit.id);
      addEntity(t,id,[q,hit.surface,hit.name,hit.raw&&hit.raw.name,hit.raw&&hit.raw.officialName].concat(A(hit.names),A(hit.raw&&hit.raw.names),A(hit.raw&&hit.raw.aliases)),hit.raw||hit,'CANONICAL_REGISTRY','CANONICAL');
      return Object.assign({},C(hit),{id:id,type:t,authority:'CANONICAL_REGISTRY'});
    }catch(_){return null;}
  }

  function sampleObjects(raw,max=96){
    const out=[];
    const visit=(v,path,depth)=>{
      if(out.length>=max||depth>8||!O(v))return;
      if(Array.isArray(v)){for(let i=0;i<v.length&&out.length<max;i++)if(O(v[i]))visit(v[i],path+'['+i+']',depth+1);return;}
      out.push({value:v,path});
      for(const [k,x] of Object.entries(v))if(O(x))visit(x,path?(path+'.'+k):k,depth+1);
    };
    if(Array.isArray(raw)){for(let i=0;i<raw.length&&out.length<max;i++)if(O(raw[i]))visit(raw[i],'['+i+']',0);}
    else if(O(raw))for(const [k,x] of Object.entries(raw))if(O(x))visit(x,k,0);
    return out;
  }

  function scalarFields(v,path='',out=[],depth=0){
    if(depth>24||v==null||!O(v))return out;
    if(Array.isArray(v)){for(let i=0;i<v.length;i++)scalarFields(v[i],path+'['+i+']',out,depth+1);return out;}
    for(const [k,x] of Object.entries(v)){
      const p=path?(path+'.'+k):k;
      if(x===null||['string','number','boolean'].includes(typeof x))out.push({key:k,path:p,value:x});
      else if(O(x))scalarFields(x,p,out,depth+1);
    }
    return out;
  }

  function inferEntityTypes(dataset,raw,explicit){
    const types=new Set(A(explicit).map(U).filter(Boolean));
    if(/country|nation/i.test(String(dataset||'')))types.add('COUNTRY');
    if(/resource|commodity/i.test(String(dataset||'')))types.add('RESOURCE');
    const hints=[
      [/mine/i,'MINE'],[/deposit/i,'DEPOSIT'],[/field/i,'OIL_FIELD'],
      [/facility|plant/i,'FACILITY'],[/company/i,'COMPANY'],[/organization/i,'ORGANIZATION'],
      [/institution/i,'INSTITUTION'],[/city/i,'CITY'],[/project/i,'PROJECT']
    ];
    for(const s of sampleObjects(raw,96))for(const f of scalarFields(s.value)){
      if(COUNTRY_KEY.test(f.key))types.add('COUNTRY');
      for(const h of hints)if(h[0].test(f.key))types.add(h[1]);
      if(canonicalResolve(f.value,'COUNTRY'))types.add('COUNTRY');
    }
    return [...types];
  }

  function inferIdentityFields(raw,explicit){
    const set=new Set(A(explicit).map(S).filter(Boolean));
    for(const s of sampleObjects(raw,96))for(const f of scalarFields(s.value)){
      if(ID_KEY.test(f.key)||COUNTRY_KEY.test(f.key)||NAME_KEY.test(f.key))set.add(f.key);
    }
    return [...set];
  }

  function inferFieldCandidates(raw){
    const out=new Map();
    const put=(cap,f)=>{const k=U(cap),list=out.get(k)||[];if(!list.some(x=>x.path===f.path))list.push({path:f.path,key:f.key,source:'OBSERVED_FIELD_NAME'});out.set(k,list);};
    const rules=[
      ['POPULATION',/(^|_)population(_|$)/],
      ['GDP',/(^|_)gdp($|_)/],
      ['GDP_GROWTH',/(^|_)gdp_growth($|_)/],
      ['INFLATION',/(^|_)inflation($|_)/],
      ['UNEMPLOYMENT',/(^|_)unemployment($|_)/],
      ['PRODUCTION',/(^|_)production($|_)/],
      ['OUTPUT',/(^|_)output($|_)/],
      ['CAPACITY',/(^|_)(capacity|available_capacity|installed_capacity)($|_)/],
      ['DEMAND',/(^|_)(demand|required|requirement)($|_)/],
      ['SUPPLY',/(^|_)(supply|available|inventory|stock)($|_)/],
      ['RESERVE',/(^|_)reserves?($|_)/],
      ['PRICE',/(^|_)price($|_)/],
      ['LOCATION',/(^|_)(location|region|province|district|city|site|field|basin|address|area|zone|coordinates|latitude|longitude|lat|lng|lon)($|_)/]
    ];
    for(const f of scalarFields(raw,'')){
      const n=N(f.key).replace(/[ -]+/g,'_');
      for(const r of rules)if(r[1].test(n))put(r[0],f);
    }
    return Object.fromEntries([...out.entries()]);
  }

  function discoverSchema(dataset,raw,metadata){
    const m=O(metadata)?metadata:{};
    const fields=[...new Map(scalarFields(raw,'').map(f=>[f.path,{path:f.path,key:f.key,type:f.value===null?'null':typeof f.value}])).values()];
    const identityFields=inferIdentityFields(raw,m.identityFields);
    const entityTypes=inferEntityTypes(dataset,raw,m.entityTypes);
    const relationFields=fields.filter(f=>/(country|nation|resource|facility|project|supplier|operator|owner|target|parent|actor|organization|company|institution)(_|\.|\[|$)/i.test(f.path)||/(_id|id)$/i.test(f.key)).map(f=>f.path);
    return{
      dataset:String(dataset),
      authority:Object.keys(m).length?'EXPLICIT_METADATA':'HEURISTIC_SCHEMA_DISCOVERY',
      entityTypes,
      identityFields,
      relationFields:[...new Set(relationFields)],
      fields:fields.slice(0,4000),
      fieldCandidates:inferFieldCandidates(raw),
      recordLocator:m.recordLocator||null,
      recordKeyIsIdentity:m.recordKeyIsIdentity===true
    };
  }

  function candidateIds(record,keyHint,schema){
    const out=[], types=schema.entityTypes.length?schema.entityTypes:['UNKNOWN'], fields=scalarFields(record,'');
    const push=(type,id,source,path,surfaces)=>out.push({type:U(type),id:U(id),source,fieldPath:path||null,surfaces:[...new Set([S(id)].concat(A(surfaces).map(S).filter(Boolean)))]});
    for(const f of fields){
      const keyMatch=schema.identityFields.some(x=>N(x)===N(f.key)||N(x)===N(f.path));
      const likely=keyMatch||ID_KEY.test(f.key)||COUNTRY_KEY.test(f.key)||NAME_KEY.test(f.key);
      if(!likely)continue;
      for(const type of types){
        const t=U(type);
        if(t==='COUNTRY'){
          const hit=canonicalResolve(f.value,'COUNTRY');
          if(hit&&hit.id){push(t,hit.id,'CANONICAL_COUNTRY_RESOLUTION',f.path,[f.value,hit.surface]);continue;}
          continue;
        }
        if(t==='RESOURCE'){
          const hit=canonicalResolve(f.value,'RESOURCE');
          if(hit&&hit.id){push(t,hit.id,'CANONICAL_RESOURCE_RESOLUTION',f.path,[f.value,hit.surface]);continue;}
        }
        if(S(f.value))push(t,f.value,'DATASET_IDENTITY_FIELD',f.path);
      }
    }
    if(S(keyHint)){
      for(const type of types){
        const t=U(type);
        if(t==='COUNTRY'){
          const hit=canonicalResolve(keyHint,'COUNTRY');
          if(hit&&hit.id)push(t,hit.id,'CANONICAL_COUNTRY_RECORD_KEY',null,[keyHint,hit.surface]);
        }else if(schema.recordKeyIsIdentity===true||ID_KEY.test(keyHint)){
          push(t,keyHint,'DATASET_RECORD_KEY',null,[keyHint]);
        }
      }
    }
    return out;
  }

  function ingestDataset(dataset,raw,options={}){
    const name=S(dataset); if(!name)return null;
    const schema=discoverSchema(name,raw,options.metadata||options);
    state.datasets.set(name,{schema,recordCount:0});
    const visitRecord=(value,locator,keyHint,parent)=>{
      if(!O(value))return;
      const signature=name+'::'+locator;
      const ids=candidateIds(value,keyHint,schema);
      const rec={dataset:name,locator,key:keyHint==null?null:S(keyHint),parent:parent||null,identities:[],value:C(value)};
      for(const id of ids){
        const entity=addEntity(id.type,id.id,id.surfaces,value,name,id.source.indexOf('CANONICAL_')===0?'CANONICAL':'LOCAL');
        rec.identities.push(Object.assign({},id,{entityId:entity&&entity.id||id.id}));
      }
      state.records.set(signature,rec);
      state.datasets.get(name).recordCount+=1;
      for(const [k,x] of Object.entries(value)){
        if(O(x))visitRecord(x,locator+'.'+k,k,signature);
        else if(Array.isArray(x))for(let i=0;i<x.length;i++)if(O(x[i]))visitRecord(x[i],locator+'.'+k+'['+i+']',String(i),signature);
      }
    };
    if(Array.isArray(raw))raw.forEach((x,i)=>{if(O(x))visitRecord(x,'['+i+']',String(i),null);});
    else if(O(raw)){for(const [k,x] of Object.entries(raw))if(O(x))visitRecord(x,k,k,null);if(!state.records.size)visitRecord(raw,'root','root',null);}
    return C({dataset:name,schema,recordCount:state.datasets.get(name).recordCount});
  }

  function resolve(surface,type=null){
    const q=S(surface),t=U(type); if(!q)return{status:'IDENTITY_NOT_FOUND',id:null,type:t||null,candidates:[]};
    if(t){const c=canonicalResolve(q,t);if(c&&c.id)return{status:'RESOLVED',...c,id:U(c.id),type:t};}
    else{
      for(const x of ['COUNTRY','RESOURCE']){const c=canonicalResolve(q,x);if(c&&c.id)return{status:'RESOLVED',...c,id:U(c.id),type:x};}
    }
    const types=t?[t]:[...state.entities.keys()],hits=[];
    for(const x of types){
      const m=state.aliases.get(x)||new Map(), exact=m.get(N(q));
      if(exact)for(const id of exact)hits.push({id,type:x,confidence:1,surface:q,source:'UNIVERSAL_ENTITY_INDEX'});
      else for(const [alias,ids] of m.entries()){
        if(alias.length<2)continue;
        const boundary=(' '+q+' ').indexOf(' '+alias+' ')>=0||q.indexOf(alias+' ')===0||q.lastIndexOf(' '+alias)===q.length-alias.length-1;
        if(boundary)for(const id of ids)hits.push({id,type:x,confidence:Math.min(.99,.72+alias.length/Math.max(100,q.length*2)),surface:alias,source:'UNIVERSAL_ENTITY_ALIAS'});
      }
    }
    hits.sort((a,b)=>b.confidence-a.confidence||String(b.surface).length-String(a.surface).length||String(a.id).localeCompare(String(b.id)));
    if(!hits.length)return{status:'IDENTITY_NOT_FOUND',id:null,type:t||null,confidence:0,candidates:[]};
    const best=hits[0],same=hits.filter(x=>x.type===best.type&&x.surface===best.surface),ids=[...new Set(same.map(x=>x.id))];
    if(ids.length>1)return{status:'AMBIGUOUS_IDENTITY',id:null,type:best.type,confidence:best.confidence,surface:best.surface,candidates:same};
    const entity=state.entities.get(best.type)&&state.entities.get(best.type).get(best.id);
    return{status:'RESOLVED',id:best.id,type:best.type,confidence:best.confidence,surface:best.surface,raw:C(entity&&entity.raw||null),authority:entity&&entity.authority||'LOCAL'};
  }

  function select(query,type=null,limit=25){
    const q=N(query);if(!q)return[];
    const types=type?[U(type)]:[...state.aliases.keys()],hits=[];
    for(const t of types){
      const m=state.aliases.get(t)||new Map();
      for(const [alias,ids] of m.entries()){
        const exact=q===alias,boundary=(' '+q+' ').indexOf(' '+alias+' ')>=0||q.indexOf(alias+' ')===0||q.lastIndexOf(' '+alias)===q.length-alias.length-1;
        const partial=!exact&&!boundary&&alias.split(' ').every(x=>q.indexOf(x)>=0);
        if(!exact&&!boundary&&!partial)continue;
        const confidence=exact?1:(boundary?.96:Math.min(.90,.55+alias.length/Math.max(100,q.length*2)));
        for(const id of ids)hits.push({id,type:t,alias,confidence});
      }
    }
    const unique=new Map();
    for(const h of hits){const key=h.type+'::'+h.id;if(!unique.has(key)||unique.get(key).confidence<h.confidence)unique.set(key,h);}
    return[...unique.values()].sort((a,b)=>b.confidence-a.confidence||String(b.alias).length-String(a.alias).length||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(200,Number(limit)||25)));
  }

  function lookupId(id,type=null){
    const q=U(id),t=U(type);if(!q)return{status:'IDENTITY_NOT_FOUND',id:null,type:t||null,count:0,matches:[]};
    const matches=[],types=t?[t]:[...state.entities.keys()];
    for(const x of types){
      const e=state.entities.get(x)&&state.entities.get(x).get(q);
      if(e)matches.push({id:q,type:x,authority:e.authority,surfaces:C(e.surfaces),sourceDatasets:C(e.sources)});
    }
    for(const r of state.records.values())for(const i of A(r.identities))if(U(i.id)===q&&(!t||U(i.type)===t))
      matches.push({id:q,type:i.type,dataset:r.dataset,recordLocator:r.locator,fieldPath:i.fieldPath||null,source:i.source,authority:i.source.indexOf('CANONICAL_')===0?'CANONICAL':'DATASET',record:r});
    const uniq=[...new Map(matches.map((x,i)=>[JSON.stringify([x.type,x.dataset,x.recordLocator,x.fieldPath,x.id]),Object.assign({matchId:'UE-'+(i+1)},x)])).values()];
    return{status:uniq.length?'RESOLVED':'IDENTITY_NOT_FOUND',id:q,type:t||null,count:uniq.length,matches:uniq.slice(0,5000)};
  }

  function findRecords(entity,type=null,options={}){
    const e=resolve(entity,type);if(e.status!=='RESOLVED'||!e.id)return{status:e.status,entity:e,records:[]};
    const dataset=options.dataset?N(options.dataset):null,rows=[];
    for(const r of state.records.values()){
      if(dataset&&N(r.dataset)!==dataset)continue;
      if(r.identities.some(i=>U(i.id)===U(e.id)&&(!type||U(i.type)===U(type))))rows.push(C(r));
    }
    return{status:rows.length?'RESOLVED':'RECORD_NOT_FOUND',entity:e,records:rows.slice(0,Number(options.limit||1000))};
  }

  function schema(dataset){const x=state.datasets.get(S(dataset));return x?C(x.schema):null;}
  function list(type=null){const t=U(type);if(t)return [...(state.entities.get(t)||new Map()).values()].map(C);const out=[];for(const m of state.entities.values())for(const e of m.values())out.push(C(e));return out;}

  function diagnostics(){
    const byType={};for(const [t,m] of state.entities.entries())byType[t]=m.size;
    return{
      version:VERSION,entityTypes:Object.keys(byType),entities:byType,
      aliasCounts:Object.fromEntries([...state.aliases.entries()].map(([t,m])=>[t,m.size])),
      datasets:[...state.datasets.entries()].map(([n,x])=>({dataset:n,recordCount:x.recordCount,schemaAuthority:x.schema.authority,entityTypes:x.schema.entityTypes,identityFields:x.schema.identityFields})),
      records:state.records.size,authority:'OMEGA_UNIVERSAL_ENTITY_IDENTITY_ENGINE',
      policy:{unknownIdentity:'UNRESOLVED',countryIdCreation:'FORBIDDEN'}
    };
  }

  function reset(){state.entities.clear();state.aliases.clear();state.records.clear();state.datasets.clear();return diagnostics();}

  g.OmegaUniversalEntityIdentityEngine=Object.freeze({
    VERSION,reset,registerCanonical,ingestDataset,discoverSchema,resolve,select,lookupId,findRecords,schema,list,diagnostics
  });
  g.OmegaUnifiedIdentity=g.OmegaUniversalEntityIdentityEngine;
})(typeof globalThis!=='undefined'?globalThis:window);
