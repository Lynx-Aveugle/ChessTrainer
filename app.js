import {Chess} from "./chess.js";
import {positionKeyFromFen} from "./src/chess/position.js";
import {APP_VERSION,DATA_SCHEMA_VERSION} from "./version.js";
import {PIECE_DATA} from "./piece-assets.js";
import {parsePGN,exportPGN,headersFrom,splitGames,openingLineUltraFast} from "./pgn.js";
import {getAll,put,putMany,remove,clearAll,replaceAll,migrateLegacy,requestPersistence,estimateStorage} from "./db.js";
import {createStockfishController} from "./src/analysis/stockfish.js";
import {normalizeEngineEvaluation} from "./src/analysis/evaluation.js";
import {getEffectiveAnnotations,getStoredGlobalAnnotations,setGlobalAnnotation,mergeGlobalAnnotations} from "./src/analysis/annotations.js";
import {createNavigator} from "./src/chess/navigation.js";
import {buildArrowDescriptors} from "./src/analysis/arrows.js";
import {getArrowCacheKey,getCachedArrows,setCachedArrows,clearArrowCache} from "./src/analysis/cache.js";
import {createArrowRenderer} from "./src/ui/arrows.js";
import {createBoardRenderer,renderBoardSquares} from "./src/ui/board.js";
import {renderMovesList} from "./src/ui/moves.js";
import {buildGlobalTree as buildGlobalTreePure,clearOpeningPrefixCache} from "./src/games/tree.js";
import {loadGames as storageLoadGames,saveGame as storageSaveGame,migrateStorage,keepStoragePersistent,getStorageEstimate} from "./src/persistence/storage.js";
import {validateBackupPayload,migrateBackupGames} from "./src/persistence/backup.js";
import {CHESSCOM_BASE as SYNC_BASE,chessComMonthKey as syncMonthKey,chessComPgnIsStandard as syncPgnIsStandard,chessComStableId as syncStableId,fetchChessComJson as syncFetchJson,fetchChessComPgn as syncFetchPgn,fetchWithTimeout as syncFetchWithTimeout} from "./src/sync/chesscom.js";
import {createRouter} from "./src/app/router.js";
import {runBoot,registerServiceWorker} from "./src/app/lifecycle.js";
import {state,resetUserScopedState} from "./src/app/state.js";
import {trainingPuzzleKey} from "./src/training/puzzles.js";
import {createStatisticsRenderer} from "./src/ui/statistics.js";
import {createTrainingController} from "./src/training/controller.js";
import {createTrainingRenderer} from "./src/ui/training.js";
const DEFAULT_USER="HighTaxi";
const ANNOTATION_DEFS=[
  {icon:"!!",label:"Excellent / décisif",kind:"good",nag:3},
  {icon:"!",label:"Bon coup",kind:"good",nag:1},
  {icon:"★",label:"Coup brillant",kind:"good",nag:3},
  {icon:"👍",label:"Bon coup",kind:"good",nag:1},
  {icon:"✓",label:"Coup correct",kind:"good",nag:null},
  {icon:"📖",label:"Coup théorique",kind:"neutral",nag:null},
  {icon:"?!",label:"Coup douteux",kind:"bad",nag:6},
  {icon:"?",label:"Erreur",kind:"bad",nag:2},
  {icon:"❌",label:"Mauvais coup",kind:"bad",nag:2},
  {icon:"??",label:"Grosse erreur",kind:"bad",nag:4}
];
const CHESS_DRAW_RESULTS=new Set(["agreed","stalemate","repetition","insufficient","timevsinsufficient","50move","50_moves","draw"]);
const CHESS_SYNC_KEY="ht_chess_sync_archives_v3";
const CHESS_SYNC_STATUS_KEY="ht_chess_sync_status_v1";
const TRAINING_PUZZLES_KEY="ht_training_puzzles_v1";
const TRAINING_SOLVED_KEY="ht_training_solved_v1";
function loadSyncStatus(){try{return JSON.parse(localStorage.getItem(CHESS_SYNC_STATUS_KEY)||"null")}catch{return null}}
function saveSyncStatus(status){try{localStorage.setItem(CHESS_SYNC_STATUS_KEY,JSON.stringify(status))}catch{}}
function renderSyncStatus(){const el=$("syncStatus");if(!el)return;const s=loadSyncStatus();if(!s){el.textContent="Aucune synchronisation effectuée";return}const when=s.at?new Date(s.at).toLocaleString("fr-FR"):"inconnue";el.textContent=`Dernière sync : ${s.ok?"réussie":"échouée"} · ${when}${s.message?` · ${s.message}`:""}`;}
state.chess=new Chess();
state.globalMoveAnnotations=loadGlobalMoveAnnotations();
state.trainingPuzzles=loadTrainingPuzzles();
state.trainingSolvedPositions=loadTrainingSolvedPositions();
try{state.appSettings={...state.appSettings,...JSON.parse(localStorage.getItem("ht_settings_v2")||"{}")}}catch{}
state.appSettings.chesscomUser=String(state.appSettings.chesscomUser||DEFAULT_USER).trim()||DEFAULT_USER;
let pgnRenderToken=0;
let persistTimer=null,clubState=null;
let gameSearch="",gameSearchTimer=null,gameResultFilter="all",gameColorFilter="all",gameSourceFilter="all",gameRenderLimit=100;
function currentUser(){return state.appSettings.chesscomUser;}
function saveAppSettings(){try{localStorage.setItem("ht_settings_v2",JSON.stringify(state.appSettings))}catch{}}

const $=id=>document.getElementById(id);
function toast(t){const x=$("toast");x.textContent=t;x.style.display="block";clearTimeout(window._toast);window._toast=setTimeout(()=>x.style.display="none",3200)}
const appRouter=createRouter({onNavigate(id){
  if(id!=="boardScreen"&&document.body.classList.contains("analysisActive")){saveNoteBeforeNavigation();scheduleBackgroundPersist();}
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active");
  document.body.classList.toggle("analysisActive",id==="boardScreen");
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));
  if(id==="home")renderHome();
  if(id==="games"){renderGames();renderPgnCollections();}
  if(id==="boardScreen"){renderBoard();if(!state.globalTree&&!state.globalTreeBuilding)setTimeout(()=>buildGlobalTree(),0);onPositionChanged();}
  if(id==="stats")renderStats();
  if(id==="training")renderTraining();
}});
function nav(id){return appRouter.navigate(id);}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.screen)));
$("gameSearch")?.addEventListener("input",e=>{gameSearch=e.target.value;gameRenderLimit=100;clearTimeout(gameSearchTimer);gameSearchTimer=setTimeout(renderGames,180)});
$("gameResultFilter")?.addEventListener("change",e=>{gameResultFilter=e.target.value;gameRenderLimit=100;renderGames()});
$("gameColorFilter")?.addEventListener("change",e=>{gameColorFilter=e.target.value;gameRenderLimit=100;renderGames()});
$("gameSourceFilter")?.addEventListener("change",e=>{gameSourceFilter=e.target.value;gameRenderLimit=100;renderGames()});

let pgnColor="w";
function gamesForPgnColor(){return sorted().filter(g=>userSide(g)===pgnColor);}
const recreatedPgnCache=new Map();
function recreatedPgn(g){
  const cacheKey=String(g.updatedAt||0);
  const cached=recreatedPgnCache.get(String(g.id));
  if(cached?.key===cacheKey)return cached.value;
  try{const parsed=parsePGN(g.pgn||"")[0];if(!parsed)return "";if(g.analysisTree){parsed.root=restoreTree(g.analysisTree);parsed.startFen=parsed.root.fen;}const value=exportPGN(parsed);recreatedPgnCache.set(String(g.id),{key:cacheKey,value});return value}catch{return ""}
}
function renderPgnCollections(){
  const token=++pgnRenderToken,games=gamesForPgnColor(),title=$("pgnPanelTitle");
  if(title)title.textContent=pgnColor==="w"?"HighTaxi avec les Blancs":"HighTaxi avec les Noirs";
  const a=$("originalPgnCollection"),b=$("recreatedPgnCollection");
  if(a)a.value=games.map(g=>String(g.pgn||"").trim()).filter(Boolean).join("\n\n");
  if(b)b.value="Génération du PGN recréé…";
  document.querySelectorAll(".pgnTab").forEach(x=>x.classList.toggle("active",x.dataset.pgnColor===pgnColor));
  let index=0,out=[];
  const step=()=>{if(token!==pgnRenderToken)return;const end=Math.min(index+8,games.length);for(;index<end;index++){const value=recreatedPgn(games[index]);if(value)out.push(value)}if(b)b.value=out.join("\n\n");if(index<games.length)setTimeout(step,0)};
  setTimeout(step,0);
}
async function copyPgnOutput(id){const el=$(id);if(!el)return;try{await navigator.clipboard.writeText(el.value);}catch{el.focus();el.select();document.execCommand("copy");}toast("PGN copié");}
document.querySelectorAll(".pgnTab").forEach(b=>b.addEventListener("click",()=>{pgnColor=b.dataset.pgnColor;renderPgnCollections();}));
$("copyOriginalPgn")?.addEventListener("click",()=>copyPgnOutput("originalPgnCollection"));
$("copyRecreatedPgn")?.addEventListener("click",()=>copyPgnOutput("recreatedPgnCollection"));
function ts(g){return Number(g.timestamp||0)||0}
function sorted(){return [...state.allGames].sort((a,b)=>ts(b)-ts(a))}
function safeGames(){return Array.isArray(state.allGames)?state.allGames:[]}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function loadGlobalMoveAnnotations(){try{const raw=localStorage.getItem("ht_global_move_annotations_v1");const data=raw?JSON.parse(raw):{};return data&&typeof data==="object"?data:{}}catch{return {}}}
function saveGlobalMoveAnnotations(){try{localStorage.setItem("ht_global_move_annotations_v1",JSON.stringify(state.globalMoveAnnotations))}catch{}}
function loadTrainingPuzzles(){try{const data=JSON.parse(localStorage.getItem(TRAINING_PUZZLES_KEY)||"[]");return Array.isArray(data)?data:[]}catch{return []}}
function saveTrainingPuzzles(){try{localStorage.setItem(TRAINING_PUZZLES_KEY,JSON.stringify(state.trainingPuzzles||[]));state.trainingPuzzlesRevision=Number(state.trainingPuzzlesRevision||0)+1;return true}catch{return false}}
function loadTrainingSolvedPositions(){try{const data=JSON.parse(localStorage.getItem(TRAINING_SOLVED_KEY)||"[]");return Array.isArray(data)?[...new Set(data.map(String))]:[]}catch{return []}}
function saveTrainingSolvedPositions(){try{localStorage.setItem(TRAINING_SOLVED_KEY,JSON.stringify(state.trainingSolvedPositions||[]));state.dataRevision=Number(state.dataRevision||0)+1;return true}catch{return false}}
function markTrainingPositionSolved(key){const value=String(key||"");if(!value)return;if(!(state.trainingSolvedPositions||[]).includes(value)){state.trainingSolvedPositions=[...(state.trainingSolvedPositions||[]),value];saveTrainingSolvedPositions();renderTraining();}}
function annotationKind(a){
  const def=ANNOTATION_DEFS.find(x=>x.icon===a);
  if(def)return def.kind;
  if(["❌","⚠️"].includes(a))return "bad";
  if(["⭐","💡","🎯"].includes(a))return "good";
  return "neutral";
}
function annotationDef(a){return ANNOTATION_DEFS.find(x=>x.icon===a)||{icon:a,label:"Annotation personnelle",kind:annotationKind(a),nag:null}}
function findMoveBySan(fen,san){try{const c=new Chess(fen);for(const m of c.legalMoves())if(c.san(m)===san)return m}catch{}return null}

