/* ============================================================================
   MAP ENGINE 1: UI CONTROLLER, DOM CACHE & TICKERS (map-engine-1.js)
   ============================================================================ */

window.Game = {
    resources: { 
        cash: 100000000, 
        oil: 500000, 
        steel: 100000, 
        uranium: 500, 
        manpower: 500000 
    },
    resourceRates: { 
        cash: 5000, 
        oil: 200, 
        steel: 100, 
        uranium: 2, 
        manpower: 150 
    },
    state: {
        population: {},
        economy: {},
        relations: {}
    },

    locationsRegistry: {},
    currentActiveCountry: null,
    geojsonLayer: null,
    selectedLayer: null,
    hubsGroupLayer: null,
    countryLookup: {},
    countryLabels: [],
    map: null,
    dom: {},

    cacheDOM() {
        this.dom.resCash = document.getElementById('res-cash');
        this.dom.resOil = document.getElementById('res-oil');
        this.dom.resSteel = document.getElementById('res-steel');
        this.dom.resUranium = document.getElementById('res-uranium');
        this.dom.resManpower = document.getElementById('res-manpower');

        this.dom.resFilterBox = document.getElementById('resource-filter-box');
        this.dom.relFilterBox = document.getElementById('relation-filter-box');
        
        this.dom.resSelector = document.getElementById('resource-selector');
        this.dom.relSelector = document.getElementById('relation-selector');

        this.dom.btnResOverlay = document.getElementById('btn-resource-overlay');
        this.dom.btnRelOverlay = document.getElementById('btn-relation-overlay');
        this.dom.btnCabinet = document.getElementById('btn-main-cabinet');
        
        this.dom.hubModal = document.getElementById('command-hub-modal');
        this.dom.cabinetWindow = document.getElementById('cabinet-full-window');
        this.dom.modalCountryName = document.getElementById('modal-country-name');
        
        this.dom.econGdp = document.getElementById('econ-gdp');
        this.dom.econDebt = document.getElementById('econ-debt');
        this.dom.popPane = document.getElementById('tab-population');
        this.dom.dipList = document.getElementById('diplomacy-list');
    },

    bindEvents() {
        const self = this;

        if (this.dom.btnResOverlay) {
            this.dom.btnResOverlay.addEventListener('click', () => Game.Map.toggleResourceOverlay());
        }
        if (this.dom.btnRelOverlay) {
            this.dom.btnRelOverlay.addEventListener('click', () => Game.Map.toggleRelationOverlay());
        }
        if (this.dom.btnCabinet) {
            this.dom.btnCabinet.addEventListener('click', () => self.toggleMainCabinet(true));
        }

        const closeCab = document.getElementById('btn-close-cabinet');
        if (closeCab) {
            closeCab.addEventListener('click', () => self.toggleMainCabinet(false));
        }

        const closeHub = document.getElementById('btn-close-hub');
        if (closeHub) {
            closeHub.addEventListener('click', () => Game.Map.toggleCommandHub(false));
        }

        const tabButtons = document.querySelectorAll('#hub-tabs .tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                self.switchModalTab(e, e.currentTarget.getAttribute('data-tab'));
            });
        });

        // এইচটিএমএল থেকে বাটন ডকটি মুছে ফেলায় কোড যেন ক্র্যাশ না করে সে জন্য নিরাপত্তা চেক বসানো হলো
        const btnHome = document.getElementById('btn-home');
        if (btnHome) {
            btnHome.addEventListener('click', () => {
                self.setActiveNavButton('btn-home');
                Game.Map.toggleCommandHub(false);
                if (window.map) window.map.setView([20, 0], 2.5);
            });
        }
        const btnPolitics = document.getElementById('btn-politics');
        if (btnPolitics) {
            btnPolitics.addEventListener('click', () => {
                self.setActiveNavButton('btn-politics');
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-internal');
            });
        }
        const btnBuild = document.getElementById('btn-build');
        if (btnBuild) {
            btnBuild.addEventListener('click', () => {
                self.setActiveNavButton('btn-build');
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-projects');
            });
        }
        const btnHq = document.getElementById('btn-hq');
        if (btnHq) {
            btnHq.addEventListener('click', () => {
                self.setActiveNavButton('btn-hq');
                Game.Map.toggleCommandHub(true);
            });
        }
        const btnMil = document.getElementById('btn-military-dock');
        if (btnMil) {
            btnMil.addEventListener('click', () => {
                self.setActiveNavButton('btn-military-dock');
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-military');
            });
        }
        const btnDip = document.getElementById('btn-diplomacy-dock');
        if (btnDip) {
            btnDip.addEventListener('click', () => {
                self.setActiveNavButton('btn-diplomacy-dock');
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-diplomacy');
            });
        }
        const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', () => {
                self.setActiveNavButton('btn-settings');
                alert("Settings panel development in progress.");
            });
        }
    },

    formatGameNumber(num) {
        if (num === null || num === undefined) return "N/A";
        const absVal = Math.abs(num);
        let suffix = "", divisor = 1;

        if (absVal >= 1000000000000) { suffix = " Trillion"; divisor = 1000000000000; }
        else if (absVal >= 1000000000) { suffix = " Billion"; divisor = 1000000000; }
        else if (absVal >= 1000000) { suffix = " Million"; divisor = 1000000; }
        else if (absVal >= 1000) { suffix = "K"; divisor = 1000; }

        return (num < 0 ? "-" : "") + "$" + (num / divisor).toFixed(1) + suffix;
    },

    formatPopulationNumber(num) {
        if (num >= 1000000000) return (num / 1000000000).toFixed(2) + " Billion";
        if (num >= 1000000) return (num / 1000000).toFixed(1) + " Million";
        if (num >= 1000) return (num / 1000).toFixed(1) + "K";
        return Math.floor(num).toString();
    },

    getCountryId(name) {
        if (!name) return "";
        return name.toUpperCase().replace(/[-\s]/g, "_").replace(/[^A-Z0-9_]/g, "").trim();
    },

    normalizeName(name) {
        return (name || "").toLowerCase().replace(/[^a-z]/g, "").trim();
    },

    getGameFriendlyName(name) {
        if (!name) return "";
        const mapping = {
            "democratic republic of the congo": "DR Congo",
            "united states of america": "USA",
            "united states": "USA", // আমেরিকার নাম 'USA' ফিক্স করা হলো
            "united kingdom": "UK",
            "united arab emirates": "UAE"
        };
        return mapping[name.toLowerCase().trim()] || name;
    },

    getFontSizeForCountry(config, zoom) {
        var importance = (config && config.importance) ? config.importance : 3;
        var baseSize = 9;
        if (importance >= 5) baseSize = zoom * 3.2;
        else if (importance === 4) baseSize = zoom * 2.6;
        else baseSize = zoom * 1.8;
        return Math.max(7.5, Math.min(baseSize, 22));
    },

    toggleMainCabinet(show) {
        if (this.dom.cabinetWindow) {
            this.dom.cabinetWindow.style.display = show ? 'flex' : 'none';
        }
    },

    setActiveNavButton(buttonId) {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(buttonId);
        if (activeBtn) activeBtn.classList.add('active');
    },

    switchModalTab(event, tabId) {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => btn.classList.remove('active'));
        const tabPanes = document.querySelectorAll('.tab-pane');
        tabPanes.forEach(pane => pane.classList.remove('active'));
        event.currentTarget.classList.add('active');
        const activePane = document.getElementById(tabId);
        if (activePane) activePane.classList.add('active');
    },

    switchTabDirectly(tabId) {
        const tabBtn = document.querySelector(`#hub-tabs .tab-btn[data-tab="${tabId}"]`);
        if (tabBtn) tabBtn.click();
    },

    init() {
        this.cacheDOM();
        this.bindEvents();

        const self = this;
        setInterval(function() {
            self.resources.cash += self.resourceRates.cash;
            self.resources.oil += self.resourceRates.oil;
            self.resources.steel += self.resourceRates.steel;
            self.resources.uranium += self.resourceRates.uranium;
            self.resources.manpower += self.resourceRates.manpower;

            if (self.dom.resCash) {
                self.dom.resCash.innerText = self.formatGameNumber(self.resources.cash).replace("$", "💵");
                self.dom.resCash.nextElementSibling.innerText = `+${self.formatGameNumber(self.resourceRates.cash)}/s`;
            }
            if (self.dom.resOil) self.dom.resOil.innerText = self.formatPopulationNumber(self.resources.oil) + " BBL";
            if (self.dom.resSteel) self.dom.resSteel.innerText = self.formatPopulationNumber(self.resources.steel) + " T";
            if (self.dom.resUranium) self.dom.resUranium.innerText = self.resources.uranium.toString() + " KG";
            if (self.dom.resManpower) self.dom.resManpower.innerText = self.formatPopulationNumber(self.resources.manpower);
        }, 1000);

        console.log("Game Core Engine initialized.");
    }
};

