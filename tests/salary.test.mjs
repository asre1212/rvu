import test from 'node:test';
import assert from 'node:assert/strict';
import { annualSalary, federalHolidays, salaryCalendar } from '../dist/salary.js';
import { summarize, summarizeCMSStyle } from '../dist/engine.js';

test('2027 matches OPM and GSA including the next New Year observed on Dec 31', () => {
  assert.deepEqual(federalHolidays(2027).map(h => h.date), [
    '2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-07-05',
    '2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24','2027-12-31'
  ]);
  const c = salaryCalendar(2027);
  assert.equal(c.weekdays, 261);
  assert.equal(c.vacationDays, 20);
  assert.equal(c.averageDays, 184);
  assert.equal(c.fridayDays, 45);
  assert.equal(c.workdays, 229);
});

test('holidays are charged only in their observed calendar year; leap years count exact weekdays', () => {
  const c = salaryCalendar(2028);
  assert.equal(c.weekdays, 260);
  assert.equal(c.holidays.length, 10);
  assert.equal(c.workdays, 230);
  assert.equal(c.averageDays, 183);
  assert.equal(c.fridayDays, 47);
  assert.ok(!c.holidays.some(h => h.name.startsWith('New Year')));
  const year2026 = salaryCalendar(2026);
  assert.equal(year2026.weekdays, 261);
  assert.equal(year2026.holidays.length, 11);
  assert.equal(year2026.averageDays, 185);
  assert.equal(year2026.fridayDays, 45);
});

test('all supported years exclude weekends and deduct 20 additional vacation days', () => {
  for (let year = 2021; year <= 2100; year++) {
    const c = salaryCalendar(year);
    assert.equal(c.workdays, c.weekdays - c.holidays.length - 20);
    assert.equal(new Set(c.holidays.map(h => h.date)).size, c.holidays.length);
    for (const h of c.holidays) {
      const d = new Date(h.date + 'T00:00:00Z');
      assert.equal(d.getUTCFullYear(), year);
      assert.ok(d.getUTCDay() >= 1 && d.getUTCDay() <= 5);
    }
  }
});

test('50 RVUs per average day produces 10,550 annual RVUs and $680,650 salary', () => {
  const p = annualSalary(50, 2027);
  assert.equal(p.regularRVUs, 9200);
  assert.equal(p.fridayRVUs, 1350);
  assert.equal(p.annualRVUs, 10550);
  assert.equal(p.excessRVUs, 2550);
  assert.equal(p.bonus, 160650);
  assert.equal(p.salary, 680650);
});

test('incentive starts strictly above the threshold without reducing the base', () => {
  const atThreshold = (8000 - 1350) / 184;
  assert.equal(annualSalary(atThreshold, 2027).salary, 520000);
  assert.equal(annualSalary(30, 2027).salary, 520000);
  assert.equal(annualSalary(0, 2027).salary, 520000);
  const above = annualSalary((8001 - 1350) / 184, 2027);
  assert.equal(above.salary, 520063);
});

test('missing or invalid averages do not fabricate a salary; invalid years are rejected', () => {
  for (const average of [null, undefined, NaN, Infinity, -1, '50']) {
    const p = annualSalary(average, 2027);
    assert.equal(p.annualRVUs, null);
    assert.equal(p.bonus, null);
    assert.equal(p.salary, null);
    assert.equal(p.calendar.workdays, 229);
  }
  for (const year of [2020, 2101, 2027.5, NaN, '2027']) assert.throws(() => salaryCalendar(year));
});

test('each scenario uses its own unrounded daily average; the Friday credit stays 30', () => {
  const entries = [
    {date:'2026-11-02',type:'colon',lower:['snare','forceps'],upper:[],quantity:10},
    {date:'2026-11-03',type:'colon',lower:[],upper:[],quantity:10},
    {date:'2026-11-04',type:'egd',lower:[],upper:[],quantity:10}
  ];
  const fullSummary = summarize(entries), cmsSummary = summarizeCMSStyle(entries);
  const full = annualSalary(fullSummary.averageUnits / 10000, 2027);
  const cms = annualSalary(cmsSummary.averageUnits / 10000, 2027);
  assert.ok(Math.abs(full.annualRVUs - (131.5 / 3 * 184 + 1350)) < 1e-9);
  assert.ok(Math.abs(cms.annualRVUs - (99.7 / 3 * 184 + 1350)) < 1e-9);
  assert.ok(Math.abs(full.salary - 609166) < 1e-8);
  assert.equal(cms.salary, 520000);
  assert.equal(full.fridayRVUs, cms.fridayRVUs);
  assert.notEqual(full.annualRVUs, annualSalary(Number((fullSummary.averageUnits / 10000).toFixed(2)), 2027).annualRVUs);
});
