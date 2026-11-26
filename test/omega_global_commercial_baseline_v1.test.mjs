import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const index = readJson('omega_global_commercial_baseline_v1.json');
const countryBaseline = readJson('country_factory_starting_baseline_v1.json');
const catalog = readJson('resource_industrial_catalog_v1.json');
const economy = readJson('resource_economy_rules.json');
const countries = Object.keys(countryBaseline.countries || {}).sort();
const productIds = Object.keys(catalog.productUseCatalog?.products || {}).sort();
const rawIds = new Set(Object.keys(economy.demand?.resourceProfiles || {}));
const allowedRoles = new Set([
  'HOUSEHOLD_DIRECT', 'INDUSTRIAL_INTERMEDIATE', 'ENERGY_UTILITY',
  'CONSTRUCTION_INFRASTRUCTURE', 'PROCESSED_CONSUMER_GOOD',
  'CAPITAL_OR_EQUIPMENT_INPUT', 'NOT_DIRECTLY_CONSUMED',
  'UNMAPPED_OR_UNSUPPORTED'
]);

function assertPartnerRows(rows, self, profileByCountry, type, isRawResource) {
  assert.ok(Array.isArray(rows), self + ' ' + type + ' must be an array');
  assert.ok(rows.length <= 3, self + ' ' + type + ' may retain only the top three partners');
  if (!rows.length) return;
  assert.equal(rows.reduce((sum, row) => sum + row[1], 0), 100,
    self + ' ' + type + ' shares must add to 100');
  const seen = new Set();
  for (const [partner, share] of rows) {
    assert.ok(countries.includes(partner), self + ' ' + type + ' partner must be a core country');
    assert.notEqual(partner, self, self + ' cannot be its own partner');
    assert.ok(!seen.has(partner), self + ' ' + type + ' partners cannot be duplicated');
    seen.add(partner);
    assert.ok(Number.isInteger(share) && share > 0 && share <= 100);
    const evidence = profileByCountry[partner];
    assert.ok(evidence, self + ' ' + type + ' needs counterpart profile evidence');
    if (type === 'supplierPartners') {
      assert.ok(evidence.domesticSupplyIndex >= (isRawResource ? 0.3 : 0.18));
      assert.ok(evidence.domesticSupplyIndex - evidence.domesticDemandIndex * 0.35 > 0.04);
    } else {
      assert.ok(evidence.domesticDemandIndex >= 0.10);
      assert.ok(evidence.domesticDemandIndex - evidence.domesticSupplyIndex * 0.25 > 0.04);
    }
  }
}

test('global commercial baseline covers every existing country and product identity', () => {
  assert.equal(countries.length, 197);
  assert.equal(productIds.length, 185);
  assert.equal(rawIds.size, 41);
  assert.equal(index.datasetId, 'OMEGA_GLOBAL_COMMERCIAL_BASELINE_V1');
  assert.equal(index.countryCount, 197);
  assert.equal(index.commodityCount, 185);
  assert.equal(index.rawResourceCount, 41);
  assert.equal(index.factoryProductCount, 144);
  assert.equal(index.totalCountryCommodityProfiles, 197 * 185);
  assert.equal(Object.keys(index.countries || {}).length, 197);
  assert.equal(index.shards.reduce((sum, shard) => sum + shard.commodityCount, 0), 185);
  assert.equal(index.countryPartnerCommodityCoverage, 185);
  assert.equal(index.countryPartnerProfileRows, 197 * 185);
  assert.deepEqual(Object.keys(index.commodityToShard).sort(), productIds);
});

