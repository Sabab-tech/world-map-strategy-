/* OMEGA RESOURCE TRANSPORT RUNTIME v1.0
   Authoritative batch logistics:
   MINE -> LOCAL COLLECTION -> REGIONAL LOGISTICS -> PROCESSING FEED
   PROCESSING OUTPUT -> DOMESTIC DISTRIBUTION -> MARKET READY
   TRADE SETTLEMENT -> EXPORT TRANSIT LEDGER
*/
(function(g){
  'use strict';

  var VERSION='1.0.0';
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
    var r=registry(),out=[];
    try{
      if(r&&typeof r.list==='function'){
        var a=r.list('COUNTRY');if(!Array.isArray(a)||!a.length)a=r.list();
        if(Array.isArray(a))a.forEach(function(v){var x=v&&typeof v==='object'?(v.id||v.canonicalId||v.code||v.countryId||v.key):v;x=canonical(x);if(x&&out.indexOf(x)<0)out.push(x);});
      }
    }catch(_){}
    if(!out.length){
      var rs=state().resource||{};Object.keys(rs).forEach(function(k){var x=canonical(k);if(x&&out.indexOf(x)<0)out.push(x);});
    }
    return out.sort();
  }
  function bucket(c,domain){
    var root=state()[domain];if(!root||typeof root!=='object')return null;
    var cid=canonical(c);if(root[cid]&&typeof root[cid]==='object')return root[cid];
    var ks=Object.keys(root);for(var i=0;i<ks.length;i++)if(canonical(ks[i])===cid)return root[ks[i]];
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
    try{if(m&&typeof m.emitEvent==='function')return m.emitEvent(type,cid,source||'resource-transport',{countryId:cid,payload:clone(payload||{})},{turn:turn(),correlationId:payload&&(payload.correlationId||payload.shipmentId||payload.batchId)||null});}catch(_){}
    try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:cid,payload:clone(payload||{}),simulationTurn:turn()}}));}catch(_){}
    return null;
  }

  function resourceState(c){return bucket(c,'resource')||{};}
  function economyState(c){return bucket(c,'economy')||{};}
  function getTransportState(c){
    var root=state().transport;if(!root||typeof root!=='object')return null;
    var cid=canonical(c);var x=root[cid];
    if(x&&typeof x==='object')return x;
    var ks=Object.keys(root);for(var i=0;i<ks.length;i++)if(canonical(ks[i])===cid)return root[ks[i]];
    return null;
  }

  function readObservedCapacity(c,rid){
    var paths=[
      ['transport','resourceRouteCapacity'],
      ['transport','tradeRouteCapacity'],
      ['trade','routeCapacity']
    ];
    for(var i=0;i<paths.length;i++){
      var x=bucket(c,paths[i][0]);if(!x)continue;
      var cap=x[paths[i][1]];
      var ncap=cap&&typeof cap==='object'?num(cap[rid]):num(cap);
      if(ncap!==null&&ncap>0)return{capacity:ncap,source:paths[i][0]+'.'+paths[i][1]};
    }
    var ts=getTransportState(c);
    var lc=ts&&ts.logistics&&ts.logistics.capacityByResource;
    if(lc&&typeof lc==='object'){var z=num(lc[rid]);if(z!==null&&z>0)return{capacity:z,source:'transport.logistics.capacityByResource'};}
    return{capacity:DEFAULT_DOMESTIC_CAPACITY,source:'SIMULATION_DEFAULT_DOMESTIC_CAPACITY'};
  }

  function findDestinationFacility(c,rid){
    var assets=economyState(c).productionAssets;
    if(!Array.isArray(assets))return null;
    for(var i=0;i<assets.length;i++){
      var a=assets[i]||{},inputs=a.inputCoefficients||a.inputs||a.inputProfile||{};
      if(Object.prototype.hasOwnProperty.call(inputs,rid))return{id:String(a.projectId||a.assetId||a.id||a.siteId||('ASSET_'+i)),stage:String(a.stage||a.assetStage||'PROCESSING').toUpperCase()};
      var x=String(a.inputResourceId||a.inputResource||a.feedstockResourceId||a.feedstock||'');
      if(x&&tok(x)===tok(rid))return{id:String(a.projectId||a.assetId||a.id||a.siteId||('ASSET_'+i)),stage:String(a.stage||a.assetStage||'PROCESSING').toUpperCase()};
    }
    return null;
  }

  function isProcessReadyBatch(b){
    if(!b)return false;
    var t=b.transport;
    if(!t)return true;
    var s=id(t.status||'');
    return s==='DELIVERED'||s==='LOCAL_STOCK'||s==='MARKET_READY'||s==='DELIVERED_TO_PROCESSING';
  }

  function totalBatchQuantity(bs,rid,readyOnly){
    var total=0;
    (Array.isArray(bs)?bs:[]).forEach(function(b){
      if(tok(b&&b.resourceId)!==tok(rid))return;
      if(readyOnly&&!isProcessReadyBatch(b))return;
      total+=num(b&&b.remainingQuantity!=null?b.remainingQuantity:b&&b.quantity)||0;
    });
    return total;
  }

  function inventoryAvailableForProcessing(c,rid){
    var rs=resourceState(c),inv=rs.inventory||{},bs=Array.isArray(rs.batches)?rs.batches:[];
    var key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(function(k){return tok(k)===tok(rid);});
    var inventory=num(key==null?undefined:inv[key]);if(inventory===null||inventory<0)inventory=0;
    var totalBatches=totalBatchQuantity(bs,rid,false);
    var legacy=Math.max(0,inventory-totalBatches);
    return totalBatchQuantity(bs,rid,true)+legacy;
  }

  function sellableInventory(c,rid){
    return inventoryAvailableForProcessing(c,rid);
  }

  function makeShipment(c,batch,kind,destination){
    var rs=resourceState(c),shipments=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[];
    var existing=shipments.find(function(s){return s&&s.batchId===batch.batchId&&id(s.kind)===id(kind)&&Number(s.createdTurn)===turn();});
    if(existing)return existing;
    var quantity=num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0;
    if(quantity<=0)return null;
    var capInfo=readObservedCapacity(c,batch.resourceId),cap=capInfo.capacity;
    var deliver=Math.min(quantity,cap);
    var status=deliver>=quantity?'DELIVERED':'IN_TRANSIT';
    var finalStage=destination&&destination.stage==='FACTORY'?'DOMESTIC_DISTRIBUTION':'PROCESSING_FEED';
    var shipment={
      shipmentId:'SHP-'+turn()+'-'+canonical(c)+'-'+String(batch.batchId).replace(/[^A-Z0-9_-]/gi,'')+'-'+shipments.length,
      batchId:batch.batchId,resourceId:batch.resourceId,quantity:quantity,deliveredQuantity:deliver,remainingQuantity:Math.max(0,quantity-deliver),
      kind:kind,status:status,fromStage:kind==='EXTRACTION'?'MINE_SITE':(kind==='PROCESSING_OUTPUT'?'PROCESSING_OUTPUT':'DOMESTIC_STOCK'),
      currentStage:status==='DELIVERED'?finalStage:'LOCAL_COLLECTION',destinationStage:finalStage,destinationFacilityId:destination&&destination.id||null,
      destinationCountryId:canonical(c),routeCapacityObserved:cap,capacitySource:capInfo.source,createdTurn:turn(),updatedTurn:turn(),
      legs:[
        {name:'LOCAL_COLLECTION',status:deliver>0?'COMPLETED':'PENDING'},
        {name:'REGIONAL_LOGISTICS',status:deliver>=quantity?'COMPLETED':'IN_TRANSIT'},
        {name:finalStage,status:status}
      ],
      provenance:{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME_V1',simulationTurn:turn(),batchId:batch.batchId}
    };
    shipments.push(shipment);
    return shipment;
  }

  function updateBatchTransport(c,batch,shipment){
    batch.transport={
      shipmentId:shipment.shipmentId,status:shipment.status,currentStage:shipment.currentStage,destinationStage:shipment.destinationStage,
      destinationFacilityId:shipment.destinationFacilityId,deliveredQuantity:shipment.deliveredQuantity,remainingQuantity:shipment.remainingQuantity,
      updatedTurn:turn(),processingEligible:shipment.status==='DELIVERED'||shipment.status==='LOCAL_STOCK'||shipment.status==='MARKET_READY'
    };
    if(!batch.transport.processingEligible&&shipment.remainingQuantity<=0)batch.transport.processingEligible=true;
    return batch;
  }

  function registerShipmentsForBatches(c,kind,filterFn,destinationFn){
    var rs=resourceState(c),bs=Array.isArray(rs.batches)?clone(rs.batches):[],shipments=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[];
    var changed=false;
    bs.forEach(function(b){
      if(!b||!b.batchId||!filterFn(b))return;
      var attached=shipments.find(function(s){return s&&s.batchId===b.batchId;});
      if(attached)return;
      var destination=destinationFn(b)||null;
      var shipment=makeShipment(c,b,kind,destination);if(!shipment)return;
      shipments.push(shipment);updateBatchTransport(c,b,shipment);changed=true;
    });
    if(!changed)return{accepted:true,changed:false};
    if(shipments.length>MAX_SHIPMENTS)shipments=shipments.slice(-MAX_SHIPMENTS);
    return dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{batches:bs,shipments:shipments,correlationId:'TRANSPORT-'+turn()+'-'+canonical(c)});
  }

  function advance(c){
    var rs=resourceState(c),bs=Array.isArray(rs.batches)?clone(rs.batches):[],shipments=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[];
    var changed=false,capacityLeftByResource={};
    shipments.forEach(function(s){
      if(!s||id(s.status)==='DELIVERED'||id(s.status)==='MARKET_READY')return;
      var capInfo=readObservedCapacity(c,s.resourceId);
      var used=capacityLeftByResource[s.resourceId]||0;
      var availableCap=Math.max(0,(capInfo.capacity===Infinity?Infinity:capInfo.capacity-used));
      var move=Math.min(num(s.remainingQuantity)||0,availableCap);
      if(move>0){
        s.deliveredQuantity=(num(s.deliveredQuantity)||0)+move;s.remainingQuantity=Math.max(0,(num(s.remainingQuantity)||0)-move);
        s.routeCapacityObserved=capInfo.capacity;s.capacitySource=capInfo.source;s.updatedTurn=turn();capacityLeftByResource[s.resourceId]=(used===Infinity||move===Infinity)?Infinity:used+move;changed=true;
      }
      if((num(s.remainingQuantity)||0)<=1e-9){
        s.status='DELIVERED';s.currentStage=s.destinationStage;
        s.legs.forEach(function(l){l.status='COMPLETED';});
      }else{
        s.status='IN_TRANSIT';s.currentStage=s.remainingQuantity===s.quantity?'LOCAL_COLLECTION':'REGIONAL_LOGISTICS';
      }
      bs.forEach(function(b){if(b&&b.batchId===s.batchId){updateBatchTransport(c,b,s);}});
    });
    if(!changed)return{accepted:true,changed:false,shipments:shipments,batches:bs};
    if(shipments.length>MAX_SHIPMENTS)shipments=shipments.slice(-MAX_SHIPMENTS);
    var result=dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{batches:bs,shipments:shipments,correlationId:'TRANSPORT-ADVANCE-'+turn()+'-'+canonical(c)});
    emit('OMEGA_RESOURCE_TRANSPORT_UPDATED',c,{countryId:canonical(c),turn:turn(),shipmentCount:shipments.length},'resource-transport');
    return{accepted:true,changed:true,dispatchResult:result,shipments:shipments,batches:bs};
  }

  function commitHandler(cmd,ctx){
    var p=cmd&&cmd.payload||{},bs=Array.isArray(p.batches)?clone(p.batches):[],shipments=Array.isArray(p.shipments)?clone(p.shipments):[];
    ctx.stateTransaction.set('resource.batches',bs);
    ctx.stateTransaction.set('resource.transportShipments',shipments);
    var status={},active=0,delivered=0,inTransit=0;
    shipments.forEach(function(s){
      status[s.resourceId]=status[s.resourceId]||{shipments:0,deliveredQuantity:0,inTransitQuantity:0};
      status[s.resourceId].shipments+=1;status[s.resourceId].deliveredQuantity+=num(s.deliveredQuantity)||0;status[s.resourceId].inTransitQuantity+=num(s.remainingQuantity)||0;
      if(id(s.status)==='DELIVERED')delivered+=1;else if(id(s.status)==='IN_TRANSIT')inTransit+=1;
    });
    ctx.stateTransaction.set('transport.resourceBatchStatus',status);
    ctx.stateTransaction.set('transport.lastProcessedTurn',turn());
    ctx.stateTransaction.set('transport.runtimeStatus','READY');
    return{accepted:true,shipmentCount:shipments.length,delivered,inTransit,resourceStatus:status};
  }

  function installHandlers(){
    var m=interop();if(!m||typeof m.registerCommandHandler!=='function')return false;
    try{
      m.registerAction&&m.registerAction('OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',{actionId:'OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',stateOwnerMinistry:'transport',authority:'OMEGA_RESOURCE_TRANSPORT_RUNTIME_V1'});
      m.registerCommandHandler('OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE','transport',commitHandler);
      return true;
    }catch(_){return false;}
  }

  function registerExtractionBatch(c,batch){
    if(!batch||!batch.batchId)return{accepted:false,reason:'BATCH_ID_REQUIRED'};
    var rs=resourceState(c),bs=Array.isArray(rs.batches)?clone(rs.batches):[];
    if(!bs.some(function(x){return x&&x.batchId===batch.batchId;}))bs.push(clone(batch));
    var index=bs.findIndex(function(x){return x&&x.batchId===batch.batchId;}),b=bs[index];
    if(!b.transport){
      var dest=findDestinationFacility(c,String(b.resourceId||''));
      var shipment=makeShipment(c,b,'EXTRACTION',dest);
      if(shipment){bs[index]=updateBatchTransport(c,b,shipment);}
    }
    var existing=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[];
    var attached=existing.find(function(s){return s&&s.batchId===b.batchId;});
    if(attached&&b.transport)bs[index]=updateBatchTransport(c,b,attached);
    if(existing.length>MAX_SHIPMENTS)existing=existing.slice(-MAX_SHIPMENTS);
    if(b.transport&&!attached){
      var ship=makeShipment(c,b,'EXTRACTION',findDestinationFacility(c,String(b.resourceId||'')));
      if(ship)existing.push(ship);
    }
    return dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{batches:bs,shipments:existing,correlationId:'TRANSPORT-REGISTER-'+turn()+'-'+b.batchId});
  }

  function prepareCountry(c){
    installHandlers();
    var rs=resourceState(c),bs=Array.isArray(rs.batches)?clone(rs.batches):[],shipments=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[];
    var changed=false;
    bs.forEach(function(b){
      if(!b||!b.batchId||b.remainingQuantity===0)return;
      if(b.transport)return;
      var dest=findDestinationFacility(c,String(b.resourceId||'')),ship=makeShipment(c,b,'BATCH',dest);
      if(ship){b=updateBatchTransport(c,b,ship);var idx=bs.findIndex(function(x){return x&&x.batchId===b.batchId;});if(idx>=0)bs[idx]=b;shipments.push(ship);changed=true;}
    });
    var advanced=advance(c);
    if(changed){
      var cap=dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{batches:bs,shipments:shipments,correlationId:'TRANSPORT-PREPARE-'+turn()+'-'+canonical(c)});
      return{accepted:true,changed:true,advance:advanced,commit:cap};
    }
    return advanced;
  }

  function handleExtraction(e){
    var d=e&&e.detail?e.detail:{},p=d.payload||d,c=canonical(p.countryId||d.countryId);if(!c||!p.producedBatch)return;
    registerExtractionBatch(c,p.producedBatch);
  }
  function handleProcessing(e){
    var d=e&&e.detail?e.detail:{},p=d.payload||d,c=canonical(p.countryId||d.countryId);if(!c)return;
    var rs=resourceState(c),bs=Array.isArray(rs.batches)?clone(rs.batches):[],shipments=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[],changed=false;
    bs.forEach(function(b){
      if(!b||!b.batchId||String(b.timestampTurn)!==String(turn()))return;
      if(!b.transport||id(b.transport.status)!=='DELIVERED')return;
      if(!/^FINISHED|INTERMEDIATE$/i.test(String(b.stage||'')))return;
      if(shipments.some(function(s){return s&&s.batchId===b.batchId;}))return;
      var s=makeShipment(c,b,'PROCESSING_OUTPUT',{id:'DOMESTIC_MARKET',stage:'FACTORY'});if(s){shipments.push(s);b.transport=Object.assign({},b.transport,{shipmentId:s.shipmentId,status:s.status,currentStage:s.currentStage,destinationStage:s.destinationStage,destinationFacilityId:s.destinationFacilityId,processingEligible:true,updatedTurn:turn()});changed=true;}
    });
    if(changed)dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{batches:bs,shipments:shipments,correlationId:'TRANSPORT-PROCESSING-'+turn()+'-'+c});
  }

  function handleTrade(e){
    var d=e&&e.detail?e.detail:{},p=d.payload||d,c=canonical(p.sellerCountryId||p.targetCountryId||p.countryId);if(!c||!p.resourceId)return;
    var qty=num(p.quantity!=null?p.quantity:p.totalQuantity)||0;if(qty<=0)return;
    var idBase='TRADE-'+turn()+'-'+c+'-'+tok(p.resourceId)+'-'+String(p.settlementId||p.requestId||('AUTO-'+qty+'-'+tok(p.resourceId))).replace(/[^A-Z0-9_-]/gi,'');
    var shipment={shipmentId:idBase,batchId:p.batchId||null,resourceId:p.resourceId,quantity:qty,deliveredQuantity:qty,remainingQuantity:0,kind:'TRADE_EXPORT',status:'DELIVERED',fromStage:'EXPORT_CORRIDOR',currentStage:'INTERNATIONAL_TRANSIT',destinationStage:'DESTINATION_COUNTRY',destinationFacilityId:null,destinationCountryId:canonical(p.buyerCountryId||p.countryId||''),createdTurn:turn(),updatedTurn:turn(),legs:[{name:'EXPORT_CORRIDOR',status:'COMPLETED'},{name:'PORT_GATE',status:'COMPLETED'},{name:'INTERNATIONAL_TRANSIT',status:'COMPLETED'},{name:'DESTINATION_COUNTRY',status:'COMPLETED'}],provenance:{source:'OMEGA_RESOURCE_TRANSPORT_RUNTIME_V1',settlementId:p.settlementId||null}};
    var rs=resourceState(c),shipments=Array.isArray(rs.transportShipments)?clone(rs.transportShipments):[];if(!shipments.some(function(s){return s&&s.shipmentId===shipment.shipmentId;})){shipments.push(shipment);if(shipments.length>MAX_SHIPMENTS)shipments=shipments.slice(-MAX_SHIPMENTS);dispatch('transport','OMEGA_RESOURCE_TRANSPORT_COMMIT_STATE',c,{batches:Array.isArray(rs.batches)?rs.batches:[],shipments:shipments,correlationId:shipment.shipmentId});}
  }

  function installEvents(){
    if(g.__OmegaResourceTransportEvents||typeof g.addEventListener!=='function')return;
    g.__OmegaResourceTransportEvents=true;
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',handleExtraction);
    g.addEventListener('OMEGA_RESOURCE_PROCESSING_COMPLETED',handleProcessing);
    g.addEventListener('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',handleProcessing);
    g.addEventListener('OMEGA_TRADE_SETTLEMENT_COMPLETED',handleTrade);
  }

  function diagnostics(){
    var cs=countries(),ship=0,inTransit=0,delivered=0,ready=0;
    cs.forEach(function(c){var rs=resourceState(c),bs=Array.isArray(rs.batches)?rs.batches:[],ss=Array.isArray(rs.transportShipments)?rs.transportShipments:[];ship+=ss.length;ss.forEach(function(s){if(id(s.status)==='DELIVERED')delivered++;if(id(s.status)==='IN_TRANSIT')inTransit++;});bs.forEach(function(b){if(isProcessReadyBatch(b))ready++;});});
    return{version:VERSION,countryCount:cs.length,shipmentCount:ship,deliveredShipments:delivered,inTransitShipments:inTransit,processReadyBatches:ready,handlersReady:!!(interop()&&interop().commandHandlers),runtimeStatus:'READY'};
  }

  function onTurn(){
    installHandlers();installEvents();
    countries().forEach(function(c){try{prepareCountry(c);}catch(e){emit('OMEGA_RESOURCE_TRANSPORT_HEALTH',c,{status:'DEGRADED',reason:String(e&&e.message||e)},'resource-transport');}});
  }

  var API=Object.freeze({
    VERSION:VERSION,diagnostics,countries,prepareCountry,registerExtractionBatch,inventoryAvailableForProcessing,sellableInventory,isProcessReadyBatch,
    getCountryTransportState:function(c){return clone(getTransportState(c));},
    getCountryShipments:function(c){return clone(resourceState(c).transportShipments||[]);}
  });
  g.Omega=g.Omega||{};
  g.Omega.ResourceTransport=API;
  g.OmegaResourceTransport=API;
  try{installHandlers();installEvents();g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);g.addEventListener?.('OMEGA_READY',function(){installHandlers();installEvents();});g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',function(){installHandlers();installEvents();});}catch(e){g.OmegaResourceTransportError=String(e&&e.message||e);}
})(typeof window!=='undefined'?window:globalThis);
