/**
 * GLOBAL SUPREME COMMANDER - COUNTRY INTELLIGENCE OPERATING SYSTEM (IOS v2.0)
 * Chapter-based intelligence environment with horizontal swipe navigation,
 * 11 dedicated chapters, circular radar indicators, interactive graphs,
 * quick action triggers, and a persistent context-aware AI Strategic Advisor.
 */

window.CountryIOS = {
    activeCountry: "USA",
    activeChapter: 1,
    advisorVisible: true,
    touchStartX: 0,
    touchEndX: 0,

    init() {
        console.log("Initializing Country Intelligence Operating System (IOS v2.0)...");
        
        // Setup chapter tab navigation
        const tabs = document.querySelectorAll('.chapter-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const ch = parseInt(tab.getAttribute('data-chapter'), 10);
                if (ch) this.switchChapter(ch);
            });
        });

        // Swipe arrow navigation
        const btnPrev = document.getElementById('btn-chapter-prev');
        const btnNext = document.getElementById('btn-chapter-next');

        if (btnPrev) btnPrev.addEventListener('click', () => this.prevChapter());
        if (btnNext) btnNext.addEventListener('click', () => this.nextChapter());

        // Exit / Close button
        const btnClose = document.getElementById('btn-close-hub');
        if (btnClose) btnClose.addEventListener('click', () => this.close());

        // AI Advisor toggle
        const btnToggleAdv = document.getElementById('btn-toggle-advisor');
        const btnCloseAdv = document.getElementById('btn-close-advisor');
        if (btnToggleAdv) btnToggleAdv.addEventListener('click', () => this.toggleAdvisor());
        if (btnCloseAdv) btnCloseAdv.addEventListener('click', () => this.toggleAdvisor(false));

        // Execute Primary Advisor Directive button
        const btnExecuteAdv = document.getElementById('btn-advisor-execute');
        if (btnExecuteAdv) btnExecuteAdv.addEventListener('click', () => this.executeAdvisorDirective());

        // Swipe gesture setup on the stage
        const stage = document.getElementById('ios-chapter-stage');
        if (stage) {
            stage.addEventListener('touchstart', (e) => {
                this.touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            stage.addEventListener('touchend', (e) => {
                this.touchEndX = e.changedTouches[0].screenX;
                this.handleSwipeGesture();
            }, { passive: true });
        }
    },

    open(countryName, initialChapter = 1) {
        this.activeCountry = (countryName || (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || "USA").toUpperCase();
        this.activeChapter = initialChapter;

        const modal = document.getElementById('command-hub-modal');
        if (modal) modal.style.display = 'flex';

        this.updateHeader();
        this.switchChapter(this.activeChapter);
    },

    close() {
        const modal = document.getElementById('command-hub-modal');
        if (modal) modal.style.display = 'none';
    },

    toggleAdvisor(show) {
        const dock = document.getElementById('ios-advisor-dock');
        if (!dock) return;
        if (show === undefined) {
            this.advisorVisible = !this.advisorVisible;
        } else {
            this.advisorVisible = show;
        }

        if (this.advisorVisible) {
            dock.classList.remove('collapsed');
        } else {
            dock.classList.add('collapsed');
        }
    },

    prevChapter() {
        let ch = this.activeChapter - 1;
        if (ch < 1) ch = 11;
        this.switchChapter(ch);
    },

    nextChapter() {
        let ch = this.activeChapter + 1;
        if (ch > 11) ch = 1;
        this.switchChapter(ch);
    },

    handleSwipeGesture() {
        const diff = this.touchEndX - this.touchStartX;
        if (Math.abs(diff) > 50) {
            if (diff < 0) {
                this.nextChapter();
            } else {
                this.prevChapter();
            }
        }
    },

    updateHeader() {
        const selectedId = this.activeCountry.replace(/_/g, " ");
        const elTitle = document.getElementById('modal-country-name');
        if (elTitle) elTitle.innerText = `COMMAND HQ: ${selectedId}`;

        const elStatus = document.getElementById('ios-status-tag');
        if (elStatus) {
            const isPlayer = (selectedId === (window.playerCountry || "USA"));
            elStatus.innerText = isPlayer ? "SOVEREIGN HOME STATE" : "FOREIGN INTELLIGENCE NODE";
            elStatus.style.borderColor = isPlayer ? "#00e5ff" : "#ffd700";
            elStatus.style.color = isPlayer ? "#00e5ff" : "#ffd700";
        }
    },

    switchChapter(chNum) {
        this.activeChapter = chNum;

        // Update tabs state
        const tabs = document.querySelectorAll('.chapter-tab');
        tabs.forEach(tab => {
            const ch = parseInt(tab.getAttribute('data-chapter'), 10);
            if (ch === chNum) {
                tab.classList.add('active');
                tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else {
                tab.classList.remove('active');
            }
        });

        // Render chapter content
        const stage = document.getElementById('ios-chapter-stage');
        if (!stage) return;

        const countryKey = this.activeCountry;
        const econ = (window.Game && window.Game.state && window.Game.state.economy && window.Game.state.economy[countryKey]) || { gdp: 21400000000000, debt: 28000000000000, gdp_growth: 2.1, unemployment_rate: 3.8 };
        const pop = (window.Game && window.Game.state && window.Game.state.population && window.Game.state.population[countryKey]) || { population_2015: 331000000, annual_growth_rate: 0.5, birth_rate: 11, death_rate: 8, male_percent: 49.5, female_percent: 50.5 };
        const rel = (window.Game && window.Game.state && window.Game.state.relations && window.Game.state.relations[countryKey]) || {};

        switch(chNum) {
            case 1:
                stage.innerHTML = this.renderChapter1_Overview(countryKey, econ, pop, rel);
                break;
            case 2:
                stage.innerHTML = this.renderChapter2_Government(countryKey, econ, pop);
                break;
            case 3:
                stage.innerHTML = this.renderChapter3_Military(countryKey, econ, pop);
                break;
            case 4:
                stage.innerHTML = this.renderChapter4_Economy(countryKey, econ, pop);
                break;
            case 5:
                stage.innerHTML = this.renderChapter5_Resources(countryKey);
                break;
            case 6:
                stage.innerHTML = this.renderChapter6_Diplomacy(countryKey, rel);
                break;
            case 7:
                stage.innerHTML = this.renderChapter7_Intelligence(countryKey);
                break;
            case 8:
                stage.innerHTML = this.renderChapter8_Infrastructure(countryKey);
                break;
            case 9:
                stage.innerHTML = this.renderChapter9_Technology(countryKey);
                break;
            case 10:
                stage.innerHTML = this.renderChapter10_Society(countryKey, pop);
                break;
            case 11:
                stage.innerHTML = this.renderChapter11_Operations(countryKey);
                break;
        }

        // Attach action handlers
        this.bindQuickActions();

        // Update AI Strategic Advisor
        this.updateAdvisor(chNum, countryKey);
    },

    // -------------------------------------------------------------------------
    // CHAPTER 01: OVERVIEW
    // -------------------------------------------------------------------------
    renderChapter1_Overview(countryKey, econ, pop, rel) {
        const fmtNum = window.formatGameNumber || ((n) => `$${(n/1e9).toFixed(1)}B`);
        const fmtPop = window.formatPopulationNumber || ((n) => `${(n/1e6).toFixed(1)}M`);
        const nameClean = countryKey.replace(/_/g, " ");

        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <!-- TOP SNAPSHOT -->
                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title"><span>NATIONAL SNAPSHOT</span><span>🚩</span></div>
                        <div class="ios-card-val" style="color:#00e5ff;">${nameClean}</div>
                        <div class="ios-card-sub">Capital: Strategic Metro | Gov: Sovereign State</div>
                        <div class="ios-card-sub">Head of State: Executive Command</div>
                    </div>

                    <div class="ios-card">
                        <div class="ios-card-title"><span>TREASURY & DEMOGRAPHICS</span><span>📊</span></div>
                        <div class="ios-card-val">${fmtNum(econ.gdp || 1e12)}</div>
                        <div class="ios-card-sub">Population: ${fmtPop(pop.population_2015 || 5e7)}</div>
                        <div class="ios-card-sub">Territory: 9,833,520 sq km</div>
                    </div>

                    <div class="ios-card">
                        <div class="ios-card-title"><span>STRATEGIC STATUS</span><span>🛡️</span></div>
                        <div class="ios-card-val" style="color:#22c55e;">STABILITY 94%</div>
                        <div class="ios-card-sub">Global Influence Index: 92/100</div>
                        <div class="ios-card-sub">National Security Status: ALIGNED</div>
                    </div>
                </div>

                <!-- EXECUTIVE SUMMARY -->
                <div class="ios-card">
                    <div class="ios-card-title"><span>CLASSIFIED EXECUTIVE SUMMARY</span><span>📄</span></div>
                    <p style="font-size:12px; line-height:1.6; color:#cbd5e1; margin:0;">
                        ${nameClean} maintains high strategic importance with robust economic infrastructure and a highly capable defense force. Core priority focuses on maintaining regional hegemony, energy security, and technologically superior defense grids.
                    </p>
                </div>

                <!-- CIRCULAR RADAR INDICATORS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; font-weight:bold; color:#00e5ff;">CIRCULAR RADAR STRATEGIC INDICATORS</div>
                    <div class="ios-radar-grid">
                        <div class="ios-radar-card">
                            <div class="radar-ring" style="--val: 88;"><span class="radar-val-text">88%</span></div>
                            <span class="ios-card-title">ECONOMY</span>
                        </div>
                        <div class="ios-radar-card">
                            <div class="radar-ring" style="--val: 94;"><span class="radar-val-text">94%</span></div>
                            <span class="ios-card-title">MILITARY</span>
                        </div>
                        <div class="ios-radar-card">
                            <div class="radar-ring" style="--val: 91;"><span class="radar-val-text">91%</span></div>
                            <span class="ios-card-title">TECHNOLOGY</span>
                        </div>
                        <div class="ios-radar-card">
                            <div class="radar-ring" style="--val: 85;"><span class="radar-val-text">85%</span></div>
                            <span class="ios-card-title">DIPLOMACY</span>
                        </div>
                        <div class="ios-radar-card">
                            <div class="radar-ring" style="--val: 92;"><span class="radar-val-text">92%</span></div>
                            <span class="ios-card-title">STABILITY</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 02: GOVERNMENT
    // -------------------------------------------------------------------------
    renderChapter2_Government(countryKey, econ, pop) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title">HEAD OF STATE</div>
                        <div class="ios-card-val" style="color:#00e5ff;">Executive President</div>
                        <div class="ios-card-sub">Term: 4 Years | Approval: 68%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">ADMINISTRATIVE EFFICIENCY</div>
                        <div class="ios-card-val">91.4%</div>
                        <div class="ios-card-sub">Corruption Index: 12.2 (Low)</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">CONSTITUTION & SYSTEM</div>
                        <div class="ios-card-val">Constitutional Republic</div>
                        <div class="ios-card-sub">Next Election: Nov 2028</div>
                    </div>
                </div>

                <div class="ios-grid-2">
                    <div class="ios-card">
                        <div class="ios-card-title">STATE MINISTRIES</div>
                        <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;">
                            <div>🏛️ Ministry of State & Foreign Affairs (Active)</div>
                            <div>🛡️ Department of Defense (Alert Level 2)</div>
                            <div>💰 Department of Treasury & Commerce (Stable)</div>
                            <div>⚖️ Ministry of Justice & Law Enforcement</div>
                        </div>
                    </div>

                    <div class="ios-card">
                        <div class="ios-card-title">POLITICAL PARTIES & LEGISLATURE</div>
                        <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;">
                            <div>🔵 Coalition Majority: 54% Seats</div>
                            <div>🔴 Loyal Opposition: 42% Seats</div>
                            <div>🟢 Independent Caucus: 4% Seats</div>
                            <div style="margin-top:4px; color:#00e5ff;">Legislative Efficiency Score: 87/100</div>
                        </div>
                    </div>
                </div>

                <!-- QUICK ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#ffd700; font-weight:bold;">GOVERNMENT DIRECTIVE ACTIONS</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="influence-gov">
                            <span>🏛️ INFLUENCE GOVERNMENT</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="negotiate-terms">
                            <span>📜 NEGOTIATE TERMS</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="political-pressure">
                            <span>⚖️ POLITICAL PRESSURE</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="economic-support">
                            <span>💵 ECONOMIC SUPPORT</span><span>⚡ EXECUTE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 03: MILITARY COMMAND
    // -------------------------------------------------------------------------
    renderChapter3_Military(countryKey, econ, pop) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-4">
                    <div class="ios-card">
                        <div class="ios-card-title">ARMY DIVISIONS</div>
                        <div class="ios-card-val">24 Active Divisions</div>
                        <div class="ios-card-sub">350,000 Troops</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">NAVY FLEET</div>
                        <div class="ios-card-val">11 Carrier Strike Groups</div>
                        <div class="ios-card-sub">280 Warships</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">AIR FORCE</div>
                        <div class="ios-card-val">2,200 Fighter Jets</div>
                        <div class="ios-card-sub">Stealth Readiness 95%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">MISSILE & NUCLEAR</div>
                        <div class="ios-card-val" style="color:#ef4444;">ACTIVE DETERRENT</div>
                        <div class="ios-card-sub">Air Defense Interception: 98%</div>
                    </div>
                </div>

                <div class="ios-grid-2">
                    <div class="ios-card">
                        <div class="ios-card-title">DEFENSE READINESS & LOGISTICS</div>
                        <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:8px;">
                            <div>Overall Military Readiness: <strong style="color:#22c55e;">94%</strong></div>
                            <div>Reserve Force Strength: 800,000 Personnel</div>
                            <div>Strategic Base Installations: 14 Major HQ Command Posts</div>
                            <div>Annual Defense Budget: $820 Billion</div>
                        </div>
                    </div>

                    <div class="ios-card" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                        <div class="ios-card-title" style="width:100%;">STRATEGIC BASE RADAR HUD</div>
                        <svg width="140" height="140" viewBox="0 0 100 100" style="margin-top:10px;">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0,229,255,0.3)" stroke-width="1"/>
                            <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,229,255,0.2)" stroke-width="1"/>
                            <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(0,229,255,0.2)" stroke-width="1"/>
                            <line x1="50" y1="5" x2="50" y2="95" stroke="rgba(0,229,255,0.3)" stroke-width="1"/>
                            <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(0,229,255,0.3)" stroke-width="1"/>
                            <circle cx="35" cy="25" r="3" fill="#22c55e"/>
                            <circle cx="70" cy="65" r="3" fill="#ffd700"/>
                            <circle cx="20" cy="70" r="3" fill="#00e5ff"/>
                        </svg>
                    </div>
                </div>

                <!-- QUICK ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#ef4444; font-weight:bold;">MILITARY DIRECTIVES</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="mil-exercise">
                            <span>🛡️ MILITARY EXERCISE</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="joint-training">
                            <span>🪖 JOINT TRAINING</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="military-aid">
                            <span>🚀 MILITARY AID</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="strategic-planning">
                            <span>🎯 STRATEGIC PLANNING</span><span>⚡ EXECUTE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 04: ECONOMY
    // -------------------------------------------------------------------------
    renderChapter4_Economy(countryKey, econ, pop) {
        const fmtNum = window.formatGameNumber || ((n) => `$${(n/1e9).toFixed(1)}B`);
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-4">
                    <div class="ios-card">
                        <div class="ios-card-title">ANNUAL GDP</div>
                        <div class="ios-card-val">${fmtNum(econ.gdp || 21e12)}</div>
                        <div class="ios-card-sub">Growth: +${econ.gdp_growth || 2.4}% / yr</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">NATIONAL DEBT</div>
                        <div class="ios-card-val" style="color:#ef4444;">${fmtNum(econ.debt || 28e12)}</div>
                        <div class="ios-card-sub">Debt/GDP: 122%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">UNEMPLOYMENT</div>
                        <div class="ios-card-val">${econ.unemployment_rate || 3.8}%</div>
                        <div class="ios-card-sub">Inflation: 2.1%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">TRADE BALANCE</div>
                        <div class="ios-card-val" style="color:#22c55e;">+$45.2 Billion</div>
                        <div class="ios-card-sub">Currency: USD ($)</div>
                    </div>
                </div>

                <div class="ios-chart-box">
                    <div class="ios-card-title" style="margin-bottom:10px; color:#00e5ff;">5-YEAR ECONOMIC GDP GROWTH TREND</div>
                    <svg width="100%" height="120" viewBox="0 0 400 100" preserveAspectRatio="none">
                        <path d="M 0,80 Q 100,20 200,50 T 400,10" fill="none" stroke="#00e5ff" stroke-width="3"/>
                        <circle cx="0" cy="80" r="4" fill="#00e5ff"/>
                        <circle cx="100" cy="35" r="4" fill="#00e5ff"/>
                        <circle cx="200" cy="50" r="4" fill="#00e5ff"/>
                        <circle cx="300" cy="25" r="4" fill="#00e5ff"/>
                        <circle cx="400" cy="10" r="4" fill="#ffd700"/>
                    </svg>
                </div>

                <!-- QUICK ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#ffd700; font-weight:bold;">ECONOMIC DIRECTIVE ACTIONS</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="trade-agreement">
                            <span>📜 TRADE AGREEMENT</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="investment">
                            <span>🏗️ STRATEGIC INVESTMENT</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="financial-aid">
                            <span>💵 FINANCIAL AID</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="sanctions">
                            <span>⛔ ECONOMIC SANCTIONS</span><span>⚡ EXECUTE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 05: RESOURCES
    // -------------------------------------------------------------------------
    renderChapter5_Resources(countryKey) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-4">
                    <div class="ios-card">
                        <div class="ios-card-title">🛢️ CRUDE OIL</div>
                        <div class="ios-card-val">12.5M BBL/day</div>
                        <div class="ios-card-sub">Reserves: High</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">🔥 NATURAL GAS</div>
                        <div class="ios-card-val">950B M3/yr</div>
                        <div class="ios-card-sub">Net Exporter</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">⚛️ URANIUM</div>
                        <div class="ios-card-val">4,500 Tons</div>
                        <div class="ios-card-sub">Strategic Stockpile: 98%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">🔋 LITHIUM & RARE EARTHS</div>
                        <div class="ios-card-val">1.2M Tons</div>
                        <div class="ios-card-sub">Tech Supply Chain</div>
                    </div>
                </div>

                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title">IRON & STEEL</div>
                        <div class="ios-card-val">85M Tons/yr</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">WATER RESERVES</div>
                        <div class="ios-card-val" style="color:#22c55e;">Abundant</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">FOOD PRODUCTION INDEX</div>
                        <div class="ios-card-val" style="color:#22c55e;">142.8 (Self-Sufficient)</div>
                    </div>
                </div>

                <!-- QUICK ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#00e5ff; font-weight:bold;">RESOURCE AGREEMENTS & OVERLAYS</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="resource-deal">
                            <span>📦 RESOURCE AGREEMENT</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="exploration">
                            <span>⛏️ EXPLORATION GRANT</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="resource-map">
                            <span>🗺️ SHOW MAP OVERLAY</span><span>⚡ TOGGLE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 06: DIPLOMACY
    // -------------------------------------------------------------------------
    renderChapter6_Diplomacy(countryKey, rel) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title">STRATEGIC ALLIES</div>
                        <div class="ios-card-val" style="color:#22c55e;">28 Nations</div>
                        <div class="ios-card-sub">Mutual Defense Treaties Active</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">DIPLOMATIC INFLUENCE</div>
                        <div class="ios-card-val">94.2 Score</div>
                        <div class="ios-card-sub">UN Security Council Member</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">EMBASSY NETWORK</div>
                        <div class="ios-card-val">175 Global Embassies</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title" style="color:#00e5ff;">WORLD RELATIONSHIP DYNAMIC GRAPH</div>
                    <svg width="100%" height="100" viewBox="0 0 300 80">
                        <circle cx="150" cy="40" r="18" fill="#00e5ff" stroke="#fff" stroke-width="2"/>
                        <text x="150" y="44" text-anchor="middle" fill="#000" font-size="10" font-weight="bold">${countryKey.substring(0,3)}</text>

                        <circle cx="60" cy="20" r="12" fill="#22c55e"/>
                        <line x1="150" y1="40" x2="60" y2="20" stroke="#22c55e" stroke-width="2"/>

                        <circle cx="240" cy="20" r="12" fill="#22c55e"/>
                        <line x1="150" y1="40" x2="240" y2="20" stroke="#22c55e" stroke-width="2"/>

                        <circle cx="60" cy="60" r="12" fill="#ef4444"/>
                        <line x1="150" y1="40" x2="60" y2="60" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3,3"/>

                        <circle cx="240" cy="60" r="12" fill="#ffd700"/>
                        <line x1="150" y1="40" x2="240" y2="60" stroke="#ffd700" stroke-width="1.5"/>
                    </svg>
                </div>

                <!-- QUICK ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#22c55e; font-weight:bold;">DIPLOMATIC DIRECTIVES</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="alliance">
                            <span>🤝 FORM ALLIANCE</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="peace-treaty">
                            <span>📜 PEACE TREATY</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="embassy">
                            <span>🏛️ ESTABLISH EMBASSY</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="summit">
                            <span>🌐 CONVENE SUMMIT</span><span>⚡ EXECUTE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 07: INTELLIGENCE
    // -------------------------------------------------------------------------
    renderChapter7_Intelligence(countryKey) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title">NETWORK LEVEL</div>
                        <div class="ios-card-val" style="color:#00e5ff;">CLASS 5 GLOBAL</div>
                        <div class="ios-card-sub">Satellite Mesh Coverage 99.8%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">COUNTER-INTEL SHIELD</div>
                        <div class="ios-card-val">96.5% Efficiency</div>
                        <div class="ios-card-sub">Foreign Infiltration: Low</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">CYBER WARFARE UNIT</div>
                        <div class="ios-card-val" style="color:#22c55e;">DEFCON 2 READINESS</div>
                        <div class="ios-card-sub">Offensive Capabilities Active</div>
                    </div>
                </div>

                <div class="ios-card" style="border-color:#ef4444;">
                    <div class="ios-card-title" style="color:#ef4444;">AI THREAT ASSESSMENT & ESPIONAGE REPORT</div>
                    <div style="font-size:12px; line-height:1.6; color:#f8fafc;">
                        <div>⚠️ Current Threat Level: <strong>MODERATE (LEVEL 3)</strong></div>
                        <div>📡 Counter-Intelligence Status: 12 foreign surveillance nodes intercepted in last 30 days.</div>
                        <div>🔒 Information Reliability Rating: 98.4% (Highly Verified)</div>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 08: INFRASTRUCTURE
    // -------------------------------------------------------------------------
    renderChapter8_Infrastructure(countryKey) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-4">
                    <div class="ios-card">
                        <div class="ios-card-title">AIRPORTS & PORTS</div>
                        <div class="ios-card-val">135 Intl Airports</div>
                        <div class="ios-card-sub">52 Deepwater Seaports</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">RAIL & HIGHWAYS</div>
                        <div class="ios-card-val">250,000 km Grid</div>
                        <div class="ios-card-sub">High-Speed Logistics</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">POWER GRID</div>
                        <div class="ios-card-val">4,200 Terawatt-Hours</div>
                        <div class="ios-card-sub">Nuclear + Clean Energy 45%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">TELECOM / 5G</div>
                        <div class="ios-card-val" style="color:#22c55e;">99.2% Coverage</div>
                        <div class="ios-card-sub">Quantum Satellite Link</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title">INFRASTRUCTURE MODERNIZATION INDEX</div>
                    <div style="background:rgba(255,255,255,0.1); border-radius:6px; height:18px; overflow:hidden; margin-top:6px;">
                        <div style="width:92%; background:linear-gradient(90deg, #00e5ff, #22c55e); height:100%;"></div>
                    </div>
                    <span class="ios-card-sub" style="margin-top:4px;">Logistics Network Operating Efficiency: 92%</span>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 09: TECHNOLOGY
    // -------------------------------------------------------------------------
    renderChapter9_Technology(countryKey) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title">AI & QUANTUM COMPUTE</div>
                        <div class="ios-card-val" style="color:#ffd700;">TIER 1 LEADERSHIP</div>
                        <div class="ios-card-sub">Autonomous Swarm Systems</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">SPACE PROGRAM</div>
                        <div class="ios-card-val">Lunar & Orbital Stations</div>
                        <div class="ios-card-sub">1,400 Active Satellites</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">CYBER SECURITY GRID</div>
                        <div class="ios-card-val" style="color:#22c55e;">QUANTUM ENCRYPTED</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title" style="color:#00e5ff;">RESEARCH PROGRESS TIMELINE</div>
                    <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:11px; color:#cbd5e1;">
                        <div>🤖 AI Robotics (100%)</div>
                        <div>⚡ Fusion Energy (84%)</div>
                        <div>🚀 Hypersonic Flight (92%)</div>
                        <div>🧪 Bio-Genetics (78%)</div>
                    </div>
                </div>

                <!-- QUICK ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#ffd700; font-weight:bold;">TECH DIRECTIVE ACTIONS</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="research-pact">
                            <span>🧪 RESEARCH AGREEMENT</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="tech-transfer">
                            <span>💾 TECH TRANSFER</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="joint-rd">
                            <span>🔬 JOINT R&D VENTURE</span><span>⚡ EXECUTE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 10: SOCIETY
    // -------------------------------------------------------------------------
    renderChapter10_Society(countryKey, pop) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-4">
                    <div class="ios-card">
                        <div class="ios-card-title">EDUCATION INDEX</div>
                        <div class="ios-card-val">0.94 (Tier 1)</div>
                        <div class="ios-card-sub">Literacy Rate: 99%</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">HEALTHCARE SYSTEM</div>
                        <div class="ios-card-val">Advanced Universal</div>
                        <div class="ios-card-sub">Life Expectancy: 81 Yrs</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">HAPPINESS INDEX</div>
                        <div class="ios-card-val" style="color:#22c55e;">78.4 / 100</div>
                        <div class="ios-card-sub">Public Morale High</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">URBANIZATION RATE</div>
                        <div class="ios-card-val">82.5%</div>
                        <div class="ios-card-sub">Metro Demographics</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title">NATIONAL POPULATION AGE DEMOGRAPHICS</div>
                    <div style="display:flex; justify-content:space-around; align-items:flex-end; height:80px; margin-top:10px;">
                        <div style="text-align:center;"><div style="background:#00e5ff; width:30px; height:40px; margin:0 auto; border-radius:4px 4px 0 0;"></div><span style="font-size:10px;">0-18 Yrs (18%)</span></div>
                        <div style="text-align:center;"><div style="background:#22c55e; width:30px; height:70px; margin:0 auto; border-radius:4px 4px 0 0;"></div><span style="font-size:10px;">19-64 Yrs (62%)</span></div>
                        <div style="text-align:center;"><div style="background:#ffd700; width:30px; height:50px; margin:0 auto; border-radius:4px 4px 0 0;"></div><span style="font-size:10px;">65+ Yrs (20%)</span></div>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 11: OPERATIONS (Action Matrix)
    // -------------------------------------------------------------------------
    renderChapter11_Operations(countryKey) {
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-card" style="border-color:#ffd700;">
                    <div class="ios-card-title" style="color:#ffd700;">CHAPTER 11: OPERATIONS COMMAND CENTER</div>
                    <p style="font-size:12px; color:#cbd5e1; margin:0;">
                        Execute supreme executive directives directly against ${countryKey.replace(/_/g, " ")}. Locked directives indicate unmet prerequisite diplomatic, technical, or military thresholds.
                    </p>
                </div>

                <div class="ios-actions-grid" style="grid-template-columns: repeat(3, 1fr);">
                    <button class="ios-act-btn locked" data-action="declare-war">
                        <span>⚔️ DECLARE WAR</span><span class="ios-lock-reason">🔒 Locked: Requires Tension > 75%</span>
                    </button>

                    <button class="ios-act-btn" data-action="peace-negotiation">
                        <span>🕊️ PEACE NEGOTIATION</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="trade-proposal">
                        <span>📜 TRADE PROPOSAL</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="intel-op">
                        <span>🛰️ INTELLIGENCE OPERATION</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="cyber-op">
                        <span>💻 CYBER OPERATION</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="humanitarian-aid">
                        <span>🏥 HUMANITARIAN AID</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="military-aid">
                        <span>🛡️ MILITARY AID</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="economic-aid">
                        <span>💰 ECONOMIC AID</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="build-embassy">
                        <span>🏛️ BUILD EMBASSY</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="send-delegation">
                        <span>👥 SEND DELEGATION</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="joint-research">
                        <span>🧪 JOINT RESEARCH</span><span>⚡ AVAILABLE</span>
                    </button>

                    <button class="ios-act-btn" data-action="strategic-investment">
                        <span>🏗️ STRATEGIC INVESTMENT</span><span>⚡ AVAILABLE</span>
                    </button>
                </div>
            </div>
        `;
    },

    // BIND QUICK ACTION BUTTONS
    bindQuickActions() {
        const btns = document.querySelectorAll('.ios-act-btn:not(.locked)');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-action');
                this.executeAction(act);
            });
        });
    },

    executeAction(actionType) {
        const countryName = this.activeCountry.replace(/_/g, " ");
        if (window.showNotification) {
            window.showNotification("EXECUTIVE DIRECTIVE", `Directive ${actionType.toUpperCase()} dispatched for ${countryName}`, "info");
        } else {
            alert(`Executive Directive ${actionType.toUpperCase()} dispatched for ${countryName}`);
        }
    },

    // AI STRATEGIC ADVISOR RECOMMENDATIONS ENGINE
    updateAdvisor(chNum, countryKey) {
        const chTag = document.getElementById('advisor-chapter-name');
        const text = document.getElementById('advisor-insights-text');
        if (!chTag || !text) return;

        const countryName = countryKey.replace(/_/g, " ");
        const chNames = [
            "01 OVERVIEW", "02 GOVERNMENT", "03 MILITARY", "04 ECONOMY", "05 RESOURCES",
            "06 DIPLOMACY", "07 INTELLIGENCE", "08 INFRASTRUCTURE", "09 TECHNOLOGY", "10 SOCIETY", "11 OPERATIONS"
        ];

        chTag.innerText = chNames[chNum - 1] || "01 OVERVIEW";

        const adviceMap = {
            1: `<strong>OVERVIEW ADVICE:</strong> ${countryName} exhibits a stable strategic equilibrium. Priority recommendation is to fortify diplomatic alliances while maintaining defense readiness.`,
            2: `<strong>GOVERNMENT ADVICE:</strong> High administrative efficiency detected. Recommend negotiating bilateral governance agreements or applying diplomatic leverage.`,
            3: `<strong>MILITARY ADVICE:</strong> Defense forces are at peak readiness (94%). Maintain joint military exercises to optimize joint interception capabilities.`,
            4: `<strong>ECONOMY ADVICE:</strong> GDP growth is positive (+2.4%). Establishing a new trade agreement will boost treasury revenue by +$15M/s.`,
            5: `<strong>RESOURCE ADVICE:</strong> Energy and rare earth reserves are abundant. Propose a long-term resource import deal to secure strategic supply chains.`,
            6: `<strong>DIPLOMACY ADVICE:</strong> Strategic relations are receptive. Convening a bilateral summit will enhance overall alliance index by +15 points.`,
            7: `<strong>INTELLIGENCE ADVICE:</strong> Counter-intelligence shield is active. Deploy covert intelligence monitoring to detect foreign infiltrations early.`,
            8: `<strong>INFRASTRUCTURE ADVICE:</strong> High-speed logistics grid is operating at 92%. Modernizing seaport nodes will further accelerate trade throughput.`,
            9: `<strong>TECHNOLOGY ADVICE:</strong> Quantum compute R&D is advanced. Initiating a Joint R&D Venture will accelerate research progress by +25%.`,
            10: `<strong>SOCIETY ADVICE:</strong> Public morale and happiness are high (78.4). Excellent social stability ensures low civil unrest risk.`,
            11: `<strong>OPERATIONS ADVICE:</strong> Optimal executive action: Propose Trade Accord or Establish Embassy to solidify strategic dominance.`
        };

        text.innerHTML = adviceMap[chNum] || "Select a chapter to generate tactical intelligence.";
    },

    executeAdvisorDirective() {
        const currentCh = this.activeChapter;
        const actionsMap = {
            1: "influence-gov", 2: "negotiate-terms", 3: "joint-training",
            4: "trade-agreement", 5: "resource-deal", 6: "alliance",
            7: "intel-op", 8: "investment", 9: "joint-rd", 10: "humanitarian-aid", 11: "trade-proposal"
        };
        const act = actionsMap[currentCh] || "trade-proposal";
        this.executeAction(act);
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.CountryIOS.init();
});
