import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcademyMemberRole, AcademyMemberStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Identity for a manager account the platform creates on the academy's behalf.
 *
 * No password field: it is generated server-side and returned once. An admin
 * choosing the password for someone else's account is how "Parol123" ends up
 * guarding a database of children.
 */
export class NewManagerDto {
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;

  /** Optional, and only for reaching them later — sign-in is by username. */
  @IsOptional() @IsPhoneNumber() phone?: string;
}

/**
 * Admin-only (see AcademiesController). Uzbekistan has roughly 50 academies, so
 * they are onboarded by the platform team rather than self-registered.
 *
 * An academy has exactly one manager, and the two ways to name them are mutually
 * exclusive: attach an existing account (`managerUserId`) or have the platform mint
 * one (`newManager`). Both may be omitted — an admin can enter the academy before
 * knowing who runs it and assign the manager later.
 */
export class CreateAcademyDto {
  @IsString() name: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsUUID() managerUserId?: string;

  @IsOptional() @ValidateNested() @Type(() => NewManagerDto) newManager?: NewManagerDto;
}

/** Assigns or replaces the single manager of an existing academy. Admin-only. */
export class SetManagerDto {
  @IsOptional() @IsUUID() managerUserId?: string;

  @IsOptional() @ValidateNested() @Type(() => NewManagerDto) newManager?: NewManagerDto;
}

export class UpdateAcademyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;

  /**
   * The note this academy puts on every trial unless it says otherwise.
   *
   * HTML from the note editor, sanitised server-side before storage. It is a
   * *default*, copied into a trial at creation — editing it later does not
   * rewrite the notes of trials that have already happened.
   */
  @IsOptional() @IsString() @MaxLength(20_000) defaultTrialNote?: string;

  /**
   * Where the academy is, as a point.
   *
   * Sent together or not at all — the database refuses half a pair, because one
   * coordinate locates nothing. The bounds are checked here *and* by a CHECK
   * constraint: a swapped latitude/longitude is the classic way to end up in the
   * Gulf of Guinea, and it should fail at the edge rather than on a map.
   */
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  /** R2 object key from the upload ticket, re-checked server-side. */
  @IsOptional() @IsString() @MaxLength(512) logoKey?: string;

  /*
   * Social links, one field per allowed platform.
   *
   * Host-checked rather than merely "is a URL": the point of naming four
   * platforms is that only those four appear, and a validator that accepts any
   * https address makes the restriction decorative. An empty string clears one.
   */
  @IsOptional() @IsString() @MaxLength(300) telegramUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) facebookUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) instagramUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) youtubeUrl?: string;
}

/** Asking for a presigned PUT. The key is minted server-side from the id. */
export class AcademyImageUploadDto {
  @IsString() @MaxLength(200) filename: string;
}

/** A photo being added to the academy's gallery. */
export class AddAcademyPhotoDto {
  @IsString() @MaxLength(512) storageKey: string;
  @IsOptional() @IsString() @MaxLength(200) caption?: string;
}

/** Reordering the gallery, or the featured lists — ids in the order wanted. */
export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids: string[];
}

/**
 * Who the academy features, for one role, in order.
 *
 * The whole list is sent rather than one addition at a time: "these five, in
 * this order" is the thing the manager decided, and rebuilding it wholesale is
 * what makes reordering and removing the same operation as adding.
 */
export class SetFeaturedDto {
  @ApiProperty({ enum: AcademyMemberRole, enumName: 'AcademyMemberRole' })
  @IsIn(['PLAYER', 'COACH', 'SCOUT'])
  role: 'PLAYER' | 'COACH' | 'SCOUT';

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  memberIds: string[];
}

/**
 * Change what a member is, or whether they are still active.
 *
 * There is no delete. A coach who has left keeps every assessment they made, and
 * a row that vanishes takes the meaning of those judgements with it.
 */
export class UpdateMemberDto {
  @IsOptional() @IsIn(['COACH', 'SCOUT', 'PLAYER']) role?: 'COACH' | 'SCOUT' | 'PLAYER';
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  /** Head coach, goalkeeping coach, fitness coach — free text, per academy. */
  @IsOptional() @IsString() @MaxLength(60) coachType?: string;
}

export class ListMembersDto {
  @IsOptional() @IsIn(['MANAGER', 'COACH', 'SCOUT', 'PLAYER']) role?: AcademyMemberRole;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'RELEASED']) status?: AcademyMemberStatus;
}

/**
 * A coach the academy is adding: either an existing account, or a new one it
 * wants minted with generated credentials — the same two paths an admin has when
 * appointing a manager, for the same reason. Most Uzbek youth coaches have no
 * account until someone makes them one.
 */
export class CreateCoachDto {
  @IsOptional() @IsUUID() userId?: string;

  @IsOptional() @ValidateNested() @Type(() => NewManagerDto) newCoach?: NewManagerDto;

  @IsOptional() @IsString() @MaxLength(500) bio?: string;
}

/** Take on a member another academy has released. */
export class ImportMemberDto {
  @IsUUID() memberId: string;
}
