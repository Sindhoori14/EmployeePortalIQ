'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Avatar, Modal } from './ui';

interface Meeting {
  id: string;
  title: string;
  meetUrl: string;
  startsAt: string;
  endsAt?: string | null;
  recurrence?: string;
  parentId?: string | null;
  note: string | null;
  noteUpdatedBy?: { displayName: string } | null;
  team: { id: string; name: string } | null;
  createdById?: string;
  createdBy?: { id: string; displayName: string } | null;
}

interface TeamRef {
  id: string;
  name: string;
}

interface UserRef {
  id: string;
  displayName: string;
  email?: string;
  role?: string;
  teamId?: string | null;
}

export function MeetingsCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isTeamLead = user?.role === 'TEAM_LEAD';
  const canManage = isAdmin || isTeamLead;

  const [rows, setRows] = useState<Meeting[]>([]);
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [allUsers, setAllUsers] = useState<UserRef[]>([]);

  // Create Form State
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [at, setAt] = useState('');
  const [daily, setDaily] = useState(false);
  const [targetScope, setTargetScope] = useState<'ALL' | 'TEAM' | 'TEAM_LEADS' | 'INDIVIDUAL' | 'CUSTOM'>(
    isAdmin ? 'ALL' : 'TEAM'
  );
  const [targetTeamId, setTargetTeamId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Note & Edit State
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editAt, setEditAt] = useState('');
  const [editDaily, setEditDaily] = useState(false);
  const [editScope, setEditScope] = useState<'ALL' | 'TEAM' | 'TEAM_LEADS' | 'INDIVIDUAL' | 'CUSTOM'>('ALL');
  const [editTeamId, setEditTeamId] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editUserIds, setEditUserIds] = useState<string[]>([]);

  const load = () => api<Meeting[]>('/meetings').then(setRows).catch(() => {});

  useEffect(() => {
    load();
    if (canManage) {
      api<TeamRef[]>('/teams').then(setTeams).catch(() => []);
      api<{ data?: UserRef[] } | UserRef[]>('/users?limit=200')
        .then((res) => {
          const uList = Array.isArray(res) ? res : res?.data || [];
          setAllUsers(uList);
        })
        .catch(() => []);
    }
  }, [canManage]);

  // Filter available candidate users for target selection
  const selectableUsers = allUsers.filter((u) => {
    if (isAdmin) return true;
    if (isTeamLead && user?.teamId) {
      return u.teamId === user.teamId && u.id !== user.id;
    }
    return true;
  });

  async function saveNote(id: string) {
    await api(`/meetings/${id}/note`, { method: 'PATCH', body: { note: noteText } });
    setOpenNote(null);
    setNoteText('');
    load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !at) return;
    setBusy(true);
    setErr('');
    try {
      const body: any = {
        title: title.trim(),
        meetUrl: url.trim(),
        startsAt: new Date(at).toISOString(),
        recurrence: daily ? 'DAILY' : 'NONE',
        targetScope,
      };

      if (targetScope === 'TEAM') {
        body.teamId = isAdmin ? targetTeamId || null : user?.teamId || null;
      } else if (targetScope === 'INDIVIDUAL') {
        body.targetUserId = targetUserId;
        body.teamId = isAdmin ? null : user?.teamId || null;
      } else if (targetScope === 'CUSTOM') {
        body.targetUserIds = targetUserIds;
        body.teamId = user?.teamId || null;
      } else {
        body.teamId = null;
      }

      await api('/meetings', { method: 'POST', body });
      setTitle('');
      setUrl('');
      setAt('');
      setDaily(false);
      setTargetTeamId('');
      setTargetUserId('');
      setTargetUserIds([]);
      load();
    } catch (ex: any) {
      setErr(ex?.message || 'Failed to schedule meeting');
    } finally {
      setBusy(false);
    }
  }

  function openEditModal(m: Meeting) {
    setEditingMeeting(m);
    setEditTitle(m.title);
    setEditUrl(m.meetUrl);
    setEditDaily(m.recurrence === 'DAILY');

    const dt = new Date(m.startsAt);
    const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditAt(localIso);

    const p = m.parentId ?? 'SCOPE:ALL';
    if (p === 'SCOPE:TEAM_LEADS') {
      setEditScope('TEAM_LEADS');
      setEditTeamId('');
      setEditUserId('');
      setEditUserIds([]);
    } else if (p.startsWith('SCOPE:INDIVIDUAL:')) {
      setEditScope('INDIVIDUAL');
      setEditUserId(p.replace('SCOPE:INDIVIDUAL:', ''));
      setEditTeamId('');
      setEditUserIds([]);
    } else if (p.startsWith('SCOPE:CUSTOM:')) {
      setEditScope('CUSTOM');
      setEditUserIds(p.replace('SCOPE:CUSTOM:', '').split(',').map((x) => x.trim()));
      setEditTeamId(m.team?.id ?? '');
      setEditUserId('');
    } else if (p === 'SCOPE:TEAM' || m.team) {
      setEditScope('TEAM');
      setEditTeamId(m.team?.id ?? '');
      setEditUserId('');
      setEditUserIds([]);
    } else {
      setEditScope('ALL');
      setEditTeamId('');
      setEditUserId('');
      setEditUserIds([]);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMeeting || !editTitle.trim() || !editUrl.trim() || !editAt) return;
    setBusy(true);
    try {
      const body: any = {
        title: editTitle.trim(),
        meetUrl: editUrl.trim(),
        startsAt: new Date(editAt).toISOString(),
        recurrence: editDaily ? 'DAILY' : 'NONE',
        targetScope: editScope,
      };

      if (editScope === 'TEAM') {
        body.teamId = isAdmin ? editTeamId || null : user?.teamId || null;
      } else if (editScope === 'INDIVIDUAL') {
        body.targetUserId = editUserId;
        body.teamId = isAdmin ? null : user?.teamId || null;
      } else if (editScope === 'CUSTOM') {
        body.targetUserIds = editUserIds;
        body.teamId = user?.teamId || null;
      } else {
        body.teamId = null;
      }

      await api(`/meetings/${editingMeeting.id}`, { method: 'PATCH', body });
      setEditingMeeting(null);
      load();
    } catch (ex: any) {
      alert(ex?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, titleName: string) {
    if (!window.confirm(`Are you sure you want to delete the meeting "${titleName}"?`)) return;
    try {
      await api(`/meetings/${id}`, { method: 'DELETE' });
      load();
    } catch (ex: any) {
      alert(ex?.message || 'Delete failed');
    }
  }

  // Audience Badge Helper
  const getAudienceBadge = (m: Meeting) => {
    const p = m.parentId ?? 'SCOPE:ALL';
    if (p === 'SCOPE:TEAM_LEADS') {
      return <span className="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">⭐ Team Leads</span>;
    }
    if (p.startsWith('SCOPE:INDIVIDUAL:')) {
      const uid = p.replace('SCOPE:INDIVIDUAL:', '');
      const uName = allUsers.find((x) => x.id === uid)?.displayName ?? 'Member';
      return <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">👤 1-on-1 ({uName})</span>;
    }
    if (p.startsWith('SCOPE:CUSTOM:')) {
      const count = p.replace('SCOPE:CUSTOM:', '').split(',').length;
      return <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">👥 Custom Group ({count})</span>;
    }
    if (m.team) {
      return <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">👥 Team: {m.team.name}</span>;
    }
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">🌐 All Organization</span>;
  };

  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="h2 flex items-center gap-2">
          <span>📅</span> Meetings — join in one tap
        </h2>
      </div>

      {rows.length === 0 && <p className="text-sm text-slate-500 py-3">No upcoming meetings. Enjoy the quiet.</p>}

      <ul className="space-y-2.5">
        {rows.map((m) => {
          const live = Math.abs(new Date(m.startsAt).getTime() - Date.now()) < 15 * 60_000;
          const canEditThis = isAdmin || m.createdById === user?.id || (isTeamLead && m.team?.id === user?.teamId);

          return (
            <li key={m.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-sm transition hover:bg-slate-50">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-base">{live ? '🔴' : '🕒'}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-ink-900 text-sm">{m.title}</b>
                    {getAudienceBadge(m)}
                    {m.recurrence === 'DAILY' && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Daily</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(m.startsAt).toLocaleString([], {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    className="btn-secondary !px-2.5 !py-1 text-xs"
                    onClick={() => {
                      setOpenNote(openNote === m.id ? null : m.id);
                      setNoteText(m.note ?? '');
                    }}
                  >
                    📝 {m.note ? 'Note' : 'Add note'}
                  </button>

                  <a href={m.meetUrl} target="_blank" rel="noreferrer" className="btn !px-3.5 !py-1 text-xs">
                    Join →
                  </a>

                  {canEditThis && (
                    <>
                      <button
                        onClick={() => openEditModal(m)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
                        title="Edit Meeting"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.id, m.title)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                        title="Delete Meeting"
                      >
                        🗑️ Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {m.note && openNote !== m.id && (
                <p className="mt-2 rounded-lg bg-white/80 p-2 text-xs text-slate-600 border border-slate-200/50 whitespace-pre-wrap">
                  📌 {m.note}
                </p>
              )}

              {openNote === m.id && (
                <div className="mt-2.5 flex gap-2">
                  <textarea
                    className="input text-xs"
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Shared note for everyone in this meeting…"
                    maxLength={10000}
                  />
                  <button className="btn !text-xs !py-1" onClick={() => saveNote(m.id)}>
                    Save
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Schedule Form for Admin and Team Lead */}
      {canManage && (
        <form onSubmit={create} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Schedule New Meeting</p>
          {err && <p className="err text-xs">{err}</p>}

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className="input text-xs"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title, e.g. Daily Standup"
              maxLength={200}
            />
            <input
              className="input text-xs"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Meeting link https://..."
            />
            <input
              className="input text-xs"
              required
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </div>

          {/* Target Audience Selector */}
          <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-slate-200">
            <div>
              <label className="label !text-xs !mb-1">Target Audience</label>
              <select
                className="input text-xs"
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value as any)}
              >
                {isAdmin ? (
                  <>
                    <option value="ALL">🌐 All Organization</option>
                    <option value="TEAM">👥 Particular Team</option>
                    <option value="TEAM_LEADS">⭐ Team Leads Only</option>
                    <option value="INDIVIDUAL">👤 Individual Member</option>
                  </>
                ) : (
                  <>
                    <option value="TEAM">👥 Entire Team</option>
                    <option value="INDIVIDUAL">👤 Individual Member</option>
                    <option value="CUSTOM">👥 Custom Group (Select members)</option>
                  </>
                )}
              </select>
            </div>

            {/* Sub-selectors depending on targetScope */}
            {isAdmin && targetScope === 'TEAM' && (
              <div>
                <label className="label !text-xs !mb-1">Select Team</label>
                <select
                  className="input text-xs"
                  required
                  value={targetTeamId}
                  onChange={(e) => setTargetTeamId(e.target.value)}
                >
                  <option value="">Choose a team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetScope === 'INDIVIDUAL' && (
              <div>
                <label className="label !text-xs !mb-1">Select Individual Person</label>
                <select
                  className="input text-xs"
                  required
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                >
                  <option value="">Choose a person...</option>
                  {selectableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.role?.toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Custom Group Checkboxes for Team Lead */}
          {targetScope === 'CUSTOM' && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <p className="text-xs font-semibold text-slate-700 mb-2">Select Team Members for this meeting:</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5">
                {selectableUsers.map((u) => {
                  const checked = targetUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-xs hover:bg-slate-50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => {
                          setTargetUserIds((prev) =>
                            ev.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                          );
                        }}
                      />
                      <span className="font-medium text-slate-800">{u.displayName}</span>
                      <span className="text-[11px] text-slate-400">({u.email})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
              <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
              Repeat daily
            </label>
            <button className="btn !text-xs !px-5" disabled={busy}>
              {busy ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      )}

      {/* Edit Meeting Modal */}
      <Modal open={!!editingMeeting} onClose={() => setEditingMeeting(null)} title="Edit Meeting">
        {editingMeeting && (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <div>
              <label className="label !text-xs">Meeting Title</label>
              <input
                className="input text-xs"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label !text-xs">Meet Link</label>
              <input
                className="input text-xs"
                required
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="label !text-xs">Date & Time</label>
              <input
                className="input text-xs"
                required
                type="datetime-local"
                value={editAt}
                onChange={(e) => setEditAt(e.target.value)}
              />
            </div>

            {/* Audience in Edit Modal */}
            <div>
              <label className="label !text-xs">Target Audience</label>
              <select
                className="input text-xs"
                value={editScope}
                onChange={(e) => setEditScope(e.target.value as any)}
              >
                {isAdmin ? (
                  <>
                    <option value="ALL">🌐 All Organization</option>
                    <option value="TEAM">👥 Particular Team</option>
                    <option value="TEAM_LEADS">⭐ Team Leads Only</option>
                    <option value="INDIVIDUAL">👤 Individual Member</option>
                  </>
                ) : (
                  <>
                    <option value="TEAM">👥 Entire Team</option>
                    <option value="INDIVIDUAL">👤 Individual Member</option>
                    <option value="CUSTOM">👥 Custom Group</option>
                  </>
                )}
              </select>
            </div>

            {isAdmin && editScope === 'TEAM' && (
              <div>
                <label className="label !text-xs">Select Team</label>
                <select
                  className="input text-xs"
                  value={editTeamId}
                  onChange={(e) => setEditTeamId(e.target.value)}
                >
                  <option value="">Choose team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editScope === 'INDIVIDUAL' && (
              <div>
                <label className="label !text-xs">Select Individual</label>
                <select
                  className="input text-xs"
                  value={editUserId}
                  onChange={(e) => setEditUserId(e.target.value)}
                >
                  <option value="">Choose person...</option>
                  {selectableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editScope === 'CUSTOM' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-xs font-semibold text-slate-700 mb-1.5">Select Team Members:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectableUsers.map((u) => {
                    const checked = editUserIds.includes(u.id);
                    return (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(ev) => {
                            setEditUserIds((prev) =>
                              ev.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                            );
                          }}
                        />
                        <span>{u.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
              <input type="checkbox" checked={editDaily} onChange={(e) => setEditDaily(e.target.checked)} />
              Repeat daily
            </label>

            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn flex-1" disabled={busy}>
                {busy ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingMeeting(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

export function HrCard() {
  const { user } = useAuth();
  const [hr, setHr] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);

  useEffect(() => {
    if (!user?.teamId) return;
    api<any>(`/teams/${user.teamId}`).then((t) => { setHr(t.hr ?? null); setLead(t.lead ?? null); }).catch(() => {});
  }, [user]);

  if (!user?.teamId || (!hr && !lead)) return null;
  return (
    <section className="card">
      <h2 className="h2">🤝 Your support contacts</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {hr && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Avatar name={hr.displayName} userId={hr.id} />
            <div className="text-sm">
              <p className="font-semibold">{hr.displayName}</p>
              <p className="text-slate-500">HR support · {hr.email}</p>
              <a className="text-brand-600 hover:underline" href={`mailto:${hr.email}`}>Ask HR for help →</a>
            </div>
          </div>
        )}
        {lead && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Avatar name={lead.displayName} userId={lead.id} />
            <div className="text-sm">
              <p className="font-semibold">{lead.displayName}</p>
              <p className="text-slate-500">Team lead · {lead.email}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function LeavesWidget() {
  const { user } = useAuth();
  const [mine, setMine] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  useEffect(() => {
    api<any[]>('/leaves/mine').then((r) => setMine(r.filter((x) => x.status === 'APPROVED').slice(0, 3))).catch(() => {});
    if (user && ['ADMIN', 'TEAM_LEAD', 'COORDINATOR'].includes(user.role)) {
      api<any[]>('/leaves/pending').then(setPending).catch(() => {});
    }
  }, [user]);

  if (!mine.length && !pending.length) return null;
  return (
    <section className="card">
      <h2 className="h2">🌴 Leaves</h2>
      {pending.length > 0 && (
        <Link href="/leaves" className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-800 hover:bg-amber-100">
          <span>⏳</span><b>{pending.length} request{pending.length > 1 ? 's' : ''} waiting for decision.</b><span className="ml-auto font-semibold">Review →</span>
        </Link>
      )}
      {mine.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-600">
          {mine.map((l) => (
            <li key={l.id}>• {l.fromDate.slice(0, 10)} → {l.toDate.slice(0, 10)}</li>
          ))}
        </ul>
      )}
      {mine.length === 0 && pending.length === 0 && <p className="text-sm text-slate-500">No upcoming leaves.</p>}
    </section>
  );
}

export function HrSupportButton({ teamId, teamName }: { teamId: string | null; teamName?: string }) {
  const [open, setOpen] = useState(false);
  const [hr, setHr] = useState<any>(null);
  const [err, setErr] = useState('');

  async function show() {
    setErr('');
    if (!teamId) { setHr(null); setOpen(true); return; }
    try {
      const t = await api<any>(`/teams/${teamId}`);
      setHr(t.hr ?? null);
      setOpen(true);
    } catch (e: any) { setErr(e.message ?? 'Failed'); setOpen(true); }
  }

  return (
    <>
      <button className="btn-ghost !text-xs" onClick={show}>HR support</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`HR support${teamName ? ` — ${teamName}` : ''}`}>
        {err && <p className="err">{err}</p>}
        {!teamId || !hr ? (
          <p className="text-sm text-slate-600">No HR assigned to this team yet. Ask your admin to assign one in Teams.</p>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={hr.displayName} userId={hr.id} size={44} />
            <div className="text-sm">
              <p className="font-semibold">{hr.displayName}</p>
              <p className="text-slate-500">{hr.email}</p>
              <a className="text-brand-600 hover:underline" href={`mailto:${hr.email}`}>Write to HR →</a>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
