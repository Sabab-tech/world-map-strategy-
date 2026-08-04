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

        // Disable sensitive touch swipe tab changes per user request
        const stage = document.getElementById('ios-chapter-stage');
        if (stage) {
            stage.addEventListener('touchstart', (e) => {
                this.touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            stage.addEventListener('touchend', (e) => {
                this.touchEndX = e.changedTouches[0].screenX;
                // Auto-swipe disabled so player only changes tabs using tab buttons
            }, { passive: true });
        }
    },

    open(countryName, initialChapter = 1) {
        this.activeCountry = (countryName || (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || "USA").toUpperCase();
        this.activeChapter = initialChapter;

        // Hide legacy cabinet window if open to prevent screen overlaps
        const cabWin = document.getElementById('cabinet-full-window');
        if (cabWin) {
            cabWin.style.display = 'none';
            cabWin.style.opacity = '0';
            cabWin.style.pointerEvents = 'none';
        }

        const modal = document.getElementById('command-hub-modal');
        if (modal) modal.style.display = 'flex';

        document.body.classList.add('modal-open');

        this.updateHeader();
        this.switchChapter(this.activeChapter);
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    },

    close() {
        const modal = document.getElementById('command-hub-modal');
        if (modal) modal.style.display = 'none';

        document.body.classList.remove('modal-open');
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
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
        if (ch < 1) ch = 12;
        this.switchChapter(ch);
    },

    nextChapter() {
        let ch = this.activeChapter + 1;
        if (ch > 12) ch = 1;
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
            case 12:
                stage.innerHTML = this.renderChapter12_WorldEcosystem(countryKey);
                break;
        }

        // Attach action handlers
        this.bindQuickActions();

        // Update AI Strategic Advisor
        this.updateAdvisor(chNum, countryKey);
    },

    // -------------------------------------------------------------------------
    // CHAPTER 01: OVERVIEW & STRATEGIC DIPLOMACY PANEL (MATCHING USER SCREENSHOT)
    // -------------------------------------------------------------------------
    renderChapter1_Overview(countryKey, econ, pop, rel) {
        const nameClean = countryKey.replace(/_/g, " ");

        const capitalMap = {
            "USA": "Washington D.C.", "BANGLADESH": "Dhaka", "INDIA": "New Delhi",
            "CHINA": "Beijing", "RUSSIA": "Moscow", "UNITED KINGDOM": "London",
            "UK": "London", "GERMANY": "Berlin", "JAPAN": "Tokyo", "FRANCE": "Paris",
            "SAUDI ARABIA": "Riyadh", "PAKISTAN": "Islamabad", "TURKEY": "Ankara",
            "IRAN": "Tehran", "EGYPT": "Cairo", "BRAZIL": "Brasilia", "CANADA": "Ottawa",
            "PALESTINE": "Jerusalem / Ramallah", "BAHRAIN": "Manama", "MALDIVES": "Male"
        };
        const capital = capitalMap[countryKey.toUpperCase()] || "Capital HQ";

        const cashVal = econ.gdp ? (econ.gdp / 1e8).toFixed(1) + "k" : "244.8k";
        const influenceVal = (pop.population_2015 ? (pop.population_2015 / 6e5).toFixed(1) : "502.8") + "k";
        const popVal = pop.population_2015 ? (pop.population_2015 / 1e6).toFixed(1) + "M" : "66.6M";
        const relationVal = rel.standing || "friendship (65)";

        // Country flag icon mapping
        const flagMap = {
            "UNITED KINGDOM": "🇬🇧", "UK": "🇬🇧", "USA": "🇺🇸", "BANGLADESH": "🇧🇩",
            "INDIA": "🇮🇳", "CHINA": "🇨🇳", "RUSSIA": "🇷🇺", "GERMANY": "🇩🇪",
            "JAPAN": "🇯🇵", "FRANCE": "🇫🇷", "SAUDI ARABIA": "🇸🇦", "PALESTINE": "🇵🇸",
            "BAHRAIN": "🇧🇭", "MALDIVES": "🇲🇻", "PAKISTAN": "🇵🇰", "TURKEY": "🇹🇷"
        };
        const flag = flagMap[countryKey.toUpperCase()] || "🌐";

        return `
            <div class="command-tactical-container">
                <!-- 🚩 GRAND DIPLOMATIC STRATEGIC BANNER -->
                <div class="tactical-header-banner">
                    <div class="banner-flag-badge">${flag}</div>
                    <div class="banner-title-box">
                        <h2 class="banner-country-title">${nameClean.toUpperCase()} · ${capital.toUpperCase()}</h2>
                        <div class="banner-metrics-row">
                            <span class="metric-item">🪙 <strong style="color:#fcd34d;">${cashVal}</strong></span>
                            <span class="metric-item">💖 <strong style="color:#f43f5e;">${influenceVal}</strong></span>
                            <span class="metric-item">👥 <strong style="color:#38bdf8;">${popVal}</strong></span>
                            <span class="metric-item">😊 <strong style="color:#4ade80;">${relationVal}</strong></span>
                        </div>
                    </div>
                    <div class="banner-flag-badge">${flag}</div>
                </div>

                <!-- ⚔️ 8 STRATEGIC ACTION BUTTONS GRID (EXACT SCREENSHOT MATCH) -->
                <div class="tactical-actions-grid">
                    <div class="tactical-card ios-act-btn" data-action="destroy-embassy">
                        <div class="tactical-img-box img-destroy-embassy">
                            <div class="tactical-img-overlay danger-overlay">🏛️ ✖</div>
                        </div>
                        <div class="tactical-card-label">Destroy Embassy</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="non-aggression">
                        <div class="tactical-img-box img-non-aggression">
                            <div class="tactical-img-overlay peace-overlay">📜 🕊️</div>
                        </div>
                        <div class="tactical-card-label">Non-Aggression Pact</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="defensive-alliance">
                        <div class="tactical-img-box img-defensive-alliance">
                            <div class="tactical-img-overlay alliance-overlay">🛡️ 🤝</div>
                        </div>
                        <div class="tactical-card-label">Defensive Alliance</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="terminate-trade">
                        <div class="tactical-img-box img-terminate-trade">
                            <div class="tactical-img-overlay danger-overlay">🚫 📦</div>
                        </div>
                        <div class="tactical-card-label">Terminate Trade Agreement</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="research-contract">
                        <div class="tactical-img-box img-research-contract">
                            <div class="tactical-img-overlay tech-overlay">🔬 🧬</div>
                        </div>
                        <div class="tactical-card-label">Research Contract</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="send-troops">
                        <div class="tactical-img-box img-send-troops">
                            <div class="tactical-img-overlay military-overlay">🎖️ 🪖</div>
                        </div>
                        <div class="tactical-card-label">Send Troops</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="call-to-arms">
                        <div class="tactical-img-box img-call-to-arms">
                            <div class="tactical-img-overlay military-overlay">📣 ⚔️</div>
                        </div>
                        <div class="tactical-card-label">Call to Arms</div>
                    </div>

                    <div class="tactical-card ios-act-btn" data-action="impose-sanctions">
                        <div class="tactical-img-box img-impose-sanctions">
                            <div class="tactical-img-overlay danger-overlay">🔥 💥</div>
                        </div>
                        <div class="tactical-card-label">Impose Sanctions</div>
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
                            <div>🏛️ Ministry of Foreign Affairs (Active)</div>
                            <div>🛡️ Department of Defense (Alert Level 2)</div>
                            <div>💰 Department of Treasury & Commerce (Stable)</div>
                            <div>⚖️ Ministry of Justice & Law Enforcement</div>
                        </div>
                        <button onclick="window.OmegaLayerManager.setLayer(1);" style="margin-top:12px; width:100%; padding:10px 14px; background:linear-gradient(135deg, rgba(0,229,255,0.25), rgba(0,102,255,0.35)); border:1px solid #00e5ff; color:#00e5ff; font-weight:bold; font-family:var(--font-mono); border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 0 10px rgba(0,229,255,0.2);">
                            <span>🏛️</span> <span>OPEN CABINET & ASK MINISTERS (CABINET HQ)</span>
                        </button>
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
        const nameClean = countryKey.replace(/_/g, " ").toUpperCase();
        
        return `
            <div style="display:flex; flex-direction:column; gap:16px; max-width:960px; margin:0 auto;">
                <!-- TOP HEADER & EXIT BUTTON -->
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.8); padding:10px 16px; border-radius:8px; border:1px solid rgba(0,229,255,0.2);">
                    <div>
                        <span style="font-size:10px; color:#ffd700; font-family:var(--font-mono); font-weight:bold;">🏛️ MINISTRY OF FINANCE & NATIONAL TREASURY</span>
                        <h3 style="margin:2px 0 0 0; color:#f8fafc; font-size:15px; font-family:var(--font-mono);">${nameClean} ECONOMIC DASHBOARD</h3>
                    </div>
                    <button onclick="window.CountryIOS.close()" style="padding:6px 14px; background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; font-size:11px; font-weight:bold; border-radius:6px; cursor:pointer; font-family:var(--font-mono); transition:all 0.2s;">
                        ✕ EXIT / CLOSE
                    </button>
                </div>

                <!-- MACROECONOMIC CARDS -->
                <div class="ios-grid-4">
                    <div class="ios-card" style="border-left:3px solid #00e5ff;">
                        <div class="ios-card-title">GROSS DOMESTIC PRODUCT (GDP)</div>
                        <div class="ios-card-val" style="color:#00e5ff;">${fmtNum(econ.gdp || 21e12)}</div>
                        <div class="ios-card-sub">Annual Growth: <strong style="color:#22c55e;">+${econ.gdp_growth || 2.4}% / yr</strong></div>
                    </div>
                    <div class="ios-card" style="border-left:3px solid #ef4444;">
                        <div class="ios-card-title">SOVEREIGN NATIONAL DEBT</div>
                        <div class="ios-card-val" style="color:#ef4444;">${fmtNum(econ.debt || 28e12)}</div>
                        <div class="ios-card-sub">Debt-to-GDP Ratio: <strong style="color:#ffd700;">118%</strong></div>
                    </div>
                    <div class="ios-card" style="border-left:3px solid #ffd700;">
                        <div class="ios-card-title">UNEMPLOYMENT & INFLATION</div>
                        <div class="ios-card-val" style="color:#ffd700;">${econ.unemployment_rate || 3.8}% / 2.2%</div>
                        <div class="ios-card-sub">Labor Force: 164M Workers</div>
                    </div>
                    <div class="ios-card" style="border-left:3px solid #22c55e;">
                        <div class="ios-card-title">FOREIGN TRADE BALANCE</div>
                        <div class="ios-card-val" style="color:#22c55e;">+$48.5 Billion</div>
                        <div class="ios-card-sub">Reserves: $142 Billion</div>
                    </div>
                </div>

                <!-- HIGH VISIBILITY HIGH-TECH GRAPH & METERS -->
                <div class="ios-grid-2">
                    <div class="ios-chart-box" style="background:rgba(15,23,42,0.8); border:1px solid rgba(0,229,255,0.2); padding:14px; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <span style="font-size:11px; color:#00e5ff; font-family:var(--font-mono); font-weight:bold;">📈 5-YEAR REAL GDP TRAJECTORY</span>
                            <span style="font-size:10px; color:#22c55e; font-family:var(--font-mono);">STABLE OUTLOOK</span>
                        </div>
                        <svg width="100%" height="130" viewBox="0 0 380 110" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="gdpGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.3"/>
                                    <stop offset="100%" stop-color="#00e5ff" stop-opacity="0.0"/>
                                </linearGradient>
                            </defs>
                            <path d="M 10,90 Q 95,45 190,60 T 370,15 L 370,100 L 10,100 Z" fill="url(#gdpGrad)"/>
                            <path d="M 10,90 Q 95,45 190,60 T 370,15" fill="none" stroke="#00e5ff" stroke-width="3"/>
                            <line x1="10" y1="100" x2="370" y2="100" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
                            <circle cx="10" cy="90" r="4" fill="#00e5ff"/>
                            <circle cx="100" cy="48" r="4" fill="#00e5ff"/>
                            <circle cx="190" cy="60" r="4" fill="#00e5ff"/>
                            <circle cx="280" cy="30" r="4" fill="#00e5ff"/>
                            <circle cx="370" cy="15" r="5" fill="#ffd700"/>
                            <text x="10" y="108" fill="#64748b" font-size="9" font-family="monospace">2022</text>
                            <text x="100" y="108" fill="#64748b" font-size="9" font-family="monospace">2023</text>
                            <text x="190" y="108" fill="#64748b" font-size="9" font-family="monospace">2024</text>
                            <text x="280" y="108" fill="#64748b" font-size="9" font-family="monospace">2025</text>
                            <text x="350" y="108" fill="#ffd700" font-size="9" font-family="monospace">2026 PROJ</text>
                        </svg>
                    </div>

                    <div class="ios-chart-box" style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,215,0,0.2); padding:14px; border-radius:8px;">
                        <div style="font-size:11px; color:#ffd700; font-family:var(--font-mono); font-weight:bold; margin-bottom:12px;">🏭 ECONOMIC SECTORAL BREAKDOWN</div>
                        <div style="display:flex; flex-direction:column; gap:10px; font-family:var(--font-mono); font-size:11px; color:#cbd5e1;">
                            <div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                    <span>SERVICES & TECHNOLOGY</span><strong style="color:#00e5ff;">68.4%</strong>
                                </div>
                                <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                                    <div style="width:68.4%; height:100%; background:#00e5ff;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                    <span>INDUSTRY & MANUFACTURING</span><strong style="color:#ffd700;">23.2%</strong>
                                </div>
                                <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                                    <div style="width:23.2%; height:100%; background:#ffd700;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                    <span>AGRICULTURE & RAW MATERIALS</span><strong style="color:#22c55e;">8.4%</strong>
                                </div>
                                <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                                    <div style="width:8.4%; height:100%; background:#22c55e;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- DIRECTIVE ACTIONS -->
                <div>
                    <div class="ios-card-title" style="margin-bottom:8px; color:#ffd700; font-weight:bold; font-family:var(--font-mono);">⚡ TREASURY DIRECTIVE ACTIONS</div>
                    <div class="ios-actions-grid">
                        <button class="ios-act-btn" data-action="trade-agreement">
                            <span>📜 BILATERAL TRADE DEAL</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="investment">
                            <span>🏗️ INFRASTRUCTURE BONDS</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="financial-aid">
                            <span>💵 REVENUE TAX REFORM</span><span>⚡ EXECUTE</span>
                        </button>
                        <button class="ios-act-btn" data-action="sanctions">
                            <span>⛔ CENTRAL BANK RATE SET</span><span>⚡ EXECUTE</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------------------
    // CHAPTER 05: RESOURCES - AUTONOMOUS RESOURCE MINISTRY ENGINE & NRMS
    // -------------------------------------------------------------------------
    renderChapter5_Resources(countryKey) {
        const nrms = window.ResourceMinistryEngine ? window.ResourceMinistryEngine.getSummary() : null;
        
        if (!nrms) {
            return `<div style="padding:20px; color:#ef4444; font-family:'Share Tech Mono', monospace;">Resource Intelligence Engine Offline.</div>`;
        }

        const briefingText = nrms.briefing;
        const metrics = nrms.globalMetrics;
        const resList = nrms.resourcesList;
        const debates = nrms.debates || [];
        const surveys = metrics.surveysUnderway || [];

        let surveyHtml = "";
        if (surveys.length > 0) {
            surveyHtml = `
                <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(0,229,255,0.4); border-radius:10px; padding:12px; margin-bottom:12px;">
                    <div style="font-size:12px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span>⛏️ ACTIVE GEOLOGICAL SURVEYS IN PROGRESS (${surveys.length})</span>
                        <span style="font-size:10px; color:#ffd700; font-family:var(--font-mono);">DEEP EARTH RADAR ACTIVE</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${surveys.map(s => `
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border-left:3px solid #00e5ff;">
                                <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; color:#f8fafc; font-family:var(--font-mono);">
                                    <span>${s.resName} Survey (${s.country})</span>
                                    <span style="color:#22c55e;">${s.progress}%</span>
                                </div>
                                <div style="font-size:10px; color:#94a3b8; font-family:var(--font-mono); margin:2px 0 4px 0;">
                                    Stage: ${s.stageName} • Est. Time: ${s.estimatedDays} Days
                                </div>
                                <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                                    <div style="width:${s.progress}%; height:100%; background:linear-gradient(90deg, #00e5ff, #22c55e);"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let resGridHtml = resList.map(r => {
            const selfSuffColor = r.selfSufficiencyRatio >= 100 ? '#22c55e' : (r.selfSufficiencyRatio >= 75 ? '#eab308' : '#ef4444');
            const netColor = r.netBalance >= 0 ? '#22c55e' : '#ef4444';
            const netSign = r.netBalance >= 0 ? '+' : '';

            return `
                <div class="ios-card" style="border-top: 2px solid ${selfSuffColor}; position: relative; padding:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-size:13px; font-weight:bold; color:#f8fafc; font-family:var(--font-title);">${r.icon} ${r.name.toUpperCase()}</span>
                        <span style="font-size:10px; padding:2px 6px; border-radius:10px; background:${selfSuffColor}22; color:${selfSuffColor}; font-weight:bold; border:1px solid ${selfSuffColor}; font-family:var(--font-mono);">
                            ${r.selfSufficiencyRatio}% ${r.selfSufficiencyRatio >= 100 ? 'SECURE' : 'DEFICIT'}
                        </span>
                    </div>
                    
                    <div style="font-size:10px; color:#94a3b8; font-family:var(--font-mono); margin-bottom:6px;">${r.bnName} • ${r.category}</div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:11px; color:#cbd5e1; font-family:var(--font-mono); margin-bottom:8px;">
                        <div>Output: <strong style="color:#00e5ff;">${r.dailyProduction.toLocaleString()}</strong></div>
                        <div>Consume: <strong style="color:#f97316;">${r.dailyConsumption.toLocaleString()}</strong></div>
                        <div>Net Flow: <strong style="color:${netColor};">${netSign}${r.netBalance.toLocaleString()}</strong></div>
                        <div>Stock Days: <strong style="color:#ffd700;">${r.stockDays} Days</strong></div>
                        <div>Mines/Plants: <strong style="color:#22c55e;">${r.activeFacilities} Active</strong></div>
                        <div>Stockpile: <strong style="color:#a855f7;">${r.warehouseStock.toLocaleString()}</strong></div>
                    </div>

                    <div style="font-size:10px; color:#94a3b8; line-height:1.3; background:rgba(0,0,0,0.3); padding:4px 6px; border-radius:4px; font-family:var(--font-mono); margin-bottom:8px;">
                        ⛓️ ${r.processChain}
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                        <button onclick="window.ResourceMinistryEngine.executeDirective('survey', '${r.id}');" style="padding:5px 4px; background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            ⛏️ SURVEY
                        </button>
                        <button onclick="window.ResourceMinistryEngine.executeDirective('expand_facility', '${r.id}');" style="padding:5px 4px; background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            🏭 EXPAND (+25%)
                        </button>
                        <button onclick="window.ResourceMinistryEngine.executeDirective('add_reserve', '${r.id}');" style="padding:5px 4px; background:rgba(255,215,0,0.15); border:1px solid #ffd700; color:#ffd700; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            📦 SPR (+50K)
                        </button>
                        <button onclick="window.ResourceMinistryEngine.executeDirective('focus_map', '${r.id}');" style="padding:5px 4px; background:rgba(168,85,247,0.15); border:1px solid #a855f7; color:#a855f7; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            🗺️ FOCUS MAP
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        let debatesHtml = debates.map(d => `
            <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <div style="font-size:22px; line-height:1;">${d.avatar}</div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <span style="font-size:11px; font-weight:bold; color:#f8fafc; font-family:var(--font-title);">${d.speaker.toUpperCase()} (${d.role.toUpperCase()})</span>
                            <span style="font-size:9px; padding:1px 5px; border-radius:4px; background:rgba(0,229,255,0.1); color:#00e5ff; font-family:var(--font-mono);">ADVISORY DECREE</span>
                        </div>
                        <div style="font-size:11px; color:#cbd5e1; font-style:italic; line-height:1.3; font-family:var(--font-mono);">${d.text}</div>
                    </div>
                </div>
                ${d.options ? `
                    <div style="display:flex; gap:6px; margin-top:4px; padding-left:32px;">
                        ${d.options.map(opt => `
                            <button onclick="window.ResourceMinistryEngine.executeDirective('cabinet_vote', '${d.id}', '${opt.action}');" style="padding:4px 8px; background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                                ${opt.label}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <!-- MINISTER AI EXECUTIVE BRIEFING HEADER -->
                <div style="background:linear-gradient(135deg, rgba(11,20,36,0.95), rgba(15,23,42,0.95)); border:1.5px solid #00e5ff; border-radius:12px; padding:16px; box-shadow:0 0 20px rgba(0,229,255,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,229,255,0.2); padding-bottom:10px; margin-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:28px;">🧠</span>
                            <div>
                                <div style="font-size:15px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); letter-spacing:1px;">DR. ARIS THORNE</div>
                                <div style="font-size:11px; color:#94a3b8; font-family:var(--font-mono);">Sovereign Minister of Resource Intelligence</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:10px; padding:3px 10px; border-radius:12px; background:rgba(255,215,0,0.15); border:1px solid #ffd700; color:#ffd700; font-weight:bold; font-family:var(--font-mono);">
                                AUTONOMY: ${metrics.autonomyIndex}%
                            </span>
                        </div>
                    </div>

                    <div style="font-size:12px; color:#e2e8f0; line-height:1.5; font-family:var(--font-mono); background:rgba(0,0,0,0.4); padding:12px; border-radius:8px; border-left:3px solid #00e5ff; margin-bottom:12px;">
                        ${briefingText}
                    </div>

                    <div class="ios-grid-4">
                        <div class="ios-card" style="padding:8px 12px;">
                            <div class="ios-card-title">AUTONOMY SCORE</div>
                            <div class="ios-card-val" style="color:${metrics.autonomyIndex >= 75 ? '#22c55e' : '#eab308'};">${metrics.autonomyIndex}%</div>
                        </div>
                        <div class="ios-card" style="padding:8px 12px;">
                            <div class="ios-card-title">RESERVES CAPACITY</div>
                            <div class="ios-card-val" style="color:#00e5ff;">${metrics.strategicReservesTotalDays} Days</div>
                        </div>
                        <div class="ios-card" style="padding:8px 12px;">
                            <div class="ios-card-title">ACTIVE SURVEYS</div>
                            <div class="ios-card-val" style="color:#ffd700;">${surveys.length}</div>
                        </div>
                        <div class="ios-card" style="padding:8px 12px;">
                            <div class="ios-card-title">UNIVERSAL PIPELINES</div>
                            <div class="ios-card-val" style="color:#a855f7;">17 Strategic</div>
                        </div>
                    </div>
                </div>

                <!-- ACTIVE SURVEYS TRACKER -->
                ${surveyHtml}

                <!-- 17 UNIVERSAL RESOURCE REGISTRY MATRIX -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:13px; font-weight:bold; color:#ffd700; font-family:var(--font-title); letter-spacing:0.5px;">
                            📦 NATIONAL RESOURCE REGISTRY (17 STRATEGIC PIPELINES)
                        </div>
                        <button onclick="Game.Map.toggleResourceOverlay(); if(window.CountryIOS) window.CountryIOS.close();" style="padding:5px 12px; background:rgba(255,215,0,0.2); border:1px solid #ffd700; color:#ffd700; font-size:11px; font-weight:bold; border-radius:6px; cursor:pointer;">
                            🗺️ SHOW ALL ON MAP
                        </button>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:10px; max-height:480px; overflow-y:auto; padding-right:4px;">
                        ${resGridHtml}
                    </div>
                </div>

                <!-- INTER-MINISTRY CABINET COUNCIL DEBATES -->
                <div style="background:rgba(11,20,36,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:14px;">
                    <div style="font-size:12px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); margin-bottom:10px; letter-spacing:0.5px;">
                        🏛️ INTER-MINISTRY RESOURCE CABINET COUNCIL DEBATES & POLICY VOTER
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${debatesHtml}
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

    // -------------------------------------------------------------------------
    // CHAPTER 12: WORLD ECOSYSTEM & CAUSAL DEPENDENCY ENGINE
    // -------------------------------------------------------------------------
    renderChapter12_WorldEcosystem(countryKey) {
        const profile = window.WorldEcosystemEngine ? window.WorldEcosystemEngine.getCountryProfile(countryKey) : {
            geography: { isLandlocked: false, borderLengthKm: 4500 },
            resources: { crude_oil: { importNeed: 120000 }, semiconductors: { importNeed: 2000000 } },
            population: { total: 330000000, happinessScore: 72 },
            government: { cabinetStability: 80, corruptionIndex: 25 },
            aiPersonality: { aggressiveExpansion: 35, riskTolerance: 40, pragmaticRealism: 75, strategicVision: 80 },
            media: { pressFreedomIndex: 75 },
            tech: { semiconductorFabDominance: 60, cyberAttackPower: 85 },
            blocs: ["NATO", "AUKUS"],
            influenceSphere: "Western / Transatlantic"
        };

        const logs = window.WorldEcosystemEngine ? window.WorldEcosystemEngine.getCausalEventLog() : [];
        const countryName = countryKey.replace(/_/g, " ");

        return `
            <div class="command-tactical-container" style="display:flex; flex-direction:column; gap:16px;">
                <!-- HEADER BANNER -->
                <div class="tactical-header-banner" style="background: linear-gradient(135deg, rgba(0,229,255,0.15), rgba(15,23,42,0.9)); border:1px solid var(--omega-neon); padding:16px; border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-family:var(--font-title); font-size:18px; color:var(--omega-neon); font-weight:bold;">
                                🌐 LIVING WORLD STATE ECOSYSTEM & CAUSAL DEPENDENCY ENGINE
                            </div>
                            <div style="font-family:var(--font-mono); font-size:12px; color:#cbd5e1; margin-top:4px;">
                                Sovereign State: <strong style="color:#fff;">${countryName}</strong> | Systemic Interconnected Architecture (15 Active Ecosystem Subsystems)
                            </div>
                        </div>
                        <div style="background:rgba(0,229,255,0.1); border:1px solid #00e5ff; color:#00e5ff; padding:6px 14px; border-radius:8px; font-family:var(--font-mono); font-size:12px; font-weight:bold;">
                            SYSTEMIC STATUS: ONLINE
                        </div>
                    </div>
                </div>

                <!-- ⚡ LIVE CAUSAL CASCADE CONTROLLER & LOG VISUALIZER -->
                <div style="background:rgba(2,11,20,0.85); border:1px solid var(--omega-border); border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,229,255,0.2); padding-bottom:10px;">
                        <div style="font-family:var(--font-title); color:#ffd700; font-size:14px; font-weight:bold; display:flex; align-items:center; gap:8px;">
                            <span>⚡</span><span>MULTI-STEP CAUSAL CASCADE SIMULATOR</span>
                        </div>
                        <span style="font-size:11px; font-family:var(--font-mono); color:#94a3b8;">Trigger real-time downstream feedback loops</span>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                        <button onclick="window.WorldEcosystemEngine && window.WorldEcosystemEngine.triggerCausalCascade({ originCountry: '${countryKey}', targetCountry: 'CHN', type: 'TRADE_SANCTION', severity: 1.5 }); window.CountryIOS.switchChapter(12);" style="background:linear-gradient(180deg, rgba(239,68,68,0.25), rgba(153,27,27,0.4)); border:1px solid #ef4444; color:#fca5a5; padding:10px; border-radius:8px; font-family:var(--font-mono); font-size:12px; font-weight:bold; cursor:pointer; text-align:left;">
                            🛑 High-Tech Semiconductor Embargo
                        </button>
                        <button onclick="window.WorldEcosystemEngine && window.WorldEcosystemEngine.triggerCausalCascade({ originCountry: '${countryKey}', targetCountry: 'RUS', type: 'TARIFF_HIKE', severity: 2.0 }); window.CountryIOS.switchChapter(12);" style="background:linear-gradient(180deg, rgba(245,158,11,0.25), rgba(180,83,9,0.4)); border:1px solid #f59e0b; color:#fde68a; padding:10px; border-radius:8px; font-family:var(--font-mono); font-size:12px; font-weight:bold; cursor:pointer; text-align:left;">
                            🛢️ Crude Oil & Gas Export Sanction
                        </button>
                        <button onclick="window.WorldEcosystemEngine && window.WorldEcosystemEngine.triggerCausalCascade({ originCountry: '${countryKey}', targetCountry: 'IRN', type: 'MILITARY_MOBILIZATION', severity: 1.8 }); window.CountryIOS.switchChapter(12);" style="background:linear-gradient(180deg, rgba(16,185,129,0.25), rgba(4,120,87,0.4)); border:1px solid #10b981; color:#a7f3d0; padding:10px; border-radius:8px; font-family:var(--font-mono); font-size:12px; font-weight:bold; cursor:pointer; text-align:left;">
                            ⚔️ Border Force Mobilization
                        </button>
                    </div>

                    <!-- Live Causal Cascade Log -->
                    <div style="background:rgba(0,0,0,0.6); border:1px solid rgba(0,229,255,0.2); border-radius:8px; padding:12px; max-height:260px; overflow-y:auto; font-family:var(--font-mono); font-size:12px;">
                        <div style="color:#00e5ff; font-weight:bold; margin-bottom:8px; display:flex; justify-content:space-between;">
                            <span>📜 LATEST CAUSAL CASCADE REACTION FEED:</span>
                            <span style="color:#94a3b8; font-size:10px;">Showing real-time feedback steps</span>
                        </div>
                        ${logs.length === 0 ? '<div style="color:#64748b;">No recent causal cascade events triggered. Click a trigger button above to initiate a multi-node systemic cascade.</div>' : ''}
                        ${logs.map(log => `
                            <div style="border-left:3px solid #00e5ff; padding-left:10px; margin-bottom:12px;">
                                <div style="color:#ffd700; font-weight:bold; font-size:11px;">
                                    [${log.timestamp.substring(11,19)}] Event: ${log.eventType} (${log.origin} ➔ ${log.target}) | Severity: ${log.severity}x
                                </div>
                                <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px;">
                                    ${log.steps.map(s => `
                                        <div style="background:rgba(15,23,42,0.8); padding:6px 10px; border-radius:4px; border:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;">
                                            <span style="color:#38bdf8;">Step ${s.step} [${s.layer}]: ${s.node}</span>
                                            <span style="color:#a7f3d0; font-weight:bold;">${s.impact}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- 🧠 SOVEREIGN AI COGNITIVE PERSONALITY & DEPENDENCY GRAPH -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    <!-- AI Cognitive Dimensions -->
                    <div style="background:rgba(2,11,20,0.85); border:1px solid var(--omega-border); border-radius:10px; padding:16px;">
                        <div style="font-family:var(--font-title); color:#00e5ff; font-size:13px; font-weight:bold; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                            <span>🧠</span><span>SOVEREIGN AI COGNITIVE PERSONALITY (10 DIMENSIONS)</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-family:var(--font-mono); font-size:11px;">
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Aggressive Expansion:</span>
                                <div style="color:#f87171; font-weight:bold; font-size:13px;">${profile.aiPersonality.aggressiveExpansion}/100</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Risk Tolerance:</span>
                                <div style="color:#fbbf24; font-weight:bold; font-size:13px;">${profile.aiPersonality.riskTolerance}/100</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Pragmatic Realism:</span>
                                <div style="color:#34d399; font-weight:bold; font-size:13px;">${profile.aiPersonality.pragmaticRealism}/100</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Strategic Vision:</span>
                                <div style="color:#38bdf8; font-weight:bold; font-size:13px;">${profile.aiPersonality.strategicVision}/100</div>
                            </div>
                        </div>
                    </div>

                    <!-- Strategic Blocs & Chokepoints -->
                    <div style="background:rgba(2,11,20,0.85); border:1px solid var(--omega-border); border-radius:10px; padding:16px;">
                        <div style="font-family:var(--font-title); color:#ffd700; font-size:13px; font-weight:bold; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                            <span>🏛️</span><span>ACTIVE ALLIANCE BLOCS & CHOKEPOINT CONTROL</span>
                        </div>
                        <div style="font-family:var(--font-mono); font-size:11px; display:flex; flex-direction:column; gap:8px;">
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Active Alliance Blocs:</span>
                                <div style="color:#00e5ff; font-weight:bold; font-size:12px; margin-top:2px;">
                                    ${(profile.blocs || []).join(", ") || "Non-Aligned / Independent"}
                                </div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Influence Sphere:</span>
                                <div style="color:#a7f3d0; font-weight:bold; font-size:12px; margin-top:2px;">
                                    ${profile.influenceSphere || "Western / Transatlantic"}
                                </div>
                            </div>
                        </div>
                    </div>
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
            "06 DIPLOMACY", "07 INTELLIGENCE", "08 INFRASTRUCTURE", "09 TECHNOLOGY", "10 SOCIETY", "11 OPERATIONS", "12 WORLD ECOSYSTEM"
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
            11: `<strong>OPERATIONS ADVICE:</strong> Optimal executive action: Propose Trade Accord or Establish Embassy to solidify strategic dominance.`,
            12: `<strong>WORLD ECOSYSTEM ADVICE:</strong> Execute a targeted Causal Cascade or inspect structural Node Dependencies to analyze multi-tier systemic feedback loops.`
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

window.addEventListener('RESOURCE_STATE_UPDATED', () => {
    if (window.CountryIOS && window.CountryIOS.activeChapter === 5 && window.CountryIOS.activeCountry) {
        window.CountryIOS.switchChapter(5);
    }
});
