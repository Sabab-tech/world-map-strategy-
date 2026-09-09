const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('omega_reasoning_dispatcher.js', 'utf8');
const calls = [];
const stageLog = Array.from({ length: 40 }, (_, i) => ({ stage: i + 1, name: `STAGE_${i + 1}`, timeMs: 0 }));
const mockOS = {
  stages: Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    name: `STAGE_${i + 1}`,
    execute(ctx) {
      if (i === 0) calls.push({ telemetry: ctx.telemetry, evidenceBoundary: ctx.evidenceBoundary });
      return ctx;
    }
  })),
  processCognitiveRequest(question, category, country, target, domain) {
    calls.push({ question, category, country, target, domain });
    const ctx = {
      prompt: question,
      intent: category,
      countryId: country,
      targetCountry: target,
      domain,
      telemetry: {},
      stageLog: []
    };
    for (const stage of this.stages) stage.execute(ctx, this);
    ctx.stageLog = stageLog;
    return { stageLog, summary: `TEST_${category}`, verifiedInput: 'RUNTIME_DETERMINISTIC_RESULT_ONLY' };
  }
};
const sandbox = { console, OmegaCognitiveEngine: { instance: mockOS } };
vm.runInNewContext(source, sandbox, { filename: 'omega_reasoning_dispatcher.js' });
const d = sandbox.OmegaReasoningDispatcher;
assert.ok(d, 'dispatcher must initialize');
assert.equal(d.VERSION, '1.3.0');
assert.equal(d.full40, true);

const parsed = { operation: 'CAUSE', language: 'bn', surface: 'বাংলাদেশ কেন LNG আমদানি করে?' };
const result = { ok: true, operation: 'CAUSE', facts: [{ key: 'production', value: 10 }], uncertainties: [] };
const out = d.dispatch(parsed.surface, parsed, result, { countryId: 'BGD', countryName: 'Bangladesh', language: 'bn', gameState: { resilienceScore: 73, chokepoints: [] } });

assert.equal(out.contract.status, 'EXECUTED');
assert.equal(out.contract.category, 'CAUSAL_ANALYSIS');
assert.equal(out.contract.stageCount, 40);
assert.equal(out.contract.full40StageExecution, true);
assert.equal(out.cognitive.stagesExecuted, 40);
assert.equal(out.cognitive.full40, true);
assert.equal(out.cognitive.result.summary, 'TEST_CAUSAL_ANALYSIS');
assert.equal(calls[0].evidenceBoundary, 'RUNTIME_DETERMINISTIC_RESULT_ONLY');
assert.equal(calls[1].telemetry.source, 'LIVE_GAME_STATE');
assert.equal(calls[1].telemetry.resilienceScore, 73);

const shallow = d.dispatch('Bangladesh has 5 gas fields', { operation: 'LOOKUP', language: 'en' }, { ok: true, text: 'five fields' }, {});
assert.equal(shallow.used, true);
assert.equal(shallow.contract.status, 'EXECUTED');
assert.equal(shallow.contract.stageCount, 40);
assert.equal(shallow.text, null);

const conversational = d.dispatch('Thank you', { operation: 'GRATITUDE', language: 'en' }, { ok: true, text: 'You are welcome.' }, {});
assert.equal(conversational.used, false);
assert.equal(conversational.contract.status, 'NOT_REQUIRED');
assert.equal(conversational.contract.answerBoundary, 'INTERACTION_RUNTIME');

console.log('Reasoning dispatcher full-40 bridge: PASS');
