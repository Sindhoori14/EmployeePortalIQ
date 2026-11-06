'use client';
import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Loading, PageHeader, Stat } from '../../../components/ui';

export default function HrManagerReportsPage() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);

  const [overview, setOverview] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (user) {
      api('/recruitment/dashboard/overview')
        .then(setOverview)
        .catch((e) => setErr(e.message))
        .finally(() => setLoadingData(false));
    }
  }, [user]);

  const exportAllCandidates = () => {
    downloadFile('/recruitment/export/candidates', 'all_candidates_report.csv').catch((e) => alert(e.message));
  };

  const exportAttendanceReport = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadFile(`/attendance/export?type=daily&date=${today}&format=csv`, `attendance_report_${today}.csv`).catch((e) =>
      alert(e.message),
    );
  };

  if (loading || !user) return <Loading />;

  const status = overview?.statusCounts || {};
  const total = overview?.totalCandidates || 0;
  const shortlistRate = total > 0 ? Math.round(((status.SHORTLISTED || 0) / total) * 100) : 0;
  const selectionRate = total > 0 ? Math.round(((status.SELECTED || 0) / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment & HR Reports"
        sub="Comprehensive recruitment metrics, sourcing performance, conversion rates and CSV report exports."
      >
        <button onClick={exportAllCandidates} className="btn text-xs font-semibold">
          📥 Export All Candidates (CSV)
        </button>
        <button onClick={exportAttendanceReport} className="btn-secondary text-xs">
          📥 Export Daily Attendance (CSV)
        </button>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* High-level conversion metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Sourced Candidates" value={total} tone="brand" />
        <Stat label="Shortlisting Rate" value={`${shortlistRate}%`} tone="brand" hint="Candidates shortlisted" />
        <Stat label="Final Selection Rate" value={`${selectionRate}%`} tone="success" hint="Hired / Selected" />
        <Stat
          label="Open Requirements"
          value={overview?.totalActiveRequirements || 0}
          tone="warn"
          hint={`${overview?.totalOpenVacancies || 0} vacancies`}
        />
      </div>

      {/* Sourcing Performance Breakdown */}
      <div className="card !p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-900">HR Support Team Sourcing & Conversion Report</h2>
            <p className="text-xs text-slate-500">Volume and conversion quality per assigned HR Support recruiter</p>
          </div>
          <button onClick={exportAllCandidates} className="btn-secondary text-xs">
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">HR Support Recruiter</th>
                <th className="py-2.5 px-3 text-center">Candidates Sourced</th>
                <th className="py-2.5 px-3 text-center">Shortlisted</th>
                <th className="py-2.5 px-3 text-center">Selected</th>
                <th className="py-2.5 px-3 text-center">Rejected</th>
                <th className="py-2.5 px-3 text-center">Conversion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(overview?.hrSupportPerformance || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No sourcing activity recorded yet.
                  </td>
                </tr>
              ) : (
                (overview?.hrSupportPerformance || []).map((hp: any) => {
                  const convPct = hp.totalSubmitted
                    ? Math.round(((hp.shortlisted + hp.selected) / hp.totalSubmitted) * 100)
                    : 0;
                  return (
                    <tr key={hp.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-ink-900">{hp.displayName}</p>
                        <p className="text-[10px] text-slate-400">{hp.email}</p>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-ink-900">{hp.totalSubmitted}</td>
                      <td className="py-2.5 px-3 text-center text-purple-600 font-semibold">{hp.shortlisted}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-600 font-bold">{hp.selected}</td>
                      <td className="py-2.5 px-3 text-center text-rose-600">{hp.rejected}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-brand-600">{convPct}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Requirement Progress Breakdown */}
      <div className="card !p-5">
        <h2 className="text-base font-bold text-ink-900 mb-2">Requirement Fulfillment Progress</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Req Code</th>
                <th className="py-2.5 px-3">Job Title</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3 text-center">Vacancies</th>
                <th className="py-2.5 px-3 text-center">Submissions</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(overview?.recentRequirements || []).map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 font-mono font-bold text-ink-900">{r.reqCode}</td>
                  <td className="py-2.5 px-3 font-semibold text-ink-900">{r.title}</td>
                  <td className="py-2.5 px-3 text-slate-600">{r.department}</td>
                  <td className="py-2.5 px-3 text-center font-bold">{r.vacancies}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-brand-600">{r.candidateCount}</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {r.status}
                    </span>
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
