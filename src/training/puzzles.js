import {Chess} from '../../chess.js';
import {parsePGN,exportPGN} from '../../pgn.js';
import {normalizeEngineEvaluation} from '../analysis/evaluation.js';

export const TRAINING_RULES=Object.freeze({
  missedWinMinBestCp:300,
  missedWinMinLossCp:150,
  blunderMinLossCp:200,
  blunderMaxPlayedCp:100,
  mateScoreCp:100000,
  maxPlies:24
});

export function evaluationToPlayerCp(evaluation,side){
  const mate=evaluation?.mate;
  if(mate!==null&&mate!==undefined&&Number.isFinite(Number(mate))){
    const m=Number(mate);
    const score=(m>0?1:-1)*(TRAINING_RULES.mateScoreCp-Math.min(Math.abs(m),100)*100);
    return side==='b'?-score:score;
  }
  const cp=Number(evaluation?.cp);
  const score=Number.isFinite(cp)?cp:0;
  return side==='b'?-score:score;
}

export function classifyTrainingPosition({bestPlayerCp,playedPlayerCp,bestMove,playedMove,rules=TRAINING_RULES}={}){
  if(!bestMove||!playedMove||bestMove===playedMove)return null;
  const best=Number(bestPlayerCp)||0,played=Number(playedPlayerCp)||0,loss=best-played;
  if(best>=rules.missedWinMinBestCp&&played>rules.blunderMaxPlayedCp&&loss>=rules.missedWinMinLossCp){
    return {type:'missedWin',lossCp:loss,bestPlayerCp:best,playedPlayerCp:played};
  }
  if(loss>=rules.blunderMinLossCp&&played<=rules.blunderMaxPlayedCp){
    return {type:'blunder',lossCp:loss,bestPlayerCp:best,playedPlayerCp:played};
  }
  return null;
}

function moveKey(move){return `${move?.from||''}${move?.to||''}${move?.promotion||''}`;}
function uciToMove(uci){
  const raw=String(uci||'').trim().toLowerCase();
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw))return null;
  return {from:raw.slice(0,2),to:raw.slice(2,4),promotion:raw.slice(4)||null};
}
function sameMove(a,b){return moveKey(a)===moveKey(b);}
function mainline(root){const out=[];let node=root;while(node?.children?.[0]){node=node.children[0];out.push(node)}return out;}
function resultCode(game){return ['1-0','0-1','1/2-1/2','*'].includes(String(game?.result||''))?String(game.result):'*';}
function gameUserSide(game,user){
  const u=String(user||'').trim().toLowerCase();
  const w=String(game?.white||'').trim().toLowerCase()===u;
  const b=String(game?.black||'').trim().toLowerCase()===u;
  return w&&!b?'w':b&&!w? 'b':null;
}
function abortError(){const error=new Error('Scan annulé');error.name='AbortError';return error;}

