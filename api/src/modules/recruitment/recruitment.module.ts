import { Module } from '@nestjs/common';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommsModule } from '../comms/comms.module';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommsModule, AuditModule, CommonModule],
  controllers: [RecruitmentController],
  providers: [RecruitmentService],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
