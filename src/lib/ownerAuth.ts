import { cookies } from 'next/headers';

export const OWNER_COOKIE = 'task_owner';

export function adminSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET is not configured');
  return secret;
}

export async function isOwner(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(OWNER_COOKIE)?.value === adminSecret();
}
