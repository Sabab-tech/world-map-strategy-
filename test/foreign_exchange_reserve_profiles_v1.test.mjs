import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const parse = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const [registry, profilesRoot, rawRoot] = await Promise.all([
  parse('foreign_exchange_reserve_profiles_v1.json'),
  parse('economy_global_profiles_v1.json'),
  parse('economy_raw_financial_data_v2.json')
]);
const finite = value => typeof value === 'number' && Number.isFinite(value)
  ? value
  : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
    ? Number(value) : null;
const norm = value => String(value == null ? '' : value).trim().toUpperCase();

test('reserve registry covers all 249 country/area identities with provenance and no fabricated zeros', () => {
  assert.equal(registry.schemaVersion, '1.0.0');
  assert.equal(registry.metadata.baselineYear, 2015);
  assert.equal(registry.metadata.countryAndAreaCount, 249);
  assert.equal(registry.reserves.length, 249);
  assert.equal(registry.metadata.recordsWithReferenceReservesUsd, 230);
  assert.equal(registry.metadata.recordsWithoutReferenceReservesUsd, 19);
  assert.match(registry.metadata.provenanceWarning, /not been independently revalidated/i);
  const unique = new Set(registry.reserves.map(row => row.iso3 || row.countryCode));
  assert.equal(unique.size, 249);
  assert.equal(registry.reserves.filter(row => row.status === 'RECORDED_BASELINE').length, 230);
  assert.equal(registry.reserves.filter(row => row.status === 'NOT_RECORDED').length, 19);
  for (const row of registry.reserves) {
    assert.equal(row.baselineYear, 2015);
    assert.equal(row.referenceReservesUsd === null, row.status === 'NOT_RECORDED');
    assert.ok(row.referenceReservesUsd === null || (Number.isFinite(row.referenceReservesUsd) && row.referenceReservesUsd >= 0));
    assert.equal(row.sourceFile, 'economy_raw_financial_data_v2.json');
    assert.equal(row.sourceField, 'rawIndicators.foreignExchangeReservesUsd');
    assert.equal(row.crossCheckFields.length, 3);
  }
});

test('every generated reserve agrees across both pre-existing data sets', () => {
  const profilesByIso3 = new Map(profilesRoot.countries.map(row => [norm(row.iso3 || row.countryCode), row]));
  const rawByIso3 = new Map(rawRoot.countries.map(row => [norm(row.iso3 || row.countryCode), row]));
  for (const reserve of registry.reserves) {
    const key = norm(reserve.iso3 || reserve.countryCode);
    const profile = profilesByIso3.get(key);
    const raw = rawByIso3.get(key);
    assert.ok(profile, 'missing country profile ' + key);
    assert.ok(raw, 'missing raw financial record ' + key);
    assert.equal(reserve.countryName, profile.name);
    const values = [
      finite(profile.sourceValues?.reserves),
      finite(profile.indicators?.foreignExchangeReservesUsd),
      finite(raw.rawSourceRecords?.economy?.reserves),
      finite(raw.rawIndicators?.foreignExchangeReservesUsd)
    ].filter(value => value !== null);
    assert.ok(values.every(value => value === values[0]), 'conflicting reserve sources for ' + key);
    assert.equal(reserve.referenceReservesUsd, values.length ? values[0] : null);
    assert.equal(reserve.currencyCode, profile.sourceValues?.currency_code || raw.rawIndicators?.currencyCode || null);
  }
});

