/**
 * 🏛️ OMEGA CABINET ENGINE - NATIONAL EXECUTIVE COUNCIL (ক্যাবিনেট সিদ্ধান্ত ইঞ্জিন)
 * Strategic Decision Orchestrator, Dynamic Ministerial Voting Engine, & Religions/Ideologies System
 */

// 1. TOP 10 WORLD RELIGIONS DATABASE
window.OmegaReligionsDatabase = [
    {
        id: 'islam',
        icon: '☪️',
        name: 'Islam',
        bnName: 'Islam (State Religion)',
        population: '24.9% Global (1.9 Billion)',
        type: 'Abrahamic Monotheism',
        tenets: 'Tawhid (Divine Unity), Sharia jurisprudence, Zakat social welfare, Sawm, & Hajj.',
        stateImpact: { moral: '+18%', welfare: '+15%', defenseMorale: '+12%', interestModel: 'Zero Sukuk Banking' },
        description: 'Islam is an Abrahamic monotheistic faith rooted in divine unity, social justice, and community welfare (Zakat). In state governance, it promotes interest-free economic ethics, strong moral cohesion, and sovereign alliance trust.'
    },
    {
        id: 'christianity',
        icon: '✝️',
        name: 'Christianity',
        bnName: 'Christianity (State Religion)',
        population: '31.1% Global (2.4 Billion)',
        type: 'Abrahamic Monotheism',
        tenets: 'Holy Trinity, Gospel charity, institutional education, civic grace, & human dignity.',
        stateImpact: { moral: '+15%', charity: '+18%', diplomacy: '+12%', education: '+10%' },
        description: 'Christianity is a major Abrahamic religion centered on the life and teachings of Jesus Christ. It plays a foundational role in institutional healthcare, global humanitarian networks, and Western civil law traditions.'
    },
    {
        id: 'hinduism',
        icon: '🕉️',
        name: 'Hinduism',
        bnName: 'Hinduism (Sanatana Dharma)',
        population: '15.2% Global (1.2 Billion)',
        type: 'Vedic / Sanatana Dharma',
        tenets: 'Dharma, Karma, Ahimsa, spiritual pluralism, & agrarian cultural heritage.',
        stateImpact: { moral: '+16%', culturalHeritage: '+20%', agrarianResilience: '+12%', unity: '+10%' },
        description: 'Hinduism is an ancient Indian dharma encompassing diverse philosophical traditions, Karma ethics, spiritual discipline, and vibrant cultural heritage deeply linked with agricultural cycles.'
    },
    {
        id: 'buddhism',
        icon: '☸️',
        name: 'Buddhism',
        bnName: 'Buddhism (Dharmic Path)',
        population: '6.6% Global (520 Million)',
        type: 'Dharmic Tradition',
        tenets: 'Four Noble Truths, Eightfold Path, Ahimsa (Non-violence), mindfulness, & peace diplomacy.',
        stateImpact: { internalPeace: '+22%', crimeReduction: '-18%', peaceDiplomacy: '+15%', harmony: '+14%' },
        description: 'Buddhism was founded by Siddhartha Gautama (The Buddha). It advocates non-violence, mindfulness, compassionate social governance, and diplomatic neutrality in international relations.'
    },
    {
        id: 'judaism',
        icon: '✡️',
        name: 'Judaism',
        bnName: 'Judaism (Torah Faith)',
        population: '0.2% Global (15 Million)',
        type: 'Abrahamic Monotheism',
        tenets: 'Torah jurisprudence, Covenant ethics, Talmudic debate, & financial/tech innovation.',
        stateImpact: { financeMarket: '+20%', techInnovation: '+18%', cyberSecurity: '+15%', scholarship: '+14%' },
        description: 'Judaism is the ancient monotheistic faith of the Jewish people. It emphasizes rigorous legal debate, covenant ethics, high scholastic achievement, and cutting-edge tech and financial innovation.'
    },
    {
        id: 'sikhism',
        icon: 'ੴ',
        name: 'Sikhism',
        bnName: 'Sikhism (Khalsa Order)',
        population: '0.4% Global (30 Million)',
        type: 'Monotheistic Dharmic Faith',
        tenets: 'Ik Onkar (One God), Seva (Selfless service), Kirat Karo (Honest labor), & Khalsa honor.',
        stateImpact: { militaryMorale: '+18%', agrarianProduction: '+16%', disasterRelief: '+15%', equality: '+12%' },
        description: 'Sikhism was founded by Guru Nanak in Punjab. It preaches divine oneness, universal equality, free community kitchens (Langar), and courageous military honor.'
    },
    {
        id: 'bahai',
        icon: '☸️',
        name: 'Bahá\'í Faith',
        bnName: 'Bahá\'í Faith (Universalism)',
        population: '0.1% Global (8 Million)',
        type: 'Universalist Faith',
        tenets: 'Oneness of humanity, gender equality, scientific harmony, & world peace governance.',
        stateImpact: { globalPeaceSynergy: '+18%', scientificAccess: '+15%', genderEquality: '+14%', diplomacy: '+12%' },
        description: 'The Bahá\'í Faith emphasizes the spiritual unity of all humankind, the harmony between science and religion, and world peace institutions.'
    },
    {
        id: 'shinto',
        icon: '⛩️',
        name: 'Shinto',
        bnName: 'Shinto (Kami Reverence)',
        population: '0.1% Global (Indigenous Japanese)',
        type: 'Nature Animism',
        tenets: 'Kami (nature spirits), ritual purity, ancestral reverence, & industrial discipline.',
        stateImpact: { ecoConservation: '+22%', industrialDiscipline: '+16%', nationalPride: '+14%', purity: '+10%' },
        description: 'Shinto is the ethnic religion of Japan focusing on ritual purity, connection with nature spirits (Kami), and meticulous industrial discipline.'
    },
    {
        id: 'taoism',
        icon: '☯️',
        name: 'Taoism',
        bnName: 'Taoism (Harmony with Tao)',
        population: '0.2% Global (12 Million)',
        type: 'Philosophical & Spiritual Tradition',
        tenets: 'The Tao (Way), Wu Wei (Effortless action), Yin-Yang balance, & natural harmony.',
        stateImpact: { ecoBalance: '+20%', publicHealth: '+15%', adminFriction: '-14%', longevity: '+12%' },
        description: 'Taoism is an ancient Chinese philosophy and religion emphasizing living in harmony with nature, non-coercive governance, and physical/spiritual balance.'
    },
    {
        id: 'secularism',
        icon: '⚛️',
        name: 'Secularism & Rationalism',
        bnName: 'Secularism & Secular Humanism',
        population: '16.0% Global (1.2 Billion)',
        type: 'Rationalist / Non-Religious Worldview',
        tenets: 'Empirical science, separation of church and state, humanism, & technological progress.',
        stateImpact: { techInnovation: '+25%', civilLiberties: '+18%', industrialAutomation: '+16%', scientificResearch: '+22%' },
        description: 'Secularism and Humanist Rationalism advocate state neutrality in religious matters, prioritizing empirical science, individual rights, and technology-driven development.'
    }
];

