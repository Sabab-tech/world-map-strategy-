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
  'recommendedStrategy', 'dataQuality'
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
  { key: 'humanDevelopmentIndex', name: 'Human Development Index', unit: 'index 0-1', description: 'UNDP Human Development Report 2025; official value is for observation year 2023.' },
  { key: 'corruptionPerceptionIndex', name: 'Corruption Perceptions Index score', unit: 'score 0-100', description: 'Transparency International CPI 2025 score. Higher scores indicate lower perceived public-sector corruption.' },
  { key: 'corruptionPerceptionRank', name: 'Corruption Perceptions Index rank', unit: 'rank', description: 'Transparency International CPI 2025 rank; smaller numerical rank denotes a higher position.' },
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

async function getText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'OMEGA-Country-General-Data-Registry/1.0', 'Accept': 'text/csv,text/plain,*/*' } });
  if (!response.ok) throw new Error('HTTP_' + response.status + ' from ' + url);
  return response.text();
}

// Minimal RFC-4180-compatible parser; the registry refresh has no extra runtime dependency.
function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((value) => String(value).trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => String(value).trim() !== '')) rows.push(row);
  }
  if (quoted) throw new Error('UNDP_HDI_CSV_UNTERMINATED_QUOTED_FIELD');
  return rows;
}

async function fetchUndpHdi() {
  const sourceUrl = 'https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv';
  const sourceId = 'UNDP_HDR_2025_COMPOSITE_INDICES';
  const records = parseDelimited(await getText(sourceUrl), ',');
  if (records.length < 10) throw new Error('UNDP_HDI_CSV_TOO_FEW_ROWS');
  const headers = records[0].map((value) => String(value).replace(/^\uFEFF/, '').trim().toLowerCase());
  const isoIndex = headers.indexOf('iso3');
  const hdiIndex = headers.indexOf('hdi_2023');
  if (isoIndex < 0 || hdiIndex < 0) {
    throw new Error('UNDP_HDI_CSV_EXPECTED_COLUMNS_NOT_FOUND: ' + headers.slice(0, 12).join(','));
  }
  const byIso3 = new Map();
  for (const row of records.slice(1)) {
    const iso3 = String(row[isoIndex] || '').trim().toUpperCase();
    const value = finite(row[hdiIndex]);
    if (!/^[A-Z]{3}$/.test(iso3) || value === null || value < 0 || value > 1) continue;
    byIso3.set(iso3, { value, year: 2023, code: 'hdi_2023', sourceId, sourceUrl });
  }
  if (byIso3.size < 100) throw new Error('UNDP_HDI_CSV_TOO_FEW_VALID_COUNTRY_VALUES: ' + byIso3.size);
  return { byIso3, loaded: true, error: null, sourceId, sourceUrl, rowCount: byIso3.size, observationYear: 2023 };
}

  return { byIso3, loaded: true, error: null, sourceId, sourceUrl, rowCount: byIso3.size, observationYear: 2023 };
}

