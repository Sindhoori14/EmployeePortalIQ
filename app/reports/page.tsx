'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, fmtDate } from '../../lib/api';
import { Avatar, Empty, Loading, Modal, PageHeader } from '../../components/ui';
import { useAuth, useRequireAuth } from '../../lib/auth-context';
import { AttachButton, AttachmentList, UploadChips, useUploads } from '../../components/Attachments';
import type { FileInfo } from '../../lib/files';

interface DailyReport {
  id: string;
  reportDate: string;
  hoursWorked: number | string;
  isLate: boolean;
  didToday: string;
  blockers: string | null;
  planTomorrow: string;
  submittedAt: string;
  userId: string;
  teamId?: string | null;
  user?: {
    id: string;
    displayName: string;
    email: string;
    role?: string;
    team?: { id: string; name: string } | null;
  };
  taskLinks?: { task: { id: string; title: string; status: string; priority?: string } }[];
  files?: FileInfo[];
}

interface StatusUser {
  id: string;
  displayName: string;
  email: string;
  role?: string;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  report?: DailyReport | null;
}

interface ReportStatusResponse {
  date: string;
  workingDay: boolean;
  total: number;
  submittedCount: number;
  missingCount: number;
  submitted: StatusUser[];
  missing: StatusUser[];
}

interface TeamOption {
  id: string;
  name: string;
}

const localDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA').format(d);
const dayOnly = (iso: string) => iso.slice(0, 10);

