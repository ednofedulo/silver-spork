const months = [
  { value: "1", name: "January", days: 31 },
  { value: "2", name: "February", days: 28 },
  { value: "3", name: "March", days: 31 },
  { value: "4", name: "April", days: 30 },
  { value: "5", name: "May", days: 31 },
  { value: "6", name: "June", days: 30 },
  { value: "7", name: "July", days: 31 },
  { value: "8", name: "August", days: 31 },
  { value: "9", name: "September", days: 30 },
  { value: "10", name: "October", days: 31 },
  { value: "11", name: "November", days: 30 },
  { value: "12", name: "December", days: 31 },
]

const HOLIDAY_YEAR_MIN = 2010
const HOLIDAY_YEAR_MAX = 2026

const elements = {
  workspace: document.querySelector(".app-workspace"),
  form: document.querySelector("#scheduleForm"),
  month: document.querySelector("#month"),
  monthPills: document.querySelector("#monthPills"),
  monthError: document.querySelector("#monthError"),
  state: document.querySelector("#state"),
  city: document.querySelector("#city"),
  year: document.querySelector("#year"),
  yearError: document.querySelector("#yearError"),
  hourlyRate: document.querySelector("#hourlyRate"),
  rateError: document.querySelector("#rateError"),
  generateButton: document.querySelector("#generateButton"),
  monthPreview: document.querySelector("#monthPreview"),
  holidayConfig: document.querySelector("#holidayConfig"),
  holidayList: document.querySelector("#holidayList"),
  holidayCount: document.querySelector("#holidayCount"),
  results: document.querySelector("#results"),
  summaries: document.querySelector("#summaries"),
  toast: document.querySelector("#toast"),
}

let scheduleOptions = []
let toastTimer = null
let hourlyRateCents = 0
let states = []
let cities = []
let holidayCache = new Map()
let applicableHolidays = []
let activeHolidayDates = new Set()
let holidayRequestId = 0
let pendingHolidayUpdate = Promise.resolve()

async function init() {
  populateMonths()
  selectMonth(new Date().getMonth() + 1)
  elements.year.value = new Date().getFullYear().toString()
  loadHourlyRate()
  await loadLocationData()
  updateMonthPreview()

  elements.form.addEventListener("submit", handleGenerate)
  elements.state.addEventListener("change", () => {
    populateCities(elements.state.value)
    updateHolidayConfig()
  })
  elements.city.addEventListener("change", updateHolidayConfig)
  elements.year.addEventListener("input", () => {
    clearFieldError("year")
    updateMonthPreview()
    updateHolidayConfig()
  })
  elements.holidayList.addEventListener("change", updateActiveHolidayDatesFromInputs)
  elements.hourlyRate.addEventListener("input", handleHourlyRateInput)
  elements.summaries.addEventListener("click", handleSummaryAction)
  elements.form.addEventListener("input", markResultsStale)
  elements.form.addEventListener("change", markResultsStale)
  updateHolidayConfig()
}

function populateMonths() {
  for (const month of months) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "month-pill"
    button.dataset.month = month.value
    button.setAttribute("role", "radio")
    button.setAttribute("aria-label", month.name)
    button.setAttribute("aria-checked", "false")
    button.tabIndex = -1
    button.addEventListener("keydown", handleMonthKeys)
    button.innerHTML = `<span>${month.name.slice(0, 3)}</span><strong>${month.name}</strong>`
    button.addEventListener("click", () => selectMonth(month.value))
    elements.monthPills.append(button)
  }
}

function selectMonth(monthValue) {
  elements.month.value = monthValue.toString()
  clearFieldError("month")

  for (const pill of elements.monthPills.querySelectorAll(".month-pill")) {
    const isSelected = pill.dataset.month === elements.month.value
    pill.classList.toggle("active", isSelected)
    pill.setAttribute("aria-checked", isSelected.toString())
    pill.tabIndex = isSelected ? 0 : -1
  }

  markResultsStale()
  updateMonthPreview()
  updateHolidayConfig()
}

async function loadLocationData() {
  try {
    const [loadedStates, loadedCities] = await Promise.all([
      fetchJson("data/localizacao/estados.json"),
      fetchJson("data/localizacao/municipios.json"),
    ])

    states = loadedStates
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    cities = loadedCities.map((city) => ({
      ...city,
      uf: states.find((state) => state.codigo_uf === city.codigo_uf)?.uf || "",
    }))

    populateStates()
    populateCities("SP", "3550308")
  } catch {
    showToast("Could not load Brazil state and city data.", true)
  }
}

