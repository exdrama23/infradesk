import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { WorkerService } from './worker.service';
import { JobsController } from './jobs.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    WorkerService,
    {
      provide: 'WORKER_OPTIONS',
      useValue: {
        pollIntervalMs: +(process.env.WORKER_POLL_INTERVAL_MS ?? 3000),
        concurrency: +(process.env.WORKER_MAX_CONCURRENCY ?? 2),
      },
    },
  ],
  exports: [JobsService],
})
export class JobsModule {}