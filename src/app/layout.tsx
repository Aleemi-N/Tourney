import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

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
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

// LayoutProps generic comes from Next.js typegen; use a manual type here
// until the typegen runs after migrations are applied.
type RootLayoutProps = {
  children: React.ReactNode;
};

/**
 * Sets data-theme on <html> before first paint: the saved choice from
 * ThemeToggle, otherwise the OS preference (followed live while unset).
 */
const themeScript = `(function(){var k='tourny-theme',m=window.matchMedia('(prefers-color-scheme: dark)');function saved(){try{return localStorage.getItem(k)}catch(e){return null}}function apply(){var s=saved();document.documentElement.dataset.theme=s==='light'||s==='dark'?s:(m.matches?'dark':'light')}apply();m.addEventListener('change',apply)})()`;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth bg-background`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-background text-text-primary antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
