/* ============================================================================
   MAP ENGINE 2: CONFIGURATION, SIMULATOR & DATA PIPELINE (Part 1)
   ============================================================================ */

// সিমুলেশনের গ্লোবাল কনফিগারেশন রুলস
Game.config = {
    "resources": {
        "food": { "base": 10, "elasticity": 0.12 },
        "oil": { "base": 25, "elasticity": 0.18 },
        "metal": { "base": 18, "elasticity": 0.14 }
    },
    "ai": {
        "aggressive": { "war": 0.8, "trade": 0.3, "loan": 0.4 },
        "greedy": { "war": 0.3, "trade": 0.9, "loan": 0.7 },
        "survival": { "war": 0.2, "trade": 0.5, "loan": 0.2 }
    },
    "bank": {
        "interest": 0.06,
        "default_limit": 0.4,
        "imf_multiplier": 1.5
    },
    "war": {
        "production_drop": 0.35,
        "trade_drop": 0.6
    },
    "tech": {
        "industrial": { "production": 1.3 },
        "financial": { "inflation": 0.8 },
        "military": { "war_power": 1.4 }
    },
    "world": {
        "inflation_base": 0.02,
        "turns": 12
    }
};

// গেম ওয়ার্ল্ডের সামগ্রিক সিমুলেশন স্টেট
Game.worldState = {
    inflation: 1.0,
    bank_liquidity: 1000,
    turn: 1
};

// ম্যাপের প্রতিটি দেশের রঙ পরিবর্তন করার জন্য স্যাটেলাইট এবং ভৌগোলিক টেরেইন কালার প্যালেট
window.getCountryColor = function(name) {
    if (!name) return "#3e592e";
    const norm = name.toLowerCase().trim();

    // বাস্তব পৃথিবীর জলবায়ু ও ভূপ্রকৃতি (Biomes) অনুযায়ী নিখুঁত স্যাটেলাইট টেরেইন কালার ম্যাপিং
    const biomeMap = {
        // Arctic Snow / Ice Sheet
        "greenland": "#dce7ee",
        "antarctica": "#e2e8f0",
        "spitsbergen": "#cbd5e1",

        // Boreal Coniferous Taiga Forest
        "russia": "#3e592e",
        "canada": "#486938",
        "sweden": "#3d572d",
        "norway": "#354e28",
        "finland": "#38522b",
        "iceland": "#6b7d8a",
        "mongolia": "#82754d",

        // Sahara & Middle East Desert Sandstone
        "saudi arabia": "#c4a36b",
        "egypt": "#c2a068",
        "algeria": "#bd9a62",
        "libya": "#c4a268",
        "western sahara": "#ba9860",
        "mauritania": "#b5945c",
        "mali": "#ac8b56",
        "niger": "#aa8954",
        "chad": "#a88752",
        "sudan": "#b3925d",
        "eritrea": "#a68550",
        "somalia": "#9e7f4c",
        "iraq": "#b3945e",
        "iran": "#a88a56",
        "pakistan": "#9c8152",
        "afghanistan": "#a18554",
        "australia": "#b38354",
        "kazakhstan": "#918155",
        "turkmenistan": "#a69360",
        "uzbekistan": "#a18f5d",
        "yemen": "#b89a66",
        "oman": "#ba9c68",

        // Sahel & Savannah Transition Zone
        "south sudan": "#827a48",
        "ethiopia": "#787644",
        "djibouti": "#a38350",
        "senegal": "#7a7d48",
        "the gambia": "#6e7844",
        "gambia": "#6e7844",
        "burkina faso": "#7f7a46",
        "nigeria": "#586938",
        "benin": "#546838",
        "togo": "#526738",
        "ghana": "#4a6334",
        "cote d'ivoire": "#466132",
        "ivory coast": "#466132",
        "liberia": "#3d5a2d",
        "sierra leone": "#3a572a",
        "guinea": "#425e2e",
        "guinea-bissau": "#456030",

        // Equatorial Tropical Jungle & Congo Basin
        "democratic republic of the congo": "#2e4d23",
        "congo": "#315025",
        "central african republic": "#4d6333",
        "cameroon": "#3f5c2d",
        "gabon": "#2d4b21",
        "equatorial guinea": "#2c4a20",
        "uganda": "#3a5929",
        "kenya": "#636d3c",
        "rwanda": "#3d5a2a",
        "burundi": "#3e5b2b",
        "tanzania": "#506233",
        "angola": "#596637",
        "zambia": "#4d6132",
        "malawi": "#485e30",
        "mozambique": "#546636",
        "zimbabwe": "#5d6b38",
        "namibia": "#968152",
        "botswana": "#88784b",
        "south africa": "#6b6e3f",
        "lesotho": "#5c643b",
        "eswatini": "#4d6032",
        "swaziland": "#4d6032",
        "madagascar": "#4c6631",
        "brazil": "#2e5225",
        "indonesia": "#294a20",
        "colombia": "#325427",
        "venezuela": "#38592c",
        "peru": "#615746",
        "malaysia": "#26471e",
        "philippines": "#2b4d22",
        "papua new guinea": "#2a4a20",
        "bangladesh": "#2e5225",
        "india": "#576b37",
        "vietnam": "#315226",

        // Temperate Woodland & Agriculture
        "united states": "#5e7a3d",
        "united states of america": "#5e7a3d",
        "usa": "#5e7a3d",
        "china": "#596e38",
        "france": "#526e38",
        "germany": "#4f6b35",
        "united kingdom": "#54703b",
        "uk": "#54703b",
        "poland": "#526d37",
        "ukraine": "#617a3f",
        "italy": "#63733c",
        "spain": "#877848",
        "turkey": "#7a7543",
        "japan": "#3a572a",
        "argentina": "#5c6d44",
        "mexico": "#857348",

        // Alpine Mountain Slate & Andes
        "chile": "#5c5548",
        "switzerland": "#50575e",
        "austria": "#4b535a",
        "nepal": "#615d54",
        "bolivia": "#736856"
    };

    if (biomeMap[norm]) return biomeMap[norm];

    let hash = 0;
    for (let i = 0; i < norm.length; i++) {
        hash = norm.charCodeAt(i) + ((hash << 5) - hash);
    }
    const satellitePalette = [
        "#486938", "#5e7a3d", "#857348", "#2e5225", "#c2a06b", 
        "#54703b", "#3e592e", "#736856", "#576b37", "#3d572d"
    ];
    return satellitePalette[Math.abs(hash) % satellitePalette.length];
};

// আমেরিকার নাম (USA) শো করার জন্য ফ্রেন্ডলি নেম ফাংশন ওভাররাইড
Game.getGameFriendlyName = function(name) {
    if (!name) return "";
    const mapping = {
        "democratic republic of the congo": "DR Congo",
        "united states of america": "USA",
        "united states": "USA",
        "united kingdom": "UK",
        "united arab emirates": "UAE"
    };
    return mapping[name.toLowerCase().trim()] || name;
};

// রিয়েল-টাইম এআই সিমুলেশন ইঞ্জিন
Game.Simulation = {
    tick() {
        // ১. ওয়ার্ল্ড ইনফ্লেশন এবং টার্ন আপডেট
        Game.worldState.inflation *= (1 + Game.config.world.inflation_base * (0.8 + Math.random() * 0.4));
        Game.worldState.turn += 1;
        
        // ২. ব্যাংকিং লোন ইন্টারেস্ট বৃদ্ধি (ক্রমান্বয়ে ও ধীরে ধীরে বাড়বে)
        Object.keys(Game.state.economy).forEach(key => {
            const econ = Game.state.economy[key];
            if (econ.debt > 0) {
                econ.debt *= (1 + Game.config.bank.interest * 0.1); 
            }
        });
        
        // ৩. ডাইনামিক এআই আচরণ মেকানিক্স (কূটনৈতিক সম্পর্ক বৈরী গেলেই কেবল যুদ্ধ ওঠে)
        const countries = Object.keys(Game.state.economy);
        const activeCountryKey = countries[Math.floor(Math.random() * countries.length)];
        const n = Game.state.economy[activeCountryKey];
        
        if (n) {
            const roll = Math.random();
            const profile = Game.config.ai[n.ai || "survival"];
            
            // যুদ্ধের সম্ভাবনা বহুগুণ কমিয়ে রিয়ালিস্টিক করা হলো
            if (roll < (profile.war * 0.02)) { 
                // শত্রুভাবাপন্ন দেশ খোঁজার লজিক
                const relationList = Game.state.relations[activeCountryKey];
                let hostileTargets = [];
                
                if (relationList) {
                    Object.keys(relationList).forEach(targetKey => {
                        if (relationList[targetKey] && relationList[targetKey].overall < -50) {
                            hostileTargets.push(targetKey);
                        }
                    });
                }
                
                // কেবল শত্রুভাবাপন্ন দেশ থাকলেই যুদ্ধ হবে, অন্যথায় দেশ শান্তিতে বাণিজ্য করবে
                if (hostileTargets.length > 0) {
                    const targetKey = hostileTargets[Math.floor(Math.random() * hostileTargets.length)];
                    const target = Game.state.economy[targetKey];
                    
                    if (target) {
                        n.production *= (1 - Game.config.war.production_drop);
                        target.production *= (1 - Game.config.war.production_drop);
                        n.trade_power *= (1 - Game.config.war.trade_drop);
                        target.trade_power *= (1 - Game.config.war.trade_drop);
                        
                        console.log(`⚔️ Geopolitical WAR declared: ${activeCountryKey} vs ${targetKey} due to hostile relations!`);
                        Game.Simulation.visualizeWar(activeCountryKey, targetKey);
                    }
                } else {
                    // শত্রু না থাকলে শান্তিতে বাণিজ্য করবে এবং অর্থ উপার্জন করবে
                    n.money += n.trade_power * 0.15 * Game.worldState.inflation;
                }
            } else if (roll < profile.war + profile.trade) {
                // সাধারণ বাণিজ্য আচরণ
                n.money += n.trade_power * 0.1 * Game.worldState.inflation;
            } else {
                // ব্যাংক থেকে লোন নেওয়া (যদি দেশটিতে টাকার ঘাটতি বা ক্রাইসিস থাকে)
                if (n.money < 200) {
                    const amount = 50;
                    Game.worldState.bank_liquidity -= amount;
                    n.money += amount;
                    n.debt += amount;
                    console.log(`🏦 Strategic Bank Loan: ${activeCountryKey} took a loan of $50.`);
                } else {
                    // টাকা পর্যাপ্ত থাকলে অর্থনৈতিক উন্নয়ন
                    n.production *= 1.02; 
                }
            }
        }
        
        // ৪. মেগা টেকনোলজি ইভেন্ট (১% অত্যন্ত বিরল চান্স)
        if (Math.random() < 0.01) {
            countries.forEach(key => {
                Game.state.economy[key].production *= Game.config.tech.industrial.production;
            });
            console.log("🧬 GLOBAL INDUSTRIAL REVOLUTION ACTIVE");
        }
    },
    
    // borer লাল ফ্ল্যাশ করার ভিজ্যুয়াল গাইড
    visualizeWar(attacker, defender) {
        if (!Game.geojsonLayer) return;
        Game.geojsonLayer.eachLayer(layer => {
            const props = layer.feature.properties || {};
            const normName = Game.getCountryId(props.ADMIN || props.name || props.NAME);
            if (normName === attacker || normName === defender) {
                layer.setStyle({ color: "#ef4444", weight: 4.5 });
                setTimeout(() => {
                    if (Game.geojsonLayer) {
                        Game.geojsonLayer.resetStyle(layer);
                    }
                }, 3000); 
            }
        });
    }
};

