import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { JobsModule } from '../jobs/jobs.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [JobsModule, RealtimeModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}