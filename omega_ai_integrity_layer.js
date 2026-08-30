/**
 * OMEGA AI INTEGRITY LAYER v1.1
 * Canonical identity + read-only state + bilingual semantic routing + evidence-grounded offline cognition.
 */
(function (global) {
  'use strict';

  const VERSION = '1.1.0';
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

  const INTENTS = [
    ['MINISTER_IDENTITY', /\b(name|who are you|your name|age|background|identity)\b|নাম কী|তোমার নাম|আপনার নাম|কে আপনি|বয়স|পরিচয়/i],
    ['RESOURCE_SECURITY', /\b(secure|security|safe|stockpile|reserve|runway|shortage|supply)\b|নিরাপদ|নিরাপত্তা|মজুদ|মজুত|রিজার্ভ|ঘাটতি|সরবরাহ|কতদিন/i],
    ['RESOURCE_DISCOVERY', /\b(mine|mines|deposit|deposits|discovery|geological|basin)\b|খনি|খনিজ|ডিপোজিট|ভূতাত্ত্বিক|ভাণ্ডার|আবিষ্কার/i],
    ['MACROECONOMICS', /\b(gdp|inflation|debt|treasury|budget|fx|foreign exchange)\b|জিডিপি|মুদ্রাস্ফীতি|ঋণ|কোষাগার|বাজেট|বৈদেশিক মুদ্রা/i],
    ['POLICY_RECOMMENDATION', /\b(should|recommend|recommendation|what should|policy|plan|strategy)\b|কী করা উচিত|সুপারিশ|নীতি|পরিকল্পনা|কৌশল/i]
  ];

  const text = v => String(v == null ? '' : v).trim();
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  function pathGet(root, paths) {
    for (const p of paths) {
      let cur = root;
      let ok = true;
      for (const k of p.split('.')) {
        if (cur == null || typeof cur !== 'object' || !(k in cur)) { ok = false; break; }
        cur = cur[k];
      }
      if (ok && cur !== null && cur !== undefined) return { value: cur, path: p };
    }
    return { value: null, path: null };
  }

  function canonicalMinisterIdentity(input = {}) {
    const countryCode = text(input.countryCode || input.country || 'UNKNOWN').toUpperCase();
    const ministryId = text(input.ministryId || input.portfolioId || 'UNKNOWN').toUpperCase();
    const ministerId = text(input.ministerId || input.id || `${countryCode}:${ministryId}:UNKNOWN`);
    return Object.freeze({
      countryCode,
      countryName: text(input.countryName || input.country || 'Sovereign State'),
      ministryId,
      ministerId,
      name: text(input.ministerName || input.name || 'Minister (Identity Unresolved)'),
      role: text(input.ministerRole || input.role || 'Cabinet Minister'),
      profileSource: text(input.profileSource || 'RUNTIME_CANONICAL_IDENTITY')
    });
  }

  function detectIntent(question) {
    const q = text(question);
    for (const [intent, pattern] of INTENTS) if (pattern.test(q)) return { intent, confidence: 0.95 };
    return { intent: 'GENERAL_STRATEGIC_QUERY', confidence: 0.45 };
  }

  function findEntities(question) {
    const q = text(question).toLowerCase();
    return Object.entries(ALIASES)
      .filter(([, aliases]) => aliases.some(a => q.includes(a.toLowerCase())))
      .map(([key]) => key);
  }

  function buildWorldSnapshot(input = {}) {
    const source = input.worldState || input.gameState || input.reservesData || {};
    const resources = source.resources || source.resourceState || source.strategic_resources || {};
    return Object.freeze({
      version: VERSION,
      timestamp: Date.now(),
      countryCode: text(input.countryCode || source.countryCode || source.iso || 'UNKNOWN').toUpperCase(),
      resources: Object.freeze({ ...resources }),
      economy: Object.freeze({ ...(source.economy || source.economic || {}) }),
      energy: Object.freeze({ ...(source.energy || source.power || {}) }),
      source: 'READ_ONLY_WORLDSTATE_SNAPSHOT'
    });
  }

  function resolveResource(snapshot, canonical) {
    const r = snapshot.resources || {};
    const direct = [canonical, canonical.toLowerCase(), canonical.replace(/_/g, ' '), canonical.replace(/_/g, '')];
    for (const key of direct) if (Object.prototype.hasOwnProperty.call(r, key)) return r[key];
    const flat = JSON.stringify(r).toLowerCase();
    if (canonical === 'CRUDE_OIL' && flat.includes('oil')) return r.oil || r.OIL || null;
    if (canonical === 'NATURAL_GAS' && flat.includes('gas')) return r.gas || r.GAS || null;
    if (canonical === 'RARE_EARTHS' && (flat.includes('rare') || flat.includes('earth'))) return r.rareEarths || r.RARE_EARTHS || null;
    return null;
  }

  function evidence(metric, value, source, status, equation = 'DIRECT_OBSERVATION') {
    return Object.freeze({ metric, value, source, epistemicStatus: status, equation, timestamp: Date.now() });
  }

  function analyseResource(snapshot, canonical) {
    const resource = resolveResource(snapshot, canonical);
    const stock = num(pathGet(resource, ['stockpile', 'stock', 'inventory', 'quantity', 'available', 'currentStock', 'strategicStockpile']).value);
    const demand = num(pathGet(resource, ['dailyDemand', 'demandPerDay', 'dailyConsumption', 'consumptionPerDay', 'netDailyDemand']).value);
    const production = num(pathGet(resource, ['dailyProduction', 'productionPerDay', 'domesticProduction', 'extractionPerDay', 'production.daily']).value);
    const facts = [], derived = [], unknown = [];
    if (stock !== null) facts.push(evidence(`${canonical}.stockpile`, stock, 'WorldStateSnapshot', 'VERIFIED_FACT')); else unknown.push(`${canonical}.stockpile`);
    if (demand !== null) facts.push(evidence(`${canonical}.dailyDemand`, demand, 'WorldStateSnapshot', 'VERIFIED_FACT')); else unknown.push(`${canonical}.dailyDemand`);
    if (production !== null) facts.push(evidence(`${canonical}.domesticProduction`, production, 'WorldStateSnapshot', 'VERIFIED_FACT')); else unknown.push(`${canonical}.domesticProduction`);
    if (stock !== null && demand !== null) {
      const netBurn = Math.max(0, demand - (production || 0));
      if (netBurn > 0) derived.push(evidence(`${canonical}.runwayDays`, Number((stock / netBurn).toFixed(2)), 'Derived from WorldStateSnapshot', 'ESTIMATED', 'stockpile / max(0, dailyDemand - domesticProduction)'));
      else derived.push(evidence(`${canonical}.runwayDays`, Infinity, 'Derived from WorldStateSnapshot', 'ESTIMATED', 'net consumption <= 0'));
    } else unknown.push(`${canonical}.runwayDays`);
    return { canonical, facts, derived, unknown };
  }

  function buildAnswerPlan(question, identityInput, worldInput) {
    const identity = canonicalMinisterIdentity(identityInput);
    const snapshot = buildWorldSnapshot({ ...worldInput, countryCode: identity.countryCode });
    const routing = detectIntent(question);
    const entities = findEntities(question);
    const analyses = entities.map(e => analyseResource(snapshot, e));
    const facts = analyses.flatMap(a => a.facts);
    const derived = analyses.flatMap(a => a.derived);
    const unknown = analyses.flatMap(a => a.unknown);
    let conclusion;
    if (routing.intent === 'MINISTER_IDENTITY') conclusion = `I am ${identity.name}, serving as ${identity.role} for ${identity.countryName}.`;
    else if (!entities.length) conclusion = 'The question requires domain-specific telemetry that is not yet exposed through the offline evidence gateway.';
    else if (derived.length) {
      const finite = derived.filter(x => Number.isFinite(x.value));
      conclusion = finite.length
        ? `The available telemetry supports a ${finite.sort((a, b) => a.value - b.value)[0].value}-day calculated runway for the most constrained identified resource. This is a derived metric, not a guarantee of security.`
        : 'The available telemetry does not support a finite runway calculation.';
    } else conclusion = 'The requested assessment is not computable from the available telemetry. Missing values are explicitly reported rather than invented.';
    return Object.freeze({
      version: VERSION, identity, routing, entities, facts, derived, unknown, conclusion,
      recommendation: unknown.length ? 'Acquire the missing telemetry before authorizing policy. Do not substitute invented values.' : 'Evaluate the derived metrics against explicit simulation thresholds and policy objectives.',
      generatedBy: 'OMEGA_AI_INTEGRITY_LAYER'
    });
  }

  function formatOfflineAnswer(plan, language = 'en') {
    const bn = language === 'bn';
    if (plan.routing.intent === 'MINISTER_IDENTITY') return bn ? `আমি ${plan.identity.name}। আমি ${plan.identity.countryName}-এর ${plan.identity.role} হিসেবে দায়িত্ব পালন করছি।` : plan.conclusion;
    const out = [bn ? plan.conclusion.replace('The available telemetry supports', 'উপলব্ধ টেলিমেট্রি অনুযায়ী') : plan.conclusion];
    if (plan.facts.length) out.push((bn ? 'যাচাইকৃত তথ্য:' : 'Verified facts:') + '\n' + plan.facts.map(x => `• ${x.metric}: ${x.value}`).join('\n'));
    if (plan.derived.length) out.push((bn ? 'গণনাকৃত ফলাফল:' : 'Derived metrics:') + '\n' + plan.derived.map(x => `• ${x.metric}: ${x.value}`).join('\n'));
    if (plan.unknown.length) out.push((bn ? 'অজানা/অনুপস্থিত: ' : 'Unknown or missing: ') + plan.unknown.join(', '));
    out.push((bn ? 'সুপারিশ: ' : 'Recommendation: ') + plan.recommendation);
    return out.join('\n\n');
  }

  const API = { VERSION, canonicalMinisterIdentity, detectIntent, findEntities, buildWorldSnapshot, analyseResource, buildAnswerPlan, formatOfflineAnswer };
  global.OmegaAIIntegrity = API;
  global.__OMEGA_AI_INTEGRITY__ = { version: VERSION, installedAt: Date.now(), api: API };

  function tryInstallCabinetBridge() {
    const ui = global.OmegaCabinetUI;
    if (!ui || ui.__integrityBridgeInstalled) return !!ui;
    ui.__integrityBridgeInstalled = true;
    const original = ui.thinkMinisterQuestion;
    if (typeof original === 'function') {
      ui.thinkMinisterQuestion = function (question, ...rest) {
        try {
          const active = ui.currentInterrogatedMinister || {};
          const country = global.Game?.currentActiveCountry || {};
          const identity = canonicalMinisterIdentity({
            countryCode: country.iso || country.code || active.countryCode,
            countryName: country.name || country.countryName,
            ministryId: active.ministryId || active.id,
            ministerId: active.ministerId || active.id,
            ministerName: active.name || active.ministerName,
            ministerRole: active.role || active.ministerRole
          });
          const plan = buildAnswerPlan(question, identity, {
            countryCode: identity.countryCode,
            worldState: global.Game?.worldState || global.Game?.state,
            gameState: global.Game?.state,
            reservesData: global.Game?.resources || global.Game?.resourceState
          });
          return { ok: true, offline: true, aiPowered: false, identity, plan, text: formatOfflineAnswer(plan, /[\u0980-\u09FF]/.test(question) ? 'bn' : 'en') };
        } catch (error) {
          console.warn('[OMEGA AI Integrity] offline bridge failed; preserving original engine', error);
          return original.call(this, question, ...rest);
        }
      };
    }
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => { attempts++; if (tryInstallCabinetBridge() || attempts >= 100) clearInterval(timer); }, 100);
  tryInstallCabinetBridge();
})(typeof window !== 'undefined' ? window : globalThis);
