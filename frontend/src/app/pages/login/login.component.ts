import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import type { LoginDto } from '../../models';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isKeycloak = environment.authProvider === 'keycloak';

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const user = this.auth.user();
    if (user) {
      this.navigateByRole(user.role);
    }
  }

  submit(): void {
    if (this.isKeycloak) {
      this.auth.loginWithKeycloak();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const credentials: LoginDto = {
      email: raw.email.trim(),
      password: raw.password,
    };

    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.login(credentials).subscribe({
      next: (res) => {
        this.navigateByRole(res.user.role);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const msg = (err as { error?: { message?: string } })?.error?.message;
        if (msg && msg.includes('banido')) {
          this.errorMessage.set(msg);
        } else {
          this.errorMessage.set('E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.');
        }
      },
    });
  }

  loginWithKeycloak(): void {
    this.auth.loginWithKeycloak();
  }

  private navigateByRole(role: string): void {
    if (role === 'LIDER') this.router.navigate(['/lider']);
    else if (role === 'DEV') this.router.navigate(['/admin']);
    else this.router.navigate(['/tickets']);
  }
}