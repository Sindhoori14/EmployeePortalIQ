import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { istDay } from './insights.service';

const MAX_ROWS = 5000;

/** Parse a user-supplied date or fail with a clean 400 instead of a database crash. */
function d(v: string): Date {
  const x = new Date(v);
  if (Number.isNaN(x.getTime())) throw new BadRequestException(`Invalid date: ${v}`);
  return x;
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // CSV/Excel formula injection: a title like =HYPERLINK(...) would execute when a lead opens the export.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: string[][]): string {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function pdfTable(title: string, filters: string, headers: string[], rows: string[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(title);
    doc.fontSize(9).fillColor('gray').text(`TeamFlow export · ${istDay(new Date())}${filters ? ` · ${filters}` : ''}`);
    doc.moveDown().fillColor('black');
    const colW = Math.min(170, Math.floor(515 / Math.max(1, headers.length)));
    doc.fontSize(9);
    headers.forEach((h, i) => {
      doc.text(h, 40 + i * colW, doc.y, { width: colW, continued: i < headers.length - 1 });
    });
    doc.moveDown(0.5);
    doc.fontSize(8);
    for (const row of rows.slice(0, 500)) {
      if (doc.y > 740) doc.addPage();
      row.forEach((cell, i) => {
        doc.text(String(cell).slice(0, 60), 40 + i * colW, doc.y, { width: colW, continued: i < row.length - 1 });
      });
      doc.moveDown(0.4);
    }
    doc.end();
  });
}

@Injectable()
export class ExportsService {
  constructor(private prisma: PrismaService) {}

  private taskScope(me: RequestUser, teamId?: string): any {
    if (me.role === 'EMPLOYEE') throw new ForbiddenException('Export not available for your role');
    if (me.role === 'COORDINATOR') {
      if (!me.teamId) throw new ForbiddenException('You are not assigned to a team');
      if (teamId && teamId !== me.teamId) throw new ForbiddenException('Outside your team');
      return { teamId: me.teamId };
    }
    return teamId ? { teamId } : {};
  }

  async tasksCsv(me: RequestUser, q: { teamId?: string; status?: string; from?: string; to?: string }) {
    const where: any = this.taskScope(me, q.teamId);
    if (q.status) where.status = q.status;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: d(q.from) } : {}), ...(q.to ? { lte: d(q.to) } : {}) };
    const rows = await this.prisma.task.findMany({
      where, take: MAX_ROWS, orderBy: { createdAt: 'desc' },
      include: { owner: { select: { displayName: true, email: true } }, team: { select: { name: true } } },
    });
    const data = [['Title', 'Status', 'Priority', 'Owner', 'Owner email', 'Team', 'Due date', 'Est hours', 'Created']];
    for (const t of rows) {
      data.push([t.title, t.status, t.priority, t.owner.displayName, t.owner.email, t.team.name, t.dueDate ? istDay(t.dueDate) : '', t.estimatedHours?.toString() ?? '', t.createdAt.toISOString()]);
    }
    return { filename: `tasks-${istDay(new Date())}.csv`, body: csv(data) };
  }

  async tasksPdf(me: RequestUser, q: { teamId?: string; status?: string; from?: string; to?: string }) {
    const where: any = this.taskScope(me, q.teamId);
    if (q.status) where.status = q.status;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: d(q.from) } : {}), ...(q.to ? { lte: d(q.to) } : {}) };
    const rows = await this.prisma.task.findMany({
      where, take: 500, orderBy: { createdAt: 'desc' },
      include: { owner: { select: { displayName: true } }, team: { select: { name: true } } },
    });
    const filter = [q.teamId && `team=${q.teamId}`, q.status && `status=${q.status}`, q.from && `from=${q.from}`, q.to && `to=${q.to}`].filter(Boolean).join(' ');
    const buf = await pdfTable('Tasks report', filter,
      ['Title', 'Status', 'Owner', 'Team', 'Due'],
      rows.map((t) => [t.title, t.status, t.owner.displayName, t.team.name, t.dueDate ? istDay(t.dueDate) : '—']));
    return { filename: `tasks-${istDay(new Date())}.pdf`, body: buf };
  }

  async reportsCsv(me: RequestUser, q: { date?: string; teamId?: string; from?: string; to?: string }) {
    if (me.role === 'EMPLOYEE') throw new ForbiddenException('Export not available for your role');
    const where: any = {};
    if (q.date) where.reportDate = d(q.date);
    else if (q.from || q.to) where.reportDate = { ...(q.from ? { gte: d(q.from) } : {}), ...(q.to ? { lte: d(q.to) } : {}) };
    if (me.role === 'COORDINATOR') {
      if (!me.teamId) throw new ForbiddenException('You are not assigned to a team');
      if (q.teamId && q.teamId !== me.teamId) throw new ForbiddenException('Outside your team');
      where.teamId = me.teamId;
    } else if (q.teamId) where.teamId = q.teamId;
    const rows = await this.prisma.dailyReport.findMany({
      where, take: MAX_ROWS, orderBy: { reportDate: 'desc' },
      include: { user: { select: { displayName: true, email: true } } },
    });
    const data = [['Date', 'User', 'Email', 'Hours', 'Late', 'Did', 'Plan']];
    for (const r of rows) {
      data.push([istDay(r.reportDate), r.user.displayName, r.user.email, String(r.hoursWorked), r.isLate ? 'yes' : 'no', r.didToday.slice(0, 200), r.planTomorrow.slice(0, 200)]);
    }
    return { filename: `reports-${istDay(new Date())}.csv`, body: csv(data) };
  }

  async reportsPdf(me: RequestUser, q: { date?: string; teamId?: string; from?: string; to?: string }) {
    if (me.role === 'EMPLOYEE') throw new ForbiddenException('Export not available for your role');
    const where: any = {};
    if (q.date) where.reportDate = d(q.date);
    else if (q.from || q.to) where.reportDate = { ...(q.from ? { gte: d(q.from) } : {}), ...(q.to ? { lte: d(q.to) } : {}) };
    if (me.role === 'COORDINATOR') {
      if (!me.teamId) throw new ForbiddenException('You are not assigned to a team');
      if (q.teamId && q.teamId !== me.teamId) throw new ForbiddenException('Outside your team');
      where.teamId = me.teamId;
    } else if (q.teamId) where.teamId = q.teamId;
    const rows = await this.prisma.dailyReport.findMany({
      where, take: 500, orderBy: { reportDate: 'desc' },
      include: { user: { select: { displayName: true } } },
    });
    const filter = [q.date && `date=${q.date}`, q.teamId && `team=${q.teamId}`].filter(Boolean).join(' ');
    const buf = await pdfTable('Daily reports', filter,
      ['Date', 'User', 'Hours', 'Late', 'Did'],
      rows.map((r) => [istDay(r.reportDate), r.user.displayName, String(r.hoursWorked), r.isLate ? 'yes' : 'no', r.didToday.slice(0, 80)]));
    return { filename: `reports-${istDay(new Date())}.pdf`, body: buf };
  }
}
