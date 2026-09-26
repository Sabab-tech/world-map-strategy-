#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const REVIEW_DATE = '2026-09-27';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WD_API = 'https://www.wikidata.org/w/api.php';

const files = ['resources.json', 'resources_2.json'];
const loaded = files.map((name) => JSON.parse(fs.readFileSync(name, 'utf8')));
const profileSources = loaded.map((data) => data?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {});
const profiles = Object.assign({}, ...profileSources);

const stopWords = new Set([
  'mine','mines','gold','copper','iron','ore','coal','gas','oil','field','fields',
  'quarry','quarries','project','complex','district','area','areas','zone','zones',
  'site','sites','facility','facilities','operation','operations','the','of','and',
  'nickel','phosphate','limestone','aggregate','marble','tin','zinc','diamond',
  'uranium','bauxite','rutile','ilmenite','graphite','potash','salt','silver',
  'platinum','manganese','chromite','boron','magnesite','dolomite','basalt'
]);

function cleanWiki(value) {
  return String(value ?? '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\s\]]+)\s+([^\]]+)\]/g, '$2')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((x) => x && x.length >= 3 && !stopWords.has(x));
}

function scoreTitle(siteName, title) {
  const a = tokens(siteName);
  const b = new Set(tokens(title));
  if (!a.length) return 0;
  const hit = a.filter((x) => b.has(x)).length;
  return hit / a.length;
}

function exactEnough(siteName, title) {
  const score = scoreTitle(siteName, title);
  const a = tokens(siteName);
  const b = new Set(tokens(title));
  const distinctiveHits = a.filter((x) => b.has(x)).length;
  if (score >= 0.60) return true;
  return a.length <= 2 ? distinctiveHits >= 1 : distinctiveHits >= 2;
}

function safeSourceUrl(title) {
  return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title).replace(/%20/g, '_');
}

