import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('./app.js','utf8');
assert.match(app,/function moveGaugeMarkup\(stats\)/);
assert.match(app,/Bl \$\{w\}%/);
assert.match(app,/= \$\{d\}%/);
assert.match(app,/No \$\{b\}%/);
assert.match(app,/function gaugeMarkup\(stats,total\)/);
console.log('MOVE GAUGE REGRESSION TESTS OK');
