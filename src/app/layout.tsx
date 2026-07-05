import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Facility Management Pro Cleaning & Maintenance',
  description: 'Facility Management Pro Cleaning & Maintenance — admin portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
