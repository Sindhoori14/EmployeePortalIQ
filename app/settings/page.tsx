'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, ROLE_LABEL } from '../../lib/api';
import { Loading, PageHeader } from '../../components/ui';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { useAuth, useRequireAuth } from '../../lib/auth-context';

const DAYS = [
  { n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 0, l: 'Sun' },
];

interface SessionItem {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface CommonUserPreferences {
  notifications: {
    dailyReportReminder: boolean;
    taskAssigned: boolean;
    taskComment: boolean;
    announcements: boolean;
    leaveStatus: boolean;
  };
  work: {
    dateFormat: string;
    timeZone: string;
    workingHoursDisplay: string;
  };
  appearance: {
    theme: string;
    viewDensity: string;
  };
}

const DEFAULT_PREFERENCES: CommonUserPreferences = {
  notifications: {
    dailyReportReminder: true,
    taskAssigned: true,
    taskComment: true,
    announcements: true,
    leaveStatus: true,
  },
  work: {
    dateFormat: 'DD/MM/YYYY',
    timeZone: 'Asia/Kolkata',
    workingHoursDisplay: '12h',
  },
  appearance: {
    theme: 'light',
    viewDensity: 'comfortable',
  },
};

export default function SettingsPage() {
  const { user, loading } = useRequireAuth([
    'ADMIN',
    'TEAM_LEAD',
    'COORDINATOR',
    'EMPLOYEE',
    'HR_MANAGER',
    'HR_SUPPORT',
  ]);
  const { logout } = useAuth();
  const router = useRouter();

  // Redirect HR roles to their dedicated role-specific settings pages
  useEffect(() => {
    if (!user) return;
    if (user.role === 'HR_MANAGER') {
      router.replace('/hr-manager/settings');
    } else if (user.role === 'HR_SUPPORT') {
      router.replace('/hr-support/settings');
    }
  }, [user, router]);

  const isAdmin = user?.role === 'ADMIN';

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'company' | 'security' | 'notifications' | 'work' | 'sessions'
  >('security');
  const initTab = useRef(false);
  useEffect(() => {
    if (user && !initTab.current) {
      initTab.current = true;
      if (user.role === 'ADMIN') setActiveTab('company');
    }
  }, [user]);

  // --- ADMIN COMPANY SETTINGS STATE ---
  const [time, setTime] = useState('18:00');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState('');
  const [att, setAtt] = useState({
    shiftStart: '09:30',
    shiftEnd: '18:30',
    autoCheckout: '23:30',
    graceMinutes: 15,
    halfDayMinutes: 240,
    maxBreakMinutes: 60,
    maxSingleBreakMinutes: 45,
  });
  const [photo, setPhoto] = useState(true);
  const [gate, setGate] = useState<{ enabled: boolean; roles: string[] }>({
    enabled: true,
    roles: ['EMPLOYEE', 'COORDINATOR', 'TEAM_LEAD'],
  });
  const [sys, setSys] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // --- USER SESSIONS STATE ---
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionMsg, setSessionMsg] = useState('');

