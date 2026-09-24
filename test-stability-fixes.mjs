import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chessComStableId } from './src/sync/chesscom.js';
import { createStockfishController } from './src/analysis/stockfish.js';
import * as statistics from './src/analysis/statistics.js';
import { buildStatistics } from './src/analysis/statistics.js';
import * as stateModule from './src/app/state.js';

// Chess.com IDs must survive a migrated record that still stores a monthly archive URL.
const migratedPgn = `[Event "Live Chess"]\n[Link "https://www.chess.com/game/live/180003043684"]\n[White "HighTaxi"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. c4 e5 2. Nc3`;
assert.equal(
  chessComStableId({ url: 'https://api.chess.com/pub/player/HighTaxi/games/2026/09' }, migratedPgn),
  'chesscom-180003043684'
);

// Account changes must invalidate user-scoped state so no old-user analysis remains visible.
const state = {
  activeGame: { id: 'old' }, currentNode: { fen: 'old' }, selectedSquare: 'e4', lastMove: { from: 'e2', to: 'e4' }, globalTree: {}, globalTreeBuilding: true,
  globalTreeBuiltFor: 12, globalTreeProgress: { done: 3, total: 9 }, globalTreeSideFilter: 'w',
  globalTreePendingFilter: 'b', analysisScope: 'w', dataRevision: 12, trainingCacheRevision: 12,
  trainingCache: [{ id: 1 }], trainingPuzzlesRevision: 20, trainingScanActive: true, engineSearchToken: 7, engineLastFen: 'old', enginePendingFen: 'old',
  engineBusy: true, engineUnavailable: true,
};
assert.equal(typeof stateModule.resetUserScopedState, 'function', 'resetUserScopedState must be an exported state helper');
stateModule.resetUserScopedState(state);
assert.equal(state.activeGame, null);
assert.equal(state.currentNode, null);
assert.equal(state.globalTree, null);
assert.equal(state.selectedSquare, null);
assert.equal(state.lastMove, null);
assert.equal(state.trainingScanActive, false);
assert.equal(state.globalTreeBuilding, false);
assert.equal(state.globalTreeSideFilter, 'all');
assert.equal(state.analysisScope, 'all');
assert.equal(state.trainingCache.length, 0);
assert.equal(state.trainingCacheRevision, -1);
assert.equal(state.trainingPuzzlesRevision, 21);
assert.equal(state.engineBusy, false);
assert.equal(state.enginePendingFen, null);
assert.equal(state.engineLastFen, '');
assert.equal(state.dataRevision, 13);
assert.equal(state.engineSearchToken, 8);

// Opening knowledge must use normalized positions rather than raw move identity.
const commonPositionFacts = [
  { openingPrefix: ['a', 'b'], openingPositionPrefix: ['P1', 'P2'] },
  { openingPrefix: ['c', 'd'], openingPositionPrefix: ['P1', 'P2'] },
  { openingPrefix: ['e', 'f'], openingPositionPrefix: ['P1', 'P2'] },
];
assert.equal(typeof statistics.knowledgePlies, 'function', 'knowledgePlies must be exported for regression testing');
assert.equal(statistics.knowledgePlies(commonPositionFacts, 2), 2);


const tenMoveWhitePgn='[Event "Checkpoint"]\n[White "HighTaxi"]\n[Black "Opponent"]\n[Result "*"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8 9. Nf3 Nf6 10. Ng1 *';
const checkpointStats=buildStatistics([{id:'checkpoint',source:'PGN',white:'HighTaxi',black:'Opponent',result:'*',pgn:tenMoveWhitePgn}],{user:'HighTaxi'});
assert.equal(checkpointStats.checkpoints.find(x=>x.fullMoves===10)?.games,1,'A game ending after 10.White has reached the 10-move checkpoint');

// Stockfish: only one principal variation, bounded search, larger cache/hash, and recovery after timeout.
let worker;
class FakeWorker {
  constructor() { this.messages = []; this.onmessage = null; this.onerror = null; this.terminated = false; }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(line) { this.onmessage?.({ data: line }); }
}
const controller = createStockfishController({
  workerFactory: () => { worker = new FakeWorker(); return worker; },
  timeoutMs: 1000,
  searchTimeoutMs: 35,
  depth: 16,
  cacheSize: 128,
  hashMb: 32,
  multiPv: 1,
});
const ready = controller.ensureReady();
worker.emit('uciok');
worker.emit('readyok');
await ready;
assert.ok(worker.messages.includes('setoption name MultiPV value 1'));
assert.ok(worker.messages.includes('setoption name Hash value 32'));
const slow = controller.analyze('fen-timeout');
await assert.rejects(slow, /temps d.[sS]?analyse dépassé/i);
const timedOutWorker = worker;
assert.equal(timedOutWorker.terminated, true, 'timeout must restart the worker before accepting another search');
const ready2 = controller.ensureReady();
worker.emit('uciok');
worker.emit('readyok');
await ready2;
const quick = controller.analyze('fen-ok');
await Promise.resolve();
assert.notEqual(worker, timedOutWorker, 'next search must use a fresh worker after timeout');
worker.emit('info depth 10 score cp 42 pv e2e4');
worker.emit('bestmove e2e4');
assert.equal((await quick).bestMove, 'e2e4');
await controller.dispose();

// Service worker must return cached shell immediately and refresh it in the background.
const sw = fs.readFileSync('./sw.js', 'utf8');
assert.match(sw, /CACHE=.*v0\.10\.4/);
assert.match(sw, /e\.waitUntil\(refresh\)/);
assert.match(sw, /if\(cached\)[^{]*return cached;/s);

// Sync must persist the individual Chess.com link, not only the monthly archive URL.
const app = fs.readFileSync('./app.js', 'utf8');
assert.match(app, /url:h\.Link\|\|archiveUrl/);
assert.match(app, /chessComStableId\(\{url:h\.Link/);
assert.match(app, /resetUserScopedState\(state\)/);
assert.match(app, /localStorage\.removeItem\(CHESS_SYNC_KEY\)/);
assert.match(app, /localStorage\.removeItem\(CHESS_SYNC_STATUS_KEY\)/);

console.log('STABILITY FIX TESTS OK');
