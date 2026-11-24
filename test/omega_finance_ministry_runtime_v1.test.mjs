  assert.ok(Math.abs(current.nationalReserve.balanceUsd-expectedSurplus*0.2)<1,
    'the NPC must earmark exactly 20% of positive reconciled operating surplus');
  assert.equal(current.nationalReserve.contributionPctOfOperatingSurplus,20);
  assert.equal(current.nationalReserve.borrowingProceedsExcluded,true);
  assert.ok(Math.abs(financeBucket.available-current.treasuryBalanceUsd)<0.01,
    'earmarking reserve must not create cash or debit Treasury a second time');

  const beforeDuplicate=current.nationalReserve.balanceUsd;
  const duplicate=finance.advanceCountry(npc.iso3,{turn:2,stepDurationMs:0.001,tier:'MACRO',playerCountryId:'BGD'});
  assert.equal(duplicate.duplicate,true);
  assert.equal(finance.getFinanceState(npc.iso3).nationalReserve.balanceUsd,beforeDuplicate,
    'reprocessing a committed country turn must not add reserve twice');

  context.__OMEGA_SIMULATION_PIPELINE_ACTIVE__=true;
  context.Omega.Simulation.stepInProgress=true;
  current=finance.getFinanceState(npc.iso3);
  const treasury=current.treasuryBalanceUsd;
  const reserve=current.nationalReserve.balanceUsd;
  let liveModel=financeBucket.omegaFinance;
  liveModel.fiscalModel.annualSpendingUsd=Math.max(treasury*2,1);
  liveModel.allocations.interior.sharePct=100;
  const blockedAmount=Math.min(treasury,Math.max(1,treasury-reserve+1));
  const blocked=finance.applySimulationAction({type:'spend-budget',countryId:npc.iso3,department:'interior',
    amountUsd:blockedAmount,spendType:'general',description:'OMEGA_HOME_BUDGET: reserve protection test'});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.code,'MINIMUM_RESERVE_FLOOR',
    'ordinary NPC government expenditure may not consume the earmarked national reserve');

  liveModel=financeBucket.omegaFinance;
  liveModel.allocations.emergency_reserve=liveModel.allocations.emergency_reserve||{department:'emergency_reserve',spentUsd:0};
  liveModel.allocations.emergency_reserve.sharePct=100;
  const emergencyAmount=Math.min(treasury,Math.max(1,treasury-reserve+100));
  const emergency=finance.applySimulationAction({type:'spend-budget',countryId:npc.iso3,department:'emergency_reserve',
    amountUsd:emergencyAmount,spendType:'emergency',description:'OMEGA_EMERGENCY_RESERVE: authorized emergency test'});
  assert.equal(emergency.ok,true,JSON.stringify(emergency));
  current=finance.getFinanceState(npc.iso3);
  assert.ok(current.nationalReserve.balanceUsd<=current.treasuryBalanceUsd+0.01,
    'an authorized emergency may draw down reserve but may not leave an unfunded reserve balance');
});