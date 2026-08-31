/* OMEGA PRODUCTION SEMANTIC RUNTIME V4
 * Runtime language understanding + deterministic evidence routing.
 *
 * LANGUAGE -> vocabulary JSON
 * ENTITY IDENTITY -> runtime datasets / MinisterStateRegistry
 * QUESTION MEANING -> vocabulary JSON
 * DATA ROUTING -> semantic operation + resolved entity types
 * ANSWER -> runtime evidence only
 *
 * No country/resource/minister facts are hardcoded here.
 */
(function(global){
  'use strict';
  if(global.OmegaProductionSemanticRuntime && global.OmegaProductionSemanticRuntime.VERSION === '4.0.0-PRODUCTION') return;

  const VERSION='4.0.0-PRODUCTION';
  const text=v=>String(v==null?'':v).trim();
  const norm=v=>text(v).normalize('NFKC').replace(/[?!,.:;'"(){}\[\]<>]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  const obj=v=>v&&typeof v==='object';
  const arr=v=>Array.isArray(v)?v:[];
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const bengali=v=>/[\u0980-\u09FF]/.test(text(v));
  const finite=v=>Number.isFinite(Number(v));

  const state={ready:false,vocabulary:null,knowledge:null,config:{},errors:[],countries:new Map(),resources:new Map(),ministers:new Map(),datasets:new Map(),question:new Map(),attributes:new Map(),assets:new Map(),operators:new Map()};

  function storage(){try{return global.localStorage||null}catch(_){return null}}
  const LEARN_KEY='OMEGA_SEMANTIC_LEARNING_V4';
  function recall(){const s=storage();if(!s)return{};try{return JSON.parse(s.getItem(LEARN_KEY)||'{}')}catch(_){return{}}}
  function learn(surface,type,id,confidence=.95){
    if(!surface||!type||!id||!finite(confidence)||Number(confidence)<.95)return false;
    const m=recall();m[`${type}:${norm(surface)}`]={entityType:type,canonicalId:String(id),confidence:Number(confidence),updatedAt:Date.now()};
    const keys=Object.keys(m);while(keys.length>512)delete m[keys.shift()];
    const s=storage();if(!s)return false;try{s.setItem(LEARN_KEY,JSON.stringify(m));return true}catch(_){return false}
  }
  function addError(code,detail){state.errors.push({code,detail:detail||null,timestamp:Date.now()});if(state.errors.length>100)state.errors.shift()}
  async function load(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return r.json()}

  function idOf(v,fallback){if(!obj(v))return text(fallback);return text(v.id||v.canonicalId||v.canonical_id||v.iso3||v.isoCode||v.countryCode||v.code||v.key||v.ministerId||fallback)}
  function namesOf(v,fallback){
    if(!obj(v))return fallback?[text(fallback)]:[];
    const keys=['name','countryName','officialName','shortName','displayName','label','title','resourceName','canonicalName','localName','nativeName','name_en','name_bn','baseName','ministerName'];
    const out=[];for(const k of keys){const x=v[k];if(typeof x==='string'&&x.trim())out.push(x);else if(obj(x))for(const y of Object.values(x))if(typeof y==='string'&&y.trim())out.push(y)}
    if(fallback)out.push(text(fallback).replace(/[_-]+/g,' '));return[...new Set(out.map(text).filter(Boolean))]
  }
  function forms(surface){const n=norm(surface),out=new Set([n]);if(!n)return[];for(const s of [...arr(state.config.morphology?.bn_suffixes),...arr(state.config.morphology?.en_suffixes)]){const z=norm(s);if(z&&n.endsWith(z)&&n.length>z.length+1)out.add(n.slice(0,-z.length))}return[...out]}
  function aliasesForEntity(id,names){
    const out=new Set();[...names,id,text(id).replace(/[_-]+/g,' ')].forEach(n=>forms(n).forEach(f=>out.add(f)));
    [...names,id].forEach(n=>norm(n).split(' ').forEach(t=>{if(t.length>=4)out.add(t)}));return[...out].filter(Boolean)
  }
  function register(map,type,raw,fallback,source){
    const id=idOf(raw,fallback);if(!id)return;const names=namesOf(raw,fallback),aliases=aliasesForEntity(id,names),previous=map.get(String(id));
    map.set(String(id),{id:String(id),type,names:[...new Set([...(previous?.names||[]),...names])],aliases:[...new Set([...(previous?.aliases||[]),...aliases])],raw:clone(raw),source})
  }
  function ingestCountries(raw){const list=Array.isArray(raw)?raw:(raw?.countries||raw?.data||Object.values(raw||{}));list.forEach((x,i)=>register(state.countries,'COUNTRY',x,x?.id||x?.iso3||x?.code||`COUNTRY_${i+1}`,'countries.json'))}
  function ingestMinisters(raw){const db=raw?.ministers_database||raw?.ministers||raw;if(!obj(db))return;for(const[m,items]of Object.entries(db))if(Array.isArray(items))for(const x of items)register(state.ministers,'MINISTER',{...x,ministryId:x?.ministryId||m},x?.id,'ministers.json')}
  function ingestResources(raw,source){
    if(!obj(raw)||!Object.keys(raw).length)return;
    const roots=[raw?.resources,raw?.resourceDatabase,raw?.RESOURCE_DATABASE,raw?.resource_types,raw?.GSRSK_Master_Resource_Data_v14?.resource_types].filter(Boolean);if(!roots.length)roots.push(raw);
    for(const root of roots){if(Array.isArray(root))root.forEach((x,i)=>register(state.resources,'RESOURCE',x,x?.id||x?.key||`RESOURCE_${i+1}`,source));else if(obj(root))for(const[k,v]of Object.entries(root))register(state.resources,'RESOURCE',obj(v)?v:{id:k,name:v},k,source)}
  }
  function indexLanguageData(){
    state.question.clear();state.attributes.clear();state.assets.clear();state.operators.clear();
    for(const[lang,data]of Object.entries(state.vocabulary?.languages||{})){
      for(const[k,phrases]of Object.entries(data.question||{}))for(const p of arr(phrases))state.question.set(`${lang}:${norm(p)}`,k);
      for(const[k,phrases]of Object.entries(data.attributes||{}))for(const p of arr(phrases))state.attributes.set(`${lang}:${norm(p)}`,k);
      for(const[k,phrases]of Object.entries(data.assets||{}))for(const p of arr(phrases))state.assets.set(`${lang}:${norm(p)}`,k);
      for(const[k,phrases]of Object.entries(data.operators||{}))for(const p of arr(phrases))state.operators.set(`${lang}:${norm(p)}`,k)
    }
  }
  function phrase(q,index,lang){
    const hits=[];for(const[k,v]of index){const i=k.indexOf(':');if(i<0||k.slice(0,i)!==lang)continue;const p=k.slice(i+1);if(!p)continue;if(q===p)hits.push({value:v,phrase:p,score:1});else if(q.includes(p))hits.push({value:v,phrase:p,score:.72+Math.min(.26,p.length/Math.max(100,q.length*2))})}
    hits.sort((a,b)=>b.score-a.score||b.phrase.length-a.phrase.length);return hits[0]||null
  }
  function entityHits(q,map,type){
    const hits=[];for(const e of map.values())for(const a of e.aliases){if(!a)continue;if(q===a)hits.push({e,a,score:1});else if(q.includes(a))hits.push({e,a,score:Math.min(.98,.70+a.length/Math.max(100,q.length*2))})}
    const learnedMap=recall();for(const[k,v]of Object.entries(learnedMap))if(v.entityType===type){const surface=k.slice(type.length+1);if(q.includes(surface))hits.push({e:{id:v.canonicalId,type,names:[surface],aliases:[surface],source:'LEARNED',raw:null},a:surface,score:v.confidence})}
    hits.sort((a,b)=>b.score-a.score||b.a.length-a.a.length);return hits
  }
  function resolve(q,map,type){
    const hits=entityHits(q,map,type);if(!hits.length)return{id:null,type,confidence:0,source:'UNRESOLVED',candidates:[]};const best=hits[0],second=hits[1]?.score||0,min=Number(state.config.ambiguity?.minimumConfidence??.82),margin=Number(state.config.ambiguity?.marginOverSecondBest??.08);
    if(best.score<min||(second&&best.score-second<margin))return{id:null,type,confidence:best.score,source:'AMBIGUOUS',surface:best.a,candidates:hits.slice(0,5).map(x=>({id:x.e.id,surface:x.a,confidence:x.score}))};
    return{id:best.e.id,type,confidence:best.score,source:best.e.source||'RUNTIME_DATASET',surface:best.a,raw:clone(best.e.raw)}
  }
  function pronounPhrases(lang,key){return arr(state.vocabulary?.languages?.[lang]?.pronouns?.[key]).map(norm)}
  function hasPronoun(q,lang,key){return pronounPhrases(lang,key).some(p=>p&&(q===p||q.includes(` ${p} `)||q.startsWith(`${p} `)||q.endsWith(` ${p}`)))}
  function activeMinister(context){
    const registry=global.OmegaMinisterStateRegistry,country=text(context?.countryId||context?.countryCode||global.Game?.state?.countryId||global.Game?.state?.playerCountryId||global.Game?.currentActiveCountry||'').toUpperCase(),ministry=text(context?.ministryId||global.Game?.state?.activeMinistryId||'');
    if(registry&&country&&ministry&&typeof registry.getActiveMinister==='function')try{const m=registry.getActiveMinister(country,ministry);if(m)return m}catch(_){}
    for(const id of [context?.ministerId,global.Game?.state?.activeMinisterId,global.OmegaMinisterState?.activeMinisterId,global.OmegaCabinetUI?.currentInterrogatedMinister?.ministerId])if(id){const e=state.ministers.get(String(id));if(e)return e.raw||e}return null
  }
  function currentCountry(context){const value=[context?.countryId,context?.countryCode,global.Game?.state?.countryId,global.Game?.state?.playerCountryId,global.Game?.countryId,global.Game?.currentActiveCountry].find(x=>x!==undefined&&x!==null&&text(x));if(!value)return null;const q=norm(value);return resolve(q,state.countries,'COUNTRY').id||text(value).toUpperCase()}

  function parse(question,context={}){
    const surface=text(question),lang=bengali(surface)?'bn':'en',q=norm(surface),qw=phrase(q,state.question,lang),attr=phrase(q,state.attributes,lang),asset=phrase(q,state.assets,lang),opWord=phrase(q,state.operators,lang),country=resolve(q,state.countries,'COUNTRY'),resource=resolve(q,state.resources,'RESOURCE');
    let minister=resolve(q,state.ministers,'MINISTER');const self=hasPronoun(q,lang,'SELF'),player=hasPronoun(q,lang,'PLAYER'),am=activeMinister(context);
    if(!minister.id&&self&&am){const id=am.ministerId||am.id;minister={id,type:'MINISTER',confidence:1,source:'AUTHORITATIVE_ACTIVE_MINISTER',surface:'SELF',raw:am.staticProfile||am.profile||am}}
    const qtype=qw?.value||'UNKNOWN',attribute=attr?.value||null;
    const operation=attribute?'ATTRIBUTE':({what:'IDENTIFY',who:'PERSON',whom:'PERSON',which:'SELECT',where:'LOCATE',when:'TIME',why:'CAUSE',how:'METHOD',how_many:'COUNT',how_much:'QUANTITY',how_old:'ATTRIBUTE',should:'POLICY',can:'FEASIBILITY',will:'FORECAST'}[qtype]||opWord?.value?.toUpperCase()||'UNKNOWN');
    const targetDomain=minister.id||self?'MINISTER':country.id&&resource.id?'COUNTRY_RESOURCE':resource.id?'RESOURCE':country.id?'COUNTRY':self?'MINISTER':'GENERAL';const unresolved=[];
    if(targetDomain==='MINISTER'&&!minister.id)unresolved.push('MINISTER');if((operation==='COUNT'||operation==='LOCATE')&&!country.id&&!resource.id)unresolved.push('SUBJECT');
    return Object.freeze({version:VERSION,surface,normalized:q,language:lang,question:{type:qtype,phrase:qw?.phrase||null,confidence:qw?.score||0},attribute:attribute?{name:attribute,phrase:attr.phrase,confidence:attr.score}:null,assetClass:asset?.value||null,operator:opWord?.value||null,pronouns:{self,player},targetDomain,operation,entities:{country,resource,minister},context:{countryId:currentCountry(context),ministryId:text(context?.ministryId||global.Game?.state?.activeMinistryId||'')},unresolved,confidence:Math.min(qw?.score||1,country.id?country.confidence:1,resource.id?resource.confidence:1,minister.id?minister.confidence:1),executable:unresolved.length===0&&operation!=='UNKNOWN'})
  }

  function ministerAttribute(id,attribute){
    let raw=null,source='ministers.json';const registry=global.OmegaMinisterStateRegistry;if(registry&&typeof registry.getMinister==='function')try{raw=registry.getMinister(id);if(raw)source='MINISTER_STATE_REGISTRY'}catch(_){}if(!raw)raw=state.ministers.get(String(id))?.raw;if(!raw)return null;
    const p=raw.staticProfile||raw.profile||raw.identity||raw,rt=raw.runtimeState||raw.runtime||{},l=raw.learningState||raw.learning||{};const values={name:p.baseName??p.name??raw.name??raw.ministerId??id,age:p.baseAge??p.age,background:p.background,gender:p.gender,role:p.role??rt.ministryId??p.ministryId,ministry:rt.ministryId??p.ministryId,country:rt.countryId??p.countryId,experience:l.totalServiceTime,stress:rt.stress,workload:rt.workload,skill:p.baseStats??p.stats};return{value:values[attribute],profile:clone(p),runtime:clone(rt),learning:clone(l),source}
  }

  function allRuntimeData(){return[...state.datasets.values(),global.ResourceMinistryEngine,global.WorldEcosystemEngine,global.Game?.state,global.gameState,global.Omega?.World,global.Omega?.Resources,global.Omega?.Resource].filter(Boolean)}
  function walk(v,path,out){if(!obj(v))return;if(Array.isArray(v)){v.forEach((x,i)=>walk(x,path.concat(String(i)),out));return}out.push({value:v,path});for(const[k,x]of Object.entries(v))if(obj(x))walk(x,path.concat(k),out)}
  function resourceAliases(id){return(state.resources.get(String(id))?.aliases||[norm(id)]).map(norm)}
  function assetAliases(assetClass,lang){return arr(state.vocabulary?.languages?.[lang]?.assets?.[assetClass]).map(norm)}
  function matchingRecords(countryId,resourceId,assetClass){
    const all=[];for(const root of allRuntimeData())walk(root,[],all);const ra=resourceAliases(resourceId),aw=[...new Set([...assetAliases(assetClass,'en'),...assetAliases(assetClass,'bn'),norm(assetClass)])];
    return all.filter(e=>{const blob=norm(JSON.stringify(e.value)),path=e.path.map(norm).join(' '),cm=!countryId||blob.includes(norm(countryId))||path.includes(norm(countryId)),rm=!resourceId||ra.some(a=>a&&blob.includes(a))||blob.includes(norm(resourceId)),am=!assetClass||aw.some(a=>a&&(blob.includes(a)||path.includes(a)));return cm&&rm&&am}).filter((e,i,a)=>a.findIndex(x=>x.path.join('.')===e.path.join('.'))===i)
  }
  function resourceLocationRecords(countryId,resourceId){
    const all=[];for(const root of allRuntimeData())walk(root,[],all);const ra=resourceAliases(resourceId);return all.filter(e=>{const blob=norm(JSON.stringify(e.value)),path=e.path.map(norm).join(' '),cm=!countryId||blob.includes(norm(countryId))||path.includes(norm(countryId)),rm=ra.some(a=>a&&blob.includes(a))||blob.includes(norm(resourceId));return cm&&rm&&e.value&&typeof e.value==='object'}).slice(0,500)
  }
  function locationFields(records){
    const out=[];const visit=(v,path)=>{if(!obj(v))return;if(Array.isArray(v)){v.forEach((x,i)=>visit(x,path.concat(String(i))));return}for(const[k,x]of Object.entries(v)){const key=norm(k);if(typeof x==='string'&&/(location|region|province|district|city|site|field|basin|deposit|address|area|zone|coordinates|latitude|longitude|lat|lng|lon)/i.test(key))out.push({field:k,value:x,path:path.concat(k)});else if(obj(x))visit(x,path.concat(k))}};records.forEach(e=>visit(e.value,e.path));const seen=new Set();return out.filter(x=>{const k=`${x.field}:${x.value}`;if(seen.has(k))return false;seen.add(k);return true}).slice(0,100)
  }
  function countryResourceState(countryId,resourceId){const e=global.ResourceMinistryEngine;if(e&&typeof e.getIntegratedResourceState==='function')try{const v=e.getIntegratedResourceState(countryId);if(v)return{value:v,source:'ResourceMinistryEngine'}}catch(_){}const rows=resourceLocationRecords(countryId,resourceId);return rows.length?{value:rows,source:'RUNTIME_DATASET_SEARCH'}:null}

  function execute(parsed,context={}){
    if(!state.ready)return{ok:false,reason:'SEMANTIC_RUNTIME_NOT_READY',text:parsed.language==='bn'?'অফলাইন ভাষা ও ডেটা স্তর এখনো প্রস্তুত হচ্ছে।':'The offline language and data layer is still loading.'};const e=parsed.entities;
    if(parsed.targetDomain==='MINISTER'){
      if(!e.minister.id)return{ok:false,reason:'MINISTER_UNRESOLVED',candidates:e.minister.candidates||[],text:parsed.language==='bn'?'বর্তমান মন্ত্রী নির্ধারণ করা যায়নি।':'I could not resolve the current minister.'};
      if(parsed.operation==='ATTRIBUTE'){const a=ministerAttribute(e.minister.id,parsed.attribute?.name);if(!a||a.value===null||a.value===undefined)return{ok:false,reason:'ATTRIBUTE_UNAVAILABLE',text:parsed.language==='bn'?'এই মন্ত্রীর অনুরোধ করা তথ্য পাওয়া যায়নি।':'The requested minister attribute is not available.'};return{ok:true,operation:'ATTRIBUTE',attribute:parsed.attribute.name,value:a.value,source:a.source,evidence:{profile:a.profile,runtime:a.runtime,learning:a.learning}}}
      const a=ministerAttribute(e.minister.id,'name');return{ok:true,operation:'IDENTIFY',target:e.minister.id,value:a?.profile||e.minister.raw||null,source:a?.source||'ministers.json'}
    }
    if(parsed.operation==='COUNT'){const country=e.country.id||parsed.context.countryId||null,resource=e.resource.id||null,assetClass=parsed.assetClass||context.assetClass||null,rows=matchingRecords(country,resource,assetClass);return{ok:true,operation:'COUNT',count:rows.length,countryId:country,resourceId:resource,assetClass:assetClass||'RESOURCE_RECORD',evidencePaths:rows.slice(0,100).map(x=>x.path.join('.')),source:'RUNTIME_DATASET_SEARCH'}}
    if(parsed.operation==='LOCATE'){const country=e.country.id||parsed.context.countryId||null,resource=e.resource.id||null,assetClass=parsed.assetClass||context.assetClass||null,rows=assetClass?matchingRecords(country,resource,assetClass):resourceLocationRecords(country,resource);return{ok:true,operation:'LOCATE',count:rows.length,locations:locationFields(rows),countryId:country,resourceId:resource,assetClass:assetClass||null,evidencePaths:rows.slice(0,100).map(x=>x.path.join('.')),source:'RUNTIME_DATASET_SEARCH'}}
    if(parsed.operation==='QUANTITY'&&e.country.id&&e.resource.id){const s=countryResourceState(e.country.id,e.resource.id);if(!s)return{ok:false,reason:'RESOURCE_STATE_UNAVAILABLE',text:parsed.language==='bn'?'এই দেশ-সম্পদ জোড়ার নির্ভরযোগ্য রানটাইম পরিমাণ পাওয়া যায়নি।':'No reliable runtime quantity is available for this country-resource pair.'};return{ok:true,operation:'QUANTITY',countryId:e.country.id,resourceId:e.resource.id,value:s.value,source:s.source}}
    if(parsed.operation==='IDENTIFY'&&e.resource.id){const r=state.resources.get(String(e.resource.id));return{ok:!!r,operation:'IDENTIFY',value:r?.raw||null,source:r?.source||'RESOURCE_DATASET'}}
    if(parsed.operation==='IDENTIFY'&&e.country.id){const c=state.countries.get(String(e.country.id));return{ok:!!c,operation:'IDENTIFY',value:c?.raw||null,source:'countries.json'}}
    return{ok:false,reason:'OPERATION_NOT_IMPLEMENTED',text:parsed.language==='bn'?'প্রশ্নের অর্থ নির্ধারণ করা হয়েছে, কিন্তু নির্ভরযোগ্য রানটাইম নির্বাহ-পথ নেই।':'The question meaning was resolved, but no reliable runtime execution path exists for it.'}
  }
  function format(plan,result){
    if(!result?.ok)return result?.text||(plan.language==='bn'?'নির্ভরযোগ্য রানটাইম তথ্য পাওয়া যায়নি।':'Reliable runtime evidence is not available.');
    if(result.operation==='ATTRIBUTE')return plan.language==='bn'?`${plan.attribute?.name||result.attribute}: ${result.value}`:`${result.attribute}: ${result.value}`;
    if(result.operation==='COUNT')return plan.language==='bn'?`রানটাইম ডেটা অনুযায়ী ${result.countryId||'নির্দিষ্ট দেশের'}${result.resourceId?' '+result.resourceId+'-সম্পর্কিত':''} ${result.assetClass||'রেকর্ড'} সংখ্যা ${result.count}টি।`:`Runtime data reports ${result.count} ${result.assetClass||'matching records'}${result.resourceId?' for '+result.resourceId:''}${result.countryId?' in '+result.countryId:''}.`;
    if(result.operation==='LOCATE'){const loc=result.locations||[];return plan.language==='bn'?`রানটাইম ডেটায় ${result.count}টি মিল পাওয়া গেছে। অবস্থান-সংক্রান্ত তথ্য: ${loc.slice(0,20).map(x=>`${x.field}: ${x.value}`).join('; ')||'স্পষ্ট অবস্থান ফিল্ড নেই'}.`:`The runtime dataset contains ${result.count} matches. Location evidence: ${loc.slice(0,20).map(x=>`${x.field}: ${x.value}`).join('; ')||'no explicit location field was exposed'}.`}
    if(result.operation==='IDENTIFY'){const v=result.value||{};return plan.language==='bn'?`পরিচয়: ${v.baseName||v.name||v.id||JSON.stringify(v)}`:`Identity: ${v.baseName||v.name||v.id||JSON.stringify(v)}`}
    return JSON.stringify(result.value??result,null,2)
  }
  function buildAnswerPlan(question,identity={},world={},history=[]){const context={countryId:identity.countryCode||world.countryCode,ministryId:identity.ministryId,ministerId:identity.ministerId},semantic=parse(question,context),result=execute(semantic,context);return Object.freeze({version:VERSION,language:semantic.language,question:semantic.question,attribute:semantic.attribute,intent:semantic.targetDomain,operation:semantic.operation,entities:semantic.entities,semantic,identity,history:arr(history).slice(-24),result,derived:result?.operation==='COUNT'?[{metric:'count',value:result.count}]:[]})}
  function diagnostics(){return{version:VERSION,ready:state.ready,countries:state.countries.size,resources:state.resources.size,ministers:state.ministers.size,datasets:[...state.datasets.keys()],errors:clone(state.errors)}}
  function registerDataset(name,data){state.datasets.set(String(name),data);return diagnostics()}
  function installBridge(){
    const ui=global.OmegaCabinetUI;if(!ui||ui.__semanticV4Bridge)return false;ui.__semanticV4Bridge=true;const answer=q=>{const identity={countryCode:text(global.Game?.state?.countryId||global.Game?.state?.playerCountryId||global.Game?.currentActiveCountry||''),ministryId:text(global.Game?.state?.activeMinistryId||''),ministerId:text(global.Game?.state?.activeMinisterId||''),name:''};const p=buildAnswerPlan(q,identity,global.Game?.state||{},[]);return format(p,p.result)};ui.__omegaOfflineAnswer=answer;const original=ui.thinkMinisterQuestion;if(typeof original==='function')ui.thinkMinisterQuestion=function(q,...rest){try{return answer(q)}catch(e){console.warn('[OMEGA Semantic V4] bridge failed',e);return original.call(this,q,...rest)}};return true
  }
  async function init(){
    try{
      const files=['offline_language_vocabulary.json','offline_semantic_knowledge.json','countries.json','ministers.json','resource_ontology.json','resources.json','resources_2.json'];const[v,k,c,m,o,r,r2]=await Promise.all(files.map(load));state.vocabulary=v;state.knowledge=k;state.config={morphology:{...(v.morphology||{})},ambiguity:{...(k.ambiguity_policy||{})}};ingestCountries(c);ingestMinisters(m);ingestResources(o,'resource_ontology.json');ingestResources(r,'resources.json');ingestResources(r2,'resources_2.json');for(const[name,data]of [['countries.json',c],['ministers.json',m],['resource_ontology.json',o],['resources.json',r],['resources_2.json',r2]])registerDataset(name,data);indexLanguageData();state.ready=true;installBridge();global.dispatchEvent(new CustomEvent('OMEGA_SEMANTIC_RUNTIME_READY',{detail:diagnostics()}));return diagnostics()
    }catch(e){state.ready=false;addError('SEMANTIC_BOOT_FAILED',e.message);console.error('[OMEGA Semantic V4]',e);return diagnostics()}
  }
  const api={VERSION,init,parse,execute,buildAnswerPlan,formatOfflineAnswer:p=>format(p,p.result),explain:(q,c)=>{const p=parse(q,c);return{language:p.language,question:p.question,attribute:p.attribute,assetClass:p.assetClass,targetDomain:p.targetDomain,operation:p.operation,entities:p.entities,pronouns:p.pronouns,unresolved:p.unresolved,confidence:p.confidence,executable:p.executable}},diagnostics,registerDataset,learn,recall};
  global.OmegaProductionSemanticRuntime=api;global.OmegaAIIntegrity=Object.freeze({VERSION,canonicalMinisterIdentity(input={}){return{countryCode:text(input.countryCode||input.country||'').toUpperCase(),countryName:text(input.countryName||input.country||''),ministryId:text(input.ministryId||'').toUpperCase(),ministerId:text(input.ministerId||input.id||''),name:text(input.ministerName||input.name||input.id||''),role:text(input.ministerRole||input.role||''),age:finite(input.age)?Number(input.age):null,background:text(input.background||''),ideology:typeof input.ideology==='string'?input.ideology:input.ideology?.type||'',efficiency:finite(input.efficiency)?Number(input.efficiency):null,profileSource:text(input.profileSource||'RUNTIME_CANONICAL_IDENTITY')}},buildAnswerPlan,formatOfflineAnswer:api.formatOfflineAnswer,parse,explain:api.explain,diagnostics,learn,recall});
  global.MinisterQueryRouter=Object.freeze({VERSION,routeMinisterQuery(q,m={},w={}){const p=parse(q,{...m,...w});return{version:VERSION,intent:p.targetDomain,domain:p.targetDomain,entities:Object.values(p.entities).filter(x=>x?.id).map(x=>({type:x.type,id:x.id,confidence:x.confidence,source:x.source,surface:x.surface})),requiredData:[p.entities.country.id?'COUNTRY_PROFILE':null,p.entities.resource.id?'RESOURCE_ENTITY':null,p.assetClass?'ASSET_COLLECTION':null,p.operation].filter(Boolean),semantic:p,executable:p.executable}}});
  init();
})(typeof globalThis!=='undefined'?globalThis:window);
