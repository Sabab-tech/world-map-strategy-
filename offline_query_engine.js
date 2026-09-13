/* OMEGA DEEP CORE v15.0.0
 * Deterministic repository navigation, graph traversal and evidence runtime.
 * Query IR -> Identity -> Catalog -> Dataset candidates -> Record graph -> Relations
 * -> Property/Field resolution -> Operation -> Validation -> Evidence.
 *
 * This file contains generic mechanics only. Domain truth comes from repository data
 * and metadata. No country/resource/file/field value is embedded here.
 */
(function(global){
'use strict';

const VERSION='15.0.0';
const A=v=>Array.isArray(v)?v:[];
const O=v=>v!==null&&typeof v==='object';
const S=v=>String(v==null?'':v).trim();
const N=v=>S(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;"'“”‘’(){}[\]<>—–/\\]/g,' ').replace(/\s+/g,' ').trim();
const U=v=>S(v).toUpperCase();
const has=(o,k)=>O(o)&&Object.prototype.hasOwnProperty.call(o,k);

function builtIn(name){try{const p=global.process;return p?.getBuiltinModule?p.getBuiltinModule(name):null}catch(_){return null}}
function mods(){return{fs:builtIn('fs'),path:builtIn('path'),crypto:builtIn('crypto')}}
function readJSON(file){try{const fs=mods().fs;if(!fs||!fs.existsSync(file))return null;return JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){return null}}
function hash(text){try{const c=mods().crypto;return c?.createHash?c.createHash('sha256').update(String(text)).digest('hex'):null}catch(_){return null}}
function relPath(file,root){const p=mods().path;if(p)return p.relative(root,file).replace(/\\/g,'/')||p.basename(file);return S(file).replace(/^\.?\//,'')}
function walkFiles(root){
  const{fs,path}=mods();if(!fs||!path)return[];const out=[],blocked=new Set(['node_modules','.git','.github','.cache','dist','build']);
  const visit=dir=>{let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch(_){return}
    for(const e of entries){const full=path.join(dir,e.name);if(e.isDirectory()){if(!blocked.has(e.name))visit(full)}else if(e.isFile()&&/\.(json|geojson)$/i.test(e.name))out.push(full)}};
  visit(root);return out.sort((a,b)=>a.localeCompare(b));
}
function loadKnowledge(){
  if(global.OmegaOfflineSemanticKnowledge)return global.OmegaOfflineSemanticKnowledge;
  if(global.OmegaSemanticKnowledge)return global.OmegaSemanticKnowledge;
  const p=mods().path,root=global.process?.cwd?.()||'.';return p?readJSON(p.join(root,'offline_semantic_knowledge.json'))||{}:{};
}
function metaEntries(k){
  const out=[];
  for(const d of A(k?.data_finding?.dataset_capabilities)){
    if(!O(d)||!S(d.dataset))continue;
    for(const cap of A(d.capabilities)){const c=U(cap),m=d.fieldMappings?.[cap]||d.fieldMappings?.[c]||{};out.push({dataset:S(d.dataset),capability:c,mapping:m,metadata:d})}
  }return out;
}
function relationDefs(k){return A(k?.relations||k?.relationship_registry||k?.relationshipRegistry).filter(x=>O(x)&&S(x.id)).map(x=>({...x,id:U(x.id),from:U(x.from||x.fromType||''),to:U(x.to||x.toType||'')}))}
function entityTypeDefs(k){return new Set(A(k?.entity_types).map(U))}
function knownEntities(k){
  const out=[],skip=new Set(['data_finding','question_semantics','ambiguity_policy','normalization','entity_types','schema','relations','relationship_registry','relationshipRegistry']);
  const add=(id,v,bucket)=>{if(!O(v))return;const type=U(v.type||({countries:'COUNTRY',resources:'RESOURCE',asset_classes:'ASSET_CLASS'}[bucket]||''));if(!type)return;const names=[...A(v.names),...A(v.aliases)].map(S).filter(Boolean);out.push({id:U(id),type,names:[...new Set(names)]})};
  for(const[b,c]of Object.entries(k||{})){if(skip.has(b)||!O(c)||Array.isArray(c))continue;for(const[id,v]of Object.entries(c))add(id,v,b)}
  const d=new Map;for(const x of out)d.set(`${x.type}::${x.id}`,x);return[...d.values()];
}
function pathRead(root,p){
  if(p==null||S(p)==='')return root;let cur=root;const clean=S(p).replace(/^\$\.?/,'').replace(/\[([^\]]+)\]/g,'.$1');
  for(const part of clean.split('.').filter(Boolean)){if(cur==null)return undefined;cur=Array.isArray(cur)&&/^\d+$/.test(part)?cur[Number(part)]:cur[part]}return cur;
}
function scalar(v){return v===null||['string','number','boolean'].includes(typeof v)}
function scalarEntries(value,path='',out=[]){
  if(value==null)return out;if(Array.isArray(value)){value.forEach((v,i)=>scalarEntries(v,`${path}[${i}]`,out));return out}
  if(!O(value))return out;for(const[k,v]of Object.entries(value)){const p=path?`${path}.${k}`:k;if(scalar(v))out.push({key:k,path:p,value:v,type:v===null?'null':typeof v});else scalarEntries(v,p,out)}return out;
}
function tokens(v){return N(v).split(/\s+/).filter(Boolean)}
function tokenScore(a,b){const aa=new Set(tokens(a)),bb=new Set(tokens(b));if(!aa.size||!bb.size)return 0;let h=0;for(const x of aa)if(bb.has(x))h++;return h/Math.max(aa.size,bb.size)}
function textScore(a,b){const x=N(a),y=N(b);if(!x||!y)return 0;if(x===y)return 1;if(x.includes(y)||y.includes(x))return .94;return tokenScore(x,y)*.8}
function rootShape(v){return Array.isArray(v)?'ARRAY':O(v)?'OBJECT':'SCALAR'}
function normalizeInput(x,i){
  if(O(x)&&has(x,'__datasetName')){const name=S(x.__datasetName)||`runtime_${i}`;return{name,raw:has(x,'__data')?x.__data:x,source:'RUNTIME_INPUT'}}
  if(O(x)&&has(x,'dataset')&&has(x,'data'))return{name:S(x.dataset)||`runtime_${i}`,raw:x.data,source:'RUNTIME_INPUT'};
  return{name:`runtime_${i}`,raw:x,source:'RUNTIME_INPUT'};
}
function datasetMetaFor(k,name){
  const all=metaEntries(k).filter(x=>N(x.dataset)===N(name)||N(x.dataset).replace(/\.json$/,'')===N(name).replace(/\.json$/,''));if(!all.length)return null;
  const m={dataset:S(name),capabilities:[],fieldMappings:{},entityTypes:[],identityFields:[],recordLocator:null,recordKeyIsIdentity:false,authority:'EXPLICIT_METADATA'};
  for(const x of all){if(!m.capabilities.includes(x.capability))m.capabilities.push(x.capability);if(O(x.mapping))m.fieldMappings[x.capability]=x.mapping;for(const t of A(x.metadata.entityTypes)){const u=U(t);if(!m.entityTypes.includes(u))m.entityTypes.push(u)}for(const f of A(x.metadata.identityFields)){if(!m.identityFields.includes(S(f)))m.identityFields.push(S(f))}if(!m.recordLocator&&x.metadata.recordLocator)m.recordLocator=S(x.metadata.recordLocator);if(x.metadata.recordKeyIsIdentity===true)m.recordKeyIsIdentity=true}return m;
}
function schemaProfile(raw){
  const fields=new Map;let objects=0,arrays=0,maxDepth=0;
  const walk=(v,p='',d=0)=>{maxDepth=Math.max(maxDepth,d);if(Array.isArray(v)){arrays++;v.forEach(x=>walk(x,p,d+1));return}if(!O(v))return;objects++;for(const[k,x]of Object.entries(v)){const path=p?`${p}.${k}`:k,typ=Array.isArray(x)?'array':x===null?'null':typeof x;let f=fields.get(path);if(!f)f={path,key:k,types:new Set,count:0};f.types.add(typ);f.count++;fields.set(path,f);if(O(x)||Array.isArray(x))walk(x,path,d+1)}};
  walk(raw);return{rootShape:rootShape(raw),objectCount:objects,arrayCount:arrays,maxDepth,fields:[...fields.values()].map(x=>({path:x.path,key:x.key,types:[...x.types],count:x.count}))};
}
function makeCatalogEntry(runtime,name,meta){return{...runtime,logicalDatasetId:meta?.logicalDatasetId||meta?.dataset||name,datasetId:runtime.datasetId||name,metadata:meta||null,capabilities:A(meta?.capabilities),entityTypes:A(meta?.entityTypes),identityFields:A(meta?.identityFields),recordLocator:meta?.recordLocator||null,recordKeyIsIdentity:meta?.recordKeyIsIdentity===true,authority:meta?.authority||'INFERRED'}}

class Catalog{
  constructor(root,k){this.root=root;this.k=k;this.entries=[];this.byId=new Map;this.version=0}
  clear(){this.entries=[];this.byId.clear();this.version=0}
  add(e){const key=N(e.datasetId||e.name||e.physicalPath);if(!key)return null;const old=this.byId.get(key);if(old){Object.assign(old,e);return old}const v={...e,datasetId:key};this.byId.set(key,v);this.entries.push(v);return v}
  get(name){return this.byId.get(N(name))||this.entries.find(e=>N(e.name)===N(name)||N(e.physicalPath)===N(name))||null}
  list(){return this.entries.slice().sort((a,b)=>a.datasetId.localeCompare(b.datasetId))}
}

class DeepCoreRuntime{
  constructor(opts={}){this.root=opts.rootDir||global.process?.cwd?.()||'.';this.k=opts.knowledge||loadKnowledge();this.catalog=new Catalog(this.root,this.k);this.datasets=new Map;this.records=[];this.byLocator=new Map;this.idIndex=new Map;this.aliasIndex=new Map;this.edgesOut=new Map;this.edgesIn=new Map;this.schemas=new Map;this.properties=new Map;this.relations=relationDefs(this.k);this.known=new Map(knownEntities(this.k).map(x=>[`${x.type}::${x.id}`,x]));this.initialized=false;this.version=0}
  clear(){this.catalog.clear();this.datasets.clear();this.records=[];this.byLocator.clear();this.idIndex.clear();this.aliasIndex.clear();this.edgesOut.clear();this.edgesIn.clear();this.schemas.clear();this.properties.clear();this.initialized=false}
  registerPhysical(file){
    const fs=mods().fs,path=mods().path;if(!fs)return null;let st,txt;try{st=fs.statSync(file);txt=fs.readFileSync(file,'utf8')}catch(_){return null}
    let raw,status='PARSE_OK',error=null;try{raw=JSON.parse(txt)}catch(e){status='PARSE_ERROR';error=e.message}
    const relative=relPath(file,this.root),name=path?path.basename(file):relative.split('/').pop(),meta=datasetMetaFor(this.k,name),entry=this.catalog.add(makeCatalogEntry({physicalPath:relative,absolutePath:file,name,extension:(name.split('.').pop()||'').toLowerCase(),bytes:st.size,modifiedAt:new Date(st.mtimeMs).toISOString(),hash:hash(txt),parseStatus:status,parseError:error,rootShape:raw==null?'UNKNOWN':rootShape(raw),rootKeys:O(raw)&&!Array.isArray(raw)?Object.keys(raw):[],source:'PHYSICAL_FILE'},name,meta));
    if(raw!==undefined){this.datasets.set(N(entry.datasetId),{entry,raw});this.schemas.set(N(entry.datasetId),schemaProfile(raw));this.collect(raw,entry,meta)}return entry;
  }
  registerInput(x,i){const d=normalizeInput(x,i),meta=datasetMetaFor(this.k,d.name),entry=this.catalog.add(makeCatalogEntry({physicalPath:null,absolutePath:null,name:d.name,extension:'runtime',bytes:null,modifiedAt:null,hash:null,parseStatus:'RUNTIME_INPUT',rootShape:rootShape(d.raw),rootKeys:O(d.raw)&&!Array.isArray(d.raw)?Object.keys(d.raw):[],source:'RUNTIME_INPUT'},d.name,meta));this.datasets.set(N(entry.datasetId),{entry,raw:d.raw});this.schemas.set(N(entry.datasetId),schemaProfile(d.raw));this.collect(d.raw,entry,meta);return entry}
  makeRecord(value,locator,key,entry,meta,parent,ancestry){
    const fields=scalarEntries(value),entityHints=[],idField=A(meta?.identityFields);
    for(const f of fields){if(typeof f.value!=='string'||!S(f.value))continue;for(const defined of idField){const d=defined.toLowerCase().replace(/\[.*?\]/g,'');const fk=N(f.key);if(fk===N(d)||fk.includes(N(d))||N(d).includes(fk))entityHints.push({value:U(f.value),source:'METADATA_ID_FIELD',fieldPath:f.path,fieldKey:f.key})}}
    if(key&&!/^\d+$/.test(S(key)))entityHints.push({value:U(key),source:'OBJECT_KEY',fieldPath:null,fieldKey:null});
    const aliases=[];for(const f of fields)if(typeof f.value==='string'&&S(f.value))aliases.push({value:S(f.value),source:'SCALAR_FIELD',fieldPath:f.path});if(key&&!/^\d+$/.test(S(key)))aliases.push({value:S(key).replace(/[_-]+/g,' '),source:'OBJECT_KEY',fieldPath:null});
    const uniqueAlias=new Map;for(const a of aliases){const q=N(a.value);if(q&&!uniqueAlias.has(q))uniqueAlias.set(q,a)}
    return{dataset:entry.datasetId,locator,key,value,parent,ancestry:A(ancestry).slice(),entityType:'UNKNOWN',identities:[],identityValues:[],identityEvidence:[],aliases:[...uniqueAlias.values()],aliasValues:[...uniqueAlias.values()].map(x=>x.value),fields,fileEntry:{datasetId:entry.datasetId,name:entry.name,physicalPath:entry.physicalPath,source:entry.source},meta:meta||null};
  }
  collect(raw,entry,meta){
    const out=[],add=(v,path,key,parent,anc)=>{if(!O(v))return;const r=this.makeRecord(v,path,key,entry,meta,parent,anc);out.push(r);return r};
    const visit=(v,path,parent,anc,depth)=>{if(!O(v)||depth>60)return;for(const[k,x]of Object.entries(v)){if(Array.isArray(x)){x.forEach((item,i)=>{const p=path?`${path}.${k}.${i}`:`${k}.${i}`,r=add(item,p,String(i),parent,anc);if(r)visit(item,p,r,[...anc,r],depth+1)})}else if(O(x)){const p=path?`${path}.${k}`:k,r=add(x,p,k,parent,anc);if(r)visit(x,p,r,[...anc,r],depth+1)}}};
    if(Array.isArray(raw))raw.forEach((x,i)=>{const r=add(x,String(i),String(i),null,[]);if(r)visit(x,String(i),r,[r],1)});else if(O(raw)){for(const[k,x]of Object.entries(raw)){if(Array.isArray(x)){x.forEach((item,i)=>{const p=`${k}.${i}`,r=add(item,p,String(i),null,[]);if(r)visit(item,p,r,[r],1)})}else if(O(x)){const r=add(x,k,k,null,[]);if(r)visit(x,k,r,[r],1)}}if(!out.length)out.push(this.makeRecord(raw,'root','root',entry,meta,null,[]))}else out.push(this.makeRecord(raw,'root','root',entry,meta,null,[]));
    const seen=new Set;for(const r of out){const k=`${r.dataset}::${r.locator}`;if(seen.has(k))continue;seen.add(k);const idx=this.records.length;this.records.push(r);this.byLocator.set(k,r)}
  }
  inferIdentityTypes(){
    const types=entityTypeDefs(this.k),datasetStats=new Map;
    for(const r of this.records){let bucket=datasetStats.get(r.dataset);if(!bucket){bucket={total:0,fieldStats:new Map};datasetStats.set(r.dataset,bucket)}bucket.total++;for(const f of r.fields){if(typeof f.value!=='string')continue;let s=bucket.fieldStats.get(N(f.key));if(!s)s={count:0,distinct:new Set};s.count++;s.distinct.add(U(f.value));bucket.fieldStats.set(N(f.key),s)}}
    for(const r of this.records){const meta=r.meta,candidates=[];
      for(const f of r.fields){if(typeof f.value!=='string'||!S(f.value))continue;const id=U(f.value),known=[...this.known.values()].find(e=>e.id===id);if(known)candidates.push({id,type:known.type,score:100,source:'KNOWLEDGE_ENTITY',fieldPath:f.path});}
      for(const anc of r.ancestry||[])for(const iv of anc.identityEvidence||[]){if(!iv?.value)continue;const known=[...this.known.values()].find(e=>e.id===U(iv.value));if(known)candidates.push({id:U(iv.value),type:known.type,score:50,source:'ANCESTRY',fieldPath:iv.fieldPath||null})}
      for(const field of r.fields){if(!field.key)continue;const fk=N(field.key);for(const t of types){const tn=N(t),base=tn.replace(/[^a-z0-9]+/g,'');if(base&&fk.includes(base)&&/id|key|ref/.test(fk))candidates.push({type:t,score:25,source:'IDENTITY_FIELD_SHAPE',fieldPath:field.path,value:S(field.value)})}}
      if(r.meta?.entityTypes?.length===1)candidates.push({type:U(r.meta.entityTypes[0]),score:10,source:'DATASET_METADATA'});
      candidates.sort((a,b)=>b.score-a.score);r.entityType=candidates[0]?.type||'UNKNOWN';
      const identity=[];
      for(const c of candidates.filter(x=>x.id))if(!identity.some(x=>x.id===c.id))identity.push(c);
      if(r.key&&!/^\d+$/.test(S(r.key))){const known=[...this.known.values()].find(e=>e.id===U(r.key));if(known)identity.unshift({id:known.id,type:known.type,score:110,source:'KNOWN_OBJECT_KEY'});else if(r.meta?.recordKeyIsIdentity===true)identity.unshift({id:U(r.key),type:r.entityType,score:100,source:'RECORD_KEY'})}
      for(const f of r.fields){if(typeof f.value!=='string')continue;const stat=datasetStats.get(r.dataset)?.fieldStats.get(N(f.key)),uniq=stat?.count?stat.distinct.size/stat.count:0;if(uniq>.95&&S(f.value).length<=128&&/^[A-Za-z0-9._:-]+$/.test(S(f.value)))if(!identity.some(x=>x.id===U(f.value)))identity.push({id:U(f.value),type:r.entityType,score:Math.round(10+uniq*10),source:'STRUCTURAL_ID',fieldPath:f.path})}
      r.identityEvidence=identity.slice(0,12);r.identities=identity.slice(0,8);r.identityValues=[...new Set(identity.map(x=>U(x.id)).filter(Boolean))];
      for(const id of r.identityValues){if(!this.idIndex.has(id))this.idIndex.set(id,[]);this.idIndex.get(id).push(r)}
      for(const a of r.aliases){const q=N(a.value);if(!q)continue;if(!this.aliasIndex.has(q))this.aliasIndex.set(q,[]);this.aliasIndex.get(q).push({record:r,source:a.source,fieldPath:a.fieldPath||null})}
    }
  }
  buildProperties(){this.properties.clear();for(const m of metaEntries(this.k))this.properties.set(`${N(m.dataset)}::${m.capability}`,{dataset:m.dataset,capability:m.capability,mapping:m.mapping,metadata:m.metadata})}
  addEdge(from,to,relation,detail){if(!from||!to||from===to)return;const key=`${from.dataset}::${from.locator}`;const tkey=`${to.dataset}::${to.locator}`,edge={from,to,relation:relation||null,...detail};if(!this.edgesOut.has(key))this.edgesOut.set(key,[]);if(!this.edgesIn.has(tkey))this.edgesIn.set(tkey,[]);const outs=this.edgesOut.get(key);if(!outs.some(e=>e.to===to&&e.relation===edge.relation&&e.fieldPath===edge.fieldPath))outs.push(edge);const ins=this.edgesIn.get(tkey);if(!ins.some(e=>e.from===from&&e.relation===edge.relation&&e.fieldPath===edge.fieldPath))ins.push(edge)}
  buildGraph(){
    this.edgesOut.clear();this.edgesIn.clear();const rels=this.relations;
    for(const r of this.records){
      for(const f of r.fields){const val=S(f.value);if(!val)continue;const targets=this.idIndex.get(U(val))||[];for(const t of targets){if(t===r)continue;const defs=rels.filter(x=>(!x.from||x.from===r.entityType||r.entityType==='UNKNOWN')&&(!x.to||x.to===t.entityType||t.entityType==='UNKNOWN'));this.addEdge(r,t,defs[0]?.id||null,{kind:'REFERENCE',fieldPath:f.path,targetId:U(val),source:'DATA_REFERENCE'})}}
      for(const anc of A(r.ancestry)){if(anc===r)continue;const defs=rels.filter(x=>(!x.from||x.from===anc.entityType||anc.entityType==='UNKNOWN')&&(!x.to||x.to===r.entityType||r.entityType==='UNKNOWN'));for(const d of defs.slice(0,3))this.addEdge(anc,r,d.id,{kind:'NESTED_RELATION',fieldPath:null,targetId:null,source:'JSON_ANCESTRY'})}
    }
    for(const d of rels){if(!d.from||!d.to)continue;for(const r of this.records){if(r.entityType!==d.from)continue;for(const f of r.fields){const targets=this.idIndex.get(U(f.value))||[];for(const t of targets)if(t.entityType===d.to)this.addEdge(r,t,d.id,{kind:'DECLARED_RELATION',fieldPath:f.path,targetId:U(f.value),source:'RELATION_REGISTRY'})}}}
  }
  initialize(opts={}){
    if(this.initialized&&!opts.force)return this.report();this.clear();this.root=opts.rootDir||this.root;this.k=opts.knowledge||loadKnowledge();this.relations=relationDefs(this.k);this.known=new Map(knownEntities(this.k).map(x=>[`${x.type}::${x.id}`,x]));this.catalog=new Catalog(this.root,this.k);this.properties.clear();
    for(let i=0;i<A(opts.datasets).length;i++)this.registerInput(opts.datasets[i],i);if(opts.discover!==false)for(const f of walkFiles(this.root))this.registerPhysical(f);this.inferIdentityTypes();this.buildProperties();this.buildGraph();this.initialized=true;this.version++;this.catalog.version=this.version;return this.report();
  }
  ensure(inputs=[]){if(!this.initialized)return this.initialize({datasets:inputs});for(let i=0;i<A(inputs).length;i++){const d=normalizeInput(inputs[i],i);if(!this.datasets.has(N(d.name)))this.registerInput(inputs[i],i)}if(inputs.length){this.inferIdentityTypes();this.buildGraph()}return this.report()}
  report(){return{ok:true,version:VERSION,initialized:this.initialized,rootDir:this.root,catalog:{files:this.catalog.entries.length,version:this.catalog.version},collection:{records:this.records.length,uniqueIds:this.idIndex.size,aliases:this.aliasIndex.size,edges:[...this.edgesOut.values()].reduce((n,a)=>n+a.length,0)},registries:{datasets:this.datasets.size,schemas:this.schemas.size,properties:this.properties.size,relations:this.relations.length}}}
  schema(name){return this.schemas.get(N(name))||null}
  catalogView(){return this.catalog.list().map(e=>({...e,recordCount:this.records.filter(r=>r.dataset===e.datasetId).length,schema:this.schemas.get(N(e.datasetId))||null}))}
  resolveExactId(id,type){const hits=(this.idIndex.get(U(id))||[]).filter(r=>!type||r.entityType==='UNKNOWN'||r.entityType===U(type));return{status:hits.length===1?'RESOLVED':hits.length?'AMBIGUOUS':'NOT_FOUND',id:U(id),records:hits}}
  lookupText(text,type){const out=[];const exact=this.aliasIndex.get(N(text))||[];for(const x of exact)if(!type||x.record.entityType==='UNKNOWN'||x.record.entityType===U(type))out.push({record:x.record,score:1,source:x.source,fieldPath:x.fieldPath});for(const r of this.records){if(type&&r.entityType!=='UNKNOWN'&&r.entityType!==U(type))continue;for(const a of r.aliases){const s=textScore(text,a.value);if(s>=.72)out.push({record:r,score:s,source:a.source,fieldPath:a.fieldPath||null})}}const d=new Map;for(const x of out){const k=`${x.record.dataset}::${x.record.locator}`,o=d.get(k);if(!o||x.score>o.score)d.set(k,x)}return[...d.values()].sort((a,b)=>b.score-a.score)}
  resolveEntity(spec,type){
    if(spec?.id){const ex=this.resolveExactId(spec.id,type);if(ex.status==='RESOLVED')return{status:'RESOLVED',id:U(spec.id),type:U(type),records:ex.records,confidence:1,source:'QUERY_IR_ID'};if(ex.status==='AMBIGUOUS')return{status:'AMBIGUOUS',id:null,type:U(type),candidates:ex.records.map(r=>({id:U(spec.id),dataset:r.dataset,locator:r.locator,type:r.entityType}))}}
    const text=spec?.surface||spec?.name||A(spec?.names)[0]||null;if(!text)return{status:'UNRESOLVED',id:null,type:U(type),candidates:[]};const candidates=[];for(const c of this.lookupText(text,type))for(const id of c.record.identities){const known=[...this.known.values()].find(x=>x.id===U(id.id)&&x.type===U(type));if(known)candidates.push({id:U(id.id),record:c.record,score:c.score,source:c.source})}candidates.sort((a,b)=>b.score-a.score);const best=candidates[0],second=candidates.find(x=>x.id!==best?.id);if(!best)return{status:'UNRESOLVED',id:null,type:U(type),candidates:this.lookupText(text,type).slice(0,8).map(x=>({dataset:x.record.dataset,locator:x.record.locator,score:x.score}))};if(best.score<.82||(second&&best.score-second.score<.08))return{status:'AMBIGUOUS',id:null,type:U(type),confidence:best.score,candidates:candidates.slice(0,8).map(x=>({id:x.id,score:x.score,dataset:x.record.dataset,locator:x.record.locator}))};return{status:'RESOLVED',id:best.id,type:U(type),confidence:best.score,record:best.record,records:this.idIndex.get(best.id)||[best.record]}
  }
  relationNeighbours(record,direction='OUT',relationId=null){const key=`${record.dataset}::${record.locator}`,edges=direction==='IN'?(this.edgesIn.get(key)||[]):(this.edgesOut.get(key)||[]);return edges.filter(e=>!relationId||U(e.relation)===U(relationId)).map(e=>direction==='IN'?e.from:e.to)}
  bfs(starts,opts={}){
    const result=new Map,queue=A(starts).map(r=>({r,depth:0,path:[]})),max=Number(opts.maxDepth??20);for(const s of A(starts))result.set(`${s.dataset}::${s.locator}`,{record:s,depth:0,path:[]});
    while(queue.length){const cur=queue.shift();if(cur.depth>=max)continue;const key=`${cur.r.dataset}::${cur.r.locator}`,next=[...(this.edgesOut.get(key)||[]),...(this.edgesIn.get(key)||[])];for(const e of next){const r=e.from===cur.r?e.to:e.from,k=`${r.dataset}::${r.locator}`;if(result.has(k))continue;const p=[...cur.path,{relation:e.relation,direction:e.from===cur.r?'OUT':'IN',fieldPath:e.fieldPath||null,targetId:e.targetId||null}];result.set(k,{record:r,depth:cur.depth+1,path:p});queue.push({r,depth:cur.depth+1,path:p})}}return[...result.values()]
  }
  descendants(record){const out=[];for(const r of this.records){if(r===record)continue;for(const a of r.ancestry||[])if(a===record){out.push(r);break}}return out}
  matchesEntity(record,entity){if(!entity?.id)return false;const id=U(entity.id);if(record.identityValues.includes(id))return true;for(const f of record.fields)if(S(f.value)&&U(f.value)===id)return true;for(const a of record.aliasValues||[])if(N(a)===N(entity.names?.[0]||entity.surface||''))return true;return false}
  findEntityRecords(entity,dataset){const all=this.idIndex.get(U(entity?.id))||[];let r=all.filter(x=>!dataset||N(x.dataset)===N(dataset));if(!r.length&&entity?.surface)r=this.lookupText(entity.surface,entity.type).map(x=>x.record).filter(x=>!dataset||N(x.dataset)===N(dataset));return[...new Map(r.map(x=>[`${x.dataset}::${x.locator}`,x])).values()]}
  assetTypeFromIR(ir){return U(ir?.assetClass||ir?.asset_class||ir?.target?.assetClass||A(ir?.targets).find(x=>x?.type==='ASSET_CLASS')?.id||'')||null}
  semanticAssetTypeCandidates(type){if(!type)return[];const k=[...this.known.values()].filter(x=>x.type==='ASSET_CLASS'&&x.id===U(type));return k.length?k:[]}
  recordLooksLike(record,entityType){if(!entityType)return false;if(record.entityType===U(entityType))return true;const aliases=this.semanticAssetTypeCandidates(entityType).flatMap(x=>[x.id,...x.names]);const blob=[record.key,...record.aliasValues, ...record.fields.map(f=>f.key)].join(' ');return aliases.some(a=>tokenScore(blob,a)>=.8)||record.fields.some(f=>N(f.key).includes(N(entityType).toLowerCase().replace(/_/g,' '))) }
  propertyTerms(ir,plan){const terms=new Set(tokens(ir?.property||''));for(const x of tokens(ir?.raw||''))if(x.length>2)terms.add(x);for(const t of A(plan?.terms))for(const x of tokens(t))terms.add(x);for(const v of Object.values(plan?.mapping||{}))if(typeof v==='string')for(const x of tokens(v))terms.add(x);return[...terms].filter(x=>x.length>2)}
  resolveField(record,ir,plan){
    const maps=[];const m=plan?.mapping||{};for(const p of ['valuePath','fieldPath','path','fieldName','field','key'])if(S(m[p]))maps.push(S(m[p]));
    for(const p of maps){const v=pathRead(record.value,p);if(v!==undefined)return{value:v,path:p,method:'EXPLICIT_METADATA'}}
    const terms=this.propertyTerms(ir,plan),numeric=[];for(const f of record.fields){if(f.value===null||f.value===undefined)continue;let s=0,k=N(f.key),p=N(f.path);for(const t of terms){if(k===t)s+=12;if(k.includes(t))s+=7;if(p.includes(t))s+=4}if(typeof f.value==='number'&&Number.isFinite(f.value))s+=3;if(s)numeric.push({field:f,score:s})}numeric.sort((a,b)=>b.score-a.score);if(numeric.length&&numeric[0].score>=7){if(numeric[1]&&numeric[0].score===numeric[1].score)return null;return{value:numeric[0].field.value,path:numeric[0].field.path,method:'SCHEMA_SEMANTIC_MATCH'}}return null;
  }
  candidatePlans(ir){const out=[];const prop=U(ir?.property||'');for(const p of this.properties.values()){let s=0;if(prop&&prop===p.capability)s+=100;const raw=N(ir?.raw||'');const terms=[p.capability.replace(/_/g,' ')];for(const v of Object.values(p.mapping||{}))if(typeof v==='string')terms.push(v.replace(/_/g,' '));for(const t of terms)if(t&&raw.includes(N(t)))s=Math.max(s,60);if(s)out.push({...p,score:s,terms})}
    if(!out.length&&prop){for(const m of metaEntries(this.k))if(m.capability===prop)out.push({dataset:m.dataset,capability:m.capability,mapping:m.mapping,metadata:m.metadata,score:100,terms:[]})}
    return out.sort((a,b)=>b.score-a.score||a.dataset.localeCompare(b.dataset))
  }
  buildPlan(ir){const country=ir?.entities?.country?.id?ir.entities.country:null,resource=ir?.entities?.resource?.id?ir.entities.resource:null,caps=this.candidatePlans(ir),asset=this.assetTypeFromIR(ir);return{status:ir?.unresolved?.length?'UNRESOLVED_QUERY':(country||resource)?'PLANNED':'IDENTITY_NOT_FOUND',identity:{country:country?{type:'COUNTRY',id:country.id}:null,resource:resource?{type:'RESOURCE',id:resource.id}:null},assetClass:asset,candidates:caps.slice(0,20),operation:U(ir?.operation||'GET'),searchOrder:['EXACT_ID','ALIAS','CANONICAL_ID','CAPABILITY','DATASET_COMPATIBILITY','RECORD_GRAPH','RELATION_PATH','FIELD','OPERATION','VALIDATION','EVIDENCE']}}
  execute(ir,datasets=[],language='en',ctx={}){
    this.ensure(datasets);const country=this.resolveEntity(ir?.entities?.country||{id:ir?.context?.countryId},'COUNTRY'),resource=this.resolveEntity(ir?.entities?.resource||{id:ir?.context?.resourceId},'RESOURCE');
    if(country.status==='AMBIGUOUS'||resource.status==='AMBIGUOUS')return this.fail('AMBIGUOUS_IDENTITY',{semantic:ir,diagnostics:{country,resource}});
    const hasCountry=country.status==='RESOLVED',hasResource=resource.status==='RESOLVED';if(!hasCountry&&!hasResource&&ir?.operation!=='GENERAL_ANSWER')return this.fail('IDENTITY_NOT_FOUND',{semantic:ir,diagnostics:{country,resource}});
    const planList=this.candidatePlans(ir);const asset=this.assetTypeFromIR(ir),op=U(ir?.operation||'GET'),results=[];
    for(const plan of planList){for(const ds of this.datasets.values()){
      if(N(ds.entry.name)!==N(plan.dataset))continue;
      let starts=[];if(hasCountry)starts.push(...this.findEntityRecords(country,ds.entry.datasetId));if(hasResource)starts.push(...this.findEntityRecords(resource,ds.entry.datasetId));starts=[...new Map(starts.map(r=>[`${r.dataset}::${r.locator}`,r])).values()];
      if(!starts.length)continue;
      let graph=this.bfs(starts,{maxDepth:30});
      if(hasCountry&&hasResource)graph=graph.filter(x=>{const r=x.record;const resourceNear=this.matchesEntity(r,resource)||this.bfs([r],{maxDepth:6}).some(y=>this.matchesEntity(y.record,resource));const countryNear=this.matchesEntity(r,country)||this.bfs([r],{maxDepth:6}).some(y=>this.matchesEntity(y.record,country));return resourceNear&&countryNear});
      if(asset){const target=graph.filter(x=>this.recordLooksLike(x.record,asset));if(op==='COUNT'){results.push({plan,records:target.map(x=>x.record),paths:target});continue}graph=target.length?target:graph}
      const extracted=[];for(const g of graph){const field=this.resolveField(g.record,ir,plan);if(field)extracted.push({record:g.record,field,path:g.path})}
      if(extracted.length)results.push({plan,extracted,records:extracted.map(x=>x.record),paths:extracted});
    }}
    if(asset&&op==='COUNT')return this.finishCount(results,ir,asset,country,resource);
    if(!results.length)return this.fail(op==='COUNT'?'RECORD_NOT_FOUND':'FIELD_NOT_FOUND',{semantic:ir,diagnostics:{country,resource,plans:planList.map(x=>({dataset:x.dataset,capability:x.capability}))}});
    const entries=results.flatMap(x=>x.extracted||[]);if(!entries.length)return this.fail('FIELD_NOT_FOUND',{semantic:ir});
    const values=entries.map(x=>x.field.value),operation=this.operation(op,values);if(operation.error)return this.fail(operation.status,{semantic:ir,error:operation.error});
    const distinctRaw=[...new Set(values.map(v=>JSON.stringify(v)))].map(x=>JSON.parse(x));
    if((['SUM','TOTAL','AVERAGE','MIN','MAX'].includes(op))&&distinctRaw.some(v=>typeof v!=='number'||!Number.isFinite(v)))return this.fail('VALUE_TYPE_CONFLICT',{semantic:ir,values:distinctRaw});
    if((op==='SUM'||op==='TOTAL')&&results.length>1&&distinctRaw.length<values.length&&distinctRaw.length===1){};
    if((op==='SUM'||op==='TOTAL')&&results.length>1){const uniqueRecords=[...new Map(entries.map(e=>[`${e.record.dataset}::${e.record.locator}::${e.field.path}`,e])).values()];const sum=uniqueRecords.reduce((a,e)=>a+(typeof e.field.value==='number'?e.field.value:0),0);return this.finishValue(sum,uniqueRecords,ir,op,country,resource)}
    return this.finishValue(operation.value,entries,ir,op,country,resource);
  }
  finishCount(results,ir,asset,country,resource){const map=new Map;for(const r of results.flatMap(x=>x.records||[])){const identity=r.identityValues.find(x=>x&&!/^\d+$/.test(x));const key=`${r.dataset}::${identity||r.locator}`;map.set(key,r)}if(!map.size)return this.fail('RECORD_NOT_FOUND',{semantic:ir,assetClass:asset});const records=[...map.values()],evidence=records.map(r=>this.makeEvidence(r,null,ir,'COUNT',asset));return{ok:true,status:'VERIFIED_FACT',value:records.length,unit:'COUNT',operation:'COUNT',target:{assetClass:asset,countryId:country?.id||null,resourceId:resource?.id||null},evidence,trace:this.trace(ir,results,evidence),provenance:this.provenance(ir,evidence)}}
  finishValue(value,entries,ir,op,country,resource){if(value===null||value===undefined)return this.fail('VALUE_NOT_FOUND',{semantic:ir});const ev=entries.map(e=>this.makeEvidence(e.record,e.field,ir,op,null,e.path));return{ok:true,status:'VERIFIED_FACT',value,operation:op,target:{countryId:country?.id||null,resourceId:resource?.id||null},evidence:ev,trace:this.trace(ir,[{extracted:entries}],ev),provenance:this.provenance(ir,ev)}}
  operation(op,values){try{if(op==='GET'||op==='QUANTITY'||op==='SELECT'||op==='LIST')return{value:values.length===1?values[0]:values};if(op==='COUNT')return{value:values.length};const nums=values.filter(v=>typeof v==='number'&&Number.isFinite(v));if(['SUM','TOTAL'].includes(op))return{value:nums.reduce((a,b)=>a+b,0)};if(op==='AVERAGE')return{value:nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null};if(op==='MIN')return{value:nums.length?Math.min(...nums):null};if(op==='MAX')return{value:nums.length?Math.max(...nums):null};if(op==='DISTINCT')return{value:[...new Set(values.map(v=>JSON.stringify(v)))].map(x=>JSON.parse(x))};return{value:values.length===1?values[0]:values}}catch(e){return{status:'OPERATION_UNSUPPORTED',error:e.message}}}
  makeEvidence(record,field,ir,op,asset,pathInfo){return{dataset:record?.dataset||null,physicalPath:record?.fileEntry?.physicalPath||null,logicalDataset:record?.meta?.dataset||null,recordLocator:record?.locator||null,fieldPath:field?.path||null,canonicalEntityId:record?.identityValues?.[0]||null,entityType:record?.entityType||'UNKNOWN',property:ir?.property||null,assetClass:asset||null,rawValue:field?field.value:(record?true:null),operation:op,relationPath:A(pathInfo),authority:field?.method||'IDENTITY_REGISTRY',source:record?.fileEntry?.source||null}}
  trace(ir,results,evidence){return[{stage:'QUESTION_INTERPRETATION',status:'RECEIVED'},{stage:'QUERY_IR',operation:ir?.operation||null,property:ir?.property||null},{stage:'IDENTITY_RESOLUTION',countryId:ir?.ids?.country||ir?.entities?.country?.id||null,resourceId:ir?.ids?.resource||ir?.entities?.resource?.id||null},{stage:'DATASET_DISCOVERY',candidates:results.map(x=>x.plan?.dataset).filter(Boolean)},{stage:'RECORD_GRAPH',resultSets:results.length},{stage:'FIELD_RESOLUTION',evidenceCount:evidence.length},{stage:'DETERMINISTIC_OPERATION',operation:ir?.operation||null},{stage:'VALIDATION',status:'PASSED'},{stage:'EVIDENCE',count:evidence.length}]}
  provenance(ir,evidence){return{question:ir?.raw||'',ids:ir?.ids||{},operation:ir?.operation||null,property:ir?.property||null,evidence:evidence.map(e=>({dataset:e.dataset,physicalPath:e.physicalPath,recordLocator:e.recordLocator,fieldPath:e.fieldPath,canonicalEntityId:e.canonicalEntityId}))}}
  fail(status,extra={}){return{ok:false,status,value:null,evidence:[],...extra,trace:[{stage:'FAILURE',status}]}}
  buildEvidenceLedger(result){return{status:result?.status||'UNRESOLVED',value:result?.value??null,facts:A(result?.evidence),trace:A(result?.trace),provenance:result?.provenance||null,evidence:A(result?.evidence)}}
  lookup(id){const r=this.resolveExactId(id);return{...r,records:r.records.map(x=>({dataset:x.dataset,physicalPath:x.fileEntry?.physicalPath,locator:x.locator,entityType:x.entityType,identityValues:x.identityValues,aliases:x.aliasValues.slice(0,40)}))}}
  buildExecutionPlan(ir){this.ensure();return this.buildPlan(ir)}
  index(){this.ensure();return{report:this.report(),files:this.catalogView(),records:this.records.map(r=>({dataset:r.dataset,locator:r.locator,entityType:r.entityType,identities:r.identityValues,fields:r.fields.map(f=>f.path)})),relations:this.relations,edges:[...this.edgesOut.values()].flat().map(e=>({from:`${e.from.dataset}::${e.from.locator}`,to:`${e.to.dataset}::${e.to.locator}`,relation:e.relation,fieldPath:e.fieldPath,source:e.source}))}}
  resolveResources(q){this.ensure();return this.lookupText(q,'RESOURCE').slice(0,20).map(x=>({id:x.record.identityValues[0]||null,type:x.record.entityType,name:x.record.aliasValues[0]||null,dataset:x.record.dataset,locator:x.record.locator,score:x.score}))}
  traverse(start,relationId,targetType){this.ensure();const starts=start?.id?this.resolveExactId(start.id).records:[];if(!starts.length)return{status:'RECORD_NOT_FOUND',records:[]};const found=[];for(const r of starts){const ns=this.relationNeighbours(r,'OUT',relationId);for(const n of ns)if(!targetType||n.entityType==='UNKNOWN'||n.entityType===U(targetType))found.push(n)}const unique=[...new Map(found.map(r=>[`${r.dataset}::${r.locator}`,r])).values()];return{status:unique.length?'OK':'RELATION_PATH_NOT_FOUND',records:unique}}
  refresh(){return this.initialize({rootDir:this.root,knowledge:this.k,discover:true,force:true})}
}

let runtime=null;function getRuntime(){if(!runtime)runtime=new DeepCoreRuntime;return runtime}
function initializeRepository(options={}){runtime=new DeepCoreRuntime(options);return runtime.initialize(options)}
function ensureRepository(datasets=[]){return getRuntime().ensure(datasets)}
function execute(parsed,datasets=[],language='en',ctx={}){return getRuntime().execute(parsed,datasets,language,ctx)}
function index(datasets=[]){ensureRepository(datasets);return getRuntime().index()}
function buildExecutionPlan(parsed,datasets,ctx={}){ensureRepository(datasets);return getRuntime().buildExecutionPlan(parsed,ctx)}
function buildEvidenceLedger(result){return getRuntime().buildEvidenceLedger(result)}
function resolveResources(q){return getRuntime().resolveResources(q)}
function lookupId(id){return getRuntime().lookup(id)}
function catalog(){ensureRepository();return getRuntime().catalogView()}
function diagnostics(){ensureRepository();return getRuntime().report()}
function traverse(start,relationId,targetType){return getRuntime().traverse(start,relationId,targetType)}
const api={VERSION,initializeRepository,ensureRepository,execute,index,buildExecutionPlan,buildEvidenceLedger,resolveResources,lookupId,catalog,diagnostics,traverse,schema:(dataset)=>getRuntime().schema(dataset),refresh:()=>getRuntime().refresh(),securityFor:(country,re)=>execute({raw:'',operation:'GET',property:'RESOURCE_SECURITY',entities:{country:country?{id:country.id}:null,resource:re?{id:re.id}:null}},[],'en',{}),supplierRows:()=>[],composeAnswer:a=>a?.text||'',realizeVerb:(subject,verb)=>S(verb)};
global.OfflineQueryEngine=api;global.OmegaDeepCoreRuntime=getRuntime();if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
