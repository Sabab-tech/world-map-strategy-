(function(root) {
  'use strict';
  if (root.OmegaMinisterIdentityPool && root.OmegaMinisterIdentityPool.VERSION === '1.0.0') return;

  const VERSION = '1.0.0';
  const EXPECTED_COUNTRIES = 197;
  const CANDIDATES_PER_MINISTRY = 5;
  const countryCache = new Map();
  let manifestData = null;
  let templateDB = null;
  let loading = null;

  const MINISTRY_PROFILE_CATEGORIES = Object.freeze({
    cabinet_council:['Information_Media','Culture_Religion'],
    trade:['Economy_Commerce'],
    production:['Energy_Infrastructure'],
    taxes:['Finance'],
    central_bank:['Finance'],
    laws:['Justice'],
    education:['Public_Welfare'],
    infrastructure:['Energy_Infrastructure'],
    science_research:['Science_Technology'],
    defense:['Defense'],
    foreign_affairs:['Foreign_Affairs'],
    energy_mining:['Energy_Infrastructure','Environment_Climate'],
    intelligence_cyber:['Intelligence','Science_Technology'],
    agriculture_food:['Agriculture_Food'],
    interior_security:['Home_Affairs'],
    health_welfare:['Public_Welfare'],
    treasury_finance:['Finance'],
    mega_projects:['Energy_Infrastructure','Environment_Climate']
  });

  const COUNTRY_NAMES = {
    Asia:{
      first:'Aarav Mira Rafiq Nadia Imran Sana Arjun Mei Hana Kenji Aisha Dara Lina Farid Yuna Tenzin Siti Bao Anika Omar Jin Soraya Kiran Mali Yasmin Hiro Noor Kavya Reza'.split(' '),
      last:'Rahman Iyer Tanaka Chowdhury Sato Malik Wijaya Chen Sharma Khan Das Nguyen Kim Hossain Patel Fernando Yamamoto Kaur Prasetyo Wang Haq Nakamura Lestari Sen Bose Park Hidayat Singh Le Qureshi'.split(' ')
    },
    Africa:{
      first:'Amara Zola Kwame Nia Kofi Amina Tendai Sade Bako Thandi Idris Lindiwe Jabari Zuri Chidi Malaika Olu Eshe Tariro Kelechi Nuru Ayo Abena Sipho Adisa Mirembe Femi Imani Kato Deka'.split(' '),
      last:'Okafor Mensah Ndlovu Diallo Abebe Bello Dlamini Kamara Mbeki Adebayo Moussa Boateng Kone Toure Moyo Achebe Sow Molefe Tesfaye Mahlangu Osei Traore Mutombo Kagiso Munyaneza Chukwu Biko Senghor Mabena'.split(' ')
    },
    Europe:{
      first:'Elena Marek Luka Sofia Nikolai Ines Tomas Anja Milan Freya Daria Anton Marta Emil Leonie Rafael Katarina Jonas Petra Mikhail Eva Stefan Clara Oskar Nina Victor Alina Boris Isabel Mateo'.split(' '),
      last:'Novak Petrov Kovac Ivanov Horvat Jensen Weber Dubois Silva Rossi Popescu Kowalski Keller Berg Moreau Costa Muller Svensson Kuznetsov Nowak Dvorak Varga Marin Schmidt Lind Vukovic Fischer Kral Santos Laurent'.split(' ')
    },
    'North America':{
      first:'Jordan Taylor Morgan Avery Casey Riley Cameron Skyler Drew Quinn Parker Rowan Alex Jamie Reese Logan Devon Emerson Ari Sage Noah Maya Elijah Grace Ethan Leah Miles Naomi Owen Zoe'.split(' '),
      last:'Carter Bennett Reed Hayes Morgan Brooks Sullivan Mitchell Foster Turner Parker Collins Bailey Ward Price Murphy Cooper Rogers Cook Powell Rivera Graham Hughes Kelly Sanders Coleman Ross Bryant Morris Ellis'.split(' ')
    },
    'South America':{
      first:'Camila Mateo Sofia Thiago Valeria Lucas Mariana Diego Isabela Rafael Lucia Nicolas Gabriela Tomas Elena Andres Daniela Bruno Paula Joaquin Renata Felipe Alma Martin Cecilia Emilio Natalia Gael Bianca Pablo'.split(' '),
      last:'Silva Alvarez Rojas Ferreira Morales Castro Mendez Vargas Navarro Santos Pereira Ramirez Costa Gomez Herrera Torres Acosta Romero Flores Cabrera Medina Rivera Ortiz Vega Cardenas Paz Quintero Benitez Lagos Arias'.split(' ')
    },
    Oceania:{
      first:'Tane Moana Aroha Koa Leilani Talia Noa Mika Sione Anahera Manaia Lani Eren Isla Kai Rangi Ayla Tama Niko Mele Pita Alani Luka Kiri Hemi Sela Jone Malia Tui Afa'.split(' '),
      last:'Tupou Waqa Katoa Faumuina Taito Ngata Fale Ravulo Morrison Kereama Vaai Taufua Manu Whaitiri Talakai Rika Niumata Sopoaga Tuilagi Mikaere Faleafaga Paea Wendt Ropata Tawake Tofa Tukaki Kivalu TeRangi'.split(' ')
    },
    Antarctica:{
      first:'Alex Robin Sam Taylor Jordan Morgan Avery Casey Riley Cameron Skyler Drew Quinn Parker Rowan Jamie Reese Logan Devon Emerson Ari Sage Noah Maya Elliot Harper Milan Remy River Jules'.split(' '),
      last:'Reed Hayes Morgan Brooks Sullivan Mitchell Foster Turner Parker Collins Bailey Ward Price Murphy Cooper Rogers Cook Powell Rivera Graham Hughes Kelly Sanders Coleman Ross Bryant Bennett Carter Morris Ellis'.split(' ')
    }
  };
  const COUNTRY_MIDDLES = 'Dev Linh Samira Iqbal Nari Pran Amin Talia Rohan Suri Minh Ayan Jaya Faris Kimi Dilan Yori Mina Anwar Veda Hye Rumi Tari Nima Adil Sora Jamil Kanya Eshan Rina'.split(' ');
  const LEADERSHIP_STYLES = [
    'Long-horizon planner who compares scenarios and prefers measured execution.',
    'Fast-moving executor who favours clear priorities and short decision cycles.',
    'Consultative coordinator who weighs stakeholder effects before committing.',
    'Process-led operator who emphasizes compliance and predictable delivery.',
    'Balanced administrator who combines execution with periodic review.'
  ];
  const DECISION_STYLES = [
    'Compares feasibility, risk and portfolio objectives.',
    'Uses staged implementation and corrective checkpoints.',
    'Checks evidence and documents assumptions before major commitments.',
    'Balances speed with escalation rules for uncertainty.',
    'Uses risk registers, measurable milestones and post-decision review.'
  ];

  function text(value) { return value == null ? '' : String(value).trim(); }
  function normalizeKey(value) {
    return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  }
  function rosterTemplateDB(raw) { return raw && (raw.ministers_database || raw.ministers) || raw || {}; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function hasTemplates(value) {
    return !!value && Object.values(value).some(Array.isArray);
  }
  function validateManifest() {
    if (!manifestData || !manifestData.countries || !Array.isArray(manifestData.ministryDefinitions)) {
      fail('COUNTRY_ROSTER_MANIFEST_INVALID');
    }
    const codes = Object.keys(manifestData.countries);
    if (codes.length !== EXPECTED_COUNTRIES || Number(manifestData.counts && manifestData.counts.countryEntities) !== EXPECTED_COUNTRIES) {
      fail('COUNTRY_ROSTER_COUNTRY_COUNT_MISMATCH');
    }
    if (manifestData.ministryDefinitions.length !== 18 || Number(manifestData.counts && manifestData.counts.totalProfiles) !== 17730) {
      fail('COUNTRY_ROSTER_MINISTRY_COUNT_MISMATCH');
    }
    for (const code of codes) {
      const identity = manifestData.countries[code];
      if (!/^[A-Z]{3}$/.test(code) || !identity || identity.countryCode !== code || !identity.countryName || !identity.continent) {
        fail('COUNTRY_ROSTER_IDENTITY_INVALID:' + code);
      }
    }
    if (!manifestData.lookup || typeof manifestData.lookup !== 'object') fail('COUNTRY_ROSTER_LOOKUP_INVALID');
  }
  function configure(options) {
    options = options || {};
    if (options.manifest) manifestData = options.manifest;
    if (options.templates) templateDB = rosterTemplateDB(options.templates);
    countryCache.clear();
    if (manifestData) validateManifest();
    return getCoverage();
  }
  async function fetchJson(url) {
    const fetcher = root.fetch || (typeof fetch === 'function' ? fetch : null);
    if (typeof fetcher !== 'function') fail('COUNTRY_ROSTER_FETCH_UNAVAILABLE');
    const response = await fetcher(url, {cache:'no-store',headers:{Accept:'application/json'}});
    if (!response || !response.ok) fail('COUNTRY_ROSTER_JSON_HTTP_' + (response && response.status || 'ERROR'));
    return response.json();
  }
  async function ensureReady() {
    if (manifestData && hasTemplates(templateDB)) {
      validateManifest();
      return;
    }
    if (loading) return loading;
    loading = (async function() {
      if (!manifestData) manifestData = await fetchJson('minister_country_roster_manifest_v1.json');
      if (!hasTemplates(templateDB)) {
        const raw = await fetchJson('ministers.json');
        templateDB = rosterTemplateDB(raw);
        root.OmegaMinistersDB = templateDB;
      }
      if (!hasTemplates(templateDB)) fail('COUNTRY_ROSTER_TEMPLATES_INVALID');
      validateManifest();
    })();
    try { await loading; } finally { loading = null; }
  }
  function resolveCountryCode(value) {
    const raw = value && typeof value === 'object'
      ? value.iso3 || value.alpha3 || value.cca3 || value.countryCode || value.country_code || value.code || value.iso2 || value.name || value.id
      : value;
    const label = text(raw);
    if (!label) fail('COUNTRY_ROSTER_COUNTRY_REQUIRED');
    const upper = label.toUpperCase();
    if (/^[A-Z]{3}$/.test(upper) && manifestData.countries[upper]) return upper;
    const key = normalizeKey(label);
    const mapped = manifestData.lookup[key];
    if (mapped && manifestData.countries[mapped]) return mapped;
    fail('COUNTRY_ROSTER_COUNTRY_NOT_FOUND');
  }
  function clamp100(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
  function buildCountryRoster(code) {
    const identity = manifestData.countries[code];
    if (!identity) fail('COUNTRY_ROSTER_COUNTRY_NOT_FOUND');
    const db = templateDB;
    const record = {
      countryCode:code,
      countryName:identity.countryName,
      continent:identity.continent,
      subregion:identity.subregion,
      identityStatus:identity.identityStatus,
      provenance:{kind:'SIMULATION_GENERATED',realPersonClaim:false},
      ministries:{}
    };
    const ordinal = Number(identity.ordinal) || 0;
    for (let mi=0; mi<manifestData.ministryDefinitions.length; mi++) {
      const def = manifestData.ministryDefinitions[mi];
      const categories = MINISTRY_PROFILE_CATEGORIES[normalizeKey(def.id)] || [def.templateCategory];
      const pool = categories.flatMap(function(category) { return Array.isArray(db[category]) ? db[category] : []; });
      const fallback = db[def.templateCategory] || [];
      const templates = pool.length ? pool : fallback;
      if (!templates.length) fail('COUNTRY_ROSTER_TEMPLATE_MISSING:' + def.templateCategory);
      const region = COUNTRY_NAMES[identity.continent] || COUNTRY_NAMES.Asia;
      record.ministries[def.id] = Array.from({length:CANDIDATES_PER_MINISTRY}, function(_, slot) {
        const sequence = ordinal * 90 + mi * CANDIDATES_PER_MINISTRY + slot;
        const name = region.first[sequence % region.first.length] + ' ' +
          COUNTRY_MIDDLES[Math.floor(sequence / region.first.length) % COUNTRY_MIDDLES.length] + ' ' +
          region.last[Math.floor(sequence / (region.first.length * COUNTRY_MIDDLES.length)) % region.last.length];
        const template = templates[(ordinal + mi + slot) % templates.length] || {};
        const delta = function(i, seed) { return ((seed + i * 7) % 15) - 7; };
        const stats = {}, efficiency = {};
        Object.entries(template.stats || {}).forEach(function(entry, i) {
          stats[entry[0]] = clamp100(Number(entry[1]) + delta(i, ordinal * 3 + mi * 5 + slot * 11));
        });
        ['discipline','aggression','empathy','corruption','strategic'].forEach(function(key) {
          if (!(key in stats)) stats[key] = clamp100(50 + delta(Object.keys(stats).length, ordinal + mi * 3 + slot * 5));
        });
        Object.entries(template.efficiency || {}).forEach(function(entry, i) {
          efficiency[entry[0]] = clamp100(Number(entry[1]) + delta(i, ordinal * 7 + mi * 3 + slot * 13));
        });
        ['decision_speed','accuracy','crisis_handling'].forEach(function(key) {
          if (!(key in efficiency)) efficiency[key] = clamp100(50 + delta(Object.keys(efficiency).length, ordinal + mi * 7 + slot * 3));
        });
        const age = Math.max(28, Math.min(68, Number(template.age || 45) + ((ordinal + mi + slot) % 9) - 4));
        const background = def.backgrounds[slot];
        const priority = def.priorityAreas;
        const id = 'MIN-' + code + '-' + def.id.toUpperCase() + '-' + String(slot + 1).padStart(3,'0');
        const ranked = Object.entries(stats).map(function(entry) {
          return {key:entry[0],value:entry[1],score:entry[0] === 'corruption' ? 100 - entry[1] : entry[1]};
        }).sort(function(a,b) { return b.score - a.score; }).slice(0,2);
        const labels = {
          discipline:'discipline',
          aggression:'initiative and risk tolerance',
          empathy:'stakeholder awareness',
          corruption:'integrity',
          strategic:'strategic planning'
        };
        const strengths = ranked.map(function(item) {
          return (labels[item.key] || item.key) + ' (' + item.value + '/100 simulated rating)';
        });
        const watchouts = [];
        if (stats.corruption >= 25) watchouts.push('Elevated simulated integrity-risk score; strengthen audit controls.');
        if (stats.aggression >= 78) watchouts.push('High simulated risk appetite; review irreversible decisions.');
        if (stats.empathy < 40) watchouts.push('Use stakeholder-impact review for welfare-facing decisions.');
        if (efficiency.accuracy < 68) watchouts.push('Accuracy score calls for independent validation before high-impact decisions.');
        if (efficiency.crisis_handling < 68) watchouts.push('Crisis-response score suggests contingency planning and escalation monitoring.');
        if (!watchouts.length) watchouts.push('No standout risk flag in this simulated profile; monitor workload and decision quality.');
        const leadership = stats.strategic >= 82 && stats.discipline >= 70 ? LEADERSHIP_STYLES[0]
          : efficiency.decision_speed >= 84 ? LEADERSHIP_STYLES[1]
          : stats.empathy >= 70 ? LEADERSHIP_STYLES[2]
          : stats.discipline >= 82 ? LEADERSHIP_STYLES[3] : LEADERSHIP_STYLES[4];
        const summaries = [
          name + ' is a fictional OMEGA candidate for ' + identity.countryName + '\'s ' + def.title + ' portfolio, emphasizing ' + priority[0] + ' and ' + priority[1] + '.',
          'This simulated ' + def.title.toLowerCase() + ' profile for ' + identity.countryName + ' prioritizes ' + priority[1] + ' while overseeing ' + priority[2] + '.',
          name + '\'s simulated record focuses on ' + priority[2] + ' and accountable delivery in ' + identity.countryName + '.',
          'Designed for OMEGA, this fictional candidate approaches ' + def.title.toLowerCase() + ' through ' + priority[0] + ' and evidence-led review.',
          'A fictional candidate dossier for ' + identity.countryName + ': ' + def.title.toLowerCase() + ' work centers on ' + priority[1] + ', tracking and risk control.'
        ];
        return {
          id:id,
          name:name,
          baseName:name,
          displayName:name,
          age:age,
          gender:String(template.gender || (slot % 2 ? 'female' : 'male')),
          background:background,
          education:'Simulated training track in ' + priority[0] + ' and public-sector governance.',
          careerBackground:'Fictional ' + background.toLowerCase() + ' background for the ' + def.title + ' portfolio.',
          specialties:priority.slice(0,2),
          ministryId:def.id,
          ministryCategory:def.templateCategory,
          ministryTitle:def.title,
          countryCode:code,
          countryName:identity.countryName,
          continent:identity.continent,
          subregion:identity.subregion,
          stats:stats,
          efficiency:efficiency,
          ideology:{type:String(template.ideology && (template.ideology.type || template.ideology.name) || ['technocrat','liberal','secular','nationalist','socialist'][(ordinal + mi + slot) % 5])},
          personalityProfile:Object.assign({},stats,{
            learningAgility:clamp100(100 - Math.abs(70 - efficiency.accuracy) + ((ordinal + mi * 2 + slot * 3) % 13) - 6),
            stressTolerance:clamp100((stats.discipline + efficiency.crisis_handling + stats.empathy) / 3)
          }),
          profileDetails:{
            summary:summaries[slot],
            professionalBackground:background + ' is a fictional career archetype focused on ' + priority[0] + ' and ' + priority[1] + '; no real-world employment history is implied.',
            leadershipStyle:leadership,
            decisionMaking:DECISION_STYLES[(ordinal + mi + slot) % DECISION_STYLES.length],
            strengths:strengths,
            watchouts:watchouts,
            priorityAreas:priority.slice(),
            provenanceNotice:'Fictional simulation character; not a claim about a real official.'
          },
          recordType:'SIMULATED_FICTIONAL',
          isFictional:true
        };
      });
    }
    return {countryCode:code,countryName:identity.countryName,continent:identity.continent,record:record};
  }
  async function getCountryRecord(countryId) {
    await ensureReady();
    const code = resolveCountryCode(countryId);
    if (!countryCache.has(code)) countryCache.set(code, buildCountryRoster(code));
    return countryCache.get(code);
  }
  async function getCountryRoster(countryId) {
    const value = await getCountryRecord(countryId);
    return clone(value);
  }
  async function getCandidates(countryId, ministryId) {
    const value = await getCountryRecord(countryId);
    const key = normalizeKey(ministryId);
    const def = manifestData.ministryDefinitions.find(function(item) { return normalizeKey(item.id) === key; });
    if (!def) fail('COUNTRY_MINISTRY_ROSTER_NOT_FOUND');
    const candidates = value.record.ministries[def.id];
    if (!Array.isArray(candidates) || candidates.length !== CANDIDATES_PER_MINISTRY) {
      fail('COUNTRY_MINISTRY_ROSTER_INVALID');
    }
    return candidates.map(function(candidate) {
      return Object.assign(clone(candidate),{
        displayName:candidate.displayName || candidate.baseName || candidate.name || candidate.id,
        ministryCategory:candidate.ministryCategory || def.templateCategory,
        rosterSource:'COUNTRY_MINISTRY_ROSTER_V1'
      });
    });
  }
  function getCoverage() {
    const count = Object.keys(manifestData && manifestData.countries || {}).length;
    const ministries = Array.isArray(manifestData && manifestData.ministryDefinitions) ? manifestData.ministryDefinitions.length : 0;
    return {
      version:VERSION,
      countryCount:count,
      ministryCount:ministries,
      candidatesPerMinistry:CANDIDATES_PER_MINISTRY,
      candidatesPerCountry:ministries * CANDIDATES_PER_MINISTRY,
      totalProfiles:count * ministries * CANDIDATES_PER_MINISTRY,
      cachedCountryCount:countryCache.size,
      configured:!!manifestData && hasTemplates(templateDB)
    };
  }
  root.OmegaMinisterIdentityPool = Object.freeze({
    VERSION:VERSION,
    configure:configure,
    getCoverage:getCoverage,
    resolveCountryCode:resolveCountryCode,
    getCountryRoster:getCountryRoster,
    getCandidates:getCandidates
  });
})(typeof window !== 'undefined' ? window : globalThis);