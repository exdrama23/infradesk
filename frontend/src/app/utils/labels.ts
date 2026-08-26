import type { TicketStatus, JobType, JobStatus } from '../models';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  EM_PROCESSO: 'Em processo',
  IMPLEMENTADO: 'Implementado',
  CANCELADO: 'Cancelado',
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Média',
  4: 'Alta',
  5: 'Urgente',
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Trivial',
  2: 'Fácil',
  3: 'Média',
  4: 'Difícil',
  5: 'Muito difícil',
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  TICKET_CREATED: 'Ticket criado',
  TICKET_ASSIGNED: 'Ticket atribuído',
  TICKET_STATUS_CHANGED: 'Status alterado',
  NOTIFICATION: 'Notificação',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export function statusBadgeClass(status: TicketStatus): string {
  return `badge-${status.toLowerCase().replace(/_/g, '-')}`;
}

export function jobStatusBadgeClass(status: JobStatus): string {
  return `badge-job-${status}`;
}