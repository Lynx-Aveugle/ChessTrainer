import {openingLineUltraFast} from '../../pgn.js';
import {positionKeyFromFen,sameMove,normalizeMove} from '../chess/position.js';
import {getStoredGlobalAnnotations} from '../analysis/annotations.js';
import {classifyAnnotations} from '../analysis/classification.js';

const GOOD_CLASSES=new Set(['brilliant','excellent','good','theoretical']);
const BAD_CLASSES=new Set(['blunder','error']);
const CLASS_PRIORITY=['blunder','error','brilliant','excellent','good','theoretical','neutral'];
const CLASS_RANK=new Map(CLASS_PRIORITY.map((name,index)=>[name,index]));

function gameUserSide(game,user){
  const target=String(user||'').trim().toLowerCase();
  const white=String(game?.white||'').trim().toLowerCase()===target;
  const black=String(game?.black||'').trim().toLowerCase()===target;
  return white&&!black?'w':black&&!white?'b':null;
}
function sideFromFen(fen){return String(fen||'').trim().split(/\s+/)[1]||null;}
function cleanMove(move){return normalizeMove(move);}
function moveToken(move){const m=cleanMove(move);return `${m.from}-${m.to}-${m.promotion||''}`;}
function mergeMoveEntries(entries){
  const map=new Map();
  for(const entry of Array.isArray(entries)?entries:[]){
    if(!entry?.move?.from||!entry?.move?.to)continue;
    const key=moveToken(entry.move),current=map.get(key);
    if(!current){map.set(key,{...entry,move:cleanMove(entry.move),annotations:[...new Set(entry.annotations||[])]});continue}
    const currentRank=CLASS_RANK.get(current.classification)||CLASS_RANK.get('neutral');
    const nextRank=CLASS_RANK.get(entry.classification)||CLASS_RANK.get('neutral');
    const merged={...current,move:cleanMove(current.move),annotations:[...new Set([...(current.annotations||[]),...(entry.annotations||[])])],gameId:current.gameId||entry.gameId,source:current.source||entry.source,san:current.san||entry.san};
    if(nextRank<currentRank){merged.classification=entry.classification;merged.gameId=entry.gameId||merged.gameId;merged.source=entry.source||merged.source;merged.san=entry.san||merged.san}
    map.set(key,merged);
  }
  return [...map.values()];
}
function ensurePosition(map,{key,fen}={}){
  if(!key)return null;
  let position=map.get(key);
  if(!position){
    position={key,fen,gameIds:new Set(),occurrences:0,badOccurrences:0,goodOccurrences:0,bestMoves:[],historicalMoves:[],sampleGameId:'',sampleMoveNumber:0,sampleSan:'',sampleOpening:'',sourceTypes:new Set(),puzzleTypes:new Set(),score:0};
    map.set(key,position);
  }
  if(!position.fen)position.fen=fen;
  return position;
}
function addHistorical(position,{game,node,parentFen,annotations=[]}){
  const classification=classifyAnnotations(annotations);
  const entry={move:cleanMove(node.move),san:String(node.san||''),classification,gameId:String(game?.id||''),source:String(game?.source||'PGN'),annotations:[...new Set(annotations)]};
  position.historicalMoves=mergeMoveEntries([...(position.historicalMoves||[]),entry]);
  if(BAD_CLASSES.has(classification))position.badOccurrences++;
  if(GOOD_CLASSES.has(classification))position.goodOccurrences++;
  position.occurrences++;
  position.gameIds.add(String(game?.id||''));
  if(!position.sampleGameId){
    position.sampleGameId=String(game?.id||'');
    position.sampleMoveNumber=Number(String(parentFen||'').split(/\s+/)[5]||1);
    position.sampleSan=String(node.san||'');
  }
}

