import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildCommercialPartnerProfiles } from '../scripts/build_omega_commercial_partner_profiles_v1.mjs';

async function fixtureDirectory(t, rowsByYear) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omega-baci-fixture-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(path.join(root, 'country_codes_V202601.csv'),
    'Country Code,Country Name,ISO2-digit Alpha,ISO3-digit Alpha\n' +
    '50,Bangladesh,BD,BGD\n' +
    '276,Germany,DE,DEU\n' +
    '999,External Market,XX,XYZ\n',
    'utf8');

  const mapping = JSON.parse(await fs.readFile(
    new URL('../omega_commercial_hs22_resource_mapping_v1.json', import.meta.url), 'utf8'
  ));
  const exactCodes = [...new Set(Object.values(mapping.resources)
    .filter(row => row.status === 'MAPPED_EXACT')
    .flatMap(row => row.codes))].sort();
  await fs.writeFile(path.join(root, 'product_codes_HS22_V202601.csv'),
    'productCode,productName\n' +
    exactCodes.map(code => code + ',Verified HS22 fixture').join('\n') + '\n',
    'utf8');

  for (const year of [2022, 2023, 2024]) {
    const rows = rowsByYear[year] || [];
    await fs.writeFile(
      path.join(root, 'BACI_HS22_Y' + year + '_V202601.csv'),
      ['t,i,j,k,v,q', ...rows].join('\n') + '\n',
      'utf8'
    );
  }
  return root;
}

const profileFor = (output, countryId, resourceId) =>
  output.countries[countryId].resourceProfiles[resourceId];

function walkKeys(value, forbidden, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    const current = prefix ? prefix + '.' + key : key;
    if (forbidden.has(key.toLowerCase())) found.push(current);
    found.push(...walkKeys(child, forbidden, current));
  }
  return found;
}

test('BACI 2022-2023 shares aggregate value weights without retaining absolute trade values or quantity', async t => {
  const root = await fixtureDirectory(t, {
    2022: [
      '2022,276,50,260300,100,',
      '2022,999,50,260300,50,',
      '2022,888,50,260300,25,'
    ],
    2023: [
      '2023,276,50,260300,300,',
      '2023,999,50,260300,100,'
    ],
    2024: [
      '2024,276,50,260300,50,'
    ]
  });

  const output = await buildCommercialPartnerProfiles({ dataDir: root });
  const copper = profileFor(output, 'BGD', 'copper');

  assert.equal(output.coverage.coreCountryCount, 197);
  assert.equal(output.coverage.rawResourceCount, 41);
  assert.equal(output.coverage.exactHsMappedResourceCount, 17);
  assert.equal(output.coverage.resourceProfileSlotCount, 197 * 41);
  assert.equal(Object.keys(output.countries.BGD.resourceProfiles).length, 41);
  assert.equal(profileFor(output, 'BGD', 'gypsum').mappingStatus, 'MAPPED_PARTIAL');
  assert.equal(profileFor(output, 'BGD', 'gypsum').profileStatus, 'NOT_ELIGIBLE_MAPPING_STATUS');
  assert.equal(profileFor(output, 'BGD', 'gypsum').baseline.unresolvedPartnerShare, null);
  assert.equal(output.coverage.validBaciFlowRowCount, 6);
  assert.equal(output.coverage.selectedExactResourceFlowRowCount, 6);
  assert.equal(output.coverage.unresolvedPartnerFlowRowCount, 1);
  assert.equal(output.coverage.unresolvedImporterFlowRowCount, 0);
  assert.equal(output.coverage.nonCoreImporterFlowRowCount, 0);
  assert.equal(output.coverage.selfFlowRowCount, 0);

  assert.equal(copper.mappingStatus, 'MAPPED_EXACT');
  assert.equal(copper.profileStatus, 'OBSERVED_2022_2023_BASELINE');
  assert.deepEqual(copper.baseline.observedYears, [2022, 2023]);
  assert.equal(copper.baseline.partnerShares.length, 2);
  assert.equal(copper.baseline.partnerShares[0].partnerIso3, 'DEU');
  assert.ok(Math.abs(copper.baseline.partnerShares[0].share - (400 / 575)) < 1e-10);
  assert.equal(copper.baseline.partnerShares[0].partnerKind, 'CORE_COUNTRY');
  assert.equal(copper.baseline.partnerShares[1].partnerIso3, 'XYZ');
  assert.ok(Math.abs(copper.baseline.partnerShares[1].share - (150 / 575)) < 1e-10);
  assert.equal(copper.baseline.partnerShares[1].partnerKind, 'EXTERNAL_MARKET');
  assert.ok(Math.abs(copper.baseline.unresolvedPartnerShare - (25 / 575)) < 1e-10);
  assert.ok(Math.abs(
    copper.baseline.partnerShares.reduce((sum, row) => sum + row.share, 0) +
    copper.baseline.unresolvedPartnerShare - 1
  ) < 1e-10);

  assert.equal(copper.provisional2024.status, 'OBSERVED_POSITIVE_FLOWS');
  assert.deepEqual(copper.provisional2024.observedYears, [2024]);
  assert.equal(copper.provisional2024.partnerShares.length, 1);
  assert.equal(copper.provisional2024.partnerShares[0].partnerIso3, 'DEU');
  assert.equal(copper.provisional2024.partnerShares[0].share, 1);

  const forbidden = new Set(['value', 'tradevalue', 'quantity', 'tradequantity', 'price', 'amount']);
  assert.deepEqual(walkKeys(output, forbidden), [],
    'profile output must not retain absolute trade values, quantities, prices or amounts');
  assert.equal(output.policies.noPartnerValueOrQuantityRetained, true);
  assert.equal(output.policies.noGameStateMutation, true);
  assert.equal(output.policies.2024IsProvisionalOnly, true);
});

