/* OMEGA POLICE CAPABILITY RECOMMENDATION RUNTIME v1.0.0
 * Loads editable, versioned game recommendations for all country rows.
 * These are explicitly modeled gameplay suggestions, not official country standards.
 */
(function (g) {
  'use strict';
  if (g.OmegaHomePoliceCapabilityRuntime && g.OmegaHomePoliceCapabilityRuntime.VERSION === '1.0.0') return;
  var VERSION = '1.0.0', payload = null, promise = null;
  var SCRIPT_URL = g.document && g.document.currentScript && g.document.currentScript.src || null;
  var index = Object.create(null), report = { version: VERSION, ready: false, countryCount: 0, error: null };
  function norm(value) { return String(value == null ? '' : value).trim().toUpperCase().replace(/[-\\s]+/g, '_'); }
  function dataUrl() {
    try { if (SCRIPT_URL && typeof URL === 'function') return new URL('omega_home_ministry_police_capability_recommendations_v1.json', SCRIPT_URL).toString(); } catch (_) {}
    try { if (g.location && g.location.href && typeof URL === 'function') return new URL('omega_home_ministry_police_capability_recommendations_v1.json', g.location.href).toString(); } catch (_) {}
    return 'omega_home_ministry_police_capability_recommendations_v1.json';
  }
  function emit(type, detail) {
    try { if (g.dispatchEvent && g.CustomEvent) g.dispatchEvent(new g.CustomEvent(type, { detail: detail || {} })); } catch (_) {}
  }
  function init() {
    if (report.ready) return Promise.resolve(Object.assign({}, report));
    if (promise) return promise;
    promise = Promise.resolve().then(function () {
      if (typeof g.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
      return g.fetch(dataUrl(), { cache: 'no-cache' });
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('POLICE_CAPABILITY_RECOMMENDATIONS_FETCH_FAILED');
      return response.json();
    }).then(function (data) {
      if (!data || data.schemaVersion !== '1.0.0' || !Array.isArray(data.countries) || data.countries.length < 200)
        throw new Error('POLICE_CAPABILITY_RECOMMENDATIONS_INVALID');
      var next = Object.create(null);
      data.countries.forEach(function (row) {
        if (!row || !row.code || !row.name) return;
        [row.code, row.iso2, row.iso3, row.name].filter(Boolean).forEach(function (key) { next[norm(key)] = row; });
      });
      if (Object.keys(next).length < 200) throw new Error('POLICE_CAPABILITY_COUNTRY_INDEX_INCOMPLETE');
      payload = data; index = next;
      report = { version: VERSION, ready: true, countryCount: data.countries.length, indexedAliases: Object.keys(index).length, generatedAt: data.generatedAt || null, modelVersion: data.modelVersion || null, error: null };
      emit('OMEGA_HOME_POLICE_CAPABILITY_RECOMMENDATIONS_READY', report);
      return Object.assign({}, report);
    }).catch(function (error) {
      report = { version: VERSION, ready: false, countryCount: 0, error: String(error && error.message || error) };
      emit('OMEGA_HOME_POLICE_CAPABILITY_RECOMMENDATIONS_FAILED', report);
      return Object.assign({}, report);
    }).finally(function () { promise = null; });
    return promise;
  }
  var api = Object.freeze({
    VERSION: VERSION,
    init: init,
    retry: init,
    dataUrl: dataUrl,
    getRecommendation: function (country) {
      var row = index[norm(country)];
      return row ? JSON.parse(JSON.stringify(row)) : null;
    },
    getMethodology: function () { return payload && payload.methodology ? JSON.parse(JSON.stringify(payload.methodology)) : null; },
    getAll: function () { return payload && Array.isArray(payload.countries) ? JSON.parse(JSON.stringify(payload.countries)) : []; },
    diagnostics: function () { return Object.assign({}, report); }
  });
  g.OmegaHomePoliceCapabilityRuntime = api;
  if (g.document) {
    var start = function () { init(); };
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', start, { once: true });
    else Promise.resolve().then(start);
  }
})(typeof window !== 'undefined' ? window : globalThis);
