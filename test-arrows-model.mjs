import assert from 'node:assert/strict';
import {buildArrowDescriptors} from './src/analysis/arrows.js';
import {positionKeyFromFen} from './src/chess/position.js';

const fen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const key=positionKeyFromFen(fen);
const edge={san:'e4',move:{from:'e2',to:'e4',promotion:null},count:12,playedByUser:8,stats:{white:7,draw:2,black:3},annotations:{'!!':5,'!':4,'?':1,'??':1},classification:'blunder'};
const tree={nodes:new Map([[key,{fen,children:new Map([['e2-e4-',edge]])}]])};
const arrows=buildArrowDescriptors(key,tree,{sideFilter:'all',engineBest:{from:'e2',to:'e4'}});
assert.equal(arrows.length,1);
assert.equal(arrows[0].count,12);
assert.equal(arrows[0].userCount,8);
assert.equal(arrows[0].engineBest,true);
assert.equal(arrows[0].source,'database');
assert.equal(arrows[0].classification,'blunder');
assert.ok(Object.isFrozen(arrows));
assert.ok(Object.isFrozen(arrows[0]));
console.log('ARROW MODEL TESTS OK');
