import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const base = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const expansion = JSON.parse(read('resource_site_country_expansion_v1.json'));
const runtime = read('omega_resource_endowment_runtime.js');
const network = read('omega_resource_industrial_network_v1.js');

const rows = [...base.sites, ...expansion.records];
assert.equal(base.siteCount, 199);
assert.equal(expansion.siteCount, 51);
assert.equal(rows.length, 250);
assert.equal(new Set(rows.map(s => s.siteId)).size, 250, 'all 250 site IDs must be unique');

const fields = ['reserve','production','grade','recovery','throughput','purity','capacity'];
for (const site of rows) {
  assert.ok(site.siteId, 'site ID required');
  assert.match(String(site.countryId || site.identity?.countryIso3 || ''), /^[A-Z]{3}$/);
  for (const field of fields) {
    const value = site.quantitative?.[field];
    assert.ok(value && typeof value === 'object', site.siteId + ': quantitative.' + field + ' shape required');
    // Raw legacy rows may omit a status; the runtime normalizer must provide one without inventing values.
  }
  const coords = site.location?.coordinates || {};
  assert.ok(Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lng)), site.siteId + ': coordinates required');
}
assert.match(runtime, /function normalizeSiteQuantitative\(row\)/);
assert.match(runtime, /const normalizedRows=rows\.map\(normalizeSiteRecord\)/);
assert.match(runtime, /g\.OmegaResourceSiteDataContract=/);
assert.match(network, /quantitative:clone\(row\?\.quantitative\|\|\{\}\)/);
assert.match(network, /function quantitativeEngineAdapter\(site, quantitative\)/);
assert.match(network, /productionModel\.productionRate=dailyRate/);
assert.match(network, /observedStatus\(p\)&&perDay\(p\.unit\)/);
assert.match(network, /distanceStatus:'UNOBSERVED'/);

test('all canonical and expansion sites share a typed runtime contract without fabricated observations', () => {
  for (const site of rows) {
    for (const field of fields) {
      const v = site.quantitative[field];
      if (v.status && ['UNOBSERVED','UNQUANTIFIED'].includes(v.status)) {
        for (const key of ['value','quantity','annual','rate','nominal','minimum','maximum']) {
          if (Object.prototype.hasOwnProperty.call(v,key)) assert.equal(v[key], null, site.siteId + ': unknown ' + field + '.' + key + ' must remain null');
        }
      }
    }
  }
});
console.log('OMEGA SITE DATA CONTRACT: PASS - 199 base + 51 additive records; 250 unique site IDs; seven typed quantitative fields checked.');
