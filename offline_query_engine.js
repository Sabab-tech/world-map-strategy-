/*
 * OMEGA DEEP CORE v14.0.0
 * Deterministic repository navigation and evidence runtime.
 *
 * Runtime contract:
 *   QUERY IR
 *      -> IDENTITY
 *      -> DATA CATALOG
 *      -> DATASET PLAN
 *      -> RECORD SET
 *      -> RELATION PATH
 *      -> FIELD
 *      -> OPERATION
 *      -> VALIDATION
 *      -> EVIDENCE
 *
 * This file contains generic mechanics only. Domain facts, names, identifiers,
 * dataset capabilities, relations, semantic properties, units and field mappings
 * are read from repository data and metadata.
 */
(function(global){
'use strict';

const VERSION = '14.1.0';
const A = v => Array.isArray(v) ? v : [];
const O = v => v !== null && typeof v === 'object';
const S = v => String(v == null ? '' : v).trim();
const N = v => S(v).normalize('NFKC').toLowerCase()
  .replace(/[?!,.:;"'“”‘’(){}[\]<>—–/\\]/g,' ')
  .replace(/\s+/g,' ').trim();
const U = v => S(v).toUpperCase();
const has = (o,k) => O(o) && Object.prototype.hasOwnProperty.call(o,k);

function builtIn(name){
  try{ const p=global.process; return p?.getBuiltinModule ? p.getBuiltinModule(name) : null; }
  catch(_){ return null; }
}
function mods(){ return {fs:builtIn('fs'),path:builtIn('path'),crypto:builtIn('crypto')}; }
function readJSON(file){
  try{ const fs=mods().fs; if(!fs||!fs.existsSync(file))return null; return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch(_){ return null; }
}
function hash(text){
  try{ const crypto=mods().crypto; return crypto?.createHash ? crypto.createHash('sha256').update(String(text)).digest('hex') : null; }
  catch(_){ return null; }
}
function relPath(file,root){
  const path=mods().path;
  if(path)return path.relative(root,file).replace(/\\/g,'/')||path.basename(file);
  return S(file).replace(/^\.?\//,'');
}
function walkDataFiles(root){
  const {fs,path}=mods(); if(!fs||!path)return [];
  const blocked=new Set(['node_modules','.git','.github','.cache','dist','build']);
  const out=[];
  const walk=dir=>{
    let entries=[]; try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch(_){return;}
    for(const e of entries){
      const full=path.join(dir,e.name);
      if(e.isDirectory()){ if(!blocked.has(e.name))walk(full); }
      else if(e.isFile()&&/\.(json|geojson)$/i.test(e.name))out.push(full);
    }
  };
  walk(root); return out.sort((a,b)=>a.localeCompare(b));
}
function loadKnowledge(){
  return global.OmegaOfflineSemanticKnowledge||global.OmegaSemanticKnowledge||(()=>{
    const path=mods().path,root=global.process?.cwd?.()||'.';
    return path?readJSON(path.join(root,'offline_semantic_knowledge.json'))||{}:{};
  })();
}
function metadataEntries(k){
  const out=[];
  for(const d of A(k?.data_finding?.dataset_capabilities)){
    if(!O(d)||!S(d.dataset))continue;
    for(const cap of A(d.capabilities)){
      const key=S(cap),mapping=d.fieldMappings?.[key]||d.fieldMappings?.[U(key)]||{};
      out.push({dataset:S(d.dataset),capability:U(key),metadata:d,mapping});
    }
  }
  return out;
}
function datasetMetadata(k,name){
  const all=metadataEntries(k).filter(x=>N(x.dataset)===N(name));
  if(!all.length)return null;
  const merged={dataset:S(name),capabilities:[],fieldMappings:{},entityTypes:[],identityFields:[],recordLocator:null,recordKeyIsIdentity:false,authority:'EXPLICIT_METADATA'};
  for(const x of all){
    if(!merged.capabilities.includes(x.capability))merged.capabilities.push(x.capability);
    if(O(x.mapping))merged.fieldMappings[x.capability]=x.mapping;
    for(const t of A(x.metadata.entityTypes))if(!merged.entityTypes.includes(U(t)))merged.entityTypes.push(U(t));
    for(const f of A(x.metadata.identityFields))if(!merged.identityFields.includes(S(f)))merged.identityFields.push(S(f));
    if(x.metadata.recordLocator&&!merged.recordLocator)merged.recordLocator=S(x.metadata.recordLocator);
    if(x.metadata.recordKeyIsIdentity===true)merged.recordKeyIsIdentity=true;
  }
  return merged;
}
function relationDefs(k){return A(k?.relations||k?.relationship_registry||k?.relationshipRegistry).filter(x=>O(x)&&S(x.id));}
function allKnownEntities(k){
  const out=[],skip=new Set(['data_finding','question_semantics','ambiguity_policy','normalization','entity_types','schema','relations','relationship_registry','relationshipRegistry']);
  for(const [bucket,container] of Object.entries(k||{})){
    if(skip.has(bucket)||!O(container)||Array.isArray(container))continue;
    for(const [id,value] of Object.entries(container)){
      if(!O(value))continue;
      const type=U(value.type||bucket.replace(/s$/,'')||'UNKNOWN');
      const names=[...A(value.names),...A(value.aliases)].filter(Boolean).map(S);
      if(names.length||id)out.push({id:U(id),type,names:[...new Set(names)]});
    }
  }
  return out;
}
function pathRead(root,p){
  if(p==null||S(p)==='')return root;
  let cur=root;const clean=S(p).replace(/^\$\.?/,'').replace(/\[([^\]]+)\]/g,'.$1');
  for(const part of clean.split('.').filter(Boolean)){if(cur==null)return undefined;cur=Array.isArray(cur)&&/^\d+$/.test(part)?cur[Number(part)]:cur[part];}
  return cur;
}
function scalar(v){return v===null||['string','number','boolean'].includes(typeof v);}
function scalarEntries(value,path='',out=[]){
  if(value==null)return out;
  if(Array.isArray(value)){value.forEach((v,i)=>scalarEntries(v,`${path}[${i}]`,out));return out;}
  if(!O(value))return out;
  for(const [key,v] of Object.entries(value)){
    const p=path?`${path}.${key}`:key;
    if(scalar(v))out.push({key,path:p,value:v,type:v===null?'null':typeof v}); else scalarEntries(v,p,out);
  }
  return out;
}
function rootShape(v){return Array.isArray(v)?'ARRAY':O(v)?'OBJECT':'SCALAR';}
function normalizeInputDataset(x,i){
  if(O(x)&&has(x,'__datasetName')){
    if(has(x,'__data'))return{name:S(x.__datasetName)||`runtime_${i}`,raw:x.__data,source:'RUNTIME_INPUT'};
    const numeric=Object.keys(x).filter(k=>/^\d+$/.test(k)).sort((a,b)=>Number(a)-Number(b));
    if(numeric.length&&Object.keys(x).every(k=>k==='__datasetName'||/^\d+$/.test(k)))return{name:S(x.__datasetName)||`runtime_${i}`,raw:numeric.map(k=>x[k]),source:'RUNTIME_INPUT'};
    return{name:S(x.__datasetName)||`runtime_${i}`,raw:x,source:'RUNTIME_INPUT'};
  }
  if(O(x)&&has(x,'dataset')&&has(x,'data'))return{name:S(x.dataset)||`runtime_${i}`,raw:x.data,source:'RUNTIME_INPUT'};
  return{name:`runtime_${i}`,raw:x,source:'RUNTIME_INPUT'};
}
function buildSchema(raw){
  const fields=new Map();let objects=0,arrays=0,maxDepth=0;
  const visit=(v,p='',depth=0)=>{
    maxDepth=Math.max(maxDepth,depth);
    if(Array.isArray(v)){arrays++;v.forEach(x=>visit(x,p,depth+1));return;}
    if(!O(v))return;objects++;
    for(const [k,x] of Object.entries(v)){
      const path=p?`${p}.${k}`:k,t=Array.isArray(x)?'array':x===null?'null':typeof x;
      let f=fields.get(path);if(!f)f={path,key:k,types:new Set(),count:0};f.types.add(t);f.count++;fields.set(path,f);
      if(O(x)||Array.isArray(x))visit(x,path,depth+1);
    }
  };
  visit(raw);
  return{rootShape:rootShape(raw),objectCount:objects,arrayCount:arrays,maxDepth,fields:[...fields.values()].map(f=>({path:f.path,key:f.key,types:[...f.types],count:f.count}))};
}
function recordType(value,meta,k){
  const hinted=[...A(value?.entityTypes),...A(value?.entity_types)].map(U),valid=new Set(A(k?.entity_types).map(U));
  const h=hinted.find(x=>!valid.size||valid.has(x));if(h)return h;
  const types=A(meta?.entityTypes).map(U);return types.length===1?types[0]:'UNKNOWN';
}
function makeRecord(raw,locator,key,dataset,meta,k,parentKind){
  const aliases=[];
  for(const f of scalarEntries(raw))if(typeof f.value==='string'&&S(f.value))aliases.push({value:S(f.value),source:'SCALAR_FIELD',fieldPath:f.path});
  if(key&&!/^\d+$/.test(S(key)))aliases.push({value:S(key).replace(/[_-]+/g,' '),source:'OBJECT_KEY',fieldPath:null});
  const seen=new Set(),a=aliases.filter(x=>{const n=N(x.value);if(!n||seen.has(n))return false;seen.add(n);return true;});
  return{dataset,locator,key,value:raw,parentKind:parentKind||null,entityType:recordType(raw,meta,k),identities:[],identityValues:[],aliases:a,aliasValues:a.map(x=>x.value),fields:scalarEntries(raw),fileEntry:null};
}
function collectRecords(raw,dataset,meta,k){
  const out=[],add=(v,loc,key,parent)=>{if(O(v))out.push(makeRecord(v,loc,key,dataset,meta,k,parent));},walk=(v,path,depth)=>{
    if(!O(v)||depth>40)return;
    for(const [key,child] of Object.entries(v)){
      if(Array.isArray(child))child.forEach((item,i)=>{add(item,[...path,key,String(i)].join('.'),String(i),'ARRAY');if(O(item))walk(item,[...path,key,String(i)],depth+1);});
      else if(O(child)){add(child,[...path,key].join('.'),key,'OBJECT_MAP');walk(child,[...path,key],depth+1);}
    }
  };
  if(Array.isArray(raw))raw.forEach((item,i)=>{add(item,String(i),String(i),'ROOT_ARRAY');if(O(item))walk(item,[String(i)],1);});
  else if(O(raw)){
    for(const [key,child] of Object.entries(raw)){
      if(Array.isArray(child))child.forEach((item,i)=>{add(item,`${key}.${i}`,String(i),'ARRAY');if(O(item))walk(item,[key,String(i)],1);});
      else if(O(child)){add(child,key,key,'OBJECT_MAP');walk(child,[key],1);}
    }
    if(!out.length)out.push(makeRecord(raw,'root','root',dataset,meta,k,'ROOT'));
  } else out.push(makeRecord(raw,'root','root',dataset,meta,k,'ROOT_SCALAR'));
  const seen=new Set();return out.filter(r=>{const k=`${r.dataset}::${r.locator}`;if(seen.has(k))return false;seen.add(k);return true;});
}
function identityScore(value,stat,total){
  const s=S(value);if(!s||s.length>160||/\s{2,}/.test(s))return 0;let score=0;
  if(/^[A-Z0-9][A-Z0-9._:-]{1,63}$/i.test(s))score+=2;if(/[_:.-]/.test(s))score+=.5;if(/\d/.test(s))score+=.25;
  const coverage=stat&&total?stat.count/total:0,unique=stat&&stat.count?stat.distinct/stat.count:0,freq=stat?.freq.get(U(s))||1;
  return score+coverage*1.5+unique*3+(freq===1?2:1/freq);
}
function normalizeProperty(v){return U(String(v||'').replace(/[^A-Za-z0-9_]+/g,'_').replace(/_+/g,'_'));}

class DataCatalogRegistry{
  constructor(root,k){this.root=root;this.knowledge=k||{};this.byKey=new Map();this.order=[];this.version=0;}
  clear(){this.byKey.clear();this.order=[];this.version=0;}
  register(entry){const key=N(entry.datasetId||entry.name||entry.physicalPath);if(!key)return null;const existing=this.byKey.get(key);if(existing){Object.assign(existing,entry);return existing;}const stored={...entry,datasetId:key};this.byKey.set(key,stored);this.order.push(stored);return stored;}
  get(id){return this.byKey.get(N(id))||null;}
  list(){return this.order.slice().sort((a,b)=>a.datasetId.localeCompare(b.datasetId));}
}

class DeepRepositoryRuntime{
  constructor(opts={}){
    this.rootDir=opts.rootDir||global.process?.cwd?.()||'.';this.knowledge=opts.knowledge||loadKnowledge();
    this.catalog=new DataCatalogRegistry(this.rootDir,this.knowledge);this.datasets=new Map();this.records=[];this.recordByLocator=new Map();
    this.idRegistry=new Map();this.aliasRegistry=new Map();this.scalarIndex=new Map();this.schemaRegistry=new Map();this.propertyRegistry=new Map();
    this.relationRegistry=new Map();this.relationEdgeIndex=new Map();this.initialized=false;this.lastCollection=null;this.collectionVersion=0;
  }
  clear(){this.catalog.clear();this.datasets.clear();this.records=[];this.recordByLocator.clear();this.idRegistry.clear();this.aliasRegistry.clear();this.scalarIndex.clear();this.schemaRegistry.clear();this.propertyRegistry.clear();this.relationRegistry.clear();this.relationEdgeIndex.clear();this.initialized=false;}
  registerPhysicalFile(file){
    const fs=mods().fs;if(!fs)return null;let stat,text,data=null,parseStatus='PARSE_OK',parseError=null;
    try{stat=fs.statSync(file);text=fs.readFileSync(file,'utf8');}catch(e){return null;}try{data=JSON.parse(text);}catch(e){parseStatus='PARSE_ERROR';parseError=e.message;}
    const relative=relPath(file,this.rootDir),path=mods().path,name=path?.basename(file)||relative.split('/').pop(),meta=datasetMetadata(this.knowledge,name)||datasetMetadata(this.knowledge,relative);
    const entry=this.catalog.register({name,physicalPath:relative,absolutePath:file,extension:(name.match(/\.([^.]+)$/)?.[1]||'').toLowerCase(),bytes:stat.size,modifiedAt:new Date(stat.mtimeMs).toISOString(),hash:hash(text),logicalDatasetId:relative,datasetId:relative,parseStatus,parseError,rootShape:data==null?'UNKNOWN':rootShape(data),rootKeys:O(data)&&!Array.isArray(data)?Object.keys(data):[],capabilities:A(meta?.capabilities),entityTypes:A(meta?.entityTypes),identityFields:A(meta?.identityFields),recordLocator:meta?.recordLocator||null,recordKeyIsIdentity:meta?.recordKeyIsIdentity===true,authority:meta?.authority||'DISCOVERY',source:'PHYSICAL_REPOSITORY'});
    if(data===null)return entry;this.datasets.set(entry.datasetId,{...entry,raw:data});const schema=buildSchema(data);this.schemaRegistry.set(entry.datasetId,schema);entry.schema=schema;
    for(const record of collectRecords(data,entry.datasetId,meta,this.knowledge)){record.fileEntry=entry;this.records.push(record);this.recordByLocator.set(`${record.dataset}::${record.locator}`,record);}return entry;
  }
  registerInputDataset(input,i){
    const d=normalizeInputDataset(input,i),meta=datasetMetadata(this.knowledge,d.name),entry=this.catalog.register({name:d.name,physicalPath:null,absolutePath:null,extension:'runtime',bytes:null,modifiedAt:null,hash:null,logicalDatasetId:d.name,datasetId:d.name,parseStatus:'RUNTIME_INPUT',parseError:null,rootShape:rootShape(d.raw),rootKeys:O(d.raw)&&!Array.isArray(d.raw)?Object.keys(d.raw):[],capabilities:A(meta?.capabilities),entityTypes:A(meta?.entityTypes),identityFields:A(meta?.identityFields),recordLocator:meta?.recordLocator||null,recordKeyIsIdentity:meta?.recordKeyIsIdentity===true,authority:meta?.authority||'DISCOVERY',source:d.source});
    this.datasets.set(entry.datasetId,{...entry,raw:d.raw});this.schemaRegistry.set(entry.datasetId,buildSchema(d.raw));entry.schema=this.schemaRegistry.get(entry.datasetId);
    for(const record of collectRecords(d.raw,entry.datasetId,meta,this.knowledge)){record.fileEntry=entry;this.records.push(record);this.recordByLocator.set(`${record.dataset}::${record.locator}`,record);}return entry;
  }
  collectDatasets(inputs=[]){this.clear();for(let i=0;i<A(inputs).length;i++)this.registerInputDataset(inputs[i],i);for(const file of walkDataFiles(this.rootDir))this.registerPhysicalFile(file);this.buildIndexes();this.initialized=true;this.collectionVersion+=1;this.catalog.version=this.collectionVersion;this.lastCollection=new Date().toISOString();return this.report();}
  ensure(inputs=[]){if(!this.initialized)return this.collectDatasets(inputs);let added=false;for(let i=0;i<A(inputs).length;i++){const d=normalizeInputDataset(inputs[i],i);if(!this.datasets.has(N(d.name))){this.registerInputDataset(inputs[i],i);added=true;}}if(added){this.buildIndexes();this.collectionVersion+=1;this.catalog.version=this.collectionVersion;}return this.report();}
  buildIndexes(){
    this.idRegistry.clear();this.aliasRegistry.clear();this.scalarIndex.clear();this.propertyRegistry.clear();this.relationRegistry.clear();this.relationEdgeIndex.clear();
    const statsByDataset=new Map();
    for(const r of this.records){let bucket=statsByDataset.get(r.dataset);if(!bucket){bucket={total:0,fields:new Map()};statsByDataset.set(r.dataset,bucket);}bucket.total++;
      for(const f of r.fields){if(typeof f.value==='string'){let st=bucket.fields.get(f.path);if(!st)st={count:0,distinct:new Set(),freq:new Map()};st.count++;st.distinct.add(U(f.value));st.freq.set(U(f.value),(st.freq.get(U(f.value))||0)+1);bucket.fields.set(f.path,st);}const scalarKey=N(f.value);if(scalarKey){if(!this.scalarIndex.has(scalarKey))this.scalarIndex.set(scalarKey,[]);this.scalarIndex.get(scalarKey).push({record:r,fieldPath:f.path});}}
    }
    for(const r of this.records){const meta=this.catalog.get(r.dataset)||{},stats=statsByDataset.get(r.dataset),candidates=[];
      for(const field of A(meta.identityFields)){const v=pathRead(r.value,field);if(!scalar(v)||!S(v))continue;const st=stats?.fields.get(field),freq=st?.freq.get(U(v))||1,distinct=st?.distinct.size||0,count=st?.count||0,uniqueness=count&&distinct?distinct/count:0,repeatedPenalty=freq>1?-Math.min(35,(freq-1)*5):0;candidates.push({value:U(v),score:100+uniqueness*10+repeatedPenalty,source:'METADATA_FIELD',fieldPath:field,frequency:freq,uniqueness});}
      if(meta.recordKeyIsIdentity&&r.key&&!/^\d+$/.test(S(r.key)))candidates.push({value:U(r.key),score:110,source:'METADATA_RECORD_KEY',fieldPath:null});
      if(!candidates.length&&r.parentKind==='OBJECT_MAP'&&r.key&&!/^\d+$/.test(S(r.key)))candidates.push({value:U(r.key),score:90,source:'OBJECT_KEY',fieldPath:null});
      if(!candidates.length)for(const f of r.fields){if(typeof f.value!=='string')continue;const st=stats?.fields.get(f.path),score=identityScore(f.value,st,stats?.total||0);if(score>=4)candidates.push({value:U(f.value),score,source:'STRUCTURAL_ID_CANDIDATE',fieldPath:f.path,coverage:st?.count/(stats?.total||1)||0,uniqueness:st?.distinct?.size/(st?.count||1)||0,frequency:st?.freq?.get(U(f.value))||1});}
      candidates.sort((a,b)=>b.score-a.score||a.value.localeCompare(b.value));const selected=[],seen=new Set();for(const c of candidates){if(!c.value||seen.has(c.value))continue;seen.add(c.value);selected.push(c);if(selected.length>=3)break;}r.identities=selected;r.identityValues=selected.map(x=>x.value);
      for(const id of r.identityValues){if(!this.idRegistry.has(id))this.idRegistry.set(id,[]);this.idRegistry.get(id).push(r);}for(const alias of r.aliases){const key=N(alias.value);if(!key)continue;if(!this.aliasRegistry.has(key))this.aliasRegistry.set(key,[]);this.aliasRegistry.get(key).push({record:r,source:alias.source,fieldPath:alias.fieldPath||null});}
    }
    for(const m of metadataEntries(this.knowledge))this.propertyRegistry.set(`${N(m.dataset)}::${m.capability}`,{...m});
    for(const def of relationDefs(this.knowledge))this.relationRegistry.set(U(def.id),{...def,source:'METADATA',edges:[]});
    this.inferRelations();this.inferDynamicRelations();
  }
  inferRelations(){
    for(const def of [...this.relationRegistry.values()]){const from=U(def.from||def.fromType),to=U(def.to||def.toType);if(!from||!to)continue;const sourceRecords=this.records.filter(r=>r.entityType===from||r.entityType==='UNKNOWN'),targetIdMap=new Map();
      for(const t of this.records){if(!(t.entityType===to||t.entityType==='UNKNOWN'))continue;for(const id of t.identityValues){const k=U(id);if(!targetIdMap.has(k))targetIdMap.set(k,[]);targetIdMap.get(k).push(t);}}
      for(const source of sourceRecords)for(const field of source.fields){if(!scalar(field.value)||!S(field.value))continue;for(const target of targetIdMap.get(U(field.value))||[])if(target!==source)this.attachRelation(def,source,target,field.path,'REFERENCE_MATCH');}
    }
  }
  inferDynamicRelations(){
    const byTypedId=new Map();for(const r of this.records){if(r.entityType==='UNKNOWN')continue;for(const id of r.identityValues){const k=`${U(r.entityType)}::${U(id)}`;if(!byTypedId.has(k))byTypedId.set(k,[]);byTypedId.get(k).push(r);}}
    for(const source of this.records)for(const field of source.fields){if(!scalar(field.value)||!S(field.value))continue;for(const type of this.entityTypesPresent()){for(const target of byTypedId.get(`${type}::${U(field.value)}`)||[]){if(target===source)continue;const relId=`AUTO_REF::${source.entityType}::${target.entityType}`;if(!this.relationRegistry.has(U(relId)))this.relationRegistry.set(U(relId),{id:relId,from:source.entityType,to:target.entityType,entityTypes:[source.entityType,target.entityType],source:'INFERRED_RELATION',edges:[]});this.attachRelation(this.relationRegistry.get(U(relId)),source,target,field.path,'AUTO_REFERENCE');}}}
  }
  entityTypesPresent(){return[...new Set(this.records.map(r=>U(r.entityType)).filter(x=>x&&x!=='UNKNOWN'))];}
  attachRelation(def,from,to,fieldPath,method){if(!def)return;if(!def.edges)def.edges=[];const key=`${from.dataset}::${from.locator}::${to.dataset}::${to.locator}`;if(def.edges.some(x=>`${x.fromDataset}::${x.fromLocator}::${x.toDataset}::${x.toLocator}`===key))return;const entry={id:U(def.id),fromType:U(def.from||def.fromType||from.entityType),toType:U(def.to||def.toType||to.entityType),fromDataset:from.dataset,fromLocator:from.locator,toDataset:to.dataset,toLocator:to.locator,fieldPath:fieldPath||null,method,source:'INFERRED_RELATION'};def.edges.push(entry);const edgeKey=`${U(entry.id)}::${from.dataset}::${from.locator}`;if(!this.relationEdgeIndex.has(edgeKey))this.relationEdgeIndex.set(edgeKey,[]);this.relationEdgeIndex.get(edgeKey).push(entry);}
  exactId(id,type=null){const key=U(id),all=this.idRegistry.get(key)||[],records=type?all.filter(r=>r.entityType==='UNKNOWN'||U(r.entityType)===U(type)):all;return{status:records.length===1?'RESOLVED':records.length?'AMBIGUOUS':'NOT_FOUND',id:key,records};}
  textScore(a,b){const q=N(a),v=N(b);if(!q||!v)return 0;if(q===v)return 1;if(q.includes(v)||v.includes(q))return .94;const qt=new Set(q.split(/\s+/)),vt=new Set(v.split(/\s+/)),hit=[...qt].filter(x=>vt.has(x)).length;return hit?Math.min(.9,.5+.4*hit/Math.max(qt.size,vt.size)):0;}
  questionSpans(text){const t=N(text).split(/\s+/).filter(Boolean),out=[];for(let n=t.length;n>0;n--)for(let i=0;i+n<=t.length;i++)out.push(t.slice(i,i+n).join(' '));return out;}
  textCandidates(text,type=null){const q=N(text),hits=[];for(const aliasItems of this.aliasRegistry.values())for(const x of aliasItems){if(type&&x.record.entityType!=='UNKNOWN'&&U(x.record.entityType)!==U(type))continue;const score=this.textScore(q,x.record.aliasValues.join(' '));if(score>=.82)hits.push({record:x.record,score,source:x.source,fieldPath:x.fieldPath});}const direct=this.aliasRegistry.get(q)||[];for(const x of direct)hits.push({record:x.record,score:1,source:x.source,fieldPath:x.fieldPath});const dedupe=new Map();for(const h of hits){const k=`${h.record.dataset}::${h.record.locator}`;if(!dedupe.has(k)||h.score>dedupe.get(k).score)dedupe.set(k,h);}return[...dedupe.values()].sort((a,b)=>b.score-a.score||a.record.dataset.localeCompare(b.record.dataset));}
  resolveEntity(ir,type){const targetType=U(type),explicit=ir?.entities?.[targetType.toLowerCase()];if(explicit?.id){const exact=this.exactId(explicit.id,targetType);if(exact.status==='RESOLVED')return{status:'RESOLVED',id:U(explicit.id),type:targetType,confidence:1,record:exact.records[0],records:exact.records,names:A(explicit.names),surface:S(explicit.surface||explicit.name||explicit.id)};}
    const query=S(ir?.normalized||ir?.raw||'');const literal=[];for(const span of this.questionSpans(query)){const exact=this.exactId(span,targetType);if(exact.status==='RESOLVED')for(const r of exact.records)literal.push({record:r,id:span,score:1});}
    if(literal.length){const h=literal[0];return{status:'RESOLVED',id:U(h.id),type:targetType,confidence:1,record:h.record,records:[h.record],names:h.record.aliasValues,surface:h.id,source:'EXACT_ID'};}
    const knowledge=allKnownEntities(this.knowledge).filter(x=>x.type===targetType),kh=[];for(const e of knowledge)for(const name of e.names){const score=this.textScore(query,name);if(score>=.82)kh.push({id:e.id,type:e.type,confidence:score,surface:name,names:e.names,source:'KNOWLEDGE_JSON'});}
    const dataHits=this.textCandidates(query,targetType);const candidates=[...kh.map(x=>({...x,record:null})),...dataHits.filter(x=>x.record.identityValues.length).map(x=>({id:x.record.identityValues[0],type:x.record.entityType==='UNKNOWN'?targetType:x.record.entityType,confidence:x.score,surface:x.record.aliasValues[0]||x.record.identityValues[0],names:x.record.aliasValues,record:x.record,source:x.source}))];candidates.sort((a,b)=>b.confidence-a.confidence||S(b.surface).length-S(a.surface).length);
    if(!candidates.length)return{status:'UNRESOLVED',id:null,type:targetType,confidence:0,candidates:[]};const best=candidates[0],second=candidates.find(x=>x.id!==best.id),policy=ir?.ambiguityPolicy||this.knowledge?.ambiguity_policy||{},min=Number(policy.minimum_confidence||.82),margin=Number(policy.margin_over_second_best||.08);if(best.confidence<min||(second&&best.confidence-second.confidence<margin))return{status:'AMBIGUOUS',id:null,type:targetType,confidence:Number(best.confidence.toFixed(3)),candidates:candidates.slice(0,8).map(x=>({id:x.id,score:Number(x.confidence.toFixed(3)),type:x.type,dataset:x.record?.dataset||null,locator:x.record?.locator||null,surface:x.surface}))};const record=best.record||(this.idRegistry.get(U(best.id))||[])[0]||null;return{status:'RESOLVED',id:U(best.id),type:targetType,confidence:Number(best.confidence.toFixed(3)),surface:best.surface,names:A(best.names),record,records:record?[record]:[],source:best.source};
  }
  normalizeIR(ir){const q=O(ir)?JSON.parse(JSON.stringify(ir)):{};q.operation=U(q.operation||'GET');q.property=normalizeProperty(q.property||q.requested_output||'');q.entities=O(q.entities)?q.entities:{};q.relationPath=A(q.relationPath||q.relation_path||[]);q.relationHints=A(q.relationHints||q.relations||[]);q.conditions=A(q.conditions);q.constraints=A(q.constraints||q.conditions);q.targets=A(q.targets);q.temporalScope=q.temporalScope||q.time_horizon||q.context?.time_horizon||'CURRENT';return q;}
  findEntityTypes(ir){const out=[];for(const [key,val] of Object.entries(O(ir?.entities)?ir.entities:{}))if(O(val)&&S(val.id))out.push({slot:key,type:U(val.type||key),id:U(val.id)});if(out.length)return out;return O(ir?.subject)&&S(ir.subject.id)?[{slot:'subject',type:U(ir.subject.type||'UNKNOWN'),id:U(ir.subject.id)}]:[];}
  searchPlan(ir,resolved){const raw=N(ir?.raw||ir?.normalized||ir?.question||''),property=normalizeProperty(ir?.property||ir?.requested_output),operation=U(ir?.operation||'GET');const entities=resolved.map(e=>({type:U(e.type),id:U(e.id)}));const capabilities=[...this.propertyRegistry.values()].filter(p=>!property||U(p.capability)===property).map(p=>({dataset:p.dataset,capability:p.capability,mapping:p.mapping,entityTypes:A(p.metadata?.entityTypes),recordLocator:p.metadata?.recordLocator||null}));return{order:['EXACT_ID','SEMANTIC_ALIAS','CANONICAL_ID','CAPABILITY','ENTITY_COMPATIBILITY','SCHEMA_COMPATIBILITY','RECORD_LOCATOR','RELATION_PATH','FIELD_MAPPING','DETERMINISTIC_OPERATION','VALIDATION','EVIDENCE'],identity:{entities,raw},dataset:{property,operation,candidates:capabilities},relation:{hints:ir?.relationHints||[],strategy:'RELATION_REGISTRY_AND_INDEXED_EDGES'},record:{strategy:'TYPE_SCOPED_ID -> RELATION_PATH -> ALIAS_MATCH'},field:{property,strategy:'EXPLICIT_METADATA -> UNIQUE_SCHEMA_CANDIDATE -> FAIL_CLOSED'},operation:{name:operation},temporal:{scope:ir?.temporalScope||'CURRENT'}};}
  datasetSuitability(entry,resolved,ir,prop){let score=0;const types=A(entry.entityTypes).map(U),resolvedTypes=resolved.map(e=>U(e.type));if(resolvedTypes.length&&resolvedTypes.every(t=>types.includes(t)))score+=35;else if(resolvedTypes.some(t=>types.includes(t)))score+=15;const caps=A(entry.capabilities).map(U);if(prop&&caps.includes(prop))score+=100;if(U(ir?.operation||'GET')==='COUNT'&&entry.recordLocator)score+=5;if(entry.authority==='EXPLICIT_METADATA')score+=10;const schema=this.schemaRegistry.get(entry.datasetId),rawTokens=N(ir?.raw||ir?.normalized||'').split(/\s+/).filter(x=>x.length>2);for(const f of A(schema?.fields)){const fp=normalizeProperty(f.path),fk=normalizeProperty(f.key);if(prop&&(fp.includes(prop)||fk.includes(prop)))score+=20;for(const token of rawTokens){const nt=normalizeProperty(token);if(nt&&((fp&&fp.includes(nt))||(fk&&fk.includes(nt))))score+=3;}}return score;}
  planDatasets(ir,resolved){const candidates=[],requestedProp=normalizeProperty(ir.property||ir.requested_output),raw=N(ir.raw||ir.normalized||'');for(const p of this.propertyRegistry.values()){let score=0;const entry=this.catalog.get(p.dataset)||this.catalog.list().find(e=>N(e.name)===N(p.dataset)||N(e.datasetId)===N(p.dataset));if(requestedProp&&requestedProp===U(p.capability))score+=100;if(U(ir.operation||'GET')===U(p.capability))score+=30;const terms=[...Object.values(p.mapping||{}),p.capability.replace(/_/g,' ')].filter(x=>typeof x==='string').map(N);for(const term of terms)if(term&&raw.includes(term))score=Math.max(score,70);if(entry)score+=this.datasetSuitability(entry,resolved,ir,requestedProp);if(score)candidates.push({...p,score,logicalDataset:entry?.logicalDatasetId||p.dataset});}
    for(const entry of this.catalog.list()){const suit=this.datasetSuitability(entry,resolved,ir,requestedProp);if(suit>0&&!candidates.some(c=>N(c.dataset)===N(entry.name)))candidates.push({dataset:entry.name,capability:requestedProp||U(ir.operation||'GET'),metadata:datasetMetadata(this.knowledge,entry.name)||entry,mapping:{},score:suit,source:'CATALOG_SCHEMA_DISCOVERY',logicalDataset:entry.logicalDatasetId||entry.datasetId});}
    return candidates.sort((a,b)=>b.score-a.score||String(a.dataset).localeCompare(String(b.dataset)));
  }
  locateRecords(entity,datasetId){const wanted=new Set([U(entity.id),...A(entity.names).map(U)].filter(Boolean)),out=new Map();for(const id of wanted)for(const r of this.idRegistry.get(id)||[])if(N(r.dataset)===N(datasetId))out.set(`${r.dataset}::${r.locator}`,r);for(const alias of A(entity.names))for(const hit of this.aliasRegistry.get(N(alias))||[])if(N(hit.record.dataset)===N(datasetId))out.set(`${hit.record.dataset}::${hit.record.locator}`,hit.record);if(entity.record&&N(entity.record.dataset)===N(datasetId))out.set(`${entity.record.dataset}::${entity.record.locator}`,entity.record);return[...out.values()];}
  relationEdges(defId){return A(this.relationRegistry.get(U(defId))?.edges);}
  findRelationPath(from,to,maxDepth=4){const start=U(from),goal=U(to);if(start===goal)return[];const defs=[...this.relationRegistry.values()],queue=[{type:start,path:[]}],seen=new Set([start]);while(queue.length){const node=queue.shift();if(node.path.length>=maxDepth)continue;for(const d of defs){if(U(d.from||d.fromType)!==node.type)continue;const nt=U(d.to||d.toType),next=[...node.path,U(d.id)];if(nt===goal)return next;if(!seen.has(nt)){seen.add(nt);queue.push({type:nt,path:next});}}}return[];}
  traverse(start,relationId,targetType){const def=this.relationRegistry.get(U(relationId));if(!def)return{status:'RELATION_NOT_FOUND',records:[],edges:[]};const allowedTarget=U(targetType||def.to||def.toType||''),startRecords=A(start?.records).length?start.records:(start?.record?[start.record]:[]),seeds=startRecords.length?startRecords:this.records.filter(r=>A(start?.ids||[start?.id]).map(U).some(id=>r.identityValues.includes(id))),startKeys=new Set(seeds.map(r=>`${r.dataset}::${r.locator}`)),matched=[],seen=new Set();for(const edge of A(def.edges)){if(!startKeys.has(`${edge.fromDataset}::${edge.fromLocator}`))continue;const target=this.recordByLocator.get(`${edge.toDataset}::${edge.toLocator}`);if(!target)continue;if(allowedTarget&&target.entityType!=='UNKNOWN'&&U(target.entityType)!==allowedTarget)continue;const key=`${target.dataset}::${target.locator}`;if(!seen.has(key)){seen.add(key);matched.push(target);}}return{status:matched.length?'OK':'NO_MATCH',records:matched,edges:A(def.edges).filter(e=>startKeys.has(`${e.fromDataset}::${e.fromLocator}`))};}
  recordContainsEntity(record,entity){if(!record||!entity)return false;const ids=new Set([U(entity.id),...A(entity.names).map(U)].filter(Boolean));if(record.identityValues.some(v=>ids.has(U(v))))return true;if(record.aliasValues.some(v=>ids.has(U(v))))return true;return record.fields.some(f=>scalar(f.value)&&ids.has(U(f.value)));}
  resolveField(record,plan,ir){const mapping=plan?.mapping||{};for(const p of [mapping.valuePath,mapping.fieldPath,mapping.fieldName,mapping.field,mapping.key]){if(!S(p))continue;const v=pathRead(record.value,p);if(v!==undefined)return{value:v,path:S(p),method:'EXPLICIT_METADATA'};}const property=normalizeProperty(ir?.property||plan?.capability),schema=this.schemaRegistry.get(record.dataset),candidates=[];for(const f of A(schema?.fields)){const fp=normalizeProperty(f.path),fk=normalizeProperty(f.key);let score=0;if(property&&(fp===property||fk===property))score+=100;if(property&&(fp.includes(property)||property.includes(fp)))score+=30;if(score)candidates.push({path:f.path,score});}candidates.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));const uniquePaths=[...new Map(candidates.map(x=>[x.path,x])).values()];if(uniquePaths.length===1){const v=pathRead(record.value,uniquePaths[0].path);if(v!==undefined)return{value:v,path:uniquePaths[0].path,method:'SCHEMA_DISCOVERY'};}if(!property){const scalarCandidates=A(schema?.fields).filter(f=>A(f.types).some(t=>['number','boolean','string'].includes(t)));const exactLeaf=scalarCandidates.filter(f=>pathRead(record.value,f.path)!==undefined);if(exactLeaf.length===1)return{value:pathRead(record.value,exactLeaf[0].path),path:exactLeaf[0].path,method:'UNIQUE_SCHEMA_LEAF'};}return null;}
  flattenNumbers(v){if(Array.isArray(v))return v.flatMap(x=>this.flattenNumbers(x));if(typeof v==='number'&&Number.isFinite(v))return[v];if(O(v))return Object.values(v).flatMap(x=>this.flattenNumbers(x));return[];}
  canonicalValue(v){try{return JSON.stringify(v);}catch(_){return S(v);}}
  compare(a,b){const na=this.flattenNumbers(a),nb=this.flattenNumbers(b);if(na.length===1&&nb.length===1)return na[0]-nb[0];return this.canonicalValue(a).localeCompare(this.canonicalValue(b));}
  applyConditions(records,conditions){let out=records.slice();for(const c of A(conditions)){if(!O(c))continue;const op=U(c.operator||c.op||'EQ'),path=S(c.fieldPath||c.field||c.path),wanted=c.value;out=out.filter(r=>{const actual=pathRead(r.value,path);if(op==='EXISTS')return actual!==undefined;if(op==='NOT_EXISTS')return actual===undefined;if(op==='EQ'||op==='=')return this.canonicalValue(actual)===this.canonicalValue(wanted);if(op==='NE'||op==='!=')return this.canonicalValue(actual)!==this.canonicalValue(wanted);if(op==='GT'||op==='>')return this.compare(actual,wanted)>0;if(op==='GTE'||op==='>=')return this.compare(actual,wanted)>=0;if(op==='LT'||op==='<')return this.compare(actual,wanted)<0;if(op==='LTE'||op==='<=' )return this.compare(actual,wanted)<=0;if(op==='IN')return A(wanted).some(x=>this.canonicalValue(x)===this.canonicalValue(actual));if(op==='CONTAINS')return N(actual).includes(N(wanted));return false;});}return out;}
  applyOperation(op,values,records){const operation=U(op||'GET'),nums=values.flatMap(v=>this.flattenNumbers(v));if(operation==='IDENTIFY')return values.length?values[0]:null;if(operation==='GET'||operation==='QUANTITY')return values.length===1?values[0]:values;if(operation==='COUNT')return values.length;if(['TOTAL','SUM'].includes(operation))return nums.reduce((a,b)=>a+b,0);if(operation==='AVERAGE')return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;if(operation==='MIN')return nums.length?Math.min(...nums):null;if(operation==='MAX')return nums.length?Math.max(...nums):null;if(operation==='DISTINCT')return[...new Set(values.map(v=>this.canonicalValue(v)))].map(v=>JSON.parse(v));if(['LIST','SELECT','PROJECT'].includes(operation))return values;if(operation==='EXISTS')return values.length>0;if(operation==='SORT'){const paired=records.map((r,i)=>({r,v:values[i]}));return paired.sort((a,b)=>this.compare(a.v,b.v)).map(x=>x.r.value);}if(operation==='COMPARE'){if(values.length<2)return null;return{difference:this.compare(values[0],values[1]),left:values[0],right:values[1]};}if(operation==='RANK')return values.map((v,i)=>({value:v,index:i})).sort((a,b)=>this.compare(b.value,a.value)).map((x,i)=>({rank:i+1,value:x.value}));if(operation==='GROUP'){const groups=new Map();for(const v of values){const k=this.canonicalValue(v);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v);}return[...groups.entries()].map(([key,items])=>({key:JSON.parse(key),count:items.length,values:items}));}throw new Error(`Unsupported deterministic operation: ${operation}`);}
  validate(result,extracted,plan,ir){if(result===undefined)return{ok:false,status:'VALIDATION_FAILED',reason:'UNDEFINED_RESULT'};if(A(extracted).length===0&&!['EXISTS','COUNT'].includes(U(ir?.operation||'GET')))return{ok:false,status:'VALIDATION_FAILED',reason:'NO_EXTRACTED_VALUES'};if(plan?.mapping?.requestedValueType==='SCALAR'&&O(result))return{ok:false,status:'VALIDATION_FAILED',reason:'EXPECTED_SCALAR'};return{ok:true,status:'VALIDATED'};}
  evidence(x){return{dataset:x.dataset||null,logicalDataset:x.logicalDataset||x.dataset||null,physicalPath:x.physicalPath||x.record?.fileEntry?.physicalPath||null,recordLocator:x.recordLocator??x.record?.locator??null,fieldPath:x.fieldPath??null,canonicalEntityId:x.canonicalEntityId||null,property:x.property||null,rawValue:x.rawValue,operation:x.operation||null,relationPath:A(x.relationPath),authority:x.authority||null,source:x.source||null};}
  fail(status,details={}){return{ok:false,status,value:null,evidence:[],...details};}
  execute(rawIR,datasets=[],language='en',ctx={}){
    this.ensure(datasets);const ir=this.normalizeIR(rawIR);if(!ir.raw)ir.raw=ir.question||ir.normalized||'';
    const entitySlots=this.findEntityTypes(ir),country=this.resolveEntity(ir,'COUNTRY'),resource=this.resolveEntity(ir,'RESOURCE'),identityResults={country,resource},resolved=[];
    for(const x of [country,resource]){if(x.status==='RESOLVED')resolved.push(x);else if(x.status==='AMBIGUOUS')return this.fail('AMBIGUOUS_IDENTITY',{semantic:ir,diagnostics:identityResults});}
    for(const e of entitySlots){if(resolved.some(x=>U(x.id)===U(e.id)))continue;const exact=this.exactId(e.id,U(e.type));if(exact.status==='RESOLVED')resolved.push({status:'RESOLVED',id:U(e.id),type:U(e.type),confidence:1,record:exact.records[0],records:exact.records,names:exact.records[0].aliasValues});else if(exact.status==='AMBIGUOUS')return this.fail('AMBIGUOUS_IDENTITY',{semantic:ir,entityId:e.id});}
    if(!resolved.length)return this.fail('IDENTITY_NOT_FOUND',{semantic:ir,diagnostics:identityResults});
    const plans=this.planDatasets(ir,resolved);if(!plans.length)return this.fail('DATASET_NOT_FOUND',{semantic:ir,entities:resolved.map(x=>({type:x.type,id:x.id})),search:this.searchPlan(ir,resolved)});
    let primary=resolved.find(x=>ir.subject?.id&&U(x.id)===U(ir.subject.id))||resolved[0],records=[],relationPath=[],attemptedPlans=[],selected=null,datasetSelected=null;
    for(const candidate of plans){const dataset=this.catalog.get(candidate.dataset)||this.catalog.get(candidate.metadata?.dataset);if(!dataset)continue;let candidateRecords=this.locateRecords(primary,dataset.datasetId),candidateRelationPath=[];
      if(resolved.length>1)for(const targetEntity of resolved.filter(x=>x!==primary)){const p=this.findRelationPath(primary.type,targetEntity.type);if(p.length){candidateRelationPath=p;let frontier=[...candidateRecords];for(const rel of p){const next=[];for(const rec of frontier){const tr=this.traverse({record:rec,records:[rec],id:rec.identityValues[0],ids:rec.identityValues,names:rec.aliasValues},rel,targetEntity.type);next.push(...tr.records);}frontier=[...new Map(next.map(r=>[`${r.dataset}::${r.locator}`,r])).values()];}if(frontier.length)candidateRecords=frontier;}
        }
      if(resolved.length>1)candidateRecords=candidateRecords.filter(r=>resolved.filter(x=>x!==primary).every(e=>this.recordContainsEntity(r,e)));
      if(candidateRecords.length){records=candidateRecords;selected=candidate;datasetSelected=dataset;relationPath=candidateRelationPath;break;}
      attemptedPlans.push({dataset:candidate.dataset,status:'NO_MATCHING_RECORDS'});
    }
    selected=selected||plans[0];datasetSelected=datasetSelected||(selected?this.catalog.get(selected.dataset)||this.catalog.get(selected.metadata?.dataset):null);if(!records.length&&datasetSelected)records=this.locateRecords(primary,datasetSelected.datasetId);if(!records.length)return this.fail('RECORD_NOT_FOUND',{semantic:ir,entity:{type:primary.type,id:primary.id},plan:selected,relationPath,attemptedPlans});
    records=this.applyConditions(records,ir.conditions);if(!records.length)return this.fail('RECORD_NOT_FOUND',{semantic:ir,reason:'FILTER_ELIMINATED_ALL_RECORDS',plan:selected});
    if(ir.operation==='COUNT'||ir.operation==='EXISTS'){const value=ir.operation==='COUNT'?records.length:true,ev=records.slice(0,100).map(r=>this.evidence({dataset:r.dataset,logicalDataset:selected.logicalDataset||selected.dataset,record:r,canonicalEntityId:primary.id,operation:ir.operation,relationPath,authority:'RECORD_SET',source:r.fileEntry?.source||selected.source||null}));return{ok:true,status:'VERIFIED_FACT',language,targetDomain:primary.type,operation:ir.operation,entity:{type:primary.type,id:primary.id},entities:resolved.map(x=>({type:x.type,id:x.id})),value,evidence:ev,source:'OMEGA_DEEP_CORE',search:this.searchPlan(ir,resolved),plan:{capability:selected.capability,dataset:selected.dataset,logicalDataset:selected.logicalDataset||selected.dataset,recordLocators:records.map(r=>r.locator),relationPath,candidates:plans.slice(0,12)},trace:[{stage:'QUERY_IR',status:'READY'},{stage:'IDENTITY_RESOLUTION',status:'RESOLVED',ids:resolved.map(x=>x.id)},{stage:'DATASET_DISCOVERY',dataset:selected.dataset,score:selected.score},{stage:'RECORD_DISCOVERY',count:records.length},{stage:'RELATION_TRAVERSAL',path:relationPath},{stage:'DETERMINISTIC_OPERATION',operation:ir.operation},{stage:'VALIDATION',status:'VALIDATED'},{stage:'EVIDENCE',count:ev.length}]};}
    const extracted=[];for(const r of records){const field=this.resolveField(r,selected,ir);if(field)extracted.push({record:r,field});}if(!extracted.length)return this.fail('FIELD_NOT_FOUND',{semantic:ir,plan:selected,recordLocators:records.map(r=>r.locator),schema:this.schemaRegistry.get(datasetSelected?.datasetId||selected?.dataset)||null,search:this.searchPlan(ir,resolved)});
    let value;try{value=this.applyOperation(ir.operation,extracted.map(x=>x.field.value),extracted.map(x=>x.record));}catch(e){return this.fail('OPERATION_UNSUPPORTED',{operation:ir.operation,error:e.message,semantic:ir});}
    const authorityDatasetCount=new Set(extracted.map(x=>x.record.fileEntry?.physicalPath||x.record.dataset)).size;if(authorityDatasetCount>1&&['GET','QUANTITY'].includes(ir.operation)){const sourceValues=extracted.map(x=>this.canonicalValue(x.field.value));if(new Set(sourceValues).size>1)return this.fail('SOURCE_CONFLICT',{semantic:ir,property:ir.property,values:extracted.map(x=>x.field.value),evidence:extracted.map(x=>this.evidence({dataset:x.record.dataset,record:x.record,fieldPath:x.field.path,canonicalEntityId:primary.id,property:ir.property,rawValue:x.field.value,operation:ir.operation,authority:x.field.method}))});}
    const validation=this.validate(value,extracted,selected,ir);if(!validation.ok)return this.fail(validation.status,{reason:validation.reason,semantic:ir,plan:selected});
    const ev=extracted.map(x=>this.evidence({dataset:x.record.dataset,logicalDataset:selected.logicalDataset||selected.dataset,record:x.record,fieldPath:x.field.path,canonicalEntityId:primary.id,property:ir.property||selected.capability,rawValue:x.field.value,operation:ir.operation,relationPath,authority:x.field.method,source:x.record.fileEntry?.source||selected.source||null}));
    return{ok:true,status:'VERIFIED_FACT',language,targetDomain:primary.type,operation:ir.operation,entity:{type:primary.type,id:primary.id},entities:resolved.map(x=>({type:x.type,id:x.id})),value,evidence:ev,source:'OMEGA_DEEP_CORE',search:this.searchPlan(ir,resolved),plan:{capability:selected.capability,dataset:selected.dataset,logicalDataset:selected.logicalDataset||selected.dataset,recordLocators:records.map(r=>r.locator),relationPath,candidates:plans.slice(0,12)},trace:[{stage:'QUERY_IR',status:'READY'},{stage:'IDENTITY_RESOLUTION',status:'RESOLVED',ids:resolved.map(x=>x.id)},{stage:'DATASET_DISCOVERY',dataset:selected.dataset,score:selected.score},{stage:'RECORD_DISCOVERY',count:records.length},{stage:'RELATION_TRAVERSAL',path:relationPath},{stage:'FIELD_RESOLUTION',count:extracted.length,methods:[...new Set(extracted.map(x=>x.field.method))]},{stage:'DETERMINISTIC_OPERATION',operation:ir.operation},{stage:'VALIDATION',status:validation.status},{stage:'EVIDENCE',count:ev.length}]};
  }
  buildExecutionPlan(rawIR,datasets=[],ctx={}){this.ensure(datasets);const ir=this.normalizeIR(rawIR),country=this.resolveEntity(ir,'COUNTRY'),resource=this.resolveEntity(ir,'RESOURCE'),entities=[country,resource].filter(x=>x.status==='RESOLVED'),candidates=this.planDatasets(ir,entities),relationPaths=[];for(let i=0;i<entities.length;i++)for(let j=i+1;j<entities.length;j++){const p=this.findRelationPath(entities[i].type,entities[j].type);if(p.length)relationPaths.push({from:entities[i].type,to:entities[j].type,path:p});}return{contract:'OMEGA-QUERY-IR-v3',status:country.status==='AMBIGUOUS'||resource.status==='AMBIGUOUS'?'AMBIGUOUS_IDENTITY':entities.length?(candidates.length?'PLANNED':'UNPLANNABLE_NO_DATASET'):'IDENTITY_NOT_FOUND',query:{raw:ir.raw,operation:ir.operation,property:ir.property,temporalScope:ir.temporalScope,conditions:ir.conditions,targets:ir.targets},entities:entities.map(x=>({type:x.type,id:x.id,confidence:x.confidence})),datasetCandidates:candidates.slice(0,12).map(x=>({dataset:x.dataset,capability:x.capability,score:x.score,mapping:x.mapping,source:x.source||'METADATA'})),relationPaths,search:this.searchPlan(ir,entities)};}
  evidenceLedger(result){return{status:result?.status||'UNRESOLVED',facts:A(result?.evidence),trace:A(result?.trace),search:A(result?.search),calculations:A(result?.calculations),uncertainties:A(result?.uncertainties),provenance:{source:'OMEGA_DEEP_CORE',entities:result?.entities||[],dataset:result?.plan?.dataset||null,recordLocators:A(result?.plan?.recordLocators),relationPath:A(result?.plan?.relationPath),operation:result?.operation||null}};}
  catalogView(){return this.catalog.list().map(e=>({datasetId:e.datasetId,name:e.name,physicalPath:e.physicalPath,bytes:e.bytes,modifiedAt:e.modifiedAt,hash:e.hash,parseStatus:e.parseStatus,rootShape:e.rootShape,rootKeys:e.rootKeys,capabilities:e.capabilities,identityFields:e.identityFields||[],recordLocator:e.recordLocator||null,recordKeyIsIdentity:e.recordKeyIsIdentity===true,entityTypes:e.entityTypes||[],recordCount:this.records.filter(r=>r.dataset===e.datasetId).length}));}
  lookupId(id){const r=this.exactId(id);return{...r,records:r.records.map(x=>({dataset:x.dataset,physicalPath:x.fileEntry?.physicalPath,locator:x.locator,entityType:x.entityType,identityValues:x.identityValues,aliases:x.aliasValues.slice(0,30)}))};}
  schema(datasetName){return this.schemaRegistry.get(N(datasetName))||null;}
  report(){return{ok:true,version:VERSION,initialized:this.initialized,rootDir:this.rootDir,collectionVersion:this.collectionVersion,catalog:{files:this.catalog.order.length,parsed:this.catalog.order.filter(x=>x.parseStatus==='PARSE_OK'||x.parseStatus==='RUNTIME_INPUT').length,errors:this.catalog.order.filter(x=>x.parseStatus==='PARSE_ERROR').length},collection:{datasets:this.datasets.size,records:this.records.length,uniqueIds:this.idRegistry.size,aliases:this.aliasRegistry.size,scalarValues:this.scalarIndex.size},registries:{schemas:this.schemaRegistry.size,properties:this.propertyRegistry.size,relations:this.relationRegistry.size},lastCollection:this.lastCollection};}
  indexView(){return{report:this.report(),files:this.catalogView(),records:this.records.map(r=>({dataset:r.dataset,locator:r.locator,entityType:r.entityType,identities:r.identityValues,names:r.aliasValue?.slice?.(0,20)||r.aliasValues.slice(0,20),fields:r.fields.map(f=>f.path)})),relations:[...this.relationRegistry.values()].map(r=>({...r,edges:A(r.edges).map(e=>({...e}))}))};}
  refresh(){return this.collectDatasets([]);}
  lookupText(q,type=null){return this.textCandidates(q,type);}
}

let runtime=null;
function getRuntime(){if(!runtime)runtime=new DeepRepositoryRuntime();return runtime;}
if(global.process?.cwd&&mods().fs){try{runtime=new DeepRepositoryRuntime({rootDir:global.process.cwd()});runtime.initialize?runtime.initialize({rootDir:global.process.cwd(),discover:true}):runtime.collectDatasets([]);}catch(_){runtime=new DeepRepositoryRuntime();}}
function initializeRepository(options={}){runtime=new DeepRepositoryRuntime(options);return runtime.collectDatasets(options.datasets||[]);}
function ensureRepository(datasets=[]){return getRuntime().ensure(datasets);}
function execute(ir,datasets=[],language='en',ctx={}){return getRuntime().execute(ir,datasets,language,ctx);}
function buildExecutionPlan(ir,datasets=[],ctx={}){return getRuntime().buildExecutionPlan(ir,datasets,ctx);}
function buildEvidenceLedger(result){return getRuntime().evidenceLedger(result);}
function lookupId(id){ensureRepository();return getRuntime().lookupId(id);}
function catalog(){ensureRepository();return getRuntime().catalogView();}
function diagnostics(){ensureRepository();return getRuntime().report();}
function schema(dataset){ensureRepository();return getRuntime().schema(dataset);}
function indexView(){ensureRepository();return getRuntime().indexView();}
function refresh(){return getRuntime().refresh();}
function searchPlan(ir,datasets=[],ctx={}){ensureRepository(datasets);return getRuntime().searchPlan(getRuntime().normalizeIR(ir),[]);}
function resolveResources(q){ensureRepository();return getRuntime().lookupText(q,'RESOURCE').slice(0,20).map(x=>({id:x.record.identityValues[0]||null,type:x.record.entityType,name:x.record.aliasValues[0]||null,dataset:x.record.dataset,locator:x.record.locator,score:x.score}));}
function traverse(start,relationId,targetType){ensureRepository();return getRuntime().traverse(start,relationId,targetType);}
function securityFor(country,re){return execute({raw:`${country?.names?.[0]||country?.id||''} ${re?.names?.[0]||re?.id||''}`,entities:{country:country?{id:country.id,type:'COUNTRY',names:country.names}:null,resource:re?{id:re.id,type:'RESOURCE',names:re.names}:null},property:'RESOURCE_SECURITY',operation:'GET'},[],'en',{});}
const api={VERSION,initializeRepository,ensureRepository,execute,buildExecutionPlan,buildEvidenceLedger,lookupId,catalog,diagnostics,schema,indexView,refresh,searchPlan,resolveResources,traverse,securityFor,composeAnswer:a=>a?.text||'',realizeVerb:(subject,verb)=>S(verb),getRuntime};
global.OfflineQueryEngine=api;global.OmegaDeepCoreRuntime=getRuntime();if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
