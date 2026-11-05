import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { buildPrivateFactoryBaseline, validatePrivateFactoryBaseline } from '../scripts/build_country_private_factory_starting_baseline_v1.mjs';
const government=JSON.parse(fs.readFileSync(new URL('../country_factory_starting_baseline_v1.json',import.meta.url),'utf8'));
const generated=JSON.parse(fs.readFileSync(new URL('../country_private_factory_starting_baseline_v1.json',import.meta.url),'utf8'));
test('private baseline covers exactly 197 countries, 21 factory types and five stable companies',()=>{
 assert.equal(generated.countryCount,197);assert.equal(generated.factoryTypeCount,21);assert.equal(generated.companyCount,5);
 assert.deepEqual(generated.factoryTypes.map(x=>x.id),government.factoryTypes.map(x=>x.id));
 assert.equal(validatePrivateFactoryBaseline(generated,government).ok,true);
});
test('zero government categories never receive private or company factory units',()=>{
 for(const [country,g] of Object.entries(government.countries)){const r=generated.countries[country];for(const type of generated.factoryTypes.map(x=>x.id)){if(g.factoryCounts[type]!==0)continue;assert.equal(r.factoryCounts[type],0,country+':'+type);for(const company of generated.companies)assert.equal(r.companyFactoryCounts[company.id][type],0,country+':'+company.id+':'+type);}}
});
test('every private category is an additional integer allocation capped at 60 percent and fully owned once',()=>{
 for(const [country,g] of Object.entries(government.countries)){const r=generated.countries[country];let total=0;for(const type of generated.factoryTypes.map(x=>x.id)){const count=r.factoryCounts[type];assert.ok(count<=Math.floor(g.factoryCounts[type]*.6+1e-9),country+':'+type);assert.equal(generated.companies.reduce((s,c)=>s+r.companyFactoryCounts[c.id][type],0),count);total+=count;}assert.equal(total,r.totalPrivateFactoryUnits,country);}
});
test('generation is deterministic and does not mutate government baseline',()=>{
 const before=JSON.stringify(government);assert.deepEqual(buildPrivateFactoryBaseline(government),generated);assert.equal(JSON.stringify(government),before);
});
test('country company allocation reflects different industrial specialization',()=>{
 assert.ok(generated.countries.BGD.companyFactoryCounts.NOVA_CONSUMER_INDUSTRIES.TEXTILE_GARMENT_MILL>0);
 assert.ok(generated.countries.CHN.companyFactoryCounts.AURORA_INDUSTRIAL_GROUP.STEEL_AND_ALLOY_WORKS>0);
 assert.ok(generated.countries.DEU.companyFactoryCounts.MERIDIAN_ENGINEERING_GROUP.INDUSTRIAL_MACHINERY_MACHINE_TOOLS>0);
 assert.equal(generated.countries.NGA.factoryCounts.ELECTRONICS_SEMICONDUCTOR_FAB,0);
 assert.notEqual(generated.countries.BGD.totalPrivateFactoryUnits,generated.countries.CHN.totalPrivateFactoryUnits);
});
test('all opening allocations are simulation-only and not commissioned production assets',()=>{
 assert.equal(generated.model.simulationOnly,true);assert.equal(generated.model.realWorldPrivateFacilityCounts,false);
 for(const row of Object.values(generated.countries)){assert.equal(row.simulationOnly,true);assert.equal(row.realWorldPrivateFacilityCounts,false);assert.equal(row.allocationStatus,'STATIC_PRIVATE_STARTING_ALLOCATION_NOT_COMMISSIONED');}
});

test('Industry screen exposes private-company opening allocations without activating production assets',()=>{
 const industry=fs.readFileSync(new URL('../omega_ui_v2/screens/industry.js',import.meta.url),'utf8');
 assert.match(industry,/OmegaPrivateEnterpriseRegistryV1/);
 assert.match(industry,/tabButton\('companies', 'Companies'/);
 assert.match(industry,/Private company opening allocation/);
 assert.match(industry,/NOT COMMISSIONED/);
 assert.match(industry,/no stock, shipments, input reservations, output, sales or company cash movements/);
});
