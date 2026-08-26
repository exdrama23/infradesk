export type JobType =
  | 'TICKET_CREATED'
  | 'TICKET_ASSIGNED'
  | 'TICKET_STATUS_CHANGED'
  | 'NOTIFICATION';

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Job {
  id: number;
  type: JobType;
  status: JobStatus;
  attempts: number;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
  ticketId: number | null;
}

export interface JobStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}