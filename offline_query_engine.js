/*
 * OMEGA DEEP CORE v13.0.0
 * Deterministic repository data-ingestion, indexing, navigation and evidence runtime.
 *
 * Principles:
 *   File Entry -> Data Collection -> Registries -> Query Plan -> Deterministic Execution -> Evidence
 *
 * Domain facts, dataset names, entity names, aliases, field meanings, relations and
 * simulation values are read from repository data and metadata. This file contains
 * generic mechanics only.
 */
(function(global){
'use strict';

const VERSION = '13.0.0';
const A = v => Array.isArray(v) ? v : [];
const O = v => v !== null && typeof v === 'object';
const S = v => String(v == null ? '' : v).trim();
const N = v => S(v).normalize('NFKC').toLowerCase()
  .replace(/[?!,.:;"'“”‘’(){}[\]<>—–/\\]/g, ' ')
  .replace(/\s+/g, ' ').trim();
const U = v => S(v).toUpperCase();
const has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);

function nodeBuiltIn(name){
  try{
    const p = global.process;
    if(p?.getBuiltinModule) return p.getBuiltinModule(name);
    return null;
  }catch(_){ return null; }
}

function nodeModules(){
  return { fs: nodeBuiltIn('fs'), path: nodeBuiltIn('path'), crypto: nodeBuiltIn('crypto') };
}

function readLocalJSON(filePath){
  try{
    const {fs} = nodeModules();
    if(!fs || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath,'utf8'));
  }catch(_){ return null; }
}

function stableHash(text){
  try{
    const {crypto} = nodeModules();
    if(crypto?.createHash) return crypto.createHash('sha256').update(String(text)).digest('hex');
  }catch(_){ }
  return null;
}

function normalizeRelative(filePath, rootDir){
  const {path} = nodeModules();
  if(path){
    const rel = path.relative(rootDir, filePath).replace(/\\/g,'/');
    return rel || path.basename(filePath);
  }
  return S(filePath).replace(/^\.\//,'');
}

function walkJSONFiles(rootDir){
  const {fs,path} = nodeModules();
  if(!fs || !path) return [];
  const out = [];
  const blocked = new Set(['node_modules','.git','.github','.cache','dist','build']);
  const walk = dir => {
    let entries = [];
    try{ entries = fs.readdirSync(dir,{withFileTypes:true}); }catch(_){ return; }
    for(const entry of entries){
      const full = path.join(dir,entry.name);
      if(entry.isDirectory()){
        if(blocked.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if(!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if(!lower.endsWith('.json') && !lower.endsWith('.geojson')) continue;
      out.push(full);
    }
  };
  walk(rootDir);
  return out.sort((a,b)=>a.localeCompare(b));
}

function knowledge(){
  return global.OmegaOfflineSemanticKnowledge ||
    global.OmegaSemanticKnowledge ||
    (() => {
      const {path} = nodeModules();
      const root = global.process?.cwd ? global.process.cwd() : '.';
      return path ? readLocalJSON(path.join(root,'offline_semantic_knowledge.json')) || {} : {};
    })();
}

function metadataEntries(k){
  const out = [];
  for(const d of A(k?.data_finding?.dataset_capabilities)){
    if(!O(d)) continue;
    for(const cap of A(d.capabilities)){
      const key = S(cap);
      const mapping = d.fieldMappings?.[key] || d.fieldMappings?.[U(key)] || {};
      out.push({ dataset:S(d.dataset), capability:U(key), metadata:d, mapping });
    }
  }
  return out;
}

function relationDefs(k){ return A(k?.relations || k?.relationship_registry || k?.relationshipRegistry); }
function identityDescriptors(k){ return A(k?.identity_descriptors || k?.schema?.identity_descriptors); }
function nameDescriptors(k){ return A(k?.identity_name_fields || k?.schema?.name_fields); }
function entityTypeDescriptors(k){ return A(k?.entity_types || k?.schema?.entity_types).map(U); }

function pathRead(root,p){
  if(p == null || S(p)==='') return root;
  let cur = root;
  const clean = S(p).replace(/^\$\.?/,'').replace(/\[([^\]]+)\]/g,'.$1');
  for(const part of clean.split('.').filter(Boolean)){
    if(cur == null) return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(part) ? cur[Number(part)] : cur[part];
  }
  return cur;
}

function scalar(v){ return v === null || ['string','number','boolean'].includes(typeof v); }

function scalarEntries(value,path='',out=[]){
  if(value == null) return out;
  if(Array.isArray(value)){
    value.forEach((v,i)=>scalarEntries(v,`${path}[${i}]`,out));
    return out;
  }
  if(!O(value)) return out;
  for(const [key,v] of Object.entries(value)){
    const p = path ? `${path}.${key}` : key;
    if(scalar(v)) out.push({key,path:p,value:v,type:v===null?'null':typeof v});
    else scalarEntries(v,p,out);
  }
  return out;
}

function inferRootShape(raw){
  if(Array.isArray(raw)) return 'ARRAY';
  if(O(raw)) return 'OBJECT';
  return 'SCALAR';
}

function typeFromRecordValue(value, datasetMeta, k){
  const hinted = A(value?.entityTypes || value?.entity_types).map(U);
  const valid = entityTypeDescriptors(k);
  const match = hinted.find(x=>valid.length===0 || valid.includes(x));
  if(match) return match;
  const types = A(datasetMeta?.entityTypes).map(U);
  if(types.length===1) return types[0];
  return 'UNKNOWN';
}

function descriptorValues(value, descriptors){
  const out=[];
  for(const d of descriptors){
    const field=S(typeof d==='string' ? d : (d?.field || d?.path));
    if(!field) continue;
    const v=pathRead(value,field);
    if(scalar(v) && S(v)) out.push(S(v));
    else if(Array.isArray(v)) for(const x of v) if(scalar(x) && S(x)) out.push(S(x));
  }
  return [...new Set(out)];
}

function identifierShapeScore(v){
  const text=S(v);
  if(!text || text.length>128 || /\s{2,}/.test(text)) return 0;
  let score=0;
  if(/^[A-Z0-9][A-Z0-9._:-]{1,63}$/.test(text)) score += 2;
  if(/[_:-]/.test(text)) score += 1;
  if(/\d/.test(text)) score += 0.5;
  if(text.length<=64) score += 0.25;
  return score;
}

function aliasValues(record,key,descriptorNames){
  const out=[];
  for(const v of descriptorNames) out.push({value:S(v),source:'METADATA'});
  if(key && !/^\d+$/.test(S(key))) out.push({value:S(key).replace(/[_-]+/g,' '),source:'OBJECT_KEY'});
  for(const f of scalarEntries(record)){
    if(typeof f.value !== 'string') continue;
    const value=S(f.value);
    if(!value || value.length>240) continue;
    out.push({value,source:'SCALAR_FIELD',fieldPath:f.path});
  }
  const seen=new Set();
  return out.filter(x=>{const k=N(x.value);if(!k||seen.has(k))return false;seen.add(k);return true;});
}

function datasetMetadata(k,datasetName){
  const all=metadataEntries(k).filter(x=>N(x.dataset)===N(datasetName));
  if(!all.length) return null;
  const merged={dataset:datasetName,capabilities:[],fieldMappings:{},entityTypes:[],identityFields:[],recordLocator:null,recordKeyIsIdentity:false};
  for(const m of all){
    if(!merged.capabilities.includes(m.capability)) merged.capabilities.push(m.capability);
    if(O(m.mapping)) merged.fieldMappings[m.capability]=m.mapping;
    for(const t of A(m.metadata.entityTypes)) if(!merged.entityTypes.includes(t)) merged.entityTypes.push(t);
    for(const f of A(m.metadata.identityFields)) if(!merged.identityFields.includes(f)) merged.identityFields.push(f);
    if(m.metadata.recordLocator && !merged.recordLocator) merged.recordLocator=m.metadata.recordLocator;
    if(m.metadata.recordKeyIsIdentity===true) merged.recordKeyIsIdentity=true;
  }
  return merged;
}

function makeRecord(raw,path,key,datasetName,k,datasetMeta,parentKind){
  const names=aliasValues(raw,key,descriptorValues(raw,nameDescriptors(k)));
  return {
    dataset:datasetName, locator:path, key, value:raw, parentKind:parentKind||null,
    entityType:typeFromRecordValue(raw,datasetMeta,k), identities:[], identityValues:[],
    aliases:names, aliasValues:names.map(x=>x.value), fields:scalarEntries(raw)
  };
}

function collectRecords(raw,datasetName,k,datasetMeta){
  const out=[];
  const walkChildren=(obj,path,depth)=>{
    if(!O(obj) || depth>32) return;
    for(const [childKey,childValue] of Object.entries(obj)){
      if(Array.isArray(childValue)){
        childValue.forEach((item,i)=>{
          if(O(item)){
            const loc=[...path,childKey,String(i)].join('.');
            out.push(makeRecord(item,loc,String(i),datasetName,k,datasetMeta,'ARRAY'));
            walkChildren(item,[...path,childKey,String(i)],depth+1);
          }
        });
      }else if(O(childValue)){
        const loc=[...path,childKey].join('.');
        out.push(makeRecord(childValue,loc,childKey,datasetName,k,datasetMeta,'OBJECT_MAP'));
        walkChildren(childValue,[...path,childKey],depth+1);
      }
    }
  };
  if(Array.isArray(raw)){
    raw.forEach((item,i)=>{
      if(O(item)){
        out.push(makeRecord(item,String(i),String(i),datasetName,k,datasetMeta,'ROOT_ARRAY'));
        walkChildren(item,[String(i)],1);
      }
    });
  }else if(O(raw)){
    for(const [key,value] of Object.entries(raw)){
      if(Array.isArray(value)){
        value.forEach((item,i)=>{
          if(O(item)){
            out.push(makeRecord(item,`${key}.${i}`,String(i),datasetName,k,datasetMeta,'ARRAY'));
            walkChildren(item,[key,String(i)],1);
          }
        });
      }else if(O(value)){
        out.push(makeRecord(value,key,key,datasetName,k,datasetMeta,'OBJECT_MAP'));
        walkChildren(value,[key],1);
      }
    }
    if(!out.length) out.push(makeRecord(raw,'root','root',datasetName,k,datasetMeta,'ROOT'));
  }else{
    out.push(makeRecord(raw,'root','root',datasetName,k,datasetMeta,'ROOT_SCALAR'));
  }
  const seen=new Set();
  return out.filter(r=>{const key=`${r.dataset}::${r.locator}`;if(seen.has(key))return false;seen.add(key);return true;});
}

function schemaProfile(raw){
  const fields=new Map(); let objectCount=0,arrayCount=0,maxDepth=0;
  const walk=(value,path='',depth=0)=>{
    maxDepth=Math.max(maxDepth,depth);
    if(Array.isArray(value)){ arrayCount++; value.forEach(x=>walk(x,path,depth+1)); return; }
    if(!O(value)) return;
    objectCount++;
    for(const [key,v] of Object.entries(value)){
      const p=path?`${path}.${key}`:key;
      const type=Array.isArray(v)?'array':(v===null?'null':typeof v);
      const item=fields.get(p)||{path:p,key,types:new Set(),count:0};
      item.types.add(type); item.count++; fields.set(p,item);
      if(O(v)||Array.isArray(v)) walk(v,p,depth+1);
    }
  };
  walk(raw);
  return {rootShape:inferRootShape(raw),objectCount,arrayCount,maxDepth,fields:[...fields.values()].map(f=>({path:f.path,key:f.key,types:[...f.types],count:f.count}))};
}

function findTextScore(query,value){
  const q=N(query),v=N(value); if(!q||!v) return 0;
  if(q===v) return 1; if(v.includes(q)||q.includes(v)) return 0.94;
  const qa=new Set(q.split(/\s+/)),va=new Set(v.split(/\s+/));
  const hits=[...qa].filter(x=>va.has(x)).length;
  return hits ? Math.min(0.9,0.5+0.4*hits/Math.max(qa.size,va.size)) : 0;
}

function normalizeDatasetInput(x,i){
  if(O(x) && has(x,'__datasetName')){
    if(has(x,'__data')) return {name:S(x.__datasetName)||`runtime_${i}`,raw:x.__data};
    const numericKeys=Object.keys(x).filter(k=>/^\d+$/.test(k)).sort((a,b)=>Number(a)-Number(b));
    const extra=Object.keys(x).filter(k=>k!=='__datasetName'&&!/^\d+$/.test(k));
    if(numericKeys.length && extra.length===0) return {name:S(x.__datasetName)||`runtime_${i}`,raw:numericKeys.map(k=>x[k])};
    return {name:S(x.__datasetName)||`runtime_${i}`,raw:x};
  }
  if(O(x) && has(x,'dataset') && has(x,'data')) return {name:S(x.dataset)||`runtime_${i}`,raw:x.data};
  return {name:`runtime_${i}`,raw:x};
}

class DataCatalogRegistry{
  constructor(rootDir,k){ this.rootDir=rootDir; this.knowledge=k||{}; this.entries=[]; this.byDataset=new Map(); this.version=0; }
  register(entry){
    const key=N(entry.datasetId||entry.name||entry.physicalPath); if(!key) return null;
    const existing=this.byDataset.get(key); if(existing){Object.assign(existing,entry);return existing;}
    const stored={...entry,datasetId:key}; this.byDataset.set(key,stored); this.entries.push(stored); return stored;
  }
  get(name){return this.byDataset.get(N(name))||null;}
  list(){return this.entries.slice().sort((a,b)=>a.datasetId.localeCompare(b.datasetId));}
  clear(){this.entries=[];this.byDataset.clear();}
}

class DeepRepositoryRuntime{
  constructor(opts={}){
    const {path}=nodeModules();
    this.rootDir=opts.rootDir || global.process?.cwd?.() || '.';
    this.knowledge=opts.knowledge || knowledge();
    this.catalog=new DataCatalogRegistry(this.rootDir,this.knowledge);
    this.datasets=new Map(); this.records=[]; this.idRegistry=new Map(); this.aliasRegistry=new Map();
    this.schemaRegistry=new Map(); this.propertyRegistry=new Map(); this.relationRegistry=new Map(); this.recordByLocator=new Map();
    this.initialized=false; this.lastCollection=null; this._path=path;
  }
  clear(){
    this.catalog.clear(); this.datasets.clear(); this.records=[]; this.idRegistry.clear(); this.aliasRegistry.clear();
    this.schemaRegistry.clear(); this.propertyRegistry.clear(); this.relationRegistry.clear(); this.recordByLocator.clear(); this.initialized=false;
  }
  registerPhysicalFile(filePath){
    const fs=nodeModules().fs; if(!fs) return null;
    let stat=null,rawText=''; try{stat=fs.statSync(filePath);rawText=fs.readFileSync(filePath,'utf8');}catch(_){return null;}
    let data=null,parseStatus='PARSE_OK',error=null; try{data=JSON.parse(rawText);}catch(e){parseStatus='PARSE_ERROR';error=e.message;}
    const relative=normalizeRelative(filePath,this.rootDir);
    const name=this._path?this._path.basename(filePath):relative.split('/').pop();
    const entry=this.catalog.register({
      physicalPath:relative,absolutePath:filePath,name,extension:(name.split('.').pop()||'').toLowerCase(),bytes:stat.size,
      modifiedAt:new Date(stat.mtimeMs).toISOString(),hash:stableHash(rawText),logicalDatasetId:relative,datasetId:relative,
      parseStatus,parseError:error,rootShape:data==null?'UNKNOWN':inferRootShape(data),rootKeys:O(data)&&!Array.isArray(data)?Object.keys(data):[],
      capabilities:metadataEntries(this.knowledge).filter(m=>N(m.dataset)===N(name)||N(m.dataset)===N(relative)).map(m=>m.capability)
    });
    if(data!==null){
      this.datasets.set(N(entry.datasetId),{...entry,raw:data});
      const meta=datasetMetadata(this.knowledge,name)||datasetMetadata(this.knowledge,relative);
      this.schemaRegistry.set(N(entry.datasetId),schemaProfile(data)); entry.schema=this.schemaRegistry.get(N(entry.datasetId));
      entry.identityFields=A(meta?.identityFields); entry.recordLocator=meta?.recordLocator||null; entry.recordKeyIsIdentity=meta?.recordKeyIsIdentity===true; entry.entityTypes=A(meta?.entityTypes);
      for(const r of collectRecords(data,entry.datasetId,this.knowledge,meta)) this.addRecord(r,entry);
    }
    return entry;
  }
  registerInputDataset(input,i){
    const d=normalizeDatasetInput(input,i),key=d.name,data=d.raw;
    const entry=this.catalog.register({physicalPath:null,absolutePath:null,name:key,extension:'runtime',bytes:null,modifiedAt:null,hash:null,logicalDatasetId:key,datasetId:key,parseStatus:'RUNTIME_INPUT',parseError:null,rootShape:inferRootShape(data),rootKeys:O(data)&&!Array.isArray(data)?Object.keys(data):[],capabilities:metadataEntries(this.knowledge).filter(m=>N(m.dataset)===N(key)).map(m=>m.capability),source:'RUNTIME_INPUT'});
    this.datasets.set(N(entry.datasetId),{...entry,raw:data});
    const meta=datasetMetadata(this.knowledge,key);
    this.schemaRegistry.set(N(entry.datasetId),schemaProfile(data)); entry.schema=this.schemaRegistry.get(N(entry.datasetId));
    entry.identityFields=A(meta?.identityFields); entry.recordLocator=meta?.recordLocator||null; entry.recordKeyIsIdentity=meta?.recordKeyIsIdentity===true; entry.entityTypes=A(meta?.entityTypes);
    for(const r of collectRecords(data,entry.datasetId,this.knowledge,meta)) this.addRecord(r,entry);
    return entry;
  }
  addRecord(record,entry){
    const locatorKey=`${record.dataset}::${record.locator}`; if(this.recordByLocator.has(locatorKey)) return this.recordByLocator.get(locatorKey);
    record.fileEntry={datasetId:entry.datasetId,name:entry.name,physicalPath:entry.physicalPath,source:entry.source||null};
    this.recordByLocator.set(locatorKey,record); this.records.push(record); return record;
  }
  rebuildAliases(){
    this.aliasRegistry.clear();
    for(const record of this.records) for(const alias of record.aliases){
      const key=N(alias.value); if(!key) continue; if(!this.aliasRegistry.has(key)) this.aliasRegistry.set(key,[]);
      this.aliasRegistry.get(key).push({record,source:alias.source,fieldPath:alias.fieldPath||null});
    }
  }
  finalizeIdentityRegistry(){
    this.idRegistry.clear();
    const byDataset=new Map();
    for(const record of this.records){
      if(!byDataset.has(record.dataset)) byDataset.set(record.dataset,{records:[],fields:new Map()});
      const bucket=byDataset.get(record.dataset); bucket.records.push(record);
      const seen=new Set();
      for(const f of record.fields){
        if(typeof f.value!=='string') continue;
        const sig=f.path+'::'+f.value; if(seen.has(sig)) continue; seen.add(sig);
        if(!bucket.fields.has(f.path)) bucket.fields.set(f.path,{count:0,values:new Map()});
        const stat=bucket.fields.get(f.path); stat.count++; stat.values.set(U(f.value),(stat.values.get(U(f.value))||0)+1);
      }
    }
    for(const record of this.records){
      const bucket=byDataset.get(record.dataset),entry=this.catalog.get(record.dataset)||{},candidates=[];
      for(const field of A(entry.identityFields)){
        const fieldKey=S(field); if(!fieldKey) continue;
        const value=pathRead(record.value,fieldKey);
        if(scalar(value) && S(value)) candidates.push({value:U(value),source:'METADATA_FIELD',score:100,fieldPath:fieldKey});
        else if(fieldKey==='key' && record.key) candidates.push({value:U(record.key),source:'METADATA_KEY',score:100});
      }
      if(entry.recordKeyIsIdentity && record.key && !/^\d+$/.test(S(record.key))) candidates.push({value:U(record.key),source:'METADATA_RECORD_KEY',score:100});
      if(!candidates.length && record.parentKind==='OBJECT_MAP' && record.key && !/^\d+$/.test(S(record.key))) candidates.push({value:U(record.key),source:'OBJECT_KEY',score:6});
      if(!candidates.length){
        for(const field of record.fields){
          if(typeof field.value!=='string') continue;
          const value=S(field.value),shape=identifierShapeScore(value); if(shape<2) continue;
          const stat=bucket?.fields.get(field.path),coverage=stat&&bucket.records.length?stat.count/bucket.records.length:0,
            distinct=stat&&stat.count?stat.values.size/stat.count:0,frequency=stat?.values.get(U(value))||1,uniqueness=frequency===1?1:1/frequency,
            score=shape+distinct*3+coverage*0.75+uniqueness*1.5;
          candidates.push({value:U(value),source:'STRUCTURAL_CANDIDATE',score,fieldPath:field.path,uniqueness,coverage});
        }
      }
      candidates.sort((a,b)=>b.score-a.score||a.value.localeCompare(b.value));
      const chosen=[]; for(const c of candidates){if(!c.value||chosen.some(x=>x.value===c.value)) continue; chosen.push(c); if(chosen.length>=2) break;}
      record.identities=chosen; record.identityValues=chosen.map(x=>x.value);
      for(const id of record.identityValues){if(!this.idRegistry.has(id)) this.idRegistry.set(id,[]); this.idRegistry.get(id).push(record);}
    }
  }
  buildPropertyRegistry(){
    this.propertyRegistry.clear(); for(const m of metadataEntries(this.knowledge)) this.propertyRegistry.set(`${N(m.dataset)}::${m.capability}`,{dataset:m.dataset,capability:m.capability,mapping:m.mapping,metadata:m.metadata});
  }
  buildRelations(){
    this.relationRegistry.clear();
    for(const def of relationDefs(this.knowledge)) if(O(def)&&def.id) this.relationRegistry.set(U(def.id),{...def,source:'METADATA'});
    for(const record of this.records){
      for(const field of record.fields){
        const text=S(field.value),targets=this.idRegistry.get(U(text)); if(!text||!targets) continue;
        for(const target of targets){
          if(target===record) continue;
          const rel={id:`AUTO::${record.dataset}::${field.path}::${target.dataset}`,fromType:record.entityType,toType:target.entityType,fromDataset:record.dataset,toDataset:target.dataset,fieldPath:field.path,targetId:U(text),source:'INFERRED_REFERENCE'};
          if(!this.relationRegistry.has(U(rel.id))) this.relationRegistry.set(U(rel.id),rel);
        }
      }
    }
  }
  initialize(opts={}){
    const force=opts.force===true; if(this.initialized&&!force) return this.report();
    this.clear(); if(opts.rootDir) this.rootDir=opts.rootDir; this.knowledge=opts.knowledge||knowledge(); this.catalog=new DataCatalogRegistry(this.rootDir,this.knowledge);
    for(let i=0;i<A(opts.datasets).length;i++) this.registerInputDataset(opts.datasets[i],i);
    if(opts.discover!==false) for(const file of walkJSONFiles(this.rootDir)) this.registerPhysicalFile(file);
    this.rebuildAliases(); this.finalizeIdentityRegistry(); this.buildPropertyRegistry(); this.buildRelations();
    this.initialized=true; this.catalog.version+=1; this.lastCollection=new Date().toISOString(); return this.report();
  }
  ensure(inputDatasets=[]){
    if(!this.initialized) return this.initialize({datasets:inputDatasets});
    for(let i=0;i<A(inputDatasets).length;i++){const d=normalizeDatasetInput(inputDatasets[i],i); if(!this.datasets.has(N(d.name))) this.registerInputDataset(inputDatasets[i],i);}
    this.rebuildAliases(); this.finalizeIdentityRegistry(); this.buildRelations(); return this.report();
  }
  resolveExactId(id){const key=U(id),hits=(this.idRegistry.get(key)||[]).slice(); return {status:hits.length===1?'RESOLVED':hits.length?'AMBIGUOUS':'NOT_FOUND',id:key,records:hits};}
  lookupText(text,type){
    const candidates=[]; const direct=this.aliasRegistry.get(N(text))||[];
    for(const x of direct) candidates.push({record:x.record,score:1,source:x.source,fieldPath:x.fieldPath});
    for(const record of this.records){
      if(type&&record.entityType!=='UNKNOWN'&&U(type)!==U(record.entityType)) continue;
      for(const alias of record.aliases){const score=findTextScore(text,alias.value); if(score>=0.82) candidates.push({record,score,source:alias.source,fieldPath:alias.fieldPath||null});}
    }
    const dedupe=new Map(); for(const c of candidates){const key=`${c.record.dataset}::${c.record.locator}`,old=dedupe.get(key); if(!old||c.score>old.score) dedupe.set(key,c);}
    return [...dedupe.values()].sort((a,b)=>b.score-a.score||a.record.dataset.localeCompare(b.record.dataset));
  }
  resolveEntity(parsed,type){
    const explicit=parsed?.entities?.[String(type).toLowerCase()]||null;
    if(explicit?.id){const hit=this.resolveExactId(explicit.id); return {status:hit.status==='RESOLVED'?'RESOLVED':hit.status==='AMBIGUOUS'?'AMBIGUOUS':'UNRESOLVED',id:U(explicit.id),type:U(type),confidence:1,surface:S(explicit.surface||explicit.name||explicit.id),names:A(explicit.names),records:hit.records};}
    const candidates=this.lookupText(S(parsed?.raw||''),type),resolved=[];
    for(const c of candidates){if(c.record.identityValues.length) resolved.push({...c,id:c.record.identityValues[0],type:c.record.entityType==='UNKNOWN'?U(type):c.record.entityType});}
    resolved.sort((a,b)=>b.score-a.score); const best=resolved[0],second=resolved.find(x=>x.id!==best?.id); if(!best) return {status:'UNRESOLVED',id:null,type:U(type),confidence:0,candidates:candidates.slice(0,8)};
    const policy=parsed?.ambiguity_policy||this.knowledge?.ambiguity_policy||{},min=Number(policy.minimum_confidence||0.82),margin=Number(policy.margin_over_second_best||0.08);
    if(best.score<min||(second&&best.score-second.score<margin)) return {status:'AMBIGUOUS',id:null,type:U(type),confidence:Number(best.score.toFixed(3)),candidates:resolved.slice(0,8).map(x=>({id:x.id,score:x.score,locator:x.record.locator,dataset:x.record.dataset,surface:x.record.aliasValues?.[0]||x.id}))};
    return {status:'RESOLVED',id:U(best.id),type:U(best.type),confidence:Number(best.score.toFixed(3)),surface:best.record.aliasValues?.[0]||best.id,names:best.record.aliasValues,record:best.record,candidates:resolved.slice(0,8).map(x=>({id:x.id,score:x.score,dataset:x.record.dataset,locator:x.record.locator}))};
  }
  capabilityCandidates(parsed){
    const raw=N(parsed?.raw||''),prop=U(parsed?.property||''),op=U(parsed?.operation||''),out=[];
    for(const p of this.propertyRegistry.values()){
      let score=0; if(prop&&prop===p.capability) score+=100; if(op&&op===p.capability) score+=60;
      const terms=[p.capability.replace(/_/g,' '),...Object.values(p.mapping||{})].filter(x=>typeof x==='string').map(N);
      for(const term of terms) if(term&&raw.includes(term)) score=Math.max(score,55);
      if(score) out.push({...p,score});
    }
    return out.sort((a,b)=>b.score-a.score||a.dataset.localeCompare(b.dataset));
  }
  recordForEntity(entity,datasetName){
    if(!entity) return []; const ids=new Set([U(entity.id),...A(entity.names).map(U)].filter(Boolean)),out=[];
    for(const r of this.records){if(datasetName&&N(r.dataset)!==N(datasetName)) continue; if(r.identityValues.some(x=>ids.has(U(x)))) out.push(r);}
    if(entity.record){const k=`${entity.record.dataset}::${entity.record.locator}`,direct=this.recordByLocator.get(k);if(direct&&!out.includes(direct)) out.push(direct);}
    return out;
  }
  resolveField(record,plan,parsed){
    const mapping=plan?.mapping||{};
    for(const candidate of [mapping.valuePath,mapping.fieldPath,mapping.fieldName,mapping.field,mapping.key]){if(!S(candidate)) continue; const value=pathRead(record.value,candidate); if(value!==undefined) return {value,path:S(candidate),method:'EXPLICIT_METADATA'};}
    const requested=[parsed?.property,parsed?.requested_output,plan?.capability].map(x=>N(String(x||'').replace(/_/g,' '))).filter(Boolean); let best=null,bestScore=0;
    for(const field of record.fields){let score=0;const k=N(field.key),p=N(field.path);for(const q of requested){if(k===q) score+=20;if(k.includes(q)||p.includes(q)) score+=10;}if(score>bestScore){bestScore=score;best=field;}}
    return best ? {value:best.value,path:best.path,method:'SCHEMA_DISCOVERY'} : null;
  }
  applyOperation(operation,values){
    const op=U(operation||'GET'),flatten=v=>{if(Array.isArray(v))return v.flatMap(flatten);if(typeof v==='number'&&Number.isFinite(v))return[v];if(O(v))return Object.values(v).flatMap(flatten);return[]};
    const numbers=values.flatMap(flatten); if(op==='COUNT') return values.length; if(['TOTAL','SUM'].includes(op)) return numbers.reduce((a,b)=>a+b,0); if(op==='AVERAGE') return numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null; if(op==='MIN') return numbers.length?Math.min(...numbers):null; if(op==='MAX') return numbers.length?Math.max(...numbers):null; if(op==='DISTINCT') return [...new Set(values.map(v=>JSON.stringify(v)))].map(x=>JSON.parse(x)); if(['LIST','SELECT'].includes(op)) return values; return values.length===1?values[0]:values;
  }
  evidence(x){return{dataset:x.dataset||null,physicalPath:x.physicalPath||x.record?.fileEntry?.physicalPath||null,recordLocator:x.recordLocator??x.record?.locator??null,fieldPath:x.fieldPath??null,canonicalEntityId:x.canonicalEntityId||null,property:x.property||null,rawValue:x.rawValue,operation:x.operation||null,authority:x.authority||null,source:x.source||null};}
  fail(status,extra={}){return{ok:false,status,value:null,evidence:[],...extra};}
  execute(parsed,datasets=[],language='en',ctx={}){
    this.ensure(datasets); const country=this.resolveEntity(parsed,'COUNTRY'),resource=this.resolveEntity(parsed,'RESOURCE');
    if(country.status==='AMBIGUOUS'||resource.status==='AMBIGUOUS') return this.fail('AMBIGUOUS_IDENTITY',{semantic:parsed,diagnostics:{country,resource}});
    let entity=country.status==='RESOLVED'?country:(resource.status==='RESOLVED'?resource:null);
    if(!entity&&ctx?.countryId){const hit=this.resolveExactId(ctx.countryId);if(hit.status==='RESOLVED'){const r=hit.records[0];entity={status:'RESOLVED',id:U(ctx.countryId),type:r.entityType,surface:r.aliasValues[0]||U(ctx.countryId),names:r.aliasValues,record:r};}}
    if(!entity) return this.fail('IDENTITY_NOT_FOUND',{semantic:parsed,diagnostics:{country,resource}});
    const op=U(parsed?.operation||'GET');
    if(op==='IDENTIFY'&&!parsed?.property){const r=entity.record;return{ok:true,status:'VERIFIED_FACT',operation:op,targetDomain:entity.type,entity:{id:entity.id,type:entity.type},value:entity.id,evidence:[this.evidence({dataset:r?.dataset||'identity',physicalPath:r?.fileEntry?.physicalPath,recordLocator:r?.locator||null,canonicalEntityId:entity.id,rawValue:entity.id,operation:op,authority:'IDENTITY_REGISTRY'})],trace:[{stage:'IDENTITY_RESOLUTION',status:'RESOLVED',id:entity.id},{stage:'EVIDENCE',count:1}]};}
    const plans=this.capabilityCandidates(parsed); if(!plans.length) return this.fail('DATASET_NOT_FOUND',{semantic:parsed,entity:{id:entity.id,type:entity.type}});
    const selected=plans[0],dataset=this.datasets.get(N(selected.dataset))||this.datasets.get(N(selected.metadata?.dataset)); if(!dataset) return this.fail('DATASET_NOT_FOUND',{entity:{id:entity.id,type:entity.type},plan:selected});
    let records=this.recordForEntity(entity,dataset.datasetId); if(!records.length) records=this.recordForEntity(entity,selected.dataset); if(!records.length) return this.fail('RECORD_NOT_FOUND',{entity:{id:entity.id,type:entity.type},dataset:selected.dataset,plan:selected});
    const extracted=[]; for(const r of records){const field=this.resolveField(r,selected,parsed);if(field) extracted.push({record:r,field});} if(!extracted.length) return this.fail('FIELD_NOT_FOUND',{entity:{id:entity.id,type:entity.type},dataset:dataset.name,plan:selected,recordLocators:records.map(r=>r.locator)});
    let result; try{result=this.applyOperation(op,extracted.map(x=>x.field.value));}catch(e){return this.fail('OPERATION_UNSUPPORTED',{error:e.message,operation:op});}
    const ev=extracted.map(x=>this.evidence({dataset:x.record.dataset,physicalPath:x.record.fileEntry?.physicalPath,record:x.record,fieldPath:x.field.path,canonicalEntityId:entity.id,property:parsed?.property||selected.capability,rawValue:x.field.value,operation:op,authority:x.field.method,source:x.record.fileEntry?.source||selected.dataset}));
    return{ok:true,status:'VERIFIED_FACT',operation:op,targetDomain:entity.type,entity:{id:entity.id,type:entity.type},value:result,evidence:ev,source:'OMEGA_DEEP_CORE',plan:{capability:selected.capability,dataset:dataset.name,recordLocators:records.map(r=>r.locator),candidates:plans.slice(0,10)},trace:[{stage:'FILE_ENTRY',files:this.catalog.entries.length},{stage:'DATA_COLLECTION',records:this.records.length},{stage:'IDENTITY_RESOLUTION',id:entity.id},{stage:'DATASET_DISCOVERY',dataset:dataset.name},{stage:'RECORD_DISCOVERY',count:records.length},{stage:'FIELD_RESOLUTION',count:extracted.length},{stage:'DETERMINISTIC_OPERATION',operation:op},{stage:'EVIDENCE',count:ev.length}]};
  }
  traverse(start,relationId,targetType){
    const def=this.relationRegistry.get(U(relationId)); if(!def) return {status:'RELATION_NOT_FOUND',records:[]}; const targets=[],targetId=U(start?.id);
    for(const r of this.records){if(targetType&&r.entityType!=='UNKNOWN'&&U(r.entityType)!==U(targetType)) continue; for(const f of r.fields) if(U(f.value)===targetId) targets.push(r);}
    const unique=new Map(); for(const r of targets) unique.set(`${r.dataset}::${r.locator}`,r); return {status:targets.length?'OK':'NO_MATCH',records:[...unique.values()]};
  }
  buildExecutionPlan(parsed,ctx={}){this.ensure();const country=this.resolveEntity(parsed,'COUNTRY'),resource=this.resolveEntity(parsed,'RESOURCE'),entity=country.status==='RESOLVED'?country:(resource.status==='RESOLVED'?resource:null),c=this.capabilityCandidates(parsed);return{status:entity?(c.length?'PLANNED':'UNPLANNABLE_NO_CAPABILITY'):'IDENTITY_NOT_FOUND',entity:entity?{type:entity.type,id:entity.id}:null,candidates:c.slice(0,12),constraints:A(parsed?.conditions),operation:parsed?.operation||'GET'};}
  buildEvidenceLedger(result){return{status:result?.status||'UNRESOLVED',facts:A(result?.evidence),calculations:A(result?.calculations),uncertainties:A(result?.uncertainties),trace:A(result?.trace),evidence:A(result?.evidence)};}
  schema(datasetName){return this.schemaRegistry.get(N(datasetName))||null;}
  refresh(){return this.initialize({rootDir:this.rootDir,knowledge:this.knowledge,discover:true,force:true});}
  catalogView(){return this.catalog.list().map(e=>({datasetId:e.datasetId,name:e.name,physicalPath:e.physicalPath,bytes:e.bytes,modifiedAt:e.modifiedAt,hash:e.hash,parseStatus:e.parseStatus,rootShape:e.rootShape,rootKeys:e.rootKeys,capabilities:e.capabilities,identityFields:e.identityFields||[],recordLocator:e.recordLocator||null,recordKeyIsIdentity:e.recordKeyIsIdentity===true,entityTypes:e.entityTypes||[],recordCount:this.records.filter(r=>r.dataset===e.datasetId).length}));}
  lookup(id){const r=this.resolveExactId(id);return{...r,records:r.records.map(x=>({dataset:x.dataset,physicalPath:x.fileEntry?.physicalPath,locator:x.locator,entityType:x.entityType,identityValues:x.identityValues,aliases:x.aliasValues.slice(0,30)}))};}
  report(){return{ok:true,version:VERSION,initialized:this.initialized,rootDir:this.rootDir,catalog:{files:this.catalog.entries.length,version:this.catalog.version},collection:{records:this.records.length,uniqueIds:this.idRegistry.size,aliases:this.aliasRegistry.size},registries:{datasets:this.datasets.size,schemas:this.schemaRegistry.size,properties:this.propertyRegistry.size,relations:this.relationRegistry.size},lastCollection:this.lastCollection};}
  dataIndex(){return{report:this.report(),files:this.catalogView(),records:this.records.map(r=>({dataset:r.dataset,locator:r.locator,entityType:r.entityType,identities:r.identityValues,names:r.aliasValues.slice(0,20),fields:r.fields.map(f=>f.path)})),relations:[...this.relationRegistry.values()]};}
}

let runtime=null;
function getRuntime(){if(!runtime) runtime=new DeepRepositoryRuntime();return runtime;}
if(global.process?.cwd && nodeModules().fs){try{runtime=new DeepRepositoryRuntime({rootDir:global.process.cwd()});runtime.initialize({rootDir:global.process.cwd(),discover:true});}catch(_){runtime=new DeepRepositoryRuntime();}}
function initializeRepository(options={}){runtime=new DeepRepositoryRuntime(options);return runtime.initialize(options);}
function ensureRepository(datasets=[]){return getRuntime().ensure(datasets);}
function execute(parsed,datasets=[],language='en',ctx={}){return getRuntime().execute(parsed,datasets,language,ctx);}
function index(datasets=[]){ensureRepository(datasets);return getRuntime().dataIndex();}
function buildExecutionPlan(parsed,datasets,ctx={}){ensureRepository(datasets);return getRuntime().buildExecutionPlan(parsed,ctx);}
function buildEvidenceLedger(result){return getRuntime().buildEvidenceLedger(result);}
function resolveResources(q){ensureRepository();return getRuntime().lookupText(q,'RESOURCE').slice(0,20).map(x=>({id:x.record.identityValues[0]||null,type:x.record.entityType,name:x.record.aliasValues[0]||null,dataset:x.record.dataset,locator:x.record.locator,score:x.score}));}
function lookupId(id){ensureRepository();return getRuntime().lookup(id);}
function catalog(){ensureRepository();return getRuntime().catalogView();}
function diagnostics(){ensureRepository();return getRuntime().report();}
function traverse(start,relationId,targetType){ensureRepository();return getRuntime().traverse(start,relationId,targetType);}

const api={VERSION,initializeRepository,ensureRepository,execute,index,buildExecutionPlan,buildEvidenceLedger,resolveResources,lookupId,catalog,diagnostics,schema:(dataset)=>getRuntime().schema(dataset),refresh:()=>getRuntime().refresh(),traverse,securityFor:(country,re)=>execute({raw:`${country?.names?.[0]||''} ${re?.names?.[0]||''}`,operation:'GET',property:'RESOURCE_SECURITY',entities:{country:country?{id:country.id,surface:country.names?.[0]}:null,resource:re?{id:re.id,surface:re.names?.[0]}:null}},[],'en',{}),supplierRows:()=>[],composeAnswer:a=>a?.text||'',realizeVerb:(subject,verb)=>S(verb)};
global.OfflineQueryEngine=api;
global.OmegaDeepCoreRuntime=getRuntime();
if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
