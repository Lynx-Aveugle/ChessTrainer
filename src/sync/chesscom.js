export const CHESSCOM_BASE='https://api.chess.com/pub';
export const CHESSCOM_TIMEOUT_MS=25000;

export async function fetchWithTimeout(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),options.timeout||CHESSCOM_TIMEOUT_MS);
  try{return await fetch(url,{...options,signal:controller.signal,mode:'cors',cache:'no-store'});}
  catch(error){if(error?.name==='AbortError')throw new Error('Délai dépassé');throw error;}
  finally{clearTimeout(timer);}
}
export async function fetchChessComJson(url){
  try{const r=await fetchWithTimeout(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}
  catch(error){throw new Error(`Connexion directe à Chess.com impossible (${error.message}). Vérifie la connexion Internet et que l’API publique Chess.com autorise encore les requêtes navigateur.`);}
}
export async function fetchChessComPgn(archiveUrl){
  const url=`${String(archiveUrl).replace(/\/$/,'')}/pgn`;
  try{const r=await fetchWithTimeout(url,{headers:{Accept:'application/x-chess-pgn,text/plain,*/*'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}
  catch(error){throw new Error(`Archive Chess.com inaccessible (${error.message})`);}
}
export function chessComMonthKey(url){const m=String(url).match(/\/games\/(\d{4})\/(\d{2})\/?$/);return m?`${m[1]}/${m[2]}`:String(url);}
export function chessComPgnIsStandard(headers){const variant=String(headers?.Variant||headers?.Rules||'').trim().toLowerCase();return !variant||variant==='standard'||variant==='chess';}
export function hashId(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return `pgn-${(h>>>0).toString(16)}-${text.length}`;}
function chessComLinkFromPgn(pgn){const m=String(pgn||'').match(/^\[Link\s+"([^"]+)"\]\s*$/mi);return m?m[1]:'';}
export function chessComStableId(game,pgn){
  const candidates=[game?.chessComUrl,game?.url,chessComLinkFromPgn(pgn)];
  for(const value of candidates){
    const raw=String(value||'');
    const match=raw.match(/\/(?:live|daily|game)\/(\d+)/i);
    if(match)return `chesscom-${match[1]}`;
  }
  if(game?.uuid)return `chesscom-${game.uuid}`;
  return hashId(`Chess.com|${String(pgn||'').trim()}`);
}
