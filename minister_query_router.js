/**
 * MINISTER QUERY ROUTER & INTENT CLASSIFIER
 * Universal semantic query parsing, intent taxonomy, entity resolution, and cognitive routing layer.
 */

(function (global) {
  'use strict';

  const QueryIntent = Object.freeze({
    MINISTER_IDENTITY: 'MINISTER_IDENTITY',
    RESOURCE_SECURITY: 'RESOURCE_SECURITY',
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

  const RESOURCE_ENTITY_DICTIONARY = Object.freeze({
    oil: { id: 'CRUDE_OIL', category: 'HYDROCARBON', unit: 'BBL', names: ['oil', 'petroleum', 'crude', 'diesel', 'fuel', 'তেল', 'পেট্রোল', 'অয়েল', 'জ্বালানি', 'হাইড্রোকার্বন'] },
    gas: { id: 'NATURAL_GAS', category: 'HYDROCARBON', unit: 'TCF', names: ['gas', 'lng', 'methane', 'natural gas', 'গ্যাস', 'এলএনজি', 'মিথেন', 'প্রাকৃতিক গ্যাস'] },
    coal: { id: 'COAL', category: 'SOLID_MINERAL', unit: 'MT', names: ['coal', 'bituminous', 'anthracite', 'কয়লা', 'কোল', 'কঠিন কয়লা'] },
    iron: { id: 'IRON_ORE', category: 'METALLURGY', unit: 'MT', names: ['iron', 'steel', 'ore', 'magnetite', 'hematite', 'লোহা', 'ইস্পাত', 'লৌহ', 'আকরিক', 'ম্যাগনেটাইট'] },
    copper: { id: 'COPPER', category: 'BASE_METAL', unit: 'MT', names: ['copper', 'তামা', 'কপার', 'তাম্র'] },
    lithium: { id: 'LITHIUM', category: 'CRITICAL_MINERAL', unit: 'MT', names: ['lithium', 'লিথিয়াম', 'ব্যাটারি খনিজ'] },
    rare_earth: { id: 'RARE_EARTHS', category: 'STRATEGIC_TECH', unit: 'KG', names: ['rare earth', 'rare-earth', 'rare earths', 'ree', 'lanthanide', 'বিরল মৃত্তিকা', 'রেয়ার আর্থ', 'বিরল খনিজ'] },
    uranium: { id: 'URANIUM', category: 'NUCLEAR', unit: 'KG', names: ['uranium', 'ইউরেনিয়াম', 'পারমাণবিক জ্বালানি', 'নিউক্লিয়ার'] },
    bauxite: { id: 'BAUXITE', category: 'BASE_METAL', unit: 'MT', names: ['bauxite', 'aluminum', 'বক্সাইট', 'অ্যালুমিনিয়াম'] },
    gold: { id: 'GOLD', category: 'PRECIOUS', unit: 'OZ', names: ['gold', 'bullion', 'সোনা', 'স্বর্ণ', 'বুলিয়ন'] }
  });

  function normalizeText(input) {
    if (typeof input !== 'string') return '';
    return input
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[?!,.:;'"(){}\[\]]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function detectResourceEntities(normText) {
    const matched = [];
    for (const [key, def] of Object.entries(RESOURCE_ENTITY_DICTIONARY)) {
      if (def.names.some(term => normText.includes(term))) {
        matched.push({ key, ...def });
      }
    }
    return matched;
  }

  function detectIntent(normText) {
    // 1. Identity Queries (Name, age, background, who are you, identity, etc.)
    if (
      /\b(what is your name|who are you|how old are you|your age|your background|tell me about yourself|who are u|whats your name|what's your name|your bio|your alma mater|your education|who is the minister)\b/i.test(normText) ||
      /আপনার নাম কি|তোমার নাম কি|কে তুমি|আপনি কে|আপনার বয়স কত|বয়স কত|পরিচয় কি|আপনার ব্যাকগ্রাউন্ড|কেমন আছেন|মন্ত্রীর পরিচয়|বায়োগ্রাফি/.test(normText)
    ) {
      return QueryIntent.MINISTER_IDENTITY;
    }

    // 2. Resource Mining / Extraction & Discovery
    if (
      /\b(how many mines|mine sites|mineral deposit|deposits|extraction|quarry|basin|geological field|iron mine|oil field|gas field|where are the mines)\b/i.test(normText) ||
      /কয়টি খনি|কতটি খনি|কোথায় খনি|খনি সমূহ|আকরিক ক্ষেত্র|উত্তোলন সাইট|গ্যাস ক্ষেত্র|কয়লা খনি|তেল খনি/.test(normText)
    ) {
      return QueryIntent.RESOURCE_MINING_DISCOVERY;
    }

    // 3. Resource Stockpile & Strategic Security
    if (
      /\b(secure|security|stockpile|stockpiles|reserve|reserves|safety|runway|shortage|depletion|buffer|silo|strategic reserve)\b/i.test(normText) ||
      /নিরাপদ|সুরক্ষিত|মজুদ|মজুত|সংরক্ষণ|ঘাটতি|স্থায়িত্ব|বাফার|রিজার্ভ|স্ট্র্যাটেজিক মজুদ|সিলোর অবস্থা/.test(normText)
    ) {
      return QueryIntent.RESOURCE_SECURITY;
    }

    // 4. Processing & Refining
    if (
      /\b(refine|refining|refinery|smelter|smelting|processing|conversion|capacity|throughput|blast furnace)\b/i.test(normText) ||
      /পরিশোধন|রিফাইনারি|স্মেল্টিং|প্রসেসিং|শিল্প সক্ষমতা|কারখানা/.test(normText)
    ) {
      return QueryIntent.RESOURCE_PROCESSING_REFINING;
    }

    // 5. Trade, Tariffs & Bilateral Supplies
    if (
      /\b(import|imports|export|exports|tariff|tariffs|trade|supplier|offtake|sanctions|embargo|shipping routes)\b/i.test(normText) ||
      /আমদানি|রপ্তানি|শুল্ক|বাণিজ্য|আন্তর্জাতিক চুক্তি|সরবরাহকারী|নিষেধাজ্ঞা/.test(normText)
    ) {
      return QueryIntent.RESOURCE_TRADE_TARIFF;
    }

    // 6. Macroeconomics & Treasury
    if (
      /\b(gdp|inflation|unemployment|debt|forex|treasury|budget|interest rate|fiscal|monetary|cash)\b/i.test(normText) ||
      /জিডিপি|অর্থনীতি|মূল্যস্ফীতি|মুদ্রাস্ফীতি|বেকারত্ব|বৈদেশিক মুদ্রা|কোষাগার|বাজেট|রাজস্ব/.test(normText)
    ) {
      return QueryIntent.MACROECONOMICS;
    }

    // 7. Demographics
    if (
      /\b(population|birth rate|death rate|demographic|urbanization|workforce|citizens)\b/i.test(normText) ||
      /জনসংখ্যা|জন্মহার|মৃত্যুহার|নাগরিক|শহরায়ন|শ্রমশক্তি/.test(normText)
    ) {
      return QueryIntent.DEMOGRAPHICS;
    }

    // 8. Defense & Military
    if (
      /\b(defense|military|army|navy|air force|weapon|missile|border|defcon|armed forces)\b/i.test(normText) ||
      /প্রতিরক্ষা|সেনাবাহিনী|নৌবাহিনী|বিমানবাহিনী|অস্ত্র|মিসাইল|সীমান্ত নিরাপত্তা|যুদ্ধ/.test(normText)
    ) {
      return QueryIntent.DEFENSE_MILITARY;
    }

    // 9. Energy & Power Grid
    if (
      /\b(electricity|power grid|megawatt|nuclear power|solar energy|power outage|blackout)\b/i.test(normText) ||
      /বিদ্যুৎ|পাওয়ার গ্রিড|মেগাওয়াট|বিদ্যুৎ উৎপাদন|সৌর শক্তি|পারমাণবিক বিদ্যুৎ/.test(normText)
    ) {
      return QueryIntent.ENERGY_POWER;
    }

    // 10. Policy & Directives
    if (
      /\b(directive|propose|policy|recommend|strategy|action plan|reorganization|decree)\b/i.test(normText) ||
      /সুপারিশ|পরিকল্পনা|নীতিমালা|নির্দেশনা|কৌশলগত পরিকল্পনা|সংস্কার/.test(normText)
    ) {
      return QueryIntent.POLICY_DIRECTIVE;
    }

    return QueryIntent.GENERAL_STRATEGIC;
  }

  function routeMinisterQuery(input, ministerMeta = {}, countryContext = {}) {
    const rawText = typeof input === 'string' ? input : '';
    const normText = normalizeText(rawText);
    const isBengali = /[\u0980-\u09FF]/.test(rawText);

    if (!normText) {
      return Object.freeze({
        intent: QueryIntent.UNKNOWN,
        domain: 'UNKNOWN',
        entities: [],
        requiredData: [],
        confidence: 0,
        isBengali: false
      });
    }

    const intent = detectIntent(normText);
    const entities = detectResourceEntities(normText);

    let domain = 'GOVERNANCE';
    if (intent === QueryIntent.MINISTER_IDENTITY) domain = 'IDENTITY';
    else if (intent.startsWith('RESOURCE_') || entities.length > 0) domain = 'RESOURCE';
    else if (intent === QueryIntent.MACROECONOMICS) domain = 'ECONOMY';
    else if (intent === QueryIntent.DEMOGRAPHICS) domain = 'DEMOGRAPHY';
    else if (intent === QueryIntent.DEFENSE_MILITARY) domain = 'DEFENSE';
    else if (intent === QueryIntent.ENERGY_POWER) domain = 'ENERGY';

    const requiredData = [];
    if (intent === QueryIntent.MINISTER_IDENTITY) {
      requiredData.push('minister.name', 'minister.age', 'minister.background', 'minister.alma_mater', 'minister.stats', 'minister.efficiency', 'minister.ideology');
    } else if (intent === QueryIntent.RESOURCE_SECURITY) {
      requiredData.push('resource.stockpiles', 'resource.consumption_runway', 'resource.storage_security', 'resource.forex_backup', 'resource.supply_shock_resilience');
    } else if (intent === QueryIntent.RESOURCE_MINING_DISCOVERY) {
      requiredData.push('geology.mine_sites', 'geology.basins', 'geology.proven_reserves', 'geology.mineral_regions', 'geology.active_complexes');
    } else if (intent === QueryIntent.MACROECONOMICS) {
      requiredData.push('economy.gdp', 'economy.growth', 'economy.inflation', 'economy.debt', 'economy.reserves', 'economy.unemployment');
    } else if (intent === QueryIntent.DEMOGRAPHICS) {
      requiredData.push('population.total', 'population.growth_rate', 'population.birth_rate', 'population.urbanization');
    }

    return Object.freeze({
      rawQuery: rawText,
      normQuery: normText,
      intent,
      domain,
      entities: Object.freeze(entities),
      requiredData: Object.freeze(requiredData),
      isBengali,
      confidence: intent === QueryIntent.UNKNOWN ? 0.2 : 0.95
    });
  }

  const routerExport = {
    QueryIntent,
    RESOURCE_ENTITY_DICTIONARY,
    normalizeText,
    detectResourceEntities,
    detectIntent,
    routeMinisterQuery
  };

  if (typeof window !== 'undefined') {
    window.MinisterQueryRouter = routerExport;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.MinisterQueryRouter = routerExport;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = routerExport;
  }

  return routerExport;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this)));
