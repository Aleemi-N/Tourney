'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlayerDetailModal, PlayerDetailData } from '@/components/player/PlayerDetailModal';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';
import { TrashIcon } from '@heroicons/react/24/outline';
import { removePlayerManuallyAction } from '@/app/actions/squad';

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
  tournamentId,
}: {
  squad: OrganizerSquadPlayer[];
  teamName: string;
  tournamentId?: string;
}) {
  const router = useRouter();
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetailData | null>(null);
  const [removingPlayer, setRemovingPlayer] = useState<OrganizerSquadPlayer | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleConfirmRemove = async () => {
    if (!removingPlayer || !tournamentId) return;
    setIsRemoving(true);
    setRemoveError(null);

    const res = await removePlayerManuallyAction(tournamentId, removingPlayer.id);

    setIsRemoving(false);
    if (!res.success) {
      setRemoveError(res.error || 'Failed to remove player');
      return;
    }

    setRemovingPlayer(null);
    router.refresh();
  };

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
          const isManual = p.acquisition_type.toUpperCase().includes('MANUAL');

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
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4 cursor-pointer hover:border-warning/30 hover:bg-surface-raised transition-all group relative"
            >
              <div className="min-w-0 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-text-primary text-sm group-hover:text-warning transition-colors">
                    {displayName}
                  </h3>
                  <p className="truncate text-xs text-text-secondary">
                    {primaryPos}
                    {secondaryPos ? ` · ${secondaryPos}` : ''}
                  </p>
                </div>
                {isManual && tournamentId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemovingPlayer(p);
                      setRemoveError(null);
                    }}
                    className="shrink-0 p-1.5 rounded-lg text-danger hover:bg-danger/10 hover:text-danger transition"
                    title="Remove manually assigned player"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-end justify-between border-t border-border pt-3 mt-auto">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
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

      {removingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative w-full max-w-md rounded-2xl border border-border-strong bg-surface p-6 shadow-card text-text-primary space-y-4">
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <TrashIcon className="w-5 h-5 text-danger" />
              Remove Player from Team
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Are you sure you want to remove <strong className="text-text-primary">{removingPlayer.player?.display_name ?? 'this player'}</strong> from <strong className="text-text-primary">{teamName}</strong>?
            </p>
            {removingPlayer.acquisition_amount && Number(removingPlayer.acquisition_amount) > 0 ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                💰 <strong>Purse Refund:</strong> ₹{Number(removingPlayer.acquisition_amount).toLocaleString('en-IN')} will be refunded back to {teamName}&apos;s purse balance.
              </div>
            ) : (
              <p className="text-xs text-text-secondary">
                This player will be unassigned and returned to the eligible players list.
              </p>
            )}

            {removeError && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                {removeError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRemovingPlayer(null)}
                disabled={isRemoving}
                className="rounded-xl border border-border-strong px-4 py-2 text-xs font-bold text-text-secondary hover:bg-surface-muted hover:text-text-primary transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="rounded-xl bg-danger px-4 py-2 text-xs font-bold text-text-inverse hover:bg-danger transition disabled:opacity-50 flex items-center gap-2"
              >
                {isRemoving ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
