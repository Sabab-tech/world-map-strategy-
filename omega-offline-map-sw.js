/* OMEGA browser offline shell cache.
 * Same-origin app files are cached for offline relaunch; remote map tiles are never cached here.
 */
"use strict";
const CACHE_NAME = "omega-offline-atlas-shell-v9";
const APP_BASE = new URL("./", self.location.href);
const INDEX_URL = new URL("index.html", APP_BASE).href;
const CORE_ASSETS = [
  "./", "./index.html", "./world.json", "./leaflet.js", "./leaflet.css",
  "./style.css", "./map-engine-1.js", "./map-engine-2.js",
  "./omega_game_lifecycle_runtime_v1.js", "./omega_game_lifecycle_runtime_v1.css",
  "./omega_ui_system_redesign_v1.css", "./omega_ui_system_redesign_v1.js",
  "./omega_country_runtime_data_v1.js", "./cities.json",
  "./offline-hybrid-map.js", "./offline-hybrid-map.css",
  "./omega_forex_monetary_engine_v1.js", "./omega_forex_monetary_engine_v1.css",
  "./omega_government_banking_runtime_v1.js", "./omega_economic_transmission_runtime_v1.js",
  "./government_banking_rules_v1.json", "./financial_transmission_rules_v1.json",
  "./omega_finance_ministry_runtime_v1.js", "./omega_finance_ministry_v1.css",
  "./economy_global_profiles_v1.json", "./economy.json", "./population.json", "./finance_runtime_rules_v1.json",
  "./finance_sector_registry_v1.json",
  "./resource_industrial_catalog_v1.json",
  "./omega_macro_stability_runtime_v1.js", "./omega_macro_stability_v1.css",
  "./economy_raw_financial_data_v2.json", "./finance_macro_stability_rules_v1.json",
  "./omega_home_ministry_engine_v1.js", "./omega_home_ministry_ui_v1.js",
  "./omega_home_ministry_budget_ui_v2.js", "./omega_home_ministry_world_police_runtime_v1.js",
  "./omega_home_ministry_police_operations_ui_v1.js", "./omega_home_ministry_country_police_baseline_v1.json",
  "./omega_battlefield_command_runtime_v1.js", "./military_command_catalog_v1.json"
];

function isLocalAppUrl(value) {
  try {
    const url = new URL(value, INDEX_URL);
    return url.origin === self.location.origin &&
      url.pathname.startsWith(APP_BASE.pathname) &&
      /\.(?:html?|js|mjs|css|json|png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

async function fetchAndCache(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (response && response.ok && response.type !== "opaque") {
      await cache.put(url, response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const assets = new Set(CORE_ASSETS.map(asset => new URL(asset, APP_BASE).href));
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
    await Promise.allSettled(Array.from(assets).map(url => fetchAndCache(cache, url)));
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
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true }) ||
      (request.mode === "navigate"
        ? await cache.match(APP_BASE.href) || await cache.match(INDEX_URL)
        : null);

    if (cached) {
      event.waitUntil(fetchAndCache(cache, url.href).then(() => undefined));
      return cached;
    }

    const response = await fetchAndCache(cache, url.href);
    if (response && response.ok) return response;
    if (request.mode === "navigate") {
      const shell = await cache.match(APP_BASE.href) || await cache.match(INDEX_URL);
      if (shell) return shell;
    }
    return new Response("OMEGA offline resource is not cached yet.", {
      status: 504, statusText: "Offline resource unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});
