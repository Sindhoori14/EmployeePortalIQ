import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { WorkplaceService } from './workplace.service';
import { CreateMeetingDto, DecideLeaveDto, RequestLeaveDto, UpdateMeetingNoteDto, CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/workplace.dto';

@Controller()
export class WorkplaceController {
  constructor(private work: WorkplaceService) {}

  private ip(req: Request) {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;
  }

  // ----- meetings (join straight from the dashboard) -----
  @Roles('ADMIN', 'TEAM_LEAD')
  @Post('meetings')
  createMeeting(@CurrentUser() me: RequestUser, @Body() dto: CreateMeetingDto, @Req() req: Request) {
    return this.work.createMeeting(me, dto, this.ip(req));
  }

  @Get('meetings')
  meetings(@CurrentUser() me: RequestUser, @Query('scope') scope?: 'upcoming' | 'past' | 'all') {
    return this.work.listMeetings(me, scope ?? 'upcoming');
  }

  @Delete('meetings/:id')
  deleteMeeting(@CurrentUser() me: RequestUser, @Param('id') id: string, @Req() req: Request) {
    return this.work.deleteMeeting(me, id, this.ip(req));
  }

  @Patch('meetings/:id/note')
  saveNote(@CurrentUser() me: RequestUser, @Param('id') id: string, @Body() dto: UpdateMeetingNoteDto, @Req() req: Request) {
    return this.work.saveNote(me, id, dto.note, this.ip(req));
  }

  @Get('calendar')
  calendar(@CurrentUser() me: RequestUser, @Query('month') month: string) {
    return this.work.monthView(me, month);
  }

  // ----- calendar events (CR4) -----
  @Roles('ADMIN', 'TEAM_LEAD')
  @Post('calendar/events')
  createEvent(@CurrentUser() me: RequestUser, @Body() dto: CreateCalendarEventDto, @Req() req: Request) {
    return this.work.createCalendarEvent(me, dto, this.ip(req));
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Patch('calendar/events/:id')
  updateEvent(@CurrentUser() me: RequestUser, @Param('id') id: string, @Body() dto: UpdateCalendarEventDto, @Req() req: Request) {
    return this.work.updateCalendarEvent(me, id, dto, this.ip(req));
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Delete('calendar/events/:id')
  deleteEvent(@CurrentUser() me: RequestUser, @Param('id') id: string, @Req() req: Request) {
    return this.work.deleteCalendarEvent(me, id, this.ip(req));
  }

  @Get('calendar/events')
  listEvents(@CurrentUser() me: RequestUser, @Query('month') month?: string, @Query('type') type?: string, @Query('teamId') teamId?: string) {
    return this.work.listCalendarEvents(me, { month, type, teamId });
  }

  // ----- leaves (everyone) -----
  @Post('leaves')
  request(@CurrentUser() me: RequestUser, @Body() dto: RequestLeaveDto, @Req() req: Request) {
    return this.work.requestLeave(me, dto, this.ip(req));
  }

  @Get('leaves/mine')
  mine(@CurrentUser() me: RequestUser) {
    return this.work.mine(me);
  }

  @Roles('ADMIN', 'TEAM_LEAD', 'COORDINATOR', 'HR_MANAGER')
  @Get('leaves/pending')
  pending(@CurrentUser() me: RequestUser) {
    return this.work.pending(me);
  }

  @Roles('ADMIN', 'TEAM_LEAD', 'COORDINATOR', 'HR_MANAGER')
  @Get('leaves/history')
  history(@CurrentUser() me: RequestUser, @Query('teamId') teamId?: string, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.work.history(me, { teamId, status, limit: limit ? Number(limit) : undefined });
  }

  @Roles('ADMIN', 'TEAM_LEAD', 'COORDINATOR', 'HR_MANAGER')
  @Get('leaves/on-leave-today')
  onLeaveToday(@CurrentUser() me: RequestUser) {
    return this.work.onLeaveToday(me);
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Post('leaves/:id/approve')
  approve(@CurrentUser() me: RequestUser, @Param('id') id: string, @Body() dto: DecideLeaveDto, @Req() req: Request) {
    return this.work.decide(me, id, true, dto.note, this.ip(req));
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Post('leaves/:id/reject')
  reject(@CurrentUser() me: RequestUser, @Param('id') id: string, @Body() dto: DecideLeaveDto, @Req() req: Request) {
    return this.work.decide(me, id, false, dto.note, this.ip(req));
  }

  @Post('leaves/:id/cancel')
  cancel(@CurrentUser() me: RequestUser, @Param('id') id: string, @Req() req: Request) {
    return this.work.cancel(me, id, this.ip(req));
  }

  @Roles('ADMIN', 'TEAM_LEAD')
  @Post('leaves/:id/revoke')
  revoke(@CurrentUser() me: RequestUser, @Param('id') id: string, @Req() req: Request) {
    return this.work.revoke(me, id, this.ip(req));
  }
}
