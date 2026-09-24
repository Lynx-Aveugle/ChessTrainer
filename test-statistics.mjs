import assert from 'node:assert/strict';
import {buildStatistics} from './src/analysis/statistics.js';
import {positionKeyFromFen} from './src/chess/position.js';

const games=[
  {id:'g1',timestamp:1726502400,white:'HighTaxi',black:'A',result:'1-0',eco:'A10',pgn:'[Date "2026.09.16"]\n[White "HighTaxi"]\n[Black "A"]\n[Result "1-0"]\n[ECO "A10"]\n[ECOUrl "https://www.chess.com/openings/English-Opening-Great-Snake-Variation"]\n\n1. c4 e5 2. Nc3 g6 3. g3 Bg7 4. Bg2 Ne7 5. d3 O-O 6. Nf3 *',analysisTree:null},
  {id:'g2',timestamp:1726588800,white:'B',black:'HighTaxi',result:'0-1',eco:'B10',pgn:'[Date "2026.09.17"]\n[White "B"]\n[Black "HighTaxi"]\n[Result "0-1"]\n[ECO "B10"]\n[ECOUrl "https://www.chess.com/openings/Caro-Kann-Defense"]\n\n1. e4 c6 2. Nf3 d5 3. e5 c5 4. Bb5+ Bd7 5. a4 *',analysisTree:null},
  {id:'g3',timestamp:1726675200,white:'HighTaxi',black:'C',result:'1/2-1/2',eco:'A10',pgn:'[Date "2026.09.18"]\n[White "HighTaxi"]\n[Black "C"]\n[Result "1/2-1/2"]\n[ECO "A10"]\n[ECOUrl "https://www.chess.com/openings/English-Opening-Great-Snake-Variation"]\n\n1. c4 e5 2. Nc3 g6 3. g3 Bg7 4. Bg2 Ne7 5. d3 O-O *',analysisTree:null},
  {id:'g4',timestamp:1726761600,white:'HighTaxi',black:'D',result:'0-1',eco:'A10',pgn:'[Date "2026.09.19"]\n[White "HighTaxi"]\n[Black "D"]\n[Result "0-1"]\n[ECO "A10"]\n[ECOUrl "https://www.chess.com/openings/English-Opening-Great-Snake-Variation"]\n\n1. c4 e5 2. Nc3 g6 3. g3 Bg7 4. Bg2 Ne7 5. d3 O-O *',analysisTree:{fen:'rnbqk1nr/pppp1pbp/6p1/4p3/2P5/2N3P1/PP1PPP1P/R1BQKBNR w KQkq - 1 4',children:[{move:{from:'f1',to:'g2',promotion:null},san:'Bg2',annotations:['??'],suppressedAnnotations:[],children:[]}]}},
];

const startFen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const c4Key=positionKeyFromFen(startFen);
const global={ [`${c4Key}|c2-c4-`]:{annotations:['★']} };

const stats=buildStatistics(games,{user:'HighTaxi',globalAnnotations:global,maxPlies:24});
assert.equal(stats.overview.games,4);
assert.equal(stats.overview.wins,2);
assert.equal(stats.overview.draws,1);
assert.equal(stats.overview.losses,1);
assert.equal(stats.overview.scorePct,62.5);
assert.equal(stats.colors.w.games,3);
assert.equal(stats.colors.b.games,1);
assert.equal(stats.checkpoints[0].fullMoves,5);
assert.equal(stats.checkpoints.length,3);
assert.equal(stats.openings.length,2);
assert.equal(stats.openings.find(x=>x.eco==='A10').games,3);
assert.match(stats.openings.find(x=>x.eco==='A10').name,/English Opening/i);
assert.equal(stats.annotationMoves.blunder,1);
assert.equal(stats.annotationMoves.brilliant>=2,true,'global annotation must propagate to games reaching the same move');
assert.equal(stats.annotationPhases['4-6'].blunder,1);
assert.equal(stats.trends.length,1,'dates should aggregate by month');
assert.equal(stats.trends.at(-1).games,4);
assert.equal(stats.priorities.length>=1,true);
assert.equal(stats.priorities[0].classificationLabel,'blunder');
assert.ok(stats.priorities[0].sampleGameId);
console.log('STATISTICS MODULE TESTS OK');
