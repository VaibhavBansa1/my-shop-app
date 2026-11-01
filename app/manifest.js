// Web app manifest: lets people "Add to home screen" and open the website like an app.
export default function manifest() {
  return {
    name: 'My Shop App',
    short_name: 'My Shop',
    description: 'Billing, stock and accounts for your shop.',
    start_url: '/orgs',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#0f766e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
