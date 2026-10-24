'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface PageMentionItem {
  id: string;
  title: string;
  icon?: string;
}

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fontStyle?: 'sans' | 'serif' | 'mono';
  availablePages?: PageMentionItem[];
  onOpenPage?: (pageId: string) => void;
};

interface SlashCommand {
  id: string;
  label: string;
  desc: string;
  icon: string;
  syntax: string;
  cursorOffset?: number;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'ask-ai', label: 'Ask AI Copilot', desc: 'Query workspace or summarize note with AI', icon: '✨', syntax: '> 🤖 **AI Copilot:** ' },
  { id: 'summary-ai', label: 'AI Summary Section', desc: 'Structured AI synthesis template', icon: '⚡', syntax: '## ⚡ AI Summary\n- **Key Takeaways:** \n- **Action Items:** \n\n' },
  { id: 'h1', label: 'Heading 1', desc: 'Big section heading', icon: 'H1', syntax: '# ' },
  { id: 'h2', label: 'Heading 2', desc: 'Medium section heading', icon: 'H2', syntax: '## ' },
  { id: 'h3', label: 'Heading 3', desc: 'Small section heading', icon: 'H3', syntax: '### ' },
  { id: 'todo', label: 'To-do list', desc: 'Track tasks with checkboxes', icon: '☑', syntax: '- [ ] ' },
  { id: 'bullet', label: 'Bulleted list', desc: 'Create a simple bulleted list', icon: '•', syntax: '- ' },
  { id: 'number', label: 'Numbered list', desc: 'Create a list with numbering', icon: '1.', syntax: '1. ' },
  { id: 'toggle', label: 'Toggle list', desc: 'Collapsible details section', icon: '▶', syntax: '<details>\n<summary>Toggle heading</summary>\n\nHidden details go here.\n\n</details>\n' },
  { id: 'callout-note', label: 'Callout (Note)', desc: 'Standard idea callout', icon: '💡', syntax: '> 💡 **Note:** ' },
  { id: 'callout-info', label: 'Callout (Blue Info)', desc: 'Informational highlight', icon: 'ℹ️', syntax: '> ℹ️ **Info:** ' },
  { id: 'callout-warn', label: 'Callout (Warning)', desc: 'Warning alert block', icon: '⚠️', syntax: '> ⚠️ **Warning:** ' },
  { id: 'callout-done', label: 'Callout (Success)', desc: 'Success confirmation block', icon: '✅', syntax: '> ✅ **Success:** ' },
  { id: 'quote', label: 'Quote', desc: 'Capture a quote or excerpt', icon: '❝', syntax: '> ' },
  { id: 'code', label: 'Code Block', desc: 'Capture a code snippet', icon: '</>', syntax: '```javascript\n// code here\n```\n', cursorOffset: 14 },
  { id: 'divider', label: 'Divider', desc: 'Visually divide blocks', icon: '―', syntax: '\n---\n\n' },
  { id: 'table', label: 'Table', desc: 'Insert a simple markdown table', icon: '▦', syntax: '| Item | Status | Notes |\n|---|---|---|\n| Task 1 | Done | On track |\n' },
];

