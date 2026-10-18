'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);

  return (
    <>
      <div className="markdown-mode">
        <button
          type="button"
          className={!preview ? 'active' : ''}
          aria-pressed={!preview}
          onClick={() => setPreview(false)}
        >
          Write
        </button>
        <button
          type="button"
          className={preview ? 'active' : ''}
          aria-pressed={preview}
          onClick={() => setPreview(true)}
        >
          Preview
        </button>
      </div>
      {preview ? (
        <div className="markdown-preview">
          {value ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="markdown-empty">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          className="editor-textarea"
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="Start writing here…"
        />
      )}
    </>
  );
}
