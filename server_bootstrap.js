/** OMEGA SERVER BOOTSTRAP v2.4.0
 * Canonical server bootstrap. Establishes one deterministic browser AI boot chain.
 * Legacy semantic runtime v3.2 is compatibility-only and is never injected.
 */
import fs from 'fs';

const nativeFetch = globalThis.fetch;
const MODEL_FALLBACK = 'gemini-3.7-flash';

if (typeof globalThis.addEventListener !== 'function' || typeof globalThis.dispatchEvent !== 'function') {
  const omegaEventTarget = new EventTarget();
  globalThis.addEventListener = omegaEventTarget.addEventListener.bind(omegaEventTarget);
  globalThis.removeEventListener = omegaEventTarget.removeEventListener.bind(omegaEventTarget);
  globalThis.dispatchEvent = omegaEventTarget.dispatchEvent.bind(omegaEventTarget);
}

if (typeof nativeFetch === 'function' && !globalThis.__omegaGeminiFetchCompat) {
  globalThis.__omegaGeminiFetchCompat = true;
  globalThis.fetch = async function omegaGeminiFetch(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;

      if (raw && !/^[a-z][a-z\d+.-]*:/i.test(raw) && !raw.startsWith('//')) {
        const localUrl = new URL(raw, import.meta.url);
        if (localUrl.protocol === 'file:') {
          const localPath = localUrl.pathname;
          if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
            const body = await fs.promises.readFile(localPath);
            return new Response(body, {
              status: 200,
              headers: { 'content-type': localPath.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream' }
            });
          }
        }
      }

      if (raw && raw.includes('generativelanguage.googleapis.com') && raw.includes(':generateContent')) {
        const url = new URL(raw);
        const match = url.pathname.match(/\/models\/([^/:]+):generateContent$/);
        if (match && match[1] !== MODEL_FALLBACK) {
          url.pathname = url.pathname.replace(`/models/${match[1]}:generateContent`, `/models/${MODEL_FALLBACK}:generateContent`);
          input = typeof input === 'string' ? url.toString() : new Request(url, input);
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };
}

await import('./omega_country_semantic_bridge.js');
const canonicalCountryBridge = globalThis.OmegaCanonicalIdentityRegistry || globalThis.OmegaCountrySemanticBridge;
if (!canonicalCountryBridge?.init) {
  throw new Error('[OMEGA BOOT] Canonical country identity bridge unavailable');
}
const canonicalCountryReady = await canonicalCountryBridge.init();
if (canonicalCountryReady !== true || canonicalCountryBridge.diagnostics?.().ready !== true) {
  throw new Error('[OMEGA BOOT] Canonical country identity bridge failed to initialize');
}

try {
  const originalExportData = typeof canonicalCountryBridge.exportData === 'function'
    ? canonicalCountryBridge.exportData.bind(canonicalCountryBridge)
    : null;
  let exported = null;
  try { exported = originalExportData ? originalExportData() : null; } catch (_) {}
  if (!Array.isArray(exported?.countries)) {
    const raw = JSON.parse(await fs.promises.readFile(new URL('./countries.json', import.meta.url), 'utf8'));
    const rows = Array.isArray(raw) ? raw : (raw?.countries || raw?.data || Object.values(raw || {}));
    const adapted = new Proxy(canonicalCountryBridge, {
      get(target, prop, receiver) {
        if (prop === 'exportData') {
          return () => ({ ...(originalExportData ? (originalExportData() || {}) : {}), countries: rows });
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    globalThis.OmegaCanonicalIdentityRegistry = adapted;
    globalThis.OmegaCountrySemanticBridge = adapted;
  }
} catch (e) {
  throw new Error(`[OMEGA BOOT] Canonical country export contract unavailable: ${e?.message || e}`);
}

await import('./omega_reasoning_dispatcher.js');
try {
  const originalDispatcher = globalThis.OmegaReasoningDispatcher;
  if (originalDispatcher && typeof originalDispatcher.dispatch === 'function') {
    const dispatcherAdapter = Object.create(originalDispatcher);
    Object.defineProperty(dispatcherAdapter, 'dispatch', {
      value: originalDispatcher.dispatch,
      writable: true,
      configurable: true,
      enumerable: true
    });
    globalThis.OmegaReasoningDispatcher = dispatcherAdapter;
  }
} catch (e) {
  throw new Error(`[OMEGA BOOT] Reasoning dispatcher adapter unavailable: ${e?.message || e}`);
}

await import('./omega_server_ai_gateway.js');
await import('./omega_deep_core_integrity_guard.js');

const CANONICAL_AI_SCRIPTS = Object.freeze([
  'omega_language_system.js',
  'omega_language_batch03_semantic_extension.js',
  'omega_country_semantic_bridge.js',
  'omega_resource_semantic_bridge.js',
  'omega_minister_runtime_v2.js',
  'omega_ai_integrity_layer.js',
  'omega_ai_integrity_canonical_bridge.js',
  'omega_cognitive_engine.js',
  'omega_reasoning_dispatcher.js',
  'omega_universal_ai_runtime.js',
  'omega_ai_context_bridge.js'
]);

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const canonicalTags = name => new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${escapeRegExp(name)}(?:[?#][^"']*)?["'][^>]*>\\s*</script>\\s*`, 'gi');

for (const name of CANONICAL_AI_SCRIPTS) {
  if (!fs.existsSync(new URL(`./${name}`, import.meta.url))) {
    throw new Error(`[OMEGA BOOT] Canonical AI script missing: ${name}`);
  }
}

if (!globalThis.__omegaUniversalIndexInjection) {
  globalThis.__omegaUniversalIndexInjection = true;
  const nativeReadFile = fs.readFile;
  fs.readFile = function omegaReadFile(file, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    return nativeReadFile.call(fs, file, options, function (err, data) {
      if (!err && typeof data === 'string' && /(?:^|[\\/])index\.html$/i.test(String(file))) {
        let html = String(data);
        for (const name of CANONICAL_AI_SCRIPTS) html = html.replace(canonicalTags(name), '');
        const additions = CANONICAL_AI_SCRIPTS.map(name => `    <script src="${name}" defer></script>`).join('\n');
        if (!html.includes('</body>')) {
          return callback(new Error('[OMEGA BOOT] index.html has no </body> insertion point'), data);
        }
        data = html.replace('</body>', `${additions}\n</body>`);
      }
      if (typeof callback === 'function') callback(err, data);
    });
  };
}

await import('./server.js');
