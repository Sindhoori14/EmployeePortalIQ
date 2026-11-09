'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import { Loading, PageHeader } from '../../../components/ui';
import { ChangePasswordCard } from '../../../components/ChangePasswordCard';
import { useRequireAuth } from '../../../lib/auth-context';

interface SessionItem {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface HrSupportPreferences {
  notifications: {
    assignedRequirements: boolean;
    candidateStatusUpdates: boolean;
    candidateFeedback: boolean;
    submissionReminders: boolean;
    dailyReportReminder: boolean;
  };
  work: {
    dateFormat: string;
    timeZone: string;
    workingHoursDisplay: string;
    defaultSubmissionsView: string;
  };
  appearance: {
    theme: string;
    viewDensity: string;
  };
}

const DEFAULT_HR_SUPPORT_PREFERENCES: HrSupportPreferences = {
  notifications: {
    assignedRequirements: true,
    candidateStatusUpdates: true,
    candidateFeedback: true,
    submissionReminders: true,
    dailyReportReminder: true,
  },
  work: {
    dateFormat: 'DD/MM/YYYY',
    timeZone: 'Asia/Kolkata',
    workingHoursDisplay: '12h',
    defaultSubmissionsView: 'cards',
  },
  appearance: {
    theme: 'light',
    viewDensity: 'comfortable',
  },
};

export default function HrSupportSettingsPage() {
  const { user, loading } = useRequireAuth(['HR_SUPPORT', 'ADMIN']);

  const [activeTab, setActiveTab] = useState<
    'security' | 'notifications' | 'work' | 'appearance' | 'activity'
  >('security');

  // Sessions State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionMsg, setSessionMsg] = useState('');

  // Preferences State
  const [prefs, setPrefs] = useState<HrSupportPreferences>(DEFAULT_HR_SUPPORT_PREFERENCES);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  // Load Sessions
  const loadSessions = () => {
    setSessionsLoading(true);
    api<SessionItem[]>('/auth/sessions')
      .then((data) => setSessions(data))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  };

  // Load Preferences
  const loadPreferences = () => {
    setPrefsLoading(true);
    api<{ notifications?: any; work?: any; appearance?: any }>('/users/preferences/me')
      .then((data) => {
        setPrefs({
          notifications: {
            ...DEFAULT_HR_SUPPORT_PREFERENCES.notifications,
            ...(data.notifications || {}),
          },
          work: {
            ...DEFAULT_HR_SUPPORT_PREFERENCES.work,
            ...(data.work || {}),
          },
          appearance: {
            ...DEFAULT_HR_SUPPORT_PREFERENCES.appearance,
            ...(data.appearance || {}),
          },
        });
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    loadSessions();
    loadPreferences();
  }, [user]);

  // Handle Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Revoke this session? The device will be signed out.')) return;
    try {
      await api(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
      setSessionMsg('Session revoked successfully.');
      setTimeout(() => setSessionMsg(''), 4000);
      loadSessions();
    } catch (ex) {
      alert(ex instanceof ApiError ? ex.message : 'Failed to revoke session');
    }
  };

  // Handle Revoke All Other Sessions
  const handleRevokeAllOther = async () => {
    if (!confirm('Log out all other active sessions across other devices and browsers?')) return;
    try {
      await api('/auth/sessions/revoke-all', { method: 'POST' });
      setSessionMsg('All other sessions revoked successfully.');
      setTimeout(() => setSessionMsg(''), 4000);
      loadSessions();
    } catch (ex) {
      alert(ex instanceof ApiError ? ex.message : 'Failed to revoke sessions');
    }
  };

  // Handle Save Preferences
  const handleSavePreferences = async (updated: Partial<HrSupportPreferences>) => {
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
      setSaveMsg('Preferences saved successfully.');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (ex) {
      setSaveErr(ex instanceof ApiError ? ex.message : 'Could not save preferences');
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleNotif = (key: keyof HrSupportPreferences['notifications']) => {
    const updated = {
      ...prefs.notifications,
      [key]: !prefs.notifications[key],
    };
    handleSavePreferences({ notifications: updated });
  };

  if (loading || !user) return <Loading />;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="HR Support Settings"
        sub="Manage account security, sourcing notifications, work preferences, and view account activity."
      />

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-sm font-medium">
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
          🔔 Notification Preferences
        </button>
        <button
          onClick={() => setActiveTab('work')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'work'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          ⚙️ Work Preferences
        </button>
        <button
          onClick={() => setActiveTab('appearance')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'appearance'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          🎨 Appearance
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'activity'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          📋 Privacy & Account Activity
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

      {/* TAB 1: Account & Security */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <ChangePasswordCard onSuccess={loadSessions} />

          {/* Active Sessions */}
          <section className="card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Active Login Sessions</h2>
                <p className="text-sm text-slate-500">
                  Review browser sessions currently signed into your HR Support account.
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
                          {s.userAgent ? s.userAgent.slice(0, 45) + '...' : 'Unknown Browser'}
                        </td>
                        <td className="py-3 pr-3 font-mono text-xs">{s.ip || '127.0.0.1'}</td>
                        <td className="py-3 pr-3 text-xs text-slate-500">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 pr-3">
                          {s.isCurrent ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Current device
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
          </section>
        </div>
      )}

      {/* TAB 2: Notification Preferences */}
      {activeTab === 'notifications' && (
        <section className="card p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">HR Support Notification Preferences</h2>
            <p className="text-sm text-slate-500">
              Control alerts and reminders for requirement assignments and candidate status updates.
            </p>
          </div>

          <div className="space-y-4 divide-y divide-slate-100">
            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">New Requirement Assignment</p>
                <p className="text-xs text-slate-500">
                  Notify me when an HR Manager assigns a new recruitment requirement to me.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.assignedRequirements}
                onChange={() => toggleNotif('assignedRequirements')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Candidate Status Updates</p>
                <p className="text-xs text-slate-500">
                  Notify me when an HR Manager shortlists, interviews, offers, or rejects my submitted candidates.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.candidateStatusUpdates}
                onChange={() => toggleNotif('candidateStatusUpdates')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Candidate Feedback & Remarks</p>
                <p className="text-xs text-slate-500">
                  Notify me when interview remarks or evaluation notes are added to candidates.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.candidateFeedback}
                onChange={() => toggleNotif('candidateFeedback')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Sourcing Deadline Reminders</p>
                <p className="text-xs text-slate-500">
                  Receive advance reminders when an assigned requirement deadline is approaching.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.submissionReminders}
                onChange={() => toggleNotif('submissionReminders')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Daily Report Reminder</p>
                <p className="text-xs text-slate-500">
                  Notify me before the daily report cut-off time to complete daily activity reporting.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.notifications.dailyReportReminder}
                onChange={() => toggleNotif('dailyReportReminder')}
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Work Preferences */}
      {activeTab === 'work' && (
        <section className="card p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Work & Sourcing Preferences</h2>
            <p className="text-sm text-slate-500">
              Configure date format, timezone and candidate submission view preferences.
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Submissions Layout</label>
              <select
                value={prefs.work.defaultSubmissionsView}
                onChange={(e) =>
                  handleSavePreferences({
                    work: { ...prefs.work, defaultSubmissionsView: e.target.value },
                  })
                }
                className="input w-full"
              >
                <option value="cards">Card View (Visual cards per requirement)</option>
                <option value="table">Table View (Dense tabular list)</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: Appearance */}
      {activeTab === 'appearance' && (
        <section className="card p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Appearance Preferences</h2>
            <p className="text-sm text-slate-500">
              Adjust portal theme and layout density to match your working environment.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Interface Theme</label>
              <div className="grid grid-cols-2 gap-3 mt-1">
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
                      {t === 'light' ? 'Crisp bright interface' : 'Reduced glare theme'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">View Density</label>
              <div className="grid grid-cols-2 gap-3 mt-1">
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
                      {d === 'comfortable' ? 'Spacious rows' : 'High information density'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 5: Privacy & Account Activity */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">Account & Privacy Information</h2>
            <p className="text-sm text-slate-500 mb-4">
              Details associated with your authenticated HR Support account.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Role</p>
                <p className="text-base font-semibold text-slate-900 mt-1">HR Support</p>
                <p className="text-xs text-slate-500 mt-0.5">Authorized for sourcing, CSV candidate submission & tracking</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Signed-In Email</p>
                <p className="text-base font-semibold text-slate-900 mt-1">{user.email}</p>
                <p className="text-xs text-slate-500 mt-0.5">Primary work email used for notifications</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Display Name</p>
                <p className="text-base font-semibold text-slate-900 mt-1">{user.displayName}</p>
                <p className="text-xs text-slate-500 mt-0.5">Visible on submitted candidates</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data Privacy Isolation</p>
                <p className="text-base font-semibold text-emerald-700 mt-1">✓ Strict User Isolation Active</p>
                <p className="text-xs text-slate-500 mt-0.5">Candidate submissions are isolated to your account ID</p>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">Security & Session Overview</h2>
            <p className="text-sm text-slate-500 mb-4">
              Recent authentication sessions associated with this account.
            </p>

            <div className="divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-900">Total Active Sessions</p>
                  <p className="text-xs text-slate-500">Number of devices currently retaining valid refresh tokens</p>
                </div>
                <span className="font-semibold text-slate-900 text-base">{sessions.length}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-900">Password Policy</p>
                  <p className="text-xs text-slate-500">Argon2 cryptographic hashing with salted verification</p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                  Enforced
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
