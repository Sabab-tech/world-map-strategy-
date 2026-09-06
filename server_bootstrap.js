/** OMEGA SERVER BOOTSTRAP v2.2.0
 * Canonical server bootstrap. Never changes index.html on disk.
 * Installs the generic resource-policy bridge before server.js registers routes.
 */
import fs from 'fs';
import path from 'path';

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

await import('./offline_query_engine.js');
await import('./omega_resource_strategy_engine.js');
const _queryEngine = globalThis.OfflineQueryEngine;
const _strategyEngine = globalThis.OmegaResourceStrategyEngine;
if (_queryEngine?.execute && _strategyEngine?.plan && !globalThis.__omegaResourceStrategyBridge) {
  globalThis.__omegaResourceStrategyBridge = true;
  const originalExecute = _queryEngine.execute.bind(_queryEngine);
  let registry = {};
  let ontology = {};
  const datasets = [];
  try {
    for (const filename of ['resources.json', 'resources_2.json', 'countries.json']) {
      const file = path.resolve(process.cwd(), filename);
      if (fs.existsSync(file)) datasets.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    const ontologyPath = path.resolve(process.cwd(), 'resource_ontology.json');
    if (fs.existsSync(ontologyPath)) ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8')).COMMODITY_ONTOLOGIES || {};
    for (const ds of datasets) if (ds.resource_types) registry = { ...registry, ...ds.resource_types };
  } catch (error) {
    console.warn('[Resource Strategy Bridge] Dataset load warning:', error.message);
  }

  _queryEngine.execute = function groundedPolicyExecute(parsed, semanticDatasets = [], language = 'en', context = {}) {
    const result = originalExecute(parsed, semanticDatasets, language, context);
    const raw = String(parsed?.raw || parsed?.query || parsed?.text || '').trim();
    const normalized = raw.toLowerCase();
    const policyQuery = /\b(increase|raise|boost|grow|expand|improve|how can we|what can we do|strategy|plan|policy|recommend|recommendation|should we|produce more|extract more)\b|বাড়াতে|বাড়াতে|বৃদ্ধি|উৎপাদন বাড়|উৎপাদন বাড়|আরও উৎপাদন|কীভাবে.*বাড়|কীভাবে.*বাড়|কী করা উচিত|পরিকল্পনা|কৌশল|সুপারিশ/.test(normalized);
    const productionQuery = /production|produce|output|extract|extraction|উৎপাদন|উত্তোলন/.test(normalized);
    if (!policyQuery || !productionQuery) return result;

    const strategy = _strategyEngine.plan(raw, {
      datasets: [...datasets, ...(semanticDatasets || [])],
      resourceRegistry: registry,
      ontology,
      resourceId: context.resourceId || parsed?.entities?.resource?.id,
      countryCode: context.countryId || parsed?.context?.countryId,
      countryName: context.countryName || parsed?.context?.countryName
    });

    const languageBn = language === 'bn' || /[\u0980-\u09FF]/.test(raw);
    const answer = strategy.directAnswer || (languageBn
      ? 'উৎপাদন বাড়ানোর জন্য প্রাসঙ্গিক সম্পদ-নির্দিষ্ট উৎপাদন, মজুদ, সক্ষমতা, অবকাঠামো ও প্রক্রিয়াকরণ ডেটা আগে যাচাই করতে হবে।'
      : 'To increase production, the resource-specific production, reserve, capacity, infrastructure and processing data must be checked first.');
    const recommendationText = strategy.recommendations.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
    return {
      ...result,
      type: 'POLICY_RECOMMENDATION',
      operation: 'INCREASE_PRODUCTION',
      strategy,
      answerState: strategy.state === 'GROUNDED_PLAN' ? 'DERIVABLE' : 'INSUFFICIENT_DATA',
      directAnswer: answer,
      text: `${answer}\n\n${recommendationText}${strategy.blockers?.length ? `\n\nData limits:\n${strategy.blockers.map(x => `• ${x}`).join('\n')}` : ''}`,
      grounding: {
        source: 'OMEGA_RESOURCE_STRATEGY_ENGINE',
        rule: 'NO_QUANTITY_INVENTION',
        resourceAgnostic: true
      }
    };
  };
}

if (!globalThis.__omegaUniversalIndexInjection) {
  globalThis.__omegaUniversalIndexInjection = true;
  const nativeReadFile = fs.readFile;
  fs.readFile = function omegaReadFile(file, options, callback) {
    if (typeof options === 'function') { callback = options; options = undefined; }
    return nativeReadFile.call(fs, file, options, function (err, data) {
      if (!err && typeof data === 'string' && /(?:^|[\\/])index\.html$/i.test(String(file)) && !data.includes('/omega_universal_ai_runtime.js')) {
        data = data.replace('</body>', '    <script src="/omega_universal_ai_runtime.js"></script>\n</body>');
      }
      if (typeof callback === 'function') callback(err, data);
    });
  };
}

await import('./server.js');
