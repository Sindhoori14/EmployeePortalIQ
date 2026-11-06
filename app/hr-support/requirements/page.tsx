'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, downloadFile, fmtDate, REQ_STATUS_COLORS, REQ_STATUS_LABEL } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, Modal, PageHeader } from '../../../components/ui';

interface Requirement {
  id: string;
  reqCode: string;
  title: string;
  department: string;
  vacancies: number;
  location: string;
  employmentType: string;
  priority?: string;
  creationMethod?: string;
  jdFileId?: string | null;
  jdFileName?: string | null;
  jdFileSize?: number | null;
  qualification: string;
  specialization?: string | null;
  minExp: number;
  maxExp: number;
  techSkills: string;
  softSkills?: string | null;
  certifications?: string | null;
  description: string;
  responsibilities: string;
  requiredSkills: string;
  preferredSkills?: string | null;
  additionalInstructions?: string | null;
  salaryRange?: string | null;
  expectedJoiningDate?: string | null;
  deadline?: string | null;
  status: string;
  createdAt: string;
  myCandidateCount: number;
  assignments: Array<{
    assignedAt: string;
  }>;
}

export default function HrSupportRequirementsPage() {
  const { user, loading } = useRequireAuth(['HR_SUPPORT', 'ADMIN']);

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null);

  const loadRequirements = () => {
    setLoadingData(true);
    api<Requirement[]>('/recruitment/requirements')
      .then((rows) => {
        setRequirements(rows);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (user) loadRequirements();
  }, [user]);

  if (loading || !user) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assigned Requirements"
        sub="Recruitment requirements assigned to your account by the HR Manager. Download the candidate CSV template to submit profiles."
      >
        <a
          href="/backend/recruitment/template/candidates.csv"
          download="candidates_template.csv"
          className="btn-secondary text-xs"
        >
          📥 Download CSV Template
        </a>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Requirements Cards Grid */}
      {loadingData ? (
        <div className="p-8 text-center text-sm text-slate-400">Loading assigned requirements...</div>
      ) : requirements.length === 0 ? (
        <Empty
          icon="📋"
          title="No Requirements Assigned"
          sub="You currently have no recruitment requirements assigned to your account. Check back once HR Manager assigns job openings."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requirements.map((req) => (
            <div
              key={req.id}
              className="card !p-5 flex flex-col justify-between hover:shadow-md transition border border-slate-200"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {req.reqCode}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      REQ_STATUS_COLORS[req.status] || 'bg-slate-100'
                    }`}
                  >
                    {REQ_STATUS_LABEL[req.status] || req.status}
                  </span>
                </div>

                <h3 className="text-base font-bold text-ink-900">{req.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {req.department} • {req.location} • {req.employmentType}
                </p>

                <div className="grid grid-cols-3 gap-2 my-3 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Vacancies</span>
                    <span className="font-bold text-ink-900">{req.vacancies}</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Experience</span>
                    <span className="font-bold text-ink-900">{req.minExp}-{req.maxExp} yrs</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">My Submissions</span>
                    <span className="font-bold text-brand-600">{req.myCandidateCount || 0}</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  <p>
                    <strong className="text-slate-700">Qualification:</strong> {req.qualification}
                    {req.specialization ? ` (${req.specialization})` : ''}
                  </p>
                  <p className="truncate">
                    <strong className="text-slate-700">Required Skills:</strong> {req.techSkills}
                  </p>
                  {req.deadline && (
                    <p className="text-amber-700 font-medium">
                      ⏰ Deadline: {fmtDate(req.deadline)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100">
                <button
                  onClick={() => setSelectedReq(req)}
                  className="btn-secondary !px-3 !py-1.5 text-xs font-semibold"
                >
                  View Details & JD
                </button>
                <Link
                  href={`/hr-support/submissions?requirementId=${req.id}`}
                  className="btn !px-3 !py-1.5 text-xs font-semibold"
                >
                  📤 Upload Candidates
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REQUIREMENT DETAIL MODAL */}
      {selectedReq && (
        <Modal open={true} onClose={() => setSelectedReq(null)} title={`${selectedReq.reqCode}: ${selectedReq.title}`}>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs text-slate-700">
            <div className="border-b pb-3">
              <h3 className="text-base font-bold text-ink-900">{selectedReq.title}</h3>
              <p className="text-slate-500">
                {selectedReq.department} • {selectedReq.location} • {selectedReq.employmentType}
              </p>
              {selectedReq.salaryRange && (
                <p className="text-xs font-semibold text-emerald-700 mt-1">Salary: {selectedReq.salaryRange}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2 border">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Vacancies</span>
                <span className="font-bold text-ink-900">{selectedReq.vacancies}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Experience</span>
                <span className="font-bold text-ink-900">{selectedReq.minExp}-{selectedReq.maxExp} yrs</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Qualification</span>
                <span className="font-bold text-ink-900">{selectedReq.qualification}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Deadline</span>
                <span className="font-bold text-ink-900">{fmtDate(selectedReq.deadline)}</span>
              </div>
            </div>

            {/* Prominent Attached JD Document Section */}
            {selectedReq.jdFileName && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">
                    📄
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{selectedReq.jdFileName}</p>
                    <p className="text-[11px] text-slate-500">
                      Complete Job Description Document • {selectedReq.jdFileSize ? `${Math.round(selectedReq.jdFileSize / 1024)} KB` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/backend/recruitment/requirements/${selectedReq.id}/jd`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5"
                  >
                    👁️ View Job Description
                  </a>
                  <button
                    onClick={() =>
                      downloadFile(
                        `/recruitment/requirements/${selectedReq.id}/jd?download=1`,
                        selectedReq.jdFileName || 'job_description.pdf',
                      )
                    }
                    className="btn-primary !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5"
                  >
                    📥 Download Job Description
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div>
                <h4 className="font-bold text-ink-900">Job Description</h4>
                <p className="mt-1 whitespace-pre-wrap bg-slate-50 p-2.5 rounded border border-slate-100">
                  {selectedReq.description}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-ink-900">Roles & Responsibilities</h4>
                <p className="mt-1 whitespace-pre-wrap bg-slate-50 p-2.5 rounded border border-slate-100">
                  {selectedReq.responsibilities}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-ink-900">Required Technical Skills</h4>
                <p className="mt-1 bg-slate-50 p-2 rounded border border-slate-100">
                  {selectedReq.techSkills}
                </p>
              </div>

              {selectedReq.preferredSkills && (
                <div>
                  <h4 className="font-bold text-ink-900">Preferred Skills</h4>
                  <p className="mt-1 bg-slate-50 p-2 rounded border border-slate-100">
                    {selectedReq.preferredSkills}
                  </p>
                </div>
              )}

              {selectedReq.additionalInstructions && (
                <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-200">
                  <h4 className="font-bold text-amber-900">Manager's Additional Instructions</h4>
                  <p className="mt-1 text-amber-800">{selectedReq.additionalInstructions}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <a
                href="/backend/recruitment/template/candidates.csv"
                download="candidates_template.csv"
                className="btn-secondary text-xs"
              >
                📥 Download Template CSV
              </a>
              <Link
                href={`/hr-support/submissions?requirementId=${selectedReq.id}`}
                className="btn text-xs font-semibold"
              >
                Upload Candidates for this Job →
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
