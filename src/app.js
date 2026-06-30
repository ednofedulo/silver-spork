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

const elements = {
  form: document.querySelector("#scheduleForm"),
  month: document.querySelector("#month"),
  monthPills: document.querySelector("#monthPills"),
  year: document.querySelector("#year"),
  hourlyRate: document.querySelector("#hourlyRate"),
  monthPreview: document.querySelector("#monthPreview"),
  results: document.querySelector("#results"),
  summary: document.querySelector("#summary"),
  timeEntries: document.querySelector("#timeEntries"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
  toast: document.querySelector("#toast"),
}

let generatedTimes = ""
let workSummary = null
let toastTimer = null
let hourlyRateCents = 0

function init() {
  populateMonths()
  selectMonth(new Date().getMonth() + 1)
  elements.year.value = new Date().getFullYear().toString()
  loadHourlyRate()
  updateMonthPreview()

  elements.form.addEventListener("submit", handleGenerate)
  elements.year.addEventListener("input", updateMonthPreview)
  elements.hourlyRate.addEventListener("input", handleHourlyRateInput)
  elements.copyButton.addEventListener("click", copyToClipboard)
  elements.downloadButton.addEventListener("click", downloadAsFile)
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

function generateWorkDay() {
  const clockIn = formatTime(8, 15 + Math.floor(Math.random() * 31))

  let lunchOutHour = 11
  let lunchOutMinute = 45 + Math.floor(Math.random() * 31)
  if (lunchOutMinute >= 60) {
    lunchOutHour = 12
    lunchOutMinute -= 60
  }
  const lunchOut = formatTime(lunchOutHour, lunchOutMinute)

  let lunchBackHour = 13
  let lunchBackMinute = 45 + Math.floor(Math.random() * 31)
  if (lunchBackMinute >= 60) {
    lunchBackHour = 14
    lunchBackMinute -= 60
  }
  const lunchBack = formatTime(lunchBackHour, lunchBackMinute)

  const targetWorkMinutes = 474 + Math.floor(Math.random() * 7)
  const morningWork = timeToMinutes(lunchOut) - timeToMinutes(clockIn)
  const neededAfternoonWork = targetWorkMinutes - morningWork
  const clockOutMinutes = timeToMinutes(lunchBack) + neededAfternoonWork

  let clockOutHour = Math.floor(clockOutMinutes / 60)
  let clockOutMinute = clockOutMinutes % 60

  if (clockOutHour === 18 && clockOutMinute === 0) {
    const adjustment = -5 + Math.floor(Math.random() * 16)
    const adjustedMinutes = clockOutMinutes + adjustment
    clockOutHour = Math.floor(adjustedMinutes / 60)
    clockOutMinute = adjustedMinutes % 60
  }

  const clockOut = formatTime(clockOutHour, clockOutMinute)
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
    Schedule pattern: Clock In (~8:30 AM), Lunch Out (~12:00 PM), Lunch Back (~2:00 PM), Clock Out (7.9-8h daily).
  `
}

function handleGenerate(event) {
  event.preventDefault()

  if (!elements.month.value || !elements.year.value) {
    showToast("Please select a month and enter a year.", true)
    return
  }

  const monthNumber = Number.parseInt(elements.month.value, 10)
  const yearNumber = Number.parseInt(elements.year.value, 10)

  if (Number.isNaN(yearNumber) || yearNumber < 1900 || yearNumber > 2100) {
    showToast("Please enter a year between 1900 and 2100.", true)
    return
  }

  const daysInMonth = getDaysInMonth(monthNumber, yearNumber)
  const lines = []
  let totalWorkMinutes = 0
  let workDaysCount = 0

  for (let day = 1; day <= daysInMonth; day += 1) {
    const currentDate = new Date(yearNumber, monthNumber - 1, day)
    const dayOfWeek = currentDate.getDay()

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const workDay = generateWorkDay()
      lines.push(workDay.times.join("\t"))
      totalWorkMinutes += workDay.totalMinutes
      workDaysCount += 1
    } else {
      lines.push("")
    }
  }

  generatedTimes = lines.join("\n")
  workSummary = buildSummary(totalWorkMinutes, workDaysCount)
  renderResults()
  showToast("Work schedule generated.")
}

function buildSummary(totalWorkMinutes, workDaysCount) {
  const avgDailyMinutes = workDaysCount > 0 ? totalWorkMinutes / workDaysCount : 0
  const totalDecimalHours = minutesToDecimalHours(totalWorkMinutes)
  const avgDecimalHours = minutesToDecimalHours(avgDailyMinutes)
  const rate = getHourlyRate()
  const totalEarnings = totalDecimalHours * rate
  const monthName =
    months.find((item) => item.value === elements.month.value)?.name || "Unknown"

  return {
    title: `${monthName} ${elements.year.value} - Work Summary`,
    metrics: [
      ["Total Work Time", `${minutesToHours(totalWorkMinutes)} (${totalDecimalHours}h)`],
      ["Work Days", workDaysCount.toString()],
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
  elements.timeEntries.value = generatedTimes
  elements.summary.innerHTML = `
    <div class="summary-title">${workSummary.title}</div>
    ${workSummary.metrics
      .map(
        ([label, value, className]) => `
          <div class="summary-metric ${className || ""}">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `,
      )
      .join("")}
  `
}

async function copyToClipboard() {
  if (!generatedTimes) return

  try {
    await navigator.clipboard.writeText(generatedTimes)
    showToast("Work schedule copied. Ready to paste into Excel.")
  } catch {
    elements.timeEntries.select()
    document.execCommand("copy")
    showToast("Work schedule copied.")
  }
}

function downloadAsFile() {
  if (!generatedTimes || !workSummary) return

  const monthName =
    months.find((item) => item.value === elements.month.value)?.name || "Unknown"
  const summaryText = [
    workSummary.title,
    "",
    ...workSummary.metrics.map(([label, value]) => `${label}: ${value}`),
  ].join("\n")
  const content = `${summaryText}\n\n--- Raw Time Data ---\n${generatedTimes}`
  const blob = new Blob([content], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = `work-schedule-${monthName}-${elements.year.value}.txt`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
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