export function buildTrainingQueue({games=[],puzzles=[],user='HighTaxi',globalAnnotations={},maxPlies=24}={}){
  const map=new Map();
  const sideByGame=new Map((Array.isArray(games)?games:[]).map(game=>[String(game?.id||''),gameUserSide(game,user)]));

  for(const puzzle of Array.isArray(puzzles)?puzzles:[]){
    const fen=String(puzzle?.fen||'').trim(),key=positionKeyFromFen(fen),side=sideFromFen(fen),gameSide=sideByGame.get(String(puzzle?.gameId||''));
    if(!fen||!key||!side||(gameSide&&gameSide!==side))continue;
    const position=ensurePosition(map,{key,fen});
    position.sourceTypes.add('engine');
    if(puzzle?.type)position.puzzleTypes.add(String(puzzle.type));
    const gameId=String(puzzle.gameId||'');
    if(gameId)position.gameIds.add(gameId);
    position.occurrences++;
    const bestRaw=String(puzzle.bestMove||'').trim().toLowerCase();
    const best=cleanMove({from:bestRaw.slice(0,2),to:bestRaw.slice(2,4),promotion:bestRaw.slice(4)||null});
    if(best.from&&best.to)position.bestMoves=mergeMoveEntries([...(position.bestMoves||[]),{move:best,san:String(puzzle.bestSan||''),source:'engine',gameId}]);
    const playedRaw=String(puzzle.playedMove||'').trim().toLowerCase();
    const played=cleanMove({from:playedRaw.slice(0,2),to:playedRaw.slice(2,4),promotion:playedRaw.slice(4)||null});
    if(played.from&&played.to){
      const classification=String(puzzle.type||'')==='blunder'?'blunder':'error';
      position.historicalMoves=mergeMoveEntries([...(position.historicalMoves||[]),{move:played,san:String(puzzle.playedSan||''),classification,gameId,source:'engine-scan'}]);
      position.badOccurrences++;
    }
    if(!position.sampleGameId){position.sampleGameId=gameId;position.sampleMoveNumber=Number(puzzle.moveNumber||0);position.sampleSan=String(puzzle.playedSan||'');}
  }

  for(const game of Array.isArray(games)?games:[]){
    const side=gameUserSide(game,user);
    if(!side||!game?.pgn)continue;
    let parsed;
    try{parsed=openingLineUltraFast(game.pgn,Math.max(1,Number(maxPlies)||24));}catch{continue;}
    for(const entry of parsed?.out||[]){
      const parentFen=String(entry.from||'').trim();
      if(sideFromFen(parentFen)!==side)continue;
      const annotations=getStoredGlobalAnnotations(globalAnnotations,parentFen,entry.move);
      if(!annotations.length)continue;
      const key=positionKeyFromFen(parentFen);
      const position=ensurePosition(map,{key,fen:parentFen});
      position.sourceTypes.add('annotation');
      position.sourceTypes.add(String(game.source||'PGN'));
      addHistorical(position,{game,node:entry,parentFen,annotations});
    }
  }

  return [...map.values()].filter(position=>position.fen).map(position=>{
    const sourceBoost=position.sourceTypes.has('engine')?100000:0;
    position.score=sourceBoost+(position.badOccurrences||0)*1000+(position.gameIds.size*20)+(position.occurrences*5)+(position.bestMoves?.length||0);
    position.source=[...position.sourceTypes];
    position.puzzleTypes=[...position.puzzleTypes];
    position.gameCount=position.gameIds.size;
    return {...position,gameIds:[...position.gameIds]};
  }).sort((a,b)=>b.score-a.score||b.badOccurrences-a.badOccurrences||b.gameCount-a.gameCount||a.key.localeCompare(b.key));
}


export function trainingPositionKind(position){
  const types=new Set(Array.isArray(position?.puzzleTypes)?position.puzzleTypes:[]);
  if(types.has('missedWin'))return 'missedWin';
  if(types.has('blunder'))return 'blunder';
  const bad=(position?.historicalMoves||[]).some(entry=>BAD_CLASSES.has(entry?.classification));
  return bad?'blunder':'training';
}

export function filterSolvedTrainingPositions(queue,solvedKeys){
  const solved=solvedKeys instanceof Set?solvedKeys:new Set(Array.isArray(solvedKeys)?solvedKeys:[]);
  return (Array.isArray(queue)?queue:[]).filter(position=>!solved.has(position?.key));
}

export function evaluateTrainingAnswer(position,move){
  const actual=cleanMove(move);
  if(!actual.from||!actual.to)return {correct:false,reason:'illegal'};
  const best=Array.isArray(position?.bestMoves)?position.bestMoves:[];
  const engineMatch=best.find(entry=>sameMove(entry.move,actual));
  if(engineMatch)return {correct:true,reason:'engine',reference:engineMatch};
  const historical=Array.isArray(position?.historicalMoves)?position.historicalMoves:[];
  const hit=historical.find(entry=>sameMove(entry.move,actual));
  if(hit&&GOOD_CLASSES.has(hit.classification))return {correct:true,reason:'historical',reference:hit};
  if(hit&&BAD_CLASSES.has(hit.classification))return {correct:false,reason:'known-mistake',reference:hit};
  return {correct:false,reason:best.length?'not-best':'not-reference'};
}

export function trainingSessionSummary({total=0,correct=0}={}){
  const safeTotal=Math.max(0,Number(total)||0),safeCorrect=Math.max(0,Math.min(safeTotal,Number(correct)||0));
  return {correct:safeCorrect,total:safeTotal,pct:safeTotal?Math.round(safeCorrect/safeTotal*100):0};
}

export const TRAINING_SESSION_DEFAULTS=Object.freeze({maxPlies:24,sessionSize:10});
