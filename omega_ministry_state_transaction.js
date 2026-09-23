/*
 * OMEGA MINISTRY STATE TRANSACTION SYSTEM v1.0.0
 *
 * Deterministic write boundary for authoritative country-scoped state.
 * Commands may mutate only the state owned by their registered ministry.
 * Real timestamps are never used for simulation decisions.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const k of Object.keys(value)){if(k==='__proto__'||k==='constructor')continue;const v=value[k];if(v!==undefined&&typeof v!=='function')out[k]=clone(v,seen);}
    return out;
  }

  function stable(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    const keys=Object.keys(value).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  }

  function hash(value){
    const input=stable(value);
    let h=2166136261;
    for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }

  function validId(value){return String(value??'').trim().length>0;}

  class StateTransaction{
    constructor(stateSource,ownerMinistry,countryId,turn,commandId){
      this.version=VERSION;
      this.state=stateSource||global.Game?.state||global.gameState||null;
      this.ownerMinistry=String(ownerMinistry||'');
      this.countryId=String(countryId||'').trim().toUpperCase();
      this.turn=Number.isFinite(Number(turn))?Number(turn):0;
      this.commandId=String(commandId||'');
      this.transactionId='OMI-TX-'+this.turn+'-'+this.ownerMinistry+'-'+this.commandId;
      this.operations=[];
      this.closed=false;
    }

    _assertOpen(){
      if(this.closed)throw new Error('STATE_TRANSACTION_CLOSED');
      if(!this.state)throw new Error('AUTHORITATIVE_STATE_UNAVAILABLE');
      if(!validId(this.ownerMinistry)||!validId(this.countryId))throw new Error('INVALID_TRANSACTION_SCOPE');
      if(!this.commandId)throw new Error('COMMAND_ID_REQUIRED');
    }

    _assertOwnedPath(path){
      const p=String(path||'').trim();
      if(!p)throw new Error('STATE_PATH_REQUIRED');
      const first=p.split('.')[0];
      const aliases={
        resourceSummary:'resource',
        resourceInventory:'resource',
        resourceDeposits:'resource',
        cities:'interior'
      };
      const owner=aliases[first]||first;
      if(owner!==this.ownerMinistry)throw new Error('STATE_PATH_NOT_OWNED_BY_MINISTRY:'+p);
      return p;
    }

    _countryContainer(path,create){
      const parts=String(path).split('.');
      const domain=parts.shift();
      if(!this.state[domain]||typeof this.state[domain]!=='object'){
        if(!create)return null;
        this.state[domain]={};
      }
      if(!this.state[domain][this.countryId]||typeof this.state[domain][this.countryId]!=='object'){
        if(!create)return null;
        this.state[domain][this.countryId]={};
      }
      return {domain,container:this.state[domain][this.countryId],parts};
    }

    set(path,value){
      this._assertOpen();
      const p=this._assertOwnedPath(path);
      const existing=this.get(p);
      this.operations.push({op:'SET',path:p,before:clone(existing),after:clone(value)});
      return clone(value);
    }

    delete(path){
      this._assertOpen();
      const p=this._assertOwnedPath(path);
      const existing=this.get(p);
      this.operations.push({op:'DELETE',path:p,before:clone(existing),after:undefined});
      return existing;
    }

    get(path){
      this._assertOpen();
      const p=String(path||'');
      const staged=[...this.operations].reverse().find(op=>op.path===p);
      if(staged)return clone(staged.after);
      const ref=this._countryContainer(p,false);
      if(!ref)return undefined;
      let cur=ref.container;
      for(const part of ref.parts){
        if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
        cur=cur[part];
      }
      return clone(cur);
    }

    commit(){
      this._assertOpen();
      const beforeDigest=hash(this.state);
      const applied=[];
      for(const operation of this.operations){
        const ref=this._countryContainer(operation.path,true);
        let cur=ref.container;
        for(let i=0;i<ref.parts.length-1;i++){
          const part=ref.parts[i];
          if(!cur[part]||typeof cur[part]!=='object')cur[part]={};
          cur=cur[part];
        }
        const leaf=ref.parts[ref.parts.length-1];
        if(operation.op==='SET')cur[leaf]=clone(operation.after);
        else if(operation.op==='DELETE')delete cur[leaf];
        applied.push({
          op:operation.op,
          path:operation.path,
          before:clone(operation.before),
          after:clone(operation.after)
        });
      }
      const afterDigest=hash(this.state);
      this.closed=true;
      return Object.freeze({
        transactionId:this.transactionId,
        commandId:this.commandId,
        ownerMinistry:this.ownerMinistry,
        countryId:this.countryId,
        simulationTurn:this.turn,
        changed:beforeDigest!==afterDigest,
        operations:clone(applied),
        beforeRevision:'CONTENT:'+beforeDigest,
        afterRevision:'CONTENT:'+afterDigest
      });
    }

    rollback(){
      this.closed=true;
      this.operations=[];
      return true;
    }
  }

  const api=Object.freeze({
    VERSION,
    create:(ownerMinistry,countryId,turn,commandId,stateSource)=>new StateTransaction(
      stateSource||global.Game?.state||global.gameState||null,
      ownerMinistry,countryId,turn,commandId
    )
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryStateTransaction=api;
  global.OmegaMinistryStateTransaction=api;
})(typeof window!=='undefined'?window:globalThis);
