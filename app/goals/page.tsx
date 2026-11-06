'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, fmtDate } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth-context';
import { Avatar, Empty, Loading, Modal, PageHeader, ProgressBar } from '../../components/ui';

interface ChildGoal {
  id: string;
  title: string;
  description: string | null;
  type: 'WEEKLY' | 'MONTHLY';
  status: 'ACTIVE' | 'DONE' | 'ARCHIVED';
  targetScope?: string | null;
  teamId: string | null;
  ownerId: string | null;
  parentGoalId: string | null;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  createdAt?: string;
  owner?: { id: string; displayName: string; email?: string; role?: string } | null;
  team?: { id: string; name: string } | null;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  type: 'WEEKLY' | 'MONTHLY';
  status: 'ACTIVE' | 'DONE' | 'ARCHIVED';
  targetScope?: string | null;
  teamId: string | null;
  batchId: string | null;
  ownerId: string | null;
  parentGoalId: string | null;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  owner?: { id: string; displayName: string; email?: string; role?: string } | null;
  team?: { id: string; name: string } | null;
  createdBy?: { id: string; displayName: string } | null;
  childGoals?: ChildGoal[];
}

interface TeamOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  displayName: string;
  email: string;
  role: string;
  teamId: string | null;
}

type AssignScope = 'INDIVIDUAL' | 'TEAM' | 'ALL_TEAMS' | 'ALL_EMPLOYEES';