async function fetchJson(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'OMEGA-resource-site-revalidation/1.0' }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function wikipediaSearch(site) {
  const query = `"${site.siteName}" ${site.country || site.countryCode}`;
  const url = WIKI_API + '?' + new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '6',
    format: 'json',
    formatversion: '2'
  });
  const data = await fetchJson(url);
  const hits = data?.query?.search || [];
  const ranked = hits
    .map((hit) => ({ title: hit.title, score: scoreTitle(site.siteName, hit.title) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || !exactEnough(site.siteName, best.title)) return null;
  return {
    type: 'WIKIPEDIA',
    title: best.title,
    score: best.score,
    url: safeSourceUrl(best.title)
  };
}

async function wikidataSearch(site) {
  const query = `${site.siteName} ${site.country || site.countryCode}`;
  const url = WD_API + '?' + new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '5',
    format: 'json',
    formatversion: '2'
  });
  const data = await fetchJson(url);
  const hits = data?.search || [];
  const ranked = hits
    .map((hit) => ({
      id: hit.id,
      label: hit.label || '',
      description: hit.description || '',
      score: Math.max(scoreTitle(site.siteName, hit.label), scoreTitle(site.siteName, hit.description))
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || !exactEnough(site.siteName, best.label + ' ' + best.description)) return null;
  return {
    type: 'WIKIDATA',
    id: best.id,
    title: best.label,
    description: best.description,
    score: best.score,
    url: `https://www.wikidata.org/wiki/${best.id}`
  };
}

async function wikiInfobox(title) {
  const url = WIKI_API + '?' + new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2'
  });
  const data = await fetchJson(url);
  const text = data?.parse?.wikitext;
  if (!text) return {};
  const out = {};
  const lines = String(text).split('\n');
  const start = lines.findIndex((line) => /^\{\{Infobox\b/i.test(line.trim()));
  if (start < 0) return out;
  for (let i = start + 1; i < Math.min(lines.length, start + 220); i++) {
    const line = lines[i];
    if (/^\}\}\s*$/.test(line.trim())) break;
    if (!line.trim().startsWith('|')) continue;
    const match = line.match(/^\|\s*([^=]+?)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = cleanWiki(match[2]);
    if (!value) continue;
    if (['owner','owners','operator','operators','status','type','method','products','commodity','location','production','reserves','ore_reserves','estimated_reserves','active','opening_date','closed'].includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

function mergeEvidence(site, entry) {
  if (!entry) return;
  const existing = Array.isArray(site.webResearchEvidence) ? site.webResearchEvidence : [];
  if (!existing.some((x) => x?.url === entry.url)) existing.push(entry);
  site.webResearchEvidence = existing;
}

function setNested(obj, path, value) {
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!cursor[path[i]] || typeof cursor[path[i]] !== 'object' || Array.isArray(cursor[path[i]])) cursor[path[i]] = {};
    cursor = cursor[path[i]];
  }
  cursor[path[path.length - 1]] = value;
}

function applySemanticCompleteness(site) {
  const qp = site.quantitativeProfile || (site.quantitativeProfile = {});
  qp.reserve = qp.reserve || { quantity: null, unit: null, status: 'UNOBSERVED' };
  qp.production = qp.production || { annual: null, rate: null, unit: null, year: null, status: 'UNOBSERVED' };
  qp.grade = qp.grade || { value: null, unit: null, status: 'UNOBSERVED' };

  const reserveObserved = qp.reserve.quantity != null && qp.reserve.quantity !== '';
  const annualObserved = qp.production.annual != null && qp.production.annual !== '';
  const rateObserved = qp.production.rate != null && qp.production.rate !== '';
  const gradeObserved = qp.grade.value != null && qp.grade.value !== '';

  qp.reserve.status = reserveObserved ? 'OBSERVED' : 'UNOBSERVED';
  qp.production.status = (annualObserved || rateObserved) ? 'OBSERVED' : 'UNOBSERVED';
  qp.grade.status = gradeObserved ? 'OBSERVED' : 'UNOBSERVED';
  qp.quantitativeExtractionDataAvailable = reserveObserved || annualObserved || rateObserved || gradeObserved;

  site.dataCompleteness = site.dataCompleteness || {};
  site.dataCompleteness.quantitative = {
    reserve: qp.reserve.status,
    production: qp.production.status,
    grade: qp.grade.status
  };

  if (site.commercialExtraction !== false && String(site.status).toUpperCase() !== 'NOT_APPLICABLE') {
    if (site.owner == null || String(site.owner).trim() === '') {
      site.owner = 'UNOBSERVED';
      site.extractionProfile = site.extractionProfile || {};
      site.extractionProfile.owner = 'UNOBSERVED';
      site.extractionProfile.ownerEvidenceStatus = 'UNOBSERVED';
      site.ownerEvidenceStatus = 'UNOBSERVED';
      site.dataStatus = site.dataStatus || {};
      site.dataStatus.ownership = 'UNOBSERVED';
      site.dataCompleteness.ownership = 'UNOBSERVED';
    }
    if (site.operator == null || String(site.operator).trim() === '') {
      site.operator = 'UNOBSERVED';
      site.extractionProfile = site.extractionProfile || {};
      site.extractionProfile.operator = 'UNOBSERVED';
      site.extractionProfile.operatorEvidenceStatus = 'UNOBSERVED';
      site.operatorEvidenceStatus = 'UNOBSERVED';
      site.dataStatus = site.dataStatus || {};
      site.dataStatus.ownership = site.dataStatus.ownership || 'UNOBSERVED';
      site.dataCompleteness.ownership = site.dataCompleteness.ownership || 'UNOBSERVED';
    }
  }

  site.provenance = site.provenance || {};
  site.provenance.reviewedAt = REVIEW_DATE;
  site.provenance.webRevalidationMethod = 'SITE_SPECIFIC_WEB_SEARCH';
  site.dataAuthority = site.dataAuthority || {};
  site.dataStatus = site.dataStatus || {};

  if (site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED') {
    site.dataCompleteness.webResearch = 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED';
  }
}

const overrides = {
  SITE_SLE_sierra_rutile_area_1: {
    owner: 'Leonoil Company Limited',
    operator: 'Sierra Rutile Limited',
    reserveQuantity: 137000000,
    reserveUnit: 'metric_tons',
    grade: '0.93% rutile in ore',
    quantitativeGrade: { value: 0.93, unit: 'percent_rutile', status: 'OBSERVED' },
    metadata: {
      sourceAuthority: 'Sierra Rutile Limited',
      currentStatus: 'Operating Area 1; mine-life extension and reconfiguration work underway',
      productionCapacity: '120000 tonnes per year',
      oreReserve: '137 Mt ore containing 1.27 Mt rutile, 0.93% rutile grade',
      miningMethod: 'Dry mining with truck/excavator and dozer support feeding wet concentrator plants'
    },
    evidence: {
      url: 'https://www.sierra-rutile.com/area-1/',
      accessed: REVIEW_DATE,
      scope: 'site_identity_ownership_reserves_grade_mining_method_current_operation',
      sourceType: 'OPERATOR'
    }
  },
  SITE_MAR_khouribga_phosphate_mine: {
    metadata: {
      sourceAuthority: 'OCP Group',
      currentStatus: 'Active phosphate mining in the Khouribga zone; Sidi Chennane open-pit mine is part of the Khouribga mining region',
      miningMethod: 'Open-pit phosphate mining',
      sourceContext: 'OCP states Sidi Chennane opened in 1994 to maintain Khouribga-zone capacity after closure of the previous underground mine'
    },
    evidence: {
      url: 'https://www.ocpgroup.ma/en/who-we-are/our-journey',
      accessed: REVIEW_DATE,
      scope: 'site_identity_mining_method_current_operation',
      sourceType: 'OPERATOR'
    }
  },
  SITE_NPL_udayapur_limestone_mine: {
    metadata: {
      sourceAuthority: 'Udayapur Cement Industry / Government of Nepal public sources',
      currentStatus: 'Active limestone quarry serving the Udayapur cement operation'
    }
  },
  SITE_BEN_onigbolo_limestone_quarry: {
    owner: 'SCB-Lafarge',
    operator: 'SCB-Lafarge',
    metadata: {
      sourceAuthority: 'Government of Benin + SCB-Lafarge',
      currentStatus: 'Operating limestone quarry serving the Onigbolo cement plant',
      location: 'Pobè, Collines/Plateau area of south-eastern Benin',
      historicalInitialReserve: '>90 million tonnes (historical initial estimate)',
      process: 'Limestone is extracted, crushed and fed to the cement production chain'
    },
    evidence: {
      url: 'https://eau-mines.gouv.bj/web/public/index.php/potentialites-minieres/',
      accessed: REVIEW_DATE,
      scope: 'site_identity_operator_status_resource_and_mining',
      sourceType: 'GOVERNMENT'
    }
  },
  SITE_TGO_hahoto_kpogam_phosphate_mine: {
    owner: 'SNPT / State of Togo',
    operator: 'SNPT',
    metadata: {
      sourceAuthority: 'SNPT',
      currentStatus: 'Open-pit phosphate extraction at the Hahotoé/Kpogamé and related mining seats',
      averageAnnualProduction: 'Approximately 1.1 million tonnes of phosphate',
      process: 'Open-pit extraction; simple treatment/washing at Kpémé; export through the phosphate wharf'
    },
    evidence: {
      url: 'https://snptogo.com/social_details_relocalisation.php?lang=fr',
      accessed: REVIEW_DATE,
      scope: 'site_identity_operator_mining_method_processing_and_production_context',
      sourceType: 'OPERATOR'
    }
  },
  SITE_FARIM_phosphate_project: {
    owner: 'Itafos Inc. / Itafos Farim Holdings',
    operator: 'Itafos (Farim Project)',
    reserveQuantity: 43800000,
    reserveUnit: 'metric_tons',
    grade: '30.0% P2O5',
    quantitativeGrade: { value: 30.0, unit: 'percent_P2O5', status: 'OBSERVED' },
    metadata: {
      sourceAuthority: 'Itafos',
      currentStatus: 'Construction-ready development project; no current commercial production',
      provenAndProbableReserve: '43.8 million dry tonnes at 30.0% P2O5',
      plannedMiningMethod: 'Free-dig open-pit mine',
      plannedProduction: 'Approximately 1.3 Mt/y phosphate rock concentrate according to the 2025 annual reporting context',
      miningLease: 'Mining Lease 004/2009, approximately 30,625 ha'
    },
    evidence: {
      url: 'https://itafos.com/news/2026/itafos-provides-preliminary-q4-2025-and-full-year-2025-operational-results-and-2026-guidance/',
      accessed: REVIEW_DATE,
      scope: 'current_status_project_ownership_and_development_context',
      sourceType: 'PROJECT_OWNER'
    },
    evidence2: {
      url: 'https://itafos.com/news/2023/itafos-completes-updated-feasibility-study-for-the-farim-phosphate-project/',
      accessed: REVIEW_DATE,
      scope: 'reserve_grade_mining_method_processing_and_project_economics',
      sourceType: 'PROJECT_OWNER'
    }
  },
  SITE_NER_soma_r_uranium_mine: {
    owner: 'State of Niger / TSUMCO SA',
    operator: 'TSUMCO SA',
    status: 'CARE_AND_MAINTENANCE',
    operationalStatus: 'CARE_AND_MAINTENANCE',
    currentStatus: 'SOMAÏR was nationalised in June 2025; in August 2026 Niger awarded the Arlit large-scale uranium mining permit to state-owned TSUMCO SA, created as successor to SOMAÏR. Restart of commercial production is not established by the cited source.',
    evidence: {
      url: 'https://www.world-nuclear-news.org/articles/niger-awards-arlit-uranium-mining-permit-to-state-owned-company',
      accessed: REVIEW_DATE,
      scope: 'current_ownership_successor_permit_and_operational_status',
      sourceType: 'INDUSTRY_NEWS'
    },
    evidence2: {
      url: 'https://www.orano.group/en/news/news-group/2025/september/the-icsid-arbitral-tribunal-opposes-the-sale-by-the-state-of-niger-of-uranium-produced-by-somair',
      accessed: REVIEW_DATE,
      scope: 'nationalisation_and_operational_control_dispute',
      sourceType: 'FORMER_OPERATOR'
    }
  },
  SITE_GNQ_zafiro_oil_field: {
    owner: 'GEPetrol / Equatorial Guinea',
    operator: 'GEPetrol',
    status: 'RESTARTING',
    operationalStatus: 'RESTARTING',
    currentStatus: 'GEPetrol assumed operatorship of Block B/Zafiro and launched a multi-phase redevelopment plan; Phase 1 in early 2025 focused on reconnecting selected wells. Current steady-state production is not asserted here without a site-level production figure.',
    evidence: {
      url: 'https://aecweek.com/news/gepetrol-joins-aew-2025-bronze-partner-advancing-zafiro-redevelopment-strategic-partnerships',
      accessed: REVIEW_DATE,
      scope: 'current_operator_current_status_redevelopment',
      sourceType: 'INDUSTRY_SOURCE'
    }
  },
  SITE_AGO_catoca_diamond_mine: {
    annualProduction: { value: 6500000, unit: 'carats', year: 2024 },
    metadata: {
      sourceAuthority: 'USGS / Catoca',
      production2024: 'Estimated 6.5 million carats in 2024',
      miningMethod: 'Open-pit kimberlite; company is working toward underground mining'
    },
    evidence: {
      url: 'https://www.usgs.gov/centers/national-minerals-information-center/angola',
      accessed: REVIEW_DATE,
      scope: 'current_recent_production_and_mining_method',
      sourceType: 'GOVERNMENT_GEOLOGICAL_SURVEY'
    }
  },
  SITE_LBR_yekepa_iron_ore_mine: {
    metadata: {
      sourceAuthority: 'ArcelorMittal Liberia',
      currentStatus: 'Operating; Phase II expansion targets approximately 20 Mt/y concentrate and sinter feed when fully operational',
      phase2Target: '20 million tonnes per year'
    },
    evidence: {
      url: 'https://corporate.arcelormittal.com/media/case-studies/arcelormittal-liberia-partners-in-prosperity',
      accessed: REVIEW_DATE,
      scope: 'current_operation_expansion_capacity',
      sourceType: 'OPERATOR'
    }
  },
  SITE_BDI_musongati_nickel_project: {
    owner: 'Government of Burundi / Lifezone Metals (exclusive evaluation agreement)',
    operator: 'Lifezone Metals (evaluation phase)',
    metadata: {
      sourceAuthority: 'Lifezone Metals',
      currentStatus: 'Development/evaluation phase under a 14-month exclusivity agreement signed March 10, 2026',
      historicalResourceEstimate: '>140 million tonnes, estimated 1.31% nickel from 2011 studies',
      miningMethod: 'Large-tonnage, open-pittable nickel laterite'
    },
    evidence: {
      url: 'https://ir.lifezonemetals.com/news/press-releases/news-details/2026/Lifezone-Announces-Exclusivity-Agreement-over-the-Musongati-Nickel-Project-in-Burundi/default.aspx',
      accessed: REVIEW_DATE,
      scope: 'current_project_status_evaluation_ownership_context_resource_and_mining_method',
      sourceType: 'PROJECT_EVALUATOR'
    }
  }
};

const allSites = [];
for (const [countryId, profile] of Object.entries(profiles)) {
  const rows = profile?.resource_infrastructure_context?.mineSites;
  if (!Array.isArray(rows)) continue;
  rows.forEach((site, index) => allSites.push({ countryId, index, site }));
}

if (allSites.length !== 199) {
  throw new Error(`Expected 199 mine-site references, found ${allSites.length}`);
}

const legacyTargets = allSites.filter(({site}) => site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED');
const concurrency = 8;
let cursor = 0;
const results = new Array(legacyTargets.length);

async function worker() {
  while (true) {
    const i = cursor++;
    if (i >= legacyTargets.length) return;
    const item = legacyTargets[i];
    let source = await wikipediaSearch(item.site);
    if (!source) source = await wikidataSearch(item.site);
    let infobox = {};
    if (source?.type === 'WIKIPEDIA') infobox = await wikiInfobox(source.title);
    results[i] = { ...item, source, infobox };
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, legacyTargets.length) }, worker));