export default function ReportsPage() {
  const { user, loading } = useRequireAuth();
  const { logout } = useAuth();
  const today = localDay();

  const isAdmin = user?.role === 'ADMIN';
  const isLead = user?.role === 'TEAM_LEAD';
  const isCoord = user?.role === 'COORDINATOR';
  const isStaff = isAdmin || isLead || isCoord;

  // Tabs for Staff
  const [tab, setTab] = useState<'submissions' | 'submit' | 'mine'>('submissions');

  // Submit Form States
  const [day, setDay] = useState(today);
  const [did, setDid] = useState('');
  const [blockers, setBlockers] = useState('');
  const [plan, setPlan] = useState('');
  const [hours, setHours] = useState('8');
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [myTasks, setMyTasks] = useState<{ id: string; title: string; status: string }[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<DailyReport[]>([]);
  const [deadline, setDeadline] = useState('18:00');

  // Staff Monitoring & Status States
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [status, setStatus] = useState<ReportStatusResponse | null>(null);
  const [reportsList, setReportsList] = useState<DailyReport[]>([]);
  const [fetchingStaff, setFetchingStaff] = useState(false);

  // Detail Modal for reading report contents
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<DailyReport | null>(null);

  const draftKey = user ? `tf-report-draft:${user.id}:${day}` : '';
  const hydrated = useRef('');
  const up = useUploads('REPORT');

  // Load Employee's Own Reports
  const loadMine = useCallback(async () => {
    try {
      setMine(await api<DailyReport[]>('/daily-reports/mine'));
    } catch {
      /* ignore */
    }
  }, []);

  // Load Staff Status & Reports List
  const loadStaffData = useCallback(async () => {
    if (!isStaff) return;
    setFetchingStaff(true);
    setErr('');
    try {
      const teamParam = isAdmin && selectedTeam !== 'ALL' ? `&teamId=${selectedTeam}` : '';
      const [sRes, rList, teamList] = await Promise.all([
        api<ReportStatusResponse>(`/daily-reports/status?date=${selectedDate}${teamParam}`),
        api<DailyReport[]>(`/daily-reports?date=${selectedDate}${teamParam}`),
        isAdmin ? api<{ data: TeamOption[] }>('/teams?limit=100').then((r) => r.data || []).catch(() => []) : Promise.resolve([]),
      ]);

      setStatus(sRes);
      setReportsList(rList);
      if (isAdmin && teamList.length) setTeams(teamList);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load report status');
    } finally {
      setFetchingStaff(false);
    }
  }, [isStaff, isAdmin, selectedDate, selectedTeam]);

  useEffect(() => {
    if (!user) return;
    loadMine();

    if (isStaff) {
      loadStaffData();
      setTab('submissions');
    } else {
      setTab('submit');
    }

    api<{ data: { id: string; title: string; status: string }[] }>('/tasks?limit=100&status=IN_PROGRESS')
      .then((r) => setMyTasks(r.data))
      .catch(() => {});

    api<{ key: string; value: any }[]>('/settings')
      .then((rows) => {
        const t = rows.find((r) => r.key === 'reportDeadline')?.value?.time;
        if (t) setDeadline(String(t));
      })
      .catch(() => {});
  }, [user, isStaff, loadMine, loadStaffData]);

  // Load draft or existing report for selected day
  useEffect(() => {
    if (!user || !draftKey || hydrated.current === draftKey) return;
    const existing = mine.find((r) => dayOnly(r.reportDate) === day);
    if (existing) {
      setDid(existing.didToday);
      setBlockers(existing.blockers ?? '');
      setPlan(existing.planTomorrow);
      setHours(String(existing.hoursWorked));
      setTaskIds(existing.taskLinks?.map((l) => l.task.id) ?? []);
      hydrated.current = draftKey;
      return;
    }

    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setDid(d.did ?? '');
        setBlockers(d.blockers ?? '');
        setPlan(d.plan ?? '');
        setHours(d.hours ?? '8');
        setTaskIds(d.taskIds ?? []);
      } else {
        setDid('');
        setBlockers('');
        setPlan('');
        setHours('8');
        setTaskIds([]);
      }
    } catch {}
    hydrated.current = draftKey;
  }, [user, draftKey, mine, day]);

  // Auto-save draft
  useEffect(() => {
    if (!draftKey || hydrated.current !== draftKey) return;
    const t = setTimeout(() => {
      try {
        if (did || blockers || plan) {
          localStorage.setItem(draftKey, JSON.stringify({ did, blockers, plan, hours, taskIds }));
        }
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [did, blockers, plan, hours, taskIds, draftKey]);

  // Submit report
  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);

    try {
      const r = await api<any>('/daily-reports', {
        method: 'POST',
        body: {
          reportDate: day,
          didToday: did.trim(),
          blockers: blockers.trim() || undefined,
          planTomorrow: plan.trim(),
          hoursWorked: Number(hours),
          taskIds,
          fileIds: up.fileIds,
        },
      });

      up.reset();
      setMsg(r.isLate ? 'Report submitted. Flagged as late submission.' : 'Daily report successfully submitted. Thank you!');
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      hydrated.current = '';

      await loadMine();
      if (isStaff) loadStaffData();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Save failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const toggleTask = (id: string) =>
    setTaskIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (loading || !user) return <Loading />;

  const submittedToday = mine.some((r) => dayOnly(r.reportDate) === today);
  const minDay = localDay(new Date(Date.now() - 14 * 86_400_000));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Standup Reports"
        subtitle={`Track daily accomplishments, blockers, and next-day plans. Target deadline is ${deadline}.`}
      />

      {/* Status Messages */}
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start justify-between">
          <span>{err}</span>
          <button onClick={() => setErr('')} className="font-bold ml-2 text-rose-600 hover:text-rose-900">&times;</button>
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="font-bold ml-2 text-emerald-600 hover:text-emerald-900">&times;</button>
        </div>
      )}

      {/* Staff View Navigation Tabs */}
      {isStaff && (
        <div className="flex border-b border-slate-200 gap-2">
          <button
            onClick={() => setTab('submissions')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === 'submissions'
                ? 'border-brand text-brand'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAdmin ? 'Organization Submissions' : 'Team Submissions & Status'}
          </button>
          <button
            onClick={() => setTab('submit')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === 'submit'
                ? 'border-brand text-brand'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Submit My Report
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === 'mine'
                ? 'border-brand text-brand'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Report History ({mine.length})
          </button>
        </div>
      )}

      {/* TAB 1: STAFF DASHBOARD & MONITORING VIEW */}
      {isStaff && tab === 'submissions' && (
        <div className="space-y-6">
          {/* Controls: Date, Team filter, Search */}
          <div className="card p-4 bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Report Date
                </label>
                <input
                  type="date"
                  className="input text-xs !w-40 bg-white"
                  value={selectedDate}
                  max={today}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                    }
                  }}
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Team Filter
                  </label>
                  <select
                    className="input text-xs w-auto bg-white"
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                  >
                    <option value="ALL">All Teams (Organization-wide)</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="search"
                placeholder="Search staff by name or email..."
                className="input text-xs w-60 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                onClick={loadStaffData}
                className="btn-secondary !py-1.5 text-xs"
                title="Refresh Status"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* KPI Metrics */}
          {status && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="card border-l-4 border-l-slate-600 bg-gradient-to-br from-slate-50/50 to-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {isAdmin ? 'Total Employees' : 'Team Members'}
                </p>
                <p className="mt-2 text-3xl font-extrabold text-navy">{status.total}</p>
                <p className="mt-1 text-xs text-slate-500">Active roster</p>
              </div>

              <div className="card border-l-4 border-l-emerald-600 bg-gradient-to-br from-emerald-50/50 to-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Submitted Reports</p>
                <p className="mt-2 text-3xl font-extrabold text-navy">{status.submittedCount}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {status.total ? `${Math.round((status.submittedCount / status.total) * 100)}% completion` : '0%'}
                </p>
              </div>

              <div className="card border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-50/50 to-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Missing Submissions</p>
                <p className="mt-2 text-3xl font-extrabold text-navy">{status.missingCount}</p>
                <p className="mt-1 text-xs text-slate-500">Pending standup filing</p>
              </div>

              <div className="card border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Status Type</p>
                <p className="mt-2 text-xl font-bold text-navy">
                  {status.workingDay ? 'Working Day' : 'Weekend / Holiday'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {status.workingDay ? 'Standup required' : 'No missing penalties'}
                </p>
              </div>
            </div>
          )}

          {/* Submitted vs Missing Split Lists */}
          {fetchingStaff ? (
            <Loading label="Retrieving daily reports status..." />
          ) : !status ? (
            <Empty title="No data loaded" description="Select a date above to inspect submissions." />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Submitted Reports Column */}
              <div className="card border border-emerald-200 bg-emerald-50/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                    <span>✅</span> Submitted Reports ({status.submitted.length})
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">Click any row to read contents</span>
                </div>

                {status.submitted.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 text-center">No reports filed for this date yet.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {status.submitted
                      .filter((u) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                      })
                      .map((u) => {
                        const rep = u.report;
                        return (
                          <div
                            key={u.id}
                            onClick={() => {
                              if (rep) {
                                setActiveReport({ ...rep, user: u });
                                setDetailOpen(true);
                              }
                            }}
                            className="group flex cursor-pointer items-center justify-between rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs hover:border-emerald-500 hover:shadow-sm transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={u.displayName} size="sm" />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 text-xs truncate group-hover:text-emerald-700">
                                  {u.displayName}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {u.team?.name || 'Unassigned'} · {u.email}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-right">
                              {rep && (
                                <span className="text-xs font-semibold text-slate-700">
                                  {rep.hoursWorked}h
                                </span>
                              )}
                              {rep?.isLate ? (
                                <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  Late
                                </span>
                              ) : (
                                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  On Time
                                </span>
                              )}
                              <span className="text-slate-400 group-hover:text-emerald-600 text-xs">→</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Missing Reports Column */}
              <div className="card border border-rose-200 bg-rose-50/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-rose-900 text-sm flex items-center gap-2">
                    <span>❌</span> Missing Reports ({status.missing.length})
                  </h3>
                  <span className="text-xs text-rose-600 font-medium">Awaiting submission</span>
                </div>

                {status.missing.length === 0 ? (
                  <p className="text-xs text-emerald-700 font-semibold p-3 text-center">
                    🎉 100% submission rate! All required members filed reports.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {status.missing
                      .filter((u) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                      })
                      .map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between rounded-xl border border-rose-100 bg-white p-3 shadow-2xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={u.displayName} size="sm" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 text-xs truncate">{u.displayName}</p>
                              <p className="text-[10px] text-slate-400 truncate">
                                {u.team?.name || 'Unassigned'} · {u.email}
                              </p>
                            </div>
                          </div>
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                            Missing
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBMIT DAILY REPORT (For Employees & Leads filing their own) */}
      {(!isStaff || tab === 'submit') && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="card lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-bold text-navy text-base">
                  {day === today ? 'Today’s Standup Report' : `Filing Report for ${day}`}
                </h2>
                <p className="text-xs text-slate-500">Provide structured updates on your deliverables</p>
              </div>

              <input
                className="input text-xs !w-36"
                type="date"
                min={minDay}
                max={today}
                value={day}
                onChange={(e) => {
                  setDay(e.target.value || today);
                  hydrated.current = '';
                  setMsg('');
                }}
              />
            </div>

            <form onSubmit={submitReport} className="space-y-4">
              <div>
                <label className="label">1. What did you accomplish? *</label>
                <textarea
                  className="input text-sm resize-none"
                  required
                  rows={4}
                  maxLength={5000}
                  value={did}
                  onChange={(e) => setDid(e.target.value)}
                  placeholder="Tasks completed, features developed, code reviewed, milestones hit..."
                />
              </div>

              {myTasks.length > 0 && (
                <div>
                  <label className="label">Linked In-Progress Tasks (Optional)</label>
                  <div className="flex flex-wrap gap-2">
                    {myTasks.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleTask(t.id)}
                        className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                          taskIds.includes(t.id)
                            ? 'border-brand bg-brand-50 text-brand font-bold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {taskIds.includes(t.id) ? '✓ ' : '+ '}
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="label">2. Any Blockers or Dependencies? (Optional)</label>
                <input
                  className="input text-sm"
                  maxLength={2000}
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  placeholder="Need API access, awaiting QA feedback, server outage..."
                />
              </div>

              <div>
                <label className="label">3. Plan for Tomorrow *</label>
                <textarea
                  className="input text-sm resize-none"
                  required
                  rows={3}
                  maxLength={5000}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  placeholder="Key priority items you plan to execute next..."
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <label className="label !mb-0">Attach Supporting Files (Optional)</label>
                  <AttachButton onFiles={(f) => { void up.add(f); }} label="Upload files" />
                </div>
                <div className="mt-2">
                  <UploadChips items={up.items} onRemove={up.remove} onRetry={up.retry} />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
                <div className="w-36">
                  <label className="label">Hours Worked *</label>
                  <input
                    className="input text-sm"
                    required
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="btn !px-6"
                    disabled={busy || up.busy}
                  >
                    {busy ? 'Submitting...' : 'Submit Daily Report'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Quick Sidebar: My Recent Reports */}
          <div className="card lg:col-span-2">
            <h3 className="font-bold text-navy text-sm mb-3">My Recent Submissions</h3>
            {mine.length === 0 ? (
              <Empty title="No submissions yet" description="Your past daily reports will appear here." />
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {mine.slice(0, 15).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      setActiveReport(r);
                      setDetailOpen(true);
                    }}
                    className="flex cursor-pointer items-center justify-between py-3 px-2 hover:bg-slate-50 transition rounded-lg"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 text-xs">
                        {new Date(r.reportDate).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </p>
                      <p className="text-[11px] text-slate-400">{r.hoursWorked} hours recorded</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          r.isLate
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {r.isLate ? 'Late' : 'On Time'}
                      </span>
                      <span className="text-slate-400 text-xs">→</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EMPLOYEE REPORT HISTORY FULL VIEW */}
      {isStaff && tab === 'mine' && (
        <div className="card">
          <h3 className="font-bold text-navy text-base mb-4">Complete Report History</h3>
          {mine.length === 0 ? (
            <Empty title="No history found" description="You have not submitted any daily reports." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Hours</th>
                    <th className="px-5 py-3">Did Today</th>
                    <th className="px-5 py-3">Plan Tomorrow</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mine.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3.5 font-medium text-navy">{fmtDate(r.reportDate)}</td>
                      <td className="px-5 py-3.5">{r.hoursWorked}h</td>
                      <td className="px-5 py-3.5 max-w-xs truncate text-slate-600">{r.didToday}</td>
                      <td className="px-5 py-3.5 max-w-xs truncate text-slate-600">{r.planTomorrow}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            r.isLate ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {r.isLate ? 'Late' : 'On Time'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => {
                            setActiveReport(r);
                            setDetailOpen(true);
                          }}
                          className="btn-secondary !py-1 text-xs"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DETAIL MODAL: OPEN & READ INDIVIDUAL REPORT CONTENTS */}
      <Modal
        open={detailOpen && !!activeReport}
        onClose={() => setDetailOpen(false)}
        title="Daily Standup Report Details"
      >
        {activeReport && (
          <div className="space-y-4">
            {/* Applicant / User Info Header */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={activeReport.user?.displayName || 'User'} size="md" />
                <div>
                  <p className="font-bold text-navy text-sm">
                    {activeReport.user?.displayName || 'Employee'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {activeReport.user?.team?.name || 'Unassigned Team'} · {activeReport.user?.email}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    activeReport.isLate
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {activeReport.isLate ? 'Late Submission' : 'On-Time'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">
                  Report Date: <b>{fmtDate(activeReport.reportDate)}</b>
                </p>
              </div>
            </div>

            {/* Section 1: Accomplishments */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Accomplished Today ({activeReport.hoursWorked} hours)
              </label>
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                {activeReport.didToday}
              </div>
            </div>

            {/* Section 2: Blockers (if any) */}
            {activeReport.blockers && (
              <div>
                <label className="text-xs font-bold text-rose-700 uppercase tracking-wider block mb-1">
                  Reported Blockers
                </label>
                <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 text-xs text-rose-900 whitespace-pre-wrap">
                  {activeReport.blockers}
                </div>
              </div>
            )}

            {/* Section 3: Plan for Tomorrow */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Plan for Tomorrow
              </label>
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                {activeReport.planTomorrow}
              </div>
            </div>

            {/* Attached Tasks */}
            {activeReport.taskLinks && activeReport.taskLinks.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">
                  Linked Tasks ({activeReport.taskLinks.length})
                </label>
                <div className="space-y-1.5">
                  {activeReport.taskLinks.map((l) => (
                    <div
                      key={l.task.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-xs bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{l.task.title}</span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{l.task.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="btn-secondary !px-5"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
