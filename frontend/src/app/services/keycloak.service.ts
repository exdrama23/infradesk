import { Injectable } from '@angular/core';
import Keycloak from 'keycloak-js';
import { environment } from '../../environments/environment';
import type { User } from '../models';

@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private instance: Keycloak | null = null;
  private initialized = false;
  private initPromise: Promise<boolean> | null = null;

  private getConfig() {
    return environment.keycloak;
  }

  isEnabled(): boolean {
    return environment.authProvider === 'keycloak';
  }

  getInstance(): Keycloak | null {
    return this.instance;
  }

  async init(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    const cfg = this.getConfig();
    this.instance = new Keycloak({
      url: cfg.url,
      realm: cfg.realm,
      clientId: cfg.clientId,
    });

    this.initPromise = this.instance
      .init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        this.initialized = true;
        if (authenticated) {
          this.scheduleRefresh();
        }
        return authenticated;
      })
      .catch(() => {
        this.initialized = true;
        return false;
      });

    return this.initPromise;
  }

  async login(): Promise<void> {
    if (!this.instance) await this.init();
    await this.instance?.login();
  }

  async logout(): Promise<void> {
    if (!this.instance) return;
    await this.instance.logout({ redirectUri: window.location.origin + '/login' });
  }

  async getToken(): Promise<string | null> {
    if (!this.instance?.authenticated) return null;
    try {
      await this.instance.updateToken(30);
    } catch {
      return null;
    }
    return this.instance.token ?? null;
  }

  getTokenSync(): string | null {
    return this.instance?.token ?? null;
  }

  isAuthenticated(): boolean {
    return !!this.instance?.authenticated;
  }

  getUser(): User | null {
    const tokenParsed = this.instance?.tokenParsed as
      | {
          sub?: string;
          email?: string;
          preferred_username?: string;
          name?: string;
          given_name?: string;
          family_name?: string;
          realm_access?: { roles?: string[] };
          role?: string;
        }
      | undefined;

    if (!tokenParsed?.sub) return null;

    const email = (tokenParsed.email ?? tokenParsed.preferred_username ?? '').toLowerCase();
    const rawRoles = tokenParsed.realm_access?.roles ?? [];
    const role = (['LIDER', 'DEV', 'USER'] as const).find((r) => rawRoles.includes(r)) ?? (tokenParsed.role as User['role'] | undefined) ?? 'USER';
    const name =
      tokenParsed.name ??
      [tokenParsed.given_name, tokenParsed.family_name].filter(Boolean).join(' ') ??
      email.split('@')[0] ??
      'Usuário';

    return {
      id: tokenParsed.sub,
      email,
      name: name.slice(0, 100),
      role: role as User['role'],
    };
  }

  private scheduleRefresh(): void {
    setInterval(async () => {
      if (!this.instance?.authenticated) return;
      try {
        await this.instance.updateToken(70);
      } catch {
        await this.instance?.logout();
      }
    }, 60_000);
  }
}