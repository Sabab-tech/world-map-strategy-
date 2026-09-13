/* OMEGA DEEP CORE v16.0.0
 * Repository-wide deterministic data index.
 *
 * Purpose:
 *   QUESTION IR -> exact/semantic identity lookup -> repository search registry
 *   -> physical dataset -> record/field location -> relation/ancestry scope
 *   -> deterministic operation -> evidence.
 *
 * This file contains mechanics only. Domain identities, aliases, capabilities,
 * relations and field mappings come from the repository knowledge/configuration.
 */
(function(global){
'use strict';

const VERSION='16.0.0';
const A=v=>Array.isArray(v)?v:[];
const O=v=>v!==null&&typeof v==='object';
const S=v=>String(v==null?'':v).trim();
const U=v=>S(v).toUpperCase();
const N=v=>S(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;"'“”‘’(){}[\]<>—–/\\]/g,' ').replace(/\s+/g,' ').trim();
const KEY=v=>N(v).replace(/\s+/g,'_');
const has=(o,k)=>O(o)&&Object.prototype.hasOwnProperty.call(o,k);

function builtIn(name){try{const p=global.process;return p?.getBuiltinModule?p.getBuiltinModule(name):null}catch(_){return null}}
function mods(){return{fs:builtIn('fs'),path:builtIn('path'),crypto:builtIn('crypto')}}
function readJSON(file){try{const{fs}=mods();if(!fs||!fs.existsSync(file))return null;return JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){return null}}
function hash(text){try{const c=mods().crypto;return c?.createHash?c.createHash('sha256').update(String(text)).digest('hex'):null}catch(_){return null}}
function relPath(file,root){const{path}=mods();return path?path.relative(root,file).replace(/\\/g,'/')||path.basename(file):S(file).replace(/^\.?\//,'')}
function rootDir(){return global.process?.cwd?.()||'.'}

function walkFiles(root){
  const{fs,path}=mods();if(!fs||!path)return[];
  const blocked=new Set(['node_modules','.git','.github','.cache','dist','build','coverage']);
  const out=[];
  const visit=dir=>{
    let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch(_){return}
    for(const e of entries){
      const full=path.join(dir,e.name);
      if(e.isDirectory()){if(!blocked.has(e.name))visit(full)}
      else if(e.isFile()&&/\.(json|geojson)$/i.test(e.name))out.push(full);
    }
  };
  visit(root);return out.sort((a,b)=>a.localeCompare(b));
}

function loadKnowledge(){
  if(global.OmegaOfflineSemanticKnowledge)return global.OmegaOfflineSemanticKnowledge;
  if(global.OmegaSemanticKnowledge)return global.OmegaSemanticKnowledge;
  const{path}=mods();return path?readJSON(path.join(rootDir(),'offline_semantic_knowledge.json'))||{}:{};
}
function relationDefs(k){
  return A(k?.relations||k?.relationship_registry||k?.relationshipRegistry)
    .filter(x=>O(x)&&S(x.id))
    .map(x=>({...x,id:U(x.id),from:U(x.from||x.fromType||''),to:U(x.to||x.toType||'')}));
}
function entityTypeDefs(k){return new Set(A(k?.entity_types).map(U))}
function entityContainers(k){
  const skip=new Set(['data_finding','question_semantics','ambiguity_policy','normalization','entity_types','schema','relations','relationship_registry','relationshipRegistry']);
  const out=[];
  for(const[bucket,container]of Object.entries(k||{})){
    if(skip.has(bucket)||!O(container)||Array.isArray(container))continue;
    for(const[id,v]of Object.entries(container)){
      if(!O(v))continue;
      const inferred=({countries:'COUNTRY',resources:'RESOURCE',asset_classes:'ASSET_CLASS'}[bucket]||'');
      const type=U(v.type||inferred);if(!type)continue;
      const names=[...A(v.names),...A(v.aliases)].map(S).filter(Boolean);
      out.push({id:U(id),type,names:[...new Set(names)],bucket});
    }
  }
  const m=new Map();for(const e of out)m.set(`${e.type}::${e.id}`,e);return[...m.values()];
}
function semanticAliases(k,capability){
  const wanted=U(capability),out=[];
  const walk=(v,keyHint='')=>{
    if(Array.isArray(v)){for(const x of v)if(O(x)||Array.isArray(x))walk(x,keyHint);return}
    if(!O(v))return;
    for(const[k,x]of Object.entries(v)){
      if(U(k)===wanted){
        if(Array.isArray(x))for(const z of x)if(typeof z==='string'&&S(z))out.push(S(z));
        else if(typeof x==='string'&&S(x))out.push(S(x));
      }
      if(O(x)||Array.isArray(x))walk(x,k);
    }
  };
  walk(k);return[...new Set(out)];
}
function metadataEntries(k){
  const out=[];
  for(const d of A(k?.data_finding?.dataset_capabilities)){
    if(!O(d)||!S(d.dataset))continue;
    const capabilities=A(d.capabilities).map(U);
    for(const cap of capabilities){
      const mapping=d.fieldMappings?.[cap]||d.fieldMappings?.[cap.toLowerCase()]||{};
      out.push({dataset:S(d.dataset),capability:cap,entityTypes:A(d.entityTypes).map(U),identityFields:A(d.identityFields).map(S),recordLocator:S(d.recordLocator)||null,recordKeyIsIdentity:d.recordKeyIsIdentity===true,fieldMapping:mapping,authority:S(d.authority)||'EXPLICIT_METADATA',aliases:semanticAliases(k,cap)});
    }
  }
  return out;
}
function datasetMeta(k,name){
  const n=N(name).replace(/\.json$/,'');
  const rows=metadataEntries(k).filter(x=>N(x.dataset).replace(/\.json$/,'')===n);
  if(!rows.length)return null;
  const m={dataset:S(name),logicalDatasetId:rows[0].logicalDatasetId||null,capabilities:[],entityTypes:[],identityFields:[],recordLocator:null,recordKeyIsIdentity:false,fieldMappings:{},authority:'EXPLICIT_METADATA'};
  for(const r of rows){
    if(!m.capabilities.includes(r.capability))m.capabilities.push(r.capability);
    for(const t of r.entityTypes)if(!m.entityTypes.includes(t))m.entityTypes.push(t);
    for(const f of r.identityFields)if(!m.identityFields.includes(f))m.identityFields.push(f);
    if(r.recordLocator)m.recordLocator=r.recordLocator;
    if(r.recordKeyIsIdentity)m.recordKeyIsIdentity=true;
    m.fieldMappings[r.capability]=r.fieldMapping||{};
  }
  return m;
}
function pathRead(root,p){
  if(p==null||S(p)==='')return root;
  let cur=root;
  const clean=S(p).replace(/^\$\.?/,'').replace(/\[([^\]]+)\]/g,'.$1');
  for(const part of clean.split('.').filter(Boolean)){
    if(cur==null)return undefined;
    cur=Array.isArray(cur)&&/^\d+$/.test(part)?cur[Number(part)]:cur[part];
  }
  return cur;
}
function scalar(v){return v===null||['string','number','boolean'].includes(typeof v)}
function scalarEntries(value,path='',out=[]){
  if(Array.isArray(value)){value.forEach((v,i)=>scalarEntries(v,`${path}.${i}`,out));return out}
  if(!O(value))return out;
  for(const[k,v]of Object.entries(value)){
    const p=path?`${path}.${k}`:k;
    if(scalar(v))out.push({key:k,path:p,value:v,type:v===null?'null':typeof v});
    else scalarEntries(v,p,out);
  }
  return out;
}
function rootShape(v){return Array.isArray(v)?'ARRAY':O(v)?'OBJECT':'SCALAR'}
function schemaProfile(raw){
  const fields=new Map();let objects=0,arrays=0,maxDepth=0;
  const walk=(v,p='',d=0)=>{
    maxDepth=Math.max(maxDepth,d);
    if(Array.isArray(v)){arrays++;for(const x of v)walk(x,p,d+1);return}
    if(!O(v))return;
    objects++;
    for(const[k,x]of Object.entries(v)){
      const pp=p?`${p}.${k}`:k,typ=Array.isArray(x)?'array':x===null?'null':typeof x;
      let f=fields.get(pp);if(!f)f={path:pp,key:k,types:new Set,count:0};f.types.add(typ);f.count++;fields.set(pp,f);
      if(O(x)||Array.isArray(x))walk(x,pp,d+1);
    }
  };
  walk(raw);
  return{rootShape:rootShape(raw),objectCount:objects,arrayCount:arrays,maxDepth,fields:[...fields.values()].map(x=>({path:x.path,key:x.key,types:[...x.types],count:x.count}))};
}

class SearchRegistry{
  constructor(){this.clear()}
  clear(){
    this.exact=new Map();this.tokens=new Map();this.fieldNames=new Map();this.keys=new Map();this.typeEntries=new Map();this.valueCount=0;
  }
  addBucket(map,key,row){const n=N(key);if(!n)return;let a=map.get(n);if(!a)map.set(n,a=[]);a.push(row)}
  add(row){
    const value=S(row.value);
    if(value){this.addBucket(this.exact,value,row);for(const t of N(value).split(/\s+/).filter(Boolean))this.addBucket(this.tokens,t,row);this.valueCount++}
    if(row.fieldPath){const leaf=S(row.fieldPath).split('.').pop();if(leaf)this.addBucket(this.fieldNames,leaf,row)}
    if(row.objectKey)this.addBucket(this.keys,row.objectKey,row);
    if(row.identityType){let a=this.typeEntries.get(U(row.identityType));if(!a)this.typeEntries.set(U(row.identityType),a=[]);a.push(row)}
  }
  exactValue(value){return (this.exact.get(N(value))||[]).slice()}
  tokenValue(value){return (this.tokens.get(N(value))||[]).slice()}
  field(name){return (this.fieldNames.get(N(name))||[]).slice()}
  key(name){return (this.keys.get(N(name))||[]).slice()}
  search(text,limit=200){
    const n=N(text);if(!n)return[];
    const exact=this.exactValue(n);if(exact.length)return exact.slice(0,limit);
    const terms=[...new Set(n.split(/\s+/).filter(Boolean))];
    const sets=terms.map(t=>new Map((this.tokenValue(t)).map(x=>[x.signature,x])));
    const merged=new Map();for(const m of sets)for(const[r,v]of m)merged.set(r,v);
    return[...merged.values()].slice(0,limit);
  }
}

class DeepCoreRuntime{
  constructor(opts={}){
    this.root=opts.rootDir||rootDir();
    this.k=opts.knowledge||loadKnowledge();
    this.catalogEntries=[];this.datasets=new Map();this.records=[];this.byLocator=new Map();
    this.schemas=new Map();this.registry=new SearchRegistry();this.identityIndex=new Map();this.aliasIndex=new Map();
    this.parentRecords=new Map();this.childrenRecords=new Map();this.relations=relationDefs(this.k);
    this.known=new Map(entityContainers(this.k).map(e=>[`${e.type}::${e.id}`,e]));
    this.initialized=false;this.lastBuild=null;this.buildVersion=0;
  }
  clear(){this.catalogEntries=[];this.datasets.clear();this.records=[];this.byLocator.clear();this.schemas.clear();this.registry.clear();this.identityIndex.clear();this.aliasIndex.clear();this.parentRecords.clear();this.childrenRecords.clear();this.lastBuild=null;this.initialized=false}
  addCatalog(entry){const key=N(entry.datasetId||entry.name||entry.physicalPath);const old=this.catalogEntries.find(x=>N(x.datasetId)===key);if(old){Object.assign(old,entry);return old}entry.datasetId=key;this.catalogEntries.push(entry);return entry}
  registerPhysical(file){
    const{fs,path}=mods();if(!fs)return null;let txt='',raw,parseStatus='PARSE_OK',parseError=null,st;
    try{st=fs.statSync(file);txt=fs.readFileSync(file,'utf8');raw=JSON.parse(txt)}catch(e){parseStatus='PARSE_ERROR';parseError=e.message}
    const name=path?path.basename(file):file.split('/').pop();const meta=datasetMeta(this.k,name);
    const entry=this.addCatalog({datasetId:name.toLowerCase(),name,physicalPath:relPath(file,this.root),absolutePath:file,extension:(name.split('.').pop()||'').toLowerCase(),bytes:st?.size||0,modifiedAt:st?new Date(st.mtimeMs).toISOString():null,hash:hash(txt),parseStatus,parseError,rootShape:raw==null?'UNKNOWN':rootShape(raw),rootKeys:O(raw)&&!Array.isArray(raw)?Object.keys(raw):[],source:'PHYSICAL_FILE',logicalDatasetId:meta?.logicalDatasetId||meta?.dataset||name,capabilities:meta?.capabilities||[],entityTypes:meta?.entityTypes||[],identityFields:meta?.identityFields||[],recordLocator:meta?.recordLocator||null,recordKeyIsIdentity:meta?.recordKeyIsIdentity===true,fieldMappings:meta?.fieldMappings||{},authority:meta?.authority||'DISCOVERED_PHYSICAL_FILE'});
    if(raw!==undefined){this.datasets.set(entry.datasetId,{entry,raw});this.schemas.set(entry.datasetId,schemaProfile(raw));this.collect(raw,entry,meta)}
    return entry;
  }
  collect(raw,entry,meta){
    const local=[];
    const addObject=(value,locator,key,parent,ancestry)=>{
      if(!O(value))return null;
      const fields=scalarEntries(value),r={dataset:entry.datasetId,physicalPath:entry.physicalPath,logicalDatasetId:entry.logicalDatasetId,locator,key:key==null?null:S(key),value,parent,ancestry:A(ancestry),entityType:'UNKNOWN',identities:[],aliases:[],fields,meta:meta||null,fileEntry:entry};
      r.signature=`${entry.datasetId}::${locator}`;local.push(r);return r;
    };
    const visit=(value,locator,key,parent,ancestry,depth)=>{
      if(!O(value)||depth>80)return;
      const r=addObject(value,locator,key,parent,ancestry);if(r)this.indexObject(r);
      if(!r)return;
      for(const[k,x]of Object.entries(value)){
        if(Array.isArray(x)){
          x.forEach((item,i)=>{if(O(item)){const q=`${locator}.${k}.${i}`;visit(item,q,String(i),r,[...ancestry,r],depth+1)}});
        }else if(O(x)){
          const q=locator?`${locator}.${k}`:k;visit(x,q,k,r,[...ancestry,r],depth+1);
        }
      }
    };
    if(Array.isArray(raw))raw.forEach((item,i)=>{if(O(item))visit(item,String(i),String(i),null,[],1)});
    else if(O(raw)){for(const[k,x]of Object.entries(raw)){if(O(x))visit(x,k,k,null,[],1)}if(!local.length)local.push(addObject(raw,'root','root',null,[]) )} 
    else local.push(addObject({value:raw},'root','root',null,[]));
    for(const r of local){this.records.push(r);this.byLocator.set(r.signature,r)}
  }
  inferEntityType(record){
    const candidates=[];const types=entityTypeDefs(this.k);const knownById=[];
    for(const f of record.fields){
      if(typeof f.value==='string'&&S(f.value)){
        const id=U(f.value);for(const t of types){if(this.known.has(`${t}::${id}`))knownById.push({id,type:t,score:100,source:'KNOWLEDGE_ID',fieldPath:f.path})}
      }
      const leaf=N(f.key).replace(/[^a-z0-9_ -]/g,'');
      for(const t of types){
        const tid=N(t).replace(/_/g,' ');if(!tid)continue;
        if(leaf.includes(tid)||leaf.includes(tid.replace(/\s+/g,'')))candidates.push({type:t,score:20,source:'FIELD_TYPE_SHAPE',fieldPath:f.path});
      }
    }
    for(const t of record.meta?.entityTypes||[])candidates.push({type:U(t),score:5,source:'DATASET_METADATA'});
    for(const e of knownById)candidates.push(e);
    if(record.key&&!/^\d+$/.test(record.key)){
      const id=U(record.key);for(const t of types)if(this.known.has(`${t}::${id}`))candidates.push({id,type:t,score:120,source:'KNOWN_OBJECT_KEY'});
      if(record.meta?.recordKeyIsIdentity)candidates.push({id,type:(record.meta.entityTypes||[])[0]||'UNKNOWN',score:40,source:'RECORD_KEY'});
    }
    candidates.sort((a,b)=>(b.score||0)-(a.score||0));
    record.entityType=candidates[0]?.type||'UNKNOWN';
    record.identities=[];for(const c of candidates.filter(x=>x.id))if(!record.identities.some(x=>x.id===c.id&&x.type===c.type))record.identities.push(c);
    record.identities=record.identities.slice(0,32);
    return record;
  }
  indexObject(r){
    this.inferEntityType(r);
    const addIdentity=(id,type,source,fieldPath)=>{
      const row={id:U(id),type:U(type||'UNKNOWN'),dataset:r.dataset,physicalPath:r.physicalPath,logicalDatasetId:r.logicalDatasetId,recordLocator:r.locator,fieldPath:fieldPath||null,value:S(id),recordSignature:r.signature,source};
      const key=`${row.type}::${row.id}`;let a=this.identityIndex.get(key);if(!a)this.identityIndex.set(key,a=[]);if(!a.some(x=>x.recordSignature===row.recordSignature&&x.fieldPath===row.fieldPath))a.push(row);
      let byAlias=this.aliasIndex.get(N(id));if(!byAlias)this.aliasIndex.set(N(id),byAlias=[]);byAlias.push(row);
    };
    for(const c of r.identities)if(c.id)addIdentity(c.id,c.type,c.source,c.fieldPath);
    for(const f of r.fields){
      const value=S(f.value);if(!value)continue;
      const known=[...this.known.values()].filter(e=>e.id===U(value));for(const e of known)addIdentity(e.id,e.type,'KNOWLEDGE_VALUE',f.path);
      const row={dataset:r.dataset,physicalPath:r.physicalPath,logicalDatasetId:r.logicalDatasetId,recordLocator:r.locator,fieldPath:f.path,key:f.key,value:f.value,objectKey:r.key,recordSignature:r.signature,identityType:r.entityType==='UNKNOWN'?null:r.entityType,signature:`${r.signature}::${f.path}`};
      this.registry.add(row);
      if(f.key)this.registry.add({...row,value:f.key,signature:`${r.signature}::FIELDNAME::${f.path}`});
    }
    if(r.key&&!/^\d+$/.test(r.key))this.registry.add({dataset:r.dataset,physicalPath:r.physicalPath,logicalDatasetId:r.logicalDatasetId,recordLocator:r.locator,fieldPath:null,key:null,value:r.key,objectKey:r.key,recordSignature:r.signature,identityType:r.entityType,signature:`${r.signature}::OBJECTKEY`});
  }
  rebuildRelations(){
    this.parentRecords.clear();this.childrenRecords.clear();
    for(const r of this.records){
      for(const a of A(r.ancestry)){if(a?.signature&&a.signature!==r.signature)this.parentRecords.set(r.signature,a.signature);}
    }
    for(const [child,parent]of this.parentRecords){let a=this.childrenRecords.get(parent);if(!a)this.childrenRecords.set(parent,a=[]);a.push(child)}
  }
  build(){
    this.clear();const files=walkFiles(this.root);for(const f of files)this.registerPhysical(f);this.rebuildRelations();
    this.initialized=true;this.buildVersion++;this.lastBuild=new Date().toISOString();return this.diagnostics();
  }
  ensure(opts={}){if(!this.initialized||opts.refresh)return this.build();return this.diagnostics()}
  resolveId(id,type=null){
    const wanted=U(id);const t=type?U(type):null;
    if(!wanted)return{status:'IDENTITY_NOT_FOUND',id:null,candidates:[]};
    if(t){const exact=this.identityIndex.get(`${t}::${wanted}`)||[];if(exact.length)return{status:'RESOLVED',id:wanted,type:t,candidates:exact.slice(0,64),matchCount:exact.length};}
    const candidates=[];for(const [k,a]of this.identityIndex){const [kt,kid]=k.split('::');if(kid===wanted)candidates.push({type:kt,rows:a})}
    if(candidates.length===1)return{status:'RESOLVED',id:wanted,type:candidates[0].type,candidates:candidates[0].rows.slice(0,64),matchCount:candidates[0].rows.length};
    if(candidates.length>1)return{status:'AMBIGUOUS_IDENTITY',id:wanted,type:null,candidates:candidates.map(x=>({type:x.type,matchCount:x.rows.length,rows:x.rows.slice(0,16)}))};
    const alias=this.aliasIndex.get(N(id))||[];if(alias.length===1)return{status:'RESOLVED_ALIAS',id:alias[0].id,type:alias[0].type,candidates:alias.slice(0,64),matchCount:alias.length};
    if(alias.length>1)return{status:'AMBIGUOUS_IDENTITY',id:wanted,type:null,candidates:alias.slice(0,64)};
    return{status:'IDENTITY_NOT_FOUND',id:wanted,type:t,candidates:[]};
  }
  search(value,opts={}){
    this.ensure();const term=S(value);const rows=this.registry.exactValue(term);const out=[];const seen=new Set();
    const push=r=>{if(!r||seen.has(r.signature))return;seen.add(r.signature);if(opts.dataset&&!N(r.dataset).includes(N(opts.dataset)))return;out.push(r)};
    for(const r of rows)push(r);
    if(!out.length)for(const r of this.registry.search(term,Number(opts.limit||200)))push(r);
    return out.slice(0,Number(opts.limit||200));
  }
  recordScope(signatures){
    const allowed=new Set(signatures);const queue=[...allowed];
    while(queue.length){const s=queue.shift();const p=this.parentRecords.get(s);if(p&&!allowed.has(p)){allowed.add(p);queue.push(p)}for(const c of this.childrenRecords.get(s)||[]){if(!allowed.has(c)){allowed.add(c);queue.push(c)}}}
    return [...allowed].map(s=>this.byLocator.get(s)).filter(Boolean);
  }
  subtreeContains(r,term){const n=N(term);if(!n)return false;for(const f of r.fields)if(N(f.value)===n||N(f.key)===n)return true;return false}
  anchorRecords(id,type){
    const resolved=this.resolveId(id,type);if(!['RESOLVED','RESOLVED_ALIAS'].includes(resolved.status))return{resolved,records:[]};
    const sigs=new Set((resolved.candidates||[]).map(x=>x.recordSignature));
    return{resolved,records:this.recordScope([...sigs])};
  }
  assetClassForRecord(r){
    if(r.entityType==='MINE'||r.entityType==='DEPOSIT'||r.entityType==='OIL_FIELD'||r.entityType==='GAS_FIELD'||r.entityType==='FACILITY')return r.entityType;
    const classes=entityContainers(this.k).filter(e=>e.type==='ASSET_CLASS');
    let best=null;
    for(const f of r.fields){const fk=N(f.key);for(const c of classes){const id=N(c.id),compact=id.replace(/_/g,'');if(fk.includes(id)||fk.includes(compact)){best=c.id;break}}if(best)break}
    if(!best&&r.key){const k=N(r.key);for(const c of classes){for(const n of c.names)if(k.includes(N(n))){best=c.id;break}if(best)break}}
    return best;
  }
  candidateDatasets(ir){
    const p=U(ir.property||'');const asset=U(ir.assetClass||ir.entities?.assetClass?.id||'');const q=N(ir.raw||'');const out=[];
    for(const e of this.catalogEntries){
      const caps=A(e.capabilities).map(U);let score=0;
      if(p&&caps.includes(p))score+=100;
      if(asset&&caps.includes(asset))score+=80;
      if(!p&&!asset&&caps.length)score+=1;
      if(q&&caps.some(c=>q.includes(N(c).replace(/_/g,' '))))score+=15;
      if(e.parseStatus==='PARSE_OK'&&score>0)out.push({entry:e,score});
    }
    out.sort((a,b)=>b.score-a.score||a.entry.name.localeCompare(b.entry.name));
    if(!out.length)for(const e of this.catalogEntries.filter(x=>x.parseStatus==='PARSE_OK'))out.push({entry:e,score:0});
    return out;
  }
  selectRecords(ir,entry){
    const country=ir.entities?.country?.id||ir.ids?.country||null;
    const resource=ir.entities?.resource?.id||ir.ids?.resource||null;
    const a=country?this.anchorRecords(country,'COUNTRY'):null;
    const b=resource?this.anchorRecords(resource,'RESOURCE'):null;
    if((country&&a?.resolved.status==='IDENTITY_NOT_FOUND')||(resource&&b?.resolved.status==='IDENTITY_NOT_FOUND'))return{status:'RECORD_NOT_FOUND',records:[],anchors:{country:a?.resolved||null,resource:b?.resolved||null}};
    const base=this.records.filter(r=>r.dataset===entry.datasetId);
    const scopes=[];
    if(a?.records?.length)scopes.push(new Set(a.records.filter(r=>r.dataset===entry.datasetId).map(r=>r.signature)));
    if(b?.records?.length)scopes.push(new Set(b.records.filter(r=>r.dataset===entry.datasetId).map(r=>r.signature)));
    let records=base;
    if(scopes.length){const union=new Set();for(const s of scopes)for(const x of s)union.add(x);records=base.filter(r=>union.has(r.signature)||scopes.some(s=>s.has(this.parentRecords.get(r.signature))));}
    if(country&&records.length){records=records.filter(r=>this.recordNearEntity(r,country,'COUNTRY')||this.subtreeContains(r,country)||r.ancestry.some(x=>this.subtreeContains(x,country)))}
    if(resource&&records.length){records=records.filter(r=>this.recordNearEntity(r,resource,'RESOURCE')||this.subtreeContains(r,resource)||r.ancestry.some(x=>this.subtreeContains(x,resource)))}
    return{status:'OK',records,anchors:{country:a?.resolved||null,resource:b?.resolved||null}};
  }
  recordNearEntity(r,id,type){const key=`${U(type)}::${U(id)}`;if(r.identities.some(x=>`${U(x.type)}::${U(x.id)}`===key))return true;const rows=this.identityIndex.get(key)||[];return rows.some(x=>x.recordSignature===r.signature);}
  resolveProperty(ir,records){
    const prop=U(ir.property||'');if(!prop)return null;
    const candidates=[];const qTerms=[...new Set([prop,...A(ir.propertyCandidates)])].map(N).filter(Boolean);
    for(const r of records){
      const mapping=this.propertyMapping(prop,r.dataset);
      if(mapping){
        const v=pathRead(r.value,mapping.valuePath||'');if(v!==undefined&&!O(v))candidates.push({record:r,fieldPath:mapping.valuePath||'',value:v,score:120,source:'EXPLICIT_METADATA'});
      }
      for(const f of r.fields){
        const fieldText=N(f.key).replace(/_/g,' ');let score=0;
        for(const t of qTerms){if(fieldText===t)score=Math.max(score,90);else if(fieldText.includes(t)||t.includes(fieldText))score=Math.max(score,70)}
        if(score)candidates.push({record:r,fieldPath:f.path,value:f.value,score,source:'SCHEMA_SEMANTIC_MATCH'});
      }
    }
    candidates.sort((a,b)=>b.score-a.score||a.fieldPath.localeCompare(b.fieldPath));
    if(!candidates.length)return{status:'FIELD_NOT_FOUND',candidates:[]};
    const top=candidates[0];const near=candidates.filter(x=>x.score===top.score);
    if(near.length>1&&new Set(near.map(x=>`${x.record.dataset}::${x.fieldPath}`)).size>1)return{status:'FIELD_NOT_FOUND',candidates:near.slice(0,16)};
    return{status:'RESOLVED',...top,candidates:candidates.slice(0,24)};
  }
  propertyMapping(prop,datasetId){
    const meta=this.catalogEntries.find(e=>e.datasetId===datasetId);if(!meta)return null;
    for(const [cap,m]of Object.entries(meta.fieldMappings||{}))if(U(cap)===U(prop)&&S(m.valuePath))return m;
    return null;
  }
  uniqueTargetRecords(records,asset){
    let rs=records;
    if(asset){const target=U(asset);rs=rs.filter(r=>U(this.assetClassForRecord(r)||'')===target)}
    const out=[];const seen=new Set();
    for(const r of rs){const id=r.identities.find(x=>x.id)?.id||r.key||r.signature;if(seen.has(`${U(r.entityType)}::${U(id)}`))continue;seen.add(`${U(r.entityType)}::${U(id)}`);out.push(r)}
    return out;
  }
  evidence(record,fieldPath,value,operation,relationPath=[]){
    return{dataset:record.dataset,physicalPath:record.physicalPath,logicalDatasetId:record.logicalDatasetId,recordLocator:record.locator,fieldPath:fieldPath||null,canonicalEntityId:record.identities.find(x=>x.id)?.id||null,entityType:record.entityType,property:null,assetClass:this.assetClassForRecord(record),rawValue:value,operation,relationPath,authority:record.fileEntry?.authority||'DISCOVERED_PHYSICAL_FILE',source:'REPOSITORY_SEARCH_REGISTRY'};
  }
  execute(ir,inputs=[],language='en',runtimeInput={}){
    this.ensure();
    const trace=[];const add=(stage,status,data={})=>trace.push({stage,status,...data});
    add('QUESTION_INTERPRETATION','READY',{operation:ir.operation,language});
    add('QUERY_IR','READY',{ids:ir.ids||{},property:ir.property||null,assetClass:ir.assetClass||null});
    const idResults={};
    for(const [kind,spec] of Object.entries(ir.entities||{}))if(spec?.id&&spec.type){idResults[kind]=this.resolveId(spec.id,spec.type);}
    add('IDENTITY_RESOLUTION','COMPLETE',{results:idResults});
    const failures=Object.values(idResults).filter(x=>['AMBIGUOUS_IDENTITY','IDENTITY_NOT_FOUND'].includes(x.status));
    if(failures.length){return this.fail(failures[0].status,trace,{identities:idResults})}
    const plans=this.candidateDatasets(ir);add('DATASET_DISCOVERY','COMPLETE',{candidates:plans.map(p=>({dataset:p.entry.name,physicalPath:p.entry.physicalPath,score:p.score,capabilities:p.entry.capabilities}))});
    const evidences=[];let values=[];let matchedRecords=[];let lastStatus='RECORD_NOT_FOUND';
    for(const p of plans){
      const selected=this.selectRecords(ir,p.entry);if(selected.status!=='OK'){lastStatus=selected.status;continue}
      let records=selected.records;
      const asset=U(ir.assetClass||ir.entities?.assetClass?.id||'');
      records=this.uniqueTargetRecords(records,asset);
      if(!records.length)continue;
      matchedRecords.push(...records);
      add('RECORD_DISCOVERY','MATCHED',{dataset:p.entry.name,recordCount:records.length});
      if(ir.operation==='COUNT'){
        for(const r of records)evidences.push(this.evidence(r,null,r.key||r.entityType||true,'COUNT',[]));
        values.push(records.length);
        continue;
      }
      if(['LOCATE','LIST','SELECT','IDENTIFY'].includes(ir.operation)){
        for(const r of records){const val=r.value?.name||r.value?.location||r.key||r.signature;evidences.push(this.evidence(r,null,val,ir.operation,[]));values.push(val)}
        continue;
      }
      const prop=this.resolveProperty(ir,records);add('FIELD_RESOLUTION',prop?.status||'NOT_RUN',{dataset:p.entry.name,fieldPath:prop?.fieldPath||null});
      if(!prop||prop.status!=='RESOLVED')continue;
      evidences.push(this.evidence(prop.record,prop.fieldPath,prop.value,ir.operation,[]));values.push(prop.value);
    }
    add('RECORD_GRAPH','SCOPED',{matchedRecordCount:matchedRecords.length});
    const op=U(ir.operation||'GET');let result=null;let status='VERIFIED_FACT';
    if(op==='COUNT'){const count=evidences.length?new Set(evidences.map(e=>`${e.dataset}::${e.recordLocator}::${e.canonicalEntityId||e.recordLocator}`)).size:0;if(count===0){status='RECORD_NOT_FOUND';result=null}else result=count;}
    else if(['LIST','SELECT','IDENTIFY','LOCATE'].includes(op)){result=[...new Set(values.map(x=>typeof x==='object'?JSON.stringify(x):S(x)).filter(Boolean))].map(x=>{try{return JSON.parse(x)}catch(_){return x}});if(!result.length)status='RECORD_NOT_FOUND'}
    else if(['GET','TOTAL','SUM','AVERAGE','MIN','MAX'].includes(op)){
      if(!values.length){status='FIELD_NOT_FOUND';result=null}
      else if(values.map(v=>JSON.stringify(v)).filter(Boolean).reduce((a,v)=>a.has(v)?a:(a.add(v),a),new Set()).size>1&&op==='GET'){status='SOURCE_CONFLICT';result=null}
      else {const nums=values.map(Number).filter(Number.isFinite);if(op==='GET')result=values[0];else if(op==='TOTAL'||op==='SUM')result=nums.reduce((a,b)=>a+b,0);else if(op==='AVERAGE')result=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;else if(op==='MIN')result=nums.length?Math.min(...nums):null;else if(op==='MAX')result=nums.length?Math.max(...nums):null;if(result===null)status='UNIT_CONFLICT'}
    } else if(op==='EXISTS'){result=matchedRecords.length>0}
    else if(op==='COMPARE'){result=values}
    else {status='OPERATION_UNSUPPORTED';result=null}
    add('DETERMINISTIC_OPERATION',status,{operation:op,result});
    add('VALIDATION',status,{evidenceCount:evidences.length});
    return{status,value:result,evidence:evidences,trace,queryIR:ir,diagnostics:this.diagnostics(),registry:{indexedValues:this.registry.valueCount}};
  }
  fail(status,trace,extra={}){trace.push({stage:'VALIDATION',status});return{status,value:null,evidence:[],trace,...extra,diagnostics:this.diagnostics(),registry:{indexedValues:this.registry.valueCount}}}
  buildExecutionPlan(ir){this.ensure();return{version:VERSION,order:['EXACT_ID','REPOSITORY_SEARCH_REGISTRY','DATASET','RECORD','RELATION_ANCESTRY','FIELD','OPERATION','VALIDATION','EVIDENCE'],identities:ir.ids||{},datasets:this.candidateDatasets(ir).map(x=>({dataset:x.entry.name,physicalPath:x.entry.physicalPath,logicalDatasetId:x.entry.logicalDatasetId,capabilities:x.entry.capabilities,score:x.score})),recordStrategy:'INDEXED_EXACT_VALUE + TYPE_SCOPED_ID + PARENT/CHILD ANCESTRY',fieldStrategy:'EXPLICIT_METADATA + SCHEMA SEMANTIC MATCH',operation:ir.operation||'GET'};}
  buildEvidenceLedger(result){return{version:VERSION,status:result?.status||null,count:A(result?.evidence).length,chain:A(result?.evidence).map(e=>({dataset:e.dataset,physicalPath:e.physicalPath,recordLocator:e.recordLocator,fieldPath:e.fieldPath,canonicalEntityId:e.canonicalEntityId,entityType:e.entityType,rawValue:e.rawValue,operation:e.operation,authority:e.authority,source:e.source}))};}
  lookupId(id,type=null){this.ensure();return{query:id,...this.resolveId(id,type),searchHits:this.search(id,{limit:200})};}
  catalog(){this.ensure();return{version:VERSION,count:this.catalogEntries.length,datasets:this.catalogEntries.map(e=>({...e,absolutePath:undefined}))};}
  schema(dataset){this.ensure();const e=this.catalogEntries.find(x=>N(x.name)===N(dataset)||N(x.datasetId)===N(dataset)||N(x.physicalPath)===N(dataset));return e?{dataset:e.name,physicalPath:e.physicalPath,logicalDatasetId:e.logicalDatasetId,metadata:e,schema:this.schemas.get(e.datasetId)||null}:null;}
  diagnostics(){return{version:VERSION,initialized:this.initialized,root:this.root,catalogDatasets:this.catalogEntries.length,parsedDatasets:this.datasets.size,records:this.records.length,indexedValues:this.registry.valueCount,identityKeys:this.identityIndex.size,aliasKeys:this.aliasIndex.size,schemas:this.schemas.size,lastBuild:this.lastBuild,physicalSearchRegistry:{exactValues:this.registry.exact.size,tokenTerms:this.registry.tokens.size,fieldNames:this.registry.fieldNames.size,objectKeys:this.registry.keys.size}}}
  refresh(){return this.build()}
  traverse(id,type=null){this.ensure();const r=this.resolveId(id,type);if(!['RESOLVED','RESOLVED_ALIAS'].includes(r.status))return{status:r.status,id,type,records:[]};const sigs=new Set((r.candidates||[]).map(x=>x.recordSignature));return{status:'RESOLVED',id:r.id,type:r.type,records:this.recordScope([...sigs]).map(x=>({dataset:x.dataset,physicalPath:x.physicalPath,recordLocator:x.locator,entityType:x.entityType,key:x.key,identities:x.identities.map(y=>({id:y.id,type:y.type})),fields:x.fields}))};}
  index(){this.ensure();return this.diagnostics()}
  findRecords(entity,dataset){this.ensure();const id=entity?.id||entity;const type=entity?.type||null;const r=this.resolveId(id,type);if(!['RESOLVED','RESOLVED_ALIAS'].includes(r.status))return[];const sigs=new Set((r.candidates||[]).map(x=>x.recordSignature));return this.records.filter(x=>(!dataset||N(x.dataset)===N(dataset)||N(x.physicalPath)===N(dataset))&&sigs.has(x.signature));}
}

const runtime=new DeepCoreRuntime();
const api={
  VERSION,
  initializeRepository:opts=>runtime.build(opts||{}),
  ensureRepository:opts=>runtime.ensure(opts||{}),
  execute:(ir,inputs=[],language='en',runtimeInput={})=>runtime.execute(ir,inputs,language,runtimeInput),
  index:()=>runtime.index(),
  lookupId:(id,type)=>runtime.lookupId(id,type),
  search:(value,opts)=>runtime.search(value,opts),
  buildExecutionPlan:(ir,inputs=[],runtimeInput={})=>runtime.buildExecutionPlan(ir,inputs,runtimeInput),
  buildEvidenceLedger:result=>runtime.buildEvidenceLedger(result),
  catalog:()=>runtime.catalog(),
  schema:dataset=>runtime.schema(dataset),
  diagnostics:()=>runtime.diagnostics(),
  refresh:()=>runtime.refresh(),
  traverse:(id,type)=>runtime.traverse(id,type),
  findRecords:(entity,dataset)=>runtime.findRecords(entity,dataset),
  resolveResources:entity=>runtime.findRecords(entity),
  _runtime:runtime
};
global.OfflineQueryEngine=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