const CHESSCOM_BASE=SYNC_BASE;
const CHESSCOM_TIMEOUT_MS=25000;
const fetchWithTimeout=syncFetchWithTimeout;
const fetchChessComJson=syncFetchJson;
const fetchChessComPgn=syncFetchPgn;
const chessComMonthKey=syncMonthKey;
const chessComPgnIsStandard=syncPgnIsStandard;
const chessComStableId=syncStableId;

async function migrateChessComStableIds(){
  const games=await getAll();
  const chessGames=games.filter(g=>g.source==="Chess.com");
  if(!chessGames.length)return 0;
  const byId=new Map(games.map(g=>[String(g.id),g]));
  const updates=[],deletes=[];let changed=0;
  for(const g of chessGames){
    const target=chessComStableId(g,g.pgn||"");
    if(!target||String(g.id)===target)continue;
    const existing=byId.get(target);
    if(existing&&existing!==g){
      const keep=(existing.analysisTree||existing.annotationCount>0)?existing:g;
      const other=keep===existing?g:existing;
      const merged={...other,...keep,id:target};
      if((other.annotationCount||0)>(keep.annotationCount||0))merged.annotationCount=other.annotationCount;
      if(!merged.analysisTree&&(other.analysisTree||keep.analysisTree))merged.analysisTree=other.analysisTree||keep.analysisTree;
      merged.updatedAt=Math.max(keep.updatedAt||0,other.updatedAt||0);
      updates.push(merged);
      deletes.push(g.id);
      byId.set(target,merged);changed++;
    }else{
      const migrated={...g,id:target,updatedAt:g.updatedAt||Date.now()};
      updates.push(migrated);deletes.push(g.id);byId.delete(String(g.id));byId.set(target,migrated);changed++;
    }
  }
  if(updates.length)await putMany(updates);
  for(const id of deletes)await remove(id);
  return changed;
}
function userSide(g){if(!g)return null;const w=String(g.white||"").trim().toLowerCase()===currentUser().toLowerCase(),b=String(g.black||"").trim().toLowerCase()===currentUser().toLowerCase();return w&&!b?"w":b&&!w?"b":null}
function resultForUser(g){
  const r=g.result||"*",side=userSide(g); if(!side||r==="*")return "unknown"; if(r==="1/2-1/2")return "draw"; return (side==="w"&&r==="1-0")||(side==="b"&&r==="0-1")?"win":"loss";
}
function parseTimestamp(h,fallback){
  if(h.UTCDate&&h.UTCTime){const d=Date.parse(`${h.UTCDate.replace(/\./g,"-")}T${h.UTCTime.replace(/\./g,":")}Z`);if(Number.isFinite(d))return d/1000}
  if(h.Date){const d=Date.parse(h.Date.replace(/\./g,"-"));if(Number.isFinite(d))return d/1000}
  return fallback;
}
function openingName(value){
  const raw=String(value||"").trim();
  if(!raw)return "";
  try{
    const u=new URL(raw);
    if(/chess\.com$/i.test(u.hostname)&&u.pathname.startsWith("/openings/")){
      const slug=u.pathname.split("/").filter(Boolean).pop()||"";
      return decodeURIComponent(slug).replace(/-/g," ").replace(/\s+/g," ").trim();
    }
  }catch{}
  return raw;
}
function normalizeChessResult(game,h){
  const pgnResult=String(h.Result||"").trim();
  if(["1-0","0-1","1/2-1/2","*"].includes(pgnResult))return pgnResult;
  const wr=String(game?.white?.result||"").toLowerCase(),br=String(game?.black?.result||"").toLowerCase();
  if(CHESS_DRAW_RESULTS.has(wr)||CHESS_DRAW_RESULTS.has(br))return "1/2-1/2";
  if(wr==="win"||br==="win")return wr==="win"?"1-0":"0-1";
  if(wr==="checkmated"||wr==="timeout"||wr==="resigned"||wr==="abandoned")return "0-1";
  if(br==="checkmated"||br==="timeout"||br==="resigned"||br==="abandoned")return "1-0";
  return "*";
}
function mainlineSignature(root){const out=[];let n=root;while(n?.children?.[0]){n=n.children[0];out.push(n.san)}return out.join(" ")}
function validateParsedGame(parsed){
  if(!parsed?.root)throw new Error("Partie sans arbre de coups");
  const c=new Chess(parsed.startFen||Chess.START_FEN);
  if(!c.king("w")||!c.king("b"))throw new Error("FEN de départ invalide : roi manquant");
  const st=c.status();
  if(!Number.isInteger(st.legal)||st.legal<0)throw new Error("Position de départ incohérente");
}
function gameIdentity(source,parsed,headers){return hashId(`${source}|${headers.Link||headers.URL||""}|${headers.White||""}|${headers.Black||""}|${headers.Date||""}|${headers.UTCDate||""}|${headers.UTCTime||""}|${headers.Round||""}|${headers.Result||"*"}|${parsed.startFen||Chess.START_FEN}|${mainlineSignature(parsed.root)}`)}
function metaFromHeaders(h,source,fallback,pgn,extra={}){return {id:hashId(`${source}|${pgn}`),source,timestamp:parseTimestamp(h,fallback),date:h.Date||"",time:h.UTCTime||"",white:h.White||"?",black:h.Black||"?",result:h.Result||"*",eco:openingName(h.ECO||""),time_control:h.TimeControl||"",event:h.Event||"",site:h.Site||"",round:h.Round||"",pgn,analysisTree:null,annotationCount:0,...extra}}
function serializeTree(root){
  function clean(n){return {move:n.move||null,san:n.san||null,fen:n.fen,annotations:[...(n.annotations||[])],suppressedAnnotations:[...(n.suppressedAnnotations||[])],comment:n.comment||"",note:n.note||"",clock:n.clock||null,nags:[...(n.nags||[])],children:(n.children||[]).map(clean)}}
  return clean(root)
}
function restoreTree(data,parent=null){
  const n={id:crypto.randomUUID(),parent,children:[],move:data.move||null,san:data.san||null,fen:data.fen,annotations:[...(data.annotations||[])],suppressedAnnotations:[...(data.suppressedAnnotations||[])],comment:data.comment||"",note:data.note||"",clock:data.clock||null,nags:[...(data.nags||[])]};
  n.children=(data.children||[]).map(c=>restoreTree(c,n));return n;
}
function countAnnotations(n){let x=(n.annotations?.length||0)+(n.note?.trim()?1:0);for(const c of n.children||[])x+=countAnnotations(c);return x}
function findNode(root,id){if(root.id===id)return root;for(const c of root.children||[]){const f=findNode(c,id);if(f)return f}return null}
function indexPersistedAnnotations(games){
  for(const game of Array.isArray(games)?games:[]){
    if(!game?.analysisTree)continue;
    try{
      const root=restoreTree(game.analysisTree);
      const walk=node=>{
        for(const child of node.children||[]){
          if(child.move&&child.annotations?.length)for(const icon of new Set(child.annotations))setGlobalAnnotation(state.globalMoveAnnotations,node.fen,child.move,icon,true);
          walk(child);
        }
      };
      walk(root);
    }catch{}
  }
  saveGlobalMoveAnnotations();
}

