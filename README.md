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
- Board state is auto-saved to `localStorage`, plus timestamped JSON export and import.

## Usage

Open `index.html` in a browser, or use the hosted version linked above. No build step and no server required.

## Deployment

Every push to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which publishes the repository root to GitHub Pages.
