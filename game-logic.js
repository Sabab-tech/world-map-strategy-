/* ============================================================================
   GLOBAL GEOPOLITICAL SIMULATOR - gameplay-logic master file (game-logic.js)
   ============================================================================ */

window.resources = { cash: 100000000, oil: 500000, steel: 100000, uranium: 500, manpower: 500000 };
window.resourceRates = { cash: 5000, oil: 200, steel: 100, uranium: 2, manpower: 150 };

// গেম ডেটা কন্টেনার
window.gameState = {
    population: {},
    economy: {}
};

// সংখ্যাকে সংক্ষেপ করার অত্যন্ত শক্তিশালী ও দৃষ্টিনন্দন ফরম্যাটার
function formatGameNumber(num) {
    if (num === null || num === undefined) return "N/A";
    const absVal = Math.abs(num);
    let suffix = "";
    let divisor = 1;

    if (absVal >= 1000000000000) {
        suffix = " Trillion";
        divisor = 1000000000000;
    } else if (absVal >= 1000000000) {
        suffix = " Billion";
        divisor = 1000000000;
    } else if (absVal >= 1000000) {
        suffix = " Million";
        divisor = 1000000;
    } else if (absVal >= 1000) {
        suffix = "K";
        divisor = 1000;
    }

    const formatted = (num / divisor).toFixed(1);
    return (num < 0 ? "-" : "") + "$" + formatted + suffix;
}

// জনসংখ্যা গণনা ফরম্যাটার (কারেন্সি সিম্বল ছাড়া)
function formatPopulationNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + " Billion";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + " Million";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return Math.floor(num).toString();
}

// ১. পবুলেশন ও ইকোনমি জেসন ডেটা লোডার এবং রিলেশন ড্রপডাউন সিঙ্ক
window.initializeWorldGameDatabase = function() {
    fetch('population.json?v=' + new Date().getTime())
        .then(res => res.json())
        .then(popData => {
            window.gameState.population = popData;
            console.log("Population Engine Database Sync Ready.");
            return fetch('economy.json?v=' + new Date().getTime());
        })
        .then(res => res.json())
        .then(econData => {
            window.gameState.economy = econData;
            console.log("Economy Engine Database Sync Ready.");

            // রিলেশন সিলেকশন বক্স ডাটা দিয়ে পূর্ণ করা
            const relSelector = document.getElementById('relation-selector');
            if (relSelector) {
                relSelector.innerHTML = '<option value="NONE">-- Select Focus Country --</option>';
                Object.keys(window.gameState.economy).sort().forEach(countryKey => {
                    const opt = document.createElement('option');
                    opt.value = countryKey;
                    opt.innerText = countryKey.replace(/_/g, " ");
                    relSelector.appendChild(opt);
                });
            }
        })
        .catch(err => {
            console.error("ডেটা ফাইল লোড করতে সমস্যা হয়েছে:", err);
        });
};

// ২. রিয়েল-টাইম আয়ের লুপ (প্রতি সেকেন্ডে একবার চলবে)
setInterval(function() {
    window.resources.cash += window.resourceRates.cash;
    window.resources.oil += window.resourceRates.oil;
    window.resources.steel += window.resourceRates.steel;
    window.resources.uranium += window.resourceRates.uranium;
    window.resources.manpower += window.resourceRates.manpower;

    const cashEl = document.getElementById('res-cash');
    const oilEl = document.getElementById('res-oil');
    const steelEl = document.getElementById('res-steel');
    const uraniumEl = document.getElementById('res-uranium');
    const manpowerEl = document.getElementById('res-manpower');

    if (cashEl) {
        cashEl.innerText = formatGameNumber(window.resources.cash).replace("$", "💵");
        cashEl.nextElementSibling.innerText = `+${formatGameNumber(window.resourceRates.cash)}/s`;
    }
    if (oilEl) {
        oilEl.innerText = formatPopulationNumber(window.resources.oil) + " BBL";
        oilEl.nextElementSibling.innerText = `+${window.resourceRates.oil}/s`;
    }
    if (steelEl) {
        steelEl.innerText = formatPopulationNumber(window.resources.steel) + " T";
        steelEl.nextElementSibling.innerText = `+${window.resourceRates.steel}/s`;
    }
    if (uraniumEl) {
        uraniumEl.innerText = window.resources.uranium.toString() + " KG";
        uraniumEl.nextElementSibling.innerText = `+${window.resourceRates.uranium}/s`;
    }
    if (manpowerEl) {
        manpowerEl.innerText = formatPopulationNumber(window.resources.manpower);
        manpowerEl.nextElementSibling.innerText = `+${window.resourceRates.manpower}/s`;
    }
}, 1000);

