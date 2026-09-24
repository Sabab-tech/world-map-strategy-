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
    const out=new Set();
    try{
      const listed=registry()?.list?.('COUNTRY')||registry()?.list?.()||[];
      listed.forEach(function(item){
        const raw=typeof item==='object'?(item||{}):{id:item,iso3:item};
        const cid=canonical(raw.iso3||raw.isoCode||raw.countryId||raw.id||raw.code||raw.key);
        if(cid)out.add(cid);
      });
    }catch(_){}
    Object.keys(state()?.resource||{}).forEach(function(k){const cid=canonical(k);if(cid)out.add(cid);});
    const e=engine();
    (Array.isArray(e?.deposits)?e.deposits:[]).forEach(function(dep){
      const cid=canonical(dep?.countryCode||dep?.iso3||dep?.countryId||dep?.country);
      if(cid)out.add(cid);
    });
    return[...out].filter(Boolean).sort();
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
    const byCountry=new Map();

    Object.values(profiles).forEach(function(p){
      if(!p||typeof p!=='object')return;
      const raw=p.identity||p;
      const cid=canonical(raw.iso3||raw.isoCode||raw.countryId||raw.id||p.iso3||p.countryId);
      if(!cid)return;
      const x=clone(raw);
      x.iso3=x.iso3||cid;
      x.id=x.id||cid;
      byCountry.set(cid,x);
    });

    // Resource simulation must not depend on a browser-only fetch completing.
    // The canonical country registry is the fallback authority for the sovereign roster.
    const reg=registry();
    let roster=[];
    try{
      const exported=reg?.exportData?.();
      if(Array.isArray(exported?.countries))roster=exported.countries;
    }catch(_){}
    if(!roster.length){
      try{
        const listed=reg?.list?.('COUNTRY')||reg?.list?.()||[];
        roster=Array.isArray(listed)?listed:[];
      }catch(_){}
    }
    roster.forEach(function(item){
      const raw=typeof item==='object'?(item||{}):{id:item,iso3:item};
      const cid=canonical(raw.iso3||raw.isoCode||raw.countryId||raw.id||raw.code);
      if(!cid)return;
      if(!byCountry.has(cid)){
        const x=clone(raw);
        x.iso3=x.iso3||cid;
        x.id=x.id||cid;
        if(!x.name)x.name=x.countryName||x.sovereignName||cid;
        byCountry.set(cid,x);
      }
    });

    // Deposit records themselves are an authoritative resource-side fallback for any
    // country not present in the profile dataset.
    (Array.isArray(e.deposits)?e.deposits:[]).forEach(function(dep){
      const cid=canonical(dep?.countryCode||dep?.iso3||dep?.countryId||dep?.country);
      if(!cid)return;
      if(!byCountry.has(cid)){
        byCountry.set(cid,{id:cid,iso3:cid,name:dep?.country||cid});
      }
    });

    const countriesRaw=[...byCountry.values()].map(function(p){
      const x=clone(p);
      if(!x.iso3)x.iso3=x.countryId||x.isoCode||null;
      if(!x.id)x.id=x.iso3;
      return x;
    }).filter(Boolean);

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
      for(const key of Object.keys(production))production[key]=0;
      ctx.stateTransaction.set('resource.lastExtractionTurn',turn());
    }
    const inventory=clone(ctx.stateTransaction.get('resource.inventory')||{});
    const reserves=clone(ctx.stateTransaction.get('resource.reserves')||{});
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.extractionLedger'))?clone(ctx.stateTransaction.get('resource.extractionLedger')):[];
    const rows=occurrenceRows(c);
    const selected=Array.isArray(cmd?.payload?.occurrenceKeys)&&cmd.payload.occurrenceKeys.length
      ?rows.filter(x=>cmd.payload.occurrenceKeys.includes(x.occurrenceKey)):rows;
    const extracted=[];
    const blocked=[];
    const mineOutputs=clone(ctx.stateTransaction.get('resource.mineOutputs')||{});
    const mines=clone(ctx.stateTransaction.get('resource.mines')||[]);
    for(const x of selected){
      const reserve=r.getReserveState(x.occurrenceKey);if(!reserve||reserve.residualQuantity<=0)continue;
      if(!['ACTIVE_EXTRACTION','DEPLETING','RESERVE_DEPLETING'].some(s=>String(reserve.operationalStatus||'').toUpperCase().includes(s)))continue;
      let capacity=null;try{capacity=r.getCapacityForOccurrence(x.occurrenceKey);}catch(_){}
      if(!capacity)continue;
      let windowQuantity=0;try{windowQuantity=n(capacity.computeWindowCapacity(DAY_HOURS)?.windowCapacity)||0;}catch(_){windowQuantity=n(capacity.nominalRate)||0;}
      if(windowQuantity<=0)continue;
      const request=new p5.ExtractionRequest({
        occurrenceKey:x.occurrenceKey,requestedQuantity:windowQuantity,requestedUnit:reserve.unit,
        requestedPeriod:p5.TemporalWindowUnit?.PER_DAY||'PER_DAY',assetReference:capacity.assetReference,
        expectedStateVersion:n(reserve.stateVersion)||1,simulationTick:turn(),timeWindowDurationHours:DAY_HOURS,
        extractionMethod:p5.ExtractionMethodEnum?.UNKNOWN||'UNKNOWN',
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
      const q=n(result.approvedQuantity)||0,resource=x.resourceId;
      production[resource]=(n(production[resource])||0)+q;
      inventory[resource]=(n(inventory[resource])||0)+q;
      reserves[resource]=n(result.reserveAfter.residualQuantity)||0;
      current[x.occurrenceKey]=clone(result.reserveAfter.toJSON?.()||result.reserveAfter);
      mineOutputs[x.occurrenceKey]={
        occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,simulationTurn:turn(),
        producedQuantity:q,residualQuantity:n(result.reserveAfter.residualQuantity)||0,status:result.status
      };
      const mineIndex=mines.findIndex(m=>String(m.occurrenceKey)===String(x.occurrenceKey));
      if(mineIndex>=0){
        mines[mineIndex]={...mines[mineIndex],reserveState:clone(result.reserveAfter.toJSON?.()||result.reserveAfter),
          operationalStatus:result.reserveAfter.operationalStatus,residualQuantity:n(result.reserveAfter.residualQuantity)||0};
      }
      const extractionId='EXT-'+turn()+'-'+c+'-'+String(x.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,'');
      let producedBatch=clone(result.producedBatch?.toJSON?.()||result.producedBatch||null);
      if(producedBatch){
        producedBatch.batchId=producedBatch.batchId||('BATCH_EXT_'+turn()+'_'+c+'_'+String(resource).replace(/[^A-Z0-9:_-]/gi,'')+'_'+String(x.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,''));
        producedBatch.resourceId=resource;
        producedBatch.materialIdentity=resource;
        producedBatch.quantity=q;
        producedBatch.remainingQuantity=q;
        producedBatch.ownerCountryCode=c;
        producedBatch.locationKey=x.occurrenceKey;
        producedBatch.facilityKey=capacity.assetReference||null;
        producedBatch.extractionReference=result.resultId||extractionId;
        producedBatch.sourceBatchIds=Array.isArray(producedBatch.sourceBatchIds)?producedBatch.sourceBatchIds:[];
        producedBatch.timestampTurn=turn();
        producedBatch.provenance=Object.assign({},producedBatch.provenance||{},{
          sourceSubsystem:'OMEGA_RESOURCE_ENDOWMENT_RUNTIME',
          extractionId:extractionId,
          occurrenceKey:x.occurrenceKey,
          resourceId:resource,
          simulationTurn:turn()
        });
      }
      const record={
        extractionId:extractionId,
        countryId:c,simulationTurn:turn(),occurrenceKey:x.occurrenceKey,depositKey:x.depositKey,resourceId:resource,
        requestedQuantity:request.requestedQuantity,approvedQuantity:q,status:result.status,
        reserveBefore:clone(result.reserveBefore?.toJSON?.()||result.reserveBefore),
        reserveAfter:clone(result.reserveAfter?.toJSON?.()||result.reserveAfter),
        calculationTrace:clone(result.calculationTrace?.toJSON?.()||result.calculationTrace),
        transition:clone(result.transition?.toJSON?.()||result.transition),
        producedBatch:producedBatch,
        provenance:clone(result.provenance||request.provenance)
      };
      ledger.push(record);extracted.push(record);
      emit('OMEGA_RESOURCE_EXTRACTION_COMPLETED',c,record,cmd.commandId);
    }
    ctx.stateTransaction.set('resource.mineStates',current);
    ctx.stateTransaction.set('resource.mineOutputs',mineOutputs);
    ctx.stateTransaction.set('resource.mines',mines);
    ctx.stateTransaction.set('resource.production',production);
    ctx.stateTransaction.set('resource.inventory',inventory);
    ctx.stateTransaction.set('resource.reserves',reserves);
    const tradeAvailability={};
    for(const [k,v] of Object.entries(inventory))tradeAvailability[k]=n(v)||0;
    ctx.stateTransaction.set('resource.tradeAvailability',tradeAvailability);
    ctx.stateTransaction.set('resource.extractionLedger',ledger.slice(-MAX_LEDGER));
    for(const x of blocked)emit('OMEGA_RESOURCE_EXTRACTION_BLOCKED',c,{...x,simulationTurn:turn()},cmd.commandId);
    return{accepted:true,countryId:c,extracted:extracted.length,blocked:blocked.length,records:extracted};
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
    if(g.__omegaResourceEndowmentInitializing)return;
    g.__omegaResourceEndowmentInitializing=true;
    try{
      for(let i=0;i<40&&!engine()?.isReady;i++)await new Promise(r=>setTimeout(r,0));
      const compiled=compile();if(compiled.status!=='READY')return compiled;
      applyPersistedReserveStates();install();
      for(const c of countries())dispatch('OMEGA_RESOURCE_ENDOWMENT_HYDRATE',c,{correlationId:'RESOURCE-HYDRATE-'+turn()+'-'+c});
      g.__omegaResourceEndowmentReady=true;
      return{status:'READY',countries:countries().length,reused:false};
    }finally{g.__omegaResourceEndowmentInitializing=false;}
  }
  function extractAll(){
    if(!g.__OmegaResourceReserveRegistry)return;
    const t=turn();
    if(g.__omegaResourceExtractionTurn===t)return;
    g.__omegaResourceExtractionTurn=t;
    install();
    for(const c of countries())dispatch('OMEGA_RESOURCE_EXTRACT_TICK',c,{correlationId:'RESOURCE-EXTRACT-'+t+'-'+c});
  }
  function onReady(){void initialize();}
  async function onTurn(){
    try{
      const ready=await initialize();
      if((ready&&ready.status==='READY')||g.__omegaResourceEndowmentReady)extractAll();
    }catch(e){
      try{emit?.('OMEGA_RESOURCE_ENDOWMENT_RUNTIME_HEALTH',null,{status:'DEGRADED',reason:String(e?.message||e)});}catch(_){}
    }
  }
  function diagnostics(){
    const r=g.__OmegaResourceReserveRegistry, e=engine(), mines=[];
    for(const c of countries()){
      const m=state()?.resource?.[c]?.mines;if(Array.isArray(m))mines.push(...m);
    }
    return{version:VERSION,engineReady:!!e?.isReady,identityRegistryReady:!!g.__OmegaResourceIdentityRegistry,reserveRegistryReady:!!r,countryCount:countries().length,mineCount:mines.length,compiledReserveStates:r?.reserveStates?.size||0};
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