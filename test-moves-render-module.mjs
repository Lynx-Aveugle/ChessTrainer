import assert from 'node:assert/strict';
import {createMoveNavigator,renderMovesList} from './src/ui/moves.js';
assert.equal(typeof createMoveNavigator,'function');
assert.equal(typeof renderMovesList,'function');
console.log('MOVES RENDER MODULE TESTS OK');
