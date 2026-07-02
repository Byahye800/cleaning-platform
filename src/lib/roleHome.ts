export type Role = 'admin' | 'cleaner' | 'client';

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/clients',
  cleaner: '/cleaner/inbox',
  client: '/client/jobs',
};