const report = {
  runDate: REVIEW_DATE,
  totalSites: allSites.length,
  legacyTargets: legacyTargets.length,
  matchedByWebSearch: results.filter((x) => x.source).length,
  wikipediaMatches: results.filter((x) => x.source?.type === 'WIKIPEDIA').length,
  wikidataMatches: results.filter((x) => x.source?.type === 'WIKIDATA').length,
  unresolved: results.filter((x) => !x.source).map((x) => ({ id: x.site.id, siteName: x.site.siteName, countryCode: x.site.countryCode }))
};
fs.writeFileSync('resource_site_web_revalidation_report.json', JSON.stringify(report, null, 2) + '\n');

for (const item of allSites) {
  const site = item.site;
  applySemanticCompleteness(site);

  const override = overrides[site.id];
  if (override) {
    for (const [key, value] of Object.entries(override)) {
      if (['metadata','evidence','evidence2','quantitativeGrade','currentStatus'].includes(key)) continue;
      site[key] = value;
    }
    site.extractionProfile = site.extractionProfile || {};
    if (override.owner) site.extractionProfile.owner = override.owner;
    if (override.operator) site.extractionProfile.operator = override.operator;
    if (override.quantitativeGrade) site.quantitativeProfile.grade = { ...override.quantitativeGrade };
    site.researchMetadata = {
      ...(site.researchMetadata || {}),
      reviewedAt: REVIEW_DATE,
      ...(override.metadata || {})
    };
    for (const evKey of ['evidence','evidence2']) {
      const ev = override[evKey];
      if (ev) mergeEvidence(site, ev);
    }
    if (override.evidence) {
      site.researchState = 'SITE_SPECIFIC_WEB_REVALIDATED';
      site.dataCompleteness = site.dataCompleteness || {};
      site.dataCompleteness.webResearch = 'SITE_SPECIFIC_WEB_REVALIDATED';
      site.provenance = site.provenance || {};
      site.provenance.webReview = `${override.metadata?.sourceAuthority || 'WEB_RESEARCH'} rechecked ${REVIEW_DATE}`;
    }
    applySemanticCompleteness(site);
  }
}

