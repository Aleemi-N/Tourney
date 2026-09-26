import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return buildTournamentMetadata(slug, 'team');
}

/**
 * Backward compatibility alias: /t/[slug]/register/owner
 * Redirects to the canonical Team Registration URL: /t/[slug]/register/team
 */
export default async function OwnerRegistrationRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/t/${slug}/register/team`);
}