test('a missing positive flow is unknown rather than a zero partner share', async t => {
  const root = await fixtureDirectory(t, { 2022: [], 2023: [], 2024: [] });
  const output = await buildCommercialPartnerProfiles({ dataDir: root });
  const profile = profileFor(output, 'BGD', 'crude_oil');

  assert.equal(profile.mappingStatus, 'MAPPED_EXACT');
  assert.equal(profile.profileStatus, 'NO_POSITIVE_FLOW_RECORDED_REPORTING_COVERAGE_UNKNOWN');
  assert.deepEqual(profile.baseline.partnerShares, []);
  assert.equal(profile.baseline.unresolvedPartnerShare, null);
  assert.equal(profile.provisional2024.unresolvedPartnerShare, null);
  assert.notEqual(profile.profileStatus, 'ZERO_IMPORT_DEPENDENCY');
});

test('non-core importers are not assigned to a core country, and a self-flow is rejected', async t => {
  const root = await fixtureDirectory(t, {
    2022: [
      '2022,276,999,260300,10,',
      '2022,276,888,260300,5,'
    ],
    2023: [],
    2024: []
  });
  const output = await buildCommercialPartnerProfiles({ dataDir: root });
  assert.equal(output.coverage.nonCoreImporterFlowRowCount, 1);
  assert.equal(output.coverage.unresolvedImporterFlowRowCount, 1);
  assert.equal(profileFor(output, 'BGD', 'copper').profileStatus,
    'NO_POSITIVE_FLOW_RECORDED_REPORTING_COVERAGE_UNKNOWN');

  const selfRoot = await fixtureDirectory(t, {
    2022: ['2022,50,50,260300,10,'],
    2023: [],
    2024: []
  });
  await assert.rejects(
    () => buildCommercialPartnerProfiles({ dataDir: selfRoot }),
    /BACI_202601_CONTAINS_SELF_FLOW/
  );
});

test('the importer refuses to build when official HS22 product metadata omits an exact-mapped code', async t => {
  const root = await fixtureDirectory(t, { 2022: [], 2023: [], 2024: [] });
  const productPath = path.join(root, 'product_codes_HS22_V202601.csv');
  await fs.writeFile(productPath, 'productCode,productName\n999999,Unknown\n', 'utf8');

  // A complete exact-code mapping must be reconciled against the matching
  // official HS22 product dictionary before any partner profiles are built.
  await assert.rejects(
    () => buildCommercialPartnerProfiles({ dataDir: root }),
    /EXACT_HS22_CODES_MISSING_FROM_OFFICIAL_PRODUCT_METADATA/
  );
});
