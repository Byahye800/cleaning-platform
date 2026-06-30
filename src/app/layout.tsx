import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yahye Admin',
  description: 'Admin portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
