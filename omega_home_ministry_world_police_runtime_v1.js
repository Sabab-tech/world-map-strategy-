/* OMEGA COUNTRY POLICE BASELINE RUNTIME v1.0.0
 * Seeds all country police/fleet baseline records once from the versioned data asset.
 * No baseline fleet is purchased at boot: it is opening scenario inventory.
 */
(function (g) {
  'use strict';
  if (g.OmegaHomePoliceBaselineRuntime && g.OmegaHomePoliceBaselineRuntime.VERSION === '1.0.0') return;
  var VERSION = '1.0.0', promise = null, report = { ready: false, countryCount: 0, seededCountries: 0 };
  function engine() { return g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry) || null; }
  function emit(type, detail) {
    try { if (g.dispatchEvent && g.CustomEvent) g.dispatchEvent(new g.CustomEvent(type, { detail: detail || {} })); } catch (_) {}
  }
  function init() {
    if (report.ready) return Promise.resolve(report);
    if (promise) return promise;
    promise = Promise.resolve().then(function () {
      if (typeof g.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
      return g.fetch('omega_home_ministry_country_police_baseline_v1.json', { cache: 'no-cache' });
    }).then(function (response) {
      if (!response || !response.ok) throw new Error('POLICE_BASELINE_FETCH_FAILED');
      return response.json();
    }).then(function (payload) {
      return g.fetch('omega_home_ministry_training_recruitment_level_baseline_v1.json', { cache: 'no-cache' }).then(function (response) {
        if (!response || !response.ok) throw new Error('CAPABILITY_BASELINE_FETCH_FAILED');
        return response.json();
      }).then(function (capabilityPayload) {
        if (!capabilityPayload || capabilityPayload.schemaVersion !== '1.0.0' || !Array.isArray(capabilityPayload.countries) || capabilityPayload.countries.length < 200)
          throw new Error('CAPABILITY_BASELINE_DATA_INVALID');
        var lookup = Object.create(null);
        function alias(value) { return String(value || '').trim().toUpperCase().replace(/[-\\s]+/g, '_'); }
        capabilityPayload.countries.forEach(function (row) {
          [row.code, row.iso2, row.iso3, row.name].filter(Boolean).forEach(function (value) { lookup[alias(value)] = row; });
        });
        var matched = 0;
        payload.countries.forEach(function (row) {
          var capability = lookup[alias(row.code)] || lookup[alias(row.iso2)] || lookup[alias(row.iso3)] || lookup[alias(row.name)];
          if (!capability || !Number.isFinite(Number(capability.trainingLevel)) || !Number.isFinite(Number(capability.recruitmentLevel))) return;
          row.capabilityBaseline = {
            modelVersion: capabilityPayload.model && capabilityPayload.model.version || 'country-capability-score-v1',
            trainingLevel: Number(capability.trainingLevel), recruitmentLevel: Number(capability.recruitmentLevel),
            trainingScore: Number(capability.trainingScore), recruitmentScore: Number(capability.recruitmentScore),
            costIndex: Number(capability.costIndex), levelAuthority: capability.levelAuthority || 'MODELED_SIMULATION_ESTIMATE',
            dataCoverage: capability.dataCoverage || {}, observedHomicide: capability.observedHomicide || null,
            countrySources: capability.sources || null, sourceAsset: 'omega_home_ministry_training_recruitment_level_baseline_v1.json'
          };
          matched += 1;
        });
        payload.capabilityBaselineVersion = capabilityPayload.schemaVersion;
        payload.capabilityBaselineGeneratedAt = capabilityPayload.generatedAt || null;
        payload.capabilityBaselineCoverage = matched;
        payload.capabilityBaselineError = matched < 200 ? 'CAPABILITY_BASELINE_COUNTRY_COVERAGE_LOW' : null;
        if (matched < 200) throw new Error('CAPABILITY_BASELINE_COUNTRY_COVERAGE_LOW');
        return payload;
      }).catch(function (error) {
        payload.capabilityBaselineError = String(error && error.message || error);
        payload.capabilityBaselineCoverage = payload.countries.filter(function (row) { return !!row.capabilityBaseline; }).length;
        return payload;
      });
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
        populationCoverage: payload.countries.filter(function (r) { return r.population && Number(r.population.value) > 0; }).length,
        observedHomicideCoverage: payload.countries.filter(function (r) { return r.crime && r.crime.observedHomicide && Number.isFinite(Number(r.crime.observedHomicide.ratePer100k)); }).length,
        capabilityBaselineVersion: payload.capabilityBaselineVersion || null,
        capabilityBaselineCoverage: Number(payload.capabilityBaselineCoverage) || 0,
        capabilityBaselineError: payload.capabilityBaselineError || null,
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
  var api = Object.freeze({ VERSION: VERSION, init: init, diagnostics: function () { return Object.assign({}, report); } });
  g.OmegaHomePoliceBaselineRuntime = api;
  if (g.document) {
    var start = function () { init(); };
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', start, { once: true });
    else Promise.resolve().then(start);
  }
})(typeof window !== 'undefined' ? window : globalThis);
