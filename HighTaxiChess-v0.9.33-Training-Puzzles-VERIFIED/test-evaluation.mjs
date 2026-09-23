import assert from 'node:assert/strict';
import {normalizeEngineEvaluation} from './src/analysis/evaluation.js';

assert.deepEqual(normalizeEngineEvaluation('8/8/8/8/8/8/8/4K2k w - - 0 1',{cp:120,mate:null}),{cp:120,mate:null});
assert.deepEqual(normalizeEngineEvaluation('8/8/8/8/8/8/8/4K2k b - - 0 1',{cp:120,mate:null}),{cp:-120,mate:null});
assert.deepEqual(normalizeEngineEvaluation('8/8/8/8/8/8/8/4K2k b - - 0 1',{cp:0,mate:3}),{cp:0,mate:-3});
assert.deepEqual(normalizeEngineEvaluation('8/8/8/8/8/8/8/4K2k w - - 0 1',{cp:-40,mate:-2}),{cp:-40,mate:-2});
console.log('EVALUATION NORMALIZATION TESTS OK');
