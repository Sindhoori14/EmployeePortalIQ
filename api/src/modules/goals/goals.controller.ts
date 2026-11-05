import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { GoalsService } from './goals.service';
import { CreateGoalDto, UpdateGoalDto, UpdateGoalProgressDto } from './dto/goals.dto';

@Controller('goals')
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get()
  list(
    @CurrentUser() me: RequestUser,
    @Query('teamId') teamId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.goals.list(me, { teamId, ownerId, type, status });
  }

  @Get(':id')
  get(@CurrentUser() me: RequestUser, @Param('id') id: string) {
    return this.goals.get(me, id);
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Post()
  create(@CurrentUser() me: RequestUser, @Body() dto: CreateGoalDto, @Req() req: Request) {
    return this.goals.create(me, dto, req.ip);
  }

  @Patch(':id/progress')
  updateProgress(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateGoalProgressDto,
    @Req() req: Request,
  ) {
    return this.goals.updateProgress(me, id, dto, req.ip);
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Patch(':id')
  update(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
    @Req() req: Request,
  ) {
    return this.goals.update(me, id, dto, req.ip);
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Delete(':id')
  delete(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.goals.delete(me, id, req.ip);
  }
}
