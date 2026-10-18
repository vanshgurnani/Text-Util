import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NoteOS — your thinking, in one place',
  description: 'NoteOS — a calm workspace for notes, ideas, and GPT-powered recall.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
