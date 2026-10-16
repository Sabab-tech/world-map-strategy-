/* OMEGA Geographic Region System v1
 * Canonical region metadata lives in countries.json; world.json supplies ISO-keyed polygons.
 * Ocean highlights use world_oceans_v1.json.
 */
(function (global) {
  "use strict";
  if (global.OMEGAGeographicRegionSystem) return;
  const continentColors = {
    "Africa": "#ffb454",
    "Antarctica": "#b6e8ff",
    "Asia": "#ff5f7e",
    "Europe": "#79dfb0",
    "North America": "#58a6ff",
    "Oceania": "#bd9cff",
    "South America": "#ff9966"
  };
  const oceanColors = {
    ARCTIC: "#80e6ff",
    ATLANTIC: "#4da6ff",
    INDIAN: "#49e0cb",
    PACIFIC: "#7798ff",
    SOUTHERN: "#a4f0e5"
  };
  const state = {
    countries: [], by2: new Map(), by3: new Map(), byName: new Map(),
    oceans: null, mapLayer: null, oceanLayer: null, control: null,
    selected: null, pendingGeoData: null, initialized: false, ready: false
  };
  const continentOrder = ["Africa","Antarctica","Asia","Europe","North America","Oceania","South America"];
  const oceanOrder = [
    ["ARCTIC","Arctic Ocean"],["ATLANTIC","Atlantic Ocean"],["INDIAN","Indian Ocean"],
    ["PACIFIC","Pacific Ocean"],["SOUTHERN","Southern Ocean"]
  ];
  function normalize(value) {
    return String(value == null ? "" : value).normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
      .toUpperCase().replace(/&/g," AND ").replace(/[^A-Z0-9]+/g," ").trim();
  }
  function indexCountries(rows) {
    state.countries = Array.isArray(rows) ? rows : [];
    state.by2 = new Map(); state.by3 = new Map(); state.byName = new Map();
    state.countries.forEach(function (row) {
      if (row.code) state.by2.set(String(row.code).toUpperCase(), row);
      if (row.iso2) state.by2.set(String(row.iso2).toUpperCase(), row);
      if (row.iso3) state.by3.set(String(row.iso3).toUpperCase(), row);
      [row.name].concat(Array.isArray(row.aliases) ? row.aliases : []).forEach(function (name) {
        if (name) state.byName.set(normalize(name), row);
      });
    });
  }
  function rowForFeature(feature) {
    const p = feature && feature.properties || {};
    const code3 = String(p.ISO_A3 || p.iso_a3 || p.iso3 || feature && feature.id || "").toUpperCase();
    const code2 = String(p.ISO_A2 || p.iso_a2 || p.iso2 || "").toUpperCase();
    return state.by3.get(code3) || state.by2.get(code2) ||
      state.byName.get(normalize(p.ADMIN || p.name || p.NAME || ""));
  }
  function enrichFeatureCollection(collection) {
    if (!collection || !Array.isArray(collection.features)) return collection;
    collection.features.forEach(function (feature) {
      const row = rowForFeature(feature);
      if (!row) return;
      feature.properties = feature.properties || {};
      const p = feature.properties;
      p.ADMIN = row.name;
      p.ISO_A2 = row.code; p.iso_a2 = row.code;
      p.ISO_A3 = row.iso3; p.iso_a3 = row.iso3;
      p.ISO_N3 = row.numericCode; p.iso_n3 = row.numericCode;
    });
    return collection;
  }
  function mapInstance() {
    return global.Game && global.Game.Map && global.Game.Map.map || global.map || null;
  }
  function safeText(element, value) { element.textContent = String(value == null ? "" : value); }
  function activeMembers() {
    if (!state.selected) return [];
    if (state.selected.kind === "continent") {
      return state.countries.filter(function (c) { return Array.isArray(c.continents) && c.continents.includes(state.selected.key); });
    }
    return state.countries.filter(function (c) { return Array.isArray(c.oceanAccess) && c.oceanAccess.includes(state.selected.key); });
  }
  function featureMember(feature, memberCodes) {
    const row = rowForFeature(feature);
    if (row) return memberCodes.has(row.iso3);
    const p = feature && feature.properties || {};
    const name = normalize(p.ADMIN || p.name || p.NAME || "");
    // Preserve the existing Kosovo boundary as a map-only European entity without inventing an ISO row.
    return state.selected && state.selected.kind === "continent" &&
      state.selected.key === "Europe" && name === "KOSOVO";
  }
  function resetMainStyles() {
    const layer = state.mapLayer || global.Game && global.Game.geojsonLayer;
    if (!layer || typeof layer.eachLayer !== "function") return;
    layer.eachLayer(function (child) {
      if (typeof layer.resetStyle === "function") layer.resetStyle(child);
    });
  }
  function applyOceanStyle() {
    if (!state.oceanLayer || typeof state.oceanLayer.setStyle !== "function") return;
    state.oceanLayer.setStyle(function (feature) {
      const selected = state.selected && state.selected.kind === "ocean" &&
        feature.properties && feature.properties.oceanId === state.selected.key;
      const color = selected ? oceanColors[state.selected.key] : "transparent";
      return { color: color, weight: selected ? 1.25 : 0, opacity: selected ? 0.95 : 0,
        fillColor: color, fillOpacity: selected ? 0.34 : 0 };
    });
  }
  function applySelectionStyles() {
    const layer = state.mapLayer || global.Game && global.Game.geojsonLayer;
    if (!layer || typeof layer.eachLayer !== "function") return;
    if (!state.selected) {
      resetMainStyles();
      applyOceanStyle();
      return;
    }
    const memberRows = activeMembers();
    const memberCodes = new Set(memberRows.map(function (c) { return c.iso3; }));
    const targetColor = state.selected.kind === "continent" ?
      continentColors[state.selected.key] : oceanColors[state.selected.key];
    layer.eachLayer(function (child) {
      const member = featureMember(child.feature, memberCodes);
      child.setStyle(member ? {
        color: "#eaf8ff", weight: 1.55, opacity: 1,
        fillColor: targetColor, fillOpacity: 0.63
      } : {
        color: "rgba(188,209,220,.45)", weight: 0.55, opacity: 0.65,
        fillColor: "#172a33", fillOpacity: 0.09
      });
    });
    applyOceanStyle();
  }
  function zoomToCountry(row) {
    const map = mapInstance(), layer = state.mapLayer || global.Game && global.Game.geojsonLayer;
    if (!map || !layer || typeof layer.eachLayer !== "function") return;
    let found = null;
    layer.eachLayer(function (child) {
      const candidate = rowForFeature(child.feature);
      if (candidate && candidate.iso3 === row.iso3) found = child;
    });
    if (!found) return;
    const bounds = found.getBounds && found.getBounds();
    if (bounds && bounds.isValid && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24,24], maxZoom: 7, animate: false });
    } else if (Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
      map.setView([row.lat,row.lng], 6, { animate: false });
    }
  }
  function renderList(list, summary, count, rows) {
    while (list.firstChild) list.removeChild(list.firstChild);
    safeText(count, rows.length + (rows.length === 1 ? " entry" : " entries"));
    if (!state.selected) {
      const empty = document.createElement("div");
      empty.className = "omega-region-empty";
      safeText(empty, "Select a continent or ocean to highlight its area and list its countries.");
      list.appendChild(empty);
      safeText(summary, "All geographic layers");
      return;
    }
    safeText(summary, state.selected.label);
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "omega-region-empty";
      safeText(empty, "No country/area records are assigned to this region.");
      list.appendChild(empty);
      return;
    }
    rows.slice().sort(function (a,b) { return a.name.localeCompare(b.name); }).forEach(function (row) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "omega-region-item";
      button.title = "Zoom to " + row.name;
      safeText(button, row.name);
      button.addEventListener("click", function (event) {
        if (event && event.stopPropagation) event.stopPropagation();
        zoomToCountry(row);
      });
      list.appendChild(button);
    });
  }
  function setSelection(value) {
    if (!value) {
      state.selected = null;
      if (state.control) {
        state.control.select.value = "";
        renderList(state.control.list,state.control.summary,state.control.count,[]);
      }
      applySelectionStyles();
      return true;
    }
    const parts = String(value).split(":");
    const kind=parts[0], key=parts.slice(1).join(":");
    let label="";
    if (kind === "continent" && continentOrder.includes(key)) label=key;
    else if (kind === "ocean") {
      const found=oceanOrder.find(function (o) { return o[0]===key; });
      if(found) label=found[1];
    }
    if (!label) return false;
    state.selected={kind:kind,key:key,label:label};
    const rows=activeMembers();
    if (state.control) state.control.select.value = kind + ":" + key;
    applySelectionStyles();
    if (state.control) renderList(state.control.list,state.control.summary,state.control.count,rows);
    return true;
  }
  function createControl() {
    const root = document.getElementById("omega-geographic-region-selector");
    const select = document.getElementById("omega-region-select");
    const summary = document.getElementById("omega-region-summary");
    const count = document.getElementById("omega-region-count");
    const list = document.getElementById("omega-region-country-list");
    if (!root || !select || !summary || !count || !list) {
      if (global.console && console.warn) {
        console.warn("[OMEGA geography] Region controls were not found inside the map layer drawer.");
      }
      return false;
    }
    if (state.control) return true;
    state.control = { root: root, select: select, list: list, summary: summary, count: count };
    select.addEventListener("change", function () {
      const selected = setSelection(select.value);
      if (!selected && global.console && console.warn) {
        console.warn("[OMEGA geography] Unsupported region selection:", select.value);
      }
    });
    renderList(list, summary, count, []);
    if (state.selected) {
      select.value = state.selected.kind + ":" + state.selected.key;
      renderList(list, summary, count, activeMembers());
    }
    return true;
  }
  function installMapLayers() {
    const map=mapInstance(), L=global.L;
    if (!map || !L || !global.Game) return false;
    state.mapLayer=global.Game.geojsonLayer || state.mapLayer;
    if (!state.mapLayer) return false;
    enrichFeatureCollection(state.pendingGeoData);
    if (!state.oceanLayer && state.oceans && typeof L.geoJSON==="function") {
      if (typeof map.createPane==="function") {
        let pane=map.getPane && map.getPane("omegaOceanRegionPane");
        if (!pane) pane=map.createPane("omegaOceanRegionPane");
        if (pane && pane.style) { pane.style.zIndex="350"; pane.style.pointerEvents="none"; }
      }
      state.oceanLayer=L.geoJSON(state.oceans,{
        pane:"omegaOceanRegionPane",
        style:function(){return {color:"transparent",weight:0,opacity:0,fillColor:"transparent",fillOpacity:0};},
        interactive:false
      }).addTo(map);
    }
    createControl();
    applySelectionStyles();
    state.initialized=true;
    return true;
  }
  function getJson(url) {
    if (typeof global.fetch!=="function") return Promise.resolve(null);
    const path=url+(url.indexOf("?")>=0?"&":"?")+"v=omega-geography-v1";
    return global.fetch(path,{cache:"no-store"}).then(function(response){
      if (!response || !response.ok) throw new Error("Unable to load "+url);
      return response.json();
    });
  }
  const countriesPromise=getJson("countries.json").catch(function(){return null;});
  const oceansPromise=getJson("world_oceans_v1.json").catch(function(){return null;});
  state.readyPromise=Promise.all([countriesPromise,oceansPromise]).then(function(results){
    if(Array.isArray(results[0])) indexCountries(results[0]);
    if(results[1] && results[1].type==="FeatureCollection") state.oceans=results[1];
    state.ready=true;
    if(global.Game && typeof global.Game.findCountryConfig==="function" && !global.Game.findCountryConfig.__omegaRegionWrapped){
      const originalFind=global.Game.findCountryConfig;
      const wrappedFind=function(value){
        const key=normalize(value);
        return state.by2.get(String(value||"").toUpperCase()) ||
          state.by3.get(String(value||"").toUpperCase()) ||
          state.byName.get(key) || originalFind.call(this,value);
      };
      wrappedFind.__omegaRegionWrapped=true;
      global.Game.findCountryConfig=wrappedFind;
    }
    if(state.pendingGeoData) enrichFeatureCollection(state.pendingGeoData);
    installMapLayers();
    return state;
  }).catch(function(error){
    if(global.console && console.warn) console.warn("[OMEGA geography] Region metadata unavailable:",error);
    state.ready=true;
    installMapLayers();
    return state;
  });
  global.OMEGAGeographicRegionSystem={
    version:"1.0.0",
    ready:state.readyPromise,
    select:setSelection,
    clear:function(){return setSelection("");},
    getState:function(){return {ready:state.ready,countryCount:state.countries.length,oceanCount:state.oceans?.features?.length||0,selection:state.selected,initialized:state.initialized};},
    getCountry:function(code){return state.by2.get(String(code||"").toUpperCase())||state.by3.get(String(code||"").toUpperCase())||null;}
  };
  if(global.Game && global.Game.Map && typeof global.Game.Map.renderGeoJSON==="function" &&
      !global.Game.Map.renderGeoJSON.__omegaRegionWrapped){
    const originalRender=global.Game.Map.renderGeoJSON;
    const wrappedRender=function(collection){
      state.pendingGeoData=collection;
      if(!state.ready){
        const self=this;
        state.readyPromise.then(function(){
          if(state.pendingGeoData===collection && !state.initialized){
            enrichFeatureCollection(collection);
            originalRender.call(self,collection);
            state.mapLayer=global.Game.geojsonLayer||state.mapLayer;
            installMapLayers();
          }
        });
        return;
      }
      enrichFeatureCollection(collection);
      const result=originalRender.call(this,collection);
      state.mapLayer=global.Game.geojsonLayer||state.mapLayer;
      installMapLayers();
      return result;
    };
    wrappedRender.__omegaRegionWrapped=true;
    global.Game.Map.renderGeoJSON=wrappedRender;
  }
})(window);
