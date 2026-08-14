/**
 * ============================================================================
 * UNIVERSAL RESOURCE ENGINE & AUTONOMOUS RESOURCE MINISTRY AI (v3.0 - GOLD)
 * Subsystem: Sovereign Resource Intelligence System (100% Offline Rule AI)
 * Capabilities: 21 Strategic Resources, Canonical Map Deposit Overlays,
 * Inter-Ministry Collaboration, Memory Engine, and Executive Dashboard.
 * ============================================================================
 */

window.ResourceMinistryEngine = (() => {
    // -------------------------------------------------------------------------
    // 1. THE 21 CANONICAL STRATEGIC RESOURCES REGISTRY
    // -------------------------------------------------------------------------
    const STRATEGIC_RESOURCES = {
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
            strategicImportance: 'Neodymium, Dysprosium, Yttrium essential for permanent magnets, EV motors, wind turbines, and defense technology.'
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
            strategicImportance: 'High-grade battery chemical component required for energy storage systems, EVs, and consumer electronics.'
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
            strategicImportance: 'Primary energy resource and petrochemical feedstock supporting global transportation and chemical synthesis.'
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
            strategicImportance: 'Clean-burning hydrocarbon for electricity generation, industrial heating, and nitrogen fertilizer production.'
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
            strategicImportance: 'Nuclear fuel resource for baseload zero-carbon electrical power generation and naval propulsion.'
        },
        gold: {
            id: 'gold',
            name: 'Gold',
            bnName: 'স্বর্ণ সঞ্চয়',
            icon: '🥇',
            category: 'Precious Metals',
            baseValue: 65000000,
            purityGrades: ['Dore Bar 80%', 'Bullion 99.99%'],
            inputs: ['deep_shafts', 'cyanide_leaching'],
            outputs: ['sovereign_reserves', 'microelectronics'],
            storageRule: 'Central Bank Subterranean Fortress Vault',
            strategicImportance: 'Monetary reserve metal, high-frequency electronics conductor, and aerospace shielding material.'
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
            strategicImportance: 'Essential electrical conductor for power grids, renewable generation, EVs, and telecommunications.'
        },
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
            strategicImportance: 'Fundamental raw material for crude steel production and industrial civil infrastructure.'
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
            strategicImportance: 'Primary ore for aluminum smelting used in aerospace, automotive, transmission cables, and packaging.'
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
            strategicImportance: 'Coking coal for blast furnace steelmaking and thermal coal for utility electricity generation.'
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
            strategicImportance: 'Core global grain staple vital for human caloric nutrition and food security.'
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
            strategicImportance: 'Primary staple food crop feeding over half of the global population across Asia, Africa, and Americas.'
        },
        water: {
            id: 'water',
            name: 'Freshwater / Desalination',
            bnName: 'জলসম্পদ / মিঠা পানি',
            icon: '💧',
            category: 'Natural Essentials',
            baseValue: 1.50, // $ / m3
            purityGrades: ['Raw River/Aquifer Water', 'Potable Municipal Water', 'Ultra-Pure Deionized Water'],
            inputs: ['dams', 'water_treatment_plants', 'aquifers'],
            outputs: ['crop_irrigation', 'nuclear_cooling', 'municipal_drinking'],
            storageRule: 'Reservoirs, Lakes & Underground Aquifer Retention',
            strategicImportance: 'Strategic freshwater reserves, aquifer basins, and industrial desalination networks.'
        },
        electricity: {
            id: 'electricity',
            name: 'Electricity Generation Grid',
            bnName: 'বিদ্যুৎ ও জাতীয় গ্রিড',
            icon: '⚡',
            category: 'Secondary Energy',
            baseValue: 0.12, // $ / kWh
            purityGrades: ['50Hz Synchronous Baseload', 'HVDC Long-Distance Grid'],
            inputs: ['coal', 'natural_gas', 'uranium', 'hydropower'],
            outputs: ['factory_operation', 'urban_power', 'radar_stations'],
            storageRule: 'Pumped Hydro & Utility Battery Storage (Loss over time)',
            strategicImportance: 'National power grid supply capacity spanning thermal, nuclear, hydro, solar, and wind generation.'
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
            strategicImportance: 'Silicon wafer fabrication, microchip packaging, and lithography supply chains powering digital infrastructure.'
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
            strategicImportance: 'Essential cathode material for high-density lithium-ion batteries and heat-resistant superalloys.'
        },
        limestone: {
            id: 'limestone',
            name: 'Limestone & Cement Aggregate',
            bnName: 'চুনাপাথর ও সিমেন্ট',
            icon: '🧱',
            category: 'Construction Materials',
            baseValue: 45,
            purityGrades: ['Industrial Grade', 'High-Calcium Chemical Grade'],
            inputs: ['quarry_excavators'],
            outputs: ['cement', 'quicklime', 'soil_conditioner'],
            storageRule: 'Quarry Stockpiles',
            strategicImportance: 'Calcium carbonate rock for clinker cement production, metallurgy flux, and chemical processing.'
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
            strategicImportance: 'Industrial roundwood, structural lumber, and pulpwood supporting construction and bioenergy.'
        },
        steel: {
            id: 'steel',
            name: 'Finished Steel',
            bnName: 'ইস্পাত শিল্প',
            icon: '🏗️',
            category: 'Manufactured Materials',
            baseValue: 750,
            purityGrades: ['Structural Rebar', 'Hot Rolled Coil', 'Alloy Armor Plate'],
            inputs: ['iron_ore', 'coal', 'electricity'],
            outputs: ['infrastructure', 'shipbuilding', 'defense_armor'],
            storageRule: 'Covered Industrial Stockyard',
            strategicImportance: 'Structural steel products, rebar, sheet metal, and specialized alloy steel.'
        },
        refined_fuel: {
            id: 'refined_fuel',
            name: 'Refined Petroleum Products',
            bnName: 'পরিশোধিত জ্বালানি',
            icon: '⛽',
            category: 'Refined Hydrocarbons',
            baseValue: 125,
            purityGrades: ['Gasoline RON95', 'Ultra-Low Sulfur Diesel', 'Jet A-1 Fuel'],
            inputs: ['crude_oil', 'refineries'],
            outputs: ['transportation', 'aviation_squadrons', 'power_generators'],
            storageRule: 'Sealed Fuel Storage Depots',
            strategicImportance: 'Gasoline, diesel, jet fuel, and liquefied petroleum gas produced from oil refining.'
        },
        military_armor: {
            id: 'military_armor',
            name: 'Strategic Defense Industrial Base',
            bnName: 'প্রতিরক্ষা শিল্প ভিত্তি',
            icon: '🛡️',
            category: 'Defense Production',
            baseValue: 500000,
            purityGrades: ['Armored Combat Vehicles', 'Aviation Munitions', 'Radar Arrays'],
            inputs: ['steel', 'semiconductor', 'titanium', 'rare_earth'],
            outputs: ['national_sovereignty', 'territorial_defense'],
            storageRule: 'Underground Armory Vaults',
            strategicImportance: 'Defense manufacturing capacity for heavy armored platforms, munitions, radar, and aerospace systems.'
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
        { name: "Red River Delta Rice Paddy Belt", resId: "rice", country: "VIETNAM", lat: 20.80, lng: 106.00, reserve: "43M Tons/yr", status: "Agriculture" },

        // CENTRAL & EAST AFRICA (COD, GAB, GNQ, STP, ETH, KEN, TZA, UGA, RWA, BDI)
        { name: "Kolwezi Cobalt & Copper Supermine", resId: "cobalt", country: "DR CONGO", lat: -10.71, lng: 25.47, reserve: "3.5M Tons Cobalt (Global Leader)", status: "Active Mine" },
        { name: "Tenke Fungurume Copper-Cobalt Complex", resId: "copper", country: "DR CONGO", lat: -10.62, lng: 26.18, reserve: "500K Tons/yr Copper", status: "Active Mining" },
        { name: "Kibali Gold Mine Complex", resId: "gold", country: "DR CONGO", lat: 3.13, lng: 29.58, reserve: "10M Oz Gold", status: "Active Mine" },
        { name: "Moanda Manganese & REE Reserve", resId: "rare_earth", country: "GABON", lat: -1.56, lng: 13.20, reserve: "1.2B Tons High-Grade", status: "Active Mine" },
        { name: "Port-Gentil Offshore Petroleum Basin", resId: "crude_oil", country: "GABON", lat: -0.72, lng: 8.78, reserve: "2.5B Barrels", status: "Offshore Rigs" },
        { name: "Alba Offshore Gas & Liquefaction Hub", resId: "natural_gas", country: "EQUATORIAL GUINEA", lat: 3.65, lng: 8.52, reserve: "5.5 TCF Gas", status: "LNG Complex" },
        { name: "Zafiro Deepwater Oil Field", resId: "crude_oil", country: "EQUATORIAL GUINEA", lat: 3.82, lng: 8.40, reserve: "1.2B Barrels", status: "Offshore Platform" },
        { name: "Joint Development Zone Oil Block 1", resId: "crude_oil", country: "SAO TOME AND PRINCIPE", lat: 0.33, lng: 6.73, reserve: "850M Barrels Deepwater", status: "Exploration" },
        { name: "São Tomé Hydro & Maritime Solar Grid", resId: "electricity", country: "SAO TOME AND PRINCIPE", lat: 0.30, lng: 6.60, reserve: "45 MW Grid", status: "Active Hydro/Solar" },
        { name: "Grand Ethiopian Renaissance Hydro Megadam (GERD)", resId: "electricity", country: "ETHIOPIA", lat: 11.21, lng: 35.09, reserve: "5,150 MW Clean Hydro", status: "Mega Power Plant" },
        { name: "Danakil Potash & Lithium Brine Basin", resId: "lithium", country: "ETHIOPIA", lat: 14.24, lng: 40.30, reserve: "1.2B Tons Potash", status: "Active Extraction" },
        { name: "Lega Dembi Orogenic Gold Mine", resId: "gold", country: "ETHIOPIA", lat: 5.68, lng: 38.93, reserve: "80 Tons Gold", status: "Active Mine" },
        { name: "Olkaria Geothermal Clean Energy Complex", resId: "electricity", country: "KENYA", lat: -0.88, lng: 36.31, reserve: "860 MW Geothermal", status: "Geothermal Leader" },
        { name: "Kwale Heavy Mineral Titanium Sands", resId: "rare_earth", country: "KENYA", lat: -4.32, lng: 39.45, reserve: "140M Tons Sands", status: "Active Mine" },
        { name: "South Lokichar Crude Oil Basin", resId: "crude_oil", country: "KENYA", lat: 2.33, lng: 35.60, reserve: "560M Barrels", status: "Development" },
        { name: "Geita Gold Mine Super-Pit", resId: "gold", country: "TANZANIA", lat: -2.87, lng: 32.23, reserve: "12M Oz Gold", status: "Open Pit Mine" },
        { name: "Songo Songo Offshore Natural Gas Hub", resId: "natural_gas", country: "TANZANIA", lat: -8.53, lng: 39.52, reserve: "1.1 TCF Gas", status: "Offshore Field" },
        { name: "Merelani Gemstone & Tanzanite Mine", resId: "limestone", country: "TANZANIA", lat: -3.58, lng: 37.01, reserve: "Exclusive Global Deposit", status: "Active Mine" },
        { name: "Tilenga Albertine Oil Rift Basin", resId: "crude_oil", country: "UGANDA", lat: 2.05, lng: 31.42, reserve: "1.4B Barrels Recoverable", status: "Oilfield Project" },
        { name: "Sukulu REE & Phosphate Carbonatite", resId: "rare_earth", country: "UGANDA", lat: 0.63, lng: 34.16, reserve: "230M Tons Phosphate/REE", status: "Mining Complex" },
        { name: "Karuma Hydroelectric Dam Station", resId: "electricity", country: "UGANDA", lat: 2.23, lng: 32.25, reserve: "600 MW Hydro", status: "Hydroelectric Plant" },
        { name: "KivuWatt Lake Methane Gas Power Project", resId: "natural_gas", country: "RWANDA", lat: -2.06, lng: 29.33, reserve: "60B m3 Methane", status: "Gas Extraction Plant" },
        { name: "Gatumba Coltan & Tantalum Mining Belt", resId: "rare_earth", country: "RWANDA", lat: -1.92, lng: 29.65, reserve: "Major Tantalite Hub", status: "Active Mine" },
        { name: "Gakara High-Grade Rare Earth Mine", resId: "rare_earth", country: "BURUNDI", lat: -3.42, lng: 29.43, reserve: "Highest Grade REE (47%-67%)", status: "Active Mine" },
        { name: "Musongati Nickel-Cobalt-PGM Project", resId: "cobalt", country: "BURUNDI", lat: -3.81, lng: 30.08, reserve: "150M Tons Nickel/Cobalt", status: "Strategic Reserve" }
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
                surveysUnderway: [],
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
         * Dynamic Calculation of Daily Production & Consumption
         */
        calculateResourceBalance(countryKey) {
            const activeC = countryKey || (window.Game && window.Game.currentActiveCountry) || 'BANGLADESH';
            const cKey = activeC.replace(/_/g, " ").toUpperCase().trim();

            let gdpVal = null;
            let popVal = null;

            if (window.Game && window.Game.state) {
                if (window.Game.state.economy && window.Game.state.economy[cKey]) {
                    gdpVal = window.Game.state.economy[cKey].gdp;
                }
                if (window.Game.state.population && window.Game.state.population[cKey]) {
                    popVal = window.Game.state.population[cKey].population_2015;
                }
            }

            if (!gdpVal || !popVal) {
                const reg = (window.Game && window.Game.locationsRegistry) || {};
                const loc = reg[cKey] || {};
                if (loc.gdp) gdpVal = loc.gdp;
                if (loc.population) popVal = loc.population;

                if (!gdpVal || !popVal) {
                    const prof = window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.getCountryResourceProfile === 'function' ? window.ResourceMinistryEngine.getCountryResourceProfile(cKey) : null;
                    if (prof) {
                        const area = prof.geography?.landAreaKm2 || 100000;
                        if (!popVal) popVal = Math.round(area * 150);
                        if (!gdpVal) gdpVal = Math.round(popVal * 4500);
                    }
                }
            }

            const popM = Math.max(0.5, (popVal || 2e7) / 1e6);
            const gdpB = Math.max(1.0, (gdpVal || 5e10) / 1e9);

            // Formulate outputs per resource based on country's JSON profile
            const profile = window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.getCountryResourceProfile === 'function' ? window.ResourceMinistryEngine.getCountryResourceProfile(cKey) : null;
            
            // Build a set of normalized resource terms from country's JSON profile
            const profileResourceTerms = new Set();
            if (profile) {
                const mins = profile.mineral_resource_base || {};
                const hyds = profile.hydrocarbon_resource_base || {};
                const strats = profile.strategic_resources || [];
                const endows = (profile.resource_endowment && profile.resource_endowment.known) || [];
                const energy = profile.energy_resource_base || {};
                const agri = profile.agricultural_resource_base || {};

                const allProfileItems = [
                    ...(mins.metallic || []),
                    ...(mins.nonMetallic || []),
                    ...(mins.industrialMinerals || []),
                    ...(mins.preciousMetals || []),
                    ...(mins.criticalMinerals || []),
                    ...(mins.rareEarths || []),
                    ...(hyds.oil || []),
                    ...(hyds.naturalGas || []),
                    ...(hyds.coal || []),
                    ...(energy.hydro || []),
                    ...(energy.nuclear || []),
                    ...(energy.renewables || []),
                    ...(agri.stapleCrops || []),
                    ...(agri.cashCrops || []),
                    ...(Array.isArray(strats) ? strats : []),
                    ...(Array.isArray(endows) ? endows : [])
                ];

                allProfileItems.forEach(item => {
                    profileResourceTerms.add(String(item).toLowerCase().replace(/_/g, " "));
                });
            }

            const report = {};
            Object.keys(STRATEGIC_RESOURCES).forEach(resId => {
                const res = STRATEGIC_RESOURCES[resId];
                const mod = this.getModifier(resId);
                
                let baseProd = Math.floor((gdpB * 0.45) + (popM * 0.8) + (resId.length * 15)) + mod.extraProd;
                let baseCons = Math.floor((popM * 1.2) + (gdpB * 0.38));

                // Check if profile specifically possesses or emphasizes this resource
                const resNameLower = res.name.toLowerCase();
                let hasInProfile = false;
                profileResourceTerms.forEach(term => {
                    if (term.includes(resId) || resNameLower.includes(term) || term.includes(resNameLower)) {
                        hasInProfile = true;
                    }
                });

                if (hasInProfile) {
                    const richnessMultiplier = (profile?.resource_domain?.majorResourceCount || 10) > 12 ? 3.5 : 2.2;
                    baseProd = Math.round(baseProd * richnessMultiplier);
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

            this.dispatchUpdate('survey', resId, `Dispatched Geological Survey Bureau team for ${res.name} (${res.bnName || resId}). Geological survey initiated!`);
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
            
            const report = this.calculateResourceBalance(countryKey);
            const resData = report[resId];
            const dailyCons = resData ? resData.dailyCons : 1000;
            const dynamicAddition = Math.max(15000, Math.round(dailyCons * 30));
            
            mod.extraStock += dynamicAddition;

            this.dispatchUpdate('reserve', resId, `Expanded Strategic Reserve for ${res.name}. Dynamic Stock +${dynamicAddition.toLocaleString()} Units (~${Math.round(dynamicAddition / Math.max(1, dailyCons))} days supply).`);
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
    // DYNAMIC CONNECTION & CANONICAL DEDUPLICATION FOR RESOURCES.JSON
    // -------------------------------------------------------------------------
    let resourceDatabaseCache = null;
    let canonicalCountryProfilesMap = null;

    function buildCanonicalCountryProfiles(database) {
        if (!database) return {};
        if (canonicalCountryProfilesMap) return canonicalCountryProfilesMap;

        const profileMap = {};
        
        // Prioritize master consolidated profile dataset
        if (database.GSRSK_Master_CountryProfiles_v14 && database.GSRSK_Master_CountryProfiles_v14.countryProfiles) {
            const master = database.GSRSK_Master_CountryProfiles_v14.countryProfiles;
            for (let code in master) {
                const prof = master[code];
                if (!prof) continue;
                const iso3 = ((prof.identity && (prof.identity.iso3 || prof.identity.countryId)) || code).toUpperCase().trim();
                profileMap[iso3] = prof;
            }
        }

        // Also check any other dynamic dataset objects for backwards compatibility
        for (let dsKey in database) {
            const ds = database[dsKey];
            if (ds && ds.countryProfiles) {
                for (let code in ds.countryProfiles) {
                    const prof = ds.countryProfiles[code];
                    if (!prof) continue;
                    const iso3 = ((prof.identity && (prof.identity.iso3 || prof.identity.countryId)) || code).toUpperCase().trim();
                    if (!profileMap[iso3]) {
                        profileMap[iso3] = prof;
                    }
                }
            }
        }

        canonicalCountryProfilesMap = profileMap;
        return canonicalCountryProfilesMap;
    }

    async function loadResourceDatabase() {
        if (resourceDatabaseCache) return resourceDatabaseCache;
        try {
            const resp = await fetch('resources.json');
            if (resp.ok) {
                resourceDatabaseCache = await resp.json();
            }
        } catch (e) {
            console.warn("Could not load resources.json:", e);
        }

        // Seamlessly merge resources_2.json if present
        try {
            const resp2 = await fetch('resources_2.json');
            if (resp2.ok) {
                const db2 = await resp2.json();
                if (!resourceDatabaseCache) {
                    resourceDatabaseCache = db2;
                } else {
                    // Deep merge country profiles
                    if (db2.GSRSK_Master_CountryProfiles_v14 && db2.GSRSK_Master_CountryProfiles_v14.countryProfiles) {
                        if (!resourceDatabaseCache.GSRSK_Master_CountryProfiles_v14) {
                            resourceDatabaseCache.GSRSK_Master_CountryProfiles_v14 = { countryProfiles: {} };
                        }
                        Object.assign(resourceDatabaseCache.GSRSK_Master_CountryProfiles_v14.countryProfiles, db2.GSRSK_Master_CountryProfiles_v14.countryProfiles);
                    }
                    // Merge deposits
                    if (Array.isArray(db2.deposits)) {
                        resourceDatabaseCache.deposits = (resourceDatabaseCache.deposits || []).concat(db2.deposits);
                    }
                    // Merge resource types
                    if (db2.resource_types) {
                        resourceDatabaseCache.resource_types = Object.assign(resourceDatabaseCache.resource_types || {}, db2.resource_types);
                    }
                    // Merge srie_database
                    if (db2.srie_database && db2.srie_database.countries) {
                        if (!resourceDatabaseCache.srie_database) {
                            resourceDatabaseCache.srie_database = { countries: {} };
                        }
                        Object.assign(resourceDatabaseCache.srie_database.countries, db2.srie_database.countries);
                    }
                }
            }
        } catch (e) {
            // Optional secondary file not found or failed, standard operation continues
        }

        if (resourceDatabaseCache) {
            window.resourceDatabase = resourceDatabaseCache;
            buildCanonicalCountryProfiles(resourceDatabaseCache);
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
                "BANGLADESH": "BGD", "INDIA": "IND", "PAKISTAN": "PAK", "SRI LANKA": "LKA", "NEPAL": "NPL", "BHUTAN": "BTN", "AFGHANISTAN": "AFG", "MALDIVES": "MDV",
                "MAURITANIA": "MRT", "SENEGAL": "SEN", "THE GAMBIA": "GMB", "GAMBIA": "GMB", "GUINEA-BISSAU": "GNB", "GUINEA BISSAU": "GNB", "GUINEA": "GIN",
                "SIERRA LEONE": "SLE", "LIBERIA": "LBR", "COTE D'IVOIRE": "CIV", "CÔTE D'IVOIRE": "CIV", "IVORY COAST": "CIV", "GHANA": "GHA", "TOGO": "TGO",
                "BENIN": "BEN", "BURKINA FASO": "BFA", "MALI": "MLI", "NIGER": "NER", "NIGERIA": "NGA", "CABO VERDE": "CPV", "CAPE VERDE": "CPV", "CAMEROON": "CMR", "CENTRAL AFRICAN REPUBLIC": "CAF", "CHAD": "TCD", "CONGO": "COG", "REPUBLIC OF THE CONGO": "COG",
                "DEMOCRATIC REPUBLIC OF THE CONGO": "COD", "DR CONGO": "COD", "CONGO (KINSHASA)": "COD", "GABON": "GAB", "EQUATORIAL GUINEA": "GNQ", "SAO TOME AND PRINCIPE": "STP", "SÃO TOMÉ AND PRÍNCIPE": "STP", "ETHIOPIA": "ETH", "KENYA": "KEN", "TANZANIA": "TZA", "UNITED REPUBLIC OF TANZANIA": "TZA", "UGANDA": "UGA", "RWANDA": "RWA", "BURUNDI": "BDI",
                "SOUTH SUDAN": "SSD", "SOMALIA": "SOM", "DJIBOUTI": "DJI", "ERITREA": "ERI", "MALAWI": "MWI", "SEYCHELLES": "SYC", "COMOROS": "COM", "WESTERN SAHARA": "ESH", "YEMEN": "YEM", "OMAN": "OMN"
            };
            const iso3 = isoMap[normKey] || normKey;

            const db = resourceDatabaseCache || window.resourceDatabase;
            if (!db) return null;

            const canonicalMap = buildCanonicalCountryProfiles(db);
            if (canonicalMap[iso3]) return canonicalMap[iso3];

            for (let code in canonicalMap) {
                const p = canonicalMap[code];
                if (p && p.identity) {
                    const id = p.identity;
                    if ((id.countryId || '').toUpperCase() === iso3 ||
                        (id.iso3 || '').toUpperCase() === iso3 ||
                        (id.name || '').toUpperCase() === normKey) {
                        return p;
                    }
                }
            }

            // Strictly return null if country profile is missing from resources.json
            return null;
        },
        get deposits() {
            const combined = [];
            const existingNames = new Set();
            
            const db = resourceDatabaseCache || window.resourceDatabase;
            if (db && Array.isArray(db.deposits)) {
                db.deposits.forEach(dep => {
                    if (dep && dep.name && !existingNames.has(dep.name.toLowerCase())) {
                        combined.push(dep);
                        existingNames.add(dep.name.toLowerCase());
                    }
                });
            }

            // Fallback to static catalog if database deposits are not yet loaded
            if (combined.length === 0) {
                GEOGRAPHIC_DEPOSITS.forEach(dep => {
                    if (dep && dep.name && !existingNames.has(dep.name.toLowerCase())) {
                        combined.push(dep);
                        existingNames.add(dep.name.toLowerCase());
                    }
                });
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
        },

        focusDepositOnMap(lat, lng, name, resId) {
            const modal = document.getElementById('resource-ministry-modal');
            if (modal) modal.style.display = 'none';

            if (window.Game && window.Game.Map) {
                if (typeof window.Game.Map.toggleResourceOverlay === 'function') {
                    const box = document.getElementById('resource-filter-box');
                    if (!box || box.classList.contains('hidden') || box.style.display === 'none') {
                        window.Game.Map.toggleResourceOverlay();
                    }
                }
                if (typeof window.Game.Map.applyResourceMapFilter === 'function') {
                    window.Game.Map.applyResourceMapFilter('ALL');
                }
            }

            const mapInst = window.map || (window.Game && window.Game.Map && window.Game.Map.map);
            if (mapInst && typeof mapInst.flyTo === 'function') {
                mapInst.flyTo([lat, lng], 6, { animate: true, duration: 1.5 });
            }

            if (window.OMEGA_UI_ADAPTER && typeof window.OMEGA_UI_ADAPTER.showAdvisePopup === 'function') {
                window.OMEGA_UI_ADAPTER.showAdvisePopup("RESOURCE LOCATION LOCKED", `Satellite lock engaged on ${name} (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`);
            }
        },

        openModal(countryKey) {
            const cKey = countryKey || (window.Game && window.Game.currentActiveCountry) || 'USA';
            let modal = document.getElementById('resource-ministry-modal');

            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'resource-ministry-modal';
                modal.className = 'omega-modal';
                modal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:95%; max-width:1200px; height:88vh; z-index:10000; background:rgba(2,11,20,0.98); border:1.5px solid #00e5ff; border-radius:14px; box-shadow:0 0 45px rgba(0,229,255,0.35); overflow:hidden; display:flex; flex-direction:column; font-family:var(--font-mono); color:#f8fafc; backdrop-filter:blur(20px);';
                document.body.appendChild(modal);
            }

            const db = resourceDatabaseCache || window.resourceDatabase || {};

            modal.innerHTML = `
                <!-- HEADER -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:rgba(0,18,28,0.95); border-bottom:1px solid rgba(0,229,255,0.3);">
                    <div>
                        <div style="font-family:var(--font-title); font-size:16px; font-weight:bold; color:#00e5ff; display:flex; align-items:center; gap:8px;">
                            <span>🏛️</span>
                            <span>GLOBAL STRATEGIC RESOURCE MINISTRY & GSRSK INTELLIGENCE HUB</span>
                        </div>
                        <div style="font-size:10px; color:#94a3b8; margin-top:2px;">
                            Active Nation: <strong style="color:#ffd700;">${cKey}</strong> • Data Connection: <span style="color:#22c55e;">100% ONLINE (62 DEPOSITS & CANONICAL MASTER DATASET)</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button onclick="window.ResourceMinistryEngine.focusDepositOnMap(23.81, 90.41, 'GLOBAL MAP OVERLAY', 'ALL')" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; border-radius:6px; padding:6px 14px; font-weight:bold; cursor:pointer; font-size:11px; display:flex; align-items:center; gap:5px;">
                            <span>🗺️</span><span>SHOW ALL ON MAP</span>
                        </button>
                        <button onclick="document.getElementById('resource-ministry-modal').style.display='none'" style="background:rgba(255,68,68,0.25); border:1px solid #ef4444; color:#fff; border-radius:6px; padding:6px 14px; font-weight:bold; cursor:pointer; font-size:11px;">
                            ✕ CLOSE
                        </button>
                    </div>
                </div>

                <!-- NAVIGATION TABS -->
                <div style="display:flex; gap:4px; padding:8px 16px; background:rgba(1,15,28,0.9); border-bottom:1px solid rgba(255,255,255,0.08); overflow-x:auto;" id="rm-modal-tabs">
                    <button class="rm-tab-btn active" onclick="window.ResourceMinistryEngine.switchTab('matrix')" style="padding:6px 14px; background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; font-family:var(--font-mono);">
                        💎 17 RESOURCES MATRIX
                    </button>
                    <button class="rm-tab-btn" onclick="window.ResourceMinistryEngine.switchTab('deposits')" style="padding:6px 14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; font-family:var(--font-mono);">
                        🗺️ 62 DEPOSITS MAP BROWSER
                    </button>
                    <button class="rm-tab-btn" onclick="window.ResourceMinistryEngine.switchTab('markets')" style="padding:6px 14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; font-family:var(--font-mono);">
                        📈 GLOBAL MARKETS
                    </button>
                    <button class="rm-tab-btn" onclick="window.ResourceMinistryEngine.switchTab('profiles')" style="padding:6px 14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; font-family:var(--font-mono);">
                        📜 25-SECTION COUNTRY PROFILES
                    </button>
                    <button class="rm-tab-btn" onclick="window.ResourceMinistryEngine.switchTab('infra')" style="padding:6px 14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#94a3b8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; font-family:var(--font-mono);">
                        🏭 INFRASTRUCTURE & REFINERIES
                    </button>
                </div>

                <!-- MAIN VIEWPORT -->
                <div style="flex:1; overflow-y:auto; padding:16px;" id="rm-modal-body">
                    <!-- Default tab content -->
                </div>
            `;

            modal.style.display = 'flex';
            this.switchTab('matrix', cKey);
        },

        switchTab(tabId, countryKey) {
            const cKey = countryKey || (window.Game && window.Game.currentActiveCountry) || 'USA';
            const body = document.getElementById('rm-modal-body');
            if (!body) return;

            // Update tab button styles
            const tabs = document.querySelectorAll('.rm-tab-btn');
            tabs.forEach(t => {
                t.style.background = 'rgba(255,255,255,0.05)';
                t.style.borderColor = 'rgba(255,255,255,0.1)';
                t.style.color = '#94a3b8';
            });

            if (event && event.target) {
                event.target.style.background = 'rgba(0,229,255,0.2)';
                event.target.style.borderColor = '#00e5ff';
                event.target.style.color = '#00e5ff';
            }

            const db = resourceDatabaseCache || window.resourceDatabase || {};

            if (tabId === 'matrix') {
                body.innerHTML = this.renderExecutiveDashboard(cKey);
            } else if (tabId === 'deposits') {
                const allDeps = this.deposits || [];
                body.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); padding:10px; border-radius:8px; border:1px solid rgba(0,229,255,0.2);">
                            <div style="font-size:12px; font-weight:bold; color:#00e5ff;">
                                🌐 ALL ${allDeps.length} GLOBAL MINERAL & HYDROCARBON DEPOSITS
                            </div>
                            <input type="text" id="rm-dep-search" placeholder="Search by country, resource, or deposit name..." onkeyup="window.ResourceMinistryEngine.filterDepositCards(this.value)" style="background:rgba(15,23,42,0.9); border:1px solid rgba(0,229,255,0.4); color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; width:300px;" />
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px;" id="rm-deposits-grid">
                            ${allDeps.map((d, idx) => `
                                <div class="dep-card-item" data-search="${(d.name + ' ' + d.country + ' ' + d.resId + ' ' + d.status).toLowerCase()}" style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px; display:flex; flex-direction:column; justify-content:space-between;">
                                    <div>
                                        <div style="font-size:12px; font-weight:bold; color:#ffd700; margin-bottom:4px; display:flex; justify-content:space-between;">
                                            <span>${d.name}</span>
                                            <span style="font-size:10px; color:#22c55e;">${d.country}</span>
                                        </div>
                                        <div style="font-size:10px; color:#cbd5e1; line-height:1.4; margin-bottom:8px;">
                                            <div>Type: <strong style="color:#00e5ff;">${(d.resId || 'Mineral').toUpperCase()}</strong></div>
                                            <div>Reserve: <strong>${d.reserve || 'Unquantified'}</strong></div>
                                            <div>Status: <span style="color:#a855f7;">${d.status || 'Active'}</span></div>
                                            <div>Coords: ${Number(d.lat).toFixed(2)}°, ${Number(d.lng).toFixed(2)}°</div>
                                        </div>
                                    </div>
                                    <button onclick="window.ResourceMinistryEngine.focusDepositOnMap(${d.lat}, ${d.lng}, '${d.name.replace(/'/g, "")}', '${d.resId}')" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; font-size:10px; font-weight:bold; padding:5px; border-radius:4px; cursor:pointer; text-align:center;">
                                        📍 FOCUS ON MAP
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else if (tabId === 'markets') {
                const bMarkets = db.GSRSK_BRAIN_FRAMEWORK_PHASE_1?.marketProfiles || db.GSRSK_MASTER_DATASET_PHASE_1B?.marketProfiles || {};
                const keys = Object.keys(bMarkets);
                body.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div style="font-size:13px; font-weight:bold; color:#ffd700;">
                            📈 CANONICAL COMMODITY MARKET PROFILES & INTERNATIONAL BENCHMARKS (${keys.length})
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                            ${keys.map(k => {
                                const m = bMarkets[k];
                                return `
                                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.2); border-radius:8px; padding:12px;">
                                        <div style="font-size:12px; font-weight:bold; color:#00e5ff; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:8px;">
                                            ${(m.commodityId || k).replace(/_/g, ' ').toUpperCase()}
                                        </div>
                                        <div style="font-size:11px; color:#cbd5e1; line-height:1.5;">
                                            <div>Benchmark Price: <strong style="color:#22c55e;">$${m.benchmarkPriceUSD?.toLocaleString()} / ${m.pricingUnit || 'unit'}</strong></div>
                                            <div>Exchange Hub: <strong style="color:#ffd700;">${m.exchangeHub || 'LME'}</strong></div>
                                            <div>Volatility Index: ${m.priceVolatilityIndex || 0.3}</div>
                                            <div>Global Stockpile Baseline: ${m.globalStockpileBaseline ? m.globalStockpileBaseline.toLocaleString() : 'N/A'}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            } else if (tabId === 'profiles') {
                let availableCountries = [
                    "BANGLADESH", "INDIA", "PAKISTAN", "SRI LANKA", "NEPAL", "BHUTAN", "AFGHANISTAN", "MALDIVES",
                    "ALGERIA", "EGYPT", "LIBYA", "MOROCCO", "TUNISIA", "SUDAN",
                    "MAURITANIA", "SENEGAL", "THE GAMBIA", "GUINEA-BISSAU", "GUINEA", "SIERRA LEONE", "LIBERIA", "COTE D'IVOIRE", "GHANA", "TOGO",
                    "BENIN", "BURKINA FASO", "MALI", "NIGER", "NIGERIA", "CABO VERDE", "CAMEROON", "CENTRAL AFRICAN REPUBLIC", "CHAD", "CONGO",
                    "DEMOCRATIC REPUBLIC OF THE CONGO", "GABON", "EQUATORIAL GUINEA", "SAO TOME AND PRINCIPE", "ETHIOPIA", "KENYA", "TANZANIA", "UGANDA", "RWANDA", "BURUNDI",
                    "ANGOLA", "BOTSWANA", "ESWATINI", "LESOTHO", "MALAWI", "MOZAMBIQUE", "NAMIBIA", "SOUTH AFRICA", "ZAMBIA", "ZIMBABWE",
                    "USA", "CHINA", "RUSSIA"
                ];
                if (window.Game && window.Game.locationsRegistry) {
                    const regKeys = Object.keys(window.Game.locationsRegistry).map(k => k.replace(/_/g, " ").toUpperCase());
                    availableCountries = Array.from(new Set([...availableCountries, ...regKeys])).sort();
                }
                body.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); padding:10px; border-radius:8px; border:1px solid rgba(255,215,0,0.3);">
                            <div style="font-size:12px; font-weight:bold; color:#ffd700;">
                                📜 CANONICAL 25-SECTION GSRSK COUNTRY RESOURCE AUDIT
                            </div>
                            <select id="rm-profile-select" onchange="window.ResourceMinistryEngine.renderProfileTab(this.value)" style="background:rgba(15,23,42,0.9); border:1px solid #ffd700; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px;">
                                ${availableCountries.map(c => `<option value="${c}" ${c === cKey ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div id="rm-profile-content">
                            ${this.renderProfileContent(cKey)}
                        </div>
                    </div>
                `;
            } else if (tabId === 'infra') {
                const master = db.GSRSK_Master_Resource_Data_v14 || {};
                const plants = master.processing_plants?.refining_chains || {};
                const keys = Object.keys(plants);
                body.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div style="font-size:13px; font-weight:bold; color:#00e5ff;">
                            🏭 INDUSTRIAL REFINING CHAINS & PROCESSING COMPLEXES
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                            ${keys.map(k => {
                                const p = plants[k];
                                return `
                                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(34,197,94,0.3); border-radius:8px; padding:12px;">
                                        <div style="font-size:12px; font-weight:bold; color:#22c55e; margin-bottom:6px;">
                                            ${k.replace(/_/g, ' ').toUpperCase()} REFINING CHAIN
                                        </div>
                                        <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">
                                            <div>Stages: ${(p.stages || []).join(' → ')}</div>
                                            <div>Technology: ${p.technologyLevel || 'Industrial High'}</div>
                                            <div>CapEx Baseline: $${(p.capexMillionsUSD || 500)} Million</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        },

        filterDepositCards(query) {
            const q = (query || '').toLowerCase();
            const cards = document.querySelectorAll('#rm-deposits-grid .dep-card-item');
            cards.forEach(c => {
                const text = c.getAttribute('data-search') || '';
                if (!q || text.includes(q)) {
                    c.style.display = 'flex';
                } else {
                    c.style.display = 'none';
                }
            });
        },

        renderProfileTab(countryKey) {
            const container = document.getElementById('rm-profile-content');
            if (container) {
                container.innerHTML = this.renderProfileContent(countryKey);
            }
        },

        renderProfileContent(countryKey) {
            const prof = this.getCountryResourceProfile(countryKey);
            if (!prof) {
                return `<div style="padding:20px; color:#ef4444;">Canonical 25-section audit data pending or unavailable for ${countryKey}.</div>`;
            }
            const id = prof.identity || {};
            const geo = prof.geography || {};
            const dom = prof.resource_domain || {};
            const geol = prof.geological_context || {};
            const min = prof.mineral_resource_base || {};
            const hc = prof.hydrocarbon_resource_base || {};
            const eng = prof.energy_resource_base || {};
            const infra = prof.resource_infrastructure_context || {};
            const regHubs = prof.administrative_resource_regions || [];
            const gov = prof.governance_policy_regulatory || {};
            const econ = prof.economic_fiscal_trade || {};

            return `
                <div style="background:rgba(15,23,42,0.9); border:1px solid #ffd700; border-radius:10px; padding:16px;">
                    <div style="font-size:16px; font-weight:bold; color:#ffd700; border-bottom:1px solid rgba(255,215,0,0.3); padding-bottom:8px; margin-bottom:12px;">
                        🏛️ ${id.officialName || id.name || countryKey} (25-SECTION AUDIT COMPLETE)
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:6px;">
                            <div style="color:#00e5ff; font-weight:bold; margin-bottom:4px;">1. GEOGRAPHY & LAND</div>
                            <div>Capital: ${geo.capital || 'N/A'}</div>
                            <div>Land Area: ${geo.landAreaKm2 ? geo.landAreaKm2.toLocaleString() + ' km²' : 'N/A'}</div>
                            <div>EEZ Area: ${geo.eezKm2 ? geo.eezKm2.toLocaleString() + ' km²' : 'N/A'}</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:6px;">
                            <div style="color:#22c55e; font-weight:bold; margin-bottom:4px;">2. RESOURCE RICHNESS</div>
                            <div>Class: ${dom.resourceRichnessClass || 'High'}</div>
                            <div>Diversity: ${dom.resourceDiversityClass || 'Extensive'}</div>
                            <div>Major Resources: ${dom.majorResourceCount || 0}</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:6px;">
                            <div style="color:#a855f7; font-weight:bold; margin-bottom:4px;">3. GEOLOGY & BASINS</div>
                            <div>Domains: ${(geol.majorGeologicalDomains || []).join(', ')}</div>
                            <div>Basins: ${(geol.sedimentaryBasins || []).join(', ')}</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:6px;">
                            <div style="color:#f97316; font-weight:bold; margin-bottom:4px;">4. MINERAL & HYDROCARBON</div>
                            <div>Metallic: ${(min.metallic || []).join(', ')}</div>
                            <div>Oil/Gas: ${(hc.oil || []).concat(hc.naturalGas || []).join(', ')}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    };
})();
