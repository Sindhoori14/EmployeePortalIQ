'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, fmtDate, STATUS_LABEL } from '../../lib/api';
import { Avatar, Empty, Loading, Modal, PageHeader, Stat } from '../../components/ui';
import { useAuth, useRequireAuth } from '../../lib/auth-context';

type EventType = 'MEETING' | 'HOLIDAY' | 'ANNOUNCEMENT' | 'OTHER';
type AudienceType = 'ALL_EMPLOYEES' | 'ALL_TEAMS' | 'SPECIFIC_TEAM';

interface CalendarEventItem {
  id: string;
  type: EventType;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  meetUrl?: string | null;
  audience: AudienceType;
  team?: { id: string; name: string } | null;
  createdBy?: { id: string; displayName: string } | null;
}

interface LegacyMeetingItem {
  id: string;
  title: string;
  startsAt: string;
  meetUrl: string;
  team: { id: string; name: string } | null;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  owner: { id: string; displayName: string };
}

interface LeaveItem {
  user: string;
  fromDate: string;
  toDate: string;
}

interface DayData {
  events: CalendarEventItem[];
  meetings: LegacyMeetingItem[];
  tasks: TaskItem[];
  leaves: LeaveItem[];
  isHoliday: boolean;
  isWorkingDay: boolean;
}

