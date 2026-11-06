/* OMEGA browser offline shell cache.
 * Same-origin app files are cached for offline relaunch; remote map tiles are never cached here.
 */
"use strict";
const CACHE_NAME = "omega-offline-atlas-shell-v96";
const DATA_CACHE_NAME = "omega-country-data-v1";
const DATA_CACHE_MAX_ENTRIES = 48;
const DATA_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const DATA_CACHE_MAX_ENTRY_BYTES = 12 * 1024 * 1024;
const DATA_NETWORK_TIMEOUT_MS = 2200;
const DATA_CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DATA_CACHE_TOUCH_INTERVAL_MS = 60 * 1000;
const MAX_BACKGROUND_DATA_REFRESHES = 2;
let activeBackgroundDataRefreshes = 0;
let dataCacheMutation = Promise.resolve();
const APP_BASE = new URL("./", self.location.href);
const INDEX_URL = new URL("index.html", APP_BASE).href;
const DATA_CACHE_META_URL = new URL("__omega-data-cache-index__", APP_BASE).href;
const CORE_ASSETS = [
  "./", "./index.html", "./omega_android_compat_v1.js", "./world.json", "./leaflet.js", "./leaflet.css",
  "./style.css", "./design-tokens.js", "./omega_action_progress_v1.js", "./map-engine-1.js", "./map-engine-2.js",
  "./omega_game_lifecycle_runtime_v1.js", 
  "./omega_shared_number_format_v1.js",
  "./omega_boot_performance_monitor_v1.js", "./omega_enterprise_composition_root_v10.js",
  "./omega_ui_photo_asset_system_v1.js",  "./omega_ui_photo_asset_catalog_v1.json",
  "./omega_country_runtime_data_v1.js", "./omega_world_simulation_scheduler_v1.js", "./omega_country_general_data_runtime_v1.js", "./omega_country_data_gateway_v1.js", "./omega_country_behavior_engine_v1.js", "./omega_country_overview_ministry_ui_v1.js", "./omega_country_sector_profile_ui_v1.js",   "./country_sector_profile_schema_v1.json",  "./resource_site_reserve_simulation_v1.json", 
  "./offline-hybrid-map.js", "./offline-hybrid-map.css",
  "./omega_forex_monetary_engine_v1.js", 
  "./omega_government_banking_runtime_v1.js", "./omega_world_bank_lending_runtime_v1.js", "./omega_economic_transmission_runtime_v1.js",
  "./government_banking_rules_v1.json", "./financial_transmission_rules_v1.json",
  "./omega_finance_ministry_runtime_v1.js", 
  "./economy_global_profiles_v1.json", "./resource_country_resource_context_index.json", "./resource_economy_rules.json", "./country_primary_resource_opening_baseline_v1.json",       "./finance_runtime_rules_v1.json",
  "./finance_sector_registry_v1.json",
  "./omega_macro_stability_runtime_v1.js", 
  "./economy_raw_financial_data_v2.json", "./finance_macro_stability_rules_v1.json",
  "./omega_home_ministry_engine_v1.js", "./omega_home_ministry_training_materials_runtime_v1.js", "./omega_home_ministry_ui_v1.js",
  "./omega_home_ministry_budget_ui_v2.js", "./omega_home_ministry_world_police_runtime_v1.js",
  "./omega_home_ministry_police_operations_ui_v1.js", "./omega_home_ministry_police_capability_runtime_v1.js",
  "./omega_home_ministry_police_capability_recommendations_v1.json", "./omega_home_ministry_police_capability_material_requirements_v1.json", "./omega_home_ministry_country_police_baseline_v1.json",
  "./omega_battlefield_command_runtime_v1.js", "./military_command_catalog_v1.json", "./resource_industrial_catalog_v1.json",
  "./omega_factory_visual_catalog_v1.js", "./omega_country_factory_starting_baseline_v1.js", "./omega_private_enterprise_registry_v1.js", "./country_private_factory_starting_baseline_v1.json", "./omega_factory_visual_catalog_v1.json",
  "./assets/factories/omega_factory_atlas_01.webp", "./assets/factories/omega_factory_atlas_02.webp", "./assets/factories/omega_factory_atlas_03.webp",
  "./omega_resource_industrial_network_v1.js", "./omega_resource_startup_baseline_v1.js", "./resource_startup_baseline_rules_v1.json", "./omega_country_inventory_runtime_v1.js", "./omega_resource_command_center_ui_v1.js", "./omega_icon_system_v1.js",
  "./omega_icon_system_v1.css",
  "./omega_logistics_transport_catalog_v1.json",
  "./assets/omega-industrial-icons-v1/transport/cargo/coal-dry-bulk/truck.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/coal-dry-bulk/train.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/coal-dry-bulk/ship.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/coal-dry-bulk/barge.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/coal-dry-bulk/pipeline.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/oil-liquid/truck.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/oil-liquid/train.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/oil-liquid/ship.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/oil-liquid/barge.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/oil-liquid/pipeline.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/gas-lng/truck.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/gas-lng/train.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/gas-lng/ship.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/gas-lng/barge.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/gas-lng/pipeline.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/ore-aggregate/truck.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/ore-aggregate/train.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/ore-aggregate/ship.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/ore-aggregate/barge.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/ore-aggregate/pipeline.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/general-cargo/truck.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/general-cargo/train.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/general-cargo/ship.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/general-cargo/barge.svg",
  "./assets/omega-industrial-icons-v1/transport/cargo/general-cargo/pipeline.svg",
  "./assets/omega-industrial-icons-v1/transport/mine-origin.svg",
  "./assets/omega-industrial-icons-v1/transport/route-mine-origin.svg",
  "./assets/omega-industrial-icons-v1/transport/warehouse-destination.svg",
  "./assets/omega-industrial-icons-v1/transport/route-warehouse-destination.svg",
  "./assets/omega-industrial-icons-v1/logistics/mine-site.svg",
  "./assets/omega-industrial-icons-v1/logistics/warehouse-node.svg", 
  "./omega_resource_quantity_normalization_v1.js", "./resource_site_quantity_completion_v1.json", "./resource_type_extensions_v1.json",
  "./omega_resource_endowment_runtime.js", "./omega_resource_gameplay_binding_v1.js",
  "./omega_resource_mine_management_v1.js", "./resource_site_country_mineplay_batch_20261020_v1.json", "./resource_site_country_mineplay_batch_20261024_v1.json", "./resource_site_country_mineplay_critical_batch_20261024_v1.json",
  "./resource_site_canonical_catalog_v1.json", "./resource_site_master_registry_v1.json",
  "./resource_site_country_expansion_v1.json",
  "./resource_site_logistics_routes_v1.json",
  "./resource_site_logistics_routes_v1_part_01.json",
  "./resource_site_logistics_routes_v1_part_02.json",
  "./resource_site_logistics_routes_v1_part_03.json",
  "./resource_site_logistics_routes_v1_part_04.json",
  "./resource_site_logistics_routes_v1_part_05.json",
  "./resource_site_logistics_routes_v1_part_06.json",
  "./omega_minister_identity_pool_v1.js", "./minister_country_roster_manifest_v1.json", "./ministers.json",
  "./omega_ui_v2/omega-ui-v2.css",
  "./omega_ui_v2/ministry-visual-refresh.css",
  "./omega_ui_v2/atlas-command-polish.css",
  "./omega_ui_v2/legacy-disconnect.css",
  "./omega_ui_v2/factory-production-command.css",
  "./omega_ui_v2/resource-ministry-premium.css",
  "./omega_ui_v2/navigation-registry.js",
  "./omega_ui_v2/ministry-visual-registry.js",
  "./omega_ui_v2/screens/government.js",
  "./omega_ui_v2/screens/ministry-detail.js",
  "./omega_ui_v2/screens/economy.js",
  "./omega_ui_v2/screens/resource-ministry.js",
  "./omega_ui_v2/screens/mine-detail.js",
  "./omega_ui_v2/screens/industry.js",
  "./omega_ui_v2/screens/home-affairs.js",
  "./omega_ui_v2/screens/police-fleet.js",
  "./omega_ui_v2/screens/reports.js",
  "./omega_ui_v2/app.js",
  "./omega_ui_v2/integration.js",
  "./omega_ui_v2/world-command-dock.js",
  "./omega_ui_v2/resource-ministry-legacy-bridge.js",
  "./omega_ui_v2/text-presentation.js",
  "./assets/ministry-logos/cabinet_council.svg",
  "./assets/ministry-logos/trade.svg",
  "./assets/ministry-logos/production.svg",
  "./assets/ministry-logos/taxes.svg",
  "./assets/ministry-logos/central_bank.svg",
  "./assets/ministry-logos/laws.svg",
  "./assets/ministry-logos/education.svg",
  "./assets/ministry-logos/infrastructure.svg",
  "./assets/ministry-logos/science_research.svg",
  "./assets/ministry-logos/agriculture_food.svg",
  "./assets/ministry-logos/interior_security.svg",
  "./assets/ministry-logos/energy_mining.svg",
  "./assets/ministry-logos/intelligence_cyber.svg",
  "./assets/ministry-logos/treasury_finance.svg",
  "./assets/ministry-logos/mega_projects.svg",
  "./assets/Military_Ministry_Logo_Concept_A.png.jpg",
  "./assets/IMG_20260703_180105.jpg",
  "./assets/ministers/health.svg",
  "./assets/ui-photos/education-university.svg",
  "./assets/omega-industrial-icons-v1/transport/route-mine-origin.svg",
  "./assets/omega-industrial-icons-v1/transport/route-warehouse-destination.svg",
];

