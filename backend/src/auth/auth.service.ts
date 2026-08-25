import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';
import { Argon2Provider } from './providers/argon2.provider';
import { SessionProvider } from './providers/session.provider';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
    constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly argon2: Argon2Provider,
    private readonly sessions: SessionProvider,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta = {}) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (exists) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }

    const passwordHash = await this.argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        password: passwordHash,
        role: dto.role ?? UserRole.USER,
      },
    });

    return this.issueTokens(user, meta);
  }

  async login(dto: LoginDto, meta: RequestMeta = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.password.startsWith('$2')) {
        const bcryptOk = await bcrypt.compare(dto.password, user.password);
        if (!bcryptOk) {
            throw new UnauthorizedException('Credenciais inválidas');
        }
        const upgraded = await this.argon2.hash(dto.password);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { password: upgraded },
        });
        } else {
        const argonOk = await this.argon2.verify(user.password, dto.password);
        if (!argonOk) {
            throw new UnauthorizedException('Credenciais inválidas');
        }
        }

        return this.issueTokens(user, meta);
    }

    async refresh(refreshToken: string | undefined, meta: RequestMeta = {}) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const rotated = await this.sessions.rotate(refreshToken, meta);
    if (!rotated) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return {
      ...this.signAccessToken(user),
      refreshToken: rotated.newRefreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.sessions.revoke(refreshToken);
    }
  }

  private signAccessToken(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  private async issueTokens(
    user: { id: string; name: string; email: string; role: UserRole },
    meta: RequestMeta,
  ) {
    const refreshToken = this.sessions.generateRefreshToken();
    await this.sessions.create(user.id, refreshToken, meta);

    return {
      ...this.signAccessToken(user),
      refreshToken,
    };
  }
}