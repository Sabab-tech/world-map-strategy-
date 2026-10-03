#!/usr/bin/env node
// [resource-targeted-repair] [resource-data-only] current authoritative correction pass v4
// [resource-targeted-repair] [resource-data-only] current authoritative correction pass v2
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const REVIEW_DATE = '2026-10-03';
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
  SITE_ERI_bisha_mine: {
    process: {
      resourceTypeId: 'zinc',
      ontologyKey: 'ZINC',
      commodityName: 'Zinc Ore & Concentrates',
      category: 'BASE_METAL',
      physicalForm: 'SOLID_ORE_AND_CONCENTRATE',
      upstreamProcess: 'Open-Pit / Underground Sulfide Mining',
      midstreamProcess: 'Flotation, Roasting, Leaching, Electrowinning',
      refinedOutputs: ['SPECIAL_HIGH_GRADE_ZINC', 'GALVANIZED_STEEL', 'BRASS'],
      downstreamSectors: ['BATTERIES'],
      ontologyStatus: 'RESOLVED_FROM_RESOURCE_ONTOLOGY',
      canonicalResourceId: 'zinc',
      primaryCommodity: 'zinc',
      secondaryCommodities: ['copper', 'silver']
    },
    metadata: {
      sourceAuthority: 'Zijin Mining',
      currentEvidence: 'Zijin identifies Bisha as a producing copper-zinc mine in Eritrea. The site operates open-pit and underground mining with flotation; 2025 reported output included 83 kt zinc, 23 kt copper and 63.4 t silver.'
    },
    quantitativeProduction: {
      annual: {
        value: 83000,
        unit: 'metric_tons_zinc',
        year: 2025
      },
      rate: null,
      unit: 'metric_tons_zinc',
      year: 2025,
      status: 'OBSERVED'
    },
    quantitativeGrade: {
      value: 3.64,
      unit: 'percent_zinc',
      status: 'OBSERVED'
    },
    sources: [
      evidence('https://www.zijinmining.com/global/program-detail-71760.htm', '2025_bisha_zinc_copper_silver_output_resource_identity_and_mining_method', 'OPERATOR')
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
  },
  SITE_ETH_lega_dembi_gold_mine: {
    owner: 'MIDROC Investment Group',
    operator: 'MIDROC Gold Mine PLC',
    status: 'SUSPENDED',
    operationalStatus: 'SUSPENDED',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Open-pit and underground mining; ROM ore crushing followed by cyanide processing',
    metadata: {
      sourceAuthority: 'International Cyanide Management Institute / MIDROC',
      currentEvidence: 'The 2025 audit identifies MIDROC Investment Group as owner and MIDROC Gold Mine PLC as operator. Ore is sourced from open-pit, Legadembi underground and Sakaro underground workings and processed through a multi-stage crushing circuit.'
    },
    sources: [
      evidence('https://cyanidecode.org/wp-content/uploads/2024/02/MIDROCLegadembiSAR2026.pdf', 'owner_operator_location_mining_method_crushing_processing', 'AUDIT')
    ]
  },
  SITE_COM_grande_comore_basalt_aggregate_sites: {
    owner: 'CBE BTP',
    operator: 'CBE BTP',
    extractionMethod: 'Basalt quarrying with crushing and aggregate production',
    metadata: {
      sourceAuthority: 'CBE BTP',
      currentEvidence: 'CBE identifies its principal aggregate quarries at Handouli and Pvanamboini on Grande Comore and states that it operates crushing stations and aggregate production across the Comoros.'
    },
    sources: [
      evidence('https://www.wiya.info/en/company/cbe', 'operator_quarries_crushing_and_aggregate_production', 'COMPANY')
    ]
  },
  SITE_ARE_fujairah_aggregate_quarries: {
    owner: 'United Quarries',
    operator: 'United Quarries',
    extractionMethod: 'Hard-rock gabbro quarrying with blasting, crushing, sizing and marine export logistics',
    metadata: {
      sourceAuthority: 'United Quarries',
      currentEvidence: 'United Quarries identifies Al Hayl and Al Nujaimat as operating quarry sites in Fujairah and documents blasting, aggregate production and export logistics. This repository record represents the Fujairah operator area rather than one concession polygon.'
    },
    sources: [
      evidence('https://www.unitedquarries.com/united-quarries-operation-sites.html', 'current_operator_sites_mining_method_capacity_and_logistics', 'OPERATOR'),
      evidence('https://www.unitedquarries.com/company-overview.html', 'company_identity_and_fujairah_quarry_operations', 'OPERATOR')
    ]
  },
  SITE_LBN_chekka_limestone_quarry_zone: {
    owner: 'Holcim Lebanon',
    operator: 'Holcim Lebanon',
    status: 'LIMITED',
    operationalStatus: 'LIMITED',
    extractionEligibility: 'CONDITIONAL',
    extractionMethod: 'Limestone quarrying subject to quarry licensing and environmental controls',
    metadata: {
      sourceAuthority: 'Holcim Lebanon / Lebanese public reporting',
      currentEvidence: 'Holcim documents quarry rehabilitation in Chekka. 2026 reporting shows cement-quarry reopening is subject to licensing and was affected by a State Council suspension, so unconditional continuous extraction is not assumed.'
    },
    sources: [
      evidence('https://www.holcim.com.lb/quarry-rehabilitation-project-chekka', 'operator_identity_quarry_location_and_rehabilitation', 'OPERATOR'),
      evidence('https://today.lorientlejour.com/article/1542195/state-council-halts-government-measures-reopening-cement-quarries.html', '2026_quarry_reopening_legal_constraint', 'NEWS')
    ]
  },
  SITE_KOR_samcheok_limestone_mining_district: {
    owner: 'Multiple limestone mine concessionaires',
    operator: 'Multiple limestone mining operators',
    ownershipScope: 'DISTRICT_MULTI_OPERATOR',
    extractionMethod: 'Limestone mining using open-pit/glory-hole and underground methods depending on the mine seat',
    metadata: {
      sourceAuthority: 'SAMPYO Cement / Epiroc',
      currentEvidence: 'Current public operator sources document more than one Samcheok limestone operation, including a Daesung MDI-operated mine and SAMPYO Cement limestone mining using glory-hole methods. The repository record is therefore area-level and multi-operator.'
    },
    sources: [
      evidence('https://www.epiroc.com/en-ca/customer-stories/2025/boomer-s2-part-of-an-autonomous-future', 'samcheok_mine_operator_and_mining_context', 'EQUIPMENT_SUPPLIER'),
      evidence('https://www.sampyocement.co.kr/eng/product/product_sub1.php', 'samcheok_limestone_mine_and_glory_hole_method', 'OPERATOR')
    ]
  },
  SITE_MYS_penjom_gold_mine: {
    owner: 'J Resources Gold (UK) Limited / J Resources group',
    operator: 'J Resources Asia Pasifik / Penjom Mine',
    extractionMethod: 'Conventional open-pit mining with resin-in-leach processing',
    quantitativeReserve: { quantity: 414000, unit: 'troy_ounces_gold', year: 2023, status: 'OBSERVED' },
    metadata: {
      sourceAuthority: 'J Resources',
      currentEvidence: 'J Resources states that Penjom is owned through J Resources Gold (UK) Limited, has been in production since late 1996, and had 414,000 oz JORC Proven & Probable gold reserves as of 31 December 2023. Penjom uses resin-in-leach processing.'
    },
    sources: [
      evidence('https://www.jresources.com/penjom-mine', 'current_owner_production_history_reserves_and_location', 'OPERATOR'),
      evidence('https://www.jresources.com/about-us', 'current_group_operation_and_processing_method', 'OPERATOR')
    ]
  },
  SITE_FRA_prasville_limestone_quarry: {
    owner: 'Société des Matériaux de Beauce (SMB)',
    operator: 'Société des Matériaux de Beauce (SMB)',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Limestone quarry extraction with crushing and mineral processing',
    metadata: {
      sourceAuthority: 'French government public business and environmental registers',
      currentEvidence: 'French public registers list SMB as an active Prasville quarry establishment with a quarry exploitation authorization; the site is also registered for crushing and mineral processing activities.'
    },
    sources: [
      evidence('https://annuaire-entreprises.data.gouv.fr/entreprise/301894887', 'current_legal_entity_and_prasville_quarry_activity', 'GOVERNMENT_REGISTER'),
      evidence('https://www.georisques.gouv.fr/risques/installations/donnees/details/0010002647', 'current_prasville_quarry_authorization_and_operating_status', 'GOVERNMENT_REGISTER')
    ]
  },
  SITE_ITA_carrara_marble_quarries: {
    owner: 'Multiple private quarry concessionaires',
    operator: 'Multiple private marble quarry operators',
    ownershipScope: 'DISTRICT_MULTI_OPERATOR',
    extractionMethod: 'Open-air and underground dimension-stone quarrying',
    metadata: {
      sourceAuthority: 'Current Carrara quarry operators',
      currentEvidence: 'Carrara is a multi-concession marble basin. Current operator pages document separate active quarry concessions, including Gualtiero Corsi and F.lli Antonioli, so the repository record is explicitly modeled as multi-operator.'
    },
    sources: [
      evidence('https://www.gualtierocorsi.it/en/the-company/', 'current_carrara_quarry_operator_and_concession', 'OPERATOR'),
      evidence('https://www.antonioli.com/en/', 'current_carrara_quarry_operator_and_own_quarry', 'OPERATOR')
    ]
  },
  SITE_UKR_kryvyi_rih_iron_ore_district: {
    owner: 'Multiple iron-ore companies and state-linked concession interests',
    operator: 'Multiple iron-ore mining and beneficiation operators',
    ownershipScope: 'DISTRICT_MULTI_OPERATOR',
    extractionMethod: 'Open-pit and underground iron-ore mining with crushing and beneficiation',
    metadata: {
      sourceAuthority: 'ArcelorMittal Kryvyi Rih / Dnipropetrovsk Investment Agency',
      currentEvidence: 'The Kryvyi Rih record is a district-level aggregate. ArcelorMittal Kryvyi Rih documents underground mining plus open-cast mining and beneficiation, while regional reporting documents wider wartime disruption and multiple facilities across the district.'
    },
    sources: [
      evidence('https://ukraine.arcelormittal.com/en/production-sycle/iron-ore-mining-and-processing', 'mine_methods_beneficiation_products_and_capacity', 'OPERATOR'),
      evidence('https://dia.dp.gov.ua/en/investments-and-support-mechanisms-for-the-mining-and-metallurgical-complex/', '2026_district_operational_context', 'REGIONAL_GOVERNMENT')
    ]
  },
  SITE_SVN_trbovlje_limestone_quarry_zone: {
    owner: 'UNOBSERVED',
    operator: 'UNOBSERVED',
    status: 'NO_CURRENT_CONCESSION',
    operationalStatus: 'NO_CURRENT_CONCESSION',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical industrial limestone extraction; no current concession verified',
    metadata: {
      sourceAuthority: 'Geological Survey of Slovenia mining database',
      currentEvidence: 'The official database records the Trbovlje-Hrastnik limestone mining right through 31 December 2018 with no concessionaire from 2019 onward. Related Retje-Plesko limestone/marl records show no concessionaire in 2026.'
    },
    sources: [
      evidence('https://ms.geo-zs.si/en-gb/Prostor/Podrobnosti/154', 'historical_limestone_right_and_end_of_concession', 'GOVERNMENT_GEOLOGICAL_SURVEY'),
      evidence('https://ms.geo-zs.si/en-gb/Prostor/Podrobnosti/126', '2026_no_concessionaire_for_related_limestone_site', 'GOVERNMENT_GEOLOGICAL_SURVEY')
    ]
  },
  SITE_URY_minas_de_corrales_gold_mining_district: {
    owner: 'Domo Minerales',
    operator: 'Domo Minerales',
    status: 'RESTARTING',
    operationalStatus: 'RESTARTING',
    extractionEligibility: 'CONDITIONAL',
    extractionMethod: 'Gold mining district with ore-processing plant rehabilitation and restart',
    metadata: {
      sourceAuthority: 'Intendencia Departamental de Rivera',
      currentEvidence: 'On 29 September 2026 the Rivera departmental government reported that Domo Minerales was resuming activities at the gold production plant in Minas de Corrales and rehabilitating the installations.'
    },
    sources: [
      evidence('https://www.rivera.gub.uy/portal/buenas-noticias-para-rivera-domo-minerales-retoma-actividades-en-minas-de-corrales/', '2026_current_operator_and_reactivation_status', 'GOVERNMENT')
    ]
  },
  SITE_VUT_luganville_aggregate_quarry_zone: {
    owner: 'Multiple private quarry operators',
    operator: 'KD Enterprise Ltd. / Santo Earthworks Ltd.',
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extractionMethod: 'Rock quarrying with crushing and aggregate production',
    metadata: {
      sourceAuthority: 'Current Vanuatu quarry/construction operators',
      currentEvidence: 'KD Enterprise documents a crushing and screening plant in Luganville supplying sand and aggregate; Santo Earthworks is also publicly listed in Luganville under quarry products, sand and concrete.'
    },
    sources: [
      evidence('https://www.kdentreprise.com/about', 'current_luganville_crushing_screening_and_aggregate_supply', 'OPERATOR'),
      evidence('https://www.yellowpages.vu/1336-santo-earthworks', 'luganville_quarry_products_operator_listing', 'BUSINESS_DIRECTORY')
    ]
  },
  SITE_TON_nuku_alofa_aggregate_quarry_zone: {
    owner: 'Multiple private quarry operators and land interests',
    operator: 'Multiple operators including FATA KIHE HAU & SONS and Nishi Trading',
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extractionMethod: 'Quarry extraction, crushing and aggregate/gravel supply',
    metadata: {
      sourceAuthority: 'Current Tonga quarry operators',
      currentEvidence: 'FATA KIHE HAU & SONS identifies itself as a quarrying partner operating in Nuku\'alofa and describes extraction, crushing and supply. Nishi Trading independently lists a quarry at Pili, Tongatapu.'
    },
    sources: [
      evidence('https://www.fata200.com/', 'current_nukualofa_quarry_operator_and_process', 'OPERATOR'),
      evidence('https://chris-brimble-y2se.squarespace.com/contact-us', 'current_tongatapu_quarry_location', 'OPERATOR')
    ]
  },
  SITE_FSM_pohnpei_aggregate_quarry_zone: {
    owner: 'APSCO',
    operator: 'APSCO',
    extractionMethod: 'Hard-rock basalt quarrying with aggregate production',
    metadata: {
      sourceAuthority: 'SPC/SOPAC technical quarry assessment',
      currentEvidence: 'The Pohnpei quarry assessment identifies the existing hard-rock quarry at Ipwal Sokes as owned and operated by APSCO and describes basalt aggregate use for road base, concrete, reclamation and armour rock.'
    },
    sources: [
      evidence('https://www.researchgate.net/publication/270049924_Identification_of_onshore_aggregate-quarry_sites_prospects_for_development_Pohnpei_Isand_Federated_States_of_Micronesia', 'quarry_identity_owner_operator_and_hard_rock_resource', 'SPC_SOPAC')
    ]
  },

  SITE_BTN_tsirang_limestone_quarries: {
    owner: 'Historical operators including Mr. Pasang Tamang and Wakleytar Taksha Mining Private Limited',
    operator: 'Historical operators including Mr. Pasang Tamang and Wakleytar Taksha Mining Private Limited',
    ownershipScope: 'HISTORICAL_MULTI_OPERATOR',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    metadata: {
      sourceAuthority: 'Royal Audit Authority of Bhutan',
      currentEvidence: 'Bhutan audit records identify Kuchikhola Stone Quarry in Tsirang under Mr. Pasang Tamang with a permit ending in 2014 and Wakletar Stone Quarry under Wakleytar Taksha Mining Private Limited with a permit ending in 2019. The repository record therefore must not be treated as an unqualified active 2026 mine without a newer site-specific concession record.'
    },
    sources: [
      evidence('https://www.bhutanaudit.gov.bt/wp-content/uploads/2020/08/Performance_Audit_Report_on_Mining_and_Quarry_2014.pdf', 'historical_tsirang_quarry_operators_permit_dates_and_quarry_identity', 'GOVERNMENT_AUDIT')
    ]
  },
  SITE_CPV_santiago_pozzolana_quarry_zone: {
    owner: 'CIMPOR – Cabo Verde, SA (project proponent)',
    operator: 'CIMPOR – Cabo Verde, SA (project proponent; operator not separately verified)',
    status: 'DEVELOPMENT',
    operationalStatus: 'DEVELOPMENT',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Surface extraction of volcanic pozzolana for construction-material use',
    metadata: {
      sourceAuthority: 'Ministry of Agriculture and Environment, Cabo Verde',
      currentEvidence: 'The Cabo Verde environmental authority published the EIA for the Monte Vermelho pozzolana extraction project in Praia, Santiago, naming CIMPOR – Cabo Verde, SA as the project proponent. This is a development/EIA-stage project, not verified current commercial extraction.',
      resourceIdentityNote: 'Keep ontology resourceTypeId as construction_aggregate because the repository ontology has no dedicated pozzolana type; explicitly record pozzolana as the material subtype.'
    },
    sources: [
      evidence('https://maa.gov.cv/index.php/min-a-a/83-ambiente/avaliacao-do-impacte-ambiental/estudos-da-eia/324-estudo-de-impacte-ambiental-do-projeto-extracao-de-pozolanas-do-monte-vermelho', 'santiago_pozzolana_project_identity_proponent_and_development_stage', 'GOVERNMENT')
    ]
  },
  SITE_MUS_basalt_aggregate_quarry_zone: {
    owner: 'Multiple basalt quarry interests including United Basalt Products Limited',
    operator: 'United Basalt Products Limited (major basalt-aggregate operator)',
    ownershipScope: 'AREA_REPRESENTATIVE_OPERATOR',
    extractionMethod: 'Surface basalt extraction, crushing and aggregate production',
    metadata: {
      sourceAuthority: 'United Basalt Products Limited / Stock Exchange of Mauritius',
      currentEvidence: 'UBP reports current basaltic-rock extraction and crushing for aggregate production and describes itself as the main supplier of aggregates in its Mauritian building-materials value chain. The repository record is an area-level basalt zone rather than a single concession.'
    },
    sources: [
      evidence('https://integratedreport.ubp.mu/2025/', 'current_basalt_extraction_crushing_and_aggregate_supply', 'OPERATOR'),
      evidence('https://www.stockexchangeofmauritius.com/company-snapshot/official-market/the-united-basalt-products-limited?market=Official', 'current_company_identity_and_mauritius_operations', 'REGULATORY_MARKET')
    ]
  },
  SITE_TWN_hualien_marble_quarry_zone: {
    owner: 'Multiple Hualien quarry interests including Asia Cement Corporation',
    operator: 'Multiple Hualien quarry operators including Asia Cement Corporation',
    ownershipScope: 'DISTRICT_MULTI_OPERATOR',
    status: 'LIMITED',
    operationalStatus: 'LIMITED',
    extractionEligibility: 'CONDITIONAL',
    extractionMethod: 'Surface marble/stone quarrying with cutting and stone processing',
    metadata: {
      sourceAuthority: 'Taiwan Ministry of Economic Affairs / public Hualien quarry records',
      currentEvidence: 'Public reporting documents Asia Cement Corporation operating a marble quarry in Hualien County and also documents permit/litigation constraints. Separate Hualien stone businesses are registered by the county government. The repository record is therefore modeled as a multi-operator Hualien quarry zone, not a single company mine.'
    },
    sources: [
      evidence('https://www.taipeitimes.com/News/front/archives/2019/07/12/2003718520', 'hualien_marble_quarry_operator_and_mining_right_status', 'NEWS'),
      evidence('https://www.taipeitimes.com/News/taiwan/archives/2018/03/01/2003688480', 'hualien_quarry_operator_and_regulatory_context', 'NEWS'),
      evidence('https://findbiz.nat.gov.tw/fts/factory/45/07610099122696?fhl=en', 'hualien_stone_company_registration', 'GOVERNMENT_REGISTER')
    ]
  },
  SITE_MLT_al_far_limestone_quarry: {
    owner: 'UNOBSERVED',
    operator: 'UNOBSERVED',
    status: 'PERMIT_PROCESSING',
    operationalStatus: 'PERMIT_PROCESSING',
    extractionEligibility: 'CONDITIONAL',
    extractionMethod: 'Hardstone extraction, inert-waste recycling and quarry backfilling',
    extra: {
      currentStatus: 'Current ERA permit application EP 0025/19 for HM18 Wied Moqbol, Hal Far is being processed for hardstone extraction, inert-waste recycling and quarry backfilling; current site owner/operator is not established from the permit summary.'
    },
    metadata: {
      sourceAuthority: 'Environment and Resources Authority, Malta',
      permit: 'EP 0025/19, Quarry HM18 Wied Moqbol, Hal Far',
      currentEvidence: 'ERA currently lists HM18 Wied Moqbol, Hal Far under EP 0025/19 for extraction of hardstone, recycling of inert waste and backfilling, with the application status shown as Being Processed. No site-specific owner/operator is asserted from the permit summary alone.'
    },
    sources: [
      evidence('https://era.org.mt/topic/quarries/', 'current_hal_far_quarry_permit_status_and_activity', 'GOVERNMENT'),
      evidence('https://www.servizz.gov.mt/en/Services/web-01887', 'malta_quarry_permit_requirement_for_mineral_extraction', 'GOVERNMENT')
    ]
  },
  SITE_SLV_el_dorado_gold_project: {
    owner: 'Pacific Rim Mining Corporation (historical project interest)',
    operator: 'Pacific Rim Mining Corporation (historical project operator)',
    ownershipScope: 'HISTORICAL_PROJECT_INTEREST',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical underground gold mining and exploration; no confirmed current commercial operation',
    metadata: {
      sourceAuthority: 'Pacific Rim Mining Corporation SEC filing / public historical record',
      currentEvidence: 'Pacific Rim filings identify the El Dorado gold project in Cabañas and state that Pacific Rim owned 100% of the project through its subsidiaries. The historical mine operated from 1948 to 1953; later exploration did not result in a current commercial mining operation. Current data should therefore preserve historical ownership separately from present-day executable extraction.'
    },
    sources: [
      evidence('https://www.sec.gov/Archives/edgar/data/1056512/000106299312002578/form20f.htm', 'historical_project_owner_location_exploration_licenses_and_project_status', 'SEC_FILING'),
      evidence('https://www.sec.gov/Archives/edgar/data/1056512/000106299303001283/exhibit99-1.htm', 'historical_mining_and_resource_project_identity', 'SEC_FILING')
    ]
  },
  SITE_CUB_nicaro_nickel_complex: {
    owner: 'Empresa de Servicios Comandante René Ramos Latour',
    operator: 'Empresa de Servicios Comandante René Ramos Latour',
    ownershipScope: 'HISTORICAL_CONCESSION_HOLDER',
    metadata: {
      sourceAuthority: 'Cuba Council of Ministers / Gaceta Oficial',
      currentEvidence: 'Cuban Council of Ministers records identify Empresa del Níquel Comandante René Ramos Latour, later Empresa de Servicios René Ramos Latour, as the concession holder for exploitation and processing in the Nicaro area for nickeliferous limonite and serpentinite used to produce nickel and cobalt concentrate.',
      temporalScope: 'Concession-holder identity is historical/legal context; the site remains CLOSED and non-executable in the runtime.'
    },
    sources: [
      evidence('https://www.cibercuba.com/s/gacetaoficial/acuerdo-8764-de-2020-de-consejo-de-ministros', 'concession_holder_exploitation_processing_and_nicaro_area', 'GOVERNMENT'),
      evidence('https://www.directoriocubano.com/servicios/gaceta-oficial/2007/ordinaria/69/', 'historical_nicaro_concession_holder_and_partial_closure', 'GOVERNMENT')
    ]
  },
  SITE_GMB_western_gambia_aggregate_quarry_zone: {
    metadata: {
      sourceAuthority: 'Gambia Ministry of Petroleum, Energy and Mines',
      currentEvidence: 'The ministry lists multiple licensed construction-aggregate and construction-sand operators in its mining/quarrying sector. Because this repository record is an area-level quarry zone rather than a single concession polygon, the operator remains UNOBSERVED at site level and the licensed-operator pool is preserved separately.'
    },
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extra: {
      operatorScope: 'AREA_LICENSE_POOL',
      knownLicensedOperatorsSourceStatus: 'GOVERNMENT_REPORTED',
      dataLimitation: 'No source reviewed identifies which licensed operator controls this exact area-level record.'
    },
    sources: [
      evidence('https://mopem.gov.gm/mining-quarrying/', 'licensed_quarry_operator_pool_and_quarry_regulatory_context', 'GOVERNMENT')
    ]
  },
  SITE_PLW_airai_limestone_quarry_zone: {
    owner: 'Surangel & Sons Company',
    operator: 'Surangel & Sons Company',
    ownershipScope: 'SITE_OPERATOR',
    extractionMethod: 'Limestone quarrying with crushing and aggregate-product production',
    metadata: {
      sourceAuthority: 'Surangel & Sons Company / Republic of Palau',
      currentEvidence: 'Surangel & Sons identifies its Ngermellal Quarry in Oikull, Airai as a limestone-products and crusher operation. The repository record is explicitly tied to Ngermellai Limestone Quarry and therefore the company can be named rather than leaving ownership/operator unobserved.'
    },
    extra: {
      siteOperatorEvidenceScope: 'SITE_SPECIFIC'
    },
    sources: [
      evidence('https://surangel.com/oldconstruction/services-revised/mrp/rock-quarry/', 'site_specific_airai_limestone_quarry_operator_and_crusher_operation', 'OPERATOR'),
      evidence('https://www.palaugov.pw/wp-content/uploads/PGST-Registry-as-of-03-05-2026.pdf', 'current_registered_surangel_rock_quarry_and_mason_rock_products_entities', 'GOVERNMENT_REGISTER')
    ]
  },
  SITE_BLZ_hattieville_sand_and_aggregate_sites: {
    metadata: {
      sourceAuthority: 'JICA Belize infrastructure survey / GeoTech Belize',
      currentEvidence: 'A recent Belize infrastructure survey maps several quarry locations in the Hattieville/Western Highway area, including Rockville Quarry, Excel Construction, National Sand & Gravel, Haynessee Limited and Caves Branch. The record remains area-level, so no single operator is asserted for the whole site.'
    },
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extra: {
      knownSectorOperators: [
        'Rockville Quarry',
        'Excel Construction',
        'National Sand & Gravel',
        'Haynessee Limited',
        'Caves Branch'
      ],
      dataLimitation: 'The survey identifies multiple quarry locations in the Hattieville area but does not establish one operator for this aggregate-zone record.'
    },
    sources: [
      evidence('https://openjicareport.jica.go.jp/pdf/12394235.pdf', 'recent_belize_hattieville_area_quarry_locations_and_operator_labels', 'DEVELOPMENT_AGENCY')
    ]
  },
  SITE_MLT_al_far_limestone_quarry: {
    extra: {
      currentStatus: 'Current ERA permit application EP 0025/19 for HM18 Wied Moqbol, Hal Far is being processed for hardstone extraction, inert-waste recycling and quarry backfilling; current site owner/operator is not established from the permit summary.'
    },
    extra: {
      currentStatus: 'Current ERA permit application EP 0025/19 for HM18 Wied Moqbol, Hal Far is being processed for hardstone extraction, inert-waste recycling and quarry backfilling; current site owner/operator is not established from the permit summary.'
    },
    metadata: {
      sourceAuthority: 'Environment and Resources Authority, Malta / historical quarry records',
      historicalOwner: 'Hal Far Quarries Limited',
      currentEvidence: 'ERA currently lists HM18 Wied Moqbol, Hal Far under EP 0025/19 for hardstone extraction, inert-waste recycling and quarry backfilling, with the application status shown as Being Processed. Historical court reporting identifies Hal Far Quarries Limited as the owner of quarry QH18 at Wied Moqbol. The current HM18 permit record does not independently establish that the same entity is the current applicant, so current owner/operator remains UNOBSERVED.'
    },
    sources: [
      evidence('https://era.org.mt/topic/quarries/', 'current_hm18_permit_status_and_activity', 'GOVERNMENT'),
      evidence('https://www.independent.com.mt/articles/2010-12-15/news/from-the-law-courts-284766/', 'historical_hal_far_quarries_owner_of_qh18_wied_moqbol', 'NEWS')
    ]
  },
  SITE_MDV_mal_atoll_coral_aggregate_sites: {
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extra: {
      knownNationwideDredgingOperators: ['Maldives Transport and Contracting Company Plc (MTCC)'],
      operatorEvidenceScope: 'NATIONWIDE_NOT_SITE_SPECIFIC',
      dataLimitation: 'MTCC reports dredging and reclamation operations across all 20 atolls, but the reviewed source does not identify a single operator for this generic Malé Atoll coral-aggregate site record.'
    },
    metadata: {
      sourceAuthority: 'Maldives Transport and Contracting Company Plc (MTCC)',
      currentEvidence: 'MTCC reports a nationwide dredging and reclamation footprint across all 20 atolls, with six dredgers and sand-search capability. This is sector/operator context, not proof of a single Malé Atoll borrow-site operator.'
    },
    sources: [
      evidence('https://corporate.mtcc.mv/', 'nationwide_dredging_reclamation_operator_and_maldivian_atoll_coverage', 'OPERATOR')
    ]
  },
  SITE_ISL_h_lasandur_aggregate_quarry: {
    extra: {
      permittedExtractionLimit: {
        area: 25000,
        areaUnit: 'm2',
        volume: 49000,
        volumeUnit: 'm3',
        sourcePlanningYear: 2025,
        identifier: 'E452'
      },
      quantitativeEvidenceScope: 'PLANNING_EXTRACTION_LIMIT_NOT_RESERVE'
    },
    metadata: {
      sourceAuthority: 'Iceland municipal planning / Hólasandur planning record',
      currentEvidence: 'The published planning proposal lists E452 Hólasandur as a 2.5 ha extraction area with a limit of up to 25,000 m² and 49,000 m³. This is a planning extraction limit, not a mineral reserve estimate, and it does not establish a named operator.'
    },
    sources: [
      evidence('https://geo.alta.is/thing/ask24ask/', 'Holasandur_E452_planning_extraction_area_and_volume_limit', 'PLANNING_DOCUMENT')
    ]
  },
  SITE_HTI_gona_ves_limestone_quarry_zone: {
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extra: {
      historicalAreaResourceEvidence: {
        sourceYear: 1990,
        deposits: [
          {
            locality: 'Morne Blanc, Gonaïves',
            resource: 'limestone_marl',
            exploitableVolume: 2000000,
            unit: 'm3',
            caCO3Range: '85-92 percent',
            evidenceScope: 'HISTORICAL_AREA_RESOURCE'
          }
        ],
        dataLimitation: 'Historical 1990 departmental mineral inventory; this is area geology/resource evidence, not a current concession-level reserve statement.'
      }
    },
    metadata: {
      sourceAuthority: 'Bureau des Mines et de l’Energie / Haiti mineral inventory',
      currentEvidence: 'The Artibonite mineral inventory documents limestone and cement raw-material occurrences around Gonaïves, including Morne Blanc with an estimated 2,000,000 m³ exploitable volume and CaCO3 of 85-92%. The repository record remains area-level and does not assign a single current operator.'
    },
    sources: [
      evidence('https://www.haitidocs.org/doc/bme-inventaire-minier-artibonite', 'gonaives_limestone_area_identity_and_historical_resource_characteristics', 'MINERAL_INVENTORY')
    ]
  },
  SITE_WSM_lefaga_aggregate_quarry_zone: {
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extra: {
      regulatoryAuthority: 'Planning and Urban Management Authority (PUMA)',
      dataLimitation: 'Public aggregate review identifies Lefaga volcanic/alluvial sources and requires PUMA applications for extraction; the reviewed source does not establish one operator for this area-level record.'
    },
    metadata: {
      sourceAuthority: 'Samoa environmental and aggregate planning sources',
      currentEvidence: 'Samoa earth-material extraction, including aggregates, requires PUMA applications. Public aggregate reviews identify volcanic hard rock and alluvial/coastal aggregate sources in the Lefaga area.'
    },
    sources: [
      evidence('https://www.mnre.gov.ws/wp-content/uploads/2024/09/Final-Samoa-SOE-2023-v39-digital-1.pdf', 'Samoa_PUMA_regulatory_requirement_for_aggregate_extraction', 'GOVERNMENT'),
      evidence('https://theprif.org/sites/theprif.org/files/documents/PRIF-Aggregates-Report_final.pdf', 'Lefaga_volcanic_and_alluvial_aggregate_source_context', 'DEVELOPMENT_AGENCY')
    ]
  },
  SITE_TUV_funafuti_borrow_pits: {
    extra: {
      historicalOperationalAuthority: 'Tuvalu Public Works Department',
      historicalOwnershipContext: 'Government of Tuvalu / public infrastructure programme',
      dataLimitation: 'The Funafuti borrow-pit system has mixed historical excavation, reclamation and waste-use history; no current commercial quarry operator is asserted.'
    },
    metadata: {
      sourceAuthority: 'Tuvalu Public Works Department / SOPAC',
      currentEvidence: 'Historical Funafuti borrow-pit programmes were coordinated with the Public Works Department and Lands and Survey departments; current documentation treats these primarily as legacy reclamation/infrastructure sites rather than active commercial mines.'
    },
    sources: [
      evidence('https://spccfpstore1.blob.core.windows.net/digitallibrary-docs/files/9a/9a1a6f11d0c7ea5515b0fb98fa60edbd.pdf', 'Funafuti_borrow_pit_public_works_and_lands_survey_involvement', 'SOPAC'),
      evidence('https://spccfpstore1.blob.core.windows.net/digitallibrary-docs/files/28/28a5f508625b3a152d75ae3ca4a3a231.pdf', 'Funafuti_borrow_pit_lagoon_sand_reclamation_and_government_equipment_context', 'SOPAC')
    ]
  },
  SITE_VCT_diamond_quarry: {
    status: 'RESOURCE_IDENTITY_UNVERIFIED',
    operationalStatus: 'RESOURCE_IDENTITY_UNVERIFIED',
    extractionEligibility: 'NON_EXECUTABLE',
    ownershipScope: 'IDENTITY_UNVERIFIED',
    extra: {
      knownCurrentAggregateAuthority: 'Roads, Buildings and General Services Authority (BRAGSA)',
      knownCurrentAggregateFacility: 'Rabacca Government Quarry',
      identityLimitation: 'Current 2025 evidence confirms BRAGSA operates a 100 TPH aggregate crushing facility at Rabacca, but the reviewed sources do not establish that this facility is the repository record named Diamond Quarry.'
    },
    metadata: {
      sourceAuthority: 'BRAGSA / St Vincent public reporting',
      currentEvidence: 'BRAGSA commissioned a 100 TPH crushing plant at Rabacca in March 2025. No reviewed current source established a concession specifically named Diamond Quarry.'
    },
    sources: [
      evidence('https://www.stvincenttimes.com/st-vincent-bragsa-new-5m-crusher-plant-rabacca/', 'current_BRAGSA_Rabacca_aggregate_crushing_facility', 'PUBLIC_AUTHORITY_REPORT')
    ]
  },
  SITE_ATG_gunthorpes_quarry: {
    status: 'RESOURCE_IDENTITY_UNVERIFIED',
    operationalStatus: 'RESOURCE_IDENTITY_UNVERIFIED',
    extractionEligibility: 'NON_EXECUTABLE',
    ownershipScope: 'IDENTITY_UNVERIFIED',
    extra: {
      identityLimitation: 'Reviewed authoritative material identifies Gunthorpes as the historic site of the Antigua Central Sugar Factory, but no reliable current quarry concession named Gunthorpes Quarry was established. The record is fail-closed pending site-specific quarry evidence.'
    },
    metadata: {
      sourceAuthority: 'Government of Antigua and Barbuda',
      currentEvidence: 'Government material identifies Gunthorpes as the site of the twentieth-century Central Sugar Factory. The reviewed search did not establish a current quarry concession with that exact name.'
    },
    sources: [
      evidence('https://ab.gov.ag/detail_template.php?page=aboutAB%2Fantigua_about', 'Gunthorpes_historical_identity_as_Central_Sugar_Factory_site', 'GOVERNMENT')
    ]
  },
  SITE_KNA_ross_lands_quarry_zone: {
    extra: {
      knownNationalAggregateAuthority: 'Government of Saint Kitts and Nevis Public Works Department, Quarry Division',
      identityScope: 'NATIONAL_QUARRY_OPERATOR_CONTEXT_NOT_SITE_SPECIFIC',
      dataLimitation: 'Government reporting confirms the national Quarry Division operates a government quarry producing aggregates, but the reviewed evidence does not independently map that facility to the repository Ross Lands Quarry Zone record.'
    },
    metadata: {
      sourceAuthority: 'Government of Saint Kitts and Nevis',
      currentEvidence: 'The Public Works Department Quarry Division is the single largest aggregate provider in Saint Kitts and Nevis and was modernised with new crushing and screening equipment in 2024-2025. Site-specific Ross Lands attribution was not established.'
    },
    sources: [
      evidence('https://www.sknis.gov.kn/2025/03/04/two-new-plants-commissioned-at-government-quarry-to-boost-efficiency-and-production-capacity/', 'government_quarry_division_current_operator_and_aggregate_output_context', 'GOVERNMENT')
    ]
  },
  SITE_CAF_ndassima_gold_project: {
    owner: 'AXMIN Inc. (legal concession holder; historical/current legal ownership context)',
    operator: 'Midas Resources',
    ownershipScope: 'LEGAL_OWNER_VS_REPORTED_DE_FACTO_CONTROL',
    status: 'DEVELOPMENT',
    operationalStatus: 'DEVELOPMENT',
    extractionMethod: 'Open-pit and underground project development',
    extra: {
      ownershipEvidenceScope: 'LEGAL_AND_REPORTED_DE_FACTO',
      temporalNote: 'Public reporting distinguishes AXMIN Inc. as the de jure concession owner and Midas Resources / reported de facto control; this record does not assert an unverified transfer of legal title.'
    },
    metadata: {
      sourceAuthority: 'EITI Central African Republic / public mining records',
      currentEvidence: 'CAR EITI identifies Midas Resources as the reported operator of Ndassima and notes the mine in the license register, while public reporting describes AXMIN Inc. as the legal owner. Current production status remains disputed in public reporting, so the repository remains NON_EXECUTABLE.'
    },
    sources: [
      evidence('https://eiti.org/news/central-african-republic-temporarily-suspended-eiti-board', 'Ndassima_operator_Midas_Resources_and_license_register_context', 'EITI'),
      evidence('https://www.eiti.org/sites/default/files/2024-10/Central%20African%20Republic%20EITI%202024%20Validation%20-%20Final%20Validation%20report%20%28October%202024%29.pdf', 'Ndassima_legal_owner_operator_and_production_status_uncertainty', 'EITI_VALIDATION')
    ]
  },
  SITE_TCD_kouri_bougoudi_gold_mining_area: {
    owner: 'UNOBSERVED',
    operator: 'Artisanal and licensed miners',
    ownershipScope: 'AREA_MULTI_OPERATOR',
    extra: {
      resourceEvidence: {
        sourceName: 'World Bank / Africa Mineral Resources',
        resourceRange: {
          low: 100000,
          high: 1000000,
          unit: 'troy_ounces_gold',
          interpretation: 'regional_estimate_range'
        },
        evidenceScope: 'DISTRICT_ESTIMATE_NOT_SITE_RESERVE'
      },
      dataLimitation: 'The cited estimate is for the Kouri Bougoudi District rather than a single concession/site reserve. Owner remains UNOBSERVED rather than assigning a generic state/private holder as exact ownership.'
    },
    metadata: {
      sourceAuthority: 'World Bank Mineral Resources of Africa / Chad mining authorities',
      currentEvidence: 'The World Bank mineral-resources appendix lists Kouri Bougoudi District as an operating gold mine/district and gives an estimated pre-mined resource range of 0.1-1 million ounces. Exact concession-level reserve and ownership are not established in the cited source.'
    },
    sources: [
      evidence('https://egps.worldbank.org/sites/default/files/2025-10/WB_Mineral%20Resources%20of%20Africa_WEB.pdf', 'Kouri_Bougoudi_operating_status_and_0_1_to_1_Moz_estimate', 'WORLD_BANK'),
      evidence('https://www.usgs.gov/centers/national-minerals-information-center/chad', 'Chad_mining_sector_and_data_limitations', 'USGS')
    ]
  },
  SITE_SWZ_ngwenya_iron_mine: {
    extra: {
      historicalLease: {
        lessee: 'Salgaocar Swaziland (Pty) Ltd',
        leasePurpose: 'iron ore dumps at the defunct Ngwenya mine',
        leaseStartYear: 2011,
        initialLeaseTermYears: 7,
        laterEvidenceYear: 2022
      },
      currentStatusLimitation: 'The site itself is a dormant historical mine, while later government reporting documents a licence to re-mine dumps. The legacy mine should not be marked active solely from the later dump-reprocessing licence.'
    },
    metadata: {
      sourceAuthority: 'Eswatini Mining Department / Government of Eswatini',
      currentEvidence: 'Government records state Salgaocar Swaziland was granted a mining lease for iron-ore dumps at the defunct Ngwenya mine from June 2011, while later government reporting documents a local company licensed to mine the dumps for seven years. The repository keeps the historical mine non-executable and records the dump-reprocessing history separately.'
    },
    sources: [
      evidence('https://swazigov.gov.sz/index.php/departments-sp-623334762/mining-department', 'Ngwenya_defunct_mine_and_Salgaocar_2011_iron_ore_dump_lease', 'GOVERNMENT'),
      evidence('https://www.gov.sz/images/planningministry/Company-Survey-Report-for-2022.pdf', 'later_Ngwenya_dump_mining_licence_and_reprocessing_context', 'GOVERNMENT'),
      evidence('https://www.gov.sz/images/stories/mining/Swaziland%20Mineral%20Resources%20Summary.pdf', 'Ngwenya_iron_ore_grade_and_dormant_mine_context', 'GOVERNMENT')
    ]
  },
  SITE_IRL_tara_zinc_mine: {
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionMethod: 'Underground mining',
    quantitativeProduction: {
      annual: {
        value: 1440000,
        unit: 'metric_tons_ore_milled',
        year: 2025
      },
      status: 'OBSERVED',
      measurementType: 'ORE_MILLED',
      sourceScope: 'SITE_SPECIFIC'
    },
    extra: {
      '2025_2026ProductionTarget': {
        value: 1800000,
        unit: 'metric_tons_ore_per_year',
        period: '2025-2026',
        status: 'PLANNED'
      },
      expansionTarget: {
        value: 2200000,
        unit: 'metric_tons_ore_per_year',
        horizonYears: 4,
        status: 'PLANNED'
      }
    },
    metadata: {
      sourceAuthority: 'Boliden Tara Mines',
      currentEvidence: 'Boliden states Tara Mines is an underground zinc and lead mine, reopened after care and maintenance from July 2023 to October 2024. It reports 1.44 Mt milled in 2025, with a 2025-2026 ore production target of 1.8 Mt/year and a planned increase to 2.2 Mt/year over the following four years.'
    },
    sources: [
      evidence('https://www.boliden.com/4a175d/globalassets/sustainability/sustainability-2/biodiversity-and-reclamation/gistm-2025/public-disclosure-tara-2025.pdf', 'Tara_underground_mining_reopening_2025_milled_volume_and_forward_ore_target', 'OPERATOR'),
      evidence('https://investors.boliden.com/sv/node/5981', 'Tara_2025_mineral_reserve_review_and_1_44_Mt_milled', 'OPERATOR')
    ]
  },
  SITE_GRC_olympias_gold_mine: {
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionMethod: 'Underground mining',
    quantitativeProduction: {
      annual: {
        value: 59877,
        unit: 'troy_ounces_gold',
        year: 2025
      },
      status: 'OBSERVED',
      measurementType: 'GOLD_PRODUCTION',
      sourceScope: 'SITE_SPECIFIC'
    },
    extra: {
      '2026ProductionGuidance': {
        low: 70000,
        high: 80000,
        unit: 'troy_ounces_gold',
        year: 2026,
        status: 'PLANNED'
      }
    },
    metadata: {
      sourceAuthority: 'Eldorado Gold',
      currentEvidence: 'Eldorado reports that Olympias produced 59,877 ounces of gold in 2025. The company provides 2026 gold production guidance of 70,000-80,000 ounces for Olympias and describes the operation as an underground mine.'
    },
    sources: [
      evidence('https://www.eldoradogold.com/investors/news-releases/eldorado-gold-delivers-strong-2025-full-year-and-fourth-quarter-financial', 'Olympias_2025_actual_gold_production_and_2026_guidance', 'OPERATOR'),
      evidence('https://www.eldoradogold.com/investors/news-releases/eldorado-gold-provides-skouries-project-update-2025-detailed-company', 'Olympias_underground_production_guidance_and_throughput_context', 'OPERATOR')
    ]
  },
  SITE_OMN_lasail_copper_mine: {
    owner: 'Minerals Development Oman (MDO) / Oman state mining interests',
    operator: 'Minerals Development Oman (MDO)',
    ownershipScope: 'STATE_PROJECT_OWNER_CURRENT_REDEVELOPMENT',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionMethod: 'Open-pit copper mining with beneficiation/concentration',
    extra: {
      block4ResourceEvidence: {
        estimatedCommercialCopperOre: 2780000,
        unit: 'metric_tons',
        scope: 'Lasail_and_Al_Baydha_Block_4_combined',
        productionCapacity: 800000,
        productionCapacityUnit: 'metric_tons_copper_ore_per_year',
        phaseNote: 'Combined Block 4 estimate; not assignable to Lasail alone without a site allocation source.'
      },
      currentMilestones: {
        preStrippingStarted: 2024,
        copperOreProductionStarted: '2024-07',
        firstConcentrateShipment: '2024',
        processingPlant: 'Mawarid concentrator'
      }
    },
    metadata: {
      sourceAuthority: 'Minerals Development Oman (MDO)',
      currentEvidence: 'MDO reports redevelopment of the Lasail and Al Baydha copper mines in Block 4. Site preparation and pre-stripping occurred at Lasail in 2024; copper ore production began in July 2024 and the first shipment of copper concentrate was exported. MDO reports the combined Block 4 commercial copper-ore estimate and annual production capacity, so those values are kept explicitly as combined-project evidence.'
    },
    sources: [
      evidence('https://www.mdo.om/exploration.php', 'MDO_Lasail_Al_Baydha_Block4_resource_estimate_and_capacity', 'OPERATOR'),
      evidence('https://www.mdo.om/uploads/publications/MDO%20Audited%20FS%202024%20Arab%20consolidated%201-1758439855.pdf', 'Lasail_2024_prestripping_production_and_first_concentrate_shipment', 'OPERATOR')
    ]
  },
  SITE_SOM_el_buur_gold_mining_area: {
    status: 'RESOURCE_IDENTITY_UNVERIFIED',
    operationalStatus: 'RESOURCE_IDENTITY_UNVERIFIED',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Unverified small-scale mineral extraction; gold-specific commercial operation not established',
    metadata: {
      sourceAuthority: 'USGS-derived mineral locality record / public mineralogical references',
      currentEvidence: 'Current public locality evidence identifies El Bur/El Buur in Galguduud as a sepiolite deposit and a traditional quarrying center. It does not establish a site-specific commercial gold mine or gold operator. The repository gold identity is therefore flagged as unverified rather than executed as a gold-producing asset.',
      resourceIdentityConflict: 'Repository resourceTypeId=gold conflicts with available site-level evidence supporting sepiolite. The ontology has no dedicated sepiolite resource type, so the gold identity is retained only as UNVERIFIED and extraction is disabled pending authoritative resource-ontology expansion or a site-specific gold source.'
    },
    sources: [
      evidence('https://www.mindat.org/locentry-900101.html', 'el_buur_sepiolite_deposit_identity_and_location', 'MINERAL_LOCALITY_DATABASE'),
      evidence('https://en.wikipedia.org/wiki/El_Buur', 'el_buur_quarrying_and_sepiolite_context', 'SECONDARY_REFERENCE')
    ]
  }
,

  SITE_SGP_pulau_ubin_granite_quarry_sites: {
    owner: 'Government of Singapore',
    operator: 'None (historical quarry; no current commercial operator)',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical granite quarrying',
    metadata: {
      sourceAuthority: 'Singapore National Parks Board',
      currentEvidence: 'NParks states that all six Pulau Ubin granite quarries are inactive and have been converted to viewpoints and wildlife habitats. The last quarry closed in 1999.'
    },
    extra: {
      historicalQuarrySet: ['Balai Quarry', 'Kekek Quarry', 'Ketam Quarry', 'Pekan Quarry', 'Petai Quarry', 'Ubin Quarry'],
      lastOperationalYear: 1999,
      currentUse: 'Conservation, habitat and recreation'
    },
    sources: [
      evidence('https://pulau-ubin.nparks.gov.sg/biodiversity/placesofinterest/quarries-of-pulau-ubin/', 'current_inactive_status_historical_granite_quarries_and_last_closure', 'GOVERNMENT')
    ]
  },
  SITE_LAO_phu_kham_copper_gold_mine: {
    owner: 'PanAust Limited / Phu Bia Mining Limited',
    operator: 'PanAust Limited / Phu Bia Mining Limited',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit mining feeding conventional milling and flotation',
    quantitativeProduction: {
      annual: { value: 36290, unit: 'metric_tons_copper_concentrate', year: 2024 },
      status: 'OBSERVED',
      measurementType: 'COPPER_CONCENTRATE_PRODUCTION',
      sourceScope: 'SITE_SPECIFIC'
    },
    process: {
      resourceTypeId: 'copper',
      ontologyKey: 'COPPER',
      commodityName: 'Copper and precious-metals concentrate',
      primaryCommodity: 'copper',
      secondaryCommodities: ['gold', 'silver'],
      upstreamProcess: 'Open-Pit Mining',
      midstreamProcess: 'Conventional Milling and Flotation',
      refinedOutputs: ['COPPER_CONCENTRATE', 'GOLD_CONTAINING_CONCENTRATE', 'SILVER_CONTAINING_CONCENTRATE'],
      downstreamSectors: ['SMELTING', 'METALS_PROCESSING']
    },
    metadata: {
      sourceAuthority: 'PanAust',
      currentEvidence: 'PanAust identifies Phu Kham as its flagship operation in Laos. It is an open-pit mine feeding conventional milling and flotation and exports copper and precious-metals concentrate. PanAust reported 36,290 tonnes of copper concentrate production in 2024.'
    },
    sources: [
      evidence('https://panaust.com.au/operations/phu-kham-copper-gold-operation/', 'current_operator_location_mining_method_processing_and_logistics', 'OPERATOR'),
      evidence('https://panaust.com.au/wp-content/uploads/2025/12/PAN020-2024-Business-Review-and-Sustainability-Report-V2-interactive.pdf', '2024_site_specific_copper_concentrate_production_and_mining_metrics', 'OPERATOR')
    ]
  },
  SITE_ESP_cobre_las_cruces_mine: {
    owner: 'Global Panduro S.L.U. / Resource Capital Funds',
    operator: 'Cobre Las Cruces S.A.U.',
    status: 'CARE_AND_MAINTENANCE',
    operationalStatus: 'CARE_AND_MAINTENANCE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Open-pit mining was historical; current project is being advanced as a polymetallic mining-metallurgical development',
    metadata: {
      sourceAuthority: 'Cobre Las Cruces / Global Panduro',
      currentEvidence: 'Cobre Las Cruces announced in June 2026 that Global Panduro acquired 100% of CLC from First Quantum Minerals. The operation is being advanced under the new ownership as a strategic polymetallic mining and refining project; the legacy open-pit copper operation had been in care and maintenance.'
    },
    extra: {
      ownershipEffectiveDate: '2026-06',
      currentProject: 'European Strategic Polymetallic Refinery Project',
      legacyProductionStatus: 'CARE_AND_MAINTENANCE'
    },
    sources: [
      evidence('https://www.cobrelascruces.com/index.php/2026/06/?lang=en', '2026_change_of_control_and_current_project_identity', 'OPERATOR'),
      evidence('https://filings.es/spain/company/cobre-las-cruces-sa-a28814135', '2026_registered_change_of_single_shareholder_to_global_panduro', 'REGISTRY')
    ]
  },
  SITE_NLD_veendam_salt_mine: {
    owner: 'Nedmag B.V.',
    operator: 'Nedmag B.V.',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Solution mining of magnesium salt/brine with processing at the Veendam site',
    metadata: {
      sourceAuthority: 'Nedmag B.V.',
      currentEvidence: 'Nedmag continued operating the Veendam site in 2025 and stated that its new environmental permit application did not change production volume or the current environmental impact.'
    },
    sources: [
      evidence('https://www.nedmag.com/news/nedmag-applies-new-environmental-permit-veendam-site', '2025_current_site_operation_permit_and_unchanged_production_context', 'OPERATOR')
    ]
  },
  SITE_BEL_antoing_limestone_quarry: {
    owner: 'Heidelberg Materials Benelux / Cimescaut quarry interests',
    operator: 'Sagrex',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit limestone quarrying',
    metadata: {
      sourceAuthority: 'Heidelberg Materials history / Antoing site references',
      currentEvidence: 'The Antoing Cimescaut quarry is an open-cast blue-limestone operation. Historical CBR ownership passed into Heidelberg Materials, while the quarry is operated by Sagrex. This corrects the repository Carmeuse attribution.'
    },
    process: {
      resourceTypeId: 'limestone',
      ontologyKey: 'LIMESTONE',
      commodityName: 'Blue limestone',
      upstreamProcess: 'Open-Pit Quarrying',
      midstreamProcess: 'Crushing and grading',
      refinedOutputs: ['LIMESTONE_AGGREGATE', 'INDUSTRIAL_LIMESTONE']
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Antoing_cement_kiln', 'current_quarry_identity_operator_and_open_cast_limestone_context', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_CHE_bex_salt_mine: {
    owner: 'Swiss Saltworks / Saltworks of Bex',
    operator: 'Swiss Saltworks / Mines de Sel de Bex',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground salt extraction',
    metadata: {
      sourceAuthority: 'Salina Helvetica / Swiss Saltworks',
      currentEvidence: 'The official Bex Salt Mines site states that salt is still extracted every day and describes Bex as the oldest active mine in Switzerland. Swiss Saltworks is responsible for the site operations and maintenance framework.'
    },
    sources: [
      evidence('https://salina-helvetica.ch/en/mines', 'current_active_mining_and_daily_salt_extraction', 'OPERATOR'),
      evidence('https://salina-helvetica.ch/en/a-propos-de-la-fondation', 'Swiss_Saltworks_site_responsibility_and_Bex_operational_context', 'OPERATOR')
    ]
  },
  SITE_NOR_tellnes_ilmenite_mine: {
    owner: 'Titania AS',
    operator: 'Titania AS',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit ilmenite mining',
    process: {
      resourceTypeId: 'ilmenite',
      ontologyKey: 'ILMENITE',
      commodityName: 'Ilmenite / titanium-iron ore',
      upstreamProcess: 'Open-Pit Mining',
      midstreamProcess: 'Ore crushing and mineral separation',
      refinedOutputs: ['ILMENITE_CONCENTRATE', 'TITANIUM_DIOXIDE_FEEDSTOCK']
    },
    metadata: {
      sourceAuthority: 'Titania / Norwegian geoscience literature',
      currentEvidence: 'Tellnes is a large ilmenite orebody in Rogaland operated by Titania AS. Published technical work documents the Tellnes open pit and its long-running ilmenite production.'
    },
    sources: [
      evidence('https://folk.ntnu.no/bnilsen/CapeTown_Titania06.pdf', 'Tellnes_open_pit_operator_mining_method_and_historical_ilmenite_output_context', 'TECHNICAL_LITERATURE')
    ]
  },
  SITE_AUT_erzberg_iron_ore_mine: {
    owner: 'VA Erzberg GmbH',
    operator: 'VA Erzberg GmbH',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit iron ore mining with drilling, blasting, loading and transport',
    metadata: {
      sourceAuthority: 'VA Erzberg GmbH',
      currentEvidence: 'VA Erzberg currently reports approximately 12 million tonnes of annual mined material and about 3 million tonnes of annually shipped ore, confirming an active commercial open-pit operation.'
    },
    extra: {
      currentAnnualMinedMaterial: { value: 12000000, unit: 'metric_tons', status: 'CURRENT_REPORTED' },
      currentAnnualShippedOre: { value: 3000000, unit: 'metric_tons', status: 'CURRENT_REPORTED' }
    },
    sources: [
      evidence('https://www.vaerzberg.at/zahlen-fakten/', 'current_annual_mined_material_and_shipped_ore_metrics', 'OPERATOR')
    ]
  },
  SITE_DNK_faxe_limestone_quarry: {
    owner: 'Faxe Kalk A/S',
    operator: 'Faxe Kalk A/S',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit limestone quarrying',
    process: {
      resourceTypeId: 'limestone',
      ontologyKey: 'LIMESTONE',
      commodityName: 'Limestone',
      upstreamProcess: 'Open-Pit Quarrying',
      midstreamProcess: 'Processing into agricultural limestone, milled limestone and quicklime products',
      refinedOutputs: ['AGRICULTURAL_LIMESTONE', 'MILLED_LIMESTONE', 'QUICKLIME']
    },
    metadata: {
      sourceAuthority: 'Faxe Kalk A/S 2025 annual report',
      currentEvidence: 'Faxe Kalk states that limestone is extracted from its Faxe Kalkbrud quarry and used for agricultural limestone and milled limestone products. The 2025 annual report confirms continued quarrying as the company main activity.'
    },
    sources: [
      evidence('https://regnskaber.cvrapi.dk/28128802/amNsb3VkczovLzAzLzU0L2NlL2U1LzBjLzBiY2UtNDljNS1hMjFlLWYzODM4Y2IyNjMxNQ.pdf', '2025_quarrying_business_description_and_faxe_quarry_identity', 'REGULATORY_FILING')
    ]
  },
  SITE_PRT_panasqueira_tungsten_mine: {
    owner: 'Almonty Industries Inc.',
    operator: 'Beralt Tin and Wolfram / Almonty Industries',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground tungsten mining with gravity-based milling and concentrate production',
    quantitativeReserve: { quantity: 3000000, unit: 'metric_tons_ore', status: 'OBSERVED', sourceScope: 'SITE_SPECIFIC', year: 2025 },
    process: {
      resourceTypeId: 'tungsten',
      ontologyKey: 'TUNGSTEN',
      commodityName: 'Tungsten, with tin and copper by-products',
      primaryCommodity: 'tungsten',
      secondaryCommodities: ['tin', 'copper'],
      upstreamProcess: 'Underground Mining',
      midstreamProcess: 'Crushing, gravity separation, shaking tables and spiral banks',
      refinedOutputs: ['TUNGSTEN_CONCENTRATE'],
      concentrationTarget: 'Typically 70% or greater WO3'
    },
    metadata: {
      sourceAuthority: 'Almonty Industries / SEC filings',
      currentEvidence: 'Almonty states that Panasqueira is currently mining, processing and shipping tungsten concentrate. The mine has 3.0 Mt of reported reserves and uses crushing followed by gravity separation in its milling circuits.'
    },
    sources: [
      evidence('https://www.sec.gov/Archives/edgar/data/1670061/000149315226011503/ex99-1.htm', 'current_operator_mining_processing_and_reserve_context', 'REGULATORY_FILING'),
      evidence('https://www.sec.gov/Archives/edgar/data/1670061/000149315226022338/ex99-3.htm', '2026_current_mining_processing_shipping_and_recovery_context', 'REGULATORY_FILING'),
      evidence('https://almonty.com/wp-content/uploads/2026/03/AII-AIF-FY25CAN_DMS_1015843488.1.pdf', 'tungsten_concentrate_process_and_product_grade', 'OPERATOR')
    ]
  },
  SITE_CZE_doln_ro_nka_uranium_mine: {
    owner: 'DIAMO, state enterprise',
    operator: 'DIAMO, state enterprise',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical underground uranium mining',
    metadata: {
      sourceAuthority: 'DIAMO / Czech state mining legacy',
      currentEvidence: 'The Dolní Rožínka uranium operation is historical and no longer a commercial producing mine. DIAMO remains the Czech state enterprise responsible for uranium mining legacy assets and remediation.'
    },
    sources: [
      evidence('https://www.diamo.cz/', 'Czech_state_uranium_mining_legacy_and_DIAMO_role', 'GOVERNMENT')
    ]
  },
  SITE_ROU_ro_ia_poieni_copper_mine: {
    owner: 'Cupru Min S.A. Abrud / Romanian state',
    operator: 'Cupru Min S.A. Abrud',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Large open-pit copper mining with crushing and flotation processing',
    metadata: {
      sourceAuthority: 'Cupru Min S.A. Abrud / Romanian Ministry of Economy',
      currentEvidence: 'Cupru Min documents the Roșia Poieni open-pit quarry and Dealul Piciorului processing plant as its core copper business, including extraction and processing of low-grade copper ores.'
    },
    extra: {
      processingPlant: 'Dealul Piciorului Processing Plant',
      designedProcessingCapacity: { value: 9000000, unit: 'metric_tons_ore_per_year', status: 'DESIGN_CAPACITY' },
      depositGradeContext: { value: 0.36, unit: 'percent_copper', status: 'REPORTED_DEPOSIT_ESTIMATE' },
      depositTonnageContext: { value: 1000000000, unit: 'metric_tons_ore', status: 'REPORTED_DEPOSIT_ESTIMATE' }
    },
    sources: [
      evidence('https://www.cuprumin.ro/544/2025/ROF_2025.pdf', '2025_current_quarry_processing_plant_and_copper_extraction_identity', 'GOVERNMENT_OPERATOR'),
      evidence('https://www.izvoznookno.si/Dokumenti/xCupruMin%20_3_.pdf', 'deposit_tonnage_grade_and_processing_capacity_context', 'PUBLIC_COMPANY_PROFILE')
    ]
  },
  SITE_HUN_visonta_lignite_mine: {
    owner: 'Mátrai Erőmű Zrt. / MVM',
    operator: 'Mátrai Erőmű Zrt.',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit lignite mining supplying the Mátra power plant',
    metadata: {
      sourceAuthority: 'Global Coal Mine Tracker / current operator records',
      currentEvidence: 'Visonta is an operating surface lignite mine in Hungary. Current mine records identify a large lignite resource base and the operation as an open-pit mine supplying thermal power generation.'
    },
    extra: {
      currentResourceContext: { quantity: 2150000000, unit: 'metric_tons_lignite', status: 'REPORTED_RESOURCE_ESTIMATE', year: 2022 },
      resourceGradeContext: { value: 80, unit: 'thermal_lignite_grade_index', status: 'REPORTED' }
    },
    sources: [
      evidence('https://www.gem.wiki/Visonta_Coal_Mine', 'current_operating_status_mine_type_resource_and_ownership_context', 'INDUSTRY_DATABASE')
    ]
  },
  SITE_SVK_jel_ava_magnesite_mine: {
    owner: 'Slovenské Magnezitové Závody a.s. Jelšava',
    operator: 'Slovenské Magnezitové Závody a.s. Jelšava',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Magnesite mining with beneficiation/concentrate production',
    quantitativeProduction: {
      annual: { value: 253300, unit: 'metric_tons_magnesite_mined', year: 2024 },
      status: 'OBSERVED',
      measurementType: 'MINE_OUTPUT',
      sourceScope: 'SITE_SPECIFIC'
    },
    process: {
      resourceTypeId: 'magnesite',
      ontologyKey: 'MAGNESITE',
      commodityName: 'Magnesite',
      upstreamProcess: 'Mine Extraction',
      midstreamProcess: 'Crushing and Concentration',
      refinedOutputs: ['MAGNESIA_FEEDSTOCK', 'MAGNESITE_CONCENTRATE']
    },
    metadata: {
      sourceAuthority: 'USGS National Minerals Information Center',
      currentEvidence: 'USGS reports 253,300 tonnes of magnesite mined in 2024 from the Jelsava mine, operated by Slovenské Magnezitové Závody a.s. Jelsava.'
    },
    sources: [
      evidence('https://www.usgs.gov/centers/national-minerals-information-center/slovakia', '2024_Jelsava_site_specific_magnesite_output_and_operator', 'GOVERNMENT_GEOLOGICAL_SURVEY')
    ]
  },
  SITE_BGR_chelopech_copper_gold_mine: {
    owner: 'Dundee Precious Metals Inc.',
    operator: 'Chelopech Mining EAD',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground sub-level long-hole open stoping with paste backfill',
    metadata: {
      sourceAuthority: 'Dundee Precious Metals',
      currentEvidence: 'DPM identifies Chelopech as its underground copper-gold mine in Bulgaria and reports a current production operation with a mine life extending into the 2030s.'
    },
    sources: [
      evidence('https://www.dundeeprecious.com/operations/chelopech', 'current_operator_mining_method_resource_and_operating_context', 'OPERATOR')
    ]
  },
  SITE_SRB_majdanpek_copper_mine: {
    owner: 'Serbia Zijin Copper DOO / Serbia',
    operator: 'Serbia Zijin Copper DOO',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit copper mining with crushing, flotation and integrated smelting within the Bor operation',
    metadata: {
      sourceAuthority: 'Zijin Mining',
      currentEvidence: 'Zijin identifies its Serbia Bor operation as in production and undergoing expansion, with four mines in production and integrated open-pit/underground mining and flotation. Majdanpek is part of the Serbia Zijin Copper operating complex.'
    },
    sources: [
      evidence('https://www.zijinmining.com/global/program-detail-71737.htm', 'current_Serbia_Zijin_Copper_operation_status_and_mining_processing_methods', 'OPERATOR')
    ]
  },
  SITE_HRV_koroma_no_limestone_quarry: {
    owner: 'Holcim Hrvatska d.o.o.',
    operator: 'Holcim Hrvatska d.o.o.',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit quarrying of limestone/technical stone and industrial mineral aggregate',
    metadata: {
      sourceAuthority: 'Croatian Ministry / Holcim Croatia',
      currentEvidence: 'Croatian government records identify Holcim Hrvatska at Koromačno and Holcim Croatia states that Koromačno is one of its operating quarries supplying construction and industrial aggregates.'
    },
    sources: [
      evidence('https://mingo.gov.hr/holcim-hrvatska-d-o-o-koromacno/7234', 'current_environmental_permit_and_Koromacno_operator_identity', 'GOVERNMENT'),
      evidence('https://www.holcim.hr/en/node/70', 'current_Koromacno_quarry_operation_and_aggregate_products', 'OPERATOR')
    ]
  },
  SITE_EST_narva_oil_shale_mine: {
    owner: 'Eesti Energia AS',
    operator: 'Eesti Energia AS',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Surface oil-shale mining supplying oil-shale processing and power-generation value chains',
    process: {
      resourceTypeId: 'oil_shale',
      ontologyKey: 'OIL_SHALE',
      commodityName: 'Oil shale',
      upstreamProcess: 'Surface Mining',
      midstreamProcess: 'Crushing, beneficiation and retorting/combustion',
      refinedOutputs: ['SHALE_OIL', 'ELECTRICITY', 'SHALE_ASH']
    },
    metadata: {
      sourceAuthority: 'Eesti Energia / Estonian mineral-sector records',
      currentEvidence: 'Narva is part of Estonia oil-shale mining and processing infrastructure operated by Eesti Energia. The asset is a producing surface-mining operation rather than a generic mineral occurrence.'
    },
    sources: [
      evidence('https://www.energia.ee/en', 'current_Eesti_Energia_operator_and_oil_shale_value_chain_context', 'OPERATOR')
    ]
  },
  SITE_LVA_saulkalne_dolomite_quarry: {
    owner: 'SCHWENK Latvija / Saulkalne SIA',
    operator: 'Saulkalne SIA',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Quarrying and crushing of dolomite for aggregates',
    process: {
      resourceTypeId: 'dolomite',
      ontologyKey: 'DOLOMITE',
      commodityName: 'Dolomite aggregates and crushed stone',
      upstreamProcess: 'Quarrying',
      midstreamProcess: 'Washing, drying and crushing',
      refinedOutputs: ['DOLOMITE_CRUSHED_STONE', 'DOLOMITE_SAND', 'CONSTRUCTION_AGGREGATES']
    },
    metadata: {
      sourceAuthority: 'Saulkalne SIA',
      currentEvidence: 'Saulkalne documents active dolomite quarrying and processing, including its Salenieku Dolomīts subsidiary, washed/dried/crushed dolomite production and multiple quarry developments.'
    },
    sources: [
      evidence('https://www.saulkalne.lv/en/par-mums', 'current_quarry_processing_history_and_dolomite_products', 'OPERATOR')
    ]
  },
  SITE_LTU_akmen_limestone_quarry: {
    owner: 'AB Akmenės cementas',
    operator: 'AB Akmenės cementas',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit limestone quarrying feeding the Akmenės cement plant',
    process: {
      resourceTypeId: 'limestone',
      ontologyKey: 'LIMESTONE',
      commodityName: 'Limestone for cement manufacture',
      upstreamProcess: 'Open-Pit Quarrying',
      midstreamProcess: 'Crushing and cement raw-mix preparation',
      refinedOutputs: ['CEMENT_CLINKER', 'CEMENT']
    },
    metadata: {
      sourceAuthority: 'Akmenės cementas',
      currentEvidence: 'Akmenės cementas operates the integrated cement manufacturing complex in northern Lithuania. The repository site is retained as its limestone raw-material source and is explicitly linked to the cement production chain.'
    },
    sources: [
      evidence('https://cementas.lt/', 'current_operator_and_integrated_cement_production_identity', 'OPERATOR')
    ]
  },
  SITE_BLR_soligorsk_potash_mine: {
    owner: 'Belaruskali',
    operator: 'Belaruskali',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground potash mining with beneficiation into K2O-equivalent potash fertilizer products',
    process: {
      resourceTypeId: 'potash',
      ontologyKey: 'POTASH',
      commodityName: 'Potash / sylvinite / potassium chloride feedstock',
      upstreamProcess: 'Underground Mining',
      midstreamProcess: 'Crushing, beneficiation and potash processing',
      refinedOutputs: ['POTASH_FERTILIZER', 'POTASSIUM_CHLORIDE']
    },
    metadata: {
      sourceAuthority: 'USGS National Minerals Information Center',
      currentEvidence: 'USGS reports that Belaruskali operates mines at the Starobin and Petrikov deposits and had seven mines with combined capacity of about 9 Mt/year of K2O-equivalent potash. The 2024 company output was about 7.1 Mt K2O equivalent. The value is company/national context and is not assigned as a Soligorsk-only production figure.'
    },
    extra: {
      companyProductionContext2024: { value: 7084000, unit: 'metric_tons_K2O_equivalent', year: 2024, status: 'NATIONAL_COMPANY_CONTEXT_NOT_SITE_SPECIFIC' }
    },
    sources: [
      evidence('https://www.usgs.gov/centers/national-minerals-information-center/belarus', 'Belaruskali_mining_locations_company_capacity_and_2024_production_context', 'GOVERNMENT_GEOLOGICAL_SURVEY')
    ]
  },
  SITE_MDA_cricova_limestone_mine: {
    owner: 'CP “MINA FĂURARI”',
    operator: 'CP “MINA FĂURARI”',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Limestone/chalk quarrying for cutting-block raw material',
    quantitativeReserve: {
      quantity: 52649000,
      unit: 'cubic_meters',
      status: 'OBSERVED',
      year: 2019,
      sourceScope: 'Cricova_II_quarry_zone'
    },
    metadata: {
      sourceAuthority: 'Republic of Moldova Mineral Resources Platform',
      currentEvidence: 'The national mineral-resources platform identifies Cricova II, about 1 km northwest of Pașcani, as an excavation operated by CP “MINA FĂURARI”, with 52,649 thousand cubic metres of reported reserves as of 1 January 2019.'
    },
    sources: [
      evidence('https://resurseminerale.md/en/quarry_details/202/cricova-or-cricova-mun-chisinau', 'site_specific_quarry_identity_operator_location_and_reported_reserves', 'GOVERNMENT_MINERAL_REGISTRY')
    ]
  },
  SITE_ALB_bulqiz_chromite_mine: {
    owner: 'Albchrome / Balfin Group',
    operator: 'Albchrome',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground and surface chromite mining with ore beneficiation',
    metadata: {
      sourceAuthority: 'Albania National Agency of Natural Resources / Bulqiza industry reporting',
      currentEvidence: 'Albania maintains an active mining-licence register covering the Bulqizë chromite district. Industry reporting tied to the Bulqizë processing operation describes a 2025 target of about 25,000 tonnes of chromite concentrate at 38–52% Cr2O3 across its mining and beneficiation assets.'
    },
    extra: {
      productionTarget2025: { value: 25000, unit: 'metric_tons_chromite_concentrate', year: 2025, status: 'MANAGEMENT_TARGET' },
      concentrateGradeTarget2025: { low: 38, high: 52, unit: 'percent_Cr2O3', year: 2025, status: 'MANAGEMENT_TARGET' }
    },
    sources: [
      evidence('https://www.akbn.gov.al/category/raporte-te-akbn/raporte-drejtoria-minerare/', '2026_active_mining_licence_registry_and_Bulqiza_mineral_reports', 'GOVERNMENT'),
      evidence('https://www.gazetabulqiza.com/2024/12/23/bukurosh-koci-investime-qe-garantojne-perspektiven/', '2025_chromite_concentrate_target_and_grade_context', 'INDUSTRY_INTERVIEW')
    ]
  },
  SITE_MKD_sasa_lead_zinc_mine: {
    owner: 'Central Asia Metals PLC',
    operator: 'Sasa Mine / Central Asia Metals PLC',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground zinc-lead mining with paste backfill, dry-stack tailings and flotation',
    process: {
      resourceTypeId: 'zinc',
      ontologyKey: 'ZINC',
      commodityName: 'Zinc and lead concentrates with payable silver',
      primaryCommodity: 'zinc',
      secondaryCommodities: ['lead', 'silver'],
      upstreamProcess: 'Underground Mining',
      midstreamProcess: 'Crushing, milling and flotation',
      refinedOutputs: ['ZINC_CONCENTRATE', 'LEAD_CONCENTRATE'],
      tailingsHandling: ['PASTE_BACKFILL', 'DRY_STACK_TAILINGS']
    },
    metadata: {
      sourceAuthority: 'Central Asia Metals / FCA RNS',
      currentEvidence: 'CAML reported H1 2026 Sasa production of 403,665 tonnes ore mined, 400,798 tonnes plant feed, 9,094 tonnes contained zinc in concentrate and 13,312 tonnes contained lead in concentrate, with zinc and lead head grades of 2.65% and 3.52%.'
    },
    extra: {
      h1_2026Production: {
        oreMined: 403665,
        plantFeed: 400798,
        zincConcentrate: 17980,
        containedZinc: 9094,
        leadConcentrate: 18808,
        containedLead: 13312,
        zincHeadGradePercent: 2.65,
        leadHeadGradePercent: 3.52
      }
    },
    sources: [
      evidence('https://data.fca.org.uk/artefacts/NSM/RNS/2635fd0b-44dd-443c-b9d6-97197d63aca4.html', 'H1_2026_site_specific_Sasa_production_grades_and_processing_metrics', 'REGULATORY_FILING')
    ]
  },
  SITE_BIH_vare_silver_lead_zinc_mine: {
    owner: 'Adriatic Metals PLC',
    operator: 'Eastern Mining d.o.o.',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground mining at Rupice with crushing, flotation and concentrate production',
    metadata: {
      sourceAuthority: 'Adriatic Metals',
      currentEvidence: 'Adriatic Metals has declared commercial production at Vareš and continues underground development and ore production from the Rupice deposit. The operation produces zinc, lead, silver and gold-bearing concentrates.'
    },
    extra: {
      commercialProductionDeclared: true,
      primaryMine: 'Rupice',
      currentMiningMethod: 'UNDERGROUND',
      polymetallicOutputs: ['ZINC', 'LEAD', 'SILVER', 'GOLD']
    },
    sources: [
      evidence('https://adriaticmetals.com/operations/vares/', 'current_Vares_commercial_production_Rupice_operator_and_polymetallic_processing_context', 'OPERATOR')
    ]
  },
  SITE_MNE_pljevlja_coal_mine: {
    owner: 'Rudnik uglja Pljevlja / Government of Montenegro',
    operator: 'Rudnik uglja Pljevlja',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit lignite/coal mining supplying thermal power generation',
    metadata: {
      sourceAuthority: 'Global Energy Monitor / current mine records',
      currentEvidence: 'The current mine record identifies Pljevlja as an operating coal mine in Montenegro with an exact mine location and an open-pit operating history dating to 1952.'
    },
    sources: [
      evidence('https://www.gem.wiki/Pljevlja_Coal_Mine', 'current_operating_status_exact_location_and_mine_history', 'INDUSTRY_DATABASE')
    ]
  },
  SITE_LUX_rumelange_iron_mine: {
    owner: 'Luxembourg state / heritage',
    operator: 'None (historical mine)',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical underground iron-ore mining',
    metadata: {
      sourceAuthority: 'National Mining Museum / Luxembourg mining heritage',
      currentEvidence: 'The Rumelange mining heritage record documents historic iron-ore extraction and closure of the last Lorraine-area mine operations in the late twentieth century. It is not a current producing mine.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Rumelange', 'historical_iron_mining_and_current_non_producing_context', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_CYP_skouriotissa_copper_mine: {
    owner: 'Hellenic Copper Mines / Cyprus historical mining interests',
    operator: 'None for current commercial extraction',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical underground/surface mining; later leaching and SX-EW processing',
    metadata: {
      sourceAuthority: 'Cyprus Mines and Quarries Service',
      currentEvidence: 'The Cyprus government states that Skouriotissa was the only mining activity in Cyprus from 1996 to 2019. The historical operation used surface/underground extraction and later leaching/SX-EW, but the government page does not establish a current commercial producing mine.'
    },
    extra: {
      lastDocumentedCommercialMiningYear: 2019,
      historicalCathodePurity: { value: 99.999, unit: 'percent_copper', status: 'HISTORICAL_REPORTED' },
      historicalOperationMethod: 'Leaching-SX-EW'
    },
    sources: [
      evidence('https://www.gov.cy/moa-mines/en/documents/mines/', 'current_Cyprus_mining_status_and_Skouriotissa_last_activity_2019', 'GOVERNMENT'),
      evidence('https://www.gov.cy/moa-mines/en/documents/mines/information/copper-and-gold/', 'Skouriotissa_historical_mining_methods_and_copper_cathode_processing', 'GOVERNMENT'),
      evidence('https://www.gov.cy/moa-mines/en/documents/mines/information/copper-and-gold/', 'historical_Skouriotissa_ore_and_processing_context', 'GOVERNMENT')
    ]
  },
  SITE_AND_llorts_iron_mine: {
    owner: 'Government of Andorra / cultural heritage',
    operator: 'None (heritage site)',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical underground iron-ore extraction',
    metadata: {
      sourceAuthority: 'Government of Andorra',
      currentEvidence: 'The Government of Andorra identifies the Llorts iron mine as a nineteenth-century iron-ore mine associated with the country historic iron industry and now open as a heritage route rather than a producing mine.'
    },
    extra: {
      historicalPeriod: '19th century',
      currentUse: 'Cultural heritage and visitor route'
    },
    sources: [
      evidence('https://www.govern.ad/', 'Andorra_state_heritage_and_historical_mining_context', 'GOVERNMENT')
    ]
  },
  SITE_USA_morenci_copper_mine: {
    owner: 'Freeport-McMoRan Inc. 72% / Sumitomo 28%',
    operator: 'Freeport-McMoRan',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Large-scale open-pit porphyry copper mining with concentration, heap leaching and SX-EW',
    quantitativeProduction: {
      annual: { value: 700000000, unit: 'pounds_copper', year: 2025 },
      status: 'OBSERVED',
      measurementType: 'TOTAL_JV_COPPER_PRODUCTION',
      sourceScope: 'SITE_SPECIFIC'
    },
    process: {
      resourceTypeId: 'copper',
      ontologyKey: 'COPPER',
      commodityName: 'Copper with molybdenum by-product',
      primaryCommodity: 'copper',
      secondaryCommodities: ['molybdenum', 'gold', 'silver'],
      upstreamProcess: 'Open-Pit Mining',
      midstreamProcess: 'Milling/Flotation, Leach, SX-EW',
      refinedOutputs: ['COPPER_CONCENTRATE', 'COPPER_CATHODE', 'MOLYBDENUM_CONCENTRATE']
    },
    metadata: {
      sourceAuthority: 'Freeport-McMoRan SEC 2025 annual report',
      currentEvidence: 'Freeport reports Morenci as a large open-pit porphyry copper operation with two concentrators, a 132,000 t/day milling design capacity, a 72,500 t/day leach pad system and about 900 million lb/year EW cathode capacity. Total 2025 copper production including partners was 0.7 billion lb and molybdenum production was 7 million lb.'
    },
    sources: [
      evidence('https://www.sec.gov/Archives/edgar/data/831259/000083125926000012/fcx-20251231.htm', '2025_Morenci_production_processing_capacity_and_ownership', 'REGULATORY_FILING'),
      evidence('https://s22.q4cdn.com/529358580/files/doc_news/2026/FCX_260423.pdf', 'Q1_2026_Morenci_current_production_context', 'OPERATOR')
    ]
  },
  SITE_COL_cerrej_n_coal_mine: {
    owner: 'Glencore plc',
    operator: 'Cerrejón',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Large-scale open-pit thermal coal mining with rail and port logistics',
    metadata: {
      sourceAuthority: 'Glencore Resources and Reserves Report 2025',
      currentEvidence: 'Glencore continues to report Cerrejón as a coal operation. Its 2025 reserves and resources report states Cerrejón had about 5,123 Mt of coal resources before depletion and that reserve estimates account for mining rights, rail, port and environmental constraints.'
    },
    extra: {
      resourceEstimate2025: { quantity: 5123000000, unit: 'metric_tons_in_situ_coal_resource', year: 2025, status: 'OBSERVED_RESOURCE_ESTIMATE' },
      miningRightsExpiryYear: 2034
    },
    sources: [
      evidence('https://www.glencore.com/.rest/api/v1/documents/static/a17cc44b-7947-4169-9b6b-b882403fb42b/GLENCORE-Resources-and-Reserves-report-2025.pdf', '2025_Cerrejon_resource_reserve_and_operational_constraints', 'OPERATOR')
    ]
  },
  SITE_VEN_bachaquero_lagunillas_oil_field: {
    owner: 'Petróleos de Venezuela S.A. (PDVSA)',
    operator: 'Petróleos de Venezuela S.A. (PDVSA)',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Onshore and shallow-water oil wells with gathering and field processing',
    metadata: {
      sourceAuthority: 'Current oil-field reference data',
      currentEvidence: 'Bachaquero-Lagunillas is retained as a producing Lake Maracaibo petroleum field under PDVSA. Site-specific current production is not asserted where a current public field-level output series is not available.'
    },
    sources: [
      evidence('https://www.gem.wiki/Bachaquero-Lagunillas_Oil_Field', 'field_identity_location_operator_and_production_scope_limitation', 'INDUSTRY_DATABASE')
    ]
  },
  SITE_ECU_mirador_copper_mine: {
    owner: 'Ecuacorriente S.A. / CRCC-Tongguan investment group',
    operator: 'Ecuacorriente S.A.',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Large open-pit copper mining with crushing, grinding and flotation concentration',
    process: {
      resourceTypeId: 'copper',
      ontologyKey: 'COPPER',
      commodityName: 'Copper concentrate',
      upstreamProcess: 'Open-Pit Mining',
      midstreamProcess: 'Crushing, Grinding and Flotation',
      refinedOutputs: ['COPPER_CONCENTRATE']
    },
    metadata: {
      sourceAuthority: 'Ecuacorriente S.A.',
      currentEvidence: 'Mirador is an operating open-pit copper mine in Zamora-Chinchipe, Ecuador, operated by Ecuacorriente S.A. The repository record is kept executable as a producing asset, while unsupported site-specific quantitative figures remain unobserved.'
    },
    sources: [
      evidence('https://www.ecuacorriente.com/', 'current_operator_and_Mirador_copper_operation_context', 'OPERATOR')
    ]
  },
  SITE_PRY_vallem_limestone_quarry: {
    owner: 'Industria Nacional del Cemento (INC) / Paraguay',
    operator: 'Industria Nacional del Cemento (INC)',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Quarrying of limestone and associated cement raw materials feeding the Vallemí plant',
    metadata: {
      sourceAuthority: 'Industria Nacional del Cemento',
      currentEvidence: 'INC documents the Vallemí plant and limestone, marl and shale deposits that supply cement manufacture. An inferred resource figure of more than 839 Mt is reported for the Itapucumí group and is not incorrectly assigned as a single quarry reserve.'
    },
    extra: {
      inferredItapucumiResource: { quantity: 839000000, unit: 'metric_tons', status: 'REPORTED_GROUP_RESOURCE', scope: 'ITAPUCUMI_GROUP_NOT_SINGLE_QUARRY' }
    },
    sources: [
      evidence('https://inc.gov.py/2024/11/', 'Vallemi_limestone_marl_shale_resource_context_and_extraction_process', 'GOVERNMENT_OPERATOR'),
      evidence('https://inc.gov.py/presidente-pena-destaca-aumento-de-produccion-y-reposicionamiento-del-cemento-vallemi/', 'current_Vallemi_cement_production_and_operational_continuity', 'GOVERNMENT')
    ]
  },
  SITE_CRI_bellavista_gold_mine: {
    owner: 'UNOBSERVED',
    operator: 'None (historical mine)',
    status: 'HISTORICAL_INACTIVE',
    operationalStatus: 'HISTORICAL_INACTIVE',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'Historical gold mining',
    metadata: {
      sourceAuthority: 'Public historical mine references',
      currentEvidence: 'Bellavista is treated as a historical non-producing gold mine. Current site-specific commercial ownership is not sufficiently established in the current source set, so the old private-company attribution is not presented as a current owner.'
    },
    sources: [
      evidence('https://en.wikipedia.org/wiki/Bellavista_mine', 'historical_Bellavista_gold_mine_identity_and_non_producing_context', 'SECONDARY_REFERENCE')
    ]
  },
  SITE_NIC_el_lim_n_gold_mine: {
    owner: 'Equinox Gold Corp.',
    operator: 'Equinox Gold Nicaragua / Limon Mine',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Combination of open-pit and underground gold mining feeding the Limon mill',
    quantitativeProduction: {
      annual: { value: 71605, unit: 'troy_ounces_gold', year: 2025 },
      status: 'OBSERVED',
      measurementType: 'EL_LIMON_MILL_GOLD_PRODUCTION',
      sourceScope: 'SITE_SPECIFIC_MILL'
    },
    process: {
      resourceTypeId: 'gold',
      ontologyKey: 'GOLD',
      commodityName: 'Gold',
      upstreamProcess: 'Open-Pit and Underground Mining',
      midstreamProcess: 'Crushing, grinding, leaching and gold recovery',
      refinedOutputs: ['GOLD_DORE']
    },
    metadata: {
      sourceAuthority: 'Equinox Gold / SEC filing',
      currentEvidence: 'Equinox Gold acquired Limon in June 2025. The Limon complex includes Limon Central open pit and Santa Pancha, Panteon and Veta Nueva underground mines. The Limon mill reported 71,605 ounces of gold produced in 2025.'
    },
    sources: [
      evidence('https://www.equinoxgold.com/our-mines/libertad-gold-mine/', 'current_Limon_owner_mine_scope_and_hub_and_spoke_structure', 'OPERATOR'),
      evidence('https://www.sec.gov/Archives/edgar/data/1756607/000162828026022120/eqx-20251231mda.htm', '2025_Limon_mill_site_specific_gold_production_grade_processing_and_recovery', 'REGULATORY_FILING')
    ]
  },
  SITE_HND_el_mochito_mine: {
    owner: 'Kirungu Corporation',
    operator: 'American Pacific Honduras S.A. de C.V. / Kirungu operating interests',
    status: 'LIMITED',
    operationalStatus: 'LIMITED',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground zinc-lead-silver mining with crushing and flotation',
    metadata: {
      sourceAuthority: 'Wood Mackenzie / 2025 El Mochito asset record',
      currentEvidence: 'A 2025 asset report states Kirungu Corporation acquired El Mochito in 2020 and describes an underground mine with a 2.8 kt/day mill producing zinc and lead concentrates. Current public output is not asserted as an observed annual site series.'
    },
    extra: {
      millCapacity: { value: 2800, unit: 'metric_tons_ore_per_day', status: 'REPORTED_CAPACITY' },
      byproducts: ['silver']
    },
    sources: [
      evidence('https://www.woodmac.com/reports/metals-el-mochito-zinc-mine-16299107/', '2025_current_owner_mine_type_and_mill_capacity', 'INDUSTRY_ANALYSIS'),
      evidence('https://www.sec.gov/Archives/edgar/data/1829726/000110465926036188/R11.htm', '2025_settlement_and_Kirungu_El_Mochito_asset_context', 'REGULATORY_FILING')
    ]
  },
  SITE_JAM_noranda_st_ann_bauxite_mine: {
    owner: 'Noranda Jamaica Bauxite Partners II / Government of Jamaica 51%',
    operator: 'Noranda Bauxite Limited',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Surface bauxite mining, rail haulage to port, drying and export',
    metadata: {
      sourceAuthority: 'Jamaica Bauxite Institute / Jamaica Mines and Geology Division',
      currentEvidence: 'JBI states Noranda Jamaica Bauxite Partners II is a partnership in which Noranda Bauxite holds and operates the physical mining assets and the Government of Jamaica owns 51%. The mining concession runs through 2030. A 2025 environmental report gives production capacity around 5.4 Mt/year.'
    },
    extra: {
      concessionExpiryYear: 2030,
      nominalProductionCapacity: { value: 5400000, unit: 'metric_tons_bauxite_per_year', year: 2025, status: 'REPORTED_CAPACITY' }
    },
    sources: [
      evidence('https://www.jbi.org.jm/industry/', 'current_Noranda_partnership_operator_and_St_Ann_mining_logistics', 'GOVERNMENT'),
      evidence('https://mgd.gov.jm/mining-licence/', 'current_special_mining_lease_for_Noranda_Jamaica_Bauxite_Partners', 'GOVERNMENT'),
      evidence('https://www.nepa.gov.jm/sites/default/files/2025-10/SDR%20EIA%20WO%20CHAPEL%20WO%20TC%20le.pdf', '2025_St_Ann_bauxite_production_capacity', 'GOVERNMENT_ENVIRONMENTAL_REPORT')
    ]
  },
  SITE_DOM_pueblo_viejo_gold_mine: {
    owner: 'Barrick Gold 60% / Newmont 40%',
    operator: 'Barrick Gold Corporation',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit truck-and-shovel mining with CIL processing and stockpile blending',
    metadata: {
      sourceAuthority: 'Barrick SEC Annual Information Form',
      currentEvidence: 'Barrick reports Pueblo Viejo as a 60%-owned joint venture with Barrick as operator. The mine is an open-pit conventional truck-and-shovel operation and produced 379,014 ounces attributable to Barrick in 2025. Mining is projected to continue through 2048 under current reserves and tailings plans.'
    },
    extra: {
      '2025BarrickAttributableGoldProduction': { value: 379014, unit: 'troy_ounces_gold', year: 2025, status: 'OBSERVED_60_PERCENT_ATTRIBUTABLE' },
      mineLifeContext: { openPitThroughYear: 2048, processingThroughYear: 2049 }
    },
    sources: [
      evidence('https://www.sec.gov/Archives/edgar/data/756894/000119312526079253/d833573dex991.htm', '2025_production_operator_mining_method_and_mine_life', 'REGULATORY_FILING')
    ]
  },
  SITE_TTO_juniper_oil_field: {
    owner: 'bp Trinidad and Tobago LLC / Republic of Trinidad and Tobago state interests',
    operator: 'bp Trinidad and Tobago LLC',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Offshore oil and gas wells with subsea/wellhead gathering and field processing',
    metadata: {
      sourceAuthority: 'bp Trinidad and Tobago',
      currentEvidence: 'Juniper is retained as an offshore bp Trinidad and Tobago producing field. Current site-specific production is left unobserved in the absence of a public current field-level series in the retrieved source set.'
    },
    sources: [
      evidence('https://www.bptt.com/', 'current_bp_Trinidad_and_Tobago_operator_and_offshore_asset_context', 'OPERATOR')
    ]
  },
  SITE_BRB_arawak_cement_limestone_quarry: {
    owner: 'Arawak Cement Company Limited / TCL Group',
    operator: 'Arawak Cement Company Limited',
    status: 'LIMITED',
    operationalStatus: 'LIMITED',
    extractionEligibility: 'NON_EXECUTABLE',
    extractionMethod: 'No current quarry extraction at Checker Hall is established; current site operation is cement grinding',
    metadata: {
      sourceAuthority: 'Export Barbados / current cement-sector records',
      currentEvidence: 'Current records describe Arawak Cement at Checker Hall as a grinding operation. Clinker production at the St Lucy plant ceased in March 2023, with imported clinker subsequently ground at the site. Therefore the repository must not execute this record as a limestone mine without evidence of a current quarry at the exact site.'
    },
    extra: {
      currentProcess: 'CEMENT_GRINDING',
      clinkerProductionAtCheckerHall: false,
      mineIdentityStatus: 'SITE_SHOULD_BE_TREATED_AS_CEMENT_GRINDING_FACILITY_UNTIL_QUARRY_SOURCE_IS_ESTABLISHED'
    },
    sources: [
      evidence('https://exportbarbados.org/arawak-cement-co-ltd', 'current_Arawak_Cement_business_identity_and_Checker_Hall_location', 'GOVERNMENT_TRADE_AGENCY'),
      evidence('https://www.investcaricom.org/market-rating-index/evidence/cement-operators/cement-supply-position/', '2026_current_grinding_only_status_and_ceasing_clinker_production', 'INDUSTRY_DATABASE')
    ]
  },
  SITE_SUR_merian_gold_mine: {
    owner: 'Newmont 75% / Staatsolie 25%',
    operator: 'Newmont Suriname',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit gold mining with conventional milling, gravity and carbon-in-leach processing',
    quantitativeReserve: {
      quantity: 4500000,
      unit: 'troy_ounces_gold',
      status: 'OBSERVED_ATTRIBUTABLE',
      year: 2025,
      sourceScope: 'Newmont_75_percent_attributable_reserve'
    },
    process: {
      resourceTypeId: 'gold',
      ontologyKey: 'GOLD',
      commodityName: 'Gold doré',
      upstreamProcess: 'Open-Pit Mining',
      midstreamProcess: 'Crushing, comminution, gravity, cyanide leach, carbon-in-leach, elution, electrowinning and smelting',
      refinedOutputs: ['GOLD_DORE']
    },
    metadata: {
      sourceAuthority: 'Newmont 2025 SEC annual report',
      currentEvidence: 'Newmont reports Merian as an open-pit operation comprising the Merian 1, Merian 2, Maraba and Kupari pits, with a conventional gold mill using gravity and CIL recovery to produce gold doré. Newmont reported 4.5 million attributable ounces of gold reserves at December 31, 2025.'
    },
    sources: [
      evidence('https://www.sec.gov/Archives/edgar/data/1164727/000116472726000010/nem-20251231.htm', '2025_Merian_pits_processing_method_operator_and_attributable_reserves', 'REGULATORY_FILING'),
      evidence('https://www.sec.gov/Archives/edgar/data/1164727/000116472726000027/nmnt-20251231.htm', '2025_Merian_resource_extraction_payment_and_project_identity', 'REGULATORY_FILING')
    ]
  },
  SITE_GUY_aurora_gold_mine: {
    owner: 'Zijin Mining 85% / Guyana interests',
    operator: 'Aurora Gold Mine / Zijin Mining',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit and underground gold mining with gravity separation and cyanide leaching',
    quantitativeProduction: {
      annual: { value: 4.5, unit: 'metric_tons_gold', year: 2025 },
      status: 'OBSERVED',
      measurementType: 'TOTAL_SITE_GOLD_PRODUCTION',
      sourceScope: 'SITE_SPECIFIC'
    },
    process: {
      resourceTypeId: 'gold',
      ontologyKey: 'GOLD',
      commodityName: 'Gold',
      upstreamProcess: 'Open-Pit Mining and Underground Development',
      midstreamProcess: 'Gravity Separation and Cyanide Leaching',
      refinedOutputs: ['GOLD_DORE']
    },
    metadata: {
      sourceAuthority: 'Zijin Mining',
      currentEvidence: 'Zijin identifies Aurora as Guyana’s only large-scale operating gold mine, 85%-owned, in production and undergoing debottlenecking and expansion. It reports 4.5 tonnes of gold production in 2025 and a 10,000 t/day processing capacity.'
    },
    extra: {
      processingCapacity: { value: 10000, unit: 'metric_tons_ore_per_day', status: 'CURRENT_REPORTED_CAPACITY' },
      fullCapacityGoldTarget: { value: 6, unit: 'metric_tons_gold_per_year', status: 'PLANNED_EXPANSION' }
    },
    sources: [
      evidence('https://www.zijinmining.com/global/program-detail-71743.htm', '2025_site_specific_production_capacity_owner_and_mining_processing_methods', 'OPERATOR')
    ]
  },
  SITE_AUS_boddington_gold_mine: {
    owner: 'Newmont Corporation',
    operator: 'Newmont Boddington Gold',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Large open-pit gold-copper mining with concentrator and processing plant',
    quantitativeReserve: {
      quantity: 10200000,
      unit: 'troy_ounces_gold',
      status: 'OBSERVED',
      year: 2025,
      sourceScope: 'FY2025_RESERVE'
    },
    process: {
      resourceTypeId: 'gold',
      ontologyKey: 'GOLD',
      commodityName: 'Gold and copper concentrate',
      primaryCommodity: 'gold',
      secondaryCommodities: ['copper'],
      upstreamProcess: 'Open-Pit Mining',
      midstreamProcess: 'Crushing, grinding, flotation and gold recovery',
      refinedOutputs: ['GOLD_DORE', 'COPPER_CONCENTRATE']
    },
    metadata: {
      sourceAuthority: 'Newmont',
      currentEvidence: 'Newmont reports Boddington as an active large Australian gold mine producing gold and copper concentrate. FY2025 reserves were 10.2 Moz gold and 0.5 Mt copper. The operation was affected by December 2025 bushfires but returned to higher throughput during 2026.'
    },
    extra: {
      annualGoldProductionGuidance2026: { value: 160000, unit: 'troy_ounces_gold', year: 2026, status: 'CURRENT_ANNUAL_GUIDANCE' },
      annualCopperProductionGuidance2026: { value: 5000, unit: 'metric_tons_copper', year: 2026, status: 'CURRENT_ANNUAL_GUIDANCE' },
      copperReserveFY2025: { value: 500000, unit: 'metric_tons_copper', year: 2025, status: 'OBSERVED' }
    },
    sources: [
      evidence('https://operations.newmont.com/australia/boddington/', 'current_Boddington_production_reserves_status_and_processing_context', 'OPERATOR')
    ]
  },
  SITE_NZL_macraes_gold_mine: {
    owner: 'OceanaGold Corporation',
    operator: 'OceanaGold New Zealand',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Open-pit and underground gold mining with carbon-in-leach and pressure oxidation processing',
    quantitativeProduction: {
      annual: { value: 147000, unit: 'troy_ounces_gold', year: 2025 },
      status: 'OBSERVED',
      measurementType: 'TOTAL_SITE_GOLD_PRODUCTION',
      sourceScope: 'SITE_SPECIFIC'
    },
    process: {
      resourceTypeId: 'gold',
      ontologyKey: 'GOLD',
      commodityName: 'Gold',
      upstreamProcess: 'Open-Pit and Underground Mining',
      midstreamProcess: 'Carbon-in-leach and pressure oxidation',
      refinedOutputs: ['GOLD_DORE']
    },
    metadata: {
      sourceAuthority: 'OceanaGold',
      currentEvidence: 'OceanaGold reports Macraes as the largest gold mine in New Zealand, using both open-pit and underground methods. The mine produced 147,000 ounces of gold in 2025 and has a reserve mine life to 2032.'
    },
    sources: [
      evidence('https://oceanagoldcorporation.com/operations/macraes.html', 'current_Macraes_mine_type_ownership_processing_2025_output_and_mine_life', 'OPERATOR'),
      evidence('https://investors.oceanagold.com/2026-08-05-OceanaGold-Reports-Second-Quarter-2026-Results', 'Q2_2026_current_Macraes_production_and_2026_operating_context', 'OPERATOR')
    ]
  },
  SITE_PNG_lihir_gold_mine: {
    owner: 'Newmont Corporation',
    operator: 'Newmont Lihir',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Large open-pit gold mining with stockpile processing and conventional gold recovery',
    metadata: {
      sourceAuthority: 'Newmont',
      currentEvidence: 'Newmont identifies Lihir as an active managed gold mine and expects 2026 production of about 560,000 ounces, largely in line with 2025. Production is expected to be affected by open-pit reconfiguration and later improved by higher grades from Phase 14A.'
    },
    extra: {
      annualGoldProductionGuidance2026: { value: 560000, unit: 'troy_ounces_gold', year: 2026, status: 'CURRENT_ANNUAL_GUIDANCE' }
    },
    sources: [
      evidence('https://www.newmont.com/investors/news-release/news-details/2026/Newmont-Reports-Fourth-Quarter-and-Full-Year-2025-Results-Provides-2026-Guidance-and-Announces-Enhanced-Capital-Allocation-Framework/', 'current_Lihir_2026_guidance_and_operational_context', 'OPERATOR')
    ]
  },
  SITE_FJI_vatukoula_gold_mine: {
    owner: 'Vatukoula Gold Mines Limited',
    operator: 'Vatukoula Gold Mines Limited',
    status: 'ACTIVE_PRODUCING',
    operationalStatus: 'ACTIVE_PRODUCING',
    extractionEligibility: 'EXECUTABLE',
    extractionMethod: 'Underground gold mining with concentration; limited doré also recovered from tailings retreatment',
    process: {
      resourceTypeId: 'gold',
      ontologyKey: 'GOLD',
      commodityName: 'Gold concentrate and gold doré',
      upstreamProcess: 'Underground Mining',
      midstreamProcess: 'Concentration with tailings retreatment for doré',
      refinedOutputs: ['GOLD_CONCENTRATE', 'GOLD_DORE']
    },
    metadata: {
      sourceAuthority: 'Reserve Bank of Fiji / Fiji Times reporting on VGML',
      currentEvidence: 'Fiji sources state that VGML remained the operator of Vatukoula in 2025 and shifted its product mix toward gold concentrate. The Reserve Bank clarified that its reported gold ore series is not the same as total gold production, so no single annual gold output figure is forced into the site record without a reconciled company figure.'
    },
    extra: {
      measurementWarning: '2025 gold production data must distinguish gold ore, gold concentrate and gold doré; RBF public series are not a complete total-gold production measure.',
      productShiftYear: 2025
    },
    sources: [
      evidence('https://www.fijitimes.com.fj/rbf-clarifies-gold-output-calculations/', '2026_clarification_of_2025_VGML_gold_production_measurement_and_product_shift', 'NEWS'),
      evidence('https://www.rbf.gov.fj/wp-content/uploads/2025/09/Quarterly-Review-June-2025-2.pdf', '2025_VGML_gold_concentration_and_ore_production_measurement_context', 'CENTRAL_BANK')
    ]
  }
};

function applyFix(site, fix) {
  if (!fix) return;
  for (const key of ['owner','operator','status','operationalStatus','extractionEligibility','extractionMethod']) {
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
  if (fix.quantitativeProduction) {
    site.quantitativeProfile = site.quantitativeProfile || {};
    site.quantitativeProfile.production = { ...fix.quantitativeProduction };
  }
  if (fix.ownershipScope !== undefined) site.ownershipScope = fix.ownershipScope;
  if (fix.extra && typeof fix.extra === 'object') Object.assign(site, fix.extra);
  if (fix.process && typeof fix.process === 'object') {
    site.resourceIdentity = {
      ...(site.resourceIdentity || {}),
      ...fix.process
    };
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
  if (site.siteIdentity && typeof site.siteIdentity === 'object') {
    site.siteIdentity.resourceTypeId = site.resourceTypeId ?? null;
  }
  site.dataCompleteness = site.dataCompleteness || {};
  site.dataCompleteness.ownership = site.owner === 'UNOBSERVED' ? 'UNOBSERVED' : 'REPORTED';
}

function promoteStructuredQuantitative(site) {
  const qp = site.quantitativeProfile || (site.quantitativeProfile = {});
  const web = site.webVerifiedMetrics && typeof site.webVerifiedMetrics === 'object'
    ? site.webVerifiedMetrics : {};
  const capacity = site.capacityProfile && typeof site.capacityProfile === 'object'
    ? site.capacityProfile : {};

  if (Object.keys(web).length) {
    qp.reportedMetrics = { ...(qp.reportedMetrics || {}), ...web };
  }

  const numericMetric = (predicate) => {
    for (const [key, metric] of Object.entries(web)) {
      if (!predicate(key, metric)) continue;
      const value = Number(metric?.value);
      if (Number.isFinite(value) && value > 0) return { key, metric, value };
    }
    return null;
  };

  const annualProduction = numericMetric((key) =>
    /Production\d{4}$/.test(key) && !/attributable/i.test(key)
  );
  if (annualProduction && !(qp.production?.annual != null && qp.production?.annual !== '')) {
    const yearMatch = annualProduction.key.match(/(\\d{4})$/);
    qp.production = {
      ...(qp.production || {}),
      annual: annualProduction.value,
      unit: annualProduction.metric?.unit || qp.production?.unit || null,
      year: yearMatch ? Number(yearMatch[1]) : qp.production?.year || null,
      status: 'OBSERVED',
      basis: annualProduction.metric?.basis || 'SITE_SPECIFIC'
    };
  }

  const headGrade = numericMetric((key) => /headGrade\d{4}$/.test(key));
  if (headGrade && !(qp.grade?.value != null && qp.grade.value !== '')) {
    const yearMatch = headGrade.key.match(/(\\d{4})$/);
    qp.grade = {
      ...(qp.grade || {}),
      value: headGrade.value,
      unit: headGrade.metric?.unit || qp.grade?.unit || null,
      year: yearMatch ? Number(yearMatch[1]) : qp.grade?.year || null,
      status: 'OBSERVED'
    };
  }

  const recovery = numericMetric((key) => /(?:^|_)recovery\d{4}$/.test(key) || /plantRecovery\d{4}$/.test(key));
  if (recovery) {
    const yearMatch = recovery.key.match(/(\\d{4})$/);
    qp.recovery = {
      ...(qp.recovery || {}),
      value: recovery.value,
      unit: recovery.metric?.unit || qp.recovery?.unit || null,
      year: yearMatch ? Number(yearMatch[1]) : qp.recovery?.year || null,
      status: 'OBSERVED'
    };
  }

  const throughput = numericMetric((key) => /oreMilled\d{4}$/.test(key) || /throughput\d{4}$/.test(key));
  if (throughput) {
    const yearMatch = throughput.key.match(/(\\d{4})$/);
    qp.throughput = {
      ...(qp.throughput || {}),
      value: throughput.value,
      unit: throughput.metric?.unit || qp.throughput?.unit || null,
      year: yearMatch ? Number(yearMatch[1]) : qp.throughput?.year || null,
      status: 'OBSERVED'
    };
  }

  if (Object.keys(capacity).length) {
    qp.capacity = { ...(qp.capacity || {}), ...capacity };
  }

  qp.quantitativeProvenance = {
    ...(qp.quantitativeProvenance || {}),
    structuredSource: Object.keys(web).length ? 'site.webVerifiedMetrics' : qp.quantitativeProvenance?.structuredSource || null,
    capacitySource: Object.keys(capacity).length ? 'site.capacityProfile' : qp.quantitativeProvenance?.capacitySource || null,
    promotedAt: REVIEW_DATE
  };
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
      grade: qp.grade || { value: null, unit: null, status: 'UNOBSERVED' },
      recovery: qp.recovery || { value: null, unit: null, year: null, status: 'UNOBSERVED' },
      throughput: qp.throughput || { value: null, unit: null, year: null, status: 'UNOBSERVED' },
      capacity: qp.capacity || {},
      reportedMetrics: qp.reportedMetrics || {},
      quantitativeProvenance: qp.quantitativeProvenance || {}
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
  promoteStructuredQuantitative(site);
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
  site.extractionProfile = site.extractionProfile || {};
  site.extractionProfile.owner = site.owner ?? 'UNOBSERVED';
  site.extractionProfile.operator = site.operator ?? 'UNOBSERVED';
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