function isShellAsset(value) {
  try {
    const url = new URL(value, INDEX_URL);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE.pathname)) return false;
    if (/\.(?:m?js|css|woff2?)$/i.test(url.pathname)) return true;
    return /\/(?:index\.html?|world\.json|economy_global_profiles_v1\.json|resource_economy_rules\.json|country_primary_resource_opening_baseline_v1\.json)$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function isLocalAppUrl(value) {
  return isShellAsset(value);
}

function isDataRequest(url) {
  // The compact bootstrap stays in the shell. All larger mutable records and
  // media assets use the bounded data cache and are downloaded only when used.
  if (/\/(?:world\.json|economy_global_profiles_v1\.json)$/i.test(url.pathname)) return false;
  return /\/api\/omega\/country-(?:domain|general-data|sector-profile)\//i.test(url.pathname) ||
    /\.(?:json|geojson|png|jpe?g|webp|avif|svg|woff2?)$/i.test(url.pathname);
}

function withDataCacheLock(work) {
  const next = dataCacheMutation.then(work, work);
  dataCacheMutation = next.catch(() => undefined);
  return next;
}

async function readDataCacheIndex(cache) {
  try {
    const response = await cache.match(DATA_CACHE_META_URL);
    if (!response) return [];
    const value = await response.json();
    return Array.isArray(value) ? value.filter(row => row && typeof row.url === "string") : [];
  } catch (_) {
    return [];
  }
}

