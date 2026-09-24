# HighTaxi Chess PWA — v0.10.4

PWA personnelle iPhone pour importer, synchroniser, analyser et annoter les parties de HighTaxi.

## Plateforme et stockage

- Déploiement cible : **GitHub Pages** uniquement.
- Application statique : aucun backend nécessaire.
- Base locale : IndexedDB.
- Import/export : PGN côté navigateur.
- Synchronisation : API publique Chess.com depuis le navigateur.
- Service Worker et assets avec chemins relatifs, compatibles avec un dépôt GitHub Pages sous sous-chemin.
- Identité visuelle et thème sombre conservés.

## Architecture v0.10.4

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
│   ├── statistics.js
│   └── stockfish.js
├── persistence/
│   └── storage.js
├── sync/
│   └── chesscom.js
├── training/
│   ├── controller.js
│   ├── puzzles.js
│   └── session.js
└── ui/
    ├── arrows.js
    ├── board.js
    ├── moves.js
    ├── statistics.js
    └── training.js
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

Le contrôleur Stockfish déduplique les demandes, met en cache les résultats et rejette les résultats obsolètes lorsqu'une nouvelle position a été demandée. Il utilise actuellement **une seule variante principale (MultiPV 1)** pour limiter la charge sur iPhone.

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

`DATA_SCHEMA_VERSION` reste à **3**. La refactorisation v0.10 est additive et ne supprime pas les parties, annotations, arbres d'analyse ou sauvegardes existants.

## Héritage v0.9.35 et stabilisation v0.10

- Les tests historiques `test-v0916`, `test-v0917`, `test-v0922` et `test-v0925` sont renommés en tests courants afin de ne plus figer artificiellement une ancienne version.
- Le test d’import PGN utilise désormais le fixture `fixtures/ChessCom_hightaxi_202609.pgn` inclus dans l’archive.
- Le worker Stockfish intermédiaire `stockfish-worker.js` a été supprimé : l’application et le test navigateur utilisent directement `stockfish-18-lite-single.js` avec le WASM local.
- Les règles CSS `.moveArrows` redondantes ont été fusionnées en une seule définition.
- La version affichée dans les réglages et la documentation Stockfish sont alignées sur `0.10.4`.
- Les évaluations Stockfish sont normalisées pour conserver une perspective cohérente côté Blanc, y compris pour les positions où les Noirs jouent.
- Les évaluations et meilleurs coups périmés sont annulés lors des changements de position ou de la désactivation de Stockfish.
- Les modifications d’annotations déclenchent désormais la reconstruction nécessaire de l’arbre global pour actualiser les flèches.
- La visibilité du panneau de l’arbre global dépend uniquement de son état d’ouverture.
- Les mois Chess.com contenant des PGN invalides restent resynchronisables au lieu d’être marqués comme entièrement traités.

- Les annotations de coups sont résolues par **position FEN normalisée + coup**, indépendamment de la partie qui a produit la position. Une annotation saisie dans une partie est donc affichée sur toute autre partie qui atteint la même position et joue le même coup.
- Les annotations déjà présentes dans les arbres d’analyse sont réindexées au démarrage afin de rester partageables même si l’index global est absent ou incomplet.
- Des tests réels de syntaxe et de normalisation d’évaluation ont été ajoutés.


## Statistiques v0.10.2

La page Statistiques est orientée entraînement et repose sur la même base de parties, les mêmes positions FEN normalisées et le même système d’annotations que l’analyse. Elle propose :

- vue globale, Blancs et Noirs ;
- score, résultats, nombre de coups moyen et répartition des parties ;
- évolution mensuelle et cadence ;
- résultats des parties ayant atteint 5, 10 et 12 coups ;
- répartition des classifications annotées par phase (1–3, 4–6, 7–9, 10–12) ;
- ouvertures et variantes réellement jouées via les en-têtes Chess.com, avec score, profondeur de connaissance commune et taux de problèmes annotés ;
- positions à travailler et top 5 des priorités, agrégées par FEN pour regrouper les transpositions ;
- accès direct depuis une priorité ou une position vers la partie et la position concernée.

