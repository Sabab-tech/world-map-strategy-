/* ============================================================================
 * OMEGA RESOURCE PART 04 - CANONICAL MINE / DEPOSIT IDENTITY RUNTIME
 *
 * Purpose:
 *   Build one authoritative occurrence registry directly from RESOURCE_JSON.
 *   Both runtime_deposits and every countryProfiles.*.mineSites entry become
 *   canonical occurrences. Profile sites receive deterministic runtime capacity
 *   only when quantitative production data is absent, and remain explicitly
 *   tagged as derived simulation baselines.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='2.0.0';

  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||new WeakMap();
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v)){
      if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;
      o[k]=clone(v[k],seen);
    }
    return o;
  }

  function id(v){return String(v??'').trim().toUpperCase();}
  function tok(v){return String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}

  function canonicalCountry(v){
    const raw=String(v??'').trim();
    if(!raw)return null;
    try{
      const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
      const hit=bridge?.resolveCountry?.(raw);
      if(hit?.id)return id(hit.id);
    }catch(_){}
    return id(raw);
  }

  function engine(){
    return g.ResourceMinistryEngine||null;
  }

  const SITE_RESOURCE_ALIASES=Object.freeze({
    crude_oil:['crude_oil','crude oil','petroleum','oil','heavy_crude','heavy crude','light_crude','light crude'],
    natural_gas:['natural_gas','natural gas','gas','lng','associated_gas','associated gas'],
    iron_ore:['iron_ore','iron ore','iron'],
    bauxite:['bauxite','alumina','aluminum','aluminium'],
    copper:['copper'],nickel:['nickel'],cobalt:['cobalt'],
    lithium:['lithium'],rare_earth:['rare_earth','rare earth','rare earths','ree','neodymium','dysprosium'],
    uranium:['uranium','u3o8'],gold:['gold','gold_occurrences'],coal:['coal'],
    phosphate:['phosphate','phosphate rock','p2o5'],potash:['potash','potassium'],
    limestone:['limestone','limestone_aggregates'],gypsum:['gypsum'],marble:['marble'],
    chromium:['chromium','chromite'],silica_sand:['silica_sand','silica sand','sand_and_gravel'],
    clay:['clay','kaolin','bentonite'],zeolite:['zeolite'],zircon:['zircon','zirconium']
  });

  function normalizeResourceId(value,e){
    const raw=String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[-]+/g,'_').replace(/\s+/g,' ');
    if(!raw)return null;
    const known=Array.isArray(e?.resourceTypes)?e.resourceTypes:[];
    const exact=known.find(x=>String(x?.id??'').trim().toLowerCase().replace(/^res_type:/i,'')===raw);
    if(exact?.id)return String(exact.id).replace(/^RES_TYPE:/i,'').trim().toLowerCase();
    for(const [rid,list] of Object.entries(SITE_RESOURCE_ALIASES)){
      if(list.some(a=>raw===a||raw.includes(a)||a.includes(raw)))return rid;
    }
    if(/phosph/.test(raw))return'phosphate';
    if(/potash|k2o|potassium/.test(raw))return'potash';
    if(/rare.?earth|ree|neodymium|dysprosium/.test(raw))return'rare_earth';
    if(/uran/.test(raw))return'uranium';
    if(/lithium/.test(raw))return'lithium';
    if(/cobalt/.test(raw))return'cobalt';
    if(/nickel/.test(raw))return'nickel';
    if(/chrom/.test(raw))return'chromium';
    if(/copper/.test(raw))return'copper';
    if(/iron/.test(raw))return'iron_ore';
    if(/baux|alumin/.test(raw))return'bauxite';
    if(/coal/.test(raw))return'coal';
    if(/gold/.test(raw))return'gold';
    if(/limestone/.test(raw))return'limestone';
    if(/gypsum/.test(raw))return'gypsum';
    if(/marble/.test(raw))return'marble';
    if(/silica|sand/.test(raw))return'silica_sand';
    if(/clay|kaolin|bentonite/.test(raw))return'clay';
    if(/zeolite/.test(raw))return'zeolite';
    if(/zircon/.test(raw))return'zircon';
    return null;
  }

  function stableSlot(value,size){
    if(size<=1)return 0;
    let h=2166136261;
    for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return (h>>>0)%size;
  }

  function profileResourceCandidates(profile,e){
    const out=[];
    const add=v=>{
      const list=Array.isArray(v)?v:[v];
      for(const z of list){
        const candidate=typeof z==='object'?(z?.id||z?.name||z?.resourceId||z?.resourceTypeId):z;
        const rid=normalizeResourceId(candidate,e);
        if(rid&&!out.includes(rid))out.push(rid);
      }
    };
    add(profile?.resource_domain?.knownResourceTypes);
    add(profile?.resource_endowment?.known);
    add(profile?.strategic_resources?.knownResourceTypes);
    const m=profile?.mineral_resource_base||{};
    for(const key of ['metallic','nonMetallic','industrialMinerals','preciousMetals','rareEarths','criticalMinerals'])add(m[key]);
    const h=profile?.hydrocarbon_resource_base||{};
    if(Array.isArray(h.oil)&&h.oil.length)add('crude_oil');
    if(Array.isArray(h.naturalGas)&&h.naturalGas.length)add('natural_gas');
    if(Array.isArray(h.coal)&&h.coal.length)add('coal');
    return out;
  }

  function resolveProfileSiteResource(profile,siteName,explicit,e){
    const direct=normalizeResourceId(explicit,e);
    if(direct)return{resourceId:direct,authority:'RESOURCE_JSON_EXPLICIT_SITE_RESOURCE'};
    const text=String(siteName||'').toLowerCase();
    for(const [rid,list] of Object.entries(SITE_RESOURCE_ALIASES)){
      if(list.some(a=>text.includes(String(a).toLowerCase())))return{resourceId:rid,authority:'RESOURCE_JSON_SITE_NAME_SEMANTIC'};
    }
    const candidates=profileResourceCandidates(profile,e);
    if(candidates.length)return{
      resourceId:candidates[stableSlot(siteName,candidates.length)],
      authority:'RESOURCE_JSON_PROFILE_RESOURCE_DOMAIN'
    };
    const global=Array.isArray(e?.resourceTypes)?e.resourceTypes.map(x=>normalizeResourceId(x?.id||x?.name,e)).filter(Boolean):[];
    const unique=[...new Set(global)];
    if(unique.length)return{
      resourceId:unique[stableSlot(String(siteName)+'|'+String(profile?.identity?.countryId||''),unique.length)],
      authority:'RUNTIME_RESOURCE_TYPE_CATALOG_FALLBACK'
    };
    return{resourceId:null,authority:'UNRESOLVED'};
  }

  function sourceDeposits(){
    const e=engine();
    const runtime=Array.isArray(e?.deposits)?e.deposits.map(clone):[];
    const profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    for(const [profileKey,profile] of Object.entries(profiles)){
      const identity=profile?.identity||profile||{};
      const countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
      if(!countryId)continue;
      const sites=profile?.resource_infrastructure_context?.mineSites||
        profile?.infrastructure_context?.mineSites||
        profile?.resourceInfrastructureContext?.mineSites||[];
      if(!Array.isArray(sites))continue;
      sites.forEach(function(site,index){
        const rawSite=typeof site==='object'&&site!==null?clone(site):{name:String(site||'').trim()};
        const name=String(rawSite?.name||rawSite?.siteName||rawSite?.mineName||rawSite?.depositName||('MINE_SITE_'+index)).trim();
        if(!name)return;
        const siteReferenceKey='SITE:'+countryId+':'+tok(name);
        const resolved=resolveProfileSiteResource(
          profile,name,
          rawSite?.resId||rawSite?.resourceId||rawSite?.resourceTypeId||rawSite?.resourceTypeKey||rawSite?.resourceType,
          e
        );
        if(!resolved.resourceId)return;
        const idValue='SITE_DEP_'+countryId+'_'+tok(name);
        runtime.push({
          ...rawSite,
          id:idValue,name,countryCode:countryId,country:rawSite.country||identity.name||countryId,
          resId:resolved.resourceId,resourceId:resolved.resourceId,resourceTypeId:resolved.resourceId,resourceTypeKey:resolved.resourceId,
          siteReferenceKey,assetType:'MINE_SITE',profileDerivedSimulation:true,
          declaredStatus:rawSite?.status||null,status:'ACTIVE_PRODUCING',
          sourceDatasetId:'resources.json.countryProfiles',
          sourceAuthority:'RESOURCE_JSON',
          resourceResolutionAuthority:resolved.authority,
          provenance:{
            ...(rawSite?.provenance&&typeof rawSite.provenance==='object'?rawSite.provenance:{}),
            sourceAuthority:'RESOURCE_JSON',
            sourceDatasetId:'resources.json.countryProfiles',
            sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']',
            identityAuthority:'RESOURCE_JSON_PROFILE_SITE',
            runtimeActivationMode:'PROFILE_SITE_RUNTIME',
            quantityAuthority:rawSite?.reserves||rawSite?.reserve||rawSite?.residualQuantity||rawSite?.geologicalQuantity||rawSite?.recoverableQuantity
              ?'RESOURCE_JSON':'DERIVED_SIMULATION_BASELINE'
          }
        });
      });
    }
    const unique=new Map();
    runtime.forEach(row=>{
      const key=String(row?.id||'').trim().toUpperCase();
      if(key)unique.set(key,row);
    });
    return [...unique.values()];
  }

  function depositKeyFor(row,index){
    return String(row?.id||row?.depositId||row?.mineId||('DEP-'+index+'-'+tok(row?.name||row?.resId||'unknown'))).trim();
  }

  function sourceMineSiteReferences(){
    const e=engine(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    const deposits=sourceDeposits();
    const rows=[];
    for(const [profileKey,profile] of Object.entries(profiles)){
      const identity=profile?.identity||profile||{};
      const countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
      if(!countryId)continue;
      const sites=profile?.resource_infrastructure_context?.mineSites||
        profile?.infrastructure_context?.mineSites||
        profile?.resourceInfrastructureContext?.mineSites||[];
      if(!Array.isArray(sites))continue;
      sites.forEach(function(rawSite,index){
        const siteName=String(typeof rawSite==='string'?rawSite:
          rawSite?.name||rawSite?.siteName||rawSite?.mineName||rawSite?.depositName||'').trim();
        if(!siteName)return;
        const siteReferenceKey='SITE:'+countryId+':'+tok(siteName);
        const linked=deposits.find(x=>String(x?.siteReferenceKey||'')===siteReferenceKey);
        const raw=linked?.rawDeposit||linked||null;
        const hasResource=!!linked?.resourceTypeId;
        const hasQuant=!!(raw&&(raw.reserves||raw.reserve||raw.residualQuantity||raw.geologicalQuantity||raw.recoverableQuantity));
        rows.push({
          siteReferenceKey,countryId,countryCode:countryId,profileKey:String(profileKey),siteName,
          status:'ACTIVE_SITE_REFERENCE',activationState:'ACTIVE_REFERENCE',
          extractionExecutable:hasResource,runtimeExecutionAvailable:hasResource,
          quantitativeExtractionDataAvailable:hasQuant,
          runtimeExecutionMode:hasResource?'UNIFIED_PART04_PART05_PIPELINE':'BLOCKED_UNRESOLVED_RESOURCE',
          sourceAuthority:'RESOURCE_JSON',sourceDatasetId:'RESOURCE_JSON.countryProfiles',
          sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']',
          rawSiteReference:clone(rawSite)
        });
      });
    }
    return rows;
  }

  function compileIdentities(){
    const deposits=sourceDeposits();
    const byCountry=new Map(),byDeposit=new Map(),rows=[];
    const siteReferences=sourceMineSiteReferences();
    const siteRefsByCountry=new Map();
    siteReferences.forEach(function(site){
      if(!siteRefsByCountry.has(site.countryId))siteRefsByCountry.set(site.countryId,[]);
      siteRefsByCountry.get(site.countryId).push(site);
    });
    deposits.forEach(function(raw,index){
      const countryId=canonicalCountry(raw?.countryCode||raw?.countryIso3||raw?.countryId||raw?.iso3||raw?.country);
      const resourceId=String(raw?.resourceTypeId||raw?.resourceTypeKey||raw?.resId||raw?.resourceId||'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
      const depositKey=depositKeyFor(raw,index);
      if(!countryId||!resourceId)return;
      const occurrenceKey='OCC:'+countryId+':'+depositKey;
      const occurrence={
        occurrenceKey,
        depositKey,
        depositRawName:String(raw?.name||depositKey),
        resourceTypeId:resourceId,
        resourceTypeKey:resourceId,
        countryId,
        countryCode:countryId,
        ownerKey:String(raw?.owner||raw?.ownerKey||'').trim()||null,
        operatorKey:String(raw?.operator||raw?.operatorKey||'').trim()||null,
        siteReferenceKey:raw?.siteReferenceKey||null,
        profileDerivedSimulation:raw?.profileDerivedSimulation===true,
        assetType:raw?.assetType||(raw?.profileDerivedSimulation===true?'MINE_SITE':'STRUCTURED_MINE'),
        locationNodeKey:raw?.locationNodeKey||('MINE:'+countryId+':'+depositKey),
        status:String(raw?.status||'UNKNOWN').trim().toUpperCase(),
        sourceDatasetId:raw?.sourceDatasetId||raw?.provenance?.sourceDatasetId||'resources.json',
        rawDeposit:clone(raw)
      };
      rows.push(occurrence);
      byDeposit.set(depositKey,occurrence);
      if(!byCountry.has(countryId))byCountry.set(countryId,[]);
      byCountry.get(countryId).push(occurrence);
    });

    const registry={
      version:VERSION,
      authority:'RESOURCE_JSON',
      occurrenceCount:rows.length,
      siteReferenceCount:siteReferences.length,
      getOccurrencesByCountry:function(countryId){return clone(byCountry.get(canonicalCountry(countryId))||[]);},
      getMineSiteReferencesByCountry:function(countryId){return clone(siteRefsByCountry.get(canonicalCountry(countryId))||[]);},
      listMineSiteReferences:function(){return clone(siteReferences);},
      getDeposit:function(depositKey){
        const hit=byDeposit.get(String(depositKey||'').trim());
        if(!hit)return null;
        const out=clone(hit);
        out.resourceTypeId=hit.resourceTypeId;
        out.resourceTypeKey=hit.resourceTypeKey;
        out.depositRawName=hit.depositRawName;
        out.locationNodeKey=hit.rawDeposit?.locationNodeKey||hit.locationNodeKey;
        return out;
      },
      listOccurrences:function(){return clone(rows);}
    };
    return{status:'READY',registry,occurrenceCount:rows.length,siteReferenceCount:siteReferences.length};
  }

  const API=Object.freeze({
    VERSION,
    compileIdentities
  });

  g.Omega=g.Omega||{};
  g.GSRSK_Part04=API;
  g.GSRSK_ResourceIdentityEngine=API;
  g.Omega.ResourcePart04IdentityRuntime=API;
  g.OmegaResourcePart04IdentityRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
