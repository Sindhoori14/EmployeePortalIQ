'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  api,
  downloadFile,
  REQ_STATUS_COLORS,
  REQ_STATUS_LABEL,
  fmtDate,
} from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, Modal, PageHeader } from '../../../components/ui';

interface HrSupportUser {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

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
  createdById: string;
  createdAt: string;
  createdBy: { id: string; displayName: string; email: string };
  assignments: Array<{
    id: string;
    hrSupportId: string;
    hrSupport: { id: string; displayName: string; email: string };
  }>;
  candidateBreakdown?: Record<string, number>;
  totalCandidates?: number;
  statusCounts?: Record<string, number>;
  submissionsByHrSupport?: Array<{
    submitter: { id: string; displayName: string; email: string };
    count: number;
    statuses: Record<string, number>;
  }>;
}

function fmtSize(n?: number | null): string {
  if (!n) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const PRIORITY_BADGES: Record<string, string> = {
  URGENT: 'bg-rose-100 text-rose-800 border-rose-200',
  HIGH: 'bg-amber-100 text-amber-800 border-amber-200',
  MEDIUM: 'bg-blue-100 text-blue-800 border-blue-200',
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
};

function HrManagerRequirementsContent() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);
  const searchParams = useSearchParams();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [hrUsers, setHrUsers] = useState<HrSupportUser[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'DIRECT_UPLOAD'>('MANUAL');
  const [method1JdOption, setMethod1JdOption] = useState<'TEXT' | 'UPLOAD'>('TEXT');
  const [viewDetail, setViewDetail] = useState<Requirement | null>(null);
  const [editModal, setEditModal] = useState<Requirement | null>(null);
  const [saving, setSaving] = useState(false);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [jdUploading, setJdUploading] = useState(false);
  const [attachedJd, setAttachedJd] = useState<{
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  } | null>(null);

  // Form State
  const initialForm = {
    title: '',
    department: '',
    vacancies: 1,
    location: 'Remote',
    employmentType: 'Full-time',
    priority: 'MEDIUM',
    creationMethod: 'MANUAL',
    jdFileId: '',
    jdFileName: '',
    jdFileSize: 0,
    qualification: '',
    specialization: '',
    minExp: 0,
    maxExp: 0,
    techSkills: '',
    softSkills: '',
    certifications: '',
    description: '',
    responsibilities: '',
    requiredSkills: '',
    preferredSkills: '',
    additionalInstructions: '',
    salaryRange: '',
    expectedJoiningDate: '',
    deadline: '',
    status: 'OPEN',
    assignedHrSupportIds: [] as string[],
  };

  const [form, setForm] = useState(initialForm);

  const loadRequirements = () => {
    setLoadingList(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);

    api<Requirement[]>(`/recruitment/requirements?${params.toString()}`)
      .then((rows) => {
        setRequirements(rows);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingList(false));
  };

  const loadHrUsers = () => {
    api<HrSupportUser[]>('/recruitment/hr-support-users')
      .then(setHrUsers)
      .catch(() => {});
  };

  useEffect(() => {
    if (user) {
      loadRequirements();
      loadHrUsers();
      if (searchParams.get('new') === '1') {
        openCreateModal('MANUAL');
      }
    }
  }, [user, statusFilter]);

  const openCreateModal = (method: 'MANUAL' | 'DIRECT_UPLOAD' = 'MANUAL') => {
    setCreationMethod(method);
    setMethod1JdOption('TEXT');
    setAttachedJd(null);
    setForm({
      ...initialForm,
      creationMethod: method,
    });
    setCreateModal(true);
  };

  const openDetail = (id: string) => {
    api<Requirement>(`/recruitment/requirements/${id}`)
      .then(setViewDetail)
      .catch((e) => alert(e.message));
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext || '')) {
      alert('Only PDF, DOC, and DOCX documents are supported.');
      return;
    }
    setJdUploading(true);
    try {
      const res = await fetch(
        `/backend/recruitment/requirements/upload-jd?name=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setAttachedJd(data);
      setForm((prev) => ({
        ...prev,
        jdFileId: data.fileId,
        jdFileName: data.fileName,
        jdFileSize: data.fileSize,
        description:
          prev.description ||
          `Job Description provided in attached document: ${data.fileName}`,
        responsibilities:
          prev.responsibilities || 'Detailed in attached Job Description document.',
        techSkills:
          prev.techSkills || 'Detailed in attached Job Description document.',
        requiredSkills:
          prev.requiredSkills || 'Detailed in attached Job Description document.',
      }));
    } catch (e: any) {
      alert(e.message || 'File upload failed');
    } finally {
      setJdUploading(false);
    }
  };

  const handleRemoveAttachedJd = () => {
    setAttachedJd(null);
    setForm((prev) => ({
      ...prev,
      jdFileId: '',
      jdFileName: '',
      jdFileSize: 0,
    }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.assignedHrSupportIds.length === 0) {
      alert('Please assign at least one HR Support user.');
      return;
    }

    if (creationMethod === 'DIRECT_UPLOAD' && !form.jdFileId) {
      alert('Please upload a complete Job Description document (PDF, DOC, or DOCX).');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        ...form,
        creationMethod,
        priority: form.priority || 'MEDIUM',
      };

      if (creationMethod === 'DIRECT_UPLOAD') {
        payload.qualification = form.qualification || 'Relevant Degree / Experience';
        payload.techSkills = form.techSkills || 'See attached Job Description';
        payload.description =
          form.description || 'Complete Job Description provided in attached document.';
        payload.responsibilities =
          form.responsibilities || 'Refer to attached Job Description document.';
        payload.requiredSkills =
          form.requiredSkills || 'Refer to attached Job Description document.';
        payload.minExp = form.minExp ?? 0;
        payload.maxExp = form.maxExp ?? 0;
      }

      await api('/recruitment/requirements', {
        method: 'POST',
        body: payload,
      });

      setCreateModal(false);
      setForm(initialForm);
      setAttachedJd(null);
      loadRequirements();
    } catch (e: any) {
      alert(e.message || 'Failed to create requirement');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (req: Requirement) => {
    setForm({
      title: req.title,
      department: req.department,
      vacancies: req.vacancies,
      location: req.location,
      employmentType: req.employmentType,
      priority: req.priority || 'MEDIUM',
      creationMethod: req.creationMethod || 'MANUAL',
      jdFileId: req.jdFileId || '',
      jdFileName: req.jdFileName || '',
      jdFileSize: req.jdFileSize || 0,
      qualification: req.qualification,
      specialization: req.specialization || '',
      minExp: req.minExp,
      maxExp: req.maxExp,
      techSkills: req.techSkills,
      softSkills: req.softSkills || '',
      certifications: req.certifications || '',
      description: req.description,
      responsibilities: req.responsibilities,
      requiredSkills: req.requiredSkills,
      preferredSkills: req.preferredSkills || '',
      additionalInstructions: req.additionalInstructions || '',
      salaryRange: req.salaryRange || '',
      expectedJoiningDate: req.expectedJoiningDate
        ? req.expectedJoiningDate.slice(0, 10)
        : '',
      deadline: req.deadline ? req.deadline.slice(0, 10) : '',
      status: req.status,
      assignedHrSupportIds: req.assignments.map((a) => a.hrSupportId),
    });
    if (req.jdFileId && req.jdFileName) {
      setAttachedJd({
        fileId: req.jdFileId,
        fileName: req.jdFileName,
        fileSize: req.jdFileSize || 0,
        mimeType: '',
      });
    } else {
      setAttachedJd(null);
    }
    setEditModal(req);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    setSaving(true);
    try {
      await api(`/recruitment/requirements/${editModal.id}`, {
        method: 'PATCH',
        body: form,
      });
      setEditModal(null);
      loadRequirements();
      if (viewDetail && viewDetail.id === editModal.id) {
        openDetail(editModal.id);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to update requirement');
    } finally {
      setSaving(false);
    }
  };

  const toggleHrSupportAssignment = (id: string) => {
    setForm((prev) => {
      const exists = prev.assignedHrSupportIds.includes(id);
      return {
        ...prev,
        assignedHrSupportIds: exists
          ? prev.assignedHrSupportIds.filter((x) => x !== id)
          : [...prev.assignedHrSupportIds, id],
      };
    });
  };

  if (loading || !user) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment Requirements"
        sub="Create job openings, configure job descriptions, and assign requirements to HR Support team members."
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateModal('MANUAL')}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <span>📝</span> Method 1: Manual Form
          </button>
          <button
            onClick={() => openCreateModal('DIRECT_UPLOAD')}
            className="btn-primary text-xs flex items-center gap-1.5 shadow-sm"
          >
            <span>⚡</span> Method 2: Upload Complete JD
          </button>
        </div>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Filter and Search Controls */}
      <div className="card !p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="search"
            placeholder="Search by title, req code, department, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadRequirements()}
            className="input text-xs w-full"
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input text-xs"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <button onClick={loadRequirements} className="btn-secondary text-xs">
          Search
        </button>
      </div>

      {/* Requirements Table */}
      <div className="card overflow-hidden !p-0">
        {loadingList ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading requirements...</div>
        ) : requirements.length === 0 ? (
          <Empty
            icon="📋"
            title="No Recruitment Requirements Found"
            sub="Create your first requirement to assign it to HR Support users."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Req Code</th>
                  <th className="py-3 px-4">Job Title & Method</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-center">Vacancies</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Assigned HR Support</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-ink-900">{req.reqCode}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => openDetail(req.id)}
                          className="font-semibold text-ink-900 text-left hover:text-brand-600 hover:underline"
                        >
                          {req.title}
                        </button>
                        {req.creationMethod === 'DIRECT_UPLOAD' ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            ⚡ Uploaded JD
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            Manual Form
                          </span>
                        )}
                        {req.jdFileName && (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700">
                            📄 Attached
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-normal text-slate-400 mt-0.5">
                        {req.location} • {req.employmentType} • {req.minExp}-{req.maxExp} yrs
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{req.department}</td>
                    <td className="py-3 px-4 text-center font-bold text-ink-900">{req.vacancies}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          PRIORITY_BADGES[req.priority || 'MEDIUM'] || PRIORITY_BADGES.MEDIUM
                        }`}
                      >
                        {req.priority || 'MEDIUM'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {req.assignments && req.assignments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {req.assignments.map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                            >
                              {a.hrSupport.displayName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-medium">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{fmtDate(req.deadline)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          REQ_STATUS_COLORS[req.status] || 'bg-slate-100'
                        }`}
                      >
                        {REQ_STATUS_LABEL[req.status] || req.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => openDetail(req.id)}
                        className="btn-ghost !px-2 !py-1 text-xs"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEdit(req)}
                        className="btn-secondary !px-2 !py-1 text-xs"
                      >
                        Edit
                      </button>
                      <Link
                        href={`/hr-manager/candidates?requirementId=${req.id}`}
                        className="btn-ghost !px-2 !py-1 text-xs font-semibold text-brand-600"
                      >
                        Candidates
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE REQUIREMENT MODAL (METHOD 1 & METHOD 2) */}
      {createModal && (
        <Modal
          open={true}
          onClose={() => setCreateModal(false)}
          title="Create Recruitment Requirement"
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Method Segmented Selector */}
            <div className="bg-slate-100 p-1.5 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setCreationMethod('MANUAL');
                  setForm((f) => ({ ...f, creationMethod: 'MANUAL' }));
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                  creationMethod === 'MANUAL'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📝 Method 1: Complete Manual Form</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationMethod('DIRECT_UPLOAD');
                  setForm((f) => ({ ...f, creationMethod: 'DIRECT_UPLOAD' }));
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                  creationMethod === 'DIRECT_UPLOAD'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>⚡ Method 2: Upload Complete JD Direct</span>
              </button>
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            {/* FORM BODY */}
            <form onSubmit={handleCreate} className="space-y-4">
              {/* ================= METHOD 1: COMPLETE MANUAL FORM ================= */}
              {creationMethod === 'MANUAL' && (
                <>
                  <div className="border-b pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      1. Job Details & Role Information
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs font-semibold">Job Title *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Senior Frontend Engineer"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Department *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Product Engineering"
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Number of Vacancies *</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={form.vacancies}
                        onChange={(e) =>
                          setForm({ ...form, vacancies: parseInt(e.target.value, 10) || 1 })
                        }
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Job Location *</label>
                      <select
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        className="input text-xs w-full"
                      >
                        <option value="Remote">Remote</option>
                        <option value="On-site">On-site</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Employment Type *</label>
                      <select
                        value={form.employmentType}
                        onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                        className="input text-xs w-full"
                      >
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Priority</label>
                      <select
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value })}
                        className="input text-xs w-full"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Minimum Experience (Years) *</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        required
                        value={form.minExp}
                        onChange={(e) =>
                          setForm({ ...form, minExp: parseFloat(e.target.value) || 0 })
                        }
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Maximum Experience (Years) *</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        required
                        value={form.maxExp}
                        onChange={(e) =>
                          setForm({ ...form, maxExp: parseFloat(e.target.value) || 0 })
                        }
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Required Qualification *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. B.Tech / BE / MCA"
                        value={form.qualification}
                        onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Salary Range (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 10 - 15 LPA"
                        value={form.salaryRange}
                        onChange={(e) => setForm({ ...form, salaryRange: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                  </div>

                  {/* Skills Section */}
                  <div className="border-b pt-2 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      2. Skills & Capabilities
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="label text-xs font-semibold">Required Technical Skills *</label>
                      <textarea
                        required={!attachedJd}
                        rows={2}
                        placeholder="e.g. React, Next.js, TypeScript, Tailwind CSS"
                        value={form.techSkills}
                        onChange={(e) => setForm({ ...form, techSkills: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Key Responsibilities *</label>
                      <textarea
                        required={!attachedJd}
                        rows={2}
                        placeholder="Key responsibilities and day-to-day deliverables..."
                        value={form.responsibilities}
                        onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                  </div>

                  {/* JD Mode Selection: Option A (Write Text) vs Option B (Upload Document) */}
                  <div className="border-b pt-2 pb-2 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      3. Job Description (JD) Source
                    </h3>
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setMethod1JdOption('TEXT')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition ${
                          method1JdOption === 'TEXT'
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Option A: Write JD
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethod1JdOption('UPLOAD')}
                        className={`px-2.5 py-1 rounded-lg font-medium transition ${
                          method1JdOption === 'UPLOAD'
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Option B: Upload JD Document
                      </button>
                    </div>
                  </div>

                  {/* Option A: Text JD */}
                  {method1JdOption === 'TEXT' && (
                    <div>
                      <label className="label text-xs font-semibold">Detailed Job Description *</label>
                      <textarea
                        required={!attachedJd}
                        rows={4}
                        placeholder="Overview of the position, scope, requirements and team environment..."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                  )}

                  {/* Option B: Document Attachment */}
                  {method1JdOption === 'UPLOAD' && (
                    <div className="space-y-3">
                      {attachedJd ? (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">📄</span>
                            <div>
                              <p className="text-xs font-bold text-emerald-900">{attachedJd.fileName}</p>
                              <p className="text-[11px] text-emerald-700">
                                Uploaded successfully • {fmtSize(attachedJd.fileSize)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/backend/recruitment/jd/${attachedJd.fileId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-secondary !px-2.5 !py-1 text-xs"
                            >
                              Preview
                            </a>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="btn-secondary !px-2.5 !py-1 text-xs"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={handleRemoveAttachedJd}
                              className="btn-ghost !px-2.5 !py-1 text-xs text-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-xl p-6 text-center cursor-pointer bg-slate-50 hover:bg-brand-50/20 transition"
                        >
                          <span className="text-2xl block mb-1">📤</span>
                          <p className="text-xs font-semibold text-slate-700">
                            {jdUploading ? 'Uploading file...' : 'Click to select JD Document (PDF, DOC, DOCX)'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Maximum file size: 20 MB</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ================= METHOD 2: UPLOAD COMPLETE JD DIRECT ================= */}
              {creationMethod === 'DIRECT_UPLOAD' && (
                <div className="space-y-4">
                  <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl text-xs text-brand-900">
                    <p className="font-bold">⚡ Quick Requirement Creation via Job Description Document</p>
                    <p className="mt-0.5 text-[11px] text-brand-700">
                      Upload your complete JD file directly. No need to manually re-type skills,
                      responsibilities or qualifications.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="label text-xs font-semibold">Requirement Title / Job Role *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Senior Backend Engineer (Node.js & Go)"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Department *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Platform Engineering"
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Number of Vacancies *</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={form.vacancies}
                        onChange={(e) =>
                          setForm({ ...form, vacancies: parseInt(e.target.value, 10) || 1 })
                        }
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Job Location</label>
                      <select
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        className="input text-xs w-full"
                      >
                        <option value="Remote">Remote</option>
                        <option value="On-site">On-site</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs font-semibold">Priority</label>
                      <select
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value })}
                        className="input text-xs w-full"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                  </div>

                  {/* Document Upload Dropzone */}
                  <div>
                    <label className="label text-xs font-semibold">
                      Complete Job Description Document * (PDF, DOC, DOCX)
                    </label>

                    {attachedJd ? (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📄</span>
                          <div>
                            <p className="text-xs font-bold text-emerald-900">{attachedJd.fileName}</p>
                            <p className="text-[11px] text-emerald-700">
                              Ready to attach • {fmtSize(attachedJd.fileSize)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/backend/recruitment/jd/${attachedJd.fileId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary !px-3 !py-1.5 text-xs inline-flex items-center gap-1"
                          >
                            👁️ Preview
                          </a>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-secondary !px-3 !py-1.5 text-xs"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveAttachedJd}
                            className="btn-ghost !px-3 !py-1.5 text-xs text-rose-600 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-brand-300 hover:border-brand-600 rounded-xl p-8 text-center cursor-pointer bg-brand-50/20 hover:bg-brand-50/50 transition"
                      >
                        <span className="text-3xl block mb-2">📄</span>
                        <p className="text-xs font-bold text-brand-900">
                          {jdUploading ? 'Uploading file...' : 'Click to Upload Complete Job Description'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Supports PDF, DOC, and DOCX up to 20 MB. Assigned HR Support will be able to
                          download and view this original document.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TIMELINE & HR SUPPORT ASSIGNMENTS (Shared across both methods) */}
              <div className="border-b pt-2 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {creationMethod === 'DIRECT_UPLOAD' ? 'Timeline & Assignment' : '4. Timeline & Assignment'}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs font-semibold">Submission Deadline *</label>
                  <input
                    type="date"
                    required
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="label text-xs font-semibold">Expected Joining Date</label>
                  <input
                    type="date"
                    value={form.expectedJoiningDate}
                    onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })}
                    className="input text-xs w-full"
                  />
                </div>
              </div>

              {/* HR Support Multi-Select */}
              <div>
                <label className="label text-xs font-semibold">
                  Assign HR Support Users * (Multi-Select)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Select one or more HR Support team members who will source candidates for this opening.
                </p>
                <div className="border border-slate-200 rounded-xl p-3 max-h-36 overflow-y-auto space-y-2 bg-slate-50/50">
                  {hrUsers.length === 0 ? (
                    <p className="text-xs text-slate-400">No HR Support users available.</p>
                  ) : (
                    hrUsers.map((u) => {
                      const checked = form.assignedHrSupportIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer hover:bg-white p-1 rounded transition"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleHrSupportAssignment(u.id)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="font-semibold text-ink-900">{u.displayName}</span>
                          <span className="text-slate-400">({u.email})</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected: {form.assignedHrSupportIds.length} HR Support user(s)
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || jdUploading}
                  className="btn text-xs font-semibold"
                >
                  {saving ? 'Creating Requirement...' : 'Publish & Assign Requirement'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* EDIT REQUIREMENT MODAL */}
      {editModal && (
        <Modal
          open={true}
          onClose={() => setEditModal(null)}
          title={`Edit Requirement: ${editModal.reqCode}`}
        >
          <form onSubmit={handleUpdate} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label text-xs font-semibold">Job Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="label text-xs font-semibold">Department *</label>
                <input
                  type="text"
                  required
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="label text-xs font-semibold">Vacancies *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.vacancies}
                  onChange={(e) =>
                    setForm({ ...form, vacancies: parseInt(e.target.value, 10) || 1 })
                  }
                  className="input text-xs w-full"
                />
              </div>
              <div>
                <label className="label text-xs font-semibold">Status *</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="input text-xs w-full"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label className="label text-xs font-semibold">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="input text-xs w-full"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <label className="label text-xs font-semibold">Deadline</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="input text-xs w-full"
                />
              </div>
            </div>

            <div>
              <label className="label text-xs font-semibold">Job Description</label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input text-xs w-full"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn text-xs font-semibold"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* VIEW REQUIREMENT DETAIL MODAL */}
      {viewDetail && (
        <Modal
          open={true}
          onClose={() => setViewDetail(null)}
          title={`${viewDetail.reqCode}: ${viewDetail.title}`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-ink-900">{viewDetail.title}</p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      PRIORITY_BADGES[viewDetail.priority || 'MEDIUM'] || PRIORITY_BADGES.MEDIUM
                    }`}
                  >
                    {viewDetail.priority || 'MEDIUM'}
                  </span>
                  {viewDetail.creationMethod === 'DIRECT_UPLOAD' && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      ⚡ Created via JD Document
                    </span>
                  )}
                </div>
                <p className="text-slate-500 mt-0.5">
                  {viewDetail.department} • {viewDetail.location} • {viewDetail.employmentType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    REQ_STATUS_COLORS[viewDetail.status] || 'bg-slate-100'
                  }`}
                >
                  {REQ_STATUS_LABEL[viewDetail.status] || viewDetail.status}
                </span>
                <button
                  onClick={() => handleEdit(viewDetail)}
                  className="btn-secondary !px-2.5 !py-1 text-xs"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Prominent Attached JD Card */}
            {viewDetail.jdFileName && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-lg font-bold shadow-xs">
                    📄
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{viewDetail.jdFileName}</p>
                    <p className="text-[11px] text-slate-500">
                      Complete Job Description Document • {fmtSize(viewDetail.jdFileSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/backend/recruitment/requirements/${viewDetail.id}/jd`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5"
                  >
                    👁️ View Job Description
                  </a>
                  <button
                    onClick={() =>
                      downloadFile(
                        `/recruitment/requirements/${viewDetail.id}/jd?download=1`,
                        viewDetail.jdFileName || 'job_description.pdf',
                      )
                    }
                    className="btn-primary !px-3 !py-1.5 text-xs inline-flex items-center gap-1.5"
                  >
                    📥 Download Job Description
                  </button>
                </div>
              </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Vacancies</p>
                <p className="text-lg font-bold text-ink-900">{viewDetail.vacancies}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Candidates</p>
                <p className="text-lg font-bold text-brand-600">{viewDetail.totalCandidates ?? 0}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Experience</p>
                <p className="text-sm font-bold text-ink-900">
                  {viewDetail.minExp}-{viewDetail.maxExp} yrs
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Deadline</p>
                <p className="text-xs font-bold text-slate-700">{fmtDate(viewDetail.deadline)}</p>
              </div>
            </div>

            {/* Submissions by HR Support */}
            <div className="rounded-xl border border-slate-200 p-3 bg-white">
              <h4 className="font-bold text-ink-900 mb-2">HR Support Sourcing Submissions</h4>
              {viewDetail.submissionsByHrSupport && viewDetail.submissionsByHrSupport.length > 0 ? (
                <div className="space-y-2">
                  {viewDetail.submissionsByHrSupport.map((item) => (
                    <div
                      key={item.submitter.id}
                      className="flex items-center justify-between border-b pb-1.5 last:border-0"
                    >
                      <div>
                        <span className="font-semibold text-ink-900">
                          {item.submitter.displayName}
                        </span>
                        <span className="text-slate-400 ml-1.5">({item.submitter.email})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-600">{item.count} submitted</span>
                        <Link
                          href={`/hr-manager/candidates?requirementId=${viewDetail.id}&submittedById=${item.submitter.id}`}
                          className="text-xs font-semibold text-accent-600 hover:underline"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-xs">
                  No candidates submitted yet for this requirement.
                </p>
              )}
            </div>

            {/* Detailed JD Text */}
            <div className="space-y-3">
              <div>
                <h4 className="font-bold text-ink-900">Job Description Details</h4>
                <p className="mt-1 whitespace-pre-wrap text-slate-600 bg-slate-50 p-2.5 rounded-lg border">
                  {viewDetail.description}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-ink-900">Roles and Responsibilities</h4>
                <p className="mt-1 whitespace-pre-wrap text-slate-600 bg-slate-50 p-2.5 rounded-lg border">
                  {viewDetail.responsibilities}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-ink-900">Required Skills & Qualification</h4>
                <p className="mt-1 text-slate-600 bg-slate-50 p-2.5 rounded-lg border">
                  <strong>Technical:</strong> {viewDetail.techSkills}
                  <br />
                  <strong>Qualification:</strong> {viewDetail.qualification}
                  {viewDetail.specialization ? ` (${viewDetail.specialization})` : ''}
                </p>
              </div>

              {viewDetail.additionalInstructions && (
                <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-200">
                  <h4 className="font-bold text-amber-900">Instructions for HR Support</h4>
                  <p className="mt-1 text-amber-800">{viewDetail.additionalInstructions}</p>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function HrManagerRequirementsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <HrManagerRequirementsContent />
    </Suspense>
  );
}
