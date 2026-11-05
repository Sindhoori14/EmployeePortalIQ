import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { CreateGoalDto, UpdateGoalDto, UpdateGoalProgressDto } from './dto/goals.dto';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(me: RequestUser, query?: { teamId?: string; ownerId?: string; type?: string; status?: string }) {
    const where: any = {};

    if (query?.type && query.type !== 'ALL') where.type = query.type;
    if (query?.status && query.status !== 'ALL') where.status = query.status;

    if (me.role === 'EMPLOYEE') {
      where.OR = [
        { ownerId: me.id },
        ...(me.teamId ? [{ teamId: me.teamId, ownerId: null }] : []),
      ];
    } else if (me.role === 'TEAM_LEAD' || me.role === 'COORDINATOR') {
      if (!me.teamId) return [];
      where.OR = [
        { teamId: me.teamId },
        { ownerId: me.id },
        { createdById: me.id },
      ];
      if (query?.ownerId) where.ownerId = query.ownerId;
    } else if (me.role === 'ADMIN') {
      if (query?.teamId) where.teamId = query.teamId;
      if (query?.ownerId) where.ownerId = query.ownerId;
    }

    return this.prisma.goal.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      include: {
        owner: { select: { id: true, displayName: true, email: true, role: true } },
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async get(me: RequestUser, id: string) {
    const g = await this.prisma.goal.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, displayName: true, email: true, role: true } },
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
    if (!g) throw new NotFoundException('Goal not found');

    if (me.role === 'EMPLOYEE' && g.ownerId !== me.id && g.teamId !== me.teamId) {
      throw new ForbiddenException('Forbidden');
    }
    if ((me.role === 'TEAM_LEAD' || me.role === 'COORDINATOR') && me.teamId && g.teamId !== me.teamId && g.ownerId !== me.id) {
      throw new ForbiddenException('Outside your team');
    }

    return g;
  }

  async create(me: RequestUser, dto: CreateGoalDto, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD'].includes(me.role)) {
      throw new ForbiddenException('Only Administrators and Team Leads can create goals');
    }

    const scope = dto.targetScope || (dto.ownerId ? 'INDIVIDUAL' : dto.teamId ? 'TEAM' : 'INDIVIDUAL');

    // Validation for organization-wide assignment
    if (scope === 'ALL_TEAMS' || scope === 'ALL_EMPLOYEES') {
      if (me.role !== 'ADMIN') {
        throw new ForbiddenException('Only administrators can assign organization-wide goals');
      }
    }

    // Validation for Team Lead assignment scope
    if (me.role === 'TEAM_LEAD') {
      if (!me.teamId) {
        throw new ForbiddenException('You must be assigned to a team to create goals');
      }
      if (scope === 'TEAM' && dto.teamId && dto.teamId !== me.teamId) {
        throw new ForbiddenException('You can only create goals for your own team');
      }
      if (scope === 'INDIVIDUAL') {
        if (!dto.ownerId) {
          throw new BadRequestException('Target employee must be selected');
        }
        const targetUser = await this.prisma.user.findUnique({
          where: { id: dto.ownerId },
          select: { id: true, teamId: true, isActive: true },
        });
        if (!targetUser || !targetUser.isActive) {
          throw new BadRequestException('Target employee not found or inactive');
        }
        if (targetUser.teamId !== me.teamId) {
          throw new ForbiddenException('You can only assign goals to members of your own team');
        }
      }
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    const type = dto.type ?? 'WEEKLY';

    // 1. INDIVIDUAL ASSIGNMENT
    if (scope === 'INDIVIDUAL') {
      if (!dto.ownerId) {
        throw new BadRequestException('An employee must be selected when Assign To is Individual Employee');
      }
      const targetUser = await this.prisma.user.findUnique({
        where: { id: dto.ownerId },
        select: { id: true, teamId: true },
      });
      if (!targetUser) throw new NotFoundException('Employee not found');

      const g = await this.prisma.goal.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() ?? null,
          type: type as any,
          status: 'ACTIVE',
          teamId: targetUser.teamId ?? dto.teamId ?? null,
          batchId: dto.batchId ?? null,
          ownerId: targetUser.id,
          progress: 0,
          startDate,
          endDate,
          createdById: me.id,
        },
        include: {
          owner: { select: { id: true, displayName: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      });
      await this.audit.log({ actorId: me.id, action: 'GOAL_CREATE', entity: 'goal', entityId: g.id, ip });
      return g;
    }

    // 2. SPECIFIC TEAM ASSIGNMENT (generates independent goal instances per team member)
    if (scope === 'TEAM') {
      const targetTeamId = me.role === 'ADMIN' ? dto.teamId : me.teamId;
      if (!targetTeamId) {
        throw new BadRequestException('A team must be selected for team assignment');
      }

      const members = await this.prisma.user.findMany({
        where: { teamId: targetTeamId, isActive: true },
        select: { id: true, displayName: true },
      });

      if (!members.length) {
        throw new BadRequestException('No active employees found in the selected team');
      }

      const createdGoals = await this.prisma.$transaction(
        members.map((member) =>
          this.prisma.goal.create({
            data: {
              title: dto.title.trim(),
              description: dto.description?.trim() ?? null,
              type: type as any,
              status: 'ACTIVE',
              teamId: targetTeamId,
              batchId: dto.batchId ?? null,
              ownerId: member.id,
              progress: 0,
              startDate,
              endDate,
              createdById: me.id,
            },
            include: {
              owner: { select: { id: true, displayName: true, email: true } },
              team: { select: { id: true, name: true } },
            },
          })
        )
      );

      await this.audit.log({
        actorId: me.id,
        action: 'GOAL_CREATE_TEAM',
        entity: 'goal',
        entityId: targetTeamId,
        metadata: { count: createdGoals.length },
        ip,
      });

      return { count: createdGoals.length, goals: createdGoals, primary: createdGoals[0] };
    }

    // 3. ALL TEAMS ASSIGNMENT (generates independent goal instances for members of all teams)
    if (scope === 'ALL_TEAMS') {
      const members = await this.prisma.user.findMany({
        where: { teamId: { not: null }, isActive: true, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'COORDINATOR'] } },
        select: { id: true, teamId: true },
      });

      if (!members.length) {
        throw new BadRequestException('No active team members found in organization');
      }

      const createdGoals = await this.prisma.$transaction(
        members.map((member) =>
          this.prisma.goal.create({
            data: {
              title: dto.title.trim(),
              description: dto.description?.trim() ?? null,
              type: type as any,
              status: 'ACTIVE',
              teamId: member.teamId,
              ownerId: member.id,
              progress: 0,
              startDate,
              endDate,
              createdById: me.id,
            },
            include: {
              owner: { select: { id: true, displayName: true } },
              team: { select: { id: true, name: true } },
            },
          })
        )
      );

      await this.audit.log({
        actorId: me.id,
        action: 'GOAL_CREATE_ALL_TEAMS',
        entity: 'goal',
        metadata: { count: createdGoals.length },
        ip,
      });

      return { count: createdGoals.length, goals: createdGoals, primary: createdGoals[0] };
    }

    // 4. ALL EMPLOYEES ASSIGNMENT (Organization-wide independent goal instances)
    if (scope === 'ALL_EMPLOYEES') {
      const employees = await this.prisma.user.findMany({
        where: { isActive: true, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'COORDINATOR'] } },
        select: { id: true, teamId: true },
      });

      if (!employees.length) {
        throw new BadRequestException('No active employees found in organization');
      }

      const createdGoals = await this.prisma.$transaction(
        employees.map((member) =>
          this.prisma.goal.create({
            data: {
              title: dto.title.trim(),
              description: dto.description?.trim() ?? null,
              type: type as any,
              status: 'ACTIVE',
              teamId: member.teamId ?? null,
              ownerId: member.id,
              progress: 0,
              startDate,
              endDate,
              createdById: me.id,
            },
            include: {
              owner: { select: { id: true, displayName: true } },
              team: { select: { id: true, name: true } },
            },
          })
        )
      );

      await this.audit.log({
        actorId: me.id,
        action: 'GOAL_CREATE_ALL_EMPLOYEES',
        entity: 'goal',
        metadata: { count: createdGoals.length },
        ip,
      });

      return { count: createdGoals.length, goals: createdGoals, primary: createdGoals[0] };
    }

    throw new BadRequestException('Invalid goal assignment target');
  }

  async updateProgress(me: RequestUser, id: string, dto: UpdateGoalProgressDto, ip?: string) {
    const g = await this.prisma.goal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Goal not found');

    const isOwner = g.ownerId === me.id;
    const isTeamLead = me.role === 'TEAM_LEAD' && Boolean(me.teamId && g.teamId === me.teamId);
    const isAdmin = me.role === 'ADMIN';

    if (!isOwner && !isTeamLead && !isAdmin) {
      throw new ForbiddenException('You are not authorized to update progress on this goal');
    }

    const newProgress = Math.max(0, Math.min(100, Math.round(dto.progress)));
    const newStatus = newProgress === 100 ? 'DONE' : g.status === 'DONE' ? 'ACTIVE' : g.status;

    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        progress: newProgress,
        status: newStatus as any,
      },
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      actorId: me.id,
      action: 'GOAL_PROGRESS',
      entity: 'goal',
      entityId: id,
      metadata: { progress: newProgress, note: dto.note },
      ip,
    });

    return updated;
  }

  async update(me: RequestUser, id: string, dto: UpdateGoalDto, ip?: string) {
    const g = await this.prisma.goal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Goal not found');

    const isAdmin = me.role === 'ADMIN';
    const isTeamLead = me.role === 'TEAM_LEAD' && Boolean(me.teamId && g.teamId === me.teamId);

    if (!isAdmin && !isTeamLead) {
      throw new ForbiddenException('Outside your team');
    }

    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() ?? null } : {}),
        ...(dto.type ? { type: dto.type as any } : {}),
        ...(dto.status ? { status: dto.status as any } : {}),
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
      },
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({ actorId: me.id, action: 'GOAL_UPDATE', entity: 'goal', entityId: id, metadata: dto as any, ip });
    return updated;
  }

  async delete(me: RequestUser, id: string, ip?: string) {
    const g = await this.prisma.goal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Goal not found');

    const isAdmin = me.role === 'ADMIN';
    const isTeamLead = me.role === 'TEAM_LEAD' && Boolean(me.teamId && g.teamId === me.teamId);

    if (!isAdmin && !isTeamLead) {
      throw new ForbiddenException('Forbidden');
    }

    await this.prisma.goal.delete({ where: { id } });
    await this.audit.log({ actorId: me.id, action: 'GOAL_DELETE', entity: 'goal', entityId: id, ip });
    return { ok: true };
  }
}
