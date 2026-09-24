import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openingLineUltraFast} from './pgn.js';

const app=fs.readFileSync('./app.js','utf8');
const tree=fs.readFileSync('./src/games/tree.js','utf8');
const training=fs.readFileSync('./src/ui/training.js','utf8');
const controller=fs.readFileSync('./src/training/controller.js','utf8');

// settings cache button must not reference a private/undefined cache and must clear all analysis caches.
assert.match(app,/settingsClearCaches[\s\S]*?clearOpeningPrefixCache\(\)/,'Le bouton « vider les caches » doit appeler une API publique du cache de l’arbre');
assert.match(app,/settingsClearCaches[\s\S]*?engineController\?\.clearCache\?\.\(\)/,'Le bouton « vider les caches » doit aussi vider le cache Stockfish');
assert.match(tree,/export function clearOpeningPrefixCache\(\)/,'Le cache d’ouverture doit exposer une fonction de nettoyage publique');
assert.doesNotMatch(app,/settingsClearCaches[\s\S]*?openingPrefixCache\.clear\(\)/,'app.js ne doit pas accéder directement à openingPrefixCache');

// Analysis note draft must be captured before the router leaves the analysis screen.
const navigateBlock=app.match(/const appRouter=createRouter\(\{onNavigate\(([\s\S]*?)\}\);/)[0];
assert.ok(navigateBlock.indexOf('saveNoteBeforeNavigation()')<navigateBlock.indexOf('scheduleBackgroundPersist()'),
  'La note doit être sauvée avant la persistance de sortie de l’écran d’analyse');
const flushBlock=app.match(/async function flushPendingPersist\(\)\{([\s\S]*?)\n\}/)[0];
assert.ok(flushBlock.includes('saveNoteBeforeNavigation()'),'flushPendingPersist doit vider le brouillon de note avant toute sortie');
assert.ok(flushBlock.indexOf('saveNoteBeforeNavigation()')<flushBlock.indexOf('if(!persistTimer)return'),
  'Le brouillon de note doit être capturé avant le test du timer de persistance');

// A correctly solved position must be persisted/removed from the training queue.
assert.match(training,/session\.correct\+\+;markPositionSolved\?\.\(item\.key\)/,
  'Une position réussie doit être marquée comme maîtrisée');

// Promotion choices must not silently force the first legal promotion.
assert.match(training,/const promotionMoves=moves\.filter\(move=>move\.promotion\);[\s\S]*?globalThis\.prompt\?\.\(/,
  'L’entraînement doit demander la pièce en cas de promotion sans être masqué par le prompt DOM');

// Global training scan should not rerender the complete UI after every game.
const renderCalls=(controller.match(/state\.trainingPuzzles=\[\.\.\.found\];\s*render\(\);/g)||[]).length;
assert.equal(renderCalls,0,'Le scan ne doit plus reconstruire toute l’interface après chaque partie');
assert.match(controller,/i===games\.length-1|\(i\+1\)%\d+===0/,'Le scan doit utiliser un rendu final ou périodique borné');

// The ultra-fast parser must never accept a pseudo-legal move merely because it has one candidate.
const pinned=`[SetUp "1"]\n[FEN "4r3/8/8/8/8/8/4R3/4K3 w - - 0 1"]\n\n1. Rf2 *`;
const parsed=openingLineUltraFast(pinned,1);
assert.equal(parsed.out.length,0,'Un coup illégal d’une pièce clouée ne doit pas être injecté par le parseur rapide');

const ambiguous=`[SetUp "1"]\n[FEN "7k/8/8/8/8/2N1N3/8/4K3 w - - 0 1"]\n\n1. Nd5 *`;
const ambiguousParsed=openingLineUltraFast(ambiguous,1);
assert.equal(ambiguousParsed.out.length,0,'Une notation SAN ambiguë ne doit pas choisir arbitrairement une pièce dans le parseur rapide');

// Replace-restore must clear absent sync archives instead of keeping stale local state.
assert.match(app,/if\(mode===\"replace\"\)[\s\S]*?removeItem\(CHESS_SYNC_KEY\)/,
  'Une restauration « remplacer » doit supprimer l’historique de sync si la sauvegarde n’en contient pas');

console.log('GLOBAL REVIEW REGRESSION TESTS OK');
