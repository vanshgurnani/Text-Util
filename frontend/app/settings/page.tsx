'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  changeUserPassword,
  clearRagCache,
  getSessionToken,
  getUserSettings,
  reindexWorkspaceFull,
  testAiKey,
  updateUserSettings,
  UserSettings,
} from '../../lib/api';

type TabId = 'ai' | 'rag' | 'appearance' | 'account' | 'developer';

export default function SettingsPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>('ai');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Loaded Settings
  const [settingsData, setSettingsData] = useState<UserSettings | null>(null);

  // Form State - AI
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [ollamaUrlInput, setOllamaUrlInput] = useState('');
  const [ollamaModelInput, setOllamaModelInput] = useState('');
  const [defaultModelInput, setDefaultModelInput] = useState('gemini-2.0-flash');
  const [isEditingGemini, setIsEditingGemini] = useState(false);
  const [isEditingGroq, setIsEditingGroq] = useState(false);

  // Provider Test States
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [testingGroq, setTestingGroq] = useState(false);
  const [groqTestResult, setGroqTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  // Form State - RAG
  const [chunkSize, setChunkSize] = useState(300);
  const [chunkOverlap, setChunkOverlap] = useState(40);
  const [topK, setTopK] = useState(5);
  const [autoRagSync, setAutoRagSync] = useState(true);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Form State - Appearance
  const [themePreference, setThemePreference] = useState('system');
  const [fontPreference, setFontPreference] = useState('sans');
  const [defaultCategory, setDefaultCategory] = useState('General');

  // Form State - Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // MCP Token Display
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [generatingMcp, setGeneratingMcp] = useState(false);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.push('/login');
      return;
    }

    const savedTheme = localStorage.getItem('noteform_theme');
    if (savedTheme === 'dark' || document.body.classList.contains('dark-mode')) {
      setIsDarkMode(true);
    }

    loadSettings();
  }, [router]);

  const flashToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getUserSettings();
      setSettingsData(data);

      // Populate AI
      setGeminiKeyInput(data.ai.gemini_api_key || '');
      setGroqKeyInput(data.ai.groq_api_key || '');
      setOllamaUrlInput(data.ai.ollama_base_url || 'http://localhost:11434');
      setOllamaModelInput(data.ai.ollama_model || 'llama3.2:3b');
      setDefaultModelInput(data.ai.default_model || 'gemini-2.0-flash');

      // Populate RAG
      setChunkSize(data.ai.rag_chunk_size || 300);
      setChunkOverlap(data.ai.rag_chunk_overlap || 40);
      setTopK(data.ai.rag_top_k || 5);
      setAutoRagSync(data.ai.auto_rag_sync ?? true);

      // Populate Preferences
      setThemePreference(data.preferences.theme || 'system');
      setFontPreference(data.preferences.font_style || 'sans');
      setDefaultCategory(data.preferences.default_category || 'General');
    } catch (err: any) {
      flashToast(`Failed to load settings: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAISettings = async () => {
    try {
      setSaving(true);
      const payload: any = {
        ai: {
          ollama_base_url: ollamaUrlInput.trim(),
          ollama_model: ollamaModelInput.trim(),
          default_model: defaultModelInput,
          rag_chunk_size: chunkSize,
          rag_chunk_overlap: chunkOverlap,
          rag_top_k: topK,
          auto_rag_sync: autoRagSync,
        },
      };

      // Only send keys if modified
      if (isEditingGemini) {
        payload.ai.gemini_api_key = geminiKeyInput.trim();
      }
      if (isEditingGroq) {
        payload.ai.groq_api_key = groqKeyInput.trim();
      }

      await updateUserSettings(payload);
      flashToast('AI & RAG settings saved successfully!');
      setIsEditingGemini(false);
      setIsEditingGroq(false);
      await loadSettings();
    } catch (err: any) {
      flashToast(`Error saving settings: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setSaving(true);
      await updateUserSettings({
        preferences: {
          theme: themePreference,
          font_style: fontPreference,
          default_category: defaultCategory,
        },
      });

      // Apply theme locally
      if (themePreference === 'dark') {
        document.body.classList.add('dark-mode');
        localStorage.setItem('noteform_theme', 'dark');
        setIsDarkMode(true);
      } else if (themePreference === 'light') {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('noteform_theme', 'light');
        setIsDarkMode(false);
      }

      flashToast('Preferences updated!');
    } catch (err: any) {
      flashToast(`Error saving preferences: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const keyToSend = isEditingGemini ? geminiKeyInput.trim() : undefined;
      const res = await testAiKey({ provider: 'gemini', api_key: keyToSend });
      setGeminiTestResult(res);
    } catch (err: any) {
      setGeminiTestResult({ valid: false, message: err.message || 'Verification failed' });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestGroq = async () => {
    setTestingGroq(true);
    setGroqTestResult(null);
    try {
      const keyToSend = isEditingGroq ? groqKeyInput.trim() : undefined;
      const res = await testAiKey({ provider: 'groq', api_key: keyToSend });
      setGroqTestResult(res);
    } catch (err: any) {
      setGroqTestResult({ valid: false, message: err.message || 'Verification failed' });
    } finally {
      setTestingGroq(false);
    }
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    setOllamaTestResult(null);
    try {
      const res = await testAiKey({
        provider: 'ollama',
        base_url: ollamaUrlInput.trim(),
        model: ollamaModelInput.trim(),
      });
      setOllamaTestResult(res);
    } catch (err: any) {
      setOllamaTestResult({ valid: false, message: err.message || 'Verification failed' });
    } finally {
      setTestingOllama(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const res = await clearRagCache();
      flashToast(res.message);
      await loadSettings();
    } catch (err: any) {
      flashToast(`Failed to clear cache: ${err.message || err}`);
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleReindexAll = async () => {
    setIsReindexing(true);
    try {
      const res = await reindexWorkspaceFull();
      flashToast(`Successfully re-indexed ${res.notes_indexed} notes into ${res.chunks_indexed} chunks!`);
      await loadSettings();
    } catch (err: any) {
      flashToast(`Reindexing error: ${err.message || err}`);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus('New password must be at least 6 characters');
      return;
    }
    setUpdatingPassword(true);
    setPasswordStatus(null);
    try {
      await changeUserPassword(currentPassword, newPassword);
      setPasswordStatus('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordStatus(null), 4000);
    } catch (err: any) {
      setPasswordStatus(`Error: ${err.message || err}`);
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className={`settings-root ${isDarkMode ? 'dark-mode' : ''}`}>
      {toastMessage && <div className="settings-toast-banner">{toastMessage}</div>}

      <div className="settings-page-shell">
        {/* Top Header */}
        <header className="settings-topbar">
          <Link href="/" className="settings-back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Notes</span>
          </Link>
          <div className="settings-topbar-title">
            <h2>Workspace & AI Settings</h2>
          </div>
          <div className="settings-topbar-actions">
            <Link href="/chat" className="settings-chat-link">
              <span>Open AI Chat</span>
              <span>✨</span>
            </Link>
          </div>
        </header>

        {/* Main Content Layout */}
        <div className="settings-layout">
          {/* Left Navigation Tabs */}
          <nav className="settings-nav-sidebar">
            <button
              onClick={() => setActiveTab('ai')}
              className={`settings-nav-tab ${activeTab === 'ai' ? 'active' : ''}`}
            >
              <span className="settings-tab-icon">⚡</span>
              <span>AI Models & Keys</span>
            </button>
            <button
              onClick={() => setActiveTab('rag')}
              className={`settings-nav-tab ${activeTab === 'rag' ? 'active' : ''}`}
            >
              <span className="settings-tab-icon">🧠</span>
              <span>RAG & Knowledge Base</span>
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              className={`settings-nav-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            >
              <span className="settings-tab-icon">🎨</span>
              <span>Appearance & Editor</span>
            </button>
            <button
              onClick={() => setActiveTab('developer')}
              className={`settings-nav-tab ${activeTab === 'developer' ? 'active' : ''}`}
            >
              <span className="settings-tab-icon">🔌</span>
              <span>MCP & Developer API</span>
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`settings-nav-tab ${activeTab === 'account' ? 'active' : ''}`}
            >
              <span className="settings-tab-icon">👤</span>
              <span>Account & Security</span>
            </button>
          </nav>

          {/* Right Tab Content */}
          <main className="settings-tab-content">
            {loading ? (
              <div className="settings-loading">
                <div className="settings-spinner" />
                <span>Loading workspace settings...</span>
              </div>
            ) : (
              <>
                {/* 1. AI Models Tab */}
                {activeTab === 'ai' && (
                  <section className="settings-section">
                    <div className="settings-section-header">
                      <h3>AI Model Providers</h3>
                      <p>
                        Connect Google Gemini, Groq, or local Ollama. Your API keys are saved securely
                        in the database and <strong>always redacted</strong> when retrieved.
                      </p>
                    </div>

                    {/* Google Gemini Card */}
                    <div className="settings-card">
                      <div className="settings-card-header">
                        <div className="settings-card-title-row">
                          <span className="settings-provider-badge gemini">Google</span>
                          <h4>Gemini 2.0 Flash / Pro</h4>
                        </div>
                        {settingsData?.ai.has_custom_gemini ? (
                          <span className="settings-status-tag connected">Custom Key Active</span>
                        ) : (
                          <span className="settings-status-tag default">System Default</span>
                        )}
                      </div>

                      <p className="settings-card-desc">
                        Gemini 2.0 Flash provides fast multi-turn reasoning with a large 1M context window and free tier.
                      </p>

                      <div className="settings-field-group">
                        <label>Gemini API Key</label>
                        <div className="settings-input-action-row">
                          <input
                            type={isEditingGemini ? 'text' : 'password'}
                            value={geminiKeyInput}
                            onChange={(e) => setGeminiKeyInput(e.target.value)}
                            disabled={!isEditingGemini}
                            placeholder={isEditingGemini ? 'Enter Gemini API key (AIza...)' : '••••••••••••••••'}
                            className="settings-text-input"
                          />
                          {!isEditingGemini ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGemini(true);
                                setGeminiKeyInput('');
                              }}
                              className="settings-btn secondary"
                            >
                              Edit Key
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGemini(false);
                                setGeminiKeyInput(settingsData?.ai.gemini_api_key || '');
                              }}
                              className="settings-btn secondary"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleTestGemini}
                            disabled={testingGemini}
                            className="settings-btn test"
                          >
                            {testingGemini ? 'Testing...' : 'Test Connection'}
                          </button>
                        </div>
                        {isEditingGemini && (
                          <span className="settings-hint">
                            Leave blank and save to clear your custom key and revert to system defaults.
                          </span>
                        )}
                        {geminiTestResult && (
                          <div className={`settings-test-badge ${geminiTestResult.valid ? 'success' : 'error'}`}>
                            {geminiTestResult.valid ? '✓ ' : '✕ '}
                            {geminiTestResult.message}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Groq Card */}
                    <div className="settings-card">
                      <div className="settings-card-header">
                        <div className="settings-card-title-row">
                          <span className="settings-provider-badge groq">Groq</span>
                          <h4>Llama 3.3 70B & 3.1 8B</h4>
                        </div>
                        {settingsData?.ai.has_custom_groq ? (
                          <span className="settings-status-tag connected">Custom Key Active</span>
                        ) : (
                          <span className="settings-status-tag default">System Default</span>
                        )}
                      </div>

                      <p className="settings-card-desc">
                        Groq LPU inference enables real-time generation speeds exceeding 500 tokens/sec.
                      </p>

                      <div className="settings-field-group">
                        <label>Groq API Key</label>
                        <div className="settings-input-action-row">
                          <input
                            type={isEditingGroq ? 'text' : 'password'}
                            value={groqKeyInput}
                            onChange={(e) => setGroqKeyInput(e.target.value)}
                            disabled={!isEditingGroq}
                            placeholder={isEditingGroq ? 'Enter Groq API key (gsk_...)' : '••••••••••••••••'}
                            className="settings-text-input"
                          />
                          {!isEditingGroq ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGroq(true);
                                setGroqKeyInput('');
                              }}
                              className="settings-btn secondary"
                            >
                              Edit Key
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGroq(false);
                                setGroqKeyInput(settingsData?.ai.groq_api_key || '');
                              }}
                              className="settings-btn secondary"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleTestGroq}
                            disabled={testingGroq}
                            className="settings-btn test"
                          >
                            {testingGroq ? 'Testing...' : 'Test Connection'}
                          </button>
                        </div>
                        {groqTestResult && (
                          <div className={`settings-test-badge ${groqTestResult.valid ? 'success' : 'error'}`}>
                            {groqTestResult.valid ? '✓ ' : '✕ '}
                            {groqTestResult.message}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ollama Card */}
                    <div className="settings-card">
                      <div className="settings-card-header">
                        <div className="settings-card-title-row">
                          <span className="settings-provider-badge ollama">Local</span>
                          <h4>Ollama Local Engine</h4>
                        </div>
                        <span className="settings-status-tag local">Zero-Cost Offline</span>
                      </div>

                      <p className="settings-card-desc">
                        Connect to your local Ollama daemon for 100% private, offline LLM inference.
                      </p>

                      <div className="settings-grid-two">
                        <div className="settings-field-group">
                          <label>Ollama Base URL</label>
                          <input
                            type="text"
                            value={ollamaUrlInput}
                            onChange={(e) => setOllamaUrlInput(e.target.value)}
                            placeholder="http://localhost:11434"
                            className="settings-text-input"
                          />
                        </div>
                        <div className="settings-field-group">
                          <label>Ollama Model Name</label>
                          <input
                            type="text"
                            value={ollamaModelInput}
                            onChange={(e) => setOllamaModelInput(e.target.value)}
                            placeholder="llama3.2:3b"
                            className="settings-text-input"
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: '12px' }}>
                        <button
                          type="button"
                          onClick={handleTestOllama}
                          disabled={testingOllama}
                          className="settings-btn test"
                        >
                          {testingOllama ? 'Pinging Ollama...' : 'Ping Ollama Daemon'}
                        </button>
                        {ollamaTestResult && (
                          <div className={`settings-test-badge ${ollamaTestResult.valid ? 'success' : 'error'}`}>
                            {ollamaTestResult.valid ? '✓ ' : '✕ '}
                            {ollamaTestResult.message}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Default Model Selector */}
                    <div className="settings-card">
                      <h4>Default Workspace Model</h4>
                      <p className="settings-card-desc">
                        Choose the primary model used for new AI Chat threads and inline Markdown Copilot requests.
                      </p>

                      <div className="settings-field-group">
                        <select
                          value={defaultModelInput}
                          onChange={(e) => setDefaultModelInput(e.target.value)}
                          className="settings-select"
                        >
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fastest, High Free Quota)</option>
                          <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B Versatile</option>
                          <option value="llama-3.1-8b-instant">Groq Llama 3.1 8B Instant</option>
                          <option value={ollamaModelInput || 'llama3.2:3b'}>Ollama Local ({ollamaModelInput || 'llama3.2:3b'})</option>
                        </select>
                      </div>
                    </div>

                    <div className="settings-save-bar">
                      <button
                        onClick={handleSaveAISettings}
                        disabled={saving}
                        className="settings-btn primary"
                      >
                        {saving ? 'Saving...' : 'Save AI Configuration'}
                      </button>
                    </div>
                  </section>
                )}

                {/* 2. RAG & Knowledge Base Tab */}
                {activeTab === 'rag' && (
                  <section className="settings-section">
                    <div className="settings-section-header">
                      <h3>RAG & Vector Knowledge Base</h3>
                      <p>
                        Tune chunking parameters, manage semantic vector indexes, and clear caching.
                      </p>
                    </div>

                    {/* Statistics Overview */}
                    <div className="settings-stats-grid">
                      <div className="settings-stat-card">
                        <span className="settings-stat-value">{settingsData?.stats.notes_count || 0}</span>
                        <span className="settings-stat-label">Total Notes</span>
                      </div>
                      <div className="settings-stat-card">
                        <span className="settings-stat-value">{settingsData?.stats.chunks_count || 0}</span>
                        <span className="settings-stat-label">Indexed Chunks</span>
                      </div>
                      <div className="settings-stat-card">
                        <span className="settings-stat-value">{settingsData?.stats.cached_queries_count || 0}</span>
                        <span className="settings-stat-label">Cached Queries</span>
                      </div>
                    </div>

                    {/* RAG Parameters */}
                    <div className="settings-card">
                      <h4>Retrieval & Chunking Tuning</h4>
                      <p className="settings-card-desc">
                        Smaller chunks improve pinpoint fact lookup; larger chunks provide deeper narrative context.
                      </p>

                      <div className="settings-field-group">
                        <div className="settings-slider-header">
                          <label>Target Chunk Size: <strong>{chunkSize} tokens</strong></label>
                        </div>
                        <input
                          type="range"
                          min={150}
                          max={800}
                          step={25}
                          value={chunkSize}
                          onChange={(e) => setChunkSize(Number(e.target.value))}
                          className="settings-slider"
                        />
                        <span className="settings-hint">Default: 300 tokens (optimal for markdown paragraphs & lists).</span>
                      </div>

                      <div className="settings-field-group">
                        <div className="settings-slider-header">
                          <label>Chunk Overlap: <strong>{chunkOverlap} tokens</strong></label>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={120}
                          step={5}
                          value={chunkOverlap}
                          onChange={(e) => setChunkOverlap(Number(e.target.value))}
                          className="settings-slider"
                        />
                        <span className="settings-hint">Default: 40 tokens (prevents facts spanning section boundaries from being cut).</span>
                      </div>

                      <div className="settings-field-group">
                        <div className="settings-slider-header">
                          <label>Top-K Retrievable Context Chunks: <strong>{topK} chunks</strong></label>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={12}
                          step={1}
                          value={topK}
                          onChange={(e) => setTopK(Number(e.target.value))}
                          className="settings-slider"
                        />
                        <span className="settings-hint">Controls how many note references are fed into the LLM prompt.</span>
                      </div>

                      <div className="settings-field-group">
                        <label className="settings-checkbox-row">
                          <input
                            type="checkbox"
                            checked={autoRagSync}
                            onChange={(e) => setAutoRagSync(e.target.checked)}
                          />
                          <span>Automatically delta-index notes whenever they are saved</span>
                        </label>
                      </div>
                    </div>

                    {/* Index & Cache Operations */}
                    <div className="settings-card">
                      <h4>Database Maintenance & Cache</h4>
                      <p className="settings-card-desc">
                        Force a re-index if you imported new notes or clear the query response cache.
                      </p>

                      <div className="settings-btn-row">
                        <button
                          type="button"
                          onClick={handleReindexAll}
                          disabled={isReindexing}
                          className="settings-btn primary"
                        >
                          {isReindexing ? 'Re-indexing Notes...' : '🔄 Re-index All Notes'}
                        </button>

                        <button
                          type="button"
                          onClick={handleClearCache}
                          disabled={isClearingCache}
                          className="settings-btn secondary"
                        >
                          {isClearingCache ? 'Clearing...' : '🧹 Clear Query Cache'}
                        </button>
                      </div>
                    </div>

                    <div className="settings-save-bar">
                      <button
                        onClick={handleSaveAISettings}
                        disabled={saving}
                        className="settings-btn primary"
                      >
                        {saving ? 'Saving...' : 'Save RAG Settings'}
                      </button>
                    </div>
                  </section>
                )}

                {/* 3. Appearance Tab */}
                {activeTab === 'appearance' && (
                  <section className="settings-section">
                    <div className="settings-section-header">
                      <h3>Appearance & Editor Preferences</h3>
                      <p>Customize typography, themes, and default note categories.</p>
                    </div>

                    <div className="settings-card">
                      <h4>Theme Mode</h4>
                      <div className="settings-pill-selector">
                        {['light', 'dark', 'system'].map((th) => (
                          <button
                            key={th}
                            type="button"
                            onClick={() => setThemePreference(th)}
                            className={`settings-pill-btn ${themePreference === th ? 'active' : ''}`}
                          >
                            {th === 'light' ? '☀️ Light' : th === 'dark' ? '🌙 Dark' : '💻 System Match'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="settings-card">
                      <h4>Default Editor Typography</h4>
                      <div className="settings-pill-selector">
                        {[
                          { id: 'sans', label: 'Default Sans (Inter)' },
                          { id: 'serif', label: 'Serif (Playfair Display)' },
                          { id: 'mono', label: 'Monospace (DM Mono)' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setFontPreference(f.id)}
                            className={`settings-pill-btn ${fontPreference === f.id ? 'active' : ''}`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="settings-card">
                      <h4>Default Category for New Notes</h4>
                      <div className="settings-field-group">
                        <select
                          value={defaultCategory}
                          onChange={(e) => setDefaultCategory(e.target.value)}
                          className="settings-select"
                        >
                          <option value="General">General</option>
                          <option value="Work">Work</option>
                          <option value="Personal">Personal</option>
                          <option value="Ideas">Ideas</option>
                          <option value="Reading">Reading</option>
                        </select>
                      </div>
                    </div>

                    <div className="settings-save-bar">
                      <button
                        onClick={handleSavePreferences}
                        disabled={saving}
                        className="settings-btn primary"
                      >
                        {saving ? 'Saving...' : 'Save Preferences'}
                      </button>
                    </div>
                  </section>
                )}

                {/* 4. Developer & MCP Tab */}
                {activeTab === 'developer' && (
                  <section className="settings-section">
                    <div className="settings-section-header">
                      <h3>Developer Integrations & OpenAI Compatible Endpoint</h3>
                      <p>
                        Connect external coding agents, Cursor, Claude Desktop, and ChatGPT to your Noteform workspace.
                      </p>
                    </div>

                    {/* OpenAI Compatible API */}
                    <div className="settings-card">
                      <h4>OpenAI-Compatible RAG Endpoint</h4>
                      <p className="settings-card-desc">
                        Use Noteform as an OpenAI replacement. Point any LLM client (Cursor, LangChain, OpenAI SDK)
                        to Noteform to query your workspace notes automatically.
                      </p>

                      <div className="settings-field-group">
                        <label>Base URL</label>
                        <div className="settings-code-box">
                          <code>{typeof window !== 'undefined' ? `${window.location.origin}/v1` : 'http://localhost:8000/v1'}</code>
                        </div>
                      </div>

                      <div className="settings-field-group">
                        <label>Example cURL Request</label>
                        <pre className="settings-pre-code">{`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'}/v1/chat/completions" \\
  -H "Authorization: Bearer <your-session-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "noteform-workspace-rag",
    "messages": [{"role": "user", "content": "What notes do I have about architecture?"}]
  }'`}</pre>
                      </div>
                    </div>

                    {/* MCP Section */}
                    <div className="settings-card">
                      <h4>Model Context Protocol (MCP)</h4>
                      <p className="settings-card-desc">
                        Connect Claude Desktop or custom MCP clients to search, create, and update notes directly.
                      </p>

                      <div className="settings-field-group">
                        <label>Public MCP URL</label>
                        <div className="settings-code-box">
                          <code>{typeof window !== 'undefined' ? `${window.location.origin}/mcp` : '/mcp'}</code>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* 5. Account Tab */}
                {activeTab === 'account' && (
                  <section className="settings-section">
                    <div className="settings-section-header">
                      <h3>Account & Security</h3>
                      <p>Manage your account profile and password credentials.</p>
                    </div>

                    <div className="settings-card">
                      <h4>Profile Details</h4>
                      <div className="settings-grid-two">
                        <div className="settings-field-group">
                          <label>Username</label>
                          <input
                            type="text"
                            value={settingsData?.user.username || ''}
                            disabled
                            className="settings-text-input disabled"
                          />
                        </div>
                        <div className="settings-field-group">
                          <label>Email Address</label>
                          <input
                            type="text"
                            value={settingsData?.user.email || ''}
                            disabled
                            className="settings-text-input disabled"
                          />
                        </div>
                      </div>
                      <span className="settings-hint">
                        Member since: {new Date(settingsData?.user.created_at || Date.now()).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="settings-card">
                      <h4>Change Password</h4>
                      <form onSubmit={handleChangePassword}>
                        <div className="settings-field-group">
                          <label>Current Password</label>
                          <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            className="settings-text-input"
                          />
                        </div>

                        <div className="settings-grid-two">
                          <div className="settings-field-group">
                            <label>New Password</label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              required
                              minLength={6}
                              className="settings-text-input"
                            />
                          </div>
                          <div className="settings-field-group">
                            <label>Confirm New Password</label>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              required
                              className="settings-text-input"
                            />
                          </div>
                        </div>

                        {passwordStatus && (
                          <div
                            className={`settings-test-badge ${
                              passwordStatus.includes('success') ? 'success' : 'error'
                            }`}
                          >
                            {passwordStatus}
                          </div>
                        )}

                        <div style={{ marginTop: '14px' }}>
                          <button
                            type="submit"
                            disabled={updatingPassword}
                            className="settings-btn primary"
                          >
                            {updatingPassword ? 'Updating...' : 'Update Password'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
