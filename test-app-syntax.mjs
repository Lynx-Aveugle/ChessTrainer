import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const files=['app.js','version.js','chess.js','pgn.js','db.js','src/analysis/evaluation.js','src/analysis/stockfish.js','src/analysis/arrows.js','src/analysis/cache.js','src/analysis/annotations.js','src/app/state.js','src/app/router.js','src/app/lifecycle.js','src/chess/navigation.js','src/chess/position.js','src/games/tree.js','src/persistence/storage.js','src/persistence/backup.js','src/sync/chesscom.js','src/ui/arrows.js','src/ui/board.js','src/ui/moves.js','src/training/puzzles.js','src/training/controller.js'];
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,`${file} ne se parse pas : ${r.stderr||r.stdout}`);}
console.log('APP SYNTAX TESTS OK');
