'use client';

import { useState } from 'react';
import { UserIcon, CheckCircleIcon, XCircleIcon, SparklesIcon, TagIcon } from '@heroicons/react/24/solid';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { PlayerDetailModal, PlayerDetailData } from '@/components/player/PlayerDetailModal';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

export interface PlayerPoolItem {
  id: string;
  playerId: string;
  photoUrl: string | null;
  status: string;
  categoryCode: string;
  catName: string;
  catOrder: number;
  basePrice: number;
  soldAmount: number | null;
  soldTeamName: string | null;
  player: {
    id?: string;
    display_name: string;
    photo_path: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    place: string | null;
    height_cm: number | null;
    phone?: string | null;
    date_of_birth?: string | null;
    playing_history?: string | null;
    jersey_name?: string | null;
    jersey_number?: string | null;
    jersey_size?: string | null;
  } | null;
}

export function OwnerPlayerPoolGrid({ players }: { players: PlayerPoolItem[] }) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetailData | null>(null);

  if (players.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/3 p-12 text-center text-sm text-white/55">
        No players found matching the selected filter.
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {players.map((item) => {
          const displayName = item.player?.display_name ?? 'Player';
          const primaryPos = item.player?.primary_position
            ? formatVolleyballPosition(item.player.primary_position)
            : 'Position Pending';
          const secondaryPos = item.player?.secondary_position
            ? formatVolleyballPosition(item.player.secondary_position)
            : null;

          const categoryBadgeStyle =
            item.categoryCode === 'A'
              ? 'border-fuchsia-500/40 bg-fuchsia-500/20 text-fuchsia-200'
              : item.categoryCode === 'B'
              ? 'border-blue-500/40 bg-blue-500/20 text-blue-200'
              : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200';

          const detailData: PlayerDetailData = {
            id: item.playerId,
            display_name: displayName,
            photo_path: item.player?.photo_path,
            primary_position: item.player?.primary_position,
            secondary_position: item.player?.secondary_position,
            place: item.player?.place,
            height_cm: item.player?.height_cm,
            phone: item.player?.phone,
            date_of_birth: item.player?.date_of_birth,
            playing_history: item.player?.playing_history,
            jersey_name: item.player?.jersey_name,
            jersey_number: item.player?.jersey_number,
            jersey_size: item.player?.jersey_size,
            category_code: item.categoryCode,
            base_price: item.basePrice,
            acquisition_amount: item.soldAmount,
            team_name: item.soldTeamName,
          };

          return (
            <article
              key={item.id}
              onClick={() => setSelectedPlayer(detailData)}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#17132a] p-5 shadow-lg transition hover:border-amber-400/50 hover:bg-[#1f1a38] cursor-pointer relative group"
            >
              <div className="flex items-start gap-4">
                {item.photoUrl ? (
                  <img
                    src={item.photoUrl}
                    alt={displayName}
                    className="h-16 w-16 shrink-0 rounded-2xl object-cover object-top border border-white/15 shadow-md group-hover:border-amber-400/50 transition-colors"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/10 text-fuchsia-300 border border-fuchsia-400/20 shadow-inner group-hover:border-amber-400/50 transition-colors">
                    <UserIcon className="h-8 w-8" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                    {displayName}
                  </h3>
                  <p className="mt-0.5 truncate text-xs font-semibold text-fuchsia-300/90">
                    {primaryPos}
                    {secondaryPos ? ` · ${secondaryPos}` : ''}
                  </p>
                  {item.player?.place ? (
                    <p className="mt-1 truncate text-[11px] text-white/40">
                      {item.player.place}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Status and Category Price Footer */}
              <div className="mt-5 flex flex-wrap items-center justify-between border-t border-white/10 pt-4 gap-2">
                {item.categoryCode ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${categoryBadgeStyle}`}>
                    <TagIcon className="h-3 w-3" />
                    Cat {item.categoryCode} · ₹{item.basePrice.toLocaleString('en-IN')}
                  </span>
                ) : <span />}

                {item.status === 'SOLD' ? (
                  <div className="flex flex-col items-end">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-400 shadow-sm">
                      <CheckCircleIcon className="h-3 w-3" />
                      SOLD ₹{Number(item.soldAmount ?? 0).toLocaleString('en-IN')}
                    </span>
                    {item.soldTeamName ? (
                      <span className="mt-1 truncate text-[10px] font-bold text-emerald-300/70 max-w-[140px]">
                        {item.soldTeamName}
                      </span>
                    ) : null}
                  </div>
                ) : item.status === 'UNSOLD' ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-rose-400">
                    <XCircleIcon className="h-3 w-3" />
                    UNSOLD
                  </span>
                ) : item.status === 'OPEN' ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-amber-300 animate-pulse">
                    <SparklesIcon className="h-3 w-3" />
                    LIVE
                  </span>
                ) : (
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase text-white/50">
                    AVAILABLE
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <PlayerDetailModal
        isOpen={Boolean(selectedPlayer)}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
      />
    </>
  );
}
