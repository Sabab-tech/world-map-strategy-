const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('omega_reasoning_dispatcher.js', 'utf8');
const calls = [];
const sandbox = {
  console,
  OmegaCognitiveEngine: {
    process(question, category, country, target) {
      calls.push({ question, category, country, target });
      return { summary: `TEST_${category}`, verifiedInput: target.evidenceBoundary };
    }
  }
};
vm.runInNewContext(source, sandbox, { filename: 'omega_reasoning_dispatcher.js' });
const d = sandbox.OmegaReasoningDispatcher;
assert.ok(d, 'dispatcher must initialize');

const parsed = { operation: 'CAUSE', language: 'bn', surface: 'বাংলাদেশ কেন LNG আমদানি করে?' };
const result = { ok: true, operation: 'CAUSE', facts: [{ key: 'production', value: 10 }], uncertainties: [] };
const out = d.dispatch(parsed.surface, parsed, result, { countryId: 'BGD', language: 'bn' });

assert.equal(out.contract.status, 'EXECUTED');
assert.equal(out.contract.category, 'CAUSAL_ANALYSIS');
assert.equal(out.cognitive.result.summary, 'TEST_CAUSAL_ANALYSIS');
assert.equal(out.cognitive.result.verifiedInput, 'RUNTIME_DETERMINISTIC_RESULT_ONLY');
assert.equal(calls.length, 1);

const shallow = d.dispatch('Bangladesh has 5 gas fields', { operation: 'LOOKUP', language: 'en' }, { ok: true, text: 'five fields' }, {});
assert.equal(shallow.used, false);
assert.equal(shallow.contract.status, 'NOT_REQUIRED');

console.log('Reasoning dispatcher bridge: PASS');
