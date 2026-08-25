import { Controller, Get } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('stats')
  @Roles(UserRole.DEV)
  async stats() {
    return this.jobs.getStats();
  }

  @Get()
  @Roles(UserRole.DEV)
  async list() {
    return this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        error: true,
        createdAt: true,
        processedAt: true,
        ticketId: true,
      },
    });
  }
}