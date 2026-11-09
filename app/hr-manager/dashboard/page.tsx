'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, CANDIDATE_STATUS_COLORS, CANDIDATE_STATUS_LABEL, REQ_STATUS_COLORS, REQ_STATUS_LABEL } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Loading, PageHeader, Stat } from '../../../components/ui';
import { AttendanceGlance } from '../../../components/AttendanceGlance';
import { useMyAttendance } from '../../../components/AttendanceProvider';

interface ManagerOverview {
  totalEmployees: number;
  totalActiveRequirements: number;
  totalOpenVacancies: number;
  totalCandidates: number;
  statusCounts: Record<string, number>;
  candidatePipeline: Array<{ label: string; count: number; color: string }>;
  recentRequirements: Array<{
    id: string;
    reqCode: string;
    title: string;
    department: string;
    vacancies: number;
    status: string;
    candidateCount: number;
  }>;
  hrSupportPerformance: Array<{
    id: string;
    displayName: string;
    email: string;
    totalSubmitted: number;
    shortlisted: number;
    selected: number;
    rejected: number;
  }>;
  monthlyTrends: Array<{ month: string; count: number }>;
}

export default function HrManagerDashboardPage() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);
  const att = useMyAttendance();
  const [data, setData] = useState<ManagerOverview | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    setRefreshing(true);
    api<ManagerOverview>('/recruitment/dashboard/overview')
      .then((res) => {
        setData(res);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  if (loading || !user) return <Loading />;

  const status = data?.statusCounts || {};
  const maxMonthly = Math.max(1, ...(data?.monthlyTrends.map((m) => m.count) || [1]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Manager Dashboard"
        sub="Complete recruitment management, pipeline analytics and workforce oversight."
      >
        <button
          onClick={loadData}
          disabled={refreshing}
          className="btn-secondary text-xs"
        >
          {refreshing ? 'Refreshing...' : '🔄 Refresh'}
        </button>
        <Link href="/hr-manager/requirements?new=1" className="btn text-xs">
          + Create Requirement
        </Link>
        <Link href="/hr-manager/candidates" className="btn-secondary text-xs">
          View All Candidates
        </Link>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {att.today && att.today.workingDay && !att.today.record && (
        <Link href="/attendance" className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 transition hover:bg-orange-100">
          <span className="text-xl">🕘</span><span><b>You have not checked in yet.</b> Tap to mark your attendance.</span><span className="ml-auto font-semibold">Check in →</span>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total Employees" value={data?.totalEmployees ?? 0} tone="brand" hint="Active in organization" />
        <Stat label="Active Requirements" value={data?.totalActiveRequirements ?? 0} tone="brand" hint="Open & in progress" />
        <Stat label="Open Vacancies" value={data?.totalOpenVacancies ?? 0} tone="warn" hint="Positions to fill" />
        <Stat label="Total Candidates" value={data?.totalCandidates ?? 0} tone="default" hint="All-time submissions" />
        <Stat label="Under Review" value={status.UNDER_REVIEW ?? 0} tone="warn" hint="Awaiting review" />
        <Stat label="Shortlisted" value={status.SHORTLISTED ?? 0} tone="brand" hint="Qualified candidates" />
        <Stat label="Interviews Scheduled" value={status.INTERVIEW_SCHEDULED ?? 0} tone="warn" hint="Upcoming interviews" />
        <Stat label="Selected Candidates" value={status.SELECTED ?? 0} tone="success" hint="Hired / Selected" />
        <Stat label="Rejected Candidates" value={status.REJECTED ?? 0} tone="danger" hint="Not suitable" />
        <Stat label="On Hold" value={status.ON_HOLD ?? 0} tone="default" hint="Pending decision" />
      </div>

      <AttendanceGlance />

      {/* Recruitment Pipeline Funnel */}
      <div className="card !p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-900">Candidate Recruitment Pipeline</h2>
            <p className="text-xs text-slate-500">Live progress across screening, evaluation and final selection</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {data?.totalCandidates ?? 0} Total in Pipeline
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(data?.candidatePipeline || []).map((step) => {
            const pct = data?.totalCandidates ? Math.round((step.count / data.totalCandidates) * 100) : 0;
            return (
              <div key={step.label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{step.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{step.count}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: step.color }} />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{pct}% of total</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Requirement-wise Candidate Submissions */}
        <div className="card !p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-900">Active Recruitment Requirements</h2>
            <Link href="/hr-manager/requirements" className="text-xs font-semibold text-accent-600 hover:underline">
              View All →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 font-semibold">Requirement</th>
                  <th className="pb-2 font-semibold">Department</th>
                  <th className="pb-2 font-semibold">Vacancies</th>
                  <th className="pb-2 font-semibold">Candidates</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.recentRequirements || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No active requirements found. Click "+ Create Requirement" to get started.
                    </td>
                  </tr>
                ) : (
                  (data?.recentRequirements || []).map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 font-medium text-ink-900">
                        <Link href={`/hr-manager/requirements?id=${req.id}`} className="hover:text-brand-600 hover:underline">
                          <span className="font-mono text-slate-500 mr-1.5">{req.reqCode}</span>
                          {req.title}
                        </Link>
                      </td>
                      <td className="py-2.5 text-slate-600">{req.department}</td>
                      <td className="py-2.5 text-slate-600">{req.vacancies}</td>
                      <td className="py-2.5 font-semibold text-ink-900">{req.candidateCount}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${REQ_STATUS_COLORS[req.status] || 'bg-slate-100'}`}>
                          {REQ_STATUS_LABEL[req.status] || req.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* HR Support Performance */}
        <div className="card !p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-900">HR Support Sourcing Performance</h2>
            <Link href="/hr-manager/candidates" className="text-xs font-semibold text-accent-600 hover:underline">
              Filter by Submitter →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 font-semibold">HR Support</th>
                  <th className="pb-2 font-semibold text-center">Submitted</th>
                  <th className="pb-2 font-semibold text-center">Shortlisted</th>
                  <th className="pb-2 font-semibold text-center">Selected</th>
                  <th className="pb-2 font-semibold text-center">Success %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.hrSupportPerformance || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No candidate submissions recorded yet.
                    </td>
                  </tr>
                ) : (
                  (data?.hrSupportPerformance || []).map((hp) => {
                    const successPct = hp.totalSubmitted
                      ? Math.round(((hp.shortlisted + hp.selected) / hp.totalSubmitted) * 100)
                      : 0;
                    return (
                      <tr key={hp.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5">
                          <p className="font-semibold text-ink-900">{hp.displayName}</p>
                          <p className="text-[10px] text-slate-400">{hp.email}</p>
                        </td>
                        <td className="py-2.5 text-center font-bold text-ink-900">{hp.totalSubmitted}</td>
                        <td className="py-2.5 text-center font-medium text-purple-600">{hp.shortlisted}</td>
                        <td className="py-2.5 text-center font-medium text-emerald-600">{hp.selected}</td>
                        <td className="py-2.5 text-center">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {successPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monthly Submission Trends */}
      {data?.monthlyTrends && data.monthlyTrends.length > 0 && (
        <div className="card !p-5">
          <h2 className="mb-4 text-base font-bold text-ink-900">Monthly Candidate Submission Trends</h2>
          <div className="flex items-end gap-6 h-36 pt-4 pb-2">
            {data.monthlyTrends.map((m) => {
              const heightPct = Math.max(12, Math.round((m.count / maxMonthly) * 100));
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center h-full justify-end">
                  <span className="text-xs font-bold text-ink-900 mb-1">{m.count}</span>
                  <div
                    className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-brand-600 to-accent-500 transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="mt-2 text-[11px] font-semibold text-slate-500">{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
