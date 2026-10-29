'use client';

import { useState } from 'react';
import { UserIcon } from '@heroicons/react/24/solid';
import { createClient } from '@/lib/api/client';
import { resolvePublicStorageUrl } from '@/lib/api/storage-url';
import { PlayerDetailModal, PlayerDetailData } from '@/components/player/PlayerDetailModal';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

export interface SquadRosterItem {
  id: string;
  playerId: string;
  sourceLabel: string;
  badgeColor: string;
  price: number | null;
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

export function OwnerSquadRoster({ squad, teamName }: { squad: SquadRosterItem[]; teamName: string }) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetailData | null>(null);
  const api = createClient();

  if (squad.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-border-strong bg-surface p-12 text-center text-sm text-text-secondary">
        No players are assigned to this squad yet.
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {squad.map((item) => {
          const displayName = item.player?.display_name ?? 'Player';
          const primaryPos = item.player?.primary_position
            ? formatVolleyballPosition(item.player.primary_position)
            : 'Position Pending';
          const secondaryPos = item.player?.secondary_position
            ? formatVolleyballPosition(item.player.secondary_position)
            : null;
          const photoUrl = resolvePublicStorageUrl(api, 'avatars', item.player?.photo_path);

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
            acquisition_type: item.sourceLabel,
            acquisition_amount: item.price,
            team_name: teamName,
          };

          return (
            <article
              key={item.id}
              onClick={() => setSelectedPlayer(detailData)}
              className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:border-warning/30 hover:bg-surface-muted cursor-pointer group"
            >
              <div className="flex items-start gap-4">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    className="h-14 w-14 shrink-0 rounded-2xl object-cover object-top border border-border group-hover:border-warning/30 transition-colors"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/30 group-hover:border-warning/30 transition-colors">
                    <UserIcon className="h-7 w-7" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-text-primary group-hover:text-warning transition-colors">
                    {displayName}
                  </h3>
                  <p className="mt-0.5 truncate text-xs font-semibold text-primary">
                    {primaryPos}
                    {secondaryPos ? ` · ${secondaryPos}` : ''}
                  </p>
                  {item.player?.place ? (
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {item.player.place}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${item.badgeColor}`}>
                  {item.sourceLabel}
                </span>
                <span className="font-mono text-xs font-bold text-text-primary">
                  {item.price !== null && item.price !== undefined
                    ? `₹${Number(item.price).toLocaleString('en-IN')}`
                    : '—'}
                </span>
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
