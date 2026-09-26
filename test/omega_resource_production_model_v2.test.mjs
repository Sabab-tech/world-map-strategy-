import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise};
context.globalThis=context;
vm.createContext(context);

vm.runInContext(fs.readFileSync('omega_resource_part05_reserve_extraction_runtime.js','utf8'),context,{filename:'omega_resource_part05_reserve_extraction_runtime.js'});
vm.runInContext(fs.readFileSync('omega_resource_realism_runtime_v1.js','utf8'),context,{filename:'omega_resource_realism_runtime_v1.js'});
vm.runInContext(fs.readFileSync('omega_resource_production_model_v2.js','utf8'),context,{filename:'omega_resource_production_model_v2.js'});

const P=context.GSRSK_Part05;
assert.equal(P.VERSION,'2.0.0');

assert.equal(P.canonicalUnit('tonnes'),'TONNES');
assert.equal(P.canonicalUnit('ounces'),'TROY_OZ');
assert.equal(P.canonicalUnit('BBL'),'BBL');
assert.equal(P.canonicalUnit('TCF'),'TCF');
assert.equal(P.canonicalUnit('BCM'),'BCM');
assert.equal(P.canonicalUnit('g/t'),'G_T');
assert.equal(P.canonicalUnit('mg/L'),'MG_L');
assert.equal(P.canonicalUnit('%'),'PERCENT');
assert.equal(P.canonicalUnit('API'),'API_GRAVITY');

const gasReserve=P.parseReserve('1 TCF','natural_gas');
assert.equal(gasReserve.unit,'BCM');
assert.ok(Math.abs(gasReserve.value-28.316846592)<1e-9);
const goldReserve=P.parseReserve('1 tonne','gold');
assert.equal(goldReserve.unit,'TROY_OUNCES');
assert.ok(Math.abs(goldReserve.value-32150.74656862745)<1e-6);

const identity={
  listOccurrences(){return[{
    occurrenceKey:'OCC:TEST:GRASBERG',
    countryId:'TEST',
    depositKey:'GRASBERG',
    resourceTypeId:'copper',
    resourceTypeKey:'copper',
    status:'OPERATING',
    rawDeposit:{
      name:'Grasberg',
      resId:'copper',
      reserves:'100 million tonnes',
      commodities:[
        {resourceId:'copper',reserves:'100 million tonnes',grade:'1.2%'},
        {resourceId:'gold',reserves:'10 million oz',grade:'4.5 g/t'}
      ],
      productionModel:{nominalCapacity:1000,minimumCapacity:500,maximumCapacity:1200,utilization:0.8,recovery:0.9,decline:0.02,maintenance:0.05,operatingCost:20}
    }
  }]}
};
const compiled=P.compileReserves(identity,null,{sovereignEntities:{resourceTypes:[{id:'copper',unit:'TONNES'},{id:'gold',unit:'TROY_OZ'}]}});
assert.equal(compiled.status,'READY');
assert.equal(compiled.commodityCount,2);
assert.equal(compiled.reserveCount,2);

const copper=compiled.registry.getReserveState('OCC:TEST:GRASBERG:COM:copper');
const gold=compiled.registry.getReserveState('OCC:TEST:GRASBERG:COM:gold');
assert(copper&&gold);
assert.equal(copper.quality.grade,'1.2%');
assert.equal(copper.quality.purity,null);
assert.equal(copper.productionModel.authority,'OBSERVED');
assert.equal(copper.productionModel.nominalCapacity,1000);
assert.equal(copper.productionModel.minimumCapacity,500);
assert.equal(copper.productionModel.maximumCapacity,1200);
assert.equal(copper.productionModel.recovery,0.9);
assert.equal(copper.productionModel.maintenance,0.05);

const simulated=P.productionModel({},1000000);
assert.equal(simulated.authority,'SIMULATED');
assert.equal(simulated.nominalCapacity,null);
assert.equal(simulated.simulatedRate,10);
assert.equal(simulated.dataStatus,'UNOBSERVED');

const cap=compiled.registry.getCapacityForOccurrence('OCC:TEST:GRASBERG:COM:copper');
const result=P.executeExtraction({requestedQuantity:100,timeWindowDurationHours:24,simulationTick:1},copper,{capacity:cap});
assert(result.approvedQuantity>0);
assert(result.reserveAfter.residualQuantity<copper.residualQuantity);
assert.equal(result.provenance.productionAuthority,'OBSERVED');

console.log('OMEGA RESOURCE PRODUCTION MODEL V2 TEST PASSED');
