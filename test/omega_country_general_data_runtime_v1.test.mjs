import assert from 'node:assert/strict';
import { test } from 'node:test';

const metricFields = [
  'populationTotal','gdpCurrentUsd','exportsUsd','importsUsd','budgetBalancePctGdp',
  'publicDebtToGdpPct','inflationPct','gdpGrowthPct','militaryExpenditurePctGdp',
  'internetUsersPct','electricityAccessPct','rAndDSpendPctGdp','educationSpendPctGdp',
  'politicalStabilityWgiEstimate','voiceAccountabilityWgiEstimate','unemploymentRatePct',
  'homicideRatePer100k','industryValueAddedPctGdp','agricultureValueAddedPctGdp'
];
const identityFields=['iso2','iso3','name','officialName','continent','subregion','latitude','longitude'];
const generalFactFields=['capital','languages','currencies','area','landlocked','borders','timeZones','unMember','worldBankRegion','worldBankIncomeLevel','worldBankLendingType'];
const schema={encoding:'ORDERED_VALUE_ARRAYS_V1',identityFields,generalFactFields,factSourceStatusFields:[],metricFields,
  metricProvenanceFields:['years','statusCodes','sourceCodes','sourceNameCodes','methodCodes','sourceUrls','notes'],
  legacySnapshotFields:[],naturalResourceFields:[],mineralResourceFields:[],hydrocarbonResourceFields:[],energyResourceFields:[],
  publicSafetyFields:[],policeBaselineFields:[],observedHomicideFields:[],crimeFields:[],fleetSummaryFields:[],countryContextFields:[],environmentMixFields:[],
  localGeographyFields:['majorCityCount','economicHubCount','economicCenters'],dataStatusFields:[]};
const alpha={populationTotal:100000000,gdpCurrentUsd:500000000000,exportsUsd:200000000000,importsUsd:200000000000,
  budgetBalancePctGdp:2,publicDebtToGdpPct:30,inflationPct:2,gdpGrowthPct:4,militaryExpenditurePctGdp:3,
  internetUsersPct:90,electricityAccessPct:99,rAndDSpendPctGdp:3,educationSpendPctGdp:5,
  politicalStabilityWgiEstimate:1.3,voiceAccountabilityWgiEstimate:1,unemploymentRatePct:4,homicideRatePer100k:1,
  industryValueAddedPctGdp:25,agricultureValueAddedPctGdp:5};
const beta={populationTotal:30000000,gdpCurrentUsd:50000000000,exportsUsd:2000000000,importsUsd:20000000000,
  budgetBalancePctGdp:-8,publicDebtToGdpPct:110,inflationPct:20,gdpGrowthPct:-2,militaryExpenditurePctGdp:0.5,
  internetUsersPct:25,electricityAccessPct:60,rAndDSpendPctGdp:0.2,educationSpendPctGdp:2,
  politicalStabilityWgiEstimate:-1.5,voiceAccountabilityWgiEstimate:-1,unemploymentRatePct:20,homicideRatePer100k:20,
  industryValueAddedPctGdp:15,agricultureValueAddedPctGdp:30};
function countryRow(iso2,iso3,name,metrics){
 const facts={capital:name+' Capital',languages:['Test language'],currencies:['TST'],area:12345,landlocked:false,borders:[],timeZones:['UTC+0'],unMember:true,worldBankRegion:'Test Region',worldBankIncomeLevel:'Test Income',worldBankLendingType:'Test Lending'};
 return{identity:[iso2,iso3,name,'Republic of '+name,'Test Continent','Test Subregion',1,2],
  generalFacts:generalFactFields.map(k=>facts[k]??null),metrics:metricFields.map(k=>metrics[k]??null),
  metricMetadata:{years:metricFields.map(k=>metrics[k]===undefined?null:2022),statusCodes:metricFields.map(k=>metrics[k]===undefined?-1:0),
   sourceCodes:metricFields.map(()=>0),sourceNameCodes:metricFields.map(()=>0),methodCodes:metricFields.map(()=>0),
   sourceUrls:metricFields.map(()=>null),notes:metricFields.map(()=>null)},
  legacySnapshots:[],naturalResources:[],publicSafety:[],localGeography:[8,3,[[name+' City','fixture city record']]],dataStatus:[]};
}
const fixture={metadata:{schemaVersion:'1.0.0',datasetId:'OMEGA_COUNTRY_GENERAL_DATA_REGISTRY_V1',countryAndTerritoryCount:2,recordSchema:schema,
 provenanceEncoding:{statuses:['WORLD_BANK_API_OBSERVATION'],sourceIds:['WORLD_BANK_WDI'],sourceNames:['Fixture source'],methods:['SOURCE_OBSERVATION'],missingCode:-1}},
 fieldCatalogue:metricFields.map(key=>({key,name:key,unit:key.includes('Pct')?'%':'source units'})),countries:[countryRow('AA','AAA','Alpha',alpha),countryRow('BB','BBB','Beta',beta)]};
globalThis.fetch=async()=>({ok:true,json:async()=>fixture});
await import('../omega_country_general_data_runtime_v1.js');
const runtime=globalThis.OmegaCountryGeneralDataRuntime;

test('shared registry decoding keeps identity, provenance, metrics and geography',async()=>{
 assert.equal(await runtime.init(),true);assert.equal(runtime.diagnostics().recordCount,2);
 const a=runtime.getCountryRecord('AAA');assert.equal(a.identity.name,'Alpha');assert.equal(a.generalFacts.capital,'Alpha Capital');
 assert.equal(a.metrics.gdpCurrentUsd,500000000000);assert.equal(a.metricMetadata.gdpCurrentUsd.year,2022);
 assert.deepEqual(a.localGeography.economicCenters,[{name:'Alpha City',description:'fixture city record'}]);
 assert.equal(runtime.getCountryRecord('BBB').metrics.populationTotal,30000000);assert.equal(runtime.getCountryRecord('MISSING'),null);
});
test('country traits are derived from data and change opponent action scoring',async()=>{
 globalThis.OmegaCanonicalIdentityRegistry={resolveCountry:v=>({id:String(v||'').toUpperCase(),raw:{}}),list:()=>[{id:'AAA'},{id:'BBB'}]};
 await import('../omega_opponent_adaptive_strategy_system.js');
 const strategy=globalThis.OmegaOpponentAdaptiveStrategy,a=runtime.getBehaviorProfile('AAA'),b=runtime.getBehaviorProfile('BBB');
 assert.equal(a.availability,'DERIVED');assert.equal(b.availability,'DERIVED');
 assert.ok(a.dimensions.innovationPreference.value>b.dimensions.innovationPreference.value);
 assert.ok(a.dimensions.fiscalDiscipline.value>b.dimensions.fiscalDiscipline.value);
 assert.ok(a.dimensions.tradeDependence.value>b.dimensions.tradeDependence.value);
 assert.equal(strategy.profile('AAA').dimensions.innovationPreference.availability,'DERIVED_HEURISTIC');
 const scoreA=strategy.scoreAction('AAA','EFFICIENCY'),scoreB=strategy.scoreAction('BBB','EFFICIENCY');
 assert.equal(scoreA.known,true);assert.equal(scoreB.known,true);assert.ok(scoreA.score>scoreB.score);
});
