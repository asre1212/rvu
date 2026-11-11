export const SALARY_MODEL = Object.freeze({ base: 520000, threshold: 8000, rate: 63, fridayRVUs: 30, vacationWeeks: 4 });

const isoDate = date => date.toISOString().slice(0, 10);
const utcDate = (year, month, day) => new Date(Date.UTC(year, month, day));
function checkYear(year) {
  if (!Number.isInteger(year) || year < 2021 || year > 2100) throw new Error('Choose a year from 2021 to 2100.');
}
function nthWeekday(year, month, weekday, occurrence) {
  return utcDate(year, month, 1 + (weekday - utcDate(year, month, 1).getUTCDay() + 7) % 7 + 7 * (occurrence - 1));
}
function observed(date) {
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

// Nationwide federal holidays for a Monday–Friday schedule. Include the next
// New Year's Day when its observed Friday falls in this calendar year.
export function federalHolidays(year) {
  checkYear(year);
  const holidays = [];
  for (const y of [year, year + 1]) {
    const memorial = utcDate(y, 4, 31);
    memorial.setUTCDate(31 - (memorial.getUTCDay() + 6) % 7);
    const dates = [
      ["New Year's Day", observed(utcDate(y, 0, 1))],
      ['Martin Luther King Jr. Day', nthWeekday(y, 0, 1, 3)],
      ["Washington's Birthday", nthWeekday(y, 1, 1, 3)],
      ['Memorial Day', memorial],
      ['Juneteenth', observed(utcDate(y, 5, 19))],
      ['Independence Day', observed(utcDate(y, 6, 4))],
      ['Labor Day', nthWeekday(y, 8, 1, 1)],
      ['Columbus Day', nthWeekday(y, 9, 1, 2)],
      ['Veterans Day', observed(utcDate(y, 10, 11))],
      ['Thanksgiving Day', nthWeekday(y, 10, 4, 4)],
      ['Christmas Day', observed(utcDate(y, 11, 25))]
    ];
    for (const [name, date] of dates) if (date.getUTCFullYear() === year) {
      holidays.push({ date: isoDate(date), name: name + (y !== year ? ` ${y} (observed)` : '') });
    }
  }
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export function salaryCalendar(year) {
  const holidays = federalHolidays(year), excluded = new Set(holidays.map(h => h.date));
  let weekdays = 0, averageDays = 0, fridayDays = 0;
  for (const date = utcDate(year, 0, 1); date.getUTCFullYear() === year; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    weekdays++;
    if (excluded.has(isoDate(date))) continue;
    if (day === 5) fridayDays++; else averageDays++;
  }
  // Four additional weeks off: 16 Mon–Thu days + four Fridays. Vacation
  // is separate from holidays, so no holiday consumes a vacation day.
  averageDays -= SALARY_MODEL.vacationWeeks * 4;
  fridayDays -= SALARY_MODEL.vacationWeeks;
  return { year, weekdays, holidays, vacationDays: SALARY_MODEL.vacationWeeks * 5, averageDays, fridayDays, workdays: averageDays + fridayDays };
}

export function annualSalary(averageRVUs, year) {
  const calendar = salaryCalendar(year);
  const available = typeof averageRVUs === 'number' && Number.isFinite(averageRVUs) && averageRVUs >= 0;
  const fridayRVUs = calendar.fridayDays * SALARY_MODEL.fridayRVUs;
  const regularRVUs = available ? calendar.averageDays * averageRVUs : null;
  const annualRVUs = available ? regularRVUs + fridayRVUs : null;
  const excessRVUs = available ? Math.max(0, annualRVUs - SALARY_MODEL.threshold) : null;
  const bonus = available ? excessRVUs * SALARY_MODEL.rate : null;
  return { calendar, averageRVUs: available ? averageRVUs : null, regularRVUs, fridayRVUs, annualRVUs, excessRVUs, bonus, salary: available ? SALARY_MODEL.base + bonus : null };
}
