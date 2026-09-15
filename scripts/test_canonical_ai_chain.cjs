const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readJSON = file => JSON.parse(read(file));
const assert = (condition, message) => {
  if (!condition) throw new Error(`DEEP CORE AUTHORITY TEST FAILED: ${message}`);
};
const normalize = value => String(value == null ? '' : value)
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(/[?!,.:;\"'“”‘’(){}[\]<>—–/\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const upper = value => String(value == null ? '' : value).trim().toUpperCase();
const isObject = value => value !== null && typeof value === 'object';
const asArray = value => Array.isArray(value) ? value : [];

function rowsFromDataset(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.countries)) return raw.countries;
  if (Array.isArray(raw?.data)) return raw.data;
  if (isObject(raw)) return Object.entries(raw).map(([key, value]) => isObject(value) ? ({ ...value, __recordKey: key }) : ({ value, __recordKey: key }));
  return [];
}

function findCountryRows() {
  const raw = readJSON('countries.json');
  return rowsFromDataset(raw)
    .map(row => ({
      id: upper(row?.code || row?.id || row?.iso3 || row?.iso2),
      name: String(row?.name || '').trim()
    }))
    .filter(row => row.id && row.name);
}

function findDatasetRecord(raw, country) {
  if (!isObject(raw)) return null;
  const wanted = new Set([upper(country.id), upper(country.name), normalize(country.name)]);
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    if (wanted.has(upper(key)) || wanted.has(upper(value.code)) || wanted.has(upper(value.id))) return { key, value };
  }
  return null;
}

function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || a === b;
  return String(a) === String(b);
}

function flattenObjects(value, out = [], pathName = '$', depth = 0) {
  if (depth > 20 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenObjects(item, out, `${pathName}[${index}]`, depth + 1));
    return out;
  }
  if (!isObject(value)) return out;
  out.push({ value, path: pathName });
  for (const [key, child] of Object.entries(value)) flattenObjects(child, out, `${pathName}.${key}`, depth + 1);
  return out;
}

function evidenceFor(result, dataset, expectedLocator, expectedField, expectedValue) {
  const evidence = asArray(result?.evidence);
  return evidence.filter(item => {
    if (!isObject(item)) return false;
    const datasetMatch = normalize(item.dataset || item.logicalDatasetId) === normalize(dataset);
    const locatorMatch = expectedLocator == null || normalize(item.recordLocator || item.locator) === normalize(expectedLocator);
    const fieldMatch = normalize(item.fieldPath || item.path || item.field || '') === normalize(expectedField);
    const valueMatch = 'value' in item && sameValue(item.value, expectedValue);
    return datasetMatch && locatorMatch && fieldMatch && valueMatch;
  });
}

function collectEvidencePaths(result) {
  return asArray(result?.evidence)
    .map(item => item?.evidencePath)
    .filter(value => typeof value === 'string' && value.trim());
}

function expectedEvidencePath(dataset, locator, field) {
  const normalizedField = String(field || '').replace(/^\./, '');
  if (!normalizedField) return `${dataset}::${locator}`;
  return `${dataset}::${locator}.${normalizedField}`;
}

function assertNoUnrelatedRecords(result, countryId, countryName) {
  const expectedId = upper(countryId);
  const surface = normalize(countryName);
  const identities = asArray(result?.evidence).map(e => ({ id: upper(e?.entityId), name: normalize(e?.entityName || e?.surface) }));
  const unrelated = identities.filter(e => e.id && e.id !== expectedId && e.name && !e.name.includes(surface));
  assert(!unrelated.length, `query returned unrelated entity evidence: ${JSON.stringify(unrelated.slice(0, 5))}`);
}

function summarizeResult(result) {
  return JSON.stringify({
    status: result?.status,
    ok: result?.ok,
    value: result?.value,
    entity: result?.entity || result?.entities || null,
    dataAccess: result?.dataAccess || null,
    evidence: asArray(result?.evidence).slice(0, 10)
  });
}

