const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const JSON_SOURCES=['offline_language_vocabulary.json','offline_semantic_knowledge.json','omega_game_language_ontology.json','omega_game_language_source_inventory.json'];
const ARCHIVE_JS_SOURCES=['offline_semantic_brain.js','offline_query_engine.js','omega_game_language_bridge.js','omega_reasoning_dispatcher.js'];
const EXECUTION_SOURCE='scripts/omega_language_execution_module.js';
const ALL=[...JSON_SOURCES,'offline_lexicon.json',...ARCHIVE_JS_SOURCES,EXECUTION_SOURCE];
const EXPECTED={lexiconTotalWords:7756,sourceConceptCount:17,rawSurfaceEntryCount:332,uniqueSurfaceEntryCount:226,ontologyTarget:4500};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const decode=b=>new TextDecoder('utf-8',{fatal:false}).decode(b).replace(/^\uFEFF/,'');
const snapPath=f=>{const b=fs.readFileSync(f);const t=decode(b);return{bytes:b,text:t,rawSha256:sha(b),textSha256:sha(Buffer.from(t))}};
const snap=f=>snapPath(path.join(root,f));
const safe=k=>!['__proto__','prototype','constructor'].includes(String(k));
const countStrings=v=>typeof v==='string'?1:Array.isArray(v)?v.reduce((n,x)=>n+countStrings(x),0):v&&typeof v==='object'?Object.keys(v).filter(safe).reduce((n,k)=>n+countStrings(v[k]),0):0;
function repairJSONString(text){let out='',inside=false,escaped=false,repairs=0;for(const c of text){const n=c.charCodeAt(0);if(inside){if(escaped){out+=c;escaped=false;continue}if(c==='\\'){out+=c;escaped=true;continue}if(c==='"'){out+=c;inside=false;continue}if(n<32){out+=`\\u${n.toString(16).padStart(4,'0')}`;repairs++;continue}out+=c}else{out+=c;if(c==='"')inside=true}}return{json:out,repairs}};
function recoverLexicon(raw){try{return{data:JSON.parse(raw),mode:'DIRECT',repairs:0}}catch(first){const r=repairJSONString(raw);try{return{data:JSON.parse(r.json),mode:'CONTROL_ESCAPE_RECOVERY',repairs:r.repairs}}catch(second){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'omega-lex-'));try{cp.execFileSync(process.execPath,[path.join(root,'scripts','build_offline_lexicon.cjs')],{cwd:tmp,stdio:'pipe',encoding:'utf8',timeout:120000});const p=path.join(tmp,'offline_lexicon.json');if(!fs.existsSync(p))throw new Error('LEXICON_GENERATOR_DID_NOT_CREATE_OUTPUT');const s=snapPath(p);return{data:JSON.parse(s.text),mode:'GENERATOR_RECOVERY',repairs:r.repairs,generatedRawSha256:s.rawSha256}}finally{fs.rmSync(tmp,{recursive:true,force:true})}}}}
for(const f of ALL)if(!fs.existsSync(path.join(root,f)))throw new Error('SOURCE_MISSING:'+f);
const data={},meta={},archive={};
for(const f of JSON_SOURCES){const s=snap(f);data[f]=JSON.parse(s.text);meta[f]={bytes:s.bytes.length,rawSha256:s.rawSha256,textSha256:s.textSha256,parsed:'DIRECT'}}
const lex=snap('offline_lexicon.json'),lr=recoverLexicon(lex.text);if(lr.data?.TOTAL_WORDS!==EXPECTED.lexiconTotalWords)throw new Error('LEXICON_TOTAL_WORDS_CHANGED:'+lr.data?.TOTAL_WORDS);data['offline_lexicon.json']=lr.data;meta['offline_lexicon.json']={bytes:lex.bytes.length,rawSha256:lex.rawSha256,textSha256:lex.textSha256,parsed:lr.mode,repairs:lr.repairs||0,canonicalSha256:sha(Buffer.from(JSON.stringify(lr.data)))};
for(const f of ARCHIVE_JS_SOURCES){const s=snap(f);archive[f]=s.text;meta[f]={bytes:s.bytes.length,rawSha256:s.rawSha256,textSha256:s.textSha256,archived:true}}
const exec=snap(EXECUTION_SOURCE);archive[EXECUTION_SOURCE]=exec.text;meta[EXECUTION_SOURCE]={bytes:exec.bytes.length,rawSha256:exec.rawSha256,textSha256:exec.textSha256,embeddedExecutable:true};
const inv=data['omega_game_language_source_inventory.json'];if(inv.source_concept_count!==EXPECTED.sourceConceptCount||inv.raw_surface_entry_count!==EXPECTED.rawSurfaceEntryCount||inv.unique_surface_entry_count!==EXPECTED.uniqueSurfaceEntryCount)throw new Error('MIGRATION_INVENTORY_CHANGED');if(data['omega_game_language_ontology.json'].canonical_concept_target!==EXPECTED.ontologyTarget)throw new Error('ONTOLOGY_TARGET_CHANGED');if(!data['offline_language_vocabulary.json'].languages?.en||!data['offline_language_vocabulary.json'].languages?.bn)throw new Error('BILINGUAL_VOCABULARY_MISSING');
const build={build:'OMEGA-LANGUAGE-STANDALONE',version:'5.1.0',sourceFiles:ALL,jsonSources:[...JSON_SOURCES,'offline_lexicon.json'],archivedExecutableSources:ARCHIVE_JS_SOURCES,embeddedExecutableSources:[EXECUTION_SOURCE],sourceStringCount:Object.values(data).reduce((n,v)=>n+countStrings(v),0),lexiconTotalWords:EXPECTED.lexiconTotalWords,sourceConceptCount:EXPECTED.sourceConceptCount,rawSurfaceEntryCount:EXPECTED.rawSurfaceEntryCount,uniqueSurfaceEntryCount:EXPECTED.uniqueSurfaceEntryCount,ontologyTarget:EXPECTED.ontologyTarget,migrationInvariant:'source = migrated + deduplicated + intentionally_excluded',intentionallyExcluded:['omega_cognitive_engine.js','omega_ai_integrity_layer.js'],lexiconRecovery:{mode:meta['offline_lexicon.json'].parsed,repairs:meta['offline_lexicon.json'].repairs||0,originalRawSha256:lex.rawSha256,canonicalSha256:meta['offline_lexicon.json'].canonicalSha256},sources:meta};
const template=fs.readFileSync(path.join(root,'scripts','omega_language_system.runtime.template.js'),'utf8');
const out=exec.text+'\n'+template.replace('__BUILD__',JSON.stringify(build)).replace('__SOURCE_DATA__',JSON.stringify(data)).replace('__SOURCE_ARCHIVE__',JSON.stringify(archive));
const target=path.join(root,'omega_language_system.js'),tmp=target+'.tmp';fs.writeFileSync(tmp,out,'utf8');fs.renameSync(tmp,target);
console.log(JSON.stringify({ok:true,bundleBytes:Buffer.byteLength(out),version:build.version,lexiconRecovery:build.lexiconRecovery,sourceStringCount:build.sourceStringCount,embeddedExecutable:EXECUTION_SOURCE},null,2));