export default function CalendarPage() {
  const { user, loading } = useRequireAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isLead = user?.role === 'TEAM_LEAD';
  const canManageEvents = isAdmin || isLead;

  // Selected month YYYY-MM
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [days, setDays] = useState<Record<string, DayData>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter for view
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [fType, setFType] = useState<EventType>('MEETING');
  const [fTitle, setFTitle] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fStartDate, setFStartDate] = useState('');
  const [fEndDate, setFEndDate] = useState('');
  const [fStartTime, setFStartTime] = useState('10:00');
  const [fEndTime, setFEndTime] = useState('11:00');
  const [fMeetUrl, setFMeetUrl] = useState('');
  const [fAudience, setFAudience] = useState<AudienceType>('ALL_EMPLOYEES');
  const [fTeamId, setFTeamId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Load calendar month data
  const loadCalendar = useCallback(async () => {
    if (!user || !month) return;
    setIsLoading(true);
    try {
      const [calRes, teamsRes] = await Promise.all([
        api<{ month: string; days: Record<string, DayData> }>(`/calendar?month=${month}`),
        api<Array<{ id: string; name: string }>>('/teams').catch(() => []),
      ]);
      setDays(calRes.days || {});
      setTeams(teamsRes || []);

      // If no day selected, pick today if in month, or first date of month
      const todayStr = new Intl.DateTimeFormat('en-CA').format(new Date());
      if (calRes.days && calRes.days[todayStr]) {
        setSelectedDate((prev) => (prev && calRes.days[prev] ? prev : todayStr));
      } else {
        const firstDay = Object.keys(calRes.days || {}).sort()[0];
        setSelectedDate((prev) => (prev && calRes.days[prev] ? prev : firstDay || ''));
      }
    } catch (err) {
      console.error('Calendar load failed', err);
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Failed to load calendar' });
    } finally {
      setIsLoading(false);
    }
  }, [user, month]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Navigate months
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const nextY = d.getUTCFullYear();
    const nextM = String(d.getUTCMonth() + 1).padStart(2, '0');
    setMonth(`${nextY}-${nextM}`);
  };

  // Month Statistics
  const stats = useMemo(() => {
    let totalEvents = 0;
    let holidaysCount = 0;
    let meetingsCount = 0;
    let leavesCount = 0;
    let tasksCount = 0;

    Object.values(days).forEach((d) => {
      totalEvents += (d.events?.length || 0) + (d.meetings?.length || 0);
      if (d.isHoliday) holidaysCount++;
      meetingsCount += (d.meetings?.length || 0) + (d.events?.filter((e) => e.type === 'MEETING').length || 0);
      leavesCount += d.leaves?.length || 0;
      tasksCount += d.tasks?.length || 0;
    });

    return { totalEvents, holidaysCount, meetingsCount, leavesCount, tasksCount };
  }, [days]);

  // Calendar dates layout
  const dateKeys = useMemo(() => Object.keys(days).sort(), [days]);
  const firstDayOffset = useMemo(() => {
    if (!dateKeys.length) return 0;
    // Monday-first offset
    const dow = new Date(`${dateKeys[0]}T00:00:00Z`).getUTCDay();
    return (dow + 6) % 7;
  }, [dateKeys]);

  // Open Create Modal
  const openCreateModal = (defaultDate?: string) => {
    const dateToUse = defaultDate || selectedDate || new Intl.DateTimeFormat('en-CA').format(new Date());
    setEditingEventId(null);
    setFType('MEETING');
    setFTitle('');
    setFDescription('');
    setFStartDate(dateToUse);
    setFEndDate(dateToUse);
    setFStartTime('10:00');
    setFEndTime('11:00');
    setFMeetUrl('');
    setFAudience(isAdmin ? 'ALL_EMPLOYEES' : 'SPECIFIC_TEAM');
    setFTeamId(user?.teamId || (teams[0]?.id ?? ''));
    setModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (event: CalendarEventItem) => {
    setEditingEventId(event.id);
    setFType(event.type);
    setFTitle(event.title);
    setFDescription(event.description || '');
    setFStartDate(event.startDate);
    setFEndDate(event.endDate);
    setFStartTime(event.startTime || '10:00');
    setFEndTime(event.endTime || '11:00');
    setFMeetUrl(event.meetUrl || '');
    setFAudience(event.audience);
    setFTeamId(event.team?.id || user?.teamId || '');
    setModalOpen(true);
  };

  // Submit Event Form
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fTitle.trim() || !fStartDate || !fEndDate) {
      setFeedback({ type: 'error', message: 'Please provide Title, Start Date, and End Date.' });
      return;
    }
    if (fStartDate > fEndDate) {
      setFeedback({ type: 'error', message: 'End date cannot be earlier than start date.' });
      return;
    }
    if (fAudience === 'SPECIFIC_TEAM' && !fTeamId) {
      setFeedback({ type: 'error', message: 'Please choose a target team.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload: any = {
        type: fType,
        title: fTitle.trim(),
        description: fDescription.trim() || undefined,
        startDate: fStartDate,
        endDate: fEndDate,
        audience: fAudience,
        teamId: fAudience === 'SPECIFIC_TEAM' ? fTeamId : null,
      };

      // Only add times/meetUrl for non-holidays
      if (fType !== 'HOLIDAY') {
        if (fStartTime) payload.startTime = fStartTime;
        if (fEndTime) payload.endTime = fEndTime;
        if (fMeetUrl.trim()) payload.meetUrl = fMeetUrl.trim();
      }

      if (editingEventId) {
        await api(`/calendar/events/${editingEventId}`, {
          method: 'PATCH',
          body: payload,
        });
        setFeedback({ type: 'success', message: 'Calendar event updated successfully.' });
      } else {
        await api('/calendar/events', {
          method: 'POST',
          body: payload,
        });
        setFeedback({ type: 'success', message: 'Calendar event created successfully.' });
      }

      setModalOpen(false);
      await loadCalendar();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Failed to save event.' });
    } finally {
      setSaving(false);
    }
  };

  // Delete Event
  const handleDeleteEvent = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete event "${title}"?`)) return;
    try {
      await api(`/calendar/events/${id}`, { method: 'DELETE' });
      setFeedback({ type: 'success', message: 'Event deleted successfully.' });
      await loadCalendar();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Failed to delete event.' });
    }
  };

  if (loading || !user) return <Loading />;

  // Selected Day Details
  const selectedDayData: DayData | undefined = selectedDate ? days[selectedDate] : undefined;

  // Filtered Events for selected day
  const dayEvents = (selectedDayData?.events || []).filter((e) => {
    if (typeFilter === 'ALL') return true;
    return e.type === typeFilter;
  });

  // Badge styles per type
  const eventBadgeStyle = (type: EventType) => {
    switch (type) {
      case 'HOLIDAY':
        return 'bg-purple-100 text-purple-800 ring-1 ring-purple-300';
      case 'MEETING':
        return 'bg-blue-100 text-blue-800 ring-1 ring-blue-300';
      case 'ANNOUNCEMENT':
        return 'bg-orange-100 text-[#FF5500] ring-1 ring-orange-300';
      case 'OTHER':
        return 'bg-slate-100 text-slate-800 ring-1 ring-slate-300';
    }
  };

  const eventIcon = (type: EventType) => {
    switch (type) {
      case 'HOLIDAY':
        return '🎉';
      case 'MEETING':
        return '📹';
      case 'ANNOUNCEMENT':
        return '📢';
      case 'OTHER':
        return '📌';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Organization Calendar"
        sub="Centralized company schedule, meetings, holidays, task milestones, and approved leaves."
      >
        <div className="flex items-center gap-2">
          {canManageEvents && (
            <button
              onClick={() => openCreateModal()}
              className="rounded-lg bg-[#FF5500] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#e04b00] transition flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Create Event</span>
            </button>
          )}

          {/* Month Navigator */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              onClick={() => shiftMonth(-1)}
              className="rounded px-2.5 py-1 text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
              title="Previous Month"
            >
              ‹
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border-0 bg-transparent px-2 py-1 text-xs font-semibold text-ink-900 focus:ring-0"
            />
            <button
              onClick={() => shiftMonth(1)}
              className="rounded px-2.5 py-1 text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
              title="Next Month"
            >
              ›
            </button>
          </div>
        </div>
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
          <button onClick={() => setFeedback(null)} className="text-xs font-semibold opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total Scheduled Events" value={stats.totalEvents} tone="brand" hint="Active on calendar" />
        <Stat label="Company Holidays" value={stats.holidaysCount} tone="default" hint="Full-day non-working" />
        <Stat label="Meetings & Syncs" value={stats.meetingsCount} tone="default" hint="Video calls & syncs" />
        <Stat label="Task Deadlines" value={stats.tasksCount} tone="warn" hint="Due deliverables" />
        <Stat label="Approved Leaves" value={stats.leavesCount} tone="success" hint="Personnel out on leave" />
      </div>

      {/* Main Calendar Section: Grid + Detail Sidebar */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Calendar Grid (7 columns) */}
        <div className="card space-y-3 lg:col-span-8">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Month Dates */}
          <div className="grid grid-cols-7 gap-1">
            {/* Blank offset days */}
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`offset-${i}`} className="min-h-[82px] rounded-lg bg-slate-50/40 p-1 opacity-25" />
            ))}

            {/* Calendar Days */}
            {dateKeys.map((d) => {
              const day = days[d];
              const isSelected = selectedDate === d;
              const isToday = d === new Intl.DateTimeFormat('en-CA').format(new Date());
              const dayNum = Number(d.slice(8));
              const eventCount = (day.events?.length || 0) + (day.meetings?.length || 0);
              const taskCount = day.tasks?.length || 0;
              const leaveCount = day.leaves?.length || 0;

              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`group relative flex min-h-[88px] flex-col rounded-xl border p-1.5 text-left transition ${
                    isSelected
                      ? 'border-[#FF5500] bg-orange-50/50 shadow-sm ring-2 ring-[#FF5500]/30'
                      : day.isHoliday
                      ? 'border-purple-200 bg-purple-50/40 hover:border-purple-300'
                      : !day.isWorkingDay
                      ? 'border-slate-200/60 bg-slate-50/60 text-slate-400'
                      : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  {/* Date number + indicators */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isToday
                          ? 'bg-[#1E3A8A] text-white shadow-xs'
                          : isSelected
                          ? 'text-[#FF5500]'
                          : 'text-ink-800'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {day.isHoliday && (
                      <span className="text-[11px]" title="Holiday">
                        🎉
                      </span>
                    )}
                  </div>

                  {/* Day items preview pills */}
                  <div className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                    {/* Calendar Events pills */}
                    {day.events?.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`truncate rounded px-1 text-[10px] font-semibold leading-tight ${
                          ev.type === 'HOLIDAY'
                            ? 'bg-purple-100 text-purple-800'
                            : ev.type === 'MEETING'
                            ? 'bg-blue-100 text-blue-800'
                            : ev.type === 'ANNOUNCEMENT'
                            ? 'bg-orange-100 text-[#FF5500]'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                        title={`${ev.title} (${ev.type})`}
                      >
                        {eventIcon(ev.type)} {ev.title}
                      </div>
                    ))}

                    {/* Legacy meetings */}
                    {day.meetings?.slice(0, 1).map((m) => (
                      <div
                        key={m.id}
                        className="truncate rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800"
                        title={m.title}
                      >
                        📹 {m.title}
                      </div>
                    ))}

                    {/* Tasks count indicator */}
                    {taskCount > 0 && (
                      <div className="truncate rounded bg-indigo-50 px-1 text-[9px] font-semibold text-indigo-700">
                        ⚡ {taskCount} task{taskCount > 1 ? 's' : ''}
                      </div>
                    )}

                    {/* Leaves count indicator */}
                    {leaveCount > 0 && (
                      <div className="truncate rounded bg-emerald-50 px-1 text-[9px] font-semibold text-emerald-700">
                        🌴 {leaveCount} leave{leaveCount > 1 ? 's' : ''}
                      </div>
                    )}

                    {/* Overflow indicator */}
                    {eventCount > 2 && (
                      <span className="block text-[9px] text-slate-400 font-medium pl-1">
                        +{eventCount - 2} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Calendar Legend */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Meeting
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" /> Holiday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> Announcement
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-500" /> Other Event
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" /> Task Deadline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Approved Leave
            </span>
          </div>
        </div>

        {/* Selected Day Schedule Details Drawer */}
        <div className="card space-y-4 lg:col-span-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-ink-900">
                {selectedDate ? fmtDate(selectedDate) : 'Select a date'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {selectedDayData?.isHoliday
                  ? '🎉 Company Holiday · Non-working day'
                  : selectedDayData?.isWorkingDay
                  ? 'Regular Working Day'
                  : 'Weekend / Scheduled Off'}
              </p>
            </div>

            {canManageEvents && selectedDate && (
              <button
                onClick={() => openCreateModal(selectedDate)}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
              >
                + Add
              </button>
            )}
          </div>

          {!selectedDate ? (
            <Empty text="No date selected. Click on any day in the calendar to view its schedule." />
          ) : (
            <div className="space-y-4">
              {/* Event Type Filter */}
              <div className="flex items-center gap-1">
                {['ALL', 'MEETING', 'HOLIDAY', 'ANNOUNCEMENT', 'OTHER'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setTypeFilter(cat)}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                      typeFilter === cat ? 'bg-[#1E3A8A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'ALL' ? 'All' : cat.slice(0, 4)}
                  </button>
                ))}
              </div>

              {/* 1. Calendar Events List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Scheduled Events</h3>

                {dayEvents.length === 0 && (selectedDayData?.meetings || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No events scheduled for this day.</p>
                ) : (
                  <div className="space-y-2">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-1.5 text-xs transition hover:border-slate-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${eventBadgeStyle(ev.type)}`}>
                            {eventIcon(ev.type)} {ev.type}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {ev.startTime ? `${ev.startTime}${ev.endTime ? ` - ${ev.endTime}` : ''}` : 'Full Day'}
                          </span>
                        </div>

                        <p className="font-bold text-ink-900 text-sm">{ev.title}</p>
                        {ev.description && <p className="text-slate-600 text-xs">{ev.description}</p>}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                          <span>
                            Audience:{' '}
                            <span className="font-semibold text-slate-700">
                              {ev.audience === 'SPECIFIC_TEAM' ? ev.team?.name || 'Specific Team' : ev.audience === 'ALL_TEAMS' ? 'All Teams' : 'All Employees'}
                            </span>
                          </span>

                          <div className="flex items-center gap-2">
                            {ev.meetUrl && (
                              <a
                                href={ev.meetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-bold text-blue-600 hover:underline"
                              >
                                Join Meeting →
                              </a>
                            )}

                            {canManageEvents && (
                              <>
                                <button
                                  onClick={() => openEditModal(ev)}
                                  className="text-slate-500 hover:text-slate-800 font-semibold"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteEvent(ev.id, ev.title)}
                                  className="text-rose-500 hover:text-rose-700 font-semibold"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Legacy meetings */}
                    {selectedDayData?.meetings?.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                            📹 Video Meeting
                          </span>
                          <span className="text-slate-500">
                            {new Date(m.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="font-bold text-ink-900">{m.title}</p>
                        <a
                          href={m.meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-blue-600 hover:underline block pt-1"
                        >
                          Join Meeting →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Tasks Due Today */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Task Deadlines ({selectedDayData?.tasks?.length || 0})
                </h3>
                {(selectedDayData?.tasks || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No tasks due on this date.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDayData?.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <Link href={`/tasks/${t.id}`} className="font-semibold text-brand-600 hover:underline">
                            {t.title}
                          </Link>
                          <p className="text-[10px] text-slate-500">
                            Assigned to: {t.owner?.displayName || 'Unassigned'}
                          </p>
                        </div>
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {STATUS_LABEL[t.status] || t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Approved Leaves on this date */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Personnel on Leave ({selectedDayData?.leaves?.length || 0})
                </h3>
                {(selectedDayData?.leaves || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No approved leaves on this date.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDayData?.leaves.map((l, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-emerald-50/60 border border-emerald-100 p-2 text-xs"
                      >
                        <span className="font-semibold text-emerald-900">🌴 {l.user}</span>
                        <span className="text-[10px] text-emerald-700">
                          {l.fromDate} → {l.toDate}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Event Modal */}
      {modalOpen && (
        <Modal
          open={modalOpen}
          title={editingEventId ? 'Edit Calendar Event' : 'Create New Calendar Event'}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSaveEvent} className="space-y-4 text-xs">
            {/* Event Type */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Event Type *
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['MEETING', 'HOLIDAY', 'ANNOUNCEMENT', 'OTHER'] as EventType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFType(t)}
                    className={`rounded-lg border p-2 text-center font-bold transition ${
                      fType === t
                        ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A] ring-2 ring-blue-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-base">{eventIcon(t)}</span>
                    <span className="text-[11px] capitalize">{t.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Event Title *
              </label>
              <input
                required
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="e.g. Q1 Global All-Hands, Republic Day Holiday"
                className="input w-full"
                maxLength={200}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={fDescription}
                onChange={(e) => setFDescription(e.target.value)}
                placeholder="Provide additional details or agenda..."
                className="input w-full resize-none"
                maxLength={2000}
              />
            </div>

            {/* Dates */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={fStartDate}
                  onChange={(e) => setFStartDate(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  value={fEndDate}
                  onChange={(e) => setFEndDate(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            {/* Conditional Times & Meeting Link (NOT for holidays) */}
            {fType === 'HOLIDAY' ? (
              <div className="rounded-lg bg-purple-50 p-2.5 text-purple-800 text-[11px]">
                ℹ️ <b>Full-Day Event:</b> Holidays apply to the entire day; start/end times and video meeting links are not required.
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={fStartTime}
                      onChange={(e) => setFStartTime(e.target.value)}
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={fEndTime}
                      onChange={(e) => setFEndTime(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Meeting Link (Optional)
                  </label>
                  <input
                    type="url"
                    value={fMeetUrl}
                    onChange={(e) => setFMeetUrl(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="input w-full"
                  />
                </div>
              </>
            )}

            {/* Audience */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Audience *
              </label>
              <select
                value={fAudience}
                onChange={(e) => setFAudience(e.target.value as AudienceType)}
                className="input w-full"
              >
                {isAdmin && <option value="ALL_EMPLOYEES">All Employees (Company-wide)</option>}
                {isAdmin && <option value="ALL_TEAMS">All Teams</option>}
                <option value="SPECIFIC_TEAM">Specific Team</option>
              </select>
            </div>

            {/* Specific Team Selection */}
            {fAudience === 'SPECIFIC_TEAM' && (
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Target Team *
                </label>
                <select
                  required
                  value={fTeamId}
                  onChange={(e) => setFTeamId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select a team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Submit buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#FF5500] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#e04b00] disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : editingEventId ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
