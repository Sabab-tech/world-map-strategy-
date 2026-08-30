import fs from 'node:fs';
import assert from 'node:assert/strict';

const mod = await import('../offline_semantic_brain.js');
const brain = mod.default || globalThis.OfflineSemanticBrain;
const resources = [];
for (const file of ['resources.json','resources_2.json']) if (fs.existsSync(file)) resources.push(JSON.parse(fs.readFileSync(file,'utf8')));
const vocabulary = JSON.parse(fs.readFileSync('offline_language_vocabulary.json','utf8'));
const runtime = brain.configure({datasets:resources,vocabulary});
assert.ok(runtime.countries >= 190, `Runtime country registry too small: ${runtime.countries}`);
assert.ok(runtime.resources > 0, 'Runtime resource registry is empty');
const examples = ['How many mines are in Bangladesh?','How many mines are in India?','Where are the mines in China?','বাংলাদেশে কয়টি খনি আছে?','ভারতে কয়টি খনি আছে?','চীনে খনিগুলো কোথায় আছে?'];
for (const q of examples) {
  const p = brain.parse(q);
  assert.equal(p.executable, true, `${q} did not become executable: ${JSON.stringify(brain.explain(p))}`);
  assert.ok(p.entities.country.id, `${q} has no runtime country id`);
  assert.ok(p.entities.asset.id, `${q} has no runtime asset class`);
}
const unknown = brain.parse('How many mines are in Atlantis?');
assert.notEqual(unknown.entities.country.id, 'BGD');
assert.equal(unknown.executable, false);
console.log(JSON.stringify({ok:true,runtime,tests:examples.length,unknownRejected:true},null,2));
