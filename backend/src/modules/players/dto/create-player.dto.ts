// src/modules/players/dto/create-player.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

// These match Prisma enums — available after prisma generate
enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
}
enum DominantFoot {
  LEFT = "LEFT",
  RIGHT = "RIGHT",
  BOTH = "BOTH",
}
enum Position {
  GK = "GK",
  CB = "CB",
  LB = "LB",
  RB = "RB",
  CDM = "CDM",
  CM = "CM",
  CAM = "CAM",
  LM = "LM",
  RM = "RM",
  LW = "LW",
  RW = "RW",
  ST = "ST",
  CF = "CF",
}

export class CreatePlayerProfileDto {
  @ApiProperty({ example: "2005-03-15" })
  @IsDateString()
  birthDate: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiPropertyOptional({ example: 175 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(220)
  height?: number;

  @ApiPropertyOptional({ example: 68 })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(150)
  weight?: number;

  @ApiPropertyOptional({ enum: DominantFoot })
  @IsOptional()
  @IsEnum(DominantFoot)
  dominantFoot?: DominantFoot;

  @ApiPropertyOptional({ enum: Position })
  @IsOptional()
  @IsEnum(Position)
  primaryPosition?: Position;

  @ApiPropertyOptional({ enum: Position })
  @IsOptional()
  @IsEnum(Position)
  secondaryPosition?: Position;

  @ApiPropertyOptional({ example: "Toshkent" })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: "Yunusobod" })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    example: "Aggressive pressing winger with strong dribbling...",
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
