---
description: "Use when working on PI Sprint Planner architecture, module boundaries, or repository-level refactors."
applyTo: "**/*.js,**/*.html,**/*.md"
---

# Project architecture instructions

## Scope
Repository-wide architecture guidance for the PI Sprint Planner app.

## Architecture rules
- Do not mix state mutation and DOM rendering in the same file.
- Keep the data layer free of DOM-specific logic.
- Keep render logic free of business-rule mutations.
- Keep exporter logic focused on serialization and file creation only.
- Keep the bootstrap file thin; it should only wire events and initialize the app.
- Prefer small, explicit public APIs over hidden global state.

## Refactor rules
- Keep the separation of concerns intact when making changes.
- Decide which layer owns a new concept before editing code.
- Prefer extracting shared logic into the appropriate module instead of adding more responsibilities to an existing file.
- Avoid circular dependencies; prefer explicit imports and callback wiring.
- Preserve existing behavior while improving maintainability.

## File and path rules
- Keep browser entrypoint logic in `src/app.js`.
- Keep all project modules under `src/`.
- Keep the root HTML shell minimal; do not embed business logic in `index.html`.
- Do not reintroduce a root-level monolithic `app.js` unless explicitly required by the user.

## Instruction maintenance rule
- If a change affects architecture, module responsibilities, startup flow, persistence behavior, rendering logic, or export behavior, update the instruction files in `.github/` as part of the same change.
- Keep repository instructions aligned with the current project structure and conventions.
