import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from './r2-storage.service';
import { ConfirmUploadDto, RequestUploadDto } from './dto/media.dto';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService, private storage: R2StorageService) {}

  private async ownPlayerProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Only players can upload media to their profile');
    return profile;
  }

  async requestUpload(userId: string, dto: RequestUploadDto) {
    const profile = await this.ownPlayerProfile(userId);
    return this.storage.getUploadUrl(profile.id, dto.filename);
  }

  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    const profile = await this.ownPlayerProfile(userId);
    const base = process.env.R2_PUBLIC_BASE_URL ?? '';
    return this.prisma.media.create({
      data: {
        playerId: profile.id,
        type: dto.type,
        category: dto.category,
        storageKey: dto.storageKey,
        url: `${base}/${dto.storageKey}`,
      },
    });
  }

  async listForPlayer(playerId: string) {
    return this.prisma.media.findMany({
      where: { playerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async like(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    return this.prisma.mediaLike.upsert({
      where: { mediaId_userId: { mediaId, userId } },
      update: {},
      create: { mediaId, userId },
    });
  }

  async unlike(userId: string, mediaId: string) {
    await this.prisma.mediaLike.delete({
      where: { mediaId_userId: { mediaId, userId } },
    }).catch(() => undefined);
    return { unliked: true };
  }
}
