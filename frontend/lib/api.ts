import { clearSession, getToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

export async function apiFetch<T = unknown>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, ...rest } = options;
  const token = auth ? getToken() : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(rest.headers || {})
  };

  if (auth && token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  if (auth && !token) {
    clearSession();
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname || '';
      if (currentPath !== '/login') {
        window.location.href = '/login';
      }
    }
    throw new Error('Token tidak ditemukan. Silakan login ulang.');
  }
  if (typeof window !== 'undefined' && endpoint.startsWith('/tabungan')) {
    const authHeader =
      (headers as Record<string, string>).Authorization ||
      (headers as Record<string, string>).authorization ||
      null;
    console.info('[API][TABUNGAN][REQ]', {
      endpoint,
      method: rest.method || 'GET',
      auth,
      tokenFromStorage: Boolean(token),
      tokenLenFromStorage: token?.length || 0,
      hasAuthHeader: Boolean(authHeader),
      authHeaderPreview: authHeader ? String(authHeader).slice(0, 20) : null
    });
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (typeof window !== 'undefined' && endpoint.startsWith('/tabungan') && !response.ok) {
    console.warn('[API][TABUNGAN][ERR]', {
      endpoint,
      status: response.status,
      message: payload?.message || null
    });
  }

  if (response.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Sesi berakhir. Silakan login ulang.');
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'Terjadi kesalahan saat memproses request');
  }

  return payload;
}
