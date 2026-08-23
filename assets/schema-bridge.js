(() => {
  'use strict';

  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const PAYER = '撥款人';
  const LEGACY_PROJECT = '起租案名/同仁';
  const nativeGet = Storage.prototype.getItem;
  const nativeSet = Storage.prototype.setItem;
  let pendingPayer = null;

  const rawGet = key => nativeGet.call(localStorage,key);
  const rawSet = (key,value) => nativeSet.call(localStorage,key,value);
  const clean = v => String(v ?? '').trim();

  function parse(value){
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function validState(state){
    return state && Array.isArray(state.headers) && Array.isArray(state.rows);
  }

  function insertPayerHeader(headers){
    const out = headers.filter(h => h !== PAYER);
    const sourceIndex = out.indexOf('案源');
    out.splice(sourceIndex >= 0 ? sourceIndex + 1 : Math.min(3,out.length),0,PAYER);
    return out;
  }

  function signature(row){
    return [
      clean(row?.['日期']),
      clean(row?.[LEGACY_PROJECT]),
      clean(row?.['案源']),
      clean(row?.['案件金額']),
      clean(row?.['參與總額']),
      clean(row?.['狀態']),
      clean(row?.['完成日']),
      clean(row?.['備註'])
    ].join('\u001f');
  }

  function canonicalize(state){
    if (!validState(state)) return state;
    const headers = insertPayerHeader(state.headers.map(h=>String(h ?? '').trim()));
    const rows = state.rows.map(row => ({...row,[PAYER]:row?.[PAYER] ?? ''}));
    return {...state,headers,rows};
  }

  function virtualize(state){
    if (!validState(state)) return state;
    return {
      ...state,
      headers:state.headers.filter(h=>h !== PAYER),
      rows:state.rows.map(row=>{
        const copy={...row};
        delete copy[PAYER];
        return copy;
      })
    };
  }

  function mergeIncoming(incoming){
    if (!validState(incoming)) return incoming;
    const old = canonicalize(parse(rawGet(STORAGE_KEY))) || {headers:[],rows:[]};
    const buckets = new Map();
    old.rows.forEach(row=>{
      const key=signature(row);
      if(!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(row[PAYER] ?? '');
    });

    const grew = incoming.rows.length > old.rows.length;
    const rows = incoming.rows.map((row,index)=>{
      const copy={...row};
      let payer = Object.prototype.hasOwnProperty.call(row,PAYER) ? row[PAYER] : undefined;
      if (payer === undefined) {
        const bucket=buckets.get(signature(row));
        if(bucket?.length) payer=bucket.shift();
      }
      if (payer === undefined && old.rows[index]) payer=old.rows[index][PAYER] ?? '';
      if (grew && index === incoming.rows.length-1 && pendingPayer !== null) payer=pendingPayer;
      copy[PAYER]=payer ?? '';
      return copy;
    });
    pendingPayer=null;
    return {...incoming,headers:insertPayerHeader(incoming.headers),rows};
  }

  function upgradeStoredState(){
    const current=parse(rawGet(STORAGE_KEY));
    if(!validState(current)) return;
    rawSet(STORAGE_KEY,JSON.stringify(canonicalize(current)));
  }

  Storage.prototype.getItem=function(key){
    const value=nativeGet.call(this,key);
    if(this!==localStorage || key!==STORAGE_KEY) return value;
    const state=parse(value);
    return validState(state) ? JSON.stringify(virtualize(canonicalize(state))) : value;
  };

  Storage.prototype.setItem=function(key,value){
    if(this!==localStorage || key!==STORAGE_KEY) return nativeSet.call(this,key,value);
    const incoming=parse(value);
    if(!validState(incoming)) return nativeSet.call(this,key,value);
    return nativeSet.call(this,key,JSON.stringify(mergeIncoming(incoming)));
  };

  window.LedgerSchemaBridge={
    payerHeader:PAYER,
    legacyProjectHeader:LEGACY_PROJECT,
    readCanonical(){
      return canonicalize(parse(rawGet(STORAGE_KEY)));
    },
    setPayerByIndex(index,value){
      const state=canonicalize(parse(rawGet(STORAGE_KEY)));
      if(!validState(state) || !state.rows[index]) return;
      state.rows[index][PAYER]=clean(value);
      rawSet(STORAGE_KEY,JSON.stringify(state));
    },
    setPendingPayer(value){ pendingPayer=clean(value); },
    rawSetState(state){ if(validState(state)) rawSet(STORAGE_KEY,JSON.stringify(canonicalize(state))); },
    rawGet,
    rawSet
  };

  upgradeStoredState();
})();