#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE=path.join(ROOT,'country_factory_starting_baseline_v1.json');
const SECTORS=path.join(ROOT,'country_sector_profiles_v1.json');
const T={"U":"UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT","S":"STEEL_AND_ALLOY_WORKS","N":"NON_FERROUS_METAL_SMELTER","P":"PETROCHEMICAL_POLYMER_PLANT","F":"FERTILIZER_CHEMICAL_PLANT","C":"INDUSTRIAL_CHEMICALS_GAS_PLANT","M":"CEMENT_CONCRETE_PLANT","G":"GLASS_CERAMICS_PLANT","R":"PAPER_PACKAGING_MILL","FD":"FOOD_PROCESSING_COLD_CHAIN","TX":"TEXTILE_GARMENT_MILL","MA":"INDUSTRIAL_MACHINERY_MACHINE_TOOLS","GR":"GRID_EQUIPMENT_FACTORY","EL":"ELECTRONICS_SEMICONDUCTOR_FAB","B":"BATTERY_ENERGY_STORAGE_PLANT","V":"VEHICLE_TRUCK_BUS_ASSEMBLY","SH":"SHIP_RAIL_EQUIPMENT_YARD","A":"AEROSPACE_EQUIPMENT_PLANT","PH":"PHARMA_MEDICAL_SUPPLIES_PLANT","D":"DEFENSE_EQUIPMENT_FACTORY","RC":"RECYCLING_WASTE_PROCESSING_PLANT"}, TYPES=["UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT","STEEL_AND_ALLOY_WORKS","NON_FERROUS_METAL_SMELTER","PETROCHEMICAL_POLYMER_PLANT","FERTILIZER_CHEMICAL_PLANT","INDUSTRIAL_CHEMICALS_GAS_PLANT","CEMENT_CONCRETE_PLANT","GLASS_CERAMICS_PLANT","PAPER_PACKAGING_MILL","FOOD_PROCESSING_COLD_CHAIN","TEXTILE_GARMENT_MILL","INDUSTRIAL_MACHINERY_MACHINE_TOOLS","GRID_EQUIPMENT_FACTORY","ELECTRONICS_SEMICONDUCTOR_FAB","BATTERY_ENERGY_STORAGE_PLANT","VEHICLE_TRUCK_BUS_ASSEMBLY","SHIP_RAIL_EQUIPMENT_YARD","AEROSPACE_EQUIPMENT_PLANT","PHARMA_MEDICAL_SUPPLIES_PLANT","DEFENSE_EQUIPMENT_FACTORY","RECYCLING_WASTE_PROCESSING_PLANT"], POOLS={"AGRICULTURE":["FOOD_PROCESSING_COLD_CHAIN","FERTILIZER_CHEMICAL_PLANT","PAPER_PACKAGING_MILL","CEMENT_CONCRETE_PLANT"],"INDUSTRY_HIGH":["STEEL_AND_ALLOY_WORKS","CEMENT_CONCRETE_PLANT","INDUSTRIAL_CHEMICALS_GAS_PLANT","INDUSTRIAL_MACHINERY_MACHINE_TOOLS","FOOD_PROCESSING_COLD_CHAIN","TEXTILE_GARMENT_MILL","PAPER_PACKAGING_MILL","RECYCLING_WASTE_PROCESSING_PLANT"],"INDUSTRY_OTHER":["STEEL_AND_ALLOY_WORKS","NON_FERROUS_METAL_SMELTER","PETROCHEMICAL_POLYMER_PLANT","FERTILIZER_CHEMICAL_PLANT","INDUSTRIAL_CHEMICALS_GAS_PLANT","CEMENT_CONCRETE_PLANT","GLASS_CERAMICS_PLANT"],"SERVICES_HIGH":["FOOD_PROCESSING_COLD_CHAIN","TEXTILE_GARMENT_MILL","PAPER_PACKAGING_MILL","INDUSTRIAL_MACHINERY_MACHINE_TOOLS","CEMENT_CONCRETE_PLANT","RECYCLING_WASTE_PROCESSING_PLANT"],"SERVICES_MODERATE":["FOOD_PROCESSING_COLD_CHAIN","TEXTILE_GARMENT_MILL","PAPER_PACKAGING_MILL","CEMENT_CONCRETE_PLANT","FERTILIZER_CHEMICAL_PLANT"],"SERVICES_LOW":["FOOD_PROCESSING_COLD_CHAIN","CEMENT_CONCRETE_PLANT","TEXTILE_GARMENT_MILL","PAPER_PACKAGING_MILL"],"MIXED":["FOOD_PROCESSING_COLD_CHAIN","STEEL_AND_ALLOY_WORKS","CEMENT_CONCRETE_PLANT","TEXTILE_GARMENT_MILL","INDUSTRIAL_MACHINERY_MACHINE_TOOLS","PAPER_PACKAGING_MILL"]};
const SET=new Set(TYPES);
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function readInputs(r,p){
 const s=r.economicSectorContext?.valueAddedShares||{},q=p?.derivedMetrics?.industrialScaleProxyIndex||{};
 return {ag:num(s.agricultureValueAddedPctGdp?.value),ind:num(s.industryValueAddedPctGdp?.value),man:num(s.manufacturingValueAddedPctGdp?.value),emp:num(s.agricultureEmploymentPct?.value),comparison:r.economicSectorContext?.comparisonStatus||'MISSING',year:num(r.economicSectorContext?.comparisonYear),dominant:r.economicSectorContext?.dominantSector||null,band:r.economicSectorContext?.manufacturingBand||'NOT_COMPARABLE',years:{ag:num(s.agricultureValueAddedPctGdp?.year),ind:num(s.industryValueAddedPctGdp?.year),man:num(s.manufacturingValueAddedPctGdp?.year),emp:num(s.agricultureEmploymentPct?.year)},proxy:{value:q.status==='COMPUTED_FROM_RECORDED_INPUTS'?num(q.value):null,status:q.status||'MISSING',unit:q.unit||'peer-relative index 0-100',modelId:q.modelId||null,note:q.note||null}};
}
function macroPool(x){
 if(!['SAME_YEAR_COMPARABLE','PARTIAL_SAME_YEAR_COMPARABLE'].includes(x.comparison)||!Number.isInteger(x.year)||!x.dominant)return [];
 if(x.dominant==='AGRICULTURE')return POOLS.AGRICULTURE;
 if(x.dominant==='INDUSTRY')return x.band==='HIGH'?POOLS.INDUSTRY_HIGH:POOLS.INDUSTRY_OTHER;
 if(x.dominant==='SERVICES')return x.band==='HIGH'?POOLS.SERVICES_HIGH:x.band==='MODERATE'?POOLS.SERVICES_MODERATE:POOLS.SERVICES_LOW;
 if(x.dominant==='MIXED')return POOLS.MIXED;
 return [];
}
function archetypePool(v){
 const a=String(v||'').toLowerCase();
 if(/textile|garment/.test(a))return [T.TX,T.FD,T.R];
 if(/petrochem|energy/.test(a))return [T.P,T.F,T.C];
 if(/metals|heavy industry/.test(a))return [T.S,T.N,T.M,T.MA];
 if(/machinery|precision/.test(a))return [T.MA,T.GR,T.EL];
 if(/electronics|semiconductor/.test(a))return [T.EL,T.B,T.MA,T.GR];
 if(/pharma|medical/.test(a))return [T.PH,T.MA,T.R];
 if(/food processing|agro/.test(a))return [T.FD,T.F,T.R];
 if(/automotive/.test(a))return [T.V,T.MA,T.S];
 if(/aerospace|defen[cs]e/.test(a))return [T.A,T.D,T.MA];
 if(/mineral beneficiation/.test(a))return [T.N,T.FD,T.M];
 if(/advanced manufacturing/.test(a))return [T.MA,T.GR,T.EL,T.SH];
 return [];
}
function weight(t,x){
 const a=x.ag||0,i=x.ind||0,m=x.man||0,e=x.emp||0,z=x.proxy.value===null?50:x.proxy.value;
 const w={[T.FD]:1+a/45+e/140,[T.F]:.9+a/75+e/180,[T.R]:.85+a/130,[T.TX]:.85+e/170+m/150,[T.M]:.8+i/120,[T.S]:.8+i/100,[T.N]:.75+i/120,[T.P]:.75+i/160,[T.C]:.8+i/130+m/200,[T.G]:.7+i/160,[T.MA]:.75+m/45+z/180,[T.GR]:.7+m/55+z/220,[T.EL]:.65+m/45+z/160,[T.B]:.6+m/65+z/200,[T.V]:.65+m/60+z/220,[T.SH]:.55+i/220+z/300,[T.A]:.4+z/300,[T.PH]:.6+m/120+z/250,[T.D]:.4+z/320,[T.RC]:.6+m/150+i/220};
 return w[t]||.5;
}
function factor(t,v){
 const a=String(v||'').toLowerCase();let f=1;
 if(/textile|garment/.test(a)&&t===T.TX)f*=1.85;
 if(/textile and food/.test(a)&&[T.TX,T.FD].includes(t))f*=1.35;
 if(/petrochem|energy/.test(a)){if(t===T.P)f*=1.75;if([T.F,T.C].includes(t))f*=1.35;}
 if(/metals|heavy industry/.test(a)){if(t===T.S)f*=1.65;if(t===T.N)f*=1.35;if([T.MA,T.SH].includes(t))f*=1.15;}
 if(/machinery|precision/.test(a)){if(t===T.MA)f*=1.8;if(t===T.GR)f*=1.25;}
 if(/electronics|semiconductor/.test(a)){if(t===T.EL)f*=1.8;if([T.B,T.GR].includes(t))f*=1.2;}
 if(/pharma|medical/.test(a)&&t===T.PH)f*=1.85;
 if(/food processing/.test(a)&&t===T.FD)f*=1.8;
 if(/automotive/.test(a)){if(t===T.V)f*=1.7;if(t===T.MA)f*=1.25;}
 if(/aerospace|defen[cs]e/.test(a)&&[T.A,T.D].includes(t))f*=1.7;
 if(/mineral beneficiation/.test(a)){if(t===T.N)f*=1.55;if(t===T.FD)f*=1.25;}
 if(/advanced manufacturing/.test(a)&&[T.MA,T.GR,T.EL,T.SH].includes(t))f*=1.25;
 return f;
}
function distribute(total,u,candidates,weights){
 const available=total-u;
 if(!candidates.length||candidates.length>available)throw new Error('FACTORY_ALLOCATION_CANDIDATE_BUDGET_INVALID');
 const counts=Object.fromEntries(TYPES.map(t=>[t,0]));counts[T.U]=u;candidates.forEach(t=>{counts[t]=1;});
 const spare=available-candidates.length,sum=candidates.reduce((a,t)=>a+weights[t],0);
 if(!Number.isFinite(sum)||sum<=0)throw new Error('FACTORY_ALLOCATION_WEIGHT_TOTAL_INVALID');
 const remainders=candidates.map(t=>{const raw=spare*weights[t]/sum,n=Math.floor(raw);counts[t]+=n;return {type:t,fraction:raw-n};}).sort((a,b)=>b.fraction-a.fraction||a.type.localeCompare(b.type));
 const left=total-Object.values(counts).reduce((a,b)=>a+b,0);
 for(let i=0;i<left;i++)counts[remainders[i].type]++;
 return counts;
}
export function applyCountryFactoryAllocationV2(baseline,sectorProfiles){
 if(!baseline?.countries||!Array.isArray(baseline.factoryTypes)||!sectorProfiles?.countries)throw new Error('COUNTRY_FACTORY_ALLOCATION_V2_INPUT_INVALID');
 const ids=Object.keys(baseline.countries).sort(), typeIds=baseline.factoryTypes.map(x=>x.id).sort();
 if(ids.length!==197||baseline.countryCount!==197||typeIds.length!==21||typeIds.join('|')!==[...TYPES].sort().join('|'))throw new Error('COUNTRY_FACTORY_ALLOCATION_V2_CANONICAL_MATRIX_INVALID');
 const profiles=new Map();
 Object.values(sectorProfiles.countries).forEach(p=>{const id=String(p?.identity?.iso3||'').toUpperCase();if(!id)return;if(profiles.has(id))throw new Error('DUPLICATE_SECTOR_PROFILE:'+id);profiles.set(id,p);});
 const out={},typeCoverage=Object.fromEntries(TYPES.map(t=>[t,0]));
 let source=0,high=0,moderate=0,modelled=0,macro=0,preserved=0,totalUnits=0;
 for(const id of ids){
  const r=baseline.countries[id],n=num(r?.totalStartingFactoryUnits);
  if(!r?.factoryCounts||!Number.isInteger(n)||n<0)throw new Error('COUNTRY_RECORD_INVALID:'+id);
  if(Object.keys(r.factoryCounts).sort().join('|')!==typeIds.join('|')||Object.values(r.factoryCounts).some(v=>!Number.isInteger(v)||v<0)||Object.values(r.factoryCounts).reduce((a,b)=>a+b,0)!==n)throw new Error('INPUT_COUNTS_INVALID:'+id);
  const u=num(r.factoryAllocationV2?.universalBaselineUnits)??num(r.factoryCounts[T.U])??0,available=n-u;
  if(!Number.isInteger(u)||u<0||u>n)throw new Error('UNIVERSAL_UNITS_INVALID:'+id);
  const specs=[...new Set((r.specializations||[]).map(v=>String(v).toUpperCase()))];
  if(specs.some(t=>!SET.has(t)||t===T.U)||specs.length>available)throw new Error('SPECIALIZATION_BUDGET_INVALID:'+id);
  const x=readInputs(r,profiles.get(id)),mp=macroPool(x).filter(t=>SET.has(t)&&t!==T.U),ap=archetypePool(r.industryArchetype).filter(t=>SET.has(t)&&t!==T.U);
  const ev=r.specializationEvidence,backed=specs.length>0&&ev?.status==='SOURCE_BACKED_SIMULATION_MAPPING'&&Array.isArray(ev.sources)&&ev.sources.length>0&&['HIGH','MODERATE'].includes(ev.confidence);
  const target=Math.max(3,Math.min(7,Math.round(Math.sqrt(Math.max(1,n)))));
  let status,basis,confidence,candidates=[],support=[],supportConfidence='NOT_APPLIED',counts;
  if(specs.length){
   status='SPECIALIZATION_WEIGHTED_SIMULATION';basis=backed?'SOURCE_BACKED_SPECIALIZATION':'EXISTING_GAME_SPECIALIZATION_PROFILE';confidence=backed?ev.confidence:'MODELLED';candidates=[...specs];
   const supportPool=[...new Set([...ap,...mp])].filter(t=>!candidates.includes(t)).sort((a,b)=>(weight(b,x)*factor(b,r.industryArchetype))-(weight(a,x)*factor(a,r.industryArchetype))||a.localeCompare(b));
   const wanted=Math.max(0,target-(u>0?1:0)-candidates.length),capacity=Math.max(0,available-candidates.length);
   support=supportPool.slice(0,Math.min(wanted,capacity));candidates.push(...support);
   if(support.length){const hm=support.some(t=>mp.includes(t)),ha=support.some(t=>ap.includes(t));supportConfidence=hm&&ha?'MACRO_AND_ARCHETYPE_MODELLED':hm?'MACRO_MODELLED':'ARCHETYPE_MODELLED';}
   const w={};candidates.forEach(t=>{w[t]=weight(t,x)*factor(t,r.industryArchetype)*(specs.includes(t)?(backed?4.4:3.5):1);});
   counts=distribute(n,u,candidates,w);
   if(backed){source++;if(ev.confidence==='HIGH')high++;else moderate++;if(support.length)confidence=ev.confidence+'_WITH_MODELLED_SUPPORT';}
   else{modelled++;if(support.length)confidence='MODELLED_WITH_SUPPORT';}
  }else if(mp.length&&['SAME_YEAR_COMPARABLE','PARTIAL_SAME_YEAR_COMPARABLE'].includes(x.comparison)){
   status='MACRO_SECTOR_WEIGHTED_SIMULATION';basis='WORLD_BANK_BROAD_SECTOR_PROFILE';confidence='LOW';
   const count=Math.min(available,Math.max(1,target-(u>0?1:0)));
   candidates=[...mp].sort((a,b)=>(weight(b,x)*factor(b,r.industryArchetype))-(weight(a,x)*factor(a,r.industryArchetype))||a.localeCompare(b)).slice(0,count);
   if(candidates.length){const w={};candidates.forEach(t=>{w[t]=weight(t,x)*factor(t,r.industryArchetype);});counts=distribute(n,u,candidates,w);support=[...candidates];supportConfidence='LOW_MACRO_ONLY';macro++;}
   else{status='PRESERVED_NO_COMPARABLE_PROFILE';basis='NO_COMPARABLE_SECTOR_OR_SUBSECTOR_EVIDENCE';confidence='NOT_COMPARABLE';counts={...r.factoryCounts};preserved++;}
  }else{status='PRESERVED_NO_COMPARABLE_PROFILE';basis='NO_COMPARABLE_SECTOR_OR_SUBSECTOR_EVIDENCE';confidence='NOT_COMPARABLE';counts={...r.factoryCounts};preserved++;}
  if(Object.keys(counts).sort().join('|')!==typeIds.join('|')||Object.values(counts).some(v=>!Number.isInteger(v)||v<0)||Object.values(counts).reduce((a,b)=>a+b,0)!==n||counts[T.U]!==u)throw new Error('OUTPUT_INVALID:'+id);
  const active=TYPES.filter(t=>counts[t]>0);active.forEach(t=>typeCoverage[t]++);
  const notes=[];
  if(backed)notes.push('Primary factory types map to the country specialization evidence retained in specializationEvidence. Their quantities are game-scaled, not observed facility counts.');
  else if(specs.length)notes.push('Primary factory types retain the pre-existing game-authored specialization profile. No real-world facility totals are claimed.');
  if(support.length&&specs.length)notes.push('Additional support types are modelled from broad macro-sector and/or archetype context; they are not individually source-verified.');
  if(status==='MACRO_SECTOR_WEIGHTED_SIMULATION')notes.push('Broad same-year sector shares support only a low-confidence game allocation. They do not prove that each listed factory subsector exists in the country.');
  if(status==='PRESERVED_NO_COMPARABLE_PROFILE')notes.push('No comparable broad-sector or specific specialization evidence was available; the previous simulated allocation is preserved without new claims.');
  notes.push('The Universal Materials umbrella allocation is frozen at its previous game-unit quantity and is not comparable to a standalone UNIDO establishment class.');
  out[id]={...r,factoryCounts:counts,totalStartingFactoryUnits:n,allocationModel:'COUNTRY_SPECIALIZATION_AND_MACRO_SECTOR_WEIGHTED_V2',provenance:{...(r.provenance||{}),simulationOnly:true,realWorldFacilityCounts:false,note:'Game-scaled starting allocation using retained country specialization profiles and comparable same-year broad-sector context. The legacy resource-context source is retained for provenance but is not applied by allocation V2 because validated country-specific resource quantities and production evidence are unavailable.'},factoryAllocationV2:{modelId:'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2',status,basis,overallConfidence:confidence,specializationConfidence:specs.length===0?'NOT_APPLICABLE':backed?ev.confidence:'MODELLED',supportConfidence,primaryFactoryTypes:specs,primaryFactoryQuantities:Object.fromEntries(specs.map(t=>[t,counts[t]])),supportFactoryTypes:support,supportFactoryQuantities:Object.fromEntries(support.map(t=>[t,counts[t]])),activeFactoryTypes:active,universalBaselineUnits:u,totalStartingFactoryUnits:n,budgetPreserved:true,sourceBackedSpecialization:backed,inputSnapshot:{comparisonStatus:x.comparison,comparisonYear:x.year,dominantSector:x.dominant,manufacturingBand:x.band,agricultureValueAddedPctGdp:{value:x.ag,year:x.years.ag},industryValueAddedPctGdp:{value:x.ind,year:x.years.ind},manufacturingValueAddedPctGdp:{value:x.man,year:x.years.man},agricultureEmploymentPct:{value:x.emp,year:x.years.emp},industrialScaleProxy:x.proxy},notes}};
  totalUnits+=n;
 }
 const flat=ids.filter(id=>{const v=Object.values(out[id].factoryCounts).filter(n=>n>0);return v.length>0&&v.every(n=>n===1);});
 baseline.countries=out;baseline.version='1.3.0';baseline.purpose='Explicit game-scaled starting factory allocations for all 197 core OMEGA countries and all 21 canonical factory categories, with traceable allocation confidence.';
 baseline.model.allocationModelId='OMEGA_COUNTRY_FACTORY_ALLOCATION_V2';baseline.model.simulationOnly=true;baseline.model.realWorldFacilityCounts=false;
 baseline.model.principles=[...new Set([...(Array.isArray(baseline.model.principles)?baseline.model.principles:[]),'Preserve every country existing total starting factory-unit budget when revising category quantities.','Keep each country pre-existing Universal Materials umbrella quantity fixed; it is not a standalone observed establishment class.','Prioritize retained country specialization profiles, and distinguish source-backed specializations from earlier game-modelled profiles.','Use comparable same-year broad-sector observations only for low-confidence macro simulation; never present them as proof of individual factory subsectors.','Do not use unvalidated country resource-context tags as quantitative evidence for factory allocation.','Preserve previous allocations where no comparable macro-sector profile or specific specialization evidence exists.'])];
 baseline.factoryAllocationRevision={schemaVersion:'1.0.0',modelId:'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2',allocationMethod:'SPECIALIZATION_AND_SAME_YEAR_MACRO_SECTOR_WEIGHTED_LARGEST_REMAINDER',generatedAt:'2026-10-31',countryCount:ids.length,factoryTypeCount:TYPES.length,totalStartingFactoryUnits:totalUnits,countryUnitBudgetsPreserved:true,universalMaterialsUnitsPreserved:true,simulationOnly:true,realWorldFacilityCounts:false,resourceContextUsedForAllocation:false,resourceContextExclusionReason:'The retained country resource-context index does not provide sufficiently validated country-specific production quantities or measured reserves for these factory-type allocations, and generic repeated tags were observed. It remains available as a separate legacy context source.',externalEstablishmentCountsUsed:false,externalEstablishmentDatasetStatus:'SOURCE_UNAVAILABLE',coverage:{sourceBackedSpecializationCountries:source,sourceBackedHighConfidenceCountries:high,sourceBackedModerateConfidenceCountries:moderate,previouslyGameModelledSpecializationCountries:modelled,macroOnlyCountries:macro,preservedNoComparableCountries:preserved,countriesWithAllPositiveCategoryQuantitiesEqualToOne:flat.length,allOnePatternCountryIds:flat},factoryTypeCountryCoverage:typeCoverage,sourcePolicy:{primarySpecializations:'Existing specializationEvidence sources are retained. Source-backed specializations identify relevant categories, not a physical facility count.',macroProfiles:'World Bank same-year agriculture/industry/services and manufacturing shares are broad economic indicators. Macro-only rows are low-confidence simulation, not specific subsector evidence.',resourceContext:'Not applied to V2 quantity weighting until country-specific resource amounts, production and industrial utilization are validated.',unavailableValues:'Missing, stale or non-comparable observations never become factual zeroes.'}};
 return baseline;
}
function main(){
 const check=process.argv.includes('--check'),b=JSON.parse(fs.readFileSync(BASE,'utf8')),s=JSON.parse(fs.readFileSync(SECTORS,'utf8'));
 const out=applyCountryFactoryAllocationV2(b,s),text=JSON.stringify(out,null,2)+'\n';
 if(check){if(fs.readFileSync(BASE,'utf8')!==text){console.error('Factory allocation V2 is stale. Run node scripts/build_country_factory_allocation_v2.mjs');process.exitCode=1;return;}console.log('Country factory allocation V2 is current for 197 countries and 21 categories.');return;}
 fs.writeFileSync(BASE,text);console.log('Updated country factory allocation V2 for 197 countries and 21 categories.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
