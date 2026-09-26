/* ============================================================================
 * OMEGA RESOURCE PART 04 - CANONICAL MINE / DEPOSIT IDENTITY RUNTIME
 *
 * Purpose:
 *   Build one authoritative occurrence registry directly from RESOURCE_JSON
 *   runtime_deposits. No country is selected by the player here.
 *   Every occurrence carries its sovereign country identity.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';

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

  const UNIFIED_ASSET_SCHEMA_VERSION='1.0.0';

  function num(v){
    const x=Number(v);
    return Number.isFinite(x)?x:null;
  }

  function textOrNull(v){
    const s=String(v??'').trim();
    return s?s:null;
  }

  function authorityRank(v){
    const a=String(v||'UNOBSERVED').toUpperCase();
    return a==='OBSERVED'?2:a==='SIMULATED'?1:0;
  }

  function overallAuthority(values){
    const list=values.map(v=>String(v||'UNOBSERVED').toUpperCase());
    if(list.length&&list.every(v=>v==='OBSERVED'))return'OBSERVED';
    if(list.some(v=>v==='SIMULATED'))return'SIMULATED';
    return'UNOBSERVED';
  }

  function normalizeUnifiedAsset(input){
    const raw=clone(input||{});
    const ref=raw.resourceAsset&&typeof raw.resourceAsset==='object'?raw.resourceAsset:{};
    const countryId=canonicalCountry(raw.countryId||raw.countryCode||ref.countryId||ref.countryCode);
    const siteName=textOrNull(raw.siteName||raw.name||raw.depositName||ref.siteName);
    const siteReferenceKey=textOrNull(raw.siteReferenceKey||ref.siteReferenceKey);
    const occurrenceKey=textOrNull(raw.occurrenceKey||ref.occurrenceKey);
    const assetId=textOrNull(raw.assetId||ref.assetId||occurrenceKey||siteReferenceKey||raw.id)||null;
    const resourceTypeId=textOrNull(
      raw.resourceTypeId||raw.resourceTypeKey||raw.resourceId||raw.resId||
      raw.reserveState?.resourceId||ref.resourceTypeId||ref.resourceType||ref.resourceId
    )?.replace(/^RES_TYPE:/i,'').toLowerCase()||null;
    const rs=raw.reserveState||ref.reserve||{};
    const cap=raw.capacity||ref.productionCapacity||{};
    const prod=raw.productionModel||raw.siteModel?.commodityStreams?.find?.(x=>String(x?.resourceId||'')===String(resourceTypeId||''))?.production||ref.production||{};
    const q=raw.qualityState||raw.quality||ref.quality||{};
    const reserveAuthority=String(
      raw.reserveAuthority||rs?.provenance?.quantityAuthority||raw.dataAuthority?.reserve||ref?.dataAuthority?.reserve||'UNOBSERVED'
    ).toUpperCase();
    const productionAuthority=String(
      raw.productionAuthority||cap?.authority||prod?.authority||raw.dataAuthority?.production||ref?.dataAuthority?.production||'UNOBSERVED'
    ).toUpperCase();
    const qualityAuthority=String(
      raw.qualityAuthority||q?.qualityAuthority||
      q?.gradeStatus||q?.concentrationStatus||q?.purityStatus||
      raw.dataAuthority?.quality||ref?.dataAuthority?.quality||'UNOBSERVED'
    ).toUpperCase()==='OBSERVED'?'OBSERVED':
      String(raw.qualityAuthority||q?.qualityAuthority||raw.dataAuthority?.quality||ref?.dataAuthority?.quality||'UNOBSERVED').toUpperCase()==='SIMULATED'?'SIMULATED':'UNOBSERVED';

    const reserveQuantity=num(rs?.geologicalQuantity??raw.geologicalQuantity??raw.reserveQuantity);
    const recoverableQuantity=num(rs?.recoverableQuantity??raw.recoverableQuantity);
    const residualQuantity=num(rs?.residualQuantity??raw.residualQuantity);
    const unit=textOrNull(rs?.unit||raw.unit||cap?.unit);
    const productionRate=num(raw.productionRate??cap?.activeRate??cap?.dailyRate??cap?.nominalRate??prod?.activeRate??prod?.observedRate);
    const currentProduction=num(raw.currentProduction??raw.currentProductionRate??raw.lastOutputQuantity);
    const recoveryRate=num(raw.recoveryRate??cap?.recovery??prod?.recovery);
    const grade=num(raw.gradePercent??q?.gradePercent??q?.normalized?.gradePercent);
    const purity=num(raw.purity??q?.purity??q?.normalized?.purityFraction);
    const concentration=num(raw.concentrationPercent??q?.concentrationPercent??q?.normalized?.concentrationPercent);

    const location={
      nodeKey:textOrNull(raw.locationNodeKey||ref.location?.nodeKey),
      lat:num(raw.lat??raw.latitude??ref.location?.lat),
      lon:num(raw.lon??raw.lng??raw.longitude??ref.location?.lon),
      status:(raw.locationNodeKey||raw.lat!=null||raw.lon!=null)?'AVAILABLE':'UNOBSERVED'
    };
    const warehouseId=textOrNull(raw.warehouseId||raw.warehouse?.id||ref.warehouse?.id) ||
      (countryId?'WH-'+countryId+'-RAW':null);
    const executable=raw.extractionExecutable===true||
      Boolean(raw.occurrenceKey&&resourceTypeId&&reserveQuantity!==null&&productionRate!==null);
    const factoryInputStatus=executable?'AVAILABLE_AFTER_EXTRACTION':'BLOCKED_MISSING_QUANTITATIVE_DATA';
    const routeId=warehouseId&&assetId?
      'MINE:'+assetId+'->'+warehouseId+'->FACTORY_INPUT':null;
    const authorities=[reserveAuthority,productionAuthority,qualityAuthority];
    return{
      schemaVersion:UNIFIED_ASSET_SCHEMA_VERSION,
      assetType:textOrNull(raw.assetType||ref.assetType)||'RESOURCE_MINE',
      assetId,
      siteId:assetId,
      siteReferenceKey,
      occurrenceKey,
      siteName,
      countryId,
      countryCode:countryId,
      resourceType:resourceTypeId,
      resourceTypeId,
      location,
      reserve:{
        geologicalQuantity:reserveQuantity,
        recoverableQuantity,
        residualQuantity,
        unit,
        rawText:textOrNull(raw.reserves||rs?.rawText||ref?.reserve?.rawText),
        authority:reserveAuthority,
        status:reserveQuantity===null?'UNOBSERVED':'AVAILABLE'
      },
      recoverableReserve:recoverableQuantity,
      productionRate,
      productionCapacity:{
        nominal:num(cap?.nominalCapacity??cap?.nominalRate??prod?.nominalCapacity),
        minimum:num(cap?.minimumCapacity??prod?.minimumCapacity),
        maximum:num(cap?.maximumCapacity??prod?.maximumCapacity),
        unit,
        rateUnit:textOrNull(cap?.rateUnit||(unit?unit+'/DAY':null)),
        utilization:num(cap?.utilization??cap?.effortUtilization??prod?.utilization),
        authority:productionAuthority
      },
      operatingStatus:textOrNull(raw.operationalStatus||raw.status||ref.operatingStatus),
      grade,
      purity,
      concentration,
      recoveryRate,
      owner:textOrNull(raw.owner||raw.ownerKey||ref.owner||ref.ownerKey),
      operator:textOrNull(raw.operator||raw.operatorKey||ref.operator||ref.operatorKey),
      extractionMethod:textOrNull(raw.extractionMethod||raw.extraction_method||ref.extractionMethod),
      startYear:num(raw.startYear??raw.start_year??ref.startYear),
      currentProduction,
      warehouse:{
        id:warehouseId,
        status:warehouseId?'RUNTIME_READY':'UNAVAILABLE',
        countryId
      },
      inventory:{
        quantity:num(raw.inventoryQuantity??raw.inventory?.quantity??ref.inventory?.quantity),
        unit,
        status:textOrNull(raw.inventoryStatus||raw.inventory?.status||ref.inventory?.status)||'NOT_YET_EXTRACTED'
      },
      factoryInputRoute:{
        routeId,
        status:factoryInputStatus,
        destinationCountryId:countryId,
        warehouseId
      },
      provenance:{
        ...(raw.provenance&&typeof raw.provenance==='object'?clone(raw.provenance):{}),
        sourceAuthority:raw.sourceAuthority||raw.provenance?.sourceAuthority||ref.sourceAuthority||'UNOBSERVED',
        sourceDatasetId:raw.sourceDatasetId||raw.provenance?.sourceDatasetId||ref.sourceDatasetId||null,
        sourcePath:raw.sourcePath||raw.provenance?.sourcePath||ref.sourcePath||null
      },
      dataAuthority:{
        overall:overallAuthority(authorities),
        reserve:reserveAuthority,
        production:productionAuthority,
        quality:qualityAuthority
      },
      dataStatus:{
        overall:overallAuthority(authorities),
        reserve:reserveQuantity===null?'UNOBSERVED':reserveAuthority,
        production:productionRate===null?'UNOBSERVED':productionAuthority,
        quality:(grade===null&&purity===null&&concentration===null)?'UNOBSERVED':qualityAuthority
      },
      extractionExecutable:executable,
      quantitativeExtractionDataAvailable:reserveQuantity!==null&&productionRate!==null&&Boolean(resourceTypeId)
    };
  }

  function sourceDeposits(){
    const e=engine();
    const runtime=Array.isArray(e?.deposits)?e.deposits.slice():[];
    const profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    for(const [profileKey,profile] of Object.entries(profiles)){
      const identity=profile?.identity||profile||{};
      const countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
      const sites=profile?.resource_infrastructure_context?.mineSites||
        profile?.infrastructure_context?.mineSites||
        profile?.resourceInfrastructureContext?.mineSites||
        [];
      if(!Array.isArray(sites))continue;
      sites.forEach(function(site,index){
        if(!site||typeof site!=='object')return;
        const hasResource=site.resId||site.resourceId||site.resourceTypeId||site.resourceTypeKey||site.resourceType;
        const hasReserve=site.reserves||site.reserve||site.residualQuantity||site.geologicalQuantity||site.recoverableQuantity;
        if(!hasResource||!hasReserve)return;
        const name=String(site.name||site.siteName||site.mineName||site.depositName||('MINE_SITE_'+index)).trim();
        if(!name)return;
        const idValue=String(site.id||site.depositId||site.mineId||site.occurrenceId||('site-'+String(countryId||'GLOBAL').toLowerCase()+'-'+tok(name))).trim();
        runtime.push({
          ...clone(site),
          id:idValue,name,countryCode:countryId,country:site.country||identity.name||countryId,
          sourceDatasetId:'resources.json.countryProfiles',
          sourceAuthority:'RESOURCE_JSON',
          provenance:{
            ...(site.provenance&&typeof site.provenance==='object'?site.provenance:{}),
            sourceAuthority:'RESOURCE_JSON',
            sourceDatasetId:'resources.json.countryProfiles',
            sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites'
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
    const e=engine(),sourceMaps=e?.countryProfileSources&&typeof e.countryProfileSources==='object'&&Object.keys(e.countryProfileSources).length
      ?Object.entries(e.countryProfileSources):[['merged',e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{}]];
    const rows=[],seen=new Set();
    for(const [sourceDatasetId,profiles] of sourceMaps){
      for(const [profileKey,profile] of Object.entries(profiles||{})){
        const identity=profile?.identity||profile||{};
        const countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
        if(!countryId)continue;
        const sites=profile?.resource_infrastructure_context?.mineSites||
          profile?.infrastructure_context?.mineSites||
          profile?.resourceInfrastructureContext?.mineSites||[];
        if(!Array.isArray(sites))continue;
        sites.forEach(function(rawSite,index){
          const siteName=String(typeof rawSite==='string'?rawSite:rawSite?.name||rawSite?.siteName||rawSite?.mineName||rawSite?.depositName||'').trim();
          if(!siteName)return;
          const siteReferenceKey='SITE:'+String(sourceDatasetId)+':'+countryId+':'+tok(siteName)+':'+index;
          const dedupeKey=sourceDatasetId+'|'+countryId+'|'+index+'|'+siteName.toUpperCase();
          if(seen.has(dedupeKey))return;seen.add(dedupeKey);
          const sourcePath='GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']';
          rows.push({
            siteReferenceKey,countryId,countryCode:countryId,profileKey:String(profileKey),siteName,
            status:'ACTIVE_SITE_REFERENCE',activationState:'ACTIVE_REFERENCE',
            extractionExecutable:false,quantitativeExtractionDataAvailable:false,
            sourceAuthority:'RESOURCE_JSON',sourceDatasetId,sourcePath,
            rawSiteReference:clone(rawSite),
            resourceAsset:normalizeUnifiedAsset({
              assetType:'MINE_SITE',assetId:siteReferenceKey,siteReferenceKey,
              siteName,countryId,countryCode:countryId,sourceAuthority:'RESOURCE_JSON',sourceDatasetId,sourcePath,
              extractionExecutable:false,quantitativeExtractionDataAvailable:false
            })
          });
        });
      }
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
        locationNodeKey:'MINE:'+countryId+':'+depositKey,
        status:String(raw?.status||'UNKNOWN').trim().toUpperCase(),
        sourceDatasetId:raw?.sourceDatasetId||raw?.provenance?.sourceDatasetId||'resources.json',
        rawDeposit:clone(raw),
        resourceAsset:normalizeUnifiedAsset({
          ...clone(raw),
          assetType:'RESOURCE_MINE',
          assetId:occurrenceKey,
          occurrenceKey,siteName:String(raw?.name||depositKey),
          countryId,countryCode:countryId,resourceId:resourceId,resourceTypeId:resourceId,
          locationNodeKey:'MINE:'+countryId+':'+depositKey,
          sourceDatasetId:raw?.sourceDatasetId||raw?.provenance?.sourceDatasetId||'resources.json',
          extractionExecutable:true,
          quantitativeExtractionDataAvailable:true
        })
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
    UNIFIED_ASSET_SCHEMA_VERSION,
    normalizeUnifiedAsset,
    compileIdentities
  });

  g.Omega=g.Omega||{};
  g.GSRSK_Part04=API;
  g.GSRSK_ResourceIdentityEngine=API;
  g.Omega.ResourcePart04IdentityRuntime=API;
  g.OmegaResourcePart04IdentityRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
