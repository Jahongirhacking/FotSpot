import { IsIn, IsString } from 'class-validator';

const CATEGORIES = ['DRIBBLING', 'PASSING', 'SHOOTING', 'SPRINT', 'MATCH_HIGHLIGHTS'] as const;
const TYPES = ['IMAGE', 'VIDEO'] as const;

export class RequestUploadDto {
  @IsString() filename: string;
  @IsIn(TYPES) type: (typeof TYPES)[number];
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
}

export class ConfirmUploadDto {
  @IsString() storageKey: string;
  @IsIn(TYPES) type: (typeof TYPES)[number];
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
}