// 2. TOP 10 POLITICAL IDEOLOGIES DATABASE (WITH MERITS, DEMERITS & SPECIAL CASES)
window.OmegaIdeologiesDatabase = [
    {
        id: 'dictatorship',
        icon: '👑⚡',
        name: 'Autocracy & Dictatorship',
        bnName: 'Supreme Executive Autocracy',
        spectrum: 'Far Right / Absolute Executive Command',
        tenets: 'Unchallenged central command, zero parliamentary delays, rapid decree mobilization, & pure sovereign authority.',
        merits: [
            'Instantaneous decision making without legislative filibusters',
            '100% immediate mobilization of national resources in emergency or war',
            'Complete elimination of electoral paralysis and bureaucratic inertia',
            'Unbroken execution of long-term 10-year sovereign megaprojects'
        ],
        demerits: [
            'High vulnerability if central command makes strategic errors',
            'Strict state oversight on political opposition and press',
            'Risk of foreign diplomatic sanctions from global powers'
        ],
        stateImpact: { executiveSpeed: '+40%', regimeStability: '+35%', civilFreedom: '-30%', legislativeDelay: '0%' },
        description: 'Supreme executive autocracy concentrates state authority into a unified command core, enabling instantaneous decree execution without parliamentary delays.'
    },
    {
        id: 'islamic_state',
        icon: '🕌',
        name: 'Islamic Governance & Sharia',
        bnName: 'Islamic Sovereign Governance',
        spectrum: 'Sovereign Divine Justice & Equity',
        tenets: 'Shura consultative council, Sukuk zero-interest financial architecture, Zakat social safety net, & moral justice.',
        merits: [
            'Zero-interest asset-backed economy preventing inflation bubbles',
            'Mandatory Zakat safety nets guaranteeing universal basic welfare',
            'High moral accountability through expert Shura advisory council',
            'Strong social cohesion and crime deterrence'
        ],
        demerits: [
            'Requires specialized diplomatic strategy to align with western interest-based financial systems',
            'External media scrutiny regarding sovereign financial models'
        ],
        stateImpact: { moralStability: '+30%', zeroInterestSukuk: 'Active', OICTrust: '+25%', socialSafetyNet: '+22%' },
        description: 'Islamic governance establishes economic equity through Sukuk zero-interest banking, Zakat welfare systems, and Shura council consultative decision-making.'
    },
    {
        id: 'democracy',
        icon: '🏛️',
        name: 'Constitutional Democracy',
        bnName: 'Constitutional Multi-Party Democracy',
        spectrum: 'Center / Multi-Party Civil Rights',
        tenets: 'Free multi-party elections, separation of powers, independent judiciary, & human rights protections.',
        merits: [
            'Democratic election cycles ensuring peaceful leadership transitions',
            'Protected civil liberties, freedom of expression, and independent courts',
            'High foreign investor confidence and international alliance trust'
        ],
        demerits: [
            'Electoral friction can disrupt long-term state planning',
            'Legislative debates delay rapid emergency decree enforcement'
        ],
        stateImpact: { civilFreedom: '+22%', investmentTrust: '+16%', legislativeAccountability: '+15%' },
        description: 'Constitutional democracy distributes power across independent branches of government, protecting individual rights and multi-party representation.'
    },
    {
        id: 'socialism',
        icon: '☭',
        name: 'Democratic Socialism & Communism',
        bnName: 'State Socialism & Collective Economy',
        spectrum: 'Far Left / Collective Economy',
        tenets: 'State ownership of heavy industries, universal healthcare & education, & worker council governance.',
        merits: [
            'Elimination of wealth inequality and universal free public healthcare and education',
            'State-directed industrialization and public infrastructure control'
        ],
        demerits: [
            'Restricted private free-market competition and capital flow',
            'Risk of bureaucratic centralization slowing private innovation'
        ],
        stateImpact: { incomeEquality: '+30%', stateInfraControl: '+22%', privateMarketSpeculation: '-20%' },
        description: 'Socialism prioritizes state-directed economic planning, worker welfare protection, and public ownership of national strategic industries.'
    },
    {
        id: 'nationalism',
        icon: '🦅',
        name: 'Sovereign Nationalism & Conservatism',
        bnName: 'Sovereign Protectionist Nationalism',
        spectrum: 'Right-Wing Sovereign Autonomy',
        tenets: 'Strong military defense, border enforcement, domestic industry protection tariffs, & patriotic unity.',
        merits: [
            'High national unity, territorial defense readiness, and domestic manufacturing growth',
            'Strict border security and defense against external interference'
        ],
        demerits: [
            'Tariff barriers may create trade tension with global export partners',
            'Reluctance to join supranational regional blocks'
        ],
        stateImpact: { borderSecurity: '+25%', militaryReadiness: '+20%', localIndustryProtection: '+16%' },
        description: 'Sovereign nationalism protects domestic industries, border security, national defense readiness, and patriotic economic self-reliance.'
    },
    {
        id: 'technocracy',
        icon: '🔬',
        name: 'Technocracy & Data Meritocracy',
        bnName: 'Technocratic Expert Governance',
        spectrum: 'Post-Political Empirical Governance',
        tenets: 'AI administrative automation, expert minister selection, & scientific data analytics.',
        merits: [
            'Empirical data-driven decision making free from partisan bias',
            'Maximum administrative efficiency and corruption reduction'
        ],
        demerits: [
            'Algorithms and data models may lack human emotional nuances',
            'Centralization of power among technocrats and engineers'
        ],
        stateImpact: { adminEfficiency: '+30%', techInnovation: '+25%', corruptionReduction: '-22%' },
        description: 'Technocracy appoints subject matter experts, scientists, and engineers to govern using scientific data, automated systems, and empirical analytics.'
    },
    {
        id: 'capitalism',
        icon: '🪙',
        name: 'Free-Market Capitalism',
        bnName: 'Free-Market Enterprise Capitalism',
        spectrum: 'Center-Right Free Enterprise',
        tenets: 'Low corporate taxation, deregulation, private enterprise, & global capital flow.',
        merits: [
            'Rapid GDP growth, foreign capital inflows, and market expansion',
            'High private sector competition fostering cutting-edge innovation'
        ],
        demerits: [
            'Widening wealth disparity without strong progressive taxation',
            'Risk of underfunded public social safety networks'
        ],
        stateImpact: { GDPGrowth: '+26%', foreignInvestment: '+22%', exportCompetitiveness: '+18%' },
        description: 'Free-market capitalism empowers private enterprise, capital flow, deregulation, and competitive open market dynamics.'
    },
    {
        id: 'social_democracy',
        icon: '🌹',
        name: 'Social Democracy & Welfare State',
        bnName: 'Nordic Social Democracy',
        spectrum: 'Center-Left Welfare Capitalism',
        tenets: 'Nordic welfare model, strong labor unions, public health, & green energy subsidies.',
        merits: [
            'High human capital index and universal free healthcare/education',
            'Strong legal worker protections balancing private market vitality'
        ],
        demerits: [
            'High income tax rates required to fund universal social programs',
            'Substantial recurring budget commitments for public welfare'
        ],
        stateImpact: { humanCapitalIndex: '+22%', publicHealthQuality: '+20%', laborSatisfaction: '+16%' },
        description: 'Social democracy combines free-market economic engine with robust state-funded social safety nets, labor rights, and public healthcare.'
    },
    {
        id: 'monarchy',
        icon: '👑',
        name: 'Constitutional / Royal Monarchy',
        bnName: 'Dynastic Royal Sovereign',
        spectrum: 'Traditional Royal Sovereign',
        tenets: 'Centralized royal executive leadership, dynastic stability, & sovereign wealth funds.',
        merits: [
            'Unbroken multi-decade vision execution across generational timelines',
            'Shielded from electoral volatility and partisan division'
        ],
        demerits: [
            'No direct public election for supreme executive head of state',
            'Requires strict institutional oversight of royal expenditure'
        ],
        stateImpact: { regimeStability: '+28%', zeroElectoralDistraction: 'Active', wealthFundGrowth: '+18%' },
        description: 'Royal monarchy provides sovereign dynastic stability, long-term capital preservation, and unified executive continuity.'
    },
    {
        id: 'anarcho_capitalism',
        icon: '🗽',
        name: 'Anarcho-Capitalism & Libertarianism',
        bnName: 'Radical Market Libertarianism',
        spectrum: 'Radical Free Market Individualism',
        tenets: 'Abolition of state regulation, private contract courts, zero capital controls, & voluntarism.',
        merits: [
            'Unrestricted trade freedom and zero capital controls',
            'Absolute private property protection and low tax burden'
        ],
        demerits: [
            'কেন্দ্রীয় প্রতিরক্ষাবাহিনী বা পুলিশ ব্যবস্থা দুর্বল হওয়ার ঝুঁকি',
            'জনকল্যাণমূলক রাষ্ট্রীয় খাতের অনুপস্থিতি'
        ],
        stateImpact: { privateBusinessFreedom: '+35%', zeroCapitalControls: 'Active', stateTaxRevenue: '-25%' },
        description: 'রাষ্ট্রীয় যেকোনো কর্তৃত্ব বা কর আরোপ বর্জন করে শতভাগ ব্যক্তিগত চুক্তি ও বাজার ব্যবস্থার প্রবক্তা।'
    }
];

