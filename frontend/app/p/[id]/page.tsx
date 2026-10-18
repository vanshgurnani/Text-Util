'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchPublicNote, PublicNote } from '@/lib/api';

export default function PublicNotePage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  
  const [note, setNote] = useState<PublicNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchPublicNote(id)
      .then(data => {
        if (isMounted) {
          setNote(data);
          setLoading(false);
          if (data.title) {
            document.title = `${data.title} — Noteform`;
          }
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'This note is private or does not exist');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  if (loading) {
    return (
      <div className="public-note-container">
        <header className="public-note-nav">
          <Link href="/" className="public-note-brand">
            <span className="public-brand-icon">✦</span>
            <span className="public-brand-name">Noteform</span>
          </Link>
        </header>
        <main className="public-note-canvas">
          <div className="public-note-skeleton">
            <div className="skeleton-icon pulse" />
            <div className="skeleton-title pulse" />
            <div className="skeleton-meta pulse" />
            <div className="skeleton-line pulse" />
            <div className="skeleton-line pulse" style={{ width: '85%' }} />
            <div className="skeleton-line pulse" style={{ width: '92%' }} />
            <div className="skeleton-line pulse" style={{ width: '70%' }} />
          </div>
        </main>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="public-note-container">
        <header className="public-note-nav">
          <Link href="/" className="public-note-brand">
            <span className="public-brand-icon">✦</span>
            <span className="public-brand-name">Noteform</span>
          </Link>
          <div className="public-nav-actions">
            <Link href="/" className="public-cta-btn">
              Open Noteform
            </Link>
          </div>
        </header>
        <main className="public-note-canvas">
          <div className="public-note-error-card">
            <div className="public-error-icon">🔒</div>
            <h1 className="public-error-title">This note is private or doesn't exist</h1>
            <p className="public-error-desc">
              The owner may have turned off public sharing, restricted access, or deleted this note.
            </p>
            <Link href="/" className="public-primary-btn">
              Go to Noteform Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="public-note-container">
      {/* Sleek top navigation */}
      <header className="public-note-nav">
        <Link href="/" className="public-note-brand" title="Noteform Home">
          <span className="public-brand-icon">✦</span>
          <span className="public-brand-name">Noteform</span>
          <span className="public-badge-readonly">View Only</span>
        </Link>
        <div className="public-nav-actions">
          <button
            type="button"
            className="public-share-copy-btn"
            onClick={handleCopyLink}
            title="Copy link to clipboard"
          >
            {copied ? (
              <>
                <span className="copy-check">✓</span> Copied!
              </>
            ) : (
              <>
                <span className="copy-icon">🔗</span> Share Link
              </>
            )}
          </button>
          <Link href="/login" className="public-cta-btn">
            Create Note
          </Link>
        </div>
      </header>

      {/* Main Document Canvas */}
      <main className="public-note-canvas">
        <article className="public-note-document">
          {/* Note Icon */}
          <div className="public-note-icon-wrap" aria-hidden="true">
            <span className="public-note-icon">{note.icon || '📄'}</span>
          </div>

          {/* Title */}
          <h1 className="public-note-title">{note.title || 'Untitled'}</h1>

          {/* Metadata pill bar */}
          <div className="public-note-meta-row">
            {note.category && (
              <span className="public-meta-chip category-chip">
                <span className="meta-dot" />
                {note.category}
              </span>
            )}
            {note.tags && note.tags.length > 0 && (
              <div className="public-tags-group">
                {note.tags.map(tag => (
                  <span key={tag} className="public-meta-chip tag-chip">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <span className="public-meta-updated">
              Updated {formatDate(note.updated_at)}
            </span>
          </div>

          <hr className="public-note-divider" />

          {/* Rendered Markdown Body */}
          <div className="notion-markdown-rendered public-markdown-body">
            {note.content && note.content.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  input: ({ ...props }) => {
                    if (props.type === 'checkbox') {
                      return (
                        <input
                          type="checkbox"
                          checked={props.checked}
                          readOnly
                          className="notion-interactive-checkbox"
                          style={{ cursor: 'default' }}
                        />
                      );
                    }
                    return <input {...props} />;
                  },
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {note.content}
              </ReactMarkdown>
            ) : (
              <div className="public-empty-content">
                <em>This note is empty.</em>
              </div>
            )}
          </div>
        </article>

        {/* Subtle footer */}
        <footer className="public-note-footer">
          <div className="public-footer-inner">
            <span>Published with <strong>Noteform</strong></span>
            <span className="footer-bullet">•</span>
            <span>The calm, fast personal workspace</span>
            <span className="footer-bullet">•</span>
            <Link href="/" className="footer-link">
              Make your own notes →
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