async function writeDataCacheIndex(cache, rows) {
  await cache.put(DATA_CACHE_META_URL, new Response(JSON.stringify(rows), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  }));
}

async function rememberDataResponse(cache, request, response) {
  return withDataCacheLock(async () => {
    const rawLength = response.headers.get("content-length");
    const declared = rawLength == null || rawLength === "" ? NaN : Number(rawLength);
    let size = Number.isFinite(declared) && declared >= 0 ? declared : null;
    if (size === null) {
      try { size = (await response.clone().arrayBuffer()).byteLength; }
      catch (_) { return false; }
    }
    if (size > DATA_CACHE_MAX_ENTRY_BYTES) {
      await cache.delete(request);
      const existing = await readDataCacheIndex(cache);
      const rows = existing.filter(row => row.url !== request.url);
      await writeDataCacheIndex(cache, rows);
      return false;
    }
    await cache.put(request, response.clone());
    const existingRows = await readDataCacheIndex(cache);
    const checkedAt = Date.now();
    const rows = existingRows.filter(row => row.url !== request.url);
    rows.push({ url: request.url, size, usedAt: checkedAt, checkedAt });
    rows.sort((left, right) => Number(left.usedAt) - Number(right.usedAt));
    let total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.size) || 0), 0);
    while (rows.length > DATA_CACHE_MAX_ENTRIES || total > DATA_CACHE_MAX_BYTES) {
      const oldest = rows.shift();
      if (!oldest) break;
      total -= Math.max(0, Number(oldest.size) || 0);
      await cache.delete(oldest.url);
    }
    await writeDataCacheIndex(cache, rows);
    return true;
  });
}

