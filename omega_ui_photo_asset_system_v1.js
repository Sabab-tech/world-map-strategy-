/* OMEGA local UI photo library v1.0.0
 * Verified Wikimedia Commons photographs are bundled locally, never hot-linked.
 * Presentation-only: this module does not affect simulation state.
 */
(function (root) {
  "use strict";
  var VERSION = "1.0.0";
  if (root.OmegaUIPhotoAssets && root.OmegaUIPhotoAssets.VERSION === VERSION) return;
  var MANIFEST_URL = "./omega_ui_photo_asset_catalog_v1.json";
  var state = { manifest: null, byId: null, promise: null, lastError: null };

  function text(value) { return String(value == null ? "" : value); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
  function safeClass(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
  }
  function validItem(item) {
    return !!(item && /^[a-z0-9][a-z0-9-]*$/.test(text(item.id)) &&
      /^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(text(item.path)) &&
      /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(text(item.sourcePageUrl)) &&
      /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//.test(text(item.licenseUrl)) &&
      text(item.author).trim() && text(item.creditText).trim());
  }
  function ready() {
    if (state.manifest) return Promise.resolve(state.manifest);
    if (state.promise) return state.promise;
    if (typeof root.fetch !== "function") return Promise.reject(new Error("PHOTO_MANIFEST_FETCH_UNAVAILABLE"));
    state.lastError = null;
    state.promise = root.fetch(MANIFEST_URL, { cache: "force-cache" })
      .then(function (response) {
        if (!response || !response.ok) throw new Error("PHOTO_MANIFEST_UNAVAILABLE");
        return response.json();
      })
      .then(function (manifest) {
        if (!manifest || manifest.schemaVersion !== "1.0.0" || !Array.isArray(manifest.items) || !manifest.items.length) {
          throw new Error("PHOTO_MANIFEST_INVALID");
        }
        var byId = Object.create(null);
        manifest.items.forEach(function (item) {
          if (!validItem(item) || byId[item.id]) throw new Error("PHOTO_MANIFEST_ITEM_INVALID");
          byId[item.id] = item;
        });
        state.manifest = manifest;
        state.byId = byId;
        if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
          root.dispatchEvent(new root.CustomEvent("omega:ui-photo-assets-ready", {
            detail: { count: manifest.items.length, version: VERSION }
          }));
        }
        return manifest;
      })
      .catch(function (error) {
        state.lastError = text(error && (error.message || error));
        state.promise = null;
        throw error;
      });
    return state.promise;
  }
  function get(id) { return state.byId ? state.byId[text(id)] || null : null; }
  function list(role) {
    if (!state.manifest) return [];
    var key = text(role).trim();
    return state.manifest.items.filter(function (item) {
      return !key || (Array.isArray(item.uiRoles) && item.uiRoles.indexOf(key) !== -1);
    }).slice();
  }
  function renderFigure(id, options) {
    var item = get(id);
    if (!item) return "";
    var opts = options || {};
    var cls = "omega-ui-photo omega-ui-photo--" + safeClass(opts.variant || "card");
    var alt = text(item.altText || item.caption || item.id);
    var title = text(item.caption || item.label || item.id);
    var sourceHref = escapeHtml(item.sourcePageUrl);
    var licenseHref = escapeHtml(item.licenseUrl);
    var src = escapeHtml("./" + item.path);
    var author = escapeHtml(item.author);
    var license = escapeHtml(item.licenseShortName);
    var changes = escapeHtml(item.changesMade || "Image resized and converted to WebP.");
    return '<figure class="' + cls + '" data-omega-photo-id="' + escapeHtml(item.id) + '">' +
      '<img src="' + src + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async" ' +
      'width="' + Number(item.width || 1280) + '" height="' + Number(item.height || 720) + '">' +
      '<figcaption><strong>' + escapeHtml(title) + '</strong>' +
      '<span class="omega-ui-photo__credit">Photo: <a href="' + sourceHref + '" target="_blank" rel="noopener noreferrer">' + author + '</a>' +
      ' · <a href="' + licenseHref + '" target="_blank" rel="noopener noreferrer">' + license + '</a></span>' +
      '<small class="omega-ui-photo__changes">' + changes + '</small></figcaption></figure>';
  }
  function renderGallery(ids, options) {
    if (!state.manifest) return "";
    var opts = options || {};
    var items = Array.isArray(ids) && ids.length ? ids.map(get).filter(Boolean) : state.manifest.items.slice();
    if (!items.length) return "";
    var cards = items.map(function (item) { return renderFigure(item.id, { variant: opts.variant || "card" }); }).join("");
    return '<section class="omega-ui-photo-gallery" aria-label="Licensed real-world photo references">' +
      '<p class="omega-ui-photo-gallery__notice">Reference photography only. A pictured facility or landmark is not evidence of ownership, current operation, or the selected country’s status.</p>' +
      '<div class="omega-ui-photo-gallery__grid">' + cards + '</div></section>';
  }
  function mountGallery(node, ids, options) {
    if (!node) return Promise.reject(new Error("PHOTO_GALLERY_MOUNT_MISSING"));
    return ready().then(function () {
      node.innerHTML = renderGallery(ids, options);
      if (node.dataset) node.dataset.omegaPhotoGalleryReady = "true";
      return node.querySelectorAll ? node.querySelectorAll("figure.omega-ui-photo").length : list().length;
    });
  }
  function diagnostics() {
    return { version: VERSION, ready: !!state.manifest,
      itemCount: state.manifest ? state.manifest.items.length : 0, lastError: state.lastError };
  }
  root.OmegaUIPhotoAssets = Object.freeze({
    VERSION: VERSION, ready: ready, get: get, list: list, renderFigure: renderFigure,
    renderGallery: renderGallery, mountGallery: mountGallery, diagnostics: diagnostics
  });

  // Prime the small local manifest during boot. Callers still use local-path
  // fallbacks so file:// WebViews and offline cache failures do not hide photos.
  try { ready().catch(function () {}); } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
