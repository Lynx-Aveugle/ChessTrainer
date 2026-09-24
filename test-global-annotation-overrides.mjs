import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getEffectiveAnnotations,getStoredGlobalAnnotations,setGlobalAnnotation,mergeGlobalAnnotations} from './src/analysis/annotations.js';

const app=fs.readFileSync('./app.js','utf8');
assert.match(app,/suppressedAnnotations:\[\.\.\.\(n\.suppressedAnnotations\|\|\[\]\)/,'Les masquages locaux doivent être sérialisés');
assert.match(app,/suppressedAnnotations:\[\.\.\.\(data\.suppressedAnnotations\|\|\[\]\)/,'Les masquages locaux doivent être restaurés');
const fen='8/8/8/8/8/8/4P3/4K2k w - - 0 1';
const move={from:'e2',to:'e3',promotion:null,san:'e3'};
const global={};
setGlobalAnnotation(global,fen,move,'★',true);
const nodeA={parent:{fen},move,annotations:['★'],suppressedAnnotations:[]};
const nodeB={parent:{fen},move,annotations:[],suppressedAnnotations:['★']};
assert.deepEqual(getEffectiveAnnotations(nodeA,global),['★']);
assert.deepEqual(getEffectiveAnnotations(nodeB,global),[],'B doit pouvoir masquer localement ★');
assert.deepEqual(getEffectiveAnnotations(nodeA,global),['★'],'Le masquage de B ne doit pas toucher A');
assert.deepEqual(getEffectiveAnnotations({...nodeB,suppressedAnnotations:[]},global),['★'],'Réactiver B doit retrouver ★');

const legacyKey=`${fen.split(/\s+/).slice(0,4).join(' ')}|e3`;
const legacy={ [legacyKey]: {annotations:['!']} };
assert.deepEqual(getStoredGlobalAnnotations(legacy,fen,move),['!']);
const canonicalKey=`${fen.split(/\s+/).slice(0,4).join(' ')}|e2-e3-`;
const mixed={[canonicalKey]:{annotations:['★']},[legacyKey]:{annotations:['!']}};
assert.deepEqual(getStoredGlobalAnnotations(mixed,fen,move),['★','!'],'Les anciennes et nouvelles clés d une même annotation doivent être fusionnées');
setGlobalAnnotation(legacy,fen,move,'!',false);
assert.deepEqual(getStoredGlobalAnnotations(legacy,fen,move),[],'La suppression legacy ne doit pas ressusciter l annotation');

const merged=mergeGlobalAnnotations(
  {[`${fen.split(/\s+/).slice(0,4).join(' ')}|e2-e3-`]:{annotations:['★']}},
  {[`${fen.split(/\s+/).slice(0,4).join(' ')}|e2-e3-`]:{annotations:['!']}}
);
assert.deepEqual(Object.values(merged)[0].annotations,['★','!'],'Une restauration en fusion doit unionner les annotations');
console.log('NEW REGRESSION TESTS OK');