let arrowRenderer=null;
function buildGlobalTree(){
  if(state.globalTreeBuilding)return;
  const filterKey=state.globalTreeSideFilter;
  if(state.globalTree&&state.globalTreeBuiltFor===state.dataRevision&&state.globalTree._filter===filterKey)return;
  state.globalTreeBuilding=true;
  const games=safeGames();
  state.globalTreeProgress={done:0,total:games.filter(g=>g.pgn&&(!filterKey||filterKey==="all"||userSide(g)===filterKey)).length};
  try{
    state.globalTree=buildGlobalTreePure(games,{maxPlies:24,sideFilter:filterKey,user:currentUser(),globalAnnotations:state.globalMoveAnnotations,onProgress:(done,total)=>{state.globalTreeProgress={done,total}}});
    state.globalTreeBuiltFor=state.dataRevision;
    renderGlobalTree(state.currentNode?.fen||Chess.START_FEN);
    renderMoves();
    renderArrowsForPosition(state.currentNode?.fen||Chess.START_FEN,null);
  }finally{
    state.globalTreeBuilding=false;
    renderGlobalTree(state.currentNode?.fen||Chess.START_FEN);
    renderMoves();
    renderArrowsForPosition(state.currentNode?.fen||Chess.START_FEN,null);
    if(state.globalTreePendingFilter!==null&&state.globalTreePendingFilter!==(state.globalTree?._filter)){const next=state.globalTreePendingFilter;state.globalTreePendingFilter=null;state.globalTreeSideFilter=next;state.analysisScope=next;state.globalTree=null;state.globalTreeBuiltFor=0;setTimeout(()=>buildGlobalTree(),0);}
  }
}

function ensureArrowRenderer(){
  const board=$("board");if(!board)return null;
  if(!arrowRenderer){arrowRenderer=createArrowRenderer(board,{onArrowMove:move=>positionNavigator.navigateByMove(move)});}
  return arrowRenderer;
}
function renderArrowsForPosition(fen,engineBest=null){
  const renderer=ensureArrowRenderer();if(!renderer)return;
  if(!state.appSettings.showArrows){renderer.clear();return;}
  const key=positionKeyFromFen(fen);
  if(!state.globalTree){renderer.clear();return;}
  const cacheKey=getArrowCacheKey({positionKey:key,dataRevision:state.dataRevision,sideFilter:state.globalTreeSideFilter,annotationRevision:state.dataRevision,engineRevision:engineBest?String(engineBest):"none"});
  let arrows=getCachedArrows(cacheKey);
  if(!arrows){arrows=buildArrowDescriptors(key,state.globalTree,{sideFilter:state.globalTreeSideFilter,user:{side:userSide(state.activeGame)},engineBest});arrows=arrows.slice(0,12);setCachedArrows(cacheKey,arrows);}
  renderer.render(arrows,{orientation:boardSquares().files[0]==="h"?"black":"white"});
}
function gaugeMarkup(stats,total){
  const white=stats?.white||0,draw=stats?.draw||0,black=stats?.black||0,known=white+draw+black;
  if(!known)return `<div class="treeGaugeWrap"><div class="muted">Résultat indisponible</div></div>`;
  const w=Math.round(white/known*100),d=Math.round(draw/known*100),b=Math.max(0,100-w-d),unknown=Math.max(0,(total||0)-known);
  return `<div class="treeGaugeWrap"><div class="treeGauge" aria-label="Blancs ${w} %, nulles ${d} %, Noirs ${b} %"><span class="gWhite" style="width:${w}%"></span><span class="gDraw" style="width:${d}%"></span><span class="gBlack" style="width:${b}%"></span></div><div class="treeGaugeLabels"><span>Bl ${w}%</span><span>= ${d}%</span><span>No ${b}%</span></div>${unknown?`<div class="treeGaugeUnknown">${unknown} résultat(s) inconnu(s)</div>`:""}</div>`;
}

function renderGlobalArrows(fen){renderArrowsForPosition(fen,null)}
function renderGlobalTree(fen){
  const box=$("globalTree");if(!box)return;
  if(state.globalTreeBuilding){const d=state.globalTreeProgress.done,t=state.globalTreeProgress.total,p=t?Math.round(d/t*100):0;box.innerHTML=`<div class="treeProgress"><b>Construction de l’arbre global…</b><div class="treeProgressBar"><span style="width:${p}%"></span></div><div class="muted">${d.toLocaleString("fr-FR")} / ${t.toLocaleString("fr-FR")} parties · ${p}%</div></div>`;return}
  if(!state.globalTree){box.innerHTML='<div class="muted">L’arbre sera construit à partir de ta base.</div>';return}
  const node=state.globalTree.nodes.get(positionKeyFromFen(fen))||state.globalTree.nodes.get(positionKeyFromFen(Chess.START_FEN));
  if(!node){box.innerHTML='<div class="muted">Position absente de l’arbre global.</div>';return}
  const edges=[...node.children.values()].sort((a,b)=>b.count-a.count);
  if(!edges.length){box.innerHTML=`<div class="treeTitle">Aucun coup enregistré depuis cette position.</div>`;return}
  const filterLabel=state.globalTreeSideFilter==="w"?"tes parties avec les Blancs":state.globalTreeSideFilter==="b"?"tes parties avec les Noirs":"toutes tes parties";
  box.innerHTML=`<div class="analysisScopeTabs" role="tablist"><button class="analysisScopeTab ${state.globalTreeSideFilter==="all"?"active":""}" data-side="all">Toutes</button><button class="analysisScopeTab ${state.globalTreeSideFilter==="w"?"active":""}" data-side="w">HighTaxi Blancs</button><button class="analysisScopeTab ${state.globalTreeSideFilter==="b"?"active":""}" data-side="b">HighTaxi Noirs</button></div><div class="treeTitle">${node.count.toLocaleString("fr-FR")} partie(s) · ${edges.length} prochain(s) coup(s) · ${filterLabel}</div><div class="treeBranches">${edges.map(e=>{const anns=Object.entries(e.annotations||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([a,n])=>`${esc(a)}${n>1?`×${n}`:""}`).join(" ");return `<button class="treeBranch" data-fen="${esc(e.node.fen)}" data-game="${esc(e.sampleGameId||"")}"><div class="treeMoveBlock"><span class="treeMove">${esc(e.san)}</span><span class="treeCount">${e.count.toLocaleString("fr-FR")} partie(s)</span>${e.playedByUser?`<span class="treeMine">${e.playedByUser}× par toi</span>`:""}</div>${gaugeMarkup(e.stats,e.count)}<div class="treeAnnotations">${anns||"—"}</div></button>`}).join("")}</div>`;
  box.querySelectorAll(".analysisScopeTab").forEach(b=>b.addEventListener("click",()=>setAnalysisScope(b.dataset.side||"all")));
  box.querySelectorAll(".treeBranch").forEach(b=>b.addEventListener("click",async()=>{renderGlobalTree(b.dataset.fen);if(b.dataset.game){await openGame(b.dataset.game);gotoPositionKey(positionKeyFromFen(b.dataset.fen));}}));
  try{renderArrowsForPosition(fen,null)}catch(err){console.warn("Global arrows disabled for this render",err)}
}
function invalidateGlobalTree({rebuild=false}={}){state.globalTree=null;state.globalTreeBuiltFor=0;state.globalTreeProgress={done:0,total:0};state.dataRevision++;state.trainingCacheRevision=-1;state.trainingCache=[];pgnRenderToken++;if(rebuild&&document.body.classList.contains("analysisActive"))setTimeout(()=>buildGlobalTree(),0);}
function renderHome(){
  $("homeGames").textContent=safeGames().length;
  const g=sorted()[0];$("homeLast").textContent=g?`${g.white||"?"} — ${g.black||"?"} · ${g.result||"*"} · ${g.source||"PGN"}`:"Aucune partie";
  const ann=safeGames().reduce((n,g)=>n+(g.annotationCount||0),0);$("homeReview").textContent=ann?`${ann} annotation(s) à revoir`:`Aucune position annotée`;
}
const statisticsRenderer=createStatisticsRenderer({
  document,
  getGames:safeGames,
  getUser:currentUser,
  getGlobalAnnotations:()=>state.globalMoveAnnotations,
  getRevision:()=>state.dataRevision,
  esc,
  openPosition:async(gameId,fen)=>{await openGame(gameId);gotoPositionKey(positionKeyFromFen(fen));}
});
function renderStats(){statisticsRenderer.render();}
statisticsRenderer.bind();
const trainingController=createTrainingController({state,getGames:()=>safeGames().filter(g=>userSide(g)),currentUser,analyzeFen:fen=>ensureEngineController().analyze(fen),cancelEngineAnalysis,render:()=>renderTraining(),toast,onPositionChanged});
const trainingUI=createTrainingRenderer({document,getGames:safeGames,getPuzzles:()=>state.trainingPuzzles||[],getUser:currentUser,getGlobalAnnotations:()=>state.globalMoveAnnotations,getSolvedPositions:()=>new Set(state.trainingSolvedPositions||[]),markPositionSolved:markTrainingPositionSolved,getRevision:()=>state.dataRevision,getPuzzleRevision:()=>state.trainingPuzzlesRevision||0,isScanActive:()=>trainingController.active(),analyzeFen:fen=>ensureEngineController().analyze(fen),cancelEngineAnalysis,toast,esc,pieceSVG,annotationDef,installPieceFallbacks,openPosition:async(gameId,fen)=>{await openGame(gameId);gotoPositionKey(positionKeyFromFen(fen));}});
function renderTraining(){trainingUI.render();}
trainingUI.bind();

