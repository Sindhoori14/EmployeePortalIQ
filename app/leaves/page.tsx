'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, fmtDate, downloadText } from '../../lib/api';
import { Avatar, Empty, Loading, Modal, PageHeader, Stat } from '../../components/ui';
import { useAuth, useRequireAuth } from '../../lib/auth-context';

interface LeaveRecord {
  id: string;
  userId: string;
  teamId?: string | null;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'PENDING' | 'TL_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  tlDecidedById?: string | null;
  tlDecidedAt?: string | null;
  tlNote?: string | null;
  decidedById?: string | null;
  decidedAt?: string | null;
  adminNote?: string | null;
  createdAt: string;
  user?: {
    id: string;
    displayName: string;
    email: string;
    role?: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
  tlDecidedBy?: { id: string; displayName: string } | null;
  decidedBy?: { id: string; displayName: string } | null;
}

export default function LeavesPage() {
  const { user, loading } = useRequireAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isLead = user?.role === 'TEAM_LEAD';
  const isCoord = user?.role === 'COORDINATOR';
  const isStaff = isAdmin || isLead || isCoord;

  // Active Tab
  const [activeTab, setActiveTab] = useState<'admin_queue' | 'tl_queue' | 'history' | 'my_requests' | 'request_form'>(
    isAdmin ? 'admin_queue' : isLead ? 'tl_queue' : 'request_form'
  );

  // Data states
  const [pendingList, setPendingList] = useState<LeaveRecord[]>([]);
  const [historyList, setHistoryList] = useState<LeaveRecord[]>([]);
  const [myList, setMyList] = useState<LeaveRecord[]>([]);
  const [onLeaveToday, setOnLeaveToday] = useState<Array<{ id: string; user: { displayName: string } }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states (Employee / TL personal request)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter states for history
  const [historyTeamId, setHistoryTeamId] = useState<string>('ALL');
  const [historyStatus, setHistoryStatus] = useState<string>('ALL');

  // Decision Modal state
  const [decideModal, setDecideModal] = useState<{
    open: boolean;
    leave: LeaveRecord | null;
    isApprove: boolean;
    note: string;
    processing: boolean;
  }>({
    open: false,
    leave: null,
    isApprove: true,
    note: '',
    processing: false,
  });

  // Alerts
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  
  function downloadSingleLeave(row: LeaveRecord) {
    const headers = ['Applicant Name', 'Email', 'Role', 'Team', 'From Date', 'To Date', 'Reason', 'Status', 'TL Decided By', 'TL Note', 'Admin Decided By', 'Admin Note', 'Applied Date'];
    const values = [
      `"${(row.user?.displayName || 'Unknown').replace(/"/g, '""')}"`,
      `"${(row.user?.email || '').replace(/"/g, '""')}"`,
      `"${(row.user?.role || '').replace(/"/g, '""')}"`,
      `"${(row.team?.name || 'No Team').replace(/"/g, '""')}"`,
      row.fromDate,
      row.toDate,
      `"${(row.reason || '').replace(/"/g, '""')}"`,
      row.status,
      `"${(row.tlDecidedBy?.displayName || '').replace(/"/g, '""')}"`,
      `"${(row.tlNote || '').replace(/"/g, '""')}"`,
      `"${(row.decidedBy?.displayName || '').replace(/"/g, '""')}"`,
      `"${(row.adminNote || '').replace(/"/g, '""')}"`,
      row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '',
    ];
    const csv = [headers.join(','), values.join(',')].join('\r\n');
    const safeName = (row.user?.displayName || 'leave').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadText(`leave_${safeName}_${row.fromDate}.csv`, csv);
  }

  function downloadAllLeaves(rows: LeaveRecord[]) {
    const headers = ['Applicant Name', 'Email', 'Role', 'Team', 'From Date', 'To Date', 'Reason', 'Status', 'TL Decided By', 'TL Note', 'Admin Decided By', 'Admin Note', 'Applied Date'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      const values = [
        `"${(row.user?.displayName || 'Unknown').replace(/"/g, '""')}"`,
        `"${(row.user?.email || '').replace(/"/g, '""')}"`,
        `"${(row.user?.role || '').replace(/"/g, '""')}"`,
        `"${(row.team?.name || 'No Team').replace(/"/g, '""')}"`,
        row.fromDate,
        row.toDate,
        `"${(row.reason || '').replace(/"/g, '""')}"`,
        row.status,
        `"${(row.tlDecidedBy?.displayName || '').replace(/"/g, '""')}"`,
        `"${(row.tlNote || '').replace(/"/g, '""')}"`,
        `"${(row.decidedBy?.displayName || '').replace(/"/g, '""')}"`,
        `"${(row.adminNote || '').replace(/"/g, '""')}"`,
        row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '',
      ];
      lines.push(values.join(','));
    }
    downloadText(`leaves_export_${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'));
  }

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const promises: Promise<any>[] = [api<LeaveRecord[]>('/leaves/mine')];

      if (isStaff) {
        promises.push(api<LeaveRecord[]>('/leaves/pending'));
        promises.push(api<any[]>('/leaves/on-leave-today'));
        promises.push(api<LeaveRecord[]>('/leaves/history?limit=100'));
        promises.push(api<Array<{ id: string; name: string }>>('/teams'));
      }

      const results = await Promise.all(promises);
      setMyList(results[0] || []);

      if (isStaff) {
        setPendingList(results[1] || []);
        setOnLeaveToday(results[2] || []);
        setHistoryList(results[3] || []);
        setTeams(results[4] || []);
      }
    } catch (err) {
      console.error('Failed to load leaves data', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, isStaff]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // Derived Queues
  const adminQueue = useMemo(() => {
    return pendingList.filter((r) => r.status === 'TL_APPROVED' || (r.status === 'PENDING' && (!r.teamId || r.user?.role === 'TEAM_LEAD')));
  }, [pendingList]);

  const tlPendingQueue = useMemo(() => {
    return pendingList.filter((r) => r.status === 'PENDING' && r.teamId && r.user?.role !== 'TEAM_LEAD');
  }, [pendingList]);

  const filteredHistory = useMemo(() => {
    return historyList.filter((r) => {
      if (historyTeamId !== 'ALL' && r.teamId !== historyTeamId) return false;
      if (historyStatus !== 'ALL' && r.status !== historyStatus) return false;
      return true;
    });
  }, [historyList, historyTeamId, historyStatus]);

  // Day calculation
  const calculatedDays = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [fromDate, toDate]);

  // Submit leave request (Employee or TL Personal)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromDate || !toDate || !reason.trim()) {
      setFeedback({ type: 'error', message: 'Please complete all required fields.' });
      return;
    }
    if (fromDate > toDate) {
      setFeedback({ type: 'error', message: 'End date cannot be earlier than start date.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await api('/leaves', {
        method: 'POST',
        body: {
          fromDate,
          toDate,
          reason: reason.trim(),
        },
      });

      setFeedback({
        type: 'success',
        message: isLead
          ? 'Personal leave request submitted and escalated directly for Administrator review.'
          : 'Leave request submitted successfully. Awaiting Team Lead review.',
      });
      setFromDate('');
      setToDate('');
      setReason('');
      await loadData();
      setActiveTab('my_requests');
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Failed to submit leave request.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Open Decision Modal
  const openDecision = (leave: LeaveRecord, isApprove: boolean) => {
    setDecideModal({
      open: true,
      leave,
      isApprove,
      note: '',
      processing: false,
    });
  };

  // Submit Decision
  const handleDecisionSubmit = async () => {
    if (!decideModal.leave) return;
    setDecideModal((prev) => ({ ...prev, processing: true }));
    try {
      const endpoint = `/leaves/${decideModal.leave.id}/${decideModal.isApprove ? 'approve' : 'reject'}`;
      await api(endpoint, {
        method: 'POST',
        body: { note: decideModal.note.trim() || undefined },
      });

      setFeedback({
        type: 'success',
        message: decideModal.isApprove
          ? isAdmin
            ? 'Leave request given Final Approval by Administrator.'
            : 'Leave request approved by Team Lead and queued for Admin final review.'
          : 'Leave request rejected successfully.',
      });
      setDecideModal({ open: false, leave: null, isApprove: true, note: '', processing: false });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Decision action failed.' });
      setDecideModal((prev) => ({ ...prev, processing: false }));
    }
  };

  // Cancel Pending Request (Employee)
  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    try {
      await api(`/leaves/${id}/cancel`, { method: 'POST' });
      setFeedback({ type: 'success', message: 'Leave request cancelled.' });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Failed to cancel leave request.' });
    }
  };

  if (loading || !user) return <Loading />;

  // Badges
  const renderStatusBadge = (status: LeaveRecord['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending TL Review
          </span>
        );
      case 'TL_APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            TL Approved · Awaiting Admin
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Approved (Final)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Rejected
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Leave Management"
        sub="Two-level approval workflow with real-time audit trail and calendar synchronization."
      >
        <span className="inline-flex items-center rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-[#FF5500] ring-1 ring-inset ring-[#FF5500]/20">
          ElevateIQ · 2-Tier Approvals
        </span>
      </PageHeader>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl p-4 text-sm font-medium shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
              : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Stats */}
      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Awaiting Admin Final Review"
            value={adminQueue.length}
            tone={adminQueue.length > 0 ? 'warn' : 'default'}
            hint="TL-approved or direct escalations"
          />
          <Stat
            label="Pending Team Lead Review"
            value={tlPendingQueue.length}
            tone="default"
            hint="Queued at Level 1"
          />
          <Stat
            label="On Leave Today"
            value={onLeaveToday.length}
            tone="brand"
            hint="Active approved leaves"
          />
          <Stat
            label="Total Processed Leaves"
            value={historyList.length}
            tone="success"
            hint="Complete organization records"
          />
        </div>
      )}

      {isLead && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Team Pending Review"
            value={tlPendingQueue.length}
            tone={tlPendingQueue.length > 0 ? 'warn' : 'default'}
            hint="Awaiting your Level 1 decision"
          />
          <Stat
            label="Recommended to Admin"
            value={pendingList.filter((r) => r.status === 'TL_APPROVED').length}
            tone="brand"
            hint="Under Admin final evaluation"
          />
          <Stat
            label="My Personal Requests"
            value={myList.length}
            tone="default"
            hint="Direct escalations to Admin"
          />
          <Stat
            label="Team On Leave Today"
            value={onLeaveToday.length}
            tone="success"
            hint="Active team members off"
          />
        </div>
      )}

      {!isStaff && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Pending Requests"
            value={myList.filter((r) => r.status === 'PENDING' || r.status === 'TL_APPROVED').length}
            tone="warn"
            hint="Under active review"
          />
          <Stat
            label="Approved Leaves"
            value={myList.filter((r) => r.status === 'APPROVED').length}
            tone="success"
            hint="Confirmed time off"
          />
          <Stat
            label="Total Submitted"
            value={myList.length}
            tone="default"
            hint="All-time leave history"
          />
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab('admin_queue')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'admin_queue'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Awaiting Admin Final Approval ({adminQueue.length})
            </button>
            <button
              onClick={() => setActiveTab('tl_queue')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'tl_queue'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Awaiting Team Lead Review ({tlPendingQueue.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Organization Leave History ({historyList.length})
            </button>
          </>
        )}

        {isLead && (
          <>
            <button
              onClick={() => setActiveTab('tl_queue')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'tl_queue'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Team Approvals Queue ({tlPendingQueue.length})
            </button>
            <button
              onClick={() => setActiveTab('request_form')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'request_form'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Request Personal Leave
            </button>
            <button
              onClick={() => setActiveTab('my_requests')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'my_requests'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              My Personal Requests ({myList.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Team Leave History
            </button>
          </>
        )}

        {!isStaff && (
          <>
            <button
              onClick={() => setActiveTab('request_form')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'request_form'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              Request Leave
            </button>
            <button
              onClick={() => setActiveTab('my_requests')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'my_requests'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              My Leave Requests & History ({myList.length})
            </button>
          </>
        )}
      </div>

      {/* ==================== TAB 1: ADMIN QUEUE (LEVEL 2) ==================== */}
      {isAdmin && activeTab === 'admin_queue' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-ink-900">Awaiting Administrator Final Decision</h2>
              <p className="text-xs text-slate-500">
                Requests verified and approved by Team Leads, or escalated directly from team leads / unassigned staff.
              </p>
            </div>
            <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {adminQueue.length} Pending Decision
            </span>
          </div>

          {adminQueue.length === 0 ? (
            <Empty title="No leaves waiting for Admin approval" sub="All escalated requests have been reviewed." />
          ) : (
            <div className="divide-y divide-slate-100">
              {adminQueue.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar name={item.user?.displayName || 'Applicant'} userId={item.userId} size={40} />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink-900">{item.user?.displayName}</span>
                        <span className="text-xs text-slate-500">({item.user?.email})</span>
                        {item.team && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {item.team.name}
                          </span>
                        )}
                        {renderStatusBadge(item.status)}
                      </div>
                      <p className="text-sm font-medium text-ink-800">
                        Dates: <span className="font-semibold text-brand-600">{fmtDate(item.fromDate)}</span> to{' '}
                        <span className="font-semibold text-brand-600">{fmtDate(item.toDate)}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Reason:</span> {item.reason}
                      </p>
                      {item.tlNote && (
                        <div className="mt-1 rounded-md bg-sky-50/80 p-2 text-xs text-sky-800">
                          <span className="font-semibold">Team Lead Note:</span> {item.tlNote}
                          {item.tlDecidedBy && <span className="ml-1 opacity-75">— by {item.tlDecidedBy.displayName}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => downloadSingleLeave(item)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                      title="Download request"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => openDecision(item, true)}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                    >
                      Approve (Final)
                    </button>
                    <button
                      onClick={() => openDecision(item, false)}
                      className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: TL QUEUE (LEVEL 1) ==================== */}
      {isStaff && activeTab === 'tl_queue' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-ink-900">
                {isAdmin ? 'Requests Currently Pending Team Lead Review' : 'Team Approval Queue (Level 1)'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAdmin
                  ? 'Overview of leave requests waiting for team lead decision.'
                  : 'Review leave requests from your assigned team. Approved requests move to Administrator for final authorization.'}
              </p>
            </div>
            <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {tlPendingQueue.length} Pending Review
            </span>
          </div>

          {tlPendingQueue.length === 0 ? (
            <Empty title="No leaves waiting for Team Lead review" sub="All team requests have been processed." />
          ) : (
            <div className="divide-y divide-slate-100">
              {tlPendingQueue.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar name={item.user?.displayName || 'Applicant'} userId={item.userId} size={40} />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink-900">{item.user?.displayName}</span>
                        <span className="text-xs text-slate-500">({item.user?.email})</span>
                        {item.team && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {item.team.name}
                          </span>
                        )}
                        {renderStatusBadge(item.status)}
                      </div>
                      <p className="text-sm font-medium text-ink-800">
                        Dates: <span className="font-semibold text-brand-600">{fmtDate(item.fromDate)}</span> to{' '}
                        <span className="font-semibold text-brand-600">{fmtDate(item.toDate)}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Reason:</span> {item.reason}
                      </p>
                    </div>
                  </div>

                  {isLead && item.userId !== user?.id && (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => openDecision(item, true)}
                        className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-700 transition"
                      >
                        Approve & Queue for Admin
                      </button>
                      <button
                        onClick={() => openDecision(item, false)}
                        className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span className="text-xs font-medium text-amber-700">Awaiting TL Action</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: REQUEST LEAVE FORM (EMPLOYEE & TL PERSONAL) ==================== */}
      {(!isAdmin && activeTab === 'request_form') && (
        <div className="card max-w-2xl space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-ink-900">
              {isLead ? 'Request Personal Leave (Escalates to Admin)' : 'Submit Leave Request'}
            </h2>
            <p className="text-xs text-slate-500">
              {isLead
                ? 'Your personal leave requests bypass Team Lead review and route directly to the Administrator for final approval.'
                : 'Your request will be submitted to your assigned Team Lead for initial evaluation.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            {calculatedDays > 0 && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 flex items-center justify-between">
                <span>Duration of requested leave:</span>
                <span className="font-bold text-brand-600 text-sm">{calculatedDays} calendar day(s)</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Reason for Leave *
              </label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the purpose of your leave request..."
                maxLength={1000}
                className="input w-full resize-none"
              />
              <span className="mt-1 block text-right text-[11px] text-slate-400">
                {reason.length} / 1000 characters
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#FF5500] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#e04b00] disabled:opacity-50 transition"
              >
                {submitting ? 'Submitting...' : 'Submit Leave Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== TAB 4: MY REQUESTS & HISTORY ==================== */}
      {(!isAdmin && activeTab === 'my_requests') && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-ink-900">My Leave Requests</h2>
              <p className="text-xs text-slate-500">Track your submitted requests and multi-tier approval progress.</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {myList.length} Total Requests
            </span>
          </div>

          {myList.length === 0 ? (
            <Empty title="No leave requests yet" sub="Submit a request using the Request Leave form." />
          ) : (
            <div className="divide-y divide-slate-100">
              {myList.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-brand-600">
                        {fmtDate(item.fromDate)} → {fmtDate(item.toDate)}
                      </span>
                      {renderStatusBadge(item.status)}
                    </div>
                    <p className="text-xs text-slate-700">
                      <span className="font-medium text-slate-900">Reason:</span> {item.reason}
                    </p>

                    {item.tlNote && (
                      <p className="text-xs text-sky-700 bg-sky-50 px-2 py-1 rounded">
                        <span className="font-semibold">TL Decision Note:</span> {item.tlNote}
                      </p>
                    )}

                    {item.adminNote && (
                      <p className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                        <span className="font-semibold">Admin Final Note:</span> {item.adminNote}
                      </p>
                    )}
                  </div>

                  {item.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancel(item.id)}
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition"
                    >
                      Cancel Request
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 5: ORGANIZATION / TEAM LEAVE HISTORY ==================== */}
      {isStaff && activeTab === 'history' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-ink-900">
                {isAdmin ? 'Organization Leave History & Approval Audit' : 'Team Leave History'}
              </h2>
              <p className="text-xs text-slate-500">
                Full historical audit trail of all approved, rejected, and completed requests.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <select
                  value={historyTeamId}
                  onChange={(e) => setHistoryTeamId(e.target.value)}
                  className="input !py-1 text-xs"
                >
                  <option value="ALL">All Teams</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={historyStatus}
                onChange={(e) => setHistoryStatus(e.target.value)}
                className="input !py-1 text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="APPROVED">Approved</option>
                <option value="TL_APPROVED">TL Approved</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <button
                type="button"
                onClick={() => downloadAllLeaves(filteredHistory)}
                disabled={filteredHistory.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 transition"
                title="Download filtered leaves as CSV"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <Empty title="No leave history found" sub="Adjust your filters or check back later." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Applicant</th>
                    <th className="py-2.5 px-3">Team</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Approval Trail</th>
                    <th className="py-2.5 px-3 text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={row.user?.displayName || 'User'} userId={row.userId} size={28} />
                          <div>
                            <p className="font-semibold text-ink-900">{row.user?.displayName}</p>
                            <p className="text-[11px] text-slate-400">{row.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{row.team?.name || '—'}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-medium text-brand-600">
                          {fmtDate(row.fromDate)} → {fmtDate(row.toDate)}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate text-slate-700" title={row.reason}>
                        {row.reason}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{renderStatusBadge(row.status)}</td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 space-y-0.5">
                        {row.tlDecidedBy && (
                          <p>
                            <span className="font-semibold text-sky-700">TL:</span> {row.tlDecidedBy.displayName}
                            {row.tlNote ? ` ("${row.tlNote}")` : ''}
                          </p>
                        )}
                        {row.decidedBy && (
                          <p>
                            <span className="font-semibold text-emerald-700">Admin:</span> {row.decidedBy.displayName}
                            {row.adminNote ? ` ("${row.adminNote}")` : ''}
                          </p>
                        )}
                        {!row.tlDecidedBy && !row.decidedBy && <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => downloadSingleLeave(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 active:scale-95 transition"
                          title={`Download ${row.user?.displayName || 'employee'}'s leave details`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Download
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

      {/* Decision Modal (for Level 1 TL and Level 2 Admin) */}
      {decideModal.open && decideModal.leave && (
        <Modal
          title={
            decideModal.isApprove
              ? isAdmin
                ? 'Final Leave Approval (Administrator)'
                : 'Level 1 Leave Approval (Team Lead)'
              : 'Reject Leave Request'
          }
          onClose={() => setDecideModal((prev) => ({ ...prev, open: false }))}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              <p>
                <span className="font-semibold">Applicant:</span> {decideModal.leave.user?.displayName} (
                {decideModal.leave.user?.email})
              </p>
              <p>
                <span className="font-semibold">Period:</span> {fmtDate(decideModal.leave.fromDate)} →{' '}
                {fmtDate(decideModal.leave.toDate)}
              </p>
              <p>
                <span className="font-semibold">Reason:</span> {decideModal.leave.reason}
              </p>
              {decideModal.leave.tlNote && (
                <p className="text-sky-800">
                  <span className="font-semibold">TL Note:</span> {decideModal.leave.tlNote}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Optional Decision Note
              </label>
              <textarea
                rows={3}
                value={decideModal.note}
                onChange={(e) => setDecideModal((prev) => ({ ...prev, note: e.target.value }))}
                placeholder={
                  decideModal.isApprove
                    ? isAdmin
                      ? 'Add any comments for final approval...'
                      : 'Add recommendation remarks for Admin...'
                    : 'Add reason for rejection...'
                }
                className="input w-full resize-none text-xs"
                maxLength={500}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDecideModal((prev) => ({ ...prev, open: false }))}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={decideModal.processing}
                onClick={handleDecisionSubmit}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition ${
                  decideModal.isApprove
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                } disabled:opacity-50`}
              >
                {decideModal.processing
                  ? 'Saving...'
                  : decideModal.isApprove
                  ? isAdmin
                    ? 'Grant Final Approval'
                    : 'Recommend Approval to Admin'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
