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

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    headers
  });

  const payload = await response.json().catch(() => ({}));

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
