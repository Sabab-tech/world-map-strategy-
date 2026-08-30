/**
 * OFFLINE SEMANTIC BRAIN v2.0.0
 * No country/resource/world-state catalog is embedded here.
 * Runtime datasets are the only source of world entities and facts.
 * Language vocabulary is loaded as data and may be replaced without code changes.
 */
(function (global) {
  'use strict';

  const VERSION = '2.0.0';
  const LEARNED_KEY = 'OMEGA_OFFLINE_SEMANTIC_LEARNING_V2';
  let runtime = { countries: [], resources: [], vocabulary: null, datasets: [] };

  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;'"(){}\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const isBn = v => /[\u0980-\u09FF]/.test(text(v));
  const words = v => norm(v).split(/\s+/).filter(Boolean);
  const object = v => v && typeof v === 'object';

  function storage() { try { return global.localStorage || null; } catch (_) { return null; } }
  function learned() { const s=storage(); if(!s) return {}; try{return JSON.parse(s.getItem(LEARNED_KEY)||'{}');}catch(_){return{};} }
  function saveLearned(v) { const s=storage(); if(!s)return false; try{s.setItem(LEARNED_KEY,JSON.stringify(v));return true;}catch(_){return false;} }
  function learn(surface,type,id,confidence=1) {
    if(!surface||!type||!id||confidence<0.90)return false;
    const m=learned(); m[`${type}:${norm(surface)}`]={type,id,confidence,updatedAt:Date.now()};
    const ks=Object.keys(m); while(ks.length>512) delete m[ks.shift()]; return saveLearned(m);
  }

  function flatten(v,path=[],out=[]) {
    if(!object(v)) return out;
    if(Array.isArray(v)){v.forEach((x,i)=>flatten(x,path.concat(String(i)),out));return out;}
    for(const [k,x] of Object.entries(v)){const p=path.concat(k);out.push({key:k,path:p,value:x});if(object(x))flatten(x,p,out);} return out;
  }

  function idOf(v,keyHint='') {
    if(!object(v)) return text(keyHint).toUpperCase() || null;
    const candidates=[v.id,v.iso,v.iso3,v.isoCode,v.countryCode,v.code,v.canonical_id,v.canonicalId,keyHint];
    const x=candidates.find(x=>/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(text(x)));
    return x ? text(x).toUpperCase() : null;
  }

  function namesOf(v,keyHint='') {
    if(!object(v)) return keyHint ? [keyHint] : [];
    const keys=['name','countryName','officialName','shortName','displayName','label','title','resourceName','canonicalName','localName','nativeName','name_en','name_bn','identity'];
    const out=[];
    for(const k of keys){const x=v[k]; if(typeof x==='string'&&x.trim())out.push(x); else if(object(x)){for(const y of Object.values(x))if(typeof y==='string'&&y.trim())out.push(y);}}
    if(keyHint) out.push(keyHint.replace(/[_-]+/g,' '));
    return [...new Set(out.map(text).filter(Boolean))];
  }

  function collectRuntimeEntities(datasets) {
    const countries=new Map(), resources=new Map();
    const add=(map,id,names,meta)=>{if(!id)return;const e=map.get(id)||{id,names:new Set(),meta:meta||null};names.forEach(n=>e.names.add(n));map.set(id,e);};
    const visit=(node,keyHint='')=>{
      if(!object(node))return;
      const key=norm(keyHint);
      const id=idOf(node,keyHint);
      const names=namesOf(node,keyHint);
      const looksCountry = !!id && (id.length===3 || /country|sovereign|nation|state|countryprofile/.test(key));
      const looksResource = !!id && /resource|commodity|mineral|hydrocarbon|fuel|ore|metal/.test(key);
      if(looksCountry) add(countries,id,names,node);
      if(looksResource) add(resources,id,names,node);
      for(const [k,x] of Object.entries(node)) if(object(x)) visit(x,k);
    };
    datasets.forEach(d=>visit(d));
    return {countries:[...countries.values()].map(e=>({...e,names:[...e.names]})),resources:[...resources.values()].map(e=>({...e,names:[...e.names]}))};
  }

  function configure(options={}) {
    const datasets=Array.isArray(options.datasets)?options.datasets.filter(object):[];
    const entities=collectRuntimeEntities(datasets);
    runtime={countries:entities.countries,resources:entities.resources,vocabulary:options.vocabulary||null,datasets};
    return {version:VERSION,countries:runtime.countries.length,resources:runtime.resources.length};
  }

  function vocabularyFor(lang) {
    const v=runtime.vocabulary||{}; return v.languages?.[lang]||v.languages?.en||{};
  }

  function matchPhrases(q,groups) {
    const hits=[]; if(!object(groups))return hits;
    for(const [semantic,aliases] of Object.entries(groups)){
      for(const alias of Array.isArray(aliases)?aliases:[]){const a=norm(alias);if(a&&q.includes(a))hits.push({semantic,alias,score:a.length});}
    }
    return hits.sort((a,b)=>b.score-a.score);
  }

  function detectQuestion(q,lang) {
    const v=vocabularyFor(lang), h=matchPhrases(q,v.question||{});
    if(!h.length)return {type:'UNKNOWN',confidence:0};
    const best=h[0];
    const map={what:'IDENTIFY',who:'PERSON',which:'SELECT',where:'LOCATION',when:'TIME',why:'CAUSE',how:'METHOD',how_many:'COUNT',how_much:'QUANTITY',should:'POLICY',can:'FEASIBILITY',will:'FORECAST'};
    return {type:map[best.semantic]||best.semantic,phrase:best.alias,confidence:Math.min(.99,.60+best.score/100)};
  }

  function detectOperator(q,lang) {
    const h=matchPhrases(q,vocabularyFor(lang).operators||{}); return h[0]?.semantic||null;
  }

  function resolveEntity(q,entities,type) {
    const hits=[];
    for(const e of entities){for(const n of e.names){const a=norm(n);if(!a)continue;if(q===a)hits.push({e,n,score:1});else if(q.includes(a))hits.push({e,n,score:Math.min(.98,.65+a.length/Math.max(100,q.length*3))});}}
    for(const [k,v] of Object.entries(learned())) if(v.type===type&&q.includes(k.slice(type.length+1))) hits.push({e:{id:v.id,names:[k.slice(type.length+1)]},n:k.slice(type.length+1),score:v.confidence});
    hits.sort((a,b)=>b.score-a.score || b.n.length-a.n.length);
    if(!hits.length)return {id:null,type,confidence:0,source:'UNRESOLVED'};
    const best=hits[0], second=hits[1]?.score||0;
    if(best.score<.80 || best.score-second<.06)return {id:null,type,confidence:best.score,source:'AMBIGUOUS',candidates:hits.slice(0,5).map(x=>({id:x.e.id,surface:x.n,confidence:x.score}))};
    return {id:best.e.id,type,confidence:best.score,source:'RUNTIME_DATASET',surface:best.n};
  }

  function inferAsset(q) {
    const n=norm(q);
    const patterns=[
      [/\bmines?\b|\bmining site(s)?\b|\bquarr(y|ies)\b|খনি|খনিগুলো|খনিগুলি/i,'MINE'],
      [/\bdeposits?\b|ডিপোজিট|খনিজ মজুদ/i,'DEPOSIT'],
      [/\boil fields?\b|তেলক্ষেত্র|তেল ক্ষেত্র/i,'OIL_FIELD'],
      [/\bgas fields?\b|গ্যাসক্ষেত্র|গ্যাস ক্ষেত্র/i,'GAS_FIELD'],
      [/\brefiner(y|ies)\b|\bsmelter(s)?\b|রিফাইনারি|স্মেল্টার/i,'FACILITY']
    ];
    for(const [r,id] of patterns)if(r.test(n))return {id,type:'ASSET_CLASS',confidence:.96,source:'LANGUAGE_VOCABULARY'};
    return {id:null,type:'ASSET_CLASS',confidence:0,source:'UNRESOLVED'};
  }

  function parse(question,context={}) {
    const surface=text(question), q=norm(surface), lang=isBn(surface)?'bn':'en';
    const questionType=detectQuestion(q,lang);
    const country=resolveEntity(q,runtime.countries,'COUNTRY');
    const resource=resolveEntity(q,runtime.resources,'RESOURCE');
    const asset=inferAsset(q);
    if(!country.id&&/^[A-Z]{3}$/.test(text(context.countryId||'').toUpperCase())){country.id=text(context.countryId).toUpperCase();country.confidence=1;country.source='RUNTIME_CONTEXT';}
    if(!resource.id&&text(context.resourceId)){resource.id=text(context.resourceId).toUpperCase();resource.confidence=1;resource.source='RUNTIME_CONTEXT';}
    const operation=questionType.type==='COUNT'?'COUNT':questionType.type==='QUANTITY'?'QUANTITY':questionType.type==='LOCATION'?'LOCATE':questionType.type==='SELECT'?'SELECT':questionType.type==='CAUSE'?'ANALYZE_CAUSE':questionType.type==='POLICY'?'EVALUATE_POLICY':questionType.type==='FEASIBILITY'?'CHECK_FEASIBILITY':questionType.type==='FORECAST'?'FORECAST':detectOperator(q,lang)||questionType.type;
    let intent='GENERAL_QUERY';
    if(asset.id)intent='RESOURCE_MINING_DISCOVERY';
    else if(resource.id)intent='RESOURCE_QUERY';
    if(operation==='ANALYZE_CAUSE')intent='CAUSAL_ANALYSIS';
    if(operation==='EVALUATE_POLICY')intent='POLICY_EVALUATION';
    if(operation==='LOCATE')intent='LOCATION_QUERY';
    const unresolved=[];
    if(!country.id && /country|nation|বাংলাদেশ|ভারত|চীন|দেশ|রাষ্ট্র/i.test(q))unresolved.push('COUNTRY');
    if(!resource.id && /(resource|commodity|mineral|oil|gas|coal|iron|তেল|গ্যাস|কয়লা|কয়লা|লোহা|সম্পদ|খনিজ)/i.test(q))unresolved.push('RESOURCE');
    const executable=unresolved.length===0 && (country.id||resource.id||intent==='GENERAL_QUERY');
    return Object.freeze({version:VERSION,source:'OFFLINE_SEMANTIC_BRAIN',surface,language:lang,question:questionType,intent,operation,entities:{country,resource,asset},context:{countryId:context.countryId||null,resourceId:context.resourceId||null},unresolved,confidence:Math.min(country.id?country.confidence:1,resource.id?resource.confidence:1,asset.id?asset.confidence:1),executable});
  }

  function indexDatasetForQuery(query) {
    const n=norm(query); const hits=[];
    const walk=(node,path=[])=>{
      if(!object(node))return;
      if(Array.isArray(node)){node.forEach((x,i)=>walk(x,path.concat(i)));return;}
      const blob=norm(Object.entries(node).filter(([k,v])=>typeof v==='string').map(([k,v])=>`${k} ${v}`).join(' '));
      if(blob&&n.split(' ').filter(w=>w.length>2).some(w=>blob.includes(w)))hits.push({path,value:node});
      for(const [k,x] of Object.entries(node))if(object(x))walk(x,path.concat(k));
    };
    runtime.datasets.forEach(d=>walk(d)); return hits.slice(0,200);
  }

  function explain(parsed){return {language:parsed.language,questionType:parsed.question.type,intent:parsed.intent,operation:parsed.operation,countryId:parsed.entities.country.id,resourceId:parsed.entities.resource.id,assetClass:parsed.entities.asset.id,unresolved:parsed.unresolved,confidence:parsed.confidence,executable:parsed.executable,runtimeCountryCount:runtime.countries.length,runtimeResourceCount:runtime.resources.length};}

  const api=Object.freeze({VERSION,configure,parse,explain,learn,recall:learned,indexDatasetForQuery});
  global.OfflineSemanticBrain=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
