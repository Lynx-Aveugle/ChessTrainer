import assert from 'node:assert/strict';
import {createTrainingController} from './src/training/controller.js';
import {parsePGN} from './pgn.js';
import {Chess} from './chess.js';

const game={id:'controller-game',source:'Chess.com',white:'HighTaxi',black:'Opponent',result:'1-0',date:'2026.09.23',pgn:'[White "HighTaxi"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 1-0'};
const parsed=parsePGN(game.pgn)[0];
const start=parsed.root.fen;
const e4=parsed.root.children[0].fen;
const d4=new Chess(start);d4.play({from:'d2',to:'d4'});
const evals=new Map([[start,{evaluation:{cp:400,mate:null},bestMove:'d2d4'}],[d4.fen(),{evaluation:{cp:-400,mate:null},bestMove:'e7e5'}],[e4,{evaluation:{cp:-150,mate:null},bestMove:'e7e5'}]]);
const elements=new Map();
for(const id of ['trainingProgress','trainingScanBtn','trainingStopBtn'])elements.set(id,{hidden:id!=='trainingProgress',disabled:false,textContent:''});
globalThis.document={body:{classList:{contains:()=>false}},getElementById:id=>elements.get(id),createElement:()=>({}),};
const store=new Map();
globalThis.localStorage={setItem:(k,v)=>store.set(k,String(v)),getItem:k=>store.get(k)||null};
globalThis.confirm=()=>true;
let toasts=[];let rendered=0;let cancelCount=0;let positionChanged=0;
const state={trainingPuzzles:[],trainingPuzzlesRevision:0,trainingScanActive:false};
const controller=createTrainingController({
  state,getGames:()=>[game],currentUser:()=> 'HighTaxi',analyzeFen:async fen=>evals.get(fen)||{evaluation:{cp:0,mate:null},bestMove:'e7e5'},
  cancelEngineAnalysis:()=>{cancelCount++},render:()=>{rendered++},toast:msg=>toasts.push(msg),onPositionChanged:()=>{positionChanged++}
});
await controller.scan();
assert.equal(controller.active(),false);
assert.equal(state.trainingScanActive,false);
assert.equal(state.trainingPuzzles.length,1);
assert.equal(state.trainingPuzzles[0].type,'missedWin');
assert.equal(state.trainingPuzzlesRevision,1,'saving scan results must invalidate the training queue cache');
assert.equal(cancelCount,1);
assert.ok(rendered>=1);
assert.ok(toasts.at(-1).includes('1 puzzle'));
assert.ok(store.get('ht_training_puzzles_v1').includes('controller-game'));
assert.equal(elements.get('trainingExportBtn'),undefined);

// Stop must interrupt an in-flight Stockfish request instead of waiting for its timeout.
let releasePendingAnalyze;
let pendingAnalyzeStarted=false;
const pendingAnalyze=new Promise(resolve=>{releasePendingAnalyze=resolve;});
const stopController=createTrainingController({
  state:{trainingPuzzles:[],trainingPuzzlesRevision:0,trainingScanActive:false},getGames:()=>[game],currentUser:()=> 'HighTaxi',
  analyzeFen:async fen=>{
    if(!pendingAnalyzeStarted){pendingAnalyzeStarted=true;await pendingAnalyze;}
    return evals.get(fen)||{evaluation:{cp:0,mate:null},bestMove:'e7e5'};
  },
  cancelEngineAnalysis:()=>{cancelCount++},render:()=>{},toast:()=>{},onPositionChanged:()=>{}
});
const scanPromise=stopController.scan();
while(!pendingAnalyzeStarted)await new Promise(resolve=>setImmediate(resolve));
const cancelsBeforeStop=cancelCount;
stopController.stop();
assert.equal(cancelCount,cancelsBeforeStop+1,'Arrêter doit annuler immédiatement l’analyse Stockfish en cours');
releasePendingAnalyze();
await scanPromise;
assert.equal(stopController.active(),false);

console.log('TRAINING CONTROLLER TESTS OK');

// A Stockfish cancellation may reject with a generic Error; an explicit user stop must still be reported as a clean stop.
let rejectCancelledAnalyze;
let cancellationAnalyzeStarted=false;
const cancellationPending=new Promise((resolve,reject)=>{rejectCancelledAnalyze=reject;});
const cancellationToasts=[];
let cancellationCount=0;
const cancellationController=createTrainingController({
  state:{trainingPuzzles:[],trainingPuzzlesRevision:0,trainingScanActive:false},getGames:()=>[game],currentUser:()=> 'HighTaxi',
  analyzeFen:async()=>{cancellationAnalyzeStarted=true;await cancellationPending;return {evaluation:{cp:0,mate:null},bestMove:'d2d4'};},
  cancelEngineAnalysis:()=>{cancellationCount++;if(cancellationCount>1)rejectCancelledAnalyze(new Error('Stockfish request cancelled'));},
  render:()=>{},toast:msg=>cancellationToasts.push(msg),onPositionChanged:()=>{}
});
const cancellationScan=cancellationController.scan();
while(!cancellationAnalyzeStarted)await new Promise(resolve=>setImmediate(resolve));
cancellationController.stop();
await cancellationScan;
assert.ok(cancellationToasts.at(-1)?.startsWith('Scan arrêté'),'Une annulation utilisateur doit rester un arrêt propre même si Stockfish rejette une erreur générique');
assert.equal(cancellationController.active(),false);
