'use client';
import { useEffect, useState } from 'react';
import { api, fmtDate } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth-context';
import { Empty, Loading, PageHeader, Stat } from '../../../components/ui';

interface LeaveItem {
  id: string;
  userId: string;
  teamId: string | null;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'PENDING' | 'TL_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  tlDecidedAt: string | null;
  tlNote: string | null;
  decidedAt: string | null;
  adminNote: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    role: string;
  };
  team: { id: string; name: string } | null;
  tlDecidedBy: { id: string; displayName: string } | null;
  decidedBy: { id: string; displayName: string } | null;
}

const LEAVE_STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  TL_APPROVED: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

export default function HrManagerLeavesPage() {
  const { user, loading } = useRequireAuth(['HR_MANAGER', 'ADMIN']);

  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'today'>('pending');
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [todayLeaves, setTodayLeaves] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [err, setErr] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  const loadLeaves = () => {
    setLoadingData(true);
    if (activeTab === 'today') {
      api<any[]>('/leaves/on-leave-today')
        .then((res) => {
          setTodayLeaves(res);
          setErr('');
        })
        .catch((e) => setErr(e.message))
        .finally(() => setLoadingData(false));
      return;
    }

    const endpoint = activeTab === 'pending' ? '/leaves/pending' : `/leaves/history?limit=150${filterStatus ? `&status=${filterStatus}` : ''}`;
    api<LeaveItem[]>(endpoint)
      .then((res) => {
        setLeaves(res);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (user) loadLeaves();
  }, [user, activeTab, filterStatus]);

  if (loading || !user) return <Loading />;

  const filteredLeaves = leaves.filter((l) => {
    if (search) {
      const term = search.toLowerCase();
      if (!l.user.displayName.toLowerCase().includes(term) && !l.user.email.toLowerCase().includes(term)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management (Organization Overview)"
        sub="Organization-wide visibility into employee leave requests, active approvals and leave history."
      >
        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
          👀 Read-Only HR Oversight Mode
        </span>
      </PageHeader>

      {err && <p className="err">{err}</p>}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('pending')}
          className={`pb-3 transition relative ${
            activeTab === 'pending' ? 'text-brand-600 border-b-2 border-brand-600 font-bold' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending Review Requests
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 transition relative ${
            activeTab === 'history' ? 'text-brand-600 border-b-2 border-brand-600 font-bold' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Leave History
        </button>
        <button
          onClick={() => setActiveTab('today')}
          className={`pb-3 transition relative ${
            activeTab === 'today' ? 'text-brand-600 border-b-2 border-brand-600 font-bold' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          On Leave Today
        </button>
      </div>

      {/* Filters */}
      {activeTab !== 'today' && (
        <div className="card !p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search employee name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input text-xs w-full"
            />
          </div>

          {activeTab === 'history' && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input text-xs"
            >
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          )}

          <button onClick={loadLeaves} className="btn-secondary text-xs">
            Refresh
          </button>
        </div>
      )}

      {/* Table Content */}
      <div className="card overflow-hidden !p-0">
        {loadingData ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading leave requests...</div>
        ) : activeTab === 'today' ? (
          todayLeaves.length === 0 ? (
            <Empty icon="🏖️" title="No Employees on Leave Today" sub="All team members are scheduled to work today." />
          ) : (
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-ink-900">Employees On Leave Today ({todayLeaves.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {todayLeaves.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="font-bold text-ink-900">{item.user?.displayName}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {fmtDate(item.fromDate)} → {fmtDate(item.toDate)}
                    </p>
                    <p className="text-xs text-slate-600 mt-1 italic">"{item.reason}"</p>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : filteredLeaves.length === 0 ? (
          <Empty icon="📝" title="No Leave Requests Found" sub="No leave records found matching your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Leave Dates</th>
                  <th className="py-3 px-4 text-center">Days</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Approval Trail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeaves.map((l) => {
                  const start = new Date(l.fromDate);
                  const end = new Date(l.toDate);
                  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-ink-900">{l.user.displayName}</p>
                        <p className="text-[10px] text-slate-400">{l.user.email}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{l.team?.name || '—'}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {fmtDate(l.fromDate)} → {fmtDate(l.toDate)}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-ink-900">{days}d</td>
                      <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={l.reason}>
                        {l.reason}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            LEAVE_STATUS_BADGES[l.status] || 'bg-slate-100'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {l.tlDecidedBy && (
                          <p>
                            TL: <span className="font-medium text-ink-900">{l.tlDecidedBy.displayName}</span>
                            {l.tlNote && ` ("${l.tlNote}")`}
                          </p>
                        )}
                        {l.decidedBy && (
                          <p>
                            Admin: <span className="font-medium text-ink-900">{l.decidedBy.displayName}</span>
                            {l.adminNote && ` ("${l.adminNote}")`}
                          </p>
                        )}
                        {!l.tlDecidedBy && !l.decidedBy && <span className="text-slate-400">Awaiting Lead</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
