import assert from 'node:assert/strict';
import {buildTrainingQueue,evaluateTrainingAnswer,trainingSessionSummary,trainingPositionKind,filterSolvedTrainingPositions} from './src/training/session.js';
import {globalMoveKey} from './src/analysis/annotations.js';

const game={id:'g1',source:'Chess.com',white:'HighTaxi',black:'Opponent',result:'1-0',pgn:`[White "HighTaxi"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 dxc4 7. Bxc4`};
const startFen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const puzzles=[{id:'p1',type:'blunder',fen:startFen,gameId:'g1',bestMove:'d2d4',playedMove:'e2e4',playedSan:'e4',bestSan:'d4',lossCp:250}];
const queue=buildTrainingQueue({games:[game],puzzles,user:'HighTaxi',globalAnnotations:{},maxPlies:24});
assert.ok(queue.length>=1);
assert.equal(new Set(queue.map(x=>x.key)).size,queue.length,'training positions must be deduplicated by normalized FEN');
assert.equal(queue.filter(x=>x.key===queue[0].key).length,1);
assert.ok(queue.some(x=>x.fen===startFen&&x.bestMoves.some(m=>m.move.from==='d2'&&m.move.to==='d4')),'engine puzzle position must merge with the same base position');
const puzzle=queue.find(x=>x.fen===startFen);
assert.equal(evaluateTrainingAnswer(puzzle,{from:'d2',to:'d4'}).correct,true);
assert.equal(evaluateTrainingAnswer(puzzle,{from:'e2',to:'e4'}).correct,false);
assert.equal(trainingPositionKind({...puzzle,puzzleTypes:['missedWin']}),'missedWin');
assert.equal(trainingPositionKind({...puzzle,puzzleTypes:['blunder'],badOccurrences:1}),'blunder');
assert.equal(filterSolvedTrainingPositions(queue,new Set([queue[0].key])).length,queue.length-1,'a solved position must leave the training queue');
assert.equal(filterSolvedTrainingPositions(queue,new Set(queue.map(x=>x.key))).length,0,'all solved positions must disappear from training');
assert.equal(evaluateTrainingAnswer({...puzzle,bestMoves:[],historicalMoves:[{move:{from:'d2',to:'d4'},classification:'good'}]},{from:'d2',to:'d4'}).correct,true);

const annotatedMove={from:'d2',to:'d4',promotion:null};
const annotations={[globalMoveKey(startFen,annotatedMove)]:{annotations:['??']}};
const annotatedQueue=buildTrainingQueue({games:[game],puzzles:[],user:'HighTaxi',globalAnnotations:annotations,maxPlies:24});
assert.equal(annotatedQueue.length,1,'annotated positions must form a position-based training item');
assert.equal(annotatedQueue[0].badOccurrences,1);
assert.equal(evaluateTrainingAnswer(annotatedQueue[0],annotatedMove).correct,false);

const conflictingAnnotations={
  [globalMoveKey(startFen,annotatedMove)]:{annotations:['!', '??']}
};
const conflictingQueue=buildTrainingQueue({games:[game],puzzles:[],user:'HighTaxi',globalAnnotations:conflictingAnnotations,maxPlies:24});
assert.equal(conflictingQueue[0].historicalMoves[0].classification,'blunder','a problematic classification must take precedence for an identical FEN+move');

const summary=trainingSessionSummary({total:5,correct:3});
assert.deepEqual(summary,{correct:3,total:5,pct:60});
console.log('TRAINING SESSION TESTS OK');
