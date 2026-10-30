import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {extractEstablishmentObservations} from '../scripts/build_country_factory_establishment_data_v1.mjs';
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
 const allowed=new Set(['2410','2420']);const rows=extractEstablishmentObservations([{activityCode:'2410',period:'2020',variableCode:'01',value:10},{activityCode:'2420',period:'2020',variableCode:'01',value:4},{activityCode:'2410',period:'2021',variableCode:'01',value:12}],allowed);const found=new Map(rows.map(r=>[r.activityCode+'|'+r.year,r.value]));assert.equal(found.get('2410|2020'),10);assert.equal(found.get('2420|2020'),4);assert.equal(found.get('2410|2021'),12);
});
test('simulation counts never appear as source-backed establishment counts',()=>{
 assert.equal(baseline.model.simulationOnly,true);assert.equal(baseline.model.realWorldFacilityCounts,false);assert.equal(dataset.countries.BGD.factoryEstablishments.TEXTILE_GARMENT_MILL.establishmentCount,null);assert.notEqual(dataset.datasetId,baseline.datasetId);
});
