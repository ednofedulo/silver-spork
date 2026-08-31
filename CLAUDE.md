# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Work Schedule Generator: a dependency-light, static timesheet utility built with vanilla JavaScript, Bulma CSS, and custom CSS. There is no build step, bundler, or package manager dependency tree — `package.json` exists only to define the dev-server script.

## Commands

- `npm run dev` (or `npm start`) — serves the app at `http://localhost:3000` via `python3 -m http.server 3000`. There is no build/lint/test tooling in this repo.

## Architecture

The entire app is three files served statically: `index.html`, `src/app.js`, `src/styles.css`, plus a local JSON data directory.

**`src/app.js`** is a single script (no modules/bundler) that runs everything through one `init()` call at the bottom of the file. Key flows:

- **Location data**: On load, fetches `data/localizacao/estados.json` (states) and `data/localizacao/municipios.json` (cities) in parallel, joins cities to their state via `codigo_uf`, and populates the state/city `<select>` elements. Defaults to state `SP`, city `3550308` (São Paulo).
- **Holiday data**: `data/feriados/{nacional,estadual,municipal}/json/{year}.json` holds one file per year (2010–2026) per scope, sourced from `joaopbini/feriados-brasil`. `loadApplicableHolidays()` fetches all three scopes for the selected year, filters state holidays by `uf` and municipal holidays by `codigo_ibge`, merges same-date holidays via `mergeHolidays()`, and caches the combined result per `year-uf-cityCode` key in `holidayCache`. Results are then filtered down to the selected month for display. Users can toggle individual holidays on/off via checkboxes; unchecked holidays are treated as regular workdays.
- **Schedule generation**: `handleGenerate()` builds 10 candidate schedules (`generateScheduleOption`), each producing randomized-but-plausible clock-in/lunch-out/lunch-back/clock-out times per weekday (via `generateWorkDay`/`randomBetween`) while leaving a blank line for weekends and active holidays so row counts always match the days in the month. `selectBestScheduleOption()` picks the option with the highest total earnings (hours × hourly rate) and only that one is rendered/copyable — the UI always shows "1 of 10 generated" as the winner.
- **Output format**: each generated day is four tab-separated time values (`HH:MM:SS`), joined by newlines — designed to be pasted directly into a spreadsheet. `copyToClipboard()` uses the Clipboard API with a `document.execCommand("copy")` fallback via a hidden textarea.
- **Hourly rate**: stored in cents internally (`hourlyRateCents`) to avoid float rounding, formatted as USD via `Intl.NumberFormat`, and persisted to `localStorage` (`workScheduleHourlyRate`).
- **Theming**: `APP_THEME` constant (top of `app.js`) selects a theme by setting `document.documentElement.dataset.theme`; valid values are enumerated in `APP_THEMES`. There is no user-facing theme switcher — changing the theme means editing this constant and the corresponding CSS.

**`data/`** is vendored reference data, not generated at build time — treat it as static input. Holiday JSON files also have `csv` and `sql` sibling versions (unused by the app).

**Date format convention**: holiday dates use `DD/MM/YYYY` strings (Brazilian format) both in the source JSON and internally (`formatHolidayDate`, `dateKeyToSortable`); don't assume ISO date ordering when working with these values.
