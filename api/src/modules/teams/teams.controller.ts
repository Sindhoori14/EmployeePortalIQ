import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto } from './dto/teams.dto';

@Controller('teams')
export class TeamsController {
  constructor(private teams: TeamsService) {}

  @Get()
  list(@CurrentUser() me: RequestUser) {
    return this.teams.list(me);
  }

  @Get(':id')
  get(@CurrentUser() me: RequestUser, @Param('id') id: string) {
    return this.teams.get(me, id);
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Post()
  create(@CurrentUser() me: RequestUser, @Body() dto: CreateTeamDto, @Req() req: Request) {
    return this.teams.create(me, dto, req.ip);
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Patch(':id')
  update(@CurrentUser() me: RequestUser, @Param('id') id: string, @Body() dto: UpdateTeamDto, @Req() req: Request) {
    return this.teams.update(me, id, dto, req.ip);
  }
}
