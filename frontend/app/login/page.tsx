'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveSession, User } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(result.token, result.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
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

        <h1 className="notion-auth-title">Log in</h1>
        <p className="notion-auth-subtitle">Continue to your personal workspace</p>

        {error && <div className="notion-auth-error" role="alert">{error}</div>}

        <form onSubmit={submit} className="notion-auth-form">
          <label className="notion-auth-field">
            <span>Email</span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email…"
              required
            />
          </label>

          <label className="notion-auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password…"
              required
            />
          </label>

          <button
            type="submit"
            className="notion-auth-submit"
            disabled={loading || !email || !password}
          >
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>

        <div className="notion-auth-footer">
          Don&apos;t have an account? <Link href="/register">Sign up</Link>
        </div>
      </div>
    </main>
  );
}
