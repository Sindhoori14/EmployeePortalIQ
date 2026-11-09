import type { AttendanceConfig } from '../../common/work-calendar.service';
import { minutesOfDay, tzShift } from '../../common/time';
import type { Cell, Sheet } from '../../common/xlsx';

export type DayState = 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT' | 'LEAVE' | 'NOT_IN' | 'ABSENT' | 'OFF';
export type StoredStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE';

export const ATTENDANCE_ROLES = ['ADMIN', 'HR_MANAGER', 'HR_SUPPORT', 'TEAM_LEAD', 'COORDINATOR', 'EMPLOYEE'] as const;
export type AttendanceRole = (typeof ATTENDANCE_ROLES)[number];

export const ATTENDANCE_ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  HR_MANAGER: 'HR Manager',
  HR_SUPPORT: 'HR Support',
  TEAM_LEAD: 'Team Lead',
  COORDINATOR: 'Coordinator',
  EMPLOYEE: 'Employee',
};

export const BREAK_LABEL: Record<string, string> = { LUNCH: 'Lunch', TEA: 'Tea / coffee', PERSONAL: 'Personal', OTHER: 'Other' };

export interface BreakSpan { startAt: Date; endAt: Date | null }

const MIN = 60_000;

/** Validates and normalizes an optional role filter query value; returns null if unrecognised. */
export function parseAttendanceRole(role?: string): { role?: AttendanceRole; invalid: boolean } {
  if (!role) return { role: undefined, invalid: false };
  const norm = role.trim().toUpperCase();
  if (!norm || norm === 'ALL') return { role: undefined, invalid: false };
  if ((ATTENDANCE_ROLES as readonly string[]).includes(norm)) {
    return { role: norm as AttendanceRole, invalid: false };
  }
  return { invalid: true };
}

/** Formats all break intervals on a row into a single concise chronological string (e.g. "13:00-13:45 (Lunch, 45m)"). */
export function formatBreakIntervals(
  breaks: Array<{ reason: string; startAt: Date; endAt: Date | null; minutes: number }>,
): string {
  if (!breaks.length) return '';
  return breaks
    .map((b) => {
      const start = tzShift(b.startAt).toISOString().slice(11, 16);
      const end = b.endAt ? tzShift(b.endAt).toISOString().slice(11, 16) : 'now';
      const label = BREAK_LABEL[b.reason] ?? b.reason;
      return `${start}-${end} (${label}, ${b.minutes}m)`;
    })
    .join('; ');
}

/** Serializes a Sheet to RFC-4180 CSV with UTF-8 BOM, formula-injection escaping, and proper date/time formatting. */
export function sheetToCsv(sh: Sheet): string {
  const cell = (c: Cell): string => {
    const style = c && typeof c === 'object' && !(c instanceof Date) ? c.style : undefined;
    let v: any = c && typeof c === 'object' && !(c instanceof Date) ? c.v : c;
    if (v instanceof Date) {
      const iso = v.toISOString();
      if (style === 'date') v = iso.slice(0, 10);
      else if (style === 'time') v = iso.slice(11, 16);
      else v = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`.replace(/^1970-01-01 /, '').replace(/^1899-12-30 /, '');
    }
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [sh.columns.map((c) => cell(c.header.replace('\n', ' '))).join(','), ...sh.rows.map((r) => sh.columns.map((_, i) => cell(r[i])).join(','))].join('\n') + '\n';
}

/** Minutes of break that fall inside [from, to]. Open breaks run until `now`. */
export function breakMinutes(breaks: BreakSpan[], from: Date, to: Date, now: Date): number {
  let total = 0;
  for (const b of breaks) {
    const s = Math.max(b.startAt.getTime(), from.getTime());
    const e = Math.min((b.endAt ?? now).getTime(), to.getTime());
    if (e > s) total += e - s;
  }
  return Math.floor(total / MIN);
}

/** Working time = time between check-in and (check-out | now) minus breaks. Never negative. */
export function workedAndBreak(checkIn: Date, checkOut: Date | null, breaks: BreakSpan[], now: Date) {
  const end = checkOut ?? now;
  const gross = Math.max(0, Math.floor((end.getTime() - checkIn.getTime()) / MIN));
  const br = Math.min(gross, breakMinutes(breaks, checkIn, end, now));
  return { worked: gross - br, breaks: br };
}

/** How many minutes after shift start the person arrived (0 inside the grace window). */
export function lateMinutes(checkIn: Date, cfg: AttendanceConfig): number {
  const m = minutesOfDay(checkIn);
  return m > cfg.shiftStart + cfg.graceMinutes ? m - cfg.shiftStart : 0;
}

/** Stored status. Half-day only applies once the day is finished (checked out), never to someone still working. */
export function statusFor(late: number, finished: boolean, worked: number, cfg: AttendanceConfig): StoredStatus {
  if (finished && worked < cfg.halfDayMinutes) return 'HALF_DAY';
  return late > 0 ? 'LATE' : 'PRESENT';
}

export function stateFor(rec: { status: StoredStatus; checkInAt: Date | null; checkOutAt: Date | null } | null, hasOpenBreak: boolean, isToday: boolean, workingDay: boolean): DayState {
  if (rec?.status === 'ON_LEAVE') return 'LEAVE';
  if (rec?.checkInAt) return rec.checkOutAt ? 'CHECKED_OUT' : hasOpenBreak ? 'ON_BREAK' : 'WORKING';
  if (!workingDay) return 'OFF';
  return isToday ? 'NOT_IN' : 'ABSENT';
}

/** One-letter codes for the Excel day-grid. */
export const GRID_CODE: Record<DayState | 'LATE' | 'HALF', string> = {
  WORKING: 'P', ON_BREAK: 'P', CHECKED_OUT: 'P', LATE: 'L', HALF: 'H', LEAVE: 'LV', NOT_IN: 'A', ABSENT: 'A', OFF: '-',
};

export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
