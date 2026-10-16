/* OMEGA Offline Hybrid Atlas
 * A local, network-free cartographic base layer. Reuses the application's existing
 * world.json geometry and existing Leaflet interaction/data layers.
 * Relief strokes are illustrative texture, not measured elevation data.
 */
(function () {
    "use strict";

    if (!window.L || !window.Game || !window.Game.Map || !window.map) {
        console.warn("[Offline Atlas] Leaflet map is not ready; atlas control remains unavailable.");
        return;
    }

    var TILE_SIZE = 256;
    var active = false;
    var geoData = null;
    var atlasLayer = null;
    var projectionCache = null;
    var originalSwitchMapLayer = window.Game.switchMapLayer;
    var atlasButton = null;

    function featureName(feature) {
        var props = (feature && feature.properties) || {};
        return props.ADMIN || props.name || props.NAME || props.NAME_EN || "";
    }

    function project(lon, lat, zoom) {
        var safeLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
        var sin = Math.sin(safeLat * Math.PI / 180);
        var scale = TILE_SIZE * Math.pow(2, zoom);
        return [
            ((Number(lon) + 180) / 360) * scale,
            (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
        ];
    }

    function projectRing(ring, zoom, referenceX) {
        var output = [];
        var worldWidth = TILE_SIZE * Math.pow(2, zoom);
        var previousX = null;

        (Array.isArray(ring) ? ring : []).forEach(function (coordinate) {
            if (!Array.isArray(coordinate) || coordinate.length < 2) return;
            var point = project(coordinate[0], coordinate[1], zoom);
            var x = point[0];
            if (previousX !== null) {
                while (x - previousX > worldWidth / 2) x -= worldWidth;
                while (x - previousX < -worldWidth / 2) x += worldWidth;
            }
            output.push([x, point[1]]);
            previousX = x;
        });

        if (output.length > 2 && Number.isFinite(referenceX)) {
            var centerX = output.reduce(function (sum, point) { return sum + point[0]; }, 0) / output.length;
            var shift = Math.round((referenceX - centerX) / worldWidth) * worldWidth;
            if (shift) output = output.map(function (point) { return [point[0] + shift, point[1]]; });
        }
        return output;
    }

    function boundsForRings(rings) {
        var bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        rings.forEach(function (ring) {
            ring.forEach(function (point) {
                bounds.minX = Math.min(bounds.minX, point[0]);
                bounds.minY = Math.min(bounds.minY, point[1]);
                bounds.maxX = Math.max(bounds.maxX, point[0]);
                bounds.maxY = Math.max(bounds.maxY, point[1]);
            });
        });
        return bounds;
    }

    function sourceGeoJSON() {
        if (geoData && Array.isArray(geoData.features)) return geoData;
        var layer = window.Game.geojsonLayer;
        if (layer && typeof layer.toGeoJSON === "function") {
            try { return layer.toGeoJSON(); } catch (error) { /* wait for data pipeline */ }
        }
        return null;
    }

    function projectedFeatures(zoom) {
        var source = sourceGeoJSON();
        if (!source || !Array.isArray(source.features)) return [];
        if (projectionCache && projectionCache.zoom === zoom && projectionCache.source === source) {
            return projectionCache.features;
        }

        var projected = [];
        source.features.forEach(function (feature) {
            var geometry = feature && feature.geometry;
            if (!geometry || !geometry.coordinates) return;
            var polygons;
            if (geometry.type === "Polygon") polygons = [geometry.coordinates];
            else if (geometry.type === "MultiPolygon") polygons = geometry.coordinates;
            else return;

            polygons.forEach(function (polygon) {
                if (!Array.isArray(polygon) || !polygon.length) return;
                var outer = projectRing(polygon[0], zoom);
                if (outer.length < 4) return;
                var outerCenterX = outer.reduce(function (sum, point) { return sum + point[0]; }, 0) / outer.length;
                var rings = [outer];
                polygon.slice(1).forEach(function (ring) {
                    var projectedRing = projectRing(ring, zoom, outerCenterX);
                    if (projectedRing.length >= 4) rings.push(projectedRing);
                });
                projected.push({
                    name: featureName(feature),
                    rings: rings,
                    bounds: boundsForRings(rings)
                });
            });
        });

        projectionCache = { zoom: zoom, source: source, features: projected };
        return projected;
    }

    function countryColor(name) {
        var config = window.Game.findCountryConfig ? window.Game.findCountryConfig(name) : null;
        var color = typeof window.getCountryColor === "function"
            ? window.getCountryColor(config && config.name ? config.name : name)
            : "#53645b";
        if (!/^#[0-9a-f]{6}$/i.test(String(color))) return "#53645b";

        var raw = String(color).slice(1);
        var r = parseInt(raw.slice(0, 2), 16);
        var g = parseInt(raw.slice(2, 4), 16);
        var b = parseInt(raw.slice(4, 6), 16);
        var anchor = [37, 56, 54];
        var mix = 0.32;
        return "#" + [
            Math.round(r * (1 - mix) + anchor[0] * mix),
            Math.round(g * (1 - mix) + anchor[1] * mix),
            Math.round(b * (1 - mix) + anchor[2] * mix)
        ].map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
    }

    function tracePolygon(context, rings, xOrigin, yOrigin, worldOffset) {
        context.beginPath();
        rings.forEach(function (ring) {
            if (!ring.length) return;
            context.moveTo(ring[0][0] + worldOffset - xOrigin, ring[0][1] - yOrigin);
            for (var i = 1; i < ring.length; i++) {
                context.lineTo(ring[i][0] + worldOffset - xOrigin, ring[i][1] - yOrigin);
            }
            context.closePath();
        });
    }

    function drawOceanTexture(context, coords, size, worldSize) {
        var xOrigin = coords.x * size;
        var yOrigin = coords.y * size;

        context.fillStyle = "#0a1b27";
        context.fillRect(0, 0, size, size);

        var wash = context.createLinearGradient(0, 0, size, size);
        wash.addColorStop(0, "rgba(32, 58, 68, 0.20)");
        wash.addColorStop(0.5, "rgba(9, 26, 39, 0.02)");
        wash.addColorStop(1, "rgba(40, 59, 62, 0.16)");
        context.fillStyle = wash;
        context.fillRect(0, 0, size, size);

        context.lineWidth = 0.7;
        context.strokeStyle = "rgba(112, 151, 160, 0.11)";
        for (var band = 1; band <= 6; band++) {
            var centerY = yOrigin + (worldSize * band / 7);
            context.beginPath();
            for (var x = -8; x <= size + 8; x += 12) {
                var worldX = xOrigin + x;
                var y = centerY
                    + 8 * Math.sin(worldX * 0.008 + band * 0.7)
                    + 3 * Math.sin(worldX * 0.021 + band * 1.8);
                if (x === -8) context.moveTo(x, y - yOrigin);
                else context.lineTo(x, y - yOrigin);
            }
            context.stroke();
        }

        context.lineWidth = 0.55;
        context.strokeStyle = "rgba(120, 153, 158, 0.12)";
        for (var longitude = -180; longitude <= 180; longitude += 30) {
            var gx = ((longitude + 180) / 360) * worldSize - xOrigin;
            if (gx < -1 || gx > size + 1) continue;
            context.beginPath();
            context.moveTo(gx, 0);
            context.lineTo(gx, size);
            context.stroke();
        }

        for (var latitude = -75; latitude <= 75; latitude += 15) {
            var gy = project(0, latitude, coords.z)[1] - yOrigin;
            if (gy < -1 || gy > size + 1) continue;
            context.beginPath();
            context.moveTo(0, gy);
            context.lineTo(size, gy);
            context.stroke();
        }
    }

    function drawLandRelief(context, coords, size, polygon, worldOffset) {
        var xOrigin = coords.x * size;
        var yOrigin = coords.y * size;
        var worldSize = size * Math.pow(2, coords.z);
        var bounds = polygon.bounds;
        var minX = xOrigin;
        var maxX = xOrigin + size;
        var minY = yOrigin;
        var maxY = yOrigin + size;

        if (bounds.maxX + worldOffset < minX - 2 ||
            bounds.minX + worldOffset > maxX + 2 ||
            bounds.maxY < minY - 2 || bounds.minY > maxY + 2) return;

        tracePolygon(context, polygon.rings, xOrigin, yOrigin, worldOffset);
        context.fillStyle = countryColor(polygon.name);
        context.fill("evenodd");
        context.save();
        context.clip("evenodd");

        var pitch = Math.max(18, 40 - coords.z * 3);
        var firstBand = Math.floor(yOrigin / pitch) - 1;
        var lastBand = Math.ceil((yOrigin + size) / pitch) + 1;
        context.lineWidth = 0.65;
        for (var band = firstBand; band <= lastBand; band++) {
            var centerY = band * pitch;
            context.strokeStyle = band % 3 === 0
                ? "rgba(220, 225, 207, 0.15)"
                : "rgba(17, 37, 35, 0.16)";
            context.beginPath();
            for (var x = -6; x <= size + 6; x += 10) {
                var worldX = xOrigin + x;
                var y = centerY
                    + 4.1 * Math.sin(worldX * 0.014 + band * 0.73)
                    + 1.6 * Math.sin(worldX * 0.037 + band * 0.21);
                if (x === -6) context.moveTo(x, y - yOrigin);
                else context.lineTo(x, y - yOrigin);
            }
            context.stroke();
        }
        context.restore();
    }

    var OfflineReliefGrid = window.L.GridLayer.extend({
        createTile: function (coords, done) {
            var tile = document.createElement("canvas");
            var size = this.getTileSize();
            tile.width = size.x;
            tile.height = size.y;

            try {
                var context = tile.getContext("2d");
                if (context) {
                    var canvasSize = size.x;
                    var worldSize = canvasSize * Math.pow(2, coords.z);
                    drawOceanTexture(context, coords, canvasSize, worldSize);
                    var features = projectedFeatures(coords.z);
                    var worldWidth = worldSize;
                    features.forEach(function (polygon) {
                        [-worldWidth, 0, worldWidth].forEach(function (worldOffset) {
                            drawLandRelief(context, coords, canvasSize, polygon, worldOffset);
                        });
                    });
                }
                if (typeof done === "function") done(null, tile);
            } catch (error) {
                console.error("[Offline Atlas] Local tile render failed:", error);
                if (typeof done === "function") done(null, tile);
            }
            return tile;
        }
    });

    function setInteractionLayerStyle() {
        var layer = window.Game.geojsonLayer;
        if (!layer || typeof layer.eachLayer !== "function") return;

        layer.eachLayer(function (countryLayer) {
            if (active) {
                countryLayer.setStyle({
                    color: "#8a9a91",
                    weight: 0.75,
                    opacity: 0.88,
                    fillColor: "#253a36",
                    fillOpacity: 0.035,
                    dashArray: null
                });
            } else {
                layer.resetStyle(countryLayer);
            }
        });

        if (!active && window.Game.selectedLayer && window.Game.geojsonLayer) {
            try {
                window.Game.selectedLayer.setStyle({
                    color: "#c6b77a",
                    weight: 2.2,
                    opacity: 1,
                    fillOpacity: 0.42
                });
            } catch (error) { /* selection may have changed during layer redraw */ }
        }
    }

    function syncButtonState() {
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
        if (active) {
            if (atlasLayer && !window.map.hasLayer(atlasLayer)) atlasLayer.addTo(window.map);
            return;
        }

        active = true;
        if (window.satelliteLayer && window.map.hasLayer(window.satelliteLayer)) {
            window.map.removeLayer(window.satelliteLayer);
        }
        if (window.currentMapTileLayer && window.map.hasLayer(window.currentMapTileLayer)) {
            window.map.removeLayer(window.currentMapTileLayer);
        }
        window.currentMapTileLayer = null;

        if (!atlasLayer) {
            atlasLayer = new OfflineReliefGrid({
                tileSize: TILE_SIZE,
                minZoom: 2,
                maxZoom: 8,
                updateWhenIdle: true,
                keepBuffer: 1,
                noWrap: false,
                attribution: "OMEGA Offline Hybrid Atlas · local world geometry"
            });
        }
        atlasLayer.addTo(window.map);
        if (typeof atlasLayer.bringToBack === "function") atlasLayer.bringToBack();

        if (document.body) document.body.classList.add("omega-offline-hybrid-active");
        setInteractionLayerStyle();
        syncButtonState();
        if (typeof window.Game.showNotification === "function") {
            window.Game.showNotification("OFFLINE ATLAS", "Local hybrid map active. No online map tiles are used in this mode.", "info");
        }
    }

    function deactivate() {
        if (!active) return;
        active = false;
        if (atlasLayer && window.map.hasLayer(atlasLayer)) window.map.removeLayer(atlasLayer);
        if (document.body) document.body.classList.remove("omega-offline-hybrid-active");
        setInteractionLayerStyle();
        syncButtonState();
    }

    window.OmegaOfflineHybridAtlas = {
        activate: activate,
        deactivate: deactivate,
        isActive: function () { return active; },
        redraw: function () {
            projectionCache = null;
            if (atlasLayer) atlasLayer.redraw();
        }
    };

    if (window.Game.Map && typeof window.Game.Map.renderGeoJSON === "function") {
        var originalRenderGeoJSON = window.Game.Map.renderGeoJSON;
        window.Game.Map.renderGeoJSON = function (nextGeoData) {
            geoData = nextGeoData || geoData;
            var result = originalRenderGeoJSON.apply(this, arguments);
            projectionCache = null;
            if (active) {
                setInteractionLayerStyle();
                if (atlasLayer) atlasLayer.redraw();
            }
            return result;
        };
    }

    if (typeof originalSwitchMapLayer === "function") {
        window.Game.switchMapLayer = function (layerType) {
            if (layerType === "offline-hybrid") {
                activate();
                return;
            }
            deactivate();
            return originalSwitchMapLayer.apply(this, arguments);
        };
    }

    document.addEventListener("DOMContentLoaded", function () {
        syncButtonState();
        if (window.OMEGA_ANDROID_OFFLINE) activate();
    });

    window.addEventListener("resize", function () {
        if (active && atlasLayer) atlasLayer.redraw();
    });
})();