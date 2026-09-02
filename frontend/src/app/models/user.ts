export type Role = 'USER' | 'DEV' | 'LIDER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
}