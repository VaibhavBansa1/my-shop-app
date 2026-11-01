import './globals.css';
import { headers } from 'next/headers';

export const metadata = {
  title: { default: 'My Shop App', template: '%s · My Shop App' },
  description: 'Accounting, inventory and GST billing for shops. Works on phone and computer.',
  icons: { icon: '/icon-32.png', apple: '/icon-180.png' },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e' };

export default async function RootLayout({ children }) {
  // Reading headers makes every page dynamic so the per-request CSP nonce is applied.
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
