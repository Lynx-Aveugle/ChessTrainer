import assert from 'node:assert/strict';
import {createBoardRenderer,renderBoardSquares} from './src/ui/board.js';
assert.equal(typeof createBoardRenderer,'function');
assert.equal(typeof renderBoardSquares,'function');
console.log('BOARD RENDER MODULE TESTS OK');
