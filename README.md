# HighTaxi Chess PWA — v0.9.33

PWA personnelle iPhone pour importer, synchroniser, analyser et annoter les parties de HighTaxi.

## Plateforme et stockage

- Déploiement cible : **GitHub Pages** uniquement.
- Application statique : aucun backend nécessaire.
- Base locale : IndexedDB.
- Import/export : PGN côté navigateur.
- Synchronisation : API publique Chess.com depuis le navigateur.
- Service Worker et assets avec chemins relatifs, compatibles avec un dépôt GitHub Pages sous sous-chemin.
- Identité visuelle et thème sombre conservés.

## Architecture v0.9.33

Les responsabilités d'analyse sont séparées en modules ES :

```text
src/
├── app/
│   ├── lifecycle.js
│   ├── router.js
│   └── state.js
├── chess/
│   ├── navigation.js
│   └── position.js
├── games/
│   └── tree.js
├── analysis/
│   ├── arrows.js
│   ├── cache.js
│   ├── classification.js
│   ├── evaluation.js
│   └── stockfish.js
├── persistence/
│   └── storage.js
├── sync/
│   └── chesscom.js
└── ui/
    ├── arrows.js
    ├── board.js
    └── moves.js
```

`app.js` reste la couche de composition : il relie l'interface, la base locale, l'arbre, Stockfish, les flèches et la navigation.

## Flèches d'analyse

Depuis une position normalisée par FEN, l'application agrège les coups déjà présents dans la base.

Classification visuelle :

- **rouge** : gaffe ;
- **orange** : erreur ;
- **vert clair** : bon coup ;
- **vert foncé** : excellent coup ;
- **turquoise** : coup brillant ;
- **bleu foncé à faible opacité** : meilleur coup Stockfish.

Si le meilleur coup Stockfish existe déjà dans la base, les deux sources sont fusionnées dans une seule flèche avec `engineBest: true`.

Les flèches sont rendues dans une couche SVG indépendante de l'échiquier. Leur mise à jour ne reconstruit pas les 64 cases. Elles respectent l'orientation manuelle de l'échiquier et sont cliquables sur iPhone.

## Navigation

Les actions suivantes passent par le même pipeline de navigation :

- clic sur un coup de la table ;
- précédent / suivant ;
- clic sur une flèche ;
- déplacement légal sur l'échiquier.

La rotation du plateau reste **manuelle** : jouer un coup ne retourne pas automatiquement l'échiquier.

## Stockfish 18

Le moteur local utilisé par l'application est :

```text
stockfish-18-lite-single.js
stockfish-18-lite-single.wasm
```

Il est exécuté dans un Web Worker et ne bloque pas le thread principal.

Le contrôleur Stockfish déduplique les demandes, met en cache les résultats et rejette les résultats obsolètes lorsqu'une nouvelle position a été demandée.

Les fichiers binaires locaux sont conservés dans le dépôt pour garantir le fonctionnement GitHub Pages sans backend.

## Synchronisation Chess.com

La synchronisation :

1. récupère les archives mensuelles du compte configuré ;
2. télécharge le PGN de chaque archive ;
3. valide les PGN localement ;
4. ignore les variantes non standard ;
5. utilise des identifiants stables pour éviter les doublons ;
6. stocke les parties dans IndexedDB.

Les requêtes réseau utilisent `cache: no-store`. Le Service Worker ne met pas en cache les routes `/api/...`.

## Compatibilité des données

`DATA_SCHEMA_VERSION` reste à **3**. La refactorisation v0.9.33 est additive et ne supprime pas les parties, annotations, arbres d'analyse ou sauvegardes existants.

## Nettoyage v0.9.33

- Les tests historiques `test-v0916`, `test-v0917`, `test-v0922` et `test-v0925` sont renommés en tests courants afin de ne plus figer artificiellement une ancienne version.
- Le test d’import PGN utilise désormais le fixture `fixtures/ChessCom_hightaxi_202609.pgn` inclus dans l’archive.
- Le worker Stockfish intermédiaire `stockfish-worker.js` a été supprimé : l’application et le test navigateur utilisent directement `stockfish-18-lite-single.js` avec le WASM local.
- Les règles CSS `.moveArrows` redondantes ont été fusionnées en une seule définition.
- La version affichée dans les réglages et la documentation Stockfish sont alignées sur `0.9.33`.
- Les évaluations Stockfish sont normalisées pour conserver une perspective cohérente côté Blanc, y compris pour les positions où les Noirs jouent.
- Les évaluations et meilleurs coups périmés sont annulés lors des changements de position ou de la désactivation de Stockfish.
- Les modifications d’annotations déclenchent désormais la reconstruction nécessaire de l’arbre global pour actualiser les flèches.
- La visibilité du panneau de l’arbre global dépend uniquement de son état d’ouverture.
- Les mois Chess.com contenant des PGN invalides restent resynchronisables au lieu d’être marqués comme entièrement traités.
- Des tests réels de syntaxe et de normalisation d’évaluation ont été ajoutés.

## Entraînement

La section Entraînement peut analyser manuellement les parties de HighTaxi avec Stockfish, détecter une première catégorie de **gain manqué** et **gaffe**, conserver les puzzles localement et exporter `HighTaxi_Training_YYYY-MM-DD.pgn`. Le scan est volontairement manuel et interruptible, et suspend l’analyse automatique du plateau pour éviter les collisions avec le moteur.

Règles initiales de classification : **gain manqué** si le meilleur coup donne au moins +3,00 pour HighTaxi, que le coup joué perd au moins 1,50 et laisse plus de +1,00 ; **gaffe** si la perte est d’au moins 2,00 et que la position après le coup est à +1,00 ou moins pour HighTaxi. Ces seuils sont des paramètres de cette première ébauche et pourront être affinés.

## Tests

Les tests Node peuvent être exécutés individuellement :

```bash
node test-chess.mjs
node test-pgn.mjs
node test-position-aggregation.mjs
node test-arrows-model.mjs
node test-arrow-cache.mjs
node test-arrow-renderer.mjs
node test-stockfish-orchestration.mjs
node test-stockfish-runtime.mjs
node test-app-syntax.mjs
node test-dom-wiring.mjs
node test-training-puzzles.mjs
node test-evaluation.mjs
node test-navigation.mjs
node test-board-integration.mjs
node test-persistence-regression.mjs
node test-sync-regression.mjs
node test-github-pages.mjs
node test-current-ui.mjs
node test-current-analysis.mjs
node test-current-robustness.mjs
node test-current-global-tree.mjs
node test-import-regression.mjs
```

Suite complète :

```bash
for f in test-*.mjs; do node "$f" || exit 1; done
```

Le test `test-dom-wiring.mjs` couvre le contrat DOM/HTML/CSS/Service Worker sans dépendance externe. Les vérifications browser nécessitent toujours un navigateur réel pour valider le chargement PWA, les assets, le Web Worker Stockfish et les interactions tactiles.
