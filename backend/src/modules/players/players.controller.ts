// src/modules/players/players.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard, Public } from "../../common/guards/jwt-auth.guard";
import { CreatePlayerProfileDto } from "./dto/create-player.dto";
import { PlayersService } from "./players.service";

@ApiTags("players")
@Controller("players")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Post("profile")
  @ApiOperation({ summary: "Create player profile for current user" })
  createProfile(@CurrentUser() user: any, @Body() dto: CreatePlayerProfileDto) {
    return this.playersService.createProfile(user.id, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "Get current user player profile" })
  getMyProfile(@CurrentUser() user: any) {
    return this.playersService.findByUserId(user.id);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: "Search/list players" })
  @ApiQuery({ name: "position", required: false })
  @ApiQuery({ name: "region", required: false })
  @ApiQuery({ name: "minAge", required: false, type: Number })
  @ApiQuery({ name: "maxAge", required: false, type: Number })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  findAll(@Query() query: any) {
    return this.playersService.findAll(query);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Get player profile by ID" })
  findOne(@Param("id") id: string) {
    return this.playersService.findOne(id);
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update current user player profile" })
  updateProfile(
    @CurrentUser() user: any,
    @Body() dto: Partial<CreatePlayerProfileDto>,
  ) {
    return this.playersService.updateProfile(user.id, dto);
  }

  @Patch("stats")
  @ApiOperation({ summary: "Update player statistics" })
  updateStats(
    @CurrentUser() user: any,
    @Body()
    stats: {
      matches?: number;
      goals?: number;
      assists?: number;
      cleanSheets?: number;
    },
  ) {
    return this.playersService.updateStats(user.id, stats);
  }
}
