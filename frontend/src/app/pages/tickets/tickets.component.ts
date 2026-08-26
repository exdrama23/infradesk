import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HeaderComponent } from '../../components/header/header.component';
import { ApiService } from '../../services/api.service';
import { RealtimeService } from '../../services/realtime.service';
import { AuthService } from '../../services/auth.service';
import type { CreateTicketDto, Ticket, TicketPage } from '../../models';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  statusBadgeClass,
} from '../../utils/labels';
import { truncar } from '../../utils/text';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-tickets',
  imports: [ReactiveFormsModule, HeaderComponent, DatePipe],
  templateUrl: './tickets.html',
  styleUrl: './tickets.css',
})
export class TicketsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);

  private readonly destroy$ = new Subject<void>();

  protected readonly tickets = signal<Ticket[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedTicket = signal<Ticket | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: [
      '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(150)],
    ],
    description: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(3000)],
    ],
    userPriority: [3, [Validators.required, Validators.min(1), Validators.max(5)]],
  });

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorityOptions = [1, 2, 3, 4, 5];
  protected readonly badgeClass = statusBadgeClass;
  protected readonly truncar = truncar;

  protected get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  ngOnInit(): void {
    this.loadTickets();

    this.realtime
      .onTicketUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ ticket, action }) => {
        if (ticket.userId !== this.auth.user()?.id) return;
        if (this.selectedTicket()?.id === ticket.id) {
          this.selectedTicket.set(ticket);
        }
        this.refreshSilently();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private refreshSilently(): void {
    this.api.get<TicketPage>(`/tickets?page=${this.page()}&limit=${PAGE_SIZE}`).subscribe({
      next: (data) => {
        this.tickets.set(data.items);
        this.total.set(data.total);
      },
      error: () => undefined,
    });
  }

  loadTickets(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.api.get<TicketPage>(`/tickets?page=${this.page()}&limit=${PAGE_SIZE}`).subscribe({
      next: (data) => {
        this.tickets.set(data.items);
        this.total.set(data.total);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Falha ao carregar os tickets. Tente novamente.');
      },
      complete: () => this.loading.set(false),
    });
  }

  goToPage(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages || newPage === this.page()) return;
    this.page.set(newPage);
    this.loadTickets();
  }

  openDetails(ticket: Ticket): void {
    this.selectedTicket.set(ticket);
  }

  closeDetails(): void {
    this.selectedTicket.set(null);
  }

  protected canCancel(ticket: Ticket): boolean {
    return ticket.status === 'PENDENTE' || ticket.status === 'APROVADO';
  }

  protected readonly confirmingCancel = signal<Ticket | null>(null);

  askCancel(ticket: Ticket): void {
    if (!this.canCancel(ticket) || this.cancelling()) return;
    this.confirmingCancel.set(ticket);
  }

  closeCancelConfirm(): void {
    if (this.cancelling()) return;
    this.confirmingCancel.set(null);
  }

  confirmCancel(): void {
    const ticket = this.confirmingCancel();
    if (!ticket || !this.canCancel(ticket) || this.cancelling()) return;

    this.cancelling.set(true);
    this.api.post<Ticket>(`/tickets/${ticket.id}/cancel`).subscribe({
      next: (updated) => {
        this.cancelling.set(false);
        this.confirmingCancel.set(null);
        if (this.selectedTicket()?.id === updated.id) {
          this.selectedTicket.set(updated);
        }
        this.refreshSilently();
      },
      error: () => {
        this.cancelling.set(false);
        this.confirmingCancel.set(null);
        alert('Não foi possível cancelar a solicitação. Tente novamente.');
      },
    });
  }

  createTicket(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const dto: CreateTicketDto = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      userPriority: Number(raw.userPriority),
    };

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.api.post<Ticket>('/tickets', dto).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form.reset({ title: '', description: '', userPriority: 3 });
        if (this.page() !== 1) this.page.set(1);
        this.loadTickets();
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Falha ao criar o ticket. Tente novamente.');
      },
    });
  }
}