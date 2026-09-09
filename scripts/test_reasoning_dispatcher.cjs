const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('omega_reasoning_dispatcher.js', 'utf8');
const calls = [];
const mockOriginalStages = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `ORIGINAL_${i + 1}`,
  execute(ctx) {
    if (i === 0) calls.push({ telemetry: ctx.telemetry, evidenceBoundary: ctx.evidenceBoundary });
    return ctx;
  }
}));

const mockOS = {
  stages: mockOriginalStages,
  processCognitiveRequest(question, category, country, target, domain) {
    calls.push({ question, category, country, target, domain });
    const ctx = {
      prompt: question,
      intent: category,
      semanticOperation: 'CAUSE',
      countryId: country,
      targetCountry: target,
      domain,
      telemetry: {},
      liveEvidence: { facts: [{ key: 'production', value: 10, source: 'TEST_DATASET' }], unknowns: [] },
      selfModel: { activeBeliefs: new Map([['TEST_BELIEF', { confidence: 0.8 }]]) },
      candidateOptions: [],
      searchTreeResults: [],
      stageLog: []
    };
    for (const stage of this.stages) stage.execute(ctx, this);
    ctx.stageLog = Array.from({ length: 40 }, (_, i) => ({ stage: i + 1, name: this.stages[i].name, timeMs: 0 }));
    return ctx;
  }
};

const sandbox = { console, OmegaCognitiveEngine: { instance: mockOS } };
vm.runInNewContext(source, sandbox, { filename: 'omega_reasoning_dispatcher.js' });
const d = sandbox.OmegaReasoningDispatcher;
assert.ok(d, 'dispatcher must initialize');
assert.equal(d.VERSION, '2.1.1');
assert.equal(d.full40, true);

const parsed = { operation: 'CAUSE', language: 'bn', surface: 'বাংলাদেশ কেন LNG আমদানি করে?' };
const result = { ok: true, operation: 'CAUSE', facts: [{ key: 'production', value: 10, source: 'TEST_DATASET' }], uncertainties: [] };
const out = d.dispatch(parsed.surface, parsed, result, {
  countryId: 'BGD',
  countryName: 'Bangladesh',
  language: 'bn',
  gameState: {
    resilienceScore: 73,
    dailyExtraction: 20,
    dailyImports: 30,
    dailyIndustrialDemand: 25,
    dailyCivilianDemand: 15,
    processingUtilization: 0.82,
    processingCapacityBPD: 100,
    chokepoints: [{ name: 'Test Corridor', vulnerability: 0.7 }]
  }
});

assert.equal(out.contract.status, 'EXECUTED');
assert.equal(out.contract.category, 'CAUSAL_ANALYSIS');
assert.equal(out.contract.stageCount, 40);
assert.equal(out.contract.full40StageExecution, true);
assert.equal(out.cognitive.stagesExecuted, 40);
assert.equal(out.cognitive.full40, true);
assert.deepEqual(out.cognitive.executedStages, Array.from({ length: 40 }, (_, i) => i + 1));
assert.equal(calls[0].evidenceBoundary, 'RUNTIME_DETERMINISTIC_RESULT_ONLY');
assert.equal(calls[1].telemetry.source, 'LIVE_GAME_STATE');
assert.equal(calls[1].telemetry.resilienceScore, 73);
assert.equal(calls[1].telemetry.dailyImports, 30);

const artifacts = out.cognitive.result.cognitiveStageArtifacts;
assert.ok(artifacts, 'stage artifacts must be exposed to the AI handoff');
assert.equal(Object.keys(artifacts).length, 20);
assert.deepEqual(
  Object.keys(artifacts).map(Number).sort((a, b) => a - b),
  Array.from({ length: 20 }, (_, i) => i + 21)
);
const stageNames = Object.values(artifacts).map(a => a.name);
assert.equal(new Set(stageNames).size, 20, '21-40 must have distinct responsibilities');
assert.equal(stageNames[0], 'EVIDENCE_LEDGER');
assert.equal(artifacts[29].name, 'RESOURCE_BALANCE_ANALYSIS');
assert.equal(artifacts[40].name, 'FINAL_AI_HANDOFF');
assert.equal(out.cognitive.result.aiGroundingPacket.stageCount, 40);
assert.ok(Array.isArray(out.cognitive.result.aiGroundingPacket.stageIndex));
assert.equal(out.cognitive.result.aiGroundingPacket.stageIndex.length, 20);
assert.equal(out.cognitive.result.answerContract.doNotInventMissingValues, true);
assert.ok(Object.values(out.cognitive.result.stageContracts).every(x => Array.isArray(x.dependsOn)));

const shallow = d.dispatch('Bangladesh has 5 gas fields', { operation: 'LOOKUP', language: 'en' }, { ok: true, text: 'five fields' }, {});
assert.equal(shallow.used, true);
assert.equal(shallow.contract.status, 'EXECUTED');
assert.equal(shallow.contract.stageCount, 40);
assert.equal(shallow.text, null);

const conversational = d.dispatch('Thank you', { operation: 'GRATITUDE', language: 'en' }, { ok: true, text: 'You are welcome.' }, {});
assert.equal(conversational.used, false);
assert.equal(conversational.contract.status, 'NOT_REQUIRED');
assert.equal(conversational.contract.answerBoundary, 'INTERACTION_RUNTIME');

console.log('Reasoning dispatcher full-40 specialized bridge: PASS');
