/**
 * 🏛️ OMEGA CABINET ENGINE - NATIONAL EXECUTIVE COUNCIL (ক্যাবিনেট সিদ্ধান্ত ইঞ্জিনি)
 * Strategic Decision Orchestrator, Ministerial Personality Engine & Policy Transition Engine
 */

window.OmegaCabinetEngine = {
    // Current Active Country State
    countryCode: 'BD',
    
    // Policy Transition Engine State
    activeTransition: null,

    // Ministerial Personality Matrix
    personalities: {
        defense: { type: 'Aggressive', stance: 'Hawkish', modifier: { defense: 1.5, diplomacy: -0.5 }, icon: '🦅' },
        foreign_affairs: { type: 'Technocrat', stance: 'Diplomatic', modifier: { trade: 1.2, defense: -0.3 }, icon: '🕊️' },
        energy_mining: { type: 'Pragmatic', stance: 'Resource Maximizer', modifier: { energy: 1.4, environment: -0.4 }, icon: '⚡' },
        intelligence_cyber: { type: 'Loyalist', stance: 'Vigilant Security', modifier: { intelligence: 1.6, privacy: -0.6 }, icon: '🕵️' },
        agriculture_food: { type: 'Reformist', stance: 'Agrarian Populist', modifier: { agriculture: 1.3, trade: 0.2 }, icon: '🌾' },
        interior_security: { type: 'Aggressive', stance: 'Law & Order', modifier: { stability: 1.4, freedom: -0.5 }, icon: '🚓' },
        health_welfare: { type: 'Reformist', stance: 'Humanitarian', modifier: { health: 1.5, budget: -0.3 }, icon: '🏥' },
        treasury_finance: { type: 'Technocrat', stance: 'Fiscal Conservative', modifier: { GDP: 1.4, spending: -0.8 }, icon: '💰' },
        mega_projects: { type: 'Technocrat', stance: 'Infrastructure Builder', modifier: { growth: 1.5, inflation: 0.3 }, icon: '🏗️' },
        trade: { type: 'Pragmatic', stance: 'Free Market Merchant', modifier: { export: 1.4, tariff: -0.5 }, icon: '🪙' },
        production: { type: 'Technocrat', stance: 'Industrial Maximalist', modifier: { industry: 1.5, pollution: 0.2 }, icon: '⚙️' },
        taxes: { type: 'Corrupt', stance: 'Revenue Extractor', modifier: { treasury: 1.2, popularity: -0.6 }, icon: '📋' },
        central_bank: { type: 'Technocrat', stance: 'Monetary Stabilizer', modifier: { inflation: -1.5, liquidity: 0.5 }, icon: '🏦' },
        laws: { type: 'Loyalist', stance: 'Constitutionalist', modifier: { law: 1.5, dissent: -0.8 }, icon: '⚖️' },
        education: { type: 'Reformist', stance: 'Intellectual Visionary', modifier: { humanCapital: 1.6, cost: 0.4 }, icon: '🎓' },
        infrastructure: { type: 'Technocrat', stance: 'Logistics Master', modifier: { transport: 1.4, connectivity: 1.2 }, icon: '✈️' },
        science_research: { type: 'Reformist', stance: 'Futurist Innovator', modifier: { tech: 1.7, risk: 0.3 }, icon: '🔬' }
    },

    // 10 Core Cabinet Subsystem View Handlers
    subsystems: {
        governance: 'renderGovernanceSubsystem',
        meetings: 'renderMeetingsSubsystem',
        directives: 'renderDirectivesSubsystem',
        coordination: 'renderCoordinationSubsystem',
        intelligence: 'renderIntelligenceSubsystem',
        projects: 'renderProjectsSubsystem',
        budget: 'renderBudgetSubsystem',
        crisis: 'renderCrisisSubsystem',
        audits: 'renderAuditsSubsystem',
        strategy: 'renderStrategySubsystem'
    },

    activeSubsystem: 'governance',

    init() {
        console.log("🏛️ Omega Cabinet Engine Initialized.");
    },

    setSubsystem(sysKey) {
        if (this.subsystems[sysKey]) {
            this.activeSubsystem = sysKey;
            this.renderCabinetSubsystem();
        }
    },

    // Primary Container Renderer for the 10 Subsystems
    renderCabinetSubsystem(containerEl) {
        const root = containerEl || document.getElementById('cabinet-subsystem-root');
        if (!root) return;

        const methodName = this.subsystems[this.activeSubsystem];
        if (typeof this[methodName] === 'function') {
            root.innerHTML = this[methodName]();
        } else {
            root.innerHTML = `<div style="padding:20px; color:#ef4444;">Subsystem not implemented yet.</div>`;
        }
    },

    // 1. 🏛️ GOVERNANCE & REGIME SYSTEM
    renderGovernanceSubsystem() {
        const transitionProgress = this.activeTransition ? 
            `<div style="background:rgba(255,215,0,0.12); border:1px solid #ffd700; border-radius:10px; padding:12px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <strong style="color:#ffd700; font-size:13px;">🔄 POLICY TRANSITION IN PROGRESS: ${this.activeTransition.targetName.toUpperCase()}</strong>
                    <span style="color:#00e5ff; font-weight:bold; font-size:12px;">${this.activeTransition.daysRemaining} DAYS REMAINING</span>
                </div>
                <div style="width:100%; background:rgba(255,255,255,0.1); height:8px; border-radius:4px; overflow:hidden;">
                    <div style="width:${this.activeTransition.progress}%; background:linear-gradient(90deg, #ffd700, #00e5ff); height:100%;"></div>
                </div>
            </div>` : '';

        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${transitionProgress}

                <!-- TOP REGIME METRICS -->
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:14px;">
                        <span style="color:#94a3b8; font-size:11px;">EXECUTIVE AUTHORITY SCORE</span>
                        <div style="font-size:24px; font-weight:bold; color:#00e5ff; font-family:'Share Tech Mono',monospace;">92 / 100</div>
                        <span style="color:#22c55e; font-size:10px;">+4.2% Executive Decree Efficiency</span>
                    </div>
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:14px;">
                        <span style="color:#94a3b8; font-size:11px;">CONSTITUTIONAL LEGITIMACY</span>
                        <div style="font-size:24px; font-weight:bold; color:#ffd700; font-family:'Share Tech Mono',monospace;">88.5%</div>
                        <span style="color:#ffd700; font-size:10px;">High Civil Alignment</span>
                    </div>
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(34,197,94,0.3); border-radius:10px; padding:14px;">
                        <span style="color:#94a3b8; font-size:11px;">STATE REGIME TYPE</span>
                        <div style="font-size:20px; font-weight:bold; color:#22c55e; font-family:'Share Tech Mono',monospace;">SOVEREIGN REPUBLIC</div>
                        <span style="color:#94a3b8; font-size:10px;">Bicameral Constitutional Governance</span>
                    </div>
                </div>

                <!-- POLICY TRANSITION SELECTOR ENGINE -->
                <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:16px;">
                    <h4 style="color:#f8fafc; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                        <span>📜</span> NATIONAL IDEOLOGY & POLICY REFORM ENGINE (দীর্ঘমেয়াদী নীতি পরিবর্তন)
                    </h4>
                    <p style="color:#94a3b8; font-size:11px; margin-bottom:16px;">
                        Transitioning sovereign governance frameworks requires budget allocation, administrative time, and minister alignment.
                    </p>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
                        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(0,229,255,0.3); border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-space-between;">
                            <div>
                                <strong style="color:#00e5ff; font-size:13px;">🏛️ Secular Technocratic State</strong>
                                <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">+15% Science & Mega-Projects efficiency, +10% Economy, -5% Religious Unity.</p>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
                                <span style="color:#ffd700; font-size:11px; font-weight:bold;">$15.0B | 30 Days</span>
                                <button onclick="OmegaCabinetEngine.startPolicyTransition('Secular Technocratic State', 30, 15)" style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; font-size:11px; font-weight:bold; padding:4px 10px; border-radius:6px; cursor:pointer;">ENACT REFORM</button>
                            </div>
                        </div>

                        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(249,115,22,0.3); border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-space-between;">
                            <div>
                                <strong style="color:#f97316; font-size:13px;">🎖️ Sovereign War Junta</strong>
                                <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">+25% Defense Combat Readiness, +20% Recruits, -15% Foreign Diplomacy.</p>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
                                <span style="color:#ffd700; font-size:11px; font-weight:bold;">$25.0B | 15 Days</span>
                                <button onclick="OmegaCabinetEngine.startPolicyTransition('Sovereign War Junta', 15, 25)" style="background:rgba(249,115,22,0.2); border:1px solid #f97316; color:#f97316; font-size:11px; font-weight:bold; padding:4px 10px; border-radius:6px; cursor:pointer;">ENACT REFORM</button>
                            </div>
                        </div>

                        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(34,197,94,0.3); border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-space-between;">
                            <div>
                                <strong style="color:#22c55e; font-size:13px;">🕌 Islamic Constitutional State</strong>
                                <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">+20% Moral Stability, Zero Interest Treasury Model, +10% Alliance Trust.</p>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
                                <span style="color:#ffd700; font-size:11px; font-weight:bold;">$10.0B | 20 Days</span>
                                <button onclick="OmegaCabinetEngine.startPolicyTransition('Islamic Constitutional State', 20, 10)" style="background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; font-size:11px; font-weight:bold; padding:4px 10px; border-radius:6px; cursor:pointer;">ENACT REFORM</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 2. 🤝 MEETINGS & VOTING ENGINE
    renderMeetingsSubsystem() {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(0,229,255,0.3); border-radius:12px; padding:16px;">
                    <h4 style="color:#00e5ff; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                        <span>🏛️</span> CONVENE EXECUTIVE COUNCIL MEETING (ক্যাবিনেট ভোট ইঞ্জিনি)
                    </h4>
                    <p style="color:#94a3b8; font-size:11px; margin-bottom:14px;">
                        Present executive motions to the 17 ministers. Minister votes are dynamically computed using personality traits, trust ratings, and state statistics.
                    </p>

                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
                        <button onclick="OmegaCabinetEngine.conveneVote('DEFENSE_TRIPLE')" style="background:rgba(249,115,22,0.2); border:1px solid #f97316; color:#f97316; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🛡️ Defense Spending +50% Motion
                        </button>
                        <button onclick="OmegaCabinetEngine.conveneVote('TAX_REDUCTION')" style="background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;">
                            📋 15% Corporate Tax Slash
                        </button>
                        <button onclick="OmegaCabinetEngine.conveneVote('AI_AUTOMATION')" style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🔬 AI Civil Service Automation Act
                        </button>
                    </div>

                    <div id="cabinet-vote-results" style="background:rgba(15,23,42,0.8); border:1px dashed rgba(255,255,255,0.2); border-radius:10px; padding:16px; min-height:120px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px;">
                        Select a motion above to convene the Cabinet and initiate real-time ministerial voting.
                    </div>
                </div>
            </div>
        `;
    },

    // 3. ⚡ DIRECTIVES & DECREES SYSTEM
    renderDirectivesSubsystem() {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(255,215,0,0.3); border-radius:12px; padding:16px;">
                    <h4 style="color:#ffd700; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                        <span>⚡</span> SOVEREIGN EXECUTIVE DECREES (রাষ্ট্রীয় বিশেষ অধ্যাদেশ)
                    </h4>
                    <p style="color:#94a3b8; font-size:11px; margin-bottom:14px;">
                        Issue binding presidential or prime ministerial decrees to override standard bureau procedures immediately.
                    </p>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
                        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(239,68,68,0.4); border-radius:8px; padding:12px;">
                            <strong style="color:#ef4444; font-size:13px;">🚨 Emergency War Economy Decree</strong>
                            <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">Converts 40% civilian factory output into defense munitions for 90 days.</p>
                            <button onclick="alert('Decree Enacted: Emergency War Mobilization Active!')" style="width:100%; background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; font-weight:bold; padding:6px; border-radius:6px; cursor:pointer; margin-top:8px; font-size:11px;">SIGN DECREE</button>
                        </div>
                        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(0,229,255,0.4); border-radius:8px; padding:12px;">
                            <strong style="color:#00e5ff; font-size:13px;">🛡️ National Cyber Firewall Protocol</strong>
                            <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">Blocks enemy digital espionage attacks and secures state treasury networks.</p>
                            <button onclick="alert('Decree Enacted: Cyber Shield Active!')" style="width:100%; background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; font-weight:bold; padding:6px; border-radius:6px; cursor:pointer; margin-top:8px; font-size:11px;">SIGN DECREE</button>
                        </div>
                        <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(34,197,94,0.4); border-radius:8px; padding:12px;">
                            <strong style="color:#22c55e; font-size:13px;">🌾 Sovereign Grain Reserve Mandate</strong>
                            <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">Mandates 100% strategic food storage, eliminating famine risk during blockades.</p>
                            <button onclick="alert('Decree Enacted: Grain Mandate Enforced!')" style="width:100%; background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; font-weight:bold; padding:6px; border-radius:6px; cursor:pointer; margin-top:8px; font-size:11px;">SIGN DECREE</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 4. 🔄 COORDINATION SYSTEM
    renderCoordinationSubsystem() {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(0,229,255,0.3); border-radius:12px; padding:16px;">
                    <h4 style="color:#00e5ff; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px;">
                        🔄 INTER-MINISTRY SYNERGY & CONFLICT RESOLVER
                    </h4>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div style="background:rgba(15,23,42,0.7); border-left:4px solid #ef4444; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:#f8fafc; font-size:12px;">Defense vs Finance Conflict</strong>
                                <p style="color:#94a3b8; font-size:11px; margin:2px 0;">Defense requests $20B extra military budget; Finance warns of 3% inflation spike.</p>
                            </div>
                            <button onclick="alert('Conflict Resolved: 50% Compromise Approved.')" style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">MEDIATE</button>
                        </div>
                        <div style="background:rgba(15,23,42,0.7); border-left:4px solid #22c55e; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:#f8fafc; font-size:12px;">Energy & Mega-Projects Synergy (+12% Output)</strong>
                                <p style="color:#94a3b8; font-size:11px; margin:2px 0;">Joint nuclear grid construction bonus active.</p>
                            </div>
                            <span style="color:#22c55e; font-weight:bold; font-size:11px;">ACTIVE SYNERGY</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 5. 🕵️ INTELLIGENCE SYSTEM
    renderIntelligenceSubsystem() {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:14px;">
                        <span style="color:#94a3b8; font-size:11px;">NATIONAL THREAT INDEX</span>
                        <div style="font-size:24px; font-weight:bold; color:#22c55e; font-family:'Share Tech Mono',monospace;">LOW (14%)</div>
                        <span style="color:#22c55e; font-size:10px;">Quantum Encryption Operational</span>
                    </div>
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:14px;">
                        <span style="color:#94a3b8; font-size:11px;">COUP / UNREST PROBABILITY</span>
                        <div style="font-size:24px; font-weight:bold; color:#00e5ff; font-family:'Share Tech Mono',monospace;">0.8%</div>
                        <span style="color:#22c55e; font-size:10px;">Zero Military Dissent Detected</span>
                    </div>
                </div>
            </div>
        `;
    },

    // 6. 🏗️ PROJECTS SYSTEM
    renderProjectsSubsystem() {
        return `
            <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(255,215,0,0.3); border-radius:12px; padding:16px;">
                <h4 style="color:#ffd700; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px;">
                    🏗️ NATIONAL STRATEGIC MEGAPROJECTS (কৌশলগত মহাসম্পদ প্রজেক্ট)
                </h4>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(0,229,255,0.3); border-radius:8px; padding:12px;">
                        <strong style="color:#00e5ff; font-size:13px;">⚛️ 5,000MW Nuclear Power Complex</strong>
                        <p style="color:#cbd5e1; font-size:11px; margin:4px 0;">Status: 82% Complete. Grants infinite industrial power.</p>
                        <div style="width:100%; background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; margin-top:8px;">
                            <div style="width:82%; background:#00e5ff; height:100%;"></div>
                        </div>
                    </div>
                    <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(255,215,0,0.3); border-radius:8px; padding:12px;">
                        <strong style="color:#ffd700; font-size:13px;">⚓ Deep Ocean Naval Dockyard</strong>
                        <p style="color:#cbd5e1; font-size:11px; margin:4px 0;">Status: Operational. Supercarrier construction unlocked.</p>
                        <div style="width:100%; background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; margin-top:8px;">
                            <div style="width:100%; background:#ffd700; height:100%;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // 7. 💰 BUDGET SYSTEM
    renderBudgetSubsystem() {
        return `
            <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(34,197,94,0.3); border-radius:12px; padding:16px;">
                <h4 style="color:#22c55e; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px;">
                    💰 NATIONAL TREASURY & REALLOCATION MATRIX
                </h4>
                <p style="color:#94a3b8; font-size:11px; margin-bottom:14px;">
                    Total Annual Budget: <strong style="color:#ffd700;">$985.0 Billion USD</strong>
                </p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
                        <span style="width:140px; color:#f8fafc;">Defense & Cyber:</span>
                        <input type="range" min="10" max="40" value="28" style="flex:1;" onchange="this.nextElementSibling.innerText = this.value + '%'">
                        <span style="width:50px; color:#ffd700; font-weight:bold;">28%</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
                        <span style="width:140px; color:#f8fafc;">Infrastructure & Power:</span>
                        <input type="range" min="10" max="40" value="32" style="flex:1;" onchange="this.nextElementSibling.innerText = this.value + '%'">
                        <span style="width:50px; color:#ffd700; font-weight:bold;">32%</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
                        <span style="width:140px; color:#f8fafc;">Health & Education:</span>
                        <input type="range" min="10" max="40" value="25" style="flex:1;" onchange="this.nextElementSibling.innerText = this.value + '%'">
                        <span style="width:50px; color:#ffd700; font-weight:bold;">25%</span>
                    </div>
                </div>
            </div>
        `;
    },

    // 8. 🚨 CRISIS SYSTEM
    renderCrisisSubsystem() {
        return `
            <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(239,68,68,0.4); border-radius:12px; padding:16px;">
                <h4 style="color:#ef4444; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <span>🚨</span> EMERGENCY CRISIS COMMAND CENTER
                </h4>
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                    <button onclick="alert('DEFCON 1 Emergency Mobilization Active!')" style="background:rgba(239,68,68,0.25); border:1.5px solid #ef4444; color:#ef4444; padding:10px 16px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">
                        🚨 DECLARE DEFCON 1 MOBILIZATION
                    </button>
                    <button onclick="alert('National Disaster Relief Funds Released!')" style="background:rgba(0,229,255,0.25); border:1.5px solid #00e5ff; color:#00e5ff; padding:10px 16px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">
                        🌊 RELEASE DISASTER RELIEF STOCKPILES
                    </button>
                </div>
            </div>
        `;
    },

    // 9. 📊 AUDITS SYSTEM
    renderAuditsSubsystem() {
        return `
            <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(0,229,255,0.3); border-radius:12px; padding:16px;">
                <h4 style="color:#00e5ff; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px;">
                    📊 MINISTERIAL EFFICIENCY & INTEGRITY AUDITS
                </h4>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px;">
                        <strong style="color:#f8fafc; font-size:12px;">General Marcus Sterling (Defense)</strong>
                        <div style="font-size:11px; color:#94a3b8; margin:4px 0;">Efficiency: <span style="color:#22c55e;">98%</span> | Loyalty: <span style="color:#ffd700;">EXTREME</span></div>
                        <span style="color:#00e5ff; font-size:10px;">Personality: Aggressive Hawkish</span>
                    </div>
                    <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px;">
                        <strong style="color:#f8fafc; font-size:12px;">Dr. Elena Rostova (Finance)</strong>
                        <div style="font-size:11px; color:#94a3b8; margin:4px 0;">Efficiency: <span style="color:#22c55e;">95%</span> | Loyalty: <span style="color:#ffd700;">EXTREME</span></div>
                        <span style="color:#00e5ff; font-size:10px;">Personality: Technocrat Fiscal</span>
                    </div>
                </div>
            </div>
        `;
    },

    // 10. 🎯 STRATEGY SYSTEM
    renderStrategySubsystem() {
        return `
            <div style="background:rgba(8,15,28,0.9); border:1px solid rgba(255,215,0,0.3); border-radius:12px; padding:16px;">
                <h4 style="color:#ffd700; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:12px;">
                    🎯 VISION 2050 GRAND STRATEGY & SUPERPOWER RATING
                </h4>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,215,0,0.3); border-radius:8px; padding:12px;">
                        <span style="color:#94a3b8; font-size:10px;">GLOBAL POWER INDEX</span>
                        <div style="font-size:22px; font-weight:bold; color:#ffd700;">RANK #4 WORLDWIDE</div>
                    </div>
                    <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(0,229,255,0.3); border-radius:8px; padding:12px;">
                        <span style="color:#94a3b8; font-size:10px;">SPHERE OF INFLUENCE</span>
                        <div style="font-size:22px; font-weight:bold; color:#00e5ff;">14 ALLIED STATES</div>
                    </div>
                </div>
            </div>
        `;
    },

    // Policy Reform Execution
    startPolicyTransition(targetName, days, costBillion) {
        this.activeTransition = {
            targetName: targetName,
            daysRemaining: days,
            totalDays: days,
            progress: 5,
            cost: costBillion
        };
        alert(`🏛️ Policy Reform Initiated: Transitioning state structure to "${targetName}". Duration: ${days} days.`);
        this.renderCabinetSubsystem();
    },

    // Ministerial Voting Calculation Engine
    conveneVote(motionType) {
        const resultsEl = document.getElementById('cabinet-vote-results');
        if (!resultsEl) return;

        let yesVotes = 0;
        let noVotes = 0;
        let abstainVotes = 0;
        let breakdownHTML = '';

        const db = window.OmegaCabinetUI ? window.OmegaCabinetUI.ministriesDatabase : {};
        const keys = Object.keys(db);

        keys.forEach(key => {
            const m = db[key];
            const p = this.personalities[key] || { type: 'Pragmatic', stance: 'Neutral' };
            let vote = 'YES';
            let reason = 'Aligns with national policy';

            if (motionType === 'DEFENSE_TRIPLE') {
                if (p.type === 'Aggressive' || p.type === 'Loyalist') {
                    vote = 'YES';
                    reason = 'Strong defense deters enemies!';
                } else if (p.type === 'Technocrat') {
                    vote = 'NO';
                    reason = 'Will strain fiscal balance.';
                } else {
                    vote = 'ABSTAIN';
                    reason = 'Pending economic impact study.';
                }
            } else if (motionType === 'TAX_REDUCTION') {
                if (key === 'taxes' || key === 'treasury_finance') {
                    vote = 'NO';
                    reason = 'Reduces sovereign treasury revenue.';
                } else {
                    vote = 'YES';
                    reason = 'Boosts industrial investment.';
                }
            } else {
                vote = 'YES';
                reason = 'Accelerates national modernization.';
            }

            if (vote === 'YES') yesVotes++;
            else if (vote === 'NO') noVotes++;
            else abstainVotes++;

            const badgeColor = vote === 'YES' ? '#22c55e' : (vote === 'NO' ? '#ef4444' : '#ffd700');
            breakdownHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:6px 10px; border-radius:6px; font-size:11px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span>${p.icon || m.avatar}</span>
                        <strong style="color:#f8fafc;">${m.title}</strong>
                        <span style="color:#94a3b8; font-size:10px;">(${p.type})</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="color:#cbd5e1; font-size:10px;">"${reason}"</span>
                        <span style="background:${badgeColor}22; border:1px solid ${badgeColor}; color:${badgeColor}; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:10px;">${vote}</span>
                    </div>
                </div>
            `;
        });

        const motionPassed = yesVotes >= 9;
        const statusColor = motionPassed ? '#22c55e' : '#ef4444';

        resultsEl.innerHTML = `
            <div style="width:100%; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
                    <div>
                        <strong style="font-size:14px; color:${statusColor}; font-family:'Orbitron',sans-serif;">
                            ${motionPassed ? '✅ MOTION PASSED BY CABINET' : '❌ MOTION REJECTED BY CABINET'}
                        </strong>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">
                            Votes: <span style="color:#22c55e; font-weight:bold;">${yesVotes} YES</span> | 
                            <span style="color:#ef4444; font-weight:bold;">${noVotes} NO</span> | 
                            <span style="color:#ffd700; font-weight:bold;">${abstainVotes} ABSTAIN</span>
                        </div>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto; padding-right:4px;">
                    ${breakdownHTML}
                </div>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.OmegaCabinetEngine.init();
});
