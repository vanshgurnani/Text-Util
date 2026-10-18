'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveSession, User } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      saveSession(result.token, result.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="notion-auth-container">
      <div className="notion-auth-box">
        <div className="notion-auth-brand">
          <div className="notion-auth-icon">✦</div>
          <span className="notion-auth-brand-text">Noteform</span>
        </div>

        <h1 className="notion-auth-title">Create an account</h1>
        <p className="notion-auth-subtitle">Start thinking and writing in your private workspace</p>

        {error && <div className="notion-auth-error" role="alert">{error}</div>}

        <form onSubmit={submit} className="notion-auth-form">
          <label className="notion-auth-field">
            <span>Username</span>
            <input
              autoFocus
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="What should we call you?"
              required
            />
          </label>

          <label className="notion-auth-field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="Enter your email…"
              required
            />
          </label>

          <label className="notion-auth-field">
            <span>Password</span>
            <input
              type="password"
              minLength={8}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="At least 8 characters…"
              required
            />
          </label>

          <button
            type="submit"
            className="notion-auth-submit"
            disabled={loading || !form.username || !form.email || !form.password}
          >
            {loading ? 'Creating workspace…' : 'Continue'}
          </button>
        </form>

        <div className="notion-auth-footer">
          Already have an account? <Link href="/login">Log in</Link>
        </div>
      </div>
    </main>
  );
}
