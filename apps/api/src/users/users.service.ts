import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Columns safe to return over the API — passwordHash is never among them. */
const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  timezone: true,
  settings: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!user) throw new NotFoundException('Account not found.');
    return user;
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: PUBLIC_FIELDS,
    });
  }

  updateProfile(id: string, data: { name: string; timezone: string }) {
    return this.prisma.user.update({ where: { id }, data, select: PUBLIC_FIELDS });
  }

  /** Merges a partial settings patch; used by Appearance / Shortcuts settings. */
  async updateSettings(id: string, patch: Record<string, unknown>) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { settings: true },
    });
    const merged = { ...(user.settings as Record<string, unknown>), ...patch };
    return this.prisma.user.update({
      where: { id },
      data: { settings: merged as Prisma.InputJsonValue },
      select: PUBLIC_FIELDS,
    });
  }
}