Game.Diplomacy = {
    _legacyRelations: {
        "BANGLADESH": { "INDIA": { hist: 40, dipl: 45 }, "PAKISTAN": { hist: -30, dipl: -20 }, "CHINA": { hist: 25, dipl: 35 } },
        "INDIA": { "PAKISTAN": { hist: -95, dipl: -90 }, "BANGLADESH": { hist: 40, dipl: 45 }, "CHINA": { hist: -40, dipl: -45 } },
        "PAKISTAN": { "CHINA": { hist: 45, dipl: 50 }, "INDIA": { hist: -95, dipl: -90 } },
        "CHINA": { "UNITED_STATES_OF_AMERICA": { hist: -25, dipl: -35 }, "RUSSIA": { hist: 30, dipl: 40 }, "PAKISTAN": { hist: 45, dipl: 50 } },
        "UNITED_STATES_OF_AMERICA": { "UNITED_KINGDOM": { hist: 45, dipl: 50 }, "ISRAEL": { hist: 40, dipl: 50 }, "RUSSIA": { hist: -80, dipl: -85 } },
        "RUSSIA": { "CHINA": { hist: 30, dipl: 40 }, "UKRAINE": { hist: -95, dipl: -95 } }
    },

    generateAllBilateralRelations() {
        const countries = Object.keys(Game.state.economy);
        if (countries.length === 0) return;

        Game.state.relations = Game.state.relations || {};
        
        // RGE Engine Integration (relation_generation_engine.json)
        const rge = this._rgeEngine || (Game.state.relationEngine && Game.state.relationEngine.RELATION_GENERATION_ENGINE) || null;
        const weights = (rge && rge.weights) ? rge.weights : { historical: 0.15, diplomatic: 0.15, economic: 0.15, military: 0.10, strategic: 0.15, cultural: 0.10, intelligence: 0.05, societal: 0.05, international: 0.10 };
        const salience = (rge && rge.srie_v2_asymmetrical_salience) ? rge.srie_v2_asymmetrical_salience : {};

        function clamp(v) { return Math.max(-100, Math.min(100, Math.floor(v || 0))); }
        function diff(a, b) {
            if (a === undefined || b === undefined) return 50; 
            return 100 - Math.abs(a - b);
        }

        countries.forEach(c1 => {
            Game.state.relations[c1] = Game.state.relations[c1] || {};
            const salienceA = salience[c1] || salience[c1.replace(/_/g, " ")] || null;
            const paramsA = salienceA ? salienceA.parameters : null;

            countries.forEach(c2 => {
                if (c1 === c2) return;

                const A = Game.state.economy[c1] || {};
                const B = Game.state.economy[c2] || {};
                const P = Game.state.population[c1] || {};
                const Q = Game.state.population[c2] || {};
                const salienceB = salience[c2] || salience[c2.replace(/_/g, " ")] || null;
                const paramsB = salienceB ? salienceB.parameters : null;

                // GDP and Population Logarithmic comparison
                let logA_gdp = Math.log10(A.gdp && A.gdp > 0 ? A.gdp : 1);
                let logB_gdp = Math.log10(B.gdp && B.gdp > 0 ? B.gdp : 1);
                let gdpDiff = 100 - Math.min(100, Math.abs(logA_gdp - logB_gdp) * 15);

                let logP_pop = Math.log10(P.population_2015 && P.population_2015 > 0 ? P.population_2015 : 1);
                let logQ_pop = Math.log10(Q.population_2015 && Q.population_2015 > 0 ? Q.population_2015 : 1);
                let popDiff = 100 - Math.min(100, Math.abs(logP_pop - logQ_pop) * 15);

                let historical = diff(A.ideology, B.ideology) * 0.2 + popDiff * 0.02;
                let diplomatic = diff(A.ideology, B.ideology) * 0.2;

                // SRIE Parameters Impact
                if (paramsA && paramsB) {
                    const secDiff = diff(paramsA.MIL_SECURITY_DEPENDENCY, paramsB.MIL_SECURITY_DEPENDENCY);
                    const threatDiff = diff(paramsA.REGIONAL_THREAT_FEAR, paramsB.REGIONAL_THREAT_FEAR);
                    const stabDiff = diff(paramsA.DOMESTIC_POLITICAL_STABILITY, paramsB.DOMESTIC_POLITICAL_STABILITY);
                    historical = (historical + stabDiff * 0.5) / 1.5;
                    diplomatic = (diplomatic + (100 - threatDiff) * 0.3 + secDiff * 0.3) / 1.6;
                }

                // Baseline real-world legacy relations from relations.json
                if (this._legacyRelations) {
                    const legA = this._legacyRelations[c1] || this._legacyRelations[c1.replace(/_/g, " ")];
                    if (legA && legA[c2]) {
                        const legacy = legA[c2];
                        historical += (legacy.hist || legacy.historical || 0) * 0.5;
                        diplomatic += (legacy.dipl || legacy.diplomatic || 0) * 0.5;
                    }
                }

                let economic = gdpDiff; 
                let military = diff(A.military_power, B.military_power) * 0.25;
                if (paramsA && paramsB) {
                    military += (100 - Math.abs(paramsA.MIL_MOBILIZATION_READINESS - paramsB.MIL_MOBILIZATION_READINESS)) * 0.2;
                }

                let intelligence = 50;
                if (paramsA && paramsB) {
                    intelligence = 100 - (paramsA.INTEL_COVERT_ACTIVITY_RISK + paramsB.INTEL_COVERT_ACTIVITY_RISK) * 0.5;
                }

                let cultural = diff(A.cultural_similarity, B.cultural_similarity) * 0.6;
                let strategic = diff(A.strategic_value, B.strategic_value) * 0.5;
                let societal = diff(A.stability, B.stability) * 0.2;
                let international = diff(A.alliance_score, B.alliance_score);

                let overall = (historical * weights.historical) + 
                              (diplomatic * weights.diplomatic) + 
                              (economic * weights.economic) + 
                              (military * weights.military) + 
                              (intelligence * weights.intelligence) + 
                              (cultural * weights.cultural) + 
                              (strategic * weights.strategic) + 
                              (societal * weights.societal) + 
                              (international * weights.international);
                
                const finalScore = clamp(overall);

                Game.state.relations[c1][c2] = {
                    overall: finalScore,
                    border_tension: clamp(50 - finalScore * 0.5),
                    military_threat: clamp(40 - finalScore * 0.4),
                    status: finalScore > 40 ? "Ally" : (finalScore < -30 ? "Hostile" : "Neutral"),
                    asymmetrical_salience: salienceA ? salienceA.ai_driver : "Bilateral Sovereign Balance"
                };
            });
        });
        window.GameRelationsDatabase = Game.state.relations;
        console.log(`✅ [RGE Engine] Generated Bilateral Relations for ${countries.length} nations using relation_generation_engine.json & relations.json.`);
    }
};

Game.DataLoader = {
    async loadAssets() {
        try {
            const fetcher = window.fetchResilient || (async (f) => {
                const res = await fetch(f + '?v=' + Date.now());
                return res.ok ? await res.json() : null;
            });

            const popData = await fetcher('population.json');
            if (popData && typeof popData === 'object') {
                Game.state.population = popData;
            }

            const econData = await fetcher('economy.json');
            if (econData && typeof econData === 'object') {
                Game.state.economy = econData;
            }

            // Load relation generation engine and baseline relations
            const [rgeData, relData, minData] = await Promise.all([
                fetcher('relation_generation_engine.json'),
                fetcher('relations.json'),
                fetcher('ministers.json')
            ]);

            if (rgeData && rgeData.RELATION_GENERATION_ENGINE) {
                Game.state.relationEngine = rgeData;
                if (Game.Diplomacy) Game.Diplomacy._rgeEngine = rgeData.RELATION_GENERATION_ENGINE;
            }

            if (relData && typeof relData === 'object') {
                if (Game.Diplomacy) Game.Diplomacy._legacyRelations = relData;
            }

            if (minData && minData.ministers_database) {
                window.OmegaMinistersDB = minData.ministers_database;
                Game.state.ministersDB = minData.ministers_database;
                if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.syncMinistersDatabase === 'function') {
                    window.OmegaCabinetUI.syncMinistersDatabase(minData.ministers_database);
                }
            }

            if (Game.Diplomacy && typeof Game.Diplomacy.generateAllBilateralRelations === 'function') {
                Game.Diplomacy.generateAllBilateralRelations();
            }

            const relSelector = (Game.dom && Game.dom.relSelector) || document.getElementById('relation-selector'); 
            if (relSelector && Game.state.economy) {
                relSelector.innerHTML = '<option value="NONE">-- Select Target --</option>';
                Object.keys(Game.state.economy).sort().forEach(countryKey => {
                    const opt = document.createElement('option');
                    opt.value = countryKey;
                    opt.innerText = countryKey.replace(/_/g, " ");
                    relSelector.appendChild(opt);
                });
            }

            // ম্যাপ লোড হওয়ার পর ডাইনামিক্যালি প্রতিটি দেশের জন্য সিমুলেশন ডাটা জেনারেট করা হয়
            if (Game.state.economy) {
                Object.keys(Game.state.economy).forEach(countryKey => {
                    const econ = Game.state.economy[countryKey];
                    if (!econ) return;
                    let ai_type = "survival";
                    if (econ.gdp > 500000000000) { 
                        ai_type = "greedy";
                    }
                    if (countryKey === "CHINA" || countryKey === "USA" || countryKey === "RUSSIA") {
                        ai_type = "aggressive";
                    }
                    if (countryKey === "BANGLADESH") {
                        ai_type = "survival";
                    }
                    econ.ai = ai_type;
                    econ.money = econ.money || 500;
                    econ.debt = econ.debt || 0;
                    econ.stock = econ.stock || {"food": 100, "oil": 80, "metal": 90};
                    econ.production = econ.production || 120;
                    econ.trade_power = econ.trade_power || 100;
                });
            }

            const countryConfig = await fetcher('countries.json');
            if (Array.isArray(countryConfig)) {
                countryConfig.forEach(c => {
                    if (c && c.name) {
                        Game.countryLookup[Game.normalizeName(c.name)] = c;
                    }
                });
            }

            const geoData = await fetcher('world.json');
            if (geoData && geoData.type) {
                Game.Map.renderGeoJSON(geoData);
            }

        } catch (error) {
            console.error("❌ ডাটা পাইপলাইন এরর:", error);
        }
    }
};

