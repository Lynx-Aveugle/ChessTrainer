# HighTaxi Chess — Flèches, analyse et refonte d’architecture

**Date :** 2026-09-22  
**Base de travail :** HighTaxiChess v0.9.28  
**Plateforme cible :** PWA mobile iPhone, GitHub Pages, fonctionnement côté navigateur.

## 1. Objectif

Faire évoluer HighTaxi Chess d’une application fonctionnelle mais fortement centralisée autour de `app.js` vers une architecture modulaire capable de supporter de manière fiable et rapide :

- les flèches de coups issus de toutes les parties de la base ;
- la flèche Stockfish du meilleur coup ;
- les classifications de coups et leur agrégation ;
- les transpositions et l’identification stable des positions par FEN ;
- la navigation dans l’arbre des coups ;
- l’analyse Stockfish ;
- les annotations ;
- la synchronisation Chess.com ;
- la persistance IndexedDB ;
- les statistiques et jauges ;
- le rendu fluide sur iPhone.

L’objectif n’est pas de réécrire l’application sans nécessité. La migration doit préserver les comportements actuellement fonctionnels et isoler progressivement les responsabilités qui sont aujourd’hui mélangées.

## 2. État de départ constaté

La version v0.9.28 contient notamment `app.js`, `chess.js`, `pgn.js`, `db.js`, `stockfish-worker.js`, les fichiers Stockfish 18 lite single-thread, le Service Worker et une suite de tests Node.

`app.js` concentre actuellement l’état global, la navigation, le rendu du plateau, l’arbre global, les annotations, le moteur Stockfish, la synchronisation Chess.com, la persistance et plusieurs écrans. Le fichier fait environ 74 Ko.

Le système actuel de flèches reconstruit un SVG depuis l’arbre global dans `renderGlobalArrows()`. Les flèches ne sont pas interactives (`pointer-events:none`) et ne portent pas encore le modèle complet demandé pour les classifications et le meilleur coup Stockfish.

La construction de l’arbre global est déjà traitée par lots, mais elle reste couplée au rendu et invalide des données plus largement que nécessaire dans certains flux, notamment lors des changements d’annotations.

## 3. Fonctionnement cible des flèches

Pour une position donnée, identifiée par une clé FEN normalisée :

1. récupérer les coups effectivement présents dans les parties de la base qui passent par cette position ;
2. agréger les occurrences par mouvement légal `(from, to, promotion)` ;
3. agréger les annotations des parties ayant joué chaque mouvement ;
4. déterminer la classification visuelle du mouvement ;
5. récupérer le meilleur coup Stockfish de la position ;
6. construire un modèle immuable de flèches ;
7. rendre ce modèle dans un calque SVG indépendant du rendu des cases.

### Palette

| Type | Couleur | Usage |
|---|---|---|
| Stockfish | bleu foncé, faible opacité | meilleur coup recommandé par le moteur |
| Gaffe | rouge | coup classé gaffe |
| Erreur | orange | coup classé erreur |
| Bon | vert clair | bon coup |
| Excellent | vert foncé | excellent coup |
| Brillant | turquoise | coup brillant |

Si plusieurs classifications existent pour un même mouvement, la règle d’agrégation doit être déterministe et documentée. La priorité visuelle doit représenter la classification la plus forte disponible selon l’ordre défini par le modèle de classification, sans compter plusieurs fois une même annotation dans une même partie.

### Flèche Stockfish

La flèche Stockfish est indépendante des coups déjà présents dans la base. Si le meilleur coup Stockfish correspond à un coup déjà joué, les deux informations doivent être fusionnées dans un seul objet de mouvement tout en conservant l’indicateur `engineBest=true`.

## 4. Modèle de données cible

Les flèches doivent être produites sous une forme similaire à :

