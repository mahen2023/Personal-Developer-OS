import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { THEME_BOOT_SCRIPT, ThemeProvider } from '@/components/system/ThemeProvider';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Reserved for machine-readable values: IPs, commands, keys, commit SHAs.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-face',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Developer OS',
  description: 'Private knowledge, project and infrastructure command centre.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0e12' },
    { media: '(prefers-color-scheme: light)', color: '#f6f6f3' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paints the stored theme before first paint — no white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${sans.variable} ${mono.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
