export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type User = { id: string; username: string; email: string };
export type Note = {
  id: string;
  title: string;
  content: string;
  category: string;
  icon: string;
  parent_id: string | null;
  source_url: string | null;
  inbox: boolean;
  version: number;
  bookmarked: boolean;
  created_at: string;
  updated_at: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('noteform_token') : null;
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || data.error;
    const detailMessage = typeof detail === 'object' && detail !== null && 'message' in detail
      ? detail.message
      : undefined;
    const message = typeof detail === 'string'
      ? detail
      : typeof detailMessage === 'string'
        ? detailMessage
        : 'Something went wrong';
    throw new ApiError(message, response.status, detail);
  }
  return data as T;
}

async function uploadWorkspaceFile<T>(path: string, file: File): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('noteform_token') : null;
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || data.error;
    throw new ApiError(typeof detail === 'string' ? detail : 'Could not process workspace archive', response.status, detail);
  }
  return data as T;
}

export function previewWorkspaceImport(file: File) {
  return uploadWorkspaceFile<{ count: number; skipped_files: number; pages: { title: string; path: string }[] }>(
    '/workspace/import/preview',
    file,
  );
}

export function importWorkspace(file: File) {
  return uploadWorkspaceFile<{ imported: number }>('/workspace/import', file);
}

export async function downloadWorkspaceExport(): Promise<Blob> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('noteform_token') : null;
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}/workspace/export`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data.detail || data.error;
    throw new ApiError(typeof detail === 'string' ? detail : 'Could not export workspace', response.status, detail);
  }
  return response.blob();
}

export function saveSession(token: string, user: User) {
  localStorage.setItem('noteform_token', token);
  localStorage.setItem('noteform_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('noteform_token');
  localStorage.removeItem('noteform_user');
}
