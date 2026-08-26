import { computed, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { RealtimeService } from './realtime.service';
import type { AuthResponse, LoginDto, User } from '../models';

interface StoredAuth {
  accessToken: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly STORAGE_KEY = 'infradesk_auth';

  private readonly authState = signal<StoredAuth | null>(this.readStorage());

  private refreshInFlight$: Observable<AuthResponse> | null = null;

  readonly user = computed<User | null>(() => this.authState()?.user ?? null);
  readonly token = computed<string | null>(() => this.authState()?.accessToken ?? null);
  readonly role = computed<string | null>(() => this.authState()?.user.role ?? null);

  constructor(private readonly api: ApiService, private readonly realtime: RealtimeService) {
    this.realtime.setTokenProvider(() => this.token());
    if (this.token()) {
      this.realtime.connect();
    }
  }

  login(credentials: LoginDto) {
    return this.api
      .post<AuthResponse>('/auth/login', credentials)
      .pipe(tap((res) => this.setSession(res)));
  }

  isAuthenticated(): boolean {
    return this.authState() !== null;
  }

  refreshSession(): Observable<AuthResponse> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.api.post<AuthResponse>('/auth/refresh').pipe(
        tap((res) => this.setSession(res)),
      );
      this.refreshInFlight$.subscribe({
        complete: () => (this.refreshInFlight$ = null),
        error: () => (this.refreshInFlight$ = null),
      });
    }
    return this.refreshInFlight$;
  }

  setSession(response: AuthResponse): void {
    const stored: StoredAuth = {
      accessToken: response.accessToken,
      user: response.user,
    };
    localStorage.setItem(AuthService.STORAGE_KEY, JSON.stringify(stored));
    this.authState.set(stored);
    this.realtime.disconnect();
    this.realtime.connect();
  }

  clearSession(): void {
    localStorage.removeItem(AuthService.STORAGE_KEY);
    this.authState.set(null);
    this.realtime.disconnect();
  }

  logout(): void {
    this.api.post('/auth/logout').subscribe({ error: () => undefined });
    this.clearSession();
  }

  private readStorage(): StoredAuth | null {
    try {
      const raw = localStorage.getItem(AuthService.STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as StoredAuth;
      if (!parsed.accessToken || !parsed.user?.role) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}