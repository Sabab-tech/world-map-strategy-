/* OMEGA Country Runtime Data Bridge v1.0.0
 * Canonical identity, flags, and source-backed country records.
 * Missing observations remain null; no national statistics are fabricated.
 */
(function (root) {
  'use strict';
  const state = { ready:false, settled:false, error:null, promise:null, profiles:[], extras:new Map(), byCode:new Map(), byIso3:new Map(), byNumeric:new Map(), aliases:new Map(), cities:new Map(), legacyEconomy:{}, legacyPopulation:{}, strategicProfiles:new Map(), strategicProfileDiagnostics:{available:false,profileCount:0,error:null} };
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
  function getCities(value) {
    const p=resolveCountry(value), row=p&&state.cities.get(p.countryCode);
    return row&&Array.isArray(row.cities)?row.cities.map(item=>Object.assign({},item)):[];
  }
  function getCapital(value) {
    const p=resolveCountry(value), row=p&&state.cities.get(p.countryCode);
    return s(row?.capital?.name)||null;
  }
  function buildStrategicProfiles(registry) {
    const profiles = new Map();
    const schema = registry && registry.metadata && registry.metadata.recordSchema;
    const identityFields = schema && Array.isArray(schema.identityFields) ? schema.identityFields : [];
    const strategicFields = schema && Array.isArray(schema.strategicProfileFields) ? schema.strategicProfileFields : [];
    if (!registry || !Array.isArray(registry.countries) || !identityFields.length || !strategicFields.length) {
      return {
        profiles,
        diagnostics: {
          available:false,
          profileCount:0,
          error:'STRATEGIC_PROFILE_REGISTRY_MISSING_OR_SCHEMA_UNAVAILABLE',
          expectedSource:'country_general_data_registry_v1.json'
        }
      };
    }
    const fieldValue = (fields, row, key) => {
      if (Array.isArray(row)) {
        const index = fields.indexOf(key);
        return index >= 0 ? row[index] : null;
      }
      return row && typeof row === 'object' ? row[key] : null;
    };
    let invalidRows = 0;
    let validProfileCount = 0;
    for (const row of registry.countries) {
      const identityRow = row && row.identity;
      const iso2 = String(fieldValue(identityFields, identityRow, 'iso2') || fieldValue(identityFields, identityRow, 'code') || '').trim().toUpperCase();
      const iso3 = String(fieldValue(identityFields, identityRow, 'iso3') || '').trim().toUpperCase();
      const profileRow = row && row.strategicProfile;
      let profile = null;
      if (Array.isArray(profileRow)) {
        profile = Object.fromEntries(strategicFields.map((key, index) => [key, profileRow[index] === undefined ? null : profileRow[index]]));
      } else if (profileRow && typeof profileRow === 'object' && !Array.isArray(profileRow)) {
        profile = Object.assign({}, profileRow);
      }
      if (!iso2 || !profile || !profile.profileVersion || (!iso3 && !fieldValue(identityFields, identityRow, 'name'))) {
        invalidRows += 1;
        continue;
      }
      profiles.set(iso2, profile);
      validProfileCount += 1;
      if (iso3) profiles.set(iso3, profile);
      const name = fieldValue(identityFields, identityRow, 'name');
      if (name) profiles.set(norm(name), profile);
    }
    return {
      profiles,
      diagnostics: {
        available:profiles.size > 0,
        profileCount:validProfileCount,
        indexEntryCount:profiles.size,
        invalidRows,
        sourceId:'country_general_data_registry_v1.json',
        schemaVersion:registry.metadata.schemaVersion || null,
        profileVersion:registry.metadata.profileVersion || 'PER_RECORD_VERSION',
        canonicalIdentityCount:Array.isArray(registry.countries) ? registry.countries.length : 0,
        error:profiles.size ? null : 'STRATEGIC_PROFILE_REGISTRY_CONTAINS_NO_VALID_PROFILE_ROWS'
      }
    };
  }
  function getStrategicProfile(value) {
    const identity = resolveCountry(value);
    if (!identity) return null;
    return state.strategicProfiles.get(String(identity.countryCode || '').toUpperCase()) ||
      (identity.iso3 ? state.strategicProfiles.get(String(identity.iso3).toUpperCase()) : null) || null;
  }

  function getProfile(value) {
    const p=resolveCountry(value); if (!p) return null;
    return Object.assign({},p,{flag:flagFor(p),capital:getCapital(p.countryCode),cities:getCities(p.countryCode)});
  }
  function listProfiles() {
    const seen = new Map();
    state.profiles.concat(Array.from(state.extras.values())).forEach(p => {
      if (!p || !p.countryCode) return;
      const code = String(p.countryCode).trim().toUpperCase();
      if (!code) return;
      if (!seen.has(code)) seen.set(code, {
        countryCode:code,
        iso3:String(p.iso3 || '').trim().toUpperCase() || null,
        numericCode:p.numericCode == null ? null : String(p.numericCode),
        name:s(p.name),
        officialName:s(p.officialName || p.name),
        economyKey:s(p.economyKey) || null,
        populationKey:s(p.populationKey) || null,
        profileStatus:p.profileStatus || 'IDENTITY_ONLY'
      });
    });
    return Array.from(seen.values()).sort((a,b)=>a.name.localeCompare(b.name));
  }
  function diagnostics() {
    return {version:'1.1.0',ready:state.ready,settled:state.settled,error:state.error,profileCount:state.profiles.length,countryIdentityCount:state.byCode.size+state.extras.size,flagCount:state.profiles.concat(Array.from(state.extras.values())).filter(p=>!!flagFor(p)).length,capitalCount:state.cities.size,profilesWithEconomy:state.profiles.filter(p=>p.sourceValues&&typeof p.sourceValues==='object').length,profilesWithPopulation:state.profiles.filter(p=>p.populationValues&&typeof p.populationValues==='object').length,legacyEconomyRecords:Object.keys(state.legacyEconomy).length,legacyPopulationRecords:Object.keys(state.legacyPopulation).length,strategicProfiles:state.strategicProfileDiagnostics};
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
      .then(([data,cityData,economyData,populationData,strategicRegistry])=>{
        if(!data||!Array.isArray(data.countries))throw new Error('COUNTRY_PROFILE_REGISTRY_INVALID');
        buildProfiles(data.countries);
        addSupplementalIdentities();
        state.legacyEconomy=economyData&&typeof economyData==='object'?economyData:{};
        state.legacyPopulation=populationData&&typeof populationData==='object'?populationData:{};
        const strategicIndex=buildStrategicProfiles(strategicRegistry);
        state.strategicProfiles=strategicIndex.profiles;
        state.strategicProfileDiagnostics=strategicIndex.diagnostics;
        state.cities.clear();
        (Array.isArray(cityData?.countries)?cityData.countries:[]).forEach(row=>{
          const p=row&&resolveCountry(row.name); if(p)state.cities.set(p.countryCode,row);
        });
        state.ready=true;state.settled=true;state.error=null;return true;
      }).catch(error=>{state.ready=false;state.settled=true;state.error=String(error?.message||error);return false;});
    return state.promise;
  }
  root.OmegaCountryRuntimeData=Object.freeze({version:'1.1.0',init,ready:init(),isReady:()=>state.ready,isSettled:()=>state.settled,resolveCountry,flagFor,getProfile,getStrategicProfile,getRecord,getCapital,getCities,diagnostics,listProfiles});
})(window);
