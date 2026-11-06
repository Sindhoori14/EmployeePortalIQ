'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  api,
  CANDIDATE_STATUS_COLORS,
  CANDIDATE_STATUS_LABEL,
  fmtDate,
  downloadFile,
} from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, Modal, PageHeader } from '../../../components/ui';

interface Candidate {
  id: string;
  candidateCode: string;
  requirementId: string;
  submittedById: string;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  specialization?: string | null;
  college?: string | null;
  graduationYear?: number | null;
  totalExp: number;
  relevantExp: number;
  techSkills: string;
  softSkills?: string | null;
  currentLocation: string;
  preferredLocation?: string | null;
  currentCtc?: string | null;
  expectedCtc?: string | null;
  noticePeriod?: string | null;
  resumeLink?: string | null;
  source?: string | null;
  hrRemarks?: string | null;
  status: string;
  interviewDate?: string | null;
  createdAt: string;
  requirement: {
    id: string;
    reqCode: string;
    title: string;
    department: string;
  };
  submittedBy: {
    id: string;
    displayName: string;
    email: string;
    role?: string;
  };
  history?: Array<{
    id: string;
    previousStatus: string | null;
    newStatus: string;
    remarks: string | null;
    interviewFeedback: string | null;
    internalNotes: string | null;
    nextAction: string | null;
    interviewDate: string | null;
    createdAt: string;
    changedBy: {
      id: string;
      displayName: string;
      email: string;
      role: string;
    };
  }>;
}

