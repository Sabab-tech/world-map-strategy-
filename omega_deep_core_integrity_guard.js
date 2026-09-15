/* OMEGA DEEP CORE INTEGRITY GUARD v1.0.0
 * Fail-closed boundary for repository-backed AI execution.
 * Never converts an unreadable/empty repository into a usable-looking result.
 */
(function (g) {
  'use strict';

  const VERSION = '1.0.0';
  const A = v => Array.isArray(v) ? v : [];
  const O = v => v !== null && typeof v === 'object';
  const S = v => String(v == null ? '' : v).trim();
  const U = v => S(v).toUpperCase();

  if (g.OmegaDeepCoreIntegrityGuard?.VERSION === VERSION) return;

  const offline = g.OfflineQueryEngine;
  const countryBridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || null;
  const resourceBridge = g.OmegaResourceSemanticBridge || null;

  function snapshotDiagnostics() {
    let base = {};
    try {
      if (offline && typeof offline.diagnostics === 'function') base = offline.diagnostics() || {};
    } catch (error) {
      base = { diagnosticsError: error?.message || String(error) };
    }

    const scan = base?.scan || base?.stats?.scan || {};
    const discovered = Number(scan.discoveredFiles || 0);
    const loaded = Number(scan.loadedFiles || 0);
    const failed = A(scan.failedFiles);
    const records = Number(base?.index?.records ?? base?.stats?.records ?? 0);
    const rawOccurrences = Number(base?.index?.rawOccurrences ?? base?.stats?.rawOccurrences ?? 0);
    const identityKeys = Number(base?.index?.identityKeys ?? base?.stats?.identityKeys ?? 0);

    let countries = 0;
    try {
      const rows = countryBridge?.exportData?.()?.countries;
      if (Array.isArray(rows)) countries = rows.length;
    } catch (_) {}

    let resources = 0;
    let resourceRecords = 0;
    let resourceReady = false;
    try {
      const d = resourceBridge?.diagnostics?.() || {};
      resources = Number(d.resourceTypeCount || 0);
      resourceRecords = Number(d.resourceRecordCount || 0);
      resourceReady = d.ready === true || d.exportReady === true;
    } catch (_) {}

    const repositoryScan = {
      discovered,
      loaded,
      failed: failed.length,
      failedFiles: failed.slice(0, 100),
      complete: scan.complete === true && discovered === loaded && failed.length === 0,
      authority: scan.authority || 'UNKNOWN',
      source: scan.source || null,
      mode: scan.mode || null
    };

    const identityIndex = {
      countries,
      resources,
      resourceRecords,
      identityKeys,
      records,
      rawOccurrences,
      ready: countries > 0 && resources > 0 && records > 0 && rawOccurrences > 0
    };

    const queryReady = repositoryScan.complete && identityIndex.ready && resourceReady !== false && !base?.diagnosticsError;
    const reason = queryReady
      ? null
      : repositoryScan.complete === false
        ? (failed.length ? 'DATA_REPOSITORY_SCAN_FAILED' : 'DATA_REPOSITORY_SCAN_INCOMPLETE')
        : identityIndex.ready === false
          ? 'DATA_INDEX_EMPTY'
          : 'DATA_CORE_NOT_READY';

    return {
      ...base,
      engine: base.engine || 'OMEGA_DEEP_CORE',
      integrityGuard: { version: VERSION, enforced: true, policy: 'FAIL_CLOSED' },
      status: queryReady ? 'READY' : 'BROKEN',
      repositoryScan,
      identityIndex,
      queryReady,
      reason
    };
  }

  function unavailableResult(extra = {}) {
    const d = snapshotDiagnostics();
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

  function isReady() {
    return snapshotDiagnostics().queryReady === true;
  }

  if (offline && !offline.__omegaFailClosedGuardV1) {
    const originalExecute = typeof offline.execute === 'function' ? offline.execute.bind(offline) : null;
    const originalExecuteAsync = typeof offline.executeAsync === 'function' ? offline.executeAsync.bind(offline) : null;
    const originalDiagnostics = typeof offline.diagnostics === 'function' ? offline.diagnostics.bind(offline) : null;
    const originalDiagnosticsAsync = typeof offline.diagnosticsAsync === 'function' ? offline.diagnosticsAsync.bind(offline) : null;

    offline.execute = function (...args) {
      if (!isReady()) return unavailableResult();
      if (!originalExecute) return unavailableResult({ reason: 'DEEP_CORE_EXECUTOR_MISSING' });
      try {
        const result = originalExecute(...args);
        return result ?? unavailableResult({ reason: 'DEEP_CORE_NULL_RESULT' });
      } catch (error) {
        return unavailableResult({
          reason: 'DEEP_CORE_EXECUTION_ERROR',
          error: error?.message || String(error)
        });
      }
    };

    offline.executeAsync = async function (...args) {
      if (!isReady()) return unavailableResult();
      if (!originalExecuteAsync) return unavailableResult({ reason: 'DEEP_CORE_ASYNC_EXECUTOR_MISSING' });
      try {
        const result = await originalExecuteAsync(...args);
        return result ?? unavailableResult({ reason: 'DEEP_CORE_NULL_RESULT' });
      } catch (error) {
        return unavailableResult({
          reason: 'DEEP_CORE_ASYNC_EXECUTION_ERROR',
          error: error?.message || String(error)
        });
      }
    };

    offline.diagnostics = function () {
      const base = originalDiagnostics ? originalDiagnostics() : {};
      const scan = base?.scan || base?.stats?.scan || {};
      const discovered = Number(scan.discoveredFiles || 0);
      const loaded = Number(scan.loadedFiles || 0);
      const failed = A(scan.failedFiles);
      const records = Number(base?.index?.records ?? base?.stats?.records ?? 0);
      const rawOccurrences = Number(base?.index?.rawOccurrences ?? base?.stats?.rawOccurrences ?? 0);
      const identityKeys = Number(base?.index?.identityKeys ?? base?.stats?.identityKeys ?? 0);
      const countries = (() => {
        try { return Array.isArray(countryBridge?.exportData?.()?.countries) ? countryBridge.exportData().countries.length : 0; }
        catch (_) { return 0; }
      })();
      const resource = (() => {
        try {
          const d = resourceBridge?.diagnostics?.() || {};
          return { types: Number(d.resourceTypeCount || 0), records: Number(d.resourceRecordCount || 0), ready: d.ready === true || d.exportReady === true };
        } catch (_) { return { types: 0, records: 0, ready: false }; }
      })();
      const queryReady = scan.complete === true && discovered === loaded && failed.length === 0 && records > 0 && rawOccurrences > 0 && countries > 0 && resource.types > 0;
      return {
        ...base,
        integrityGuard: { version: VERSION, enforced: true, policy: 'FAIL_CLOSED' },
        status: queryReady ? 'READY' : 'BROKEN',
        repositoryScan: {
          discovered,
          loaded,
          failed: failed.length,
          failedFiles: failed.slice(0, 100),
          complete: scan.complete === true && discovered === loaded && failed.length === 0,
          authority: scan.authority || 'UNKNOWN',
          source: scan.source || null,
          mode: scan.mode || null
        },
        identityIndex: {
          countries,
          resources: resource.types,
          resourceRecords: resource.records,
          identityKeys,
          records,
          rawOccurrences,
          ready: countries > 0 && resource.types > 0 && records > 0 && rawOccurrences > 0
        },
        queryReady,
        reason: queryReady ? null : (failed.length ? 'DATA_REPOSITORY_SCAN_FAILED' : (scan.complete !== true ? 'DATA_REPOSITORY_SCAN_INCOMPLETE' : 'DATA_INDEX_EMPTY'))
      };
    };

    offline.diagnosticsAsync = async function () {
      try {
        if (originalDiagnosticsAsync) {
          await originalDiagnosticsAsync();
        }
      } catch (_) {}
      return offline.diagnostics();
    };

    Object.defineProperty(offline, '__omegaFailClosedGuardV1', { value: true, enumerable: false, configurable: false });
  }

  g.OmegaDeepCoreIntegrityGuard = Object.freeze({
    VERSION,
    diagnostics: snapshotDiagnostics,
    isReady,
    unavailableResult
  });
})(globalThis);
