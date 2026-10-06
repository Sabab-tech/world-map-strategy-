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

  const VERSION='1.1.0';

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
      const profiles=engine()?.countryProfiles&&typeof engine().countryProfiles==='object'?engine().countryProfiles:{};
      const direct=profiles[raw]||profiles[raw.toUpperCase()];
      const directIdentity=direct?.identity||direct;
      if(directIdentity?.iso3)return id(directIdentity.iso3);
      const hit=bridge?.resolveCountry?.(raw);
      const source=hit?.raw?.raw||hit?.raw?.datasets?.['countries.json']||hit?.raw;
      const resolvedIso3=source?.iso3||source?.iso3Code||source?.countryCode||source?.countryId;
      if(resolvedIso3)return id(resolvedIso3);
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
    return a==='OBSERVED'||a==='WEB_SOURCE_BACKED'||a==='WEB_RESEARCHED'||a==='WEB_RESEARCHED_CURATED'?2:a==='SIMULATED'?1:0;
  }

  function normalizeAuthority(v){
    const a=String(v||'UNOBSERVED').toUpperCase();
    if(a==='OBSERVED'||a==='WEB_SOURCE_BACKED'||a==='WEB_RESEARCHED'||a==='WEB_RESEARCHED_CURATED')return'OBSERVED';
    if(a==='SIMULATED')return'SIMULATED';
    return'UNOBSERVED';
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
    const reserveAuthorityCandidate=normalizeAuthority(
      raw.reserveAuthority||rs?.provenance?.quantityAuthority||raw.dataStatus?.reserve||raw.dataAuthority?.reserve||ref?.dataStatus?.reserve||ref?.dataAuthority?.reserve
    );
    const productionAuthorityCandidate=normalizeAuthority(
      raw.productionAuthority||cap?.authority||prod?.authority||raw.dataStatus?.production||raw.dataAuthority?.production||ref?.dataStatus?.production||ref?.dataAuthority?.production
    );
    const qualityAuthorityCandidate=normalizeAuthority(
      raw.qualityAuthority||
      raw.dataStatus?.grade||raw.dataStatus?.quality||raw.dataAuthority?.grade||raw.dataAuthority?.quality||
      ref?.dataStatus?.grade||ref?.dataStatus?.quality||ref?.dataAuthority?.grade||ref?.dataAuthority?.quality
    );

    const quantitativeReserve=raw.quantitativeProfile?.reserve&&typeof raw.quantitativeProfile.reserve==='object'?raw.quantitativeProfile.reserve:{};
    const geologicalResourceQuantity=num(rs?.geologicalResourceQuantity??raw.geologicalResourceQuantity);
    const technicallyRecoverableQuantity=num(rs?.technicallyRecoverableQuantity??raw.technicallyRecoverableQuantity);
    const economicallyRecoverableQuantity=num(rs?.economicallyRecoverableQuantity??raw.economicallyRecoverableQuantity??rs?.recoverableQuantity??raw.recoverableQuantity);
    const extractableReserveQuantity=num(
      rs?.extractableReserveQuantity??raw.extractableReserveQuantity??
      rs?.residualQuantity??raw.residualQuantity??
      rs?.recoverableQuantity??raw.recoverableQuantity??
      rs?.geologicalQuantity??raw.geologicalQuantity??
      raw.reserveQuantity??
      quantitativeReserve.quantity
    );
    const reserveQuantity=extractableReserveQuantity!==null&&extractableReserveQuantity>0?extractableReserveQuantity:null;
    const recoverableQuantity=economicallyRecoverableQuantity!==null&&economicallyRecoverableQuantity>0?economicallyRecoverableQuantity:null;
    const residualQuantity=reserveQuantity;
    const unit=textOrNull(rs?.unit||raw.unit||cap?.unit||quantitativeReserve.unit);
    const productionRateRaw=num(raw.productionRate??cap?.activeRate??cap?.dailyRate??cap?.nominalRate??prod?.activeRate??prod?.observedRate);
    const productionRate=productionRateRaw!==null&&productionRateRaw>0?productionRateRaw:null;
    const currentProductionRaw=num(raw.currentProduction??raw.currentProductionRate??raw.lastOutputQuantity);
    const currentProduction=currentProductionRaw!==null&&currentProductionRaw>0?currentProductionRaw:null;
    const recoveryRate=num(raw.recoveryRate??cap?.recovery??prod?.recovery);
    const grade=num(raw.gradePercent??q?.gradePercent??q?.normalized?.gradePercent);
    const gradeText=textOrNull(raw.grade??raw.oreGrade??q?.grade??q?.oreGrade);
    const purity=num(raw.purity??q?.purity??q?.normalized?.purityFraction);
    const concentration=num(raw.concentrationPercent??q?.concentrationPercent??q?.normalized?.concentrationPercent);
    const reserveAuthority=reserveQuantity===null?'UNOBSERVED':reserveAuthorityCandidate;
    const productionAuthority=productionRate===null?'UNOBSERVED':productionAuthorityCandidate;
    const qualityPresent=grade!==null||gradeText!==null||purity!==null||concentration!==null;
    const qualityAuthority=qualityPresent?qualityAuthorityCandidate:'UNOBSERVED';

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
        geologicalQuantity:geologicalResourceQuantity,
        recoverableQuantity,
        residualQuantity,
        geologicalResourceQuantity,technicallyRecoverableQuantity,economicallyRecoverableQuantity,extractableReserveQuantity,
        quantityKind:textOrNull(rs?.quantityKind||raw.quantityKind)||'EXTRACTABLE_RESERVE',
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
      annualProduction:raw.annualProduction||ref.annualProduction||null,
      recoveryRate,
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
    return runtime.filter(row=>row&&typeof row==='object').map(row=>clone(row));
  }

  function depositKeyFor(row,index){
    return String(row?.id||row?.depositId||row?.mineId||('DEP-'+index+'-'+tok(row?.name||row?.resId||'unknown'))).trim();
  }

  function sourceMineSiteReferences(){
    const e=engine(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    const sourceDatasetId='resources.json.countryProfiles';
    const byPhysicalIdentity=new Map();
    const mergeDefined=function(baseValue,incoming){
      const out=clone(baseValue||{});
      for(const [k,v] of Object.entries(incoming||{})){
        if(v===undefined||v===null||v==='')continue;
        if(out[k]===undefined||out[k]===null||out[k]==='')out[k]=clone(v);
        else if(Array.isArray(out[k])&&Array.isArray(v)){
          const seen=new Set(out[k].map(x=>JSON.stringify(x)));
          for(const item of v){
            const sig=JSON.stringify(item);
            if(!seen.has(sig)){out[k].push(clone(item));seen.add(sig);}
          }
        }else if(out[k]&&typeof out[k]==='object'&&v&&typeof v==='object'&&!Array.isArray(out[k])&&!Array.isArray(v)){
          out[k]=mergeDefined(out[k],v);
        }
      }
      return out;
    };
    const getResource=function(site){
      const s=site&&typeof site==='object'?site:{};
      return String(s.resourceId||s.resourceTypeId||s.resourceTypeKey||s.resId||s.resource||'').trim().toLowerCase();
    };
    const getStableIds=function(site){
      const s=site&&typeof site==='object'?site:{};
      return [
        s.siteId,s.mineId,s.depositId,s.resourceInstanceId,s.canonicalOccurrenceKey,
        s.linkedDepositId,s.depositKey
      ].filter(v=>v!==undefined&&v!==null&&String(v).trim()!=='').map(String);
    };
    const getLocation=function(site){
      const s=site&&typeof site==='object'?site:{};
      if(s.lat!==undefined||s.latitude!==undefined||s.long!==undefined||s.longitude!==undefined){
        return JSON.stringify({lat:s.lat??s.latitude??null,long:s.long??s.longitude??null});
      }
      return String(s.locationNodeKey||s.location||s.coordinates||'').trim();
    };
    const runtimeDeposits=Array.isArray(e?.deposits)?e.deposits:[];
    const depositKeys=function(dep){
      return [dep?.id,dep?.depositId,dep?.mineId,dep?.linkedDepositId,dep?.depositKey]
        .filter(v=>v!==undefined&&v!==null&&String(v).trim()!=='').map(String);
    };
    const resolveCanonicalDeposit=function(site,countryId,siteName){
      const explicit=getStableIds(site),explicitHits=[];
      for(const key of explicit){
        for(const dep of runtimeDeposits){
          if(depositKeys(dep).includes(key))explicitHits.push(dep);
        }
      }
      const uniqueExplicit=[...new Map(explicitHits.map(dep=>[depositKeys(dep)[0]||JSON.stringify(dep),dep])).values()];
      if(uniqueExplicit.length===1)return depositKeys(uniqueExplicit[0])[0]||null;
      const wantedName=tok(siteName);
      const nameHits=runtimeDeposits.filter(dep=>
        canonicalCountry(dep?.countryCode||dep?.countryId||dep?.country||dep?.iso3||'')===countryId &&
        tok(dep?.name||dep?.depositName||dep?.siteName||'')===wantedName
      );
      return nameHits.length===1?(depositKeys(nameHits[0])[0]||null):null;
    };

    for(const [profileKey,profile] of Object.entries(profiles)){
      const identity=profile?.identity||profile||{};
      const countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
      if(!countryId)continue;
      const sites=profile?.resource_infrastructure_context?.mineSites||
        profile?.infrastructure_context?.mineSites||
        profile?.resourceInfrastructureContext?.mineSites||[];
      if(!Array.isArray(sites))continue;
      for(let index=0;index<sites.length;index++){
        const rawSite=sites[index];
        const siteName=String(
          typeof rawSite==='string'
            ? rawSite
            : rawSite?.name||rawSite?.siteName||rawSite?.mineName||rawSite?.depositName||
              rawSite?.siteId||rawSite?.mineId||rawSite?.depositId||('UNNAMED_SITE_'+countryId+'_'+index)
        ).trim();
        if(!siteName)continue;
        const rawSiteObject=rawSite&&typeof rawSite==='object'?clone(rawSite):{name:siteName};
        const resourceId=getResource(rawSiteObject);
        const stableIds=getStableIds(rawSiteObject);
        const locationKey=getLocation(rawSiteObject);
        const canonicalDepositKey=resolveCanonicalDeposit(rawSiteObject,countryId,siteName);
        const physicalKey=canonicalDepositKey
          ? countryId+'|DEP:'+tok(canonicalDepositKey)
          : countryId+'|N:'+tok(siteName)+'|L:'+tok(locationKey||'');
        const sourcePath=`GSRSK_Master_CountryProfiles_v14.countryProfiles.${String(profileKey)}.resource_infrastructure_context.mineSites[${index}]`;
        const existing=byPhysicalIdentity.get(physicalKey);
        if(existing){
          existing.rawSiteReference=mergeDefined(existing.rawSiteReference,rawSiteObject);
          existing.sourceDatasetIds=[...new Set([...(existing.sourceDatasetIds||[]),sourceDatasetId])];
          existing.sourcePaths=[...new Set([...(existing.sourcePaths||[]),sourcePath])];
          existing.sourceIds=[...new Set([...(existing.sourceIds||[]),...stableIds])];
          const mergedResource=getResource(existing.rawSiteReference)||resourceId;
          existing.resourceAsset=normalizeUnifiedAsset({
            ...clone(existing.rawSiteReference),
            assetType:'MINE_SITE',
            assetId:existing.siteReferenceKey,
            siteReferenceKey:existing.siteReferenceKey,
            siteName:existing.siteName,
            countryId,
            countryCode:countryId,
            resourceId:mergedResource||null,
            resourceTypeId:mergedResource||null,
            sourceAuthority:'RESOURCE_JSON',
            sourceDatasetId:existing.sourceDatasetId,
            sourcePath:existing.sourcePath,
            extractionExecutable:false
          });
          continue;
        }
        const siteReferenceKey=canonicalDepositKey
          ? 'SITE:'+countryId+':DEP:'+tok(canonicalDepositKey)
          : stableIds.length
            ? 'SITE:'+countryId+':ID:'+tok(stableIds[0])
            : 'SITE:'+countryId+':'+tok(siteName)+(locationKey?':'+tok(locationKey):'');
        const resourceAsset=normalizeUnifiedAsset({
          ...clone(rawSiteObject),
          assetType:'MINE_SITE',
          assetId:siteReferenceKey,
          siteReferenceKey,
          siteName,countryId,countryCode:countryId,
          resourceId:resourceId||null,
          resourceTypeId:resourceId||null,
          sourceAuthority:'RESOURCE_JSON',
          sourceDatasetId:sourceDatasetId,
          sourcePath,
          extractionExecutable:false
        });
        byPhysicalIdentity.set(physicalKey,{
          siteReferenceKey,countryId,countryCode:countryId,profileKey:String(profileKey),siteName,
          status:'ACTIVE_SITE_REFERENCE',activationState:'ACTIVE_REFERENCE',
          extractionExecutable:false,
          quantitativeExtractionDataAvailable:resourceAsset.quantitativeExtractionDataAvailable===true,
          sourceAuthority:'RESOURCE_JSON',sourceDatasetId,sourcePath,
          sourceDatasetIds:[sourceDatasetId],sourcePaths:[sourcePath],sourceIds:stableIds,
          rawSiteReference:rawSiteObject,resourceAsset
        });
      }
    }
    return [...byPhysicalIdentity.values()];
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

    const occurrenceByIdentity=new Map(),occurrencesByName=new Map(),siteReferenceBindings=new Map();
    const putIdentity=function(key,occ){
      const k=String(key??'').trim();
      if(k)occurrenceByIdentity.set(k,occ);
    };
    rows.forEach(function(occ){
      putIdentity(occ.occurrenceKey,occ);
      putIdentity(occ.depositKey,occ);
      const raw=occ.rawDeposit||{};
      putIdentity(raw.id,occ);putIdentity(raw.depositId,occ);putIdentity(raw.mineId,occ);
      const nameKey=canonicalCountry(occ.countryId)+'|'+String(occ.resourceTypeId||'').trim().toLowerCase()+'|'+tok(occ.depositRawName);
      const list=occurrencesByName.get(nameKey)||[];
      list.push(occ);occurrencesByName.set(nameKey,list);
    });
    const resolveBinding=function(site){
      const s=site&&typeof site==='object'?site:{};
      const explicit=[
        s.canonicalOccurrenceKey,s.linkedDepositId,s.depositKey,s.depositId,s.mineId,s.resourceInstanceId,s.instanceId,
        s.occurrenceKey,s.rawSiteReference?.canonicalOccurrenceKey,s.rawSiteReference?.linkedDepositId,s.rawSiteReference?.depositKey,
        s.rawSiteReference?.depositId,s.rawSiteReference?.mineId,s.rawSiteReference?.resourceInstanceId,s.rawSiteReference?.instanceId
      ].filter(Boolean).map(String);
      let hit=null,authority=null;
      for(const key of explicit){
        hit=occurrenceByIdentity.get(key);
        if(hit){authority='EXPLICIT_SOURCE_LINK';break;}
      }
      if(!hit){
        const country=canonicalCountry(s.countryId||s.countryCode||s.country);
        const resource=String(
          s.resourceId||s.resourceTypeId||s.resourceTypeKey||s.resId||
          s.resourceAsset?.resourceTypeId||s.resourceAsset?.resourceType||
          s.rawSiteReference?.resourceId||s.rawSiteReference?.resourceTypeId||s.rawSiteReference?.resourceTypeKey||s.rawSiteReference?.resId||''
        ).trim().toLowerCase();
        const name=String(
          s.siteName||s.name||s.mineName||s.depositName||s.resourceAsset?.siteName||
          s.rawSiteReference?.siteName||s.rawSiteReference?.name||s.rawSiteReference?.mineName||s.rawSiteReference?.depositName||''
        ).trim();
        if(country&&resource&&name){
          const list=occurrencesByName.get(country+'|'+resource+'|'+tok(name))||[];
          if(list.length===1){hit=list[0];authority='UNIQUE_COUNTRY_RESOURCE_NAME';}
        }
      }
      return hit?{
        siteReferenceKey:String(s.siteReferenceKey||'')||null,
        occurrenceKey:hit.occurrenceKey,
        depositKey:hit.depositKey,
        countryId:hit.countryId,
        resourceId:hit.resourceTypeId,
        authority:authority||'RUNTIME_RESOLVED',
        physicalIdentity:true
      }:{
        siteReferenceKey:String(s.siteReferenceKey||'')||null,
        occurrenceKey:null,depositKey:null,
        countryId:canonicalCountry(s.countryId||s.countryCode||s.country)||null,
        resourceId:String(s.resourceId||s.resourceTypeId||s.resourceTypeKey||s.resId||'').trim().toLowerCase()||null,
        authority:'UNRESOLVED',
        physicalIdentity:false
      };
    };
    siteReferences.forEach(function(site){
      const binding=resolveBinding(site);
      if(binding.occurrenceKey){
        site.canonicalOccurrenceKey=binding.occurrenceKey;
        site.canonicalDepositKey=binding.depositKey;
        site.bindingAuthority=binding.authority;
        site.physicalIdentity=true;
      }else{
        site.canonicalOccurrenceKey=null;
        site.canonicalDepositKey=null;
        site.bindingAuthority=binding.authority;
        site.physicalIdentity=false;
      }
      siteReferenceBindings.set(String(site.siteReferenceKey),binding);
    });

    const registry={
      version:VERSION,
      authority:'RESOURCE_JSON',
      occurrenceCount:rows.length,
      siteReferenceCount:siteReferences.length,
      getOccurrencesByCountry:function(countryId){return clone(byCountry.get(canonicalCountry(countryId))||[]);},
      getMineSiteReferencesByCountry:function(countryId){return clone(siteRefsByCountry.get(canonicalCountry(countryId))||[]);},
      listMineSiteReferences:function(){return clone(siteReferences);},
      getMineSiteReferenceBinding:function(siteReference){
        const key=typeof siteReference==='string'?siteReference:siteReference?.siteReferenceKey;
        const dynamic=resolveBinding(siteReference);
        if(dynamic?.physicalIdentity)return clone(dynamic);
        const stored=siteReferenceBindings.get(String(key||''));
        if(stored)return clone(stored);
        return clone(dynamic);
      },
      listMineSiteReferenceBindings:function(){return clone([...siteReferenceBindings.entries()].map(function(entry){return entry[1];}));},
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
