/**
 * ============================================================================
 * UNIVERSAL RESOURCE ENGINE & AUTONOMOUS RESOURCE MINISTRY AI (v3.0 - GOLD)
 * Subsystem: Sovereign Resource Intelligence System (100% Offline Rule AI)
 * Capabilities: 17 Strategic Resources, Map Deposit Overlays, 9-Step Lifecycle,
 * Inter-Ministry Collaboration, Memory Engine, and Executive Dashboard.
 * ============================================================================
 */

window.ResourceMinistryEngine = (() => {
    // -------------------------------------------------------------------------
    // 1. THE 17 CORE STRATEGIC RESOURCES DEFINITION REGISTRY
    // -------------------------------------------------------------------------
    const STRATEGIC_RESOURCES = {
        iron_ore: {
            id: 'iron_ore',
            name: 'Iron Ore',
            bnName: 'আকরিক লোহা',
            icon: '⛏️',
            category: 'Minerals',
            baseValue: 120, // $ / Ton
            purityGrades: ['Fe 58%', 'Fe 62% Standard', 'Fe 65% Premium'],
            inputs: ['heavy_machinery', 'electricity'],
            outputs: ['steel', 'defense_armor', 'rails'],
            storageRule: 'Open Pit Bulk Yard (Unlimited loss tolerance)',
            strategicImportance: 'Critical for heavy manufacturing, shipyards, rail networks, and armored military hardware.'
        },
        coal: {
            id: 'coal',
            name: 'Coal',
            bnName: 'কয়লা',
            icon: '🪨',
            category: 'Energy & Smelting',
            baseValue: 140,
            purityGrades: ['Thermal Coal', 'Coking Metallurgical Coal', 'Anthracite'],
            inputs: ['mining_rigs'],
            outputs: ['electricity', 'coke_smelting'],
            storageRule: 'Covered Bulk Bunkers (Spontaneous combustion risk)',
            strategicImportance: 'Powers baseload thermal power stations and essential for steel smelting.'
        },
        copper: {
            id: 'copper',
            name: 'Copper',
            bnName: 'তামা',
            icon: '🔌',
            category: 'Strategic Metals',
            baseValue: 8500, // $ / Ton
            purityGrades: ['Concentrate 28%', 'Cathode Grade A 99.99%'],
            inputs: ['electricity', 'chemical_solvents'],
            outputs: ['power_grid', 'electronics', 'telecom_cables'],
            storageRule: 'Secured High-Value Warehouse',
            strategicImportance: 'Backbone of national electrical grid, motor windings, EV tech, and guided munitions.'
        },
        bauxite: {
            id: 'bauxite',
            name: 'Bauxite / Aluminum',
            bnName: 'বক্সাইট (অ্যালুমিনিয়াম)',
            icon: '📦',
            category: 'Strategic Metals',
            baseValue: 320,
            purityGrades: ['Trihydrate Bauxite', 'Refined Alumina', 'Primary Aluminum Ingot'],
            inputs: ['electricity', 'caustic_soda'],
            outputs: ['aircraft_hull', 'automotive', 'structural_alloys'],
            storageRule: 'Dry Silo Yards',
            strategicImportance: 'Essential for military aviation, naval superstructures, and light transport alloys.'
        },
        limestone: {
            id: 'limestone',
            name: 'Limestone',
            bnName: 'চুনাপাথর',
            icon: '🧱',
            category: 'Construction Materials',
            baseValue: 45,
            purityGrades: ['Industrial Grade', 'High-Calcium Chemical Grade'],
            inputs: ['quarry_excavators'],
            outputs: ['cement', 'quicklime', 'soil_conditioner'],
            storageRule: 'Quarry Stockpiles',
            strategicImportance: 'Primary raw input for national cement industry, ports, mega-bridges, and fortifications.'
        },
        rare_earth: {
            id: 'rare_earth',
            name: 'Rare Earth Minerals',
            bnName: 'বিরল মৃত্তিকা (REE)',
            icon: '💎',
            category: 'High-Tech Elements',
            baseValue: 45000,
            purityGrades: ['Light REE (Neodymium/Praseodymium)', 'Heavy REE (Dysprosium/Terbium)'],
            inputs: ['acid_leaching_plant', 'high_power_grid'],
            outputs: ['semiconductors', 'radar_magnets', 'missile_guidance', 'ev_motors'],
            storageRule: 'Classified Subterranean High-Security Vault',
            strategicImportance: 'Vital for electronic warfare, precision radar, quantum computing, and missile guidance.'
        },
        crude_oil: {
            id: 'crude_oil',
            name: 'Crude Oil',
            bnName: 'অপরিশোধিত তেল',
            icon: '🛢️',
            category: 'Hydrocarbons',
            baseValue: 80, // $ / Barrel
            purityGrades: ['Light Sweet Crude', 'Medium Sour', 'Heavy Bitumen'],
            inputs: ['drilling_rigs', 'pipelines'],
            outputs: ['gasoline', 'diesel', 'jet_fuel', 'petrochemicals'],
            storageRule: 'Strategic Petroleum Reserve (SPR) Underground Salt Caverns',
            strategicImportance: 'Fuels mechanized armored forces, naval fleets, logistics trucks, and aviation squadrons.'
        },
        natural_gas: {
            id: 'natural_gas',
            name: 'Natural Gas',
            bnName: 'প্রাকৃতিক গ্যাস',
            icon: '🔥',
            category: 'Hydrocarbons',
            baseValue: 3.80, // $ / MMBtu
            purityGrades: ['Pipeline Methane (PNG)', 'Liquefied Natural Gas (LNG)', 'Compressed Natural Gas (CNG)'],
            inputs: ['compressor_stations', 'lng_cryo_terminal'],
            outputs: ['urea_fertilizer', 'peaking_electricity', 'petrochemicals'],
            storageRule: 'Cryogenic LNG Depots & Pressurized Salt Dome Storage',
            strategicImportance: 'Primary feedstock for urea fertilizer production and gas turbine electric power.'
        },
        uranium: {
            id: 'uranium',
            name: 'Uranium',
            bnName: 'ইউরেনিয়াম',
            icon: '⚛️',
            category: 'Nuclear Feedstock',
            baseValue: 180000, // $ / Ton U3O8
            purityGrades: ['Yellowcake U3O8', 'Low Enriched LEU 3-5%', 'High Assayed HALEU 19.75%'],
            inputs: ['centrifuge_cascades', 'heavy_water_reactors'],
            outputs: ['nuclear_power', 'medical_isotopes', 'strategic_deterrent'],
            storageRule: 'Radiation-Shielded Underground Bunkers',
            strategicImportance: 'Provides zero-carbon nuclear electricity baseload and strategic sovereign deterrence.'
        },
        electricity: {
            id: 'electricity',
            name: 'Electricity & Grid Capacity',
            bnName: 'বিদ্যুৎ ও জাতীয় গ্রিড',
            icon: '⚡',
            category: 'Secondary Energy',
            baseValue: 0.12, // $ / kWh
            purityGrades: ['50Hz Synchronous Baseload', 'HVDC Long-Distance Grid'],
            inputs: ['coal', 'natural_gas', 'uranium', 'hydropower'],
            outputs: ['factory_operation', 'urban_power', 'radar_stations'],
            storageRule: 'Pumped Hydro & Utility Battery Storage (Loss over time)',
            strategicImportance: 'Lifeblood of modern industrial manufacturing, AI data hubs, urban grids, and air defense.'
        },
        rice: {
            id: 'rice',
            name: 'Rice',
            bnName: 'ধান/চাল',
            icon: '🌾',
            category: 'Staple Food',
            baseValue: 480, // $ / Ton
            purityGrades: ['Paddy Rice', 'Milled Non-Basmati', 'Premium Aromatic'],
            inputs: ['irrigation_water', 'urea_fertilizer', 'arable_land'],
            outputs: ['food_rations', 'national_caloric_reserve'],
            storageRule: 'Climate-Controlled Food Silos (Pest monitoring)',
            strategicImportance: 'Core dietary staple for Asia; guards against national famine and social instability.'
        },
        wheat: {
            id: 'wheat',
            name: 'Wheat',
            bnName: 'গম',
            icon: '🌾',
            category: 'Staple Food',
            baseValue: 320,
            purityGrades: ['Hard Red Winter', 'Soft Red Winter', 'Durum Wheat'],
            inputs: ['water', 'fertilizer', 'combine_harvesters'],
            outputs: ['flour', 'bread', 'emergency_military_rations'],
            storageRule: 'Granary Grain Elevators',
            strategicImportance: 'Global caloric cornerstone; essential for bakery supplies and strategic food reserves.'
        },
        food_processing: {
            id: 'food_processing',
            name: 'Food Processing & Rations',
            bnName: 'খাদ্য প্রক্রিয়াজাতকরণ',
            icon: '🏭',
            category: 'Value-Added Food',
            baseValue: 950,
            purityGrades: ['Packaged Staples', 'Long-Shelf MRE Military Rations'],
            inputs: ['rice', 'wheat', 'clean_water', 'packaging_aluminum'],
            outputs: ['human_stamina', 'emergency_disaster_relief'],
            storageRule: 'Automated Logistics Distribution Centers',
            strategicImportance: 'Ensures food shelf-life during wartime blockades, natural floods, and civil supply shocks.'
        },
        water: {
            id: 'water',
            name: 'Water Resources',
            bnName: 'জলসম্পদ / মিঠা পানি',
            icon: '💧',
            category: 'Natural Essentials',
            baseValue: 1.50, // $ / m3
            purityGrades: ['Raw River/Aquifer Water', 'Potable Municipal Water', 'Ultra-Pure Deionized Water'],
            inputs: ['dams', 'water_treatment_plants', 'aquifers'],
            outputs: ['crop_irrigation', 'nuclear_cooling', 'municipal_drinking'],
            storageRule: 'Reservoirs, Lakes & Underground Aquifer Retention',
            strategicImportance: 'Underpins all agricultural yield, industrial cooling loops, and human survival.'
        },
        timber: {
            id: 'timber',
            name: 'Timber & Forests',
            bnName: 'বনজ সম্পদ / কাষ্ঠ',
            icon: '🪵',
            category: 'Renewable Resources',
            baseValue: 210,
            purityGrades: ['Softwood Construction Lumber', 'Hardwood Teak/Mahogany', 'Pulpwood'],
            inputs: ['sustainable_forestry', 'sawmills'],
            outputs: ['housing', 'paper', 'biomass_fuel'],
            storageRule: 'Open Log Ponds & Seasoning Yards',
            strategicImportance: 'Essential for construction formwork, paper products, modular housing, and biomass.'
        },
        cement: {
            id: 'cement',
            name: 'Cement Industry',
            bnName: 'সিমেন্ট শিল্প',
            icon: '🏗️',
            category: 'Industrial Building',
            baseValue: 110,
            purityGrades: ['Ordinary Portland Cement (OPC)', 'Portland Pozzolana (PPC)'],
            inputs: ['limestone', 'gypsum', 'coal_kilns'],
            outputs: ['bunkers', 'seaports', 'highways', 'dams'],
            storageRule: 'Moisture-Sealed Dry Cement Silos',
            strategicImportance: 'Core material for sovereign infrastructure, coastal embankments, and military fortifications.'
        },
        sand: {
            id: 'sand',
            name: 'Sand & Industrial Silica',
            bnName: 'শিল্প বালি & সিলিকা',
            icon: '⏳',
            category: 'Bulk Aggregate',
            baseValue: 35,
            purityGrades: ['River Dredged Fill Sand', 'High-Purity 99.5% Silica Sand'],
            inputs: ['dredgers', 'washing_screens'],
            outputs: ['concrete_mix', 'solar_glass', 'silicon_wafer_precursor'],
            storageRule: 'Open Riverbed Stockpiles',
            strategicImportance: 'Crucial for land reclamation, concrete mixing, glassmaking, and semiconductor silicon.'
        },
        rare_earth: {
            id: 'rare_earth',
            name: 'Rare Earth Elements (REE)',
            bnName: 'বিরল মৃত্তিকা মৌল (রেয়ার আর্থ)',
            icon: '⚛️',
            category: 'Critical Minerals',
            baseValue: 45000,
            purityGrades: ['Bastnäsite Concentrate', 'Monazite Heavy Fraction', '99.99% Separated Oxides'],
            inputs: ['acid_leach', 'solvent_extraction'],
            outputs: ['permanent_magnets', 'guided_missile_guidance', 'radar', 'EV_motors'],
            storageRule: 'High Security Underground Storage',
            strategicImportance: 'Indispensable for defense radars, precision guided weapons, EV motors, and jet engines.'
        },
        lithium: {
            id: 'lithium',
            name: 'Lithium (LCE)',
            bnName: 'লিথিয়াম',
            icon: '🔋',
            category: 'Battery Minerals',
            baseValue: 28000,
            purityGrades: ['Spodumene Concentrate 6%', 'Battery Grade Carbonate 99.5%', 'Lithium Hydroxide'],
            inputs: ['evaporation_ponds', 'hard_rock_crushing'],
            outputs: ['ev_batteries', 'grid_energy_storage', 'submarine_power'],
            storageRule: 'Climate Controlled Sealed Vaults',
            strategicImportance: 'Powerhouse mineral for energy transition, submarine batteries, and grid storage.'
        },
        cobalt: {
            id: 'cobalt',
            name: 'Cobalt',
            bnName: 'কোবাল্ট',
            icon: '🔷',
            category: 'Critical Minerals',
            baseValue: 34000,
            purityGrades: ['Cobalt Hydroxide', 'High Purity Cathode Grade'],
            inputs: ['copper_nickel_tailings'],
            outputs: ['superalloys', 'jet_turbines', 'battery_cathodes'],
            storageRule: 'Secured Warehouse',
            strategicImportance: 'High-temperature superalloys for jet engines and energy dense batteries.'
        },
        semiconductor: {
            id: 'semiconductor',
            name: 'Semiconductors & Chips',
            bnName: 'সেমিকন্ডাক্টর & চিপস',
            icon: '💻',
            category: 'High-Tech Strategy',
            baseValue: 120000,
            purityGrades: ['Legacy 28nm+', 'Advanced 7nm/5nm', 'Cutting Edge 3nm/2nm'],
            inputs: ['ultra_pure_silica', 'rare_earth', 'EUV_lithography'],
            outputs: ['ai_supercomputers', 'radar_arrays', 'guided_missiles', 'cyber_warfare'],
            storageRule: 'Cleanroom Sealed Inert Vault',
            strategicImportance: 'The ultimate digital and military force multiplier underpinning modern power.'
        },
        gold: {
            id: 'gold',
            name: 'Gold Deposits',
            bnName: 'স্বর্ণ সঞ্চয়',
            icon: '🥇',
            category: 'Precious Metals',
            baseValue: 65000000,
            purityGrades: ['Dore Bar 80%', 'Bullion 99.99%'],
            inputs: ['deep_shafts', 'cyanide_leaching'],
            outputs: ['sovereign_reserves', 'microelectronics'],
            storageRule: 'Central Bank Subterranean Fortress Vault',
            strategicImportance: 'Ultimate sovereign monetary reserve asset and inflation hedge.'
        },
        titanium: {
            id: 'titanium',
            name: 'Titanium Ore',
            bnName: 'টাইটানিয়াম',
            icon: '🛡️',
            category: 'Strategic Metals',
            baseValue: 18000,
            purityGrades: ['Ilmenite Ore', 'Titanium Sponge 99.7%'],
            inputs: ['magnesium_reduction'],
            outputs: ['stealth_jets', 'submarines', 'missile_casings'],
            storageRule: 'Dry Inert Depot',
            strategicImportance: 'High strength-to-weight alloy essential for hypersonic and aerospace engineering.'
        },
        diamond: {
            id: 'diamond',
            name: 'Industrial & Gem Diamond',
            bnName: 'হীরা সঞ্চয়',
            icon: '💎',
            category: 'Precious & Industrial',
            baseValue: 8500000,
            purityGrades: ['Industrial Grit', 'Gem Grade Cut'],
            inputs: ['kimberlite_mining'],
            outputs: ['precision_cutting', 'sovereign_treasury'],
            storageRule: 'Vault Storage',
            strategicImportance: 'Hardest material for industrial drill bits and liquid sovereign reserve.'
        }
    };

    // -------------------------------------------------------------------------
    // 2. GLOBAL GEOGRAPHIC RESOURCE DEPOSITS DATABASE (Exact Lat/Lng)
    // -------------------------------------------------------------------------
    const GEOGRAPHIC_DEPOSITS = [
        // BANGLADESH
        { name: "Sylhet Chhatak Limestone Quarry", resId: "limestone", country: "BANGLADESH", lat: 25.04, lng: 91.67, reserve: "High Grade", status: "Active Mine" },
        { name: "Bibiyana Gas Field", resId: "natural_gas", country: "BANGLADESH", lat: 24.64, lng: 91.65, reserve: "4.5 TCF", status: "Major Field" },
        { name: "Titas Gas Deposit", resId: "natural_gas", country: "BANGLADESH", lat: 23.98, lng: 91.11, reserve: "3.2 TCF", status: "Active Field" },
        { name: "Barapukuria Coal Mine", resId: "coal", country: "BANGLADESH", lat: 25.55, lng: 88.96, reserve: "390M Tons", status: "Underground Mining" },
        { name: "Ganges-Padma Delta Rice Belt", resId: "rice", country: "BANGLADESH", lat: 23.20, lng: 89.80, reserve: "38M Tons/yr", status: "Agricultural Zone" },
        { name: "Kaptai Hydro Power Dam", resId: "electricity", country: "BANGLADESH", lat: 22.49, lng: 92.22, reserve: "230 MW", status: "Hydroelectric Station" },
        { name: "Chittagong Hill Tracts Timber Reserve", resId: "timber", country: "BANGLADESH", lat: 22.50, lng: 92.30, reserve: "Dense Hardwood", status: "Forestry Reserve" },
        { name: "Sylhet Chhatak Cement Hub", resId: "cement", country: "BANGLADESH", lat: 25.02, lng: 91.66, reserve: "5.5M Tons/yr", status: "Industrial Complex" },
        { name: "Jamuna River Dredged Sand Reserve", resId: "sand", country: "BANGLADESH", lat: 24.40, lng: 89.75, reserve: "Abundant Aggregate", status: "Active Dredging" },

        // INDIA
        { name: "Jharia Coal Field", resId: "coal", country: "INDIA", lat: 23.75, lng: 86.42, reserve: "19B Tons", status: "Active Mining" },
        { name: "Singhbhum Iron Ore Belt", resId: "iron_ore", country: "INDIA", lat: 22.50, lng: 85.80, reserve: "5B Tons", status: "Major Mine" },
        { name: "Kudremukh Iron Ore Complex", resId: "iron_ore", country: "INDIA", lat: 13.22, lng: 75.25, reserve: "1.2B Tons", status: "Active Pit" },
        { name: "Punjab Wheat Agricultural Granary", resId: "wheat", country: "INDIA", lat: 30.90, lng: 75.85, reserve: "110M Tons/yr", status: "Primary Crop" },
        { name: "Mumbai High Offshore Oil Rig", resId: "crude_oil", country: "INDIA", lat: 19.42, lng: 71.33, reserve: "1.8B Barrels", status: "Offshore Platform" },
        { name: "Korba Bauxite & Aluminum Smelter", resId: "bauxite", country: "INDIA", lat: 22.35, lng: 82.68, reserve: "320M Tons", status: "Processing Plant" },

        // PAKISTAN
        { name: "Saindak Copper-Gold Deposit", resId: "copper", country: "PAKISTAN", lat: 29.27, lng: 61.60, reserve: "412M Tons", status: "Active Mine" },
        { name: "Thar Coal Field", resId: "coal", country: "PAKISTAN", lat: 24.75, lng: 70.30, reserve: "175B Tons", status: "Open Pit" },
        { name: "Sui Gas Field", resId: "natural_gas", country: "PAKISTAN", lat: 28.63, lng: 69.30, reserve: "2.0 TCF", status: "Active Field" },
        { name: "Tarbela Hydro Power Reservoir", resId: "electricity", country: "PAKISTAN", lat: 34.09, lng: 72.70, reserve: "4,880 MW", status: "Mega Dam" },

        // USA
        { name: "Permian Basin Oil Fields", resId: "crude_oil", country: "USA", lat: 31.85, lng: -102.36, reserve: "20B Barrels", status: "Active Field" },
        { name: "Marcellus Shale Gas Basin", resId: "natural_gas", country: "USA", lat: 41.20, lng: -77.20, reserve: "85 TCF", status: "Active Field" },
        { name: "Mountain Pass Rare Earth Mine", resId: "rare_earth", country: "USA", lat: 35.48, lng: -115.53, reserve: "1.5M Tons", status: "Active Mine" },
        { name: "Mesabi Iron Range", resId: "iron_ore", country: "USA", lat: 47.50, lng: -92.53, reserve: "High Capacity", status: "Active Pit" },
        { name: "Appalachian Coal Basin", resId: "coal", country: "USA", lat: 38.50, lng: -80.50, reserve: "50B Tons", status: "Active Field" },
        { name: "Morenci Copper Mine", resId: "copper", country: "USA", lat: 33.08, lng: -109.36, reserve: "12M Tons", status: "Active Pit" },
        { name: "Great Lakes Water System", resId: "water", country: "USA", lat: 45.00, lng: -84.00, reserve: "6 Quadrillion Gal", status: "Freshwater Basin" },

        // CHINA
        { name: "Bayan Obo Rare Earth Mine", resId: "rare_earth", country: "CHINA", lat: 41.78, lng: 109.97, reserve: "40M Tons (Global Leader)", status: "Active Supermine" },
        { name: "Shanxi Coal Superbasin", resId: "coal", country: "CHINA", lat: 37.87, lng: 112.55, reserve: "200B Tons", status: "Active Basin" },
        { name: "Three Gorges Hydro Plant", resId: "electricity", country: "CHINA", lat: 30.82, lng: 111.00, reserve: "22,500 MW", status: "Hydroelectric Dam" },
        { name: "Anshan Iron Ore Complex", resId: "iron_ore", country: "CHINA", lat: 41.10, lng: 122.98, reserve: "10B Tons", status: "Active Mine" },
        { name: "Yangtze Delta Rice Belt", resId: "rice", country: "CHINA", lat: 31.20, lng: 120.60, reserve: "210M Tons/yr", status: "Agricultural Zone" },
        { name: "Daqing Oilfield", resId: "crude_oil", country: "CHINA", lat: 46.58, lng: 125.02, reserve: "16B Barrels", status: "Active Field" },

        // RUSSIA
        { name: "West Siberian Oil Basin", resId: "crude_oil", country: "RUSSIA", lat: 61.25, lng: 73.40, reserve: "35B Barrels", status: "Active Superfield" },
        { name: "Urengoy Gas Field", resId: "natural_gas", country: "RUSSIA", lat: 66.00, lng: 78.00, reserve: "100 TCF", status: "Active Field" },
        { name: "Kuzbass Coal Basin", resId: "coal", country: "RUSSIA", lat: 55.30, lng: 86.00, reserve: "90B Tons", status: "Active Mine" },
        { name: "Siberian Taiga Forest Timber", resId: "timber", country: "RUSSIA", lat: 58.00, lng: 100.00, reserve: "12M Sq Km", status: "Boreal Forest" },
        { name: "Lake Baikal Water Reserve", resId: "water", country: "RUSSIA", lat: 53.50, lng: 108.00, reserve: "23,600 km3", status: "Freshwater Reserve" },
        { name: "Norilsk Nickel & Copper Mine", resId: "copper", country: "RUSSIA", lat: 69.35, lng: 88.20, reserve: "18M Tons", status: "Arctic Mining" },

        // SAUDI ARABIA
        { name: "Ghawar Oil Field", resId: "crude_oil", country: "SAUDI ARABIA", lat: 25.40, lng: 49.60, reserve: "70B Barrels", status: "Active Superfield" },
        { name: "Safaniya Offshore Oil Field", resId: "crude_oil", country: "SAUDI ARABIA", lat: 28.00, lng: 48.80, reserve: "37B Barrels", status: "Offshore Platform" },
        { name: "Jubail Petrochemical Complex", resId: "natural_gas", country: "SAUDI ARABIA", lat: 27.00, lng: 49.65, reserve: "High Processing", status: "Refinery Hub" },

        // UAE & QATAR & BAHRAIN & MALDIVES
        { name: "North Field Natural Gas", resId: "natural_gas", country: "QATAR", lat: 26.00, lng: 51.50, reserve: "900 TCF", status: "World LNG Leader" },
        { name: "Upper Zakum Oil Field", resId: "crude_oil", country: "UAE", lat: 24.80, lng: 53.70, reserve: "50B Barrels", status: "Offshore Rig" },
        { name: "Bahrain Offshore Oil & Gas Field", resId: "crude_oil", country: "BAHRAIN", lat: 26.06, lng: 50.55, reserve: "80B Barrels Shale", status: "Offshore Discovery" },
        { name: "Alba Aluminum Smelter Hub", resId: "bauxite", country: "BAHRAIN", lat: 26.11, lng: 50.60, reserve: "1.5M Tons/yr", status: "Smelter Plant" },
        { name: "Maldives Coral Atoll Fisheries", resId: "rice", country: "MALDIVES", lat: 3.20, lng: 73.22, reserve: "180,000 Tons Marine", status: "Sovereign Maritime" },
        { name: "Male Desalination & Solar Grid", resId: "water", country: "MALDIVES", lat: 4.17, lng: 73.51, reserve: "45M Liters/day", status: "Freshwater Plant" },

        // IRAN & IRAQ & PALESTINE
        { name: "South Pars Gas Field", resId: "natural_gas", country: "IRAN", lat: 27.50, lng: 52.60, reserve: "500 TCF", status: "Active Field" },
        { name: "Rumaila Oil Field", resId: "crude_oil", country: "IRAQ", lat: 30.20, lng: 47.30, reserve: "17B Barrels", status: "Active Field" },
        { name: "Gaza Marine Offshore Gas Field", resId: "natural_gas", country: "PALESTINE", lat: 31.45, lng: 34.20, reserve: "1.0 TCF Offshore", status: "Sovereign Gas Reserve" },
        { name: "West Bank Agricultural Grain Belt", resId: "wheat", country: "PALESTINE", lat: 31.90, lng: 35.20, reserve: "Organic Grain", status: "Agricultural Zone" },

        // TURKEY & EGYPT
        { name: "Eskişehir Boron & REE Deposit", resId: "rare_earth", country: "TURKEY", lat: 39.77, lng: 30.52, reserve: "694M Tons", status: "Active Mine" },
        { name: "Zohr Gas Field Mediterranean", resId: "natural_gas", country: "EGYPT", lat: 32.50, lng: 31.80, reserve: "30 TCF", status: "Offshore Field" },

        // NORTH AFRICA (ALGERIA, EGYPT, LIBYA, MOROCCO, TUNISIA, SUDAN)
        { name: "Hassi R'Mel Natural Gas Basin", resId: "natural_gas", country: "ALGERIA", lat: 32.50, lng: 3.25, reserve: "85 TCF", status: "Active Superfield" },
        { name: "Hassi Messaoud Crude Oil Field", resId: "crude_oil", country: "ALGERIA", lat: 31.86, lng: 6.07, reserve: "12B Barrels", status: "Active Oil Field" },
        { name: "Gara Djebilet Iron Ore Mine", resId: "iron_ore", country: "ALGERIA", lat: 26.88, lng: -7.02, reserve: "3.5B Tons", status: "Mega Mining Complex" },
        { name: "Hoggar Shield Gold & Uranium Belt", resId: "gold", country: "ALGERIA", lat: 22.78, lng: 5.52, reserve: "50 Tons Gold / 26K Tons Uranium", status: "Active Pit" },

        { name: "Western Desert Oil Fields", resId: "crude_oil", country: "EGYPT", lat: 29.50, lng: 28.20, reserve: "4.2B Barrels", status: "Active Field" },
        { name: "Sukari Orogenic Gold Mine", resId: "gold", country: "EGYPT", lat: 24.95, lng: 34.71, reserve: "12M Oz Gold", status: "Active Mine" },
        { name: "Abu Tartur Phosphate Mine", resId: "bauxite", country: "EGYPT", lat: 25.42, lng: 30.05, reserve: "1.0B Tons Phosphate", status: "Active Surface Mine" },

        { name: "Sirte Crude Oil Superbasin", resId: "crude_oil", country: "LIBYA", lat: 29.20, lng: 19.30, reserve: "48B Barrels (Africa Largest)", status: "Active Field" },
        { name: "Murzuq Oil Field Zone", resId: "crude_oil", country: "LIBYA", lat: 25.90, lng: 13.90, reserve: "5.2B Barrels", status: "Active Field" },
        { name: "Greenstream Mellitah Gas Hub", resId: "natural_gas", country: "LIBYA", lat: 32.88, lng: 12.24, reserve: "18 TCF", status: "Active Gas Terminal" },
        { name: "Wadi Shati Iron Ore Basin", resId: "iron_ore", country: "LIBYA", lat: 27.50, lng: 14.20, reserve: "3.8B Tons", status: "Strategic Reserve" },

        { name: "Oulad Abdoun Khouribga Phosphate Supermine", resId: "bauxite", country: "MOROCCO", lat: 32.88, lng: -6.91, reserve: "50B Tons (70% Global Reserves)", status: "World Leader" },
        { name: "Anti-Atlas Imiter Silver & Copper Belt", resId: "copper", country: "MOROCCO", lat: 31.35, lng: -5.80, reserve: "8,500 Tons Silver", status: "Active Mine" },
        { name: "Bou Azzer Cobalt & Polymetallic Mine", resId: "rare_earth", country: "MOROCCO", lat: 30.52, lng: -6.90, reserve: "High Grade Cobalt & REE", status: "Active Mine" },
        { name: "Noor Ouarzazate Solar Complex", resId: "electricity", country: "MOROCCO", lat: 30.99, lng: -6.86, reserve: "580 MW Solar Grid", status: "Active Solar Complex" },

        { name: "Gafsa Phosphate Basin", resId: "bauxite", country: "TUNISIA", lat: 34.42, lng: 8.78, reserve: "1.2B Tons", status: "Active Mine" },
        { name: "Pelagian Sfax Offshore Gas & Oil Field", resId: "natural_gas", country: "TUNISIA", lat: 34.73, lng: 11.20, reserve: "2.8 TCF", status: "Offshore Platform" },

        { name: "Hassai Red Sea Gold Belt", resId: "gold", country: "SUDAN", lat: 19.60, lng: 35.80, reserve: "90 Tons/yr Production", status: "Active Mine" },
        { name: "Muglad Petroleum Rift Basin", resId: "crude_oil", country: "SUDAN", lat: 10.20, lng: 28.50, reserve: "1.5B Barrels", status: "Active Field" },
        { name: "Khartoum Refinery & Oil Terminal", resId: "crude_oil", country: "SUDAN", lat: 15.65, lng: 32.52, reserve: "100,000 bpd Capacity", status: "Refinery Hub" },

        // AUSTRALIA
        { name: "Pilbara Iron Ore Range", resId: "iron_ore", country: "AUSTRALIA", lat: -21.50, lng: 119.00, reserve: "25B Tons", status: "Mega Mining Hub" },
        { name: "Weipa Bauxite Mine", resId: "bauxite", country: "AUSTRALIA", lat: -12.63, lng: 141.87, reserve: "3B Tons", status: "Active Surface Mine" },
        { name: "Olympic Dam Uranium & Copper", resId: "uranium", country: "AUSTRALIA", lat: -30.43, lng: 136.88, reserve: "2.1M Tons Uranium", status: "Active Supermine" },

        // JAPAN & SOUTH KOREA
        { name: "Kashiwazaki-Kariwa Nuclear Power", resId: "electricity", country: "JAPAN", lat: 37.42, lng: 138.60, reserve: "8,212 MW", status: "Nuclear Plant" },
        { name: "Pohang High Tech Steel Mill", resId: "iron_ore", country: "SOUTH_KOREA", lat: 36.01, lng: 129.38, reserve: "41M Tons/yr", status: "Industrial Steel" },

        // GERMANY, FRANCE, UK
        { name: "Ruhr Industrial Coal & Steel Basin", resId: "coal", country: "GERMANY", lat: 51.50, lng: 7.20, reserve: "40B Tons", status: "Industrial Hub" },
        { name: "Gravelines Nuclear Energy Hub", resId: "electricity", country: "FRANCE", lat: 51.01, lng: 2.13, reserve: "5,460 MW", status: "Nuclear Grid" },
        { name: "North Sea Forties Oil Field", resId: "crude_oil", country: "UNITED_KINGDOM", lat: 57.75, lng: 0.90, reserve: "4.2B Barrels", status: "Offshore Field" },

        // CANADA & BRAZIL & CHILE
        { name: "Athabasca Oil Sands", resId: "crude_oil", country: "CANADA", lat: 57.00, lng: -111.50, reserve: "165B Barrels", status: "Bitumen Mine" },
        { name: "Carajás Iron Ore Mine", resId: "iron_ore", country: "BRAZIL", lat: -6.06, lng: -50.18, reserve: "7.2B Tons", status: "World Largest Mine" },
        { name: "Escondida Copper Mine", resId: "copper", country: "CHILE", lat: -24.27, lng: -69.07, reserve: "32M Tons", status: "Active Pit" },

        // KAZAKHSTAN & SOUTH AFRICA & NIGERIA
        { name: "Inkai Uranium Operation", resId: "uranium", country: "KAZAKHSTAN", lat: 44.50, lng: 68.20, reserve: "135,000 Tons", status: "ISL Mining" },
        { name: "Bushveld Complex Metals Mine", resId: "rare_earth", country: "SOUTH_AFRICA", lat: -25.20, lng: 27.10, reserve: "World Leader Platinum/REE", status: "Deep Shaft Mine" },
        { name: "Niger Delta Offshore Oil Basin", resId: "crude_oil", country: "NIGERIA", lat: 4.80, lng: 6.20, reserve: "37B Barrels", status: "Offshore Field" },

        // INDONESIA & VIETNAM
        { name: "Grasberg Copper & Gold Mine", resId: "copper", country: "INDONESIA", lat: -4.05, lng: 137.11, reserve: "27M Tons", status: "High Mountain Mine" },
        { name: "Red River Delta Rice Paddy Belt", resId: "rice", country: "VIETNAM", lat: 20.80, lng: 106.00, reserve: "43M Tons/yr", status: "Agriculture" }
    ];

    // -------------------------------------------------------------------------
    // 3. RESOURCE MINISTRY AI ENGINE & MEMORY
    // -------------------------------------------------------------------------
    class AutonomousResourceMinistry {
        constructor() {
            this.state = {
                trustIndex: 85,
                ministerConfidence: 92,
                strategicAutonomyScore: 78, // %
                lastCrises: {
                    foodShortage: null,
                    powerBlackout: null,
                    miningAccident: null,
                    embargoAlert: null
                },
                surveysUnderway: [
                    { id: 101, resId: 'rare_earth', resName: 'Rare Earth Minerals', country: 'BANGLADESH', stage: 2, stageName: "2. Seismic Deep Core Drilling", progress: 65, estimatedDays: 12 },
                    { id: 102, resId: 'uranium', resName: 'Uranium', country: 'USA', stage: 1, stageName: "1. Airborne Radiometric Survey", progress: 30, estimatedDays: 24 }
                ],
                resourceModifiers: {},
                policyVotes: {},
                constructionProjects: [],
                activeContracts: []
            };

            this.ministerProfile = {
                name: "Dr. Aris Thorne",
                title: "Sovereign Minister of Resource Intelligence",
                avatar: "🏛️",
                personality: "Pragmatic, analytical, non-partisan, highly technical"
            };

            this.subsystems = {
                miningAuthority: "Mining & Geological Survey Bureau",
                energyAuthority: "Energy, Power Grid & Nuclear Authority",
                agriAuthority: "Agriculture, Water & Food Security Bureau",
                logisticsAuthority: "National Logistics, Silos & Pipelines",
                reserveBureau: "Strategic Stockpile & Contingency Directorate",
                tradeBureau: "International Tariffs & Raw Material Exchange",
                constructionBureau: "Industrial Mine & Infrastructure Projects",
                crisisCommand: "Resource Shortage & Crisis Control Center"
            };
        }

        getModifier(resId) {
            if (!this.state.resourceModifiers[resId]) {
                this.state.resourceModifiers[resId] = { extraProd: 0, extraStock: 0, extraFacilities: 0 };
            }
            return this.state.resourceModifiers[resId];
        }

        /**
         * Dynamic Calculation of Daily Production
         */
        calculateResourceBalance(countryKey) {
            const cKey = (countryKey || 'USA').toUpperCase();
            const econ = (window.Game && window.Game.state && window.Game.state.economy && window.Game.state.economy[cKey]) || { gdp: 1e12 };
            const pop = (window.Game && window.Game.state && window.Game.state.population && window.Game.state.population[cKey]) || { population_2015: 5e7 };

            const popM = (pop.population_2015 || 5e7) / 1e6;
            const gdpB = (econ.gdp || 1e12) / 1e9;

            // Formulate outputs per resource
            const report = {};
            Object.keys(STRATEGIC_RESOURCES).forEach(resId => {
                const res = STRATEGIC_RESOURCES[resId];
                const mod = this.getModifier(resId);
                
                // Dynamic rule formula
                let baseProd = Math.floor((gdpB * 0.45) + (popM * 0.8) + (resId.length * 15)) + mod.extraProd;
                let baseCons = Math.floor((popM * 1.2) + (gdpB * 0.38));

                if (resId === 'rice' && (cKey === 'BANGLADESH' || cKey === 'CHINA' || cKey === 'INDIA')) {
                    baseProd *= 4.5;
                    baseCons *= 3.8;
                } else if (resId === 'crude_oil' && (cKey === 'SAUDI_ARABIA' || cKey === 'USA' || cKey === 'RUSSIA')) {
                    baseProd *= 6.0;
                } else if (resId === 'rare_earth' && cKey === 'CHINA') {
                    baseProd *= 8.0;
                } else if (resId === 'water' && cKey === 'BANGLADESH') {
                    baseProd *= 5.0;
                }

                baseProd = Math.round(baseProd);
                baseCons = Math.round(baseCons);
                const net = baseProd - baseCons;
                const reserveStock = Math.max(12000, Math.floor(baseProd * 35) + mod.extraStock);
                const reserveDays = Math.max(5, Math.min(365, Math.floor(reserveStock / Math.max(1, baseCons))));

                report[resId] = {
                    ...res,
                    dailyProd: baseProd,
                    dailyCons: baseCons,
                    netBalance: net,
                    warehouseStock: reserveStock,
                    stockDays: reserveDays,
                    activeFacilities: 3 + mod.extraFacilities,
                    status: net >= 0 ? 'Surplus' : 'Deficit Risk'
                };
            });

            return report;
        }

        /**
         * Context-Aware Intelligence Briefing
         */
        generateExecutiveBriefing(countryKey) {
            const report = this.calculateResourceBalance(countryKey);
            const deficits = Object.values(report).filter(r => r.netBalance < 0);
            const countryClean = countryKey.replace(/_/g, ' ');

            let message = "";
            if (deficits.length === 0) {
                message = `Prime Minister, ${countryClean}'s strategic resource matrix is fully autonomous. Production surpluses across hydrocarbons, food stocks, and strategic metals maintain our reserve autonomy at ${this.state.strategicAutonomyScore}%.`;
            } else {
                const worst = deficits[0];
                message = `Prime Minister, our intelligence models indicate an impending daily deficit in **${worst.name}** (${worst.bnName}). Current stock covers ${worst.stockDays} days of national consumption. I strongly recommend initiating a geological survey or signing a trade supply contract immediately.`;
            }

            return {
                minister: this.ministerProfile,
                autonomyScore: this.state.strategicAutonomyScore,
                deficitsCount: deficits.length,
                briefingText: message
            };
        }

        /**
         * Simulated Inter-Ministry Debates
         */
        generateInterMinistryDebate(countryKey) {
            const countryClean = countryKey.replace(/_/g, ' ');
            return [
                {
                    id: 'vote_treasury_grant',
                    speaker: "Dr. Aris Thorne (Resource Minister)",
                    role: "Resource Intelligence",
                    avatar: "🏛️",
                    text: `We must allocate $450M from treasury to expand domestic refinery and grain silo reserves in ${countryClean}. Energy independence is our primary defense shield.`,
                    options: [
                        { label: "✅ APPROVE $450M GRANT", action: "approve_grant" },
                        { label: "❌ REJECT GRANT", action: "reject_grant" }
                    ]
                },
                {
                    id: 'vote_environmental_limits',
                    speaker: "Environment & Forest Minister",
                    role: "Ecological Protection",
                    avatar: "🌿",
                    text: `Quarrying in protected forest reserves threatens watershed stability. Environmental clearance will require strict 100% reforestation compliance.`,
                    options: [
                        { label: "🌲 ENFORCE 100% REFORESTATION", action: "enforce_env" },
                        { label: "⚠️ BYPASS REGULATION", action: "bypass_env" }
                    ]
                },
                {
                    id: 'vote_defense_stockpile',
                    speaker: "Defense Minister",
                    role: "Supreme Command",
                    avatar: "🎖️",
                    text: `We support the Resource Minister. Without localized fuel and uranium stockpiles, our air squadrons and naval fleets cannot sustain operations beyond 30 days.`,
                    options: [
                        { label: "🛡️ MANDATE 60-DAY FUEL RESERVE", action: "mandate_fuel" }
                    ]
                }
            ];
        }

        /**
         * 9-Step Resource Lifecycle Action
         */
        startGeologicalSurvey(resId, countryKey) {
            const res = STRATEGIC_RESOURCES[resId] || { name: resId };
            const mod = this.getModifier(resId);
            mod.extraProd += 180;
            mod.extraFacilities += 1;

            const surveyItem = {
                id: Date.now(),
                resId: resId,
                resName: res.name,
                country: countryKey,
                stage: 1,
                stageName: "1. Satellite & Deep Core Drilling",
                progress: 25,
                estimatedDays: 30
            };
            this.state.surveysUnderway.push(surveyItem);

            // Dynamically add a new deposit marker to map
            const lat = 23.5 + (Math.random() * 2 - 1);
            const lng = 90.0 + (Math.random() * 2 - 1);
            GEOGRAPHIC_DEPOSITS.push({
                name: `${countryKey} New ${res.name} Deposit`,
                resId: resId,
                country: countryKey,
                lat: parseFloat(lat.toFixed(2)),
                lng: parseFloat(lng.toFixed(2)),
                reserve: "New Survey Yield",
                status: "Active Exploration"
            });

            this.dispatchUpdate('survey', resId, `Dispatched Geological Survey Bureau team for ${res.name} (${res.bnName || resId}). New deposit discovered on map!`);
            return surveyItem;
        }

        expandFacility(resId, countryKey) {
            const res = STRATEGIC_RESOURCES[resId] || { name: resId };
            const mod = this.getModifier(resId);
            mod.extraFacilities += 1;
            mod.extraProd += 350;

            this.dispatchUpdate('expand_facility', resId, `Allocated capital expenditure for expansion at ${res.name} (${res.bnName || resId}). Capacity +25% (+350 Units/day).`);
        }

        addStrategicReserve(resId, countryKey) {
            const res = STRATEGIC_RESOURCES[resId] || { name: resId };
            const mod = this.getModifier(resId);
            mod.extraStock += 50000;

            this.dispatchUpdate('reserve', resId, `Expanded Strategic Petroleum & Warehouse Reserve for ${res.name}. Stock +50,000 Units.`);
        }

        castCabinetVote(voteId, optionAction) {
            this.state.policyVotes[voteId] = optionAction;
            this.state.strategicAutonomyScore = Math.min(100, this.state.strategicAutonomyScore + 3);
            this.state.trustIndex = Math.min(100, this.state.trustIndex + 2);

            this.dispatchUpdate('cabinet_vote', voteId, `Cabinet Decree Enforced: Action '${optionAction}' ratified by Sovereign Council. Autonomy Index +3%.`);
        }

        dispatchUpdate(actionType, resId, messageText) {
            if (window.OMEGA_UI_ADAPTER && typeof window.OMEGA_UI_ADAPTER.showAdvisePopup === 'function') {
                window.OMEGA_UI_ADAPTER.showAdvisePopup("RESOURCE MINISTRY DECREE", messageText);
            } else if (window.Game && window.Game.addNotification) {
                window.Game.addNotification(messageText, 'success');
            }

            // Emit Event Bus notification
            window.dispatchEvent(new CustomEvent('RESOURCE_STATE_UPDATED', {
                detail: { action: actionType, resId: resId }
            }));

            // Refresh Map Deposits Layer if active
            if (window.Game && window.Game.Map && typeof window.Game.Map.renderResourceDeposits === 'function') {
                window.Game.Map.renderResourceDeposits();
            }
        }
    }

    const instance = new AutonomousResourceMinistry();

    // -------------------------------------------------------------------------
    // DYNAMIC CONNECTION TO RESOURCES.JSON DATABASE
    // -------------------------------------------------------------------------
    let resourceDatabaseCache = null;
    async function loadResourceDatabase() {
        if (resourceDatabaseCache) return resourceDatabaseCache;
        try {
            const resp = await fetch('resources.json');
            if (resp.ok) {
                resourceDatabaseCache = await resp.json();
                window.resourceDatabase = resourceDatabaseCache;
            }
        } catch (e) {
            console.warn("Could not load resources.json:", e);
        }
        return resourceDatabaseCache;
    }
    loadResourceDatabase();

    // -------------------------------------------------------------------------
    // 4. EXECUTIVE DASHBOARD UI RENDERER (CHAPTER 05 IN COUNTRY IOS)
    // -------------------------------------------------------------------------
    return {
        resources: STRATEGIC_RESOURCES,
        getResourceDatabase: () => resourceDatabaseCache || window.resourceDatabase,
        loadResourceDatabase,
        getCountryResourceProfile(countryKey) {
            if (!countryKey) return null;
            const normKey = countryKey.replace(/_/g, " ").toUpperCase().trim();
            const isoMap = {
                "ALGERIA": "DZA", "EGYPT": "EGY", "LIBYA": "LBY", "MOROCCO": "MAR", "TUNISIA": "TUN", "SUDAN": "SDN",
                "BANGLADESH": "BGD", "INDIA": "IND", "PAKISTAN": "PAK", "SRI LANKA": "LKA", "NEPAL": "NPL", "BHUTAN": "BTN", "AFGHANISTAN": "AFG", "MALDIVES": "MDV"
            };
            const iso3 = isoMap[normKey] || normKey;

            const db = resourceDatabaseCache || window.resourceDatabase;
            if (!db) return null;

            const sources = [
                db.GSRSK_NorthAfrica_CountryProfiles_v14?.countryProfiles,
                db.GSRSK_SouthAsia_CountryProfiles_v14?.countryProfiles,
                db.GSRSK_BRAIN_FRAMEWORK_PHASE_1?.countryProfiles,
                db.GSRSK_MASTER_DATASET_PHASE_1B?.countryProfiles
            ];

            for (let s of sources) {
                if (!s) continue;
                if (s[iso3]) return s[iso3];
                if (s[normKey]) return s[normKey];
                for (let code in s) {
                    if (s[code] && s[code].identity) {
                        const id = s[code].identity;
                        if ((id.countryId || '').toUpperCase() === iso3 ||
                            (id.iso3 || '').toUpperCase() === iso3 ||
                            (id.name || '').toUpperCase() === normKey) {
                            return s[code];
                        }
                    }
                }
            }
            return null;
        },
        get deposits() {
            const combined = [...GEOGRAPHIC_DEPOSITS];
            const existingNames = new Set(GEOGRAPHIC_DEPOSITS.map(d => (d.name || '').toLowerCase()));
            
            const db = resourceDatabaseCache || window.resourceDatabase;
            if (db && Array.isArray(db.deposits)) {
                db.deposits.forEach(dep => {
                    if (dep && dep.name && !existingNames.has(dep.name.toLowerCase())) {
                        combined.push(dep);
                        existingNames.add(dep.name.toLowerCase());
                    }
                });
            }

            const existingCountries = new Set(combined.map(d => (d.country || '').replace(/_/g, " ").toUpperCase()));
            
            if (window.Game && window.Game.locationsRegistry) {
                const reg = window.Game.locationsRegistry;
                const keyMinerals = [
                    { resId: 'natural_gas', nameSuffix: 'Sovereign Gas Basin', reserve: '3.5 TCF', status: 'Active Field' },
                    { resId: 'crude_oil', nameSuffix: 'Petroleum Field', reserve: '1.2B Barrels', status: 'Active Deposit' },
                    { resId: 'uranium', nameSuffix: 'Uranium Ore Deposit', reserve: '85,000 Tons', status: 'Strategic Reserve' },
                    { resId: 'rare_earth', nameSuffix: 'Rare Earth Minerals Deposit', reserve: '2.4M Tons', status: 'Geological Reserve' },
                    { resId: 'gold', nameSuffix: 'Gold Mine Reserve', reserve: '450 Tons', status: 'Active Mine' },
                    { resId: 'lithium', nameSuffix: 'Lithium Brine Field', reserve: '890,000 Tons', status: 'Active Extraction' },
                    { resId: 'iron_ore', nameSuffix: 'Iron Ore Belt', reserve: '1.8B Tons', status: 'Mining Complex' },
                    { resId: 'copper', nameSuffix: 'Copper-Gold Deposit', reserve: '14M Tons', status: 'Open Pit' },
                    { resId: 'coal', nameSuffix: 'Coal Basin', reserve: '8.5B Tons', status: 'Active Mine' },
                    { resId: 'bauxite', nameSuffix: 'Bauxite / Aluminum Reserve', reserve: '650M Tons', status: 'Smelter Hub' }
                ];

                for (let cId in reg) {
                    const countryObj = reg[cId];
                    const cName = (countryObj.name || countryObj.ADMIN || cId).replace(/_/g, " ").toUpperCase();
                    if (!existingCountries.has(cName) && countryObj.lat !== undefined && countryObj.lng !== undefined) {
                        const lat = Number(countryObj.lat);
                        const lng = Number(countryObj.lng);
                        if (isNaN(lat) || isNaN(lng)) continue;
                        
                        let hash = 0;
                        for (let i = 0; i < cName.length; i++) hash = (hash << 5) - hash + cName.charCodeAt(i);
                        hash = Math.abs(hash);

                        const min1 = keyMinerals[hash % keyMinerals.length];
                        const min2 = keyMinerals[(hash + 4) % keyMinerals.length];

                        combined.push({
                            name: `${cName} ${min1.nameSuffix}`,
                            resId: min1.resId,
                            country: cName,
                            lat: lat + 0.15,
                            lng: lng + 0.20,
                            reserve: min1.reserve,
                            status: min1.status
                        });

                        combined.push({
                            name: `${cName} ${min2.nameSuffix}`,
                            resId: min2.resId,
                            country: cName,
                            lat: lat - 0.20,
                            lng: lng - 0.15,
                            reserve: min2.reserve,
                            status: min2.status
                        });
                    }
                }
            }
            return combined;
        },
        engine: instance,

        getSummary() {
            const countryKey = (window.Game && window.Game.currentActiveCountry) || 'USA';
            const briefing = instance.generateExecutiveBriefing(countryKey);
            const report = instance.calculateResourceBalance(countryKey);
            const debates = instance.generateInterMinistryDebate(countryKey);

            const resList = Object.keys(report).map(resId => {
                const item = report[resId];
                const ratio = item.dailyCons > 0 ? Math.min(200, Math.round((item.dailyProd / item.dailyCons) * 100)) : 100;
                return {
                    id: resId,
                    name: item.name,
                    bnName: item.bnName,
                    icon: item.icon,
                    category: item.category,
                    dailyProduction: item.dailyProd,
                    dailyConsumption: item.dailyCons,
                    netBalance: item.netBalance,
                    warehouseStock: item.warehouseStock,
                    stockDays: item.stockDays,
                    purity: 98,
                    activeFacilities: item.activeFacilities,
                    selfSufficiencyRatio: ratio,
                    unit: 'Units/day',
                    processChain: item.inputs.join(' → ') + ' → ' + item.name + ' → ' + item.outputs.join(', ')
                };
            });

            return {
                briefing: briefing.briefingText,
                globalMetrics: {
                    autonomyIndex: briefing.autonomyScore,
                    strategicReservesTotalDays: 120,
                    surveysUnderway: instance.state.surveysUnderway
                },
                resourcesList: resList,
                debates: debates
            };
        },

        executeDirective(action, resId, extraData) {
            const cKey = (window.Game && window.Game.currentActiveCountry) || 'USA';
            if (action === 'survey') {
                instance.startGeologicalSurvey(resId, cKey);
            } else if (action === 'expand_facility') {
                instance.expandFacility(resId, cKey);
            } else if (action === 'add_reserve') {
                instance.addStrategicReserve(resId, cKey);
            } else if (action === 'cabinet_vote') {
                instance.castCabinetVote(resId, extraData);
            } else if (action === 'focus_map') {
                if (window.Game && window.Game.Map) {
                    if (window.CountryIOS) window.CountryIOS.close();
                    if (typeof window.Game.Map.toggleResourceOverlay === 'function') {
                        if (window.Game.dom && window.Game.dom.resFilterBox && window.Game.dom.resFilterBox.style.display !== 'flex') {
                            window.Game.Map.toggleResourceOverlay();
                        }
                    }
                    if (typeof window.Game.Map.applyResourceMapFilter === 'function') {
                        window.Game.Map.applyResourceMapFilter(resId);
                    }
                }
            }
        },

        renderExecutiveDashboard(countryKey) {
            const cKey = countryKey || 'USA';
            const briefing = instance.generateExecutiveBriefing(cKey);
            const report = instance.calculateResourceBalance(cKey);
            const debates = instance.generateInterMinistryDebate(cKey);

            let resCardsHtml = "";
            Object.keys(report).forEach(rId => {
                const item = report[rId];
                const netColor = item.netBalance >= 0 ? '#22c55e' : '#ef4444';
                const netSign = item.netBalance >= 0 ? '+' : '';

                resCardsHtml += `
                    <div class="ios-card" style="padding:12px; border-left: 3px solid ${netColor};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-size:13px; font-weight:bold; color:#f8fafc; display:flex; align-items:center; gap:6px;">
                                <span>${item.icon}</span> <span>${item.name}</span>
                            </span>
                            <span style="font-size:10px; color:#94a3b8; font-family:var(--font-mono);">${item.bnName}</span>
                        </div>
                        <div style="font-size:16px; font-weight:bold; color:${netColor}; font-family:var(--font-mono); margin-bottom:4px;">
                            ${netSign}${item.netBalance.toLocaleString()} Units/day
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:10px; color:#cbd5e1; font-family:var(--font-mono);">
                            <span>Prod: ${item.dailyProd.toLocaleString()}</span>
                            <span>Cons: ${item.dailyCons.toLocaleString()}</span>
                        </div>
                        <div style="margin-top:6px; font-size:10px; color:#38bdf8;">
                            Reserve Stock: ${item.stockDays} Days Supply
                        </div>
                    </div>
                `;
            });

            let debateHtml = debates.map(d => `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; display:flex; gap:12px; align-items:flex-start;">
                    <span style="font-size:24px;">${d.avatar}</span>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="font-size:12px; font-weight:bold; color:#00e5ff;">${d.speaker}</span>
                            <span style="font-size:10px; color:#64748b; font-family:var(--font-mono);">${d.role}</span>
                        </div>
                        <p style="font-size:11px; color:#cbd5e1; margin:0; line-height:1.5;">"${d.text}"</p>
                    </div>
                </div>
            `).join('');

            return `
                <div style="display:flex; flex-direction:column; gap:20px; font-family:var(--font-mono);">
                    <!-- TOP EXECUTIVE ADVISOR HEADER -->
                    <div style="background:linear-gradient(135deg, rgba(8,15,28,0.95), rgba(15,23,42,0.95)); border:1px solid rgba(0,229,255,0.4); border-radius:14px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:28px;">${briefing.minister.avatar}</span>
                                <div>
                                    <div style="font-family:var(--font-title); font-size:14px; color:#ffd700; font-weight:bold;">${briefing.minister.name}</div>
                                    <div style="font-size:10px; color:#38bdf8;">${briefing.minister.title}</div>
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:9px; color:#64748b;">AUTONOMY INDEX</div>
                                <div style="font-size:18px; font-weight:bold; color:#22c55e;">${briefing.autonomyScore}%</div>
                            </div>
                        </div>
                        <p style="font-size:12px; color:#e2e8f0; line-height:1.6; margin:0; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border-left:3px solid #00e5ff;">
                            ${briefing.briefingText}
                        </p>
                    </div>

                    <!-- 17 STRATEGIC RESOURCES MATRIX -->
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="font-family:var(--font-title); color:#00e5ff; font-size:13px; font-weight:bold;">
                                💎 THE 17 STRATEGIC NATIONAL RESOURCES MATRIX
                            </span>
                            <span style="font-size:10px; color:#94a3b8;">100% Offline Rule Engine</span>
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
                            ${resCardsHtml}
                        </div>
                    </div>

                    <!-- INTER-MINISTRY CABINET DEBATES -->
                    <div>
                        <div style="font-family:var(--font-title); color:#ffd700; font-size:13px; font-weight:bold; margin-bottom:10px;">
                            🏛️ INTER-MINISTRY STRATEGIC DEBATES & POLICY CONFLICTS
                        </div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${debateHtml}
                        </div>
                    </div>
                </div>
            `;
        }
    };
})();
