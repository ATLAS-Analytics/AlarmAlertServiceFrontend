import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { getUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Alarm And Alert Service',
  description: 'Alarm and Alert subscriptions',
  keywords: ['ML', 'Alarms', 'Alerts', 'anomaly detection'],
  authors: [{ name: 'Ilija Vukotic' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = (await getUser()) !== undefined;
  return (
    <html lang="en" translate="no">
      <body>
        <Navigation loggedIn={loggedIn} />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
