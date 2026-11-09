import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserCacheService } from '../../common/user-cache.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { CreateTeamDto, UpdateTeamDto } from './dto/teams.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private cache: UserCacheService) {}

  private canManageTeam(me: RequestUser | undefined, t: { id: string; leadId?: string | null; createdById?: string | null }): boolean {
    if (!me) return false;
    if (me.role === 'ADMIN') return true;
    if (me.role === 'TEAM_LEAD') {
      return t.leadId === me.id || t.createdById === me.id || (Boolean(me.teamId) && t.id === me.teamId);
    }
    return false;
  }

  /** A team's lead/coordinator must actually belong to that team, otherwise team-scoped permissions would lock them out. */
  private async syncStaff(teamId: string, ids: Array<string | null | undefined>) {
    const staff = ids.filter((x): x is string => Boolean(x));
    if (!staff.length) return;
    await this.prisma.user.updateMany({ where: { id: { in: staff } }, data: { teamId } });
    staff.forEach((id) => this.cache.invalidate(id));
  }

  async list(me?: RequestUser) {
    const where: Prisma.TeamWhereInput = {};
    if (me && me.role !== 'ADMIN') {
      if (me.role === 'TEAM_LEAD') {
        where.OR = [
          { leadId: me.id },
          { createdById: me.id },
          { members: { some: { id: me.id } } },
          ...(me.teamId ? [{ id: me.teamId }] : []),
          { hrId: me.id },
        ];
      } else if (me.role === 'COORDINATOR') {
        where.OR = [
          { coordinatorId: me.id },
          ...(me.teamId ? [{ id: me.teamId }] : []),
          { hrId: me.id },
        ];
      } else if (me.role === 'EMPLOYEE') {
        where.OR = [
          ...(me.teamId ? [{ id: me.teamId }] : []),
          { members: { some: { id: me.id } } },
          { hrId: me.id },
        ];
      }
    }

    const teams = await this.prisma.team.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true } },
        lead: { select: { id: true, displayName: true, email: true } },
        coordinator: { select: { id: true, displayName: true, email: true } },
        hr: { select: { id: true, displayName: true, email: true } },
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    return teams.map((t) => ({
      ...t,
      canEdit: this.canManageTeam(me, t),
    }));
  }

  async get(me: RequestUser, id: string) {
    const staff = me.role !== 'EMPLOYEE';
    const t = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: { select: { id: true, displayName: true, email: staff, role: true, isActive: true } },
        lead: { select: { id: true, displayName: true, email: staff } },
        coordinator: { select: { id: true, displayName: true, email: staff } },
        hr: { select: { id: true, displayName: true, email: staff } },
        createdBy: { select: { id: true, displayName: true, email: staff } },
      },
    });
    if (!t) throw new NotFoundException('Team not found');

    if (me.role !== 'ADMIN') {
      const canSee =
        t.leadId === me.id ||
        t.createdById === me.id ||
        t.coordinatorId === me.id ||
        t.hrId === me.id ||
        (me.teamId && t.id === me.teamId) ||
        t.members.some((m) => m.id === me.id);
      if (!canSee) throw new ForbiddenException('Forbidden: You do not have access to this team');
    }

    const canEdit = this.canManageTeam(me, t);
    return { ...t, canEdit };
  }

  async create(me: RequestUser, dto: CreateTeamDto, ip?: string) {
    if (me.role !== 'ADMIN' && me.role !== 'TEAM_LEAD') {
      throw new ForbiddenException('Only Admins and Team Leads can create teams');
    }

    const name = dto.name.trim();
    const exists = await this.prisma.team.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('Team name already exists');

    if (dto.leadId) await this.assertUser(dto.leadId);
    if (dto.coordinatorId) await this.assertUser(dto.coordinatorId);
    if (dto.hrId) await this.assertUser(dto.hrId);

    // Validate Team Lead member scope
    if (me.role === 'TEAM_LEAD' && dto.memberIds?.length) {
      const tlTeams = await this.prisma.team.findMany({
        where: { OR: [{ leadId: me.id }, { createdById: me.id }, ...(me.teamId ? [{ id: me.teamId }] : [])] },
        select: { id: true },
      });
      const tlTeamIds = new Set(tlTeams.map((x) => x.id).filter(Boolean));
      const candidateUsers = await this.prisma.user.findMany({
        where: { id: { in: dto.memberIds } },
        select: { id: true, teamId: true },
      });
      for (const u of candidateUsers) {
        if (u.teamId && !tlTeamIds.has(u.teamId)) {
          throw new BadRequestException('Team Leads can only assign members from their authorized teams or unassigned employees');
        }
      }
    }

    const leadId = me.role === 'TEAM_LEAD' ? (dto.leadId || me.id) : (dto.leadId ?? null);
    const t = await this.prisma.team.create({
      data: {
        name,
        description: dto.description ?? null,
        leadId,
        coordinatorId: dto.coordinatorId ?? null,
        hrId: dto.hrId ?? null,
        createdById: me.id,
      },
    });

    await this.syncStaff(t.id, [leadId, dto.coordinatorId, dto.hrId]);

    if (dto.memberIds?.length) {
      await this.prisma.user.updateMany({
        where: { id: { in: dto.memberIds } },
        data: { teamId: t.id },
      });
      dto.memberIds.forEach((id) => this.cache.invalidate(id));
    }

    await this.audit.log({ actorId: me.id, action: 'TEAM_CREATE', entity: 'team', entityId: t.id, ip });
    return { ...t, canEdit: true };
  }

  async update(me: RequestUser, id: string, dto: UpdateTeamDto, ip?: string) {
    const existing = await this.prisma.team.findUnique({
      where: { id },
      include: { members: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Team not found');

    const canEdit = this.canManageTeam(me, existing);
    if (!canEdit) {
      throw new ForbiddenException('Only Admins or authorized Team Leads can edit or manage this team');
    }

    if (dto.leadId) await this.assertUser(dto.leadId);
    if (dto.coordinatorId) await this.assertUser(dto.coordinatorId);
    if (dto.hrId) await this.assertUser(dto.hrId);

    if (dto.name) {
      const clash = await this.prisma.team.findFirst({ where: { name: dto.name.trim(), id: { not: id } }, select: { id: true } });
      if (clash) throw new BadRequestException('Another team already uses that name');
    }

    if (me.role === 'TEAM_LEAD' && dto.memberIds?.length) {
      const tlTeams = await this.prisma.team.findMany({
        where: { OR: [{ leadId: me.id }, { createdById: me.id }, ...(me.teamId ? [{ id: me.teamId }] : [])] },
        select: { id: true },
      });
      const tlTeamIds = new Set(tlTeams.map((x) => x.id).filter(Boolean));
      const candidateUsers = await this.prisma.user.findMany({
        where: { id: { in: dto.memberIds } },
        select: { id: true, teamId: true },
      });
      for (const u of candidateUsers) {
        if (u.teamId && u.teamId !== id && !tlTeamIds.has(u.teamId)) {
          throw new BadRequestException('Team Leads can only assign members from their authorized teams or unassigned employees');
        }
      }
    }

    const data: Prisma.TeamUpdateInput = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.leadId !== undefined) data.lead = dto.leadId ? { connect: { id: dto.leadId } } : { disconnect: true };
    if (dto.coordinatorId !== undefined) data.coordinator = dto.coordinatorId ? { connect: { id: dto.coordinatorId } } : { disconnect: true };
    if (dto.hrId !== undefined) data.hr = dto.hrId ? { connect: { id: dto.hrId } } : { disconnect: true };

    const t = await this.prisma.team.update({ where: { id }, data });

    if (dto.memberIds !== undefined) {
      const currentMemberIds = existing.members.map((m) => m.id);
      const targetMemberIds = dto.memberIds;
      const toRemove = currentMemberIds.filter((mid) => !targetMemberIds.includes(mid));
      const toAdd = targetMemberIds.filter((mid) => !currentMemberIds.includes(mid));

      if (toRemove.length) {
        await this.prisma.user.updateMany({
          where: { id: { in: toRemove }, teamId: id },
          data: { teamId: null },
        });
        toRemove.forEach((mid) => this.cache.invalidate(mid));
      }
      if (toAdd.length) {
        await this.prisma.user.updateMany({
          where: { id: { in: toAdd } },
          data: { teamId: id },
        });
        toAdd.forEach((mid) => this.cache.invalidate(mid));
      }
    }

    await this.syncStaff(id, [dto.leadId, dto.coordinatorId, dto.hrId]);
    await this.audit.log({ actorId: me.id, action: 'TEAM_UPDATE', entity: 'team', entityId: id, metadata: dto as any, ip });
    return { ...t, canEdit: true };
  }

  async delete(me: RequestUser, id: string, ip?: string) {
    const existing = await this.prisma.team.findUnique({
      where: { id },
      include: { members: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('Team not found');

    const canDelete = this.canManageTeam(me, existing);
    if (!canDelete) {
      throw new ForbiddenException('Only Admins or authorized Team Leads can delete this team');
    }

    // 1. Unassign all users from this team
    await this.prisma.user.updateMany({
      where: { teamId: id },
      data: { teamId: null },
    });
    existing.members.forEach((m) => this.cache.invalidate(m.id));

    // 2. Clear relations that reference this teamId
    // tasks cascade or remain associated
    await this.prisma.meeting.deleteMany({ where: { teamId: id } });
    await this.prisma.calendarEvent.deleteMany({ where: { teamId: id } });
    await this.prisma.channel.deleteMany({ where: { teamId: id } });

    // 3. Delete the team
    await this.prisma.team.delete({ where: { id } });
    await this.audit.log({ actorId: me.id, action: 'TEAM_DELETE', entity: 'team', entityId: id, metadata: { name: existing.name }, ip });
    return { success: true, message: `Team ${existing.name} deleted successfully` };
  }

  private async assertUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !u.isActive) throw new BadRequestException('Invalid member user');
  }
}
