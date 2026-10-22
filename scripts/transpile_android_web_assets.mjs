import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('ANDROID_WEB_ASSET_DIRECTORY_REQUIRED');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'omega-es2017-assets-'));
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runEsbuild(args) {
  const result = spawnSync(command, ['--yes', 'esbuild@0.25.0', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('ESBUILD_ANDROID_TRANSPILE_FAILED: ' + String(result.stderr || result.stdout || result.status));
}

async function walk(dir, jsFiles = [], htmlFiles = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, jsFiles, htmlFiles);
    else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(file);
    else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(file);
  }
  return { jsFiles, htmlFiles };
}

try {
  const { jsFiles, htmlFiles } = await walk(root);
  if (jsFiles.length) {
    const outDir = path.join(tempRoot, 'js');
    await fs.mkdir(outDir, { recursive: true });
    runEsbuild([...jsFiles, '--outdir=' + outDir, '--outbase=' + root, '--target=es2017', '--log-level=error']);
    for (const file of jsFiles) {
      const output = path.join(outDir, path.relative(root, file));
      const transpiled = await fs.readFile(output, 'utf8');
      const label = path.relative(root, file).split(path.sep).join('/').replace(/'/g, "\\'");
      const traceStart = `;if(window.OMEGA_ANDROID_DIAGNOSTICS===true)console.info('[OMEGA_BOOT_START] ${label}');\n`;
      const traceEnd = `\n;if(window.OMEGA_ANDROID_DIAGNOSTICS===true)console.info('[OMEGA_BOOT_END] ${label}');\n`;
      const strictDirective = /^(\s*["']use strict["'];\s*)/.exec(transpiled);
      const instrumented = strictDirective
        ? strictDirective[1] + traceStart + transpiled.slice(strictDirective[1].length) + traceEnd
        : traceStart + transpiled + traceEnd;
      await fs.writeFile(file, instrumented, 'utf8');
    }
  }

  let inlineIndex = 0;
  const inlineRows = [];
  const inlineDir = path.join(tempRoot, 'inline');
  const inlineOutDir = path.join(tempRoot, 'inline-out');
  await fs.mkdir(inlineDir, { recursive: true });
  for (const file of htmlFiles) {
    const html = await fs.readFile(file, 'utf8');
    const tag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let match;
    while ((match = tag.exec(html))) {
      const attrs = match[1] || '';
      const body = match[2] || '';
      if (/\bsrc\s*=/i.test(attrs) ||
          /\btype\s*=\s*["'](?:application\/json|application\/ld\+json|importmap)["']/i.test(attrs) ||
          !body.trim()) continue;
      const id = String(inlineIndex++).padStart(5, '0');
      const inputPath = path.join(inlineDir, id + '.js');
      await fs.writeFile(inputPath, body, 'utf8');
      inlineRows.push({ file, start: match.index + match[0].indexOf(body), end: match.index + match[0].indexOf(body) + body.length, id });
    }
  }
  if (inlineRows.length) {
    const inputs = inlineRows.map(row => path.join(inlineDir, row.id + '.js'));
    runEsbuild([...inputs, '--outdir=' + inlineOutDir, '--outbase=' + inlineDir, '--target=es2017', '--log-level=error']);
    const byFile = new Map();
    for (const row of inlineRows) {
      const rows = byFile.get(row.file) || [];
      const transpiled = await fs.readFile(path.join(inlineOutDir, row.id + '.js'), 'utf8');
      const label = path.basename(row.file) + ':inline-' + row.id;
      const traceStart = `;if(window.OMEGA_ANDROID_DIAGNOSTICS===true)console.info('[OMEGA_BOOT_START] ${label}');\n`;
      const traceEnd = `\n;if(window.OMEGA_ANDROID_DIAGNOSTICS===true)console.info('[OMEGA_BOOT_END] ${label}');\n`;
      const strictDirective = /^(\s*["']use strict["'];\s*)/.exec(transpiled);
      const body = strictDirective
        ? strictDirective[1] + traceStart + transpiled.slice(strictDirective[1].length) + traceEnd
        : traceStart + transpiled + traceEnd;
      rows.push({ ...row, body });
      byFile.set(row.file, rows);
    }
    for (const [file, rows] of byFile) {
      let html = await fs.readFile(file, 'utf8');
      for (const row of rows.sort((a, b) => b.start - a.start)) html = html.slice(0, row.start) + row.body + html.slice(row.end);
      await fs.writeFile(file, html, 'utf8');
    }
  }
  console.log('OMEGA Android web assets transpiled for ES2017 WebView compatibility.');
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
