import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function createPerformanceMonitorHarness() {
  let timestamp = 0;
  let nextFrameId = 1;
  const frames = new Map();
  const observers = new Map();
  const documentListeners = new Map();
  const metrics = {};

  class FakePerformanceObserver {
    constructor(callback) { this.callback = callback; this.type = null; }
    observe(options) {
      this.type = options.type;
      observers.set(this.type, this);
    }
    takeRecords() { return []; }
    disconnect() { observers.delete(this.type); }
  }

  const document = {
    hidden: false,
    addEventListener(type, callback) {
      const rows = documentListeners.get(type) || [];
      rows.push(callback);
      documentListeners.set(type, rows);
    }
  };
  const window = {
    document,
    performance: { now: () => timestamp },
    PerformanceObserver: FakePerformanceObserver,
    __OMEGA_DIAG__: { metrics },
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  window.window = window;
  const context = vm.createContext({
    window, globalThis: window, document, performance: window.performance,
    PerformanceObserver: FakePerformanceObserver, console, Date, Math, Number,
    String, Object, Array, Map, Set
  });
  vm.runInContext(read('omega_boot_performance_monitor_v1.js'), context,
    {filename:'omega_boot_performance_monitor_v1.js'});

  return {
    window, frames, observers, metrics,
    setTime(value) { timestamp = value; },
    emit(type, entries) {
      const observer = observers.get(type);
      assert.ok(observer, type + ' observer should be installed');
      observer.callback({getEntries:() => entries});
    },
    nextFrame(value) {
      const first = frames.entries().next().value;
      assert.ok(first, 'a monitor animation frame should be queued');
      frames.delete(first[0]);
      timestamp = value;
      first[1](value);
    }
  };
}

function createSimulationHarness() {
  const state = {population:{}, economy:{}, relations:{}, simulation:{}};
  const events = [];
  const spans = [];
  const sandbox = {
    console, Date, JSON, Object, Number, String, Math, Map, Set, WeakMap,
    Error, TypeError, Promise,
    localStorage: {
      data:new Map(),
      setItem(key,value) { this.data.set(key,String(value)); },
      getItem(key) { return this.data.get(key) || null; }
    },
    CustomEvent:class CustomEvent {
      constructor(type,init={}) { this.type=type; this.detail=init.detail; }
    },
    dispatchEvent(event) { events.push(event); return true; },
    addEventListener() {},
    Game:{state,currentActiveCountry:'BANGLADESH'},
    gameState:{population:{BANGLADESH:{population_2015:170000000}},
      economy:{BANGLADESH:{gdp:200}}}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.Omega = {};
  sandbox.OmegaBootPerformanceMonitor = {
    recordSpan(id,start,end,metadata) {
      spans.push({id,start,end,metadata});
      return {durationMs:12.5,mainThreadBlockingMs:4,longTaskCount:1,
        maxLongTaskMs:57,longAnimationFrameCount:1,longAnimationFrameBlockingMs:3};
    },
    snapshot() {
      return {fps:58,frameIntervalMsP95:17.2,maxFrameGapMs:41,
        longTaskSupported:true,longTaskCount10s:1};
    }
  };
  vm.runInNewContext(read('omega_simulation_runtime.js'),sandbox,
    {filename:'omega_simulation_runtime.js'});
  return {sandbox,state,events,spans};
}

test('browser monitor reports long-task overlap, animation-frame blocking and frame intervals', () => {
  const h = createPerformanceMonitorHarness();
  h.emit('longtask',[{name:'self',startTime:100,duration:120,blockingDuration:90}]);
  h.emit('long-animation-frame',[{name:'self',startTime:100,duration:100,blockingDuration:40}]);

  const range = h.window.OmegaBootPerformanceMonitor.measureRange(150,200);
  assert.equal(range.mainThreadBlockingMs,50);
  assert.equal(range.longTaskCount,1);
  assert.equal(range.maxLongTaskMs,50);
  assert.equal(range.longAnimationFrameCount,1);
  assert.equal(range.longAnimationFrameDurationMs,50);
  assert.equal(range.longAnimationFrameBlockingMs,20);

  const recorded = h.window.OmegaBootPerformanceMonitor.recordSpan('test.domain',150,200,{turn:1});
  assert.equal(recorded.mainThreadBlockingMs,50);
  assert.equal(h.window.OmegaBootPerformanceMonitor.getSpanDiagnostics('test.')[0].lastDurationMs,50);

  let time = 16;
  for (let index=0; index<70; index++) {
    h.nextFrame(time);
    time += 16;
  }
  const snapshot = h.window.OmegaBootPerformanceMonitor.snapshot();
  assert.ok(snapshot.fps > 0);
  assert.ok(snapshot.frameIntervalMsP95 >= 16);
  assert.ok(snapshot.frameSampleCount > 32);
  assert.equal(h.metrics.fps,snapshot.fps);
});

test('canonical simulation reports phase and participant execution and blocking separately', async () => {
  const h = createSimulationHarness();
  const sim = h.sandbox.Omega.Simulation;
  sim.configure({
    state:h.state,
    worldEngine:{setAuthoritativeState(){},processSimulationTick(){return {advanced:true};}},
    interoperability:{advanceTurn(){},saveState(){return {};},loadState(){return true;}},
    ministryPump(){return {status:'COMPLETED'};}
  });
  h.sandbox.Omega.GameSession.createSession({playerCountryId:'BANGLADESH'});
  sim.registerTurnParticipant('test.domain.telemetry',async()=>({status:'COMPLETED'}),{priority:20});

  const batch = await h.sandbox.Omega.GameSession.advance(8);
  assert.equal(batch.steps,8);
  assert.equal(batch.turn,8);
  const diagnostics = sim.diagnostics();
  const phases = diagnostics.lastTurnPhaseTimings;
  const participant = diagnostics.turnParticipants.find(row=>row.id==='test.domain.telemetry');

  for (const id of ['PREPARE','INPUT','VALIDATE','SIMULATE','COMMIT','PUBLISH','CHECKPOINT','FINALIZE','TOTAL']) {
    assert.ok(phases[id], 'phase ' + id + ' must be measured');
    assert.equal(phases[id].mainThreadBlockingMs,4);
  }
  assert.ok(h.spans.some(row=>row.id==='simulation.phase.SIMULATE'));
  assert.ok(h.spans.some(row=>row.id==='simulation.participant.test.domain.telemetry'));
  assert.equal(participant.lastMainThreadBlockingMs,4);
  assert.equal(participant.lastLongTaskCount,1);
  assert.equal(diagnostics.lastTurnPerformance.turn,8);
  assert.equal(diagnostics.lastTurnPerformance.browser.fps,58);
  assert.ok(Number.isFinite(diagnostics.lastTurnPerformance.totalDurationMs));
  assert.equal(participant.sampleCount,8);
  assert.equal(diagnostics.phaseTimings.find(row=>row.id==='SIMULATE').sampleCount,8);
  assert.equal(Array.from(diagnostics.recentTurnPerformance,row=>row.turn).join(','),'1,2,3,4,5,6,7,8');
  assert.ok(diagnostics.recentTurnPerformance.every(row=>row.phases.SIMULATE.mainThreadBlockingMs===4));
  assert.equal(h.state.simulation.turn,8);
  assert.equal(h.state.simulation.participantTimings,undefined,
    'performance samples must remain process-local and outside persisted world state');
});

test('daily workload report attaches per-domain main-thread blocking without changing checkpoints', async () => {
  let clock = 0;
  const state = {simulation:{turn:1,session:{playerCountryId:'BGD',sessionId:'SESSION-1'}}};
  const sandbox = {
    console,Promise,Map,Set,Object,Array,Number,String,Math,Date,JSON,
    performance:{now(){return clock;}},
    setTimeout(callback){queueMicrotask(callback);return 0;},
    Omega:{Simulation:{world:{state},clock:{turn:1}}},
    Game:{state},
    OmegaBootPerformanceMonitor:{
      recordSpan(id,start,end,metadata) {
        assert.equal(id,'daily-workload.resources');
        assert.equal(metadata.periodTurn,1);
        return {durationMs:3,mainThreadBlockingMs:2,longTaskCount:1,maxLongTaskMs:60};
      },
      snapshot(){return {};}
    }
  };
  vm.runInNewContext(read('omega_daily_workload_scheduler_v1.js'),sandbox,
    {filename:'omega_daily_workload_scheduler_v1.js'});
  const api = sandbox.Omega.DailyWorkloadScheduler;
  let completed = 0;
  api.registerDomain({
    id:'resources',label:'Resources',priority:10,
    getProgress(){return {lastProcessedTurn:completed};},
    runSlice(context){clock+=3;completed=context.periodTurn;return {status:'COMPLETED'};}
  });
  const report = await api.runPlan({countryId:'BGD',sessionId:'SESSION-1',targetTurn:1});
  assert.equal(report.status,'COMPLETED');
  assert.equal(report.results[0].mainThreadBlockingMs,2);
  assert.equal(report.results[0].longTaskCount,1);
  assert.equal(api.diagnostics().lastPlan.results[0].mainThreadBlockingMs,2);
  assert.equal(state.simulation.economyPhaseArchitectureV1,undefined,
    'daily scheduler telemetry must not create or rewrite authoritative economy checkpoints');
});
