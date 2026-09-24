import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const root = new URL('.', import.meta.url).pathname;
const app = fs.readFileSync(root + 'app.js', 'utf8');
const sw = fs.readFileSync(root + 'sw.js', 'utf8');
const version = fs.readFileSync(root + 'version.js', 'utf8');

if (/postMessage\(\{type:\s*["']token/.test(app)) throw new Error('token object still sent to Stockfish');
if (!app.includes('createStockfishController')) throw new Error('Stockfish controller missing');
if (!app.includes('new URL("./stockfish-18-lite-single.js",import.meta.url)')) throw new Error('direct local Stockfish worker missing');
if (!app.includes('base.hash=`${encodeURIComponent(new URL("./stockfish-18-lite-single.wasm",import.meta.url).href)},worker`')) throw new Error('Stockfish WASM worker hash missing');
if (!fs.readFileSync(root + 'src/analysis/stockfish.js','utf8').includes('postMessage(`position fen ${next.fen}`)')) throw new Error('position command missing');
if (!fs.readFileSync(root + 'src/analysis/stockfish.js','utf8').includes('postMessage(`go depth ${depth}`)')) throw new Error('go command missing');

if (!sw.includes('const refresh=cachePromise.then(cache=>fetch(e.request)')) throw new Error('Service Worker refresh path missing');
if (!sw.includes('if(cached)return cached;')) throw new Error('Service Worker cache-first path missing');
const versionMatch=version.match(/APP_VERSION=\"([^\"]+)/);
if(!versionMatch)throw new Error('APP_VERSION missing');

const js = fs.readFileSync(root + 'stockfish-18-lite-single.js');
const wasm = fs.readFileSync(root + 'stockfish-18-lite-single.wasm');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
if (js.length !== 20670 || sha(js) !== '2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe') throw new Error('Stockfish JS integrity mismatch');
if (wasm.length !== 7295411 || sha(wasm) !== 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1') throw new Error('Stockfish WASM integrity mismatch');

console.log(`STOCKFISH ${versionMatch[1]} REGRESSION TESTS OK`);
console.log('NOTE: this test validates the exact Worker message contract and assets; browser execution still requires a real browser runtime.');
