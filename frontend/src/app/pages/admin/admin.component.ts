import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HeaderComponent } from '../../components/header/header.component';
import { ApiService } from '../../services/api.service';
import { RealtimeService } from '../../services/realtime.service';
import { AuthService } from '../../services/auth.service';
import type {
  AssignTicketDto,
  CreateAccountDto,
  Message,
  ReviewTicketDto,
  SendMessageDto,
  Ticket,
  TicketPage,
  TicketStatus,
  User,
  UserSummary,
} from '../../models';
import {
  DIFFICULTY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  statusBadgeClass,
} from '../../utils/labels';
import { truncar } from '../../utils/text';

const PAGE_SIZE = 10;

type StatusFilter = 'all' | TicketStatus;

@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, HeaderComponent, DatePipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);

  private readonly destroy$ = new Subject<void>();

  protected readonly isLeader = this.auth.user()?.role === 'LIDER';

  protected readonly pageTab = signal<'solicitacoes' | 'mensagens' | 'equipe'>('solicitacoes');

  protected readonly tickets = signal<Ticket[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pendingCount = signal(0);
  protected readonly devs = signal<User[]>([]);

  protected readonly messageTickets = signal<Ticket[]>([]);

  protected readonly inbox = signal<Message[]>([]);
  protected readonly unreadCount = signal(0);

  protected readonly teamUsers = signal<UserSummary[]>([]);
  protected readonly creatingAccount = signal(false);
  protected readonly accountFeedback = signal<string | null>(null);

  protected readonly accountForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(50)]],
    role: ['DEV' as 'DEV' | 'USER', Validators.required],
  });

  protected readonly sendingMessage = signal(false);
  protected readonly messageFeedback = signal<string | null>(null);

  protected readonly messageForm = this.fb.nonNullable.group({
    ticketId: [''],
    toUserId: ['', Validators.required],
    content: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(1000)]],
  });

  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly loading = signal(false);
  protected readonly actionError = signal<string | null>(null);

  private readonly assignSelections = new Map<string, string>();

  protected readonly reviewingTicket = signal<Ticket | null>(null);
  protected readonly reviewing = signal(false);

  protected readonly viewingTicket = signal<Ticket | null>(null);

  protected readonly viewingMessage = signal<Message | null>(null);

  protected readonly activeTab = signal<'privada' | 'publica'>('privada');

  protected readonly reviewForm = this.fb.nonNullable.group({
    status: ['APROVADO' as TicketStatus, Validators.required],
    devPriority: [3, [Validators.required, Validators.min(1), Validators.max(5)]],
    devDifficulty: [3, [Validators.required, Validators.min(1), Validators.max(5)]],
    adminResponse: ['', [Validators.maxLength(1000)]],
    publicResponse: ['', [Validators.maxLength(1000)]],
    estimatedDelivery: [''],
  });

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly badgeClass = statusBadgeClass;
  protected readonly priorityOptions = [1, 2, 3, 4, 5];
  protected readonly truncar = truncar;

  protected readonly filterOptions: StatusFilter[] = [
    'all',
    'PENDENTE',
    'APROVADO',
    'REPROVADO',
    'EM_PROCESSO',
    'IMPLEMENTADO',
    'CANCELADO',
  ];

  protected get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  ngOnInit(): void {
    this.loadTickets();
    this.loadDevs();
    this.loadInbox();
    if (this.isLeader) {
      this.loadTeam();
    }

    this.realtime
      .onTicketCreated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshSilently());

    this.realtime
      .onTicketUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshSilently());

    this.realtime
      .onMessageReceived()
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        if (this.pageTab() === 'mensagens') {
          this.inbox.update((list) => [message, ...list]);
          this.api.post('/messages/read-all').subscribe({ error: () => undefined });
        } else {
          this.unreadCount.update((n) => n + 1);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(tab: 'solicitacoes' | 'mensagens' | 'equipe'): void {
    this.pageTab.set(tab);
    if (tab === 'mensagens') {
      this.api.post('/messages/read-all').subscribe({
        next: () => {
          this.unreadCount.set(0);
          this.loadInbox();
        },
        error: () => this.loadInbox(),
      });
      if (this.isLeader) {
        this.loadMessageTickets();
      }
    }
    if (tab === 'equipe') {
      this.loadTeam();
    }
  }

  private loadInbox(): void {
    this.api.get<Message[]>('/messages/inbox').subscribe({
      next: (data) => {
        this.inbox.set(data);
        if (this.pageTab() !== 'mensagens') {
          this.unreadCount.set(data.filter((m) => !m.readAt).length);
        }
      },
      error: () => undefined,
    });
  }

  private loadTeam(): void {
    this.api.get<UserSummary[]>('/users').subscribe({
      next: (data) => this.teamUsers.set(data),
      error: () => undefined,
    });
  }

  createAccount(): void {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }
    const dto: CreateAccountDto = this.accountForm.getRawValue();
    this.creatingAccount.set(true);
    this.accountFeedback.set(null);

    this.api.post<User>('/users', dto).subscribe({
      next: (user) => {
        this.creatingAccount.set(false);
        const papel = user.role === 'DEV' ? 'Desenvolvedor' : 'Usuário';
        this.accountFeedback.set(`Conta criada: ${user.name} (${user.email}) - ${papel}`);
        this.accountForm.reset({ name: '', email: '', password: '', role: 'DEV' as const });
        this.loadTeam();
        this.loadDevs();
      },
      error: () => {
        this.creatingAccount.set(false);
        this.accountFeedback.set('Falha ao criar a conta (e-mail já existe?).');
      },
    });
  }

  sendMessage(): void {
    if (this.messageForm.invalid) {
      this.messageForm.markAllAsTouched();
      return;
    }
    const raw = this.messageForm.getRawValue();
    const dto: SendMessageDto = {
      toUserId: raw.toUserId,
      ticketId: raw.ticketId || undefined,
      content: raw.content.trim(),
    };

    this.sendingMessage.set(true);
    this.messageFeedback.set(null);

    this.api.post<Message>('/messages', dto).subscribe({
      next: (message) => {
        this.sendingMessage.set(false);
        this.messageFeedback.set(`Mensagem enviada para ${message.toUser.name}.`);
        this.messageForm.reset({ ticketId: '', toUserId: '', content: '' });
        this.pinnedMessageTicket.set(null);
      },
      error: () => {
        this.sendingMessage.set(false);
        this.messageFeedback.set('Falha ao enviar a mensagem.');
      },
    });
  }

  private refreshSilently(): void {
    this.api
      .get<TicketPage>(this.buildUrl())
      .subscribe({
        next: (data) => this.applyPage(data),
        error: () => undefined,
      });
  }

  private buildUrl(): string {
    const filter = this.statusFilter();
    const statusParam = filter === 'all' ? '' : `&status=${filter}`;
    return `/tickets?page=${this.page()}&limit=${PAGE_SIZE}${statusParam}`;
  }

  private applyPage(data: TicketPage): void {
    this.tickets.set(data.items);
    this.total.set(data.total);
    if (data.pending !== undefined) {
      this.pendingCount.set(data.pending);
    }
  }

  loadTickets(): void {
    this.loading.set(true);
    this.api.get<TicketPage>(this.buildUrl()).subscribe({
      next: (data) => this.applyPage(data),
      error: () => {
        this.loading.set(false);
        this.actionError.set('Falha ao carregar as solicitações.');
      },
      complete: () => this.loading.set(false),
    });
  }

  changeFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as StatusFilter;
    this.statusFilter.set(value);
    this.page.set(1);
    this.loadTickets();
  }

  goToPage(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages || newPage === this.page()) return;
    this.page.set(newPage);
    this.loadTickets();
  }

  loadDevs(): void {
    this.api.get<User[]>('/users/devs').subscribe({
      next: (data) => this.devs.set(data),
      error: () => this.actionError.set('Falha ao carregar os desenvolvedores.'),
    });

    if (this.isLeader) {
      this.loadMessageTickets();
    }
  }

  private loadMessageTickets(): void {
    this.api.get<TicketPage>('/tickets?page=1&limit=50').subscribe({
      next: (data) => {
        const ativas = data.items.filter(
          (t) =>
            t.status !== 'IMPLEMENTADO' &&
            t.status !== 'REPROVADO' &&
            t.status !== 'CANCELADO',
        );
        const pin = this.pinnedMessageTicket();
        if (pin && !ativas.some((t) => t.id === pin.id)) {
          this.messageTickets.set([pin, ...ativas]);
        } else {
          this.messageTickets.set(ativas);
        }
        if (pin) {
          this.messageForm.patchValue({ ticketId: pin.id });
        }
      },
      error: () => undefined,
    });
  }

  onSelectDev(ticketId: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) {
      this.assignSelections.set(ticketId, value);
    }
  }

  assign(ticket: Ticket): void {
    const devId = this.assignSelections.get(ticket.id);
    if (!devId) {
      this.actionError.set(`Selecione um desenvolvedor para "${ticket.title}".`);
      return;
    }

    const dto: AssignTicketDto = { devId };
    this.actionError.set(null);

    this.api.post<Ticket>(`/tickets/${ticket.id}/assign`, dto).subscribe({
      next: () => this.loadTickets(),
      error: () => this.actionError.set('Falha ao atribuir o ticket.'),
    });
  }

  openReview(ticket: Ticket): void {
    this.reviewForm.reset({
      status: ticket.status,
      devPriority: ticket.devPriority ?? 3,
      devDifficulty: ticket.devDifficulty ?? 3,
      adminResponse: ticket.adminResponse ?? '',
      publicResponse: ticket.publicResponse ?? '',
      estimatedDelivery: ticket.estimatedDelivery ? ticket.estimatedDelivery.slice(0, 10) : '',
    });
    this.activeTab.set('privada');
    this.reviewingTicket.set(ticket);
  }

  closeReview(): void {
    this.reviewingTicket.set(null);
  }

  private readonly pinnedMessageTicket = signal<Ticket | null>(null);

  conversar(ticket: Ticket): void {
    this.pinnedMessageTicket.set(ticket);
    this.switchTab('mensagens');
    if (!this.messageTickets().some((t) => t.id === ticket.id)) {
      this.messageTickets.update((list) => [ticket, ...list]);
      this.messageForm.patchValue({ ticketId: ticket.id });
    }
  }

  openDetails(ticket: Ticket): void {
    this.viewingTicket.set(ticket);
  }

  closeDetails(): void {
    this.viewingTicket.set(null);
  }

  openMessage(message: Message): void {
    this.viewingMessage.set(message);
  }

  closeMessage(): void {
    this.viewingMessage.set(null);
  }

  protected reviewStatusOptions(ticket: Ticket): TicketStatus[] {
    switch (ticket.status) {
      case 'PENDENTE':
        return ['APROVADO', 'REPROVADO'];
      case 'APROVADO':
        return ['APROVADO', 'EM_PROCESSO', 'REPROVADO'];
      case 'EM_PROCESSO':
        return ['EM_PROCESSO', 'IMPLEMENTADO'];
      default:
        return [ticket.status];
    }
  }

  submitReview(): void {
    const ticket = this.reviewingTicket();
    if (!ticket || this.reviewForm.invalid) {
      return;
    }

    const raw = this.reviewForm.getRawValue();
    const dto: ReviewTicketDto = {
      status: raw.status,
      devPriority: Number(raw.devPriority),
      devDifficulty: Number(raw.devDifficulty),
      adminResponse: raw.adminResponse?.trim() || undefined,
      publicResponse: raw.publicResponse?.trim() || undefined,
      estimatedDelivery: raw.estimatedDelivery || undefined,
    };

    this.reviewing.set(true);
    this.actionError.set(null);

    this.api.post<Ticket>(`/tickets/${ticket.id}/review`, dto).subscribe({
      next: () => {
        this.reviewing.set(false);
        this.closeReview();
        this.loadTickets();
      },
      error: () => {
        this.reviewing.set(false);
        this.actionError.set('Falha ao analisar a solicitação.');
      },
    });
  }

  start(ticket: Ticket): void {
    this.runReview(ticket, { status: 'EM_PROCESSO' });
  }

  implement(ticket: Ticket): void {
    this.runReview(ticket, { status: 'IMPLEMENTADO' });
  }

  private runReview(ticket: Ticket, dto: ReviewTicketDto): void {
    this.actionError.set(null);
    this.api.post<Ticket>(`/tickets/${ticket.id}/review`, dto).subscribe({
      next: () => this.loadTickets(),
      error: () => this.actionError.set('Falha ao atualizar a solicitação.'),
    });
  }
}