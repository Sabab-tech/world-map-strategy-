/** OMEGA SERVER BOOTSTRAP v2.2.1
 * Canonical server bootstrap. Never changes index.html on disk.
 */
import fs from 'fs';

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

if (!globalThis.__omegaUniversalIndexInjection) {
  globalThis.__omegaUniversalIndexInjection = true;
  const nativeReadFile = fs.readFile;
  fs.readFile = function omegaReadFile(file, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    return nativeReadFile.call(fs, file, options, function (err, data) {
      if (!err && typeof data === 'string' && /(?:^|[\\/])index\.html$/i.test(String(file))) {
        const languageTag = '    <script src="/omega_language_system.js"></script>';
        const runtimeTag = '    <script src="/omega_universal_ai_runtime.js"></script>';
        const hasLanguage = data.includes('omega_language_system.js');
        const hasRuntime = data.includes('omega_universal_ai_runtime.js');

        // The language system MUST precede the universal runtime. Repair an
        // existing reversed order instead of merely appending another script.
        if (hasLanguage && hasRuntime) {
          const languagePos = data.indexOf('omega_language_system.js');
          const runtimePos = data.indexOf('omega_universal_ai_runtime.js');
          if (languagePos > runtimePos) {
            const languageBlock = data.match(/[^\n]*<script[^>]*omega_language_system\.js[^>]*><\/script>[^\n]*/)?.[0];
            const runtimeBlock = data.match(/[^\n]*<script[^>]*omega_universal_ai_runtime\.js[^>]*><\/script>[^\n]*/)?.[0];
            if (languageBlock && runtimeBlock) {
              data = data.replace(languageBlock, '').replace(runtimeBlock, '').replace(/\n{3,}/g, '\n\n');
              data = data.replace('</body>', languageBlock.trim() + '\n' + runtimeBlock.trim() + '\n</body>');
            }
          }
        } else {
          const scripts = [!hasLanguage ? languageTag : '', !hasRuntime ? runtimeTag : ''].filter(Boolean).join('\n');
          if (scripts) data = data.replace('</body>', scripts + '\n</body>');
        }
      }
      if (typeof callback === 'function') callback(err, data);
    });
  };
}

await import('./server.js');
