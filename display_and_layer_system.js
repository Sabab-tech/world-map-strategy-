/**
 * OMEGA AAA DISPLAY & LAYER MANAGEMENT SYSTEM (v2.0)
 * AAA UI Redesign Protocol & Orientation Management
 */

(function() {
    'use strict';

    /* ============================================================================
     * 1. CENTRALIZED DISPLAY MANAGER (Orientation, Viewport & Safe Areas)
     * ============================================================================ */
    window.DisplayManager = {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        orientation: 'landscape', // 'landscape' | 'portrait'
        devicePixelRatio: window.devicePixelRatio || 1,
        listeners: [],

        init() {
            this.updateViewport();
            window.addEventListener('resize', () => this.handleResize());
            window.addEventListener('orientationchange', () => this.handleResize());
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', () => this.handleResize());
            }

            console.log('[DisplayManager] Initialized:', this.orientation, `${this.viewportWidth}x${this.viewportHeight}`);
        },

        updateViewport() {
            this.viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
            this.viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            this.orientation = this.viewportWidth >= this.viewportHeight ? 'landscape' : 'portrait';

            // Set CSS Custom Properties for pixel-perfect mobile viewports
            document.documentElement.style.setProperty('--vw', `${this.viewportWidth * 0.01}px`);
            document.documentElement.style.setProperty('--vh', `${this.viewportHeight * 0.01}px`);

            // Apply attributes to body
            document.body.setAttribute('data-orientation', this.orientation);
            if (this.orientation === 'landscape') {
                document.body.classList.add('is-landscape');
                document.body.classList.remove('is-portrait');
            } else {
                document.body.classList.add('is-portrait');
                document.body.classList.remove('is-landscape');
            }

            // Hide rotate warning immediately if landscape, or adapt layout
            const rotateWarn = document.getElementById('rotate-warning');
            if (rotateWarn) {
                if (this.orientation === 'landscape') {
                    rotateWarn.style.display = 'none';
                }
            }
        },

        handleResize() {
            this.updateViewport();

            // Notify Leaflet Map if present
            const mapInst = window.map || (window.Game && window.Game.Map && window.Game.Map.map);
            if (mapInst && typeof mapInst.invalidateSize === 'function') {
                mapInst.invalidateSize();
            }

            // Dispatch global event
            window.dispatchEvent(new CustomEvent('display:resize', {
                detail: {
                    width: this.viewportWidth,
                    height: this.viewportHeight,
                    orientation: this.orientation
                }
            }));

            // Update Diagnostic HUD if active
            if (window.OmegaDiagnostic) {
                window.OmegaDiagnostic.updateBadge();
            }
        }
    };

    /* ============================================================================
     * 2. FUTURE-PROOF DATA BINDING SYSTEM (Placeholder vs Live Mode)
     * ============================================================================ */
    window.OmegaDataBinding = {
        getEconomyMetrics() {
            const hasGame = window.Game && window.resources;
            const cash = hasGame && window.resources.cash !== undefined ? window.resources.cash : 51780572;
            const formattedCash = window.formatGameNumber ? window.formatGameNumber(cash) : '$51.78M';

            return {
                isLive: !!hasGame,
                gdp: '$1.42 Trillion',
                budget: '$120.5 Billion',
                treasury: formattedCash,
                income: '+$4.20B / mo',
                expense: '-$3.15B / mo',
                inflation: '2.1% Annual',
                growth: '+5.8% GDP YoY',
                debt: '$320.5B (22.5% GDP)',
                reserve: '$42.8B Gold & FX'
            };
        },

        getResourceMetrics(category = 'ALL') {
            const hasGame = window.Game && window.resources;

            const allResources = {
                energy: [
                    { id: 'oil', name: 'Crude Oil', value: '4.25M bbl', trend: '+12K/d', icon: '🛢️' },
                    { id: 'gas', name: 'Natural Gas', value: '18.5B m³', trend: '+45M/d', icon: '🔥' },
                    { id: 'coal', name: 'Thermal Coal', value: '120M t', trend: '+1.2M/t', icon: '🪨' },
                    { id: 'power', name: 'Grid Electricity', value: '45.2 GW', trend: '+1.5 GW', icon: '⚡' }
                ],
                strategic: [
                    { id: 'gold', name: 'Gold Bullion', value: '2,450 t', trend: '+12 t/m', icon: '🥇' },
                    { id: 'uranium', name: 'Uranium-235', value: '18.5K t', trend: '+250 t/y', icon: '☢️' },
                    { id: 'rare_earth', name: 'Rare Earth Metals', value: '85.2K t', trend: '+1.5K t', icon: '💎' },
                    { id: 'steel', name: 'Structural Steel', value: '450M t', trend: '+5.2M t', icon: '🏗️' }
                ],
                industrial: [
                    { id: 'grain', name: 'Wheat & Grain', value: '120M t', trend: '+2.5M t', icon: '🌾' },
                    { id: 'water', name: 'Fresh Water', value: '98% Capacity', trend: 'Stable', icon: '💧' },
                    { id: 'fertilizer', name: 'NPK Fertilizer', value: '25.4M t', trend: '+800K t', icon: '🧪' },
                    { id: 'titanium', name: 'Aerospace Titanium', value: '14.2K t', trend: '+120 t', icon: '⚙️' }
                ]
            };

            if (category === 'ENERGY') return allResources.energy;
            if (category === 'STRATEGIC') return allResources.strategic;
            if (category === 'INDUSTRIAL') return allResources.industrial;

            return [...allResources.energy, ...allResources.strategic, ...allResources.industrial];
        }
    };

    /* ============================================================================
     * 3. DYNAMIC INFORMATION SWITCH SYSTEM (SLIM TOP BAR CONTROL)
     * ============================================================================ */
    window.OmegaInfoSwitch = {
        activeMode: 'ECONOMY', // 'ECONOMY' | 'RESOURCES'
        activeResourceCategory: 'ENERGY', // 'ENERGY' | 'STRATEGIC' | 'INDUSTRIAL'

        setMode(mode) {
            this.activeMode = mode;
            this.render();
        },

        setResourceCategory(cat) {
            this.activeResourceCategory = cat;
            this.render();
        },

        render() {
            const feedContainer = document.getElementById('slim-info-feed-container');
            const modeSelect = document.getElementById('info-mode-selector');
            if (!feedContainer) return;

            if (modeSelect) modeSelect.value = this.activeMode;

            if (this.activeMode === 'ECONOMY') {
                const econ = window.OmegaDataBinding.getEconomyMetrics();
                feedContainer.innerHTML = `
                    <div class="slim-stat-item" title="Gross Domestic Product">
                        <span class="slim-stat-lbl">GDP</span>
                        <span class="slim-stat-val gold">${econ.gdp}</span>
                    </div>
                    <div class="slim-stat-item" title="State Treasury Reserves">
                        <span class="slim-stat-lbl">TREASURY</span>
                        <span class="slim-stat-val cyan">${econ.treasury}</span>
                    </div>
                    <div class="slim-stat-item" title="Monthly Net Income">
                        <span class="slim-stat-lbl">INCOME</span>
                        <span class="slim-stat-val green">${econ.income}</span>
                    </div>
                    <div class="slim-stat-item" title="Monthly Expense">
                        <span class="slim-stat-lbl">EXPENSE</span>
                        <span class="slim-stat-val red">${econ.expense}</span>
                    </div>
                    <div class="slim-stat-item" title="Inflation Rate">
                        <span class="slim-stat-lbl">INFLATION</span>
                        <span class="slim-stat-val orange">${econ.inflation}</span>
                    </div>
                    <div class="slim-stat-item" title="Annual Growth">
                        <span class="slim-stat-lbl">GROWTH</span>
                        <span class="slim-stat-val green">${econ.growth}</span>
                    </div>
                `;
            } else {
                const resList = window.OmegaDataBinding.getResourceMetrics(this.activeResourceCategory);
                let resHtml = `
                    <div class="slim-res-subcat-picker">
                        <select onchange="window.OmegaInfoSwitch.setResourceCategory(this.value);" class="slim-dropdown-mini">
                            <option value="ENERGY" ${this.activeResourceCategory === 'ENERGY' ? 'selected' : ''}>⚡ ENERGY</option>
                            <option value="STRATEGIC" ${this.activeResourceCategory === 'STRATEGIC' ? 'selected' : ''}>💎 STRATEGIC</option>
                            <option value="INDUSTRIAL" ${this.activeResourceCategory === 'INDUSTRIAL' ? 'selected' : ''}>🌾 AGRI & IND</option>
                        </select>
                    </div>
                `;

                resList.slice(0, 4).forEach(item => {
                    resHtml += `
                        <div class="slim-stat-item" title="${item.name}">
                            <span class="slim-stat-lbl">${item.icon} ${item.name.toUpperCase()}</span>
                            <span class="slim-stat-val cyan">${item.value}</span>
                            <span class="slim-stat-sub green">${item.trend}</span>
                        </div>
                    `;
                });

                feedContainer.innerHTML = resHtml;
            }
        },

        toggleDetailDrawer() {
            const drawer = document.getElementById('info-switch-detail-drawer');
            if (!drawer) return;

            if (drawer.style.display === 'none' || !drawer.style.display) {
                this.renderDetailDrawer();
                drawer.style.display = 'block';
            } else {
                drawer.style.display = 'none';
            }
        },

        renderDetailDrawer() {
            const drawer = document.getElementById('info-switch-detail-drawer');
            if (!drawer) return;

            if (this.activeMode === 'ECONOMY') {
                const econ = window.OmegaDataBinding.getEconomyMetrics();
                drawer.innerHTML = `
                    <div style="padding:16px; background:rgba(2,11,20,0.95); border:1px solid var(--omega-neon); border-radius:12px; color:#fff; font-family:'Share Tech Mono',monospace;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,229,255,0.3); padding-bottom:8px; margin-bottom:12px;">
                            <span style="font-weight:bold; color:#00e5ff;">📊 SOVEREIGN ECONOMIC MATRIX</span>
                            <button onclick="document.getElementById('info-switch-detail-drawer').style.display='none';" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer;">✕ CLOSE</button>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px;">
                            <div>GDP TOTAL: <strong style="color:#ffd700;">${econ.gdp}</strong></div>
                            <div>ANNUAL BUDGET: <strong style="color:#00e5ff;">${econ.budget}</strong></div>
                            <div>STATE TREASURY: <strong style="color:#22c55e;">${econ.treasury}</strong></div>
                            <div>MONTHLY REVENUE: <strong style="color:#22c55e;">${econ.income}</strong></div>
                            <div>MONTHLY EXPENSE: <strong style="color:#ef4444;">${econ.expense}</strong></div>
                            <div>INFLATION INDEX: <strong style="color:#f97316;">${econ.inflation}</strong></div>
                            <div>REAL GDP GROWTH: <strong style="color:#22c55e;">${econ.growth}</strong></div>
                            <div>NATIONAL DEBT: <strong style="color:#cbd5e1;">${econ.debt}</strong></div>
                        </div>
                    </div>
                `;
            } else {
                const allRes = window.OmegaDataBinding.getResourceMetrics('ALL');
                let itemsHtml = '';
                allRes.forEach(r => {
                    itemsHtml += `<div style="padding:6px; background:rgba(255,255,255,0.05); border-radius:6px;">${r.icon} <strong>${r.name}</strong>: ${r.value} (${r.trend})</div>`;
                });

                drawer.innerHTML = `
                    <div style="padding:16px; background:rgba(2,11,20,0.95); border:1px solid var(--omega-neon); border-radius:12px; color:#fff; font-family:'Share Tech Mono',monospace;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,229,255,0.3); padding-bottom:8px; margin-bottom:12px;">
                            <span style="font-weight:bold; color:#00e5ff;">💎 STRATEGIC RESOURCE RESERVES</span>
                            <button onclick="document.getElementById('info-switch-detail-drawer').style.display='none';" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer;">✕ CLOSE</button>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:11px;">
                            ${itemsHtml}
                        </div>
                    </div>
                `;
            }
        }
    };

    /* ============================================================================
     * 4. AAA CONTEXT STACK LAYER MANAGER (Root Screen Isolation System)
     * ============================================================================ */
    window.OmegaLayerManager = {
        currentLayer: 0,
        layerStack: [0],
        activeMinistryId: null,

        setLayer(layerNum, data = {}, skipPush = false) {
            console.log(`[AAA LAYER ENGINE] Transitioning to Layer ${layerNum}`, data);
            this.currentLayer = layerNum;

            if (!skipPush) {
                if (this.layerStack[this.layerStack.length - 1] !== layerNum) {
                    this.layerStack.push(layerNum);
                }
            }

            document.body.setAttribute('data-active-layer', String(layerNum));

            const worldUi = document.getElementById('world-ui-root');
            const fullWin = document.getElementById('cabinet-full-window');
            const dashWin = document.getElementById('ministry-dashboard-view');
            const interrogModal = document.getElementById('minister-interrogation-modal');

            // Layer 0: World Map
            if (layerNum === 0) {
                if (fullWin) {
                    fullWin.style.display = 'none';
                    fullWin.style.opacity = '0';
                    fullWin.style.pointerEvents = 'none';
                }
                if (dashWin) {
                    dashWin.style.display = 'none';
                    dashWin.style.opacity = '0';
                    dashWin.style.pointerEvents = 'none';
                }
                if (interrogModal) {
                    interrogModal.style.display = 'none';
                    interrogModal.style.opacity = '0';
                    interrogModal.style.pointerEvents = 'none';
                }
                if (worldUi) {
                    worldUi.style.pointerEvents = 'auto';
                    worldUi.style.filter = 'none';
                    worldUi.style.opacity = '1';
                }
                document.body.classList.remove('modal-open');
                this.updateRightSidebar(0);
                if (window.updateGlobalBackButtonVisibility) {
                    window.updateGlobalBackButtonVisibility();
                }
            } 
            // Layer 1: Government HQ Cabinet
            else if (layerNum === 1) {
                if (dashWin) {
                    dashWin.style.display = 'none';
                    dashWin.style.opacity = '0';
                    dashWin.style.pointerEvents = 'none';
                }
                if (interrogModal) {
                    interrogModal.style.display = 'none';
                    interrogModal.style.opacity = '0';
                    interrogModal.style.pointerEvents = 'none';
                }
                
                // Close any open drawers or modals that might obstruct view
                if (window.Game && typeof window.Game.closeAllDrawers === 'function') {
                    window.Game.closeAllDrawers();
                } else {
                    const drawers = ['command-hub-modal', 'country-info-card', 'city-detail-bar', 'search-drawer', 'events-drawer', 'layers-drawer', 'resource-filter-box', 'relation-filter-box', 'daily-quests-modal'];
                    drawers.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = 'none';
                    });
                }

                if (fullWin) {
                    fullWin.style.display = 'flex';
                    fullWin.style.position = 'fixed';
                    fullWin.style.inset = '0';
                    fullWin.style.width = '100vw';
                    fullWin.style.height = '100vh';
                    fullWin.style.opacity = '1';
                    fullWin.style.pointerEvents = 'auto';
                    fullWin.style.visibility = 'visible';
                    fullWin.style.zIndex = '999999';
                }
                if (worldUi) {
                    worldUi.style.filter = 'blur(10px) brightness(0.4)';
                    worldUi.style.opacity = '0.5';
                    worldUi.style.pointerEvents = 'auto';
                }
                document.body.classList.add('modal-open');
                
                const activeCountry = (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || 'BANGLADESH';
                if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderCabinet === 'function') {
                    window.OmegaCabinetUI.renderCabinet(activeCountry);
                }
                this.updateRightSidebar(1);
                if (window.updateGlobalBackButtonVisibility) {
                    window.updateGlobalBackButtonVisibility();
                }
            } 
            // Layer 2 / 3: Ministry Deep Dashboard
            else if (layerNum === 2 || layerNum === 3) {
                if (fullWin) {
                    fullWin.style.display = 'none';
                    fullWin.style.opacity = '0';
                    fullWin.style.pointerEvents = 'none';
                }
                if (interrogModal) {
                    interrogModal.style.display = 'none';
                    interrogModal.style.opacity = '0';
                    interrogModal.style.pointerEvents = 'none';
                }
                if (dashWin) {
                    dashWin.style.display = 'flex';
                    dashWin.style.position = 'fixed';
                    dashWin.style.inset = '0';
                    dashWin.style.width = '100vw';
                    dashWin.style.height = '100vh';
                    dashWin.style.opacity = '1';
                    dashWin.style.pointerEvents = 'auto';
                    dashWin.style.visibility = 'visible';
                    dashWin.style.zIndex = '999999';
                }
                if (worldUi) {
                    worldUi.style.filter = 'blur(12px) brightness(0.3)';
                    worldUi.style.opacity = '0.4';
                    worldUi.style.pointerEvents = 'auto';
                }
                document.body.classList.add('modal-open');
                if (data.ministryId) {
                    this.activeMinistryId = data.ministryId;
                    if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderMinistryDashboard === 'function') {
                        window.OmegaCabinetUI.renderMinistryDashboard(data.ministryId);
                    }
                }
                this.updateRightSidebar(2);
                if (window.updateGlobalBackButtonVisibility) {
                    window.updateGlobalBackButtonVisibility();
                }
            } 
            // Layer 5: Interrogation Modal
            else if (layerNum === 5) {
                if (interrogModal) {
                    interrogModal.style.display = 'flex';
                    interrogModal.style.position = 'fixed';
                    interrogModal.style.inset = '0';
                    interrogModal.style.opacity = '1';
                    interrogModal.style.pointerEvents = 'auto';
                    interrogModal.style.zIndex = '999999';
                }
                document.body.classList.add('modal-open');
                if (data.ministryId && window.OmegaCabinetUI && typeof window.OmegaCabinetUI.openInterrogationModal === 'function') {
                    window.OmegaCabinetUI.openInterrogationModal(data.ministryId);
                }
                if (window.updateGlobalBackButtonVisibility) {
                    window.updateGlobalBackButtonVisibility();
                }
            }
        },

        popLayer() {
            // 1. Close interrogation modal if active
            const interrogModal = document.getElementById('minister-interrogation-modal');
            if (interrogModal && (interrogModal.style.display === 'flex' || interrogModal.style.display === 'block')) {
                interrogModal.style.display = 'none';
                interrogModal.style.opacity = '0';
                interrogModal.style.pointerEvents = 'none';

                if (this.layerStack[this.layerStack.length - 1] === 5) {
                    this.layerStack.pop();
                }

                const prevLayer = (this.layerStack.length > 0) ? this.layerStack[this.layerStack.length - 1] : 1;
                this.setLayer(prevLayer, {}, true);
                return;
            }

            // 2. Handle inner subsystem/subview back navigation in Cabinet (Layer 1)
            if (this.currentLayer === 1 && window.OmegaCabinetEngine) {
                if (window.OmegaCabinetEngine.govSubView && window.OmegaCabinetEngine.govSubView !== 'overview') {
                    if (typeof window.OmegaCabinetEngine.setGovSubView === 'function') {
                        window.OmegaCabinetEngine.setGovSubView('overview');
                    } else {
                        window.OmegaCabinetEngine.govSubView = 'overview';
                    }
                    return;
                }
                if (window.OmegaCabinetEngine.activeSubsystem && window.OmegaCabinetEngine.activeSubsystem !== 'governance') {
                    if (typeof window.OmegaCabinetEngine.setActiveSubsystem === 'function') {
                        window.OmegaCabinetEngine.setActiveSubsystem('governance');
                    } else if (typeof window.OmegaCabinetEngine.setSubsystem === 'function') {
                        window.OmegaCabinetEngine.setSubsystem('governance');
                    } else {
                        window.OmegaCabinetEngine.activeSubsystem = 'governance';
                    }
                    if (typeof window.OmegaCabinetEngine.setGovSubView === 'function') {
                        window.OmegaCabinetEngine.setGovSubView('overview');
                    }
                    return;
                }
            }

            // 3. Normal stack popping
            if (this.layerStack.length > 1) {
                this.layerStack.pop();
                const prev = this.layerStack[this.layerStack.length - 1];
                this.setLayer(prev, {}, true);
            } else {
                this.setLayer(0, {}, true);
            }
        },

        updateRightSidebar(layerNum) {
            const btnSearch = document.getElementById('btn-map-search');
            const btnGovt = document.getElementById('btn-govt-mode');

            if (btnSearch) {
                btnSearch.style.display = (layerNum === 0) ? 'flex' : 'none';
            }

            if (btnGovt) {
                if (layerNum === 0) {
                    btnGovt.innerHTML = `<span>🏛️</span><span class="btn-lbl">GOVERNMENT</span>`;
                    btnGovt.title = "Open Government HQ";
                    btnGovt.onclick = () => window.OmegaLayerManager.setLayer(1);
                } else if (layerNum === 1) {
                    btnGovt.innerHTML = `<span>🌍</span><span class="btn-lbl">WORLD MAP</span>`;
                    btnGovt.title = "Return to World Map";
                    btnGovt.onclick = () => window.OmegaLayerManager.setLayer(0);
                } else {
                    btnGovt.innerHTML = `<span>🏛️</span><span class="btn-lbl">GOVT HQ</span>`;
                    btnGovt.title = "Back to Government HQ";
                    btnGovt.onclick = () => window.OmegaLayerManager.setLayer(1);
                }
            }
        }
    };

    /* ============================================================================
     * 5. UI DIAGNOSTIC TOOL & HEALTH AUDIT SYSTEM
     * ============================================================================ */
    window.OmegaDiagnostic = {
        checkLayoutHealth() {
            const roots = [
                { id: 'render-engine-root', element: document.getElementById('render-engine-root') },
                { id: 'world-ui-root', element: document.getElementById('world-ui-root') },
                { id: 'cabinet-full-window', element: document.getElementById('cabinet-full-window') },
                { id: 'ministry-dashboard-view', element: document.getElementById('ministry-dashboard-view') },
                { id: 'minister-interrogation-modal', element: document.getElementById('minister-interrogation-modal') }
            ];

            const report = {
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                orientation: window.DisplayManager.orientation,
                activeLayer: window.OmegaLayerManager.currentLayer,
                anomalies: []
            };

            roots.forEach(r => {
                if (r.element) {
                    const style = window.getComputedStyle(r.element);
                    if (r.element.style.display !== 'none' && style.display !== 'none') {
                        if (style.transform !== 'none' && !style.transform.includes('matrix(1, 0, 0, 1, 0, 0)')) {
                            report.anomalies.push(`${r.id} has active transform: ${style.transform}`);
                        }
                    }
                }
            });

            return report;
        },

        updateBadge() {
            let badge = document.getElementById('ui-diagnostic-badge');
            const isDev = window.isDeveloperMode || (typeof localStorage !== 'undefined' && localStorage.getItem('omega_dev_mode') === 'true');
            if (!isDev) {
                if (badge) badge.style.display = 'none';
                return;
            }

            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'ui-diagnostic-badge';
                badge.className = 'ui-diagnostic-hud';
                document.body.appendChild(badge);
            }
            badge.style.display = 'block';

            const report = this.checkLayoutHealth();
            const healthStatus = report.anomalies.length === 0 ? 'HEALTHY ●' : 'WARNING ⚠️';
            badge.innerHTML = `
                <span>${report.viewport}</span> | 
                <span>${report.orientation.toUpperCase()}</span> | 
                <span>LAYER ${report.activeLayer}</span> | 
                <span style="color:${report.anomalies.length === 0 ? '#22c55e' : '#ef4444'}">${healthStatus}</span>
            `;
        }
    };

    window.updateGlobalBackButtonVisibility = function() {
        const btn = document.getElementById('global-back-btn');
        if (!btn) return;

        const layer = window.OmegaLayerManager ? window.OmegaLayerManager.currentLayer : 0;
        const cmdHub = document.getElementById('command-hub-modal');
        const countryCard = document.getElementById('country-info-card');
        const cityBar = document.getElementById('city-detail-bar');
        const interrogModal = document.getElementById('minister-interrogation-modal');
        const fullWin = document.getElementById('cabinet-full-window');
        const dashWin = document.getElementById('ministry-dashboard-view');

        const isModalVisible = (el) => el && window.getComputedStyle(el).display !== 'none' && el.style.display !== 'none';

        // When inside Cabinet (Layer 1) or Ministry Room (Layer 2), hide global cyan button so it doesn't overlap header titles
        if (layer > 0 || isModalVisible(fullWin) || isModalVisible(dashWin)) {
            btn.style.display = 'none';
            return;
        }

        if (isModalVisible(cmdHub) || isModalVisible(countryCard) || isModalVisible(cityBar) || isModalVisible(interrogModal)) {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    };

    window.closeAnyActiveModal = function() {
        if (window.OmegaLayerManager && window.OmegaLayerManager.currentLayer > 0) {
            window.OmegaLayerManager.popLayer();
            return;
        }

        const modals = ['command-hub-modal', 'country-info-card', 'city-detail-bar', 'minister-interrogation-modal', 'cabinet-full-window', 'ministry-dashboard-view', 'resource-filter-box'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.body.classList.remove('modal-open');
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    };

    window.openMainMinistryView = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        console.log('[OMEGA NAV] openMainMinistryView triggered directly');

        // Close all overlapping drawers or modals
        if (window.Game && typeof window.Game.closeAllDrawers === 'function') {
            window.Game.closeAllDrawers();
        } else {
            const drawers = ['command-hub-modal', 'country-info-card', 'city-detail-bar', 'search-drawer', 'events-drawer', 'layers-drawer', 'resource-filter-box', 'relation-filter-box', 'daily-quests-modal'];
            drawers.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        if (window.OmegaLayerManager) {
            window.OmegaLayerManager.setLayer(1);
        } else {
            const fullWin = document.getElementById('cabinet-full-window');
            if (fullWin) {
                fullWin.style.display = 'flex';
                fullWin.style.position = 'fixed';
                fullWin.style.inset = '0';
                fullWin.style.width = '100vw';
                fullWin.style.height = '100vh';
                fullWin.style.opacity = '1';
                fullWin.style.pointerEvents = 'auto';
                fullWin.style.visibility = 'visible';
                fullWin.style.zIndex = '999999';
            }
            document.body.classList.add('modal-open');
            const activeCountry = (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || 'BANGLADESH';
            if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderCabinet === 'function') {
                window.OmegaCabinetUI.renderCabinet(activeCountry);
            }
        }
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    };

    window.openMainMapView = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        console.log('[OMEGA NAV] openMainMapView triggered directly');

        if (window.OmegaLayerManager) {
            window.OmegaLayerManager.setLayer(0);
        } else {
            const fullWin = document.getElementById('cabinet-full-window');
            const dashWin = document.getElementById('ministry-dashboard-view');
            const interrogModal = document.getElementById('minister-interrogation-modal');
            if (fullWin) fullWin.style.display = 'none';
            if (dashWin) dashWin.style.display = 'none';
            if (interrogModal) interrogModal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    };

    // Auto-init on script load
    document.addEventListener('DOMContentLoaded', () => {
        window.DisplayManager.init();
        window.OmegaInfoSwitch.render();
        window.OmegaDiagnostic.updateBadge();
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    });

})();