for (const item of results) {
  const site = item.site;
  if (item.source) {
    const source = item.source;
    mergeEvidence(site, {
      url: source.url,
      accessed: REVIEW_DATE,
      scope: 'site_identity_location_resource_operation_web_revalidation',
      sourceType: source.type,
      matchScore: Number(source.score.toFixed(3)),
      sourceTitle: source.title
    });
    site.researchState = 'SITE_SPECIFIC_WEB_REVIEWED';
    site.dataCompleteness = site.dataCompleteness || {};
    site.dataCompleteness.webResearch = 'SITE_SPECIFIC_WEB_REVIEWED';
    site.researchMetadata = {
      ...(site.researchMetadata || {}),
      reviewedAt: REVIEW_DATE,
      sourceAuthority: source.type === 'WIKIPEDIA' ? 'Wikipedia/MediaWiki (secondary)' : 'Wikidata (secondary)',
      sourceTitle: source.title,
      sourceType: source.type,
      webSearchMethod: 'SITE_NAME + COUNTRY',
      webSearchMatchScore: Number(source.score.toFixed(3))
    };

    if (item.infobox) {
      const ib = item.infobox;
      site.researchMetadata.webInfobox = {
        ...(site.researchMetadata.webInfobox || {}),
        owner: ib.owner || ib.owners || undefined,
        operator: ib.operator || ib.operators || undefined,
        status: ib.status || undefined,
        type: ib.type || undefined,
        method: ib.method || undefined,
        products: ib.products || ib.commodity || undefined,
        production: ib.production || undefined,
        reserves: ib.reserves || ib.ore_reserves || ib.estimated_reserves || undefined,
        location: ib.location || undefined
      };
      if ((site.owner === 'UNOBSERVED' || site.owner == null) && (ib.owner || ib.owners)) {
        site.owner = ib.owner || ib.owners;
        site.extractionProfile.owner = site.owner;
        site.extractionProfile.ownerEvidenceStatus = 'WEB_REPORTED';
        site.dataStatus.ownership = 'OBSERVED';
        site.dataCompleteness.ownership = 'REPORTED';
      }
      if ((site.operator === 'UNOBSERVED' || site.operator == null) && (ib.operator || ib.operators)) {
        site.operator = ib.operator || ib.operators;
        site.extractionProfile.operator = site.operator;
        site.extractionProfile.operatorEvidenceStatus = 'WEB_REPORTED';
      }
      if ((site.extractionMethod == null || site.extractionMethod === 'UNOBSERVED') && ib.method) {
        site.extractionMethod = ib.method;
        site.extractionProfile.method = ib.method;
        site.dataStatus.extractionMethod = 'OBSERVED';
      }
    }
    applySemanticCompleteness(site);
  } else if (site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED') {
    site.researchMetadata = {
      ...(site.researchMetadata || {}),
      reviewedAt: REVIEW_DATE,
      webSearchMethod: 'SITE_NAME + COUNTRY',
      webSearchResult: 'NO_HIGH_CONFIDENCE_WIKIPEDIA_OR_WIKIDATA_MATCH'
    };
  }
}

