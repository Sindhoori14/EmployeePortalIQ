'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Avatar, Empty, Loading, Modal, PageHeader } from '../../components/ui';
import { useRequireAuth } from '../../lib/auth-context';

interface Person { id: string; displayName: string; email?: string; role: string; isActive: boolean; teamId?: string | null }
interface Team {
  id: string; name: string; description: string | null; leadId: string | null; coordinatorId: string | null; hrId: string | null;
  createdById?: string | null; canEdit?: boolean;
  lead?: { id: string; displayName: string } | null;
  coordinator?: { id: string; displayName: string } | null;
  hr?: { id: string; displayName: string } | null;
  createdBy?: { id: string; displayName: string } | null;
  _count?: { members: number };
}
interface TeamDetail extends Team {
  members: Person[];
  canEdit?: boolean;
}

export default function TeamsPage() {
  const { user, loading } = useRequireAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isTeamLead = user?.role === 'TEAM_LEAD';
  const canCreate = isAdmin || isTeamLead;

  const [teams, setTeams] = useState<Team[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Team Details Modal
  const [open, setOpen] = useState<TeamDetail | null>(null);
  const [edit, setEdit] = useState({
    name: '',
    description: '',
    leadId: '',
    coordinatorId: '',
    hrId: '',
    memberIds: [] as string[],
  });
  const [editMemberSearch, setEditMemberSearch] = useState('');

  // Create Team Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    leadId: '',
    coordinatorId: '',
    hrId: '',
    memberIds: [] as string[],
  });
  const [createMemberSearch, setCreateMemberSearch] = useState('');
  const [createErr, setCreateErr] = useState('');

  // Candidates for Leads, Coordinators, HR, and Members
  const [allUsers, setAllUsers] = useState<Person[]>([]);

  const load = useCallback(async () => {
    try {
      setTeams(await api<Team[]>('/teams'));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Load failed');
    }
  }, []);

  useEffect(() => {
    if (user) {
      load();
      // Preload active users for team staffing & member selection
      api<{ data: Person[] }>('/users?active=true&limit=250')
        .then((res) => setAllUsers(res.data))
        .catch(() => {});
    }
  }, [user, load]);

  const leads = useMemo(() => allUsers.filter((u) => u.role === 'TEAM_LEAD'), [allUsers]);
  const coordinators = useMemo(() => allUsers.filter((u) => u.role === 'COORDINATOR'), [allUsers]);
  const staff = allUsers;

  // For Team Leads, filter selectable members to their authorized team scope or unassigned employees
  const candidateEmployees = useMemo(() => {
    const emps = allUsers.filter((u) => u.role === 'EMPLOYEE');
    if (!isTeamLead || !user) return emps;
    return emps.filter((u) => !u.teamId || u.teamId === user.teamId);
  }, [allUsers, isTeamLead, user]);

  const openCreateModal = () => {
    setCreateErr('');
    setCreateForm({
      name: '',
      description: '',
      leadId: isTeamLead && user ? user.id : '',
      coordinatorId: '',
      hrId: '',
      memberIds: [],
    });
    setCreateMemberSearch('');
    setCreateOpen(true);
  };

  async function show(t: Team) {
    setErr('');
    try {
      const d = await api<TeamDetail>(`/teams/${t.id}`);
      setOpen(d);
      setEdit({
        name: d.name,
        description: d.description ?? '',
        leadId: d.leadId ?? '',
        coordinatorId: d.coordinatorId ?? '',
        hrId: d.hrId ?? '',
        memberIds: (d.members ?? []).map((m) => m.id),
      });
      setEditMemberSearch('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not open team');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setBusy(true);
    setCreateErr('');
    try {
      await api('/teams', {
        method: 'POST',
        body: {
          name: createForm.name.trim(),
          description: createForm.description.trim() || undefined,
          leadId: createForm.leadId || undefined,
          coordinatorId: createForm.coordinatorId || undefined,
          hrId: createForm.hrId || undefined,
          memberIds: createForm.memberIds.length ? createForm.memberIds : undefined,
        },
      });
      setCreateOpen(false);
      await load();
    } catch (ex) {
      setCreateErr(ex instanceof ApiError ? ex.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  const canManage = (t: Team | TeamDetail | null) => {
    if (!t || !user) return false;
    return Boolean(t.canEdit || isAdmin || (isTeamLead && (t.leadId === user.id || t.createdById === user.id || user.teamId === t.id)));
  };

  async function handleDelete() {
    if (!open) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${open.name}"? All assigned members will be unassigned and team data will be removed.`
    );
    if (!confirmDelete) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/teams/${open.id}`, { method: 'DELETE' });
      setOpen(null);
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/teams/${open.id}`, {
        method: 'PATCH',
        body: {
          name: edit.name.trim(),
          description: edit.description.trim() || undefined,
          leadId: edit.leadId || undefined,
          coordinatorId: edit.coordinatorId || undefined,
          hrId: edit.hrId || undefined,
          memberIds: edit.memberIds,
        },
      });
      setOpen(null);
      await load();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <Loading />;

  const nameOf = (id: string | null) => (id ? allUsers.find((c) => c.id === id)?.displayName ?? open?.members.find((m) => m.id === id)?.displayName : undefined);

  return (
    <div>
      <PageHeader title="Teams" sub={`${teams.length} team${teams.length === 1 ? '' : 's'}`}>
        {canCreate && (
          <button onClick={openCreateModal} className="btn">
            + Create team
          </button>
        )}
      </PageHeader>

      {err && !open && <p className="err mb-4" role="alert">{err}</p>}

      {teams.length === 0 ? (
        <div className="card">
          <Empty
            icon="👥"
            text={canCreate ? 'Click "+ Create team" above to set up your first team.' : 'No teams assigned to you yet.'}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => show(t)}
              className="card text-left transition hover:-translate-y-0.5 hover:shadow-md relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 text-lg font-bold text-white">
                    {t.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900">{t.name}</p>
                    <p className="text-sm text-slate-500">{t._count?.members ?? 0} members</p>
                  </div>
                </div>
                {canManage(t) ? (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    Manage
                  </span>
                ) : (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    View-only
                  </span>
                )}
              </div>

              {t.description && <p className="mt-3 text-sm text-slate-600 line-clamp-2">{t.description}</p>}

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
                {t.lead && (
                  <span>
                    Lead: <b className="text-ink-900">{t.lead.displayName}</b>
                  </span>
                )}
                {t.createdBy && (
                  <span className="ml-auto text-[11px] text-slate-400">
                    By: {t.createdBy.displayName}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* CR9: Complete Create Team Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Team">
        <form onSubmit={handleCreate} className="space-y-3">
          {createErr && <p className="err" role="alert">{createErr}</p>}

          <div>
            <label className="label">Team name <span className="text-red-500">*</span></label>
            <input
              className="input"
              required
              maxLength={120}
              placeholder="e.g. Frontend Engineering"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              placeholder="Brief team purpose or scope..."
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Team Lead</label>
              <select
                className="input"
                value={createForm.leadId}
                onChange={(e) => setCreateForm({ ...createForm, leadId: e.target.value })}
              >
                <option value="">Select Team Lead</option>
                {leads.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} {c.id === user.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Coordinator</label>
              <select
                className="input"
                value={createForm.coordinatorId}
                onChange={(e) => setCreateForm({ ...createForm, coordinatorId: e.target.value })}
              >
                <option value="">Select Coordinator</option>
                {coordinators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">HR Support</label>
              <select
                className="input"
                value={createForm.hrId}
                onChange={(e) => setCreateForm({ ...createForm, hrId: e.target.value })}
              >
                <option value="">Select HR</option>
                {staff.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({c.role.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CR9: Multi-Select Team Members */}
          <div>
            <div className="flex items-center justify-between pb-1">
              <label className="label !mb-0">
                Team Members ({createForm.memberIds.length} selected)
              </label>
              {isTeamLead && (
                <span className="text-[11px] text-brand-600 font-medium">
                  Scope: authorized team / unassigned
                </span>
              )}
            </div>
            <input
              className="input !py-1.5 text-xs mb-2"
              type="search"
              placeholder="Filter employees to assign…"
              value={createMemberSearch}
              onChange={(e) => setCreateMemberSearch(e.target.value)}
            />
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1">
              {candidateEmployees
                .filter((e) => !createMemberSearch.trim() || e.displayName.toLowerCase().includes(createMemberSearch.trim().toLowerCase()))
                .map((e) => {
                  const checked = createForm.memberIds.includes(e.id);
                  return (
                    <label
                      key={e.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm hover:bg-slate-50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => {
                          setCreateForm((prev) => ({
                            ...prev,
                            memberIds: ev.target.checked
                              ? [...prev.memberIds, e.id]
                              : prev.memberIds.filter((id) => id !== e.id),
                          }));
                        }}
                      />
                      <Avatar userId={e.id} name={e.displayName} size={22} />
                      <span className="font-medium text-ink-900 truncate flex-1">
                        {e.displayName}
                      </span>
                      {e.teamId ? (
                        <span className="text-[10px] text-slate-400">In another team</span>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-semibold">Unassigned</span>
                      )}
                    </label>
                  );
                })}
              {candidateEmployees.length === 0 && (
                <p className="p-3 text-center text-xs text-slate-400">No candidate employees available</p>
              )}
            </div>
          </div>

          <button className="btn w-full" disabled={busy}>
            {busy ? 'Creating team...' : 'Create team'}
          </button>
        </form>
      </Modal>

      {/* Team Details & Edit Modal */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <form onSubmit={handleSave} className="space-y-4">
            {err && <p className="err" role="alert">{err}</p>}

            {/* CR9: View-only notice for non-creator Admins / others */}
            {!canManage(open) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                🔒 View-only access: Only the creator of this team can edit details or manage members.
              </div>
            )}

            {canManage(open) ? (
              <>
                <div>
                  <label className="label">Team name <span className="text-red-500">*</span></label>
                  <input
                    className="input"
                    required
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Description</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={edit.description}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Team lead</label>
                    <select
                      className="input"
                      value={edit.leadId}
                      onChange={(e) => setEdit({ ...edit, leadId: e.target.value })}
                    >
                      <option value="">{nameOf(open.leadId) ? `Keep: ${nameOf(open.leadId)}` : 'Not assigned'}</option>
                      {leads.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Coordinator</label>
                    <select
                      className="input"
                      value={edit.coordinatorId}
                      onChange={(e) => setEdit({ ...edit, coordinatorId: e.target.value })}
                    >
                      <option value="">{nameOf(open.coordinatorId) ? `Keep: ${nameOf(open.coordinatorId)}` : 'Not assigned'}</option>
                      {coordinators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">HR support</label>
                    <select
                      className="input"
                      value={edit.hrId}
                      onChange={(e) => setEdit({ ...edit, hrId: e.target.value })}
                    >
                      <option value="">{nameOf(open.hrId) ? `Keep: ${nameOf(open.hrId)}` : 'Not assigned'}</option>
                      {staff.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName} ({c.role.toLowerCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* CR9: Editable Member Assignment */}
                <div>
                  <div className="flex items-center justify-between pb-1">
                    <label className="label !mb-0">
                      Manage Team Members ({edit.memberIds.length} assigned)
                    </label>
                  </div>
                  <input
                    className="input !py-1.5 text-xs mb-2"
                    type="search"
                    placeholder="Search employees to add/remove…"
                    value={editMemberSearch}
                    onChange={(e) => setEditMemberSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1">
                    {candidateEmployees
                      .filter((e) => !editMemberSearch.trim() || e.displayName.toLowerCase().includes(editMemberSearch.trim().toLowerCase()))
                      .map((e) => {
                        const checked = edit.memberIds.includes(e.id);
                        return (
                          <label
                            key={e.id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm hover:bg-slate-50 transition"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(ev) => {
                                setEdit((prev) => ({
                                  ...prev,
                                  memberIds: ev.target.checked
                                    ? [...prev.memberIds, e.id]
                                    : prev.memberIds.filter((id) => id !== e.id),
                                }));
                              }}
                            />
                            <Avatar userId={e.id} name={e.displayName} size={22} />
                            <span className="font-medium text-ink-900 truncate flex-1">
                              {e.displayName}
                            </span>
                            {checked ? (
                              <span className="text-[10px] text-brand-600 font-bold uppercase">Assigned</span>
                            ) : e.teamId ? (
                              <span className="text-[10px] text-slate-400">Other team</span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-semibold">Unassigned</span>
                            )}
                          </label>
                        );
                      })}
                  </div>
                </div>
              </>
            ) : (
              /* CR9: View-only rendering */
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 space-y-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">Description</p>
                    <p className="text-sm text-slate-700">{open.description || 'No description provided.'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-slate-400">Team Lead</p>
                      <p className="text-sm font-medium text-ink-900">{nameOf(open.leadId) ?? 'None'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-slate-400">Coordinator</p>
                      <p className="text-sm font-medium text-ink-900">{nameOf(open.coordinatorId) ?? 'None'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-slate-400">HR Support</p>
                      <p className="text-sm font-medium text-ink-900">{nameOf(open.hrId) ?? 'None'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-slate-400">Created By</p>
                      <p className="text-sm font-medium text-ink-900">{open.createdBy?.displayName ?? 'Admin'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="label">Assigned Members ({open.members.filter((m) => m.isActive).length})</p>
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-3">
                    {open.members.filter((m) => m.isActive).map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <Avatar userId={m.id} name={m.displayName} size={24} />
                        <span className="font-medium text-ink-900">{m.displayName}</span>
                        {m.id === open.leadId && (
                          <span className="rounded bg-brand-50 px-1.5 text-[10px] font-bold uppercase text-brand-600">Lead</span>
                        )}
                        {m.id === open.coordinatorId && (
                          <span className="rounded bg-accent-50 px-1.5 text-[10px] font-bold uppercase text-accent-700">Coordinator</span>
                        )}
                        {m.email && <span className="ml-auto truncate text-xs text-slate-400">{m.email}</span>}
                      </li>
                    ))}
                    {open.members.length === 0 && <li className="text-sm text-slate-500">No members yet.</li>}
                  </ul>
                </div>
              </div>
            )}

            {canManage(open) && (
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="btn flex-1" disabled={busy}>
                  {busy ? 'Saving team...' : 'Save team'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                  disabled={busy}
                >
                  Delete team
                </button>
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