L’agrégation des positions reste limitée aux **24 premiers demi-coups** conformément à la limite volontaire de mémoire d’entraînement. Les catégories tactiques automatiques ne sont pas inventées à partir de données insuffisantes : elles restent dépendantes d’un futur signal moteur fiable.

## Entraînement v0.10.2

L’entraînement est désormais centré sur les **positions**, identifiées par FEN normalisée. Le moteur et les annotations alimentent une file unique : une même position n’est présentée qu’une fois, même lorsqu’elle apparaît dans plusieurs parties ou par transposition. L’agrégation d’entraînement reste limitée aux **24 premiers demi-coups (12 coups complets)**.

Le mode interactif propose des séries de 10 positions. Pour chaque position, HighTaxi doit jouer directement sur l’échiquier. Un coup Stockfish connu comme meilleur est accepté ; un bon coup déjà joué et annoté peut également servir de réponse de référence. Les coups connus comme erreurs ou gaffes sont refusés. Lorsqu’une position annotée ne possède pas encore de meilleur coup moteur enregistré, Stockfish est interrogé à la réponse et son meilleur coup est révélé après l’essai.

La session affiche la progression, le score, un retour immédiat, le meilleur coup de référence et permet de passer à la position suivante ou de recommencer. La rotation du plateau reste manuelle.

Le scan Stockfish reste manuel et interruptible. Il détecte les **gains manqués** et **gaffes**, conserve les puzzles localement et permet l’export `HighTaxi_Training_YYYY-MM-DD.pgn`. Les seuils de classification existants restent inchangés : **gain manqué** si le meilleur coup donne au moins +3,00 pour HighTaxi, que le coup joué perd au moins 1,50 et laisse plus de +1,00 ; **gaffe** si la perte est d’au moins 2,00 et que la position après le coup est à +1,00 ou moins pour HighTaxi.

## Tests

Les tests Node peuvent être exécutés individuellement :

```bash
node test-chess.mjs
node test-pgn.mjs
node test-position-aggregation.mjs
node test-statistics.mjs
node test-statistics-ui.mjs
node test-statistics-fixture.mjs
node test-global-annotation-propagation.mjs
node test-global-annotation-overrides.mjs
node test-arrows-model.mjs
node test-arrow-cache.mjs
node test-arrow-renderer.mjs
node test-stockfish-orchestration.mjs
node test-stockfish-runtime.mjs
node test-app-syntax.mjs
node test-dom-wiring.mjs
node test-training-puzzles.mjs
node test-training-session.mjs
node test-training-controller.mjs
node test-training-ui.mjs
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


## Stabilisation v0.10.1 → v0.10.2

- Les parties Chess.com utilisent désormais l’identifiant individuel de la partie quand le lien `Link` est disponible, y compris pour migrer les anciennes entrées qui ne conservaient que l’URL d’archive mensuelle.
- Un changement de compte Chess.com invalide l’analyse en cours, les arbres, caches et états dépendants, puis remet à zéro l’historique de synchronisation de l’ancien compte.
- Stockfish utilise une seule ligne principale (`MultiPV 1`), un cache plus large, 32 Mo de hash et un délai maximal par recherche ; un dépassement redémarre le worker afin d’éviter les résultats tardifs ambigus.
- Le Service Worker applique désormais une stratégie stale-while-revalidate pour servir immédiatement le cache tout en rafraîchissant les ressources en arrière-plan.
- Les statistiques de connaissance des ouvertures s’appuient sur les positions FEN normalisées plutôt que sur les séquences de coups brutes.
- Les restaurations de sauvegardes valident chaque PGN avant écriture et les annotations importées sont échappées avant rendu HTML.
- Les checkpoints 5/10/12 coups considèrent une partie arrivée au coup blanc correspondant comme ayant atteint ce checkpoint.

- Le mode d’entraînement par position regroupe les sources moteur et annotations par FEN normalisée et invalide son cache lorsqu’un scan modifie les puzzles.
- La classification d’un même coup conserve la catégorie la plus problématique lorsqu’elle est observée avec des annotations contradictoires dans plusieurs parties.
- L’export PGN d’entraînement est automatiquement activé dès qu’au moins un puzzle moteur est disponible.
