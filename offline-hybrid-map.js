/* OMEGA Offline Hybrid Atlas
 * Uses the canonical bundled world.json through the existing Leaflet GeoJSON layer.
 * Actual country polygons, readable borders and a real latitude/longitude graticule.
 */
(function () {
    "use strict";
    if (!window.L || !window.Game || !window.Game.Map || !window.map) {
        console.warn("[Offline Atlas] Map runtime is not ready.");
        return;
    }

    var active = false;
    var gridLayer = null;
    var coordinateLabels = null;
    var atlasButton = null;
    var originalSwitchMapLayer = window.Game.switchMapLayer;
    var originalRenderGeoJSON = window.Game.Map.renderGeoJSON;
    var originalSelectCountry = window.Game.selectCountryByName;
    var GRID_PANE = "omegaOfflineGraticulePane";
    var LABEL_PANE = "omegaOfflineCoordinateLabelsPane";

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    function sourceName(feature) {
        var props = feature && feature.properties ? feature.properties : {};
        var name = props.ADMIN || props.name || props.NAME || props.NAME_EN || "";
        if (/^(west bank|gaza|gaza strip)$/i.test(name)) return "Palestine";
        return name;
    }

    function rgb(hex) {
        var match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
        if (!match) return [82, 100, 88];
        return [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
    }

    function hex(channels) {
        return "#" + channels.map(function (channel) {
            return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
        }).join("");
    }

    function mutedFill(name) {
        var config = typeof Game.findCountryConfig === "function" ? Game.findCountryConfig(name) : null;
        var raw = typeof window.getCountryColor === "function"
            ? window.getCountryColor(config && config.name ? config.name : name)
            : "#536458";
        var base = rgb(raw);
        var slateSage = [82, 98, 85];
        return hex(base.map(function (channel, index) { return channel * 0.69 + slateSage[index] * 0.31; }));
    }

    function countryStyle(feature) {
        return {
            color: "#c0c8bb",
            weight: 0.85,
            opacity: 0.9,
            fillColor: mutedFill(sourceName(feature)),
            fillOpacity: 0.91,
            lineCap: "round",
            lineJoin: "round",
            dashArray: null
        };
    }

    function selectedStyle() {
        return { color: "#f0d6a0", weight: 2.15, opacity: 1, fillOpacity: 0.95, dashArray: null };
    }

    function styleCountries() {
        var countries = Game.geojsonLayer;
        if (!countries || typeof countries.eachLayer !== "function") return;
        countries.eachLayer(function (layer) {
            if (active) layer.setStyle(countryStyle(layer.feature));
            else countries.resetStyle(layer);
        });
        if (active && Game.selectedLayer && typeof Game.selectedLayer.setStyle === "function") {
            Game.selectedLayer.setStyle(selectedStyle());
        }
    }

    function longitudeText(lon) {
        if (lon === 0) return "0°";
        if (Math.abs(lon) === 180) return "180°";
        return Math.abs(lon) + "°" + (lon < 0 ? "W" : "E");
    }

    function latitudeText(lat) {
        if (lat === 0) return "0°";
        return Math.abs(lat) + "°" + (lat < 0 ? "S" : "N");
    }

    function labelIcon(text, axis) {
        return L.divIcon({
            className: "omega-offline-coordinate-icon",
            html: '<span class="omega-offline-coordinate-label omega-coordinate-' + axis + '">' + text + "</span>",
            iconSize: [54, 18],
            iconAnchor: axis === "longitude" ? [27, 9] : [0, 9]
        });
    }

    function addGridLine(points) {
        gridLayer.addLayer(L.polyline(points, {
            pane: GRID_PANE, color: "#aab9b5", opacity: 0.24, weight: 0.65,
            dashArray: "2 5", lineCap: "round", interactive: false, smoothFactor: 1
        }));
    }

    function createGraticule() {
        if (!window.map.getPane(GRID_PANE)) {
            window.map.createPane(GRID_PANE);
            window.map.getPane(GRID_PANE).style.zIndex = "410";
            window.map.getPane(GRID_PANE).style.pointerEvents = "none";
        }
        if (!window.map.getPane(LABEL_PANE)) {
            window.map.createPane(LABEL_PANE);
            window.map.getPane(LABEL_PANE).style.zIndex = "625";
            window.map.getPane(LABEL_PANE).style.pointerEvents = "none";
        }

        gridLayer = L.layerGroup();
        for (var lon = -180; lon <= 180; lon += 30) {
            var meridian = [];
            for (var lat = -60; lat <= 84; lat += 2) meridian.push([lat, lon]);
            addGridLine(meridian);
        }
        for (var parallel = -60; parallel <= 75; parallel += 15) {
            var line = [];
            for (var longitude = -180; longitude <= 180; longitude += 3) line.push([parallel, longitude]);
            addGridLine(line);
        }
        coordinateLabels = L.layerGroup();
    }

    function updateCoordinateLabels() {
        if (!active || !coordinateLabels || !window.map) return;
        coordinateLabels.clearLayers();
        var bounds = window.map.getBounds();
        var west = Math.max(-180, bounds.getWest());
        var east = Math.min(180, bounds.getEast());
        var south = Math.max(-60, bounds.getSouth());
        var north = Math.min(84, bounds.getNorth());
        if (east <= west || north <= south) return;

        var labelLat = clamp(north - Math.max(3, (north - south) * 0.08), south + 1, north - 1);
        var labelLon = clamp(west + Math.max(3, (east - west) * 0.04), west + 1, east - 1);
        for (var lon = Math.ceil(west / 30) * 30; lon <= east && lon <= 180; lon += 30) {
            if (lon < -180) continue;
            coordinateLabels.addLayer(L.marker([labelLat, lon], {
                pane: LABEL_PANE, icon: labelIcon(longitudeText(lon), "longitude"),
                interactive: false, keyboard: false
            }));
        }
        for (var lat = Math.ceil(south / 15) * 15; lat <= north; lat += 15) {
            coordinateLabels.addLayer(L.marker([lat, labelLon], {
                pane: LABEL_PANE, icon: labelIcon(latitudeText(lat), "latitude"),
                interactive: false, keyboard: false
            }));
        }
    }

    function syncButton() {
        atlasButton = atlasButton || document.querySelector('.layer-opt-btn[data-layer="offline-hybrid"]');
        if (!atlasButton) return;
        if (active) {
            document.querySelectorAll(".layer-opt-btn").forEach(function (button) {
                if (button !== atlasButton) button.classList.remove("active");
            });
        }
        atlasButton.classList.toggle("active", active);
        atlasButton.setAttribute("aria-pressed", String(active));
    }

    function activate() {
        if (!active) {
            active = true;
            if (window.satelliteLayer && window.map.hasLayer(window.satelliteLayer)) window.map.removeLayer(window.satelliteLayer);
            if (window.currentMapTileLayer && window.map.hasLayer(window.currentMapTileLayer)) window.map.removeLayer(window.currentMapTileLayer);
            window.currentMapTileLayer = null;
            if (!gridLayer) createGraticule();
            gridLayer.addTo(window.map);
            coordinateLabels.addTo(window.map);
            if (document.body) document.body.classList.add("omega-offline-hybrid-active");
        }
        styleCountries();
        updateCoordinateLabels();
        syncButton();
        if (typeof Game.showNotification === "function") {
            Game.showNotification("OFFLINE HYBRID ATLAS", "Actual country geometry, clear political borders and geographic coordinates are active. No online map tiles are used.", "info");
        }
    }

    function deactivate() {
        if (!active) return;
        active = false;
        if (gridLayer && window.map.hasLayer(gridLayer)) window.map.removeLayer(gridLayer);
        if (coordinateLabels && window.map.hasLayer(coordinateLabels)) window.map.removeLayer(coordinateLabels);
        if (document.body) document.body.classList.remove("omega-offline-hybrid-active");
        styleCountries();
        syncButton();
    }

    window.OmegaOfflineHybridAtlas = {
        activate: activate,
        deactivate: deactivate,
        isActive: function () { return active; },
        redraw: updateCoordinateLabels
    };

    if (typeof originalRenderGeoJSON === "function") {
        Game.Map.renderGeoJSON = function () {
            var result = originalRenderGeoJSON.apply(this, arguments);
            if (active) {
                styleCountries();
                updateCoordinateLabels();
            }
            return result;
        };
    }

    if (typeof originalSelectCountry === "function") {
        Game.selectCountryByName = function () {
            var result = originalSelectCountry.apply(this, arguments);
            if (active) styleCountries();
            return result;
        };
    }

    if (typeof originalSwitchMapLayer === "function") {
        Game.switchMapLayer = function (layerType) {
            if (layerType === "offline-hybrid") return activate();
            deactivate();
            return originalSwitchMapLayer.apply(this, arguments);
        };
    }

    window.map.on("moveend zoomend", updateCoordinateLabels);
    document.addEventListener("DOMContentLoaded", function () {
        syncButton();
        if (window.OMEGA_ANDROID_OFFLINE) activate();
    });
})();