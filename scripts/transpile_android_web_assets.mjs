import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !root) throw new Error('ANDROID_WEB_ASSET_DIRECTORY_REQUIRED');

function transpile(source, loader = 'js') {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['--yes', 'esbuild@0.25.0', '--target=es2017', '--loader=' + loader], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('ESBUILD_ANDROID_TRANSPILE_FAILED: ' + String(result.stderr || result.stdout || result.status));
  return result.stdout;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = await fs.readFile(file, 'utf8');
      const output = transpile(source);
      await fs.writeFile(file, output, 'utf8');
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      let html = await fs.readFile(file, 'utf8');
      const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
      const replacements = [];
      let match;
      while ((match = scriptTag.exec(html))) {
        const attrs = match[1] || '';
        const body = match[2] || '';
        if (/\bsrc\s*=/i.test(attrs) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json|importmap)["']/i.test(attrs) || !body.trim()) continue;
        replacements.push({ start: match.index + match[0].indexOf(body), end: match.index + match[0].indexOf(body) + body.length, body: transpile(body) });
      }
      for (const item of replacements.reverse()) html = html.slice(0, item.start) + item.body + html.slice(item.end);
      await fs.writeFile(file, html, 'utf8');
    }
  }
}

await walk(root);
console.log('OMEGA Android web assets transpiled for ES2017 WebView compatibility.');
