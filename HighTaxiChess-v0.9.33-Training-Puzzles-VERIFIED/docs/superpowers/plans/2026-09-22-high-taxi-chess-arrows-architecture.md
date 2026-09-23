# HighTaxi Chess Arrows & Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the v0.9.28 HighTaxi Chess PWA from a monolithic `app.js` into focused modules while making database arrows, Stockfish arrows, classifications, navigation, transpositions, caching, and existing game-analysis behavior reliable and fast on iPhone.

**Architecture:** Extract pure chess/position logic, global-tree aggregation, classification, arrow generation, Stockfish orchestration, navigation, persistence, and UI rendering behind small interfaces. Keep the existing IndexedDB schema, PGN format, local Stockfish 18 worker, GitHub Pages deployment, PWA shell, and visual identity unchanged. The board renderer owns squares/pieces; an independent SVG arrow layer owns arrows and can update without rebuilding 64 squares.

**Tech Stack:** Vanilla ES modules, existing `chess.js`, IndexedDB through existing `db.js`, PGN parser through existing `pgn.js`, local Stockfish 18 WASM + Web Worker, browser DOM/SVG, Node.js `.mjs` regression tests.

**Spec:** `docs/superpowers/specs/2026-09-22-high-taxi-chess-arrows-architecture-design.md`

## Global Constraints

- Preserve the existing IndexedDB database, schema version, stored games, annotations, and PGN compatibility; migrations must be additive/non-destructive.
- Preserve local Stockfish 18 browser execution and GitHub Pages compatibility; do not introduce a backend.
- Preserve the iPhone-only PWA scope and current dark visual identity.
- Database arrows must use normalized FEN positions and aggregate moves already played in the database from the current position.
- Required arrow palette: Stockfish dark blue/low opacity; blunder red; error orange; good light green; excellent dark green; brilliant turquoise.
- If Stockfish's best move already exists in the database move set, merge it into one arrow while retaining `engineBest: true`.
- Arrow rendering must be independent from the 64-square board rendering and must respect board orientation.
- A move-table click, previous/next navigation, legal move, and arrow click must use one position-navigation path.
- Stockfish results that no longer correspond to the current position must never overwrite current analysis.
- No feature is considered complete until its focused tests and affected regression suite pass on the final code.

## Review Focus

1. **Transpositions:** the same chess position reached through different move orders must aggregate into one position key without incorrectly merging illegal en-passant states; test canonical FEN normalization.
2. **Promotion/castling/en-passant:** arrow generation and navigation must preserve move identity and legal move semantics for special moves; test promotion and castling explicitly and keep existing chess regression coverage.
3. **Stale engine responses:** a slow Stockfish result for position A must not paint position B; test request tokens and cached responses.
4. **Annotation aggregation:** multiple games containing the same move must count each game's occurrence once, and annotation revisions must invalidate only affected derived arrow/tree data; test duplicate annotation inputs and cache revision behavior.
5. **Mobile rendering:** arrow updates must not rebuild the board squares/pieces; test renderer call boundaries and run the existing performance/browser smoke checks.

---

## Task 1: Establish Modular ES-Module Boundaries and Test Harness

**Files:**
- Create: `src/app/state.js`
- Create: `src/chess/position.js`
- Create: `src/chess/navigation.js`
- Create: `src/games/tree.js`
- Create: `src/analysis/classification.js`
- Create: `src/analysis/arrows.js`
- Create: `src/analysis/stockfish.js`
- Create: `src/ui/arrows.js`
- Create: `src/ui/board.js`
- Create: `src/ui/moves.js`
- Modify: `index.html`
- Modify: `app.js`
- Test: `test-architecture-modules.mjs`

**Interfaces:**
- `position.js` produces `positionKeyFromFen(fen)`, `normalizeMove(move)`, and `sameMove(a,b)` for all later chess/analysis modules.
- `classification.js` produces `classifyAnnotations(annotations)` and `mergeAnnotationCounts(target, annotations)`.
- `arrows.js` consumes canonical position keys, global-tree edges, annotation classification, and optional engine-best data; it produces immutable arrow descriptors.
- `ui/arrows.js` consumes arrow descriptors and board geometry; it produces/updates one SVG arrow layer without owning board squares.
- `state.js` owns shared application state and revision counters; later modules consume state through explicit imports rather than undeclared globals.

