/* OMEGA RESOURCE MAP AUTHORITY v1.0
   Map presentation adapter for authoritative resource occurrences.
   Never aggregates country resources into a single synthetic mine point when
   an occurrence-specific coordinate is available.
*/
(function(g){
  'use strict';

  var VERSION='1.0.0';
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null;}
  function id(v){return String(v==null?'':v).trim().toUpperCase();}
  function tok(v){return String(v==null?'':v).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function clone(v){if(v===null||typeof v!=='object')return v;var o=Array.isArray(v)?[]:{};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);});return o;}
  function activeCountry(){return g.Game&&g.Game.currentActiveCountry||g.CountryIOS&&g.CountryIOS.activeCountry||'BANGLADESH';}
  function canonical(v){
    try{
      var r=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||(g.Omega&&g.Omega.CanonicalIdentity);
      if(r&&typeof r.resolveCountry==='function'){var x=r.resolveCountry(v);if(x&&x.id)return id(x.id);if(x&&x.canonicalId)return id(x.canonicalId);}
    }catch(_){}
    return id(v);
  }
  function countries(){
    var r=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||(g.Omega&&g.Omega.CanonicalIdentity),out=[];
    try{
      if(r&&typeof r.list==='function'){
        var a=r.list('COUNTRY');if(!Array.isArray(a)||!a.length)a=r.list();
        if(Array.isArray(a))a.forEach(function(v){var x=v&&typeof v==='object'?(v.id||v.canonicalId||v.code||v.countryId||v.key):v;x=canonical(x);if(x&&out.indexOf(x)<0)out.push(x);});
      }
    }catch(_){}
    if(!out.length&&g.Game&&g.Game.state&&g.Game.state.resource)Object.keys(g.Game.state.resource).forEach(function(k){var x=canonical(k);if(x&&out.indexOf(x)<0)out.push(x);});
    return out.sort();
  }
  function resourceState(c){return g.Game&&g.Game.state&&g.Game.state.resource&&g.Game.state.resource[canonical(c)]||{};}
  function resolveLocation(c,m){
    var raw=m&&m.rawDeposit||{};
    var lat=num(raw.lat!=null?raw.lat:raw.latitude),lng=num(raw.lng!=null?raw.lng:raw.longitude);
    if(lat!==null&&lng!==null)return{lat:lat,lng:lng,accuracy:'DEPOSIT_COORDINATE',source:'RESOURCE_DEPOSIT_DATA'};
    try{
      var reg=g.__OmegaResourceIdentityRegistry,locKey=m&&m.locationNodeKey,loc=reg&&reg.locations&&typeof reg.locations.get==='function'?reg.locations.get(locKey):null;
      lat=num(loc&&loc.lat);lng=num(loc&&(loc.lng!=null?loc.lng:loc.lon));
      if(lat!==null&&lng!==null){
        var anchorLocation=id(loc&&loc.adminStateProvince)==='PRIMARY_PROVINCE';
        return{lat:lat,lng:lng,accuracy:anchorLocation?'COUNTRY_LEVEL_IDENTITY_ANCHOR':'IDENTITY_LOCATION',source:'PART04_LOCATION_REGISTRY'};
      }
    }catch(_){}
    var engine=g.ResourceMinistryEngine;
    if(engine&&Array.isArray(engine.deposits)){
      var hit=engine.deposits.find(function(d){
        return canonical(d&&d.countryCode||d&&d.country)===canonical(c)&&tok(d&&d.name)===tok(m&&m.depositName);
      });
      lat=num(hit&&hit.lat);lng=num(hit&&(hit.lng!=null?hit.lng:hit.lon));
      if(lat!==null&&lng!==null)return{lat:lat,lng:lng,accuracy:'DEPOSIT_CATALOG_COORDINATE',source:'RESOURCE_MINISTRY_CATALOG'};
    }
    var anchor=null;
    try{
      var lr=g.Game&&g.Game.locationsRegistry&&g.Game.locationsRegistry[canonical(c)];
      anchor=lr&&lr.capital||null;
      if(!anchor&&lr&&Array.isArray(lr.economic)&&lr.economic[0])anchor=lr.economic[0];
      if(!anchor&&lr&&Array.isArray(lr.military)&&lr.military[0])anchor=lr.military[0];
    }catch(_){}
    lat=num(anchor&&anchor.lat);lng=num(anchor&&(anchor.lng!=null?anchor.lng:anchor.lon));
    if(lat===null||lng===null){
      var deps=engine&&Array.isArray(engine.deposits)?engine.deposits:[];
      var first=deps.find(function(d){return canonical(d&&d.countryCode||d&&d.country)===canonical(c);});
      lat=num(first&&first.lat);lng=num(first&&(first.lng!=null?first.lng:first.lon));
    }
    if(lat===null||lng===null)return null;
    var h=0,s=String(m&&m.occurrenceKey||m&&m.depositName||m&&m.resourceId||'MINE');
    for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
    var angle=(h%360)*Math.PI/180;
    var ring=0.18+((h>>>8)%5)*0.07;
    var adjLat=Math.max(-89.8,Math.min(89.8,lat+ring*Math.sin(angle)));
    var cos=Math.max(0.2,Math.abs(Math.cos(lat*Math.PI/180)));
    var adjLng=lng+(ring*Math.cos(angle)/cos)*(lng<0&&lng> -1?1:1);
    while(adjLng>180)adjLng-=360;while(adjLng<-180)adjLng+=360;
    return{lat:adjLat,lng:adjLng,accuracy:'COUNTRY_ANCHOR_SPATIALIZED',source:'COUNTRY_LEVEL_RESOURCE_ANCHOR'};
  }
  function liveStatus(m){
    var rs=m&&m.reserveState||{},o=resourceState(m.countryId).mineOutputs||{},out=o[m.occurrenceKey]||{};
    var s=id(out.status||rs.operationalStatus||m.operationalStatus||'UNKNOWN');
    if(s==='EXHAUSTED_DEPLETED'||s==='EXHAUSTED')return{code:'EXHAUSTED',label:'OUT',rank:0};
    if(s.indexOf('BLOCK')>=0||s==='UNAVAILABLE'||s==='UNKNOWN')return{code:'BLOCKED',label:'BLOCK',rank:1};
    if(s.indexOf('DEPLET')>=0)return{code:'DEPLETING',label:'DEPL',rank:2};
    if(s.indexOf('ACTIVE')>=0||s==='OPERATING'||s==='RUNNING')return{code:'ACTIVE',label:'LIVE',rank:3};
    return{code:s||'UNKNOWN',label:s==='APPROVED'?'LIVE':s.slice(0,5),rank:2};
  }
  function quantityTier(m){
    var rs=m&&m.reserveState||{},geo=num(rs.geologicalQuantity)||0,res=num(rs.residualQuantity);
    if(res===null)return'MEDIUM';
    if(res===0)return'EXHAUSTED';
    if(geo>0){
      var ratio=res/geo;
      if(ratio<0.1)return'LOW';
      if(ratio>0.65)return'MASSIVE';
      if(ratio>0.35)return'HIGH';
    }
    return'MEDIUM';
  }
  function selectedResources(){
    var s=g.Game&&g.Game.Map&&g.Game.Map.resourceState;
    var set=s&&s.selectedResources instanceof Set?s.selectedResources:new Set();
    return set;
  }
  function catalogItem(rid){
    var cat=g.Game&&g.Game.Map&&g.Game.Map.resourceCatalog;
    return Array.isArray(cat)?(cat.find(function(x){return tok(x.id)===tok(rid);})||{id:rid,name:rid,icon:'⛏',color:'#38bdf8'}):{id:rid,name:rid,icon:'⛏',color:'#38bdf8'};
  }
  function collect(){
    var runtime=g.OmegaResourceEndowmentRuntime||g.Omega&&g.Omega.ResourceEndowmentRuntime;
    var out=[];
    if(!runtime||typeof runtime.countryMines!=='function')return out;
    var scope=(g.Game&&g.Game.Map&&g.Game.Map.resourceState&&g.Game.Map.resourceState.scope)||'NATION';
    var cs=scope==='WORLD'?countries():[canonical(activeCountry())];
    cs.forEach(function(c){
      var mines=runtime.countryMines(c)||[];
      mines.forEach(function(m){
        if(!m||!m.occurrenceKey)return;
        var rid=String(m.resourceId||'').toLowerCase().trim(),sel=selectedResources();
        if(sel.size&&!(sel.has(rid)||sel.has('all')))return;
        var loc=resolveLocation(c,m);if(!loc)return;
        var state=resourceState(c),outRow=(state.mineOutputs||{})[m.occurrenceKey]||{};
        out.push(Object.assign({},clone(m),{
          countryId:canonical(c),lat:loc.lat,lng:loc.lng,locationAccuracy:loc.accuracy,locationSource:loc.source,
          liveOutput:num(outRow.producedQuantity)||0,liveStatus:liveStatus(m),tier:quantityTier(m),
          rawReserveText:m.rawDeposit&&(m.rawDeposit.reserves||m.rawDeposit.reserve)||null,
          transport:(Array.isArray(state.transportShipments)?state.transportShipments.find(function(s){return s&&s.batchId&&((state.batches||[]).some(function(b){return b&&b.batchId===s.batchId&&b.occurrenceKey===m.occurrenceKey;}));}):null)
        }));
      });
    });
    return out;
  }
  function makeMarker(dep,index,total,map){
    var item=catalogItem(dep.resourceId),color=item.color||'#38bdf8',status=dep.liveStatus||liveStatus(dep),tier=dep.tier||quantityTier(dep),size=tier==='MASSIVE'?30:tier==='HIGH'?28:26;
    var angle=total>1?(index*(Math.PI*2/total)):0,lat=dep.lat,lng=dep.lng;
    if(total>1&&dep.locationAccuracy!=='DEPOSIT_COORDINATE'&&dep.locationAccuracy!=='IDENTITY_LOCATION'){
      lat=Math.max(-89.8,Math.min(89.8,lat+0.035*Math.sin(angle)));
      lng=lng+(0.035*Math.cos(angle)/Math.max(0.2,Math.abs(Math.cos(lat*Math.PI/180))));
    }
    var statusBg=status.code==='ACTIVE'?'#16a34a':status.code==='DEPLETING'?'#ca8a04':status.code==='EXHAUSTED'?'#dc2626':'#64748b';
    var badge='<span style="position:absolute;right:-5px;top:-5px;background:'+statusBg+';color:#fff;font:800 7px/1 var(--font-mono,monospace);padding:3px 4px;border-radius:7px;border:1px solid #fff;box-shadow:0 0 6px '+statusBg+';">'+status.label+'</span>';
    var tierBadge=tier==='MASSIVE'?'<span style="position:absolute;left:-4px;bottom:-4px;background:#7c3aed;color:#fff;font:800 7px/1 var(--font-mono,monospace);padding:2px 4px;border-radius:5px;border:1px solid rgba(255,255,255,.7);">M</span>':tier==='HIGH'?'<span style="position:absolute;left:-4px;bottom:-4px;background:#a16207;color:#fff;font:800 7px/1 var(--font-mono,monospace);padding:2px 4px;border-radius:5px;border:1px solid rgba(255,255,255,.7);">H</span>':'';
    var rs=dep.reserveState||{},remaining=num(rs.residualQuantity),geo=num(rs.geologicalQuantity),ratio=geo&&remaining!==null?Math.max(0,Math.min(100,remaining/geo*100)):null;
    var popup='<div style="font-family:var(--font-mono,monospace);color:#e5eef5;background:rgba(8,15,26,.98);border:1px solid '+color+';border-radius:9px;padding:9px;width:270px;">'+
      '<div style="font-weight:900;color:'+color+';font-size:12px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:5px;margin-bottom:6px;">'+String(dep.depositName||dep.occurrenceKey)+'</div>'+
      '<div style="font-size:9px;line-height:1.8;">'+
      '<div>COUNTRY: <b>'+dep.countryId+'</b></div><div>RESOURCE: <b>'+String(dep.resourceId||'').toUpperCase()+'</b></div>'+
      '<div>LIVE STATUS: <b style="color:'+statusBg+'">'+status.label+'</b></div>'+
      '<div>RESERVE: <b>'+(remaining===null?'—':remaining.toLocaleString())+'</b> '+String(rs.unit||'')+(ratio===null?'':' ('+ratio.toFixed(1)+'% residual)')+'</div>'+
      '<div>OUTPUT THIS TURN: <b style="color:#22c55e;">+'+(dep.liveOutput||0).toLocaleString()+'</b></div>'+
      '<div>LOCATION: <b>'+dep.locationAccuracy+'</b></div>'+
      (dep.transport?'<div>TRANSPORT: <b>'+String(dep.transport.status||'UNKNOWN')+'</b> · '+String(dep.transport.currentStage||'')+'</div>':'')+
      (dep.rawReserveText?'<div>SOURCE RESERVE: <b>'+String(dep.rawReserveText)+'</b></div>':'')+
      '</div></div>';
    var html='<div title="'+String(dep.depositName||dep.resourceId)+' · '+status.label+'" style="position:relative;background:rgba(7,15,27,.96);border:1.5px solid '+color+';border-radius:50%;width:'+size+'px;height:'+size+'px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 9px '+color+';font-size:11px;cursor:pointer;">'+badge+tierBadge+'<span>'+String(item.icon||'⛏')+'</span></div>';
    var icon=g.L&&g.L.divIcon?g.L.divIcon({html:html,className:'omega-authoritative-resource-icon',iconSize:[size,size],iconAnchor:[Math.round(size/2),Math.round(size/2)]}):null;
    if(!icon||!g.L||!g.L.marker)return null;
    var marker=g.L.marker([lat,lng],{icon:icon});marker.bindPopup(popup,{className:'dark-theme-popup'});return marker;
  }
  function render(){
    var GameObj=g.Game;if(!GameObj||!GameObj.Map||!g.L)return;
    var M=GameObj.Map;M.map=M.map||g.map;if(!M.map)return;
    if(!M.resourceDepositsLayer)M.resourceDepositsLayer=g.L.layerGroup().addTo(M.map);
    M.resourceDepositsLayer.clearLayers();
    if(!M.resourceState||!M.resourceState.enabled||!(M.resourceState.selectedResources&&M.resourceState.selectedResources.size)) {
      var none=g.document&&g.document.getElementById&&g.document.getElementById('resource-summary-count');if(none)none.textContent='0 deposits';return;
    }
    if(M.hubsGroupLayer)M.hubsGroupLayer.clearLayers();
    var deps=collect(),same={};
    deps.forEach(function(d){var k=d.lat.toFixed(3)+'_'+d.lng.toFixed(3);same[k]=(same[k]||0)+1;});
    deps.forEach(function(d,i){var marker=makeMarker(d,i,same[d.lat.toFixed(3)+'_'+d.lng.toFixed(3)],M.map);if(marker)M.resourceDepositsLayer.addLayer(marker);});
    var summary=g.document&&g.document.getElementById&&g.document.getElementById('resource-summary-count');if(summary)summary.textContent=deps.length+' deposit'+(deps.length===1?'':'s');
  }
  function refresh(){
    if(g.__OmegaResourceMapRefreshScheduled)return;
    g.__OmegaResourceMapRefreshScheduled=true;
    var fn=function(){g.__OmegaResourceMapRefreshScheduled=false;try{render();}catch(e){g.__OmegaResourceMapError=String(e&&e.message||e);}};
    if(typeof g.requestAnimationFrame==='function')g.requestAnimationFrame(fn);else setTimeout(fn,0);
  }
  function install(){
    var M=g.Game&&g.Game.Map;if(!M)return false;
    M.renderAuthoritativeResourceDeposits=render;
    if(M.resourceState){
      // Preserve the existing controls while ensuring their final render points at authoritative state.
      M.renderResourceDeposits=render;
    }
    ['RESOURCE_STATE_UPDATED','OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_TRANSPORT_UPDATED','OMEGA_RESOURCE_ECONOMY_UPDATED','OMEGA_READY','OMEGA_GAME_SESSION_STARTED','OMEGA_SIMULATION_TURN_COMMITTED'].forEach(function(type){
      if(!g.__OmegaResourceMapHooks)g.__OmegaResourceMapHooks={};
      if(g.__OmegaResourceMapHooks[type])return;
      g.__OmegaResourceMapHooks[type]=true;
      g.addEventListener?.(type,refresh);
    });
    return true;
  }
  var API=Object.freeze({VERSION:VERSION,collect,render,refresh,install});
  g.Omega=g.Omega||{};g.Omega.ResourceMapAuthority=API;g.OmegaResourceMapAuthority=API;
  try{install();}catch(e){g.OmegaResourceMapAuthorityError=String(e&&e.message||e);}
})(typeof window!=='undefined'?window:globalThis);
