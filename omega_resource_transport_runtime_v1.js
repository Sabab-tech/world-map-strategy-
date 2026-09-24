/* OMEGA RESOURCE TRANSPORT RUNTIME v2.0
   Canonical ownership:
   - resource.* owns physical inventories and batches.
   - transport.* owns shipment/logistics state.
   No transport transaction writes resource.*.
*/
(function(g){
  'use strict';

  var VERSION='2.0.0';
  var MAX_SHIPMENTS=8192;
  var DEFAULT_DOMESTIC_CAPACITY=Infinity;

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
  function turn(){var s=state(),x=num(s&&s.simulation&&s.simulation.turn);if(x!==null)return x;x=num(s&&s.turn);return x===null?0:x;}

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
    var out=new Set();
    try{
      var r=registry(),a=r&&typeof r.list==='function'?(r.list('COUNTRY')||r.list()):[];
      if(Array.isArray(a))a.forEach(function(v){var raw=typeof v==='object'?(v||{}):{id:v};var c=canonical(raw.iso3||raw.isoCode||raw.countryId||raw.id||raw.code||raw.key);if(c)out.add(c);});
    }catch(_){}
    Object.keys(state().resource||{}).forEach(function(k){var c=canonical(k);if(c)out.add(c);});
    Object.keys(state().transport||{}).forEach(function(k){var c=canonical(k);if(c)out.add(c);});
    return[...out].sort();
  }
  function bucket(c,domain){
    var root=state()[domain];if(!root||typeof root!=='object')return null;
    var cid=canonical(c);
    if(root[cid]&&typeof root[cid]==='object')return root[cid];
    var ks=Object.keys(root);
    for(var i=0;i<ks.length;i++)if(canonical(ks[i])===cid)return root[ks[i]];
    return null;
  }
  function interop(){return(g.Omega&&g.Omega.MinistryInteroperability)||g.OmegaMinistryInteroperability||null;}
  function dispatch(owner,type,c,payload){
    var m=interop();if(!m||typeof m.dispatchCommand!=='function')return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{return m.dispatchCommand(owner,type,canonical(c),payload||{},{turn:turn(),commandType:type,correlationId:payload&&(payload.correlationId||payload.shipmentId||payload.batchId)||null});}
    catch(e){return{status:'FAILED',reason:String(e&&e.message||e)};}
  }
  function emit(type,c,payload,source){
    var m=interop(),cid=canonical(c);
    try{if(m&&typeof m.emitEvent==='function')return m.emitEvent(type,cid,source||'transport',{countryId:cid,payload:clone(payload||{})},{turn:turn(),correlationId:payload&&(payload.correlationId||payload.shipmentId||payload.batchId)||null});}catch(_){}
    try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:cid,payload:clone(payload||{}),simulationTurn:turn()}}));}catch(_){}
    return null;
  }

  function resourceState(c){return bucket(c,'resource')||{};}
  function transportState(c){return bucket(c,'transport')||{};}
  function economyState(c){return bucket(c,'economy')||{};}
  function shipmentsForCountry(c){
    var ts=transportState(c),rows=ts&&ts.resourceShipments;
    return Array.isArray(rows)?rows:[];
  }
  function shipmentForBatch(c,batchId){
    var bid=String(batchId||'');if(!bid)return null;
    var ss=shipmentsForCountry(c);
    for(var i=0;i<ss.length;i++)if(ss[i]&&String(ss[i].batchId||'')===bid)return ss[i];
    return null;
  }
  function batchReadyForProcessing(c,batchId){
    var s=shipmentForBatch(c,batchId);
    if(!s)return true;
    return ['DELIVERED','LOCAL_STOCK','MARKET_READY','DELIVERED_TO_PROCESSING'].indexOf(id(s.status))>=0;
  }

  function readPath(c,path){
    var parts=String(path||'').split('.'),cur=bucket(c,parts.shift());
    for(var i=0;i<parts.length;i++){if(cur==null)return undefined;cur=cur[parts[i]];}
    return cur;
  }
  function readObservedCapacity(c,rid){
    var paths=[
      ['transport','resourceRouteCapacity'],
      ['transport','tradeRouteCapacity'],
      ['trade','routeCapacity']
    ];
    for(var i=0;i<paths.length;i++){
      var x=bucket(c,paths[i][0]);if(!x)continue;
      var cap=x[paths[i][1]],v=cap&&typeof cap==='object'?num(cap[rid]):num(cap);
      if(v!==null&&v>0)return{capacity:v,source:paths[i][0]+'.'+paths[i][1]};
    }
    var ts=transportState(c),lc=ts&&ts.logistics&&ts.logistics.capacityByResource;
    if(lc&&typeof lc==='object'){var z=num(lc[rid]);if(z!==null&&z>0)return{capacity:z,source:'transport.logistics.capacityByResource'};}
    return{capacity:DEFAULT_DOMESTIC_CAPACITY,source:'SIMULATION_DEFAULT_DOMESTIC_CAPACITY'};
  }
  function readNetworkMode(c,rid,kind){
    var candidates=[readPath(c,'transport.resourceNetworkMode'),readPath(c,'transport.logisticsMode'),readPath(c,'transport.mode'),readPath(c,'trade.transportMode')];
    for(var i=0;i<candidates.length;i++){
      var x=candidates[i];
      if(x&&typeof x==='object'&&x[rid]!=null)x=x[rid];
      if(typeof x==='string'&&x.trim())return{mode:id(x),source:'OBSERVED_TRANSPORT_STATE'};
    }
    if(kind==='TRADE_EXPORT')return{mode:'INTERNATIONAL_TRANSIT',source:'TRADE_SETTLEMENT'};
    return{mode:'UNSPECIFIED_LOGISTICS',source:'UNOBSERVED_TRANSPORT_MODE'};
  }
  function findDestinationFacility(c,rid){
    var assets=economyState(c).productionAssets;
    if(!Array.isArray(assets))return null;
    for(var i=0;i<assets.length;i++){
      var a=assets[i]||{},inputs=a.inputCoefficients||a.inputs||a.inputProfile||{};
      if(Object.keys(inputs).some(function(k){return tok(k)===tok(rid);}))return{id:String(a.projectId||a.assetId||a.id||a.siteId||('ASSET_'+i)),stage:String(a.stage||a.assetStage||'PROCESSING').toUpperCase()};
      var x=String(a.inputResourceId||a.inputResource||a.feedstockResourceId||a.feedstock||'');
      if(x&&tok(x)===tok(rid))return{id:String(a.projectId||a.assetId||a.id||a.siteId||('ASSET_'+i)),stage:String(a.stage||a.assetStage||'PROCESSING').toUpperCase()};
    }
    return null;
  }
  function batchQuantity(b){return Math.max(0,num(b&&b.remainingQuantity!=null?b.remainingQuantity:b&&b.quantity)||0);}
  function isProcessReadyBatch(b){
    if(!b)return false;
    if(!b.transport)return true;
    return ['DELIVERED','LOCAL_STOCK','MARKET_READY','DELIVERED_TO_PROCESSING'].indexOf(id(b.transport.status))>=0;
  }
  function totalBatchQuantity(bs,rid,readyOnly,c){
    var total=0;
    (Array.isArray(bs)?bs:[]).forEach(function(b){
      if(tok(b&&b.resourceId)!==tok(rid))return;
      if(readyOnly&&c&&!batchReadyForProcessing(c,b.batchId))return;
      if(readyOnly&&!c&&!isProcessReadyBatch(b))return;
      total+=batchQuantity(b);
    });
    return total;
  }
  function inventoryAvailableForProcessing(c,rid){
    var rs=resourceState(c),inv=rs.inventory||{},bs=Array.isArray(rs.batches)?rs.batches:[];
    var key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(function(k){return tok(k)===tok(rid);});
    var inventory=num(key==null?undefined:inv[key]);if(inventory===null||inventory<0)inventory=0;
    var total=totalBatchQuantity(bs,rid,false,c),ready=totalBatchQuantity(bs,rid,true,c),legacy=Math.max(0,inventory-total);
    return ready+legacy;
  }
  function sellableInventory(c,rid){return inventoryAvailableForProcessing(c,rid);}

  function newShipment(c,batch,kind,destination){
    var quantity=batchQuantity(batch);if(quantity<=0)return null;
    var capInfo=readObservedCapacity(c,batch.resourceId),network=readNetworkMode(c,batch.resourceId,kind);
    var finalStage=destination&&destination.stage==='FACTORY'?'DOMESTIC_DISTRIBUTION':'PROCESSING_FEED';
    return{
      shipmentId:'SHP-'+turn()+'-'+canonical(c)+'-'+String(batch.batchId).replace(/[^A-Z0-9_-]/gi,'')+'-'+tok(kind),
      batchId:String(batch.batchId),resourceId:String(batch.resourceId),quantity:quantity,deliveredQuantity:0,remainingQuantity:quantity,
      kind:kind,status:'IN_TRANSIT',fromStage:kind==='EXTRACTION'?'MINE_SITE':(kind==='PROCESSING_OUTPUT'?'PROCESSING_OUTPUT':'DOMESTIC_STOCK'),
      currentStage:'LOCAL_COLLECTION',destinationStage:finalStage,destinationFacilityId:destination&&destination.id||null,destinationCountryId:canonical(c),
      routeCapacityObserved:capInfo.capacity,capacitySource:capInfo.source,networkMode:network.mode,networkModeSource:network.source,
      createdTurn:turn(),updatedTurn:turn(),
      legs:[
        {name:'LOCAL_COLLECTION',status:'PENDING'},
        {name:'REGIONAL_LOGISTICS',status:'PENDING'},
        {name:finalStage,status:'PENDING'}
      ],
      provenance:{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME_V2',simulationTurn:turn(),batchId:String(batch.batchId)}
    };
  }

  function commitShipments(c,shipments){
    var rows=(Array.isArray(shipments)?shipments:[]).slice(-MAX_SHIPMENTS);
    var result=dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{shipments:rows,correlationId:'TRANSPORT-'+turn()+'-'+canonical(c)});
    if(!result||result.status!=='APPLIED')return{status:result&&result.status||'FAILED',reason:result&&result.reason||'TRANSPORT_COMMIT_FAILED'};
    return result;
  }

  function advance(c){
    var shipments=clone(shipmentsForCountry(c)),changed=false,capacityUsed={};
    shipments.forEach(function(s){
      if(!s||['DELIVERED','MARKET_READY'].indexOf(id(s.status))>=0)return;
      var capInfo=readObservedCapacity(c,s.resourceId),used=capacityUsed[tok(s.resourceId)]||0,cap=capInfo.capacity===Infinity?Infinity:Math.max(0,capInfo.capacity-used),move=Math.min(Math.max(0,num(s.remainingQuantity)||0),cap);
      if(move>0){
        s.deliveredQuantity=(num(s.deliveredQuantity)||0)+move;
        s.remainingQuantity=Math.max(0,(num(s.remainingQuantity)||0)-move);
        capacityUsed[tok(s.resourceId)]=(cap===Infinity||move===Infinity)?Infinity:used+move;
        s.routeCapacityObserved=capInfo.capacity;s.capacitySource=capInfo.source;
        s.networkMode=readNetworkMode(c,s.resourceId,s.kind).mode;s.networkModeSource=readNetworkMode(c,s.resourceId,s.kind).source;
        s.updatedTurn=turn();changed=true;
      }
      if(s.remainingQuantity<=1e-9){
        s.status='DELIVERED';s.currentStage=s.destinationStage;s.legs.forEach(function(l){l.status='COMPLETED';});
      }else{
        s.status='IN_TRANSIT';
        if(s.deliveredQuantity>0)s.currentStage='REGIONAL_LOGISTICS';
        else s.currentStage='LOCAL_COLLECTION';
        s.legs[0].status=s.deliveredQuantity>0?'COMPLETED':'IN_TRANSIT';
        s.legs[1].status=s.remainingQuantity>0&&s.deliveredQuantity>0?'IN_TRANSIT':'PENDING';
      }
    });
    if(!changed)return{accepted:true,changed:false,shipments:shipments};
    var committed=commitShipments(c,shipments);
    if(committed.status!=='APPLIED')return{accepted:false,changed:false,reason:committed.reason||'TRANSPORT_COMMIT_FAILED',shipments:shipments};
    emit('OMEGA_RESOURCE_TRANSPORT_UPDATED',c,{countryId:canonical(c),turn:turn(),shipmentCount:shipments.length},'transport');
    return{accepted:true,changed:true,shipments:shipments};
  }

  function ensureBatchShipment(c,batch,kind){
    var existing=shipmentForBatch(c,batch.batchId);
    if(existing)return existing;
    var s=newShipment(c,batch,kind,findDestinationFacility(c,String(batch.resourceId||'')));
    if(!s)return null;
    var rows=clone(shipmentsForCountry(c));rows.push(s);
    var committed=commitShipments(c,rows);
    if(committed.status!=='APPLIED')return null;
    return s;
  }

  function prepareCountry(c){
    installHandlers();
    /* Existing local inventory batches are already at the domestic stock point.
       Only extraction/output/trade flows explicitly register shipments. */
    var advanced=advance(c);
    return{accepted:true,countryId:canonical(c),createdShipments:0,advance:advanced,shipmentCount:shipmentsForCountry(c).length};
  }

  function registerExtractionBatch(c,batch){
    if(!batch||!batch.batchId)return{status:'REJECTED',reason:'BATCH_ID_REQUIRED'};
    var existing=shipmentForBatch(c,batch.batchId);
    if(existing)return{status:'ALREADY_REGISTERED',shipment:clone(existing)};
    var s=ensureBatchShipment(c,batch,'EXTRACTION');
    if(!s)return{status:'FAILED',reason:'TRANSPORT_SHIPMENT_COMMIT_FAILED',batchId:batch.batchId};
    return{status:'APPLIED',shipment:clone(s)};
  }

  function registerOutputBatch(c,batch){
    if(!batch||!batch.batchId)return{status:'REJECTED',reason:'BATCH_ID_REQUIRED'};
    var existing=shipmentForBatch(c,batch.batchId);
    if(existing)return{status:'ALREADY_REGISTERED',shipment:clone(existing)};
    var s=ensureBatchShipment(c,batch,'PROCESSING_OUTPUT');
    return s?{status:'APPLIED',shipment:clone(s)}:{status:'FAILED',reason:'TRANSPORT_SHIPMENT_COMMIT_FAILED'};
  }

  function processOutputEvent(e){
    var d=e&&e.detail?e.detail:{},p=d.payload||d,c=canonical(p.countryId||d.countryId);if(!c)return;
    var outputRows=[];
    if(Array.isArray(p.created))outputRows=outputRows.concat(p.created);
    if(Array.isArray(p.createdBatches))outputRows=outputRows.concat(p.createdBatches);
    else if(p.createdBatches&&typeof p.createdBatches==='object')outputRows.push(p.createdBatches);
    if(p.outputBatch)outputRows.push(p.outputBatch);
    outputRows.forEach(function(b){if(b&&b.batchId)registerOutputBatch(c,b);});
  }

  function handleExtraction(e){
    var d=e&&e.detail?e.detail:{},p=d.payload||d,c=canonical(p.countryId||d.countryId);
    if(!c||!p.producedBatch)return;
    registerExtractionBatch(c,p.producedBatch);
  }

  function handleTrade(e){
    var d=e&&e.detail?e.detail:{},p=d.payload||d,c=canonical(p.sellerCountryId||p.targetCountryId||p.countryId);
    var qty=num(p.quantity!=null?p.quantity:p.totalQuantity)||0;if(!c||!p.resourceId||qty<=0)return;
    var rid=String(p.resourceId),sid=String(p.settlementId||p.requestId||('AUTO-'+qty+'-'+tok(rid)));
    var shipment={
      shipmentId:'TRADE-'+turn()+'-'+c+'-'+tok(rid)+'-'+sid.replace(/[^A-Z0-9_-]/gi,''),
      batchId:p.batchId||null,resourceId:rid,quantity:qty,deliveredQuantity:qty,remainingQuantity:0,kind:'TRADE_EXPORT',status:'DELIVERED',
      fromStage:'EXPORT_CORRIDOR',currentStage:'INTERNATIONAL_TRANSIT',destinationStage:'DESTINATION_COUNTRY',destinationFacilityId:null,
      destinationCountryId:canonical(p.buyerCountryId||p.countryId||''),createdTurn:turn(),updatedTurn:turn(),
      legs:[{name:'EXPORT_CORRIDOR',status:'COMPLETED'},{name:'PORT_GATE',status:'COMPLETED'},{name:'INTERNATIONAL_TRANSIT',status:'COMPLETED'},{name:'DESTINATION_COUNTRY',status:'COMPLETED'}],
      provenance:{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME_V2',settlementId:p.settlementId||null}
    };
    var rows=clone(shipmentsForCountry(c));if(rows.some(function(s){return s&&s.shipmentId===shipment.shipmentId;}))return;
    rows.push(shipment);commitShipments(c,rows);
  }

  function commitHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},shipments=Array.isArray(p.shipments)?clone(p.shipments):[],status={},delivered=0,inTransit=0;
    shipments.forEach(function(s){
      var rid=String(s.resourceId||'');if(!status[rid])status[rid]={shipments:0,deliveredQuantity:0,inTransitQuantity:0};
      status[rid].shipments+=1;status[rid].deliveredQuantity+=num(s.deliveredQuantity)||0;status[rid].inTransitQuantity+=num(s.remainingQuantity)||0;
      if(id(s.status)==='DELIVERED')delivered++;else if(id(s.status)==='IN_TRANSIT')inTransit++;
    });
    ctx.stateTransaction.set('transport.resourceShipments',shipments.slice(-MAX_SHIPMENTS));
    ctx.stateTransaction.set('transport.resourceBatchStatus',status);
    ctx.stateTransaction.set('transport.lastProcessedTurn',turn());
    ctx.stateTransaction.set('transport.runtimeStatus','READY');
    return{accepted:true,shipmentCount:shipments.length,delivered:delivered,inTransit:inTransit,resourceStatus:status};
  }

  function installHandlers(){
    var m=interop();if(!m||typeof m.registerCommandHandler!=='function')return false;
    try{
      try{m.registerAction&&m.registerAction('OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',{actionId:'OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',stateOwnerMinistry:'transport',authority:'OMEGA_RESOURCE_TRANSPORT_RUNTIME_V2'});}catch(_){}
      m.registerCommandHandler('OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE','transport',commitHandler);
      return true;
    }catch(_){return false;}
  }

  function installEvents(){
    if(g.__OmegaResourceTransportEventsV2||typeof g.addEventListener!=='function')return;
    g.__OmegaResourceTransportEventsV2=true;
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',handleExtraction);
    g.addEventListener('OMEGA_RESOURCE_PROCESSING_COMPLETED',processOutputEvent);
    g.addEventListener('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',processOutputEvent);
    g.addEventListener('OMEGA_TRADE_SETTLEMENT_COMPLETED',handleTrade);
  }

  function diagnostics(){
    var cs=countries(),ship=0,delivered=0,inTransit=0,ready=0;
    cs.forEach(function(c){
      var bs=Array.isArray(resourceState(c).batches)?resourceState(c).batches:[],ss=shipmentsForCountry(c);
      ship+=ss.length;
      ss.forEach(function(s){if(id(s.status)==='DELIVERED')delivered++;if(id(s.status)==='IN_TRANSIT')inTransit++;});
      bs.forEach(function(b){if(batchReadyForProcessing(c,b.batchId))ready++;});
    });
    return{version:VERSION,countryCount:cs.length,shipmentCount:ship,deliveredShipments:delivered,inTransitShipments:inTransit,processReadyBatches:ready,handlersReady:installHandlers(),runtimeStatus:'READY'};
  }

  function onTurn(){installHandlers();installEvents();countries().forEach(function(c){try{prepareCountry(c);}catch(e){emit('OMEGA_RESOURCE_TRANSPORT_HEALTH',c,{status:'DEGRADED',reason:String(e&&e.message||e)},'transport');}});}

  var API=Object.freeze({
    VERSION:VERSION,
    diagnostics:diagnostics,
    countries:countries,
    prepareCountry:prepareCountry,
    registerExtractionBatch:registerExtractionBatch,
    registerOutputBatch:registerOutputBatch,
    inventoryAvailableForProcessing:inventoryAvailableForProcessing,
    sellableInventory:sellableInventory,
    isProcessReadyBatch:isProcessReadyBatch,
    isBatchProcessReady:batchReadyForProcessing,
    getCountryTransportState:function(c){return clone(transportState(c));},
    getCountryShipments:function(c){return clone(shipmentsForCountry(c));}
  });

  g.Omega=g.Omega||{};
  g.Omega.ResourceTransport=API;
  g.OmegaResourceTransport=API;

  try{
    installHandlers();installEvents();
    g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
    g.addEventListener?.('OMEGA_READY',function(){installHandlers();installEvents();});
    g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',function(){installHandlers();installEvents();});
  }catch(e){g.OmegaResourceTransportError=String(e&&e.message||e);}
})(typeof window!=='undefined'?window:globalThis);
