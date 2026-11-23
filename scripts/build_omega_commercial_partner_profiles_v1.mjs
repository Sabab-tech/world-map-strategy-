import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const RELEASE = '202601';
const HS_REVISION = 'HS22';
const INPUT_YEARS = [2022, 2023, 2024];
const BASELINE_YEARS = [2022, 2023];
const PROVISIONAL_YEAR = 2024;
const COUNTRY_CONTEXT_FILE = 'resource_country_resource_context_index.json';
const ECONOMY_RULES_FILE = 'resource_economy_rules.json';
const HS_MAPPING_FILE = 'omega_commercial_hs22_resource_mapping_v1.json';

function parseCsvRecord(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV_QUOTE_NOT_CLOSED');
  fields.push(field);
  if (fields.length) fields[0] = fields[0].replace(/^\uFEFF/, '');
  return fields;
}

function normalizeHeader(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeNumericCode(value, label) {
  let text = String(value ?? '').trim();
  if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, '');
  if (!/^\d+$/.test(text)) throw new Error(label + '_INVALID_NUMERIC_CODE:' + text);
  return String(Number(text));
}

function normalizeHs6(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{6}$/.test(text)) throw new Error('HS6_CODE_INVALID:' + text);
  return text;
}

function finitePositive(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(label + '_MISSING');
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) throw new Error(label + '_MUST_BE_POSITIVE');
  return number;
}

function headerIndexes(header, aliases) {
  const normalized = header.map(normalizeHeader);
  const indexes = {};
  for (const [field, names] of Object.entries(aliases)) {
    indexes[field] = normalized.findIndex(value => names.includes(value));
  }
  return indexes;
}

async function* csvRows(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    yield { fields: parseCsvRecord(line), lineNumber };
  }
}

async function readCountryCrosswalk(dataDir, coreCountryIds) {
  const filePath = path.join(dataDir, 'country_codes_V202601.csv');
  const iterator = csvRows(filePath)[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) throw new Error('COUNTRY_CROSSWALK_EMPTY');

  const header = first.value.fields;
  const index = headerIndexes(header, {
    code: ['countrycode', 'bacicountrycode', 'code'],
    iso3: ['iso3', 'iso3code', 'iso3digitalpha', 'countryiso3']
  });
  const hasHeader = index.code >= 0 && index.iso3 >= 0;
  const codeIndex = hasHeader ? index.code : 0;
  const iso3Index = hasHeader ? index.iso3 : 4;
  if (!hasHeader && header.length < 5) throw new Error('COUNTRY_CROSSWALK_SCHEMA_UNRECOGNISED');

  const crosswalk = new Map();
  const add = fields => {
    if (fields.length <= Math.max(codeIndex, iso3Index)) throw new Error('COUNTRY_CROSSWALK_ROW_TOO_SHORT');
    const codeText = String(fields[codeIndex] ?? '').trim();
    if (!codeText) return;
    const code = normalizeNumericCode(codeText, 'BACI_COUNTRY_CODE');
    const rawIso3 = String(fields[iso3Index] ?? '').trim().toUpperCase();
    const iso3 = /^[A-Z]{3}$/.test(rawIso3) ? rawIso3 : null;
    if (crosswalk.has(code) && crosswalk.get(code) !== iso3) {
      throw new Error('BACI_COUNTRY_CODE_CROSSWALK_COLLISION:' + code);
    }
    crosswalk.set(code, iso3);
  };

  if (!hasHeader) add(header);
  for await (const row of iterator) add(row.fields);
  if (!crosswalk.size) throw new Error('COUNTRY_CROSSWALK_HAS_NO_CODES');

  const mappedCoreCountryIds = new Set([...crosswalk.values()].filter(iso3 => iso3 && coreCountryIds.has(iso3)));
  const unmappedCoreCountryIds = [...coreCountryIds].filter(iso3 => !mappedCoreCountryIds.has(iso3)).sort();
  const coreCodeCount = [...crosswalk.values()].filter(iso3 => iso3 && coreCountryIds.has(iso3)).length;
  return { crosswalk, coreCodeCount, mappedCoreCountryIds, unmappedCoreCountryIds, file: filePath };
}

