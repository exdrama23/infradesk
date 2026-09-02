import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../../generated/prisma/client';

export interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  role?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

const VALID_ROLES: UserRole[] = [UserRole.USER, UserRole.DEV, UserRole.LIDER];

function extractRole(payload: JwtPayload): UserRole {
  if (payload.role && VALID_ROLES.includes(payload.role as UserRole)) {
    return payload.role as UserRole;
  }
  const realmRoles = payload.realm_access?.roles ?? [];
  for (const r of VALID_ROLES) {
    if (realmRoles.includes(r)) return r;
  }
  if ((payload as unknown as { role?: string }).role) {
    const legacy = (payload as unknown as { role: string }).role;
    if (VALID_ROLES.includes(legacy as UserRole)) return legacy as UserRole;
  }
  return UserRole.USER;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly authProvider: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const provider = (config.get<string>('AUTH_PROVIDER') || 'legacy').toLowerCase();
    const isKeycloak = provider === 'keycloak';
    const keycloakUrl = config.get<string>('KEYCLOAK_URL') || 'http://localhost:8081';
    const realm = config.get<string>('KEYCLOAK_REALM') || 'infradesk';
    const jwksUri =
      config.get<string>('KEYCLOAK_JWKS_URI') ||
      `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/certs`;
    const issuer = config.get<string>('KEYCLOAK_ISSUER') || `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}`;
    const legacySecret = config.get<string>('JWT_SECRET') || 'dev-secret';

    const jwksProvider = passportJwtSecret({
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri,
    });

    const dualProvider = isKeycloak
      ? (req: unknown, token: string, done: (err: unknown, key?: string) => void) => {
          try {
            const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
            if (header.alg === 'HS256') {
              return done(null, legacySecret);
            }
          } catch {}
          return (jwksProvider as unknown as (r: unknown, t: string, d: unknown) => void)(req, token, done);
        }
      : undefined;

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.cookies?.accessToken ?? null,
      ]),
      ignoreExpiration: false,
      ...(isKeycloak
        ? {
            secretOrKeyProvider: dualProvider,
            algorithms: ['RS256', 'HS256'],
          }
        : {
            secretOrKey: legacySecret,
          }),
      passReqToCallback: false,
    } as never);

    (this as unknown as { authProvider: string }).authProvider = provider;
    this.authProvider = provider;

    if (isKeycloak) {
      Logger.log(`AuthProvider=keycloak | JWKS=${jwksUri} | issuer=${issuer} | dual HS256+RS256`, JwtStrategy.name);
    } else {
      Logger.log('AuthProvider=legacy (JWT_SECRET)', JwtStrategy.name);
    }
  }

  async validate(payload: JwtPayload) {
    const email = (payload.email ?? payload.preferred_username ?? '').toLowerCase();
    const role = extractRole(payload);
    const name =
      payload.name ??
      [payload.given_name, payload.family_name].filter(Boolean).join(' ') ??
      email.split('@')[0] ??
      'Usuário';

    let user = null as unknown as { id: string; name: string; email: string; role: UserRole; isActive: boolean } | null;

    if (email) {
      user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
    }

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
    }

    if (user && (user as unknown as { isActive: boolean }).isActive === false) {
      return null;
    }

    if (!user && this.authProvider === 'keycloak' && email) {
      this.logger.log(`JIT provisioning: criando usuário ${email} role=${role} sub=${payload.sub}`);
      try {
        user = await this.prisma.user.create({
          data: {
            id: payload.sub,
            name: name.slice(0, 100),
            email,
            password: 'KEYCLOAK_MANAGED',
            role,
          },
          select: { id: true, name: true, email: true, role: true, isActive: true },
        });
      } catch {
        user = await this.prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true, isActive: true },
        });
        if (!user) {
          user = await this.prisma.user.create({
            data: { name: name.slice(0, 100), email, password: 'KEYCLOAK_MANAGED', role },
            select: { id: true, name: true, email: true, role: true, isActive: true },
          });
        }
      }
      return user;
    }

    if (!user) {
      this.logger.warn(`Token válido mas usuário não encontrado sub=${payload.sub} email=${email}`);
      return null;
    }

    if (this.authProvider === 'keycloak' && user.role !== role) {
      this.logger.log(`Sincronizando role ${user.email}: ${user.role} -> ${role}`);
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
    }

    return user;
  }
}
