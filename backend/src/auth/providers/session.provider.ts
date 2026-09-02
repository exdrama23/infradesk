import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionProvider {
  private readonly hmacKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.hmacKey =
      config.get<string>('SESSION_SECRET') ??
      config.get<string>('JWT_SECRET') ??
      '';
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  hashToken(refreshToken: string): string {
    return createHmac('sha256', this.hmacKey)
      .update(refreshToken)
      .digest('hex');
  }

  async create(
    userId: string,
    refreshToken: string,
    meta: { userAgent?: string; ip?: string },
  ) {
    const refreshTokenHash = this.hashToken(refreshToken);
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip?.slice(0, 45),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  }

  async rotate(
    oldRefreshToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ userId: string; newRefreshToken: string } | null> {
    const oldHash = this.hashToken(oldRefreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: oldHash },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = this.generateRefreshToken();
    await this.create(session.userId, newRefreshToken, meta);

    return { userId: session.userId, newRefreshToken };
  }

  async revoke(refreshToken: string): Promise<void> {
    const hash = this.hashToken(refreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  fingerprint(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex').slice(0, 8);
  }
}