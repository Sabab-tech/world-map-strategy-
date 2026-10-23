/* OMEGA COUNTRY POLICE BASELINE RUNTIME v1.0.0
 * Seeds all country police/fleet baseline records once from the versioned data asset.
 * No baseline fleet is purchased at boot: it is opening scenario inventory.
 */
(function (g) {
  'use strict';
  if (g.OmegaHomePoliceBaselineRuntime && g.OmegaHomePoliceBaselineRuntime.VERSION === '1.0.0') return;
  var VERSION = '1.1.0', promise = null, report = { ready: false, countryCount: 0, seededCountries: 0 };
  var SCRIPT_URL = g.document && g.document.currentScript && g.document.currentScript.src || null;
  function dataUrl() {
    try { if (SCRIPT_URL && typeof URL === 'function') return new URL('omega_home_ministry_country_police_baseline_v1.json', SCRIPT_URL).toString(); } catch (_) {}
    try { if (g.location && g.location.href && typeof URL === 'function') return new URL('omega_home_ministry_country_police_baseline_v1.json', g.location.href).toString(); } catch (_) {}
    return 'omega_home_ministry_country_police_baseline_v1.json';
  }
  function engine() { return g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry) || null; }
  function emit(type, detail) {
    try { if (g.dispatchEvent && g.CustomEvent) g.dispatchEvent(new g.CustomEvent(type, { detail: detail || {} })); } catch (_) {}
  }
  function init() {
    if (report.ready) return Promise.resolve(report);
    if (promise) return promise;
    promise = Promise.resolve().then(function () {
      if (typeof g.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
      return g.fetch(dataUrl(), { cache: 'no-cache' });
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('POLICE_BASELINE_FETCH_FAILED');
      return response.json();
    }).then(function (payload) {
      var e = engine();
      if (!e || typeof e.bootstrapCountryPoliceBaselines !== 'function') throw new Error('HOME_MINISTRY_BASELINE_API_UNAVAILABLE');
      if (!payload || payload.schemaVersion !== '1.0.0' || !Array.isArray(payload.countries) || payload.countries.length < 200)
        throw new Error('POLICE_BASELINE_DATA_INVALID');
      var result = e.bootstrapCountryPoliceBaselines(payload.countries);
      if (!result || result.ok !== true) throw new Error(result && (result.code || result.reason) || 'POLICE_BASELINE_BOOTSTRAP_FAILED');
      report = {
        version: VERSION, ready: true, countryCount: result.countryCount || payload.countries.length,
        seededCountries: result.seededCountries || 0, existingCountryStatesPreserved: result.existingCountryStatesPreserved || 0,
        migratedLegacyFleetCountries: result.migratedLegacyFleetCountries || 0,
        populationCoverage: payload.countries.filter(function (r) { return r.population && Number(r.population.value) > 0; }).length,
        observedHomicideCoverage: payload.countries.filter(function (r) { return r.crime && r.crime.observedHomicide && Number.isFinite(Number(r.crime.observedHomicide.ratePer100k)); }).length,
        vehicleTypes: Array.isArray(payload.vehicles) ? payload.vehicles.length : 0,
        globalStartingPoliceEstimate: payload.countries.reduce(function (sum, r) { return sum + Math.max(0, Number(r.baselinePolice && r.baselinePolice.activePersonnel) || 0); }, 0),
        globalStartingFleetEstimate: payload.countries.reduce(function (sum, r) { return sum + Math.max(0, Number(r.baselineFleet && r.baselineFleet.totalUnits) || 0); }, 0),
        dataUpdatedAt: payload.generatedAt || null, disclaimer: payload.description || ''
      };
      emit('OMEGA_HOME_POLICE_BASELINE_READY', report);
      return report;
    }).catch(function (error) {
      report = { version: VERSION, ready: false, error: String(error && error.message || error), countryCount: 0 };
      emit('OMEGA_HOME_POLICE_BASELINE_FAILED', report);
      return report;
    }).finally(function () { promise = null; });
    return promise;
  }
  var api = Object.freeze({ VERSION: VERSION, init: init, retry: init, dataUrl: dataUrl, diagnostics: function () { return Object.assign({}, report); } });
  g.OmegaHomePoliceBaselineRuntime = api;
  if (g.document) {
    var start = function () { init(); };
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', start, { once: true });
    else Promise.resolve().then(start);
  }
})(typeof window !== 'undefined' ? window : globalThis);
