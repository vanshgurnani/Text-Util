'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownEditor from '@/app/components/MarkdownEditor';
import PagesTree from '@/app/components/PagesTree';
import { ApiError, api, clearSession, Note, User } from '@/lib/api';

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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved');
  const [draftDirty, setDraftDirty] = useState(false);
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
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const editRevision = useRef(0);
  const saveInFlight = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('noteform_user');
    const token = localStorage.getItem('noteform_token');
    if (!stored || !token) {
      router.replace('/login');
      return;
    }
    setUser(JSON.parse(stored));
    try {
      const recent = JSON.parse(localStorage.getItem(`noteform_recent_${JSON.parse(stored).id}`) || '[]');
      if (Array.isArray(recent)) setRecentIds(recent.filter((id): id is string => typeof id === 'string').slice(0, 5));
    } catch {
      localStorage.removeItem(`noteform_recent_${JSON.parse(stored).id}`);
    }
    loadNotes();
  }, []);

  useEffect(() => {
    function handleGlobalShortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCommandPalette(true);
        setCommandQuery('');
        setCommandIndex(0);
        return;
      }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setShowCapture(true);
      }
    }
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  async function loadNotes() {
    try {
      const result = await api<{ notes: Note[] }>('/notes');
      setNotes(result.notes);
      if (!selected && result.notes[0]) setSelected(result.notes[0]);
    } catch (err) {
      if (err instanceof Error && err.message.includes('token')) router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  const visibleNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return notes.filter(note => {
      if (category === 'Inbox' && !note.inbox) return false;
      if (category === 'Favorites' && !note.bookmarked) return false;
      if (!['All notes', 'Inbox', 'Favorites'].includes(category) && note.category !== category) return false;
      if (!query) return true;
      return [note.title, note.content, note.source_url || '']
        .some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [notes, search, category]);

  const pageBreadcrumbs = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(notes.map(note => [note.id, note]));
    const path: Note[] = [];
    let parentId = selected.parent_id;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      path.unshift(parent);
      parentId = parent.parent_id;
    }
    return path;
  }, [notes, selected]);

  const childPages = useMemo(
    () => selected ? notes.filter(note => note.parent_id === selected.id && !note.inbox) : [],
    [notes, selected],
  );

  const commandItems = useMemo(() => {
    const query = commandQuery.trim().toLocaleLowerCase();
    const actions = [
      { id: 'new-page', title: 'Create a new page', subtitle: 'Add a page to your workspace', kind: 'action' as const },
      { id: 'quick-capture', title: 'Quick capture', subtitle: 'Save a thought or link to Inbox', kind: 'action' as const },
      { id: 'inbox', title: 'Open Inbox', subtitle: 'Review uncategorized captures', kind: 'action' as const },
      { id: 'favorites', title: 'Open Favorites', subtitle: 'See bookmarked pages', kind: 'action' as const },
    ].filter(item => !query || `${item.title} ${item.subtitle}`.toLocaleLowerCase().includes(query));
    const pages = notes
      .filter(note => !note.inbox && (!query || `${note.title} ${note.content} ${note.source_url || ''}`.toLocaleLowerCase().includes(query)))
      .map(note => ({ id: note.id, title: note.title || 'Untitled', subtitle: note.category, kind: 'page' as const, note }));
    return [...actions, ...pages].slice(0, 30);
  }, [commandQuery, notes]);

  useEffect(() => {
    setCommandIndex(index => Math.max(0, Math.min(index, commandItems.length - 1)));
  }, [commandItems.length]);

  useEffect(() => {
    if (showCommandPalette) commandInputRef.current?.focus();
  }, [showCommandPalette]);

  const wordCount = useMemo(
    () => (selected?.content || '').trim() ? selected!.content.trim().split(/\s+/).length : 0,
    [selected],
  );

  function updateSelected(key: 'title' | 'content' | 'category', value: string) {
    if (!selected) return;
    setSelected({ ...selected, [key]: value });
    editRevision.current += 1;
    setDraftDirty(true);
    setSaveStatus(current => current === 'conflict' ? 'conflict' : 'dirty');
  }

  const saveNote = useCallback(async (overwrite = false): Promise<boolean> => {
    if (!selected || saveInFlight.current) return false;
    const revision = editRevision.current;
    let expectedVersion = selected.version;
    setSaving(true);
    saveInFlight.current = true;
    setSaveStatus('saving');
    try {
      if (overwrite) {
        const latest = await api<{ note: Note }>(`/notes/${selected.id}`);
        expectedVersion = latest.note.version;
      }
      const result = await api<{ note: Note }>(`/notes/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: expectedVersion,
          title: selected.title,
          content: selected.content,
          category: selected.category,
        }),
      });
      setNotes(current => current.map(note => note.id === result.note.id ? result.note : note));
      if (editRevision.current === revision) {
        setSelected(current => current?.id === result.note.id ? result.note : current);
        setDraftDirty(false);
        setSaveStatus('saved');
      } else {
        setSelected(current => current?.id === result.note.id
          ? { ...current, version: result.note.version, updated_at: result.note.updated_at }
          : current);
        setSaveStatus('dirty');
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveStatus('conflict');
      } else {
        setSaveStatus('error');
      }
      return false;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [selected]);

  useEffect(() => {
    if (!selected || !draftDirty || saveStatus !== 'dirty') return;
    const timer = setTimeout(() => { void saveNote(); }, 900);
    return () => clearTimeout(timer);
  }, [selected, draftDirty, saveStatus, saveNote]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (draftDirty && saveStatus !== 'conflict') void saveNote();
      }
    }
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [draftDirty, saveNote, saveStatus]);

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!draftDirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [draftDirty]);

  async function selectNote(note: Note | null): Promise<boolean> {
    if (draftDirty && !await saveNote()) return false;
    setSelected(note);
    setSaveStatus('saved');
    if (note && !note.inbox && user) {
      setRecentIds(current => {
        const next = [note.id, ...current.filter(id => id !== note.id)].slice(0, 5);
        localStorage.setItem(`noteform_recent_${user.id}`, JSON.stringify(next));
        return next;
      });
    }
    return true;
  }

  async function openPage(note: Note): Promise<boolean> {
    if (!await selectNote(note)) return false;
    setCategory('All notes');
    setSearch('');
    return true;
  }

  async function runCommand(item: (typeof commandItems)[number]) {
    setShowCommandPalette(false);
    setCommandQuery('');
    if (item.kind === 'page') {
      await openPage(item.note);
      return;
    }
    if (item.id === 'new-page') {
      setCategory('All notes');
      await createNote();
    } else if (item.id === 'quick-capture') {
      setShowCapture(true);
    } else if (item.id === 'inbox' || item.id === 'favorites') {
      if (await selectNote(null)) setCategory(item.id === 'inbox' ? 'Inbox' : 'Favorites');
    }
  }

  async function reloadConflictedNote() {
    if (!selected) return;
    try {
      const latest = await api<{ note: Note }>(`/notes/${selected.id}`);
      setSelected(latest.note);
      setNotes(current => current.map(note => note.id === latest.note.id ? latest.note : note));
      setDraftDirty(false);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      flash(err instanceof Error ? err.message : 'Could not reload page');
    }
  }

  async function createNote(parentId: string | null = null) {
    if (draftDirty && !await saveNote()) return;
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
      setDraftDirty(false);
      setSaveStatus('saved');
      flash('New note created');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create note');
    }
  }

  async function createCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftDirty && !await saveNote()) {
      setCaptureError('Save or resolve the open page edits before capturing.');
      return;
    }
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
    if (draftDirty && !await saveNote()) return;
    try {
      const latest = draftDirty && selected?.id === note.id
        ? await api<{ note: Note }>(`/notes/${note.id}`)
        : { note };
      const result = await api<{ note: Note }>(`/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ inbox: false, version: latest.note.version }),
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
    if (draftDirty && !await saveNote()) return;
    try {
      const target = draftDirty && selected?.id === note.id
        ? (await api<{ note: Note }>(`/notes/${note.id}`)).note
        : note;
      const result = await api<{ bookmarked: boolean; version: number }>(`/notes/${note.id}/bookmark`, { method: 'POST' });
      const updated = { ...target, bookmarked: result.bookmarked, version: result.version };
      setNotes(current => current.map(item => item.id === note.id ? updated : item));
      if (selected?.id === note.id) setSelected(updated);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update favorite');
    }
  }

  async function removeNote() {
    if (!selected || !window.confirm('Delete this note?')) return;
    if (draftDirty && !await saveNote()) return;
    setDeleting(true);
    try {
      await api(`/notes/${selected.id}`, { method: 'DELETE' });
      const remaining = notes.filter(note => note.id !== selected.id);
      setNotes(remaining);
      setSelected(remaining[0] || null);
      setDraftDirty(false);
      setSaveStatus('saved');
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
          <button className={category === 'Inbox' ? 'nav-item active' : 'nav-item'} onClick={() => {
            void selectNote(null).then(saved => {
              if (saved) setCategory('Inbox');
            });
          }}><span>⌁</span> Inbox</button>
          <button className={category === 'Favorites' ? 'nav-item active' : 'nav-item'} onClick={() => setCategory('Favorites')}><span>♡</span> Favorites</button>
          {recentIds.some(id => notes.some(note => note.id === id)) && (
            <>
              <p className="nav-label categories-label">RECENT</p>
              {recentIds
                .map(id => notes.find(note => note.id === id))
                .filter((note): note is Note => Boolean(note))
                .map(note => (
                  <button key={note.id} className="nav-item recent-page" onClick={() => { void openPage(note); }}>
                    <span>{note.icon}</span><span className="recent-page-title">{note.title || 'Untitled'}</span>
                  </button>
                ))}
            </>
          )}
          <p className="nav-label categories-label">PRIVATE <button aria-label="Create page" onClick={() => createNote()}>＋</button></p>
          <PagesTree
            notes={notes.filter(note => !note.inbox)}
            selectedId={selected?.id}
            onSelect={openPage}
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
          <div className="breadcrumbs">
            <button onClick={async () => { if (await selectNote(null)) { setCategory('All notes'); setSearch(''); } }}>Workspace</button>
            {pageBreadcrumbs.map(crumb => (
              <span className="breadcrumb-segment" key={crumb.id}>
                <b>/</b>
                <button onClick={() => { void openPage(crumb); }}>{crumb.title || 'Untitled'}</button>
              </span>
            ))}
            <b>/</b><strong>{selected?.title || category}</strong>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes..." />
              <button type="button" className="search-palette-key" onClick={() => setShowCommandPalette(true)} aria-label="Open command palette">⌘ K</button>
            </label>
            <button className="command-open-button" onClick={() => setShowCommandPalette(true)} aria-label="Open command palette">⌘ K</button>
            <button className="quick-capture-top" onClick={() => setShowCapture(true)}>＋ Capture</button>
            <button className="icon-button" onClick={() => setShowMcp(true)} title="Connect GPT">✧</button>
            <button className="user-avatar" onClick={logout}>{user.username[0].toUpperCase()}</button>
          </div>
        </header>
        <div className={selected ? 'workspace mobile-editing' : 'workspace'}>
          <div className="notes-column">
            <div className="page-heading">
              <div>
                <p className="eyebrow">{category === 'Inbox' ? 'CAPTURED FOR LATER' : category === 'All notes' ? 'YOUR LIBRARY' : 'FILTERED NOTES'}</p>
                <h1>{category}</h1>
                <p className="muted">{category === 'Inbox' ? 'Thoughts and links to organize when you are ready.' : `${visibleNotes.length} ${visibleNotes.length === 1 ? 'note' : 'notes'} · Updated across your workspace`}</p>
              </div>
              <div className="view-toggle">
                <button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>☷</button>
                <button className={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')}>⊞</button>
              </div>
            </div>
            {message && <div className="toast">{message}</div>}
            {loading ? (
              <div className="empty-state"><span className="spinner" /> Loading notes…</div>
            ) : visibleNotes.length === 0 ? (
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
                {visibleNotes.map(note => (
                  <article
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected?.id === note.id}
                    className={`note-card ${selected?.id === note.id ? 'selected' : ''}`}
                    onClick={() => { void selectNote(note); }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void selectNote(note);
                      }
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        const cards = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.note-card') || []);
                        const index = cards.indexOf(event.currentTarget);
                        cards[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
                      }
                    }}
                  >
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
                  <button className="mobile-back" onClick={() => { void selectNote(null); }}>← Pages</button>
                  <span className={`saved-state save-${saveStatus}`}>
                    {saveStatus === 'saving' || saving ? 'Saving…' : saveStatus === 'dirty' ? 'Unsaved changes' : saveStatus === 'error' ? 'Save failed' : saveStatus === 'conflict' ? 'Conflict detected' : '✓ Saved'}
                  </span>
                  <div>
                    <button className="toolbar-button" onClick={() => toggleBookmark(selected)}>{selected.bookmarked ? '★' : '☆'}</button>
                    <button className="toolbar-button" onClick={removeNote} disabled={deleting} aria-label="Delete note" title="Delete note">
                      {deleting ? '…' : '⌫'}
                    </button>
                    {selected.inbox && <button className="move-capture-button" onClick={() => moveCaptureToPages(selected)}>Move to pages</button>}
                    <button className="save-button" onClick={() => { void saveNote(); }} disabled={saving || saveStatus === 'conflict'}>
                      {saving ? 'Saving…' : saveStatus === 'error' ? 'Retry save' : saveStatus === 'conflict' ? 'Resolve conflict' : 'Save now'} <span>⌘ S</span>
                    </button>
                  </div>
                </div>
                {saveStatus === 'conflict' && (
                  <div className="conflict-banner" role="alert">
                    <p>This page changed in another tab or app. Your local edits are still here.</p>
                    <button onClick={reloadConflictedNote}>Load latest</button>
                    <button onClick={() => { void saveNote(true); }}>Overwrite with my edits</button>
                  </div>
                )}
                <div className="editor-paper">
                  <div className="editor-icon">{selected.icon}</div>
                  <input className="title-input" value={selected.title} onChange={event => updateSelected('title', event.target.value)} placeholder="Untitled" />
                  <div className="editor-info">
                    <span>Last edited {relativeDate(selected.updated_at).toLowerCase()}</span><span>·</span><span>{wordCount} words</span>
                  </div>
                  {childPages.length > 0 && (
                    <div className="page-children">
                      <span>SUBPAGES</span>
                      {childPages.map(child => (
                        <button key={child.id} onClick={() => { void openPage(child); }}>
                          <span>{child.icon}</span>{child.title || 'Untitled'} <b>→</b>
                        </button>
                      ))}
                    </div>
                  )}
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
      {showCommandPalette && (
        <div className="modal-backdrop command-backdrop" onClick={() => setShowCommandPalette(false)}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={event => event.stopPropagation()}>
            <div className="command-search">
              <span>⌕</span>
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={event => { setCommandQuery(event.target.value); setCommandIndex(0); }}
                onKeyDown={event => {
                  if (event.key === 'Escape') setShowCommandPalette(false);
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCommandIndex(index => Math.min(index + 1, commandItems.length - 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCommandIndex(index => Math.max(index - 1, 0));
                  }
                  if (event.key === 'Enter' && commandItems[commandIndex]) {
                    event.preventDefault();
                    void runCommand(commandItems[commandIndex]);
                  }
                }}
                placeholder="Search pages or run a command…"
                aria-label="Search pages or run a command"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              {commandItems.length === 0 ? (
                <p className="command-empty">No pages or commands found.</p>
              ) : commandItems.map((item, index) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  className={`command-result ${index === commandIndex ? 'active' : ''}`}
                  onMouseEnter={() => setCommandIndex(index)}
                  onClick={() => { void runCommand(item); }}
                >
                  <span className="command-result-icon">{item.kind === 'page' ? item.note.icon : item.id === 'quick-capture' ? '⌁' : item.id === 'inbox' ? '↳' : item.id === 'favorites' ? '♡' : '＋'}</span>
                  <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                  {item.kind === 'page' && <kbd>↵</kbd>}
                </button>
              ))}
            </div>
            <footer><span>↑↓ Navigate</span><span>↵ Open</span><span>⌘ K Toggle</span></footer>
          </section>
        </div>
      )}
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
