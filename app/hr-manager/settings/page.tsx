'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import { Loading, PageHeader } from '../../../components/ui';
import { useRequireAuth } from '../../../lib/auth-context';

interface SessionItem {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface UserPreferences {
  notifications: {
    newCandidateSubmissions: boolean;
    candidateStatusChanges: boolean;
    candidateFeedback: boolean;
    newRequirements: boolean;
    deadlineReminders: boolean;
    interviewSchedules: boolean;
    attendanceSummary: boolean;
    lateLoginAlerts: boolean;
    leaveUpdates: boolean;
  };
  recruitment: {
    defaultJobLocation: string;
    defaultEmploymentType: string;
    defaultDeadlineDuration: string;
    defaultCandidateStatus: string;
    visibleColumns: string[];
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

const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    newCandidateSubmissions: true,
    candidateStatusChanges: true,
    candidateFeedback: true,
    newRequirements: true,
    deadlineReminders: true,
    interviewSchedules: true,
    attendanceSummary: true,
    lateLoginAlerts: true,
    leaveUpdates: true,
  },
  recruitment: {
    defaultJobLocation: 'Remote',
    defaultEmploymentType: 'Full-time',
    defaultDeadlineDuration: '14 days',
    defaultCandidateStatus: 'SUBMITTED',
    visibleColumns: [
      'candidateCode',
      'name',
      'email',
      'phone',
      'qualification',
      'totalExp',
      'status',
      'submittedBy',
      'createdAt',
      'actions',
    ],
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

const AVAILABLE_COLUMNS = [
  { id: 'candidateCode', label: 'Candidate ID' },
  { id: 'name', label: 'Candidate Name' },
  { id: 'email', label: 'Email Address' },
  { id: 'phone', label: 'Phone Number' },
  { id: 'qualification', label: 'Qualification' },
  { id: 'totalExp', label: 'Experience' },
  { id: 'status', label: 'Current Status' },
  { id: 'submittedBy', label: 'Submitted By (HR Support)' },
  { id: 'createdAt', label: 'Submission Date' },
  { id: 'actions', label: 'Actions' },
];

export default function HrManagerSettingsPage() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);

  const [activeTab, setActiveTab] = useState<
    'security' | 'notifications' | 'recruitment' | 'work' | 'appearance'
  >('security');

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionMsg, setSessionMsg] = useState('');

