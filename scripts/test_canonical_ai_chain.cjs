const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`DEEP CORE AUTHORITY TEST FAILED: ${message}`); };

const packageJson = JSON.parse(read('package.json'));
const server = read('server.js');
const deepCore = read('offline_query_engine.js');
const bootstrap = read('server_bootstrap.js');
const ministerRouter = read('minister_query_router.js');


assert(packageJson.dependencies?.express, 'express must be a declared runtime dependency');
assert(ministerRouter.includes('function localExecute('), 'minister router local execution helper must exist');
assert(ministerRouter.includes('async function server('), 'minister router server transport helper must exist');
assert(ministerRouter.includes('function renderResult('), 'minister router result renderer must exist');
assert(ministerRouter.includes('async function repositoryExecute('), 'minister router repository fallback helper must exist');
assert(ministerRouter.includes('async function ensureStack('), 'minister router stack loader must exist');

const routerLoad = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./minister_query_router.js'); if (!globalThis.MinisterQueryRouter?.enqueue || !globalThis.MinisterQueryRouter?.executeServerDeepCore) process.exit(1);"], { cwd: root, encoding: 'utf8' });
assert(routerLoad.status === 0, `minister_query_router.js runtime load failed: ${routerLoad.stderr || routerLoad.stdout}`);

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
assert(deepCore.includes("/api/deep-core/query"), 'browser execute path must use the existing server query endpoint');
assert(deepCore.includes("/api/deep-core/lookup"), 'browser lookup path must use the existing server lookup endpoint');
assert(deepCore.includes("/api/deep-core/resolve"), 'browser resolve path must use the existing server resolve endpoint');
assert(deepCore.includes("/api/deep-core/search"), 'browser search path must use the existing server search endpoint');
assert(deepCore.includes("/api/deep-core/plan"), 'browser plan path must use the existing server plan endpoint');
assert(deepCore.includes("/api/deep-core/diagnostics"), 'browser diagnostics path must use the existing server diagnostics endpoint');
assert(deepCore.includes("/api/deep-core/refresh"), 'browser refresh path must use the existing server refresh endpoint');
assert(deepCore.includes('SERVER_API_REQUIRED'), 'browser synchronous retrieval must not fake local results');
assert(deepCore.includes('async lookupIdAsync'), 'browser asynchronous lookup path must exist');
assert(deepCore.includes('async searchAsync'), 'browser asynchronous search path must exist');
assert(deepCore.includes('async executeAsync'), 'browser asynchronous execute path must exist');
assert(deepCore.includes('async buildExecutionPlanAsync'), 'browser asynchronous plan path must exist');

assert(server.includes("app.get('/api/deep-core/query'"), 'server query endpoint must exist');
assert(server.includes("app.post('/api/deep-core/query'"), 'server POST query endpoint must exist');
assert(server.includes("app.get('/api/deep-core/lookup'"), 'server lookup endpoint must exist');
assert(server.includes("app.get('/api/deep-core/resolve'"), 'server resolve endpoint must exist');
assert(server.includes("app.get('/api/deep-core/search'"), 'server search endpoint must exist');
assert(server.includes("app.post('/api/deep-core/plan'"), 'server plan endpoint must exist');
assert(server.includes("app.get('/api/deep-core/diagnostics'"), 'server diagnostics endpoint must exist');
assert(server.includes("app.post('/api/deep-core/refresh'"), 'server refresh endpoint must exist');
assert(server.includes('function deepCoreContext('), 'server must preserve the existing Deep Core request-context gateway');
assert(server.includes('function executeDeepCorePrompt('), 'server must preserve the existing Deep Core execution gateway');

assert(bootstrap.includes("await import('./server.js')"), 'production bootstrap must start server.js');
assert(bootstrap.includes('omega_server_ai_gateway.js'), 'production bootstrap must preserve the existing server AI gateway');

console.log('DEEP CORE AUTHORITY STRUCTURAL TEST PASSED');
console.log('Server contract: runtimeDataContext, no empty dataset array');
console.log('Repository authority: Node local filesystem -> Deep Core internal index');
console.log('Browser authority: server API -> Node Deep Core');
console.log('Browser GitHub scanning: disabled');
console.log('Deep Core index structures: preserved');