import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chessComMonthKey,chessComStableId,chessComPgnIsStandard} from './src/sync/chesscom.js';
const app=fs.readFileSync('./app.js','utf8');
assert.equal(chessComMonthKey('https://api.chess.com/pub/player/HighTaxi/games/2026/09'),'2026/09');
assert.equal(chessComStableId({url:'https://www.chess.com/game/live/123'},'PGN'),'chesscom-123');
assert.equal(chessComPgnIsStandard({Variant:'standard'}),true);
assert.equal(chessComPgnIsStandard({Variant:'Chess960'}),false);
assert.match(app,/src\/sync\/chesscom\.js/);
console.log('SYNC REGRESSION TESTS OK');

assert.doesNotMatch(app,/existingArchiveKeys/,`Un mois partiellement importé ne doit pas être considéré comme synchronisé uniquement parce qu'il possède déjà quelques parties`);
assert.match(app,/monthInvalid=0/,'Chaque mois doit conserver son propre compteur de PGN invalides');
assert.match(app,/monthKey!==currentKey&&monthInvalid===0/,'Un mois avec un PGN invalide ne doit pas être marqué comme synchronisé');
