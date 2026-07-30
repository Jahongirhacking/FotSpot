import { IsEmail, IsEnum, IsOptional, IsPhoneNumber, IsString, Length, MaxLength } from 'class-validator';
import { VerificationChannel } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;

  /**
   * Set only by confirming an upload from `POST /users/me/avatar/upload-url`.
   * Accepting an arbitrary URL here would let a profile embed a remote image and
   * turn every profile view into a request to a third-party server.
   */
  @IsOptional() @IsString() @MaxLength(500) avatarStorageKey?: string;
}

export class AvatarUploadUrlDto {
  @IsString() @MaxLength(200) filename: string;
}

/**
 * Requests a code proving the caller controls a new phone or email.
 *
 * `destination` is validated per channel in the service — class-validator can't
 * switch a decorator on a sibling field's value.
 */
export class RequestContactChangeDto {
  @IsEnum(VerificationChannel) channel: VerificationChannel;
  @IsString() @MaxLength(200) destination: string;
}

export class VerifyContactChangeDto {
  @IsEnum(VerificationChannel) channel: VerificationChannel;
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
