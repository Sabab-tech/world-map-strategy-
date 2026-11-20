const LEADING_COMMENT = /^(?:\uFEFF)?\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$)|\s)*/;
const SCOPED_ANDROID_ASSETS = new Set(['omega_resource_research_runtime_v1.js']);

export function isSelfInvokingClassicScript(source) {
  const text = String(source ?? '').replace(LEADING_COMMENT, '');
  return /^;?\s*\(\s*(?:async\s+)?function\b/.test(text) ||
    /^;?\s*\(\s*(?:async\s+)?\([^)]*\)\s*=>/.test(text);
}

export function scopeTranspiledAndroidAsset(assetPath, originalSource, transpiledSource) {
  const normalizedPath = String(assetPath ?? '').replace(/\\/g, '/');
  if (!SCOPED_ANDROID_ASSETS.has(normalizedPath)) return transpiledSource;
  if (!isSelfInvokingClassicScript(originalSource)) {
    throw new Error('ANDROID_ASSET_SCOPE_EXPECTED_SELF_INVOKING_MODULE:' + normalizedPath);
  }
  return '(function omegaResourceResearchAndroidAssetScope() {\n' + transpiledSource + '\n})();\n';
}
