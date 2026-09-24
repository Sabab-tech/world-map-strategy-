/* OMEGA RESOURCE TRANSPORT RUNTIME v1.0.0
 * Authoritative material logistics:
 * node -> shipment -> in transit -> delivery -> destination batch.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
  const RULES_FALLBACK={
    schemaVersion:'1.0.0',
    defaultMode:'ROAD',
    modes:{
      PIPELINE:{capacityPerTurn:500000,defaultTravelTurns:1,costPerUnit:0.004},
      RAIL:{capacityPerTurn:100000,defaultTravelTurns:1,costPerUnit:0.006},
      ROAD:{capacityPerTurn:50000,defaultTravelTurns:1,costPerUnit:0.01},
      PORT:{capacityPerTurn:250000,defaultTravelTurns:2,costPerUnit:0.008},
      SEA:{capacityPerTurn:500000,defaultTravelTurns:2,costPerUnit:0.003},
      AIR:{capacityPerTurn:5000,defaultTravelTurns:1,costPerUnit:0.08}
    },
    nodeCapacityDefault:1000000000,
    maxShipments:16384,
    maxLedgerEntries:4096,
    sameCountryDefaultMode:'RAIL',
    tradeDefaultMode:'SEA'
  };

  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||[];
    for(let i=0;i<seen.length;i++)if(seen[i][0]===v)return seen[i][1];
    const out=Array.isArray(v)?[]:{};
    seen.push([v,out]);
    Object.keys(v).forEach(k=>{
      if(k==='__proto__'||k==='constructor'||v[k]===undefined||typeof v[k]==='function')return;
      out[k]=clone(v[k],seen);
    });
    return out;
  }
  function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function token(v){return String(v==null?'':v).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function cid(v){
    try{
      const r=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge;
      const x=r?.resolveCountry?.(v);
      if(x?.id)return String(x.id).trim().toUpperCase();
      if(x?.canonicalId)return String(x.canonicalId).trim().toUpperCase();
    }catch(_){}
    return String(v==null?'':v).trim().toUpperCase();
  }
  function state(){return global.Game?.state||global.gameState||{};}
  function turn(){
    const s=state();
    for(const x of [s?.simulation?.turn,s?.turn,s?.simulationTurn]){
      const n=num(x);if(n!==null)return n;
    }
    return 0;
  }
  function interop(){return global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null;}
  function emit(type,c,payload){
    const m=interop(),country=cid(c),detail={eventType:type,countryId:country,payload:clone(payload||{}),simulationTurn:turn()};
    try{m?.emitEvent?.(type,country,'resource-transport',{countryId:country,payload:detail.payload},{turn:turn(),correlationId:payload?.correlationId||payload?.shipmentId||null});}catch(_){}
    try{global.dispatchEvent?.(new global.CustomEvent(type,{detail}));}catch(_){}
  }
  function command(owner,type,c,payload){
    const m=interop();
    if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{return m.dispatchCommand(owner,type,cid(c),payload||{},{turn:turn(),commandType:type,correlationId:payload?.correlationId||payload?.shipmentId||null});}
    catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }
  function countryBucket(domain,c,create){
    const s=state(),root=s[domain];
    if(!root||typeof root!=='object'){
      if(!create)return null;
      s[domain]={};
    }
    const r=s[domain],key=cid(c);
    let b=r[key];
    if(b===undefined){
      const found=Object.keys(r).find(k=>cid(k)===key);
      if(found!==undefined)b=r[found];
    }
    if(b===undefined&&create){b={};r[key]=b;}
    if(b===null||typeof b!=='object')return null;
    return b;
  }
  function resourceBucket(c,create){
    const b=countryBucket('resource',c,create);
    if(b&&create){
      if(!Array.isArray(b.batches))b.batches=[];
      if(!b.inventory||typeof b.inventory!=='object')b.inventory={};
      if(!b.facilityInventory||typeof b.facilityInventory!=='object')b.facilityInventory={};
      if(!b.processingRuntime||typeof b.processingRuntime!=='object')b.processingRuntime={facilities:{},lastTurn:null};
    }
    return b;
  }
  function transportBucket(c,create){
    const b=countryBucket('transport',c,create);
    if(b&&create){
      if(!b.nodes||typeof b.nodes!=='object')b.nodes={};
      if(!b.routes||typeof b.routes!=='object')b.routes={};
      if(!Array.isArray(b.resourceShipments))b.resourceShipments=[];
      if(!Array.isArray(b.ledger))b.ledger=[];
      if(!b.resourceRevenue||typeof b.resourceRevenue!=='object')b.resourceRevenue={totalSinceRuntimeStart:0,thisTurn:0,lastTurn:null};
      if(!b.capacity||typeof b.capacity!=='object')b.capacity={};
      if(!b.runtimeRevision)b.runtimeRevision=0;
    }
    return b;
  }
  function rules(){return global.__OmegaResourceTransportRules||RULES_FALLBACK;}
  function ensureRules(){
    if(global.__OmegaResourceTransportRules)return Promise.resolve(global.__OmegaResourceTransportRules);
    if(typeof fetch!=='function'){global.__OmegaResourceTransportRules=clone(RULES_FALLBACK);return Promise.resolve(global.__OmegaResourceTransportRules);}
    return fetch('./resource_transport_rules.json',{cache:'no-store'}).then(r=>r?.ok?r.json():null).then(d=>{
      const x=Object.assign({},RULES_FALLBACK,d||{});
      x.modes=Object.assign({},RULES_FALLBACK.modes,d?.modes||{});
      global.__OmegaResourceTransportRules=x;
      return x;
    }).catch(()=>{global.__OmegaResourceTransportRules=clone(RULES_FALLBACK);return global.__OmegaResourceTransportRules;});
  }

  function ensureNode(c,nodeId,type,meta){
    if(!nodeId)return null;
    const t=transportBucket(c,true),key=String(nodeId);
    const existing=t.nodes[key]&&typeof t.nodes[key]==='object'?clone(t.nodes[key]):{};
    const n=Object.assign({
      nodeId:key,
      countryId:cid(c),
      type:String(type||'STORAGE').toUpperCase(),
      capacity:num(rules().nodeCapacityDefault)||1000000000,
      usedCapacity:0,
      active:true,
      location:null,
      lastTurn:turn()
    },existing,clone(meta||{}));
    n.countryId=cid(c);n.lastTurn=turn();
    t.nodes[key]=n;t.runtimeRevision++;
    return n;
  }

  function normalizeMode(mode,trade){
    const candidate=String(mode||'').toUpperCase();
    if(rules().modes?.[candidate])return candidate;
    const fallback=trade?rules().tradeDefaultMode:rules().sameCountryDefaultMode;
    return rules().modes?.[fallback]?fallback:rules().defaultMode;
  }

  function modeFor(resourceId,purpose,explicit){
    if(explicit)return normalizeMode(explicit,String(purpose||'').toUpperCase()==='TRADE');
    const r=token(resourceId),p=token(purpose);
    if(/crude_oil|natural_gas|petroleum|condensate|oil/.test(r)&&/refin|process|feedstock|fuel/.test(p))return 'PIPELINE';
    if(/ore|coal|bauxite|copper|iron|nickel|manganese|zinc|tin|titanium|potash/.test(r))return 'RAIL';
    if(/trade|export|import|global/.test(p))return rules().tradeDefaultMode;
    return rules().sameCountryDefaultMode;
  }

  function routeKey(source,dest,mode){return token(source)+'__'+token(dest)+'__'+token(mode);}
  function findBatchRows(batches,rid){
    return (Array.isArray(batches)?batches:[]).map((b,i)=>({b,i})).filter(x=>token(x.b?.resourceId||x.b?.materialIdentity)===token(rid));
  }
  function batchFree(b){
    return Math.max(0,num(b?.remainingQuantity!=null?b.remainingQuantity:b?.quantity)||0);
  }
  function batchLocation(b){
    return String(b?.locationNodeId||b?.nodeId||'STOCKPILE').trim();
  }

  function ensureLegacyInventoryBatch(c,rid){
    const rb=resourceBucket(c,true),stock=num(rb.inventory?.[rid]);
    if(stock===null||stock<=0)return;
    const existing=rb.batches.filter(b=>token(b?.resourceId||b?.materialIdentity)===token(rid))
      .reduce((sum,b)=>sum+batchFree(b)+(num(b.inTransitQuantity)||0),0);
    if(stock<=existing+1e-9)return;
    const q=stock-existing;
    const batchId='LEGACY_OPENING_'+cid(c)+'_'+String(rid).toUpperCase();
    rb.batches.push({
      batchId,resourceId:rid,materialIdentity:rid,quantity:q,remainingQuantity:q,
      stage:'RAW',ownerCountryCode:cid(c),ownerCompanyId:'UNOBSERVED',
      sourceBatchIds:[],locationNodeId:'STOCKPILE:'+cid(c),
      provenance:{source:'LEGACY_OPENING_BALANCE',reason:'TRANSPORT_RECONCILIATION',turn:turn()}
    });
    rb.inventoryLedger=Array.isArray(rb.inventoryLedger)?rb.inventoryLedger:[];
    rb.inventoryLedger.push({type:'LEGACY_OPENING_BATCH_CREATED',resourceId:rid,quantity:q,batchId,turn:turn()});
  }

  function sourceAllocations(c,rid,qty,sourceNodeId){
    const rb=resourceBucket(c,true),rows=findBatchRows(rb.batches,rid);
    let remaining=qty;const allocations=[];
    for(const row of rows){
      if(remaining<=1e-9)break;
      const loc=batchLocation(row.b);
      if(sourceNodeId&&loc!==String(sourceNodeId))continue;
      const free=batchFree(row.b);if(free<=0)continue;
      const take=Math.min(free,remaining);
      allocations.push({batchId:row.b.batchId,quantity:take,sourceNodeId:loc,ownerCompanyId:row.b.ownerCompanyId||'UNKNOWN_SOURCE',stage:row.b.stage||'RAW'});
      remaining-=take;
    }
    if(remaining>1e-9 && (!sourceNodeId||sourceNodeId==='STOCKPILE')){
      for(const row of rows){
        if(remaining<=1e-9)break;
        const free=batchFree(row.b);if(free<=0)continue;
        if(allocations.some(a=>a.batchId===row.b.batchId))continue;
        const take=Math.min(free,remaining);
        allocations.push({batchId:row.b.batchId,quantity:take,sourceNodeId:batchLocation(row.b),ownerCompanyId:row.b.ownerCompanyId||'UNKNOWN_SOURCE',stage:row.b.stage||'RAW'});
        remaining-=take;
      }
    }
    return{allocations,remaining};
  }

  function decrementInventory(c,rid,qty){
    const rb=resourceBucket(c,true),inv=rb.inventory;
    const key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(k=>token(k)===token(rid));
    const stock=key===undefined?null:num(inv[key]);
    if(stock===null||stock<qty)return{ok:false,reason:'RESOURCE_INVENTORY_INSUFFICIENT',available:stock===null?0:stock};
    inv[key]=stock-qty;
    return{ok:true,key};
  }

  function appendLedger(c,row){
    const t=transportBucket(c,true);
    t.ledger.push(Object.assign({turn:turn()},clone(row)));
    const max=num(rules().maxLedgerEntries)||4096;
    while(t.ledger.length>max)t.ledger.shift();
  }

  function createShipment(args){
    const p=args||{},sourceCountry=cid(p.sourceCountryId||p.countryId),destinationCountry=cid(p.destinationCountryId||p.targetCountryId);
    const rid=String(p.resourceId||'').trim(),qty=num(p.quantity);
    if(!sourceCountry||!destinationCountry||!rid||qty===null||qty<=0)return{accepted:false,reason:'SHIPMENT_INPUT_INVALID'};
    const rb=resourceBucket(sourceCountry,true);
    const sourceNodeId=String(p.sourceNodeId||'STOCKPILE:'+sourceCountry);
    const destinationNodeId=String(p.destinationNodeId||'STOCKPILE:'+destinationCountry);
    ensureNode(sourceCountry,sourceNodeId,p.sourceNodeType||'STORAGE',p.sourceNodeMeta||{});
    ensureNode(destinationCountry,destinationNodeId,p.destinationNodeType||'STORAGE',p.destinationNodeMeta||{});
    ensureLegacyInventoryBatch(sourceCountry,rid);
    const allocation=sourceAllocations(sourceCountry,rid,qty,sourceNodeId);
    if(allocation.remaining>1e-9)return{accepted:false,reason:'SOURCE_BATCHES_NOT_LOCATED',resourceId:rid,requested:qty,located:qty-allocation.remaining};
    const invResult=decrementInventory(sourceCountry,rid,qty);
    if(!invResult.ok)return{accepted:false,reason:invResult.reason,available:invResult.available};
    const mode=modeFor(rid,p.purpose,p.mode);
    const spec=rules().modes?.[mode]||rules().modes?.[rules().defaultMode];
    const explicitTurns=num(p.travelTurns);
    const travelTurns=explicitTurns!==null&&explicitTurns>=0?Math.floor(explicitTurns):((sourceCountry===destinationCountry)?0:Math.max(1,Math.floor(num(spec?.defaultTravelTurns)||1)));
    const distanceKm=num(p.distanceKm)??(sourceCountry===destinationCountry?50:1000);
    const costPerUnit=num(spec?.costPerUnit)||0;
    const shipmentId=String(p.shipmentId||('RSHIP-'+turn()+'-'+sourceCountry+'-'+destinationCountry+'-'+token(rid)+'-'+Math.random().toString(36).slice(2,8))).toUpperCase();
    const destTransport=transportBucket(destinationCountry,true);
    const capacity=num(spec?.capacityPerTurn)||null;
    const capKey=routeKey(sourceNodeId,destinationNodeId,mode);
    const used=num(destTransport.capacity[capKey])||0;
    if(capacity!==null && used+qty>capacity && travelTurns>0){
      /* Restore source state before rejecting. */
      rb.inventory[invResult.key]=(num(rb.inventory[invResult.key])||0)+qty;
      return{accepted:false,reason:'ROUTE_CAPACITY_EXCEEDED',capacity,used,requested:qty};
    }
    for(const a of allocation.allocations){
      const b=rb.batches.find(x=>String(x?.batchId)===String(a.batchId));
      if(b){
        b.remainingQuantity=batchFree(b)-a.quantity;
        b.inTransitQuantity=(num(b.inTransitQuantity)||0)+a.quantity;
      }
    }
    destTransport.capacity[capKey]=used+qty;
    const shipment={
      shipmentId,resourceId:rid,quantity:qty,remainingQuantity:qty,
      sourceCountryId:sourceCountry,destinationCountryId:destinationCountry,
      sourceNodeId,destinationNodeId,mode,purpose:String(p.purpose||'DOMESTIC').toUpperCase(),
      sourceBatchAllocations:allocation.allocations,sourceBatchIds:allocation.allocations.map(a=>a.batchId).filter(Boolean),
      travelTurns,totalTravelTurns:travelTurns,distanceKm,costPerUnit,transportCost:qty*costPerUnit,
      status:travelTurns===0?'DELIVERED':'IN_TRANSIT',
      createdTurn:turn(),departureTurn:turn(),expectedArrivalTurn:turn()+travelTurns,
      targetFacilityId:p.targetFacilityId||null,settlementId:p.settlementId||null,requestId:p.requestId||null,
      correlationId:p.correlationId||p.settlementId||p.requestId||shipmentId,
      provenance:clone(p.provenance||{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME',turn:turn()})
    };
    const srcT=transportBucket(sourceCountry,true);
    srcT.resourceShipments.push(clone(shipment));
    appendLedger(sourceCountry,{type:'SHIPMENT_CREATED',shipmentId,resourceId:rid,quantity:qty,sourceNodeId,destinationNodeId,mode,purpose:shipment.purpose,status:shipment.status});
    if(travelTurns===0){
      const delivered=deliverShipment(shipment);
      if(!delivered.accepted){
        /* Delivery is atomic: restore source if zero-turn delivery cannot complete. */
        rb.inventory[invResult.key]=(num(rb.inventory[invResult.key])||0)+qty;
        for(const a of allocation.allocations){
          const b=rb.batches.find(x=>String(x?.batchId)===String(a.batchId));
          if(b){b.remainingQuantity=batchFree(b)+a.quantity;b.inTransitQuantity=Math.max(0,(num(b.inTransitQuantity)||0)-a.quantity);}
        }
        srcT.resourceShipments=srcT.resourceShipments.filter(x=>x.shipmentId!==shipmentId);
        destTransport.capacity[capKey]=Math.max(0,used);
        return delivered;
      }
    }
    emit('OMEGA_RESOURCE_TRANSPORT_SHIPMENT_CREATED',sourceCountry,{shipmentId,resourceId:rid,quantity:qty,sourceCountryId:sourceCountry,destinationCountryId:destinationCountry,sourceNodeId,destinationNodeId,mode,purpose:shipment.purpose,status:shipment.status,targetFacilityId:shipment.targetFacilityId,settlementId:shipment.settlementId,requestId:shipment.requestId});
    return{accepted:true,shipment:clone(shipment)};
  }

  function destinationBucketFor(shipment){
    return resourceBucket(shipment.destinationCountryId,true);
  }

  function creditInventoryWithBatch(shipment){
    const rb=destinationBucketFor(shipment),rid=shipment.resourceId,inv=rb.inventory;
    const key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:(Object.keys(inv).find(k=>token(k)===token(rid))||rid);
    inv[key]=(num(inv[key])||0)+shipment.quantity;
    const stage=shipment.purpose==='PROCESSING_INPUT'?'RAW':'RAW';
    const batch={
      batchId:'TRANSIT-'+shipment.shipmentId,
      resourceId:rid,materialIdentity:rid,
      quantity:shipment.quantity,remainingQuantity:shipment.quantity,unit:shipment.unit||null,
      stage,ownerCountryCode:shipment.destinationCountryId,
      ownerCompanyId:shipment.targetCompanyId||shipment.ownerCompanyId||'UNKNOWN_SOURCE',
      sourceBatchIds:(shipment.sourceBatchAllocations||[]).map(a=>a.batchId).filter(Boolean),
      extractionReference:null,processId:shipment.targetFacilityId||null,
      locationNodeId:shipment.destinationNodeId,
      facilityId:shipment.targetFacilityId||null,
      transportShipmentId:shipment.shipmentId,timestampTurn:turn(),
      provenance:{source:'OMEGA_RESOURCE_TRANSPORT_DELIVERY',shipmentId:shipment.shipmentId,sourceCountryId:shipment.sourceCountryId,turn:turn()}
    };
    rb.batches.push(batch);
    rb.inventoryLedger=Array.isArray(rb.inventoryLedger)?rb.inventoryLedger:[];
    rb.inventoryLedger.push({type:'TRANSPORT_DELIVERY',shipmentId:shipment.shipmentId,resourceId:rid,quantity:shipment.quantity,batchId:batch.batchId,sourceBatchIds:batch.sourceBatchIds,turn:turn()});
    const max=4096;while(rb.inventoryLedger.length>max)rb.inventoryLedger.shift();

    if(shipment.targetFacilityId){
      const fid=String(shipment.targetFacilityId),fi=rb.facilityInventory[fid]&&typeof rb.facilityInventory[fid]==='object'?rb.facilityInventory[fid]:{};
      fi[rid]=(num(fi[rid])||0)+shipment.quantity;rb.facilityInventory[fid]=fi;
    }
    return{batch};
  }

  function releaseSourceAllocations(c,shipment){
    const rb=resourceBucket(c,true);
    for(const a of shipment.sourceBatchAllocations||[]){
      const b=rb.batches.find(x=>String(x?.batchId)===String(a.batchId));
      if(!b)continue;
      b.inTransitQuantity=Math.max(0,(num(b.inTransitQuantity)||0)-a.quantity);
      b.remainingQuantity=Math.max(0,(num(b.remainingQuantity)||0));
    }
  }

  function settleDeliveredTrade(shipment){
    if(!shipment.settlementId||!shipment.requestId)return;
    const c=shipment.destinationCountryId;
    const close=command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:shipment.requestId,status:'SETTLED',stage:'SETTLED',settlementId:shipment.settlementId,correlationId:shipment.correlationId});
    command('trade','OMEGA_TRADE_RECORD_SELLER_SETTLEMENT',shipment.sourceCountryId,{settlementId:shipment.settlementId,requestId:shipment.requestId,buyerCountryId:c,resourceId:shipment.resourceId,quantity:shipment.quantity,unitPrice:shipment.unitPrice,totalValue:shipment.totalValue,buyerValue:shipment.buyerValue,status:'SETTLED',turn:turn(),shipmentId:shipment.shipmentId});
    emit('OMEGA_RESOURCE_TRADE_RECONCILED',shipment.sourceCountryId,{settlementId:shipment.settlementId,shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,quantity:shipment.quantity,status:'SETTLED',deliveryStatus:'DELIVERED'});
    emit('OMEGA_TRADE_SETTLEMENT_COMPLETED',c,{settlementId:shipment.settlementId,requestId:shipment.requestId,targetCountryId:shipment.sourceCountryId,resourceId:shipment.resourceId,quantity:shipment.quantity,totalValue:shipment.totalValue,buyerValue:shipment.buyerValue,shipmentId:shipment.shipmentId,transportStatus:'DELIVERED',closeStatus:close?.status||null});
  }

  function deliverShipment(shipment){
    const dest=destinationBucketFor(shipment);
    const result=creditInventoryWithBatch(shipment);
    releaseSourceAllocations(shipment.sourceCountryId,shipment);
    const srcT=transportBucket(shipment.sourceCountryId,true),destT=transportBucket(shipment.destinationCountryId,true);
    const capKey=routeKey(shipment.sourceNodeId,shipment.destinationNodeId,shipment.mode);
    destT.capacity[capKey]=Math.max(0,(num(destT.capacity[capKey])||0)-shipment.quantity);
    const srow=srcT.resourceShipments.find(x=>x.shipmentId===shipment.shipmentId);
    if(srow){srow.status='DELIVERED';srow.remainingQuantity=0;srow.deliveredTurn=turn();srow.transportRevision=(num(srow.transportRevision)||0)+1;}
    appendLedger(shipment.sourceCountryId,{type:'SHIPMENT_DELIVERED',shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,quantity:shipment.quantity,sourceNodeId:shipment.sourceNodeId,destinationNodeId:shipment.destinationNodeId,mode:shipment.mode,purpose:shipment.purpose,batchId:result.batch.batchId,status:'DELIVERED'});
    emit('OMEGA_RESOURCE_TRANSPORT_DELIVERED',shipment.destinationCountryId,{shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,quantity:shipment.quantity,sourceCountryId:shipment.sourceCountryId,destinationCountryId:shipment.destinationCountryId,destinationNodeId:shipment.destinationNodeId,targetFacilityId:shipment.targetFacilityId,batchId:result.batch.batchId,settlementId:shipment.settlementId,requestId:shipment.requestId});
    if(shipment.settlementId)settleDeliveredTrade(shipment);
    return{accepted:true,shipmentId:shipment.shipmentId,batch:result.batch,status:'DELIVERED'};
  }

  function advanceCountry(c){
    const country=cid(c),t=transportBucket(country,true),arrived=[];
    for(const shipment of t.resourceShipments){
      if(shipment.status!=='IN_TRANSIT')continue;
      const next=Math.max(0,(num(shipment.travelTurns)||0)-1);
      shipment.travelTurns=next;
      if(next<=0){
        const r=deliverShipment(shipment);
        if(r.accepted)arrived.push(r);
      }else{
        shipment.estimatedArrivalTurn=turn()+next;
        appendLedger(country,{type:'SHIPMENT_PROGRESS',shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,remainingTurns:next,status:'IN_TRANSIT'});
        emit('OMEGA_RESOURCE_TRANSPORT_PROGRESS',country,{shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,quantity:shipment.quantity,remainingTurns:next,sourceCountryId:shipment.sourceCountryId,destinationCountryId:shipment.destinationCountryId,targetFacilityId:shipment.targetFacilityId});
      }
    }
    const max=num(rules().maxShipments)||16384;
    if(t.resourceShipments.length>max)t.resourceShipments=t.resourceShipments.slice(-max);
    return{countryId:country,arrived,active:t.resourceShipments.filter(x=>x.status==='IN_TRANSIT').length,total:t.resourceShipments.length};
  }

  function deriveFacilityNodes(c){
    const country=cid(c),eb=countryBucket('economy',country,false),assets=Array.isArray(eb?.productionAssets)?eb.productionAssets:[];
    const nodes=[];
    for(const a of assets){
      const fid=String(a.projectId||a.assetId||a.id||a.siteId||'').trim();if(!fid)continue;
      const nodeId='FACILITY:'+fid;
      const stage=String(a.stage||a.assetStage||a.facilityStage||a.facilityType||a.type||'').toUpperCase();
      ensureNode(country,nodeId,/PROCESS|REFIN|SMELT|DISTILL|CRACK|BENEFICI/.test(stage)?'REFINERY':'FACTORY',{facilityId:fid,name:a.name||fid,stage});
      nodes.push({facilityId:fid,nodeId,asset:a,stage:stage});
    }
    return nodes;
  }

  function assetInputs(asset){
    const raw=asset?.inputCoefficients||asset?.inputs||asset?.inputProfile||{};
    const out=[];
    if(Array.isArray(raw))raw.forEach(x=>{const rid=x?.resourceId||x?.resource||x?.materialId||x?.id,q=num(x?.coefficient??x?.quantity??x?.amount??x?.ratio);if(rid&&q!==null&&q>0)out.push({resourceId:String(rid),coefficient:q});});
    else if(raw&&typeof raw==='object')Object.keys(raw).forEach(rid=>{const x=raw[rid],q=num(x&&typeof x==='object'?(x.coefficient??x.quantity??x.amount??x.ratio):x);if(q!==null&&q>0)out.push({resourceId:String(rid),coefficient:q});});
    if(!out.length){
      const rid=asset?.inputResourceId||asset?.inputResource||asset?.feedstockResourceId||asset?.feedstock;
      if(rid)out.push({resourceId:String(rid),coefficient:1});
    }
    return out;
  }

  function facilityInventory(c,fid,rid){
    const rb=resourceBucket(c,true),fi=rb.facilityInventory[fid]&&typeof rb.facilityInventory[fid]==='object'?rb.facilityInventory[fid]:(rb.facilityInventory[fid]={});
    return num(fi[rid])||0;
  }

  function planFacilityInputs(c){
    const country=cid(c),facilities=deriveFacilityNodes(country),rb=resourceBucket(country,true),planned=[];
    for(const f of facilities){
      const inputs=assetInputs(f.asset);
      if(!inputs.length)continue;
      for(const input of inputs){
        const rid=input.resourceId,available=facilityInventory(country,f.facilityId,rid);
        const needed=num(f.asset?.capacity??f.asset?.productionCapacity??f.asset?.throughput);
        if(needed===null||needed<=0)continue;
        const target=Math.max(0,needed*input.coefficient);
        const deficit=target-available;
        if(deficit<=1e-9)continue;
        const stock=num(rb.inventory[rid])||0;
        if(stock<=0)continue;
        const toMove=Math.min(deficit,stock);
        const shipment=createShipment({
          sourceCountryId:country,destinationCountryId:country,resourceId:rid,quantity:toMove,
          sourceNodeId:'STOCKPILE:'+country,destinationNodeId:'FACILITY:'+f.facilityId,
          targetFacilityId:f.facilityId,purpose:'PROCESSING_INPUT',mode:modeFor(rid,'PROCESSING_INPUT'),
          correlationId:'FACILITY-INPUT-'+turn()+'-'+country+'-'+f.facilityId+'-'+token(rid)
        });
        if(shipment.accepted)planned.push(shipment.shipment);
      }
    }
    return planned;
  }

  function registerMine(c,mine){
    const country=cid(c),key=String(mine?.occurrenceKey||mine?.mineId||mine?.id||'').trim();
    if(!key)return null;
    return ensureNode(country,'MINE:'+key,'MINE',{occurrenceKey:key,resourceId:mine.resourceId||null,name:mine.depositName||mine.name||key,location:{lat:num(mine.lat),lng:num(mine.lng)}});
  }

  function onExtraction(e){
    const d=e?.detail||{},p=d.payload||d,produced=p.producedBatch||p.batch;
    const country=cid(p.countryId||d.countryId),rid=String(produced?.resourceId||p.resourceId||'').trim(),qty=num(produced?.quantity??p.producedQuantity);
    if(!country||!rid||qty===null||qty<=0)return;
    const mineKey=p.occurrenceKey||produced?.occurrenceKey;
    const rb=resourceBucket(country,true),batch=rb.batches.find(x=>String(x.batchId)===String(produced?.batchId));
    if(batch){
      batch.locationNodeId=batch.locationNodeId||('MINE:'+String(mineKey||'UNKNOWN'));
      batch.occurrenceKey=mineKey||batch.occurrenceKey||null;
      return;
    }
    /* Endowment should normally create the batch itself. This is a defensive observer only. */
  }

  function onTurn(){
    installHandlers();
    const cs=Object.keys(state().resource||state().transport||{});
    const list=[...new Set(cs.map(cid).filter(Boolean))];
    list.forEach(c=>{
      try{
        const a=advanceCountry(c);
        if(a.arrived.length)emit('OMEGA_RESOURCE_TRANSPORT_TURN_RESOLVED',c,a);
        planFacilityInputs(c);
      }catch(e){emit('OMEGA_RESOURCE_TRANSPORT_HEALTH',c,{status:'DEGRADED',reason:String(e?.message||e),turn:turn()});}
    });
  }

  function installHandlers(){
    const m=interop();
    if(!m?.registerCommandHandler)return false;
    const defs=[
      ['OMEGA_RESOURCE_TRANSPORT_CREATE_SHIPMENT','transport',(cmd)=>createShipment(cmd?.payload||{})],
      ['OMEGA_RESOURCE_TRANSPORT_ADVANCE_COUNTRY','transport',(cmd)=>advanceCountry(cmd?.payload?.countryId||cmd?.countryId||'')]
    ];
    try{
      for(const [type,owner,handler] of defs){
        m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_RESOURCE_TRANSPORT_RUNTIME'});
        m.registerCommandHandler(type,owner,(cmd,ctx)=>{
          const p=Object.assign({},cmd?.payload||{},ctx?.countryId?{countryId:ctx.countryId}:{});
          const result=handler({payload:p});
          return result&&result.accepted===false?result:{accepted:true,result};
        });
      }
      return true;
    }catch(_){return false;}
  }

  function initialize(){
    installHandlers();
    const cs=[...new Set(Object.keys(state().resource||{}).map(cid).filter(Boolean))];
    cs.forEach(c=>{transportBucket(c,true);deriveFacilityNodes(c);const rb=resourceBucket(c,true);for(const b of rb.batches){if(!b.locationNodeId)b.locationNodeId='STOCKPILE:'+c;}});
    installEvents();
    return diagnostics();
  }

  function diagnostics(){
    const cs=[...new Set(Object.keys(state().resource||{}).concat(Object.keys(state().transport||{})).map(cid).filter(Boolean))],out={version:VERSION,countryCount:cs.length,shipments:0,inTransit:0,delivered:0,healthy:true,countries:{}};
    cs.forEach(c=>{
      const t=transportBucket(c,true);
      const active=t.resourceShipments.filter(x=>x.status==='IN_TRANSIT').length,total=t.resourceShipments.length;
      out.shipments+=total;out.inTransit+=active;out.delivered+=t.resourceShipments.filter(x=>x.status==='DELIVERED').length;
      out.countries[c]={shipments:total,inTransit:active,delivered:t.resourceShipments.filter(x=>x.status==='DELIVERED').length,nodes:Object.keys(t.nodes).length,runtimeRevision:t.runtimeRevision};
    });
    return out;
  }

  let installed=false;
  function installEvents(){
    if(installed)return;
    installed=true;
    global.addEventListener?.('OMEGA_RESOURCE_EXTRACTION_COMPLETED',onExtraction);
    global.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
    global.addEventListener?.('OMEGA_READY',()=>{initialize();});
    global.addEventListener?.('OMEGA_GAME_SESSION_STARTED',()=>{initialize();});
  }

  const API={
    VERSION,
    initialize,
    diagnostics,
    ensureNode,
    registerMine,
    createShipment,
    advanceCountry,
    planFacilityInputs,
    deriveFacilityNodes,
    modeFor,
    getCountryState(c){return clone(transportBucket(c,true));}
  };
  global.Omega=global.Omega||{};
  global.Omega.ResourceTransport=API;
  global.OmegaResourceTransport=API;
  ensureRules().then(initialize).catch(()=>initialize());
})(typeof window!=='undefined'?window:globalThis);