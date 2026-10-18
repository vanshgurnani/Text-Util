export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type User = { id: string; username: string; email: string };
export type Note = {
  id: string;
  title: string;
  content: string;
  category: string;
  icon: string;
  parent_id: string | null;
  bookmarked: boolean;
  created_at: string;
  updated_at: string;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('noteform_token') : null;
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || 'Something went wrong');
  return data as T;
}

export function saveSession(token: string, user: User) {
  localStorage.setItem('noteform_token', token);
  localStorage.setItem('noteform_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('noteform_token');
  localStorage.removeItem('noteform_user');
}
