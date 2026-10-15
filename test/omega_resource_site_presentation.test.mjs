import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const binding = read('omega_resource_gameplay_binding_v1.js');
const css = read('omega_ui_visual_system_v1.css');
const context = {
  console: { log(){}, warn(){}, error(){} },
  addEventListener(){},
  setTimeout(){ return 0; },
  Omega: {}
};
vm.createContext(context);
vm.runInContext(binding, context, { filename: 'omega_resource_gameplay_binding_v1.js', timeout: 3000 });
const render = context.Omega?.IndividualResourceSitePresentation?.render;

test('resource site detail uses readable, source-labelled measures and hides raw object dumps', () => {
  assert.equal(typeof render, 'function', 'the site detail presenter must be exposed for regression tests');
  const site = {
    siteId: 'SITE_USA_test_copper_mine',
    siteName: 'Test Copper Mine',
    countryId: 'USA',
    real: { resourceId: 'copper', extractionMethod: 'OPEN_PIT', operationStatus: 'ACTIVE_PRODUCING' },
    location: {
      countryName: 'United States',
      locality: 'Morenci',
      adminRegion: 'Arizona',
      coordinateStatus: 'OBSERVED',
      coordinates: { lat: 33.075, lng: -109.365 }
    },
    quantitative: {
      reserve: { quantity: 1200000, unit: 'tonnes', authority: 'OBSERVED' },
      production: {
        rate: 200, unit: 'tonnes/day',
        annual: 73000, annualUnit: 'tonnes/year',
        authority: 'OBSERVED'
      },
      grade: { value: 0.8, unit: '%', authority: 'OBSERVED' },
      recovery: { value: 85, unit: '%', authority: 'OBSERVED' }
    },
    logistics: {
      routes: [{
        name: 'Rail to smelter',
        mode: 'rail',
        origin: 'Morenci mine',
        destination: 'Regional smelter',
        distanceKm: 42,
        transitDays: 1
      }]
    },
    processing: {
      upstreamProcess: 'Crushing',
      midstreamProcess: 'Smelting',
      refinedOutputs: [{ name: 'Copper cathode' }],
      downstreamSectors: ['Electrical equipment']
    },
    observedFacts: [
      { metric: 'Operator-reported workforce', value: 120, unit: 'people', status: 'OBSERVED' }
    ]
  };

  const html = render(site);
  assert.match(html, /Test Copper Mine/);
  assert.match(html, /Copper/);
  assert.match(html, /1,200,000 tonnes/);
  assert.match(html, /200 tonnes\/day/);
  assert.match(html, /Observed/);
  assert.match(html, /Transport &amp; routes|Transport & routes/);
  assert.match(html, /Rail to smelter/i);
  assert.match(html, /Copper cathode/i);
  assert.match(html, /Data quality &amp; source|Data quality & source/);
  assert.doesNotMatch(html, /<pre\b|Not specified|SOURCE_STATUS_NOT_SET|undefined|NaN/i,
    'details must not leak raw JSON blobs or empty placeholder values');
});

test('sparse site profiles remain clean and do not invent reserve or output figures', () => {
  assert.equal(typeof render, 'function');
  const html = render({
    siteId: 'SITE_CAN_sparse_gold_deposit',
    siteName: 'Sparse Gold Deposit',
    countryId: 'CAN',
    real: { resourceId: 'gold' }
  });
  assert.match(html, /Sparse Gold Deposit/);
  assert.match(html, /No reserve or output figures are recorded for this site yet/);
  assert.doesNotMatch(html, /Not specified|undefined|UNKNOWN|<pre\b|NaN/i);
});

test('resource detail panel has responsive, non-monospaced visual styles', () => {
  assert.match(css, /#omega-individual-resource-panel\.omega-resource-site-panel/);
  assert.match(css, /\.omega-site-metrics/);
  assert.match(css, /\.omega-site-details/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.doesNotMatch(binding.slice(binding.indexOf('function renderSiteDetail('), binding.indexOf('function detail(s)')), /JSON\.stringify|<pre\b/,
    'the primary site renderer must not expose raw source objects');
});

console.log('OMEGA RESOURCE SITE PRESENTATION TESTS PASSED');