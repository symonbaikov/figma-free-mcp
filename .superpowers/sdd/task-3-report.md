# Task 3 Report: Render Maximal Vector-Only Subtrees

## Status

Complete with controller recovery.

## RED

- The implementer created `packages/core/test/render-ready-assets.test.ts` before production renderer files were complete, but did not write a report before hanging.
- The controller observed the worktree while Task 3 was in progress with the new test and render files uncommitted.
- Exact RED output was not preserved.

## GREEN

- Command: `pnpm --filter @figctx/core test -- render-ready-assets.test.ts`
- Result: passed; `render-ready-assets.test.ts` included 3 passing tests.
- Command: `pnpm test`
- Result: passed; 9 core test files passed, 32 tests passed, 1 skipped.
- Command: `pnpm build && pnpm typecheck`
- Result: passed for core, CLI, and MCP server packages.

## Files changed

- `packages/core/package.json`
- `pnpm-lock.yaml`
- `packages/core/src/render/types.ts`
- `packages/core/src/render/targets.ts`
- `packages/core/src/render/vector-network.ts`
- `packages/core/src/render/svg-scene.ts`
- `packages/core/src/render/render-ready-assets.ts`
- `packages/core/test/render-ready-assets.test.ts`

## Self-review

- Renderer is not wired into extraction in this task.
- Existing raster/vector extraction behavior is unchanged.
- `renderReadyAssets()` returns warnings for per-target failures instead of throwing the whole render pass.
- Synthetic render test verifies PNG bytes and ready asset metadata.

## Concerns

- Exact RED command output was not captured because the implementer subagent hung before writing its report.
- `vector-network.ts` currently supports the simple polygon subset from the plan; real Logika extraction may require parser expansion during Task 4 acceptance.

---

## Review Fix: Transform Matrix And Hidden Visibility

Status: DONE with controller recovery.

RED:
- Fix-agent added regression coverage for non-translation matrix transforms and hidden vector ancestors before changing renderer behavior.
- Exact RED output was not preserved because the fix-agent hung before writing its report.

GREEN:
- `pnpm --filter @figctx/core test -- render-ready-assets.test.ts` passed with 5 render tests.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm typecheck` passed.

Files changed:
- `packages/core/src/render/svg-scene.ts`
- `packages/core/src/render/targets.ts`
- `packages/core/test/render-ready-assets.test.ts`

Self-review:
- SVG rendering now emits full `matrix(a b c d e f)` transforms instead of translation-only transforms.
- Target selection now excludes hidden nodes and hidden ancestors.
- Hidden root rendering produces no path content.

## Review Fixes: Transform Matrix and Hidden Ancestors (2026-07-15 12:19 IDT)

### RED

- Command: `pnpm --filter @figctx/core test -- render-ready-assets.test.ts`
- Result: failed as expected before production changes.
- Expected transform regression failure: generated SVG contained `transform="translate(8 11)"` instead of preserving the composed scaled/rotated matrix `matrix(0 6 -6 0 -3 13)`.
- Expected visibility regression failure: hidden vector-only root/group candidates were still selected; `findReadyAssetTargets()` returned `["12:1", "12:3"]`.

### GREEN

- `svg-scene.ts` now composes full 2x3 matrices and emits SVG `matrix(a b c d e f)` transforms for rendered vector paths and rectangles instead of reducing transforms to translation.
- `svg-scene.ts` now returns an empty body for a hidden root subtree.
- `targets.ts` now requires a candidate node and all ancestors to be visible, and hidden branches no longer contribute visible vector descendants.
- The vector-network parser was not expanded.

### Verification

- `pnpm --filter @figctx/core test -- render-ready-assets.test.ts`: passed; 9 test files passed, 34 tests passed, 1 skipped.
- `pnpm test`: passed; core package 9 test files passed, 34 tests passed, 1 skipped; CLI and MCP server had no test files and exited successfully with `--passWithNoTests`.
- `pnpm build && pnpm typecheck`: passed for core, CLI, and MCP server packages.

### Concerns

- The renderer now preserves local matrix composition for the existing relative-transform model. It still does not attempt to reinterpret Figma absolute transform semantics beyond the current renderer design.
