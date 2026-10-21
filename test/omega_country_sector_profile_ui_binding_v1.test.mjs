import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const ui = readFileSync('omega_country_overview_ministry_ui_v1.js', 'utf8');
const sw = readFileSync('omega-offline-map-sw.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
const workflow = readFileSync('.github/workflows/omega-country-general-data-registry.yml', 'utf8');
const builder = readFileSync('scripts/build_country_general_data_registry_v1.mjs', 'utf8');
const roster = readJson('countries.json');
const registry = readJson('country_general_data_registry_v1.json');
const schema = readJson('country_sector_profile_schema_v1.json');
const pack = readJson('country_sector_profiles_v1.json');
const sectorIds = schema.sectors.map((sector) => sector.id);
const metricKeys = new Set((registry.fieldCatalogue || []).map((metric) => metric.key));
const factKeys = new Set(registry.metadata.recordSchema.generalFactFields);
const expandedWdiMetrics = {
  "populationAge0To14Pct": "SP.POP.0014.TO.ZS",
  "populationAge15To64Pct": "SP.POP.1564.TO.ZS",
  "populationAge65PlusPct": "SP.POP.65UP.TO.ZS",
  "ageDependencyRatioPct": "SP.POP.DPND",
  "femaleLifeExpectancyYears": "SP.DYN.LE00.FE.IN",
  "maleLifeExpectancyYears": "SP.DYN.LE00.MA.IN",
  "primaryCompletionRatePct": "SE.PRM.CMPT.ZS",
  "secondarySchoolEnrollmentPct": "SE.SEC.ENRR",
  "tertiarySchoolEnrollmentPct": "SE.TER.ENRR",
  "laborForceParticipationPct": "SL.TLF.CACT.ZS",
  "healthExpenditurePerCapitaUsd": "SH.XPD.CHEX.PC.CD",
  "mobileSubscriptionsPer100": "IT.CEL.SETS.P2",
  "fixedBroadbandSubscriptionsPer100": "IT.NET.BBND.P2",
  "internetSecureServersPerMillion": "IT.NET.SECR.P6",
  "manufacturingValueAddedPctGdp": "NV.IND.MANF.ZS",
  "domesticCreditPrivateSectorPctGdp": "FS.AST.PRVT.GD.ZS",
  "grossCapitalFormationPctGdp": "NE.GDI.TOTL.ZS",
  "agriculturalLandPct": "AG.LND.AGRI.ZS",
  "forestAreaPct": "AG.LND.FRST.ZS",
  "renewableEnergyConsumptionPct": "EG.FEC.RNEW.ZS",
  "renewableElectricityOutputPct": "EG.ELC.RNEW.ZS",
  "pm25ExposureUgM3": "EN.ATM.PM25.MC.M3",
  "freshwaterWithdrawalPctAvailable": "ER.H2O.FWST.ZS",
  "energyUseKgOilEqPerCapita": "EG.USE.PCAP.KG.OE",
  "hospitalBedsPer1000": "SH.MED.BEDS.ZS",
  "physiciansPer1000": "SH.MED.PHYS.ZS",
  "infantMortalityPer1000": "SP.DYN.IMRT.IN",
  "maternalMortalityPer100k": "SH.STA.MMRT",
  "agricultureEmploymentPct": "SL.AGR.EMPL.ZS"
};

test('sector data pack matches every canonical identity and every schema sector', () => {
  assert.equal(pack.metadata.countryAndTerritoryCount, roster.length);
  assert.equal(pack.countries.length, roster.length);
  assert.equal(new Set(pack.countries.map((row) => row.identity.iso3)).size, roster.length);
  assert.deepEqual(
    pack.countries.map((row) => row.identity.iso3).sort(),
    roster.map((row) => row.iso3).sort()
  );
  for (const country of pack.countries) {
    assert.equal(country.sourceRegistryRef.dataset, 'country_general_data_registry_v1.json');
    assert.equal(country.sourceRegistryRef.identityKey, 'iso3');
    assert.equal(country.sourceRegistryRef.identityValue, country.identity.iso3);
    assert.deepEqual(Object.keys(country.sectors).sort(), [...sectorIds].sort());
  }
});

test('every compact profile reference resolves to a declared canonical or profile field', () => {
  for (const country of pack.countries) {
    for (const sector of Object.values(country.sectors)) {
      for (const ref of Object.values(sector.indicators || {})) {
        assert.equal(typeof ref.key, 'string');
        if (ref.refType === 'METRIC') assert.ok(metricKeys.has(ref.key), 'unknown canonical metric: ' + ref.key);
        else if (ref.refType === 'DERIVED_METRIC') assert.ok(Object.hasOwn(country.derivedMetrics || {}, ref.key), 'unknown derived metric: ' + ref.key);
        else if (ref.refType === 'EXTERNAL_METRIC') assert.ok(Object.hasOwn(country.externalMetrics || {}, ref.key), 'unknown external metric: ' + ref.key);
        else assert.fail('Unsupported compact indicator reference: ' + JSON.stringify(ref));
      }
      for (const ref of Object.values(sector.facts || {})) {
        assert.equal(ref.refType, 'GENERAL_FACT');
        assert.ok(factKeys.has(ref.key), 'unknown canonical fact: ' + ref.key);
      }
      if (sector.sourceGroup) {
        assert.equal(sector.sourceGroup.refType, 'SOURCE_GROUP');
        assert.ok(['naturalResources', 'publicSafety'].includes(sector.sourceGroup.key));
      }
      for (const ref of Object.values(sector.analytics || {})) {
        assert.equal(ref.refType, 'ANALYTICS');
        assert.ok(Object.hasOwn(country.analytics || {}, ref.key) || Object.hasOwn(country.derivedMetrics || {}, ref.key),
          'unresolved analytical reference: ' + ref.key);
      }
    }
  }
});


test('expanded official World Bank indicators are unique and assigned to profile sectors', () => {
  const start = builder.indexOf('const METRIC_CATALOGUE = [');
  const end = builder.indexOf('\\n];', start);
  assert.ok(start >= 0 && end > start, 'canonical metric catalogue must exist');
  const lines = builder.slice(start, end).split('\\n').filter(line => /^\\s*\\{ key:/.test(line));
  const keys = lines.map(line => line.match(/key:\\s*'([^']+)'/)?.[1]).filter(Boolean);
  assert.equal(keys.length, new Set(keys).size, 'canonical metric catalogue must contain no duplicate keys');
  for (const [key, indicator] of Object.entries(expandedWdiMetrics)) {
    const rows = lines.filter(line => line.includes("key: '" + key + "'"));
    assert.equal(rows.length, 1, 'expected exactly one catalogue row for ' + key);
    assert.ok(rows[0].includes("wb: '" + indicator + "'"), key + ' must use the declared World Bank indicator');
    assert.ok(metricKeys.has(key), 'build output field catalogue must contain ' + key);
    assert.ok(schema.sectors.some(sector => sector.metricKeys?.includes(key)), key + ' must be visible in a profile sector');
  }
  for (const [key, indicator] of Object.entries({
    malePopulationPct: 'SP.POP.TOTL.MA.ZS',
    femalePopulationPct: 'SP.POP.TOTL.FE.ZS'
  })) {
    const rows = lines.filter(line => line.includes("key: '" + key + "'"));
    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes("wb: '" + indicator + "'"), key + ' must prefer the official WDI observation when available');
  }
});

test('Country Overview renders the packed sectors through canonical source references', () => {
  assert.match(ui, /country_sector_profiles_v1\.json/);
  assert.match(ui, /country_sector_profile_schema_v1\.json/);
  assert.match(ui, /function renderCountrySectorDataPack/);
  assert.match(ui, /function profileObservation/);
  assert.match(ui, /getCountryRecord\?\.\(profile\.identity\.iso3\)/);
  assert.match(ui, /getSourceDataset\?\.\('country_general_data_registry_v1\.json'\)/);
  assert.match(ui, /definitions\.map\(definition =>/);
  assert.match(ui, /Object\.entries\(section\.indicators \|\| \{\}\)/);
  assert.match(ui, /Object\.entries\(section\.facts \|\| \{\}\)/);
  assert.match(ui, /definition\.extensionSlots/);
  assert.match(ui, /schema\.unavailableModelSlots/);
  assert.match(ui, /countrySectorProfilesReady/);
  assert.match(ui, /cachedCountry/);
  assert.match(ui, /cachedHtml/);
  assert.match(ui, /data-ocov-profile-retry/);
  assert.match(ui, /Missing values remain unknown, never zero/);
  assert.ok(index.includes('omega_country_general_data_runtime_v1.js'));
  assert.ok(index.includes('omega_country_overview_ministry_ui_v1.js'));
});

test('offline shell caches both profile assets and CI executes the binding gate', () => {
  assert.match(sw, /omega-offline-atlas-shell-v16/);
  assert.match(sw, /"\.\/country_sector_profiles_v1\.json"/);
  assert.match(sw, /"\.\/country_sector_profile_schema_v1\.json"/);
  assert.match(workflow, /test\/omega_country_sector_profile_ui_binding_v1\.test\.mjs/);
  assert.match(workflow, /node --test test\/country_sector_profiles_v1\.test\.mjs test\/omega_country_sector_profile_ui_binding_v1\.test\.mjs/);
});
