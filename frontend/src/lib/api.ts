const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const { useAuthStore } = await import('../stores/authStore');
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && accessToken) {
    const refreshed = await useAuthStore.getState().refresh();
    if (refreshed) {
      const newToken = useAuthStore.getState().accessToken;
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  return res;
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? res.statusText);
    }
    return res.json();
  },

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? res.statusText);
    }
    return res.json();
  },

  async del(path: string): Promise<void> {
    const res = await apiFetch(path, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.statusText);
  },
};
