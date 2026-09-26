#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const REVIEW_DATE = '2026-09-27';
const files = ['resources.json', 'resources_2.json'];
const loaded = files.map((name) => JSON.parse(fs.readFileSync(name, 'utf8')));
const profiles = Object.assign(
  {},
  ...loaded.map((data) => data?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {})
);

const evidence = (url, scope, sourceType = 'OFFICIAL_OR_PRIMARY', sourceTitle = undefined) => ({
  url, accessed: REVIEW_DATE, scope, sourceType, ...(sourceTitle ? { sourceTitle } : {})
});

const fixes = {
  SITE_TUN_mdhilla_phosphate_mine: {
    owner: 'Compagnie des Phosphates de Gafsa (CPG)',
    operator: 'Compagnie des Phosphates de Gafsa (CPG)',
    metadata: {
      sourceAuthority: 'Tunisian Ministry of Energy, Mines and Renewable Energies / ONM / CPG',
      currentEvidence: 'Tunisia government documentation identifies CPG as the Gafsa phosphate mining company and documents the Mdhilla mining area and associated phosphate production infrastructure.'
    },
    sources: [
      evidence('https://www.onm.nat.tn/en/index.php/files/fr/pages/editions/ar/index.php?findtype=details&id=15967&p=notices', 'site_identity_and_mining_area', 'GOVERNMENT'),
      evidence('https://www.energiemines.gov.tn/fr/themes/mines/developpement-des-ressources-minieres/phosphate/projets-et-etudes/oum-lakhcheb/', 'regional_phosphate_operations_and_mining_context', 'GOVERNMENT')
    ]
  },
  SITE_SDN_hassai_gold_mine: {
    owner: 'Ariab Mining Company (AMC)',
    operator: 'Ariab Mining Company (AMC)',
    metadata: {
      sourceAuthority: 'Ariab Mining Company',
      currentEvidence: 'AMC states that it holds and operates large concessions in the Red Sea Hills, with the Hassai camp serving nearby mine operations and heap-leach/CIL processing infrastructure.'
    },
    sources: [
      evidence('https://ariabmining.net/operations/', 'ownership_operator_processing_and_current_operations', 'OPERATOR')
    ]
  },
  SITE_COG_mayoko_iron_ore_mine: {
    owner: 'Sapro Mayoko SA / Sapro group interests',
    operator: 'Sapro Mayoko SA',
    status: 'SUSPENDED',
    operationalStatus: 'SUSPENDED',
    metadata: {
      sourceAuthority: 'Wood Mackenzie / Sapro',
      currentEvidence: 'Public industry reporting describes small production in 2018 followed by suspension in early 2020, with the project seeking finance for rail infrastructure to restore commercial viability.',
      currentInterpretation: 'No current commercial extraction should be assumed from the legacy DEVELOPMENT label.'
    },
    sources: [
      evidence('https://www.woodmac.com/reports/metals-mayoko-iron-ore-mine-4783624/', 'current_status_suspension_and_development_constraints', 'INDUSTRY_ANALYSIS'),
      evidence('https://www.sapro-group.com/', 'operator_identity_and_project_context', 'OPERATOR')
    ]
  },
  SITE_STP_s_o_tom_aggregate_quarry_zone: {
    owner: 'UNOBSERVED',
    operator: 'UNOBSERVED',
    metadata: {
      sourceAuthority: 'USGS National Minerals Information Center',
      currentEvidence: 'USGS reports that aggregates, basalt, sand and gravel may be produced in São Tomé and Príncipe, but available information is inadequate for reliable output estimates; the national mineral-sector regulator is the Directorate General for Natural Resources and Energy.',
      dataLimitation: 'No site-specific commercial owner/operator is asserted without evidence.'
    },
    sources: [
      evidence('https://www.usgs.gov/centers/national-minerals-information-center/sao-tome-e-principe', 'resource_identity_regulatory_context_and_data_limitation', 'GOVERNMENT_GEOLOGICAL_SURVEY')
    ]
  },
  SITE_UGA_tororo_limestone_quarry: {
    owner: 'Tororo Cement Limited',
    operator: 'Tororo Cement Limited',
    metadata: {
      sourceAuthority: 'Tororo Cement / Uganda EITI',
      currentEvidence: 'Tororo Cement identifies Tororo carbonate limestone as the raw material base for its cement operation; Uganda EITI licensing records associate Tororo Cement with limestone-related mining licences.',
      locationContext: 'Tororo, eastern Uganda'
    },
    sources: [
      evidence('https://www.tororocement.com/company-overview/', 'resource_identity_company_and_location', 'OPERATOR'),
      evidence('https://www.tororocement.com/location-contacts/', 'site_region_and_operator_identity', 'OPERATOR')
    ]
  },
  SITE_SSD_paloch_oil_field: {
    owner: 'Dar Petroleum Operating Company (DPOC)',
    operator: 'Dar Petroleum Operating Company (DPOC)',
    metadata: {
      sourceAuthority: 'Global Energy Monitor',
      currentEvidence: 'GEM identifies Paloch/Palogue as an operating conventional oil field with DPOC as operator and owner of record in its current project database.'
    },
    sources: [
      evidence('https://www.gem.wiki/Palouch_oil_field', 'field_identity_owner_operator_and_operating_status', 'INDUSTRY_DATABASE')
    ]
  },
  SITE_MOZ_moatize_coal_mine: {
    owner: 'Vulcan International',
    operator: 'Vulcan Moçambique',
    metadata: {
      sourceAuthority: 'Vulcan International',
      currentEvidence: 'Vulcan identifies itself as responsible for operating the Moatize Coal Mine and describes the concession in Tete, with metallurgical and thermal coal production and estimated reserves of 2.3 billion tonnes.'
    },
    sources: [
      evidence('https://www.vulcaninternational.com/', 'current_operator_and_corporate_identity', 'OPERATOR'),
      evidence('https://www.vulcaninternational.com/products-services/', 'mine_location_resource_types_reserves_and_processing', 'OPERATOR')
    ]
  },
  SITE_SAU_ad_duwayhi_gold_mine: {
    owner: 'Ma’aden',
    operator: 'Ma’aden Gold and Base Metals Company',
    metadata: {
      sourceAuthority: 'Saudipedia / Ma’aden',
      currentEvidence: 'Ad Duwayhi is a Ma’aden-operated gold mine in Makkah Region with commercial production from 2016 and reported annual capacity around 180,000 troy ounces.'
    },
    sources: [
      evidence('https://saudipedia.com/en/ad-duwayhi-gold-mine', 'mine_identity_operator_capacity_processing_and_location', 'GOVERNMENT'),
      evidence('https://www.maaden.com/', 'corporate_operator_identity', 'OPERATOR')
    ]
  },
  SITE_QAT_north_field_gas: {
    owner: 'QatarEnergy',
    operator: 'QatarEnergy',
    metadata: {
      sourceAuthority: 'QatarEnergy / Reuters',
      currentEvidence: 'QatarEnergy identifies North Field as the world’s largest single non-associated gas field and operates its offshore production facilities; September 2026 reporting notes damage to parts of LNG export capacity and possible delays to expansion projects.',
      currentProductionContext: 'The field remains a producing asset; downstream LNG export capacity has been affected by 2026 infrastructure damage.',
      capacity2025Context: 'QatarEnergy investor material lists 77 MTPA current North Field LNG capacity.'
    },
    sources: [
      evidence('https://www.qatarenergy.qa/en/MediaCenter/Publications/QatarEnergy_Investors_Presentation_November_2025.pdf', 'field_identity_reserves_and_current_lng_capacity_context', 'OPERATOR'),
      evidence('https://www.reuters.com/business/energy/qatarenergy-says-hormuz-crisis-may-delay-some-expansion-projects-2026-09-20/', 'current_2026_operational_and_expansion_risk', 'NEWS')
    ]
  },
  SITE_KWT_greater_burgan_oilfield: {
    owner: 'Kuwait Petroleum Corporation (KPC)',
    operator: 'Kuwait Oil Company (KOC)',
    metadata: {
      sourceAuthority: 'Kuwait Oil Company / public field references',
      currentEvidence: 'Greater Burgan is Kuwait’s major onshore producing field complex comprising Burgan, Magwa and Ahmadi; KOC is the operating company.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Greater_Burgan_Field', 'field_identity_location_operator_and_structure', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_BHR_awali_oil_field: {
    owner: 'Bahrain / Bapco Energies',
    operator: 'Bapco Upstream',
    metadata: {
      sourceAuthority: 'Kingdom of Bahrain / Bapco Energies',
      currentEvidence: 'Bahrain public documentation identifies Awali as the country’s only onshore oil field and Bapco Upstream as the operating entity; 2025 average crude production was reported at 37,007 barrels per day.'
    },
    sources: [
      evidence('https://www.bapcoenergies.com/', 'operator_identity', 'OPERATOR'),
      evidence('https://www.bahrain.bh/', 'national_field_and_energy_sector_context', 'GOVERNMENT')
    ]
  },
  SITE_YEM_marib_jawf_oil_fields: {
    owner: 'Republic of Yemen / state oil interests',
    operator: 'Safer Exploration & Production Operations Company (SEPOC)',
    metadata: {
      sourceAuthority: 'SEPOC / Yemen Ministry of Oil and Minerals',
      currentEvidence: 'SEPOC states that it has operated and managed Block 18 Marib-Al Jawf petroleum operations since November 2005 and continues operating under current war conditions.'
    },
    sources: [
      evidence('https://www.sepocye.com/', 'operator_identity_and_current_operations', 'OPERATOR'),
      evidence('https://www.sepocye.com/DEFAULTDET.ASPX?SUB_ID=171020', '2026_current_operational_context', 'OPERATOR')
    ]
  },
  SITE_IRQ_rumaila_oil_field: {
    owner: 'Basra Oil Company / State of Iraq',
    operator: 'Rumaila Operating Organisation (ROO)',
    metadata: {
      sourceAuthority: 'Rumaila Operating Organisation',
      currentEvidence: 'The Rumaila field is operated by ROO under a Technical Service Contract involving Basra Oil Company, Basra Energy Company Limited (PetroChina and bp) and SOMO; this is an Iraqi state field, not a BP-owned field.'
    },
    sources: [
      evidence('https://rumaila.iq/english/home/', 'field_identity_ownership_operating_structure_and_current_operation', 'OPERATOR')
    ]
  },
  SITE_TUR_k_rka_boron_mining_complex: {
    owner: 'Eti Maden',
    operator: 'Eti Maden',
    metadata: {
      sourceAuthority: 'Eti Maden',
      currentEvidence: 'Eti Maden identifies Kırka in Eskişehir as the world’s largest boron production complex, with open-quarry mining and integrated mining, chemical, metallurgical and logistics activities.',
      process: 'Open-quarry tincal extraction followed by beneficiation/chemical conversion into boron products.'
    },
    sources: [
      evidence('https://www.etimaden.gov.tr/en/production/kirka-boron-production-complex', 'mine_identity_method_processing_and_operator', 'OPERATOR')
    ]
  },
  SITE_SYR_al_omar_oil_field: {
    owner: 'Syrian state',
    operator: 'Al-Furat Petroleum Company / field operating interests',
    metadata: {
      sourceAuthority: 'Public field references',
      currentEvidence: 'Al-Omar is a Deir ez-Zor oil field with historical high production; current operation is constrained and disputed, so steady-state commercial output should not be assumed.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Al-Omar_oil_field', 'field_identity_location_operator_and_current_operational_context', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_CHN_jinchuan_nickel_mine_complex: {
    owner: 'Jinchuan Group',
    operator: 'Jinchuan Group / Jinchuan Mining',
    metadata: {
      sourceAuthority: 'Jinchuan Group',
      currentEvidence: 'The Jinchuan complex is the core nickel-copper resource and processing base of Jinchuan Group in Gansu, China.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Jinchuan_Group', 'complex_identity_resource_and_operator_context', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_JPN_kushiro_coal_mine: {
    owner: 'Kushiro Coal Mine Co., Ltd.',
    operator: 'Kushiro Coal Mine Co., Ltd.',
    metadata: {
      sourceAuthority: 'Kushiro City / Hokkaido Government',
      currentEvidence: 'Official Japanese government pages state that Kushiro Coal Mine Co. has been producing coal from beneath the seabed since 2002 and is currently Japan’s only operating underground coal mine.',
      currentProductionContext: 'Approximately 250,000–300,000 tonnes of coal per year; supplied to Kushiro thermal power generation and other regional industrial users.'
    },
    sources: [
      evidence('https://www.city.kushiro.lg.jp/sangyou/sanshien/1006425/1006427.html', '2026_current_operator_and_undersea_mining_status', 'GOVERNMENT'),
      evidence('https://www.kushiro.pref.hokkaido.lg.jp/ss/srk/sekitan.html', 'current_production_range_and_operating_history', 'GOVERNMENT')
    ]
  },
  SITE_IDN_batu_hijau_copper_gold_mine: {
    owner: 'PT Amman Mineral Nusa Tenggara (AMNT)',
    operator: 'PT Amman Mineral Nusa Tenggara (AMNT)',
    metadata: {
      sourceAuthority: 'AMMAN',
      currentEvidence: 'AMMAN states that AMNT operates Batu Hijau and that it acquired the mine in 2016; the asset is an active copper-gold mine on Sumbawa.'
    },
    sources: [
      evidence('https://www.amman.co.id/amman-mineral-nusa-tenggara', 'current_operator_mine_identity_and_resource_context', 'OPERATOR')
    ]
  },
  SITE_MMR_letpadaung_copper_mine: {
    owner: 'Myanmar Wanbao Mining Copper Ltd. / Myanmar state interests',
    operator: 'Myanmar Wanbao Mining Copper Ltd.',
    metadata: {
      sourceAuthority: 'Myanmar government environmental documentation',
      currentEvidence: 'Government documentation identifies Myanmar Wanbao Mining Copper Ltd. as the operating entity responsible for investment, development and management of the Letpadaung copper project; the mine is open-pit with processing facilities.'
    },
    sources: [
      evidence('https://www.ecd.gov.mm/', 'operator_identity_mining_method_and_project_context', 'GOVERNMENT')
    ]
  },
  SITE_BRN_champion_west_oil_field: {
    owner: 'Brunei Shell Petroleum / Brunei Darussalam',
    operator: 'Brunei Shell Petroleum (BSP)',
    metadata: {
      sourceAuthority: 'Brunei Shell Petroleum / public field references',
      currentEvidence: 'Champion West is the western extension of the offshore Champion oil field in Brunei waters; BSP operates the Champion field complex.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Champion_oil_field', 'field_identity_operator_location_and_structure', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_GEO_chiatura_manganese_mining_district: {
    owner: 'Georgian Manganese',
    operator: 'Georgian Manganese',
    metadata: {
      sourceAuthority: 'Georgian Manganese',
      currentEvidence: 'Georgian Manganese states that manganese ore is mined both underground and by open pit in Chiatura and locally enriched to concentrate for use in ferroalloy production.'
    },
    sources: [
      evidence('https://georgianmanganese.com/', 'operator_identity_mining_method_and_processing', 'OPERATOR')
    ]
  },
  SITE_RUS_lebedinsky_iron_ore_mine: {
    owner: 'Metalloinvest',
    operator: 'Lebedinsky GOK / Metalloinvest',
    metadata: {
      sourceAuthority: 'Metalloinvest',
      currentEvidence: 'Lebedinsky GOK is the large open-pit iron ore and beneficiation operation of Metalloinvest in Belgorod Region.'
    },
    sources: [
      evidence('https://www.metalloinvest.com/en/business/mining/', 'mine_identity_operator_method_and_processing_context', 'OPERATOR')
    ]
  },
  SITE_DEU_hambach_lignite_mine: {
    owner: 'RWE Power AG',
    operator: 'RWE',
    metadata: {
      sourceAuthority: 'RWE',
      currentEvidence: 'RWE identifies Hambach as its open-cast lignite mining operation in North Rhine-Westphalia and links the mine to ongoing extraction and reclamation planning.'
    },
    sources: [
      evidence('https://www.rwe.com/en/the-group/our-portfolio/rwe-power-ag/lignite-mining/', 'mine_identity_operator_method_and_reclamation_context', 'OPERATOR')
    ]
  },
  SITE_GBR_boulby_potash_mine: {
    owner: 'ICL Boulby',
    operator: 'ICL Boulby',
    metadata: {
      sourceAuthority: 'ICL / public mine references',
      currentEvidence: 'Boulby is an underground potash mining operation in North Yorkshire, with ICL Boulby as the operating business.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Boulby_Mine', 'mine_identity_operator_resource_and_method', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_FIN_kittil_gold_mine: {
    owner: 'Agnico Eagle',
    operator: 'Agnico Eagle Finland',
    metadata: {
      sourceAuthority: 'Agnico Eagle',
      currentEvidence: 'Kittilä is Agnico Eagle’s underground gold mine in Finnish Lapland; the operation is active and forms part of the company’s current European production base.'
    },
    sources: [
      evidence('https://www.agnicoeagle.com/English/operations/operations/kittila/default.aspx', 'current_operator_mine_type_and_production_context', 'OPERATOR')
    ]
  },
  SITE_ARG_cerro_negro_gold_mine: {
    owner: 'Newmont',
    operator: 'Newmont Argentina',
    quantitativeReserve: { quantity: 3000000, unit: 'troy_ounces_gold', year: 2025, status: 'OBSERVED' },
    metadata: {
      sourceAuthority: 'Newmont',
      currentEvidence: 'Newmont describes Cerro Negro as a current underground gold operation in Santa Cruz Province. FY2025 reserves were 3.0 million ounces of gold and 20.3 million ounces of silver.'
    },
    sources: [
      evidence('https://operations.newmont.com/latin-america/cerro-negro-argentina/', 'current_operator_mine_type_reserves_and_current_status', 'OPERATOR')
    ]
  },
  SITE_PER_antamina_copper_zinc_mine: {
    owner: 'BHP / Glencore / Teck / Mitsubishi',
    operator: 'Compañía Minera Antamina S.A.',
    metadata: {
      sourceAuthority: 'BHP 2026 annual filing',
      currentEvidence: 'Antamina is a large open-cut copper-zinc mine independently operated by Compañía Minera Antamina S.A.; FY2026 production included 152 kt copper and 96 kt zinc.'
    },
    sources: [
      evidence('https://www.sec.gov/Archives/edgar/data/811809/000119312526354647/bhp-20260630.htm', 'current_ownership_operator_mining_method_and_recent_production', 'REGULATORY_FILING')
    ]
  },
  SITE_PAN_cobre_panam_mine: {
    owner: 'First Quantum Minerals / Panama',
    operator: 'Minera Panamá / First Quantum Minerals',
    operationalStatus: 'PRESERVATION_AND_SAFE_MANAGEMENT',
    metadata: {
      sourceAuthority: 'First Quantum / Government of Panama',
      currentEvidence: 'Cobre Panamá remains under Preservation and Safe Management with mining production halted. In April 2026 Panama approved processing/export of stockpiled ore extracted before suspension; that activity is explicitly not a mine reopening.'
    },
    sources: [
      evidence('https://www.first-quantum.com/news/government-of-panama-approves-processing-of-stockpiled-ore-at-cobre-panama/', '2026_current_operational_status_and_stockpile_processing', 'OPERATOR'),
      evidence('https://www.first-quantum.com/operations/cobre-panama/', 'mine_identity_location_reserves_and_preservation_status', 'OPERATOR')
    ]
  },
  SITE_GTM_fenix_nickel_mine: {
    owner: 'Fenix Nickel Company / Guatemalan operating entities',
    operator: 'Fenix Minerales S.A.',
    quantitativeReserve: { quantity: 36200000, unit: 'metric_tons_nickel_ore', year: 2024, status: 'OBSERVED' },
    quantitativeGrade: { value: 1.86, unit: 'percent_nickel', status: 'OBSERVED' },
    metadata: {
      sourceAuthority: 'Fenix Nickel / Solway',
      currentEvidence: 'Fenix Nickel announced processing-plant operations resumed in El Estor in May 2026. The group identifies Fenix Minerales S.A. as responsible for nickel laterite ore extraction and Fenix Metales S.A. for ferronickel production.',
      historicalResourceContext: '36.2 Mt nickel-ore reserves at 1.86% Ni plus 70.0 Mt of additional resources are reported for the project license area.'
    },
    sources: [
      evidence('https://fenixnickel.com/2026/05/26/fenix-nickel-commenced-operations-in-el-estor-following-a-comprehensive-business-transformation/', '2026_current_processing_operations_and_corporate_structure', 'OPERATOR'),
      evidence('https://solwaygroup.com/our-business/fenix-project-guatemala/', 'reserve_grade_mining_and_processing_context', 'PROJECT_OWNER')
    ]
  }
};

function applyFix(site, fix) {
  if (!fix) return;
  for (const key of ['owner','operator','status','operationalStatus']) {
    if (fix[key] !== undefined) site[key] = fix[key];
  }
  site.researchMetadata = {
    ...(site.researchMetadata || {}),
    reviewedAt: REVIEW_DATE,
    sourceAuthority: fix.metadata?.sourceAuthority || site.researchMetadata?.sourceAuthority,
    ...(fix.metadata || {})
  };
  if (fix.quantitativeReserve) {
    site.quantitativeProfile = site.quantitativeProfile || {};
    site.quantitativeProfile.reserve = { ...fix.quantitativeReserve };
  }
  if (fix.quantitativeGrade) {
    site.quantitativeProfile = site.quantitativeProfile || {};
    site.quantitativeProfile.grade = { ...fix.quantitativeGrade };
  }
  if (fix.sources?.length) {
    const existing = Array.isArray(site.webResearchEvidence) ? site.webResearchEvidence : [];
    for (const item of fix.sources) if (!existing.some((x) => x?.url === item.url)) existing.push(item);
    site.webResearchEvidence = existing;
    site.researchState = 'SITE_SPECIFIC_WEB_REVIEWED';
    site.dataCompleteness = site.dataCompleteness || {};
    site.dataCompleteness.webResearch = 'SITE_SPECIFIC_WEB_REVIEWED';
  }
  if (site.owner == null || String(site.owner).trim() === '') site.owner = 'UNOBSERVED';
  if (site.operator == null || String(site.operator).trim() === '') site.operator = 'UNOBSERVED';
  site.extractionProfile = site.extractionProfile || {};
  site.extractionProfile.owner = site.owner;
  site.extractionProfile.operator = site.operator;
  site.extractionProfile.ownerEvidenceStatus = site.owner === 'UNOBSERVED' ? 'UNOBSERVED' : 'WEB_REVIEWED';
  site.extractionProfile.operatorEvidenceStatus = site.operator === 'UNOBSERVED' ? 'UNOBSERVED' : 'WEB_REVIEWED';
  site.dataStatus = site.dataStatus || {};
  site.dataStatus.ownership = site.owner === 'UNOBSERVED' ? 'UNOBSERVED' : 'OBSERVED';
  site.dataCompleteness = site.dataCompleteness || {};
  site.dataCompleteness.ownership = site.owner === 'UNOBSERVED' ? 'UNOBSERVED' : 'REPORTED';
}

function buildSiteDataPackage(countryId, site) {
  const rp = site.resourceIdentity || {};
  const lp = site.locationIdentity || {};
  const ep = site.extractionProfile || {};
  const qp = site.quantitativeProfile || {};
  const packageData = {
    schemaVersion: '1.0.0',
    siteId: site.id,
    siteName: site.siteName,
    identity: {
      countryIso3: countryId,
      siteType: site.siteType,
      resourceTypeId: site.resourceTypeId,
      resourceName: rp.commodityName || rp.resourceTypeId || site.resourceTypeId,
      ontologyKey: rp.ontologyKey || null
    },
    location: {
      countryName: lp.countryName || null,
      adminRegion: lp.adminRegion || null,
      locality: lp.locality || null,
      coordinates: lp.coordinates || null,
      coordinateStatus: lp.coordinateStatus || null
    },
    ownership: {
      owner: site.owner ?? 'UNOBSERVED',
      operator: site.operator ?? 'UNOBSERVED',
      ownerEvidenceStatus: ep.ownerEvidenceStatus || 'UNOBSERVED',
      operatorEvidenceStatus: ep.operatorEvidenceStatus || 'UNOBSERVED'
    },
    operation: {
      status: site.status,
      operationalStatus: site.operationalStatus,
      extractionMethod: site.extractionMethod || null,
      extractionEligibility: site.extractionEligibility || null,
      commercialExtraction: site.commercialExtraction ?? null
    },
    processing: {
      upstreamProcess: rp.upstreamProcess || null,
      midstreamProcess: rp.midstreamProcess || null,
      refinedOutputs: Array.isArray(rp.refinedOutputs) ? rp.refinedOutputs : [],
      downstreamSectors: Array.isArray(rp.downstreamSectors) ? rp.downstreamSectors : []
    },
    quantitative: {
      reserve: qp.reserve || { quantity: null, unit: null, status: 'UNOBSERVED' },
      production: qp.production || { annual: null, rate: null, unit: null, year: null, status: 'UNOBSERVED' },
      grade: qp.grade || { value: null, unit: null, status: 'UNOBSERVED' }
    },
    verification: {
      researchState: site.researchState,
      reviewedAt: site.researchMetadata?.reviewedAt || null,
      sourceCount: Array.isArray(site.webResearchEvidence) ? site.webResearchEvidence.length : 0,
      sourceAuthorities: Array.from(new Set(
        (Array.isArray(site.webResearchEvidence) ? site.webResearchEvidence : [])
          .map((x) => x?.sourceType || null)
          .filter(Boolean)
      )),
      dataLimitations: site.researchMetadata?.dataLimitation || null
    }
  };
  site.siteDataPackage = packageData;
}

const sites = [];
for (const [countryId, profile] of Object.entries(profiles)) {
  const rows = profile?.resource_infrastructure_context?.mineSites;
  if (!Array.isArray(rows)) continue;
  for (const site of rows) sites.push({ countryId, site });
}
if (sites.length !== 199) throw new Error('Expected exactly 199 mine-site references.');

for (const { site, countryId } of sites) applyFix(site, fixes[site.id]);

// Prevent semantically unsupported placeholder identities from surviving as if they were real companies.
const placeholders = new Set([
  'private concession holders',
  'project concession interests',
  'government / private',
  'local operators',
  'state / private interests',
  'cement-sector operators',
  'private mining interests',
  'ukrainian operators/state',
  'kryvyi rih operators',
  'nilepet / consortium',
  'former midroc'
]);
for (const { site } of sites) {
  site.dataCompleteness = site.dataCompleteness || {};
  if (String(site.status).toUpperCase() === 'NOT_APPLICABLE' || site.commercialExtraction === false) {
    site.researchState = 'NOT_APPLICABLE_NO_COMMERCIAL_SITE';
    site.dataCompleteness.webResearch = 'NOT_APPLICABLE';
  } else if (!site.researchState) {
    site.researchState = Array.isArray(site.webResearchEvidence) && site.webResearchEvidence.length > 0
      ? 'SITE_SPECIFIC_WEB_REVIEWED'
      : 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED';
    site.dataCompleteness.webResearch = site.researchState;
  } else if (site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED') {
    site.dataCompleteness.webResearch = 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED';
  } else if (site.researchState === 'SITE_SPECIFIC_WEB_REVALIDATED' || site.researchState === 'SITE_SPECIFIC_WEB_REVIEWED') {
    site.dataCompleteness.webResearch = site.researchState;
  }
  if (String(site.status).toUpperCase() === 'ACTIVE_PRODUCING' && site.commercialExtraction !== false) {
    site.extractionEligibility = 'EXECUTABLE';
  } else if (String(site.status).toUpperCase() === 'NOT_APPLICABLE' || site.commercialExtraction === false) {
    site.extractionEligibility = 'NON_EXECUTABLE';
  }
  for (const field of ['owner','operator']) {
    const value = String(site[field] ?? '').trim().toLowerCase();
    if (placeholders.has(value)) {
      site[field] = 'UNOBSERVED';
      site.extractionProfile = site.extractionProfile || {};
      site.extractionProfile[field] = 'UNOBSERVED';
      site.extractionProfile[field + 'EvidenceStatus'] = 'UNOBSERVED';
      site.dataStatus = site.dataStatus || {};
      site.dataStatus.ownership = 'UNOBSERVED';
      site.dataCompleteness = site.dataCompleteness || {};
      site.dataCompleteness.ownership = 'UNOBSERVED';
    }
  }
  buildSiteDataPackage(sites.find((x) => x.site === site)?.countryId || site.countryCode, site);
}

const report = {
  generatedAt: REVIEW_DATE,
  totalSites: sites.length,
  explicitFixCount: Object.keys(fixes).length,
  sourceBackedReviewedSites: sites.filter(({site}) => site.researchState === 'SITE_SPECIFIC_WEB_REVIEWED').length,
  stillLegacySites: sites.filter(({site}) => site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED').length,
  explicitOwnerSites: sites.filter(({site}) => site.owner && site.owner !== 'UNOBSERVED').length,
  explicitOperatorSites: sites.filter(({site}) => site.operator && site.operator !== 'UNOBSERVED').length,
  siteDataPackageCount: sites.filter(({site}) => site.siteDataPackage).length,
  unresolvedOwnershipSites: sites.filter(({site}) => site.owner === 'UNOBSERVED').map(({site}) => site.id),
  unresolvedOperatorSites: sites.filter(({site}) => site.operator === 'UNOBSERVED').map(({site}) => site.id),
  reviewedSiteIds: sites.filter(({site}) => site.researchState === 'SITE_SPECIFIC_WEB_REVIEWED').map(({site}) => site.id)
};
fs.writeFileSync('resource_site_authoritative_corrections_report.json', JSON.stringify(report, null, 2) + '\n');

for (const file of files) fs.writeFileSync(file, JSON.stringify(loaded[files.indexOf(file)], null, 2) + '\n');

// Generate a canonical flat catalog for runtime/AI consumers.
const catalog = sites.map(({countryId, site}) => ({
  countryId,
  ...site.siteDataPackage
}));
fs.writeFileSync('resource_site_canonical_catalog_v1.json', JSON.stringify({
  schemaVersion: '1.0.0',
  generatedAt: REVIEW_DATE,
  siteCount: catalog.length,
  sites: catalog
}, null, 2) + '\n');

execFileSync('git', ['config', 'user.name', 'github-actions[bot]'], { stdio: 'inherit' });
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { stdio: 'inherit' });
execFileSync('git', ['add', 'resources.json', 'resources_2.json', 'resource_site_authoritative_corrections_report.json', 'resource_site_canonical_catalog_v1.json'], { stdio: 'inherit' });
try {
  execFileSync('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' });
  process.exit(0);
} catch {
  // Staged changes exist; the workflow commit step will commit and push.
}