// ৩. কমান্ড হাব মোডাল ৩-লেয়ার কন্ট্রোল
window.toggleCommandHub = function(show) {
    const modal = document.getElementById('command-hub-modal');
    if (!modal) return;
    
    if (show) {
        modal.style.display = 'flex';
        const countryTitle = document.getElementById('modal-country-name');
        const selectedId = (window.currentActiveCountry || "").toUpperCase();

        if (selectedId && window.gameState.economy[selectedId]) {
            const econ = window.gameState.economy[selectedId];
            const pop = window.gameState.population[selectedId] || {};

            if (countryTitle) {
                countryTitle.innerText = `COMMAND HQ: ${selectedId.replace(/_/g, " ")} [${econ.status || 'Stable'}]`;
            }

            // ১ম লেয়ার ডাইনামিক ডেটা লোডিং
            document.getElementById('econ-gdp').innerText = `GDP: ${formatGameNumber(econ.gdp)} (Annual Growth: ${econ.gdp_growth || 0}%)`;
            document.getElementById('econ-debt').innerText = `National Debt: ${formatGameNumber(econ.debt)} (Unemployment: ${econ.unemployment_rate || 0}%)`;
            
            // পপুলেশন ডাইনামিক ডেটা
            const popPane = document.getElementById('tab-population');
            if (popPane && pop.population_2015) {
                popPane.innerHTML = `
                    <h3>👥 Demographic Data of ${selectedId.replace(/_/g, " ")}</h3>
                    <div class="info-grid">
                        <div class="info-card"><h4>Baseline Population</h4><span>${formatPopulationNumber(pop.population_2015)}</span></div>
                        <div class="info-card"><h4>Annual Population Growth</h4><span>${pop.annual_growth_rate || 0}%</span></div>
                        <div class="info-card"><h4>Birth Rate / Death Rate</h4><span>Births: ${pop.birth_rate}/1k | Deaths: ${pop.death_rate}/1k</span></div>
                        <div class="info-card"><h4>Gender Ratio</h4><span>Male: ${pop.male_percent}% | Female: ${pop.female_percent}%</span></div>
                    </div>
                `;
            }
        } else {
            if (countryTitle) countryTitle.innerText = "COMMAND HQ: GLOBAL MONITOR";
        }
    } else {
        modal.style.display = 'none';
    }
};

window.switchModalTab = function(event, tabId) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    event.currentTarget.classList.add('active');
    const activePane = document.getElementById(tabId);
    if (activePane) activePane.classList.add('active');
};

// ৪. ওশেনিয়া বা রিয়েল-টাইম রিসোর্স জেনারেটর ম্যাপ ফিল্টারিং লজিক
window.toggleResourceOverlay = function() {
    const filterBox = document.getElementById('resource-filter-box');
    const relationBox = document.getElementById('relation-filter-box');
    const btn = document.getElementById('btn-resource-overlay');

    if (filterBox.style.display === 'flex') {
        filterBox.style.display = 'none';
        btn.classList.remove('active');
        if (window.geojsonLayer) window.geojsonLayer.resetStyle();
    } else {
        filterBox.style.display = 'flex';
        relationBox.style.display = 'none';
        btn.classList.add('active');
        document.getElementById('btn-relation-overlay').classList.remove('active');
    }
};

