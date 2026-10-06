    // Profiles and resource-domain records are immutable repository authority; keep their references.
    // Runtime-owned mutable ledgers are copied below, avoiding repeated deep-clone of ~197 full profiles per audit.
    return{
      ...existing,countryResourceProfile:profile(c)||null,resourceDomain:profile(c)?.resource_domain||null,
      resourceOntology,
      mines,mineSiteReferences,mineSiteReferenceCount,mineSiteControllers,
      endowment,reserves:merge(reserves,existing.reserves),inventory,production,consumption,tradeAvailability,mineStates,
      strategicReserve,
      batches:Array.isArray(existing.batches)?existing.batches.slice(-MAX_LEDGER):[],
      warehouse:clone(existing.warehouse||{
        warehouseId:'WH-'+canonical(c)+'-RAW',countryId:canonical(c),type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        locationNodeKey:'WAREHOUSE:'+canonical(c)+':RAW',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[],lastReceiptTurn:null
      }),
      mineOutputs:clone(existing.mineOutputs||{}),mineOutputTotals:clone(existing.mineOutputTotals||{}),
      mineProductionLedger:Array.isArray(existing.mineProductionLedger)?existing.mineProductionLedger.slice(-MAX_MINE_HISTORY):[],
      extractionLedger:Array.isArray(existing.extractionLedger)?existing.extractionLedger.slice(-MAX_LEDGER):[],
      resourceAuthority:{
        source:'RESOURCE_JSON->PART04->PART05->RESOURCE_RUNTIME',