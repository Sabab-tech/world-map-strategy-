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

const STRATEGIC_PROFILE_FIELDS = [
  'profileVersion', 'sovereigntyScope', 'executiveSummary', 'archetype', 'archetypeSource',
  'diplomacy', 'economy', 'military', 'politics', 'dependencies',
  'overallStrengths', 'overallWeaknesses', 'playerAdvantages', 'playerChallenges',
  'recommendedStrategy', 'strategyOptions', 'assessmentCriteria', 'dataQuality'
];
const STRATEGIC_CORE_METRICS = [
  'gdpCurrentUsd', 'populationTotal', 'gdpPerCapitaUsd', 'gdpGrowthPct', 'inflationPct',
  'unemploymentRatePct', 'publicDebtToGdpPct', 'tradeBalanceUsd', 'fxReservesUsd',
  'militaryExpenditurePctGdp', 'politicalStabilityWgiEstimate', 'governmentEffectivenessWgiEstimate',
  'ruleOfLawWgiEstimate'
];
const PROFILE_EVIDENCE_KEYS = [
  'gdpCurrentUsd', 'populationTotal', 'gdpPerCapitaUsd', 'gdpGrowthPct', 'inflationPct',
  'unemploymentRatePct', 'publicDebtToGdpPct', 'tradeBalanceUsd', 'tradeBalanceToGdpPct',
  'fxReservesUsd', 'fxReservesToGdpPct', 'militaryExpenditurePctGdp', 'ruleOfLawWgiEstimate',
  'controlOfCorruptionWgiEstimate', 'politicalStabilityWgiEstimate', 'governmentEffectivenessWgiEstimate',
  'regulatoryQualityWgiEstimate', 'voiceAccountabilityWgiEstimate', 'democracyIndex'
];
const GOVERNANCE_METRIC_KEYS = [
  'ruleOfLawWgiEstimate', 'controlOfCorruptionWgiEstimate', 'politicalStabilityWgiEstimate',
  'governmentEffectivenessWgiEstimate', 'regulatoryQualityWgiEstimate', 'voiceAccountabilityWgiEstimate'
];
const GENERIC_RELATION_PARAMETERS = {
  MIL_SECURITY_DEPENDENCY: 70, REGIONAL_THREAT_FEAR: 60,
  DOMESTIC_POLITICAL_STABILITY: 75, FOREIGN_AID_DEPENDENCY: 65,
  ECON_SANCTION_VULNERABILITY: 55, INTEL_COVERT_ACTIVITY_RISK: 60,
  MIL_MOBILIZATION_READINESS: 70
};

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
  { key: 'ruleOfLawWgiEstimate', name: 'Rule of law, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GOV_WGI_RL_EST', wbFallbacks: ['RL.EST'], description: 'World Governance Indicators estimate, not a 0-100 discipline score.' },
  { key: 'controlOfCorruptionWgiEstimate', name: 'Control of corruption, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GOV_WGI_CC_EST', wbFallbacks: ['CC.EST'], description: 'World Governance Indicators estimate.' },
  { key: 'politicalStabilityWgiEstimate', name: 'Political stability, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GOV_WGI_PV_EST', wbFallbacks: ['PV.EST'], description: 'World Governance Indicators estimate.' },
  { key: 'governmentEffectivenessWgiEstimate', name: 'Government effectiveness, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GOV_WGI_GE_EST', wbFallbacks: ['GE.EST'], description: 'World Governance Indicators estimate.' },
  { key: 'regulatoryQualityWgiEstimate', name: 'Regulatory quality, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GOV_WGI_RQ_EST', wbFallbacks: ['RQ.EST'], description: 'World Governance Indicators estimate.' },
  { key: 'voiceAccountabilityWgiEstimate', name: 'Voice and accountability, WGI estimate', unit: 'WGI estimate, approximately -2.5 to +2.5', wb: 'GOV_WGI_VA_EST', wbFallbacks: ['VA.EST'], description: 'World Governance Indicators estimate.' },
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
  { key: 'disciplineIndex', name: 'Discipline index', unit: 'not standardized', description: 'No universal, comparable international country-level discipline index is in the current source set. Value remains null until a defined project formula or reliable named source is approved.' }
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
  const candidates = [
    {
      sourceId: 'REST_COUNTRIES_API',
      url: 'https://restcountries.com/v3.1/all?fields=cca2,cca3,name,capital,currencies,languages,area,landlocked,borders,timezones,idd,independent,unMember,population'
    },
    {
      sourceId: 'REST_COUNTRIES_GITHUB_MIRROR',
      url: 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json'
    }
  ];
  const errors = [];
  for (const candidate of candidates) {
    try {
      const payload = await getJson(candidate.url);
      const rows = Array.isArray(payload) ? payload : [];
      const byIso3 = new Map(rows.filter((row) => row && row.cca3)
        .map((row) => [String(row.cca3).toUpperCase(), row]));
      if (!byIso3.size) throw new Error('EMPTY_OR_UNEXPECTED_COUNTRY_RESPONSE');
      byIso3.sourceId = candidate.sourceId;
      return byIso3;
    } catch (error) {
      errors.push(candidate.sourceId + ': ' + String(error));
    }
  }
  throw new Error(errors.join(' | ') || 'COUNTRY_REFERENCE_SOURCES_UNAVAILABLE');
}

async function fetchWorldBankMetadata() {
  const url = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
  const payload = await getJson(url);
  return new Map((Array.isArray(payload?.[1]) ? payload[1] : []).filter((row) => row && row.iso2Code).map((row) => [String(row.iso2Code).toUpperCase(), row]));
}

