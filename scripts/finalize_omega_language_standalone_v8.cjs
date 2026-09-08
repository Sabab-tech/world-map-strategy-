const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const builder=path.join(root,'scripts','finalize_omega_language_standalone.cjs');
const bundle=path.join(root,'omega_language_system.js');
cp.execFileSync(process.execPath,[builder],{cwd:root,stdio:'inherit',timeout:180000});
let s=fs.readFileSync(bundle,'utf8');
const marker="(function(global){'use strict';";
const decoder="const __OMEGA_B64_JSON__=b=>JSON.parse(new TextDecoder('utf-8').decode(Uint8Array.from(atob(b),c=>c.charCodeAt(0))));";
if(!s.includes('__OMEGA_B64_JSON__'))s=s.replace(marker,marker+'\n'+decoder);
for(const key of ['SOURCE_DATA','SOURCE_ARCHIVE','SOURCE_RAW']){
  const prefix='const '+key+'=Object.freeze('; const start=s.indexOf(prefix); if(start<0)throw Error('BUNDLE_SECTION_MISSING:'+key);
  const end=s.indexOf('\n',start); if(end<0)throw Error('BUNDLE_SECTION_NOT_LINE_BOUNDED:'+key);
  const line=s.slice(start,end); if(!line.endsWith(');'))throw Error('BUNDLE_SECTION_SHAPE_INVALID:'+key);
  const value=JSON.parse(line.slice(prefix.length,-2));
  const encoded=Buffer.from(JSON.stringify(value),'utf8').toString('base64');
  const replacement='const '+key+'=Object.freeze(__OMEGA_B64_JSON__('+JSON.stringify(encoded)+'));';
  s=s.slice(0,start)+replacement+s.slice(end);
}
fs.writeFileSync(bundle,s,'utf8');
const syntax=cp.spawnSync(process.execPath,['--check',bundle],{cwd:root,encoding:'utf8'});
if(syntax.status!==0){console.error(syntax.stderr);process.exit(syntax.status||1)}
console.log(JSON.stringify({ok:true,postprocess:'BROWSER_SAFE_BASE64_JSON_PLANES',bundleBytes:Buffer.byteLength(s),sha256:crypto.createHash('sha256').update(s).digest('hex')},null,2));
