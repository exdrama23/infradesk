import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (req.url.includes('/auth/refresh') || req.url.includes('/auth/login')) {
    return next(req.clone({ withCredentials: true }));
  }

  const token = auth.token();
  const request = req.clone({
    setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    withCredentials: true, 
  });

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !auth.isAuthenticated()) {
        return throwError(() => error);
      }

      return auth.refreshSession().pipe(
        switchMap(() => {
          const newToken = auth.token();
          const retry = req.clone({
            setHeaders: newToken ? { Authorization: `Bearer ${newToken}` } : {},
            withCredentials: true,
          });
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
