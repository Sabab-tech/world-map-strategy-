import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const read = path => readFileSync(path, 'utf8');
const builder = read('scripts/build_country_general_data_registry_v1.mjs');
const sectorSchema = JSON.parse(read('country_sector_profile_schema_v1.json'));
const registry = JSON.parse(read('country_general_data_registry_v1.json'));
const profileMetricKeys = new Set(sectorSchema.sectors.flatMap(sector => sector.metricKeys || []));
const registryMetricKeys = new Set((registry.fieldCatalogue || []).map(field => field.key));
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

test('country sector UI is wired into the existing page and offline app shell', () => {
 const html=read('index.html'),sw=read('omega-offline-map-sw.js');
 assert.match(html,/omega_country_sector_profile_ui_v1\.css/);
 assert.match(html,/omega_country_sector_profile_ui_v1\.js/);
 assert.match(html,/omega_country_overview_ministry_ui_v1\.js/);
 assert.match(sw,/omega_country_sector_profile_ui_v1\.css/);
 assert.match(sw,/omega_country_sector_profile_ui_v1\.js/);
 assert.match(sw,/country_sector_profiles_v1\.json/);
 assert.match(sw,/country_sector_profile_schema_v1\.json/);
 assert.match(sw,/omega-offline-atlas-shell-v[0-9]+/);
});

test('country sector UI resolves compact references through canonical data and preserves missing states', () => {
 const ui=read('omega_country_sector_profile_ui_v1.js'),runtime=read('omega_country_general_data_runtime_v1.js');
 assert.match(ui,/sourcePolicy/);
 assert.match(ui,/refType==='METRIC'/);
 assert.match(ui,/refType==='DERIVED_METRIC'/);
 assert.match(ui,/refType==='EXTERNAL_METRIC'/);
 assert.match(ui,/refType==='GENERAL_FACT'/);
 assert.match(ui,/NOT RECORDED/);
 assert.match(ui,/Year /);
 assert.match(runtime,/getMetricDefinition/);
 assert.match(ui,/data-ocsp-toggle/);
 assert.match(ui,/async function toggleDossier/);
 assert.match(ui,/const metaMatches/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage/);
});

test('expanded World Bank indicators are unique and exposed by the canonical profile schema', () => {
 const start = builder.indexOf('const METRIC_CATALOGUE = [');
 const end = builder.indexOf('\n];', start);
 assert.ok(start >= 0 && end > start, 'canonical metric catalogue must exist');
 const rows = builder.slice(start, end).split('\n').filter(line => /^\s*\{ key:/.test(line));
 const keys = rows.map(line => line.match(/key:\s*'([^']+)'/)?.[1]).filter(Boolean);
 assert.equal(keys.length, new Set(keys).size, 'canonical metric keys must be unique');
 for (const [key, indicator] of Object.entries(expandedWdiMetrics)) {
  const matches = rows.filter(line => line.includes("key: '" + key + "'"));
  assert.equal(matches.length, 1, 'expected exactly one canonical catalogue row for ' + key);
  assert.ok(matches[0].includes("wb: '" + indicator + "'"), key + ' must use its declared World Bank series');
  assert.ok(registryMetricKeys.has(key), 'rebuilt registry must expose ' + key);
  assert.ok(profileMetricKeys.has(key), 'profile schema must expose ' + key);
 }
 for (const [key, indicator] of Object.entries({ malePopulationPct: 'SP.POP.TOTL.MA.ZS', femalePopulationPct: 'SP.POP.TOTL.FE.ZS' })) {
  const matches = rows.filter(line => line.includes("key: '" + key + "'"));
  assert.equal(matches.length, 1);
  assert.ok(matches[0].includes("wb: '" + indicator + "'"), key + ' must use its official source where available');
 }
});

test('country sector dossier opens automatically, shows missing fields and suppresses internal model status', () => {
 const ui=read('omega_country_sector_profile_ui_v1.js');
 assert.match(ui,/function ensureDossierLoaded\(shell\)/);
 assert.match(ui,/ensureDossierLoaded\(shell\)/);
 assert.match(ui,/data-ocsp-content><\/div><\/section>/);
 assert.match(ui,/data-ocsp-sector open/);
 assert.match(ui,/Not recorded in available sources/);
 const presentation=ui.slice(ui.indexOf('function evidenceRows('),ui.indexOf('function filterContent('));
 assert.doesNotMatch(presentation,/titleCase\(evidence\.status\)|Sector status:|Relative signals: strengths|Relative signals: vulnerabilities|read-only and does not change simulation state/i);
 assert.doesNotMatch(presentation,/titleCase\(evidence\.status\)|sector\.analytics|sector\.status|signalsBlock\(profile/);
});

test('current CO2 indicator prefers the modern World Bank series and retains a compatible fallback', () => {
 const start=builder.indexOf('const METRIC_CATALOGUE = ['),end=builder.indexOf('\n];',start);
 const rows=builder.slice(start,end).split('\n').filter(line=>/^\s*\{ key:/.test(line));
 const co2=rows.filter(line=>line.includes("key: 'co2TonnesPerCapita'"));
 assert.equal(co2.length,1);
 assert.ok(co2[0].includes("wb: 'EN.ATM.CO2E.PC_'"));
 assert.ok(co2[0].includes("wbFallbacks: ['EN.ATM.CO2E.PC']"));
 assert.ok(registryMetricKeys.has('co2TonnesPerCapita'));
 assert.ok(profileMetricKeys.has('co2TonnesPerCapita'));
});

test('new country sector asset parses as valid JavaScript', () => {
 assert.doesNotThrow(()=>new vm.Script(read('omega_country_sector_profile_ui_v1.js')));
});