Game.LabelSystem = {
    updateCountryLabels() {
        if(!Game.Map.map) return;
        var zoom = Game.Map.map.getZoom();
        
        Game.countryLabels.forEach(item => {
            var marker = item.marker;
            var config = item.config;
            var importance = config.importance || 3;
            var shouldShow = (zoom <= 4.2) ? (importance >= 5) : ((zoom <= 5.5) ? (importance >= 3) : true);
            
            item.shouldShow = shouldShow;
            var labelText = Game.getGameFriendlyName(config.name);
            var fontSize = Game.getFontSizeForCountry(config, zoom);

            marker.setIcon(L.divIcon({
                className: "country-label",
                html: `<div style="transform: translate(-50%, -50%); font-size:${fontSize}px; white-space: nowrap;">${labelText}</div>`,
                iconSize: [0, 0]
            }));
        });

        var visiblePositions = [];
        var sortedLabels = Game.countryLabels.slice().sort((a, b) => (b.config.importance || 3) - (a.config.importance || 3));

        sortedLabels.forEach(item => {
            var marker = item.marker;
            if (!item.shouldShow) {
                if (Game.Map.map.hasLayer(marker)) Game.Map.map.removeLayer(marker);
                return;
            }

            var point = Game.Map.map.latLngToLayerPoint(marker.getLatLng());
            var labelText = Game.getGameFriendlyName(item.config.name);
            var fontSize = Game.getFontSizeForCountry(item.config, zoom);
            var estWidth = labelText.length * (fontSize * 0.58);
            var estHeight = fontSize + 4;

            var isOverlapping = false;
            for (var i = 0; i < visiblePositions.length; i++) {
                var other = visiblePositions[i];
                var hOverlap = Math.abs(point.x - other.x) < (estWidth / 2 + other.width / 2 + 10);
                var vOverlap = Math.abs(point.y - other.y) < (estHeight / 2 + other.height / 2 + 5);
                if (hOverlap && vOverlap) { isOverlapping = true; break; }
            }

            if (isOverlapping) {
                if (Game.Map.map.hasLayer(marker)) Game.Map.map.removeLayer(marker);
            } else {
                if (!Game.Map.map.hasLayer(marker)) marker.addTo(Game.Map.map);
                visiblePositions.push({ x: point.x, y: point.y, width: estWidth, height: estHeight });
            }
        });
    }
};
/* ============================================================================
   MAP ENGINE 2: PART 2 - MAP RENDERING & HUBS (Part 2)
   ============================================================================ */