async function readProductCodeSet(dataDir, hsMapping) {
  const filePath = path.join(dataDir, 'product_codes_HS22_V202601.csv');
  const iterator = csvRows(filePath)[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) throw new Error('HS22_PRODUCT_METADATA_EMPTY');

  const header = first.value.fields;
  const index = headerIndexes(header, {
    code: ['productcode', 'hs6', 'hs6code', 'code', 'k'],
    name: ['productname', 'description', 'name']
  });
  const hasHeader = index.code >= 0;
  const codeIndex = hasHeader ? index.code : 0;
  const productCodes = new Set();
  const add = fields => {
    if (fields.length <= codeIndex) throw new Error('HS22_PRODUCT_METADATA_ROW_TOO_SHORT');
    const codeText = String(fields[codeIndex] ?? '').trim();
    if (!codeText || !/^\d/.test(codeText)) return;
    productCodes.add(normalizeHs6(codeText));
  };

  if (!hasHeader) add(header);
  for await (const row of iterator) add(row.fields);
  if (!productCodes.size) throw new Error('HS22_PRODUCT_METADATA_HAS_NO_CODES');

  const required = new Set();
  for (const row of Object.values(hsMapping.resources)) {
    if (row.status === 'MAPPED_EXACT') row.codes.forEach(code => required.add(code));
  }
  const absent = [...required].filter(code => !productCodes.has(code));
  if (absent.length) throw new Error('EXACT_HS22_CODES_MISSING_FROM_OFFICIAL_PRODUCT_METADATA:' + absent.join(','));
  return { productCodes, file: filePath };
}

function resolveFlowSchema(fields) {
  const indexes = headerIndexes(fields, {
    year: ['t', 'year'],
    exporter: ['i', 'exporter', 'exportercode'],
    importer: ['j', 'importer', 'importercode'],
    hs6: ['k', 'product', 'productcode', 'hs6', 'hs6code'],
    value: ['v', 'value', 'tradevalue'],
    quantity: ['q', 'quantity', 'tradequantity']
  });
  if (Object.values(indexes).every(index => index >= 0)) {
    return { indexes, hasHeader: true };
  }

  const values = fields.map(value => String(value ?? '').trim());
  if (!/^20\d{2}$/.test(values[0] || '')) throw new Error('BACI_FLOW_HEADER_NOT_RECOGNISED');
  if (values.length !== 6) throw new Error('BACI_FLOW_ROW_MUST_HAVE_SIX_FIELDS');
  const secondIsHs6 = /^\d{6}$/.test(values[1] || '');
  const fourthIsHs6 = /^\d{6}$/.test(values[3] || '');
  if (secondIsHs6 === fourthIsHs6) throw new Error('BACI_FLOW_POSITIONAL_SCHEMA_AMBIGUOUS');
  return {
    hasHeader: false,
    indexes: secondIsHs6
      ? { year: 0, hs6: 1, exporter: 2, importer: 3, value: 4, quantity: 5 }
      : { year: 0, exporter: 1, importer: 2, hs6: 3, value: 4, quantity: 5 }
  };
}

function exactResourceCodeIndex(hsMapping) {
  const byCode = new Map();
  for (const [resourceId, row] of Object.entries(hsMapping.resources || {})) {
    if (row.status !== 'MAPPED_EXACT') continue;
    for (const code of row.codes || []) {
      if (byCode.has(code)) throw new Error('EXACT_HS6_CODE_SHARED_ACROSS_RESOURCES:' + code);
      byCode.set(code, resourceId);
    }
  }
  if (!byCode.size) throw new Error('NO_EXACT_HS22_RESOURCE_CODES');
  return byCode;
}

function addFlow(aggregates, countryId, resourceId, year, partnerIso3, partnerKind, value) {
  if (!aggregates[countryId]) aggregates[countryId] = Object.create(null);
  if (!aggregates[countryId][resourceId]) aggregates[countryId][resourceId] = Object.create(null);
  if (!aggregates[countryId][resourceId][year]) {
    aggregates[countryId][resourceId][year] = {
      partners: Object.create(null),
      unresolvedValue: 0,
      rowCount: 0
    };
  }
  const bucket = aggregates[countryId][resourceId][year];
  bucket.rowCount++;
  if (!partnerIso3) {
    bucket.unresolvedValue += value;
    return;
  }
  if (!bucket.partners[partnerIso3]) {
    bucket.partners[partnerIso3] = { value: 0, partnerKind };
  }
  bucket.partners[partnerIso3].value += value;
}