test('all product shards contain complete per-country profiles and valid partner shares', () => {
  const profiles = Object.create(null);
  for (const shard of index.shards) {
    const content = fs.readFileSync(new URL('../' + shard.file, import.meta.url), 'utf8');
    assert.doesNotMatch(content, /simulationOnly|simulated data|not real data/i);
    const data = JSON.parse(content);
    assert.equal(data.datasetId, index.datasetId);
    assert.equal(data.shardId, shard.id);
    assert.equal(Object.keys(data.commodities || {}).length, shard.commodityCount);
    for (const [productId, product] of Object.entries(data.commodities)) {
      assert.ok(productIds.includes(productId), productId + ' must reuse an existing product identity');
      assert.equal(index.commodityToShard[productId], shard.id);
      assert.equal(product.productType, rawIds.has(productId) ? 'RAW_RESOURCE' : 'FACTORY_PRODUCT');
      assert.ok(allowedRoles.has(product.productRole));
      assert.deepEqual(Object.keys(product.countries || {}).sort(), countries);
      for (const [countryId, row] of Object.entries(product.countries)) {
        assert.ok(['IMPORTER', 'EXPORTER', 'BALANCED'].includes(row.role));
        assert.ok(Number.isInteger(row.importDependencyPct) && row.importDependencyPct >= 5 && row.importDependencyPct <= 95);
        assert.equal(row.exportPotentialPct + row.importDependencyPct, 100);
        assert.ok(Number.isFinite(row.domesticSupplyIndex) && row.domesticSupplyIndex >= 0);
        assert.ok(Number.isFinite(row.domesticDemandIndex) && row.domesticDemandIndex > 0);
        assertPartnerRows(row.supplierPartners, countryId, product.countries, 'supplierPartners', product.productType === 'RAW_RESOURCE');
        assertPartnerRows(row.buyerMarkets, countryId, product.countries, 'buyerMarkets', product.productType === 'RAW_RESOURCE');
      }
      profiles[productId] = product;
    }
  }
  assert.deepEqual(Object.keys(profiles).sort(), productIds);
  assert.equal(Object.keys(profiles).length * countries.length, 197 * 185);
});

test('global commercial index and every data shard are available in the offline core cache', () => {
  const worker = fs.readFileSync(new URL('../omega-offline-map-sw.js', import.meta.url), 'utf8');
  const required = ['omega_global_commercial_baseline_v1.json', ...index.shards.map(row => row.file)];
  for (const file of required) assert.ok(worker.includes('"./' + file + '"'), file + ' must be cached for offline use');
  assert.match(worker, /omega-offline-atlas-shell-v154/);
});

test('country-wide commercial partner lists are country-specific and never self-referential', () => {
  for (const [countryId, row] of Object.entries(index.countries)) {
    assert.ok(row.countryName);
    assert.ok(row.continent);
    assert.ok(row.industryArchetype);
    assert.ok(Array.isArray(row.majorPartners));
    assert.ok(row.majorPartners.length <= 12);
    if (row.majorPartners.length) {
      assert.equal(row.majorPartners.reduce((sum, item) => sum + item[1], 0), 100);
      const seen = new Set();
      for (const [partner, share] of row.majorPartners) {
        assert.ok(countries.includes(partner));
        assert.notEqual(partner, countryId);
        assert.ok(!seen.has(partner));
        assert.ok(Number.isInteger(share) && share > 0 && share <= 100);
        seen.add(partner);
      }
    }
  }
});

test('known industrial specializations feed distinct commodity profiles', () => {
  const profiles = Object.create(null);
  for (const shard of index.shards) {
    const data = readJson(shard.file);
    Object.assign(profiles, data.commodities);
  }
  assert.ok(profiles.textile_fabric.countries.BGD.domesticSupplyIndex > 0);
  assert.ok(profiles.copper.countries.CHL.domesticSupplyIndex > profiles.copper.countries.BGD.domesticSupplyIndex);
  assert.ok(profiles.crude_oil.countries.SAU.domesticSupplyIndex > profiles.crude_oil.countries.BGD.domesticSupplyIndex);
  assert.ok(profiles.industrial_machinery.countries.DEU.domesticSupplyIndex >
    profiles.industrial_machinery.countries.BGD.domesticSupplyIndex);
});
