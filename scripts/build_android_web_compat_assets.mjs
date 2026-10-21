import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

export const ANDROID_WEBVIEW_TARGET = 'chrome70';
export const ANDROID_WEBVIEW_POLYFILL_PATH = '__omega_generated__/android-webview-polyfills.js';
export const ANDROID_WEBVIEW_POLYFILL_SOURCE = "(function(g){'use strict';\n  if(!Object.fromEntries){\n    Object.fromEntries=function(iterable){\n      if(iterable==null)throw new TypeError('Object.fromEntries requires an iterable');\n      var result={},iteratorMethod=typeof Symbol!=='undefined'&&Symbol.iterator&&iterable[Symbol.iterator];\n      if(typeof iteratorMethod==='function'){\n        var iterator=iteratorMethod.call(iterable),step;\n        while(!(step=iterator.next()).done){\n          var pair=step.value;\n          if(pair==null||(typeof pair!=='object'&&typeof pair!=='function'))throw new TypeError('Iterator value is not an entry object');\n          var key=String(pair[0]);\n          if(key==='__proto__')Object.defineProperty(result,key,{value:pair[1],enumerable:true,configurable:true,writable:true});\n          else result[key]=pair[1];\n        }\n        return result;\n      }\n      for(var i=0;i<iterable.length;i++){\n        var row=iterable[i];\n        if(row==null||(typeof row!=='object'&&typeof row!=='function'))throw new TypeError('Iterator value is not an entry object');\n        var name=String(row[0]);\n        if(name==='__proto__')Object.defineProperty(result,name,{value:row[1],enumerable:true,configurable:true,writable:true});\n        else result[name]=row[1];\n      }\n      return result;\n    };\n  }\n  if(!Array.prototype.flatMap){\n    Object.defineProperty(Array.prototype,'flatMap',{configurable:true,writable:true,value:function(callback,thisArg){\n      if(this==null)throw new TypeError('Array.prototype.flatMap called on null or undefined');\n      if(typeof callback!=='function')throw new TypeError('flatMap callback must be a function');\n      var source=Object(this),length=source.length>>>0,result=[];\n      for(var i=0;i<length;i++)if(i in source){\n        var value=callback.call(thisArg,source[i],i,source);\n        if(Array.isArray(value)){\n          for(var j=0;j<value.length;j++)if(j in value)result.push(value[j]);\n        }else result.push(value);\n      }\n      return result;\n    }});\n  }\n})(typeof window!=='undefined'?window:globalThis);";
export function injectCompatibilityScript(html, scriptPath = ANDROID_WEBVIEW_POLYFILL_PATH) {
  const source = String(html);
  if (source.indexOf(scriptPath) >= 0) return source;
  const tag = '<script src="' + scriptPath + '"></script>\n';
  const head = /<head\b[^>]*>/i.exec(source);
  if (head) {
    const index = head.index + head[0].length;
    return source.slice(0, index) + '\n' + tag + source.slice(index);
  }
  const firstScript = /<script\b/i.exec(source);
  if (firstScript) return source.slice(0, firstScript.index) + tag + source.slice(firstScript.index);
  return tag + source;
}

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

  const polyfillPath = path.join(output, ANDROID_WEBVIEW_POLYFILL_PATH);
  try {
    await fs.access(polyfillPath);
    throw new Error('Refusing to overwrite an existing asset at ' + ANDROID_WEBVIEW_POLYFILL_PATH);
  } catch (error) {
    if (error && error.message && error.message.indexOf('Refusing to overwrite') >= 0) throw error;
  }
  await fs.mkdir(path.dirname(polyfillPath), { recursive: true });
  await fs.writeFile(polyfillPath, ANDROID_WEBVIEW_POLYFILL_SOURCE, 'utf8');

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
      const injected = injectCompatibilityScript(original);
      const converted = await transpileInlineScripts(injected, relative);
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
