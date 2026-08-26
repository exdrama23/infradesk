import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import type { JobStats, Message, Ticket } from '../models';
import { environment } from '../../environments/environment';

export interface RealtimeTicketPayload {
  ticket: Ticket;
  action: string;
}

export interface RealtimeJobPayload {
  jobId: string;
  type: string;
  status: string;
  ticketId: string | null;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private readonly socketUrl = environment.wsUrl;
  private readonly namespace = '/realtime';

  private socket: Socket | null = null;

  private readonly ticketCreated$ = new Subject<RealtimeTicketPayload>();
  private readonly ticketUpdated$ = new Subject<RealtimeTicketPayload>();
  private readonly jobProcessed$ = new Subject<RealtimeJobPayload>();
  private readonly jobStatsChanged$ = new Subject<JobStats>();
  private readonly messageReceived$ = new Subject<Message>();

  private tokenProvider: () => string | null = () => null;

  setTokenProvider(provider: () => string | null): void {
    this.tokenProvider = provider;
  }

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(`${this.socketUrl}${this.namespace}`, {
      auth: (cb) => cb({ token: this.tokenProvider() }),
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('ticket.created', (payload: RealtimeTicketPayload) =>
      this.ticketCreated$.next(payload),
    );
    this.socket.on('ticket.updated', (payload: RealtimeTicketPayload) =>
      this.ticketUpdated$.next(payload),
    );
    this.socket.on('job.processed', (payload: RealtimeJobPayload) =>
      this.jobProcessed$.next(payload),
    );
    this.socket.on('job.stats.changed', (stats: JobStats) => this.jobStatsChanged$.next(stats));
    this.socket.on('message.received', (message: Message) => this.messageReceived$.next(message));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  onTicketCreated(): Observable<RealtimeTicketPayload> {
    return this.ticketCreated$.asObservable();
  }

  onTicketUpdated(): Observable<RealtimeTicketPayload> {
    return this.ticketUpdated$.asObservable();
  }

  onJobProcessed(): Observable<RealtimeJobPayload> {
    return this.jobProcessed$.asObservable();
  }

  onJobStatsChanged(): Observable<JobStats> {
    return this.jobStatsChanged$.asObservable();
  }

  onMessageReceived(): Observable<Message> {
    return this.messageReceived$.asObservable();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
