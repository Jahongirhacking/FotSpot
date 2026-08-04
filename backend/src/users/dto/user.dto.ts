import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { VerificationChannel } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;

  /**
   * The public handle. Accepted with or without a leading `@`; shape and
   * reserved-word rules live in username.util.ts, uniqueness in the database.
   */
  @IsOptional() @IsString() @MaxLength(40) username?: string;

  /**
   * Set only by confirming an upload from `POST /users/me/avatar/upload-url`.
   * Accepting an arbitrary URL here would let a profile embed a remote image and
   * turn every profile view into a request to a third-party server.
   */
  @IsOptional() @IsString() @MaxLength(500) avatarStorageKey?: string;

  /**
   * Hide the account from public listings and profile reads. Off by default —
   * an account nobody can find cannot be scouted.
   */
  @IsOptional() @IsBoolean() isPrivate?: boolean;
}

export class AvatarUploadUrlDto {
  @IsString() @MaxLength(200) filename: string;

  /** Sent to R2 so the object is served back with the right type. */
  @IsOptional() @IsString() @MaxLength(100) contentType?: string;
}

/**
 * Requests a code proving the caller controls a new phone or email.
 *
 * `destination` is validated per channel in the service — class-validator can't
 * switch a decorator on a sibling field's value.
 */
export class RequestContactChangeDto {
  @ApiProperty({ enum: VerificationChannel, enumName: 'VerificationChannel' })
  @IsEnum(VerificationChannel)
  channel: VerificationChannel;
  @IsString() @MaxLength(200) destination: string;
}

export class VerifyContactChangeDto {
  @ApiProperty({ enum: VerificationChannel, enumName: 'VerificationChannel' })
  @IsEnum(VerificationChannel)
  channel: VerificationChannel;
  @IsString() @MaxLength(200) destination: string;
  @IsString() @Length(6, 6) code: string;
}

/** Used only to reuse class-validator's checks inside the service. */
export class PhoneShape {
  @IsPhoneNumber() phone: string;
}

export class EmailShape {
  @IsEmail() email: string;
}
