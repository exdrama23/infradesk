import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from 'jose';
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

  private readonly authProvider: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;
  private readonly issuer: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.authProvider = (config.get<string>('AUTH_PROVIDER') || 'legacy').toLowerCase();
    const keycloakUrl = config.get<string>('KEYCLOAK_URL') || 'http://localhost:8081';
    const realm = config.get<string>('KEYCLOAK_REALM') || 'infradesk';
    this.issuer =
      config.get<string>('KEYCLOAK_ISSUER') || `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}`;
    const jwksUri =
      config.get<string>('KEYCLOAK_JWKS_URI') ||
      `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/certs`;
    this.jwks = this.authProvider === 'keycloak' ? createRemoteJWKSet(new URL(jwksUri)) : null;
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace('Bearer ', '') ??
        '';

      if (!token) {
        this.logger.warn(`Socket ${client.id} rejeitado: token ausente`);
        client.disconnect(true);
        return;
      }

      let payload: {
        sub: string;
        role?: UserRole;
        realm_access?: { roles?: string[] };
        email?: string;
        preferred_username?: string;
      } & Record<string, unknown>;

      try {
        const header = decodeProtectedHeader(token);
        if (header.alg === 'HS256') {
          payload = await this.jwt.verifyAsync<{
            sub: string;
            role: UserRole;
            email?: string;
          }>(token);
        } else if (this.jwks) {
          const { payload: verified } = await jwtVerify(token, this.jwks, {
            issuer: this.issuer,
          });
          payload = verified as typeof payload;
          const realmRoles = payload.realm_access?.roles ?? [];
          const role =
            payload.role ??
            (realmRoles.includes(UserRole.LIDER)
              ? UserRole.LIDER
              : realmRoles.includes(UserRole.DEV)
                ? UserRole.DEV
                : UserRole.USER);
          payload.role = role;
        } else {
          payload = await this.jwt.verifyAsync<{
            sub: string;
            role: UserRole;
            email?: string;
          }>(token);
        }
      } catch {
        if (this.authProvider === 'keycloak' && this.jwks) {
          try {
            const { payload: verified } = await jwtVerify(token, this.jwks, {
              issuer: this.issuer,
            });
            payload = verified as typeof payload;
          } catch {
            payload = await this.jwt.verifyAsync<{
              sub: string;
              role: UserRole;
              email?: string;
            }>(token);
          }
        } else {
          throw new Error('Unsupported alg');
        }
      }

      const user: GatewayUser = {
        id: payload.sub,
        role: (payload.role as UserRole) ?? UserRole.USER,
        email: payload.email ?? payload.preferred_username,
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
