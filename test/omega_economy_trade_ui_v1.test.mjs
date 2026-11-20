import test from 'node:test';
import assert from 'node:assert/strict';

import '../omega_ui_v2/screens/economy.js';
import '../omega_ui_v2/screens/ministry-detail.js';

function installCountryRuntime() {
  globalThis.OmegaCountryRuntimeData = {
    resolveCountry(value) {
      const code = String(value || '').trim().toUpperCase();
      const profiles = {
        BGD:{ iso3:'BGD', countryCode:'BD', name:'Bangladesh', economyKey:'BANGLADESH' },
        IND:{ iso3:'IND', countryCode:'IN', name:'India' },
        CHN:{ iso3:'CHN', countryCode:'CN', name:'China' },
        USA:{ iso3:'USA', countryCode:'US', name:'United States' }
      };
      return profiles[code] || (code === 'BANGLADESH' || code === 'BD' ? profiles.BGD : null);
    }
  };
}
function installEconomyFixture() {
  installCountryRuntime();
  globalThis.Game = { state:{
    simulation:{ turn:42 },
    finance:{ BGD:{ available:250000, reserves:125000, currencyCode:'BDT', ledger:[] } },
    economy:{ BGD:{ currencyCode:'BDT' } },
    governmentBanking:{ accountsByCountry:{
      BGD:{ homeCurrencyCode:'BDT', accounts:{
        BDT:{ currencyCode:'BDT', currencyName:'Bangladeshi Taka', balance:450000, source:'GAME_LEDGER', lastUpdatedTurn:41 },
        USD:{ currencyCode:'USD', currencyName:'US Dollar', balance:1250, source:'GAME_LEDGER', lastUpdatedTurn:40 }
      } }
    } },
    trade:{ BGD:{ globalTradeLedger:{ settlements:[
      { settlementId:'SET-IMPORT-1', status:'SETTLED', buyerCountryId:'BGD', sellerCountryId:'IND', buyerValue:10000, buyerCurrency:'BDT', resourceId:'coal', turn:40 },
      { settlementId:'SET-IMPORT-1', status:'SETTLED', buyerCountryId:'BGD', sellerCountryId:'IND', buyerValue:10000, buyerCurrency:'BDT', resourceId:'coal', turn:40 },
      { settlementId:'SET-EXPORT-1', status:'SETTLED', buyerCountryId:'CHN', sellerCountryId:'BGD', sellerValue:5000, sellerCurrency:'BDT', resourceId:'steel', turn:41 },
      { settlementId:'SET-PENDING', status:'ACCEPTED', buyerCountryId:'BGD', sellerCountryId:'USA', buyerValue:90000, buyerCurrency:'BDT', resourceId:'oil' }
    ] } } }
  } };
  globalThis.OmegaForexMonetaryEngine = {
    getRate(code, source) {
      assert.equal(source,'SIMULATION');
      return String(code).toUpperCase() === 'BDT' ? 120
        : String(code).toUpperCase() === 'USD' ? 1 : null;
    }
  };
  globalThis.OmegaCountryDataGateway = {
    getSnapshotForView(country) {
      assert.equal(country,'BGD');
      return {
        fields:{
          reserves:{ status:'AVAILABLE', value:5000000, unit:'USD', year:2025, sourceName:'FX reserve baseline' },
          tradeBalance:{ status:'AVAILABLE', value:-500000, unit:'USD', year:2025, sourceName:'National accounts baseline' },
          gdp:{ status:'AVAILABLE', value:450000000000, unit:'USD', year:2025, sourceName:'GDP baseline' },
          gdpGrowth:{ status:'AVAILABLE', value:5.2, unit:'%', year:2025, sourceName:'GDP baseline' },
          inflation:{ status:'AVAILABLE', value:7.1, unit:'%', year:2025, sourceName:'CPI baseline' },
          debt:{ status:'AVAILABLE', value:170000000000, unit:'USD', year:2025, sourceName:'Debt baseline' },
          debtToGdpPct:{ status:'AVAILABLE', value:37.8, unit:'%', year:2025, sourceName:'Debt baseline' }
        },
        raw:{
          countryGeneralRecord:{
            datasetId:'COUNTRY_ECONOMIC_BASELINE',
            metrics:{ foreignDirectInvestmentUsd:1200000000, importDependencyPct:28, exportDependencyPct:21 },
            metricMetadata:{
              foreignDirectInvestmentUsd:{ unit:'USD', year:2025, sourceName:'FDI baseline' },
              importDependencyPct:{ unit:'%', year:2025, sourceName:'Import profile' },
              exportDependencyPct:{ unit:'%', year:2025, sourceName:'Export profile' }
            }
          },
          economy:{}
        }
      };
    }
  };
}
function cleanGlobals() {
  [
    'Game','gameState','Omega','OmegaCountryRuntimeData','OmegaMinistryViewCountry',
    'OmegaForexMonetaryEngine','OmegaCountryDataGateway','OmegaBilateralTradeAgreementV1',
    'OmegaUIV2Government','OmegaUIV2MinistryVisualRegistry','OmegaBlackMarketUI',
    'OmegaResourceCommandCenterUI'
  ].forEach(key => { delete globalThis[key]; });
}

