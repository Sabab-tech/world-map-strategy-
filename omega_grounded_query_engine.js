/* OMEGA GROUNDED QUERY ENGINE v1.0.0
 * Factual interrogation executor.
 * Rules:
 *  - Query facts are resolved from supplied datasets only.
 *  - Country resolution never falls back to the active country when an explicit country is present.
 *  - No synthetic quantities, scores, confidence percentages, or recommendations are generated.
 *  - Resource identity is separated from asset/entity terminology.
 *  - Every returned fact carries dataset + path provenance.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFKC').toLowerCase()
    .replace(/[?!,.:;"'“”‘’(){}\[\]<>—–]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const isObj = v => v && typeof v === 'object';
  const isScalar = v => ['string','number','boolean'].includes(typeof v);
  const finite = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = text(v).replace(/,/g, '').replace(/%$/, '').trim();
    if (!s || !/^-?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s); return Number.isFinite(n) ? n : null;
  };

  const COUNTRY_ID_KEYS = ['id','iso','iso2','iso3','isoCode','countryCode','alpha2','alpha3','code','cca2','cca3','ioc'];
  const COUNTRY_NAME_KEYS = ['name','countryName','officialName','shortName','displayName','nativeName','localName','name_en','name_bn','country','label','title'];
  const RESOURCE_ID_KEYS = ['id','resourceId','resource_id','canonical_id','canonicalId','code','key'];
  const RESOURCE_NAME_KEYS = ['name','resourceName','canonicalName','displayName','localName','name_en','name_bn','commodity','material','label','title'];

  const COUNTRY_STOP = new Set(['country','countries','profiles','profile','data','resources','resource','state','states','world','worlddata','countryprofiles','countryprofile']);

  const METRICS = [
    { id:'reserve', label:'reserves', aliases:['reserve','reserves','proved reserve','proved reserves','recoverable reserves','resource reserves','in situ','ore reserves','খনিজ মজুদ','রিজার্ভ','মজুদ'] },
    { id:'production', label:'production', aliases:['production','annual production','daily production','monthly production','output','extraction','produced','domestic production','উৎপাদন','উত্তোলন'] },
    { id:'consumption', label:'consumption', aliases:['consumption','annual consumption','daily consumption','monthly consumption','demand','annual demand','daily demand','use','usage','offtake','খরচ','ব্যবহার','চাহিদা'] },
    { id:'imports', label:'imports', aliases:['import','imports','import volume','import dependency','import dependence','import need','imported','আমদানি'] },
    { id:'exports', label:'exports', aliases:['export','exports','export volume','export capacity','exportable','available for export','রপ্তানি'] },
    { id:'stock', label:'stockpile', aliases:['stock','stockpile','stockpiles','inventory','inventories','on hand','available stock','current stock','strategic stockpile','buffer stock','মজুত','স্টক','ইনভেন্টরি'] },
    { id:'capacity', label:'capacity', aliases:['capacity','production capacity','storage capacity','export capacity','refining capacity','processing capacity','throughput','সক্ষমতা'] },
    { id:'price', label:'price', aliases:['price','market price','spot price','supplier price','import price','export price','unit price','cost','unit cost','মূল্য','দাম','খরচ'] }
  ];

  const ENTITY_TERMS = [
    { type:'MINE', words:['mine','mines','mining site','mine site','খনি','খনিগুলো'] },
    { type:'DEPOSIT', words:['deposit','deposits','ore body','prospect','ডিপোজিট','খনিজ ভাণ্ডার'] },
    { type:'FIELD', words:['field','fields','oil field','gas field','ক্ষেত্র','তেলক্ষেত্র','গ্যাসক্ষেত্র'] },
    { type:'FACILITY', words:['facility','facilities','refinery','smelter','plant','processing plant','facility site','কারখানা','রিফাইনারি','স্মেল্টার'] }
  ];

  const COMMON_COUNTRY_ALIASES = Object.freeze({
    'india':'IND','bharat':'IND','ভারত':'IND','ভারতে':'IND','ভারতের':'IND',
    'bangladesh':'BGD','বাংলাদেশ':'BGD','বাংলাদেশে':'BGD','বাংলাদেশের':'BGD',
    'united states':'USA','usa':'USA','us':'USA','america':'USA',
    'china':'CHN','চীন':'CHN','চীনে':'CHN','চীনের':'CHN',
    'russia':'RUS','রাশিয়া':'RUS','রাশিয়ায়':'RUS','russian federation':'RUS',
    'united kingdom':'GBR','uk':'GBR','britain':'GBR','england':'GBR'
  });

  const COMMON_RESOURCE_ALIASES = Object.freeze({
    copper:'COPPER','কপার':'COPPER','তামা':'COPPER','তাম্র':'COPPER',
    lithium:'LITHIUM','লিথিয়াম':'LITHIUM','লিথিয়াম':'LITHIUM',
    cobalt:'COBALT','কোবাল্ট':'COBALT', nickel:'NICKEL','নিকেল':'NICKEL',
    'rare earth':'RARE_EARTHS','rare earths':'RARE_EARTHS','ree':'RARE_EARTHS','বিরল মৃত্তিকা':'RARE_EARTHS','রেয়ার আর্থ':'RARE_EARTHS',
    uranium:'URANIUM','ইউরেনিয়াম':'URANIUM','ইউরেনিয়াম':'URANIUM',
    gold:'GOLD','সোনা':'GOLD','স্বর্ণ':'GOLD',
    bauxite:'BAUXITE','বক্সাইট':'BAUXITE',
    phosphate:'PHOSPHATE','ফসফেট':'PHOSPHATE', potash:'POTASH','পটাশ':'POTASH',
    iron:'IRON_ORE','iron ore':'IRON_ORE','লোহা':'IRON_ORE','লৌহ আকরিক':'IRON_ORE',
    'crude oil':'CRUDE_OIL','oil':'CRUDE_OIL','petroleum':'CRUDE_OIL','তেল':'CRUDE_OIL','অপরিশোধিত তেল':'CRUDE_OIL',
    'natural gas':'NATURAL_GAS','gas':'NATURAL_GAS','প্রাকৃতিক গ্যাস':'NATURAL_GAS','গ্যাস':'NATURAL_GAS',
    coal:'COAL','কয়লা':'COAL','কয়লা':'COAL'
  });

  function walk(v, fn, path = []) {
    if (!isObj(v)) return;
    fn(v, path);
    if (Array.isArray(v)) {
      v.forEach((x,i) => walk(x, fn, path.concat(String(i))));
    } else {
      for (const [k,x] of Object.entries(v)) if (isObj(x)) walk(x, fn, path.concat(k));
    }
  }

  function scalarFields(v, path = []) {
    const out = [];
    if (!isObj(v)) return out;
    for (const [k,x] of Object.entries(v)) {
      if (isScalar(x)) out.push({ key:k, value:x, path:path.concat(k) });
      else if (isObj(x)) out.push(...scalarFields(x, path.concat(k)));
    }
    return out;
  }

  function names(v, keys, keyHint = '') {
    const out = [];
    if (!isObj(v)) return keyHint ? [keyHint] : out;
    for (const k of keys) {
      const x = v[k];
      if (typeof x === 'string' && x.trim()) out.push(x);
      else if (isObj(x)) for (const y of Object.values(x)) if (typeof y === 'string' && y.trim()) out.push(y);
      else if (Array.isArray(x)) for (const y of x) if (typeof y === 'string' && y.trim()) out.push(y);
    }
    if (keyHint && !/^\d+$/.test(String(keyHint))) out.push(String(keyHint).replace(/[_-]+/g,' '));
    return [...new Set(out)];
  }

  function ids(v, keys, keyHint = '') {
    const out = [];
    if (!isObj(v)) return keyHint ? [String(keyHint).toUpperCase()] : out;
    for (const k of keys) if (typeof v[k] === 'string' && v[k].trim()) out.push(String(v[k]).toUpperCase());
    if (keyHint && !/^\d+$/.test(String(keyHint))) out.push(String(keyHint).toUpperCase());
    return [...new Set(out)];
  }

  function resourceAliasIds(datasets) {
    const aliases = new Map();
    const add = (id, arr) => {
      if (!id) return;
      const key = String(id).toUpperCase();
      const set = aliases.get(key) || new Set();
      set.add(key); (arr || []).forEach(x => set.add(norm(x))); aliases.set(key,set);
    };
    Object.entries(COMMON_RESOURCE_ALIASES).forEach(([a,id]) => add(id,[a]));
    for (const ds of datasets) {
      walk(ds,(v,p) => {
        const pathText = norm(p.join(' '));
        if (!/(resource|commodity|mineral|ore|hydrocarbon|petroleum|material|resource_types|commodity_ontologies)/.test(pathText)) return;
        const rid = ids(v,RESOURCE_ID_KEYS,p[p.length-1] || '')[0];
        if (!rid) return;
        const ns = names(v,RESOURCE_NAME_KEYS,p[p.length-1] || '');
        if (ns.length) add(rid,ns);
      });
    }
    return aliases;
  }

  function countryIndex(datasets) {
    const map = new Map();
    const add = (id, ns, source) => {
      if (!id) return;
      const key = String(id).toUpperCase();
      const e = map.get(key) || { id:key, aliases:new Set(), sources:[] };
      ns.forEach(n => e.aliases.add(norm(n)));
      if (source) e.sources.push(source);
      map.set(key,e);
    };
    Object.entries(COMMON_COUNTRY_ALIASES).forEach(([a,id]) => add(id,[a],{type:'COMMON_ALIAS'}));
    for (const ds of datasets) {
      walk(ds,(v,p) => {
        const ns = names(v,COUNTRY_NAME_KEYS,p[p.length-1] || '');
        const cid = ids(v,COUNTRY_ID_KEYS,p[p.length-1] || '').find(x => /^[A-Z]{2,3}$/.test(x));
        const blob = norm(p.join(' ')+' '+ns.join(' '));
        if (cid && (/(country|countries|nation|sovereign|countryprofile|countryprofiles|state_profiles)/.test(blob) || ns.some(n => norm(n).length > 2))) add(cid,ns,{type:'DATASET',path:p.join('.')});
      });
    }
    return map;
  }

  function resolveCountry(query, datasets, context = {}) {
    const idx = countryIndex(datasets);
    const q = norm(query);
    const explicitHits = [];
    for (const [id,e] of idx) {
      for (const a of e.aliases) {
        if (!a || a.length < 2) continue;
        if (q === a || q.includes(' '+a) || q.startsWith(a+' ') || q.endsWith(' '+a) || q.includes(a)) {
          explicitHits.push({id,alias:a,score:q===a?1:(a.length/q.length > .3 ? .98 : .9)});
        }
      }
    }
    explicitHits.sort((a,b)=>b.score-a.score||b.alias.length-a.alias.length);
    const unique = [];
    for (const h of explicitHits) if (!unique.some(x=>x.id===h.id)) unique.push(h);
    if (unique.length === 1) return {state:'RESOLVED',id:unique[0].id,alias:unique[0].alias,confidence:unique[0].score,candidates:unique};
    if (unique.length > 1 && Math.abs(unique[0].score-unique[1].score) < 0.04) return {state:'AMBIGUOUS',id:null,alias:null,confidence:unique[0].score,candidates:unique.slice(0,5)};
    const ctx = text(context.countryId || context.countryCode).toUpperCase();
    const ctxName = norm(context.countryName || '');
    if (!explicitHits.length && ctx && idx.has(ctx)) return {state:'RESOLVED',id:ctx,alias:ctxName || ctx,confidence:1,candidates:[{id:ctx,alias:ctxName||ctx,score:1}],source:'CONTEXT'};
    return {state:'UNRESOLVED',id:null,alias:null,confidence:0,candidates:[]};
  }

  function resolveResource(query, datasets) {
    const idx = resourceAliasIds(datasets); const q = norm(query); const hits = [];
    for (const [id,set] of idx) {
      for (const a of set) {
        if (a.length < 2) continue;
        if (q === a || q.includes(' '+a) || q.startsWith(a+' ') || q.endsWith(' '+a) || q.includes(a)) hits.push({id,alias:a,score:q===a?1:(a.length/q.length > .2 ? .98 : .88)});
      }
    }
    hits.sort((a,b)=>b.score-a.score||b.alias.length-a.alias.length);
    const unique=[]; for(const h of hits) if(!unique.some(x=>x.id===h.id)) unique.push(h);
    if (unique.length===1) return {state:'RESOLVED',id:unique[0].id,alias:unique[0].alias,confidence:unique[0].score,candidates:unique};
    if (unique.length>1 && Math.abs(unique[0].score-unique[1].score)<0.04) return {state:'AMBIGUOUS',id:null,alias:null,confidence:unique[0].score,candidates:unique.slice(0,5)};
    return {state:'UNRESOLVED',id:null,alias:null,confidence:0,candidates:[]};
  }

  function detectLanguage(q) { return /[\u0980-\u09FF]/.test(q) ? 'bn' : 'en'; }

  function parseQuery(query, datasets, context = {}) {
    const q = norm(query); const language=detectLanguage(query);
    const country=resolveCountry(query,datasets,context); const resource=resolveResource(query,datasets);
    const entity = ENTITY_TERMS.find(e => e.words.some(w => q.includes(norm(w))));
    const explicitMetric = METRICS.find(m => m.aliases.some(a => q.includes(norm(a))));
    let operation = 'IDENTIFY';
    if (/\bhow many\b|\bhow much\b|\bcount\b|কত|কয়টি|কয়টি|সংখ্যা/.test(q)) operation = entity ? `COUNT_${entity.type}` : 'QUANTITY';
    else if (entity && /where|কোথায়|কোথায়|location|locate/.test(q)) operation = `LOCATE_${entity.type}`;
    else if (explicitMetric) operation = explicitMetric.id.toUpperCase();
    else if (/production|produced|উৎপাদন|উত্তোলন/.test(q)) operation='PRODUCTION';
    else if (/reserve|reserves|রিজার্ভ|মজুদ/.test(q)) operation='RESERVE';
    else if (/import|imports|আমদানি/.test(q)) operation='IMPORT';
    else if (/export|exports|রপ্তানি/.test(q)) operation='EXPORT';
    else if (/price|cost|দাম|মূল্য/.test(q)) operation='PRICE';
    else if (/where|কোথায়|কোথায়/.test(q)) operation='LOCATION';
    return { version:VERSION, raw:text(query), language, country, resource, entityType:entity?.type || null, operation, metric:explicitMetric?.id || null };
  }

  function nodeMatchesResource(v, path, resource) {
    if (!resource?.id) return false;
    const ns = names(v,RESOURCE_NAME_KEYS,path[path.length-1] || '');
    const is = ids(v,RESOURCE_ID_KEYS,path[path.length-1] || '');
    const aliases = new Set([resource.id.toLowerCase(), resource.alias, resource.alias?.replace(/_/g,' ')]);
    const blob = norm(path.join(' ')+' '+ns.join(' ')+' '+is.join(' '));
    return [...aliases].some(a => a && blob.includes(norm(a)));
  }

  function findCountryRoots(datasets, country) {
    const roots=[];
    if (!country?.id) return roots;
    const aliases = new Set([country.id.toLowerCase(), country.alias]);
    for (const ds of datasets) {
      walk(ds,(v,p) => {
        const blob = norm(p.join(' ')+' '+names(v,COUNTRY_NAME_KEYS,p[p.length-1] || '').join(' ')+' '+ids(v,COUNTRY_ID_KEYS,p[p.length-1] || '').join(' '));
        if ([...aliases].some(a => a && blob.includes(norm(a))) && (p.length > 0)) roots.push({value:v,path:p});
      });
    }
    roots.sort((a,b)=>a.path.length-b.path.length);
    const out=[]; for(const r of roots) if(!out.some(x=>r.path.join('.')===x.path.join('.') || (r.path.length>x.path.length && r.path.slice(0,x.path.length).join('.')===x.path.join('.')))) out.push(r);
    return out.slice(0,12);
  }

  function metricMatches(fieldKey, metricId) {
    const m=METRICS.find(x=>x.id===metricId); if(!m) return false;
    const k=norm(fieldKey);
    return m.aliases.some(a => k===norm(a) || k.includes(norm(a)));
  }

  function findResourceMetricRecords(countryRoots, resource, metricId) {
    const hits=[];
    for(const root of countryRoots){
      walk(root.value,(v,p)=>{
        if(!isObj(v) || Array.isArray(v)) return;
        const resourceish=nodeMatchesResource(v,root.path.concat(p),resource);
        if(!resourceish) return;
        for(const f of scalarFields(v,root.path.concat(p))){
          const n=finite(f.value); if(n===null) continue;
          if(metricMatches(f.key,metricId)) hits.push({value:n,rawValue:f.value,key:f.key,path:f.path,datasetPath:f.path.join('.'),sourceType:'COUNTRY_RESOURCE_RECORD'});
        }
      });
    }
    const dedup=[]; for(const h of hits) if(!dedup.some(x=>x.path.join('.')===h.path.join('.') && x.value===h.value)) dedup.push(h);
    return dedup;
  }

  function findAnyResourceRecords(countryRoots, resource) {
    const all=[];
    for(const m of METRICS) for(const h of findResourceMetricRecords(countryRoots,resource,m.id)) all.push({...h,metric:m.id,label:m.label});
    return all;
  }

  function countEntities(countryRoots, resource, entityType) {
    const terms=(ENTITY_TERMS.find(e=>e.type===entityType)||{words:[]}).words.map(norm);
    const found=[];
    for(const root of countryRoots){
      walk(root.value,(v,p)=>{
        if(!isObj(v) || Array.isArray(v)) return;
        const fullPath=root.path.concat(p);
        const resourceOk=resource?.id ? nodeMatchesResource(v,fullPath,resource) : true;
        if(!resourceOk) return;
        const fields=scalarFields(v,fullPath);
        const blob=norm(fullPath.join(' ')+' '+fields.map(f=>`${f.key} ${f.value}`).join(' '));
        if(terms.some(t=>blob.includes(t))){
          const label=fields.find(f=>/name|title|site|mine|field|deposit/i.test(f.key))?.value;
          found.push({label:label?text(label):fullPath[fullPath.length-1],path:fullPath,datasetPath:fullPath.join('.')});
        }
      });
    }
    const unique=[]; for(const x of found) if(!unique.some(y=>y.datasetPath===x.datasetPath)) unique.push(x);
    return unique;
  }

  function locationEntities(countryRoots, resource, entityType) {
    const rows=countEntities(countryRoots,resource,entityType);
    return rows.filter(r=>r.label).map(r=>r.label);
  }

  function ontologyResource(datasets, resource) {
    if(!resource?.id) return null;
    let best=null;
    for(const ds of datasets){
      walk(ds,(v,p)=>{
        if(!isObj(v) || Array.isArray(v)) return;
        const rid=ids(v,RESOURCE_ID_KEYS,p[p.length-1]||'')[0];
        const ns=names(v,RESOURCE_NAME_KEYS,p[p.length-1]||'');
        const blob=norm(p.join(' ')+' '+ns.join(' ')+' '+(rid||''));
        if(rid===resource.id || blob.includes(resource.id.toLowerCase()) || blob.includes(norm(resource.alias||''))){
          const richness=Object.keys(v).length; if(!best || richness>best.richness) best={value:v,path:p,richness};
        }
      });
    }
    return best;
  }

  function formatNumber(n,language){
    try{return new Intl.NumberFormat(language==='bn'?'bn-BD':'en-US',{maximumFractionDigits:6}).format(n);}catch(_){return String(n);}
  }

  function execute(query, datasets=[], context={}) {
    const ds=Array.isArray(datasets)?datasets.filter(isObj):[];
    const plan=parseQuery(query,ds,context);
    const bn=plan.language==='bn';
    const base={version:VERSION,query:text(query),plan,state:'UNKNOWN',directAnswer:null,facts:[],calculations:[],evidence:[],uncertainty:[],assumptions:[],interpretation:null,recommendation:null};

    if(plan.country.state==='AMBIGUOUS'){
      base.state='AMBIGUOUS'; base.uncertainty.push(bn?'দেশের নাম অস্পষ্ট।':'The country reference is ambiguous.');
      base.directAnswer=bn?'প্রশ্নে কোন দেশ বোঝানো হয়েছে তা নিশ্চিতভাবে নির্ধারণ করা যায়নি।':'The country reference could not be resolved unambiguously.'; return base;
    }
    if(plan.resource.state==='AMBIGUOUS'){
      base.state='AMBIGUOUS'; base.uncertainty.push(bn?'সম্পদের পরিচয় অস্পষ্ট।':'The resource reference is ambiguous.');
      base.directAnswer=bn?'কোন সম্পদ বোঝানো হয়েছে তা নিশ্চিতভাবে নির্ধারণ করা যায়নি।':'The resource reference could not be resolved unambiguously.'; return base;
    }

    if(!plan.resource.id && plan.operation!=='IDENTIFY'){
      base.state='UNRESOLVED'; base.directAnswer=bn?'সম্পদের পরিচয় নির্ধারণ করা যায়নি।':'The resource could not be resolved.'; return base;
    }
    const roots=plan.country.id?findCountryRoots(ds,plan.country):[];

    if(plan.operation==='IDENTIFY' && plan.resource.id){
      const ont=ontologyResource(ds,plan.resource); base.state=ont?'KNOWN':'UNKNOWN';
      if(ont){
        const v=ont.value; const desc=v.description||v.definition||v.name||v.resourceName||null;
        if(desc) base.directAnswer=bn?`${text(v.name||plan.resource.alias)} সম্পর্কে প্রামাণ্য বর্ণনা পাওয়া গেছে: ${text(desc)}`:`Authoritative description for ${text(v.name||plan.resource.alias)}: ${text(desc)}`;
        base.facts.push({resource:plan.resource.id,record: v}); base.evidence.push({dataset:'runtime_dataset',path:ont.path.join('.'),type:'ONTOLOGY_RECORD'});
      } else base.directAnswer=bn?'সম্পদটি ভাষাগতভাবে শনাক্ত হয়েছে, কিন্তু প্রামাণ্য ontology/data record পাওয়া যায়নি।':'The resource was resolved lexically, but no authoritative ontology/data record was found.';
      return base;
    }

    if(!plan.country.id){
      base.state='UNRESOLVED'; base.directAnswer=bn?'দেশ নির্ধারণ করা যায়নি।':'The country could not be resolved.'; return base;
    }
    if(!roots.length){
      base.state='UNKNOWN'; base.directAnswer=bn?`${plan.country.id} এর জন্য ${plan.resource.id} সম্পর্কিত দেশভিত্তিক রেকর্ড পাওয়া যায়নি।`:`No country-level record for ${plan.resource.id} was found for ${plan.country.id}.`;
      base.uncertainty.push('NO_COUNTRY_RESOURCE_RECORD'); return base;
    }

    if(/^COUNT_/.test(plan.operation)){
      const type=plan.operation.slice(6); const rows=countEntities(roots,plan.resource,type); base.state=rows.length?'KNOWN':'ZERO';
      base.facts.push({metric:'count',entityType:type,resource:plan.resource.id,country:plan.country.id,value:rows.length,status:base.state});
      base.evidence.push(...rows.map(r=>({dataset:'runtime_dataset',path:r.datasetPath,type:'ENTITY_RECORD'})));
      const label={MINE:bn?'খনি':'mine',DEPOSIT:bn?'ডিপোজিট':'deposit',FIELD:bn?'ক্ষেত্র':'field',FACILITY:bn?'সুবিধা':'facility'}[type]||type.toLowerCase();
      base.directAnswer=bn?`${plan.country.alias||plan.country.id}-এ ${plan.resource.alias||plan.resource.id} সম্পর্কিত ${label} রেকর্ডের সংখ্যা: ${rows.length}।`:`${plan.country.alias||plan.country.id} has ${rows.length} recorded ${label}(s) for ${plan.resource.alias||plan.resource.id}.`;
      if(!rows.length) base.uncertainty.push('NO_MATCHING_ENTITY_RECORDS'); return base;
      base.interpretation=rows.map(r=>r.label).slice(0,20); return base;
    }

    if(plan.operation.startsWith('LOCATE_') || plan.operation==='LOCATION'){
      const type=plan.entityType||'MINE'; const rows=locationEntities(roots,plan.resource,type); base.state=rows.length?'KNOWN':'ZERO';
      base.facts.push({metric:'locations',entityType:type,resource:plan.resource.id,country:plan.country.id,value:rows});
      base.evidence.push(...rows.slice(0,20).map((_,i)=>({dataset:'runtime_dataset',path:`${plan.country.id}.${plan.resource.id}.${type}.${i}`,type:'ENTITY_RECORD'})));
      base.directAnswer=rows.length?(bn?`${plan.resource.alias||plan.resource.id} সম্পর্কিত লোকেশন রেকর্ড: ${rows.join(', ')}`:`Recorded locations for ${plan.resource.alias||plan.resource.id}: ${rows.join(', ')}`):(bn?'এই দেশ-সম্পদ সংমিশ্রণের জন্য কোনো লোকেশন রেকর্ড পাওয়া যায়নি।':'No location records were found for this country-resource combination.');
      return base;
    }

    let metricId=plan.metric;
    if(!metricId){
      if(plan.operation==='RESERVE') metricId='reserve'; else if(plan.operation==='PRODUCTION') metricId='production'; else if(plan.operation==='IMPORT') metricId='imports'; else if(plan.operation==='EXPORT') metricId='exports'; else if(plan.operation==='PRICE') metricId='price'; else if(plan.operation==='QUANTITY') metricId='reserve';
    }
    if(metricId){
      let rows=findResourceMetricRecords(roots,plan.resource,metricId);
      if(!rows.length && plan.operation==='QUANTITY'){
        const priority=['production','consumption','imports','exports','stock','capacity'];
        for(const alt of priority){rows=findResourceMetricRecords(roots,plan.resource,alt); if(rows.length){metricId=alt; break;}}
      }
      if(rows.length){
        base.state='KNOWN';
        base.facts=rows.slice(0,30).map(r=>({country:plan.country.id,resource:plan.resource.id,metric:metricId,key:r.key,value:r.value,rawValue:r.rawValue,status:'KNOWN'}));
        base.evidence=rows.slice(0,30).map(r=>({dataset:'runtime_dataset',path:r.datasetPath,type:'DIRECT_DATA',metric:metricId}));
        const metricLabel=METRICS.find(m=>m.id===metricId)?.label||metricId;
        const first=rows[0];
        const suffix=rows.length>1?(bn?` এবং আরও ${rows.length-1}টি রেকর্ড`:` plus ${rows.length-1} additional record(s)`):'';
        base.directAnswer=bn?`${plan.country.alias||plan.country.id}-এ ${plan.resource.alias||plan.resource.id}-এর ${metricLabel}: ${formatNumber(first.value,bn)}${suffix}। ডেটা ফিল্ড: ${first.key}.`:`In ${plan.country.alias||plan.country.id}, ${metricLabel} for ${plan.resource.alias||plan.resource.id}: ${formatNumber(first.value,bn)}${suffix}. Data field: ${first.key}.`;
        if(rows.length>1) base.interpretation=rows.map(r=>({field:r.key,value:r.value,path:r.datasetPath}));
        return base;
      }
      base.state='UNKNOWN';
      base.directAnswer=bn?`${plan.country.alias||plan.country.id}-এর ${plan.resource.alias||plan.resource.id}-এর ${METRICS.find(m=>m.id===metricId)?.label||metricId} সম্পর্কিত প্রামাণ্য সংখ্যাগত ডেটা পাওয়া যায়নি।`:`No authoritative numeric ${METRICS.find(m=>m.id===metricId)?.label||metricId} data was found for ${plan.resource.alias||plan.resource.id} in ${plan.country.alias||plan.country.id}.`;
      base.uncertainty.push('MISSING_METRIC_DATA'); return base;
    }

    base.state='UNSUPPORTED'; base.directAnswer=bn?'এই প্রশ্নের জন্য কোনো নির্ধারিত grounded execution contract পাওয়া যায়নি।':'No grounded execution contract exists for this query yet.'; base.uncertainty.push('UNSUPPORTED_OPERATION'); return base;
  }

  const api={VERSION,parse:parseQuery,execute,resolveCountry,resolveResource};
  global.OmegaGroundedQueryEngine=api;
  if(typeof globalThis!=='undefined') globalThis.OmegaGroundedQueryEngine=api;
})(typeof window!=='undefined'?window:globalThis);
