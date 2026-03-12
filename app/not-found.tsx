import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for does not exist.',
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body style={{
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0a0a0f',
        color: '#888',
        fontFamily: 'system-ui, sans-serif',
        margin: 0,
      }}>
        <h1 style={{ fontSize: '3rem', margin: 0, color: '#fff' }}>404</h1>
        <p style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>Page not found</p>
      </body>
    </html>
  );
}
