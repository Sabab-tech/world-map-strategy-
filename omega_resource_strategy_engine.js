/**
 * OMEGA RESOURCE STRATEGY ENGINE v1.0.0
 * Generic policy reasoning for every canonical resource.
 *
 * This is not a canned "oil answer" engine. The resource identity, ontology,
 * country state and evidence are inputs. The same planner therefore applies to
 * oil, gas, copper and every other resource loaded by the canonical registry.
 * It never invents quantities or claims a bottleneck that is not evidenced.
 */
(function (global) {
  'use strict';

  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;"'“”‘’(){}\[\]<>—–]/g, ' ').replace(/\s+/g, ' ').trim();
  const finite = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = text(v).replace(/,/g, '').replace(/%$/, '');
    if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s); return Number.isFinite(n) ? n : null;
  };

  const RESOURCE_ALIASES = Object.freeze({
    CRUDE_OIL:['oil','crude oil','crude','petroleum','তেল','অপরিশোধিত তেল','পেট্রোলিয়াম'],
    NATURAL_GAS:['natural gas','gas','lng','methane','প্রাকৃতিক গ্যাস','গ্যাস','এলএনজি'],
    COPPER:['copper','কপার','তামা','তাম্র'],
    LITHIUM:['lithium','লিথিয়াম','লিথিয়াম'],
    RARE_EARTHS:['rare earth','rare earths','ree','রেয়ার আর্থ','বিরল মৃত্তিকা'],
    POTASH_PHOSPHATE:['potash','phosphate','পটাশ','ফসফেট'],
    URANIUM:['uranium','ইউরেনিয়াম','ইউরেনিয়াম'],
    BAUXITE_ALUMINUM:['bauxite','aluminum','aluminium','বক্সাইট','অ্যালুমিনিয়াম','অ্যালুমিনিয়াম'],
    COAL:['coal','কয়লা','কয়লা'],
    IRON_ORE:['iron ore','iron','লৌহ আকরিক','লোহা'],
    GOLD:['gold','সোনা','স্বর্ণ'],
    COBALT:['cobalt','কোবাল্ট'],
    NICKEL:['nickel','নিকেল'],
    MANGANESE:['manganese','ম্যাঙ্গানিজ'],
    ZINC:['zinc','দস্তা','জিঙ্ক'],
    TIN:['tin','টিন'],
    GRAPHITE:['graphite','গ্রাফাইট'],
    SILICON:['silicon','সিলিকন']
  });

  const ACTION_WORDS = /\b(increase|raise|boost|grow|expand|improve|increase production|produce more|extract more|increase output|how can we|what can we do|how do we)\b|বাড়াতে|বাড়াতে|বৃদ্ধি|বাড়াব|বাড়াব|উৎপাদন বাড়|উৎপাদন বাড়|আরও উৎপাদন|কীভাবে.*বাড়|কীভাবে.*বাড়/;

  function walk(value, fn, path = []) {
    if (!value || typeof value !== 'object') return;
    fn(value, path);
    if (Array.isArray(value)) value.forEach((x, i) => walk(x, fn, path.concat(String(i))));
    else for (const [k, x] of Object.entries(value)) if (x && typeof x === 'object') walk(x, fn, path.concat(k));
  }

  function scalarFields(value, path = []) {
    const out = [];
    if (!value || typeof value !== 'object') return out;
    for (const [k, x] of Object.entries(value)) {
      if (['string','number','boolean'].includes(typeof x)) out.push({ key:k, value:x, path:path.concat(k) });
      else if (x && typeof x === 'object') out.push(...scalarFields(x, path.concat(k)));
    }
    return out;
  }

  function read(root, aliases) {
    if (!root || typeof root !== 'object') return null;
    const a = aliases.map(norm);
    for (const f of scalarFields(root)) {
      const k = norm(f.key);
      if (a.some(x => k === x || k.includes(x))) {
        const n = finite(f.value);
        if (n !== null) return { value:n, key:f.key, path:f.path.join('.') };
      }
    }
    return null;
  }

  function resolveResource(query, resourceRegistry, ontology) {
    const q = norm(query);
    const candidates = [];
    const add = (id, aliases, source) => {
      if (!id) return;
      const all = [id, ...(aliases || [])].map(norm).filter(Boolean);
      const score = Math.max(...all.map(a => q === a ? 1 : (q.includes(a) ? .95 : a.includes(q) ? .82 : 0)));
      if (score > 0) candidates.push({ id:String(id).toUpperCase(), score, source });
    };
    for (const [id, aliases] of Object.entries(RESOURCE_ALIASES)) add(id, aliases, 'LANGUAGE_FALLBACK');
    for (const [id, record] of Object.entries(resourceRegistry || {})) {
      const names = [];
      if (record && typeof record === 'object') {
        for (const k of ['name','canonicalName','displayName','resourceName','name_en','name_bn','key']) if (typeof record[k] === 'string') names.push(record[k]);
        if (Array.isArray(record.aliases)) names.push(...record.aliases);
      }
      add(id, names, 'CANONICAL_REGISTRY');
    }
    for (const [id, record] of Object.entries(ontology || {})) {
      const names = record && typeof record === 'object' ? [record.name, record.key] : [];
      add(id, names, 'RESOURCE_ONTOLOGY');
    }
    candidates.sort((a,b) => b.score - a.score);
    const unique = [];
    for (const c of candidates) if (!unique.some(x => x.id === c.id)) unique.push(c);
    if (!unique.length) return { state:'UNRESOLVED', id:null, candidates:[] };
    if (unique.length > 1 && Math.abs(unique[0].score - unique[1].score) < .04) return { state:'AMBIGUOUS', id:null, candidates:unique.slice(0,5) };
    return { state:'RESOLVED', id:unique[0].id, candidates:unique.slice(0,5) };
  }

  function countryRecord(countryCode, countryName, datasets) {
    const code = text(countryCode).toUpperCase();
    let found = null;
    for (const ds of datasets || []) walk(ds, (v, p) => {
      if (found || !v || typeof v !== 'object') return;
      const ids = [v.iso3,v.iso,v.isoCode,v.countryCode,v.code,v.id].filter(Boolean).map(x => text(x).toUpperCase());
      const names = [v.name,v.countryName,v.officialName,v.displayName,v.name_en,v.name_bn].filter(Boolean).map(norm);
      if ((code && ids.includes(code)) || (!code && countryName && names.includes(norm(countryName)))) found = { value:v, path:p.join('.') };
    });
    return found;
  }

  function resourceRecord(country, resourceId) {
    if (!country) return null;
    let found = null;
    const needles = [resourceId, resourceId.replace(/_/g,' '), ...(RESOURCE_ALIASES[resourceId] || [])].map(norm);
    walk(country.value, (v, p) => {
      if (found || !v || typeof v !== 'object') return;
      const blob = norm(p.join(' ') + ' ' + scalarFields(v).map(f => `${f.key} ${f.value}`).join(' '));
      if (needles.some(n => n && blob.includes(n))) {
        const fields = scalarFields(v);
        if (fields.some(f => /production|reserve|capacity|output|extraction|consumption|demand|processing|refining|smelting|mine|field|deposit|facility|infrastructure/i.test(f.key))) found = { value:v, path:p.join('.') };
      }
    });
    return found || country;
  }

  function productionIntent(query) {
    return ACTION_WORDS.test(norm(query)) && /production|produce|output|extract|extraction|উৎপাদন|উত্তোলন/.test(norm(query));
  }

  function plan(query, options = {}) {
    const datasets = options.datasets || [];
    const registry = options.resourceRegistry || {};
    const ontology = options.ontology || {};
    const resource = options.resourceId ? { state:'RESOLVED', id:String(options.resourceId).toUpperCase() } : resolveResource(query, registry, ontology);
    if (resource.state !== 'RESOLVED') return {
      state:resource.state, type:'POLICY_RECOMMENDATION', operation:'INCREASE_PRODUCTION',
      directAnswer:null, resource, country:{ id:options.countryCode || null, name:options.countryName || null },
      facts:[], recommendations:[], unknown:['A single resource could not be resolved.'], evidence:[]
    };

    const country = countryRecord(options.countryCode, options.countryName, datasets);
    const record = resourceRecord(country, resource.id);
    const card = ontology[resource.id] || {};
    const production = read(record?.value, ['production','annual_production','daily_production','production_per_day','output','extraction','domestic_production']);
    const capacity = read(record?.value, ['production_capacity','capacity','extraction_capacity','daily_capacity','throughput']);
    const reserves = read(record?.value, ['reserve','reserves','proved_reserves','recoverable_reserves','remaining_reserves']);
    const processing = read(record?.value, ['processing_capacity','refining_capacity','smelting_capacity','processing','refining']);
    const demand = read(record?.value, ['demand','consumption','annual_demand','daily_demand','daily_consumption']);
    const facts = [];
    for (const [metric, item] of [['production',production],['capacity',capacity],['reserves',reserves],['processingCapacity',processing],['demand',demand]]) if (item) facts.push({ metric, value:item.value, field:item.key, path:item.path, status:'KNOWN' });

    const recommendations = [];
    const add = (id, title, basis, requiredData) => recommendations.push({ id, title, basis, requiredData, status:'ACTIONABLE_IF_SUPPORTED' });

    add('EXPLORATION_AND_RESOURCE_DEFINITION', 'Expand exploration and resource definition', card.upstreamProcess || 'Use the resource-specific upstream extraction model from the ontology.', ['discoverable deposits/fields', 'geological confidence', 'development candidates']);
    add('DEBOTTLENECK_EXTRACTION', 'Increase extraction efficiency at existing producing assets', card.upstreamProcess || 'Optimize the resource-specific extraction process.', ['asset-level production', 'recovery/efficiency', 'operating constraints']);
    add('PRODUCTION_CAPACITY', 'Remove production-capacity bottlenecks', card.midstreamProcess || 'Expand the capacity that constrains the resource flow.', ['current capacity', 'utilization', 'expansion constraints']);
    add('INFRASTRUCTURE', 'Expand or repair supporting infrastructure', Array.isArray(card.infrastructureDependencies) ? card.infrastructureDependencies : ['transport', 'power', 'water', 'storage or field-to-market infrastructure as applicable'], ['infrastructure capacity', 'logistics constraints', 'project lead time']);
    add('PROCESSING_CHAIN', 'Expand processing/refining/smelting capacity where it limits output', card.midstreamProcess || 'Increase compatible downstream processing capacity.', ['processing capacity', 'feedstock availability', 'utilization']);
    add('TECHNOLOGY_AND_RECOVERY', 'Deploy resource-appropriate recovery technology', card.upstreamProcess || 'Apply technology compatible with the resource and deposit type.', ['technology readiness', 'cost', 'recovery potential']);

    const blockers = [];
    if (!production) blockers.push('Current production is not available in the country/resource record.');
    if (!reserves) blockers.push('Reserve/resource base is not available, so expansion potential cannot be quantified.');
    if (!capacity) blockers.push('Production capacity is not available, so a capacity bottleneck cannot be confirmed.');
    if (!processing) blockers.push('Processing capacity is not available, so a downstream bottleneck cannot be confirmed.');
    if (!country) blockers.push('Country resource state was not resolved from the authoritative dataset.');

    const directAnswer = productionIntent(query) ?
      `To increase ${resource.id} production, prioritize exploration/resource definition, existing-asset extraction efficiency, production-capacity expansion, supporting infrastructure, and the relevant processing bottleneck. The order should be determined from the country's actual production, reserves, capacity and processing data.` :
      null;

    return {
      state: country ? 'GROUNDED_PLAN' : 'INSUFFICIENT_DATA',
      type:'POLICY_RECOMMENDATION', operation:'INCREASE_PRODUCTION',
      resource:{ id:resource.id, state:'RESOLVED' },
      country:{ id:options.countryCode || null, name:options.countryName || null, state:country ? 'RESOLVED' : 'UNRESOLVED' },
      directAnswer,
      facts,
      recommendations,
      blockers,
      ontology:{ upstreamProcess:card.upstreamProcess || null, midstreamProcess:card.midstreamProcess || null, downstreamSectors:card.downstreamSectors || [], infrastructureDependencies:card.infrastructureDependencies || [] },
      evidence: record ? [{ dataset:'WORLD_RESOURCE_STATE', path:record.path }] : [],
      rule:'NO_QUANTITY_INVENTION'
    };
  }

  global.OmegaResourceStrategyEngine = Object.freeze({ VERSION:'1.0.0', plan });
})(typeof globalThis !== 'undefined' ? globalThis : window);
