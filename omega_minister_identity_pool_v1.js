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
    const generation = manifestData.profileGeneration;
    if (!generation || !generation.namePools || !Array.isArray(generation.middleNames) ||
        !generation.profileText || !Array.isArray(generation.profileText.summaryTemplates) ||
        !Array.isArray(generation.profileText.leadershipStyles) ||
        !Array.isArray(generation.profileText.decisionStyles)) {
      fail('COUNTRY_ROSTER_PROFILE_DATA_INVALID');
    }
    for (const identity of Object.values(manifestData.countries)) {
      const names = generation.namePools[identity.continent];
      if (!names || !Array.isArray(names.firstNames) || !names.firstNames.length ||
          !Array.isArray(names.lastNames) || !names.lastNames.length) {
        fail('COUNTRY_ROSTER_NAME_POOL_MISSING:' + identity.continent);
      }
    }
    for (const def of manifestData.ministryDefinitions) {
      if (!Array.isArray(def.templateCategories) || !def.templateCategories.length ||
          !Array.isArray(def.priorityAreas) || def.priorityAreas.length < 3 ||
          !Array.isArray(def.backgrounds) || def.backgrounds.length !== CANDIDATES_PER_MINISTRY) {
        fail('COUNTRY_ROSTER_MINISTRY_PROFILE_DATA_INVALID:' + def.id);
      }
    }
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
  function formatProfileText(template, values) {
    return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, key) {
      return Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key]) : match;
    });
  }
  function profileRuleMatches(rule, stats, efficiency) {
    if (!rule) return false;
    if (rule.fallback === true) return true;
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule];
    return conditions.every(function(condition) {
      const source = condition.source === 'efficiency' ? efficiency : stats;
      const actual = Number(source && source[condition.metric]);
      const threshold = Number(condition.threshold);
      if (!Number.isFinite(actual) || !Number.isFinite(threshold)) return false;
      switch (condition.operator) {
        case 'gte': return actual >= threshold;
        case 'gt': return actual > threshold;
        case 'lte': return actual <= threshold;
        case 'lt': return actual < threshold;
        case 'eq': return actual === threshold;
        default: return false;
      }
    });
  }
  function buildCountryRoster(code) {
    const identity = manifestData.countries[code];
    if (!identity) fail('COUNTRY_ROSTER_COUNTRY_NOT_FOUND');
    const db = templateDB;
    const generation = manifestData.profileGeneration;
    const profileText = generation.profileText;
    const namePool = generation.namePools[identity.continent];
    if (!namePool || !namePool.firstNames.length || !namePool.lastNames.length || !generation.middleNames.length) {
      fail('COUNTRY_ROSTER_NAME_POOL_MISSING:' + identity.continent);
    }
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
      const categories = def.templateCategories;
      const pool = categories.flatMap(function(category) { return Array.isArray(db[category]) ? db[category] : []; });
      const fallback = db[def.templateCategory] || [];
      const templates = pool.length ? pool : fallback;
      if (!templates.length) fail('COUNTRY_ROSTER_TEMPLATE_MISSING:' + def.templateCategory);
      record.ministries[def.id] = Array.from({length:CANDIDATES_PER_MINISTRY}, function(_, slot) {
        const sequence = ordinal * 90 + mi * CANDIDATES_PER_MINISTRY + slot;
        const name = namePool.firstNames[sequence % namePool.firstNames.length] + ' ' +
          generation.middleNames[Math.floor(sequence / namePool.firstNames.length) % generation.middleNames.length] + ' ' +
          namePool.lastNames[Math.floor(sequence / (namePool.firstNames.length * generation.middleNames.length)) % namePool.lastNames.length];
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
        const labels = profileText.ratingLabels || {};
        const strengths = ranked.map(function(item) {
          return formatProfileText(profileText.strengthTemplate, {
            label:labels[item.key] || item.key,
            value:item.value
          });
        });
        const watchouts = [];
        (profileText.watchoutRules || []).forEach(function(rule) {
          if (profileRuleMatches(rule, stats, efficiency)) {
            watchouts.push(formatProfileText(rule.text, {
              name:name,country:identity.countryName,ministry:def.title,background:background,
              metric:rule.metric,threshold:rule.threshold
            }));
          }
        });
        if (!watchouts.length) watchouts.push(String(profileText.fallbackWatchout || ''));
        const leadershipRule = (profileText.leadershipRules || []).find(function(rule) {
          return profileRuleMatches(rule, stats, efficiency);
        });
        const leadershipIndex = leadershipRule ? Number(leadershipRule.styleIndex) : profileText.leadershipStyles.length - 1;
        const leadership = profileText.leadershipStyles[leadershipIndex] || profileText.leadershipStyles[profileText.leadershipStyles.length - 1] || '';
        const narrativeValues = {
          name:name,
          country:identity.countryName,
          ministry:def.title,
          ministryLower:String(def.title).toLowerCase(),
          background:background,
          backgroundLower:String(background).toLowerCase(),
          priority0:priority[0],
          priority1:priority[1],
          priority2:priority[2]
        };
        const summary = formatProfileText(profileText.summaryTemplates[slot] || profileText.summaryTemplates[0], narrativeValues);
        const professionalBackground = formatProfileText(profileText.professionalBackgroundTemplate, narrativeValues);
        const education = formatProfileText(profileText.educationTemplate, narrativeValues);
        const careerBackground = formatProfileText(profileText.careerBackgroundTemplate, narrativeValues);
        return {
          id:id,
          name:name,
          baseName:name,
          displayName:name,
          age:age,
          gender:String(template.gender || generation.genderBySlot && generation.genderBySlot[slot % generation.genderBySlot.length] || 'not recorded'),
          background:background,
          education:education,
          careerBackground:careerBackground,
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
          ideology:{type:String(template.ideology && (template.ideology.type || template.ideology.name) ||
            generation.ideologyTypes[(ordinal + mi + slot) % generation.ideologyTypes.length])},
          personalityProfile:Object.assign({},stats,{
            learningAgility:clamp100(100 - Math.abs(70 - efficiency.accuracy) + ((ordinal + mi * 2 + slot * 3) % 13) - 6),
            stressTolerance:clamp100((stats.discipline + efficiency.crisis_handling + stats.empathy) / 3)
          }),
          profileDetails:{
            summary:summary,
            professionalBackground:professionalBackground,
            leadershipStyle:leadership,
            decisionMaking:profileText.decisionStyles[(ordinal + mi + slot) % profileText.decisionStyles.length],
            strengths:strengths,
            watchouts:watchouts,
            priorityAreas:priority.slice(),
            provenanceNotice:profileText.provenanceNotice
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