- [ ] **Step 1: Write the failing module-boundary test.** Assert that the new modules exist, export the named interfaces, and do not import the legacy monolithic UI module as their source of truth.
- [ ] **Step 2: Run the test and verify it fails because the modules/exports do not yet exist.**
  - Run: `node test-architecture-modules.mjs`
  - Expected: FAIL with missing module/export assertions.
- [ ] **Step 3: Create the minimal modules and exports.** Move only pure helpers first; keep behavior identical to v0.9.28. `position.js` must preserve the existing en-passant-aware `positionKeyFromFen()` semantics. `classification.js` must use the current annotation definitions rather than inventing a second vocabulary.
- [ ] **Step 4: Add explicit state ownership.** Export a state object/revision structure containing games, active game, current node, tree revisions, annotation revision, and engine state. Do not duplicate mutable state between old and new modules.
- [ ] **Step 5: Point `index.html` at the new module entry path while retaining a compatibility bootstrap during the migration.** The app must still load from GitHub Pages paths without absolute-root assumptions.
- [ ] **Step 6: Run the module test and existing smoke/chess tests.**
  - Run: `node test-architecture-modules.mjs && node test-chess.mjs && node test-smoke.mjs`
  - Expected: PASS; no change in existing chess behavior.
- [ ] **Step 7: Commit the boundary/scaffolding changes.**
  - Commit message: `refactor: establish analysis module boundaries`

---

## Task 2: Extract Position, Tree Aggregation, and Classification as Pure Logic

**Files:**
- Modify: `src/chess/position.js`
- Modify: `src/games/tree.js`
- Modify: `src/analysis/classification.js`
- Modify: `app.js`
- Test: `test-position-aggregation.mjs`
- Test: `test-annotation-aggregation.mjs`
- Test: `test-chess.mjs`

**Interfaces:**
- `buildGlobalTree(games, {maxPlies, sideFilter, user})` returns a DOM-independent tree with `nodes`, `edges`, `revision`, and per-edge aggregate statistics.
- Each edge has at minimum `{from,to,promotion,san,count,userCount,resultStats,annotations,classification,playedByUser}`.
- `classifyAnnotations()` returns one canonical classification according to fixed priority: `blunder > error > brilliant > excellent > good > theoretical > neutral` when several annotations are aggregated for the same move.
- `positionKeyFromFen()` returns the same canonical key for equivalent positions while retaining an en-passant square only when a legal en-passant capture exists.

- [ ] **Step 1: Add failing tests for canonical FEN, transpositions, move aggregation, classification priority, and no double-counting.** Include a transposition example where two games reach the same position by different move orders; include duplicate annotation icons within one move and assert they do not double-count the same annotation occurrence.
- [ ] **Step 2: Run the focused tests and verify the new pure interfaces fail before extraction is complete.**
  - Run: `node test-position-aggregation.mjs && node test-annotation-aggregation.mjs`
  - Expected: FAIL on the new exported tree/position/classification interfaces.
- [ ] **Step 3: Move `positionKeyFromFen`, move normalization, and move identity into `src/chess/position.js`.** Keep promotion and en-passant information in move identity so two otherwise identical moves cannot collide incorrectly.
- [ ] **Step 4: Move `buildGlobalTree` aggregation into `src/games/tree.js`.** Remove all DOM calls from this module. Build node/edge aggregates in memory, preserving the current 24-ply cap and batch-friendly data shape initially; rendering/progress callbacks become optional injected callbacks.
- [ ] **Step 5: Move annotation aggregation/classification into `src/analysis/classification.js`.** Classification must be derived from counts without mutating source annotation arrays.
- [ ] **Step 6: Adapt `app.js` to consume the new tree builder and pure helpers without changing UI output yet.**
- [ ] **Step 7: Run focused and legacy suites.**
  - Run: `node test-position-aggregation.mjs && node test-annotation-aggregation.mjs && node test-chess.mjs && node test-critical.mjs && node test-move-gauge.mjs`
  - Expected: PASS.
