import {
  breakMinutes,
  fmtMinutes,
  formatBreakIntervals,
  lateMinutes,
  parseAttendanceRole,
  sheetToCsv,
  stateFor,
  statusFor,
  workedAndBreak,
} from './attendance.logic';
import { dayToDate, tzShift } from '../../common/time';

process.env.APP_TZ = 'Asia/Kolkata';
const cfg = { shiftStart: 9 * 60 + 30, shiftEnd: 18 * 60 + 30, autoCheckout: 23 * 60 + 30, graceMinutes: 15, halfDayMinutes: 240, maxBreakMinutes: 60, maxSingleBreakMinutes: 45 };
// 2026-10-05 in Asia/Kolkata is UTC+5:30, so 09:40 IST = 04:10 UTC
const ist = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+05:30`);

describe('attendance rules', () => {
  it('inside the grace window is on time; after it is late by minutes since shift start', () => {
    expect(lateMinutes(ist('09:44'), cfg)).toBe(0);
    expect(lateMinutes(ist('09:45'), cfg)).toBe(0);
    expect(lateMinutes(ist('09:46'), cfg)).toBe(16);
    expect(lateMinutes(ist('11:00'), cfg)).toBe(90);
  });

  it('subtracts breaks from working time and counts an open break until now', () => {
    const breaks = [
      { startAt: ist('13:00'), endAt: ist('13:45') },
      { startAt: ist('16:00'), endAt: null },
    ];
    const r = workedAndBreak(ist('09:30'), null, breaks, ist('16:30'));
    expect(r.breaks).toBe(45 + 30);
    expect(r.worked).toBe(7 * 60 - 75);
  });

  it('clips breaks to the working window and never returns negative time', () => {
    expect(breakMinutes([{ startAt: ist('08:00'), endAt: ist('10:00') }], ist('09:30'), ist('18:00'), ist('18:00'))).toBe(30);
    expect(workedAndBreak(ist('10:00'), ist('10:00'), [], ist('12:00'))).toEqual({ worked: 0, breaks: 0 });
  });

  it('half day only after checkout with too little work; still-working people are never half-day', () => {
    expect(statusFor(0, false, 30, cfg)).toBe('PRESENT');
    expect(statusFor(20, false, 30, cfg)).toBe('LATE');
    expect(statusFor(0, true, 239, cfg)).toBe('HALF_DAY');
    expect(statusFor(0, true, 240, cfg)).toBe('PRESENT');
    expect(statusFor(30, true, 480, cfg)).toBe('LATE');
  });

  it('derives the right state for the board', () => {
    const rec = (over: any) => ({ status: 'PRESENT' as const, checkInAt: ist('09:30'), checkOutAt: null, ...over });
    expect(stateFor(rec({}), false, true, true)).toBe('WORKING');
    expect(stateFor(rec({}), true, true, true)).toBe('ON_BREAK');
    expect(stateFor(rec({ checkOutAt: ist('18:00') }), false, false, true)).toBe('CHECKED_OUT');
    expect(stateFor(rec({ status: 'ON_LEAVE', checkInAt: null }), false, false, true)).toBe('LEAVE');
    expect(stateFor(null, false, true, true)).toBe('NOT_IN');
    expect(stateFor(null, false, false, true)).toBe('ABSENT');
    expect(stateFor(null, false, false, false)).toBe('OFF');
  });

  it('formats durations', () => {
    expect(fmtMinutes(45)).toBe('45m');
    expect(fmtMinutes(125)).toBe('2h 05m');
  });

  it('validates attendance role filters safely', () => {
    expect(parseAttendanceRole(undefined)).toEqual({ role: undefined, invalid: false });
    expect(parseAttendanceRole('all')).toEqual({ role: undefined, invalid: false });
    expect(parseAttendanceRole('hr_manager')).toEqual({ role: 'HR_MANAGER', invalid: false });
    expect(parseAttendanceRole('HR_SUPPORT')).toEqual({ role: 'HR_SUPPORT', invalid: false });
    expect(parseAttendanceRole('TEAM_LEAD')).toEqual({ role: 'TEAM_LEAD', invalid: false });
    expect(parseAttendanceRole('PROJECT_LEAD')).toEqual({ invalid: true });
    expect(parseAttendanceRole('INVALID_ROLE')).toEqual({ invalid: true });
  });

  it('formats break intervals chronologically in IST', () => {
    expect(formatBreakIntervals([])).toBe('');
    expect(
      formatBreakIntervals([
        { reason: 'LUNCH', startAt: ist('13:00'), endAt: ist('13:45'), minutes: 45 },
        { reason: 'TEA', startAt: ist('16:00'), endAt: null, minutes: 10 },
      ]),
    ).toBe('13:00-13:45 (Lunch, 45m); 16:00-now (Tea / coffee, 10m)');
  });

  it('serializes CSV dates as YYYY-MM-DD, times as HH:MM, and escapes formulas', () => {
    const csv = sheetToCsv({
      name: 'Daily',
      columns: [{ header: 'Date' }, { header: 'Check-in' }, { header: 'Note' }],
      rows: [
        [
          { v: dayToDate('2026-10-05') as any, style: 'date' },
          { v: tzShift(ist('09:30')) as any, style: 'time' },
          '=SUM(A1:A2)',
        ],
      ],
    });
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');
    expect(lines[0]).toBe('Date,Check-in,Note');
    expect(lines[1]).toBe("2026-10-05,09:30,'=SUM(A1:A2)");
  });
});
