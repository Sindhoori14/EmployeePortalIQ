'use client';
import { useEffect, useState } from 'react';
import { api, fmtDate } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, PageHeader, Stat } from '../../../components/ui';

interface LogItem {
  id: string;
  employeeId: string;
  employeeName: string;
  email: string;
  team: string;
  action: 'LOGIN' | 'LOGOUT';
  timestamp: string;
  time: string;
  date: string;
  ip: string | null;
  isLate: boolean;
}

interface UserItem {
  id: string;
  displayName: string;
  email: string;
  role: string;
  team: string;
  lastLoginAt: string | null;
}

interface LoginActivityResponse {
  shiftStart: string;
  users: UserItem[];
  logs: LogItem[];
}

export default function HrManagerLoginActivityPage() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);

  const [data, setData] = useState<LoginActivityResponse | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadData = () => {
    setLoadingData(true);
    const params = new URLSearchParams();
    if (dateFilter) params.set('date', dateFilter);

    api<LoginActivityResponse>(`/recruitment/login-activity?${params.toString()}`)
      .then((res) => {
        setData(res);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (user) loadData();
  }, [user, dateFilter]);

  if (loading || !user) return <Loading />;

  const logs = (data?.logs || []).filter((l) => {
    if (actionFilter && l.action !== actionFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      if (!l.employeeName.toLowerCase().includes(term) && !l.email.toLowerCase().includes(term)) {
        return false;
      }
    }
    return true;
  });

  const totalLogins = (data?.logs || []).filter((l) => l.action === 'LOGIN').length;
  const lateLogins = (data?.logs || []).filter((l) => l.isLate).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Login Activity"
        sub="Organization-wide visibility into employee authentication sessions, shift timing and punctuality audit."
      >
        <button onClick={loadData} className="btn-secondary text-xs">
          🔄 Refresh Log
        </button>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Tracked Employees" value={data?.users.length ?? 0} tone="brand" />
        <Stat label="Recorded Logins (Period)" value={totalLogins} tone="default" />
        <Stat label="Late Logins (> Shift Start)" value={lateLogins} tone="warn" hint={`Shift: ${data?.shiftStart || '09:30'}`} />
        <Stat
          label="Active Users Today"
          value={
            data?.users.filter(
              (u) => u.lastLoginAt && u.lastLoginAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
            ).length ?? 0
          }
          tone="success"
        />
      </div>

      {/* Filter bar */}
      <div className="card !p-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Filter by Date
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="input text-xs"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Action Type
          </label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input text-xs"
          >
            <option value="">All Events (Login & Logout)</option>
            <option value="LOGIN">Logins Only</option>
            <option value="LOGOUT">Logouts Only</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
            Search Employee
          </label>
          <input
            type="text"
            placeholder="Search name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-xs w-full"
          />
        </div>

        {dateFilter && (
          <div className="self-end">
            <button onClick={() => setDateFilter('')} className="btn-ghost text-xs text-brand-600 font-semibold">
              Clear Date
            </button>
          </div>
        )}
      </div>

      {/* Activity Logs Table */}
      <div className="card overflow-hidden !p-0">
        <div className="p-4 border-b bg-slate-50/60 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900">Authentication Audit Trail</h3>
          <span className="text-xs text-slate-500">Configured Shift Start: <strong>{data?.shiftStart || '09:30'}</strong></span>
        </div>

        {loadingData ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading login audit trail...</div>
        ) : logs.length === 0 ? (
          <Empty icon="🔐" title="No Login Activity Found" sub="No login or logout records found for this selection." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Shift Timing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-4">
                      <p className="font-bold text-ink-900">{log.employeeName}</p>
                      <p className="text-[10px] text-slate-400">{log.email}</p>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-medium">{log.team}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          log.action === 'LOGIN'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {log.action === 'LOGIN' ? '🟢 Sign In' : '⚪ Sign Out'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">
                      <span>{log.date}</span> <span className="font-bold text-ink-900">{log.time}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">{log.ip || '—'}</td>
                    <td className="py-2.5 px-4">
                      {log.action === 'LOGIN' ? (
                        log.isLate ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                            ⚠️ Late Login
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            ✓ On Time
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400 text-[10px]">Session Closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users Summary Table */}
      <div className="card overflow-hidden !p-0">
        <div className="p-4 border-b bg-slate-50/60">
          <h3 className="text-sm font-bold text-ink-900">Employee Accounts & Last Login Overview</h3>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold sticky top-0">
                <th className="py-2.5 px-4">Employee</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Team</th>
                <th className="py-2.5 px-4">Last Recorded Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.users || []).map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-4">
                    <span className="font-semibold text-ink-900">{u.displayName}</span>
                    <span className="text-slate-400 ml-1.5">({u.email})</span>
                  </td>
                  <td className="py-2 px-4 text-slate-500">{u.role}</td>
                  <td className="py-2 px-4 text-slate-600">{u.team}</td>
                  <td className="py-2 px-4 font-mono text-slate-700">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never logged in'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
