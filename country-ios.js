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
        this.activeCountry = (countryName || window.OmegaMinistryViewCountry || (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || "USA").toUpperCase();
        window.OmegaMinistryViewCountry = this.activeCountry;
        if (window.OmegaCabinetUI) window.OmegaCabinetUI.activeCountry = this.activeCountry;
        try {
            window.dispatchEvent(new CustomEvent('OMEGA_COUNTRY_CONTEXT_CHANGED', {
                detail: { countryId: this.activeCountry, source: 'CountryIOS.open' }
            }));
        } catch (_) {}
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

        // Refresh the active view after the shared registry becomes ready.
        const countryRuntime = window.OmegaCountryRuntimeData;
        const requestedCountry = this.activeCountry;
        if (countryRuntime && countryRuntime.ready && typeof countryRuntime.isSettled === 'function' &&
            !countryRuntime.isSettled()) {
            const pendingRefreshes = this._countryRuntimeRefreshPending ||
                (this._countryRuntimeRefreshPending = new Set());
            if (!pendingRefreshes.has(requestedCountry)) {
                pendingRefreshes.add(requestedCountry);
                Promise.resolve(countryRuntime.ready).then(() => {
                    pendingRefreshes.delete(requestedCountry);
                    if (this.activeCountry === requestedCountry) {
                        this.updateHeader();
                        this.switchChapter(this.activeChapter);
                    }
                }).catch(() => { pendingRefreshes.delete(requestedCountry); });
            }
        }

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

    readCountryValue(countryKey, domains, paths) {
        const requested = String(countryKey || '').trim();
        const observer = window.OmegaLiveOpsObservability;
        const resolved = observer && typeof observer.resolveCountryId === 'function'
            ? observer.resolveCountryId(requested) : null;
        const runtime = window.OmegaCountryRuntimeData;
        const identity = runtime && typeof runtime.resolveCountry === 'function'
            ? runtime.resolveCountry(requested) : null;
        const normalise = value => String(value == null ? '' : value).trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const candidates = new Set([
            requested, resolved, identity && identity.countryCode, identity && identity.iso3,
            identity && identity.numericCode, identity && identity.name, identity && identity.economyKey,
            identity && identity.populationKey
        ].filter(Boolean).map(normalise));
        const roots = [
            window.Game && window.Game.state,
            window.gameState,
            window.Omega && window.Omega.Simulation && window.Omega.Simulation.state,
            window.Omega && window.Omega.World && window.Omega.World.state
        ].filter((item, index, all) => item && typeof item === 'object' && all.indexOf(item) === index);
        const domainList = Array.isArray(domains) ? domains : [domains];
        const pathList = Array.isArray(paths) ? paths : [paths];
        const scalarAtPath = record => {
            if (!record || typeof record !== 'object') return null;
            for (const path of pathList) {
                let value = record;
                for (const part of String(path || '').split('.')) value = value == null ? undefined : value[part];
                if (value === null || value === undefined || value === '' || typeof value === 'object') continue;
                if ((typeof value === 'number' && Number.isFinite(value)) ||
                    typeof value === 'string' || typeof value === 'boolean') return value;
            }
            return null;
        };

        for (const domain of domainList) {
            for (const state of roots) {
                const records = state && state[domain];
                if (!records || typeof records !== 'object') continue;
                let row = null;
                for (const [key, value] of Object.entries(records)) {
                    const embedded = value && (value.countryId || value.countryCode || value.iso2 ||
                        value.iso3 || value.countryName || value.country_name || value.name);
                    if (candidates.has(normalise(key)) || candidates.has(normalise(embedded))) {
                        row = value;
                        break;
                    }
                }
                const value = scalarAtPath(row);
                if (value !== null) return value;
            }

            if (runtime && typeof runtime.getRecord === 'function') {
                const value = scalarAtPath(runtime.getRecord(domain, requested));
                if (value !== null) return value;
            }
        }
        return null;
    },

    formatCountryValue(countryKey, domains, paths, unit = '') {
        const value = this.readCountryValue(countryKey, domains, paths);
        if (value === null || value === undefined || value === '') return 'NOT RECORDED';
        if (typeof value === 'number') {
            const formatter=window.OmegaNumberFormat;
            const formatted = formatter && typeof formatter.compact === 'function' ? formatter.compact(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
            return unit ? formatted + ' ' + unit : formatted;
        }
        const text = String(value);
        if (unit && typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(text.trim())) return text.trim() + ' ' + unit;
        return text;
    },

    renderCountryPercentBar(countryKey, domains, paths, label) {
        const raw = this.readCountryValue(countryKey, domains, paths);
        const value = typeof raw === 'number' ? raw :
            (typeof raw === 'string' && raw.trim() !== '' && /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : null);
        if (value === null || !Number.isFinite(value) || value < 0 || value > 100) {
            return '<p class="ios-card-sub">' + String(label || 'Metric') + ': NOT RECORDED; chart omitted until a valid 0-100 value exists.</p>';
        }
        return '<div style="background:rgba(255,255,255,0.1);border-radius:6px;height:18px;overflow:hidden;margin-top:6px;">' +
            '<div style="width:' + value + '%;background:linear-gradient(90deg,#00e5ff,#22c55e);height:100%;"></div></div>' +
            '<span class="ios-card-sub" style="margin-top:4px;">' + String(label || 'Metric') + ': ' + value.toLocaleString(undefined,{maximumFractionDigits:2}) + '%</span>';
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
        const normKey = (countryKey || '').toUpperCase().replace(/[-\s]/g, '_');
        const countryRuntime = window.OmegaCountryRuntimeData;
        const liveEconomy = (window.Game && window.Game.state && window.Game.state.economy) ||
            (window.gameState && window.gameState.economy) || {};
        const livePopulation = (window.Game && window.Game.state && window.Game.state.population) ||
            (window.gameState && window.gameState.population) || {};
        const lookupByKey = (records, candidates) => {
            for (const candidate of candidates) {
                const hit = Object.keys(records).find(key => key.toUpperCase().replace(/[-\s]/g, '_') ===
                    String(candidate || '').toUpperCase().replace(/[-\s]/g, '_'));
                if (hit !== undefined) return records[hit];
            }
            return null;
        };
        const identity = countryRuntime && countryRuntime.resolveCountry(countryKey);
        const keys = [countryKey, normKey, identity && identity.countryCode, identity && identity.iso3,
            identity && identity.name, identity && identity.economyKey, identity && identity.populationKey];
        const econ = (countryRuntime && countryRuntime.getRecord('economy', countryKey)) ||
            lookupByKey(liveEconomy, keys) || null;
        const pop = (countryRuntime && countryRuntime.getRecord('population', countryKey)) ||
            lookupByKey(livePopulation, keys) || null;
        const relationState = (window.Game && window.Game.state && window.Game.state.relations) ||
            (window.gameState && window.gameState.relations) || {};
        const rel = lookupByKey(relationState, keys) || {};

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
        const countryRuntime = window.OmegaCountryRuntimeData;
        const identity = countryRuntime && countryRuntime.resolveCountry(countryKey);
        const profile = countryRuntime && countryRuntime.getProfile(countryKey);
        const nameClean = (identity && identity.name ? identity.name : countryKey).replace(/_/g, " ");
        const capital = (countryRuntime && countryRuntime.getCapital(countryKey)) || "NOT RECORDED";
        const gdp = econ && econ.gdp;
        const population = pop && pop.population_2015;
        const influence = profile && profile.indicators && profile.indicators.economicInfluenceIndex;
        const cashVal = gdp !== null && gdp !== undefined && gdp !== '' && Number.isFinite(Number(gdp))
            ? (Math.abs(Number(gdp)) >= 1e9 ? '$' + (Number(gdp) / 1e9).toFixed(2) + 'B' : '$' + (Number(gdp) / 1e6).toFixed(2) + 'M')
            : "NOT RECORDED";
        const influenceVal = typeof influence === 'number' && Number.isFinite(influence)
            ? influence.toFixed(1) + '/100' : "NOT RECORDED";
        const popVal = population !== null && population !== undefined && population !== '' && Number.isFinite(Number(population))
            ? (Number(population) / 1e6).toFixed(1) + "M" : "NOT RECORDED";
        const relationVal = (rel && rel.standing !== undefined && rel.standing !== null && rel.standing !== '')
            ? rel.standing : "NOT RECORDED";
        const flag = (countryRuntime && countryRuntime.flagFor(countryKey)) || "🏳️";

        return `
            <div class="command-tactical-container">
                <!-- 🚩 GRAND DIPLOMATIC STRATEGIC BANNER -->
                <div class="tactical-header-banner">
                    <div class="banner-flag-badge">${flag}</div>
                    <div class="banner-title-box">
                        <h2 class="banner-country-title">${nameClean.toUpperCase()} · ${capital.toUpperCase()}</h2>
                        <div class="banner-metrics-row">
                            <span class="metric-item">🪙 <strong style="color:#fcd34d;">${cashVal}</strong></span>
                            <span class="metric-item" title="Repository-derived economic influence index"><strong style="color:#f43f5e;">📊 ${influenceVal}</strong></span>
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
                        <div class="ios-card-val" style="color:#00e5ff;">${this.formatCountryValue(countryKey, ['government','politics'], ['headOfState.title','leader.title','leaderTitle','headOfState','executiveTitle'])}</div>
                        <div class="ios-card-sub">Term: ${this.formatCountryValue(countryKey, ['government','politics'], ['termLengthYears','leader.termYears','termYears'], 'years')} | Approval: ${this.formatCountryValue(countryKey, ['government','politics'], ['approvalRatingPercent','approvalRating','leader.approvalPercent'], '%')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">ADMINISTRATIVE EFFICIENCY</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['government','politics'], ['administrativeEfficiencyPercent','administrativeEfficiency','efficiencyPercent'], '%')}</div>
                        <div class="ios-card-sub">Corruption Index: ${this.formatCountryValue(countryKey, ['government','politics'], ['corruptionIndex','governance.corruptionIndex','corruption.score'])}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">CONSTITUTION & SYSTEM</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['government','politics'], ['systemType','governmentSystem','constitutionalSystem','regimeType'])}</div>
                        <div class="ios-card-sub">Next Election: ${this.formatCountryValue(countryKey, ['government','politics'], ['nextElectionDate','nextElection','election.nextDate'])}</div>
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
                            <div>🔵 Coalition Majority: ${this.formatCountryValue(countryKey, ['government','politics'], ['coalitionSeatsPercent','legislature.coalitionSharePercent','parliament.coalitionPercent'], '%')} Seats</div>
                            <div>🔴 Loyal Opposition: ${this.formatCountryValue(countryKey, ['government','politics'], ['oppositionSeatsPercent','legislature.oppositionSharePercent','parliament.oppositionPercent'], '%')} Seats</div>
                            <div>🟢 Independent Caucus: ${this.formatCountryValue(countryKey, ['government','politics'], ['independentSeatsPercent','legislature.independentSharePercent','parliament.independentPercent'], '%')} Seats</div>
                            <div style="margin-top:4px; color:#00e5ff;">Legislative Efficiency Score: ${this.formatCountryValue(countryKey, ['government','politics'], ['legislativeEfficiency','legislature.efficiency','parliament.efficiencyScore'])}/100</div>
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
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['military','defense'], ['forceStructure.divisions','army.divisions','armyDivisions','divisions'])} Active Divisions</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['military','defense'], ['forceStructure.personnel','forceStructure.activePersonnel','army.personnel','activePersonnel','personnel','manpower'])} Troops</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">NAVY FLEET</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['military','defense'], ['navy.carrierStrikeGroups','carrierStrikeGroups','navy.carrierGroups'])} Carrier Strike Groups</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['military','defense'], ['navy.warships','navy.shipCount','warships','navalVessels'])} Warships</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">AIR FORCE</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['military','defense'], ['airForce.fighterJets','fighterJets','aircraft.fighterJets'])} Fighter Jets</div>
                        <div class="ios-card-sub">Stealth Readiness ${this.formatCountryValue(countryKey, ['military','defense'], ['stealthReadinessPercent','stealth.readinessPercent','airForce.stealthReadiness'], '%')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">MISSILE & NUCLEAR</div>
                        <div class="ios-card-val" style="color:#ef4444;">${this.formatCountryValue(countryKey, ['military','defense'], ['deterrentStatus','nuclearDeterrent.status','missileDeterrent.status'])}</div>
                        <div class="ios-card-sub">Air Defense Interception: ${this.formatCountryValue(countryKey, ['military','defense'], ['airDefenseInterceptionPercent','airDefense.interceptionPercent','interceptionRate'], '%')}</div>
                    </div>
                </div>

                <div class="ios-grid-2">
                    <div class="ios-card">
                        <div class="ios-card-title">DEFENSE READINESS & LOGISTICS</div>
                        <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:8px;">
                            <div>Overall Military Readiness: <strong style="color:#22c55e;">${this.formatCountryValue(countryKey, ['military','defense'], ['readiness','overallReadinessPercent','combatReadiness'], '%')}</strong></div>
                            <div>Reserve Force Strength: ${this.formatCountryValue(countryKey, ['military','defense'], ['reservePersonnel','forceStructure.reservePersonnel','reserves.personnel'])} Personnel</div>
                            <div>Strategic Base Installations: ${this.formatCountryValue(countryKey, ['military','defense'], ['baseInstallations','bases.length','installationsCount'])} Major HQ Command Posts</div>
                            <div>Annual Defense Budget: ${this.formatCountryValue(countryKey, ['finance','military','defense'], ['defenseBudget','budget.defense','annualDefenseBudget'])}</div>
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
                            <text x="50" y="54" text-anchor="middle" fill="#94a3b8" font-size="7">NO BASE DATA</text>
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
        const fmtNum = window.formatGameNumber || ((n) => String.fromCharCode(36) + (n/1e9).toFixed(1) + String.fromCharCode(66));
        const nameClean = countryKey.replace(/_/g, " ").toUpperCase();
        const observer = window.OmegaLiveOpsObservability;
        const countryId = observer && typeof observer.resolveCountryId === 'function'
            ? observer.resolveCountryId(countryKey) : countryKey;
        const escapeHtml = value => String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const numberOrNull = value => {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string' && value.trim() !== '' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        };
        const gdpSeries = observer && typeof observer.getTrendSeries === 'function'
            ? (observer.getTrendSeries(countryId, 'economy') || []).find(row => row.key === 'gdp') : null;
        const gdpPoints = (gdpSeries && Array.isArray(gdpSeries.points) ? gdpSeries.points : [])
            .filter(point => numberOrNull(point.turn) !== null && numberOrNull(point.value) !== null).slice(-5);
        const gdpChartStatus = gdpPoints.length >= 2 ? 'RECORDED SIMULATION TURNS' : 'HISTORY NOT RECORDED';
        let gdpChartHtml = '<p style="padding:18px 6px;color:#94a3b8;font-size:12px;line-height:1.5;">No multi-turn GDP history is recorded for this country yet. The chart will appear after the engine has committed at least two real numeric GDP observations.</p>';
        if (gdpPoints.length >= 2) {
            const vals = gdpPoints.map(point => Number(point.value));
            const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
            const points = gdpPoints.map((point, index) => ({
                x: 18 + index / Math.max(1, gdpPoints.length - 1) * 344,
                y: 88 - ((Number(point.value) - lo) / span) * 62,
                value: Number(point.value), turn: Number(point.turn)
            }));
            const line = points.map(point => point.x.toFixed(1) + ',' + point.y.toFixed(1)).join(' ');
            gdpChartHtml = '<svg width="100%" height="130" viewBox="0 0 380 110" preserveAspectRatio="none" role="img" aria-label="Recorded GDP by simulation turn">' +
                '<line x1="16" y1="96" x2="364" y2="96" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>' +
                '<polyline points="' + line + '" fill="none" stroke="#00e5ff" stroke-width="3"/>' +
                points.map(point => '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="3.5" fill="#00e5ff"><title>T' + point.turn + ': ' + escapeHtml(point.value) + '</title></circle>').join('') +
                '<text x="18" y="108" fill="#64748b" font-size="9" font-family="monospace">T' + gdpPoints[0].turn + '</text>' +
                '<text x="362" y="108" text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">T' + gdpPoints[gdpPoints.length - 1].turn + '</text>' +
                '</svg>';
        }
        const normaliseBreakdown = raw => {
            let rows = [];
            if (Array.isArray(raw)) rows = raw.map((row, index) => ({ label: row && (row.name || row.label || row.sector || row.id) || 'Sector ' + (index + 1), row }));
            else if (raw && typeof raw === 'object') rows = Object.entries(raw).map(([label, row]) => ({ label, row }));
            rows = rows.map(item => {
                const row = item.row && typeof item.row === 'object' ? item.row : { value: item.row };
                const share = numberOrNull(row.percentage ?? row.percent ?? row.sharePercent ?? row.gdpSharePercent);
                const fraction = numberOrNull(row.share ?? row.fraction ?? row.shareOfGDP);
                const value = numberOrNull(row.gdp ?? row.gdpValue ?? row.output ?? row.value ?? row.amount ?? row.total ?? row.nominalValue);
                return { label: String(item.label), percent: share !== null ? share : fraction !== null && fraction >= 0 && fraction <= 1 ? fraction * 100 : null, value };
            }).filter(row => row.percent !== null || row.value !== null);
            const rawTotal = rows.reduce((sum, row) => sum + (row.value !== null && row.value > 0 ? row.value : 0), 0);
            return rows.map(row => {
                const percent = row.percent !== null ? row.percent : rawTotal > 0 && row.value !== null ? row.value / rawTotal * 100 : null;
                return { ...row, percent: percent !== null && Number.isFinite(percent) && percent >= 0 ? Math.min(100, percent) : null };
            }).filter(row => row.percent !== null);
        };
        const sectorSource = econ && (econ.sectoralBreakdown || econ.sectorBreakdown || econ.sectors ||
            econ.gdpBySector || econ.sectorGDP || econ.sectorOutput || econ.outputBySector);
        const sectorRows = normaliseBreakdown(sectorSource);
        const sectorRowsHtml = sectorRows.length
            ? sectorRows.map(row => '<div><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px;"><span>' +
                escapeHtml(row.label.replace(/_/g, ' ').toUpperCase()) + '</span><strong>' + row.percent.toFixed(1) +
                '%</strong></div><div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;"><div style="width:' +
                row.percent.toFixed(2) + '%;height:100%;background:#38bdf8;"></div></div></div>').join('')
            : '<p style="color:#94a3b8;font-size:12px;line-height:1.5;">Sector-level GDP/output values are not present in the selected economy record. No example percentages are substituted.</p>';
        
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
                        <div class="ios-card-val" style="color:#00e5ff;">${(econ && econ.gdp) ? fmtNum(econ.gdp) : "DATA PENDING"}</div>
                        <div class="ios-card-sub">Annual Growth: <strong style="color:#22c55e;">${(econ && econ.gdp_growth !== undefined) ? '+' + econ.gdp_growth + '% / yr' : '—'}</strong></div>
                    </div>
                    <div class="ios-card" style="border-left:3px solid #ef4444;">
                        <div class="ios-card-title">SOVEREIGN NATIONAL DEBT</div>
                        <div class="ios-card-val" style="color:#ef4444;">${(econ && econ.debt) ? fmtNum(econ.debt) : "DATA PENDING"}</div>
                        <div class="ios-card-sub">Debt-to-GDP Ratio: <strong style="color:#ffd700;">${(econ && econ.gdp && econ.debt) ? ((econ.debt / econ.gdp) * 100).toFixed(1) + '%' : '—'}</strong></div>
                    </div>
                    <div class="ios-card" style="border-left:3px solid #ffd700;">
                        <div class="ios-card-title">UNEMPLOYMENT & INFLATION</div>
                        <div class="ios-card-val" style="color:#ffd700;">${(econ && econ.unemployment_rate !== undefined) ? econ.unemployment_rate + '%' : '—'} / ${(econ && econ.inflation_rate !== undefined) ? econ.inflation_rate + '%' : '—'}</div>
                        <div class="ios-card-sub">Labor Index: ${(econ && econ.unemployment_rate !== undefined) ? (100 - econ.unemployment_rate).toFixed(1) + '% Active' : '—'}</div>
                    </div>
                    <div class="ios-card" style="border-left:3px solid #22c55e;">
                        <div class="ios-card-title">FOREIGN TRADE BALANCE</div>
                        <div class="ios-card-val" style="color:#22c55e;">${(econ && econ.trade_balance !== undefined) ? fmtNum(econ.trade_balance) : 'SOVEREIGN LEDGER'}</div>
                        <div class="ios-card-sub">Forex Reserves: ${(econ && econ.forex_reserves) ? fmtNum(econ.forex_reserves) : '—'}</div>
                    </div>
                </div>

                <!-- HIGH VISIBILITY HIGH-TECH GRAPH & METERS -->
                <div class="ios-grid-2">
                    <div class="ios-chart-box" style="background:rgba(15,23,42,0.8); border:1px solid rgba(0,229,255,0.2); padding:14px; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <span style="font-size:11px; color:#00e5ff; font-family:var(--font-mono); font-weight:bold;">OBSERVED GDP BY SIMULATION TURN</span>
                            <span style="font-size:10px; color:#22c55e; font-family:var(--font-mono);">${gdpChartStatus}</span>
                        </div>
                        ${gdpChartHtml}
                    </div>

                    <div class="ios-chart-box" style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,215,0,0.2); padding:14px; border-radius:8px;">
                        <div style="font-size:11px; color:#ffd700; font-family:var(--font-mono); font-weight:bold; margin-bottom:12px;">🏭 ECONOMIC SECTORAL BREAKDOWN</div>
                        ${sectorRowsHtml}
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
        const nrms = window.ResourceMinistryEngine ? window.ResourceMinistryEngine.getSummary(countryKey) : null;
        
        if (!nrms) {
            return `<div style="padding:20px; color:#ef4444; font-family:'Share Tech Mono', monospace;">Resource Intelligence Engine Offline.</div>`;
        }

        const briefingText = nrms.briefing;
        const metrics = nrms.globalMetrics;
        const resList = nrms.resourcesList;
        const fmtObserved = value => {
            if (value === null || value === undefined || value === '') return 'NOT RECORDED';
            const number = typeof value === 'number' ? value :
                (typeof value === 'string' && /^-?\\d+(?:\\.\\d+)?$/.test(value.trim()) ? Number(value) : null);
            return number !== null && Number.isFinite(number)
                ? (window.OmegaNumberFormat && typeof window.OmegaNumberFormat.compact === 'function' ? window.OmegaNumberFormat.compact(number) : number.toLocaleString(undefined, { maximumFractionDigits: 2 })) : 'NOT RECORDED';
        };
        const numericObserved = value => value !== null && value !== undefined && value !== '' &&
            Number.isFinite(typeof value === 'number' ? value : (typeof value === 'string' && /^-?\\d+(?:\\.\\d+)?$/.test(value.trim()) ? Number(value) : NaN));
        const debates = nrms.debates || [];
        const surveys = metrics.surveysUnderway || [];

        const profile25 = window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.getCountryResourceProfile === 'function' ? window.ResourceMinistryEngine.getCountryResourceProfile(countryKey) : null;
        
        const launchBannerHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(90deg, rgba(0,229,255,0.18), rgba(168,85,247,0.18), rgba(234,179,8,0.15)); border:1.5px solid #00e5ff; border-radius:10px; padding:12px 16px; margin-bottom:12px; box-shadow:0 0 25px rgba(0,229,255,0.25); flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:24px; padding:6px; background:rgba(0,229,255,0.1); border-radius:8px; border:1px solid rgba(0,229,255,0.3);">💎</span>
                    <div>
                        <div style="font-size:14px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); display:flex; align-items:center; gap:8px;">
                            <span>GSRSK RESOURCE MINISTRY & GLOBAL INTELLIGENCE HUB</span>
                            <span style="font-size:10px; padding:1px 6px; border-radius:8px; background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e;">${nrms.briefing && nrms.briefing.indexOf('Live resource values are read from Game.state.resource') === 0 ? 'LIVE SOURCE ATTACHED' : 'RUNTIME STATE UNAVAILABLE'}</span>
                        </div>
                        <div style="font-size:10px; color:#cbd5e1; font-family:var(--font-mono); margin-top:2px;">
                            Indexed deposit and commodity records • Recorded market data • Resource cascade diagnostics
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:6px;">
                    <button onclick="if(window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.openModal === 'function') window.ResourceMinistryEngine.openModal('${countryKey}', 'cascade')" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; font-weight:bold; font-family:var(--font-mono); padding:8px 12px; border-radius:6px; cursor:pointer; font-size:11px;">
                        ⚠️ CASCADE SANDBOX
                    </button>
                    <button onclick="if(window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.openModal === 'function') window.ResourceMinistryEngine.openModal('${countryKey}', 'matrix')" style="background:linear-gradient(135deg, #00e5ff, #0066ff); border:none; color:#000; font-weight:bold; font-family:var(--font-mono); padding:8px 16px; border-radius:6px; cursor:pointer; font-size:11px; box-shadow:0 0 12px rgba(0,229,255,0.5);">
                        ⚡ LAUNCH FULL RESOURCE HUB
                    </button>
                </div>
            </div>
        `;
        
        let profile25Html = "";
        if (profile25) {
            const id = profile25.identity || {};
            const geo = profile25.geography || {};
            const dom = profile25.resource_domain || {};
            const geol = profile25.geological_context || {};
            const min = profile25.mineral_resource_base || {};
            const hc = profile25.hydrocarbon_resource_base || {};
            const eng = profile25.energy_resource_base || {};
            const infra = profile25.resource_infrastructure_context || {};
            const regHubs = profile25.administrative_resource_regions || [];
            const prov = profile25.provenance || {};

            profile25Html = `
                <div style="background:linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95)); border:1.5px solid #ffd700; border-radius:12px; padding:16px; margin-top:12px; margin-bottom:4px; box-shadow:0 0 25px rgba(255,215,0,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,215,0,0.3); padding-bottom:10px; margin-bottom:12px;">
                        <div>
                            <div style="font-size:15px; font-weight:bold; color:#ffd700; font-family:var(--font-title); letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                                <span>🏛️</span>
                                <span>${id.name ? id.name.toUpperCase() : countryKey} CANONICAL GSRSK COUNTRY RESOURCE PROFILE</span>
                            </div>
                            <div style="font-size:11px; color:#94a3b8; font-family:var(--font-mono); margin-top:2px;">
                                Official Name: ${id.officialName || id.name} • System ID: ${id.resourceSystemId || 'N/A'} • Region: ${id.region || id.subcontinent || 'Global'}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:10px; padding:3px 10px; border-radius:12px; background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; font-weight:bold; font-family:var(--font-mono);">
                                PROFILE SECTIONS: ${Object.keys(profile25).length}
                            </span>
                        </div>
                    </div>

                    <!-- GEOGRAPHY & DOMAIN STATS -->
                    <div class="ios-grid-4" style="margin-bottom:12px;">
                        <div class="ios-card" style="padding:8px 10px;">
                            <div class="ios-card-title">CAPITAL & LAND AREA</div>
                            <div class="ios-card-val" style="font-size:12px; color:#00e5ff;">${geo.capital || 'N/A'}</div>
                            <div class="ios-card-sub">${geo.landAreaKm2 ? (window.OmegaNumberFormat && window.OmegaNumberFormat.compact ? window.OmegaNumberFormat.compact(geo.landAreaKm2) : geo.landAreaKm2.toLocaleString()) + ' km²' : 'Land Area'}</div>
                        </div>
                        <div class="ios-card" style="padding:8px 10px;">
                            <div class="ios-card-title">RICHNESS CLASS</div>
                            <div class="ios-card-val" style="font-size:12px; color:#ffd700;">${dom.resourceRichnessClass || 'NOT RECORDED'}</div>
                            <div class="ios-card-sub">Diversity: ${dom.resourceDiversityClass || 'NOT RECORDED'}</div>
                        </div>
                        <div class="ios-card" style="padding:8px 10px;">
                            <div class="ios-card-title">KNOWN RESOURCES</div>
                            <div class="ios-card-val" style="font-size:12px; color:#22c55e;">${Number.isFinite(Number(dom.majorResourceCount)) ? Number(dom.majorResourceCount) : 'NOT RECORDED'} Major Types</div>
                            <div class="ios-card-sub">Strategic: ${Number.isFinite(Number(dom.strategicResourceCount)) ? Number(dom.strategicResourceCount) : 'NOT RECORDED'}</div>
                        </div>
                        <div class="ios-card" style="padding:8px 10px;">
                            <div class="ios-card-title">VERIFICATION STATUS</div>
                            <div class="ios-card-val" style="font-size:12px; color:#a855f7;">${prov.dataConfidence || 'CONFIDENCE NOT RECORDED'}</div>
                            <div class="ios-card-sub">Verified: ${prov.lastVerified || 'NOT RECORDED'}</div>
                        </div>
                    </div>

                    <!-- ADMINISTRATIVE RESOURCE REGIONS -->
                    ${regHubs.length > 0 ? `
                        <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(0,229,255,0.2); border-radius:8px; padding:10px; margin-bottom:12px;">
                            <div style="font-size:11px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); margin-bottom:6px;">
                                📍 REGIONAL RESOURCE HUBS & EXTRACTIVE ZONES (${regHubs.length})
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:6px;">
                                ${regHubs.map(r => `
                                    <div style="background:rgba(15,23,42,0.8); padding:6px 8px; border-radius:4px; border-left:2px solid #00e5ff;">
                                        <div style="font-size:11px; font-weight:bold; color:#f8fafc; font-family:var(--font-mono);">${r.name}</div>
                                        <div style="font-size:10px; color:#94a3b8; font-family:var(--font-mono);">${r.type || 'Hub'} • ${(r.resourceTags || []).join(', ')}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- GEOLOGICAL & MINERAL ENDOWMENT DETAILS -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
                            <div style="font-size:11px; font-weight:bold; color:#ffd700; font-family:var(--font-title); margin-bottom:6px;">🪨 GEOLOGICAL & SEDIMENTARY BASINS</div>
                            <div style="font-size:10px; color:#cbd5e1; font-family:var(--font-mono); line-height:1.4;">
                                <div>• Domains: ${Array.isArray(geol.majorGeologicalDomains) && geol.majorGeologicalDomains.length ? geol.majorGeologicalDomains.join(', ') : 'NOT RECORDED'}</div>
                                <div>• Basins: ${Array.isArray(geol.sedimentaryBasins) && geol.sedimentaryBasins.length ? geol.sedimentaryBasins.join(', ') : 'NOT RECORDED'}</div>
                                <div>• Tectonic Setting: ${geol.tectonicSetting || 'Continental Margin & Active Delta'}</div>
                            </div>
                        </div>
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
                            <div style="font-size:11px; font-weight:bold; color:#22c55e; font-family:var(--font-title); margin-bottom:6px;">⛏️ MINERAL & CRITICAL METALS BASE</div>
                            <div style="font-size:10px; color:#cbd5e1; font-family:var(--font-mono); line-height:1.4;">
                                <div>• Metallic: ${Array.isArray(min.metallic) && min.metallic.length ? min.metallic.join(', ') : 'NOT RECORDED'}</div>
                                <div>• Critical/Rare: ${Array.isArray(min.criticalMinerals) && min.criticalMinerals.length ? min.criticalMinerals.join(', ') : Array.isArray(min.rareEarths) && min.rareEarths.length ? min.rareEarths.join(', ') : 'NOT RECORDED'}</div>
                                <div>• Non-Metallic: ${Array.isArray(min.nonMetallic) && min.nonMetallic.length ? min.nonMetallic.join(', ') : 'NOT RECORDED'}</div>
                            </div>
                        </div>
                    </div>

                    <!-- HYDROCARBON, ENERGY & INFRASTRUCTURE -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
                            <div style="font-size:11px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); margin-bottom:6px;">🛢️ HYDROCARBON & ENERGY BASE</div>
                            <div style="font-size:10px; color:#cbd5e1; font-family:var(--font-mono); line-height:1.4;">
                                <div>• Gas Fields: ${(Array.isArray(hc.naturalGas) && hc.naturalGas.length ? hc.naturalGas.join(', ') : 'NOT RECORDED')}</div>
                                <div>• Deepwater / Marine: ${(Array.isArray(hc.gasHydrates) && hc.gasHydrates.length ? hc.gasHydrates.join(', ') : 'NOT RECORDED')}</div>
                                <div>• Nuclear & Renewable: ${(Array.isArray(eng.nuclearStatus) && eng.nuclearStatus.length ? eng.nuclearStatus.join(', ') : 'NOT RECORDED')}</div>
                            </div>
                        </div>
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
                            <div style="font-size:11px; font-weight:bold; color:#a855f7; font-family:var(--font-title); margin-bottom:6px;">🏭 INFRASTRUCTURE & TRANSPORT LOGISTICS</div>
                            <div style="font-size:10px; color:#cbd5e1; font-family:var(--font-mono); line-height:1.4;">
                                <div>• Deep Ports: ${(Array.isArray(infra.ports) && infra.ports.length ? infra.ports.join(', ') : 'NOT RECORDED')}</div>
                                <div>• Refineries & Plants: ${(Array.isArray(infra.refineries) && infra.refineries.length ? infra.refineries.join(', ') : Array.isArray(infra.processingFacilities) && infra.processingFacilities.length ? infra.processingFacilities.join(', ') : 'NOT RECORDED')}</div>
                                <div>• Pipeline & Rail Hubs: ${(Array.isArray(infra.pipelineHubs) && infra.pipelineHubs.length ? infra.pipelineHubs.join(', ') : Array.isArray(infra.railTerminals) && infra.railTerminals.length ? infra.railTerminals.join(', ') : 'NOT RECORDED')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

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
                                    <span style="color:#22c55e;">${numericObserved(s.progress) ? fmtObserved(s.progress) + '%' : 'NOT RECORDED'}</span>
                                </div>
                                <div style="font-size:10px; color:#94a3b8; font-family:var(--font-mono); margin:2px 0 4px 0;">
                                    Stage: ${s.stageName} • Est. Time: ${s.estimatedDays} Days
                                </div>
                                <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                                    <div style="width:${numericObserved(s.progress) ? Math.max(0, Math.min(100, Number(s.progress))) : 0}%; height:100%; background:linear-gradient(90deg, #00e5ff, #22c55e);"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let resGridHtml = resList.map(r => {
            const ratioObserved = numericObserved(r.selfSufficiencyRatio) ? Number(r.selfSufficiencyRatio) : null;
            const balanceObserved = numericObserved(r.netBalance) ? Number(r.netBalance) : null;
            const selfSuffColor = ratioObserved === null ? '#64748b' : (ratioObserved >= 100 ? '#22c55e' : (ratioObserved >= 75 ? '#eab308' : '#ef4444'));
            const netColor = balanceObserved === null ? '#64748b' : (balanceObserved >= 0 ? '#22c55e' : '#ef4444');
            const netSign = balanceObserved !== null && balanceObserved >= 0 ? '+' : '';

            return `
                <div class="ios-card" style="border-top: 2px solid ${selfSuffColor}; position: relative; padding:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-size:13px; font-weight:bold; color:#f8fafc; font-family:var(--font-title);">${r.icon} ${r.name.toUpperCase()}</span>
                        <span style="font-size:10px; padding:2px 6px; border-radius:10px; background:${selfSuffColor}22; color:${selfSuffColor}; font-weight:bold; border:1px solid ${selfSuffColor}; font-family:var(--font-mono);">
                            ${fmtObserved(r.selfSufficiencyRatio)}${ratioObserved === null ? '' : '%'} ${ratioObserved === null ? 'NOT RECORDED' : (ratioObserved >= 100 ? 'SECURE' : 'DEFICIT')}
                        </span>
                    </div>
                    
                    <div style="font-size:10px; color:#94a3b8; font-family:var(--font-mono); margin-bottom:6px;">${r.bnName || ''} • ${r.category}</div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:11px; color:#cbd5e1; font-family:var(--font-mono); margin-bottom:8px;">
                        <div>Output: <strong style="color:#00e5ff;">${fmtObserved(r.dailyProduction)}</strong></div>
                        <div>Consume: <strong style="color:#f97316;">${fmtObserved(r.dailyConsumption)}</strong></div>
                        <div>Net Flow: <strong style="color:${netColor};">${balanceObserved === null ? 'NOT RECORDED' : netSign + fmtObserved(r.netBalance)}</strong></div>
                        <div>Stock Days: <strong style="color:#ffd700;">${fmtObserved(r.stockDays)}${numericObserved(r.stockDays) ? ' Days' : ''}</strong></div>
                        <div>Mines/Plants: <strong style="color:#22c55e;">${fmtObserved(r.activeFacilities)}${numericObserved(r.activeFacilities) ? ' Active' : ''}</strong></div>
                        <div>Stockpile: <strong style="color:#a855f7;">${fmtObserved(r.warehouseStock)}</strong></div>
                    </div>

                    <div style="font-size:10px; color:#94a3b8; line-height:1.3; background:rgba(0,0,0,0.3); padding:4px 6px; border-radius:4px; font-family:var(--font-mono); margin-bottom:8px;">
                        ⛓️ ${r.processChain || 'NOT RECORDED'}
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                        <button onclick="window.ResourceMinistryEngine.executeDirective('survey', '${r.id}');" style="padding:5px 4px; background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            ⛏️ SURVEY
                        </button>
                        <button onclick="window.ResourceMinistryEngine.executeDirective('expand_facility', '${r.id}');" style="padding:5px 4px; background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            🏭 REQUEST CAPACITY
                        </button>
                        <button onclick="window.ResourceMinistryEngine.executeDirective('add_reserve', '${r.id}');" style="padding:5px 4px; background:rgba(255,215,0,0.15); border:1px solid #ffd700; color:#ffd700; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            📦 REQUEST SPR BUFFER
                        </button>
                        <button type="button" disabled title="Disabled: no authoritative physical stock-transfer handler is registered." style="padding:5px 4px; background:rgba(100,116,139,0.12); border:1px solid #64748b; color:#94a3b8; font-size:10px; font-weight:bold; border-radius:4px; cursor:not-allowed; opacity:.75;">
                            DRAWDOWN UNAVAILABLE
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
                ${launchBannerHtml}

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
                            <div class="ios-card-val" style="color:#a855f7;">18 Strategic</div>
                        </div>
                    </div>
                </div>

                <!-- CANONICAL GSRSK 25-SECTION COUNTRY PROFILE (IF AVAILABLE) -->
                ${profile25Html}

                <!-- ACTIVE SURVEYS TRACKER -->
                ${surveyHtml}

                <!-- 18 UNIVERSAL RESOURCE REGISTRY MATRIX -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:13px; font-weight:bold; color:#ffd700; font-family:var(--font-title); letter-spacing:0.5px;">
                            📦 NATIONAL RESOURCE REGISTRY (18 STRATEGIC COMMODITIES)
                        </div>
                        <button onclick="if(window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.openModal === 'function') window.ResourceMinistryEngine.openModal('${countryKey}', 'deposits');" style="padding:5px 12px; background:rgba(255,215,0,0.2); border:1px solid #ffd700; color:#ffd700; font-size:11px; font-weight:bold; border-radius:6px; cursor:pointer;">
                            🗺️ ${Array.isArray(window.ResourceMinistryEngine && window.ResourceMinistryEngine.deposits) ? window.ResourceMinistryEngine.deposits.length.toLocaleString() : 'COUNT NOT RECORDED'} WORLD DEPOSITS
                        </button>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:10px; max-height:480px; overflow-y:auto; padding-right:4px;">
                        ${resGridHtml}
                    </div>
                </div>

                <!-- INTER-MINISTRY CABINET COUNCIL DEBATES -->
                <div style="background:rgba(11,20,36,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:12px; font-weight:bold; color:#00e5ff; font-family:var(--font-title); letter-spacing:0.5px;">
                            🏛️ INTER-MINISTRY RESOURCE CABINET COUNCIL DEBATES & POLICY VOTER
                        </div>
                        <button onclick="if(window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.openModal === 'function') window.ResourceMinistryEngine.openModal('${countryKey}', 'market')" style="padding:4px 8px; background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; font-size:10px; font-weight:bold; border-radius:4px; cursor:pointer;">
                            📈 COMMODITIES TRADING DESK
                        </button>
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
        const metric = (domains, paths) => this.formatCountryValue(countryKey, domains, paths);
        const escapeRelationText = value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        const state = window.Game && window.Game.state || window.gameState || {};
        const observer = window.OmegaLiveOpsObservability;
        const cid = observer && observer.resolveCountryId ? observer.resolveCountryId(countryKey) : String(countryKey || '').toUpperCase();
        const foreign = state.foreign && (state.foreign[cid] || state.foreign[String(countryKey || '').toUpperCase()]) || {};
        const diplomacy = state.diplomacy && (state.diplomacy[cid] || state.diplomacy[String(countryKey || '').toUpperCase()]) || {};
        const relationCandidates = [
            Array.isArray(rel) ? rel : null,
            rel && (rel.relationships || rel.relations || rel.bilateralRelations || rel.relationshipLedger),
            foreign.relationships, foreign.relations, foreign.bilateralRelations, foreign.relationshipLedger,
            diplomacy.relationships, diplomacy.relations, diplomacy.bilateralRelations, diplomacy.relationshipLedger
        ];
        let relationSource = relationCandidates.find(value => Array.isArray(value)) || null;
        if (!relationSource) {
            const relationMap = relationCandidates.find(value => value && typeof value === 'object' && !Array.isArray(value));
            if (relationMap) relationSource = Object.entries(relationMap).map(([peer, value]) =>
                value && typeof value === 'object' ? Object.assign({ counterpartyCountryId: peer }, value) :
                { counterpartyCountryId: peer, relationshipScore: value });
        }
        const relationRows = (Array.isArray(relationSource) ? relationSource : []).map(row => ({
            peer: String(row && (row.counterpartyCountryId || row.targetCountryId || row.peerCountryId || row.countryId || row.countryCode || row.country) || ''),
            score: row && (row.harmony ?? row.harmonyScore ?? row.relationshipScore ?? row.relationScore ?? row.score),
            status: String(row && (row.treatyStatus || row.status || row.relationshipStatus || row.type) || 'STATUS NOT RECORDED')
        })).filter(row => row.peer && row.peer.toUpperCase() !== String(cid || '').toUpperCase()).slice(0,12);
        const relationshipGraphHtml = relationRows.length
            ? '<div style="display:flex;flex-direction:column;gap:6px;">' + relationRows.map(row =>
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px;border:1px solid rgba(148,163,184,.2);border-radius:6px;">' +
                '<strong>' + escapeRelationText(row.peer) + '</strong><span>' + escapeRelationText(row.status) + '</span><strong>' +
                (typeof row.score === 'number' && Number.isFinite(row.score) ? escapeRelationText(row.score) : 'SCORE NOT RECORDED') +
                '</strong></div>').join('') + '</div>'
            : '<p style="font-size:12px;line-height:1.5;color:#94a3b8;">No bilateral relationship records are available in the selected country state. No sample allies or relationship edges are drawn.</p>';
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-3">
                    <div class="ios-card">
                        <div class="ios-card-title">STRATEGIC ALLIES</div>
                        <div class="ios-card-val" style="color:#22c55e;">${metric(['foreign','diplomacy'], ['strategicAllies.length','alliances.length','activeAlliances.length','treaties.activeAlliances.length'])} Recorded Allies</div>
                        <div class="ios-card-sub">${metric(['foreign','diplomacy'], ['activeMutualDefenseTreaties.length','mutualDefenseTreaties.length','treaties.mutualDefenseActiveCount'])} Mutual Defense Treaties</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">DIPLOMATIC INFLUENCE</div>
                        <div class="ios-card-val">${metric(['foreign','diplomacy'], ['diplomaticInfluence','influenceScore','diplomaticPower','influence'])} Score</div>
                        <div class="ios-card-sub">UNSC membership: ${metric(['foreign','diplomacy'], ['unSecurityCouncilMember','unscMember','securityCouncilMembership'])}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">EMBASSY NETWORK</div>
                        <div class="ios-card-val">${metric(['foreign','diplomacy'], ['embassies.length','embassyNetwork.length','embassyCount','globalEmbassyCount'])} Global Embassies</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title" style="color:#00e5ff;">RECORDED BILATERAL RELATIONSHIPS</div>
                    ${relationshipGraphHtml}
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
                        <div class="ios-card-val" style="color:#00e5ff;">${this.formatCountryValue(countryKey, ['intelligence','technology'], ['networkLevel','network.level','networkTier','classification'])}</div>
                        <div class="ios-card-sub">Satellite Mesh Coverage ${this.formatCountryValue(countryKey, ['intelligence','technology'], ['satelliteMeshCoverage','satellite.coveragePercent','network.coveragePercent'], '%')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">COUNTER-INTEL SHIELD</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['intelligence'], ['counterIntelligence.efficiency','counterIntelligenceEfficiency','efficiencyPercent'], '%')} Efficiency</div>
                        <div class="ios-card-sub">Foreign Infiltration: ${this.formatCountryValue(countryKey, ['intelligence'], ['foreignInfiltrationRisk','infiltrationRisk','foreignThreatLevel'])}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">CYBER WARFARE UNIT</div>
                        <div class="ios-card-val" style="color:#22c55e;">${this.formatCountryValue(countryKey, ['military','intelligence'], ['defcon','readinessLevel','cyberReadiness'])}</div>
                        <div class="ios-card-sub">Offensive Capabilities Active</div>
                    </div>
                </div>

                <div class="ios-card" style="border-color:#ef4444;">
                    <div class="ios-card-title" style="color:#ef4444;">AI THREAT ASSESSMENT & ESPIONAGE REPORT</div>
                    <div style="font-size:12px; line-height:1.6; color:#f8fafc;">
                        <div>⚠️ Current Threat Level: <strong>${this.formatCountryValue(countryKey, ['intelligence'], ['threatAssessment.level','threatLevel','currentThreatLevel'])}</strong></div>
                        <div>📡 Counter-Intelligence Status: ${this.formatCountryValue(countryKey, ['intelligence'], ['interceptedForeignNodes30d','foreignSurveillanceNodesIntercepted','counterIntelligence.interceptedLast30Days'])} foreign surveillance nodes intercepted.</div>
                        <div>🔒 Information Reliability Rating: ${this.formatCountryValue(countryKey, ['intelligence'], ['informationReliabilityPercent','reliabilityScore','informationReliability'], '%')}</div>
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
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['infrastructure','transport'], ['internationalAirports','airportCount','airports.international','airports'], '')} Intl Airports</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['infrastructure','transport'], ['deepwaterSeaports','seaportCount','ports.deepwater','seaports'], '')} Deepwater Seaports</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">RAIL & HIGHWAYS</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['infrastructure','transport'], ['railHighwayKm','transportNetworkKm','networkLengthKm','infrastructure.roadRailKm'], 'km')} Grid</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['infrastructure','transport'], ['logisticsSystem.status','highSpeedRail.status','logisticsStatus'])}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">POWER GRID</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['energy','infrastructure','economy'], ['annualElectricityGenerationTWh','electricityGenerationTWh','energyProductionTWh','powerSystem.annualTWh'], 'TWh')}</div>
                        <div class="ios-card-sub">Nuclear + Clean Energy ${this.formatCountryValue(countryKey, ['energy','infrastructure','economy'], ['cleanEnergySharePercent','renewableSharePercent','energyMix.cleanPercent'], '%')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">TELECOM / 5G</div>
                        <div class="ios-card-val" style="color:#22c55e;">${this.formatCountryValue(countryKey, ['telecom','infrastructure','technology'], ['coveragePercent','mobileCoveragePercent','network.coveragePercent'], '%')} Coverage</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['telecom','technology','infrastructure'], ['networkTechnology','telecomGeneration','satelliteLink.status'])}</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title">INFRASTRUCTURE MODERNIZATION INDEX</div>
                    ${this.renderCountryPercentBar(countryKey, ['infrastructure','transport'], ['modernizationIndexPercent','infrastructureModernizationIndex','modernizationIndex'], 'Infrastructure Modernization Index')}
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
                        <div class="ios-card-val" style="color:#ffd700;">${this.formatCountryValue(countryKey, ['technology','research'], ['aiMaturityTier','aiTechnologyTier','quantumComputing.tier','technologyTier'])}</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['technology','research'], ['autonomousSystems.status','autonomousSwarmSystems.status','swarmSystems'])}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">SPACE PROGRAM</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['technology','space'], ['spaceProgram.status','orbitalStations.status','lunarProgram.status'])}</div>
                        <div class="ios-card-sub">${this.formatCountryValue(countryKey, ['technology','space','infrastructure'], ['activeSatellites','satellites.active','spaceProgram.activeSatellites'])} Active Satellites</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">CYBER SECURITY GRID</div>
                        <div class="ios-card-val" style="color:#22c55e;">${this.formatCountryValue(countryKey, ['technology','intelligence'], ['cyberSecurity.encryptionStatus','cyberSecurityStatus','encryptionStatus'])}</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title" style="color:#00e5ff;">RESEARCH PROGRESS TIMELINE</div>
                    <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:11px; color:#cbd5e1;">
                        <div>🤖 AI Robotics (${this.formatCountryValue(countryKey, ['technology','research'], ['research.aiRobotics.progressPercent','aiRobotics.progressPercent','researchProgress.aiRobotics'], '%')})</div>
                        <div>⚡ Fusion Energy (${this.formatCountryValue(countryKey, ['technology','research','energy'], ['research.fusionEnergy.progressPercent','fusionEnergy.progressPercent','researchProgress.fusionEnergy'], '%')})</div>
                        <div>🚀 Hypersonic Flight (${this.formatCountryValue(countryKey, ['technology','research'], ['research.hypersonicFlight.progressPercent','hypersonicFlight.progressPercent','researchProgress.hypersonicFlight'], '%')})</div>
                        <div>🧪 Bio-Genetics (${this.formatCountryValue(countryKey, ['technology','research','health'], ['research.bioGenetics.progressPercent','bioGenetics.progressPercent','researchProgress.bioGenetics'], '%')})</div>
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
        const ageSource = pop && (pop.ageGroups || pop.age_groups || pop.ageDistribution || pop.age_distribution ||
            pop.ageBreakdown || pop.age_breakdown || pop.demographics && (pop.demographics.ageGroups || pop.demographics.ageDistribution)) || null;
        const num = value => {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string' && value.trim() !== '' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        };
        const ageRowsRaw = Array.isArray(ageSource)
            ? ageSource.map((row,index)=>({label:row && (row.label || row.name || row.ageGroup || row.id) || 'Group '+(index+1),row}))
            : ageSource && typeof ageSource === 'object' ? Object.entries(ageSource).map(([label,row])=>({label,row})) : [];
        const ageRows = ageRowsRaw.map(item=>{
            const row=item.row && typeof item.row === 'object' ? item.row : {value:item.row};
            const explicit = num(row.percentage ?? row.percent ?? row.sharePercent ?? row.populationPercent);
            const fractional = num(row.share ?? row.fraction);
            const value = num(row.population ?? row.count ?? row.people ?? row.total ?? row.value ?? row.amount);
            return {label:String(item.label),percent:explicit!==null?explicit:(fractional!==null&&fractional>=0&&fractional<=1?fractional*100:null),value};
        }).filter(row=>row.percent!==null||row.value!==null);
        const total = ageRows.reduce((sum,row)=>sum+(row.value!==null&&row.value>0?row.value:0),0);
        const finalAgeRows = ageRows.map(row=>({...row,percent:row.percent!==null?row.percent:(total>0&&row.value!==null?row.value/total*100:null)}))
            .filter(row=>row.percent!==null&&Number.isFinite(row.percent)&&row.percent>=0)
            .map(row=>({...row,percent:Math.min(100,row.percent)}));
        const ageChartHtml = finalAgeRows.length
            ? '<div style="display:flex;justify-content:space-around;align-items:flex-end;gap:9px;min-height:90px;margin-top:10px;">'+
                finalAgeRows.map(row=>'<div style="text-align:center;min-width:0;flex:1;"><div title="'+String(row.percent.toFixed(1))+'%" style="background:#38bdf8;width:22px;height:'+Math.max(2,row.percent/100*62).toFixed(1)+'px;margin:0 auto 5px;border-radius:4px 4px 0 0;"></div><span style="font-size:10px;overflow-wrap:anywhere;">'+String(row.label).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+' ('+row.percent.toFixed(1)+'%)</span></div>').join('')+'</div>'
            : '<p style="padding:10px 0;color:#94a3b8;font-size:12px;line-height:1.5;">No age-group population records are available for this country. This chart is hidden rather than filled with sample demographics.</p>';
        return `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="ios-grid-4">
                    <div class="ios-card">
                        <div class="ios-card-title">EDUCATION INDEX</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['education','society'], ['educationIndex','education.index','index'])}</div>
                        <div class="ios-card-sub">Literacy Rate: ${this.formatCountryValue(countryKey, ['education','society','population'], ['literacyRatePercent','literacyRate','literacy.ratePercent'], '%')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">HEALTHCARE SYSTEM</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['health','society'], ['healthcareSystem','healthSystem.status','healthcare.status'])}</div>
                        <div class="ios-card-sub">Life Expectancy: ${this.formatCountryValue(countryKey, ['health','society','population'], ['lifeExpectancyYears','lifeExpectancy','demographics.lifeExpectancy'], 'years')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">HAPPINESS INDEX</div>
                        <div class="ios-card-val" style="color:#22c55e;">${this.formatCountryValue(countryKey, ['society','population'], ['happinessIndex','lifeSatisfactionIndex','publicMorale'])}</div>
                        <div class="ios-card-sub">Public Morale: ${this.formatCountryValue(countryKey, ['society','politics'], ['publicMorale','publicSatisfaction','approvalRating'], '%')}</div>
                    </div>
                    <div class="ios-card">
                        <div class="ios-card-title">URBANIZATION RATE</div>
                        <div class="ios-card-val">${this.formatCountryValue(countryKey, ['society','population'], ['urbanizationRatePercent','urbanizationRate','urbanization.ratePercent'], '%')}</div>
                        <div class="ios-card-sub">Metro Demographics</div>
                    </div>
                </div>

                <div class="ios-card">
                    <div class="ios-card-title">NATIONAL POPULATION AGE DEMOGRAPHICS</div>
                    ${ageChartHtml}
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
        const countryRuntime = window.OmegaCountryRuntimeData;
        const identity = countryRuntime && countryRuntime.resolveCountry(countryKey);
        const populationRecord = countryRuntime && countryRuntime.getRecord('population', countryKey);
        const economyRecord = countryRuntime && countryRuntime.getRecord('economy', countryKey);
        let ecosystem = null;
        try {
            ecosystem = window.WorldEcosystemEngine && typeof window.WorldEcosystemEngine.getCountryProfile === 'function'
                ? window.WorldEcosystemEngine.getCountryProfile(countryKey) : null;
        } catch (_) {}
        const profile = {
            geography: Object.assign({ isLandlocked: null, borderLengthKm: null }, ecosystem && ecosystem.geography || {}),
            resources: Object.assign({}, ecosystem && ecosystem.resources || {}),
            population: Object.assign({}, ecosystem && ecosystem.population || {}, {
                total: ecosystem && ecosystem.population && ecosystem.population.total != null
                    ? ecosystem.population.total : (populationRecord && populationRecord.population_2015 != null ? populationRecord.population_2015 : null),
                urbanizationRate: ecosystem && ecosystem.population && ecosystem.population.urbanizationRate != null
                    ? ecosystem.population.urbanizationRate : (populationRecord && populationRecord.urbanization_rate != null ? populationRecord.urbanization_rate : null),
                happinessScore: ecosystem && ecosystem.population && ecosystem.population.happinessScore != null
                    ? ecosystem.population.happinessScore : null
            }),
            economy: Object.assign({}, ecosystem && ecosystem.economy || {}, {
                gdp: ecosystem && ecosystem.economy && ecosystem.economy.gdp != null
                    ? ecosystem.economy.gdp : (economyRecord && economyRecord.gdp != null ? economyRecord.gdp : null)
            }),
            government: Object.assign({ cabinetStability: null, corruptionIndex: null }, ecosystem && ecosystem.government || {}),
            aiPersonality: Object.assign({
                aggressiveExpansion: null, riskTolerance: null, pragmaticRealism: null, strategicVision: null
            }, ecosystem && ecosystem.aiPersonality || {}),
            media: Object.assign({ pressFreedomIndex: null }, ecosystem && ecosystem.media || {}),
            tech: Object.assign({ semiconductorFabDominance: null, cyberAttackPower: null }, ecosystem && ecosystem.tech || {}),
            blocs: ecosystem && Array.isArray(ecosystem.blocs) ? ecosystem.blocs : [],
            influenceSphere: ecosystem && ecosystem.influenceSphere != null ? ecosystem.influenceSphere : null
        };

        const logs = window.WorldEcosystemEngine && typeof window.WorldEcosystemEngine.getCausalEventLog === 'function'
            ? window.WorldEcosystemEngine.getCausalEventLog() : [];
        const countryName = (identity && identity.name ? identity.name : countryKey).replace(/_/g, " ");

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
                                <div style="color:#f87171; font-weight:bold; font-size:13px;">${profile.aiPersonality.aggressiveExpansion == null ? "NOT RECORDED" : profile.aiPersonality.aggressiveExpansion + "/100"}</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Risk Tolerance:</span>
                                <div style="color:#fbbf24; font-weight:bold; font-size:13px;">${profile.aiPersonality.riskTolerance == null ? "NOT RECORDED" : profile.aiPersonality.riskTolerance + "/100"}</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Pragmatic Realism:</span>
                                <div style="color:#34d399; font-weight:bold; font-size:13px;">${profile.aiPersonality.pragmaticRealism == null ? "NOT RECORDED" : profile.aiPersonality.pragmaticRealism + "/100"}</div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Strategic Vision:</span>
                                <div style="color:#38bdf8; font-weight:bold; font-size:13px;">${profile.aiPersonality.strategicVision == null ? "NOT RECORDED" : profile.aiPersonality.strategicVision + "/100"}</div>
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
                                    ${(profile.blocs || []).join(", ") || "NOT RECORDED"}
                                </div>
                            </div>
                            <div style="background:rgba(0,0,0,0.4); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                                <span style="color:#94a3b8;">Influence Sphere:</span>
                                <div style="color:#a7f3d0; font-weight:bold; font-size:12px; margin-top:2px;">
                                    ${profile.influenceSphere || "NOT RECORDED"}
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
        const notify = (title, message, type) => {
            if (typeof window.showOmegaNotification === 'function') window.showOmegaNotification(title, message, type);
        };
        const treatyTypes = {
            'non-aggression':'NON_AGGRESSION_PACT',
            'defensive-alliance':'DEFENSIVE_ALLIANCE',
            'alliance':'DEFENSIVE_ALLIANCE',
            'peace-treaty':'PEACE_TREATY',
            'peace-negotiation':'PEACE_NEGOTIATION',
            'trade-agreement':'TRADE_AGREEMENT',
            'trade-proposal':'TRADE_AGREEMENT',
            'research-pact':'RESEARCH_PACT',
            'research-contract':'RESEARCH_COOPERATION',
            'negotiate-terms':'BILATERAL_AGREEMENT',
            'summit':'BILATERAL_COOPERATION',
            'send-delegation':'BILATERAL_COOPERATION',
            'joint-rd':'RESEARCH_COOPERATION',
            'tech-transfer':'TECHNOLOGY_COOPERATION'
        };
        const treatyType = treatyTypes[String(actionType || '').toLowerCase()];
        if (!treatyType) {
            notify('ACTION NOT EXECUTED', String(actionType || 'Unknown action').toUpperCase() +
                ': no authoritative handler is registered for this action. Game state was not changed.', 'error');
            return { status:'UNHANDLED', stateChanged:false, reason:'AUTHORITATIVE_ACTION_HANDLER_NOT_REGISTERED' };
        }

        const state = window.Game && window.Game.state || window.gameState || {};
        const player = state.player || {};
        const rawPlayer = state.playerCountryId || state.playerCountryCode || state.sovereignCountryId ||
            player.countryId || player.countryCode || window.playerCountry || window.OMEGA_PLAYER_COUNTRY_ID ||
            window.Game && (window.Game.playerCountryId || window.Game.playerCountryCode) || null;
        const observer = window.OmegaLiveOpsObservability;
        const resolver = observer && typeof observer.resolveCountryId === 'function'
            ? value => observer.resolveCountryId(value) : value => String(value || '').trim().toUpperCase();
        const playerId = rawPlayer ? resolver(rawPlayer) : null;
        const targetId = resolver(this.activeCountry);
        const normalise = value => String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
        if (!playerId || !targetId) {
            notify('ACTION NOT EXECUTED', 'Player country or target country identity is not available. No game state was changed.', 'error');
            return { status:'UNAVAILABLE', stateChanged:false, reason:'COUNTRY_IDENTITY_NOT_AVAILABLE' };
        }
        if (normalise(playerId) === normalise(targetId) || normalise(rawPlayer) === normalise(this.activeCountry)) {
            notify('ACTION NOT EXECUTED', 'Select another country as the negotiation counterpart. A country cannot negotiate this agreement with itself.', 'error');
            return { status:'REJECTED', stateChanged:false, reason:'SELF_NEGOTIATION_NOT_ALLOWED' };
        }
        const autonomy = window.OmegaOpponentAutonomy || window.Omega && window.Omega.OpponentAutonomy;
        if (!autonomy || typeof autonomy.startTreatyNegotiation !== 'function') {
            notify('ACTION NOT EXECUTED', 'The authoritative treaty-negotiation engine is not available. No game state was changed.', 'error');
            return { status:'UNAVAILABLE', stateChanged:false, reason:'TREATY_ENGINE_UNAVAILABLE' };
        }
        let result;
        try {
            result = autonomy.startTreatyNegotiation(playerId, targetId, {
                treatyType,
                terms:{ requestedAction:String(actionType), source:'COUNTRY_INTELLIGENCE_UI' },
                correlationId:'COUNTRY-IOS-'+String(Date.now())
            });
        } catch (error) {
            result = { status:'FAILED', reason:String(error && error.message || error) };
        }
        const applied = result && result.status === 'APPLIED' && result.stateChanged === true &&
            !(result.result && result.result.accepted === false);
        if (applied) {
            notify('NEGOTIATION REQUEST RECORDED', treatyType.replace(/_/g,' ') + ' with ' +
                String(this.activeCountry).replace(/_/g,' ') + ' has been recorded. Counterparty decision remains pending.', 'success');
            return result;
        }
        notify('NEGOTIATION NOT APPLIED', 'No agreement was signed. Engine status: ' +
            String(result && (result.status || result.reason) || 'NOT_RECORDED') +
            (result && result.result && result.result.reason ? ' · ' + result.result.reason : '') +
            '. No successful outcome is claimed.', 'error');
        return result || { status:'FAILED', stateChanged:false };
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
            1: `<strong>OVERVIEW ADVICE:</strong> ${countryName}. Recorded GDP: ${this.formatCountryValue(countryKey, ['economy'], ['gdp','GDP','nominalGDP'])}. Recorded treasury: ${this.formatCountryValue(countryKey, ['finance'], ['available','reserves','treasury','balance'])}. Review live operations for unrecorded indicators before issuing directives.`,
            2: `<strong>GOVERNMENT ADVICE:</strong> Administrative efficiency recorded: ${this.formatCountryValue(countryKey, ['government','politics'], ['administrativeEfficiencyPercent','administrativeEfficiency','efficiencyPercent'], '%')}. Review governance records before choosing a policy action.`,
            3: `<strong>MILITARY ADVICE:</strong> Recorded readiness: ${this.formatCountryValue(countryKey, ['military','defense'], ['readiness','overallReadinessPercent','combatReadiness'], '%')}. Review manpower, equipment and supply status before training or deployment.`,
            4: `<strong>ECONOMY ADVICE:</strong> Recorded GDP: ${this.formatCountryValue(countryKey, ['economy'], ['gdp','GDP','nominalGDP'])}; treasury: ${this.formatCountryValue(countryKey, ['finance'], ['available','reserves','treasury','balance'])}. A trade agreement has no guaranteed revenue effect; verify terms and settlement records.`,
            5: `<strong>RESOURCE ADVICE:</strong> Inspect Mine & Stock / Pipeline for recorded production, inventory, route constraints and factory-input receipts. Reserve sufficiency is not assumed when records are missing.`,
            6: `<strong>DIPLOMACY ADVICE:</strong> Review recorded relationship score and contact history before initiating negotiations. An improvement is not guaranteed until an engine result records it.`,
            7: `<strong>INTELLIGENCE ADVICE:</strong> Recorded threat level: ${this.formatCountryValue(countryKey, ['intelligence'], ['threatAssessment.level','threatLevel','currentThreatLevel'])}; information reliability: ${this.formatCountryValue(countryKey, ['intelligence'], ['informationReliabilityPercent','reliabilityScore','informationReliability'], '%')}. Missing intelligence is not treated as a confirmed low threat.`,
            8: `<strong>INFRASTRUCTURE ADVICE:</strong> Recorded logistics efficiency: ${this.formatCountryValue(countryKey, ['transport','infrastructure'], ['logisticsEfficiencyPercent','operatingEfficiencyPercent','logistics.efficiencyPercent'], '%')}. Inspect route capacity and blocked-delivery records before expanding logistics.`,
            9: `<strong>TECHNOLOGY ADVICE:</strong> Recorded AI/technology tier: ${this.formatCountryValue(countryKey, ['technology','research'], ['aiMaturityTier','aiTechnologyTier','technologyTier'])}. Research progress must come from the country's research records.`,
            10: `<strong>SOCIETY ADVICE:</strong> Recorded happiness/public morale: ${this.formatCountryValue(countryKey, ['society','population','politics'], ['happinessIndex','lifeSatisfactionIndex','publicMorale','approvalRating'])}. Civil-unrest risk requires an explicit recorded risk field.`,
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
