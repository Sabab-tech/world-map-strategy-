import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

export const ANDROID_WEBVIEW_TARGET = 'chrome70';

export async function transpileJavaScript(source, sourcefile = 'android-web-asset.js') {
  const result = await transform(String(source), {
    loader: 'js',
    target: ANDROID_WEBVIEW_TARGET,
    sourcefile,
    legalComments: 'eof'
  });
  return result.code;
}

function scriptType(attributes) {
  const match = attributes.match(/\btype\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  return String(match?.[1] || match?.[2] || match?.[3] || '').trim().toLowerCase();
}

function isJavaScriptType(type) {
  if (!type || type === 'module') return true;
  return /^(?:text|application)\/(?:javascript|ecmascript)(?:\s*;.*)?$/.test(type);
}

export async function transpileInlineScripts(html, htmlPath = 'index.html') {
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let output = '';
  let cursor = 0;
  let inlineIndex = 0;
  let match;

  while ((match = pattern.exec(String(html))) !== null) {
    output += html.slice(cursor, match.index);
    const whole = match[0];
    const opening = whole.match(/^<script\b[^>]*>/i)?.[0];
    const closing = whole.match(/<\/script\s*>$/i)?.[0];
    if (!opening || !closing) {
      output += whole;
      cursor = match.index + whole.length;
      continue;
    }

    const attributes = opening.slice('<script'.length, -1);
    const hasSource = /\bsrc\s*=/i.test(attributes);
    const type = scriptType(attributes);
    const bodyStart = opening.length;
    const bodyEnd = whole.length - closing.length;
    const body = whole.slice(bodyStart, bodyEnd);

    if (hasSource || !body.trim() || !isJavaScriptType(type)) {
      output += whole;
    } else {
      inlineIndex += 1;
      const label = htmlPath + '#inline-script-' + inlineIndex + '.js';
      const converted = await transpileJavaScript(body, label);
      output += whole.slice(0, bodyStart) + converted + whole.slice(bodyEnd);
    }

    cursor = match.index + whole.length;
  }

  output += html.slice(cursor);
  return output;
}

async function listFiles(root, relative = '') {
  const absolute = path.join(root, relative);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const child = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

export async function buildCompatibleAssetTree(sourceRoot, outputRoot) {
  const source = path.resolve(sourceRoot);
  const output = path.resolve(outputRoot);
  if (source === output || output.startsWith(source + path.sep)) {
    throw new Error('Android WebView transpilation output must be separate from the raw source directory.');
  }

  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.cp(source, output, { recursive: true });

  const files = await listFiles(output);
  let jsCount = 0;
  let htmlCount = 0;

  for (const relative of files) {
    const absolute = path.join(output, relative);
    if (/\.js$/i.test(relative)) {
      const original = await fs.readFile(absolute, 'utf8');
      const converted = await transpileJavaScript(original, relative);
      await fs.writeFile(absolute, converted, 'utf8');
      jsCount += 1;
    } else if (/\.html?$/i.test(relative)) {
      const original = await fs.readFile(absolute, 'utf8');
      const converted = await transpileInlineScripts(original, relative);
      await fs.writeFile(absolute, converted, 'utf8');
      htmlCount += 1;
    }
  }

  return { source, output, jsCount, htmlCount, target: ANDROID_WEBVIEW_TARGET };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const source = process.argv[2];
  const output = process.argv[3];
  if (!source || !output) {
    console.error('Usage: node scripts/build_android_web_compat_assets.mjs <raw-assets-dir> <output-assets-dir>');
    process.exitCode = 2;
  } else {
    const result = await buildCompatibleAssetTree(source, output);
    console.log('[OMEGA Android WebView] Transpiled ' + result.jsCount + ' JavaScript files and ' + result.htmlCount + ' HTML files for ' + result.target + '.');
  }
}
