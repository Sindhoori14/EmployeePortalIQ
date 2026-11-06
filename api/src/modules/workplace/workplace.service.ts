import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../comms/notifications.service';
import { WorkCalendarService } from '../../common/work-calendar.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { dayStr, dayToDate, addDays } from '../../common/time';
import { CreateMeetingDto, RequestLeaveDto, CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/workplace.dto';

const LEAD_ROLES = ['ADMIN', 'TEAM_LEAD'];

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

@Injectable()
export class WorkplaceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private calendar: WorkCalendarService,
  ) {}

  // ---------------- meetings ----------------
  async createMeeting(me: RequestUser, dto: CreateMeetingDto, ip?: string) {
    if (!LEAD_ROLES.includes(me.role)) throw new ForbiddenException('Only leads and admins schedule meetings');
    const teamId = dto.teamId ?? null;
    if (teamId) {
      const t = await this.prisma.team.findUnique({ where: { id: teamId } });
      if (!t) throw new BadRequestException('Invalid teamId');
      if (me.role === 'TEAM_LEAD' && me.teamId !== teamId) throw new ForbiddenException('Outside your team');
    } else if (me.role !== 'ADMIN') {
      throw new ForbiddenException('Company meetings are admin-only');
    }
    if (!isHttpUrl(dto.meetUrl)) throw new BadRequestException('meetUrl must be an http(s) link');
    const startsAt = new Date(dto.startsAt);
    if (isNaN(startsAt.getTime())) throw new BadRequestException('Invalid startsAt');
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && (isNaN(endsAt.getTime()) || endsAt <= startsAt)) throw new BadRequestException('endsAt must be after startsAt');
    const m = await this.prisma.meeting.create({
      data: {
        teamId, title: dto.title.trim(), meetUrl: dto.meetUrl.trim(), startsAt, endsAt,
        recurrence: dto.recurrence ?? 'NONE', createdById: me.id,
      },
    });
    const ids = await this.scopeUserIds(teamId, me.id);
    await this.notifications.notify(ids, {
      type: 'ANNOUNCEMENT', title: `Meeting: ${m.title}`, body: `Join at ${startsAt.toLocaleString()}`, link: '/dashboard',
    });
    await this.audit.log({ actorId: me.id, action: 'MEETING_CREATE', entity: 'meeting', entityId: m.id, ip });
    return m;
  }

  listMeetings(me: RequestUser, scope: 'upcoming' | 'past' | 'all' = 'upcoming') {    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const scopeWhere =
      scope === 'upcoming'
        ? { OR: [{ endsAt: null, startsAt: { gte: hourAgo } }, { endsAt: { gte: now } }] }
        : scope === 'past'
          ? { OR: [{ endsAt: null, startsAt: { lt: hourAgo } }, { endsAt: { lt: now } }] }
          : {};
    const teamScope = [{ teamId: null }, ...(me.teamId ? [{ teamId: me.teamId }] : []), ...(me.role === 'ADMIN' || me.role === 'TEAM_LEAD' ? [{}] : [])];
    return this.prisma.meeting.findMany({
      where: {
        recurrence: 'NONE', // templates never listed; their daily instances are
        AND: [{ OR: teamScope }, scopeWhere],
      },
      orderBy: scope === 'past' ? { startsAt: 'desc' } : { startsAt: 'asc' },
      take: 50,
      include: { team: { select: { id: true, name: true } } },
    });
  }

  async deleteMeeting(me: RequestUser, id: string, ip?: string) {    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');
    if (me.role !== 'ADMIN' && (m.createdById !== me.id || (m.teamId && me.teamId !== m.teamId)))
      throw new ForbiddenException('Forbidden');
    await this.prisma.meeting.delete({ where: { id } });
    await this.audit.log({ actorId: me.id, action: 'MEETING_DELETE', entity: 'meeting', entityId: id, ip });
    return { ok: true };
  }

  // ---------------- leaves ----------------
  async requestLeave(me: RequestUser, dto: RequestLeaveDto, ip?: string) {
    const from = dto.fromDate.slice(0, 10);
    const to = dto.toDate.slice(0, 10);
    if (from > to) throw new BadRequestException('fromDate must be on or before toDate');
    const today = dayStr();
    if (from < addDays(today, -2)) throw new BadRequestException('Cannot request leave older than 2 days back');
    if (to > addDays(today, 180)) throw new BadRequestException('Cannot request leave more than 180 days ahead');
    // count working days in range (cap walk at 200 days for safety)
    let days = 0;
    for (let d = from, n = 0; d <= to && n < 200; d = addDays(d, 1), n++) days++;
    if (days > 60) throw new BadRequestException('One request covers at most 60 days');
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: { userId: me.id, status: { in: ['PENDING', 'TL_APPROVED', 'APPROVED'] }, fromDate: { lte: dayToDate(to) }, toDate: { gte: dayToDate(from) } },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('You already have a pending or approved leave covering these dates');

    // If applicant is a Team Lead or has no assigned team, route directly to Admin final review
    const isLeadOrNoTeam = me.role === 'TEAM_LEAD' || !me.teamId;
    const initialStatus = isLeadOrNoTeam ? 'TL_APPROVED' : 'PENDING';
    const tlNote = isLeadOrNoTeam ? 'Direct to Admin review (No assigned TL / Team Lead applicant)' : null;

    const r = await this.prisma.leaveRequest.create({
      data: {
        userId: me.id,
        teamId: me.teamId ?? null,
        fromDate: dayToDate(from),
        toDate: dayToDate(to),
        reason: dto.reason.trim(),
        status: initialStatus as any,
        tlNote,
      },
    });

    const staff = me.teamId
      ? await this.prisma.user.findMany({ where: { teamId: me.teamId, isActive: true, role: { in: ['TEAM_LEAD', 'COORDINATOR'] } }, select: { id: true } })
      : [];
    await this.notifications.notify(staff.map((s) => s.id), {
      type: 'REPORT_MISSING', title: `Leave request: ${me.id}`, body: `${from} → ${to}: ${dto.reason.trim().slice(0, 200)}`, link: '/leaves',
    });
    await this.audit.log({ actorId: me.id, action: 'LEAVE_REQUEST', entity: 'leave', entityId: r.id, ip });
    return r;
  }

  mine(me: RequestUser) {
    return this.prisma.leaveRequest.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        tlDecidedBy: { select: { id: true, displayName: true } },
        decidedBy: { select: { id: true, displayName: true } },
        team: { select: { id: true, name: true } },
      },
    });
  }

  async pending(me: RequestUser) {
    if (!['ADMIN', 'TEAM_LEAD', 'COORDINATOR', 'HR_MANAGER'].includes(me.role)) throw new ForbiddenException('Forbidden');
    const where: any = {};

    if (me.role === 'TEAM_LEAD') {
      if (!me.teamId) return [];
      where.teamId = me.teamId;
      where.status = 'PENDING';
      where.userId = { not: me.id }; // Cannot review own leave
    } else if (me.role === 'COORDINATOR') {
      if (!me.teamId) return [];
      where.teamId = me.teamId;
      where.status = { in: ['PENDING', 'TL_APPROVED'] };
    } else if (me.role === 'ADMIN' || me.role === 'HR_MANAGER') {
      where.status = { in: ['TL_APPROVED', 'PENDING'] };
    }

    return this.prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        user: { select: { id: true, displayName: true, email: true, role: true } },
        team: { select: { id: true, name: true } },
        tlDecidedBy: { select: { id: true, displayName: true } },
        decidedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async decide(me: RequestUser, id: string, approve: boolean, note: string | undefined, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD'].includes(me.role)) throw new ForbiddenException('Only leads and admins decide leaves');
    const r = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Leave not found');

    if (r.status !== 'PENDING' && r.status !== 'TL_APPROVED') {
      throw new BadRequestException(`Leave request is already ${r.status.toLowerCase()}`);
    }

    // LEVEL 1: TEAM LEAD REVIEW
    if (me.role === 'TEAM_LEAD') {
      if (!me.teamId || r.teamId !== me.teamId) throw new ForbiddenException('Outside your team');
      if (r.userId === me.id) throw new ForbiddenException('You cannot review your own leave request');
      if (r.status !== 'PENDING') throw new BadRequestException('This request is no longer awaiting Team Lead review');

      if (approve) {
        const updated = await this.prisma.leaveRequest.update({
          where: { id },
          data: {
            status: 'TL_APPROVED' as any,
            tlDecidedById: me.id,
            tlDecidedAt: new Date(),
            tlNote: note?.trim() || 'Approved by Team Lead; queued for Admin final approval',
          },
        });
        await this.audit.log({ actorId: me.id, action: 'LEAVE_TL_APPROVE', entity: 'leave', entityId: id, ip });
        return updated;
      } else {
        const updated = await this.prisma.leaveRequest.update({
          where: { id },
          data: {
            status: 'REJECTED' as any,
            tlDecidedById: me.id,
            tlDecidedAt: new Date(),
            tlNote: note?.trim() || 'Rejected by Team Lead',
            decidedById: me.id,
            decidedAt: new Date(),
          },
        });
        await this.notifications.notify([r.userId], {
          type: 'REPORT_MISSING',
          title: 'Leave request rejected by Team Lead',
          body: `${this.fmt(r.fromDate)} → ${this.fmt(r.toDate)}${note ? `: ${note}` : ''}`,
          link: '/leaves',
        });
        await this.audit.log({ actorId: me.id, action: 'LEAVE_TL_REJECT', entity: 'leave', entityId: id, ip });
        return updated;
      }
    }

    // LEVEL 2: ADMIN FINAL REVIEW
    if (me.role === 'ADMIN') {
      const finalStatus = approve ? 'APPROVED' : 'REJECTED';
      const updated = await this.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: finalStatus as any,
          adminNote: note?.trim() || null,
          decidedById: me.id,
          decidedAt: new Date(),
        },
      });

      if (approve) {
        await this.markOnLeave(r.userId, r.fromDate, r.toDate);
      }

      await this.notifications.notify([r.userId], {
        type: 'REPORT_MISSING',
        title: approve ? 'Leave approved (Admin Final Approval)' : 'Leave rejected by Administrator',
        body: `${this.fmt(r.fromDate)} → ${this.fmt(r.toDate)}${note ? `: ${note}` : ''}`,
        link: '/leaves',
      });

      await this.audit.log({
        actorId: me.id,
        action: approve ? 'LEAVE_ADMIN_APPROVE' : 'LEAVE_ADMIN_REJECT',
        entity: 'leave',
        entityId: id,
        ip,
      });

      return updated;
    }

    throw new ForbiddenException('Forbidden');
  }

  async cancel(me: RequestUser, id: string, ip?: string) {
    const r = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!r || r.userId !== me.id) throw new NotFoundException('Leave not found');
    if (r.status !== 'PENDING') throw new BadRequestException('Only pending requests can be cancelled');
    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' as any } });
    await this.audit.log({ actorId: me.id, action: 'LEAVE_CANCEL', entity: 'leave', entityId: id, ip });
    return updated;
  }

  async revoke(me: RequestUser, id: string, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD'].includes(me.role)) throw new ForbiddenException('Only leads/admins');
    const r = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Leave not found');
    if (r.status !== 'APPROVED') throw new BadRequestException('Only approved future leaves can be revoked');
    if (this.fmt(r.fromDate) < dayStr()) throw new BadRequestException('Cannot revoke a leave that already started');
    if (me.role === 'TEAM_LEAD' && (!me.teamId || r.teamId !== me.teamId)) throw new ForbiddenException('Outside your team');
    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' as any, decidedById: me.id, decidedAt: new Date() } });
    // revert auto-marked days that are still untouched (no check-in recorded)
    await this.prisma.attendanceDay.deleteMany({ where: { userId: r.userId, status: 'ON_LEAVE', checkInAt: null, day: { gte: r.fromDate, lte: r.toDate } } });
    await this.audit.log({ actorId: me.id, action: 'LEAVE_REVOKE', entity: 'leave', entityId: id, ip });
    return updated;
  }

  onLeaveToday(me: RequestUser) {
    const where: any = {};
    if (me.role !== 'ADMIN' && me.role !== 'HR_MANAGER') {
      if (!me.teamId) return Promise.resolve([]);
      where.teamId = me.teamId;
    }
    return this.prisma.leaveRequest.findMany({
      where: { ...where, status: 'APPROVED', fromDate: { lte: new Date(dayStr()) }, toDate: { gte: new Date(dayStr()) } },
      include: { user: { select: { id: true, displayName: true } } },
      take: 200,
    });
  }

  // ---------------- shared meeting notes ----------------
  async saveNote(me: RequestUser, id: string, note: string, ip?: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');
    if (!this.canSeeMeeting(me, m.teamId)) throw new ForbiddenException('Forbidden');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { note: note.trim(), noteUpdatedAt: new Date(), noteUpdatedById: me.id },
      include: { noteUpdatedBy: { select: { id: true, displayName: true } } },
    });
    await this.audit.log({ actorId: me.id, action: 'MEETING_NOTE', entity: 'meeting', entityId: id, ip });
    return updated;
  }

  // ---------------- team calendar: meetings + leaves + holidays ----------------
  async monthView(me: RequestUser, month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('month must be YYYY-MM');
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const taskWhere: any = { dueDate: { gte: monthStart, lt: nextMonth } };
    if (me.role === 'EMPLOYEE') {
      const collab = await this.prisma.taskCollaborator.findMany({ where: { userId: me.id }, select: { taskId: true } });
      taskWhere.OR = [{ ownerId: me.id }, { id: { in: collab.map((c) => c.taskId) } }];
    } else if (me.role === 'COORDINATOR') {
      taskWhere.teamId = me.teamId ?? '__none__';
    }
    const eventWhere: any = {
      startDate: { lt: nextMonth },
      endDate: { gte: monthStart },
    };
    if (me.role !== 'ADMIN' && me.role !== 'HR_MANAGER') {
      eventWhere.OR = [
        { audience: { in: ['ALL_EMPLOYEES', 'ALL_TEAMS'] } },
        ...(me.teamId ? [{ audience: 'SPECIFIC_TEAM', teamId: me.teamId }] : []),
      ];
    }
    const [events, meetings, tasks, leaves, holidays] = await Promise.all([
      (this.prisma as any).calendarEvent.findMany({
        where: eventWhere,
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        include: {
          team: { select: { id: true, name: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.meeting.findMany({
        where: {
          recurrence: 'NONE',
          startsAt: { gte: monthStart, lt: nextMonth },
          OR: [{ teamId: null }, ...(me.teamId ? [{ teamId: me.teamId }] : []), ...(me.role === 'ADMIN' || me.role === 'TEAM_LEAD' ? [{}] : [])],
        },
        orderBy: { startsAt: 'asc' },
        include: { team: { select: { id: true, name: true } } },
        take: 500,
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true,
          owner: { select: { id: true, displayName: true } },
        },
        take: 1000,
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          fromDate: { lt: nextMonth },
          toDate: { gte: monthStart },
          ...(me.role === 'ADMIN' ? {} : me.role === 'EMPLOYEE' ? { userId: me.id } : me.teamId ? { teamId: me.teamId } : { userId: me.id }),
        },
        include: { user: { select: { id: true, displayName: true } } },
        take: 500,
      }),
      this.calendar.holidaySet(),
    ]);
    const days: Record<string, { events: unknown[]; meetings: unknown[]; tasks: unknown[]; leaves: unknown[]; isHoliday: boolean; isWorkingDay: boolean }> = {};
    const dayList: string[] = [];
    for (let d = new Date(monthStart); d < nextMonth; d = new Date(d.getTime() + 86_400_000)) {
      dayList.push(d.toISOString().slice(0, 10));
    }
    for (const d of dayList) {
      const dayEvents = (events as any[]).filter((e) => this.fmt(e.startDate) <= d && d <= this.fmt(e.endDate));
      const hasHolidayEvent = dayEvents.some((e) => e.type === 'HOLIDAY');
      const isHol = holidays.has(d) || hasHolidayEvent;
      days[d] = {
        events: dayEvents.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          description: e.description,
          startDate: this.fmt(e.startDate),
          endDate: this.fmt(e.endDate),
          startTime: e.startTime,
          endTime: e.endTime,
          meetUrl: e.meetUrl,
          audience: e.audience,
          team: e.team,
          createdBy: e.createdBy,
        })),
        meetings: meetings.filter((m) => m.startsAt.toISOString().slice(0, 10) === d).map((m) => ({ id: m.id, title: m.title, startsAt: m.startsAt, meetUrl: m.meetUrl, team: m.team })),
        tasks: tasks.filter((t) => t.dueDate && this.fmt(t.dueDate) === d),
        leaves: leaves
          .filter((l) => this.fmt(l.fromDate) <= d && d <= this.fmt(l.toDate))
          .map((l) => ({ user: l.user.displayName, fromDate: this.fmt(l.fromDate), toDate: this.fmt(l.toDate) })),
        isHoliday: isHol,
        isWorkingDay: isHol ? false : await this.calendar.isWorkingDay(d),
      };
    }
    return { month, days };
  }

  // ---------------- Calendar Events (CR4) ----------------
  async createCalendarEvent(me: RequestUser, dto: CreateCalendarEventDto, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD'].includes(me.role)) {
      throw new ForbiddenException('Only administrators and team leads can create calendar events');
    }

    const type = dto.type || 'MEETING';
    const audience = dto.audience || 'ALL_EMPLOYEES';
    let teamId = dto.teamId ?? null;

    if (me.role === 'TEAM_LEAD') {
      if (!me.teamId) throw new ForbiddenException('You are not assigned to any team');
      teamId = me.teamId;
      if (audience !== 'SPECIFIC_TEAM') {
        throw new ForbiddenException('Team leads can only create events for their specific team');
      }
    } else if (me.role === 'ADMIN') {
      if (audience === 'SPECIFIC_TEAM' && !teamId) {
        throw new BadRequestException('A specific team must be selected when audience is Specific Team');
      }
      if (audience !== 'SPECIFIC_TEAM') {
        teamId = null;
      }
    }

    if (dto.meetUrl && !isHttpUrl(dto.meetUrl)) {
      throw new BadRequestException('meetUrl must be a valid http(s) link');
    }

    const start = dayToDate(dto.startDate);
    const end = dayToDate(dto.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end date');
    }
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }

    const event = await (this.prisma as any).calendarEvent.create({
      data: {
        type: type as any,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startDate: start,
        endDate: end,
        startTime: dto.startTime?.trim() || null,
        endTime: dto.endTime?.trim() || null,
        meetUrl: dto.meetUrl?.trim() || null,
        audience: audience as any,
        teamId,
        createdById: me.id,
      },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    await this.audit.log({
      actorId: me.id,
      action: 'CALENDAR_EVENT_CREATE',
      entity: 'calendar_event',
      entityId: event.id,
      ip,
    });

    return event;
  }

  async updateCalendarEvent(me: RequestUser, id: string, dto: UpdateCalendarEventDto, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD'].includes(me.role)) {
      throw new ForbiddenException('Forbidden');
    }

    const existing = await (this.prisma as any).calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');

    if (me.role === 'TEAM_LEAD') {
      if (!me.teamId || existing.teamId !== me.teamId) {
        throw new ForbiddenException('Outside your team');
      }
    }

    const data: any = {};
    if (dto.type) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.startDate) data.startDate = dayToDate(dto.startDate);
    if (dto.endDate) data.endDate = dayToDate(dto.endDate);
    if (dto.startTime !== undefined) data.startTime = dto.startTime?.trim() || null;
    if (dto.endTime !== undefined) data.endTime = dto.endTime?.trim() || null;
    if (dto.meetUrl !== undefined) {
      if (dto.meetUrl && !isHttpUrl(dto.meetUrl)) throw new BadRequestException('meetUrl must be a valid http(s) link');
      data.meetUrl = dto.meetUrl?.trim() || null;
    }
    if (dto.audience) {
      data.audience = dto.audience;
      if (dto.audience === 'SPECIFIC_TEAM') {
        data.teamId = dto.teamId ?? existing.teamId;
      } else {
        data.teamId = null;
      }
    } else if (dto.teamId !== undefined) {
      data.teamId = dto.teamId;
    }

    const updated = await (this.prisma as any).calendarEvent.update({
      where: { id },
      data,
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    await this.audit.log({
      actorId: me.id,
      action: 'CALENDAR_EVENT_UPDATE',
      entity: 'calendar_event',
      entityId: id,
      ip,
    });

    return updated;
  }

  async deleteCalendarEvent(me: RequestUser, id: string, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD'].includes(me.role)) {
      throw new ForbiddenException('Forbidden');
    }

    const existing = await (this.prisma as any).calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');

    if (me.role === 'TEAM_LEAD') {
      if (!me.teamId || existing.teamId !== me.teamId) {
        throw new ForbiddenException('Outside your team');
      }
    }

    await (this.prisma as any).calendarEvent.delete({ where: { id } });
    await this.audit.log({
      actorId: me.id,
      action: 'CALENDAR_EVENT_DELETE',
      entity: 'calendar_event',
      entityId: id,
      ip,
    });

    return { success: true };
  }

  async listCalendarEvents(me: RequestUser, query?: { month?: string; type?: string; teamId?: string }) {
    const where: any = {};
    if (query?.type) where.type = query.type;

    if (query?.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)) {
      const start = new Date(`${query.month}-01T00:00:00Z`);
      const next = new Date(start);
      next.setUTCMonth(next.getUTCMonth() + 1);
      where.startDate = { lt: next };
      where.endDate = { gte: start };
    }

    if (me.role === 'ADMIN') {
      if (query?.teamId) {
        where.OR = [
          { audience: { in: ['ALL_EMPLOYEES', 'ALL_TEAMS'] } },
          { teamId: query.teamId },
        ];
      }
    } else {
      where.OR = [
        { audience: { in: ['ALL_EMPLOYEES', 'ALL_TEAMS'] } },
        ...(me.teamId ? [{ audience: 'SPECIFIC_TEAM', teamId: me.teamId }] : []),
      ];
    }

    return (this.prisma as any).calendarEvent.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  // ---------------- Leave History (CR3) ----------------
  async history(me: RequestUser, query?: { teamId?: string; status?: string; limit?: number }) {
    if (!['ADMIN', 'TEAM_LEAD', 'COORDINATOR', 'HR_MANAGER'].includes(me.role)) throw new ForbiddenException('Forbidden');
    const where: any = {};
    if (me.role === 'TEAM_LEAD' || me.role === 'COORDINATOR') {
      if (!me.teamId) return [];
      where.teamId = me.teamId;
    } else if (me.role === 'ADMIN' || me.role === 'HR_MANAGER') {
      if (query?.teamId) where.teamId = query.teamId;
    }
    if (query?.status) {
      where.status = query.status;
    }
    return this.prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query?.limit ? Number(query.limit) : 100,
      include: {
        user: { select: { id: true, displayName: true, email: true, role: true } },
        team: { select: { id: true, name: true } },
        tlDecidedBy: { select: { id: true, displayName: true } },
        decidedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  private canSeeMeeting(me: RequestUser, teamId: string | null): boolean {
    if (teamId === null) return true;
    if (me.role === 'ADMIN' || me.role === 'TEAM_LEAD') return true;
    return me.teamId === teamId;
  }

  private fmt(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private async markOnLeave(userId: string, from: Date, to: Date) {
    let d = this.fmt(from);
    const end = this.fmt(to);
    for (let n = 0; d <= end && n < 200; d = addDays(d, 1), n++) {
      if (!(await this.calendar.isWorkingDay(d))) continue;
      await this.prisma.attendanceDay.upsert({
        where: { userId_day: { userId, day: dayToDate(d) } },
        update: {},
        create: { userId, day: dayToDate(d), status: 'ON_LEAVE' as any },
      });
    }
  }

  private async scopeUserIds(teamId: string | null, except: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, ...(teamId ? { teamId } : {}) }, select: { id: true }, take: 500,
    });
    return rows.map((r) => r.id).filter((id) => id !== except);
  }
}
