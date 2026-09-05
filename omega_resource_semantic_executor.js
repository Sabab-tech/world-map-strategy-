/**
 * OMEGA RESOURCE SEMANTIC EXECUTOR v1.0.0
 * Generic ontology-grounded executor for resource potential/importance/use/risk questions.
 * No country/resource-specific answers or invented numeric values are embedded here.
 */
(function(global){
  'use strict';
  if(global.__OMEGA_RESOURCE_SEMANTIC_EXECUTOR__) return;
  global.__OMEGA_RESOURCE_SEMANTIC_EXECUTOR__=true;

  const BN=/[\u0980-\u09FF]/;
  const norm=v=>String(v==null?'':v).normalize('NFKC').toLowerCase().replace(/[?!,.:;\"'“”‘’(){}\[\]<>—–/\\]/g,' ').replace(/\s+/g,' ').trim();
  const words=v=>norm(v).split(/\s+/).filter(Boolean);
  const RESOURCE_TERMS=[
    'potential','prospect','prospects','importance','important','valuable','value','strategic','industrial','economic',
    'use','uses','usage','application','applications','demand','substitute','substitutes','risk','risks','hazard','hazards',
    'সম্ভাবনা','সম্ভাবনাময়','সম্ভাবনাময়','গুরুত্ব','মূল্য','ব্যবহার','ব্যবহারের','কাজ','ঝুঁকি','বিকল্প','চাহিদা'
  ];
  const POTENTIAL_TERMS=['potential','potentials','prospect','prospects','সম্ভাবনা','সম্ভাবনাময়','সম্ভাবনাময়','সম্ভাব্যতা'];
  const STOP=new Set('the is are am was were be been being what is of the and or for to in on from our my your their its how can could would should does do did a an this that about'.split(' '));
  const compact=v=>words(v).filter(x=>!STOP.has(x));

  function getOntology(raw){
    const d=raw?.['resource_ontology.json'];
    return d?.COMMODITY_ONTOLOGIES||d?.commodityOntologies||d?.resources||d||{};
  }
  function flatten(v,path=[],out=[]){
    if(v==null) return out;
    if(Array.isArray(v)){v.forEach((x,i)=>flatten(x,path.concat(i),out));return out;}
    if(typeof v!=='object') return out;
    for(const [k,x] of Object.entries(v)){
      const p=path.concat(k);
      if(['string','number','boolean'].includes(typeof x)) out.push({key:k,path:p.join('.'),value:x});
      else flatten(x,p,out);
    }
    return out;
  }
  function aliases(key,obj){
    const out=[key];
    for(const k of ['key','name','canonicalName','displayName','resourceName','baseName','id']) if(typeof obj?.[k]==='string') out.push(obj[k]);
    if(Array.isArray(obj?.aliases)) out.push(...obj.aliases.filter(x=>typeof x==='string'));
    if(Array.isArray(obj?.synonyms)) out.push(...obj.synonyms.filter(x=>typeof x==='string'));
    return [...new Set(out.map(norm).filter(Boolean))];
  }
  function resolveResource(q,raw,ctx){
    const ontology=getOntology(raw), cq=compact(q);
    let best=null;
    for(const [key,obj] of Object.entries(ontology)){
      if(!obj||typeof obj!=='object') continue;
      let score=0,matched='';
      for(const a of aliases(key,obj)){
        const aw=compact(a); if(!aw.length) continue;
        const hits=aw.filter(x=>cq.includes(x));
        if(hits.length){
          const s=hits.length*4+(aw.length===1&&cq.includes(aw[0])?5:0);
          if(s>score){score=s;matched=a;}
        }
      }
      if(ctx?.resourceId && norm(ctx.resourceId)===norm(key)) score+=20;
      if(score&&(best==null||score>best.score)) best={key,obj,score,matched};
    }
    return best;
  }
  function isPotential(q){const n=norm(q);return POTENTIAL_TERMS.some(t=>n.includes(t));}
  function first(obj,keys){for(const k of keys){if(obj?.[k]!=null)return obj[k];}return null;}
  function sentenceList(v){if(!Array.isArray(v))return [];return v.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean);}
  function evidenceForResource(key,raw){
    const out=[];
    function visit(v,path=[]){
      if(v==null) return;
      if(Array.isArray(v)){v.forEach((x,i)=>visit(x,path.concat(i)));return;}
      if(typeof v!=='object') return;
      const text=norm(path.join(' ')+' '+Object.keys(v).join(' '));
      if(text.includes(norm(key))||text.includes(norm(key).replace(/_/g,' '))){
        const fs=flatten(v,path);
        for(const f of fs){if(/reserve|reserves|production|output|mine|mines|deposit|deposits|grade|capacity|extraction/i.test(norm(f.key+' '+f.path))) out.push(f);}
      }
      for(const [k,x] of Object.entries(v)) if(x&&typeof x==='object') visit(x,path.concat(k));
    }
    visit(raw);
    const seen=new Set();
    return out.filter(x=>{const id=x.path+'|'+String(x.value);if(seen.has(id))return false;seen.add(id);return true;}).slice(0,12);
  }
  function potentialAnswer(q,ctx,data){
    if(!isPotential(q)) return null;
    const r=resolveResource(q,data.raw||{},ctx);
    if(!r) return null;
    const o=r.obj, bn=BN.test(q), name=first(o,['name','displayName','resourceName'])||r.key;
    const cat=first(o,['category']);
    const utilities=sentenceList(first(o,['keyUtilities','uses','applications']));
    const sectors=sentenceList(first(o,['downstreamSectors','downstream','sectors']));
    const dyn=first(o,['enrichmentDynamics','strategicDynamics'])||{};
    const leverage=first(dyn,['strategicLeverage','strategic_leverage']);
    const wealth=first(dyn,['sovereignWealth','economicPotential','economic_potential']);
    const hazards=first(dyn,['hazards','risk','risks']);
    const substitutes=Array.isArray(o.substitutes)?o.substitutes:[];
    const evidence=evidenceForResource(r.key,data.raw||{});
    if(bn){
      const lines=[`সত্তা: ${name}`,cat?`শ্রেণি: ${cat}`:null,'',
        'সম্ভাবনার মূল্যায়ন: ডেটাসেটে একক কোনো সংখ্যাগত “potential score” নেই। তাই বিদ্যমান ontology থেকে কৌশলগত ও শিল্পগত সম্ভাবনা ব্যাখ্যা করা হচ্ছে।',
        utilities.length?'প্রধান ব্যবহার:\n'+utilities.map(x=>`• ${x}`).join('\n'):null,
        sectors.length?'যেসব খাতের সঙ্গে সরাসরি যুক্ত:\n'+sectors.map(x=>`• ${x}`).join('\n'):null,
        leverage?`কৌশলগত সম্ভাবনা: ${leverage}`:null,
        wealth?`অর্থনৈতিক/শিল্পগত সম্ভাবনা: ${wealth}`:null,
        hazards?`প্রধান ঝুঁকি: ${hazards}`:null,
        substitutes.length?'বিকল্পের অবস্থা:\n'+substitutes.map(s=>`• ${s.name||s.key||'বিকল্প'}${s.maxCoverage!=null?` | সর্বোচ্চ কভারেজ ${s.maxCoverage*100}%`:''}${s.costPenalty!=null?` | খরচ গুণক ${s.costPenalty}`:''}`).join('\n'):null,
        evidence.length?'উপলব্ধ দেশ/বিশ্ব ডেটা থেকে সম্পর্কিত মাপা তথ্য:\n'+evidence.map(x=>`• ${x.key}: ${x.value}`).join('\n'):null,
        'সীমাবদ্ধতা: দেশের নাম/মজুত/উৎপাদনের নির্দিষ্ট সংখ্যা প্রশ্নে না থাকলে এবং ডেটায় নির্ভরযোগ্য মাপ না থাকলে আমি তা বানিয়ে দিচ্ছি না।'
      ].filter(x=>x!=null);
      return {ok:true,text:lines.join('\n'),answer:lines.join('\n'),operation:'RESOURCE_POTENTIAL',facts:{resourceId:r.key,category:cat,utilities,sectors,strategicLeverage:leverage,economicPotential:wealth,hazards,evidence},uncertainties:evidence.length?[]:['no_numeric_potential_score'],confidence:.9,source:'RESOURCE_ONTOLOGY_SEMANTIC_EXECUTOR'};
    }
    const lines=[`Resource: ${name}`,cat?`Category: ${cat}`:null,'',
      'Potential assessment: the dataset does not define one numeric potential score, so this is a grounded strategic/industrial assessment from the resource ontology.',
      utilities.length?'Primary uses:\n'+utilities.map(x=>`• ${x}`).join('\n'):null,
      sectors.length?'Directly exposed sectors:\n'+sectors.map(x=>`• ${x}`).join('\n'):null,
      leverage?`Strategic potential: ${leverage}`:null,
      wealth?`Economic/industrial potential: ${wealth}`:null,
      hazards?`Key risks: ${hazards}`:null,
      substitutes.length?'Substitution options:\n'+substitutes.map(s=>`• ${s.name||s.key||'Alternative'}${s.maxCoverage!=null?` | max coverage ${s.maxCoverage*100}%`:''}${s.costPenalty!=null?` | cost multiplier ${s.costPenalty}`:''}`).join('\n'):null,
      evidence.length?'Measured related data found in loaded datasets:\n'+evidence.map(x=>`• ${x.key}: ${x.value}`).join('\n'):null,
      'Limitation: no unsupported reserve, production, or potential number is invented.'
    ].filter(x=>x!=null);
    return {ok:true,text:lines.join('\n'),answer:lines.join('\n'),operation:'RESOURCE_POTENTIAL',facts:{resourceId:r.key,category:cat,utilities,sectors,strategicLeverage:leverage,economicPotential:wealth,hazards,evidence},uncertainties:evidence.length?[]:['no_numeric_potential_score'],confidence:.9,source:'RESOURCE_ONTOLOGY_SEMANTIC_EXECUTOR'};
  }

  async function install(){
    const router=global.MinisterQueryRouter;
    if(!router||typeof router.offlineQuery!=='function'||typeof router.loadData!=='function') return false;
    if(global.__OMEGA_RESOURCE_ROUTER_WRAPPED__) return true;
    const original=router.offlineQuery.bind(router);
    const wrapped=async function(prompt,ctx={}){
      const data=await router.loadData();
      const special=potentialAnswer(String(prompt||''),ctx,data);
      if(special) return special;
      return original(prompt,ctx);
    };
    global.MinisterQueryRouter=Object.assign({},router,{offlineQuery:wrapped,resourcePotentialAnswer:potentialAnswer,RESOURCE_SEMANTIC_EXECUTOR_VERSION:'1.0.0'});
    global.__OMEGA_RESOURCE_ROUTER_WRAPPED__=true;
    return true;
  }
  function boot(){install().catch(e=>console.warn('[OMEGA RESOURCE SEMANTIC]',e));}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  global.OmegaResourceSemanticExecutor={version:'1.0.0',resolveResource,potentialAnswer,install};
})(window);
