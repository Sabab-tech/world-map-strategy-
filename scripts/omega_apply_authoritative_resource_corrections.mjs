#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const REVIEW_DATE = '2026-10-02';
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
  }

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