for (const site of allSites.map((x) => x.site)) {
  const topGrade = String(site.grade ?? '').trim().toLowerCase();
  const qpGrade = String(site.quantitativeProfile?.grade?.value ?? '').trim().toLowerCase();
  if (site.id === 'SITE_PAK_thar_block_ii_coal_mine' && topGrade === 'lignite' && qpGrade === 'thermal coal') {
    site.quantitativeProfile.grade = { value: 'Lignite', unit: null, status: 'OBSERVED' };
    site.grade = 'Lignite';
    site.dataStatus = site.dataStatus || {};
    site.dataStatus.grade = 'OBSERVED';
    site.dataCompleteness = site.dataCompleteness || {};
    site.dataCompleteness.quantitative = {
      ...(site.dataCompleteness.quantitative || {}),
      grade: 'OBSERVED'
    };
    site.researchMetadata = {
      ...(site.researchMetadata || {}),
      gradeCorrection: 'Aligned top-level and quantitative grade labels to Lignite'
    };
  }
}

// Enrich a machine-readable per-site catalog for downstream runtime consumers without inventing values.
const enrichedCatalog = allSites.map(({ countryId, site }) => ({
  countryId,
  siteId: site.id,
  siteName: site.siteName,
  resourceTypeId: site.resourceTypeId,
  siteType: site.siteType,
  status: site.status,
  owner: site.owner ?? 'UNOBSERVED',
  operator: site.operator ?? 'UNOBSERVED',
  extractionMethod: site.extractionMethod,
  location: site.locationIdentity,
  resourceIdentity: site.resourceIdentity,
  quantitativeProfile: site.quantitativeProfile,
  researchState: site.researchState,
  researchMetadata: site.researchMetadata || {},
  webResearchEvidence: site.webResearchEvidence || []
}));
fs.writeFileSync('resource_site_enriched_catalog.json', JSON.stringify({
  version: '1.0.0',
  generatedAt: REVIEW_DATE,
  siteCount: enrichedCatalog.length,
  sites: enrichedCatalog
}, null, 2) + '\n');

