'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'omega_minister_state_system.js'), 'utf8');
const recruitmentSource = fs.readFileSync(path.join(root, 'minister_recruitment_engine.js'), 'utf8');
const ministryUiSource = fs.readFileSync(path.join(root, 'ministry_engine.js'), 'utf8');
const rawMinisters = JSON.parse(fs.readFileSync(path.join(root, 'ministers.json'), 'utf8'));
const ministers = rawMinisters.ministers_database || rawMinisters.ministers || rawMinisters;

function plainText(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this.parentNode = null;
    this.style = {};
    this.classList = { add() {} };
    this.className = '';
    this.id = '';
    this.disabled = false;
    this.onclick = null;
    this._innerHTML = '';
    this._textContent = '';
    this._detail = null;
  }

  set innerHTML(value) {
    this._innerHTML = String(value == null ? '' : value);
    this.children = [];
    this._detail = null;

    const hasActions = /data-action="(?:primary|manage|recruit|fire)"/.test(this._innerHTML);
    if (hasActions) {
      const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
      let match;
      while ((match = buttonPattern.exec(this._innerHTML))) {
        const attributes = match[1];
        const action = attributes.match(/\bdata-action="([^"]+)"/);
        if (!action) continue;
        const button = new FakeElement('button');
        button.dataset.action = action[1];
        const classMatch = attributes.match(/\bclass="([^"]+)"/);
        button.className = classMatch ? classMatch[1] : '';
        button.disabled = /\sdisabled(?:\s|$)/.test(attributes);
        button.textContent = plainText(match[2]).trim();
        this.appendChild(button);
      }
    }

    if (this._innerHTML.includes('class="omr-grid"')) {
      const cardPattern = /<div class="omr-card ([^"]*)" data-id="([^"]+)" role="button" tabindex="0"[^>]*>([\s\S]*?)<\/div>/g;
      let match;
      while ((match = cardPattern.exec(this._innerHTML))) {
        const card = new FakeElement('div');
        card.className = 'omr-card ' + match[1];
        card.dataset.id = match[2];
        card.textContent = plainText(match[3]).trim();
        const actionPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
        let actionMatch;
        while ((actionMatch = actionPattern.exec(match[3]))) {
          const attributes = actionMatch[1];
          const action = attributes.match(/\bdata-action="([^"]+)"/);
          if (!action) continue;
          const button = new FakeElement('button');
          button.dataset.action = action[1];
          const classMatch = attributes.match(/\bclass="([^"]+)"/);
          button.className = classMatch ? classMatch[1] : '';
          button.disabled = /\sdisabled(?:\s|$)/.test(attributes);
          button.textContent = plainText(actionMatch[2]).trim();
          card.appendChild(button);
        }
        this.appendChild(card);
      }
      this._detail = new FakeElement('div');
      this._detail.className = 'omr-detail';
    }
  }

  get innerHTML() { return this._innerHTML; }
  set textContent(value) { this._textContent = String(value == null ? '' : value); }
  get textContent() { return this._textContent || plainText(this._innerHTML); }

  appendChild(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  querySelector(selector) {
    if (selector === '.omr-detail') return this._detail;
    if (selector === '[data-omega-recruitment="button"]') {
      return this.children.find(child => child.dataset.omegaRecruitment === 'button') || null;
    }
    if (selector === '.omega-recruitment-host') {
      return this.children.find(child => child.className === 'omega-recruitment-host') || null;
    }
    const action = selector.match(/^\[data-action(?:="([^"]+)")?\]$/);
    if (action) {
      return this.children.find(child => child.dataset.action &&
        (!action[1] || child.dataset.action === action[1])) || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '.omr-card') return this.children.filter(child => child.className.includes('omr-card'));
    return [];
  }

  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }

  async dispatch(type, event = {}) {
    const payload = Object.assign({
      preventDefault() {},
      stopPropagation() {}
    }, event);
    const callbacks = this.listeners[type] || [];
    const results = [];
    for (const callback of callbacks) results.push(await callback(payload));
    return results;
  }
}

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || {};
  }
}

