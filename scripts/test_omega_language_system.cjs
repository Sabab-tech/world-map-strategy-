const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const legacy = [
  'offline_language_vocabulary.json','offline_lexicon.json','offline_semantic_knowledge.json',
  'omega_game_language_ontology.json','omega_game_language_source_inventory.json',
  'offline_semantic_brain.js','offline_query_engine.js','omega_game_language_bridge.js','omega_reasoning_dispatcher.js'
];
const bundlePath = path.join(root, 'omega_language_system.js');
assert.ok(fs.existsSync(bundlePath), 'canonical standalone bundle is missing');
const js = fs.readFileSync(bundlePath, 'utf8');
assert.match(js, /OMEGA LANGUAGE SYSTEM v2\.0\.0-STANDALONE/);
assert.match(js, /STATUS:'STANDALONE_READY'/);
assert.match(js, /EMBEDDED_SOURCE_DATA/);
for (const file of legacy) assert.equal(fs.existsSync(path.join(root, file)), false, `legacy dependency still present: ${file}`);
const forbidden = [
  /\bfetch\s*\(/,
  /document\.createElement\(['"]script['"]\)/,
  /\bloadScript\s*\(/,
  /\bfetchJSON\s*\(/,
  /['"]\.\/((?:offline_language_vocabulary|offline_lexicon|offline_semantic_knowledge|omega_game_language_ontology|omega_game_language_source_inventory|offline_semantic_brain|offline_query_engine|omega_game_language_bridge|omega_reasoning_dispatcher)\.(?:json|js))['"]/
];
for (const re of forbidden) assert.equal(re.test(js), false, `standalone dependency violation: ${re}`);
const requiredSymbols = ['OmegaLanguageSystem','configure','parse','executeIntent','realize','run','eventRequest','learnPhrase','sourceData','diagnostics','validate'];
for (const symbol of requiredSymbols) assert.ok(js.includes(symbol), `missing standalone API: ${symbol}`);
assert.ok(js.includes('pronunciation') && js.includes('phonetic') && js.includes('ipa'), 'pronunciation support missing');
for (const event of ['EVENT_REQUESTED','EVENT_CONFIRMED','EVENT_REJECTED','EVENT_EXECUTED','EVENT_FAILED','EVENT_PENDING']) assert.ok(js.includes(event), `event state missing: ${event}`);
for (const action of ['IMPORT','EXPORT','APPOINT','REMOVE','NEGOTIATE','ALLOCATE','START','HALT']) assert.ok(js.includes(action), `operation missing: ${action}`);

const sourceManifestMatch = js.match(/embeddedSourceFiles:Object\.keys\(SOURCE_MANIFEST\)/);
assert.ok(sourceManifestMatch, 'embedded source manifest contract missing');

console.log('OMEGA_STANDALONE_POST_MIGRATION_CONTRACT_OK');
console.log(JSON.stringify({ legacyFilesAbsent: legacy.length, bundleBytes: Buffer.byteLength(js,'utf8') }, null, 2));
