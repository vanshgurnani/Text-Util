'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  const [showCapture, setShowCapture] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureContent, setCaptureContent] = useState('');
  const [captureSource, setCaptureSource] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [capturing, setCapturing] = useState(false);

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

  useEffect(() => {
    function handleCaptureShortcut(event: KeyboardEvent) {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setShowCapture(true);
      }
    }
    window.addEventListener('keydown', handleCaptureShortcut);
    return () => window.removeEventListener('keydown', handleCaptureShortcut);
  }, []);

  async function loadNotes() {
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (category === 'Inbox') query.set('inbox', 'true');
      else if (category !== 'All notes' && category !== 'Favorites') query.set('category', category);
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

  async function createCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceUrl = captureSource.trim();
    const content = captureContent.trim();
    if (!sourceUrl && !content) {
      setCaptureError('Add a thought or a source link to capture.');
      return;
    }

    setCaptureError('');
    setCapturing(true);
    try {
      const result = await api<{ note: Note }>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: captureTitle.trim() || (sourceUrl ? 'Saved link' : 'Quick capture'),
          content,
          category: 'General',
          icon: '⌁',
          source_url: sourceUrl || null,
          inbox: true,
        }),
      });
      setNotes(current => [result.note, ...current]);
      setCategory('Inbox');
      setSelected(result.note);
      setCaptureTitle('');
      setCaptureContent('');
      setCaptureSource('');
      setCaptureError('');
      setShowCapture(false);
      flash('Saved to Inbox');
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Could not save capture');
    } finally {
      setCapturing(false);
    }
  }

  async function moveCaptureToPages(note: Note) {
    try {
      const result = await api<{ note: Note }>(`/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ inbox: false }),
      });
      setNotes(current => current.map(item => item.id === note.id ? result.note : item));
      setSelected(result.note);
      setCategory('All notes');
      flash('Moved to Private pages');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move capture');
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
        <button className="capture-button" onClick={() => setShowCapture(true)}><span>⌁</span> Quick capture <kbd>⌥ ⇧ C</kbd></button>
        <nav>
          <p className="nav-label">LIBRARY</p>
          <button className={category === 'All notes' ? 'nav-item active' : 'nav-item'} onClick={() => setCategory('All notes')}><span>▤</span> All notes <b>{notes.length}</b></button>
          <button className={category === 'Inbox' ? 'nav-item active' : 'nav-item'} onClick={() => { setCategory('Inbox'); setSelected(null); }}><span>⌁</span> Inbox</button>
          <button className={category === 'Favorites' ? 'nav-item active' : 'nav-item'} onClick={() => setCategory('Favorites')}><span>♡</span> Favorites</button>
          <p className="nav-label categories-label">PRIVATE <button aria-label="Create page" onClick={() => createNote()}>＋</button></p>
          <PagesTree
            notes={notes.filter(note => !note.inbox)}
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
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{selected?.title || category}</strong></div>
          <div className="top-actions">
            <label className="search-box">
              <span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes..." /><kbd>⌘ K</kbd>
            </label>
            <button className="quick-capture-top" onClick={() => setShowCapture(true)}>＋ Capture</button>
            <button className="icon-button" onClick={() => setShowMcp(true)} title="Connect GPT">✧</button>
            <button className="user-avatar" onClick={logout}>{user.username[0].toUpperCase()}</button>
          </div>
        </header>
        <div className="workspace">
          <div className="notes-column">
            <div className="page-heading">
              <div>
                <p className="eyebrow">{category === 'Inbox' ? 'CAPTURED FOR LATER' : category === 'All notes' ? 'YOUR LIBRARY' : 'FILTERED NOTES'}</p>
                <h1>{category}</h1>
                <p className="muted">{category === 'Inbox' ? 'Thoughts and links to organize when you are ready.' : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} · Updated across your workspace`}</p>
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
                <h3>{category === 'Inbox' ? 'Your Inbox is clear' : 'Your space is waiting'}</h3>
                <p>{category === 'Inbox' ? 'Quick captures will land here until you are ready to organize them.' : 'Capture an idea, a thought, or anything worth keeping.'}</p>
                <button className="primary-button" onClick={() => category === 'Inbox' ? setShowCapture(true) : createNote()}>
                  {category === 'Inbox' ? 'Capture a thought' : 'Create your first note'} <span>→</span>
                </button>
              </div>
            ) : (
              <div className={view === 'grid' ? 'note-list grid-view' : 'note-list'}>
                {notes.map(note => (
                  <article key={note.id} className={`note-card ${selected?.id === note.id ? 'selected' : ''}`} onClick={() => setSelected(note)}>
                    <div className="note-icon">{note.icon}</div>
                    <div className="note-preview">
                      <div className="note-title-row"><h3>{note.title || 'Untitled'}</h3>{note.bookmarked && <span className="star">★</span>}</div>
                      <p>{note.content || 'Empty note — start writing...'}</p>
                      {note.source_url && <p className="source-preview">{note.source_url}</p>}
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
                    {selected.inbox && <button className="move-capture-button" onClick={() => moveCaptureToPages(selected)}>Move to pages</button>}
                    <button className="save-button" onClick={saveNote}>{saving ? 'Saving' : 'Save note'} <span>⌘ S</span></button>
                  </div>
                </div>
                <div className="editor-paper">
                  <div className="editor-icon">{selected.icon}</div>
                  <input className="title-input" value={selected.title} onChange={event => updateSelected('title', event.target.value)} placeholder="Untitled" />
                  <div className="editor-info">
                    <span>Last edited {relativeDate(selected.updated_at).toLowerCase()}</span><span>·</span><span>{wordCount} words</span>
                  </div>
                  {selected.source_url && (
                    <a className="capture-source-link" href={selected.source_url} target="_blank" rel="noreferrer">
                      ↗ {selected.source_url}
                    </a>
                  )}
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
      {showCapture && (
        <div className="modal-backdrop" onClick={() => setShowCapture(false)}>
          <section className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="capture-heading" onClick={event => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCapture(false)} aria-label="Close capture">×</button>
            <div className="mcp-symbol">⌁</div>
            <p className="eyebrow">QUICK CAPTURE · INBOX</p>
            <h2 id="capture-heading">Save it for later</h2>
            <p className="muted modal-copy">Drop in a thought or link. You can organize it when you have time.</p>
            <form className="capture-form" onSubmit={createCapture}>
              <label>
                Title <span>optional</span>
                <input autoFocus value={captureTitle} onChange={event => { setCaptureTitle(event.target.value); setCaptureError(''); }} maxLength={160} placeholder="Give it a name" />
              </label>
              <label>
                Source link <span>optional</span>
                <input type="url" value={captureSource} onChange={event => { setCaptureSource(event.target.value); setCaptureError(''); }} maxLength={2048} placeholder="https://…" />
              </label>
              <label>
                Thought or context <span>optional if you add a link</span>
                <textarea value={captureContent} onChange={event => { setCaptureContent(event.target.value); setCaptureError(''); }} maxLength={100000} placeholder="What do you want to remember?" />
              </label>
              {captureError && <p className="form-error" role="alert">{captureError}</p>}
              <button className="primary-button" type="submit" disabled={capturing}>
                {capturing ? 'Saving…' : 'Save to Inbox'} <span>⌘ ↵</span>
              </button>
            </form>
          </section>
        </div>
      )}
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
