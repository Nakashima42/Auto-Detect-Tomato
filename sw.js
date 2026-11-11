// Network-first for app code avoids stale JS/HTML after GitHub Pages updates.
// Offline fallback retains a self-contained application when the phone has no network.
const CACHE = 'tomato-collector-offline-v8';
const ASSETS = ['./','./index.html','./style.css','./app.js','./detector.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tomato-collector-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const request=event.request;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request);
      if(response.ok)cache.put(request,response.clone()).catch(()=>{});
      return response;
    }catch(error){
      const match=await cache.match(request,{ignoreSearch:true});
      if(match)return match;
      if(request.mode==='navigate'){
        const page=await cache.match('./index.html');
        if(page)return page;
      }
      throw error;
    }
  })());
});
