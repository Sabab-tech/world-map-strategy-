#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=process.cwd();
const load=p=>vm.runInThisContext(fs.readFileSync(path.join(root,p),'utf8'),{filename:p});
load('omega_resource_truth_contract.js');
const C=globalThis.OmegaResourceTruthContract;
const fail=[]; const ok=(v,m)=>{if(!v)fail.push(m)};
ok(C?.VERSION==='1.0.0','CONTRACT_VERSION');
for(const b of C.MEASUREMENT_BASIS)ok(C.isBasis(b),'BASIS:'+b);
const observed=C.measurement(100,{unit:'TONNES',measurementBasis:'MINERAL_RESERVE',commodity:'GOLD',authority:'OBSERVED',sourceDatasetId:'TEST',sourcePath:'x',sourceRecordId:'R1'});
const sim=C.measurement(900,{unit:'TONNES',measurementBasis:'MINERAL_RESERVE',commodity:'GOLD',authority:'SIMULATED',sourceDatasetId:'SCENARIO',sourcePath:'s',sourceRecordId:'S1'});
const resolved=C.resolveQuantity([sim,observed],{expectedCommodity:'GOLD',allowedBases:['MINERAL_RESERVE']});
ok(resolved.authority==='OBSERVED'&&resolved.measurement.quantity===100,'OBSERVED_PRECEDENCE');
const incompatible=C.resolveQuantity([{quantity:10,unit:'BBL',measurementBasis:'PETROLEUM_RESERVE',commodity:'OIL',authority:'OBSERVED',sourceDatasetId:'x'}],{expectedCommodity:'GOLD',allowedBases:['MINERAL_RESERVE']});
ok(incompatible.status==='FAIL_CLOSED','INCOMPATIBLE_FAIL_CLOSED');
const missing=C.resolveQuantity([{quantity:null,authority:'UNOBSERVED'}]);
ok(missing.status==='UNOBSERVED','MISSING_IS_UNOBSERVED');
const identity=C.assertSiteIdentity({siteId:'SITE_X',countryId:'BGD',resourceId:'coal',siteName:'X'});
ok(identity.valid,'SITE_IDENTITY');
const p=C.provenance('dataset','path','record','OBSERVED','2026-01-01');
ok(p.sourceDatasetId==='dataset'&&p.sourcePath==='path'&&p.sourceRecordId==='record'&&p.sourceAuthority==='OBSERVED','FIELD_PROVENANCE');
if(fail.length){console.error(JSON.stringify({status:'INCOMPLETE',failures:fail},null,2));process.exit(1);}
console.log('RESOURCE TRUTH CONTRACT TEST PASSED');
