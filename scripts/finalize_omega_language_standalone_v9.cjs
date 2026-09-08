const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const builder=path.join(root,'scripts','finalize_omega_language_standalone.cjs');
const bundle=path.join(root,'omega_language_system.js');
cp.execFileSync(process.execPath,[builder],{cwd:root,stdio:'inherit',timeout:180000});
let s=fs.readFileSync(bundle,'utf8');
const decoder="const __OMEGA_B64_JSON__=b=>JSON.parse(new TextDecoder('utf-8').decode(Uint8Array.from(atob(b),c=>c.charCodeAt(0))));";
if(!s.includes('__OMEGA_B64_JSON__'))s=s.replace("(function(global){'use strict';", "(function(global){'use strict';\n"+decoder);
for(const [key,next] of [['SOURCE_DATA','SOURCE_ARCHIVE'],['SOURCE_ARCHIVE','SOURCE_RAW'],['SOURCE_RAW','LIMITS']]){
  const start=s.indexOf('const '+key+'=Object.freeze('); if(start<0)throw Error('SECTION_MISSING:'+key);
  const endMarker=key==='SOURCE_RAW'? '\nconst LIMITS=' : '\nconst '+next+'=';
  const end=s.indexOf(endMarker,start); if(end<0)throw Error('SECTION_END_MISSING:'+key);
  const prefix='const '+key+'=Object.freeze('; const expression=s.slice(start+prefix.length,end).trim();
  if(!expression.endsWith(');'))throw Error('SECTION_SHAPE_INVALID:'+key);
  const value=JSON.parse(expression.slice(0,-2));
  const encoded=Buffer.from(JSON.stringify(value),'utf8').toString('base64');
  const replacement='const '+key+'=Object.freeze(__OMEGA_B64_JSON__('+JSON.stringify(encoded)+'));';
  s=s.slice(0,start)+replacement+s.slice(end);
}
fs.writeFileSync(bundle,s,'utf8');
const check=cp.spawnSync(process.execPath,['--check',bundle],{cwd:root,encoding:'utf8'});
if(check.status!==0){console.error(check.stderr||check.stdout);process.exit(check.status||1)}
console.log(JSON.stringify({ok:true,postprocess:'REGEX_BOUND_BASE64_JSON_PLANES',bundleBytes:Buffer.byteLength(s),sha256:crypto.createHash('sha256').update(s).digest('hex')},null,2));
