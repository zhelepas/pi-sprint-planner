# Copilot instructions for PI Sprint Planner

## Scope
Repository-wide guidance for the PI Sprint Planner app.

## Repository goals
- Keep the app maintainable as it grows.
- Preserve behavior while separating concerns.
- Prefer small, explicit modules over a monolithic entrypoint.

## Shared working rules
- Do not mix state mutation and DOM rendering in the same file.
- Do not add business logic to `index.html`.
- Prefer explicit imports/exports and small public APIs over hidden globals.
- Keep cross-cutting rules centralized and DRY.
- Preserve browser compatibility and local run conventions.

## Instruction maintenance rule
- When a change materially affects repository architecture, module responsibilities, startup flow, persistence behavior, rendering logic, or export behavior, update the instruction files in `.github/` in the same change.
- Keep `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` synchronized with the current project structure and conventions.
- If a refactor changes boundaries, file roles, or project layout, update the instruction files before finishing the work.
