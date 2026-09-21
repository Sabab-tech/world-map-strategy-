import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const IDS = [
  'cabinet','defense','military','finance','economy','trade','foreign',
  'intelligence','interior','transport','resource','health','education',
  'technology','projects','culture','statistics'
];

test('OMEGA canonical 17-ministry runtime executes every ministry adapter', () => {
  const events = [];
  const kernelStates = new Map();
  const registered = [];

  const kernel = {
    registerMinistry(id) {
      registered.push(id);
      if (!kernelStates.has(id)) kernelStates.set(id, 'REGISTERED');
    },
    getMinistryState(id) {
      return kernelStates.get(id) || 'STOPPED';
    },
    createBridge() {
      return {
        emitEvent(topic, payload) {
          events.push({ topic, payload });
        }
      };
    }
  };

  for (const id of IDS) kernelStates.set(id, 'RUNNING');

  const sandbox = {
    console,
    Date,
    JSON,
    Object,
    Number,
    Math,
    Map,
    Set,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    dispatchEvent(event) { events.push({ topic: event.type, payload: event.detail }); },
    Omega: { Kernel: kernel },
    GLOBAL_MINISTRY_MANIFEST: IDS.map(id => ({ id, status: 'READY' }))
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const source = fs.readFileSync(new URL('../omega_ministry_runtime_v1.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'omega_ministry_runtime_v1.js' });

  const runtime = sandbox.OMEGA_MINISTRY_RUNTIME_V1;
  assert.ok(runtime, 'runtime controller must load');
  assert.equal(runtime.version, '1.0.0');
  assert.equal(JSON.stringify(runtime.getIds()), JSON.stringify(IDS));

  assert.equal(runtime.init(kernel), true);
  assert.equal(registered.length, IDS.length, 'exactly 17 canonical registrations expected');

  const stores = new Map();
  for (const id of IDS) {
    const store = {
      policies: new Map(),
      knowledgeGraph: new Map(),
      goalStack: []
    };
    stores.set(id, store);
    const telemetry = runtime.tick(id, 16.7, 42, store, null);
    assert.equal(telemetry.id, id);
    assert.equal(telemetry.domain, runtime.specs[id].domain);
    assert.equal(telemetry.tick, 42);
    assert.equal(telemetry.active, true);
    assert.equal(telemetry.runtimeRevision, 1);
    assert.equal(store.policies.get('__omega_runtime__').ministryId, id);
    assert.equal(store.knowledgeGraph.get('__omega_runtime_domain__').domain, runtime.specs[id].domain);
    assert.ok(store.goalStack.includes('RUNTIME:' + id));

    const state = runtime.getState(id);
    assert.equal(state.ticks, 1);
    assert.equal(state.lastTick, 42);
    assert.equal(state.active, true);
  }

  assert.equal(runtime.health().count, 17);
  assert.equal(runtime.health().active, 17);
  assert.equal(runtime.health().ticked, 17);
  assert.equal(runtime.health().failed, 0);
  assert.ok(events.some(e => e.topic === 'OMEGA_17_MINISTRY_RUNTIME_READY'));
  assert.equal(events.filter(e => e.topic === 'OMEGA_MINISTRY_RUNTIME_TICK').length, 17);

  console.log('OMEGA 17-ministry runtime test: PASS');
});


test('OMEGA boot wiring exposes all 17 ministries through the single scheduler', () => {
  const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const selector = fs.readFileSync(new URL('../omega_live_minister_selector.js', import.meta.url), 'utf8');

  assert.match(indexHtml, /omega_ministry_runtime_v1\.js/);
  for (const id of IDS) assert.ok(indexHtml.includes('"' + id + '"'), 'index must retain canonical ministry id: ' + id);

  const bridgeStart = selector.indexOf('OMEGA 17-MINISTRY LIVE ACTIVATION BRIDGE v2.0.0');
  assert.ok(bridgeStart >= 0, 'selector must use v2 canonical runtime shim');
  assert.equal(selector.slice(bridgeStart).includes('setInterval('), false, 'selector must not own a second ministry scheduler');
});
