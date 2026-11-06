'use client';
import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, PageHeader, Stat } from '../../../components/ui';

interface AttendanceRow {
  userId: string;
  name: string;
  email: string;
  team: string | null;
  state: 'WORKING' | 'ON_BREAK' | 'CHECKED_OUT' | 'LEAVE' | 'NOT_IN' | 'ABSENT' | 'OFF';
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  breakMinutes: number;
  late: boolean;
  lateMinutes: number;
  halfDay: boolean;
  mode: string;
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

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterState, setFilterState] = useState('');
  const [search, setSearch] = useState('');

  const loadBoard = () => {
    setLoadingData(true);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (filterTeam) params.set('teamId', filterTeam);

    api<BoardResponse>(`/attendance/board?${params.toString()}`)
      .then((res) => {
        setBoard(res);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (user) loadBoard();
  }, [user, date, filterTeam]);

  const handleExport = () => {
    const params = new URLSearchParams({
      type: 'day',
      date,
      format: 'csv',
    });
    if (filterTeam) params.set('teamId', filterTeam);
    downloadFile(`/attendance/export?${params.toString()}`, `attendance_${date}.csv`).catch(
      (e) => alert(e.message),
    );
  };

  if (loading || !user) return <Loading />;

  const rows = (board?.rows || []).filter((r) => {
    if (filterState && r.state !== filterState) return false;
    if (search) {
      const term = search.toLowerCase();
      if (!r.name.toLowerCase().includes(term) && !r.email.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  const summary = board?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Attendance"
        sub="Organization-wide employee attendance records, working hours and punctuality oversight."
      >
        <button onClick={handleExport} className="btn-secondary text-xs">
          📥 Export Attendance (CSV)
        </button>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Date & Filter Controls */}
      <div className="card !p-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Attendance Date
          </label>
          <input
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input text-xs"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Status Filter
          </label>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="input text-xs"
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
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-xs w-full"
          />
        </div>

        <div className="self-end">
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
          <Empty icon="🕒" title="No Attendance Records" sub="No employee records found for this date." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-3">Employee</th>
                  <th className="py-3 px-3">Team</th>
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
                  const checkInTime = r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                  const checkOutTime = r.checkOutAt ? new Date(r.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                  const workedHours = `${Math.floor(r.workedMinutes / 60)}h ${r.workedMinutes % 60}m`;
                  const breakHours = `${r.breakMinutes}m`;

                  return (
                    <tr key={r.userId} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-ink-900">{r.name}</p>
                        <p className="text-[10px] text-slate-400">{r.email}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">{r.team || '—'}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{checkInTime}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{checkOutTime}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-ink-900">{r.workedMinutes > 0 ? workedHours : '—'}</td>
                      <td className="py-2.5 px-3 text-center text-slate-500">{r.breakMinutes > 0 ? breakHours : '—'}</td>
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
                          {r.state}
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