Game.Map = {
    // দেশগুলোর নাম যেন দৃষ্টিনন্দনভাবে ঠিক মাঝখানে বসে সে জন্য সেন্টার কোঅর্ডিনেট সেট করা হয়েছে
    visualCenters: { 
        "india": [22.8, 78.5], 
        "united states of america": [39.8, -98.5], 
        "unitedstates": [39.8, -98.5], 
        "russia": [61.5, 95.0], 
        "canada": [56.0, -96.0], 
        "china": [34.5, 103.5],
        "norway": [62.0, 9.0],
        "sweden": [62.0, 15.0],
        "finland": [64.0, 26.0],
        "denmark": [56.0, 10.0],
        "united kingdom": [54.5, -2.5],
        "france": [46.5, 2.5],
        "germany": [51.3, 10.5],
        "poland": [52.0, 19.3],
        "italy": [42.5, 12.5],
        "chile": [-35.0, -72.0],
        "japan": [36.0, 138.0],
        "philippines": [12.0, 122.0],
        "indonesia": [-0.78, 113.9],
        "new zealand": [-41.0, 174.0],
        "netherlands": [52.3, 5.5],
        "greece": [39.0, 22.0],
        "croatia": [44.5, 16.5]
    },
    
    init() {
        this.map = window.map;
        this.hubsGroupLayer = window.hubsGroupLayer;
        this.bindMapDOMEvents();
        this.bindMapUIProtection();

        this.map.on('zoomend', function() {
            var currentZoom = window.map.getZoom();
            if (Game.geojsonLayer) {
                Game.geojsonLayer.eachLayer(function(layer) {
                    if (layer !== Game.selectedLayer) {
                        layer.setStyle({ 
                            weight: currentZoom > 5.5 ? 1.4 : 0.9,
                            dashArray: null
                        });
                    } else {
                        var displayName = Game.currentActiveCountry;
                        if (displayName) {
                            layer.setStyle({
                                color: "#ffd700",
                                opacity: 1.0,
                                weight: 2.5,
                                dashArray: null
                            });
                        }
                    }
                });
            }
            if (Game.currentActiveCountry) {
                Game.Map.renderCountryHubs();
            } else {
                Game.Map.renderGlobalCapitalHubs();
            }
            Game.LabelSystem.updateCountryLabels();
        });

        this.map.on('click', function() {
            if (Game.selectedLayer && Game.geojsonLayer) {
                Game.geojsonLayer.resetStyle(Game.selectedLayer);
                Game.selectedLayer = null;
            }
            Game.currentActiveCountry = null;
            if (Game.hubsGroupLayer) Game.hubsGroupLayer.clearLayers();
            Game.Map.closeCityDetailBar();
            Game.closeCountrySelectionBar();
            Game.Map.renderGlobalCapitalHubs();
        });

        // Render global capitals on start
        setTimeout(() => {
            this.renderGlobalCapitalHubs();
            this.bindMapUIProtection();
        }, 500);
    },

    bindMapUIProtection() {
        const protectIds = [
            'top-status-bar',
            'metric-selector-pill',
            'top-bar-dropdown-trigger',
            'map-metric-dropdown',
            'map-metric-legend',
            'resource-filter-box',
            'relation-filter-box',
            'slim-info-feed-container',
            'ui-right-controls',
            'country-selection-bar',
            'country-info-card',
            'special-map-controls',
            'ui-bottom-navigation',
            'city-detail-bar',
            'global-back-btn',
            'search-drawer',
            'events-drawer',
            'layers-drawer'
        ];
        protectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (typeof L !== 'undefined' && L.DomEvent) {
                    L.DomEvent.disableClickPropagation(el);
                    L.DomEvent.disableScrollPropagation(el);
                }
                ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'mousedown'].forEach(evtType => {
                    el.addEventListener(evtType, function(e) {
                        e.stopPropagation();
                    }, { passive: true });
                });
            }
        });
        this.setupHorizontalScrollDrag();
    },

    setupHorizontalScrollDrag() {
        const scrollContainers = [
            document.querySelector('.status-resources'),
            document.getElementById('top-status-bar'),
            document.getElementById('ios-chapter-nav')
        ];

        scrollContainers.forEach(container => {
            if (!container || container._hasScrollDrag) return;
            container._hasScrollDrag = true;

            let isDown = false;
            let startX = 0;
            let scrollLeft = 0;

            container.addEventListener('pointerdown', (e) => {
                isDown = true;
                container.style.cursor = 'grabbing';
                startX = e.pageX - container.offsetLeft;
                scrollLeft = container.scrollLeft;
            });

            const onPointerMove = (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - container.offsetLeft;
                const walk = (x - startX) * 1.5;
                container.scrollLeft = scrollLeft - walk;
            };

            const onPointerUp = () => {
                isDown = false;
                if (container) container.style.cursor = '';
            };

            container.addEventListener('pointermove', onPointerMove);
            container.addEventListener('pointerup', onPointerUp);
            container.addEventListener('pointerleave', onPointerUp);
            container.addEventListener('pointercancel', onPointerUp);

            let touchStartX = 0;
            let touchScrollLeft = 0;
            container.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) {
                    touchStartX = e.touches[0].pageX;
                    touchScrollLeft = container.scrollLeft;
                }
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches[0]) {
                    const currentX = e.touches[0].pageX;
                    const diff = touchStartX - currentX;
                    container.scrollLeft = touchScrollLeft + diff;
                }
            }, { passive: true });
        });
    },

    bindMapDOMEvents() {
        const self = this;
        const resSel = Game.dom.resSelector; 
        if (resSel) {
            resSel.addEventListener('change', (e) => self.applyResourceMapFilter(e.target.value));
        }
        const relSel = Game.dom.relSelector; 
        if (relSel) {
            relSel.addEventListener('change', (e) => self.applyRelationsMapFilter(e.target.value));
        }
    },

    renderOceanLabels() {
        window.oceanLabelsList.forEach(ocean => {
            L.marker([ocean.lat, ocean.lng], {
                icon: L.divIcon({
                    className: "ocean-label",
                    html: `<div class="ocean-label-text" style="transform: translate(-50%, -50%); font-size: ${ocean.fontSize}px; white-space: nowrap;">${ocean.name}</div>`,
                    iconSize: [0, 0]
                }),
                interactive: false
            }).addTo(this.map);
        });
    },

    renderCountryHubs() {
        if (!this.hubsGroupLayer) return;
        this.hubsGroupLayer.clearLayers(); 
        if (!Game.currentActiveCountry) return; // STRICT REQUIREMENT: Only render cities for selected country!

        // MUTUAL EXCLUSIVITY: When Resource Overlay mode is active, hide city hubs!
        if (this.activeResourceFilter && this.activeResourceFilter !== 'NONE') {
            return;
        }

        const countryId = Game.getCountryId(Game.currentActiveCountry);
        const countryData = Game.locationsRegistry ? Game.locationsRegistry[countryId] : null;
        if (!countryData) return;

        let hubs = [];
        if (countryData.capital) hubs.push(Object.assign({}, countryData.capital, { role: 'capital' }));
        if (countryData.economic) countryData.economic.forEach(h => hubs.push(Object.assign({}, h, { role: 'economic' })));
        if (countryData.military) countryData.military.forEach(h => hubs.push(Object.assign({}, h, { role: 'military' })));
        if (countryData.secret) countryData.secret.forEach(h => hubs.push(Object.assign({}, h, { role: 'secret' })));

        const currentZoom = this.map ? this.map.getZoom() : 4;

        hubs.forEach(hub => {
            var latitude = hub.lat, longitude = hub.lon !== undefined ? hub.lon : hub.lng;
            if (!latitude || longitude === undefined) return;

            // When zoomed far out (zoom < 3.2), only show capital to prevent clutter
            if (currentZoom < 3.2 && hub.role !== 'capital') return;

            var roleColor = '#00e5ff';
            var roleTitle = 'Regional Hub';

            if (hub.role === 'capital') { roleColor = '#ffd700'; roleTitle = 'Capital Command Hub'; }
            else if (hub.role === 'economic') { roleColor = '#f59e0b'; roleTitle = 'Industrial Economic Hub'; }
            else if (hub.role === 'military') { roleColor = '#ef4444'; roleTitle = 'Military Defense Station'; }
            else if (hub.role === 'secret') { roleColor = '#a855f7'; roleTitle = 'Strategic Intelligence Base'; }

            var hubIcon = L.divIcon({
                className: 'city-btn-marker-container',
                html: `
                    <div class="city-btn-marker" style="
                        border-color: ${roleColor};
                        box-shadow: 0 0 4px ${roleColor}44;
                        padding: 1px 4px;
                    ">
                        <span class="city-btn-dot" style="background: ${roleColor}; box-shadow: 0 0 4px ${roleColor}; width: 4px; height: 4px;"></span>
                        <span class="city-btn-label" style="font-size: 7.5px;">${hub.name}</span>
                    </div>
                `,
                iconSize: [0, 0]
            });

            var hubMarker = L.marker([latitude, longitude], { icon: hubIcon });

            hubMarker.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                Game.Map.openCityDetailBar(hub, Game.currentActiveCountry, roleColor, roleTitle);
            });

            this.hubsGroupLayer.addLayer(hubMarker);
        });
    },

    renderGlobalCapitalHubs() {
        if (!this.hubsGroupLayer) return;
        this.hubsGroupLayer.clearLayers(); // Clean slate, do not render global hubs when unselected
    },

    renderOceanLabels() {
        if (!this.map) return;
        if (this.oceanLayerGroup) {
            this.oceanLayerGroup.clearLayers();
        } else {
            this.oceanLayerGroup = L.layerGroup().addTo(this.map);
        }

        var zoom = this.map.getZoom();

        var oceans = [
            { name: "PACIFIC OCEAN", lat: -10, lng: -140, size: 13 },
            { name: "NORTH ATLANTIC OCEAN", lat: 30, lng: -45, size: 12 },
            { name: "SOUTH ATLANTIC OCEAN", lat: -25, lng: -20, size: 11 },
            { name: "INDIAN OCEAN", lat: -22, lng: 80, size: 12 },
            { name: "ARCTIC OCEAN", lat: 83, lng: 10, size: 12 },
            { name: "SOUTHERN OCEAN", lat: -65, lng: 0, size: 11 },
            { name: "MEDITERRANEAN SEA", lat: 34, lng: 18, size: 9 },
            { name: "BAY OF BENGAL", lat: 14, lng: 88, size: 9 },
            { name: "ARABIAN SEA", lat: 15, lng: 64, size: 9 },
            { name: "CARIBBEAN SEA", lat: 15, lng: -75, size: 9 }
        ];

        oceans.forEach(o => {
            if (o.size <= 9 && zoom < 3.8) return;

            var icon = L.divIcon({
                className: 'ocean-label-marker',
                html: `<div style="
                    font-family: 'Share Tech Mono', 'Cinzel', monospace;
                    font-size: ${o.size}px;
                    font-style: italic;
                    font-weight: 600;
                    color: rgba(56, 189, 248, 0.42);
                    letter-spacing: 3px;
                    text-transform: uppercase;
                    white-space: nowrap;
                    pointer-events: none;
                    user-select: none;
                    text-shadow: 0 0 8px rgba(0, 0, 0, 0.95);
                    transform: translate(-50%, -50%);
                ">${o.name}</div>`,
                iconSize: [0, 0]
            });

            var m = L.marker([o.lat, o.lng], { icon: icon, interactive: false });
            this.oceanLayerGroup.addLayer(m);
        });
    },

    openCityDetailBar(hub, countryName, roleColor, roleTitle) {
        const bar = document.getElementById('city-detail-bar');
        if (!bar) return;

        const dot = document.getElementById('city-bar-role-dot');
        const elName = document.getElementById('city-bar-name');
        const elTag = document.getElementById('city-bar-tag');
        const elType = document.getElementById('city-bar-type');
        const elCoords = document.getElementById('city-bar-coords');
        const elPop = document.getElementById('city-bar-pop');
        const elDesc = document.getElementById('city-bar-desc');

        const themeColor = roleColor || '#00e5ff';

        if (dot) {
            dot.style.background = themeColor;
            dot.style.boxShadow = `0 0 12px ${themeColor}`;
        }
        if (elName) elName.innerText = (hub.name || "CITY HUB").toUpperCase();
        if (elTag) elTag.innerText = `${(roleTitle || hub.role || 'HUB').toUpperCase()} • ${countryName ? countryName.toUpperCase() : 'SOVEREIGN STATE'}`;
        if (elType) elType.innerText = (hub.type || hub.role || 'Political / Administrative').toUpperCase();
        
        const lat = hub.lat ? Number(hub.lat).toFixed(2) : '0.00';
        const lonVal = hub.lon !== undefined ? hub.lon : hub.lng;
        const lon = lonVal !== undefined ? Number(lonVal).toFixed(2) : '0.00';
        if (elCoords) elCoords.innerText = `${lat}°N, ${lon}°E`;

        let popVal = hub.population ? Game.formatPopulationNumber(hub.population) : (hub.role === 'capital' ? '12.8 Million' : (hub.role === 'economic' ? '6.5 Million' : '2.4 Million'));
        if (elPop) elPop.innerText = popVal;

        if (elDesc) elDesc.innerText = hub.description || 'Primary regional administrative, industrial, and strategic installation.';

        bar.style.borderColor = themeColor;
        bar.style.boxShadow = `0 20px 60px rgba(0,0,0,0.92), 0 0 35px ${themeColor}40`;
        bar.classList.add('active');

        // Automatically vanish all other buttons, selection bar & navigation overlays while city detail card is open
        const selBar = document.getElementById('country-selection-bar');
        if (selBar) {
            selBar.classList.add('hidden');
            selBar.style.display = 'none';
        }
        document.body.classList.add('city-focus-active');
    },

    closeCityDetailBar() {
        const bar = document.getElementById('city-detail-bar');
        if (bar) bar.classList.remove('active');
        document.body.classList.remove('city-focus-active');
    },

    actionUpgradeCity() {
        const elName = document.getElementById('city-bar-name');
        const name = elName ? elName.innerText : 'City';
        if (window.OMEGA_UI_ADAPTER && typeof window.OMEGA_UI_ADAPTER.showAdvisePopup === 'function') {
            window.OMEGA_UI_ADAPTER.showAdvisePopup("INFRASTRUCTURE UPGRADE", `Initiated high-speed infrastructure expansion for ${name}. Treasury allocated!`);
        } else if (typeof Game.showNotification === 'function') {
            Game.showNotification("INFRASTRUCTURE UPGRADE", `Upgrading hub infrastructure for ${name}`, "info");
        }
    },

    actionGarrisonCity() {
        const elName = document.getElementById('city-bar-name');
        const name = elName ? elName.innerText : 'City';
        if (window.OMEGA_UI_ADAPTER && typeof window.OMEGA_UI_ADAPTER.showAdvisePopup === 'function') {
            window.OMEGA_UI_ADAPTER.showAdvisePopup("SECURITY DEPLOYMENT", `Stationed regional defense garrison and tactical forces at ${name}. Defense level boosted!`);
        } else if (typeof Game.showNotification === 'function') {
            Game.showNotification("SECURITY GARRISON", `Stationed defense forces at ${name}`, "info");
        }
    }
};

/* ============================================================================
   MAP ENGINE 2: PART 3 - GEOJSON OVERLAYS & BOOTSTRAP
   ============================================================================ */

Game.Map.renderGeoJSON = function(geoData) {
    const self = this;
    Game.geojsonLayer = L.geoJSON(geoData, {
        filter: function(feature) {
            var props = feature.properties || {};
            var geoName = (props.ADMIN || props.name || props.NAME || "").toLowerCase().trim();
            if (geoName === "northern cyprus" || geoName === "somaliland" || geoName === "somaliland region") {
                return false; 
            }
            return true;
        },
        style: function(feature) {
            var props = feature.properties || {};
            var geoName = props.ADMIN || props.name || props.NAME || "";
            if (geoName.toLowerCase() === "west bank" || geoName.toLowerCase() === "gaza" || geoName.toLowerCase() === "gaza strip") {
                geoName = "Palestine";
            }
            var config = Game.findCountryConfig(geoName);
            var defaultColor = "#2c4235"; 
            if (config) defaultColor = window.getCountryColor(config.name);
            return { 
                color: "rgba(255, 255, 255, 0.85)", 
                weight: 1.2, 
                opacity: 0.9, 
                dashArray: null,
                fillColor: defaultColor, 
                fillOpacity: 0.25 
            };
        },
        onEachFeature: function(feature, layer) {
            var props = feature.properties || {};
            var geoName = props.ADMIN || props.name || props.NAME || "";
            if (geoName.toLowerCase() === "west bank" || geoName.toLowerCase() === "gaza" || geoName.toLowerCase() === "gaza strip") {
                geoName = "Palestine";
            }
            var config = Game.findCountryConfig(geoName);
            var displayName = config ? config.name : geoName;
            if (!displayName) return;

            var center;
            var normName = Game.normalizeName(displayName);
            if (self.visualCenters[normName]) {
                center = L.latLng(self.visualCenters[normName][0], self.visualCenters[normName][1]);
            } else if (config && config.lat && (config.lng || config.lng === 0)) {
                center = L.latLng(config.lat, config.lng);
            } else {
                center = layer.getBounds().getCenter();
            }

            if (displayName === "France" && center.lat < 35) { return; }

            var marker = L.marker(center, {
                icon: L.divIcon({ className: "country-label", html: `<div class="country-label-inner" style="transform: translate(-50%, -50%); white-space: nowrap;">${Game.getGameFriendlyName(displayName)}</div>`, iconSize: [0, 0] }),
                interactive: false
            });

            if (config) Game.countryLabels.push({ marker: marker, config: config });
            else Game.countryLabels.push({ marker: marker, config: { name: displayName, code: props.ISO_A2 || "", importance: 3, minZoom: 3.8, maxZoom: 9 } });

            layer.on({
                click: function(e) {
                    L.DomEvent.stopPropagation(e);
                    Game.selectCountryByName(displayName, e.target);
                }
            });
        }
    }).addTo(this.map);

    Game.LabelSystem.updateCountryLabels();
    this.renderOceanLabels();
    setTimeout(() => {
        if (typeof this.renderResourceDeposits === 'function') {
            this.renderResourceDeposits('NONE');
        }
    }, 200);
};

