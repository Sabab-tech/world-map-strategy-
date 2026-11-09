import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {extractEstablishmentObservations,extractSubsetEstablishmentObservations,normalizeSubsetCountryName} from '../scripts/build_country_factory_establishment_data_v1.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../'+n,import.meta.url),'utf8'));
const baseline=read('country_factory_starting_baseline_v1.json');
const catalog=read('resource_industrial_catalog_v1.json');
const dataset=read('country_factory_establishment_data_v1.json');
const mapping=read('factory_isic_mapping_v1.json');
const countries=Object.keys(baseline.countries).sort(),types=Object.keys(catalog.factoryProfiles).sort();
test('all 197 countries have all 21 source-backed establishment input slots',()=>{
 assert.equal(dataset.metadata.countryCount,197);assert.equal(dataset.metadata.factoryTypeCount,21);assert.equal(dataset.metadata.recordCount,4137);assert.deepEqual(Object.keys(dataset.countries).sort(),countries);
 for(const id of countries){const row=dataset.countries[id];assert.equal(Object.keys(row.factoryEstablishments).length,21);assert.deepEqual(Object.keys(row.factoryEstablishments).sort(),types);for(const type of types){const r=row.factoryEstablishments[type];assert.equal(typeof r.status,'string');assert.ok(Object.hasOwn(r,'establishmentCount'));if(r.status!=='REPORTED')assert.equal(r.establishmentCount,null);else{assert.ok(Number.isInteger(r.establishmentCount)&&r.establishmentCount>=0);assert.ok(Number.isInteger(r.referenceYear));}}}
});
test('ISIC mapping covers all types without duplicate activity assignment',()=>{
 assert.equal(mapping.authority,'ISIC_REV4');assert.equal(mapping.mappings.length,21);assert.deepEqual(mapping.mappings.map(r=>r.factoryType).sort(),types);const codes=mapping.mappings.flatMap(r=>r.activityCodes);assert.equal(new Set(codes).size,codes.length);const umbrella=mapping.mappings.find(r=>r.factoryType==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT');assert.equal(umbrella.status,'NOT_COMPARABLE');assert.deepEqual(umbrella.activityCodes,[]);
});
test('UNIDO observation parser reads activity/year/value rows',()=>{
 const allowed=new Set(['2410','2420']);
 const rows=extractEstablishmentObservations([{activityCode:'2410',period:'2020',variableCode:'01',value:10},{activityCode:'2420',period:'2020',variableCode:'01',value:4},{activityCode:'2410',period:'2021',variableCode:'01',value:12}],allowed);
 const nested=extractEstablishmentObservations({'2020':{'2410':10,'2420':4},'2021':{'2410':12}},allowed);
 const found=new Map(rows.map(r=>[r.activityCode+'|'+r.year,r.value]));
 const nestedFound=new Map(nested.map(r=>[r.activityCode+'|'+r.year,r.value]));
 assert.equal(found.get('2410|2020'),10);assert.equal(found.get('2420|2020'),4);assert.equal(found.get('2410|2021'),12);
 assert.equal(nestedFound.get('2410|2020'),10);assert.equal(nestedFound.get('2420|2020'),4);assert.equal(nestedFound.get('2410|2021'),12);
});
test('country name matching normalizes whitespace and punctuation without regex escapes',()=>{
 assert.equal(normalizeSubsetCountryName('  United   States, of America  '),'united states of america');
 assert.equal(normalizeSubsetCountryName('Congo (Democratic Republic)'),'congo democratic republic');
});
test('Subsets mirror rows map country, ISIC activity, year and establishment value',()=>{
 const allowed=new Set(['2410','2420']);
 const rows=extractSubsetEstablishmentObservations([
  {country_code:'004',country_name:'Afghanistan',indicator_code:'01',classification_code:'2410',classification_combo_code:'2410',classification_name:'Basic iron and steel',classification_combo_name:'Basic iron and steel',year:2020,value:12},
  {country_code:'004',country_name:'Afghanistan',indicator_code:'01',classification_code:'2420',classification_combo_code:'2420',classification_name:'Non-ferrous metals',classification_combo_name:'Non-ferrous metals',year:2020,value:4},
  {country_code:'004',indicator_code:'04',classification_code:'2410',classification_combo_code:'2410',year:2020,value:999},
  {country_code:'004',indicator_code:'01',classification_code:'1010',classification_combo_code:'1010C',year:2020,value:1000},
  {country_code:'004',indicator_code:'01',classification_code:'2410',classification_combo_code:'2410A',year:2020,value:500},
  {country_code:'004',indicator_code:'01',classification_code:'2410',classification_combo_code:'2410',year:2020,value:null}
 ],allowed);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>({countryCode:row.countryCode,activityCode:row.activityCode,year:row.year,value:row.value})),[
  {countryCode:'004',activityCode:'2410',year:2020,value:12},
  {countryCode:'004',activityCode:'2420',year:2020,value:4}
 ]);
});
test('simulation counts never appear as source-backed establishment counts',()=>{
 assert.equal(baseline.model.simulationOnly,true);assert.equal(baseline.model.realWorldFacilityCounts,false);
 const textile=dataset.countries.BGD.factoryEstablishments.TEXTILE_GARMENT_MILL;
 if(textile.status==='REPORTED')assert.ok(Number.isInteger(textile.establishmentCount)&&Number.isInteger(textile.referenceYear));
 else assert.equal(textile.establishmentCount,null);
 assert.notEqual(dataset.datasetId,baseline.datasetId);
 assert.notEqual(dataset.metadata.collectionStatus,'COMPLETED',
   'a source retrieval with no successful observations cannot be marked completed');
 const combined = extractSubsetEstablishmentObservations([
  {country_code:'004',indicator_code:'01',classification_code:'1010',classification_combo_code:'1010C',year:2020,value:1000}
 ],new Set(['1010']));
 assert.equal(combined.length,0,'combined ISIC code must never be assigned to a single standard activity');
});