test('runtime preserves a distinct live reserve balance and exposes both currency quotes', async () => {
  const runtimeSource = await readFile(new URL('../omega_foreign_reserve_runtime_v1.js', import.meta.url), 'utf8');
  const sampleProfiles = [
    { name: 'Bangladesh', countryCode: 'BD', iso3: 'BGD', economyKey: 'BANGLADESH',
      sourceValues: { currency_code: 'BDT', currency_name: 'Bangladeshi taka', reserves: 120 },
      indicators: { foreignExchangeReservesUsd: 120 }, profileStatus: 'AVAILABLE' },
    { name: 'Nigeria', countryCode: 'NG', iso3: 'NGA', economyKey: 'NIGERIA',
      sourceValues: { currency_code: 'NGN', currency_name: 'Nigerian naira', reserves: 250 },
      indicators: { foreignExchangeReservesUsd: 250 }, profileStatus: 'AVAILABLE' }
  ];
  const sampleRegistry = {
    schemaVersion: '1.0.0',
    metadata: { baselineYear: 2015, countryAndAreaCount: 2 },
    reserves: [
      { countryCode: 'BD', iso3: 'BGD', countryName: 'Bangladesh', currencyCode: 'BDT',
        currencyName: 'Bangladeshi taka', baselineYear: 2015, referenceReservesUsd: 100, status: 'RECORDED_BASELINE' },
      { countryCode: 'NG', iso3: 'NGA', countryName: 'Nigeria', currencyCode: 'NGN',
        currencyName: 'Nigerian naira', baselineYear: 2015, referenceReservesUsd: 200, status: 'RECORDED_BASELINE' }
    ]
  };
  const listeners = new Map();
  const context = vm.createContext({
    console,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = (options && options.detail) || {}; } },
    addEventListener(type, callback) { const all = listeners.get(type) || []; all.push(callback); listeners.set(type, all); },
    dispatchEvent(event) { for (const cb of listeners.get(event.type) || []) cb(event); return true; },
    fetch: async path => ({ ok: true, json: async () => sampleRegistry }),
    gameState: {
      simulation: { turn: 0, playerCountryId: 'BD' },
      economy: { BANGLADESH: { reserves: 120 }, NIGERIA: { reserves: 250 } },
      finance: {}
    }
  });
  context.OmegaFinanceMinistry = {
    init: async () => ({ initialized: true }),
    getProfiles: () => sampleProfiles,
    getPlayerCountry: () => sampleProfiles[0]
  };
  context.OmegaForexMonetaryEngine = {
    getCurrencyCode: profile => profile?.sourceValues?.currency_code || null,
    getRate: code => ({ USD: 1, BDT: 120, NGN: 1500 })[code] || null
  };
  vm.runInContext(runtimeSource, context, { filename: 'omega_foreign_reserve_runtime_v1.js' });
  const runtime = context.OmegaForeignReserveRuntime;
  const init = await runtime.init();
  assert.equal(init.initialized, true);
  assert.equal(init.registryStatus, 'LOADED');
  assert.equal(init.countryAreaCount, 2);
  const bangladesh = runtime.getAccount('BGD');
  assert.equal(bangladesh.balanceUsd, 120, 'preserve the live economy balance rather than reset it to reference baseline');
  assert.equal(bangladesh.referenceReservesUsd, 100, 'baseline must remain separate from live balance');
  assert.equal(bangladesh.reserveCurrencyCode, 'USD');
  assert.equal(bangladesh.domesticCurrencyCode, 'BDT');
  assert.equal(bangladesh.localEquivalent, 14400);
  assert.equal(runtime.getAccount('NGA').balanceUsd, 250);
  context.dispatchEvent(new context.CustomEvent('OMEGA_FX_INTERVENTION_SETTLED', {
    detail: { countryCode: 'BD', reserveAfterUsd: 90 }
  }));
  assert.equal(runtime.getAccount('BD').balanceUsd, 90);
  assert.equal(context.gameState.economy.BANGLADESH.reserves, 90);
  context.gameState.economy.BANGLADESH.reserves = 85;
  context.dispatchEvent(new context.CustomEvent('OMEGA_FX_MARKET_UPDATED', { detail: { turn: 1 } }));
  assert.equal(runtime.getAccount('BGD').balanceUsd, 85, 'peg/intervention movement must reconcile through game time');
  assert.equal(runtime.getAccount('BGD').updatedTurn, 1);
});