- [ ] **Step 8: Commit.**
  - Commit message: `refactor: extract position tree and classification logic`

---

## Task 3: Implement the Canonical Arrow Model and Cache

**Files:**
- Create: `src/analysis/cache.js`
- Modify: `src/analysis/arrows.js`
- Modify: `src/games/tree.js`
- Modify: `src/app/state.js`
- Test: `test-arrows-model.mjs`
- Test: `test-arrow-cache.mjs`

**Interfaces:**
- `buildArrowDescriptors(positionKey, tree, {sideFilter,user,engineBest})` returns an array of immutable descriptors with `from`, `to`, `promotion`, `san`, `count`, `userCount`, `resultStats`, `annotations`, `classification`, `engineBest`, and `source`.
- `getArrowCacheKey({positionKey,dataRevision,sideFilter,annotationRevision,engineRevision})` returns a deterministic string.
- `getCachedArrows(key)` / `setCachedArrows(key, arrows)` provide bounded in-memory derived-data caching.

- [ ] **Step 1: Write failing tests for the required arrow descriptor fields, classification palette mapping, move aggregation, engine/database merge, and cache invalidation dimensions.** Assert that the engine-best database move is one descriptor with `engineBest: true`, not two overlapping arrows.
- [ ] **Step 2: Run focused tests and verify failure.**
  - Run: `node test-arrows-model.mjs && node test-arrow-cache.mjs`
  - Expected: FAIL because the canonical arrow model/cache is not implemented.
- [ ] **Step 3: Implement `buildArrowDescriptors`.** Aggregate all database edges for the current canonical position, filter according to the current analysis scope, derive the highest-priority classification, and mark `source: 
database` unless only engine supplied.
- [ ] **Step 4: Implement cache keys using canonical FEN, database revision, side filter, annotation revision, and engine revision.** Never cache arrows only by FEN because annotations and engine state can change independently.
- [ ] **Step 5: Cap the cache and return frozen/copy-safe descriptors so UI code cannot mutate derived tree data.**
- [ ] **Step 6: Run focused tests.**
  - Run: `node test-arrows-model.mjs && node test-arrow-cache.mjs`
  - Expected: PASS.
- [ ] **Step 7: Run aggregation regressions.**
  - Run: `node test-annotation-aggregation.mjs && node test-move-gauge.mjs`
  - Expected: PASS.
- [ ] **Step 8: Commit.**
  - Commit message: `feat: add canonical arrow model and cache`

---

## Task 4: Extract Stockfish Worker Orchestration and Protect Against Stale Results

**Files:**
- Modify: `src/analysis/stockfish.js`
- Modify: `app.js`
- Modify: `stockfish-worker.js` only if worker protocol needs a compatibility fix
- Test: `test-stockfish-orchestration.mjs`
- Test: `test-stockfish-runtime.mjs`
- Test: `test-stockfish.mjs`

**Interfaces:**
- `createStockfishController({workerFactory,timeoutMs})` returns `{ensureReady, analyze, cancel, clearCache, dispose}`.
- `analyze(fen)` resolves to `{bestMove, evaluation, depth}` or a normalized unavailable/error result.
- Every request carries a monotonically increasing token; a result is applied only if its token and FEN still match the current request.

- [ ] **Step 1: Add failing tests for request deduplication, stale-result rejection, cache hits, disabled-engine behavior, and worker-unavailable behavior.** Use a fake worker in unit tests so they do not depend on WASM startup timing.
- [ ] **Step 2: Run the focused tests and verify failure.**
  - Run: `node test-stockfish-orchestration.mjs`
  - Expected: FAIL because the controller interface does not yet exist.
