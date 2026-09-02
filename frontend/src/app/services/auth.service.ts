import { computed, Injectable, signal } from '@angular/core';
import { Observable, tap, from, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import { RealtimeService } from './realtime.service';
import { KeycloakService } from './keycloak.service';
import { environment } from '../../environments/environment';
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
  private keycloakReady = false;

  readonly user = computed<User | null>(() => {
    if (environment.authProvider === 'keycloak') {
      return this.keycloak.getUser();
    }
    return this.authState()?.user ?? null;
  });

  readonly token = computed<string | null>(() => {
    if (environment.authProvider === 'keycloak') {
      return this.keycloak.getTokenSync();
    }
    return this.authState()?.accessToken ?? null;
  });

  readonly role = computed<string | null>(() => this.user()?.role ?? null);

  constructor(
    private readonly api: ApiService,
    private readonly realtime: RealtimeService,
    private readonly keycloak: KeycloakService,
  ) {
    if (environment.authProvider === 'keycloak') {
      this.realtime.setTokenProvider(() => this.keycloak.getTokenSync());
      this.keycloak.init().then((authenticated) => {
        this.keycloakReady = true;
        if (authenticated) this.realtime.connect();
      });
    } else {
      this.realtime.setTokenProvider(() => this.token());
      if (this.token()) {
        this.realtime.connect();
      }
    }
  }

  login(credentials: LoginDto) {
    if (environment.authProvider === 'keycloak') {
      return from(this.keycloak.login()).pipe(switchMap(() => new Observable<AuthResponse>(() => {})));
    }
    return this.api.post<AuthResponse>('/auth/login', credentials).pipe(tap((res) => this.setSession(res)));
  }

  loginWithKeycloak(): Promise<void> {
    return this.keycloak.login();
  }

  isAuthenticated(): boolean {
    if (environment.authProvider === 'keycloak') {
      return this.keycloak.isAuthenticated();
    }
    return this.authState() !== null;
  }

  refreshSession(): Observable<AuthResponse> {
    if (environment.authProvider === 'keycloak') {
      return from(this.keycloak.getToken().then((t) => ({ accessToken: t ?? '', user: this.keycloak.getUser()! }))) as unknown as Observable<AuthResponse>;
    }
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.api.post<AuthResponse>('/auth/refresh').pipe(tap((res) => this.setSession(res)));
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
    if (environment.authProvider === 'keycloak') {
      this.clearSession();
      this.keycloak.logout();
      return;
    }
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