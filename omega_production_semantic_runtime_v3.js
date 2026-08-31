/**
 * OMEGA PRODUCTION SEMANTIC RUNTIME V3
 *
 * Purpose:
 *   Turn natural-language questions into a data-driven semantic query.
 *
 * Non-negotiable rules:
 *   - World entities are NEVER catalogued in JavaScript.
 *   - Country/resource/minister identity comes from runtime datasets or the
 *     authoritative MinisterStateRegistry.
 *   - Question words are language knowledge, not executable answers.
 *   - No country/resource-specific answer is hardcoded.
 *   - Every answer carries evidence/source information and unresolved fields.
 *
 * Runtime pipeline:
 *   text -> language -> question semantics -> entity resolution -> target
 *   resolution -> source routing -> deterministic execution -> evidence -> NLG
 */
(function(global){
  'use strict';
  if(global.OmegaProductionSemanticRuntime) return;

  const VERSION = '3.0.0-PRODUCTION';
  const text = v => String(v == null ? '' : v).trim();
  const lower = v => text(v).toLowerCase();
  const object = v => v && typeof v === 'object';
  const arr = v => Array.isArray(v) ? v : [];
  const finite = v => Number.isFinite(Number(v));
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const norm = v => text(v).normalize('NFKC')
    .replace(/[?!,.:;'"(){}\[\]<>]/g,' ')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const bn = v => /[\u0980-\u09FF]/.test(text(v));

  const state = {
    ready: false,
    vocabulary: null,
    knowledge: null,
    countries: [],
    resources: [],
    ministers: [],
    datasets: new Map(),
    countryById: new Map(),
    resourceById: new Map(),
    ministerById: new Map(),
    aliasIndex: new Map(),
    questionIndex: new Map(),
    attributeIndex: new Map(),
    config: {},
    errors: [],
    version: VERSION
  };

  function addError(code, detail){ state.errors.push({code, detail: detail || null, at: Date.now()}); if(state.errors.length > 100) state.errors.shift(); }

  function storage(){ try { return global.localStorage || null; } catch(_) { return null; } }
  const LEARN_KEY = 'OMEGA_SEMANTIC_LEARNING_V3';
  function learned(){
    const s = storage(); if(!s) return {};
    try { return JSON.parse(s.getItem(LEARN_KEY) || '{}'); } catch(_) { return {}; }
  }
  function learn(surface, entityType, canonicalId, confidence){
    const c = Number(confidence);
    if(!surface || !entityType || !canonicalId || !Number.isFinite(c) || c < .95) return false;
    const m = learned();
    m[`${entityType}:${norm(surface)}`] = { entityType, canonicalId:String(canonicalId), confidence:c, updatedAt:Date.now() };
    const keys = Object.keys(m); while(keys.length > 512) delete m[keys.shift()];
    const s = storage(); if(!s) return false;
    try { s.setItem(LEARN_KEY, JSON.stringify(m)); return true; } catch(_) { return false; }
  }

  function pathGet(root, paths){
    for(const path of paths){
      let v=root, ok=true;
      for(const k of path.split('.')){
        if(!object(v) || !(k in v)){ ok=false; break; }
        v=v[k];
      }
      if(ok && v !== null && v !== undefined) return v;
    }
    return null;
  }

  function idCandidates(v, fallback){
    if(!object(v)) return fallback ? [String(fallback)] : [];
    return [v.id,v.canonicalId,v.canonical_id,v.iso3,v.isoCode,v.countryCode,v.code,v.key,v.ministerId,fallback]
      .filter(x => x !== null && x !== undefined && text(x))
      .map(text);
  }

  function namesOf(v, fallback){
    if(!object(v)) return fallback ? [text(fallback)] : [];
    const keys=['name','countryName','officialName','shortName','displayName','label','title','resourceName','canonicalName','localName','nativeName','name_en','name_bn','baseName','ministerName','displayName'];
    const out=[];
    for(const k of keys){
      const x=v[k];
      if(typeof x==='string' && x.trim()) out.push(x);
      else if(object(x)) for(const y of Object.values(x)) if(typeof y==='string' && y.trim()) out.push(y);
    }
    if(fallback) out.push(text(fallback).replace(/[_-]+/g,' '));
    return [...new Set(out.map(text).filter(Boolean))];
  }

  function aliasesForName(name){
    const n=norm(name), out=new Set([n]);
    if(!n) return [];
    const suffixes=state.config.morphology?.bn_suffixes || [];
    for(const s of suffixes){ const ns=norm(s); if(ns && n.endsWith(ns) && n.length>ns.length+1) out.add(n.slice(0,-ns.length)); }
    const enSuffixes=state.config.morphology?.en_suffixes || [];
    for(const s of enSuffixes){ const ns=norm(s); if(ns && n.endsWith(ns) && n.length>ns.length+2) out.add(n.slice(0,-ns.length)); }
    return [...out];
  }

  function addAlias(type, id, surface, source){
    for(const a of aliasesForName(surface)){
      if(!a) continue;
      const key=`${type}:${a}`;
      const bucket=state.aliasIndex.get(key)||[];
      if(!bucket.some(x=>x.id===id)) bucket.push({id,source:source||'DATASET'});
      state.aliasIndex.set(key,bucket);
    }
  }

  function addEntity(type, raw, fallbackId, source){
    const ids=idCandidates(raw,fallbackId);
    const id=ids[0]; if(!id) return null;
    const names=[...new Set([...namesOf(raw,fallbackId),...ids])];
    for(const n of names) addAlias(type,id,n,source);
    return {id, type, names, raw:clone(raw), source:source||'DATASET'};
  }

  function registerCountry(raw, fallback){
    const e=addEntity('COUNTRY',raw,fallback,'countries.json'); if(!e) return;
    const id=e.id.toUpperCase(); e.id=id;
    state.countryById.set(id,e); state.countries=[...state.countryById.values()];
  }
  function registerResource(raw, fallback){
    const e=addEntity('RESOURCE',raw,fallback,'RESOURCE_DATASET'); if(!e) return;
    const id=e.id.toUpperCase(); e.id=id;
    state.resourceById.set(id,e); state.resources=[...state.resourceById.values()];
  }
  function registerMinister(raw, fallback){
    const e=addEntity('MINISTER',raw,fallback,'ministers.json'); if(!e) return;
    state.ministerById.set(e.id,e); state.ministers=[...state.ministerById.values()];
    addAlias('PERSON',e.id,e.id,'ministers.json');
  }

  function registerDataset(name,data){
    if(!name || data == null) return false;
    state.datasets.set(String(name),data);
    harvestDataset(data,String(name));
    return true;
  }

  function harvestDataset(node,source,path=''){
    if(!object(node)) return;
    if(Array.isArray(node)){ node.forEach((x,i)=>harvestDataset(x,source,`${path}[${i}]`)); return; }
    const key=lower(path.split('.').pop()||'');
    const id=text(node.id||node.canonicalId||node.canonical_id||node.iso3||node.isoCode||node.countryCode||node.code||'');
    const type=lower(node.type||node.entityType||node.entity_type||'');
    if(id && (/country|nation|sovereign/.test(type)||/country|countries|countryprofile/.test(key))) registerCountry(node,id);
    if(id && (/resource|commodity|mineral|hydrocarbon|ore|metal|fuel/.test(type)||/resource|resources|commodity|commodities|mineral|minerals/.test(key))) registerResource(node,id);
    for(const [k,v] of Object.entries(node)) if(object(v)) harvestDataset(v,source,path?`${path}.${k}`:k);
  }

  function ingestCountries(raw){
    const list=Array.isArray(raw)?raw:(raw?.countries||raw?.data||Object.values(raw||{}));
    list.forEach((x,i)=>registerCountry(x,x?.code||x?.iso3||x?.id||`COUNTRY_${i+1}`));
  }
  function ingestResources(raw){
    if(!raw || (object(raw)&&Object.keys(raw).length===0)) return;
    const root=raw?.resources||raw?.resourceDatabase||raw?.RESOURCE_DATABASE||raw?.COMMODITY_ONTOLOGIES||raw;
    if(Array.isArray(root)) root.forEach((x,i)=>registerResource(x,x?.id||x?.key||x?.code||`RESOURCE_${i+1}`));
    else if(object(root)) Object.entries(root).forEach(([k,v])=>{
      if(object(v)) registerResource(v,k); else if(typeof v==='string') registerResource({id:k,name:v},k);
    });
  }
  function ingestMinisters(raw){
    const db=raw?.ministers_database||raw?.ministers||raw;
    if(!object(db)) return;
    for(const [ministry,items] of Object.entries(db)) if(Array.isArray(items)) items.forEach(x=>registerMinister({...x,ministryId:x?.ministryId||ministry},x?.id));
  }

  function questionSemantics(){
    const q=state.knowledge?.question_semantics || {};
    const v=state.vocabulary?.languages || {};
    for(const lang of Object.keys(v)) for(const [sem,phrases] of Object.entries(v[lang]?.question||{})){
      const canonical=state.config.questionMap?.[sem] || sem.toUpperCase();
      for(const p of arr(phrases)) state.questionIndex.set(`${lang}:${norm(p)}`,canonical);
    }
    for(const [sem,obj] of Object.entries(q)) for(const p of arr(obj?.names)){
      const lang=/[\u0980-\u09FF]/.test(p)?'bn':'en';
      state.questionIndex.set(`${lang}:${norm(p)}`,sem);
    }
  }

  function buildAttributeIndex(){
    const groups=state.config.attributes || {};
    for(const [attribute,phrases] of Object.entries(groups)) for(const p of arr(phrases)){
      const lang=/[\u0980-\u09FF]/.test(p)?'bn':'en'; state.attributeIndex.set(`${lang}:${norm(p)}`,attribute);
    }
  }

  function bestPhrase(q,index,lang){
    const hits=[];
    for(const [k,value] of index.entries()){
      const [l,phrase]=k.split(':'); if(l!==lang || !phrase) continue;
      if(q===phrase) hits.push({value,phrase,score:1});
      else if(q.includes(phrase)) hits.push({value,phrase,score:0.65+Math.min(.3,phrase.length/Math.max(80,q.length*2))});
    }
    hits.sort((a,b)=>b.score-a.score||b.phrase.length-a.phrase.length);
    return hits[0]||null;
  }

  function detectQuestion(q,lang){
    const direct=bestPhrase(q,state.questionIndex,lang);
    if(direct) return {type:direct.value,phrase:direct.phrase,confidence:direct.score};
    const words=q.split(' ');
    const joined=words.slice(0,2).join(' ');
    const two=state.questionIndex.get(`${lang}:${joined}`);
    if(two) return {type:two,phrase:joined,confidence:.9};
    return {type:'UNKNOWN',phrase:null,confidence:0};
  }

  function detectAttribute(q,lang){ return bestPhrase(q,state.attributeIndex,lang); }

  function entityHits(q,type){
    const hits=[];
    for(const e of type==='COUNTRY'?state.countries:type==='RESOURCE'?state.resources:state.ministers){
      for(const n of e.names){
        const nn=norm(n); if(!nn) continue;
        const variants=aliasesForName(n);
        for(const a of variants){
          if(q===a) hits.push({e,n,score:1});
          else if(q.includes(a)) hits.push({e,n,score:Math.min(.98,.62+a.length/Math.max(80,q.length*2))});
        }
      }
    }
    const learnedMap=learned();
    for(const x of Object.values(learnedMap)) if(x.entityType===type){
      const key=norm(Object.keys(learnedMap).find(k=>learnedMap[k]===x)?.split(':').slice(1).join(':')||'');
      if(key && q.includes(key)) hits.push({e:{id:x.canonicalId,type,names:[key],source:'LEARNED'},n:key,score:x.confidence});
    }
    hits.sort((a,b)=>b.score-a.score||b.n.length-a.n.length);
    return hits;
  }

  function resolveEntity(q,type){
    const hits=entityHits(q,type);
    if(!hits.length) return {id:null,type,confidence:0,source:'UNRESOLVED',candidates:[]};
    const best=hits[0], second=hits[1]?.score||0;
    const min=Number(state.config.ambiguity?.minimumConfidence ?? .82);
    const margin=Number(state.config.ambiguity?.marginOverSecondBest ?? .08);
    if(best.score<min || (second && best.score-second<margin)) return {id:null,type,confidence:best.score,source:'AMBIGUOUS',surface:best.n,candidates:hits.slice(0,5).map(x=>({id:x.e.id,surface:x.n,confidence:x.score}))};
    return {id:best.e.id,type,confidence:best.score,source:best.e.source||'RUNTIME_DATASET',surface:best.n,raw:clone(best.e.raw)};
  }

  function currentCountry(context){
    const candidates=[context?.countryId,context?.countryCode,global.Game?.state?.countryId,global.Game?.state?.playerCountryId,global.Game?.countryId,global.Game?.currentActiveCountry,global.currentActiveCountry];
    const value=candidates.find(x=>x!==undefined&&x!==null&&text(x));
    if(!value) return null;
    const resolved=resolveEntity(norm(value),'COUNTRY');
    return resolved.id || text(value).toUpperCase();
  }

  function currentMinistry(context){
    return text(context?.ministryId || global.Game?.state?.activeMinistryId || global.OmegaMinisterState?.activeMinistryId || '');
  }

  function activeMinister(context){
    const country=currentCountry(context), ministry=currentMinistry(context);
    const registry=global.OmegaMinisterStateRegistry;
    if(registry && country && ministry && typeof registry.getActiveMinister==='function'){
      try { const m=registry.getActiveMinister(country,ministry); if(m) return m; } catch(_) {}
    }
    const ids=[context?.ministerId,global.Game?.state?.activeMinisterId,global.OmegaMinisterState?.activeMinisterId,global.OmegaCabinetUI?.currentInterrogatedMinister?.ministerId];
    for(const id of ids){ if(!id) continue; const e=state.ministerById.get(String(id)); if(e) return e; }
    return null;
  }

  function pronounTarget(q,context){
    const m=activeMinister(context);
    const hasYou=/(^|\s)(you|your|yours|yourself)(\s|$)|তুমি|তোমার|আপনি|আপনার|নিজের/.test(q);
    const hasOur=/(^|\s)(our|ours|we)(\s|$)|আমাদের|আমরা/.test(q);
    return {minister:m, usesYou:hasYou, usesOur:hasOur};
  }

  function operationFromQuestion(qtype,attribute){
    const map={COUNT:'COUNT',QUANTITY:'QUANTITY',IDENTIFY:'IDENTIFY',SELECT:'SELECT',PERSON:'PERSON',LOCATION:'LOCATE',TIME:'TIME',METHOD:'EXPLAIN_METHOD',CAUSE:'ANALYZE_CAUSE',POLICY:'EVALUATE_POLICY',FEASIBILITY:'CHECK_FEASIBILITY',FORECAST:'FORECAST'};
    if(attribute) return 'ATTRIBUTE';
    return map[qtype] || 'UNKNOWN';
  }

  function inferTargetDomain(q,entities,context){
    if(entities.minister?.id || /(\byour\b|\byou\b|\bminister\b|মন্ত্র|তোমার|আপনার)/.test(q)) return 'MINISTER';
    if(entities.country?.id && entities.resource?.id) return 'COUNTRY_RESOURCE';
    if(entities.resource?.id) return 'RESOURCE';
    if(entities.country?.id) return 'COUNTRY';
    if(activeMinister(context)) return 'MINISTER';
    return 'GENERAL';
  }

  function parse(question,context={}){
    const surface=text(question), language=bn(surface)?'bn':'en', q=norm(surface);
    const questionWord=detectQuestion(q,language);
    const attributeHit=detectAttribute(q,language);
    const country=resolveEntity(q,'COUNTRY');
    const resource=resolveEntity(q,'RESOURCE');
    let minister=resolveEntity(q,'MINISTER');
    const pronouns=pronounTarget(q,context);
    if(!minister.id && pronouns.usesYou && pronouns.minister) minister={id:pronouns.minister.ministerId||pronouns.minister.id,type:'MINISTER',confidence:1,source:'AUTHORITATIVE_ACTIVE_MINISTER'};
    const operation=operationFromQuestion(questionWord.type,attributeHit?.value||null);
    const targetDomain=inferTargetDomain(q,{country,resource,minister},context);
    const unresolved=[];
    if(targetDomain==='MINISTER' && !minister.id) unresolved.push('MINISTER');
    if(operation==='COUNT' && !country.id && !resource.id) unresolved.push('SUBJECT');
    return Object.freeze({
      version:VERSION,surface,normalized:q,language,
      question:{type:questionWord.type,phrase:questionWord.phrase,confidence:questionWord.confidence},
      attribute:attributeHit?{name:attributeHit.value,phrase:attributeHit.phrase,confidence:attributeHit.score}:null,
      targetDomain,operation,
      entities:{country,resource,minister},
      pronouns:{usesYou:pronouns.usesYou,usesOur:pronouns.usesOur},
      context:{countryId:currentCountry(context),ministryId:currentMinistry(context)},
      unresolved,
      confidence:Math.min(questionWord.confidence||1,country.id?country.confidence:1,resource.id?resource.confidence:1,minister.id?minister.confidence:1),
      executable:unresolved.length===0 && questionWord.type!=='UNKNOWN'
    });
  }

  function ministerRecord(id){
    const registry=global.OmegaMinisterStateRegistry;
    if(registry && typeof registry.getMinister==='function'){
      try { const x=registry.getMinister(id); if(x) return {runtime:true,value:x}; } catch(_) {}
    }
    const raw=state.ministerById.get(String(id)); return raw?{runtime:false,value:raw}:null;
  }

  function ministerAttribute(id,attribute){
    const rec=ministerRecord(id); if(!rec) return null;
    const v=rec.value;
    const profile=v.staticProfile||v.profile||v.identity||v;
    const runtime=v.runtimeState||v.runtime||null;
    const learning=v.learningState||v.learning||null;
    const map={
      name:profile?.baseName||profile?.name||v.name||v.ministerId||id,
      age:profile?.baseAge??profile?.age??null,
      background:profile?.background??null,
      gender:profile?.gender??null,
      role:profile?.role||runtime?.ministryId||null,
      ministry:runtime?.ministryId||profile?.ministryId||null,
      country:runtime?.countryId||profile?.countryId||null,
      experience:learning?.totalServiceTime??null,
      stress:runtime?.stress??null,
      workload:runtime?.workload??null
    };
    return {value:map[attribute] ?? null,profile:clone(profile),runtime:clone(runtime),learning:clone(learning),source:rec.runtime?'MINISTER_STATE_REGISTRY':'ministers.json'};
  }

  function allRuntimeData(){
    const out=[...state.datasets.values()];
    const globals=[global.ResourceMinistryEngine,global.WorldEcosystemEngine,global.Game?.state,global.gameState,global.Omega?.World,global.Omega?.Resource,global.Omega?.Resources];
    for(const g of globals) if(g) out.push(g);
    return out;
  }

  function countryResourceState(countryId,resourceId){
    const engine=global.ResourceMinistryEngine;
    if(engine && typeof engine.getIntegratedResourceState==='function'){
      try { const s=engine.getIntegratedResourceState(countryId); if(s) return {value:s,source:'ResourceMinistryEngine'}; } catch(_) {}
    }
    const hits=[];
    const aliases=state.resourceById.get(resourceId)?.names||[resourceId];
    const visit=(v,path=[])=>{
      if(!object(v)) return;
      if(Array.isArray(v)){v.forEach((x,i)=>visit(x,path.concat(i)));return;}
      const blob=norm(Object.keys(v).map(k=>`${k} ${typeof v[k]==='string'?v[k]:''}`).join(' '));
      const countryish=path.some(p=>norm(p)===norm(countryId)||norm(p).includes(norm(countryId)));
      const resourceish=aliases.some(a=>blob.includes(norm(a))) || blob.includes(norm(resourceId));
      if(countryish && resourceish) hits.push({path,value:v});
      for(const [k,x] of Object.entries(v)) if(object(x)) visit(x,path.concat(k));
    };
    allRuntimeData().forEach(x=>visit(x));
    return hits.length?{value:hits,source:'RUNTIME_DATASET_SEARCH'}:null;
  }

  function assetRecords(countryId,resourceId,assetClass){
    const records=[];
    const aliases=(state.resourceById.get(resourceId)?.names||[resourceId]).map(norm);
    const assetWords=(state.vocabulary?.languages?.en?.assets?.[assetClass]||[]).map(norm);
    const assetWordsBn=(state.vocabulary?.languages?.bn?.assets?.[assetClass]||[]).map(norm);
    const words=[...new Set([...assetWords,...assetWordsBn,assetClass.toLowerCase()])];
    const visit=(v,path=[])=>{
      if(!object(v)) return;
      if(Array.isArray(v)){v.forEach((x,i)=>visit(x,path.concat(String(i))));return;}
      const keys=Object.keys(v).map(norm).join(' ');
      const blob=norm(JSON.stringify(v));
      const countryMatch=blob.includes(norm(countryId)) || path.some(p=>norm(p)===norm(countryId));
      const resourceMatch=!resourceId || aliases.some(a=>blob.includes(a)) || blob.includes(norm(resourceId));
      const assetMatch=words.some(w=>w && (keys.includes(w)||path.some(p=>norm(p).includes(w))));
      if(countryMatch && resourceMatch && assetMatch) records.push({path,value:v});
      for(const [k,x] of Object.entries(v)) if(object(x)) visit(x,path.concat(k));
    };
    allRuntimeData().forEach(x=>visit(x));
    const seen=new Set(); return records.filter(r=>{const k=r.path.join('.');if(seen.has(k))return false;seen.add(k);return true;});
  }

  function locationFields(records){
    const out=[];
    const visit=(v,path=[])=>{
      if(!object(v)) return;
      if(Array.isArray(v)){v.forEach((x,i)=>visit(x,path.concat(String(i))));return;}
      for(const [k,x] of Object.entries(v)){
        const key=norm(k);
        if(typeof x==='string' && /(location|region|province|district|city|site|field|basin|deposit|address|latitude|longitude|lat|lng|lon|coordinates|area)/i.test(key)) out.push({field:k,value:x,path:path.concat(k)});
        else if(object(x)) visit(x,path.concat(k));
      }
    };
    records.forEach(r=>visit(r.value,r.path));
    const seen=new Set(); return out.filter(x=>{const k=`${x.field}:${x.value}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,100);
  }

  function execute(parsed,context={}){
    if(!state.ready) return {ok:false,reason:'SEMANTIC_RUNTIME_NOT_READY',text:parsed.language==='bn'?'অফলাইন ভাষা ও ডেটা স্তর এখনো প্রস্তুত হচ্ছে।':'The offline language and data layer is still loading.'};
    const e=parsed.entities;
    if(parsed.targetDomain==='MINISTER'){
      if(!e.minister.id) return {ok:false,reason:'MINISTER_UNRESOLVED',candidates:e.minister.candidates||[],text:parsed.language==='bn'?'বর্তমান মন্ত্রী নির্ধারণ করা যায়নি।':'I could not resolve the current minister.'};
      const attr=parsed.attribute?.name;
      if(parsed.operation==='ATTRIBUTE' && attr){
        const a=ministerAttribute(e.minister.id,attr);
        if(!a || a.value===null || a.value===undefined) return {ok:false,reason:'ATTRIBUTE_UNAVAILABLE',text:parsed.language==='bn'?`এই মন্ত্রীর ${attr} তথ্য পাওয়া যায়নি।`:`The minister's ${attr} value is not available.`};
        return {ok:true,operation:'ATTRIBUTE',target:e.minister.id,attribute:attr,value:a.value,source:a.source,evidence:{profile:a.profile,runtime:a.runtime,learning:a.learning}};
      }
      const rec=ministerRecord(e.minister.id);
      return {ok:!!rec,operation:'IDENTIFY',target:e.minister.id,value:rec?.value||null,source:rec?.runtime?'MINISTER_STATE_REGISTRY':'ministers.json'};
    }
    if(parsed.operation==='COUNT'){
      const country=e.country.id, resource=e.resource.id;
      const asset=assetRecords(country,resource,context.assetClass||'MINE');
      return {ok:true,operation:'COUNT',count:asset.length,countryId:country||null,resourceId:resource||null,assetClass:context.assetClass||'MINE',evidencePaths:asset.slice(0,50).map(x=>x.path.join('.')),source:'RUNTIME_DATASET_SEARCH'};
    }
    if(parsed.operation==='LOCATE'){
      const country=e.country.id, resource=e.resource.id;
      const asset=assetRecords(country,resource,context.assetClass||'MINE');
      const loc=locationFields(asset);
      return {ok:true,operation:'LOCATE',count:asset.length,locations:loc,source:'RUNTIME_DATASET_SEARCH',evidencePaths:asset.slice(0,50).map(x=>x.path.join('.'))};
    }
    if(parsed.operation==='QUANTITY' && e.resource.id && e.country.id){
      const s=countryResourceState(e.country.id,e.resource.id);
      if(!s) return {ok:false,reason:'RESOURCE_STATE_UNAVAILABLE',text:parsed.language==='bn'?'এই দেশের এই সম্পদের রানটাইম পরিমাণের তথ্য নেই।':'No runtime quantity data is available for this country-resource pair.'};
      return {ok:true,operation:'QUANTITY',countryId:e.country.id,resourceId:e.resource.id,value:s.value,source:s.source};
    }
    if(parsed.operation==='IDENTIFY' && e.resource.id){
      const r=state.resourceById.get(e.resource.id); return {ok:!!r,operation:'IDENTIFY',value:r?.raw||null,source:r?.source||'RESOURCE_DATASET'};
    }
    if(parsed.operation==='IDENTIFY' && e.country.id){
      const c=state.countryById.get(e.country.id); return {ok:!!c,operation:'IDENTIFY',value:c?.raw||null,source:'countries.json'};
    }
    return {ok:false,reason:'OPERATION_NOT_IMPLEMENTED',text:parsed.language==='bn'?'প্রশ্নটি বোঝা হয়েছে, কিন্তু এই অপারেশনের জন্য নির্ভরযোগ্য রানটাইম ডেটা/গণনা পথ নেই।':'The question was understood, but no reliable runtime data/execution path is available for this operation.'};
  }

  function format(plan,result){
    if(!result?.ok) return result?.text || (plan.language==='bn'?'নির্ভরযোগ্য তথ্য পাওয়া যায়নি।':'Reliable runtime evidence is not available.');
    const bng=plan.language==='bn';
    if(result.operation==='ATTRIBUTE'){
      const label={name:'নাম',age:'বয়স',background:'ব্যাকগ্রাউন্ড',gender:'লিঙ্গ',role:'পদ',ministry:'মন্ত্রণালয়',country:'দেশ',experience:'সার্ভিস অভিজ্ঞতা',stress:'স্ট্রেস',workload:'ওয়ার্কলোড'}[result.attribute]||result.attribute;
      return bng?`${label}: ${result.value}`:`${result.attribute}: ${result.value}`;
    }
    if(result.operation==='COUNT') return bng?`রানটাইম ডেটা অনুযায়ী ${result.countryId||'নির্দিষ্ট দেশের'}-এ ${result.resourceId?result.resourceId+' সম্পর্কিত ':''}${result.assetClass} রেকর্ডের সংখ্যা: ${result.count}।`:`Runtime data reports ${result.count} ${result.assetClass}${result.resourceId?' records for '+result.resourceId:''} in ${result.countryId||'the requested country'}.`;
    if(result.operation==='LOCATE'){
      const names=result.locations||[];
      return bng?`রানটাইম ডেটায় ${result.count}টি রেকর্ড পাওয়া গেছে। অবস্থান-সংক্রান্ত ${names.length}টি তথ্য উদ্ধার করা হয়েছে। ${names.slice(0,20).map(x=>x.field+': '+x.value).join('; ')}`:`The runtime dataset contains ${result.count} matching records. Location evidence: ${names.slice(0,20).map(x=>x.field+': '+x.value).join('; ')||'no explicit location field was exposed'}.`;
    }
    if(result.operation==='IDENTIFY'){
      if(result.value?.baseName||result.value?.name||result.value?.id) return bng?`পরিচয়: ${result.value.baseName||result.value.name||result.value.id}`:`Identity: ${result.value.baseName||result.value.name||result.value.id}`;
      return JSON.stringify(result.value||{},null,2);
    }
    return JSON.stringify(result.value??result,null,2);
  }

  function buildAnswerPlan(question,identity,world,history){
    const context={
      countryId:identity?.countryCode||world?.countryCode||world?.gameState?.countryCode,
      ministryId:identity?.ministryId,
      ministerId:identity?.ministerId
    };
    const parsed=parse(question,context);
    const result=execute(parsed,context);
    return Object.freeze({version:VERSION,language:parsed.language,question:parsed.question,intent:parsed.targetDomain,operation:parsed.operation,entities:parsed.entities,semantic:parsed,identity:identity||null,history:arr(history).slice(-24),result,derived:result?.operation==='COUNT'?[{metric:'count',value:result.count}]:[]});
  }

  function formatOfflineAnswer(plan){ return format(plan,plan?.result); }

  async function load(path){ const r=await fetch(path,{cache:'no-store'}); if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); }

  async function init(){
    try{
      const [v,k,c,m,o,r] = await Promise.all([
        load('/offline_language_vocabulary.json'),
        load('/offline_semantic_knowledge.json'),
        load('/countries.json'),
        load('/ministers.json'),
        load('/resource_ontology.json'),
        load('/resources.json')
      ]);
      state.vocabulary=v; state.knowledge=k; state.config={
        morphology:{...(v.morphology||{})},
        ambiguity:{...(k.ambiguity_policy||{})},
        attributes:{
          name:['name','your name','what is your name','নাম','তোমার নাম','আপনার নাম','নাম কী'],
          age:['age','old','how old','your age','বয়স','বয়স','কত বছর বয়স'],
          background:['background','career background','পরিচয়','ব্যাকগ্রাউন্ড','পেশাগত পরিচয়'],
          gender:['gender','লিঙ্গ'],role:['role','position','পদ','দায়িত্ব'],ministry:['ministry','মন্ত্রণালয়','মন্ত্রণালয়ে'],country:['country','দেশ'],
          experience:['experience','service experience','অভিজ্ঞতা'],stress:['stress','স্ট্রেস'],workload:['workload','কাজের চাপ']
        },
        questionMap:{how_many:'COUNT',how_much:'QUANTITY',what:'IDENTIFY',who:'PERSON',which:'SELECT',where:'LOCATION',when:'TIME',why:'CAUSE',how:'METHOD',should:'POLICY',can:'FEASIBILITY',will:'FORECAST'}
      };
      ingestCountries(c); ingestMinisters(m); ingestResources(o); ingestResources(r);
      registerDataset('countries.json',c); registerDataset('ministers.json',m); registerDataset('resource_ontology.json',o); registerDataset('resources.json',r);
      questionSemantics(); buildAttributeIndex();
      state.ready=true;
      global.dispatchEvent(new CustomEvent('OMEGA_SEMANTIC_RUNTIME_READY',{detail:{version:VERSION,countries:state.countries.length,resources:state.resources.length,ministers:state.ministers.length}}));
      return diagnostics();
    }catch(err){ state.ready=false; addError('SEMANTIC_BOOT_FAILED',err.message); console.error('[OMEGA Semantic Runtime]',err); return diagnostics(); }
  }

  function diagnostics(){
    return {version:VERSION,ready:state.ready,countries:state.countries.length,resources:state.resources.length,ministers:state.ministers.length,datasets:[...state.datasets.keys()],errors:clone(state.errors)};
  }
  function explain(question,context){ const p=parse(question,context); return {language:p.language,question:p.question,attribute:p.attribute,targetDomain:p.targetDomain,operation:p.operation,entities:p.entities,pronouns:p.pronouns,unresolved:p.unresolved,confidence:p.confidence,executable:p.executable}; }

  const api={VERSION,init,configure:(o={})=>{Object.assign(state.config,o);questionSemantics();buildAttributeIndex();return diagnostics();},registerDataset,parse,explain,execute,buildAnswerPlan,formatOfflineAnswer,learn,diagnostics,recall:learned,getState:()=>({ready:state.ready,countries:state.countries.length,resources:state.resources.length,ministers:state.ministers.length})};
  global.OmegaProductionSemanticRuntime=api;
  global.OmegaAIIntegrity=Object.freeze({
    VERSION,
    canonicalMinisterIdentity(input={}){return {countryCode:text(input.countryCode||input.country||'UNKNOWN').toUpperCase(),countryName:text(input.countryName||input.country||''),ministryId:text(input.ministryId||'').toUpperCase(),ministerId:text(input.ministerId||input.id||''),name:text(input.ministerName||input.name||input.id||''),role:text(input.ministerRole||input.role||''),age:finite(input.age)?Number(input.age):null,background:text(input.background||''),ideology:typeof input.ideology==='string'?input.ideology:input.ideology?.type||'',efficiency:finite(input.efficiency)?Number(input.efficiency):null,profileSource:text(input.profileSource||'RUNTIME_CANONICAL_IDENTITY')}} ,
    buildAnswerPlan,formatOfflineAnswer,parse,explain,diagnostics,learn,recall:learned
  });
  global.MinisterQueryRouter=Object.freeze({VERSION,routeMinisterQuery(prompt,ministerContext={},worldContext={}){const p=parse(prompt,{...ministerContext,...worldContext});return {version:VERSION,intent:p.targetDomain,domain:p.targetDomain,entities:Object.values(p.entities).filter(x=>x?.id).map(x=>({type:x.type,id:x.id,confidence:x.confidence,source:x.source,surface:x.surface})),requiredData:[p.entities.country.id?'COUNTRY_PROFILE':null,p.entities.resource.id?'RESOURCE_ENTITY':null,p.operation],semantic:p,executable:p.executable};}});
  init();
})(typeof globalThis!=='undefined'?globalThis:window);