- [ ] **Step 3: Extract the existing Worker lifecycle from `app.js` into `src/analysis/stockfish.js`.** Preserve the existing local filenames and UCI protocol. Keep `ensureEngine`, `startEngineSearch`, `scheduleEngineAnalysis`, and `handleEngineLine` behavior equivalent through the new controller.
- [ ] **Step 4: Add request tokens and FEN guards.** When position changes, invalidate the previous pending application even if the worker itself cannot be interrupted immediately.
- [ ] **Step 5: Add a small result cache keyed by normalized FEN plus engine configuration.** Do not return cached engine results if the requested engine configuration differs.
- [ ] **Step 6: Wire `app.js` to the controller and preserve `autoEngine`/retry/unavailable UI.**
- [ ] **Step 7: Run orchestration and runtime tests.**
  - Run: `node test-stockfish-orchestration.mjs && node test-stockfish.mjs && node test-stockfish-runtime.mjs`
  - Expected: PASS.
- [ ] **Step 8: Commit.**
  - Commit message: `refactor: isolate Stockfish controller`

---

## Task 5: Build the Independent SVG Arrow Renderer

**Files:**
- Modify: `src/ui/arrows.js`
- Modify: `src/ui/board.js`
- Modify: `styles.css`
- Modify: `app.js`
- Test: `test-arrow-renderer.mjs`
- Test: `test-analysis-ui.mjs`
- Test: `test-performance.mjs`

**Interfaces:**
- `createArrowRenderer(container)` returns `{render(arrows, geometry), clear(), destroy()}`.
- `geometry` describes orientation and square size; the renderer maps algebraic coordinates to screen coordinates without depending on board DOM internals.
- Each interactive arrow exposes `data-from`, `data-to`, and `data-promotion` and invokes an injected `onArrowMove(move)` callback.

- [ ] **Step 1: Write failing renderer tests.** Verify one SVG layer is created, the five database classifications map to red/orange/light-green/dark-green/turquoise, engine-best arrows use dark blue/low opacity, orientation changes reverse coordinates correctly, and clicking an arrow emits the normalized move.
- [ ] **Step 2: Add a regression test proving arrow updates do not call the board square rebuild.** Spy on the board renderer and update arrows twice; assert the 64-square render function is not invoked by the arrow-only update.
- [ ] **Step 3: Run focused tests and verify failure.**
  - Run: `node test-arrow-renderer.mjs && node test-analysis-ui.mjs`
  - Expected: FAIL until the renderer is connected.
- [ ] **Step 4: Implement one persistent SVG overlay.** Use marker definitions once per renderer instance, then replace only arrow groups on updates. Do not rebuild board HTML from `renderArrows`.
- [ ] **Step 5: Implement arrow geometry for normal and manually rotated board orientations.** The renderer must not change orientation itself.
- [ ] **Step 6: Implement arrow hit targets large enough for iPhone touch without visually enlarging the arrow.** The click handler must route through the unified navigation API introduced in Task 6.
- [ ] **Step 7: Update CSS for the required palette, opacity, z-index, pointer behavior, and dark-board contrast.** Avoid color-only information: classification metadata/accessible labels must remain available to assistive technologies.
- [ ] **Step 8: Run UI/performance tests.**
  - Run: `node test-arrow-renderer.mjs && node test-analysis-ui.mjs && node test-performance.mjs`
  - Expected: PASS.
- [ ] **Step 9: Commit.**
  - Commit message: `feat: add independent interactive analysis arrows`

---

## Task 6: Unify Position Navigation and Move-Table/Arrow Click Behavior

**Files:**
- Modify: `src/chess/navigation.js`
- Modify: `src/ui/moves.js`
- Modify: `src/ui/arrows.js`
- Modify: `app.js`
- Test: `test-navigation.mjs`
- Test: `test-analysis-ui.mjs`
- Test: `test-v0922.mjs`

**Interfaces:**
- `navigateToNode(nodeId)` is the single node-based navigation entry point.
- `navigateByMove(move)` resolves the move from the current position and navigates to the matching child node.
- `navigatePrevious()` and `navigateNext()` delegate to the same position-change pipeline.
- The position-change pipeline performs: persist pending note → set current node → rebuild `Chess` from node FEN → update selection/last move → render board layer → render arrow layer → schedule Stockfish.

