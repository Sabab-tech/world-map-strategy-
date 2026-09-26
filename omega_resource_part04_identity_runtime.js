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
  const UNIFIED_ASSET_SCHEMA_VERSION='1.0.0';

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
          rows.push({
            siteReferenceKey,
            assetId:'ASSET:SITE:'+String(siteReferenceKey).toUpperCase(),
            countryId,countryCode:countryId,profileKey:String(profileKey),siteName,
            status:'ACTIVE_SITE_REFERENCE',activationState:'ACTIVE_REFERENCE',
            extractionExecutable:false,quantitativeExtractionDataAvailable:false,
            sourceAuthority:'RESOURCE_JSON',sourceDatasetId,
            sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']',
            rawSiteReference:clone(rawSite)
          });
        });
      }
    }
    return rows;
  }

  function numeric(v){
    const x=Number(v);
    return Number.isFinite(x)?x:null;
  }

  function normalizeUnifiedAsset(input,sourceKind,context={}){
    const raw=clone(input&&typeof input==='object'?input:{});
    const countryId=canonicalCountry(context.countryId||raw.countryCode||raw.countryId||raw.iso3||raw.country);
    const siteName=String(context.siteName||raw.siteName||raw.name||raw.depositName||raw.mineName||raw.fieldName||raw.reservoirName||'').trim();
    const resourceId=String(context.resourceId||raw.resourceTypeId||raw.resourceTypeKey||raw.resId||raw.resourceId||'').replace(/^RES_TYPE:/i,'').trim().toLowerCase()||null;
    const occurrenceKey=context.occurrenceKey||raw.occurrenceKey||null;
    const depositKey=context.depositKey||raw.depositKey||raw.depositId||raw.mineId||null;
    const siteReferenceKey=context.siteReferenceKey||raw.siteReferenceKey||null;
    const assetId=String(context.assetId||(
      sourceKind==='PROFILE_SITE_REFERENCE'
        ? 'ASSET:SITE:'+String(siteReferenceKey||('SITE:'+String(countryId||'GLOBAL')+':'+tok(siteName))).toUpperCase()
        : 'ASSET:OCC:'+String(occurrenceKey||depositKey||('DEP:'+String(countryId||'GLOBAL')+':'+tok(siteName))).toUpperCase()
    ));
    const locationRaw=raw.location&&typeof raw.location==='object'?raw.location:{};
    const coordinates=raw.coordinates&&typeof raw.coordinates==='object'?raw.coordinates:{};
    const lat=numeric(raw.lat??raw.latitude??locationRaw.lat??locationRaw.latitude??coordinates.lat??coordinates.latitude);
    const lon=numeric(raw.lon??raw.lng??raw.longitude??locationRaw.lon??locationRaw.lng??locationRaw.longitude??coordinates.lon??coordinates.lng??coordinates.longitude);
    const reserveRaw=raw.reserves??raw.reserve??raw.geologicalQuantity??raw.reserveQuantity??null;
    const recoverableRaw=raw.recoverableQuantity??raw.recoverableReserve??null;
    const residualRaw=raw.residualQuantity??raw.remainingQuantity??null;
    const productionRate=raw.productionRate??raw.dailyRate??raw.outputRate??raw.currentProductionRate??raw.currentProduction??null;
    const nominalCapacity=raw.nominalCapacity??raw.productionCapacity??raw.capacity??null;
    const qualityGrade=raw.grade??raw.oreGrade??raw.gradePercent??null;
    const purity=raw.purity??raw.purityFraction??null;
    const concentration=raw.concentration??raw.concentrationPercent??null;
    const recoveryRate=raw.recovery??raw.recoveryRate??null;
    const sourceAuthority=String(context.sourceAuthority||raw.sourceAuthority||'RESOURCE_JSON').toUpperCase();
    const hasResource=!!resourceId;
    const hasReserve=reserveRaw!==null&&reserveRaw!==undefined&&String(reserveRaw).trim()!=='';
    const hasProduction=productionRate!==null&&productionRate!==undefined&&String(productionRate).trim()!=='';
    const hasQuality=qualityGrade!==null||purity!==null||concentration!==null;
    return{
      schemaVersion:UNIFIED_ASSET_SCHEMA_VERSION,
      assetId,
      assetType:sourceKind,
      sourceKind,
      siteReferenceKey,
      occurrenceKey,
      depositKey,
      siteName,
      countryId:countryId||null,
      countryCode:countryId||null,
      resourceType:{id:resourceId,name:raw.resourceName||raw.resourceTypeName||null,status:hasResource?'OBSERVED':'UNOBSERVED'},
      location:{nodeKey:raw.locationNodeKey||locationRaw.nodeKey||null,latitude:lat,longitude:lon,name:raw.locationName||locationRaw.name||null,status:(lat!==null||lon!==null||raw.locationNodeKey)?'OBSERVED':'UNOBSERVED'},
      reserve:{geologicalQuantity:numeric(raw.geologicalQuantity??raw.reserveQuantity),recoverableQuantity:numeric(recoverableRaw),residualQuantity:numeric(residualRaw),unit:raw.unit||raw.reserveUnit||null,declared:reserveRaw},
      production:{ratePerDay:numeric(productionRate),currentProduction:numeric(raw.currentProduction??raw.currentProductionRate),nominalCapacity:numeric(nominalCapacity),minimumCapacity:numeric(raw.minimumCapacity??raw.minimumRate),maximumCapacity:numeric(raw.maximumCapacity??raw.maximumRate)},
      operating:{status:raw.status||raw.operatingStatus||'UNKNOWN',startYear:numeric(raw.startYear??raw.commissioningYear??raw.productionStartYear),extractionMethod:raw.extractionMethod||raw.miningMethod||null},
      quality:{grade:qualityGrade,purity,concentration,recoveryRate},
      ownership:{owner:raw.owner??raw.ownerKey??null,operator:raw.operator??raw.operatorKey??null},
      flow:{warehouseId:raw.warehouseId||null,inventoryRef:raw.inventoryRef||raw.inventoryKey||null,factoryInputRoute:raw.factoryInputRoute||raw.factoryRoute||null},
      execution:{extractionExecutable:sourceKind==='STRUCTURED_DEPOSIT'&&hasResource&&hasReserve,quantitativeDataAvailable:hasResource&&hasReserve,simulationEligible:sourceKind==='PROFILE_SITE_REFERENCE'&&!hasReserve},
      dataAuthority:{
        identity:countryId&&siteName?'OBSERVED':'UNOBSERVED',
        resourceType:hasResource?'OBSERVED':'UNOBSERVED',
        reserve:hasReserve?'OBSERVED':'UNOBSERVED',
        production:hasProduction?'OBSERVED':'UNOBSERVED',
        quality:hasQuality?'OBSERVED':'UNOBSERVED'
      },
      provenance:{
        sourceAuthority,
        sourceDatasetId:context.sourceDatasetId||raw.sourceDatasetId||raw.provenance?.sourceDatasetId||'resources.json',
        sourcePath:context.sourcePath||raw.sourcePath||raw.provenance?.sourcePath||null,
        sourceKind,
        rawReferencePreserved:true
      },
      rawSource:raw
    };
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
        rawDeposit:clone(raw)
      };
      rows.push(occurrence);
      byDeposit.set(depositKey,occurrence);
      if(!byCountry.has(countryId))byCountry.set(countryId,[]);
      byCountry.get(countryId).push(occurrence);
    });

    const unifiedAssets=[
      ...rows.map(function(occurrence){
        return normalizeUnifiedAsset(occurrence.rawDeposit||{},'STRUCTURED_DEPOSIT',{
          countryId:occurrence.countryId,occurrenceKey:occurrence.occurrenceKey,depositKey:occurrence.depositKey,
          resourceId:occurrence.resourceTypeId,sourceDatasetId:occurrence.sourceDatasetId,
          sourceAuthority:'RESOURCE_JSON'
        });
      }),
      ...siteReferences.map(function(site){
        return normalizeUnifiedAsset(site.rawSiteReference&&typeof site.rawSiteReference==='object'?site.rawSiteReference:{name:site.siteName},'PROFILE_SITE_REFERENCE',{
          countryId:site.countryId,siteName:site.siteName,siteReferenceKey:site.siteReferenceKey,
          sourceDatasetId:site.sourceDatasetId,sourcePath:site.sourcePath,sourceAuthority:'RESOURCE_JSON'
        });
      })
    ];
    const unifiedById=new Map(unifiedAssets.map(function(asset){return [String(asset.assetId).toUpperCase(),asset];}));

    const registry={
      version:VERSION,
      unifiedAssetSchemaVersion:UNIFIED_ASSET_SCHEMA_VERSION,
      authority:'RESOURCE_JSON',
      occurrenceCount:rows.length,
      siteReferenceCount:siteReferences.length,
      unifiedAssetCount:unifiedAssets.length,
      getOccurrencesByCountry:function(countryId){return clone(byCountry.get(canonicalCountry(countryId))||[]);},
      getMineSiteReferencesByCountry:function(countryId){return clone(siteRefsByCountry.get(canonicalCountry(countryId))||[]);},
      listMineSiteReferences:function(){return clone(siteReferences);},
      listUnifiedAssets:function(){return clone(unifiedAssets);},
      getUnifiedAsset:function(assetId){
        const hit=unifiedById.get(String(assetId||'').trim().toUpperCase());
        return hit?clone(hit):null;
      },
      getUnifiedAssetsByCountry:function(countryId){
        const wanted=canonicalCountry(countryId);
        return clone(unifiedAssets.filter(function(asset){return canonicalCountry(asset.countryId)===wanted;}));
      },
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
    compileIdentities
  });

  g.Omega=g.Omega||{};
  g.GSRSK_Part04=API;
  g.GSRSK_ResourceIdentityEngine=API;
  g.Omega.ResourcePart04IdentityRuntime=API;
  g.OmegaResourcePart04IdentityRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
