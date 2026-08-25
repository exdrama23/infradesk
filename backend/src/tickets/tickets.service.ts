import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { TicketsGateway, REALTIME_EVENTS } from '../realtime/tickets.gateway';
import { TicketStatus, UserRole, JobType } from '../generated/prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { DevReviewDto } from './dto/dev-review.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';

interface AuthUser {
    id: string;
    role: UserRole;
    name?: string;
    email?: string;
}

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
    [TicketStatus.PENDENTE]: [TicketStatus.APROVADO, TicketStatus.REPROVADO, TicketStatus.CANCELADO],
    [TicketStatus.APROVADO]: [
        TicketStatus.EM_PROCESSO,
        TicketStatus.REPROVADO,
        TicketStatus.CANCELADO,
    ],
    [TicketStatus.EM_PROCESSO]: [TicketStatus.IMPLEMENTADO],
    [TicketStatus.REPROVADO]: [],
    [TicketStatus.IMPLEMENTADO]: [],
    [TicketStatus.CANCELADO]: [],
};

@Injectable()
export class TicketsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jobs: JobsService,
        private readonly realtime: TicketsGateway,
    ) { }

    async create(user: AuthUser, dto: CreateTicketDto) {
        const ticket = await this.prisma.ticket.create({
            data: {
                userId: user.id,
                title: dto.title,
                description: dto.description,
                userPriority: dto.userPriority,
            },
        });

        await this.jobs.enqueue(
            JobType.TICKET_CREATED,
            { ticketId: ticket.id, title: ticket.title, userEmail: user.email },
            { ticketId: ticket.id },
        );

        const created = await this.findById(ticket.id, user);
        this.realtime.emitToDevs(REALTIME_EVENTS.ticketCreated, {
            ticket: created,
            action: 'created',
        });
        return created;
    }

      async findAll(
    user: AuthUser,
    options: { page?: number; limit?: number; status?: TicketStatus } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 10));

    const where = {
      ...(user.role === UserRole.USER ? { userId: user.id } : {}),
      ...(options.status ? { status: options.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          dev: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    const pending =
      user.role === UserRole.DEV || user.role === UserRole.LIDER
        ? await this.prisma.ticket.count({ where: { status: TicketStatus.PENDENTE } })
        : undefined;

    return {
      items,
      total,
      page,
      limit,
      pending,
    };
  }

  async findById(id: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        dev: { select: { id: true, name: true, email: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado');
    }

    if (user.role === UserRole.USER && ticket.userId !== user.id) {
      throw new ForbiddenException('Você só pode acessar os seus próprios tickets');
    }

    return ticket;
  }

  async assign(dev: AuthUser, ticketId: string, dto: AssignTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado');
    }

    const FINAL_STATES: TicketStatus[] = [
      TicketStatus.IMPLEMENTADO,
      TicketStatus.REPROVADO,
      TicketStatus.CANCELADO,
    ];
    if (FINAL_STATES.includes(ticket.status)) {
      throw new BadRequestException(
        `Não é possível atribuir uma solicitação ${ticket.status}`,
      );
    }

    const targetDev = await this.prisma.user.findUnique({
      where: { id: dto.devId },
    });

    if (!targetDev || targetDev.role !== UserRole.DEV) {
      throw new BadRequestException('O usuário informado não é um desenvolvedor');
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        devId: targetDev.id,
        devRole: UserRole.DEV, 
      },
      include: { user: true, dev: true },
    });

    await this.jobs.enqueue(
      JobType.TICKET_ASSIGNED,
      { ticketId, devId: targetDev.id, devEmail: targetDev.email },
      { ticketId },
    );

    this.realtime.emitToDevs(REALTIME_EVENTS.ticketUpdated, {
      ticket: updated,
      action: 'assigned',
    });
    this.realtime.emitToUser(updated.userId, REALTIME_EVENTS.ticketUpdated, {
      ticket: updated,
      action: 'assigned',
    });

    return updated;
  }

  async review(dev: AuthUser, ticketId: string, dto: DevReviewDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado');
    }

    if (ALLOWED_TRANSITIONS[ticket.status].length === 0) {
      throw new BadRequestException(
        `Solicitação ${ticket.status} está finalizada e não pode mais ser editada`,
      );
    }

    if (dto.status && dto.status !== ticket.status) {
      const allowed = ALLOWED_TRANSITIONS[ticket.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Transição de status inválida: ${ticket.status} -> ${dto.status}`,
        );
      }
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        devPriority: dto.devPriority ?? ticket.devPriority,
        devDifficulty: dto.devDifficulty ?? ticket.devDifficulty,
        status: dto.status ?? ticket.status,
        adminResponse: dto.adminResponse ?? ticket.adminResponse,
        publicResponse: dto.publicResponse ?? ticket.publicResponse,
        estimatedDelivery: dto.estimatedDelivery
          ? new Date(dto.estimatedDelivery)
          : ticket.estimatedDelivery,
      },
      include: { user: true, dev: true },
    });

    if (dto.status && dto.status !== ticket.status) {
      await this.jobs.enqueue(
        JobType.TICKET_STATUS_CHANGED,
        { ticketId, from: ticket.status, to: dto.status },
        { ticketId },
      );
    }

    this.realtime.emitToDevs(REALTIME_EVENTS.ticketUpdated, {
      ticket: updated,
      action: 'reviewed',
    });
    this.realtime.emitToUser(updated.userId, REALTIME_EVENTS.ticketUpdated, {
      ticket: updated,
      action: 'reviewed',
    });

    return updated;
  }

  async cancel(user: AuthUser, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado');
    }

    if (ticket.userId !== user.id) {
      throw new ForbiddenException('Você só pode cancelar os seus próprios tickets');
    }

    if (!ALLOWED_TRANSITIONS[ticket.status].includes(TicketStatus.CANCELADO)) {
      throw new BadRequestException(
        `Não é possível cancelar uma solicitação ${ticket.status}`,
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.CANCELADO },
      include: { user: true, dev: true },
    });

    await this.jobs.enqueue(
      JobType.TICKET_STATUS_CHANGED,
      { ticketId, from: ticket.status, to: TicketStatus.CANCELADO },
      { ticketId },
    );

    this.realtime.emitToDevs(REALTIME_EVENTS.ticketUpdated, {
      ticket: updated,
      action: 'cancelled',
    });
    this.realtime.emitToUser(updated.userId, REALTIME_EVENTS.ticketUpdated, {
      ticket: updated,
      action: 'cancelled',
    });

    return updated;
  }
}
