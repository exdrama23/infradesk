import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';
import { Argon2Provider } from '../auth/providers/argon2.provider';
import { KeycloakSyncService } from './keycloak-sync.service';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Provider,
    private readonly keycloakSync: KeycloakSyncService,
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

    await this.keycloakSync.createUser({ email, name: dto.name.trim(), password: dto.password, role: user.role });

    return user;
  }

  async updateAccount(id: string, dto: UpdateAccountDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.role) data.role = dto.role as UserRole;
    if (dto.password) data.password = await this.argon2.hash(dto.password);
    if ((dto as unknown as { isActive?: boolean }).isActive !== undefined) data.isActive = (dto as unknown as { isActive: boolean }).isActive;
    if (Object.keys(data).length === 0) throw new NotFoundException('Nada para atualizar');
    const updated = await this.prisma.user.update({ where: { id }, data, select: PUBLIC_SELECT });
    await this.keycloakSync.updateUser({ email: existing.email, password: dto.password, role: dto.role });
    if ((dto as unknown as { isActive?: boolean }).isActive !== undefined) {
      await this.keycloakSync.setEnabled(existing.email, (dto as unknown as { isActive: boolean }).isActive);
    }
    return updated;
  }

  async toggleActive(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: !existing.isActive }, select: PUBLIC_SELECT });
    await this.keycloakSync.setEnabled(existing.email, updated.isActive);
    return updated;
  }
}