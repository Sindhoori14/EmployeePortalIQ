import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMeetingDto {
  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  meetUrl!: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsIn(['NONE', 'DAILY'])
  recurrence?: 'NONE' | 'DAILY';
}

export class RequestLeaveDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateMeetingNoteDto {
  @IsString()
  @MaxLength(10000)
  note!: string;
}

export class DecideLeaveDto {
  @IsOptional()
  @IsIn(['APPROVED', 'REJECTED'])
  decision?: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateCalendarEventDto {
  @IsOptional()
  @IsIn(['MEETING', 'HOLIDAY', 'ANNOUNCEMENT', 'OTHER'])
  type?: 'MEETING' | 'HOLIDAY' | 'ANNOUNCEMENT' | 'OTHER';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meetUrl?: string;

  @IsOptional()
  @IsIn(['ALL_EMPLOYEES', 'ALL_TEAMS', 'SPECIFIC_TEAM'])
  audience?: 'ALL_EMPLOYEES' | 'ALL_TEAMS' | 'SPECIFIC_TEAM';

  @IsOptional()
  @IsString()
  teamId?: string | null;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsIn(['MEETING', 'HOLIDAY', 'ANNOUNCEMENT', 'OTHER'])
  type?: 'MEETING' | 'HOLIDAY' | 'ANNOUNCEMENT' | 'OTHER';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meetUrl?: string;

  @IsOptional()
  @IsIn(['ALL_EMPLOYEES', 'ALL_TEAMS', 'SPECIFIC_TEAM'])
  audience?: 'ALL_EMPLOYEES' | 'ALL_TEAMS' | 'SPECIFIC_TEAM';

  @IsOptional()
  @IsString()
  teamId?: string | null;
}
