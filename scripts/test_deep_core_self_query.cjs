const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ministers = JSON.parse(fs.readFileSync(path.join(root, 'ministers.json'), 'utf8'));
const database = ministers?.ministers_database || {};

let selected = null;
for (const [category, list] of Object.entries(database)) {
  if (!Array.isArray(list)) continue;
  const index = list.findIndex(row => row && row.id && Number.isFinite(Number(row.age)));
  if (index >= 0) {
    selected = { category, index, row: list[index] };
    break;
  }
}
assert.ok(selected, 'ministers.json must contain a minister with an age');

const port = 39127;
const child = spawn(process.execPath, ['server_bootstrap.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForHealthyServer() {
  let last = null;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deep-core/health`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) return;
      last = new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    } catch (error) {
      last = error;
    }
    await sleep(250);
  }
  throw new Error(`Deep Core server did not become healthy: ${last?.message || 'unknown'}\nSERVER_OUTPUT\n${output}`);
}

async function query(body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/deep-core/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json().catch(() => null) };
}

(async () => {
  try {
    await waitForHealthyServer();

    const verified = await query({
      prompt: 'How old are you?',
      ministerId: selected.row.id,
      ministryId: selected.category,
      countryId: 'BD'
    });

    assert.equal(verified.response.status, 200, JSON.stringify(verified.payload));
    assert.equal(verified.payload?.result?.status, 'VERIFIED_FACT', JSON.stringify(verified.payload));
    assert.equal(verified.payload?.result?.operation, 'ATTRIBUTE', JSON.stringify(verified.payload));
    assert.equal(verified.payload?.result?.attribute, 'age', JSON.stringify(verified.payload));
    assert.equal(verified.payload?.result?.value, selected.row.age, JSON.stringify(verified.payload));
    assert.ok(
      verified.payload?.result?.evidence?.some(e =>
        e.dataset === 'ministers.json' &&
        e.entityType === 'MINISTER' &&
        e.canonicalEntityId === selected.row.id &&
        e.fieldPath?.endsWith('.age') &&
        e.rawValue === selected.row.age &&
        e.authority === 'NODE_FILESYSTEM'
      ),
      `missing minister age provenance: ${JSON.stringify(verified.payload?.result?.evidence)}`
    );

    const missingContext = await query({ prompt: 'How old are you?' });
    assert.equal(missingContext.response.status, 422, JSON.stringify(missingContext.payload));
    assert.notEqual(missingContext.payload?.result?.status, 'DEEP_CORE_EXECUTION_ERROR');
    assert.equal(missingContext.payload?.result?.value, null);
    assert.ok(
      ['MINISTER_UNRESOLVED', 'MINISTER_QUERY_UNRESOLVED'].includes(missingContext.payload?.result?.status),
      JSON.stringify(missingContext.payload)
    );

    console.log('DEEP CORE MINISTER SELF-QUERY TEST PASSED');
    console.log(`Minister: ${selected.row.id}`);
    console.log(`Age: ${selected.row.age}`);
    console.log('Question: How old are you?');
    console.log('Execution: VERIFIED_FACT');
    console.log('Evidence: ministers.json -> minister record -> age');
  } finally {
    child.kill('SIGTERM');
    await sleep(100);
  }
})().catch(error => {
  console.error(error.stack || error);
  child.kill('SIGTERM');
  process.exitCode = 1;
});
