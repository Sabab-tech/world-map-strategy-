/* ============================================================================
 * OMEGA RESOURCE SCIENCE / DATA-INTEGRITY RUNTIME v1.0.0
 *
 * One shared semantic layer for:
 *   - canonical resource IDs
 *   - quantity parsing and unit dimensions
 *   - multi-commodity reserve evidence
 *   - grade / concentration / assay / purity separation
 *   - explicit OBSERVED vs SIMULATED authority
 *
 * This file never invents geological facts. Simulation baselines are only used
 * when an explicit runtime ruleset authorizes them, and remain SIMULATION data.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';

  const RESOURCE_IDS=Object.freeze([
    'rare_earth','lithium','cobalt','nickel','copper','crude_oil','natural_gas',
    'uranium','gold','bauxite','phosphate','potash','iron_ore','coal'
  ]);

  const ALIASES=Object.freeze({
    petroleum:'crude_oil',petroleum_oil:'crude_oil',crude:'crude_oil',oil:'crude_oil',
    gas:'natural_gas',lng:'natural_gas',methane:'natural_gas',
    ree:'rare_earth','rare_earths':'rare_earth','rare-earth':'rare_earth','rare_earth_elements':'rare_earth',
    fe:'iron_ore',iron:'iron_ore',ironore:'iron_ore',
    au:'gold',cu:'copper',ni:'nickel',co:'cobalt',
    al:'bauxite',alumina:'bauxite',bauxite_aluminum:'bauxite',
    u:'uranium',u3o8:'uranium',
    li:'lithium',lce:'lithium','lithium_carbonate_equivalent':'lithium',
    p2o5:'phosphate',phosphate_rock:'phosphate',
    k2o:'potash',potassium:'potash'
  });

  const UNIT_DEFS=Object.freeze({
    TONNES:{dimension:'MASS',toBase:1,aliases:['TON','TONS','TONNE','TONNES','METRIC_TON','METRIC_TONS','MT','T']},
    KG:{dimension:'MASS',toBase:0.001,aliases:['KG','KGS','KILOGRAM','KILOGRAMS']},
    GRAMS:{dimension:'MASS',toBase:0.000001,aliases:['G','GM','GMS','GRAM','GRAMS']},
    TROY_OZ:{dimension:'MASS',toBase:0.0000311034768,aliases:['OZ','OZT','TROY_OZ','TROY_OUNCE','TROY_OUNCES']},
    LBS:{dimension:'MASS',toBase:0.00045359237,aliases:['LB','LBS','POUND','POUNDS']},
    BARRELS:{dimension:'VOLUME',toBase:0.158987294928,aliases:['BBL','BBLS','BARREL','BARRELS']},
    BCM:{dimension:'VOLUME',toBase:1000000000,aliases:['BCM','BILLION_CUBIC_METERS']},
    TCF:{dimension:'VOLUME',toBase:28316846592,aliases:['TCF','TRILLION_CUBIC_FEET']},
    CUBIC_METERS:{dimension:'VOLUME',toBase:1,aliases:['M3','M^3','CUBIC_METER','CUBIC_METERS']},
    LITERS:{dimension:'VOLUME',toBase:0.001,aliases:['L','LT','LITER','LITERS','LITRE','LITRES']},
    METRIC_TONS_U:{dimension:'MASS',toBase:1,aliases:['METRIC_TONS_U','TONNES_U','T_U']},
    METRIC_TONS_LCE:{dimension:'MASS',toBase:1,aliases:['METRIC_TONS_LCE','TONNES_LCE','LCE_TONS']},
    BARRELS_PER_DAY:{dimension:'VOLUME_RATE',toBase:1,aliases:['BBL/D','BBLS/D','BARRELS/DAY','BARRELS_PER_DAY']},
    BCM_PER_YEAR:{dimension:'VOLUME_RATE',toBase:1,aliases:['BCM/YEAR','BCM_PER_YEAR','BCM/A']},
    TONNES_PER_DAY:{dimension:'MASS_RATE',toBase:1,aliases:['T/D','TONNES/DAY','TONS/DAY','TONNES_PER_DAY','METRIC_TONS_PER_DAY']},
    TROY_OZ_PER_DAY:{dimension:'MASS_RATE',toBase:1,aliases:['OZ/D','OZT/DAY','TROY_OZ_PER_DAY']}
  });

  const RESOURCE_DEFAULT_UNITS=Object.freeze({
    crude_oil:'BARRELS',natural_gas:'BCM',gold:'TROY_OZ',uranium:'METRIC_TONS_U',
    lithium:'METRIC_TONS_LCE',rare_earth:'TONNES',cobalt:'TONNES',nickel:'TONNES',
    copper:'TONNES',bauxite:'TONNES',phosphate:'TONNES',potash:'TONNES',iron_ore:'TONNES',coal:'TONNES'
  });

  const normalizeResourceId=v=>{
    const raw=String(v??'').normalize('NFKC').trim().toLowerCase()
      .replace(/^res_type:/,'').replace(/[-\s]+/g,'_');
    if(!raw)return null;
    return RESOURCE_IDS.includes(raw)?raw:(ALIASES[raw]||null);
  };

  const normalizeUnit=v=>{
    const raw=String(v??'').normalize('NFKC').trim().toUpperCase().replace(/\s+/g,'_');
    if(!raw)return null;
    for(const [key,def] of Object.entries(UNIT_DEFS)){
      if(key===raw||def.aliases.includes(raw))return{unit:key,dimension:def.dimension,toBase:def.toBase};
    }
    return null;
  };

  function numberWithMultiplier(numberText,multiplierText){
    const value=Number(String(numberText).replace(/,/g,''));
    if(!Number.isFinite(value))return null;
    const m=String(multiplierText||'').trim().toUpperCase();
    const factor=m==='K'||m==='THOUSAND'?1e3:m==='M'||m==='MILLION'?1e6:
      m==='B'||m==='BILLION'?1e9:m==='T'||m==='TRILLION'?1e12:1;
    return value*factor;
  }

  function scanQuantityTokens(text){
    const raw=String(text||'');
    const re=/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(K|M|B|T|THOUSAND|MILLION|BILLION|TRILLION)?\s*(BBL|BBLS|BARRELS?|TCF|BCM|M3|M\^3|TONNES?|TONS?|MT|T|OZ|OZT|KG|KGS|GRAMS?|G|G\/T|MG\/L|%|API(?:\s*GRAVITY)?|LCE)\b/gi;
    const out=[]; let m;
    while((m=re.exec(raw))){
      const numeric=numberWithMultiplier(m[1],m[2]);
      if(numeric===null)continue;
      out.push({
        value:numeric,rawValue:m[1],multiplier:m[2]||null,unit:String(m[3]).toUpperCase(),
        start:m.index,end:re.lastIndex,text:raw.slice(Math.max(0,m.index-24),Math.min(raw.length,re.lastIndex+48))
      });
    }
    return out;
  }

  function inferResourceFromSegment(segment,unit,primary){
    const s=String(segment||'').toLowerCase();
    const explicit=normalizeResourceId(
      s.includes('u3o8')?'uranium':s.includes('lce')?'lithium':s.includes('reo')||s.includes('ndpr')?'rare_earth':
      /\bfe\b|iron/.test(s)?'iron_ore':/\bcu\b|copper/.test(s)?'copper':
      /\bni\b|nickel/.test(s)?'nickel':/\bco\b|cobalt/.test(s)?'cobalt':
      /bauxite|al2o3|alumina/.test(s)?'bauxite':/p2o5|phosphate/.test(s)?'phosphate':
      /k2o|potash|potassium/.test(s)?'potash':/gold|\bau\b/.test(s)?'gold':
      /natural gas|methane|gas\b/.test(s)?'natural_gas':/oil|petroleum|bbl/.test(s)?'crude_oil':null
    );
    if(explicit)return explicit;
    if(unit==='OZ'||unit==='OZT')return'gold';
    if(unit==='BBL'||unit==='BBLS'||/BARREL/.test(unit))return'crude_oil';
    if(unit==='TCF'||unit==='BCM')return'natural_gas';
    return primary||null;
  }

  function toCanonicalQuantity(value,fromUnit,targetUnit){
    const from=normalizeUnit(fromUnit),to=normalizeUnit(targetUnit);
    if(!from||!to||from.dimension!==to.dimension)return null;
    return value*from.toBase/to.toBase;
  }

  function parseReserveComponents(rawText,primaryResourceId=null,targetUnit=null){
    const text=String(rawText||'').trim();
    if(!text)return[];
    const primary=normalizeResourceId(primaryResourceId);
    const tokens=scanQuantityTokens(text);
    const components=[]; const seen=new Set();
    for(const t of tokens){
      const segment=text.slice(t.start,Math.min(text.length,t.end+36));
      const unit=t.unit;
      let rid=inferResourceFromSegment(segment,unit,primary);
      if(unit==='G/T'||unit==='MG/L'||unit==='%'||/^API/.test(unit))continue;
      rid=normalizeResourceId(rid||primary);
      if(!rid)continue;
      let canonicalUnit=targetUnit||RESOURCE_DEFAULT_UNITS[rid]||null;
      if(rid==='natural_gas'&&unit==='TCF')canonicalUnit='BCM';
      if(rid==='crude_oil'&&unit==='BBL')canonicalUnit='BARRELS';
      if(rid==='gold'&&['TON','TONS','TONNE','TONNES','MT'].some(x=>unit===x))canonicalUnit='TROY_OZ';
      const converted=toCanonicalQuantity(t.value,unit,canonicalUnit);
      if(converted===null)continue;
      const key=rid+'|'+canonicalUnit+'|'+String(converted);
      if(seen.has(key))continue;
      seen.add(key);
      components.push({
        resourceId:rid,quantity:converted,unit:canonicalUnit,sourceUnit:unit,
        sourceText:text.slice(Math.max(0,t.start-16),Math.min(text.length,t.end+28)),
        authority:'RESOURCE_JSON',epistemicState:'DECLARED'
      });
    }
    if(components.length===0&&primary){
      const generic=text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
      if(generic){
        const v=Number(generic[1].replace(/,/g,''));
        if(Number.isFinite(v)&&v>0)components.push({
          resourceId:primary,quantity:v,unit:targetUnit||RESOURCE_DEFAULT_UNITS[primary]||null,
          sourceUnit:null,sourceText:text,authority:'RESOURCE_JSON',epistemicState:'DECLARED',
          parseStatus:'UNRESOLVED_UNIT'
        });
      }
    }
    return components;
  }

  function parsePrimaryReserve(rawText,resourceId,targetUnit=null){
    const rid=normalizeResourceId(resourceId), components=parseReserveComponents(rawText,rid,targetUnit);
    if(!components.length)return{quantity:null,targetUnit:targetUnit||RESOURCE_DEFAULT_UNITS[rid]||null,sourceUnit:null,components:[]};
    let selected=components.find(x=>x.resourceId===rid)||components[0];
    if(rid==='gold'){
      const oz=components.find(x=>x.resourceId==='gold'&&x.unit==='TROY_OZ');
      if(oz)selected=oz;
    }
    return{quantity:selected.quantity,targetUnit:selected.unit,sourceUnit:selected.sourceUnit,components};
  }

  function parseRate(value,resourceId,targetRateUnit=null){
    const rid=normalizeResourceId(resourceId),defaultRateUnit=targetRateUnit||
      (rid==='crude_oil'?'BARRELS_PER_DAY':rid==='natural_gas'?'BCM_PER_YEAR':
       rid==='gold'?'TROY_OZ_PER_DAY':'TONNES_PER_DAY');
    if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return{value,unit:defaultRateUnit,authority:'RESOURCE_JSON'};
    const text=String(value??'').trim(); if(!text)return{value:null,unit:defaultRateUnit,authority:'UNOBSERVED'};
    const m=text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(K|M|B|T|THOUSAND|MILLION|BILLION|TRILLION)?\s*(BBL(?:S)?(?:\s*\/\s*(?:DAY|D))?|BARRELS?\s*\/\s*DAY|BCM(?:\s*\/\s*(?:YEAR|Y))?|TCF(?:\s*\/\s*(?:YEAR|Y))?|TONS?\s*\/\s*DAY|TONNES?\s*\/\s*DAY|MT\s*\/\s*DAY|OZ\s*\/\s*DAY|OZT\s*\/\s*DAY)/i);
    if(!m)return{value:null,unit:defaultRateUnit,authority:'UNOBSERVED'};
    const n=numberWithMultiplier(m[1],m[2]); if(n===null)return{value:null,unit:defaultRateUnit,authority:'INVALID'};
    const u=m[3].toUpperCase().replace(/\s+/g,'');
    if(rid==='natural_gas'&&u.startsWith('TCF'))return{value:n*28.316846592,unit:'BCM_PER_YEAR',authority:'RESOURCE_JSON'};
    if(rid==='crude_oil')return{value:n,unit:'BARRELS_PER_DAY',authority:'RESOURCE_JSON'};
    if(u.includes('OZ'))return{value:n,unit:'TROY_OZ_PER_DAY',authority:'RESOURCE_JSON'};
    return{value:n,unit:'TONNES_PER_DAY',authority:'RESOURCE_JSON'};
  }

  function parseQuality(text,resourceId){
    const raw=String(text||'').trim(),rid=normalizeResourceId(resourceId);
    const q={
      purity:null,purityStatus:'UNOBSERVED',
      gradePercent:null,gradeBasis:null,gradeStatus:'UNOBSERVED',
      assayGpt:null,concentrationMgPerL:null,apiGravity:null,
      sourceAuthority:raw?'RESOURCE_JSON':'UNOBSERVED'
    };
    if(!raw)return q;
    let m=raw.match(/\bpurity\b\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    if(m){const p=Number(m[1]);if(p>=0&&p<=100){q.purity=p/100;q.purityStatus='OBSERVED';}}
    m=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*(Fe|Cu|Ni|Co|Li2O|Al2O3|U3O8|REO|NdPr|P2O5|K2O)\b/i);
    if(m){q.gradePercent=Number(m[1]);q.gradeBasis=m[2].toUpperCase();q.gradeStatus='OBSERVED';}
    if(rid==='natural_gas'){
      m=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:pure\s+)?(?:methane|CH4|gas)\b/i) ||
        raw.match(/(?:pure\s+)?(?:methane|CH4|gas)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
      if(m){q.gradePercent=Number(m[1]);q.gradeBasis='METHANE_CONCENTRATION';q.gradeStatus='OBSERVED';}
    }
    m=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*°?\s*API\b/i);
    if(m){q.apiGravity=Number(m[1]);q.gradeBasis='API_GRAVITY';q.gradeStatus='OBSERVED';}
    m=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*g\s*\/\s*t\b/i);
    if(m){q.assayGpt=Number(m[1]);q.gradeBasis=q.gradeBasis||'ORE_ASSAY_GPT';q.gradeStatus='OBSERVED';}
    m=raw.match(/([0-9]+(?:\.[0-9]+)?)\s*mg\s*\/\s*l\b/i);
    if(m){q.concentrationMgPerL=Number(m[1]);q.gradeBasis=q.gradeBasis||'SOLUTE_CONCENTRATION_MG_L';q.gradeStatus='OBSERVED';}
    return q;
  }

  function authorityFor(value){
    const state=String(value?.sourceAuthority||value?.authority||'').toUpperCase();
    if(state==='RESOURCE_JSON'||state==='OBSERVED'||state==='DECLARED')return'OBSERVED';
    if(state==='SIMULATION_RULESET'||state==='SIMULATED'||state==='SIMULATION')return'SIMULATED';
    return'UNOBSERVED';
  }

  function minConstraintFactor(factors){
    const values=Object.values(factors||{}).map(Number).filter(x=>Number.isFinite(x));
    return values.length?Math.max(0,Math.min(1,...values)):1;
  }

  function capacityModel(input={}){
    const nominal=Number(input.nominalRate);
    const effort=Number.isFinite(Number(input.effortUtilization))?Number(input.effortUtilization):1;
    const factors=Object.assign({},input.constraintFactors||{});
    const constraint=minConstraintFactor(factors);
    const effective=Math.max(0,Math.min(1,effort,constraint));
    return{
      nominalRate:Number.isFinite(nominal)?Math.max(0,nominal):0,
      effortUtilization:Math.max(0,Math.min(1,effort)),
      constraintFactors:factors,
      effectiveUtilization:effective,
      effectiveRate:(Number.isFinite(nominal)?Math.max(0,nominal):0)*effective,
      authority:input.authority||'UNOBSERVED',
      modelVersion:VERSION
    };
  }

  const API=Object.freeze({
    VERSION,RESOURCE_IDS,ALIASES,UNIT_DEFS,RESOURCE_DEFAULT_UNITS,
    normalizeResourceId,normalizeUnit,scanQuantityTokens,toCanonicalQuantity,
    parseReserveComponents,parsePrimaryReserve,parseRate,parseQuality,
    authorityFor,minConstraintFactor,capacityModel
  });
  g.Omega=g.Omega||{};
  g.Omega.ResourceScienceRuntime=API;
  g.OmegaResourceScienceRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
