import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const identityRuntime = await readFile(
  new URL('../omega_resource_part04_identity_runtime.js', import.meta.url),
  'utf8'
);

test('Resource identity runtime avoids object-spread helper source that breaks Android 9 WebView', () => {
  assert.equal(
    identityRuntime.includes('...'),
    false,
    'ES2017 transpilation of object spread previously generated an invalid property-descriptor helper on API 28'
  );
});
