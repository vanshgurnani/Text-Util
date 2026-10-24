'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AiModel,
  createConversation,
  getRagStatus,
  queryRag,
  RagCitation,
  streamChatMessage,
} from '../../lib/api';

type AiCopilotDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  activeNoteId?: string;
  activeNoteTitle?: string;
  onInsertText?: (text: string) => void;
};

export default function AiCopilotDrawer({
  isOpen,
  onClose,
  activeNoteId,
  activeNoteTitle,
  onInsertText,
}: AiCopilotDrawerProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'current' | 'workspace'>(activeNoteId ? 'current' : 'workspace');
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<RagCitation[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      getRagStatus()
        .then((res) => {
          if (res.available_models?.length) {
            setModels(res.available_models);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Keyboard shortcut ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAsk = async () => {
    const q = query.trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    setAnswer('');
    setCitations([]);

    try {
      const res = await queryRag({
        query: q,
        model: selectedModel,
        note_id_filter: scope === 'current' && activeNoteId ? [activeNoteId] : undefined,
      });

      setAnswer(res.answer);
      setCitations(res.citations || []);
    } catch (err: any) {
      setAnswer(`Error querying AI: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = () => {
    if (answer && onInsertText) {
      onInsertText(answer);
      onClose();
    }
  };

  return (
    <div className="copilot-drawer-overlay" onClick={onClose}>
      <aside className="copilot-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="copilot-drawer-header">
          <div className="copilot-drawer-title-row">
            <span className="copilot-sparkle">✨</span>
            <h3>AI Workspace Copilot</h3>
          </div>
          <button onClick={onClose} className="copilot-close-btn" title="Close Copilot (Esc)">
            ✕
          </button>
        </div>

        {/* Scope Selector */}
        <div className="copilot-scope-bar">
          {activeNoteId && (
            <button
              onClick={() => setScope('current')}
              className={`copilot-scope-chip ${scope === 'current' ? 'active' : ''}`}
            >
              📄 Current Note: {activeNoteTitle ? activeNoteTitle.slice(0, 18) + '...' : 'Untitled'}
            </button>
          )}
          <button
            onClick={() => setScope('workspace')}
            className={`copilot-scope-chip ${scope === 'workspace' ? 'active' : ''}`}
          >
            🌐 All Notes (RAG)
          </button>
        </div>

        {/* Query Input */}
        <div className="copilot-query-box">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAsk();
            }}
            placeholder={
              scope === 'current'
                ? 'Ask about this note, e.g. "Summarize key points"'
                : 'Ask across all notes, e.g. "What did we decide about auth?"'
            }
            className="copilot-input"
          />
          <button onClick={handleAsk} disabled={isLoading || !query.trim()} className="copilot-ask-btn">
            {isLoading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        {/* Answer Content */}
        <div className="copilot-drawer-body">
          {isLoading && (
            <div className="copilot-loading-skeleton">
              <div className="copilot-skeleton-line short" />
              <div className="copilot-skeleton-line" />
              <div className="copilot-skeleton-line" />
            </div>
          )}

          {!isLoading && !answer && (
            <div className="copilot-empty-state">
              <p>Type a question above to retrieve context-grounded answers from your workspace notes.</p>
              <div className="copilot-presets">
                <button onClick={() => { setQuery('Summarize this note in 3 bullet points'); setScope('current'); }} className="copilot-preset-btn">
                  📌 3-bullet summary
                </button>
                <button onClick={() => { setQuery('Extract action items and TODOs'); setScope('current'); }} className="copilot-preset-btn">
                  ✅ Extract TODOs
                </button>
                <button onClick={() => { setQuery('What are the main topics in my workspace?'); setScope('workspace'); }} className="copilot-preset-btn">
                  🔍 Workspace overview
                </button>
              </div>
            </div>
          )}

          {!isLoading && answer && (
            <div className="copilot-answer-card">
              <div className="copilot-answer-text">{answer}</div>

              {citations.length > 0 && (
                <div className="copilot-citations">
                  <span className="copilot-citations-title">Sources Referenced:</span>
                  <ul>
                    {citations.map((c, i) => (
                      <li key={i}>
                        <strong>{c.note_title}</strong>: <em>{c.snippet.slice(0, 90)}...</em>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {onInsertText && (
                <div className="copilot-actions">
                  <button onClick={handleInsert} className="copilot-insert-btn">
                    📋 Insert into Note
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(answer);
                      alert('Copied to clipboard!');
                    }}
                    className="copilot-copy-btn"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
