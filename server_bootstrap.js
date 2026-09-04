/** OMEGA SERVER BOOTSTRAP v3.0.0
 * Server entrypoint only. The client router is the single interrogation owner,
 * so this bootstrap no longer injects a second browser AI runtime.
 */

const MODEL_FALLBACK = 'gemini-3.7-flash';
const nativeFetch = globalThis.fetch;

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

await import('./server.js');
