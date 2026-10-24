export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
).replace(/\/$/, '');

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
  pinned: boolean;
  tags: string[];
  is_public?: boolean;
  public_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicNote = {
  title: string;
  content: string;
  category: string;
  icon: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type DataColumn = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'checkbox' | 'select';
  options: string[];
};

export type DataTable = {
  id: string;
  name: string;
  columns: DataColumn[];
  created_at: string;
  updated_at: string;
};

export type DataRecord = {
  id: string;
  table_id: string;
  values: Record<string, string | number | boolean | null>;
  version: number;
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

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('noteos_token') || localStorage.getItem('noteform_token');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
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
  const token = getSessionToken();
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
  const token = getSessionToken();
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
  localStorage.setItem('noteos_token', token);
  localStorage.setItem('noteos_user', JSON.stringify(user));
  localStorage.setItem('noteform_token', token);
  localStorage.setItem('noteform_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('noteos_token');
  localStorage.removeItem('noteos_user');
  localStorage.removeItem('noteform_token');
  localStorage.removeItem('noteform_user');
}

export function shareNote(noteId: string) {
  return api<{ is_public: boolean; public_id: string; note: Note }>(`/notes/${noteId}/share`, {
    method: 'POST',
  });
}

export function unshareNote(noteId: string) {
  return api<{ is_public: boolean; note: Note }>(`/notes/${noteId}/share`, {
    method: 'DELETE',
  });
}

export async function fetchPublicNote(publicId: string): Promise<PublicNote> {
  const response = await fetch(`${API_URL}/public/notes/${publicId}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || 'This note is private or does not exist';
    throw new ApiError(typeof detail === 'string' ? detail : 'Could not load public note', response.status, detail);
  }
  return data.note;
}

// -------------------------------------------------------------
// RAG & Chat AI Types and Functions
// -------------------------------------------------------------

export type RagCitation = {
  chunk_id: string;
  note_id: string;
  note_title: string;
  heading_path: string[];
  snippet: string;
  score: number;
};

export type RagQueryResponse = {
  answer: string;
  citations: RagCitation[];
  model: string;
  from_cache: boolean;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: RagCitation[];
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  model: string;
  is_pinned: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = {
  id: string;
  title: string;
  model: string;
  is_pinned: boolean;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
};

export type AiModel = {
  id: string;
  name: string;
  provider: string;
  context_window: number;
  is_default: boolean;
};

export type RagStatus = {
  status: string;
  notes_count: number;
  chunks_count: number;
  available_models: AiModel[];
};

export function listConversations(): Promise<ConversationSummary[]> {
  return api<ConversationSummary[]>('/chat/conversations');
}

export function createConversation(data?: { title?: string; model?: string }): Promise<ConversationDetail> {
  return api<ConversationDetail>('/chat/conversations', {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export function getConversation(conversationId: string): Promise<ConversationDetail> {
  return api<ConversationDetail>(`/chat/conversations/${conversationId}`);
}

export function updateConversation(
  conversationId: string,
  data: { title?: string; is_pinned?: boolean; model?: string },
): Promise<{ status: string }> {
  return api<{ status: string }>(`/chat/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteConversation(conversationId: string): Promise<{ status: string }> {
  return api<{ status: string }>(`/chat/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

export function exportConversationToNote(
  conversationId: string,
  data?: { title?: string; category?: string; tags?: string[] },
): Promise<{ note_id: string; title: string }> {
  return api<{ note_id: string; title: string }>(`/chat/conversations/${conversationId}/export-note`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export function queryRag(params: {
  query: string;
  model?: string;
  top_k?: number;
  category_filter?: string;
  note_id_filter?: string[];
}): Promise<RagQueryResponse> {
  return api<RagQueryResponse>('/rag/query', {
    method: 'POST',
    body: JSON.stringify({ ...params, stream: false }),
  });
}

export function getRagStatus(): Promise<RagStatus> {
  return api<RagStatus>('/rag/status');
}

export function indexWorkspace(noteId?: string): Promise<{ notes_indexed: number; chunks_indexed: number }> {
  return api<{ notes_indexed: number; chunks_indexed: number }>('/rag/index', {
    method: 'POST',
    body: JSON.stringify(noteId ? { note_id: noteId } : {}),
  });
}

export async function streamChatMessage({
  conversationId,
  content,
  model,
  useRag = true,
  onCitations,
  onDelta,
  onDone,
  onError,
}: {
  conversationId: string;
  content: string;
  model?: string;
  useRag?: boolean;
  onCitations?: (citations: RagCitation[]) => void;
  onDelta: (textChunk: string) => void;
  onDone: (data: { message_id: string; content: string }) => void;
  onError: (err: any) => void;
}): Promise<() => void> {
  const token = getSessionToken();
  const controller = new AbortController();

  fetch(`${API_URL}/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      content,
      model,
      stream: true,
      use_rag: useRag,
    }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentEvent = 'message';
            continue;
          }
          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (currentEvent === 'citations' && onCitations) {
                onCitations(parsed);
              } else if (currentEvent === 'delta') {
                onDelta(parsed.content || '');
              } else if (currentEvent === 'done') {
                onDone(parsed);
              } else if (currentEvent === 'error') {
                onError(parsed.error);
              }
            } catch {
              // Non-json token or raw text
              if (currentEvent === 'delta') {
                onDelta(dataStr);
              }
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err);
      }
    });

  return () => {
    controller.abort();
  };
}

// -------------------------------------------------------------
// Settings & Provider Configuration Types & Functions
// -------------------------------------------------------------

export type UserSettings = {
  user: {
    id: string;
    username: string;
    email: string;
    created_at: string;
    has_mcp_token: boolean;
  };
  ai: {
    gemini_api_key: string;
    groq_api_key: string;
    ollama_base_url: string;
    ollama_model: string;
    default_model: string;
    rag_chunk_size: number;
    rag_chunk_overlap: number;
    rag_top_k: number;
    auto_rag_sync: boolean;
    has_custom_gemini: boolean;
    has_custom_groq: boolean;
  };
  preferences: {
    theme: string;
    font_style: string;
    default_category: string;
    editor_width: string;
  };
  stats: {
    notes_count: number;
    chunks_count: number;
    cached_queries_count: number;
  };
};

export function getUserSettings(): Promise<UserSettings> {
  return api<UserSettings>('/settings');
}

export function updateUserSettings(payload: {
  ai?: Partial<UserSettings['ai']>;
  preferences?: Partial<UserSettings['preferences']>;
}): Promise<{ status: string; message: string }> {
  return api<{ status: string; message: string }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function testAiKey(params: {
  provider: string;
  api_key?: string;
  base_url?: string;
  model?: string;
}): Promise<{ valid: boolean; provider: string; message: string }> {
  return api<{ valid: boolean; provider: string; message: string }>('/settings/ai/test-key', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function clearRagCache(): Promise<{ status: string; deleted_count: number; message: string }> {
  return api<{ status: string; deleted_count: number; message: string }>('/settings/rag/clear-cache', {
    method: 'POST',
  });
}

export function reindexWorkspaceFull(): Promise<{ status: string; notes_indexed: number; chunks_indexed: number }> {
  return api<{ status: string; notes_indexed: number; chunks_indexed: number }>('/settings/rag/reindex', {
    method: 'POST',
  });
}

export function changeUserPassword(currentPassword: string, newPassword: string): Promise<{ status: string; message: string }> {
  return api<{ status: string; message: string }>('/settings/account/password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}



