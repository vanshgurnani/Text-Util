'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownEditor from '@/app/components/MarkdownEditor';
import PagesTree from '@/app/components/PagesTree';
import {
  ApiError,
  api,
  clearSession,
  DataColumn,
  DataRecord,
  DataTable,
  downloadWorkspaceExport,
  importWorkspace,
  Note,
  previewWorkspaceImport,
  shareNote,
  unshareNote,
  User,
} from '@/lib/api';

const categories = ['All notes', 'Personal', 'Work', 'Ideas', 'Reading', 'General'];
const icons = ['📄', '📝', '💡', '🚀', '📚', '🎯', '📌', '💼', '⚡', '☕', '🎨', '🌿', '🛠️', '✦', '⌁', '⭐', '💻', '🔮'];

const COVER_PRESETS: { id: string; name: string; bg: string }[] = [
  { id: 'sunset', name: 'Warm Sunset', bg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)' },
  { id: 'ocean', name: 'Ocean Azure', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'forest', name: 'Forest Sage', bg: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { id: 'clay', name: 'Desert Clay', bg: 'linear-gradient(135deg, #c79081 0%, #dfa579 100%)' },
  { id: 'minimal', name: 'Minimal Gray', bg: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' },
  { id: 'night', name: 'Obsidian Night', bg: 'linear-gradient(135deg, #243949 0%, #517fa4 100%)' },
];

const NOTION_TEMPLATES = [
  {
    id: 'weekly-planner',
    name: 'Weekly Planner',
    icon: '📅',
    desc: 'Plan tasks and priorities for Monday through Friday',
    content: `## 🎯 Weekly Priorities\n- [ ] Main milestone 1\n- [ ] Main milestone 2\n\n---\n\n### 🗓 Monday\n- [ ] Morning standup\n- [ ] Deep work session\n\n### 🗓 Tuesday\n- [ ] Review PRs\n- [ ] Project alignment\n\n### 🗓 Wednesday\n- [ ] Mid-week review\n- [ ] Documentation updates\n\n### 🗓 Thursday\n- [ ] Client check-in\n- [ ] Polish UI designs\n\n### 🗓 Friday\n- [ ] Weekly retrospective\n- [ ] Clean inbox & plan next week\n`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    icon: '📝',
    desc: 'Attendees, agenda, discussion notes, and action items',
    content: `> 💡 **Date:** Today | **Facilitator:** @Me\n\n### 👥 Attendees\n- Member 1\n- Member 2\n\n### 📋 Agenda\n1. Project status check\n2. Key decisions & blockers\n3. Deliverables\n\n### 💬 Discussion & Notes\n- \n\n### ✅ Action Items\n- [ ] Send summary email\n- [ ] Schedule follow-up sync\n`,
  },
  {
    id: 'project-roadmap',
    name: 'Project Roadmap',
    icon: '🚀',
    desc: 'Track milestones, deliverables, and team ownership',
    content: `> 🚀 **Mission:** Build and launch the new version.\n\n### 📌 Phase 1: Planning\n- [x] Align on requirements\n- [x] Architecture design\n\n### 📌 Phase 2: Implementation\n- [ ] Database views (Board, Gallery, Table)\n- [ ] Dark mode & theme polish\n\n### 📌 Phase 3: Launch\n- [ ] Verification tests\n- [ ] Public deployment\n\n| Milestone | Owner | Status | Target Date |\n|---|---|---|---|\n| Core Architecture | Engineering | Done | Oct 2026 |\n| Features & Polish | Design & Eng | In Progress | Nov 2026 |\n| Public Release | All | Planned | Dec 2026 |\n`,
  },
  {
    id: 'reading-list',
    name: 'Reading List',
    icon: '📚',
    desc: 'Keep track of books, articles, and favorite quotes',
    content: `### 📖 Currently Reading\n- **Title:** \n  - *Author:* \n  - *Key take-aways:* \n\n### ⭐ Recommended Reads\n- [ ] Atomic Habits — James Clear\n- [ ] Deep Work — Cal Newport\n- [ ] The Psychology of Money — Morgan Housel\n\n### 💬 Favorite Excerpts\n> “Simplicity is prerequisite for reliability.” — Edsger W. Dijkstra\n`,
  },
  {
    id: 'personal-wiki',
    name: 'Personal Wiki',
    icon: '🌐',
    desc: 'Central knowledge hub for links, docs, and references',
    content: `## 🏛 Welcome to your Workspace Hub\n\n> 💡 This page acts as the central dashboard for all your thoughts and projects.\n\n### 📂 Quick Sections\n- 💼 **Work:** Active client projects and specs\n- 🧠 **Ideas:** Concepts and creative drafts\n- 🛠️ **Reference:** Useful links, code snippets, and cheat sheets\n`,
  },
];

function relativeDate(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

function tagColorClass(tag: string) {
  const colorIndex = Array.from(tag).reduce((hash, character) => (hash + character.charCodeAt(0)) % 6, 0);
  return `tag-color-${colorIndex}`;
}

function emptyCellValue(column: DataColumn) {
  return column.type === 'checkbox' ? false : null;
}

export default function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selected, setSelected] = useState<Note | null>(null);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(false);

  // Trash & Recycle Bin State
  const [showTrashModal, setShowTrashModal] = useState(false);
  
  // Database State & Multi-View Mode (Table, Board, Gallery)
  const [selectedTable, setSelectedTable] = useState<DataTable | null>(null);
  const [tableRecords, setTableRecords] = useState<DataRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [dbViewMode, setDbViewMode] = useState<'table' | 'board' | 'gallery'>('table');
  const [tableFilterQuery, setTableFilterQuery] = useState('');
  const [showAddColPopover, setShowAddColPopover] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<DataColumn['type']>('text');
  const [newColOptions, setNewColOptions] = useState('Todo, In progress, Done');

  // Navigation & Workspace State
  const [category, setCategory] = useState('All notes');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [layoutMode, setLayoutMode] = useState<'document' | 'split'>('document');
  const [sortMode, setSortMode] = useState<'updated' | 'created' | 'title'>('updated');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved');
  const [draftDirty, setDraftDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [showMcp, setShowMcp] = useState(false);
  const [mcpToken, setMcpToken] = useState('');
  const [showCapture, setShowCapture] = useState(false);
  const [showNewPageDialog, setShowNewPageDialog] = useState(false);
  const [showTableNameDialog, setShowTableNameDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newPageError, setNewPageError] = useState('');
  const [creatingTable, setCreatingTable] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureContent, setCaptureContent] = useState('');
  const [captureSource, setCaptureSource] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [showPortability, setShowPortability] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ count: number; skipped_files: number; pages: { title: string; path: string }[] } | null>(null);
  const [importError, setImportError] = useState('');
  const [previewingImport, setPreviewingImport] = useState(false);
  const [importingWorkspace, setImportingWorkspace] = useState(false);
  const [exportingWorkspace, setExportingWorkspace] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  
  // Notion specific styles
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [fullWidth, setFullWidth] = useState(false);
  const [smallText, setSmallText] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [activeCover, setActiveCover] = useState<string | null>(null);
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);
  const [showBacklinks, setShowBacklinks] = useState(true);

  const commandInputRef = useRef<HTMLInputElement>(null);
  const editRevision = useRef(0);
  const saveInFlight = useRef(false);
  const pageMenuRef = useRef<HTMLDivElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const coverPickerRef = useRef<HTMLDivElement>(null);
  const addColPopoverRef = useRef<HTMLDivElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const archiveFileInputRef = useRef<HTMLInputElement>(null);
  const [archiveDragActive, setArchiveDragActive] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('noteos_user') || localStorage.getItem('noteform_user');
    const token = localStorage.getItem('noteos_token') || localStorage.getItem('noteform_token');
    if (!stored || !token) {
      router.replace('/login');
      return;
    }
    setUser(JSON.parse(stored));
    
    // Load Dark Mode
    const savedDark = localStorage.getItem('noteform_dark_mode') === 'true';
    setDarkMode(savedDark);

    try {
      const recent = JSON.parse(localStorage.getItem(`noteform_recent_${JSON.parse(stored).id}`) || '[]');
      if (Array.isArray(recent)) setRecentIds(recent.filter((id): id is string => typeof id === 'string').slice(0, 5));
    } catch {
      localStorage.removeItem(`noteform_recent_${JSON.parse(stored).id}`);
    }
    loadNotes();
    loadTables();
  }, []);

  function toggleDarkMode() {
    setDarkMode(curr => {
      const next = !curr;
      localStorage.setItem('noteform_dark_mode', String(next));
      return next;
    });
  }

  // Sync active page cover from localStorage
  useEffect(() => {
    if (selected) {
      const savedCover = localStorage.getItem(`noteform_cover_${selected.id}`);
      setActiveCover(savedCover);
    } else {
      setActiveCover(null);
    }
    setShowIconPicker(false);
    setShowCoverPicker(false);
    setShowPageMenu(false);
    setShowShareModal(false);
  }, [selected?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pageMenuRef.current && !pageMenuRef.current.contains(event.target as Node)) {
        setShowPageMenu(false);
      }
      if (sharePopoverRef.current && !sharePopoverRef.current.contains(event.target as Node)) {
        setShowShareModal(false);
      }
      if (iconPickerRef.current && !iconPickerRef.current.contains(event.target as Node)) {
        setShowIconPicker(false);
      }
      if (coverPickerRef.current && !coverPickerRef.current.contains(event.target as Node)) {
        setShowCoverPicker(false);
      }
      if (addColPopoverRef.current && !addColPopoverRef.current.contains(event.target as Node)) {
        setShowAddColPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleGlobalShortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setNewPageError('');
        setShowNewPageDialog(true);
        return;
      }
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
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        toggleDarkMode();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setSidebarCollapsed(curr => !curr);
      }
    }
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  async function loadNotes() {
    try {
      const result = await api<{ notes: Note[] }>('/notes');
      const loadedNotes = result.notes.map(note => ({
        ...note,
        tags: Array.isArray(note.tags) ? note.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      }));
      setNotes(loadedNotes);
      const requestedTableId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('table_id') : null;
      const activeNotes = loadedNotes.filter(n => n.category !== 'Trash');
      if (!requestedTableId && !selected && !selectedTable && activeNotes[0]) {
        setSelected(activeNotes[0]);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('token')) router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  async function loadTables() {
    try {
      const result = await api<{ tables: DataTable[] }>('/tables');
      setTables(result.tables);
      const requestedTableId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('table_id') : null;
      if (requestedTableId) {
        const targetTable = result.tables.find(t => t.id === requestedTableId);
        if (targetTable) {
          setSelected(null);
          setSelectedTable(targetTable);
          void loadTableRecords(targetTable.id);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('token')) router.replace('/login');
      else flash(err instanceof Error ? err.message : 'Could not load tables');
    } finally {
      setLoadingTables(false);
    }
  }

  const loadTableRecords = useCallback(async (tableId: string) => {
    setLoadingRecords(true);
    try {
      const result = await api<{ records: DataRecord[] }>(`/tables/${tableId}/records?limit=500`);
      setTableRecords(result.records);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not load records');
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  async function selectTable(table: DataTable | null) {
    if (draftDirty && !await saveNote()) return;
    setSelected(null);
    setSelectedTable(table);
    setShowAddColPopover(false);
    setMobileNavOpen(false);
    if (table) {
      void loadTableRecords(table.id);
    } else {
      setTableRecords([]);
    }
  }

  async function addTableRecord(initialValues: Record<string, string | number | boolean | null> = {}) {
    if (!selectedTable) return;
    try {
      const defaultValues = Object.fromEntries(selectedTable.columns.map(col => [col.id, emptyCellValue(col)]));
      const values = { ...defaultValues, ...initialValues };
      const result = await api<{ record: DataRecord }>(`/tables/${selectedTable.id}/records`, {
        method: 'POST',
        body: JSON.stringify({ values }),
      });
      setTableRecords(curr => [...curr, result.record]);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add record');
    }
  }

  async function updateTableCell(record: DataRecord, column: DataColumn, rawValue: string | boolean) {
    if (!selectedTable) return;
    const value = column.type === 'number'
      ? rawValue === '' ? null : Number(rawValue)
      : rawValue === '' ? null : rawValue;
    if (column.type === 'number' && value !== null && !Number.isFinite(value)) {
      flash(`${column.name} must be a valid number`);
      return;
    }
    try {
      const result = await api<{ record: DataRecord }>(`/tables/${selectedTable.id}/records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: record.version, values: { [column.id]: value } }),
      });
      setTableRecords(curr => curr.map(item => item.id === record.id ? result.record : item));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update record');
    }
  }

  async function deleteTableRecord(record: DataRecord) {
    if (!selectedTable || !window.confirm('Delete this record?')) return;
    try {
      await api(`/tables/${selectedTable.id}/records/${record.id}`, { method: 'DELETE' });
      setTableRecords(curr => curr.filter(item => item.id !== record.id));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete record');
    }
  }

  async function addTableColumn(e: FormEvent) {
    e.preventDefault();
    if (!selectedTable || !newColName.trim()) return;
    try {
      const result = await api<{ table: DataTable }>(`/tables/${selectedTable.id}/columns`, {
        method: 'POST',
        body: JSON.stringify({
          name: newColName.trim(),
          type: newColType,
          options: newColType === 'select' ? newColOptions.split(',').map(s => s.trim()).filter(Boolean) : [],
        }),
      });
      setSelectedTable(result.table);
      setTables(curr => curr.map(t => t.id === result.table.id ? result.table : t));
      setNewColName('');
      setShowAddColPopover(false);
      flash('Column added');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add column');
    }
  }

  async function renameTable(table: DataTable) {
    const nextName = window.prompt('Table name', table.name)?.trim();
    if (!nextName || nextName === table.name) return;
    try {
      const result = await api<{ table: DataTable }>(`/tables/${table.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      });
      setTables(curr => curr.map(t => t.id === table.id ? result.table : t));
      if (selectedTable?.id === table.id) {
        setSelectedTable(result.table);
      }
      flash('Table renamed');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not rename table');
    }
  }

  async function deleteTable(table: DataTable) {
    if (!window.confirm(`Delete table "${table.name}" and all records permanently?`)) return;
    try {
      await api(`/tables/${table.id}`, { method: 'DELETE' });
      const remaining = tables.filter(t => t.id !== table.id);
      setTables(remaining);
      if (selectedTable?.id === table.id) {
        setSelectedTable(null);
        const active = notes.filter(n => n.category !== 'Trash');
        if (active[0]) setSelected(active[0]);
      }
      flash('Table deleted');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete table');
    }
  }

  // CSV Export & Import Handlers
  function exportDatabaseCSV() {
    if (!selectedTable) return;
    const headers = selectedTable.columns.map(c => `"${c.name.replace(/"/g, '""')}"`);
    const rows = tableRecords.map(rec =>
      selectedTable.columns.map(col => {
        const val = rec.values[col.id];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTable.name.toLowerCase().replace(/\s+/g, '-')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Database exported to CSV');
  }

  async function handleImportCSVFile(file: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length === 0) {
        flash('CSV file is empty');
        return;
      }
      const parseCSVLine = (line: string) => {
        const values: string[] = [];
        let curr = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            values.push(curr.trim());
            curr = '';
          } else curr += char;
        }
        values.push(curr.trim());
        return values.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
      };

      const headerNames = parseCSVLine(lines[0]);
      const columns = headerNames.map(name => ({
        name: name || 'Column',
        type: 'text' as const,
      }));

      const tableName = file.name.replace(/\.[^/.]+$/, '') || 'Imported Database';
      const tblResult = await api<{ table: DataTable }>('/tables', {
        method: 'POST',
        body: JSON.stringify({ name: tableName, columns }),
      });

      for (let i = 1; i < Math.min(lines.length, 100); i++) {
        const rowVals = parseCSVLine(lines[i]);
        const recordValues: Record<string, string> = {};
        tblResult.table.columns.forEach((col, cIdx) => {
          recordValues[col.id] = rowVals[cIdx] || '';
        });
        await api(`/tables/${tblResult.table.id}/records`, {
          method: 'POST',
          body: JSON.stringify({ values: recordValues }),
        });
      }

      setTables(curr => [tblResult.table, ...curr]);
      void selectTable(tblResult.table);
      flash(`Imported "${tableName}" successfully`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not import CSV');
    }
  }

  // Active notes vs Trashed notes
  const activeNotes = useMemo(() => notes.filter(n => n.category !== 'Trash'), [notes]);
  const trashedNotes = useMemo(() => notes.filter(n => n.category === 'Trash'), [notes]);

  const visibleTableRecords = useMemo(() => {
    if (!tableFilterQuery.trim()) return tableRecords;
    const q = tableFilterQuery.trim().toLowerCase();
    return tableRecords.filter(record =>
      Object.values(record.values).some(val => String(val ?? '').toLowerCase().includes(q))
    );
  }, [tableRecords, tableFilterQuery]);

  // Kanban Board Columns (first select column or default Status)
  const boardStatusColumn = useMemo(() => {
    if (!selectedTable) return null;
    return selectedTable.columns.find(c => c.type === 'select') || null;
  }, [selectedTable]);

  const boardColumns = useMemo(() => {
    if (boardStatusColumn && boardStatusColumn.options.length > 0) {
      return [...boardStatusColumn.options, 'No status'];
    }
    return ['Todo', 'In progress', 'Done', 'No status'];
  }, [boardStatusColumn]);

  const visibleWorkspaceItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const visibleNotes = activeNotes.filter(note => {
      if (category === 'Inbox' && !note.inbox) return false;
      if (category === 'Favorites' && !note.bookmarked) return false;
      if (category === 'Pinned' && !note.pinned) return false;
      if (!['All notes', 'Inbox', 'Favorites', 'Pinned'].includes(category) && note.category !== category) return false;
      if (selectedTag && !note.tags.includes(selectedTag)) return false;
      if (!query) return true;
      return [note.title, note.content, note.source_url || '']
        .some(value => value.toLocaleLowerCase().includes(query));
    });

    const visibleTables = category === 'All notes' && !selectedTag
      ? tables.filter(table => !query || table.name.toLocaleLowerCase().includes(query))
      : [];
    const items: ({ kind: 'page'; item: Note } | { kind: 'table'; item: DataTable })[] = [
      ...visibleNotes.map(item => ({ kind: 'page' as const, item })),
      ...visibleTables.map(item => ({ kind: 'table' as const, item })),
    ];

    return items.sort((left, right) => {
      if (sortMode === 'title') {
        const leftTitle = left.kind === 'table' ? left.item.name : left.item.title;
        const rightTitle = right.kind === 'table' ? right.item.name : right.item.title;
        return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: 'base' });
      }
      const leftDate = new Date(sortMode === 'created' ? left.item.created_at : left.item.updated_at).getTime();
      const rightDate = new Date(sortMode === 'created' ? right.item.created_at : right.item.updated_at).getTime();
      return rightDate - leftDate;
    });
  }, [activeNotes, tables, search, category, selectedTag, sortMode]);

  const visiblePageCount = visibleWorkspaceItems.filter(item => item.kind === 'page').length;
  const visibleTableCount = visibleWorkspaceItems.filter(item => item.kind === 'table').length;

  const favoriteNotes = useMemo(
    () => activeNotes.filter(note => (note.bookmarked || note.pinned) && !note.inbox),
    [activeNotes]
  );

  const availableTags = useMemo(
    () => Array.from(new Set(activeNotes.flatMap(note => note.tags))).sort((left, right) => left.localeCompare(right)),
    [activeNotes],
  );

  // Backlinks for the currently selected page
  const backlinks = useMemo(() => {
    if (!selected) return [];
    const targetTitle = (selected.title || 'Untitled').toLowerCase();
    return activeNotes.filter(n =>
      n.id !== selected.id &&
      n.content &&
      (n.content.toLowerCase().includes(`[[${targetTitle}]]`) || n.content.includes(`#page-mention:${encodeURIComponent(selected.title)}`))
    );
  }, [activeNotes, selected]);

  const pageBreadcrumbs = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(activeNotes.map(note => [note.id, note]));
    const path: Note[] = [];
    let parentId = selected.parent_id;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      path.unshift(parent);
      parentId = parent.parent_id;
    }
    return path;
  }, [activeNotes, selected]);

  const childPages = useMemo(
    () => selected ? activeNotes.filter(note => note.parent_id === selected.id && !note.inbox) : [],
    [activeNotes, selected],
  );

  const commandItems = useMemo(() => {
    const query = commandQuery.trim().toLocaleLowerCase();
    const actions = [
      { id: 'new-page', title: 'Create a new page', subtitle: 'Add a page to your workspace', kind: 'action' as const },
      { id: 'new-table', title: 'Create a database table', subtitle: 'Add structured rows and columns', kind: 'action' as const },
      { id: 'quick-capture', title: 'Quick capture', subtitle: 'Save a thought or link to Inbox', kind: 'action' as const },
      { id: 'toggle-dark', title: 'Toggle Dark Mode', subtitle: 'Switch between light and dark themes', kind: 'action' as const },
      { id: 'open-trash', title: 'Open Trash', subtitle: 'View and restore deleted pages', kind: 'action' as const },
    ].filter(item => !query || `${item.title} ${item.subtitle}`.toLocaleLowerCase().includes(query));
    const pages = activeNotes
      .filter(note => !note.inbox && (!query || `${note.title} ${note.content} ${note.source_url || ''}`.toLocaleLowerCase().includes(query)))
      .map(note => ({ id: note.id, title: note.title || 'Untitled', subtitle: note.category, kind: 'page' as const, note }));
    const tbls = tables
      .filter(table => !query || table.name.toLocaleLowerCase().includes(query))
      .map(table => ({ id: `tbl-${table.id}`, title: table.name, subtitle: 'Database', kind: 'table' as const, table }));
    return [...actions, ...pages, ...tbls].slice(0, 30);
  }, [commandQuery, activeNotes, tables]);

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

  function updateSelected(key: 'title' | 'content' | 'category' | 'icon', value: string): void;
  function updateSelected(key: 'tags', value: string[]): void;
  function updateSelected(key: 'title' | 'content' | 'category' | 'tags' | 'icon', value: string | string[]) {
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
          tags: selected.tags,
          icon: selected.icon,
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

  function addTag(value = tagInput) {
    if (!selected) return;
    const tag = value.trim().toLocaleLowerCase();
    setTagInput('');
    if (!tag) return;
    if (tag.length > 32) {
      flash('Tags must be 32 characters or fewer');
      return;
    }
    if (selected.tags.length >= 20 && !selected.tags.includes(tag)) {
      flash('A page can have up to 20 tags');
      return;
    }
    if (selected.tags.some(existing => existing.toLocaleLowerCase() === tag)) return;
    updateSelected('tags', [...selected.tags, tag]);
  }

  function handleSetCover(bg: string | null) {
    if (!selected) return;
    if (bg) {
      localStorage.setItem(`noteform_cover_${selected.id}`, bg);
      setActiveCover(bg);
    } else {
      localStorage.removeItem(`noteform_cover_${selected.id}`);
      setActiveCover(null);
    }
    setShowCoverPicker(false);
  }

  function handleSetIcon(icon: string) {
    if (!selected) return;
    updateSelected('icon', icon);
    setShowIconPicker(false);
  }

  // Template insertion
  function applyTemplate(tpl: typeof NOTION_TEMPLATES[0]) {
    if (!selected) return;
    updateSelected('content', tpl.content);
    if (!selected.title || selected.title === 'Untitled') {
      updateSelected('title', tpl.name);
    }
    updateSelected('icon', tpl.icon);
    flash(`Applied ${tpl.name} template`);
  }

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

  async function selectNote(note: Note | null): Promise<boolean> {
    if (draftDirty && !await saveNote()) return false;
    setSelectedTable(null);
    setSelected(note);
    setTagInput('');
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
    setSelectedTag(null);
    setSearch('');
    setMobileNavOpen(false);
    return true;
  }

  async function runCommand(item: (typeof commandItems)[number]) {
    setShowCommandPalette(false);
    setCommandQuery('');
    if (item.kind === 'page') {
      await openPage(item.note);
      return;
    }
    if (item.kind === 'table') {
      void selectTable(item.table);
      return;
    }
    if (item.id === 'new-page') {
      setCategory('All notes');
      setSelectedTag(null);
      setShowNewPageDialog(true);
    } else if (item.id === 'new-table') {
      startTableCreation();
    } else if (item.id === 'quick-capture') {
      setShowCapture(true);
    } else if (item.id === 'toggle-dark') {
      toggleDarkMode();
    } else if (item.id === 'open-trash') {
      setShowTrashModal(true);
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
      setSelectedTable(null);
      setSelected(result.note);
      setDraftDirty(false);
      setSaveStatus('saved');
      setSelectedTag(null);
      setMobileNavOpen(false);
      flash('New page created');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not create note');
    }
  }

  async function createStructuredTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftDirty && !await saveNote()) {
      setNewPageError('Save or resolve open edits before creating a table.');
      return;
    }
    setCreatingTable(true);
    setNewPageError('');
    try {
      const result = await api<{ table: DataTable }>('/tables', {
        method: 'POST',
        body: JSON.stringify({
          name: newTableName,
          columns: [
            { name: 'Name', type: 'text' },
            { name: 'Status', type: 'select', options: ['Todo', 'In progress', 'Done'] },
          ],
        }),
      });
      setTables(current => [result.table, ...current]);
      setShowNewPageDialog(false);
      setShowTableNameDialog(false);
      setNewTableName('');
      setMobileNavOpen(false);
      void selectTable(result.table);
      flash('Database created');
    } catch (err) {
      setNewPageError(err instanceof Error ? err.message : 'Could not create table');
    } finally {
      setCreatingTable(false);
    }
  }

  function startTableCreation() {
    setNewTableName('');
    setNewPageError('');
    setShowNewPageDialog(false);
    setShowTableNameDialog(true);
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
      flash(result.bookmarked ? 'Added to Favorites' : 'Removed from Favorites');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update favorite');
    }
  }

  async function togglePin(note: Note) {
    if (draftDirty && !await saveNote()) return;
    try {
      const target = draftDirty && selected?.id === note.id
        ? (await api<{ note: Note }>(`/notes/${note.id}`)).note
        : note;
      const result = await api<{ pinned: boolean; version: number }>(`/notes/${note.id}/pin`, { method: 'POST' });
      const updated = { ...target, pinned: result.pinned, version: result.version };
      setNotes(current => current.map(item => item.id === note.id ? updated : item));
      if (selected?.id === note.id) setSelected(updated);
      flash(result.pinned ? 'Page pinned' : 'Page unpinned');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not update pin');
    }
  }

  async function handleTogglePublicShare(note: Note) {
    if (shareLoading) return;
    setShareLoading(true);
    try {
      if (note.is_public) {
        await unshareNote(note.id);
        const updated = { ...note, is_public: false };
        setNotes(current => current.map(item => item.id === note.id ? updated : item));
        if (selected?.id === note.id) setSelected(updated);
        flash('Public sharing turned off');
      } else {
        const res = await shareNote(note.id);
        const updated = { ...note, is_public: true, public_id: res.public_id };
        setNotes(current => current.map(item => item.id === note.id ? updated : item));
        if (selected?.id === note.id) setSelected(updated);
        flash('Note published! Anyone with the link can view it.');
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not change public sharing');
    } finally {
      setShareLoading(false);
    }
  }

  // Soft Delete to Trash
  async function moveNoteToTrash(targetNote?: Note) {
    const noteToTrash = targetNote || selected;
    if (!noteToTrash) return;
    try {
      const result = await api<{ note: Note }>(`/notes/${noteToTrash.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: 'Trash', version: noteToTrash.version }),
      });
      setNotes(current => current.map(item => item.id === noteToTrash.id ? result.note : item));
      if (selected?.id === noteToTrash.id) {
        const remaining = activeNotes.filter(n => n.id !== noteToTrash.id);
        setSelected(remaining[0] || null);
      }
      flash(`"${noteToTrash.title || 'Untitled'}" moved to Trash`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move page to Trash');
    }
  }

  // Restore Note from Trash
  async function restoreNoteFromTrash(note: Note) {
    try {
      const result = await api<{ note: Note }>(`/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: 'General', version: note.version }),
      });
      setNotes(current => current.map(item => item.id === note.id ? result.note : item));
      flash(`Restored "${note.title || 'Untitled'}"`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not restore note');
    }
  }

  // Permanently Delete Note
  async function permanentlyDeleteNote(note: Note) {
    if (!window.confirm(`Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`)) return;
    try {
      await api(`/notes/${note.id}`, { method: 'DELETE' });
      setNotes(current => current.filter(item => item.id !== note.id));
      flash('Permanently deleted');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete note');
    }
  }

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2400);
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

  async function inspectWorkspaceArchive(file: File | null) {
    setImportFile(file);
    setImportPreview(null);
    setImportError('');
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setImportError('Choose a ZIP archive no larger than 20 MB.');
      return;
    }
    setPreviewingImport(true);
    try {
      setImportPreview(await previewWorkspaceImport(file));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read this archive');
    } finally {
      setPreviewingImport(false);
    }
  }

  async function exportWorkspace() {
    if (draftDirty && !await saveNote()) return;
    setExportingWorkspace(true);
    try {
      const blob = await downloadWorkspaceExport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'noteos-workspace.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash('Workspace export downloaded');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not export workspace');
    } finally {
      setExportingWorkspace(false);
    }
  }

  async function confirmWorkspaceImport() {
    if (!importFile || !importPreview || importingWorkspace) return;
    if (draftDirty && !await saveNote()) return;
    setImportingWorkspace(true);
    setImportError('');
    try {
      const result = await importWorkspace(importFile);
      setImportFile(null);
      setImportPreview(null);
      setShowPortability(false);
      await loadNotes();
      flash(`${result.imported} ${result.imported === 1 ? 'page' : 'pages'} added to your workspace`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import workspace');
    } finally {
      setImportingWorkspace(false);
    }
  }

  if (!user) {
    return (
      <div className={`notion-loading-screen ${darkMode ? 'dark-mode' : ''}`}>
        <span className="notion-spinner" />
        <p>Opening workspace…</p>
      </div>
    );
  }

  return (
    <main className={`notion-app-shell ${darkMode ? 'dark-mode' : ''} ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
      {mobileNavOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      
      {/* Hidden CSV file picker */}
      <input
        type="file"
        ref={csvFileInputRef}
        style={{ display: 'none' }}
        accept=".csv,text/csv"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void handleImportCSVFile(file);
          e.target.value = '';
        }}
      />

      {/* Notion Sidebar */}
      <aside className="notion-sidebar">
        <div className="notion-sidebar-header">
          <div className="notion-workspace-user">
            <div className="notion-workspace-avatar">{user.username[0].toUpperCase()}</div>
            <div className="notion-workspace-meta">
              <span className="notion-workspace-name">{user.username}&apos;s Notion</span>
              <span className="notion-plan-badge">Personal</span>
            </div>
          </div>
          <button
            type="button"
            className="notion-collapse-btn"
            title="Collapse sidebar (⌘\)"
            onClick={() => setSidebarCollapsed(true)}
          >
            «
          </button>
        </div>

        {/* Quick Nav Tools */}
        <div className="notion-sidebar-quicklinks">
          <button
            type="button"
            className="notion-nav-row"
            onClick={() => setShowCommandPalette(true)}
          >
            <span className="notion-nav-icon">⌕</span>
            <span className="notion-nav-text">Search</span>
            <kbd className="notion-nav-kbd">⌘K</kbd>
          </button>

          <button
            type="button"
            className={`notion-nav-row ${category === 'Inbox' ? 'active' : ''}`}
            onClick={() => {
              void selectNote(null).then(saved => {
                if (saved) { setSelectedTag(null); setCategory('Inbox'); }
              });
            }}
          >
            <span className="notion-nav-icon">⌁</span>
            <span className="notion-nav-text">Inbox</span>
            {activeNotes.filter(n => n.inbox).length > 0 && (
              <span className="notion-nav-badge">{activeNotes.filter(n => n.inbox).length}</span>
            )}
          </button>

          <button
            type="button"
            className={`notion-nav-row ${category === 'All notes' && !selected && !selectedTable ? 'active' : ''}`}
            onClick={() => {
              void selectNote(null).then(saved => {
                if (saved) { setSelectedTag(null); setCategory('All notes'); }
              });
            }}
          >
            <span className="notion-nav-icon">▤</span>
            <span className="notion-nav-text">All content</span>
            <span className="notion-nav-count">{activeNotes.length + tables.length}</span>
          </button>
        </div>

        {/* Scrollable Tree Section */}
        <div className="notion-sidebar-scroll">
          {/* Favorites Section */}
          {favoriteNotes.length > 0 && (
            <div className="notion-sidebar-section">
              <div className="notion-section-title-row" onClick={() => setFavoritesExpanded(e => !e)}>
                <span className="notion-section-arrow">{favoritesExpanded ? '▾' : '▸'}</span>
                <span className="notion-section-title">FAVORITES</span>
              </div>
              {favoritesExpanded && (
                <div className="notion-section-list">
                  {favoriteNotes.map(note => (
                    <button
                      key={`fav-${note.id}`}
                      type="button"
                      className={`notion-nav-row ${selected?.id === note.id ? 'active' : ''}`}
                      onClick={() => { void openPage(note); }}
                    >
                      <span className="notion-nav-icon">{note.icon || '📄'}</span>
                      <span className="notion-nav-text">{note.title || 'Untitled'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workspace Pages Tree */}
          <div className="notion-sidebar-section">
            <div className="notion-section-title-row">
              <span
                className="notion-section-toggle-clickable"
                onClick={() => setWorkspaceExpanded(e => !e)}
              >
                <span className="notion-section-arrow">{workspaceExpanded ? '▾' : '▸'}</span>
                <span className="notion-section-title">PRIVATE</span>
              </span>
              <button
                type="button"
                className="notion-section-add-btn"
                title="Add a page"
                onClick={() => { void createNote(); }}
              >
                ＋
              </button>
            </div>
            {workspaceExpanded && (
              <PagesTree
                notes={activeNotes.filter(note => !note.inbox)}
                selectedId={selected?.id}
                onSelect={openPage}
                onCreateChild={parentId => createNote(parentId)}
                onDelete={moveNoteToTrash}
                onToggleBookmark={toggleBookmark}
                onTogglePin={togglePin}
              />
            )}
          </div>

          {/* Databases Section */}
          <div className="notion-sidebar-section">
            <div className="notion-section-title-row">
              <span className="notion-section-title">DATABASES</span>
              <button
                type="button"
                className="notion-section-add-btn"
                title="Add a table"
                onClick={startTableCreation}
              >
                ＋
              </button>
            </div>
            {tables.length > 0 ? (
              tables.map(table => (
                <button
                  key={table.id}
                  type="button"
                  className={`notion-nav-row ${selectedTable?.id === table.id ? 'active' : ''}`}
                  onClick={() => { void selectTable(table); }}
                >
                  <span className="notion-nav-icon">▦</span>
                  <span className="notion-nav-text">{table.name}</span>
                </button>
              ))
            ) : (
              <button type="button" className="notion-empty-table-btn" onClick={startTableCreation}>
                ＋ New database
              </button>
            )}
          </div>

          {/* Categories & Tags */}
          <div className="notion-sidebar-section">
            <div className="notion-section-title-row">
              <span className="notion-section-title">CATEGORIES</span>
            </div>
            {categories.slice(1).map(item => (
              <button
                key={item}
                type="button"
                className={`notion-nav-row ${category === item ? 'active' : ''}`}
                onClick={() => {
                  void selectNote(null).then(saved => {
                    if (saved) { setSelectedTag(null); setCategory(item); }
                  });
                }}
              >
                <i className={`category-dot ${item.toLowerCase()}`} />
                <span className="notion-nav-text">{item}</span>
              </button>
            ))}
          </div>

          {availableTags.length > 0 && (
            <div className="notion-sidebar-section">
              <div className="notion-section-title-row">
                <span className="notion-section-title">TAGS</span>
              </div>
              {availableTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`notion-nav-row ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => {
                    void selectNote(null).then(saved => {
                      if (saved) { setCategory('All notes'); setSelectedTag(tag === selectedTag ? null : tag); }
                    });
                  }}
                >
                  <span className="notion-tag-hash">#</span>
                  <span className="notion-nav-text">{tag}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="notion-sidebar-footer">
          <button
            type="button"
            className="notion-nav-row"
            onClick={() => setShowTrashModal(true)}
          >
            <span className="notion-nav-icon">🗑</span>
            <span className="notion-nav-text">Trash</span>
            {trashedNotes.length > 0 && <span className="notion-nav-count">{trashedNotes.length}</span>}
          </button>

          <button
            type="button"
            className="notion-nav-row"
            onClick={() => setShowPortability(true)}
          >
            <span className="notion-nav-icon">⇄</span>
            <span className="notion-nav-text">Import / Export</span>
          </button>

          <button
            type="button"
            className="notion-nav-row"
            onClick={() => setShowMcp(true)}
          >
            <span className="notion-nav-icon">✧</span>
            <span className="notion-nav-text">Connect GPT</span>
          </button>

          <button
            type="button"
            className="notion-new-page-action"
            onClick={() => { void createNote(); }}
          >
            <span>＋</span> New page
          </button>
        </div>
      </aside>

      {/* Main Notion Canvas Area */}
      <div className="notion-main-container">
        {/* Floating expand button when sidebar is collapsed */}
        {sidebarCollapsed && (
          <button
            type="button"
            className="notion-expand-sidebar-pill"
            title="Expand sidebar (⌘\)"
            onClick={() => setSidebarCollapsed(false)}
          >
            »
          </button>
        )}

        {/* Minimal 45px Notion Header */}
        <header className="notion-topbar">
          <div className="notion-breadcrumbs">
            <button
              className="notion-mobile-nav-toggle"
              aria-label="Open sidebar"
              onClick={() => setMobileNavOpen(true)}
            >
              ☰
            </button>

            <button
              type="button"
              className="notion-breadcrumb-item"
              onClick={async () => {
                if (await selectNote(null)) {
                  setCategory('All notes');
                  setSelectedTag(null);
                  setSearch('');
                }
              }}
            >
              {user.username}&apos;s space
            </button>

            {selectedTable ? (
              <span className="notion-breadcrumb-segment">
                <span className="notion-breadcrumb-divider">/</span>
                <span className="notion-breadcrumb-item">Databases</span>
                <span className="notion-breadcrumb-divider">/</span>
                <span className="notion-breadcrumb-current">
                  <span>▦</span>
                  <span>{selectedTable.name}</span>
                </span>
              </span>
            ) : (
              <>
                {pageBreadcrumbs.map(crumb => (
                  <span className="notion-breadcrumb-segment" key={crumb.id}>
                    <span className="notion-breadcrumb-divider">/</span>
                    <button
                      type="button"
                      className="notion-breadcrumb-item"
                      onClick={() => { void openPage(crumb); }}
                    >
                      <span>{crumb.icon || '📄'}</span>
                      <span>{crumb.title || 'Untitled'}</span>
                    </button>
                  </span>
                ))}

                {selected && (
                  <span className="notion-breadcrumb-segment">
                    <span className="notion-breadcrumb-divider">/</span>
                    <span className="notion-breadcrumb-current">
                      <span>{selected.icon || '📄'}</span>
                      <span>{selected.title || 'Untitled'}</span>
                    </span>
                  </span>
                )}
              </>
            )}
          </div>

          <div className="notion-topbar-actions">
            {selected && (
              <>
                <span className={`notion-save-indicator state-${saveStatus}`}>
                  {saveStatus === 'saving' || saving
                    ? 'Saving…'
                    : saveStatus === 'dirty'
                    ? 'Unsaved'
                    : saveStatus === 'error'
                    ? 'Save error'
                    : saveStatus === 'conflict'
                    ? 'Conflict'
                    : 'Saved'}
                </span>

                {/* Share to Web Button & Popover */}
                <div className="notion-menu-container" ref={sharePopoverRef}>
                  <button
                    type="button"
                    className={`notion-share-btn ${selected.is_public ? 'is-active' : ''}`}
                    title="Share note publicly"
                    onClick={() => setShowShareModal(prev => !prev)}
                  >
                    {selected.is_public && <span className="share-status-dot" />}
                    <span>Share</span>
                  </button>

                  {showShareModal && (
                    <div className="notion-share-popover">
                      <div className="share-popover-header">
                        <h4 className="share-popover-title">Share to Web</h4>
                        {selected.is_public && (
                          <span className="share-live-indicator">
                            <span className="share-status-dot" /> Live
                          </span>
                        )}
                      </div>

                      <div className="share-toggle-row">
                        <div className="share-toggle-label">
                          <span className="share-toggle-name">Publish to Web</span>
                          <span className="share-toggle-sub">
                            {selected.is_public
                              ? 'Anyone with the link can view'
                              : 'Allow anyone with the link to view'}
                          </span>
                        </div>
                        <label className="share-switch">
                          <input
                            type="checkbox"
                            checked={Boolean(selected.is_public)}
                            disabled={shareLoading}
                            onChange={() => handleTogglePublicShare(selected)}
                          />
                          <span className="share-switch-slider" />
                        </label>
                      </div>

                      {selected.is_public && (
                        <div className="share-link-box">
                          <div className="share-link-input-group">
                            <input
                              type="text"
                              readOnly
                              className="share-link-input"
                              value={
                                typeof window !== 'undefined'
                                  ? `${window.location.origin}/p/${selected.public_id || selected.id}`
                                  : `/p/${selected.public_id || selected.id}`
                              }
                              onClick={e => (e.target as HTMLInputElement).select()}
                            />
                            <button
                              type="button"
                              className="share-copy-btn"
                              onClick={() => {
                                if (typeof window !== 'undefined') {
                                  const url = `${window.location.origin}/p/${selected.public_id || selected.id}`;
                                  navigator.clipboard.writeText(url);
                                  setShareCopied(true);
                                  flash('Public link copied to clipboard!');
                                  setTimeout(() => setShareCopied(false), 2000);
                                }
                              }}
                            >
                              {shareCopied ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>

                          <div className="share-link-actions">
                            <a
                              href={`/p/${selected.public_id || selected.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="share-open-link"
                            >
                              Open public note ↗
                            </a>
                            <span style={{ color: 'var(--notion-light-muted)' }}>Read-only</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`notion-icon-btn ${selected.bookmarked ? 'active' : ''}`}
                  title={selected.bookmarked ? 'Remove from favorites' : 'Add to favorites'}
                  onClick={() => toggleBookmark(selected)}
                >
                  {selected.bookmarked ? '★' : '☆'}
                </button>

                <button
                  type="button"
                  className={`notion-icon-btn ${selected.pinned ? 'active' : ''}`}
                  title={selected.pinned ? 'Unpin page' : 'Pin page'}
                  onClick={() => togglePin(selected)}
                >
                  {selected.pinned ? '◆' : '◇'}
                </button>

                {/* View Mode Toggle: Document Canvas vs Split */}
                <div className="notion-mode-toggle">
                  <button
                    type="button"
                    className={layoutMode === 'document' ? 'active' : ''}
                    title="Full Page Document"
                    onClick={() => setLayoutMode('document')}
                  >
                    Doc
                  </button>
                  <button
                    type="button"
                    className={layoutMode === 'split' ? 'active' : ''}
                    title="Split List & Editor"
                    onClick={() => setLayoutMode('split')}
                  >
                    Split
                  </button>
                </div>

                {/* Page Menu Dropdown */}
                <div className="notion-menu-container" ref={pageMenuRef}>
                  <button
                    type="button"
                    className="notion-icon-btn"
                    title="Page settings"
                    onClick={() => setShowPageMenu(curr => !curr)}
                  >
                    ···
                  </button>

                  {showPageMenu && (
                    <div className="notion-page-dropdown">
                      <div className="notion-dropdown-header">STYLE & TYPOGRAPHY</div>
                      <div className="notion-font-selector">
                        <button
                          type="button"
                          className={fontStyle === 'sans' ? 'active' : ''}
                          onClick={() => setFontStyle('sans')}
                        >
                          Default
                        </button>
                        <button
                          type="button"
                          className={fontStyle === 'serif' ? 'active font-serif' : 'font-serif'}
                          onClick={() => setFontStyle('serif')}
                        >
                          Serif
                        </button>
                        <button
                          type="button"
                          className={fontStyle === 'mono' ? 'active font-mono' : 'font-mono'}
                          onClick={() => setFontStyle('mono')}
                        >
                          Mono
                        </button>
                      </div>

                      <div className="notion-dropdown-divider" />

                      <div className="notion-dropdown-row">
                        <span>Small text</span>
                        <input
                          type="checkbox"
                          checked={smallText}
                          onChange={e => setSmallText(e.target.checked)}
                        />
                      </div>

                      <div className="notion-dropdown-row">
                        <span>Full width</span>
                        <input
                          type="checkbox"
                          checked={fullWidth}
                          onChange={e => setFullWidth(e.target.checked)}
                        />
                      </div>

                      <div className="notion-dropdown-divider" />

                      <button
                        type="button"
                        className="notion-dropdown-btn"
                        onClick={() => {
                          setShowPageMenu(false);
                          setShowNewPageDialog(true);
                        }}
                      >
                        <span>＋</span> Add subpage
                      </button>

                      <button
                        type="button"
                        className="notion-dropdown-btn"
                        onClick={() => {
                          setShowPageMenu(false);
                          void exportWorkspace();
                        }}
                      >
                        <span>⇄</span> Export workspace
                      </button>

                      <button
                        type="button"
                        className="notion-dropdown-btn danger"
                        onClick={() => {
                          setShowPageMenu(false);
                          void moveNoteToTrash(selected);
                        }}
                      >
                        <span>🗑</span> Move to Trash
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedTable && (
              <>
                <button
                  type="button"
                  className="notion-btn-capture"
                  onClick={() => addTableRecord()}
                  title="Add new row"
                >
                  ＋ New record
                </button>
                <button
                  type="button"
                  className="notion-icon-btn"
                  title="Export to CSV"
                  onClick={exportDatabaseCSV}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="notion-icon-btn"
                  title="Rename database"
                  onClick={() => renameTable(selectedTable)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="notion-icon-btn"
                  title="Delete database"
                  onClick={() => deleteTable(selectedTable)}
                >
                  🗑
                </button>
              </>
            )}

            {/* Dark Mode Toggle */}
            <button
              type="button"
              className="notion-icon-btn"
              title={darkMode ? 'Switch to Light Mode (⌘⇧L)' : 'Switch to Dark Mode (⌘⇧L)'}
              onClick={toggleDarkMode}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            <button
              type="button"
              className="notion-btn-capture"
              onClick={() => setShowCapture(true)}
              title="Quick capture (⌥⇧C)"
            >
              ＋ Capture
            </button>

            <button
              type="button"
              className="notion-user-badge"
              title={`${user.username} (Click to sign out)`}
              onClick={logout}
            >
              {user.username[0].toUpperCase()}
            </button>
          </div>
        </header>

        {/* Workspace Body Area */}
        <div className={`notion-content-area ${layoutMode === 'split' ? 'split-layout' : 'document-layout'}`}>
          {/* Notes list pane: Shown when layoutMode is 'split', OR when neither a page nor a table is active */}
          {(layoutMode === 'split' || (!selected && !selectedTable)) && (
            <div className="notion-list-pane">
              <div className="notion-list-header">
                <div className="notion-list-title-row">
                  <h2>{selectedTag ? `# ${selectedTag}` : category}</h2>
                  <div className="notion-list-count">
                    {visibleWorkspaceItems.length} {visibleWorkspaceItems.length === 1 ? 'item' : 'items'}
                  </div>
                </div>

                <div className="notion-list-toolbar">
                  <div className="notion-filter-search">
                    <span>⌕</span>
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Filter notes..."
                    />
                  </div>
                  <div className="notion-sort-select">
                    <select
                      value={sortMode}
                      onChange={e => setSortMode(e.target.value as typeof sortMode)}
                      aria-label="Sort pages"
                    >
                      <option value="updated">Last edited</option>
                      <option value="created">Date created</option>
                      <option value="title">Title</option>
                    </select>
                  </div>
                  <div className="notion-view-switch">
                    <button
                      type="button"
                      className={view === 'list' ? 'active' : ''}
                      onClick={() => setView('list')}
                    >
                      ☷
                    </button>
                    <button
                      type="button"
                      className={view === 'grid' ? 'active' : ''}
                      onClick={() => setView('grid')}
                    >
                      ⊞
                    </button>
                  </div>
                </div>
              </div>

              {message && <div className="notion-toast">{message}</div>}

              {loading || (category === 'All notes' && loadingTables) ? (
                <div className="notion-empty-block">
                  <span className="notion-spinner" /> Loading notes…
                </div>
              ) : visibleWorkspaceItems.length === 0 ? (
                <div className="notion-empty-block">
                  <div className="notion-empty-icon">📄</div>
                  <h3>{category === 'Inbox' ? 'Inbox is clear' : 'No pages yet'}</h3>
                  <p>{category === 'Inbox' ? 'Quick captures will appear here.' : 'Create a page or database to get started.'}</p>
                  <button
                    type="button"
                    className="notion-primary-action-btn"
                    onClick={() => category === 'Inbox' ? setShowCapture(true) : setShowNewPageDialog(true)}
                  >
                    {category === 'Inbox' ? 'Capture thought' : '＋ New page'}
                  </button>
                </div>
              ) : (
                <div className={view === 'grid' ? 'notion-items-grid' : 'notion-items-list'}>
                  {visibleWorkspaceItems.map(entry => entry.kind === 'table' ? (
                    <div
                      key={`table-${entry.item.id}`}
                      className={`notion-card table-card ${selectedTable?.id === entry.item.id ? 'selected' : ''}`}
                      onClick={() => { void selectTable(entry.item); }}
                    >
                      <div className="notion-card-icon">▦</div>
                      <div className="notion-card-content">
                        <div className="notion-card-title">{entry.item.name}</div>
                        <div className="notion-card-meta">
                          <span className="badge-database">Database</span>
                          <span>{entry.item.columns.length} cols</span>
                          <span>{relativeDate(entry.item.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`page-${entry.item.id}`}
                      className={`notion-card ${selected?.id === entry.item.id ? 'selected' : ''}`}
                      onClick={() => { void selectNote(entry.item); }}
                    >
                      <div className="notion-card-icon">{entry.item.icon || '📄'}</div>
                      <div className="notion-card-content">
                        <div className="notion-card-title">
                          <span>{entry.item.title || 'Untitled'}</span>
                          {entry.item.bookmarked && <span className="star-icon">★</span>}
                          {entry.item.pinned && <span className="pin-icon">◆</span>}
                        </div>
                        <p className="notion-card-preview">{entry.item.content || 'Empty page'}</p>
                        <div className="notion-card-meta">
                          <span className="badge-category">{entry.item.category}</span>
                          {entry.item.tags.slice(0, 2).map(tag => (
                            <span key={tag} className={`notion-tag-pill ${tagColorClass(tag)}`}>#{tag}</span>
                          ))}
                          <span>{relativeDate(entry.item.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Database Canvas: Shown when selectedTable is active */}
          {selectedTable ? (
            <div className="notion-database-canvas">
              <div className="notion-database-header">
                <div className="notion-db-title-row">
                  <span className="notion-db-icon-badge">▦</span>
                  <input
                    className="notion-db-title-input"
                    value={selectedTable.name}
                    onChange={e => {
                      const nextName = e.target.value;
                      setSelectedTable({ ...selectedTable, name: nextName });
                    }}
                    onBlur={() => {
                      void api(`/tables/${selectedTable.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ name: selectedTable.name }),
                      });
                      setTables(curr => curr.map(t => t.id === selectedTable.id ? selectedTable : t));
                    }}
                    placeholder="Database name"
                  />
                </div>

                <div className="notion-db-meta">
                  <span>{tableRecords.length} records</span>
                  <span>·</span>
                  <span>{selectedTable.columns.length} columns</span>
                  <span>·</span>
                  <span>Updated {relativeDate(selectedTable.updated_at)}</span>
                </div>

                {/* View Tabs: [Table] [Board] [Gallery] */}
                <div className="notion-db-toolbar">
                  <div className="notion-db-views-tabs">
                    <button
                      type="button"
                      className={`notion-db-view-tab ${dbViewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setDbViewMode('table')}
                    >
                      <span>▦</span> Table
                    </button>
                    <button
                      type="button"
                      className={`notion-db-view-tab ${dbViewMode === 'board' ? 'active' : ''}`}
                      onClick={() => setDbViewMode('board')}
                    >
                      <span>📋</span> Board
                    </button>
                    <button
                      type="button"
                      className={`notion-db-view-tab ${dbViewMode === 'gallery' ? 'active' : ''}`}
                      onClick={() => setDbViewMode('gallery')}
                    >
                      <span>🖼️</span> Gallery
                    </button>
                  </div>

                  <div className="notion-db-actions">
                    <input
                      className="notion-db-search-input"
                      value={tableFilterQuery}
                      onChange={e => setTableFilterQuery(e.target.value)}
                      placeholder="Search records…"
                    />
                    <button
                      type="button"
                      className="notion-db-btn"
                      onClick={() => csvFileInputRef.current?.click()}
                      title="Import rows from a CSV file"
                    >
                      ↑ Import CSV
                    </button>
                    <button
                      type="button"
                      className="notion-db-btn"
                      onClick={exportDatabaseCSV}
                      title="Download as CSV spreadsheet"
                    >
                      ↓ Export CSV
                    </button>
                    <button
                      type="button"
                      className="notion-db-btn"
                      onClick={() => setShowAddColPopover(curr => !curr)}
                    >
                      ＋ Add column
                    </button>
                    <button
                      type="button"
                      className="notion-db-btn notion-db-btn-primary"
                      onClick={() => addTableRecord()}
                    >
                      ＋ New row
                    </button>

                    {showAddColPopover && (
                      <div className="notion-db-add-col-popover" ref={addColPopoverRef}>
                        <form onSubmit={addTableColumn} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label>Column name</label>
                          <input
                            autoFocus
                            value={newColName}
                            onChange={e => setNewColName(e.target.value)}
                            placeholder="e.g. Due Date"
                            required
                          />
                          <label>Column type</label>
                          <select
                            value={newColType}
                            onChange={e => setNewColType(e.target.value as DataColumn['type'])}
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="checkbox">Checkbox</option>
                            <option value="select">Select</option>
                          </select>
                          {newColType === 'select' && (
                            <>
                              <label>Options (comma separated)</label>
                              <input
                                value={newColOptions}
                                onChange={e => setNewColOptions(e.target.value)}
                                placeholder="Todo, In progress, Done"
                              />
                            </>
                          )}
                          <button type="submit" className="notion-db-btn notion-db-btn-primary" style={{ marginTop: '4px' }}>
                            Save column
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* View 1: Spreadsheet Table */}
              {dbViewMode === 'table' && (
                <div className="notion-db-table-scroll">
                  <table className="notion-db-table">
                    <thead>
                      <tr>
                        <th className="notion-db-th notion-db-th-index">#</th>
                        {selectedTable.columns.map(column => (
                          <th key={column.id} className="notion-db-th">
                            <div className="notion-db-th-content">
                              <span>{column.name}</span>
                              <span className="notion-db-col-type">{column.type}</span>
                            </div>
                          </th>
                        ))}
                        <th
                          className="notion-db-th notion-db-th-add-col"
                          title="Add a column"
                          onClick={() => setShowAddColPopover(true)}
                        >
                          ＋
                        </th>
                        <th className="notion-db-th notion-db-td-actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRecords ? (
                        <tr>
                          <td colSpan={selectedTable.columns.length + 3} className="notion-db-empty">
                            <span className="notion-spinner" /> Loading records…
                          </td>
                        </tr>
                      ) : visibleTableRecords.length === 0 ? (
                        <tr>
                          <td colSpan={selectedTable.columns.length + 3} className="notion-db-empty">
                            No records yet. Click &ldquo;＋ New row&rdquo; to start entering data.
                          </td>
                        </tr>
                      ) : (
                        visibleTableRecords.map((record, rIdx) => (
                          <tr key={record.id} className="notion-db-tr">
                            <td className="notion-db-td notion-db-td-index">{rIdx + 1}</td>
                            {selectedTable.columns.map(column => {
                              const val = record.values[column.id];
                              return (
                                <td key={`${column.id}-${record.version}`} className="notion-db-td">
                                  {column.type === 'checkbox' ? (
                                    <div className="notion-db-cell-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={val === true}
                                        onChange={e => updateTableCell(record, column, e.target.checked)}
                                      />
                                    </div>
                                  ) : column.type === 'select' ? (
                                    <select
                                      className="notion-db-cell-select"
                                      value={typeof val === 'string' ? val : ''}
                                      onChange={e => updateTableCell(record, column, e.target.value)}
                                    >
                                      <option value="">—</option>
                                      {column.options.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      className="notion-db-cell-input"
                                      type={column.type === 'number' || column.type === 'date' ? column.type : 'text'}
                                      defaultValue={val === null || val === undefined ? '' : String(val)}
                                      onBlur={e => {
                                        if (e.currentTarget.value !== String(val ?? '')) {
                                          void updateTableCell(record, column, e.currentTarget.value);
                                        }
                                      }}
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td className="notion-db-td" />
                            <td className="notion-db-td notion-db-td-actions">
                              <button
                                type="button"
                                className="notion-db-row-delete-btn"
                                title="Delete record"
                                onClick={() => deleteTableRecord(record)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  <button
                    type="button"
                    className="notion-db-add-row-bar"
                    onClick={() => addTableRecord()}
                  >
                    <span>＋</span> New
                  </button>
                </div>
              )}

              {/* View 2: Kanban Board View */}
              {dbViewMode === 'board' && (
                <div className="notion-kanban-board">
                  {boardColumns.map(colStatus => {
                    const colRecords = visibleTableRecords.filter(rec => {
                      if (!boardStatusColumn) return colStatus === 'Todo';
                      const val = rec.values[boardStatusColumn.id];
                      if (!val && colStatus === 'No status') return true;
                      return val === colStatus;
                    });

                    return (
                      <div key={colStatus} className="notion-kanban-column">
                        <div className="notion-kanban-column-header">
                          <span className="notion-kanban-status-badge">{colStatus}</span>
                          <span className="notion-kanban-count">{colRecords.length}</span>
                        </div>

                        <div className="notion-kanban-cards">
                          {colRecords.map(rec => {
                            const titleCol = selectedTable.columns[0];
                            const titleVal = titleCol ? rec.values[titleCol.id] : null;

                            return (
                              <div key={rec.id} className="notion-kanban-card">
                                <div className="notion-kanban-card-title">
                                  {String(titleVal || 'Untitled')}
                                </div>

                                {selectedTable.columns.slice(1, 4).map(c => {
                                  if (c.id === boardStatusColumn?.id) return null;
                                  const v = rec.values[c.id];
                                  if (v === null || v === undefined || v === '') return null;
                                  return (
                                    <div key={c.id} className="notion-kanban-card-prop">
                                      <span className="notion-kanban-prop-name">{c.name}:</span>{' '}
                                      <span>{String(v)}</span>
                                    </div>
                                  );
                                })}

                                {boardStatusColumn && (
                                  <div className="notion-kanban-card-actions">
                                    <select
                                      value={String(rec.values[boardStatusColumn.id] || '')}
                                      onChange={e => updateTableCell(rec, boardStatusColumn, e.target.value)}
                                      className="notion-kanban-move-select"
                                    >
                                      {boardStatusColumn.options.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                      <option value="">No status</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="notion-kanban-delete-btn"
                                      onClick={() => deleteTableRecord(rec)}
                                      title="Delete card"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            className="notion-kanban-add-btn"
                            onClick={() => {
                              const init: Record<string, string> = {};
                              if (boardStatusColumn && colStatus !== 'No status') {
                                init[boardStatusColumn.id] = colStatus;
                              }
                              void addTableRecord(init);
                            }}
                          >
                            ＋ New
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View 3: Gallery View */}
              {dbViewMode === 'gallery' && (
                <div className="notion-gallery-grid">
                  {visibleTableRecords.map(rec => {
                    const firstCol = selectedTable.columns[0];
                    const cardTitle = firstCol ? rec.values[firstCol.id] : 'Untitled';

                    return (
                      <div key={rec.id} className="notion-gallery-card">
                        <div className="notion-gallery-cover" />
                        <div className="notion-gallery-body">
                          <div className="notion-gallery-title">
                            {String(cardTitle || 'Untitled')}
                          </div>
                          {selectedTable.columns.slice(1, 3).map(c => {
                            const v = rec.values[c.id];
                            if (v === null || v === undefined || v === '') return null;
                            return (
                              <div key={c.id} className="notion-gallery-prop">
                                <span>{c.name}:</span> <b>{String(v)}</b>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            className="notion-gallery-delete"
                            title="Delete"
                            onClick={() => deleteTableRecord(rec)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="notion-gallery-add-card"
                    onClick={() => addTableRecord()}
                  >
                    <span>＋</span> New card
                  </button>
                </div>
              )}
            </div>
          ) : selected ? (
            /* Document Canvas Pane: Shown when selected note is active */
            <div className={`notion-document-pane font-${fontStyle} ${smallText ? 'small-text' : ''}`}>
              {/* Optional Cover Banner */}
              {activeCover && (
                <div className="notion-cover-banner" style={{ background: activeCover }}>
                  <div className="notion-cover-hover-controls">
                    <button
                      type="button"
                      onClick={() => setShowCoverPicker(true)}
                    >
                      Change cover
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetCover(null)}
                    >
                      Remove cover
                    </button>
                  </div>
                </div>
              )}

              {/* Cover Picker Modal/Dropdown */}
              {showCoverPicker && (
                <div className="notion-cover-picker-popover" ref={coverPickerRef}>
                  <div className="notion-picker-title">COLOR GRADIENTS</div>
                  <div className="notion-cover-grid">
                    {COVER_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        className="notion-cover-choice"
                        style={{ background: preset.bg }}
                        title={preset.name}
                        onClick={() => handleSetCover(preset.bg)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Document Canvas Paper */}
              <div className={`notion-document-paper ${fullWidth ? 'full-width' : ''}`}>
                {/* Conflict banner if any */}
                {saveStatus === 'conflict' && (
                  <div className="notion-conflict-banner" role="alert">
                    <p>This page was modified elsewhere. Your changes are preserved here.</p>
                    <div className="notion-conflict-actions">
                      <button type="button" onClick={reloadConflictedNote}>Load latest version</button>
                      <button type="button" onClick={() => { void saveNote(true); }}>Overwrite with mine</button>
                    </div>
                  </div>
                )}

                {/* Hover Affordances (Add Icon, Add Cover) */}
                <div className="notion-canvas-hover-affordance">
                  {!selected.icon && (
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(true)}
                    >
                      😀 Add icon
                    </button>
                  )}
                  {!activeCover && (
                    <button
                      type="button"
                      onClick={() => setShowCoverPicker(true)}
                    >
                      🌄 Add cover
                    </button>
                  )}
                </div>

                {/* Page Icon (42px) with Click Picker */}
                <div className={`notion-page-icon-wrapper ${activeCover ? 'with-cover' : ''}`}>
                  <button
                    type="button"
                    className="notion-page-icon-badge"
                    title="Change icon"
                    onClick={() => setShowIconPicker(curr => !curr)}
                  >
                    {selected.icon || '📄'}
                  </button>

                  {showIconPicker && (
                    <div className="notion-icon-picker-popover" ref={iconPickerRef}>
                      <div className="notion-picker-title">SELECT AN ICON</div>
                      <div className="notion-icon-grid">
                        {icons.map(ic => (
                          <button
                            key={ic}
                            type="button"
                            className="notion-icon-choice"
                            onClick={() => handleSetIcon(ic)}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Seamless Large Notion Title */}
                <input
                  className="notion-page-title-input"
                  value={selected.title}
                  onChange={e => updateSelected('title', e.target.value)}
                  placeholder="Untitled"
                />

                {/* Notion Property Rows */}
                <div className="notion-properties-bar">
                  <div className="notion-property-row">
                    <div className="notion-property-label">Category</div>
                    <div className="notion-property-val">
                      <select
                        value={selected.category}
                        onChange={e => updateSelected('category', e.target.value)}
                        className="notion-prop-select"
                      >
                        {categories.slice(1).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="notion-property-row">
                    <div className="notion-property-label">Tags</div>
                    <div className="notion-property-val tags-val">
                      {selected.tags.map(tag => (
                        <span key={tag} className={`notion-tag-pill ${tagColorClass(tag)}`}>
                          #{tag}
                          <button
                            type="button"
                            aria-label={`Remove tag ${tag}`}
                            onClick={() => updateSelected('tags', selected.tags.filter(t => t !== tag))}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <form
                        onSubmit={e => { e.preventDefault(); addTag(); }}
                        className="notion-inline-tag-form"
                      >
                        <input
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          placeholder="+ Add tag"
                          maxLength={32}
                        />
                      </form>
                    </div>
                  </div>

                  <div className="notion-property-row">
                    <div className="notion-property-label">Last edited</div>
                    <div className="notion-property-val text-muted">
                      {relativeDate(selected.updated_at)} · {wordCount} words
                    </div>
                  </div>

                  {selected.source_url && (
                    <div className="notion-property-row">
                      <div className="notion-property-label">Source URL</div>
                      <div className="notion-property-val">
                        <a
                          href={selected.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="notion-source-link"
                        >
                          ↗ {selected.source_url}
                        </a>
                      </div>
                    </div>
                  )}

                  {selected.inbox && (
                    <div className="notion-property-row">
                      <div className="notion-property-label">Inbox</div>
                      <div className="notion-property-val">
                        <button
                          type="button"
                          className="notion-btn-move-pages"
                          onClick={() => moveCaptureToPages(selected)}
                        >
                          Move to workspace pages
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Subpages / Child Pages block */}
                {childPages.length > 0 && (
                  <div className="notion-subpages-section">
                    <div className="notion-subpages-header">CHILD PAGES</div>
                    <div className="notion-subpages-grid">
                      {childPages.map(child => (
                        <button
                          key={child.id}
                          type="button"
                          className="notion-subpage-card"
                          onClick={() => { void openPage(child); }}
                        >
                          <span className="notion-subpage-icon">{child.icon || '📄'}</span>
                          <span className="notion-subpage-title">{child.title || 'Untitled'}</span>
                          <span className="notion-subpage-arrow">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Backlinks Section */}
                {backlinks.length > 0 && (
                  <div className="notion-backlinks-section">
                    <button
                      type="button"
                      className="notion-backlinks-toggle"
                      onClick={() => setShowBacklinks(b => !b)}
                    >
                      <span>🔗</span> {backlinks.length} {backlinks.length === 1 ? 'Backlink' : 'Backlinks'}
                      <span className="notion-backlinks-arrow">{showBacklinks ? '▾' : '▸'}</span>
                    </button>
                    {showBacklinks && (
                      <div className="notion-backlinks-list">
                        {backlinks.map(bn => (
                          <button
                            key={bn.id}
                            type="button"
                            className="notion-backlink-card"
                            onClick={() => { void openPage(bn); }}
                          >
                            <span>{bn.icon || '📄'}</span>
                            <span>{bn.title || 'Untitled'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Template Starter Selector when page is empty */}
                {!selected.content.trim() && (
                  <div className="notion-templates-starter">
                    <div className="notion-templates-starter-title">START FROM A TEMPLATE OR EMPTY CANVAS</div>
                    <div className="notion-templates-grid">
                      {NOTION_TEMPLATES.map(tpl => (
                        <button
                          key={tpl.id}
                          type="button"
                          className="notion-template-pill"
                          onClick={() => applyTemplate(tpl)}
                        >
                          <span className="notion-template-icon">{tpl.icon}</span>
                          <div>
                            <strong>{tpl.name}</strong>
                            <small>{tpl.desc}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="notion-divider-line" />

                {/* Enhanced Notion Markdown Editor with Mentions, Checklists, Toggles & Callouts */}
                <MarkdownEditor
                  value={selected.content}
                  onChange={val => updateSelected('content', val)}
                  fontStyle={fontStyle}
                  availablePages={activeNotes.map(n => ({ id: n.id, title: n.title || 'Untitled', icon: n.icon }))}
                  onOpenPage={pageId => {
                    const target = activeNotes.find(n => n.id === pageId);
                    if (target) void openPage(target);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="notion-no-page-selected">
              <div className="notion-no-page-icon">✦</div>
              <h2>Select or create a page</h2>
              <p>Choose an item from the sidebar or start writing something new.</p>
              <button
                type="button"
                className="notion-primary-action-btn"
                onClick={() => { void createNote(); }}
              >
                ＋ New page
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trash / Recycle Bin Modal */}
      {showTrashModal && (
        <div className="modal-backdrop" onClick={() => setShowTrashModal(false)}>
          <section className="capture-modal notion-trash-modal" role="dialog" aria-modal="true" aria-labelledby="trash-heading" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTrashModal(false)}>×</button>
            <div className="mcp-symbol">🗑</div>
            <p className="eyebrow">RECYCLE BIN</p>
            <h2 id="trash-heading">Trash ({trashedNotes.length})</h2>
            <p className="muted modal-copy">Pages in trash can be restored back to your workspace or permanently deleted.</p>

            {trashedNotes.length === 0 ? (
              <div className="notion-trash-empty">
                <p>Trash is empty.</p>
              </div>
            ) : (
              <div className="notion-trash-list">
                {trashedNotes.map(n => (
                  <div key={n.id} className="notion-trash-item">
                    <div className="notion-trash-item-info">
                      <span>{n.icon || '📄'}</span>
                      <strong>{n.title || 'Untitled'}</strong>
                      <small>Last edited {relativeDate(n.updated_at)}</small>
                    </div>
                    <div className="notion-trash-item-actions">
                      <button
                        type="button"
                        className="notion-db-btn"
                        onClick={() => restoreNoteFromTrash(n)}
                        title="Restore page"
                      >
                        ↺ Restore
                      </button>
                      <button
                        type="button"
                        className="notion-db-btn"
                        style={{ color: '#eb5757' }}
                        onClick={() => permanentlyDeleteNote(n)}
                        title="Delete permanently"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Command Palette (⌘K) */}
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
                placeholder="Search pages, databases, or run a command…"
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
                  <span className="command-result-icon">
                    {item.kind === 'page' ? item.note.icon : item.kind === 'table' ? '▦' : item.id === 'quick-capture' ? '⌁' : item.id === 'toggle-dark' ? '🌙' : item.id === 'open-trash' ? '🗑' : '＋'}
                  </span>
                  <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                  {(item.kind === 'page' || item.kind === 'table') && <kbd>↵</kbd>}
                </button>
              ))}
            </div>
            <footer><span>↑↓ Navigate</span><span>↵ Open</span><span>⌘ K Toggle</span></footer>
          </section>
        </div>
      )}

      {/* New Page Dialog */}
      {showNewPageDialog && (
        <div className="modal-backdrop" onClick={() => setShowNewPageDialog(false)}>
          <section className="capture-modal new-page-modal" role="dialog" aria-modal="true" aria-labelledby="new-page-heading" onClick={event => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowNewPageDialog(false)} aria-label="Close new page options">×</button>
            <div className="mcp-symbol">＋</div>
            <p className="eyebrow">CREATE IN YOUR WORKSPACE</p>
            <h2 id="new-page-heading">What would you like to create?</h2>
            <p className="muted modal-copy">Choose a format. It will open directly in this workspace.</p>
            {newPageError && <p className="form-error" role="alert">{newPageError}</p>}
            <div className="new-page-options">
              <button
                type="button"
                onClick={() => {
                  setShowNewPageDialog(false);
                  setNewPageError('');
                  void createNote();
                }}
              >
                <span>✎</span>
                <strong>Document page</strong>
                <small>Write and organize thoughts with Markdown.</small>
              </button>
              <button
                type="button"
                onClick={startTableCreation}
              >
                <span>▦</span>
                <strong>Database</strong>
                <small>Multi-view table, board, and gallery with typed columns.</small>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Table Name Modal */}
      {showTableNameDialog && (
        <div className="modal-backdrop" onClick={() => setShowTableNameDialog(false)}>
          <section className="capture-modal table-name-modal" role="dialog" aria-modal="true" aria-labelledby="table-name-heading" onClick={event => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTableNameDialog(false)} aria-label="Close table creation">×</button>
            <div className="mcp-symbol">▦</div>
            <p className="eyebrow">DATABASE TABLE</p>
            <h2 id="table-name-heading">Name your database</h2>
            <p className="muted modal-copy">You can switch between Table, Board, and Gallery views after creation.</p>
            <form className="table-name-form" onSubmit={event => { void createStructuredTable(event); }}>
              <label htmlFor="new-table-name">Database name</label>
              <input
                id="new-table-name"
                autoFocus
                value={newTableName}
                onChange={event => { setNewTableName(event.target.value); setNewPageError(''); }}
                maxLength={120}
                required
                placeholder="e.g. Project Roadmap"
              />
              {newPageError && <p className="form-error" role="alert">{newPageError}</p>}
              <div className="table-name-actions">
                <button type="button" className="table-secondary-button" onClick={() => { setShowTableNameDialog(false); setShowNewPageDialog(true); }}>
                  Back
                </button>
                <button type="submit" className="primary-button" disabled={creatingTable || !newTableName.trim()}>
                  {creatingTable ? 'Creating…' : 'Create database'} <span>→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Quick Capture Modal */}
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

      {/* Portability Modal (Import / Export) */}
      {showPortability && (
        <div className="modal-backdrop" onClick={() => { setShowPortability(false); setImportFile(null); setImportPreview(null); setImportError(''); }}>
          <section className="portability-modal" role="dialog" aria-modal="true" aria-labelledby="portability-heading" onClick={event => event.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowPortability(false); setImportFile(null); setImportPreview(null); setImportError(''); }} aria-label="Close import and export">×</button>
            
            <div className="portability-header">
              <div className="portability-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="portability-header-text">
                <p className="eyebrow">WORKSPACE PORTABILITY</p>
                <h2 id="portability-heading">Import and Export</h2>
                <p className="modal-copy">Backup your entire workspace or import notes from Notion, Obsidian, and Markdown.</p>
              </div>
            </div>

            <div className="portability-sections">
              {/* Export Card */}
              <div className="portability-card">
                <div className="portability-card-header">
                  <div className="portability-card-icon export-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                  <div className="portability-card-info">
                    <h3>Export Workspace</h3>
                    <p>Download all your notes, pages, and directory hierarchy as a standard Markdown ZIP archive.</p>
                  </div>
                </div>
                <div className="portability-card-action">
                  <button className="portability-btn export-btn" onClick={() => void exportWorkspace()} disabled={exportingWorkspace}>
                    {exportingWorkspace ? (
                      <>
                        <span className="btn-spinner" />
                        <span>Preparing ZIP…</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Download workspace ZIP</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Import Card */}
              <div className="portability-card">
                <div className="portability-card-header">
                  <div className="portability-card-icon import-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="portability-card-info">
                    <h3>Import Markdown Archive</h3>
                    <p>Upload a <code>.zip</code> file containing markdown files. Preserves folder tree and nested pages.</p>
                  </div>
                </div>

                {/* Dropzone */}
                <div
                  className={`archive-dropzone ${archiveDragActive ? 'is-dragging' : ''} ${importFile ? 'has-file' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setArchiveDragActive(true); }}
                  onDragLeave={() => setArchiveDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArchiveDragActive(false);
                    const file = e.dataTransfer.files?.[0] || null;
                    if (file) void inspectWorkspaceArchive(file);
                  }}
                  onClick={() => {
                    if (!importFile) archiveFileInputRef.current?.click();
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label="Upload Markdown ZIP archive"
                >
                  <input
                    ref={archiveFileInputRef}
                    type="file"
                    className="archive-hidden-input"
                    accept=".zip,application/zip"
                    onChange={event => {
                      const file = event.target.files?.[0] || null;
                      event.currentTarget.value = '';
                      void inspectWorkspaceArchive(file);
                    }}
                  />

                  {importFile ? (
                    <div className="archive-file-selected" onClick={e => e.stopPropagation()}>
                      <div className="archive-file-left">
                        <span className="archive-file-badge">ZIP</span>
                        <div className="archive-file-details">
                          <strong className="archive-file-name">{importFile.name}</strong>
                          <span className="archive-file-size">
                            {(importFile.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                      </div>
                      <div className="archive-file-actions">
                        <button
                          type="button"
                          className="archive-action-text-btn"
                          onClick={() => archiveFileInputRef.current?.click()}
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          className="archive-action-remove-btn"
                          onClick={() => {
                            setImportFile(null);
                            setImportPreview(null);
                            setImportError('');
                          }}
                          aria-label="Remove file"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="dropzone-empty-state">
                      <div className="dropzone-icon-bubble">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                          <path d="M12 12v9" />
                          <path d="m16 16-4-4-4 4" />
                        </svg>
                      </div>
                      <p className="dropzone-title">
                        <span>Click to browse</span> or drag and drop archive
                      </p>
                      <p className="dropzone-subtitle">Supported format: ZIP archive containing Markdown files (max 20 MB)</p>
                    </div>
                  )}
                </div>

                {previewingImport && (
                  <div className="import-status-indicator">
                    <span className="btn-spinner" />
                    <span>Inspecting archive structure…</span>
                  </div>
                )}

                {importPreview && (
                  <div className="import-preview-container">
                    <div className="import-preview-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{importPreview.count} {importPreview.count === 1 ? 'page' : 'pages'} ready to add</span>
                    </div>

                    {importPreview.pages.length > 0 && (
                      <div className="import-preview-tree">
                        <ul>
                          {importPreview.pages.map((page, index) => (
                            <li key={`${page.path}-${index}`}>
                              <span className="preview-page-icon">📄</span>
                              <span className="preview-page-title">{page.title}</span>
                              <span className="preview-page-path">{page.path}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {importPreview.count > importPreview.pages.length && (
                      <p className="import-preview-overflow">
                        + {importPreview.count - importPreview.pages.length} more pages in folders
                      </p>
                    )}

                    {importPreview.skipped_files > 0 && (
                      <p className="import-preview-skipped">
                        ℹ {importPreview.skipped_files} non-Markdown asset(s) skipped.
                      </p>
                    )}

                    <div className="import-preview-cta">
                      <button
                        className="portability-btn import-btn"
                        onClick={() => void confirmWorkspaceImport()}
                        disabled={importingWorkspace || importPreview.count === 0}
                      >
                        {importingWorkspace ? (
                          <>
                            <span className="btn-spinner" />
                            <span>Importing into workspace…</span>
                          </>
                        ) : (
                          <>
                            <span>Add {importPreview.count} {importPreview.count === 1 ? 'page' : 'pages'} to workspace</span>
                            <span className="btn-arrow">→</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {importError && (
                  <div className="import-alert-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{importError}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* MCP / GPT Connection Modal */}
      {showMcp && (
        <div className="modal-backdrop" onClick={() => setShowMcp(false)}>
          <section className="mcp-modal" onClick={event => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowMcp(false)}>×</button>
            <div className="mcp-symbol">✧</div>
            <p className="eyebrow">NOTEOS CONNECT</p>
            <h2>Connect GPT / MCP</h2>
            <p className="muted modal-copy">Connect ChatGPT or any MCP client to query and interact with your workspace.</p>
            <div className="connect-step">
              <span>01</span>
              <div><strong>Your MCP endpoint</strong><code>{location.origin.replace('3000', '8000')}/mcp</code></div>
              <button onClick={() => navigator.clipboard?.writeText(`${location.origin.replace('3000', '8000')}/mcp`)}>Copy</button>
            </div>
            <div className="connect-step">
              <span>02</span>
              <div>
                <strong>Permanent MCP API Token</strong>
                {mcpToken ? (
                  <><code>{mcpToken}</code><small>Copy it now. For security, it will not be shown again.</small></>
                ) : (
                  <small>Generate an authorization token for external MCP clients.</small>
                )}
              </div>
              <button onClick={generateMcpToken}>{mcpToken ? 'Regenerate' : 'Create token'}</button>
            </div>
            <div className="mcp-tools"><span>Available tools</span><b>search_notes</b><b>get_note</b><b>create_note</b><b>list_bookmarks</b></div>
          </section>
        </div>
      )}
    </main>
  );
}