export async function scanGameForTrainingPuzzles(game,user,analyze,{signal,onProgress}={}){
  if(typeof analyze!=='function')throw new Error('analyze function required');
  if(signal?.aborted)throw abortError();
  const side=gameUserSide(game,user);
  if(!side)return [];
  const parsed=parsePGN(game?.pgn||'')[0];
  if(!parsed?.root)return [];
  let chess=new Chess(parsed.startFen||parsed.root.fen||Chess.START_FEN);
  const nodes=mainline(parsed.root).slice(0,Math.max(1,Number(TRAINING_RULES.maxPlies)||24)),puzzles=[];
  let userMoves=0,processed=0;
  for(const node of nodes){
    if(signal?.aborted)throw abortError();
    const parentFen=chess.fen();
    const moveSide=chess.turn;
    if(moveSide===side&&node.move){
      userMoves++;
      const playedMove={...node.move,promotion:node.move.promotion||null};
      const analysis=await analyze(parentFen);
      const bestMove=uciToMove(analysis?.bestMove);
      if(signal?.aborted)throw abortError();
      if(bestMove&&!sameMove(bestMove,playedMove)){
        const bestChess=new Chess(parentFen);
        if(!bestChess.isLegal(bestMove.from,bestMove.to,bestMove.promotion)) {
          chess=new Chess(node.fen);
          processed++;
          onProgress?.({processed,total:nodes.length,userMoves,puzzles:puzzles.length,gameId:String(game.id||'')});
          continue;
        }
        const bestResult=bestChess.play(bestMove);
        const playedChess=new Chess(parentFen);const playedResult=playedChess.play(playedMove);
        const bestEvaluation=normalizeEngineEvaluation(parentFen,analysis?.evaluation||{});
        const playedAfter=normalizeEngineEvaluation(playedResult.fen,(await analyze(playedResult.fen))?.evaluation||{});
        if(signal?.aborted)throw abortError();
        const bestPlayerCp=evaluationToPlayerCp(bestEvaluation,side),playedPlayerCp=evaluationToPlayerCp(playedAfter,side);
        const classification=classifyTrainingPosition({bestPlayerCp,playedPlayerCp,bestMove:moveKey(bestMove),playedMove:moveKey(playedMove)});
        if(classification){
          puzzles.push({
            id:`${String(game.id||'game')}:${parentFen}:${moveKey(playedMove)}`,
            type:classification.type,fen:parentFen,afterBestFen:bestResult.fen,gameId:String(game.id||''),source:String(game.source||'PGN'),
            white:String(game.white||'?'),black:String(game.black||'?'),result:resultCode(game),date:String(game.date||''),event:String(game.event||''),
            moveNumber:Number(parentFen.split(/\s+/)[5]||1),side,playedSan:String(node.san||''),bestSan:String(bestResult.san||''),
            playedMove:moveKey(playedMove),bestMove:moveKey(bestMove),bestPlayerCp:classification.bestPlayerCp,playedPlayerCp:classification.playedPlayerCp,
            lossCp:classification.lossCp,createdAt:Date.now()
          });
        }
      }
      chess=new Chess(node.fen);
    }else if(node.move){
      chess.play(node.move);
    }
    processed++;
    onProgress?.({processed,total:nodes.length,userMoves,puzzles:puzzles.length,gameId:String(game.id||'')});
  }
  return puzzles;
}

function cleanHeader(value){return String(value??'').replace(/[\r\n]+/g,' ').trim();}
function puzzleToGame(puzzle,index){
  const root={id:`training-root-${index}`,parent:null,children:[],move:null,san:null,fen:puzzle.fen,annotations:[],comment:`HighTaxi Training · ${puzzle.type==='missedWin'?'Gain manqué':'Gaffe'} · Coup joué : ${puzzle.playedSan||'—'} · Perte : ${(Number(puzzle.lossCp||0)/100).toFixed(2)}`,note:'',nags:[]};
  const best={id:`training-best-${index}`,parent:root,children:[],move:{from:puzzle.bestMove.slice(0,2),to:puzzle.bestMove.slice(2,4),promotion:puzzle.bestMove.slice(4)||null},san:puzzle.bestSan||puzzle.bestMove,fen:puzzle.afterBestFen||puzzle.fen,annotations:[],comment:'',note:'',clock:null,nags:[]};
  root.children.push(best);
  return {headers:{Event:'HighTaxi Training',Site:'HighTaxi Chess',Round:String(index+1),Date:cleanHeader(puzzle.date||''),White:cleanHeader(puzzle.white||'?'),Black:cleanHeader(puzzle.black||'?'),Result:'*',SetUp:'1',FEN:cleanHeader(puzzle.fen),TrainingType:puzzle.type==='missedWin'?'MissedWin':'Blunder',OriginalGame:cleanHeader(puzzle.gameId),OriginalMove:`${puzzle.moveNumber||'?'}${puzzle.side==='b'?'...':'.'}`,PlayedMove:cleanHeader(puzzle.playedSan),BestMove:cleanHeader(puzzle.bestSan),LossCp:String(Math.round(Number(puzzle.lossCp||0))),EvalBest:String(Math.round(Number(puzzle.bestPlayerCp||0))),EvalPlayed:String(Math.round(Number(puzzle.playedPlayerCp||0)))},result:'*',startFen:puzzle.fen,root};
}

export function exportTrainingPgn(puzzles=[]){
  const list=Array.isArray(puzzles)?puzzles:[];
  if(!list.length)return '';
  return list.map((puzzle,index)=>exportPGN(puzzleToGame(puzzle,index)).trim()).filter(Boolean).join('\n\n')+'\n';
}

export function trainingPuzzleKey(puzzle){return `${puzzle?.gameId||''}|${puzzle?.fen||''}|${puzzle?.type||''}|${puzzle?.bestMove||''}|${puzzle?.playedMove||''}`;}
