/* OMEGA RESOURCE ENDOWMENT & MINE EXTRACTION RUNTIME v1.0.0
 * resources.json/resources_2.json -> resource profiles
 * ResourceMinistryEngine -> canonical mine/deposit inventory
 * Part 04 -> identity/ownership/location
 * Part 05 -> reserve/extraction calculation
 * country resource state -> production/reserves/inventory -> trade/autonomy
 */
(function(g){
  'use strict';
  const VERSION='2.0.0',DAY_HOURS=24,MAX_LEDGER=2048,MAX_MINE_HISTORY=4096;
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const rid=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
  const tok=v=>String(v??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{
    const raw=String(v??'').trim(),u=raw.toUpperCase(),e=engine(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    if(profiles[u])return u;
    const direct=Object.entries(profiles).find(function(entry){
      const key=String(entry[0]).toUpperCase(),p=entry[1]||{},i=p.identity||p;
      return key===u||String(i.countryId||'').toUpperCase()===u||String(i.iso3||'').toUpperCase()===u;
    });
    if(direct)return String(direct[0]).toUpperCase();
    const nameNorm=raw.normalize?.('NFKC').trim().toLowerCase();
    if(nameNorm){
      const matches=Object.entries(profiles).filter(function(entry){
        const p=entry[1]||{},i=p.identity||p;
        return [i.name,i.countryName,i.officialName,i.shortName,i.displayName].filter(Boolean).some(function(x){return String(x).normalize?.('NFKC').trim().toLowerCase()===nameNorm;});
      });
      if(matches.length===1)return String(matches[0][0]).toUpperCase();
    }
    try{
      const r=registry()?.resolveCountry?.(v);
      if(r?.id){
        const resolved=id(r.id);
        const byResolved=Object.entries(profiles).find(function(entry){
          const i=entry[1]?.identity||entry[1]||{};
          return String(entry[0]).toUpperCase()===resolved||String(i.countryId||'').toUpperCase()===resolved||String(i.iso3||'').toUpperCase()===resolved;
        });
        if(byResolved)return String(byResolved[0]).toUpperCase();
        const byIso2=Object.entries(profiles).filter(function(entry){return String((entry[1]?.identity||entry[1]||{}).iso2||'').toUpperCase()===resolved;});
        if(byIso2.length===1)return String(byIso2[0][0]).toUpperCase();
      }
    }catch(_){}
    return u;
  };
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const boundary=()=>g.Omega?.ResourceCountryBoundaryGuard||g.OmegaResourceCountryBoundaryGuard||null;
  const turn=()=>n(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  const engine=()=>g.ResourceMinistryEngine||null;
  function countries(){
    const out=new Set(),authoritative=new Set(),allowedExtras=new Set();
    try{
      const e=engine(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
      Object.entries(profiles).forEach(function(entry){
        const key=entry[0],profile=entry[1]||{},identity=profile.identity||profile;
        const c=canonical(identity.iso3||identity.countryCode||identity.country_code||key);
        if(c){out.add(c);authoritative.add(c);}
      });
      const deposits=Array.isArray(e?.deposits)?e.deposits:[];
      deposits.forEach(function(row){
        const c=canonical(row?.countryCode||row?.countryIso3||row?.countryId||row?.iso3||row?.country||'');
        if(c){allowedExtras.add(c);out.add(c);}
      });
    }catch(_){}
    try{
      const exportRows=registry()?.exportData?.().countries||[];
      if(Array.isArray(exportRows))exportRows.forEach(function(x){
        const c=canonical(x?.id||x?.iso3||x?.iso2||x?.countryCode||x);
        if(c)out.add(c);
      });
    }catch(_){}
    try{
      Object.keys(state()?.resource||{}).forEach(function(x){const c=canonical(x);if(c&&(authoritative.has(c)||allowedExtras.has(c)))out.add(c);});
    }catch(_){}
    return[...out].filter(function(c){return authoritative.has(c)||allowedExtras.has(c);}).sort();
  }
  function countryState(c){
    const cid=canonical(c),s=state();if(!s.resource)s.resource={};if(!s.resource[cid])s.resource[cid]={};
    return s.resource[cid];
  }
  function dispatch(type,c,payload){
    const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{return m.dispatchCommand('resource',type,canonical(c),payload,{turn:turn(),commandType:type,correlationId:payload?.correlationId||payload?.extractionId||null});}
    catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }
  function emit(type,c,payload={},commandId=null){
    const m=interop();if(!m?.emitEvent)return null;
    try{return m.emitEvent(type,canonical(c),'resource',{countryId:canonical(c),...clone(payload)},{turn:turn(),causationId:commandId,correlationId:payload?.correlationId||payload?.extractionId||null});}
    catch(_){return null;}
  }
  function profile(c){
    const e=engine(),cid=canonical(c);
    return e?.countryProfiles?.[cid]||e?.countryProfiles?.[Object.keys(e?.countryProfiles||{}).find(k=>id(k)===cid)]||null;
  }
  function buildKnowledge(){
    const e=engine();if(!e?.isReady)return null;
    const profiles=e.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    const profileList=Object.values(profiles);
    const countriesRaw=profileList.map(p=>clone(p?.identity||p)).filter(Boolean).map(p=>{
      const x=clone(p);if(!x.iso3)x.iso3=x.countryId||x.isoCode||null;if(!x.id)x.id=x.iso3;return x;
    });
    const refs=Array.isArray(e.deposits)?e.deposits.slice():[];
    for(const [profileKey,p] of Object.entries(profiles)){
      const identity=p?.identity||p||{};
      const countryId=canonical(identity.countryId||identity.iso3||profileKey);
      const sites=p?.resource_infrastructure_context?.mineSites||p?.infrastructure_context?.mineSites||[];
      if(!Array.isArray(sites))continue;
      sites.forEach((site,index)=>{
        const name=typeof site==='string'?site:String(site?.name||site?.siteName||site?.mineName||site?.depositName||('MINE_SITE_'+index)).trim();
        if(!name)return;
        refs.push({
          ...(site&&typeof site==='object'?clone(site):{}),
          id:'SITE_REF_'+countryId+'_'+String(index+1).padStart(3,'0'),
          name,
          countryCode:countryId,
          country:identity.name||countryId,
          metadata:{...(site&&typeof site==='object'&&site.metadata&&typeof site.metadata==='object'?clone(site.metadata):{}),subType:'mineSites'},
          sourceAuthority:'RESOURCE_JSON',
          sourceDatasetId:'resources.json.countryProfiles',
          sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']'
        });
      });
    }
    const dedup=new Map();
    refs.forEach(ref=>{
      const key=String(ref?.id||'').trim().toUpperCase();
      if(key)dedup.set(key,ref);
    });
    return{
      sovereignEntities:{countries:countriesRaw,resourceTypes:clone(e.resourceTypes||[])},
      refCatalog:{allReferences:[...dedup.values()]}
    };
  }
  function compile(){
    try{g.Omega?.ResourceProductionModelV2?.patch?.();}catch(_){}
    const p4=g.GSRSK_Part04||g.GSRSK_ResourceIdentityEngine;
    const p5=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;
    const knowledge=buildKnowledge();
    if(!knowledge||!p4?.compileIdentities||!p5?.compileReserves)return{status:'WAITING_DEPENDENCIES'};
    const identityResult=p4.compileIdentities(knowledge,null,null);
    if(!identityResult?.registry)return{status:'FAILED',reason:'RESOURCE_IDENTITY_COMPILATION_FAILED',detail:clone(identityResult)};
    const identityRegistry=g.OmegaResourceProductionModelV2?.normalizeIdentityRegistry?.(identityResult.registry)||identityResult.registry;
    const reserveResult=p5.compileReserves(identityRegistry,null,knowledge,{});

    if(!reserveResult?.registry)return{status:'FAILED',reason:'RESOURCE_RESERVE_COMPILATION_FAILED',detail:clone(reserveResult)};
    g.__OmegaResourceIdentityRegistry=identityRegistry;
    g.__OmegaResourceReserveRegistry=reserveResult.registry;
    g.__OmegaResourceKnowledgeModel=knowledge;
    return{status:'READY',identity:identityResult,reserve:reserveResult};
  }
  function applyPersistedReserveStates(){
    const r=g.__OmegaResourceReserveRegistry;if(!r?.getReserveState)return;
    for(const c of countries()){
      const saved=state()?.resource?.[c]?.mineStates||{};
      for(const [occKey,row] of Object.entries(saved)){
        try{
          const current=r.getReserveState(occKey);if(!current||!row)continue;
          const next=new (g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine).ReserveState({...clone(row),occurrenceKey:occKey});
          r.registerReserveState(next);
        }catch(_){}
      }
    }
  }
  function mineSiteReferenceRows(c){
    const wanted=canonical(c),reg=g.__OmegaResourceIdentityRegistry,merged=new Map();
    try{
      const primary=reg?.getMineSiteReferencesByCountry?.(wanted)||[];
      if(Array.isArray(primary))for(const ref of primary){
        const key=String(ref?.siteReferenceKey||ref?.referenceId||ref?.id||ref?.siteName||ref?.name||'').trim().toUpperCase();
        if(key)merged.set(key,clone(ref));
      }
    }catch(_){}
    const refs=g.__OmegaResourceKnowledgeModel?.refCatalog?.allReferences;
    if(Array.isArray(refs))for(const ref of refs.filter(ref=>canonical(ref?.countryCode||ref?.countryId||ref?.country)===wanted)){
      const key=String(ref?.siteReferenceKey||ref?.referenceId||ref?.id||ref?.siteName||ref?.name||'').trim().toUpperCase();
      if(key&&!merged.has(key))merged.set(key,clone(ref));
    }
    return[...merged.values()];
  }
  function occurrenceRows(c){
    const reg=g.__OmegaResourceIdentityRegistry;const e=engine();const rr=g.__OmegaResourceReserveRegistry;if(!reg||!e||!rr)return[];
    const wanted=canonical(c),out=[],seen=new Set();
    try{
      const occurrences=reg.getOccurrencesByCountry?.(wanted)||[];
      for(const occ of occurrences){
        const dep=reg.getDeposit?.(occ.depositKey);if(!dep)continue;
        const raw=clone(occ.rawDeposit||dep.rawDeposit||((e.deposits||[]).find(x=>String(x?.name||'').trim().toUpperCase()===String(dep.depositRawName||'').trim().toUpperCase()&&id(x?.countryCode||x?.country||'')===wanted)||null));
        const parentKey=String(occ.occurrenceKey||'');
        const keys=[];
        const addKey=k=>{const s=String(k||'');if(s&&!seen.has(s))keys.push(s);};
        addKey(parentKey);
        for(const k of rr.reserveStates?.keys?.()||[])if(String(k)===parentKey||String(rr.reserveStates.get(k)?.parentOccurrenceKey||'')===parentKey)addKey(k);
        for(const key of keys){
          const reserve=rr.getReserveState?.(key),capacity=rr.getCapacityForOccurrence?.(key);if(!reserve||!capacity)continue;
          const resourceId=rid(reserve.resourceId||occ.resourceTypeId||occ.resourceTypeKey);if(!resourceId)continue;
          const child=String(key)!==parentKey;
          const commodity=rr.commodityDeposits?.get?.(key)||null;
          if(!child&&!String(key).includes(':COM:')&&!commodity&&rr.reserveStates?.size>0){
            /* parent record may be a legacy single-commodity stream */
          }
          out.push({
            occurrenceKey:key,parentOccurrenceKey:reserve.parentOccurrenceKey||occ.occurrenceKey,depositKey:occ.depositKey,resourceId,countryId:wanted,
            depositName:dep.depositRawName,locationNodeKey:dep.locationNodeKey||occ.locationNodeKey||null,
            resourceTypeKey:resourceId,reserveState:reserve,capacity,
            rawDeposit:clone(raw||null),ownerKey:occ.ownerKey||null,operatorKey:occ.operatorKey||null,
            sourceDatasetId:raw?.sourceDatasetId||raw?.provenance?.sourceDatasetId||null,
            lifecycle:rr.lifecycles?.get?.(key)||null,accessibility:rr.accessibilityStates?.get?.(key)||null,
            commodityKey:child?key:null
          });
          seen.add(key);
        }
      }
    }catch(_){}
    return out;
  }

  function rid0(v){return String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();}
  function parsePurityFromGrade(text,resourceId){
    const raw=String(text||'').trim();if(!raw)return{purity:null,purityStatus:'UNOBSERVED',gradePercent:null};
    const key=rid0(resourceId),patterns=[];
    if(key==='natural_gas')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*(?:methane|gas)/i);
    if(key==='iron_ore')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*fe/i);
    if(key==='bauxite')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*(?:al2o3|aluminum|alumina)/i);
    if(key==='copper')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*cu/i);
    if(key==='nickel')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*ni/i);
    if(key==='cobalt')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*co/i);
    if(key==='rare_earth')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*(?:reo|rare|bastn)/i);
    if(key==='phosphate')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*(?:p2o5|bpl|phosphate)/i);
    if(key==='potash')patterns.push(/([0-9]+(?:\.[0-9]+)?)\s*%[^,;]*(?:k2o|potash)/i);
    for(const pattern of patterns){const m=raw.match(pattern);if(m){const p=n(m[1]);if(p!==null&&p>=0&&p<=100)return{purity:p/100,purityStatus:'OBSERVED',gradePercent:p};}}
    const generic=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if(generic){const p=n(generic[1]);if(p!==null&&p>=0&&p<=100)return{purity:p/100,purityStatus:'OBSERVED',gradePercent:p};}
    return{purity:null,purityStatus:'UNOBSERVED',gradePercent:null};
  }
  function resourceDefinition(resourceId){
    const e=engine(),key=rid0(resourceId),list=Array.isArray(e?.resourceTypes)?e.resourceTypes:[];
    return list.find(x=>rid0(x?.id)===key)||null;
  }
  function mineQuality(x){
    const raw=x?.rawDeposit||{},stateQuality=x?.reserveState?.quality||null,model=x?.siteModel?.commodityStreams?.find?.(s=>rid(s?.resourceId)===rid(x?.resourceId))?.quality;
    const mergedInput=stateQuality?{...clone(stateQuality),...clone(raw)}:raw;
    const rawQuality=(g.Omega?.ResourceRealism?.quality&&(raw||stateQuality))?g.Omega.ResourceRealism.quality(mergedInput,x.resourceId):model;
    const base=stateQuality||rawQuality||model;
    if(base){
      const mergedQuality={...clone(rawQuality||{}),...clone(stateQuality||{}),normalized:{...clone(rawQuality?.normalized||{}),...clone(stateQuality?.normalized||{})}};
      if(mergedQuality.concentration==null&&rawQuality?.concentration!=null)mergedQuality.concentration=rawQuality.concentration;
      if(mergedQuality.concentrationStatus!=='OBSERVED'&&rawQuality?.concentrationStatus==='OBSERVED')mergedQuality.concentrationStatus='OBSERVED';
      if(mergedQuality.purity==null&&stateQuality?.purity==null&&rawQuality?.purity!=null)mergedQuality.purity=rawQuality.purity;
      if(mergedQuality.APIGravity==null&&rawQuality?.APIGravity!=null)mergedQuality.APIGravity=rawQuality.APIGravity;
      return{...mergedQuality,
        gradePercent:mergedQuality.normalized?.gradePercent??null,
        concentrationPercent:mergedQuality.normalized?.concentrationPercent??null,
        purity:mergedQuality.normalized?.purityFraction??mergedQuality.purity??null,
        APIGravity:mergedQuality.normalized?.APIGravity??mergedQuality.APIGravity??null,
        qualityAuthority:mergedQuality.gradeStatus==='OBSERVED'||mergedQuality.concentrationStatus==='OBSERVED'||mergedQuality.purityStatus==='OBSERVED'||mergedQuality.apiGravityStatus==='OBSERVED'?'OBSERVED':'SIMULATED'
      };
    }
    const legacy=parsePurityFromGrade(raw.grade,x?.resourceId);
    return{purity:legacy.purity,purityStatus:legacy.purityStatus,gradePercent:legacy.gradePercent,gradeText:raw.grade||null,qualityAuthority:'UNOBSERVED',qualitySource:'UNOBSERVED',physicalState:String(raw.physicalState||'SOLID_RUN_OF_MINE').toUpperCase()};
  }
