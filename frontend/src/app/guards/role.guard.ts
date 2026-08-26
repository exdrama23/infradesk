import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import type { Role } from '../models';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const requiredRole = route.data?.['role'] as Role | undefined;
  const user = auth.user();

  if (!user) {
    router.navigate(['/login']);
    return false;
  }

  if (requiredRole && user.role !== requiredRole) {
    const home = user.role === 'DEV' ? '/admin' : user.role === 'LIDER' ? '/lider' : '/tickets';
    router.navigate([home]);
    return false;
  }

  return true;
};