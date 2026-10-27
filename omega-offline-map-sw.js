/* OMEGA browser offline shell cache.
 * Same-origin app files are cached for offline relaunch; remote map tiles are never cached here.
 */
"use strict";
const CACHE_NAME = "omega-offline-atlas-shell-v49";
const APP_BASE = new URL("./", self.location.href);
const INDEX_URL = new URL("index.html", APP_BASE).href;
const CORE_ASSETS = [
  "./", "./index.html", "./world.json", "./leaflet.js", "./leaflet.css",
  "./style.css", "./map-engine-1.js", "./map-engine-2.js",
  "./omega_game_lifecycle_runtime_v1.js", 
  "./omega_shared_number_format_v1.js",
  "./omega_boot_performance_monitor_v1.js", "./omega_enterprise_composition_root_v10.js",
  "./omega_ui_photo_asset_system_v1.js",  "./omega_ui_photo_asset_catalog_v1.json",
  "./omega_country_runtime_data_v1.js", "./omega_country_general_data_runtime_v1.js", "./omega_country_data_gateway_v1.js", "./omega_country_behavior_engine_v1.js", "./omega_country_overview_ministry_ui_v1.js", "./omega_country_sector_profile_ui_v1.js",  "./country_sector_profiles_v1.json", "./country_sector_profile_schema_v1.json", "./country_general_data_registry_v1.json", "./resource_site_reserve_simulation_v1.json", "./cities.json",
  "./offline-hybrid-map.js", "./offline-hybrid-map.css",
  "./omega_forex_monetary_engine_v1.js", 
  "./omega_government_banking_runtime_v1.js", "./omega_world_bank_lending_runtime_v1.js", "./omega_economic_transmission_runtime_v1.js",
  "./government_banking_rules_v1.json", "./financial_transmission_rules_v1.json",
  "./omega_finance_ministry_runtime_v1.js", 
  "./economy_global_profiles_v1.json", "./economy.json", "./population.json", "./society.json", "./finance_runtime_rules_v1.json",
  "./finance_sector_registry_v1.json",
  "./omega_macro_stability_runtime_v1.js", 
  "./economy_raw_financial_data_v2.json", "./finance_macro_stability_rules_v1.json",
  "./omega_home_ministry_engine_v1.js", "./omega_home_ministry_training_materials_runtime_v1.js", "./omega_home_ministry_ui_v1.js",
  "./omega_home_ministry_budget_ui_v2.js", "./omega_home_ministry_world_police_runtime_v1.js",
  "./omega_home_ministry_police_operations_ui_v1.js", "./omega_home_ministry_police_capability_runtime_v1.js",
  "./omega_home_ministry_police_capability_recommendations_v1.json", "./omega_home_ministry_police_capability_material_requirements_v1.json", "./omega_home_ministry_country_police_baseline_v1.json",
  "./omega_battlefield_command_runtime_v1.js", "./military_command_catalog_v1.json", "./resource_industrial_catalog_v1.json",
  "./omega_factory_visual_catalog_v1.js",  "./omega_factory_visual_catalog_v1.json",
  "./assets/factories/omega_factory_atlas_01.webp", "./assets/factories/omega_factory_atlas_02.webp", "./assets/factories/omega_factory_atlas_03.webp",
  "./omega_resource_industrial_network_v1.js", "./omega_country_inventory_runtime_v1.js", "./omega_resource_command_center_ui_v1.js", "./omega_icon_system_v1.js", 
  "./omega_resource_quantity_normalization_v1.js", "./resource_site_quantity_completion_v1.json", "./resource_type_extensions_v1.json",
  "./omega_resource_endowment_runtime.js", "./omega_resource_auto_mining_runtime_v1.js", "./omega_resource_gameplay_binding_v1.js",
  "./omega_resource_mine_management_v1.js", "./resource_site_country_mineplay_batch_20261020_v1.json", "./resource_site_country_mineplay_batch_20261024_v1.json", "./resource_site_country_mineplay_critical_batch_20261024_v1.json",
  "./resource_site_canonical_catalog_v1.json", "./resource_site_master_registry_v1.json",
  "./resource_site_country_expansion_v1.json",
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
  "./omega_ui_v2/screens/mine-production-command.js",
  "./omega_ui_v2/screens/mine-detail.js",
  "./omega_ui_v2/screens/industry.js",
  "./omega_ui_v2/screens/home-affairs.js",
  "./omega_ui_v2/screens/police-fleet.js",
  "./omega_ui_v2/screens/reports.js",
  "./omega_ui_v2/app.js",
  "./omega_ui_v2/integration.js",
  "./omega_ui_v2/world-command-dock.js",
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
    // Precache the canonical factory SVG library from its manifest so factory cards
    // remain fully illustrated after an offline relaunch. Never synthesize new icons.
    const factoryIconManifestUrl = new URL("./assets/omega-industrial-icons-v1/manifest.json", APP_BASE).href;
    assets.add(factoryIconManifestUrl);
    const factoryIconManifestResponse = await fetchAndCache(cache, factoryIconManifestUrl);
    if (factoryIconManifestResponse && factoryIconManifestResponse.ok) {
      try {
        const factoryIconManifest = await factoryIconManifestResponse.clone().json();
        const factoryIcons = Array.isArray(factoryIconManifest.factories) ? factoryIconManifest.factories : [];
        for (const icon of factoryIcons) {
          const file = String(icon && icon.file || "");
          if (/^factories\/[a-z0-9-]+\.svg$/.test(file)) {
            assets.add(new URL("./assets/omega-industrial-icons-v1/" + file, APP_BASE).href);
          }
        }
        const resourceIcons = Array.isArray(factoryIconManifest.resources) ? factoryIconManifest.resources : [];
        for (const icon of resourceIcons) {
          const file = String(icon && icon.file || "");
          if (/^resources\/[a-z0-9-]+\.svg$/.test(file)) {
            assets.add(new URL("./assets/omega-industrial-icons-v1/" + file, APP_BASE).href);
          }
        }
      } catch (_) {
        // A malformed optional icon manifest must not prevent the shell from installing.
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
