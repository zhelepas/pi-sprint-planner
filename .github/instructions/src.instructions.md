---
description: "Use when editing files under src/ and when making source-level architecture changes in PI Sprint Planner."
applyTo: "src/**/*.js"
---

# Source module instructions

## Scope
Applies to all files under `src/`.

## Required conventions
- Use ES modules (`import` / `export`) consistently.
- Keep each module scoped to one responsibility.
- Do not reach across module boundaries for unrelated logic.
- Avoid hidden global state and prefer explicit APIs.
- Keep DOM manipulation inside render logic and state mutation inside actions logic.

## File-specific responsibilities
- `src/state.js`: persistence, workspace/project state, normalization, and migration.
- `src/render.js`: DOM rendering, totals refresh, and UI helper functions.
- `src/actions.js`: state-changing actions and project/board mutations.
- `src/exporters.js`: file serialization and artifact generation.
- `src/theme.js`: theme persistence and toggling.
- `src/app.js`: app bootstrap and event wiring only.

## Implementation practices
- Preserve current behavior unless the user explicitly requests a change.
- Keep logic DRY and colocated with related concerns.
- Reuse formatting and export helpers instead of duplicating them.
- When source structure changes, update related instruction files in `.github/` as part of the same change.

## Instruction maintenance rule
- If a change affects module boundaries, startup flow, responsibilities, persistence behavior, rendering logic, or export behavior, update `.github/instructions/*.instructions.md` before finishing the work.
- Do not leave instruction files stale after source refactors.
