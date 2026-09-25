/* ============================================================================
 * OMEGA RESOURCE ACTION EXECUTION RUNTIME v1.0.0
 *
 * Completes the three Resource UI actions without synthetic state:
 *   SURVEY -> evidence-backed survey result
 *   CAPACITY EXPANSION -> project -> factory commission
 *   SPR BUFFER -> physical batch transfer into strategic reserve
 *
 * All mutations go through Ministry Interoperability state transactions.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';
  const MAX_REQUESTS=256;
  const MAX_RESULTS=256;
  const MAX_LEDGER=2048;

  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v)){
      if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;
      o[k]=clone(v[k],seen);
    }
    return o;
  };
  const num=v=>{
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);
    return null;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const tok=v=>String(v??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const state=()=>g.Game?.state||g.gameState||{};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;

  function canonicalCountry(v){
    const raw=String(v??'').trim(),u=raw.toUpperCase();
    if(!raw)return null;
    try{
      const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge;
      const hit=bridge?.resolveCountry?.(raw);
      if(hit?.id)return id(hit.id);
    }catch(_){}
    try{
      const e=g.ResourceMinistryEngine;
      const x=e?.normalizeCountryCode?.(raw);
      if(x)return id(x);
    }catch(_){}
    return u.replace(/\s+/g,'_');
  }

  function rules(){
    const r=g.__OmegaResourceEconomyRules;
    return r&&typeof r==='object' ? r : null;
  }
  function actionRules(){
    const a=rules()?.actions;
    return a&&typeof a==='object'?a:null;
  }

  function dispatch(owner,type,countryId,payload={},correlationId=null){
    const m=interop();
    if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{
      return m.dispatchCommand(owner,type,canonicalCountry(countryId),clone(payload),{
        turn:turn(),
        commandType:type,
        correlationId:correlationId||payload?.correlationId||payload?.requestId||null
      });
    }catch(e){
      return{status:'FAILED',reason:String(e?.message||e)};
    }
  }

  function emit(type,countryId,payload={},commandId=null){
    const m=interop(),c=canonicalCountry(countryId);
    try{
      if(m?.emitEvent)return m.emitEvent(type,c,'resource-action-execution',Object.assign({countryId:c},clone(payload)),{
        turn:turn(),causationId:commandId||null,correlationId:payload?.correlationId||payload?.requestId||null
      });
    }catch(_){}
    try{
      if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function'){
        g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:c,payload:clone(payload),source:'resource-action-execution'}}));
        return true;
      }
    }catch(_){}
    return null;
  }

  function getList(tx,path){
    const x=tx.get(path);
    return Array.isArray(x)?clone(x):[];
  }
  function setList(tx,path,rows){
    tx.set(path,rows.slice(-MAX_REQUESTS));
    return rows;
  }

  function resourceName(resourceId){
    const list=Array.isArray(g.ResourceMinistryEngine?.resourceTypes)?g.ResourceMinistryEngine.resourceTypes:[];
    const wanted=tok(resourceId);
    const row=list.find(x=>tok(x?.id)===wanted);
    return row?.name||String(resourceId).replace(/_/g,' ');
  }

  function countryName(countryId){
    const c=canonicalCountry(countryId);
    try{
      const profile=g.ResourceMinistryEngine?.getCountryResourceProfile?.(c);
      const name=profile?.identity?.name||profile?.identity?.officialName||profile?.name;
      if(name)return name;
    }catch(_){}
    return c;
  }

  function countryIds(){
    const s=state(),out=new Set();
    Object.keys(s?.resource||{}).forEach(c=>{const x=canonicalCountry(c);if(x)out.add(x);});
    Object.keys(s?.economy||{}).forEach(c=>{const x=canonicalCountry(c);if(x)out.add(x);});
    return [...out].sort();
  }

  function findResourceKey(obj,rid){
    if(!obj||typeof obj!=='object')return null;
    if(Object.prototype.hasOwnProperty.call(obj,rid))return rid;
    const wanted=tok(rid);
    return Object.keys(obj).find(k=>tok(k)===wanted)||null;
  }

  function value(obj,rid){
    const k=findResourceKey(obj,rid);
    if(k==null)return null;
    return num(obj[k]);
  }

  function ensureStrategicReserve(raw,c){
    const x=raw&&typeof raw==='object'?clone(raw):{};
    if(!x.warehouseId)x.warehouseId='WH-'+canonicalCountry(c)+'-SPR';
    if(!x.countryId)x.countryId=canonicalCountry(c);
    if(!x.type)x.type='STRATEGIC_RESERVE_STOCKPILE';
    if(!x.locationNodeKey)x.locationNodeKey='WAREHOUSE:'+canonicalCountry(c)+':SPR';
    if(!x.status)x.status='OPERATIONAL';
    if(!x.availableByResource||typeof x.availableByResource!=='object')x.availableByResource={};
    if(!Array.isArray(x.storedBatchIds))x.storedBatchIds=[];
    if(!Array.isArray(x.receipts))x.receipts=[];
    if(!Array.isArray(x.transfers))x.transfers=[];
    return x;
  }

  function strategicAmount(spr,rid){
    return value(spr?.availableByResource,rid)??0;
  }

  function recomputeTradeAvailability(tx,c){
    const inventory=tx.get('resource.inventory')||{};
    const spr=ensureStrategicReserve(tx.get('resource.strategicReserve'),c);
    const out={};
    const keys=new Set([...Object.keys(inventory||{}),...Object.keys(spr.availableByResource||{})]);
    for(const k of keys){
      const total=num(inventory?.[k]);
      const protectedAmount=num(spr.availableByResource?.[k]);
      if(total===null)continue;
      out[k]=Math.max(0,total-(protectedAmount??0));
    }
    tx.set('resource.tradeAvailability',out);
    return out;
  }

  function surveyRecords(countryId,rid){
    const engine=g.ResourceMinistryEngine;
    const deps=Array.isArray(engine?.deposits)?engine.deposits:[];
    const c=canonicalCountry(countryId),wanted=tok(rid);
    return deps.filter(d=>{
      const dc=canonicalCountry(d?.countryCode||d?.countryId||d?.country||'');
      if(dc!==c)return false;
      const tags=[d?.resourceId,d?.resId,d?.resourceTypeId,d?.resourceTypeKey,d?.resource,d?.resId,d?.name]
        .filter(Boolean).map(tok);
      return tags.some(t=>t===wanted||t.includes(wanted));
    }).map(function(x){ return clone(x); });
  }

  function updateSurveyRequest(tx,c,requestId,mutator){
    const rows=getList(tx,'resource.surveyRequests');
    const idx=rows.findIndex(x=>String(x?.requestId)===String(requestId));
    if(idx<0)return null;
    const next=clone(mutator(clone(rows[idx])));
    rows[idx]=next;
    setList(tx,'resource.surveyRequests',rows);
    return next;
  }

  function surveyTick(ctx){
    const c=canonicalCountry(ctx.countryId);
    const cfg=actionRules()?.survey;
    if(!cfg)return{processed:0,blocked:0,reason:'RESOURCE_ACTION_RULES_UNAVAILABLE'};
    const duration=Math.max(1,Math.floor(num(cfg.durationTurns)??1));
    const maxResults=Math.max(1,Math.floor(num(cfg.maxResultRecords)??64));
    const rows=getList(ctx.stateTransaction,'resource.surveyRequests');
    const results=getList(ctx.stateTransaction,'resource.surveyResults');
    let changed=0,completed=0,blocked=0;
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(canonicalCountry(row?.countryId)!==c)continue;
      const status=String(row?.status||'').toUpperCase();
      if(status==='COMPLETED'||status==='BLOCKED'||status==='CANCELLED')continue;
      const rid=String(row?.resourceId||'').trim();
      if(!rid){rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'RESOURCE_ID_REQUIRED'};blocked++;continue;}

      if(status==='REQUESTED'){
        rows[i]={
          ...row,
          status:'IN_PROGRESS',
          progress:0,
          startedTurn:turn(),
          completionTurn:turn()+duration,
          resourceName:resourceName(rid),
          country:countryName(c),
          executionSource:'OMEGA_RESOURCE_ACTION_EXECUTION',
          authority:'RESOURCE_JSON_DEPOSIT_REGISTRY'
        };
        changed++;
        emit('OMEGA_RESOURCE_SURVEY_STARTED',c,rows[i]);
        continue;
      }

      const completionTurn=num(row.completionTurn);
      if(status==='IN_PROGRESS'&&completionTurn!==null&&turn()<completionTurn){
        const start=num(row.startedTurn)??turn();
        const elapsed=Math.max(0,turn()-start);
        rows[i]={...row,progress:Math.min(99,Math.floor((elapsed/duration)*100))};
        changed++;
        continue;
      }

      if(status==='IN_PROGRESS'){
        const records=surveyRecords(c,rid).slice(0,maxResults);
        const resultStatus=records.length?'OBSERVED_DEPOSIT_RECORDS':'NO_AUTHORITATIVE_RECORDS';
        const result={
          surveyResultId:'SURVEY-RESULT-'+turn()+'-'+c+'-'+tok(rid)+'-'+String(i+1),
          requestId:row.requestId,
          countryId:c,
          resourceId:rid,
          resourceName:resourceName(rid),
          country:countryName(c),
          status:resultStatus,
          completedTurn:turn(),
          progress:100,
          recordCount:records.length,
          records:records,
          evidenceSource:'ResourceMinistryEngine.deposits',
          sourceAuthority:'RESOURCE_JSON',
          epistemicPolicy:'OBSERVED_ONLY_NO_SYNTHETIC_DISCOVERY',
          correlationId:row.correlationId||row.requestId
        };
        const existing=results.some(x=>String(x?.requestId)===String(row.requestId));
        if(!existing)results.push(result);
        rows[i]={
          ...row,
          status:'COMPLETED',
          progress:100,
          completedTurn:turn(),
          resultId:result.surveyResultId,
          resultStatus,
          recordCount:records.length
        };
        completed++;changed++;
        emit('OMEGA_RESOURCE_SURVEY_COMPLETED',c,result);
      }
    }
    ctx.stateTransaction.set('resource.surveyRequests',rows.slice(-MAX_REQUESTS));
    ctx.stateTransaction.set('resource.surveyResults',results.slice(-MAX_RESULTS));
    return{processed:changed,completed,blocked};
  }

  function candidateAssets(tx,rid){
    const assets=tx.get('economy.productionAssets');
    if(!Array.isArray(assets))return[];
    const wanted=tok(rid);
    return assets.filter(asset=>{
      const stage=String(asset?.stage||asset?.assetStage||'').toUpperCase();
      if(['CLOSED','INACTIVE','DECOMMISSIONED','DESTROYED'].includes(stage))return false;
      const ids=[asset?.resourceId,asset?.resource,asset?.inputResourceId,asset?.outputResourceId]
        .filter(Boolean).map(tok);
      const inputs=Object.keys(asset?.inputCoefficients||{}).map(tok);
      const outputs=Object.keys(asset?.outputProfile||{}).map(tok);
      return [...ids,...inputs,...outputs].includes(wanted);
    });
  }

  function findProject(tx,projectId){
    const rows=tx.get('projects.registry');
    if(!Array.isArray(rows))return null;
    return rows.find(x=>String(x?.projectId)===String(projectId))||null;
  }

  function expansionTick(ctx){
    const c=canonicalCountry(ctx.countryId);
    const cfg=actionRules()?.facilityExpansion;
    if(!cfg)return{processed:0,started:0,completed:0,blocked:0,reason:'RESOURCE_ACTION_RULES_UNAVAILABLE'};
    const rows=getList(ctx.stateTransaction,'economy.capacityUpgradeRequests');
    let processed=0,started=0,completed=0,blocked=0;

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(canonicalCountry(row?.countryId)!==c)continue;
      const status=String(row?.status||'').toUpperCase();
      if(status==='COMPLETED'||status==='BLOCKED'||status==='CANCELLED')continue;
      const rid=String(row?.resourceId||'').trim();
      if(!rid){rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'RESOURCE_ID_REQUIRED'};blocked++;continue;}

      if(status==='REQUESTED'){
        const candidates=candidateAssets(ctx.stateTransaction,rid);
        const asset=candidates[0];
        if(!asset){
          rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'NO_OBSERVED_MATCHING_FACTORY',resourceName:resourceName(rid),country:countryName(c)};
          blocked++;continue;
        }
        const capacity=num(asset.capacity??asset.productionCapacity??asset.throughput);
        if(capacity===null||capacity<=0){
          rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'FACTORY_CAPACITY_UNAVAILABLE'};
          blocked++;continue;
        }
        const fraction=Math.max(0,num(cfg.capacityIncreaseFraction)??0.25);
        const delta=Math.max(1,Math.ceil(capacity*fraction));
        const explicitUnitCost=num(asset.expansionCostPerCapacityUnit??asset.capacityExpansionCostPerUnit);
        const unitCost=explicitUnitCost!==null?explicitUnitCost:Math.max(0,num(cfg.budgetUnitsPerCapacityUnit)??0);
        const cost=Math.ceil(delta*unitCost);
        const duration=Math.max(1,Math.floor(num(asset.constructionDurationTurns??asset.expansionDurationTurns??cfg.durationTurns)??1));
        const projectId='RES-CAP-PROJ-'+turn()+'-'+c+'-'+tok(rid)+'-'+String(i+1);
        const reservationId='RES-CAP-RES-'+turn()+'-'+c+'-'+tok(rid)+'-'+String(i+1);

        const reserve=dispatch('cabinet','OMEGA_AUTO_RESERVE',c,{
          reservationId,decisionId:row.requestId,scenarioId:'RESOURCE_UI_CAPACITY_EXPANSION',
          action:'PROCESSING_EXPANSION',money:cost,labor:0,materials:{},executor:'economy',
          expiresTurn:turn()+Math.max(1,Math.floor(num(cfg.reservationExpiresAfterTurns)??64))
        },row.requestId);

        if(reserve?.status!=='APPLIED'){
          rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:reserve?.reason||'RESERVATION_FAILED',detail:clone(reserve)};
          blocked++;continue;
        }

        const project=dispatch('projects','OMEGA_AUTO_PROJECT_CREATE',c,{
          projectId,
          action:'PROCESSING_EXPANSION',
          kind:'FACTORY',
          scenarioId:'RESOURCE_UI_CAPACITY_EXPANSION',
          decisionId:row.requestId,
          reservationId,
          quantity:delta,
          cost,
          labor:0,
          materials:{},
          durationTurns:duration,
          facilityType:asset.facilityType||asset.factoryType||asset.type||asset.stage||'FACTORY',
          siteId:asset.siteId||asset.id||asset.assetId||asset.projectId||null,
          location:clone(asset.location||asset.site||null),
          workforce:clone(asset.workforce||null),
          energyProfile:clone(asset.energyProfile||asset.energy||null),
          inputCoefficients:clone(asset.inputCoefficients||null),
          outputProfile:clone(asset.outputProfile||null),
          inventoryPolicy:clone(asset.inventoryPolicy||null),
          utilization:num(asset.utilization),
          wageIndex:num(asset.wageIndex),
          taxProfile:clone(asset.taxProfile||null),
          parentFactoryId:asset.projectId||asset.assetId||asset.id||null,
          linkedMinistries:['economy','resource','finance','projects'],
          dependencies:['resource','finance','projects','transport']
        },row.requestId);

        if(project?.status!=='APPLIED'){
          dispatch('cabinet','OMEGA_AUTO_RELEASE_RESERVATION',c,{reservationId,correlationId:row.requestId},row.requestId);
          rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:project?.reason||'PROJECT_CREATE_FAILED',detail:clone(project)};
          blocked++;continue;
        }

        rows[i]={
          ...row,status:'UNDER_CONSTRUCTION',startedTurn:turn(),progress:0,
          projectId,reservationId,candidateFactoryId:asset.projectId||asset.assetId||asset.id||asset.siteId||null,
          capacityBefore:capacity,capacityDelta:delta,capacityTarget:capacity+delta,
          cost,durationTurns:duration,resourceName:resourceName(rid),country:countryName(c),
          executionSource:'OMEGA_AUTO_PROJECT_CREATE',
          authority:'OMEGA_PROJECT_EXECUTOR'
        };
        started++;processed++;
        emit('OMEGA_RESOURCE_FACTORY_CAPACITY_EXPANSION_STARTED',c,rows[i]);
        continue;
      }

      const projectId=row.projectId;
      const project=findProject(ctx.stateTransaction,projectId);
      if(!project)continue;
      const pstatus=String(project.status||'').toUpperCase();
      const progress=Math.max(0,Math.min(100,Math.round((num(project.progress)||0)*100)));
      rows[i]={...row,progress,projectStatus:pstatus,updatedTurn:turn()};
      if(pstatus==='COMPLETED'){
        rows[i]={...rows[i],status:'COMPLETED',progress:100,completedTurn:turn(),completionSource:'OMEGA_AUTO_FACTORY_COMMISSION'};
        completed++;processed++;
        emit('OMEGA_RESOURCE_FACTORY_CAPACITY_EXPANSION_COMPLETED',c,rows[i]);
      }else if(pstatus==='COMMISSIONING'){
        rows[i].status='COMMISSIONING';
      }else if(['BLOCKED','FAILED','CANCELLED'].includes(pstatus)){
        rows[i].status='BLOCKED';
        rows[i].reason=project.blocker||pstatus;
        blocked++;
      }
    }
    ctx.stateTransaction.set('economy.capacityUpgradeRequests',rows.slice(-MAX_REQUESTS));
    return{processed,started,completed,blocked};
  }

  function removeId(arr,idValue){
    const wanted=String(idValue);
    return Array.isArray(arr)?arr.filter(x=>String(x)!==wanted):[];
  }

  function sprTransferTick(ctx){
    const c=canonicalCountry(ctx.countryId);
    const cfg=actionRules()?.strategicBuffer;
    if(!cfg)return{processed:0,completed:0,blocked:0,reason:'RESOURCE_ACTION_RULES_UNAVAILABLE'};
    const rows=getList(ctx.stateTransaction,'resource.reserveBufferRequests');
    const inventory=clone(ctx.stateTransaction.get('resource.inventory')||{});
    const batches=clone(ctx.stateTransaction.get('resource.batches')||[]);
    const rawWh=clone(ctx.stateTransaction.get('resource.warehouse')||null);
    const spr=ensureStrategicReserve(ctx.stateTransaction.get('resource.strategicReserve'),c);
    let processed=0,completed=0,blocked=0;
    const targetDays=Math.max(0,num(cfg.targetDays)??30);
    const maxTransferBatches=Math.max(1,Math.floor(num(cfg.maxTransferBatches)??128));

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(canonicalCountry(row?.countryId)!==c)continue;
      const status=String(row?.status||'').toUpperCase();
      if(['COMPLETED','BLOCKED','CANCELLED'].includes(status))continue;
      const rid=String(row?.resourceId||'').trim();
      if(!rid){rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'RESOURCE_ID_REQUIRED'};blocked++;continue;}
      const inv=value(inventory,rid);
      const demand=value(ctx.stateTransaction.get('resource.consumption')||{},rid);
      if(inv===null||demand===null||demand<=0){
        rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:demand===null?'RESOURCE_DEMAND_UNAVAILABLE':'RESOURCE_INVENTORY_UNAVAILABLE'};
        blocked++;continue;
      }
      const currentSpr=strategicAmount(spr,rid);
      const target=Math.max(0,demand*targetDays);
      const needed=Math.max(0,target-currentSpr);

      if(needed<=0){
        rows[i]={...row,status:'COMPLETED',progress:100,completedTurn:turn(),requestedQuantity:0,transferredQuantity:0,targetQuantity:target,currentQuantity:currentSpr,sourceAuthority:'OBSERVED_RUNTIME_STOCKPILE'};
        completed++;processed++;
        emit('OMEGA_RESOURCE_SPR_BUFFER_ALREADY_SATISFIED',c,rows[i]);
        continue;
      }

      if(!rawWh||!rawWh.warehouseId){
        rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'RAW_WAREHOUSE_STATE_UNAVAILABLE'};blocked++;continue;
      }

      const rawAvailable=value(rawWh.availableByResource||{},rid);
      if(rawAvailable===null||rawAvailable<=0){
        rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'RAW_WAREHOUSE_MATERIAL_UNAVAILABLE',available:rawAvailable};blocked++;continue;
      }

      let remaining=Math.min(needed,rawAvailable),moved=0,usedBatches=0;
      const transferId='SPR-'+turn()+'-'+c+'-'+tok(rid)+'-'+String(i+1);
      const sourceBatchIds=[];
      const newBatchIds=[];
      const maxBatches=Array.isArray(batches)?Math.min(batches.length,maxTransferBatches):0;

      for(let bIndex=0;bIndex<batches.length&&remaining>1e-9&&usedBatches<maxBatches;bIndex++){
        const b=batches[bIndex];
        if(!b||String(b.warehouseId||'')!==String(rawWh.warehouseId))continue;
        if(tok(b.resourceId||b.materialIdentity)!==tok(rid))continue;
        const stage=String(b.stage||'').toUpperCase();
        if(!['RAW','RAW_EXTRACTED'].includes(stage))continue;
        const available=num(b.remainingQuantity??b.quantity);
        if(available===null||available<=0)continue;
        const take=Math.min(available,remaining);
        if(take<=0)continue;

        if(take>=available-1e-9){
          b.warehouseId=spr.warehouseId;
          b.locationNodeKey=spr.locationNodeKey;
          b.stage='STRATEGIC_STOCKPILE';
          b.lifecycleStatus='RESERVED';
          sourceBatchIds.push(String(b.batchId));
          spr.storedBatchIds=spr.storedBatchIds.includes(String(b.batchId))?spr.storedBatchIds:spr.storedBatchIds.concat([String(b.batchId)]);
          rawWh.storedBatchIds=removeId(rawWh.storedBatchIds,b.batchId);
          newBatchIds.push(String(b.batchId));
        }else{
          b.remainingQuantity=available-take;
          const child={
            ...clone(b),
            batchId:'SPR-BATCH-'+turn()+'-'+c+'-'+tok(rid)+'-'+String(newBatchIds.length+1),
            quantity:take,
            remainingQuantity:take,
            stage:'STRATEGIC_STOCKPILE',
            lifecycleStatus:'RESERVED',
            warehouseId:spr.warehouseId,
            locationNodeKey:spr.locationNodeKey,
            sourceBatchIds:Array.from(new Set([...(Array.isArray(b.sourceBatchIds)?b.sourceBatchIds:[]),String(b.batchId)])),
            extractionReference:b.extractionReference||null,
            transformReference:null,
            provenance:{
              ...(b.provenance&&typeof b.provenance==='object'?clone(b.provenance):{}),
              sourceSubsystem:'OMEGA_RESOURCE_ACTION_EXECUTION',
              transferType:'RAW_TO_SPR',
              transferId,
              sourceBatchId:String(b.batchId),
              simulationTurn:turn()
            }
          };
          batches.push(child);
          sourceBatchIds.push(String(b.batchId));
          newBatchIds.push(child.batchId);
          spr.storedBatchIds.push(child.batchId);
        }

        remaining-=take;
        moved+=take;
        usedBatches++;
      }

      if(moved<=0){
        rows[i]={...row,status:'BLOCKED',blockedTurn:turn(),reason:'NO_TRANSFERABLE_RAW_BATCHES',requestedQuantity:needed,currentQuantity:currentSpr,targetQuantity:target};
        blocked++;continue;
      }

      const rawKey=findResourceKey(rawWh.availableByResource,rid)||rid;
      rawWh.availableByResource[rawKey]=Math.max(0,(num(rawWh.availableByResource[rawKey])||0)-moved);
      const sprKey=findResourceKey(spr.availableByResource,rid)||rid;
      spr.availableByResource[sprKey]=(num(spr.availableByResource[sprKey])||0)+moved;

      const receipt={
        transferId,
        requestId:row.requestId,
        countryId:c,
        resourceId:rid,
        quantity:moved,
        fromWarehouseId:rawWh.warehouseId,
        toWarehouseId:spr.warehouseId,
        sourceBatchIds:[...new Set(sourceBatchIds)],
        resultingBatchIds:[...new Set(newBatchIds)],
        simulationTurn:turn(),
        status:'COMPLETED',
        sourceAuthority:'OBSERVED_RUNTIME_BATCHES'
      };
      spr.receipts.push(receipt);
      spr.transfers.push(receipt);
      while(spr.receipts.length>MAX_LEDGER)spr.receipts.shift();
      while(spr.transfers.length>MAX_LEDGER)spr.transfers.shift();
      spr.lastTransferTurn=turn();
      spr.lastMovementType='RAW_TO_SPR';

      const ledger=getList(ctx.stateTransaction,'resource.inventoryLedger');
      ledger.push({
        type:'STRATEGIC_RESERVE_TRANSFER',
        transferId,
        requestId:row.requestId,
        resourceId:rid,
        quantity:moved,
        fromWarehouseId:rawWh.warehouseId,
        toWarehouseId:spr.warehouseId,
        sourceBatchIds:[...new Set(sourceBatchIds)],
        resultingBatchIds:[...new Set(newBatchIds)],
        turn:turn(),
        aggregateInventoryUnchanged:true
      });
      while(ledger.length>MAX_LEDGER)ledger.shift();

      ctx.stateTransaction.set('resource.batches',batches);
      ctx.stateTransaction.set('resource.warehouse',rawWh);
      ctx.stateTransaction.set('resource.strategicReserve',spr);
      ctx.stateTransaction.set('resource.inventory',inventory);
      ctx.stateTransaction.set('resource.inventoryLedger',ledger);

      recomputeTradeAvailability(ctx.stateTransaction,c);
      const nextSpr=strategicAmount(spr,rid);
      const stillNeeded=Math.max(0,target-nextSpr);
      rows[i]={
        ...row,
        status:stillNeeded>1e-9?'IN_PROGRESS':'COMPLETED',
        progress:target>0?Math.min(100,Math.round((nextSpr/target)*100)):100,
        requestedQuantity:needed,
        transferredQuantity:(num(row.transferredQuantity)||0)+moved,
        currentQuantity:nextSpr,
        targetQuantity:target,
        sourceBatchIds:[...new Set([...(row.sourceBatchIds||[]),...sourceBatchIds])],
        resultingBatchIds:[...new Set([...(row.resultingBatchIds||[]),...newBatchIds])],
        lastTransferTurn:turn(),
        transferId
      };
      processed++;
      emit('OMEGA_RESOURCE_SPR_TRANSFER_COMPLETED',c,receipt);
      if(stillNeeded<=1e-9){rows[i].completedTurn=turn();completed++;}
    }

    ctx.stateTransaction.set('resource.reserveBufferRequests',rows.slice(-MAX_REQUESTS));
    return{processed,completed,blocked};
  }

  function actionTickHandler(cmd,ctx){
    const s1=surveyTick(ctx);
    const s2=expansionTick(ctx);
    const s3=sprTransferTick(ctx);
    recomputeTradeAvailability(ctx.stateTransaction,ctx.countryId);
    return{
      accepted:true,
      countryId:canonicalCountry(ctx.countryId),
      turn:turn(),
      survey:s1,
      expansion:s2,
      strategicBuffer:s3
    };
  }

  function register(){
    const m=interop();
    if(!m?.registerCommandHandler)return false;
    try{
      m.registerAction?.('OMEGA_RESOURCE_ACTION_TICK',{
        actionId:'OMEGA_RESOURCE_ACTION_TICK',
        stateOwnerMinistry:'resource',
        authority:'OMEGA_RESOURCE_ACTION_EXECUTION_RUNTIME'
      });
      m.registerCommandHandler('OMEGA_RESOURCE_ACTION_TICK','resource',actionTickHandler);
      g.__omegaResourceActionExecutionHandlers=true;
      return true;
    }catch(_){return false;}
  }

  function processCountry(c){
    register();
    return dispatch('resource','OMEGA_RESOURCE_ACTION_TICK',c,{
      countryId:canonicalCountry(c),
      correlationId:'RESOURCE-ACTION-TICK-'+turn()+'-'+canonicalCountry(c)
    });
  }

  function processAll(){
    const cs=countryIds();
    const results=[];
    for(const c of cs)results.push({countryId:c,result:processCountry(c)});
    return{status:'COMPLETED',turn:turn(),countryCount:cs.length,results};
  }

  function diagnostics(){
    const s=state(),cs=countryIds();
    let surveys=0,expansions=0,spr=0,completedSurveys=0;
    for(const c of cs){
      const r=s.resource?.[c]||{},e=s.economy?.[c]||{};
      surveys+=Array.isArray(r.surveyRequests)?r.surveyRequests.filter(x=>['REQUESTED','IN_PROGRESS','PENDING','ACTIVE'].includes(String(x?.status||'').toUpperCase())).length:0;
      completedSurveys+=Array.isArray(r.surveyResults)?r.surveyResults.length:0;
      expansions+=Array.isArray(e.capacityUpgradeRequests)?e.capacityUpgradeRequests.filter(x=>['REQUESTED','UNDER_CONSTRUCTION','COMMISSIONING'].includes(String(x?.status||'').toUpperCase())).length:0;
      spr+=Array.isArray(r.reserveBufferRequests)?r.reserveBufferRequests.filter(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase())).length:0;
    }
    return{
      version:VERSION,
      handlersReady:!!g.__omegaResourceActionExecutionHandlers,
      rulesReady:!!actionRules(),
      countryCount:cs.length,
      surveyRequestsPending:surveys,
      surveyResults:completedSurveys,
      capacityRequestsPending:expansions,
      strategicReserveRequestsPending:spr
    };
  }

  function onEvent(e){
    const c=e?.detail?.countryId||e?.countryId;
    if(c)processCountry(c);
  }
  function onTurn(){processAll();}

  g.Omega=g.Omega||{};
  const API=Object.freeze({VERSION,register,processCountry,processAll,diagnostics});
  g.Omega.ResourceActionExecutionRuntime=API;
  g.OmegaResourceActionExecutionRuntime=API;

  if(typeof g.addEventListener==='function'){
    [
      'OMEGA_RESOURCE_SURVEY_REQUESTED',
      'OMEGA_RESOURCE_FACTORY_CAPACITY_EXPANSION_REQUESTED',
      'OMEGA_RESOURCE_RESERVE_BUFFER_REQUESTED'
    ].forEach(x=>g.addEventListener(x,onEvent));
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
  }

  register();
})(typeof window!=='undefined'?window:globalThis);
