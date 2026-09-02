import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { KeycloakSyncService } from './keycloak-sync.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, KeycloakSyncService],
  exports: [UsersService],
})
export class UsersModule {}
