import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const countries = readJson('resource_country_resource_context_index.json');
const economyRules = readJson('resource_economy_rules.json');
const catalog = readJson('resource_industrial_catalog_v1.json');
const roleRules = readJson('omega_commercial_product_role_rules_v1.json');

function normalizedIdentity(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function roleForProduct(product) {
  const usageClass = String(product?.usageClass || '').trim();
  return roleRules.usageClassToRole[usageClass] || roleRules.unrecognisedUsageClassFallback;
}

test('commercial role metadata keeps the existing 197/41/21/22 identities intact', () => {
  const rawProfiles = economyRules.demand.resourceProfiles || {};
  const rawRules = catalog.processingRules || {};
  const factories = catalog.factoryProfiles || {};
  const recipes = catalog.downstreamFactoryRecipes || {};

  assert.equal(Object.keys(countries.countries || {}).length, 197);
  assert.equal(Object.keys(rawProfiles).length, 41);
  assert.equal(Object.keys(factories).length, 21);
  assert.equal(Object.keys(recipes).length, 22);
  assert.equal(Object.keys(catalog.productUseCatalog.products || {}).length, 185);
  assert.equal(Object.keys(rawRules).length, 42);
  assert.deepEqual(roleRules.invariants, {
    coreCountryCount: 197,
    rawResourceCount: 41,
    factoryCategoryCount: 21,
    downstreamRecipeCount: 22,
    productUseCatalogCount: 185,
    downstreamRecipeOutputCount: 75,
    productUsageClassCount: 77
  });

  // Preserve the existing extra processing support rule instead of promoting it
  // into the 41-resource country/profile roster.
  const supportOnlyRules = Object.keys(rawRules).filter(id => !Object.hasOwn(rawProfiles, id));
  assert.deepEqual(supportOnlyRules, ['silica_sand']);
});

test('all existing product-use classes have explicit roles and unknown classes fail closed', () => {
  const products = catalog.productUseCatalog.products || {};
  const usageClasses = [...new Set(Object.values(products).map(row => row.usageClass))].sort();
  assert.equal(usageClasses.length, 77);
  assert.deepEqual(Object.keys(roleRules.usageClassToRole).sort(), usageClasses);
  assert.equal(roleRules.unrecognisedUsageClassFallback, 'UNMAPPED_OR_UNSUPPORTED');
  assert.equal(roleForProduct({ usageClass: 'FUTURE_UNREVIEWED_CLASS' }), 'UNMAPPED_OR_UNSUPPORTED');

  for (const [productId, product] of Object.entries(products)) {
    assert.ok(roleRules.allowedRoles.includes(roleForProduct(product)),
      productId + ' must resolve to an allowed product role');
  }
});

test('raw resources receive descriptive roles without authorizing household consumption', () => {
  const profiles = economyRules.demand.resourceProfiles || {};
  const policy = roleRules.rawResourceRolePolicy;
  const validRoles = new Set(roleRules.allowedRoles);
  const overrideIds = Object.keys(policy.overrides || {});

  assert.equal(policy.populationDemandEligibility, 'NOT_ESTABLISHED_BY_ROLE_METADATA');
  assert.equal(policy.usePopulationCoefficientsAsHouseholdDemand, false);
  for (const id of overrideIds) assert.ok(Object.hasOwn(profiles, id), 'override cannot create resource ' + id);

  let calibrated = 0;
  let uncalibrated = 0;
  for (const [id, profile] of Object.entries(profiles)) {
    const role = policy.overrides[id] || policy.defaultRole;
    assert.ok(validRoles.has(role), id + ' must resolve to an allowed role');
    assert.notEqual(role, 'HOUSEHOLD_DIRECT', id + ' raw resource cannot become a household good through this audit');
    assert.notEqual(role, 'PROCESSED_CONSUMER_GOOD', id + ' raw resource cannot become a processed consumer good through this audit');
    if (Number.isFinite(Number(profile.basePerMillionPopulation)) && Number(profile.basePerMillionPopulation) > 0) calibrated++;
    else uncalibrated++;
  }
  assert.equal(calibrated, 37);
  assert.equal(uncalibrated, 4);
  assert.equal(overrideIds.length, 18);
});

test('every downstream recipe output resolves to an existing product identity without aliases', () => {
  const existingProductIds = new Set(Object.keys(catalog.productUseCatalog.products || {}).map(normalizedIdentity));
  const recipes = catalog.downstreamFactoryRecipes || {};
  const outputs = Object.values(recipes).flatMap(recipe => Object.keys(recipe.outputs || {}));
  const uniqueOutputs = [...new Set(outputs)];

  assert.equal(uniqueOutputs.length, 75);
  for (const outputId of uniqueOutputs) {
    assert.ok(existingProductIds.has(normalizedIdentity(outputId)),
      'recipe output must match an existing product-use identity: ' + outputId);
  }
  assert.equal(roleRules.recipeOutputIdentityPolicy.createAliases, false);
  assert.equal(roleRules.recipeOutputIdentityPolicy.createProductIds, false);
});

test('role metadata has no gameplay, trade, save, or real-world quantity authority', () => {
  assert.equal(roleRules.runtimeEffect, 'NONE');
  assert.equal(roleRules.tradeEffect, 'NONE');
  assert.equal(roleRules.saveEffect, 'NONE');
  assert.equal(roleRules.sourceDataEffect, 'NO_REAL_WORLD_QUANTITIES_OR_PARTNER_SHARES');
  assert.equal(roleRules.rawResourceRolePolicy.usePopulationCoefficientsAsHouseholdDemand, false);
});
