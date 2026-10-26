import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../omega_resource_quantity_normalization_v1.js',import.meta.url),'utf8');
const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON};
context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(source,context);
const api=context.OmegaResourceQuantityNormalization;
assert.ok(api,'quantity normalization API must be registered');
assert.equal(api.normalizeQuantity('copper',320400000000,'POUNDS_COPPER').unit,'TONNES');
assert.ok(Math.abs(api.normalizeQuantity('copper',320400000000,'POUNDS_COPPER').quantity-145331221.4)<1);
assert.equal(api.normalizeQuantity('natural_gas',1,'BCF').unit,'BCM');
assert.ok(Math.abs(api.normalizeQuantity('natural_gas',1,'BCF').quantity-0.028316846592)<1e-9);
assert.ok(Math.abs(api.normalizeQuantity('natural_gas',1,'BCF_PER_DAY').quantity-0.028316846592)<1e-9,'rate unit suffixes must not suppress conversion');
assert.equal(api.normalizeQuantity('gold',1,'TONNES_ORE').unit,'TROY_OUNCES');
assert.ok(api.normalizeQuantity('gold',1,'TONNES_ORE').quantity>32000);
assert.equal(api.normalizeQuantity('diamond',1,'TONNES').quantity,5000000);
assert.equal(api.normalizeQuantity('crude_oil',1,'TONNES').unit,'BBL');
assert.equal(api.normalizeQuantity('graphite',125,'TONNES_GRAPHITE').quantity,125);

const unknownUnit=api.normalizeQuantity('copper',12,'FURLONGS');
assert.equal(unknownUnit.quantity,null,'unknown physical units must not be silently coerced');
assert.equal(unknownUnit.unit,'FURLONGS','unknown-unit quantities retain their source unit');
assert.equal(unknownUnit.method,'UNIT_UNRECOGNIZED_OR_INCOMPATIBLE_NOT_CONVERTED');
const crossDimension=api.normalizeQuantity('copper',1,'BCM');
assert.equal(crossDimension.quantity,null,'volume units must not be accepted as mass units');
assert.equal(crossDimension.method,'UNIT_UNRECOGNIZED_OR_INCOMPATIBLE_NOT_CONVERTED');

const annualRate=api.normalizeSiteRecord({resourceId:'copper',quantitative:{production:{rate:365,rateUnit:'TONNES_PER_YEAR',unit:'TONNES_PER_YEAR',status:'SIMULATED'}}});
assert.equal(annualRate.quantitative.production.rate,1,'annual site output must be converted to one day of production');
assert.equal(annualRate.quantitative.production.rateUnit,'TONNES_PER_DAY');
context.Game={state:{simulation:{daysPerTurn:30}}};
const perTurnRate=api.normalizeSiteRecord({resourceId:'coal',quantitative:{production:{rate:3000,rateUnit:'TONNES_PER_TURN',unit:'TONNES_PER_TURN',status:'SIMULATED'}}});
assert.equal(perTurnRate.quantitative.production.rate,100,'per-turn output must be converted using the current turn duration');

const annualCapacity=api.normalizeSiteRecord({resourceId:'iron_ore',capacity:{nominal:365,minimum:182.5,maximum:730,unit:'TONNES_PER_YEAR',status:'SIMULATED',simulationOnly:true}});
assert.equal(annualCapacity.capacity.nominal,1,'annual capacity must normalize into daily capacity');
assert.equal(annualCapacity.capacity.minimum,0.5);
assert.equal(annualCapacity.capacity.maximum,2);

// A missing daily rate may be simulated while the same record retains an observed
// annual ROM figure with a different source unit. Never null or relabel that evidence.
const mixedProduction=api.normalizeSiteRecord({
 resourceId:'graphite',
 quantitative:{production:{
  rate:120,rateUnit:'TONNES_PER_DAY',unit:'TONNES_PER_DAY',
  annual:405,annualUnit:'metric_tons_graphite_ore_ROM',annualStatus:'OBSERVED',status:'SIMULATED'
 }}
});
assert.equal(mixedProduction.quantitative.production.rate,120,'simulated daily rate must normalize into the declared gameplay unit');
assert.equal(mixedProduction.quantitative.production.annual,405,'observed annual production must remain numerically intact');
assert.equal(mixedProduction.quantitative.production.annualUnit,'metric_tons_graphite_ore_ROM','observed source unit must not be relabeled as tonnes/year');
assert.equal(mixedProduction.quantitative.production.annualNormalization.method,'SOURCE_VALUE_PRESERVED');

const simulated=api.normalizeSiteRecord({
 siteId:'SITE_TEST_COPPER',countryId:'BGD',resourceId:'copper',
 reserve:{quantity:2204.62262185,unit:'POUNDS_COPPER',status:'SIMULATED'},
 quantitative:{reserve:{quantity:5,unit:'TONNES',status:'OBSERVED'}}
});
assert.equal(simulated.reserve.quantity,1);
assert.equal(simulated.reserve.unit,'TONNES');
assert.equal(simulated.reserve.quantityNormalization.sourceUnit,'POUNDS_COPPER');
assert.equal(simulated.quantitative.reserve.quantity,5,'observed reserve evidence must not be rewritten');
console.log('PASS resource quantity normalization: canonical units, conversions, and source provenance preserved.');
