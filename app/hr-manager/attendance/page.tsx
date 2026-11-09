'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, downloadFile, ROLE_LABEL } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, PageHeader, Stat } from '../../../components/ui';
import { fmtDur, fmtTime, STATE_LABEL } from '../../../lib/attendance';

const ROLE_OPTIONS = ['ADMIN', 'HR_MANAGER', 'HR_SUPPORT', 'TEAM_LEAD', 'COORDINATOR', 'EMPLOYEE'] as const;
const todayStr = () => new Intl.DateTimeFormat('en-CA').format(new Date());

interface AttendanceRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  teamId: string | null;
  teamName: string | null;
  batchName: string | null;
  state: 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT' | 'LEAVE' | 'NOT_IN' | 'ABSENT' | 'OFF';
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  breakMinutes: number;
  late: boolean;
  lateMinutes: number;
  halfDay: boolean;
  mode: string | null;
}

interface BoardResponse {
  date: string;
  workingDay: boolean;
  config: { shiftStart: number; shiftEnd: number; maxBreakMinutes: number };
  summary: {
    total: number;
    working: number;
    onBreak: number;
    checkedOut: number;
    leave: number;
    notIn: number;
    absent: number;
    present: number;
    onTime: number;
    late: number;
  };
  rows: AttendanceRow[];
}

export default function HrManagerAttendancePage() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);

  const [date, setDate] = useState(() => todayStr());
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterState, setFilterState] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    api<{ id: string; name: string }[]>('/teams').then(setTeams).catch(() => {});
    api<{ id: string; name: string }[]>('/batches').then(setBatches).catch(() => {});
  }, [user]);

  const loadBoard = useCallback(() => {
    setLoadingData(true);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (filterTeam) params.set('teamId', filterTeam);
    if (filterBatch) params.set('batchId', filterBatch);
    if (filterRole) params.set('role', filterRole);

    api<BoardResponse>(`/attendance/board?${params.toString()}`)
      .then((res) => {
        setBoard(res);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  }, [date, filterTeam, filterBatch, filterRole]);

  useEffect(() => {
    if (user) loadBoard();
  }, [user, loadBoard]);

  const handleExport = (type: 'day' | 'month', format: 'xlsx' | 'csv') => {
    const params = new URLSearchParams({
      type,
      format,
      ...(type === 'day' ? { date } : { month: date.slice(0, 7) }),
    });
    if (filterTeam) params.set('teamId', filterTeam);
    if (filterBatch) params.set('batchId', filterBatch);
    if (filterRole) params.set('role', filterRole);
    const fname = type === 'day' ? `attendance_${date}.${format}` : `attendance_${date.slice(0, 7)}.${format}`;
    downloadFile(`/attendance/export?${params.toString()}`, fname).catch((e) => alert(e.message));
  };

  if (loading || !user) return <Loading />;

  const rows = (board?.rows || []).filter((r) => {
    if (filterState && r.state !== filterState) return false;
    if (search) {
      const term = search.toLowerCase();
      if (
        !r.name.toLowerCase().includes(term)
        && !r.email.toLowerCase().includes(term)
        && !(r.teamName ?? '').toLowerCase().includes(term)
        && !(ROLE_LABEL[r.role] ?? r.role).toLowerCase().includes(term)
      ) {
        return false;
      }
    }
    return true;
  });

  const summary = board?.summary;
  const hasFilters = Boolean(filterRole || filterTeam || filterBatch || filterState || search);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Attendance"
        sub="Organization-wide employee attendance records, working hours, role/team filtering, and report exports."
      >
        <button onClick={() => handleExport('day', 'xlsx')} className="btn-secondary text-xs">
          ⬇ Daily Excel
        </button>
        <button onClick={() => handleExport('day', 'csv')} className="btn-secondary text-xs">
          ⬇ Daily CSV
        </button>
        <button onClick={() => handleExport('month', 'xlsx')} className="btn-secondary text-xs">
          🗓️ Monthly Excel
        </button>
        <Link href="/attendance?tab=export" className="btn text-xs">
          All Reports →
        </Link>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Date & Filter Controls */}
      <div className="card !p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Attendance Date
          </label>
          <input
            type="date"
            max={todayStr()}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="input text-xs"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Role Filter
          </label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input text-xs"
            aria-label="Filter by role"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Team Filter
          </label>
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="input text-xs"
            aria-label="Filter by team"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">No Team</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Batch / Group
          </label>
          <select
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            className="input text-xs"
            aria-label="Filter by batch"
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="none">No Batch</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Status Filter
          </label>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="input text-xs"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="WORKING">Working</option>
            <option value="ON_BREAK">On Break</option>
            <option value="CHECKED_OUT">Checked Out</option>
            <option value="LEAVE">On Leave</option>
            <option value="NOT_IN">Not In Yet</option>
            <option value="ABSENT">Absent</option>
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Search Employee
          </label>
          <input
            type="text"
            placeholder="Search by name, role, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterRole('');
                setFilterTeam('');
                setFilterBatch('');
                setFilterState('');
                setSearch('');
              }}
              className="btn-ghost text-xs"
            >
              Reset
            </button>
          )}
          <button onClick={loadBoard} className="btn-secondary text-xs">
            Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total Employees" value={summary.total} tone="default" />
          <Stat label="Present" value={summary.present} tone="brand" />
          <Stat label="Currently Working" value={summary.working} tone="success" />
          <Stat label="Late Check-ins" value={summary.late} tone="warn" />
          <Stat label="On Leave" value={summary.leave} tone="brand" />
          <Stat label="Absent / Not In" value={summary.absent + summary.notIn} tone="danger" />
        </div>
      )}

      {/* Attendance Table */}
      <div className="card overflow-hidden !p-0">
        {loadingData ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading attendance data...</div>
        ) : rows.length === 0 ? (
          <Empty icon="🕒" title="No Attendance Records" sub="No employee records match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Team / Group</th>
                  <th className="py-3 px-3">Check-In</th>
                  <th className="py-3 px-3">Check-Out</th>
                  <th className="py-3 px-3 text-center">Worked Hours</th>
                  <th className="py-3 px-3 text-center">Break</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Punctuality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const checkInTime = r.checkInAt ? fmtTime(r.checkInAt) : '—';
                  const checkOutTime = r.checkOutAt ? fmtTime(r.checkOutAt) : '—';
                  const workedHours = r.workedMinutes > 0 ? fmtDur(r.workedMinutes) : '—';
                  const breakHours = r.breakMinutes > 0 ? fmtDur(r.breakMinutes) : '—';

                  return (
                    <tr key={r.userId} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-ink-900">{r.name}</p>
                        <p className="text-[10px] text-slate-400">{r.email}</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {ROLE_LABEL[r.role] ?? r.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        {r.teamName || '—'}
                        {r.batchName && <span className="block text-[10px] text-slate-400">{r.batchName}</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{checkInTime}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{checkOutTime}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-ink-900">{workedHours}</td>
                      <td className="py-2.5 px-3 text-center text-slate-500">{breakHours}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            r.state === 'WORKING'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.state === 'ON_BREAK'
                              ? 'bg-amber-50 text-amber-700'
                              : r.state === 'CHECKED_OUT'
                              ? 'bg-blue-50 text-blue-700'
                              : r.state === 'LEAVE'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {STATE_LABEL[r.state] ?? r.state}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {r.late ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 rounded px-2 py-0.5">
                            ⚠️ Late ({r.lateMinutes}m)
                          </span>
                        ) : r.checkInAt ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded px-2 py-0.5">
                            ✓ On Time
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