export default function MarkdownEditor({
  value,
  onChange,
  fontStyle = 'sans',
  availablePages = [],
  onOpenPage,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  // Page mentions state ([[page]])
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = useMemo(() => SLASH_COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(slashQuery.toLowerCase()) ||
    cmd.id.toLowerCase().includes(slashQuery.toLowerCase()) ||
    cmd.desc.toLowerCase().includes(slashQuery.toLowerCase())
  ), [slashQuery]);

  const filteredPages = useMemo(() => availablePages.filter(p =>
    (p.title || 'Untitled').toLowerCase().includes(mentionQuery.toLowerCase())
  ), [availablePages, mentionQuery]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  function insertCommand(cmd: SlashCommand) {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    let prefix = value.slice(0, start);
    const suffix = value.slice(end);

    const lastSlashIndex = prefix.lastIndexOf('/');
    if (lastSlashIndex !== -1 && lastSlashIndex >= start - 20) {
      prefix = prefix.slice(0, lastSlashIndex);
    }

    const insertion = cmd.syntax;
    const nextValue = prefix + insertion + suffix;
    onChange(nextValue);
    setSlashOpen(false);
    setSlashQuery('');

    setTimeout(() => {
      textarea.focus();
      const newCursor = prefix.length + (cmd.cursorOffset ?? insertion.length);
      textarea.setSelectionRange(newCursor, newCursor);
    }, 10);
  }

  function insertPageMention(page: PageMentionItem) {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    let prefix = value.slice(0, start);
    const suffix = value.slice(end);

    const lastBracketIndex = prefix.lastIndexOf('[[');
    if (lastBracketIndex !== -1 && lastBracketIndex >= start - 30) {
      prefix = prefix.slice(0, lastBracketIndex);
    }

    const insertion = `[[${page.title || 'Untitled'}]]`;
    const nextValue = prefix + insertion + suffix;
    onChange(nextValue);
    setMentionOpen(false);
    setMentionQuery('');

    setTimeout(() => {
      textarea.focus();
      const newCursor = prefix.length + insertion.length;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 10);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash Menu Keyboard Navigation
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(i => (i + 1) % (filteredCommands.length || 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(i => (i - 1 + filteredCommands.length) % (filteredCommands.length || 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands[slashIndex]) {
          e.preventDefault();
          insertCommand(filteredCommands[slashIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }

    // Mention Menu Keyboard Navigation
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % (filteredPages.length || 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredPages.length) % (filteredPages.length || 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredPages[mentionIndex]) {
          e.preventDefault();
          insertPageMention(filteredPages[mentionIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    // Trigger slash menu
    if (e.key === '/') {
      const textarea = e.currentTarget;
      const pos = textarea.selectionStart;
      const prevChar = pos > 0 ? value[pos - 1] : '\n';
      if (prevChar === '\n' || prevChar === ' ') {
        setSlashOpen(true);
        setSlashQuery('');
      }
    }

    // Markdown keyboard shortcuts
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      if (e.key === 'b') {
        e.preventDefault();
        wrapSelection('**', '**');
      } else if (e.key === 'i') {
        e.preventDefault();
        wrapSelection('*', '*');
      } else if (e.key === 'e') {
        e.preventDefault();
        wrapSelection('`', '`');
      }
    }
  }

  function wrapSelection(before: string, after: string) {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end) || 'text';
    const nextValue = value.slice(0, start) + before + selectedText + after + value.slice(end);
    onChange(nextValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 10);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextVal = e.target.value;
    onChange(nextVal);

    const pos = e.target.selectionStart;

    // Check for slash menu query
    if (slashOpen) {
      const lastSlash = nextVal.slice(0, pos).lastIndexOf('/');
      if (lastSlash === -1) {
        setSlashOpen(false);
      } else {
        const query = nextVal.slice(lastSlash + 1, pos);
        if (query.includes(' ') || query.includes('\n')) {
          setSlashOpen(false);
        } else {
          setSlashQuery(query);
        }
      }
    }

    // Check for [[ page mention trigger
    const upToCursor = nextVal.slice(0, pos);
    const lastDoubleBracket = upToCursor.lastIndexOf('[[');
    if (lastDoubleBracket !== -1 && !upToCursor.slice(lastDoubleBracket).includes(']]')) {
      const query = upToCursor.slice(lastDoubleBracket + 2);
      if (!query.includes('\n') && query.length <= 40) {
        setMentionOpen(true);
        setMentionQuery(query);
        setSlashOpen(false);
      } else {
        setMentionOpen(false);
      }
    } else {
      if (mentionOpen) setMentionOpen(false);
    }
  }

  // Interactive Checklist Toggle in Preview
  function toggleCheckbox(targetIdx: number) {
    let count = 0;
    const nextValue = value.replace(/- \[( |x)\]/gi, match => {
      if (count === targetIdx) {
        count++;
        return match.toLowerCase().includes('x') ? '- [ ]' : '- [x]';
      }
      count++;
      return match;
    });
    onChange(nextValue);
  }

  // Prepare value for preview: replace [[Page Title]] with custom markdown link
  const renderedContent = useMemo(() => {
    return value.replace(/\[\[(.*?)\]\]/g, (_match, pageTitle) => {
      return `[📄 ${pageTitle}](#page-mention:${encodeURIComponent(pageTitle)})`;
    });
  }, [value]);

  let checkboxIndexCounter = 0;

  return (
    <div className={`notion-editor-wrapper font-${fontStyle}`}>
      {/* Top action row */}
      <div className="notion-editor-header">
        <div className="notion-format-toolbar">
          <button type="button" onClick={() => wrapSelection('**', '**')} title="Bold (⌘B)"><b>B</b></button>
          <button type="button" onClick={() => wrapSelection('*', '*')} title="Italic (⌘I)"><i>I</i></button>
          <button type="button" onClick={() => wrapSelection('`', '`')} title="Inline Code (⌘E)"><code>&lt;&gt;</code></button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[0])} title="Heading 1">H1</button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[1])} title="Heading 2">H2</button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[3])} title="To-do list">☑</button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[4])} title="Bullet list">•</button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[6])} title="Toggle list">▶ Toggle</button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[7])} title="Callout">💡</button>
          <button type="button" onClick={() => insertCommand(SLASH_COMMANDS[13])} title="Divider">―</button>
          <button
            type="button"
            className="notion-slash-trigger"
            onClick={() => { setSlashOpen(true); setSlashQuery(''); textareaRef.current?.focus(); }}
          >
            / Commands
          </button>
          {availablePages.length > 0 && (
            <button
              type="button"
              className="notion-mention-trigger"
              onClick={() => { setMentionOpen(true); setMentionQuery(''); textareaRef.current?.focus(); }}
              title="Link a page ([[])"
            >
              @ Link page
            </button>
          )}
        </div>

        <div className="notion-view-modes">
          <button
            type="button"
            className={mode === 'write' ? 'active' : ''}
            onClick={() => setMode('write')}
          >
            Write
          </button>
          <button
            type="button"
            className={mode === 'preview' ? 'active' : ''}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={mode === 'split' ? 'active' : ''}
            onClick={() => setMode('split')}
          >
            Split
          </button>
        </div>
      </div>

      {/* Slash command popover */}
      {slashOpen && (
        <div className="notion-slash-menu">
          <div className="notion-slash-menu-header">NOTION BLOCKS</div>
          {filteredCommands.length === 0 ? (
            <div className="notion-slash-empty">No matching blocks</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                className={`notion-slash-item ${idx === slashIndex ? 'active' : ''}`}
                onMouseEnter={() => setSlashIndex(idx)}
                onClick={() => insertCommand(cmd)}
              >
                <div className="notion-slash-icon">{cmd.icon}</div>
                <div className="notion-slash-info">
                  <div className="notion-slash-label">{cmd.label}</div>
                  <div className="notion-slash-desc">{cmd.desc}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Page Mentions popover ([[page]]) */}
      {mentionOpen && (
        <div className="notion-mention-menu">
          <div className="notion-slash-menu-header">LINK TO PAGE</div>
          {filteredPages.length === 0 ? (
            <div className="notion-slash-empty">No matching pages</div>
          ) : (
            filteredPages.map((page, idx) => (
              <button
                key={page.id}
                type="button"
                className={`notion-slash-item ${idx === mentionIndex ? 'active' : ''}`}
                onMouseEnter={() => setMentionIndex(idx)}
                onClick={() => insertPageMention(page)}
              >
                <div className="notion-slash-icon">{page.icon || '📄'}</div>
                <div className="notion-slash-info">
                  <div className="notion-slash-label">{page.title || 'Untitled'}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Editor Body */}
      <div className={`notion-editor-body mode-${mode}`}>
        {(mode === 'write' || mode === 'split') && (
          <div className="notion-textarea-pane">
            <textarea
              ref={textareaRef}
              className="notion-textarea"
              value={value}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Type '/' for commands or '[[' to link a page…"
            />
          </div>
        )}

        {(mode === 'preview' || mode === 'split') && (
          <div className="notion-preview-pane">
            {value.trim() ? (
              <div className="notion-markdown-rendered">
                {(() => {
                  checkboxIndexCounter = 0;
                  return null;
                })()}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    input: ({ ...props }) => {
                      if (props.type === 'checkbox') {
                        const idx = checkboxIndexCounter++;
                        return (
                          <input
                            type="checkbox"
                            checked={props.checked}
                            onChange={() => toggleCheckbox(idx)}
                            className="notion-interactive-checkbox"
                          />
                        );
                      }
                      return <input {...props} />;
                    },
                    a: ({ href, children }) => {
                      if (href?.startsWith('#page-mention:')) {
                        const targetTitle = decodeURIComponent(href.replace('#page-mention:', ''));
                        const matched = availablePages.find(p => p.title.toLowerCase() === targetTitle.toLowerCase());
                        return (
                          <button
                            type="button"
                            className="notion-page-mention-pill"
                            onClick={() => {
                              if (matched && onOpenPage) {
                                onOpenPage(matched.id);
                              }
                            }}
                          >
                            {children}
                          </button>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {renderedContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="notion-preview-empty">Nothing to preview yet. Start typing to see your rendered document.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
