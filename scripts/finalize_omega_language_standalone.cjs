const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const root=path.resolve(__dirname,'..');
const JSON_SOURCES=['offline_language_vocabulary.json','offline_lexicon.json','offline_semantic_knowledge.json','omega_game_language_ontology.json','omega_game_language_source_inventory.json'];
const JS_SOURCES=['offline_semantic_brain.js','offline_query_engine.js','omega_game_language_bridge.js','omega_reasoning_dispatcher.js','omega_cognitive_engine.js','omega_ai_integrity_layer.js'];
const ALL=[...JSON_SOURCES,...JS_SOURCES];
function hybridDecode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch(_){let out='';for(let i=0;i<bytes.length;){const b=bytes[i];let n=0;if(b<128)n=1;else if(b>=194&&b<=223&&i+1<bytes.length&&(bytes[i+1]&192)===128)n=2;else if(b>=224&&b<=239&&i+2<bytes.length&&(bytes[i+1]&192)===128&&(bytes[i+2]&192)===128)n=3;else if(b>=240&&b<=244&&i+3<bytes.length&&(bytes[i+1]&192)===128&&(bytes[i+2]&192)===128&&(bytes[i+3]&192)===128)n=4;if(n){out+=new TextDecoder('utf-8').decode(bytes.slice(i,i+n));i+=n;}else{const m={128:'€',130:'‚',131:'ƒ',132:'„',133:'…',134:'†',135:'‡',136:'ˆ',137:'‰',138:'Š',139:'‹',140:'Œ',142:'Ž',145:'‘',146:'’',147:'“',148:'”',149:'•',150:'–',151:'—',152:'˜',153:'™',154:'š',155:'›',156:'œ',158:'ž',159:'Ÿ'};out+=m[b]||String.fromCharCode(b);i++;}}return out.replace(/^\uFEFF/,'');}}
function snap(file){const bytes=fs.readFileSync(path.join(root,file));const text=hybridDecode(bytes);return {bytes,text,rawSha256:crypto.createHash('sha256').update(bytes).digest('hex'),textSha256:crypto.createHash('sha256').update(text,'utf8').digest('hex')};}
function strings(v){if(typeof v==='string')return 1;if(Array.isArray(v))return v.reduce((n,x)=>n+strings(x),0);if(v&&typeof v==='object')return Object.values(v).reduce((n,x)=>n+strings(x),0);return 0;}
for(const f of ALL)if(!fs.existsSync(path.join(root,f)))throw new Error('SOURCE_MISSING:'+f);
const meta={},data={},mods={};
for(const f of JSON_SOURCES){const s=snap(f);data[f]=JSON.parse(s.text);meta[f]={bytes:s.bytes.length,rawSha256:s.rawSha256,textSha256:s.textSha256};}
for(const f of JS_SOURCES){const s=snap(f);mods[f]=s.text;meta[f]={bytes:s.bytes.length,rawSha256:s.rawSha256,textSha256:s.textSha256};}
const inv=data['omega_game_language_source_inventory.json'];
if(data['offline_lexicon.json'].TOTAL_WORDS!==7756)throw new Error('LEXICON_TOTAL_WORDS_CHANGED');
if(inv.source_concept_count!==17||inv.raw_surface_entry_count!==332||inv.unique_surface_entry_count!==226)throw new Error('MIGRATION_INVENTORY_CHANGED');
if(!data['offline_language_vocabulary.json'].languages?.en||!data['offline_language_vocabulary.json'].languages?.bn)throw new Error('BILINGUAL_VOCABULARY_MISSING');
const sourceStringCount=JSON_SOURCES.reduce((n,f)=>n+strings(data[f]),0);
const embeddedJson=JSON.stringify(data);
const moduleBlock=JS_SOURCES.map(f=>'/* BEGIN EMBEDDED_MODULE '+f+' */\n'+mods[f]+'\n/* END EMBEDDED_MODULE '+f+' */').join('\n');
const build=JSON.stringify({build:'OMEGA-LANGUAGE-STANDALONE',version:'4.0.0',sourceFiles:ALL,jsonSources:JSON_SOURCES,jsSources:JS_SOURCES,sourceStringCount,lexiconTotalWords:7756,sourceConceptCount:17,rawSurfaceEntryCount:332,uniqueSurfaceEntryCount:226,intentionallyExcluded:[],migrationInvariant:'source = migrated + deduplicated + intentionally_excluded',sources:meta});
const wrapper=`
(function(global){'use strict';
const BUILD=Object.freeze(${build});
const SOURCE_DATA=Object.freeze(${embeddedJson});
const MAX_INPUT=20000,MAX_HISTORY=200;
let datasets=[],ctxState=Object.create(null),history=[];
const text=v=>String(v==null?'':v),langOf=v=>/[\\u0980-\\u09FF]/.test(text(v))?'bn':'en';
function clone(v){try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return null;}}
function storage(){try{return global.localStorage||null;}catch(_){return null;}}
function restore(){const s=storage();if(!s)return[];try{const x=JSON.parse(s.getItem('omega.language.standalone.history.v1')||'[]');return Array.isArray(x)?x.slice(-MAX_HISTORY):[]}catch(_){return[]}}
function save(){const s=storage();if(!s)return;try{s.setItem('omega.language.standalone.history.v1',JSON.stringify(history.slice(-MAX_HISTORY)));}catch(_) {}}
function context(extra){const gs=global.Game?.state||global.gameState||global.Omega?.World?.state||{};const ui=global.OmegaCabinetUI||{};const m=ui.currentInterrogatedMinister||ui.currentMinister||ui.activeMinister||global.OmegaMinisterState?.activeMinister||{};return Object.assign({countryId:gs.countryCode||gs.countryId||gs.playerCountryId||ui.activeCountry||'',countryName:gs.countryName||gs.country?.name||ui.activeCountry||'',ministerId:m.id||ui.currentMinisterId||'',ministerName:m.name||m.displayName||'',ministerRole:m.role||m.title||'',ministryId:m.ministryId||ui.currentMinistryId||'',gameState:gs},ctxState,extra&&typeof extra==='object'?extra:{})}
function remember(role,content,meta){history.push({role,content:text(content).slice(0,MAX_INPUT),timestamp:Date.now(),metadata:clone(meta)});history=history.slice(-MAX_HISTORY);save();}
function validate(){const v=SOURCE_DATA['offline_language_vocabulary.json'],o=SOURCE_DATA['omega_game_language_ontology.json'],i=SOURCE_DATA['omega_game_language_source_inventory.json'],l=SOURCE_DATA['offline_lexicon.json'];if(!v?.languages?.en||!v?.languages?.bn)throw Error('BILINGUAL_VOCABULARY_MISSING');if(o.canonical_concept_target!==4500)throw Error('ONTOLOGY_TARGET_CHANGED');if(o.operational_rules?.unknown_entity!=='UNRESOLVED')throw Error('UNKNOWN_ENTITY_POLICY_CHANGED');if(o.operational_rules?.ambiguous_entity!=='ASK_OR_REPORT_AMBIGUITY')throw Error('AMBIGUITY_POLICY_CHANGED');if(o.operational_rules?.unknown_fact!=='UNKNOWN_WHEN_NOT_EVIDENCED')throw Error('UNKNOWN_FACT_POLICY_CHANGED');if(i.source_concept_count!==17||i.raw_surface_entry_count!==332||i.unique_surface_entry_count!==226)throw Error('MIGRATION_INVENTORY_CHANGED');if(l.TOTAL_WORDS!==7756)throw Error('LEXICON_TOTAL_WORDS_CHANGED');return true}
function configure(o={}){if(Array.isArray(o.datasets))datasets=o.datasets.filter(x=>x&&typeof x==='object').slice(0,256);ctxState=Object.assign({},ctxState,o.context&&typeof o.context==='object'?o.context:{});const b=global.OfflineSemanticBrain;if(b?.configure)b.configure({datasets,vocabulary:SOURCE_DATA['offline_language_vocabulary.json'],lexicon:SOURCE_DATA['offline_lexicon.json'],semanticKnowledge:SOURCE_DATA['offline_semantic_knowledge.json'],ministers:o.ministers||[]});const bridge=global.OmegaGameLanguageBridge;if(bridge?.load)bridge.load(SOURCE_DATA['omega_game_language_ontology.json']);if(bridge?.install)bridge.install();history=restore();return diagnostics()}
function parse(q,c={}){const x=text(q).normalize('NFKC');if(x.length>MAX_INPUT)throw Error('OMEGA_LANGUAGE_INPUT_TOO_LARGE');const b=global.OfflineSemanticBrain;if(!b?.parse)throw Error('OMEGA_LANGUAGE_INTERNAL_PARSER_UNAVAILABLE');return Object.assign({},b.parse(x,context(c)),{standalone:true,version:BUILD.version,context:context(c)})}
function executeIntent(p,c={}){const e=global.OfflineQueryEngine;if(!e?.execute)throw Error('OMEGA_LANGUAGE_INTERNAL_QUERY_ENGINE_UNAVAILABLE');return e.execute(p,datasets,p?.language||langOf(p?.surface),context(c))}
function dispatchReasoning(q,p,r,c={}){const d=global.OmegaReasoningDispatcher;if(!d?.dispatch)return null;try{return d.dispatch(q,p,r,context(c))}catch(error){return {used:false,available:false,error:text(error.message)}}}
function realize(r,l='en'){if(r==null)return l==='bn'?'বর্তমান গেম ডেটা থেকে প্রমাণিত উত্তর পাওয়া যায়নি।':'No evidence-backed answer is available from the current game data.';if(typeof r==='string')return r;for(const k of ['answer','text','summary','response','result'])if(typeof r[k]==='string'&&r[k].trim())return r[k].trim();if(Array.isArray(r?.unknowns)&&r.unknowns.length)return l==='bn'?'তথ্যটি বর্তমান ডেটায় প্রমাণিত নয়।':'The requested fact is not evidenced by the current data.';return l==='bn'?'বর্তমান গেম ডেটা থেকে প্রামাণ্য উত্তর তৈরি করা যায়নি।':'An evidence-backed answer could not be produced from the current game data.'}
function sourceData(){return clone(SOURCE_DATA)}
function diagnostics(){return {version:BUILD.version,standalone:true,externalLanguageFileDependency:false,sourceFiles:BUILD.sourceFiles.slice(),sourceStringCount:BUILD.sourceStringCount,lexiconTotalWords:BUILD.lexiconTotalWords,sourceConceptCount:BUILD.sourceConceptCount,rawSurfaceEntryCount:BUILD.rawSurfaceEntryCount,uniqueSurfaceEntryCount:BUILD.uniqueSurfaceEntryCount,loadedDatasets:datasets.length,historyTurns:history.length,integrity:clone(BUILD)}}
async function run(q,c={}){validate();configure({context:c});const p=parse(q,c),r=executeIntent(p,c),reasoning=dispatchReasoning(q,p,r,c),answer=reasoning?.text||realize(r,p.language||langOf(q));remember('user',q,{operation:p.operation||p.intent});remember('assistant',answer,{operation:p.operation||p.intent});return {version:BUILD.version,answer,analysis:p,result:r,reasoning}}
function eventRequest(operation,payload={}){return Object.freeze({type:'GAME_EVENT_REQUEST',version:BUILD.version,state:'EVENT_REQUESTED',operation:text(operation).toUpperCase(),payload:clone(payload),createdAt:Date.now()})}
function learnPhrase(surface,mapping,confidence=0){const s=storage();if(!s||!surface||confidence<0.9)return false;try{const k='omega.language.standalone.learned.v1',m=JSON.parse(s.getItem(k)||'{}');m[text(surface)]={mapping:clone(mapping),confidence,updatedAt:Date.now()};s.setItem(k,JSON.stringify(m));return true}catch(_){return false}}
validate();history=restore();
global.OmegaLanguageSystem=Object.freeze({VERSION:BUILD.version,STATUS:'STANDALONE_READY',BUILD,SOURCE_MANIFEST:Object.freeze(BUILD.sourceFiles.reduce((m,f)=>(m[f]={path:f,role:'embedded'},m),{})),configure,parse,analyze:parse,resolve:x=>x,executeIntent,realize,run,dispatchReasoning,eventRequest,learnPhrase,sourceData,diagnostics,validate,get context(){return context()},setContext:x=>{ctxState=Object.assign({},ctxState,x&&typeof x==='object'?x:{});return context()},get history(){return clone(history)}});
})(typeof window!=='undefined'?window:globalThis);
`;
const out=`/* OMEGA LANGUAGE SYSTEM v4.0.0-STANDALONE\n * Exact migration bundle. All legacy language JSON data and language/runtime JS modules are embedded below.\n * Runtime rule: no legacy language file is fetched, imported, or dynamically loaded.\n */\n${moduleBlock}\n${wrapper}`;
fs.writeFileSync(path.join(root,'omega_language_system.js.tmp'),out,'utf8');
fs.renameSync(path.join(root,'omega_language_system.js.tmp'),path.join(root,'omega_language_system.js'));
console.log(JSON.stringify({ok:true,bundleBytes:Buffer.byteLength(out,'utf8'),sourceStringCount,sourceFiles:ALL,integrity:meta},null,2));
