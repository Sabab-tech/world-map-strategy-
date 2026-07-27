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

    quests: [
        {
            id: 'q1',
            title: '🏛️ Executive Login Directive',
            desc: 'Claim daily executive treasury and manpower allocation.',
            reward: '💵 +$50M | 👥 +10,000 Manpower',
            rewardFn: () => {
                Game.resources.cash += 50000000;
                Game.resources.manpower += 10000;
            },
            progress: 1,
            target: 1,
            claimed: false
        },
        {
            id: 'q2',
            title: '🛡️ Regional Defense Garrison',
            desc: 'Deploy garrisons or station forces in regional hubs.',
            reward: '🛢️ +25,000 Oil | ⚙️ +5,000 Steel',
            rewardFn: () => {
                Game.resources.oil += 25000;
                Game.resources.steel += 5000;
            },
            progress: 1,
            target: 1,
            claimed: false
        },
        {
            id: 'q3',
            title: '🚔 Police Command Infrastructure',
            desc: 'Upgrade Police Directorate station grids or academies.',
            reward: '📈 +15 Stability | 💵 +$20M',
            rewardFn: () => {
                Game.resources.cash += 20000000;
            },
            progress: 1,
            target: 1,
            claimed: false
        },
        {
            id: 'q4',
            title: '🌐 Global Diplomatic Accord',
            desc: 'Form bilateral diplomatic or trade agreements.',
            reward: '☢️ +1,000 Uranium | 💵 +$100M',
            rewardFn: () => {
                Game.resources.uranium += 1000;
                Game.resources.cash += 100000000;
            },
            progress: 1,
            target: 1,
            claimed: false
        }
    ],

    renderDailyQuests() {
        const container = document.getElementById('quest-list-container');
        if (!container) return;
        container.innerHTML = '';

        this.quests.forEach(quest => {
            const item = document.createElement('div');
            item.style.cssText = `
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid ${quest.claimed ? '#22c55e' : 'rgba(212, 175, 55, 0.35)'};
                border-radius: 8px;
                padding: 12px 14px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
            `;

            const isReady = quest.progress >= quest.target;
            const btnHtml = quest.claimed
                ? `<button disabled style="padding: 6px 14px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; color: #22c55e; border-radius: 6px; font-size: 11px; font-weight: bold;">CLAIMED ✓</button>`
                : `<button id="btn-claim-${quest.id}" ${!isReady ? 'disabled' : ''} style="padding: 6px 14px; background: ${isReady ? 'linear-gradient(135deg, #ffd700, #b8860b)' : 'rgba(148, 163, 184, 0.2)'}; border: 1px solid ${isReady ? '#ffd700' : '#475569'}; color: ${isReady ? '#000' : '#94a3b8'}; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: ${isReady ? 'pointer' : 'not-allowed'}; box-shadow: ${isReady ? '0 0 10px rgba(255, 215, 0, 0.4)' : 'none'};">
                    ${isReady ? 'CLAIM REWARD' : 'IN PROGRESS'}
                   </button>`;

            item.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: bold; color: #f8fafc; margin-bottom: 3px; font-family: var(--font-title);">${quest.title}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px; font-family: var(--font-mono);">${quest.desc}</div>
                    <div style="font-size: 11px; color: #ffd700; font-weight: bold; font-family: var(--font-mono);">REWARD: ${quest.reward}</div>
                </div>
                <div>${btnHtml}</div>
            `;

            container.appendChild(item);

            if (!quest.claimed && isReady) {
                const claimBtn = item.querySelector(`#btn-claim-${quest.id}`);
                if (claimBtn) {
                    claimBtn.onclick = () => {
                        quest.claimed = true;
                        quest.rewardFn();
                        if (window.OMEGA_UI_ADAPTER && window.OMEGA_UI_ADAPTER.showAdvisePopup) {
                            window.OMEGA_UI_ADAPTER.showAdvisePopup("QUEST REWARD CLAIMED", `Directive accomplished: ${quest.title}. Resources credited!`);
                        }
                        Game.renderDailyQuests();
                    };
                }
            }
        });
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
        this.dom.resPower = document.getElementById('res-power');
        this.dom.resOil = document.getElementById('res-oil');
        this.dom.resSteel = document.getElementById('res-steel');
        this.dom.resUranium = document.getElementById('res-uranium');
        this.dom.resManpower = document.getElementById('res-manpower');
        this.dom.resEnergy = document.getElementById('res-energy');

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

        if (this.dom.hubModal) {
            this.dom.hubModal.addEventListener('click', (e) => {
                if (e.target === self.dom.hubModal) {
                    Game.Map.toggleCommandHub(false);
                }
            });
        }

        const tabButtons = document.querySelectorAll('#hub-tabs .tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                self.switchModalTab(e, e.currentTarget.getAttribute('data-tab'));
            });
        });

        // 📜 DAILY QUESTS BINDINGS
        const btnQuests = document.getElementById('btn-daily-quests');
        const modalQuests = document.getElementById('daily-quests-modal');
        const closeQuests = document.getElementById('btn-close-quests');

        if (btnQuests) {
            btnQuests.addEventListener('click', () => {
                if (modalQuests) {
                    modalQuests.style.display = 'block';
                    self.renderDailyQuests();
                }
            });
        }
        if (closeQuests) {
            closeQuests.addEventListener('click', () => {
                if (modalQuests) modalQuests.style.display = 'none';
            });
        }
        if (modalQuests) {
            modalQuests.addEventListener('click', (e) => {
                if (e.target === modalQuests) modalQuests.style.display = 'none';
            });
        }

        // ⏱️ SPEED CONTROLS
        const speedBtns = document.querySelectorAll('.speed-btn');
        speedBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                speedBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const speed = parseInt(e.currentTarget.getAttribute('data-speed'), 10);
                self.gameSpeed = speed;
                self.showNotification("GAME SPEED", `Simulation speed set to ${speed}x`, "info");
            });
        });

        // 🎛️ RIGHT QUICK DOCK BINDINGS
        const btnSearch = document.getElementById('btn-quick-search');
        const drawerSearch = document.getElementById('search-drawer');
        const btnCloseSearch = document.getElementById('btn-close-search');
        if (btnSearch && drawerSearch) {
            btnSearch.addEventListener('click', () => {
                const isVis = drawerSearch.style.display === 'flex';
                self.closeAllDrawers();
                if (!isVis) {
                    drawerSearch.style.display = 'flex';
                    document.getElementById('search-input').focus();
                    self.renderSearch("");
                }
            });
        }
        if (btnCloseSearch && drawerSearch) {
            btnCloseSearch.addEventListener('click', () => drawerSearch.style.display = 'none');
        }

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => self.renderSearch(e.target.value));
        }

        const btnEvents = document.getElementById('btn-quick-events');
        const drawerEvents = document.getElementById('events-drawer');
        const btnCloseEvents = document.getElementById('btn-close-events');
        if (btnEvents && drawerEvents) {
            btnEvents.addEventListener('click', () => {
                const isVis = drawerEvents.style.display === 'flex';
                self.closeAllDrawers();
                if (!isVis) {
                    drawerEvents.style.display = 'flex';
                    self.renderEventsFeed();
                }
            });
        }
        if (btnCloseEvents && drawerEvents) {
            btnCloseEvents.addEventListener('click', () => drawerEvents.style.display = 'none');
        }

        const btnQuickBuild = document.getElementById('btn-quick-build');
        if (btnQuickBuild) {
            btnQuickBuild.addEventListener('click', () => {
                self.closeAllDrawers();
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-projects');
            });
        }

        const btnQuickMilitary = document.getElementById('btn-quick-military');
        if (btnQuickMilitary) {
            btnQuickMilitary.addEventListener('click', () => {
                self.closeAllDrawers();
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-military');
            });
        }

        const btnLayers = document.getElementById('btn-quick-layers');
        const drawerLayers = document.getElementById('layers-drawer');
        const btnCloseLayers = document.getElementById('btn-close-layers');
        if (btnLayers && drawerLayers) {
            btnLayers.addEventListener('click', () => {
                const isVis = drawerLayers.style.display === 'flex';
                self.closeAllDrawers();
                if (!isVis) drawerLayers.style.display = 'flex';
            });
        }
        if (btnCloseLayers && drawerLayers) {
            btnCloseLayers.addEventListener('click', () => drawerLayers.style.display = 'none');
        }

        const layerOptBtns = document.querySelectorAll('.layer-opt-btn');
        layerOptBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                layerOptBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const layerType = e.currentTarget.getAttribute('data-layer');
                self.switchMapLayer(layerType);
            });
        });

        // ⚡ FAB COMMAND BUTTON & RADIAL MENU
        const fabBtn = document.getElementById('fab-command-btn');
        const fabMenu = document.getElementById('fab-radial-menu');
        if (fabBtn && fabMenu) {
            fabBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fabMenu.classList.toggle('active');
            });
            document.addEventListener('click', () => fabMenu.classList.remove('active'));
        }

        const fabItems = document.querySelectorAll('.fab-radial-item');
        fabItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                self.executeExecutiveAction(action);
            });
        });

        // 🗺️ COUNTRY CARD CLOSE BUTTON & ACTION BUTTONS
        const btnCloseCard = document.getElementById('btn-close-card');
        if (btnCloseCard) {
            btnCloseCard.addEventListener('click', () => self.closeCountryInfoCard());
        }

        const btnCardCab = document.getElementById('btn-card-cabinet');
        if (btnCardCab) {
            btnCardCab.addEventListener('click', () => {
                if (window.CountryIOS) window.CountryIOS.open(Game.currentActiveCountry, 2);
                else self.toggleMainCabinet(true);
            });
        }
        const btnCardDip = document.getElementById('btn-card-diplomacy');
        if (btnCardDip) {
            btnCardDip.addEventListener('click', () => {
                if (window.CountryIOS) window.CountryIOS.open(Game.currentActiveCountry, 6);
                else { Game.Map.toggleCommandHub(true); self.switchTabDirectly('tab-diplomacy'); }
            });
        }
        const btnCardMil = document.getElementById('btn-card-military');
        if (btnCardMil) {
            btnCardMil.addEventListener('click', () => {
                if (window.CountryIOS) window.CountryIOS.open(Game.currentActiveCountry, 3);
                else { Game.Map.toggleCommandHub(true); self.switchTabDirectly('tab-military'); }
            });
        }
        const btnCardEcon = document.getElementById('btn-card-economy');
        if (btnCardEcon) {
            btnCardEcon.addEventListener('click', () => {
                if (window.CountryIOS) window.CountryIOS.open(Game.currentActiveCountry, 4);
                else { Game.Map.toggleCommandHub(true); self.switchTabDirectly('tab-projects'); }
            });
        }
        const btnCardIntel = document.getElementById('btn-card-intel');
        if (btnCardIntel) {
            btnCardIntel.addEventListener('click', () => {
                if (window.CountryIOS) window.CountryIOS.open(Game.currentActiveCountry, 7);
                else { Game.Map.toggleCommandHub(true); self.switchTabDirectly('tab-internal'); }
            });
        }

        // 🏛️ BOTTOM NAVIGATION BINDINGS
        const btnPolitics = document.getElementById('btn-politics');
        if (btnPolitics) {
            btnPolitics.addEventListener('click', () => {
                self.setActiveNavButton('btn-politics');
                Game.Map.toggleCommandHub(false);
                self.toggleMainCabinet(true);
            });
        }
        const btnHq = document.getElementById('btn-hq');
        if (btnHq) {
            btnHq.addEventListener('click', () => {
                self.setActiveNavButton('btn-hq');
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
            });
        }
        const btnBuild = document.getElementById('btn-build');
        if (btnBuild) {
            btnBuild.addEventListener('click', () => {
                self.setActiveNavButton('btn-build');
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-projects');
            });
        }
        const btnMil = document.getElementById('btn-military-dock');
        if (btnMil) {
            btnMil.addEventListener('click', () => {
                self.setActiveNavButton('btn-military-dock');
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-military');
            });
        }
        const btnDip = document.getElementById('btn-diplomacy-dock');
        if (btnDip) {
            btnDip.addEventListener('click', () => {
                self.setActiveNavButton('btn-diplomacy-dock');
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-diplomacy');
            });
        }
        const btnResearch = document.getElementById('btn-research-dock');
        if (btnResearch) {
            btnResearch.addEventListener('click', () => {
                self.setActiveNavButton('btn-research-dock');
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-projects');
            });
        }
        const btnIntel = document.getElementById('btn-intel-dock');
        if (btnIntel) {
            btnIntel.addEventListener('click', () => {
                self.setActiveNavButton('btn-intel-dock');
                self.toggleMainCabinet(false);
                Game.Map.toggleCommandHub(true);
                self.switchTabDirectly('tab-internal');
            });
        }
    },

    gameSpeed: 1,

    closeAllDrawers() {
        const drawers = document.querySelectorAll('.omega-drawer');
        drawers.forEach(d => d.style.display = 'none');
    },

    showNotification(title, message, type = "info") {
        const stack = document.getElementById('notification-stack');
        if (!stack) return;
        const card = document.createElement('div');
        card.className = `notif-card ${type}`;
        card.innerHTML = `<strong style="color:#00e5ff;">${title}</strong><br><span>${message}</span>`;
        stack.prepend(card);

        while (stack.children.length > 3) {
            stack.removeChild(stack.lastChild);
        }

        setTimeout(() => {
            if (card.parentNode) card.remove();
        }, 4500);
    },

    updateCountryInfoCard(countryName) {
        const card = document.getElementById('country-info-card');
        if (!card) return;

        const config = Game.findCountryConfig(countryName);
        const id = Game.getCountryId(countryName);
        const econ = Game.state.economy[id] || { gdp: 500000000, debt: 100000000 };
        const pop = Game.state.population[id] || { population_2015: 50000000 };

        const elName = document.getElementById('card-country-name');
        if (elName) elName.innerText = countryName.toUpperCase();

        const elFlag = document.getElementById('card-country-flag');
        if (elFlag) elFlag.innerText = config && config.code ? `🚩 [${config.code}]` : "🌐";

        const elLeader = document.getElementById('card-country-leader');
        if (elLeader) elLeader.innerText = `Leader: Head of State`;

        const elGov = document.getElementById('card-country-gov');
        if (elGov) elGov.innerText = `Gov: Sovereign Nation`;

        const elPop = document.getElementById('card-stat-pop');
        if (elPop) elPop.innerText = this.formatPopulationNumber(pop.population_2015);

        const elGdp = document.getElementById('card-stat-gdp');
        if (elGdp) elGdp.innerText = this.formatGameNumber(econ.gdp);

        const elStab = document.getElementById('card-stat-stability');
        if (elStab) elStab.innerText = `92%`;

        const elRel = document.getElementById('card-stat-relations');
        if (elRel) elRel.innerText = `+45 Allied`;

        const elMil = document.getElementById('card-stat-mil');
        if (elMil) elMil.innerText = `PWR 82.4`;

        card.classList.add('active');
    },

    closeCountryInfoCard() {
        const card = document.getElementById('country-info-card');
        if (card) card.classList.remove('active');
    },

    renderSearch(query) {
        const container = document.getElementById('search-results-container');
        if (!container) return;

        const q = query.toLowerCase().trim();
        let html = '';

        const countries = Object.keys(Game.locationsRegistry || {});
        const matches = countries.filter(c => c.toLowerCase().includes(q)).slice(0, 8);

        if (matches.length === 0) {
            container.innerHTML = `<div style="font-size:11px; color:#64748b;">No matching nations found.</div>`;
            return;
        }

        matches.forEach(name => {
            const displayName = name.replace(/_/g, " ").toUpperCase();
            html += `<div class="search-item" onclick="Game.selectCountryByName('${name}')">
                🌐 <strong>${displayName}</strong>
            </div>`;
        });

        container.innerHTML = html;
    },

    renderEventsFeed() {
        const container = document.getElementById('events-feed-container');
        if (!container) return;

        container.innerHTML = `
            <div class="search-item" style="border-left:3px solid #ef4444;">
                <span style="color:#ef4444; font-weight:bold;">⚠ MILITARY ALERT</span><br>
                <span>Border skirmish reported along eastern demilitarized zone.</span>
            </div>
            <div class="search-item" style="border-left:3px solid #00e5ff;">
                <span style="color:#00e5ff; font-weight:bold;">🌐 DIPLOMATIC SUMMIT</span><br>
                <span>UN Resolution 402 passed on global trade stability.</span>
            </div>
            <div class="search-item" style="border-left:3px solid #ffd700;">
                <span style="color:#ffd700; font-weight:bold;">💰 ECONOMIC SHIFT</span><br>
                <span>Energy trade volume surges by +12.4% this quarter.</span>
            </div>
        `;
    },

    switchMapLayer(layerType) {
        this.showNotification("MAP SPECTRUM", `Switched layer to ${layerType.toUpperCase()}`, "info");
        if (layerType === "resources") {
            if (Game.Map && Game.Map.toggleResourceOverlay) Game.Map.toggleResourceOverlay();
        } else {
            if (Game.geojsonLayer) Game.geojsonLayer.resetStyle();
        }
    },

    executeExecutiveAction(action) {
        this.showNotification("EXECUTIVE DIRECTIVE", `Directive initiated: ${action.toUpperCase()}`, "info");
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
                const trend = self.dom.resCash.closest('.res-node')?.querySelector('.res-trend');
                if (trend) trend.innerText = `▲ +${self.formatGameNumber(self.resourceRates.cash)}/s`;
            }
            if (self.dom.resPower) {
                self.dom.resPower.innerText = "850 PP";
            }
            if (self.dom.resOil) {
                self.dom.resOil.innerText = self.formatPopulationNumber(self.resources.oil) + " BBL";
            }
            if (self.dom.resSteel) {
                self.dom.resSteel.innerText = self.formatPopulationNumber(self.resources.steel) + " T";
            }
            if (self.dom.resUranium) {
                self.dom.resUranium.innerText = self.resources.uranium.toString() + " KG";
            }
            if (self.dom.resManpower) {
                self.dom.resManpower.innerText = self.formatPopulationNumber(self.resources.manpower);
            }
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
    if (typeof window.getCountryColorOverride === "function") {
        return window.getCountryColorOverride(name);
    }
    if (!name) return "#2c4235";
    const norm = name.toLowerCase().trim();
    const biomeMap = {
        "russia": "#283f34", "canada": "#2c4839", "greenland": "#3d5348", "sweden": "#2d4438",
        "saudi arabia": "#69533a", "egypt": "#6e583e", "algeria": "#6b543b", "australia": "#664d38",
        "brazil": "#1b4330", "indonesia": "#1a4734", "democratic republic of the congo": "#1a422f",
        "united states": "#384e3d", "china": "#3c4d38", "france": "#324838", "germany": "#314737"
    };
    if (biomeMap[norm]) return biomeMap[norm];
    let hash = 0;
    for (let i = 0; i < norm.length; i++) hash = norm.charCodeAt(i) + ((hash << 5) - hash);
    const satellitePalette = ["#2d4235", "#384e3d", "#4d4a36", "#5e4c36", "#1e4231", "#364a3d", "#4a523f", "#33453a"];
    return satellitePalette[Math.abs(hash) % satellitePalette.length];
};

