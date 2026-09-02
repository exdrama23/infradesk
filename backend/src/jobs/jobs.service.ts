import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus, JobType, Prisma } from '../generated/prisma/client';

export interface JobPayload {
  [key: string]: unknown;
}

export interface ClaimedJob {
  id: string;
  type: JobType;
  payload: JobPayload;
  ticketId: string | null;
  attempts: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    type: JobType,
    payload: JobPayload,
    options: { ticketId?: string; availableAt?: Date } = {},
  ): Promise<string> {
    const job = await this.prisma.job.create({
      data: {
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
        ticketId: options.ticketId,
        availableAt: options.availableAt ?? new Date(),
      },
    });

    this.logger.debug(`[JOBS] Job ${job.id} enfileirado (${type})`);
    return job.id;
  }

  async claimNext(workerId: string): Promise<ClaimedJob | null> {
    const claimed = await this.prisma.$queryRaw`
      WITH candidate AS (
        SELECT id
        FROM jobs
        WHERE status = 'PENDING'
          AND available_at <= NOW()
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE jobs
      SET status = 'PROCESSING',
          lock_id = ${workerId}::uuid,
          locked_at = NOW(),
          attempts = attempts + 1
      FROM candidate
      WHERE jobs.id = candidate.id
      RETURNING jobs.id, jobs.type, jobs.payload, jobs.ticket_id, jobs.attempts;
    `;

    if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
      return null;
    }

    const row = Array.isArray(claimed) ? claimed[0] : claimed;

    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      ticketId: row.ticket_id,
      attempts: row.attempts,
    };
  }

  async complete(jobId: string, result?: Record<string, unknown>) {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        processedAt: new Date(),
        error: null,
        payload: { ...(result as object) },
      },
    });
    this.logger.debug(`[JOBS] Job ${jobId} concluído`);
  }

  async fail(jobId: string, error: string, maxAttempts = 3) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });

    if (!job) return;

    if (job.attempts >= maxAttempts) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          processedAt: new Date(),
          error,
        },
      });
      this.logger.error(`[JOBS] Job ${jobId} falhou definitivamente: ${error}`);
      return;
    }

    const backoffMs = Math.min(2 ** job.attempts * 5000, 120_000);
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PENDING,
        error,
        lockedAt: null,
        lockId: null,
        availableAt: new Date(Date.now() + backoffMs),
      },
    });
    this.logger.warn(
      `[JOBS] Job ${jobId} re-enfileirado (backoff ${backoffMs}ms): ${error}`,
    );
  }

  async getStats() {
    const [pending, processing, completed, failed, cancelled] =
      await Promise.all([
        this.prisma.job.count({ where: { status: JobStatus.PENDING } }),
        this.prisma.job.count({ where: { status: JobStatus.PROCESSING } }),
        this.prisma.job.count({ where: { status: JobStatus.COMPLETED } }),
        this.prisma.job.count({ where: { status: JobStatus.FAILED } }),
        this.prisma.job.count({ where: { status: JobStatus.CANCELLED } }),
      ]);

    return { pending, processing, completed, failed, cancelled };
  }

  async releaseStaleLocks(maxLockAgeMs = 60_000) {
    const cutoff = new Date(Date.now() - maxLockAgeMs);

    const result = await this.prisma.job.updateMany({
      where: {
        status: JobStatus.PROCESSING,
        lockedAt: { lt: cutoff },
      },
      data: {
        status: JobStatus.PENDING,
        lockId: null,
        lockedAt: null,
      },
    });

    if (result.count > 0) {
      this.logger.warn(`[JOBS] ${result.count} lock(s) órfão(s) liberado(s)`);
    }
  }
}