Game.selectCountryByName = function(countryName, layerTarget) {
    if (!countryName) return;
    this.currentActiveCountry = countryName;

    if (layerTarget) {
        if (this.selectedLayer && this.geojsonLayer) this.geojsonLayer.resetStyle(this.selectedLayer);
        this.selectedLayer = layerTarget;
        this.selectedLayer.setStyle({ 
            color: "#ffd700", 
            opacity: 1.0, 
            weight: 2.5, 
            dashArray: null,
            fillColor: "#00e5ff", 
            fillOpacity: 0.35 
        });
    }

    if (this.Map) {
        this.Map.renderCountryHubs();
        const filterVal = this.Map.activeResourceFilter || 'COUNTRY';
        if (filterVal !== 'NONE') {
            this.Map.renderResourceDeposits(filterVal);
        }
    }

    if (typeof this.updateCountryInfoCard === 'function') {
        this.updateCountryInfoCard(countryName);
    }

    // Close drawers on country select
    if (typeof this.closeAllDrawers === 'function') {
        this.closeAllDrawers();
    }
};

Game.Map.toggleCommandHub = function(show, initialChapter = 1) {
    if (show) {
        if (window.CountryIOS) {
            window.CountryIOS.open(Game.currentActiveCountry || "BANGLADESH", initialChapter);
        } else if (Game.dom.hubModal) {
            Game.dom.hubModal.style.display = 'flex';
        }
    } else {
        if (window.CountryIOS) {
            window.CountryIOS.close();
        } else if (Game.dom.hubModal) {
            Game.dom.hubModal.style.display = 'none';
        }
    }
};

Game.Map.openSelectedCountryDetails = function() {
    const activeCountry = Game.currentActiveCountry || window.currentActiveCountry || "BANGLADESH";
    if (window.CountryIOS) {
        window.CountryIOS.open(activeCountry, 1);
    } else if (typeof window.toggleCommandHub === 'function') {
        window.toggleCommandHub(true);
    } else {
        const card = document.getElementById('country-info-card');
        if (card) card.classList.add('active');
    }
};

Game.closeCountrySelectionBar = function() {
    const selBar = document.getElementById('country-selection-bar');
    if (selBar) {
        selBar.classList.add('hidden');
        selBar.style.display = 'none';
    }
    if (Game.geojsonLayer && Game.selectedLayer) {
        Game.geojsonLayer.resetStyle(Game.selectedLayer);
        Game.selectedLayer = null;
    }
};

Game.Map.selectedResourceChips = new Set();

Game.Map.toggleResourceChip = function(resId, isChecked) {
    if (!this.selectedResourceChips) this.selectedResourceChips = new Set();
    if (isChecked) {
        this.selectedResourceChips.add(resId.toLowerCase());
    } else {
        this.selectedResourceChips.delete(resId.toLowerCase());
    }
    const countEl = document.getElementById('selected-res-count');
    if (countEl) {
        countEl.innerText = `(${this.selectedResourceChips.size} Selected)`;
    }
    // Highlight preset buttons if multi-selected
    const btnCountry = document.getElementById('btn-preset-country');
    const btnAll = document.getElementById('btn-preset-all');
    if (btnCountry) btnCountry.style.borderColor = 'rgba(0,229,255,0.3)';
    if (btnAll) btnAll.style.borderColor = 'rgba(0,229,255,0.3)';
};

Game.Map.selectResourcePreset = function(preset) {
    if (!this.selectedResourceChips) this.selectedResourceChips = new Set();
    this.selectedResourceChips.clear();
    const countEl = document.getElementById('selected-res-count');
    if (countEl) countEl.innerText = '(0 Selected)';

    // Uncheck all chip checkboxes in grid
    const grid = document.getElementById('resource-chip-grid');
    if (grid) {
        const checkboxes = grid.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    }

    const btnCountry = document.getElementById('btn-preset-country');
    const btnAll = document.getElementById('btn-preset-all');
    const btnNone = document.getElementById('btn-preset-none');
    if (btnCountry) btnCountry.style.borderColor = (preset === 'COUNTRY') ? '#00e5ff' : 'rgba(0,229,255,0.3)';
    if (btnAll) btnAll.style.borderColor = (preset === 'ALL') ? '#00e5ff' : 'rgba(0,229,255,0.3)';

    this.applyResourceMapFilter(preset);
};

Game.Map.applyMultiResourceFilter = function() {
    if (!this.selectedResourceChips) this.selectedResourceChips = new Set();
    if (this.selectedResourceChips.size === 0) {
        this.applyResourceMapFilter('COUNTRY');
        return;
    }
    const filtersArray = Array.from(this.selectedResourceChips);
    this.applyResourceMapFilter(filtersArray);
};

// ==========================================
// CENTRAL RESOURCE MAP CONTROLLER & STATE
// ==========================================
Game.Map.resourceState = {
    enabled: false,              // true when resource mode active
    scope: "NATION",             // "NATION" or "WORLD"
    selectedResources: new Set(['cobalt', 'lithium', 'rare_earth', 'crude_oil', 'natural_gas', 'gold', 'uranium', 'iron_ore', 'copper', 'bauxite']),
};

Game.Map.resourceCatalog = [
    { id: 'crude_oil', name: 'Crude Oil', icon: '🛢️', color: '#f59e0b' },
    { id: 'natural_gas', name: 'Natural Gas', icon: '🔥', color: '#00e5ff' },
    { id: 'coal', name: 'Coal', icon: '🪨', color: '#94a3b8' },
    { id: 'iron_ore', name: 'Iron Ore & Steel', icon: '⛏️', color: '#38bdf8' },
    { id: 'copper', name: 'Copper', icon: '🔌', color: '#f97316' },
    { id: 'gold', name: 'Gold', icon: '🥇', color: '#ffd700' },
    { id: 'uranium', name: 'Uranium', icon: '⚛️', color: '#22c55e' },
    { id: 'lithium', name: 'Lithium', icon: '🔋', color: '#a855f7' },
    { id: 'cobalt', name: 'Cobalt', icon: '🔋', color: '#3b82f6' },
    { id: 'rare_earth', name: 'Rare Earth', icon: '💎', color: '#ec4899' },
    { id: 'bauxite', name: 'Bauxite / Aluminum', icon: '📦', color: '#fb923c' },
    { id: 'nickel', name: 'Nickel', icon: '🧪', color: '#10b981' },
    { id: 'manganese', name: 'Manganese', icon: '⚙️', color: '#cbd5e1' },
    { id: 'titanium', name: 'Titanium', icon: '🛡️', color: '#e2e8f0' },
    { id: 'zinc', name: 'Zinc & Lead', icon: '🔩', color: '#64748b' },
    { id: 'tin', name: 'Tin', icon: '🥫', color: '#94a3b8' },
    { id: 'potash', name: 'Potash & Salt', icon: '🌾', color: '#eab308' },
    { id: 'silver', name: 'Silver & Platinum', icon: '🥈', color: '#e2e8f0' },
    { id: 'diamond', name: 'Diamond & Gems', icon: '💎', color: '#38bdf8' },
    { id: 'semiconductor', name: 'Silicon / Chips', icon: '🔬', color: '#a855f7' }
];

Game.Map.setResourceScope = function(scope) {
    this.resourceState.scope = scope;
    const btnNation = document.getElementById('btn-scope-nation');
    const btnWorld = document.getElementById('btn-scope-world');
    const scopeIndicator = document.getElementById('res-scope-target');

    if (scope === 'NATION') {
        if (btnNation) {
            btnNation.style.background = 'rgba(0,229,255,0.2)';
            btnNation.style.borderColor = '#00e5ff';
            btnNation.style.color = '#00e5ff';
        }
        if (btnWorld) {
            btnWorld.style.background = 'transparent';
            btnWorld.style.borderColor = 'transparent';
            btnWorld.style.color = '#94a3b8';
        }
        const activeCountry = Game.currentActiveCountry || 'BANGLADESH';
        if (scopeIndicator) scopeIndicator.textContent = `${activeCountry.replace(/_/g, " ").toUpperCase()} (SELECTED NATION)`;
    } else {
        if (btnWorld) {
            btnWorld.style.background = 'rgba(0,229,255,0.2)';
            btnWorld.style.borderColor = '#00e5ff';
            btnWorld.style.color = '#00e5ff';
        }
        if (btnNation) {
            btnNation.style.background = 'transparent';
            btnNation.style.borderColor = 'transparent';
            btnNation.style.color = '#94a3b8';
        }
        if (scopeIndicator) scopeIndicator.textContent = `WORLDWIDE (ALL COUNTRIES)`;
    }

    if (this.resourceState.enabled) {
        this.renderResourceDeposits();
    }
};

Game.Map.toggleResourceFilterMenu = function() {
    const box = document.getElementById('resource-filter-box');
    if (!box) return;
    const isHidden = box.classList.contains('hidden') || box.style.display === 'none';
    if (isHidden) {
        box.classList.remove('hidden');
        box.style.display = 'flex';
        this.renderResourceCheckboxesInPanel();
        this.setResourceScope(this.resourceState.scope || 'NATION');
    } else {
        box.classList.add('hidden');
        box.style.display = 'none';
    }
    if (window.updateGlobalBackButtonVisibility) {
        window.updateGlobalBackButtonVisibility();
    }
};

Game.Map.hideResourceFilterMenu = function() {
    const box = document.getElementById('resource-filter-box');
    if (box) {
        box.classList.add('hidden');
        box.style.display = 'none';
    }
    if (window.updateGlobalBackButtonVisibility) {
        window.updateGlobalBackButtonVisibility();
    }
};

