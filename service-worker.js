'use strict';
const CACHE='local-lotto-v1';
const ASSETS=['./','./index.html','./style.css','./app.js','./worker.js','./manifest.json','./README_ko.md',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{
  // An update waits for old app windows to close; never replace a running UI.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('local-lotto-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request,{ignoreSearch:true});
    if(cached)return cached;
    try {return await fetch(request);}
    catch(error) {if(request.mode==='navigate')return cache.match('./index.html');throw error;}
  }));
});
