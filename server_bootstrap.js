/** OMEGA SERVER BOOTSTRAP v2.3.4
 * Canonical server bootstrap. Never changes index.html on disk.
 * Establishes one canonical AI/language/bridge chain before the UI is served.
 * Legacy semantic runtime v3.2 is compatibility-only and is never injected here.
 */
import fs from 'fs';
import './omega_server_ai_gateway.js';

const nativeFetch = globalThis.fetch;
const MODEL_FALLBACK = 'gemini-3.7-flash';

if (typeof nativeFetch === 'function' && !globalThis.__omegaGeminiFetchCompat) {
  globalThis.__omegaGeminiFetchCompat = true;
  globalThis.fetch = async function omegaGeminiFetch(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
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

const CANONICAL_AI_SCRIPTS = [
  'omega_language_system.js',
  'omega_language_batch03_semantic_extension.js',
  'omega_country_semantic_bridge.js',
  'omega_resource_semantic_bridge.js',
  'omega_minister_runtime_v2.js',
  'omega_ai_integrity_layer.js',
  'omega_cognitive_engine.js',
  'omega_reasoning_dispatcher.js',
  'omega_universal_ai_runtime.js',
  'omega_ai_context_bridge.js'
];

if (!globalThis.__omegaUniversalIndexInjection) {
  globalThis.__omegaUniversalIndexInjection = true;
  const nativeReadFile = fs.readFile;
  fs.readFile = function omegaReadFile(file, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    return nativeReadFile.call(fs, file, options, function (err, data) {
      if (!err && typeof data === 'string' && /(?:^|[\\/])index\.html$/i.test(String(file))) {
        const existing = String(data);
        const additions = CANONICAL_AI_SCRIPTS
          .filter(name => !existing.includes(`/${name}`) && !existing.includes(`src="${name}"`) && !existing.includes(`src='${name}'`))
          .map(name => `    <script src="${name}" defer></script>`)
          .join('\n');
        if (additions) data = existing.replace('</body>', `${additions}\n</body>`);
      }
      if (typeof callback === 'function') callback(err, data);
    });
  };
}

await import('./server.js');
