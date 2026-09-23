const DEFAULT_TIMEOUT=20000;

export function createStockfishController({workerFactory,timeoutMs=DEFAULT_TIMEOUT,depth=16,cacheSize=64}={}){
  if(typeof workerFactory!=='function')throw new Error('workerFactory is required');
  let worker=null,readyPromise=null,readyResolve=null,readyReject=null,readyTimer=null;
  let request=null,pendingStart=null,token=0,disposed=false,unavailable=false;
  const cache=new Map();

  function setCache(key,value){cache.delete(key);cache.set(key,value);while(cache.size>cacheSize)cache.delete(cache.keys().next().value);}
  function rejectRequest(reason){if(request){const old=request;request=null;old.reject(reason instanceof Error?reason:new Error(String(reason)));}}
  function handleLine(raw){
    const line=typeof raw==='string'?raw:raw?.line||'';
    if(line.includes('engine load error')){unavailable=true;readyReject?.(new Error(line));return;}
    if(line.includes('uciok')){try{worker?.postMessage('setoption name MultiPV value 1');worker?.postMessage('isready')}catch(error){readyReject?.(error)}}
    if(line.includes('readyok')&&readyResolve){const resolve=readyResolve;readyResolve=null;readyReject=null;clearTimeout(readyTimer);readyTimer=null;resolve(worker)}
    if(line.startsWith('bestmove ')){
      if(!request){
        if(pendingStart){const next=pendingStart;pendingStart=null;startRequest(next);}
        return;
      }
      const current=request;request=null;
      const bestMove=line.split(/\s+/)[1]||null;
      const result={bestMove,evaluation:current.evaluation,depth:current.depth};
      if(current.token===token){setCache(current.fen,result);current.resolve(result);}else current.reject(new Error('Stale Stockfish result'));
      if(pendingStart){const next=pendingStart;pendingStart=null;startRequest(next);}
    }
    if(request&&line.startsWith('info ')&&line.includes(' score ')){
      const mcp=line.match(/\bscore cp (-?\d+)/),mm=line.match(/\bscore mate (-?\d+)/),md=line.match(/\bdepth (\d+)/);
      if(mcp||mm)request.evaluation={cp:mcp?Number(mcp[1]):0,mate:mm?Number(mm[1]):null};
      if(md)request.depth=Number(md[1]);
    }
  }
  function ensureReady(){
    if(disposed)return Promise.reject(new Error('Stockfish controller disposed'));
    if(readyPromise)return readyPromise;
    unavailable=false;
    readyPromise=new Promise((resolve,reject)=>{
      readyResolve=resolve;readyReject=reject;
      try{
        worker=workerFactory();
        worker.onmessage=e=>handleLine(e.data);
        worker.onerror=e=>{const error=new Error(e?.message||'Stockfish worker unavailable');unavailable=true;readyReject?.(error);readyResolve=null;readyReject=null;readyPromise=null;try{worker?.terminate()}catch{}worker=null;rejectRequest(error)};
        readyTimer=setTimeout(()=>{const error=new Error('Stockfish ne répond pas');unavailable=true;readyResolve=null;readyReject=null;readyPromise=null;try{worker?.terminate()}catch{}worker=null;reject(error)},timeoutMs);
        worker.postMessage('uci');
      }catch(error){readyPromise=null;readyResolve=null;readyReject=null;reject(error)}
    });
    return readyPromise;
  }
  function startRequest(next){
    request=next;
    try{worker.postMessage(`position fen ${next.fen}`);worker.postMessage(`go depth ${depth}`)}catch(error){const current=request;request=null;current.reject(error)}
  }
  async function analyze(fen){
    const key=String(fen||'').trim();
    if(!key)throw new Error('FEN manquante');
    if(cache.has(key))return cache.get(key);
    if(disposed)throw new Error('Stockfish controller disposed');
    await ensureReady();
    const myToken=++token;
    return new Promise((resolve,reject)=>{
      const next={fen:key,token:myToken,resolve,reject,evaluation:{cp:0,mate:null},depth:0};
      if(request){try{worker?.postMessage('stop')}catch{}rejectRequest(new Error('Stale Stockfish request'));if(pendingStart)pendingStart.reject(new Error('Stale Stockfish request'));pendingStart=next;return;}
      if(pendingStart){pendingStart.reject(new Error('Stale Stockfish request'));pendingStart=null;}
      startRequest(next);
    });
  }
  function cancel(){token++;try{worker?.postMessage('stop')}catch{}rejectRequest(new Error('Stockfish request cancelled'));if(pendingStart){const next=pendingStart;pendingStart=null;next.reject(new Error('Stockfish request cancelled'));}}
  function clearCache(){cache.clear();}
  function dispose(){disposed=true;cancel();clearCache();clearTimeout(readyTimer);try{worker?.postMessage('quit')}catch{}try{worker?.terminate()}catch{}worker=null;readyPromise=null;readyResolve=null;readyReject=null;}
  return {ensureReady,analyze,cancel,clearCache,dispose,get unavailable(){return unavailable}};
}
