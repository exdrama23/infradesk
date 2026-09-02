import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { KeycloakService } from '../services/keycloak.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const keycloak = inject(KeycloakService);
  const router = inject(Router);

  if (req.url.includes('/auth/refresh') || req.url.includes('/auth/login')) {
    return next(req.clone({ withCredentials: true }));
  }

  if (environment.authProvider === 'keycloak' && req.url.includes('/realms/')) {
    return next(req);
  }

  const attachToken = (token: string | null) =>
    req.clone({
      setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      withCredentials: environment.authProvider !== 'keycloak',
    });

  const token = auth.token();
  const request = attachToken(token);

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !auth.isAuthenticated()) {
        return throwError(() => error);
      }

      if (environment.authProvider === 'keycloak') {
        return from(keycloak.getToken()).pipe(
          switchMap((newToken) => {
            const retry = attachToken(newToken);
            return next(retry);
          }),
          catchError((refreshError) => {
            auth.clearSession();
            router.navigate(['/login']);
            return throwError(() => refreshError);
          }),
        );
      }

      return auth.refreshSession().pipe(
        switchMap(() => {
          const newToken = auth.token();
          const retry = attachToken(newToken);
          return next(retry);
        }),
        catchError((refreshError) => {
          auth.clearSession();
          router.navigate(['/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};