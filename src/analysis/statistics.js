import {Chess} from '../../chess.js';
import {openingLineUltraFast,headersFrom} from '../../pgn.js';
import {positionKeyFromFen} from '../chess/position.js';
import {getEffectiveAnnotations,getStoredGlobalAnnotations,globalMoveKey} from './annotations.js';
import {annotationClassification,classifyAnnotations} from './classification.js';

export const STATISTICS_DEFAULTS=Object.freeze({maxPlies:24,checkpointMoves:[5,10,12],trendMonths:6,positionLimit:12});
const RESULT_VALUES=new Set(['1-0','0-1','1/2-1/2','*']);
const CLASSIFICATIONS=['blunder','error','brilliant','excellent','good','theoretical','neutral'];
const PHASES=['1-3','4-6','7-9','10-12'];

function emptyCounts(){return {blunder:0,error:0,brilliant:0,excellent:0,good:0,theoretical:0,neutral:0};}
function emptyResults(){return {games:0,completed:0,wins:0,draws:0,losses:0,unknown:0,points:0,scorePct:0};}
function resultForUser(game,user){
  const target=String(user||'').trim().toLowerCase();
  const white=String(game?.white||'').trim().toLowerCase()===target;
  const black=String(game?.black||'').trim().toLowerCase()===target;
  const side=white&&!black?'w':black&&!white?'b':null;
  if(!side)return {side:null,result:'unknown'};
  const result=RESULT_VALUES.has(String(game?.result||''))?String(game.result):'*';
  if(result==='*')return {side,result:'unknown'};
  if(result==='1/2-1/2')return {side,result:'draw'};
  return {side,result:(side==='w'&&result==='1-0')||(side==='b'&&result==='0-1')?'win':'loss'};
}
function scorePercent(target){return target.completed?Math.round((target.points/target.completed)*1000)/10:0;}
function addResult(target,result){
  target.games++;
  if(result==='win'){target.completed++;target.wins++;target.points+=1;}
  else if(result==='draw'){target.completed++;target.draws++;target.points+=0.5;}
  else if(result==='loss'){target.completed++;target.losses++;}
  else target.unknown++;
}
function finishResults(target){target.scorePct=scorePercent(target);return target;}
function gameDate(game,headers){
  const raw=String(headers?.UTCDate||headers?.Date||game?.date||'').replace(/\./g,'-').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const ts=Number(game?.timestamp||0);
  return Number.isFinite(ts)&&ts>0?new Date(ts*1000).toISOString().slice(0,10):'';
}
function monthKey(date){return /^\d{4}-\d{2}-\d{2}$/.test(date)?date.slice(0,7):'';}
function openingMeta(headers,game){
  const eco=String(headers?.ECO||game?.eco||'').trim()||'—';
  let url=String(headers?.ECOUrl||'').trim();
  let name='';
  try{
    const u=new URL(url);
    if(/(^|\.)chess\.com$/i.test(u.hostname)&&u.pathname.startsWith('/openings/'))name=decodeURIComponent(u.pathname.split('/').filter(Boolean).pop()||'');
  }catch{}
  if(!name)name=eco==='—'?'Ouverture inconnue':eco;
  name=name.replace(/[-_]+/g,' ').replace(/\s+/g,' ').replace(/\.{3,}/g,' · ').trim();
  return {eco,name,key:`${eco}|${name}`};
}
function timeControlLabel(value){
  const raw=String(value||'').trim();
  if(!raw||raw==='?')return 'Inconnu';
  const m=raw.match(/^(\d+)(?:\+(\d+))?$/);
  if(m)return `${Math.floor(Number(m[1])/60)}+${m[2]??'0'}`;
  return raw;
}
function phaseForMove(moveNumber){return moveNumber<=3?'1-3':moveNumber<=6?'4-6':moveNumber<=9?'7-9':'10-12';}
function newPosition(key,fen){return {key,fen,gameIds:new Set(),sampleGameId:null,samplePly:0,sampleMoveNumber:0,sampleMoveSan:'',sampleOpening:'',userTurnGames:new Set(),problemGameIds:new Set(),classifications:emptyCounts(),goodMoves:0,badMoves:0,theoreticalMoves:0,lastProblemTimestamp:0};}

