import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // SAMEORIGIN, not DENY: this header also governs `<object>` and
          // `<embed>`, so DENY stops the browser rendering our own PDFs on the
          // document page. SAMEORIGIN still refuses every third-party frame,
          // which is the threat this is here for.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // A personal knowledge base has no business being embedded or probed
          // by third-party pages.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
