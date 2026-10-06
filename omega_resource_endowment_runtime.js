      const qp={...(s.quantitativeProfile||{})};
      for(const [k,v] of Object.entries(facts.quantitativeProfile)){
        const vy=Number(v?.year);
        if(!Number.isFinite(vy)||vy<=simulationYear())qp[k]=clone(v);
      }
      s.quantitativeProfile=qp;
    }
    s.researchEffectiveYear=evidenceYear;
    s.researchEffectiveForSimulationYear=simulationYear()>=evidenceYear;
    return s;
  }

  function enrichSimulationReserve(site){
    const s=clone(site||{});
    const candidates=[s.siteReferenceKey,s.id,s.siteId,s.rawSiteReference?.id].filter(Boolean).map(String);
    let row=null;
    for(const key of candidates){if(simulationReserveMap?.[key]){row=simulationReserveMap[key];break;}}
    if(!row){
      const country=canonical(s.countryCode||s.countryId||s.country||'');
      const name=String(s.siteName||s.name||s.mineName||s.depositName||'').trim().toLowerCase();
      row=Object.values(simulationReserveMap||{}).find(x=>canonical(x?.countryId||'')===country&&String(x?.siteName||'').trim().toLowerCase()===name)||null;
    }
    if(row?.reserve?.status==='SIMULATED'&&row.reserve.quantity>0){
      s.simulationReserveQuantity=Number(row.reserve.quantity);
      s.simulationReserveUnit=row.reserve.unit||null;
      s.simulationReserveRecordId=row.siteId;
      s.simulationReserveAuthority='SCENARIO_SIMULATION_DATA';
      s.simulationReserveSourceDataset='resource_site_reserve_simulation_v1.json';
      const resourceId=rid(s.resourceId||s.resourceTypeId||s.resId||row.resourceId);
      const petroleum=resourceId==='crude_oil'||resourceId==='natural_gas';
      s.researchPolicyDataset='OMEGA_RESOURCE_RESEARCH_POLICY_V1';
      s.researchFramework=petroleum?'SPE_PRMS_2018':'CRIRSCO_STYLE';
      s.classificationState='SIMULATION_ONLY_NO_PUBLIC_RESERVE_CLASSIFICATION';
      s.declinePolicy=petroleum?'FIELD_SPECIFIC_DECLINE':'SITE_ENGINEERING_CAPACITY_DEPLETION';
      s.universalDeclineRateAllowed=false;
      s.calibrationPolicy='USGS_MCS_2026_COMMODITY_LEVEL_VALIDATION';
    }
    return s;
  }
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{
    const raw=String(v??'').trim(),u=raw.toUpperCase(),e=engine(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{};
    if(profiles[u]){
      const identity=profiles[u]?.identity||profiles[u]||{};
      return id(identity.iso3||identity.countryId||u);
    }
    const direct=Object.entries(profiles).find(function(entry){
      const key=String(entry[0]).toUpperCase(),p=entry[1]||{},i=p.identity||p;
      return key===u||String(i.countryId||'').toUpperCase()===u||String(i.iso3||'').toUpperCase()===u;
    });
    if(direct){
      const identity=direct[1]?.identity||direct[1]||{};
      return id(identity.iso3||identity.countryId||direct[0]);
    }
    const nameNorm=raw.normalize?.('NFKC').trim().toLowerCase();
    if(nameNorm){
      const matches=Object.entries(profiles).filter(function(entry){
        const p=entry[1]||{},i=p.identity||p;
        return [i.name,i.countryName,i.officialName,i.shortName,i.displayName].filter(Boolean).some(function(x){return String(x).normalize?.('NFKC').trim().toLowerCase()===nameNorm;});
      });
      if(matches.length===1)return String(matches[0][0]).toUpperCase();
    }
    try{
      const r=registry()?.resolveCountry?.(v);
      if(r?.id){
        const source=r.raw?.raw||r.raw?.datasets?.['countries.json']||r.raw;
        const resolved=id(source?.iso3||source?.iso3Code||source?.countryCode||source?.countryId||r.id);
        const byResolved=Object.entries(profiles).find(function(entry){
          const i=entry[1]?.identity||entry[1]||{};