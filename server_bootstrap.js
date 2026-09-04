/** OMEGA SERVER BOOTSTRAP v1.0.0
 * Keeps the existing server intact while normalising Gemini model requests.
 * The wrapper is deliberately narrow: it only rewrites obsolete Gemini model IDs.
 */
const nativeFetch = globalThis.fetch;
const MODEL_FALLBACK = 'gemini-3.7-flash';
const OBSOLETE = new Set([
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash',
  'gemini-3.1-flash-lite-preview'
]);

if (typeof nativeFetch === 'function' && !globalThis.__omegaGeminiFetchCompat) {
  globalThis.__omegaGeminiFetchCompat = true;
  globalThis.fetch = async function omegaGeminiFetch(input, init) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (raw && raw.includes('generativelanguage.googleapis.com') && raw.includes(':generateContent')) {
        const url = new URL(raw);
        const match = url.pathname.match(/\/models\/([^/:]+):generateContent$/);
        if (match && OBSOLETE.has(match[1])) {
          url.pathname = url.pathname.replace(`/models/${match[1]}:generateContent`, `/models/${MODEL_FALLBACK}:generateContent`);
          input = typeof input === 'string' ? url.toString() : new Request(url, input);
        }
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };
}

await import('./server.js');
