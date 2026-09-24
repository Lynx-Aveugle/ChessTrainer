import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildStatistics} from './src/analysis/statistics.js';
import {splitGames,headersFrom} from './pgn.js';

const raw=fs.readFileSync('./fixtures/ChessCom_hightaxi_202609.pgn','utf8');
const games=splitGames(raw).map((pgn,i)=>{const h=headersFrom(pgn);return {id:`fixture-${i}`,pgn,white:h.White,black:h.Black,result:h.Result,eco:h.ECO,timestamp:Date.parse((h.UTCDate||h.Date||'').replace(/\./g,'-'))/1000};});
const started=performance.now();
const stats=buildStatistics(games,{user:'HighTaxi',maxPlies:24});
const elapsed=performance.now()-started;
assert.equal(games.length,153);
assert.equal(stats.overview.games,153,'all fixture games should belong to HighTaxi');
assert.equal(stats.maxPlies,24);
assert.ok(stats.positions.every(p=>p.samplePly<=24),'position aggregation must stop at 24 plies');
assert.ok(stats.openings.length>0,'real Chess.com fixture should yield opening data');
assert.equal(stats.scopes.w.overview.games+stats.scopes.b.overview.games,153);
assert.ok(elapsed<5000,`statistics should remain practical on 153 games (${elapsed.toFixed(0)}ms)`);
console.log(`STATISTICS FIXTURE TEST OK · ${elapsed.toFixed(0)}ms · ${games.length} games`);
