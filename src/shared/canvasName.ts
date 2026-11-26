// Default name for a new canvas: when it was made, in local time, in the same style
// as my Figma pages ("oct 29, 26 10pm"). Minutes are shown unless it's on the hour.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function timestampName(d = new Date()): string {
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  const hours = d.getHours()
  const h12 = hours % 12 === 0 ? 12 : hours % 12
  const suffix = hours < 12 ? 'am' : 'pm'
  const minutes = d.getMinutes()
  const time = minutes === 0 ? `${h12}${suffix}` : `${h12}:${String(minutes).padStart(2, '0')}${suffix}`
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${yy} ${time}`
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Local calendar date as YYYY-MM-DD (not UTC, so a late-night paste stays on that day). */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Name of a day page, from its YYYY-MM-DD date, in the same style as timestampName: "tue nov 24, 26". */
export function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const yy = String(day.getFullYear() % 100).padStart(2, '0')
  return `${WEEKDAYS[day.getDay()]} ${MONTHS[day.getMonth()]} ${day.getDate()}, ${yy}`
}
