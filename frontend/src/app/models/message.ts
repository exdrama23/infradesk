import type { Role, User } from './user';

export interface Message {
  id: string;
  ticketId: string | null;
  fromUserId: string;
  toUserId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  fromUser: Pick<User, 'id' | 'name' | 'role'>;
  toUser: Pick<User, 'id' | 'name' | 'role'>;
  ticket: { id: string; title: string; status: string } | null;
}

export interface SendMessageDto {
  toUserId: string;
  ticketId?: string;
  content: string;
}

export interface CreateAccountDto {
  name: string;
  email: string;
  password: string;
  role?: 'DEV' | 'USER';
}

export interface DevSummary extends User {
  _count: { assigned: number };
}

export interface UserSummary extends User {
  _count: { tickets: number; assigned: number };
}
