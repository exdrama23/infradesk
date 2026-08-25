import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';
import { Argon2Provider } from '../auth/providers/argon2.provider';
import type { CreateAccountDto } from './dto/create-account.dto';

const PUBLIC_SELECT = { id: true, name: true, email: true, role: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Provider,
  ) {}

  async findDevs() {
    return this.prisma.user.findMany({
      where: { role: UserRole.DEV },
      select: { ...PUBLIC_SELECT, _count: { select: { assigned: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        ...PUBLIC_SELECT,
        _count: { select: { tickets: true, assigned: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async createDevAccount(dto: CreateAccountDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }

    const hashed = await this.argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashed,
        role: dto.role === 'USER' ? UserRole.USER : UserRole.DEV,
      },
      select: PUBLIC_SELECT,
    });

    return user;
  }
}