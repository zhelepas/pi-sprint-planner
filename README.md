# PI Sprint Planner

A dependency-free HTML/CSS/JavaScript board for the last days of SAFe PI Planning: drop pre-estimated stories into sprints and watch each sprint's story points against the team capacity.

**Live: https://zhelepas.github.io/pi-sprint-planner/**

## Features

- Sprints as columns (5 by default), features as rows — add or remove as many as you need.
- Per-sprint capacity in story points, with a live `used / capacity` readout, progress bar and totals row (green within capacity, red when over).
- Stories are created per feature, have an inline editable title and point value, and start in the backlog column.
- Drag a story into any sprint cell to plan it; its points immediately count against that sprint's capacity. Dropping it into another feature's row reassigns the feature.
- Each feature has its own color, shared by all of its story cards.
- Light and dark mode (follows the OS preference on first load, your choice is remembered).
- Board state is auto-saved to `localStorage`, plus timestamped exports: JSON (re-importable), CSV, Excel (`.xlsx`, rows tinted with the feature color), Markdown table (for Confluence) and JPG.

## Usage

Serve `index.html` using a local server, e.g.

* `python -m http.server 8000`
* `npx http-server . -p 8000`
* `php -S localhost:8000`
* `ruby -run -e httpd . -p 8000`
* `cargo install cargo-server; cargo server --port 8000`

or use the hosted version linked above. No build step required.

## Deployment

Every push to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which publishes the repository root to GitHub Pages.
