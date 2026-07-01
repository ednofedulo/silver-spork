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
  form: document.querySelector("#scheduleForm"),
  month: document.querySelector("#month"),
  monthPills: document.querySelector("#monthPills"),
  state: document.querySelector("#state"),
  city: document.querySelector("#city"),
  year: document.querySelector("#year"),
  hourlyRate: document.querySelector("#hourlyRate"),
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
    updateMonthPreview()
    updateHolidayConfig()
  })
  elements.holidayList.addEventListener("change", updateActiveHolidayDatesFromInputs)
  elements.hourlyRate.addEventListener("input", handleHourlyRateInput)
  elements.summaries.addEventListener("click", handleSummaryAction)
  updateHolidayConfig()
}

function populateMonths() {
  for (const month of months) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "month-pill"
    button.dataset.month = month.value
    button.setAttribute("role", "radio")
    button.setAttribute("aria-checked", "false")
    button.innerHTML = `<span>${month.name.slice(0, 3)}</span><strong>${month.name}</strong>`
    button.addEventListener("click", () => selectMonth(month.value))
    elements.monthPills.append(button)
  }
}

function selectMonth(monthValue) {
  elements.month.value = monthValue.toString()

  for (const pill of elements.monthPills.querySelectorAll(".month-pill")) {
    const isSelected = pill.dataset.month === elements.month.value
    pill.classList.toggle("active", isSelected)
    pill.setAttribute("aria-checked", isSelected.toString())
  }

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
  const year = Number.parseInt(elements.year.value, 10)
  return (
    elements.month.value &&
    elements.state.value &&
    elements.city.value &&
    !Number.isNaN(year) &&
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
  const year = Number.parseInt(elements.year.value, 10)

  if (!selectedMonth || Number.isNaN(year)) {
    elements.monthPreview.classList.add("d-none")
    elements.monthPreview.textContent = ""
    return
  }

  const month = months.find((item) => item.value === selectedMonth)
  const dayCount = getDaysInMonth(Number.parseInt(selectedMonth, 10), year)

  elements.monthPreview.classList.remove("d-none")
  elements.monthPreview.innerHTML = `
    <strong>${month.name} ${year}</strong>
    ${dayCount} total days. Weekdays only, tab-separated for Excel.
    Schedule pattern: Clock In (~8:00 AM), Lunch Out (~12:00 PM), Lunch Back (~2:00 PM), Clock Out (~6:00 PM).
  `
}

async function handleGenerate(event) {
  event.preventDefault()

  if (!elements.month.value || !elements.year.value || !elements.state.value || !elements.city.value) {
    showToast("Please select a month, year, state, and city.", true)
    return
  }

  const monthNumber = Number.parseInt(elements.month.value, 10)
  const yearNumber = Number.parseInt(elements.year.value, 10)

  if (Number.isNaN(yearNumber) || yearNumber < HOLIDAY_YEAR_MIN || yearNumber > HOLIDAY_YEAR_MAX) {
    showToast(`Please enter a year between ${HOLIDAY_YEAR_MIN} and ${HOLIDAY_YEAR_MAX}.`, true)
    return
  }

  if (!applicableHolidays.length && canLoadHolidays()) {
    await updateHolidayConfig()
  }
  updateActiveHolidayDatesFromInputs()

  scheduleOptions = Array.from({ length: 5 }, (_, index) =>
    generateScheduleOption(index + 1, monthNumber, yearNumber),
  )
  renderResults()
  showToast("Generated 5 schedule options.")
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

  return {
    id: optionNumber,
    rawValues: lines.join("\n"),
    summary: buildSummary(optionNumber, totalWorkMinutes, workDaysCount, weekdayHolidayCount),
  }
}

async function updateHolidayConfig() {
  if (!canLoadHolidays()) {
    applicableHolidays = []
    activeHolidayDates = new Set()
    elements.holidayConfig.classList.add("d-none")
    elements.holidayList.innerHTML = ""
    elements.holidayCount.textContent = "0 holidays"
    return
  }

  const year = Number.parseInt(elements.year.value, 10)
  const month = Number.parseInt(elements.month.value, 10)

  applicableHolidays = await loadApplicableHolidays(
    year,
    month,
    elements.state.value,
    Number(elements.city.value),
  )

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
  elements.holidayConfig.classList.remove("d-none")
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
            <strong>${escapeHtml(holiday.date)} - ${escapeHtml(holiday.names.join(" / "))}</strong>
            <small>${escapeHtml(holiday.scopes.join(", "))}</small>
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

function buildSummary(optionNumber, totalWorkMinutes, workDaysCount, weekdayHolidayCount) {
  const avgDailyMinutes = workDaysCount > 0 ? totalWorkMinutes / workDaysCount : 0
  const totalDecimalHours = minutesToDecimalHours(totalWorkMinutes)
  const avgDecimalHours = minutesToDecimalHours(avgDailyMinutes)
  const rate = getHourlyRate()
  const totalEarnings = totalDecimalHours * rate
  const monthName =
    months.find((item) => item.value === elements.month.value)?.name || "Unknown"

  return {
    title: `Option ${optionNumber}`,
    subtitle: `${monthName} ${elements.year.value}`,
    metrics: [
      ["Total Work Time", `${minutesToHours(totalWorkMinutes)} (${totalDecimalHours}h)`],
      ["Work Days", `${workDaysCount} (${weekdayHolidayCount})`],
      [
        "Average Daily",
        `${minutesToHours(Math.round(avgDailyMinutes))} (${avgDecimalHours}h)`,
      ],
      ...(rate > 0
        ? [
            ["Hourly Rate", `$${rate.toFixed(2)}`, "earnings"],
            ["Total Earnings", `$${totalEarnings.toFixed(2)}`, "earnings"],
          ]
        : []),
    ],
  }
}

function renderResults() {
  elements.results.classList.remove("d-none")
  elements.summaries.innerHTML = scheduleOptions
    .map(
      (option) => `
      <article class="summary-card">
        <div class="summary-card-header">
          <div>
            <h3>${option.summary.title}</h3>
            <p>${option.summary.subtitle}</p>
          </div>
          <button class="btn btn-outline-secondary copy-option-button" type="button" data-option-id="${option.id}">
            <i class="bi bi-clipboard" aria-hidden="true"></i>
            Copy
          </button>
        </div>
        <div class="summary">
          ${option.summary.metrics
            .map(
              ([label, value, className]) => `
                <div class="summary-metric ${className || ""}">
                  <span>${label}</span>
                  <strong>${value}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </article>
    `,
    )
    .join("")
}

function handleSummaryAction(event) {
  const button = event.target.closest(".copy-option-button")
  if (!button) return

  const option = scheduleOptions.find((item) => item.id === Number(button.dataset.optionId))
  if (option) {
    copyToClipboard(option.rawValues, option.summary.title)
  }
}

async function copyToClipboard(values, title) {
  if (!values) return

  try {
    await navigator.clipboard.writeText(values)
    showToast(`${title} copied. Ready to paste into Excel.`)
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = values
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.append(textarea)
    textarea.select()
    document.execCommand("copy")
    textarea.remove()
    showToast(`${title} copied.`)
  }
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

init()
