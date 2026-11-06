import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateRequirementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  department!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  vacancies!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Full-time', 'Internship', 'Contract', 'Part-time'])
  employmentType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MANUAL', 'DIRECT_UPLOAD'])
  creationMethod?: string;

  @IsOptional()
  @IsString()
  jdFileId?: string;

  @IsOptional()
  @IsString()
  jdFileName?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  jdFileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  qualification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  specialization?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 0))
  @IsNumber()
  @Min(0)
  minExp?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 0))
  @IsNumber()
  @Min(0)
  maxExp?: number;

  @IsOptional()
  @IsString()
  techSkills?: string;

  @IsOptional()
  @IsString()
  softSkills?: string;

  @IsOptional()
  @IsString()
  certifications?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  responsibilities?: string;

  @IsOptional()
  @IsString()
  requiredSkills?: string;

  @IsOptional()
  @IsString()
  preferredSkills?: string;

  @IsOptional()
  @IsString()
  additionalInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  salaryRange?: string;

  @IsOptional()
  @IsString()
  expectedJoiningDate?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED'])
  status?: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'CLOSED';

  @IsArray()
  @IsString({ each: true })
  assignedHrSupportIds!: string[];
}

export class UpdateRequirementDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  vacancies?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  location?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Full-time', 'Internship', 'Contract', 'Part-time'])
  employmentType?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  qualification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  specialization?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  minExp?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  maxExp?: number;

  @IsOptional()
  @IsString()
  techSkills?: string;

  @IsOptional()
  @IsString()
  softSkills?: string;

  @IsOptional()
  @IsString()
  certifications?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  responsibilities?: string;

  @IsOptional()
  @IsString()
  requiredSkills?: string;

  @IsOptional()
  @IsString()
  preferredSkills?: string;

  @IsOptional()
  @IsString()
  additionalInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  salaryRange?: string;

  @IsOptional()
  @IsString()
  expectedJoiningDate?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED'])
  status?: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'CLOSED';

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MANUAL', 'DIRECT_UPLOAD'])
  creationMethod?: string;

  @IsOptional()
  @IsString()
  jdFileId?: string;

  @IsOptional()
  @IsString()
  jdFileName?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  jdFileSize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedHrSupportIds?: string[];
}

export class UpdateCandidateStatusDto {
  @IsIn(['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED', 'ON_HOLD'])
  status!: 'SUBMITTED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'INTERVIEW_SCHEDULED' | 'SELECTED' | 'REJECTED' | 'ON_HOLD';

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  interviewFeedback?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsString()
  interviewDate?: string;
}

export class ValidateCsvDto {
  @IsString()
  csvContent!: string;
}

export class CandidateUploadItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  qualification!: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsString()
  college?: string;

  @IsOptional()
  @IsInt()
  graduationYear?: number;

  @IsNumber()
  totalExp!: number;

  @IsNumber()
  relevantExp!: number;

  @IsString()
  techSkills!: string;

  @IsOptional()
  @IsString()
  softSkills?: string;

  @IsString()
  currentLocation!: string;

  @IsOptional()
  @IsString()
  preferredLocation?: string;

  @IsOptional()
  @IsString()
  currentCtc?: string;

  @IsOptional()
  @IsString()
  expectedCtc?: string;

  @IsOptional()
  @IsString()
  noticePeriod?: string;

  @IsOptional()
  @IsString()
  resumeLink?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  hrRemarks?: string;
}

export class ConfirmCandidateUploadDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CandidateUploadItemDto)
  candidates!: CandidateUploadItemDto[];
}
