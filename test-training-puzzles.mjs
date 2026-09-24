import assert from 'node:assert/strict';
import {scanGameForTrainingPuzzles,classifyTrainingPosition,evaluationToPlayerCp,exportTrainingPgn,trainingPuzzleKey} from './src/training/puzzles.js';
import {parsePGN} from './pgn.js';

assert.equal(classifyTrainingPosition({bestPlayerCp:400,playedPlayerCp:180,bestMove:'d2d4',playedMove:'e2e4'})?.type,'missedWin');
assert.equal(classifyTrainingPosition({bestPlayerCp:120,playedPlayerCp:-120,bestMove:'g1f3',playedMove:'h2h3'})?.type,'blunder');
assert.equal(classifyTrainingPosition({bestPlayerCp:400,playedPlayerCp:400,bestMove:'d2d4',playedMove:'d2d4'}),null);
assert.equal(evaluationToPlayerCp({cp:350,mate:null},'w'),350);
assert.equal(evaluationToPlayerCp({cp:-350,mate:null},'b'),350);

const game={id:'fixture-missed-win',source:'Chess.com',white:'HighTaxi',black:'Opponent',result:'1-0',date:'2026.09.23',pgn:'[Event "Test"]\n[White "HighTaxi"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 1-0'};
const parsed=parsePGN(game.pgn)[0];
const start=parsed.root.children[0].parent.fen;
const e4=parsed.root.children[0].fen;
const d4After=new (await import('./chess.js')).Chess(start); d4After.play({from:'d2',to:'d4'});
const fake=new Map([
  [start,{evaluation:{cp:400,mate:null},bestMove:'d2d4'}],
  [d4After.fen(),{evaluation:{cp:-400,mate:null},bestMove:'e7e5'}],
  [e4,{evaluation:{cp:-150,mate:null},bestMove:'e7e5'}]
]);
let analyzeCalls=0;
const analyzedFens=[];
const puzzles=await scanGameForTrainingPuzzles(game,'HighTaxi',async fen=>{analyzeCalls++;analyzedFens.push(fen);return fake.get(fen)||{evaluation:{cp:0,mate:null},bestMove:'e7e5'};});
assert.equal(puzzles.length,1);
assert.equal(analyzeCalls,2,'Le scan doit analyser la position avant le coup puis la position après le coup joué, sans refaire une analyse du meilleur coup séparément');
assert.ok(analyzedFens.includes(start));
assert.ok(analyzedFens.includes(e4));
assert.equal(puzzles[0].type,'missedWin');
assert.equal(puzzles[0].playedSan,'e4');
assert.equal(puzzles[0].bestSan,'d4');
assert.equal(Math.round(puzzles[0].lossCp),250);
const out=exportTrainingPgn(puzzles);
assert.match(out,/\[TrainingType "MissedWin"\]/);
assert.match(out,/\[SetUp "1"\]/);
assert.match(out,/\[FEN "/);
assert.match(out,/\[PlayedMove "e4"\]/);
assert.match(out,/\[BestMove "d4"\]/);
const imported=parsePGN(out);
assert.equal(imported.length,1);
assert.equal(imported[0].startFen,puzzles[0].fen);
assert.equal(imported[0].root.children[0].san,'d4');
assert.equal(trainingPuzzleKey(puzzles[0]),trainingPuzzleKey({...puzzles[0]}));
assert.equal(puzzles[0].gameId,'fixture-missed-win');

const invalidEngineGame={id:'fixture-invalid-engine',source:'Chess.com',white:'HighTaxi',black:'Opponent',result:'*',pgn:'[White "HighTaxi"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'};
const invalidParsed=parsePGN(invalidEngineGame.pgn)[0];
const invalidStart=invalidParsed.root.children[0].parent.fen;
let invalidCalls=0;
const invalidResult=await scanGameForTrainingPuzzles(invalidEngineGame,'HighTaxi',async fen=>{
  invalidCalls++;
  if(fen===invalidStart)return {evaluation:{cp:0,mate:null},bestMove:'e2e5'};
  return {evaluation:{cp:0,mate:null},bestMove:'d2d4'};
});
assert.deepEqual(invalidResult,[],'Un résultat Stockfish illégal doit être ignoré sans interrompre le scan de la partie');
assert.ok(invalidCalls>=3,'Le scan doit continuer après un résultat Stockfish invalide');
console.log('TRAINING PUZZLES TESTS OK');
