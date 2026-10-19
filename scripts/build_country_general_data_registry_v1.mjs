#!/usr/bin/env node
/**
 * OMEGA Unified Country General Data Registry builder.
 *
 * Additive by design: this script never edits/deletes its input datasets.
 * Unknown values remain null. A blank source observation is never converted to zero.
 * Local simulation estimates and legacy 2015 values are explicitly labelled.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, 'country_general_data_registry_v1.json');
const REFRESH = process.argv.includes('--refresh-sources');
const GENERATED_AT = new Date().toISOString();

const ECONOMY_KEYS = [
  'currency_code', 'currency_name', 'gdp', 'gdp_growth', 'inflation',
  'unemployment_rate', 'budget_balance', 'debt', 'trade_balance',
  'exchange_rate_usd', 'reserves', 'status'
];
const POPULATION_KEYS = [
  'population_2015', 'annual_growth_rate', 'birth_rate', 'death_rate',
  'migration_rate', 'urbanization_rate', 'male_percent', 'female_percent'
];
const PROFILE_INDICATOR_KEYS = [
  'gdpCurrentUsd', 'gdpGrowthPct', 'inflationRatePct', 'unemploymentRatePct',
  'governmentBudgetBalanceUsd', 'publicDebtUsd', 'tradeBalanceUsd',
  'foreignExchangeReservesUsd', 'exchangeRateLocalPerUsd', 'population2015',
  'gdpPerCapitaUsd', 'publicDebtToGdpPct', 'budgetBalanceToGdpPct',
  'tradeBalanceToGdpPct', 'reservesToGdpPct', 'debtPerCapitaUsd',
  'policyInterestRatePct', 'taxRevenueUsd', 'governmentRevenueUsd',
  'governmentExpenditureUsd', 'exportsUsd', 'importsUsd',
  'currentAccountBalanceUsd', 'currentAccountToGdpPct',
  'economicInfluenceIndex', 'fiscalRiskIndex', 'fiscalHealthIndex', 'gdpWorldRank'
];
const RESOURCE_MINERAL_KEYS = [
  'metallic', 'nonMetallic', 'industrialMinerals', 'preciousMetals', 'rareEarths', 'criticalMinerals'
];
const RESOURCE_HYDROCARBON_KEYS = ['oil', 'naturalGas', 'coal', 'basins'];
const RESOURCE_ENERGY_KEYS = [
  'fossilResources', 'hydropowerPotential', 'solarResourceZones', 'windResourceZones',
  'biomassResources', 'nuclearResources', 'geothermalPotential'
];
const CRIME_KEYS = [
  'theft', 'robbery', 'streetRobbery', 'drugTrafficking',
  'contrabandSmuggling', 'assault', 'cybercrime', 'homicide'
];
const ENVIRONMENT_MIX_KEYS = [
  'city', 'highway', 'rural', 'border', 'industrial', 'coastal', 'mountain'
];
const INDEX_KEYS = [
  'ruleOfLawWgiEstimate', 'controlOfCorruptionWgiEstimate',
  'politicalStabilityWgiEstimate', 'governmentEffectivenessWgiEstimate',
  'regulatoryQualityWgiEstimate', 'voiceAccountabilityWgiEstimate',
  'humanDevelopmentIndex', 'corruptionPerceptionIndex', 'globalPeaceIndexRank',
  'democracyIndex', 'pressFreedomIndex', 'fragileStatesIndex', 'disciplineIndex'
];

const METRIC_CATALOGUE = [
  { key: 'populationTotal', name: 'Population', unit: 'people', wb: 'SP.POP.TOTL', description: 'Most recent available World Bank observation; year is recorded per country.' },
  { key: 'population2015', name: 'Population baseline 2015', unit: 'people', description: 'Historical local baseline; not a current estimate.' },
  { key: 'populationGrowthPct', name: 'Population growth', unit: '% per year', wb: 'SP.POP.GROW', description: 'Annual population growth rate.' },
  { key: 'birthRate', name: 'Crude birth rate', unit: 'births per 1,000 people', wb: 'SP.DYN.CBRT.IN', description: 'Crude birth rate where a source observation exists.' },
  { key: 'deathRate', name: 'Crude death rate', unit: 'deaths per 1,000 people', wb: 'SP.DYN.CDRT.IN', description: 'Crude death rate where a source observation exists.' },
  { key: 'migrationRateLegacy', name: 'Legacy migration-rate field', unit: 'source-defined; not assumed', description: 'Copied from the repository population baseline; source units are not independently confirmed.' },
  { key: 'urbanizationPct', name: 'Urban population', unit: '% of population', wb: 'SP.URB.TOTL.IN.ZS', description: 'Urban population share.' },
  { key: 'malePopulationPct', name: 'Male population share', unit: '%', description: 'Legacy demographic baseline.' },
  { key: 'femalePopulationPct', name: 'Female population share', unit: '%', description: 'Legacy demographic baseline.' },
  { key: 'lifeExpectancyYears', name: 'Life expectancy at birth', unit: 'years', wb: 'SP.DYN.LE00.IN', description: 'World Bank life-expectancy observation.' },
  { key: 'fertilityRate', name: 'Fertility rate', unit: 'births per woman', wb: 'SP.DYN.TFRT.IN', description: 'Total fertility rate.' },
  { key: 'literacyRatePct', name: 'Adult literacy rate', unit: '% of people ages 15+', wb: 'SE.ADT.LITR.ZS', description: 'Available adult literacy observation.' },
  { key: 'gdpCurrentUsd', name: 'GDP, current US dollars', unit: 'USD', wb: 'NY.GDP.MKTP.CD', description: 'Nominal GDP, with observation year stored separately.' },
  { key: 'gdpPerCapitaUsd', name: 'GDP per capita', unit: 'USD per person', wb: 'NY.GDP.PCAP.CD', description: 'GDP per capita in current US dollars.' },
  { key: 'gdpGrowthPct', name: 'Real GDP growth', unit: '% per year', wb: 'NY.GDP.MKTP.KD.ZG', description: 'Annual real GDP growth where available.' },
  { key: 'inflationPct', name: 'Inflation', unit: '% per year', wb: 'FP.CPI.TOTL.ZG', description: 'Consumer-price inflation.' },
  { key: 'unemploymentRatePct', name: 'Unemployment rate', unit: '% of labor force', wb: 'SL.UEM.TOTL.ZS', description: 'Modeled ILO estimate in the World Bank database.' },
  { key: 'publicDebtUsd', name: 'Public debt amount', unit: 'USD', description: 'Legacy value until a same-year source debt ratio and GDP permit a documented calculation.' },
  { key: 'publicDebtToGdpPct', name: 'Public debt to GDP', unit: '% of GDP', wb: 'GC.DOD.TOTL.GD.ZS', description: 'Central-government debt ratio where available; source coverage varies.' },
  { key: 'externalDebtUsd', name: 'External debt stock', unit: 'USD', wb: 'DT.DOD.DECT.CD', description: 'World Bank external debt stock; not the same definition as public debt.' },
  { key: 'externalDebtToGniPct', name: 'External debt to GNI', unit: '% of GNI', wb: 'DT.DOD.DECT.GN.ZS', description: 'External debt stock as a share of GNI.' },
  { key: 'governmentBudgetBalanceUsd', name: 'Government budget balance', unit: 'USD', description: 'Legacy nominal value or same-year-derived value when available.' },
  { key: 'budgetBalancePctGdp', name: 'Government net lending/borrowing', unit: '% of GDP', wb: 'GC.NLD.TOTL.GD.ZS', description: 'Government net lending/borrowing share of GDP.' },
  { key: 'tradeBalanceUsd', name: 'Trade balance', unit: 'USD', description: 'Legacy value or same-year exports minus imports.' },
  { key: 'tradeBalanceToGdpPct', name: 'Trade balance to GDP', unit: '% of GDP', description: 'Legacy derived ratio; refreshed when matching-year inputs exist.' },
  { key: 'exportsUsd', name: 'Exports of goods and services', unit: 'USD', wb: 'NE.EXP.GNFS.CD', description: 'Exports of goods and services.' },
  { key: 'importsUsd', name: 'Imports of goods and services', unit: 'USD', wb: 'NE.IMP.GNFS.CD', description: 'Imports of goods and services.' },
  { key: 'currentAccountBalanceUsd', name: 'Current-account balance', unit: 'USD', wb: 'BN.CAB.XOKA.CD', description: 'Current-account balance.' },
  { key: 'fxReservesUsd', name: 'Foreign-exchange reserves', unit: 'USD', wb: 'FI.RES.TOTL.CD', description: 'Total reserves excluding gold, as defined by the World Bank indicator.' },
  { key: 'fxReservesToGdpPct', name: 'Foreign-exchange reserves to GDP', unit: '% of GDP', description: 'Legacy derived ratio or same-year-derived ratio.' },
  { key: 'exchangeRateLocalPerUsd', name: 'Official exchange rate', unit: 'local currency per USD', wb: 'PA.NUS.FCRF', description: 'Official exchange rate, period average.' },
  { key: 'governmentRevenueUsd', name: 'Government revenue', unit: 'USD', description: 'Derived only from same-year GDP and government-revenue share.' },
  { key: 'governmentRevenuePctGdp', name: 'Government revenue', unit: '% of GDP', wb: 'GC.REV.XGRT.GD.ZS', description: 'Government revenue share of GDP.' },
  { key: 'governmentExpenditureUsd', name: 'Government expenditure', unit: 'USD', description: 'Derived only from same-year GDP and expenditure share.' },
  { key: 'governmentExpenditurePctGdp', name: 'Government expenditure', unit: '% of GDP', wb: 'GC.XPN.TOTL.GD.ZS', description: 'Government expenditure share of GDP.' },
  { key: 'taxRevenueUsd', name: 'Tax revenue', unit: 'USD', description: 'Derived only from same-year GDP and tax-revenue share.' },
  { key: 'taxRevenuePctGdp', name: 'Tax revenue', unit: '% of GDP', wb: 'GC.TAX.TOTL.GD.ZS', description: 'Tax revenue share of GDP.' },
  { key: 'agricultureValueAddedPctGdp', name: 'Agriculture value added', unit: '% of GDP', wb: 'NV.AGR.TOTL.ZS', description: 'Agriculture value-added share of GDP.' },
  { key: 'industryValueAddedPctGdp', name: 'Industry value added', unit: '% of GDP', wb: 'NV.IND.TOTL.ZS', description: 'Industry value-added share of GDP.' },
  { key: 'servicesValueAddedPctGdp', name: 'Services value added', unit: '% of GDP', wb: 'NV.SRV.TOTL.ZS', description: 'Services value-added share of GDP.' },
  { key: 'internetUsersPct', name: 'Internet users', unit: '% of population', wb: 'IT.NET.USER.ZS', description: 'Individuals using the Internet.' },
  { key: 'electricityAccessPct', name: 'Access to electricity', unit: '% of population', wb: 'EG.ELC.ACCS.ZS', description: 'Population access to electricity.' },
  { key: 'co2TonnesPerCapita', name: 'CO2 emissions per capita', unit: 'metric tonnes per person', wb: 'EN.ATM.CO2E.PC', description: 'Territorial CO2 emissions per capita.' },
  { key: 'militaryExpenditurePctGdp', name: 'Military expenditure', unit: '% of GDP', wb: 'MS.MIL.XPND.GD.ZS', description: 'Military expenditure share of GDP; source coverage varies.' },
  { key: 'homicideRatePer100k', name: 'Intentional homicide rate', unit: 'per 100,000 people', wb: 'VC.IHR.PSRC.P5', description: 'Observed-source record when available; repository legacy observations need revalidation.' },
  { key: 'ruleOfLawWgiEstimate', name: 'Rule of law, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'RL.EST', description: 'World Governance Indicators estimate, not a 0-100 discipline score.' },
  { key: 'controlOfCorruptionWgiEstimate', name: 'Control of corruption, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'CC.EST', description: 'World Governance Indicators estimate.' },
  { key: 'politicalStabilityWgiEstimate', name: 'Political stability, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'PV.EST', description: 'World Governance Indicators estimate.' },
  { key: 'governmentEffectivenessWgiEstimate', name: 'Government effectiveness, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GE.EST', description: 'World Governance Indicators estimate.' },
  { key: 'regulatoryQualityWgiEstimate', name: 'Regulatory quality, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'RQ.EST', description: 'World Governance Indicators estimate.' },
  { key: 'voiceAccountabilityWgiEstimate', name: 'Voice and accountability, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'VA.EST', description: 'World Governance Indicators estimate.' },
  { key: 'rAndDSpendPctGdp', name: 'Research and development expenditure', unit: '% of GDP', wb: 'GB.XPD.RSDV.GD.ZS', description: 'Research and development spending.' },
  { key: 'healthSpendPctGdp', name: 'Current health expenditure', unit: '% of GDP', wb: 'SH.XPD.CHEX.GD.ZS', description: 'Current health expenditure.' },
  { key: 'educationSpendPctGdp', name: 'Government education expenditure', unit: '% of GDP', wb: 'SE.XPD.TOTL.GD.ZS', description: 'Government education spending where available.' },
  { key: 'foreignDirectInvestmentUsd', name: 'Foreign direct investment, net inflows', unit: 'USD', wb: 'BX.KLT.DINV.CD.WD', description: 'Net FDI inflows.' },
  { key: 'povertyRatePct', name: 'Poverty headcount at national poverty lines', unit: '% of population', wb: 'SI.POV.NAHC', description: 'National poverty line; definitions differ across countries.' },
  { key: 'economicInfluenceIndex', name: 'Repository-derived economic influence index', unit: 'index 0-100', description: 'Custom game index. Not an official national ranking.' },
  { key: 'fiscalRiskIndex', name: 'Repository-derived fiscal risk index', unit: 'index 0-100', description: 'Custom game index. Not a sovereign credit rating.' },
  { key: 'fiscalHealthIndex', name: 'Repository-derived fiscal health index', unit: 'index 0-100', description: '100 minus the repository-derived fiscal risk index.' },
  { key: 'gdpWorldRank', name: 'GDP world rank in local profile', unit: 'rank', description: 'Legacy local-profile rank; methodology and year require verification.' },
  { key: 'humanDevelopmentIndex', name: 'Human Development Index', unit: 'index 0-1', description: 'Reserved for a sourced UNDP observation; not inferred from GDP.' },
  { key: 'corruptionPerceptionIndex', name: 'Corruption Perceptions Index', unit: 'rank or score per source release', description: 'Reserved for a dated Transparency International release.' },
  { key: 'globalPeaceIndexRank', name: 'Global Peace Index rank', unit: 'rank', description: 'Reserved for a dated Institute for Economics & Peace release.' },
  { key: 'democracyIndex', name: 'Democracy Index', unit: 'score 0-10', description: 'Reserved for a dated Economist Intelligence Unit release.' },
  { key: 'pressFreedomIndex', name: 'Press freedom index', unit: 'rank or score per source release', description: 'Reserved for a dated Reporters Without Borders release.' },
  { key: 'fragileStatesIndex', name: 'Fragile States Index', unit: 'score per source release', description: 'Reserved for a dated Fund for Peace release.' },
  { key: 'disciplineIndex', name: 'Discipline index', unit: 'undefined', description: 'No universal, comparable international country-level discipline index is in the current source set. Value remains null until a defined project formula or reliable named source is approved.' }
];

const readJson = (name) => JSON.parse(readFileSync(resolve(ROOT, name), 'utf8'));
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value
  : (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const normalizedObject = (source, keys, fallback = null) => Object.fromEntries(keys.map((key) => [key, source && source[key] !== undefined ? source[key] : fallback]));
const nullableArray = (value) => Array.isArray(value) ? value : null;
const statusOf = (value) => value === null || value === undefined ? 'MISSING' : 'AVAILABLE';
const baseObservation = (value, year, sourceId, status, method = 'OBSERVED_SOURCE_VALUE', indicatorCode = null, sourceUrl = null, note = null) => ({
  value: finite(value), year: Number.isFinite(Number(year)) ? Number(year) : null,
  sourceId: sourceId || null, status, method, indicatorCode: indicatorCode || null, sourceUrl: sourceUrl || null, note: note || null
});

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'OMEGA-Country-General-Data-Registry/1.0', 'Accept': 'application/json' } });
  if (!response.ok) throw new Error('HTTP_' + response.status + ' from ' + url);
  return response.json();
}

async function fetchRestCountries() {
  const fields = ['cca2','cca3','ccn3','name','capital','region','subregion','population','area','landlocked','borders','currencies','languages','timezones','idd','independent','unMember'].join(',');
  const url = 'https://restcountries.com/v3.1/all?fields=' + encodeURIComponent(fields);
  const records = await getJson(url);
  return new Map((Array.isArray(records) ? records : []).filter((row) => row && row.cca3).map((row) => [String(row.cca3).toUpperCase(), row]));
}

async function fetchWorldBankMetadata() {
  const url = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
  const payload = await getJson(url);
  return new Map((Array.isArray(payload?.[1]) ? payload[1] : []).filter((row) => row && row.iso2Code).map((row) => [String(row.iso2Code).toUpperCase(), row]));
}

async function fetchWorldBankIndicators() {
  const codes = Array.from(new Set(METRIC_CATALOGUE.map((field) => field.wb).filter(Boolean)));
  const byCountry = new Map();
  const errors = [];
  for (let offset = 0; offset < codes.length; offset += 15) {
    const group = codes.slice(offset, offset + 15);
    const url = 'https://api.worldbank.org/v2/country/all/indicator/' + group.join(';') + '?format=json&mrnev=1&per_page=20000';
    try {
      const first = await getJson(url);
      const pages = Math.max(1, Number(first?.[0]?.pages) || 1);
      const pagesToRead = [first];
      for (let page = 2; page <= pages; page += 1) pagesToRead.push(await getJson(url + '&page=' + page));
      for (const payload of pagesToRead) {
        const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
        for (const row of rows) {
          const iso3 = String(row?.countryiso3code || '').toUpperCase();
          const code = String(row?.indicator?.id || '');
          if (!iso3 || !code || row.value === null || row.value === undefined) continue;
          if (!byCountry.has(iso3)) byCountry.set(iso3, {});
          const old = byCountry.get(iso3)[code];
          const fresh = { value: finite(row.value), year: finite(Number(row.date)), code, countryIso3: iso3 };
          if (!old || (fresh.year !== null && (old.year === null || fresh.year >= old.year))) byCountry.get(iso3)[code] = fresh;
        }
      }
    } catch (error) {
      errors.push({ indicators: group, error: String(error) });
    }
  }
  return { byCountry, errors };
}

function chooseRecord(map, candidates) {
  for (const key of candidates.filter(Boolean)) {
    if (map instanceof Map && map.has(String(key).toUpperCase())) return map.get(String(key).toUpperCase());
    if (map && typeof map === 'object' && map[String(key).toUpperCase()] !== undefined) return map[String(key).toUpperCase()];
  }
  return null;
}

function safeCopy(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
}

function capitalCandidate(cityProfile) {
  const capital = cityProfile?.capital;
  if (typeof capital === 'string') return capital;
  return capital?.name || cityProfile?.cities?.find((city) => String(city.role || '').toUpperCase() === 'CAPITAL')?.name || null;
}

function resourceRecord(source) {
  return {
    coverageStatus: source ? 'LOCAL_RESOURCE_CONTEXT_AVAILABLE' : 'NO_RESOURCE_CONTEXT_RECORD',
    sourceId: source ? 'resource_country_resource_context_index.json' : null,
    mineralResourceBase: source ? normalizedObject(source.mineral_resource_base, RESOURCE_MINERAL_KEYS) : normalizedObject(null, RESOURCE_MINERAL_KEYS),
    hydrocarbonResourceBase: source ? normalizedObject(source.hydrocarbon_resource_base, RESOURCE_HYDROCARBON_KEYS) : normalizedObject(null, RESOURCE_HYDROCARBON_KEYS),
    energyResourceBase: source ? normalizedObject(source.energy_resource_base, RESOURCE_ENERGY_KEYS) : normalizedObject(null, RESOURCE_ENERGY_KEYS),
    administrativeResourceRegions: source && Array.isArray(source.administrative_resource_regions) ? safeCopy(source.administrative_resource_regions, []) : null,
    administrativeResourceRegionCount: source && Array.isArray(source.administrative_resource_regions) ? source.administrative_resource_regions.length : null,
    countryNameInResourceSource: source?.countryName ?? null,
    emptyListsMeaning: 'An empty array means no entries were recorded in this source record; it does not prove the country has no such resource.'
  };
}

function safetyRecord(police) {
  const crimeRates = police?.crime?.ratesPer100k || {};
  const crimeSources = police?.crime?.rateSources || {};
  const incidents = police?.crime?.estimatedAnnualIncidents || {};
  const environmentMix = police?.fleetProfile?.environmentMixPct || {};
  return {
    baselinePolice: {
      activePersonnel: finite(police?.baselinePolice?.activePersonnel),
      staffingRatePer100k: finite(police?.baselinePolice?.staffingRatePer100k),
      source: police?.baselinePolice?.source || null
    },
    observedHomicide: {
      ratePer100k: finite(police?.crime?.observedHomicide?.ratePer100k),
      year: finite(police?.crime?.observedHomicide?.year),
      source: police?.crime?.observedHomicide?.source || null,
      verificationStatus: police?.crime?.observedHomicide ? 'REPOSITORY_RECORD_NEEDS_EXTERNAL_REVALIDATION' : 'MISSING'
    },
    crimeRatesPer100k: normalizedObject(crimeRates, CRIME_KEYS),
    crimeRateSources: normalizedObject(crimeSources, CRIME_KEYS),
    estimatedAnnualIncidents: normalizedObject(incidents, CRIME_KEYS),
    crimeSourcePolicy: 'Only the separately labelled observedHomicide record is source-observed in the local baseline. Other crime rates are modelled simulation values unless their own source says otherwise.',
    fleetSummary: {
      totalUnits: finite(police?.baselineFleet?.totalUnits),
      replacementValueUsd: finite(police?.baselineFleet?.replacementValueUsd),
      annualMaintenanceUsd: finite(police?.baselineFleet?.annualMaintenanceUsd),
      source: police?.baselineFleet?.source || null
    },
    countryContext: {
      economyCapacityIndex: finite(police?.fleetProfile?.economyCapacityIndex),
      urbanComplexityIndex: finite(police?.fleetProfile?.urbanComplexityIndex),
      roadQualityIndex: finite(police?.fleetProfile?.roadQualityIndex),
      mountainTerrainIndex: finite(police?.fleetProfile?.mountainTerrainIndex),
      coastalLogisticsIndex: finite(police?.fleetProfile?.coastalLogisticsIndex),
      industrialComplexityIndex: finite(police?.fleetProfile?.industrialComplexityIndex),
      remoteCoverageIndex: finite(police?.fleetProfile?.remoteCoverageIndex),
      terrainClass: police?.fleetProfile?.terrainClass || null,
      contextIndexesAreMeasured: police?.fleetProfile?.contextIndexesAreMeasured === true,
      environmentMixPct: normalizedObject(environmentMix, ENVIRONMENT_MIX_KEYS)
    },
    modelNotes: {
      policePersonnel: 'MODELED_POLICY_BASELINE_NOT_OBSERVED_ROSTER',
      fleetCountsAndCosts: 'MODELED_COUNTRY_CONTEXT_AWARE_STARTING_INVENTORY',
      nonHomicideCrimeRates: 'MODELED_SIMULATION_BASELINE'
    }
  };
}

function deriveLegacyMetrics(profile, police) {
  const e = profile?.sourceValues || {};
  const p = profile?.populationValues || {};
  const i = profile?.indicators || {};
  const latestPop = police?.population || {};
  const values = Object.fromEntries(METRIC_CATALOGUE.map((field) => [field.key, null]));
  const meta = Object.fromEntries(METRIC_CATALOGUE.map((field) => [field.key, {
    year: null, sourceId: null, sourceName: null, status: field.key === 'disciplineIndex' ? 'NOT_DEFINED_OR_SOURCED' : 'MISSING',
    method: 'NONE', indicatorCode: field.wb || null, sourceUrl: field.wb ? 'https://api.worldbank.org/v2/indicator/' + field.wb : null,
    note: field.key === 'disciplineIndex' ? 'No universal comparable country-level discipline index exists in the currently loaded source set.' : null
  }]));
  const set = (key, value, year, sourceId, sourceName, status, method = 'LEGACY_VALUE') => {
    if (value === undefined || value === null || value === '' || finite(value) === null) return;
    values[key] = finite(value);
    meta[key] = {
      year: finite(year), sourceId: sourceId || null, sourceName: sourceName || null,
      status, method, indicatorCode: METRIC_CATALOGUE.find((field) => field.key === key)?.wb || null,
      sourceUrl: null, note: status.includes('LEGACY') || status.includes('NEEDS_EXTERNAL') ? 'Not independently revalidated against the named external series in this build.' : null
    };
  };
  set('populationTotal', latestPop.value, latestPop.year, latestPop.source, 'omega_home_ministry_country_police_baseline_v1.json', latestPop.source === 'WORLD_BANK_LATEST_AVAILABLE' ? 'LOCAL_RECORD_WB_CLAIM_NEEDS_EXTERNAL_REVALIDATION' : 'LOCAL_POPULATION_BASELINE', 'SOURCE_LABEL_COPIED_FROM_REPOSITORY');
  if (values.populationTotal === null) set('populationTotal', p.population_2015 ?? i.population2015, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('population2015', p.population_2015 ?? i.population2015, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('populationGrowthPct', p.annual_growth_rate, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('birthRate', p.birth_rate, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('deathRate', p.death_rate, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('migrationRateLegacy', p.migration_rate, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('urbanizationPct', p.urbanization_rate, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('malePopulationPct', p.male_percent, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('femalePopulationPct', p.female_percent, 2015, 'population.json', 'population.json', 'LEGACY_2015_BASELINE');
  set('gdpCurrentUsd', i.gdpCurrentUsd ?? e.gdp, 2015, profile?.economyKey ? 'economy.json' : null, 'economy.json', 'LEGACY_2015_BASELINE');
  set('gdpPerCapitaUsd', i.gdpPerCapitaUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_DERIVED_NOT_EXTERNALLY_REVALIDATED');
  set('gdpGrowthPct', i.gdpGrowthPct ?? e.gdp_growth, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('inflationPct', i.inflationRatePct ?? e.inflation, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('unemploymentRatePct', i.unemploymentRatePct ?? e.unemployment_rate, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('publicDebtUsd', i.publicDebtUsd ?? e.debt, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('publicDebtToGdpPct', i.publicDebtToGdpPct, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_DERIVED_NOT_EXTERNALLY_REVALIDATED');
  set('governmentBudgetBalanceUsd', i.governmentBudgetBalanceUsd ?? e.budget_balance, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('budgetBalancePctGdp', i.budgetBalanceToGdpPct, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_DERIVED_NOT_EXTERNALLY_REVALIDATED');
  set('tradeBalanceUsd', i.tradeBalanceUsd ?? e.trade_balance, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('tradeBalanceToGdpPct', i.tradeBalanceToGdpPct, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_DERIVED_NOT_EXTERNALLY_REVALIDATED');
  set('fxReservesUsd', i.foreignExchangeReservesUsd ?? e.reserves, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('fxReservesToGdpPct', i.reservesToGdpPct, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_DERIVED_NOT_EXTERNALLY_REVALIDATED');
  set('exchangeRateLocalPerUsd', i.exchangeRateLocalPerUsd ?? e.exchange_rate_usd, 2015, 'economy.json', 'economy.json', 'LEGACY_2015_BASELINE');
  set('exportsUsd', i.exportsUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_2015_BASELINE');
  set('importsUsd', i.importsUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_2015_BASELINE');
  set('currentAccountBalanceUsd', i.currentAccountBalanceUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_2015_BASELINE');
  set('governmentRevenueUsd', i.governmentRevenueUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_2015_BASELINE');
  set('governmentExpenditureUsd', i.governmentExpenditureUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_2015_BASELINE');
  set('taxRevenueUsd', i.taxRevenueUsd, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_2015_BASELINE');
  set('economicInfluenceIndex', i.economicInfluenceIndex, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'GAME_DERIVED_NOT_OFFICIAL');
  set('fiscalRiskIndex', i.fiscalRiskIndex, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'GAME_DERIVED_NOT_OFFICIAL');
  set('fiscalHealthIndex', i.fiscalHealthIndex, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'GAME_DERIVED_NOT_OFFICIAL');
  set('gdpWorldRank', i.gdpWorldRank, 2015, 'economy_global_profiles_v1.json', 'economy_global_profiles_v1.json', 'LEGACY_RANK_NEEDS_METHODOLOGY_REVIEW');
  set('homicideRatePer100k', police?.crime?.observedHomicide?.ratePer100k, police?.crime?.observedHomicide?.year, police?.crime?.observedHomicide?.source, 'omega_home_ministry_country_police_baseline_v1.json', 'LOCAL_RECORD_NEEDS_EXTERNAL_REVALIDATION', 'SOURCE_LABEL_COPIED_FROM_REPOSITORY');
  return { values, meta };
}

function updateFacts(identity, legacyEconomy, localCity, restCountry, wbCountry, previous) {
  const last = previous?.generalFacts || {};
  const currencies = restCountry?.currencies && typeof restCountry.currencies === 'object' ? restCountry.currencies : null;
  const languages = restCountry?.languages && typeof restCountry.languages === 'object' ? Object.values(restCountry.languages) : null;
  const currencyCodes = currencies ? Object.keys(currencies) : null;
  const currencyNames = currencies ? Object.values(currencies).map((row) => row?.name || null) : null;
  const restIdd = restCountry?.idd && typeof restCountry.idd === 'object'
    ? [String(restCountry.idd.root || '') + (Array.isArray(restCountry.idd.suffixes) ? restCountry.idd.suffixes.join(',') : '')].filter(Boolean)
    : null;
  const localCapital = capitalCandidate(localCity);
  const fact = {
    officialName: restCountry?.name?.official ?? last.officialName ?? null,
    capitalCity: (Array.isArray(restCountry?.capital) && restCountry.capital[0]) || wbCountry?.capitalCity || last.capitalCity || localCapital || null,
    capitalCitySource: restCountry?.capital?.length ? 'REST_COUNTRIES_API' : (wbCountry?.capitalCity ? 'WORLD_BANK_COUNTRY_METADATA' : (last.capitalCity ? last.capitalCitySource : (localCapital ? 'LOCAL_CITIES_JSON_NOT_OFFICIALLY_VERIFIED' : null))),
    officialLanguages: languages ?? safeCopy(last.officialLanguages, null),
    currencyCodes: currencyCodes ?? safeCopy(last.currencyCodes, null) ?? (legacyEconomy?.currency_code ? [legacyEconomy.currency_code] : null),
    currencyNames: currencyNames ?? safeCopy(last.currencyNames, null) ?? (legacyEconomy?.currency_name ? [legacyEconomy.currency_name] : null),
    areaKm2: finite(restCountry?.area) ?? finite(last.areaKm2),
    landlocked: typeof restCountry?.landlocked === 'boolean' ? restCountry.landlocked : (typeof last.landlocked === 'boolean' ? last.landlocked : null),
    borderingIso3: nullableArray(restCountry?.borders) ?? safeCopy(last.borderingIso3, null),
    timezones: nullableArray(restCountry?.timezones) ?? safeCopy(last.timezones, null),
    callingCodes: restIdd ?? safeCopy(last.callingCodes, null),
    independent: typeof restCountry?.independent === 'boolean' ? restCountry.independent : (typeof last.independent === 'boolean' ? last.independent : null),
    unMember: typeof restCountry?.unMember === 'boolean' ? restCountry.unMember : (typeof last.unMember === 'boolean' ? last.unMember : null),
    restCountriesPopulation: finite(restCountry?.population) ?? finite(last.restCountriesPopulation),
    worldBankIncomeLevel: wbCountry?.incomeLevel?.value ?? last.worldBankIncomeLevel ?? null,
    worldBankLendingType: wbCountry?.lendingType?.value ?? last.worldBankLendingType ?? null,
    worldBankRegion: wbCountry?.region?.value ?? last.worldBankRegion ?? null,
    worldBankAdminRegion: wbCountry?.adminregion?.value ?? last.worldBankAdminRegion ?? null,
    worldBankCapitalCity: wbCountry?.capitalCity ?? last.worldBankCapitalCity ?? null,
    factsSourceStatus: {
      restCountries: restCountry ? 'REST_COUNTRIES_API_RECORD' : (last.factsSourceStatus?.restCountries || 'NOT_IMPORTED'),
      worldBankMetadata: wbCountry ? 'WORLD_BANK_COUNTRY_METADATA_RECORD' : (last.factsSourceStatus?.worldBankMetadata || 'NOT_IMPORTED')
    }
  };
  return fact;
}

function makeRecord(country, sources, previous, refreshData) {
  const identity = {
    code: country.code ?? country.iso2 ?? null,
    iso2: country.iso2 ?? country.code ?? null,
    iso3: country.iso3 ?? null,
    numericCode: country.numericCode ?? null,
    name: country.name ?? null,
    continent: country.continent ?? null,
    continents: Array.isArray(country.continents) ? country.continents : [],
    subregion: country.subregion ?? null,
    subregionCode: country.subregionCode ?? null,
    intermediateRegion: country.intermediateRegion ?? null,
    intermediateRegionCode: country.intermediateRegionCode ?? null,
    latitude: finite(country.lat),
    longitude: finite(country.lng),
    oceanAccess: Array.isArray(country.oceanAccess) ? country.oceanAccess : [],
    identityStatus: country.identityStatus ?? null,
    mapPointSource: country.mapPointSource ?? null,
    regionalClassificationSource: country.regionalClassificationSource ?? null
  };
  const identityCandidates = [country.iso3, country.code, country.iso2];
  const profile = chooseRecord(sources.profileByIso3, identityCandidates);
  const oldFinance = chooseRecord(sources.economyByKey, [profile?.economyKey, norm(country.name)]);
  const sourceEconomy = profile?.sourceValues || oldFinance || {};
  const sourcePopulation = profile?.populationValues || chooseRecord(sources.populationByKey, [profile?.populationKey, norm(country.name)]) || {};
  const rawFinance = chooseRecord(sources.rawFinanceByIso3, identityCandidates) || {};
  const police = chooseRecord(sources.policeByIso3, identityCandidates) || {};
  const resource = chooseRecord(sources.resourceByCountryId, identityCandidates) || chooseRecord(sources.resourceByCountryName, [country.name]) || null;
  const city = sources.cityByName.get(norm(country.name)) || null;
  const prior = previous?.countryByIso3?.get(String(country.iso3 || '').toUpperCase()) || null;
  const normalizedEconomy = normalizedObject(sourceEconomy, ECONOMY_KEYS);
  const normalizedPopulation = normalizedObject(sourcePopulation, POPULATION_KEYS);
  const derivedRaw = deriveLegacyMetrics(profile, police);
  const metrics = { ...derivedRaw.values };
  const metricMetadata = { ...derivedRaw.meta };
  const currentByIso3 = refreshData.worldBank.byCountry.get(String(country.iso3 || '').toUpperCase()) || {};
  const priorMetrics = prior?.metrics || {};
  const priorMeta = prior?.metricMetadata || {};

  for (const field of METRIC_CATALOGUE) {
    const existingMeta = priorMeta[field.key];
    const oldOfficial = existingMeta?.status === 'WORLD_BANK_API_OBSERVATION';
    if (oldOfficial && finite(priorMetrics[field.key]) !== null) {
      metrics[field.key] = finite(priorMetrics[field.key]);
      metricMetadata[field.key] = safeCopy(existingMeta, metricMetadata[field.key]);
    }
    if (field.wb) {
      const observation = currentByIso3[field.wb];
      const priorYear = finite(metricMetadata[field.key]?.year);
      if (observation && observation.value !== null &&
          (!oldOfficial || observation.year === null || priorYear === null || observation.year >= priorYear)) {
        metrics[field.key] = observation.value;
        metricMetadata[field.key] = {
          year: observation.year, sourceId: 'WORLD_BANK_WDI', sourceName: 'World Bank Indicators API v2',
          status: 'WORLD_BANK_API_OBSERVATION', method: 'SOURCE_OBSERVATION', indicatorCode: field.wb,
          sourceUrl: 'https://api.worldbank.org/v2/country/' + String(country.iso3 || '').toLowerCase() + '/indicator/' + field.wb + '?format=json',
          note: 'Most recent non-empty observation returned by the API; compare the year before combining metrics.'
        };
      }
    }
  }

  const setDerived = (key, value, year, sourceKeys, formula) => {
    if (finite(value) === null || finite(year) === null) return;
    const previousMeta = metricMetadata[key];
    if (previousMeta?.status === 'WORLD_BANK_API_OBSERVATION' && finite(previousMeta.year) !== null && previousMeta.year >= Number(year)) return;
    metrics[key] = Number(finite(value).toFixed(6));
    metricMetadata[key] = {
      year: Number(year), sourceId: 'DERIVED_FROM_WORLD_BANK_WDI', sourceName: 'Derived from same-year World Bank observations',
      status: 'DERIVED_SAME_YEAR_OBSERVATIONS', method: formula, indicatorCode: null, sourceUrl: null,
      note: 'Derived only when all source years match; source fields remain independently available.'
    };
  };
  const val = (key) => finite(metrics[key]);
  const year = (key) => finite(metricMetadata[key]?.year);
  const derivedYear = (a,b) => year(a) !== null && year(a) === year(b) ? year(a) : null;
  const gdpYear = year('gdpCurrentUsd');
  if (val('publicDebtToGdpPct') !== null && val('gdpCurrentUsd') !== null && derivedYear('publicDebtToGdpPct','gdpCurrentUsd') !== null) {
    setDerived('publicDebtUsd', val('gdpCurrentUsd') * val('publicDebtToGdpPct') / 100, gdpYear, ['publicDebtToGdpPct','gdpCurrentUsd'], 'GDP × public-debt-to-GDP ratio / 100');
  }
  if (val('budgetBalancePctGdp') !== null && val('gdpCurrentUsd') !== null && derivedYear('budgetBalancePctGdp','gdpCurrentUsd') !== null) {
    setDerived('governmentBudgetBalanceUsd', val('gdpCurrentUsd') * val('budgetBalancePctGdp') / 100, gdpYear, ['budgetBalancePctGdp','gdpCurrentUsd'], 'GDP × government-balance share / 100');
  }
  if (val('exportsUsd') !== null && val('importsUsd') !== null && derivedYear('exportsUsd','importsUsd') !== null) {
    setDerived('tradeBalanceUsd', val('exportsUsd') - val('importsUsd'), year('exportsUsd'), ['exportsUsd','importsUsd'], 'exportsUsd - importsUsd');
  }
  for (const [amountKey, ratioKey] of [
    ['governmentRevenueUsd','governmentRevenuePctGdp'], ['governmentExpenditureUsd','governmentExpenditurePctGdp'], ['taxRevenueUsd','taxRevenuePctGdp']
  ]) {
    if (val('gdpCurrentUsd') !== null && val(ratioKey) !== null && derivedYear('gdpCurrentUsd',ratioKey) !== null) {
      setDerived(amountKey, val('gdpCurrentUsd') * val(ratioKey) / 100, gdpYear, ['gdpCurrentUsd',ratioKey], 'GDP × share of GDP / 100');
    }
  }
  if (val('gdpCurrentUsd') !== null && val('fxReservesUsd') !== null && derivedYear('gdpCurrentUsd','fxReservesUsd') !== null && val('gdpCurrentUsd') > 0) {
    setDerived('fxReservesToGdpPct', val('fxReservesUsd') / val('gdpCurrentUsd') * 100, gdpYear, ['fxReservesUsd','gdpCurrentUsd'], 'foreign-exchange reserves / GDP × 100');
  }
  if (val('gdpCurrentUsd') !== null && val('tradeBalanceUsd') !== null && derivedYear('gdpCurrentUsd','tradeBalanceUsd') !== null && val('gdpCurrentUsd') > 0) {
    setDerived('tradeBalanceToGdpPct', val('tradeBalanceUsd') / val('gdpCurrentUsd') * 100, gdpYear, ['tradeBalanceUsd','gdpCurrentUsd'], 'trade balance / GDP × 100');
  }

  const facts = updateFacts(identity, normalizedEconomy, city, refreshData.restCountries.byIso3.get(String(country.iso3 || '').toUpperCase()), refreshData.worldBank.metadataByIso2.get(String(country.iso2 || '').toUpperCase()), prior);
  const rawIndicators = rawFinance.rawIndicators || {};
  const rawDerived = rawFinance.derivedIndicators || {};
  const rawEconomy = rawFinance.rawSourceRecords?.economy || normalizedEconomy;
  const rawPopulation = rawFinance.rawSourceRecords?.population || normalizedPopulation;
  const localCapital = capitalCandidate(city);
  const localGeo = {
    capitalCandidate: localCapital,
    capitalDescription: city?.capital?.description || null,
    economicCenters: Array.isArray(city?.economic) ? city.economic.map((row) => ({ name: row.name || null, description: row.description || null })) : null,
    majorCityCount: finite(police?.fleetProfile?.majorCityCount),
    economicHubCount: finite(police?.fleetProfile?.economicHubCount),
    militarySiteCount: finite(police?.fleetProfile?.militarySiteCount),
    strategicSiteCount: finite(police?.fleetProfile?.strategicSiteCount),
    sourceId: city ? 'cities.json' : null,
    status: city ? 'LOCAL_GAME_GEOGRAPHY_NOT_INDEPENDENTLY_VERIFIED' : 'NO_CITY_RECORD'
  };
  const statuses = {
    identity: 'CANONICAL_COUNTRIES_JSON',
    basicFacts: facts.factsSourceStatus,
    financialRegistry: Object.keys(rawIndicators).length ? 'RAW_FINANCIAL_RECORD_PRESENT' : 'RAW_FINANCIAL_RECORD_MISSING',
    legacyEconomy: profile?.economyKey ? 'LOCAL_BASELINE_NOT_EXTERNALLY_REVALIDATED' : 'MISSING_ECONOMY_PROFILE',
    legacyPopulation: profile?.populationKey ? 'LOCAL_2015_BASELINE_NOT_EXTERNALLY_REVALIDATED' : 'MISSING_POPULATION_PROFILE',
    resources: resource ? 'LOCAL_RESOURCE_CONTEXT_AVAILABLE' : 'NO_RESOURCE_CONTEXT_RECORD',
    policeBaseline: police?.iso3 ? 'POLICE_GAME_BASELINE_PRESENT; MODELLED_FIELDS_LABELLED' : 'NO_POLICE_BASELINE_RECORD',
    officialIndexes: INDEX_KEYS.filter((key) => finite(metrics[key]) !== null).length ? 'PARTIAL_SOURCE_VALUES' : 'MOST_GLOBAL_INDEXES_NOT_IMPORTED',
    currentSourceRefresh: {
      requested: REFRESH,
      worldBankApi: refreshData.worldBank.errors.length ? 'PARTIAL_OR_FAILED' : (refreshData.worldBank.loaded ? 'LOADED' : 'NOT_REQUESTED'),
      restCountriesApi: refreshData.restCountries.loaded ? 'LOADED' : (refreshData.restCountries.error ? 'FAILED' : 'NOT_REQUESTED'),
      worldBankMetadataApi: refreshData.worldBank.metadataLoaded ? 'LOADED' : (refreshData.worldBank.metadataError ? 'FAILED' : 'NOT_REQUESTED')
    }
  };
  return {
    identity,
    generalFacts: facts,
    metrics,
    metricMetadata,
    legacySnapshots: {
      baselineYear: 2015,
      rawFinancialRegistry: {
        baselineYear: finite(rawFinance.baselineYear) ?? 2015,
        // Values are stored as arrays in the exact field order declared in metadata.rawFinancialFieldNames.
        // This lossless column order avoids repeating 68 field names in every country record.
        rawIndicatorValues: sources.rawFinancialIndicatorKeys.map((key) =>
          rawIndicators && rawIndicators[key] !== undefined ? rawIndicators[key] : null),
        derivedIndicatorValues: sources.rawFinancialDerivedKeys.map((key) =>
          rawDerived && rawDerived[key] !== undefined ? rawDerived[key] : null)
      },
      economyGlobalProfile: {
        profileStatus: profile?.profileStatus || 'UNAVAILABLE',
        economyKey: profile?.economyKey || null,
        populationKey: profile?.populationKey || null,
        // Decode by metadata.profileIndicatorNames; core public-facing indicators are also named in metrics.
        indicatorValues: PROFILE_INDICATOR_KEYS.map((key) =>
          profile?.indicators && profile.indicators[key] !== undefined ? profile.indicators[key] : null),
        metricAvailabilityValues: PROFILE_INDICATOR_KEYS.map((key) =>
          profile?.metricAvailability && profile.metricAvailability[key] !== undefined ? profile.metricAvailability[key] : false),
        provenance: {
          economicSource: profile?.provenance?.economicSource || null,
          populationSource: profile?.provenance?.populationSource || null,
          status: profile?.provenance?.status || 'NO_LOCAL_PROFILE',
          derivedIndicators: Array.isArray(profile?.provenance?.derivedIndicators) ? profile.provenance.derivedIndicators : []
        }
      }
    },
    naturalResources: resourceRecord(resource),
    publicSafety: safetyRecord(police),
    localGeography: localGeo,
    dataStatus: statuses
  };
}

async function main() {
  const countries = readJson('countries.json');
  const economy = readJson('economy.json');
  const population = readJson('population.json');
  const economyProfiles = readJson('economy_global_profiles_v1.json');
  const rawFinancial = readJson('economy_raw_financial_data_v2.json');
  const policeBaseline = readJson('omega_home_ministry_country_police_baseline_v1.json');
  const resourceIndex = readJson('resource_country_resource_context_index.json');
  const cityData = readJson('cities.json');
  const previousData = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : null;

  const profileRows = economyProfiles.countries || [];
  const policeRows = policeBaseline.countries || [];
  const cityRows = Array.isArray(cityData.countries) ? cityData.countries : [];
  const rawFinancialRows = rawFinancial.countries || [];
  const resourceRows = resourceIndex.countries || {};
  const rawFinancialIndicatorKeys = Object.keys(rawFinancialRows[0]?.rawIndicators || {});
  const rawFinancialDerivedKeys = Object.keys(rawFinancialRows[0]?.derivedIndicators || {});
  const profileByIso3 = new Map(profileRows.map((row) => [String(row.iso3 || '').toUpperCase(), row]));
  const rawFinanceByIso3 = new Map(rawFinancialRows.map((row) => [String(row.iso3 || '').toUpperCase(), row]));
  const policeByIso3 = new Map(policeRows.map((row) => [String(row.iso3 || '').toUpperCase(), row]));
  const resourceByCountryId = new Map(Object.entries(resourceRows).map(([key, row]) => [String(key).toUpperCase(), row]));
  const resourceByCountryName = new Map(Object.values(resourceRows).filter((row) => row?.countryName).map((row) => [norm(row.countryName), row]));
  const cityByName = new Map(cityRows.map((row) => [norm(row.name), row]));
  const economyByKey = new Map(Object.entries(economy).map(([key, row]) => [norm(key), row]));
  const populationByKey = new Map(Object.entries(population).map(([key, row]) => [norm(key), row]));
  const priorCountryByIso3 = new Map((previousData?.countries || []).map((row) => [String(row.identity?.iso3 || '').toUpperCase(), row]));
  const sources = { profileByIso3, rawFinanceByIso3, policeByIso3, resourceByCountryId, resourceByCountryName, cityByName, economyByKey, populationByKey, rawFinancialIndicatorKeys, rawFinancialDerivedKeys, profileIndicatorKeys: PROFILE_INDICATOR_KEYS };
  let restCountries = { byIso3: new Map(), loaded: false, error: null };
  let wbMetadata = { metadataByIso2: new Map(), metadataByIso3: new Map(), metadataLoaded: false, metadataError: null };
  let wbData = { byCountry: new Map(), errors: [], loaded: false };
  if (REFRESH) {
    try { restCountries.byIso3 = await fetchRestCountries(); restCountries.loaded = true; }
    catch (error) { restCountries.error = String(error); console.error('REST Countries refresh failed:', String(error)); }
    try {
      wbMetadata.metadataByIso2 = await fetchWorldBankMetadata();
      wbMetadata.metadataByIso3 = new Map(Array.from(wbMetadata.metadataByIso2.values()).filter((row) => row.iso3Code || row.id).map((row) => [String(row.iso3Code || row.id).toUpperCase(), row]));
      wbMetadata.metadataLoaded = true;
    } catch (error) { wbMetadata.metadataError = String(error); console.error('World Bank metadata refresh failed:', String(error)); }
    try { const result = await fetchWorldBankIndicators(); wbData.byCountry = result.byCountry; wbData.errors = result.errors; wbData.loaded = true; }
    catch (error) { wbData.errors = [{ error: String(error) }]; console.error('World Bank indicators refresh failed:', String(error)); }
  }
  const refreshData = {
    restCountries,
    worldBank: {
      byCountry: wbData.byCountry, errors: wbData.errors, loaded: wbData.loaded,
      metadataByIso2: wbMetadata.metadataByIso2, metadataByIso3: wbMetadata.metadataByIso3,
      metadataLoaded: wbMetadata.metadataLoaded, metadataError: wbMetadata.metadataError
    }
  };
  const rows = countries.map((country) => makeRecord(country, sources, { countryByIso3: priorCountryByIso3 }, refreshData));
  const uniqueCodes = new Set(rows.map((row) => row.identity.iso3));
  const metricCoverage = Object.fromEntries(METRIC_CATALOGUE.map((field) => {
    const values = rows.map((row) => row.metrics[field.key]);
    const meta = rows.map((row) => row.metricMetadata[field.key]);
    return [field.key, {
      total: rows.length,
      nonNull: values.filter((value) => finite(value) !== null).length,
      worldBankObserved: meta.filter((value) => value.status === 'WORLD_BANK_API_OBSERVATION').length,
      derivedFromSource: meta.filter((value) => value.status === 'DERIVED_SAME_YEAR_OBSERVATIONS').length,
      legacyOrLocal: meta.filter((value) => String(value.status || '').startsWith('LEGACY') || String(value.status || '').startsWith('LOCAL') || String(value.status || '').startsWith('GAME_')).length,
      missing: values.filter((value) => finite(value) === null).length
    }];
  }));
  const metadata = {
    schemaVersion: '1.0.0',
    datasetId: 'OMEGA_COUNTRY_GENERAL_DATA_REGISTRY_V1',
    title: 'OMEGA Unified Country General Data Registry',
    description: 'Canonical common-schema registry aggregating identity, basic facts, economy, demographics, general indexes, resource context and public-safety summary for every identity in countries.json.',
    generatedAt: GENERATED_AT,
    countryAndTerritoryCount: rows.length,
    uniqueIso3Count: uniqueCodes.size,
    baselineYear: economyProfiles.metadata?.baselineYear ?? 2015,
    countryRosterSource: 'countries.json',
    rawFinancialRegistrySource: 'economy_raw_financial_data_v2.json',
    rawFinancialFieldCount: rawFinancialIndicatorKeys.length,
    rawFinancialFieldNames: rawFinancialIndicatorKeys,
    profileIndicatorNames: PROFILE_INDICATOR_KEYS,
    rawFinancialDerivedFieldCount: rawFinancialDerivedKeys.length,
    rawFinancialDerivedFieldNames: rawFinancialDerivedKeys,
    localCoverage: {
      mappedEconomicProfiles: profileRows.filter((row) => row.economyKey).length,
      mappedPopulationProfiles: profileRows.filter((row) => row.populationKey).length,
      recordsWithLatestPopulationInPoliceBaseline: policeRows.filter((row) => finite(row.population?.value) !== null).length,
      populationRecordsLabelledWorldBankLatest: policeRows.filter((row) => row.population?.source === 'WORLD_BANK_LATEST_AVAILABLE').length,
      localPopulation2015FallbackRecords: policeRows.filter((row) => row.population?.source === 'LOCAL_ECONOMY_PROFILE_2015').length,
      resourceContextRecords: Object.keys(resourceRows).length,
      policeBaselineRecords: policeRows.length,
      homicideRecordsLabelledObserved: policeRows.filter((row) => finite(row.crime?.observedHomicide?.ratePer100k) !== null).length,
      cityRegistryRecords: cityRows.length,
      rawFinancialRecords: rawFinancialRows.length
    },
    externalRefresh: {
      requested: REFRESH,
      worldBankIndicatorsLoaded: wbData.loaded,
      worldBankMetadataLoaded: wbMetadata.metadataLoaded,
      worldBankIndicatorErrors: wbData.errors,
      worldBankMetadataError: wbMetadata.metadataError,
      restCountriesLoaded: restCountries.loaded,
      restCountriesError: restCountries.error,
      policy: 'A refreshed observation replaces a legacy value only when the World Bank API returns a numeric observation. When a refresh is unavailable, previously stored World Bank observations are preserved.'
    },
    dataQualityPolicy: {
      nullMeans: 'unknown, unavailable, not imported, or not comparable; never zero',
      countryScope: 'all country and territory identities in countries.json, not only UN member states',
      legacyBaselineExternallyRevalidated: false,
      gameDerivedIndexesAreOfficial: false,
      modelledPoliceValuesAreObservedStatistics: false,
      duplicateDeletionPerformed: false,
      mergePolicy: 'additive aggregation with per-field provenance; original source datasets remain untouched',
      crossMetricComparisons: 'different indicators can have different observation years; check metricMetadata[field].year before combining',
      disciplineIndex: 'left null unless a defined, comparable source or an approved project-specific formula exists'
    },
    metricCoverage
  };
  const registry = {
    metadata,
    fieldCatalogue: METRIC_CATALOGUE,
    sources: [
      { id: 'countries.json', role: 'canonical country/territory identity, ISO codes and regional classification', authority: 'repository canonical identity registry', coverage: rows.length, externallyVerifiedInThisBuild: false },
      { id: 'economy.json', role: 'legacy financial baseline', baselineYear: 2015, coverage: metadata.localCoverage.mappedEconomicProfiles, status: 'NOT_EXTERNALLY_REVALIDATED' },
      { id: 'population.json', role: 'legacy demographic baseline', baselineYear: 2015, coverage: metadata.localCoverage.mappedPopulationProfiles, status: 'NOT_EXTERNALLY_REVALIDATED' },
      { id: 'economy_global_profiles_v1.json', role: 'legacy economic profile and derived game ratios', coverage: profileRows.length, status: 'NOT_EXTERNALLY_REVALIDATED' },
      { id: 'economy_raw_financial_data_v2.json', role: 'raw financial observations, source records, derived indicators and raw-field catalogue', coverage: rawFinancialRows.length, fieldCount: rawFinancialIndicatorKeys.length, status: 'preserved_without_source-file_changes' },
      { id: 'cities.json', role: 'local game city and capital candidates; not treated as authoritative geopolitical evidence', coverage: cityRows.length, status: 'LOCAL_GAME_GEOGRAPHY_NOT_INDEPENDENTLY_VERIFIED' },
      { id: 'resource_country_resource_context_index.json', role: 'country resource-context summary', coverage: Object.keys(resourceRows).length, status: 'LOCAL_CONTEXT; empty lists do not prove absence' },
      { id: 'omega_home_ministry_country_police_baseline_v1.json', role: 'police/game baseline, population source labels and homicide observations', coverage: policeRows.length, status: 'modeled values remain labelled; observed-source claims need revalidation' },
      { id: 'World Bank Indicators API v2', role: 'current/latest non-empty macro, demographic, governance and selected social observations', url: 'https://api.worldbank.org/v2/', enabledBy: '--refresh-sources', status: wbData.loaded ? 'FETCHED' : 'NOT_FETCHED' },
      { id: 'REST Countries API', role: 'general facts such as official name, capital, languages, currency codes, area, borders and timezones', url: 'https://restcountries.com/', enabledBy: '--refresh-sources', status: restCountries.loaded ? 'FETCHED' : 'NOT_FETCHED' }
    ],
    countries: rows
  };
  writeFileSync(OUTPUT, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  const summary = {
    output: 'country_general_data_registry_v1.json',
    countryCount: rows.length,
    uniqueIso3Count: uniqueCodes.size,
    rawFinancialFieldCount: rawFinancialIndicatorKeys.length,
    sourceCoverage: metadata.localCoverage,
    refresh: metadata.externalRefresh,
    metricCoverage
  };
  console.log(JSON.stringify(summary, null, 2));
  if (rows.length !== 249 || uniqueCodes.size !== rows.length) {
    throw new Error('COUNTRY_REGISTRY_IDENTITY_INTEGRITY_FAILED');
  }
  if (rawFinancialIndicatorKeys.length !== Number(rawFinancial.metadata?.rawFieldCount)) {
    throw new Error('RAW_FINANCIAL_FIELD_CATALOGUE_COUNT_MISMATCH');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
