# Work Schedule Generator

A dependency-light timesheet utility built with vanilla JavaScript, Bootstrap, and custom CSS.

## Run

Open `index.html` directly in a browser, or start a local server:

```sh
npm run dev
```

Then visit `http://localhost:3000`.

## Features

- Generates weekday-only clock-in, lunch-out, lunch-back, and clock-out entries.
- Keeps one blank line for each weekend day so rows line up with the month.
- Produces tab-separated output for Excel or spreadsheet paste.
- Calculates total time, workday count, average daily hours, hourly rate, and earnings.
- Remembers the optional hourly rate in local storage.
- Copies generated entries to the clipboard or downloads a text file.
