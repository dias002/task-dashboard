import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Task Dashboard',
  description: 'Public dashboard for collecting and completing tasks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
