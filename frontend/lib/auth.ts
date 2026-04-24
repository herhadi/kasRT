import { UserSession } from '@/types';

const TOKEN_KEY = 'kasrt_token';
const USER_KEY = 'kasrt_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserSession | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed || !parsed.id || !parsed.nama) return null;
    return {
      ...parsed,
      roles: Array.isArray(parsed.roles) ? parsed.roles : []
    };
  } catch {
    return null;
  }
}

export function setSession(token: string, user: UserSession) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasAnyRole(user: UserSession | null, allowedRoles: string[]) {
  if (!user) return false;
  const owned = user.roles.map((role) => String(role).toLowerCase());
  return allowedRoles.some((role) => owned.includes(role.toLowerCase()));
}
