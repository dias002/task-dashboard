import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { getTeamConfig, rolePermissions, type Person, type Task } from '@/lib/githubTasks';
import { adminSecret } from '@/lib/ownerAuth';
import { verifyPassword } from '@/lib/passwords';

export const USER_COOKIE = 'task_user';

export type CurrentUser = {
  id: string;
  name: string;
  login: string;
  handle: string;
  roleId: string;
  roleName: string;
  roleColor: string;
  permissions: {
    viewAllTasks: boolean;
    manageTasks: boolean;
    manageTeam: boolean;
  };
};

function signUserId(id: string): string {
  return createHmac('sha256', adminSecret()).update(id).digest('base64url');
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createUserSessionValue(id: string): string {
  return `${id}.${signUserId(id)}`;
}

function personToCurrentUser(person: Person, roles: Awaited<ReturnType<typeof getTeamConfig>>['roles']): CurrentUser {
  const role = roles.find((item) => item.id === person.roleId) ?? roles[0];
  return {
    id: person.id,
    name: person.name,
    login: person.login,
    handle: person.handle,
    roleId: person.roleId,
    roleName: role?.name ?? 'Без роли',
    roleColor: role?.color ?? '#68f4ff',
    permissions: rolePermissions(role),
  };
}

export async function authenticateUser(login: string, password: string): Promise<CurrentUser | null> {
  const normalizedLogin = login.trim().toLowerCase();
  if (!normalizedLogin || !password) return null;

  const team = await getTeamConfig();
  const person = team.people.find((item) => item.active && item.login.toLowerCase() === normalizedLogin);
  if (!person || !verifyPassword(password, person.passwordHash)) return null;

  return personToCurrentUser(person, team.roles);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(USER_COOKIE)?.value;
  const [id, signature] = value?.split('.') ?? [];
  if (!id || !signature || !safeCompare(signature, signUserId(id))) return null;

  const team = await getTeamConfig();
  const person = team.people.find((item) => item.active && item.id === id);
  return person ? personToCurrentUser(person, team.roles) : null;
}

export function canViewTask(user: CurrentUser, task: Task): boolean {
  return user.permissions.viewAllTasks || user.permissions.manageTasks || task.assigneeId === user.id;
}

export function canUpdateTask(user: CurrentUser, task: Task): boolean {
  return user.permissions.manageTasks || task.assigneeId === user.id;
}
