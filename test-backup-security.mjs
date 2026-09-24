import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as backup from './src/persistence/backup.js';

assert.equal(typeof backup.validateBackupPayload, 'function');
const validGamePgn='[Event "Test"]\n[White "HighTaxi"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 e5 *';
assert.equal(backup.validateBackupPayload({format:'HighTaxi Chess Backup',schemaVersion:3,games:[{id:'g1',pgn:validGamePgn}]},3).length,1);
assert.throws(()=>backup.validateBackupPayload({format:'HighTaxi Chess Backup',schemaVersion:3,games:[{id:'g1',pgn:'<script>alert(1)</script>'}]},3),/invalide/i);
assert.throws(()=>backup.validateBackupPayload({format:'HighTaxi Chess Backup',schemaVersion:4,games:[]},3),/plus récente/i);

const app=fs.readFileSync('./app.js','utf8');
assert.match(app,/validateBackupPayload\(data,DATA_SCHEMA_VERSION\)/,'Restore must validate PGNs before writing them');
assert.match(app,/map\(\(\[a,n\]\)=>`\$\{esc\(a\)\}/,'Imported annotation labels must be HTML-escaped');

console.log('BACKUP SECURITY TESTS OK');
