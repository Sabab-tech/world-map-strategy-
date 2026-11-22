import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../omega_government_international_investment_ui_v1.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  const profiles = [
    { iso3: 'BGD', countryCode: 'BGD', name: 'Bangladesh', currencyCode: 'BDT' },
    { iso3: 'USA', countryCode: 'USA', name: 'United States', currencyCode: 'USD' },
    { iso3: 'DEU', countryCode: 'DEU', name: 'Germany', currencyCode: 'EUR' }
  ];
  const state = {
    simulation: { turn: 12, session: { playerCountryId: 'BGD' } },
    resource: {
      BGD: { industrialNetwork: { projects: [
        { projectId: 'BGD-FACTORY-01', projectName: 'Bangladesh steel works', costUsd: 8000000, status: 'UNDER_CONSTRUCTION' },
        { projectId: 'BGD-OLD-01', costUsd: 1000000, status: 'PLANNED' },
        { projectId: 'BGD-CANCELLED-01', costUsd: 1000000, status: 'CANCELLED' }
      ] } },
      USA: { industrialNetwork: { projects: [
        { projectId: 'USA-PORT-01', projectName: 'Atlantic port upgrade', costUsd: 12000000, status: 'COMPLETED' },
        { projectId: 'USA-REJECTED-01', costUsd: 500000, status: 'REJECTED' }
      ] } },
      DEU: { industrialNetwork: { projects: [] } }
    }
  };
  const quotes = [];
  const finance = {
    init: async () => ({ status: 'READY' }),
    getBudget: () => ({ status: 'READY', availableInvestmentBudgetUsd: 50000000,
      maximumPerProjectUsd: 17500000, protectedReserveUsd: 5000000 }),
    getPortfolio: () => ({ inboundProposals: [], outboundProposals: [], fundingRequests: [],
      investments: [], loans: [] }),
    getRiskSnapshot: () => ({}),
    quoteProject(input) {
      quotes.push(input);
      return { status: 'QUOTED', projectCostUsd: input.projectType === 'MINE' ? 2400000 : input.amountUsd,
        materials: [{ sufficient: true }, { sufficient: true }] };
    }
  };
  const sandbox = {
    Intl, Date, Math, Number, String, Object, Array, Promise,
    Game: { state },
    OmegaCountryRuntimeData: {
      listProfiles: () => profiles,
      getProfile: code => profiles.find(row => row.iso3 === code) || null
    },
    OmegaForexMonetaryEngine: {
      getCurrencyCode: profile => profile.currencyCode,
      getRate: currency => ({ BDT: 110, USD: 1, EUR: 0.92 }[currency] || null)
    },
    OmegaGovernmentInvestmentRuntimeV1: finance,
    OmegaResourceIndustrialCatalogData: { factoryProfiles: {
      STEEL: { displayName: 'Steel works', constructionCost: 250000, unit: 'GAME_CURRENCY_UNITS', defaultRecipeId: 'STEEL_STANDARD' },
      TEXTILE: { displayName: 'Textile mill', constructionCost: 180000, unit: 'GAME_CURRENCY_UNITS' }
    } },
    OmegaResourceSiteCanonicalCatalogData: { sites: [
      { siteId: 'BGD-IRON-01', countryId: 'BGD', siteName: 'Chattogram iron site', resourceId: 'IRON', map: { markerEligible: true } },
      { siteId: 'BGD-GAS-01', countryId: 'BGD', siteName: 'Sylhet gas field', resourceId: 'NATURAL_GAS', map: { markerEligible: true } },
      { siteId: 'BGD-HIDDEN-01', countryId: 'BGD', siteName: 'Hidden alias', resourceId: 'IRON', runtime: { aliasOfSiteId: 'BGD-IRON-01' }, map: { markerEligible: true } },
      { siteId: 'BGD-NOMAP-01', countryId: 'BGD', siteName: 'Not map eligible', resourceId: 'IRON', map: { markerEligible: false } },
      { siteId: 'BGD-SOURCE-01', sourceSiteRecord: { countryCode: 'BGD' }, siteName: 'Source-linked copper site', resourceId: 'COPPER', map: { markerEligible: true } },
      { siteId: 'USA-IRON-01', countryId: 'USA', siteName: 'Great Lakes iron site', resourceId: 'IRON', map: { markerEligible: true } }
    ] }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  runInNewContext(source, sandbox, { filename: 'omega_government_international_investment_ui_v1.js' });
  return { ui: sandbox.OmegaGovernmentInvestmentUIV1, quotes, state };
}

function fakeNode(value = '', attrs = {}) {
  return {
    value, attrs, innerHTML: '', disabled: false, hidden: false,
    getAttribute(name) { return this.attrs[name] || null; }
  };
}

