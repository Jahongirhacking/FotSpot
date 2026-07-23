import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAcademyDto {
  @IsString() name: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateAcademyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;
}

export class AddStaffMemberDto {
  @IsUUID() userId: string;
  @IsIn(['COACH', 'SCOUT']) role: 'COACH' | 'SCOUT';
}