- [ ] **Step 1: Write failing tests for move-table navigation, previous/next, arrow navigation, invalid move rejection, and position preservation after transposition.**
- [ ] **Step 2: Run focused tests and verify failure against current duplicated navigation paths.**
  - Run: `node test-navigation.mjs`
  - Expected: FAIL for at least one arrow/move-table integration path currently bypassing a shared navigator.
- [ ] **Step 3: Implement `navigateToNode`, `navigateByMove`, `navigatePrevious`, and `navigateNext` in `src/chess/navigation.js`.** Keep note persistence and engine scheduling in the one position-change function.
- [ ] **Step 4: Replace `gotoNode`, `gotoPositionKey`, previous/next button handlers, move-table button handlers, and arrow click handlers with adapters to the unified navigator.** Remove duplicated `new Chess(n.fen)`/`renderBoard()` sequences from callers.
- [ ] **Step 5: Ensure clicking a move-table entry visibly updates both board position and selected move state.** Preserve the current node tree identity; do not reconstruct the whole game tree.
- [ ] **Step 6: Run navigation and UI regressions.**
  - Run: `node test-navigation.mjs && node test-analysis-ui.mjs && node test-v0922.mjs`
  - Expected: PASS.
- [ ] **Step 7: Commit.**
  - Commit message: `fix: unify analysis position navigation`

---

## Task 7: Decouple Board Rendering, Integrate Arrows + Stockfish, and Preserve Performance

**Files:**
- Modify: `src/ui/board.js`
- Modify: `src/ui/arrows.js`
- Modify: `src/ui/moves.js`
- Modify: `app.js`
- Modify: `styles.css`
- Test: `test-board-integration.mjs`
- Test: `test-performance.mjs`
- Test: `test-move-gauge.mjs`
- Test: `test-review-fixes.mjs`

**Interfaces:**
- `renderBoard(state)` renders only board squares, pieces, selection, legal moves, coordinates, and the persistent arrow-layer mount point.
- `renderArrowsForPosition(positionKey)` obtains descriptors from the arrow model, adds/merges Stockfish best-move data, and updates only the arrow layer.
- `renderMoves()` remains responsible for move table and win/draw/loss gauge output, consuming tree statistics rather than rebuilding the global tree.

- [ ] **Step 1: Add a failing integration test that changes the position twice and asserts arrow rendering occurs independently from square/piece rendering.**
- [ ] **Step 2: Add a regression assertion that the move gauge still renders percentages after global-tree refresh and position changes.**
- [ ] **Step 3: Run the integration tests and verify failure.**
  - Run: `node test-board-integration.mjs && node test-move-gauge.mjs`
  - Expected: FAIL until the two render paths are separated.
- [ ] **Step 4: Refactor `renderBoard()` into a stable board container plus independent arrow overlay.** Do not alter board orientation automatically when moves are played; the existing manual rotation state remains authoritative.
- [ ] **Step 5: Wire database arrow generation to the current canonical FEN and analysis side filter.** Limit displayed arrows to the configured practical maximum while retaining counts/stats for all edges in data.
- [ ] **Step 6: Merge Stockfish best move into the arrow descriptors.** If it matches a database edge, set `engineBest: true` on that descriptor; otherwise append a dedicated engine descriptor with `source: "engine"` and zero database counts.
- [ ] **Step 7: Keep global-tree construction DOM-independent and throttle rendering progress.** The UI may show progress, but the tree builder must not call `renderBoard()` repeatedly.
- [ ] **Step 8: Run performance and regression suites.**
  - Run: `node test-board-integration.mjs && node test-performance.mjs && node test-move-gauge.mjs && node test-review-fixes.mjs`
  - Expected: PASS.
- [ ] **Step 9: Commit.**
  - Commit message: `perf: decouple board rendering from analysis arrows`

---

