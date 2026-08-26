import type { Role, User } from './user';

export type TicketStatus =
  | 'PENDENTE'
  | 'APROVADO'
  | 'REPROVADO'
  | 'EM_PROCESSO'
  | 'IMPLEMENTADO'
  | 'CANCELADO';

export interface Ticket {
  id: string;
  userId: string;
  title: string;
  description: string;
  userPriority: number;
  devId: string | null;
  devRole: Role | null;
  devPriority: number | null;
  devDifficulty: number | null;
  status: TicketStatus;
  adminResponse: string | null;
  publicResponse: string | null;
  estimatedDelivery: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  user: User;
  dev: User | null;
}

export interface TicketPage {
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
  pending?: number;
}

export interface CreateTicketDto {
  title: string;
  description: string;
  userPriority: number;
}

export interface AssignTicketDto {
  devId: string;
}

export interface ReviewTicketDto {
  status: TicketStatus;
  devPriority?: number;
  devDifficulty?: number;
  adminResponse?: string;
  publicResponse?: string;
  estimatedDelivery?: string;
}