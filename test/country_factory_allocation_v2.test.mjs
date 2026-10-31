import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyCountryFactoryAllocationV2 } from '../scripts/build_country_factory_allocation_v2.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const baseline=read('country_factory_starting_baseline_v1.json');
const sectors=read('country_sector_profiles_v1.json');
const types=baseline.factoryTypes.map(x=>x.id),U='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT';
const macroAllowed=new Set(['STEEL_AND_ALLOY_WORKS','NON_FERROUS_METAL_SMELTER','PETROCHEMICAL_POLYMER_PLANT','FERTILIZER_CHEMICAL_PLANT','INDUSTRIAL_CHEMICALS_GAS_PLANT','CEMENT_CONCRETE_PLANT','GLASS_CERAMICS_PLANT','PAPER_PACKAGING_MILL','FOOD_PROCESSING_COLD_CHAIN','TEXTILE_GARMENT_MILL','INDUSTRIAL_MACHINERY_MACHINE_TOOLS','RECYCLING_WASTE_PROCESSING_PLANT']);
test('complete 197-country by 21-category matrix',()=>{
 assert.equal(Object.keys(baseline.countries).length,197);
 assert.equal(baseline.factoryTypes.length,21);
 assert.equal(baseline.factoryAllocationRevision.modelId,'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2');
 for(const [id,r] of Object.entries(baseline.countries)){
  assert.deepEqual(Object.keys(r.factoryCounts).sort(),[...types].sort(),id);
  assert.ok(Object.values(r.factoryCounts).every(v=>Number.isInteger(v)&&v>=0),id);
  assert.equal(Object.values(r.factoryCounts).reduce((a,b)=>a+b,0),r.totalStartingFactoryUnits,id);
  assert.equal(r.factoryAllocationV2.modelId,'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2',id);
  assert.equal(r.factoryAllocationV2.budgetPreserved,true,id);
  assert.deepEqual(r.factoryAllocationV2.activeFactoryTypes,types.filter(t=>r.factoryCounts[t]>0),id);
 }
});
test('country budgets, global unit total and Universal Materials stay fixed',()=>{
 const rev=baseline.factoryAllocationRevision;
 assert.equal(rev.countryUnitBudgetsPreserved,true);
 assert.equal(rev.universalMaterialsUnitsPreserved,true);
 assert.equal(rev.totalStartingFactoryUnits,1589);
 let sum=0;
 for(const [id,r] of Object.entries(baseline.countries)){sum+=r.totalStartingFactoryUnits;assert.equal(r.factoryCounts[U],r.factoryAllocationV2.universalBaselineUnits,id);}
 assert.equal(sum,1589);
});
test('source evidence, modelled profiles and macro-only profiles have separate confidence tiers',()=>{
 const c=baseline.factoryAllocationRevision.coverage;
 assert.equal(c.sourceBackedSpecializationCountries,17);
 assert.equal(c.sourceBackedHighConfidenceCountries,14);
 assert.equal(c.sourceBackedModerateConfidenceCountries,3);
 assert.equal(c.previouslyGameModelledSpecializationCountries,79);
 assert.equal(c.macroOnlyCountries,96);
 assert.equal(c.preservedNoComparableCountries,5);
 assert.equal(c.sourceBackedSpecializationCountries+c.previouslyGameModelledSpecializationCountries+c.macroOnlyCountries+c.preservedNoComparableCountries,197);
 for(const [id,r] of Object.entries(baseline.countries)){
  const a=r.factoryAllocationV2;
  if(a.status==='SPECIALIZATION_WEIGHTED_SIMULATION'){
   assert.ok(r.specializations.length>0,id);
   for(const t of r.specializations)assert.ok(r.factoryCounts[t]>0,id+':'+t);
   if(a.sourceBackedSpecialization){assert.equal(r.specializationEvidence.status,'SOURCE_BACKED_SIMULATION_MAPPING',id);assert.ok(r.specializationEvidence.sources.length>0,id);assert.equal(a.specializationConfidence,r.specializationEvidence.confidence,id);}
   else assert.equal(a.specializationConfidence,'MODELLED',id);
  }else if(a.status==='MACRO_SECTOR_WEIGHTED_SIMULATION'){
   assert.equal(r.specializations.length,0,id);
   assert.equal(a.overallConfidence,'LOW',id);
   assert.ok(a.notes.some(n=>n.includes('do not prove')),id);
   for(const t of a.supportFactoryTypes)assert.ok(macroAllowed.has(t),id+':'+t);
  }else assert.equal(a.overallConfidence,'NOT_COMPARABLE',id);
 }
});
test('source-unavailable establishment data is not converted into physical counts',()=>{
 assert.equal(baseline.factoryAllocationRevision.externalEstablishmentCountsUsed,false);
 assert.equal(baseline.factoryAllocationRevision.externalEstablishmentDatasetStatus,'SOURCE_UNAVAILABLE');
 assert.equal(baseline.factoryAllocationRevision.resourceContextUsedForAllocation,false);
 assert.equal(baseline.model.realWorldFacilityCounts,false);
});
test('macro-only rows use conservative category pools, not unsupported specialist categories',()=>{
 const rows=Object.entries(baseline.countries).filter(([,r])=>r.factoryAllocationV2.status==='MACRO_SECTOR_WEIGHTED_SIMULATION');
 assert.equal(rows.length,96);
 for(const [id,r] of rows){
  const active=Object.keys(r.factoryCounts).filter(t=>t!==U&&r.factoryCounts[t]>0);
  assert.ok(active.length>0,id);
  assert.ok(active.every(t=>macroAllowed.has(t)),id);
 }
});
test('builder output is deterministic and idempotent',()=>{
 assert.deepEqual(applyCountryFactoryAllocationV2(structuredClone(baseline),sectors),baseline);
});
test('remaining all-one rows are measured and materially lower than the original 148',()=>{
 const flat=Object.entries(baseline.countries).filter(([,r])=>{const a=Object.values(r.factoryCounts).filter(v=>v>0);return a.length>0&&a.every(v=>v===1);}).map(([id])=>id);
 assert.equal(flat.length,baseline.factoryAllocationRevision.coverage.countriesWithAllPositiveCategoryQuantitiesEqualToOne);
 assert.deepEqual(flat,baseline.factoryAllocationRevision.coverage.allOnePatternCountryIds);
 assert.ok(flat.length<148);
});
test('canonical 21-category catalog is unchanged',()=>{
 assert.equal(baseline.factoryTypes.length,21);
 assert.deepEqual(baseline.factoryTypes.map(x=>x.id).sort(),[...types].sort());
});
