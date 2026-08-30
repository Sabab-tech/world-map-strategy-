import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './minister_query_router.js';
const OfflineSemanticBrain = globalThis.OfflineSemanticBrain;
const OfflineQueryEngine = globalThis.OfflineQueryEngine;
const MinisterQueryRouter = globalThis.MinisterQueryRouter;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, 'index.html');
const AI_INTEGRITY_SCRIPT = '<script src="/omega_ai_integrity_layer.js"></script>';
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';
const MINISTER_RECRUITMENT_SCRIPT = '<script src="/minister_recruitment_engine.js"></script>';
let cachedResourceProfiles = {};
let resourceTypesRegistry = {};
const semanticDatasets = [];
try {
  for (const filename of ['resources.json', 'resources_2.json']) {
    const file = path.join(__dirname, filename);
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    semanticDatasets.push(raw);
    if (raw.resource_types) resourceTypesRegistry = { ...resourceTypesRegistry, ...raw.resource_types };
    if (raw.GSRSK_Master_CountryProfiles_v14?.countryProfiles) cachedResourceProfiles = { ...cachedResourceProfiles, ...raw.GSRSK_Master_CountryProfiles_v14.countryProfiles };
  }
  console.log(`[Server Resources DB] Indexed ${Object.keys(cachedResourceProfiles).length} sovereign profiles and ${Object.keys(resourceTypesRegistry).length} resource types.`);
} catch (e) { console.warn('[Server Resources DB] Load warning:', e.message); }
let languageVocabulary = {};
try { const file=path.join(__dirname,'offline_language_vocabulary.json'); if(fs.existsSync(file)) languageVocabulary=JSON.parse(fs.readFileSync(file,'utf8')); } catch(e){ console.warn('[Semantic Vocabulary] Load warning:',e.message); }
const semanticRuntime = OfflineSemanticBrain.configure({datasets:semanticDatasets,vocabulary:languageVocabulary});
console.log(`[Semantic Runtime] Indexed ${semanticRuntime.countries} runtime countries and ${semanticRuntime.resources} runtime resources.`);
let cachedEconomies={},cachedPopulations={},cachedMinisters={};
try {
  const eco=path.join(__dirname,'economy.json'),pop=path.join(__dirname,'population.json'),min=path.join(__dirname,'ministers.json');
  if(fs.existsSync(eco))cachedEconomies=JSON.parse(fs.readFileSync(eco,'utf8'));
  if(fs.existsSync(pop))cachedPopulations=JSON.parse(fs.readFileSync(pop,'utf8'));
  if(fs.existsSync(min))cachedMinisters=JSON.parse(fs.readFileSync(min,'utf8'));
} catch(e){ console.warn('[Server DB] Auxiliary dataset warning:',e.message); }
function resolveCountryResourceData(countryCode,countryName){const code=String(countryCode||'').trim().toUpperCase();if(code&&cachedResourceProfiles[code])return cachedResourceProfiles[code];const name=String(countryName||'').trim().toLowerCase();if(name){const match=Object.values(cachedResourceProfiles).find(p=>String(p.identity?.name||'').trim().toLowerCase()===name||String(p.identity?.officialName||'').trim().toLowerCase()===name);if(match)return match;}return {identity:{name:countryName||countryCode||'UNKNOWN',iso:code||'UNKNOWN'},hydrocarbon_resource_base:{},mineral_resource_base:{},strategic_resources:{},resource_dependency:{},processing_and_industrial_capacities:{},resource_infrastructure_context:{mineSites:[]}};}
function normalizeMinistryKey(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function ministryCategoryCandidates(ministryId){
  const target=normalizeMinistryKey(ministryId);
  const aliases={
    home_affairs:['home_affairs','interior_security','interior'], defense:['defense','military','national_defense'], foreign_affairs:['foreign_affairs','diplomacy','international_relations'],
    finance:['finance','treasury_finance','economy','central_bank'], trade:['trade','commerce'], production:['production','industry'], taxes:['taxes','revenue'],
    education:['education','science_research','education_ministry'], health_welfare:['health_welfare','health','welfare'], agriculture_food:['agriculture_food','agriculture'],
    environment:['environment','climate'], infrastructure:['infrastructure'], energy_mining:['energy_mining','energy','resources','mining'], intelligence_cyber:['intelligence_cyber','intelligence'],
    laws:['laws','justice'], labor:['labor','employment'], media:['media','information'], religion:['religion','religious_affairs'], mega_projects:['mega_projects','projects'], cabinet_council:['cabinet_council','cabinet']
  };
  for(const [canonical,list] of Object.entries(aliases)) if(list.includes(target)||target===canonical) return list;
  return [target];
}
function candidateName(candidate,countryCode){
  const regions=Object.keys(candidate.regional_names||{});
  const country=String(countryCode||'').toUpperCase();
  const regionHints={BGD:'south_asia',IND:'south_asia',PAK:'south_asia',NPL:'south_asia',LKA:'south_asia',CHN:'east_asia',JPN:'east_asia',KOR:'east_asia',USA:'western',CAN:'western',GBR:'western',DEU:'western',FRA:'western',RUS:'slavic'};
  const preferred=regionHints[country];
  return (preferred&&candidate.regional_names?.[preferred])||candidate.regional_names?.south_asia||candidate.regional_names?.western||candidate.name||candidate.id;
}
function ministerCandidates(ministryId,countryCode){
  const db=cachedMinisters?.ministers_database;
  if(!db)return [];
  const possible=ministryCategoryCandidates(ministryId);
  let sourceKey=Object.keys(db).find(k=>possible.includes(normalizeMinistryKey(k)))||Object.keys(db).find(k=>possible.includes(normalizeMinistryKey(k).replace(/_ministry$/,'')));
  if(!sourceKey){
    const exact=normalizeMinistryKey(ministryId);
    sourceKey=Object.keys(db).find(k=>normalizeMinistryKey(k)===exact);
  }
  const list=Array.isArray(db[sourceKey])?db[sourceKey]:[];
  return list.slice(0,5).map(m=>({...m,displayName:candidateName(m,countryCode),ministryCategory:sourceKey}));
}
const app=express();const PORT=3000;app.use(express.json({limit:'10mb'}));
function renderIndex(res,next){fs.readFile(INDEX_PATH,'utf8',(err,html)=>{if(err)return next(err);let output=html;if(!output.includes('/omega_ai_integrity_layer.js'))output=output.replace('</body>',`    ${AI_INTEGRITY_SCRIPT}\n</body>`);if(!output.includes('/health-ministry-logo.js'))output=output.replace('</body>',`    ${HEALTH_LOGO_SCRIPT}\n</body>`);if(!output.includes('/minister_recruitment_engine.js'))output=output.replace('</body>',`    ${MINISTER_RECRUITMENT_SCRIPT}\n</body>`);res.type('html').send(output);});}
app.get('/',(req,res,next)=>renderIndex(res,next));app.get('/index.html',(req,res,next)=>renderIndex(res,next));app.use(express.static(__dirname,{index:false}));
app.get('/api/minister-candidates',(req,res)=>{try{const ministryId=String(req.query.ministryId||'').trim();const countryCode=String(req.query.countryCode||'').trim().toUpperCase();if(!ministryId)return res.status(400).json({ok:false,error:'ministryId is required'});const candidates=ministerCandidates(ministryId,countryCode);if(candidates.length!==5)return res.status(404).json({ok:false,error:`No complete five-candidate roster for ${ministryId}`,candidateCount:candidates.length,required:5});res.json({ok:true,ministryId,countryCode,candidates,source:'ministers.json',count:candidates.length});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.get('/api/ai/status',(req,res)=>{const hasKey=!!process.env.GEMINI_API_KEY;res.json({ok:true,aiAvailable:hasKey,models:['gemini-3.1-flash-lite','gemini-3.7-flash','gemini-3.1-pro-preview','gemini-flash-latest'],primaryModel:'gemini-3.1-flash-lite',integrityLayer:'2.0.0',semanticRuntime,timestamp:new Date().toISOString()});});
app.post('/api/ai/semantic-query',(req,res)=>{try{const{prompt,language,countryId,resourceId}=req.body||{};if(!prompt||typeof prompt!=='string')return res.status(400).json({ok:false,error:'Prompt is required'});const parsed=OfflineSemanticBrain.parse(prompt,{countryId,resourceId});const result=OfflineQueryEngine.execute(parsed,semanticDatasets,language==='bn'||parsed.language==='bn'?'bn':'en');return res.json({ok:true,semantic:OfflineSemanticBrain.explain(parsed),result});}catch(err){return res.status(500).json({ok:false,error:err.message||'Semantic query failed'});}});
let aiClient=null;function getAI(){if(!aiClient&&process.env.GEMINI_API_KEY)aiClient=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{headers:{'User-Agent':'aistudio-build'}}});return aiClient;}
const CANDIDATE_MODELS=['gemini-3.1-flash-lite','gemini-3.7-flash','gemini-3.1-pro-preview','gemini-flash-latest'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function generateWithFallback(ai,options){let lastError=null;for(const model of CANDIDATE_MODELS)for(let attempt=1;attempt<=2;attempt++){try{const response=await ai.models.generateContent({model,contents:options.contents,config:options.config});if(response?.text)return{ok:true,model,text:response.text};}catch(err){lastError=err;const transient=/503|429|high demand|UNAVAILABLE/i.test(err.message||'');if(transient&&attempt===1){await sleep(350+Math.random()*200);continue;}break;}}throw lastError||new Error('All Gemini model candidates temporarily unavailable');}
function findMinisterProfile(ministerId,ministerName){const db=cachedMinisters?.ministers_database;if(!db)return null;for(const category of Object.values(db))if(Array.isArray(category)){const found=category.find(m=>m.id===ministerId||(m.regional_names&&ministerName&&Object.values(m.regional_names).includes(ministerName)));if(found)return found;}return null;}
function evidenceConfidence({routing,identityResolved,dossierFields,profileResolved}){const routingScore=Math.max(0,Math.min(1,Number(routing?.confidence??0))),dataScore=Math.max(0,Math.min(1,dossierFields)),identityScore=identityResolved?1:.25,profileScore=profileResolved?1:.35;return Number((100*(.25*routingScore+.35*dataScore+.25*identityScore+.15*profileScore)).toFixed(1));}
app.post('/api/ai/minister-consult',async(req,res)=>{try{const{ministerId,ministerName,ministerRole,ministryId,countryName,countryCode,prompt,language,gameState,reservesData}=req.body;if(!prompt||typeof prompt!=='string')return res.status(400).json({ok:false,error:'Prompt is required'});const identity={ministerId:String(ministerId||'').trim(),ministerName:String(ministerName||'').trim(),ministerRole:String(ministerRole||'').trim(),ministryId:String(ministryId||'').trim(),countryName:String(countryName||'').trim(),countryCode:String(countryCode||'').trim().toUpperCase()};const semantic=OfflineSemanticBrain.parse(prompt,{countryId:identity.countryCode});const offlineResult=OfflineQueryEngine.execute(semantic,semanticDatasets,language==='bn'||semantic.language==='bn'?'bn':'en');const profile=findMinisterProfile(identity.ministerId,identity.ministerName);const ai=getAI();if(!ai)return res.json({ok:true,aiPowered:false,mode:'OFFLINE_GROUNDED',text:offlineResult.text,semantic:OfflineSemanticBrain.explain(semantic),result:offlineResult,identity,grounding:{runtimeDatasets:semanticRuntime,policy:'NO_UNGROUNDED_DEFAULTS'}});const isBn=language==='bn'||semantic.language==='bn';const routing=MinisterQueryRouter.routeMinisterQuery(prompt,{ministryId:identity.ministryId,ministerId:identity.ministerId,ministerName:identity.ministerName,ministerRole:identity.ministerRole},{countryName:identity.countryName,countryCode:identity.countryCode});const resourceProfile=resolveCountryResourceData(identity.countryCode,identity.countryName),eco=cachedEconomies[identity.countryCode]||{},pop=cachedPopulations[identity.countryCode]||{},telemetry=reservesData||gameState||{};const dossier={minister:{id:identity.ministerId||'UNKNOWN',name:identity.ministerName||'UNKNOWN',role:identity.ministerRole||'UNKNOWN',ministryId:identity.ministryId||'UNKNOWN',profileFound:!!profile,profile:profile||{}},country:{name:identity.countryName||'UNKNOWN',iso:identity.countryCode||'UNKNOWN'},semanticQuery:semantic,routing:{intent:routing.intent,domain:routing.domain,entities:routing.entities||[],requiredData:routing.requiredData||[]},resources:{hydrocarbons:resourceProfile.hydrocarbon_resource_base||{},minerals:resourceProfile.mineral_resource_base||{},strategic:resourceProfile.strategic_resources||{},dependency:resourceProfile.resource_dependency||{},processing:resourceProfile.processing_and_industrial_capacities||{},mineSites:resourceProfile.resource_infrastructure_context?.mineSites||[]},economy:eco,population:pop,liveTelemetry:telemetry};const dossierText=JSON.stringify(dossier,null,2),dossierFields=Object.values(dossier).filter(v=>v&&typeof v==='object'&&Object.keys(v).length).length/8,confidence=evidenceConfidence({routing,identityResolved:!!identity.ministerId&&!!identity.ministerName&&!!identity.countryCode,dossierFields,profileResolved:!!profile});const systemInstruction=`You are the minister identified in the canonical identity record. Answer the actual question. The semantic query is authoritative for entity interpretation. Never invent a country, resource, quantity, mine, reserve, identity or event. Only dataset values or deterministic calculations may be presented as facts. Separate fact, calculation, inference and recommendation. If data is missing, say UNKNOWN. Respond in ${isBn?'standard Bengali':'English'}.`;const userContent=`CANONICAL IDENTITY:\n${JSON.stringify(identity,null,2)}\n\nSEMANTIC QUERY:\n${JSON.stringify(semantic,null,2)}\n\nOFFLINE GROUNDED RESULT:\n${JSON.stringify(offlineResult,null,2)}\n\nEXECUTIVE INTELLIGENCE DOSSIER:\n${dossierText}\n\nEXECUTIVE COMMANDER QUESTION:\n${prompt}`;const result=await generateWithFallback(ai,{contents:userContent,config:{systemInstruction,temperature:.35,topP:.9}});return res.json({ok:true,aiPowered:true,model:result.model,text:result.text||'',confidence,semantic:OfflineSemanticBrain.explain(semantic),result:offlineResult,intent:routing.intent,domain:routing.domain,identity,grounding:{dossierFields:Number(dossierFields.toFixed(3)),profileResolved:!!profile,runtimeDatasets:semanticRuntime,policy:'NO_UNGROUNDED_DEFAULTS'},status:'GEMINI_GROUNDED_SEMANTIC_SYNTHESIS'});}catch(err){console.warn('[AI consultation error]:',err.message||err);return res.json({ok:false,aiPowered:false,error:err.message||'Error generating AI response'});}});
app.post('/api/ai/generate',async(req,res)=>{try{const{prompt,systemInstruction}=req.body;if(!prompt)return res.status(400).json({ok:false,error:'Prompt is required'});const ai=getAI();if(!ai)return res.json({ok:false,aiPowered:false,reason:'NO_API_KEY'});const result=await generateWithFallback(ai,{contents:prompt,config:{systemInstruction:systemInstruction||'You are a sovereign strategic advisor. Do not invent facts not present in supplied state.',temperature:.35}});return res.json({ok:true,aiPowered:true,model:result.model,text:result.text||''});}catch(err){console.warn('[Gemini general generate error]:',err.message||err);return res.json({ok:false,aiPowered:false,error:err.message||'AI generation failed'});}});
app.use((req,res,next)=>{if(req.method!=='GET')return next();renderIndex(res,next);});
app.listen(PORT,'0.0.0.0',()=>console.log(`Server running on http://0.0.0.0:${PORT}`));
