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
    oceans: null, oceansPromise: null, mapLayer: null, oceanLayer: null, oceanLayerKey: null,
    oceanLabelMarker: null, control: null, highlightedLayers: new Set(),
    highlightedLayerOwner: null, appliedHighlightKey: null,
    styleQueue: [], styleFrame: null, styleGeneration: 0,
    selected: null, pendingGeoData: null, initialized: false, ready: false
  };
  const continentOrder = ["Africa","Antarctica","Asia","Europe","North America","Oceania","South America"];
  const oceanOrder = [
    ["ARCTIC","Arctic Ocean"],["ATLANTIC","Atlantic Ocean"],["INDIAN","Indian Ocean"],
    ["PACIFIC","Pacific Ocean"],["SOUTHERN","Southern Ocean"]
  ];
  const regionFocus = {
    "continent:Africa": [2, 20, 3],
    "continent:Antarctica": [-82, 0, 2],
    "continent:Asia": [34, 88, 2],
    "continent:Europe": [52, 15, 3],
    "continent:North America": [45, -100, 2],
    "continent:Oceania": [-20, 140, 3],
    "continent:South America": [-15, -60, 3],
    "ocean:ARCTIC": [76, 0, 2],
    "ocean:ATLANTIC": [5, -30, 2],
    "ocean:INDIAN": [-20, 80, 2],
    "ocean:PACIFIC": [0, 170, 2],
    "ocean:SOUTHERN": [-62, 0, 2]
  };
  const continentAliases = {
    "Africa": ["Africa", "African continent", "আফ্রিকা", "আফ্রিকা মহাদেশ"],
    "Antarctica": ["Antarctica", "Antarctic continent", "অ্যান্টার্কটিকা", "অ্যান্টার্কটিকা মহাদেশ"],
    "Asia": ["Asia", "Asian continent", "এশিয়া", "এশিয়া", "এশিয়া মহাদেশ", "এশিয়া মহাদেশ"],
    "Europe": ["Europe", "European continent", "ইউরোপ", "ইউরোপ মহাদেশ"],
    "North America": ["North America", "উত্তর আমেরিকা", "উত্তর আমেরিকা মহাদেশ"],
    "Oceania": ["Oceania", "Australia continent", "ওশেনিয়া", "ওশেনিয়া", "অস্ট্রেলিয়া মহাদেশ", "অস্ট্রেলিয়া মহাদেশ"],
    "South America": ["South America", "দক্ষিণ আমেরিকা", "দক্ষিণ আমেরিকা মহাদেশ"]
  };
  const oceanAliases = {
    "ARCTIC": ["Arctic", "Arctic Ocean", "আর্কটিক", "আর্কটিক মহাসাগর", "উত্তর মেরু মহাসাগর"],
    "ATLANTIC": ["Atlantic", "Atlantic Ocean", "আটলান্টিক", "আটলান্টিক মহাসাগর"],
    "INDIAN": ["Indian Ocean", "ভারত মহাসাগর", "ভারতীয় মহাসাগর", "ভারতীয় মহাসাগর"],
    "PACIFIC": ["Pacific", "Pacific Ocean", "প্রশান্ত মহাসাগর"],
    "SOUTHERN": ["Southern Ocean", "Antarctic Ocean", "দক্ষিণ মহাসাগর", "দক্ষিণী মহাসাগর"]
  };
  const genericOceanSearchTerms = ["ocean", "oceans", "sea", "seas", "সমুদ্র", "সাগর", "মহাসাগর", "sagar", "shagor"];
  const genericContinentSearchTerms = ["continent", "continents", "মহাদেশ"];
  function normalizeSearch(value) {
    return String(value == null ? "" : value).normalize("NFKC").toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function regionCatalog() {
    return continentOrder.map(function (key) {
      return {type:"continent", key:key, label:key, value:"continent:"+key,
        aliases:continentAliases[key] || [key]};
    }).concat(oceanOrder.map(function (item) {
      return {type:"ocean", key:item[0], label:item[1], value:"ocean:"+item[0],
        aliases:[item[1]].concat(oceanAliases[item[0]] || [])};
    }));
  }
  function searchRegions(query) {
    const q = normalizeSearch(query);
    const catalog = regionCatalog();
    if (!q) return {matches:[], exclusive:false};
    if (genericOceanSearchTerms.map(normalizeSearch).includes(q)) {
      return {matches:catalog.filter(function (item) { return item.type === "ocean"; }), exclusive:true};
    }
    if (genericContinentSearchTerms.map(normalizeSearch).includes(q)) {
      return {matches:catalog.filter(function (item) { return item.type === "continent"; }), exclusive:true};
    }
    const matches = catalog.filter(function (item) {
      return item.aliases.some(function (alias) { return normalizeSearch(alias).includes(q); });
    });
    const exactMatch = catalog.some(function (item) {
      return item.aliases.some(function (alias) { return normalizeSearch(alias) === q; });
    });
    return {matches:matches, exclusive:exactMatch};
  }
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
    // Keep the three intentional map-only boundaries in regional selection too.
    // They remain separate map features and are not fabricated as ISO roster rows.
    const mapOnlyContinents = {
      "KOSOVO": ["Europe"],
      "NORTHERN CYPRUS": ["Asia", "Europe"],
      "SOMALILAND": ["Africa"]
    };
    const mapOnlyOceans = {
      "NORTHERN CYPRUS": ["ATLANTIC"],
      "SOMALILAND": ["INDIAN"]
    };
    if (state.selected && state.selected.kind === "continent") {
      return (mapOnlyContinents[name] || []).includes(state.selected.key);
    }
    if (state.selected && state.selected.kind === "ocean") {
      return (mapOnlyOceans[name] || []).includes(state.selected.key);
    }
    return false;
  }
  function setBoundaryGlow(layer, enabled, color, kind) {
    const element = layer && (typeof layer.getElement === "function" ? layer.getElement() : layer._path);
    if (!element || !element.classList) return;
    element.classList.remove("omega-region-boundary-glow");
    element.classList.remove("omega-region-continent-glow");
    element.classList.remove("omega-region-ocean-glow");
    if (element.style && typeof element.style.removeProperty === "function") {
      element.style.removeProperty("--omega-region-glow-color");
    }
    if (!enabled) return;
    element.classList.add("omega-region-boundary-glow");
    element.classList.add(kind === "ocean" ? "omega-region-ocean-glow" : "omega-region-continent-glow");
    if (element.style && typeof element.style.setProperty === "function") {
      element.style.setProperty("--omega-region-glow-color", color || "#58a6ff");
    }
  }
  function clearBoundaryGlows(layer) {
    if (!layer || typeof layer.eachLayer !== "function") return;
    layer.eachLayer(function (child) { setBoundaryGlow(child, false); });
  }
  function resetMainStyles() {
    const layer = state.mapLayer || global.Game && global.Game.geojsonLayer;
    if (!layer || typeof layer.eachLayer !== "function") return;
    layer.eachLayer(function (child) {
      if (typeof layer.resetStyle === "function") layer.resetStyle(child);
      setBoundaryGlow(child, false);
    });
  }
  function removeOceanOverlay() {
    const map = mapInstance();
    const overlayMap = state.oceanLayer && state.oceanLayer._map || map;
    if (state.oceanLayer && overlayMap && typeof overlayMap.removeLayer === "function") {
      overlayMap.removeLayer(state.oceanLayer);
    }
    const markerMap = state.oceanLabelMarker && state.oceanLabelMarker._map || map;
    if (state.oceanLabelMarker && markerMap && typeof markerMap.removeLayer === "function") {
      markerMap.removeLayer(state.oceanLabelMarker);
    }
    state.oceanLayer = null;
    state.oceanLayerKey = null;
    state.oceanLabelMarker = null;
  }
  function applyOceanStyle() {
    const map = mapInstance(), L = global.L;
    if (!map || !L || !state.selected || state.selected.kind !== "ocean" ||
        typeof L.geoJSON !== "function") {
      removeOceanOverlay();
      return;
    }
    const key = state.selected.key;
    // Basin geometry is intentionally lazy-loaded so it cannot delay the base map.
    if (!state.oceans) {
      removeOceanOverlay();
      loadOceans().then(function (oceans) {
        if (oceans && state.selected && state.selected.kind === "ocean" &&
            state.selected.key === key) {
          installMapLayers();
        }
      });
      return;
    }
    if (state.oceanLayer && state.oceanLayerKey === key) return;
    removeOceanOverlay();
    const feature = state.oceans.features.find(function (item) {
      return item && item.properties && item.properties.oceanId === key;
    });
    if (!feature) return;
    const color = oceanColors[key] || "#4da6ff";
    const options = {
      pane: "omegaOceanRegionPane",
      style: {
        color: color, weight: 2.4, opacity: 0.95,
        fillColor: color, fillOpacity: 0.12,
        lineCap: "round", lineJoin: "round"
      },
      interactive: false
    };
    // Canvas avoids a giant SVG path and expensive per-path filters on mobile.
    if (typeof L.canvas === "function") {
      options.renderer = L.canvas({pane:"omegaOceanRegionPane", padding:0.25});
    }
    state.oceanLayer = L.geoJSON(feature, options).addTo(map);
    state.oceanLayerKey = key;

    const focus = regionFocus["ocean:" + key];
    const label = oceanOrder.find(function (item) { return item[0] === key; });
    if (focus && label && typeof L.marker === "function" && typeof L.divIcon === "function") {
      const icon = L.divIcon({
        className: "omega-ocean-region-label",
        html: '<div class="omega-ocean-label-card" style="--omega-ocean-accent:' + color + '">' +
          '<span>OCEAN BASIN</span><strong>' + label[1] + '</strong></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      state.oceanLabelMarker = L.marker([focus[0], focus[1]], {
        icon: icon, interactive: false, keyboard: false, zIndexOffset: 1000
      }).addTo(map);
    }
  }
  function scheduleStyleOperations(operations) {
    if (state.styleFrame !== null) {
      if (typeof global.cancelAnimationFrame === "function") {
        global.cancelAnimationFrame(state.styleFrame);
      } else if (typeof global.clearTimeout === "function") {
        global.clearTimeout(state.styleFrame);
      }
    }
    const generation = ++state.styleGeneration;
    state.styleQueue = Array.isArray(operations) ? operations.slice() : [];
    state.styleFrame = null;
    if (!state.styleQueue.length) return;

    const now = function () {
      return global.performance && typeof global.performance.now === "function" ?
        global.performance.now() : Date.now();
    };
    const runBatch = function () {
      if (generation !== state.styleGeneration) return;
      state.styleFrame = null;
      const started = now();
      let processed = 0;
      // Bound both work per frame and elapsed time to keep touch/zoom responsive on phones.
      while (state.styleQueue.length && processed < 6) {
        const operation = state.styleQueue.shift();
        try {
          operation();
        } catch (error) {
          if (global.console && typeof global.console.warn === "function") {
            global.console.warn("[OMEGA geography] Deferred layer styling failed:", error);
          }
        }
        processed += 1;
        if (now() - started >= 7) break;
      }
      if (state.styleQueue.length) {
        if (typeof global.requestAnimationFrame === "function") {
          state.styleFrame = global.requestAnimationFrame(runBatch);
        } else {
          state.styleFrame = global.setTimeout(runBatch, 0);
        }
      }
    };
    if (typeof global.requestAnimationFrame === "function") {
      state.styleFrame = global.requestAnimationFrame(runBatch);
    } else {
      state.styleFrame = global.setTimeout(runBatch, 0);
    }
  }
  function applySelectionStyles() {
    const layer = state.mapLayer || global.Game && global.Game.geojsonLayer;
    if (!layer || typeof layer.eachLayer !== "function") {
      applyOceanStyle();
      return;
    }
    if (state.highlightedLayerOwner && state.highlightedLayerOwner !== layer) {
      const oldOwner = state.highlightedLayerOwner;
      state.highlightedLayers.forEach(function (child) {
        if (typeof oldOwner.resetStyle === "function") oldOwner.resetStyle(child);
        setBoundaryGlow(child, false);
      });
      state.highlightedLayers = new Set();
      state.appliedHighlightKey = null;
    }

    // Continent membership is indexed cheaply; expensive polygon restyling is deferred in small batches.
    const highlightCountries = !!(state.selected && state.selected.kind === "continent");
    const nextLayers = new Set();
    if (highlightCountries) {
      const memberRows = activeMembers();
      const memberCodes = new Set(memberRows.map(function (c) { return c.iso3; }));
      layer.eachLayer(function (child) {
        if (featureMember(child.feature, memberCodes)) nextLayers.add(child);
      });
    }
    const targetColor = highlightCountries ? continentColors[state.selected.key] : null;
    const highlightKey = highlightCountries ? state.selected.key + ":" + targetColor : null;

    // A repeated map-ready event for the same selection must not cancel a partially completed batch.
    if (state.highlightedLayerOwner === layer &&
        state.appliedHighlightKey === highlightKey &&
        state.styleFrame !== null && state.styleQueue.length) {
      applyOceanStyle();
      return;
    }

    const mustRestyle = state.appliedHighlightKey !== highlightKey;
    const operations = [];
    Array.from(state.highlightedLayers).forEach(function (child) {
      if (nextLayers.has(child)) return;
      operations.push(function () {
        if (typeof layer.resetStyle === "function") layer.resetStyle(child);
        setBoundaryGlow(child, false);
        state.highlightedLayers.delete(child);
      });
    });
    if (highlightCountries) {
      nextLayers.forEach(function (child) {
        if (state.highlightedLayers.has(child) && !mustRestyle) return;
        operations.push(function () {
          child.setStyle({
            color: targetColor,
            weight: 2.45,
            opacity: 1,
            dashArray: null,
            fillColor: targetColor,
            fillOpacity: 0.16
          });
          setBoundaryGlow(child, true, targetColor, "continent");
          state.highlightedLayers.add(child);
        });
      });
    }
    state.highlightedLayerOwner = layer;
    state.appliedHighlightKey = highlightKey;
    scheduleStyleOperations(operations);
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
  function focusSelectedRegion() {
    const map = mapInstance();
    if (!map || !state.selected || typeof map.setView !== "function") return false;
    const focus = regionFocus[state.selected.kind + ":" + state.selected.key];
    if (!focus) return false;
    map.setView([focus[0], focus[1]], focus[2], {animate:false});
    return true;
  }
  function setSelection(value, options) {
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
    if (options && options.focus) focusSelectedRegion();
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
      const selected = setSelection(select.value, {focus:true});
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
    if (state.oceans && typeof map.createPane==="function") {
      let pane=map.getPane && map.getPane("omegaOceanRegionPane");
      if (!pane) pane=map.createPane("omegaOceanRegionPane");
      if (pane && pane.style) {
        pane.style.zIndex="350";
        pane.style.pointerEvents="none";
      }
    }
    createControl();
    applySelectionStyles();
    state.initialized=true;
    return true;
  }
  function getJson(url) {
    if (typeof global.fetch!=="function") return Promise.resolve(null);
    const path=url+(url.indexOf("?")>=0?"&":"?")+"v=omega-geography-v2";
    // Let the browser cache versioned local assets instead of forcing a network read on every launch.
    return global.fetch(path,{cache:"default"}).then(function(response){
      if (!response || !response.ok) throw new Error("Unable to load "+url);
      return response.json();
    });
  }
  function loadOceans() {
    if (state.oceans) return Promise.resolve(state.oceans);
    if (state.oceansPromise) return state.oceansPromise;
    state.oceansPromise = getJson("world_oceans_v1.json").then(function(collection) {
      if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        throw new Error("Invalid ocean basin GeoJSON");
      }
      state.oceans = collection;
      return collection;
    }).catch(function(error) {
      state.oceansPromise = null;
      if (global.console && typeof global.console.warn === "function") {
        global.console.warn("[OMEGA geography] Ocean basin data unavailable:", error);
      }
      return null;
    });
    return state.oceansPromise;
  }
  const countriesPromise=getJson("countries.json").catch(function(){return null;});
  state.readyPromise=countriesPromise.then(function(rows){
    if(Array.isArray(rows)) indexCountries(rows);
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
    version:"1.2.0",
    ready:state.readyPromise,
    select:function(value, options){return setSelection(value, options);},
    search:searchRegions,
    clear:function(){return setSelection("");},
    getState:function(){return {ready:state.ready,countryCount:state.countries.length,oceanCount:state.oceans?.features?.length||0,selection:state.selected,initialized:state.initialized};},
    getCountry:function(code){return state.by2.get(String(code||"").toUpperCase())||state.by3.get(String(code||"").toUpperCase())||null;}
  };
  if (global.Game && typeof global.Game.selectCountryByName === "function" &&
      !global.Game.selectCountryByName.__omegaRegionWrapped) {
    const originalSelectCountry = global.Game.selectCountryByName;
    const wrappedSelectCountry = function (countryName, layerTarget) {
      // A direct country click replaces geographic group highlighting rather
      // than leaving a stale continent/ocean selection active behind it.
      if (state.selected) setSelection("");
      return originalSelectCountry.apply(this, arguments);
    };
    wrappedSelectCountry.__omegaRegionWrapped = true;
    global.Game.selectCountryByName = wrappedSelectCountry;
  }
  if(global.Game && global.Game.Map && typeof global.Game.Map.renderGeoJSON==="function" &&
      !global.Game.Map.renderGeoJSON.__omegaRegionWrapped){
    const originalRender=global.Game.Map.renderGeoJSON;
    const wrappedRender=function(collection){
      state.pendingGeoData=collection;
      if(!state.ready){
        // Render the country's canonical polygons immediately; region metadata can enhance them afterward.
        const result=originalRender.call(this,collection);
        state.mapLayer=global.Game.geojsonLayer||state.mapLayer;
        return result;
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
