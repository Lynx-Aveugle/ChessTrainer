import assert from 'node:assert/strict';
import {mergeAnnotationCounts,classifyAnnotations,classificationCounts} from './src/analysis/classification.js';

const counts={};
mergeAnnotationCounts(counts,['!','?','!']);
mergeAnnotationCounts(counts,['!','❌']);
assert.deepEqual(counts,{'!':2,'?':1,'❌':1});
assert.equal(classifyAnnotations(['!','??']),'blunder');
assert.equal(classifyAnnotations(['★','!!']),'brilliant');
assert.equal(classifyAnnotations(['!','📖']),'good');
assert.deepEqual(classificationCounts(['!','!','??','??','📖']),{blunder:1,error:0,brilliant:0,excellent:0,good:1,theoretical:1,neutral:0});
console.log('ANNOTATION AGGREGATION REGRESSION TESTS OK');
