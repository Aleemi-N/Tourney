import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/**
 * Application font — loaded via next/font (never CSS @import).
 * Geist is a clean modern sans-serif well-suited to sports/SaaS UIs.
 * The mono variant is retained for numeric/code contexts.
 */
const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://tournyappfyniti.vercel.app'),
  title: {
    default: 'Tournament Platform',
    template: '%s | Tournament Platform',
  },
  description:
    'Mobile-first volleyball tournament management — lots, auction, live scoring, fixtures, and standings.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tourny',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'Tournament Platform',
    title: {
      default: 'Tournament Platform',
      template: '%s | Tournament Platform',
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#0f0f11',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

// LayoutProps generic comes from Next.js typegen; use a manual type here
// until the typegen runs after migrations are applied.
type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full scroll-smooth bg-background`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
