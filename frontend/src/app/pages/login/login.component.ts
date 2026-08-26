import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
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

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const user = this.auth.user();
    if (user) {
      this.router.navigate([user.role === 'DEV' ? '/admin' : '/tickets']);
    }
  }

  submit(): void {
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
        this.router.navigate([res.user.role === 'DEV' ? '/admin' : '/tickets']);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set(
          'E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.',
        );
      },
    });
  }
}