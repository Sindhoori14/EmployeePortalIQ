import { IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SubmitReportDto {
  @IsString()
  reportDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  didToday!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  blockers?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  planTomorrow!: string;

  @IsNumber()
  @Min(0)
  @Max(24)
  hoursWorked!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