  // Preferences State
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
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
    api<{ notifications?: any; recruitment?: any; work?: any; appearance?: any }>(
      '/users/preferences/me',
    )
      .then((data) => {
        setPrefs({
          notifications: { ...DEFAULT_PREFERENCES.notifications, ...(data.notifications || {}) },
          recruitment: { ...DEFAULT_PREFERENCES.recruitment, ...(data.recruitment || {}) },
          work: { ...DEFAULT_PREFERENCES.work, ...(data.work || {}) },
          appearance: { ...DEFAULT_PREFERENCES.appearance, ...(data.appearance || {}) },
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

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErr('');
    setPasswordMsg('');

    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordErr('New password must be at least 8 characters and contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr('New password and confirmation do not match.');
      return;
    }

    setPasswordBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setPasswordMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadSessions();
    } catch (ex) {
      setPasswordErr(ex instanceof ApiError ? ex.message : 'Could not change password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  // Handle Revoke Session
  const handleRevokeSession = async (id: string) => {
    if (!confirm('Are you sure you want to log out this session?')) return;
    try {
      await api(`/auth/sessions/${id}`, { method: 'DELETE' });
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
  const handleSavePreferences = async (updated: Partial<UserPreferences>) => {
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
      setSaveMsg('Preferences saved to database.');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (ex) {
      setSaveErr(ex instanceof ApiError ? ex.message : 'Could not save preferences');
    } finally {
      setSaveBusy(false);
    }
  };

  const toggleNotif = (key: keyof UserPreferences['notifications']) => {
    const updated = {
      ...prefs.notifications,
      [key]: !prefs.notifications[key],
    };
    handleSavePreferences({ notifications: updated });
  };

  const toggleColumn = (colId: string) => {
    const cols = prefs.recruitment.visibleColumns.includes(colId)
      ? prefs.recruitment.visibleColumns.filter((c) => c !== colId)
      : [...prefs.recruitment.visibleColumns, colId];
    handleSavePreferences({
      recruitment: { ...prefs.recruitment, visibleColumns: cols },
    });
  };

  if (loading || !user) return <Loading />;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="HR Manager Settings"
        sub="Configure account security, automated notifications, recruitment defaults and display preferences."
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
          onClick={() => setActiveTab('recruitment')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'recruitment'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          💼 Recruitment Preferences
        </button>
        <button
          onClick={() => setActiveTab('work')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'work'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          ⏱️ Work Preferences
        </button>
        <button
          onClick={() => setActiveTab('appearance')}
          className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'appearance'
              ? 'border-brand-600 text-brand-700 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          🎨 Appearance & Display
        </button>
      </div>

      {saveMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
          ✓ {saveMsg}
        </div>
      )}
      {saveErr && <p className="err">{saveErr}</p>}

      {/* TAB 1: Account & Security */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Change Password Card */}
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
              <p className="text-xs text-slate-500">
                Update your account password. Requires your current password for security verification.
              </p>
            </div>

            {passwordMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                ✓ {passwordMsg}
              </div>
            )}
            {passwordErr && <p className="err">{passwordErr}</p>}

            <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input text-xs w-full"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input text-xs w-full"
                  placeholder="At least 8 chars with letter and number"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input text-xs w-full"
                  placeholder="Re-type new password"
                />
              </div>

              <button
                type="submit"
                disabled={passwordBusy}
                className="btn-primary text-xs"
              >
                {passwordBusy ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Active Sessions Card */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Active Sessions</h2>
                <p className="text-xs text-slate-500">
                  Devices and browsers currently logged into your HR Manager account.
                </p>
              </div>
              {sessions.filter((s) => !s.isCurrent).length > 0 && (
                <button
                  type="button"
                  onClick={handleRevokeAllOther}
                  className="btn-secondary !text-rose-600 hover:!bg-rose-50 text-xs"
                >
                  Log Out All Other Devices
                </button>
              )}
            </div>

            {sessionMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                ✓ {sessionMsg}
              </div>
            )}

            {sessionsLoading ? (
              <div className="text-xs text-slate-400 py-4 text-center">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No active sessions found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Device & Browser</th>
                      <th className="p-2.5">IP Address</th>
                      <th className="p-2.5">Logged In Since</th>
                      <th className="p-2.5">Expires</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="p-2.5 font-medium text-slate-800">
                          <div className="flex items-center gap-2">
                            <span>💻 {s.userAgent.slice(0, 50)}...</span>
                            {s.isCurrent && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Current Session
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 text-slate-600 font-mono text-[11px]">{s.ip}</td>
                        <td className="p-2.5 text-slate-500">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-slate-500">
                          {new Date(s.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="p-2.5 text-right">
                          {s.isCurrent ? (
                            <span className="text-[11px] text-slate-400 font-medium">Active</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRevokeSession(s.id)}
                              className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
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
          </div>
        </div>
      )}

      {/* TAB 2: Notification Preferences */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recruitment Notifications</h2>
              <p className="text-xs text-slate-500">
                Choose the recruitment events for which you want to receive system and email notifications.
              </p>
            </div>

            <div className="divide-y divide-slate-100 space-y-1">
              {[
                {
                  key: 'newCandidateSubmissions' as const,
                  title: 'New Candidate Submissions',
                  desc: 'Get notified immediately whenever HR Support uploads candidate profiles.',
                },
                {
                  key: 'candidateStatusChanges' as const,
                  title: 'Candidate Status Changes',
                  desc: 'Alerts when candidate progression or interview statuses are modified.',
                },
                {
                  key: 'candidateFeedback' as const,
                  title: 'Candidate Feedback Submitted',
                  desc: 'Notifications when remarks, interview evaluations, or notes are added.',
                },
                {
                  key: 'newRequirements' as const,
                  title: 'Requirement Publication & Assignment',
                  desc: 'Confirmation when requirements are published or assigned to team members.',
                },
                {
                  key: 'deadlineReminders' as const,
                  title: 'Requirement Deadline Reminders',
                  desc: 'Reminders 48 hours and 24 hours prior to requirement closing dates.',
                },
                {
                  key: 'interviewSchedules' as const,
                  title: 'Interview Schedules',
                  desc: 'Alerts when interview dates are set or updated for candidates.',
                },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800">{item.title}</h3>
                    <p className="text-[11px] text-slate-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.notifications[item.key]}
                    onChange={() => toggleNotif(item.key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Attendance & Leave Notifications</h2>
              <p className="text-xs text-slate-500">
                Automated oversight alerts for punctuality and leave approvals.
              </p>
            </div>

            <div className="divide-y divide-slate-100 space-y-1">
              {[
                {
                  key: 'attendanceSummary' as const,
                  title: 'Daily Attendance Summary',
                  desc: 'Daily digest of organization-wide attendance, present count and absences.',
                },
                {
                  key: 'lateLoginAlerts' as const,
                  title: 'Late Login Alerts',
                  desc: 'Instant alert when an employee exceeds the grace period threshold.',
                },
                {
                  key: 'leaveUpdates' as const,
                  title: 'Leave Requests & Approvals',
                  desc: 'Notifications when leaves are applied, approved, or escalated.',
                },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800">{item.title}</h3>
                    <p className="text-[11px] text-slate-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.notifications[item.key]}
                    onChange={() => toggleNotif(item.key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Recruitment Preferences */}
      {activeTab === 'recruitment' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recruitment Defaults</h2>
              <p className="text-xs text-slate-500">
                Pre-populate your default values when creating new recruitment requirements.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Default Job Location
                </label>
                <select
                  value={prefs.recruitment.defaultJobLocation}
                  onChange={(e) =>
                    handleSavePreferences({
                      recruitment: { ...prefs.recruitment, defaultJobLocation: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="Remote">Remote</option>
                  <option value="On-site">On-site</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Default Employment Type
                </label>
                <select
                  value={prefs.recruitment.defaultEmploymentType}
                  onChange={(e) =>
                    handleSavePreferences({
                      recruitment: { ...prefs.recruitment, defaultEmploymentType: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Default Deadline Duration
                </label>
                <select
                  value={prefs.recruitment.defaultDeadlineDuration}
                  onChange={(e) =>
                    handleSavePreferences({
                      recruitment: {
                        ...prefs.recruitment,
                        defaultDeadlineDuration: e.target.value,
                      },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="7 days">7 days</option>
                  <option value="14 days">14 days</option>
                  <option value="30 days">30 days</option>
                  <option value="60 days">60 days</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Default Candidate Status
                </label>
                <select
                  value={prefs.recruitment.defaultCandidateStatus}
                  onChange={(e) =>
                    handleSavePreferences({
                      recruitment: {
                        ...prefs.recruitment,
                        defaultCandidateStatus: e.target.value,
                      },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="SUBMITTED">SUBMITTED (Sourced)</option>
                  <option value="UNDER_REVIEW">UNDER_REVIEW (Under Review)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Candidate Table Visible Columns */}
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Candidate Table Column Visibility
              </h2>
              <p className="text-xs text-slate-500">
                Select which columns to display by default in the candidate management tables.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {AVAILABLE_COLUMNS.map((col) => {
                const checked = prefs.recruitment.visibleColumns.includes(col.id);
                return (
                  <label
                    key={col.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      checked
                        ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(col.id)}
                      className="rounded text-brand-600 focus:ring-brand-500"
                    />
                    <span>{col.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Work Preferences */}
      {activeTab === 'work' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Regional & Work Schedule Formats</h2>
              <p className="text-xs text-slate-500">
                Configure your display format for dates, working hours, and time zones.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Preferred Date Format
                </label>
                <select
                  value={prefs.work.dateFormat}
                  onChange={(e) =>
                    handleSavePreferences({
                      work: { ...prefs.work, dateFormat: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 06/11/2026)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 11/06/2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-11-06)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Time Zone</label>
                <select
                  value={prefs.work.timeZone}
                  onChange={(e) =>
                    handleSavePreferences({
                      work: { ...prefs.work, timeZone: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                  <option value="UTC">UTC (Universal Coordinated Time)</option>
                  <option value="America/New_York">America/New_York (EST - UTC-05:00)</option>
                  <option value="Europe/London">Europe/London (GMT - UTC+00:00)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Working Hours Display
                </label>
                <select
                  value={prefs.work.workingHoursDisplay}
                  onChange={(e) =>
                    handleSavePreferences({
                      work: { ...prefs.work, workingHoursDisplay: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="12h">12-Hour Format (e.g. 09:30 AM - 06:30 PM)</option>
                  <option value="24h">24-Hour Military Format (e.g. 09:30 - 18:30)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Appearance & Display */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Appearance & Layout</h2>
              <p className="text-xs text-slate-500">
                Personalize theme and table density for your HR dashboard.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Theme Preference
                </label>
                <select
                  value={prefs.appearance.theme}
                  onChange={(e) =>
                    handleSavePreferences({
                      appearance: { ...prefs.appearance, theme: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="light">☀️ Light Theme (Default)</option>
                  <option value="dark">🌙 Dark Theme</option>
                  <option value="system">🖥️ Sync with System</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Candidate Table Density
                </label>
                <select
                  value={prefs.appearance.viewDensity}
                  onChange={(e) =>
                    handleSavePreferences({
                      appearance: { ...prefs.appearance, viewDensity: e.target.value },
                    })
                  }
                  className="input text-xs w-full"
                >
                  <option value="comfortable">Comfortable (More padding & badges)</option>
                  <option value="compact">Compact (Dense data view)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
