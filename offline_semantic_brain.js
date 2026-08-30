/**
 * OFFLINE SEMANTIC BRAIN v1.0.0
 * Language is parsed into typed entities and operations. Facts are never stored here.
 * The brain only interprets language and produces a deterministic semantic query.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const KNOWLEDGE_FILE = 'offline_semantic_knowledge.json';
  const LEARNED_KEY = 'OMEGA_OFFLINE_SEMANTIC_LEARNING_V1';

  const FALLBACK = {
    countries: {
      BGD:['Bangladesh','BD','BGD','বাংলাদেশ','বাংলাদেশে','বাংলাদেশের','বাংলাদেশকে'],
      IND:['India','IND','ভারত','ভারতে','ভারতের'],
      CHN:['China','CHN','চীন','চীনে','চীনের'],
      USA:['United States','USA','America','যুক্তরাষ্ট্র','আমেরিকা'],
      RUS:['Russia','RUS','রাশিয়া','রাশিয়ায়','রাশিয়ার','রাশিয়ার']
    },
    resources: {
      CRUDE_OIL:['oil','crude oil','crude','petroleum','তেল','তেলের','পেট্রোলিয়াম','অপরিশোধিত তেল'],
      NATURAL_GAS:['gas','natural gas','lng','methane','গ্যাস','গ্যাসের','প্রাকৃতিক গ্যাস','এলএনজি','মিথেন'],
      COAL:['coal','কয়লা','কয়লা','কোল'],
      IRON_ORE:['iron ore','iron','hematite','magnetite','লোহা','লোহার','লৌহ','লৌহ আকরিক'],
      STEEL:['steel','ইস্পাত','স্টিল'],
      COPPER:['copper','তামা','তামার','কপার','তাম্র'],
      LITHIUM:['lithium','লিথিয়াম','লিথিয়াম'],
      RARE_EARTHS:['rare earth','rare-earth','rare earths','ree','রেয়ার আর্থ','রেয়ার আর্থ','বিরল মৃত্তিকা','বিরল খনিজ'],
      URANIUM:['uranium','ইউরেনিয়াম','ইউরেনিয়াম'],
      BAUXITE:['bauxite','বক্সাইট'],
      GOLD:['gold','bullion','সোনা','সোনার','স্বর্ণ','বুলিয়ন']
    },
    assets: {
      MINE:['mine','mines','mining site','খনি','খনিগুলো','খনিগুলি'],
      DEPOSIT:['deposit','deposits','mineral deposit','ডিপোজিট','খনিজ মজুদ'],
      OIL_FIELD:['oil field','oil fields','তেলক্ষেত্র','তেল ক্ষেত্র'],
      GAS_FIELD:['gas field','gas fields','গ্যাসক্ষেত্র','গ্যাস ক্ষেত্র'],
      FACILITY:['facility','plant','refinery','smelter','কারখানা','স্থাপনা','রিফাইনারি','স্মেল্টার']
    },
    operations: {
      COUNT:['how many','number of','count','total number','কতটি','কয়টি','কয়টি','কতগুলো','কতগুলি','সংখ্যা কত','মোট কত'],
      QUANTITY:['how much','quantity','amount','পরিমাণ কত','কত আছে','কতটুকু'],
      IDENTIFY:['what is','what are','define','কি','কী','কী আছে','কি আছে'],
      SELECT:['which','which ones','কোনটি','কোনগুলো','কোনগুলি'],
      PERSON:['who','কে','কারা'],
      LOCATION:['where','location','located','কোথায়','কোথায়','অবস্থান','কোথায় আছে','কোথায় আছে'],
      TIME:['when','কখন','কোন সময়','কোন সময়ে'],
      METHOD:['how','how does','how to','কীভাবে','কিভাবে','কী উপায়ে','কীভাবে কাজ'],
      CAUSE:['why','because','cause','কেন','কারণ','কী কারণে','কি কারণে'],
      POLICY:['should','should we','recommend','recommendation','what should we do','করা উচিত','করা উচিত কি','কী করা উচিত','কি করা উচিত','সুপারিশ','পরামর্শ'],
      FEASIBILITY:['can','is it possible','feasible','পারবে কি','সম্ভব কি','সম্ভব কিনা','করা সম্ভব'],
      FORECAST:['will','forecast','future','predict','ভবিষ্যতে','পূর্বাভাস','অনুমান']
    }
  };

  const text = v => String(v == null ? '' : v).trim();
  const normalize = v => text(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;'"(){}\[\]]/g,' ').replace(/\s+/g,' ').trim();
  const bengali = v => /[\u0980-\u09FF]/.test(text(v));

  function storage() {
    try { return global.localStorage; } catch (_) { return null; }
  }

  function readLearned() {
    const s = storage();
    if (!s) return {};
    try { return JSON.parse(s.getItem(LEARNED_KEY) || '{}'); } catch (_) { return {}; }
  }

  function writeLearned(v) {
    const s = storage();
    if (!s) return false;
    try { s.setItem(LEARNED_KEY, JSON.stringify(v)); return true; } catch (_) { return false; }
  }

  function addLearned(surface, type, id, confidence) {
    if (confidence < 0.90 || !surface || !id) return false;
    const learned = readLearned();
    learned[`${type}:${normalize(surface)}`] = {type,id,confidence,updatedAt:Date.now()};
    const keys = Object.keys(learned);
    if (keys.length > 512) delete learned[keys[0]];
    return writeLearned(learned);
  }

  function resolveFromMap(q, map, type) {
    const hits = [];
    for (const [id, aliases] of Object.entries(map)) {
      for (const alias of aliases) {
        const a = normalize(alias);
        if (!a) continue;
        if (q === a) hits.push({id,type,surface:alias,score:1});
        else if (q.includes(a)) hits.push({id,type,surface:alias,score:Math.min(0.98,0.70 + a.length / Math.max(100,q.length*4))});
      }
    }
    for (const [key, value] of Object.entries(readLearned())) {
      if (value.type !== type) continue;
      const surface = key.slice(type.length + 1);
      if (q.includes(surface)) hits.push({id:value.id,type,surface,score:value.confidence,source:'LEARNED'});
    }
    hits.sort((a,b) => b.score-a.score || b.surface.length-a.surface.length);
    if (!hits.length) return {id:null,type,confidence:0,source:'UNRESOLVED'};
    const second = hits[1] ? hits[1].score : 0;
    const best = hits[0];
    if (best.score < 0.82 || best.score-second < 0.08) return {id:null,type,confidence:best.score,source:'AMBIGUOUS',candidates:hits.slice(0,5)};
    return {id:best.id,type,confidence:best.score,source:best.source || 'SEMANTIC_KNOWLEDGE',surface:best.surface};
  }

  function detectOperation(q) {
    const hits = [];
    for (const [operation, aliases] of Object.entries(FALLBACK.operations)) {
      for (const alias of aliases) {
        const a = normalize(alias);
        if (q.includes(a)) hits.push({operation,score:a.length + (operation === 'COUNT' && /\bhow many\b/.test(q) ? 20 : 0)});
      }
    }
    hits.sort((a,b)=>b.score-a.score);
    return hits[0] ? hits[0].operation : 'IDENTIFY';
  }

  function detectAsset(q) {
    const r = resolveFromMap(q,FALLBACK.assets,'ASSET_CLASS');
    return r.id ? r : {id:null,type:'ASSET_CLASS',confidence:0,source:'UNRESOLVED'};
  }

  function intentFor(operation, asset, resource) {
    if (asset.id === 'MINE' || asset.id === 'DEPOSIT' || asset.id === 'OIL_FIELD' || asset.id === 'GAS_FIELD') return 'RESOURCE_MINING_DISCOVERY';
    if (operation === 'POLICY') return 'POLICY_EVALUATION';
    if (operation === 'CAUSE') return 'CAUSAL_ANALYSIS';
    if (operation === 'LOCATION') return 'LOCATION_QUERY';
    if (operation === 'COUNT' || operation === 'QUANTITY') return 'RESOURCE_STATUS';
    if (resource.id) return 'RESOURCE_QUERY';
    return 'GENERAL_QUERY';
  }

  function parse(question, context = {}) {
    const original = text(question);
    const q = normalize(original);
    const language = bengali(original) ? 'bn' : 'en';
    const country = resolveFromMap(q,FALLBACK.countries,'COUNTRY');
    const resource = resolveFromMap(q,FALLBACK.resources,'RESOURCE');
    const asset = detectAsset(q);
    const operation = detectOperation(q);
    const intent = intentFor(operation,asset,resource);
    const contextCountry = text(context.countryId || context.countryCode).toUpperCase();
    const contextResource = text(context.resourceId).toUpperCase();
    if (!country.id && /^[A-Z]{3}$/.test(contextCountry)) country.id = contextCountry;
    if (!resource.id && contextResource) resource.id = contextResource;

    const unresolved = [];
    if (country.confidence === 0 && !country.id) unresolved.push('COUNTRY');
    if ((asset.id || resource.id) && resource.confidence === 0 && !resource.id && asset.id !== 'MINE') unresolved.push('RESOURCE');
    if (asset.confidence === 0 && /mine|mines|deposit|field|খনি|ডিপোজিট|ক্ষেত্র/.test(q)) unresolved.push('ASSET_CLASS');

    return Object.freeze({
      version:VERSION,
      source:'OFFLINE_SEMANTIC_BRAIN',
      surface:original,
      language,
      intent,
      operation,
      entities:Object.freeze({country:Object.freeze(country),resource:Object.freeze(resource),asset:Object.freeze(asset)}),
      context:Object.freeze({countryId:contextCountry || null,resourceId:contextResource || null}),
      unresolved:Object.freeze(unresolved),
      confidence:Math.min(country.id ? country.confidence : 1, resource.id ? resource.confidence : 1, asset.id ? asset.confidence : 1),
      executable:unresolved.length === 0 && (country.id || resource.id || intent === 'GENERAL_QUERY')
    });
  }

  function explain(parsed) {
    return {
      language:parsed.language,
      intent:parsed.intent,
      operation:parsed.operation,
      countryId:parsed.entities.country.id,
      resourceId:parsed.entities.resource.id,
      assetClass:parsed.entities.asset.id,
      unresolved:parsed.unresolved.slice(),
      executable:parsed.executable
    };
  }

  const api = Object.freeze({VERSION,parse,explain,learn:addLearned,recall:readLearned,normalize});
  global.OfflineSemanticBrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
