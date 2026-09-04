/**
 * OMEGA SEMANTIC PLANNER v1.0.0
 * Data-bound lightweight language understanding for ministerial queries.
 * No country/resource answer is hardcoded; names and facts come from runtime datasets.
 */
(function(global){
  'use strict';
  if(global.OmegaSemanticPlanner) return;

  const BN=/[\u0980-\u09FF]/;
  const STOP=new Set('a an the is are am was were be been being do does did can could will would shall should may might must have has had to of for from in on at by with about into through over under between and or but if then than that this these those our my your their his her its we i you he she they me us them as'.split(' '));
  const N=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[?!,.:;"'“”‘’(){}\[\]<>—–/\\]/g,' ').replace(/\s+/g,' ').trim();
  const W=s=>N(s).split(/\s+/).filter(Boolean);
  const C=s=>W(s).filter(x=>!STOP.has(x));
  const has=(set,arr)=>arr.some(x=>set.has(x));

  function frame(question){
    const raw=String(question||''), n=N(raw), w=new Set(W(raw));
    const bn=BN.test(raw);
    const interrogative = w.has('who')||w.has('what')||w.has('which')||w.has('where')||w.has('when')||w.has('why')||w.has('how')||/^(কি|কী|কে|কোন|কোথায়|কোথায়|কেন|কত)/.test(n);
    const modality = w.has('should')||/করা উচিত/.test(n) ? 'RECOMMENDATION' : w.has('can')||w.has('could')||/পারব|পারি|সম্ভব/.test(n) ? 'CAPABILITY' : w.has('must')||w.has('have')||/হতেই হবে|করতে হবে/.test(n) ? 'REQUIREMENT' : 'INFORMATION';
    const speech = interrogative ? 'QUESTION' : modality==='RECOMMENDATION' ? 'REQUEST' : 'STATEMENT';
    let operation='LOOKUP';
    if (/\b(import|imports|importing|supplier|suppliers|buy|buying|purchase|purchasing|from which country|source)\b|আমদানি|সরবরাহকারী|কোন দেশ থেকে/.test(n)) operation='IMPORT';
    else if (/\b(export|exports|exporting|sell|selling|trade|trading|shipping|tariff|contract|sanction)\b|রপ্তানি|বিক্রি|বাণিজ্য|শুল্ক|চুক্তি|নিষেধাজ্ঞা/.test(n)) operation='EXPORT';
    else if (/\b(secure|security|safe|stockpile|reserve|reserves|shortage|depletion|runway|buffer|vulnerable|risk)\b|নিরাপদ|নিরাপত্তা|সুরক্ষিত|মজুদ|রিজার্ভ|ঘাটতি|ঝুঁকি|কতদিন চলবে/.test(n)) operation='SECURITY';
    else if (/\b(compare|versus|vs|higher|lower|more|less|best|better|largest|smallest)\b|তুলনা|বেশি|কম|সেরা|বড়|ছোট/.test(n)) operation='COMPARE';
    else if (/\b(where|location|located|based|situated|from where)\b|কোথায়|কোথায়|অবস্থান/.test(n)) operation='LOCATION';
    else if (/\b(how many|how much|number|count|total|quantity|amount)\b|কত|কতটি|পরিমাণ|মোট/.test(n)) operation='COUNT';
    const focus = w.has('why')||w.has('because')||/কেন|কারণ/.test(n) ? 'CAUSE' : w.has('when')||/কখন/.test(n) ? 'TIME' : w.has('how')||/কিভাবে|কীভাবে/.test(n) ? 'METHOD' : w.has('which')||/কোন/.test(n) ? 'SELECTION' : 'FACT';
    const actor = /\b(i|me|my|we|our|us)\b|\b(আমি|আমার|আমরা|আমাদের)\b/.test(n) ? 'PLAYER' : /\b(we|our|national|domestic|country|state)\b|\b(আমাদের|দেশের|জাতীয়|রাষ্ট্র)\b/.test(n) ? 'NATIONAL_STATE' : 'GENERAL';
    const entityHints=C(raw);
    const relation = operation==='IMPORT' ? 'IMPORT_FROM' : operation==='EXPORT' ? 'EXPORT_TO' : operation==='SECURITY' ? 'SECURITY_OF' : operation==='COMPARE' ? 'COMPARE' : null;
    return { raw, normalized:n, language:bn?'bn':'en', speech, modality, operation, focus, actor, relation, entityHints, executable:true };
  }

  function attachEntities(f, datasets){
    const records=[];
    const names=v=>{const out=[];if(!v||typeof v!=='object')return out;for(const k of ['name','countryName','officialName','shortName','displayName','label','title','resourceName','canonicalName','baseName','name_en','name_bn','localName','nativeName','id','iso3','isoCode','countryCode','resourceId'])if(typeof v[k]==='string'&&v[k].trim())out.push(v[k]);return [...new Set(out)]};
    const walk=(v,path=[],key='')=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach((x,i)=>walk(x,path.concat(i),String(i)));return}const ns=names(v);if(ns.length)records.push({value:v,path:path.join('.'),key,names:ns});for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')walk(x,path.concat(k),k)};
    (datasets||[]).forEach(d=>walk(d));
    const tokens=f.entityHints.filter(x=>x.length>1);
    const scored=records.map(r=>{let score=0,surface='';for(const name of r.names){const nn=N(name);let hit=0;for(const t of tokens)if(nn.includes(t))hit++;if(hit>0){const s=hit/Math.max(1,tokens.length);if(s>score){score=s;surface=name}}}return{...r,score,surface}}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
    return {...f,entities:{matched:scored.slice(0,12),resource:scored.find(r=>/resource|commodity|mineral|petroleum|crude|ore|metal|fuel/i.test(r.path+' '+r.key))||null,country:scored.find(r=>/country|countries|nation|sovereign/i.test(r.path+' '+r.key))||null}};
  }

  global.OmegaSemanticPlanner=Object.freeze({version:'1.0.0',frame,attachEntities});
})(window);
