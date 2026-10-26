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

## Jira key conventions
- Store Jira ticket IDs in memory as bare numeric IDs such as `999`; do not persist the project prefix like `PROJECT-999` in the board state or localStorage.
- Export logic must attach the active feature/story project prefix at export time so the current project key is used for all serialized outputs.
- Imported JSON payloads may include project prefixes during validation, but once imported they are normalized to the bare ticket number to keep future project-key changes consistent.
- Exported feature and story keys must include the configured Jira project prefix as `PROJECT-123` when a ticket number is present.
- JSON import validation must reject inconsistent project prefixes within a feature-story collection and reject missing project prefixes when the frontend configuration is empty.
- When an imported JSON payload includes a consistent project prefix, that imported prefix overrides the frontend configuration for that collection.
- Frontend-configured project keys only fill in missing prefixes for numeric ticket IDs such as `123`.