function summarizeShares(buckets, years, coreCountryIds) {
  let totalValue = 0;
  let unresolvedValue = 0;
  const partnerValues = Object.create(null);
  const observedYears = [];
  for (const year of years) {
    const bucket = buckets[year];
    if (!bucket || (!bucket.rowCount && !bucket.unresolvedValue)) continue;
    observedYears.push(year);
    unresolvedValue += bucket.unresolvedValue;
    for (const [iso3, row] of Object.entries(bucket.partners)) {
      if (!partnerValues[iso3]) partnerValues[iso3] = { value: 0 };
      partnerValues[iso3].value += row.value;
    }
  }
  for (const row of Object.values(partnerValues)) totalValue += row.value;
  totalValue += unresolvedValue;
  if (!(totalValue > 0)) {
    return {
      status: 'NO_POSITIVE_FLOW_RECORDED_REPORTING_COVERAGE_UNKNOWN',
      observedYears: [],
      partnerShares: [],
      unresolvedPartnerShare: null,
      coverage: { partnerCount: 0, unresolvedPartnerFlowCount: 0 }
    };
  }
  const partnerShares = Object.keys(partnerValues).map(iso3 => ({
    partnerIso3: iso3,
    partnerKind: coreCountryIds.has(iso3) ? 'CORE_COUNTRY' : 'EXTERNAL_MARKET',
    share: Number((partnerValues[iso3].value / totalValue).toFixed(12))
  })).sort((a, b) => b.share - a.share || a.partnerIso3.localeCompare(b.partnerIso3));
  const unresolvedPartnerShare = Number((unresolvedValue / totalValue).toFixed(12));
  return {
    status: observedYears.length === years.length ? 'OBSERVED_POSITIVE_FLOWS' : 'OBSERVED_PARTIAL_YEAR_COVERAGE',
    observedYears: observedYears,
    partnerShares: partnerShares,
    unresolvedPartnerShare: unresolvedPartnerShare,
    coverage: {
      partnerCount: partnerShares.length,
      unresolvedPartnerFlowCount: unresolvedValue > 0 ? 1 : 0
    }
  };
}

