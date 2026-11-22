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
      getProfile: code => profiles.find(row => row.iso3 === code) || null,
      flagFor: code => ({ BGD: '🇧🇩', USA: '🇺🇸', DEU: '🇩🇪' }[code] || null)
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
  assert.match(html, /Select destination first/);
  assert.match(html, /Select a sector first/);
  assert.match(html, /data-gov-opportunity-summary/);
  assert.match(html, /Select a destination country/);
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

test('investment explorer renders country flags, amount/share/interest sliders and live deal controls', () => {
  const { ui } = harness();
  const html = ui.render('BGD', true, null);
  assert.match(html, /🇧🇩 Bangladesh/);
  assert.match(html, /🇺🇸 United States/);
  assert.match(html, /data-gov-sector/);
  assert.match(html, /data-gov-amount-slider/);
  assert.match(html, /data-gov-share-slider/);
  assert.match(html, /data-gov-interest-slider/);
  assert.match(html, /name="durationYears"/);
  assert.match(html, /name="gracePeriodYears"[^>]*value="0"/);
  assert.match(html, /Joint venture \/ profit-sharing/);
  assert.match(html, /data-gov-live-preview/);
  assert.match(html, /Select a destination and sector to preview the deal/);
  assert.doesNotMatch(html, /Historical acceptance rate/);
  assert.match(html, /value="10"/);
  assert.match(html, /value="1" selected>1 year/);
});

test('historical acceptance estimate uses only comparable, completed bilateral decisions', () => {
  const { ui, state } = harness();
  const proposal = (proposalId, decision) => ({
    proposalId, investorCountryId: 'BGD', hostCountryId: 'USA',
    projectType: 'FACTORY', sector: 'METALS_AND_ALLOYS', factoryType: 'STEEL',
    instrument: 'LOAN', amountUsd: 10000, durationYears: 2,
    equityShareBps: 0, annualInterestRateBps: 1000,
    status: decision === 'ACCEPT' ? 'APPROVED' : 'DECLINED',
    hostDecision: { decision }
  });
  state.finance = {
    BGD: { omegaFinance: { governmentInvestmentV1: { proposals: [
      proposal('DEAL-1', 'ACCEPT'), proposal('DEAL-2', 'ACCEPT')
    ] } } },
    USA: { omegaFinance: { governmentInvestmentV1: { proposals: [
      proposal('DEAL-1', 'ACCEPT'), proposal('DEAL-3', 'DECLINE')
    ] } } }
  };
  const terms = {
    projectType: 'FACTORY', sector: 'METALS_AND_ALLOYS', instrument: 'LOAN',
    amountUsd: 10000, durationYears: 2, equityShareBps: 0, annualInterestRateBps: 1000
  };
  const estimate = ui.estimateAcceptanceRate('BGD', 'USA', terms);
  assert.equal(estimate.available, true);
  assert.equal(estimate.sampleSize, 3);
  assert.equal(estimate.accepted, 2);
  assert.equal(estimate.rejected, 1);
  assert.equal(estimate.ratePct, 66.7);
  const changedTerms = ui.estimateAcceptanceRate('BGD', 'USA', { ...terms, durationYears: 10, amountUsd: 50000 });
  assert.equal(changedTerms.available, false);
  assert.equal(changedTerms.sampleSize, 0);
});


test('loan repayment preview mirrors quarterly amortization and interest-only grace periods', () => {
  const { ui } = harness();
  const standard = plain(ui.previewLoanRepayment(10000, 1000, 1, 0));
  assert.equal(standard.available, true);
  assert.equal(standard.paymentFrequencyDays, 90);
  assert.equal(standard.totalInstallments, 4);
  assert.equal(standard.graceInstallments, 0);
  assert.equal(standard.amortizingInstallments, 4);
  assert.equal(standard.firstGracePaymentUsd, null);
  assert.equal(standard.firstAmortizingPaymentUsd, 2658.18);
  assert.equal(standard.totalInterestUsd, 632.72);
  assert.equal(standard.totalRepaymentUsd, 10632.72);
  assert.equal(standard.remainingPrincipalUsd, 0);

  const withGrace = plain(ui.previewLoanRepayment(10000, 1000, 2, 1));
  assert.equal(withGrace.graceInstallments, 4);
  assert.equal(withGrace.amortizingInstallments, 4);
  assert.equal(withGrace.firstGracePaymentUsd, 250);
  assert.equal(withGrace.firstAmortizingPaymentUsd, 2658.18);
  assert.ok(withGrace.totalInterestUsd > standard.totalInterestUsd);
  assert.equal(withGrace.remainingPrincipalUsd, 0);
  assert.equal(ui.previewLoanRepayment(10000, 1000, 1, 1).available, false);
});