export default function GoalsPage() {
  const { user, loading } = useRequireAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isLead = user?.role === 'TEAM_LEAD';
  const canCreate = isAdmin || isLead;

  const [goals, setGoals] = useState<Goal[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // Grouped expansion state
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => {
    setExpandedGoals((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filters
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'WEEKLY' | 'MONTHLY'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | ChildGoal | null>(null);
  const [progressVal, setProgressVal] = useState<number>(0);
  const [progressNote, setProgressNote] = useState('');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPeriod, setFormPeriod] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [formScope, setFormScope] = useState<AssignScope>('INDIVIDUAL');
  const [formTeamId, setFormTeamId] = useState('');
  const [formOwnerId, setFormOwnerId] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  const loadData = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    setErr('');
    try {
      const [goalRes, teamRes, userRes] = await Promise.all([
        api<Goal[]>('/goals').catch(() => []),
        api<any>('/teams').then((r) => (Array.isArray(r) ? r : r?.data || [])).catch(() => []),
        canCreate
          ? api<{ data: UserOption[] }>('/users?limit=500').then((r) => r.data || []).catch(() => [])
          : Promise.resolve([]),
      ]);

      setGoals(goalRes);
      setTeams(teamRes);
      setUsers(userRes);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load goals');
    } finally {
      setFetching(false);
    }
  }, [user, canCreate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When user is Team Lead, prefill teamId
  useEffect(() => {
    if (isLead && user?.teamId) {
      setFormTeamId(user.teamId);
    }
  }, [isLead, user?.teamId, createOpen]);

  // Available employees for individual assignment dropdown
  const availableEmployees = useMemo(() => {
    return users.filter((u) => {
      if (isLead) {
        return u.teamId === user?.teamId;
      }
      if (formTeamId) {
        return u.teamId === formTeamId;
      }
      return true;
    });
  }, [users, isLead, user?.teamId, formTeamId]);

  // Handle Create Goal Submit
  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (!formTitle.trim()) {
      setErr('Goal Title is required.');
      return;
    }

    if (formScope === 'INDIVIDUAL' && !formOwnerId) {
      setErr('Please select an employee for Individual Employee assignment.');
      return;
    }

    if (formScope === 'TEAM' && !formTeamId && isAdmin) {
      setErr('Please select a specific team for Team assignment.');
      return;
    }

    setBusy(true);
    try {
      const payload: any = {
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        type: formPeriod,
        targetScope: formScope,
        startDate: formStartDate || undefined,
        endDate: formDueDate || undefined,
      };

      if (formScope === 'INDIVIDUAL') {
        payload.ownerId = formOwnerId;
        payload.teamId = formTeamId || undefined;
      } else if (formScope === 'TEAM') {
        payload.teamId = isLead ? user?.teamId : formTeamId;
      }

      await api('/goals', {
        method: 'POST',
        body: payload,
      });

      setMsg(
        formScope === 'ALL_TEAMS' || formScope === 'ALL_EMPLOYEES' || formScope === 'TEAM'
          ? 'Goals assigned successfully with independent progress tracking per employee.'
          : 'Goal created and assigned successfully.'
      );

      // Reset form
      setFormTitle('');
      setFormDesc('');
      setFormPeriod('WEEKLY');
      setFormScope('INDIVIDUAL');
      setFormOwnerId('');
      setFormStartDate('');
      setFormDueDate('');
      setCreateOpen(false);

      await loadData();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to create goal');
    } finally {
      setBusy(false);
    }
  }

  // Handle Progress Update
  async function handleUpdateProgress(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGoal) return;
    setErr('');
    setMsg('');
    setBusy(true);

    try {
      await api(`/goals/${selectedGoal.id}/progress`, {
        method: 'PATCH',
        body: {
          progress: progressVal,
          note: progressNote.trim() || undefined,
        },
      });

      setMsg(`Goal progress updated to ${progressVal}%.`);
      setProgressOpen(false);
      setSelectedGoal(null);
      setProgressNote('');
      await loadData();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to update progress');
    } finally {
      setBusy(false);
    }
  }

  // Handle Delete Goal
  async function handleDeleteGoal(goal: Goal) {
    if (!confirm(`Are you sure you want to delete goal: "${goal.title}"?`)) return;
    setErr('');
    setMsg('');
    try {
      await api(`/goals/${goal.id}`, { method: 'DELETE' });
      setMsg('Goal removed successfully.');
      await loadData();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to delete goal');
    }
  }

  // Filtered list with deep search across parent goals and child assignees
  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      if (periodFilter !== 'ALL' && g.type !== periodFilter) return false;
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
      if (
        teamFilter !== 'ALL' &&
        g.teamId !== teamFilter &&
        !g.childGoals?.some((c) => c.teamId === teamFilter)
      ) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const t = g.title.toLowerCase();
        const d = (g.description || '').toLowerCase();
        const o = (g.owner?.displayName || '').toLowerCase();
        const tm = (g.team?.name || '').toLowerCase();
        const matchesChild = g.childGoals?.some(
          (c) =>
            (c.owner?.displayName || '').toLowerCase().includes(q) ||
            (c.owner?.email || '').toLowerCase().includes(q) ||
            (c.team?.name || '').toLowerCase().includes(q)
        );
        if (!t.includes(q) && !d.includes(q) && !o.includes(q) && !tm.includes(q) && !matchesChild) {
          return false;
        }
      }
      return true;
    });
  }, [goals, periodFilter, statusFilter, teamFilter, search]);

  // Statistics clearly distinguishing unique goals from individual employee assignments
  const stats = useMemo(() => {
    const totalGoals = goals.length;
    const activeGoals = goals.filter((g) => g.status === 'ACTIVE').length;
    const doneGoals = goals.filter((g) => g.status === 'DONE').length;
    const weeklyGoals = goals.filter((g) => g.type === 'WEEKLY').length;
    const monthlyGoals = goals.filter((g) => g.type === 'MONTHLY').length;

    let totalAssignments = 0;
    let activeAssignments = 0;
    let completedAssignments = 0;

    goals.forEach((g) => {
      if (g.childGoals && g.childGoals.length > 0) {
        totalAssignments += g.childGoals.length;
        activeAssignments += g.childGoals.filter((c) => c.status === 'ACTIVE').length;
        completedAssignments += g.childGoals.filter((c) => c.status === 'DONE').length;
      } else {
        totalAssignments += 1;
        if (g.status === 'ACTIVE') activeAssignments += 1;
        if (g.status === 'DONE') completedAssignments += 1;
      }
    });

    return {
      totalGoals,
      activeGoals,
      doneGoals,
      weeklyGoals,
      monthlyGoals,
      totalAssignments,
      activeAssignments,
      completedAssignments,
    };
  }, [goals]);

  return (
    <div className="space-y-6">
      {/* Prominent Page Header with + Create Goal button in children */}
      <PageHeader
        title="Goals & Targets"
        sub="Manage weekly milestones, monthly targets, and track independent employee progress"
      >
        {canCreate && (
          <button
            onClick={() => {
              setErr('');
              setCreateOpen(true);
            }}
            className="rounded-lg bg-[#FF5500] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#e04b00] transition flex items-center gap-1.5 cursor-pointer"
          >
            <span className="text-sm font-bold">+</span>
            <span>Create Goal</span>
          </button>
        )}
      </PageHeader>

      {/* Status Messages */}
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start justify-between">
          <span>{err}</span>
          <button onClick={() => setErr('')} className="font-bold ml-2 text-rose-600 hover:text-rose-900">&times;</button>
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="font-bold ml-2 text-emerald-600 hover:text-emerald-900">&times;</button>
        </div>
      )}

      {/* KPI Stats clearly distinguishing unique goals and employee assignments */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card border-l-4 border-l-blue-600 bg-gradient-to-br from-blue-50/40 to-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Active Goals</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-navy">{stats.activeGoals}</span>
            <span className="text-xs text-slate-500 font-medium">({stats.activeAssignments} assignees)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">In progress</p>
        </div>
        <div className="card border-l-4 border-l-emerald-600 bg-gradient-to-br from-emerald-50/40 to-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Completed (100%)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-navy">{stats.doneGoals}</span>
            <span className="text-xs text-slate-500 font-medium">({stats.completedAssignments} assignees)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Achieved targets</p>
        </div>
        <div className="card border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-50/40 to-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Weekly Deliverables</p>
          <p className="mt-2 text-3xl font-extrabold text-navy">{stats.weeklyGoals}</p>
          <p className="mt-1 text-xs text-slate-500">Short-cycle goals</p>
        </div>
        <div className="card border-l-4 border-l-indigo-600 bg-gradient-to-br from-indigo-50/40 to-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Monthly Targets</p>
          <p className="mt-2 text-3xl font-extrabold text-navy">{stats.monthlyGoals}</p>
          <p className="mt-1 text-xs text-slate-500">Strategic milestones</p>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {/* Cadence Pills */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium">
            <button
              onClick={() => setPeriodFilter('ALL')}
              className={`rounded-md px-3 py-1 transition ${periodFilter === 'ALL' ? 'bg-navy text-white font-semibold' : 'text-slate-600 hover:text-navy'}`}
            >
              All Periods
            </button>
            <button
              onClick={() => setPeriodFilter('WEEKLY')}
              className={`rounded-md px-3 py-1 transition ${periodFilter === 'WEEKLY' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:text-navy'}`}
            >
              Weekly
            </button>
            <button
              onClick={() => setPeriodFilter('MONTHLY')}
              className={`rounded-md px-3 py-1 transition ${periodFilter === 'MONTHLY' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-600 hover:text-navy'}`}
            >
              Monthly
            </button>
          </div>

          {/* Status Pills */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-md px-3 py-1 transition ${statusFilter === 'ALL' ? 'bg-navy text-white font-semibold' : 'text-slate-600 hover:text-navy'}`}
            >
              All Status
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`rounded-md px-3 py-1 transition ${statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-600 hover:text-navy'}`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('DONE')}
              className={`rounded-md px-3 py-1 transition ${statusFilter === 'DONE' ? 'bg-brand text-white font-semibold' : 'text-slate-600 hover:text-navy'}`}
            >
              Completed
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <select
              className="input text-xs w-auto"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="ALL">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <input
            type="search"
            placeholder="Search goals, assignees..."
            className="input text-xs w-full sm:w-60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Main Goals List */}
      {fetching ? (
        <Loading />
      ) : filteredGoals.length === 0 ? (
        <Empty
          text={
            search
              ? 'No goals match your search and filter criteria.'
              : 'There are no active goals assigned for this period. Click "+ Create Goal" to set a milestone.'
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredGoals.map((g) => {
            const isGroup = Boolean(g.childGoals && g.childGoals.length > 0);
            const isExpanded = Boolean(expandedGoals[g.id]);
            const isOwner = user?.id === g.ownerId;
            const canUpdateProgress = isOwner || (isLead && g.teamId === user?.teamId) || isAdmin;
            const canDelete = isAdmin || (isLead && g.teamId === user?.teamId);

            return (
              <div
                key={g.id}
                className={`card flex flex-col justify-between border border-slate-200 transition hover:shadow-md ${
                  isGroup && isExpanded ? 'md:col-span-2' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Period Badge */}
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            g.type === 'WEEKLY'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          {g.type}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                            g.status === 'DONE'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {g.status === 'DONE' ? '✓ Completed' : 'In Progress'}
                        </span>

                        {/* Scope Badge */}
                        {g.targetScope === 'ALL_TEAMS' && (
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                            🏢 All Teams
                          </span>
                        )}
                        {g.targetScope === 'ALL_EMPLOYEES' && (
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            👥 All Employees
                          </span>
                        )}
                        {(g.targetScope === 'TEAM' || (isGroup && g.team)) && (
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                            👥 Team: {g.team?.name || 'Assigned Team'}
                          </span>
                        )}
                        {!isGroup && g.targetScope === 'INDIVIDUAL' && (
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            👤 Individual
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-navy text-base mt-1">{g.title}</h3>
                    </div>

                    {canDelete && (
                      <button
                        onClick={() => handleDeleteGoal(g)}
                        title="Delete Goal"
                        className="text-slate-400 hover:text-rose-600 transition p-1"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {g.description && (
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {g.description}
                    </p>
                  )}

                  {/* Assignee & Dates */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                    {isGroup ? (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🎯</span>
                          <span className="font-semibold text-slate-800">
                            Assigned to {g.childGoals!.length} employees
                          </span>
                        </div>

                        {/* Expand / Collapse Button */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(g.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-navy transition"
                        >
                          <span>{isExpanded ? '▴ Hide Assignees' : `▾ View Assignees (${g.childGoals!.length})`}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Avatar name={g.owner?.displayName || 'User'} size={28} />
                        <div>
                          <p className="font-semibold text-slate-800">
                            {g.owner?.displayName || 'Unassigned'}
                            {isOwner && <span className="ml-1 text-[10px] font-bold text-brand">(You)</span>}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {g.owner?.role || 'EMPLOYEE'} {g.team?.name ? `· ${g.team.name}` : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="text-right text-[11px] text-slate-500">
                      {g.endDate ? (
                        <span>Due: <b className="text-slate-700">{fmtDate(g.endDate)}</b></span>
                      ) : (
                        <span>Ongoing</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Standalone Update Button */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600">
                      {isGroup ? 'Overall Team Progress (Average)' : 'Progress'}
                    </span>
                    <span className={g.progress === 100 ? 'text-emerald-700 font-bold' : 'text-blue-700 font-bold'}>
                      {g.progress}%
                    </span>
                  </div>
                  <ProgressBar pct={g.progress} tone={g.progress === 100 ? 'brand' : 'accent'} />

                  {!isGroup && canUpdateProgress && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => {
                          setSelectedGoal(g);
                          setProgressVal(g.progress);
                          setProgressNote('');
                          setProgressOpen(true);
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-navy transition shadow-2xs"
                      >
                        Update Progress
                      </button>
                    </div>
                  )}
                </div>

                {/* EXPANDED VIEW: Individual Employee Assignments */}
                {isGroup && isExpanded && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 animate-fade">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Assigned Employees ({g.childGoals!.length})</span>
                      <span className="text-[11px] text-slate-500 font-normal">Independent progress tracking</span>
                    </div>

                    <div className="space-y-2">
                      {g.childGoals!.map((child) => {
                        const isChildOwner = user?.id === child.ownerId;
                        const canUpdateChild = isChildOwner || (isLead && child.teamId === user?.teamId) || isAdmin;

                        return (
                          <div
                            key={child.id}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-2.5 bg-white transition ${
                              isChildOwner ? 'border-brand/40 ring-1 ring-brand/20' : 'border-slate-200'
                            }`}
                          >
                            {/* Employee info */}
                            <div className="flex items-center gap-2.5 min-w-[200px]">
                              <Avatar name={child.owner?.displayName || 'User'} size={30} />
                              <div className="truncate">
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {child.owner?.displayName || 'Unknown'}
                                  {isChildOwner && <span className="ml-1 text-[10px] font-bold text-brand">(You)</span>}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {child.owner?.role || 'EMPLOYEE'} {child.team?.name ? `· ${child.team.name}` : ''}
                                </p>
                              </div>
                            </div>

                            {/* Independent Progress Bar & % */}
                            <div className="flex-1 max-w-xs">
                              <div className="mb-1 flex items-center justify-between text-[11px]">
                                <span className="text-slate-500 font-medium">Progress</span>
                                <span className={`font-bold ${child.progress === 100 ? 'text-emerald-700' : 'text-blue-700'}`}>
                                  {child.progress}%
                                </span>
                              </div>
                              <ProgressBar pct={child.progress} tone={child.progress === 100 ? 'brand' : 'accent'} />
                            </div>

                            {/* Status & Update Action */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  child.status === 'DONE'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {child.status === 'DONE' ? '✓ Done' : 'Active'}
                              </span>

                              {canUpdateChild && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedGoal(child);
                                    setProgressVal(child.progress);
                                    setProgressNote('');
                                    setProgressOpen(true);
                                  }}
                                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 hover:text-navy transition shadow-2xs"
                                >
                                  Update
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CREATE GOAL (Change Request 1 Specification) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create & Assign Goal"
      >
        <form onSubmit={handleCreateGoal} className="space-y-4">
          {/* 1. Goal Title */}
          <div>
            <label className="label">Goal Title *</label>
            <input
              type="text"
              required
              className="input text-sm"
              placeholder="e.g. Deliver Client Dashboard v2.0 or Reach 95% QA pass rate"
              maxLength={200}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          {/* 2. Description */}
          <div>
            <label className="label">Description</label>
            <textarea
              rows={3}
              className="input text-sm resize-none"
              placeholder="Provide context, acceptance criteria, or target deliverables..."
              maxLength={5000}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>

          {/* 3. Goal Period (Weekly vs Monthly) */}
          <div>
            <label className="label">Goal Period *</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer items-center justify-center rounded-xl border p-3 text-sm font-semibold transition ${
                  formPeriod === 'WEEKLY'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="goalPeriod"
                  className="sr-only"
                  checked={formPeriod === 'WEEKLY'}
                  onChange={() => setFormPeriod('WEEKLY')}
                />
                Weekly Goal
              </label>

              <label
                className={`flex cursor-pointer items-center justify-center rounded-xl border p-3 text-sm font-semibold transition ${
                  formPeriod === 'MONTHLY'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="goalPeriod"
                  className="sr-only"
                  checked={formPeriod === 'MONTHLY'}
                  onChange={() => setFormPeriod('MONTHLY')}
                />
                Monthly Goal
              </label>
            </div>
          </div>

          {/* 4. Assign To (Individual, Specific Team, All Teams, All Employees) */}
          <div>
            <label className="label">Assign To *</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border p-2.5 font-medium transition ${
                  formScope === 'INDIVIDUAL'
                    ? 'border-brand bg-brand-50 text-brand-700 font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="assignScope"
                  className="sr-only"
                  checked={formScope === 'INDIVIDUAL'}
                  onChange={() => setFormScope('INDIVIDUAL')}
                />
                Individual Employee
              </label>

              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border p-2.5 font-medium transition ${
                  formScope === 'TEAM'
                    ? 'border-brand bg-brand-50 text-brand-700 font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="assignScope"
                  className="sr-only"
                  checked={formScope === 'TEAM'}
                  onChange={() => setFormScope('TEAM')}
                />
                Specific Team
              </label>

              {isAdmin && (
                <>
                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-lg border p-2.5 font-medium transition ${
                      formScope === 'ALL_TEAMS'
                        ? 'border-brand bg-brand-50 text-brand-700 font-bold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignScope"
                      className="sr-only"
                      checked={formScope === 'ALL_TEAMS'}
                      onChange={() => setFormScope('ALL_TEAMS')}
                    />
                    All Teams
                  </label>

                  <label
                    className={`flex cursor-pointer items-center justify-center rounded-lg border p-2.5 font-medium transition ${
                      formScope === 'ALL_EMPLOYEES'
                        ? 'border-brand bg-brand-50 text-brand-700 font-bold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignScope"
                      className="sr-only"
                      checked={formScope === 'ALL_EMPLOYEES'}
                      onChange={() => setFormScope('ALL_EMPLOYEES')}
                    />
                    All Employees
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Conditional Input: Specific Team */}
          {formScope === 'TEAM' && (
            <div>
              <label className="label">Target Team *</label>
              {isLead ? (
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 border border-slate-200">
                  Assigned automatically to your authorized team: <b>{teams.find((t) => t.id === user?.teamId)?.name || 'Your Team'}</b>
                </div>
              ) : (
                <select
                  required
                  className="input text-sm"
                  value={formTeamId}
                  onChange={(e) => setFormTeamId(e.target.value)}
                >
                  <option value="">Select a team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                Independent goal instances will be created for each active member in this team.
              </p>
            </div>
          )}

          {/* Conditional Input: Individual Employee */}
          {formScope === 'INDIVIDUAL' && (
            <div className="space-y-3">
              {isAdmin && (
                <div>
                  <label className="label">Filter by Team (Optional)</label>
                  <select
                    className="input text-xs"
                    value={formTeamId}
                    onChange={(e) => {
                      setFormTeamId(e.target.value);
                      setFormOwnerId('');
                    }}
                  >
                    <option value="">All Teams (Show all employees)</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Select Employee *</label>
                <select
                  required
                  className="input text-sm"
                  value={formOwnerId}
                  onChange={(e) => setFormOwnerId(e.target.value)}
                >
                  <option value="">Select an employee...</option>
                  {availableEmployees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email}) – {u.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Informational banners for Organization-Wide Scopes */}
          {formScope === 'ALL_TEAMS' && (
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 border border-blue-200">
              ℹ️ <b>All Teams Scope:</b> Creates an individual goal instance for every active team member across the company so each employee updates their progress independently.
            </div>
          )}
          {formScope === 'ALL_EMPLOYEES' && (
            <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800 border border-indigo-200">
              ℹ️ <b>Organization Scope:</b> Creates an individual goal instance for every employee across the company with independent progress tracking.
            </div>
          )}

          {/* 7. Start Date and Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input text-sm"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input
                type="date"
                className="input text-sm"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="btn-secondary"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              disabled={busy}
            >
              {busy ? 'Creating Goal...' : 'Create Goal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: UPDATE GOAL PROGRESS */}
      <Modal
        open={progressOpen && !!selectedGoal}
        onClose={() => setProgressOpen(false)}
        title="Update Goal Progress"
      >
        {selectedGoal && (
          <form onSubmit={handleUpdateProgress} className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {selectedGoal.type} GOAL
                </span>
                {selectedGoal.owner && (
                  <span className="text-xs font-semibold text-slate-700">
                    Assignee: {selectedGoal.owner.displayName}
                  </span>
                )}
              </div>
              <p className="font-bold text-navy text-sm">{selectedGoal.title}</p>
              {selectedGoal.description && (
                <p className="text-xs text-slate-600 italic">"{selectedGoal.description}"</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label !mb-0">Progress Percentage</label>
                <span className="text-lg font-extrabold text-brand">{progressVal}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressVal}
                onChange={(e) => setProgressVal(Number(e.target.value))}
                className="w-full accent-[#F03D0A] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>0% (Not started)</span>
                <span>50% (Midway)</span>
                <span>100% (Completed)</span>
              </div>
            </div>

            {/* Quick buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProgressVal(25)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-100"
              >
                25%
              </button>
              <button
                type="button"
                onClick={() => setProgressVal(50)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-100"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setProgressVal(75)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-100"
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setProgressVal(100)}
                className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 text-xs hover:bg-emerald-100"
              >
                100% Done
              </button>
            </div>

            <div>
              <label className="label">Update Note (Optional)</label>
              <textarea
                rows={2}
                className="input text-xs resize-none"
                placeholder="Brief summary of progress accomplished..."
                maxLength={500}
                value={progressNote}
                onChange={(e) => setProgressNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProgressOpen(false)}
                className="btn-secondary"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn"
                disabled={busy}
              >
                {busy ? 'Saving...' : 'Save Progress'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
