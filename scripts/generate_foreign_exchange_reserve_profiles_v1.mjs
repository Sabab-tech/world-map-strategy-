#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const readJson = async name => JSON.parse(await readFile(path.join(ROOT, name), 'utf8'));
const finite = value => typeof value === 'number' && Number.isFinite(value)
  ? value
  : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
    ? Number(value) : null;
const ids = row => [row.iso3, row.countryCode, row.numericCode, row.name, row.economyKey]
  .filter(Boolean).map(value => String(value).trim().toUpperCase());
const fail = message => { throw new Error('[FOREIGN RESERVE DATA] ' + message); };

const [raw, profiles] = await Promise.all([
  readJson('economy_raw_financial_data_v2.json'),
  readJson('economy_global_profiles_v1.json')
]);
if (!Array.isArray(raw.countries) || !Array.isArray(profiles.countries)
  || raw.countries.length !== 249 || profiles.countries.length !== 249) {
  fail('both canonical source registries must contain the 249 country/area identities');
}
const rawById = new Map();
for (const row of raw.countries) {
  for (const key of ids(row)) {
    const previous = rawById.get(key);
    if (previous && previous !== row) fail('duplicate raw identity: ' + key);
    rawById.set(key, row);
  }
}
const records = [];
const seen = new Set();
for (const profile of profiles.countries) {
  const matches = ids(profile).map(id => rawById.get(id)).filter(Boolean);
  if (!matches.length || matches.some(row => row !== matches[0])) {
    fail('no unique raw-profile mapping for ' + profile.name);
  }
  const rawRow = matches[0];
  const identity = String(profile.iso3 || profile.countryCode || '').toUpperCase();
  if (!identity || seen.has(identity)) fail('duplicate/missing profile identity: ' + identity);
  seen.add(identity);
  const values = [
    ['economy_global_profiles_v1.json:sourceValues.reserves', finite(profile.sourceValues?.reserves)],
    ['economy_global_profiles_v1.json:indicators.foreignExchangeReservesUsd', finite(profile.indicators?.foreignExchangeReservesUsd)],
    ['economy_raw_financial_data_v2.json:rawSourceRecords.economy.reserves', finite(rawRow.rawSourceRecords?.economy?.reserves)],
    ['economy_raw_financial_data_v2.json:rawIndicators.foreignExchangeReservesUsd', finite(rawRow.rawIndicators?.foreignExchangeReservesUsd)]
  ];
  const recorded = values.filter(([, value]) => value !== null);
  if (recorded.some(([, value]) => value < 0)) fail('negative reserve for ' + profile.name);
  if (new Set(recorded.map(([, value]) => value)).size > 1) {
    fail('reserve values disagree for ' + profile.name + ': ' + JSON.stringify(values));
  }
  const reserve = recorded.length ? recorded[0][1] : null;
  const codes = [profile.sourceValues?.currency_code, rawRow.rawIndicators?.currencyCode]
    .filter(value => typeof value === 'string' && /^[A-Z]{3}$/.test(value));
  if (new Set(codes).size > 1) fail('currency mismatch for ' + profile.name);
  const names = [profile.sourceValues?.currency_name, rawRow.rawIndicators?.currencyName]
    .filter(value => typeof value === 'string' && value.trim());
  if (new Set(names).size > 1) fail('currency-name mismatch for ' + profile.name);
  records.push({
    countryCode: profile.countryCode || rawRow.countryCode || null,
    iso3: profile.iso3 || rawRow.iso3 || null,
    numericCode: profile.numericCode || rawRow.numericCode || null,
    countryName: profile.name,
    economyKey: profile.economyKey || null,
    currencyCode: codes[0] || null,
    currencyName: names[0] || null,
    baselineYear: 2015,
    referenceReservesUsd: reserve,
    status: reserve === null ? 'NOT_RECORDED' : 'RECORDED_BASELINE',
    profileStatus: profile.profileStatus || rawRow.profileStatus || 'UNKNOWN',
    sourceFile: 'economy_raw_financial_data_v2.json',
    sourceField: 'rawIndicators.foreignExchangeReservesUsd',
    crossCheckFields: [
      'economy_raw_financial_data_v2.json:rawSourceRecords.economy.reserves',
      'economy_global_profiles_v1.json:sourceValues.reserves',
      'economy_global_profiles_v1.json:indicators.foreignExchangeReservesUsd'
    ]
  });
}
if (records.length !== 249 || seen.size !== 249) fail('expected 249 unique reserve rows');
const withValues = records.filter(row => row.referenceReservesUsd !== null).length;
const withoutValues = records.length - withValues;
if (withValues !== 230 || withoutValues !== 19) {
  fail('unexpected recorded/missing reserve coverage: ' + withValues + '/' + withoutValues);
}
const dataset = {
  schemaVersion: '1.0.0',
  metadata: {
    title: 'OMEGA Foreign-Exchange Reserve Reference Registry',
    baselineYear: 2015,
    countryAndAreaCount: 249,
    recordsWithReferenceReservesUsd: withValues,
    recordsWithoutReferenceReservesUsd: withoutValues,
    unit: 'USD',
    valueMeaning: "Reference foreign-exchange reserve assets in USD from the existing repository baseline. These are not the player's current mutable in-game reserve balance.",
    sourceFiles: ['economy_raw_financial_data_v2.json', 'economy_global_profiles_v1.json'],
    dataPolicy: 'The two existing data sets were reconciled record-by-record. A value is retained only where all recorded source fields agree. Null means not recorded; it never means zero. No reserve figure is fabricated.',
    provenanceWarning: 'The existing local baseline is dated 2015 and has not been independently revalidated against current official World Bank, IMF, or national-central-bank reserve series.',
    runtimeOwnership: 'Immutable reference/seeding data only. Mutable simulation reserve balances are stored separately under governmentBanking.forex.reserveAccountsByCountry.'
  },
  reserves: records
};
const target = path.join(ROOT, 'foreign_exchange_reserve_profiles_v1.json');
const rendered = JSON.stringify(dataset, null, 2) + '\n';
if (CHECK) {
  const existing = await readFile(target, 'utf8').catch(() => null);
  if (existing !== rendered) fail('generated reserve registry is stale; run node scripts/generate_foreign_exchange_reserve_profiles_v1.mjs');
  console.log('FOREIGN RESERVE REGISTRY CHECK PASSED: 249 records, 230 baseline values, 19 explicit nulls.');
} else {
  await writeFile(target, rendered);
  console.log('Wrote ' + path.relative(ROOT, target) + ': 249 records, 230 baseline values, 19 explicit nulls.');
}
