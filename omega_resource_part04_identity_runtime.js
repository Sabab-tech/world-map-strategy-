/* ============================================================================
 * OMEGA RESOURCE PART 04 - CANONICAL MINE / DEPOSIT IDENTITY RUNTIME v2
 *
 * Runtime identity stays authoritative to RESOURCE_JSON.
 * Multi-commodity deposits are represented as component occurrences that retain
 * one parent deposit identity. Site references remain non-executable until a
 * quantitative runtime asset exists.
 * ========================================================================== */
(function(g){
  'use strict';
  const VERSION='2.0.0';
  const sci=()=>g.Omega?.ResourceScienceRuntime||g.OmegaResourceScienceRuntime||null;
  function clone(v,seen){if(v===null||typeof v!=='object')return v;seen=seen||new WeakMap();if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v)){if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;o[k]=clone(v[k],seen);}return o;}
  const id=v=>String(v??'').trim().toUpperCase();
  const tok=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  function canonicalCountry(v){const raw=String(v??'').trim();if(!raw)return null;try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;const hit=b?.resolveCountry?.(raw);if(hit?.id)return id(hit.id);if(hit?.canonicalId)return id(hit.canonicalId);}catch(_){}try{const e=g.ResourceMinistryEngine,x=e?.normalizeCountryCode?.(raw);if(x)return id(x);}catch(_){}return id(raw);}
  function engine(){return g.ResourceMinistryEngine||null;}
  function profileSites(profile){return profile?.resource_infrastructure_context?.mineSites||profile?.infrastructure_context?.mineSites||profile?.resourceInfrastructureContext?.mineSites||[];}

  function componentRows(raw,index){
    const primary=sci()?.normalizeResourceId?.(raw?.resourceTypeId||raw?.resourceTypeKey||raw?.resId||raw?.resourceId||raw?.resource||'');
    const baseId=String(raw?.id||raw?.depositId||raw?.mineId||raw?.occurrenceId||('dep-'+index+'-'+tok(raw?.name||primary||'unknown'))).trim();
    const parsed=sci()?.parseReserveComponents?.(raw?.reserves||raw?.reserve||'',primary,raw?.unit||null)||[];
    const unique=[];
    const seen=new Set();
    const push=(row,ridOverride=null)=>{
      const rid=sci()?.normalizeResourceId?.(ridOverride||row?.resourceId)||ridOverride||primary;
      if(!rid)return;
      const q=clone(row||{});
      q.resourceId=rid;q.resId=rid;
      const componentKey=rid===primary?'PRIMARY':('COMPONENT_'+rid.toUpperCase());
      const idValue=componentKey==='PRIMARY'?baseId:(baseId+'::'+componentKey.toLowerCase());
      if(seen.has(idValue))return;seen.add(idValue);
      const out={...clone(raw),...q,id:idValue,name:String(raw?.name||baseId)+(componentKey==='PRIMARY'?'':' ['+rid+']'),
        countryCode:canonicalCountry(raw?.countryCode||raw?.countryIso3||raw?.hostCountryIso3||raw?.iso3||raw?.country),
        resId:rid,resourceId:rid,componentOfDepositKey:componentKey==='PRIMARY'?null:baseId,
        componentResourceId:componentKey==='PRIMARY'?null:rid,sourceAuthority:'RESOURCE_JSON',
        sourceDatasetId:raw?.sourceDatasetId||'resources.json',
        componentReserveQuantity:row?.quantity??null,componentReserveUnit:row?.unit||null,
        parentDepositId:baseId,
        provenance:{...(raw?.provenance&&typeof raw.provenance==='object'?clone(raw.provenance):{}),
          sourceAuthority:'RESOURCE_JSON',parentDepositId:baseId,
          componentResourceId:componentKey==='PRIMARY'?null:rid}
      };
      unique.push(out);
    };
    if(parsed.length){
      const primaryRow=parsed.find(x=>x.resourceId===primary);
      push(primaryRow||parsed[0],primary);
      for(const row of parsed)if(row.resourceId!==primary)push(row,row.resourceId);
    }else push(raw,primary);
    return unique;
  }

  function sourceDeposits(){
    const e=engine(),runtime=Array.isArray(e?.deposits)?e.deposits.slice():[],profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    const out=[];
    runtime.forEach((raw,index)=>componentRows(raw,index).forEach(x=>out.push(x)));
    let profileIndex=0;
    for(const [profileKey,profile] of Object.entries(profiles)){
      const identity=profile?.identity||profile||{},countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
      if(!countryId)continue;
      profileSites(profile).forEach((site,index)=>{
        if(!site||typeof site!=='object')return;
        const hasResource=site.resId||site.resourceId||site.resourceTypeId||site.resourceTypeKey||site.resourceType;
        const hasReserve=site.reserves||site.reserve||site.residualQuantity||site.geologicalQuantity||site.recoverableQuantity;
        if(!hasResource||!hasReserve)return;
        const name=String(site.name||site.siteName||site.mineName||site.depositName||('MINE_SITE_'+index)).trim();
        const idValue=String(site.id||site.depositId||site.mineId||site.occurrenceId||('site-'+countryId.toLowerCase()+'-'+tok(name))).trim();
        const raw={...clone(site),id:idValue,name,countryCode:countryId,country:site.country||identity.name||countryId,
          sourceDatasetId:'resources.json.countryProfiles',sourceAuthority:'RESOURCE_JSON',
          provenance:{...(site.provenance&&typeof site.provenance==='object'?clone(site.provenance):{}),
            sourceAuthority:'RESOURCE_JSON',sourceDatasetId:'resources.json.countryProfiles',
            sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']'}};
        componentRows(raw,100000+profileIndex++).forEach(x=>out.push(x));
      });
    }
    const unique=new Map();
    out.forEach(row=>{const key=String(row?.id||'').trim().toUpperCase();if(key)unique.set(key,row);});
    return [...unique.values()];
  }

  function sourceMineSiteReferences(knowledge=null){
    const e=engine(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{},rows=[],seen=new Set();
    const add=(countryId,siteName,index,sourcePath,rawSite)=>{
      const c=canonicalCountry(countryId),name=String(siteName||'').trim();if(!c||!name)return;
      const siteReferenceKey='SITE:'+c+':'+tok(name);if(seen.has(siteReferenceKey))return;seen.add(siteReferenceKey);
      rows.push({siteReferenceKey,countryId:c,countryCode:c,profileKey:String(countryId),siteName:name,status:'ACTIVE_SITE_REFERENCE',
        activationState:'REFERENCE_ONLY',extractionExecutable:false,quantitativeExtractionDataAvailable:false,authorityLevel:'REFERENCE_ONLY',
        resourceDataStatus:'UNOBSERVED',sourceAuthority:'RESOURCE_JSON',sourceDatasetId:'RESOURCE_JSON.countryProfiles',
        sourcePath:sourcePath||null,rawSiteReference:clone(rawSite),referenceId:rawSite?.referenceId||null});
    };
    try{
      const refs=knowledge?.refCatalog?.allReferences||[];
      refs.forEach(ref=>{
        if(String(ref?.metadata?.subType||'')!=='mineSites')return;
        add(ref.parentCountryId||ref.countryCode||ref.countryId,ref.rawReferenceString||ref.name||ref.siteName,0,ref.sourceContextPath||ref.sourcePath,ref);
      });
    }catch(_){}
    for(const [profileKey,profile] of Object.entries(profiles)){
      const identity=profile?.identity||profile||{},countryId=canonicalCountry(identity.countryId||identity.iso3||identity.iso2||profileKey);if(!countryId)continue;
      profileSites(profile).forEach((rawSite,index)=>{
        const siteName=String(typeof rawSite==='string'?rawSite:rawSite?.name||rawSite?.siteName||rawSite?.mineName||rawSite?.depositName||'').trim();
        add(countryId,siteName,index,'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']',rawSite);
      });
    }
    if(rows.length===0&&e?.referenceCatalog?.getAllReferences){
      try{
        for(const ref of e.referenceCatalog.getAllReferences()){
          if(String(ref?.metadata?.subType||'')!=='mineSites'&& !/mineSites\[/i.test(String(ref?.sourceContextPath||'')))continue;
          add(ref.parentCountryId||ref.countryCode||ref.countryId,ref.rawReferenceString||ref.name||ref.siteName,0,ref.sourceContextPath||ref.sourcePath,ref);
        }
      }catch(_){}
    }
    return rows;
  }

  function compileIdentities(){
    const deposits=sourceDeposits(),byCountry=new Map(),byDeposit=new Map(),rows=[],siteReferences=sourceMineSiteReferences(knowledge),siteRefsByCountry=new Map();
    siteReferences.forEach(site=>{if(!siteRefsByCountry.has(site.countryId))siteRefsByCountry.set(site.countryId,[]);siteRefsByCountry.get(site.countryId).push(site);});
    deposits.forEach((raw,index)=>{
      const countryId=canonicalCountry(raw?.countryCode||raw?.countryIso3||raw?.countryId||raw?.iso3||raw?.country);
      const resourceId=sci()?.normalizeResourceId?.(raw?.resourceTypeId||raw?.resourceTypeKey||raw?.resId||raw?.resourceId)||String(raw?.resourceTypeId||raw?.resId||raw?.resourceId||'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
      const depositKey=String(raw?.id||raw?.depositId||raw?.mineId||('DEP-'+index+'-'+tok(raw?.name||resourceId||'unknown'))).trim();
      if(!countryId||!resourceId)return;
      const occurrenceKey='OCC:'+countryId+':'+depositKey;
      const occurrence={
        occurrenceKey,depositKey,depositRawName:String(raw?.name||depositKey),resourceTypeId:resourceId,
        resourceTypeKey:resourceId,countryId,countryCode:countryId,
        ownerKey:String(raw?.owner||raw?.ownerKey||'').trim()||null,
        operatorKey:String(raw?.operator||raw?.operatorKey||'').trim()||null,
        locationNodeKey:raw?.locationNodeKey||('MINE:'+countryId+':'+depositKey),
        status:String(raw?.status||'UNKNOWN').trim().toUpperCase(),
        sourceDatasetId:raw?.sourceDatasetId||raw?.provenance?.sourceDatasetId||'resources.json',
        parentDepositId:raw?.parentDepositId||null,componentResourceId:raw?.componentResourceId||null,
        rawDeposit:clone(raw)
      };
      rows.push(occurrence);byDeposit.set(depositKey,occurrence);
      if(!byCountry.has(countryId))byCountry.set(countryId,[]);byCountry.get(countryId).push(occurrence);
    });
    const registry={
      version:VERSION,authority:'RESOURCE_JSON',occurrenceCount:rows.length,sourceDepositRecordCount:Array.isArray(engine()?.deposits)?engine().deposits.length:0,
      siteReferenceCount:siteReferences.length,
      getOccurrencesByCountry:countryId=>clone(byCountry.get(canonicalCountry(countryId))||[]),
      getMineSiteReferencesByCountry:countryId=>clone(siteRefsByCountry.get(canonicalCountry(countryId))||[]),
      listMineSiteReferences:()=>clone(siteReferences),
      getDeposit:depositKey=>{const hit=byDeposit.get(String(depositKey||'').trim());if(!hit)return null;const out=clone(hit);out.resourceTypeId=hit.resourceTypeId;out.resourceTypeKey=hit.resourceTypeKey;out.depositRawName=hit.depositRawName;return out;},
      listOccurrences:()=>clone(rows)
    };
    return{status:'READY',registry,occurrenceCount:rows.length,sourceDepositRecordCount:registry.sourceDepositRecordCount,siteReferenceCount:siteReferences.length};
  }

  const API=Object.freeze({VERSION,compileIdentities});
  g.Omega=g.Omega||{};g.GSRSK_Part04=API;g.GSRSK_ResourceIdentityEngine=API;g.Omega.ResourcePart04IdentityRuntime=API;g.OmegaResourcePart04IdentityRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