async function fetchWorldBankIndicators() {
  const codes = Array.from(new Set(METRIC_CATALOGUE.flatMap((field) => [field.wb, ...(field.wbFallbacks || [])]).filter(Boolean)));
  const byCountry = new Map();
  const errors = [];
  // The World Bank indicator endpoint accepts one indicator code per request.
  // Request in small parallel batches to avoid the unsupported semicolon-joined path.
  for (let offset = 0; offset < codes.length; offset += 4) {
    const group = codes.slice(offset, offset + 4);
    const results = await Promise.all(group.map(async (indicatorCode) => {
      const url = 'https://api.worldbank.org/v2/country/all/indicator/' +
        encodeURIComponent(indicatorCode) + '?format=json&mrnev=1&per_page=20000';
      try {
        const first = await getJson(url);
        const pages = Math.max(1, Number(first?.[0]?.pages) || 1);
        const payloads = [first];
        for (let page = 2; page <= pages; page += 1) payloads.push(await getJson(url + '&page=' + page));
        const observations = [];
        for (const payload of payloads) {
          const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
          for (const row of rows) {
            const iso3 = String(row?.countryiso3code || '').toUpperCase();
            if (!iso3 || row.value === null || row.value === undefined) continue;
            observations.push({
              iso3,
              indicatorCode,
              value: finite(row.value),
              year: finite(Number(row.date))
            });
          }
        }
        return { indicatorCode, observations, error: null };
      } catch (error) {
        return { indicatorCode, observations: [], error: String(error) };
      }
    }));
    // Merge only after each batch resolves so output ordering is deterministic.
    for (const result of results) {
      if (result.error) {
        errors.push({ indicator: result.indicatorCode, error: result.error });
        continue;
      }
      for (const observation of result.observations) {
        if (!byCountry.has(observation.iso3)) byCountry.set(observation.iso3, {});
        const old = byCountry.get(observation.iso3)[observation.indicatorCode];
        if (!old || (observation.year !== null && (old.year === null || observation.year >= old.year))) {
          byCountry.get(observation.iso3)[observation.indicatorCode] = {
            value: observation.value,
            year: observation.year,
            code: observation.indicatorCode,
            countryIso3: observation.iso3
          };
        }
      }
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

function updateFacts(identity, legacyEconomy, localCity, restCountry, wbCountry, previous, restCountrySource) {
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
    capitalCitySource: restCountry?.capital?.length ? (restCountrySource || 'REST_COUNTRIES_API') : (wbCountry?.capitalCity ? 'WORLD_BANK_COUNTRY_METADATA' : (last.capitalCity ? last.capitalCitySource : (localCapital ? 'LOCAL_CITIES_JSON_NOT_OFFICIALLY_VERIFIED' : null))),
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
      restCountries: restCountry ? ((restCountrySource || 'REST_COUNTRIES_API') + '_RECORD') : (last.factsSourceStatus?.restCountries || 'NOT_IMPORTED'),
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
      // Prefer the current WGI series identifier. Fall back to the legacy WDI identifier
      // only for a country where the preferred series returned no numeric observation.
      const candidateCodes = [field.wb, ...(field.wbFallbacks || [])].filter(Boolean);
      const selected = candidateCodes
        .map((code) => ({ code, observation: currentByIso3[code] }))
        .find((item) => item.observation && item.observation.value !== null);
      const observation = selected?.observation || null;
      const selectedCode = selected?.code || field.wb;
      const priorYear = finite(metricMetadata[field.key]?.year);
      if (observation &&
          (!oldOfficial || observation.year === null || priorYear === null || observation.year >= priorYear)) {
        metrics[field.key] = observation.value;
        metricMetadata[field.key] = {
          year: observation.year, sourceId: 'WORLD_BANK_WDI', sourceName: 'World Bank Indicators API v2',
          status: 'WORLD_BANK_API_OBSERVATION', method: 'SOURCE_OBSERVATION', indicatorCode: selectedCode,
          sourceUrl: 'https://api.worldbank.org/v2/country/' + String(country.iso3 || '').toLowerCase() + '/indicator/' + selectedCode + '?format=json',
          note: selectedCode === field.wb
            ? 'Most recent non-empty observation returned by the preferred indicator series; observation year and series ID are preserved.'
            : 'Preferred series had no numeric observation for this country; the documented legacy indicator fallback was used.'
        };
      } else if (REFRESH && metrics[field.key] === null) {
        const failedCodes = candidateCodes.filter((code) => refreshData.worldBank.errors.some((error) => error.indicator === code));
        metricMetadata[field.key] = {
          year: null, sourceId: failedCodes.length ? 'WORLD_BANK_WDI' : null,
          sourceName: failedCodes.length ? 'World Bank Indicators API v2' : null,
          status: failedCodes.length ? 'SOURCE_REFRESH_FAILED' : 'NO_SOURCE_OBSERVATION',
          method: 'API_REFRESH_DIAGNOSTIC', indicatorCode: null,
          sourceUrl: 'https://api.worldbank.org/v2/country/' + String(country.iso3 || '').toLowerCase() + '/indicator/' + field.wb + '?format=json',
          note: failedCodes.length
            ? 'No source value was stored because the indicator request failed: ' + failedCodes.join(', ') + '. Inspect metadata.externalRefresh.worldBankIndicatorErrors.'
            : 'The indicator requests completed but no numeric observation was returned for this country. Missing does not mean zero.'
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

  const facts = updateFacts(identity, normalizedEconomy, city, refreshData.restCountries.byIso3.get(String(country.iso3 || '').toUpperCase()), refreshData.worldBank.metadataByIso2.get(String(country.iso2 || '').toUpperCase()), prior, refreshData.restCountries.byIso3.sourceId);
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

function metricPercentileMap(rows, key) {
  // Compare a metric only against country/territory records for the exact same
  // observation year. Mixed-year values remain evidence, not a fake world ranking.
  const cohorts = new Map();
  const out = new Map();
  for (const row of rows) {
    const iso3 = String(row.identity?.iso3 || '').toUpperCase();
    const value = finite(row.metrics?.[key]);
    const year = finite(row.metricMetadata?.[key]?.year);
    if (!iso3 || value === null || year === null) continue;
    if (!cohorts.has(year)) cohorts.set(year, []);
    cohorts.get(year).push({ iso3, value });
  }
  for (const [year, cohort] of cohorts) {
    if (cohort.length < 5) continue;
    cohort.sort((a, b) => a.value - b.value);
    let start = 0;
    while (start < cohort.length) {
      let end = start + 1;
      while (end < cohort.length && cohort[end].value === cohort[start].value) end += 1;
      const midRank = (start + end - 1) / 2;
      const value = Number((midRank / (cohort.length - 1) * 100).toFixed(1));
      for (let index = start; index < end; index += 1) out.set(cohort[index].iso3, { percentile:value, peerYear:year, peerCount:cohort.length });
      start = end;
    }
  }
  return out;
}

function relationProfileQuality(profile) {
  if (!profile) return 'NO_LEGACY_RELATION_PROFILE';
  const params = profile.parameters && typeof profile.parameters === 'object' ? profile.parameters : {};
  const paramKeys = Object.keys(params).sort();
  const genericKeys = Object.keys(GENERIC_RELATION_PARAMETERS).sort();
  const genericParams = paramKeys.length === genericKeys.length &&
    paramKeys.every((key, index) => key === genericKeys[index] && finite(params[key]) === GENERIC_RELATION_PARAMETERS[key]);
  if (Object.keys(params).length > 0 && !genericParams) return 'COUNTRY_SPECIFIC_PARAMETERS';
  const driver = String(profile.ai_driver || '');
  const focus = Array.isArray(profile.high_weight_focus) ? profile.high_weight_focus : [];
  const low = Array.isArray(profile.low_weight_ignore) ? profile.low_weight_ignore : [];
  const genericDriver = /Strategic Autonomy\s*&\s*Sovereignty Preservation/i.test(driver);
  const genericFocus = JSON.stringify(focus) === JSON.stringify(['Economic Resilience', 'Border Sovereignty', 'Regional Trade']);
  const genericLow = JSON.stringify(low) === JSON.stringify(['Global Overseas Force Projection']);
  if (genericDriver && genericFocus && genericLow) return 'GENERIC_DEFAULT_PARAMETERS';
  return 'LEGACY_CONTEXT_ONLY';
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function summarizeResourceSites(siteRows) {
  const byCountry = new Map();
  for (const site of siteRows) {
    const countryId = String(site?.countryId || '').toUpperCase();
    if (!countryId) continue;
    if (!byCountry.has(countryId)) byCountry.set(countryId, {
      totalSiteCount: 0, commercialSiteCount: 0, notApplicableSiteCount: 0,
      resourceTypes: new Set(), sampleSiteNames: [], authority: 'SCENARIO_SIMULATION_DATA'
    });
    const summary = byCountry.get(countryId);
    summary.totalSiteCount += 1;
    if (site.commercialExtraction === true) {
      summary.commercialSiteCount += 1;
      if (site.resourceId) summary.resourceTypes.add(String(site.resourceId));
      if (site.siteName && summary.sampleSiteNames.length < 6) summary.sampleSiteNames.push(String(site.siteName));
    } else {
      summary.notApplicableSiteCount += 1;
    }
  }
  return byCountry;
}

function inferArchetype(row, relation, relationQuality, scores, resourceSites, sectorData) {
  if (relation?.category) return String(relation.category);
  if ((resourceSites?.commercialSiteCount || 0) >= 3 && (resourceSites?.resourceTypes?.length || 0) >= 2) {
    return 'Multi-commodity resource-development profile (game scenario inference)';
  }
  if (scores.economicScalePercentile !== null && scores.economicScalePercentile >= 85) {
    return 'Large-scale economic base (registry-derived profile)';
  }
  if (sectorData?.dominantSector === 'services' && scores.governanceQualityPercentile !== null && scores.governanceQualityPercentile >= 60) {
    return 'Services-led economy with stronger measured governance indicators (registry-derived profile)';
  }
  if (sectorData?.dominantSector === 'industry') {
    return 'Industry-weighted economy (registry-derived profile)';
  }
  if (sectorData?.dominantSector === 'agriculture') {
    return 'Agriculture-weighted economy (registry-derived profile)';
  }
  if (row.generalFacts?.landlocked === true && (row.generalFacts?.borderingIso3 || []).length >= 4) {
    return 'Landlocked, multi-neighbour regional profile (registry-derived inference)';
  }
  if (finite(row.metrics?.populationTotal) !== null && finite(row.metrics?.populationTotal) < 2000000) {
    return 'Small-population profile (registry-derived inference)';
  }
  return 'Mixed profile / limited comparable evidence';
}

function attachStrategicProfiles(rows, relationByIso2, siteSummaryByIso3, relationRecordCount, reserveSiteRecordCount) {
  const percentileKeys = [
    'gdpCurrentUsd', 'gdpPerCapitaUsd', 'fxReservesUsd', 'economicInfluenceIndex',
    'publicDebtToGdpPct', 'militaryExpenditurePctGdp', 'populationTotal', 'tradeBalanceUsd'
  ];
  const percentileMaps = Object.fromEntries(percentileKeys.map((key) => [key, metricPercentileMap(rows, key)]));
  const percentileDetail = (row, key) => percentileMaps[key]?.get(String(row.identity?.iso3 || '').toUpperCase()) ?? null;
  const percentile = (row, key) => percentileDetail(row, key)?.percentile ?? null;
  const governancePercentiles = Object.fromEntries(GOVERNANCE_METRIC_KEYS.map((key) => [key, metricPercentileMap(rows, key)]));
  const governanceScore = (row) => {
    const iso3 = String(row.identity?.iso3 || '').toUpperCase();
    const available = GOVERNANCE_METRIC_KEYS
      .map((key) => governancePercentiles[key].get(iso3)?.percentile)
      .filter((value) => value !== undefined && value !== null);
    return available.length >= 2
      ? Number((available.reduce((sum, value) => sum + value, 0) / available.length).toFixed(1))
      : null;
  };
  const dataForYearAwareSector = (row) => {
    const fields = [
      ['agriculture', 'agricultureValueAddedPctGdp'],
      ['industry', 'industryValueAddedPctGdp'],
      ['services', 'servicesValueAddedPctGdp']
    ];
    const populated = fields.map(([name, key]) => ({
      name, key, value: finite(row.metrics?.[key]),
      year: finite(row.metricMetadata?.[key]?.year)
    })).filter((item) => item.value !== null);
    const years = populated.map((item) => item.year);
    const oneSharedYear = populated.length >= 2 && years[0] !== null && years.every((year) => year === years[0]);
    const dominant = oneSharedYear ? populated.slice().sort((a, b) => b.value - a.value)[0] : null;
    return {
      sharesPct: Object.fromEntries(fields.map(([name, key]) => [name, finite(row.metrics?.[key])])),
      dominantSector: dominant?.name || null,
      comparisonYear: dominant?.year ?? null,
      comparisonStatus: oneSharedYear ? 'COMPARABLE_SAME_YEAR_VALUES' : 'NOT_COMPARABLE_OR_INSUFFICIENT_VALUES'
    };
  };

  const totals = {
    profileRecords: rows.length,
    specificRelationParameterProfiles: 0,
    genericRelationParameterProfiles: 0,
    contextOnlyRelationProfiles: 0,
    missingRelationProfiles: 0,
    countriesWithCommercialResourceSites: 0,
    commercialResourceSiteRecords: 0,
    countryProfilesWithMilitarySpendingData: 0,
    countryProfilesWithTwoOrMoreGovernanceIndicators: 0,
    countryProfilesWithRichCoreCoverage: 0
  };

  for (const row of rows) {
    const iso2 = String(row.identity?.iso2 || row.identity?.code || '').toUpperCase();
    const iso3 = String(row.identity?.iso3 || '').toUpperCase();
    const relation = relationByIso2.get(iso2) || null;
    const relationQuality = relationProfileQuality(relation);
    const resourceRaw = siteSummaryByIso3.get(iso3);
    const resourceSites = {
      totalSiteCount: resourceRaw?.totalSiteCount || 0,
      commercialSiteCount: resourceRaw?.commercialSiteCount || 0,
      notApplicableSiteCount: resourceRaw?.notApplicableSiteCount || 0,
      resourceTypes: resourceRaw ? [...resourceRaw.resourceTypes].sort() : [],
      sampleSiteNames: resourceRaw?.sampleSiteNames || [],
      authority: 'SCENARIO_SIMULATION_DATA',
      absenceMeaning: 'No listed commercial site does not prove that the country has no natural resources.',
      reserveValuesUsedAsNationalEconomicFacts: false
    };
    if (resourceSites.commercialSiteCount > 0) {
      totals.countriesWithCommercialResourceSites += 1;
      totals.commercialResourceSiteRecords += resourceSites.commercialSiteCount;
    }
    if (relationQuality === 'COUNTRY_SPECIFIC_PARAMETERS') totals.specificRelationParameterProfiles += 1;
    else if (relationQuality === 'GENERIC_DEFAULT_PARAMETERS') totals.genericRelationParameterProfiles += 1;
    else if (relationQuality === 'LEGACY_CONTEXT_ONLY') totals.contextOnlyRelationProfiles += 1;
    else totals.missingRelationProfiles += 1;

    const values = row.metrics || {};
    const metricMeta = row.metricMetadata || {};
    const n = (key) => finite(values[key]);
    const evidence = (key) => ({
      value: n(key),
      year: finite(metricMeta[key]?.year),
      status: metricMeta[key]?.status || (n(key) === null ? 'MISSING' : 'LOCAL_VALUE_STATUS_UNSPECIFIED'),
      sourceId: metricMeta[key]?.sourceId || null,
      method: metricMeta[key]?.method || null
    });
    const availableCoreMetricCount = STRATEGIC_CORE_METRICS.filter((key) => n(key) !== null).length;
    const governanceIndicatorCount = GOVERNANCE_METRIC_KEYS.filter((key) => n(key) !== null).length;
    const gdpPercentile = percentile(row, 'gdpCurrentUsd');
    const populationPercentile = percentile(row, 'populationTotal');
    const defenseEffortPercentile = percentile(row, 'militaryExpenditurePctGdp');
    const economicInfluencePercentile = percentile(row, 'economicInfluenceIndex');
    const fiscalRisk = n('fiscalRiskIndex');
    const fiscalHealth = n('fiscalHealthIndex');
    const governanceQualityPercentile = governanceScore(row);
    const sectorData = dataForYearAwareSector(row);
    const resourceContext = row.naturalResources || {};
    const relationParams = relation?.parameters && typeof relation.parameters === 'object' ? relation.parameters : {};
    const specificModelParameters = relationQuality === 'COUNTRY_SPECIFIC_PARAMETERS';
    const explicitFocus = Array.isArray(relation?.high_weight_focus) ? relation.high_weight_focus : [];
    const genericFocus = JSON.stringify(explicitFocus) === JSON.stringify(['Economic Resilience', 'Border Sovereignty', 'Regional Trade']);
    const explicitPriorities = specificModelParameters || !genericFocus ? explicitFocus.slice(0, 6) : [];
    const explicitLowPriority = specificModelParameters && Array.isArray(relation?.low_weight_ignore)
      ? relation.low_weight_ignore.slice(0, 6) : [];
    const strategicDriver = specificModelParameters ? (relation?.ai_driver || null) : null;

    const economicStrengths = [];
    const economicVulnerabilities = [];
    if (gdpPercentile !== null && gdpPercentile >= 75) economicStrengths.push('The recorded GDP scale is in the upper quartile of the current country/territory roster; this is relative economic scale, not an official rank.');
    if (n('economicInfluenceIndex') !== null && n('economicInfluenceIndex') >= 70) economicStrengths.push('The repository-derived economic-influence index is high; it is a game index, not an official national rating.');
    if (percentile(row, 'fxReservesUsd') !== null && percentile(row, 'fxReservesUsd') >= 75) economicStrengths.push('Recorded foreign-exchange reserves are high relative to other roster entries; inspect the observation year before comparing.');
    if (n('tradeBalanceUsd') !== null && n('tradeBalanceUsd') > 0) economicStrengths.push('The stored trade-balance value is positive, suggesting a potential external-trade buffer in the recorded baseline.');
    if (n('gdpGrowthPct') !== null && n('gdpGrowthPct') >= 3.5) economicStrengths.push('The available GDP-growth observation indicates comparatively strong recent growth; its year is recorded separately.');
    if (fiscalHealth !== null && fiscalHealth >= 70) economicStrengths.push('The repository-derived fiscal-health index is relatively strong; it is not a sovereign credit rating.');
    if (sectorData.dominantSector) economicStrengths.push('The largest recorded value-added sector is ' + sectorData.dominantSector + ' in the shared observation year ' + sectorData.comparisonYear + '.');
    if (resourceSites.commercialSiteCount > 0) {
      economicStrengths.push('The gameplay reserve registry lists ' + resourceSites.commercialSiteCount + ' commercial extraction sites across ' + resourceSites.resourceTypes.length + ' resource types; value depends on the live extraction, processing and logistics pipeline.');
    }

    if (fiscalRisk !== null && fiscalRisk >= 65) economicVulnerabilities.push('The repository-derived fiscal-risk index is elevated; verify its component observations and years before high-cost commitments.');
    if (n('publicDebtToGdpPct') !== null && n('publicDebtToGdpPct') >= 80) economicVulnerabilities.push('The recorded public-debt-to-GDP ratio is high and may constrain fiscal room; the metric year is available in the evidence section.');
    if (n('inflationPct') !== null && n('inflationPct') >= 10) economicVulnerabilities.push('The recorded inflation rate is high enough to create price-stability pressure in the game economy.');
    if (n('unemploymentRatePct') !== null && n('unemploymentRatePct') >= 10) economicVulnerabilities.push('The recorded unemployment rate suggests labour-market pressure and a potential domestic policy challenge.');
    if (n('tradeBalanceToGdpPct') !== null && n('tradeBalanceToGdpPct') <= -5) economicVulnerabilities.push('The recorded trade balance is materially negative relative to GDP, indicating external-trade pressure; it does not by itself prove import dependence.');
    if (n('gdpGrowthPct') !== null && n('gdpGrowthPct') < 0) economicVulnerabilities.push('The available GDP-growth observation is negative, indicating contraction in that observation period.');
    if (!economicStrengths.length) economicStrengths.push('No standout economic advantage can be established from the currently available registered indicators.');
    if (!economicVulnerabilities.length) economicVulnerabilities.push('No major macroeconomic vulnerability crosses the profile thresholds in the currently available fields; missing values are not evidence of safety.');

    const diplomaticTendencies = [];
    if (explicitPriorities.length) diplomaticTendencies.push('The legacy game relation model explicitly prioritizes: ' + explicitPriorities.join(', ') + '.');
    const highSignals = Object.entries(relationParams)
      .map(([key, value]) => [key, finite(value)])
      .filter(([key, value]) => specificModelParameters && value !== null && value >= 70);
    if (highSignals.some(([key]) => /NON_ALIGNMENT|BALANCING|AUTONOMY|NEUTRALITY/i.test(key))) {
      diplomaticTendencies.push('Strategic autonomy, neutrality or partner-balancing is emphasized by the country-specific legacy game parameters.');
    }
    if (highSignals.some(([key]) => /ALLIANCE|NATO|AUKUS|CARICOM|INTEGRATION|ALIGNMENT|BLOC/i.test(key))) {
      diplomaticTendencies.push('Alliance, bloc or regional-integration ties are a high-weight theme in the country-specific legacy game parameters.');
    }
    if (highSignals.some(([key]) => /BORDER|THREAT|SECURITY|DEFENSE|DEFENCE|MIL_/i.test(key))) {
      diplomaticTendencies.push('Border security, threat management or defense coordination receives high weight in the country-specific legacy game model.');
    }
    if (highSignals.some(([key]) => /EXPORT|ENERGY|HYDROCARBON|OIL|GAS|MINERAL|COMMODITY|TRADE/i.test(key))) {
      diplomaticTendencies.push('Trade or resource leverage is emphasized in the country-specific legacy game model.');
    }
    const borders = Array.isArray(row.generalFacts?.borderingIso3) ? row.generalFacts.borderingIso3 : [];
    if (borders.length >= 4) diplomaticTendencies.push('The registered geography lists ' + borders.length + ' land-border links, making neighbour management a meaningful strategic consideration.');
    if (gdpPercentile !== null && gdpPercentile >= 75) diplomaticTendencies.push('The relative economic scale may create bargaining capacity; diplomatic influence or partner loyalty is not directly measured by GDP.');
    if (!diplomaticTendencies.length) diplomaticTendencies.push('Country-specific diplomatic behaviour is not sufficiently measured; treat any strategic direction as a hypothesis to test in play.');

    const defenseSignals = [];
    const defenseRisks = [];
    if (gdpPercentile !== null && gdpPercentile >= 75) defenseSignals.push('A comparatively large recorded GDP base may support defense financing; it does not establish force readiness or equipment quality.');
    if (defenseEffortPercentile !== null && defenseEffortPercentile >= 75) defenseSignals.push('Military expenditure as a share of GDP is high relative to available roster observations; this measures budget effort, not combat strength.');
    if (populationPercentile !== null && populationPercentile >= 75) defenseSignals.push('Population scale may expand long-run manpower potential, but the registry does not measure recruitable personnel or training.');
    if (specificModelParameters && highSignals.some(([key]) => /MIL_MOBILIZATION_READINESS|DEFENSE_SPENDING|DEFENCE_SPENDING|MIL_MODERNIZATION|MIL_REGIONAL_INFLUENCE/i.test(key))) {
      defenseSignals.push('The legacy country-specific game model contains explicit mobilization, defense-budget or military-modernization signals; these are game heuristics, not verified force data.');
    }
    if (n('militaryExpenditurePctGdp') === null) defenseRisks.push('No usable military-expenditure observation is available in the general registry.');
    defenseRisks.push('Operational military strength, active personnel, equipment readiness, ammunition stocks and logistics are not quantified by the current general-data fields; do not infer them from spending alone.');

    const politicalStrengths = [];
    const politicalRisks = [];
    const governanceValues = GOVERNANCE_METRIC_KEYS.map((key) => ({ key, value: n(key) })).filter((item) => item.value !== null);
    for (const item of governanceValues) {
      if (item.value >= 0.5) politicalStrengths.push(item.key + ' is positive (' + item.value + ') in the stored WGI-style estimate.');
      if (item.value <= -0.5) politicalRisks.push(item.key + ' is negative (' + item.value + ') in the stored WGI-style estimate, signalling a governance pressure.');
    }
    if (governanceQualityPercentile !== null && governanceQualityPercentile >= 70) politicalStrengths.push('The average percentile of available governance indicators is relatively strong across the roster; this is a derived comparison, not an official governance score.');
    if (governanceQualityPercentile !== null && governanceQualityPercentile <= 30) politicalRisks.push('The average percentile of available governance indicators is low relative to the roster; underlying indicator years may differ.');
    if (n('democracyIndex') !== null) {
      politicalStrengths.push('A democracy-index value is recorded (' + n('democracyIndex') + '/10); use the named source/year before classifying the political system.');
    }
    if (!politicalStrengths.length && !politicalRisks.length) politicalRisks.push('Comparable governance evidence is too sparse to rate political stability or institutional strength confidently.');
    const politicalSystemClassification = 'NOT_CLASSIFIED_FROM_AVAILABLE_DATA';

    const dependencySignals = [];
    if (specificModelParameters) {
      Object.entries(relationParams)
        .map(([key, value]) => ({ key, value: finite(value) }))
        .filter((item) => item.value !== null && item.value >= 60 &&
          /DEPENDENCY|EXPOSURE|VULNERABILITY|RISK|BURDEN|NEED|PRESSURE|GAP|RELIANCE|SANCTION/i.test(item.key))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .forEach((item) => dependencySignals.push({
          signal: item.key, level: item.value, evidenceType: 'COUNTRY_SPECIFIC_LEGACY_GAME_PARAMETER',
          interpretation: 'Model signal only; not independently verified as a real-world measured dependency.'
        }));
    }
    if (n('tradeBalanceToGdpPct') !== null && n('tradeBalanceToGdpPct') <= -5) {
      dependencySignals.push({
        signal: 'TRADE_BALANCE_PRESSURE', level: n('tradeBalanceToGdpPct'),
        evidenceType: 'REGISTERED_MACRO_INDICATOR',
        interpretation: 'A negative trade balance relative to GDP can create external financing pressure, but it does not alone prove dependence on a named state or supplier.'
      });
    }
    if (fiscalRisk !== null && fiscalRisk >= 65) {
      dependencySignals.push({
        signal: 'FISCAL_RISK_PRESSURE', level: fiscalRisk,
        evidenceType: 'REPOSITORY_DERIVED_GAME_INDEX',
        interpretation: 'Potentially tighter fiscal room; this index is not an official sovereign rating.'
      });
    }

    const sectorDataForProfile = {
      sharesPct: sectorData.sharesPct,
      dominantSector: sectorData.dominantSector,
      comparisonYear: sectorData.comparisonYear,
      comparisonStatus: sectorData.comparisonStatus,
      caveat: 'Sector shares are compared only when at least two available sector observations use the same year.'
    };
    const scores = {
      economicScalePercentile: gdpPercentile,
      economicScalePeerYear: percentileDetail(row, 'gdpCurrentUsd')?.peerYear ?? null,
      economicScalePeerCount: percentileDetail(row, 'gdpCurrentUsd')?.peerCount ?? 0,
      economicInfluenceIndex: n('economicInfluenceIndex'),
      economicInfluencePercentile: economicInfluencePercentile,
      economicInfluencePeerYear: percentileDetail(row, 'economicInfluenceIndex')?.peerYear ?? null,
      economicInfluencePeerCount: percentileDetail(row, 'economicInfluenceIndex')?.peerCount ?? 0,
      foreignExchangeReservePercentile: percentile(row, 'fxReservesUsd'),
      foreignExchangeReservePeerYear: percentileDetail(row, 'fxReservesUsd')?.peerYear ?? null,
      foreignExchangeReservePeerCount: percentileDetail(row, 'fxReservesUsd')?.peerCount ?? 0,
      fiscalRiskIndex: fiscalRisk,
      fiscalHealthIndex: fiscalHealth,
      governanceQualityPercentile: governanceQualityPercentile,
      governancePeerCountsByMetric: Object.fromEntries(GOVERNANCE_METRIC_KEYS.map((key) => [key, {
        peerYear: governancePercentiles[key].get(iso3)?.peerYear ?? null,
        peerCount: governancePercentiles[key].get(iso3)?.peerCount ?? 0
      }])),
      defenseFinancialBasePercentile: gdpPercentile,
      defenseExpenditureSharePercentile: defenseEffortPercentile,
      defenseExpenditurePeerYear: percentileDetail(row, 'militaryExpenditurePctGdp')?.peerYear ?? null,
      defenseExpenditurePeerCount: percentileDetail(row, 'militaryExpenditurePctGdp')?.peerCount ?? 0,
      populationScalePercentile: populationPercentile,
      populationPeerYear: percentileDetail(row, 'populationTotal')?.peerYear ?? null,
      populationPeerCount: percentileDetail(row, 'populationTotal')?.peerCount ?? 0,
      politicalStabilityWgiEstimate: n('politicalStabilityWgiEstimate')
    };
    const resourceContextSignals = uniqueStrings([
      ...Object.values(resourceContext.mineralResourceBase || {}).flatMap((value) => Array.isArray(value) ? value : []),
      ...Object.values(resourceContext.hydrocarbonResourceBase || {}).flatMap((value) => Array.isArray(value) ? value : []),
      ...Object.values(resourceContext.energyResourceBase || {}).flatMap((value) => Array.isArray(value) ? value : [])
    ]).sort();
    const economicPressurePoints = [];
    if (fiscalRisk !== null && fiscalRisk >= 65) economicPressurePoints.push({
      key:'fiscalRiskIndex', title:'Fiscal risk pressure', value:fiscalRisk, unit:'game index /100', level:'HIGH',
      evidenceType:'REPOSITORY_DERIVED_INDEX',
      detail:'Review the registered debt, inflation, unemployment and deficit inputs with their observation years before expensive commitments.'
    });
    if (n('publicDebtToGdpPct') !== null && n('publicDebtToGdpPct') >= 80) economicPressurePoints.push({
      key:'publicDebtToGdpPct', title:'Public debt burden', value:n('publicDebtToGdpPct'), unit:'% of GDP', level:'HIGH',
      evidenceType:'REGISTERED_INDICATOR',
      detail:'The recorded debt ratio may constrain fiscal space; check its observation year and definition.'
    });
    if (n('inflationPct') !== null && n('inflationPct') >= 10) economicPressurePoints.push({
      key:'inflationPct', title:'Price-stability pressure', value:n('inflationPct'), unit:'%', level:'HIGH',
      evidenceType:'REGISTERED_INDICATOR',
      detail:'High recorded inflation can weaken purchasing power and make procurement costs less predictable.'
    });
    if (n('unemploymentRatePct') !== null && n('unemploymentRatePct') >= 10) economicPressurePoints.push({
      key:'unemploymentRatePct', title:'Labour-market pressure', value:n('unemploymentRatePct'), unit:'%', level:'HIGH',
      evidenceType:'REGISTERED_INDICATOR',
      detail:'Recorded unemployment suggests labour-market pressure; definitions and observation years vary.'
    });
    if (n('tradeBalanceToGdpPct') !== null && n('tradeBalanceToGdpPct') <= -5) economicPressurePoints.push({
      key:'tradeBalanceToGdpPct', title:'External-trade pressure', value:n('tradeBalanceToGdpPct'), unit:'% of GDP', level:'ELEVATED',
      evidenceType:'REGISTERED_OR_DERIVED_INDICATOR',
      detail:'A negative trade balance alone does not prove a named supplier dependency or inability to finance imports.'
    });
    const economicProgressSignals = [];
    if (n('gdpGrowthPct') !== null) economicProgressSignals.push({
      key:'gdpGrowthPct', title:'Recorded GDP growth', value:n('gdpGrowthPct'), unit:'%',
      direction:n('gdpGrowthPct') > 0 ? 'POSITIVE_CURRENT_SIGNAL' : (n('gdpGrowthPct') < 0 ? 'NEGATIVE_CURRENT_SIGNAL' : 'NO_GROWTH_SIGNAL'),
      year:finite(metricMeta.gdpGrowthPct?.year),
      detail:'A single recorded growth observation is not proof of a multi-year improvement or decline.'
    });
    if (n('agricultureValueAddedPctGdp') !== null || n('industryValueAddedPctGdp') !== null || n('servicesValueAddedPctGdp') !== null) {
      economicProgressSignals.push({
        key:'sectorMix', title:'Production structure known',
        direction:sectorData.dominantSector ? 'SHARED_YEAR_DOMINANT_SECTOR_AVAILABLE' : 'SECTOR_YEARS_NOT_COMPARABLE',
        value:sectorData.dominantSector || null, unit:null, year:sectorData.comparisonYear,
        detail:'Sector composition is compared only when available values share one observation year.'
      });
    }
    const economicProfile = {
      scores,
      tradePosition:n('tradeBalanceToGdpPct') === null ? 'UNKNOWN' :
        (n('tradeBalanceToGdpPct') > 0 ? 'RECORDED_SURPLUS' : (n('tradeBalanceToGdpPct') < 0 ? 'RECORDED_DEFICIT' : 'RECORDED_BALANCE')),
      sectorProfile:sectorDataForProfile,
      recordedResourceContext:{
        categories:resourceContextSignals,
        sourceStatus:row.naturalResources?.coverageStatus || 'NO_RESOURCE_CONTEXT_RECORD',
        interpretation:'Categories present in game context; empty or repeated lists do not prove real-world absence or abundance.'
      },
      gameplayResourceAssets:resourceSites,
      strengths:economicStrengths,
      vulnerabilities:economicVulnerabilities,
      pressurePoints:economicPressurePoints,
      developmentSignals:economicProgressSignals,
      trendStatus:'MULTI_YEAR_ECONOMIC_TREND_NOT_COMPUTED_FROM_SINGLE_LATEST_VALUES',
      limitations:[
        'Fiscal risk, fiscal health and economic influence indexes are not official sovereign ratings.',
        'Macroeconomic indicators may have different source years; the evidence panel exposes each year.',
        'A trade deficit alone does not establish dependence on a specific foreign country or commodity.'
      ]
    };
    const governanceIndicatorPoints = GOVERNANCE_METRIC_KEYS.map((key) => ({
      key,value:n(key),year:finite(metricMeta[key]?.year),
      interpretation:n(key) === null ? 'NO_OBSERVATION' :
        (n(key) >= 0.5 ? 'POSITIVE_RECORDED_SIGNAL' : (n(key) <= -0.5 ? 'NEGATIVE_RECORDED_SIGNAL' : 'NEAR_MIDDLE_OF_WGI_SCALE')),
      scale:'WGI_ESTIMATE_APPROX_MINUS_2_5_TO_PLUS_2_5',
      sourceStatus:metricMeta[key]?.status || 'MISSING'
    }));
    const politicalProfile = {
      politicalSystemClassification,
      classificationStatus:'NOT_CLASSIFIED_FROM_AVAILABLE_DATA',
      democracyIndex:n('democracyIndex'),
      politicalStabilityWgiEstimate:n('politicalStabilityWgiEstimate'),
      governmentEffectivenessWgiEstimate:n('governmentEffectivenessWgiEstimate'),
      ruleOfLawWgiEstimate:n('ruleOfLawWgiEstimate'),
      controlOfCorruptionWgiEstimate:n('controlOfCorruptionWgiEstimate'),
      voiceAccountabilityWgiEstimate:n('voiceAccountabilityWgiEstimate'),
      governanceQualityPercentile,
      availableGovernanceIndicatorCount:governanceIndicatorCount,
      governanceIndicatorPoints,
      strengths:politicalStrengths,
      risks:politicalRisks,
      institutionalPressurePoints:politicalRisks.map((detail)=>({title:'Governance pressure signal',detail,evidenceType:'REGISTERED_GOVERNANCE_INDICATOR'})),
      progressStatus:'POLITICAL_CHANGE_NOT_ESTABLISHED_WITH_SINGLE_LATEST_OBSERVATIONS',
      limitations:[
        'A single latest observation is a level, not proof of improvement or deterioration.',
        'WGI, Democracy Index and press-freedom indicators have different scales and are not merged into one invented score.',
        'No regime type or political ideology is assigned without a named, dated source.'
      ]
    };
    const forceStructureUnavailable = [
      {field:'activePersonnel',status:'NOT_IN_COMPARABLE_GENERAL_REGISTRY'},
      {field:'equipmentInventoryAndQuality',status:'NOT_IN_COMPARABLE_GENERAL_REGISTRY'},
      {field:'combatReadiness',status:'NOT_IN_COMPARABLE_GENERAL_REGISTRY'},
      {field:'ammunitionAndSustainment',status:'NOT_IN_COMPARABLE_GENERAL_REGISTRY'},
      {field:'airAndNavalOperationalAvailability',status:'NOT_IN_COMPARABLE_GENERAL_REGISTRY'},
      {field:'deploymentAndLogisticsReach',status:'NOT_IN_COMPARABLE_GENERAL_REGISTRY'}
    ];
    const gameMilitarySignals = specificModelParameters
      ? Object.entries(relationParams).filter(([key, value]) =>
          /MIL_|DEFEN[CS]E|ARMY|NAVY|AIR_FORCE|MOBILIZATION|FORCE_PROJECTION|EQUIPMENT/i.test(key) && finite(value) !== null)
          .map(([key, value]) => ({signal:key,value:finite(value),meaning:'Country-specific OMEGA model signal; not observed order-of-battle data.'}))
      : [];
    const militaryProfile = {
      capabilityStatus:'OPERATIONAL_CAPABILITY_NOT_MEASURED_BY_GENERAL_REGISTRY',
      militaryExpenditurePctGdp:n('militaryExpenditurePctGdp'),
      expenditureObservationYear:finite(metricMeta.militaryExpenditurePctGdp?.year),
      expenditureSharePercentile:defenseEffortPercentile,
      expenditureSharePeerYear:percentileDetail(row,'militaryExpenditurePctGdp')?.peerYear ?? null,
      expenditureSharePeerCount:percentileDetail(row,'militaryExpenditurePctGdp')?.peerCount ?? 0,
      financialBasePercentile:gdpPercentile,
      financialBasePeerYear:percentileDetail(row,'gdpCurrentUsd')?.peerYear ?? null,
      populationScalePercentile:populationPercentile,
      populationPeerYear:percentileDetail(row,'populationTotal')?.peerYear ?? null,
      gameModelMilitarySignals:Object.fromEntries(gameMilitarySignals.map((item)=>[item.signal,item.value])),
      gameModelMilitarySignalDetails:gameMilitarySignals,
      strengthSignals:defenseSignals,
      riskSignals:defenseRisks,
      capabilityGaps:forceStructureUnavailable,
      assessmentStatus:n('militaryExpenditurePctGdp') !== null ? 'BUDGET_EFFORT_ONLY' : 'NO_COMPARABLE_MILITARY_INDICATOR',
      trendStatus:'MILITARY_CAPABILITY_TREND_NOT_MEASURED',
      caveat:'Military spending, economic scale and population are contextual indicators only, not evidence of operational force strength without verified force structure, readiness, equipment, sustainment and logistics data.'
    };
    const relationSignalPoints = Object.entries(relationParams)
      .map(([key, value]) => ({ signal:key, value:finite(value) }))
      .filter((item) => specificModelParameters && item.value !== null)
      .sort((a, b) => b.value - a.value)
      .map((item) => ({ ...item,
        intensity:item.value >= 80 ? 'HIGH' : (item.value >= 60 ? 'ELEVATED' : 'MODERATE_OR_LOW'),
        meaning:'Existing OMEGA game-model signal; not an independently verified real-world measurement.'
      }));
    const cooperationSignals = relationSignalPoints.filter((item) =>
      item.value >= 60 && /ALLIANCE|NATO|AUKUS|EU_|CARICOM|INTEGRATION|ALIGNMENT|BLOC|NEUTRALITY|NON_ALIGNMENT|DIPLOMACY/i.test(item.signal));
    const diplomaticPressureSignals = relationSignalPoints.filter((item) =>
      item.value >= 60 && /THREAT|BORDER|SANCTION|SECURITY|DEFENSE|DEFENCE|DEPENDENCY|VULNERABILITY|RISK|PRESSURE|EXPOSURE/i.test(item.signal));
    const bargainingSignals = [];
    if (gdpPercentile !== null && gdpPercentile >= 75) bargainingSignals.push({
      title:'Relative economic scale',
      detail:'GDP is in the upper quartile of the exact same-year comparison cohort. It may support bargaining capacity but does not prove diplomatic influence.',
      evidenceType:'SAME_YEAR_PEER_COMPARISON', evidenceMetric:'gdpCurrentUsd'
    });
    if (resourceSites.commercialSiteCount > 0) bargainingSignals.push({
      title:'Listed gameplay resource assets',
      detail:resourceSites.commercialSiteCount + ' commercial gameplay sites are registered; leverage depends on production, processing, logistics and market access.',
      evidenceType:'GAMEPLAY_SCENARIO_REGISTRY', evidenceMetric:'resourceSiteCount'
    });
    if (!specificModelParameters) bargainingSignals.push({
      title:'Diplomatic leverage not directly quantified',
      detail:'No country-specific relation-parameter set is available, so no influence or partner-reliability score is inferred.',
      evidenceType:'DATA_GAP', evidenceMetric:null
    });
    const diplomaticProfile = {
      evidenceMode:specificModelParameters ? 'COUNTRY_SPECIFIC_LEGACY_GAME_PARAMETERS' :
        (relationQuality === 'NO_LEGACY_RELATION_PROFILE' ? 'DATA_DERIVED_WITH_NO_LEGACY_RELATION_ROW' : 'INFERENCE_OR_CATEGORY_ONLY'),
      legacyCategory:relation?.category || null,
      strategicDriver:strategicDriver,
      strategicPosture:specificModelParameters ? (strategicDriver || relation?.category || 'COUNTRY_SPECIFIC_MODEL_WITHOUT_NAMED_DRIVER') : 'NOT_ESTABLISHED_FROM_COUNTRY_SPECIFIC_PARAMETERS',
      highWeightFocus:explicitPriorities,
      lowWeightIgnore:explicitLowPriority,
      tendencies:uniqueStrings(diplomaticTendencies),
      cooperationSignals,
      pressurePoints:diplomaticPressureSignals,
      leverageSignals:bargainingSignals,
      modelSignals:relationSignalPoints,
      parameters:specificModelParameters ? relationParams : {},
      relationProfileStatus:relationQuality,
      assessment:specificModelParameters ? 'COUNTRY_SPECIFIC_GAME_MODEL_SIGNAL' :
        (relationQuality === 'NO_LEGACY_RELATION_PROFILE' ? 'INSUFFICIENT_RELATION_MODEL_EVIDENCE' : 'LIMITED_OR_GENERIC_RELATION_EVIDENCE'),
      limitations:[
        'The relation registry is a game model, not a verified measure of current diplomatic behaviour, friendship or alliance reliability.',
        specificModelParameters ? 'Model priorities do not establish treaty status or guaranteed partners.' : 'Generic relation defaults are not shown as country-specific behaviour.',
        'Diplomatic reach, embassies, treaties, UN voting alignment and partner reliability require separate source data before they can be rated.'
      ]
    };

    const dependencyDomain = (signal) => {
      if (/AID|ASSISTANCE|FOREIGN_AID/i.test(signal)) return 'FOREIGN_ASSISTANCE';
      if (/DEFENSE|DEFENCE|MIL_|SECURITY|ARMY|NAVY|MOBILIZATION|EQUIPMENT/i.test(signal)) return 'DEFENCE_AND_SECURITY';
      if (/ENERGY|OIL|GAS|HYDROCARBON|FUEL|ELECTRIC|WATER/i.test(signal)) return 'ENERGY_AND_CRITICAL_SUPPLIES';
      if (/SANCTION|DEBT|IMF|FISCAL|RESERVE|CURRENCY|FINANCE|CREDIT/i.test(signal)) return 'FINANCE_AND_SANCTIONS';
      if (/TRADE|EXPORT|IMPORT|COMMODITY|MARKET|REMITTANCE/i.test(signal)) return 'TRADE_AND_EXTERNAL_MARKETS';
      if (/BORDER|THREAT|CLIMATE|DISASTER|REFUGEE|MIGRATION|GEOGRAPHY/i.test(signal)) return 'GEOGRAPHY_AND_EXTERNAL_PRESSURE';
      if (/DEPENDENCY|EXPOSURE|RELIANCE|PIVOT|BALANCING|ALIGNMENT|PARTNER|NEIGHBOUR|NEIGHBOR|CHINA|RUSSIA|UNITED_STATES|NON_ALIGNMENT|NEUTRALITY/i.test(signal)) return 'EXTERNAL_PARTNER_AND_STRATEGIC_ALIGNMENT';
      if (/GOVERNANCE|CORRUPTION|STABILITY|POLITICAL|INSTITUTION/i.test(signal)) return 'DOMESTIC_INSTITUTIONS';
      return 'OTHER_MODEL_SIGNAL';
    };
    const structuredDependencySignals = dependencySignals.map((item)=>({
      ...item,domain:dependencyDomain(item.signal),
      intensity:typeof item.level==='number'&&item.level>=80?'HIGH':(typeof item.level==='number'&&item.level>=60?'ELEVATED':'UNRATED_OR_INDICATOR_SPECIFIC'),
      confidence:item.evidenceType==='REGISTERED_MACRO_INDICATOR'?'INDICATOR_BACKED':
        (item.evidenceType==='COUNTRY_SPECIFIC_LEGACY_GAME_PARAMETER'?'GAME_MODEL_SIGNAL':'DERIVED_GAME_INDEX'),
      clarification:'A dependency signal identifies pressure to investigate; it does not prove reliance on a named supplier, ally or creditor.'
    }));
    const strategyOptions = [];
    if (economicPressurePoints.length) strategyOptions.push({
      domain:'ECONOMY',priority:1,title:'Reduce the most evidenced fiscal and price pressure',
      detail:economicPressurePoints.slice(0,3).map((item)=>item.title).join(', '),
      basis:'REGISTERED_ECONOMIC_INDICATORS'
    });
    if (structuredDependencySignals.length) strategyOptions.push({
      domain:'DEPENDENCY',priority:2,title:'Map and reduce the highest dependency signals',
      detail:structuredDependencySignals.slice(0,3).map((item)=>item.signal.replace(/_/g,' ')).join(', '),
      basis:'EXISTING_COUNTRY_SPECIFIC_GAME_PARAMETERS_OR_REGISTERED_MACRO_PRESSURE'
    });
    if (resourceSites.commercialSiteCount>0) strategyOptions.push({
      domain:'INDUSTRY_AND_RESOURCES',priority:3,title:'Build value-added processing and logistics around listed gameplay sites',
      detail:resourceSites.commercialSiteCount+' commercial extraction sites are registered; throughput depends on the live gameplay chain.',
      basis:'GAMEPLAY_SCENARIO_REGISTRY'
    });
    if (n('gdpGrowthPct')!==null&&n('gdpGrowthPct')>0) strategyOptions.push({
      domain:'DEVELOPMENT',priority:4,title:'Protect the currently positive growth signal',
      detail:'Recorded GDP growth is positive for observation year '+(finite(metricMeta.gdpGrowthPct?.year)??'unknown')+'; a multi-year trend is not established.',
      basis:'SINGLE_RECORDED_GDP_GROWTH_OBSERVATION'
    });
    if (!strategyOptions.length) strategyOptions.push({
      domain:'PLANNING',priority:1,title:'Improve evidence coverage before expensive commitments',
      detail:'Current evidence is insufficient to establish a more specific low-risk strategy with confidence.',
      basis:'EVIDENCE_GAP'
    });

    const overallStrengths = uniqueStrings([
      ...economicStrengths.filter((value) => !value.startsWith('No standout')),
      ...politicalStrengths,
      ...defenseSignals,
      ...explicitPriorities.map((value) => 'The existing game relation model highlights ' + value + ' as a strategic priority.')
    ]).slice(0, 8);
    const overallWeaknesses = uniqueStrings([
      ...economicVulnerabilities.filter((value) => !value.startsWith('No major')),
      ...politicalRisks,
      ...dependencySignals.map((item) => item.signal + ': ' + item.interpretation)
    ]).slice(0, 8);
    if (!overallStrengths.length) overallStrengths.push('No standout strength can be established from the available country-specific indicators.');
    if (!overallWeaknesses.length) overallWeaknesses.push('No major weakness crosses the available evidence thresholds; incomplete data must not be interpreted as no risk.');

    const playerAdvantages = uniqueStrings([
      ...economicStrengths.filter((value) => !value.startsWith('No standout')),
      ...politicalStrengths.filter((value) => value.startsWith('The average percentile')),
      ...defenseSignals.filter((value) => value.startsWith('A comparatively large recorded GDP')),
      ...explicitPriorities.map((value) => 'The current game model gives ' + value + ' high strategic weight.')
    ]).slice(0, 6);
    if (!playerAdvantages.length) playerAdvantages.push('Use targeted regional partnerships and verify country data before committing to an expensive national strategy.');
    const playerChallenges = uniqueStrings([
      ...economicVulnerabilities.filter((value) => !value.startsWith('No major')),
      ...politicalRisks.filter((value) => !value.startsWith('Comparable governance evidence')),
      ...dependencySignals.map((item) => item.signal + ': ' + item.interpretation),
      ...defenseRisks.filter((value) => n('militaryExpenditurePctGdp') === null)
    ]).slice(0, 7);
    if (!playerChallenges.length) playerChallenges.push('Military force readiness and other unmeasured risks remain uncertain; do not treat missing indicators as zero risk.');

    let recommendedStrategy;
    if ((fiscalRisk !== null && fiscalRisk >= 65) ||
        (n('inflationPct') !== null && n('inflationPct') >= 10) ||
        (n('publicDebtToGdpPct') !== null && n('publicDebtToGdpPct') >= 80)) {
      recommendedStrategy = 'Stabilize fiscal exposure, prices and reliable revenue before taking on costly external or military commitments.';
    } else if (resourceSites.commercialSiteCount >= 3) {
      recommendedStrategy = 'Convert listed resource sites into a complete extraction-to-processing-to-logistics-to-factory chain, while investing in diversification instead of relying only on raw commodities.';
    } else if (governanceQualityPercentile !== null && governanceQualityPercentile <= 35) {
      recommendedStrategy = 'Prioritize institutional reliability, predictable rules and transparent project delivery before scaling high-cost programs.';
    } else if (gdpPercentile !== null && gdpPercentile >= 75) {
      recommendedStrategy = 'Use the large recorded economic base to build resilient trade and diplomatic partnerships, while monitoring sector concentration and external exposure.';
    } else if (gdpPercentile !== null && gdpPercentile <= 35) {
      recommendedStrategy = 'Prioritize high-return infrastructure, fiscal discipline and regional partnerships over expensive global power projection.';
    } else {
      recommendedStrategy = 'Build around the strongest evidenced economic or diplomatic advantage, address the largest measured risk, and verify missing military and governance fields before major commitments.';
    }

    const metricYears = Object.fromEntries(PROFILE_EVIDENCE_KEYS.map((key) => [key, finite(metricMeta[key]?.year)]));
    const metricEvidence = Object.fromEntries(PROFILE_EVIDENCE_KEYS.map((key) => [key, evidence(key)]));
    const profileCoverageLevel = availableCoreMetricCount >= 8 && governanceIndicatorCount >= 3 ? 'RICH_INDICATOR_COVERAGE' :
      (availableCoreMetricCount >= 4 ? 'PARTIAL_INDICATOR_COVERAGE' : 'LIMITED_INDICATOR_COVERAGE');
    if (n('militaryExpenditurePctGdp') !== null) totals.countryProfilesWithMilitarySpendingData += 1;
    if (governanceIndicatorCount >= 2) totals.countryProfilesWithTwoOrMoreGovernanceIndicators += 1;
    if (availableCoreMetricCount >= 8) totals.countryProfilesWithRichCoreCoverage += 1;

    const archetype = inferArchetype(row, relation, relationQuality, scores, resourceSites, sectorData);
    const sovereigntyScope = row.generalFacts?.independent === true ? 'SOVEREIGN_STATE_PER_CURRENT_GENERAL_FACTS' :
      (row.generalFacts?.independent === false ? 'NON_SOVEREIGN_OR_DEPENDENT_ENTITY_PER_CURRENT_GENERAL_FACTS' : 'SOVEREIGNTY_NOT_VERIFIED_IN_CURRENT_RECORD');
    const summaryParts = [
      archetype,
      'Economic indicator coverage: ' + profileCoverageLevel.toLowerCase().replace(/_/g, ' ') + '.',
      overallStrengths[0] ? 'Potential edge: ' + overallStrengths[0] : '',
      overallWeaknesses[0] ? 'Main pressure: ' + overallWeaknesses[0] : ''
    ].filter(Boolean);

    row.strategicProfile = {
      profileVersion: 'OMEGA_COUNTRY_STRATEGIC_PROFILE_V2',
      sovereigntyScope,
      executiveSummary: summaryParts.join(' '),
      archetype,
      archetypeSource: relation?.category
        ? (specificModelParameters ? 'LEGACY_RELATION_CATEGORY_WITH_COUNTRY_SPECIFIC_PARAMETERS' : 'LEGACY_RELATION_CATEGORY_WITH_LIMITED_OR_GENERIC_BEHAVIOUR_PARAMETERS')
        : 'INFERRED_FROM_REGISTERED_INDICATORS_AND_GAMEPLAY_SITE_IDS',
      diplomacy: diplomaticProfile,
      economy: economicProfile,
      military: militaryProfile,
      politics: politicalProfile,
      dependencies: {
        modelSignals: structuredDependencySignals,
        domains: [...new Set(structuredDependencySignals.map((item) => item.domain))],
        interpretationPolicy: 'Only country-specific legacy parameters are presented as modelled dependencies; general macro signals are labelled as pressure signals, not proof of dependence on a named state.',
        measurementGaps: [
          'Named import-supplier shares and critical-import concentration are not registered for every country.',
          'External debt creditor composition, energy import share and foreign-aid shares need source-backed records before they can be rated as measured dependence.',
          'A model signal can prioritise an in-game investigation but is not a verified real-world dependence statistic.'
        ]
      },
      overallStrengths,
      overallWeaknesses,
      playerAdvantages,
      playerChallenges,
      recommendedStrategy,
      strategyOptions,
      assessmentCriteria: {
        rubricVersion: 'OMEGA_COUNTRY_PROFILE_RUBRIC_V2',
        peerComparison: {
          rule: 'Percentiles require the same metric and exact observation year, with at least five country/territory observations in that year cohort.',
          interpretation: 'No percentile means no comparable cohort was available; it does not mean low strength.'
        },
        thresholds: {
          wgiPositiveSignal: 'value >= +0.5 on the named WGI estimate scale',
          wgiPressureSignal: 'value <= -0.5 on the named WGI estimate scale',
          highInflationPressure: 'inflation >= 10% in the recorded observation',
          highUnemploymentPressure: 'unemployment >= 10% in the recorded observation',
          highPublicDebtPressure: 'public debt >= 80% GDP in the recorded observation',
          materialTradeDeficitPressure: 'trade balance <= -5% GDP in the recorded/derived observation',
          highFiscalRiskSignal: 'repository-derived fiscal risk index >= 65/100',
          highRelativeEconomicScale: '>= 75th percentile inside an exact same-year cohort with at least five values',
          highRelativeMilitarySpendingEffort: '>= 75th percentile inside an exact same-year cohort; budget effort is not force strength',
          countrySpecificRelationParameters: 'Only relation rows that differ from the known generic parameter template are treated as country-specific game-model signals'
        },
        evidenceClasses: {
          REGISTERED_INDICATOR: 'Registered source-backed or legacy value; inspect its year and source status.',
          REPOSITORY_DERIVED_INDEX: 'Project-defined index, not an official rating.',
          SAME_YEAR_PEER_COMPARISON: 'Relative comparison among values with exactly the same metric and observation year.',
          COUNTRY_SPECIFIC_LEGACY_GAME_PARAMETER: 'Country-specific OMEGA game parameter, not an observed national statistic.',
          GAMEPLAY_SCENARIO_REGISTRY: 'Simulated gameplay asset context, not an official real-world resource statistic.',
          DATA_GAP: 'Required evidence is unavailable; no low/zero value is implied.'
        },
        mandatoryCaveats: [
          'A single latest observation is a level, not proof of improvement or deterioration over time.',
          'Missing is unknown, never zero and never automatically a strength or weakness.',
          'Operational military capability is not rated without force, equipment, readiness and logistics evidence.',
          'A trade deficit alone does not prove named-country dependency.',
          'Relative percentiles are descriptive comparisons, not official rankings.'
        ]
      },
      dataQuality: {
        rubricVersion: 'OMEGA_COUNTRY_PROFILE_RUBRIC_V2',
        profileCoverageLevel,
        availableCoreMetricCount,
        coreMetricCount: STRATEGIC_CORE_METRICS.length,
        availableGovernanceIndicatorCount: governanceIndicatorCount,
        relationProfileStatus: relationQuality,
        legacyRelationProfileRecordsInSource: relationRecordCount,
        registeredGameplaySiteSource: 'resource_site_reserve_simulation_v1.json',
        resourceSiteSourceRecordCount: reserveSiteRecordCount,
        evidenceMetricYears: metricYears,
        evidenceMetrics: metricEvidence,
        sourceFiles: [
          'countries.json', 'economy_global_profiles_v1.json', 'economy_raw_financial_data_v2.json',
          'relation_generation_engine.json', 'resource_site_reserve_simulation_v1.json'
        ],
        caveats: [
          'The legacy local economy and population baselines are labelled 2015 and are not independently revalidated by this profile builder.',
          'Current external observations carry their own observation years; cross-indicator summaries can combine different years unless a same-year check is explicitly stated.',
          'Economic influence, fiscal risk and fiscal health are repository-derived game indexes, not official rankings or ratings.',
          'Resource-site counts and reserve values belong to the gameplay scenario registry; reserve amounts are not treated as real-world national reserves.',
          'The diplomacy source includes generic default parameters for many countries; these are not described as country-specific behaviour.',
          'Operational military capability is not quantified by spending, GDP or population alone.',
          'Relative percentiles require the same metric and exact observation year; missing peer cohorts are left unranked.',
          'A single observation is not a longitudinal progress trend.',
          'Relative percentiles compare roster entities, including territories and non-sovereign entities; they are not official international rankings.'
        ]
      }
    };
  }

  return {
    profileRecords: totals.profileRecords,
    relationRecordCount,
    specificRelationParameterProfiles: totals.specificRelationParameterProfiles,
    genericRelationParameterProfiles: totals.genericRelationParameterProfiles,
    contextOnlyRelationProfiles: totals.contextOnlyRelationProfiles,
    missingRelationProfiles: totals.missingRelationProfiles,
    countriesWithCommercialResourceSites: totals.countriesWithCommercialResourceSites,
    commercialResourceSiteRecords: totals.commercialResourceSiteRecords,
    countryProfilesWithMilitarySpendingData: totals.countryProfilesWithMilitarySpendingData,
    countryProfilesWithTwoOrMoreGovernanceIndicators: totals.countryProfilesWithTwoOrMoreGovernanceIndicators,
    countryProfilesWithRichCoreCoverage: totals.countryProfilesWithRichCoreCoverage
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
  const relationDatabase = readJson('relation_generation_engine.json');
  const resourceReserveSimulation = readJson('resource_site_reserve_simulation_v1.json');
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
  const relationRows = Object.values(relationDatabase?.RELATION_GENERATION_ENGINE?.srie_v2_asymmetrical_salience || {});
  const relationByIso2 = new Map(relationRows.filter((row) => row?.country_code).map((row) => [String(row.country_code).toUpperCase(), row]));
  const resourceReserveRows = Array.isArray(resourceReserveSimulation?.records) ? resourceReserveSimulation.records : [];
  const resourceSiteSummaryByIso3 = summarizeResourceSites(resourceReserveRows);
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
  const strategicProfileCoverage = attachStrategicProfiles(rows, relationByIso2, resourceSiteSummaryByIso3, relationRows.length, resourceReserveRows.length);
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
  const canonicalIso3 = new Set(countries.map((country) => String(country.iso3 || '').toUpperCase()).filter(Boolean));
  const governanceRefresh = Object.fromEntries(METRIC_CATALOGUE
    .filter((field) => field.key.endsWith('WgiEstimate'))
    .map((field) => {
      const candidateCodes = [field.wb, ...(field.wbFallbacks || [])].filter(Boolean);
      const series = {};
      for (const code of candidateCodes) {
        const matched = [];
        for (const [iso3, indicators] of wbData.byCountry.entries()) {
          if (canonicalIso3.has(iso3) && indicators[code]) matched.push(indicators[code]);
        }
        series[code] = {
          countriesWithNumericObservation: matched.filter((row) => row.value !== null).length,
          latestObservationYear: matched.reduce((latest, row) => row.year === null ? latest : Math.max(latest ?? row.year, row.year), null),
          requestError: wbData.errors.find((error) => error.indicator === code)?.error || null
        };
      }
      const countriesWithFreshObservation = rows.filter((row) => candidateCodes.some((code) => {
        const iso3 = String(row.identity.iso3 || '').toUpperCase();
        const observation = wbData.byCountry.get(iso3)?.[code];
        return observation !== null && observation !== undefined && observation.value !== null;
      })).length;
      return [field.key, {
        preferredSeries: field.wb,
        fallbackSeries: field.wbFallbacks || [],
        series,
        countriesWithFreshObservation,
        status: countriesWithFreshObservation > 0 ? 'FRESH_OBSERVATIONS_RECEIVED' :
          (candidateCodes.some((code) => wbData.errors.some((error) => error.indicator === code)) ? 'REQUEST_FAILED_OR_PARTIAL' : 'NO_NUMERIC_OBSERVATIONS_RECEIVED')
      }];
    }));

  const metadata = {
    schemaVersion: '1.3.0',
    datasetId: 'OMEGA_COUNTRY_GENERAL_DATA_REGISTRY_V1',
    title: 'OMEGA Unified Country General Data Registry',
    description: 'Canonical common-schema registry aggregating identity, basic facts, economy, demographics, general indexes, resource context, public-safety summary and a source-aware strategic country profile for every identity in countries.json.',
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
      rawFinancialRecords: rawFinancialRows.length,
      strategicProfiles: strategicProfileCoverage.profileRecords,
      relationProfileRecords: strategicProfileCoverage.relationRecordCount,
      countrySpecificRelationParameterProfiles: strategicProfileCoverage.specificRelationParameterProfiles,
      genericDefaultRelationProfiles: strategicProfileCoverage.genericRelationParameterProfiles,
      relationContextOnlyProfiles: strategicProfileCoverage.contextOnlyRelationProfiles,
      missingRelationProfiles: strategicProfileCoverage.missingRelationProfiles,
      countriesWithCommercialGameplayResourceSites: strategicProfileCoverage.countriesWithCommercialResourceSites,
      commercialGameplayResourceSiteRecords: strategicProfileCoverage.commercialResourceSiteRecords,
      strategicProfilesWithMilitarySpendingData: strategicProfileCoverage.countryProfilesWithMilitarySpendingData,
      strategicProfilesWithTwoOrMoreGovernanceIndicators: strategicProfileCoverage.countryProfilesWithTwoOrMoreGovernanceIndicators,
      strategicProfilesWithRichCoreCoverage: strategicProfileCoverage.countryProfilesWithRichCoreCoverage
    },
    externalRefresh: {
      requested: REFRESH,
      worldBankIndicatorsLoaded: wbData.loaded,
      worldBankMetadataLoaded: wbMetadata.metadataLoaded,
      worldBankIndicatorErrors: wbData.errors,
      worldBankMetadataError: wbMetadata.metadataError,
      restCountriesLoaded: restCountries.loaded,
      restCountriesError: restCountries.error,
      governanceIndicatorRefresh: governanceRefresh,
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
      disciplineIndex: 'left null unless a defined, comparable source or an approved project-specific formula exists',
      strategicProfiles: 'Generated for every canonical identity from existing repository indicators and existing game relation/resource-site inputs; derived tendencies are labelled and are not official country ratings.',
      militaryCapability: 'Do not infer operational military strength from spending share, GDP or population alone.',
      resourceSiteSimulation: 'Gameplay resource-site counts are scenario records; simulated reserves are not treated as observed national reserves.'
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
      { id: 'relation_generation_engine.json', role: 'existing game relation salience profiles; generic default parameters are explicitly detected rather than treated as country-specific behaviour', coverage: relationRows.length, status: 'LOCAL_GAME_MODEL_NOT_INDEPENDENTLY_VERIFIED' },
      { id: 'resource_site_reserve_simulation_v1.json', role: 'existing gameplay extraction-site identities and resource types; simulated reserve amounts are not used as real-world facts', coverage: resourceReserveRows.length, status: 'SCENARIO_SIMULATION_DATA' },
      { id: 'World Bank Indicators API v2', role: 'current/latest non-empty macro, demographic, governance and selected social observations', url: 'https://api.worldbank.org/v2/', enabledBy: '--refresh-sources', status: wbData.loaded ? 'FETCHED' : 'NOT_FETCHED' },
      { id: restCountries.byIso3.sourceId || 'REST Countries API', role: 'general facts such as official name, capital, languages, currency codes, area, borders and timezones', url: restCountries.byIso3.sourceId === 'REST_COUNTRIES_GITHUB_MIRROR' ? 'https://github.com/mledoze/countries' : 'https://restcountries.com/', enabledBy: '--refresh-sources', status: restCountries.loaded ? 'FETCHED' : 'NOT_FETCHED' }
    ],
    countries: rows
  };

  // Store each country's fixed-schema groups as ordered value arrays. This keeps
  // the all-country registry compact without dropping source values. Field order
  // and all provenance dictionaries are defined in metadata.recordSchema.
  const identityFields = Object.keys(rows[0].identity);
  const factFields = Object.keys(rows[0].generalFacts);
  const resourceFields = Object.keys(rows[0].naturalResources);
  const mineralFields = Object.keys(rows[0].naturalResources.mineralResourceBase);
  const hydrocarbonFields = Object.keys(rows[0].naturalResources.hydrocarbonResourceBase);
  const energyFields = Object.keys(rows[0].naturalResources.energyResourceBase);
  const safetyFields = [
    'baselinePolice', 'observedHomicide', 'crimeRatesPer100k', 'crimeRateSources',
    'estimatedAnnualIncidents', 'fleetSummary', 'countryContext'
  ];
  const localGeographyFields = Object.keys(rows[0].localGeography);
  const dataStatusFields = Object.keys(rows[0].dataStatus);
  const statuses = [...new Set(rows.flatMap((row) => METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.status || 'MISSING')))];
  const sourceIds = [...new Set(rows.flatMap((row) => METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.sourceId || '')))];
  const sourceNames = [...new Set(rows.flatMap((row) => METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.sourceName || '')))];
  const methods = [...new Set(rows.flatMap((row) => METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.method || 'NONE')))];
  const codeOf = (list, value) => {
    if (value === null || value === undefined || value === '') return -1;
    const code = list.indexOf(value);
    return code < 0 ? -1 : code;
  };
  registry.metadata.recordSchema = {
    encoding: 'ORDERED_VALUE_ARRAYS_V1',
    description: 'Each group array follows its listed field names in order. Metric positions follow fieldCatalogue. Provenance integer codes decode with metadata.provenanceEncoding. All source observations are retained; null is never zero.',
    identityFields,
    generalFactFields: factFields,
    factSourceStatusFields: ['restCountries', 'worldBankMetadata'],
    metricFields: METRIC_CATALOGUE.map((field) => field.key),
    metricProvenanceFields: ['years', 'statusCodes', 'sourceCodes', 'sourceNameCodes', 'methodCodes', 'sourceUrls', 'notes'],
    legacySnapshotFields: ['baselineYear', 'rawFinancialRegistry', 'economyGlobalProfile'],
    rawFinancialRegistryFields: ['baselineYear', 'rawIndicatorValues', 'derivedIndicatorValues'],
    economyGlobalProfileFields: ['profileStatus', 'economyKey', 'populationKey', 'indicatorValues', 'metricAvailabilityValues', 'provenance'],
    economyGlobalProfileProvenanceFields: ['economicSource', 'populationSource', 'status', 'derivedIndicators'],
    strategicProfileFields: STRATEGIC_PROFILE_FIELDS,
    strategicProfileEncoding: 'ORDERED_VALUE_ARRAY_V1; decode each country strategicProfile array using this ordered list',
    naturalResourceFields: resourceFields,
    mineralResourceFields: mineralFields,
    hydrocarbonResourceFields: hydrocarbonFields,
    energyResourceFields: energyFields,
    publicSafetyFields: safetyFields,
    policeBaselineFields: ['activePersonnel', 'staffingRatePer100k', 'source'],
    observedHomicideFields: ['ratePer100k', 'year', 'source', 'verificationStatus'],
    fleetSummaryFields: ['totalUnits', 'replacementValueUsd', 'annualMaintenanceUsd', 'source'],
    countryContextFields: ['economyCapacityIndex', 'urbanComplexityIndex', 'roadQualityIndex', 'mountainTerrainIndex', 'coastalLogisticsIndex', 'industrialComplexityIndex', 'remoteCoverageIndex', 'terrainClass', 'contextIndexesAreMeasured', 'environmentMixPct'],
    environmentMixFields: ENVIRONMENT_MIX_KEYS,
    crimeFields: CRIME_KEYS,
    localGeographyFields,
    economicCenterFields: ['name', 'description'],
    dataStatusFields
  };
  registry.metadata.provenanceEncoding = {
    statuses,
    sourceIds,
    sourceNames,
    methods,
    missingCode: -1
  };
  registry.metadata.sharedModelNotes = {
    policePersonnel: 'MODELED_POLICY_BASELINE_NOT_OBSERVED_ROSTER',
    fleetCountsAndCosts: 'MODELED_COUNTRY_CONTEXT_AWARE_STARTING_INVENTORY',
    nonHomicideCrimeRates: 'MODELED_SIMULATION_BASELINE',
    crimeSourcePolicy: 'Only observedHomicide is marked source-observed in this local baseline. Other crime rates are modeled simulation values unless their source says otherwise.',
    resourceEmptyLists: 'An empty array means no entries were recorded in this source record; it does not prove the country has no such resource.'
  };
  registry.countries = rows.map((row) => ({
    identity: identityFields.map((key) => row.identity[key]),
    generalFacts: factFields.map((key) => key === 'factsSourceStatus'
      ? ['restCountries', 'worldBankMetadata'].map((source) => row.generalFacts.factsSourceStatus?.[source] || 'NOT_IMPORTED')
      : row.generalFacts[key]),
    metrics: METRIC_CATALOGUE.map((field) => row.metrics[field.key] ?? null),
    metricMetadata: {
      years: METRIC_CATALOGUE.map((field) => finite(row.metricMetadata[field.key]?.year)),
      statusCodes: METRIC_CATALOGUE.map((field) => codeOf(statuses, row.metricMetadata[field.key]?.status || 'MISSING')),
      sourceCodes: METRIC_CATALOGUE.map((field) => codeOf(sourceIds, row.metricMetadata[field.key]?.sourceId || '')),
      sourceNameCodes: METRIC_CATALOGUE.map((field) => codeOf(sourceNames, row.metricMetadata[field.key]?.sourceName || '')),
      methodCodes: METRIC_CATALOGUE.map((field) => codeOf(methods, row.metricMetadata[field.key]?.method || 'NONE')),
      sourceUrls: METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.sourceUrl || null),
      notes: METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.note || null)
    },
    legacySnapshots: [
      row.legacySnapshots.baselineYear,
      [
        row.legacySnapshots.rawFinancialRegistry.baselineYear,
        row.legacySnapshots.rawFinancialRegistry.rawIndicatorValues,
        row.legacySnapshots.rawFinancialRegistry.derivedIndicatorValues
      ],
      [
        row.legacySnapshots.economyGlobalProfile.profileStatus,
        row.legacySnapshots.economyGlobalProfile.economyKey,
        row.legacySnapshots.economyGlobalProfile.populationKey,
        row.legacySnapshots.economyGlobalProfile.indicatorValues,
        row.legacySnapshots.economyGlobalProfile.metricAvailabilityValues,
        [
          row.legacySnapshots.economyGlobalProfile.provenance.economicSource,
          row.legacySnapshots.economyGlobalProfile.provenance.populationSource,
          row.legacySnapshots.economyGlobalProfile.provenance.status,
          row.legacySnapshots.economyGlobalProfile.provenance.derivedIndicators
        ]
      ]
    ],
    strategicProfile: STRATEGIC_PROFILE_FIELDS.map((key) => row.strategicProfile[key]),
    naturalResources: [
      row.naturalResources.coverageStatus,
      row.naturalResources.sourceId,
      mineralFields.map((key) => row.naturalResources.mineralResourceBase[key]),
      hydrocarbonFields.map((key) => row.naturalResources.hydrocarbonResourceBase[key]),
      energyFields.map((key) => row.naturalResources.energyResourceBase[key]),
      row.naturalResources.administrativeResourceRegions,
      row.naturalResources.administrativeResourceRegionCount,
      row.naturalResources.countryNameInResourceSource,
      row.naturalResources.emptyListsMeaning
    ],
    publicSafety: [
      [row.publicSafety.baselinePolice.activePersonnel, row.publicSafety.baselinePolice.staffingRatePer100k, row.publicSafety.baselinePolice.source],
      [row.publicSafety.observedHomicide.ratePer100k, row.publicSafety.observedHomicide.year, row.publicSafety.observedHomicide.source, row.publicSafety.observedHomicide.verificationStatus],
      CRIME_KEYS.map((key) => row.publicSafety.crimeRatesPer100k[key]),
      CRIME_KEYS.map((key) => row.publicSafety.crimeRateSources[key]),
      CRIME_KEYS.map((key) => row.publicSafety.estimatedAnnualIncidents[key]),
      [row.publicSafety.fleetSummary.totalUnits, row.publicSafety.fleetSummary.replacementValueUsd, row.publicSafety.fleetSummary.annualMaintenanceUsd, row.publicSafety.fleetSummary.source],
      [
        row.publicSafety.countryContext.economyCapacityIndex, row.publicSafety.countryContext.urbanComplexityIndex,
        row.publicSafety.countryContext.roadQualityIndex, row.publicSafety.countryContext.mountainTerrainIndex,
        row.publicSafety.countryContext.coastalLogisticsIndex, row.publicSafety.countryContext.industrialComplexityIndex,
        row.publicSafety.countryContext.remoteCoverageIndex, row.publicSafety.countryContext.terrainClass,
        row.publicSafety.countryContext.contextIndexesAreMeasured,
        ENVIRONMENT_MIX_KEYS.map((key) => row.publicSafety.countryContext.environmentMixPct[key])
      ]
    ],
    localGeography: localGeographyFields.map((key) => key === 'economicCenters'
      ? (Array.isArray(row.localGeography.economicCenters) ? row.localGeography.economicCenters.map((center) => [center.name, center.description]) : null)
      : row.localGeography[key]),
    dataStatus: dataStatusFields.map((key) => key === 'basicFacts'
      ? ['restCountries', 'worldBankMetadata'].map((source) => row.dataStatus.basicFacts?.[source] || 'NOT_IMPORTED')
      : key === 'currentSourceRefresh'
        ? [row.dataStatus.currentSourceRefresh?.requested || false, row.dataStatus.currentSourceRefresh?.worldBankApi || 'NOT_REQUESTED', row.dataStatus.currentSourceRefresh?.restCountriesApi || 'NOT_REQUESTED', row.dataStatus.currentSourceRefresh?.worldBankMetadataApi || 'NOT_REQUESTED']
        : row.dataStatus[key])
  }));

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