function indexAnalysisAnnotations(serializedRoot,globalAnnotations){
  const map=new Map();
  function walk(node,parentFen=null){
    const baseFen=parentFen||node?.fen||Chess.START_FEN;
    for(const child of node?.children||[]){
      if(child?.move){
        const localLike={...child,parent:{fen:baseFen}};
        map.set(globalMoveKey(baseFen,child.move),getEffectiveAnnotations(localLike,globalAnnotations));
      }
      walk(child,child?.fen||baseFen);
    }
  }
  if(serializedRoot)walk(serializedRoot);
  return map;
}
function lineFromFastEntries(entries){
  return (entries||[]).map(entry=>({fen:entry.fen,parent:{fen:entry.from||Chess.START_FEN},move:entry.move,san:entry.san}));
}
function readGameFact(game,user,maxPlies,globalAnnotations){
  const outcome=resultForUser(game,user);
  if(!outcome.side)return null;
  let parsed;
  try{parsed=openingLineUltraFast(game?.pgn||'',4096);}catch{return null;}
  if(!parsed?.startFen)return null;
  const headers=headersFrom(game?.pgn||'');
  const date=gameDate(game,headers);
  const opening=openingMeta(headers,game);
  const line=lineFromFastEntries(parsed.out);
  if(!line.length&&String(game?.result||'')!=='*')return null;
  const analysisIndex=indexAnalysisAnnotations(game?.analysisTree,globalAnnotations);
  const prefixes=line.slice(0,maxPlies).map(node=>`${node.move?.from||''}${node.move?.to||''}${node.move?.promotion||''}`);
  const positionPrefixes=line.slice(0,maxPlies).map(node=>positionKeyFromFen(node.fen||''));
  return {game,side:outcome.side,result:outcome.result,date,month:monthKey(date),opening,line,openingPrefix:prefixes,openingPositionPrefix:positionPrefixes,analysisIndex,globalAnnotations,fullMoveCount:Math.ceil(line.length/2),timeControl:timeControlLabel(headers.TimeControl||game?.time_control)};
}
export function knowledgePlies(facts,maxPlies){
  if(!facts.length)return 0;
  let known=0;
  for(let ply=0;ply<maxPlies;ply++){
    const counts=new Map();
    for(const fact of facts){const key=fact.openingPositionPrefix?.[ply];if(key)counts.set(key,(counts.get(key)||0)+1);}
    if(!counts.size)break;
    const best=Math.max(...counts.values());
    if(best/facts.length<0.5)break;
    known++;
  }
  return known;
}
function effectiveForMove(fact,parentFen,move){
  const key=globalMoveKey(parentFen,move);
  const indexed=fact.analysisIndex.get(key);
  if(indexed)return indexed;
  return getStoredGlobalAnnotations(fact.globalAnnotations,parentFen,move);
}
function aggregateScope(facts,options){
  const result=emptyResults();
  const annotations=emptyCounts(),annotationMoves=emptyCounts();
  const annotationPhases=Object.fromEntries(PHASES.map(p=>[p,emptyCounts()]));
  const positions=new Map(), openings=new Map(), trends=new Map(), timeControls=new Map();
  let totalPlies=0,totalUserMoves=0;

  for(const fact of facts){
    addResult(result,fact.result);
    totalPlies+=fact.line.length;
    for(const [ply,node] of fact.line.slice(0,options.maxPlies).entries()){
      const parentFen=node.parent?.fen||Chess.START_FEN;
      const key=positionKeyFromFen(parentFen);
      let pos=positions.get(key);
      if(!pos){pos=newPosition(key,parentFen);positions.set(key,pos);}
      pos.gameIds.add(String(fact.game.id));
      if(!pos.sampleGameId){pos.sampleGameId=String(fact.game.id);pos.samplePly=ply+1;pos.sampleMoveNumber=Number(parentFen.split(/\s+/)[5]||1);pos.sampleMoveSan=String(node.san||'');pos.sampleOpening=fact.opening.name;}
      const moveSide=String(parentFen).split(/\s+/)[1];
      if(moveSide!==fact.side)continue;
      pos.userTurnGames.add(String(fact.game.id));
      totalUserMoves++;
      const effective=effectiveForMove(fact,parentFen,node.move);
      if(!effective.length)continue;
      for(const icon of new Set(effective))annotations[annotationClassification(icon)]++;
      const classification=classifyAnnotations(effective);
      if(CLASSIFICATIONS.includes(classification))annotationMoves[classification]++;
      const moveNumber=Number(parentFen.split(/\s+/)[5]||1);
      const phase=phaseForMove(moveNumber);
      if(annotationPhases[phase])annotationPhases[phase][classification]++;
      if(classification==='good'||classification==='excellent'||classification==='brilliant')pos.goodMoves++;
      if(classification==='error'||classification==='blunder'){
        pos.badMoves++;pos.problemGameIds.add(String(fact.game.id));pos.classifications[classification]++;
        pos.lastProblemTimestamp=Math.max(pos.lastProblemTimestamp,Number(fact.game.timestamp||0));
      }
      if(classification==='theoretical')pos.theoreticalMoves++;
    }
    const opening=opensOrCreate(openings,fact.opening);
    addResult(opening,fact.result);
    opening.fullMoves+=fact.fullMoveCount;opening.maxPlies=Math.max(opening.maxPlies,Math.min(fact.line.length,options.maxPlies));
    opening.userMoves+=fact.line.slice(0,options.maxPlies).filter(n=>String(n.parent?.fen||'').split(/\s+/)[1]===fact.side).length;
    const badBefore=opening.badMoves;
    for(const [ply,node] of fact.line.slice(0,options.maxPlies).entries()){
      const parentFen=node.parent?.fen||Chess.START_FEN;
      if(String(parentFen).split(/\s+/)[1]!==fact.side)continue;
      const effective=effectiveForMove(fact,parentFen,node.move);
      if(!effective.length)continue;
      const classification=classifyAnnotations(effective);
      if(classification==='error'||classification==='blunder')opening.badMoves++;
      opening.annotationMoves[classification]++;
    }
    opening.annotationRiskCount+=opening.badMoves-badBefore;
    const month=fact.month||'Sans date';
    if(month!==''){
      const t=trends.get(month)||{period:month,...emptyResults()};
      addResult(t,fact.result);trends.set(month,t);
    }
    const tc=timeControls.get(fact.timeControl)||{label:fact.timeControl,...emptyResults()};
    addResult(tc,fact.result);timeControls.set(fact.timeControl,tc);
  }
  finishResults(result);
  for(const open of openings.values()){
    finishResults(open);open.avgFullMoves=open.games?Math.round((open.fullMoves/open.games)*10)/10:0;open.scorePct=scorePercent(open);
    open.problemRate=open.userMoves?Math.round((open.badMoves/open.userMoves)*1000)/10:0;open.knowledgePlies=knowledgePlies(facts.filter(f=>f.opening.key===open.key),options.maxPlies);open.knowledgeMoves=Math.floor(open.knowledgePlies/2)+(open.knowledgePlies%2?.5:0);
    delete open.points;delete open.fullMoves;delete open.annotationRiskCount;
  }
  const annotatedMovesTotal=Object.values(annotationMoves).reduce((a,b)=>a+b,0);
  const positionRows=[...positions.values()].map(p=>({key:p.key,fen:p.fen,games:p.gameIds.size,userTurnGames:p.userTurnGames.size,problemGames:p.problemGameIds.size,badMoves:p.badMoves,goodMoves:p.goodMoves,theoreticalMoves:p.theoreticalMoves,classification:{...p.classifications},classificationLabel:p.classifications.blunder?'blunder':p.classifications.error?'error':'neutral',sampleGameId:p.sampleGameId,samplePly:p.samplePly,sampleMoveNumber:p.sampleMoveNumber,sampleMoveSan:p.sampleMoveSan,sampleOpening:p.sampleOpening,lastProblemTimestamp:p.lastProblemTimestamp,priorityScore:p.badMoves*4+p.problemGameIds.size*2+p.gameIds.size})).sort((a,b)=>b.priorityScore-a.priorityScore||b.problemGames-a.problemGames||b.games-a.games);
  const priorities=positionRows.filter(p=>p.badMoves>0).slice(0,5);
  const trendsRows=[...trends.values()].sort((a,b)=>a.period.localeCompare(b.period));
  const limit=Math.max(1,Number(options.trendMonths)||6);
  const trendLimited=trendsRows.slice(-limit).map(t=>{finishResults(t);return {...t,scorePct:scorePercent(t)};});
  const checkpoints=(options.checkpointMoves||[5,10,12]).map(fullMoves=>{
    const threshold=Math.max(1,fullMoves*2-1);const reached=facts.filter(f=>f.line.length>=threshold);const r=emptyResults();for(const fact of reached)addResult(r,fact.result);finishResults(r);return {fullMoves,...r};
  });
  const avgFullMoves=facts.length?Math.round((totalPlies/2/facts.length)*10)/10:0;
  const overview={...result,whiteCount:facts.filter(f=>f.side==='w').length,blackCount:facts.filter(f=>f.side==='b').length,avgFullMoves,totalUserMoves,annotatedMoves:annotatedMovesTotal};
  return {overview,annotations,annotationMoves,annotationPhases,openings:[...openings.values()].sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name)),positions:positionRows.slice(0,Math.max(1,Number(options.positionLimit)||12)),positionsToReview:priorities,trends:trendLimited,timeControls:[...timeControls.values()].sort((a,b)=>b.games-a.games),checkpoints};
}
function opensOrCreate(map,meta){
  let open=map.get(meta.key);
  if(!open){open={key:meta.key,eco:meta.eco,name:meta.name,games:0,completed:0,wins:0,draws:0,losses:0,unknown:0,points:0,fullMoves:0,maxPlies:0,userMoves:0,badMoves:0,annotationRiskCount:0,annotationMoves:emptyCounts()};map.set(meta.key,open);}
  return open;
}

export function buildStatistics(games=[],options={}){
  const cfg={...STATISTICS_DEFAULTS,...options};
  const user=String(cfg.user||'HighTaxi');
  const input=Array.isArray(games)?games:[];
  const facts=input.map(g=>readGameFact(g,user,cfg.maxPlies,cfg.globalAnnotations||{})).filter(Boolean);
  const scopes={
    all:aggregateScope(facts,cfg),
    w:aggregateScope(facts.filter(f=>f.side==='w'),cfg),
    b:aggregateScope(facts.filter(f=>f.side==='b'),cfg)
  };
  return {
    user,
    maxPlies:cfg.maxPlies,
    overview:scopes.all.overview,
    colors:{w:scopes.w.overview,b:scopes.b.overview},
    annotations:scopes.all.annotations,
    annotationMoves:scopes.all.annotationMoves,
    annotationPhases:scopes.all.annotationPhases,
    openings:scopes.all.openings,
    positions:scopes.all.positions,
    positionsToReview:scopes.all.positionsToReview,
    priorities:scopes.all.positionsToReview,
    trends:scopes.all.trends,
    timeControls:scopes.all.timeControls,
    checkpoints:scopes.all.checkpoints,
    scopes
  };
}
