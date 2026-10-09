#!/usr/bin/env node
/**
 * Build-time import of the open Global Deposit Globe mineral-occurrence snapshot.
 * The game runtime never needs a network connection. Run after downloading the upstream
 * public/deposits.json into .cache/global-deposits-source.json.
 *
 * Importantly, these are mineral deposits/occurrences, NOT automatically verified active
 * mines. The importer preserves source provenance and leaves operational data UNKNOWN.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE = process.argv[2] || path.join(ROOT, '.cache/global-deposits-source.json');
const OUT = process.argv[3] || path.join(ROOT, 'resource_site_global_deposit_catalog_v1.json');
const CATALOG_PATH = path.join(ROOT, 'resource_site_canonical_catalog_v1.json');
const WORLD_PATH = path.join(ROOT, 'world.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const norm = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
const slug = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g);
const first = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '');
const finite = value => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
const coord = row => {
  const nested = row?.coordinates || row?.location?.coordinates || row?.geometry?.coordinates || row?.point || {};
  const lat = first(row?.lat, row?.latitude, row?.y, nested?.lat, nested?.latitude, Array.isArray(nested) ? nested[1] : undefined);
  const lng = first(row?.lng, row?.lon, row?.long, row?.longitude, row?.x, nested?.lng, nested?.lon, nested?.longitude, Array.isArray(nested) ? nested[0] : undefined);
  if (!finite(lat) || !finite(lng)) return null;
  const result = { lat: Number(lat), lng: Number(lng) };
  return result.lat >= -90 && result.lat <= 90 && result.lng >= -180 && result.lng <= 180 ? result : null;
};
const RESOURCE_RULES = [
  [/\b(gold|au)\b/i, 'gold'], [/\b(copper|cu)\b/i, 'copper'], [/\b(coal|lignite|anthracite)\b/i, 'coal'],
  [/\b(iron ore|iron|fe)\b/i, 'iron_ore'], [/\b(lithium|li)\b/i, 'lithium'], [/\b(uranium|u3o8)\b/i, 'uranium'],
  [/\b(nickel|ni)\b/i, 'nickel'], [/\b(cobalt|co)\b/i, 'cobalt'], [/\b(bauxite|alumina)\b/i, 'bauxite'],
  [/\b(silver|ag)\b/i, 'silver'], [/\b(zinc|zn)\b/i, 'zinc'], [/\b(lead|pb)\b/i, 'lead'],
  [/\b(tin|sn)\b/i, 'tin'], [/\b(tungsten|wolfram|w)\b/i, 'tungsten'], [/\b(manganese|mn)\b/i, 'manganese'],
  [/\b(graphite)\b/i, 'graphite'], [/\b(rare earth|ree|lanthanide)\b/i, 'rare_earth'],
  [/\b(platinum|palladium|pgm|pge)\b/i, 'platinum_group_metals'], [/\b(diamond)\b/i, 'diamond'],
  [/\b(phosphate|phosphorite)\b/i, 'phosphate'], [/\b(potash)\b/i, 'potash'],
  [/\b(chromite|chromium)\b/i, 'chromite'], [/\b(molybdenum|mo)\b/i, 'molybdenum'],
  [/\b(antimony|sb)\b/i, 'antimony'], [/\b(niobium|columbium|nb)\b/i, 'niobium'],
  [/\b(tantalum|ta)\b/i, 'tantalum'], [/\b(titanium|ilmenite|rutile)\b/i, 'titanium'],
  [/\b(barite|baryte)\b/i, 'barite'], [/\b(boron|borate)\b/i, 'boron'], [/\b(fluorite|fluorspar)\b/i, 'fluorite'],
  [/\b(salt|halite)\b/i, 'salt'], [/\b(silica|quartz|sandstone)\b/i, 'silica'], [/\b(magnesium|magnesite)\b/i, 'magnesium']
];
const resourceId = value => {
  const text = Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : v?.name || v?.commodity || v?.code || '').join(' ') : typeof value === 'object' && value ? [value.name,value.commodity,value.code,value.id].filter(Boolean).join(' ') : String(value ?? '');
  for (const [pattern, id] of RESOURCE_RULES) if (pattern.test(text)) return id;
  return slug(text.split(/[;,|]/)[0] || 'unclassified_mineral') || 'unclassified_mineral';
};
const source = readJson(SOURCE);
const rawRows = Array.isArray(source) ? source :
  Array.isArray(source?.deposits) ? source.deposits :
  Array.isArray(source?.features) ? source.features :
  Array.isArray(source?.records) ? source.records :
  Array.isArray(source?.data) ? source.data : null;
if (!rawRows) throw new Error('Unsupported upstream source shape: expected an array, deposits[], features[], records[] or data[]');
const canonical = readJson(CATALOG_PATH);
const world = readJson(WORLD_PATH);
const countryNameToId = new Map();
const countryIdToName = new Map();
const knownIds = new Set();
for (const row of canonical.sites || []) {
  const id = String(row.countryId || row.identity?.countryIso3 || '').toUpperCase();
  if (id) knownIds.add(id);
  for (const name of [row.location?.countryName, row.countryName, row.countryId, row.identity?.countryIso3]) if (name && id) countryNameToId.set(norm(name), id);
  if (id) countryIdToName.set(id, row.location?.countryName || row.countryName || id);
}
for (const feature of world.features || []) {
  const p = feature.properties || {};
  const id = String(first(p.ISO_A3, p.ADM0_A3, p.iso_a3, p.ISO3, p.iso3, p.A3, p.SOV_A3, p.GID_0, feature.id) || '').toUpperCase();
  const names = [p.ADMIN,p.NAME_EN,p.NAME,p.name,p.NAME_LONG,p.SOVEREIGNT,p.FORMAL_EN,p.BRK_NAME,p.NAME_0,p.COUNTRY];
  const preferredName = first(p.ADMIN,p.NAME_EN,p.NAME,p.name,p.NAME_LONG,p.SOVEREIGNT,p.FORMAL_EN,p.NAME_0,p.COUNTRY);
  if (/^[A-Z]{3}$/.test(id) && id !== '-99') {
    knownIds.add(id);
    for (const name of names) if (name) countryNameToId.set(norm(name), id);
    if (preferredName) countryIdToName.set(id, preferredName);
  }
}
const ISO2_TO_3 = {US:'USA',CA:'CAN',MX:'MEX',BR:'BRA',AR:'ARG',CL:'CHL',PE:'PER',CO:'COL',VE:'VEN',EC:'ECU',BO:'BOL',PY:'PRY',UY:'URY',GY:'GUY',SR:'SUR',GB:'GBR',UK:'GBR',FR:'FRA',DE:'DEU',ES:'ESP',IT:'ITA',NO:'NOR',SE:'SWE',FI:'FIN',PL:'POL',UA:'UKR',RU:'RUS',CN:'CHN',IN:'IND',PK:'PAK',BD:'BGD',NP:'NPL',LK:'LKA',AF:'AFG',IR:'IRN',IQ:'IRQ',SA:'SAU',AE:'ARE',QA:'QAT',KW:'KWT',OM:'OMN',YE:'YEM',TR:'TUR',ID:'IDN',MY:'MYS',TH:'THA',VN:'VNM',PH:'PHL',JP:'JPN',KR:'KOR',KP:'PRK',AU:'AUS',NZ:'NZL',ZA:'ZAF',ZM:'ZMB',ZW:'ZWE',NA:'NAM',BW:'BWA',MZ:'MOZ',CD:'COD',CG:'COG',GH:'GHA',NG:'NGA',KE:'KEN',TZ:'TZA',UG:'UGA',ET:'ETH',MA:'MAR',DZ:'DZA',EG:'EGY',LY:'LBY',SD:'SDN',SN:'SEN',CI:'CIV',ML:'MLI',NE:'NER',BF:'BFA',CM:'CMR',AO:'AGO',MG:'MDG',CA:'CAN'};
const countryIdOf = row => {
  const direct = String(first(row.countryId,row.countryCode,row.iso3,row.ISO3,row.country_iso3,row.ISO_A3,row.ADM0_A3,row.nationCode,row.country?.iso3,row.country?.code) || '').toUpperCase();
  if (knownIds.has(direct)) return direct;
  if (ISO2_TO_3[direct]) return ISO2_TO_3[direct];
  const name = first(typeof row.country === 'string' ? row.country : row.country?.name,row.countryName,row.country_name,row.nation,row.admin0,row.ADMIN0,row.sovereign,row.location?.country,row.location?.countryName,row.properties?.country,row.properties?.ADMIN,row.properties?.NAME);
  return countryNameToId.get(norm(name)) || '';
};
const countryFeatures = [];
for (const feature of world.features || []) {
  const p = feature.properties || {};
  const id = String(first(p.ISO_A3,p.ADM0_A3,p.iso_a3,p.ISO3,p.iso3,p.A3,p.SOV_A3,p.GID_0,feature.id)||'').toUpperCase();
  const geometry = feature.geometry || {};
  const coords = geometry.coordinates;
  if (!knownIds.has(id) || !['Polygon','MultiPolygon'].includes(geometry.type) || !coords) continue;
  try {
    const polygons = geometry.type === 'MultiPolygon' ? coords : [coords];
    const points = polygons.flatMap(polygon => polygon.flatMap(ring => ring));
    if (!points.length) continue;
    countryFeatures.push({id,geometryType:geometry.type,coords,bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]});
  } catch {}
}
function pointInRing(lng,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
  if(((yi>lat)!==(yj>lat))&&lng<(xj-xi)*(lat-yi)/((yj-yi)||1e-30)+xi)inside=!inside;
 }
 return inside;
}
function pointInPolygon(lng,lat,rings){
 return !!rings?.length&&pointInRing(lng,lat,rings[0])&&!rings.slice(1).some(ring=>pointInRing(lng,lat,ring));
}
function countryFromCoordinates(c){
 const matches=[];
 for(const entry of countryFeatures){
  const [minLng,minLat,maxLng,maxLat]=entry.bounds;
  if(c.lng<minLng||c.lng>maxLng||c.lat<minLat||c.lat>maxLat)continue;
  const polygons=entry.geometryType==='MultiPolygon'?entry.coords:[entry.coords];
  if(polygons.some(polygon=>pointInPolygon(c.lng,c.lat,polygon)))matches.push(entry.id);
 }
 return new Set(matches).size===1?matches[0]:'';
}
const nameOf = row => first(row.name,row.depositName,row.deposit_name,row.siteName,row.site_name,row.title,row.label,row.occurrenceName,row.mineName,row.properties?.name,row.properties?.NAME,row.properties?.deposit_name);
const commodityOf = row => first(row.commodities,row.commodity,row.primaryCommodity,row.primary_commodity,row.mineral,row.minerals,row.resource,row.resourceType,row.depositType,row.deposit_type,row.properties?.commodities,row.properties?.commodity,row.properties?.mineral);
const sourceIdOf = row => first(row.id,row.depositId,row.deposit_id,row.siteId,row.site_id,row.recordId,row.record_id,row.uid,row.properties?.id,row.properties?.deposit_id);
const rows = new Map();
let rejectedCoordinates = 0, rejectedCountry = 0, rejectedIdentity = 0, acceptedRecordCount = 0, coordinateCountryInferenceCount = 0;
for (const row of rawRows) {
  if (!row || typeof row !== 'object') continue;
  const c = coord(row);
  if (!c) { rejectedCoordinates++; continue; }
  let countryId = countryIdOf(row);
  if (!countryId) { countryId = countryFromCoordinates(c); if (countryId) coordinateCountryInferenceCount++; }
  if (!countryId) { rejectedCountry++; continue; }
  const siteName = String(nameOf(row) || '').trim();
  const rawCommodity = commodityOf(row);
  if (!siteName || !rawCommodity) { rejectedIdentity++; continue; }
  const rid = resourceId(rawCommodity);
  acceptedRecordCount++;
  const upstreamId = String(sourceIdOf(row) || '').trim();
  const siteId = 'GLOBAL_DEP_' + countryId + '_' + rid + '_' + (slug(upstreamId) || slug(siteName)) + '_' + c.lat.toFixed(4) + '_' + c.lng.toFixed(4);
  const key = [countryId,rid,c.lat.toFixed(4),c.lng.toFixed(4)].join('|');
  const record = {
    siteId, countryId, siteName,
    schemaVersion: '1.0.0',
    sourceType: 'GLOBAL_MINERAL_OCCURRENCE',
    identity: { countryIso3: countryId, siteType: 'MINERAL_DEPOSIT_OR_OCCURRENCE', resourceTypeId: rid, sourceRecordId: upstreamId || null },
    real: { resourceId: rid, operationStatus: 'UNKNOWN', reserveStatus: 'UNOBSERVED', productionStatus: 'UNOBSERVED' },
    coordinates: c,
    location: { coordinates: c, countryName: countryIdToName.get(countryId) || countryId, coordinateStatus: 'UPSTREAM_GEOLOCATION_NOT_INDEPENDENTLY_VERIFIED' },
    operation: { status: 'UNKNOWN', extractionEligibility: 'REQUIRES_SITE_SPECIFIC_VERIFICATION', commercialExtraction: false },
    sourceSiteRecord: { sourceDataset: 'Alexander-ai/global-deposit-globe', sourceUrl: 'https://github.com/Alexander-ai/global-deposit-globe', upstreamRecordId: upstreamId || null, rawCommodity, sourceAttributes: { name: siteName, id: upstreamId || null, country: first(row.country,row.countryName,row.country_name,row.countryCode,row.iso3) || null, depositType: first(row.depositType,row.deposit_type,row.type) || null, status: first(row.status,row.developmentStatus,row.development_status) || null, source: first(row.source,row.sources,row.database,row.dataset) || null } },
    provenance: { sourceAuthority: 'OPEN_MULTI_SOURCE_GEOLOGICAL_COMPILATION', sourceSnapshot: 'upstream-main-build-time', operationalStatus: 'NOT_INFERRED' }
  };
  if (rows.has(key)) {
    const prior = rows.get(key);
    prior.sourceSiteRecord.additionalSourceRecords = [...(prior.sourceSiteRecord.additionalSourceRecords || []), record.sourceSiteRecord];
    prior.sourceSiteRecord.sourceRecordCount = (prior.sourceSiteRecord.sourceRecordCount || 1) + 1;
    continue;
  }
  rows.set(key, record);
}
const sites = [...rows.values()].sort((a,b)=>a.countryId.localeCompare(b.countryId)||a.siteName.localeCompare(b.siteName));
if (sites.length < (process.env.OMEGA_ALLOW_SMALL_IMPORT_FOR_TESTS === '1' ? 1 : 1000)) throw new Error('Global import yielded fewer than 1000 usable mineral records; refusing to silently ship a partial dataset');
const output = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  datasetScope: 'GLOBAL_NONFUEL_MINERAL_DEPOSITS_AND_OCCURRENCES',
  siteCount: sites.length,
  countriesRepresented: [...new Set(sites.map(s=>s.countryId))].length,
  sourceRecordCount: rawRows.length,
  acceptedRecordCount,
  deduplicatedRecordCount: acceptedRecordCount - sites.length,
  coordinateCountryInferenceCount,
  rejected: { coordinates: rejectedCoordinates, countryIdentity: rejectedCountry, missingNameOrCommodity: rejectedIdentity },
  operationalPolicy: 'Occurrence records are visible on the map but are not automatically treated as active or executable mines.',
  source: { name: 'Global Deposit Globe', url: 'https://github.com/Alexander-ai/global-deposit-globe', reportedCoverage: 'Approximately 89,000 deposits from twelve open geological databases', retrievedAtBuild: true },
  sites
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output) + '\n');
console.log(JSON.stringify({ output: path.relative(ROOT,OUT), siteCount: sites.length, countriesRepresented: output.countriesRepresented, sourceRecordCount: rawRows.length, deduplicatedRecordCount: output.deduplicatedRecordCount, rejected: output.rejected }, null, 2));
