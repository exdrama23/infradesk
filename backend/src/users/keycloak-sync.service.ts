import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeycloakSyncService {
  private readonly logger = new Logger(KeycloakSyncService.name);
  private readonly enabled: boolean;
  private readonly keycloakUrl: string;
  private readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPass: string;

  constructor(private readonly config: ConfigService) {
    this.enabled = (config.get<string>('AUTH_PROVIDER') || 'legacy').toLowerCase() === 'keycloak';
    this.keycloakUrl = config.get<string>('KEYCLOAK_URL') || 'http://localhost:8081';
    this.realm = config.get<string>('KEYCLOAK_REALM') || 'infradesk';
    this.adminUser = config.get<string>('KEYCLOAK_ADMIN') || 'admin';
    this.adminPass = config.get<string>('KEYCLOAK_ADMIN_PASSWORD') || 'admin';
  }

  private async getAdminToken(): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${this.keycloakUrl.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'admin-cli',
          username: this.adminUser,
          password: this.adminPass,
          grant_type: 'password',
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Keycloak admin token failed ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { access_token: string };
      return data.access_token;
    } catch (e) {
      this.logger.warn(`Keycloak admin token error ${(e as Error).message}`);
      return null;
    }
  }

  async createUser(params: { email: string; name: string; password: string; role: string }): Promise<void> {
    if (!this.enabled) return;
    const token = await this.getAdminToken();
    if (!token) return;
    const base = `${this.keycloakUrl.replace(/\/$/, '')}/admin/realms/${this.realm}`;
    try {
      const [firstName, ...rest] = params.name.trim().split(' ');
      const lastName = rest.join(' ') || ' ';
      const createRes = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: params.email.toLowerCase(),
          email: params.email.toLowerCase(),
          emailVerified: true,
          enabled: true,
          firstName: firstName.slice(0, 100),
          lastName: lastName.slice(0, 100),
          credentials: [{ type: 'password', value: params.password, temporary: false }],
          attributes: { role: [params.role] },
        }),
      });
      if (!createRes.ok && createRes.status !== 409) {
        this.logger.warn(`Keycloak create user failed ${createRes.status} ${await createRes.text()}`);
        return;
      }
      let userId: string | null = null;
      if (createRes.status === 409) {
        const search = await fetch(`${base}/users?username=${encodeURIComponent(params.email.toLowerCase())}&exact=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const arr = (await search.json()) as { id: string }[];
        userId = arr[0]?.id ?? null;
      } else {
        const loc = createRes.headers.get('Location') || '';
        userId = loc.split('/').pop() || null;
        if (!userId) {
          const search = await fetch(`${base}/users?username=${encodeURIComponent(params.email.toLowerCase())}&exact=true`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const arr = (await search.json()) as { id: string }[];
          userId = arr[0]?.id ?? null;
        }
      }
      if (!userId) return;
      const rolesRes = await fetch(`${base}/roles/${params.role}`, { headers: { Authorization: `Bearer ${token}` } });
      if (rolesRes.ok) {
        const roleRep = await rolesRes.json();
        await fetch(`${base}/users/${userId}/role-mappings/realm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([roleRep]),
        });
      }
      await fetch(`${base}/users/${userId}/reset-password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', value: params.password, temporary: false }),
      });
      this.logger.log(`Keycloak user synced ${params.email} role=${params.role}`);
    } catch (e) {
      this.logger.warn(`Keycloak sync create error ${(e as Error).message}`);
    }
  }

  async updateUser(params: { email: string; password?: string; role?: string }): Promise<void> {
    if (!this.enabled) return;
    const token = await this.getAdminToken();
    if (!token) return;
    const base = `${this.keycloakUrl.replace(/\/$/, '')}/admin/realms/${this.realm}`;
    try {
      const search = await fetch(`${base}/users?username=${encodeURIComponent(params.email.toLowerCase())}&exact=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const arr = (await search.json()) as { id: string }[];
      const userId = arr[0]?.id;
      if (!userId) return;
      if (params.password) {
        await fetch(`${base}/users/${userId}/reset-password`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'password', value: params.password, temporary: false }),
        });
      }
      if (params.role) {
        const allRolesRes = await fetch(`${base}/users/${userId}/role-mappings/realm`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const current = (await allRolesRes.json()) as { name: string }[];
        for (const r of current) {
          if (['USER', 'DEV', 'LIDER'].includes(r.name)) {
            const roleRepRes = await fetch(`${base}/roles/${r.name}`, { headers: { Authorization: `Bearer ${token}` } });
            if (roleRepRes.ok) {
              const rep = await roleRepRes.json();
              await fetch(`${base}/users/${userId}/role-mappings/realm`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify([rep]),
              });
            }
          }
        }
        const newRoleRes = await fetch(`${base}/roles/${params.role}`, { headers: { Authorization: `Bearer ${token}` } });
        if (newRoleRes.ok) {
          const rep = await newRoleRes.json();
          await fetch(`${base}/users/${userId}/role-mappings/realm`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([rep]),
          });
          await fetch(`${base}/users/${userId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ attributes: { role: [params.role] } }),
          });
        }
      }
      this.logger.log(`Keycloak user updated ${params.email}`);
    } catch (e) {
      this.logger.warn(`Keycloak sync update error ${(e as Error).message}`);
    }
  }

  async setEnabled(email: string, enabled: boolean): Promise<void> {
    if (!this.enabled) return;
    const token = await this.getAdminToken();
    if (!token) return;
    const base = `${this.keycloakUrl.replace(/\/$/, '')}/admin/realms/${this.realm}`;
    try {
      const search = await fetch(`${base}/users?username=${encodeURIComponent(email.toLowerCase())}&exact=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const arr = (await search.json()) as { id: string }[];
      const userId = arr[0]?.id;
      if (!userId) return;
      await fetch(`${base}/users/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      this.logger.log(`Keycloak user ${email} enabled=${enabled}`);
    } catch (e) {
      this.logger.warn(`Keycloak setEnabled error ${(e as Error).message}`);
    }
  }
}
