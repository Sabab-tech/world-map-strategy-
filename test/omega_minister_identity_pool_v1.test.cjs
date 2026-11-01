'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const countries = JSON.parse(fs.readFileSync(path.join(root, 'countries.json'), 'utf8'));
const resourceIndex = JSON.parse(fs.readFileSync(path.join(root, 'resource_country_resource_context_index.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'minister_country_roster_manifest_v1.json'), 'utf8'));
const templates = JSON.parse(fs.readFileSync(path.join(root, 'ministers.json'), 'utf8'));
const requested = [];
const sandbox = { console, setInterval:()=>1, clearInterval:()=>{}, setTimeout, clearTimeout, fetch: async (url) => { requested.push(String(url)); return { ok:false, status:404, json:async()=>({}) }; } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, 'omega_minister_identity_pool_v1.js'), 'utf8'), sandbox, {
  filename:'omega_minister_identity_pool_v1.js'
});
const pool = sandbox.OmegaMinisterIdentityPool;
assert.ok(pool, 'identity pool API must be installed');
const configured = pool.configure({ manifest, templates });

(async () => {
  const expectedCodes = Object.keys(resourceIndex.countries).sort();
  const manifestCodes = Object.keys(manifest.countries).sort();
  assert.equal(expectedCodes.length, 197, 'game country scope must contain exactly 197 identities');
  assert.deepEqual(manifestCodes, expectedCodes, 'manifest must match the canonical 197-country scope exactly');
  assert.equal(countries.filter(row => expectedCodes.includes(String(row.iso3 || '').toUpperCase())).length, 197);
  assert.equal(configured.countryCount, 197);
  assert.equal(configured.ministryCount, 18);
  assert.equal(configured.candidatesPerMinistry, 5);
  assert.equal(configured.candidatesPerCountry, 90);
  assert.equal(configured.totalProfiles, 17730);

  const ids = new Set();
  for (const countryCode of expectedCodes) {
    const roster = await pool.getCountryRoster(countryCode);
    assert.equal(roster.countryCode, countryCode);
    assert.equal(Object.keys(roster.record.ministries).length, 18, countryCode + ' must have all ministry rosters');
    const names = new Set();
    for (const def of manifest.ministryDefinitions) {
      const candidates = roster.record.ministries[def.id];
      assert.equal(candidates.length, 5, countryCode + '/' + def.id);
      for (const candidate of candidates) {
        assert.ok(candidate.id.startsWith('MIN-' + countryCode + '-'), 'candidate ID must encode the country');
        assert.ok(!ids.has(candidate.id), 'minister identity ID must be globally unique: ' + candidate.id);
        ids.add(candidate.id);
        assert.equal(candidate.countryCode, countryCode);
        assert.equal(candidate.ministryId, def.id);
        assert.equal(candidate.isFictional, true);
        assert.ok(candidate.ideology && candidate.ideology.type, 'candidate ideology must be populated from profile data');
        assert.ok(candidate.gender, 'candidate gender field must be present');
        assert.equal(candidate.recordType, 'SIMULATED_FICTIONAL');
        assert.ok(candidate.profileDetails && candidate.profileDetails.summary);
        assert.ok(candidate.profileDetails.professionalBackground);
        assert.ok(candidate.profileDetails.leadershipStyle);
        assert.ok(candidate.profileDetails.decisionMaking);
        assert.ok(candidate.profileDetails.provenanceNotice.includes('Fictional'));
        assert.equal(candidate.profileDetails.priorityAreas.length, 3);
        for (const value of Object.values(Object.assign({}, candidate.stats, candidate.efficiency))) {
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, countryCode + '/' + def.id + ' rating range');
        }
        names.add(candidate.displayName);
      }
    }
    assert.equal(names.size, 90, countryCode + ' must have 90 distinct names across 18 ministries');
  }
  assert.equal(ids.size, 17730, 'all generated identities must be globally unique');

  // Exercise the actual recruitment engine's offline path, not only the pure generator.
  vm.runInNewContext(fs.readFileSync(path.join(root, 'minister_recruitment_engine.js'), 'utf8'), sandbox, {
    filename:'minister_recruitment_engine.js'
  });
  const recruitment = sandbox.OmegaMinisterRecruitment;
  assert.ok(recruitment && typeof recruitment.fetchRoster === 'function');
  const requestCountBeforeRoster = requested.length;
  const runtimeRoster = await recruitment.fetchRoster('interior_security', 'BGD');
  assert.equal(runtimeRoster.length, 5);
  assert.ok(runtimeRoster.every(p => p.countryCode === 'BGD' && p.ministryId === 'interior_security'));
  assert.ok(runtimeRoster.every(p => p.rosterSource === 'COUNTRY_MINISTRY_ROSTER_V1'));
  const runtimeOtherCountry = await recruitment.fetchRoster('interior_security', 'USA');
  assert.ok(runtimeOtherCountry.every(p => p.countryCode === 'USA'));
  assert.notEqual(runtimeRoster[0].id, runtimeOtherCountry[0].id);
  assert.equal(requested.length, requestCountBeforeRoster,
    'the canonical identity pool must be resolved before any generic legacy API candidate can replace it');
  const offlineWorker = fs.readFileSync(path.join(root, 'omega-offline-map-sw.js'), 'utf8');
  assert.match(offlineWorker, /omega-offline-atlas-shell-v67/);
  assert.ok(offlineWorker.includes('"./minister_country_roster_manifest_v1.json"'));
  assert.ok(offlineWorker.includes('"./ministers.json"'));

  const bangladesh = await pool.getCandidates('BGD', 'interior_security');
  const sameAgain = await pool.getCandidates('Bangladesh', 'interior_security');
  const usa = await pool.getCandidates('USA', 'interior_security');
  const treasury = await pool.getCandidates('BGD', 'treasury_finance');
  assert.equal(bangladesh.length, 5);
  assert.equal(JSON.stringify(bangladesh), JSON.stringify(sameAgain), 'same country/ministry must generate repeatable candidate data');
  assert.ok(bangladesh.every(p => p.countryCode === 'BGD' && p.ministryId === 'interior_security'));
  assert.ok(usa.every(p => p.countryCode === 'USA' && p.ministryId === 'interior_security'));
  assert.ok(treasury.every(p => p.countryCode === 'BGD' && p.ministryId === 'treasury_finance'));
  assert.notEqual(bangladesh[0].id, usa[0].id);
  assert.notEqual(bangladesh[0].id, treasury[0].id);
  await assert.rejects(pool.getCandidates('GUM', 'defense'), /COUNTRY_ROSTER_COUNTRY_NOT_FOUND/,
    'out-of-scope territory records must not silently receive a generic country roster');
  await assert.rejects(pool.getCandidates('BGD', 'not_a_real_ministry'), /COUNTRY_MINISTRY_ROSTER_NOT_FOUND/);
  console.log('MINISTER IDENTITY POOL: PASS');
  console.log('197 countries × 18 ministries × 5 candidates = ' + ids.size + ' globally unique fictional identities');
  console.log('90 distinct dossier names per country; deterministic lookup, country isolation and territory guard: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});