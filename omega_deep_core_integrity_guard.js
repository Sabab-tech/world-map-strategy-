/* OMEGA DEEP CORE FAIL-CLOSED INTEGRITY GUARD
 * Exact contract:
 * BROKEN -> repositoryScan -> identityIndex -> queryReady -> reason
 * No verified data may pass when repository/index data is unavailable.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.1';
  const A = value => Array.isArray(value) ? value : [];
  const S = value => String(value == null ? '' : value).trim();
  if (g.OmegaDeepCoreIntegrityGuard?.VERSION === VERSION) return;

  const offline = g.OfflineQueryEngine || null;
  const production = g.OmegaProductionSemanticRuntime || null;
  const countryBridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || null;
  const resourceBridge = g.OmegaResourceSemanticBridge || null;

  const originalOfflineExecute = offline && typeof offline.execute === 'function' ? offline.execute.bind(offline) : null;
  const originalOfflineExecuteAsync = offline && typeof offline.executeAsync === 'function' ? offline.executeAsync.bind(offline) : null;
  const originalDiagnostics = offline && typeof offline.diagnostics === 'function' ? offline.diagnostics.bind(offline) : null;
  const originalDiagnosticsAsync = offline && typeof offline.diagnosticsAsync === 'function' ? offline.diagnosticsAsync.bind(offline) : null;
  const originalProductionExecute = production && typeof production.execute === 'function' ? production.execute.bind(production) : null;

  function baseDiagnostics() {
    if (!originalDiagnostics) return {};
    try { return originalDiagnostics() || {}; }
    catch (error) { return { diagnosticsError: error?.message || String(error) }; }
  }

  function countryCount() {
    try {
      const rows = countryBridge?.exportData?.()?.countries;
      return Array.isArray(rows) ? rows.length : 0;
    } catch (_) { return 0; }
  }

  function resourceCount() {
    try { return Number(resourceBridge?.diagnostics?.()?.resourceTypeCount || 0); }
    catch (_) { return 0; }
  }

  function diagnostics() {
    const base = baseDiagnostics();
    const scan = base?.scan || base?.stats?.scan || {};
    const discovered = Number(scan.discoveredFiles || 0);
    const loaded = Number(scan.loadedFiles || 0);
    const failed = A(scan.failedFiles).length || Math.max(0, discovered - loaded);
    const countries = countryCount();
    const resources = resourceCount();
    const repositoryComplete = scan.complete === true && discovered === loaded && failed === 0;
    const indexReady = countries > 0 && resources > 0;
    const queryReady = repositoryComplete && indexReady && !base?.diagnosticsError;
    const reason = queryReady ? null : !indexReady ? 'DATA_INDEX_EMPTY' : failed > 0 ? 'DATA_REPOSITORY_SCAN_FAILED' : 'DATA_REPOSITORY_SCAN_INCOMPLETE';
    if (!queryReady) {
      return {
        status: 'BROKEN',
        repositoryScan: { discovered, loaded, failed },
        identityIndex: { countries, resources },
        queryReady: false,
        reason
      };
    }
    return {
      ...base,
      status: 'READY',
      repositoryScan: { discovered, loaded, failed },
      identityIndex: { countries, resources },
      queryReady: true,
      reason: null
    };
  }

  function unavailable(extra = {}) {
    const d = diagnostics();
    return {
      ok: false,
      status: 'DATA_UNAVAILABLE',
      value: null,
      evidence: [],
      trace: [{ step: 'DATA_AVAILABILITY_GATE', status: 'BLOCKED', reason: d.reason }],
      dataAccess: d,
      reason: d.reason,
      ...extra
    };
  }

  function ready() { return diagnostics().queryReady === true; }

  if (offline && !offline.__omegaFailClosedGuardV101) {
    offline.execute = function (...args) {
      if (!ready()) return unavailable();
      if (!originalOfflineExecute) return unavailable();
      try {
        const result = originalOfflineExecute(...args);
        return result == null ? unavailable() : result;
      } catch (error) { return unavailable({ error: error?.message || String(error) }); }
    };

    offline.executeAsync = async function (...args) {
      if (!ready()) return unavailable();
      if (!originalOfflineExecuteAsync) return unavailable();
      try {
        const result = await originalOfflineExecuteAsync(...args);
        return result == null ? unavailable() : result;
      } catch (error) { return unavailable({ error: error?.message || String(error) }); }
    };

    if (production && originalProductionExecute && !production.__omegaFailClosedProductionV101) {
      production.execute = function (...args) {
        if (!ready()) return unavailable();
        try {
          const result = originalProductionExecute(...args);
          return result == null ? unavailable() : result;
        } catch (error) { return unavailable({ error: error?.message || String(error) }); }
      };
      Object.defineProperty(production, '__omegaFailClosedProductionV101', { value: true, enumerable: false, configurable: false });
    }

    offline.diagnostics = diagnostics;
    offline.diagnosticsAsync = async function () {
      try { if (originalDiagnosticsAsync) await originalDiagnosticsAsync(); }
      catch (_) {}
      return diagnostics();
    };

    Object.defineProperty(offline, '__omegaFailClosedGuardV101', { value: true, enumerable: false, configurable: false });
  }

  g.OmegaDeepCoreIntegrityGuard = Object.freeze({ VERSION, diagnostics, isReady: ready, unavailable });
})(globalThis);
