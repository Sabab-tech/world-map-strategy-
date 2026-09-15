/* OMEGA DEEP CORE FAIL-CLOSED INTEGRITY GUARD
 * Exact contract required by Deep Core:
 * BROKEN -> repositoryScan -> identityIndex -> queryReady -> reason
 * Broken/empty data must never reach AI as a verified fact.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.2';
  const A = v => Array.isArray(v) ? v : [];
  if (g.OmegaDeepCoreIntegrityGuard?.VERSION === VERSION) return;
  const offline = g.OfflineQueryEngine || null;
  const production = g.OmegaProductionSemanticRuntime || null;
  const countryBridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || null;
  const resourceBridge = g.OmegaResourceSemanticBridge || null;
  const originalOfflineExecute = offline?.execute ? offline.execute.bind(offline) : null;
  const originalOfflineExecuteAsync = offline?.executeAsync ? offline.executeAsync.bind(offline) : null;
  const originalDiagnostics = offline?.diagnostics ? offline.diagnostics.bind(offline) : null;
  const originalProductionExecute = production?.execute ? production.execute.bind(production) : null;

  function countCountries() {
    try { const rows = countryBridge?.exportData?.()?.countries; return Array.isArray(rows) ? rows.length : 0; }
    catch (_) { return 0; }
  }
  function countResources() {
    try { return Number(resourceBridge?.diagnostics?.()?.resourceTypeCount || 0); }
    catch (_) { return 0; }
  }
  function diagnostics() {
    let base = {};
    try { base = originalDiagnostics ? (originalDiagnostics() || {}) : {}; }
    catch (error) { base = { diagnosticsError: error?.message || String(error) }; }
    const scan = base?.scan || base?.stats?.scan || {};
    const discovered = Number(scan.discoveredFiles || 0);
    const loaded = Number(scan.loadedFiles || 0);
    const failed = A(scan.failedFiles).length || Math.max(0, discovered - loaded);
    const repositoryReady = scan.complete === true && discovered === loaded && failed === 0;
    const countries = repositoryReady ? countCountries() : 0;
    const resources = repositoryReady ? countResources() : 0;
    const indexReady = countries > 0 && resources > 0;
    const queryReady = repositoryReady && indexReady && !base?.diagnosticsError;
    if (!queryReady) return {
      status: 'BROKEN',
      repositoryScan: { discovered, loaded, failed },
      identityIndex: { countries, resources },
      queryReady: false,
      reason: 'DATA_INDEX_EMPTY'
    };
    return {
      ...base,
      status: 'READY',
      repositoryScan: { discovered, loaded, failed },
      identityIndex: { countries, resources },
      queryReady: true,
      reason: null
    };
  }
  function unavailable() {
    const d = diagnostics();
    return {
      ok: false,
      status: 'DATA_UNAVAILABLE',
      value: null,
      evidence: [],
      trace: [{ step: 'DATA_AVAILABILITY_GATE', status: 'BLOCKED', reason: d.reason }],
      dataAccess: d,
      reason: d.reason
    };
  }
  function ready() { return diagnostics().queryReady === true; }
  if (offline && !offline.__omegaFailClosedGuardV102) {
    offline.execute = function (...args) {
      if (!ready() || !originalOfflineExecute) return unavailable();
      try { return originalOfflineExecute(...args) ?? unavailable(); } catch (_) { return unavailable(); }
    };
    offline.executeAsync = async function (...args) {
      if (!ready() || !originalOfflineExecuteAsync) return unavailable();
      try { return (await originalOfflineExecuteAsync(...args)) ?? unavailable(); } catch (_) { return unavailable(); }
    };
    if (production && originalProductionExecute && !production.__omegaFailClosedProductionV102) {
      production.execute = function (...args) {
        if (!ready()) return unavailable();
        try { return originalProductionExecute(...args) ?? unavailable(); } catch (_) { return unavailable(); }
      };
      Object.defineProperty(production, '__omegaFailClosedProductionV102', { value: true, enumerable: false, configurable: false });
    }
    offline.diagnostics = diagnostics;
    Object.defineProperty(offline, '__omegaFailClosedGuardV102', { value: true, enumerable: false, configurable: false });
  }
  g.OmegaDeepCoreIntegrityGuard = Object.freeze({ VERSION, diagnostics, isReady: ready, unavailable });
})(globalThis);
