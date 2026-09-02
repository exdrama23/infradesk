import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsGateway, REALTIME_EVENTS } from '../realtime/tickets.gateway';
import { UserRole } from '../generated/prisma/client';
import type { SendMessageDto } from './dto/send-message.dto';

const MESSAGE_INCLUDE = {
  fromUser: { select: { id: true, name: true, role: true } },
  toUser: { select: { id: true, name: true, role: true } },
  ticket: { select: { id: true, title: true, status: true } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: TicketsGateway,
  ) {}

  async send(fromUserId: string, dto: SendMessageDto) {
    const toUser = await this.prisma.user.findUnique({
      where: { id: dto.toUserId },
    });
    if (!toUser) {
      throw new NotFoundException('Destinatário não encontrado');
    }
    if (toUser.role !== UserRole.DEV) {
      throw new NotFoundException('Destinatário deve ser um DEV');
    }

    if (dto.ticketId) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: dto.ticketId },
      });
      if (!ticket) {
        throw new NotFoundException('Tarefa não encontrada');
      }
    }

    const message = await this.prisma.message.create({
      data: {
        ticketId: dto.ticketId ?? null,
        fromUserId,
        toUserId: dto.toUserId,
        content: dto.content.trim(),
      },
      include: MESSAGE_INCLUDE,
    });

    this.realtime.emitToUser(
      dto.toUserId,
      REALTIME_EVENTS.messageReceived,
      message,
    );

    return message;
  }

  inbox(userId: string) {
    return this.prisma.message.findMany({
      where: { toUserId: userId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  sent(fromUserId: string) {
    return this.prisma.message.findMany({
      where: { fromUserId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.message.updateMany({
      where: { toUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async updateMessage(messageId: string, fromUserId: string, content: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Mensagem não encontrada');
    if (msg.fromUserId !== fromUserId) throw new ForbiddenException('Só o remetente pode editar');
    return this.prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim() },
      include: MESSAGE_INCLUDE,
    });
  }

  async sessionsForLeader(leaderId: string) {
    const sent = await this.prisma.message.findMany({
      where: { fromUserId: leaderId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const byDev = new Map<string, { dev: { id: string; name: string; role: string }; messages: typeof sent }>();
    for (const m of sent) {
      const key = m.toUserId;
      if (!byDev.has(key)) byDev.set(key, { dev: m.toUser, messages: [] });
      byDev.get(key)!.messages.push(m);
    }
    return Array.from(byDev.values());
  }
}