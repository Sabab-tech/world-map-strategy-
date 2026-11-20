const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'minister_recruitment_engine.js'), 'utf8');
const requested = [];
const candidates = Array.from({ length: 5 }, (_, i) => ({
  id: 'finance-candidate-' + (i + 1),
  name: 'Finance Candidate ' + (i + 1),
  background: 'Finance policy experience',
  age: 40 + i,
  stats: { strategy: 70 + i },
  efficiency: { execution: 65 + i },
  regional_names: { south_asia: 'Regional Candidate ' + (i + 1) }
}));
const sandbox = {
  OmegaMinistersDB: { finance: candidates },
  console,
  fetch: async url => {
    requested.push(String(url));
    return { ok: false, status: 404, json: async () => ({ ok: false, error: 'API not found' }) };
  },
  setInterval: () => 1,
  clearInterval: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'minister_recruitment_engine.js' });

(async () => {
  const roster = await sandbox.OmegaMinisterRecruitment.fetchRoster('finance', 'BGD');
  assert.equal(roster.length, 5, 'offline roster must return exactly five candidates');
  assert.deepEqual([...roster].map(candidate => candidate.id), candidates.map(candidate => candidate.id));
  assert.ok([...roster].every(candidate => candidate.rosterSource === 'MINISTERS_JSON_OFFLINE'));
  assert.ok(requested[0].startsWith('api/minister-candidates?'), 'API route must be relative to the project base path');
  assert.ok(!requested[0].startsWith('/'), 'static Pages must not request the API at the host root');
  console.log('OMEGA MINISTER OFFLINE RECRUITMENT ROSTER: PASS');
  console.log('API-first selection with ministers.json fallback: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
