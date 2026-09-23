import assert from 'node:assert/strict';
import {createStockfishController} from './src/analysis/stockfish.js';

class FakeWorker{
  constructor(){this.messages=[];this.onmessage=null;this.onerror=null;}
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
  emit(line){this.onmessage?.({data:line});}
}
let worker;
const controller=createStockfishController({workerFactory:()=>{worker=new FakeWorker();return worker},timeoutMs:1000});
const ready=controller.ensureReady();
worker.emit('uciok');
worker.emit('readyok');
await ready;
const p1=controller.analyze('fen-A');
await Promise.resolve();
assert.ok(worker.messages.includes('position fen fen-A'));
const p2=controller.analyze('fen-B');
await Promise.resolve();
assert.notEqual(p1,p2);
let p2Settled=false;
p2.then(()=>{p2Settled=true},()=>{p2Settled=true});
worker.emit('bestmove e2e4');
await Promise.resolve();
assert.equal(p2Settled,false,'a late bestmove from fen-A must not resolve fen-B');
worker.emit('info depth 12 score cp 30 pv d2d4');
worker.emit('bestmove d2d4');
const resultB=await p2;
assert.equal(resultB.bestMove,'d2d4');
assert.equal(resultB.depth,12);
let p1Rejected=false;
try{await p1}catch(error){p1Rejected=/Stale/.test(error.message)}
assert.equal(p1Rejected,true);
const cached=await controller.analyze('fen-B');
assert.equal(cached.bestMove,'d2d4');
await controller.dispose();
console.log('STOCKFISH ORCHESTRATION TESTS OK');
