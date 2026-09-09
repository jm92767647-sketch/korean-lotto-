'use strict';
const PREFIX='local-lotto-'+encodeURIComponent(new URL(self.registration.scope).pathname)+'-';
const CACHE=PREFIX+'v3-nine-20260910';
const ASSETS=['./','./index.html','./style.css','./app.js','./worker.js','./manifest.json','./README_ko.md',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable.png','./icons/apple-touch-icon.png',
  './shared.js','./providers.js','./history.js','./history-data.js','./lotto_history.json','./history-provenance.json','./HISTORY_UPDATE_ko.md'];
self.addEventListener('install',event=>{
  // An update waits for old app windows to close; never replace a running UI.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))));
});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith(PREFIX)||['local-lotto-v1','local-lotto-v2-history'].includes(key))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request,{ignoreSearch:true});
    if(/\/(lotto_history\.json|history-provenance\.json)$/.test(url.pathname)){
      try{const fresh=await fetch(new Request(request,{cache:'no-store'}));if(!fresh.ok)throw Error('Data unavailable');await fresh.clone().json();await cache.put(request,fresh.clone());return fresh;}
      catch(error){if(cached)return cached;throw error;}
    }
    if(cached)return cached;
    try {return await fetch(request);}
    catch(error) {if(request.mode==='navigate')return cache.match('./index.html');throw error;}
  }));
});