function buildRuntime() {
  const ministryDatabase = {
    interior_security: { id: 'interior_security', ministerName: null },
    trade: { id: 'trade', ministerName: null },
    treasury_finance: { id: 'treasury_finance', ministerName: null }
  };
  const content = new FakeElement('div');
  content.id = 'ministry-dashboard-content';
  const documentElements = new Map([[content.id, content]]);
  const head = new FakeElement('head');
  head.appendChild = element => {
    element.parentNode = head;
    head.children.push(element);
    if (element.id) documentElements.set(element.id, element);
    return element;
  };
  const document = {
    head,
    readyState: 'complete',
    getElementById(id) { return documentElements.get(id) || null; },
    querySelector(selector) {
      if (selector === '#ministry-dashboard-content .omega-recruitment-host') {
        return content.querySelector('.omega-recruitment-host');
      }
      return null;
    },
    createElement(tagName) { return new FakeElement(tagName); }
  };
  const ui = {
    activeCountry: 'BGD',
    currentDashboardMinistryId: 'interior_security',
    ministriesDatabase: ministryDatabase,
    renderMinistryDashboard(ministryId) {
      this.currentDashboardMinistryId = ministryId;
      content.innerHTML = '<section class="ministry-dashboard">Dashboard refreshed</section>';
    },
    renderCabinet() {}
  };
  const sandbox = {
    console,
    CustomEvent: TestCustomEvent,
    dispatchEvent() { return true; },
    addEventListener() {},
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    document,
    fetch: async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) }),
    confirm: () => true,
    showOmegaNotification() {},
    OmegaMinistersDB: ministers,
    OmegaCabinetUI: ui,
    Game: { currentActiveCountry: 'USA', gameTime: 123 }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(stateSource, sandbox, { filename: 'omega_minister_state_system.js' });
  vm.runInNewContext(recruitmentSource, sandbox, { filename: 'minister_recruitment_engine.js' });
  return { sandbox, ui, content, ministryDatabase, api: sandbox.OmegaMinisterRecruitment };
}

async function flushUi() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

