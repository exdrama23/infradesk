import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsGateway, REALTIME_EVENTS } from '../realtime/tickets.gateway';
import { randomUUID } from 'crypto';
// import { error } from 'console';

export interface WorkerOptions {
  pollIntervalMs?: number;
  concurrency?: number;
  workerId?: string;
}

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly concurrency: number;
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
    private readonly realtime: TicketsGateway,
    @Optional() @Inject('WORKER_OPTIONS') options?: WorkerOptions,
  ) {
    this.workerId = options?.workerId ?? randomUUID();
    this.pollIntervalMs = options?.pollIntervalMs ?? +(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
    this.concurrency = options?.concurrency ?? +(process.env.WORKER_MAX_CONCURRENCY ?? 2);
  }

  async onModuleInit() {
    if (process.env.WORKER_ENABLED !== 'false') {
      this.start();
    } else {
      this.logger.log(`Worker ${this.workerId} desabilitado (WORKER_ENABLED=false)`);
    }
  }

  async onModuleDestroy() {
    this.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;

    this.logger.log(
      `Worker ${this.workerId} iniciado (poll=${this.pollIntervalMs}ms, concurrency=${this.concurrency})`,
    );

    // for (let i = 0; i < this.concurrency; i++) {
    //   this.timers.push(setInterval(() => void this.processLoop(), this.pollIntervalMs));
    // }

    this.timers.push(setInterval(() => void this.jobs.releaseStaleLocks(), 30_000));
  }

  stop() {
    this.running = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.logger.log(`Worker ${this.workerId} parado`);
  }

  private async processLoop() {
    if (!this.running) return;

    try {
      const job = await this.jobs.claimNext(this.workerId);

      if (!job) return; 

      this.logger.log(`[WORKER] Job ${job.id} (${job.type}) processando...`);

      const result = await this.process(job);

      await this.jobs.complete(job.id, result);
      this.logger.log(`[WORKER] Job ${job.id} concluído`);

      this.realtime.emitToDevs(REALTIME_EVENTS.jobProcessed, {
        jobId: job.id,
        type: job.type,
        status: 'COMPLETED',
        ticketId: job.ticketId,
      });

      try {
        const stats = await this.jobs.getStats();
        this.realtime.emitToDevs(REALTIME_EVENTS.jobStatsChanged, stats);
      } catch (error) {
        this.logger.warn(
          `[JOBS] Falha ao atualizar estatísticas em tempo real`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[WORKER] Erro no loop: ${message}`);
    }
  }

  private async process(job: {
    id: string;
    type: JobType;
    payload: Record<string, unknown>;
    ticketId: string | null;
  }): Promise<Record<string, unknown>> {
    switch (job.type) {
      case JobType.TICKET_CREATED: {
        this.logger.log(`[WORKER] Ticket criado — notificando equipe DEV`);
        return { notified: true, at: new Date().toISOString() };
      }

      case JobType.TICKET_STATUS_CHANGED: {
        if (job.ticketId) {
          const ticket = await this.prisma.ticket.findUnique({
            where: { id: job.ticketId },
            include: { user: { select: { id: true, name: true, email: true } } },
          });

          this.logger.log(
            `[WORKER] Status do ticket ${job.ticketId} alterado -> notificando ${ticket?.user.email ?? '?'}`,
          );
          return {
            notifiedUser: ticket?.user.email ?? null,
            status: job.payload.status,
            at: new Date().toISOString(),
          };
        }
        return {};
      }

      case JobType.TICKET_ASSIGNED: {
        this.logger.log(`[WORKER] Ticket atribuído a DEV — enviando notificação`);
        return { assignedTo: job.payload.devEmail ?? null, at: new Date().toISOString() };
      }

      case JobType.NOTIFICATION: {
        this.logger.log(`[WORKER] Notificação genérica processada`);
        return { delivered: true, at: new Date().toISOString() };
      }

      default:
        return { unknownType: true };
    }
  }
}