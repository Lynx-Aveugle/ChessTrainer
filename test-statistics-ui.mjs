import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('./index.html','utf8');
const app=fs.readFileSync('./app.js','utf8');
const css=fs.readFileSync('./styles.css','utf8');

for(const id of [
  'statsScopeBar','sGames','sScore','sWins','sDraws','sLoss','sColors','sAvgMoves',
  'sTrends','sCheckpoints','sAnnotations','sAnnotationPhases','sOpenings','sPriorities','sPositions','sTimeControls'
])assert.match(html,new RegExp(`id=["']${id}["']`),`Missing stats selector ${id}`);
assert.match(app,/from \"\.\/src\/ui\/statistics\.js\"/,'statistics UI module must be wired into app.js');
const statsUi=fs.readFileSync('./src/ui/statistics.js','utf8');
assert.match(statsUi,/from ['\"]\.\.\/analysis\/statistics\.js['\"]/,'statistics UI must use shared statistics engine');
assert.match(app,/createStatisticsRenderer/,'renderStats must use the statistics renderer');
assert.match(statsUi,/setScope\(next\)/,'stats scope must be user-selectable');
assert.match(statsUi,/data-stat-game/,'statistics position entries must expose navigation targets');
assert.match(css,/\.statsScopeBar/);
assert.match(css,/\.statsPriority/);
assert.match(css,/\.statsPosition/);
assert.match(css,/\.statsBars/);
console.log('STATISTICS UI CONTRACT TESTS OK');
