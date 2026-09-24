const DEFAULT_READY_TIMEOUT=20000;
const DEFAULT_SEARCH_TIMEOUT=7000;
const DEFAULT_DEPTH=16;
const DEFAULT_CACHE_SIZE=128;
const DEFAULT_HASH_MB=32;
const DEFAULT_MULTI_PV=1;

export function createStockfishController({
  workerFactory,
  timeoutMs=DEFAULT_READY_TIMEOUT,
  searchTimeoutMs=DEFAULT_SEARCH_TIMEOUT,
  depth=DEFAULT_DEPTH,
  cacheSize=DEFAULT_CACHE_SIZE,
  hashMb=DEFAULT_HASH_MB,
  multiPv=DEFAULT_MULTI_PV,
}={}){
  if(typeof workerFactory!=='function')throw new Error('workerFactory is required');
  let worker=null,readyPromise=null,readyResolve=null,readyReject=null,readyTimer=null,requestTimer=null;
  let request=null,pendingStart=null,token=0,disposed=false,unavailable=false;
  const cache=new Map();

  function clearReadyState(){
    clearTimeout(readyTimer);readyTimer=null;
    readyPromise=null;readyResolve=null;readyReject=null;
  }
  function clearRequestTimer(){clearTimeout(requestTimer);requestTimer=null;}
  function setCache(key,value){cache.delete(key);cache.set(key,value);while(cache.size>cacheSize)cache.delete(cache.keys().next().value);}
  function rejectRequest(reason){
    if(request){const old=request;request=null;clearRequestTimer();old.reject(reason instanceof Error?reason:new Error(String(reason)));}
  }
  function terminateWorker(){
    clearReadyState();
    try{worker?.terminate()}catch{}
    worker=null;
  }
  function restartWorker(){
    terminateWorker();
    unavailable=false;
  }
  function queueAfterWorkerRestart(next){
    const queued=next;
    pendingStart=queued;
    ensureReady().then(()=>{
      if(pendingStart!==queued)return;
      pendingStart=null;
      startRequest(queued);
    }).catch(error=>{
      if(pendingStart===queued)pendingStart=null;
      queued.reject(error);
    });
  }
  function startRequest(next){
    request=next;
    clearRequestTimer();
    requestTimer=setTimeout(()=>{
      if(request!==next)return;
      request=null;clearRequestTimer();
      try{worker?.postMessage('stop')}catch{}
      restartWorker();
      next.reject(new Error('Stockfish : temps d’analyse dépassé'));
      if(pendingStart){
        const queued=pendingStart;pendingStart=null;
        ensureReady().then(()=>startRequest(queued)).catch(error=>queued.reject(error));
      }
    },Math.max(100,Number(searchTimeoutMs)||DEFAULT_SEARCH_TIMEOUT));
    try{
      worker.postMessage(`position fen ${next.fen}`);
      worker.postMessage(`go depth ${depth}`);
    }catch(error){const current=request;request=null;clearRequestTimer();current.reject(error)}
  }
  function handleLine(raw){
    const line=typeof raw==='string'?raw:raw?.line||'';
    if(line.includes('engine load error')){unavailable=true;readyReject?.(new Error(line));return;}
    if(line.includes('uciok')){
      try{
        worker?.postMessage(`setoption name MultiPV value ${Math.max(1,Math.min(2,Number(multiPv)||DEFAULT_MULTI_PV))}`);
        worker?.postMessage(`setoption name Hash value ${Math.max(16,Math.min(64,Number(hashMb)||DEFAULT_HASH_MB))}`);
        worker?.postMessage('setoption name Threads value 1');
        worker?.postMessage('isready');
      }catch(error){readyReject?.(error)}
    }
    if(line.includes('readyok')&&readyResolve){const resolve=readyResolve;readyResolve=null;readyReject=null;clearTimeout(readyTimer);readyTimer=null;resolve(worker)}
    if(line.startsWith('bestmove ')){
      if(!request)return;
      const current=request;request=null;clearRequestTimer();
      const bestMove=line.split(/\s+/)[1]||null;
      const result={bestMove,evaluation:current.evaluation,depth:current.depth,pv:current.pv||[]};
      if(current.token===token){setCache(current.fen,result);current.resolve(result);}else current.reject(new Error('Stale Stockfish result'));
      if(pendingStart){const next=pendingStart;pendingStart=null;startRequest(next);}
    }
    if(request&&line.startsWith('info ')&&line.includes(' score ')){
      const mcp=line.match(/\bscore cp (-?\d+)/),mm=line.match(/\bscore mate (-?\d+)/),md=line.match(/\bdepth (\d+)/),mpv=line.match(/\bpv\s+(.+)$/);
      if(mcp||mm)request.evaluation={cp:mcp?Number(mcp[1]):0,mate:mm?Number(mm[1]):null};
      if(md)request.depth=Number(md[1]);
      if(mpv)request.pv=mpv[1].trim().split(/\s+/).slice(0,12);
    }
  }
  function ensureReady(){
    if(disposed)return Promise.reject(new Error('Stockfish controller disposed'));
    if(readyPromise)return readyPromise;
    unavailable=false;
    readyPromise=new Promise((resolve,reject)=>{
      readyResolve=resolve;readyReject=reject;
      try{
        const created=workerFactory();
        worker=created;
        created.onmessage=e=>{if(worker!==created)return;handleLine(e.data)};
        created.onerror=e=>{if(worker!==created)return;const error=new Error(e?.message||'Stockfish worker unavailable');unavailable=true;readyReject?.(error);clearReadyState();terminateWorker();rejectRequest(error)};
        readyTimer=setTimeout(()=>{if(worker!==created)return;const error=new Error('Stockfish ne répond pas');unavailable=true;clearReadyState();terminateWorker();reject(error)},timeoutMs);
        created.postMessage('uci');
      }catch(error){clearReadyState();reject(error)}
    });
    return readyPromise;
  }
  async function analyze(fen){
    const key=String(fen||'').trim();
    if(!key)throw new Error('FEN manquante');
    if(cache.has(key))return cache.get(key);
    if(disposed)throw new Error('Stockfish controller disposed');
    await ensureReady();
    const myToken=++token;
    return new Promise((resolve,reject)=>{
      const next={fen:key,token:myToken,resolve,reject,evaluation:{cp:0,mate:null},depth:0,pv:[]};
      if(request){
        const stale=new Error('Stale Stockfish request');
        rejectRequest(stale);
        if(pendingStart){pendingStart.reject(stale);pendingStart=null;}
        restartWorker();
        queueAfterWorkerRestart(next);
        return;
      }
      if(pendingStart){pendingStart.reject(new Error('Stale Stockfish request'));pendingStart=null;}
      startRequest(next);
    });
  }
  function cancel(){token++;try{worker?.postMessage('stop')}catch{}rejectRequest(new Error('Stockfish request cancelled'));if(pendingStart){const next=pendingStart;pendingStart=null;next.reject(new Error('Stockfish request cancelled'));}}
  function clearCache(){cache.clear();}
  function dispose(){disposed=true;cancel();clearCache();clearRequestTimer();clearReadyState();terminateWorker();}
  return {ensureReady,analyze,cancel,clearCache,dispose,get unavailable(){return unavailable},get cacheSize(){return cache.size}};
}