```js
{
  from: "e2",
  to: "e4",
  promotion: null,
  san: "e4",
  count: 12,
  userCount: 8,
  resultStats: { white: 7, draw: 2, black: 3 },
  annotations: { brilliant: 1, excellent: 5, good: 4, error: 1, blunder: 1 },
  classification: "excellent",
  engineBest: false,
  source: "database"
}
```

La clé d’agrégation doit être indépendante du SAN afin d’éviter les ambiguïtés liées à la notation.

Les positions doivent utiliser `positionKeyFromFen()` ou son équivalent modulaire comme clé canonique, notamment pour gérer correctement les droits de roque et la prise en passant pertinente.

## 5. Architecture cible

```text
src/
├── app/
│   ├── state.js
│   ├── router.js
│   └── lifecycle.js
├── chess/
│   ├── position.js
│   ├── navigation.js
│   └── pgn.js
├── games/
│   ├── store.js
│   ├── tree.js
│   └── repertoire.js
├── analysis/
│   ├── stockfish.js
│   ├── cache.js
│   ├── classification.js
│   └── arrows.js
├── ui/
│   ├── board.js
│   ├── arrows.js
│   ├── moves.js
│   ├── analysis.js
│   └── statistics.js
├── persistence/
│   └── storage.js
└── sync/
    └── chesscom.js
```

Le découpage exact peut être adapté à la structure existante pendant l’implémentation, mais chaque module doit avoir une responsabilité principale et des interfaces explicites.

## 6. Rendu du plateau et des flèches

Le rendu des cases et le rendu des flèches doivent être découplés.

```text
BoardRenderer
 └── cases + pièces + sélection + coups légaux

ArrowRenderer
 └── SVG des flèches
```

Une modification des flèches ne doit pas reconstruire les 64 cases.

Le renderer des flèches doit :

- utiliser un seul SVG par position affichée ;
- réutiliser les éléments lorsque cela apporte un gain mesurable ;
- supprimer proprement l’ancien calque ;
- utiliser des `pointer-events` seulement sur les éléments interactifs nécessaires ;
- associer chaque flèche à son mouvement via `data-from`, `data-to` et `data-promotion` ou une clé équivalente ;
- respecter l’orientation actuelle du plateau ;
- rester correctement superposé aux cases sur les différentes tailles d’écran iPhone.

Les labels textuels dans les flèches ne doivent pas être conservés s’ils dégradent la lisibilité ou les performances sur petit écran. Les statistiques détaillées doivent rester dans le panneau d’analyse.

## 7. Performance

### Cache des flèches

Les flèches doivent être mises en cache par une clé comprenant au minimum :

- position FEN canonique ;
- révision de la base de parties ;
- filtre Blanc/Noir/Toutes ;
- révision pertinente des annotations ;
- état du moteur pour le meilleur coup si nécessaire.

Une position déjà calculée ne doit pas reconstruire l’arbre global complet.

### Stockfish

Le moteur doit rester dans son Worker actuel et être encapsulé derrière une interface d’analyse.

Le contrôleur Stockfish doit :

- dédupliquer les demandes identiques ;
- mettre en cache les résultats ;
- ignorer ou annuler les résultats devenus obsolètes ;
- ne pas bloquer le thread principal ;
- conserver le fonctionnement local v0.9.28 ;
- gérer proprement l’indisponibilité du moteur.

Un changement rapide de position doit empêcher un ancien `bestmove` de remplacer le résultat de la position courante.

## 8. Arbre global

L’arbre global doit devenir une structure de données indépendante du DOM.

La construction doit produire un résultat exploitable par plusieurs consommateurs :

- arbre des coups ;
- statistiques ;
- flèches ;
- jauges ;
- analyse de répertoire.

Le rendu ne doit jamais être responsable de construire ou modifier les données métier.

Les annotations ne doivent pas déclencher une reconstruction complète si une invalidation locale ou une révision séparée suffit.

## 9. Navigation

Les fonctions de navigation (`gotoNode`, précédent, suivant, clic sur un coup, clic sur une flèche) doivent converger vers une seule opération de changement de position.

