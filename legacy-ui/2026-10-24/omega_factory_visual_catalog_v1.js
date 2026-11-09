(function (g) {
  "use strict";
  var MANIFEST_URL = "./omega_factory_visual_catalog_v1.json";
  var SELECTOR = ".omega-factory-visual[data-factory-type]";
  var manifest = null;
  var loadPromise = null;

  function normaliseType(value) {
    return String(value || "").trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
  }
  function escapeAttr(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
  function resolve(type) {
    if (!manifest) return null;
    var key = normaliseType(type);
    var profile = manifest.factoryTypes[key] || manifest.factoryTypes.GENERIC_RESOURCE_PROCESSING_PLANT;
    if (!profile) return null;
    var visual = null;
    for (var i = 0; i < manifest.visuals.length; i += 1) {
      if (manifest.visuals[i].id === profile.visualId) { visual = manifest.visuals[i]; break; }
    }
    if (!visual) return null;
    return {
      type: key,
      visualId: visual.id,
      label: profile.altText || visual.label,
      asset: visual.asset,
      row: visual.atlasRow,
      column: visual.atlasColumn,
      rows: visual.atlasRows,
      columns: visual.atlasColumns
    };
  }
  function apply(node) {
    if (!node || !node.style || !manifest) return false;
    var mapped = resolve(node.getAttribute("data-factory-type"));
    if (!mapped) return false;
    var label = node.getAttribute("data-factory-label") || mapped.label;
    var x = mapped.columns > 1 ? (mapped.column / (mapped.columns - 1)) * 100 : 0;
    var y = mapped.rows > 1 ? (mapped.row / (mapped.rows - 1)) * 100 : 0;
    node.style.backgroundImage = 'url("' + mapped.asset.replace(/"/g, "%22") + '")';
    node.style.backgroundRepeat = "no-repeat";
    node.style.backgroundSize = (mapped.columns * 100) + "% " + (mapped.rows * 100) + "%";
    node.style.backgroundPosition = x + "% " + y + "%";
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", label);
    node.title = label;
    if (node.dataset) node.dataset.visualId = mapped.visualId;
    return true;
  }
  function refresh(root) {
    if (!g.document) return 0;
    var scope = root || g.document;
    var count = 0;
    if (scope.matches && scope.matches(SELECTOR) && apply(scope)) count += 1;
    if (scope.querySelectorAll) {
      var nodes = scope.querySelectorAll(SELECTOR);
      for (var i = 0; i < nodes.length; i += 1) if (apply(nodes[i])) count += 1;
    }
    return count;
  }
  function render(type, label) {
    var name = label || type || "Factory";
    return '<span class="omega-factory-visual" data-factory-type="' + escapeAttr(type) +
      '" data-factory-label="' + escapeAttr(name) + '" role="img" aria-label="' + escapeAttr(name) +
      '" title="' + escapeAttr(name) + '"></span>';
  }
  function ready() {
    if (loadPromise) return loadPromise;
    if (typeof g.fetch !== "function") return Promise.resolve(null);
    loadPromise = g.fetch(MANIFEST_URL, { cache: "force-cache" })
      .then(function (response) {
        if (!response || !response.ok) throw new Error("Factory visual manifest is not available.");
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.visuals) || !data.factoryTypes) throw new Error("Factory visual manifest is invalid.");
        manifest = data;
        refresh();
        if (typeof g.dispatchEvent === "function" && typeof g.CustomEvent === "function") {
          g.dispatchEvent(new g.CustomEvent("omega:factory-visuals-ready", { detail: { profiles: Object.keys(manifest.factoryTypes).length } }));
        }
        return manifest;
      })
      .catch(function () { return null; });
    return loadPromise;
  }

  g.OmegaFactoryVisualCatalog = { render:render, resolve:resolve, apply:apply, refresh:refresh, ready:ready, getManifest:function () { return manifest; } };
  if (g.MutationObserver && g.document && g.document.documentElement) {
    var observer = new g.MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var added = mutations[i].addedNodes || [];
        for (var j = 0; j < added.length; j += 1) {
          if (added[j] && added[j].nodeType === 1) refresh(added[j]);
        }
      }
    });
    observer.observe(g.document.documentElement, { childList:true, subtree:true });
  }
  ready();
})(typeof window !== "undefined" ? window : globalThis);
