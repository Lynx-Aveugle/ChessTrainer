import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('./app.js','utf8'), index=fs.readFileSync('./index.html','utf8'), pgn=fs.readFileSync('./pgn.js','utf8'), version=fs.readFileSync('./version.js','utf8'), sw=fs.readFileSync('./sw.js','utf8');
assert.match(version,/APP_VERSION="0\.9\.33"/);
for(const icon of ["!!","!","★","👍","✓","📖","?!","?","❌","??"]) assert.ok(app.includes(`icon:"${icon}"`),`Annotation absente: ${icon}`);
assert.match(pgn,/HighTaxi/); assert.match(pgn,/!!/); assert.match(pgn,/📖/); assert.match(pgn,/❌/);
assert.match(index,/id="analysisExportBtn"/); assert.match(index,/id="moveInsights"/); assert.match(index,/id="settingsPanel"/); assert.match(index,/id="settingsRebuild"/);
assert.match(app,/scheduleBackgroundPersist/); assert.match(app,/renderMovesList/); assert.match(app,/function renderSelectedMoveInsights/);
assert.match(index,/setting_autoEngine/); assert.match(index,/setting_showArrows/); assert.match(index,/setting_compactMoves/);
assert.match(sw,/v0\.9\.33/);
console.log('CURRENT-VERSION UI/ANNOTATION/PERFORMANCE TESTS OK');

assert.match(index,/id="trainingScanBtn"/);assert.match(index,/id="trainingExportBtn"/);assert.match(app,/trainingController\.scan\(\)/);assert.match(app,/trainingController\.exportFile\(\)/);
assert.equal((app.match(/trainingController\.scan\(\)/g)||[]).length,1);assert.equal((app.match(/trainingController\.stop\(\)/g)||[]).length,1);assert.equal((app.match(/trainingController\.exportFile\(\)/g)||[]).length,1);assert.equal((app.match(/trainingController\.clear\(\)/g)||[]).length,1);
