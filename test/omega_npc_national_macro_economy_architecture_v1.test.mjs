import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const roster = readJson('minister_country_roster_manifest_v1.json');
const canonicalCountries = readJson('countries.json');
const profiles = readJson('economy_global_profiles_v1.json');
const rules = readJson('npc_national_macro_economy_rules_v1.json');
const transmissionRules = readJson('financial_transmission_rules_v1.json');
const runtime = readFileSync('omega_npc_national_macro_economy_runtime_v1.js', 'utf8');
const transmission = readFileSync('omega_economic_transmission_runtime_v1.js', 'utf8');

test('the NPC macro scope is the declared 197-country core-game roster, not the 249 identity registry', () => {
  const ids = Object.keys(roster.countries || {});
  const canonicalIds = new Set(canonicalCountries.map(row => String(row.iso3 || '').toUpperCase()));
  const profileIds = new Set((profiles.countries || []).map(row => String(row.iso3 || '').toUpperCase()));

  assert.equal(roster.counts.countryEntities, 197);
  assert.equal(ids.length, 197);
  assert.match(roster.scope, /Exactly the 197 ISO3 country identities/);
  assert.equal(canonicalCountries.length, 249);
  assert.equal(canonicalIds.size, 249);
  assert.equal(profileIds.size, 249);
  for (const id of ids) {
    assert.match(id, /^[A-Z]{3}$/);
    assert.ok(canonicalIds.has(id), 'core-game identity missing from countries.json: ' + id);
    assert.ok(profileIds.has(id), 'core-game profile missing from economy_global_profiles_v1.json: ' + id);
  }
});

test('baseline coverage and provenance remain explicit, including unavailable country records', () => {
  assert.equal(profiles.metadata.baselineYear, 2015);
  assert.equal(profiles.metadata.countryCount, 249);
  assert.equal(profiles.metadata.mappedEconomicProfiles, 230);
  assert.equal(profiles.metadata.coverage.missingEconomicProfileCount, 19);
  assert.equal(profiles.metadata.mappedPopulationProfiles, 195);
  assert.equal(profiles.metadata.coverage.missingPopulationProfileCount, 54);
  assert.match(profiles.metadata.provenanceWarning, /not been independently revalidated/);
  assert.equal(transmissionRules.baselineYear, 2015);
  assert.equal(rules.baseline.missingValuePolicy, 'NULL_REMAINS_UNOBSERVED');
  assert.equal(rules.baseline.source, 'economy_global_profiles_v1.json');
});

test('the macro checkpoint is the only owner of its checkpoint state and delegates to existing systems', () => {
  assert.equal(rules.persistence.ownerMinistry, 'economy');
  assert.equal(rules.persistence.statePath, 'economy.npcMacroEconomy');
  assert.equal(rules.persistence.commandType, 'OMEGA_NPC_MACRO_ECONOMY_CHECKPOINT');
  assert.equal(rules.scheduler.existingSchedulerOnly, true);
  assert.deepEqual(rules.scheduler.tiers, ['ACTIVE', 'MACRO']);
  assert.equal(rules.scheduler.playerCountryAutomation, false);
  assert.equal(rules.scheduler.perTurnNetworkIo, false);
  assert.match(runtime, /registerCountryHandler/);
  assert.match(runtime, /PLAYER_COUNTRY_REMAINS_PLAYER_CONTROLLED/);
  assert.match(runtime, /context\.stateTransaction\.set/);
  assert.doesNotMatch(runtime, /setInterval|requestAnimationFrame|new Worker\s*\(/);
});

test('trade, finance and transmission evidence retain their existing authorities and semantics', () => {
  const settledTrade = rules.liveSignals.find(row => row.id === 'settledInternationalTradeCount');
  const financeLedger = rules.liveSignals.find(row => row.id === 'financeLedgerEntryCount');
  const treasury = rules.liveSignals.find(row => row.id === 'treasuryBalanceAvailability');
  const realGdp = rules.liveSignals.find(row => row.id === 'financialTransmissionRealGdpIndex');
  const stability = rules.liveSignals.find(row => row.id === 'financialTransmissionHouseholdPurchasingPowerIndex');

  assert.equal(settledTrade.authority, 'GLOBAL_TRADE_SETTLEMENT_LEDGER');
  assert.equal(settledTrade.requiredStatus, 'SETTLED');
  assert.equal(financeLedger.authority, 'FINANCE_MINISTRY_LEDGER');
  assert.equal(treasury.authority, 'FINANCE_MINISTRY_TREASURY');
  assert.equal(treasury.type, 'presence');
  assert.equal(realGdp.authority, 'MODELLED_DERIVED_FINANCIAL_TRANSMISSION');
  assert.equal(stability.authority, 'MODELLED_DERIVED_FINANCIAL_TRANSMISSION');
  assert.match(transmission, /realGDPIndex/);
  assert.match(transmission, /economicStabilityIndex/);
  assert.match(transmission, /OMEGA_SIMULATION_TURN_COMMITTED/);
  assert.match(transmission, /for\s*\(const p of profiles\)/,
    'Phase 1 audit must keep the existing full-profile transmission pass visible as a Phase 2 bounded-execution dependency.');
});