test('grace-period terms are included in historical acceptance comparisons', () => {
  const { ui, state } = harness();
  const proposal = (proposalId, decision) => ({
    proposalId, investorCountryId: 'BGD', hostCountryId: 'USA',
    projectType: 'FACTORY', sector: 'METALS_AND_ALLOYS', factoryType: 'STEEL',
    instrument: 'LOAN', amountUsd: 10000, durationYears: 2,
    equityShareBps: 0, annualInterestRateBps: 1000, gracePeriodYears: 0,
    status: decision === 'ACCEPT' ? 'APPROVED' : 'DECLINED',
    hostDecision: { decision }
  });
  state.finance = {
    BGD: { omegaFinance: { governmentInvestmentV1: { proposals: [
      proposal('GRACE-1', 'ACCEPT'), proposal('GRACE-2', 'ACCEPT')
    ] } } },
    USA: { omegaFinance: { governmentInvestmentV1: { proposals: [
      proposal('GRACE-1', 'ACCEPT'), proposal('GRACE-3', 'DECLINE')
    ] } } }
  };
  const terms = {
    projectType: 'FACTORY', sector: 'METALS_AND_ALLOYS', instrument: 'LOAN',
    amountUsd: 10000, durationYears: 2, equityShareBps: 0,
    annualInterestRateBps: 1000, gracePeriodYears: 0
  };
  assert.equal(ui.estimateAcceptanceRate('BGD', 'USA', terms).sampleSize, 3);
  assert.equal(ui.estimateAcceptanceRate('BGD', 'USA', { ...terms, gracePeriodYears: 1 }).sampleSize, 0);
});

test('live loan preview shows bilateral country flags and the selected grace-period repayment terms', () => {
  const { ui } = harness();
  const nodes = {
    '[data-gov-host-country]': fakeNode('USA'),
    '[data-gov-sector]': fakeNode('MINING'),
    '[data-gov-project-type]': fakeNode('MINE'),
    '[data-gov-instrument]': fakeNode('LOAN'),
    '[data-gov-factory-type]': fakeNode(''),
    '[data-gov-site]': fakeNode('USA-IRON-01'),
    '[data-gov-existing-project]': fakeNode(''),
    '[data-gov-amount-slider]': fakeNode('0'),
    '[name="amount"]': fakeNode('110000'),
    '[data-gov-share-slider]': fakeNode('20'),
    '[name="equitySharePct"]': fakeNode('20'),
    '[data-gov-interest-slider]': fakeNode('10'),
    '[name="interestPct"]': fakeNode('10'),
    '[name="durationYears"]': fakeNode('2'),
    '[name="gracePeriodYears"]': fakeNode('1'),
    '[data-gov-opportunity-summary]': fakeNode(),
    '[data-gov-live-preview]': fakeNode()
  };
  nodes['[name="amount"]'].min = '1';
  nodes['[name="amount"]'].max = '2000000000';
  nodes['[name="amount"]'].step = '0.01';
  const values = [
    { name: 'hostCountryId', value: 'USA' }, { name: 'sector', value: 'MINING' },
    { name: 'projectType', value: 'MINE' }, { name: 'instrument', value: 'LOAN' },
    { name: 'amount', value: '110000' }, { name: 'interestPct', value: '10' },
    { name: 'durationYears', value: '2' }, { name: 'gracePeriodYears', value: '1' },
    { name: 'siteId', value: 'USA-IRON-01' }, { name: 'quantity', value: '1' },
    { name: 'assignedWorkers', value: '50' }, { name: 'equitySharePct', value: '20' }
  ];
  const form = {
    elements: values,
    querySelector(selector) { return nodes[selector] || null; },
    querySelectorAll() { return []; }
  };
  ui.refreshForm(form, 'BGD');
  const preview = nodes['[data-gov-live-preview]'].innerHTML;
  assert.match(preview, /🇧🇩 Bangladesh → 🇺🇸 United States/);
  assert.match(preview, /Grace period/);
  assert.match(preview, /4 interest-only quarterly payments/);
  assert.match(preview, /First amortizing payment · quarterly/);
  assert.match(preview, /Estimated total interest income/);
  assert.match(preview, /Estimated total repayment/);
  assert.doesNotMatch(preview, /simple interest/i);
});

test('share and interest number inputs clamp to their slider bounds and preserve blank edits', () => {
  const { ui } = harness();
  const shareRange = fakeNode('20'); shareRange.min = '1'; shareRange.max = '75'; shareRange.step = '1';
  const shareInput = fakeNode('90'); shareInput.min = '1'; shareInput.max = '75'; shareInput.step = '1';
  const interestRange = fakeNode('10'); interestRange.min = '0'; interestRange.max = '20'; interestRange.step = '0.1';
  const interestInput = fakeNode('25'); interestInput.min = '0'; interestInput.max = '20'; interestInput.step = '0.1';
  const nodes = {
    '[data-gov-share-slider]': shareRange,
    '[name="equitySharePct"]': shareInput,
    '[data-gov-interest-slider]': interestRange,
    '[name="interestPct"]': interestInput
  };
  const form = { querySelector(selector) { return nodes[selector] || null; }, querySelectorAll() { return []; } };
  ui.refreshForm(form, 'BGD', shareInput);
  assert.equal(shareInput.value, '75');
  assert.equal(shareRange.value, '75');
  ui.refreshForm(form, 'BGD', interestInput);
  assert.equal(interestInput.value, '20');
  assert.equal(interestRange.value, '20');
  interestInput.value = '';
  interestRange.value = '5';
  ui.refreshForm(form, 'BGD', interestInput);
  assert.equal(interestInput.value, '');
  assert.equal(interestRange.value, '5');
});