function renderGames(){
  const query=gameSearch.trim().toLowerCase();
  const a=sorted().filter(g=>{const hay=[g.white,g.black,g.eco,g.date,g.event,g.source,g.time_control].join(" ").toLowerCase();const result=gameResultFilter==="all"||resultForUser(g)===gameResultFilter;const color=gameColorFilter==="all"||userSide(g)===gameColorFilter;const source=gameSourceFilter==="all"||String(g.source||"").toLowerCase()===gameSourceFilter;return(!query||hay.includes(query))&&result&&color&&source});
  const el=$("gameList");if(!a.length){el.innerHTML='<div class="empty">Aucune partie ne correspond aux filtres.</div>';return}
  const visible=a.slice(0,gameRenderLimit);
  el.innerHTML=visible.map(g=>`<div class="game"><button class="gameOpen" data-id="${esc(g.id)}"><b>${esc(g.white||"?")}</b> — <b>${esc(g.black||"?")}</b><div class="meta">${esc(g.result||"*")} · ${esc(g.source||"PGN")} · ${esc(g.date||"")}${g.time_control?" · "+esc(g.time_control):""}${g.eco?" · "+esc(g.eco):""}</div></button><button class="deleteGame" data-id="${esc(g.id)}" title="Supprimer">×</button></div>`).join("");
  if(visible.length<a.length){
    const more=document.createElement("button");
    more.className="loadMoreGames";
    more.type="button";
    more.textContent=`Afficher ${Math.min(100,a.length-visible.length).toLocaleString("fr-FR")} partie(s) de plus · ${visible.length.toLocaleString("fr-FR")} / ${a.length.toLocaleString("fr-FR")}`;
    more.addEventListener("click",()=>{gameRenderLimit+=100;renderGames()});
    el.appendChild(more);
  }
  el.querySelectorAll(".gameOpen").forEach(b=>b.addEventListener("click",()=>openGame(b.dataset.id)));
  el.querySelectorAll(".deleteGame").forEach(b=>b.addEventListener("click",async e=>{e.stopPropagation();const g=state.allGames.find(x=>String(x.id)===String(b.dataset.id));if(!g)return;if(!confirm(`Supprimer ${g.white} — ${g.black} ?`))return;await remove(g.id);state.allGames=await getAll();invalidateGlobalTree();if(state.activeGame?.id===g.id){state.activeGame=null;state.currentNode=null;state.chess=new Chess()}renderGames();renderHome();renderStats();renderTraining();toast("Partie supprimée")}));
}


async function openGame(id){
  await flushPendingPersist();
  saveNoteBeforeNavigation();
  const g=state.allGames.find(x=>String(x.id)===String(id));if(!g)return;
  try{
    const parsed=parsePGN(g.pgn||"")[0];
    if(!parsed)throw new Error("PGN inexploitable");
    const tree=normalizeRuntimeTree(g.analysisTree?restoreTree(g.analysisTree):parsed.root);
    // Keep the parsed headers/result while replacing only the analysis tree.
    parsed.root=tree; if(g.analysisTree)parsed.startFen=tree.fen;
    state.activeGame={...g,parsed};state.currentNode=tree;state.chess=new Chess(tree.fen);state.selectedSquare=null;state.lastMove=null;boardRotated=false;const nextScope=userSide(g)||"all";state.analysisScope=nextScope;if(state.globalTreeSideFilter!==nextScope){state.globalTreeSideFilter=nextScope;state.globalTree=null;state.globalTreeBuiltFor=0;state.globalTreePendingFilter=null;}nav("boardScreen");
  }catch(e){toast("Impossible de charger la partie : "+e.message)}
}
let boardRotated=false;
function boardSquares(){const scopeSide=state.analysisScope==="w"||state.analysisScope==="b"?state.analysisScope:userSide(state.activeGame);const black=scopeSide==="b";const flip=black!==boardRotated;const files=flip?["h","g","f","e","d","c","b","a"]:["a","b","c","d","e","f","g","h"];const ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1];return {files,ranks}}
function pieceSVG(p){
  const key=`${p[0]}${({p:'P',n:'N',b:'B',r:'R',q:'Q',k:'K'})[p[1]]||String(p[1]||'').toUpperCase()}`;
  const src=PIECE_DATA[key]||new URL(`./${key}.png`,import.meta.url).href;
  return `<img class="pieceSvg ${p[0]==="w"?"whitePiece":"blackPiece"} data-piece="${key}" src="${src}" alt="" draggable="false" aria-hidden="true">`;
}
const PIECE_FALLBACK={wK:"♔",wQ:"♕",wR:"♖",wB:"♗",wN:"♘",wP:"♙",bK:"♚",bQ:"♛",bR:"♜",bB:"♝",bN:"♞",bP:"♟"};
function installPieceFallbacks(container){
  container?.querySelectorAll("img.pieceSvg").forEach(img=>img.addEventListener("error",()=>{
    const span=document.createElement("span");span.className=`pieceFallback ${img.className}`;span.textContent=PIECE_FALLBACK[img.dataset.piece]||"♟";span.setAttribute("aria-hidden","true");img.replaceWith(span);
  },{once:true}));
}
let boardResizeObserver=null;
function syncBoardPixelSize(){
  const board=$("board");if(board){board.style.width="";board.style.height="";}
}
function installBoardResizeObserver(){
  const wrap=document.querySelector(".boardWrap");
  if(!wrap||boardResizeObserver)return;
  boardResizeObserver=new ResizeObserver(()=>syncBoardPixelSize());
  boardResizeObserver.observe(wrap);
  window.addEventListener("orientationchange",()=>setTimeout(syncBoardPixelSize,80));
}

function formatEval(cp,mate){if(mate!==null&&mate!==undefined){const n=Number(mate);if(n===0)return "MATE";return `${n>0?"#":"-#"}${Math.abs(n)}`}const v=Number(cp||0)/100;if(Math.abs(v)<0.005)return "0.00";return `${v>0?"+":""}${v.toFixed(2)}`}
function resetEngineDisplay(message="Analyse Stockfish en attente…"){
  const label=$("evalValue");if(label)label.textContent="—";
  const progress=$("evalProgressFill");if(progress)progress.style.width="50%";
  const legacyFill=$("evalFill");if(legacyFill)legacyFill.style.height="50%";
  const depth=$("evalDepth");if(depth)depth.textContent="Profondeur —";
  const best=$("bestMovePrimary");if(best)best.textContent="—";
  const bestEval=$("bestMoveEval");if(bestEval)bestEval.textContent="—";
  const engine=document.querySelector(".evalEngine");if(engine)engine.textContent="STOCKFISH";
  const diagnostics=$("engineDiagnosticsText");if(diagnostics&&message)diagnostics.textContent=message;
}
function cancelEngineAnalysis(message="Analyse Stockfish annulée."){
  state.engineSearchToken++;state.enginePendingFen=null;state.engineBusy=false;state.engineLastFen="";
  try{engineController?.cancel()}catch{}
  resetEngineDisplay(message);
}
function renderEvalBar(cp=0,mate=null,depth=null){const fill=$("evalFill"),label=$("evalValue"),bar=$("evalBar");if(!fill||!label||!bar)return;const pct=mate!==null?(mate>0?100:0):Math.max(0,Math.min(100,50+50*Math.tanh(Number(cp||0)/500)));fill.style.height=`${pct}%`;label.textContent=formatEval(cp,mate);bar.setAttribute("aria-label",`Évaluation Stockfish ${label.textContent}`);const progress=$("evalProgressFill");if(progress)progress.style.width=`${pct}%`;const depthEl=$("evalDepth");if(depthEl)depthEl.textContent=`Profondeur ${depth||"—"}`;const e=document.querySelector(".evalEngine");if(e)e.textContent=depth?`SF ${depth}`:"STOCKFISH";}
function setEngineUnavailable(message="Stockfish indisponible"){resetEngineDisplay(message);const e=document.querySelector(".evalEngine");if(e)e.textContent=message;const b=$("engineRetry");if(b)b.hidden=false;state.engineUnavailable=true;}
function setEngineReady(){state.engineUnavailable=false;$("engineRetry")?.setAttribute("hidden","");}
function uciToSan(fen,uci){try{if(!uci||uci.length<4)return uci||"—";const c=new Chess(fen);const move={from:uci.slice(0,2),to:uci.slice(2,4)};if(uci.length>4)move.promotion=uci[4];return c.san(move)}catch{return uci||"—"}}
let engineController=null;
function ensureEngineController(){
  if(engineController)return engineController;
  const makeWorker=()=>{const base=new URL("./stockfish-18-lite-single.js",import.meta.url);base.hash=`${encodeURIComponent(new URL("./stockfish-18-lite-single.wasm",import.meta.url).href)},worker`;return new Worker(base)};
  engineController=createStockfishController({workerFactory:makeWorker,timeoutMs:20000,searchTimeoutMs:7000,depth:16,cacheSize:128,hashMb:32,multiPv:1});
  return engineController;
}
async function scheduleEngineAnalysis(fen){
  if(!fen){cancelEngineAnalysis();return;}
  if(!state.appSettings.autoEngine){cancelEngineAnalysis("Analyse Stockfish désactivée.");return;}
  if(state.trainingScanActive){return;}
  if(state.engineUnavailable)return;
  resetEngineDisplay();
  const token=++state.engineSearchToken;
  state.enginePendingFen=fen;state.engineBusy=true;
  try{
    const result=await ensureEngineController().analyze(fen);
    if(token!==state.engineSearchToken||state.enginePendingFen!==fen||state.currentNode?.fen!==fen)return;
    state.enginePendingFen=null;state.engineLastFen=fen;state.engineBusy=false;setEngineReady();
    const normalized=normalizeEngineEvaluation(fen,result.evaluation||{});
    renderEvalBar(normalized.cp,normalized.mate,result.depth);
    const best=$("bestMovePrimary");if(best)best.textContent=uciToSan(fen,result.bestMove);
    const bestEval=$("bestMoveEval");if(bestEval)bestEval.textContent=formatEval(normalized.cp,normalized.mate);
    if(typeof renderArrowsForPosition==="function")renderArrowsForPosition(fen,result.bestMove);
  }catch(error){
    if(token!==state.engineSearchToken)return;
    state.engineBusy=false;state.enginePendingFen=null;
    if(error?.message!=="Stale Stockfish request"&&error?.message!=="Stockfish request cancelled")setEngineUnavailable(error?.message||"Stockfish indisponible");
  }
}
function onPositionChanged(){if(state.currentNode?.fen)scheduleEngineAnalysis(state.currentNode.fen);else cancelEngineAnalysis();}
$("engineRetry")?.addEventListener("click",()=>{state.engineUnavailable=false;state.engineSearchToken++;engineController?.dispose();engineController=null;resetEngineDisplay();state.enginePendingFen=state.currentNode?.fen||Chess.START_FEN;scheduleEngineAnalysis(state.enginePendingFen);});