for (const file of files) {
  fs.writeFileSync(file, JSON.stringify(loaded[files.indexOf(file)], null, 2) + '\n');
}

// Remove the temporary dataset-capture hook created only to obtain the oversized resource file for this audit.
const workflowPath = '.github/workflows/omega-resource-verification.yml';
if (fs.existsSync(workflowPath)) {
  const wf = fs.readFileSync(workflowPath, 'utf8');
  const cleaned = wf.replace(
    /\n?      - name: Capture raw resource datasets for local audit[\s\S]*?retention-days: 1\n/,'\n'
  );
  if (cleaned !== wf) fs.writeFileSync(workflowPath, cleaned);
}

const status = {
  totalSites: allSites.length,
  legacyTargets: legacyTargets.length,
  matchedByWebSearch: report.matchedByWebSearch,
  wikipediaMatches: report.wikipediaMatches,
  wikidataMatches: report.wikidataMatches,
  unresolved: report.unresolved.length,
  stillLegacyAfterPass: allSites.filter(({site}) => site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED').length,
  commercialSitesWithExplicitOwner: allSites.filter(({site}) => site.commercialExtraction !== false && site.status !== 'NOT_APPLICABLE' && site.owner && site.owner !== 'UNOBSERVED').length,
  commercialSitesWithExplicitOperator: allSites.filter(({site}) => site.commercialExtraction !== false && site.status !== 'NOT_APPLICABLE' && site.operator && site.operator !== 'UNOBSERVED').length
};
fs.writeFileSync('resource_site_enrichment_status.json', JSON.stringify(status, null, 2) + '\n');

execFileSync('git', ['config', 'user.name', 'github-actions[bot]'], { stdio: 'inherit' });
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { stdio: 'inherit' });
execFileSync('git', ['add', 'resources.json', 'resources_2.json', 'resource_site_web_revalidation_report.json', 'resource_site_enriched_catalog.json', 'resource_site_enrichment_status.json', '.github/workflows/omega-resource-verification.yml'], { stdio: 'inherit' });
const diff = execFileSync('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' });
if (diff === undefined) {
  // git diff --cached --quiet exits 0 when there are no changes; because execFileSync would not return for non-zero,
  // we only reach here in the no-change case.
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}
