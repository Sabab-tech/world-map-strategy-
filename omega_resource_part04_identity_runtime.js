  function sourceMineSiteReferences(){
    const e=engine();
    // ResourceMinistryEngine.countryProfiles is already the canonical merged profile roster.
    // Re-expanding countryProfileSources here reintroduced duplicate physical sites across source datasets.
    const sourceMaps=[['resources.json.countryProfiles',e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{}]];
    const byPhysicalIdentity=new Map();
    const mergeDefined=function(base,incoming){
      const out=clone(base||{});
      for(const [k,v] of Object.entries(incoming||{})){
        if(v===undefined||v===null||v==='')continue;
        if(out[k]===undefined||out[k]===null||out[k]==='')out[k]=clone(v);
        else if(Array.isArray(out[k])&&Array.isArray(v)){
          const seen=new Set(out[k].map(x=>JSON.stringify(x)));
          for(const item of v){const sig=JSON.stringify(item);if(!seen.has(sig)){out[k].push(clone(item));seen.add(sig);}}
        }else if(out[k]&&typeof out[k]==='object'&&v&&typeof v==='object'&&!Array.isArray(out[k])&&!Array.isArray(v)){
          out[k]=mergeDefined(out[k],v);
        }
      }
      return out;
    };
    const getResource=function(site){
      const s=site&&typeof site==='object'?site:{};
      return String(s.resourceId||s.resourceTypeId||s.resourceTypeKey||s.resId||s.resource||'').trim().toLowerCase();
    };
    const getStableId=function(site){
      const s=site&&typeof site==='object'?site:{};
      return [s.siteId,s.mineId,s.depositId,s.resourceInstanceId,s.canonicalOccurrenceKey,s.linkedDepositId,s.depositKey]
        .find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||null;
    };
    const getLocation=function(site){
      const s=site&&typeof site==='object'?site:{};
      return s.locationNodeKey||s.location||s.coordinates||s.lat!==undefined||s.latitude!==undefined
        ?JSON.stringify({locationNodeKey:s.locationNodeKey||null,location:s.location||null,lat:s.lat??s.latitude??null,long:s.long??s.longitude??null})
        :'';
    };
    const runtimeDeposits=Array.isArray(e?.deposits)?e.deposits:[];
    const resolveCanonicalDepositKey=function(site,countryId,siteName){
      const s=site&&typeof site==='object'?site:{};
      const explicit=[s.canonicalOccurrenceKey,s.linkedDepositId,s.depositKey,s.depositId,s.mineId,s.resourceInstanceId].filter(Boolean).map(String);
      const explicitHits=[];
      for(const key of explicit){
        for(const dep of runtimeDeposits){
          const depKeys=[dep?.id,dep?.depositId,dep?.mineId,dep?.linkedDepositId,dep?.depositKey].filter(Boolean).map(String);
          if(depKeys.includes(key))explicitHits.push(dep);
        }
      }
      const uniqExplicit=[...new Map(explicitHits.map((d)=>[String(d?.id||d?.depositId||d?.mineId||d?.depositKey||'') ,d])).values()];
      if(uniqExplicit.length===1)return String(uniqExplicit[0]?.id||uniqExplicit[0]?.depositId||uniqExplicit[0]?.mineId||uniqExplicit[0]?.depositKey||'');
      const wantedName=tok(siteName);
      const nameHits=runtimeDeposits.filter(dep=>
        canonicalCountry(dep?.countryCode||dep?.countryId||dep?.country||dep?.iso3||'')===countryId &&
        tok(dep?.name||dep?.depositName||dep?.siteName||'')===wantedName
      );
      return nameHits.length===1?String(nameHits[0]?.id||nameHits[0]?.depositId||nameHits[0]?.mineId||nameHits[0]?.depositKey||''):null;
    };
    for(const [sourceDatasetId,profiles] of sourceMaps){
      for(const [profileKey,profile] of Object.entries(profiles||{})){
        const identity=profile?.identity||profile||{};
        const countryId=canonicalCountry(identity.countryId||identity.iso3||profileKey);
        if(!countryId)continue;
        const sites=profile?.resource_infrastructure_context?.mineSites||
          profile?.infrastructure_context?.mineSites||
          profile?.resourceInfrastructureContext?.mineSites||[];
        if(!Array.isArray(sites))continue;
        sites.forEach(function(rawSite,index){
          const siteName=String(
            typeof rawSite==='string'
              ? rawSite
              : rawSite?.name||rawSite?.siteName||rawSite?.mineName||rawSite?.depositName||
                rawSite?.siteId||rawSite?.mineId||rawSite?.depositId||('UNNAMED_SITE_'+countryId+'_'+index)
          ).trim();
          if(!siteName)return;
          const rawSiteObject=rawSite&&typeof rawSite==='object'?clone(rawSite):{name:siteName};
          const resourceId=getResource(rawSiteObject);
          const stableId=getStableId(rawSiteObject);
          const locationKey=getLocation(rawSiteObject);
          const canonicalDepositKey=resolveCanonicalDepositKey(rawSiteObject,countryId,siteName);
          // Prefer a canonical runtime deposit as the physical anchor. Stable source IDs are retained as aliases,
          // but must not split the same deposit merely because resources.json sources use different IDs.
          // Multi-commodity deposits remain one site identity and split into commodity streams downstream.
          const physicalKey=canonicalDepositKey
            ? countryId+'|DEP:'+tok(canonicalDepositKey)
            : countryId+'|N:'+tok(siteName)+'|L:'+tok(locationKey||'');
          const sourcePath=`GSRSK_Master_CountryProfiles_v14.countryProfiles.${String(profileKey)}.resource_infrastructure_context.mineSites[${index}]`;
          const existing=byPhysicalIdentity.get(physicalKey);
          if(existing){
            existing.rawSiteReference=mergeDefined(existing.rawSiteReference,rawSiteObject);
            existing.sourceDatasetIds=[...new Set([...(existing.sourceDatasetIds||[]),String(sourceDatasetId)])];
            existing.sourcePaths=[...new Set([...(existing.sourcePaths||[]),sourcePath])];
            existing.provenanceSources=[...new Set([...(existing.provenanceSources||[]),String(sourceDatasetId)])];
            existing.resourceAsset=normalizeUnifiedAsset({
              ...clone(existing.rawSiteReference),
              assetType:'MINE_SITE',
              assetId:existing.siteReferenceKey,
              siteReferenceKey:existing.siteReferenceKey,
              siteName:existing.siteName,
              countryId,
              countryCode:countryId,
              sourceAuthority:'RESOURCE_JSON',
              sourceDatasetId:existing.sourceDatasetId,
              sourcePath:existing.sourcePath,
              extractionExecutable:false
            });
            return;
          }
          const siteReferenceKey=canonicalDepositKey
            ? 'SITE:'+countryId+':DEP:'+tok(canonicalDepositKey)
            : stableId
              ? 'SITE:'+countryId+':ID:'+tok(stableId)
              : 'SITE:'+countryId+':'+tok(siteName)+(locationKey?':'+tok(locationKey):'');
          const resourceAsset=normalizeUnifiedAsset({
            ...clone(rawSiteObject),
            assetType:'MINE_SITE',
            assetId:siteReferenceKey,
            siteReferenceKey,