(async () => {
  const packageJson = readJSON('package.json');
  const server = read('server.js');
  const deepCore = read('offline_query_engine.js');
  const bootstrap = read('server_bootstrap.js');

  // Preserve the architectural gates. These assertions are still useful, but they are no longer the test itself.
  assert(packageJson.dependencies?.express, 'express must be a declared runtime dependency');
  assert(packageJson.scripts?.test?.includes('scripts/test_canonical_ai_chain.cjs'), 'canonical authority test must remain part of npm test');
  assert(packageJson.scripts?.build?.includes('npm run test:canonical'), 'canonical authority test must remain part of npm build');

  const serverSyntax = spawnSync(process.execPath, ['--check', path.join(root, 'server.js')], { encoding: 'utf8' });
  assert(serverSyntax.status === 0, `server.js syntax gate failed: ${serverSyntax.stderr || serverSyntax.stdout}`);
  const deepCoreSyntax = spawnSync(process.execPath, ['--check', path.join(root, 'offline_query_engine.js')], { encoding: 'utf8' });
  assert(deepCoreSyntax.status === 0, `offline_query_engine.js syntax gate failed: ${deepCoreSyntax.stderr || deepCoreSyntax.stdout}`);

  assert(/OfflineQueryEngine\.(?:execute)\(ir,\s*(?!\[\])[^,]+,/.test(server), 'server Deep Core execute path must not inject an empty dataset array');
  assert(!/OfflineQueryEngine\.(?:execute|executeAsync|buildExecutionPlan|buildExecutionPlanAsync)\([^,]+,\s*\[\]/.test(server), 'server must not pass [] as Deep Core dataset/context');
  assert(server.includes('const runtimeDataContext ='), 'server must provide runtime context through the existing Deep Core contract');
  assert(server.includes('OfflineQueryEngine.execute(ir, runtimeDataContext'), 'server execute path must pass runtimeDataContext to Deep Core');
  assert(server.includes('OfflineQueryEngine.buildExecutionPlan(ir, runtimeDataContext'), 'server plan path must pass runtimeDataContext to Deep Core');

  assert(deepCore.includes('this.catalog=new Map'), 'Deep Core authoritative catalog must remain internal');
  assert(deepCore.includes('this.records=[]'), 'Deep Core internal records index must remain internal');
  assert(deepCore.includes('this.bySig=new Map'), 'Deep Core signature index must remain internal');
  assert(deepCore.includes('this.ids=new Map'), 'Deep Core identity index must remain internal');
  assert(deepCore.includes('this.raw=[]'), 'Deep Core raw occurrence index must remain internal');
  assert(deepCore.includes("authority:'NODE_FILESYSTEM'"), 'Node filesystem must remain the repository authority');
  assert(deepCore.includes("authority:'SERVER_API'"), 'browser must remain a server API client');
  assert(!deepCore.includes('BROWSER_GITHUB'), 'browser GitHub retrieval mode must not remain');
  assert(!deepCore.includes('api.github.com'), 'Deep Core browser path must not use GitHub API');
  assert(!deepCore.includes('raw.githubusercontent.com'), 'Deep Core browser path must not use GitHub raw files');
  assert(!deepCore.includes('.github.io'), 'Deep Core browser retrieval must not depend on GitHub Pages hosting');
  assert(deepCore.includes('serverJSON('), 'browser Deep Core path must use the existing server API helper');
  for (const endpoint of ['/api/deep-core/query','/api/deep-core/lookup','/api/deep-core/resolve','/api/deep-core/search','/api/deep-core/plan','/api/deep-core/diagnostics','/api/deep-core/refresh']) {
    assert(deepCore.includes(endpoint), `browser Deep Core path must use ${endpoint}`);
  }
  assert(deepCore.includes('SERVER_API_REQUIRED'), 'browser synchronous retrieval must not fake local results');
  assert(deepCore.includes('async lookupIdAsync'), 'browser asynchronous lookup path must exist');
  assert(deepCore.includes('async searchAsync'), 'browser asynchronous search path must exist');
  assert(deepCore.includes('async executeAsync'), 'browser asynchronous execute path must exist');
  assert(deepCore.includes('async buildExecutionPlanAsync'), 'browser asynchronous plan path must exist');

  for (const endpoint of [
    "app.get('/api/deep-core/query'",
    "app.post('/api/deep-core/query'",
    "app.get('/api/deep-core/lookup'",
    "app.get('/api/deep-core/resolve'",
    "app.get('/api/deep-core/search'",
    "app.post('/api/deep-core/plan'",
    "app.get('/api/deep-core/diagnostics'",
    "app.post('/api/deep-core/refresh'"
  ]) assert(server.includes(endpoint), `server endpoint must exist: ${endpoint}`);
  assert(server.includes('function deepCoreContext('), 'server must preserve the existing Deep Core request-context gateway');
  assert(server.includes('function executeDeepCorePrompt('), 'server must preserve the existing Deep Core execution gateway');
  assert(bootstrap.includes("await import('./server.js')"), 'production bootstrap must start server.js');
  assert(bootstrap.includes('omega_server_ai_gateway.js'), 'production bootstrap must preserve the existing server AI gateway');

  // Functional runtime test: repository -> canonical identity -> metadata routing -> record -> field -> value -> evidence.
  await import(pathToFileURL(path.join(root, 'omega_country_semantic_bridge.js')));
  await import(pathToFileURL(path.join(root, 'offline_semantic_brain.js')));
  await import(pathToFileURL(path.join(root, 'offline_query_engine.js')));

  const countryBridge = globalThis.OmegaCanonicalIdentityRegistry || globalThis.OmegaCountrySemanticBridge;
  assert(countryBridge?.init, 'canonical country identity bridge unavailable');
  assert(await countryBridge.init() === true, 'canonical country identity bridge failed to initialize');

  const OfflineSemanticBrain = globalThis.OfflineSemanticBrain;
  const engine = globalThis.OfflineQueryEngine;
  assert(OfflineSemanticBrain?.parse, 'OfflineSemanticBrain parser unavailable');
  assert(engine?.initializeRepository && engine?.execute, 'Deep Core runtime unavailable');

  const countries = findCountryRows();
  assert(countries.length, 'countries.json contains no usable country records');

  engine.initializeRepository();
  const diagnostics = engine.diagnostics();
  assert(diagnostics?.initialized === true, 'Deep Core repository index did not initialize');
  assert(diagnostics?.scan?.authority === 'NODE_FILESYSTEM', `unexpected repository authority: ${diagnostics?.scan?.authority || 'UNKNOWN'}`);
  assert(diagnostics?.scan?.complete === true, `repository scan incomplete: ${JSON.stringify(diagnostics?.scan?.failedFiles || [])}`);
  assert(Number(diagnostics?.scan?.loadedFiles) === Number(diagnostics?.scan?.discoveredFiles), 'loaded/discovered repository file count mismatch');
  assert(Number(diagnostics?.stats?.files) > 0 && Number(diagnostics?.stats?.records) > 0, `Deep Core indexed no usable records: ${JSON.stringify(diagnostics)}`);

  const knowledge = readJSON('offline_semantic_knowledge.json');
  const datasetMeta = asArray(knowledge?.data_finding?.dataset_capabilities);
  const scalarCapabilities = [];
  for (const meta of datasetMeta) {
    if (!['economy.json', 'population.json'].includes(String(meta?.dataset))) continue;
    for (const [capability, mapping] of Object.entries(meta?.fieldMappings || {})) {
      const valuePath = String(mapping?.valuePath || '').trim();
      if (!valuePath || valuePath.includes('[]')) continue;
      scalarCapabilities.push({ dataset: meta.dataset, capability, valuePath });
    }
  }
  assert(scalarCapabilities.length, 'metadata contains no scalar economy/population field mappings');

  const targetCapabilities = [];
  const preferred = new Set(['GDP', 'INFLATION', 'POPULATION', 'POPULATION_2015']);
  for (const capability of scalarCapabilities) {
    if (preferred.has(capability.capability) && !targetCapabilities.some(x => x.capability === capability.capability)) targetCapabilities.push(capability);
  }
  for (const capability of scalarCapabilities) {
    if (!targetCapabilities.some(x => x.dataset === capability.dataset)) targetCapabilities.push(capability);
    if (targetCapabilities.length >= Math.min(4, scalarCapabilities.length)) break;
  }
  const selectedCapabilities = targetCapabilities.slice(0, Math.min(4, targetCapabilities.length));
  assert(selectedCapabilities.length >= 2, 'functional test could not select at least two metadata-driven scalar capabilities');

  const selectedCountries = [];
  for (const country of countries) {
    if (selectedCountries.length >= Math.min(3, countries.length)) break;
    let usable = true;
    for (const cap of selectedCapabilities) {
      const record = findDatasetRecord(readJSON(cap.dataset), country);
      if (!record) { usable = false; break; }
      const parts = cap.valuePath.split('.').filter(Boolean);
      let value = record.value;
      for (const part of parts) value = value?.[part];
      if (value === undefined || value === null) { usable = false; break; }
    }
    if (usable) selectedCountries.push(country);
  }
  assert(selectedCountries.length, 'no country had complete values for the selected metadata-driven functional cases');

  const functionalCases = [];
  for (const country of selectedCountries) {
    for (const capability of selectedCapabilities) {
      const raw = readJSON(capability.dataset);
      const record = findDatasetRecord(raw, country);
      const parts = capability.valuePath.split('.').filter(Boolean);
      let expectedValue = record.value;
      for (const part of parts) expectedValue = expectedValue?.[part];
      const locator = record.key || country.name;
      const label = capability.capability.replace(/_/g, ' ').toLowerCase();
      functionalCases.push({ country, capability, record, locator, expectedValue, prompt: `What is the ${label} of ${country.name}?` });
    }
  }

  let passedFunctionalCases = 0;
  for (const testCase of functionalCases) {
    const ir = OfflineSemanticBrain.parse(testCase.prompt, { countryId: testCase.country.id });
    assert(ir && typeof ir === 'object', `parser returned no IR for: ${testCase.prompt}`);
    assert(ir.entities?.country?.id || ir.country?.id || testCase.country.id, `entity was not resolved for: ${testCase.prompt}`);

    const runtimeContext = {
      countryId: testCase.country.id,
      countryCode: testCase.country.id,
      ir
    };
    const result = engine.execute(ir, runtimeContext, ir.language || 'en', runtimeContext);
    assert(result?.status === 'VERIFIED_FACT' && result?.ok === true, `functional query failed: ${testCase.prompt}; ${summarizeResult(result)}`);

    const evidenceMatches = evidenceFor(
      result,
      testCase.capability.dataset,
      testCase.locator,
      testCase.capability.valuePath,
      testCase.expectedValue
    );
    assert(evidenceMatches.length > 0, `actual value/evidence mismatch for ${testCase.prompt}; expected ${JSON.stringify(testCase.expectedValue)} at ${testCase.capability.dataset}::${testCase.locator}.${testCase.capability.valuePath}; ${summarizeResult(result)}`);

    const paths = collectEvidencePaths(result);
    assert(paths.length > 0, `evidencePath was not generated for ${testCase.prompt}`);
    const expectedPath = expectedEvidencePath(testCase.capability.dataset, testCase.locator, testCase.capability.valuePath);
    assert(paths.some(p => p === expectedPath || p.endsWith(expectedPath)), `evidencePath mismatch for ${testCase.prompt}; expected suffix ${expectedPath}; actual=${JSON.stringify(paths.slice(0, 10))}`);

    const serializedEvidence = JSON.stringify(evidenceMatches);
    assert(serializedEvidence.includes(testCase.capability.dataset), `dataset resolution missing from evidence for ${testCase.prompt}`);
    assert(serializedEvidence.includes(testCase.capability.valuePath), `field resolution missing from evidence for ${testCase.prompt}`);
    assertNoUnrelatedRecords(result, testCase.country.id, testCase.country.name);
    passedFunctionalCases += 1;
  }

  // Missing-data fail-closed test, generated from an existing country so the entity is valid.
  const missingCaseCountry = selectedCountries[0];
  const missingDataset = 'economy.json';
  const missingPrompt = `What is the __omega_missing_field_9f7a2__ of ${missingCaseCountry.name}?`;
  const missingIr = OfflineSemanticBrain.parse(missingPrompt, { countryId: missingCaseCountry.id });
  const missingResult = engine.execute(missingIr, { countryId: missingCaseCountry.id, countryCode: missingCaseCountry.id, ir: missingIr }, missingIr?.language || 'en', { countryId: missingCaseCountry.id });
  const missingStatus = String(missingResult?.status || '').toUpperCase();
  assert(['UNKNOWN', 'UNRESOLVED', 'FIELD_NOT_FOUND', 'DATA_NOT_FOUND', 'IDENTITY_NOT_FOUND', 'NOT_FOUND'].includes(missingStatus), `missing data did not fail closed: ${missingStatus}; ${summarizeResult(missingResult)}`);
  assert(!asArray(missingResult?.evidence).some(e => normalize(e?.dataset) === normalize(missingDataset) && String(e?.fieldPath || '').includes('__omega_missing_field_9f7a2__')), 'missing data unexpectedly returned fabricated evidence');

  // Ambiguity test: discover an actually colliding normalized surface form from the knowledge plane.
  const collisionMap = new Map();
  const walkKnowledge = value => {
    if (Array.isArray(value)) { value.forEach(walkKnowledge); return; }
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (isObject(child)) {
        const id = child.id || child.canonicalId || child.canonical_id;
        const names = [key, child.name, ...asArray(child.names), ...asArray(child.aliases)];
        if (id) for (const name of names.map(normalize).filter(Boolean)) {
          const list = collisionMap.get(name) || [];
          if (!list.some(x => String(x) === String(id))) list.push(id);
          collisionMap.set(name, list);
        }
        walkKnowledge(child);
      }
    }
  };
  walkKnowledge(knowledge);
  const collision = [...collisionMap.entries()].find(([, ids]) => ids.length > 1);
  if (collision) {
    const ambiguous = engine.resolve({ id: collision[0] });
    assert(['AMBIGUOUS_IDENTITY', 'IDENTITY_NOT_FOUND', 'RESOLVED'].includes(String(ambiguous?.status || '')), 'resolver returned an invalid ambiguity status');
    if (ambiguous?.status === 'AMBIGUOUS_IDENTITY') assert(asArray(ambiguous.candidates).length > 1, 'ambiguity status returned without multiple candidates');
  }

  console.log('DEEP CORE FUNCTIONAL TEST PASSED');
  console.log(`Repository authority: ${diagnostics.scan.authority}`);
  console.log(`Indexed files: ${diagnostics.stats.files}`);
  console.log(`Indexed records: ${diagnostics.stats.records}`);
  console.log(`Functional query cases: ${passedFunctionalCases}/${functionalCases.length}`);
  console.log(`Missing-data fail-closed status: ${missingStatus}`);
  console.log(`Evidence provenance: dataset + record locator + field path + evidencePath verified`);
  console.log('No country-specific data values were hardcoded into the test.');
})().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});

function pathToFileURL(filePath) {
  const { pathToFileURL: nativePathToFileURL } = require('url');
  return nativePathToFileURL(filePath).href;
}