async function fetchTransparencyInternationalCpi2025() {
  // Maintained machine-readable mirror of the Transparency International CPI
  // 2025 full results table. The record stores the publisher and publication
  // page as well as the actual mirror URL so its provenance is transparent.
  const sourceUrl = 'https://raw.githubusercontent.com/loupeat/ti-cpi/main/docs/ti/CPI2025_GlobalResultsTrends.csv';
  const publisherUrl = 'https://www.transparency.org/en/cpi/2025';
  const sourceId = 'TI_CPI_2025_MIRRORED_FULL_RESULTS';
  const rows = parseDelimited(await getText(sourceUrl), ';');
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((value) => String(value).replace(/^\\uFEFF/, '').trim().toLowerCase());
    return normalized.includes('iso3') && normalized.includes('cpi score 2025') && normalized.includes('rank 2025');
  });
  if (headerIndex < 0) throw new Error('TI_CPI_2025_EXPECTED_HEADER_NOT_FOUND');
  const headers = rows[headerIndex].map((value) => String(value).replace(/^\\uFEFF/, '').trim().toLowerCase());
  const isoIndex = headers.indexOf('iso3');
  const scoreIndex = headers.indexOf('cpi score 2025');
  const rankIndex = headers.indexOf('rank 2025');
  const byIso3 = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const iso3 = String(row[isoIndex] || '').trim().toUpperCase();
    const score = finite(row[scoreIndex]);
    const rank = finite(row[rankIndex]);
    if (!/^[A-Z]{3}$/.test(iso3)) continue;
    if ((score === null || score < 0 || score > 100) && (rank === null || rank < 1)) continue;
    byIso3.set(iso3, {
      score: score !== null && score >= 0 && score <= 100 ? score : null,
      rank: rank !== null && rank >= 1 ? rank : null,
      year: 2025,
      sourceId,
      sourceUrl,
      publisherUrl
    });
  }
  if (byIso3.size < 150) throw new Error('TI_CPI_2025_TOO_FEW_VALID_COUNTRY_VALUES: ' + byIso3.size);
  return { byIso3, loaded: true, error: null, sourceId, sourceUrl, publisherUrl, rowCount: byIso3.size, observationYear: 2025 };
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
    method: 'NONE', indicatorCode: null, sourceUrl: null,
    note: field.key === 'disciplineIndex' ? 'No universal comparable country-level discipline index exists in the currently loaded source set.' : null
  }]));
  const set = (key, value, year, sourceId, sourceName, status, method = 'LEGACY_VALUE') => {
    if (value === undefined || value === null || value === '' || finite(value) === null) return;
    values[key] = finite(value);
    meta[key] = {
      year: finite(year), sourceId: sourceId || null, sourceName: sourceName || null,
      status, method, indicatorCode: status === 'WORLD_BANK_API_OBSERVATION' ? (METRIC_CATALOGUE.find((field) => field.key === key)?.wb || null) : null,
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

function decodePreviousRegistryRecord(row, previousRegistry) {
  const recordSchema = previousRegistry?.metadata?.recordSchema;
  if (!row || !recordSchema || !Array.isArray(row.identity)) return row;
  const asObject = (keys, values) => Object.fromEntries(keys.map((key, index) => [
    key, Array.isArray(values) && values[index] !== undefined ? values[index] : null
  ]));
  const identity = asObject(recordSchema.identityFields || [], row.identity);
  const facts = asObject(recordSchema.generalFactFields || [], row.generalFacts);
  if (Array.isArray(facts.factsSourceStatus)) {
    facts.factsSourceStatus = asObject(recordSchema.factSourceStatusFields || ['restCountries', 'worldBankMetadata'], facts.factsSourceStatus);
  }
  const fields = recordSchema.metricFields || (previousRegistry.fieldCatalogue || []).map((field) => field.key);
  const metrics = asObject(fields, row.metrics);
  const sourceMap = previousRegistry.metadata.provenanceEncoding || {};
  const decode = (items, code) => Number.isInteger(code) && code >= 0 ? (items?.[code] ?? null) : null;
  const compactMeta = row.metricMetadata || {};
  const metricMetadata = Object.fromEntries(fields.map((key, index) => [key, {
    year: finite(compactMeta.years?.[index]),
    status: decode(sourceMap.statuses, compactMeta.statusCodes?.[index]) || 'MISSING',
    sourceId: decode(sourceMap.sourceIds, compactMeta.sourceCodes?.[index]) || null,
    sourceName: decode(sourceMap.sourceNames, compactMeta.sourceNameCodes?.[index]) || null,
    method: decode(sourceMap.methods, compactMeta.methodCodes?.[index]) || null,
    indicatorCode: compactMeta.indicatorCodes?.[index] || previousRegistry.fieldCatalogue?.[index]?.wb || null,
    sourceUrl: compactMeta.sourceUrls?.[index] || null,
    note: compactMeta.notes?.[index] || null
  }]));
  return { ...row, identity, generalFacts: facts, metrics, metricMetadata };
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
    const oldSourcedHdi = existingMeta?.status === 'UNDP_HDR_OBSERVATION';
    const priorValue = finite(priorMetrics[field.key]);
    // Keep the previously stored value whenever the current local sources are
    // silent. Also keep sourced observations first, so an API outage cannot erase
    // them; a newer verified source observation may replace them below.
    if (priorValue !== null &&
        (oldOfficial || oldSourcedHdi || finite(metrics[field.key]) === null)) {
      metrics[field.key] = priorValue;
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

  // HDI is published by UNDP rather than the World Bank WDI API.
  if (refreshData.undpHdi) {
    const hdiObservation = refreshData.undpHdi.byIso3.get(String(country.iso3 || '').toUpperCase());
    if (hdiObservation && hdiObservation.value !== null) {
      const priorYear = finite(metricMetadata.humanDevelopmentIndex?.year);
      if (metrics.humanDevelopmentIndex === null || priorYear === null || hdiObservation.year >= priorYear) {
        metrics.humanDevelopmentIndex = hdiObservation.value;
        metricMetadata.humanDevelopmentIndex = {
          year: hdiObservation.year,
          sourceId: hdiObservation.sourceId,
          sourceName: 'United Nations Development Programme, Human Development Report 2025',
          status: 'UNDP_HDR_OBSERVATION',
          method: 'SOURCE_OBSERVATION',
          indicatorCode: hdiObservation.code,
          sourceUrl: hdiObservation.sourceUrl,
          note: 'Official HDI value from UNDP HDR 2025 composite-index time series; observation year 2023, not publication or simulation year.'
        };
      }
    } else if (REFRESH && metrics.humanDevelopmentIndex === null) {
      metricMetadata.humanDevelopmentIndex = {
        year: null,
        sourceId: refreshData.undpHdi.error ? refreshData.undpHdi.sourceId || 'UNDP_HDR_2025_COMPOSITE_INDICES' : null,
        sourceName: refreshData.undpHdi.error ? 'United Nations Development Programme, Human Development Reports' : null,
        status: refreshData.undpHdi.error ? 'SOURCE_REFRESH_FAILED' : 'NO_SOURCE_OBSERVATION',
        method: 'API_REFRESH_DIAGNOSTIC',
        indicatorCode: 'hdi_2023',
        sourceUrl: refreshData.undpHdi.sourceUrl || 'https://hdr.undp.org/data-center/documentation-and-downloads',
        note: refreshData.undpHdi.error
          ? 'Official UNDP HDI feed could not be refreshed: ' + refreshData.undpHdi.error
          : 'No matching ISO3 observation was available in the official UNDP HDI 2023 data. Unknown is not zero.'
      };
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
  const valid = rows.map((row) => ({
    iso3: String(row.identity?.iso3 || '').toUpperCase(),
    value: finite(row.metrics?.[key])
  })).filter((row) => row.iso3 && row.value !== null).sort((a, b) => a.value - b.value);
  const out = new Map();
  if (!valid.length) return out;
  if (valid.length === 1) {
    out.set(valid[0].iso3, 50);
    return out;
  }
  let start = 0;
  while (start < valid.length) {
    let end = start + 1;
    while (end < valid.length && valid[end].value === valid[start].value) end += 1;
    const midRank = (start + end - 1) / 2;
    const percentile = Number((midRank / (valid.length - 1) * 100).toFixed(1));
    for (let index = start; index < end; index += 1) out.set(valid[index].iso3, percentile);
    start = end;
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
  const percentile = (row, key) => percentileMaps[key]?.get(String(row.identity?.iso3 || '').toUpperCase()) ?? null;
  const governancePercentiles = Object.fromEntries(GOVERNANCE_METRIC_KEYS.map((key) => [key, metricPercentileMap(rows, key)]));
  const governanceScore = (row) => {
    const iso3 = String(row.identity?.iso3 || '').toUpperCase();
    const available = GOVERNANCE_METRIC_KEYS
      .map((key) => governancePercentiles[key].get(iso3))
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
      economicInfluenceIndex: n('economicInfluenceIndex'),
      economicInfluencePercentile: economicInfluencePercentile,
      foreignExchangeReservePercentile: percentile(row, 'fxReservesUsd'),
      fiscalRiskIndex: fiscalRisk,
      fiscalHealthIndex: fiscalHealth,
      governanceQualityPercentile: governanceQualityPercentile,
      defenseFinancialBasePercentile: gdpPercentile,
      defenseExpenditureSharePercentile: defenseEffortPercentile,
      populationScalePercentile: populationPercentile,
      politicalStabilityWgiEstimate: n('politicalStabilityWgiEstimate')
    };
    const resourceContextSignals = uniqueStrings([
      ...Object.values(resourceContext.mineralResourceBase || {}).flatMap((value) => Array.isArray(value) ? value : []),
      ...Object.values(resourceContext.hydrocarbonResourceBase || {}).flatMap((value) => Array.isArray(value) ? value : []),
      ...Object.values(resourceContext.energyResourceBase || {}).flatMap((value) => Array.isArray(value) ? value : [])
    ]).sort();
    const economicProfile = {
      scores,
      tradePosition: n('tradeBalanceToGdpPct') === null ? 'UNKNOWN' :
        (n('tradeBalanceToGdpPct') > 0 ? 'RECORDED_SURPLUS' : (n('tradeBalanceToGdpPct') < 0 ? 'RECORDED_DEFICIT' : 'RECORDED_BALANCE')),
      sectorProfile: sectorDataForProfile,
      recordedResourceContext: {
        categories: resourceContextSignals,
        sourceStatus: row.naturalResources?.coverageStatus || 'NO_RESOURCE_CONTEXT_RECORD',
        interpretation: 'These are categories recorded in the current game context; empty or repeated lists do not prove real-world absence or country-specific abundance.'
      },
      gameplayResourceAssets: resourceSites,
      strengths: economicStrengths,
      vulnerabilities: economicVulnerabilities
    };
    const politicalProfile = {
      politicalSystemClassification,
      democracyIndex: n('democracyIndex'),
      politicalStabilityWgiEstimate: n('politicalStabilityWgiEstimate'),
      governmentEffectivenessWgiEstimate: n('governmentEffectivenessWgiEstimate'),
      ruleOfLawWgiEstimate: n('ruleOfLawWgiEstimate'),
      controlOfCorruptionWgiEstimate: n('controlOfCorruptionWgiEstimate'),
      voiceAccountabilityWgiEstimate: n('voiceAccountabilityWgiEstimate'),
      governanceQualityPercentile: governanceQualityPercentile,
      availableGovernanceIndicatorCount: governanceIndicatorCount,
      strengths: politicalStrengths,
      risks: politicalRisks,
      caveat: 'No regime type or political ideology is assigned unless the general registry contains a named, dated source for it.'
    };
    const militaryProfile = {
      capabilityStatus: 'OPERATIONAL_CAPABILITY_NOT_MEASURED_BY_GENERAL_REGISTRY',
      militaryExpenditurePctGdp: n('militaryExpenditurePctGdp'),
      expenditureObservationYear: finite(metricMeta.militaryExpenditurePctGdp?.year),
      expenditureSharePercentile: defenseEffortPercentile,
      financialBasePercentile: gdpPercentile,
      populationScalePercentile: populationPercentile,
      gameModelMilitarySignals: specificModelParameters
        ? Object.fromEntries(Object.entries(relationParams).filter(([key]) => /MIL_|DEFEN[CS]E|ARMY|NAVY|AIR_FORCE|MOBILIZATION/i.test(key)))
        : {},
      strengthSignals: defenseSignals,
      riskSignals: defenseRisks,
      caveat: 'Military spending share, national economic scale and population are separate indicators; none is a substitute for force structure, readiness, equipment and logistics data.'
    };
    const diplomaticProfile = {
      evidenceMode: specificModelParameters ? 'COUNTRY_SPECIFIC_LEGACY_GAME_PARAMETERS' :
        (relationQuality === 'NO_LEGACY_RELATION_PROFILE' ? 'DATA_DERIVED_WITH_NO_LEGACY_RELATION_ROW' : 'INFERENCE_OR_CATEGORY_ONLY'),
      legacyCategory: relation?.category || null,
      strategicDriver: strategicDriver,
      highWeightFocus: explicitPriorities,
      lowWeightIgnore: explicitLowPriority,
      tendencies: uniqueStrings(diplomaticTendencies),
      parameters: specificModelParameters ? relationParams : {},
      relationProfileStatus: relationQuality,
      caveat: 'The legacy relation registry is a game model, not a verified measurement of current diplomatic behaviour, friendship or alliance reliability.'
    };

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
      profileVersion: 'OMEGA_COUNTRY_STRATEGIC_PROFILE_V1',
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
        modelSignals: dependencySignals,
        interpretationPolicy: 'Only country-specific legacy parameters are presented as modelled dependencies; general macro signals are labelled as pressure signals, not proof of dependence on a named state.'
      },
      overallStrengths,
      overallWeaknesses,
      playerAdvantages,
      playerChallenges,
      recommendedStrategy,
      dataQuality: {
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
          'The general registry does not quantify operational military capability, force readiness or equipment quality.',
          'Relative percentiles compare all entries in countries.json, including territories and non-sovereign entities; they are not official international rankings.'
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
  // Decode fixed-schema arrays before lookup; otherwise prior ISO3 values and
  // official observations are silently missed during subsequent refreshes.
  const previousRows = (previousData?.countries || []).map((row) => decodePreviousRegistryRecord(row, previousData));
  const priorCountryByIso3 = new Map(previousRows
    .map((row) => [String(row.identity?.iso3 || '').toUpperCase(), row])
    .filter(([iso3]) => iso3));
  const sources = { profileByIso3, rawFinanceByIso3, policeByIso3, resourceByCountryId, resourceByCountryName, cityByName, economyByKey, populationByKey, rawFinancialIndicatorKeys, rawFinancialDerivedKeys, profileIndicatorKeys: PROFILE_INDICATOR_KEYS };
  let restCountries = { byIso3: new Map(), loaded: false, error: null };
  let wbMetadata = { metadataByIso2: new Map(), metadataByIso3: new Map(), metadataLoaded: false, metadataError: null };
  let wbData = { byCountry: new Map(), errors: [], loaded: false };
  let undpHdi = {
    byIso3: new Map(), loaded: false, error: null,
    sourceId: 'UNDP_HDR_2025_COMPOSITE_INDICES',
    sourceUrl: 'https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv',
    rowCount: 0, observationYear: 2023
  };
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
    try { undpHdi = await fetchUndpHdi(); }
    catch (error) { undpHdi.error = String(error); console.error('UNDP HDI refresh failed:', String(error)); }
  }
  const refreshData = {
    restCountries,
    undpHdi,
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
          countriesWithNumericObservation: matched.length,
          latestObservationYear: matched.reduce((latest, row) => row.year === null ? latest : Math.max(latest ?? row.year, row.year), null),
          requestError: wbData.errors.find((error) => error.indicator === code)?.error || null
        };
      }
      const countriesWithFreshObservation = rows.filter((row) => candidateCodes.some((code) => {
        const iso3 = String(row.identity.iso3 || '').toUpperCase();
        return wbData.byCountry.get(iso3)?.[code]?.value !== null && wbData.byCountry.get(iso3)?.[code] !== undefined;
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
    schemaVersion: '1.2.0',
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
      undpHdi: {
        loaded: undpHdi.loaded,
        error: undpHdi.error,
        sourceId: undpHdi.sourceId,
        sourceUrl: undpHdi.sourceUrl,
        observationYear: undpHdi.observationYear,
        sourceRowsWithNumericHdi: undpHdi.rowCount,
        canonicalCountriesWithHdi: rows.filter((row) => undpHdi.byIso3.has(String(row.identity.iso3 || '').toUpperCase())).length
      },
      governanceIndicatorRefresh: governanceRefresh,
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
      { id: 'UNDP Human Development Report 2025 composite-index time series', role: 'official human development index; observation year 2023', url: undpHdi.sourceUrl, enabledBy: '--refresh-sources', status: undpHdi.loaded ? 'FETCHED' : (undpHdi.error ? 'FAILED' : 'NOT_FETCHED'), observationYear: undpHdi.observationYear, matchedRows: undpHdi.rowCount },
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
    metricProvenanceFields: ['years', 'statusCodes', 'sourceCodes', 'sourceNameCodes', 'methodCodes', 'indicatorCodes', 'sourceUrls', 'notes'],
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
      indicatorCodes: METRIC_CATALOGUE.map((field) => row.metricMetadata[field.key]?.indicatorCode || null),
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
