import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../generated/prisma/client';

export interface GatewayUser {
  id: string;
  role: UserRole;
  name?: string;
  email?: string;
}

export const REALTIME_EVENTS = {
  ticketCreated: 'ticket.created',
  ticketUpdated: 'ticket.updated',
  jobProcessed: 'job.processed',
  jobStatsChanged: 'job.stats.changed',
  messageReceived: 'message.received',
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

@WebSocketGateway({
  cors: {
    origin: true, 
    credentials: true,
  },
  namespace: '/realtime',
})
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TicketsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');

      if (!token) {
        this.logger.warn(`Socket ${client.id} rejeitado: token ausente`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<{ sub: string; role: UserRole; email?: string }>(token);

      const user: GatewayUser = {
        id: payload.sub,
        role: payload.role,
        email: payload.email,
      };

      await client.join(`role:${user.role}`);
      await client.join(`user:${user.id}`);
      client.data.user = user;

      this.logger.debug(`Socket ${client.id} conectado: ${user.email} (${user.role})`);
    } catch (err) {
      this.logger.warn(`Socket ${client.id} rejeitado: token inválido (${(err as Error).message})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket ${client.id} desconectado`);
  }

  emitToDevs(event: RealtimeEvent, payload: unknown): void {
    this.server.to('role:DEV').emit(event, payload);
  }

  emitToUser(userId: string, event: RealtimeEvent, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  broadcast(event: RealtimeEvent, payload: unknown): void {
    this.server.emit(event, payload);
  }
}