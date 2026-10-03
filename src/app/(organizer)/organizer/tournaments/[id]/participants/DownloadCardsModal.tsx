'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Download, Loader2, CheckCircle, Clock, Users } from 'lucide-react';
import { downloadAllPlayerCardsZip } from '@/lib/generate-player-card';

interface DownloadCardsModalProps {
  open: boolean;
  onClose: () => void;
  players: any[];
  auctionCategories: any[];
  supabase: any;
}

export function DownloadCardsModal({
  open,
  onClose,
  players,
  auctionCategories,
  supabase,
}: DownloadCardsModalProps) {
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'APPROVED' | 'PENDING'>('APPROVED');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvedCount = players.filter(p => p.status === 'APPROVED').length;
  const pendingCount = players.filter(p => p.status === 'PENDING').length;
  const totalCount = players.length;

  const getTargetPlayers = () => {
    if (selectedFilter === 'APPROVED') {
      return players.filter(p => p.status === 'APPROVED');
    }
    if (selectedFilter === 'PENDING') {
      return players.filter(p => p.status === 'PENDING');
    }
    return players;
  };

  const targetPlayers = getTargetPlayers();
  const selectedCount = targetPlayers.length;

  const handleDownload = async () => {
    if (selectedCount === 0) return;
    setIsDownloading(true);
    setError(null);
    setProgress({ current: 0, total: selectedCount });

    try {
      await downloadAllPlayerCardsZip(
        targetPlayers,
        auctionCategories,
        supabase,
        (current, total) => {
          setProgress({ current, total });
        }
      );
      onClose();
    } catch (err: any) {
      console.error('Failed to generate cards ZIP:', err);
      setError(err?.message || 'Failed to generate ZIP archive. Please try again.');
    } finally {
      setIsDownloading(false);
      setProgress(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd-dl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={isDownloading ? undefined : onClose}
          />
          <motion.div
            key="panel-dl"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl border border-glass-border bg-[#13111e] shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label="Download Player Cards"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Download className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Download Player Cards</h2>
                  <p className="text-xs text-white/50">Select which player cards to include in the ZIP bundle</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isDownloading}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Options Body */}
            <div className="space-y-4 px-6 py-5">
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {/* Option 1: Approved Only */}
                <button
                  type="button"
                  onClick={() => setSelectedFilter('APPROVED')}
                  disabled={isDownloading}
                  className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                    selectedFilter === 'APPROVED'
                      ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">Approved Players Only</div>
                      <div className="text-xs text-white/50">Ready for auction cards & printing</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-400 border border-emerald-500/30">
                    {approvedCount} {approvedCount === 1 ? 'card' : 'cards'}
                  </span>
                </button>

                {/* Option 2: Pending Only */}
                <button
                  type="button"
                  onClick={() => setSelectedFilter('PENDING')}
                  disabled={isDownloading}
                  className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                    selectedFilter === 'PENDING'
                      ? 'border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/40'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">Pending Players Only</div>
                      <div className="text-xs text-white/50">Unapproved registrations awaiting review</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-400 border border-amber-500/30">
                    {pendingCount} {pendingCount === 1 ? 'card' : 'cards'}
                  </span>
                </button>

                {/* Option 3: All Players */}
                <button
                  type="button"
                  onClick={() => setSelectedFilter('ALL')}
                  disabled={isDownloading}
                  className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                    selectedFilter === 'ALL'
                      ? 'border-purple-500/60 bg-purple-500/10 ring-1 ring-purple-500/40'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">All Registered Players</div>
                      <div className="text-xs text-white/50">Bundle all players regardless of status</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-black text-purple-400 border border-purple-500/30">
                    {totalCount} {totalCount === 1 ? 'card' : 'cards'}
                  </span>
                </button>
              </div>

              {/* Download Progress Bar */}
              {isDownloading && progress && (
                <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      Generating ZIP Bundle…
                    </span>
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-200"
                      style={{
                        width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
              <span className="text-xs text-white/40 font-medium">
                {selectedCount} {selectedCount === 1 ? 'card' : 'cards'} will be downloaded
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isDownloading}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading || selectedCount === 0}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-40"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download Cards ZIP
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
