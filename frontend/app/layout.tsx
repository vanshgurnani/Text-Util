import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Noteform — your thinking, in one place',
  description: 'A calm workspace for notes, ideas, and GPT-powered recall.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
