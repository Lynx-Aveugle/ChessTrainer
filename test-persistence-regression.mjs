import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadGames,saveGame,saveGames,removeGame,replaceGames,migrateStorage} from './src/persistence/storage.js';
const app=fs.readFileSync('./app.js','utf8');
const version=fs.readFileSync('./version.js','utf8');
for(const fn of [loadGames,saveGame,saveGames,removeGame,replaceGames,migrateStorage])assert.equal(typeof fn,'function');
assert.match(app,/src\/persistence\/storage\.js/);
assert.match(version,/DATA_SCHEMA_VERSION=3/);
console.log('PERSISTENCE REGRESSION TESTS OK');
