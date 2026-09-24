import assert from 'node:assert/strict';
import {getEffectiveAnnotations,upsertGlobalAnnotations,removeGlobalAnnotation} from './src/analysis/annotations.js';

const parentFen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const move={from:'e2',to:'e4',promotion:null};
const transposedParentA='rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const transposedParentB='rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 2';
const transposedMove={from:'b8',to:'c6',promotion:null,san:'Nc6'};
const global={};

upsertGlobalAnnotations(global,parentFen,move,['★']);

const gameBNode={
  parent:{fen:parentFen},
  move,
  annotations:[]
};
assert.deepEqual(getEffectiveAnnotations(gameBNode,global),['★'],
  'Une annotation ajoutée dans une autre partie doit apparaître sur le même coup/position');

const transposedGlobal={};
upsertGlobalAnnotations(transposedGlobal,transposedParentA,transposedMove,['!']);
assert.deepEqual(getEffectiveAnnotations({parent:{fen:transposedParentB},move:transposedMove,annotations:[]},transposedGlobal),['!'],
  'Une même position avec des compteurs de coups différents doit partager ses annotations');

upsertGlobalAnnotations(global,parentFen,move,['★','!']);
assert.deepEqual(getEffectiveAnnotations(gameBNode,global),['★','!'],
  'Les annotations globales doivent être fusionnées sans doublon');

removeGlobalAnnotation(global,parentFen,move,'★');
assert.deepEqual(getEffectiveAnnotations(gameBNode,global),['!'],
  'Retirer une annotation globale ne doit pas retirer les autres annotations');

console.log('GLOBAL ANNOTATION PROPAGATION TESTS OK');
