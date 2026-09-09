/* History data only. Network responses are JSON, never executable scripts.
 * Stable IndexedDB name/schema is independent from the PWA cache version.
 */
(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./shared.js'),require('./providers.js'));
  else root.LottoHistory=factory(root.LottoShared,root.LottoProviders);
})(typeof globalThis!=='undefined'?globalThis:this,function(S,P){
  'use strict';
  const DB_NAME='local-lotto-history',DB_VERSION=1;
  const normalizeRecord=S.validateRecord,validateBatch=S.validateBatch,fingerprint=S.fingerprint;
  class IndexedStore {
    constructor(indexedDB){this.indexedDB=indexedDB;this.db=null;this.opening=null;}
    async open() {
      if(this.db)return this.db;if(this.opening)return this.opening;
      this.opening=new Promise((resolve,reject)=>{
        if(!this.indexedDB){reject(Error('IndexedDB를 사용할 수 없습니다.'));return;}
        let settled=false;
        const request=this.indexedDB.open(DB_NAME,DB_VERSION);
        const timer=setTimeout(()=>{settled=true;reject(Error('로컬 DB 열기 시간이 초과되었습니다.'));},5000);
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('draws'))db.createObjectStore('draws',{keyPath:'draw'});
          if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
        };
        request.onsuccess=()=>{
          clearTimeout(timer);if(settled){request.result.close();return;}settled=true;this.db=request.result;
          this.db.onversionchange=()=>{this.db.close();this.db=null;this.opening=null;};resolve(this.db);
        };
        request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error||Error('로컬 DB 열기 실패'));};
        request.onblocked=()=>{clearTimeout(timer);settled=true;reject(Error('다른 앱 창이 데이터베이스를 사용 중입니다.'));};
      });return this.opening;
    }
    async load() {
      const db=await this.open();return new Promise((resolve,reject)=>{
        const tx=db.transaction(['draws','meta'],'readonly');let rows=[],meta=[];
        const a=tx.objectStore('draws').getAll(),b=tx.objectStore('meta').getAll();
        a.onsuccess=()=>rows=a.result;b.onsuccess=()=>meta=b.result;
        tx.oncomplete=()=>resolve({rows,meta:Object.fromEntries(meta.map(x=>[x.key,x.value]))});
        tx.onerror=tx.onabort=()=>reject(tx.error||Error('로컬 DB 읽기 실패'));
      });
    }
    async save(rows,meta={}) {
      const db=await this.open();return new Promise((resolve,reject)=>{
        const tx=db.transaction(['draws','meta'],'readwrite');let failure=null;const store=tx.objectStore('draws');
        const request=store.getAll();
        request.onsuccess=()=>{try {
          const existing=request.result;S.mergeRows(existing,rows); // validation before any put
          for(const row of rows){const old=existing.find(r=>r.draw===row.draw);store.put({...old,...row});}
          for(const [key,value] of Object.entries(meta))tx.objectStore('meta').put({key,value});
        }catch(e){failure=e;tx.abort();}};
        tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(failure||tx.error||Error('로컬 DB 저장 실패'));
      });
    }
    close(){if(this.db)this.db.close();this.db=null;this.opening=null;}
  }
  class HistoryDB {
    constructor({builtIn=[],builtInUpdatedAt,store,fetcher,now=()=>new Date().toISOString()}={}){
      this.builtIn=validateBatch(builtIn);this.stamp=builtInUpdatedAt||now();this.store=store;this.fetcher=fetcher;this.now=now;
      this.rows=new Map();this.meta={};this.warning='';this.conflicts=[];this.persistent=true;this.queue=Promise.resolve();this.updating=null;
    }
    async init(){
      let saved={rows:[],meta:{}};
      try{saved=await this.store.load();}catch(_){this.persistent=false;this.warning='영구 저장을 사용할 수 없습니다. 추가 기록은 JSON으로 보관하세요.';}
      this.meta=saved.meta||{};
      for(const raw of saved.rows){try{const row=normalizeRecord(raw);this.rows.set(row.draw,{...raw,...row});}catch(_){this.warning='잘못된 로컬 기록이 있습니다. 원본 DB를 삭제하지 않았습니다.';}}
      const additions=[];
      for(const row of this.builtIn){const old=this.rows.get(row.draw);if(old&&!S.same(old,row)){this.conflicts.push(row.draw);continue;}
        if(!old)additions.push({...row,source:'bundled official',updatedAt:this.stamp});}
      if(this.conflicts.length)this.warning=`기본 데이터와 충돌: ${this.conflicts.join(', ')}회. 기존 기록을 보존했습니다. 확인 전 실전 생성을 진행하지 마세요.`;
      if(additions.length){
        if(this.persistent){try{await this.store.save(additions,{});}catch(e){if(e.code==='CONFLICT')throw e;this.persistent=false;this.warning='기본 DB 영구 저장 실패. 기본 기록으로 계산은 가능합니다.';}}
        additions.forEach(row=>this.rows.set(row.draw,row));
      }
      return this;
    }
    list(){return [...this.rows.values()].sort((a,b)=>a.draw-b.draw).map(r=>({...r,numbers:r.numbers.slice()}));}
    info(){const rows=this.list();let contiguous=0;while(this.rows.has(contiguous+1))contiguous++;
      return {first:rows[0]?.draw||0,last:rows.at(-1)?.draw||0,total:rows.length,contiguous,gaps:(rows.at(-1)?.draw||0)-rows.length,
        updatedAt:this.meta.lastSuccessfulUpdate||rows.reduce((s,r)=>r.updatedAt>s?r.updatedAt:s,''),lastCheckedAt:this.meta.lastCheckedAt||null,
        lastOnlineAttempt:this.meta.lastOnlineAttempt||null,source:this.meta.source||'기본 동행복권 데이터 / 로컬 기록',fingerprint:fingerprint(rows),persistent:this.persistent,warning:this.warning,conflicts:this.conflicts.slice()};}
    merge(records,source='manual',extraMeta={}){
      const incoming=validateBatch(records);
      const task=this.queue.then(async()=>{
        let saved;
        if(this.persistent){saved=await this.store.load();S.mergeRows(this.list(),saved.rows);for(const raw of saved.rows)this.rows.set(raw.draw,{...raw,...normalizeRecord(raw)});Object.assign(this.meta,saved.meta);}
        S.mergeRows(this.list(),incoming);
        const now=this.now(),changed=incoming.filter(r=>!this.rows.has(r.draw)||(!this.rows.get(r.draw).bonus&&r.bonus)).map(r=>({...this.rows.get(r.draw),...r,source,updatedAt:now}));
        const added=incoming.filter(r=>!this.rows.has(r.draw)).length;
        const meta={...extraMeta,...(changed.length?{lastSuccessfulUpdate:now,source}:{})};
        if(this.persistent){await this.store.save(changed,meta);} // any failure: NO in-memory partial update
        else this.warning='현재 세션에서만 저장되었습니다. JSON 내보내기로 보관하세요.';
        for(const row of changed)this.rows.set(row.draw,row);Object.assign(this.meta,meta);
        return {added,replaced:0,unchanged:incoming.length-added,info:this.info()};
      });this.queue=task.catch(()=>{});return task;
    }
    update(){if(this.updating)return this.updating;this.updating=this.updateOnce().finally(()=>this.updating=null);return this.updating;}
    async updateOnce(){
      this.meta.lastOnlineAttempt=this.now();let latest=null;
      try{
        await this.merge([]);const collected=await P.collect(this.list(),url=>P.fetchJSON(url,this.fetcher));latest=collected.latest;
        const result=await this.merge(collected.pending,collected.source,{lastCheckedAt:this.now(),lastOnlineAttempt:this.meta.lastOnlineAttempt,source:collected.source});
        return {ok:true,added:result.added,latest,source:collected.source,fallbackReason:collected.fallbackReason,info:this.info()};
      }catch(e){return {ok:false,error:e.message,added:0,latest,info:this.info()};}
    }
    exportJSON(){return JSON.stringify(this.list(),null,2);}
  }
  return {DB_NAME,DB_VERSION,normalizeRecord,validateBatch,fingerprint,IndexedStore,HistoryDB};
});