// 3. PRESET 80 DYNAMIC POLICY PROPOSAL SCENARIOS DATABASE
window.OmegaPresetMotionsDatabase = [
    // 🛡️ DEFENSE & MILITARY (8)
    { id: 'DEFENSE_500M', name: 'প্রতিরক্ষা খাতে ৫০০ কোটি ডলার বরাদ্দ ($500M Procurement)', amount: 500, ministry: 'defense', category: 'Defense' },
    { id: 'DEFENSE_2B', name: 'বায়ুসেনা ফাইটার জেট আধুনিকায়ন ($2.0B Air Force Modernization)', amount: 2000, ministry: 'defense', category: 'Defense' },
    { id: 'NAVY_FRIGATE_1B', name: 'নৌবাহিনী সাবমেরিন ও ফ্রিগেট বহর ($1.0B Submarine Fleet)', amount: 1000, ministry: 'defense', category: 'Defense' },
    { id: 'BORDER_FENCE_800M', name: 'সীমান্তে স্বয়ংক্রিয় স্মার্ট প্রাচীর নির্মাণ ($800M Border Wall)', amount: 800, ministry: 'interior_security', category: 'Defense' },
    { id: 'CYBER_COMMAND_400M', name: 'সামরিক সাইবার নিরাপত্তা কমান্ড প্রতিষ্ঠা ($400M Cyber Shield)', amount: 400, ministry: 'intelligence_cyber', category: 'Defense' },
    { id: 'ARMY_SALARY_300M', name: 'সেনাসদস্যদের আবাসন ও বেতন বৃদ্ধি ($300M Army Housing)', amount: 300, ministry: 'defense', category: 'Defense' },
    { id: 'DRONE_SWARM_600M', name: 'স্বয়ংক্রিয় ড্রোন অ্যাটাক ডিভিশন তৈরি ($600M Strike Drone Fleet)', amount: 600, ministry: 'defense', category: 'Defense' },
    { id: 'AIR_DEFENSE_1_5B', name: 'কৌশলগত এসএএম এয়ার ডিফেন্স মিসাইল শীল্ড ($1.5B SAM Shield)', amount: 1500, ministry: 'defense', category: 'Defense' },

    // 💰 ECONOMY & FINANCE (8)
    { id: 'TAX_SLASH_15', name: 'করপোরেট ট্যাক্স ১৫% হ্রাস আন্দোলন (15% Corporate Tax Cut)', amount: 1200, ministry: 'taxes', category: 'Economy' },
    { id: 'VAT_INCREASE_5', name: 'খুচরা ভ্যাট ৫% বৃদ্ধি অধ্যাদেশ (5% VAT Hike for Treasury)', amount: 800, ministry: 'treasury_finance', category: 'Economy' },
    { id: 'CENTRAL_BANK_RATE_CUT', name: 'সুদের হার ১.৫% কমিয়ে ব্যাংক ঋণ সহজ করা (1.5% Rate Cut)', amount: 600, ministry: 'central_bank', category: 'Economy' },
    { id: 'SUKUK_BONDS_3B', name: '৩ বিলিয়ন ডলার ইসলামিক সুকুক বন্ড প্রকাশ ($3.0B Sukuk Issue)', amount: 3000, ministry: 'treasury_finance', category: 'Economy' },
    { id: 'EXPORT_SUBSIDY_600M', name: 'রপ্তানিমুখী তৈরি পোশাক ও শিল্পে নগদ প্রণোদনা ($600M Export Cash)', amount: 600, ministry: 'trade', category: 'Economy' },
    { id: 'BANK_BAILOUT_1B', name: 'বাণিজ্যিক ব্যাংকগুলোর জন্য ১ বিলিয়ন ডলার উদ্ধার ফান্ড ($1.0B Bailout)', amount: 1000, ministry: 'central_bank', category: 'Economy' },
    { id: 'SMALL_BUSINESS_500M', name: 'ক্ষুদ্র ও মাঝারি শিল্পে জামানতবিহীন ঋণ প্রদান ($500M SME Grants)', amount: 500, ministry: 'trade', category: 'Economy' },
    { id: 'SOVEREIGN_WEALTH_2B', name: 'সার্বভৌম ধন তহবিলে ২ বিলিয়ন ডলার অতিরিক্ত জমা ($2.0B Wealth Fund)', amount: 2000, ministry: 'treasury_finance', category: 'Economy' },

    // 🏥 HEALTHCARE & WELFARE (8)
    { id: 'UNIVERSAL_HEALTH_2B', name: 'সার্বজনীন রাষ্ট্রীয় বিনামূল্যে চিকিৎসা সেবা ($2.0B Universal Health)', amount: 2000, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'MEDICINE_SUBSIDY_400M', name: 'জীবনরক্ষাকারী ওষুধে শতভাগ সাবসিডি ($400M Medicine Subsidy)', amount: 400, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'CANCER_RESEARCH_300M', name: 'জাতীয় ক্যান্সার ও ভ্যাকসিন গবেষণা ইনস্টিটিউট ($300M Research)', amount: 300, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'RURAL_CLINIC_500M', name: 'গ্রামাঞ্চলে ৫,০০০ ডিজিটাল স্বাস্থ্য ক্লিনিক ($500M Rural Health)', amount: 500, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'PENSION_INCREASE_800M', name: 'বয়স্ক ও সামাজিক ভাতা দ্বিগুণকরণ ($800M Senior Pension)', amount: 800, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'EMERGENCY_AMBULANCE_200M', name: 'জরুরি এয়ার-অ্যাম্বুলেন্স বহর কেনা ($200M Air Ambulance)', amount: 200, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'MATERNAL_CARE_350M', name: 'মাতৃত্বকালীন নিউট্রিশন ও শিশু পুষ্টি ভাতা ($350M Child Welfare)', amount: 350, ministry: 'health_welfare', category: 'Healthcare' },
    { id: 'PANDEMIC_SHIELD_1B', name: 'মহামারী ও বায়োলজিক্যাল জাতীয় ডিফেন্স গ্রেড ($1.0B Bio Shield)', amount: 1000, ministry: 'health_welfare', category: 'Healthcare' },

    // 🎓 EDUCATION & STEM RESEARCH (8)
    { id: 'STEM_UNIVERSITY_1B', name: '১০টি এআই ও রোবোটিক্স বিশ্ববিদ্যালয় নির্মাণ ($1.0B Tech Varsities)', amount: 1000, ministry: 'education', category: 'Education' },
    { id: 'TEACHER_SALARY_600M', name: 'প্রাথমিক ও মাধ্যমিক শিক্ষকদের বেতন ৫০% বৃদ্ধি ($600M Pay Hike)', amount: 600, ministry: 'education', category: 'Education' },
    { id: 'DIGITAL_TABLETS_400M', name: 'সকল শিক্ষার্থীর জন্য বিনামূল্যে ডিজিটাল ল্যাপটপ ($400M Laptops)', amount: 400, ministry: 'education', category: 'Education' },
    { id: 'SCHOLARSHIP_FUND_300M', name: 'উচ্চশিক্ষায় বিদেশে ১০,০০০ পূর্ণাঙ্গ স্কলারশিপ ($300M Scholarships)', amount: 300, ministry: 'education', category: 'Education' },
    { id: 'PRIMARY_SCHOOL_500M', name: 'স্মার্ট ক্লাসরুম ও আধুনিক ভবন নির্মাণ ($500M Smart Schools)', amount: 500, ministry: 'education', category: 'Education' },
    { id: 'VOCATIONAL_TRAINING_350M', name: 'কারিগরি ও ভোকেশনাল ট্রেনিং ইনস্টিটিউট ($350M Vocational Trade)', amount: 350, ministry: 'education', category: 'Education' },
    { id: 'FREE_MEALS_250M', name: 'স্কুল শিক্ষার্থীদের পুষ্টিকর মিড-ডে মিল প্রদান ($250M Free Lunch)', amount: 250, ministry: 'education', category: 'Education' },
    { id: 'SCIENCE_LABS_200M', name: 'বিদ্যালয়ে আন্তর্জাতিক মানের বায়োটেক ল্যাব ($200M Science Labs)', amount: 200, ministry: 'science_research', category: 'Education' },

    // 🏗️ INFRASTRUCTURE & LOGISTICS (8)
    { id: 'HIGHWAY_GRID_3B', name: '৮ লেনের দ্রুতগতির জাতীয় এক্সপ্রেসওয়ে নেটওয়ার্ক ($3.0B Expressway)', amount: 3000, ministry: 'infrastructure', category: 'Infrastructure' },
    { id: 'DEEP_SEA_PORT_4B', name: 'গভীর সমুদ্র বন্দর টার্মিনাল নির্মাণ ($4.0B Deep Sea Port)', amount: 4000, ministry: 'mega_projects', category: 'Infrastructure' },
    { id: 'METRO_RAIL_2_5B', name: 'রাজধানীতে পূর্ণাঙ্গ ইলেকট্রিক মেট্রোরেল লাইন ($2.5B Metro Rail)', amount: 2500, ministry: 'infrastructure', category: 'Infrastructure' },
    { id: 'AIRPORT_EXPANSION_1_8B', name: 'আন্তর্জাতিক বিমানবন্দর টার্মিনাল ৩ বিস্তার ($1.8B Airport T3)', amount: 1800, ministry: 'mega_projects', category: 'Infrastructure' },
    { id: 'BRIDGE_MEGAPROJECT_2B', name: 'প্রধান নদীর উপর চার লেনের রেল-সেতু ($2.0B Mega Bridge)', amount: 2000, ministry: 'mega_projects', category: 'Infrastructure' },
    { id: 'SMART_GRID_1_2B', name: 'জাতীয় বিদ্যুৎ সঞ্চালন স্মার্ট গ্রিড তৈরি ($1.2B Power Grid)', amount: 1200, ministry: 'energy_mining', category: 'Infrastructure' },
    { id: 'WATER_PURIFICATION_800M', name: 'শহরাঞ্চলে শতভাগ বিশুদ্ধ পানির পাইপলাইন ($800M Clean Water)', amount: 800, ministry: 'infrastructure', category: 'Infrastructure' },
    { id: 'HOUSING_SCHEME_1B', name: 'নিম্নআয়ের নাগরিকদের জন্য ১০,০০০ ফ্লাট ($1.0B Worker Housing)', amount: 1000, ministry: 'infrastructure', category: 'Infrastructure' },

    // 🌾 AGRICULTURE & FOOD SECURITY (8)
    { id: 'FERTILIZER_SUBSIDY_700M', name: 'কৃষকদের ইউরিয়া ও ডিএপি সারে ৭০% ভর্তুকি ($700M Fertilizer)', amount: 700, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'IRRIGATION_CANAL_500M', name: 'সোলার চালিত স্বয়ংক্রিয় সেচ খাল প্রকল্প ($500M Solar Canal)', amount: 500, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'GRAIN_SILO_400M', name: '১০ লাখ টন ধারণক্ষমতার আধুনিক শস্য সংরক্ষণাগার ($400M Grain Silos)', amount: 400, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'LIVESTOCK_VACCINE_200M', name: 'গবাদিপশু ও পোল্ট্রি খামারিদের বিনামূল্যে ভ্যাকসিন ($200M Livestock)', amount: 200, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'GREENHOUSE_TECH_300M', name: 'হাইড্রোপনিক ও সুনির্দিষ্ট কৃষি প্রযুক্তি অনুদান ($300M Hydroponics)', amount: 300, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'FISHERIES_MONITORING_150M', name: 'সামুদ্রিক মৎস্য টহল বহর ও স্যাটেলাইট ট্র্যাকিং ($150M Sea Patrol)', amount: 150, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'COLD_STORAGE_GRID_450M', name: 'উপজেলা পর্যায়ে সোলার কোল্ড স্টোরেজ নেটওয়ার্ক ($450M Cold Chain)', amount: 450, ministry: 'agriculture_food', category: 'Agriculture' },
    { id: 'SEED_BANK_250M', name: 'জাতীয় জলবায়ু-সহনশীল বীজ ব্যাংক ও ল্যাব ($250M Bio Seed Bank)', amount: 250, ministry: 'agriculture_food', category: 'Agriculture' },

    // ⚡ ENERGY & ENVIRONMENT (8)
    { id: 'NUCLEAR_PLANT_5B', name: '২৪০০ মেগাওয়াট পরমাণু বিদ্যুৎ কেন্দ্র ($5.0B Nuclear Power)', amount: 5000, ministry: 'energy_mining', category: 'Energy' },
    { id: 'SOLAR_PARK_1_2B', name: '১০০০ মেগাওয়াট সোলার গ্রিড পার্ট ($1.2B Solar Park)', amount: 1200, ministry: 'energy_mining', category: 'Energy' },
    { id: 'WIND_FARM_800M', name: 'উপকূলীয় বায়ু বিদ্যুৎ টারবাইন প্রকল্প ($800M Offshore Wind)', amount: 800, ministry: 'energy_mining', category: 'Energy' },
    { id: 'HYDRO_DAM_2B', name: 'জলবিদ্যুৎ কেন্দ্র ও ড্যাম তৈরি ($2.0B Hydroelectric Dam)', amount: 2000, ministry: 'energy_mining', category: 'Energy' },
    { id: 'REFORESTATION_300M', name: 'উপকূলজুড়ে সবুজ সুন্দরবন বনায়ন প্রজেক্ট ($300M Forest Shield)', amount: 300, ministry: 'agriculture_food', category: 'Energy' },
    { id: 'WASTE_TO_ENERGY_400M', name: 'ময়লা আবর্জনা থেকে বিদ্যুৎ উৎপাদন প্লান্ট ($400M Trash-to-Power)', amount: 400, ministry: 'energy_mining', category: 'Energy' },
    { id: 'LITHIUM_MINING_1_5B', name: 'লিথিয়াম ও রেয়ার আর্থ মেটাল খনি খনন ($1.5B Lithium Mining)', amount: 1500, ministry: 'energy_mining', category: 'Energy' },
    { id: 'OIL_REFINERY_2B', name: 'রাষ্ট্রীয় অপরিশোধিত খনিজ তেল শোধনাগার ($2.0B Oil Refinery)', amount: 2000, ministry: 'energy_mining', category: 'Energy' },

    // ⚖️ SECURITY & LAW ENFORCEMENT (8)
    { id: 'POLICE_MODERN_400M', name: 'পুলিশের নাইট-ভিশন ও বডি-ক্যাম সরবরাহ ($400M Modern Police)', amount: 400, ministry: 'interior_security', category: 'Security' },
    { id: 'JUDICIAL_DIGITAL_200M', name: 'আদালতের ভার্চুয়াল বিচার ও এআই ট্র্যাকিং ($200M e-Courts)', amount: 200, ministry: 'laws', category: 'Security' },
    { id: 'PRISON_REFORM_150M', name: 'কারাগার সংস্কার ও সংশোধনমূলক কর্মশালা ($150M Prison Reform)', amount: 150, ministry: 'interior_security', category: 'Security' },
    { id: 'INTELLIGENCE_SATELLITE_600M', name: 'কাউন্টার টেররিজম ও গোয়েন্দা নজরদারি ($600M High Intel)', amount: 600, ministry: 'intelligence_cyber', category: 'Security' },
    { id: 'CITIZEN_ID_BIOMETRIC_350M', name: 'বায়োমেট্রিক স্মার্ট ই-পাসপোর্ট ও নাগরিক আইডি ($350M e-ID)', amount: 350, ministry: 'interior_security', category: 'Security' },
    { id: 'ANTI_CORRUPTION_AGENCY_200M', name: 'স্বাধীন দুর্নীতি দমন কমিশন শক্তিশালীকরণ ($200M Anti-Corruption)', amount: 200, ministry: 'laws', category: 'Security' },
    { id: 'DISASTER_RESPONSE_300M', name: 'জরুরি জাতীয় দুর্যোগ প্রতিক্রিয়া বহর ($300M Rescue Grid)', amount: 300, ministry: 'interior_security', category: 'Security' },
    { id: 'COAST_GUARD_450M', name: 'উপকূল রক্ষা ও চোরাচালান বিরোধী স্পিডবোট বহর ($450M Coast Guard)', amount: 450, ministry: 'interior_security', category: 'Security' },

    // 🕊️ FOREIGN DIPLOMACY & ALLIANCES (8)
    { id: 'FOREIGN_EMBASSY_300M', name: 'নতুন ১৫টি দেশে অর্থনৈতিক দূতাবাস স্থাপন ($300M Embassies)', amount: 300, ministry: 'foreign_affairs', category: 'Diplomacy' },
    { id: 'UN_PEACEKEEPING_250M', name: 'জাতিসংঘ শান্তিরক্ষা মিশনে নতুন ব্যাটালিয়ন ($250M UN Mission)', amount: 250, ministry: 'foreign_affairs', category: 'Diplomacy' },
    { id: 'TOURISM_PROMOTION_150M', name: 'আন্তর্জাতিক গণমাধ্যমে দেশের ট্যুরিজম ব্র্যান্ডিং ($150M Tourism)', amount: 150, ministry: 'trade', category: 'Diplomacy' },
    { id: 'REGIONAL_ALLIANCE_500M', name: 'আঞ্চলিক মুক্ত বাণিজ্য চুক্তি সম্প্রসারণ ফান্ড ($500M Trade Pact)', amount: 500, ministry: 'foreign_affairs', category: 'Diplomacy' },
    { id: 'EXPAT_WELFARE_200M', name: 'প্রবাসী শ্রমিকদের জন্য স্মার্ট সহায়তা হাব ($200M Expat Hub)', amount: 200, ministry: 'foreign_affairs', category: 'Diplomacy' },
    { id: 'DISASTER_AID_100M', name: 'মিত্র রাষ্ট্রসমূহে রাষ্ট্রীয় ত্রাণ পৌঁছানো ($100M Foreign Aid)', amount: 100, ministry: 'foreign_affairs', category: 'Diplomacy' },
    { id: 'INTEL_SHARING_PRACT_350M', name: 'আন্তর্জাতিক কাউন্টার-টেররিজম জোট গঠন ($350M Global Intel)', amount: 350, ministry: 'intelligence_cyber', category: 'Diplomacy' },
    { id: 'CULTURAL_DIPLOMACY_120M', name: 'বিশ্বব্যাপী ভাষা ও সাংস্কৃতিক কেন্দ্র প্রতিষ্ঠা ($120M Culture Hub)', amount: 120, ministry: 'foreign_affairs', category: 'Diplomacy' },

    // 🔬 SPACE, QUANTUM & CYBER HIGH TECH (8)
    { id: 'SPACE_SATELLITE_LAUNCH_800M', name: 'স্বদেশী মহাকাশ রকেট ও যোগাযোগ স্যাটেলাইট ($800M Space Rocket)', amount: 800, ministry: 'science_research', category: 'Cyber' },
    { id: 'QUANTUM_COMPUTING_600M', name: 'জাতীয় কোয়ান্টাম কম্পিউটার গবেষণা ইনস্টিটিউট ($600M Quantum Labs)', amount: 600, ministry: 'science_research', category: 'Cyber' },
    { id: 'SEMICONDUCTOR_FAB_2B', name: 'মাইক্রোচিপ ও সেমিকন্ডাক্টর কারখানা স্থাপন ($2.0B Semiconductor Fab)', amount: 2000, ministry: 'production', category: 'Cyber' },
    { id: 'AI_DATA_CENTER_1B', name: 'রাষ্ট্রীয় হাই-স্পিড এআই সুপারকম্পিউটিং ডেটা সেন্টার ($1.0B AI Center)', amount: 1000, ministry: 'science_research', category: 'Cyber' },
    { id: 'CYBER_SECURITY_GRID_500M', name: 'জাতীয় ব্যাংক ও পাওয়ার গ্রিড সাইবার প্রটেকশন ($500M Cyber Shield)', amount: 500, ministry: 'intelligence_cyber', category: 'Cyber' },
    { id: 'BIOTECH_GENOME_350M', name: 'জাতীয় জিনোম ও ওষুধ শিল্প গবেষণা কেন্দ্র ($350M Biotech Genome)', amount: 350, ministry: 'science_research', category: 'Cyber' },
    { id: 'AUTOMATED_ROBOTICS_750M', name: 'কারখানায় রোবোটিক অ্যাসেম্বলি লাইন সাবসিডি ($750M Industry 4.0)', amount: 750, ministry: 'production', category: 'Cyber' },
    { id: 'SMART_CITIZEN_CLOUD_300M', name: 'একক জাতীয় নাগরিক ক্লাউড সার্ভিস রূপান্তর ($300M Govt Cloud)', amount: 300, ministry: 'science_research', category: 'Cyber' }
];