async function fetchJson(path) {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Could not load ${path}`)
  }
  return response.json()
}

function populateStates() {
  elements.state.innerHTML = states
    .map(
      (state) =>
        `<option value="${state.uf}" ${state.uf === "SP" ? "selected" : ""}>${state.nome} - ${state.uf}</option>`,
    )
    .join("")
}

function populateCities(uf, preferredCityCode = "") {
  const stateCities = cities
    .filter((city) => city.uf === uf)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  const selectedCity =
    stateCities.find((city) => city.codigo_ibge.toString() === preferredCityCode) ||
    stateCities.find((city) => city.capital) ||
    stateCities[0]

  elements.city.innerHTML = stateCities
    .map(
      (city) =>
        `<option value="${city.codigo_ibge}" ${
          city.codigo_ibge === selectedCity?.codigo_ibge ? "selected" : ""
        }>${city.nome}</option>`,
    )
    .join("")
}

function canLoadHolidays() {
  const year = Number(elements.year.value)
  return (
    elements.month.value &&
    elements.state.value &&
    elements.city.value &&
    Number.isInteger(year) &&
    year >= HOLIDAY_YEAR_MIN &&
    year <= HOLIDAY_YEAR_MAX
  )
}

function loadHourlyRate() {
  const savedRate = Number.parseFloat(localStorage.getItem("workScheduleHourlyRate") || "")
  hourlyRateCents = Number.isFinite(savedRate) ? Math.round(savedRate * 100) : 0
  elements.hourlyRate.value = hourlyRateCents > 0 ? formatCurrency(hourlyRateCents) : ""
}

function handleHourlyRateInput() {
  clearFieldError("rate")
  const digits = elements.hourlyRate.value.replace(/\D/g, "")
  hourlyRateCents = Number.parseInt(digits || "0", 10)

  if (hourlyRateCents > 0) {
    elements.hourlyRate.value = formatCurrency(hourlyRateCents)
    localStorage.setItem("workScheduleHourlyRate", getHourlyRate().toFixed(2))
  } else {
    elements.hourlyRate.value = ""
    localStorage.removeItem("workScheduleHourlyRate")
  }
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function getHourlyRate() {
  return hourlyRateCents / 100
}

function formatTime(hours, minutes) {
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:00`
}

function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number)
  return hours * 60 + minutes
}

function minutesToHours(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

function minutesToDecimalHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return formatTime(hours, minutes)
}

