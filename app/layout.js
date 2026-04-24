import './globals.css';

export const metadata = {
  title: 'My Shop App',
  description: 'Shop management app with PostgreSQL and Next.js',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
