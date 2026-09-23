import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('./app.js','utf8');
assert.doesNotMatch(app,/get state\./,'Navigation state must expose plain property names');
assert.doesNotMatch(app,/set state\./,'Navigation state must expose plain property names');
assert.doesNotMatch(app,/\$\("state\./,'DOM lookup must not include the state object prefix');
assert.doesNotMatch(app,/\bstate\.chess:/,'Object literals must use chess: as the property name');
assert.match(app,/globalMoveAnnotations:state\.globalMoveAnnotations/,'Backup object must serialize globalMoveAnnotations explicitly');
assert.doesNotMatch(app,/\{\.\.\.activeGame[,}]/,'Persistence must use state.activeGame');
assert.doesNotMatch(app,/\[\.\.\.currentNode\.annotations\]/,'Annotation toggle must read state.currentNode');
assert.match(app,/type:"application\/x-chess-pgn"/,'PGN export must keep the correct MIME type');
assert.match(app,/globalAnnotations:state\.globalMoveAnnotations/,'Global tree must receive the persisted annotation map');
assert.match(app,/state\.globalTreePendingFilter!==\(state\.globalTree\?\._filter\)/,'Pending scope must compare against the current tree filter');
console.log('STATE WIRING TESTS OK');

assert.match(app,/if\(\/chess\\\.com\$\/i\.test\(u\.hostname\)/,'Chess.com opening URL parser must keep the real hostname');
