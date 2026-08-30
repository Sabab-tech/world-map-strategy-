/**
 * OMEGA AI INTEGRITY LAYER v1.0
 *
 * Purpose:
 * - Establish one canonical minister identity.
 * - Build a read-only WorldState snapshot for cognition.
 * - Parse Bengali/English strategic questions without inventing facts.
 * - Separate observed facts, derived metrics, estimates and unknowns.
 * - Provide deterministic offline consultation for the most important resource/security queries.
 * - Expose a shared cognitive contract that online Gemini and offline cognition can consume.
 *
 * This module deliberately does NOT mutate WorldState and does NOT fabricate missing data.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const UNKNOWN = 'UNKNOWN';

  const ALIASES = Object.freeze({
    CRUDE_OIL: ['CRUDE_OIL', 'OIL', 'PETROLEUM', 'CRUDE', 'তেল', 'অপরিশোধিত তেল', 'পেট্রোলিয়াম'],
    NATURAL_GAS: ['NATURAL_GAS', 'GAS', 'LNG', 'METHANE', 'গ্যাস', 'প্রাকৃতিক গ্যাস', 'এলএনজি'],
    RARE_EARTHS: ['RARE_EARTH', 'RARE_EARTHS', 'REE', 'RARE EARTH ELEMENTS', 'বিরল মাটি', 'রেয়ার আর্থ', 'দুর্লভ খনিজ'],
    URANIUM: ['URANIUM', 'ইউরেনিয়াম'],
    COAL: ['COAL', 'কয়লা'],
    COPPER: ['COPPER', 'তামা'],
    LITHIUM: ['LITHIUM', 'লিথিয়াম'],
    GOLD: ['GOLD', 'সোনা', 'স্বর্ণ']
  });

  const INTENT_PATTERNS = [
    ['MINISTER_IDENTITY', /\b(name|who are you|your name|age|background|identity)\b|নাম কী|তোমার নাম|আপনার নাম|কে আপনি|বয়স|পরিচয়/i],
    ['RESOURCE_SECURITY', /\b(secure|security|safe|stockpile|reserve|runway|shortage|supply)\b|নিরাপদ|নিরাপত্তা|মজুদ|মজুত|রিজার্ভ|ঘাটতি|সরবরাহ|কতদিন/i],
    ['RESOURCE_DISCOVERY', /\b(mine|mines|deposit|deposits|discovery|geological|basin)\b|খনি|খনিজ|ডিপোজিট|ভূতাত্ত্বিক|ভাণ্ডার|আবিষ্কার/i],
    ['MACROECONOMICS', /\b(gdp|inflation|debt|treasury|budget|fx|foreign exchange)\b|জিডিপি|মুদ্রাস্ফীতি|ঋণ|কোষাগার|বাজেট|বৈদেশিক মুদ্রা/i],
    ['POLICY_RECOMMENDATION', /\b(should|recommend|recommendation|what should|policy|plan|strategy)\b|কী করা উচিত|সুপারিশ|নীতি|পরিকল্পনা|কৌশল/i]
  ];

  function normalise(value) {
    return String(value == null ? '' : value).trim();
  }

  function findEntity(text) {
    const source = normalise(text).toLowerCase();
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      if (aliases.some(alias => source.includes(alias.toLowerCase()))) return canonical;
    }
    return null;
  }

  function detectIntent(text) {
    const source = normalise(text);
    for (const [intent, pattern] of INTENT_PATTERNS) {
      if (pattern.test(source)) return { intent, confidence: 0.95 };
    }
    return { intent: 'GENERAL_STRATEGIC_QUERY', confidence: 0.45 };
  }

  function readPath(root, paths) {
    for (const path of paths) {
      let value = root;
      let found = true;
      for (const key of path.split('.')) {
        if (value == null || typeof value !== 'object' || !(key in value)) {
          found = false;
          break;
        }
        value = value[key];
      }
      if (found && value !== null && value !== undefined) return { value, path };
    }
    return { value: null, path: null };
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function firstNumber(root, paths) {
    const hit = readPath(root, paths);
    return { value: number(hit.value), path: hit.path };
  }

  function canonicalMinisterIdentity(input = {}) {
    const countryCode = normalise(input.countryCode || input.country || 'UNKNOWN').toUpperCase();
    const ministryId = normalise(input.ministryId || input.portfolioId || 'UNKNOWN').toUpperCase();
    const ministerId = normalise(input.ministerId || input.id || `${countryCode}:${ministryId}:UNKNOWN`);
    return Object.freeze({
      countryCode,
      countryName: normalise(input.countryName || input.country || 'Sovereign State'),
      ministryId,
      ministerId,
      name: normalise(input.ministerName || input.name || 'Minister (Identity Unresolved)'),
      role: normalise(input.ministerRole || input.role || 'Cabinet Minister'),
      profileSource: normalise(input.profileSource || 'RUNTIME_CANONICAL_IDENTITY')
    });
  }

  function buildWorldSnapshot(input = {}) {
    const source = input.worldState || input.gameState || input.reservesData || {};
    const countryCode = normalise(input.countryCode || source.countryCode || source.iso || 'UNKNOWN').toUpperCase();
    const economy = source.economy || source.economic || {};
    const resources = source.resources || source.resourceState || source.strategic_resources || {};
    const energy = source.energy || source.power || {};
    return Object.freeze({
      version: VERSION,
      timestamp: Date.now(),
      countryCode,
      economy: Object.freeze({ ...economy }),
      resources: Object.freeze({ ...resources }),
      energy: Object.freeze({ ...energy }),
      source: 'READ_ONLY_WORLDSTATE_SNAPSHOT'
    });
  }

  function resolveResource(snapshot, canonical) {
    const r = snapshot.resources || {};
    const candidates = [canonical, canonical.toLowerCase(), canonical.replace(/_/g, ''), canonical.replace(/_/g, ' '), canonical.replace(/_/g, '-')];
    for (const key of candidates) {
      if (Object.prototype.hasOwnProperty.call(r, key)) return r[key];
    }
    const flattened = JSON.stringify(r).toLowerCase();
    if (canonical === 'CRUDE_OIL' && flattened.includes('oil')) return r.oil || r.OIL || null;
    if (canonical === 'RARE_EARTHS' && (flattened.includes('rare') || flattened.includes('earth'))) return r.rareEarths || r.RARE_EARTHS || null;
    return null;
  }

  function extractStock(resource) {
    if (resource == null) return null;
    if (typeof resource === 'number') return resource;
    const hit = readPath(resource, [
      'stockpile', 'stock', 'inventory', 'quantity', 'available', 'currentStock',
      'reserves.stockpile', 'inventory.quantity', 'strategicStockpile'
    ]);
    return number(hit.value);
  }

  function extractDailyDemand(resource) {
    if (resource == null || typeof resource !== 'object') return null;
    const hit = readPath(resource, ['dailyDemand', 'demandPerDay', 'dailyConsumption', 'consumptionPerDay', 'netDailyDemand']);
    return number(hit.value);
  }

  function extractDomesticProduction(resource) {
    if (resource == null || typeof resource !== 'object') return null;
    const hit = readPath(resource, ['dailyProduction', 'productionPerDay', 'domesticProduction', 'extractionPerDay', 'production.daily']);
    return number(hit.value);
  }

  function evidence(metric, value, source, status, equation = 'DIRECT_OBSERVATION') {
    return Object.freeze({ metric, value, source, epistemicStatus: status, equation, timestamp: Date.now() });
  }

  function analyseResource(snapshot, canonical) {
    const resource = resolveResource(snapshot, canonical);
    const stock = extractStock(resource);
    const demand = extractDailyDemand(resource);
    const production = extractDomesticProduction(resource);
    const facts = [];
    const derived = [];
    const unknown = [];

    if (stock !== null) facts.push(evidence(`${canonical}.stockpile`, stock, 'WorldStateSnapshot', 'VERIFIED_FACT'));
    else unknown.push(`${canonical}.stockpile`);

    if (demand !== null) facts.push(evidence(`${canonical}.dailyDemand`, demand, 'WorldStateSnapshot', 'VERIFIED_FACT'));
    else unknown.push(`${canonical}.dailyDemand`);

    if (production !== null) facts.push(evidence(`${canonical}.domesticProduction`, production, 'WorldStateSnapshot', 'VERIFIED_FACT'));
    else unknown.push(`${canonical}.domesticProduction`);

    if (stock !== null && demand !== null) {
      const netBurn = Math.max(0, demand - (production || 0));
      if (netBurn > 0) {
        const runway = stock / netBurn;
        derived.push(evidence(`${canonical}.runwayDays`, Number(runway.toFixed(2)), 'Derived from WorldStateSnapshot', 'ESTIMATED', 'stockpile / max(0, dailyDemand - domesticProduction)'));
      } else {
        derived.push(evidence(`${canonical}.runwayDays`, Infinity, 'Derived from WorldStateSnapshot', 'ESTIMATED', 'net consumption <= 0'));
      }
    } else unknown.push(`${canonical}.runwayDays`);

    return { canonical, facts, derived, unknown };
  }

  function buildAnswerPlan(question, identity, snapshot) {
    const routing = detectIntent(question);
    const entities = [];
    const oil = findEntity(question);
    if (oil) entities.push(oil);
    const secondMatches = Object.keys(ALIASES).filter(k => k !== oil && ALIASES[k].some(a => normalise(question).toLowerCase().includes(a.toLowerCase())));
    for (const entity of secondMatches) if (!entities.includes(entity)) entities.push(entity);

    const analyses = entities.map(entity => analyseResource(snapshot, entity));
    const facts = analyses.flatMap(a => a.facts);
    const derived = analyses.flatMap(a => a.derived);
    const unknown = analyses.flatMap(a => a.unknown);

    let conclusion = 'I cannot establish a verified strategic conclusion from the currently available state data.';
    if (routing.intent === 'MINISTER_IDENTITY') {
      conclusion = `I am ${identity.name}, serving as ${identity.role} for ${identity.countryName}.`;
    } else if (entities.length) {
      const knownRunways = derived.filter(x => x.metric.endsWith('.runwayDays') && Number.isFinite(x.value));
      if (knownRunways.length) {
        const weakest = knownRunways.reduce((a, b) => a.value < b.value ? a : b);
        conclusion = `The available telemetry supports a ${weakest.value}-day calculated runway for ${weakest.metric.split('.')[0].replace(/_/g, ' ').toLowerCase()}. This is a calculated metric, not a guarantee of security.`;
      } else {
        conclusion = 'The requested security assessment is not fully computable because one or more required telemetry fields are missing.';
      }
    }

    return Object.freeze({
      version: VERSION,
      identity,
      routing,
      entities,
      facts,
      derived,
      unknown,
      conclusion,
      recommendation: unknown.length ? 'Do not authorize a policy based on invented values. Acquire the missing telemetry first.' : 'Evaluate the calculated metrics against the simulation\'s explicit thresholds and policy objectives.',
      generatedBy: 'OMEGA_AI_INTEGRITY_LAYER'
    });
  }

  function formatOfflineAnswer(plan, language = 'en') {
    const bn = language === 'bn';
    if (plan.routing.intent === 'MINISTER_IDENTITY') return bn
      ? `আমি ${plan.identity.name}। আমি ${plan.identity.countryName}-এর ${plan.identity.role} হিসেবে দায়িত্ব পালন করছি।`
      : plan.conclusion;

    const lines = [plan.conclusion];
    if (plan.facts.length) {
      lines.push(bn ? 'যাচাইকৃত তথ্য:' : 'Verified facts:');
      for (const item of plan.facts) lines.push(`• ${item.metric}: ${item.value}`);
    }
    if (plan.derived.length) {
      lines.push(bn ? 'গণনাকৃত ফলাফল:' : 'Derived metrics:');
      for (const item of plan.derived) lines.push(`• ${item.metric}: ${item.value}`);
    }
    if (plan.unknown.length) lines.push((bn ? 'অজানা/অনুপস্থিত: ' : 'Unknown or missing: ') + plan.unknown.join(', '));
    lines.push((bn ? 'সুপারিশ: ' : 'Recommendation: ') + plan.recommendation);
    return lines.join('\n');
  }

  const API = Object.freeze({
    VERSION,
    canonicalMinisterIdentity,
    buildWorldSnapshot,
    detectIntent,
    findEntity,
    analyseResource,
    buildAnswerPlan,
    formatOfflineAnswer,
    epistemic: Object.freeze({ VERIFIED_FACT: 'VERIFIED_FACT', ESTIMATED: 'ESTIMATED', HYPOTHETICAL: 'HYPOTHETICAL', UNKNOWN })
  });

  global.OmegaAIIntegrity = API;

  // Safe integration hook. Existing engine remains intact if its public surface is unavailable.
  function install() {
    global.__OMEGA_AI_INTEGRITY__ = { version: VERSION, installedAt: Date.now(), api: API };
    return true;
  }
  global.OmegaAIIntegrity.install = install;
  install();
})(typeof window !== 'undefined' ? window : globalThis);
