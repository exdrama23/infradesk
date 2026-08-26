import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;

  protected homeLink(): string {
    const role = this.user()?.role;
    return role === 'DEV' ? '/admin' : role === 'LIDER' ? '/lider' : '/tickets';
  }

  protected roleLabel(): string {
    const role = this.user()?.role;
    return role === 'DEV' ? 'Desenvolvedor' : role === 'LIDER' ? 'Líder' : 'Usuário';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}