import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { CreateGoalDto, UpdateGoalDto } from './dto/goals.dto';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(me: RequestUser, teamId?: string) {
    const where: any = {};
    // Loose scope: everyone reads; filter optionally
    if (teamId) where.teamId = teamId;
    else if (me.role === 'COORDINATOR') where.teamId = me.teamId ?? '__none__';
    return this.prisma.goal.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async create(me: RequestUser, dto: CreateGoalDto, ip?: string) {
    if (!['ADMIN', 'TEAM_LEAD', 'COORDINATOR'].includes(me.role)) throw new ForbiddenException('Forbidden');
    const teamId = dto.teamId ?? me.teamId ?? null;
    if ((me.role === 'TEAM_LEAD' || me.role === 'COORDINATOR') && (!me.teamId || teamId !== me.teamId))
      throw new ForbiddenException('Leads and coordinators can create goals for their own team only');
    const g = await this.prisma.goal.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        type: (dto.type ?? 'WEEKLY') as any,
        teamId,
        batchId: dto.batchId ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdById: me.id,
      },
    });
    await this.audit.log({ actorId: me.id, action: 'GOAL_CREATE', entity: 'goal', entityId: g.id, ip });
    return g;
  }

  async update(me: RequestUser, id: string, dto: UpdateGoalDto, ip?: string) {
    const g = await this.prisma.goal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Goal not found');
    if (!['ADMIN', 'TEAM_LEAD', 'COORDINATOR'].includes(me.role)) throw new ForbiddenException('Forbidden');
    if ((me.role === 'TEAM_LEAD' || me.role === 'COORDINATOR') && (!me.teamId || g.teamId !== me.teamId)) throw new ForbiddenException('Outside your team');
    const updated = await this.prisma.goal.update({ where: { id }, data: { ...dto } as any });
    await this.audit.log({ actorId: me.id, action: 'GOAL_UPDATE', entity: 'goal', entityId: id, metadata: dto as any, ip });
    return updated;
  }
}
