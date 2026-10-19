/* OMEGA Fully Offline World Atlas. Local GeoJSON and locally rendered ocean relief only. */
(function () {
  "use strict";
  if (!window.L || !window.Game || !window.Game.Map || !window.map) {
    console.warn("[OMEGA Offline Atlas] Map runtime is not ready."); return;
  }
  var L=window.L, Game=window.Game, active=false, oceanLayer=null, gridLayer=null,
      coordinateLabels=null, atlasButton=null, offlineBadge=null;
  var GRID_PANE="omegaOfflineGraticulePane", LABEL_PANE="omegaOfflineCoordinateLabelsPane";
  var originalSwitchMapLayer=Game.switchMapLayer, originalRenderGeoJSON=Game.Map.renderGeoJSON,
      originalSelectCountry=Game.selectCountryByName;

  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function sourceName(feature){
    var p=feature&&feature.properties?feature.properties:{}, n=p.ADMIN||p.name||p.NAME||p.NAME_EN||"";
    return /^(west bank|gaza|gaza strip)$/i.test(n)?"Palestine":n;
  }
  function rgb(v){
    var m=/^#?([0-9a-f]{6})$/i.exec(String(v||""));
    return m?[parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)]:[82,100,88];
  }
  function hex(a){return "#"+a.map(function(v){return clamp(Math.round(v),0,255).toString(16).padStart(2,"0");}).join("");}
  function mutedFill(name){
    var config=typeof Game.findCountryConfig==="function"?Game.findCountryConfig(name):null;
    var raw=typeof window.getCountryColor==="function"?window.getCountryColor(config&&config.name?config.name:name):"#536458";
    var base=rgb(raw), tone=[66,83,69];
    return hex(base.map(function(v,i){return v*.74+tone[i]*.26;}));
  }
  function countryStyle(feature){
    return {color:"#9eb5a9",weight:window.map.getZoom()>=8?.82:(window.map.getZoom()>=5?.68:.58),
      opacity:.78,fillColor:mutedFill(sourceName(feature)),fillOpacity:active?.96:.88,
      lineCap:"round",lineJoin:"round",dashArray:null};
  }
  function selectedStyle(){return {color:"#ffe0a0",weight:1.9,opacity:1,fillColor:"#9b8861",fillOpacity:active?.98:.94,dashArray:null};}
  function styleCountries(){
    var countries=Game.geojsonLayer;
    if(!countries||typeof countries.eachLayer!=="function")return;
    countries.eachLayer(function(layer){
      if(active&&layer.feature)layer.setStyle(countryStyle(layer.feature));
      else if(typeof countries.resetStyle==="function")countries.resetStyle(layer);
    });
    if(active&&Game.selectedLayer&&typeof Game.selectedLayer.setStyle==="function")Game.selectedLayer.setStyle(selectedStyle());
  }

  function createOfflineOceanLayer(){
    if(oceanLayer||!L.GridLayer||typeof L.GridLayer.extend!=="function")return oceanLayer;
    var LocalOcean=L.GridLayer.extend({createTile:function(coords,done){
      var size=this.getTileSize(), canvas=document.createElement("canvas");
      canvas.width=size.x;canvas.height=size.y;
      var c=canvas.getContext("2d",{alpha:false});
      if(!c){done(null,canvas);return canvas;}
      var z=clamp(Number(coords.z)||0,0,8), n=Math.pow(2,z);
      if(coords.y<0||coords.y>=n){c.fillStyle="#102e3a";c.fillRect(0,0,size.x,size.y);done(null,canvas);return canvas;}
      var x=((coords.x%n)+n)%n, worldW=size.x*n, worldH=size.y*n, gx=x*size.x, gy=coords.y*size.y;
      var sea=c.createLinearGradient(0,0,size.x,size.y);
      sea.addColorStop(0,"#174653");sea.addColorStop(.48,"#103541");sea.addColorStop(1,"#091f2b");
      c.fillStyle=sea;c.fillRect(0,0,size.x,size.y);
      var glow=c.createRadialGradient(size.x*.24,size.y*.22,2,size.x*.24,size.y*.22,size.x*.92);
      glow.addColorStop(0,"rgba(77,139,137,.18)");glow.addColorStop(1,"rgba(5,22,31,0)");
      c.fillStyle=glow;c.fillRect(0,0,size.x,size.y);
      // Curves use global tile coordinates, so the locally generated bathymetry aligns across tiles.
      c.lineWidth=.7;
      for(var band=0;band<6;band++){
        c.beginPath();var drawing=false;
        for(var px=-2;px<=size.x+2;px+=4){
          var wx=gx+px, nx=wx/Math.max(1,worldW);
          var cy=worldH*(.13+band*.145)+Math.sin(nx*Math.PI*5+band*.82)*worldH*.018+
            Math.sin(wx/73+band*1.6)*Math.max(1,worldH*.003), ly=cy-gy;
          if(ly>=-3&&ly<=size.y+3){if(!drawing){c.moveTo(px,ly);drawing=true;}else c.lineTo(px,ly);}
          else drawing=false;
        }
        c.strokeStyle=band%2===0?"rgba(119,177,177,.15)":"rgba(3,17,27,.20)";c.stroke();
      }
      done(null,canvas);return canvas;
    }});
    oceanLayer=new LocalOcean({tileSize:256,minZoom:0,maxZoom:8,maxNativeZoom:8,noWrap:false,
      opacity:1,zIndex:160,updateWhenIdle:true,keepBuffer:1,attribution:"OMEGA Local Offline Atlas"});
    return oceanLayer;
  }

  function longitudeText(lon){if(lon===0)return "0°";if(Math.abs(lon)===180)return "180°";return Math.abs(lon)+"°"+(lon<0?"W":"E");}
  function latitudeText(lat){if(lat===0)return "0°";return Math.abs(lat)+"°"+(lat<0?"S":"N");}
  function labelIcon(text,axis){
    return L.divIcon({className:"omega-offline-coordinate-icon",
      html:'<span class="omega-offline-coordinate-label omega-coordinate-'+axis+'">'+text+"</span>",
      iconSize:[54,18],iconAnchor:axis==="longitude"?[27,9]:[0,9]});
  }
  function addGridLine(points){gridLayer.addLayer(L.polyline(points,{pane:GRID_PANE,color:"#c0d0c9",opacity:.12,
    weight:.55,dashArray:"2 7",lineCap:"round",interactive:false,smoothFactor:1}));}
  function createGraticule(){
    if(gridLayer||typeof window.map.getPane!=="function"||typeof window.map.createPane!=="function")return;
    if(!window.map.getPane(GRID_PANE)){window.map.createPane(GRID_PANE);window.map.getPane(GRID_PANE).style.zIndex="410";window.map.getPane(GRID_PANE).style.pointerEvents="none";}
    if(!window.map.getPane(LABEL_PANE)){window.map.createPane(LABEL_PANE);window.map.getPane(LABEL_PANE).style.zIndex="625";window.map.getPane(LABEL_PANE).style.pointerEvents="none";}
    gridLayer=L.layerGroup();
    for(var lon=-180;lon<=180;lon+=30){var meridian=[];for(var lat=-60;lat<=84;lat+=3)meridian.push([lat,lon]);addGridLine(meridian);}
    for(var par=-60;par<=75;par+=15){var line=[];for(var lng=-180;lng<=180;lng+=4)line.push([par,lng]);addGridLine(line);}
    coordinateLabels=L.layerGroup();
  }
  function updateCoordinateLabels(){
    if(!active||!coordinateLabels||!window.map)return;
    coordinateLabels.clearLayers();
    var b=window.map.getBounds();if(!b)return;
    var west=Math.max(-180,b.getWest()),east=Math.min(180,b.getEast()),south=Math.max(-60,b.getSouth()),north=Math.min(84,b.getNorth());
    if(east<=west||north<=south)return;
    var labelLat=clamp(north-Math.max(3,(north-south)*.08),south+1,north-1);
    var labelLon=clamp(west+Math.max(3,(east-west)*.04),west+1,east-1);
    for(var lon=Math.ceil(west/30)*30;lon<=east&&lon<=180;lon+=30){
      if(lon<-180)continue;
      coordinateLabels.addLayer(L.marker([labelLat,lon],{pane:LABEL_PANE,icon:labelIcon(longitudeText(lon),"longitude"),interactive:false,keyboard:false}));
    }
    for(var lat=Math.ceil(south/15)*15;lat<=north;lat+=15){
      coordinateLabels.addLayer(L.marker([lat,labelLon],{pane:LABEL_PANE,icon:labelIcon(latitudeText(lat),"latitude"),interactive:false,keyboard:false}));
    }
  }
  function syncOfflineBadge(){
    var mapEl=document.getElementById("map");if(!mapEl)return;
    if(!offlineBadge)offlineBadge=document.getElementById("omega-offline-atlas-badge");
    if(!offlineBadge&&active){
      offlineBadge=document.createElement("div");offlineBadge.id="omega-offline-atlas-badge";
      offlineBadge.className="omega-offline-atlas-badge";offlineBadge.setAttribute("role","status");
      offlineBadge.setAttribute("aria-label","Offline map uses local data and makes no map tile requests");
      var title=document.createElement("span");title.textContent="OFFLINE ATLAS";
      var detail=document.createElement("small");detail.textContent="LOCAL DATA · NO NETWORK TILES";
      offlineBadge.appendChild(title);offlineBadge.appendChild(detail);mapEl.appendChild(offlineBadge);
    }
    if(offlineBadge)offlineBadge.hidden=!active;
  }
  function syncButton(){
    atlasButton=atlasButton||document.querySelector('.layer-opt-btn[data-layer="offline-hybrid"]');if(!atlasButton)return;
    if(active)document.querySelectorAll(".layer-opt-btn").forEach(function(b){if(b!==atlasButton)b.classList.remove("active");});
    atlasButton.classList.toggle("active",active);atlasButton.setAttribute("aria-pressed",String(active));
  }
  function removeRemoteBasemapLayers(){
    [window.currentMapTileLayer,window.satelliteLayer].forEach(function(layer){if(layer&&window.map.hasLayer(layer))window.map.removeLayer(layer);});
    window.currentMapTileLayer=null;
  }
  function isNetworkUnavailable(){
    return window.OMEGA_ANDROID_OFFLINE===true||(typeof navigator!=="undefined"&&navigator.onLine===false);
  }
  function activate(){
    active=true;removeRemoteBasemapLayers();
    var localOcean=createOfflineOceanLayer();
    if(localOcean&&!window.map.hasLayer(localOcean))localOcean.addTo(window.map);
    createGraticule();
    if(gridLayer&&!window.map.hasLayer(gridLayer))gridLayer.addTo(window.map);
    if(coordinateLabels&&!window.map.hasLayer(coordinateLabels))coordinateLabels.addTo(window.map);
    if(document.body)document.body.classList.add("omega-offline-hybrid-active");
    styleCountries();updateCoordinateLabels();syncOfflineBadge();syncButton();
    window.OMEGA_OFFLINE_ATLAS_STATUS={active:true,offlineBasemap:true,remoteImagery:false,externalMapRequests:0,
      offlineRasterCached:false,rasterSource:"Local GeoJSON + locally rendered ocean relief",boundarySource:"Existing OMEGA world.json"};
    if(typeof Game.showNotification==="function")Game.showNotification("OFFLINE WORLD ATLAS",
      "Local country geometry and locally generated ocean relief are active. No external map tiles or first-connection cache are required.","info");
  }
  function deactivate(){
    if(!active)return;active=false;
    [oceanLayer,gridLayer,coordinateLabels].forEach(function(layer){if(layer&&window.map.hasLayer(layer))window.map.removeLayer(layer);});
    if(document.body)document.body.classList.remove("omega-offline-hybrid-active");
    styleCountries();syncOfflineBadge();syncButton();
    window.OMEGA_OFFLINE_ATLAS_STATUS={active:false,offlineBasemap:false,remoteImagery:false,externalMapRequests:0,rasterSource:null};
  }

  window.OmegaOfflineHybridAtlas={activate:activate,deactivate:deactivate,isActive:function(){return active;},
    redraw:updateCoordinateLabels,getStatus:function(){return window.OMEGA_OFFLINE_ATLAS_STATUS||{
      active:active,offlineBasemap:active,remoteImagery:false,externalMapRequests:0};}};
  if(typeof originalRenderGeoJSON==="function")Game.Map.renderGeoJSON=function(){
    var result=originalRenderGeoJSON.apply(this,arguments);if(active){styleCountries();updateCoordinateLabels();}return result;};
  if(typeof originalSelectCountry==="function")Game.selectCountryByName=function(){
    var result=originalSelectCountry.apply(this,arguments);if(active)styleCountries();return result;};
  if(typeof originalSwitchMapLayer==="function")Game.switchMapLayer=function(layerType){
    if(layerType==="offline-hybrid")return activate();
    if(isNetworkUnavailable()&&layerType!=="resources")return activate();
    deactivate();return originalSwitchMapLayer.apply(this,arguments);
  };

  function updateVisibleViewportSize(){
    var v=window.visualViewport,h=v&&v.height?v.height:window.innerHeight,top=v&&Number.isFinite(v.offsetTop)?v.offsetTop:0;
    if(!document.documentElement||!document.documentElement.style)return;
    document.documentElement.style.setProperty("--omega-visible-height",Math.max(180,Math.round(h))+"px");
    document.documentElement.style.setProperty("--omega-visible-offset-top",Math.max(0,Math.round(top))+"px");
  }
  function handleLayerOptionClick(event){
    var target=event.target;if(target&&target.nodeType===3)target=target.parentElement;
    var button=target&&typeof target.closest==="function"?target.closest("#layers-drawer .layer-opt-btn[data-layer]"):null;
    if(!button||button.disabled)return;
    event.preventDefault();event.stopPropagation();if(typeof event.stopImmediatePropagation==="function")event.stopImmediatePropagation();
    var layerType=button.getAttribute("data-layer");
    try{
      if(layerType==="offline-hybrid"){
        if(!window.OmegaOfflineHybridAtlas||typeof window.OmegaOfflineHybridAtlas.activate!=="function")throw new Error("Offline atlas runtime is unavailable.");
        window.OmegaOfflineHybridAtlas.activate();
      }else{
        var switcher=window.Game&&window.Game.switchMapLayer;if(typeof switcher!=="function")throw new Error("Map layer controller is unavailable.");
        switcher.call(window.Game,layerType);
      }
      var activeButton=button;
      if(isNetworkUnavailable()&&layerType!=="resources"&&layerType!=="offline-hybrid")
        activeButton=document.querySelector('#layers-drawer .layer-opt-btn[data-layer="offline-hybrid"]')||button;
      document.querySelectorAll("#layers-drawer .layer-opt-btn").forEach(function(item){
        item.classList.toggle("active",item===activeButton);item.setAttribute("aria-pressed",String(item===activeButton));
      });
    }catch(error){
      console.error("[OMEGA Offline Atlas] Map-layer action failed:",error);
      if(window.Game&&typeof window.Game.showNotification==="function")
        window.Game.showNotification("MAP LAYER ERROR","The selected map layer could not be activated. See the browser console for details.","warning");
    }
  }
  document.addEventListener("click",handleLayerOptionClick,true);updateVisibleViewportSize();
  window.addEventListener("resize",updateVisibleViewportSize,{passive:true});
  window.addEventListener("orientationchange",updateVisibleViewportSize,{passive:true});
  if(window.visualViewport){window.visualViewport.addEventListener("resize",updateVisibleViewportSize,{passive:true});window.visualViewport.addEventListener("scroll",updateVisibleViewportSize,{passive:true});}
  window.map.on("moveend zoomend",updateCoordinateLabels);
  function startOfflineAtlas(){syncButton();activate();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startOfflineAtlas,{once:true});
  else startOfflineAtlas();
})();
