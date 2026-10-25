'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignPlayerManuallyAction } from '@/app/actions/squad';
import {
    MagnifyingGlassIcon,
    XMarkIcon,
    UserIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ArrowLeftIcon,
} from '@heroicons/react/24/outline';

export type EligiblePlayer = {
    id: string; // player_profiles.id
    registrationId: string;
    displayName: string;
    primaryPosition: string;
    secondaryPosition?: string | null;
    photoPath?: string | null;
    status: string;
};

type AssignPlayerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    tournamentId: string;
    teamId: string;
    teamName: string;
    currentSquadCount: number;
    maxSquadSize: number;
    eligiblePlayers: EligiblePlayer[];
    remainingWalletBalance?: number | null;
};

export function AssignPlayerModal({
    isOpen,
    onClose,
    tournamentId,
    teamId,
    teamName,
    currentSquadCount,
    maxSquadSize,
    eligiblePlayers,
    remainingWalletBalance,
}: AssignPlayerModalProps) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState<EligiblePlayer | null>(null);
    const [step, setStep] = useState<'SELECT' | 'CONFIRM'>('SELECT');
    const [acquisitionAmount, setAcquisitionAmount] = useState<string>('0');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;

    const filteredPlayers = eligiblePlayers.filter((p) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        const nameMatch = p.displayName.toLowerCase().includes(q);
        const posMatch = p.primaryPosition.toLowerCase().includes(q) || (p.secondaryPosition?.toLowerCase().includes(q) ?? false);
        return nameMatch || posMatch;
    });

    const handleSelectPlayer = (player: EligiblePlayer) => {
        setSelectedPlayer(player);
        setStep('CONFIRM');
        setAcquisitionAmount('0');
        setErrorMsg(null);
    };

    const handleConfirmAssignment = async () => {
        if (!selectedPlayer) return;

        const amount = Number(acquisitionAmount || 0);
        if (isNaN(amount) || amount < 0) {
            setErrorMsg('Please enter a valid positive acquisition amount.');
            return;
        }

        if (remainingWalletBalance !== undefined && remainingWalletBalance !== null && amount > remainingWalletBalance) {
            setErrorMsg(`Amount (₹${amount.toLocaleString('en-IN')}) exceeds remaining purse balance (₹${remainingWalletBalance.toLocaleString('en-IN')}).`);
            return;
        }

        setIsSubmitting(true);
        setErrorMsg(null);

        const res = await assignPlayerManuallyAction(tournamentId, teamId, selectedPlayer.id, amount);

        setIsSubmitting(false);

        if (!res.success) {
            setErrorMsg(res.error || 'Failed to complete manual player assignment.');
            return;
        }

        // Reset and close
        setSelectedPlayer(null);
        setStep('SELECT');
        setAcquisitionAmount('0');
        onClose();
        router.refresh();
    };

    const handleClose = () => {
        if (isSubmitting) return;
        setSelectedPlayer(null);
        setStep('SELECT');
        setErrorMsg(null);
        setSearchQuery('');
        setAcquisitionAmount('0');
        onClose();
    };

    const parsedAmount = Number(acquisitionAmount || 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 sm:p-6 overflow-y-auto">
            <div
                className="relative w-full max-w-xl rounded-3xl border border-border-strong bg-surface p-6 shadow-card text-text-primary my-8 max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                        {step === 'CONFIRM' && (
                            <button
                                onClick={() => setStep('SELECT')}
                                disabled={isSubmitting}
                                className="rounded-xl p-1.5 text-text-secondary hover:bg-surface-muted hover:text-text-primary transition"
                                title="Back to player search"
                            >
                                <ArrowLeftIcon className="w-5 h-5" />
                            </button>
                        )}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                                Organizer Action
                            </p>
                            <h2 className="text-xl font-black tracking-tight text-text-primary">
                                {step === 'SELECT' ? `Assign Player to ${teamName}` : 'Confirm Manual Assignment'}
                            </h2>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="rounded-xl p-2 text-text-secondary hover:bg-surface-muted hover:text-text-primary transition"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {errorMsg && (
                    <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-start gap-3">
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-danger mt-0.5" />
                        <div>{errorMsg}</div>
                    </div>
                )}

                {/* STEP 1: Search and Select Player */}
                {step === 'SELECT' && (
                    <div className="mt-4 flex-1 flex flex-col min-h-0">
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-4 top-3.5 h-5 w-5 text-text-muted" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search player by name or position..."
                                className="w-full rounded-2xl border border-border-strong bg-surface py-3 pl-11 pr-4 text-sm font-medium text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1 max-h-[350px]">
                            {filteredPlayers.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
                                    {searchQuery ? 'No matching eligible players found.' : 'No eligible unassigned players available.'}
                                </div>
                            ) : (
                                filteredPlayers.map((player) => (
                                    <button
                                        key={player.id}
                                        onClick={() => handleSelectPlayer(player)}
                                        className="w-full flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-3.5 text-left transition hover:border-primary/30 hover:bg-primary/10 group"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            {player.photoPath ? (
                                                <img
                                                    src={player.photoPath}
                                                    alt={player.displayName}
                                                    className="h-11 w-11 shrink-0 rounded-xl object-cover border border-border"
                                                />
                                            ) : (
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/30">
                                                    <UserIcon className="h-6 w-6" />
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate font-bold text-text-primary text-sm group-hover:text-primary">
                                                    {player.displayName}
                                                </p>
                                                <p className="truncate text-xs text-text-secondary">
                                                    {player.primaryPosition.replaceAll('_', ' ')}
                                                    {player.secondaryPosition ? ` · ${player.secondaryPosition.replaceAll('_', ' ')}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition">
                                            Select
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 2: Review and Confirm */}
                {step === 'CONFIRM' && selectedPlayer && (
                    <div className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
                        <div className="rounded-2xl border border-border bg-surface-muted p-5 space-y-4">
                            <div className="flex items-center gap-4">
                                {selectedPlayer.photoPath ? (
                                    <img
                                        src={selectedPlayer.photoPath}
                                        alt={selectedPlayer.displayName}
                                        className="h-14 w-14 shrink-0 rounded-2xl object-cover border border-border"
                                    />
                                ) : (
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/30">
                                        <UserIcon className="h-8 w-8" />
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-lg font-bold text-text-primary">{selectedPlayer.displayName}</h3>
                                    <p className="text-xs text-primary font-semibold">
                                        {selectedPlayer.primaryPosition.replaceAll('_', ' ')}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-border">
                                <div>
                                    <p className="text-text-muted uppercase font-bold tracking-wider text-xs">Target Team</p>
                                    <p className="mt-1 font-bold text-text-primary text-sm">{teamName}</p>
                                </div>
                                <div>
                                    <p className="text-text-muted uppercase font-bold tracking-wider text-xs">Assignment Type</p>
                                    <p className="mt-1 font-bold text-success text-sm">Manual Assignment</p>
                                </div>
                                <div>
                                    <p className="text-text-muted uppercase font-bold tracking-wider text-xs">Cost / Purse Impact</p>
                                    <p className="mt-1 font-bold text-warning text-sm">
                                        {parsedAmount > 0 ? `₹${parsedAmount.toLocaleString('en-IN')}` : '₹0 (Free)'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-text-muted uppercase font-bold tracking-wider text-xs">Squad Expansion</p>
                                    <p className="mt-1 font-bold text-text-primary text-sm">
                                        {currentSquadCount} / {maxSquadSize} → <span className="text-primary">{currentSquadCount + 1} / {maxSquadSize}</span>
                                    </p>
                                </div>
                            </div>

                            {/* Acquisition Amount Field */}
                            <div className="space-y-2 pt-3 border-t border-border">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                                        Acquisition Price / Amount (₹)
                                    </label>
                                    {remainingWalletBalance !== undefined && remainingWalletBalance !== null && (
                                        <span className="text-xs text-primary font-bold">
                                            Purse: ₹{remainingWalletBalance.toLocaleString('en-IN')}
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    step="500"
                                    value={acquisitionAmount}
                                    onChange={(e) => setAcquisitionAmount(e.target.value)}
                                    placeholder="Enter amount (0 for free)"
                                    className="w-full rounded-2xl border border-border-strong bg-surface px-4 py-2.5 text-sm font-bold text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                                />
                                <p className="text-xs text-text-secondary">
                                    {parsedAmount > 0
                                        ? `₹${parsedAmount.toLocaleString('en-IN')} will be deducted from ${teamName}'s purse.`
                                        : 'Leave 0 for a free manual assignment (no purse deduction).'
                                    }
                                </p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-xs text-success flex items-start gap-3">
                            <CheckCircleIcon className="w-5 h-5 shrink-0 text-success mt-0.5" />
                            <p className="leading-relaxed">
                                {parsedAmount > 0
                                    ? `This assignment will deduct ₹${parsedAmount.toLocaleString('en-IN')} from ${teamName}'s auction purse.`
                                    : `This player will be placed directly into ${teamName}'s squad under Manual Assignment with no purse deduction.`
                                }
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setStep('SELECT')}
                                disabled={isSubmitting}
                                className="rounded-2xl border border-border-strong px-5 py-3 text-sm font-bold text-text-secondary hover:bg-surface-muted hover:text-text-primary transition"
                            >
                                Change Player
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAssignment}
                                disabled={isSubmitting}
                                className="rounded-2xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground hover:bg-primary-hover transition disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
                                        Assigning...
                                    </>
                                ) : (
                                    'Confirm Assignment'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