function renderAnalysisScope(){
  const box=$("analysisScopeBar");if(!box)return;
  const current=state.analysisScope;
  box.querySelectorAll(".analysisScopeTopTab").forEach(b=>b.classList.toggle("active",b.dataset.side===current));
  const label=current==="w"?"HighTaxi — Blancs":current==="b"?"HighTaxi — Noirs":"Toutes les parties";
  const hint=$("analysisScopeHint");if(hint)hint.textContent=label;
  const treeHint=$("globalTreeHint");if(treeHint)treeHint.textContent=label;
}
$("analysisScopeBar")?.querySelectorAll(".analysisScopeTopTab").forEach(b=>b.addEventListener("click",()=>setAnalysisScope(b.dataset.side||"all")));
function setAnalysisScope(side){
  const next=side==="w"||side==="b"?side:"all";
  if(next===state.analysisScope){renderAnalysisScope();return;}
  state.analysisScope=next;state.globalTreeSideFilter=next;state.globalTree=null;state.globalTreeBuiltFor=0;state.globalTreePendingFilter=null;
  renderAnalysisScope();renderBoard();
  if(!state.globalTreeBuilding)buildGlobalTree();
}
const boardRenderer=createBoardRenderer({board:$("board"),renderSquares:renderBoardSquares});
function renderBoard(){
  const board=$("board");if(!board)return;board.innerHTML="";renderAnalysisScope();
  if(!state.currentNode){state.currentNode={fen:Chess.START_FEN,children:[],annotations:[],suppressedAnnotations:[],comment:"",note:"",nags:[]};state.chess=new Chess();}
  const {files,ranks}=boardSquares();
  boardRenderer.render({board,chess:state.chess,currentNode:state.currentNode,annotations:getEffectiveAnnotations(state.currentNode,state.globalMoveAnnotations),selectedSquare:state.selectedSquare,lastMove:state.lastMove,files,ranks,pieceSVG,annotationDef,installPieceFallbacks});
  const st=state.chess.status();$("position").textContent=st.checkmate?"Échec et mat":st.stalemate?"Pat":`${st.check?"Échec · ":""}Trait aux ${state.chess.turn==="w"?"Blancs":"Noirs"}`;
  $("boardPlayers").textContent=state.activeGame?`${state.activeGame.white||"?"} — ${state.activeGame.black||"?"} · ${state.activeGame.result||"*"}`:"Position initiale · HighTaxi Chess";
  renderMoves();renderAnnotations();renderNav();renderAnalysisMeta();try{renderGlobalTree(state.currentNode.fen)}catch(err){console.warn("Global tree render failed",err)}
  ensureArrowRenderer();renderArrowsForPosition(state.currentNode.fen,null);
  syncBoardPixelSize();
}
$("board").addEventListener("click",e=>{
  const cell=e.target.closest(".square");if(!cell)return;const s=cell.dataset.square;
  if(!state.currentNode)return;
  if(state.selectedSquare){
    const candidates=state.chess.legalMoves(state.selectedSquare).filter(m=>m.to===s);
    if(candidates.length){
      const existing=state.currentNode.children?.find(n=>n.move?.from===candidates[0].from&&n.move?.to===candidates[0].to&&String(n.move?.promotion||"")===String(candidates[0].promotion||""));
      if(existing){gotoNode(existing.id);return}
      saveNoteBeforeNavigation();
      let move=candidates[0];if(candidates.length>1){const promo=(prompt("Promotion : Q, R, B ou N","Q")||"Q").toLowerCase();move=candidates.find(m=>m.promotion===promo)||candidates[0]}
      const played=state.chess.play(move),node={id:crypto.randomUUID(),parent:state.currentNode,children:[],move,san:played.san,fen:played.fen,annotations:[],suppressedAnnotations:[],comment:"",note:"",clock:null,nags:[]};state.currentNode.children.push(node);state.currentNode=node;state.lastMove=[move.from,move.to];state.selectedSquare=null;schedulePersistAnalysis();renderBoard();onPositionChanged();return;
    }
  }
  if(state.chess.board[s]&&state.chess.board[s][0]===state.chess.turn){state.selectedSquare=s;renderBoard()}else{state.selectedSquare=null;renderBoard()}
});
function currentPath(){const path=[];let n=state.currentNode;while(n&&n.parent){path.unshift(n);n=n.parent}return path}
function moveOutcomeStats(node){
  if(!state.globalTree||!node?.parent?.fen||!node?.move)return null;
  const parent=state.globalTree.nodes.get(positionKeyFromFen(node.parent.fen));
  if(!parent)return null;
  const key=`${node.move.from||""}-${node.move.to||""}-${node.move.promotion||""}`;
  return parent.children.get(key)?.stats||null;
}
function moveGaugeMarkup(stats){
  const white=stats?.white||0,draw=stats?.draw||0,black=stats?.black||0,known=white+draw+black;
  if(!known)return "";
  const w=Math.round(white/known*100),d=Math.round(draw/known*100),b=Math.max(0,100-w-d);
  return `<span class="moveGaugeWrap" aria-label="Après ce coup : Blancs ${w} %, nulles ${d} %, Noirs ${b} %"><span class="moveGauge"><i class="gWhite" style="width:${w}%"></i><i class="gDraw" style="width:${d}%"></i><i class="gBlack" style="width:${b}%"></i></span><span class="moveGaugeLabels"><span>Bl ${w}%</span><span>= ${d}%</span><span>No ${b}%</span></span></span>`;
}
function renderMoves(){
  const root=currentNodeRoot();
  renderMovesList({root,currentNode:state.currentNode,esc,moveOutcomeStats,moveGaugeMarkup});
  renderSelectedMoveInsights();
}
function renderAnalysisMeta(){const head=$("annotationHeadline"),summary=$("annotationSummary"),icon=$("annotationIcon");const anns=getEffectiveAnnotations(state.currentNode,state.globalMoveAnnotations);const defs=anns.map(annotationDef);if(icon)icon.textContent=defs[defs.length-1]?.icon||"♟";if(head)head.textContent=defs.length?defs.map(d=>d.label).join(" · "):state.currentNode?.san?`${state.currentNode.san} — position analysée`:"Position initiale";if(summary)summary.textContent=state.currentNode?.note?.trim()|| (anns.length?`${anns.map(d=>d.icon).join(" ")} · Annotation enregistrée sur cette position.`:"Ajoute une annotation ou une note à cette position.");}
function findNodeByPositionKey(root,key){if(positionKeyFromFen(root?.fen||"")===key)return root;for(const c of root?.children||[]){const found=findNodeByPositionKey(c,key);if(found)return found}return null}
function currentNodeRoot(){let n=state.currentNode;while(n?.parent)n=n.parent;return n}
const navigationState={get currentNode(){return state.currentNode},set currentNode(v){state.currentNode=v},get chess(){return state.chess},set chess(v){state.chess=v},get selectedSquare(){return state.selectedSquare},set selectedSquare(v){state.selectedSquare=v},get lastMove(){return state.lastMove},set lastMove(v){state.lastMove=v},chessFactory:fen=>new Chess(fen)};
const positionNavigator=createNavigator({getState:()=>navigationState,renderBoard,onPositionChanged,schedulePersist:saveNoteBeforeNavigation});
function gotoPositionKey(key){const n=findNodeByPositionKey(currentNodeRoot(),key);return n?positionNavigator.navigateToNode(n):false}
function gotoNode(id){const n=findNode(currentNodeRoot(),id);return n?positionNavigator.navigateToNode(n):false}
function renderNav(){$("prevBtn").disabled=!state.currentNode?.parent;$("nextBtn").disabled=!state.currentNode?.children?.[0]}
$("prevBtn").addEventListener("click",()=>positionNavigator.navigatePrevious());
$("nextBtn").addEventListener("click",()=>positionNavigator.navigateNext());
["moves","analysisMoves"].forEach(id=>$(id)?.addEventListener("click",e=>{const b=e.target.closest(".move[data-node]");if(b)gotoNode(b.dataset.node)}));

