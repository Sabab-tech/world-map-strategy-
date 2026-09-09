/* OMEGA RESOURCE SEMANTIC BRIDGE v1.8.0
 * Resource identity and ontology come only from resource_ontology.json.
 * Before canonical injection, any bootstrap-time cognitive ontology entries
 * are purged so a legacy/static fallback can never remain authoritative.
 */
(function(g){
  'use strict';
  if(g.OmegaResourceSemanticBridge?.VERSION === '1.8.0')return;

  const V='1.8.0';
  const N=v=>String(v==null?'':v).normalize('NFKC').replace(/[?!,.:;'"(){}\\[\\]<>]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  const asset=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch(_){return null}};
  let ready=false, resources=new Map(), ontology=null, error=null, cognitiveOntologyInjected=false, cognitiveMemorySize=0;

  function add(raw,fallback){
    if(!raw||typeof raw!=='object')return;
    const id=String(raw.resource_id||raw.resourceId||raw.canonical_id||raw.id||raw.key||fallback||'').trim().toUpperCase();
    if(!id)return;
    const names=[raw.name,raw.resource_name,raw.resourceName,raw.canonicalName,raw.displayName,raw.label,raw.name_en,raw.name_bn,raw.title].filter(x=>typeof x==='string'&&x.trim());
    for(const x of names)resources.set(N(x),id);
    resources.set(N(id),id);
  }

  function loadCognitiveOntology(){
    const instance=g.OmegaCognitiveEngine?.instance;
    const matrix=ontology?.COMMODITY_ONTOLOGIES||ontology?.resources||ontology?.resource_types||ontology||{};
    if(!instance||!instance.L2_SemanticMemory||!Object.keys(matrix).length){cognitiveOntologyInjected=false;return false;}
    try{
      if(typeof instance.L2_SemanticMemory.clear==='function')instance.L2_SemanticMemory.clear();
      for(const [key,value] of Object.entries(matrix)){
        if(value&&typeof value==='object')instance.L2_SemanticMemory.set(String(key).toUpperCase(),clone(value));
      }
      if(typeof instance.setResourceOntology==='function')instance.setResourceOntology(clone(matrix));
      cognitiveMemorySize=instance.L2_SemanticMemory.size;
      cognitiveOntologyInjected=cognitiveMemorySize===Object.keys(matrix).length;
      if(!cognitiveOntologyInjected)throw Error('Cognitive ontology size mismatch after canonical injection');
      return true;
    }catch(e){error=e?.message||String(e);cognitiveOntologyInjected=false;return false;}
  }

  async function init(){
    try{
      const r=await fetch(asset('resource_ontology.json'),{cache:'no-store'});
      if(!r.ok)throw Error('resource_ontology.json: HTTP '+r.status);
      const d=await r.json();
      const root=d?.COMMODITY_ONTOLOGIES||d?.resources||d?.resource_types||d||{};
      if(!root||typeof root!=='object'||!Object.keys(root).length)throw Error('resource_ontology.json contains no canonical ontology entries');
      ontology=clone(d);
      resources.clear();
      for(const[k,x]of Object.entries(root))add(typeof x==='object'?x:{id:k,name:x},k);
      cognitiveOntologyInjected=loadCognitiveOntology();
      if(!cognitiveOntologyInjected)throw Error(error||'Canonical ontology could not be injected into cognitive memory');
      ready=true;
      g.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_SEMANTIC_READY',{detail:{version:V,resources:resources.size,cognitiveOntologyInjected,cognitiveMemorySize}}));
    }catch(e){
      ready=false;
      cognitiveOntologyInjected=false;
      error=e?.message||String(e);
      console.error('[OMEGA Resource Semantic Bridge]',error);
    }
  }

  function resolve(q){
    const x=N(q);let best=null;
    for(const[id,name]of resources){
      if(!name)continue;
      if(x===id||x===name)return{id,name,s:1};
      if(x.includes(name)&&(!best||name.length>best.name.length))best={id,name,s:.95};
    }
    return best;
  }

  function install(){
    const base=g.OmegaProductionSemanticRuntime;
    if(!base||typeof base.parse!=='function')return false;
    if(base.__resourceBridgeV180)return true;
    const oldParse=base.parse;
    const parse=(q,c={})=>{
      const p=oldParse.call(base,q,c);
      if(!p||typeof p!=='object'||p.entities?.resource?.id||!ready)return p;
      const h=resolve(q);
      if(!h)return p;
      const unresolved=Array.isArray(p.unresolved)?p.unresolved.filter(x=>x!=='RESOURCE'):[];
      return {
        ...p,
        entities:{...p.entities,resource:{id:h.id,type:'RESOURCE',confidence:h.s,source:'resource_ontology.json',surface:h.name}},
        unresolved,
        targetDomain:p.entities?.country?.id?'COUNTRY_RESOURCE':'RESOURCE',
        executable:unresolved.length===0&&p.operation!=='UNKNOWN'
      };
    };
    base.parse=parse;
    base.__resourceBridgeV180=true;
    const prev=g.OmegaAIIntegrity||{};
    g.OmegaAIIntegrity={...prev,VERSION:'4.1.0-PRODUCTION',parse};
    return true;
  }

  g.OmegaResourceSemanticBridge={
    VERSION:V,
    init,
    diagnostics:()=>({version:V,ready,resources:resources.size,cognitiveOntologyInjected,cognitiveMemorySize,error}),
    resolve,
    install,
    ontology:()=>clone(ontology)
  };

  const boot=setInterval(()=>{if(install()){clearInterval(boot);loadCognitiveOntology()}},50);
  setTimeout(()=>clearInterval(boot),15000);
  init().then(()=>{install();loadCognitiveOntology()}).catch(()=>{});
})(typeof globalThis!=='undefined'?globalThis:window);