function HrManagerCandidatesContent() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);
  const searchParams = useSearchParams();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');

  // Dropdown lists for filters
  const [requirementsList, setRequirementsList] = useState<Array<{ id: string; reqCode: string; title: string }>>([]);
  const [hrUsers, setHrUsers] = useState<Array<{ id: string; displayName: string }>>([]);

  // Active filters
  const [filterReq, setFilterReq] = useState(searchParams.get('requirementId') || '');
  const [filterSubmitter, setFilterSubmitter] = useState(searchParams.get('submittedById') || '');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMinExp, setFilterMinExp] = useState('');
  const [filterMaxExp, setFilterMaxExp] = useState('');
  const [search, setSearch] = useState('');

  // Selected candidate for detailed profile & status update
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [updating, setUpdating] = useState(false);

  // Status update form
  const [statusForm, setStatusForm] = useState({
    status: 'SUBMITTED',
    remarks: '',
    interviewFeedback: '',
    internalNotes: '',
    nextAction: '',
    interviewDate: '',
  });

  const loadCandidates = () => {
    setLoadingData(true);
    const params = new URLSearchParams();
    if (filterReq) params.set('requirementId', filterReq);
    if (filterSubmitter) params.set('submittedById', filterSubmitter);
    if (filterStatus) params.set('status', filterStatus);
    if (filterMinExp) params.set('minExp', filterMinExp);
    if (filterMaxExp) params.set('maxExp', filterMaxExp);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(limit));

    api<{ total: number; data: Candidate[] }>(`/recruitment/candidates?${params.toString()}`)
      .then((res) => {
        setCandidates(res.data);
        setTotal(res.total);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  };

  const loadFilterOptions = () => {
    api<Array<{ id: string; reqCode: string; title: string }>>('/recruitment/requirements')
      .then((rows) => setRequirementsList(rows.map((r) => ({ id: r.id, reqCode: r.reqCode, title: r.title }))))
      .catch(() => {});

    api<Array<{ id: string; displayName: string }>>('/recruitment/hr-support-users')
      .then(setHrUsers)
      .catch(() => {});
  };

  useEffect(() => {
    if (user) {
      loadCandidates();
      loadFilterOptions();
    }
  }, [user, page, filterReq, filterSubmitter, filterStatus]);

  const openProfile = (id: string) => {
    api<Candidate>(`/recruitment/candidates/${id}`)
      .then((c) => {
        setSelectedCandidate(c);
        setStatusForm({
          status: c.status,
          remarks: '',
          interviewFeedback: '',
          internalNotes: '',
          nextAction: '',
          interviewDate: c.interviewDate ? c.interviewDate.slice(0, 10) : '',
        });
      })
      .catch((e) => alert(e.message));
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    setUpdating(true);
    try {
      const updated = await api<Candidate>(`/recruitment/candidates/${selectedCandidate.id}/status`, {
        method: 'PATCH',
        body: statusForm,
      });
      setSelectedCandidate(updated);
      loadCandidates();
      alert(`Candidate status updated to ${statusForm.status}`);
    } catch (e: any) {
      alert(e.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterReq) params.set('requirementId', filterReq);
    if (filterSubmitter) params.set('submittedById', filterSubmitter);
    if (filterStatus) params.set('status', filterStatus);
    downloadFile(`/recruitment/export/candidates?${params.toString()}`, 'candidates_export.csv').catch((e) =>
      alert(e.message),
    );
  };

  if (loading || !user) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidate Management"
        sub="Review candidate profiles across all HR Support team members, update hiring stages and record feedback."
      >
        <button onClick={handleExport} className="btn-secondary text-xs">
          📥 Export to CSV
        </button>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Multi-Filters Bar */}
      <div className="card !p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Requirement Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
              Requirement
            </label>
            <select
              value={filterReq}
              onChange={(e) => {
                setFilterReq(e.target.value);
                setPage(1);
              }}
              className="input text-xs w-full"
            >
              <option value="">All Requirements</option>
              {requirementsList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reqCode} - {r.title}
                </option>
              ))}
            </select>
          </div>

          {/* HR Support Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
              Submitted By (HR Support)
            </label>
            <select
              value={filterSubmitter}
              onChange={(e) => {
                setFilterSubmitter(e.target.value);
                setPage(1);
              }}
              className="input text-xs w-full"
            >
              <option value="">All HR Support Users</option>
              {hrUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
              Recruitment Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="input text-xs w-full"
            >
              <option value="">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="INTERVIEW_SCHEDULED">Interview Scheduled</option>
              <option value="SELECTED">Selected</option>
              <option value="REJECTED">Rejected</option>
              <option value="ON_HOLD">On Hold</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
              Search
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Name, email, skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadCandidates()}
                className="input text-xs flex-1"
              />
              <button onClick={loadCandidates} className="btn-secondary !px-2.5 text-xs">
                Go
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t">
          <span>Found {total} candidate(s)</span>
          {(filterReq || filterSubmitter || filterStatus || search) && (
            <button
              onClick={() => {
                setFilterReq('');
                setFilterSubmitter('');
                setFilterStatus('');
                setSearch('');
                setFilterMinExp('');
                setFilterMaxExp('');
                setPage(1);
              }}
              className="text-brand-600 font-semibold hover:underline"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Candidates Table */}
      <div className="card overflow-hidden !p-0">
        {loadingData ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading candidates...</div>
        ) : candidates.length === 0 ? (
          <Empty
            icon="👥"
            title="No Candidates Found"
            sub="No candidate records match your current filter criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-3">Candidate</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">Qualification</th>
                  <th className="py-3 px-3 text-center">Exp (Yrs)</th>
                  <th className="py-3 px-3">Requirement</th>
                  <th className="py-3 px-3">Submitted By</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3">
                      <button
                        onClick={() => openProfile(c.id)}
                        className="font-bold text-ink-900 hover:text-brand-600 hover:underline text-left block"
                      >
                        {c.name}
                      </button>
                      <span className="font-mono text-[10px] text-slate-400">{c.candidateCode}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <p>{c.email}</p>
                      <p className="text-slate-400 text-[10px]">{c.phone}</p>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <p className="font-medium text-ink-900">{c.qualification}</p>
                      {c.specialization && <p className="text-[10px] text-slate-400">{c.specialization}</p>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold text-ink-900">{c.totalExp}</span>
                      <span className="text-[10px] text-slate-400 block">({c.relevantExp} rel)</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono font-bold text-slate-700">{c.requirement.reqCode}</span>
                      <p className="text-[11px] text-slate-500 truncate max-w-[140px]">{c.requirement.title}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-brand-700 bg-brand-50 rounded px-2 py-0.5 inline-block text-[11px]">
                        {c.submittedBy.displayName}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{fmtDate(c.createdAt)}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          CANDIDATE_STATUS_COLORS[c.status] || 'bg-slate-100'
                        }`}
                      >
                        {CANDIDATE_STATUS_LABEL[c.status] || c.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => openProfile(c.id)}
                        className="btn-secondary !px-2.5 !py-1 text-xs font-semibold"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between p-3 border-t text-xs text-slate-500">
            <span>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </span>
            <div className="space-x-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage(page + 1)}
                className="btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAILED CANDIDATE PROFILE & STATUS UPDATER MODAL */}
      {selectedCandidate && (
        <Modal
          open={true}
          onClose={() => setSelectedCandidate(null)}
          title={`Candidate Profile: ${selectedCandidate.name}`}
        >
          <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1 text-xs text-slate-700">
            {/* Header info */}
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-ink-900">{selectedCandidate.name}</h3>
                <p className="font-mono text-xs text-slate-400">{selectedCandidate.candidateCode}</p>
                <p className="mt-1 text-slate-600">
                  {selectedCandidate.email} • {selectedCandidate.phone}
                </p>
                <p className="text-slate-500">
                  Location: <span className="font-medium text-ink-900">{selectedCandidate.currentLocation}</span>
                  {selectedCandidate.preferredLocation && ` (Prefers: ${selectedCandidate.preferredLocation})`}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                    CANDIDATE_STATUS_COLORS[selectedCandidate.status] || 'bg-slate-100'
                  }`}
                >
                  {CANDIDATE_STATUS_LABEL[selectedCandidate.status] || selectedCandidate.status}
                </span>
                <p className="text-[11px] text-slate-400 mt-1">
                  Submitted by <span className="font-semibold text-slate-700">{selectedCandidate.submittedBy.displayName}</span>
                </p>
                <p className="text-[10px] text-slate-400">{fmtDate(selectedCandidate.createdAt)}</p>
              </div>
            </div>

            {/* Resume Link & Key Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Requirement</p>
                <p className="font-bold text-ink-900">{selectedCandidate.requirement.reqCode}</p>
                <p className="truncate text-[10px] text-slate-500">{selectedCandidate.requirement.title}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Total Experience</p>
                <p className="text-base font-bold text-ink-900">{selectedCandidate.totalExp} Years</p>
                <p className="text-[10px] text-slate-500">{selectedCandidate.relevantExp} yrs relevant</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Compensation</p>
                <p className="text-xs font-bold text-ink-900">{selectedCandidate.expectedCtc || 'Not specified'}</p>
                <p className="text-[10px] text-slate-500">Current: {selectedCandidate.currentCtc || '—'}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Notice Period</p>
                <p className="text-xs font-bold text-ink-900">{selectedCandidate.noticePeriod || 'Standard'}</p>
                <p className="text-[10px] text-slate-500">Source: {selectedCandidate.source || 'Direct'}</p>
              </div>
            </div>

            {/* Resume Link Banner */}
            {selectedCandidate.resumeLink && (
              <div className="rounded-xl bg-blue-50/80 border border-blue-200 p-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-blue-900">Candidate Resume / CV</p>
                  <p className="text-[11px] text-blue-700 truncate max-w-sm">{selectedCandidate.resumeLink}</p>
                </div>
                <a
                  href={selectedCandidate.resumeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn text-xs !bg-blue-600 hover:!bg-blue-700 !px-3 !py-1 text-white shadow-sm shrink-0"
                >
                  🔗 Open Resume
                </a>
              </div>
            )}

            {/* Education & Skills */}
            <div className="space-y-2 border-t pt-2">
              <div>
                <h4 className="font-bold text-ink-900">Education</h4>
                <p className="text-slate-700">
                  <span className="font-semibold">{selectedCandidate.qualification}</span>
                  {selectedCandidate.specialization && ` - ${selectedCandidate.specialization}`}
                  {selectedCandidate.college && ` at ${selectedCandidate.college}`}
                  {selectedCandidate.graduationYear && ` (${selectedCandidate.graduationYear})`}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-ink-900">Technical Skills</h4>
                <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                  {selectedCandidate.techSkills}
                </p>
              </div>

              {selectedCandidate.softSkills && (
                <div>
                  <h4 className="font-bold text-ink-900">Soft Skills</h4>
                  <p className="text-slate-600">{selectedCandidate.softSkills}</p>
                </div>
              )}

              {selectedCandidate.hrRemarks && (
                <div>
                  <h4 className="font-bold text-ink-900">HR Support Submitter Remarks</h4>
                  <p className="text-slate-600 bg-amber-50/50 p-2 rounded border border-amber-100 italic">
                    "{selectedCandidate.hrRemarks}"
                  </p>
                </div>
              )}
            </div>

            {/* STATUS UPDATER SECTION */}
            <div className="rounded-xl border-2 border-brand-200 bg-brand-50/30 p-3 space-y-3">
              <h4 className="font-bold text-ink-900 text-sm flex items-center gap-1.5">
                <span>⚡</span> Update Candidate Status & Feedback
              </h4>

              <form onSubmit={handleStatusSubmit} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label text-[11px] font-semibold">New Recruitment Status *</label>
                    <select
                      value={statusForm.status}
                      onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                      className="input text-xs w-full font-bold text-ink-900"
                    >
                      <option value="SUBMITTED">Submitted</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="SHORTLISTED">Shortlisted</option>
                      <option value="INTERVIEW_SCHEDULED">Interview Scheduled</option>
                      <option value="SELECTED">Selected</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="ON_HOLD">On Hold</option>
                    </select>
                  </div>

                  <div>
                    <label className="label text-[11px] font-semibold">Interview Date (When applicable)</label>
                    <input
                      type="date"
                      value={statusForm.interviewDate}
                      onChange={(e) => setStatusForm({ ...statusForm, interviewDate: e.target.value })}
                      className="input text-xs w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="label text-[11px] font-semibold">Review Remarks / Status Feedback</label>
                  <textarea
                    rows={2}
                    placeholder="Feedback visible to HR Support regarding this status change..."
                    value={statusForm.remarks}
                    onChange={(e) => setStatusForm({ ...statusForm, remarks: e.target.value })}
                    className="input text-xs w-full"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label text-[11px] font-semibold">Interview Feedback (Technical/HR)</label>
                    <textarea
                      rows={2}
                      placeholder="Feedback from interviewers..."
                      value={statusForm.interviewFeedback}
                      onChange={(e) => setStatusForm({ ...statusForm, interviewFeedback: e.target.value })}
                      className="input text-xs w-full"
                    />
                  </div>
                  <div>
                    <label className="label text-[11px] font-semibold">Internal Notes (Manager Only)</label>
                    <textarea
                      rows={2}
                      placeholder="Salary expectations, team fit notes..."
                      value={statusForm.internalNotes}
                      onChange={(e) => setStatusForm({ ...statusForm, internalNotes: e.target.value })}
                      className="input text-xs w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <input
                    type="text"
                    placeholder="Next action (e.g. Schedule Round 2, Send Offer)"
                    value={statusForm.nextAction}
                    onChange={(e) => setStatusForm({ ...statusForm, nextAction: e.target.value })}
                    className="input text-xs w-2/3"
                  />
                  <button
                    type="submit"
                    disabled={updating}
                    className="btn text-xs font-semibold !px-4"
                  >
                    {updating ? 'Saving...' : 'Update Status'}
                  </button>
                </div>
              </form>
            </div>

            {/* AUDIT STATUS HISTORY TIMELINE */}
            <div className="border-t pt-3">
              <h4 className="font-bold text-ink-900 mb-2">Candidate Status & Feedback History</h4>
              {selectedCandidate.history && selectedCandidate.history.length > 0 ? (
                <div className="space-y-2 border-l-2 border-slate-200 pl-3 ml-2">
                  {selectedCandidate.history.map((h) => (
                    <div key={h.id} className="relative pb-2">
                      <span className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            CANDIDATE_STATUS_COLORS[h.newStatus] || 'bg-slate-100'
                          }`}
                        >
                          {CANDIDATE_STATUS_LABEL[h.newStatus] || h.newStatus}
                        </span>
                        <span className="text-[11px] font-semibold text-ink-900">{h.changedBy.displayName}</span>
                        <span className="text-[10px] text-slate-400">({h.changedBy.role})</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{new Date(h.createdAt).toLocaleString()}</span>
                      </div>
                      {h.remarks && <p className="mt-1 text-slate-700 bg-slate-50 p-1.5 rounded text-xs">{h.remarks}</p>}
                      {h.interviewFeedback && (
                        <p className="mt-1 text-purple-800 bg-purple-50 p-1.5 rounded text-xs">
                          <span className="font-semibold">Interview Feedback:</span> {h.interviewFeedback}
                        </p>
                      )}
                      {h.nextAction && (
                        <p className="mt-0.5 text-[11px] text-slate-500 font-medium">Next: {h.nextAction}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-xs">No status changes recorded yet.</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function HrManagerCandidatesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <HrManagerCandidatesContent />
    </Suspense>
  );
}
