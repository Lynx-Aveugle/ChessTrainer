import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNavigator} from './src/chess/navigation.js';

const root={fen:'root',move:null,parent:null,children:[]};
const child={fen:'child',move:{from:'e2',to:'e4'},parent:root,children:[]};
root.children=[child];
const state={currentNode:root,chessFactory:fen=>({fen}),chess:null,selectedSquare:'e2',lastMove:null};
let calls=[];
const nav=createNavigator({getState:()=>state,setState:()=>{},renderBoard:()=>calls.push('board'),renderArrows:()=>calls.push('arrows'),onPositionChanged:()=>calls.push('position'),schedulePersist:()=>calls.push('persist')});
assert.equal(nav.navigateByMove({from:'e2',to:'e4'}),true);
assert.equal(state.currentNode,child);
assert.deepEqual(calls,['persist','board','arrows','position']);
calls=[];
assert.equal(nav.navigatePrevious(),true);
assert.equal(state.currentNode,root);
assert.deepEqual(calls,['persist','board','arrows','position']);
calls=[];
assert.equal(nav.navigateByMove({from:'a2',to:'a4'}),false);
assert.deepEqual(calls,[]);

const app=fs.readFileSync('./app.js','utf8');
assert.match(app,/createNavigator/);
assert.doesNotMatch(app,/if\(currentNode\?\.parent\)\{currentNode=currentNode\.parent;chess=new Chess\(currentNode\.fen\)/);
assert.doesNotMatch(app,/if\(currentNode\?\.children\?\.\[0\]\)\{currentNode=currentNode\.children\[0\];chess=new Chess\(currentNode\.fen\)/);
console.log('NAVIGATION TESTS OK');