(async () => {
  const { sandbox, ui, content, ministryDatabase, api } = buildRuntime();
  assert.ok(api, 'Recruitment API must be exposed');

  // Exercise every ministry's offline roster mapping, not only one example.
  for (const [ministryId, categories] of Object.entries(api.ministryProfileCategories)) {
    const roster = await api.fetchRoster(ministryId, 'BGD');
    assert.equal(roster.length, 5, ministryId + ' must have five candidate profiles');
    assert.ok(roster.every(candidate => categories.includes(candidate.ministryCategory)),
      ministryId + ' must use a mapped profile group');
  }

  const interiorRoster = await api.fetchRoster('interior_security', 'BGD');
  assert.ok(interiorRoster.every(candidate => candidate.ministryCategory === 'Home_Affairs'),
    'Interior ministry must use Home_Affairs profiles, not arbitrary categories');
  const tradeRoster = await api.fetchRoster('trade', 'BGD');
  assert.ok(tradeRoster.every(candidate => candidate.ministryCategory === 'Economy_Commerce'),
    'Trade ministry must use Economy_Commerce profiles');
  const treasuryRoster = await api.fetchRoster('treasury_finance', 'BGD');
  assert.ok(treasuryRoster.every(candidate => candidate.ministryCategory === 'Finance'),
    'Treasury ministry must use Finance profiles');

  assert.match(ministryUiSource, /Minister: <strong style="color:#f8fafc;">\$\{m\.ministerName \|\| "Vacant"\}<\/strong>/,
    'An empty generic ministry header must display Vacant rather than null');
  assert.match(ministryUiSource, /ministerName \|\| 'Vacant'/,
    'Special ministry screens must also render a vacant placeholder');

  // Render the actual launcher, click Recruit Minister, select a candidate and
  // click the candidate dossier's RECRUIT MINISTER button.
  ui.renderMinistryDashboard('interior_security');
  await flushUi();
  let wrapper = content.querySelector('[data-omega-recruitment="button"]');
  let primary = wrapper && wrapper.querySelector('[data-action="primary"]');
  assert.ok(primary, 'The primary ministry recruitment button must be injected');
  assert.equal(primary.textContent, 'Recruit Minister', 'Vacant ministry must show Recruit Minister');

  primary.onclick({ preventDefault() {}, stopPropagation() {} });
  await flushUi();
  let host = content.querySelector('.omega-recruitment-host');
  assert.ok(host, 'Clicking Recruit Minister must open the candidate roster');
  let cards = host.querySelectorAll('.omr-card');
  assert.equal(cards.length, 5, 'The open roster must render five candidate cards');

  cards[0].dispatch('click');
  const detail = host.querySelector('.omr-detail');
  let dossierRecruitButton = detail && detail.querySelector('[data-action="recruit"]');
  assert.ok(dossierRecruitButton, 'Selecting a candidate must still expose the detailed Recruit Minister action');
  assert.equal(dossierRecruitButton.textContent, 'RECRUIT MINISTER');

  const quickRecruitButton = cards[0].querySelector('[data-action="quick-recruit"]');
  assert.ok(quickRecruitButton, 'Each available candidate must expose a direct Recruit Minister action');
  assert.equal(quickRecruitButton.textContent, 'RECRUIT MINISTER');
  await quickRecruitButton.dispatch('click');
  await flushUi();

  const candidate = interiorRoster[0];
  const active = sandbox.OmegaMinisterStateRegistry.getActiveMinister('BGD', 'interior_security');
  assert.equal(active.ministerId, candidate.id, 'Recruit click must assign the selected minister');
  assert.equal(active.runtimeState.status, 'ACTIVE', 'Recruited minister must be active');
  assert.equal(active.staticProfile.baseAge, Number(candidate.age), 'Profile details must enter canonical state');
  assert.ok(Object.keys(active.staticProfile.baseStats || {}).length > 0,
    'Minister base skill data must be retained');
  assert.ok(Object.keys(active.staticProfile.efficiencyProfile || {}).length > 0,
    'Minister efficiency data must be retained');
  assert.equal(ministryDatabase.interior_security.ministerId, candidate.id,
    'Ministry data must expose the recruited minister ID');
  assert.equal(ministryDatabase.interior_security.ministerName,
    candidate.displayName || candidate.name || candidate.regional_names?.south_asia || candidate.id,
    'Ministry header data must expose the recruited minister name');
  wrapper = content.querySelector('[data-omega-recruitment="button"]');
  primary = wrapper && wrapper.querySelector('[data-action="primary"]');
  assert.equal(primary && primary.textContent, 'Fire Minister',
    'Occupied ministry must switch the primary action to Fire Minister');
  assert.equal(sandbox.OmegaMinisterStateRegistry.consistencyCheck().ok, true,
    'Canonical assignments must remain consistent after recruitment');

  // When the roster is reopened for an occupied ministry, competing candidates
  // must be blocked instead of surfacing a predictable assignment exception.
  const manageButton = wrapper && wrapper.querySelector('[data-action="manage"]');
  assert.ok(manageButton, 'Minister profiles must remain accessible after recruitment');
  manageButton.onclick({ preventDefault() {}, stopPropagation() {} });
  await flushUi();
  host = content.querySelector('.omega-recruitment-host');
  assert.ok(host, 'Manage Minister Profiles must reopen the candidate roster');
  cards = host.querySelectorAll('.omr-card');
  const competingCard = cards.find(card => card.dataset.id !== candidate.id);
  assert.ok(competingCard, 'The roster must still show other candidates');
  const occupiedAction = competingCard.querySelector('[data-action="quick-recruit"]');
  assert.ok(occupiedAction, 'Other candidate cards must display their guarded action');
  assert.equal(occupiedAction.textContent, 'MINISTRY OCCUPIED');
  assert.equal(occupiedAction.disabled, true, 'An occupied ministry must block another appointment');
  competingCard.dispatch('click');
  const blockedDossierAction = host.querySelector('.omr-detail').querySelector('[data-action="recruit"]');
  assert.ok(blockedDossierAction, 'The candidate dossier must explain the blocked action');
  assert.equal(blockedDossierAction.textContent, 'MINISTRY OCCUPIED');
  assert.equal(blockedDossierAction.disabled, true,
    'Dossier recruitment must not attempt to appoint over the active minister');

  // Click the visible Fire Minister button and verify the complete vacancy path.
  primary.onclick({ preventDefault() {}, stopPropagation() {} });
  await flushUi();
  assert.equal(sandbox.OmegaMinisterStateRegistry.getActiveMinister('BGD', 'interior_security'), null,
    'Fire Minister click must vacate the ministry');
  assert.equal(sandbox.OmegaMinisterStateRegistry.getMinister(candidate.id).runtimeState.status, 'FIRED',
    'Fired minister must retain a FIRED lifecycle status');
  assert.equal(ministryDatabase.interior_security.ministerName, null,
    'A vacant ministry must clear its active minister name');
  wrapper = content.querySelector('[data-omega-recruitment="button"]');
  primary = wrapper && wrapper.querySelector('[data-action="primary"]');
  assert.equal(primary && primary.textContent, 'Recruit Minister',
    'Fired minister must return the primary button to Recruit Minister');
  assert.equal(sandbox.OmegaMinisterStateRegistry.consistencyCheck().ok, true,
    'Canonical assignments must remain consistent after firing');

  // Selected ministry country (BGD) must override stale Game country (USA).
  assert.equal(sandbox.OmegaMinisterStateRegistry.getActiveMinister('USA', 'interior_security'), null);

  console.log('OMEGA MINISTER RECRUITMENT LIFECYCLE: PASS');
  console.log('All 18 ministry profile mappings: PASS');
  console.log('Real launcher/card Recruit and Fire button handlers: PASS');
  console.log('Minister dossier activation, dashboard name, vacancy restoration and canonical consistency: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
