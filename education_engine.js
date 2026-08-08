/**
 * ============================================================================
 * EDUCATION MINISTRY 2.0 - STRATEGIC NATIONAL CAPABILITY ENGINE
 * Subsystem: Sovereign Human Capital, Research Ecosystem & Technological Sovereignty
 * Pure English AAA Strategy Game Command Center
 * ============================================================================
 */

window.EducationEngine = (() => {
    // -------------------------------------------------------------------------
    // 1. STATE MANAGEMENT & COUNTRY REGISTRY
    // -------------------------------------------------------------------------
    const state = {
        activeCountry: 'BANGLADESH',
        activeSub: 'network', // network | research | talent | academic | projects | policy | diplomacy | intelligence | dependencies | report
        selectedDoctrine: 'SCIENTIFIC_SUPERPOWER',
        selectedModalItem: null,
        
        // Country-specific persistent simulation state
        dataByCountry: {}
    };

    // Default template state generator for any country
    function getDefaultCountryState(countryKey) {
        return {
            nationalPowerScore: 78,
            humanCapital: 74,
            scientificCapacity: 61,
            technicalWorkforce: 69,
            knowledgeReserve: 58,
            brainDrainRate: -1.4, // net % migration flow
            softPower: 43,
            techIndependence: 64, // % technological sovereignty
            annualBudget: 18.5, // $B
            
            // 1. NETWORK (INSTITUTIONS)
            institutions: [
                { id: 'univ_1', name: 'National University of Science & Tech', type: 'Elite University', capacity: 45000, graduates: 9200, spec: 'AI & Engineering Hub', level: 4, researchScore: 88, status: 'Active' },
                { id: 'univ_2', name: 'Central Medical Research Varsity', type: 'Public University', capacity: 28000, graduates: 5100, spec: 'Medical Science Center', level: 3, researchScore: 82, status: 'Active' },
                { id: 'univ_3', name: 'Defense & Aerospace Academy', type: 'Specialized Varsity', capacity: 12000, graduates: 2400, spec: 'Military Tech Partner', level: 4, researchScore: 91, status: 'Active' },
                { id: 'inst_1', name: 'National Polytech & Vocational Institute', type: 'Technical Institute', capacity: 85000, graduates: 21000, spec: 'Industrial Trade', level: 3, researchScore: 64, status: 'Active' },
                { id: 'lab_1', name: 'Advanced Quantum & Semiconductor Lab', type: 'National Lab', capacity: 3500, graduates: 800, spec: 'Frontier Tech', level: 5, researchScore: 96, status: 'Active' },
                { id: 'cluster_1', name: 'Chittagong-Dhaka Knowledge-Industrial Cluster', type: 'Education Cluster', capacity: 120000, graduates: 32000, spec: 'Tech & Manufacturing', level: 4, researchScore: 89, status: 'Active' }
            ],

            // 2. RESEARCH PROGRAMS
            researchPrograms: [
                { id: 'prog_1', name: 'Advanced Semiconductor & Microchip Design', category: 'Computing', progress: 71, researchers: 420, budget: 2.4, targetMinistry: 'Industry & Defense', impact: '+9% Tech Sovereignty' },
                { id: 'prog_2', name: 'Genomic Medicine & Vaccine Engineering', category: 'Biotech', progress: 84, researchers: 310, budget: 1.8, targetMinistry: 'Health & Welfare', impact: '+12% Health Resilience' },
                { id: 'prog_3', name: 'Thorium & Nuclear Power Efficiency', category: 'Energy', progress: 58, researchers: 280, budget: 3.1, targetMinistry: 'Energy & Mining', impact: '+8% Baseload Power' },
                { id: 'prog_4', name: 'Autonomous Drone Swarm & Cyber Mesh', category: 'Defense R&D', progress: 65, researchers: 390, budget: 2.9, targetMinistry: 'Defense & Security', impact: '+11% Tactical ORS' },
                { id: 'prog_5', name: 'High-Tensile Composite Armor Materials', category: 'Materials', progress: 42, researchers: 190, budget: 1.2, targetMinistry: 'Heavy Manufacturing', impact: '+6% Industrial Output' }
            ],

            // 3. TALENT POOLS
            talentPools: {
                scientists: { count: 42800, incoming: 1240, outgoing: 1870, status: 'Net Deficit' },
                engineers: { count: 185000, incoming: 3100, outgoing: 2400, status: 'Net Surplus' },
                doctors: { count: 64000, incoming: 890, outgoing: 1120, status: 'Net Deficit' },
                cyberSpecialists: { count: 28000, incoming: 1450, outgoing: 980, status: 'Net Surplus' },
                militaryResearchers: { count: 14200, incoming: 420, outgoing: 110, status: 'Net Surplus' },
                teachers: { count: 420000, incoming: 8200, outgoing: 4100, status: 'Net Surplus' },
                administrators: { count: 95000, incoming: 1200, outgoing: 800, status: 'Net Surplus' }
            },

            // 4. SUBJECT ECOSYSTEM
            subjects: [
                { id: 'math', name: 'Mathematics & Statistics', quality: 82, researchLevel: 79, mastery: 76, contribution: 'Foundation' },
                { id: 'cs', name: 'Computer Science & AI', quality: 88, researchLevel: 91, mastery: 84, contribution: 'High Growth' },
                { id: 'eng', name: 'Engineering & Robotics', quality: 85, researchLevel: 87, mastery: 80, contribution: 'Industrial' },
                { id: 'phy', name: 'Applied Physics & Quantum', quality: 78, researchLevel: 82, mastery: 71, contribution: 'Frontier Tech' },
                { id: 'med', name: 'Biomedical & Pharmacy', quality: 84, researchLevel: 85, mastery: 79, contribution: 'Healthcare' },
                { id: 'econ', name: 'Economics & Public Policy', quality: 75, researchLevel: 72, mastery: 78, contribution: 'Governance' }
            ],

            // 5. STRATEGIC MEGA PROJECTS
            megaProjects: [
                { id: 'proj_nsi', name: 'NATIONAL SCIENCE INITIATIVE', durationYears: 8, costBillions: 18, universitiesReq: 12, labsReq: 24, status: 'In Progress', progressPct: 45, effects: 'Scientific Capacity +15, Research Output +22%, Tech Growth +9%' },
                { id: 'proj_ntr', name: 'NATIONAL TECHNICAL REVOLUTION', durationYears: 5, costBillions: 12, universitiesReq: 8, labsReq: 15, status: 'Approved', progressPct: 20, effects: 'Skilled Workforce Explosion, Manufacturing Productivity +35%' },
                { id: 'proj_ai_varsity', name: 'AI & ROBOTICS VARSITIES EXPANSION', durationYears: 4, costBillions: 10, universitiesReq: 10, labsReq: 20, status: 'Proposed', progressPct: 0, effects: '10 Autonomous AI Campuses, Cyber Readiness +25%' },
                { id: 'proj_global_scholar', name: 'GLOBAL SCHOLARSHIP FUND', durationYears: 3, costBillions: 4, universitiesReq: 5, labsReq: 10, status: 'In Progress', progressPct: 60, effects: '25,000 Overseas Fellows, Soft Power +18, Brain Gain +4%' }
            ],

            // 6. DIPLOMACY & ALLIANCES
            diplomaticAlliances: [
                { partner: 'United States', program: 'Joint Quantum Computing Lab', status: 'Active', trustLevel: 88, risk: 'Low' },
                { partner: 'Japan', program: 'Semiconductor Fabrication Academy', status: 'Active', trustLevel: 92, risk: 'Low' },
                { partner: 'Germany', program: 'Vocational Engineering Exchange', status: 'Active', trustLevel: 85, risk: 'Low' },
                { partner: 'China', program: 'High-Speed Rail & Civil Engineering R&D', status: 'Active', trustLevel: 76, risk: 'Medium' }
            ],

            // 7. INTELLIGENCE ALERTS
            intelligenceAlerts: [
                { type: 'WARNING', title: 'Brain Drain Vulnerability in Biotech', detail: '34% of senior medical researchers received overseas recruitment offers.', urgency: 'HIGH' },
                { type: 'GAP', title: 'Lithium Battery R&D Deficit', detail: 'National energy storage technology lags regional competitors by 4.2 years.', urgency: 'MEDIUM' },
                { type: 'OPPORTUNITY', title: 'Foreign Scientist Migration Wave', detail: 'Over 850 foreign AI engineers applying for national research grants.', urgency: 'LOW' }
            ]
        };
    }

    function getCountryData(countryKey) {
        const key = (countryKey || state.activeCountry || 'BANGLADESH').toUpperCase();
        if (!state.dataByCountry[key]) {
            state.dataByCountry[key] = getDefaultCountryState(key);
        }
        return state.dataByCountry[key];
    }

    // -------------------------------------------------------------------------
    // 2. MAIN DASHBOARD RENDERER
    // -------------------------------------------------------------------------
    function renderDashboard(ministryObj, containerEl) {
        const countryKey = (window.OmegaCabinetUI && window.OmegaCabinetUI.activeCountry) || window.activeCountry || 'BANGLADESH';
        state.activeCountry = countryKey;
        const data = getCountryData(countryKey);
        const ministerName = ministryObj.ministerName || 'Dr. Mohibul Hassan Chowdhoury';
        const ministerRole = ministryObj.role || 'Minister of Education & Strategic Talent Command';

        let html = `
            <div id="education-ministry-root" style="color:#f8fafc; font-family:'Inter',sans-serif; display:flex; flex-direction:column; gap:16px;">
                <!-- AAA HERO HEADER BANNER -->
                <div style="background:linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,58,138,0.85)); border:1.5px solid #00e5ff; border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; box-shadow:0 0 22px rgba(0,229,255,0.25);">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <button onclick="window.OmegaLayerManager ? window.OmegaLayerManager.popLayer() : (document.getElementById('ministry-dashboard-view').style.display='none');" 
                                style="background:linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.9)); border:1.5px solid #00e5ff; color:#00e5ff; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(0,229,255,0.2);">
                            <span>⬅️</span> <span>BACK TO CABINET</span>
                        </button>
                        <div style="font-size:38px; background:rgba(0,229,255,0.1); padding:8px 14px; border-radius:12px; border:1px solid rgba(0,229,255,0.3);">🎓</div>
                        <div>
                            <h1 style="margin:0; font-family:'Inter',sans-serif; font-weight:800; font-size:22px; color:#f8fafc; letter-spacing:0.3px;">MINISTRY OF EDUCATION 2.0 (${countryKey.toUpperCase()})</h1>
                            <div style="font-size:12px; font-weight:600; color:#00e5ff; margin-top:2px;">Strategic National Capability Engine & Human Capital Command</div>
                            <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">
                                Minister: <strong style="color:#ffd700;">${ministerName}</strong> | Doctrine: <strong style="color:#38bdf8;">${state.selectedDoctrine.replace(/_/g, ' ')}</strong>
                            </div>
                        </div>
                    </div>

                    <!-- TOP KPI BADGES -->
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <div style="background:rgba(0,0,0,0.6); border:1px solid #38bdf8; padding:6px 12px; border-radius:8px; text-align:center;">
                            <div style="font-size:9px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">EDUCATION POWER</div>
                            <div style="font-size:18px; font-weight:800; color:#38bdf8;">${data.nationalPowerScore}<span style="font-size:10px;">/100</span></div>
                        </div>
                        <div style="background:rgba(0,0,0,0.6); border:1px solid #10b981; padding:6px 12px; border-radius:8px; text-align:center;">
                            <div style="font-size:9px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">ANNUAL BUDGET</div>
                            <div style="font-size:18px; font-weight:800; color:#10b981;">$${data.annualBudget}B</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.6); border:1px solid #a855f7; padding:6px 12px; border-radius:8px; text-align:center;">
                            <div style="font-size:9px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">TECH SOVEREIGNTY</div>
                            <div style="font-size:18px; font-weight:800; color:#a855f7;">${data.techIndependence}%</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.6); border:1px solid #f59e0b; padding:6px 12px; border-radius:8px; text-align:center;">
                            <div style="font-size:9px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">TALENT POOL</div>
                            <div style="font-size:18px; font-weight:800; color:#f59e0b;">2.4M</div>
                        </div>
                    </div>
                </div>

                <!-- 10 PRIMARY COMMAND BUTTONS BAR -->
                <div style="display:flex; gap:6px; background:rgba(15,23,42,0.9); padding:8px; border-radius:10px; border:1px solid rgba(0,229,255,0.2); overflow-x:auto; -webkit-overflow-scrolling:touch;">
                    ${renderNavButton('network', '🏛️ NETWORK', 'Infrastructure')}
                    ${renderNavButton('research', '🔬 RESEARCH', 'Innovation Engine')}
                    ${renderNavButton('talent', '🧠 TALENT', 'Human Capital')}
                    ${renderNavButton('academic', '📚 ACADEMIC', 'Curriculum & STEM')}
                    ${renderNavButton('projects', '🚀 PROJECTS', 'Mega Initiatives')}
                    ${renderNavButton('policy', '📜 POLICY', 'National Doctrine')}
                    ${renderNavButton('diplomacy', '🌐 DIPLOMACY', 'Soft Power')}
                    ${renderNavButton('intelligence', '🕵️ INTELLIGENCE', 'Talent Monitor')}
                    ${renderNavButton('dependencies', '🔗 DEPENDENCIES', 'Ministry Network')}
                    ${renderNavButton('report', '📊 REPORT', 'Projections')}
                </div>

                <!-- SUBVIEW CONTENT ROOT -->
                <div id="education-subview-content" style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px;">
                    ${renderActiveSubView(data)}
                </div>
            </div>
        `;

        containerEl.innerHTML = html;
    }

    function renderNavButton(id, label, subtext) {
        const isActive = state.activeSub === id;
        const activeBg = isActive ? 'linear-gradient(135deg, rgba(0,229,255,0.3), rgba(30,58,138,0.6))' : 'rgba(30,41,59,0.5)';
        const activeBorder = isActive ? '#00e5ff' : 'rgba(255,255,255,0.1)';
        const activeColor = isActive ? '#00e5ff' : '#94a3b8';

        return `
            <button onclick="window.EducationEngine.switchSubView('${id}')" 
                    style="flex:1; min-width:110px; padding:8px 10px; background:${activeBg}; border:1px solid ${activeBorder}; border-radius:8px; cursor:pointer; text-align:center; transition:all 0.2s ease;">
                <div style="font-family:'Share Tech Mono',monospace; font-size:12px; font-weight:bold; color:${activeColor}; white-space:nowrap;">${label}</div>
                <div style="font-size:9px; color:#64748b; margin-top:2px; white-space:nowrap;">${subtext}</div>
            </button>
        `;
    }

    function switchSubView(subId) {
        state.activeSub = subId;
        const container = document.getElementById('ministry-dashboard-content');
        if (container) {
            const data = getCountryData(state.activeCountry);
            const m = (window.OmegaCabinetUI && window.OmegaCabinetUI.ministriesDatabase && window.OmegaCabinetUI.ministriesDatabase['education']) || { title: 'Ministry of Education' };
            renderDashboard(m, container);
        }
    }

    // -------------------------------------------------------------------------
    // 3. SUBVIEW RENDER ROUTER & VIEWS
    // -------------------------------------------------------------------------
    function renderActiveSubView(data) {
        switch (state.activeSub) {
            case 'network': return renderNetworkView(data);
            case 'research': return renderResearchView(data);
            case 'talent': return renderTalentView(data);
            case 'academic': return renderAcademicView(data);
            case 'projects': return renderProjectsView(data);
            case 'policy': return renderPolicyView(data);
            case 'diplomacy': return renderDiplomacyView(data);
            case 'intelligence': return renderIntelligenceView(data);
            case 'dependencies': return renderDependenciesView(data);
            case 'report': return renderReportView(data);
            default: return renderNetworkView(data);
        }
    }

    // --- 1. NETWORK VIEW ---
    function renderNetworkView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#00e5ff;">🏛️ NATIONAL EDUCATION INFRASTRUCTURE NETWORK</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Active Academic Nodes, Universities, Specialized Institutes, & Knowledge Clusters</p>
                    </div>
                    <button onclick="window.EducationEngine.openAddInstitutionModal()" style="background:linear-gradient(135deg, #059669, #10b981); border:none; color:white; padding:8px 14px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">
                        + BUILD NEW INSTITUTION
                    </button>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:14px;">
                    ${data.institutions.map(inst => `
                        <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(0,229,255,0.2); border-radius:10px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                    <span style="font-size:10px; background:rgba(0,229,255,0.15); color:#00e5ff; padding:2px 6px; border-radius:4px; font-weight:bold;">${inst.type.toUpperCase()}</span>
                                    <span style="font-size:11px; color:#ffd700; font-family:'Share Tech Mono',monospace;">LVL ${inst.level}/5</span>
                                </div>
                                <h4 style="margin:8px 0 4px 0; font-size:15px; color:#f8fafc;">${inst.name}</h4>
                                <div style="font-size:12px; color:#38bdf8;">Specialization: <strong>${inst.spec}</strong></div>
                            </div>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:rgba(15,23,42,0.6); padding:8px; border-radius:6px; font-size:11px;">
                                <div><span style="color:#94a3b8;">Student Cap:</span> <strong style="color:#f8fafc;">${inst.capacity.toLocaleString()}</strong></div>
                                <div><span style="color:#94a3b8;">Annual Grads:</span> <strong style="color:#10b981;">${inst.graduates.toLocaleString()}</strong></div>
                                <div><span style="color:#94a3b8;">Research Score:</span> <strong style="color:#a855f7;">${inst.researchScore}/100</strong></div>
                                <div><span style="color:#94a3b8;">Node Status:</span> <strong style="color:#00e5ff;">${inst.status}</strong></div>
                            </div>

                            <div style="display:flex; gap:6px;">
                                <button onclick="window.EducationEngine.upgradeInstitution('${inst.id}')" style="flex:1; background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; padding:6px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">⚡ UPGRADE</button>
                                <button onclick="window.EducationEngine.specializeInstitution('${inst.id}')" style="flex:1; background:rgba(168,85,247,0.15); border:1px solid #a855f7; color:#a855f7; padding:6px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">🎯 SPECIALIZE</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- 2. RESEARCH VIEW ---
    function renderResearchView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#a855f7;">🔬 STRATEGIC RESEARCH PROGRAMS & KNOWLEDGE ENGINE</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Pioneering National Discoveries, Technology Transfer, & Inter-Ministry R&D Spillover</p>
                    </div>
                    <div style="font-family:'Share Tech Mono',monospace; font-size:12px; color:#ffd700; background:rgba(0,0,0,0.5); padding:6px 12px; border-radius:6px; border:1px solid #ffd700;">
                        KNOWLEDGE RESERVE: <strong>${data.knowledgeReserve}/100</strong>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${data.researchPrograms.map(prog => `
                        <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                <div>
                                    <span style="font-size:10px; background:rgba(168,85,247,0.2); color:#c084fc; padding:2px 8px; border-radius:4px; font-weight:bold;">${prog.category.toUpperCase()}</span>
                                    <h4 style="margin:4px 0 2px 0; font-size:15px; color:#f8fafc;">${prog.name}</h4>
                                    <div style="font-size:11px; color:#94a3b8;">Spillover Target: <strong style="color:#00e5ff;">${prog.targetMinistry}</strong> | Impact: <strong style="color:#10b981;">${prog.impact}</strong></div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:11px; color:#cbd5e1;">Funding: <strong style="color:#10b981;">$${prog.budget}B</strong></div>
                                    <div style="font-size:11px; color:#cbd5e1;">Researchers: <strong style="color:#38bdf8;">${prog.researchers} Scientists</strong></div>
                                </div>
                            </div>

                            <!-- PROGRESS BAR -->
                            <div>
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-bottom:4px;">
                                    <span>R&D COMPLETION</span>
                                    <span style="color:#a855f7; font-weight:bold;">${prog.progress}%</span>
                                </div>
                                <div style="width:100%; height:8px; background:rgba(15,23,42,0.8); border-radius:4px; overflow:hidden;">
                                    <div style="width:${prog.progress}%; height:100%; background:linear-gradient(90deg, #8b5cf6, #00e5ff); border-radius:4px;"></div>
                                </div>
                            </div>

                            <div style="display:flex; gap:8px; justify-content:flex-end;">
                                <button onclick="window.EducationEngine.adjustResearchFunding('${prog.id}', 0.5)" style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">+$500M FUNDING</button>
                                <button onclick="window.EducationEngine.transferTech('${prog.id}')" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">📲 TRANSFER TECH TO MINISTRY</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- 3. TALENT VIEW & MIGRATION ENGINE ---
    function calculateTalentMigration(data) {
        if (!data.talentIncentives) {
            data.talentIncentives = {
                grantsBoost: 0,
                housingBoost: 0,
                returneeBoost: 0,
                salaryBoost: 0,
                totalBoost: 0
            };
        }

        // 1. Research Funding Factor (Total R&D budget + grants incentives)
        const baseResearchFunding = data.researchPrograms ? data.researchPrograms.reduce((sum, p) => sum + (p.budget || 0), 0) : 10;
        const totalResearchFunding = baseResearchFunding + (data.talentIncentives.grantsBoost || 0);
        const fundingFactor = Math.min(100, Math.max(15, totalResearchFunding * 6.5));

        // 2. University Quality Factor (Average research score of active institutions)
        const totalInstScore = data.institutions ? data.institutions.reduce((sum, inst) => sum + (inst.researchScore || 50), 0) : 300;
        const avgUniversityQuality = data.institutions && data.institutions.length ? (totalInstScore / data.institutions.length) : 70;

        // 3. Economic Stability Factor
        let econStability = 75;
        if (window.OmegaCabinetUI && window.OmegaCabinetUI.economicState && typeof window.OmegaCabinetUI.economicState.stability === 'number') {
            econStability = window.OmegaCabinetUI.economicState.stability;
        } else if (data.annualBudget) {
            econStability = Math.min(100, Math.max(35, data.annualBudget * 3.8 + 12));
        }

        // 4. Combined Migration Score (0 to 100)
        const incentivesBonus = Math.min(18, (data.talentIncentives.salaryBoost || 0) * 8 + (data.talentIncentives.housingBoost || 0) * 6 + (data.talentIncentives.returneeBoost || 0) * 10);
        const rawMigrationScore = (fundingFactor * 0.35) + (avgUniversityQuality * 0.35) + (econStability * 0.30) + incentivesBonus;
        const migrationScore = Math.min(100, Math.max(10, rawMigrationScore));

        // Net migration rate % per year (-3.5% to +3.5%)
        const netRate = parseFloat(((migrationScore - 55) / 12).toFixed(2));
        data.brainDrainRate = netRate;

        // Configuration per talent pool
        const poolConfigs = {
            scientists: { inMult: 0.032, outMult: 0.038, base: 42800 },
            engineers: { inMult: 0.022, outMult: 0.016, base: 185000 },
            doctors: { inMult: 0.019, outMult: 0.024, base: 64000 },
            cyberSpecialists: { inMult: 0.048, outMult: 0.028, base: 28000 },
            militaryResearchers: { inMult: 0.028, outMult: 0.012, base: 14200 },
            teachers: { inMult: 0.016, outMult: 0.011, base: 420000 },
            administrators: { inMult: 0.013, outMult: 0.009, base: 95000 }
        };

        let totalIncoming = 0;
        let totalOutgoing = 0;

        if (data.talentPools) {
            Object.keys(data.talentPools).forEach(key => {
                const pool = data.talentPools[key];
                const cfg = poolConfigs[key] || { inMult: 0.02, outMult: 0.02, base: pool.count || 20000 };
                
                const gainMult = Math.max(0.2, (migrationScore / 55) * (1 + (data.talentIncentives.returneeBoost || 0) * 0.2));
                const lossMult = Math.max(0.15, ((100 - migrationScore) / 45) * (1 - (data.talentIncentives.housingBoost || 0) * 0.22 - (data.talentIncentives.salaryBoost || 0) * 0.18));

                const incoming = Math.round(cfg.base * cfg.inMult * gainMult);
                const outgoing = Math.round(cfg.base * cfg.outMult * lossMult);

                pool.incoming = incoming;
                pool.outgoing = outgoing;
                pool.netFlow = incoming - outgoing;
                pool.status = pool.netFlow >= 0 ? 'Net Surplus' : 'Net Deficit';

                totalIncoming += incoming;
                totalOutgoing += outgoing;
            });
        }

        const netBrainFlow = totalIncoming - totalOutgoing;

        return {
            totalResearchFunding,
            fundingFactor: Math.round(fundingFactor),
            avgUniversityQuality: Math.round(avgUniversityQuality),
            econStability: Math.round(econStability),
            migrationScore: Math.round(migrationScore),
            netRate,
            totalIncoming,
            totalOutgoing,
            netBrainFlow,
            incentivesBonus: Math.round(incentivesBonus)
        };
    }

    function renderTalentView(data) {
        const metrics = calculateTalentMigration(data);
        const pools = data.talentPools;
        const isNetGain = metrics.netBrainFlow >= 0;
        const netFlowFormatted = (metrics.netBrainFlow >= 0 ? '+' : '') + metrics.netBrainFlow.toLocaleString();

        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <!-- TOP TALENT HEADER & OVERALL BRAIN FLOW BADGE -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#f59e0b;">🧠 HUMAN CAPITAL & TALENT MIGRATION COMMAND</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Dynamic Net Brain Flow Engine & Strategic Retention System</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="background:${isNetGain ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; border:1.5px solid ${isNetGain ? '#10b981' : '#ef4444'}; padding:6px 14px; border-radius:8px; text-align:right;">
                            <div style="font-size:10px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">NET BRAIN FLOW</div>
                            <div style="font-size:18px; font-weight:800; color:${isNetGain ? '#10b981' : '#ef4444'}; font-family:'Share Tech Mono',monospace;">
                                ${netFlowFormatted} <span style="font-size:10px;">scholars/yr</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TALENT MIGRATION ANALYTICS DASHBOARD CARD -->
                <div style="background:rgba(15,23,42,0.95); border:1.5px solid ${isNetGain ? '#10b981' : '#f59e0b'}; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:14px; box-shadow:0 0 15px ${isNetGain ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'};">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:24px;">🌊</span>
                            <div>
                                <h4 style="margin:0; font-size:15px; color:#f8fafc;">NET BRAIN FLOW MATRIX</h4>
                                <div style="font-size:11px; color:#94a3b8;">Calculated live via R&D Funding, University Quality, & Economic Stability</div>
                            </div>
                        </div>
                        <span style="padding:4px 12px; border-radius:20px; font-size:11px; font-weight:bold; background:${isNetGain ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color:${isNetGain ? '#10b981' : '#ef4444'}; border:1px solid ${isNetGain ? '#10b981' : '#ef4444'}; font-family:'Share Tech Mono',monospace;">
                            ${isNetGain ? '🟢 NET BRAIN GAIN' : '🔴 NET BRAIN DRAIN'} (${metrics.netRate >= 0 ? '+' : ''}${metrics.netRate}% / yr)
                        </span>
                    </div>

                    <!-- MIGRATION DRIVERS GRID -->
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap:10px;">
                        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(168,85,247,0.3); padding:10px; border-radius:8px;">
                            <div style="font-size:10px; color:#c084fc; font-weight:bold;">🔬 RESEARCH FUNDING</div>
                            <div style="font-size:18px; font-weight:800; color:#f8fafc; font-family:'Share Tech Mono',monospace; margin:2px 0;">${metrics.fundingFactor}<span style="font-size:10px; color:#94a3b8;">/100</span></div>
                            <div style="font-size:10px; color:#cbd5e1;">R&D Allocation: <strong style="color:#10b981;">$${metrics.totalResearchFunding.toFixed(1)}B</strong></div>
                        </div>

                        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(0,229,255,0.3); padding:10px; border-radius:8px;">
                            <div style="font-size:10px; color:#00e5ff; font-weight:bold;">🎓 UNIVERSITY QUALITY</div>
                            <div style="font-size:18px; font-weight:800; color:#f8fafc; font-family:'Share Tech Mono',monospace; margin:2px 0;">${metrics.avgUniversityQuality}<span style="font-size:10px; color:#94a3b8;">/100</span></div>
                            <div style="font-size:10px; color:#cbd5e1;">Avg Academic Research Score</div>
                        </div>

                        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(16,185,129,0.3); padding:10px; border-radius:8px;">
                            <div style="font-size:10px; color:#10b981; font-weight:bold;">📈 ECONOMIC STABILITY</div>
                            <div style="font-size:18px; font-weight:800; color:#f8fafc; font-family:'Share Tech Mono',monospace; margin:2px 0;">${metrics.econStability}<span style="font-size:10px; color:#94a3b8;">/100</span></div>
                            <div style="font-size:10px; color:#cbd5e1;">National Sovereign Stability</div>
                        </div>

                        <div style="background:rgba(30,41,59,0.8); border:1px solid rgba(245,158,11,0.3); padding:10px; border-radius:8px;">
                            <div style="font-size:10px; color:#f59e0b; font-weight:bold;">⚡ RETENTION INCENTIVES</div>
                            <div style="font-size:18px; font-weight:800; color:#f8fafc; font-family:'Share Tech Mono',monospace; margin:2px 0;">+${metrics.incentivesBonus}<span style="font-size:10px; color:#94a3b8;"> pts</span></div>
                            <div style="font-size:10px; color:#cbd5e1;">Active Directive Boost</div>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#cbd5e1; background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:6px; flex-wrap:wrap; gap:6px;">
                        <span>Total Incoming Experts: <strong style="color:#10b981;">+${metrics.totalIncoming.toLocaleString()} / yr</strong></span>
                        <span>Total Emigrating Experts: <strong style="color:#ef4444;">-${metrics.totalOutgoing.toLocaleString()} / yr</strong></span>
                        <span>Migration Score Index: <strong style="color:#38bdf8;">${metrics.migrationScore}/100</strong></span>
                    </div>
                </div>

                <!-- TALENT POOL CARDS GRID -->
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
                    ${Object.keys(pools).map(key => {
                        const pool = pools[key];
                        const title = key.replace(/([A-Z])/g, ' $1').toUpperCase();
                        const isSurplus = (pool.netFlow !== undefined ? pool.netFlow >= 0 : pool.incoming >= pool.outgoing);
                        const netFlowStr = pool.netFlow !== undefined ? (pool.netFlow >= 0 ? `+${pool.netFlow}` : `${pool.netFlow}`) : (pool.incoming - pool.outgoing >= 0 ? `+${pool.incoming - pool.outgoing}` : `${pool.incoming - pool.outgoing}`);

                        return `
                            <div style="background:rgba(30,41,59,0.7); border:1px solid ${isSurplus ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}; border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:11px; color:#f59e0b; font-weight:bold;">${title}</span>
                                    <span style="font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold; background:${isSurplus ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color:${isSurplus ? '#10b981' : '#ef4444'};">${pool.status}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:baseline;">
                                    <div style="font-size:22px; font-weight:800; color:#f8fafc; font-family:'Share Tech Mono',monospace;">${pool.count.toLocaleString()}</div>
                                    <div style="font-size:12px; font-weight:bold; color:${isSurplus ? '#10b981' : '#ef4444'}; font-family:'Share Tech Mono',monospace;">${netFlowStr}/yr</div>
                                </div>
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8;">
                                    <span>Incoming: <strong style="color:#10b981;">+${pool.incoming}</strong></span>
                                    <span>Outgoing: <strong style="color:#ef4444;">-${pool.outgoing}</strong></span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- BRAIN DRAIN COUNTER-MEASURES & DIRECTIVES -->
                <div style="background:rgba(15,23,42,0.9); border:1px solid #f59e0b; border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px;">
                    <h4 style="margin:0; font-size:14px; color:#f59e0b;">🛡️ TALENT MIGRATION DIRECTIVES & RETENTION INCENTIVES</h4>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                        <button onclick="window.EducationEngine.triggerTalentAction('grants')" style="background:rgba(245,158,11,0.15); border:1px solid #f59e0b; color:#f59e0b; padding:10px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">
                            💵 Launch High-Pay R&D Grants (+$1.5B)
                        </button>
                        <button onclick="window.EducationEngine.triggerTalentAction('housing')" style="background:rgba(56,189,248,0.15); border:1px solid #38bdf8; color:#38bdf8; padding:10px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">
                            🏠 Scientist Housing & Tenure Package
                        </button>
                        <button onclick="window.EducationEngine.triggerTalentAction('returnee')" style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:10px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">
                            ✈️ Overseas Returnee Fellowships
                        </button>
                        <button onclick="window.EducationEngine.triggerTalentAction('salary')" style="background:rgba(168,85,247,0.15); border:1px solid #a855f7; color:#a855f7; padding:10px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">
                            📈 National STEM Salary Hike (+20%)
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // --- 4. ACADEMIC VIEW ---
    function renderAcademicView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#38bdf8;">📚 NATIONAL ACADEMIC CURRICULUM & SUBJECT MASTERY</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">STEM Discipline Quality, Standardized Mastery, & Workforce Contribution</p>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:12px;">
                    ${data.subjects.map(subj => `
                        <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(56,189,248,0.25); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h4 style="margin:0; font-size:14px; color:#f8fafc;">${subj.name}</h4>
                                <span style="font-size:10px; background:rgba(56,189,248,0.2); color:#38bdf8; padding:2px 6px; border-radius:4px; font-weight:bold;">${subj.contribution}</span>
                            </div>
                            
                            <div style="display:flex; flex-direction:column; gap:6px; font-size:11px;">
                                <div>
                                    <div style="display:flex; justify-content:space-between; color:#cbd5e1;"><span>Teaching Quality:</span> <strong>${subj.quality}%</strong></div>
                                    <div style="width:100%; height:4px; background:rgba(0,0,0,0.5); border-radius:2px;"><div style="width:${subj.quality}%; height:100%; background:#38bdf8;"></div></div>
                                </div>
                                <div>
                                    <div style="display:flex; justify-content:space-between; color:#cbd5e1;"><span>Research Level:</span> <strong>${subj.researchLevel}%</strong></div>
                                    <div style="width:100%; height:4px; background:rgba(0,0,0,0.5); border-radius:2px;"><div style="width:${subj.researchLevel}%; height:100%; background:#a855f7;"></div></div>
                                </div>
                                <div>
                                    <div style="display:flex; justify-content:space-between; color:#cbd5e1;"><span>Student Mastery:</span> <strong>${subj.mastery}%</strong></div>
                                    <div style="width:100%; height:4px; background:rgba(0,0,0,0.5); border-radius:2px;"><div style="width:${subj.mastery}%; height:100%; background:#10b981;"></div></div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- 5. PROJECTS VIEW ---
    function renderProjectsView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#10b981;">🚀 STRATEGIC NATIONAL MEGA PROJECTS</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Multi-Year Infrastructure Initiatives for Civilization-Level Capability Shifts</p>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${data.megaProjects.map(proj => `
                        <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                                <div>
                                    <span style="font-size:10px; background:rgba(16,185,129,0.2); color:#10b981; padding:2px 8px; border-radius:4px; font-weight:bold;">${proj.status.toUpperCase()}</span>
                                    <h4 style="margin:4px 0 2px 0; font-size:16px; color:#f8fafc;">${proj.name}</h4>
                                    <div style="font-size:12px; color:#38bdf8;">Effects: <strong>${proj.effects}</strong></div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:12px; color:#ffd700; font-weight:bold;">Cost: $${proj.costBillions}B</div>
                                    <div style="font-size:11px; color:#cbd5e1;">Horizon: ${proj.durationYears} Years</div>
                                </div>
                            </div>

                            <div>
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-bottom:4px;">
                                    <span>IMPLEMENTATION STAGE</span>
                                    <span style="color:#10b981; font-weight:bold;">${proj.progressPct}%</span>
                                </div>
                                <div style="width:100%; height:8px; background:rgba(15,23,42,0.8); border-radius:4px; overflow:hidden;">
                                    <div style="width:${proj.progressPct}%; height:100%; background:linear-gradient(90deg, #10b981, #00e5ff); border-radius:4px;"></div>
                                </div>
                            </div>

                            <div style="display:flex; gap:8px; justify-content:flex-end;">
                                <button onclick="window.EducationEngine.advanceProject('${proj.id}')" style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:6px 14px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">
                                    🚀 ADVANCE STAGE (+15%)
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- 6. POLICY VIEW ---
    function renderPolicyView(data) {
        const doctrines = [
            { id: 'SCIENTIFIC_SUPERPOWER', title: 'SCIENTIFIC SUPERPOWER', desc: 'Focus on elite frontiers research, physics, AI labs, and high-level patent generation.', focus: 'Research +++, STEM +++, Elite Varsities +++' },
            { id: 'INDUSTRIAL_WORKFORCE', title: 'INDUSTRIAL WORKFORCE GIANT', desc: 'Prioritize polytech, vocational trades, engineering faculties, and factory skills.', focus: 'Technical +++, Vocational +++, Industry +++' },
            { id: 'TECHNOLOGY_NATION', title: 'TECHNOLOGY & AI NATION', desc: 'Heavy investment in computer science, software engineering, and digital networks.', focus: 'Cyber +++, AI +++, Digital Literacy +++' },
            { id: 'GLOBAL_ACADEMIC_HUB', title: 'GLOBAL ACADEMIC HUB', desc: 'Attract foreign scholars, international exchange, and foreign university alliances.', focus: 'Foreign Students +++, Soft Power +++' },
            { id: 'BALANCED_DEVELOPMENT', title: 'BALANCED DEVELOPMENT', desc: 'Harmonious national growth across primary, secondary, and tertiary sectors.', focus: 'Balanced Growth across all Metrics' },
            { id: 'MILITARY_SCIENTIFIC', title: 'MILITARY-SCIENTIFIC STATE', desc: 'Integration of defense R&D, officer academies, and dual-use aerospace technology.', focus: 'Defense R&D +++, Tactical Cyber +++' }
        ];

        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div>
                    <h3 style="margin:0; font-size:16px; color:#ffd700;">📜 NATIONAL EDUCATION DOCTRINE & POLICY DIRECTIVES</h3>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Set Strategic Alignment & Long-Term Civilization Trajectory</p>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap:12px;">
                    ${doctrines.map(doc => {
                        const isSelected = state.selectedDoctrine === doc.id;
                        return `
                            <div style="background:${isSelected ? 'rgba(0,229,255,0.15)' : 'rgba(30,41,59,0.7)'}; border:1.5px solid ${isSelected ? '#00e5ff' : 'rgba(255,255,255,0.1)'}; border-radius:10px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                                <div>
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <h4 style="margin:0; font-size:14px; color:${isSelected ? '#00e5ff' : '#f8fafc'};">${doc.title}</h4>
                                        ${isSelected ? '<span style="font-size:10px; background:#00e5ff; color:#0284c7; padding:2px 6px; border-radius:4px; font-weight:bold;">ACTIVE</span>' : ''}
                                    </div>
                                    <p style="margin:6px 0; font-size:11px; color:#cbd5e1; line-height:1.4;">${doc.desc}</p>
                                    <div style="font-size:10px; color:#ffd700; font-family:'Share Tech Mono',monospace;">${doc.focus}</div>
                                </div>

                                <button onclick="window.EducationEngine.selectDoctrine('${doc.id}')" style="background:${isSelected ? 'linear-gradient(135deg,#0284c7,#00e5ff)' : 'rgba(255,255,255,0.1)'}; border:none; color:white; padding:8px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">
                                    ${isSelected ? 'DOCTRINE ENACTED' : 'ADOPT THIS DOCTRINE'}
                                </button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // --- 7. DIPLOMACY VIEW ---
    function renderDiplomacyView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#00e5ff;">🌐 EDUCATION DIPLOMACY & SOFT POWER INFRASTRUCTURE</h3>
                        <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">International Academic Partnerships, Foreign Exchange, & Technological Alliances</p>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:12px;">
                    ${data.diplomaticAlliances.map(all => `
                        <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(0,229,255,0.25); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h4 style="margin:0; font-size:14px; color:#f8fafc;">${all.partner}</h4>
                                <span style="font-size:10px; background:rgba(16,185,129,0.2); color:#10b981; padding:2px 6px; border-radius:4px; font-weight:bold;">${all.status}</span>
                            </div>
                            <div style="font-size:12px; color:#38bdf8;">Program: <strong>${all.program}</strong></div>
                            <div style="display:flex; justify-content:space-between; font-size:10px; color:#cbd5e1;">
                                <span>Trust Rating: <strong style="color:#ffd700;">${all.trustLevel}%</strong></span>
                                <span>Disruption Risk: <strong style="color:#10b981;">${all.risk}</strong></span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- 8. INTELLIGENCE VIEW ---
    function renderIntelligenceView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div>
                    <h3 style="margin:0; font-size:16px; color:#ef4444;">🕵️ KNOWLEDGE INTELLIGENCE & TALENT THREAT MONITOR</h3>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Early-Warning Surveillance on Global Technological Gaps and Brain Drain Vulnerabilities</p>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${data.intelligenceAlerts.map(alert => `
                        <div style="background:rgba(30,41,59,0.7); border:1px solid ${alert.urgency === 'HIGH' ? '#ef4444' : (alert.urgency === 'MEDIUM' ? '#f59e0b' : '#38bdf8')}; border-radius:8px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                            <div>
                                <span style="font-size:10px; background:${alert.urgency === 'HIGH' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}; color:${alert.urgency === 'HIGH' ? '#ef4444' : '#f59e0b'}; padding:2px 6px; border-radius:4px; font-weight:bold;">${alert.type}</span>
                                <h4 style="margin:4px 0 2px 0; font-size:14px; color:#f8fafc;">${alert.title}</h4>
                                <div style="font-size:11px; color:#cbd5e1;">${alert.detail}</div>
                            </div>
                            <button onclick="window.EducationEngine.resolveAlert('${alert.title}')" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">
                                RESOLVE
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // --- 9. DEPENDENCIES VIEW ---
    function renderDependenciesView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div>
                    <h3 style="margin:0; font-size:16px; color:#00e5ff;">🔗 INTER-MINISTRY DEPENDENCY & CAPABILITY CEILING MATRIX</h3>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">How Education Caps or Boosts the Ceiling Potential of Every Other Sovereign Ministry</p>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                    <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#ef4444;">🛡️ DEFENSE & SECURITY</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">
                            • Engineering Talent: <strong style="color:#10b981;">+12%</strong><br>
                            • Military Researchers: <strong style="color:#10b981;">+8%</strong><br>
                            • Capability Ceiling: <strong style="color:#ffd700;">85% ORS Max</strong>
                        </div>
                    </div>
                    <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#10b981;">💼 INDUSTRY & COMMERCE</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">
                            • Factory Efficiency: <strong style="color:#10b981;">+18%</strong><br>
                            • Technical Workforce: <strong style="color:#10b981;">+24%</strong><br>
                            • Capability Ceiling: <strong style="color:#ffd700;">92% Output</strong>
                        </div>
                    </div>
                    <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#a855f7;">🏥 HEALTH & WELFARE</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">
                            • Medical R&D: <strong style="color:#10b981;">+15%</strong><br>
                            • Doctors & Surgeons: <strong style="color:#10b981;">+10%</strong><br>
                            • Capability Ceiling: <strong style="color:#ffd700;">88% System Cap</strong>
                        </div>
                    </div>
                    <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(234,179,8,0.3); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#eab308;">⚡ ENERGY & MINING</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">
                            • Power Grid Efficiency: <strong style="color:#10b981;">+11%</strong><br>
                            • Mining Tech: <strong style="color:#10b981;">+9%</strong><br>
                            • Capability Ceiling: <strong style="color:#ffd700;">80% Max Grid</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- 10. REPORT VIEW ---
    function renderReportView(data) {
        return `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div>
                    <h3 style="margin:0; font-size:16px; color:#10b981;">📊 NATIONAL POWER CONTRIBUTION & LONG-TERM PROJECTIONS</h3>
                    <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">5, 10, & 20 Year Forecasts of Sovereign Educational Investment</p>
                </div>

                <div style="background:rgba(30,41,59,0.8); border:1.5px solid #10b981; border-radius:10px; padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                    <div>
                        <div style="font-size:11px; color:#94a3b8;">TOTAL EDUCATION CONTRIBUTION TO NATIONAL POWER</div>
                        <div style="font-size:32px; font-weight:800; color:#10b981; font-family:'Share Tech Mono',monospace;">+62.1 <span style="font-size:14px; color:#cbd5e1;">PTS</span></div>
                    </div>
                    <div style="font-size:11px; color:#cbd5e1; line-height:1.6;">
                        • Human Capital: <strong style="color:#38bdf8;">+18.4</strong> | Scientific Capacity: <strong style="color:#a855f7;">+12.7</strong><br>
                        • Technology Pipeline: <strong style="color:#00e5ff;">+10.2</strong> | Industrial Skills: <strong style="color:#10b981;">+8.6</strong><br>
                        • Soft Power: <strong style="color:#f59e0b;">+6.8</strong> | Administrative Skill: <strong style="color:#cbd5e1;">+5.4</strong>
                    </div>
                </div>

                <!-- FORECAST CARDS -->
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                    <div style="background:rgba(30,41,59,0.6); border:1px solid rgba(0,229,255,0.2); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#00e5ff;">YEAR +5 FORECAST</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.5;">
                            • Human Capital: <strong>81/100</strong><br>
                            • Technology Growth: <strong style="color:#10b981;">+9%</strong><br>
                            • Industrial Output: <strong style="color:#10b981;">+6%</strong>
                        </div>
                    </div>
                    <div style="background:rgba(30,41,59,0.6); border:1px solid rgba(168,85,247,0.2); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#a855f7;">YEAR +10 FORECAST</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.5;">
                            • Scientific Capacity: <strong>76/100</strong><br>
                            • Innovation Pipeline: <strong style="color:#10b981;">+18%</strong><br>
                            • Patent Output: <strong style="color:#10b981;">+24%</strong>
                        </div>
                    </div>
                    <div style="background:rgba(30,41,59,0.6); border:1px solid rgba(245,158,11,0.2); border-radius:10px; padding:12px;">
                        <h4 style="margin:0 0 6px 0; color:#f59e0b;">YEAR +20 FORECAST</h4>
                        <div style="font-size:11px; color:#cbd5e1; line-height:1.5;">
                            • Technological Sovereignty: <strong>84%</strong><br>
                            • Global Academic Influence: <strong>67/100</strong><br>
                            • Crisis Recovery Speed: <strong style="color:#10b981;">6 Years (vs 12 Yrs Base)</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // 4. INTERACTION & ACTION HANDLERS
    // -------------------------------------------------------------------------
    function upgradeInstitution(instId) {
        const data = getCountryData(state.activeCountry);
        const inst = data.institutions.find(i => i.id === instId);
        if (inst) {
            if (inst.level >= 5) {
                if (window.showOmegaNotification) window.showOmegaNotification("MAX LEVEL", `🎓 ${inst.name} is already at Level 5 Max Capacity!`, "info");
                return;
            }
            inst.level += 1;
            inst.capacity = Math.round(inst.capacity * 1.25);
            inst.graduates = Math.round(inst.graduates * 1.25);
            inst.researchScore = Math.min(100, inst.researchScore + 5);
            data.nationalPowerScore = Math.min(100, data.nationalPowerScore + 1);
            if (window.showOmegaNotification) {
                window.showOmegaNotification("INSTITUTION UPGRADED", `⚡ ${inst.name} upgraded to Level ${inst.level}/5! Capacity expanded.`, "success");
            }
            switchSubView(state.activeSub);
        }
    }

    function specializeInstitution(instId) {
        const data = getCountryData(state.activeCountry);
        const inst = data.institutions.find(i => i.id === instId);
        if (inst) {
            const specs = ['AI & Cyber Hub', 'Medical Science Center', 'Military Tech Partner', 'Industrial & Robotics Trade', 'Quantum Frontiers'];
            const nextSpec = specs[(specs.indexOf(inst.spec) + 1) % specs.length];
            inst.spec = nextSpec;
            if (window.showOmegaNotification) {
                window.showOmegaNotification("SPECIALIZATION CHANGED", `🎯 ${inst.name} designated as ${nextSpec}!`, "success");
            }
            switchSubView(state.activeSub);
        }
    }

    function adjustResearchFunding(progId, amountB) {
        const data = getCountryData(state.activeCountry);
        const prog = data.researchPrograms.find(p => p.id === progId);
        if (prog) {
            prog.budget = parseFloat((prog.budget + amountB).toFixed(1));
            prog.progress = Math.min(100, prog.progress + 10);
            data.techIndependence = Math.min(100, data.techIndependence + 2);
            if (window.showOmegaNotification) {
                window.showOmegaNotification("R&D FUNDING INCREASED", `🔬 Allocated +$${amountB}B to ${prog.name}. Progress: ${prog.progress}%`, "success");
            }
            switchSubView(state.activeSub);
        }
    }

    function transferTech(progId) {
        const data = getCountryData(state.activeCountry);
        const prog = data.researchPrograms.find(p => p.id === progId);
        if (prog) {
            if (window.showOmegaNotification) {
                window.showOmegaNotification("TECHNOLOGY TRANSFERRED", `📲 R&D results from ${prog.name} deployed to ${prog.targetMinistry}! ${prog.impact}`, "success");
            }
        }
    }

    function triggerTalentAction(type) {
        const data = getCountryData(state.activeCountry);
        if (!data.talentIncentives) {
            data.talentIncentives = { grantsBoost: 0, housingBoost: 0, returneeBoost: 0, salaryBoost: 0, totalBoost: 0 };
        }

        if (type === 'grants') {
            data.talentIncentives.grantsBoost += 1.5;
            data.talentIncentives.totalBoost += 1.5;
            if (window.showOmegaNotification) {
                window.showOmegaNotification("RESEARCH GRANTS ENACTED", "💵 Allocated +$1.5B High-Pay Grants! R&D attraction boosted.", "success");
            }
        } else if (type === 'housing') {
            data.talentIncentives.housingBoost += 1;
            data.talentIncentives.totalBoost += 0.8;
            if (window.showOmegaNotification) {
                window.showOmegaNotification("HOUSING BENEFIT ENACTED", "🏠 Scientist Housing & Tenure Benefits deployed! Emigration reduced.", "success");
            }
        } else if (type === 'returnee') {
            data.talentIncentives.returneeBoost += 1;
            data.talentIncentives.totalBoost += 1.0;
            if (window.showOmegaNotification) {
                window.showOmegaNotification("RETURNEE SCHOLARSHIP ENACTED", "✈️ Overseas Returnee Fellowship active! Expat researchers returning.", "success");
            }
        } else if (type === 'salary') {
            data.talentIncentives.salaryBoost += 1;
            data.talentIncentives.totalBoost += 1.2;
            if (window.showOmegaNotification) {
                window.showOmegaNotification("STEM SALARY HIKE ENACTED", "📈 20% STEM Salary Increase authorized across all state institutes!", "success");
            }
        }

        calculateTalentMigration(data);
        switchSubView(state.activeSub);
    }

    function advanceProject(projId) {
        const data = getCountryData(state.activeCountry);
        const proj = data.megaProjects.find(p => p.id === projId);
        if (proj) {
            proj.progressPct = Math.min(100, proj.progressPct + 15);
            if (proj.progressPct === 100) proj.status = 'Completed';
            data.nationalPowerScore = Math.min(100, data.nationalPowerScore + 2);
            if (window.showOmegaNotification) {
                window.showOmegaNotification("MEGA PROJECT ADVANCED", `🚀 ${proj.name} progress: ${proj.progressPct}%!`, "success");
            }
            switchSubView(state.activeSub);
        }
    }

    function selectDoctrine(docId) {
        state.selectedDoctrine = docId;
        const data = getCountryData(state.activeCountry);
        data.nationalPowerScore = Math.min(100, data.nationalPowerScore + 3);
        if (window.showOmegaNotification) {
            window.showOmegaNotification("DOCTRINE ENACTED", `📜 Adopted ${docId.replace(/_/g, ' ')} Education Policy!`, "success");
        }
        switchSubView(state.activeSub);
    }

    function resolveAlert(title) {
        const data = getCountryData(state.activeCountry);
        data.intelligenceAlerts = data.intelligenceAlerts.filter(a => a.title !== title);
        if (window.showOmegaNotification) {
            window.showOmegaNotification("THREAT RESOLVED", `✅ Resolved intelligence issue: ${title}`, "success");
        }
        switchSubView(state.activeSub);
    }

    function openAddInstitutionModal() {
        const name = prompt("Enter New Institution Name (English):", "Sovereign AI Research Varsity");
        if (!name) return;
        const data = getCountryData(state.activeCountry);
        const newInst = {
            id: 'inst_' + Date.now(),
            name: name,
            type: 'Public University',
            capacity: 35000,
            graduates: 7000,
            spec: 'AI & Frontiers',
            level: 1,
            researchScore: 75,
            status: 'Active'
        };
        data.institutions.push(newInst);
        if (window.showOmegaNotification) window.showOmegaNotification("INSTITUTION ESTABLISHED", `🏛️ Built ${name}!`, "success");
        switchSubView('network');
    }

    // Public API
    return {
        renderDashboard,
        switchSubView,
        calculateTalentMigration,
        upgradeInstitution,
        specializeInstitution,
        adjustResearchFunding,
        transferTech,
        triggerTalentAction,
        advanceProject,
        selectDoctrine,
        resolveAlert,
        openAddInstitutionModal
    };
})();
