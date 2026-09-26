/* OMEGA RESOURCE ECONOMY RUNTIME v2.1
   Deposit -> Extraction -> Batch -> Inventory -> Processing -> Factory
   -> Market/Internal Contract -> Trade Settlement -> Company/Worker/Supplier/Transport
   -> Fiscal Receipt -> Treasury -> Interoperability
*/
(function(g){
  'use strict';

  var VERSION='2.2.0';
  var DEFAULT_RULES={
    schemaVersion:'1.0.0',
    inventory:{legacyOpeningBalancePolicy:'PRESERVE_AND_MARK',batchConsumptionPolicy:'FIFO',sellableSurplusPolicy:'OBSERVED_INVENTORY_ONLY'},
    fiscal:{royaltyRate:0.02,resourceTaxRate:0.01,corporateTaxRate:0.20,exportDutyRate:0,otherReceiptRate:0},
    operatingAllocation:{workerIncomeRate:0.12,transportRevenueRate:0.05},
    runtime:{maxLedgerEntries:2048,maxBatches:8192},
    market:{offerFractionOfObservedInventory:0.25,minOfferQuantity:1},
    actions:{
       survey:{durationTurns:2,maxResultRecords:64},
       facilityExpansion:{capacityIncreaseFraction:0.25,durationTurns:4,budgetUnitsPerCapacityUnit:10,reservationExpiresAfterTurns:64},
       strategicBuffer:{targetDays:30,maxTransferBatches:128}
     },
     extraction:{
       syntheticSitePolicy:'SIMULATED_ONLY_WITH_EXPLICIT_RULESET',
       missingCapacityPolicy:'USE_SIMULATION_BASELINE_AND_TAG_SIMULATED',
       defaultEffortUtilization:0.82,
       constraintFactors:{availability:0.98,maintenance:0.96,labor:0.95,power:0.98,water:0.98,logistics:0.95,security:0.99},
       recoveryFactors:{rare_earth:0.75,lithium:0.65,cobalt:0.80,nickel:0.82,copper:0.88,crude_oil:0.60,natural_gas:0.65,uranium:0.75,gold:0.70,bauxite:0.90,phosphate:0.75,potash:0.85,iron_ore:0.90,coal:0.88},
       baselineDailyRates:{rare_earth:100,lithium:500,cobalt:150,nickel:800,copper:1000,crude_oil:10000,natural_gas:0.01,uranium:50,gold:500,bauxite:4000,phosphate:4000,potash:3000,iron_ore:8000,coal:5000},
       baselineRateUnits:{rare_earth:'TONNES_PER_DAY',lithium:'TONNES_PER_DAY',cobalt:'TONNES_PER_DAY',nickel:'TONNES_PER_DAY',copper:'TONNES_PER_DAY',crude_oil:'BARRELS_PER_DAY',natural_gas:'BCM_PER_YEAR',uranium:'TONNES_PER_DAY',gold:'TROY_OZ_PER_DAY',bauxite:'TONNES_PER_DAY',phosphate:'TONNES_PER_DAY',potash:'TONNES_PER_DAY',iron_ore:'TONNES_PER_DAY',coal:'TONNES_PER_DAY'}
     },
     industrialPhysics:{missingProcessModelPolicy:'KEEP_GENERIC_RECIPE_BUT_MARK_UNOBSERVED',defaults:{yieldFactor:1,energyPerUnit:null,waterPerUnit:null,maintenanceFactor:0.96}},
     logistics:{sameCountryTransferMode:'DOMESTIC_UNOBSERVED_OR_ROUTE_BACKED',crossBorderTransferMode:'TRADE_SETTLEMENT_ONLY',missingRoutePolicy:'RECORD_UNOBSERVED_LOGISTICS_DO_NOT_INVENT_ROUTE'}
  };

  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||[];
    for(var i=0;i<seen.length;i++)if(seen[i][0]===v)return seen[i][1];
    var out=Array.isArray(v)?[]:{};
    seen.push([v,out]);
    Object.keys(v).forEach(function(k){
      if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)return;
      out[k]=clone(v[k],seen);
    });
    return out;
  }
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}
  function id(v){return String(v==null?'':v).trim().toUpperCase();}
  function tok(v){return String(v==null?'':v).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function state(){return g.Game&&g.Game.state?g.Game.state:(g.gameState||{});}
  function turn(){
    var s=state(),x=s&&s.simulation?num(s.simulation.turn):null;
    if(x!==null)return x;
    x=num(s&&s.turn);if(x!==null)return x;
    x=num(s&&s.simulationTurn);if(x!==null)return x;
    return 0;
  }
  function registry(){return g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||(g.Omega&&g.Omega.CanonicalIdentity)||null;}
  function canonical(v){
    try{
      var r=registry();
      if(r&&typeof r.resolveCountry==='function'){
        var x=r.resolveCountry(v);
        if(x&&x.id)return id(x.id);
        if(x&&x.canonicalId)return id(x.canonicalId);
      }
    }catch(_){}
    return id(v);
  }
  function countries(){
    var r=registry(),out=[];
    try{
      if(r&&typeof r.list==='function'){
        var a=r.list('COUNTRY');
        if(!Array.isArray(a)||!a.length)a=r.list();
        if(Array.isArray(a))a.forEach(function(v){
          var x=v&&typeof v==='object'?(v.id||v.canonicalId||v.code||v.countryId||v.key):v;
          x=canonical(x);
          if(x&&out.indexOf(x)<0)out.push(x);
        });
      }
    }catch(_){}
    if(!out.length){
      var rr=state().resource||{};
      Object.keys(rr).forEach(function(k){var x=canonical(k);if(x&&out.indexOf(x)<0)out.push(x);});
    }
    return out.sort();
  }
  function bucket(c,domain){
    var root=state()[domain];if(!root||typeof root!=='object')return null;
    var cid=canonical(c);
    if(root[cid]&&typeof root[cid]==='object')return root[cid];
    var ks=Object.keys(root);
    for(var i=0;i<ks.length;i++)if(canonical(ks[i])===cid)return root[ks[i]];
    return null;
  }
  function read(c,path){
    var p=String(path||'').split('.'),cur=bucket(c,p.shift());
    for(var i=0;i<p.length;i++){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),p[i]))return undefined;
      cur=cur[p[i]];
    }
    return cur;
  }
  function interop(){return(g.Omega&&g.Omega.MinistryInteroperability)||g.OmegaMinistryInteroperability||null;}
  function boundary(){return(g.Omega&&g.Omega.ResourceCountryBoundaryGuard)||g.OmegaResourceCountryBoundaryGuard||null;}
  function dispatch(owner,type,c,payload){
    var m=interop();
    if(!m||typeof m.dispatchCommand!=='function')return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{return m.dispatchCommand(owner,type,canonical(c),payload||{},{turn:turn(),commandType:type,correlationId:(payload&&(payload.correlationId||payload.transactionId||payload.saleId||payload.settlementId))||null});}
    catch(e){return{status:'FAILED',reason:String(e&&e.message||e)};}
  }
  function emit(type,c,payload,source){
    var m=interop(),cid=canonical(c);
    try{
      if(m&&typeof m.emitEvent==='function')return m.emitEvent(type,cid,source||'resource-economy',{countryId:cid,payload:clone(payload||{})},{turn:turn(),correlationId:(payload&&(payload.correlationId||payload.transactionId||payload.saleId||payload.settlementId))||null});
    }catch(_){}
    try{
      if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:cid,payload:clone(payload||{}),simulationTurn:turn()}}));
    }catch(_){}
    return null;
  }
  function rules(){return g.__OmegaResourceEconomyRules||DEFAULT_RULES;}
  function loadRules(){
    if(g.__OmegaResourceEconomyRules)return Promise.resolve(g.__OmegaResourceEconomyRules);
    if(typeof fetch!=='function'){g.__OmegaResourceEconomyRules=clone(DEFAULT_RULES);return Promise.resolve(g.__OmegaResourceEconomyRules);}
    return fetch('./resource_economy_rules.json',{cache:'no-store'}).then(function(r){
      if(!r||!r.ok)throw new Error('RESOURCE_ECONOMY_RULES_NOT_AVAILABLE');
      return r.json();
    }).then(function(d){
      g.__OmegaResourceEconomyRules={
        schemaVersion:d.schemaVersion||DEFAULT_RULES.schemaVersion,
        inventory:Object.assign({},DEFAULT_RULES.inventory,d.inventory||{}),
        fiscal:Object.assign({},DEFAULT_RULES.fiscal,d.fiscal||{}),
        operatingAllocation:Object.assign({},DEFAULT_RULES.operatingAllocation,d.operatingAllocation||{}),
        runtime:Object.assign({},DEFAULT_RULES.runtime,d.runtime||{}),
        market:Object.assign({},DEFAULT_RULES.market,d.market||{}),
        actions:Object.assign({},DEFAULT_RULES.actions,d.actions||{}),
        extraction:Object.assign({},DEFAULT_RULES.extraction,d.extraction||{}),
        industrialPhysics:Object.assign({},DEFAULT_RULES.industrialPhysics,d.industrialPhysics||{}),
        logistics:Object.assign({},DEFAULT_RULES.logistics,d.logistics||{})
      };
      return g.__OmegaResourceEconomyRules;
    }).catch(function(e){
      g.__OmegaResourceEconomyRulesError=String(e&&e.message||e);
      g.__OmegaResourceEconomyRules=clone(DEFAULT_RULES);
      return g.__OmegaResourceEconomyRules;
    });
  }

  function invObj(c){var x=read(c,'resource.inventory');return x&&typeof x==='object'?x:{};}
  function batches(c){var x=read(c,'resource.batches');return Array.isArray(x)?x:[];}
  function mineCompany(c,rid){
    var mines=read(c,'resource.mines');
    if(Array.isArray(mines))for(var i=0;i<mines.length;i++)if(tok(mines[i].resourceId)===tok(rid)&&(mines[i].operatorKey||mines[i].ownerKey))return String(mines[i].operatorKey||mines[i].ownerKey);
    return 'STATE_RESOURCE_POOL_'+canonical(c);
  }
  function assetCompany(c,a){return String((a&&(a.companyId||a.ownerId||a.operatorId||a.company))||('STATE_INDUSTRY_'+canonical(c)));}
  function sovereignCompany(x){return /^STATE_|^GOVERNMENT_/i.test(String(x||''));}

  function inventoryGaps(inv,rows){
    var allocated={},g=[];
    (rows||[]).forEach(function(b){
      var rid=String((b&&(b.resourceId||b.materialIdentity))||'').trim(),q=num(b&&(b.remainingQuantity!=null?b.remainingQuantity:b.quantity));
      if(rid&&q!==null&&q>0)allocated[rid]=(allocated[rid]||0)+q;
    });
    Object.keys(inv||{}).forEach(function(rid){
      var actual=num(inv[rid]);
      if(actual===null||actual<0){g.push({resourceId:rid,type:'INVALID_INVENTORY_VALUE',value:inv[rid]});return;}
      var a=num(allocated[rid])||0;
      if(Math.abs(actual-a)>1e-9)g.push({resourceId:rid,type:actual>a?'UNALLOCATED_INVENTORY':'OVERALLOCATED_BATCH_LEDGER',inventory:actual,batchAllocated:a,delta:actual-a});
    });
    return g;
  }

  function reconcileHandler(cmd,ctx){
    var c=canonical(ctx.countryId),inv=clone(ctx.stateTransaction.get('resource.inventory')||{}),bs=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[],ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[],warehouse=clone(ctx.stateTransaction.get('resource.warehouse')||{warehouseId:'WH-'+c+'-RAW',countryId:c,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+c+':RAW',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]});
    var boundaryCheck=boundary()?.validateResourceCollection?.(bs,c);
    if(boundaryCheck&&!boundaryCheck.ok){
      ctx.stateTransaction.set('resource.inventoryIntegrity',{status:'DEGRADED',checkedTurn:turn(),gaps:[],boundaryViolations:clone(boundaryCheck.violations||[]),authority:'RESOURCE_INVENTORY_AUTHORITY'});
      emit('OMEGA_RESOURCE_COUNTRY_BOUNDARY_VIOLATION',c,{violations:clone(boundaryCheck.violations||[]),turn:turn()});
      return{accepted:false,status:'DEGRADED',countryId:c,reason:'CROSS_COUNTRY_RESOURCE_BREACH',violations:clone(boundaryCheck.violations||[])};
    }
    var warehouseBoundary=boundary()?.validateWarehouse?.(warehouse,c);
    if(warehouseBoundary&&!warehouseBoundary.ok){
      ctx.stateTransaction.set('resource.inventoryIntegrity',{status:'DEGRADED',checkedTurn:turn(),gaps:[],boundaryViolations:[clone(warehouseBoundary)],authority:'RESOURCE_INVENTORY_AUTHORITY'});
      emit('OMEGA_RESOURCE_COUNTRY_BOUNDARY_VIOLATION',c,{violations:[clone(warehouseBoundary)],turn:turn()});
      return{accepted:false,status:'DEGRADED',countryId:c,reason:'CROSS_COUNTRY_WAREHOUSE_BREACH',violations:[clone(warehouseBoundary)]};
    }
    var before=inventoryGaps(inv,bs),allocated={};
    bs.forEach(function(b){var rid=String((b&&(b.resourceId||b.materialIdentity))||'').trim(),q=num(b&&(b.remainingQuantity!=null?b.remainingQuantity:b.quantity));if(rid&&q!==null&&q>0)allocated[rid]=(allocated[rid]||0)+q;});
    Object.keys(inv).forEach(function(rid){
      var q=num(inv[rid]);if(q===null||q<0)return;
      var diff=q-(num(allocated[rid])||0);
      if(diff>0){
        var legacyBatchId='LEGACY_OPENING_'+c+'_'+String(rid).trim().toUpperCase();
        if(!bs.some(function(x){return String(x&&x.batchId)===legacyBatchId;})){
          bs.push({batchId:legacyBatchId,resourceId:rid,materialIdentity:rid,quantity:diff,remainingQuantity:diff,unit:null,stage:'RAW',ownerCountryCode:c,ownerCompanyId:'UNKNOWN_SOURCE',sourceBatchIds:[],purity:null,grade:null,quality:null,qualityState:{purity:null,purityStatus:'UNOBSERVED',source:'PRE_EXISTING_RESOURCE_INVENTORY'},warehouseId:'WH-'+c+'-RAW',locationNodeKey:'WAREHOUSE:'+c+':RAW',provenance:{source:'PRE_EXISTING_RESOURCE_INVENTORY',status:'UNALLOCATED_LEGACY_BALANCE',simulationTurn:turn()}});
        }
        warehouse.availableByResource[rid]=(num(warehouse.availableByResource[rid])||0)+diff;
        if(!Array.isArray(warehouse.storedBatchIds))warehouse.storedBatchIds=[];
        if(!warehouse.storedBatchIds.includes(legacyBatchId))warehouse.storedBatchIds.push(legacyBatchId);
        ledger.push({type:'INVENTORY_RECONCILIATION',resourceId:rid,quantity:diff,policy:'PRESERVE_AND_MARK',status:'LEGACY_UNALLOCATED_BALANCE',batchId:legacyBatchId,turn:turn()});
      }else if(diff<0){
        ledger.push({type:'INVENTORY_RECONCILIATION',resourceId:rid,quantity:-diff,policy:'OBSERVE_MISMATCH',status:'BATCH_LEDGER_EXCEEDS_INVENTORY',turn:turn()});
      }
    });
    while(bs.length>(num(rules().runtime.maxBatches)||8192))bs.shift();
    while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    var after=inventoryGaps(inv,bs);
    warehouse.availableByResource={};warehouse.storedBatchIds=[];
    bs.forEach(function(b){
      var q=num(b&&b.remainingQuantity!=null?b.remainingQuantity:b&&b.quantity)||0;
      if(q<=0)return;
      var rid=String(b&&(b.resourceId||b.materialIdentity)||'').trim();if(!rid)return;
      warehouse.availableByResource[rid]=(num(warehouse.availableByResource[rid])||0)+q;
      if(b.batchId)warehouse.storedBatchIds.push(String(b.batchId));
    });
    warehouse.storedBatchIds=[...new Set(warehouse.storedBatchIds)];warehouse.lastReconciledTurn=turn();
    ctx.stateTransaction.set('resource.batches',bs);
    ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    ctx.stateTransaction.set('resource.warehouse',warehouse);
    ctx.stateTransaction.set('resource.inventoryIntegrity',{status:after.length?'DEGRADED':'HEALTHY',checkedTurn:turn(),gaps:after.slice(-64),previousGaps:before.slice(-64),authority:'RESOURCE_INVENTORY_AUTHORITY'});
    return{accepted:true,countryId:c,status:after.length?'DEGRADED':'HEALTHY',gaps:after.slice(-64)};
  }

  function registerBatchHandler(cmd,ctx){
    var c=canonical(ctx.countryId),p=cmd&&cmd.payload||{},row=clone(p.batch||p.producedBatch||p),rid=String(row.resourceId||row.materialIdentity||p.resourceId||'').trim(),q=num(row.quantity!=null?row.quantity:(row.approvedQuantity!=null?row.approvedQuantity:p.quantity));
    if(!rid||q===null||q<=0)return{accepted:false,reason:'BATCH_INPUT_INVALID'};
    var boundaryCheck=boundary()?.validateLocalBatch?.(row,c);
    if(boundaryCheck&&!boundaryCheck.ok)return{accepted:false,reason:boundaryCheck.reason||'CROSS_COUNTRY_RESOURCE_BREACH',countryId:c,detail:clone(boundaryCheck)};
    var bs=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    var stage=String(row.stage||'RAW').toUpperCase();
    var localWarehouseId=stage==='PROCESSED'||stage==='INTERMEDIATE'||stage==='FINISHED'?'WH-'+c+'-PROCESSED':'WH-'+c+'-RAW';
    var localLocation='WAREHOUSE:'+c+':'+(localWarehouseId.endsWith('-PROCESSED')?'PROCESSED':'RAW');
    var b={batchId:String(row.batchId||p.batchId||('BATCH_'+turn()+'_'+c+'_'+tok(rid)+'_'+(bs.length+1))),resourceId:rid,materialIdentity:String(row.materialIdentity||rid),quantity:q,remainingQuantity:q,unit:row.unit||null,stage:stage,countryId:c,sourceCountryId:c,originCountryId:c,ownerCountryCode:c,custodianKey:c,destinationCountryId:c,ownerCompanyId:String(row.ownerCompanyId||p.ownerCompanyId||mineCompany(c,rid)),sourceBatchIds:Array.isArray(row.sourceBatchIds)?row.sourceBatchIds.slice():[],purity:num(row.purity),grade:num(row.grade!=null?row.grade:row.gradePercent),quality:num(row.quality),qualityState:clone(row.qualityState||{purity:num(row.purity),purityStatus:num(row.purity)!==null?'OBSERVED':'UNOBSERVED',gradePercent:num(row.grade!=null?row.grade:row.gradePercent)}),warehouseId:localWarehouseId,locationNodeKey:localLocation,extractionReference:row.extractionReference||p.extractionId||null,processId:row.processId||null,timestampTurn:turn(),transferType:'LOCAL_RUNTIME',provenance:clone(row.provenance||p.provenance||{})};
    var localCheck=boundary()?.validateLocalBatch?.(b,c);
    if(localCheck&&!localCheck.ok)return{accepted:false,reason:localCheck.reason||'CROSS_COUNTRY_RESOURCE_BREACH',countryId:c,detail:clone(localCheck)};
    if(bs.some(function(x){return String(x&&x.batchId)===b.batchId;}))return{accepted:true,duplicate:true,batchId:b.batchId};
    bs.push(b);while(bs.length>(num(rules().runtime.maxBatches)||8192))bs.shift();
    var ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'BATCH_CREATED',batchId:b.batchId,resourceId:rid,quantity:q,stage:b.stage,turn:turn(),source:b.extractionReference?'EXTRACTION':'RUNTIME'});
    while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    var whReg=clone(ctx.stateTransaction.get('resource.warehouse')||{warehouseId:'WH-'+canonical(ctx.countryId)+'-RAW',countryId:canonical(ctx.countryId),type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+canonical(ctx.countryId)+':RAW',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]});
    if(b.stage==='RAW'||b.stage==='RAW_EXTRACTED'){whReg.availableByResource[rid]=(num(whReg.availableByResource[rid])||0)+q;whReg.storedBatchIds=Array.isArray(whReg.storedBatchIds)?whReg.storedBatchIds:[];if(!whReg.storedBatchIds.includes(b.batchId))whReg.storedBatchIds.push(b.batchId);}
    whReg.receipts=Array.isArray(whReg.receipts)?whReg.receipts:[];whReg.receipts.push({receiptId:'WH-REC-'+b.batchId,warehouseId:b.warehouseId,countryId:canonical(ctx.countryId),batchId:b.batchId,resourceId:rid,quantity:q,purity:b.purity,gradePercent:b.grade,simulationTurn:turn(),status:'RECEIVED'});while(whReg.receipts.length>(num(rules().runtime.maxLedgerEntries)||2048))whReg.receipts.shift();whReg.lastReceiptTurn=turn();
    ctx.stateTransaction.set('resource.batches',bs);ctx.stateTransaction.set('resource.inventoryLedger',ledger);ctx.stateTransaction.set('resource.warehouse',whReg);
    emit('OMEGA_RESOURCE_BATCH_CREATED',ctx.countryId,{batch:b},'resource');
    return{accepted:true,batch:b};
  }

  function consumeHandler(cmd,ctx){
    var c=canonical(ctx.countryId),p=cmd&&cmd.payload||{},rid=String(p.resourceId||'').trim(),q=num(p.quantity);
    if(!rid||q===null||q<=0)return{accepted:false,reason:'CONSUME_INPUT_INVALID'};
    var inv=clone(ctx.stateTransaction.get('resource.inventory')||{}),key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(function(k){return tok(k)===tok(rid);}),cur=key==null?null:num(inv[key]);
    var existingBatches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    var boundaryCheck=boundary()?.validateResourceCollection?.(existingBatches,c);
    if(boundaryCheck&&!boundaryCheck.ok)return{accepted:false,reason:'CROSS_COUNTRY_RESOURCE_BREACH',countryId:c,violations:clone(boundaryCheck.violations||[])};
    var warehouseCheck=boundary()?.validateWarehouse?.(ctx.stateTransaction.get('resource.warehouse'),c);
    if(warehouseCheck&&!warehouseCheck.ok)return{accepted:false,reason:'CROSS_COUNTRY_WAREHOUSE_BREACH',countryId:c,detail:clone(warehouseCheck)};
    if(cur===null||cur<q)return{accepted:false,reason:'RESOURCE_INVENTORY_INSUFFICIENT',resourceId:rid,requested:q,available:cur===null?0:cur};
    inv[key]=cur-q;
    var bs=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[],rem=q,used=[],warehouse=clone(ctx.stateTransaction.get('resource.warehouse')||null),inventoryLots=clone(ctx.stateTransaction.get('resource.inventoryLots')||{});
    for(var i=0;i<bs.length&&rem>1e-9;i++){
      var b=bs[i];if(tok(b&&(b.resourceId||b.materialIdentity))!==tok(rid))continue;
      var avail=num(b&&(b.remainingQuantity!=null?b.remainingQuantity:b.quantity))||0;if(avail<=0)continue;
      var take=Math.min(avail,rem);b.remainingQuantity=avail-take;rem-=take;
      if(b.batchId&&inventoryLots[b.batchId]){
        var lot=clone(inventoryLots[b.batchId]);
        lot.remainingQuantity=Math.max(0,num(b.remainingQuantity)??0);
        lot.status=lot.remainingQuantity>0?'PARTIALLY_CONSUMED':'CONSUMED';
        lot.lastMovementTurn=turn();
        lot.lastMovementType='CONSUME';
        inventoryLots[b.batchId]=lot;
      }
      used.push({batchId:b.batchId,quantity:take,stage:b.stage,ownerCompanyId:b.ownerCompanyId,purity:num(b.purity),grade:num(b.grade!=null?b.grade:b.gradePercent),quality:num(b.quality),qualityState:clone(b.qualityState||null)});
    }
    if(rem>1e-9)used.push({batchId:null,quantity:rem,stage:'LEGACY_UNALLOCATED',ownerCompanyId:'UNKNOWN_SOURCE'});
    var ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'INVENTORY_CONSUMED',resourceId:rid,quantity:q,reason:p.reason||'PROCESSING_OR_FACTORY_INPUT',turn:turn(),consumed:used});
    while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    if(warehouse&&warehouse.availableByResource){warehouse.availableByResource[rid]=Math.max(0,(num(warehouse.availableByResource[rid])||0)-q);warehouse.lastMovementTurn=turn();warehouse.lastMovementType='CONSUME';}
    ctx.stateTransaction.set('resource.inventory',inv);ctx.stateTransaction.set('resource.batches',bs);ctx.stateTransaction.set('resource.inventoryLots',inventoryLots);ctx.stateTransaction.set('resource.inventoryLedger',ledger);if(warehouse)ctx.stateTransaction.set('resource.warehouse',warehouse);
    emit('OMEGA_RESOURCE_INVENTORY_CHANGED',ctx.countryId,{resourceId:rid,delta:-q,newQuantity:inv[key],warehouseQuantity:warehouse&&warehouse.availableByResource?warehouse.availableByResource[rid]:null},'resource');
    return{accepted:true,resourceId:rid,quantity:q,consumed:used};
  }

  function applyProductionHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},inputs=Array.isArray(p.inputs)?p.inputs:[],outputs=Array.isArray(p.outputs)?p.outputs:[],
        inv=clone(ctx.stateTransaction.get('resource.inventory')||{}),
        working=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[],
        inventoryLots=clone(ctx.stateTransaction.get('resource.inventoryLots')||{}),
        ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[],
        warehouse=clone(ctx.stateTransaction.get('resource.warehouse')||null),
        consumed=[],sourceBatchIds=[],inputQuality={},c=canonical(ctx.countryId);
    if(!inputs.length||!outputs.length)return{accepted:false,reason:'PRODUCTION_TRANSACTION_SHAPE_INVALID'};
    var productionBoundary=boundary()?.validateResourceCollection?.(working,c);
    if(productionBoundary&&!productionBoundary.ok)return{accepted:false,reason:'CROSS_COUNTRY_RESOURCE_BREACH',countryId:c,violations:clone(productionBoundary.violations||[])};
    var productionWarehouseBoundary=boundary()?.validateWarehouse?.(warehouse,c);
    if(productionWarehouseBoundary&&!productionWarehouseBoundary.ok)return{accepted:false,reason:'CROSS_COUNTRY_WAREHOUSE_BREACH',countryId:c,detail:clone(productionWarehouseBoundary)};

    for(var i=0;i<inputs.length;i++){
      var item=inputs[i],rid=String(item&&item.resourceId||'').trim(),q=num(item&&item.quantity);
      var key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(function(k){return tok(k)===tok(rid);});
      var available=key==null?null:num(inv[key]);
      if(!rid||q===null||q<=0)return{accepted:false,reason:'PRODUCTION_INPUT_INVALID'};
      if(available===null||available<q)return{accepted:false,reason:'RESOURCE_INVENTORY_INSUFFICIENT',resourceId:rid,requested:q,available:available===null?0:available};
    }

    for(var j=0;j<inputs.length;j++){
      var row=inputs[j],resId=String(row.resourceId),need=num(row.quantity);
      var resolvedKey=Object.prototype.hasOwnProperty.call(inv,resId)?resId:Object.keys(inv).find(function(k){return tok(k)===tok(resId);});
      inv[resolvedKey]=num(inv[resolvedKey])-need;
      if(warehouse&&warehouse.availableByResource){warehouse.availableByResource[resId]=Math.max(0,(num(warehouse.availableByResource[resId])||0)-need);}
      var remaining=need,used=[];
      for(var b=0;b<working.length&&remaining>1e-9;b++){
        var batch=working[b];
        if(tok(batch&&(batch.resourceId||batch.materialIdentity))!==tok(resId))continue;
        var batchQty=num(batch&&(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity))||0;
        if(batchQty<=0)continue;
        var take=Math.min(batchQty,remaining);
        batch.remainingQuantity=batchQty-take;
        remaining-=take;
        if(batch.batchId&&inventoryLots[batch.batchId]){
          var processLot=clone(inventoryLots[batch.batchId]);
          processLot.remainingQuantity=Math.max(0,num(batch.remainingQuantity)??0);
          processLot.status=processLot.remainingQuantity>0?'PARTIALLY_CONSUMED':'CONSUMED';
          processLot.lastMovementTurn=turn();
          processLot.lastMovementType='PROCESSING';
          inventoryLots[batch.batchId]=processLot;
        }
        used.push({batchId:batch.batchId,quantity:take,stage:batch.stage,ownerCompanyId:batch.ownerCompanyId,purity:num(batch.purity),grade:num(batch.grade!=null?batch.grade:batch.gradePercent),quality:num(batch.quality),qualityState:clone(batch.qualityState||null)});
        if(num(batch.purity)!==null){if(!inputQuality[resId])inputQuality[resId]={quantity:0,purityMass:0};inputQuality[resId].quantity+=take;inputQuality[resId].purityMass+=take*num(batch.purity);}
        if(batch.batchId)sourceBatchIds.push(batch.batchId);
      }
      if(remaining>1e-9)used.push({batchId:null,quantity:remaining,stage:'LEGACY_UNALLOCATED',ownerCompanyId:'UNKNOWN_SOURCE'});
      consumed.push({resourceId:resId,quantity:need,consumed:used});
    }

    var created=[];
    for(var o=0;o<outputs.length;o++){
      var out=outputs[o],outId=String(out&&out.resourceId||'').trim(),outQty=num(out&&out.quantity);
      if(!outId||outQty===null||outQty<=0)return{accepted:false,reason:'PRODUCTION_OUTPUT_INVALID'};
      var outKey=Object.prototype.hasOwnProperty.call(inv,outId)?outId:(Object.keys(inv).find(function(k){return tok(k)===tok(outId);})||outId);
      inv[outKey]=(num(inv[outKey])||0)+outQty;
      var observedInputs=Object.keys(inputQuality).filter(function(k){return inputQuality[k].quantity>0;});
      var derivedPurity=num(out&&out.purity);
      if(derivedPurity===null&&observedInputs.length===1)derivedPurity=inputQuality[observedInputs[0]].purityMass/inputQuality[observedInputs[0]].quantity;
      var derivedGrade=num(out&&out.grade!=null?out.grade:out&&out.gradePercent);
      var outputQualityState=clone(out&&out.qualityState||{purity:derivedPurity,purityStatus:derivedPurity===null?'UNOBSERVED_TRANSFORMATION_QUALITY':'INHERITED_FROM_INPUT',gradePercent:derivedGrade,sourceBatchIds:[...new Set(sourceBatchIds)]});
      var newBatch={
        batchId:String(out&&out.batchId||('BATCH_'+turn()+'_'+canonical(ctx.countryId)+'_'+tok(outId)+'_'+(working.length+created.length+1))),
        resourceId:outId,materialIdentity:outId,quantity:outQty,remainingQuantity:outQty,
        unit:out&&out.unit||null,stage:String(out&&out.stage||'FINISHED').toUpperCase(),
        ownerCountryCode:canonical(ctx.countryId),ownerCompanyId:String(p.companyId||('STATE_INDUSTRY_'+canonical(ctx.countryId))),
        sourceBatchIds:[...new Set(sourceBatchIds)],purity:derivedPurity,grade:derivedGrade,quality:derivedPurity,qualityState:outputQualityState,
        countryId:c,sourceCountryId:c,originCountryId:c,ownerCountryCode:c,custodianKey:c,destinationCountryId:c,
        warehouseId:'WH-'+c+'-PROCESSED',locationNodeKey:'WAREHOUSE:'+c+':PROCESSED',
        transformReference:p.transactionId||null,processId:p.facilityId||null,timestampTurn:turn(),transferType:'LOCAL_PROCESSING',
        provenance:clone(p.provenance||{source:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2',simulationTurn:turn()})
      };
      var outputBoundary=boundary()?.validateLocalBatch?.(newBatch,c);
      if(outputBoundary&&!outputBoundary.ok)return{accepted:false,reason:outputBoundary.reason||'CROSS_COUNTRY_RESOURCE_BREACH',countryId:c,detail:clone(outputBoundary)};
      working.push(newBatch);created.push(newBatch);
      if(warehouse){warehouse.availableByResource=warehouse.availableByResource||{};warehouse.availableByResource[outId]=(num(warehouse.availableByResource[outId])||0)+outQty;warehouse.storedBatchIds=Array.isArray(warehouse.storedBatchIds)?warehouse.storedBatchIds:[];if(!warehouse.storedBatchIds.includes(newBatch.batchId))warehouse.storedBatchIds.push(newBatch.batchId);warehouse.lastMovementTurn=turn();warehouse.lastMovementType='PRODUCTION_OUTPUT';}
    }

    var tx=String(p.transactionId||('PROD-'+turn()+'-'+canonical(ctx.countryId)+'-'+working.length));
    ledger.push({type:'PRODUCTION_TRANSACTION_COMMITTED',transactionId:tx,facilityId:p.facilityId||null,companyId:p.companyId||null,inputs:clone(consumed),outputs:clone(created),turn:turn()});
    while(working.length>(num(rules().runtime.maxBatches)||8192))working.shift();
    while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    if(warehouse)ctx.stateTransaction.set('resource.warehouse',warehouse);
    ctx.stateTransaction.set('resource.inventory',inv);
    ctx.stateTransaction.set('resource.batches',working);
    ctx.stateTransaction.set('resource.inventoryLots',inventoryLots);
    ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    emit('OMEGA_RESOURCE_INVENTORY_CHANGED',ctx.countryId,{transactionId:tx,type:'PRODUCTION_TRANSACTION_COMMITTED'},'resource');
    return{accepted:true,transactionId:tx,consumed:consumed,created:created};
  }

  function addInventoryHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},rid=String(p.resourceId||'').trim(),q=num(p.quantity);
    if(!rid||q===null||q<=0)return{accepted:false,reason:'ADD_INPUT_INVALID'};
    var inv=clone(ctx.stateTransaction.get('resource.inventory')||{}),key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:(Object.keys(inv).find(function(k){return tok(k)===tok(rid);})||rid);
    inv[key]=(num(inv[key])||0)+q;
    var bs=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    var b={batchId:String(p.batchId||('BATCH_'+turn()+'_'+canonical(ctx.countryId)+'_'+tok(rid)+'_'+(bs.length+1))),resourceId:rid,materialIdentity:rid,quantity:q,remainingQuantity:q,unit:p.unit||null,stage:String(p.stage||'FINISHED').toUpperCase(),ownerCountryCode:canonical(ctx.countryId),ownerCompanyId:String(p.ownerCompanyId||('STATE_INDUSTRY_'+canonical(ctx.countryId))),sourceBatchIds:Array.isArray(p.sourceBatchIds)?p.sourceBatchIds.slice():[],transformReference:p.transactionId||null,processId:p.processId||null,timestampTurn:turn(),provenance:clone(p.provenance||{source:'OMEGA_RESOURCE_ECONOMY_RUNTIME',simulationTurn:turn()})};
    bs.push(b);while(bs.length>(num(rules().runtime.maxBatches)||8192))bs.shift();
    var ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'INVENTORY_CREATED',resourceId:rid,quantity:q,stage:b.stage,turn:turn(),batchId:b.batchId,sourceBatchIds:b.sourceBatchIds});
    while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    var whAdd=clone(ctx.stateTransaction.get('resource.warehouse')||{warehouseId:'WH-'+canonical(ctx.countryId)+'-RAW',countryId:canonical(ctx.countryId),type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+canonical(ctx.countryId)+':RAW',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]});
    whAdd.availableByResource[b.resourceId]=(num(whAdd.availableByResource[b.resourceId])||0)+q;whAdd.storedBatchIds=Array.isArray(whAdd.storedBatchIds)?whAdd.storedBatchIds:[];if(!whAdd.storedBatchIds.includes(b.batchId))whAdd.storedBatchIds.push(b.batchId);whAdd.lastReceiptTurn=turn();whAdd.receipts=Array.isArray(whAdd.receipts)?whAdd.receipts:[];whAdd.receipts.push({receiptId:'WH-REC-'+b.batchId,warehouseId:b.warehouseId,countryId:canonical(ctx.countryId),batchId:b.batchId,resourceId:rid,quantity:q,purity:b.purity,gradePercent:b.grade,simulationTurn:turn(),status:'RECEIVED'});while(whAdd.receipts.length>(num(rules().runtime.maxLedgerEntries)||2048))whAdd.receipts.shift();
    ctx.stateTransaction.set('resource.inventory',inv);ctx.stateTransaction.set('resource.batches',bs);ctx.stateTransaction.set('resource.inventoryLedger',ledger);ctx.stateTransaction.set('resource.warehouse',whAdd);
    emit('OMEGA_RESOURCE_INVENTORY_CHANGED',ctx.countryId,{resourceId:rid,delta:q,newQuantity:inv[key],warehouseQuantity:whAdd.availableByResource[rid],stage:b.stage,transactionId:p.transactionId||null},'resource');
    return{accepted:true,resourceId:rid,quantity:q,batch:b};
  }

  function publishResourceRuntimeHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{};
    ctx.stateTransaction.set('resource.inventoryDelta',clone(p.inventoryDelta||{}));
    ctx.stateTransaction.set('resource.inventoryIntegrity',clone(p.integrity||null));
    ctx.stateTransaction.set('resource.lastEconomyTurn',turn());
    return{accepted:true,turn:turn()};
  }

  function companyFlowHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},cid=String(p.companyId||'').trim(),a=num(p.amount);
    if(!cid||a===null||a<0)return{accepted:false,reason:'COMPANY_FLOW_INPUT_INVALID'};
    var accounts=clone(ctx.stateTransaction.get('economy.companyAccounts')||{}),x=accounts[cid];
    if(!x||typeof x!=='object')x={companyId:cid,openingCashStatus:'UNKNOWN',runtimeNetCashFlow:0,grossRevenue:0,paymentsReceived:0,paymentsMade:0,taxPaid:0,workerIncomePaid:0,transportPaid:0,supplierRevenue:0,lastTurn:turn()};
    if(String(p.direction||'CREDIT').toUpperCase()==='CREDIT'){x.runtimeNetCashFlow+=a;x.paymentsReceived+=a;x.grossRevenue+=(num(p.grossRevenue)||a);if(p.category==='DOMESTIC_SUPPLY'||p.category==='SUPPLIER_SALE')x.supplierRevenue+=a;}
    else{x.runtimeNetCashFlow-=a;x.paymentsMade+=a;if(p.category==='TAX')x.taxPaid+=a;if(p.category==='WORKER_INCOME')x.workerIncomePaid+=a;if(p.category==='TRANSPORT')x.transportPaid+=a;}
    x.lastTurn=turn();accounts[cid]=x;ctx.stateTransaction.set('economy.companyAccounts',accounts);return{accepted:true,companyId:cid,amount:a};
  }
  function flowHandler(path,field){
    return function(cmd,ctx){
      var p=cmd&&cmd.payload||{},a=num(p.amount);if(a===null||a<0)return{accepted:false,reason:field+'_FLOW_INVALID'};
      var x=clone(ctx.stateTransaction.get(path)||{});x.totalSinceRuntimeStart=(num(x.totalSinceRuntimeStart)||0)+a;x.lastTurn=turn();ctx.stateTransaction.set(path,x);return{accepted:true,amount:a};
    };
  }

  function fiscalHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},r=clone(p.receipt||p),total=num(r.total);
    if(total===null||total<0)return{accepted:false,reason:'FISCAL_RECEIPT_INVALID'};
    var f=clone(ctx.stateTransaction.get('finance.resourceFiscal')||{cumulative:{royalty:0,resourceTax:0,corporateTax:0,exportDuty:0,other:0,total:0},thisTurn:{royalty:0,resourceTax:0,corporateTax:0,exportDuty:0,other:0,total:0},lastTurn:null});
    var sameTurn=f.lastTurn===turn();
    if(!sameTurn)f.thisTurn={royalty:0,resourceTax:0,corporateTax:0,exportDuty:0,other:0,total:0};
    ['royalty','resourceTax','corporateTax','exportDuty','other'].forEach(function(k){var q=num(r[k])||0;f.cumulative[k]=(num(f.cumulative[k])||0)+q;f.thisTurn[k]=(num(f.thisTurn[k])||0)+q;});
    f.cumulative.total=(num(f.cumulative.total)||0)+total;
    f.thisTurn.total=(num(f.thisTurn.total)||0)+total;
    f.lastTurn=turn();f.policySource='resource_economy_rules.json';
    var l=Array.isArray(ctx.stateTransaction.get('finance.resourceFiscalLedger'))?clone(ctx.stateTransaction.get('finance.resourceFiscalLedger')):[];r.turn=turn();l.push(r);while(l.length>(num(rules().runtime.maxLedgerEntries)||2048))l.shift();
    ctx.stateTransaction.set('finance.resourceFiscal',f);
    ctx.stateTransaction.set('finance.resourceFiscalLedger',l);
    var budgetContribution=num(ctx.stateTransaction.get('finance.resourceBudgetContribution'))||0;
    var budgetThisTurn=sameTurn?(num(ctx.stateTransaction.get('finance.resourceBudgetContributionThisTurn'))||0):0;
    ctx.stateTransaction.set('finance.resourceBudgetContribution',budgetContribution+total);
    ctx.stateTransaction.set('finance.resourceBudgetContributionThisTurn',budgetThisTurn+total);
    var rev=num(ctx.stateTransaction.get('finance.revenue')),tax=num(ctx.stateTransaction.get('finance.taxRevenue')),av=num(ctx.stateTransaction.get('finance.available')),res=num(ctx.stateTransaction.get('finance.reserves'));
    ctx.stateTransaction.set('finance.revenue',(rev===null?0:rev)+total);
    ctx.stateTransaction.set('finance.taxRevenue',(tax===null?0:tax)+total);
    if(av!==null)ctx.stateTransaction.set('finance.available',av+total);else if(res!==null)ctx.stateTransaction.set('finance.reserves',res+total);
    return{accepted:true,total:total};
  }
  function extractionFiscalPendingHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},r=clone(p.record||p),c=canonical(ctx.countryId);
    if(!r.batchId||!r.resourceId||num(r.quantity)===null||num(r.quantity)<=0)return{accepted:false,reason:'EXTRACTION_FISCAL_RECORD_INVALID'};
    var ledger=Array.isArray(ctx.stateTransaction.get('finance.resourceExtractionFiscalLedger'))?clone(ctx.stateTransaction.get('finance.resourceExtractionFiscalLedger')):[];
    r.countryId=c;r.turn=turn();r.status='PENDING_MARKET_VALUATION';r.cashPosted=false;r.sourceAuthority='RESOURCE_JSON';
    ledger.push(r);while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    ctx.stateTransaction.set('finance.resourceExtractionFiscalLedger',ledger);
    return{accepted:true,countryId:c,batchId:r.batchId,status:r.status};
  }

  function logisticsLedgerHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},row=clone(p.record||p);if(!row.logisticsId||!row.resourceId||num(row.quantity)===null||num(row.quantity)<=0)return{accepted:false,reason:'LOGISTICS_RECORD_INVALID'};
    var ledger=Array.isArray(ctx.stateTransaction.get('transport.resourceLogisticsLedger'))?clone(ctx.stateTransaction.get('transport.resourceLogisticsLedger')):[];
    ledger.push(row);while(ledger.length>(num(rules().runtime.maxLedgerEntries)||2048))ledger.shift();
    ctx.stateTransaction.set('transport.resourceLogisticsLedger',ledger);return{accepted:true,logisticsId:row.logisticsId,status:row.status};
  }
  function recordDomesticSaleHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},sale=clone(p.sale||p),rows=Array.isArray(ctx.stateTransaction.get('trade.domesticSales'))?clone(ctx.stateTransaction.get('trade.domesticSales')):[];
    rows.push({sale:sale,turn:turn(),status:sale.status||'SETTLED'});while(rows.length>(num(rules().runtime.maxLedgerEntries)||2048))rows.shift();ctx.stateTransaction.set('trade.domesticSales',rows);return{accepted:true};
  }
  function publishOffersHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},incoming=Array.isArray(p.offers)?clone(p.offers):[],existing=ctx.stateTransaction.get('trade.offerBook'),rows=[];
    if(Array.isArray(existing))rows=clone(existing);
    else if(existing&&typeof existing==='object')Object.keys(existing).forEach(function(rid){var v=existing[rid];if(Array.isArray(v))v.forEach(function(x){rows.push(Object.assign({},clone(x),{resourceId:x.resourceId||rid}));});else if(v&&typeof v==='object')rows.push(Object.assign({},clone(v),{resourceId:v.resourceId||rid}));});
    rows=rows.filter(function(x){return x&&x.source!=='OMEGA_RESOURCE_ECON_AUTO_OFFER';});incoming.forEach(function(x){rows.push(x);});while(rows.length>(num(rules().runtime.maxLedgerEntries)||2048))rows.shift();
    ctx.stateTransaction.set('trade.offerBook',rows);return{accepted:true,offerCount:incoming.length};
  }
  function financeClearHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},a=num(p.amount);if(a===null||a<0)return{accepted:false,reason:'TRADE_CLEAR_AMOUNT_INVALID'};
    var av=num(ctx.stateTransaction.get('finance.available')),res=num(ctx.stateTransaction.get('finance.reserves')),base=av!==null?av:res;
    if(base===null||base<a)return{accepted:false,reason:'TRADE_CLEAR_LIQUIDITY_UNAVAILABLE'};
    if(av!==null)ctx.stateTransaction.set('finance.available',av-a);else ctx.stateTransaction.set('finance.reserves',res-a);
    var l=Array.isArray(ctx.stateTransaction.get('finance.resourceSettlementClearing'))?clone(ctx.stateTransaction.get('finance.resourceSettlementClearing')):[];l.push({type:'TRADE_CLEAR_TO_COMPANY',amount:a,settlementId:p.settlementId||null,companyId:p.companyId||null,turn:turn()});while(l.length>(num(rules().runtime.maxLedgerEntries)||2048))l.shift();
    ctx.stateTransaction.set('finance.resourceSettlementClearing',l);return{accepted:true,amount:a};
  }

  function fiscalFor(gross,direction,companyId){
    var r=rules().fiscal;
    var royalty=gross*(num(r.royaltyRate)||0),resourceTax=gross*(num(r.resourceTaxRate)||0),corporate=sovereignCompany(companyId)?0:gross*(num(r.corporateTaxRate)||0),exportDuty=String(direction||'').toUpperCase()==='EXPORT'?gross*(num(r.exportDutyRate)||0):0,other=gross*(num(r.otherReceiptRate)||0);
    return{gross:gross,royalty:royalty,resourceTax:resourceTax,corporateTax:corporate,exportDuty:exportDuty,other:other,total:royalty+resourceTax+corporate+exportDuty+other,policySource:'resource_economy_rules.json'};
  }

  function processProfile(asset){
    var defaults=(rules().industrialPhysics&&rules().industrialPhysics.defaults)||{};
    var provided=asset&&asset.processProfile&&typeof asset.processProfile==='object'?asset.processProfile:{};
    var observed=Object.keys(provided).length>0;
    return{
      yieldFactor:num(provided.yieldFactor)!=null?Math.max(0,num(provided.yieldFactor)):num(defaults.yieldFactor)!=null?Math.max(0,num(defaults.yieldFactor)):1,
      energyPerUnit:num(provided.energyPerUnit),
      waterPerUnit:num(provided.waterPerUnit),
      maintenanceFactor:num(provided.maintenanceFactor)!=null?Math.max(0,Math.min(1,num(provided.maintenanceFactor))):num(defaults.maintenanceFactor)!=null?Math.max(0,Math.min(1,num(defaults.maintenanceFactor))):1,
      reagentInputs:clone(provided.reagentInputs&&typeof provided.reagentInputs==='object'?provided.reagentInputs:{}),
      byproducts:clone(provided.byproducts&&typeof provided.byproducts==='object'?provided.byproducts:{}),
      wasteFactors:clone(provided.wasteFactors&&typeof provided.wasteFactors==='object'?provided.wasteFactors:{}),
      modelAuthority:observed?'RESOURCE_OR_ASSET_DECLARED':'UNOBSERVED',
      modelStatus:observed?'OBSERVED':'UNOBSERVED_PROCESS_MODEL'
    };
  }
  function resolveLogistics(c,rid,q,facility){
    var econ=bucket(c,'economy')||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],asset=assets.find(function(x){return String(x?.id||x?.facilityId||x?.projectId||'')===String(facility);})||null;
    var routeId=asset?.routeId||asset?.logisticsRouteId||asset?.route?.id||null,network=read(c,'transport.routes')||read(c,'trade.routes')||{},route=routeId&&network&&typeof network==='object'?network[routeId]||null:null;
    var capacity=num(route?.capacity??route?.throughput??route?.dailyCapacity),distanceKm=num(route?.distanceKm??asset?.distanceKm),transitTurns=num(route?.transitTurns??route?.transitTimeTurns),mode=route?.mode||asset?.transportMode||null;
    var status=capacity!==null&&capacity<q?'ROUTE_CAPACITY_INSUFFICIENT':(route&&(mode||distanceKm!==null||transitTurns!==null)?'ROUTE_BACKED':'UNOBSERVED_LOGISTICS');
    return{logisticsId:'LOG-'+turn()+'-'+canonical(c)+'-'+tok(rid)+'-'+tok(facility),countryId:canonical(c),resourceId:rid,quantity:q,facilityId:String(facility),routeId:routeId,mode:mode,distanceKm:distanceKm,transitTurns:transitTurns,capacity:capacity,status:status,authority:route?'OBSERVED_RUNTIME_ROUTE':'UNOBSERVED',policy:rules().logistics?.missingRoutePolicy||'RECORD_UNOBSERVED_LOGISTICS_DO_NOT_INVENT_ROUTE',turn:turn()};
  }
  function settleDomestic(c,rid,q,consumed,buyer,facility,tx){
    var pm=read(c,'trade.marketPrice')||{},price=num(pm[rid]);
    if(price===null&&g.OmegaGlobalMarket&&typeof g.OmegaGlobalMarket.localPrice==='function'){try{price=num(g.OmegaGlobalMarket.localPrice(c,rid));}catch(_){}}
    var suppliers={};(consumed||[]).forEach(function(x){var o=String(x.ownerCompanyId||'').trim(),n=num(x.quantity)||0;if(o&&o!=='UNKNOWN_SOURCE'&&n>0)suppliers[o]=(suppliers[o]||0)+n;});
    if(!Object.keys(suppliers).length)suppliers[mineCompany(c,rid)]=q;
    var totalSource=Object.keys(suppliers).reduce(function(s,k){return s+suppliers[k];},0)||q;
    var logistics=resolveLogistics(c,rid,q,facility);\n    dispatch('transport','OMEGA_RESOURCE_ECON_RECORD_LOGISTICS',c,{record:logistics,correlationId:logistics.logisticsId});\n    var sale={saleId:'DOM-'+turn()+'-'+canonical(c)+'-'+tok(rid)+'-'+facility+'-'+tx,transactionId:tx,facilityId:facility,countryId:canonical(c),resourceId:rid,quantity:q,buyerCompanyId:buyer,supplierAllocations:clone(suppliers),direction:'DOMESTIC',simulationTurn:turn(),logisticsId:logistics.logisticsId,logisticsStatus:logistics.status};
    if(price===null||price<=0){sale.status='PHYSICAL_TRANSFER_COMPLETED';sale.paymentStatus='UNOBSERVED';sale.valuationStatus='UNOBSERVED_MARKET_PRICE';dispatch('trade','OMEGA_RESOURCE_ECON_RECORD_DOMESTIC_SALE',c,{sale:sale,correlationId:sale.saleId});return sale;}
    sale.unitPrice=price;sale.totalValue=q*price;sale.status='SETTLED';sale.paymentStatus='SETTLED';sale.valuationStatus='OBSERVED_RUNTIME_MARKET_PRICE';
    Object.keys(suppliers).forEach(function(companyId){
      var gross=sale.totalValue*(suppliers[companyId]/totalSource);
      dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:companyId,amount:gross,direction:'CREDIT',grossRevenue:gross,supplierRevenue:gross,category:'DOMESTIC_SUPPLY',saleId:sale.saleId});
      var f=fiscalFor(gross,'DOMESTIC',companyId);
      if(f.total>0)dispatch('finance','OMEGA_RESOURCE_ECON_FISCAL_RECEIPT',c,{receipt:Object.assign({},f,{saleId:sale.saleId,resourceId:rid,companyId:companyId,direction:'DOMESTIC'}),correlationId:sale.saleId});
      var w=gross*(num(rules().operatingAllocation.workerIncomeRate)||0),t=gross*(num(rules().operatingAllocation.transportRevenueRate)||0);
      if(w>0){dispatch('economy','OMEGA_RESOURCE_ECON_WORKER_FLOW',c,{amount:w,saleId:sale.saleId});dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:companyId,amount:w,direction:'DEBIT',category:'WORKER_INCOME',saleId:sale.saleId});}
      if(t>0){dispatch('transport','OMEGA_RESOURCE_ECON_TRANSPORT_REVENUE',c,{amount:t,saleId:sale.saleId});dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:companyId,amount:t,direction:'DEBIT',category:'TRANSPORT',saleId:sale.saleId});}
    });
    if(buyer)dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:buyer,amount:sale.totalValue,direction:'DEBIT',category:'FACTORY_INPUT_PURCHASE',saleId:sale.saleId});
    dispatch('economy','OMEGA_RESOURCE_ECON_SUPPLIER_FLOW',c,{amount:sale.totalValue,saleId:sale.saleId});
    dispatch('trade','OMEGA_RESOURCE_ECON_RECORD_DOMESTIC_SALE',c,{sale:sale,correlationId:sale.saleId});
    emit('OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',c,sale,'trade');
    return sale;
  }

  function recipe(asset){
    var ins={},outs={};
    function norm(v,target){if(!v)return;if(Array.isArray(v))v.forEach(function(x){if(!x)return;var rid=x.resourceId||x.resource||x.materialId||x.id,q=num(x.coefficient!=null?x.coefficient:(x.quantity!=null?x.quantity:(x.amount!=null?x.amount:x.ratio)));if(rid&&q!==null&&q>0)target[String(rid)]=q;});else if(typeof v==='object')Object.keys(v).forEach(function(rid){var x=v[rid],q=num(x&&typeof x==='object'?(x.coefficient!=null?x.coefficient:(x.quantity!=null?x.quantity:(x.amount!=null?x.amount:x.ratio))):x);if(q!==null&&q>0)target[rid]=q;});}
    norm(asset.inputCoefficients||asset.inputs||asset.inputProfile,ins);norm(asset.outputProfile||asset.outputs||asset.outputCoefficients,outs);
    if(!Object.keys(ins).length){var inId=asset.inputResourceId||asset.inputResource||asset.feedstockResourceId||asset.feedstock;if(inId)ins[String(inId)]=1;}
    if(!Object.keys(outs).length){var outId=asset.outputResourceId||asset.outputResource||asset.productResourceId;if(outId)outs[String(outId)]=1;}
    if(!Object.keys(outs).length&&Object.keys(ins).length&&g.__OmegaResourceEconomyOntology){
      var first=Object.keys(ins)[0],row=g.__OmegaResourceEconomyOntology[tok(first)]||g.__OmegaResourceEconomyOntology[String(first).toUpperCase()]||g.__OmegaResourceEconomyOntology[first],list=row&&Array.isArray(row.refinedOutputs)?row.refinedOutputs:[],yf=num(asset.yieldFactor!=null?asset.yieldFactor:(asset.conversionYield!=null?asset.conversionYield:asset.processYield));
      if(list.length&&yf!==null&&yf>0){var share=yf/list.length;list.forEach(function(x){outs[String(x)]=share;});}
    }
    return{inputs:ins,outputs:outs};
  }
  function stage(asset){
    var s=tok(asset&&((asset.stage||asset.assetStage||asset.facilityStage||asset.facilityType||asset.type)||''));
    if(/processing|process|refin|benefici|smelt|mill|separat|concentrat|distill|cracker/.test(s))return'PROCESSING';
    if(/factory|manufact|plant|assembly|industrial|battery|petrochem|fertilizer|steel|wire|chemical/.test(s))return'FACTORY';
    return String(asset&&(asset.stage||asset.assetStage)||'').toUpperCase()||'UNKNOWN';
  }

  function executeFactories(c){
    var econ=bucket(c,'economy')||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],inv=invObj(c),records=[],blocked=[],executed=[];
    assets.forEach(function(asset,index){
      var fid=String(asset.projectId||asset.assetId||asset.id||asset.siteId||('ASSET_'+index)),st=stage(asset),rc=recipe(asset),cap=num(asset.capacity!=null?asset.capacity:(asset.productionCapacity!=null?asset.productionCapacity:asset.throughput)),row={facilityId:fid,stage:st,status:'BLOCKED',capacityObserved:cap,companyId:assetCompany(c,asset),inputCoefficients:rc.inputs,outputProfile:rc.outputs};
      if(cap===null||cap<=0){row.reason='PRODUCTION_CAPACITY_UNAVAILABLE';blocked.push(row);records.push(row);return;}
      if(!Object.keys(rc.inputs).length){row.reason='INPUT_RECIPE_UNOBSERVED';blocked.push(row);records.push(row);return;}
      if(!Object.keys(rc.outputs).length){row.reason='OUTPUT_RECIPE_UNOBSERVED';blocked.push(row);records.push(row);return;}
      var scale=cap,available={};
      Object.keys(rc.inputs).forEach(function(rid){
        var key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(function(k){return tok(k)===tok(rid);});
        var a=key==null?null:num(inv[key]);available[rid]=a===null?0:a;
        if(a===null||a<scale*rc.inputs[rid])scale=Math.min(scale,a===null?0:a/rc.inputs[rid]);
      });
      if(scale<=0){row.reason='INPUT_STOCK_UNAVAILABLE';row.inputsAvailable=available;blocked.push(row);records.push(row);return;}
      row.status='READY';row.plannedScale=scale;row.inputsAvailable=available;row.computedOutputs={};
      Object.keys(rc.outputs).forEach(function(rid){row.computedOutputs[rid]=scale*rc.outputs[rid];});
      records.push(row);
    });

    records.forEach(function(row){
      if(row.status!=='READY')return;
      var tx='IND-'+turn()+'-'+canonical(c)+'-'+row.facilityId+'-'+(executed.length+1);
      var inputs=Object.keys(row.inputCoefficients).map(function(rid){return{resourceId:rid,quantity:row.plannedScale*row.inputCoefficients[rid],purpose:row.stage==='FACTORY'?'FACTORY_INPUT':'PROCESSING_INPUT'};});
      var outputs=Object.keys(row.computedOutputs).map(function(rid){return{resourceId:rid,quantity:row.computedOutputs[rid],stage:row.stage==='PROCESSING'?'INTERMEDIATE':'FINISHED',unit:null};});
      var result=dispatch('resource','OMEGA_RESOURCE_ECON_APPLY_PRODUCTION',c,{transactionId:tx,facilityId:row.facilityId,companyId:row.companyId,inputs:inputs,outputs:outputs,provenance:{source:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2',facilityId:row.facilityId,turn:turn()},correlationId:tx});
      if(!result||result.status!=='APPLIED'){row.status='BLOCKED';row.reason=result&&result.result&&result.result.reason||'PRODUCTION_TRANSACTION_FAILED';row.failureDetail=result&&result.result||result&&result.reason||null;blocked.push(row);return;}
      var consumed=result.result&&result.result.consumed||[],sourceBatchIds=[];
      consumed.forEach(function(item){(item.consumed||[]).forEach(function(x){if(x.batchId)sourceBatchIds.push(x.batchId);});});
      consumed.forEach(function(item){settleDomestic(c,item.resourceId,item.quantity,item.consumed,row.companyId,row.facilityId,tx);});
      var done={transactionId:tx,countryId:canonical(c),facilityId:row.facilityId,companyId:row.companyId,stage:row.stage,inputQuantities:{},outputQuantities:clone(row.computedOutputs),sourceBatchIds:[...new Set(sourceBatchIds)],turn:turn(),status:'COMPLETED'};
      Object.keys(row.inputCoefficients).forEach(function(rid){done.inputQuantities[rid]=row.plannedScale*row.inputCoefficients[rid];});
      executed.push(done);
      emit(row.stage==='PROCESSING'?'OMEGA_RESOURCE_PROCESSING_COMPLETED':'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',c,done,'resource-economy');
    });
    return{assets:assets,records:records,executed:executed,blocked:blocked};
  }

  function publishOffers(c){
    var inv=invObj(c),rs=bucket(c,'resource')||{},prices=read(c,'trade.marketPrice')||{},offers=[];
    var fraction=num(rules().market.offerFractionOfObservedInventory);if(fraction===null)fraction=num(rules().market.referenceOfferFraction);if(fraction===null)fraction=0.25;fraction=Math.max(0,Math.min(1,fraction));
    var min=num(rules().market.minOfferQuantity);if(min===null)min=1;
    var spr=rs.strategicReserve&&rs.strategicReserve.availableByResource||{},committed=rs.committedStock||rs.committedInventory||{},sellable=clone(rs.sellableInventory||{});
    if(!Object.keys(sellable).length)Object.keys(inv).forEach(function(rid){sellable[rid]=Math.max(0,(num(inv[rid])||0)-(num(spr[rid])||0)-(num(committed[rid])||0));});
    Object.keys(sellable).forEach(function(rid){
      var q=num(sellable[rid])||0;if(q<min)return;
      var p=num(prices[rid]);if(p===null&&g.OmegaGlobalMarket&&typeof g.OmegaGlobalMarket.localPrice==='function'){try{p=num(g.OmegaGlobalMarket.localPrice(c,rid));}catch(_){}}if(p===null||p<=0)return;
      var oq=q*fraction;if(oq<min)return;
      offers.push({offerId:'AUTO-'+turn()+'-'+canonical(c)+'-'+tok(rid),resourceId:rid,quantity:oq,available:oq,price:p,unitPrice:p,countryId:canonical(c),source:'OMEGA_RESOURCE_ECON_AUTO_OFFER',referenceOnly:false,simulationTurn:turn(),sellableInventory:q,reservedInventory:num(spr[rid])||0,committedInventory:num(committed[rid])||0});
    });
    return dispatch('trade','OMEGA_RESOURCE_ECON_PUBLISH_OFFER_BOOK',c,{offers:offers,correlationId:'AUTO-OFFER-'+turn()+'-'+canonical(c)});
  }

  function fiscalizeTrade(evt){
    var d=evt&&evt.detail?evt.detail:{},p=d.payload||(d.data&&d.data.payload)||d,sid=String(p.settlementId||'').trim();if(!sid)return;
    if(!g.__OmegaResourceFiscalizedSettlements)g.__OmegaResourceFiscalizedSettlements={};
    if(g.__OmegaResourceFiscalizedSettlements[sid])return;
    var seller=canonical(p.sellerCountryId||p.targetCountryId||p.countryId),rid=String(p.resourceId||'').trim(),gross=num(p.totalValue!=null?p.totalValue:p.sellerTotal);if(!seller||!rid||gross===null||gross<0)return;
    var econ=bucket(seller,'economy')||{},owners=econ.industrialRuntime&&econ.industrialRuntime.materialOwners||{},company=String(owners[rid]||mineCompany(seller,rid)),clear=dispatch('finance','OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY',seller,{amount:gross,settlementId:sid,companyId:company,correlationId:sid});if(!clear||clear.status!=='APPLIED')return;
    g.__OmegaResourceFiscalizedSettlements[sid]=true;
    dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId:company,amount:gross,direction:'CREDIT',grossRevenue:gross,supplierRevenue:gross,category:'SUPPLIER_SALE',settlementId:sid});
    var f=fiscalFor(gross,'EXPORT',company);if(f.total>0)dispatch('finance','OMEGA_RESOURCE_ECON_FISCAL_RECEIPT',seller,{receipt:Object.assign({},f,{settlementId:sid,sellerCountryId:seller,resourceId:rid,companyId:company}),correlationId:sid});
    var w=gross*(num(rules().operatingAllocation.workerIncomeRate)||0),t=gross*(num(rules().operatingAllocation.transportRevenueRate)||0);if(w>0){dispatch('economy','OMEGA_RESOURCE_ECON_WORKER_FLOW',seller,{amount:w,settlementId:sid});dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId:company,amount:w,direction:'DEBIT',category:'WORKER_INCOME',settlementId:sid});}if(t>0){dispatch('transport','OMEGA_RESOURCE_ECON_TRANSPORT_REVENUE',seller,{amount:t,settlementId:sid});dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId:company,amount:t,direction:'DEBIT',category:'TRANSPORT',settlementId:sid});}
    emit('OMEGA_RESOURCE_TRADE_RECONCILED',seller,{settlementId:sid,resourceId:rid,companyId:company,gross:gross,fiscal:f,status:'FISCALIZED'},'finance');
  }

  function recordOwner(c,done){
    var company=String(done&&done.companyId||'').trim();if(!company)return;
    var econ=bucket(c,'economy')||{},runtime=clone(econ.industrialRuntime||{}),owners=clone(runtime.materialOwners||{});Object.keys(done.outputQuantities||{}).forEach(function(rid){owners[rid]=company;});runtime.materialOwners=owners;runtime.lastTurn=turn();
    dispatch('economy','OMEGA_RESOURCE_ECON_PUBLISH_ECONOMY',c,{industrialRuntime:runtime,companyAccounts:clone(econ.companyAccounts||{}),workerIncome:clone(econ.workerIncome||{}),supplierRevenue:clone(econ.supplierRevenue||{}),factoryOutput:clone(econ.factoryOutput||{}),correlationId:'OWNER-'+turn()+'-'+canonical(c)});
  }

  function factoryInputEventHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},econ=bucket(ctx.countryId,'economy')||{},
      runtime=clone(econ.industrialRuntime||ctx.stateTransaction.get('economy.industrialRuntime')||{}),
      events=Array.isArray(runtime.factoryInputEvents)?runtime.factoryInputEvents:[],
      resourceId=String(p.resourceId||p.batch&&p.batch.resourceId||'').trim(),
      assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
    var candidateFactoryIds=assets.filter(function(asset){
      var coeff=asset&&asset.inputCoefficients;
      if(!coeff||typeof coeff!=='object'||!resourceId)return false;
      return Object.keys(coeff).some(function(k){return tok(k)===tok(resourceId);});
    }).map(function(asset){return String(asset.id||asset.facilityId||asset.nodeId||'').trim();}).filter(Boolean);
    events.push({eventId:p.eventId||null,eventType:'OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',countryId:canonical(ctx.countryId),extractionId:p.extractionId||null,batchId:p.batch&&p.batch.batchId||p.batchId||null,resourceId:resourceId,quantity:num(p.quantity)||0,purity:num(p.purity),gradePercent:num(p.gradePercent),warehouseId:p.warehouseId||null,candidateFactoryIds:candidateFactoryIds,dispatchStatus:candidateFactoryIds.length?'AVAILABLE_TO_MATCHING_FACTORIES':'NO_MATCHING_FACTORY',simulationTurn:turn(),sourceAuthority:p.sourceAuthority||'RESOURCE_JSON'});
    while(events.length>(num(rules().runtime.maxLedgerEntries)||2048))events.shift();
    runtime.factoryInputEvents=events;runtime.lastFactoryInputEventTurn=turn();
    econ.industrialRuntime=runtime;
    ctx.stateTransaction.set('economy.industrialRuntime',runtime);
    return{accepted:true,eventCount:events.length};
  }

  function economyPublishHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{};ctx.stateTransaction.set('economy.industrialRuntime',clone(p.industrialRuntime||{}));ctx.stateTransaction.set('economy.companyAccounts',clone(p.companyAccounts||{}));ctx.stateTransaction.set('economy.workerIncome',clone(p.workerIncome||{}));ctx.stateTransaction.set('economy.supplierRevenue',clone(p.supplierRevenue||{}));ctx.stateTransaction.set('economy.factoryOutput',clone(p.factoryOutput||{}));emit('OMEGA_INDUSTRIAL_RUNTIME_PUBLISHED',ctx.countryId,{turn:turn()},'economy');return{accepted:true};
  }

  function installHandlers(){
    var m=interop();if(!m||typeof m.registerCommandHandler!=='function')return false;
    var list=[
      ['OMEGA_RESOURCE_ECON_RECONCILE_INVENTORY','resource',reconcileHandler],
      ['OMEGA_RESOURCE_ECON_REGISTER_BATCH','resource',registerBatchHandler],
      ['OMEGA_RESOURCE_ECON_CONSUME_INVENTORY','resource',consumeHandler],
      ['OMEGA_RESOURCE_ECON_ADD_INVENTORY','resource',addInventoryHandler],
      ['OMEGA_RESOURCE_ECON_APPLY_PRODUCTION','resource',applyProductionHandler],
      ['OMEGA_RESOURCE_ECON_PUBLISH_RESOURCE_RUNTIME','resource',publishResourceRuntimeHandler],
      ['OMEGA_RESOURCE_ECON_PUBLISH_ECONOMY','economy',economyPublishHandler],
      ['OMEGA_RESOURCE_ECON_FACTORY_INPUT_EVENT','economy',factoryInputEventHandler],
      ['OMEGA_RESOURCE_ECON_COMPANY_FLOW','economy',companyFlowHandler],
      ['OMEGA_RESOURCE_ECON_WORKER_FLOW','economy',flowHandler('economy.workerIncome','WORKER')],
      ['OMEGA_RESOURCE_ECON_SUPPLIER_FLOW','economy',flowHandler('economy.supplierRevenue','SUPPLIER')],
      ['OMEGA_RESOURCE_ECON_TRANSPORT_REVENUE','transport',flowHandler('transport.resourceRevenue','TRANSPORT')],
      ['OMEGA_RESOURCE_ECON_FISCAL_RECEIPT','finance',fiscalHandler],
      ['OMEGA_RESOURCE_ECON_EXTRACTION_FISCAL_PENDING','finance',extractionFiscalPendingHandler],
      ['OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY','finance',financeClearHandler],
      ['OMEGA_RESOURCE_ECON_RECORD_DOMESTIC_SALE','trade',recordDomesticSaleHandler],
      ['OMEGA_RESOURCE_ECON_RECORD_LOGISTICS','transport',logisticsLedgerHandler],
      ['OMEGA_RESOURCE_ECON_PUBLISH_OFFER_BOOK','trade',publishOffersHandler]
    ];
    try{list.forEach(function(x){if(m.registerAction)m.registerAction(x[0],{actionId:x[0],stateOwnerMinistry:x[1],authority:'OMEGA_RESOURCE_ECONOMY_RUNTIME_V2'});m.registerCommandHandler(x[0],x[1],x[2]);});return true;}catch(_){return false;}
  }

  function installEvents(){
    if(g.__OmegaResourceEconomyV2Events||typeof g.addEventListener!=='function')return;
    g.__OmegaResourceEconomyV2Events=true;
    g.addEventListener('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',function(e){
      var p=e&&e.detail?e.detail.payload||e.detail:{},country=p.countryId||e.detail&&e.detail.countryId;
      if(country)dispatch('economy','OMEGA_RESOURCE_ECON_FACTORY_INPUT_EVENT',country,p);
    });
    g.addEventListener('OMEGA_RESOURCE_PROCESSING_COMPLETED',function(e){var p=e&&e.detail?e.detail.payload||e.detail:{};recordOwner(p.countryId||e.detail&&e.detail.countryId,p);});
    g.addEventListener('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',function(e){var p=e&&e.detail?e.detail.payload||e.detail:{};recordOwner(p.countryId||e.detail&&e.detail.countryId,p);});
    g.addEventListener('OMEGA_TRADE_SETTLEMENT_COMPLETED',fiscalizeTrade);
  }

  function processCountry(c){
    var cid=canonical(c),rs=bucket(cid,'resource')||{},before=clone(rs.inventory||{}),recon=dispatch('resource','OMEGA_RESOURCE_ECON_RECONCILE_INVENTORY',cid,{correlationId:'RECON-'+turn()+'-'+cid}),prod=executeFactories(cid),afterState=bucket(cid,'resource')||{},after=clone(afterState.inventory||{}),delta={},keys={};
    Object.keys(before).forEach(function(k){keys[k]=true;});Object.keys(after).forEach(function(k){keys[k]=true;});Object.keys(keys).forEach(function(k){delta[k]=(num(after[k])||0)-(num(before[k])||0);});
    var updateResource=dispatch('resource','OMEGA_RESOURCE_ECON_PUBLISH_RESOURCE_RUNTIME',cid,{inventoryDelta:delta,integrity:clone(afterState.inventoryIntegrity||((recon&&recon.result)||null)),correlationId:'RES-RUNTIME-'+turn()+'-'+cid});
    publishOffers(cid);
    var econ=bucket(cid,'economy')||{},runtime=clone(econ.industrialRuntime||{}),accounts=clone(econ.companyAccounts||{}),workers=clone(econ.workerIncome||{}),suppliers=clone(econ.supplierRevenue||{}),out={};
    runtime.lastTurn=turn();runtime.facilities=prod.executed.concat(prod.blocked);runtime.productionLedger=(Array.isArray(runtime.productionLedger)?runtime.productionLedger:[]).concat(prod.executed).slice(-(num(rules().runtime.maxLedgerEntries)||2048));runtime.blockedFacilities=prod.blocked.slice(-256);runtime.status=prod.blocked.length?'DEGRADED':(prod.assets.length?'HEALTHY':'NO_FACTORY_ASSETS');
    prod.executed.forEach(function(x){Object.keys(x.outputQuantities||{}).forEach(function(rid){out[rid]=(out[rid]||0)+x.outputQuantities[rid];});});
    dispatch('economy','OMEGA_RESOURCE_ECON_PUBLISH_ECONOMY',cid,{industrialRuntime:runtime,companyAccounts:accounts,workerIncome:workers,supplierRevenue:suppliers,factoryOutput:out,correlationId:'ECO-'+turn()+'-'+cid});
    emit('OMEGA_RESOURCE_INVENTORY_RECONCILED',cid,{turn:turn(),delta:delta,factoriesExecuted:prod.executed.length,factoriesBlocked:prod.blocked.length},'resource-economy');
    return{countryId:cid,turn:turn(),mineCount:Array.isArray(rs.mines)?rs.mines.length:0,inventoryBefore:before,inventoryAfter:after,inventoryDelta:delta,factoriesExecuted:prod.executed.length,factoriesBlocked:prod.blocked.length,blockedFacilities:prod.blocked};
  }

  function dashboard(c){
    var cid=canonical(c),rs=bucket(cid,'resource')||{},econ=bucket(cid,'economy')||{},fin=bucket(cid,'finance')||{},tr=bucket(cid,'trade')||{},tp=bucket(cid,'transport')||{},mines=Array.isArray(rs.mines)?rs.mines:[],inv=rs.inventory&&typeof rs.inventory==='object'?rs.inventory:{},outs=rs.mineOutputs||{},mineTotals=rs.mineOutputTotals||{},mineHistory=Array.isArray(rs.mineProductionLedger)?rs.mineProductionLedger:[],warehouse=rs.warehouse||{},runtime=econ.industrialRuntime||{},factoryInputEvents=Array.isArray(runtime.factoryInputEvents)?runtime.factoryInputEvents:[],fisc=fin.resourceFiscal||{},currentFiscal=fisc.lastTurn===turn()?(fisc.thisTurn||{}):{royalty:0,resourceTax:0,corporateTax:0,exportDuty:0,other:0,total:0},sales=Array.isArray(tr.domesticSales)?tr.domesticSales:[],offer=tr.offerBook,offerRows=Array.isArray(offer)?offer:(offer&&typeof offer==='object'?Object.keys(offer).map(function(k){return offer[k];}):[]);
    var rows=mines.map(function(m){var o=m.occurrenceKey&&outs[m.occurrenceKey]||{},tot=mineTotals[m.occurrenceKey]||{},st=String(o.status||m.operationalStatus||m.reserveState&&m.reserveState.operationalStatus||'UNKNOWN').toUpperCase(),rb=o.reserveBefore&&num(o.reserveBefore.residualQuantity),ra=o.reserveAfter&&num(o.reserveAfter.residualQuantity);return{occurrenceKey:m.occurrenceKey,depositName:m.depositName||m.occurrenceKey||'UNNAMED MINE',resourceId:m.resourceId||'',ownerKey:m.ownerKey||null,operatorKey:m.operatorKey||null,status:st,reserve:num(m.reserveState&&m.reserveState.residualQuantity!=null?m.reserveState.residualQuantity:m.residualQuantity),outputThisTurn:num(o.producedQuantity)||0,outputCumulative:num(o.outputCumulative)||num(tot.cumulativeQuantity)||0,outputRatePerDay:num(m.outputRatePerDay),purity:num(o.purity!=null?o.purity:m.purity),gradePercent:num(o.gradePercent!=null?o.gradePercent:m.gradePercent),batchId:o.batchId||m.lastBatchId||null,warehouseId:o.warehouseId||m.warehouseId||warehouse.warehouseId||null,sourceDatasetId:m.sourceDatasetId||o.sourceDatasetId||null,deltaReserve:(rb!==null&&ra!==null)?ra-rb:null};});
    var active=rows.filter(function(x){return /ACTIVE|DEPLETING|OPERATING|RUNNING/.test(x.status);}).length,blocked=rows.filter(function(x){return /BLOCKED|FAILED|UNAVAILABLE|UNKNOWN/.test(x.status);}).length,world=0,worldActive=0,worldBlocked=0;
    countries().forEach(function(x){var rr=bucket(x,'resource')||{},mm=Array.isArray(rr.mines)?rr.mines:[];world+=mm.length;mm.forEach(function(m){var o=rr.mineOutputs&&m.occurrenceKey?rr.mineOutputs[m.occurrenceKey]:null,s=String(o&&o.status||m.operationalStatus||'UNKNOWN').toUpperCase();if(/ACTIVE|DEPLETING|OPERATING|RUNNING/.test(s))worldActive++;if(/BLOCKED|FAILED|UNAVAILABLE|UNKNOWN/.test(s))worldBlocked++;});});
    var fiscalPending=Array.isArray(fin.resourceExtractionFiscalLedger)?fin.resourceExtractionFiscalLedger:[],minePaths=rs.minePaths&&typeof rs.minePaths==='object'?rs.minePaths:{},inventoryLots=rs.inventoryLots&&typeof rs.inventoryLots==='object'?rs.inventoryLots:{};
    return{version:VERSION,countryId:cid,turn:turn(),mines:{total:mines.length,active:active,blocked:blocked,rows:rows},inventory:{actual:clone(inv),delta:clone(rs.inventoryDelta||{}),batches:Array.isArray(rs.batches)?rs.batches.length:0,batchRows:Array.isArray(rs.batches)?clone(rs.batches.slice(-64)):[],lotCount:Object.keys(inventoryLots).length,warehouse:clone(warehouse),integrity:clone(rs.inventoryIntegrity||null),minePathCount:Object.keys(minePaths).length,minePaths:clone(minePaths)},telemetry:{mineProductionHistory:clone(mineHistory.slice(-64)),factoryInputEvents:clone(factoryInputEvents.slice(-64))},industry:{runtime:clone(runtime),factoryOutput:clone(econ.factoryOutput||{}),blockedFacilities:clone(runtime.blockedFacilities||[])},market:{prices:clone(tr.marketPrice||{}),domesticSalesTotal:sales.length,domesticSalesThisTurn:sales.filter(function(x){return num(x.turn)===turn();}).length,autoOffers:offerRows.filter(function(x){return x&&x.source==='OMEGA_RESOURCE_ECON_AUTO_OFFER';}).length},treasury:{fiscalThisTurn:clone(currentFiscal),fiscalCumulative:clone(fisc.cumulative||{}),revenue:num(fin.revenue),taxRevenue:num(fin.taxRevenue),available:num(fin.available),reserves:num(fin.reserves),resourceBudgetContribution:num(fin.resourceBudgetContribution),resourceBudgetContributionThisTurn:fisc.lastTurn===turn()?(num(fin.resourceBudgetContributionThisTurn)||0):0,transportRevenue:num(tp.resourceRevenue&&tp.resourceRevenue.totalSinceRuntimeStart),companyAccounts:clone(econ.companyAccounts||{}),extractionFiscalPendingCount:fiscalPending.length,extractionFiscalPending:clone(fiscalPending.slice(-64))},health:{status:blocked>0||runtime.status==='DEGRADED'||rs.inventoryIntegrity&&rs.inventoryIntegrity.status==='DEGRADED'?'DEGRADED':(mines.length?'HEALTHY':'NO_MINE_RECORDS'),worldMineCount:world,worldActiveMines:worldActive,worldBlockedMines:worldBlocked,runtimeVersion:VERSION,rulesVersion:rules().schemaVersion,warehouseAuthoritative:!!warehouse.warehouseId,dataAuthority:rs.resourceAuthority?.source||'UNKNOWN'},fiscalReceiptThisTurn:num(currentFiscal.total)||0};
  }

  function diagnostics(){var cs=countries(),mine=0,active=0,blocked=0;cs.forEach(function(c){var d=dashboard(c);mine+=d.mines.total;active+=d.mines.active;blocked+=d.mines.blocked;});return{version:VERSION,countryCount:cs.length,mineCount:mine,activeMines:active,blockedMines:blocked,allMineRowsUncapped:true,handlersReady:!!(interop()&&interop().commandHandlers),rulesLoaded:!!g.__OmegaResourceEconomyRules};}

  function runTurn(){
    return loadRules().then(async function(){
      installHandlers();installEvents();
      var extractionResult=null;
      if(g.OmegaResourceEndowmentRuntime&&typeof g.OmegaResourceEndowmentRuntime.extractAll==='function'){
        try{
          extractionResult=await g.OmegaResourceEndowmentRuntime.extractAll();
          if(extractionResult&&['FAILED','WAITING_DEPENDENCIES'].includes(String(extractionResult.status||'').toUpperCase())){
            emit('OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH','GLOBAL',{
              status:'DEGRADED',
              reason:extractionResult.reason||'RESOURCE_EXTRACTION_FAILED',
              turn:turn()
            },'resource-economy');
          }
        }catch(error){
          extractionResult={status:'FAILED',reason:String(error&&error.message||error)};
          emit('OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH','GLOBAL',{
            status:'DEGRADED',
            reason:extractionResult.reason,
            turn:turn()
          },'resource-economy');
        }
      }

      countries().forEach(function(c){
        try{processCountry(c);}
        catch(e){
          emit('OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH',c,{
            status:'DEGRADED',
            reason:String(e&&e.message||e)
          },'resource-economy');
        }
      });
      if(g.OmegaGlobalMarket&&typeof g.OmegaGlobalMarket.rebuild==='function'){
        try{g.OmegaGlobalMarket.rebuild();}catch(_){}
      }
      if(g.OmegaGlobalTrade&&typeof g.OmegaGlobalTrade.processAll==='function'){
        try{g.OmegaGlobalTrade.processAll();}catch(_){}
      }
      countries().forEach(function(c){
        var d=dashboard(c);
        emit('OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH',c,d.health,'resource-economy');
        try{
          if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function'){
            g.dispatchEvent(new g.CustomEvent('OMEGA_RESOURCE_ECONOMY_UPDATED',{detail:d}));
          }
        }catch(_){}
      });
      return{status:'COMPLETED',turn:turn(),extraction:extractionResult};
    });
  }
  var uiOriginal=null;
  function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];});}
  function money(v){var n=num(v);return n===null?'—':n.toLocaleString(undefined,{maximumFractionDigits:2});}
  function sig(v){var n=num(v);return n===null?'—':(n>0?'+':'')+n.toLocaleString(undefined,{maximumFractionDigits:2});}
  function pct(v){var n=num(v);return n===null?'—':(n*100).toFixed(2)+'%';}
  function ui(){
    if(!g.CountryIOS||typeof g.CountryIOS.renderChapter5_Resources!=='function')return;
    if(g.__OmegaResourceEconomyV2UI)return;
    uiOriginal=g.CountryIOS.renderChapter5_Resources;
    g.CountryIOS.renderChapter5_Resources=function(c){
      var d=dashboard(c);if(!d||!d.countryId)return uiOriginal.call(this,c);
      var mines=d.mines.rows.map(function(m){return'<div class="omega-re2-row"><div><b>'+esc(m.depositName)+'</b><small>'+esc(m.resourceId)+' · '+esc(m.sourceDatasetId||'RESOURCE_JSON')+'</small></div><span>'+esc(m.status)+'</span><strong>'+money(m.outputThisTurn)+'</strong><strong>'+pct(m.purity)+'</strong><strong>'+money(m.outputCumulative)+'</strong><em>'+esc(m.batchId||'—')+'</em><small>'+esc(m.warehouseId||'—')+'</small></div>';}).join('')||'<div class="omega-re2-empty">No authoritative mine records are observed.</div>';
      var inv=Object.keys(d.inventory.actual).sort().map(function(r){return'<div class="omega-re2-line"><span>'+esc(r)+'</span><strong>'+money(d.inventory.actual[r])+'</strong><em>'+sig(d.inventory.delta[r])+'</em></div>';}).join('')||'<div class="omega-re2-empty">No authoritative inventory is observed.</div>';
      var warehouse=Object.keys(d.inventory.warehouse.availableByResource||{}).sort().map(function(r){return'<div class="omega-re2-line"><span>'+esc(r)+'</span><strong>'+money(d.inventory.warehouse.availableByResource[r])+'</strong><em>stored</em></div>';}).join('')||'<div class="omega-re2-empty">Warehouse is empty.</div>';
      var batches=d.inventory.batchRows.map(function(b){return'<div class="omega-re2-line"><span>'+esc(b.batchId)+'<small>'+esc(b.resourceId)+' · '+esc(b.stage||'RAW')+'</small></span><strong>'+money(b.remainingQuantity!=null?b.remainingQuantity:b.quantity)+'</strong><em>'+pct(b.purity)+'</em></div>';}).join('')||'<div class="omega-re2-empty">No material batches recorded.</div>';
      var history=d.telemetry.mineProductionHistory.slice().reverse().slice(0,16).map(function(x){return'<div class="omega-re2-line"><span>'+esc(x.mineName||x.mineId)+'<small>T'+esc(x.turn)+' · '+esc(x.resourceId)+' · '+esc(x.batchId)+'</small></span><strong>'+money(x.quantity)+'</strong><em>'+pct(x.purity)+'</em></div>';}).join('')||'<div class="omega-re2-empty">No mine production history recorded.</div>';
      var factoryEvents=d.telemetry.factoryInputEvents.slice().reverse().slice(0,16).map(function(x){return'<div class="omega-re2-line"><span>'+esc(x.batchId||'—')+'<small>'+esc(x.resourceId||'')+' · T'+esc(x.simulationTurn)+'</small></span><strong>'+money(x.quantity)+'</strong><em>'+pct(x.purity)+'</em></div>';}).join('')||'<div class="omega-re2-empty">No factory-input events recorded.</div>';
      var bl=d.industry.blockedFacilities.map(function(x){return'<div class="omega-re2-line"><span>'+esc(x.facilityId)+'</span><em>'+esc(x.reason||'UNKNOWN')+'</em></div>';}).join('')||'<div class="omega-re2-empty">No blocked facility is recorded.</div>';
      var comp=Object.keys(d.treasury.companyAccounts).slice(-12).map(function(k){var x=d.treasury.companyAccounts[k]||{};return'<div class="omega-re2-line"><span>'+esc(k)+'</span><strong>'+sig(x.runtimeNetCashFlow)+'</strong><small>received '+money(x.paymentsReceived)+' · paid '+money(x.paymentsMade)+' · tax '+money(x.taxPaid)+' · opening '+esc(x.openingCashStatus||'UNKNOWN')+'</small></div>';}).join('')||'<div class="omega-re2-empty">No company cash-flow records yet.</div>';
      var f=d.treasury.fiscalThisTurn||{};
      return'<div class="omega-re2">'+
        '<section class="omega-re2-head"><div><small>RESOURCE ECONOMIC CONTROL // LIVE</small><h3>'+esc(d.countryId)+' RESOURCE → INDUSTRY → MARKET → TREASURY</h3><p>Turn '+d.turn+' · local mines '+d.mines.total+' · world mines '+d.health.worldMineCount+' · world active '+d.health.worldActiveMines+' · world blocked '+d.health.worldBlockedMines+'</p></div><b>'+esc(d.health.status)+'</b></section>'+
        '<section class="omega-re2-kpi"><div><small>MINES</small><strong>'+d.mines.total+'</strong><em>'+d.mines.active+' active · '+d.mines.blocked+' blocked</em></div><div><small>INVENTORY LOTS</small><strong>'+d.inventory.lotCount+'</strong><em>'+d.inventory.batches+' tracked batches</em></div><div><small>MINE PATHS</small><strong>'+d.inventory.minePathCount+'</strong><em>sovereign paths</em></div><div><small>TREASURY RECEIPTS</small><strong>+'+money(d.fiscalReceiptThisTurn)+'</strong><em>'+d.treasury.extractionFiscalPendingCount+' extraction entries pending valuation</em></div></section>'+
        '<section class="omega-re2-flow"><b>LIVE MATERIAL & MONEY FLOW</b><div>DEPOSIT ↓ EXTRACTION ↓ BATCH ↓ RAW INVENTORY ↓ PROCESSING ↓ INTERMEDIATE ↓ FACTORY ↓ FINISHED GOODS ↓ MARKET ↓ SETTLEMENT ↓ TREASURY</div></section>'+
        '<section class="omega-re2-grid"><div class="omega-re2-panel wide"><header>OPERATING MINE REGISTER <span>'+d.mines.total+' sites · output / purity / batch</span></header><div class="omega-re2-scroll">'+mines+'</div></div>'+
        '<div class="omega-re2-panel"><header>AUTHORITATIVE INVENTORY <span>aggregate physical state</span></header><div class="omega-re2-scroll">'+inv+'</div></div>'+
        '<div class="omega-re2-panel"><header>RAW-MATERIAL WAREHOUSE <span>'+esc(d.inventory.warehouse.warehouseId||'UNAVAILABLE')+'</span></header><div class="omega-re2-scroll">'+warehouse+'</div></div>'+
        '<div class="omega-re2-panel"><header>TRACKED MATERIAL BATCHES <span>'+d.inventory.batches+' lots</span></header><div class="omega-re2-scroll">'+batches+'</div></div>'+
        '<div class="omega-re2-panel"><header>MINE PRODUCTION LOG <span>latest 16 receipts</span></header><div class="omega-re2-scroll">'+history+'</div></div>'+
        '<div class="omega-re2-panel"><header>FACTORY INPUT EVENT LOG <span>'+d.telemetry.factoryInputEvents.length+' recorded</span></header><div class="omega-re2-scroll">'+factoryEvents+'</div></div>'+
        '<div class="omega-re2-panel"><header>PROCESSING / FACTORY <span>'+esc(d.industry.runtime.status||'UNKNOWN')+'</span></header><div class="omega-re2-scroll">'+bl+'</div></div>'+
        '<div class="omega-re2-panel"><header>MARKET / INTERNAL CONTRACTS <span>'+d.market.autoOffers+' live offers</span></header><div class="omega-re2-scroll"><div class="omega-re2-line"><span>Domestic contracts this turn</span><strong>'+d.market.domesticSalesThisTurn+'</strong><em>recorded '+d.market.domesticSalesTotal+'</em></div></div></div>'+
        '<div class="omega-re2-panel"><header>TREASURY / FISCAL RECEIPTS <span>turn '+d.turn+'</span></header><div class="omega-re2-scroll"><div class="omega-re2-line"><span>Extraction fiscal entries</span><strong>'+d.treasury.extractionFiscalPendingCount+'</strong><em>pending market valuation</em></div><div class="omega-re2-line"><span>Royalty</span><strong>+'+money(f.royalty)+'</strong></div><div class="omega-re2-line"><span>Resource tax</span><strong>+'+money(f.resourceTax)+'</strong></div><div class="omega-re2-line"><span>Corporate tax</span><strong>+'+money(f.corporateTax)+'</strong></div><div class="omega-re2-line"><span>Export duty</span><strong>+'+money(f.exportDuty)+'</strong></div><div class="omega-re2-line"><span>Budget input this turn</span><strong>+' + money(d.treasury.resourceBudgetContributionThisTurn) + '</strong></div><div class="omega-re2-total"><span>TOTAL</span><strong>+'+money(f.total)+'</strong></div><small>Revenue '+money(d.treasury.revenue)+' · Tax revenue '+money(d.treasury.taxRevenue)+' · Available '+money(d.treasury.available)+' · Reserves '+money(d.treasury.reserves)+'</small></div></div>'+
        '<div class="omega-re2-panel"><header>COMPANY CASH FLOW <span>runtime deltas</span></header><div class="omega-re2-scroll">'+comp+'</div></div>'+
        '<div class="omega-re2-panel"><header>INCREASE / DECREASE <span>this turn</span></header><div class="omega-re2-scroll">'+Object.keys(d.inventory.delta).sort().map(function(k){return'<div class="omega-re2-line"><span>'+esc(k)+'</span><strong>'+sig(d.inventory.delta[k])+'</strong></div>';}).join('')+'</div></div></section>'+
        '<footer>Rules '+esc(d.health.rulesVersion||'UNKNOWN')+' · data authority '+esc(d.health.dataAuthority||'UNKNOWN')+' · legacy balances are preserved and explicitly marked</footer></div>';
    };
    var s=document.createElement('style');s.id='omega-re2-style';s.textContent='.omega-re2{font-family:var(--font-mono,monospace);color:#dce8f0;display:flex;flex-direction:column;gap:10px;padding:2px 2px 28px}.omega-re2-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;background:linear-gradient(135deg,rgba(6,16,29,.98),rgba(15,29,47,.98));border:1px solid rgba(91,213,255,.35);border-radius:12px;padding:14px}.omega-re2-head small{color:#61d7ff;letter-spacing:1.4px;font-size:8px}.omega-re2-head h3{margin:5px 0;font-size:14px;color:#f4f8fb}.omega-re2-head p{margin:0;color:#6f879a;font-size:9px}.omega-re2-head>b{font-size:8px;border:1px solid currentColor;border-radius:999px;padding:6px 8px}.omega-re2-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.omega-re2-kpi>div,.omega-re2-panel{background:rgba(7,17,29,.96);border:1px solid rgba(255,255,255,.07);border-radius:9px}.omega-re2-kpi>div{padding:9px}.omega-re2-kpi small{display:block;color:#6d8497;font-size:7px}.omega-re2-kpi strong{display:block;color:#edf6fa;font-size:17px}.omega-re2-kpi em{font-size:7px;color:#7297ac;font-style:normal}.omega-re2-flow{background:rgba(4,11,21,.97);border:1px solid rgba(165,113,255,.22);border-radius:9px;padding:9px;font-size:8px;color:#c8b1ff}.omega-re2-flow div{margin-top:6px;color:#8ea3b2;line-height:1.8}.omega-re2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.omega-re2-panel{overflow:hidden;min-width:0}.omega-re2-panel.wide{grid-column:1/-1}.omega-re2-panel header{padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.06);font-size:8px;font-weight:800;display:flex;justify-content:space-between}.omega-re2-panel header span{color:#6d8497;font-weight:400}.omega-re2-scroll{max-height:250px;overflow:auto}.omega-re2-row{display:grid;grid-template-columns:2.0fr .8fr 1fr .7fr 1fr 1.25fr 1.1fr;gap:5px;align-items:center;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.04);font-size:8px}.omega-re2-row b{display:block;color:#e9f3f7}.omega-re2-row small,.omega-re2-line small{color:#6a8193;font-size:7px}.omega-re2-line{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.04);font-size:8px}.omega-re2-line strong{color:#cfe8f2}.omega-re2-line em{color:#36d399;font-style:normal}.omega-re2-total{display:flex;justify-content:space-between;padding:9px;font-size:9px;border-top:1px solid rgba(255,213,105,.18)}.omega-re2-total strong{color:#ffd56a}.omega-re2-empty{padding:12px;color:#5f7688;font-size:8px;text-align:center}.omega-re2 footer{color:#5f7688;font-size:7px;padding:2px}@media(max-width:850px){.omega-re2-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}.omega-re2-grid{grid-template-columns:1fr}.omega-re2-panel.wide{grid-column:auto}.omega-re2-row{grid-template-columns:1.5fr .7fr 1fr .7fr 1fr}.omega-re2-row small:last-child{grid-column:1/-1}}';document.head&&document.head.appendChild(s);g.__OmegaResourceEconomyV2UI=true;
  }

  function refreshUI(){
    try{
      if(!g.CountryIOS)return;
      var active=g.CountryIOS.activeChapter;
      if((active===5||active==='5')&&typeof g.CountryIOS.switchChapter==='function')g.CountryIOS.switchChapter(5);
    }catch(_){}
  }

  function boot(){
    installHandlers();installEvents();loadRules();initOntology();
    if(typeof document!=='undefined'&&(document.readyState==='interactive'||document.readyState==='complete'))ui();
    else if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',ui,{once:true});
    if(typeof g.addEventListener==='function'){
      g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',function(){var t=turn();if(g.__OmegaResourceEconomyV2Turn===t)return;g.__OmegaResourceEconomyV2Turn=t;runTurn();});
      g.addEventListener('OMEGA_READY',function(){installHandlers();installEvents();ui();refreshUI();});
      g.addEventListener('OMEGA_GAME_SESSION_STARTED',function(){installHandlers();installEvents();ui();refreshUI();});
      g.addEventListener('RESOURCE_STATE_UPDATED',function(){ui();refreshUI();});
      g.addEventListener('OMEGA_RESOURCE_ECONOMY_UPDATED',function(){ui();refreshUI();});
    }
  }
  function initOntology(){
    if(typeof fetch!=='function')return;
    fetch('./resource_ontology.json',{cache:'no-store'}).then(function(r){return r&&r.ok?r.json():null;}).then(function(d){if(d){g.__OmegaResourceEconomyOntology=d.RUNTIME_RESOURCE_ONTOLOGIES||d.runtime_resource_ontologies||{};g.__OmegaResourceEconomyOntologyLegacy=d.COMMODITY_ONTOLOGIES||d.commodity_ontologies||{};g.__OmegaResourceRuntimeResourceIds=Array.isArray(d.runtimeResourceIds)?d.runtimeResourceIds.slice():Object.keys(g.__OmegaResourceEconomyOntology);}}).catch(function(e){g.__OmegaResourceEconomyOntologyError=String(e&&e.message||e);});
  }

  var API={VERSION:VERSION,diagnostics:diagnostics,getCountryDashboard:dashboard,processCountry:processCountry,runTurn:runTurn,reconcileCountry:function(c){installHandlers();return dispatch('resource','OMEGA_RESOURCE_ECON_RECONCILE_INVENTORY',canonical(c),{correlationId:'MANUAL-RECON-'+turn()+'-'+canonical(c)});},executeCountryFactories:executeFactories};
  g.Omega=g.Omega||{};g.Omega.ResourceEconomy=API;g.OmegaResourceEconomy=API;boot();

})(typeof window!=='undefined'?window:globalThis);