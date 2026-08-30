/**
 * MINISTER QUERY ROUTER v3.0.0
 * Deep offline semantic routing, entity resolution, data retrieval and bounded language learning.
 *
 * Pipeline:
 *   text -> language -> intent -> country entity -> resource entity -> operation
 *        -> dataset resolver -> evidence -> derived result -> response contract
 *
 * Hard rule: this layer never invents world-state facts. It may infer structure,
 * but numerical claims must come from the supplied runtime datasets or explicit
 * deterministic calculations over those datasets.
 */
(function (global) {
  'use strict';

  const VERSION = '3.0.0';
  const MAX_LEARNED = 512;

  const QueryIntent = Object.freeze({
    MINISTER_IDENTITY: 'MINISTER_IDENTITY',
    RESOURCE_SECURITY: 'RESOURCE_SECURITY',
    RESOURCE_STATUS: 'RESOURCE_STATUS',
    RESOURCE_MINING_DISCOVERY: 'RESOURCE_MINING_DISCOVERY',
    RESOURCE_PROCESSING_REFINING: 'RESOURCE_PROCESSING_REFINING',
    RESOURCE_TRADE_TARIFF: 'RESOURCE_TRADE_TARIFF',
    RESOURCE_LOGISTICS: 'RESOURCE_LOGISTICS',
    RESOURCE_FORECAST: 'RESOURCE_FORECAST',
    MACROECONOMICS: 'MACROECONOMICS',
    DEMOGRAPHICS: 'DEMOGRAPHICS',
    DEFENSE_MILITARY: 'DEFENSE_MILITARY',
    ENERGY_POWER: 'ENERGY_POWER',
    POLICY_DIRECTIVE: 'POLICY_DIRECTIVE',
    GENERAL_STRATEGIC: 'GENERAL_STRATEGIC',
    UNKNOWN: 'UNKNOWN'
  });

  const RESOURCE_ENTITY_DICTIONARY = {
    oil: { id: 'CRUDE_OIL', category: 'HYDROCARBON', names: ['oil','petroleum','crude oil','crude','তেল','পেট্রোলিয়াম','অপরিশোধিত তেল'] },
    gas: { id: 'NATURAL_GAS', category: 'HYDROCARBON', names: ['gas','natural gas','lng','methane','গ্যাস','প্রাকৃতিক গ্যাস','এলএনজি','মিথেন'] },
    coal: { id: 'COAL', category: 'SOLID_MINERAL', names: ['coal','কয়লা','কোল'] },
    iron: { id: 'IRON_ORE', category: 'METALLIC_MINERAL', names: ['iron ore','iron','hematite','magnetite','লোহা','লৌহ','লোহা আকরিক','আকরিক'] },
    steel: { id: 'STEEL', category: 'PROCESSED_MATERIAL', names: ['steel','ইস্পাত'] },
    copper: { id: 'COPPER', category: 'BASE_METAL', names: ['copper','তামা','কপার','তাম্র'] },
    lithium: { id: 'LITHIUM', category: 'CRITICAL_MINERAL', names: ['lithium','লিথিয়াম'] },
    rare_earth: { id: 'RARE_EARTHS', category: 'CRITICAL_MINERAL', names: ['rare earth','rare-earth','rare earths','ree','lanthanide','রেয়ার আর্থ','বিরল মৃত্তিকা','বিরল খনিজ'] },
    uranium: { id: 'URANIUM', category: 'NUCLEAR', names: ['uranium','ইউরেনিয়াম','পারমাণবিক জ্বালানি'] },
    bauxite: { id: 'BAUXITE', category: 'MINERAL', names: ['bauxite','বক্সাইট'] },
    gold: { id: 'GOLD', category: 'PRECIOUS_METAL', names: ['gold','bullion','সোনা','স্বর্ণ','বুলিয়ন'] }
  };

  const COUNTRY_ALIASES = {
    BGD: ['bangladesh','bd','bgd','বাংলাদেশ','বাংলাদেশে','বাংলাদেশের'],
    IND: ['india','ind','ভারত','ভারতের'],
    CHN: ['china','chn','চীন','চীনের'],
    USA: ['usa','united states','america','যুক্তরাষ্ট্র','আমেরিকা'],
    RUS: ['russia','rus','রাশিয়া','রাশিয়ার','রাশিয়ার'],
    SAU: ['saudi arabia','saudi','sau','সৌদি আরব','সৌদি'],
    AUS: ['australia','aus','অস্ট্রেলিয়া'],
    CHL: ['chile','chl','চিলি'],
    COD: ['democratic republic of the congo','dr congo','congo','cod','কঙ্গো']
  };

  const OPERATION_PATTERNS = {
    COUNT: [/\b(how many|number of|count|total number|how much number)\b/i, /কয়টি|কতটি|কতগুলো|কতগুলি|সংখ্যা কত|মোট কত/i],
    LIST: [/\b(list|show me|which|what are the|name the)\b/i, /তালিকা|দেখাও|কোনগুলো|কি কি|কী কী|নামগুলো/i],
    LOCATION: [/\b(where|location|located|sites? where)\b/i, /কোথায়|কোথায়|অবস্থান|কোন এলাকায়|কোন অঞ্চলে/i],
    STATUS: [/\b(status|current|available|present|inventory|stock|reserve)\b/i, /অবস্থা|বর্তমান|মজুদ|মজুত|রিজার্ভ|কত আছে|উপস্থিত/i],
    SECURITY: [/\b(secure|security|safe|supply security|runway|shortage|depletion)\b/i, /নিরাপদ|নিরাপত্তা|সুরক্ষিত|সরবরাহ নিরাপত্তা|কতদিন চলবে|ঘাটতি|ক্ষয়|ক্ষয়/i]
  };

  const MINE_KEYS = new Set([
    'mine','mines','mineSite','mineSites','miningSite','miningSites','mine_sites','mining_sites',
    'deposit','deposits','depositSite','depositSites','depositsRegistry','geocodedMines','geocoded_mines',
    'mineralDeposits','mineral_deposits','oreDeposits','ore_deposits','quarries','quarrySites','fields','oilFields','gasFields'
  ]);

  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;'"(){}\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const isBn = v => /[\u0980-\u09FF]/.test(text(v));

  function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(deepClone);
    const o = {};
    Object.keys(v).forEach(k => { o[k] = deepClone(v[k]); });
    return o;
  }

  function own(obj, key) { return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key); }

  function flatten(root, path = [], out = []) {
    if (root === null || root === undefined) return out;
    if (Array.isArray(root)) {
      root.forEach((v, i) => flatten(v, path.concat(String(i)), out));
      return out;
    }
    if (typeof root !== 'object') return out;
    for (const [k, v] of Object.entries(root)) {
      const p = path.concat(k);
      out.push({ path: p, key: k, value: v });
      if (v && typeof v === 'object') flatten(v, p, out);
    }
    return out;
  }

  function loadRuntimeLexicon() {
    const candidates = [global.OFFLINE_LEXICON, global.OfflineLexicon, global.OMEGA_OFFLINE_LEXICON, global.OmegaLexicon];
    return candidates.find(v => v && typeof v === 'object') || null;
  }

  function enrichAliasesFromLexicon() {
    const lex = loadRuntimeLexicon();
    if (!lex) return;
    const serialized = JSON.stringify(lex).toLowerCase();
    for (const def of Object.values(RESOURCE_ENTITY_DICTIONARY)) {
      if (!serialized.includes(def.id.toLowerCase())) continue;
      const variants = [];
      const walk = v => {
        if (!v || typeof v !== 'object') return;
        for (const [k, x] of Object.entries(v)) {
          if (typeof x === 'string' && (x.toLowerCase().includes(def.id.toLowerCase()) || def.names.some(n => x.toLowerCase() === n.toLowerCase()))) variants.push(x);
          else if (x && typeof x === 'object') walk(x);
        }
      };
      walk(lex);
      variants.slice(0, 32).forEach(v => { if (!def.names.includes(v)) def.names.push(v); });
    }
  }

  function detectLanguage(q) { return isBn(q) ? 'bn' : 'en'; }

  function resolveCountry(query, explicitContext = {}) {
    const q = norm(query);
    const explicit = text(explicitContext.countryId || explicitContext.countryCode || explicitContext.iso).toUpperCase();
    if (/^[A-Z]{3}$/.test(explicit)) return { id: explicit, confidence: 1, source: 'EXPLICIT_CONTEXT' };
    for (const [id, aliases] of Object.entries(COUNTRY_ALIASES)) {
      if (aliases.some(a => q.includes(norm(a)))) return { id, confidence: 0.99, source: 'COUNTRY_ALIAS_GRAPH' };
    }
    const countries = global.COUNTRIES || global.countriesData || global.COUNTRY_DATA || global.Game?.countries;
    if (countries && typeof countries === 'object') {
      for (const [key, value] of Object.entries(countries)) {
        const blob = norm(JSON.stringify(value));
        if (blob && blob.includes(q) && q.length > 2) return { id: key.toUpperCase(), confidence: 0.70, source: 'COUNTRY_DATASET' };
      }
    }
    return { id: explicit || null, confidence: 0, source: 'UNRESOLVED' };
  }

  function resolveResource(query, explicitContext = {}) {
    enrichAliasesFromLexicon();
    const q = norm(query);
    const explicit = text(explicitContext.resourceId || explicitContext.resource_id).toUpperCase();
    if (explicit) return { id: explicit, confidence: 1, source: 'EXPLICIT_CONTEXT' };
    const hits = [];
    for (const def of Object.values(RESOURCE_ENTITY_DICTIONARY)) {
      const score = def.names.reduce((s, a) => q.includes(norm(a)) ? Math.max(s, norm(a).length) : s, 0);
      if (score) hits.push({ id: def.id, confidence: Math.min(0.99, 0.60 + score / 100), source: 'RESOURCE_ALIAS_GRAPH', score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits[0] || { id: null, confidence: 0, source: 'UNRESOLVED' };
  }

  function detectIntent(q) {
    const n = norm(q);
    if (/what is your name|what's your name|who are you|your name|your age|your background|tell me about yourself|আপনার নাম|তোমার নাম|কে তুমি|আপনি কে|বয়স কত|বয়স কত|পরিচয়|পরিচয়/.test(n)) return QueryIntent.MINISTER_IDENTITY;
    if (OPERATION_PATTERNS.COUNT.some(r => r.test(q)) && (/mine|mines|deposit|deposits|quarry|field|খনি|ডিপোজিট|ক্ষেত্র|রিসোর্স|resource/.test(n))) return QueryIntent.RESOURCE_MINING_DISCOVERY;
    if (OPERATION_PATTERNS.SECURITY.some(r => r.test(q))) return QueryIntent.RESOURCE_SECURITY;
    if (/refin|smelt|processing|পরিশোধন|স্মেল্ট|প্রক্রিয়াকরণ|প্রক্রিয়াকরণ/.test(n)) return QueryIntent.RESOURCE_PROCESSING_REFINING;
    if (/import|export|trade|tariff|supplier|contract|আমদানি|রপ্তানি|বাণিজ্য|শুল্ক|সরবরাহকারী|চুক্তি/.test(n)) return QueryIntent.RESOURCE_TRADE_TARIFF;
    if (/gdp|inflation|debt|treasury|budget|forex|economy|জিডিপি|মুদ্রাস্ফীতি|ঋণ|কোষাগার|বাজেট|অর্থনীতি/.test(n)) return QueryIntent.MACROECONOMICS;
    if (/population|birth rate|demographic|workforce|জনসংখ্যা|জন্মহার|জনমিতি|শ্রমশক্তি/.test(n)) return QueryIntent.DEMOGRAPHICS;
    if (/military|army|navy|air force|weapon|defense|সেনাবাহিনী|নৌবাহিনী|বিমানবাহিনী|অস্ত্র|প্রতিরক্ষা/.test(n)) return QueryIntent.DEFENSE_MILITARY;
    if (/electricity|power grid|megawatt|nuclear power|বিদ্যুৎ|পাওয়ার গ্রিড|পাওয়ার গ্রিড|মেগাওয়াট|পারমাণবিক বিদ্যুৎ/.test(n)) return QueryIntent.ENERGY_POWER;
    if (/should|recommend|strategy|policy|plan|action|কী করা উচিত|কি করা উচিত|সুপারিশ|কৌশল|নীতিমালা|পরিকল্পনা/.test(n)) return QueryIntent.POLICY_DIRECTIVE;
    return QueryIntent.GENERAL_STRATEGIC;
  }

  function detectOperation(q) {
    for (const [op, patterns] of Object.entries(OPERATION_PATTERNS)) if (patterns.some(r => r.test(q))) return op;
    return 'EXPLAIN';
  }

  function getDatasetCandidates(countryContext = {}) {
    const explicit = [countryContext.dataset, countryContext.countryProfile, countryContext.resources, countryContext.resourceData].filter(Boolean);
    const globals = [
      global.GSRSK_Master_CountryProfiles_v14,
      global.GSRSK_MASTER_RESOURCE_REPOSITORY,
      global.ResourceDatabase,
      global.ResourcesDatabase,
      global.Game?.worldState,
      global.Game?.state,
      global.Game?.resources,
      global.Game?.resourceState
    ].filter(Boolean);
    return explicit.concat(globals);
  }

  function unwrapCountry(dataset, countryId) {
    if (!dataset || typeof dataset !== 'object') return null;
    const profiles = dataset.countryProfiles || dataset.country_profiles || dataset.countries || dataset.countryData;
    if (profiles && typeof profiles === 'object') {
      for (const key of [countryId, countryId.toLowerCase(), countryId.toUpperCase()]) if (own(profiles, key)) return profiles[key];
      for (const [key, value] of Object.entries(profiles)) {
        const blob = norm(JSON.stringify(value));
        if (blob.includes(norm(countryId))) return value;
      }
    }
    if (own(dataset, countryId)) return dataset[countryId];
    if (own(dataset, countryId.toLowerCase())) return dataset[countryId.toLowerCase()];
    if (own(dataset, countryId.toUpperCase())) return dataset[countryId.toUpperCase()];
    return dataset;
  }

  function resourceMatches(path, value, resourceId) {
    const blob = norm(path.join(' ') + ' ' + (typeof value === 'string' ? value : JSON.stringify(value || {})));
    const aliases = Object.values(RESOURCE_ENTITY_DICTIONARY).find(x => x.id === resourceId)?.names || [];
    return aliases.some(a => blob.includes(norm(a))) || blob.includes(norm(resourceId).replace(/_/g, ' '));
  }

  function countMineLike(v) {
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
    return null;
  }

  function findMiningEvidence(country, resourceId) {
    const flat = flatten(country);
    const matches = [];
    for (const item of flat) {
      const keyLower = item.key.toLowerCase();
      const isMineKey = MINE_KEYS.has(item.key) || /mine|deposit|quarry|field|geocoded/.test(keyLower);
      if (!isMineKey) continue;
      if (resourceId && !resourceMatches(item.path, item.value, resourceId)) continue;
      const count = countMineLike(item.value);
      if (count !== null) matches.push({ path: item.path.join('.'), key: item.key, count, evidence: 'DATASET_NODE' });
    }
    return matches;
  }

  function findResourceNodes(country, resourceId) {
    const flat = flatten(country);
    return flat.filter(item => resourceMatches(item.path, item.value, resourceId)).slice(0, 200);
  }

  function resolveKnowledgeQuery(query, context = {}) {
    const language = detectLanguage(query);
    const country = resolveCountry(query, context);
    const resource = resolveResource(query, context);
    const intent = detectIntent(query);
    const operation = detectOperation(query);
    const candidates = getDatasetCandidates(context);
    let countryData = null;
    let datasetSource = null;
    for (const dataset of candidates) {
      const found = unwrapCountry(dataset, country.id);
      if (found && typeof found === 'object') { countryData = found; datasetSource = dataset; break; }
    }

    const evidence = [];
    let result = null;
    let resultType = 'UNKNOWN';

    if (countryData && intent === QueryIntent.RESOURCE_MINING_DISCOVERY) {
      const nodes = findMiningEvidence(countryData, resource.id);
      const total = nodes.reduce((sum, x) => sum + x.count, 0);
      if (nodes.length) {
        result = total;
        resultType = 'COUNT';
        evidence.push(...nodes);
      }
    }

    if (countryData && resource.id && (intent === QueryIntent.RESOURCE_STATUS || intent === QueryIntent.RESOURCE_SECURITY || intent === QueryIntent.GENERAL_STRATEGIC)) {
      const nodes = findResourceNodes(countryData, resource.id);
      if (nodes.length) {
        resultType = 'RESOURCE_NODES';
        evidence.push(...nodes.slice(0, 25).map(x => ({ path: x.path.join('.'), evidence: 'RESOURCE_NODE' })));
      }
    }

    return Object.freeze({
      version: VERSION,
      rawQuery: text(query),
      normalizedQuery: norm(query),
      language,
      intent,
      operation,
      country: Object.freeze(country),
      resource: Object.freeze(resource),
      result,
      resultType,
      evidence: Object.freeze(evidence),
      dataFound: !!countryData,
      datasetSource: datasetSource ? 'RUNTIME_DATASET' : 'NONE',
      confidence: Math.max(0, Math.min(1, (country.confidence * 0.35) + (resource.id ? resource.confidence * 0.30 : 0) + (countryData ? 0.20 : 0) + (evidence.length ? 0.15 : 0)))
    });
  }

  function buildResponseContract(query, context = {}) {
    const plan = resolveKnowledgeQuery(query, context);
    const bn = plan.language === 'bn';
    let textOut;

    if (plan.resultType === 'COUNT') {
      textOut = bn
        ? `${plan.country.id} দেশের ${plan.resource.id} সম্পর্কিত শনাক্তযোগ্য খনি/ডিপোজিট নোডের সংখ্যা ${plan.result}। এটি বর্তমান offline dataset থেকে গণনা করা ফল।`
        : `${plan.country.id} has ${plan.result} identifiable mine/deposit node(s) for ${plan.resource.id}. This count is calculated from the current offline dataset.`;
    } else if (!plan.dataFound) {
      textOut = bn
        ? `আমি ${plan.country.id || 'দেশটি'} শনাক্ত করেছি${plan.resource.id ? ` এবং ${plan.resource.id} resource-ও শনাক্ত করেছি` : ''}, কিন্তু বর্তমান runtime-এ সংশ্লিষ্ট country dataset পাইনি। তাই সংখ্যা বানিয়ে বলা হবে না।`
        : `I resolved ${plan.country.id || 'the country'}${plan.resource.id ? ` and ${plan.resource.id}` : ''}, but the corresponding country dataset is not available at runtime. I will not fabricate a number.`;
    } else if (!plan.evidence.length) {
      textOut = bn
        ? `দেশ ও resource শনাক্ত হয়েছে, কিন্তু প্রশ্নটির জন্য প্রয়োজনীয় প্রমাণিত data node পাওয়া যায়নি।`
        : `The country and resource were resolved, but the dataset exposes no evidence node sufficient for this question.`;
    } else {
      textOut = bn
        ? `দেশ: ${plan.country.id || 'অজানা'}। Resource: ${plan.resource.id || 'সাধারণ'}। প্রশ্নটি ${plan.intent} হিসেবে route হয়েছে এবং ${plan.evidence.length}টি evidence node পাওয়া গেছে।`
        : `Country: ${plan.country.id || 'unknown'}. Resource: ${plan.resource.id || 'general'}. The query routed to ${plan.intent} and ${plan.evidence.length} evidence node(s) were found.`;
    }

    return Object.freeze({ plan, text: textOut, grounded: plan.evidence.length > 0 || plan.resultType === 'COUNT' });
  }

  const learned = new Map();
  function loadLearning() {
    try {
      const raw = global.localStorage && global.localStorage.getItem('OMEGA_OFFLINE_LANGUAGE_LEARNING_V1');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) data.slice(-MAX_LEARNED).forEach(x => learned.set(x.phrase, x));
    } catch (_) {}
  }
  function persistLearning() {
    try {
      if (global.localStorage) global.localStorage.setItem('OMEGA_OFFLINE_LANGUAGE_LEARNING_V1', JSON.stringify(Array.from(learned.values()).slice(-MAX_LEARNED)));
    } catch (_) {}
  }
  function learn(phrase, mapping, confidence = 1) {
    const p = norm(phrase);
    if (!p || !mapping) return false;
    learned.set(p, { phrase: p, mapping: deepClone(mapping), confidence, learnedAt: Date.now() });
    while (learned.size > MAX_LEARNED) learned.delete(learned.keys().next().value);
    persistLearning();
    return true;
  }
  function recall(phrase) { return learned.get(norm(phrase)) || null; }
  loadLearning();

  const API = Object.freeze({
    VERSION,
    QueryIntent,
    RESOURCE_ENTITY_DICTIONARY,
    normalizeText: norm,
    detectLanguage,
    detectResourceEntities: q => Object.values(RESOURCE_ENTITY_DICTIONARY).filter(d => d.names.some(n => norm(q).includes(norm(n)))),
    detectIntent,
    resolveCountry,
    resolveResource,
    resolveKnowledgeQuery,
    buildResponseContract,
    learn,
    recall
  });

  global.MinisterQueryRouter = API;
  global.OMEGA_OFFLINE_SEMANTIC_ROUTER = API;

  function patchIntegrity() {
    const integrity = global.OmegaAIIntegrity;
    if (!integrity || integrity.__semanticRouterPatched) return !!integrity;
    const originalAnswer = integrity.answer;
    const originalPlan = integrity.buildAnswerPlan;
    const wrapped = function (question, ui) {
      const context = {
        countryId: ui && (ui.countryCode || ui.currentCountryCode),
        resourceId: ui && ui.resourceId,
        countryProfile: ui && ui.currentCountryProfile,
        resources: global.Game && (global.Game.resources || global.Game.resourceState),
        dataset: global.GSRSK_Master_CountryProfiles_v14 || global.GSRSK_MASTER_RESOURCE_REPOSITORY || (global.Game && global.Game.worldState)
      };
      const contract = buildResponseContract(question, context);
      if (contract.grounded || contract.plan.intent === QueryIntent.RESOURCE_MINING_DISCOVERY) return contract.text;
      return typeof originalAnswer === 'function' ? originalAnswer.call(this, question, ui) : contract.text;
    };
    Object.defineProperty(wrapped, '__semanticRouterPatched', { value: true });
    global.OmegaAIIntegrity = Object.assign({}, integrity, { answer: wrapped, __semanticRouterPatched: true, __semanticRouterVersion: VERSION });
    global.OmegaAIIntegrity.buildAnswerPlan = function (question, identity, world, history) {
      const base = typeof originalPlan === 'function' ? originalPlan.call(this, question, identity, world, history) : null;
      const semantic = buildResponseContract(question, { countryId: identity && identity.countryCode, countryProfile: world && world.worldState, dataset: world && (world.worldState || world.gameState) });
      return Object.freeze(Object.assign({}, base || {}, { semanticPlan: semantic.plan, semanticResponse: semantic.text }));
    };
    return true;
  }

  let tries = 0;
  const timer = global.setInterval ? global.setInterval(() => { tries++; if (patchIntegrity() || tries > 200) global.clearInterval(timer); }, 50) : null;
  patchIntegrity();
})(typeof window !== 'undefined' ? window : globalThis);