test('Economy Overview keeps Treasury cash, domestic currency and FX reserves separate', () => {
  cleanGlobals();
  installEconomyFixture();
  const model = globalThis.OmegaUIV2Economy.buildViewModel({ countryId:'BD' });

  assert.equal(model.countryId,'BGD');
  assert.equal(model.treasuryCash,250000, 'Finance available is USD Treasury cash');
  assert.equal(model.treasuryReserves,125000, 'the Finance reserve bucket remains separate');
  assert.equal(model.currencyCode,'BDT');
  assert.equal(model.domesticCurrencyBalance,450000);
  assert.equal(model.foreignAccounts.length,1);
  assert.equal(model.foreignAccounts[0].currencyCode,'USD');
  assert.equal(model.foreignAccountsUsd,1250);
  assert.equal(model.foreignExchangeReserves.value,5000000);
  assert.equal(model.foreignExchangeReserves.unit,'USD');
  assert.equal(model.foreignDirectInvestment.value,1200000000);
  assert.equal(model.importDependency.value,28);
  assert.equal(model.exportDependency.value,21);
  assert.equal(model.imports.value,10000, 'duplicate settlement IDs are counted once');
  assert.equal(model.exports.value,5000);
  assert.equal(model.tradeBalance.value,-5000, 'live settled trade is calculated from local-currency ledger rows');
  assert.equal(model.tradePosition,'Trade deficit');
  assert.equal(model.importPartner.countryId,'IND');
  assert.equal(model.exportPartner.countryId,'CHN');

  const root = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
  const rendered = globalThis.OmegaUIV2Economy.render(root,{ countryId:'BGD' });
  assert.equal(rendered.ok,true);
  assert.match(root.innerHTML,/Economy Overview/);
  assert.match(root.innerHTML,/Foreign-exchange reserves/);
  assert.match(root.innerHTML,/Trade Settlement/);
  assert.match(root.innerHTML,/Black Market/);
  assert.match(root.innerHTML,/Transactions/);
  assert.doesNotMatch(root.innerHTML,/<canvas|recharts|data-omega-v2-economy-tab/i);
  assert.match(root.innerHTML,/No baseline/, 'no historical percent change is invented');
});

test('trend display reports a percentage only when two actual historical points exist', () => {
  const down = globalThis.OmegaUIV2Economy.trendFor('treasuryCash',[
    { historyByMetric:{ treasuryCash:[100,90] } }
  ]);
  assert.equal(down.status,'DOWN');
  assert.equal(down.changePct,-10);

  const up = globalThis.OmegaUIV2Economy.trendFor('reserves',[
    { metricHistory:{ reserves:[200,250] } }
  ]);
  assert.equal(up.status,'UP');
  assert.equal(up.changePct,25);

  const unknown = globalThis.OmegaUIV2Economy.trendFor('treasuryCash',[{}]);
  assert.equal(unknown.status,'NO_BASELINE');
  assert.equal(unknown.changePct,null);
});

