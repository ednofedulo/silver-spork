# Work Schedule Generator

A vanilla JavaScript timesheet utility. No build step or runtime dependencies.

## Run

```sh
npm run dev
```

Visit `http://localhost:3000`.

## Features

- Generates ten weekday schedules and selects the highest-earning result.
- Includes national, state, and city holidays in Brazil, with individual holiday toggles.
- Calendar preview with workday and day-off totals.
- Copies four tab-separated time columns, preserving blank rows for weekends and selected holidays.
- Downloads CSV and previews generated time entries.
- Calculates work time, daily average, and estimated earnings; remembers the hourly rate locally.
- Responsive layout, keyboard month selection, and field validation.
- Animated calendar updates, result transitions, earnings counter, and interaction feedback, respecting reduced-motion preferences.

Holiday JSON is vendored from `joaopbini/feriados-brasil` and covers 2010–2026. Rates are formatted in USD. Typography uses Google Fonts with local fallbacks.