test('investment destinations and target opportunities are sourced from current country records', () => {
  const { ui } = harness();
  const bangladesh = ui.listOpportunities('BGD');
  assert.deepEqual(plain(bangladesh.projectTypes.map(row => row.value)), ['FACTORY', 'MINE', 'INFRASTRUCTURE', 'EXISTING_PROJECT']);
  assert.deepEqual(plain(bangladesh.factories.map(row => row.value)), ['STEEL', 'TEXTILE']);
  assert.deepEqual(plain(bangladesh.mines.map(row => row.value)), ['BGD-IRON-01', 'BGD-GAS-01', 'BGD-NOMAP-01', 'BGD-SOURCE-01']);
  assert.deepEqual(plain(bangladesh.projects.map(row => row.value)), ['BGD-FACTORY-01']);
  const unitedStates = ui.listOpportunities('USA');
  assert.deepEqual(plain(unitedStates.mines.map(row => row.value)), ['USA-IRON-01']);
  assert.deepEqual(plain(unitedStates.projects.map(row => row.value)), ['USA-PORT-01']);
  assert.deepEqual(plain(ui.listOpportunities('').projectTypes), []);
  assert.deepEqual(plain(ui.listOpportunities('').factories), []);
  assert.deepEqual(plain(ui.listOpportunities('').mines), []);
});

test('investment explorer requires the player to select destination and opportunity', () => {
  const { ui } = harness();
  const html = ui.render('BGD', true, null);
  assert.match(html, /Select destination country/);
  assert.match(html, /Select a destination first/);
  assert.match(html, /data-gov-opportunity-summary/);
  assert.match(html, /Choose a destination first/);
  assert.doesNotMatch(html, /<option value="BGD" selected>/);
  assert.doesNotMatch(html, /<option value="FACTORY" selected>/);
});

test('changing destination refreshes site and project targets and requests a live mine quote', () => {
  const { ui, quotes } = harness();
  const nodes = {
    '[data-gov-host-country]': fakeNode('USA'),
    '[data-gov-project-type]': fakeNode('MINE'),
    '[data-gov-instrument]': fakeNode('EQUITY'),
    '[data-gov-factory-type]': fakeNode('STEEL'),
    '[data-gov-site]': fakeNode('USA-IRON-01'),
    '[data-gov-existing-project]': fakeNode('USA-PORT-01'),
    '[data-gov-opportunity-summary]': fakeNode()
  };
  const values = [
    { name: 'hostCountryId', value: 'USA' }, { name: 'projectType', value: 'MINE' },
    { name: 'amount', value: '110000' }, { name: 'siteId', value: 'USA-IRON-01' },
    { name: 'assignedWorkers', value: '80' }, { name: 'quantity', value: '2' },
    { name: 'factoryType', value: 'STEEL' }, { name: 'existingProjectId', value: 'USA-PORT-01' }
  ];
  const fields = ['equity', 'loan', 'factory', 'mine', 'infrastructure', 'existing']
    .map(field => fakeNode('', { 'data-gov-field': field }));
  const form = {
    elements: values,
    querySelector(selector) { return nodes[selector] || null; },
    querySelectorAll(selector) { return selector === '[data-gov-field]' ? fields : []; }
  };
  ui.refreshForm(form, 'BGD');
  assert.match(nodes['[data-gov-site]'].innerHTML, /USA-IRON-01/);
  assert.doesNotMatch(nodes['[data-gov-site]'].innerHTML, /BGD-IRON-01/);
  assert.match(nodes['[data-gov-existing-project]'].innerHTML, /USA-PORT-01/);
  assert.match(nodes['[data-gov-opportunity-summary]'].innerHTML, /Great Lakes iron site/);
  assert.match(nodes['[data-gov-opportunity-summary]'].innerHTML, /Finance project quote/);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].hostCountryId, 'USA');
  assert.equal(quotes[0].siteId, 'USA-IRON-01');
  assert.equal(fields.find(node => node.attrs['data-gov-field'] === 'mine').hidden, false);
  assert.equal(fields.find(node => node.attrs['data-gov-field'] === 'factory').hidden, true);
});

test('factory opportunities disclose country-level placement and do not invent regional choices', () => {
  const { ui, quotes } = harness();
  const nodes = {
    '[data-gov-host-country]': fakeNode('DEU'),
    '[data-gov-project-type]': fakeNode('FACTORY'),
    '[data-gov-instrument]': fakeNode('EQUITY'),
    '[data-gov-factory-type]': fakeNode('STEEL'),
    '[data-gov-site]': fakeNode(''),
    '[data-gov-existing-project]': fakeNode(''),
    '[data-gov-opportunity-summary]': fakeNode()
  };
  const values = [
    { name: 'hostCountryId', value: 'DEU' }, { name: 'projectType', value: 'FACTORY' },
    { name: 'amount', value: '92000' }, { name: 'factoryType', value: 'STEEL' },
    { name: 'siteId', value: '' }, { name: 'existingProjectId', value: '' }
  ];
  const form = {
    elements: values,
    querySelector(selector) { return nodes[selector] || null; },
    querySelectorAll() { return []; }
  };
  ui.refreshForm(form, 'BGD');
  assert.match(nodes['[data-gov-opportunity-summary]'].innerHTML, /country-level/);
  assert.match(nodes['[data-gov-opportunity-summary]'].innerHTML, /Finance project quote/);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].hostCountryId, 'DEU');
  assert.equal(quotes[0].factoryType, 'STEEL');
});
