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
    if(remaining>1e-9 && (!sourceNodeId||String(sourceNodeId).toUpperCase().indexOf('STOCKPILE:')===0)){
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


  function txCountryBucket(ctx,domain,create){
    var raw=ctx.stateTransaction.get(domain);
    if(!raw||typeof raw!=='object')raw={};
    return raw;
  }

  function txEnsureNode(ctx,nodeId,type,meta){
    const t=txCountryBucket(ctx,'transport',true),key=String(nodeId||'').trim();
    if(!key)return null;
    const existing=t.nodes&&typeof t.nodes==='object'&&t.nodes[key]&&typeof t.nodes[key]==='object'?t.nodes[key]:{};
    if(!t.nodes||typeof t.nodes!=='object')t.nodes={};
    t.nodes[key]=Object.assign({
      nodeId:key,countryId:cid(ctx.countryId),type:String(type||'STORAGE').toUpperCase(),
      capacity:num(rules().nodeCapacityDefault)||1000000000,usedCapacity:0,active:true,location:null,lastTurn:turn()
    },existing,clone(meta||{}));
    t.nodes[key].countryId=cid(ctx.countryId);t.nodes[key].lastTurn=turn();
    return t.nodes[key];
  }

  function createShipmentHandler(cmd,ctx){
    const p=cmd?.payload||{},sourceCountry=cid(p.sourceCountryId||ctx.countryId),destinationCountry=cid(p.destinationCountryId||p.targetCountryId);
    const rid=String(p.resourceId||'').trim(),qty=num(p.quantity);
    if(sourceCountry!==cid(ctx.countryId))return{accepted:false,reason:'TRANSPORT_COUNTRY_SCOPE_MISMATCH'};
    if(!sourceCountry||!destinationCountry||!rid||qty===null||qty<=0)return{accepted:false,reason:'SHIPMENT_INPUT_INVALID'};
    const t=txCountryBucket(ctx,'transport',true);
    const sourceNodeId=String(p.sourceNodeId||'STOCKPILE:'+sourceCountry),destinationNodeId=String(p.destinationNodeId||'STOCKPILE:'+destinationCountry);
    txEnsureNode(ctx,sourceNodeId,p.sourceNodeType||'STORAGE',p.sourceNodeMeta||{});
    if(sourceCountry===destinationCountry)txEnsureNode(ctx,destinationNodeId,p.destinationNodeType||'STORAGE',p.destinationNodeMeta||{});
    const mode=modeFor(rid,p.purpose,p.mode),spec=rules().modes?.[mode]||rules().modes?.[rules().defaultMode];
    const explicitTurns=num(p.travelTurns),travelTurns=explicitTurns!==null&&explicitTurns>=0?Math.floor(explicitTurns):Math.max(1,Math.floor(num(spec?.defaultTravelTurns)||1));
    const distanceKm=num(p.distanceKm)??(sourceCountry===destinationCountry?50:1000),costPerUnit=num(spec?.costPerUnit)||0;
    if(!t.capacity||typeof t.capacity!=='object')t.capacity={};
    const capKey=routeKey(sourceNodeId,destinationNodeId,mode),used=num(t.capacity[capKey])||0,capacity=num(spec?.capacityPerTurn)||null;
    if(capacity!==null&&used+qty>capacity)return{accepted:false,reason:'ROUTE_CAPACITY_EXCEEDED',capacity,used,requested:qty};
    const reservation=command('resource','OMEGA_RESOURCE_TRANSPORT_RESERVE_CARGO',sourceCountry,{
      resourceId:rid,quantity:qty,sourceNodeId,allowAnySource:p.allowAnySource===true||sourceNodeId.indexOf('ANY:')===0||sourceNodeId.indexOf('MULTI:')===0,
      correlationId:p.correlationId||p.requestId||null
    });
    if(reservation?.status!=='APPLIED'||reservation?.result?.accepted!==true)return{accepted:false,reason:reservation?.result?.reason||'RESOURCE_CARGO_RESERVATION_FAILED',resourceId:rid,quantity:qty};
    const allocation=reservation.result.allocations||[];
    const sequence=(num(t.nextShipmentSequence)||0)+1;t.nextShipmentSequence=sequence;
    const shipmentId=String(p.shipmentId||('RSHIP-'+turn()+'-'+sourceCountry+'-'+String(sequence).padStart(5,'0')+'-'+token(rid))).toUpperCase();
    const shipment={
      shipmentId,resourceId:rid,quantity:qty,remainingQuantity:qty,
      sourceCountryId:sourceCountry,destinationCountryId:destinationCountry,
      sourceNodeId,destinationNodeId,mode,purpose:String(p.purpose||'DOMESTIC').toUpperCase(),
      sourceBatchAllocations:clone(allocation),sourceBatchIds:allocation.map(a=>a.batchId).filter(Boolean),
      travelTurns,totalTravelTurns:travelTurns,distanceKm,costPerUnit,transportCost:qty*costPerUnit,
      unitPrice:num(p.unitPrice),totalValue:num(p.totalValue),buyerValue:num(p.buyerValue),sellerTotal:num(p.sellerTotal),
      fx:num(p.fx),buyerCurrency:p.buyerCurrency||null,sellerCurrency:p.sellerCurrency||null,
      status:'IN_TRANSIT',createdTurn:turn(),departureTurn:turn(),expectedArrivalTurn:turn()+travelTurns,
      targetFacilityId:p.targetFacilityId||null,settlementId:p.settlementId||null,requestId:p.requestId||null,
      correlationId:p.correlationId||p.settlementId||p.requestId||shipmentId,
      provenance:clone(p.provenance||{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME',turn:turn()})
    };
    if(!Array.isArray(t.resourceShipments))t.resourceShipments=[];
    t.resourceShipments.push(shipment);t.capacity[capKey]=used+qty;
    const ledger=Array.isArray(t.ledger)?t.ledger:[];ledger.push({type:'SHIPMENT_CREATED',shipmentId,resourceId:rid,quantity:qty,sourceNodeId,destinationNodeId,mode,purpose:shipment.purpose,status:'IN_TRANSIT',turn:turn()});
    while(ledger.length>(num(rules().maxLedgerEntries)||4096))ledger.shift();
    t.ledger=ledger;
    ctx.stateTransaction.set('transport',t);
    return{accepted:true,shipment:clone(shipment),eventType:'OMEGA_RESOURCE_TRANSPORT_SHIPMENT_CREATED',eventPayload:{shipment:clone(shipment)}};
  }

  function advanceShipmentInTransaction(shipment,ctx,progressed,delivered){
    const p=shipment,source=cid(p.sourceCountryId),dest=cid(p.destinationCountryId),rid=p.resourceId;
    if(p.status!=='IN_TRANSIT')return;
    const next=Math.max(0,(num(p.travelTurns)||0)-1);p.travelTurns=next;
    if(next>0){
      p.estimatedArrivalTurn=turn()+next;progressed.push(clone(p));return;
    }
    const credit=command('resource','OMEGA_RESOURCE_TRANSPORT_CREDIT_DELIVERY',dest,{
      shipmentId:p.shipmentId,resourceId:rid,quantity:p.quantity,sourceCountryId:source,
      sourceBatchIds:p.sourceBatchIds,destinationNodeId:p.destinationNodeId,targetFacilityId:p.targetFacilityId,
      purpose:p.purpose,unit:p.unit,ownerCompanyId:p.ownerCompanyId||'UNKNOWN_SOURCE'
    });
    if(credit?.status!=='APPLIED'||credit?.result?.accepted!==true){
      p.status='DELIVERY_BLOCKED';p.deliveryBlockReason=credit?.result?.reason||'RESOURCE_DELIVERY_CREDIT_FAILED';p.lastAttemptTurn=turn();return;
    }
    const release=command('resource','OMEGA_RESOURCE_TRANSPORT_RELEASE_CARGO',source,{shipmentId:p.shipmentId,resourceId:rid,allocations:p.sourceBatchAllocations,correlationId:p.correlationId});
    if(release?.status!=='APPLIED'||release?.result?.accepted!==true){
      p.status='DELIVERY_BLOCKED';p.deliveryBlockReason=release?.result?.reason||'SOURCE_CARGO_RELEASE_FAILED';p.lastAttemptTurn=turn();return;
    }
    p.status='DELIVERED';p.remainingQuantity=0;p.deliveredTurn=turn();p.transportRevision=(num(p.transportRevision)||0)+1;
    delivered.push(clone(p));
  }

  function advanceCountryHandler(cmd,ctx){
    const t=txCountryBucket(ctx,'transport',true),country=cid(ctx.countryId);
    if(num(t.lastAdvancedTurn)===turn())return{accepted:true,skipped:true,reason:'ALREADY_ADVANCED_THIS_TURN',countryId:country,turn:turn()};
    const rows=Array.isArray(t.resourceShipments)?clone(t.resourceShipments):[],progressed=[],delivered=[];
    for(const shipment of rows)advanceShipmentInTransaction(shipment,ctx,progressed,delivered);
    const byId=new Map(rows.map(x=>[String(x.shipmentId),x]));
    if(progressed.length)progressed.forEach(x=>byId.set(String(x.shipmentId),x));
    if(delivered.length)delivered.forEach(x=>byId.set(String(x.shipmentId),x));
    t.resourceShipments=[...byId.values()];
    if(!t.capacity||typeof t.capacity!=='object')t.capacity={};
    delivered.forEach(p=>{const key=routeKey(p.sourceNodeId,p.destinationNodeId,p.mode);t.capacity[key]=Math.max(0,(num(t.capacity[key])||0)-p.quantity);});
    if(!t.resourceRevenue||typeof t.resourceRevenue!=='object')t.resourceRevenue={totalSinceRuntimeStart:0,thisTurn:0,lastTurn:null};
    if(num(t.resourceRevenue.lastTurn)!==turn())t.resourceRevenue.thisTurn=0;
    delivered.forEach(p=>{t.resourceRevenue.totalSinceRuntimeStart=(num(t.resourceRevenue.totalSinceRuntimeStart)||0)+p.transportCost;t.resourceRevenue.thisTurn=(num(t.resourceRevenue.thisTurn)||0)+p.transportCost;});
    if(delivered.length)t.resourceRevenue.lastTurn=turn();
    t.lastAdvancedTurn=turn();t.runtimeRevision=(num(t.runtimeRevision)||0)+1;
    const ledger=Array.isArray(t.ledger)?t.ledger:[];
    progressed.forEach(p=>ledger.push({type:'SHIPMENT_PROGRESS',shipmentId:p.shipmentId,resourceId:p.resourceId,remainingTurns:p.travelTurns,status:'IN_TRANSIT',turn:turn()}));
    delivered.forEach(p=>ledger.push({type:'SHIPMENT_DELIVERED',shipmentId:p.shipmentId,resourceId:p.resourceId,quantity:p.quantity,status:'DELIVERED',turn:turn(),transportCost:p.transportCost}));
    while(ledger.length>(num(rules().maxLedgerEntries)||4096))ledger.shift();t.ledger=ledger;
    ctx.stateTransaction.set('transport',t);
    return{accepted:true,countryId:country,turn:turn(),progressed,delivered,eventType:'OMEGA_RESOURCE_TRANSPORT_TURN_RESOLVED',eventPayload:{countryId:country,turn:turn(),progressed,delivered}};
  }

  function inboundMirrorHandler(cmd,ctx){
    const p=cmd?.payload||{},shipment=clone(p.shipment||p),destination=cid(ctx.countryId);
    if(destination!==cid(shipment.destinationCountryId))return{accepted:false,reason:'INBOUND_MIRROR_COUNTRY_SCOPE_MISMATCH'};
    const t=txCountryBucket(ctx,'transport',true);
    if(!Array.isArray(t.inboundResourceShipments))t.inboundResourceShipments=[];
    const i=t.inboundResourceShipments.findIndex(x=>String(x.shipmentId)===String(shipment.shipmentId));
    const mirror=Object.assign({},shipment,{remoteMirror:true,mirrorSide:'DESTINATION'});
    if(i<0)t.inboundResourceShipments.push(mirror);else t.inboundResourceShipments[i]=Object.assign({},t.inboundResourceShipments[i],mirror);
    const max=num(rules().maxShipments)||16384;while(t.inboundResourceShipments.length>max)t.inboundResourceShipments.shift();
    ctx.stateTransaction.set('transport',t);return{accepted:true,shipmentId:shipment.shipmentId,status:mirror.status};
  }

  function inboundDeliveredHandler(cmd,ctx){
    const p=cmd?.payload||{},sid=String(p.shipmentId||'').trim(),t=txCountryBucket(ctx,'transport',true);
    const row=t.inboundResourceShipments?.find(x=>String(x.shipmentId)===sid);if(!row)return{accepted:false,reason:'INBOUND_MIRROR_NOT_FOUND'};
    Object.assign(row,clone(p.shipment||{}),{status:'DELIVERED',remoteMirror:true,mirrorSide:'DESTINATION',deliveredTurn:turn(),remainingQuantity:0});
    ctx.stateTransaction.set('transport',t);return{accepted:true,shipmentId:sid,status:'DELIVERED'};
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
    const travelTurns=explicitTurns!==null&&explicitTurns>=0?Math.floor(explicitTurns):Math.max(1,Math.floor(num(spec?.defaultTravelTurns)||1));
    const distanceKm=num(p.distanceKm)??(sourceCountry===destinationCountry?50:1000);
    const costPerUnit=num(spec?.costPerUnit)||0;
    const srcTransport=transportBucket(sourceCountry,true);
    const sequence=(num(srcTransport.nextShipmentSequence)||0)+1;
    srcTransport.nextShipmentSequence=sequence;
    const shipmentId=String(p.shipmentId||('RSHIP-'+turn()+'-'+sourceCountry+'-'+String(sequence).padStart(5,'0')+'-'+token(rid))).toUpperCase();
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
      unitPrice:num(p.unitPrice),totalValue:num(p.totalValue),buyerValue:num(p.buyerValue),sellerTotal:num(p.sellerTotal),
      fx:num(p.fx),buyerCurrency:p.buyerCurrency||null,sellerCurrency:p.sellerCurrency||null,
      status:travelTurns===0?'DELIVERED':'IN_TRANSIT',
      createdTurn:turn(),departureTurn:turn(),expectedArrivalTurn:turn()+travelTurns,
      targetFacilityId:p.targetFacilityId||null,settlementId:p.settlementId||null,requestId:p.requestId||null,
      correlationId:p.correlationId||p.settlementId||p.requestId||shipmentId,
      provenance:clone(p.provenance||{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME',turn:turn()})
    };
    const srcT=srcTransport;
    srcT.resourceShipments.push(clone(shipment));
    if(sourceCountry!==destinationCountry){
      destTransport.inboundResourceShipments=Array.isArray(destTransport.inboundResourceShipments)?destTransport.inboundResourceShipments:[];
      destTransport.inboundResourceShipments.push({...clone(shipment),remoteMirror:true,mirrorSide:'DESTINATION',status:'IN_TRANSIT'});
      const maxInbound=num(rules().maxShipments)||16384;
      while(destTransport.inboundResourceShipments.length>maxInbound)destTransport.inboundResourceShipments.shift();
    }
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
    const inbound=destT.inboundResourceShipments?.find(x=>x.shipmentId===shipment.shipmentId);
    if(inbound){inbound.status='DELIVERED';inbound.remainingQuantity=0;inbound.deliveredTurn=turn();inbound.transportRevision=(num(inbound.transportRevision)||0)+1;}
    srcT.resourceRevenue.totalSinceRuntimeStart=(num(srcT.resourceRevenue.totalSinceRuntimeStart)||0)+shipment.transportCost;
    srcT.resourceRevenue.thisTurn=(num(srcT.resourceRevenue.lastTurn)===turn()?num(srcT.resourceRevenue.thisTurn)||0:0)+shipment.transportCost;
    srcT.resourceRevenue.lastTurn=turn();
    srcT.transportLedger=Array.isArray(srcT.transportLedger)?srcT.transportLedger:[];
    srcT.transportLedger.push({shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,quantity:shipment.quantity,cost:shipment.transportCost,mode:shipment.mode,turn:turn(),purpose:shipment.purpose,status:'DELIVERED'});
    while(srcT.transportLedger.length>(num(rules().maxLedgerEntries)||4096))srcT.transportLedger.shift();
    appendLedger(shipment.sourceCountryId,{type:'SHIPMENT_DELIVERED',shipmentId:shipment.shipmentId,resourceId:shipment.resourceId,quantity:shipment.quantity,sourceNodeId:shipment.sourceNodeId,destinationNodeId:shipment.destinationNodeId,mode:shipment.mode,purpose:shipment.purpose,batchId:result.batch.batchId,transportCost:shipment.transportCost,status:'DELIVERED'});
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
    const country=cid(c),facilities=deriveFacilityNodes(country),rb=resourceBucket(country,true),t=transportBucket(country,true),planned=[];
    for(const f of facilities){
      const inputs=assetInputs(f.asset);if(!inputs.length)continue;
      for(const input of inputs){
        const rid=input.resourceId,facilityAvailable=facilityInventory(country,f.facilityId,rid);
        const capacity=num(f.asset?.capacity??f.asset?.productionCapacity??f.asset?.throughput);
        if(capacity===null||capacity<=0)continue;
        const target=Math.max(0,capacity*input.coefficient);
        const pending=t.resourceShipments.filter(function(x){return x&&x.status==='IN_TRANSIT'&&String(x.targetFacilityId||'')===String(f.facilityId)&&token(x.resourceId)===token(rid);})
          .reduce(function(sum,x){return sum+(num(x.quantity)||0);},0);
        const inbound=(t.inboundResourceShipments||[]).filter(function(x){return x&&x.status==='IN_TRANSIT'&&String(x.targetFacilityId||'')===String(f.facilityId)&&token(x.resourceId)===token(rid);})
          .reduce(function(sum,x){return sum+(num(x.quantity)||0);},0);
        const deficit=Math.max(0,target-facilityAvailable-pending-inbound);if(deficit<=1e-9)continue;
        const allocation=sourceAllocations(country,rid,deficit,null);
        const byNode=new Map();
        for(const a of allocation.allocations){
          const key=String(a.sourceNodeId||('STOCKPILE:'+country));
          if(!byNode.has(key))byNode.set(key,[]);
          byNode.get(key).push(a);
        }
        for(const [sourceNodeId,allocations] of byNode){
          const amount=allocations.reduce(function(sum,x){return sum+x.quantity;},0);
          if(amount<=1e-9)continue;
          const shipment=command('transport','OMEGA_RESOURCE_TRANSPORT_CREATE_SHIPMENT',country,{
            sourceCountryId:country,destinationCountryId:country,resourceId:rid,quantity:amount,
            sourceNodeId,sourceNodeType:String(sourceNodeId).indexOf('MINE:')===0?'MINE':'STORAGE',
            destinationNodeId:'FACILITY:'+f.facilityId,destinationNodeType:/REFINERY/.test(f.stage)?'REFINERY':'FACTORY',
            targetFacilityId:f.facilityId,purpose:'PROCESSING_INPUT',mode:modeFor(rid,'PROCESSING_INPUT'),
            correlationId:'FACILITY-INPUT-'+turn()+'-'+country+'-'+f.facilityId+'-'+token(rid)+'-'+token(sourceNodeId)
          });
          if(shipment.status==='APPLIED'&&shipment.result?.accepted)planned.push(shipment.result.shipment);
        }
        if(allocation.remaining>1e-9){
          emit('OMEGA_RESOURCE_TRANSPORT_HEALTH',country,{status:'DEGRADED',reason:'RESOURCE_INPUT_SOURCE_CAPACITY_INSUFFICIENT',countryId:country,facilityId:f.facilityId,resourceId:rid,requested:deficit,unplanned:allocation.remaining},'resource-transport');
        }
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
    const d=e?.detail||{},p=d.payload||d,records=Array.isArray(p.records)?p.records:[p];
    const country=cid(p.countryId||d.countryId);if(!country)return;
    records.forEach(function(row){
      const produced=row.producedBatch||row.batch||{},rid=String(produced.resourceId||row.resourceId||'').trim(),qty=num(produced.quantity??row.approvedQuantity??row.producedQuantity);
      const mineKey=row.occurrenceKey||produced.occurrenceKey;
      if(!rid||qty===null||qty<=0||!mineKey)return;
      const rb=resourceBucket(country,true),batch=rb.batches.find(x=>String(x.batchId)===String(produced.batchId||row.batchId));
      if(batch){batch.locationNodeId=batch.locationNodeId||('MINE:'+mineKey);batch.occurrenceKey=mineKey;}
      ensureNode(country,'MINE:'+mineKey,'MINE',{occurrenceKey:mineKey,resourceId:rid,name:row.depositName||mineKey,location:row.location||null});
    });
  }

  function onShipmentCreated(e){
    const d=e?.detail||{},p=d.payload||d,shipment=p.shipment||p;
    if(!shipment?.shipmentId||String(shipment.sourceCountryId||'')===String(shipment.destinationCountryId||''))return;
    command('transport','OMEGA_RESOURCE_TRANSPORT_REGISTER_INBOUND_MIRROR',shipment.destinationCountryId,{shipment});
  }

  function onTurn(){
    installHandlers();
    const stateNow=state();
    const cs=[...new Set(Object.keys(stateNow.resource||{}).concat(Object.keys(stateNow.transport||{})).map(cid).filter(Boolean))];
    cs.forEach(function(c){
      try{
        const result=command('transport','OMEGA_RESOURCE_TRANSPORT_ADVANCE_COUNTRY',c,{countryId:c,correlationId:'TRANSPORT-TURN-'+turn()+'-'+c});
        const payload=result?.result?.eventPayload||result?.result||{};
        (payload.progressed||[]).forEach(function(sh){
          if(String(sh.sourceCountryId)!==String(sh.destinationCountryId)){
            command('transport','OMEGA_RESOURCE_TRANSPORT_REGISTER_INBOUND_MIRROR',sh.destinationCountryId,{shipment:sh});
          }
        });
        (payload.delivered||[]).forEach(function(sh){
          if(String(sh.sourceCountryId)!==String(sh.destinationCountryId)){
            command('transport','OMEGA_RESOURCE_TRANSPORT_MARK_INBOUND_DELIVERED',sh.destinationCountryId,{shipment:sh});
          }
          if(sh.settlementId)settleDeliveredTrade(sh);
        });
      }catch(e){emit('OMEGA_RESOURCE_TRANSPORT_HEALTH',c,{status:'DEGRADED',reason:String(e?.message||e),turn:turn()});}
    });
  }

  function installHandlers(){
    const m=interop();
    if(!m?.registerCommandHandler)return false;
    const defs=[
      ['OMEGA_RESOURCE_TRANSPORT_CREATE_SHIPMENT','transport',createShipmentHandler],
      ['OMEGA_RESOURCE_TRANSPORT_ADVANCE_COUNTRY','transport',advanceCountryHandler],
      ['OMEGA_RESOURCE_TRANSPORT_REGISTER_INBOUND_MIRROR','transport',inboundMirrorHandler],
      ['OMEGA_RESOURCE_TRANSPORT_MARK_INBOUND_DELIVERED','transport',inboundDeliveredHandler]
    ];
    try{
      for(const [type,owner,handler] of defs){
        m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_RESOURCE_TRANSPORT_RUNTIME'});
        m.registerCommandHandler(type,owner,(cmd,ctx)=>{
          const p=Object.assign({},cmd?.payload||{},ctx?.countryId?{countryId:ctx.countryId}:{});
          const result=handler({payload:p},ctx);
          return result&&result.accepted===false?result:{accepted:true,result};
        });
      }
      return true;
    }catch(_){return false;}
  }

  function initialize(){
    installHandlers();
    const cs=[...new Set(Object.keys(state().resource||{}).concat(Object.keys(state().transport||{})).map(cid).filter(Boolean))];
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
    global.addEventListener?.('OMEGA_RESOURCE_TRANSPORT_SHIPMENT_CREATED',onShipmentCreated);
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