import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { LoginComponent } from './pages/login/login.component';
import { TicketsComponent } from './pages/tickets/tickets.component';
import { AdminComponent } from './pages/admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'tickets',
    component: TicketsComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'USER' },
  },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'DEV' },
  },
  {
    path: 'lider',
    component: AdminComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'LIDER' },
  },
  { path: '**', redirectTo: '/login' },
];
