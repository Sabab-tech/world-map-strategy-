    if(status==='REJECTED'&&num(req.nextRetryTurn)!==null&&turn()>=num(req.nextRetryTurn)){
      command('trade','OMEGA_TRADE_CREATE_RETRY',buyer,{previousRequest:clone(req),pressureLevel:num(req.refusalCount)||1});
      return;
    }
    if(status==='SENT'&&(/PENDING|OPEN|RETRY|PRESSURE/.test(stage)||stage==='COUNTERPARTY_DATA_PENDING')){
      const result=command('trade','OMEGA_TRADE_COUNTERPARTY_REVIEW',seller,{request:req});
      if(result?.status==='APPLIED'){
        const d=result.result?.tradeDecision||result.tradeDecision;
        if(d?.decision==='WAITING_DATA')return;
        const response=command('trade','OMEGA_TRADE_APPLY_BUYER_RESPONSE',buyer,{requestId:req.requestId,response:d});
        if(response?.status==='APPLIED'){