// গ্লোবাল Escape কী হ্যান্ডলার - যেকোনো খোলা উইন্ডো/মোডাল বন্ধ করার জন্য
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        // ১. অ্যাডভাইজারি পপআপ ক্লোজ
        const advise = document.querySelector(".om-advise-popup");
        if (advise) { advise.remove(); return; }
        // ২. কাস্টম ফ্যাসিলিটি মোডাল ক্লোজ
        const modal = document.querySelector(".om-modal-overlay");
        if (modal) { modal.remove(); return; }
        // ৩. কান্ট্রি কমান্ড হাব মোডাল ক্লোজ
        if (Game.dom && Game.dom.hubModal && Game.dom.hubModal.style.display !== "none") {
            Game.Map.toggleCommandHub(false);
            return;
        }
        // ৪. ফুল স্টেট ক্যাবিনেট উইন্ডো ক্লোজ
        const win = document.getElementById("cabinet-full-window");
        if (win && (win.style.display !== "none" && win.style.opacity !== "0")) {
            Game.toggleMainCabinet(false);
            return;
        }
    }
});

window.isCoastalCountry = function(name) { return false; };

window.oceanLabelsList = [
    { name: "NORTH ATLANTIC OCEAN", lat: 32, lng: -42, fontSize: 13 },
    { name: "SOUTH ATLANTIC OCEAN", lat: -22, lng: -18, fontSize: 12 },
    { name: "PACIFIC OCEAN", lat: 0, lng: -135, fontSize: 14 },
    { name: "INDIAN OCEAN", lat: -18, lng: 78, fontSize: 13 },
    { name: "ARCTIC OCEAN", lat: 82, lng: 0, fontSize: 13 },
    { name: "HUDSON BAY", lat: 60, lng: -85, fontSize: 11 },
    { name: "BAFFIN BAY", lat: 73, lng: -65, fontSize: 10 },
    { name: "GULF OF MEXICO", lat: 25, lng: -90, fontSize: 11 },
    { name: "CARIBBEAN SEA", lat: 15, lng: -75, fontSize: 11 },
    { name: "MEDITERRANEAN SEA", lat: 35, lng: 18, fontSize: 11 }
];

document.addEventListener("DOMContentLoaded", () => Game.init());
