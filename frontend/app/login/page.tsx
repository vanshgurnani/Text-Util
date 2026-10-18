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
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      saveSession(result.token, result.user); router.push('/');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in'); }
    finally { setLoading(false); }
  }

  return <main className="auth-shell"><div className="auth-art"><div className="brand-mark">✦</div><p className="eyebrow">NOTEFORM</p><h1>Your thoughts,<br /><em>with room to grow.</em></h1><p className="auth-tagline">A considered home for the things you want to remember.</p><div className="floating-note note-one">“The best ideas start as fragments.”<small>Daily note · Today</small></div><div className="floating-note note-two">✦  12 ideas in progress</div></div><section className="auth-card"><div className="auth-brand"><span>✦</span> Noteform</div><h2>Welcome back</h2><p className="muted">Pick up where you left off.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button wide" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'} <span>→</span></button></form><p className="auth-switch">New to Noteform? <Link href="/register">Create an account</Link></p></section></main>;
}
