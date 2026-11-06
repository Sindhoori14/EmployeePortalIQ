'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, PageHeader } from '../../../components/ui';

interface Requirement {
  id: string;
  reqCode: string;
  title: string;
  department: string;
  vacancies: number;
}

interface ParsedRow {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  specialization?: string;
  college?: string;
  graduationYear?: number;
  totalExp: number;
  relevantExp: number;
  techSkills: string;
  softSkills?: string;
  currentLocation: string;
  preferredLocation?: string;
  currentCtc?: string;
  expectedCtc?: string;
  noticePeriod?: string;
  resumeLink?: string;
  source?: string;
  hrRemarks?: string;
  isValid: boolean;
  errors: string[];
}

interface ValidationResponse {
  requirementId: string;
  reqCode: string;
  reqTitle: string;
  valid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedRow[];
}

function HrSupportSubmissionsContent() {
  const { user, loading } = useRequireAuth(['HR_SUPPORT', 'ADMIN']);
  const searchParams = useSearchParams();

  const [assignedReqs, setAssignedReqs] = useState<Requirement[]>([]);
  const [selectedReqId, setSelectedReqId] = useState(searchParams.get('requirementId') || '');
  const [loadingReqs, setLoadingReqs] = useState(true);

  // File & Content
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // Validation Result
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
  const [successResult, setSuccessResult] = useState<{ count: number; reqCode: string } | null>(null);

  useEffect(() => {
    if (user) {
      api<Requirement[]>('/recruitment/requirements')
        .then((rows) => {
          setAssignedReqs(rows);
          if (!selectedReqId && rows.length > 0) {
            setSelectedReqId(rows[0].id);
          }
        })
        .catch((e) => setErr(e.message))
        .finally(() => setLoadingReqs(false));
    }
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuccessResult(null);
    setValidationResult(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith('.csv') && selected.type !== 'text/csv') {
      alert('Please upload a valid CSV file (.csv)');
      return;
    }

    setFile(selected);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(selected, 'UTF-8');
  };

  const handleValidate = async () => {
    if (!selectedReqId) {
      alert('Please select an assigned recruitment requirement');
      return;
    }
    if (!csvContent.trim()) {
      alert('Please select a CSV file or paste valid CSV content');
      return;
    }

    setValidating(true);
    setErr('');
    setSuccessResult(null);

    try {
      const res = await api<ValidationResponse>(`/recruitment/requirements/${selectedReqId}/validate-csv`, {
        method: 'POST',
        body: { csvContent },
      });
      setValidationResult(res);
    } catch (e: any) {
      setErr(e.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!validationResult || !validationResult.valid || !selectedReqId) return;

    setSubmitting(true);
    setErr('');

    try {
      const payload = {
        candidates: validationResult.rows.map((r) => ({
          name: r.name,
          email: r.email,
          phone: r.phone,
          qualification: r.qualification,
          specialization: r.specialization,
          college: r.college,
          graduationYear: r.graduationYear,
          totalExp: r.totalExp,
          relevantExp: r.relevantExp,
          techSkills: r.techSkills,
          softSkills: r.softSkills,
          currentLocation: r.currentLocation,
          preferredLocation: r.preferredLocation,
          currentCtc: r.currentCtc,
          expectedCtc: r.expectedCtc,
          noticePeriod: r.noticePeriod,
          resumeLink: r.resumeLink,
          source: r.source,
          hrRemarks: r.hrRemarks,
        })),
      };

      const res = await api<{ count: number; reqCode: string }>(
        `/recruitment/requirements/${selectedReqId}/candidates/upload`,
        {
          method: 'POST',
          body: payload,
        },
      );

      setSuccessResult({ count: res.count, reqCode: res.reqCode });
      setValidationResult(null);
      setFile(null);
      setCsvContent('');
    } catch (e: any) {
      setErr(e.message || 'Failed to submit candidates');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) return <Loading />;

  const currentReq = assignedReqs.find((r) => r.id === selectedReqId);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Submit Candidates (CSV Upload)"
        sub="Bulk-upload candidate details for your assigned recruitment requirement. Pre-validates formats, numeric fields and prevents duplicate records."
      >
        <a
          href="/backend/recruitment/template/candidates.csv"
          download="candidates_template.csv"
          className="btn-secondary text-xs"
        >
          📥 Download Template CSV
        </a>
      </PageHeader>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          <p className="font-bold">Error Processing Submission</p>
          <p className="mt-1">{err}</p>
        </div>
      )}

      {/* Success banner */}
      {successResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 animate-fade">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <h3 className="text-base font-bold">Candidate Submission Successful!</h3>
              <p className="text-xs text-emerald-800 mt-1">
                Successfully submitted <strong>{successResult.count} candidate(s)</strong> for{' '}
                <strong>{successResult.reqCode}</strong>. The HR Manager has been notified and you can track their review status under{' '}
                <a href="/hr-support/history" className="font-bold underline hover:text-emerald-950">
                  Submission History
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Select Requirement */}
      <div className="card !p-5 space-y-3">
        <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
            1
          </span>
          Select Assigned Recruitment Requirement
        </h3>

        {loadingReqs ? (
          <p className="text-xs text-slate-400">Loading requirements...</p>
        ) : assignedReqs.length === 0 ? (
          <Empty
            icon="⚠️"
            title="No Assigned Requirements"
            sub="You need at least one assigned requirement to submit candidates. Contact the HR Manager."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs font-semibold">Target Requirement *</label>
              <select
                value={selectedReqId}
                onChange={(e) => {
                  setSelectedReqId(e.target.value);
                  setValidationResult(null);
                  setSuccessResult(null);
                }}
                className="input text-xs w-full font-semibold"
              >
                {assignedReqs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reqCode} — {r.title} ({r.department})
                  </option>
                ))}
              </select>
            </div>

            {currentReq && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Selected Job Details</span>
                <p className="font-bold text-ink-900 mt-0.5">{currentReq.title}</p>
                <p className="text-slate-500">
                  {currentReq.department} • {currentReq.vacancies} Vacancies
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 2: Upload CSV File */}
      <div className="card !p-5 space-y-4">
        <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
            2
          </span>
          Choose or Paste Candidate CSV
        </h3>

        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center hover:bg-slate-50 transition">
          <span className="text-3xl block mb-2">📄</span>
          <p className="text-xs font-bold text-ink-900">Choose a structured candidate CSV file</p>
          <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
            File must follow the standardized ElevateIQ format with required columns.
          </p>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-700 cursor-pointer"
          />

          {file && (
            <p className="text-xs text-brand-700 font-semibold mt-2">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <a
            href="/backend/recruitment/template/candidates.csv"
            download="candidates_template.csv"
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            📥 Need the column layout? Download Template CSV
          </a>

          <button
            onClick={handleValidate}
            disabled={validating || !csvContent.trim()}
            className="btn text-xs font-semibold !px-4"
          >
            {validating ? 'Validating CSV...' : 'Validate & Preview CSV →'}
          </button>
        </div>
      </div>

      {/* STEP 3: Preview & Automated Validation Results */}
      {validationResult && (
        <div className="card !p-5 space-y-4 animate-fade">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-bold text-ink-900">Candidate CSV Validation Results</h3>
              <p className="text-xs text-slate-500">
                Target: <strong>{validationResult.reqCode}</strong> — {validationResult.reqTitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Total Rows: {validationResult.totalRows}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                Valid: {validationResult.validRows}
              </span>
              {validationResult.invalidRows > 0 && (
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
                  Errors: {validationResult.invalidRows}
                </span>
              )}
            </div>
          </div>

          {/* Validation Status Notice */}
          {validationResult.valid ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-800 flex items-center justify-between">
              <div>
                <p className="font-bold">✓ All {validationResult.validRows} candidate records passed validation!</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  No missing mandatory fields, format issues or duplicate candidate records found. Ready to submit.
                </p>
              </div>
              <button
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="btn text-xs font-bold !bg-emerald-600 hover:!bg-emerald-700 text-white shrink-0 shadow-md"
              >
                {submitting ? 'Submitting...' : `Confirm & Submit ${validationResult.validRows} Candidates`}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800">
              <p className="font-bold">⚠️ Submission Blocked: {validationResult.invalidRows} row(s) contain errors</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Please review the errors highlighted below, update your CSV file accordingly, and re-upload. Incomplete or duplicate records will not be silently skipped.
              </p>
            </div>
          )}

          {/* Interactive Preview Table */}
          <div className="overflow-x-auto max-h-96 border rounded-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-600 font-semibold sticky top-0">
                  <th className="py-2.5 px-3">Row</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Candidate Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Qualification</th>
                  <th className="py-2.5 px-3">Experience</th>
                  <th className="py-2.5 px-3">Skills</th>
                  <th className="py-2.5 px-3">Validation Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {validationResult.rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`hover:bg-slate-50/70 ${!row.isValid ? 'bg-rose-50/40' : ''}`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-500">#{row.rowNumber}</td>
                    <td className="py-2.5 px-3">
                      {row.isValid ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          ✓ Valid
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          ✕ Invalid
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-ink-900">{row.name || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{row.email || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{row.phone || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{row.qualification || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">{row.totalExp} yrs</td>
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">{row.techSkills || '—'}</td>
                    <td className="py-2.5 px-3">
                      {row.errors.length > 0 ? (
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-700 font-medium">
                          {row.errors.map((e, idx) => (
                            <li key={idx}>{e}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-emerald-600 text-[11px]">Ready for upload</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Confirmation Action */}
          {validationResult.valid && (
            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="btn text-xs font-bold !px-6 !py-2 !bg-emerald-600 hover:!bg-emerald-700 text-white shadow-md"
              >
                {submitting ? 'Submitting Candidates...' : `Confirm & Save ${validationResult.validRows} Candidates`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HrSupportSubmissionsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <HrSupportSubmissionsContent />
    </Suspense>
  );
}
