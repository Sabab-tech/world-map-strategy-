/* OMEGA RESOURCE DATA AUTHORITY v1.0
 * Source of truth bridge:
 *   resources.json + resources_2.json
 *        -> structured deposit/mine records
 *        -> ResourceMinistryEngine.deposits
 *        -> Part 04 identity
 *        -> Part 05 reserve/extraction
 *
 * This layer deliberately refuses to manufacture mine records from country prose.
 */
(function(g){
  'use strict';

  const VERSION = '1.0.0';

  const clone = (v, seen = new WeakMap()) => {
    if(v === null || typeof v !== 'object') return v;
    if(seen.has(v)) return seen.get(v);
    if(Array.isArray(v)){
      const a = [];
      seen.set(v, a);
      v.forEach(x => a.push(clone(x, seen)));
      return a;
    }
    const o = {};
    seen.set(v, o);
    Object.keys(v).forEach(k => {
      if(k === '__proto__' || k === 'constructor' || typeof v[k] === 'function' || v[k] === undefined) return;
      o[k] = clone(v[k], seen);
    });
    return o;
  };

  const clean = v => String(v == null ? '' : v).trim();
  const upper = v => clean(v).toUpperCase();
  const lower = v => clean(v).toLowerCase();
  const finite = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const first = (obj, keys) => {
    if(!obj || typeof obj !== 'object') return undefined;
    for(const key of keys){
      if(Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        return obj[key];
      }
    }
    return undefined;
  };

  const hash = input => {
    const s = String(input);
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  function canonicalResourceId(value){
    let r = lower(value).replace(/^res_type:/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const aliases = {
      rare_earths: 'rare_earth',
      rare_earth_elements: 'rare_earth',
      naturalgas: 'natural_gas',
      crude: 'crude_oil',
      petroleum: 'crude_oil',
      iron: 'iron_ore',
      bauxite_aluminum: 'bauxite',
      phosphate_rock: 'phosphate',
      potash_muriate: 'potash'
    };
    return aliases[r] || r;
  }

  function parseCountry(raw, contextCountry){
    const direct = first(raw, [
      'countryCode','country_code','countryIso3','country_iso3','iso3','iso3Code',
      'hostCountryIso3','host_country_iso3','nationCode','sovereignCountryCode'
    ]);
    const countryId = first(raw, ['countryId','country_id','nationId','sovereignEntityId']);
    const candidate = direct || countryId || contextCountry || '';
    if(!candidate) return null;
    try{
      const engine = g.ResourceMinistryEngine;
      if(engine && typeof engine.normalizeCountryCode === 'function'){
        const normalized = engine.normalizeCountryCode(candidate);
        if(normalized) return upper(normalized);
      }
    }catch(_){}
    const text = upper(candidate);
    const aliases = {
      BANGLADESH:'BGD','BD':'BGD','INDIA':'IND','IN':'IND',
      CHINA:'CHN','CN':'CHN','UNITED STATES':'USA','US':'USA',
      RUSSIA:'RUS','RU':'RUS','AUSTRALIA':'AUS','AU':'AUS',
      CANADA:'CAN','CA':'CAN','JAPAN':'JPN','JP':'JPN',
      UNITED KINGDOM:'GBR','UK':'GBR','TURKEY':'TUR','TÜRKIYE':'TUR','TR':'TUR'
    };
    return aliases[text] || text;
  }

  function parsePercentLike(value){
    if(value === undefined || value === null || value === '') return null;
    if(typeof value === 'number' && Number.isFinite(value)){
      if(value >= 0 && value <= 1) return value;
      if(value > 1 && value <= 100) return value / 100;
      return null;
    }
    const s = clean(value).replace(/,/g, '');
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
    if(m){
      const n = Number(m[1]);
      return Number.isFinite(n) ? n / 100 : null;
    }
    const n = Number(s);
    if(Number.isFinite(n)){
      if(n >= 0 && n <= 1) return n;
      if(n > 1 && n <= 100) return n / 100;
    }
    return null;
  }

  function parseNumericText(value){
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    if(value === undefined || value === null) return null;
    const s = clean(value).replace(/,/g, '');
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if(!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function resolveRate(raw){
    const daily = first(raw, [
      'dailyOutput','daily_output','dailyProduction','daily_production',
      'productionRatePerDay','production_rate_per_day','extractionRatePerDay',
      'extraction_rate_per_day','outputRatePerDay','output_rate_per_day',
      'capacityPerDay','capacity_per_day','nominalRatePerDay','nominal_rate_per_day',
      'dailyCapacity','daily_capacity'
    ]);
    const dailyNumber = parseNumericText(daily);
    if(dailyNumber !== null && dailyNumber >= 0){
      return {value: dailyNumber, basis: 'PER_DAY_SOURCE_FIELD'};
    }

    const generic = first(raw, ['productionRate','production_rate','extractionRate','extraction_rate','outputRate','output_rate','nominalRate','nominal_rate']);
    if(generic !== undefined){
      if(typeof generic === 'object'){
        const nestedDaily = first(generic, ['daily','perDay','per_day','ratePerDay','rate_per_day']);
        const n = parseNumericText(nestedDaily);
        if(n !== null && n >= 0) return {value:n, basis:'PER_DAY_NESTED_SOURCE_FIELD'};
        const annual = first(generic, ['annual','perYear','per_year','annualProduction','annual_production']);
        const an = parseNumericText(annual);
        if(an !== null && an >= 0) return {value:an / 365, basis:'ANNUAL_SOURCE_FIELD_TO_DAILY'};
      }
      const n = parseNumericText(generic);
      if(n !== null && n >= 0){
        const unit = upper(first(raw,['productionRateUnit','production_rate_unit','rateUnit','rate_unit']) || '');
        const basis = upper(first(raw,['productionBasis','production_basis','ratePeriod','rate_period']) || '');
        if(/YEAR|ANNUAL/.test(unit + ' ' + basis)) return {value:n / 365, basis:'ANNUAL_SOURCE_FIELD_TO_DAILY'};
        if(/MONTH|MONTHLY/.test(unit + ' ' + basis)) return {value:n / 30, basis:'MONTHLY_SOURCE_FIELD_TO_DAILY'};
        if(/DAY|DAILY/.test(unit + ' ' + basis)) return {value:n, basis:'PER_DAY_SOURCE_FIELD'};
      }
    }

    const annual = first(raw, ['annualProduction','annual_production','annualOutput','annual_output','yearlyProduction','yearly_production']);
    const annualNumber = parseNumericText(annual);
    if(annualNumber !== null && annualNumber >= 0){
      return {value: annualNumber / 365, basis:'ANNUAL_SOURCE_FIELD_TO_DAILY'};
    }

    return {value:null, basis:'UNOBSERVED'};
  }

  function looksLikeCandidate(raw, path){
    if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;

    const pathText = lower(path);
    const explicitType = lower(first(raw,['entityType','entity_type','recordType','record_type','assetClass','asset_class','resourceEntityType']));
    const identity = first(raw,['depositId','deposit_id','mineId','mine_id','resourceInstanceId','resource_instance_id','instanceId','instance_id','occurrenceId','occurrence_id']);
    const resource = first(raw,['resId','res_id','resourceId','resource_id','resourceType','resource_type','resourceTypeId','resource_type_id','commodity','mineral']);
    const reserve = first(raw,['reserves','reserve','reserveQuantity','reserve_quantity','declaredReserve','declared_reserve','geologicalQuantity','geological_quantity']);
    const grade = first(raw,['grade','oreGrade','ore_grade','assayGrade','assay_grade']);
    const purity = first(raw,['purity','orePurity','ore_purity','quality','qualityPercent','quality_percent']);
    const rate = first(raw,['dailyOutput','daily_output','dailyProduction','daily_production','productionRate','production_rate','productionRatePerDay','production_rate_per_day','capacityPerDay','capacity_per_day']);
    const name = first(raw,['name','title','mineName','mine_name','depositName','deposit_name','siteName','site_name','fieldName','field_name']);

    if(/resource_types(?:\.|\/)/.test(pathText) && !/(mine|deposit|occurrence|field|well|quarry)/.test(pathText)) return false;
    if(/srie_database|resource_domain|resource_endowment|strategic_resources|resource_dependency|resource_quality_context|resource_potential/.test(pathText)) return false;
    if(/facility|factory|refinery|smelter|warehouse|plant/.test(explicitType + ' ' + pathText) && !/(mine|deposit|well|quarry|orebody|field)/.test(explicitType + ' ' + pathText)) return false;

    const pathSignals = /(mine|mines|deposit|deposits|occurrence|occurrences|orebody|orebodies|oilfield|gasfield|well|wells|quarry|quarries|resource_asset|resource_assets)/.test(pathText);
    const objectSignals = Boolean(identity || resource || reserve !== undefined || grade !== undefined || purity !== undefined || rate !== undefined);
    const explicitMine = /(mine|deposit|occurrence|orebody|oilfield|gasfield|well|quarry)/.test(explicitType);

    return Boolean(name && (identity || (pathSignals && objectSignals) || (explicitMine && objectSignals)));
  }

  function normalize(raw, path, dataset, contextCountry){
    const countryCode = parseCountry(raw, contextCountry);
    if(!countryCode) return null;

    const resourceRaw = first(raw, [
      'resId','res_id','resourceId','resource_id','resourceType','resource_type',
      'resourceTypeId','resource_type_id','resourceTypeKey','resource_type_key',
      'commodity','mineral','materialIdentity','material_identity'
    ]);
    const resourceId = resourceRaw ? canonicalResourceId(resourceRaw) : '';
    const name = clean(first(raw,['name','title','mineName','mine_name','depositName','deposit_name','siteName','site_name','fieldName','field_name']));
    if(!name || !resourceId) return null;

    const explicitId = clean(first(raw,['depositId','deposit_id','mineId','mine_id','resourceInstanceId','resource_instance_id','instanceId','instance_id','occurrenceId','occurrence_id','id','key']));
    const recordId = explicitId || ('DATA_' + hash(dataset + '|' + countryCode + '|' + resourceId + '|' + name));

    const rate = resolveRate(raw);
    const gradeRaw = first(raw,['grade','oreGrade','ore_grade','assayGrade','assay_grade']);
    const purityRaw = first(raw,['purity','orePurity','ore_purity','quality','qualityPercent','quality_percent']);

    const lat = parseNumericText(first(raw,['lat','latitude','coordinatesLat','coordinateLat','locationLat']));
    const lng = parseNumericText(first(raw,['lng','lon','longitude','coordinatesLng','coordinateLng','locationLng']));
    const reserves = first(raw,['reserves','reserve','reserveQuantity','reserve_quantity','declaredReserve','declared_reserve','geologicalQuantity','geological_quantity']);
    const unit = clean(first(raw,['unit','standardUnit','standard_unit','quantityUnit','quantity_unit']));
    const status = clean(first(raw,['status','operationalStatus','operational_status','miningStatus','mining_status','lifecycleStatus','lifecycle_status']));
    const owner = clean(first(raw,['owner','ownerName','owner_name','ownerKey','owner_key','licenseHolder','license_holder']));
    const operator = clean(first(raw,['operator','operatorName','operator_name','operatorKey','operator_key','operatorCompany','operator_company']));
    const locationKey = clean(first(raw,['locationNodeKey','location_node_key','locationKey','location_key','regionId','region_id','siteCode','site_code'])) || null;

    const explicitKind = lower(first(raw,['entityType','entity_type','recordType','record_type','assetClass','asset_class']));
    const kind = /mine|well|quarry|orebody|field/.test(explicitKind) ? 'MINE' : (/deposit|occurrence/.test(explicitKind) ? 'DEPOSIT' : (/(mine|well|quarry|field|orebody)/.test(lower(path)) ? 'MINE' : 'DEPOSIT'));

    return {
      id: recordId,
      name,
      title: name,
      country: countryCode,
      countryCode,
      resId: resourceId,
      resourceId,
      resourceTypeKey: resourceId,
      kind,
      reserves: reserves !== undefined ? reserves : null,
      reserve: reserves !== undefined ? reserves : null,
      unit: unit || null,
      grade: gradeRaw !== undefined ? gradeRaw : null,
      gradeValue: parsePercentLike(gradeRaw),
      purity: purityRaw !== undefined ? purityRaw : null,
      purityValue: parsePercentLike(purityRaw),
      productionRatePerDay: rate.value,
      productionRateBasis: rate.basis,
      productionRateUnit: rate.value !== null ? (unit || clean(first(raw,['productionRateUnit','production_rate_unit','rateUnit','rate_unit']))) : null,
      status: status || null,
      operationalStatus: status || null,
      owner: owner || null,
      operator: operator || null,
      lat: lat,
      lng: lng,
      locationNodeKey: locationKey,
      sourceDataset: dataset,
      sourcePath: path,
      sourceRecordId: recordId,
      sourceRaw: clone(raw),
      sourceAuthority: 'RESOURCE_JSON',
      sourceResolvedAtTick: 0
    };
  }

  function collectRecords(source, dataset){
    const records = [];
    const seen = new WeakSet();
    const rejected = { objects:0, missingCountry:0, missingIdentity:0, nonResource:0 };

    function walk(node, path, contextCountry){
      if(node === null || typeof node !== 'object') return;
      if(seen.has(node)) return;
      seen.add(node);

      let localCountry = contextCountry;
      if(!Array.isArray(node)){
        const selfCountry = parseCountry(node, contextCountry);
        if(selfCountry) localCountry = selfCountry;
        for(const key of Object.keys(node)){
          if(!localCountry && /countryprofiles?$/i.test(key)) continue;
        }
      }

      if(!Array.isArray(node) && looksLikeCandidate(node, path)){
        const row = normalize(node, path, dataset, localCountry);
        if(row) records.push(row);
        else {
          const cc = parseCountry(node, localCountry);
          if(!cc) rejected.missingCountry++;
          else rejected.missingIdentity++;
        }
      } else if(!Array.isArray(node) && Object.keys(node).length && !looksLikeCandidate(node,path)){
        rejected.nonResource++;
      }

      if(Array.isArray(node)){
        node.forEach((item, i) => walk(item, path + '[' + i + ']', localCountry));
      } else {
        for(const [key,value] of Object.entries(node)){
          let childCountry = localCountry;
          if(/^[A-Z]{3}$/.test(key) && /countryprofiles?|countries/i.test(path)) childCountry = key;
          if(/countryprofiles?/i.test(path) && /^[A-Z]{2,3}$/.test(key)) childCountry = key;
          walk(value, path ? path + '.' + key : key, childCountry);
        }
      }
    }

    walk(source, dataset, null);
    return {records, rejected};
  }

  async function fetchJson(file){
    const fetcher = g.fetch;
    if(typeof fetcher !== 'function') throw new Error('RESOURCE_DATA_FETCH_UNAVAILABLE');
    const response = await fetcher(file + '?omegaResourceData=' + VERSION);
    if(!response || !response.ok) throw new Error('RESOURCE_DATA_HTTP_' + String(response && response.status || 'UNKNOWN'));
    return response.json();
  }

  function mergeResourceTypes(sources){
    const map = new Map();
    const push = t => {
      if(!t || typeof t !== 'object') return;
      const rawId = first(t,['id','key','code','resourceId','resource_id']);
      if(!rawId) return;
      const id = canonicalResourceId(rawId);
      if(!id) return;
      map.set(id, {
        id,
        name: clean(first(t,['name','displayName','display_name'])) || id,
        category: clean(first(t,['category'])) || null,
        unit: clean(first(t,['unit','standardUnit','standard_unit','quantityUnit','quantity_unit'])) || null,
        strategicImportance: first(t,['strategicImportance','strategic_importance']) ?? null,
        description: clean(first(t,['description','processChain','process_chain'])) || null
      });
    };
    for(const source of sources){
      const roots = [
        source && source.resource_types,
        source && source.GSRSK_Master_Resource_Data_v14 && source.GSRSK_Master_Resource_Data_v14.resource_types
      ];
      roots.forEach(root => {
        if(root && typeof root === 'object' && !Array.isArray(root)) Object.values(root).forEach(push);
        else if(Array.isArray(root)) root.forEach(push);
      });
    }
    return map;
  }

  function deduplicate(records){
    const map = new Map();
    for(const row of records){
      const key = clean(row.id) || (row.countryCode + '|' + row.resourceId + '|' + upper(row.name));
      const existing = map.get(key);
      if(!existing){
        map.set(key, row);
        continue;
      }
      const merged = Object.assign({}, existing);
      for(const [k,v] of Object.entries(row)){
        if((merged[k] === null || merged[k] === '' || merged[k] === undefined) && v !== null && v !== '') merged[k] = v;
      }
      merged.sourceDatasets = Array.from(new Set([...(existing.sourceDatasets || [existing.sourceDataset]), row.sourceDataset].filter(Boolean)));
      map.set(key, merged);
    }
    return Array.from(map.values());
  }

  let initPromise = null;
  async function init(){
    if(initPromise) return initPromise;
    initPromise = (async() => {
      const engine = g.ResourceMinistryEngine || null;
      const sources = [];
      const sourceErrors = [];
      for(const file of ['resources.json','resources_2.json']){
        try{
          sources.push({file,data:await fetchJson(file)});
        }catch(error){
          sourceErrors.push({file,error:String(error && error.message || error)});
        }
      }

      const collected = [];
      const rejects = {};
      for(const source of sources){
        const out = collectRecords(source.data, source.file);
        collected.push(...out.records);
        rejects[source.file] = out.rejected;
      }

      const records = deduplicate(collected);
      const resourceTypes = mergeResourceTypes(sources.map(x => x.data));

      if(engine){
        if(resourceTypes.size){
          const existingById = new Map((engine.resourceTypes || []).map(x => [canonicalResourceId(x && x.id), x]));
          resourceTypes.forEach((row, rid) => {
            const existing = existingById.get(rid);
            if(existing){
              Object.assign(existing, {
                name: row.name || existing.name,
                category: row.category || existing.category,
                unit: row.unit || existing.unit,
                strategicImportance: row.strategicImportance ?? existing.strategicImportance,
                description: row.description || existing.description,
                sourceAuthority: 'RESOURCE_JSON'
              });
            }else{
              (engine.resourceTypes || (engine.resourceTypes = [])).push(Object.assign({}, row, {
                sourceAuthority:'RESOURCE_JSON'
              }));
            }
          });
        }

        // Critical rule: when JSON contains structured deposit/mine records,
        // replace the legacy hardcoded deposit registry instead of mixing the two.
        engine.deposits = records;
        engine.resourceDataSource = {
          authority: 'RESOURCE_JSON',
          datasets: ['resources.json','resources_2.json'],
          structuredDepositCount: records.length,
          resourceTypeCount: resourceTypes.size,
          sourceErrors: clone(sourceErrors),
          rejectionSummary: clone(rejects),
          legacyHardcodedDepositsDisabled: true
        };
        engine.resourceDataDiagnostics = {
          version: VERSION,
          status: records.length ? 'READY' : 'NO_STRUCTURED_DEPOSIT_RECORDS',
          loadedDatasets: sources.map(x => x.file),
          failedDatasets: sourceErrors.map(x => x.file),
          structuredDepositCount: records.length,
          structuredMineCount: records.filter(x => x.kind === 'MINE').length,
          structuredDepositCountByKind: {
            MINE: records.filter(x => x.kind === 'MINE').length,
            DEPOSIT: records.filter(x => x.kind === 'DEPOSIT').length
          },
          sourceRecordIds: records.slice(0,50).map(x => x.sourceRecordId)
        };
      }

      g.__OmegaResourceDataAuthorityReady = true;
      g.__OmegaResourceDataAuthorityDiagnostics = {
        version: VERSION,
        status: records.length ? 'READY' : 'NO_STRUCTURED_DEPOSIT_RECORDS',
        sourceErrors,
        structuredDepositCount: records.length,
        structuredMineCount: records.filter(x => x.kind === 'MINE').length,
        datasetsLoaded: sources.map(x => x.file),
        rejectionSummary: rejects
      };

      try{
        if(typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function'){
          g.dispatchEvent(new g.CustomEvent('OMEGA_RESOURCE_DATA_AUTHORITY_READY',{
            detail:{eventType:'OMEGA_RESOURCE_DATA_AUTHORITY_READY',payload:clone(g.__OmegaResourceDataAuthorityDiagnostics)}
          }));
        }
      }catch(_){}

      return clone(g.__OmegaResourceDataAuthorityDiagnostics);
    })();
    g.__omegaResourceDataAuthorityPromise = initPromise;
    return initPromise;
  }

  const api = Object.freeze({
    VERSION,
    init,
    diagnostics: () => clone(g.__OmegaResourceDataAuthorityDiagnostics || {
      version:VERSION,
      status:'NOT_INITIALIZED'
    }),
    getDeposits: () => clone((g.ResourceMinistryEngine && g.ResourceMinistryEngine.deposits) || [])
  });

  g.OmegaResourceDataAuthority = api;
  g.__omegaResourceDataAuthorityPromise = init();
})(typeof window !== 'undefined' ? window : globalThis);