## Task 8: Extract Persistence, Sync, and Application Lifecycle Without Regressions

**Files:**
- Create: `src/persistence/storage.js`
- Create: `src/sync/chesscom.js`
- Create: `src/app/router.js`
- Create: `src/app/lifecycle.js`
- Modify: `app.js`
- Modify: `db.js`
- Modify: `sw.js` only if current cache rules incorrectly cache API requests
- Test: `test-persistence-regression.mjs`
- Test: `test-sync-regression.mjs`
- Test: `test-import-regression.mjs`
- Test: `test-github-pages.mjs`

**Interfaces:**
- `storage.js` owns game persistence, analysis snapshots, settings persistence, and migration wrappers while delegating raw IndexedDB operations to `db.js`.
- `chesscom.js` owns archive discovery, PGN fetch/parse, stable IDs, deduplication, and sync status.
- `router.js` owns screen navigation and route state; it must preserve current screen behavior.
- `lifecycle.js` owns boot, initial migration, event wiring, and service-worker registration.

- [ ] **Step 1: Add failing regression tests around analysis persistence, import/export, stable Chess.com IDs, duplicate sync avoidance, settings restoration, and GitHub Pages relative paths.**
- [ ] **Step 2: Run the focused regressions before extraction to establish the baseline.**
  - Run: `node test-persistence-regression.mjs && node test-sync-regression.mjs && node test-import-regression.mjs && node test-github-pages.mjs`
  - Expected: Existing behavior passes except any already-documented stale-version assertion, which must be recorded before changing it.
- [ ] **Step 3: Extract storage calls from `app.js` into `storage.js` without changing serialized formats.** Preserve `DATA_SCHEMA_VERSION=3` unless a real migration is required by the refactor.
- [ ] **Step 4: Extract Chess.com fetch/sync helpers into `src/sync/chesscom.js`.** Preserve timeout handling, stable IDs, standard-game filtering, and current sync status UI.
- [ ] **Step 5: Extract navigation/boot/event registration into `router.js` and `lifecycle.js`.** Ensure event listeners are registered once.
- [ ] **Step 6: Audit `sw.js` and ensure `/api/chesscom` or other non-cacheable network endpoints are not incorrectly precached/intercepted.** Do not alter unrelated caching behavior.
- [ ] **Step 7: Update stale version-specific tests such as `test-v0925.mjs` to assert behavior rather than an obsolete literal version where appropriate.** Keep `version.js` as the single source of truth.
- [ ] **Step 8: Run all focused regressions.**
  - Run: `node test-persistence-regression.mjs && node test-sync-regression.mjs && node test-import-regression.mjs && node test-github-pages.mjs`
  - Expected: PASS.
- [ ] **Step 9: Commit.**
  - Commit message: `refactor: isolate persistence sync and lifecycle`

---

## Task 9: Finalize `app.js`, Documentation, Versioning, and Full Regression Suite

**Files:**
- Modify: `app.js`
- Modify: `README.md`
- Modify: `version.js`
- Modify: `manifest.webmanifest` only if version metadata is currently duplicated and needs synchronization
- Add/update: all focused tests created by Tasks 1-8

**Interfaces:**
- `app.js` becomes the composition/root layer: screen composition, dependency wiring, and thin compatibility adapters only.
- `version.js` remains the authoritative `APP_VERSION`/`DATA_SCHEMA_VERSION` source.
- README documents the actual current version, local Stockfish files, GitHub Pages deployment assumptions, and test commands.

- [ ] **Step 1: Write a structural regression that fails if the newly extracted responsibilities are reintroduced as large DOM-independent functions inside `app.js`.** Use named exports/module imports and a conservative line/function-size guard rather than an arbitrary exact line count.
- [ ] **Step 2: Run the structural test and identify remaining duplicated logic.**
  - Run: `node test-app-architecture.mjs`
  - Expected: FAIL while old duplicated implementations remain.
