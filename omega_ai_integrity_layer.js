/**
 * OMEGA AI INTEGRITY LAYER v2.0.0
 * Offline minister cognition: identity-safe, evidence-grounded, contextual, conversational.
 *
 * Design rules:
 *  - Never invent a minister identity or world-state number.
 *  - Never answer every question with one canned paragraph.
 *  - Parse question intent + entities + requested operation.
 *  - Read a fresh, immutable snapshot for every turn.
 *  - Maintain bounded conversation memory for follow-up questions.
 *  - Separate verified facts, derived values, unknowns and recommendations.
 *  - Preserve the existing OmegaAIIntegrity API used by the UI.
 */
(function (global) {
  'use strict';

  const VERSION = '2.0.0';
  const MAX_HISTORY = 24;

  const ALIASES = Object.freeze({
    CRUDE_OIL: ['CRUDE_OIL','OIL','PETROLEUM','CRUDE','DIESEL','FUEL','তেল','অপরিশোধিত তেল','পেট্রোলিয়াম','জ্বালানি'],
    NATURAL_GAS: ['NATURAL_GAS','GAS','LNG','METHANE','NATURAL GAS','গ্যাস','প্রাকৃতিক গ্যাস','এলএনজি','মিথেন'],
    RARE_EARTHS: ['RARE_EARTH','RARE_EARTHS','REE','RARE EARTH ELEMENTS','বিরল মাটি','রেয়ার আর্থ','দুর্লভ খনিজ','বিরল মৃত্তিকা'],
    URANIUM: ['URANIUM','ইউরেনিয়াম','পারমাণবিক জ্বালানি'],
    COAL: ['COAL','কয়লা','কোল'],
    COPPER: ['COPPER','তামা','কপার','তাম্র'],
    LITHIUM: ['LITHIUM','লিথিয়াম'],
    GOLD: ['GOLD','সোনা','স্বর্ণ','বুলিয়ন'],
    IRON_ORE: ['IRON ORE','IRON','STEEL','লোহা','ইস্পাত','লৌহ','আকরিক'],
    ELECTRICITY: ['ELECTRICITY','POWER','POWER GRID','GRID','MW','GW','বিদ্যুৎ','পাওয়ার গ্রিড','গ্রিড','মেগাওয়াট','গিগাওয়াট'],
    TREASURY: ['TREASURY','CASH','BUDGET','MONEY','কোষাগার','নগদ','বাজেট','অর্থ']
  });

  const INTENTS = Object.freeze([
    ['MINISTER_IDENTITY', /\b(what is your name|what's your name|whats your name|who are you|your name|your age|how old are you|your background|your identity|tell me about yourself|who is the minister)\b|তোমার নাম|আপনার নাম|নাম কী|কে তুমি|আপনি কে|তোমার বয়স|আপনার বয়স|বয়স কত|পরিচয়|ব্যাকগ্রাউন্ড|মন্ত্রীর পরিচয়/i],
    ['RESOURCE_SECURITY', /\b(secure|security|safe|stockpile|reserve|runway|shortage|supply security|buffer|depletion|how much.*left|how long.*last)\b|নিরাপদ|নিরাপত্তা|সুরক্ষিত|মজুদ|মজুত|রিজার্ভ|ঘাটতি|সরবরাহ|বাফার|ক্ষয়|কতদিন|কতটুকু বাকি/i],
    ['RESOURCE_STATUS', /\b(how much|how many|current|status|level|quantity|amount|inventory|stock)\b|কত আছে|বর্তমান অবস্থা|পরিমাণ|মজুদের পরিমাণ|স্টক|অবস্থা/i],
    ['RESOURCE_DISCOVERY', /\b(mine|mines|deposit|deposits|discovery|geological|basin|ore body|prospect)\b|খনি|খনিজ|ডিপোজিট|ভূতাত্ত্বিক|ভাণ্ডার|আবিষ্কার|বেসিন|আকরিক/i],
    ['PROCESSING', /\b(refine|refinery|refining|smelter|smelting|processing|capacity|throughput|conversion)\b|পরিশোধন|রিফাইনারি|স্মেল্টার|স্মেল্টিং|প্রক্রিয়াকরণ|সক্ষমতা|রূপান্তর/i],
    ['TRADE', /\b(import|imports|export|exports|trade|supplier|suppliers|tariff|tariffs|contract|offtake|sanction|shipping|route)\b|আমদানি|রপ্তানি|বাণিজ্য|সরবরাহকারী|শুল্ক|চুক্তি|নিষেধাজ্ঞা|জাহাজ|রুট/i],
    ['ENERGY', /\b(electricity|power|grid|megawatt|gigawatt|nuclear|solar|wind|blackout|baseload|generation|export.*power)\b|বিদ্যুৎ|পাওয়ার|গ্রিড|মেগাওয়াট|গিগাওয়াট|পারমাণবিক|সৌর|বায়ু|ব্ল্যাকআউট|বেসলোড|উৎপাদন/i],
    ['MACROECONOMICS', /\b(gdp|inflation|debt|treasury|budget|forex|foreign exchange|interest|growth|unemployment|revenue)\b|জিডিপি|মুদ্রাস্ফীতি|ঋণ|কোষাগার|বাজেট|বৈদেশিক মুদ্রা|সুদ|প্রবৃদ্ধি|বেকারত্ব|রাজস্ব/i],
    ['POLICY_RECOMMENDATION', /\b(should we|should i|what should|recommend|recommendation|what do you suggest|strategy|plan|policy|action|what can we do)\b|কী করা উচিত|কি করা উচিত|সুপারিশ|আপনার পরামর্শ|কী করতে পারি|কৌশল|পরিকল্পনা|নীতিমালা|পদক্ষেপ/i],
    ['GENERAL_STRATEGIC_QUERY', /.+/]
  ]);

  const text = v => String(v == null ? '' : v).trim();
  const lower = v => text(v).toLowerCase();
  const num = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const n = Number(v.replace(/,/g, '').replace(/%$/, '').trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  function normalize(value) {
    return text(value).normalize('NFKC').replace(/[?!,.:;'"(){}\[\]]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isBengali(value) { return /[\u0980-\u09FF]/.test(text(value)); }

  function get(root, paths) {
    for (const path of paths) {
      let value = root;
      let ok = true;
      for (const key of path.split('.')) {
        if (value == null || typeof value !== 'object' || !(key in value)) { ok = false; break; }
        value = value[key];
      }
      if (ok && value !== null && value !== undefined) return value;
    }
    return null;
  }

  function canonicalMinisterIdentity(input = {}) {
    const countryCode = text(input.countryCode || input.country || 'UNKNOWN').toUpperCase();
    const ministryId = text(input.ministryId || input.portfolioId || 'UNKNOWN').toUpperCase();
    const ministerId = text(input.ministerId || input.id || `${countryCode}:${ministryId}:UNKNOWN`);
    const name = text(input.ministerName || input.name || 'Minister (Identity Unresolved)');
    return Object.freeze({
      countryCode,
      countryName: text(input.countryName || input.country || 'Sovereign State'),
      ministryId,
      ministerId,
      name,
      role: text(input.ministerRole || input.role || 'Cabinet Minister'),
      age: num(input.age),
      background: text(input.background || ''),
      ideology: text(input.ideology || ''),
      efficiency: num(input.efficiency),
      profileSource: text(input.profileSource || 'RUNTIME_CANONICAL_IDENTITY')
    });
  }

  function detectIntent(question) {
    const q = normalize(question);
    for (const [intent, regex] of INTENTS) if (regex.test(q)) return { intent, confidence: intent === 'GENERAL_STRATEGIC_QUERY' ? 0.45 : 0.94 };
    return { intent: 'GENERAL_STRATEGIC_QUERY', confidence: 0.40 };
  }

  function findEntities(question) {
    const q = lower(question);
    return Object.keys(ALIASES).filter(key => ALIASES[key].some(alias => q.includes(lower(alias))));
  }

  function buildWorldSnapshot(input = {}) {
    const state = input.worldState || input.gameState || input.reservesData || {};
    const clone = value => {
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map(clone);
      const out = {};
      for (const key of Object.keys(value)) out[key] = clone(value[key]);
      return out;
    };
    return Object.freeze({
      version: VERSION,
      timestamp: Date.now(),
      countryCode: text(input.countryCode || state.countryCode || state.iso || 'UNKNOWN').toUpperCase(),
      resources: Object.freeze(clone(state.resources || state.resourceState || state.strategic_resources || {})),
      economy: Object.freeze(clone(state.economy || state.economic || {})),
      energy: Object.freeze(clone(state.energy || state.power || {})),
      logistics: Object.freeze(clone(state.logistics || state.infrastructure || {})),
      military: Object.freeze(clone(state.military || state.defense || {})),
      source: 'READ_ONLY_WORLDSTATE_SNAPSHOT'
    });
  }

  function findResource(snapshot, key) {
    const roots = [snapshot.resources, snapshot.energy, snapshot.economy];
    const candidates = [key, key.toLowerCase(), key.replace(/_/g, ' '), key.replace(/_/g, '')];
    for (const root of roots) {
      if (!root || typeof root !== 'object') continue;
      for (const candidate of candidates) if (Object.prototype.hasOwnProperty.call(root, candidate)) return root[candidate];
    }
    const serialized = JSON.stringify(snapshot).toLowerCase();
    const patterns = {
      CRUDE_OIL: ['oil','crude','petroleum'], NATURAL_GAS: ['gas','lng','methane'],
      RARE_EARTHS: ['rare earth','rare_earth','rareearth'], URANIUM: ['uranium'],
      COAL: ['coal'], COPPER: ['copper'], LITHIUM: ['lithium'], GOLD: ['gold'],
      IRON_ORE: ['iron','steel'], ELECTRICITY: ['electricity','power','grid']
    };
    const hits = patterns[key] || [];
    if (hits.some(h => serialized.includes(h))) {
      for (const root of roots) {
        if (!root || typeof root !== 'object') continue;
        for (const [k, v] of Object.entries(root)) if (hits.some(h => lower(k).includes(h))) return v;
      }
    }
    return null;
  }

  function analyseResource(snapshot, key) {
    const raw = findResource(snapshot, key);
    const facts = [], derived = [], unknown = [];
    const read = paths => num(get(raw, paths));
    const stock = read(['stockpile','stock','inventory','quantity','available','currentStock','strategicStockpile','value']);
    const demand = read(['dailyDemand','demandPerDay','dailyConsumption','consumptionPerDay','netDailyDemand','dailyUse']);
    const production = read(['dailyProduction','productionPerDay','domesticProduction','extractionPerDay','production.daily','outputPerDay']);
    const imports = read(['dailyImports','importsPerDay','importRate']);
    const exports = read(['dailyExports','exportsPerDay','exportRate']);
    const capacity = read(['capacity','storageCapacity','productionCapacity','dailyCapacity']);
    const purity = read(['purity','quality']);
    const accessibility = read(['accessibility']);

    if (stock !== null) facts.push({ metric: `${key}.stockpile`, value: stock, status: 'VERIFIED_FACT' }); else unknown.push(`${key}.stockpile`);
    if (demand !== null) facts.push({ metric: `${key}.dailyDemand`, value: demand, status: 'VERIFIED_FACT' });
    if (production !== null) facts.push({ metric: `${key}.domesticProduction`, value: production, status: 'VERIFIED_FACT' });
    if (imports !== null) facts.push({ metric: `${key}.dailyImports`, value: imports, status: 'VERIFIED_FACT' });
    if (exports !== null) facts.push({ metric: `${key}.dailyExports`, value: exports, status: 'VERIFIED_FACT' });
    if (capacity !== null) facts.push({ metric: `${key}.capacity`, value: capacity, status: 'VERIFIED_FACT' });
    if (purity !== null) facts.push({ metric: `${key}.purity`, value: purity, status: 'VERIFIED_FACT' });
    if (accessibility !== null) facts.push({ metric: `${key}.accessibility`, value: accessibility, status: 'VERIFIED_FACT' });

    if (stock !== null && demand !== null) {
      const netBurn = Math.max(0, demand - (production || 0) - (imports || 0) + (exports || 0));
      if (netBurn > 0) derived.push({ metric: `${key}.runwayDays`, value: Number((stock / netBurn).toFixed(2)), status: 'DERIVED', equation: 'stockpile / max(0, dailyDemand - domesticProduction - imports + exports)' });
      else derived.push({ metric: `${key}.runwayDays`, value: Infinity, status: 'DERIVED', equation: 'net burn <= 0; stockpile is not being depleted under current flows' });
    } else unknown.push(`${key}.runwayDays`);

    if (capacity !== null && stock !== null && capacity > 0) derived.push({ metric: `${key}.storageUtilization`, value: Number((stock / capacity).toFixed(4)), status: 'DERIVED', equation: 'stockpile / capacity' });
    return { key, facts, derived, unknown, rawAvailable: raw !== null };
  }

  function extractQuestionTarget(question, history = []) {
    const currentEntities = findEntities(question);
    if (currentEntities.length) return currentEntities;
    const previous = history.slice().reverse().find(turn => Array.isArray(turn.entities) && turn.entities.length);
    return previous ? previous.entities.slice() : [];
  }

  function buildAnswerPlan(question, identityInput = {}, worldInput = {}, history = []) {
    const identity = canonicalMinisterIdentity(identityInput);
    const snapshot = buildWorldSnapshot({ ...worldInput, countryCode: identity.countryCode });
    const routing = detectIntent(question);
    const entities = extractQuestionTarget(question, history);
    const analyses = entities.map(key => analyseResource(snapshot, key));
    const facts = analyses.flatMap(a => a.facts);
    const derived = analyses.flatMap(a => a.derived);
    const unknown = analyses.flatMap(a => a.unknown);
    const bn = isBengali(question);

    let operation = 'EXPLAIN';
    if (routing.intent === 'MINISTER_IDENTITY') operation = 'IDENTITY';
    else if (routing.intent === 'RESOURCE_SECURITY') operation = 'SECURITY';
    else if (routing.intent === 'RESOURCE_STATUS') operation = 'STATUS';
    else if (routing.intent === 'RESOURCE_DISCOVERY') operation = 'DISCOVERY';
    else if (routing.intent === 'PROCESSING') operation = 'PROCESSING';
    else if (routing.intent === 'TRADE') operation = 'TRADE';
    else if (routing.intent === 'ENERGY') operation = 'ENERGY';
    else if (routing.intent === 'MACROECONOMICS') operation = 'MACRO';
    else if (routing.intent === 'POLICY_RECOMMENDATION') operation = 'POLICY';

    return Object.freeze({
      version: VERSION,
      identity,
      snapshot,
      routing,
      operation,
      entities,
      analyses,
      facts,
      derived,
      unknown,
      language: bn ? 'bn' : 'en',
      question: text(question),
      generatedBy: 'OMEGA_OFFLINE_CONTEXTUAL_COGNITION'
    });
  }

  function formatNumber(value) {
    if (value === Infinity) return 'not currently depleting';
    if (typeof value !== 'number') return String(value);
    return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function label(key, bn) {
    const names = {
      CRUDE_OIL: ['crude oil','অপরিশোধিত তেল'], NATURAL_GAS: ['natural gas','প্রাকৃতিক গ্যাস'], RARE_EARTHS: ['rare-earth materials','রেয়ার-আর্থ উপাদান'],
      URANIUM: ['uranium','ইউরেনিয়াম'], COAL: ['coal','কয়লা'], COPPER: ['copper','তামা'], LITHIUM: ['lithium','লিথিয়াম'],
      GOLD: ['gold','সোনা'], IRON_ORE: ['iron/steel materials','লোহা/ইস্পাত উপাদান'], ELECTRICITY: ['electricity','বিদ্যুৎ']
    };
    return (names[key] || [key.toLowerCase().replace(/_/g,' '), key])[bn ? 1 : 0];
  }

  function compose(plan) {
    const { identity, operation, entities, analyses, facts, derived, unknown, language: lang, question } = plan;
    const bn = lang === 'bn';

    if (operation === 'IDENTITY') {
      let out = bn
        ? `আমি ${identity.name}। আমি ${identity.countryName}-এর ${identity.role} হিসেবে দায়িত্ব পালন করছি।`
        : `I am ${identity.name}. I serve as ${identity.role} for ${identity.countryName}.`;
      if (identity.age !== null) out += bn ? ` আমার বয়স ${identity.age} বছর।` : ` My recorded age is ${identity.age}.`;
      if (identity.background) out += bn ? ` আমার পেশাগত পটভূমি: ${identity.background}.` : ` My recorded professional background is ${identity.background}.`;
      return out;
    }

    if (!entities.length) {
      if (operation === 'ENERGY') return bn
        ? 'আপনার প্রশ্নটি বিদ্যুৎ ও গ্রিড-সংক্রান্ত। কিন্তু অফলাইন প্রমাণ-গেটওয়েতে এই মুহূর্তে পর্যাপ্ত গ্রিড টেলিমেট্রি নেই। তাই উৎপাদন, উদ্বৃত্ত বা রপ্তানির পরিমাণ বানিয়ে বলা হবে না।'
        : 'Your question concerns the power system. The offline evidence gateway does not currently expose enough grid telemetry to establish generation, surplus or export capacity. I will not manufacture those figures.';
      if (operation === 'MACRO') return bn
        ? 'এটি সামষ্টিক অর্থনীতির প্রশ্ন। বর্তমান অফলাইন snapshot-এ প্রয়োজনীয় অর্থনৈতিক সূচক সম্পূর্ণ নেই, তাই নির্দিষ্ট সংখ্যা অনুমান করে বলা নিরাপদ নয়।'
        : 'This is a macroeconomic question. The current offline snapshot does not expose enough economic indicators for a defensible numerical answer, so I will not invent one.';
      if (operation === 'POLICY') return bn
        ? 'নীতি নির্ধারণের আগে কোন সমস্যা, কোন সম্পদ বা কোন সীমাবদ্ধতা নিয়ে সিদ্ধান্ত নিতে হবে তা নির্দিষ্ট করা দরকার। বর্তমান telemetry থেকে প্রমাণিত সীমাবদ্ধতা ছাড়া আমি কাল্পনিক policy recommendation দেব না।'
        : 'Before recommending a policy, I need a concrete problem, resource or constraint. I will not turn missing telemetry into a fictional policy recommendation.';
      return bn
        ? `আপনি জিজ্ঞেস করেছেন: “${question}”। প্রশ্নটি বুঝেছি, কিন্তু এর উত্তর দেওয়ার মতো নির্দিষ্ট offline evidence এখনো পাওয়া যাচ্ছে না।`
        : `You asked: “${question}”. I understand the question, but the offline evidence available to me is not sufficient for a defensible specific answer.`;
    }

    const lines = [];
    const opening = bn
      ? `${identity.name} হিসেবে আমার মূল্যায়নটি বর্তমান ${identity.countryName} state snapshot-এর উপর ভিত্তি করে।`
      : `My assessment as ${identity.name} is grounded in the current ${identity.countryName} state snapshot.`;
    lines.push(opening);

    if (operation === 'SECURITY' || operation === 'STATUS') {
      analyses.forEach(a => {
        const name = label(a.key, bn);
        const stock = a.facts.find(f => f.metric.endsWith('.stockpile'));
        const demand = a.facts.find(f => f.metric.endsWith('.dailyDemand'));
        const production = a.facts.find(f => f.metric.endsWith('.domesticProduction'));
        const runway = a.derived.find(d => d.metric.endsWith('.runwayDays'));
        if (stock) lines.push(bn ? `${name}-এর মজুদ ${formatNumber(stock.value)}।` : `The recorded ${name} stockpile is ${formatNumber(stock.value)}.`);
        else lines.push(bn ? `${name}-এর মজুদের নির্ভরযোগ্য সংখ্যা snapshot-এ নেই।` : `A reliable ${name} stockpile figure is not exposed by the snapshot.`);
        if (demand) lines.push(bn ? `দৈনিক চাহিদা ${formatNumber(demand.value)}।` : `Recorded daily demand is ${formatNumber(demand.value)}.`);
        if (production) lines.push(bn ? `দেশীয় উৎপাদন ${formatNumber(production.value)}।` : `Recorded domestic production is ${formatNumber(production.value)}.`);
        if (runway) lines.push(runway.value === Infinity
          ? (bn ? 'বর্তমান প্রবাহে মজুদ ক্ষয় হচ্ছে না।' : 'Under the recorded flows, the stockpile is not currently being depleted.')
          : (bn ? `হিসাব অনুযায়ী runway প্রায় ${formatNumber(runway.value)} দিন। এটি একটি derived result, নিরাপত্তার গ্যারান্টি নয়।` : `The calculated runway is about ${formatNumber(runway.value)} days. That is a derived result, not a guarantee of security.`));
      });
    } else if (operation === 'POLICY') {
      lines.push(bn ? 'আমি প্রথমে প্রমাণিত দুর্বলতাগুলো আলাদা করছি, তারপর policy option-এর কথা বলছি।' : 'I am separating proven weaknesses from policy options before making a recommendation.');
      if (unknown.length) lines.push(bn ? `সবচেয়ে গুরুত্বপূর্ণ অনুপস্থিত তথ্য: ${unknown.join(', ')}।` : `The most important missing inputs are: ${unknown.join(', ')}.`);
      if (derived.length) lines.push(bn ? `বর্তমান হিসাবের মধ্যে ${derived.map(d => `${d.metric}=${formatNumber(d.value)}`).join(', ')} আছে।` : `Current derived metrics include ${derived.map(d => `${d.metric}=${formatNumber(d.value)}`).join(', ')}.`);
      lines.push(bn ? 'অতএব এখনই বড় policy commitment-এর বদলে missing telemetry পূরণ, ঝুঁকি মাপা এবং বিকল্পগুলোর তুলনা করাই defensible next step।' : 'Therefore the defensible next step is to complete missing telemetry, quantify risk and compare alternatives before committing major policy resources.');
    } else {
      analyses.forEach(a => {
        const name = label(a.key, bn);
        const known = a.facts.length;
        lines.push(bn ? `${name} সম্পর্কে ${known}টি প্রমাণিত data point পাওয়া গেছে।` : `I found ${known} grounded data point${known === 1 ? '' : 's'} for ${name}.`);
        if (a.derived.length) lines.push(bn ? `সেখান থেকে ${a.derived.map(d => `${d.metric}: ${formatNumber(d.value)}`).join(', ')} হিসাব করা যায়।` : `From those inputs I can derive ${a.derived.map(d => `${d.metric}: ${formatNumber(d.value)}`).join(', ')}.`);
      });
    }

    if (unknown.length) lines.push(bn ? `যে তথ্যগুলো অনুপস্থিত, সেগুলোকে আমি অজানা হিসেবেই রাখছি: ${unknown.join(', ')}।` : `I am treating these missing inputs as unknown rather than filling them with assumptions: ${unknown.join(', ')}.`);
    return lines.join('\n\n');
  }

  const conversationStore = new Map();
  function conversationKey(identity) { return `${identity.countryCode}:${identity.ministryId}:${identity.ministerId}`; }
  function getHistory(identity) { return conversationStore.get(conversationKey(identity)) || []; }
  function remember(identity, plan, answer) {
    const key = conversationKey(identity);
    const history = getHistory(identity).slice(-MAX_HISTORY + 1);
    history.push({ question: plan.question, intent: plan.routing.intent, operation: plan.operation, entities: plan.entities.slice(), answer, timestamp: Date.now() });
    conversationStore.set(key, history);
  }

  function resolveActiveIdentity(ui) {
    const active = ui && ui.currentInterrogatedMinister ? ui.currentInterrogatedMinister : {};
    const game = global.Game || {};
    const country = game.currentActiveCountry;
    const countryKey = typeof country === 'string' ? country : (country && (country.iso || country.code || country.name));
    let profile = null;
    try {
      if (ui && typeof ui.getMinisterProfile === 'function') profile = ui.getMinisterProfile(active.ministryId || active.id, countryKey);
    } catch (_) {}
    return canonicalMinisterIdentity({
      countryCode: (country && (country.iso || country.code)) || active.countryCode || game.countryCode,
      countryName: (country && (country.name || country.countryName)) || active.countryName,
      ministryId: active.ministryId || active.portfolioId || active.id,
      ministerId: (profile && profile.id) || active.ministerId || active.id,
      ministerName: (profile && profile.name) || active.name || active.ministerName,
      ministerRole: (profile && profile.role) || active.role || active.ministerRole,
      age: profile && profile.age,
      background: profile && profile.background,
      ideology: profile && profile.ideology,
      efficiency: profile && profile.efficiency,
      profileSource: profile ? 'MINISTRY_PROFILE_RESOLVER' : 'RUNTIME_ACTIVE_MINISTER'
    });
  }

  function answer(question, ui) {
    const identity = resolveActiveIdentity(ui);
    const history = getHistory(identity);
    const worldState = {
      countryCode: identity.countryCode,
      worldState: global.Game && global.Game.worldState,
      gameState: global.Game && global.Game.state,
      reservesData: global.Game && (global.Game.resources || global.Game.resourceState)
    };
    const plan = buildAnswerPlan(question, identity, worldState, history);
    const response = compose(plan);
    remember(identity, plan, response);
    global.__OMEGA_LAST_AI_PLAN__ = plan;
    global.__OMEGA_AI_CONVERSATION__ = getHistory(identity);
    return response;
  }

  const API = Object.freeze({
    VERSION,
    canonicalMinisterIdentity,
    normalize,
    detectIntent,
    findEntities,
    buildWorldSnapshot,
    analyseResource,
    buildAnswerPlan,
    formatOfflineAnswer: compose,
    answer,
    getConversationHistory: identity => getHistory(canonicalMinisterIdentity(identity))
  });

  global.OmegaAIIntegrity = API;
  global.__OMEGA_AI_INTEGRITY__ = { version: VERSION, installedAt: Date.now(), api: API };

  function installBridge() {
    const ui = global.OmegaCabinetUI;
    if (!ui || ui.__integrityBridgeInstalled) return false;
    ui.__integrityBridgeInstalled = true;
    const original = ui.thinkMinisterQuestion;
    ui.thinkMinisterQuestion = function (question, ...rest) {
      try { return answer(question, this); }
      catch (error) {
        console.warn('[OMEGA AI Integrity] contextual bridge failed:', error);
        return typeof original === 'function' ? original.call(this, question, ...rest) : 'Offline cognitive subsystem could not produce an answer.';
      }
    };
    ui.__omegaOfflineAnswer = question => answer(question, ui);
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (installBridge() || attempts >= 150) clearInterval(timer);
  }, 100);
  installBridge();
})(typeof window !== 'undefined' ? window : globalThis);