Game.Map.renderResourceCheckboxesInPanel = function() {
    const grid = document.getElementById('resource-chip-grid');
    if (!grid) return;
    grid.innerHTML = '';

    this.resourceCatalog.forEach(item => {
        const isChecked = this.resourceState.selectedResources.has(item.id);
        const label = document.createElement('label');
        label.className = 'res-chip-item';
        label.style.cssText = `display:flex; align-items:center; gap:6px; padding:4px 6px; background:${isChecked ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${isChecked ? '#00e5ff' : 'rgba(255,255,255,0.08)'}; border-radius:6px; font-size:10px; color:${isChecked ? '#ffffff' : '#cbd5e1'}; cursor:pointer; font-family:var(--font-mono); transition:all 0.15s ease;`;

        label.innerHTML = `
            <input type="checkbox" value="${item.id}" ${isChecked ? 'checked' : ''} onchange="Game.Map.handleResourceCheckboxChange('${item.id}', this.checked, this.parentElement)" style="accent-color:#00e5ff; cursor:pointer;">
            <span>${item.icon} ${item.name}</span>
        `;
        grid.appendChild(label);
    });
};

Game.Map.handleResourceCheckboxChange = function(resId, isChecked, parentEl) {
    if (isChecked) {
        this.resourceState.selectedResources.add(resId);
        if (parentEl) {
            parentEl.style.background = 'rgba(0,229,255,0.12)';
            parentEl.style.borderColor = '#00e5ff';
            parentEl.style.color = '#ffffff';
        }
    } else {
        this.resourceState.selectedResources.delete(resId);
        if (parentEl) {
            parentEl.style.background = 'rgba(255,255,255,0.03)';
            parentEl.style.borderColor = 'rgba(255,255,255,0.08)';
            parentEl.style.color = '#cbd5e1';
        }
    }
};

Game.Map.selectAllResourceTypes = function() {
    this.resourceCatalog.forEach(item => this.resourceState.selectedResources.add(item.id));
    this.renderResourceCheckboxesInPanel();
};

Game.Map.deselectAllResourceTypes = function() {
    this.resourceState.selectedResources.clear();
    this.renderResourceCheckboxesInPanel();
};

Game.Map.clearAndResetResourceMode = function() {
    this.resourceState.enabled = false;
    this.resourceState.selectedResources.clear();
    this.hideResourceFilterMenu();
    
    // Clear Layer
    if (this.resourceDepositsLayer) {
        this.resourceDepositsLayer.clearLayers();
    }

    // Toggle button visual off
    const btn = document.getElementById('btn-resource-mode');
    if (btn) {
        btn.classList.remove('active');
        btn.style.borderColor = '';
        btn.style.boxShadow = '';
        btn.style.background = '';
    }

    // Restore Cities
    if (typeof this.renderGlobalCapitalHubs === 'function') {
        this.renderGlobalCapitalHubs();
    } else if (typeof this.renderCountryHubs === 'function') {
        this.renderCountryHubs();
    }
};

Game.Map.applyResourceFilterAndClose = function() {
    this.resourceState.enabled = true;
    this.hideResourceFilterMenu();

    // Toggle button visual active
    const btn = document.getElementById('btn-resource-mode');
    if (btn) {
        btn.classList.add('active');
        btn.style.borderColor = '#00e5ff';
        btn.style.boxShadow = '0 0 15px rgba(0, 229, 255, 0.8)';
        btn.style.background = 'rgba(0, 229, 255, 0.3)';
    }

    this.renderResourceDeposits();
};

Game.Map.renderResourceDeposits = function() {
    this.map = this.map || window.map;
    if (!this.map) return;

    // Initialize SINGLE layer group if needed
    if (!this.resourceDepositsLayer) {
        this.resourceDepositsLayer = L.layerGroup().addTo(this.map);
    }

    // CRITICAL MANDATE 11: ONE LAYER ONLY. Always clear before adding new markers.
    this.resourceDepositsLayer.clearLayers();

    // Auto-populate all catalog resources if selectedResources is empty but enabled
    if (this.resourceState && this.resourceState.enabled && (!this.resourceState.selectedResources || this.resourceState.selectedResources.size === 0)) {
        if (Array.isArray(this.resourceCatalog)) {
            this.resourceState.selectedResources = new Set(this.resourceCatalog.map(r => r.id.toLowerCase()));
        }
    }

    // Check if mode is active or any resources selected
    if (!this.resourceState.enabled || this.resourceState.selectedResources.size === 0) {
        const summaryCountElem = document.getElementById('resource-summary-count');
        if (summaryCountElem) summaryCountElem.textContent = '0 deposits';
        return;
    }

    // Hide City Hubs when Resource Mode is Active
    if (this.hubsGroupLayer) {
        this.hubsGroupLayer.clearLayers();
    }

    const engine = window.ResourceMinistryEngine;
    const deposits = (engine && engine.deposits && engine.deposits.length > 0) ? engine.deposits : [];
    
    const normCountry = (c) => {
        if (!c) return '';
        let s = String(c).replace(/_/g, " ").toUpperCase().trim();
        const map = {
            'UNITED STATES OF AMERICA': 'USA', 'UNITED STATES': 'USA', 'AMERICA': 'USA',
            'IVORY COAST': "COTE D'IVOIRE", "CÔTE D'IVOIRE": "COTE D'IVOIRE",
            'DEMOCRATIC REPUBLIC OF THE CONGO': 'DR CONGO', 'CONGO (KINSHASA)': 'DR CONGO', 'CONGO': 'DR CONGO',
            'BANGLADESH': 'BANGLADESH', 'INDIA': 'INDIA', 'PAKISTAN': 'PAKISTAN', 'CHINA': 'CHINA', 'RUSSIA': 'RUSSIA'
        };
        return map[s] || s;
    };

    const activeCountryNorm = normCountry(Game.currentActiveCountry || (window.CountryIOS && window.CountryIOS.activeCountry) || 'BANGLADESH');
    const scope = this.resourceState.scope || 'WORLD'; // Default to global scope so all 197 countries show!
    const selectedRes = this.resourceState.selectedResources;

    // Deduplication & Safety Validation Loop
    const seenKeys = new Set();
    const matchingDeposits = [];

    deposits.forEach(dep => {
        // SAFETY GATE: Valid finite coordinates within earth lat/lng range
        const lat = Number(dep.lat);
        const lng = Number(dep.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return; // Skip invalid coordinates
        }

        const resId = (dep.resId || '').toLowerCase().trim();
        // Check if selected or tag matches
        const hasMatch = selectedRes.has(resId) || (Array.isArray(dep.resourceTags) && dep.resourceTags.some(t => selectedRes.has(String(t).toLowerCase())));
        if (!hasMatch && selectedRes.size > 0 && !selectedRes.has('all')) return; // Filtered out

        const cNorm = normCountry(dep.country || dep.countryCode || '');

        // Scope Filter: NATION vs WORLD
        if (scope === 'NATION') {
            const isMatch = (cNorm === activeCountryNorm) ||
                            (dep.countryCode && String(dep.countryCode).toUpperCase() === activeCountryNorm) ||
                            (cNorm.length > 3 && activeCountryNorm.length > 3 && (cNorm.includes(activeCountryNorm) || activeCountryNorm.includes(cNorm)));
            if (!isMatch) return;
        }

        // Deduplication Key
        const dedupKey = `${cNorm}|${resId}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);

        matchingDeposits.push({ ...dep, lat, lng, resId });
    });

    const summaryCountElem = document.getElementById('resource-summary-count');
    if (summaryCountElem) {
        summaryCountElem.textContent = `${matchingDeposits.length} deposit${matchingDeposits.length === 1 ? '' : 's'}`;
    }

    // Exact Geographic Placement with micro-offset only for overlapping identical coordinates
    const coordMap = new Map();
    matchingDeposits.forEach((dep) => {
        const coordKey = `${dep.lat.toFixed(3)}_${dep.lng.toFixed(3)}`;
        if (!coordMap.has(coordKey)) {
            coordMap.set(coordKey, []);
        }
        coordMap.get(coordKey).push(dep);
    });

    // Render screen-space fixed markers with Leaflet divIcon
    coordMap.forEach((items) => {
        const total = items.length;
        items.forEach((dep, index) => {
            let renderLat = dep.lat;
            let renderLng = dep.lng;

            // Apply slight micro-separation ONLY if multiple deposits share the exact same coordinates
            if (total > 1) {
                const angle = index * (2 * Math.PI / total);
                const microOffset = 0.035; // micro-separation to allow clean clicking
                renderLat = dep.lat + microOffset * Math.sin(angle);
                renderLng = dep.lng + (microOffset * Math.cos(angle)) / Math.max(0.2, Math.cos(dep.lat * Math.PI / 180));
            }

            const catalogItem = (Array.isArray(this.resourceCatalog) ? this.resourceCatalog.find(r => r.id === dep.resId) : null) || { icon: '⛏️', color: '#ffd700' };
            const icon = catalogItem.icon || '⛏️';
            const color = catalogItem.color || '#38bdf8';

            // Visual Yield Intensity Rating (Low/Medium/High/Massive)
            const depStr = `${dep.reserves || dep.reserve || ''} ${dep.name || ''} ${dep.status || ''}`.toUpperCase();
            let quantityTier = 'MEDIUM';
            if (depStr.includes('WORLD TOP') || depStr.includes('WORLD NO1') || depStr.includes('TOP EXPORTER') || depStr.includes('WORLD LEADER') || depStr.includes('SUPERGIANT') || depStr.includes('MASSIVE') || depStr.includes('TIER 1') || depStr.includes('TCF') || depStr.includes('1.8B') || depStr.includes('8.5B') || depStr.includes('2.4M')) {
                quantityTier = 'MASSIVE';
            } else if (depStr.includes('MAJOR') || depStr.includes('STRATEGIC') || depStr.includes('ACTIVE') || depStr.includes('890,000') || depStr.includes('650M') || depStr.includes('MILLION')) {
                quantityTier = 'HIGH';
            }

            let size = 26;
            let glowStyle = `0 0 8px ${color}`;
            let auraHtml = '';
            let badgeHtml = '';

            if (quantityTier === 'MASSIVE') {
                size = 28;
                glowStyle = `0 0 12px ${color}, 0 0 22px ${color}`;
                auraHtml = `<div style="position:absolute; inset:-5px; border-radius:50%; border:1.5px solid ${color}; animation: resMarkerPulse 1.8s infinite ease-in-out; pointer-events:none;"></div>`;
                badgeHtml = `<span style="position:absolute; top:-4px; right:-4px; background:#ef4444; color:#ffffff; font-size:8px; font-weight:900; line-height:1; width:12px; height:12px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 5px #ef4444; z-index:10; border:1px solid #fff;">★</span>`;
            } else if (quantityTier === 'HIGH') {
                size = 26;
                glowStyle = `0 0 10px ${color}`;
                auraHtml = `<div style="position:absolute; inset:-3px; border-radius:50%; border:1px solid ${color}; animation: resMarkerPulse 2.5s infinite ease-in-out; pointer-events:none;"></div>`;
                badgeHtml = `<span style="position:absolute; top:-3px; right:-3px; background:#eab308; color:#000; font-size:7px; font-weight:bold; width:10px; height:10px; border-radius:50%; display:flex; align-items:center; justify-content:center;">▲</span>`;
            }

            const halfSize = Math.round(size / 2);

            const markerHtml = `
                <div title="${dep.name} (${dep.country}) - ${quantityTier} YIELD" style="
                    position: relative;
                    background: rgba(11, 19, 35, 0.95);
                    border: 1.5px solid ${color};
                    border-radius: 50%;
                    width: ${size}px;
                    height: ${size}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: ${glowStyle};
                    font-size: 11px;
                    cursor: pointer;
                    transition: transform 0.2s ease;
                ">
                    ${auraHtml}
                    ${badgeHtml}
                    <span style="z-index:2; line-height:1;">${icon}</span>
                </div>
            `;

            const customIcon = L.divIcon({
                html: markerHtml,
                className: 'resource-deposit-compact-icon',
                iconSize: [size, size],
                iconAnchor: [halfSize, halfSize]
            });

            const marker = L.marker([renderLat, renderLng], { icon: customIcon });

            const reservesText = dep.reserves || dep.reserve || 'Authoritative In-situ Sovereign Assessment';
            const popupContent = `
                <div style="font-family:'Segoe UI', sans-serif; color:#f8fafc; width:250px; padding:8px; background:rgba(15,23,42,0.95); border:1px solid ${color}; border-radius:8px;">
                    <div style="font-size:13px; font-weight:bold; color:${color}; border-bottom:1px solid rgba(0,229,255,0.3); padding-bottom:4px; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                        <span>${icon}</span> <span>${(dep.name || '').toUpperCase()}</span>
                    </div>
                    <div style="font-size:11px; color:#cbd5e1; line-height:1.6; margin-bottom:8px;">
                        <div>🌍 Country: <strong style="color:#00e5ff;">${dep.country || dep.countryCode}</strong></div>
                        <div>⛏️ Commodity: <strong style="color:#facc15;">${(dep.resId || '').toUpperCase().replace(/_/g, ' ')}</strong></div>
                        <div>📊 Reserves: <strong style="color:#22c55e;">${reservesText}</strong></div>
                        <div>🏛️ Operator: <span style="color:#94a3b8;">${dep.operator || 'State Resource Authority'}</span></div>
                        <div>⚡ Status: <strong style="color:#a855f7;">${dep.status || 'Active Producing'}</strong></div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px; margin-top:8px;">
                        <button onclick="if(window.ResourceMinistryEngine) window.ResourceMinistryEngine.executeDirective('expand_facility', '${dep.resId}');" style="padding:6px 10px; background:rgba(34,197,94,0.25); border:1px solid #22c55e; color:#22c55e; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer; text-align:center;">
                            🏭 EXPAND FACILITY CAPACITY (+25%)
                        </button>
                        <button onclick="if(window.ResourceMinistryEngine) window.ResourceMinistryEngine.executeDirective('survey', '${dep.resId}');" style="padding:6px 10px; background:rgba(234,179,8,0.25); border:1px solid #eab308; color:#eab308; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer; text-align:center;">
                            ⛏️ DISPATCH GEOLOGICAL SURVEY
                        </button>
                        <button onclick="if(window.ResourceMinistryEngine) window.ResourceMinistryEngine.openModal('${dep.country || dep.countryCode}', 'matrix');" style="padding:6px 10px; background:rgba(0,229,255,0.25); border:1px solid #00e5ff; color:#00e5ff; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer; text-align:center;">
                            💎 AUDIT PROVEN IN-SITU LEDGER
                        </button>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { className: 'dark-theme-popup' });
            this.resourceDepositsLayer.addLayer(marker);
        });
    });
};

