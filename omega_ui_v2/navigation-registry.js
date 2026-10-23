/* OMEGA UI v2 navigation registry. Read-only metadata; no runtime actions here. */
(function (g) {
  'use strict';

  var destinations = [
    { id: 'map', label: 'World', icon: 'map', group: 'global' },
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard', group: 'global' },
    { id: 'government', label: 'Government', icon: 'landmark', group: 'global' },
    { id: 'economy', label: 'Economy', icon: 'wallet', group: 'global' },
    { id: 'more', label: 'More', icon: 'grid-2x2', group: 'global' }
  ];

  var governmentDestinations = [
    { id: 'executive-ministry', label: 'Executive Ministry', icon: 'landmark', defaultRoute: 'country-overview' },
    { id: 'all-ministries', label: 'All Ministries', icon: 'building-2', defaultRoute: 'ministry-directory' }
  ];

  /* IDs seen in the current ministry_engine.js database as regular records.
     Do not synthesize a missing eighteenth ministry to satisfy a stale UI label. */
  var ministryIds = [
    'trade', 'production', 'taxes', 'central_bank', 'laws', 'education',
    'infrastructure', 'science_research', 'defense', 'foreign_affairs',
    'energy_mining', 'intelligence_cyber', 'agriculture_food',
    'interior_security', 'health_welfare', 'treasury_finance', 'mega_projects'
  ];

  function normalizeGovernmentDestination(value) {
    var id = String(value || '').trim().toLowerCase();
    return id === 'executive-ministry' || id === 'all-ministries' ? id : 'executive-ministry';
  }

  function canRenderCountryOverview(destination) {
    return normalizeGovernmentDestination(destination) === 'executive-ministry';
  }

  function getGovernmentDestination(value) {
    var id = normalizeGovernmentDestination(value);
    for (var i = 0; i < governmentDestinations.length; i += 1) {
      if (governmentDestinations[i].id === id) return Object.assign({}, governmentDestinations[i]);
    }
    return Object.assign({}, governmentDestinations[0]);
  }

  var api = Object.freeze({
    version: '1.0.0',
    destinations: destinations,
    governmentDestinations: governmentDestinations,
    ministryIds: ministryIds,
    visibleRegularMinistryCount: ministryIds.length,
    unresolvedDirectoryLabelCount: 18,
    unresolvedCountNote: 'Current visible database has 17 regular ministry records plus cabinet_council; reconcile authoritative registry before displaying a final count.',
    normalizeGovernmentDestination: normalizeGovernmentDestination,
    canRenderCountryOverview: canRenderCountryOverview,
    getGovernmentDestination: getGovernmentDestination
  });

  g.OmegaUIV2Navigation = api;
  g.Omega = g.Omega || {};
  g.Omega.UIV2Navigation = api;
})(typeof window !== 'undefined' ? window : globalThis);