function generateWorkDay() {
  const clockInMinutes = randomBetween(7 * 60 + 50, 8 * 60 + 20)
  const lunchOutMinutes = randomBetween(11 * 60 + 55, 12 * 60 + 10)
  const lunchBackMinutes = lunchOutMinutes + randomBetween(118, 125)
  const targetWorkMinutes = randomBetween(474, 480)

  const clockIn = minutesToTime(clockInMinutes)
  const lunchOut = minutesToTime(lunchOutMinutes)
  const lunchBack = minutesToTime(lunchBackMinutes)
  const morningWork = timeToMinutes(lunchOut) - timeToMinutes(clockIn)
  const clockOut = minutesToTime(lunchBackMinutes + targetWorkMinutes - morningWork)
  const totalMinutes =
    timeToMinutes(lunchOut) -
    timeToMinutes(clockIn) +
    timeToMinutes(clockOut) -
    timeToMinutes(lunchBack)

  return {
    times: [clockIn, lunchOut, lunchBack, clockOut],
    totalMinutes,
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function getDaysInMonth(month, year) {
  const monthData = months.find((item) => item.value === month.toString())
  if (!monthData) return 30
  return month === 2 && isLeapYear(year) ? 29 : monthData.days
}

function updateMonthPreview() {
  const selectedMonth = elements.month.value
  const year = Number(elements.year.value)

  if (!selectedMonth || Number.isNaN(year)) {
    elements.monthPreview.classList.add("is-hidden")
    elements.monthPreview.textContent = ""
    return
  }

  const month = months.find((item) => item.value === selectedMonth)
  const dayCount = getDaysInMonth(Number.parseInt(selectedMonth, 10), year)

  elements.monthPreview.classList.remove("is-hidden")
  elements.monthPreview.innerHTML = `<strong>${month.name} <span>${year}</span></strong><span>${dayCount} DAYS</span>`
  renderCalendar()
}

async function handleGenerate(event) {
  event.preventDefault()
  clearAllFieldErrors()

  if (!elements.state.value || !elements.city.value) {
    showToast("Location data is unavailable. Refresh the page and try again.", true)
    return
  }

  const monthNumber = Number.parseInt(elements.month.value, 10)
  const yearNumber = Number(elements.year.value)
  let firstInvalidControl = null

  if (Number.isNaN(monthNumber)) {
    setFieldError("month", "Choose a month.")
    firstInvalidControl = elements.monthPills.querySelector(".month-pill")
  }

  if (!Number.isInteger(yearNumber) || yearNumber < HOLIDAY_YEAR_MIN || yearNumber > HOLIDAY_YEAR_MAX) {
    setFieldError("year", `Enter a year from ${HOLIDAY_YEAR_MIN} to ${HOLIDAY_YEAR_MAX}.`)
    firstInvalidControl ||= elements.year
  }

  if (getHourlyRate() <= 0) {
    setFieldError("rate", "Enter an hourly rate greater than zero.")
    firstInvalidControl ||= elements.hourlyRate
  }

  if (firstInvalidControl) {
    firstInvalidControl.focus()
    return
  }

  setGenerateLoading(true)

  try {
    await pendingHolidayUpdate
    updateActiveHolidayDatesFromInputs()

    const generatedOptions = Array.from({ length: 10 }, (_, index) =>
      generateScheduleOption(index + 1, monthNumber, yearNumber),
    )
    scheduleOptions = [selectBestScheduleOption(generatedOptions)]
    renderResults()
    showToast("Schedule generated.")
  } finally {
    setGenerateLoading(false)
  }
}

function getValidationField(fieldName) {
  return {
    month: { control: elements.monthPills, error: elements.monthError },
    year: { control: elements.year, error: elements.yearError },
    rate: { control: elements.hourlyRate, error: elements.rateError },
  }[fieldName]
}

function setFieldError(fieldName, message) {
  const field = getValidationField(fieldName)
  if (!field) return

  field.control.setAttribute("aria-invalid", "true")
  field.error.textContent = message
  field.error.classList.remove("is-hidden")
  field.error.closest(".field-card")?.classList.add("has-field-error")
}

function clearFieldError(fieldName) {
  const field = getValidationField(fieldName)
  if (!field) return

  field.control.removeAttribute("aria-invalid")
  field.error.textContent = ""
  field.error.classList.add("is-hidden")
  field.error.closest(".field-card")?.classList.remove("has-field-error")
}

function clearAllFieldErrors() {
  clearFieldError("month")
  clearFieldError("year")
  clearFieldError("rate")
}

function setGenerateLoading(isLoading) {
  elements.generateButton.querySelector(".generate-label").textContent = isLoading ? "Generating…" : "Generate schedule"
  elements.generateButton.disabled = isLoading
  elements.generateButton.classList.toggle("is-loading", isLoading)
  elements.generateButton.setAttribute("aria-busy", isLoading.toString())
}

function generateScheduleOption(optionNumber, monthNumber, yearNumber) {
  const daysInMonth = getDaysInMonth(monthNumber, yearNumber)
  const lines = []
  let totalWorkMinutes = 0
  let workDaysCount = 0
  let weekdayHolidayCount = 0

  for (let day = 1; day <= daysInMonth; day += 1) {
    const currentDate = new Date(yearNumber, monthNumber - 1, day)
    const dayOfWeek = currentDate.getDay()
    const dateKey = formatHolidayDate(day, monthNumber, yearNumber)
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
    const isHoliday = activeHolidayDates.has(dateKey)

    if (isWeekday && !isHoliday) {
      const workDay = generateWorkDay()
      lines.push(workDay.times.join("\t"))
      totalWorkMinutes += workDay.totalMinutes
      workDaysCount += 1
    } else {
      if (isWeekday && isHoliday) {
        weekdayHolidayCount += 1
      }
      lines.push("")
    }
  }

  const totalEarnings = minutesToDecimalHours(totalWorkMinutes) * getHourlyRate()

  return {
    id: optionNumber,
    rawValues: lines.join("\n"),
    totalWorkMinutes,
    totalEarnings,
    monthNumber,
    yearNumber,
    workDaysCount,
    weekdayHolidayCount,
    summary: buildSummary(totalWorkMinutes, workDaysCount, weekdayHolidayCount, totalEarnings),
  }
}

function selectBestScheduleOption(options) {
  return options.reduce((bestOption, option) =>
    option.totalEarnings > bestOption.totalEarnings ? option : bestOption,
  )
}

function updateHolidayConfig() {
  pendingHolidayUpdate = refreshHolidayConfig()
  return pendingHolidayUpdate
}

async function refreshHolidayConfig() {
  const requestId = ++holidayRequestId
  if (!canLoadHolidays()) {
    applicableHolidays = []
    activeHolidayDates = new Set()
    elements.holidayConfig.classList.add("is-hidden")
    elements.holidayList.innerHTML = ""
    elements.holidayCount.textContent = "0 holidays"
    renderCalendar()
    return
  }

  const year = Number(elements.year.value)
  const month = Number.parseInt(elements.month.value, 10)

  const loadedHolidays = await loadApplicableHolidays(
    year,
    month,
    elements.state.value,
    Number(elements.city.value),
  )

  if (requestId !== holidayRequestId) return
  applicableHolidays = loadedHolidays
  renderHolidayConfig()
  updateActiveHolidayDatesFromInputs()
}

async function loadApplicableHolidays(year, month, uf, cityCode) {
  const cacheKey = `${year}-${uf}-${cityCode}`
  let holidays = holidayCache.get(cacheKey)

  if (!holidays) {
    try {
      const [national, state, municipal] = await Promise.all([
        loadHolidayFile("nacional", year),
        loadHolidayFile("estadual", year),
        loadHolidayFile("municipal", year),
      ])

      holidays = mergeHolidays([
        ...national.map((holiday) => ({ ...holiday, scope: "Federal" })),
        ...state
          .filter((holiday) => holiday.uf === uf)
          .map((holiday) => ({ ...holiday, scope: "State" })),
        ...municipal
          .filter((holiday) => Number(holiday.codigo_ibge) === cityCode)
          .map((holiday) => ({ ...holiday, scope: "City" })),
      ])

      holidayCache.set(cacheKey, holidays)
    } catch {
      showToast(`Holiday data for ${year} is unavailable. Only weekends will be blank.`, true)
      return []
    }
  }

  return holidays.filter((holiday) => Number(holiday.date.slice(3, 5)) === month)
}

function mergeHolidays(holidays) {
  const byDate = new Map()

  for (const holiday of holidays) {
    const existing = byDate.get(holiday.data) || {
      date: holiday.data,
      names: [],
      scopes: [],
    }

    if (!existing.names.includes(holiday.nome)) {
      existing.names.push(holiday.nome)
    }

    if (!existing.scopes.includes(holiday.scope)) {
      existing.scopes.push(holiday.scope)
    }

    byDate.set(holiday.data, existing)
  }

  return [...byDate.values()].sort((a, b) => dateKeyToSortable(a.date) - dateKeyToSortable(b.date))
}

function dateKeyToSortable(dateKey) {
  const [day, month, year] = dateKey.split("/").map(Number)
  return new Date(year, month - 1, day).getTime()
}

function renderHolidayConfig() {
  elements.holidayConfig.classList.remove("is-hidden")
  elements.holidayCount.textContent = `${applicableHolidays.length} ${
    applicableHolidays.length === 1 ? "holiday" : "holidays"
  }`

  if (!applicableHolidays.length) {
    elements.holidayList.innerHTML = `<div class="holiday-empty">No holidays found for this month and location.</div>`
    return
  }

  elements.holidayList.innerHTML = applicableHolidays
    .map((holiday) => {
      const inputId = `holiday-${holiday.date.replace(/\D/g, "")}`
      return `
        <label class="holiday-option" for="${inputId}">
          <input id="${inputId}" type="checkbox" value="${holiday.date}" checked>
          <span class="holiday-option-body">
            <strong>${escapeHtml(holiday.names.join(" / "))}</strong>
            <small>${escapeHtml(holiday.date)} · ${escapeHtml(holiday.scopes.join(", "))}</small>
          </span>
        </label>
      `
    })
    .join("")
}

function updateActiveHolidayDatesFromInputs() {
  activeHolidayDates = new Set(
    [...elements.holidayList.querySelectorAll('input[type="checkbox"]:checked')].map(
      (input) => input.value,
    ),
  )
  renderCalendar()
}

function escapeHtml(value) {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

async function loadHolidayFile(type, year) {
  return fetchJson(`data/feriados/${type}/json/${year}.json`)
}

function formatHolidayDate(day, month, year) {
  return `${day.toString().padStart(2, "0")}/${month
    .toString()
    .padStart(2, "0")}/${year}`
}

function buildSummary(totalWorkMinutes, workDaysCount, weekdayHolidayCount, totalEarnings) {
  const avgDailyMinutes = workDaysCount > 0 ? totalWorkMinutes / workDaysCount : 0
  const totalDecimalHours = minutesToDecimalHours(totalWorkMinutes)
  const avgDecimalHours = minutesToDecimalHours(avgDailyMinutes)

  const workDaysValue =
    weekdayHolidayCount > 0
      ? `${workDaysCount} (${weekdayHolidayCount} holiday${weekdayHolidayCount === 1 ? "" : "s"})`
      : `${workDaysCount}`

  return {
    copyTitle: "Schedule",
    metrics: [
      ["Total Work Time", `${minutesToHours(totalWorkMinutes)} (${totalDecimalHours}h)`],
      ["Work Days", workDaysValue],
      ["Average Daily", `${minutesToHours(Math.round(avgDailyMinutes))} (${avgDecimalHours}h)`],
      ["Total Earnings", formatCurrency(Math.round(totalEarnings * 100)), "summary-metric-highlight"],
    ],
  }
}

function renderResults() {
  elements.results.classList.remove("is-hidden")
  elements.workspace.classList.add("has-results")
  const option = scheduleOptions[0]
  const monthName = months.find((month) => Number(month.value) === option.monthNumber).name
  const dailyAverage = option.workDaysCount ? Math.round(option.totalWorkMinutes / option.workDaysCount) : 0
  const rows = option.rawValues.split("\n").map((line, index) => {
    const values = line ? line.split("\t").map((time) => time.slice(0, 5)) : []
    return `<tr class="${line ? "" : "off-row"}"><td>${String(index + 1).padStart(2, "0")}</td>${line ? values.map((time) => `<td>${time}</td>`).join("") : '<td colspan="4">Day off</td>'}</tr>`
  }).join("")
  elements.summaries.innerHTML = `
    <article class="summary-card">
      <p class="stale-notice is-hidden" role="status">Settings changed. Generate again to update.</p>
      <div class="summary">
        <div class="summary-metric"><span>TOTAL WORK TIME</span><strong>${minutesToHours(option.totalWorkMinutes)}</strong></div>
        <div class="summary-metric"><span>WORKDAYS</span><strong>${option.workDaysCount}</strong></div>
        <div class="summary-metric"><span>DAILY AVERAGE</span><strong>${minutesToHours(dailyAverage)}</strong></div>
        <div class="summary-metric"><span>SCHEDULE FOR</span><strong>${monthName.slice(0, 3)} ${option.yearNumber}</strong></div>
        <div class="summary-metric summary-metric-highlight"><span>ESTIMATED EARNINGS</span><strong id="earningsValue">${formatCurrency(Math.round(option.totalEarnings * 100))}</strong></div>
      </div>
      <div class="result-actions"><button class="copy-option-button" type="button" data-option-id="${option.id}"><svg class="icon" aria-hidden="true"><use href="#i-copy"/></svg>Copy for spreadsheet</button><button class="download-button" type="button" data-option-id="${option.id}" aria-label="Download schedule as CSV" title="Download CSV"><svg class="icon" aria-hidden="true"><use href="#i-download"/></svg></button></div>
      <details class="result-disclosure"><summary>View all time entries</summary><div class="schedule-table-wrap"><table class="schedule-table"><caption class="sr-only">${monthName} ${option.yearNumber} generated time entries</caption><thead><tr><th scope="col">Day</th><th scope="col">In</th><th scope="col">Lunch</th><th scope="col">Back</th><th scope="col">Out</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    </article>`
  animateEarnings(option.totalEarnings)
  if (window.innerWidth <= 650) elements.results.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" })
}

function handleSummaryAction(event) {
  const button = event.target.closest(".copy-option-button, .download-button")
  if (!button) return
  const option = scheduleOptions.find((item) => item.id === Number(button.dataset.optionId))
  if (!option) return
  if (button.classList.contains("download-button")) {
    const csv = ["Day,Clock in,Lunch out,Lunch back,Clock out", ...option.rawValues.split("\n").map((line, index) => `${index + 1},${line ? line.replace(/\t/g, ",") : ",,,"}`)].join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `schedule-${option.yearNumber}-${String(option.monthNumber).padStart(2, "0")}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast("CSV downloaded.")
  } else {
    copyToClipboard(option.rawValues, option.summary.copyTitle, button)
  }
}

async function copyToClipboard(values, title, button) {
  if (!values) return

  try {
    await navigator.clipboard.writeText(values)
    showCopyConfirmation(button)
    showToast(`${title} copied.`)
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = values
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    textarea.remove()
    if (copied) {
      showCopyConfirmation(button)
      showToast(`${title} copied.`)
    } else {
      showToast("Copy is unavailable in this browser. Download the CSV instead.", true)
    }
  }
}

function showCopyConfirmation(button) {
  if (!button) return

  const originalMarkup = button.innerHTML
  button.disabled = true
  button.innerHTML = `
    <svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>
    Copied to clipboard
  `

  window.setTimeout(() => {
    button.innerHTML = originalMarkup
    button.disabled = false
  }, 1600)
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.toggle("error", isError)
  elements.toast.classList.add("show")

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show")
  }, 2800)
}

function markResultsStale() {
  elements.results.querySelector(".stale-notice")?.classList.remove("is-hidden")
}

function handleMonthKeys(event) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
  if (!keys.includes(event.key)) return
  event.preventDefault()
  const columns = getComputedStyle(elements.monthPills).gridTemplateColumns.split(" ").length
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
  const current = Number(elements.month.value) - 1
  const next = event.key === "Home" ? 0 : event.key === "End" ? 11 : (current + offsets[event.key] + 12) % 12
  selectMonth(next + 1)
  elements.monthPills.children[next].focus()
}

function renderCalendar() {
  const month = Number(elements.month.value)
  const year = Number(elements.year.value)
  const grid = document.querySelector("#calendarGrid")
  if (!month || !Number.isInteger(year) || year < HOLIDAY_YEAR_MIN || year > HOLIDAY_YEAR_MAX) {
    grid.innerHTML = '<p class="calendar-unavailable">Choose a year from 2010–2026 to preview your month.</p>'
    document.querySelector("#workdayCount").textContent = "—"
    document.querySelector("#dayoffCount").textContent = "—"
    return
  }
  const dayCount = getDaysInMonth(month, year)
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const today = new Date()
  let workdays = 0
  let markup = '<span class="calendar-day calendar-blank" aria-hidden="true"></span>'.repeat(offset)
  for (let day = 1; day <= dayCount; day++) {
    const date = new Date(year, month - 1, day)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const holiday = activeHolidayDates.has(formatHolidayDate(day, month, year))
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
    if (!weekend && !holiday) workdays++
    const dayLabel = `${months[month - 1].name} ${day}: ${holiday ? "Holiday" : weekend ? "Day off" : "Workday"}`
    markup += `<span class="calendar-day ${weekend ? "day-off" : ""} ${holiday ? "holiday" : ""} ${isToday ? "today" : ""}" role="listitem" aria-label="${dayLabel}" style="--delay:${day * .008}s">${day}</span>`
  }
  grid.innerHTML = markup
  document.querySelector("#workdayCount").textContent = workdays
  document.querySelector("#dayoffCount").textContent = dayCount - workdays
  const city = elements.city.selectedOptions[0]?.textContent
  const state = elements.state.value
  document.querySelector("#locationPreview").textContent = city ? `${city}, ${state} · Brazil` : "Brazilian holiday calendar"
}

function animateEarnings(amount) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const target = document.querySelector("#earningsValue")
  const started = performance.now()
  const step = (now) => {
    if (!target.isConnected) return
    const progress = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 1
      : Math.min((now - started) / 850, 1)
    target.textContent = formatCurrency(Math.round(amount * 100 * (1 - (1 - progress) ** 3)))
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

init()
