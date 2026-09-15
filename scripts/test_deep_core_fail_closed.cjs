const assert = require('node:assert/strict');

(async () => {
  globalThis.OfflineQueryEngine = {
    diagnostics() {
      return {
        engine: 'OMEGA_DEEP_CORE',
        initialized: true,
        scan: {
          discoveredFiles: 87,
          loadedFiles: 0,
          failedFiles: Array.from({ length: 87 }, (_, i) => ({
            path: `broken-${i + 1}.json`,
            error: 'TEST_LOAD_FAILURE',
            stage: 'FILE_LOAD'
          })),
          complete: false,
          authority: 'NODE_FILESYSTEM'
        },
        index: { identityKeys: 0, rawOccurrences: 0, records: 0 }
      };
    },
    execute() {
      return { ok: true, status: 'VERIFIED_FACT', value: 'THIS MUST NEVER ESCAPE' };
    },
    async executeAsync() {
      return { ok: true, status: 'VERIFIED_FACT', value: 'THIS MUST NEVER ESCAPE' };
    }
  };

  globalThis.OmegaCanonicalIdentityRegistry = {
    exportData() { return { countries: [] }; }
  };

  globalThis.OmegaResourceSemanticBridge = {
    diagnostics() {
      return { ready: false, resourceTypeCount: 0, resourceRecordCount: 0 };
    }
  };

  await import('../omega_deep_core_integrity_guard.js');

  const diag = globalThis.OmegaDeepCoreIntegrityGuard.diagnostics();
  assert.equal(diag.status, 'BROKEN');
  assert.equal(diag.queryReady, false);
  assert.equal(diag.reason, 'DATA_INDEX_EMPTY');
  assert.equal(diag.repositoryScan.discovered, 87);
  assert.equal(diag.repositoryScan.loaded, 0);
  assert.equal(diag.repositoryScan.failed, 87);
  assert.equal(diag.identityIndex.countries, 0);
  assert.equal(diag.identityIndex.resources, 0);

  const syncResult = globalThis.OfflineQueryEngine.execute({ operation: 'GET' });
  assert.equal(syncResult.status, 'DATA_UNAVAILABLE');
  assert.equal(syncResult.value, null);
  assert.equal(syncResult.reason, 'DATA_INDEX_EMPTY');
  assert.equal(syncResult.dataAccess.queryReady, false);

  const asyncResult = await globalThis.OfflineQueryEngine.executeAsync({ operation: 'GET' });
  assert.equal(asyncResult.status, 'DATA_UNAVAILABLE');
  assert.equal(asyncResult.value, null);
  assert.equal(asyncResult.reason, 'DATA_INDEX_EMPTY');

  console.log('DEEP CORE FAIL-CLOSED TEST PASSED');
  console.log(JSON.stringify({
    status: diag.status,
    queryReady: diag.queryReady,
    reason: diag.reason,
    repositoryScan: diag.repositoryScan,
    identityIndex: diag.identityIndex
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
