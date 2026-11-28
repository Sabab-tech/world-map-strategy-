import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const simulation=fs.readFileSync(new URL('../omega_simulation_runtime.js',import.meta.url),'utf8');
const industrial=fs.readFileSync(new URL('../omega_resource_industrial_network_v1.js',import.meta.url),'utf8');
const economy=fs.readFileSync(new URL('../omega_resource_economy_runtime_v2.js',import.meta.url),'utf8');

test('industrial period execution is idempotent and cannot replay a completed production journal',async()=>{
  const periodRunner=industrial.slice(industrial.indexOf('function runCountryTurn(countryValue,options={})'),
    industrial.indexOf('function reserveBatchesForCommitment'));
  assert.match(periodRunner,/network\.industrialProductionPeriods\[periodId\]/);
  assert.match(periodRunner,/existing\?\.status==='COMPLETED'/);
  assert.match(periodRunner,/status:'RECOVERY_REQUIRED'/);
  assert.match(periodRunner,/status:'EXECUTED'/);
  assert.match(periodRunner,/countryTurnRuns\.delete\(key\)/);
  assert.match(periodRunner,/activeIndustrialProductionPeriod=periodExecution/);
  assert.ok(periodRunner.indexOf('try{') < periodRunner.indexOf('network=netState(cid)'),
    'journal setup must be covered by the period-context cleanup');
  assert.ok(periodRunner.includes('finally{'));
  assert.ok(periodRunner.includes('activeIndustrialProductionPeriod=previousContext;'));
});

test('period reconciliation requires exact finished-goods ledger, processed-warehouse receipt, batch and inventory lot agreement',()=>{
  const reconciler=industrial.slice(industrial.indexOf('function reconcileProductionPeriod'),
    industrial.indexOf('function reserveBatchesForCommitment'));
  for(const token of [
    'industrialProductionPeriods','finishedGoodsLedger','processedWarehouse','receipts',
    'productionPeriodId','inventoryLedger','storedBatchIds','inventoryLots',
    'INDUSTRIAL_PERIOD_LEDGER_RECEIPT_COUNT_MISMATCH',
    'INDUSTRIAL_PERIOD_BATCH_WAREHOUSE_STATE_MISMATCH',
    'INDUSTRIAL_PERIOD_LEDGER_RECEIPT_QUANTITY_MISMATCH'
  ]) assert.ok(reconciler.includes(token),'missing reconciliation contract: '+token);
  const recovery=industrial.slice(industrial.indexOf('function markProductionPeriodRecovery'),
    industrial.indexOf('function reconcileProductionPeriod'));
  assert.ok(recovery.includes("status:'RECOVERY_REQUIRED'"),
    'reconciliation failures must persist a retryable industrial journal state');
});

test('factory construction progress is guarded once per stable industrial production period',()=>{
  const start=industrial.indexOf('function advanceProjects(c,options={})');
  const end=industrial.indexOf('function ',start+20);
  const block=industrial.slice(start,end>start?end:start+12000);
  assert.ok(block.includes('p.lastProgressPeriodId===activePeriodId'));
  assert.ok(block.includes('p.lastProgressPeriodId=activePeriodId'));
});

test('historical industrial date and cycle due checks use the active period, not the live clock turn',()=>{
  const due=industrial.slice(industrial.indexOf('function factoryCycleDue(cycle)'),industrial.indexOf('function startFactoryProductionCycle'));
  assert.ok(due.includes('const currentTurn=turn();'));
  assert.ok(!due.includes('num(clock?.turn)'));
  assert.ok(industrial.includes('startEpoch+period.turn*stepMs'));
});

test('industrial catch-up uses the existing resources/industrial/fiscal checkpoint authority',()=>{
  assert.ok(simulation.includes("ECONOMY_PHASE_DOMAINS=new Set(['resources','industrial','fiscal'])"));
  assert.ok(economy.includes("domain:'industrial',countryId:cid,sessionId"));
  assert.ok(economy.includes("phase:'INDUSTRIAL_PRODUCTION'"));
  assert.ok(economy.includes("runCheckpointedIndustrialProduction(context?.countryId||cid,industrial,{throughTurn:context.periodTurn})"));
  assert.ok(economy.includes("industrial.markProductionPeriodRecovery(cid,periodId"));
  assert.ok(economy.indexOf("runCheckpointedResourceExtraction(context?.countryId||cid,endowment,{throughTurn:context.periodTurn})") <
    economy.indexOf("runCheckpointedIndustrialProduction(context?.countryId||cid,industrial,{throughTurn:context.periodTurn})"));
});
