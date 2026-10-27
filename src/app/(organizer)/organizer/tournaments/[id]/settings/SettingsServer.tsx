/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PaymentSettingsForm } from './PaymentSettingsForm';
import { RegistrationLimitsForm } from './RegistrationLimitsForm';
import { SettingsForm } from './SettingsForm';
import { TournamentDetailsForm } from './TournamentDetailsForm';
import { RulesAndStages } from './RulesAndStages';
import { AuctionPriceCategoriesForm } from './AuctionPriceCategoriesForm';
import type { Phase5Configuration } from './SettingsForm';
import type { AuctionCategory } from '@/lib/organizer/organizer-auction';

export async function SettingsServer({ tournament }: { tournament: any }) {
  const supabase = await createClient();

  const isAuctionLeague =
    tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  const [{ data: settings }, { data: branding }, { data: phase5Configuration }, auctionCategoriesResult, auctionStatusResult] =
    await Promise.all([
      supabase.from('tournament_settings').select('*').eq('tournament_id', tournament.id).single(),
      supabase.from('tournament_branding').select('logo_path').eq('tournament_id', tournament.id).maybeSingle(),
      supabase.rpc('get_tournament_phase5a_configuration', { p_tournament_id: tournament.id }),
      isAuctionLeague
        ? supabase
          .from('tournament_auction_categories')
          .select('id,category_code,display_name,base_price,display_order')
          .eq('tournament_id', tournament.id)
          .order('display_order')
        : Promise.resolve({ data: null }),
      // Check whether auction has been prepared (prepared_at is NOT NULL)
      isAuctionLeague
        ? supabase
          .from('auctions')
          .select('id,prepared_at')
          .eq('tournament_id', tournament.id)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  if (!settings || !phase5Configuration) {
    notFound();
  }

  const logoPath = branding?.logo_path ?? null;
  const logoUrl = logoPath ? supabase.storage.from('logos').getPublicUrl(logoPath).data.publicUrl : null;

  // Map DB rows to typed categories
  const rawCategories = (auctionCategoriesResult.data ?? []) as {
    id: string;
    category_code: string;
    display_name: string;
    base_price: number;
    display_order: number;
  }[];

  const categories: AuctionCategory[] = rawCategories.map((r) => ({
    id: r.id,
    code: r.category_code as 'A' | 'B' | 'C',
    display_name: r.display_name,
    base_price: r.base_price,
    display_order: r.display_order,
  }));

  const auctionRecord = auctionStatusResult.data as { id: string; prepared_at: string | null } | null;
  const categoryLocked = auctionRecord?.prepared_at != null;

  return (
    <div className="space-y-8">
      <TournamentDetailsForm tournament={tournament} initialLogoPath={logoPath} initialLogoUrl={logoUrl} />
      <RegistrationLimitsForm tournamentId={tournament.id} />
      <PaymentSettingsForm tournamentId={tournament.id} />
      <SettingsForm tournament={tournament} configuration={phase5Configuration as unknown as Phase5Configuration} />
      {isAuctionLeague && (
        <AuctionPriceCategoriesForm
          tournamentId={tournament.id}
          categories={categories}
          locked={categoryLocked}
        />
      )}
      <RulesAndStages
        tournamentId={tournament.id}
        stages={(phase5Configuration as unknown as Phase5Configuration).stages}
        rules={(phase5Configuration as unknown as Phase5Configuration).rules}
      />
    </div>
  );
}
