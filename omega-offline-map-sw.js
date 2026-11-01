/* OMEGA browser offline shell cache.
 * Same-origin app files are cached for offline relaunch; remote map tiles are never cached here.
 */
"use strict";
const CACHE_NAME = "omega-offline-atlas-shell-v70";
const APP_BASE = new URL("./", self.location.href);
const INDEX_URL = new URL("index.html", APP_BASE).href;
const CORE_ASSETS = [
  "./", "./index.html",
  "./leaflet.js", "./leaflet.css", "./style.css", "./design-tokens.js",
  "./omega_action_progress_v1.js", "./omega_icon_system_v1.js", "./omega_icon_system_v1.css",
  "./omega_country_runtime_data_v1.js", "./omega_simulation_runtime.js",
  "./map-engine-1.js", "./map-engine-2.js", "./offline-hybrid-map.js", "./offline-hybrid-map.css",
  "./omega_game_lifecycle_runtime_v1.js", "./omega_shared_number_format_v1.js",
  "./omega_kernel.js", "./game-logic.js", "./country-ios.js",
  "./omega_boot_performance_monitor_v1.js", "./omega_enterprise_composition_root_v10.js",
  "./omega_country_general_data_loader_v1.js"
];
const PRECACHE_CONCURRENCY = 3;

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

function isPrecacheRuntimeAsset(value) {
  try {
    const url = new URL(value, INDEX_URL);
    return isLocalAppUrl(value) && /\\.(?:m?js|css)$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

async function precacheInBatches(cache, urls) {
  for (let index = 0; index < urls.length; index += PRECACHE_CONCURRENCY) {
    const batch = urls.slice(index, index + PRECACHE_CONCURRENCY);
    await Promise.allSettled(batch.map(url => fetchAndCache(cache, url)));
    if (index + PRECACHE_CONCURRENCY < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the small shell and same-origin runtime code only. Large JSON datasets
    // are cached by the fetch handler when their owning runtime actually requests them.
    const assets = new Set(CORE_ASSETS.map(asset => new URL(asset, APP_BASE).href));
    const htmlResponse = await fetchAndCache(cache, INDEX_URL);
    if (htmlResponse && htmlResponse.ok) {
      await cache.put(APP_BASE.href, htmlResponse.clone());
      const html = await htmlResponse.text();
      const refs = /(?:src|href)\\s*=\\s*["']([^"']+)["']/gi;
      let match;
      while ((match = refs.exec(html)) !== null) {
        if (isPrecacheRuntimeAsset(match[1])) assets.add(new URL(match[1], INDEX_URL).href);
      }
    }
    // A bounded worker pool prevents the install event from opening one request per
    // script tag at once. JSON, map enrichment and research packs stay demand-cached.
    await precacheInBatches(cache, Array.from(assets));
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
