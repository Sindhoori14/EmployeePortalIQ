'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Loading, PageHeader, Stat } from '../../../components/ui';
import { useMyAttendance } from '../../../components/AttendanceProvider';

interface HrSupportOverview {
  totalAssignedRequirements: number;
  newRequirements: number;
  inProgressRequirements: number;
  requirementsCompleted: number;
  totalCandidatesSubmitted: number;
  candidatesUnderReview: number;
  candidatesShortlisted: number;
  candidatesRejected: number;
  candidatesSelected: number;
  statusCounts: Record<string, number>;
}

export default function HrSupportDashboardPage() {
  const { user, loading } = useRequireAuth(['HR_SUPPORT', 'ADMIN']);
  const att = useMyAttendance();

  const [data, setData] = useState<HrSupportOverview | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    setRefreshing(true);
    api<HrSupportOverview>('/recruitment/dashboard/support-overview')
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user.displayName.split(' ')[0]} 👋`}
        sub="HR Support Sourcing Workspace: Track assigned requirements, submit candidates via CSV and monitor manager review feedback."
      >
        <button onClick={loadData} disabled={refreshing} className="btn-secondary text-xs">
          {refreshing ? 'Refreshing...' : '🔄 Refresh'}
        </button>
        <Link href="/hr-support/requirements" className="btn-secondary text-xs">
          Assigned Requirements
        </Link>
        <Link href="/hr-support/submissions" className="btn text-xs font-semibold">
          📤 Submit Candidates (CSV)
        </Link>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {att.today && att.today.workingDay && !att.today.record && (
        <Link href="/attendance" className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 transition hover:bg-orange-100">
          <span className="text-xl">🕘</span><span><b>You have not checked in yet.</b> Tap to mark your attendance.</span><span className="ml-auto font-semibold">Check in →</span>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Assigned Requirements"
          value={data?.totalAssignedRequirements ?? 0}
          tone="brand"
          hint={`${data?.newRequirements ?? 0} assigned this week`}
        />
        <Stat
          label="In Progress Jobs"
          value={data?.inProgressRequirements ?? 0}
          tone="warn"
          hint="Active sourcing targets"
        />
        <Stat
          label="Total Candidates Sourced"
          value={data?.totalCandidatesSubmitted ?? 0}
          tone="default"
          hint="Submitted by your account"
        />
        <Stat
          label="Under Review"
          value={data?.candidatesUnderReview ?? 0}
          tone="warn"
          hint="Manager evaluating"
        />
        <Stat
          label="Candidates Shortlisted"
          value={data?.candidatesShortlisted ?? 0}
          tone="brand"
          hint="Qualified for interviews"
        />
        <Stat
          label="Selected / Hired"
          value={data?.candidatesSelected ?? 0}
          tone="success"
          hint="Successful placements"
        />
        <Stat
          label="Rejected"
          value={data?.candidatesRejected ?? 0}
          tone="danger"
          hint="Did not meet requirements"
        />
        <Stat
          label="Requirements Completed"
          value={data?.requirementsCompleted ?? 0}
          tone="default"
          hint="Closed positions"
        />
      </div>

      {/* Sourcing Workflow Quick Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card !p-5 flex flex-col justify-between border-t-4 border-t-brand-600">
          <div>
            <span className="text-2xl mb-2 block">📋</span>
            <h3 className="font-bold text-ink-900 text-sm">1. Review Assigned Requirements</h3>
            <p className="text-xs text-slate-500 mt-1">
              Inspect job descriptions, skill requirements, experience thresholds and special hiring instructions.
            </p>
          </div>
          <Link href="/hr-support/requirements" className="btn-secondary text-xs mt-4 self-start">
            View Job Descriptions →
          </Link>
        </div>

        <div className="card !p-5 flex flex-col justify-between border-t-4 border-t-accent-600">
          <div>
            <span className="text-2xl mb-2 block">📤</span>
            <h3 className="font-bold text-ink-900 text-sm">2. Upload Candidates (CSV)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Download the candidate CSV template, source candidate profiles and validate your CSV with automated error detection.
            </p>
          </div>
          <Link href="/hr-support/submissions" className="btn text-xs font-semibold mt-4 self-start">
            Upload Candidate CSV →
          </Link>
        </div>

        <div className="card !p-5 flex flex-col justify-between border-t-4 border-t-emerald-600">
          <div>
            <span className="text-2xl mb-2 block">📊</span>
            <h3 className="font-bold text-ink-900 text-sm">3. Track Submission Status</h3>
            <p className="text-xs text-slate-500 mt-1">
              Monitor HR Manager review decisions, interview schedules and feedback for candidates you submitted.
            </p>
          </div>
          <Link href="/hr-support/history" className="btn-secondary text-xs mt-4 self-start">
            View My Submissions →
          </Link>
        </div>
      </div>
    </div>
  );
}
