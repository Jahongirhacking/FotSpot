// src/modules/auth/dto/register.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterWithEmailDto {
  @ApiProperty({ example: "ali@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "SecurePass123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @ApiProperty({ example: "Ali" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: "Karimov" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;
}

export class RegisterWithPhoneDto {
  @ApiProperty({ example: "+998901234567" })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ example: "Ali" })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ example: "Karimov" })
  @IsString()
  @MinLength(2)
  lastName: string;
}

// ─── Login DTOs ─────────────────────────────────────────────────

export class LoginWithEmailDto {
  @ApiProperty({ example: "ali@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "SecurePass123!" })
  @IsString()
  password: string;
}

// ─── OTP DTOs ────────────────────────────────────────────────────

export class SendOtpDto {
  @ApiProperty({ example: "+998901234567" })
  @IsPhoneNumber()
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: "+998901234567" })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

// ─── Token refresh ───────────────────────────────────────────────

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
