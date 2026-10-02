'use client';

import { useState } from 'react';
import { PlayerDetailModal, PlayerDetailData } from '@/components/player/PlayerDetailModal';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

export interface OrganizerSquadPlayer {
  id: string;
  player_id: string;
  acquisition_type: string;
  acquisition_amount: number | null;
  player: {
    id?: string;
    display_name: string;
    photo_path: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    place?: string | null;
    height_cm?: number | null;
    phone?: string | null;
    date_of_birth?: string | null;
    playing_history?: string | null;
    jersey_name?: string | null;
    jersey_number?: string | null;
    jersey_size?: string | null;
  } | null;
}

export function OrganizerTeamsSquadRoster({
  squad,
  teamName,
}: {
  squad: OrganizerSquadPlayer[];
  teamName: string;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetailData | null>(null);

  if (squad.length === 0) {
    return (
      <div className="py-8 text-center border border-dashed border-border rounded-xl">
        <p className="text-sm text-text-muted">No players assigned yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {squad.map((p) => {
          const displayName = p.player?.display_name ?? 'Player';
          const primaryPos = p.player?.primary_position
            ? formatVolleyballPosition(p.player.primary_position)
            : 'Position pending';
          const secondaryPos = p.player?.secondary_position
            ? formatVolleyballPosition(p.player.secondary_position)
            : null;

          const detailData: PlayerDetailData = {
            id: p.player_id,
            display_name: displayName,
            photo_path: p.player?.photo_path,
            primary_position: p.player?.primary_position,
            secondary_position: p.player?.secondary_position,
            place: p.player?.place,
            height_cm: p.player?.height_cm,
            phone: p.player?.phone,
            date_of_birth: p.player?.date_of_birth,
            playing_history: p.player?.playing_history,
            jersey_name: p.player?.jersey_name,
            jersey_number: p.player?.jersey_number,
            jersey_size: p.player?.jersey_size,
            acquisition_type: p.acquisition_type,
            acquisition_amount: p.acquisition_amount,
            team_name: teamName,
          };

          return (
            <article
              key={p.id}
              onClick={() => setSelectedPlayer(detailData)}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4 cursor-pointer hover:border-amber-400/50 hover:bg-surface-raised transition-all group"
            >
              <div className="min-w-0">
                <h3 className="truncate font-bold text-text-primary text-sm group-hover:text-amber-300 transition-colors">
                  {displayName}
                </h3>
                <p className="truncate text-xs text-text-secondary">
                  {primaryPos}
                  {secondaryPos ? ` · ${secondaryPos}` : ''}
                </p>
              </div>
              <div className="flex items-end justify-between border-t border-border pt-3 mt-auto">
                <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400/80">
                  {p.acquisition_type.replaceAll('_', ' ')}
                </p>
                <p className="font-mono text-xs font-bold text-text-primary">
                  {p.acquisition_amount !== null
                    ? `₹${Number(p.acquisition_amount).toLocaleString('en-IN')}`
                    : '—'}
                </p>
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