let noteSaveTimer=null;
function saveNoteDraft(){if(!state.currentNode)return;const value=$("note")?.value?.trim()||"";if(value===String(state.currentNode.note||""))return;state.currentNode.note=value;schedulePersistAnalysis();}
$("note")?.addEventListener("input",()=>{clearTimeout(noteSaveTimer);noteSaveTimer=setTimeout(saveNoteDraft,350)});
function saveNoteBeforeNavigation(){clearTimeout(noteSaveTimer);saveNoteDraft();}

function renderAnnotations(){
  const row=$("annotationRow");if(!row)return;row.innerHTML="";const set=new Set(getEffectiveAnnotations(state.currentNode,state.globalMoveAnnotations));
  ANNOTATION_DEFS.forEach(def=>{const b=document.createElement("button");b.type="button";b.className=`anno ${def.kind} ${set.has(def.icon)?"active":""}`;b.dataset.annotation=def.icon;b.dataset.label=def.label;b.textContent=def.icon;b.title=`${def.icon} · ${def.label}`;b.setAttribute("aria-label",def.label);b.setAttribute("aria-pressed",set.has(def.icon)?"true":"false");b.addEventListener("click",()=>{
    const active=set.has(def.icon);
    const local=new Set(Array.isArray(state.currentNode.annotations)?state.currentNode.annotations:[]);
    const suppressed=new Set(Array.isArray(state.currentNode.suppressedAnnotations)?state.currentNode.suppressedAnnotations:[]);
    const shared=state.currentNode.parent&&state.currentNode.move?new Set(getStoredGlobalAnnotations(state.globalMoveAnnotations,state.currentNode.parent.fen,state.currentNode.move)):new Set();
    if(active){
      local.delete(def.icon);
      if(shared.has(def.icon))suppressed.add(def.icon);
    }else if(shared.has(def.icon)){
      suppressed.delete(def.icon);
      local.delete(def.icon);
    }else{
      local.add(def.icon);
      if(state.currentNode.parent&&state.currentNode.move){setGlobalAnnotation(state.globalMoveAnnotations,state.currentNode.parent.fen,state.currentNode.move,def.icon,true);saveGlobalMoveAnnotations();}
    }
    state.currentNode.annotations=[...local];
    state.currentNode.suppressedAnnotations=[...suppressed];
    renderAnnotations();renderBoard();if(state.activeGame)void persistAnalysis().catch(e=>toast("Enregistrement impossible : "+e.message));
  });row.appendChild(b)});
  const noteEl=$("note");if(noteEl&&document.activeElement!==noteEl)noteEl.value=state.currentNode?.note||"";
}
function renderSelectedMoveInsights(){
  const box=$("moveInsights");if(!box)return;
  const node=state.currentNode;
  if(!node?.move){box.innerHTML='<div class="muted">Sélectionne un coup pour voir ses statistiques.</div>';return}
  const stats=moveOutcomeStats(node),white=stats?.white||0,draw=stats?.draw||0,black=stats?.black||0,total=white+draw+black;
  const anns=getEffectiveAnnotations(node,state.globalMoveAnnotations).map(annotationDef);
  box.innerHTML=`<div class="insightMove"><b>${esc(node.san||"—")}</b><span class="muted">${node.parent?.fen===Chess.START_FEN?"Position initiale":"Position sélectionnée"}</span></div>${total?gaugeMarkup(stats,total):'<div class="muted">Pas encore assez de données dans la base pour ce coup.</div>'}<div class="insightAnnotations"><b>Annotations</b><div>${anns.length?anns.map(a=>`<span title="${esc(a.label)}">${esc(a.icon)}</span>`).join(" "):"Aucune"}</div></div>${node.note?.trim()?`<div class="insightNote">${esc(node.note.trim())}</div>`:""}`;
}

async function persistAnalysisSnapshot(snapshot){if(!snapshot)return;await storageSaveGame(snapshot);state.allGames=state.allGames.map(g=>g.id===snapshot.id?{...snapshot}:g);if(state.activeGame?.id===snapshot.id){state.activeGame={...state.activeGame,analysisTree:snapshot.analysisTree,annotationCount:snapshot.annotationCount,updatedAt:snapshot.updatedAt}}invalidateGlobalTree({rebuild:true});}
async function persistAnalysis(){if(!state.activeGame||!state.currentNode)return;const root=currentNodeRoot();const stored={...state.activeGame,analysisTree:serializeTree(root),annotationCount:countAnnotations(root),updatedAt:Date.now()};delete stored.parsed;await persistAnalysisSnapshot(stored);}
function scheduleBackgroundPersist(){if(!state.activeGame||!state.currentNode)return;clearTimeout(persistTimer);persistTimer=setTimeout(()=>{persistTimer=null;void persistAnalysis().then(()=>{renderHome();renderTraining()}).catch(e=>toast("Autosauvegarde impossible : "+e.message));},80)}
async function flushPendingPersist(){saveNoteBeforeNavigation();if(!persistTimer)return;clearTimeout(persistTimer);persistTimer=null;await new Promise(resolve=>setTimeout(()=>{void persistAnalysis().finally(resolve)},0));}
function schedulePersistAnalysis(){if(!state.activeGame||!state.currentNode)return;clearTimeout(persistTimer);persistTimer=setTimeout(()=>{persistTimer=null;void persistAnalysis().then(()=>{renderHome();renderTraining()}).catch(e=>toast("Autosauvegarde impossible : "+e.message));},500)}
$("rotateBoardBtn")?.addEventListener("click",()=>{boardRotated=!boardRotated;renderBoard();});
$("analysisBackBtn")?.addEventListener("click",()=>{nav(state.activeGame?"games":"home")});
$("analysisSearchBtn")?.addEventListener("click",()=>{nav("games");setTimeout(()=>$("gameSearch")?.focus(),0)});
$("analysisEngineBtn")?.addEventListener("click",()=>$("analysisEval")?.scrollIntoView({behavior:"smooth",block:"center"}));
$("analysisBookBtn")?.addEventListener("click",()=>$("globalTree")?.closest(".analysisTreePanel")?.classList.toggle("is-open"));
$("analysisTreeBtn")?.addEventListener("click",()=>$("globalTree")?.closest(".analysisTreePanel")?.classList.toggle("is-open"));
$("analysisControlSettings")?.addEventListener("click",()=>$("analysisSettingsBtn")?.click());
$("analysisSettingsBtn")?.addEventListener("click",()=>$("settingsBtn")?.click());

$("saveNote").addEventListener("click",async()=>{if(!state.currentNode)return;$("annotationPanel")?.classList.toggle("editorOpen");$("note")?.focus();if(state.activeGame){try{await persistAnalysis();renderHome();renderTraining()}catch(e){toast("Enregistrement impossible : "+e.message)}}});
$("annotationRow").addEventListener("click",()=>{if(!state.currentNode||!state.activeGame)return;schedulePersistAnalysis();renderHome();renderTraining()});

$("importBtn").addEventListener("click",()=>$("pgnFile").click());
$("pgnFile").addEventListener("change",async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const text=await f.text(),chunks=splitGames(text),added=[],existing=new Set(state.allGames.map(g=>g.id)),invalid=[];
    for(const source of chunks){
      const parsedGames=parsePGN(source);
      if(parsedGames.errors?.length){invalid.push(parsedGames.errors[0]);continue}
      const parsed=parsedGames[0]; if(!parsed)continue;
      try{validateParsedGame(parsed)}catch(err){invalid.push({error:err.message});continue}
      const h=headersFrom(source),g={...metaFromHeaders(h,"PGN",Date.now()/1000,source),id:gameIdentity("PGN",parsed,h)};
      if(existing.has(g.id))continue; existing.add(g.id); added.push(g);
    }
    if(invalid.length)throw new Error(`${invalid.length} partie(s) invalide(s), import annulé · première erreur : ${invalid[0].error}`);
    await putMany(added);state.allGames=await getAll();invalidateGlobalTree();renderGames();renderPgnCollections();renderHome();renderStats();toast(`${chunks.length} partie(s) validée(s) · ${added.length} ajoutée(s)`);
  }catch(err){toast("Import PGN refusé : "+err.message)}finally{e.target.value=""}
});