Game.Map.toggleResourceOverlay = function() {
    this.map = this.map || window.map;
    const box = document.getElementById('resource-filter-box') || (Game.dom && Game.dom.resFilterBox);
    const relBox = document.getElementById('relation-filter-box') || (Game.dom && Game.dom.relFilterBox);
    const btn = document.getElementById('btn-resource-overlay') || (Game.dom && Game.dom.btnResOverlay);
    const relBtn = document.getElementById('btn-relation-overlay') || (Game.dom && Game.dom.btnRelOverlay);

    const isCurrentlyVisible = box && !box.classList.contains('hidden') && box.style.display !== 'none';

    if (isCurrentlyVisible) {
        if (box) {
            box.classList.add('hidden');
            box.style.display = 'none';
        }
        if (this.activeResourceFilter && this.activeResourceFilter !== 'NONE') {
            if (btn) btn.classList.add('active');
        } else {
            if (btn) btn.classList.remove('active');
        }
    } else {
        if (box) {
            box.classList.remove('hidden');
            box.style.display = 'flex';
        }
        if (relBox) {
            relBox.classList.add('hidden');
            relBox.style.display = 'none';
        }
        if (relBtn) relBtn.classList.remove('active');

        const activeFilter = this.activeResourceFilter || 'COUNTRY';
        this.renderResourceDeposits(activeFilter);
    }
};

Game.Map.applyResourceMapFilter = function(resourceType) {
    this.activeResourceFilter = resourceType;
    const btn = document.getElementById('btn-resource-overlay') || (Game.dom && Game.dom.btnResOverlay);

    const isNone = (resourceType === 'NONE' || (Array.isArray(resourceType) && resourceType.length === 1 && resourceType[0] === 'NONE'));

    if (isNone) {
        if (btn) btn.classList.remove('active');
        if (this.resourceDepositsLayer) this.resourceDepositsLayer.clearLayers();
        if (this.renderCountryHubs) this.renderCountryHubs();
    } else {
        if (btn) btn.classList.add('active');
        if (this.renderResourceDeposits) {
            this.renderResourceDeposits(resourceType);
        }
    }

    // Auto-hide filter box after selection as requested by user
    const box = document.getElementById('resource-filter-box') || (Game.dom && Game.dom.resFilterBox);
    if (box) {
        box.classList.add('hidden');
        box.style.display = 'none';
    }

    if (!Game.geojsonLayer) return;
    if (resourceType === "NONE") { Game.geojsonLayer.resetStyle(); return; }

    Game.geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties || {};
        const normName = Game.getCountryId(props.ADMIN || props.name || props.NAME);
        const countryData = Game.locationsRegistry[normName];

        let hasResource = false;
        if (countryData) {
            if (countryData.economic) {
                hasResource = countryData.economic.some(h => 
                    (h.name && h.name.toLowerCase().includes(resourceType)) ||
                    (h.description && h.description.toLowerCase().includes(resourceType))
                );
            }
            if (!hasResource && countryData.secret) {
                hasResource = countryData.secret.some(h => 
                    (h.name && h.name.toLowerCase().includes(resourceType)) ||
                    (h.description && h.description.toLowerCase().includes(resourceType))
                );
            }
        }

        if (hasResource) layer.setStyle({ fillColor: '#ca8a04', fillOpacity: 0.85, color: '#ffffff', weight: 1.5 });
        else layer.setStyle({ fillColor: '#0f172a', fillOpacity: 0.15, color: 'rgba(255,255,255,0.05)', weight: 0.5 });
    });
};

Game.Map.toggleRelationOverlay = function() {
    if (Game.dom.relFilterBox.style.display === 'flex') {
        Game.dom.relFilterBox.style.display = 'none';
        Game.dom.btnRelOverlay.classList.remove('active');
        if (Game.geojsonLayer) Game.geojsonLayer.resetStyle();
    } else {
        Game.dom.relFilterBox.style.display = 'flex';
        Game.dom.resFilterBox.style.display = 'none';
        Game.dom.btnRelOverlay.classList.add('active');
        Game.dom.btnResOverlay.classList.remove('active');
    }
};

Game.Map.applyRelationsMapFilter = function(focusCountry) {
    if (!Game.geojsonLayer || !Game.state.relations[focusCountry]) return;
    if (focusCountry === "NONE") { Game.geojsonLayer.resetStyle(); return; }

    const relationsList = Game.state.relations[focusCountry];

    Game.geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties || {};
        const normName = Game.getCountryId(props.ADMIN || props.name || props.NAME);

        if (normName === focusCountry) {
            layer.setStyle({ fillColor: '#00e5ff', fillOpacity: 0.9, color: '#ffffff', weight: 2.0 });
            return;
        }

        const scoreData = relationsList[normName];
        let color = window.getCountryColor(normName); // নো-ডাটা দেশের জন্য ডিফল্ট ম্যাপ কালার রাখা হলো
        let opacity = 0.25; // নো-ডাটা দেশকে হালকা আবছা করে ব্লাক হোল হওয়া ঠেকানো হলো

        if (scoreData) {
            const score = scoreData.overall;
            opacity = 0.85;
            if (score > 60) color = '#22c55e'; // মিত্র (সবুজ)
            else if (score > 15) color = '#a3e635'; // বন্ধুত্বপূর্ণ (হা���কা সবুজ)
            else if (score < -60) color = '#ef4444'; // শত্রু (লাল)
            else if (score < -15) color = '#f97316'; // বৈরী (কমলা)
            else color = '#64748b'; // নিরপেক্ষ (স্লেট গ্রে)
        }
        layer.setStyle({ fillColor: color, fillOpacity: opacity, color: 'rgba(255,255,255,0.1)', weight: 0.5 });
    });
};

Game.Map.isResourceModeActive = false;

Game.Map.toggleResourceMode = function() {
    this.isResourceModeActive = !this.isResourceModeActive;
    const btnMode = document.getElementById('btn-resource-mode') || document.getElementById('btn-resource-overlay');
    
    if (this.isResourceModeActive) {
        // Mode ON: Hide Cities, Show Resources
        if (this.hubsGroupLayer) {
            this.hubsGroupLayer.clearLayers();
        }
        if (btnMode) {
            btnMode.classList.add('active');
            btnMode.style.borderColor = '#00e5ff';
            btnMode.style.boxShadow = '0 0 15px rgba(0, 229, 255, 0.8)';
            btnMode.style.background = 'rgba(0, 229, 255, 0.3)';
        }

        // Determine Mode A (Country First) vs Mode B (Resource/Global First)
        let filterVal = 'ALL';
        if (Game.currentActiveCountry) {
            filterVal = 'COUNTRY';
        } else if (this.selectedResourceChips && this.selectedResourceChips.size > 0) {
            filterVal = Array.from(this.selectedResourceChips);
        }
        this.renderResourceDeposits(filterVal);
    } else {
        // Mode OFF: Hide Resources, Restore Cities
        if (this.resourceDepositsLayer) {
            this.resourceDepositsLayer.clearLayers();
        }
        if (btnMode) {
            btnMode.classList.remove('active');
            btnMode.style.borderColor = '';
            btnMode.style.boxShadow = '';
            btnMode.style.background = '';
        }
        // Restore cities layer
        if (typeof this.renderGlobalCapitalHubs === 'function') {
            this.renderGlobalCapitalHubs();
        } else if (typeof this.renderCountryHubs === 'function') {
            this.renderCountryHubs();
        }
    }
};