window.applyResourceMapFilter = function(resourceType) {
    if (!window.geojsonLayer) return;
    if (resourceType === "NONE") {
        window.geojsonLayer.resetStyle();
        return;
    }

    window.geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties || {};
        const geoName = props.ADMIN || props.name || props.NAME || props.Country;
        const normName = window.normalizeName(geoName);
        const countryData = window.locationsRegistry[normName];

        let hasResource = false;
        if (countryData) {
            const checkText = JSON.stringify(countryData).toLowerCase();
            if (checkText.includes(resourceType.toLowerCase())) {
                hasResource = true;
            }
        }

        if (hasResource) {
            layer.setStyle({ fillColor: '#ca8a04', fillOpacity: 0.85, color: '#ffffff', weight: 1.5 });
        } else {
            layer.setStyle({ fillColor: '#0f172a', fillOpacity: 0.15, color: 'rgba(255,255,255,0.05)', weight: 0.5 });
        }
    });
};

// ৫. কূটনৈতিক সম্পর্ক ম্যাপ রেন্ডারিং
window.toggleRelationOverlay = function() {
    const filterBox = document.getElementById('relation-filter-box');
    const resourceBox = document.getElementById('resource-filter-box');
    const btn = document.getElementById('btn-relation-overlay');

    if (filterBox.style.display === 'flex') {
        filterBox.style.display = 'none';
        btn.classList.remove('active');
        if (window.geojsonLayer) window.geojsonLayer.resetStyle();
    } else {
        filterBox.style.display = 'flex';
        resourceBox.style.display = 'none';
        btn.classList.add('active');
        document.getElementById('btn-resource-overlay').classList.remove('active');
    }
};

window.applyRelationsMapFilter = function(focusCountry) {
    if (!window.geojsonLayer) return;
    if (focusCountry === "NONE") {
        window.geojsonLayer.resetStyle();
        return;
    }

    window.geojsonLayer.eachLayer(layer => {
        const props = layer.feature.properties || {};
        let geoName = props.ADMIN || props.name || props.NAME || props.Country;
        
        if (geoName === "West Bank" || geoName === "Gaza" || geoName === "Gaza Strip" || geoName === "Palestine") {
            geoName = "Palestine";
        }
        
        const normName = window.normalizeName(geoName).toUpperCase();

        if (normName === focusCountry) {
            layer.setStyle({ fillColor: '#00e5ff', fillOpacity: 0.9, color: '#ffffff', weight: 2.0 });
            return;
        }

        // সম্পর্কের ডাইনামিক নির্ধারণী অ্যালগরিদম
        let score = 0;
        if (focusCountry === "CHINA" && normName === "PAKISTAN") score = 90;
        else if (focusCountry === "CHINA" && normName === "INDIA") score = -45;
        else if (focusCountry === "UNITED_STATES_OF_AMERICA" && normName === "RUSSIA") score = -80;
        else if (focusCountry === "UNITED_STATES_OF_AMERICA" && normName === "UNITED_KINGDOM") score = 95;
        else {
            let hash = 0;
            const keyString = focusCountry + normName;
            for (let i = 0; i < keyString.length; i++) {
                hash = keyString.charCodeAt(i) + ((hash << 5) - hash);
            }
            score = (Math.abs(hash) % 200) - 100;
        }

        let color = '#475569';
        if (score > 60) color = '#22c55e';
        else if (score > 15) color = '#a3e635';
        else if (score < -60) color = '#ef4444';
        else if (score < -15) color = '#f97316';

        layer.setStyle({ fillColor: color, fillOpacity: 0.65, color: 'rgba(255,255,255,0.1)', weight: 0.5 });
    });
};

// ৬. সম্পূর্ণ ক্যাবিনেট হাব কন্ট্রোল লজিক
window.toggleMainCabinet = function(show) {
    const cabinet = document.getElementById('cabinet-full-window');
    if (!cabinet) return;
    if (show) {
        cabinet.style.display = 'flex';
    } else {
        cabinet.style.display = 'none';
    }
};

// ডম লোড হলে ডেটাবেজ ইনিশিয়ালাইজেশন
document.addEventListener("DOMContentLoaded", function() {
    window.initializeWorldGameDatabase();
});
