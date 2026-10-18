'use client';

import { useEffect, useMemo, useState } from 'react';
import { Note } from '@/lib/api';

type PagesTreeProps = {
  notes: Note[];
  selectedId?: string;
  onSelect: (note: Note) => void;
  onCreateChild: (parentId: string) => void;
};

export default function PagesTree({ notes, selectedId, onSelect, onCreateChild }: PagesTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { childrenByParent, roots, notesById } = useMemo(() => {
    const byParent = new Map<string | null, Note[]>();
    const byId = new Map(notes.map(note => [note.id, note]));

    for (const note of notes) {
      const parentId = note.parent_id && byId.has(note.parent_id) ? note.parent_id : null;
      const children = byParent.get(parentId) || [];
      children.push(note);
      byParent.set(parentId, children);
    }

    return {
      childrenByParent: byParent,
      roots: byParent.get(null) || [],
      notesById: byId,
    };
  }, [notes]);

  useEffect(() => {
    if (!selectedId) return;
    setExpanded(current => {
      const next = new Set(current);
      let parentId = notesById.get(selectedId)?.parent_id;
      while (parentId && notesById.has(parentId)) {
        next.add(parentId);
        parentId = notesById.get(parentId)?.parent_id;
      }
      return next.size === current.size ? current : next;
    });
  }, [notesById, selectedId]);

  function renderPage(note: Note, depth: number) {
    const children = childrenByParent.get(note.id) || [];
    const isExpanded = expanded.has(note.id);

    return (
      <div className="page-tree-node" key={note.id}>
        <div className={`page-tree-row ${selectedId === note.id ? 'active' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
          <button
            type="button"
            className="page-tree-toggle"
            aria-label={isExpanded ? `Collapse ${note.title}` : `Expand ${note.title}`}
            aria-expanded={isExpanded}
            onClick={() => setExpanded(current => {
              const next = new Set(current);
              if (next.has(note.id)) next.delete(note.id);
              else next.add(note.id);
              return next;
            })}
          >
            {children.length ? (isExpanded ? '⌄' : '›') : <span>·</span>}
          </button>
          <button type="button" className="page-tree-title" onClick={() => onSelect(note)}>
            <span>{note.icon || '□'}</span>{note.title || 'Untitled'}
          </button>
          <button
            type="button"
            className="page-tree-add"
            aria-label={`Add subpage to ${note.title || 'Untitled'}`}
            title="Add subpage"
            onClick={() => {
              setExpanded(current => new Set(current).add(note.id));
              onCreateChild(note.id);
            }}
          >
            +
          </button>
        </div>
        {isExpanded && children.map(child => renderPage(child, depth + 1))}
      </div>
    );
  }

  return <div className="page-tree">{roots.map(note => renderPage(note, 0))}</div>;
}