window.OmegaCabinetEngine = {
    countryCode: 'BD',
    activeTransition: null,
    activeReligion: 'islam',
    activeIdeology: 'dictatorship',

    // Ministerial Personality Traits & System Roles
    personalities: {
        cabinet_council: { type: 'Sovereign', stance: 'Supreme Executive Council', modifier: { authority: 1.8, stability: 1.5 }, icon: '🏛️' },
        defense: { type: 'Aggressive', stance: 'Hawkish Military Commander', modifier: { defense: 1.5, diplomacy: -0.5 }, icon: '🦅' },
        foreign_affairs: { type: 'Technocrat', stance: 'Diplomatic Negotiator', modifier: { trade: 1.2, defense: -0.3 }, icon: '🕊️' },
        energy_mining: { type: 'Pragmatic', stance: 'Resource Maximizer', modifier: { energy: 1.4, environment: -0.4 }, icon: '⚡' },
        intelligence_cyber: { type: 'Loyalist', stance: 'Vigilant Security Strategist', modifier: { intelligence: 1.6, privacy: -0.6 }, icon: '🕵️' },
        agriculture_food: { type: 'Reformist', stance: 'Agrarian Populist Leader', modifier: { agriculture: 1.3, trade: 0.2 }, icon: '🌾' },
        interior_security: { type: 'Aggressive', stance: 'Law & Order Enforcer', modifier: { stability: 1.4, freedom: -0.5 }, icon: '🚓' },
        health_welfare: { type: 'Reformist', stance: 'Humanitarian Guardian', modifier: { health: 1.5, budget: -0.3 }, icon: '🏥' },
        treasury_finance: { type: 'Technocrat', stance: 'Fiscal Conservative Guard', modifier: { GDP: 1.4, spending: -0.8 }, icon: '💰' },
        mega_projects: { type: 'Technocrat', stance: 'Infrastructure Builder', modifier: { growth: 1.5, inflation: 0.3 }, icon: '🏗️' },
        trade: { type: 'Pragmatic', stance: 'Free Market Merchant', modifier: { export: 1.4, tariff: -0.5 }, icon: '🪙' },
        production: { type: 'Technocrat', stance: 'Industrial Maximalist', modifier: { industry: 1.5, pollution: 0.2 }, icon: '⚙️' },
        taxes: { type: 'Corrupt', stance: 'Revenue Extractor', modifier: { treasury: 1.2, popularity: -0.6 }, icon: '📋' },
        central_bank: { type: 'Technocrat', stance: 'Monetary Stabilizer', modifier: { inflation: -1.5, liquidity: 0.5 }, icon: '🏦' },
        laws: { type: 'Loyalist', stance: 'Constitutionalist Jurist', modifier: { law: 1.5, dissent: -0.8 }, icon: '⚖️' },
        education: { type: 'Reformist', stance: 'Intellectual Visionary', modifier: { humanCapital: 1.6, cost: 0.4 }, icon: '🎓' },
        infrastructure: { type: 'Technocrat', stance: 'Logistics Mastermind', modifier: { transport: 1.4, connectivity: 1.2 }, icon: '✈️' },
        science_research: { type: 'Reformist', stance: 'Futurist Innovator', modifier: { tech: 1.7, risk: 0.3 }, icon: '🔬' }
    },

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
        console.log("🏛️ Omega Cabinet Engine Initialized with 80+ Motion Database, Simulation Intelligence Engine & Religions/Ideologies Matrix.");
    },

    setSubsystem(sysKey) {
        if (this.subsystems[sysKey]) {
            this.activeSubsystem = sysKey;
            this.renderCabinetSubsystem();
        }
    },

    setActiveSubsystem(sysKey) {
        this.setSubsystem(sysKey);
        if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderCabinet === 'function') {
            window.OmegaCabinetUI.renderCabinet(window.OmegaCabinetUI.activeCountry || 'USA');
        }
    },

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

    govSubView: 'overview',

    setGovSubView(mode) {
        this.govSubView = mode;
        this.renderCabinetSubsystem();
    },

    // 1. 🏛️ GOVERNANCE, RELIGIONS & IDEOLOGIES SYSTEM
    renderGovernanceSubsystem() {
        const transitionProgress = this.activeTransition ? 
            `<div style="background:rgba(255,215,0,0.12); border:1px solid #ffd700; border-radius:10px; padding:12px; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <strong style="color:#ffd700; font-size:13px;">🔄 POLICY TRANSITION IN PROGRESS: ${this.activeTransition.targetName.toUpperCase()}</strong>
                    <span style="color:#00e5ff; font-weight:bold; font-size:12px;">${this.activeTransition.daysRemaining} DAYS REMAINING</span>
                </div>
                <div style="width:100%; background:rgba(255,255,255,0.1); height:8px; border-radius:4px; overflow:hidden;">
                    <div style="width:${this.activeTransition.progress}%; background:linear-gradient(90deg, #ffd700, #00e5ff); height:100%;"></div>
                </div>
            </div>` : '';

        const activeRelObj = window.OmegaReligionsDatabase.find(r => r.id === this.activeReligion) || window.OmegaReligionsDatabase[0];
        const activeIdeoObj = window.OmegaIdeologiesDatabase.find(i => i.id === this.activeIdeology) || window.OmegaIdeologiesDatabase[0];

        // SUB-VIEW: IDEOLOGY SELECTION
        if (this.govSubView === 'ideology') {
            let listHTML = '';
            window.OmegaIdeologiesDatabase.forEach(i => {
                const isActive = i.id === this.activeIdeology;
                listHTML += `
                    <div style="background:${isActive ? 'rgba(255,215,0,0.18)' : 'rgba(15,23,42,0.85)'}; border:1.5px solid ${isActive ? '#ffd700' : 'rgba(255,215,0,0.3)'}; border-radius:12px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:28px;">${i.icon}</span>
                                <div>
                                    <h4 style="color:#ffd700; font-size:15px; margin:0; font-family:'Share Tech Mono',monospace;">${i.bnName}</h4>
                                    <span style="color:#cbd5e1; font-size:11px;">${i.spectrum}</span>
                                </div>
                            </div>
                            <button onclick="window.OmegaCabinetEngine.openReligionIdeologyModal('ideology', '${i.id}')" 
                                style="background:rgba(255,215,0,0.2); border:1px solid #ffd700; color:#ffd700; width:30px; height:30px; border-radius:50%; font-weight:bold; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;" 
                                title="View Detailed Info">ⓘ</button>
                        </div>
                        <div style="font-size:11px; color:#94a3b8; line-height:1.4;">${i.summary || 'State ideology and economic control framework.'}</div>
                        <div>
                            ${isActive ? 
                                `<div style="background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; border-radius:8px; padding:6px 12px; text-align:center; font-weight:bold; font-size:12px;">✅ Active State Policy (Active Ideology)</div>` : 
                                `<button onclick="window.OmegaCabinetEngine.setActiveIdeology('${i.id}')" 
                                    style="width:100%; background:linear-gradient(135deg, #a8812c, #dfba61); border:none; color:#1a1003; font-weight:bold; border-radius:8px; padding:8px 12px; cursor:pointer; font-size:12px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">🎯 Enact State Policy</button>`
                            }
                        </div>
                    </div>
                `;
            });

            return `
                <div style="display:flex; flex-direction:column; gap:14px; touch-action:pan-y;">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.95); border:1px solid rgba(255,215,0,0.4); border-radius:12px; padding:12px 16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:24px;">📜</span>
                            <div>
                                <h3 style="color:#ffd700; font-size:16px; margin:0;">State Ideologies & Governance Models</h3>
                                <span style="color:#94a3b8; font-size:11px;">Active Ideology: <strong>${activeIdeoObj.bnName}</strong></span>
                            </div>
                        </div>
                        <button onclick="window.OmegaCabinetEngine.setGovSubView('overview')" 
                            style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); color:#f8fafc; border-radius:8px; padding:6px 14px; font-weight:bold; cursor:pointer; font-size:12px;">⬅️ Overview Summary</button>
                    </div>

                    ${transitionProgress}

                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                        ${listHTML}
                    </div>
                </div>
            `;
        }

        // SUB-VIEW: RELIGION SELECTION
        if (this.govSubView === 'religion') {
            let listHTML = '';
            window.OmegaReligionsDatabase.forEach(r => {
                const isActive = r.id === this.activeReligion;
                listHTML += `
                    <div style="background:${isActive ? 'rgba(0,229,255,0.18)' : 'rgba(15,23,42,0.85)'}; border:1.5px solid ${isActive ? '#00e5ff' : 'rgba(0,229,255,0.3)'}; border-radius:12px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:28px;">${r.icon}</span>
                                <div>
                                    <h4 style="color:#00e5ff; font-size:15px; margin:0; font-family:'Share Tech Mono',monospace;">${r.bnName}</h4>
                                    <span style="color:#cbd5e1; font-size:11px;">${r.population}</span>
                                </div>
                            </div>
                            <button onclick="window.OmegaCabinetEngine.openReligionIdeologyModal('religion', '${r.id}')" 
                                style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; width:30px; height:30px; border-radius:50%; font-weight:bold; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center;" 
                                title="View Detailed Info">ⓘ</button>
                        </div>
                        <div style="font-size:11px; color:#94a3b8; line-height:1.4;">${r.summary || 'State moral ethos and civil harmony framework.'}</div>
                        <div>
                            ${isActive ? 
                                `<div style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; border-radius:8px; padding:6px 12px; text-align:center; font-weight:bold; font-size:12px;">✅ Active State Religion</div>` : 
                                `<button onclick="window.OmegaCabinetEngine.setActiveReligion('${r.id}')" 
                                    style="width:100%; background:linear-gradient(135deg, #0284c7, #00e5ff); border:none; color:#03131a; font-weight:bold; border-radius:8px; padding:8px 12px; cursor:pointer; font-size:12px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">🎯 Enact State Religion</button>`
                            }
                        </div>
                    </div>
                `;
            });

            return `
                <div style="display:flex; flex-direction:column; gap:14px; touch-action:pan-y;">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.95); border:1px solid rgba(0,229,255,0.4); border-radius:12px; padding:12px 16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:24px;">🕌</span>
                            <div>
                                <h3 style="color:#00e5ff; font-size:16px; margin:0;">World Religions & Demographics</h3>
                                <span style="color:#94a3b8; font-size:11px;">Active Religion: <strong>${activeRelObj.bnName}</strong></span>
                            </div>
                        </div>
                        <button onclick="window.OmegaCabinetEngine.setGovSubView('overview')" 
                            style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); color:#f8fafc; border-radius:8px; padding:6px 14px; font-weight:bold; cursor:pointer; font-size:12px;">⬅️ Overview Summary</button>
                    </div>

                    ${transitionProgress}

                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                        ${listHTML}
                    </div>
                </div>
            `;
        }

        // DEFAULT SUB-VIEW: OVERVIEW (TWO SEPARATE MAIN BUTTONS)
        return `
            <div style="display:flex; flex-direction:column; gap:14px; touch-action:pan-y;">
                ${transitionProgress}

                <!-- TOP METRICS BAR -->
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(0,229,255,0.4); border-radius:10px; padding:12px;">
                        <span style="color:#94a3b8; font-size:10px;">EXECUTIVE AUTHORITY SCORE</span>
                        <div style="font-size:22px; font-weight:bold; color:#00e5ff; font-family:'Share Tech Mono',monospace;">96 / 100</div>
                        <span style="color:#22c55e; font-size:10px;">+6.5% Direct Executive Command</span>
                    </div>
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(255,215,0,0.4); border-radius:10px; padding:12px;">
                        <span style="color:#94a3b8; font-size:10px;">ACTIVE STATE IDEOLOGY</span>
                        <div style="font-size:16px; font-weight:bold; color:#ffd700; font-family:'Share Tech Mono',monospace;">${activeIdeoObj.icon} ${activeIdeoObj.bnName}</div>
                        <span style="color:#ffd700; font-size:10px;">State Sovereign Direction</span>
                    </div>
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(34,197,94,0.4); border-radius:10px; padding:12px;">
                        <span style="color:#94a3b8; font-size:10px;">STATE MORAL ALIGNMENT</span>
                        <div style="font-size:16px; font-weight:bold; color:#22c55e; font-family:'Share Tech Mono',monospace;">${activeRelObj.icon} ${activeRelObj.bnName}</div>
                        <span style="color:#94a3b8; font-size:10px;">High Civil Cohesion</span>
                    </div>
                </div>

                <!-- 2 SEPARATE DISTINCT MAIN ACTION BUTTONS / MODULE CARDS -->
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:14px; margin-top:6px;">
                    
                    <!-- BUTTON 1: STATE IDEOLOGY -->
                    <div style="background:linear-gradient(135deg, rgba(30,27,15,0.95), rgba(15,23,42,0.95)); border:2px solid #ffd700; border-radius:14px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; gap:12px; box-shadow:0 6px 20px rgba(255,215,0,0.15);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span style="font-size:36px;">📜</span>
                                <div>
                                    <h3 style="color:#ffd700; font-size:16px; margin:0; font-family:'Share Tech Mono',monospace;">State Ideology & Political Structure</h3>
                                    <span style="color:#cbd5e1; font-size:11px;">Governance Model & Economic Policy</span>
                                </div>
                            </div>
                        </div>
                        <div style="background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:10px; display:flex; align-items:center; justify-content:space-between;">
                            <span style="color:#94a3b8; font-size:11px;">Current Active Ideology:</span>
                            <strong style="color:#ffd700; font-size:13px;">${activeIdeoObj.icon} ${activeIdeoObj.bnName}</strong>
                        </div>
                        <button onclick="window.OmegaCabinetEngine.setGovSubView('ideology')" 
                            style="width:100%; background:linear-gradient(135deg, #dfba61, #a8812c); border:none; color:#1a1003; font-weight:bold; font-size:13px; border-radius:10px; padding:12px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; gap:8px;">
                            <span>📜</span> <span>View & Change State Ideologies</span>
                        </button>
                    </div>

                    <!-- BUTTON 2: STATE RELIGION -->
                    <div style="background:linear-gradient(135deg, rgba(8,30,45,0.95), rgba(15,23,42,0.95)); border:2px solid #00e5ff; border-radius:14px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; gap:12px; box-shadow:0 6px 20px rgba(0,229,255,0.15);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span style="font-size:36px;">🕌</span>
                                <div>
                                    <h3 style="color:#00e5ff; font-size:16px; margin:0; font-family:'Share Tech Mono',monospace;">State Religion & Demographics</h3>
                                    <span style="color:#cbd5e1; font-size:11px;">Moral Alignment & Faith Census</span>
                                </div>
                            </div>
                        </div>
                        <div style="background:rgba(0,229,255,0.1); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:10px; display:flex; align-items:center; justify-content:space-between;">
                            <span style="color:#94a3b8; font-size:11px;">Current Active Religion:</span>
                            <strong style="color:#00e5ff; font-size:13px;">${activeRelObj.icon} ${activeRelObj.bnName}</strong>
                        </div>
                        <button onclick="window.OmegaCabinetEngine.setGovSubView('religion')" 
                            style="width:100%; background:linear-gradient(135deg, #00e5ff, #0284c7); border:none; color:#03131a; font-weight:bold; font-size:13px; border-radius:10px; padding:12px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; gap:8px;">
                            <span>🕌</span> <span>View & Change State Religions</span>
                        </button>
                    </div>

                </div>
            </div>
        `;
    },

    // 2. 🤝 DYNAMIC 80 MOTIONS & SIMULATION INTELLIGENCE ENGINE VOTING
    renderMeetingsSubsystem() {
        return `
            <div style="display:flex; flex-direction:column; gap:14px; touch-action:pan-y;">
                <div style="background:rgba(8,15,28,0.92); border:1px solid rgba(0,229,255,0.35); border-radius:12px; padding:14px;">
                    <h4 style="color:#00e5ff; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                        <span>🏛️</span> সিমুলেশন ইন্টেলিজেন্স ইঞ্জিন ও স্বয়ংক্রিয় বাজেট পুনর্বণ্টন হিসাব (Simulation Intelligence Engine)
                    </h4>
                    <p style="color:#cbd5e1; font-size:11px; margin-bottom:14px;">
                        যে কোনো প্রস্তাব উত্থাপিত হলে ইঞ্জিন স্বয়ংক্রিয়ভাবে ট্রেজারি, মুদ্রাস্ফীতি এবং অন্য ১৭টি মন্ত্রণালয় থেকে প্রয়োজনীয় <strong>বাজেট পুনর্বণ্টন (Budget Redistribution Cuts %)</strong> গাণিতিকভাবে হিসাব করে। কমানো বাজেটের কারণে যে যে মন্ত্রী ক্ষতিগ্রস্ত হবেন তারা <strong>Loss %</strong> হিসাব করে প্রতিক্রিয়া জানান।
                    </p>

                    <!-- DYNAMIC CUSTOM PROPOSAL BUILDER -->
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,215,0,0.35); border-radius:10px; padding:12px; margin-bottom:14px;">
                        <strong style="color:#ffd700; font-size:12px; display:block; margin-bottom:8px;">
                            ⚙️ নিজস্ব কাস্টম প্রস্তাবনা তৈরি করুন (Dynamic Player Motion Builder)
                        </strong>
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; align-items:end;">
                            <div>
                                <label style="color:#94a3b8; font-size:10px; display:block; margin-bottom:3px;">Target Ministry:</label>
                                <select id="custom-target-ministry" style="width:100%; background:#0f172a; border:1px solid #00e5ff; color:#fff; padding:6px; border-radius:6px; font-size:11px;">
                                    <option value="defense">🦅 Ministry of Defense</option>
                                    <option value="treasury_finance">💰 Ministry of Finance & Treasury</option>
                                    <option value="health_welfare">🏥 Ministry of Health & Welfare</option>
                                    <option value="education">🎓 Ministry of Education</option>
                                    <option value="trade">🪙 Ministry of Commerce & Trade</option>
                                    <option value="infrastructure">✈️ Ministry of Infrastructure</option>
                                    <option value="energy_mining">⚡ Ministry of Energy & Natural Resources</option>
                                    <option value="agriculture_food">🌾 Ministry of Agriculture & Food Security</option>
                                    <option value="interior_security">🚓 Ministry of Interior & Security</option>
                                    <option value="mega_projects">🏗️ Megaprojects Development</option>
                                    <option value="science_research">🔬 Science & Quantum Tech</option>
                                </select>
                            </div>
                            <div>
                                <label style="color:#94a3b8; font-size:10px; display:block; margin-bottom:3px;">Proposed Budget ($ Million USD):</label>
                                <input type="number" id="custom-budget-amount" value="800" min="10" max="100000" style="width:100%; background:#0f172a; border:1px solid #ffd700; color:#ffd700; padding:6px; border-radius:6px; font-weight:bold; font-size:12px; box-sizing:border-box;"/>
                            </div>
                            <div>
                                <label style="color:#94a3b8; font-size:10px; display:block; margin-bottom:3px;">Motion Subject / Title:</label>
                                <input type="text" id="custom-motion-title" value="Military Modernization & New Fighter Squadron Procurement" style="width:100%; background:#0f172a; border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px; border-radius:6px; font-size:11px; box-sizing:border-box;"/>
                            </div>
                            <div>
                                <button onclick="OmegaCabinetEngine.submitCustomMotion();" style="width:100%; background:linear-gradient(135deg, #00e5ff, #0284c7); border:none; color:#020817; font-weight:bold; padding:8px; border-radius:6px; cursor:pointer; font-size:12px;">
                                    🗳️ SUBMIT MOTION TO CABINET
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- PRESET 80 MOTIONS PICKER BY CATEGORY -->
                    <div style="margin-bottom:14px;">
                        <strong style="color:#cbd5e1; font-size:11px; display:block; margin-bottom:6px;">
                            📋 SELECT FROM 80 PRESET STATE MOTIONS:
                        </strong>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <select id="preset-motion-selector" style="flex:1; min-width:240px; background:#0f172a; border:1px solid #00e5ff; color:#00e5ff; padding:8px; border-radius:6px; font-weight:bold; font-size:11px;">
                                ${window.OmegaPresetMotionsDatabase.map(m => `<option value="${m.id}">[${m.category}] ${m.name}</option>`).join('')}
                            </select>
                            <button onclick="OmegaCabinetEngine.submitSelectedPresetMotion();" style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; font-weight:bold; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:11px;">
                                🚀 CONVENE VOTE
                            </button>
                        </div>
                    </div>

                    <!-- REAL-TIME VOTING RESULTS BREAKDOWN CONTAINER -->
                    <div id="cabinet-vote-results" style="background:rgba(15,23,42,0.95); border:1px dashed rgba(0,229,255,0.3); border-radius:10px; padding:14px; min-height:140px; display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:12px;">
                        Select any preset motion above or enter a custom budget request to initiate a full ministerial debate and vote.
                    </div>
                </div>
            </div>
        `;
    },

    // 3. ⚡ DIRECTIVES & DECREES SYSTEM
    renderDirectivesSubsystem() {
        return `
            <div style="display:flex; flex-direction:column; gap:14px;">
                <div style="background:rgba(8,15,28,0.92); border:1px solid rgba(255,215,0,0.35); border-radius:12px; padding:14px;">
                    <h4 style="color:#ffd700; font-family:'Orbitron',sans-serif; font-size:14px; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <span>⚡</span> SOVEREIGN EXECUTIVE DECREES
                    </h4>
                    <p style="color:#94a3b8; font-size:11px; margin-bottom:12px;">
                        Issue binding presidential or sovereign decrees to override standard bureau procedures immediately without parliamentary delay.
                    </p>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
                        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(239,68,68,0.4); border-radius:8px; padding:12px;">
                            <strong style="color:#ef4444; font-size:12px;">🚨 Emergency War Mobilization Decree</strong>
                            <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">Converts 40% civilian factory output into defense munitions for 90 days.</p>
                            <button onclick="window.showOmegaNotification('🚨 WAR MOBILIZATION DECREE', 'Emergency War Mobilization Enacted! Civilian output reallocated.', 'danger')" style="width:100%; background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; font-weight:bold; padding:6px; border-radius:6px; cursor:pointer; margin-top:6px; font-size:11px;">SIGN DECREE</button>
                        </div>
                        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(0,229,255,0.4); border-radius:8px; padding:12px;">
                            <strong style="color:#00e5ff; font-size:12px;">🛡️ National Sovereign Sukuk & Financial Shield</strong>
                            <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">Mandates zero-interest Sukuk bonds to fund strategic food and energy reserves.</p>
                            <button onclick="window.showOmegaNotification('🛡️ SUKUK SHIELD DECREE', 'Sovereign Sukuk Shield Enacted! Reserve liquidity secured.', 'success')" style="width:100%; background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; font-weight:bold; padding:6px; border-radius:6px; cursor:pointer; margin-top:6px; font-size:11px;">SIGN DECREE</button>
                        </div>
                        <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(34,197,94,0.4); border-radius:8px; padding:12px;">
                            <strong style="color:#22c55e; font-size:12px;">🌾 Strategic Grain Reserve Mandate</strong>
                            <p style="color:#cbd5e1; font-size:11px; margin:6px 0;">Mandates 100% strategic food storage, eliminating famine risk during blockades.</p>
                            <button onclick="window.showOmegaNotification('🌾 GRAIN MANDATE DECREE', 'Strategic Grain Reserve Mandate Enforced! Food security locked at 100%.', 'success')" style="width:100%; background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; font-weight:bold; padding:6px; border-radius:6px; cursor:pointer; margin-top:6px; font-size:11px;">SIGN DECREE</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Subsystems 4-10
    renderCoordinationSubsystem() { return `<div style="padding:16px; color:#00e5ff;">🔄 Inter-Ministerial Synergy & Taskforce Operations Active.</div>`; },
    renderIntelligenceSubsystem() { return `<div style="padding:16px; color:#00e5ff;">🕵️ National Security & Domestic Threat Surveillance Active.</div>`; },
    renderProjectsSubsystem() { return `<div style="padding:16px; color:#00e5ff;">🏗️ National Infrastructure & Megaprojects Tracker Active.</div>`; },
    renderBudgetSubsystem() { return `<div style="padding:16px; color:#00e5ff;">💰 National Annual Treasury Allocation Matrix Active.</div>`; },
    renderCrisisSubsystem() { return `<div style="padding:16px; color:#22c55e;">🚨 Emergency Response Command (No active national crisis).</div>`; },
    renderAuditsSubsystem() { return `<div style="padding:16px; color:#00e5ff;">📊 Ministerial Integrity & Efficiency Audits System Active.</div>`; },
    renderStrategySubsystem() { return `<div style="padding:16px; color:#ffd700;">🎯 Vision 2050 Sovereign Power Index Active.</div>`; },

    startPolicyTransition(targetName, days, costBillion) {
        this.activeTransition = { targetName, daysRemaining: days, totalDays: days, progress: 5, cost: costBillion };
        window.showOmegaNotification('🏛️ POLICY REFORM INITIATED', `Transitioning state structure to "${targetName.toUpperCase()}". Duration: ${days} days.`, 'info');
        if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderCabinet === 'function') {
            window.OmegaCabinetUI.renderCabinet(window.OmegaCabinetUI.activeCountry || 'USA');
        }
    },

    setActiveReligion(relId) {
        this.activeReligion = relId;
        window.showOmegaNotification('🕌 STATE RELIGION DECREE', `State Moral & Demographic Primary Religion updated to: ${relId.toUpperCase()}`, 'success');
        if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderCabinet === 'function') {
            window.OmegaCabinetUI.renderCabinet(window.OmegaCabinetUI.activeCountry || 'USA');
        }
    },

    setActiveIdeology(ideoId) {
        this.activeIdeology = ideoId;
        window.showOmegaNotification('📜 STATE IDEOLOGY DECREE', `Active State Political Ideology updated to: ${ideoId.toUpperCase()}`, 'success');
        if (window.OmegaCabinetUI && typeof window.OmegaCabinetUI.renderCabinet === 'function') {
            window.OmegaCabinetUI.renderCabinet(window.OmegaCabinetUI.activeCountry || 'USA');
        }
    },

    submitSelectedPresetMotion() {
        const select = document.getElementById('preset-motion-selector');
        if (!select) return;
        const id = select.value;
        const motionObj = window.OmegaPresetMotionsDatabase.find(m => m.id === id);
        if (motionObj) {
            this.processDynamicVoting(motionObj.amount, motionObj.ministry, motionObj.name);
        }
    },

    submitCustomMotion() {
        const targetMin = document.getElementById('custom-target-ministry').value;
        const amount = parseFloat(document.getElementById('custom-budget-amount').value) || 500;
        const title = document.getElementById('custom-motion-title').value || "Custom Budget Allocation";
        this.processDynamicVoting(amount, targetMin, title);
    },

    // SIMULATION INTELLIGENCE ENGINE (RULE 1 TO RULE 5: DATA DRIVEN MATHEMATICAL DECISIONS & BUDGET REDISTRIBUTION)
    processDynamicVoting(amountMillion, targetMinistryKey, titleText) {
        const resultsEl = document.getElementById('cabinet-vote-results');
        if (!resultsEl) return;

        // 1. Current real-time state economics (Data-Driven Architecture)
        const cashVal = window.resources && window.resources.cash !== undefined ? window.resources.cash : 51780572;
        const treasuryBillion = (cashVal / 1000000); // Treasury in $M (e.g., $51.7B)
        const annualBudgetBillion = Math.max(1200, treasuryBillion * 2.5); // Total State Budget in $M

        const costPercentTreasury = ((amountMillion / treasuryBillion) * 100).toFixed(1);
        const costPercentBudget = ((amountMillion / annualBudgetBillion) * 100).toFixed(1);

        // 2. Budget Engine & Automatic Redistribution Cut Calculations (Rule 4 & Rule 5)
        // If funds requested exceed free treasury cash, non-target ministries must absorb a percentage cut.
        const unallocatedTreasury = treasuryBillion * 0.15; // 15% free buffer
        const deficitToRedistribute = Math.max(0, amountMillion - unallocatedTreasury);
        
        // Count non-target ministries (out of 17 remaining)
        const nonTargetCount = 17;
        const perMinistryCutAmount = (deficitToRedistribute / nonTargetCount);
        const avgMinistryBudget = annualBudgetBillion / 18;

        let yesVotes = 0;
        let noVotes = 0;
        let abstainVotes = 0;
        let breakdownHTML = '';

        const db = window.OmegaCabinetUI ? window.OmegaCabinetUI.ministriesDatabase : {};
        const keys = Object.keys(db);

        keys.forEach(key => {
            const m = db[key];
            const p = this.personalities[key] || { type: 'Pragmatic', stance: 'Neutral Guard' };
            let vote = 'YES';
            let reason = '';
            let lossPercent = 0;

            const isTarget = (key === targetMinistryKey);

            if (isTarget) {
                vote = 'YES';
                reason = `Allocating $${amountMillion}M to our ministry will boost core project output by 300%.`;
            } else {
                // Calculate this non-target ministry's specific budget loss %
                lossPercent = Math.min(25, ((perMinistryCutAmount / avgMinistryBudget) * 100));

                // Ministerial dynamic evaluations based on personality & state variables
                if (key === 'treasury_finance' || key === 'central_bank' || key === 'taxes') {
                    if (amountMillion > treasuryBillion) {
                        vote = 'NO';
                        reason = `Proposed $${amountMillion}M exceeds total liquid treasury ($${treasuryBillion.toFixed(0)}M)! Insolvency risk.`;
                    } else if (parseFloat(costPercentBudget) > 15.0) {
                        vote = 'NO';
                        reason = `Consumes ${costPercentBudget}% of annual budget! Inflation would rise by ${(parseFloat(costPercentBudget) * 0.4).toFixed(1)}%.`;
                    } else {
                        vote = 'YES';
                        reason = `Treasury capacity verified. ${costPercentBudget}% budget allocation is manageable.`;
                    }
                } else if (key === 'trade' || key === 'production') {
                    if (targetMinistryKey === 'infrastructure' || targetMinistryKey === 'mega_projects' || targetMinistryKey === 'energy_mining' || targetMinistryKey === 'trade') {
                        vote = 'YES';
                        reason = `Productive infrastructure investment will expand export revenue.`;
                    } else if (lossPercent > 6.0) {
                        vote = 'NO';
                        reason = `Budget redistribution cuts our allocation by -${lossPercent.toFixed(1)}%, hampering industrial growth.`;
                    } else {
                        vote = 'YES';
                        reason = `Budget trim of -${lossPercent.toFixed(1)}% is within tolerable limits.`;
                    }
                } else if (key === 'health_welfare' || key === 'education') {
                    if (targetMinistryKey === 'health_welfare' || targetMinistryKey === 'education') {
                        vote = 'YES';
                        reason = `Directly supports human capital and public welfare priorities.`;
                    } else if (lossPercent > 4.5) {
                        vote = 'NO';
                        reason = `Redistribution reduces social security safety funds by -${lossPercent.toFixed(1)}%!`;
                    } else {
                        vote = 'YES';
                        reason = `Social and education sectors remain uncompromised (-${lossPercent.toFixed(1)}% loss tolerable).`;
                    }
                } else if (key === 'defense' || key === 'interior_security') {
                    if (targetMinistryKey === 'defense' || targetMinistryKey === 'interior_security' || targetMinistryKey === 'intelligence_cyber') {
                        vote = 'YES';
                        reason = `Pivotal step for sovereign defense and security modernization.`;
                    } else if (lossPercent > 7.0) {
                        vote = 'NO';
                        reason = `Cutting defense/interior budget by -${lossPercent.toFixed(1)}% compromises national security.`;
                    } else {
                        vote = 'YES';
                        reason = `Sovereign readiness maintained (-${lossPercent.toFixed(1)}% budget trim).`;
                    }
                } else {
                    if (lossPercent > 5.5) {
                        vote = 'NO';
                        reason = `Unacceptable -${lossPercent.toFixed(1)}% cut to our ministry's operational allocation.`;
                    } else {
                        vote = 'YES';
                        reason = `We support the motion in the interest of state progress (-${lossPercent.toFixed(1)}% cut acceptable).`;
                    }
                }
            }

            if (vote === 'YES') yesVotes++;
            else if (vote === 'NO') noVotes++;
            else abstainVotes++;

            const badgeColor = vote === 'YES' ? '#22c55e' : (vote === 'NO' ? '#ef4444' : '#ffd700');
            const lossTag = (!isTarget && lossPercent > 0) ? `<span style="color:#ef4444; font-size:10px; margin-left:4px;">[Cut: -${lossPercent.toFixed(1)}%]</span>` : '';

            breakdownHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:6px 10px; border-radius:6px; font-size:11px; margin-bottom:4px;">
                    <div style="display:flex; align-items:center; gap:6px; max-width:40%;">
                        <span>${p.icon || m.avatar}</span>
                        <strong style="color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.title}</strong>
                        ${lossTag}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; max-width:60%;">
                        <span style="color:#cbd5e1; font-size:10px; text-align:right;">"${reason}"</span>
                        <span style="background:${badgeColor}22; border:1px solid ${badgeColor}; color:${badgeColor}; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:10px; white-space:nowrap;">${vote === 'YES' ? 'YES' : 'NO'}</span>
                    </div>
                </div>
            `;
        });

        const motionPassed = yesVotes >= 10;
        const statusColor = motionPassed ? '#22c55e' : '#ef4444';

        resultsEl.innerHTML = `
            <div style="width:100%; display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
                    <div>
                        <strong style="font-size:13px; color:${statusColor}; font-family:'Orbitron',sans-serif;">
                            ${motionPassed ? '✅ MOTION PASSED BY CABINET MAJORITY' : '❌ MOTION REJECTED BY CABINET'}
                        </strong>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">
                            Motion: <strong>${titleText}</strong> | Allocation: <strong style="color:#ffd700;">$${amountMillion}M USD</strong> (${costPercentBudget}% of Annual Budget)
                        </div>
                    </div>
                    <div style="font-size:11px; background:rgba(255,255,255,0.08); padding:4px 10px; border-radius:6px;">
                        Tally: <span style="color:#22c55e; font-weight:bold;">${yesVotes} YES</span> | 
                        <span style="color:#ef4444; font-weight:bold;">${noVotes} NO</span>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:2px; max-height:260px; overflow-y:auto; padding-right:4px; -webkit-overflow-scrolling:touch; touch-action:pan-y;">
                    ${breakdownHTML}
                </div>
            </div>
        `;
    },

    // RELIGIONS & IDEOLOGIES INFO MODAL POPUP (ⓘ) - WITH MERITS, DEMERITS, SHARIA DEEP STUDY & DICTATORSHIP AURA
    openReligionIdeologyModal(type, id) {
        let existing = document.getElementById('omega-rel-ideology-modal');
        if (existing) existing.remove();

        let data = null;
        if (type === 'religion') {
            data = window.OmegaReligionsDatabase.find(r => r.id === id);
        } else {
            data = window.OmegaIdeologiesDatabase.find(i => i.id === id);
        }

        if (!data) return;

        const modal = document.createElement('div');
        modal.id = 'omega-rel-ideology-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 9999999;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;

        let impactHTML = '';
        if (data.stateImpact) {
            Object.keys(data.stateImpact).forEach(k => {
                impactHTML += `<div style="background:rgba(0,229,255,0.1); border:1px solid rgba(0,229,255,0.3); padding:4px 8px; border-radius:6px; font-size:11px; color:#00e5ff;"><strong>${k.toUpperCase()}:</strong> ${data.stateImpact[k]}</div>`;
            });
        }

        let meritsHTML = '';
        if (data.merits && data.merits.length > 0) {
            meritsHTML += `
                <div style="margin-bottom:12px;">
                    <strong style="color:#22c55e; font-size:12px; display:block; margin-bottom:4px;">✅ State & Social Merits:</strong>
                    <ul style="margin:0; padding-left:18px; color:#e2e8f0; font-size:11px; line-height:1.5;">
                        ${data.merits.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        let demeritsHTML = '';
        if (data.demerits && data.demerits.length > 0) {
            demeritsHTML += `
                <div style="margin-bottom:12px;">
                    <strong style="color:#ef4444; font-size:12px; display:block; margin-bottom:4px;">⚠️ Strategic Demerits & Risk Factors:</strong>
                    <ul style="margin:0; padding-left:18px; color:#cbd5e1; font-size:11px; line-height:1.5;">
                        ${data.demerits.map(d => `<li>${d}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        const isCurrentActive = (type === 'religion' && this.activeReligion === id) || (type === 'ideology' && this.activeIdeology === id);

        modal.innerHTML = `
            <div style="background:linear-gradient(145deg, #091322, #020813); border:2px solid ${type === 'religion' ? '#00e5ff' : '#ffd700'}; border-radius:14px; max-width:600px; width:100%; max-height:85vh; overflow-y:auto; padding:20px; box-shadow:0 15px 50px rgba(0,0,0,0.9); color:#fff; font-family:'Share Tech Mono', monospace; position:relative; -webkit-overflow-scrolling:touch; touch-action:pan-y;">
                <button onclick="document.getElementById('omega-rel-ideology-modal').remove()" style="position:absolute; top:12px; right:14px; background:none; border:none; color:#ef4444; font-size:20px; font-weight:bold; cursor:pointer;" title="Close Modal">✕</button>
                
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:10px;">
                    <span style="font-size:36px;">${data.icon}</span>
                    <div>
                        <h3 style="color:${type === 'religion' ? '#00e5ff' : '#ffd700'}; margin:0; font-size:18px;">${data.name}</h3>
                        <span style="color:#cbd5e1; font-size:11px;">${data.type || data.spectrum} ${data.population ? '| Demographics: ' + data.population : ''}</span>
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <strong style="color:#ffd700; font-size:12px; display:block; margin-bottom:4px;">📜 Core Philosophy & Tenets:</strong>
                    <p style="color:#e2e8f0; font-size:11px; margin:0; line-height:1.5;">${data.tenets}</p>
                </div>

                <div style="margin-bottom:14px;">
                    <strong style="color:#00e5ff; font-size:12px; display:block; margin-bottom:6px;">📊 State & Economic Modifiers:</strong>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${impactHTML}
                    </div>
                </div>

                ${meritsHTML}
                ${demeritsHTML}

                <div style="margin-bottom:16px;">
                    <strong style="color:#94a3b8; font-size:11px; display:block; margin-bottom:4px;">🌐 Historical & Geopolitical Analysis:</strong>
                    <p style="color:#cbd5e1; font-size:11px; margin:0; line-height:1.5;">${data.description}</p>
                </div>

                <div style="display:flex; gap:10px; margin-top:14px;">
                    ${isCurrentActive ? 
                        `<div style="flex:1; background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; text-align:center; padding:8px; border-radius:6px; font-weight:bold; font-size:12px;">
                            ✅ ACTIVE STATE POLICY
                        </div>` :
                        `<button onclick="window.OmegaCabinetEngine.${type === 'religion' ? 'setActiveReligion' : 'setActiveIdeology'}('${data.id}'); document.getElementById('omega-rel-ideology-modal').remove();" 
                            style="flex:1; background:linear-gradient(135deg, ${type === 'religion' ? '#00e5ff, #0284c7' : '#ffd700, #b45309'}); border:none; color:#020817; font-weight:bold; padding:8px; border-radius:6px; cursor:pointer; font-size:12px;">
                            🎯 ENACT AS STATE POLICY
                        </button>`
                    }
                    <button onclick="document.getElementById('omega-rel-ideology-modal').remove()" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; font-weight:bold; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:12px;">
                        CLOSE
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.OmegaCabinetEngine.init();
});
