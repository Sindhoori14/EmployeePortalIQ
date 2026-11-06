'use client';
import { useEffect, useState } from 'react';
import {
  api,
  CANDIDATE_STATUS_COLORS,
  CANDIDATE_STATUS_LABEL,
  fmtDate,
  downloadFile,
} from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, Modal, PageHeader } from '../../../components/ui';

interface CandidateItem {
  id: string;
  candidateCode: string;
  requirementId: string;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  specialization?: string | null;
  totalExp: number;
  relevantExp: number;
  techSkills: string;
  currentLocation: string;
  resumeLink?: string | null;
  status: string;
  interviewDate?: string | null;
  createdAt: string;
  requirement: {
    id: string;
    reqCode: string;
    title: string;
    department: string;
  };
  history?: Array<{
    remarks: string | null;
    interviewFeedback: string | null;
    newStatus: string;
    createdAt: string;
  }>;
}

export default function HrSupportHistoryPage() {
  const { user, loading } = useRequireAuth(['HR_SUPPORT', 'ADMIN']);

  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);

  const loadSubmissions = () => {
    setLoadingData(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', '25');

    api<{ total: number; data: CandidateItem[] }>(`/recruitment/candidates?${params.toString()}`)
      .then((res) => {
        setCandidates(res.data);
        setTotal(res.total);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (user) loadSubmissions();
  }, [user, page, statusFilter]);

  const openCandidateDetail = (id: string) => {
    api<any>(`/recruitment/candidates/${id}`)
      .then(setSelectedCandidate)
      .catch((e) => alert(e.message));
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    downloadFile(`/recruitment/export/candidates?${params.toString()}`, 'my_candidate_submissions.csv').catch((e) =>
      alert(e.message),
    );
  };

  if (loading || !user) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Candidate Submissions"
        sub="Track the evaluation progress, interview schedules and feedback from the HR Manager for your submitted candidates."
      >
        <button onClick={handleExport} className="btn-secondary text-xs">
          📥 Export My Submissions (CSV)
        </button>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Filter Bar */}
      <div className="card !p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search candidate name, email, skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadSubmissions()}
            className="input text-xs w-full"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="input text-xs"
        >
          <option value="">All Review Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="SHORTLISTED">Shortlisted</option>
          <option value="INTERVIEW_SCHEDULED">Interview Scheduled</option>
          <option value="SELECTED">Selected</option>
          <option value="REJECTED">Rejected</option>
          <option value="ON_HOLD">On Hold</option>
        </select>

        <button onClick={loadSubmissions} className="btn-secondary text-xs">
          Filter
        </button>
      </div>

      {/* Candidates List */}
      <div className="card overflow-hidden !p-0">
        {loadingData ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading your candidate submissions...</div>
        ) : candidates.length === 0 ? (
          <Empty
            icon="📤"
            title="No Submissions Found"
            sub="You have not submitted candidates yet, or none match the active filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-3">Candidate</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Requirement</th>
                  <th className="py-3 px-3">Submitted Date</th>
                  <th className="py-3 px-3">Recruitment Status</th>
                  <th className="py-3 px-3">HR Manager Feedback</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((c) => {
                  const latestHistory = c.history && c.history[0];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => openCandidateDetail(c.id)}
                          className="font-bold text-ink-900 hover:text-brand-600 hover:underline text-left"
                        >
                          {c.name}
                        </button>
                        <p className="font-mono text-[10px] text-slate-400">{c.candidateCode}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <p>{c.email}</p>
                        <p className="text-[10px] text-slate-400">{c.phone}</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-slate-700">{c.requirement.reqCode}</span>
                        <p className="text-[11px] text-slate-500 truncate max-w-[150px]">{c.requirement.title}</p>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{fmtDate(c.createdAt)}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            CANDIDATE_STATUS_COLORS[c.status] || 'bg-slate-100'
                          }`}
                        >
                          {CANDIDATE_STATUS_LABEL[c.status] || c.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-xs">
                        {latestHistory?.remarks ? (
                          <p className="text-slate-700 text-xs truncate" title={latestHistory.remarks}>
                            {latestHistory.remarks}
                          </p>
                        ) : latestHistory?.interviewFeedback ? (
                          <p className="text-purple-700 text-xs truncate font-medium" title={latestHistory.interviewFeedback}>
                            Feedback: {latestHistory.interviewFeedback}
                          </p>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Awaiting manager review</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => openCandidateDetail(c.id)}
                          className="btn-ghost !px-2.5 !py-1 text-xs"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 25 && (
          <div className="p-3 border-t flex items-center justify-between text-xs text-slate-500">
            <span>Showing {candidates.length} of {total} submissions</span>
            <div className="space-x-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page * 25 >= total}
                onClick={() => setPage(page + 1)}
                className="btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selectedCandidate && (
        <Modal
          open={true}
          onClose={() => setSelectedCandidate(null)}
          title={`Candidate Details: ${selectedCandidate.name}`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs text-slate-700">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="text-sm font-bold text-ink-900">{selectedCandidate.name}</h3>
                <p className="font-mono text-[11px] text-slate-400">{selectedCandidate.candidateCode}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  CANDIDATE_STATUS_COLORS[selectedCandidate.status] || 'bg-slate-100'
                }`}
              >
                {CANDIDATE_STATUS_LABEL[selectedCandidate.status] || selectedCandidate.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-slate-50 p-2 border">
                <span className="text-[10px] uppercase text-slate-400 font-semibold block">Requirement</span>
                <span className="font-bold text-ink-900">{selectedCandidate.requirement.reqCode}</span>
                <p className="text-[11px] text-slate-500">{selectedCandidate.requirement.title}</p>
              </div>
              <div className="rounded bg-slate-50 p-2 border">
                <span className="text-[10px] uppercase text-slate-400 font-semibold block">Experience</span>
                <span className="font-bold text-ink-900">{selectedCandidate.totalExp} Years</span>
                <p className="text-[11px] text-slate-500">{selectedCandidate.relevantExp} yrs relevant</p>
              </div>
            </div>

            {selectedCandidate.resumeLink && (
              <div className="rounded-lg bg-blue-50 p-2 border border-blue-200 flex items-center justify-between">
                <span className="font-semibold text-blue-900">Submitted Resume</span>
                <a
                  href={selectedCandidate.resumeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn text-xs !px-2.5 !py-1 !bg-blue-600 text-white"
                >
                  🔗 View Resume
                </a>
              </div>
            )}

            {/* Audit trail */}
            <div className="border-t pt-2">
              <h4 className="font-bold text-ink-900 mb-2">Manager Review History & Notes</h4>
              {selectedCandidate.history && selectedCandidate.history.length > 0 ? (
                <div className="space-y-2 border-l-2 border-slate-200 pl-3">
                  {selectedCandidate.history.map((h: any) => (
                    <div key={h.id} className="pb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            CANDIDATE_STATUS_COLORS[h.newStatus] || 'bg-slate-100'
                          }`}
                        >
                          {CANDIDATE_STATUS_LABEL[h.newStatus] || h.newStatus}
                        </span>
                        <span className="text-[10px] text-slate-400">{new Date(h.createdAt).toLocaleString()}</span>
                      </div>
                      {h.remarks && <p className="mt-1 text-slate-700 bg-slate-50 p-1.5 rounded">{h.remarks}</p>}
                      {h.interviewFeedback && (
                        <p className="mt-1 text-purple-800 bg-purple-50 p-1.5 rounded font-medium">
                          Feedback: {h.interviewFeedback}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No manager feedback recorded yet.</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
