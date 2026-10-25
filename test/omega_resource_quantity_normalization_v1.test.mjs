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