window.bounds = L.latLngBounds(L.latLng(-60, -180), L.latLng(85, 180));

// ============================================================================
// ম্যাপ এবং হাব লেয়ার ইনিশিয়ালাইজেশন কোড
// ============================================================================
window.map = L.map('map', {
    maxBounds: window.bounds,
    maxBoundsViscosity: 1.0,
    minZoom: 2.1,
    maxZoom: 8,
    zoomControl: false
}).setView([20, 0], 2.5);

window.hubsGroupLayer = L.layerGroup().addTo(window.map);

window.getCountryColor = function(name) {
    if (!name) return "#1e293b";
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    // ২৪টি উজ্জ্বল, চমৎকার লাইট ও ফ্ল্যাট পেস্টেল কালারের প্যালেট (যাতে ম্যাপ গ্লো করে)
    const colors = [
        "#557A46", "#C28C5F", "#A14C50", "#205E40", "#134460", "#A68C53", 
        "#B87F65", "#7C4DFF", "#00B0FF", "#4CAF50", "#FF9100", "#00E676", 
        "#EC407A", "#AB47BC", "#26A69A", "#5C6BC0", "#8D6E63", "#9CCC65", 
        "#29B6F6", "#FFD54F", "#82B1FF", "#E040FB", "#A1887F", "#26C6DA"
    ];
    return colors[Math.abs(hash) % colors.length];
};

window.isCoastalCountry = function(name) { return false; };

window.oceanLabelsList = [
    { name: "NORTH ATLANTIC OCEAN", lat: 30, lng: -40, fontSize: 13 },
    { name: "SOUTH ATLANTIC OCEAN", lat: -25, lng: -15, fontSize: 12 },
    { name: "INDIAN OCEAN", lat: -20, lng: 80, fontSize: 13 },
    { name: "PACIFIC OCEAN", lat: 0, lng: -140, fontSize: 14 }
];

document.addEventListener("DOMContentLoaded", () => Game.init());
