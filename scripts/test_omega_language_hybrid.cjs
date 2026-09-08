const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('omega_language_system.js', 'utf8');
assert.doesNotThrow(() => new vm.Script(source, { filename: 'omega_language_system.js' }));

const sandbox = { console, Date, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'omega_language_system.js' });

const system = sandbox.OmegaLanguageSystem;
const bridge = sandbox.OmegaGameLanguageBridge;
assert.ok(system, 'canonical language system must be exported');
assert.ok(bridge, 'embedded bridge must be exported');

const ontology = system.gameLanguageOntology();
assert.equal(ontology.ontology_id, 'OMEGA_GAME_LANGUAGE');
assert.equal(ontology.schema_version, '1.0.0');
assert.equal(ontology.canonical_concept_target, 4500);
assert.equal(ontology.seed_concepts.length, 3);
assert.equal(ontology.domains.length, 17);
assert.equal(ontology.domains.reduce((n, d) => n + d.target, 0), 5200);
assert.deepEqual(ontology.grammar.features, ['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']);

assert.equal(bridge.VERSION, '1.0.1');
assert.equal(typeof bridge.match, 'function');
assert.equal(typeof bridge.enrich, 'function');
assert.equal(typeof bridge.install, 'function');

const diagnostics = system.diagnostics();
assert.equal(diagnostics.version, '1.2.0');
assert.ok(diagnostics.embeddedSourceFiles.includes('<embedded:omega_game_language_ontology.json>'));
assert.ok(diagnostics.embeddedSourceFiles.includes('<embedded:omega_game_language_bridge.js>'));
assert.ok(!diagnostics.sourceFiles.includes('omega_game_language_ontology.json'));
assert.ok(!diagnostics.sourceFiles.includes('omega_game_language_bridge.js'));
assert.equal(diagnostics.embeddedSourceCount, 2);

const bn = system.parse('বাংলাদেশের উৎপাদন বাড়াও');
assert.equal(bn.language, 'bn');
assert.equal(bn.operation, 'IDENTIFY');
assert.equal(bn.contract.unknownFact, 'UNKNOWN_WHEN_NOT_EVIDENCED');

const en = system.parse('increase production');
assert.equal(en.language, 'en');
assert.equal(en.operation, 'IDENTIFY');

const event = system.eventRequest('increase', { target: 'PRODUCTION', quantity: 10 });
assert.equal(event.type, 'GAME_EVENT_REQUEST');
assert.equal(event.state, 'EVENT_REQUESTED');
assert.equal(event.operation, 'INCREASE');
assert.equal(event.capabilityRequired, true);
assert.equal(event.executionOwner, 'GAME_CAPABILITY_AND_EVENT_ENGINE');

assert.equal(system.learnPhrase('increase output', 'increase', 'PRODUCTION', 0.99), true);
assert.equal(system.learnPhrase('weak confidence', 'increase', 'PRODUCTION', 0.5), false);

console.log('OMEGA hybrid runtime regression: PASS');