Cette opération doit :

1. sauvegarder le brouillon de note si nécessaire ;
2. modifier `currentNode` ;
3. reconstruire l’état Chess depuis le FEN du nœud ;
4. mettre à jour `lastMove` et la sélection ;
5. demander le rendu minimal nécessaire ;
6. lancer ou récupérer l’analyse moteur ;
7. actualiser les flèches ;
8. actualiser les panneaux dépendants.

Cela doit supprimer les divergences actuelles entre les différents chemins de navigation.

## 10. Bugs et robustesse inclus dans le périmètre

Les corrections générales sont limitées aux problèmes ayant un lien fonctionnel ou architectural avec le chantier :

- navigation sur les coups ;
- transpositions/FEN ;
- roque ;
- promotion ;
- prise en passant ;
- SAN/PGN ;
- Stockfish ;
- flèches ;
- annotations ;
- arbre global ;
- statistiques et jauges ;
- persistance ;
- synchronisation Chess.com ;
- Service Worker et cache d’assets ;
- rendu des pièces ;
- listeners dupliqués ;
- changements d’onglets ;
- performance de rendu.

Les défauts indépendants de ces composants seront seulement signalés, sauf s’ils bloquent l’objectif.

## 11. Tests

Les tests doivent couvrir au minimum :

1. normalisation des FEN ;
2. agrégation d’un même mouvement joué dans plusieurs parties ;
3. absence de double comptage des annotations d’une partie ;
4. priorité de classification ;
5. fusion Stockfish + coup existant ;
6. génération des flèches depuis une position ;
7. transposition ;
8. clic/navigation vers le coup d’une flèche ;
9. invalidation du cache après modification de la base ;
10. invalidation du cache après modification d’annotation ;
11. changement rapide de position pendant une analyse Stockfish ;
12. fonctionnement sans Stockfish ;
13. navigation dans l’arbre ;
14. jauges ;
15. import/export PGN ;
16. persistance ;
17. synchronisation Chess.com.

Les tests de version historiques doivent être adaptés à la version courante plutôt que laisser un test ancien imposer artificiellement `0.9.25`.

## 12. Compatibilité

La migration doit conserver :

- IndexedDB et les données existantes ;
- le schéma de données compatible avec la v0.9.28 ;
- les annotations déjà enregistrées ;
- les parties Chess.com existantes ;
- l’import/export PGN ;
- le fonctionnement GitHub Pages ;
- le Worker Stockfish 18 local ;
- la PWA iPhone.

Aucune migration destructive ne doit être introduite sans mécanisme de compatibilité ou sauvegarde.

## 13. Critères d’acceptation

Le chantier sera considéré techniquement terminé lorsque :

- les flèches de la base utilisent la palette définie ;
- la flèche Stockfish est affichée séparément ou fusionnée proprement avec le même coup ;
- les flèches respectent la position et l’orientation du plateau ;
- les flèches sont interactives lorsque cela est prévu ;
- un clic sur un coup dans le tableau ou sur une flèche navigue vers la même position ;
- les transpositions ne génèrent pas de doublons incorrects ;
- revenir sur une position déjà calculée utilise les caches appropriés ;
- Stockfish ne peut pas injecter un résultat obsolète ;
- le changement d’onglet et de position n’entraîne pas de recalcul global inutile ;
- les tests ciblés et la suite complète disponible sont exécutés ;
- aucune régression connue de v0.9.28 n’est introduite ;
- le code n’est plus organisé autour d’un unique `app.js` monolithique pour les responsabilités nouvellement séparées.

## 14. Hors périmètre

- publication App Store ;
- backend serveur ;
- changement de plateforme hors PWA iPhone ;
- nouveau système de compte utilisateur ;
- fonctionnalités sociales ;
- refonte graphique complète sans rapport avec les flèches ;
- modification du fonctionnement de Chess.com au-delà de la robustesse nécessaire à l’application.
