const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const port = 39127;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server_bootstrap.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', chunk => { logs += chunk.toString(); });
child.stderr.on('data', chunk => { logs += chunk.toString(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, options) {
  return fetch(base + path, { cache: 'no-store', ...options });
}

async function main() {
  try {
    let ready = false;
    let lastError = null;
    for (let i = 0; i < 120; i += 1) {
      try {
        const response = await request('/api/deep-core/health');
        if (response.ok) {
          const body = await response.json();
          if (body?.ok === true) {
            ready = true;
            break;
          }
          lastError = new Error(`health not ready: ${JSON.stringify(body)}`);
        } else {
          lastError = new Error(`health HTTP ${response.status}`);
        }
      } catch (error) {
        lastError = error;
      }
      if (child.exitCode !== null) break;
      await sleep(250);
    }
    assert.equal(ready, true, `production server did not become healthy: ${lastError?.message || 'unknown'}\n${logs}`);

    const indexResponse = await request('/');
    assert.equal(indexResponse.ok, true, `production index request failed: HTTP ${indexResponse.status}`);
    const html = await indexResponse.text();
    const languageIndex = html.indexOf('/omega_language_system.js');
    const batch03Index = html.indexOf('/omega_language_batch03_semantic_extension.js');
    const universalIndex = html.indexOf('/omega_universal_ai_runtime.js');
    assert.ok(languageIndex >= 0, 'production HTML must load Omega Language System');
    assert.ok(batch03Index > languageIndex, 'production HTML must load Batch 03 after Language System');
    assert.ok(universalIndex > batch03Index, 'production HTML must load Universal AI after Batch 03');

    const statusResponse = await request('/api/ai/status');
    assert.equal(statusResponse.ok, true, `production AI status failed: HTTP ${statusResponse.status}`);
    const status = await statusResponse.json();
    assert.equal(status.ok, true);
    assert.ok(status.deepCore, 'production AI status must expose Deep Core');
    assert.ok(status.cognitiveBridge?.authority, 'production AI status must expose cognitive bridge');

    const queryResponse = await request('/api/deep-core/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What is the population of Bangladesh?',
        countryId: 'BGD',
        language: 'en'
      })
    });
    const query = await queryResponse.json();
    assert.equal(queryResponse.ok, true, `production semantic query failed: HTTP ${queryResponse.status}: ${JSON.stringify(query)}`);
    assert.equal(query?.result?.status, 'VERIFIED_FACT');
    assert.ok(Array.isArray(query?.result?.evidence) && query.result.evidence.length > 0);
    assert.equal(query.result.dataAccess?.authority, 'NODE_FILESYSTEM');

    console.log('OMEGA LANGUAGE PRODUCTION BOOT: PASS');
    console.log('Production HTML Language -> Batch 03 -> Universal AI order: PASS');
    console.log('Production /api/ai/status: PASS');
    console.log('Production semantic query: VERIFIED_FACT');
  } finally {
    child.kill('SIGTERM');
    await sleep(250);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
