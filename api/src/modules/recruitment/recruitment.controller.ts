import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RecruitmentService } from './recruitment.service';
import {
  CreateRequirementDto,
  UpdateRequirementDto,
  UpdateCandidateStatusDto,
  ConfirmCandidateUploadDto,
  ValidateCsvDto,
} from './dto/recruitment.dto';

@Controller('recruitment')
export class RecruitmentController {
  constructor(private service: RecruitmentService) {}

  private ip(req: Request) {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;
  }

  // =========================================================================
  //  Dashboard Overviews
  // =========================================================================

  @Roles('HR_MANAGER', 'ADMIN')
  @Get('dashboard/overview')
  getManagerOverview() {
    return this.service.getManagerOverview();
  }

  @Roles('HR_SUPPORT', 'HR_MANAGER', 'ADMIN')
  @Get('dashboard/support-overview')
  getSupportOverview(@CurrentUser() me: RequestUser) {
    return this.service.getSupportOverview(me);
  }

  // =========================================================================
  //  Recruitment Requirements
  // =========================================================================

  @Roles('HR_MANAGER', 'ADMIN')
  @Post('requirements')
  createRequirement(
    @CurrentUser() me: RequestUser,
    @Body() dto: CreateRequirementDto,
    @Req() req: Request,
  ) {
    return this.service.createRequirement(me, dto, this.ip(req));
  }

  @Roles('HR_MANAGER', 'ADMIN')
  @Post('requirements/upload-jd')
  async uploadJd(
    @CurrentUser() me: RequestUser,
    @Req() req: Request,
    @Query('name') queryName?: string,
    @Body() body?: any,
  ) {
    let originalname = queryName || 'document.pdf';
    let buffer: Buffer | undefined;

    if (body && typeof body === 'object' && body.data) {
      originalname = body.name || originalname;
      const b64 = String(body.data).replace(/^data:.*?;base64,/, '');
      buffer = Buffer.from(b64, 'base64');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      buffer = Buffer.concat(chunks);
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('No file content received');
    }

    return this.service.uploadJdFile(me, {
      originalname,
      buffer,
      size: buffer.length,
    });
  }

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('requirements/:id/jd')
  serveJd(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    return this.service.serveJdFile(me, id, download === '1' || download === 'true', res);
  }

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('jd/:fileId')
  serveJdById(
    @CurrentUser() me: RequestUser,
    @Param('fileId') fileId: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    return this.service.serveJdFileById(me, fileId, download === '1' || download === 'true', res);
  }

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('requirements')
  getRequirements(
    @CurrentUser() me: RequestUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.getRequirements(me, { status, search });
  }

  @Roles('HR_MANAGER', 'ADMIN')
  @Get('hr-support-users')
  getHrSupportUsers() {
    return this.service.getHrSupportUsers();
  }

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('requirements/:id')
  getRequirement(@CurrentUser() me: RequestUser, @Param('id') id: string) {
    return this.service.getRequirement(me, id);
  }

  @Roles('HR_MANAGER', 'ADMIN')
  @Patch('requirements/:id')
  updateRequirement(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequirementDto,
    @Req() req: Request,
  ) {
    return this.service.updateRequirement(me, id, dto, this.ip(req));
  }

  // =========================================================================
  //  CSV Template & Validation & Candidate Upload
  // =========================================================================

  @Roles('HR_SUPPORT', 'HR_MANAGER', 'ADMIN')
  @Get('template/candidates.csv')
  downloadCsvTemplate(@Res() res: Response) {
    const csv = this.service.getCsvTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="candidates_template.csv"');
    return res.send(csv);
  }

  @Roles('HR_SUPPORT', 'HR_MANAGER', 'ADMIN')
  @Post('requirements/:id/validate-csv')
  validateCsv(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Body() dto: ValidateCsvDto,
  ) {
    return this.service.validateCandidateCsv(me, id, dto.csvContent);
  }

  @Roles('HR_SUPPORT', 'HR_MANAGER', 'ADMIN')
  @Post('requirements/:id/candidates/upload')
  uploadCandidates(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Body() dto: ConfirmCandidateUploadDto,
    @Req() req: Request,
  ) {
    return this.service.uploadCandidates(me, id, dto.candidates, this.ip(req));
  }

  // =========================================================================
  //  Candidate Management
  // =========================================================================

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('candidates')
  getCandidates(
    @CurrentUser() me: RequestUser,
    @Query('requirementId') requirementId?: string,
    @Query('submittedById') submittedById?: string,
    @Query('status') status?: string,
    @Query('minExp') minExp?: string,
    @Query('maxExp') maxExp?: string,
    @Query('qualification') qualification?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getCandidates(me, {
      requirementId,
      submittedById,
      status,
      minExp,
      maxExp,
      qualification,
      search,
      page,
      limit,
    });
  }

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('candidates/:id')
  getCandidate(@CurrentUser() me: RequestUser, @Param('id') id: string) {
    return this.service.getCandidate(me, id);
  }

  @Roles('HR_MANAGER', 'ADMIN')
  @Patch('candidates/:id/status')
  updateCandidateStatus(
    @CurrentUser() me: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCandidateStatusDto,
    @Req() req: Request,
  ) {
    return this.service.updateCandidateStatus(me, id, dto, this.ip(req));
  }

  // =========================================================================
  //  Login Activity & Exports
  // =========================================================================

  @Roles('HR_MANAGER', 'ADMIN')
  @Get('login-activity')
  getLoginActivity(
    @CurrentUser() me: RequestUser,
    @Query('date') date?: string,
    @Query('employeeId') employeeId?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.service.getLoginActivity(me, { date, employeeId, teamId });
  }

  @Roles('HR_MANAGER', 'ADMIN', 'HR_SUPPORT')
  @Get('export/candidates')
  async exportCandidates(
    @CurrentUser() me: RequestUser,
    @Res() res: Response,
    @Query('requirementId') requirementId?: string,
    @Query('status') status?: string,
    @Query('submittedById') submittedById?: string,
  ) {
    const csv = await this.service.exportCandidatesCsv(me, {
      requirementId,
      status,
      submittedById,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="candidates_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.send(csv);
  }
}
