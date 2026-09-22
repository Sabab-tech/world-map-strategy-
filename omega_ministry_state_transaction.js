/*
 * OMEGA MINISTRY STATE TRANSACTION SYSTEM v2.0.0
 *
 * Staged write plan for the canonical authoritative state authority.
 * A transaction never owns game state and never writes it directly.
 */
(function(global){
  'use strict';

  const VERSION='2.0.0';

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const k of Object.keys(value)){if(k==='__proto__'||k==='constructor')continue;const v=value[k];if(v!==undefined&&typeof v!=='function')out[k]=clone(v,seen);}
    return out;
  }

  function validId(value){return String(value??'').trim().length>0;}

  class StateTransaction{
    constructor(ownerMinistry,countryId,turn,commandId,authority){
      this.version=VERSION;
      this.ownerMinistry=String(ownerMinistry||'');
      this.countryId=String(countryId||'').trim().toUpperCase();
      this.turn=Number.isFinite(Number(turn))?Number(turn):0;
      this.commandId=String(commandId||'');
      this.authority=authority||global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
      this.transactionId='OMI-TX-'+this.turn+'-'+this.ownerMinistry+'-'+this.commandId;
      this.expectedRevision=authority?.revision?.(this.countryId,this.ownerMinistry)??null;
      this.operations=[];
      this.closed=false;
    }

    _assertOpen(){
      if(this.closed)throw new Error('STATE_TRANSACTION_CLOSED');
      if(!this.authority||typeof this.authority.read!=='function'||typeof this.authority.commitTransaction!=='function'){
        throw new Error('AUTHORITATIVE_STATE_AUTHORITY_UNAVAILABLE');
      }
      if(!validId(this.ownerMinistry)||!validId(this.countryId))throw new Error('INVALID_TRANSACTION_SCOPE');
      if(!this.commandId)throw new Error('COMMAND_ID_REQUIRED');
    }

    _assertOwnedPath(path){
      const p=String(path||'').trim();
      if(!p)throw new Error('STATE_PATH_REQUIRED');
      const first=p.split('.')[0];
      const aliases={resourceSummary:'resource',resourceInventory:'resource',resourceDeposits:'resource'};
      const owner=aliases[first]||first;
      if(owner!==this.ownerMinistry)throw new Error('STATE_PATH_NOT_OWNED_BY_MINISTRY:'+p);
      return p;
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
      return this.authority.read(this.countryId,p);
    }

    commit(){
      this._assertOpen();
      const result=this.authority.commitTransaction({
        transactionId:this.transactionId,
        ownerMinistry:this.ownerMinistry,
        countryId:this.countryId,
        turn:this.turn,
        commandId:this.commandId,
        expectedRevision:this.expectedRevision,
        operations:clone(this.operations)
      });
      this.closed=true;
      if(result?.status==='CONFLICT')throw new Error('STATE_REVISION_CONFLICT');
      return clone(result);
    }

    rollback(){
      if(this.closed)return true;
      this.closed=true;
      this.operations=[];
      return true;
    }
  }

  const api=Object.freeze({
    VERSION,
    create:(ownerMinistry,countryId,turn,commandId,authority)=>{
      const bound=authority||global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
      return new StateTransaction(ownerMinistry,countryId,turn,commandId,bound);
    }
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryStateTransaction=api;
  global.OmegaMinistryStateTransaction=api;
})(typeof window!=='undefined'?window:globalThis);
