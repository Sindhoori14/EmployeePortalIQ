import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(['WEEKLY', 'MONTHLY'])
  type?: 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'TEAM', 'ALL_TEAMS', 'ALL_EMPLOYEES'])
  targetScope?: 'INDIVIDUAL' | 'TEAM' | 'ALL_TEAMS' | 'ALL_EMPLOYEES';

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(['WEEKLY', 'MONTHLY'])
  type?: 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsIn(['ACTIVE', 'DONE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'DONE' | 'ARCHIVED';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateGoalProgressDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  progress!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
