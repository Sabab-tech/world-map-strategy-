import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../omega_shared_number_format_v1.js', import.meta.url), 'utf8');

test('shared number formatter keeps small values readable and compacts large values', () => {
  const context = { Intl, Number, Math, Object, String, JSON };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'omega_shared_number_format_v1.js' });
  const format = context.OmegaNumberFormat;
  assert.equal(format.VERSION, '1.0.0');
  assert.equal(format.compact(1250), '1,250');
  assert.equal(format.compact(1234567), '1.23 million');
  assert.equal(format.compact(1234567890), '1.23 billion');
  assert.equal(format.compact(-2345678900000), '-2.35 trillion');
  assert.equal(format.compact('not recorded'), 'Unavailable');
});

test('money labels use thousand/million/billion units without changing numeric inputs', () => {
  const context = { Intl, Number, Math, Object, String, JSON };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'omega_shared_number_format_v1.js' });
  const format = context.OmegaNumberFormat;
  const value = 1234567;
  assert.equal(format.money(value), '$1.23 million');
  assert.equal(format.money(1200), '$1.2 thousand');
  assert.equal(format.money(-2500000000), '-$2.5 billion');
  assert.equal(format.money(0), '$0');
  assert.equal(format.money(null, { unavailable: 'N/A' }), 'N/A');
  assert.equal(value, 1234567, 'display formatting must not mutate simulation values');
});