test('Trade Settlement reads only selected-country bilateral commitments and keeps totals currency-safe', () => {
  cleanGlobals();
  installCountryRuntime();
  globalThis.Game = { state:{ simulation:{turn:42}, trade:{
    BGD:{ bilateralContracts:[
      {
        agreementId:'BGD-IND-IMPORT-01', partnerCountryId:'IND', buyerCountryId:'BGD', sellerCountryId:'IND',
        role:'BUYER', resourceId:'crude_oil', status:'ACTIVE', quantityPerDelivery:100,
        unitPrice:50, currency:'BDT', priceModel:'FIXED', plannedDeliveryCount:12,
        completedDeliveries:4, nextDeliveryTurn:45, startTurn:10, durationTurns:100, intervalDays:30
      },
      {
        agreementId:'BGD-CHN-EXPORT-01', partnerCountryId:'CHN', buyerCountryId:'CHN', sellerCountryId:'BGD',
        role:'SELLER', resourceId:'steel', status:'AT_RISK', quantityPerDelivery:5,
        unitPrice:200, currency:'BDT', priceModel:'MARKET_LINKED', plannedDeliveryCount:8,
        completedDeliveries:6, nextDeliveryTurn:48, startTurn:20, durationTurns:80, intervalDays:15
      },
      {
        agreementId:'BGD-USA-CLOSED', partnerCountryId:'USA', buyerCountryId:'BGD', sellerCountryId:'USA',
        role:'BUYER', resourceId:'wheat', status:'TERMINATED', quantityPerDelivery:10,
        unitPrice:3, currency:'BDT', plannedDeliveryCount:10, completedDeliveries:0
      }
    ] },
    USA:{ bilateralContracts:[{
      agreementId:'USA-IND-PRIVATE', partnerCountryId:'IND', role:'BUYER', status:'ACTIVE',
      resourceId:'gold', quantityPerDelivery:1, unitPrice:500, plannedDeliveryCount:50
    }] }
  } } };
  const requestedCountries = [];
  globalThis.OmegaBilateralTradeAgreementV1 = {
    getContracts(country) {
      requestedCountries.push(country);
      const row = globalThis.Game.state.trade[country];
      return row && Array.isArray(row.bilateralContracts) ? row.bilateralContracts : [];
    }
  };

  const model = globalThis.OmegaUIV2MinistryDetail.buildTradeSettlementModel('BGD');
  assert.deepEqual(requestedCountries,['BGD'], 'the UI must not scan other countries');
  assert.equal(model.turn,42);
  assert.equal(model.importCount,1);
  assert.equal(model.exportCount,1);
  assert.equal(model.activeCount,2);
  assert.equal(model.imports[0].partnerCountryId,'IND');
  assert.equal(model.imports[0].totalValue,60000);
  assert.equal(model.imports[0].remainingValue,40000);
  assert.equal(model.imports[0].remainingTurns,68);
  assert.equal(model.exports[0].partnerCountryId,'CHN');
  assert.equal(model.exports[0].totalValue,null, 'market-linked terms do not get a fabricated fixed total');
  assert.equal(model.exports[0].remainingValue,null);
  assert.equal(model.importTotalByCurrency[0].value,60000);
  assert.deepEqual(model.exportTotalByCurrency,[]);
});

test('Trade Settlement renders without a domain data record and does not merge settled transactions', () => {
  cleanGlobals();
  installCountryRuntime();
  globalThis.Game = { state:{ simulation:{turn:10}, trade:{ BGD:{ bilateralContracts:[
    {
      agreementId:'BGD-IND-FIXED', partnerCountryId:'IND', role:'BUYER', buyerCountryId:'BGD', sellerCountryId:'IND',
      resourceId:'coal', status:'ACTIVE', quantityPerDelivery:10, unitPrice:20, currency:'BDT',
      plannedDeliveryCount:5, completedDeliveries:1, nextDeliveryTurn:12, startTurn:1, durationTurns:30, intervalDays:5
    }
  ], globalTradeLedger:{ settlements:[
    { settlementId:'SETTLED-HISTORY-1', status:'SETTLED', buyerCountryId:'BGD', sellerCountryId:'IND', buyerValue:20, buyerCurrency:'BDT' }
  ] } } } } };
  globalThis.OmegaBilateralTradeAgreementV1 = {
    getContracts(country) { return country === 'BGD' ? globalThis.Game.state.trade.BGD.bilateralContracts : []; }
  };
  globalThis.OmegaUIV2Government = {
    getMinistryRows() { return [{ id:'trade', title:'Trade & Commerce', ministerName:'Not recorded' }]; }
  };
  globalThis.OmegaCountryDataGateway = { getDomainRecord(){ return { ok:false, record:null, reason:'NO_DOMAIN_RECORD' }; } };

  const root = {
    classList:{ add(){} },
    addEventListener(){},
    contains(){ return true; },
    innerHTML:''
  };
  const result = globalThis.OmegaUIV2MinistryDetail.render(root,{
    ministryId:'trade', countryId:'BGD', section:'settlement'
  });
  assert.equal(result.ok,true);
  assert.equal(result.section,'settlement');
  assert.equal(result.domainRecordAvailable,false);
  assert.match(root.innerHTML,/Trade Settlement/);
  assert.match(root.innerHTML,/BGD-IND-FIXED/);
  assert.match(root.innerHTML,/Total agreement cost/);
  assert.match(root.innerHTML,/future commitments/);
  assert.match(root.innerHTML,/does not repeat or alter settled transaction history/);
  assert.doesNotMatch(root.innerHTML,/SETTLED-HISTORY-1/,
    'agreement page must not reproduce the completed transaction ledger');

  const dashboard = {
    classList:{ add(){} }, addEventListener(){}, contains(){ return true; }, innerHTML:''
  };
  globalThis.OmegaUIV2MinistryDetail.render(dashboard,{ ministryId:'trade', countryId:'BGD', section:'dashboard' });
  assert.match(dashboard.innerHTML,/data-omega-v2-ministry-section="market"/);
  assert.match(dashboard.innerHTML,/data-omega-v2-trade-market-tab="black-market"/);
  assert.match(dashboard.innerHTML,/data-omega-v2-ministry-section="settlement"/);
  assert.match(dashboard.innerHTML,/data-omega-v2-detail-navigate="treasury_finance"/);
});
