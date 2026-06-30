# Work Schedule Generator

A dependency-light timesheet utility built with vanilla JavaScript, Bootstrap, and custom CSS.

## Run

Start a local server:

```sh
npm run dev
```

Then visit `http://localhost:3000`.

## Features

- Generates weekday-only clock-in, lunch-out, lunch-back, and clock-out entries.
- Keeps one blank line for each weekend and selected-location holiday so rows line up with the month.
- Produces tab-separated output for Excel or spreadsheet paste.
- Generates five schedule options and copies each option's hidden spreadsheet-ready values.
- Calculates total time, workday count, average daily hours, hourly rate, and earnings.
- Remembers the optional hourly rate in local storage.
- Uses local holiday JSON from `joaopbini/feriados-brasil` for national, state, and city holidays from 2010-2026.
