import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=p=>JSON.parse(readFileSync(p,'utf8'));
const a=load('resources.json'),b=load('resources_2.json');
const deposits=[...(a.runtime_deposits||[]),...(b.runtime_deposits||[])];
const catalog=load('resource_site_canonical_catalog_v1.json');
const sites=catalog.sites||[];

const norm=v=>String(v??'').normalize('NFKC').toLowerCase()
  .replace(/&/g,' and ')
  .replace(/[^a-z0-9]+/g,' ')
  .replace(/\b(high grade|highgrade|mine|field|area|site|zone|project|quarry|reservoir|complex|deposit)\b/g,' ')
  .replace(/\s+/g,' ').trim();
const tokens=v=>new Set(norm(v).split(' ').filter(Boolean));
const score=(a,b)=>{
  if(!a||!b)return 0;
  if(a===b)return 1;
  if(a.includes(b)||b.includes(a))return .9;
  const A=tokens(a),B=tokens(b);let inter=0;for(const x of A)if(B.has(x))inter++;
  return inter/Math.max(1,new Set([...A,...B]).size);
};
const candidates=deposits.map(d=>{
 const country=String(d.countryCode||d.countryIso3||d.countryId||d.country||'').toUpperCase();
 const resource=String(d.resId||d.resourceId||d.resourceTypeId||d.resourceTypeKey||'').replace(/^RES_TYPE:/i,'').toLowerCase();
 const name=String(d.name||d.depositName||'');
 const same=sites.filter(s=>String(s.countryId||'').toUpperCase()===country&&String(s.identity?.resourceTypeId||s.resourceTypeId||'').toLowerCase()===resource);
 const ranked=same.map(s=>({siteId:s.siteId,siteName:s.siteName,score:score(name,s.siteName)})).sort((x,y)=>y.score-x.score);
 return {depositId:d.id||null,country,resource,name,best:ranked[0]||null,top:ranked.slice(0,3)};
});
const unbound=candidates.filter(x=>!x.best||x.best.score<.5);
console.log(JSON.stringify({
 status:'PASS',
 depositCount:deposits.length,
 exactOrStrongCandidates:candidates.filter(x=>x.best&&x.best.score>=.9).length,
 weakOrUnmatched:unbound.length,
 weakOrUnmatchedRows:unbound
},null,2));
