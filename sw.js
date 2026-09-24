const CACHE="hightaxi-chess-cache-v0.10.4";
const STATIC=["./","./index.html","./styles.css","./app.js","./chess.js","./pgn.js","./db.js","./version.js","./stockfish-18-lite-single.js","./stockfish-18-lite-single.wasm","./manifest.webmanifest","./logo.jpg","./apple-touch-icon.png","./icon-192.png","./icon-512.png","./maskable-192.png","./maskable-512.png","./wP.png","./wN.png","./wB.png","./wR.png","./wQ.png","./wK.png","./bP.png","./bN.png","./bB.png","./bR.png","./bQ.png","./bK.png","./piece-assets.js","./src/analysis/arrows.js","./src/analysis/statistics.js","./src/analysis/cache.js","./src/analysis/annotations.js","./src/analysis/classification.js","./src/analysis/evaluation.js","./src/analysis/stockfish.js","./src/app/lifecycle.js","./src/app/router.js","./src/app/state.js","./src/chess/navigation.js","./src/chess/position.js","./src/games/tree.js","./src/persistence/storage.js","./src/persistence/backup.js","./src/sync/chesscom.js","./src/ui/arrows.js","./src/ui/board.js","./src/ui/moves.js","./src/ui/statistics.js","./src/training/puzzles.js","./src/training/session.js","./src/training/controller.js","./src/ui/training.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(async cache=>{for(const url of STATIC){try{await cache.add(url)}catch{}}}).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("hightaxi-chess-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return;
  if(/^\/api(?:\/|$)/.test(url.pathname))return;
  const cachePromise=caches.open(CACHE);
  const refresh=cachePromise.then(cache=>fetch(e.request).then(r=>{if(r.ok)cache.put(e.request,r.clone());return r}).catch(()=>null));
  e.waitUntil(refresh);
  e.respondWith(cachePromise.then(async cache=>{
    const cached=await cache.match(e.request);
    if(cached)return cached;
    const fresh=await refresh;
    return fresh||new Response("Offline",{status:503});
  }));
});
