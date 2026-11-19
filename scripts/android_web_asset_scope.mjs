const LEADING_COMMENT = /^(?:\uFEFF)?\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$)|\s)*/;

export function isSelfInvokingClassicScript(source) {
  const text = String(source ?? '').replace(LEADING_COMMENT, '');
  return /^;?\s*\(\s*(?:async\s+)?function\b/.test(text) ||
    /^;?\s*\(\s*\([^)]*\)\s*=>/.test(text);
}

export function scopeTranspiledAndroidAsset(originalSource, transpiledSource) {
  if (!isSelfInvokingClassicScript(originalSource)) return transpiledSource;
  return \`(function omegaAndroidScopedClassicAsset() {\n\${transpiledSource}\n})();\n\`;
}
