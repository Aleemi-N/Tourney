'use client';

import { useState } from 'react';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { AssignPlayerModal, type EligiblePlayer } from './AssignPlayerModal';

type AssignPlayerButtonProps = {
    tournamentId: string;
    teamId: string;
    teamName: string;
    currentSquadCount: number;
    maxSquadSize: number;
    eligiblePlayers: EligiblePlayer[];
    remainingWalletBalance?: number | null;
};

export function AssignPlayerButton({
    tournamentId,
    teamId,
    teamName,
    currentSquadCount,
    maxSquadSize,
    eligiblePlayers,
    remainingWalletBalance,
}: AssignPlayerButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const isFull = currentSquadCount >= maxSquadSize;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                disabled={isFull}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${
                    isFull
                        ? 'cursor-not-allowed border border-border bg-surface text-text-muted'
                        : 'border border-primary/30 bg-primary text-primary hover:bg-primary hover:text-primary-foreground'
                }`}
                title={isFull ? 'Squad full (Maximum squad limit reached)' : 'Manually assign an eligible player'}
            >
                <UserPlusIcon className="w-4 h-4" />
                {isFull ? 'Squad Full' : '+ Assign Player'}
            </button>

            <AssignPlayerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                tournamentId={tournamentId}
                teamId={teamId}
                teamName={teamName}
                currentSquadCount={currentSquadCount}
                maxSquadSize={maxSquadSize}
                eligiblePlayers={eligiblePlayers}
                remainingWalletBalance={remainingWalletBalance}
            />
        </>
    );
}
