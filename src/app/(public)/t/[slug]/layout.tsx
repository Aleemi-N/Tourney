import { PublicExtrasProvider } from '@/components/public/PublicExtrasProvider';
import type { PublicExtras } from '@/components/public/SponsorStrip';
import { createClient } from '@/lib/supabase/server';

/**
 * Public tournament page layout. It stays mounted while people move between the tournament's pages, so the stream link and
 * sponsors are fetched here once, on the server, and handed to the pages' frame (no extra request from the browser).
 */
export default async function TournamentPublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = (await createClient()) as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data } = await supabase.rpc('get_public_extras', { p_slug: slug });
  // Public tournament experiences intentionally use Tourny's dark token set.
  // Keeping the theme on the shared route layout also prevents a light frame
  // while navigating between the tournament page and registration pages.
  return (
    <PublicExtrasProvider value={(data as PublicExtras | null) ?? null}>
      <div className="dark min-h-screen bg-background text-text-primary">{children}</div>
    </PublicExtrasProvider>
  );
}
