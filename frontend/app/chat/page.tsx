'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AiModel,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  createConversation,
  deleteConversation,
  exportConversationToNote,
  getConversation,
  getRagStatus,
  getSessionToken,
  indexWorkspace,
  listConversations,
  RagCitation,
  RagStatus,
  streamChatMessage,
  updateConversation,
} from '../../lib/api';

export default function ChatPage() {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<ConversationDetail | null>(null);

  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [currentCitations, setCurrentCitations] = useState<RagCitation[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<RagCitation | null>(null);

  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.0-flash');
  const [useRag, setUseRag] = useState<boolean>(true);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [isReindexing, setIsReindexing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [searchFilter, setSearchFilter] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortStreamRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check auth
  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.push('/login');
      return;
    }

    // Detect dark mode from localStorage or body class
    const savedTheme = localStorage.getItem('noteform_theme');
    if (savedTheme === 'dark' || document.body.classList.contains('dark-mode')) {
      setIsDarkMode(true);
    }

    loadInitialData();
  }, [router]);

  const loadInitialData = async () => {
    try {
      const [convs, status] = await Promise.all([listConversations(), getRagStatus()]);
      setConversations(convs);
      setRagStatus(status);
      if (status.available_models?.length) {
        setModels(status.available_models);
        setSelectedModel(status.available_models[0].id);
      }

      if (convs.length > 0) {
        loadConversation(convs[0].id);
      } else {
        handleNewChat();
      }
    } catch (err: any) {
      console.error('Failed to load chat data', err);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      setActiveConvId(id);
      const detail = await getConversation(id);
      setActiveConv(detail);
      setSelectedModel(detail.model || 'gemini-2.0-flash');
      scrollToBottom();
    } catch (err) {
      console.error('Failed to get conversation', err);
    }
  };

  const handleNewChat = async () => {
    try {
      const newChat = await createConversation({
        title: 'New Chat',
        model: selectedModel,
      });
      setConversations((prev) => [
        {
          id: newChat.id,
          title: newChat.title,
          model: newChat.model,
          is_pinned: false,
          message_count: 0,
          created_at: newChat.created_at,
          updated_at: newChat.updated_at,
        },
        ...prev,
      ]);
      setActiveConvId(newChat.id);
      setActiveConv(newChat);
      if (textareaRef.current) textareaRef.current.focus();
    } catch (err) {
      console.error('Failed to create new chat', err);
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          loadConversation(remaining[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, conv: ConversationSummary) => {
    e.stopPropagation();
    const updatedPin = !conv.is_pinned;
    try {
      await updateConversation(conv.id, { is_pinned: updatedPin });
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, is_pinned: updatedPin } : c)).sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }),
      );
    } catch (err) {
      console.error('Failed to toggle pin', err);
    }
  };

  const handleSendMessage = async () => {
    const text = inputMessage.trim();
    if (!text || isStreaming || !activeConvId) return;

    setInputMessage('');
    setIsStreaming(true);
    setCurrentStreamText('');
    setCurrentCitations([]);

    // Optimistically append user message to UI
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId,
      role: 'user',
      content: text,
      citations: [],
      created_at: new Date().toISOString(),
    };

    setActiveConv((prev) => (prev ? { ...prev, messages: [...prev.messages, tempUserMsg] } : prev));
    scrollToBottom();

    let fullAssistantResponse = '';
    let citationsCaptured: RagCitation[] = [];

    try {
      const abortFn = await streamChatMessage({
        conversationId: activeConvId,
        content: text,
        model: selectedModel,
        useRag,
        onCitations: (cits) => {
          citationsCaptured = cits;
          setCurrentCitations(cits);
        },
        onDelta: (chunk) => {
          fullAssistantResponse += chunk;
          setCurrentStreamText((prev) => prev + chunk);
          scrollToBottom();
        },
        onDone: (data) => {
          setIsStreaming(false);
          const finalAssistantMsg: ChatMessage = {
            id: data.message_id || `msg-${Date.now()}`,
            conversation_id: activeConvId,
            role: 'assistant',
            content: fullAssistantResponse,
            citations: citationsCaptured,
            created_at: new Date().toISOString(),
          };

          setActiveConv((prev) =>
            prev ? { ...prev, messages: [...prev.messages, finalAssistantMsg] } : prev,
          );
          setCurrentStreamText('');
          setCurrentCitations([]);

          // Refresh sidebar list to reflect title change or updated timestamp
          listConversations().then(setConversations).catch(() => {});
        },
        onError: (err) => {
          console.error('Stream error', err);
          setIsStreaming(false);
          setStatusMessage(`Error: ${typeof err === 'string' ? err : err.message || 'Stream error'}`);
          setTimeout(() => setStatusMessage(null), 5000);
        },
      });

      abortStreamRef.current = abortFn;
    } catch (err: any) {
      setIsStreaming(false);
      setStatusMessage(`Error sending message: ${err.message || 'Unknown error'}`);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleStopStream = () => {
    if (abortStreamRef.current) {
      abortStreamRef.current();
      abortStreamRef.current = null;
    }
    setIsStreaming(false);
    if (currentStreamText && activeConvId) {
      const stoppedMsg: ChatMessage = {
        id: `stopped-${Date.now()}`,
        conversation_id: activeConvId,
        role: 'assistant',
        content: currentStreamText + ' *(Stream interrupted)*',
        citations: currentCitations,
        created_at: new Date().toISOString(),
      };
      setActiveConv((prev) =>
        prev ? { ...prev, messages: [...prev.messages, stoppedMsg] } : prev,
      );
      setCurrentStreamText('');
      setCurrentCitations([]);
    }
  };

  const handleExportToNote = async () => {
    if (!activeConvId || !activeConv || activeConv.messages.length === 0) {
      alert('Conversation has no messages to export.');
      return;
    }
    try {
      const res = await exportConversationToNote(activeConvId, {
        title: `Chat Note: ${activeConv.title}`,
      });
      setStatusMessage(`Saved conversation as note "${res.title}"!`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      alert(`Export failed: ${err.message || err}`);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const res = await indexWorkspace();
      setStatusMessage(`Indexed ${res.notes_indexed} notes (${res.chunks_indexed} chunks)!`);
      const updatedStatus = await getRagStatus();
      setRagStatus(updatedStatus);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      alert(`Indexing failed: ${err.message || err}`);
    } finally {
      setIsReindexing(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className={`chat-app-root ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Toast Notification */}
      {statusMessage && (
        <div className="chat-toast-banner">
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="chat-layout">
        {/* Left Sidebar */}
        <aside className="chat-sidebar">
          {/* Header */}
          <div className="chat-sidebar-header">
            <Link href="/" className="chat-back-link" title="Return to Workspace">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Workspace</span>
            </Link>
            <button
              onClick={handleNewChat}
              className="chat-new-btn"
              title="Start a new chat conversation"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Chat</span>
            </button>
          </div>

          {/* Search */}
          <div className="chat-search-wrap">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="chat-search-input"
            />
          </div>

          {/* Conversations List */}
          <div className="chat-history-list">
            {filteredConversations.length === 0 ? (
              <div className="chat-empty-list">No conversations found</div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = c.id === activeConvId;
                return (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`chat-history-item ${isActive ? 'active' : ''}`}
                  >
                    <div className="chat-history-info">
                      <span className="chat-item-title">{c.title || 'Untitled Chat'}</span>
                      <span className="chat-item-meta">
                        {c.message_count} msgs
                      </span>
                    </div>

                    <div className="chat-history-actions">
                      <button
                        onClick={(e) => handleTogglePin(e, c)}
                        className={`chat-action-btn ${c.is_pinned ? 'pinned' : ''}`}
                        title={c.is_pinned ? 'Unpin' : 'Pin chat'}
                      >
                        📌
                      </button>
                      <button
                        onClick={(e) => handleDeleteConversation(e, c.id)}
                        className="chat-action-btn delete"
                        title="Delete chat"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Footer: RAG Index Status */}
          <div className="chat-sidebar-footer">
            <div className="chat-rag-indicator">
              <span className="chat-rag-dot" />
              <span>{ragStatus ? `${ragStatus.notes_count} Notes` : 'RAG Ready'}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleReindex}
                disabled={isReindexing}
                className="chat-reindex-btn"
                title="Delta re-index all notes for AI"
              >
                {isReindexing ? '...' : 'Sync'}
              </button>
              <Link
                href="/settings"
                className="chat-reindex-btn"
                title="Open AI & Workspace Settings"
              >
                ⚙️
              </Link>
            </div>
          </div>
        </aside>

        {/* Right Main Chat Panel */}
        <main className="chat-main-area">
          {/* Top Bar Controls */}
          <header className="chat-topbar">
            <div className="chat-title-group">
              <h1 className="chat-current-title">{activeConv?.title || 'Noteform Copilot'}</h1>
              <span className="chat-model-badge">
                {models.find((m) => m.id === selectedModel)?.name || selectedModel}
              </span>
            </div>

            <div className="chat-topbar-controls">
              {/* Model Selector */}
              <div className="chat-control-item">
                <label>Model:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="chat-select"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  {!models.some((m) => m.id === 'gemini-2.0-flash') && (
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  )}
                  {!models.some((m) => m.id === 'llama-3.3-70b-versatile') && (
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Groq)</option>
                  )}
                </select>
              </div>

              {/* RAG Knowledge Toggle */}
              <button
                onClick={() => setUseRag(!useRag)}
                className={`chat-rag-toggle-btn ${useRag ? 'active' : ''}`}
                title="Toggle grounding with your workspace notes"
              >
                <span>{useRag ? '🧠 Workspace RAG: ON' : '⚡ Workspace RAG: OFF'}</span>
              </button>

              {/* Export to Note */}
              <button
                onClick={handleExportToNote}
                className="chat-export-btn"
                title="Save this conversation as an organized note"
              >
                <span>📥 Export to Note</span>
              </button>

              {/* Settings Link */}
              <Link
                href="/settings"
                className="chat-settings-nav-link"
                title="AI & Workspace Settings"
              >
                <span>⚙️</span>
              </Link>
            </div>
          </header>

          {/* Messages Scroll View */}
          <div className="chat-messages-container">
            {(!activeConv || activeConv.messages.length === 0) && !isStreaming ? (
              <div className="chat-welcome-card">
                <div className="chat-welcome-icon">✨</div>
                <h2>Ask Noteform AI Copilot</h2>
                <p>
                  Ask questions across all your notes, synthesize insights, draft content, or brainstorm.
                  Powered by local hybrid RAG with verifiable citations.
                </p>

                <div className="chat-suggestion-grid">
                  <button
                    onClick={() => setInputMessage('Summarize the most important ideas in my recent notes')}
                    className="chat-suggestion-chip"
                  >
                    📝 Summarize recent project notes
                  </button>
                  <button
                    onClick={() => setInputMessage('List all pending action items, tasks, and deadlines from my notes')}
                    className="chat-suggestion-chip"
                  >
                    ✅ Extract action items & deadlines
                  </button>
                  <button
                    onClick={() => setInputMessage('What architectural design decisions have been documented so far?')}
                    className="chat-suggestion-chip"
                  >
                    🏗️ Architecture & decisions overview
                  </button>
                  <button
                    onClick={() => setInputMessage('Draft a concise executive report based on my workspace')}
                    className="chat-suggestion-chip"
                  >
                    📊 Draft an executive workspace report
                  </button>
                </div>
              </div>
            ) : (
              activeConv?.messages.map((msg) => (
                <div key={msg.id} className={`chat-message-row ${msg.role}`}>
                  <div className="chat-message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>

                  <div className="chat-message-body">
                    <div className="chat-message-sender">
                      <span>{msg.role === 'user' ? 'You' : 'Noteform AI'}</span>
                      <span className="chat-message-time">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="chat-message-text">{msg.content}</div>

                    {/* Citations Chips */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="chat-citations-list">
                        <span className="chat-citations-label">Sources:</span>
                        {msg.citations.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedCitation(c)}
                            className="chat-citation-chip"
                            title={`Relevance score: ${(c.score * 100).toFixed(0)}%`}
                          >
                            <span>📄 {c.note_title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* In-Flight Streaming Message */}
            {isStreaming && (
              <div className="chat-message-row assistant streaming">
                <div className="chat-message-avatar">🤖</div>
                <div className="chat-message-body">
                  <div className="chat-message-sender">
                    <span>Noteform AI</span>
                    <span className="chat-streaming-indicator">Generating...</span>
                  </div>

                  <div className="chat-message-text">
                    {currentStreamText}
                    <span className="chat-cursor">▋</span>
                  </div>

                  {currentCitations.length > 0 && (
                    <div className="chat-citations-list">
                      <span className="chat-citations-label">Sources:</span>
                      {currentCitations.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedCitation(c)}
                          className="chat-citation-chip"
                        >
                          <span>📄 {c.note_title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Composer */}
          <div className="chat-composer-wrap">
            <div className="chat-composer-box">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask Noteform Copilot anything... (Enter to send, Shift+Enter for new line)"
                className="chat-composer-input"
                rows={2}
              />

              <div className="chat-composer-actions">
                <span className="chat-hint-text">
                  {useRag ? '🛡️ Grounded with workspace notes' : '⚡ Unbounded LLM mode'}
                </span>

                {isStreaming ? (
                  <button onClick={handleStopStream} className="chat-stop-btn">
                    ⏹ Stop
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim()}
                    className="chat-send-btn"
                  >
                    <span>Send</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Citation Popover Modal */}
      {selectedCitation && (
        <div className="chat-modal-overlay" onClick={() => setSelectedCitation(null)}>
          <div className="chat-citation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Source Note: {selectedCitation.note_title}</h3>
              <button onClick={() => setSelectedCitation(null)} className="chat-modal-close">
                ✕
              </button>
            </div>
            <div className="chat-modal-meta">
              {selectedCitation.heading_path?.length > 0 && (
                <span>Section: {selectedCitation.heading_path.join(' > ')}</span>
              )}
              <span>Relevance Score: {(selectedCitation.score * 100).toFixed(1)}%</span>
            </div>
            <div className="chat-modal-snippet">
              <pre>{selectedCitation.snippet}</pre>
            </div>
            <div className="chat-modal-actions">
              <Link
                href={`/?note=${selectedCitation.note_id}`}
                className="chat-open-note-btn"
              >
                Open Note in Workspace →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