- [ ] **Step 3: Remove duplicated tree, Stockfish, arrow, navigation, storage, sync, and pure-position implementations from `app.js`, leaving composition adapters only.** Do not remove compatibility code that is still required by an external HTML callback unless it is replaced in the same step.
- [ ] **Step 4: Update README to v0.9.29 (or the next single version selected by the implementation) and document the new architecture and arrow behavior.** Keep version declarations centralized.
- [ ] **Step 5: Run all available tests.**
  - Run: `for f in test-*.mjs; do echo "=== $f ==="; node "$f" || exit 1; done`
  - Expected: PASS for every test that is intended to run in Node; browser-only tests must be exercised by the browser smoke path below.
- [ ] **Step 6: Run browser/runtime checks for PWA loading, piece assets, local Stockfish, board navigation, arrows, and GitHub Pages-relative asset paths using `test-stockfish-browser.html` plus the documented browser smoke procedure.**
  - Expected: app loads without question-mark pieces; Stockfish responds; clicking a move-table entry changes the board; database and engine arrows render; board rotation remains manual; no console errors from the tested flows.
- [ ] **Step 7: Run the focused performance suite after the final build and inspect that arrow updates do not trigger full-board rebuilds.**
  - Run: `node test-performance.mjs`
  - Expected: PASS with no regression against the v0.9.28 baseline thresholds.
- [ ] **Step 8: Commit the final refactor/version/docs changes.**
  - Commit message: `feat: ship modular analysis arrows architecture`

---

## Final Verification Gate

- [ ] Confirm `version.js` contains the final app version and schema remains compatible.
- [ ] Confirm the complete Node regression suite is green and browser-only checks were actually executed.
- [ ] Confirm local Stockfish still loads from `stockfish-18-lite-single.js` + `stockfish-18-lite-single.wasm` and stale results cannot overwrite a newer position.
- [ ] Confirm every database arrow uses one of the required classification colors and every engine best move is dark blue/low opacity.
- [ ] Confirm database and engine arrows merge when they represent the same move.
- [ ] Confirm arrow clicks, move-table clicks, previous/next, and legal moves all use the unified navigation pipeline.
- [ ] Confirm normalized FEN/transposition handling and special moves remain covered by tests.
- [ ] Confirm move-table win/draw/loss percentages remain visible.
- [ ] Confirm arrow-only updates do not rebuild all 64 board squares.
- [ ] Confirm GitHub Pages paths, service-worker caching, PWA assets, piece images, PGN import/export, IndexedDB persistence, and Chess.com synchronization remain functional.
- [ ] Run a final fresh code review against the spec and this plan before declaring the implementation verified.

## Self-Review

- **Spec coverage:** Tasks 2-7 cover canonical FEN/transpositions, aggregation, classification, arrow model/palette, Stockfish merge/cache/stale-result protection, independent rendering, orientation, interaction, navigation, gauges, and performance. Task 8 covers persistence/sync/service-worker regressions. Task 9 covers architecture cleanup, versioning, documentation, and full verification.
- **Placeholder scan:** No implementation step uses TBD/TODO or an unspecified "handle edge cases" instruction; each task names concrete files, interfaces, commands, and expected outcomes.
- **Type/interface consistency:** `positionKeyFromFen` is established in Task 1 and consumed in Task 2/3; `buildGlobalTree` is produced in Task 2 and consumed in Task 3/7; `buildArrowDescriptors` is produced in Task 3 and consumed in Task 5/7; Stockfish controller is produced in Task 4 and consumed in Task 7; unified navigation is produced in Task 6 and consumed by move/arrow UI in Tasks 5-7.
- **Review focus coverage:** transpositions are pinned in Task 2; special moves remain covered by Task 2 + existing chess suite; stale Stockfish results are pinned in Task 4; annotation/cache behavior is pinned in Tasks 2-3; mobile rendering separation is pinned in Tasks 5 and 7.
- **Known implementation constraint:** the supplied v0.9.28 ZIP has no `.git` repository, so execution must first establish an isolated Git worktree/repository or obtain an explicitly authorized workspace before source implementation begins. This plan itself does not modify production code.