async function forgetDataResponse(cache, request) {
  return withDataCacheLock(async () => {
    await cache.delete(request);
    const rows = (await readDataCacheIndex(cache)).filter(row => row.url !== request.url);
    await writeDataCacheIndex(cache, rows);
  });
}

async function touchDataResponse(cache, request) {
  return withDataCacheLock(async () => {
    const rows = await readDataCacheIndex(cache);
    const row = rows.find(item => item.url === request.url);
    if (!row) return;
    const now = Date.now();
    if (now - Number(row.usedAt || 0) < DATA_CACHE_TOUCH_INTERVAL_MS) return;
    row.usedAt = now;
    rows.sort((left, right) => Number(left.usedAt) - Number(right.usedAt));
    await writeDataCacheIndex(cache, rows);
  });
}

async function fetchDataWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function serveCachedData(cache, request, cached) {
  if (!cached) return null;
  await touchDataResponse(cache, request);
  const headers = new Headers(cached.headers);
  headers.set("X-OMEGA-OFFLINE-STALE", "1");
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
}
async function notifyCachedDataChanged(request, previous, response) {
  if (!previous || !response) return;
  const oldVersion = previous.headers.get("etag") || previous.headers.get("last-modified") || "";
  const newVersion = response.headers.get("etag") || response.headers.get("last-modified") || "";
  if (!oldVersion || !newVersion || oldVersion === newVersion) return;
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({
      type: "OMEGA_CACHE_DATA_UPDATED", url: request.url,
      previousVersion: oldVersion, currentVersion: newVersion
    });
  } catch (_) {}
}
async function notifyDataRemoved(request) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "OMEGA_CACHE_DATA_REMOVED", url: request.url });
  } catch (_) {}
}
async function refreshCachedData(cache, request, previous) {
  try {
    const response = await fetchDataWithTimeout(request);
    if (!response) return;
    if (response.ok && response.type !== "opaque") {
      await rememberDataResponse(cache, request, response);
      await notifyCachedDataChanged(request, previous, response);
    } else if (response.status === 404 || response.status === 410) {
      await forgetDataResponse(cache, request);
      await notifyDataRemoved(request);
    }
  } catch (_) {
    // Cached data remains intact during an offline or slow-network refresh.
  }
}
async function networkFirstData(request, fetchEvent) {
  const cache = await caches.open(DATA_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    // Offline-first: serve a valid local copy immediately and refresh in the
    // background. The page is notified if the source version changes or vanishes.
    if (!(self.navigator && self.navigator.onLine === false)) {
      const refresh = refreshCachedDataIfDue(cache, request, cached);
      if (fetchEvent && typeof fetchEvent.waitUntil === "function") fetchEvent.waitUntil(refresh);
      else void refresh;
    }
    return serveCachedData(cache, request, cached);
  }
  try {
    const response = await fetchDataWithTimeout(request);
    if (response && response.ok && response.type !== "opaque") {
      await rememberDataResponse(cache, request, response);
      return response;
    }
    if (response && (response.status === 404 || response.status === 410)) {
      await forgetDataResponse(cache, request);
      return response;
    }
    if (response && response.status >= 500) {
      const latest = await cache.match(request);
      if (latest) return serveCachedData(cache, request, latest);
      return response;
    }
  } catch (_) {
    // First-time fetches are also bounded; return an explicit offline miss.
  }
  const latest = await cache.match(request);
  return await serveCachedData(cache, request, latest) ||
    new Response("OMEGA offline data has not been downloaded on this device yet.", {
      status: 504, statusText: "Offline data unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
}

async function refreshCachedDataIfDue(cache, request, previous) {
  // Never fan out every cache hit into more network work. Two refreshes maximum
  // may run at once, and each exact URL is checked at most once per cooldown.
  if (activeBackgroundDataRefreshes >= MAX_BACKGROUND_DATA_REFRESHES) return false;
  activeBackgroundDataRefreshes += 1;
  try {
    const shouldRefresh = await withDataCacheLock(async () => {
      const rows = await readDataCacheIndex(cache);
      const now = Date.now();
      let row = rows.find(item => item.url === request.url);
      if (row && now - Number(row.checkedAt || 0) < DATA_CACHE_REFRESH_INTERVAL_MS) return false;
      if (!row) {
        row = { url: request.url, size: 0, usedAt: now };
        rows.push(row);
      }
      row.checkedAt = now;
      await writeDataCacheIndex(cache, rows);
      return true;
    });
    if (!shouldRefresh) return false;
    await refreshCachedData(cache, request, previous);
    return true;
  } finally {
    activeBackgroundDataRefreshes = Math.max(0, activeBackgroundDataRefreshes - 1);
  }
}

async function fetchAndCache(cache, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, { cache: "reload", signal: controller.signal });
    if (response && response.ok && response.type !== "opaque")
      await cache.put(url, response.clone());
    return response;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const assets = new Set(CORE_ASSETS.filter(isShellAsset).map(asset => new URL(asset, APP_BASE).href));
    const htmlResponse = await fetchAndCache(cache, INDEX_URL);
    if (htmlResponse && htmlResponse.ok) {
      await cache.put(APP_BASE.href, htmlResponse.clone());
      const html = await htmlResponse.text();
      const refs = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
      let match;
      while ((match = refs.exec(html)) !== null) {
        if (isLocalAppUrl(match[1])) assets.add(new URL(match[1], INDEX_URL).href);
      }
    }
    // Icons are small static assets. Large country/resource datasets remain on-demand.
    const factoryIconManifestUrl = new URL("./assets/omega-industrial-icons-v1/manifest.json", APP_BASE).href;
    let factoryIconManifest = null;
    try {
      const response = await fetch(factoryIconManifestUrl, { cache: "no-store" });
      if (response && response.ok) factoryIconManifest = await response.json();
    } catch (_) {}
    if (factoryIconManifest) {
      for (const group of ["factories", "resources", "transportVariants"]) {
        const rows = Array.isArray(factoryIconManifest[group]) ? factoryIconManifest[group] : [];
        for (const icon of rows) {
          const file = String(icon && icon.file || "");
          if (/^(?:factories|resources)\/[a-z0-9-]+\.svg$/.test(file) ||
              /^transport\/variants\/[a-z0-9-]+\.svg$/.test(file)) {
            assets.add(new URL("./assets/omega-industrial-icons-v1/" + file, APP_BASE).href);
          }
        }
      }
    }
    const urls = [...assets];
    let cursor = 0;
    const workers = Array.from({ length: 2 }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        await fetchAndCache(cache, url);
      }
    });
    await Promise.all(workers.map(worker => worker.catch(() => null)));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("omega-offline-atlas-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE.pathname)) return;

  event.respondWith((async () => {
    if (isDataRequest(url)) return networkFirstData(request, event);

    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request) ||
      (request.mode === "navigate"
        ? await cache.match(APP_BASE.href) || await cache.match(INDEX_URL)
        : null);
    if (cached) {
      // A shell cache hit must stay local. The versioned install process refreshes
      // scripts/styles once per release; only a navigation checks the HTML shell.
      if (request.mode === "navigate") {
        event.waitUntil(fetchAndCache(cache, url.href).then(() => undefined));
      }
      return cached;
    }
    const response = await fetchAndCache(cache, url.href);
    if (response && response.ok) return response;
    if (request.mode === "navigate") {
      const shell = await cache.match(APP_BASE.href) || await cache.match(INDEX_URL);
      if (shell) return shell;
    }
    return new Response("OMEGA offline app asset is not cached yet.", {
      status: 504, statusText: "Offline asset unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});