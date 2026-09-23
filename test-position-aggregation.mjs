import assert from 'node:assert/strict';
import {openingLineUltraFast} from './pgn.js';
import {buildGlobalTree} from './src/games/tree.js';
import {positionKeyFromFen} from './src/chess/position.js';
import {classifyAnnotations} from './src/analysis/classification.js';

const games=[
  {id:'g1',white:'HighTaxi',black:'A',result:'1-0',pgn:'[White "HighTaxi"]\n[Black "A"]\n[Result "1-0"]\n\n1. Nf3 d5 2. d4 Nf6 *',analysisTree:{children:[{san:'Nf3',annotations:['!','!','??'],children:[]}] }},
  {id:'g2',white:'HighTaxi',black:'B',result:'0-1',pgn:'[White "HighTaxi"]\n[Black "B"]\n[Result "0-1"]\n\n1. d4 Nf6 2. Nf3 d5 *',analysisTree:null},
  {id:'g3',white:'HighTaxi',black:'C',result:'1/2-1/2',pgn:'[White "HighTaxi"]\n[Black "C"]\n[Result "1/2-1/2"]\n\n1. e4 e5 *',analysisTree:null}
];
const tree=buildGlobalTree(games,{maxPlies:4,user:'HighTaxi',globalAnnotations:{[`${positionKeyFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}|e2-e4-`]:{annotations:['★']}}});
assert.equal(tree.nodes.size>0,true);
const start=tree.nodes.get(positionKeyFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
assert.equal(start.children.size,3);
const n1=[...start.children.values()].find(e=>e.san==='Nf3').node;
const n2=[...start.children.values()].find(e=>e.san==='d4').node;
assert.ok(n1&&n2);
const final1=openingLineUltraFast(games[0].pgn,4).out.at(-1).fen;
const final2=openingLineUltraFast(games[1].pgn,4).out.at(-1).fen;
assert.equal(positionKeyFromFen(final1),positionKeyFromFen(final2),'transposition must share one canonical position key');
assert.equal(tree.nodes.get(positionKeyFromFen(final1)).count,2,'same transposed position must count both games once');
assert.equal(classifyAnnotations(['!', '??']),'blunder','blunder has priority over good');
const e4=[...start.children.values()].find(e=>e.san==='e4');
assert.equal(e4.classification,'brilliant','global source annotations must classify database arrows');
const nf3=[...start.children.values()].find(e=>e.san==='Nf3');
assert.deepEqual(nf3.annotations,{'!':1,'??':1},'duplicate annotation icons in one game count once');
assert.equal(nf3.classification,'blunder');
console.log('POSITION AGGREGATION TESTS OK');
