const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const builder=path.join(root,'scripts','finalize_omega_language_standalone.cjs');
const bundle=path.join(root,'omega_language_system.js');
cp.execFileSync(process.execPath,[builder],{cwd:root,stdio:'inherit',timeout:180000});
const check=cp.spawnSync(process.execPath,['--check',bundle],{cwd:root,encoding:'utf8'});
if(check.status!==0){console.error(check.stderr||check.stdout);process.exit(check.status||1)}
const s=fs.readFileSync(bundle,'utf8');
console.log(JSON.stringify({ok:true,postprocess:'BASE_BUILDER_CANONICAL_BUNDLE',bundleBytes:Buffer.byteLength(s),sha256:crypto.createHash('sha256').update(s).digest('hex')},null,2));