  // --- USER PREFERENCES STATE ---
  const [prefs, setPrefs] = useState<CommonUserPreferences>(DEFAULT_PREFERENCES);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  // Load Admin Settings
  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    api<{ key: string; value: any }[]>('/settings')
      .then((rows) => {
        const g = (k: string) => rows.find((r) => r.key === k)?.value;
        if (g('reportDeadline')?.time) setTime(String(g('reportDeadline').time));
        if (Array.isArray(g('workDays'))) setWorkDays(g('workDays'));
        if (Array.isArray(g('holidays'))) setHolidays([...g('holidays')].sort());
        if (g('attendance') && typeof g('attendance') === 'object')
          setAtt((c) => ({ ...c, ...g('attendance') }));
        if (g('requireProfilePhoto') === false) setPhoto(false);
        if (g('reportGate') && typeof g('reportGate') === 'object')
          setGate((c) => ({
            ...c,
            enabled: g('reportGate').enabled !== false,
            roles: Array.isArray(g('reportGate').roles) ? g('reportGate').roles : c.roles,
          }));
      })
      .catch((e) => setErr(e.message));
    api('/admin/system').then(setSys).catch(() => {});
  }, [user]);

  // Load Sessions
  const loadSessions = () => {
    setSessionsLoading(true);
    api<SessionItem[]>('/auth/sessions')
      .then((data) => setSessions(data))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  };

  // Load User Preferences
  const loadPreferences = () => {
    api<{ notifications?: any; work?: any; appearance?: any }>('/users/preferences/me')
      .then((data) => {
        setPrefs({
          notifications: {
            ...DEFAULT_PREFERENCES.notifications,
            ...(data.notifications || {}),
          },
          work: {
            ...DEFAULT_PREFERENCES.work,
            ...(data.work || {}),
          },
          appearance: {
            ...DEFAULT_PREFERENCES.appearance,
            ...(data.appearance || {}),
          },
        });
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    loadSessions();
    loadPreferences();
  }, [user]);

  // Handle Save Admin Company Rules
  async function saveCompanyRules(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await api('/settings/reportDeadline', { method: 'PUT', body: { value: { time } } });
      await api('/settings/workDays', { method: 'PUT', body: { value: workDays } });
      await api('/settings/holidays', { method: 'PUT', body: { value: holidays } });
      await api('/settings/attendance', {
        method: 'PUT',
        body: {
          value: {
            ...att,
            graceMinutes: Number(att.graceMinutes),
            halfDayMinutes: Number(att.halfDayMinutes),
            maxBreakMinutes: Number(att.maxBreakMinutes),
            maxSingleBreakMinutes: Number(att.maxSingleBreakMinutes),
          },
        },
      });
      await api('/settings/requireProfilePhoto', { method: 'PUT', body: { value: photo } });
      await api('/settings/reportGate', { method: 'PUT', body: { value: gate } });
      setMsg('Company rules saved successfully. Changes take effect immediately.');
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  // Handle Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Revoke this session? That device will be logged out.')) return;
    try {
      await api(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
      setSessionMsg('Session revoked.');
      setTimeout(() => setSessionMsg(''), 4000);
      loadSessions();
    } catch (ex) {
      alert(ex instanceof ApiError ? ex.message : 'Failed to revoke session');
    }
  };

  // Handle Revoke All Other Sessions
  const handleRevokeAllOther = async () => {
    if (!confirm('Log out all other active sessions on other devices?')) return;
    try {
      await api('/auth/sessions/revoke-all', { method: 'POST' });
      setSessionMsg('All other sessions revoked.');
      setTimeout(() => setSessionMsg(''), 4000);
      loadSessions();
    } catch (ex) {
      alert(ex instanceof ApiError ? ex.message : 'Failed to revoke sessions');
    }
  };

  // Handle Save User Preferences
  const handleSavePreferences = async (updated: Partial<CommonUserPreferences>) => {
    setSaveBusy(true);
    setSaveMsg('');
    setSaveErr('');
    const newPrefs = { ...prefs, ...updated };
    setPrefs(newPrefs);
    try {
      await api('/users/preferences/me', {
        method: 'PATCH',
        body: updated,
      });
      setSaveMsg('Preferences saved.');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (ex) {
      setSaveErr(ex instanceof ApiError ? ex.message : 'Could not save preferences');
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleNotif = (key: keyof CommonUserPreferences['notifications']) => {
    const updated = {
      ...prefs.notifications,
      [key]: !prefs.notifications[key],
    };
    handleSavePreferences({ notifications: updated });
  };

  if (loading || !user) return <Loading />;
  if (user.role === 'HR_MANAGER' || user.role === 'HR_SUPPORT') return <Loading />;

  const toggleDay = (n: number) =>
    setWorkDays((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]));

  const addHoliday = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(newHoliday) && !holidays.includes(newHoliday))
      setHolidays([...holidays, newHoliday].sort());
    setNewHoliday('');
  };

  // Dynamic Header Title & Sub
  const headerInfo = {
    ADMIN: {
      title: 'Company & Account Settings',
      sub: 'Manage organization-wide attendance rules, daily report policies, and your personal account.',
    },
    TEAM_LEAD: {
      title: 'Team Lead Settings',
      sub: 'Configure your account security, notification alerts, work preferences, and active sessions.',
    },
    COORDINATOR: {
      title: 'Coordinator Settings',
      sub: 'Configure your account security, notification alerts, work preferences, and active sessions.',
    },
    EMPLOYEE: {
      title: 'Account Settings',
      sub: 'Manage your password, notifications, display preferences, and active sessions.',
    },
  }[user.role as 'ADMIN' | 'TEAM_LEAD' | 'COORDINATOR' | 'EMPLOYEE'] || {
    title: 'Settings',
    sub: 'Manage your account settings and preferences.',
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={headerInfo.title} sub={headerInfo.sub} />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-sm font-medium">
        {isAdmin && (
          <button
            onClick={() => setActiveTab('company')}
            className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
              activeTab === 'company'
                ? 'border-brand-600 text-brand-700 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            🏢 Company Rules
          </button>
        )}
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          🔐 Account & Security
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          🔔 Notifications
        </button>
        <button
          onClick={() => setActiveTab('work')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'work'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          ⚙️ Work & Appearance
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'sessions'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          📱 Active Sessions
        </button>
      </div>

      {saveMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ {saveMsg}
        </div>
      )}
      {saveErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠ {saveErr}
        </div>
      )}

      {/* --- TAB: COMPANY RULES (ADMIN ONLY) --- */}
      {isAdmin && activeTab === 'company' && (
        <div className="space-y-5">
          {err && <p className="err mb-4" role="alert">{err}</p>}
          {msg && <p className="ok mb-4" role="status">{msg}</p>}

          <form onSubmit={saveCompanyRules} className="space-y-5">
            <section className="card">
              <h2 className="h2">Daily report deadline</h2>
              <p className="mb-3 text-sm text-slate-500">
                Reports after this time are marked late. A reminder goes out 30 minutes before, and team leads get a missing-reports summary shortly after.
              </p>
              <input
                className="input !w-40"
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </section>

            <section className="card">
              <h2 className="h2">Attendance & breaks</h2>
              <p className="mb-3 text-sm text-slate-500">
                People are “late” after shift start + grace. Under the half-day minimum when they check out counts as a half day. Forgotten check-outs are closed automatically and flagged for review.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">Shift starts</label>
                  <input
                    className="input"
                    type="time"
                    value={att.shiftStart}
                    onChange={(e) => setAtt({ ...att, shiftStart: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Shift ends</label>
                  <input
                    className="input"
                    type="time"
                    value={att.shiftEnd}
                    onChange={(e) => setAtt({ ...att, shiftEnd: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Auto check-out at</label>
                  <input
                    className="input"
                    type="time"
                    value={att.autoCheckout}
                    onChange={(e) => setAtt({ ...att, autoCheckout: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Grace (minutes)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={240}
                    value={att.graceMinutes}
                    onChange={(e) => setAtt({ ...att, graceMinutes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Half-day below (minutes worked)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={1440}
                    value={att.halfDayMinutes}
                    onChange={(e) => setAtt({ ...att, halfDayMinutes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Total break allowed / day (min)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={600}
                    value={att.maxBreakMinutes}
                    onChange={(e) => setAtt({ ...att, maxBreakMinutes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Alert lead if one break exceeds (min)</label>
                  <input
                    className="input"
                    type="number"
                    min={5}
                    max={600}
                    value={att.maxSingleBreakMinutes}
                    onChange={(e) => setAtt({ ...att, maxSingleBreakMinutes: Number(e.target.value) })}
                  />
                </div>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={photo}
                  onChange={(e) => setPhoto(e.target.checked)}
                />{' '}
                Require every person to upload a profile photo before using the app
              </label>
            </section>

            <section className="card">
              <h2 className="h2">Report before checkout / logout</h2>
              <p className="mb-3 text-sm text-slate-500">
                When on, the selected roles cannot check out or log out until they submit today’s daily report. People who never checked in can always log out.
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={gate.enabled}
                  onChange={(e) => setGate({ ...gate, enabled: e.target.checked })}
                />{' '}
                Enforce the daily report gate
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {['EMPLOYEE', 'COORDINATOR', 'TEAM_LEAD', 'ADMIN'].map((r) => (
                  <button
                    type="button"
                    key={r}
                    aria-pressed={gate.roles.includes(r)}
                    onClick={() =>
                      setGate({
                        ...gate,
                        roles: gate.roles.includes(r)
                          ? gate.roles.filter((x) => x !== r)
                          : [...gate.roles, r],
                      })
                    }
                    className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
                      gate.roles.includes(r)
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {ROLE_LABEL[r] ?? r}
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 className="h2">Working days</h2>
              <p className="mb-3 text-sm text-slate-500">
                On non-working days nobody is marked missing and streaks are not broken.
              </p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button
                    type="button"
                    key={d.n}
                    aria-pressed={workDays.includes(d.n)}
                    onClick={() => toggleDay(d.n)}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                      workDays.includes(d.n)
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 className="h2">Holidays</h2>
              <div className="mb-3 flex gap-2">
                <input
                  className="input !w-48"
                  type="date"
                  value={newHoliday}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  aria-label="Holiday date"
                />
                <button type="button" className="btn-secondary" onClick={addHoliday}>
                  Add holiday
                </button>
              </div>
              {holidays.length === 0 ? (
                <p className="text-sm text-slate-400">No holidays added.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {holidays.map((h) => (
                    <li
                      key={h}
                      className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm"
                    >
                      {new Date(h + 'T00:00:00Z').toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${h}`}
                        onClick={() => setHolidays(holidays.filter((x) => x !== h))}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <button className="btn !px-8" disabled={busy || workDays.length === 0}>
              {busy ? 'Saving…' : 'Save company settings'}
            </button>
          </form>

          {sys && (
            <section className="card mt-8">
              <h2 className="h2">System health</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                {[
                  ['Online now', sys.onlineUsers],
                  ['Database', `${sys.dbSizeMb} MB`],
                  ['API memory', `${sys.memoryMb} MB`],
                  [
                    'Uptime',
                    `${Math.floor(sys.uptimeSec / 3600)}h ${Math.floor(
                      (sys.uptimeSec % 3600) / 60
                    )}m`,
                  ],
                  ['Files stored', sys.storage?.files ?? 0],
                  ['Storage used', `${sys.storage?.usedMb ?? 0} MB`],
                  [
                    'Disk free',
                    sys.storage?.diskFreeMb != null ? `${sys.storage.diskFreeMb} MB` : '—',
                  ],
                  ['People', sys.counts.users],
                  ['Tasks', sys.counts.tasks],
                  ['Reports', sys.counts.reports],
                  ['Audit entries', sys.counts.auditLogs],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {k}
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}

      {/* --- TAB: ACCOUNT & SECURITY --- */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <ChangePasswordCard onSuccess={loadSessions} />

          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">Account Information</h2>
            <div className="grid gap-4 sm:grid-cols-2 text-sm mt-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</p>
                <p className="text-base font-semibold text-slate-900 mt-1">{ROLE_LABEL[user.role] ?? user.role}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</p>
                <p className="text-base font-semibold text-slate-900 mt-1">{user.email}</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* --- TAB: NOTIFICATIONS --- */}
      {activeTab === 'notifications' && (
        <section className="card p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Notification Preferences</h2>
            <p className="text-sm text-slate-500">
              Customize alerts for daily reports, assignments, and portal updates.
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100">
            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Daily Report Reminder</p>
                <p className="text-xs text-slate-500">
                  Notify me 30 minutes before the daily report submission cut-off time.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.dailyReportReminder}
                onChange={() => toggleNotif('dailyReportReminder')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Task Assignments</p>
                <p className="text-xs text-slate-500">
                  Notify me when a new task or subtask is assigned to me.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.taskAssigned}
                onChange={() => toggleNotif('taskAssigned')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Task Comments & Mentions</p>
                <p className="text-xs text-slate-500">
                  Receive notifications when someone comments on tasks I own or participate in.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.taskComment}
                onChange={() => toggleNotif('taskComment')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Company Announcements</p>
                <p className="text-xs text-slate-500">
                  Receive alerts when organization-wide announcements are published.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.announcements}
                onChange={() => toggleNotif('announcements')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Leave Request Updates</p>
                <p className="text-xs text-slate-500">
                  Receive instant notifications when leave requests are approved or rejected.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.leaveStatus}
                onChange={() => toggleNotif('leaveStatus')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>
          </div>
        </section>
      )}

      {/* --- TAB: WORK & APPEARANCE --- */}
      {activeTab === 'work' && (
        <section className="card p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Work & Display Preferences</h2>
            <p className="text-sm text-slate-500">
              Customize formatting, timezone, and visual appearance.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date Format</label>
              <select
                value={prefs.work.dateFormat}
                onChange={(e) =>
                  handleSavePreferences({ work: { ...prefs.work, dateFormat: e.target.value } })
                }
                className="input w-full"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 06/11/2026)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 11/06/2026)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-11-06)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
              <select
                value={prefs.work.timeZone}
                onChange={(e) =>
                  handleSavePreferences({ work: { ...prefs.work, timeZone: e.target.value } })
                }
                className="input w-full"
              >
                <option value="Asia/Kolkata">India Standard Time (IST - Asia/Kolkata)</option>
                <option value="UTC">Coordinated Universal Time (UTC)</option>
                <option value="America/New_York">Eastern Time (US - America/New_York)</option>
                <option value="Europe/London">Greenwich Mean Time (Europe/London)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Time Display</label>
              <select
                value={prefs.work.workingHoursDisplay}
                onChange={(e) =>
                  handleSavePreferences({
                    work: { ...prefs.work, workingHoursDisplay: e.target.value },
                  })
                }
                className="input w-full"
              >
                <option value="12h">12-hour (e.g. 06:30 PM)</option>
                <option value="24h">24-hour (e.g. 18:30)</option>
              </select>
            </div>
          </div>

          <hr className="border-slate-100 my-4" />

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Portal Theme</h3>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {['light', 'dark'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    handleSavePreferences({ appearance: { ...prefs.appearance, theme: t } })
                  }
                  className={`rounded-xl border p-3 text-left transition ${
                    prefs.appearance.theme === t
                      ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold ring-2 ring-brand-500/20'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="capitalize text-sm font-semibold">{t} Mode</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t === 'light' ? 'Bright clean view' : 'Low-glare dark view'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">View Density</h3>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {['comfortable', 'compact'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    handleSavePreferences({ appearance: { ...prefs.appearance, viewDensity: d } })
                  }
                  className={`rounded-xl border p-3 text-left transition ${
                    prefs.appearance.viewDensity === d
                      ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold ring-2 ring-brand-500/20'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="capitalize text-sm font-semibold">{d}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {d === 'comfortable' ? 'Spacious spacing' : 'High density layout'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --- TAB: SESSIONS --- */}
      {activeTab === 'sessions' && (
        <section className="card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Active Login Sessions</h2>
              <p className="text-sm text-slate-500">
                Review devices currently authenticated with your account.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRevokeAllOther}
              className="btn-secondary !text-xs !py-1.5 self-start text-red-600 hover:bg-red-50 hover:border-red-200"
            >
              Sign out all other sessions
            </button>
          </div>

          {sessionMsg && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ {sessionMsg}
            </div>
          )}

          {sessionsLoading ? (
            <p className="text-sm text-slate-400 py-4">Loading active sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No active sessions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-2.5">Device & Browser</th>
                    <th className="pb-2.5">IP Address</th>
                    <th className="pb-2.5">Logged In At</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="text-slate-700">
                      <td className="py-3 pr-3 font-medium max-w-xs truncate" title={s.userAgent}>
                        {s.userAgent ? s.userAgent.slice(0, 45) + '...' : 'Unknown Device'}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{s.ip || '127.0.0.1'}</td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-3">
                        {s.isCurrent ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Current session
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {!s.isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRevokeSession(s.id)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 transition"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Sign Out of Current Device</p>
              <p className="text-xs text-slate-500">End your current session on this browser.</p>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition"
            >
              Sign out
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
