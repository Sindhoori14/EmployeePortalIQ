import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { join, resolve, extname } from 'path';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from '../comms/notifications.service';
import { AuditService } from '../audit/audit.service';
import { WorkCalendarService } from '../../common/work-calendar.service';
import {
  CreateRequirementDto,
  UpdateRequirementDto,
  UpdateCandidateStatusDto,
  CandidateUploadItemDto,
} from './dto/recruitment.dto';
import {
  generateCandidateTemplateCsv,
  normalizeEmail,
  normalizePhone,
  parseCsvText,
  validateCandidateRecords,
} from './recruitment-csv.util';
import { CandidateStatus, RequirementStatus } from '@prisma/client';

const JD_UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), 'recruitment');

function getJdMime(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'application/pdf';
  if (e === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (e === '.doc') return 'application/msword';
  return 'application/octet-stream';
}

@Injectable()
export class RecruitmentService {
  constructor(
    private prisma: PrismaService,
    private notif: NotificationsService,
    private audit: AuditService,
    private calendar: WorkCalendarService,
  ) {}

  // =========================================================================
  //  1. Recruitment Requirements (HR Manager / Admin)
  // =========================================================================

  private async generateReqCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REQ-${year}-`;
    const lastReq = await this.prisma.recruitmentRequirement.findFirst({
      where: { reqCode: { startsWith: prefix } },
      orderBy: { reqCode: 'desc' },
      select: { reqCode: true },
    });

    let nextNum = 1;
    if (lastReq?.reqCode) {
      const parts = lastReq.reqCode.split('-');
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart)) nextNum = numPart + 1;
    }
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }

  async createRequirement(me: RequestUser, dto: CreateRequirementDto, ip?: string) {
    if (me.role !== 'HR_MANAGER' && me.role !== 'ADMIN') {
      throw new ForbiddenException('Only HR Manager or Admin can create recruitment requirements');
    }

    const reqCode = await this.generateReqCode();

    // Verify assigned HR Support users exist
    const hrSupportIds = [...new Set(dto.assignedHrSupportIds || [])];
    if (hrSupportIds.length > 0) {
      const validUsers = await this.prisma.user.findMany({
        where: { id: { in: hrSupportIds }, isActive: true },
        select: { id: true, displayName: true, role: true },
      });
      if (validUsers.length !== hrSupportIds.length) {
        throw new BadRequestException('One or more selected HR Support users are invalid or inactive');
      }
    }

    const creationMethod = dto.creationMethod || (dto.jdFileId ? 'DIRECT_UPLOAD' : 'MANUAL');
    const priority = dto.priority || 'MEDIUM';
    const jdFileId = dto.jdFileId || null;
    const jdFileName = dto.jdFileName || null;
    const jdFileSize = dto.jdFileSize || null;
    const ext = jdFileName ? extname(jdFileName) : '';
    const jdFilePath = jdFileId ? join(JD_UPLOAD_DIR, `${jdFileId}${ext}`) : null;
    const jdMimeType = ext ? getJdMime(ext) : null;

    const requirement = await this.prisma.$transaction(async (tx) => {
      const req = await tx.recruitmentRequirement.create({
        data: {
          reqCode,
          title: dto.title.trim(),
          department: dto.department.trim(),
          vacancies: dto.vacancies,
          location: (dto.location || 'Remote').trim(),
          employmentType: dto.employmentType || 'Full-time',
          priority,
          creationMethod,
          jdFileId,
          jdFileName,
          jdFileSize,
          jdFilePath,
          jdMimeType,
          qualification: (dto.qualification || (creationMethod === 'DIRECT_UPLOAD' ? 'Relevant qualification' : 'Not specified')).trim(),
          specialization: dto.specialization?.trim() || null,
          minExp: dto.minExp ?? 0,
          maxExp: dto.maxExp ?? 0,
          techSkills: (dto.techSkills || (creationMethod === 'DIRECT_UPLOAD' ? 'See attached Job Description' : 'Not specified')).trim(),
          softSkills: dto.softSkills?.trim() || null,
          certifications: dto.certifications?.trim() || null,
          description: (dto.description || (creationMethod === 'DIRECT_UPLOAD' ? 'Complete Job Description is provided in the attached document.' : 'Not specified')).trim(),
          responsibilities: (dto.responsibilities || (creationMethod === 'DIRECT_UPLOAD' ? 'Key responsibilities detailed in attached Job Description document.' : 'Not specified')).trim(),
          requiredSkills: (dto.requiredSkills || (creationMethod === 'DIRECT_UPLOAD' ? 'Required skills detailed in attached Job Description document.' : 'Not specified')).trim(),
          preferredSkills: dto.preferredSkills?.trim() || null,
          additionalInstructions: dto.additionalInstructions?.trim() || null,
          salaryRange: dto.salaryRange?.trim() || null,
          expectedJoiningDate: dto.expectedJoiningDate ? new Date(dto.expectedJoiningDate) : null,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          status: (dto.status as RequirementStatus) || RequirementStatus.OPEN,
          createdById: me.id,
        },
      });

      if (hrSupportIds.length > 0) {
        await tx.requirementAssignment.createMany({
          data: hrSupportIds.map((hrSupportId) => ({
            requirementId: req.id,
            hrSupportId,
            assignedById: me.id,
          })),
        });
      }

      return req;
    });

    // Notify assigned HR Support users
    if (hrSupportIds.length > 0) {
      void this.notif.notify(hrSupportIds, {
        type: 'SYSTEM',
        title: `New Requirement Assigned: ${requirement.reqCode} - ${requirement.title}`,
        body: `You have been assigned to source candidates for "${requirement.title}" (${requirement.department}, ${requirement.vacancies} vacancies).`,
        link: '/hr-support/requirements',
      });
    }

    await this.audit.log({
      actorId: me.id,
      action: 'RECRUITMENT_REQUIREMENT_CREATE',
      entity: 'recruitment_requirement',
      entityId: requirement.id,
      metadata: { reqCode: requirement.reqCode, title: requirement.title, assignedCount: hrSupportIds.length },
      ip,
    });

    return this.getRequirement(me, requirement.id);
  }

  async updateRequirement(me: RequestUser, id: string, dto: UpdateRequirementDto, ip?: string) {
    if (me.role !== 'HR_MANAGER' && me.role !== 'ADMIN') {
      throw new ForbiddenException('Only HR Manager or Admin can edit recruitment requirements');
    }

    const existing = await this.prisma.recruitmentRequirement.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!existing) throw new NotFoundException('Recruitment requirement not found');

    let newlyAssignedIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (dto.title !== undefined) updateData.title = dto.title.trim();
      if (dto.department !== undefined) updateData.department = dto.department.trim();
      if (dto.vacancies !== undefined) updateData.vacancies = dto.vacancies;
      if (dto.location !== undefined) updateData.location = dto.location.trim();
      if (dto.employmentType !== undefined) updateData.employmentType = dto.employmentType;
      if (dto.qualification !== undefined) updateData.qualification = dto.qualification.trim();
      if (dto.specialization !== undefined) updateData.specialization = dto.specialization?.trim() || null;
      if (dto.minExp !== undefined) updateData.minExp = dto.minExp;
      if (dto.maxExp !== undefined) updateData.maxExp = dto.maxExp;
      if (dto.techSkills !== undefined) updateData.techSkills = dto.techSkills.trim();
      if (dto.softSkills !== undefined) updateData.softSkills = dto.softSkills?.trim() || null;
      if (dto.certifications !== undefined) updateData.certifications = dto.certifications?.trim() || null;
      if (dto.description !== undefined) updateData.description = dto.description.trim();
      if (dto.responsibilities !== undefined) updateData.responsibilities = dto.responsibilities.trim();
      if (dto.requiredSkills !== undefined) updateData.requiredSkills = dto.requiredSkills.trim();
      if (dto.preferredSkills !== undefined) updateData.preferredSkills = dto.preferredSkills?.trim() || null;
      if (dto.additionalInstructions !== undefined) updateData.additionalInstructions = dto.additionalInstructions?.trim() || null;
      if (dto.salaryRange !== undefined) updateData.salaryRange = dto.salaryRange?.trim() || null;
      if (dto.expectedJoiningDate !== undefined) updateData.expectedJoiningDate = dto.expectedJoiningDate ? new Date(dto.expectedJoiningDate) : null;
      if (dto.deadline !== undefined) updateData.deadline = dto.deadline ? new Date(dto.deadline) : null;
      if (dto.priority !== undefined) updateData.priority = dto.priority;
      if (dto.creationMethod !== undefined) updateData.creationMethod = dto.creationMethod;
      if (dto.jdFileId !== undefined) {
        updateData.jdFileId = dto.jdFileId || null;
        updateData.jdFileName = dto.jdFileName || null;
        updateData.jdFileSize = dto.jdFileSize || null;
        const ext = dto.jdFileName ? extname(dto.jdFileName) : '';
        updateData.jdFilePath = dto.jdFileId ? join(JD_UPLOAD_DIR, `${dto.jdFileId}${ext}`) : null;
        updateData.jdMimeType = ext ? getJdMime(ext) : null;
      }
      if (dto.status !== undefined) updateData.status = dto.status as RequirementStatus;

      await tx.recruitmentRequirement.update({
        where: { id },
        data: updateData,
      });

      // Handle HR Support assignments update if supplied
      if (dto.assignedHrSupportIds !== undefined) {
        const targetIds = [...new Set(dto.assignedHrSupportIds)];
        const currentIds = existing.assignments.map((a) => a.hrSupportId);

        const toAdd = targetIds.filter((tid) => !currentIds.includes(tid));
        const toRemove = currentIds.filter((cid) => !targetIds.includes(cid));

        if (toRemove.length > 0) {
          await tx.requirementAssignment.deleteMany({
            where: { requirementId: id, hrSupportId: { in: toRemove } },
          });
        }

        if (toAdd.length > 0) {
          await tx.requirementAssignment.createMany({
            data: toAdd.map((hrSupportId) => ({
              requirementId: id,
              hrSupportId,
              assignedById: me.id,
            })),
          });
          newlyAssignedIds = toAdd;
        }
      }
    });

    if (newlyAssignedIds.length > 0) {
      void this.notif.notify(newlyAssignedIds, {
        type: 'SYSTEM',
        title: `Requirement Assigned: ${existing.reqCode} - ${dto.title || existing.title}`,
        body: `You have been assigned to requirement "${existing.reqCode}".`,
        link: '/hr-support/requirements',
      });
    }

    await this.audit.log({
      actorId: me.id,
      action: 'RECRUITMENT_REQUIREMENT_UPDATE',
      entity: 'recruitment_requirement',
      entityId: id,
      ip,
    });

    return this.getRequirement(me, id);
  }

  async getRequirements(me: RequestUser, q: { status?: string; search?: string }) {
    const where: any = {};

    if (me.role === 'HR_SUPPORT') {
      // HR Support sees only requirements assigned to them
      where.assignments = {
        some: { hrSupportId: me.id },
      };
    }

    if (q.status) {
      where.status = q.status as RequirementStatus;
    }

    if (q.search) {
      const term = q.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { reqCode: { contains: term, mode: 'insensitive' } },
        { department: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.recruitmentRequirement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignments: {
          include: {
            hrSupport: { select: { id: true, displayName: true, email: true } },
          },
        },
        _count: {
          select: {
            candidates: true,
          },
        },
      },
    });

    // If HR Support, also calculate their own submitted candidates count
    if (me.role === 'HR_SUPPORT') {
      const myCounts = await this.prisma.candidate.groupBy({
        by: ['requirementId'],
        where: { submittedById: me.id },
        _count: { id: true },
      });
      const countMap = new Map(myCounts.map((c) => [c.requirementId, c._count.id]));

      return rows.map((r) => ({
        ...r,
        myCandidateCount: countMap.get(r.id) || 0,
      }));
    }

    // For HR Manager / Admin: include candidate status breakdowns
    const statusCounts = await this.prisma.candidate.groupBy({
      by: ['requirementId', 'status'],
      _count: { id: true },
    });

    const statusMap = new Map<string, Record<string, number>>();
    for (const sc of statusCounts) {
      if (!statusMap.has(sc.requirementId)) {
        statusMap.set(sc.requirementId, {});
      }
      statusMap.get(sc.requirementId)![sc.status] = sc._count.id;
    }

    return rows.map((r) => ({
      ...r,
      candidateBreakdown: statusMap.get(r.id) || {},
    }));
  }

  async getRequirement(me: RequestUser, id: string) {
    const req = await this.prisma.recruitmentRequirement.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignments: {
          include: {
            hrSupport: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    if (!req) throw new NotFoundException('Requirement not found');

    if (me.role === 'HR_SUPPORT') {
      const isAssigned = req.assignments.some((a) => a.hrSupportId === me.id);
      if (!isAssigned) {
        throw new ForbiddenException('You do not have access to this recruitment requirement');
      }

      const myCandidateCount = await this.prisma.candidate.count({
        where: { requirementId: id, submittedById: me.id },
      });

      return {
        ...req,
        myCandidateCount,
      };
    }

    // HR Manager / Admin: return complete metrics
    const candidates = await this.prisma.candidate.findMany({
      where: { requirementId: id },
      select: {
        id: true,
        status: true,
        submittedById: true,
        submittedBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    const submitterCounts: Record<string, { submitter: any; count: number; statuses: Record<string, number> }> = {};
    const statusCounts: Record<string, number> = {};

    for (const c of candidates) {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;

      const subId = c.submittedById;
      if (!submitterCounts[subId]) {
        submitterCounts[subId] = {
          submitter: c.submittedBy,
          count: 0,
          statuses: {},
        };
      }
      submitterCounts[subId].count++;
      submitterCounts[subId].statuses[c.status] = (submitterCounts[subId].statuses[c.status] || 0) + 1;
    }

    return {
      ...req,
      totalCandidates: candidates.length,
      statusCounts,
      submissionsByHrSupport: Object.values(submitterCounts),
    };
  }

  async getHrSupportUsers() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['HR_SUPPORT', 'EMPLOYEE'] },
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  // =========================================================================
  //  Job Description File Upload & Download / Preview
  // =========================================================================

  async uploadJdFile(
    me: RequestUser,
    file: { originalname: string; buffer?: Buffer; path?: string; size: number },
  ) {
    if (me.role !== 'HR_MANAGER' && me.role !== 'ADMIN') {
      throw new ForbiddenException('Only HR Manager or Admin can upload JD documents');
    }

    const ext = extname(file.originalname).toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      throw new BadRequestException('Only PDF, DOC, and DOCX files are supported for Job Descriptions');
    }

    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('Job description file cannot exceed 20 MB');
    }

    await fs.mkdir(JD_UPLOAD_DIR, { recursive: true });
    const fileId = randomUUID();
    const destFileName = `${fileId}${ext}`;
    const destPath = join(JD_UPLOAD_DIR, destFileName);

    if (file.buffer) {
      await fs.writeFile(destPath, file.buffer);
    } else if (file.path) {
      await fs.copyFile(file.path, destPath);
      await fs.unlink(file.path).catch(() => {});
    } else {
      throw new BadRequestException('No file content received');
    }

    return {
      fileId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: getJdMime(ext),
      filePath: destPath,
    };
  }

  async serveJdFile(me: RequestUser, requirementId: string, download: boolean, res: Response) {
    const req = await this.prisma.recruitmentRequirement.findUnique({
      where: { id: requirementId },
      include: { assignments: true },
    });
    if (!req) throw new NotFoundException('Requirement not found');

    if (me.role === 'HR_SUPPORT') {
      const isAssigned = req.assignments.some((a) => a.hrSupportId === me.id);
      if (!isAssigned) {
        throw new ForbiddenException('You do not have access to this requirement');
      }
    }

    if (!req.jdFileName) {
      throw new NotFoundException('No Job Description file attached to this requirement');
    }

    const ext = extname(req.jdFileName).toLowerCase();
    const filePath =
      req.jdFilePath && existsSync(req.jdFilePath)
        ? req.jdFilePath
        : req.jdFileId && existsSync(join(JD_UPLOAD_DIR, `${req.jdFileId}${ext}`))
        ? join(JD_UPLOAD_DIR, `${req.jdFileId}${ext}`)
        : null;

    if (!filePath || !existsSync(filePath)) {
      throw new NotFoundException('Job Description file not found on disk');
    }

    const stat = await fs.stat(filePath);
    const mime = req.jdMimeType || getJdMime(ext);
    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(req.jdFileName)}"`,
    );
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = createReadStream(filePath);
    stream.pipe(res);
  }

  async serveJdFileById(me: RequestUser, fileId: string, download: boolean, res: Response) {
    if (me.role !== 'HR_MANAGER' && me.role !== 'ADMIN' && me.role !== 'HR_SUPPORT') {
      throw new ForbiddenException('Forbidden');
    }

    await fs.mkdir(JD_UPLOAD_DIR, { recursive: true });
    const files = await fs.readdir(JD_UPLOAD_DIR);
    const matching = files.find((f) => f.startsWith(fileId));
    if (!matching) {
      throw new NotFoundException('File not found');
    }

    const filePath = join(JD_UPLOAD_DIR, matching);
    const stat = await fs.stat(filePath);
    const ext = extname(matching);
    const mime = getJdMime(ext);

    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(matching)}"`,
    );
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = createReadStream(filePath);
    stream.pipe(res);
  }

  // =========================================================================
  //  2. Candidate CSV Download, Validation & Upload (HR Support)
  // =========================================================================

  getCsvTemplate(): string {
    return generateCandidateTemplateCsv();
  }

  async validateCandidateCsv(me: RequestUser, requirementId: string, csvContent: string) {
    const requirement = await this.prisma.recruitmentRequirement.findUnique({
      where: { id: requirementId },
      include: { assignments: true },
    });
    if (!requirement) throw new NotFoundException('Requirement not found');

    if (me.role === 'HR_SUPPORT') {
      const isAssigned = requirement.assignments.some((a) => a.hrSupportId === me.id);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to this recruitment requirement');
      }
    }

    // Load existing candidates for duplicate checking
    const existing = await this.prisma.candidate.findMany({
      where: { requirementId },
      select: {
        normalizedEmail: true,
        normalizedPhone: true,
        name: true,
        submittedBy: { select: { displayName: true } },
        createdAt: true,
      },
    });

    const existingInfo = existing.map((e) => ({
      normalizedEmail: e.normalizedEmail,
      normalizedPhone: e.normalizedPhone,
      name: e.name,
      submittedByName: e.submittedBy?.displayName || 'Unknown',
      submittedAt: e.createdAt,
    }));

    const { records } = parseCsvText(csvContent);
    if (records.length === 0) {
      throw new BadRequestException('The uploaded CSV file is empty or contains no candidate records');
    }

    const result = validateCandidateRecords(records, existingInfo);
    return {
      requirementId,
      reqCode: requirement.reqCode,
      reqTitle: requirement.title,
      ...result,
    };
  }

  async uploadCandidates(
    me: RequestUser,
    requirementId: string,
    candidates: CandidateUploadItemDto[],
    ip?: string,
  ) {
    const requirement = await this.prisma.recruitmentRequirement.findUnique({
      where: { id: requirementId },
      include: { assignments: true },
    });
    if (!requirement) throw new NotFoundException('Requirement not found');

    if (me.role === 'HR_SUPPORT') {
      const isAssigned = requirement.assignments.some((a) => a.hrSupportId === me.id);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to this recruitment requirement');
      }
    }

    if (!candidates || candidates.length === 0) {
      throw new BadRequestException('No candidates provided for submission');
    }

    // Pre-normalize emails and phones to check duplicates
    const candidatesToInsert = candidates.map((c) => ({
      ...c,
      normalizedEmail: normalizeEmail(c.email),
      normalizedPhone: normalizePhone(c.phone),
    }));

    // In-file duplicate check
    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();
    for (const c of candidatesToInsert) {
      if (emailSet.has(c.normalizedEmail)) {
        throw new BadRequestException(`Duplicate candidate email within submission: ${c.email}`);
      }
      emailSet.add(c.normalizedEmail);

      if (c.normalizedPhone && c.normalizedPhone.length >= 7) {
        if (phoneSet.has(c.normalizedPhone)) {
          throw new BadRequestException(`Duplicate candidate phone within submission: ${c.phone}`);
        }
        phoneSet.add(c.normalizedPhone);
      }
    }

    const year = new Date().getFullYear();
    const countSoFar = await this.prisma.candidate.count();

    const createdCandidates = await this.prisma.$transaction(async (tx) => {
      // Check existing duplicates inside transaction
      const existingMatches = await tx.candidate.findMany({
        where: {
          requirementId,
          OR: [
            { normalizedEmail: { in: Array.from(emailSet) } },
            { normalizedPhone: { in: Array.from(phoneSet).filter(Boolean) } },
          ],
        },
        select: { email: true, phone: true, name: true },
      });

      if (existingMatches.length > 0) {
        const m = existingMatches[0];
        throw new BadRequestException(
          `Candidate "${m.name}" (${m.email} / ${m.phone}) has already been submitted for this requirement`,
        );
      }

      const results = [];
      let index = 1;

      for (const item of candidatesToInsert) {
        const candidateCode = `CAN-${year}-${String(countSoFar + index).padStart(4, '0')}`;
        index++;

        const candidate = await tx.candidate.create({
          data: {
            candidateCode,
            requirementId,
            submittedById: me.id, // Strictly derived from authenticated session
            name: item.name.trim(),
            email: item.email.trim(),
            phone: item.phone.trim(),
            normalizedEmail: item.normalizedEmail,
            normalizedPhone: item.normalizedPhone,
            qualification: item.qualification.trim(),
            specialization: item.specialization?.trim() || null,
            college: item.college?.trim() || null,
            graduationYear: item.graduationYear || null,
            totalExp: item.totalExp,
            relevantExp: item.relevantExp,
            techSkills: item.techSkills.trim(),
            softSkills: item.softSkills?.trim() || null,
            currentLocation: item.currentLocation.trim(),
            preferredLocation: item.preferredLocation?.trim() || null,
            currentCtc: item.currentCtc?.trim() || null,
            expectedCtc: item.expectedCtc?.trim() || null,
            noticePeriod: item.noticePeriod?.trim() || null,
            resumeLink: item.resumeLink?.trim() || null,
            source: item.source?.trim() || null,
            hrRemarks: item.hrRemarks?.trim() || null,
            status: CandidateStatus.SUBMITTED,
          },
        });

        // Create initial status history entry
        await tx.candidateStatusHistory.create({
          data: {
            candidateId: candidate.id,
            previousStatus: null,
            newStatus: CandidateStatus.SUBMITTED,
            changedById: me.id,
            remarks: 'Candidate submitted via CSV upload',
          },
        });

        results.push(candidate);
      }

      return results;
    });

    // Notify HR Managers
    const hrManagers = await this.prisma.user.findMany({
      where: { role: { in: ['HR_MANAGER', 'ADMIN'] }, isActive: true },
      select: { id: true },
    });
    const managerIds = hrManagers.map((m) => m.id);

    if (managerIds.length > 0) {
      void this.notif.notify(managerIds, {
        type: 'SYSTEM',
        title: `${createdCandidates.length} New Candidates Submitted: ${requirement.reqCode}`,
        body: `${me.displayName} submitted ${createdCandidates.length} candidate(s) for "${requirement.title}".`,
        link: '/hr-manager/candidates',
      });
    }

    await this.audit.log({
      actorId: me.id,
      action: 'CANDIDATE_BATCH_UPLOAD',
      entity: 'candidate',
      entityId: requirementId,
      metadata: { count: createdCandidates.length, reqCode: requirement.reqCode },
      ip,
    });

    return {
      success: true,
      count: createdCandidates.length,
      requirementId,
      reqCode: requirement.reqCode,
      candidates: createdCandidates,
    };
  }

  // =========================================================================
  //  3. Candidate Management & Status History (HR Manager & HR Support)
  // =========================================================================

  async getCandidates(
    me: RequestUser,
    q: {
      requirementId?: string;
      submittedById?: string;
      status?: string;
      minExp?: string;
      maxExp?: string;
      qualification?: string;
      search?: string;
      page?: string;
      limit?: string;
    },
  ) {
    const where: any = {};

    if (me.role === 'HR_SUPPORT') {
      // HR Support can ONLY see candidates they submitted
      where.submittedById = me.id;
    } else {
      // HR Manager / Admin can filter by submitter
      if (q.submittedById) {
        where.submittedById = q.submittedById;
      }
    }

    if (q.requirementId) {
      where.requirementId = q.requirementId;
    }

    if (q.status) {
      where.status = q.status as CandidateStatus;
    }

    if (q.qualification) {
      where.qualification = { contains: q.qualification.trim(), mode: 'insensitive' };
    }

    if (q.minExp !== undefined) {
      const min = Number(q.minExp);
      if (!isNaN(min)) where.totalExp = { ...(where.totalExp || {}), gte: min };
    }

    if (q.maxExp !== undefined) {
      const max = Number(q.maxExp);
      if (!isNaN(max)) where.totalExp = { ...(where.totalExp || {}), lte: max };
    }

    if (q.search) {
      const term = q.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { techSkills: { contains: term, mode: 'insensitive' } },
        { candidateCode: { contains: term, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));

    const [total, rows] = await Promise.all([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          requirement: {
            select: { id: true, reqCode: true, title: true, department: true },
          },
          submittedBy: {
            select: { id: true, displayName: true, email: true },
          },
          history: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              remarks: true,
              interviewFeedback: true,
              newStatus: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: rows,
    };
  }

  async getCandidate(me: RequestUser, id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        requirement: true,
        submittedBy: {
          select: { id: true, displayName: true, email: true, role: true },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: {
              select: { id: true, displayName: true, email: true, role: true },
            },
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    if (me.role === 'HR_SUPPORT' && candidate.submittedById !== me.id) {
      throw new ForbiddenException('You do not have access to view this candidate profile');
    }

    return candidate;
  }

  async updateCandidateStatus(me: RequestUser, id: string, dto: UpdateCandidateStatusDto, ip?: string) {
    if (me.role !== 'HR_MANAGER' && me.role !== 'ADMIN') {
      throw new ForbiddenException('Only HR Manager or Admin can update candidate review statuses');
    }

    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { requirement: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const previousStatus = candidate.status;
    const interviewDate = dto.interviewDate ? new Date(dto.interviewDate) : candidate.interviewDate;

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.update({
        where: { id },
        data: {
          status: dto.status as CandidateStatus,
          interviewDate: dto.interviewDate ? new Date(dto.interviewDate) : undefined,
        },
      });

      await tx.candidateStatusHistory.create({
        data: {
          candidateId: id,
          previousStatus,
          newStatus: dto.status as CandidateStatus,
          changedById: me.id,
          remarks: dto.remarks?.trim() || null,
          interviewFeedback: dto.interviewFeedback?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          nextAction: dto.nextAction?.trim() || null,
          interviewDate,
        },
      });

      return c;
    });

    // Notify submitting HR Support user
    void this.notif.notify([candidate.submittedById], {
      type: 'SYSTEM',
      title: `Candidate Status Updated: ${candidate.name} is ${dto.status}`,
      body: `Status changed to ${dto.status}${dto.remarks ? ` - Feedback: ${dto.remarks}` : ''}`,
      link: '/hr-support/submissions',
    });

    await this.audit.log({
      actorId: me.id,
      action: 'CANDIDATE_STATUS_UPDATE',
      entity: 'candidate',
      entityId: id,
      metadata: { previousStatus, newStatus: dto.status, candidateName: candidate.name },
      ip,
    });

    return this.getCandidate(me, id);
  }

  // =========================================================================
  //  4. Overview Metrics (HR Manager & HR Support)
  // =========================================================================

  async getManagerOverview() {
    const [
      totalEmployees,
      activeRequirements,
      openRequirements,
      totalCandidates,
      statusGroup,
      requirements,
      hrSupportSubmissions,
      monthlyGroup,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.recruitmentRequirement.count({
        where: { status: { in: [RequirementStatus.OPEN, RequirementStatus.IN_PROGRESS] } },
      }),
      this.prisma.recruitmentRequirement.findMany({
        where: { status: { in: [RequirementStatus.OPEN, RequirementStatus.IN_PROGRESS] } },
        select: { vacancies: true },
      }),
      this.prisma.candidate.count(),
      this.prisma.candidate.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.recruitmentRequirement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          reqCode: true,
          title: true,
          department: true,
          vacancies: true,
          status: true,
          _count: { select: { candidates: true } },
        },
      }),
      this.prisma.candidate.groupBy({
        by: ['submittedById'],
        _count: { id: true },
      }),
      this.prisma.$queryRawUnsafe<Array<{ month: string; count: bigint }>>(`
        SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*)::bigint as count
        FROM candidates
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `),
    ]);

    const totalOpenVacancies = openRequirements.reduce((sum, r) => sum + r.vacancies, 0);

    const statusCounts: Record<string, number> = {
      SUBMITTED: 0,
      UNDER_REVIEW: 0,
      SHORTLISTED: 0,
      INTERVIEW_SCHEDULED: 0,
      SELECTED: 0,
      REJECTED: 0,
      ON_HOLD: 0,
    };
    for (const sg of statusGroup) {
      statusCounts[sg.status] = sg._count.id;
    }

    // HR Support performance breakdown
    const hrSupportUsers = await this.prisma.user.findMany({
      where: { id: { in: hrSupportSubmissions.map((s) => s.submittedById) } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(hrSupportUsers.map((u) => [u.id, u]));

    const hrPerformance = await Promise.all(
      hrSupportSubmissions.map(async (s) => {
        const u = userMap.get(s.submittedById);
        const [shortlisted, selected, rejected] = await Promise.all([
          this.prisma.candidate.count({
            where: { submittedById: s.submittedById, status: CandidateStatus.SHORTLISTED },
          }),
          this.prisma.candidate.count({
            where: { submittedById: s.submittedById, status: CandidateStatus.SELECTED },
          }),
          this.prisma.candidate.count({
            where: { submittedById: s.submittedById, status: CandidateStatus.REJECTED },
          }),
        ]);
        return {
          id: s.submittedById,
          displayName: u?.displayName || 'Unknown',
          email: u?.email || '',
          totalSubmitted: s._count.id,
          shortlisted,
          selected,
          rejected,
        };
      }),
    );

    return {
      totalEmployees,
      totalActiveRequirements: activeRequirements,
      totalOpenVacancies,
      totalCandidates,
      statusCounts,
      candidatePipeline: [
        { label: 'Submitted', count: statusCounts.SUBMITTED, color: '#64748B' },
        { label: 'Under Review', count: statusCounts.UNDER_REVIEW, color: '#3B82F6' },
        { label: 'Shortlisted', count: statusCounts.SHORTLISTED, color: '#8B5CF6' },
        { label: 'Interview Scheduled', count: statusCounts.INTERVIEW_SCHEDULED, color: '#F59E0B' },
        { label: 'Selected', count: statusCounts.SELECTED, color: '#10B981' },
        { label: 'Rejected', count: statusCounts.REJECTED, color: '#EF4444' },
        { label: 'On Hold', count: statusCounts.ON_HOLD, color: '#94A3B8' },
      ],
      recentRequirements: requirements.map((r) => ({
        id: r.id,
        reqCode: r.reqCode,
        title: r.title,
        department: r.department,
        vacancies: r.vacancies,
        status: r.status,
        candidateCount: r._count.candidates,
      })),
      hrSupportPerformance: hrPerformance,
      monthlyTrends: monthlyGroup
        .map((m) => ({ month: m.month, count: Number(m.count) }))
        .reverse(),
    };
  }

  async getSupportOverview(me: RequestUser) {
    const [assigned, totalSubmitted, statusGroup] = await Promise.all([
      this.prisma.requirementAssignment.findMany({
        where: { hrSupportId: me.id },
        include: {
          requirement: {
            select: { id: true, status: true, createdAt: true },
          },
        },
      }),
      this.prisma.candidate.count({ where: { submittedById: me.id } }),
      this.prisma.candidate.groupBy({
        by: ['status'],
        where: { submittedById: me.id },
        _count: { id: true },
      }),
    ]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const totalAssigned = assigned.length;
    const newRequirements = assigned.filter((a) => a.assignedAt >= sevenDaysAgo).length;
    const inProgressRequirements = assigned.filter(
      (a) => a.requirement.status === RequirementStatus.IN_PROGRESS || a.requirement.status === RequirementStatus.OPEN,
    ).length;
    const completedRequirements = assigned.filter(
      (a) => a.requirement.status === RequirementStatus.CLOSED,
    ).length;

    const statusCounts: Record<string, number> = {
      SUBMITTED: 0,
      UNDER_REVIEW: 0,
      SHORTLISTED: 0,
      INTERVIEW_SCHEDULED: 0,
      SELECTED: 0,
      REJECTED: 0,
      ON_HOLD: 0,
    };
    for (const sg of statusGroup) {
      statusCounts[sg.status] = sg._count.id;
    }

    return {
      totalAssignedRequirements: totalAssigned,
      newRequirements,
      inProgressRequirements,
      requirementsCompleted: completedRequirements,
      totalCandidatesSubmitted: totalSubmitted,
      candidatesUnderReview: statusCounts.UNDER_REVIEW + statusCounts.SUBMITTED,
      candidatesShortlisted: statusCounts.SHORTLISTED + statusCounts.INTERVIEW_SCHEDULED,
      candidatesRejected: statusCounts.REJECTED,
      candidatesSelected: statusCounts.SELECTED,
      statusCounts,
    };
  }

  // =========================================================================
  //  5. Organization-wide Login Activity (HR Manager)
  // =========================================================================

  async getLoginActivity(
    me: RequestUser,
    q: { date?: string; employeeId?: string; teamId?: string },
  ) {
    if (me.role !== 'HR_MANAGER' && me.role !== 'ADMIN') {
      throw new ForbiddenException('Only HR Manager or Admin can view organization login activity');
    }

    const cfg = await this.calendar.attendanceConfig();
    const shiftStartMinutes = typeof cfg.shiftStart === 'number' ? cfg.shiftStart : 570;
    const graceMinutes = typeof cfg.graceMinutes === 'number' ? cfg.graceMinutes : 15;
    const startH = Math.floor(shiftStartMinutes / 60);
    const startM = shiftStartMinutes % 60;
    const shiftStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const lateThresholdMinutes = shiftStartMinutes + graceMinutes;

    const userWhere: any = { isActive: true };
    if (q.employeeId) userWhere.id = q.employeeId;
    if (q.teamId) userWhere.teamId = q.teamId;

    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        lastLoginAt: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: { displayName: 'asc' },
    });

    // Query AuditLog for login and logout events
    const auditWhere: any = {
      action: { in: ['LOGIN', 'LOGOUT'] },
    };
    if (q.employeeId) auditWhere.actorId = q.employeeId;

    if (q.date) {
      const d = new Date(q.date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      auditWhere.createdAt = { gte: d, lt: nextDay };
    } else {
      // Default: last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      auditWhere.createdAt = { gte: sevenDaysAgo };
    }

    const logs = await this.prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        actor: {
          select: { id: true, displayName: true, email: true, team: { select: { name: true } } },
        },
      },
    });

    const enrichedLogs = logs.map((log) => {
      const dateObj = new Date(log.createdAt);
      const hours = dateObj.getHours();
      const minutes = dateObj.getMinutes();
      const loginMinutes = hours * 60 + minutes;
      const isLate = log.action === 'LOGIN' && loginMinutes > lateThresholdMinutes;

      return {
        id: log.id,
        employeeId: log.actorId,
        employeeName: log.actor?.displayName || 'Unknown',
        email: log.actor?.email || '',
        team: log.actor?.team?.name || '—',
        action: log.action,
        timestamp: log.createdAt,
        time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: dateObj.toISOString().slice(0, 10),
        ip: log.ip,
        isLate,
      };
    });

    return {
      shiftStart,
      users: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        team: u.team?.name || '—',
        lastLoginAt: u.lastLoginAt,
      })),
      logs: enrichedLogs,
    };
  }

  // =========================================================================
  //  6. Export Reports (CSV)
  // =========================================================================

  async exportCandidatesCsv(
    me: RequestUser,
    q: { requirementId?: string; status?: string; submittedById?: string },
  ): Promise<string> {
    const where: any = {};
    if (me.role === 'HR_SUPPORT') {
      where.submittedById = me.id;
    } else if (q.submittedById) {
      where.submittedById = q.submittedById;
    }

    if (q.requirementId) where.requirementId = q.requirementId;
    if (q.status) where.status = q.status as CandidateStatus;

    const candidates = await this.prisma.candidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requirement: { select: { reqCode: true, title: true, department: true } },
        submittedBy: { select: { displayName: true, email: true } },
      },
    });

    const headers = [
      'Candidate Code',
      'Name',
      'Email',
      'Phone',
      'Requirement Code',
      'Job Title',
      'Department',
      'Submitted By',
      'Qualification',
      'Specialization',
      'Total Exp (Years)',
      'Relevant Exp (Years)',
      'Technical Skills',
      'Current Location',
      'Current CTC',
      'Expected CTC',
      'Notice Period',
      'Status',
      'Interview Date',
      'Submission Date',
    ];

    const rows = candidates.map((c) => [
      c.candidateCode,
      c.name,
      c.email,
      c.phone,
      c.requirement.reqCode,
      c.requirement.title,
      c.requirement.department,
      c.submittedBy.displayName,
      c.qualification,
      c.specialization || '',
      c.totalExp.toString(),
      c.relevantExp.toString(),
      c.techSkills,
      c.currentLocation,
      c.currentCtc || '',
      c.expectedCtc || '',
      c.noticePeriod || '',
      c.status,
      c.interviewDate ? c.interviewDate.toISOString().slice(0, 10) : '',
      c.createdAt.toISOString().slice(0, 10),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((v) => {
            const str = String(v ?? '');
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(','),
      ),
    ].join('\r\n');

    return csvContent;
  }
}
