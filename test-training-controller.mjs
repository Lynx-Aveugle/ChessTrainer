import assert from 'node:assert/strict';
import {createTrainingController} from './src/training/controller.js';
import {parsePGN} from './pgn.js';
import {Chess} from './chess.js';

const game={id:'controller-game',source:'Chess.com',white:'HighTaxi',black:'Opponent',result:'1-0',date:'2026.09.23',pgn:'[White "HighTaxi"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 1-0'};
const parsed=parsePGN(game.pgn)[0];
const start=parsed.root.fen;
const e4=parsed.root.children[0].fen;
const d4=new Chess(start);d4.play({from:'d2',to:'d4'});
const evals=new Map([[start,{cp:0,bestMove:'d2d4'}],[d4.fen(),{cp:-400,bestMove:'e7e5'}],[e4,{cp:-150,bestMove:'e7e5'}]]);
const elements=new Map();
for(const id of ['trainingProgress','trainingScanBtn','trainingStopBtn'])elements.set(id,{hidden:id!=='trainingProgress',disabled:false,textContent:''});
globalThis.document={body:{classList:{contains:()=>false}},getElementById:id=>elements.get(id),createElement:()=>({}),};
const store=new Map();
globalThis.localStorage={setItem:(k,v)=>store.set(k,String(v)),getItem:k=>store.get(k)||null};
globalThis.confirm=()=>true;
let toasts=[];let rendered=0;let cancelCount=0;let positionChanged=0;
const state={trainingPuzzles:[],trainingScanActive:false};
const controller=createTrainingController({
  state,getGames:()=>[game],currentUser:()=> 'HighTaxi',analyzeFen:async fen=>evals.get(fen)||{cp:0,bestMove:'e7e5'},
  cancelEngineAnalysis:()=>{cancelCount++},render:()=>{rendered++},toast:msg=>toasts.push(msg),onPositionChanged:()=>{positionChanged++}
});
await controller.scan();
assert.equal(controller.active(),false);
assert.equal(state.trainingScanActive,false);
assert.equal(state.trainingPuzzles.length,1);
assert.equal(state.trainingPuzzles[0].type,'missedWin');
assert.equal(cancelCount,1);
assert.ok(rendered>=1);
assert.ok(toasts.at(-1).includes('1 puzzle'));
assert.ok(store.get('ht_training_puzzles_v1').includes('controller-game'));
assert.equal(elements.get('trainingExportBtn'),undefined);
console.log('TRAINING CONTROLLER TESTS OK');
