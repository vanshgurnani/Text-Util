'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownEditor from '@/app/components/MarkdownEditor';
import PagesTree from '@/app/components/PagesTree';
import { api, clearSession, Note, User } from '@/lib/api';

const categories = ['All notes', 'Personal', 'Work', 'Ideas', 'Reading', 'General'];
const icons = ['✦', '◌', '⌁', '□', '◈', '○'];

function relativeDate(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

export default function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [category, setCategory] = useState('All notes');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [showMcp, setShowMcp] = useState(false);
  const [mcpToken, setMcpToken] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('noteform_user');
    const token = localStorage.getItem('noteform_token');
    if (!stored || !token) {
      router.replace('/login');
      return;
    }
    setUser(JSON.parse(stored));
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (category !== 'All notes' && category !== 'Favorites') query.set('category', category);
      if (category === 'Favorites') query.set('bookmarked', 'true');
      const result = await api<{ notes: Note[] }>(`/notes?${query}`);
      setNotes(result.notes);
      if (!selected && result.notes[0]) setSelected(result.notes[0]);
    } catch (err) {
      if (err instanceof Error && err.message.includes('token')) router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadNotes, 250);
      return () => clearTimeout(timer);
    }
  }, [search, category]);

  const wordCount = useMemo(
    () => (selected?.content || '').trim() ? selected!.content.trim().split(/\s+/).length : 0,
    [selected],
  );

  function updateSelected(key: 'title' | 'content' | 'category', value: string) {
    if (!selected) return;
    setSelected({ ...selected, [key]: value });
  }

  async function saveNote() {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await api<{ note: Note }>(`/notes/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: selected.title,
          content: selected.content,
          category: selected.category,
        }),
      });
      setSelected(result.note);
      setNotes(current => current.map(note => note.id === result.note.id ? result.note : note));
      flash('Saved just now');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function createNote(parentId: string | null = null) {
    try {
      const result = await api<{ note: Note }>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Untitled',
          content: '',
          category: 'General',
          icon: icons[notes.length % icons.length],
          parent_id: parentId,
        }),
      });
      setNotes(current => [result.note, ...current]);
      setSelected(result.note);
      flash('New note created');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create note');
    }
  }

  async function toggleBookmark(note: Note) {
    const result = await api<{ bookmarked: boolean }>(`/notes/${note.id}/bookmark`, { method: 'POST' });
    const updated = { ...note, bookmarked: result.bookmarked };
    setNotes(current => current.map(item => item.id === note.id ? updated : item));
    if (selected?.id === note.id) setSelected(updated);
  }

  async function removeNote() {
    if (!selected || !window.confirm('Delete this note?')) return;
    setDeleting(true);
    try {
      await api(`/notes/${selected.id}`, { method: 'DELETE' });
      const remaining = notes.filter(note => note.id !== selected.id);
      setNotes(remaining);
      setSelected(remaining[0] || null);
      flash('Note deleted');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete note');
    } finally {
      setDeleting(false);
    }
  }

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2200);
  }

  function logout() {
    clearSession();
    router.push('/login');
  }

  async function generateMcpToken() {
    try {
      const result = await api<{ token: string; message: string }>('/auth/mcp-token', { method: 'POST' });
      setMcpToken(result.token);
      flash('MCP token created');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create token');
    }
  }

  if (!user) {
    return <div className="loading-screen"><span className="brand-mark small">✦</span> Loading your workspace…</div>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><span>✦</span> Noteform</div>
        <div className="workspace-switcher">
          <div className="avatar">{user.username[0].toUpperCase()}</div>
          <div><strong>{user.username}&apos;s space</strong><small>Personal workspace</small></div>
          <span className="chevron">⌄</span>
        </div>
        <button className="new-note-button" onClick={() => createNote()}><span>＋</span> New page <kbd>⌘ N</kbd></button>
        <nav>
          <p className="nav-label">LIBRARY</p>
          <button className={category === 'All notes' ? 'nav-item active' : 'nav-item'} onClick={() => setCategory('All notes')}><span>▤</span> All notes <b>{notes.length}</b></button>
          <button className={category === 'Favorites' ? 'nav-item active' : 'nav-item'} onClick={() => setCategory('Favorites')}><span>♡</span> Favorites</button>
          <p className="nav-label categories-label">PRIVATE <button aria-label="Create page" onClick={() => createNote()}>＋</button></p>
          <PagesTree
            notes={notes}
            selectedId={selected?.id}
            onSelect={note => {
              setCategory('All notes');
              setSearch('');
              setSelected(note);
            }}
            onCreateChild={parentId => createNote(parentId)}
          />
          <p className="nav-label categories-label">CATEGORIES <button onClick={() => setCategory('General')}>＋</button></p>
          {categories.slice(1).map(item => (
            <button key={item} className={category === item ? 'nav-item active' : 'nav-item'} onClick={() => setCategory(item)}>
              <i className={`category-dot ${item.toLowerCase()}`} />{item}
            </button>
          ))}
          <p className="nav-label categories-label">CONNECT <button onClick={() => setShowMcp(true)}>＋</button></p>
          <button className="nav-item" onClick={() => setShowMcp(true)}><span>✧</span> Connect GPT</button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setShowMcp(true)}><span>⚙</span> Settings</button>
          <button className="profile-row" onClick={logout}>
            <div className="avatar small-avatar">{user.username[0].toUpperCase()}</div>
            <span>{user.username}<small>Sign out</small></span><span>⋯</span>
          </button>
        </div>
      </aside>
      <section className="content-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{category}</strong></div>
          <div className="top-actions">
            <label className="search-box">
              <span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes..." /><kbd>⌘ K</kbd>
            </label>
            <button className="icon-button" onClick={() => setShowMcp(true)} title="Connect GPT">✧</button>
            <button className="user-avatar" onClick={logout}>{user.username[0].toUpperCase()}</button>
          </div>
        </header>
        <div className="workspace">
          <div className="notes-column">
            <div className="page-heading">
              <div>
                <p className="eyebrow">{category === 'All notes' ? 'YOUR LIBRARY' : 'FILTERED NOTES'}</p>
                <h1>{category}</h1>
                <p className="muted">{notes.length} {notes.length === 1 ? 'note' : 'notes'} · Updated across your workspace</p>
              </div>
              <div className="view-toggle">
                <button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>☷</button>
                <button className={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')}>⊞</button>
              </div>
            </div>
            {message && <div className="toast">{message}</div>}
            {loading ? (
              <div className="empty-state"><span className="spinner" /> Loading notes…</div>
            ) : notes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✦</div>
                <h3>Your space is waiting</h3>
                <p>Capture an idea, a thought, or anything worth keeping.</p>
                <button className="primary-button" onClick={() => createNote()}>Create your first note <span>→</span></button>
              </div>
            ) : (
              <div className={view === 'grid' ? 'note-list grid-view' : 'note-list'}>
                {notes.map(note => (
                  <article key={note.id} className={`note-card ${selected?.id === note.id ? 'selected' : ''}`} onClick={() => setSelected(note)}>
                    <div className="note-icon">{note.icon}</div>
                    <div className="note-preview">
                      <div className="note-title-row"><h3>{note.title || 'Untitled'}</h3>{note.bookmarked && <span className="star">★</span>}</div>
                      <p>{note.content || 'Empty note — start writing...'}</p>
                      <div className="note-meta">
                        <span className={`tag ${note.category.toLowerCase()}`}>{note.category}</span>
                        <span>{relativeDate(note.updated_at)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="editor-column">
            {selected ? (
              <>
                <div className="editor-toolbar">
                  <span className="saved-state">{saving ? 'Saving…' : '✓ Saved'}</span>
                  <div>
                    <button className="toolbar-button" onClick={() => toggleBookmark(selected)}>{selected.bookmarked ? '★' : '☆'}</button>
                    <button className="toolbar-button" onClick={removeNote} disabled={deleting} aria-label="Delete note" title="Delete note">
                      {deleting ? '…' : '⌫'}
                    </button>
                    <button className="save-button" onClick={saveNote}>{saving ? 'Saving' : 'Save note'} <span>⌘ S</span></button>
                  </div>
                </div>
                <div className="editor-paper">
                  <div className="editor-icon">{selected.icon}</div>
                  <input className="title-input" value={selected.title} onChange={event => updateSelected('title', event.target.value)} placeholder="Untitled" />
                  <div className="editor-info">
                    <span>Last edited {relativeDate(selected.updated_at).toLowerCase()}</span><span>·</span><span>{wordCount} words</span>
                  </div>
                  <MarkdownEditor value={selected.content} onChange={value => updateSelected('content', value)} />
                  <div className="editor-footer"><span>Markdown supported · Images: ![alt](URL)</span><span>⌘ Enter to save</span></div>
                </div>
              </>
            ) : (
              <div className="no-selection"><span>✦</span><p>Select a note to start reading</p></div>
            )}
          </div>
        </div>
      </section>
      {showMcp && (
        <div className="modal-backdrop" onClick={() => setShowMcp(false)}>
          <section className="mcp-modal" onClick={event => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowMcp(false)}>×</button>
            <div className="mcp-symbol">✧</div>
            <p className="eyebrow">NOTEFORM CONNECT</p>
            <h2>Bring your notes to GPT</h2>
            <p className="muted modal-copy">Connect a GPT-compatible MCP client and ask questions across your private workspace, or let it save new notes for you.</p>
            <div className="connect-step">
              <span>01</span>
              <div><strong>Use your MCP endpoint</strong><code>{location.origin.replace('3000', '8000')}/mcp</code></div>
              <button onClick={() => navigator.clipboard?.writeText(`${location.origin.replace('3000', '8000')}/mcp`)}>Copy</button>
            </div>
            <div className="connect-step">
              <span>02</span>
              <div>
                <strong>Create a permanent MCP API token</strong>
                {mcpToken ? (
                  <><code>{mcpToken}</code><small>Copy it now. For security, it will not be shown again.</small></>
                ) : (
                  <small>This token never expires. You can revoke it from this panel by generating a replacement.</small>
                )}
              </div>
              <button onClick={generateMcpToken}>{mcpToken ? 'Regenerate' : 'Create token'}</button>
            </div>
            <div className="mcp-tools"><span>Available tools</span><b>search_notes</b><b>get_note</b><b>create_note</b><b>list_bookmarks</b></div>
            <a className="text-link" href="http://localhost:8000/docs" target="_blank">Open API documentation ↗</a>
          </section>
        </div>
      )}
    </main>
  );
}
