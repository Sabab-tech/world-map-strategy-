    if(v===null||v===undefined||v==='')return null;
    const x=Number(v);
    return Number.isFinite(x)?x:null;
  }

  function textOrNull(v){
    const s=String(v??'').trim();
    return s?s:null;
  }

  function authorityRank(v){
    const a=String(v||'UNOBSERVED').toUpperCase();
    return ['OBSERVED','REPORTED','SOURCE_BACKED','ESTIMATED','WEB_SOURCE_BACKED','WEB_RESEARCHED','WEB_RESEARCHED_CURATED'].includes(a)?2:a==='SIMULATED'?1:0;
  }

  function normalizeAuthority(v){
    const a=String(v||'UNOBSERVED').toUpperCase();
    if(a==='OBSERVED'||a==='REPORTED'||a==='SOURCE_BACKED'||a==='WEB_SOURCE_BACKED'||a==='WEB_RESEARCHED'||a==='WEB_RESEARCHED_CURATED')return'OBSERVED';
    if(a==='SIMULATED')return'SIMULATED';
    return'UNOBSERVED';
  }

  function overallAuthority(values){
    const list=values.map(v=>String(v||'UNOBSERVED').toUpperCase());