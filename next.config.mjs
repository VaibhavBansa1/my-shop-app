/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

export default {
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (only the files the server needs).
  output: 'standalone',
  outputFileTracingIncludes: { '/*': ['./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*', './docs/GLOSSARY.md', './docs/FIELDS.md'] },
  // Tesseract spawns worker threads and loads files at runtime; keep it out of the bundle.
  serverExternalPackages: ['tesseract.js', '@tesseract.js-data/eng', 'bullmq', 'ioredis', 'prom-client', 'nodemailer'],
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
