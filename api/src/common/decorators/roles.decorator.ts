import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'ADMIN' | 'TEAM_LEAD' | 'COORDINATOR' | 'EMPLOYEE' | 'HR_MANAGER' | 'HR_SUPPORT'>) =>
  SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
