'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveSession, User } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setLoading(true); try { const result = await api<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(form) }); saveSession(result.token, result.user); router.push('/'); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create account'); } finally { setLoading(false); } }
  return <main className="auth-shell"><div className="auth-art register-art"><div className="brand-mark">✦</div><p className="eyebrow">A QUIET PLACE TO THINK</p><h1>Make space for<br /><em>better ideas.</em></h1><p className="auth-tagline">Write freely. Organize gently. Find anything with GPT.</p><div className="orbit">✦</div></div><section className="auth-card"><div className="auth-brand"><span>✦</span> Noteform</div><h2>Start your workspace</h2><p className="muted">It only takes a moment.</p><form onSubmit={submit}><label>Username<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Your name" required /></label><label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required /></label><label>Password<input type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button wide" disabled={loading}>{loading ? 'Creating…' : 'Create workspace'} <span>→</span></button></form><p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p></section></main>;
}
