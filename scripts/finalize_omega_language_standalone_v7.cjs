const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const builder=path.join(root,'scripts','finalize_omega_language_standalone.cjs');
const bundle=path.join(root,'omega_language_system.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const jsJson=v=>JSON.stringify(v).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
cp.execFileSync(process.execPath,[builder],{cwd:root,stdio:'inherit',timeout:180000});
let s=fs.readFileSync(bundle,'utf8');
const decoder="const __OMEGA_B64_JSON__=b=>JSON.parse(Buffer.from(b,'base64').toString('utf8'));";
const marker="(function(global){'use strict';";
if(!s.includes('__OMEGA_B64_JSON__'))s=s.replace(marker,marker+'\n'+decoder);
for(const key of ['SOURCE_DATA','SOURCE_ARCHIVE','SOURCE_RAW']){
  const prefix='const '+key+'=Object.freeze('; const start=s.indexOf(prefix);
  if(start<0)throw new Error('BUNDLE_SECTION_MISSING:'+key);
  const lineEnd=s.indexOf('\n',start); if(lineEnd<0)throw new Error('BUNDLE_SECTION_NOT_LINE_BOUNDED:'+key);
  const line=s.slice(start,lineEnd); if(!line.endsWith(');'))throw new Error('BUNDLE_SECTION_SHAPE_INVALID:'+key);
  const value=JSON.parse(line.slice(prefix.length,-2));
  const encoded=Buffer.from(JSON.stringify(value),'utf8').toString('base64');
  const replacement='const '+key+'=Object.freeze(__OMEGA_B64_JSON__('+jsJson(encoded)+'));';
  s=s.slice(0,start)+replacement+s.slice(lineEnd);
}
fs.writeFileSync(bundle,s,'utf8');
new Function(fs.readFileSync(bundle,'utf8'));
console.log(JSON.stringify({ok:true,postprocess:'BASE64_JSON_PLANES',bundleBytes:Buffer.byteLength(s),sha256:sha(Buffer.from(s))},null,2));