export async function buildCommercialPartnerProfiles({ dataDir }) {
  if (!dataDir) throw new Error('DATA_DIR_REQUIRED');
  const root = path.resolve(dataDir);
  const sourceFiles = INPUT_YEARS.map(year => 'BACI_HS22_Y' + year + '_V' + RELEASE + '.csv');
  const economyRules = JSON.parse(await fs.readFile(new URL('../' + ECONOMY_RULES_FILE, import.meta.url), 'utf8'));
  const countryContext = JSON.parse(await fs.readFile(new URL('../' + COUNTRY_CONTEXT_FILE, import.meta.url), 'utf8'));
  const hsMapping = JSON.parse(await fs.readFile(new URL('../' + HS_MAPPING_FILE, import.meta.url), 'utf8'));
  if (hsMapping.source?.release !== RELEASE || hsMapping.source?.hsRevision !== HS_REVISION) {
    throw new Error('HS_MAPPING_RELEASE_OR_REVISION_MISMATCH');
  }

  const coreCountryIds = new Set(Object.keys(countryContext.countries || {}));
  if (coreCountryIds.size !== 197) throw new Error('CORE_COUNTRY_ROSTER_COUNT_MISMATCH');
  const resourceProfiles = economyRules.demand?.resourceProfiles || {};
  if (Object.keys(resourceProfiles).length !== 41) throw new Error('RAW_RESOURCE_ROSTER_COUNT_MISMATCH');

  const { crosswalk, coreCodeCount, mappedCoreCountryIds, unmappedCoreCountryIds } =
    await readCountryCrosswalk(root, coreCountryIds);
  const { productCodes } = await readProductCodeSet(root, hsMapping);
  const codeToResource = exactResourceCodeIndex(hsMapping);
  const aggregates = Object.create(null);
  let validFlowRows = 0;
  let selectedFlowRows = 0;
  let unresolvedPartnerFlowRows = 0;
  let unresolvedImporterFlowRows = 0;
  let nonCoreImporterFlowRows = 0;
  let selfFlowRows = 0;

  for (const year of INPUT_YEARS) {
    const fileName = 'BACI_HS22_Y' + year + '_V' + RELEASE + '.csv';
    const filePath = path.join(root, fileName);
    const iterator = csvRows(filePath)[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done) throw new Error('BACI_ANNUAL_FILE_EMPTY:' + fileName);
    const schema = resolveFlowSchema(first.value.fields);
    if (!schema.hasHeader) {
      // The first row is a data record and is processed below after schema selection.
      iterator.firstDataRow = first.value;
    }
    const processRow = ({ fields, lineNumber }) => {
      const ix = schema.indexes;
      if (fields.length <= Math.max(ix.year, ix.exporter, ix.importer, ix.hs6, ix.value, ix.quantity)) {
        throw new Error(fileName + '_ROW_TOO_SHORT_AT_LINE_' + lineNumber);
      }
      const rowYear = Number(String(fields[ix.year] || '').trim());
      if (rowYear !== year) throw new Error(fileName + '_ROW_YEAR_MISMATCH_AT_LINE_' + lineNumber);
      const hs6 = normalizeHs6(fields[ix.hs6]);
      if (!productCodes.has(hs6)) throw new Error(fileName + '_HS6_NOT_IN_HS22_PRODUCT_METADATA:' + hs6);
      const resourceId = codeToResource.get(hs6);
      validFlowRows++;
      if (!resourceId) return;
      const exporterCode = normalizeNumericCode(fields[ix.exporter], 'BACI_EXPORTER_CODE');
      const importerCode = normalizeNumericCode(fields[ix.importer], 'BACI_IMPORTER_CODE');
      if (exporterCode === importerCode) {
        selfFlowRows++;
        throw new Error('BACI_202601_CONTAINS_SELF_FLOW_AT_' + fileName + '_LINE_' + lineNumber);
      }
      const importerIso3 = crosswalk.get(importerCode);
      if (!importerIso3) {
        unresolvedImporterFlowRows++;
        return;
      }
      if (!coreCountryIds.has(importerIso3)) {
        nonCoreImporterFlowRows++;
        return;
      }
      const exporterIso3 = crosswalk.get(exporterCode) || null;
      const value = finitePositive(fields[ix.value], 'BACI_TRADE_VALUE');
      if (!exporterIso3) unresolvedPartnerFlowRows++;
      addFlow(aggregates, importerIso3, resourceId, year, exporterIso3,
        exporterIso3 && coreCountryIds.has(exporterIso3) ? 'CORE_COUNTRY' : 'EXTERNAL_MARKET', value);
      selectedFlowRows++;
    };
    if (!schema.hasHeader) processRow(first.value);
    for await (const row of iterator) processRow(row);
  }

  const resourceIds = Object.keys(hsMapping.resources).sort();
  const exactResourceIds = resourceIds
    .filter(resourceId => hsMapping.resources[resourceId].status === 'MAPPED_EXACT');
  const notEligibleProfile = {
    profileStatus: 'NOT_ELIGIBLE_MAPPING_STATUS',
    observedYears: [],
    partnerShares: [],
    unresolvedPartnerShare: null,
    coverage: { partnerCount: 0, unresolvedPartnerFlowCount: null }
  };
  const countries = {};
  for (const countryId of [...coreCountryIds].sort()) {
    const resourceProfilesByCountry = {};
    for (const resourceId of resourceIds) {
      const mapping = hsMapping.resources[resourceId];
      if (mapping.status !== 'MAPPED_EXACT') {
        resourceProfilesByCountry[resourceId] = {
          mappingStatus: mapping.status,
          partnerProfileEligibility: 'NOT_ELIGIBLE_MAPPING_STATUS',
          baselineYears: BASELINE_YEARS,
          baseline: { status: 'NOT_CALCULATED_MAPPING_NOT_EXACT', ...notEligibleProfile },
          provisional2024: { status: 'NOT_CALCULATED_MAPPING_NOT_EXACT', ...notEligibleProfile }
        };
        continue;
      }
      const buckets = aggregates[countryId]?.[resourceId] || Object.create(null);
      const baseline = summarizeShares(buckets, BASELINE_YEARS, coreCountryIds);
      const provisional = summarizeShares(buckets, [PROVISIONAL_YEAR], coreCountryIds);
      const profileStatus = baseline.status === 'OBSERVED_POSITIVE_FLOWS'
        || baseline.status === 'OBSERVED_PARTIAL_YEAR_COVERAGE'
        ? 'OBSERVED_2022_2023_BASELINE'
        : provisional.status === 'OBSERVED_POSITIVE_FLOWS'
          ? 'PROVISIONAL_2024_ONLY'
          : 'NO_POSITIVE_FLOW_RECORDED_REPORTING_COVERAGE_UNKNOWN';
      resourceProfilesByCountry[resourceId] = {
        mappingStatus: 'MAPPED_EXACT',
        partnerProfileEligibility: 'EXACT_HS22_CODE_BILATERAL_SOURCE_REQUIRED',
        profileStatus: profileStatus,
        baselineYears: BASELINE_YEARS,
        baseline: baseline,
        provisional2024: provisional
      };
    }
    countries[countryId] = { resourceProfiles: resourceProfilesByCountry };
  }

  return {
    schemaVersion: 1,
    datasetId: 'OMEGA_COMMERCIAL_PARTNER_PROFILES_V1',
    profileType: 'HISTORICAL_PARTNER_STRUCTURE_ONLY',
    source: {
      name: 'CEPII BACI',
      release: RELEASE,
      hsRevision: HS_REVISION,
      inputYears: INPUT_YEARS,
      baselineYears: BASELINE_YEARS,
      provisionalYear: PROVISIONAL_YEAR,
      license: 'Etalab Open Licence 2.0',
      officialDatasetPage: 'https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html',
      annualFiles: sourceFiles,
      countryCrosswalkFile: 'country_codes_V202601.csv',
      hsProductMetadataFile: 'product_codes_HS22_V202601.csv',
      tradeValueBasis: 'BACI_V_THOUSANDS_CURRENT_USD_USED_ONLY_FOR_NORMALIZED_SHARE_WEIGHTS',
      tradeQuantityBasis: 'BACI_Q_METRIC_TONNES_NOT_USED',
      provisionalYearNote: 'CEPII notes the latest year may be incomplete and revised in later releases.'
    },
    authorities: {
      coreCountryRoster: COUNTRY_CONTEXT_FILE,
      resourceProfiles: ECONOMY_RULES_FILE,
      resourceHs6Mappings: HS_MAPPING_FILE
    },
    policies: {
      acceptedResourceMappingStatus: 'MAPPED_EXACT',
      externalPartnersRemainExternal: true,
      unknownPartnerCodeSharePreserved: true,
      noPartnerValueOrQuantityRetained: true,
      noPriceRetained: true,
      noGameStateMutation: true,
      noInventoryContractShipmentOrFinanceMutation: true,
      noNpcSimulationMutation: true,
      baselineSharesUseAggregated2022And2023TradeValue: true,
      2024IsProvisionalOnly: true,
      noPositiveFlowMustNotBeTreatedAsZero: true
    },
    coverage: {
      coreCountryCount: coreCountryIds.size,
      rawResourceCount: Object.keys(resourceProfiles).length,
      exactHsMappedResourceCount: exactResourceIds.length,
      mappedBaciCountryCodeCount: coreCodeCount,
      mappedCoreCountryCount: mappedCoreCountryIds.size,
      unmappedCoreCountryIds: unmappedCoreCountryIds,
      resourceProfileSlotCount: coreCountryIds.size * resourceIds.length,
      validBaciFlowRowCount: validFlowRows,
      selectedExactResourceFlowRowCount: selectedFlowRows,
      unresolvedPartnerFlowRowCount: unresolvedPartnerFlowRows,
      unresolvedImporterFlowRowCount: unresolvedImporterFlowRows,
      nonCoreImporterFlowRowCount: nonCoreImporterFlowRows,
      selfFlowRowCount: selfFlowRows,
      partnerProfileReady: selectedFlowRows > 0
    },
    countries: countries
  };
}

function parseCli(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!value || !['--data-dir', '--output'].includes(flag)) throw new Error('CLI_ARGS_INVALID');
    parsed[flag] = value;
  }
  if (!parsed['--data-dir'] || !parsed['--output']) {
    throw new Error('USAGE: node scripts/build_omega_commercial_partner_profiles_v1.mjs --data-dir PATH --output NEW_FILE.json');
  }
  return parsed;
}

async function main() {
  const args = parseCli(process.argv.slice(2));
  const outputPath = path.resolve(args['--output']);
  try {
    await fs.access(outputPath);
    throw new Error('OUTPUT_ALREADY_EXISTS_REFUSING_OVERWRITE:' + outputPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const output = await buildCommercialPartnerProfiles({ dataDir: args['--data-dir'] });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log('OMEGA commercial partner profile build completed.');
  console.log('Countries:', output.coverage.coreCountryCount);
  console.log('Exact-mapped raw resources:', output.coverage.exactHsMappedResourceCount);
  console.log('Selected flow rows:', output.coverage.selectedExactResourceFlowRowCount);
  console.log('Absolute values, quantities, prices and game-state changes: none retained.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}
