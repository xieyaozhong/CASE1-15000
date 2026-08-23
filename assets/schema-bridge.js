(() => {
  'use strict';

  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const PAYER = '撥款人';
  const CYCLE = '週期';
  const BROKER_FEE = '仲介費';
  const LEGACY_PROJECT = '起租案名/同仁';
  const BUSINESS_FIELDS = [CYCLE,BROKER_FEE];
  const nativeGet = Storage.prototype.getItem;
  const nativeSet = Storage.prototype.setItem;
  let pendingPayer = null;
  let pendingBusiness = null;

  const rawGet = key => nativeGet.call(localStorage,key);
  const rawSet = (key,value) => nativeSet.call(localStorage,key,value);
  const clean = v => String(v ?? '').trim();

  function parse(value){
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function validState(state){
    return state && Array.isArray(state.headers) && Array.isArray(state.rows);
  }

  function insertCanonicalHeaders(headers){
    const out = headers.filter(h => h !== PAYER && !BUSINESS_FIELDS.includes(h));
    const sourceIndex = out.indexOf('案源');
    out.splice(sourceIndex >= 0 ? sourceIndex + 1 : Math.min(3,out.length),0,PAYER);
    const noteIndex = out.indexOf('備註');
    const insertAt = noteIndex >= 0 ? noteIndex : out.length;
    out.splice(insertAt,0,CYCLE,BROKER_FEE);
    return out;
  }

  function signature(row){
    return [
      clean(row?.['日期']),
      clean(row?.[LEGACY_PROJECT]),
      clean(row?.['案源']),
      clean(row?.['案件金額']),
      clean(row?.['參與總額']),
      clean(row?.['完成日']),
      clean(row?.['備註'])
    ].join('\u001f');
  }

  function canonicalize(state){
    if (!validState(state)) return state;
    const headers = insertCanonicalHeaders(state.headers.map(h=>String(h ?? '').trim()));
    const rows = state.rows.map(row => ({
      ...row,
      [PAYER]:row?.[PAYER] ?? '',
      [CYCLE]:row?.[CYCLE] ?? '',
      [BROKER_FEE]:row?.[BROKER_FEE] ?? ''
    }));
    return {...state,headers,rows};
  }

  function virtualize(state){
    if (!validState(state)) return state;
    return {
      ...state,
      headers:state.headers.filter(h=>h !== PAYER && !BUSINESS_FIELDS.includes(h)),
      rows:state.rows.map(row=>{
        const copy={...row};
        delete copy[PAYER];
        BUSINESS_FIELDS.forEach(h=>delete copy[h]);
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
      buckets.get(key).push({
        payer:row[PAYER] ?? '',
        cycle:row[CYCLE] ?? '',
        brokerFee:row[BROKER_FEE] ?? ''
      });
    });

    const grew = incoming.rows.length > old.rows.length;
    const rows = incoming.rows.map((row,index)=>{
      const copy={...row};
      let preserved;
      const bucket=buckets.get(signature(row));
      if(bucket?.length) preserved=bucket.shift();
      if(!preserved && old.rows[index]) {
        preserved={
          payer:old.rows[index][PAYER] ?? '',
          cycle:old.rows[index][CYCLE] ?? '',
          brokerFee:old.rows[index][BROKER_FEE] ?? ''
        };
      }
      copy[PAYER]=Object.prototype.hasOwnProperty.call(row,PAYER) ? row[PAYER] : (preserved?.payer ?? '');
      copy[CYCLE]=Object.prototype.hasOwnProperty.call(row,CYCLE) ? row[CYCLE] : (preserved?.cycle ?? '');
      copy[BROKER_FEE]=Object.prototype.hasOwnProperty.call(row,BROKER_FEE) ? row[BROKER_FEE] : (preserved?.brokerFee ?? '');

      if(grew && index === incoming.rows.length-1){
        if(pendingPayer !== null) copy[PAYER]=pendingPayer;
        if(pendingBusiness){
          if(Object.prototype.hasOwnProperty.call(pendingBusiness,CYCLE)) copy[CYCLE]=pendingBusiness[CYCLE];
          if(Object.prototype.hasOwnProperty.call(pendingBusiness,BROKER_FEE)) copy[BROKER_FEE]=pendingBusiness[BROKER_FEE];
        }
      }
      return copy;
    });
    pendingPayer=null;
    pendingBusiness=null;
    return {...incoming,headers:insertCanonicalHeaders(incoming.headers),rows};
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
    cycleHeader:CYCLE,
    brokerFeeHeader:BROKER_FEE,
    legacyProjectHeader:LEGACY_PROJECT,
    readCanonical(){ return canonicalize(parse(rawGet(STORAGE_KEY))); },
    setPayerByIndex(index,value){
      const state=canonicalize(parse(rawGet(STORAGE_KEY)));
      if(!validState(state) || !state.rows[index]) return;
      state.rows[index][PAYER]=clean(value);
      rawSet(STORAGE_KEY,JSON.stringify(state));
    },
    setBusinessByIndex(index,field,value){
      if(!BUSINESS_FIELDS.includes(field)) return;
      const state=canonicalize(parse(rawGet(STORAGE_KEY)));
      if(!validState(state) || !state.rows[index]) return;
      state.rows[index][field]=field===BROKER_FEE && value!=='' ? Number(value) : clean(value);
      rawSet(STORAGE_KEY,JSON.stringify(state));
    },
    setPendingPayer(value){ pendingPayer=clean(value); },
    setPendingBusiness(values){
      pendingBusiness={
        [CYCLE]:clean(values?.[CYCLE] ?? ''),
        [BROKER_FEE]:values?.[BROKER_FEE] === '' || values?.[BROKER_FEE] == null ? '' : Number(values[BROKER_FEE])
      };
    },
    rawSetState(state){ if(validState(state)) rawSet(STORAGE_KEY,JSON.stringify(canonicalize(state))); },
    rawGet,
    rawSet
  };

  upgradeStoredState();
})();