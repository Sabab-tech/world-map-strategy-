/* OMEGA Country Data Gateway v1.0.0
 * Shared country-data contract. References existing sources; never builds a duplicate country database.
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  if (root.OmegaCountryDataGateway?.VERSION === VERSION) return;
  const sources = new Map();
  const str = v => String(v == null ? '' : v).trim();
  const norm = v => str(v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' AND ')
    .replace(/[_’'-]+/g, ' ').replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  const first = (...values) => values.find(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) ?? null;
  const firstNum = (...values) => { for (const v of values) { const n = num(v); if (n !== null) return n; } return null; };
  const runtime = () => root.OmegaCountryRuntimeData || null;
  const general = () => root.OmegaCountryGeneralDataRuntime || root.Omega?.CountryGeneralData || null;
  const missing = field => ({ field, value: null, status: 'UNAVAILABLE', sourceId: null, sourceName: null, year: null, authority: 'NONE', reason: 'NO_RECORDED_VALUE' });

  function resolveCountry(value) {
    try { const r = runtime()?.resolveCountry?.(value); if (r) return r; } catch (_) {}
    try {
      const r = general()?.getCountryRecord?.(value);
      if (r?.identity) { const i = r.identity; return { countryCode: i.iso2 || i.countryCode, iso2: i.iso2 || null, iso3: i.iso3 || null, name: i.name || i.officialName, officialName: i.officialName || i.name, profileStatus: 'GENERAL_REGISTRY_IDENTITY' }; }
    } catch (_) {}
    return null;
  }
  function registerSource(id, data, metadata = {}) {
    id = str(id); if (!id || data == null) return { ok: false, code: 'SOURCE_ID_OR_DATA_MISSING' };
    sources.set(id, { id, data, metadata: obj(metadata) ? metadata : {} });
    try { if (typeof root.CustomEvent === 'function') root.dispatchEvent?.(new root.CustomEvent('OMEGA_COUNTRY_DATA_SOURCE_REGISTERED', { detail: { sourceId: id } })); } catch (_) {}
    return { ok: true, sourceId: id };
  }
  function sourceRecord(id, country) {
    const source = sources.get(id); if (!source) return null;
    const p = resolveCountry(country), aliases = [country, p?.countryCode, p?.iso2, p?.iso3, p?.numericCode, p?.name, p?.officialName, p?.economyKey, p?.populationKey].map(norm).filter(Boolean);
    const data = source.data;
    if (Array.isArray(data)) {
      const row = data.find(r => aliases.includes(norm(r?.name || r?.countryName || r?.countryCode || r?.code || r?.iso2 || r?.iso3)));
      return row ? { record: row, sourceId: id, metadata: source.metadata } : null;
    }
    if (Array.isArray(data?.features)) {
      const row = data.features.find(r => { const q = r?.properties || {}; return [r?.id,q.name,q.ADMIN,q.ISO_A2,q.iso_a2,q.ISO_A3,q.iso_a3].some(v => aliases.includes(norm(v))); });
      return row ? { record: row, sourceId: id, metadata: source.metadata } : null;
    }
    if (Array.isArray(data?.countries)) {
      const identityFields = data?.metadata?.recordSchema?.identityFields || [];
      const row = data.countries.find(r => {
        const rowIdentity = Array.isArray(r?.identity)
          ? Object.fromEntries(identityFields.map((key, i) => [key, r.identity[i] ?? null]))
          : (obj(r?.identity) ? r.identity : {});
        return [r?.name, r?.countryName, r?.countryCode, r?.iso2, r?.iso3,
          rowIdentity.name, rowIdentity.officialName, rowIdentity.iso2, rowIdentity.iso3,
          rowIdentity.countryCode, rowIdentity.numericCode]
          .some(value => value != null && aliases.includes(norm(value)));
      });
      return row ? { record: row, sourceId: id, metadata: source.metadata } : null;
    }
    if (obj(data)) { const key = Object.keys(data).find(k => aliases.includes(norm(k))); return key ? { record: data[key], sourceId: id, metadata: source.metadata } : null; }
    return null;
  }
  function live(domain, country) { try { return runtime()?.getLiveRecord?.(domain, resolveCountry(country)?.countryCode || country) || null; } catch (_) { return null; } }
  function record(domain, country) { try { return runtime()?.getRecord?.(domain, resolveCountry(country)?.countryCode || country) || null; } catch (_) { return null; } }
  function generalRecord(country) { const p = resolveCountry(country); try { return general()?.getCountryRecord?.(p?.iso3 || p?.countryCode || country) || null; } catch (_) { return null; } }
  function valueAt(row, paths) {
    if (!obj(row)) return null;
    for (const path of paths) {
      let value = row;
      for (const part of String(path || '').split('.')) value = value == null ? undefined : value[part];
      if (value !== null && value !== undefined && value !== '' && typeof value !== 'object') return { value, path };
    }
    return null;
  }
  function getDomainRecord(country, domain) {
    const identity = resolveCountry(country);
    if (!identity) return { ok: false, countryCode: null, domain: str(domain), record: null, authority: 'NONE', sourceId: null, reason: 'COUNTRY_IDENTITY_UNRESOLVED' };
    const code = identity.countryCode || identity.iso2 || identity.iso3;
    const current = live(domain, code);
    if (obj(current)) return { ok: true, countryCode: code, domain: str(domain), record: current, authority: 'LIVE_STATE', sourceId: 'LIVE_GAME_STATE:' + str(domain) };
    const base = record(domain, code);
    if (obj(base)) return { ok: true, countryCode: code, domain: str(domain), record: base, authority: 'SOURCE_BASELINE', sourceId: 'OmegaCountryRuntimeData:' + str(domain) };
    return { ok: true, countryCode: code, domain: str(domain), record: null, authority: 'NONE', sourceId: null, reason: 'NO_DOMAIN_RECORD' };
  }
  function getValue(country, domains, paths) {
    const identity = resolveCountry(country);
    if (!identity) return { value: null, status: 'UNAVAILABLE', sourceId: null, authority: 'NONE', countryCode: null, reason: 'COUNTRY_IDENTITY_UNRESOLVED' };
    const code = identity.countryCode || identity.iso2 || identity.iso3;
    const domainList = Array.isArray(domains) ? domains : [domains];
    const pathList = Array.isArray(paths) ? paths : [paths];
    for (const domain of domainList) {
      const current = live(domain, code), liveHit = valueAt(current, pathList);
      if (liveHit) return { value: liveHit.value, status: 'AVAILABLE', countryCode: code, domain, fieldPath: liveHit.path, sourceId: 'LIVE_GAME_STATE:' + str(domain), authority: 'LIVE_STATE', year: current?.observationYear || null };
      const g = generalRecord(code);
      const roots = [g?.identity, g?.generalFacts, g?.metrics, g?.naturalResources, g?.publicSafety, g?.localGeography, g?.dataStatus];
      for (const data of roots) {
        const hit = valueAt(data, pathList);
        if (!hit) continue;
        const metricMeta = g?.metricMetadata?.[hit.path] || {};
        return { value: hit.value, status: 'AVAILABLE', countryCode: code, domain, fieldPath: hit.path,
          sourceId: metricMeta.sourceId || metricMeta.sourceName || g?.datasetId || 'country_general_data_registry_v1.json',
          sourceName: metricMeta.sourceName || metricMeta.sourceId || null, year: metricMeta.year ?? null,
          authority: data === g?.metrics ? 'SOURCED_BASELINE' : 'COUNTRY_REFERENCE' };
      }
      const domainKey = str(domain).toLowerCase();
      const relatedSources = [...sources.keys()].filter(id => {
        const meta = sources.get(id)?.metadata || {};
        const domains = Array.isArray(meta.domains) ? meta.domains.map(v => str(v).toLowerCase()) : [str(meta.domain || '').toLowerCase()];
        const base = str(id).toLowerCase().replace(/\.json$/,'');
        if (domains.includes(domainKey)) return true;
        if (base === domainKey) return true;
        if (domainKey === 'geography' || domainKey === 'country') return ['world','countries','cities','world_oceans_v1'].includes(base);
        return false;
      });
      const candidateSources = [...new Set([domainKey + '.json', ...relatedSources])];
      for (const sourceId of candidateSources) {
        const hit = sourceRecord(sourceId, code), sourceValue = valueAt(hit?.record, pathList);
        if (hit && sourceValue) return { value: sourceValue.value, status: 'AVAILABLE', countryCode: code, domain, fieldPath: sourceValue.path,
          sourceId, authority: 'SOURCE_DATASET', year: hit.record?.year || hit.record?.observationYear || null };
      }
      let ecosystem = null;
      try { ecosystem = root.WorldEcosystemEngine?.getCountryProfile?.(code) || root.WorldEcosystemEngine?.getCountryProfile?.(identity?.name) || null; } catch (_) {}
      const engineRows = [ecosystem, ecosystem?.[str(domain)], ecosystem?.[domain === 'population' ? 'population' : domain === 'economy' ? 'economy' : domain]];
      for (const engineRow of engineRows) {
        let hit = valueAt(engineRow, pathList);
        if (!hit && domain === 'population' && pathList.some(k => ['population','population_2015','populationTotal','totalPopulation'].includes(String(k).split('.').pop()))) {
          if (num(ecosystem?.population?.total) !== null) hit = {value: ecosystem.population.total, path: 'population.total'};
        }
        if (!hit && domain === 'economy' && pathList.some(k => ['gdp','GDP','gdpCurrentUsd','gdp_current_usd'].includes(String(k).split('.').pop()))) {
          if (num(ecosystem?.economy?.gdp) !== null) hit = {value: ecosystem.economy.gdp, path: 'economy.gdp'};
        }
        if (hit) return { value: hit.value, status: 'AVAILABLE', countryCode: code, domain, fieldPath: hit.path,
          sourceId: 'WorldEcosystemEngine:getCountryProfile', authority: 'ENGINE_RECORD', year: null };
      }
      const baseline = record(domain, code), baseHit = valueAt(baseline, pathList);
      if (baseHit) return { value: baseHit.value, status: 'AVAILABLE', countryCode: code, domain, fieldPath: baseHit.path,
        sourceId: 'OmegaCountryRuntimeData:' + str(domain), authority: 'SOURCE_BASELINE', year: baseline?.year || baseline?.observationYear || null };
    }
    return { value: null, status: 'UNAVAILABLE', countryCode: code, sourceId: null, authority: 'NONE', reason: 'NO_RECORDED_VALUE' };
  }
  function field(name, value, sourceId, sourceName, year, authority, unit, detail) {
    return value == null || value === '' ? missing(name) : { field: name, value, status: 'AVAILABLE', sourceId: sourceId || null, sourceName: sourceName || null, year: year ?? null, authority: authority || 'RECORDED', unit: unit || null, detail: detail || null };
  }
  function fieldLive(name, domains, keys, country, unit) {
    for (const domain of domains) { const row = live(domain, country); if (!obj(row)) continue;
      for (const key of keys) { const value = key.split('.').reduce((v,k) => v == null ? undefined : v[k], row); if (value != null && value !== '') return field(name,value,'LIVE_GAME_STATE:'+domain,'Current simulation state',row[name+'Year']||row.observationYear||null,'LIVE_STATE',unit,{domain,key}); }
    }
    return null;
  }
  function fieldMetric(name, row, metricKeys = [], factKeys = [], unit = null) {
    if (!row) return null; const metrics=row.metrics||{}, meta=row.metricMetadata||{}, facts=row.generalFacts||{};
    for (const key of metricKeys) if (metrics[key] != null && metrics[key] !== '') { const m=meta[key]||{}; return field(name,metrics[key],m.sourceId||m.sourceName||row.datasetId||'country_general_data_registry_v1.json',m.sourceName||m.sourceId||null,m.year,'SOURCED_BASELINE',unit,{metric:key,status:m.status||null,sourceUrl:m.sourceUrl||null}); }
    for (const key of factKeys) { const value=facts[key]??row.identity?.[key]; if (value != null && value !== '') return field(name,value,row.datasetId||'country_general_data_registry_v1.json',row.datasetId||null,null,'COUNTRY_REFERENCE',unit,{fact:key}); }
    return null;
  }
  function fieldBase(name, row, keys, sourceId, unit) { if (!obj(row)) return null; for (const key of keys) { const value=key.split('.').reduce((v,k)=>v==null?undefined:v[k],row); if(value!=null&&value!==''){const observationYear=row.year||row.observationYear||(key==='population_2015'?2015:null);return field(name,value,sourceId,sourceId,observationYear,'SOURCE_BASELINE',unit,{key});} } return null; }

  function getSnapshot(countryValue) {
    const identity=resolveCountry(countryValue);
    if (!identity) return {schemaVersion:VERSION,selectedCountry:str(countryValue),countryCode:null,status:'COUNTRY_NOT_RESOLVED',identity:null,fields:{},records:{},sources:[],diagnostics:{ok:false,errors:['COUNTRY_IDENTITY_UNRESOLVED'],warnings:[],missingFields:[]}};
    const code=identity.countryCode||identity.iso2||identity.iso3, profile=runtime()?.getProfile?.(code)||null, gen=generalRecord(code);
    let ecosystem=null; try { ecosystem=root.WorldEcosystemEngine?.getCountryProfile?.(code)||root.WorldEcosystemEngine?.getCountryProfile?.(identity.name)||null; } catch (_) {}
    const economy=record('economy',code), population=record('population',code);
    const economySource=sourceRecord('economy.json',code), populationSource=sourceRecord('population.json',code), societySource=sourceRecord('society.json',code);
    const profileSource=sourceRecord('economy_global_profiles_v1.json',code), generalSource=sourceRecord('country_general_data_registry_v1.json',code);
    const world=sourceRecord('world.json',code), roster=sourceRecord('countries.json',code), cities=sourceRecord('cities.json',code);
    const fields={}; const choose=(key,candidates)=>fields[key]=candidates.find(v=>v?.status==='AVAILABLE')||missing(key);
    choose('population',[
      fieldLive('population',['population'],['populationTotal','population_total','totalPopulation','population','population_2015'],code,'people'),
      fieldLive('population',['society','populationSociety'],['populationTotal','population_total','totalPopulation','population'],code,'people'),
      ecosystem?.population?.total!=null?field('population',ecosystem.population.total,'WorldEcosystemEngine:getCountryProfile','World ecosystem engine',ecosystem.population.observationYear||null,'ENGINE_RECORD','people'):null,
      fieldMetric('population',gen,['populationTotal','population'],[],'people'),
      fieldBase('population',societySource?.record,['populationTotal','population_total','totalPopulation','population','population_2015'],'society.json','people'),
      fieldBase('population',profileSource?.record?.populationValues||profile?.populationValues,['populationTotal','population_total','population','population_2015'],'economy_global_profiles_v1.json','people'),
      fieldBase('population',populationSource?.record||population,['populationTotal','population_total','totalPopulation','population','population_2015'],populationSource?'population.json':'OmegaCountryRuntimeData:population baseline','people')
    ]);
    choose('gdp',[
      fieldLive('gdp',['economy'],['gdpCurrentUsd','gdp_current_usd','gdpUsd','gdp_usd','gdp','GDP'],code,'USD'),
      ecosystem?.economy?.gdp!=null?field('gdp',ecosystem.economy.gdp,'WorldEcosystemEngine:getCountryProfile','World ecosystem engine',ecosystem.economy.observationYear||null,'ENGINE_RECORD','USD'):null,
      fieldMetric('gdp',gen,['gdpCurrentUsd','gdpUsd'],[],'USD'),
      fieldBase('gdp',profileSource?.record?.sourceValues||profile?.sourceValues,['gdpCurrentUsd','gdp_current_usd','gdpUsd','gdp_usd','gdp','GDP'],'economy_global_profiles_v1.json','USD'),
      fieldBase('gdp',economySource?.record||economy,['gdpCurrentUsd','gdp_current_usd','gdpUsd','gdp_usd','gdp','GDP'],economySource?'economy.json':'OmegaCountryRuntimeData:economy baseline','USD')
    ]);
    choose('capital',[fieldLive('capital',['government','politics','state'],['capital','capitalCity','capital_city'],code,'city'),fieldMetric('capital',gen,[],['capital'],'city'),runtime()?.getCapital?.(code)?field('capital',runtime().getCapital(code),'cities.json','Country city catalogue',null,'COUNTRY_REFERENCE','city'):null]);
    choose('currency',[fieldLive('currency',['economy'],['currency_code','currencyCode','currency'],code,'currency'),fieldBase('currency',economySource?.record||economy,['currency_code','currencyCode','currency_name'],economySource?'economy.json':'OmegaCountryRuntimeData:economy baseline','currency'),fieldMetric('currency',gen,[],['currencies'],'currency')]);
    choose('languages',[fieldMetric('languages',gen,[],['languages'],'language')]);
    const specs=[
      ['gdpGrowth',['gdp_growth','gdpGrowth','gdpGrowthPct'],['gdpGrowthPct'],['gdp_growth','gdpGrowth'],'%','economy'],
      ['inflation',['inflation','inflationPct'],['inflationPct'],['inflation','inflation_rate'],'%','economy'],
      ['unemployment',['unemployment_rate','unemploymentRate','unemploymentRatePct'],['unemploymentRatePct'],['unemployment_rate','unemploymentRate'],'%','economy'],
      ['debt',['debt','publicDebt','public_debt','debtUsd'],[],['debt','public_debt'],'USD','economy'],
      ['debtToGdpPct',['debtToGdpPct','debt_to_gdp_pct','publicDebtToGdpPct','public_debt_to_gdp_pct'],['publicDebtToGdpPct'],['debtToGdpPct','debt_to_gdp_pct','publicDebtToGdpPct','public_debt_to_gdp_pct'],'%','economy'],
      ['budgetBalanceToGdpPct',['budgetBalanceToGdpPct','budget_balance_to_gdp_pct'],['budgetBalancePctGdp'],['budgetBalanceToGdpPct','budget_balance_to_gdp_pct'],'%','economy'],
      ['reserves',['reserves','fxReservesUsd','foreignReserves'],['fxReservesUsd'],['reserves','fx_reserves'],'USD','economy'],
      ['tradeBalance',['trade_balance','tradeBalance','tradeBalanceUsd'],['tradeBalanceUsd'],['trade_balance'],'USD','economy'],
      ['tradeBalanceToGdpPct',['tradeBalanceToGdpPct','trade_balance_to_gdp_pct'],['tradeBalanceToGdpPct'],['tradeBalanceToGdpPct','trade_balance_to_gdp_pct'],'%','economy'],
      ['urbanization',['urbanization_rate','urbanizationRate','urbanizationPct'],['urbanizationPct'],['urbanization_rate'],'%','population'],
      ['birthRate',['birth_rate','birthRate'],[],['birth_rate'],'per 1,000','population'],
      ['deathRate',['death_rate','deathRate'],[],['death_rate'],'per 1,000','population'],
      ['annualPopulationGrowth',['annual_growth_rate','annualGrowthRate','populationGrowthPct'],['populationGrowthPct'],['annual_growth_rate'],'%','population'],
      ['migrationRate',['migration_rate','migrationRate'],[],['migration_rate'],'rate','population'],
      ['politicalStabilityWgiEstimate',['politicalStabilityWgiEstimate','political_stability_wgi_estimate'],['politicalStabilityWgiEstimate'],['politicalStabilityWgiEstimate'],'WGI estimate','politics'],
      ['governmentEffectivenessWgiEstimate',['governmentEffectivenessWgiEstimate','government_effectiveness_wgi_estimate'],['governmentEffectivenessWgiEstimate'],['governmentEffectivenessWgiEstimate'],'WGI estimate','government'],
      ['humanDevelopmentIndex',['humanDevelopmentIndex','human_development_index','hdi'],['humanDevelopmentIndex'],['humanDevelopmentIndex','hdi'],'index','society'],
      ['militaryExpenditurePctGdp',['militaryExpenditurePctGdp','military_expenditure_pct_gdp','militaryExpenditurePctGDP'],['militaryExpenditurePctGdp'],['militaryExpenditurePctGdp'],'% GDP','defense']
    ];
    for (const [key,liveKeys,metricKeys,baseKeys,unit,domain] of specs) {
      const domains = domain==='population' ? ['population','society','populationSociety']
        : domain==='politics' ? ['politics','government','state']
        : domain==='government' ? ['government','politics','state']
        : domain==='defense' ? ['defense','military','economy']
        : domain==='society' ? ['society','population','statistics']
        : ['economy'];
      const baseData = domain==='population' ? population : (domain==='economy' ? economy : (domain==='society' ? societySource?.record : null));
      const baseLabel = domain==='society' ? 'society.json' : 'OmegaCountryRuntimeData:'+domain+' baseline';
      choose(key,[fieldLive(key,domains,liveKeys,code,unit),fieldMetric(key,gen,metricKeys,[],unit),fieldBase(key,baseData,baseKeys,baseLabel,unit)]);
    }
    const aliases = [
      ['gdpGrowthPct','gdpGrowth'],['inflationPct','inflation'],['unemploymentRatePct','unemployment'],
      ['populationGrowthPct','annualPopulationGrowth'],['fxReservesUsd','reserves']
    ];
    for (const [alias,origin] of aliases) fields[alias] = fields[origin]?.status==='AVAILABLE'
      ? Object.assign({},fields[origin],{field:alias}) : missing(alias);
    const domains={};
    for (const domain of ['economy','population','society','government','politics','defense','military','foreign','diplomacy','trade','health','education','infrastructure','resources']) { const r=live(domain,code); if(obj(r))domains[domain]={record:r,sourceId:'LIVE_GAME_STATE:'+domain,authority:'LIVE_STATE'}; }
    if(obj(ecosystem))domains.worldEcosystem={record:ecosystem,sourceId:'WorldEcosystemEngine:getCountryProfile',authority:'ENGINE_RECORD'};
    const registered=[...sources.keys()];
    const sourceRows=[
      {sourceId:'OmegaCountryRuntimeData',available:!!profile,role:'CANONICAL_IDENTITY_AND_BASELINE'},
      {sourceId:'OmegaCountryGeneralDataRuntime',available:!!gen,role:'SOURCED_COUNTRY_FACTS_AND_METRICS'},
      {sourceId:'OmegaCountryRuntimeData:economy',available:!!economy,role:'MERGED_ECONOMY_BASELINE',inputFiles:['economy.json','economy_global_profiles_v1.json']},
      {sourceId:'OmegaCountryRuntimeData:population',available:!!population,role:'MERGED_POPULATION_BASELINE',inputFiles:['population.json','economy_global_profiles_v1.json']},
      {sourceId:'economy.json',available:!!economySource,role:'LEGACY_ECONOMY_SOURCE'},
      {sourceId:'population.json',available:!!populationSource,role:'LEGACY_POPULATION_SOURCE'},
      {sourceId:'society.json',available:!!societySource,role:'SOCIETY_SOURCE'},
      {sourceId:'economy_global_profiles_v1.json',available:!!profileSource,role:'CANONICAL_BASELINE_PROFILE_SOURCE'},
      {sourceId:'country_general_data_registry_v1.json',available:!!generalSource,role:'SOURCED_GENERAL_DATA_REGISTRY'},
      {sourceId:'world.json',available:!!world,role:'GEOGRAPHIC_IDENTITY'},
      {sourceId:'countries.json',available:!!roster,role:'MAP_COUNTRY_ROSTER'},
      {sourceId:'cities.json',available:!!cities,role:'CITY_AND_CAPITAL_CATALOGUE'},
      ...registered.filter(id=>!['world.json','countries.json','cities.json'].includes(id)).map(sourceId=>({sourceId,available:!!sourceRecord(sourceId,code),role:'REGISTERED_DATASET'}))
    ];
    const diagnostics=audit(identity,gen,fields,{economy:economySource?.record||economy,population:populationSource?.record||population,world,roster,cities});
    return {schemaVersion:VERSION,selectedCountry:str(countryValue),countryCode:code,status:diagnostics.errors.length?'DEGRADED':'READY',
      identity:{countryCode:code,iso2:identity.iso2||code,iso3:identity.iso3||null,name:identity.name||identity.officialName||gen?.identity?.name||str(countryValue),flag:runtime()?.flagFor?.(code)||null},
      fields,records:domains,sources:sourceRows,diagnostics,raw:{economy,population,countryGeneralRecord:gen,worldFeature:world?.record||null,rosterRecord:roster?.record||null,cityRecord:cities?.record||null}};
  }
  function audit(identity,gen,fields,refs) {
    const errors=[],warnings=[],comparisons=[],code=identity.countryCode||identity.iso2||identity.iso3;
    if(gen?.identity){const i=gen.identity,iso2=str(i.iso2||i.countryCode).toUpperCase(),iso3=str(i.iso3).toUpperCase();
      if(iso2&&identity.iso2&&iso2!==identity.iso2)errors.push({code:'COUNTRY_IDENTITY_MISMATCH',sourceId:gen.datasetId||'country_general_data_registry_v1.json',expected:identity.iso2,actual:iso2});
      if(iso3&&identity.iso3&&iso3!==identity.iso3)errors.push({code:'COUNTRY_ISO3_MISMATCH',expected:identity.iso3,actual:iso3});}
    for(const [name,hit] of [['world.json',refs.world],['countries.json',refs.roster]])if(hit){
      const r=hit.record||{},p=r.properties||{},rawName=first(p.ADMIN,p.name,r.name,r.countryName),rawCode=str(p.ISO_A2||p.iso_a2||r.iso2||r.code||r.countryCode||p.ISO_A3||p.iso_a3||r.iso3||r.id).toUpperCase();
      const resolvedCode=rawCode?resolveCountry(rawCode):null;
      if(rawCode&&!resolvedCode)errors.push({code:'UNRESOLVED_SOURCE_COUNTRY_CODE',sourceId:name,expected:code,actual:rawCode});
      else if(resolvedCode&&(resolvedCode.countryCode!==identity.countryCode)&&
        !(identity.iso3&&resolvedCode.iso3===identity.iso3)&&!(identity.iso2&&resolvedCode.iso2===identity.iso2))
        errors.push({code:'SOURCE_COUNTRY_IDENTITY_MISMATCH',sourceId:name,expected:identity.countryCode,actual:resolvedCode.countryCode,sourceName:rawName||null});
      if(rawName&&norm(rawName)!==norm(identity.name)){
        const resolvedName=resolveCountry(rawName);
        if(!resolvedName)warnings.push({code:'COUNTRY_NAME_ALIAS_UNRESOLVED',sourceId:name,expected:identity.name,actual:rawName});
        else if(resolvedName.countryCode!==identity.countryCode && !(identity.iso3&&resolvedName.iso3===identity.iso3))
          errors.push({code:'SOURCE_COUNTRY_NAME_MISMATCH',sourceId:name,expected:identity.name,actual:rawName,actualCountryCode:resolvedName.countryCode});
      }
    }
    const m=gen?.metrics||{},meta=gen?.metricMetadata||{},legacyPop=firstNum(refs.population?.populationTotal,refs.population?.population_total,refs.population?.population,refs.population?.population_2015),legacyGdp=firstNum(refs.economy?.gdpCurrentUsd,refs.economy?.gdp_current_usd,refs.economy?.gdp,refs.economy?.GDP);
    for(const item of [{field:'population',a:num(m.populationTotal),b:legacyPop,meta:meta.populationTotal,year:refs.population?.population_year||refs.population?.year||null},{field:'gdp',a:num(m.gdpCurrentUsd),b:legacyGdp,meta:meta.gdpCurrentUsd,year:refs.economy?.gdp_year||refs.economy?.year||null}]){
      if(item.a===null||item.b===null)continue;const ay=num(item.meta?.year),by=num(item.year),ratio=Math.max(Math.abs(item.a),Math.abs(item.b))/Math.max(1,Math.min(Math.abs(item.a),Math.abs(item.b)));
      if(ay!==null&&by!==null&&ay===by&&ratio>1.15)errors.push({code:'SAME_YEAR_VALUE_MISMATCH',field:item.field,sourceA:'country_general_data_registry_v1.json',sourceB:item.field==='gdp'?'economy.json':'population.json',valueA:item.a,valueB:item.b,year:ay,ratio});
      else if(ratio>1.15)warnings.push({code:ay!==null&&by!==null&&ay!==by?'REFERENCE_VINTAGE_DIFFERENCE':'UNVERIFIED_VALUE_MISMATCH',field:item.field,valueA:item.a,valueB:item.b,generalYear:ay,legacyYear:by,ratio,threshold:1.15});
      comparisons.push({field:item.field,valueA:item.a,valueB:item.b,generalYear:ay,legacyYear:by,ratio});}
    const supplementalChecks=[
      {field:'gdpGrowthPct',generalKey:'gdpGrowthPct',source:refs.economy,keys:['gdp_growth','gdpGrowth'],yearKeys:['gdp_growth_year','year']},
      {field:'inflationPct',generalKey:'inflationPct',source:refs.economy,keys:['inflation','inflationPct'],yearKeys:['inflation_year','year']},
      {field:'unemploymentRatePct',generalKey:'unemploymentRatePct',source:refs.economy,keys:['unemployment_rate','unemploymentRate'],yearKeys:['unemployment_rate_year','year']},
      {field:'urbanizationPct',generalKey:'urbanizationPct',source:refs.population,keys:['urbanization_rate','urbanizationRate'],yearKeys:['urbanization_year','year']},
      {field:'populationGrowthPct',generalKey:'populationGrowthPct',source:refs.population,keys:['annual_growth_rate','annualGrowthRate'],yearKeys:['population_growth_year','year']}
    ];
    for(const item of supplementalChecks){
      const left=num(m[item.generalKey]);
      let right=null;for(const key of item.keys){right=num(item.source?.[key]);if(right!==null)break;}
      if(left===null||right===null)continue;
      const ay=num(meta[item.generalKey]?.year);
      let by=null;for(const key of item.yearKeys){by=num(item.source?.[key]);if(by!==null)break;}
      const delta=Math.abs(left-right)/Math.max(1,Math.abs(left),Math.abs(right));
      if(delta<=0.15)continue;
      const detail={field:item.field,valueA:left,valueB:right,generalYear:ay,legacyYear:by,relativeDifference:Number(delta.toFixed(4)),threshold:0.15};
      if(ay!==null&&by!==null&&ay===by)errors.push({code:'SAME_YEAR_VALUE_MISMATCH',sourceA:'country_general_data_registry_v1.json',sourceB:item.field.startsWith('population')||item.field==='urbanizationPct'?'population.json':'economy.json',year:ay,...detail});
      else warnings.push({code:ay!==null&&by!==null&&ay!==by?'REFERENCE_VINTAGE_DIFFERENCE':'UNVERIFIED_VALUE_MISMATCH',sourceA:'country_general_data_registry_v1.json',sourceB:item.field.startsWith('population')||item.field==='urbanizationPct'?'population.json':'economy.json',...detail});
      comparisons.push({field:item.field,valueA:left,valueB:right,generalYear:ay,legacyYear:by,relativeDifference:Number(delta.toFixed(4))});
    }
    for(const [sourceId,source] of sources){
      const data=source?.data;
      if(!obj(data)||Array.isArray(data.countries)||Array.isArray(data.features))continue;
      const matchingKeys=Object.keys(data).filter(key=>resolveCountry(key)?.countryCode===identity.countryCode);
      if(matchingKeys.length>1)warnings.push({code:'DUPLICATE_COUNTRY_SOURCE_ROWS',sourceId,countryCode:identity.countryCode,keys:matchingKeys,
        message:'Multiple aliases in one source resolve to the same country; the first matching record may mask a duplicate.'});
    }
    for(const [key,v]of Object.entries(fields)){if(v.status==='AVAILABLE'&&v.value===null)errors.push({code:'VALUE_STATUS_CONTRADICTION',field:key});if(v.status==='UNAVAILABLE'&&v.value!==null)errors.push({code:'MISSING_VALUE_POLICY_VIOLATION',field:key});}
    return {ok:errors.length===0,countryCode:code,errors,warnings,comparisons,sourcesChecked:['OmegaCountryRuntimeData','OmegaCountryGeneralDataRuntime','economy.json','population.json','society.json','countries.json','world.json','cities.json'],missingFields:Object.keys(fields).filter(k=>fields[k].status!=='AVAILABLE')};
  }
  function auditCountry(value){return getSnapshot(value).diagnostics;}
  function auditAllCountries(){const profiles=runtime()?.listProfiles?.()||[],reports=profiles.map(p=>({countryCode:p.countryCode,name:p.name,...auditCountry(p.countryCode)})),errors=reports.flatMap(r=>r.errors.map(e=>({countryCode:r.countryCode,name:r.name,...e}))),warnings=reports.flatMap(r=>r.warnings.map(e=>({countryCode:r.countryCode,name:r.name,...e})));return{schemaVersion:VERSION,countryCount:reports.length,ok:errors.length===0,errorCount:errors.length,warningCount:warnings.length,missingFieldCount:reports.reduce((n,r)=>n+r.missingFields.length,0),errors,warnings,reports};}
  function getField(country,key){return getSnapshot(country).fields[key]||missing(key);}
  function diagnostics(){return{version:VERSION,sourceCount:sources.size,sourceIds:[...sources.keys()],runtimeAvailable:!!runtime(),runtimeReady:!!runtime()?.isReady?.(),generalRuntimeAvailable:!!general(),generalRuntimeReady:!!general()?.diagnostics?.().ready,countryCount:runtime()?.diagnostics?.().profileCount||0};}
  function init(){const tasks=[];if(runtime()?.ready)tasks.push(Promise.resolve(runtime().ready));if(general()?.init)tasks.push(Promise.resolve(general().init()));return Promise.all(tasks).then(()=>{for(const id of ['economy_global_profiles_v1.json','cities.json','economy.json','population.json','society.json','country_general_data_registry_v1.json']){const data=runtime()?.getSourceDataset?.(id);if(data&&!sources.has(id))registerSource(id,data,{authority:'EXISTING_RUNTIME_SOURCE'});}const geo=root.Game?.Map?.countryGeoJSON||root.Game?.Map?.geoData||root.worldGeoJSON||root.worldData;if(geo&&!sources.has('world.json'))registerSource('world.json',geo,{authority:'GEOGRAPHIC_REFERENCE'});const roster=root.OmegaGeographicRegionSystem?.countries||root.countryRoster||root.countriesData;if(roster&&!sources.has('countries.json'))registerSource('countries.json',roster,{authority:'CANONICAL_MAP_ROSTER'});return diagnostics();});}
  root.OmegaCountryDataGateway=Object.freeze({VERSION,init,resolveCountry,getSnapshot,getField,getValue,getDomainRecord,auditCountry,auditAllCountries,registerSource,diagnostics});
  root.Omega=root.Omega||{};root.Omega.CountryDataGateway=root.OmegaCountryDataGateway;
  function emit(type,detail){try{if(typeof root.CustomEvent==='function')root.dispatchEvent?.(new root.CustomEvent(type,{detail}));}catch(_){}}
  root.addEventListener?.('OMEGA_COUNTRY_CONTEXT_CHANGED',event=>{const country=event?.detail?.countryId||event?.detail?.country;if(country)emit('OMEGA_COUNTRY_DATA_CONTEXT_READY',{countryId:country,snapshot:getSnapshot(country)});});
  root.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',()=>{const country=root.CountryIOS?.activeCountry||root.OmegaMinistryViewCountry||root.Game?.currentActiveCountry;if(country)emit('OMEGA_COUNTRY_DATA_REFRESHED',{countryId:country,snapshot:getSnapshot(country)});});
  init().catch(error=>root.console?.warn?.('[Country Data Gateway] Initialization deferred:',error?.message||error));
})(typeof window!=='undefined'?window:globalThis);
