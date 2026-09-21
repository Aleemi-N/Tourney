'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { CurrencyRupeeIcon } from '@heroicons/react/24/outline';

interface SettingsFormProps {
  tournament: Record<string, unknown>;
  initialSettings: Record<string, unknown>;
}

export function SettingsForm({ tournament, initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [playerRegEnabled, setPlayerRegEnabled] = useState(initialSettings.player_registration_enabled as boolean);
  const [teamRegEnabled, setTeamRegEnabled] = useState(initialSettings.team_registration_enabled as boolean);
  const [maxTeams, setMaxTeams] = useState<string>((initialSettings.max_teams as number)?.toString() || '');
  const [maxSquadSize, setMaxSquadSize] = useState<string>((initialSettings.max_squad_size as number)?.toString() || '');
  
  const [auctionPurse, setAuctionPurse] = useState<string>((initialSettings.auction_starting_purse as number)?.toString() || '');
  const [auctionBasePrice, setAuctionBasePrice] = useState<string>((initialSettings.auction_base_price as number)?.toString() || '');
  const [auctionBidInc, setAuctionBidInc] = useState<string>((initialSettings.auction_bid_increment as number)?.toString() || '');

  const isAuction = tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const payload = {
        p_tournament_id: tournament.id as string,
        p_player_registration_enabled: playerRegEnabled,
        p_team_registration_enabled: teamRegEnabled,
        p_max_teams: maxTeams ? parseInt(maxTeams, 10) : undefined,
        p_max_squad_size: maxSquadSize ? parseInt(maxSquadSize, 10) : undefined,
        p_auction_starting_purse: auctionPurse ? parseFloat(auctionPurse) : undefined,
        p_auction_base_price: auctionBasePrice ? parseFloat(auctionBasePrice) : undefined,
        p_auction_bid_increment: auctionBidInc ? parseFloat(auctionBidInc) : undefined,
      };

      const { error: rpcError } = await supabase.rpc('update_tournament_settings', payload);

      if (rpcError) {
        const safeMessage = rpcError.message.includes('below current approved team count')
          ? 'Maximum teams cannot be lower than the number of approved teams.'
          : rpcError.message.includes('below largest current team size')
            ? 'Maximum squad size cannot be lower than an existing team size.'
            : rpcError.message.includes('Unauthorized')
              ? 'You do not have permission to update this tournament.'
              : 'Unable to update settings right now.';
        throw new Error(safeMessage);
      }

      setSuccess(true);
      router.refresh();
      
      // hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const e = err as Error;
      setError(e.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 p-4 rounded-lg text-sm font-medium">
          Settings updated successfully.
        </div>
      )}

      {/* Registration Settings */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Registration Settings</h2>
          <p className="text-sm text-text-secondary mt-1">Control who can register and team capacity.</p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-text-primary">Player Registration</label>
              <p className="text-xs text-text-secondary mt-1">Allow players to submit their profiles for this tournament.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={playerRegEnabled}
                onChange={(e) => setPlayerRegEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary dark:bg-slate-700 dark:border-slate-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-text-primary">Team Owner Registration</label>
              <p className="text-xs text-text-secondary mt-1">Allow users to apply to own a team.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={teamRegEnabled}
                onChange={(e) => setTeamRegEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary dark:bg-slate-700 dark:border-slate-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Maximum Teams
              </label>
              <input
                type="number"
                min="2"
                value={maxTeams}
                onChange={(e) => setMaxTeams(e.target.value)}
                placeholder="e.g. 8"
                className="w-full px-4 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              />
              <p className="text-xs text-text-secondary mt-1">Leave blank for unlimited.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Maximum Squad Size
              </label>
              <input
                type="number"
                min="1"
                value={maxSquadSize}
                onChange={(e) => setMaxSquadSize(e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-4 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Auction Settings (Conditional) */}
      {isAuction && (
        <section className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Auction Settings</h2>
            <p className="text-sm text-text-secondary mt-1">Financial rules for the live auction.</p>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Team Purse
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CurrencyRupeeIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={auctionPurse}
                    onChange={(e) => setAuctionPurse(e.target.value)}
                    placeholder="50000"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                  />
                </div>
                <p className="text-xs text-text-secondary mt-1">Starting wallet balance per team.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Default Base Price
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CurrencyRupeeIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={auctionBasePrice}
                    onChange={(e) => setAuctionBasePrice(e.target.value)}
                    placeholder="1000"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                  />
                </div>
                <p className="text-xs text-text-secondary mt-1">Initial opening bid for players.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Min. Bid Increment
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CurrencyRupeeIcon className="h-5 w-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={auctionBidInc}
                    onChange={(e) => setAuctionBidInc(e.target.value)}
                    placeholder="500"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                  />
                </div>
                <p className="text-xs text-text-secondary mt-1">Minimum amount each bid must raise.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}
