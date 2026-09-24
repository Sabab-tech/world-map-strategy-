/* OMEGA RESOURCE ENDOWMENT & MINE EXTRACTION RUNTIME v1.0.0
 * resources.json/resources_2.json -> resource profiles
 * ResourceMinistryEngine -> canonical mine/deposit inventory
 * Part 04 -> identity/ownership/location
 * Part 05 -> reserve/extraction calculation
 * country resource state -> production/reserves/inventory -> trade/autonomy
 */
(function(g){
  'use strict';
  const VERSION='1.0.0',DAY_HOURS=24,MAX_LEDGER=512;
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const rid=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>n(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  const engine=()=>g.ResourceMinistryEngine||null;
  function countries(){
    try{return[...new Set((registry()?.list?.('COUNTRY')||registry()?.list?.()||[]).map(canonical).filter(Boolean))].sort();}
    catch(_){return Object.keys(state()?.resource||{}).map(canonical).filter(Boolean).sort();}
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
    const profiles=e.countryProfiles&&typeof e.countryProfiles==='object'?Object.values(e.countryProfiles):[];
    const countriesRaw=profiles.map(p=>clone(p?.identity||p)).filter(Boolean).map(p=>{
      const x=clone(p);if(!x.iso3)x.iso3=x.countryId||x.isoCode||null;if(!x.id)x.id=x.iso3;return x;
    });
    return{
      sovereignEntities:{countries:countriesRaw,resourceTypes:clone(e.resourceTypes||[])},
      refCatalog:{allReferences:clone(Array.isArray(e.deposits)?e.deposits:[])}
    };
  }
  function compile(){
    const p4=g.GSRSK_Part04||g.GSRSK_ResourceIdentityEngine;
    const p5=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;
    const knowledge=buildKnowledge();
    if(!knowledge||!p4?.compileIdentities||!p5?.compileReserves)return{status:'WAITING_DEPENDENCIES'};
    const identityResult=p4.compileIdentities(knowledge,null,null);
    if(!identityResult?.registry)return{status:'FAILED',reason:'RESOURCE_IDENTITY_COMPILATION_FAILED',detail:clone(identityResult)};
    const reserveResult=p5.compileReserves(identityResult.registry,null,knowledge,{});
    if(!reserveResult?.registry)return{status:'FAILED',reason:'RESOURCE_RESERVE_COMPILATION_FAILED',detail:clone(reserveResult)};
    g.__OmegaResourceIdentityRegistry=identityResult.registry;
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
  function occurrenceRows(c){
    const reg=g.__OmegaResourceIdentityRegistry;const e=engine();if(!reg||!e)return[];
    const wanted=canonical(c),out=[];
    try{
      const occurrences=reg.getOccurrencesByCountry?.(wanted)||[];
      for(const occ of occurrences){
        const dep=reg.getDeposit?.(occ.depositKey);if(!dep)continue;
        const raw=(e.deposits||[]).find(x=>String(x?.name||'').trim().toUpperCase()===String(dep.depositRawName||'').trim().toUpperCase()&&id(x?.countryCode||x?.country||'')===wanted);
        const resourceId=rid(occ.resourceTypeId||occ.resourceTypeKey);
        if(!resourceId)continue;
        const reserve=g.__OmegaResourceReserveRegistry?.getReserveState?.(occ.occurrenceKey);
        const capacity=g.__OmegaResourceReserveRegistry?.getCapacityForOccurrence?.(occ.occurrenceKey);
        if(!reserve||!capacity)continue;
        out.push({
          occurrenceKey:occ.occurrenceKey,depositKey:occ.depositKey,resourceId,countryId:wanted,
          depositName:dep.depositRawName,locationNodeKey:dep.locationNodeKey||occ.locationNodeKey||null,
          resourceTypeKey:occ.resourceTypeKey,reserveState:reserve,capacity,
          rawDeposit:clone(raw||null),ownerKey:occ.ownerKey||null,operatorKey:occ.operatorKey||null,
          lifecycle:g.__OmegaResourceReserveRegistry?.lifecycles?.get?.(occ.occurrenceKey)||null,
          accessibility:g.__OmegaResourceReserveRegistry?.accessibilityStates?.get?.(occ.occurrenceKey)||null
        });
      }
    }catch(_){}
    return out;
  }
  function buildCountryProjection(c,rows,existing={}){
    const byResource={},mines=[];
    for(const x of rows){
      const rs=x.reserveState,raw=x.rawDeposit;if(!rs)continue;
      const resource=x.resourceId;
      if(!byResource[resource])byResource[resource]={declared:0,recoverable:0,residual:0,mineCount:0};
      byResource[resource].declared+=n(rs.geologicalQuantity)||0;
      byResource[resource].recoverable+=n(rs.recoverableQuantity)||0;
      byResource[resource].residual+=n(rs.residualQuantity)||0;
      byResource[resource].mineCount+=1;
      mines.push({
        occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,depositName:x.depositName,
        countryId:canonical(c),locationNodeKey:x.locationNodeKey,resourceTypeKey:x.resourceTypeKey,
        ownerKey:x.ownerKey,operatorKey:x.operatorKey,rawDeposit:raw,
        reserveState:clone(rs.toJSON?.()||rs),operationalStatus:rs.operationalStatus,unit:rs.unit,
        provenance:clone(rs.provenance||raw?.provenance||null)
      });
    }
    const merge=(derived,old)=>{
      const out=clone(derived||{});
      if(old&&typeof old==='object')for(const [k,v] of Object.entries(old))if(v!==undefined)out[k]=clone(v);
      return out;
    };
    const reserves={},endowment={};
    for(const [k,v] of Object.entries(byResource)){reserves[k]=v.residual;endowment[k]=v.recoverable;}
    const inventory=merge({},existing.inventory);
    const production=merge({},existing.production);
    const consumption=merge({},existing.consumption);
    const tradeAvailability={};
    for(const resource of Object.keys(byResource))tradeAvailability[resource]=n(inventory[resource])||0;
    const mineStates=existing.mineStates&&typeof existing.mineStates==='object'?clone(existing.mineStates):{};
    for(const x of rows)mineStates[x.occurrenceKey]=clone(x.reserveState.toJSON?.()||x.reserveState);
    return{
      ...clone(existing),
      countryResourceProfile:clone(profile(c)),
      resourceDomain:clone(profile(c)?.resource_domain||null),
      mines:mines,endowment,reserves:merge(reserves,existing.reserves),
      inventory,production,consumption,tradeAvailability,mineStates,
      extractionLedger:Array.isArray(existing.extractionLedger)?existing.extractionLedger.slice(-MAX_LEDGER):[],
      resourceAuthority:{
        source:'RESOURCE_MINISTRY_ENGINE->PART04->PART05',
        knowledgeSources:['resources.json','resources_2.json'],
        mineSource:'ResourceMinistryEngine.deposits',
        reserveSource:'GSRSK_Part05.ResourceReserveExtractionEngine',
        countryScoped:true,simulationTurn:turn()
      }
    };
  }

  function appendEvent(ctx,eventType,payload){
    const logs=Array.isArray(ctx.stateTransaction.get('resource.eventLog'))
      ? clone(ctx.stateTransaction.get('resource.eventLog')) : [];
    logs.push({
      eventId:'REV-'+turn()+'-'+canonical(ctx.countryId)+'-'+String(logs.length+1),
      eventType,
      countryId:canonical(ctx.countryId),
      simulationTurn:turn(),
      payload:clone(payload||{})
    });
    const max=1024;
    ctx.stateTransaction.set('resource.eventLog',logs.slice(-max));
  }
  function parseObservedQuality(v){
    if(v===undefined||v===null||v==='')return null;
    if(typeof v==='number'&&Number.isFinite(v)){
      if(v>=0&&v<=1)return v;
      if(v>1&&v<=100)return v/100;
      return null;
    }
    const s=String(v).trim().replace(/,/g,'');
    const m=s.match(/(-?\d+(?:\.\d+)?)\s*%/);
    if(m){
      const n=Number(m[1]);return Number.isFinite(n)?n/100:null;
    }
    const n=Number(s);
    if(Number.isFinite(n)){
      if(n>=0&&n<=1)return n;
      if(n>1&&n<=100)return n/100;
    }
    return null;
  }
  function inventoryFromBatches(batchRows){
    const out={};
    (Array.isArray(batchRows)?batchRows:[]).forEach(b=>{
      const rid=String(b?.resourceId||b?.materialIdentity||'').trim();
      const q=n(b?.remainingQuantity!=null?b.remainingQuantity:b?.quantity);
      if(rid&&q!==null&&q>0)out[rid]=(out[rid]||0)+q;
    });
    return out;
  }
  function warehouseFromBatches(c,batchRows){
    const lots=[];
    const stockByResource={};
    const locationBalances={};
    (Array.isArray(batchRows)?batchRows:[]).forEach(b=>{
      const q=n(b?.remainingQuantity!=null?b.remainingQuantity:b?.quantity);
      if(!b||q===null||q<=0)return;
      const rid=String(b.resourceId||b.materialIdentity||'').trim();
      const location=String(b.warehouseLocationKey||b.warehouseLocation||'WAREHOUSE_'+canonical(c)).trim();
      if(rid)stockByResource[rid]=(stockByResource[rid]||0)+q;
      if(location){
        if(!locationBalances[location])locationBalances[location]={};
        if(rid)locationBalances[location][rid]=(locationBalances[location][rid]||0)+q;
      }
      lots.push({
        batchId:b.batchId||null,resourceId:rid,materialIdentity:b.materialIdentity||rid,
        quantity:n(b.quantity)||q,remainingQuantity:q,unit:b.unit||null,stage:b.stage||'RAW',
        locationKey:location,ownerCompanyId:b.ownerCompanyId||null,
        extractionReference:b.extractionReference||null,processId:b.processId||null,
        timestampTurn:b.timestampTurn??turn(),qualityState:clone(b.qualityState||null),
        sourceBatchIds:Array.isArray(b.sourceBatchIds)?b.sourceBatchIds.slice():[],
        provenance:clone(b.provenance||null)
      });
    });
    return {
      version:'1.0.0',
      authority:'RESOURCE_BATCH_LEDGER',
      countryId:canonical(c),
      lastUpdatedTurn:turn(),
      lotCount:lots.length,
      lots,
      stockByResource,
      locationBalances
    };
  }
  function persistPhysicalState(ctx,batchRows){
    const inventory=inventoryFromBatches(batchRows);
    const warehouse=warehouseFromBatches(ctx.countryId,batchRows);
    ctx.stateTransaction.set('resource.inventory',inventory);
    ctx.stateTransaction.set('resource.warehouse',warehouse);
    return{inventory,warehouse};
  }
  function sourceRawForOccurrence(x){
    if(x?.rawDeposit)return x.rawDeposit;
    const e=engine(),rows=Array.isArray(e?.deposits)?e.deposits:[];
    const name=String(x?.depositName||'').trim().toUpperCase();
    const country=String(x?.countryId||'').trim().toUpperCase();
    return rows.find(d=>String(d?.name||'').trim().toUpperCase()===name &&
      (!country||String(d?.countryCode||d?.country||'').trim().toUpperCase()===country))||null;
  }
  function decorateProducedBatch(rawBatch,x,result,c){
    const batch=clone(rawBatch?.toJSON?.()||rawBatch||{});
    const raw=sourceRawForOccurrence(x)||{};
    const gradeRaw=raw.grade??raw.oreGrade??raw.ore_grade??raw.assayGrade??null;
    const purityRaw=raw.purity??raw.orePurity??raw.ore_purity??raw.quality??null;
    const grade=parseObservedQuality(raw.gradeValue??gradeRaw);
    const purity=parseObservedQuality(raw.purityValue??purityRaw);
    const quality=Object.assign({},clone(batch.qualityState||{}),{
      grade,
      purity,
      gradeRaw:gradeRaw===undefined?null:gradeRaw,
      purityRaw:purityRaw===undefined?null:purityRaw,
      gradeStatus:grade===null?'UNOBSERVED':'OBSERVED_SOURCE',
      purityStatus:purity===null?'UNOBSERVED':'OBSERVED_SOURCE',
      physicalState:raw.physicalState||batch.qualityState?.physicalState||'SOLID_RUN_OF_MINE',
      chemicalState:raw.chemicalState||batch.qualityState?.chemicalState||'RAW_EXTRACTED_ORE'
    });
    batch.batchId=batch.batchId||('BATCH_EXT_'+turn()+'_'+canonical(c)+'_'+String(x.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,''));
    batch.resourceId=x.resourceId||batch.resourceId||x.resourceTypeKey;
    batch.materialIdentity=x.resourceTypeKey||x.resourceId||batch.materialIdentity;
    batch.quantity=n(batch.quantity)!=null?n(batch.quantity):n(result.approvedQuantity)||0;
    batch.remainingQuantity=batch.quantity;
    batch.unit=batch.unit||x.reserveState?.unit||raw.unit||'UNKNOWN_UNIT';
    batch.stage='RAW';
    batch.ownerCountryCode=canonical(c);
    batch.ownerCompanyId=x.ownerKey||x.operatorKey||batch.ownerCompanyId||null;
    batch.sourceLocationKey=x.locationNodeKey||x.occurrenceKey;
    batch.warehouseLocationKey='WAREHOUSE_'+canonical(c);
    batch.locationKey=batch.warehouseLocationKey;
    batch.extractionReference=batch.extractionReference||result.resultId||null;
    batch.sourceBatchIds=Array.isArray(batch.sourceBatchIds)?batch.sourceBatchIds:[];
    batch.timestampTurn=turn();
    batch.qualityState=quality;
    batch.sourceData={
      authority:'RESOURCE_JSON',
      dataset:raw.sourceDataset||null,
      path:raw.sourcePath||null,
      recordId:raw.sourceRecordId||raw.id||null,
      declaredReserve:raw.reserves??raw.reserve??null,
      declaredGrade:gradeRaw,
      declaredPurity:purityRaw,
      sourceProductionRatePerDay:raw.productionRatePerDay??null,
      productionRateBasis:raw.productionRateBasis||null,
      status:raw.status||raw.operationalStatus||null
    };
    batch.provenance=Object.assign({},clone(batch.provenance||{}),{
      sourceSubsystem:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME',
      sourceAuthority:'RESOURCE_JSON',
      sourceDataset:raw.sourceDataset||null,
      sourcePath:raw.sourcePath||null,
      sourceRecordId:raw.sourceRecordId||null,
      calculationTraceHash:result.calculationTrace?.toJSON?.().output?.traceHash||batch.provenance?.calculationTraceHash||null,
      timestamp:0
    });
    return batch;
  }
  function syncSourceCapacities(registry){
    const p5=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;
    const e=engine();
    if(!registry||!p5?.ExtractionCapacity||typeof registry.registerCapacity!=='function'||!e)return {updated:0,zeroed:0};
    let updated=0,zeroed=0;
    try{
      registry.occurrences?.forEach?.((occ,occKey)=>{
        const deposit=registry.getDeposit?.(occ.depositKey);
        const name=String(deposit?.depositRawName||'').trim().toUpperCase();
        const country=String(deposit?.hostCountryIso3||'').trim().toUpperCase();
        const raw=(e.deposits||[]).find(d=>String(d?.name||'').trim().toUpperCase()===name &&
          (!country||String(d?.countryCode||d?.country||'').trim().toUpperCase()===country));
        const rate=n(raw?.productionRatePerDay??raw?.dailyProduction??raw?.dailyOutput??raw?.capacityPerDay);
        const status=String(raw?.operationalStatus||raw?.status||'').toUpperCase();
        const inactive=/CLOSED|INACTIVE|SUSPENDED|DEPLETED|ABANDONED|PLANNED|EXPLORATION/.test(status);
        const effective=rate!==null && rate>0 && !inactive ? rate : 0;
        const res=registry.getResourceType?.(occ.resourceTypeKey);
        const unit=res?.declaredStandardUnit||raw?.unit||'TONNES';
        const capacity=new p5.ExtractionCapacity({
          assetReference:'ASSET_'+occKey,
          occurrenceKey:occKey,
          nominalRate:effective,
          rateUnit:unit,
          period:p5.TemporalWindowUnit?.PER_DAY||'PER_DAY',
          availabilityFactor:Math.max(0,Math.min(1,n(raw?.capacityAvailabilityFactor)??0.92)),
          maintenanceFactor:Math.max(0,Math.min(1,n(raw?.capacityMaintenanceFactor)??0.95))
        });
        registry.registerCapacity(capacity);
        if(effective>0)updated++;else zeroed++;
      });
    }catch(_){}
    return{updated,zeroed};
  }
  function hydrateHandler(cmd,ctx){
    const c=canonical(ctx.countryId),rows=occurrenceRows(c),existing=clone(state()?.resource?.[c]||{});
    const projection=buildCountryProjection(c,rows,existing);
    for(const [path,value] of [
      ['resource.countryResourceProfile',projection.countryResourceProfile],
      ['resource.resourceDomain',projection.resourceDomain],
      ['resource.mines',projection.mines],
      ['resource.endowment',projection.endowment],
      ['resource.reserves',projection.reserves],
      ['resource.inventory',projection.inventory],
      ['resource.production',projection.production],
      ['resource.consumption',projection.consumption],
      ['resource.tradeAvailability',projection.tradeAvailability],
      ['resource.mineStates',projection.mineStates],
      ['resource.mineOutputs',clone(existing.mineOutputs||{})],
      ['resource.extractionLedger',projection.extractionLedger],
      ['resource.authority',projection.resourceAuthority]
    ])ctx.stateTransaction.set(path,value);
    emit('OMEGA_RESOURCE_ENDOWMENT_HYDRATED',c,{countryId:c,mineCount:rows.length,resourceCount:Object.keys(projection.endowment).length,resourceIds:Object.keys(projection.endowment)},cmd.commandId);
    return{accepted:true,countryId:c,mineCount:rows.length,resourceCount:Object.keys(projection.endowment).length};
  }
  function extractHandler(cmd,ctx){
    const c=canonical(ctx.countryId),r=g.__OmegaResourceReserveRegistry,p5=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;
    if(!r||!p5?.ExtractionRequest||!p5?.executeExtraction)return{accepted:false,reason:'PART05_RESOURCE_EXTRACTION_UNAVAILABLE'};
    const current=ctx.stateTransaction.get('resource.mineStates')||{};
    const production=clone(ctx.stateTransaction.get('resource.production')||{});
    const previousExtractionTurn=n(ctx.stateTransaction.get('resource.lastExtractionTurn'));
    if(previousExtractionTurn!==turn()){
      Object.keys(production).forEach(key=>production[key]=0);
      ctx.stateTransaction.set('resource.lastExtractionTurn',turn());
    }

    let batches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const existingInventory=clone(ctx.stateTransaction.get('resource.inventory')||{});
    if(!batches.length && Object.keys(existingInventory).length){
      Object.entries(existingInventory).forEach(([resourceId,q])=>{
        const amount=n(q);
        if(amount===null||amount<=0)return;
        batches.push({
          batchId:'LEGACY_OPENING_'+c+'_'+String(resourceId).replace(/[^A-Z0-9:_-]/gi,'_'),
          resourceId,materialIdentity:resourceId,quantity:amount,remainingQuantity:amount,
          unit:null,stage:'RAW',ownerCountryCode:c,ownerCompanyId:'UNKNOWN_SOURCE',
          sourceBatchIds:[],extractionReference:null,processId:null,timestampTurn:turn(),
          qualityState:{grade:null,purity:null,gradeStatus:'UNOBSERVED',purityStatus:'UNOBSERVED'},
          provenance:{source:'PRE_EXISTING_RESOURCE_INVENTORY',status:'UNALLOCATED_LEGACY_BALANCE',simulationTurn:turn()}
        });
      });
    }

    const reserves=clone(ctx.stateTransaction.get('resource.reserves')||{});
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.extractionLedger'))?clone(ctx.stateTransaction.get('resource.extractionLedger')):[];
    const rows=occurrenceRows(c);
    const selected=Array.isArray(cmd?.payload?.occurrenceKeys)&&cmd.payload.occurrenceKeys.length
      ?rows.filter(x=>cmd.payload.occurrenceKeys.includes(x.occurrenceKey)):rows;
    const extracted=[],blocked=[];
    const mineOutputs=clone(ctx.stateTransaction.get('resource.mineOutputs')||{});
    const mines=clone(ctx.stateTransaction.get('resource.mines')||[]);

    for(const x of selected){
      const reserve=r.getReserveState(x.occurrenceKey);
      if(!reserve||reserve.residualQuantity<=0){continue;}
      const capacity=r.getCapacityForOccurrence?.(x.occurrenceKey);
      if(!capacity){blocked.push({occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'EXTRACTION_CAPACITY_UNAVAILABLE'});continue;}
      let windowQuantity=0;
      try{windowQuantity=n(capacity.computeWindowCapacity(DAY_HOURS)?.windowCapacity)||0;}catch(_){windowQuantity=n(capacity.nominalRate)||0;}
      if(windowQuantity<=0){
        blocked.push({occurrenceKey:x.occurrenceKey,resourceId:x.resourceId,reason:'SOURCE_PRODUCTION_RATE_UNOBSERVED_OR_ZERO'});
        continue;
      }
      const request=new p5.ExtractionRequest({
        occurrenceKey:x.occurrenceKey,requestedQuantity:Math.min(windowQuantity,n(reserve.residualQuantity)||0),
        requestedUnit:reserve.unit,requestedPeriod:p5.TemporalWindowUnit?.PER_DAY||'PER_DAY',
        assetReference:capacity.assetReference,expectedStateVersion:n(reserve.stateVersion)||1,
        simulationTick:turn(),timeWindowDurationHours:DAY_HOURS,extractionMethod:p5.ExtractionMethodEnum?.UNKNOWN||'UNKNOWN',
        provenance:{sourceSubsystem:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME',sourceId:x.depositKey,timestamp:0}
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
      const q=n(result.approvedQuantity)||0;
      if(q<=0)continue;
      const resource=x.resourceId;
      const batch=decorateProducedBatch(result.producedBatch,x,result,c);
      if(!batch.batchId||q<=0){blocked.push({occurrenceKey:x.occurrenceKey,resourceId:resource,reason:'PRODUCED_BATCH_INVALID'});continue;}
      if(batches.some(b=>String(b?.batchId)===String(batch.batchId)))continue;
      batches.push(batch);

      production[resource]=(n(production[resource])||0)+q;
      reserves[resource]=n(result.reserveAfter.residualQuantity)||0;
      current[x.occurrenceKey]=clone(result.reserveAfter.toJSON?.()||result.reserveAfter);

      const previous=mineOutputs[x.occurrenceKey]||{};
      const cumulative=(n(previous.cumulativeProducedQuantity)||0)+q;
      mineOutputs[x.occurrenceKey]={
        occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,simulationTurn:turn(),
        producedQuantity:q,cumulativeProducedQuantity:cumulative,residualQuantity:n(result.reserveAfter.residualQuantity)||0,
        plannedOutputRatePerDay:windowQuantity,status:result.status,lastBatchId:batch.batchId,lastExtractionId:result.resultId,
        qualityState:clone(batch.qualityState),sourceData:clone(batch.sourceData||null)
      };

      const mineIndex=mines.findIndex(m=>String(m.occurrenceKey)===String(x.occurrenceKey));
      if(mineIndex>=0){
        mines[mineIndex]=Object.assign({},mines[mineIndex],{
          reserveState:clone(result.reserveAfter.toJSON?.()||result.reserveAfter),
          operationalStatus:result.reserveAfter.operationalStatus,
          residualQuantity:n(result.reserveAfter.residualQuantity)||0,
          lastOutputQuantity:q,lastBatchId:batch.batchId,lastExtractionId:result.resultId,
          currentOutputRatePerDay:windowQuantity
        });
      }

      const record={
        extractionId:'EXT-'+turn()+'-'+c+'-'+String(x.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,''),
        resultId:result.resultId,countryId:c,simulationTurn:turn(),occurrenceKey:x.occurrenceKey,
        depositKey:x.depositKey,resourceId:resource,requestedQuantity:request.requestedQuantity,
        approvedQuantity:q,status:result.status,reserveBefore:clone(result.reserveBefore?.toJSON?.()||result.reserveBefore),
        reserveAfter:clone(result.reserveAfter?.toJSON?.()||result.reserveAfter),
        calculationTrace:clone(result.calculationTrace?.toJSON?.()||result.calculationTrace),
        transition:clone(result.transition?.toJSON?.()||result.transition),
        producedBatch:clone(batch),provenance:clone(result.provenance||request.provenance),
        qualityState:clone(batch.qualityState),sourceData:clone(batch.sourceData||null)
      };
      ledger.push(record);extracted.push(record);

      const physical=persistPhysicalState(ctx,batches);
      appendEvent(ctx,'OMEGA_RESOURCE_BATCH_CREATED',{batchId:batch.batchId,resourceId:resource,quantity:q,qualityState:batch.qualityState,warehouse:physical.warehouse});
      appendEvent(ctx,'OMEGA_RESOURCE_EXTRACTION_COMPLETED',{extractionId:record.extractionId,batchId:batch.batchId,resourceId:resource,quantity:q});
      emit('OMEGA_RESOURCE_BATCH_CREATED',c,{batch:clone(batch),extractionId:record.extractionId,sourceData:clone(batch.sourceData||null)},cmd.commandId);
      emit('OMEGA_RESOURCE_WAREHOUSE_RECEIPT_CREATED',c,{receiptId:'RCPT-'+batch.batchId,batchId:batch.batchId,resourceId:resource,quantity:q,warehouseLocation:batch.locationKey,qualityState:clone(batch.qualityState)},cmd.commandId);
      emit('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',c,{batchId:batch.batchId,resourceId:resource,quantity:q,qualityState:clone(batch.qualityState),warehouseLocation:batch.locationKey},cmd.commandId);
      emit('OMEGA_RESOURCE_EXTRACTION_COMPLETED',c,record,cmd.commandId);
    }

    const physical=persistPhysicalState(ctx,batches);
    ctx.stateTransaction.set('resource.mineStates',current);
    ctx.stateTransaction.set('resource.mineOutputs',mineOutputs);
    ctx.stateTransaction.set('resource.mines',mines);
    ctx.stateTransaction.set('resource.production',production);
    ctx.stateTransaction.set('resource.reserves',reserves);
    ctx.stateTransaction.set('resource.batches',batches.slice(-8192));
    ctx.stateTransaction.set('resource.warehouse',physical.warehouse);
    ctx.stateTransaction.set('resource.inventory',physical.inventory);
    ctx.stateTransaction.set('resource.inventoryDelta',clone(extracted.reduce((acc,x)=>{
      const rid=x.resourceId,q=n(x.approvedQuantity)||0;acc[rid]=(acc[rid]||0)+q;return acc;
    },{})));
    ctx.stateTransaction.set('resource.tradeAvailability',clone(physical.inventory));
    ctx.stateTransaction.set('resource.extractionLedger',ledger.slice(-MAX_LEDGER));
    for(const x of blocked)emit('OMEGA_RESOURCE_EXTRACTION_BLOCKED',c,{...x,simulationTurn:turn()},cmd.commandId);

    return{
      accepted:true,countryId:c,extracted:extracted.length,blocked:blocked.length,records:extracted,
      producedBatches:extracted.map(x=>clone(x.producedBatch)),
      inventory:clone(physical.inventory),warehouse:clone(physical.warehouse),
      runtimeEventCount:Array.isArray(ctx.stateTransaction.get('resource.eventLog'))?ctx.stateTransaction.get('resource.eventLog').length:0
    };
  }
  function hydrateCountry(c){
    install();
    return dispatch('OMEGA_RESOURCE_ENDOWMENT_HYDRATE',canonical(c),{correlationId:'RESOURCE-HYDRATE-MANUAL-'+turn()+'-'+canonical(c)});
  }
  function extractCountry(c,occurrenceKeys=null){
    install();
    return dispatch('OMEGA_RESOURCE_EXTRACT_TICK',canonical(c),{occurrenceKeys:Array.isArray(occurrenceKeys)?occurrenceKeys:undefined,correlationId:'RESOURCE-EXTRACT-MANUAL-'+turn()+'-'+canonical(c)});
  }
  function countryResourceState(c){return clone(state()?.resource?.[canonical(c)]||null);}
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
    if(g.__omegaResourceEndowmentInitializationPromise)return g.__omegaResourceEndowmentInitializationPromise;
    g.__omegaResourceEndowmentInitializationPromise=(async()=>{
      try{
        const dataPromise=g.OmegaResourceDataAuthority?.init?.()||g.__omegaResourceDataAuthorityPromise;
        if(dataPromise)await dataPromise;
        for(let i=0;i<80&&!engine()?.isReady;i++)await new Promise(r=>setTimeout(r,0));
        if(!engine()?.isReady)return{status:'WAITING_DEPENDENCIES',reason:'RESOURCE_MINISTRY_ENGINE_NOT_READY'};
        const compiled=compile();
        if(compiled.status!=='READY')return compiled;
        const capacitySync=syncSourceCapacities(compiled.registry);
        applyPersistedReserveStates();install();
        for(const c of countries())dispatch('OMEGA_RESOURCE_ENDOWMENT_HYDRATE',c,{correlationId:'RESOURCE-HYDRATE-'+turn()+'-'+c});
        g.__omegaResourceEndowmentReady=true;
        return{status:'READY',countries:countries().length,reused:false,sourceCapacitySync:capacitySync};
      }finally{g.__omegaResourceEndowmentInitializationPromise=null;}
    })();
    return g.__omegaResourceEndowmentInitializationPromise;
  }
  async function extractAll(){
    if(!g.__OmegaResourceReserveRegistry)await initialize();
    if(!g.__OmegaResourceReserveRegistry)return{status:'WAITING_DEPENDENCIES'};
    const t=turn();
    if(g.__omegaResourceExtractionTurn===t)return{status:'ALREADY_PROCESSED',turn:t};
    g.__omegaResourceExtractionTurn=t;
    install();
    const results=[];
    for(const c of countries()){
      try{results.push(dispatch('OMEGA_RESOURCE_EXTRACT_TICK',c,{correlationId:'RESOURCE-EXTRACT-'+t+'-'+c}));}
      catch(error){results.push({status:'FAILED',countryId:c,reason:String(error?.message||error)});}
    }
    const totals=results.reduce((a,r)=>{
      a.extracted+=(n(r?.result?.extracted)||0);
      a.blocked+=(n(r?.result?.blocked)||0);
      a.batches+=(Array.isArray(r?.result?.producedBatches)?r.result.producedBatches.length:0);
      return a;
    },{extracted:0,blocked:0,batches:0});
    emit('OMEGA_RESOURCE_EXTRACTION_TURN_COMPLETED','GLOBAL',{turn:t,countries:countries().length,...totals},'resource-endowment');
    return{status:'COMPLETED',turn:t,countries:countries().length,results,totals};
  }
  function onReady(){void initialize();}
  function onTurn(){void initialize().then(()=>extractAll()).catch(error=>{g.OmegaResourceEndowmentRuntimeError=String(error?.message||error);});}
  function diagnostics(){
    const r=g.__OmegaResourceReserveRegistry, e=engine(), mines=[];
    for(const c of countries()){
      const m=state()?.resource?.[c]?.mines;if(Array.isArray(m))mines.push(...m);
    }
    return{version:VERSION,engineReady:!!e?.isReady,dataAuthority:clone(e?.resourceDataDiagnostics||null),identityRegistryReady:!!g.__OmegaResourceIdentityRegistry,reserveRegistryReady:!!r,countryCount:countries().length,mineCount:mines.length,compiledReserveStates:r?.reserveStates?.size||0,sourceCapacityCount:r?.capacities?.size||0};
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
  const API=Object.freeze({VERSION,diagnostics,initialize,extractAll,extractCountry,hydrateCountry,countryResourceState,countryMines,compile});
  g.Omega=g.Omega||{};g.Omega.ResourceEndowmentRuntime=API;g.OmegaResourceEndowmentRuntime=API;
  try{init();}catch(e){g.OmegaResourceEndowmentRuntimeError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);