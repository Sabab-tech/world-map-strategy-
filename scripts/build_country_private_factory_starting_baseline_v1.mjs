#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const INPUT=path.join(ROOT,'country_factory_starting_baseline_v1.json');
const OUTPUT=path.join(ROOT,'country_private_factory_starting_baseline_v1.json');
const MODEL='OMEGA_PRIVATE_FACTORY_ALLOCATION_V1';
export const COMPANIES=[
{id:'AURORA_INDUSTRIAL_GROUP',name:'Aurora Industrial Group',sectorAffinity:'Materials, metals, chemicals and industrial feedstock'},
{id:'MERIDIAN_ENGINEERING_GROUP',name:'Meridian Engineering Group',sectorAffinity:'Machinery, heavy engineering, vehicles and transport equipment'},
{id:'NOVA_CONSUMER_INDUSTRIES',name:'Nova Consumer Industries',sectorAffinity:'Textiles, garments, food, paper and packaging'},
{id:'ATLAS_TECHNOLOGY_CORPORATION',name:'Atlas Technology Corporation',sectorAffinity:'Electronics, semiconductors, batteries, precision and advanced manufacturing'},
{id:'TERRA_INFRASTRUCTURE_GROUP',name:'Terra Infrastructure Group',sectorAffinity:'Cement, construction materials, glass, ceramics and recycling'}
];
const AFFINITY=[
[1.6,1.65,1.65,1.55,1.2,1.55,.8,.65,.55,.45,.35,.75,.55,.45,.35,.35,.25,.25,.45,.55,.95],
[.7,.85,.75,.75,.55,.8,.6,.45,.35,.35,.45,1.75,1.45,.85,1.05,1.75,1.65,1.6,.75,1,.45],
[.55,.35,.25,.45,.85,.55,.55,.7,1.7,1.85,1.9,.25,.25,.25,.15,.35,.15,.15,.8,.25,.8],
[.5,.35,.55,.7,.55,.8,.35,.45,.55,.25,.25,1.05,1.6,1.85,1.9,.8,.55,1.55,1.8,1.25,.7],
[1,.6,.55,.45,.35,.35,1.85,1.65,.8,.45,.25,.45,.6,.25,.35,.45,.35,.35,.35,.45,1.45]
];
const TYPE_COMPANY=[
'AURORA_INDUSTRIAL_GROUP','AURORA_INDUSTRIAL_GROUP','AURORA_INDUSTRIAL_GROUP','AURORA_INDUSTRIAL_GROUP','AURORA_INDUSTRIAL_GROUP','AURORA_INDUSTRIAL_GROUP',
'TERRA_INFRASTRUCTURE_GROUP','TERRA_INFRASTRUCTURE_GROUP','NOVA_CONSUMER_INDUSTRIES','NOVA_CONSUMER_INDUSTRIES','NOVA_CONSUMER_INDUSTRIES',
'MERIDIAN_ENGINEERING_GROUP','ATLAS_TECHNOLOGY_CORPORATION','ATLAS_TECHNOLOGY_CORPORATION','ATLAS_TECHNOLOGY_CORPORATION',
'MERIDIAN_ENGINEERING_GROUP','MERIDIAN_ENGINEERING_GROUP','MERIDIAN_ENGINEERING_GROUP','ATLAS_TECHNOLOGY_CORPORATION','MERIDIAN_ENGINEERING_GROUP','TERRA_INFRASTRUCTURE_GROUP'
];
const TECH=new Set([11,12,13,14,15,16,17,18]),RESOURCE=new Set([0,1,2,3,5,6,7]);
const AGRI=new Set([4,9,10]),CONSUMER=new Set([8,9,10]),STRATEGIC=new Set([0,1,17,19]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const round1=v=>Math.round(v*10)/10;
function macro(row,key,comparison=true){
 const c=row.economicSectorContext||{},m=c.valueAddedShares&&c.valueAddedShares[key];
 if(!m||num(m.value)===null||!Number.isInteger(num(m.year)))return null;
 if(comparison&&(!Number.isInteger(num(c.comparisonYear))||Math.abs(num(m.year)-num(c.comparisonYear))>3))return null;
 return num(m.value);
}
function countryModel(row){
 const c=row.economicSectorContext||{},status=String(c.comparisonStatus||'NOT_AVAILABLE'),year=num(c.comparisonYear);
 const comparable=['SAME_YEAR_COMPARABLE','PARTIAL_SAME_YEAR_COMPARABLE'].includes(status)&&Number(c.availableSectorCount||0)>=2&&Number.isInteger(year);
 const m=macro(row,'manufacturingValueAddedPctGdp'),i=macro(row,'industryValueAddedPctGdp',false),s=macro(row,'servicesValueAddedPctGdp',false),a=macro(row,'agricultureEmploymentPct');
 const specs=Array.isArray(row.specializations)?row.specializations:[],depth=Math.min(10,specs.length);
 let base,basis;
 if(comparable){
  base=16+.62*clamp(m===null?0:m,0,35)+.22*clamp(i===null?0:i,0,50)+.06*clamp(s===null?0:s,0,80)+1.35*depth;
  basis='COMPARABLE_MACRO_AND_SPECIALIZATION_GAME_MODEL';
  if(c.manufacturingBand==='HIGH')base+=2;else if(c.manufacturingBand==='LOW')base-=1.5;
 }else if(depth){base=Math.min(42,16+depth*2.1);basis='SPECIALIZATION_ONLY_CONSERVATIVE_GAME_MODEL';}
 else{base=0;basis='NO_COMPARABLE_CONTEXT_OR_SPECIALIZATION_ZERO_PRIVATE_BASELINE';}
 return {baseParticipationPercent:round1(clamp(base,0,55)),basis,comparisonStatus:status,comparisonYear:Number.isInteger(year)?year:null,
 inputs:{manufacturingValueAddedPctGdp:m,industryValueAddedPctGdp:i,servicesValueAddedPctGdp:s,agricultureEmploymentPct:a,manufacturingBand:c.manufacturingBand||'NOT_COMPARABLE',specializationCount:specs.length}};
}
function archetypeBonus(row,index){
 const s=String(row.industryArchetype||'').toLowerCase();
 const patterns=[/metal|industry|industrial|resource|extract|petro|chemical|energy|mineral/,
 /machin|engineering|automotive|vehicle|aerospace|defen|transport|rail/,
 /textile|garment|food|agro|paper|consumer|beef|agricultur/,
 /electronic|semiconductor|technology|pharma|medical|precision|advanced/,
 /cement|construction|infrastructure|glass|ceramic|building|recycl/];
 return patterns[index]&&patterns[index].test(s)?0.2:0;
}
function apportion(total,weights){
 const sum=weights.reduce((a,b)=>a+b,0);
 if(!total||!sum)return weights.map(()=>0);
 const rows=weights.map((w,index)=>{const exact=total*w/sum;return{index,count:Math.floor(exact),remainder:exact-Math.floor(exact)};});
 let assigned=rows.reduce((a,b)=>a+b.count,0);
 rows.sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 for(let i=0;assigned<total;i=(i+1)%rows.length){rows[i].count++;assigned++;}
 rows.sort((a,b)=>a.index-b.index);return rows.map(r=>r.count);
}
function validateGovernment(b){
 if(!b||!b.countries||!Array.isArray(b.factoryTypes)||Number(b.countryCount)!==197||Object.keys(b.countries).length!==197||Number(b.factoryTypeCount)!==21||b.factoryTypes.length!==21)throw Error('GOVERNMENT_FACTORY_BASELINE_SCHEMA_INVALID');
 const ids=b.factoryTypes.map(x=>x.id);
 if(new Set(ids).size!==21||ids.some(x=>!x))throw Error('GOVERNMENT_FACTORY_TYPE_ROSTER_INVALID');
 for(const cid of Object.keys(b.countries)){
  const row=b.countries[cid],counts=row&&row.factoryCounts;
  if(!row||row.countryId!==cid||!counts||Object.keys(counts).sort().join('|')!==ids.slice().sort().join('|')||ids.some(id=>!Number.isInteger(counts[id])||counts[id]<0))throw Error('GOVERNMENT_FACTORY_COUNTRY_INVALID:'+cid);
 }
}
export function buildPrivateFactoryBaseline(government){
 validateGovernment(government);
 const ids=government.factoryTypes.map(x=>x.id),countries={};let governmentTotal=0,privateTotal=0;
 for(const cid of Object.keys(government.countries).sort()){
  const g=government.countries[cid],model=countryModel(g),factoryCounts={},categoryParticipationPercent={};
  const companyFactoryCounts=Object.fromEntries(COMPANIES.map(c=>[c.id,Object.fromEntries(ids.map(id=>[id,0]))]));
  let gTotal=0,pTotal=0;
  ids.forEach((type,index)=>{
   const gCount=g.factoryCounts[type];gTotal+=gCount;
   if(gCount===0){factoryCounts[type]=0;categoryParticipationPercent[type]=0;return;}
   const inputs=model.inputs,specialized=Array.isArray(g.specializations)&&g.specializations.includes(type);
   let adjustment=specialized?7.5:0;
   if(TECH.has(index)&&inputs.manufacturingValueAddedPctGdp!==null)adjustment+=clamp((inputs.manufacturingValueAddedPctGdp-12)*.22,-2.5,4);
   if(RESOURCE.has(index)&&inputs.industryValueAddedPctGdp!==null)adjustment+=clamp((inputs.industryValueAddedPctGdp-18)*.08,-2,3);
   if(AGRI.has(index)&&inputs.agricultureEmploymentPct!==null)adjustment+=clamp((inputs.agricultureEmploymentPct-20)*.05,-1.5,3);
   if(CONSUMER.has(index)&&inputs.servicesValueAddedPctGdp!==null)adjustment+=clamp((inputs.servicesValueAddedPctGdp-45)*.035,-1.5,1.5);
   if(index===18&&inputs.servicesValueAddedPctGdp!==null)adjustment+=clamp((inputs.servicesValueAddedPctGdp-50)*.035,-1,1.5);
   if(index===20)adjustment+=1;
   if(index===19)adjustment-=6;
   if(index===17)adjustment-=2.5;
   if(STRATEGIC.has(index)&&!specialized)adjustment-=1.5;
   const target=round1(clamp(model.baseParticipationPercent+adjustment,0,60));
   const privateCount=Math.min(Math.floor(gCount*.6+1e-9),Math.round(gCount*target/100));
   const weights=COMPANIES.map((company,j)=>AFFINITY[j][index]*(1+archetypeBonus(g,j)+((specialized&&TYPE_COMPANY[index]===company.id)?.25:0)));
   const split=apportion(privateCount,weights);
   COMPANIES.forEach((company,j)=>{companyFactoryCounts[company.id][type]=split[j];});
   factoryCounts[type]=privateCount;
   categoryParticipationPercent[type]=privateCount===0?0:round1(privateCount/gCount*100);
   pTotal+=privateCount;
  });
  countries[cid]={countryId:cid,countryName:g.countryName,industryArchetype:g.industryArchetype||null,
   specializationEvidenceStatus:g.specializationEvidenceStatus||'NOT_AVAILABLE',totalGovernmentFactoryUnits:gTotal,totalPrivateFactoryUnits:pTotal,
   privateToGovernmentBaselinePercent:gTotal?round1(pTotal/gTotal*100):0,countryParticipationModel:model,
   factoryCounts,categoryParticipationPercent,companyFactoryCounts,
   allocationStatus:'STATIC_PRIVATE_STARTING_ALLOCATION_NOT_COMMISSIONED',simulationOnly:true,realWorldPrivateFacilityCounts:false};
  governmentTotal+=gTotal;privateTotal+=pTotal;
 }
 const data={schemaVersion:'1.0.0',datasetId:'OMEGA_COUNTRY_PRIVATE_FACTORY_STARTING_BASELINE_V1',version:'1.0.0',
 purpose:'Country-specific game-start private enterprise allocation, separate from government baseline and commissioned production assets.',
 model:{authority:MODEL,simulationOnly:true,realWorldPrivateFacilityCounts:false,
 percentageMeaning:'Modelled additional private starting factory units as a share of government starting units; not an observed private ownership statistic.',
 range:{minimumPercent:0,maximumPercent:60,maximumCountRule:'floor(governmentFactoryCount * 0.60)'},
 zeroPolicy:'A government factory category with zero starting units receives exactly zero private units and zero company allocation.',
 missingPolicy:'Missing source metrics stay null. Without comparable macro context or specialization, private allocation is zero.',
 companyAllocationPolicy:'Five stable global identities receive private units using deterministic category affinity, country archetype and specialization; affinities are preferences, not restrictions.',
 sourcePolicy:'Uses existing economicSectorContext and country specialization; it does not measure real ownership.',
 governmentBaseline:{datasetId:government.datasetId,version:government.version||null,countryCount:197,factoryTypeCount:21}},
 companyCount:COMPANIES.length,companies:COMPANIES,countryCount:197,factoryTypeCount:21,
 factoryTypes:government.factoryTypes.map(x=>({id:x.id,name:x.name})),totalGovernmentFactoryUnits:governmentTotal,totalPrivateFactoryUnits:privateTotal,countries};
 validatePrivateFactoryBaseline(data,government);
 return data;
}
export function validatePrivateFactoryBaseline(data,government){
 validateGovernment(government);
 const companyIds=COMPANIES.map(x=>x.id),factoryIds=government.factoryTypes.map(x=>x.id);
 const sortedKeys=value=>Object.keys(value||{}).sort().join('|');
 const expectedCompanyKeys=companyIds.slice().sort().join('|');
 const expectedFactoryKeys=factoryIds.slice().sort().join('|');
 if(!data||data.datasetId!=='OMEGA_COUNTRY_PRIVATE_FACTORY_STARTING_BASELINE_V1'||
    data.countryCount!==197||data.factoryTypeCount!==21||data.companyCount!==5||
    !data.model||data.model.simulationOnly!==true||data.model.realWorldPrivateFacilityCounts!==false||
    !data.countries||Object.keys(data.countries).length!==197)
  throw Error('PRIVATE_FACTORY_BASELINE_SCHEMA_INVALID');
 if(!Array.isArray(data.companies)||data.companies.map(x=>x.id).join('|')!==companyIds.join('|')||
    !Array.isArray(data.factoryTypes)||data.factoryTypes.map(x=>x.id).join('|')!==factoryIds.join('|'))
  throw Error('PRIVATE_FACTORY_IDENTITY_ROSTER_MISMATCH');
 let total=0,totalGovernment=0;
 for(const cid of Object.keys(government.countries)){
  const g=government.countries[cid],r=data.countries[cid];
  if(!r||r.countryId!==cid||!r.factoryCounts||!r.categoryParticipationPercent||!r.companyFactoryCounts)
   throw Error('PRIVATE_FACTORY_COUNTRY_ROW_INVALID:'+cid);
  if(sortedKeys(r.factoryCounts)!==expectedFactoryKeys||
     sortedKeys(r.categoryParticipationPercent)!==expectedFactoryKeys||
     sortedKeys(r.companyFactoryCounts)!==expectedCompanyKeys)
   throw Error('PRIVATE_FACTORY_COUNTRY_CATEGORY_OR_COMPANY_ROSTER_INVALID:'+cid);
  let countryTotal=0,countryGovernmentTotal=0;
  for(const companyId of companyIds){
   const counts=r.companyFactoryCounts[companyId];
   if(!counts||sortedKeys(counts)!==expectedFactoryKeys)
    throw Error('PRIVATE_COMPANY_FACTORY_ROSTER_INVALID:'+cid+':'+companyId);
  }
  for(const type of factoryIds){
   const gc=g.factoryCounts[type],pc=r.factoryCounts[type],rate=r.categoryParticipationPercent[type];
   if(!Number.isInteger(gc)||gc<0)throw Error('GOVERNMENT_FACTORY_COUNT_INVALID:'+cid+':'+type);
   if(!Number.isInteger(pc)||pc<0)throw Error('PRIVATE_FACTORY_COUNT_INVALID:'+cid+':'+type);
   const companySum=companyIds.reduce((sum,id)=>{
    const count=r.companyFactoryCounts[id][type];
    if(!Number.isInteger(count)||count<0)throw Error('PRIVATE_COMPANY_FACTORY_COUNT_INVALID:'+cid+':'+id+':'+type);
    return sum+count;
   },0);
   if(companySum!==pc)throw Error('PRIVATE_COMPANY_ALLOCATION_MISMATCH:'+cid+':'+type);
   if(gc===0&&pc!==0)throw Error('PRIVATE_ZERO_GOVERNMENT_CATEGORY_VIOLATION:'+cid+':'+type);
   if(pc>Math.floor(gc*.6+1e-9))throw Error('PRIVATE_FACTORY_OVER_60_PERCENT:'+cid+':'+type);
   const expectedRate=gc>0?round1(pc/gc*100):0;
   if(!Number.isFinite(rate)||rate<0||rate>60||Math.abs(rate-expectedRate)>.051)
    throw Error('PRIVATE_FACTORY_RATE_INVALID:'+cid+':'+type);
   countryTotal+=pc;countryGovernmentTotal+=gc;
  }
  if(!Number.isInteger(r.totalPrivateFactoryUnits)||countryTotal!==r.totalPrivateFactoryUnits)
   throw Error('PRIVATE_COUNTRY_TOTAL_MISMATCH:'+cid);
  if(!Number.isInteger(r.totalGovernmentFactoryUnits)||countryGovernmentTotal!==r.totalGovernmentFactoryUnits)
   throw Error('PRIVATE_COUNTRY_GOVERNMENT_TOTAL_MISMATCH:'+cid);
  const expectedCountryRate=countryGovernmentTotal>0?round1(countryTotal/countryGovernmentTotal*100):0;
  if(!Number.isFinite(r.privateToGovernmentBaselinePercent)||
     Math.abs(r.privateToGovernmentBaselinePercent-expectedCountryRate)>.051)
   throw Error('PRIVATE_COUNTRY_BASELINE_RATE_MISMATCH:'+cid);
  if(r.allocationStatus!=='STATIC_PRIVATE_STARTING_ALLOCATION_NOT_COMMISSIONED'||
     r.simulationOnly!==true||r.realWorldPrivateFacilityCounts!==false)
   throw Error('PRIVATE_PROVENANCE_INVALID:'+cid);
  total+=countryTotal;totalGovernment+=countryGovernmentTotal;
 }
 if(total!==data.totalPrivateFactoryUnits)throw Error('PRIVATE_WORLD_TOTAL_MISMATCH');
 if(totalGovernment!==data.totalGovernmentFactoryUnits)throw Error('PRIVATE_WORLD_GOVERNMENT_TOTAL_MISMATCH');
 return{ok:true,countryCount:197,factoryTypeCount:21,companyCount:5,totalPrivateFactoryUnits:total,totalGovernmentFactoryUnits:totalGovernment};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const government=JSON.parse(fs.readFileSync(INPUT,'utf8')),generated=buildPrivateFactoryBaseline(government),serialized=JSON.stringify(generated,null,2)+'\n';
 if(process.argv.includes('--check')){
  const current=fs.readFileSync(OUTPUT,'utf8');
  if(current!==serialized){console.error('PRIVATE_FACTORY_BASELINE_STALE: regenerate the baseline');process.exitCode=1;}
  else console.log('PRIVATE FACTORY BASELINE CHECK PASSED; units='+generated.totalPrivateFactoryUnits);
 }else{
  fs.writeFileSync(OUTPUT,serialized);
  console.log('Wrote '+path.relative(ROOT,OUTPUT)+'; private units='+generated.totalPrivateFactoryUnits);
 }
}
