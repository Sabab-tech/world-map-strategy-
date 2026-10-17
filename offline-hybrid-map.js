/* OMEGA Hybrid Satellite Atlas
 * Uses the existing canonical country GeoJSON and Leaflet map.
 * Online: detailed Esri World Imagery.
 * Offline after the first successful online load: cached NASA Blue Marble raster.
 * No parallel country/deposit data is introduced.
 */
(function () {
    "use strict";

    if (!window.L || !window.Game || !window.Game.Map || !window.map) {
        console.warn("[OMEGA Atlas] Map runtime is not ready.");
        return;
    }

    var active = false;
    var gridLayer = null;
    var coordinateLabels = null;
    var atlasButton = null;
    var atlasSatelliteLayer = null;
    var blueMarbleLayer = null;
    var blueMarbleImage = null;
    var blueMarblePromise = null;
    var textureReady = false;
    var textureStored = false;
    var remoteImageryReady = false;
    var GRID_PANE = "omegaOfflineGraticulePane";
    var LABEL_PANE = "omegaOfflineCoordinateLabelsPane";
    var BLUE_MARBLE_URL = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg";
    var CACHE_DB = "omega-map-imagery-cache-v1";
    var CACHE_STORE = "raster";
    var CACHE_KEY = "nasa-blue-marble-5400x2700-january-2004";

    var originalSwitchMapLayer = window.Game.switchMapLayer;
    var originalRenderGeoJSON = window.Game.Map.renderGeoJSON;
    var originalSelectCountry = window.Game.selectCountryByName;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function sourceName(feature) {
        var props = feature && feature.properties ? feature.properties : {};
        var name = props.ADMIN || props.name || props.NAME || props.NAME_EN || "";
        if (/^(west bank|gaza|gaza strip)$/i.test(name)) return "Palestine";
        return name;
    }

    function rgb(hex) {
        var match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
        if (!match) return [82, 100, 88];
        return [
            parseInt(match[1].slice(0, 2), 16),
            parseInt(match[1].slice(2, 4), 16),
            parseInt(match[1].slice(4, 6), 16)
        ];
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
        return hex(base.map(function (channel, index) {
            return channel * 0.69 + slateSage[index] * 0.31;
        }));
    }

    function imageryAvailable() {
        return textureReady || remoteImageryReady;
    }

    function countryStyle(feature) {
        var hasImagery = imageryAvailable();
        return {
            color: "#dce6df",
            weight: window.map.getZoom() >= 5 ? 0.55 : 0.8,
            opacity: 0.88,
            fillColor: mutedFill(sourceName(feature)),
            fillOpacity: hasImagery ? 0.055 : 0.88,
            lineCap: "round",
            lineJoin: "round",
            dashArray: null
        };
    }

    function selectedStyle() {
        return {
            color: "#ffe0a0",
            weight: 2.0,
            opacity: 1,
            fillOpacity: imageryAvailable() ? 0.13 : 0.94,
            dashArray: null
        };
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
            pane: GRID_PANE,
            color: "#d3ddd7",
            opacity: 0.13,
            weight: 0.55,
            dashArray: "2 7",
            lineCap: "round",
            interactive: false,
            smoothFactor: 1
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
                pane: LABEL_PANE,
                icon: labelIcon(longitudeText(lon), "longitude"),
                interactive: false,
                keyboard: false
            }));
        }
        for (var lat = Math.ceil(south / 15) * 15; lat <= north; lat += 15) {
            coordinateLabels.addLayer(L.marker([lat, labelLon], {
                pane: LABEL_PANE,
                icon: labelIcon(latitudeText(lat), "latitude"),
                interactive: false,
                keyboard: false
            }));
        }
    }

    function openCacheDb() {
        if (!window.indexedDB) return Promise.resolve(null);
        return new Promise(function (resolve) {
            var request;
            try {
                request = window.indexedDB.open(CACHE_DB, 1);
            } catch (_) {
                resolve(null);
                return;
            }
            request.onupgradeneeded = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { resolve(null); };
            request.onblocked = function () { resolve(null); };
        });
    }

    function readCachedTexture() {
        return openCacheDb().then(function (db) {
            if (!db) return null;
            return new Promise(function (resolve) {
                var request;
                try {
                    request = db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get(CACHE_KEY);
                } catch (_) {
                    db.close();
                    resolve(null);
                    return;
                }
                request.onsuccess = function () { db.close(); resolve(request.result || null); };
                request.onerror = function () { db.close(); resolve(null); };
            });
        }).catch(function () { return null; });
    }

    function writeCachedTexture(blob) {
        return openCacheDb().then(function (db) {
            if (!db) return false;
            return new Promise(function (resolve) {
                var transaction;
                try {
                    transaction = db.transaction(CACHE_STORE, "readwrite");
                    transaction.objectStore(CACHE_STORE).put(blob, CACHE_KEY);
                } catch (_) {
                    db.close();
                    resolve(false);
                    return;
                }
                transaction.oncomplete = function () { db.close(); resolve(true); };
                transaction.onerror = function () { db.close(); resolve(false); };
                transaction.onabort = function () { db.close(); resolve(false); };
            });
        }).catch(function () { return false; });
    }

    function fetchBlueMarbleTexture() {
        if (navigator.onLine === false || typeof window.fetch !== "function") return Promise.resolve(null);
        return window.fetch(BLUE_MARBLE_URL, {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            cache: "force-cache"
        }).then(function (response) {
            if (!response.ok) throw new Error("NASA raster request returned " + response.status);
            return response.blob();
        }).then(function (blob) {
            if (!blob || !blob.size) throw new Error("NASA raster response was empty");
            return writeCachedTexture(blob).then(function (stored) {
                textureStored = !!stored;
                return blob;
            });
        }).catch(function (error) {
            console.warn("[OMEGA Atlas] Offline raster cache unavailable:", error && error.message ? error.message : error);
            return null;
        });
    }

    function loadBlueMarbleImage() {
        if (blueMarblePromise) return blueMarblePromise;
        blueMarblePromise = readCachedTexture().then(function (cachedBlob) {
            if (cachedBlob) textureStored = true;
            return cachedBlob || fetchBlueMarbleTexture();
        }).then(function (blob) {
            if (!blob) return null;
            return new Promise(function (resolve) {
                var objectUrl;
                try {
                    objectUrl = URL.createObjectURL(blob);
                } catch (_) {
                    resolve(null);
                    return;
                }
                var image = new Image();
                image.onload = function () {
                    blueMarbleImage = image;
                    URL.revokeObjectURL(objectUrl);
                    resolve(image);
                };
                image.onerror = function () {
                    URL.revokeObjectURL(objectUrl);
                    resolve(null);
                };
                image.src = objectUrl;
            });
        }).catch(function () { return null; });
        return blueMarblePromise;
    }

    function createBlueMarbleLayer() {
        if (blueMarbleLayer || !L.GridLayer || !blueMarbleImage) return blueMarbleLayer;

        var RasterGridLayer = L.GridLayer.extend({
            createTile: function (coords, done) {
                var size = this.getTileSize();
                var canvas = document.createElement("canvas");
                canvas.width = size.x;
                canvas.height = size.y;
                var context = canvas.getContext("2d", { alpha: false });
                if (!context || !blueMarbleImage) {
                    if (context) {
                        context.fillStyle = "#183541";
                        context.fillRect(0, 0, size.x, size.y);
                    }
                    done(null, canvas);
                    return canvas;
                }

                var divisions = Math.pow(2, coords.z);
                if (coords.y < 0 || coords.y >= divisions) {
                    context.fillStyle = "#183541";
                    context.fillRect(0, 0, size.x, size.y);
                    done(null, canvas);
                    return canvas;
                }

                var wrappedX = ((coords.x % divisions) + divisions) % divisions;
                var sourceWidth = blueMarbleImage.naturalWidth / divisions;
                var sourceX = wrappedX * sourceWidth;
                var worldPixelHeight = size.y * divisions;

                function sourceYForMercatorPixel(pixelY) {
                    var normalizedY = pixelY / worldPixelHeight;
                    var mercator = Math.PI * (1 - 2 * normalizedY);
                    var latitude = Math.atan(Math.sinh(mercator)) * 180 / Math.PI;
                    return (90 - latitude) / 180 * blueMarbleImage.naturalHeight;
                }

                var sourceY = sourceYForMercatorPixel(coords.y * size.y);
                var sourceYBottom = sourceYForMercatorPixel((coords.y + 1) * size.y);
                var sourceHeight = Math.max(1, sourceYBottom - sourceY);

                try {
                    context.drawImage(
                        blueMarbleImage,
                        sourceX,
                        sourceY,
                        sourceWidth,
                        sourceHeight,
                        0,
                        0,
                        size.x,
                        size.y
                    );
                } catch (_) {
                    context.fillStyle = "#183541";
                    context.fillRect(0, 0, size.x, size.y);
                }
                done(null, canvas);
                return canvas;
            }
        });

        blueMarbleLayer = new RasterGridLayer({
            tileSize: 256,
            minZoom: 0,
            maxZoom: 8,
            noWrap: false,
            opacity: 1,
            zIndex: 180,
            updateWhenIdle: true,
            keepBuffer: 1,
            attribution: "NASA Blue Marble: Next Generation (NASA/GSFC; Reto Stöckli and collaborators)"
        });
        return blueMarbleLayer;
    }

    function attachBlueMarbleFallback() {
        if (!active || !blueMarbleImage) return;
        textureReady = true;
        var layer = createBlueMarbleLayer();
        if (layer && !window.map.hasLayer(layer)) layer.addTo(window.map);
        styleCountries();
        window.OMEGA_OFFLINE_ATLAS_STATUS = {
            active: active,
            remoteImagery: remoteImageryReady,
            offlineRasterCached: true,
            rasterSource: "NASA Blue Marble: Next Generation"
        };
    }

    function ensureSatelliteLayer() {
        var URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

        if (window.currentMapTileLayer && window.map.hasLayer(window.currentMapTileLayer)) {
            window.map.removeLayer(window.currentMapTileLayer);
        }
        window.currentMapTileLayer = null;

        if (window.satelliteLayer && window.map.hasLayer(window.satelliteLayer)) {
            window.map.removeLayer(window.satelliteLayer);
        }

        if (!atlasSatelliteLayer) {
            atlasSatelliteLayer = L.tileLayer(URL, {
                attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
                maxZoom: 8,
                opacity: 0.97,
                zIndex: 230,
                keepBuffer: 2,
                updateWhenIdle: true
            });
            atlasSatelliteLayer.on("tileload", function () {
                if (!remoteImageryReady) {
                    remoteImageryReady = true;
                    styleCountries();
                    window.OMEGA_OFFLINE_ATLAS_STATUS = {
                        active: active,
                        remoteImagery: true,
                        offlineRasterCached: textureStored,
                        rasterSource: textureReady ? "NASA Blue Marble: Next Generation" : null
                    };
                }
            });
            atlasSatelliteLayer.on("tileerror", function (event) {
                if (!remoteImageryReady) {
                    console.info("[OMEGA Atlas] Satellite tile unavailable; cached global raster will be used when present.", event && event.coords);
                }
            });
        }

        atlasSatelliteLayer.setZIndex(230);
        if (!window.map.hasLayer(atlasSatelliteLayer)) atlasSatelliteLayer.addTo(window.map);
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
            ensureSatelliteLayer();
            if (!gridLayer) createGraticule();
            gridLayer.addTo(window.map);
            if (coordinateLabels) coordinateLabels.addTo(window.map);
            if (document.body) document.body.classList.add("omega-offline-hybrid-active");
        }

        if (blueMarbleImage) attachBlueMarbleFallback();
        styleCountries();
        updateCoordinateLabels();
        syncButton();

        loadBlueMarbleImage().then(function (image) {
            if (image) {
                textureReady = true;
                if (active) attachBlueMarbleFallback();
                return;
            }

            // A late cache/network failure must not overwrite the status of a
            // different map layer selected while the image request was pending.
            if (!active) return;
            styleCountries();
            window.OMEGA_OFFLINE_ATLAS_STATUS = {
                active: true,
                remoteImagery: remoteImageryReady,
                offlineRasterCached: textureStored,
                rasterSource: null,
                note: "A first online connection is needed to fetch the NASA overview image; persistent offline use also requires browser storage."
            };
        });

        if (typeof Game.showNotification === "function") {
            Game.showNotification(
                "HYBRID SATELLITE ATLAS",
                "Detailed satellite tiles are preferred. A NASA Blue Marble overview can be cached locally after a successful online load for later offline use.",
                "info"
            );
        }
    }

    function deactivate() {
        if (!active) return;
        active = false;

        [atlasSatelliteLayer, blueMarbleLayer, gridLayer, coordinateLabels].forEach(function (layer) {
            if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
        });

        remoteImageryReady = false;
        if (document.body) document.body.classList.remove("omega-offline-hybrid-active");
        styleCountries();
        syncButton();
        window.OMEGA_OFFLINE_ATLAS_STATUS = {
            active: false,
            remoteImagery: false,
            offlineRasterCached: textureStored,
            rasterSource: blueMarbleImage ? "NASA Blue Marble: Next Generation" : null
        };
    }

    window.OmegaOfflineHybridAtlas = {
        activate: activate,
        deactivate: deactivate,
        isActive: function () { return active; },
        redraw: updateCoordinateLabels,
        getStatus: function () {
            return window.OMEGA_OFFLINE_ATLAS_STATUS || {
                active: active,
                remoteImagery: remoteImageryReady,
                offlineRasterCached: textureStored
            };
        }
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

    // Chrome mobile can shrink the visible viewport when its address/search bars are shown.
    // Keep the layer drawer inside that visible region instead of behind browser chrome.
    function updateVisibleViewportSize() {
        var viewport = window.visualViewport;
        var height = viewport && viewport.height ? viewport.height : window.innerHeight;
        var offsetTop = viewport && Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0;
        document.documentElement.style.setProperty("--omega-visible-height", Math.max(180, Math.round(height)) + "px");
        document.documentElement.style.setProperty("--omega-visible-offset-top", Math.max(0, Math.round(offsetTop)) + "px");
    }

    function handleLayerOptionClick(event) {
        var target = event.target;
        // Clicks can originate from nested SVG/text nodes inside a button.
        if (target && target.nodeType === 3) target = target.parentElement;
        var button = target && typeof target.closest === "function"
            ? target.closest("#layers-drawer .layer-opt-btn[data-layer]")
            : null;
        if (!button || button.disabled) return;

        // Capture-phase routing makes the offline control work even if the legacy
        // Game.init() click binding was skipped or another UI layer changed event order.
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

        var layerType = button.getAttribute("data-layer");
        try {
            if (layerType === "offline-hybrid") {
                if (!window.OmegaOfflineHybridAtlas || typeof window.OmegaOfflineHybridAtlas.activate !== "function") {
                    throw new Error("Offline hybrid atlas runtime is unavailable.");
                }
                window.OmegaOfflineHybridAtlas.activate();
            } else {
                var switcher = window.Game && window.Game.switchMapLayer;
                if (typeof switcher !== "function") throw new Error("Map layer controller is unavailable.");
                switcher.call(window.Game, layerType);
            }

            document.querySelectorAll("#layers-drawer .layer-opt-btn").forEach(function (item) {
                item.classList.toggle("active", item === button);
                item.setAttribute("aria-pressed", String(item === button));
            });
        } catch (error) {
            console.error("[OMEGA Atlas] Map-layer button action failed:", error);
            if (window.Game && typeof window.Game.showNotification === "function") {
                window.Game.showNotification("MAP LAYER ERROR", "The selected map layer could not be activated. See the browser console for details.", "warning");
            }
        }
    }

    // One reliable touch/mouse path for every button in the existing layer drawer.
    document.addEventListener("click", handleLayerOptionClick, true);
    updateVisibleViewportSize();
    window.addEventListener("resize", updateVisibleViewportSize, { passive: true });
    window.addEventListener("orientationchange", updateVisibleViewportSize, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateVisibleViewportSize, { passive: true });
        window.visualViewport.addEventListener("scroll", updateVisibleViewportSize, { passive: true });
    }

    window.map.on("moveend zoomend", updateCoordinateLabels);
    window.addEventListener("online", function () {
        if (active && !blueMarbleImage) {
            blueMarblePromise = null;
            loadBlueMarbleImage().then(function (image) {
                if (image) {
                    textureReady = true;
                    attachBlueMarbleFallback();
                }
            });
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        syncButton();
        if (window.OMEGA_ANDROID_OFFLINE) activate();
    });
})();