function exportActiveGamePgn(){
  if(!state.activeGame?.parsed){toast("Aucune partie ouverte");return}
  try{const out=exportPGN(state.activeGame.parsed);const blob=new Blob([out],{type:"application/x-chess-pgn"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;const safeName=v=>String(v||"").replace(/[\\/:*?"<>|]+/g,"_").replace(/\s+/g," ").trim()||"Unknown";a.download=`HighTaxi_${safeName(state.activeGame.white)}_${safeName(state.activeGame.black)}.pgn`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast("PGN exporté")}
  catch(e){toast("Export impossible : "+e.message)}
}
$("analysisExportBtn")?.addEventListener("click",exportActiveGamePgn);

$("backupBtn").addEventListener("click",async()=>{try{const games=await getAll();const data=JSON.stringify({format:"HighTaxi Chess Backup",version:APP_VERSION,schemaVersion:DATA_SCHEMA_VERSION,exportedAt:new Date().toISOString(),gameCount:games.length,globalMoveAnnotations:state.globalMoveAnnotations,trainingPuzzles:state.trainingPuzzles||[],trainingSolvedPositions:state.trainingSolvedPositions||[],chessSyncArchives:JSON.parse(localStorage.getItem(CHESS_SYNC_KEY)||"[]"),games});const blob=new Blob([data],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`HighTaxiChess-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast(`${games.length} partie(s) sauvegardée(s)`)}catch(e){toast("Sauvegarde impossible : "+e.message)}});
$("restoreBtn").addEventListener("click",()=>$("backupFile").click());
$("backupFile").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());const rawGames=validateBackupPayload(data,DATA_SCHEMA_VERSION);const games=migrateBackupGames(rawGames,Number(data.schemaVersion||1));const importedGlobalAnnotations=data.globalMoveAnnotations&&typeof data.globalMoveAnnotations==="object"?data.globalMoveAnnotations:null;const importedTrainingPuzzles=Array.isArray(data.trainingPuzzles)?data.trainingPuzzles:null;const importedTrainingSolved=Array.isArray(data.trainingSolvedPositions)?data.trainingSolvedPositions:null;const importedSyncArchives=Array.isArray(data.chessSyncArchives)?data.chessSyncArchives:null;const mode=confirm(`Restaurer ${games.length} partie(s).\n\nOK = remplacer la base actuelle\nAnnuler = fusionner avec la base actuelle`)?"replace":"merge";if(mode==="replace"){if(!confirm("Dernière confirmation : toutes les parties actuellement présentes seront supprimées."))throw new Error("Restauration annulée");await replaceAll(games);if(importedGlobalAnnotations){state.globalMoveAnnotations=importedGlobalAnnotations;saveGlobalMoveAnnotations()}else{state.globalMoveAnnotations={};saveGlobalMoveAnnotations()}if(importedTrainingPuzzles){state.trainingPuzzles=importedTrainingPuzzles;saveTrainingPuzzles()}else{state.trainingPuzzles=[];saveTrainingPuzzles()}if(importedTrainingSolved){state.trainingSolvedPositions=[...new Set(importedTrainingSolved.map(String))];saveTrainingSolvedPositions()}else{state.trainingSolvedPositions=[];saveTrainingSolvedPositions()}if(importedSyncArchives)localStorage.setItem(CHESS_SYNC_KEY,JSON.stringify(importedSyncArchives));else localStorage.removeItem(CHESS_SYNC_KEY)}else{const existing=await getAll();const byId=new Map(existing.map(g=>[String(g.id),g]));for(const g of games){const old=byId.get(String(g.id));if(!old||(Number(g.updatedAt||0)>=Number(old.updatedAt||0)))byId.set(String(g.id),g)}await putMany([...byId.values()]);if(importedGlobalAnnotations){state.globalMoveAnnotations=mergeGlobalAnnotations(state.globalMoveAnnotations,importedGlobalAnnotations);saveGlobalMoveAnnotations()}if(importedTrainingPuzzles){const byKey=new Map((state.trainingPuzzles||[]).map(p=>[trainingPuzzleKey(p),p]));for(const puzzle of importedTrainingPuzzles)byKey.set(trainingPuzzleKey(puzzle),puzzle);state.trainingPuzzles=[...byKey.values()];saveTrainingPuzzles()}if(importedTrainingSolved){state.trainingSolvedPositions=[...new Set([...(state.trainingSolvedPositions||[]),...importedTrainingSolved.map(String)])];saveTrainingSolvedPositions()}if(importedSyncArchives)localStorage.setItem(CHESS_SYNC_KEY,JSON.stringify(importedSyncArchives))}indexPersistedAnnotations(games);state.allGames=await getAll();invalidateGlobalTree();renderGames();renderPgnCollections();renderHome();renderStats();renderTraining();toast(`${games.length} partie(s) restaurée(s) · ${mode==="replace"?"base remplacée":"base fusionnée"}`)}catch(err){toast("Restauration impossible : "+err.message)}finally{e.target.value=""}});

$("syncBtn").addEventListener("click",async()=>{
  const b=$("syncBtn"),progress=$("syncProgress"),wrap=$("syncProgressWrap"),label=$("syncProgressText");
  b.disabled=true;
  saveSyncStatus({at:Date.now(),ok:false,message:"Synchronisation en cours…"});renderSyncStatus();
  const setProgress=(done,total,text)=>{
    if(wrap)wrap.style.display="block";
    if(progress){progress.max=Math.max(total,1);progress.value=done;}
    if(label)label.textContent=text;
    b.textContent=total?`Synchronisation ${done}/${total}…`:"Synchronisation…";
  };
  try{
    const data=await fetchChessComJson(`${CHESSCOM_BASE}/player/${encodeURIComponent(currentUser())}/games/archives`);
    const archives=Array.isArray(data?.archives)?data.archives.filter(Boolean):[];
    if(!archives.length)throw new Error(`Aucune archive trouvée pour ${currentUser()}.`);
    const ordered=[...archives].reverse();
    const synced=new Set(JSON.parse(localStorage.getItem(CHESS_SYNC_KEY)||"[]"));
    const now=new Date();
    const currentKey=`${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}`;
    const pending=ordered.filter(url=>{
      const key=chessComMonthKey(url);
      return key===currentKey||!synced.has(key);
    });
    const total=pending.length;
    let processed=0,fetched=0,added=0,skipped=archives.length-pending.length,errors=0,invalid=0;
    const existing=new Set(state.allGames.filter(g=>g.source==="Chess.com").map(g=>String(g.id||g.url)));
    setProgress(0,total,`0/${total} mois à traiter · ${skipped} déjà synchronisés`);

    for(const archiveUrl of pending){
      const monthKey=chessComMonthKey(archiveUrl);
      let source="",last=null,monthInvalid=0;
      for(let attempt=0;attempt<3&&!source;attempt++){
        try{source=await fetchChessComPgn(archiveUrl)}
        catch(e){last=e;if(attempt<2)await new Promise(r=>setTimeout(r,600*(attempt+1)))}
      }
      processed++;
      if(!source){errors++;setProgress(processed,total,`${processed}/${total} mois · ${errors} erreur(s)`);continue}
      const batchAdds=[];
      for(const raw of splitGames(source)){
        const h=headersFrom(raw);
        if(!chessComPgnIsStandard(h))continue;
        let parsed;
        try{
          const result=parsePGN(raw);
          if(!result.length||result.errors?.length)throw new Error(result.errors?.[0]?.error||"PGN invalide");
          parsed=result[0];
          validateParsedGame(parsed);
        }catch{invalid++;monthInvalid++;continue}
        fetched++;
        const pgn=String(raw).trim();
        const id=chessComStableId({url:h.Link||"",uuid:h.UUID||""},pgn);
        if(existing.has(id))continue;
        const result=String(h.Result||"*").trim();
        const g=metaFromHeaders({...h,Result:["1-0","0-1","1/2-1/2","*"].includes(result)?result:"*"},"Chess.com",parseTimestamp(h,0),pgn,{id,eco:openingName(h.ECO||""),time_control:h.TimeControl||"",chessArchive:monthKey,url:h.Link||archiveUrl,chessComUrl:h.Link||null});
        batchAdds.push(g);existing.add(id);
      }
      if(batchAdds.length){await putMany(batchAdds);added+=batchAdds.length;state.allGames.push(...batchAdds)}
      if(monthKey!==currentKey&&monthInvalid===0)synced.add(monthKey);
      setProgress(processed,total,`${processed}/${total} mois · ${added} nouvelle(s)${errors?` · ${errors} erreur(s)`:""}`);
    }
    localStorage.setItem(CHESS_SYNC_KEY,JSON.stringify([...synced].slice(-120)));
    state.allGames=await getAll();invalidateGlobalTree();renderHome();renderGames();renderPgnCollections();renderStats();renderTraining();
    const details=[`${fetched} parties lues`,`${added} ajoutée(s)`,`${skipped} mois déjà synchronisés`];
    if(errors)details.push(`${errors} archive(s) en erreur`);
    if(invalid)details.push(`${invalid} PGN invalide(s)`);
    toast(details.join(" · "));
    if(label)label.textContent=`Terminé · ${added} ajoutée(s) · ${errors||invalid?"avec avertissements":"sans erreur"}`;saveSyncStatus({at:Date.now(),ok:!(errors||invalid),message:`${added} ajoutée(s)${errors||invalid?` · ${errors} erreur(s), ${invalid} PGN invalide(s)`:""}`});renderSyncStatus();
  }catch(e){
    toast("Erreur de synchronisation : "+e.message);
    if(label)label.textContent="Synchronisation interrompue";saveSyncStatus({at:Date.now(),ok:false,message:e.message||"Erreur inconnue"});renderSyncStatus();
  }finally{
    b.disabled=false;b.textContent="Synchroniser Chess.com";
  }
});

$("settingsBtn").addEventListener("click",async()=>{const panel=$("settingsPanel");if(panel){panel.classList.add("open");panel.setAttribute("aria-hidden","false");}await renderSettings();});
$("settingsClose")?.addEventListener("click",()=>{const p=$("settingsPanel");p?.classList.remove("open");p?.setAttribute("aria-hidden","true")});
$("settingsPanel")?.addEventListener("click",e=>{if(e.target.id==="settingsPanel")$("settingsClose")?.click()});
async function renderSettings(){const est=await getStorageEstimate();const account=$("settingsAccount");if(account)account.value=currentUser();$("settingsVersion")?.replaceChildren(document.createTextNode(APP_VERSION));$("settingsStorage")?.replaceChildren(document.createTextNode(est?.usage?`${(est.usage/1024/1024).toFixed(1)} Mo utilisés`:"Indisponible"));["autoEngine","showArrows","compactMoves"].forEach(k=>{const el=$("setting_"+k);if(el)el.checked=!!state.appSettings[k]});}
$("settingsAccount")?.addEventListener("change",e=>{const value=String(e.target.value||"").trim();if(!value){e.target.value=currentUser();return}if(value.toLowerCase()===currentUser().toLowerCase()){e.target.value=currentUser();return}try{engineController?.cancel()}catch{}trainingController.stop();trainingUI.end();clearArrowCache();recreatedPgnCache.clear();localStorage.removeItem(CHESS_SYNC_KEY);localStorage.removeItem(CHESS_SYNC_STATUS_KEY);state.appSettings.chesscomUser=value;saveAppSettings();resetUserScopedState(state);state.chess=new Chess();engineController?.clearCache?.();renderHome();renderGames();renderPgnCollections();renderStats();renderTraining();if(document.body.classList.contains("analysisActive"))renderBoard();renderSyncStatus();toast(`Compte Chess.com : ${value}`)});
["autoEngine","showArrows","compactMoves"].forEach(k=>$("setting_"+k)?.addEventListener("change",e=>{state.appSettings[k]=e.target.checked;saveAppSettings();if(k==="showArrows")renderBoard();if(k==="compactMoves")document.body.classList.toggle("compactMoves",!!state.appSettings.compactMoves);if(k==="autoEngine"){if(state.appSettings.autoEngine)onPositionChanged();else cancelEngineAnalysis("Analyse Stockfish désactivée.")}}));
$("settingsRebuild")?.addEventListener("click",()=>{invalidateGlobalTree();if(document.body.classList.contains("analysisActive"))buildGlobalTree();toast("Arbre global en reconstruction")});
$("settingsEngineReset")?.addEventListener("click",()=>{state.engineSearchToken++;engineController?.dispose();engineController=null;state.engineUnavailable=false;if(state.appSettings.autoEngine)onPositionChanged();toast("Stockfish réinitialisé")});
$("settingsClearCaches")?.addEventListener("click",()=>{recreatedPgnCache.clear();clearOpeningPrefixCache();clearArrowCache();engineController?.clearCache?.();state.trainingCache=[];state.trainingCacheRevision=-1;invalidateGlobalTree();toast("Caches locaux vidés")});
$("trainingScanBtn")?.addEventListener("click",()=>void trainingController.scan());
$("trainingStopBtn")?.addEventListener("click",()=>trainingController.stop());
$("trainingExportBtn")?.addEventListener("click",()=>trainingController.exportFile());
$("trainingClearBtn")?.addEventListener("click",()=>{trainingUI.end();trainingController.clear();});

async function boot(){
  await runBoot({
    migrate:async()=>{await migrateStorage();await migrateChessComStableIds();keepStoragePersistent().catch(()=>{});},
    load:storageLoadGames,
    onLoaded:async games=>{state.allGames=games||[];indexPersistedAnnotations(state.allGames);renderHome();renderGames();renderStats();renderTraining();renderSyncStatus();installBoardResizeObserver();document.body.classList.toggle("compactMoves",!!state.appSettings.compactMoves);renderBoard();const hash=location.hash;if(hash==="#board"||hash==="#games")nav(hash.slice(1)==="board"?"boardScreen":"games");else nav("boardScreen");},
    onError:error=>{toast("Erreur de stockage : "+error.message);renderBoard();}
  });
}
registerServiceWorker("./sw.js");
boot();

function clubHeaders(){
  return {Event:"Club",Site:"HighTaxi Chess",Date:new Date().toISOString().slice(0,10).replace(/-/g,"."),White:$("manualWhite").value.trim()||currentUser(),Black:$("manualBlack").value.trim()||"Adversaire",Result:$("manualResult").value};
}
function clubPGN(){
  if(!clubState)return "";
  const h=clubHeaders();
  return exportPGN({headers:h,result:h.Result,startFen:Chess.START_FEN,root:clubState.root});
}
function renderClubMoves(){
  const el=$("clubMoves");if(!el||!clubState)return;
  const path=[];let n=clubState.current;while(n&&n.parent){path.unshift(n);n=n.parent}
  el.innerHTML=path.length?path.map(n=>`<button class="move ${n===clubState.current?"current":""}" data-node="${esc(n.id)}">${esc(n.san)}</button>`).join(""):'<span class="muted">Aucun coup</span>';
  el.querySelectorAll(".move").forEach(b=>b.addEventListener("click",()=>{const n=findNode(clubState.root,b.dataset.node);if(!n)return;clubState.current=n;clubState.chess=new Chess(n.fen);renderClubBoard()}));
}
function renderClubBoard(){
  const board=$("clubBoard");if(!board||!clubState)return;board.innerHTML="";
  const c=clubState.chess,selected=clubState.selected,legal=new Set(selected?c.legalMoves(selected).map(m=>m.to):[]);
  const files=["a","b","c","d","e","f","g","h"],ranks=[8,7,6,5,4,3,2,1];
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const s=files[col]+ranks[row],x=col,y=7-row,d=document.createElement("div");d.className=`square ${((x+y)%2===0)?"dark":"light"}`;d.dataset.square=s;
    if(s===selected)d.classList.add("selected");if(legal.has(s))d.classList.add(c.board[s]?"capture":"legal");
    const p=c.board[s];if(p)d.insertAdjacentHTML("beforeend",pieceSVG(p));board.appendChild(d);
  }
  installPieceFallbacks(board);
  const status=c.status();$("clubStatus").textContent=status.checkmate?"Échec et mat":status.stalemate?"Pat":`${status.check?"Échec · ":""}Trait aux ${c.turn==="w"?"Blancs":"Noirs"}`;
  $("clubPgnPreview").textContent=clubPGN();renderClubMoves();
}
$("clubStart")?.addEventListener("click",()=>{
  if(!$("manualWhite").value.trim()||!$("manualBlack").value.trim()){toast("Renseigne les deux joueurs");return}
  const root={id:crypto.randomUUID(),parent:null,children:[],move:null,san:null,fen:Chess.START_FEN,annotations:[],comment:"",note:"",nags:[]};
  clubState={root,current:root,chess:new Chess(),selected:null};$("clubComposer").style.display="block";renderClubBoard();
});
$("clubBoard")?.addEventListener("click",e=>{
  const cell=e.target.closest(".square");if(!cell||!clubState)return;const s=cell.dataset.square,c=clubState.chess;
  if(clubState.selected){
    const candidates=c.legalMoves(clubState.selected).filter(m=>m.to===s);
    if(candidates.length){let move=candidates[0];if(candidates.length>1){const promo=(prompt("Promotion : Q, R, B ou N","Q")||"Q").toLowerCase();move=candidates.find(m=>m.promotion===promo)||candidates[0]}
      const existing=clubState.current.children.find(n=>n.move?.from===move.from&&n.move?.to===move.to&&String(n.move?.promotion||"")===String(move.promotion||""));
      if(existing){clubState.current=existing;clubState.chess=new Chess(existing.fen);clubState.selected=null;renderClubBoard();return}
      const played=c.play(move),node={id:crypto.randomUUID(),parent:clubState.current,children:[],move,san:played.san,fen:played.fen,annotations:[],comment:"",note:"",nags:[]};clubState.current.children.push(node);clubState.current=node;clubState.selected=null;renderClubBoard();return;
    }
  }
  clubState.selected=c.board[s]&&c.board[s][0]===c.turn?s:null;renderClubBoard();
});
$("clubUndo")?.addEventListener("click",()=>{if(!clubState?.current?.parent)return;const p=clubState.current.parent;p.children=p.children.filter(n=>n!==clubState.current);clubState.current=p;clubState.chess=new Chess(p.fen);clubState.selected=null;renderClubBoard()});
$("clubCancel")?.addEventListener("click",()=>{clubState=null;$("clubComposer").style.display="none"});

$("manualAdd")?.addEventListener("click",async()=>{
  if(!clubState){toast("Ouvre d’abord l’échiquier de saisie");return}
  const h=clubHeaders();if(!h.White||!h.Black){toast("Renseigne les joueurs");return}
  try{
    const canonicalPgn=clubPGN(),g={...metaFromHeaders(h,"Club",Date.now()/1000,canonicalPgn),id:hashId(`Club|${canonicalPgn}`),headers:h,updatedAt:Date.now()};
    await put(g);state.allGames=await getAll();invalidateGlobalTree();renderGames();renderStats();renderHome();clubState=null;$("clubComposer").style.display="none";$("manualWhite").value="";$("manualBlack").value="";toast("Partie de club ajoutée · PGN généré automatiquement");
  }catch(e){toast("Ajout impossible : "+e.message)}
});

document.addEventListener("visibilitychange",()=>{if(document.hidden){void flushPendingPersist();engineController?.cancel();state.engineBusy=false;state.enginePendingFen=state.engineLastFen;state.engineSearchToken++;return}if(state.engineLastFen||state.currentNode?.fen){state.engineBusy=false;state.engineLastFen="";scheduleEngineAnalysis(state.enginePendingFen||state.currentNode?.fen||Chess.START_FEN)}});
window.addEventListener("pagehide",()=>{void flushPendingPersist()});