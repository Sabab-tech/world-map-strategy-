/* OMEGA Country Runtime Data Bridge v1.0.0
 * Canonical identity, flags, and source-backed country records.
 * Missing observations remain null; no national statistics are fabricated.
 */
(function (root) {
  'use strict';
  const state = { ready:false, settled:false, error:null, promise:null, profiles:[], extras:new Map(), byCode:new Map(), byIso3:new Map(), byNumeric:new Map(), aliases:new Map(), cities:new Map(), legacyEconomy:{}, legacyPopulation:{}, generalDataReady:false, generalDataRegistry:null, generalDataByIso3:new Map(), generalDataByCode:new Map(), generalDataMetricIndexes:new Map(), generalDataIdentityIndexes:null };
  const s = v => String(v == null ? '' : v).trim();
  const norm = v => s(v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' AND ').replace(/[_’'`-]+/g, ' ').replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
  const fixedAliases = {
    USA:'US','UNITED STATES':'US','UNITED STATES OF AMERICA':'US',UK:'GB','GREAT BRITAIN':'GB',BRITAIN:'GB',
    'RUSSIAN FEDERATION':'RU','SOUTH KOREA':'KR','REPUBLIC OF KOREA':'KR','KOREA REPUBLIC OF':'KR',
    'NORTH KOREA':'KP','TAIWAN':'TW',MACAU:'MO',MACAO:'MO','CZECH REPUBLIC':'CZ',
    'COTE D IVOIRE':'CI','IVORY COAST':'CI','DEMOCRATIC REPUBLIC OF CONGO':'CD',
    'DEMOCRATIC REPUBLIC OF THE CONGO':'CD','DR CONGO':'CD','REPUBLIC OF CONGO':'CG',
    'REPUBLIC OF THE CONGO':'CG','KOSOVO':'XK',
    'CONGO BRAZZAVILLE':'CG','BRITISH VIRGIN ISLANDS':'VG','US VIRGIN ISLANDS':'VI',
    'UNITED STATES VIRGIN ISLANDS':'VI','SINT MAARTEN':'SX','FALKLAND ISLANDS':'FK',
    MICRONESIA:'FM','FEDERATED STATES OF MICRONESIA':'FM','PITCAIRN ISLANDS':'PN',
    UAE:'AE','UNITED ARAB EMIRATES':'AE','CAPE VERDE':'CV','CABO VERDE':'CV',
    SWAZILAND:'SZ',ESWATINI:'SZ',MACEDONIA:'MK','NORTH MACEDONIA':'MK',MOLDOVA:'MD',
    LAOS:'LA',BRUNEI:'BN',BOLIVIA:'BO',VENEZUELA:'VE',IRAN:'IR',SYRIA:'SY',
    TANZANIA:'TZ',TURKEY:'TR',TURKIYE:'TR',PALESTINE:'PS'
  };
  function addAlias(value, profile, force) {
    const key = norm(value);
    if (!key || !profile) return;
    const old = state.aliases.get(key);
    if (!old || old.countryCode === profile.countryCode || force) state.aliases.set(key, profile);
  }
  function buildProfiles(rows) {
    state.profiles = rows.filter(p => p && /^[A-Z]{2}$/.test(s(p.countryCode).toUpperCase()) && s(p.name));
    state.byCode.clear(); state.byIso3.clear(); state.byNumeric.clear(); state.aliases.clear();
    state.profiles.forEach(p => {
      const code=s(p.countryCode).toUpperCase(), iso3=s(p.iso3).toUpperCase(), num=s(p.numericCode);
      state.byCode.set(code,p); if (iso3) state.byIso3.set(iso3,p); if (num) state.byNumeric.set(num.padStart(3,'0'),p);
      [p.name,p.officialName,p.shortName,p.countryCode,p.iso3,p.numericCode,p.economyKey,p.populationKey].forEach(a => addAlias(a,p,false));
    });
    Object.entries(fixedAliases).forEach(([name,code]) => { const p=state.byCode.get(code); if (p) addAlias(name,p,true); });
  }
  function buildGeneralDataRegistry(data) {
    state.generalDataReady = false;
    state.generalDataRegistry = null;
    state.generalDataByIso3.clear();
    state.generalDataByCode.clear();
    state.generalDataMetricIndexes.clear();
    state.generalDataIdentityIndexes = null;

    const schema = data && data.metadata && data.metadata.recordSchema;
    const identityFields = schema && schema.identityFields;
    const metricFields = schema && schema.metricFields;
    if (!Array.isArray(data && data.countries) ||
        !schema || schema.encoding !== 'ORDERED_VALUE_ARRAYS_V1' ||
        !Array.isArray(identityFields) || !Array.isArray(metricFields) ||
        !data.metadata.provenanceEncoding) return false;

    const indexes = {
      iso2: identityFields.indexOf('iso2'),
      iso3: identityFields.indexOf('iso3'),
      name: identityFields.indexOf('name')
    };
    if (indexes.iso2 < 0 || indexes.iso3 < 0 || indexes.name < 0) return false;

    metricFields.forEach((key, index) => {
      if (typeof key === 'string' && key) state.generalDataMetricIndexes.set(key, index);
    });
    data.countries.forEach(row => {
      if (!row || !Array.isArray(row.identity) || !Array.isArray(row.metrics) || !row.metricMetadata) return;
      const iso3 = s(row.identity[indexes.iso3]).toUpperCase();
      const iso2 = s(row.identity[indexes.iso2]).toUpperCase();
      if (!/^[A-Z]{3}$/.test(iso3) || row.metrics.length !== metricFields.length) return;
      state.generalDataByIso3.set(iso3, row);
      if (/^[A-Z]{2}$/.test(iso2)) state.generalDataByCode.set(iso2, row);
    });

    if (!state.generalDataByIso3.size) {
      state.generalDataMetricIndexes.clear();
      return false;
    }
    state.generalDataRegistry = data;
    state.generalDataIdentityIndexes = indexes;
    state.generalDataReady = true;
    return true;
  }
  function addSupplementalIdentities() {
    // Kosovo occurs in the repository's legacy economy, population, and city datasets
    // but is not part of the ISO country roster. Keep it as a transparent runtime-only
    // identity rather than losing its existing records.
    const kosovo = {
      countryCode:'XK',
      iso3:'XKX',
      numericCode:null,
      name:'Kosovo',
      officialName:'Republic of Kosovo',
      economyKey:'KOSOVO',
      populationKey:'KOSOVO',
      profileStatus:'RUNTIME_ONLY_ALIAS',
      sourceValues:null,
      populationValues:null,
      indicators:{},
      metricAvailability:{},
      provenance:{status:'LEGACY_DATASET_ALIAS; no canonical profile row'}
    };
    state.extras.set('XK', kosovo);
    ['XK','XKX','KOSOVO','REPUBLIC OF KOSOVO'].forEach(alias => addAlias(alias,kosovo,true));
  }
  function resolveCountry(value) {
    if (value && typeof value === 'object') value=value.countryCode||value.iso2||value.iso3||value.countryId||value.code||value.name;
    const key=norm(value); if (!key) return null;
    const found=state.aliases.get(key); if (found) return found;
    const compact=key.replace(/\s+/g,'');
    if (/^[A-Z]{2}$/.test(compact)) return state.byCode.get(compact)||null;
    if (/^[A-Z]{3}$/.test(compact)) return state.byIso3.get(compact)||null;
    if (/^\d{1,3}$/.test(compact)) return state.byNumeric.get(compact.padStart(3,'0'))||null;
    return null;
  }
  function flagFor(value) {
    const code=s(resolveCountry(value)?.countryCode).toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? Array.from(code,c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65)).join('') : null;
  }
  function candidateKeys(profile,input) {
    return new Set([input,profile?.countryCode,profile?.iso3,profile?.numericCode,profile?.name,profile?.officialName,profile?.economyKey,profile?.populationKey].map(norm).filter(Boolean));
  }
  function embeddedMatch(record, profile, keys) {
    if (!record || typeof record!=='object' || Array.isArray(record)) return false;
    const fields=[record.countryCode,record.country_code,record.countryId,record.country_id,record.iso2,record.iso3,record.countryName,record.country_name,record.sovereignCountryId,record.ownerCountryId].filter(v=>v!=null);
    return fields.some(v=>{const n=norm(v);const resolved=resolveCountry(v);return keys.has(n)||(profile&&resolved&&resolved.countryCode===profile.countryCode);});
  }
  function liveRecord(domain,profile,input) {
    const aliases={economy:['economy'],population:['population'],country:['countries','country']};
    const names=aliases[norm(domain).toLowerCase()]||[String(domain||'')];
    const roots=[root.Game?.state,root.gameState,root.Omega?.Simulation?.state,root.Omega?.World?.state].filter((v,i,a)=>v&&typeof v==='object'&&a.indexOf(v)===i);
    const keys=candidateKeys(profile,input);
    for (const r of roots) for (const name of names) {
      const bucket=r[name]; if (!bucket||typeof bucket!=='object') continue;
      for (const key of keys) {
        const found=Object.keys(bucket).find(k=>norm(k)===key);
        if (found!==undefined&&bucket[found]&&typeof bucket[found]==='object'&&!Array.isArray(bucket[found])) return bucket[found];
      }
      for (const value of Object.values(bucket)) if (embeddedMatch(value,profile,keys)) return value;
    }
    return null;
  }
  function legacyRecord(domain,profile,input) {
    const source=domain==='economy'?state.legacyEconomy:(domain==='population'?state.legacyPopulation:null);
    if(!source||typeof source!=='object')return null;
    const keys=candidateKeys(profile,input);
    for(const key of keys) {
      const hit=Object.keys(source).find(candidate=>norm(candidate)===key);
      if(hit!==undefined&&source[hit]&&typeof source[hit]==='object')return source[hit];
    }
    return null;
  }
  function getRecord(domain,input) {
    const kind=norm(domain).toLowerCase(), p=resolveCountry(input);
    if (['country','countries','profile'].includes(kind)) return p?Object.assign({},p):null;
    let base=null; if (p&&kind==='economy') base=p.sourceValues; if (p&&kind==='population') base=p.populationValues;
    const legacy=legacyRecord(kind,p,input);
    const live=liveRecord(kind,p,input);
    if ((!base||typeof base!=='object')&&(!legacy||typeof legacy!=='object')&&(!live||typeof live!=='object')) return null;
    return Object.assign({},legacy&&typeof legacy==='object'?legacy:{},base&&typeof base==='object'?base:{},live&&typeof live==='object'?live:{});
  }
  function getGeneralData(value) {
    if (!state.generalDataReady || !state.generalDataRegistry) return null;
    const profile = resolveCountry(value);
    if (!profile) return null;
    const row = state.generalDataByIso3.get(s(profile.iso3).toUpperCase()) ||
      state.generalDataByCode.get(s(profile.countryCode).toUpperCase());
    if (!row) return null;

    const metadata = state.generalDataRegistry.metadata || {};
    const schema = metadata.recordSchema || {};
    const enc = metadata.provenanceEncoding || {};
    const recordIdentity = {};
    (schema.identityFields || []).forEach((key, index) => {
      recordIdentity[key] = row.identity[index] === undefined ? null : row.identity[index];
    });

    const metrics = {};
    (schema.metricFields || []).forEach((key, index) => {
      const metricInfo = Array.isArray(state.generalDataRegistry.fieldCatalogue)
        ? state.generalDataRegistry.fieldCatalogue.find(field => field && field.key === key) || {}
        : {};
      const metricMeta = row.metricMetadata || {};
      const decode = (fieldName, dictionary) => {
        const valueAtIndex = Array.isArray(metricMeta[fieldName]) ? metricMeta[fieldName][index] : null;
        if (typeof valueAtIndex !== 'number' || valueAtIndex < 0 || !Array.isArray(dictionary)) return null;
        return dictionary[valueAtIndex] === undefined ? null : dictionary[valueAtIndex];
      };
      const year = Array.isArray(metricMeta.years) ? metricMeta.years[index] : null;
      const value = Array.isArray(row.metrics) ? row.metrics[index] : null;
      metrics[key] = {
        key,
        name: metricInfo.name || key,
        unit: metricInfo.unit || null,
        description: metricInfo.description || null,
        value: value === undefined ? null : value,
        year: Number.isFinite(year) ? year : null,
        status: decode('statusCodes', enc.statuses),
        sourceId: decode('sourceCodes', enc.sourceIds),
        sourceName: decode('sourceNameCodes', enc.sourceNames),
        method: decode('methodCodes', enc.methods),
        sourceUrl: Array.isArray(metricMeta.sourceUrls) ? metricMeta.sourceUrls[index] || null : null,
        note: Array.isArray(metricMeta.notes) ? metricMeta.notes[index] || null : null
      };
    });

    return {
      identity: recordIdentity,
      metrics,
      generatedAt: metadata.generatedAt || null,
      dataQualityPolicy: metadata.dataQualityPolicy || null
    };
  }
  function getGeneralMetric(value, key) {
    const data = getGeneralData(value);
    const metricKey = s(key);
    return data && data.metrics && Object.prototype.hasOwnProperty.call(data.metrics, metricKey)
      ? data.metrics[metricKey] : null;
  }
  function getCities(value) {
    const p=resolveCountry(value), row=p&&state.cities.get(p.countryCode);
    return row&&Array.isArray(row.cities)?row.cities.map(item=>Object.assign({},item)):[];
  }
  function getCapital(value) {
    const p=resolveCountry(value), row=p&&state.cities.get(p.countryCode);
    return s(row?.capital?.name)||null;
  }
  function getProfile(value) {
    const p=resolveCountry(value); if (!p) return null;
    return Object.assign({},p,{flag:flagFor(p),capital:getCapital(p.countryCode),cities:getCities(p.countryCode)});
  }
  function diagnostics() {
    const rows = Array.from(state.generalDataByIso3.values());
    const populationIndex = state.generalDataMetricIndexes.get('populationTotal');
    const gdpIndex = state.generalDataMetricIndexes.get('gdpCurrentUsd');
    return {version:'1.1.0',ready:state.ready,settled:state.settled,error:state.error,profileCount:state.profiles.length,countryIdentityCount:state.byCode.size+state.extras.size,flagCount:state.profiles.concat(Array.from(state.extras.values())).filter(p=>!!flagFor(p)).length,capitalCount:state.cities.size,profilesWithEconomy:state.profiles.filter(p=>p.sourceValues&&typeof p.sourceValues==='object').length,profilesWithPopulation:state.profiles.filter(p=>p.populationValues&&typeof p.populationValues==='object').length,legacyEconomyRecords:Object.keys(state.legacyEconomy).length,legacyPopulationRecords:Object.keys(state.legacyPopulation).length,generalDataRegistryReady:state.generalDataReady,generalDataRecordCount:state.generalDataByIso3.size,generalDataMetricCount:state.generalDataMetricIndexes.size,generalDataPopulationCoverage:populationIndex===undefined?0:rows.filter(row=>row.metrics[populationIndex]!==null&&row.metrics[populationIndex]!==undefined).length,generalDataGdpCoverage:gdpIndex===undefined?0:rows.filter(row=>row.metrics[gdpIndex]!==null&&row.metrics[gdpIndex]!==undefined).length};
  }
  async function load(path,optional) {
    if (typeof root.fetch!=='function') { if(optional)return null; throw new Error('FETCH_UNAVAILABLE:'+path); }
    const response=await root.fetch(path,{cache:'default'});
    if(!response||response.ok===false){if(optional)return null;throw new Error('DATA_FETCH_FAILED:'+path);}
    return response.json();
  }
  function init() {
    if(state.promise)return state.promise;
    state.promise=Promise.all([
      load('./economy_global_profiles_v1.json',false),
      load('./cities.json',true).catch(()=>null),
      load('./economy.json',true).catch(()=>null),
      load('./population.json',true).catch(()=>null),
      load('./country_general_data_registry_v1.json',true).catch(()=>null)
    ])
      .then(([data,cityData,economyData,populationData,generalData])=>{
        if(!data||!Array.isArray(data.countries))throw new Error('COUNTRY_PROFILE_REGISTRY_INVALID');
        buildProfiles(data.countries);
        addSupplementalIdentities();
        state.legacyEconomy=economyData&&typeof economyData==='object'?economyData:{};
        state.legacyPopulation=populationData&&typeof populationData==='object'?populationData:{};
        buildGeneralDataRegistry(generalData);
        state.cities.clear();
        (Array.isArray(cityData?.countries)?cityData.countries:[]).forEach(row=>{
          const p=row&&resolveCountry(row.name); if(p)state.cities.set(p.countryCode,row);
        });
        state.ready=true;state.settled=true;state.error=null;return true;
      }).catch(error=>{state.ready=false;state.settled=true;state.error=String(error?.message||error);return false;});
    return state.promise;
  }
  root.OmegaCountryRuntimeData=Object.freeze({version:'1.1.0',init,ready:init(),isReady:()=>state.ready,isSettled:()=>state.settled,resolveCountry,flagFor,getProfile,getRecord,getGeneralData,getGeneralMetric,getCapital,getCities,diagnostics});
})(window);
