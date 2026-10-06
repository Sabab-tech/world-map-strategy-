    const a=String(v||'UNOBSERVED').toUpperCase();
    if(a==='OBSERVED'||a==='WEB_SOURCE_BACKED'||a==='WEB_RESEARCHED'||a==='WEB_RESEARCHED_CURATED')return'OBSERVED';
    if(a==='SIMULATED')return'SIMULATED';
    return'UNOBSERVED';
  }

  function overallAuthority(values){
    const list=values.map(v=>String(v||'UNOBSERVED').toUpperCase());
    if(list.length&&list.every(v=>v==='OBSERVED'))return'OBSERVED';
    if(list.some(v=>v==='SIMULATED'))return'SIMULATED';
    return'UNOBSERVED';
  }

  function normalizeUnifiedAsset(input){
    const raw=clone(input||{});
    const ref=raw.resourceAsset&&typeof raw.resourceAsset==='object'?raw.resourceAsset:{};
    const countryId=canonicalCountry(raw.countryId||raw.countryCode||ref.countryId||ref.countryCode);
    const siteName=textOrNull(raw.siteName||raw.name||raw.depositName||ref.siteName);
    const siteReferenceKey=textOrNull(raw.siteReferenceKey||ref.siteReferenceKey);
    const occurrenceKey=textOrNull(raw.occurrenceKey||ref.occurrenceKey);
    const assetId=textOrNull(raw.assetId||ref.assetId||occurrenceKey||siteReferenceKey||raw.id)||null;
    const resourceTypeId=textOrNull(
      raw.resourceTypeId||raw.resourceTypeKey||raw.resourceId||raw.resId||
      raw.reserveState?.resourceId||ref.resourceTypeId||ref.resourceType||ref.resourceId
    )?.replace(/^RES_TYPE:/i,'').toLowerCase()||null;
    const rs=raw.reserveState||ref.reserve||{};
    const cap=raw.capacity||ref.productionCapacity||{};
    const prod=raw.productionModel||raw.siteModel?.commodityStreams?.find?.(x=>String(x?.resourceId||'')===String(resourceTypeId||''))?.production||ref.production||{};
    const q=raw.qualityState||raw.quality||ref.quality||{};
    const reserveAuthorityCandidate=normalizeAuthority(
      raw.reserveAuthority||rs?.provenance?.quantityAuthority||raw.dataStatus?.reserve||raw.dataAuthority?.reserve||ref?.dataStatus?.reserve||ref?.dataAuthority?.reserve
    );
    const productionAuthorityCandidate=normalizeAuthority(
      raw.productionAuthority||cap?.authority||prod?.authority||raw.dataStatus?.production||raw.dataAuthority?.production||ref?.dataStatus?.production||ref?.dataAuthority?.production
    );
    const qualityAuthorityCandidate=normalizeAuthority(
      raw.qualityAuthority||
      raw.dataStatus?.grade||raw.dataStatus?.quality||raw.dataAuthority?.grade||raw.dataAuthority?.quality||
      ref?.dataStatus?.grade||ref?.dataStatus?.quality||ref?.dataAuthority?.grade||ref?.dataAuthority?.quality
    );

    const reserveQuantity=num(rs?.geologicalQuantity??raw.geologicalQuantity??raw.reserveQuantity);
    const recoverableQuantity=num(rs?.recoverableQuantity??raw.recoverableQuantity);
    const residualQuantity=num(rs?.residualQuantity??raw.residualQuantity);
    const unit=textOrNull(rs?.unit||raw.unit||cap?.unit);
    const productionRate=num(raw.productionRate??cap?.activeRate??cap?.dailyRate??cap?.nominalRate??prod?.activeRate??prod?.observedRate);
    const currentProduction=num(raw.currentProduction??raw.currentProductionRate??raw.lastOutputQuantity);
    const recoveryRate=num(raw.recoveryRate??cap?.recovery??prod?.recovery);
    const grade=num(raw.gradePercent??q?.gradePercent??q?.normalized?.gradePercent);
    const purity=num(raw.purity??q?.purity??q?.normalized?.purityFraction);
    const concentration=num(raw.concentrationPercent??q?.concentrationPercent??q?.normalized?.concentrationPercent);
    const reserveAuthority=reserveQuantity===null?'UNOBSERVED':reserveAuthorityCandidate;
    const productionAuthority=productionRate===null?'UNOBSERVED':productionAuthorityCandidate;
    const qualityPresent=grade!==null||purity!==null||concentration!==null;
    const qualityAuthority=qualityPresent?qualityAuthorityCandidate:'UNOBSERVED';

    const location={
      nodeKey:textOrNull(raw.locationNodeKey||ref.location?.nodeKey),
      lat:num(raw.lat??raw.latitude??ref.location?.lat),
      lon:num(raw.lon??raw.lng??raw.longitude??ref.location?.lon),
      status:(raw.locationNodeKey||raw.lat!=null||raw.lon!=null)?'AVAILABLE':'UNOBSERVED'
    };
    const warehouseId=textOrNull(raw.warehouseId||raw.warehouse?.id||ref.warehouse?.id) ||
      (countryId?'WH-'+countryId+'-RAW':null);
    const executable=raw.extractionExecutable===true||
      Boolean(raw.occurrenceKey&&resourceTypeId&&reserveQuantity!==null&&productionRate!==null);
    const factoryInputStatus=executable?'AVAILABLE_AFTER_EXTRACTION':'BLOCKED_MISSING_QUANTITATIVE_DATA';
    const routeId=warehouseId&&assetId?
      'MINE:'+assetId+'->'+warehouseId+'->FACTORY_INPUT':null;
    const authorities=[reserveAuthority,productionAuthority,qualityAuthority];
    return{
      schemaVersion:UNIFIED_ASSET_SCHEMA_VERSION,
      assetType:textOrNull(raw.assetType||ref.assetType)||'RESOURCE_MINE',
      assetId,
      siteId:assetId,
      siteReferenceKey,
      occurrenceKey,
      siteName,
      countryId,