function batchFromExtraction(x,record){
    const q=mineQuality(x),rs=record?.reserveAfter||{},base=record?.producedBatch||{},qty=n(record?.approvedQuantity)||0;
    const pa=String(record?.provenance?.productionAuthority||record?.provenance?.quantityAuthority||x?.capacity?.authority||'').toUpperCase();
    const simulatedQuantity=pa==='SIMULATED'||pa==='SIMULATION_RULESET'||x?.capacity?.stateAuthority==='SIMULATED';
    const batchId=String(base?.batchId||('BATCH_EXT_'+turn()+'_'+canonical(x.countryId)+'_'+String(x.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,'')));
    const c=canonical(x.countryId);
    const local={
      batchId,resourceId:x.resourceId,materialIdentity:'RES_TYPE:'+x.resourceId,resourceIdentityKey:'RES_TYPE:'+x.resourceId,
      quantity:qty,remainingQuantity:qty,unit:base?.unit||rs?.unit||x?.capacity?.unit||resourceDefinition(x.resourceId)?.unit||null,
      stage:'RAW_EXTRACTED',quality:q.purity===null?null:q.purity,grade:q.gradePercent,purity:q.purity,qualityState:q,
      epistemicState:simulatedQuantity?'SIMULATED':'OBSERVED',stateAuthority:simulatedQuantity?'SIMULATED':'OBSERVED',countryId:c,sourceCountryId:c,originCountryId:c,
      ownerCountryCode:c,ownerKey:x.ownerKey||null,custodianKey:c,destinationCountryId:c,
      locationNodeKey:'WAREHOUSE:'+c+':RAW',warehouseId:'WH-'+c+'-RAW',
      originKey:x.occurrenceKey,facilityKey:x.occurrenceKey,extractionReference:record?.extractionId||null,sourceBatchIds:[],
      lifecycleStatus:'AVAILABLE',timestampTurn:turn(),transferType:'LOCAL_EXTRACTION',
      provenance:{
        sourceSubsystem:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME_V2',sourceAuthority:simulatedQuantity?'SIMULATED':'OBSERVED',
        sourceDatasetId:x.sourceDatasetId||x.rawDeposit?.sourceDatasetId||null,depositKey:x.depositKey,occurrenceKey:x.occurrenceKey,simulationTurn:turn(),quantityAuthority:simulatedQuantity?'SIMULATED':'OBSERVED'
      },
      reserveAfter:clone(rs)
    };
    const check=boundary()?.validateLocalBatch?.(local,c);
    if(check&&!check.ok)throw new Error(check.reason||'RESOURCE_COUNTRY_BOUNDARY_VIOLATION');
    return local;
  }
  function appendBounded(arr,row,max){const next=Array.isArray(arr)?arr.slice():[];next.push(clone(row));while(next.length>max)next.shift();return next;}
  function strategicReserveMap(existing){
    const spr=existing&&typeof existing==='object'&&existing.strategicReserve&&typeof existing.strategicReserve==='object' ? existing.strategicReserve : {};
    return spr.availableByResource&&typeof spr.availableByResource==='object'?spr.availableByResource:{};
  }
  function computeTradeAvailability(inventory,sprMap){
    const out={};
    for(const [k,v] of Object.entries(inventory&&typeof inventory==='object'?inventory:{})){
      const total=n(v); if(total===null)continue;
      out[k]=Math.max(0,total-(n(sprMap?.[k])??0));
    }
    for(const [k,v] of Object.entries(sprMap&&typeof sprMap==='object'?sprMap:{})){
      if(out[k]!==undefined)continue;
      out[k]=Math.max(0,(n(inventory?.[k])??0)-(n(v)??0));
    }
    return out;
  }
  function buildMineSiteControllers(c,rows,existing={}){
    const refs=mineSiteReferenceRows(c);
    const executableKeys=new Set((rows||[]).map(x=>String(x.occurrenceKey)));
    const old=existing&&typeof existing.mineSiteControllers==='object'&&existing.mineSiteControllers?existing.mineSiteControllers:{};
    const controllers={};
    for(const site of refs){
      const siteKey=String(site.siteReferenceKey||'');
      if(!siteKey)continue;
      const prior=old[siteKey]&&typeof old[siteKey]==='object'?clone(old[siteKey]):{};
      const pathId='MINE_PATH:'+canonical(c)+':'+siteKey;
      const existingLinked=Array.isArray(prior.linkedOccurrenceKeys)?prior.linkedOccurrenceKeys:[];
      const attachedRows=(rows||[]).filter(x=>String(x?.siteReferenceKey||'')===siteKey);
      const attachedKeys=attachedRows.map(x=>String(x.occurrenceKey||'')).filter(Boolean);
      const linked=[...new Set([...existingLinked,...attachedKeys])].filter(k=>executableKeys.has(String(k)));
      controllers[siteKey]={
        ...prior,
        siteReferenceKey:siteKey,
        siteName:site.siteName,
        countryId:canonical(c),
        countryCode:canonical(c),
        sourcePath:site.sourcePath||null,
        sourceDatasetId:site.sourceDatasetId||'RESOURCE_JSON.countryProfiles',
        sourceAuthority:'RESOURCE_JSON',
        activationState:'ACTIVE_SITE_CONTROLLER',
        controllerStatus:'RUNNING',
        extractionExecutable:linked.length>0,
        quantitativeDataState:linked.length>0?'AVAILABLE':'MISSING_FROM_SITE_REFERENCE',
        linkedOccurrenceKeys:linked,
        pathId,
        extractionPathStatus:linked.length>0?'EXECUTABLE_OCCURRENCE_ATTACHED':'BLOCKED_MISSING_QUANTITATIVE_DATA',
        lastEvaluationTurn:turn(),
        rawSiteReference:clone(site.rawSiteReference||site.rawSite||null)
      };
    }
    return controllers;
  }


  function siteExecutionRows(c,existing={}){
    const p=profile(c)||{},rows=[],seen=new Set(),realism=g.Omega?.ResourceRealism||g.OmegaResourceRealism;
    const add=(asset,index,explicitResource=null,assetType='MINE_SITE')=>{
      const siteName=String(asset?.siteName||asset?.name||asset?.mineName||asset?.depositName||asset||'').trim();if(!siteName)return;
      const siteKey=String(asset?.siteReferenceKey||('SITE:'+canonical(c)+':'+tok(siteName))).trim();
      const baseOccurrenceKey=(assetType==='MINE_SITE'?'SITE_OCC:':'FIELD_OCC:')+canonical(c)+':'+tok(siteKey);
      const model=realism?.siteModel?.({...clone(asset||{}),siteReferenceKey:siteKey,resourceId:explicitResource||asset?.resourceId||asset?.resourceTypeId},p,canonical(c));
      const streams=Array.isArray(model?.commodityStreams)?model.commodityStreams:[];if(!streams.length)return;
      const p5=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;if(!p5?.ReserveState)return;
      for(const stream of streams){
        if(!stream?.resourceId)continue;
        const occurrenceKey=streams.length>1?baseOccurrenceKey+':COM:'+tok(stream.resourceId):baseOccurrenceKey;
        if(seen.has(occurrenceKey))continue;seen.add(occurrenceKey);
        const old=existing?.mineStates?.[occurrenceKey],unit=stream.reserve.unit,prod=stream.production,q=stream.quality;
        const generated={occurrenceKey,countryId:canonical(c),depositKey:'SIM_'+tok(occurrenceKey),resourceId:stream.resourceId,
          geologicalQuantity:stream.reserve.quantity,recoverableQuantity:stream.reserve.quantity,residualQuantity:stream.reserve.quantity,unit,
          operationalStatus:'ACTIVE_EXTRACTION',stateVersion:1,quality:q,productionModel:prod,
          provenance:{sourceAuthority:'RESOURCE_JSON.countryProfiles',stateAuthority:'SIMULATED',sourceDatasetId:'resources.json.countryProfiles',sourcePath:asset?.sourcePath||null,
            quantityAuthority:stream.reserve.authority||'SIMULATED',productionAuthority:prod.authority||'SIMULATED',qualityAuthority:q.gradeStatus==='OBSERVED'?'OBSERVED':'SIMULATED',simulationRuleVersion:realism?.VERSION||null}};
        const merged=realism?.firewall&&old&&typeof old==='object'?realism.firewall(clone(old),generated):generated;
        const previous=merged?new p5.ReserveState(clone(merged)):null;
        const reserve=previous||new p5.ReserveState({
          occurrenceKey,countryId:canonical(c),depositKey:'SIM_'+tok(occurrenceKey),resourceId:stream.resourceId,
          geologicalQuantity:stream.reserve.quantity,recoverableQuantity:stream.reserve.quantity,residualQuantity:stream.reserve.quantity,unit,
          operationalStatus:'ACTIVE_EXTRACTION',stateVersion:1,quality:q,productionModel:prod,
          provenance:{sourceAuthority:'RESOURCE_JSON.countryProfiles',stateAuthority:'SIMULATED',sourceDatasetId:'resources.json.countryProfiles',sourcePath:asset?.sourcePath||null,
            quantityAuthority:stream.reserve.authority||'SIMULATED',productionAuthority:prod.authority||'SIMULATED',qualityAuthority:q.gradeStatus==='OBSERVED'?'OBSERVED':'SIMULATED',simulationRuleVersion:realism?.VERSION||null}
        });
        const capacity=p5?.Capacity?new p5.Capacity({
          occurrenceKey,countryId:canonical(c),resourceId:stream.resourceId,unit,
          quantityUnit:unit,rateUnit:unit+'/DAY',
          nominalCapacity:prod.nominalCapacity,minimumCapacity:prod.minimumCapacity,maximumCapacity:prod.maximumCapacity,
          nominalRate:prod.activeRate,dailyRate:prod.activeRate,utilization:prod.utilization,recovery:prod.recovery,decline:prod.decline,
          maintenance:prod.maintenance,operatingCost:prod.operatingCost,activeRate:prod.activeRate,observedRate:prod.observedRate||null,
          assetReference:assetType+':'+occurrenceKey,authority:prod.authority||'SIMULATED',stateAuthority:prod.authority||'SIMULATED',
          dataStatus:prod.dataStatus||'SIMULATED',quantityAuthority:stream.reserve.authority||'SIMULATED',productionAuthority:prod.authority||'SIMULATED',
          simulationHorizonDays:Math.max(3650,Math.round(stream.reserve.quantity/Math.max(prod.activeRate,1)/365))
        }):{occurrenceKey,countryId:canonical(c),resourceId:stream.resourceId,unit,quantityUnit:unit,rateUnit:unit+'/DAY',nominalRate:prod.activeRate,dailyRate:prod.activeRate,
          nominalCapacity:prod.nominalCapacity,minimumCapacity:prod.minimumCapacity,maximumCapacity:prod.maximumCapacity,utilization:prod.utilization,recovery:prod.recovery,decline:prod.decline,maintenance:prod.maintenance,
          operatingCost:prod.operatingCost,activeRate:prod.activeRate,authority:prod.authority||'SIMULATED',stateAuthority:prod.authority||'SIMULATED',
          productionAuthority:prod.authority||'SIMULATED',dataStatus:prod.dataStatus||'SIMULATED',assetReference:assetType+':'+occurrenceKey,
          computeWindowCapacity(hours){const h=n(hours);return{windowCapacity:(this.activeRate||this.nominalRate||0)*(h===null?1:Math.max(0,h/24))};}};
        rows.push({
          occurrenceKey,parentOccurrenceKey:streams.length>1?baseOccurrenceKey:null,siteReferenceKey:siteKey,depositKey:'SIM_'+tok(occurrenceKey),depositName:siteName,resourceId:stream.resourceId,countryId:canonical(c),resourceTypeKey:stream.resourceId,
          locationNodeKey:'ASSET:'+canonical(c)+':'+tok(siteName),ownerKey:null,operatorKey:null,status:'ACTIVE_PRODUCING',
          rawDeposit:{id:occurrenceKey,name:siteName,countryCode:canonical(c),resId:stream.resourceId,status:'ACTIVE_PRODUCING',assetType,simulation:true,stateAuthority:reserve.provenance?.stateAuthority||'SIMULATED',
            sourceDatasetId:'RESOURCE_JSON.countryProfiles',sourcePath:asset?.sourcePath||null,productionModel:prod,quality:q,reserveModel:stream.reserve},
          sourceDatasetId:'RESOURCE_JSON.countryProfiles',
          lifecycle:{status:'ACTIVE_EXTRACTION',mode:'PROFILE_DERIVED_SITE_MODEL',assetType,authority:prod.authority||'SIMULATED'},
          accessibility:{state:'AVAILABLE',sourceAuthority:'RESOURCE_JSON_PROFILE',stateAuthority:reserve.provenance?.stateAuthority||'SIMULATED'},
          reserveState:reserve,capacity,isSimulationGenerated:(prod.authority||'SIMULATED')!=='OBSERVED'||stream.reserve.authority!=='OBSERVED',assetType,siteModel:model,
          dataAuthority:{reserve:stream.reserve.authority||'SIMULATED',production:prod.authority||'SIMULATED',quality:q.gradeStatus==='OBSERVED'?'OBSERVED':'SIMULATED'}
        });
      }
    };
    mineSiteReferenceRows(c).forEach(ref=>add(ref,null,null,'MINE_SITE'));
    const h=p?.hydrocarbon_resource_base||{};
    for(const key of ['oil','naturalGas']){
      const list=Array.isArray(h[key])?h[key]:[];
      list.forEach(name=>add({name,sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+canonical(c)+'.hydrocarbon_resource_base.'+key},
        null,key==='oil'?'crude_oil':'natural_gas',key==='oil'?'OIL_FIELD':'GAS_FIELD'));
    }
    return rows;
  }

  function buildCountryProjection(c,rows,existing={}){
    const byResource={},mines=[],mineSiteReferences=mineSiteReferenceRows(c),mineSiteReferenceCount=mineSiteReferences.length;
    const mineSiteControllers=buildMineSiteControllers(c,rows,existing);
    for(const x of rows){
      const rs=x.reserveState,raw=x.rawDeposit;if(!rs)continue;
      const resource=x.resourceId;
      if(!byResource[resource])byResource[resource]={declared:0,recoverable:0,residual:0,mineCount:0};
      byResource[resource].declared+=n(rs.geologicalQuantity)||0;
      byResource[resource].recoverable+=n(rs.recoverableQuantity)||0;
      byResource[resource].residual+=n(rs.residualQuantity)||0;
      byResource[resource].mineCount+=1;
      const quality=mineQuality(x);
      mines.push({
        occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,depositName:x.depositName,
        countryId:canonical(c),locationNodeKey:x.locationNodeKey,resourceTypeKey:x.resourceTypeKey,
        ownerKey:x.ownerKey,operatorKey:x.operatorKey,rawDeposit:raw,
        reserveState:clone(rs.toJSON?.()||rs),operationalStatus:rs.operationalStatus,unit:rs.unit,
        qualityState:quality,purity:quality.purity,gradePercent:quality.gradePercent,
        outputRatePerDay:n(x.capacity?.activeRate)||n(x.capacity?.nominalRate)||n(x.capacity?.dailyRate)||null,
        productionModel:{
          nominalCapacity:n(x.capacity?.nominalCapacity)||n(x.capacity?.nominalRate)||null,
          minimumCapacity:n(x.capacity?.minimumCapacity)||null,maximumCapacity:n(x.capacity?.maximumCapacity)||null,
          utilization:n(x.capacity?.utilization??x.capacity?.effortUtilization)||null,recovery:n(x.capacity?.recovery)||null,
          decline:n(x.capacity?.decline)||null,maintenance:n(x.capacity?.maintenance)||null,operatingCost:n(x.capacity?.operatingCost),
          activeRate:n(x.capacity?.activeRate)||n(x.capacity?.nominalRate)||null,authority:x.capacity?.authority||'UNOBSERVED',
          stateAuthority:x.capacity?.stateAuthority||x.capacity?.authority||'UNOBSERVED',dataStatus:x.capacity?.dataStatus||'UNOBSERVED'
        },
        sourceDatasetId:x.sourceDatasetId||raw?.sourceDatasetId||null,provenance:clone(rs.provenance||raw?.provenance||null),
        stateAuthority:x.capacity?.stateAuthority||rs.provenance?.stateAuthority||raw?.stateAuthority||'UNOBSERVED',
        reserveAuthority:rs.provenance?.quantityAuthority||raw?.reserveAuthority||'UNOBSERVED',
        productionAuthority:x.capacity?.authority||'UNOBSERVED',
        qualityAuthority:quality?.qualityAuthority||'UNOBSERVED'
      });
    }
    const merge=(derived,old)=>{
      const out=clone(derived||{});if(old&&typeof old==='object')for(const [k,v] of Object.entries(old))if(v!==undefined)out[k]=clone(v);return out;
    };
    const reserves={},endowment={};
    for(const [k,v] of Object.entries(byResource)){reserves[k]=v.residual;endowment[k]=v.recoverable;}
    const inventory=merge({},existing.inventory),production=merge({},existing.production),consumption=merge({},existing.consumption);
    const strategicReserve=clone(existing.strategicReserve||{
      warehouseId:'WH-'+canonical(c)+'-SPR',countryId:canonical(c),type:'STRATEGIC_RESERVE_STOCKPILE',locationNodeKey:'WAREHOUSE:'+canonical(c)+':SPR',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[],transfers:[],lastTransferTurn:null
    });
    const tradeAvailability=computeTradeAvailability(inventory,strategicReserve.availableByResource);
    const mineStates=existing.mineStates&&typeof existing.mineStates==='object'?clone(existing.mineStates):{};
    for(const x of rows)mineStates[x.occurrenceKey]=clone(x.reserveState.toJSON?.()||x.reserveState);
    return{
      ...clone(existing),countryResourceProfile:clone(profile(c)),resourceDomain:clone(profile(c)?.resource_domain||null),
      mines,mineSiteReferences,mineSiteReferenceCount,mineSiteControllers,
      endowment,reserves:merge(reserves,existing.reserves),inventory,production,consumption,tradeAvailability,mineStates,
      strategicReserve,
      batches:Array.isArray(existing.batches)?existing.batches.slice(-MAX_LEDGER):[],
      warehouse:clone(existing.warehouse||{
        warehouseId:'WH-'+canonical(c)+'-RAW',countryId:canonical(c),type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        locationNodeKey:'WAREHOUSE:'+canonical(c)+':RAW',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[],lastReceiptTurn:null
      }),
      mineOutputs:clone(existing.mineOutputs||{}),mineOutputTotals:clone(existing.mineOutputTotals||{}),
      mineProductionLedger:Array.isArray(existing.mineProductionLedger)?existing.mineProductionLedger.slice(-MAX_MINE_HISTORY):[],
      extractionLedger:Array.isArray(existing.extractionLedger)?existing.extractionLedger.slice(-MAX_LEDGER):[],
      resourceAuthority:{
        source:'RESOURCE_JSON->PART04->PART05->RESOURCE_RUNTIME',
        knowledgeSources:['resources.json','resources_2.json'],
        mineSource:'RESOURCE_JSON.runtime_deposits + PROFILE_DERIVED_SIMULATION_ASSETS',
        mineSiteSource:'RESOURCE_JSON.countryProfiles.*.resource_infrastructure_context.mineSites',
        executableMineCount:rows.length,
        structuredExecutableMineCount:occurrenceRows(c).length,
        profileDerivedExecutableAssetCount:rows.filter(x=>x.isSimulationGenerated).length,
        mineSiteReferenceCount,
        reserveSource:'GSRSK_Part05.ResourceReserveExtractionEngine',
        countryScoped:true,fullEffortPolicy:'MODEL_DRIVEN',simulationTurn:turn(),dataLoadReport:eDataReport()
      }
    };
  }
  function eDataReport(){try{return clone(engine()?.getDataLoadReport?.()||engine()?.dataLoadReport||null);}catch(_){return null;}}

  function hydrateHandler(cmd,ctx){
    const c=canonical(ctx.countryId),existing=clone(state()?.resource?.[c]||{}),rows=[...occurrenceRows(c),...siteExecutionRows(c,existing)];
    const projection=buildCountryProjection(c,rows,existing);
    const mineSiteReferenceCount=Number(projection.mineSiteReferenceCount)||0;
    for(const [path,value] of [
      ['resource.countryResourceProfile',projection.countryResourceProfile],
      ['resource.resourceDomain',projection.resourceDomain],
      ['resource.mines',projection.mines],
      ['resource.mineSiteReferences',projection.mineSiteReferences],
      ['resource.mineSiteReferenceCount',projection.mineSiteReferenceCount],
      ['resource.mineSiteControllers',projection.mineSiteControllers],
      ['resource.endowment',projection.endowment],
      ['resource.reserves',projection.reserves],
      ['resource.inventory',projection.inventory],
      ['resource.production',projection.production],
      ['resource.consumption',projection.consumption],
      ['resource.tradeAvailability',projection.tradeAvailability],
      ['resource.strategicReserve',projection.strategicReserve],
      ['resource.mineStates',projection.mineStates],
      ['resource.mineOutputs',clone(existing.mineOutputs||{})],
      ['resource.mineOutputTotals',projection.mineOutputTotals],
      ['resource.mineProductionLedger',projection.mineProductionLedger],
      ['resource.batches',projection.batches],
      ['resource.warehouse',projection.warehouse],
      ['resource.extractionLedger',projection.extractionLedger],
      ['resource.authority',projection.resourceAuthority]
    ])ctx.stateTransaction.set(path,value);
    emit('OMEGA_RESOURCE_ENDOWMENT_HYDRATED',c,{
      countryId:c,mineCount:rows.length,mineSiteReferenceCount,
      resourceCount:Object.keys(projection.endowment).length,resourceIds:Object.keys(projection.endowment)
    },cmd.commandId);
    return{accepted:true,countryId:c,mineCount:rows.length,mineSiteReferenceCount,resourceCount:Object.keys(projection.endowment).length};
  }
  function extractHandler(cmd,ctx){
    const c=canonical(ctx.countryId),r=g.__OmegaResourceReserveRegistry,p5=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;
    if(!r||!p5?.ExtractionRequest||!p5?.executeExtraction)return{accepted:false,reason:'PART05_RESOURCE_EXTRACTION_UNAVAILABLE'};
    const current=ctx.stateTransaction.get('resource.mineStates')||{};
    const production=clone(ctx.stateTransaction.get('resource.production')||{});
    const previousExtractionTurn=n(ctx.stateTransaction.get('resource.lastExtractionTurn'));
    if(previousExtractionTurn!==turn()){
      for(const key of Object.keys(production))production[key]=0;
      ctx.stateTransaction.set('resource.lastExtractionTurn',turn());
    }
    const inventory=clone(ctx.stateTransaction.get('resource.inventory')||{});
    const reserves=clone(ctx.stateTransaction.get('resource.reserves')||{});
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.extractionLedger'))?clone(ctx.stateTransaction.get('resource.extractionLedger')):[];
    const mineProductionLedger=Array.isArray(ctx.stateTransaction.get('resource.mineProductionLedger'))?clone(ctx.stateTransaction.get('resource.mineProductionLedger')):[];
    const mineOutputTotals=clone(ctx.stateTransaction.get('resource.mineOutputTotals')||{});
    const existingBatches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const inventoryLots=clone(ctx.stateTransaction.get('resource.inventoryLots')||{});
    const minePaths=clone(ctx.stateTransaction.get('resource.minePaths')||{});
    const warehouse=clone(ctx.stateTransaction.get('resource.warehouse')||{
      warehouseId:'WH-'+c+'-RAW',countryId:c,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
      locationNodeKey:'WAREHOUSE:'+c+':RAW',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[],lastReceiptTurn:null
    });
    const existingResourceState=ctx.stateTransaction.get('resource')||{};
    const persistedMineStates=ctx.stateTransaction.get('resource.mineStates')||{};
    const rows=[...occurrenceRows(c),...siteExecutionRows(c,{mineStates:persistedMineStates})];
    const selected=Array.isArray(cmd?.payload?.occurrenceKeys)&&cmd.payload.occurrenceKeys.length
      ?rows.filter(x=>cmd.payload.occurrenceKeys.includes(x.occurrenceKey)):rows;
    const extracted=[];
    const blocked=[];
    const mineOutputs=clone(ctx.stateTransaction.get('resource.mineOutputs')||{});
    const mineSiteControllers=clone(ctx.stateTransaction.get('resource.mineSiteControllers')||{});
    const mines=clone(ctx.stateTransaction.get('resource.mines')||[]);
    const allSiteKeys=Object.keys(mineSiteControllers);
    for(const siteKey of allSiteKeys){
      const controller=mineSiteControllers[siteKey];
      const hasExecutable=Array.isArray(controller.linkedOccurrenceKeys)&&controller.linkedOccurrenceKeys.length>0;
      const pathId=controller.pathId||('MINE_PATH:'+c+':'+siteKey);
      const path=minePaths[siteKey]&&typeof minePaths[siteKey]==='object'?clone(minePaths[siteKey]):{
        pathId,siteReferenceKey:siteKey,siteName:controller.siteName,countryId:c,resourceId:null,
        sourceCountryId:c,destinationCountryId:c,stages:[],status:hasExecutable?'READY':'BLOCKED_MISSING_QUANTITATIVE_DATA',
        lastTurn:null,batchIds:[],inventoryAllocations:[]
      };
      if(!Array.isArray(path.stages))path.stages=[];
      if(path.stages.length===0)path.stages.push({stage:'SITE_CONTROLLER_SCAN',turn:turn(),status:hasExecutable?'EXECUTABLE':'BLOCKED_MISSING_QUANTITATIVE_DATA'});
      path.lastTurn=turn();
      minePaths[siteKey]=path;
      if(!hasExecutable){
        mineOutputs[siteKey]={
          siteReferenceKey:siteKey,siteName:controller.siteName,countryId:c,simulationTurn:turn(),
          producedQuantity:0,status:'BLOCKED_MISSING_QUANTITATIVE_DATA',
          blockReason:'SITE_REFERENCE_HAS_NO_QUANTITATIVE_MINE_RECORD',
          pathId
        };
      }
    }
    for(const x of selected){
      const pathId='MINE_PATH:'+c+':'+String(x.occurrenceKey);
      const existingPath=minePaths[x.occurrenceKey]&&typeof minePaths[x.occurrenceKey]==='object'?clone(minePaths[x.occurrenceKey]):{
        pathId,occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,countryId:c,resourceId:x.resourceId,
        sourceCountryId:c,destinationCountryId:c,stages:[],status:'READY',lastTurn:null,batchIds:[],inventoryAllocations:[]
      };
      if(!Array.isArray(existingPath.stages))existingPath.stages=[];
      if(!Array.isArray(existingPath.batchIds))existingPath.batchIds=[];
      if(!Array.isArray(existingPath.inventoryAllocations))existingPath.inventoryAllocations=[];
      existingPath.stages.push({stage:'EXTRACTION_SCAN',turn:turn()});
      existingPath.lastTurn=turn();
      minePaths[x.occurrenceKey]=existingPath;
      const reserve=r.getReserveState(x.occurrenceKey)||x.reserveState;
      if(!reserve){
        const reason={occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'RESERVE_STATE_UNAVAILABLE'};
        blocked.push(reason);
        mineOutputs[x.occurrenceKey]={occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:x.resourceId,simulationTurn:turn(),producedQuantity:0,status:'BLOCKED',blockReason:reason.reason};
        continue;
      }
      if(reserve.residualQuantity<=0){
        const reason={occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'RESERVE_EXHAUSTED'};
        blocked.push(reason);
        mineOutputs[x.occurrenceKey]={occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:x.resourceId,simulationTurn:turn(),producedQuantity:0,status:'BLOCKED',blockReason:reason.reason,residualQuantity:n(reserve.residualQuantity)||0};
        continue;
      }
      const operationalStatus=String(reserve.operationalStatus||'').toUpperCase();
      const sourceStatus=String(x.rawDeposit?.status||'').toUpperCase();
      const operational=/(ACTIVE_EXTRACTION|DEPLETING|RESERVE_DEPLETING|OPERATING|RUNNING|PRODUCING)/.test(operationalStatus) ||
        (/(ACTIVE|OPERATING|RUNNING|PRODUCING)/.test(sourceStatus) && !/(SUSPEND|BLOCK|CLOSED|ABANDON|DEPLET)/.test(sourceStatus));
      if(!operational){
        const reason={occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'MINE_NOT_OPERATIONAL',operationalStatus:operationalStatus||'UNKNOWN',sourceStatus:sourceStatus||null};
        blocked.push(reason);
        mineOutputs[x.occurrenceKey]={occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:x.resourceId,simulationTurn:turn(),producedQuantity:0,status:'BLOCKED',blockReason:reason.reason,operationalStatus:operationalStatus||'UNKNOWN',sourceStatus:sourceStatus||null,residualQuantity:n(reserve.residualQuantity)||0};
        continue;
      }
      let capacity=x.isSimulationGenerated?x.capacity:null;try{if(!capacity)capacity=r.getCapacityForOccurrence(x.occurrenceKey);}catch(_){}
      if(!capacity){
        const reason={occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'EXTRACTION_CAPACITY_UNAVAILABLE'};
        blocked.push(reason);
        mineOutputs[x.occurrenceKey]={occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:x.resourceId,simulationTurn:turn(),producedQuantity:0,status:'BLOCKED',blockReason:reason.reason,residualQuantity:n(reserve.residualQuantity)||0};
        continue;
      }
      let windowQuantity=0;try{windowQuantity=n(capacity.computeWindowCapacity(DAY_HOURS)?.windowCapacity)||0;}catch(_){windowQuantity=n(capacity.nominalRate)||0;}
      if(windowQuantity<=0){
        const reason={occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'EXTRACTION_OUTPUT_RATE_UNAVAILABLE'};
        blocked.push(reason);
        mineOutputs[x.occurrenceKey]={occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:x.resourceId,simulationTurn:turn(),producedQuantity:0,status:'BLOCKED',blockReason:reason.reason,residualQuantity:n(reserve.residualQuantity)||0};
        continue;
      }
      const request=new p5.ExtractionRequest({
        occurrenceKey:x.occurrenceKey,requestedQuantity:windowQuantity,requestedUnit:reserve.unit,
        requestedPeriod:p5.TemporalWindowUnit?.PER_DAY||'PER_DAY',assetReference:capacity.assetReference,
        expectedStateVersion:n(reserve.stateVersion)||1,simulationTick:turn(),timeWindowDurationHours:DAY_HOURS,
        extractionMethod:p5.ExtractionMethodEnum?.UNKNOWN||'UNKNOWN',
        provenance:{sourceSubsystem:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME',sourceId:x.depositKey,timestamp:0,
          sourceAuthority:x.isSimulationGenerated?'SIMULATED':'OBSERVED',sourceDatasetId:x.sourceDatasetId||x.rawDeposit?.sourceDatasetId||null,
          quantityAuthority:x.isSimulationGenerated?'SIMULATED':'OBSERVED',effortUtilization:n(x.capacity?.utilization??x.capacity?.effortUtilization??0.85)}
      });
      let result;
      try{
        result=p5.executeExtraction(request,reserve,{
          capacity,identityRegistry:g.__OmegaResourceIdentityRegistry,
          accessibilityState:r.accessibilityStates?.get?.(x.occurrenceKey)||undefined,
          recoverabilityModel:r.getRecoverabilityModelForResource?.(x.resourceTypeKey)||undefined,
          overdrawPolicy:p5.OverdrawPolicyEnum?.CAP||'CAP'
        });
      }catch(error){
        blocked.push({occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:String(error?.message||error)});
        continue;
      }
      if(!result||![p5.ExtractionResultStatus?.APPROVED||'APPROVED',p5.ExtractionResultStatus?.PARTIALLY_APPROVED||'PARTIALLY_APPROVED'].includes(result.status)){
        blocked.push({occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:result?.diagnostics?.[0]?.message||result?.status||'EXTRACTION_NOT_APPROVED'});
        continue;
      }
      r.registerReserveState(result.reserveAfter);

      const q=n(result.approvedQuantity)||0,resource=x.resourceId;
      production[resource]=(n(production[resource])||0)+q;
      inventory[resource]=(n(inventory[resource])||0)+q;
      reserves[resource]=n(result.reserveAfter.residualQuantity)||0;
      current[x.occurrenceKey]=clone(result.reserveAfter.toJSON?.()||result.reserveAfter);
      const record={
        extractionId:'EXT-'+turn()+'-'+c+'-'+String(x.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,''),
        countryId:c,simulationTurn:turn(),occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,
        requestedQuantity:request.requestedQuantity,approvedQuantity:q,status:result.status,
        effortUtilization:n(x.capacity?.utilization??x.capacity?.effortUtilization??0.85),simulationGenerated:!!x.isSimulationGenerated,
        reserveBefore:clone(result.reserveBefore?.toJSON?.()||result.reserveBefore),
        reserveAfter:clone(result.reserveAfter?.toJSON?.()||result.reserveAfter),
        calculationTrace:clone(result.calculationTrace?.toJSON?.()||result.calculationTrace),
        transition:clone(result.transition?.toJSON?.()||result.transition),
        producedBatch:clone(result.producedBatch?.toJSON?.()||result.producedBatch),
        provenance:clone(result.provenance||request.provenance)
      };
      const batch=batchFromExtraction(x,record);
      const batchCheck=boundary()?.validateLocalBatch?.(batch,c);
      if(batchCheck&&!batchCheck.ok)throw new Error(batchCheck.reason||'RESOURCE_COUNTRY_BOUNDARY_VIOLATION');
      if(!batch.batchId||batch.quantity<=0)throw new Error('EXTRACTION_BATCH_CREATION_FAILED');
      if(!existingBatches.some(b=>String(b?.batchId)===batch.batchId))existingBatches.push(batch);
      inventoryLots[batch.batchId]={
        batchId:batch.batchId,resourceId:resource,countryId:c,sourceCountryId:c,originCountryId:c,
        destinationCountryId:c,warehouseId:batch.warehouseId,quantity:q,remainingQuantity:q,
        stage:'RAW_INVENTORY',purity:batch.purity,gradePercent:batch.grade,qualityState:clone(batch.qualityState),
        occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,pathId,
        extractionReference:record.extractionId,simulationTurn:turn(),status:'AVAILABLE'
      };
      existingPath.stages.push({stage:'BATCH_CREATED',turn:turn(),batchId:batch.batchId,quantity:q});
      existingPath.batchIds.push(batch.batchId);
      existingPath.inventoryAllocations.push({batchId:batch.batchId,resourceId:resource,quantity:q,warehouseId:batch.warehouseId,turn:turn(),status:'ALLOCATED_TO_COUNTRY_INVENTORY'});
      existingPath.status='INVENTORY_AVAILABLE';
      existingPath.lastTurn=turn();
      minePaths[x.occurrenceKey]=existingPath;
      const fiscalPending=dispatch('OMEGA_RESOURCE_ECON_EXTRACTION_FISCAL_PENDING',c,{
        record:{
          countryId:c,mineId:x.occurrenceKey,depositKey:x.depositKey,batchId:batch.batchId,resourceId:resource,
          quantity:q,unit:batch.unit,purity:batch.purity,gradePercent:batch.grade,
          occurrencePathId:pathId,warehouseId:batch.warehouseId,extractionId:record.extractionId,
          valuationStatus:'UNOBSERVED_MARKET_VALUE',cashPosted:false,simulationGenerated:!!x.isSimulationGenerated,sourceAuthority:x.isSimulationGenerated?'SIMULATED':'OBSERVED'
        },
        correlationId:record.extractionId
      });
      if(fiscalPending?.status!=='APPLIED'){
        existingPath.stages.push({stage:'TREASURY_FISCAL_LEDGER_PENDING',turn:turn(),status:'DEGRADED',reason:fiscalPending?.reason||'FISCAL_LEDGER_HANDLER_UNAVAILABLE'});
        minePaths[x.occurrenceKey]=existingPath;
      } else {
        existingPath.stages.push({stage:'TREASURY_FISCAL_LEDGER_PENDING',turn:turn(),status:'RECORDED',cashPosted:false});
        minePaths[x.occurrenceKey]=existingPath;
      }
      if(!mineOutputTotals[x.occurrenceKey])mineOutputTotals[x.occurrenceKey]={cumulativeQuantity:0,turnCount:0,lastTurn:null};
      mineOutputTotals[x.occurrenceKey].cumulativeQuantity=(n(mineOutputTotals[x.occurrenceKey].cumulativeQuantity)||0)+q;
      mineOutputTotals[x.occurrenceKey].turnCount=(n(mineOutputTotals[x.occurrenceKey].turnCount)||0)+1;
      mineOutputTotals[x.occurrenceKey].lastTurn=turn();
      mineOutputs[x.occurrenceKey]={
        occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,simulationTurn:turn(),
        assetType:x.assetType||'STRUCTURED_MINE',simulationGenerated:!!x.isSimulationGenerated,effortUtilization:x.isSimulationGenerated?1:null,
        producedQuantity:q,residualQuantity:n(result.reserveAfter.residualQuantity)||0,status:result.status,
        effortUtilization:record.effortUtilization,simulationGenerated:record.simulationGenerated,
        batchId:batch.batchId,purity:batch.purity,grade:batch.grade,quality:batch.quality,qualityState:clone(batch.qualityState),
        unit:batch.unit,warehouseId:batch.warehouseId,outputCumulative:mineOutputTotals[x.occurrenceKey].cumulativeQuantity
      };
      const mineIndex=mines.findIndex(m=>String(m.occurrenceKey)===String(x.occurrenceKey));
      if(mineIndex>=0)mines[mineIndex]={...mines[mineIndex],
        reserveState:clone(result.reserveAfter.toJSON?.()||result.reserveAfter),operationalStatus:result.reserveAfter.operationalStatus,
        residualQuantity:n(result.reserveAfter.residualQuantity)||0,lastOutputQuantity:q,lastOutputTurn:turn(),
        lastBatchId:batch.batchId,purity:batch.purity,gradePercent:batch.grade,qualityState:clone(batch.qualityState),warehouseId:batch.warehouseId
      };
      warehouse.availableByResource[resource]=(n(warehouse.availableByResource[resource])||0)+q;
      warehouse.storedBatchIds=Array.isArray(warehouse.storedBatchIds)?warehouse.storedBatchIds:[];
      if(!warehouse.storedBatchIds.includes(batch.batchId))warehouse.storedBatchIds.push(batch.batchId);
      warehouse.receipts=appendBounded(warehouse.receipts,{
        receiptId:'WH-REC-'+batch.batchId,warehouseId:batch.warehouseId,countryId:c,batchId:batch.batchId,
        occurrenceKey:x.occurrenceKey,resourceId:resource,quantity:q,unit:batch.unit,purity:batch.purity,gradePercent:batch.grade,
        receivedFrom:'MINE_EXTRACTION',simulationTurn:turn(),status:'RECEIVED'
      },MAX_LEDGER);
      warehouse.lastReceiptTurn=turn();
      mineProductionLedger.push({
        productionId:record.extractionId,mineId:x.occurrenceKey,mineName:x.depositName,depositKey:x.depositKey,
        resourceId:resource,quantity:q,unit:batch.unit,purity:batch.purity,gradePercent:batch.grade,batchId:batch.batchId,
        warehouseId:batch.warehouseId,turn:turn(),reserveBefore:n(result.reserveBefore?.residualQuantity),
        reserveAfter:n(result.reserveAfter?.residualQuantity),status:result.status,
        sourceDatasetId:x.sourceDatasetId||x.rawDeposit?.sourceDatasetId||null,sourceAuthority:x.isSimulationGenerated?'SIMULATED':'OBSERVED',simulationGenerated:!!x.isSimulationGenerated
      });
      while(mineProductionLedger.length>MAX_MINE_HISTORY)mineProductionLedger.shift();
      ledger.push({...record,producedBatch:batch});
      extracted.push({...record,producedBatch:batch});

    }
    const warehouseCheck=boundary()?.validateWarehouse?.(warehouse,c);
    if(warehouseCheck&&!warehouseCheck.ok)return{accepted:false,countryId:c,extracted:0,blocked:[warehouseCheck],records:[]};
    ctx.stateTransaction.set('resource.mineStates',current);
    ctx.stateTransaction.set('resource.mineSiteControllers',mineSiteControllers);
    ctx.stateTransaction.set('resource.mineOutputs',mineOutputs);
    ctx.stateTransaction.set('resource.mineOutputTotals',mineOutputTotals);
    ctx.stateTransaction.set('resource.mineProductionLedger',mineProductionLedger.slice(-MAX_MINE_HISTORY));
    ctx.stateTransaction.set('resource.batches',existingBatches.slice(-MAX_LEDGER));
    ctx.stateTransaction.set('resource.inventoryLots',inventoryLots);
    ctx.stateTransaction.set('resource.minePaths',minePaths);
    ctx.stateTransaction.set('resource.warehouse',warehouse);
    ctx.stateTransaction.set('resource.mines',mines);
    ctx.stateTransaction.set('resource.production',production);
    ctx.stateTransaction.set('resource.inventory',inventory);
    ctx.stateTransaction.set('resource.reserves',reserves);
    const strategicReserve=clone(ctx.stateTransaction.get('resource.strategicReserve')||{
      warehouseId:'WH-'+c+'-SPR',countryId:c,type:'STRATEGIC_RESERVE_STOCKPILE',locationNodeKey:'WAREHOUSE:'+c+':SPR',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[],transfers:[],lastTransferTurn:null
    });
    ctx.stateTransaction.set('resource.strategicReserve',strategicReserve);
    const tradeAvailability=computeTradeAvailability(inventory,strategicReserve.availableByResource);
    ctx.stateTransaction.set('resource.tradeAvailability',tradeAvailability);
    ctx.stateTransaction.set('resource.extractionLedger',ledger.slice(-MAX_LEDGER));
    for(const x of blocked)emit('OMEGA_RESOURCE_EXTRACTION_BLOCKED',c,{...x,simulationTurn:turn()},cmd.commandId);
    return{accepted:true,countryId:c,extracted:extracted.length,blocked:blocked.length,records:extracted};
  }

  function publishCommittedExtractionEvents(countryId,dispatchResult){
    const c=canonical(countryId),records=dispatchResult?.result?.records||dispatchResult?.records||[];
    if(!Array.isArray(records)||!records.length)return;
    for(const record of records){
      const payload={
        countryId:c,extractionId:record.extractionId||null,occurrenceKey:record.occurrenceKey||null,depositKey:record.depositKey||null,
        resourceId:record.resourceId||null,quantity:record.approvedQuantity||0,batch:clone(record.producedBatch||null),
        purity:record.producedBatch?.purity??null,gradePercent:record.producedBatch?.grade??null,
        warehouseId:record.producedBatch?.warehouseId||('WH-'+c+'-RAW'),availabilityStatus:'AVAILABLE_FOR_FACTORY_INPUT',
        simulationTurn:turn(),sourceAuthority:record?.provenance?.sourceAuthority||'RESOURCE_JSON',simulationGenerated:!!record?.simulationGenerated,targetMinistry:'economy'
      };
      emit('OMEGA_RESOURCE_EXTRACTION_COMPLETED',c,payload,dispatchResult?.commandId||null);
      emit('OMEGA_RESOURCE_BATCH_CREATED',c,payload,dispatchResult?.commandId||null);
      emit('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',c,payload,dispatchResult?.commandId||null);
    }
  }
  function hydrateCountry(c){
    install();
    return dispatch('OMEGA_RESOURCE_ENDOWMENT_HYDRATE',canonical(c),{correlationId:'RESOURCE-HYDRATE-MANUAL-'+turn()+'-'+canonical(c)});
  }
  async function extractCountry(c,occurrenceKeys=null){
    install();
    const result=dispatch('OMEGA_RESOURCE_EXTRACT_TICK',canonical(c),{occurrenceKeys:Array.isArray(occurrenceKeys)?occurrenceKeys:undefined,correlationId:'RESOURCE-EXTRACT-MANUAL-'+turn()+'-'+canonical(c)});
    publishCommittedExtractionEvents(c,result);
    return result;
  }
  function countryResourceState(c){
    const out=clone(state()?.resource?.[canonical(c)]||null);
    if(out && !out.resourceAuthority && out.authority)out.resourceAuthority=clone(out.authority);
    return out;
  }
  function countryMines(c){return clone(state()?.resource?.[canonical(c)]?.mines||[]);}
  function install(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    try{
      m.registerAction?.('OMEGA_RESOURCE_ENDOWMENT_HYDRATE',{actionId:'OMEGA_RESOURCE_ENDOWMENT_HYDRATE',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME'});
      m.registerAction?.('OMEGA_RESOURCE_EXTRACT_TICK',{actionId:'OMEGA_RESOURCE_EXTRACT_TICK',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME'});
      m.registerCommandHandler('OMEGA_RESOURCE_ENDOWMENT_HYDRATE','resource',hydrateHandler);
      m.registerCommandHandler('OMEGA_RESOURCE_EXTRACT_TICK','resource',extractHandler);
      return true;
    }catch(_){return false;}
  }
  async function initialize(){
    if(g.__omegaResourceEndowmentReady)return{status:'READY',countries:countries().length,reused:true};
    if(g.__omegaResourceEndowmentPromise)return g.__omegaResourceEndowmentPromise;
    g.__omegaResourceEndowmentInitializing=true;
    g.__omegaResourceEndowmentPromise=(async function(){
      try{
        for(let i=0;i<400&&!engine()?.isReady;i++)await new Promise(r=>setTimeout(r,0));
        if(!engine()?.isReady)return{status:'FAILED',reason:'RESOURCE_MINISTRY_ENGINE_NOT_READY'};
        const compiled=compile();
        if(compiled.status!=='READY')return compiled;
        applyPersistedReserveStates();install();
        const countryList=countries(),hydrateFailures=[];
        for(const countryId of countryList){
          const hydrateResult=dispatch('OMEGA_RESOURCE_ENDOWMENT_HYDRATE',countryId,{correlationId:'RESOURCE-HYDRATE-'+turn()+'-'+countryId});
          if(hydrateResult?.status!=='APPLIED')hydrateFailures.push({
            countryId,status:hydrateResult?.status||'UNKNOWN',
            reason:hydrateResult?.result?.error||hydrateResult?.result?.reason||hydrateResult?.reason||'HYDRATION_NOT_APPLIED'
          });
        }
        if(hydrateFailures.length)return{
          status:'FAILED',reason:'COUNTRY_HYDRATION_INCOMPLETE',
          expectedCountries:countryList.length,appliedCountries:countryList.length-hydrateFailures.length,
          failures:hydrateFailures.slice(0,64)
        };
        g.__omegaResourceEndowmentReady=true;
        return{status:'READY',countries:countryList.length,reused:false};
      }catch(e){
        return{status:'FAILED',reason:String(e?.message||e)};
      }finally{
        g.__omegaResourceEndowmentInitializing=false;
        g.__omegaResourceEndowmentPromise=null;
      }
    })();
    return g.__omegaResourceEndowmentPromise;
  }
  async function extractAll(){
    const initialized=await initialize();
    if(!g.__OmegaResourceReserveRegistry||initialized?.status==='FAILED'||initialized?.status==='WAITING_DEPENDENCIES')return initialized||{status:'WAITING_DEPENDENCIES'};
    const t=turn();
    if(g.__omegaResourceExtractionTurn===t)return{status:'ALREADY_EXTRACTED',turn:t};
    g.__omegaResourceExtractionTurn=t;
    install();
    const results=[];
    for(const c of countries()){
      const result=dispatch('OMEGA_RESOURCE_EXTRACT_TICK',c,{correlationId:'RESOURCE-EXTRACT-'+t+'-'+c});
      publishCommittedExtractionEvents(c,result);
      results.push({countryId:c,result});
    }
    return{status:'COMPLETED',turn:t,results};
  }
  function onReady(){void initialize();}
  function onTurn(){void extractAll();}
  function diagnostics(){
    const r=g.__OmegaResourceReserveRegistry, e=engine(), mines=[];
    for(const c of countries()){
      const m=state()?.resource?.[c]?.mines;if(Array.isArray(m))mines.push(...m);
    }
    let batchCount=0,warehouseCount=0,latestMineOutputs=0,inventoryLotCount=0,minePathCount=0,mineSiteReferenceCount=0,mineSiteControllerCount=0,structuredMineCount=0,executableAssetCount=0,fieldAssetCount=0;
    for(const c of countries()){
      const rs=state()?.resource?.[c]||{};
      mineSiteReferenceCount+=Array.isArray(rs.mineSiteReferences)?rs.mineSiteReferences.length:0;
      mineSiteControllerCount+=rs.mineSiteControllers&&typeof rs.mineSiteControllers==='object'?Object.keys(rs.mineSiteControllers).length:0;
      batchCount+=Array.isArray(rs.batches)?rs.batches.length:0;
      warehouseCount+=rs.warehouse?.warehouseId?1:0;
      latestMineOutputs+=rs.mineOutputs&&typeof rs.mineOutputs==='object'?Object.keys(rs.mineOutputs).length:0;
      inventoryLotCount+=rs.inventoryLots&&typeof rs.inventoryLots==='object'?Object.keys(rs.inventoryLots).length:0;
      minePathCount+=rs.minePaths&&typeof rs.minePaths==='object'?Object.keys(rs.minePaths).length:0;
      if(Array.isArray(rs.mines)){structuredMineCount+=rs.mines.filter(x=>!x?.simulationGenerated).length;executableAssetCount+=rs.mines.filter(x=>x?.simulationGenerated===true).length;fieldAssetCount+=rs.mines.filter(x=>x?.simulationGenerated===true&&['OIL_FIELD','GAS_FIELD'].includes(x?.assetType)).length;}
    }
    let profileDerivedExecutableAssetCount=0,profileDerivedActiveAssetCount=0,profileDerivedBlockedAssetCount=0;for(const c of countries()){const rs=state()?.resource?.[c]||{};const outs=rs.mineOutputs&&typeof rs.mineOutputs==='object'?Object.values(rs.mineOutputs):[];const simOuts=outs.filter(x=>x?.simulationGenerated===true);profileDerivedExecutableAssetCount+=simOuts.length;profileDerivedActiveAssetCount+=simOuts.filter(x=>x?.status==='APPROVED'||x?.status==='PARTIALLY_APPROVED').length;profileDerivedBlockedAssetCount+=simOuts.filter(x=>String(x?.status||'').startsWith('BLOCKED')).length;} return{version:VERSION,engineReady:!!e?.isReady,dataAuthority:'RESOURCE_JSON + SIMULATION_RULESET_FOR_UNQUANTIFIED_PROFILE_SITES',dataLoad:clone(e?.getDataLoadReport?.()||e?.dataLoadReport||null),identityRegistryReady:!!g.__OmegaResourceIdentityRegistry,reserveRegistryReady:!!r,countryCount:countries().length,mineCount:mines.length,structuredMineCount,executableAssetCount,fieldAssetCount,mineSiteReferenceCount,mineSiteControllerCount,compiledReserveStates:r?.reserveStates?.size||0,batchCount,warehouseCount,latestMineOutputs,inventoryLotCount,minePathCount,profileDerivedExecutableAssetCount,profileDerivedActiveAssetCount,profileDerivedBlockedAssetCount,fullEffortPolicy:'MODEL_DRIVEN'};
  }
  function init(){
    install();
    if(engine()?.isReady)void initialize();
    g.addEventListener?.('OMEGA_READY',onReady);
    g.addEventListener?.('RESOURCE_STATE_UPDATED',onReady);
    g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',onReady);
    g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
    return diagnostics();
  }
  const API=Object.freeze({
    VERSION,diagnostics,initialize,extractAll,extractCountry,hydrateCountry,countryResourceState,countryMines,
    countryMineSiteReferences:function(c){return clone(state()?.resource?.[canonical(c)]?.mineSiteReferences||mineSiteReferenceRows(c));},
    countryMineSiteControllers:function(c){return clone(state()?.resource?.[canonical(c)]?.mineSiteControllers||{});},
    compile
  });
  g.Omega=g.Omega||{};g.Omega.ResourceEndowmentRuntime=API;g.OmegaResourceEndowmentRuntime=API;
  try{init();}catch(e){g.OmegaResourceEndowmentRuntimeError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);