Game.Map.toggleResourceFilterMenu = function() {
    const box = document.getElementById('resource-filter-box');
    if (!box) return;
    const isHidden = box.classList.contains('hidden') || box.style.display === 'none';
    if (isHidden) {
        box.classList.remove('hidden');
        box.style.display = 'flex';
    } else {
        box.classList.add('hidden');
        box.style.display = 'none';
    }
};

Game.Map.toggleMetricDropdown = function(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const drop = document.getElementById('map-metric-dropdown');
    if (!drop) return;
    const isHidden = drop.classList.contains('hidden') || drop.style.display === 'none';
    if (isHidden) {
        drop.classList.remove('hidden');
        drop.style.display = 'flex';

        // Sync quick stats inside dropdown from top status bar
        const cVal = document.getElementById('res-cash')?.textContent || '—';
        const pVal = document.getElementById('res-power')?.textContent || '—';
        const mVal = document.getElementById('res-manpower')?.textContent || '—';
        const eVal = document.getElementById('res-energy')?.textContent || '—';

        if (document.getElementById('dropdown-cash-val')) document.getElementById('dropdown-cash-val').textContent = cVal;
        if (document.getElementById('dropdown-power-val')) document.getElementById('dropdown-power-val').textContent = pVal;
        if (document.getElementById('dropdown-manpower-val')) document.getElementById('dropdown-manpower-val').textContent = mVal;
        if (document.getElementById('dropdown-energy-val')) document.getElementById('dropdown-energy-val').textContent = eVal;
    } else {
        drop.classList.add('hidden');
        drop.style.display = 'none';
    }
    if (window.updateGlobalBackButtonVisibility) {
        window.updateGlobalBackButtonVisibility();
    }
};

Game.Map.hideMetricDropdown = function() {
    const drop = document.getElementById('map-metric-dropdown');
    if (drop) {
        drop.classList.add('hidden');
        drop.style.display = 'none';
    }
    if (window.updateGlobalBackButtonVisibility) {
        window.updateGlobalBackButtonVisibility();
    }
};

// Global click-outside listener to dismiss top bar dropdown menu
document.addEventListener('click', function(e) {
    const metricDrop = document.getElementById('map-metric-dropdown');
    const metricTrigger = document.getElementById('top-bar-dropdown-trigger');
    const statusResources = document.querySelector('.status-resources');
    
    if (metricDrop && metricDrop.style.display !== 'none' && !metricDrop.classList.contains('hidden')) {
        if (!metricDrop.contains(e.target) && (!metricTrigger || !metricTrigger.contains(e.target)) && (!statusResources || !statusResources.contains(e.target))) {
            Game.Map.hideMetricDropdown();
        }
    }
});

Game.Map.activeMetric = 'NONE';

Game.Map.setMapMetric = function(metric) {
    this.activeMetric = metric;
    this.hideMetricDropdown();

    const labelEl = document.getElementById('active-metric-label');
    const legendEl = document.getElementById('map-metric-legend');
    const legendTitle = document.getElementById('legend-metric-title');
    const minValEl = document.getElementById('legend-min-val');
    const midValEl = document.getElementById('legend-mid-val');
    const maxValEl = document.getElementById('legend-max-val');

    if (metric === 'NONE' || !Game.geojsonLayer) {
        if (labelEl) labelEl.innerText = 'MAP METRIC: NONE';
        if (legendEl) { legendEl.classList.add('hidden'); legendEl.style.display = 'none'; }
        if (Game.geojsonLayer) Game.geojsonLayer.resetStyle();
        return;
    }

    const metricTitles = {
        'GDP': 'GLOBAL GDP DISTRIBUTION ($ USD)',
        'GDP_PER_CAPITA': 'GDP PER CAPITA ($/CAPITA)',
        'TREASURY': 'SOVEREIGN TREASURY RESERVES',
        'DEBT': 'NATIONAL DEBT TO GDP RATIO',
        'POPULATION': 'GLOBAL POPULATION DISTRIBUTION',
        'EMPLOYMENT': 'NATIONAL EMPLOYMENT RATE (%)',
        'RESOURCE_WEALTH': 'STRATEGIC RESOURCE WEALTH INDEX',
        'ENERGY': 'PRIMARY ENERGY GRID CAPACITY (GW)',
        'MILITARY': 'GLOBAL MILITARY POWER RATING',
        'STABILITY': 'GOVERNMENT STABILITY INDEX'
    };

    if (labelEl) labelEl.innerText = `MAP METRIC: ${metric.replace(/_/g, " ")}`;
    if (legendTitle) legendTitle.innerText = metricTitles[metric] || metric;
    if (legendEl) { legendEl.classList.remove('hidden'); legendEl.style.display = 'block'; }

    // Collect values for normalization
    const values = [];
    Game.geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties || {};
        const cName = props.ADMIN || props.name || props.NAME || '';
        const val = Game.Map.getCountryMetricValue(cName, metric);
        values.push(val);
    });

    const validVals = values.filter(v => typeof v === 'number' && !isNaN(v));
    const min = validVals.length > 0 ? Math.min(...validVals) : 0;
    const max = validVals.length > 0 ? Math.max(...validVals) : 100;
    const range = (max - min) || 1;

    const fmt = (v) => {
        if (v >= 1e12) return `$${(v/1e12).toFixed(1)}T`;
        if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
        if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
        if (v >= 1e3) return `${(v/1e3).toFixed(0)}K`;
        return `${v.toFixed(0)}`;
    };

    if (minValEl) minValEl.innerText = fmt(min);
    if (midValEl) midValEl.innerText = fmt(min + range/2);
    if (maxValEl) maxValEl.innerText = fmt(max);

    Game.geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties || {};
        const cName = props.ADMIN || props.name || props.NAME || '';
        const val = Game.Map.getCountryMetricValue(cName, metric);
        const norm = Math.max(0, Math.min(1, (val - min) / range));

        // Color scale: slate -> blue -> green -> gold -> crimson
        let color = '#1e293b';
        if (norm > 0.8) color = '#ef4444';
        else if (norm > 0.6) color = '#eab308';
        else if (norm > 0.4) color = '#059669';
        else if (norm > 0.2) color = '#0284c7';
        else if (norm > 0.05) color = '#1d4ed8';

        layer.setStyle({
            fillColor: color,
            fillOpacity: 0.65,
            color: 'rgba(255,255,255,0.7)',
            weight: 1.0
        });
    });
};

Game.Map.getCountryMetricValue = function(countryName, metric) {
    if (!countryName) return 0;
    const cId = Game.getCountryId ? Game.getCountryId(countryName) : countryName.toUpperCase();
    const econ = (Game.state && Game.state.economy && Game.state.economy[cId]) || {};
    const pop = (Game.state && Game.state.population && Game.state.population[cId]) || {};
    const loc = (Game.locationsRegistry && Game.locationsRegistry[cId]) || {};

    const gdp = econ.gdp || 50000000000;
    const popVal = pop.population_2015 || 15000000;

    switch (metric) {
        case 'GDP': return gdp;
        case 'GDP_PER_CAPITA': return gdp / (popVal || 1);
        case 'TREASURY': return econ.treasury || (gdp * 0.08);
        case 'DEBT': return (econ.debt || (gdp * 0.4)) / (gdp || 1);
        case 'POPULATION': return popVal;
        case 'EMPLOYMENT': return econ.employment_rate || 92;
        case 'RESOURCE_WEALTH': return (loc.resource_count || 5) * 1000 + (gdp * 0.001);
        case 'ENERGY': return econ.energy_capacity || 15;
        case 'MILITARY': return (econ.military_power || 65);
        case 'STABILITY': return (econ.stability || 75);
        default: return 0;
    }
};

// Bind Click Propagation Protections on Leaflet UI
if (typeof L !== 'undefined' && L.DomEvent) {
    const protectIds = [
        'top-status-bar', 'metric-selector-pill', 'map-metric-dropdown', 'map-metric-legend',
        'ui-right-controls', 'country-selection-bar', 'resource-filter-box', 'ui-bottom-navigation',
        'search-drawer', 'events-drawer', 'layers-drawer'
    ];
    setTimeout(() => {
        protectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                L.DomEvent.disableClickPropagation(el);
                L.DomEvent.disableScrollPropagation(el);
            }
        });
    }, 500);
}

Game.findCountryConfig = function(name) {
    if (!name) return null;
    return Game.countryLookup[Game.normalizeName(name)] || null;
};

window.loadGameCities = async function() {
    const files = ['cities.json'];
    Game.locationsRegistry = Game.locationsRegistry || {};
    
    try {
        const fetcher = window.fetchResilient || (async (f) => {
            const res = await fetch(f + '?v=' + Date.now());
            return res.ok ? await res.json() : null;
        });

        const results = await Promise.all(files.map(f => fetcher(f).catch(() => null)));
        
        results.forEach(data => {
            if (!data) return;
            let countriesArray = [];
            if (data.regions) {
                for (let reg in data.regions) { 
                    countriesArray = countriesArray.concat(data.regions[reg].countries || []); 
                }
            } else if (data.countries) {
                countriesArray = data.countries;
            } else {
                countriesArray = Array.isArray(data) ? data : Object.values(data);
            }
            countriesArray.forEach(c => { 
                if (c && c.name) {
                    Game.locationsRegistry[Game.getCountryId(c.name)] = c; 
                }
            });
        });
        console.log("Cities Database Sync Ready.");
    } catch (err) {
        console.warn("Cities Database Sync warning:", err);
    }

    try {
        if (Game.Map && typeof Game.Map.init === 'function') {
            Game.Map.init(); 
        }
    } catch (mErr) {
        console.error("Map init error:", mErr);
    }

    try {
        if (Game.DataLoader && typeof Game.DataLoader.loadAssets === 'function') {
            Game.DataLoader.loadAssets();
        }
    } catch (aErr) {
        console.error("DataLoader error:", aErr);
    }
};

function safeAppEngineBootstrap() {
    if (window.map && Game.init && typeof window.loadGameCities === 'function') {
        window.loadGameCities();
    } else {
        setTimeout(safeAppEngineBootstrap, 100);
    }
}
safeAppEngineBootstrap();
