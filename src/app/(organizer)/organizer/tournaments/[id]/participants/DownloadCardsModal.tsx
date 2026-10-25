'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Download, Loader2, CheckCircle, Clock, Users } from 'lucide-react';
import { downloadAllPlayerCardsZip, downloadAllPlayerPhotosZip } from '@/lib/generate-player-card';
import { ImageIcon } from 'lucide-react';

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
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'APPROVED' | 'AUCTION' | 'PENDING'>('AUCTION');
  const [downloadMode, setDownloadMode] = useState<'CARDS' | 'PHOTOS'>('CARDS');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvedCount = players.filter(p => p.status === 'APPROVED').length;
  const auctionCount = players.filter(p => p.status === 'APPROVED' && p.auction_price_category_id !== null).length;
  const pendingCount = players.filter(p => p.status === 'PENDING').length;
  const totalCount = players.length;

  // photo counts (only players with an actual photo_path)
  const hasPhoto = (p: any) => !!(p.photo_path || p.player_profiles?.photo_path || p.profile?.photo_path);
  const photoCount = (subset: any[]) => subset.filter(hasPhoto).length;

  const getTargetPlayers = () => {
    if (selectedFilter === 'APPROVED') {
      return players.filter(p => p.status === 'APPROVED');
    }
    if (selectedFilter === 'AUCTION') {
      return players.filter(p => p.status === 'APPROVED' && p.auction_price_category_id !== null);
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
      if (downloadMode === 'PHOTOS') {
        await downloadAllPlayerPhotosZip(
          targetPlayers,
          supabase,
          (current, total) => setProgress({ current, total })
        );
      } else {
        let orderMap: Record<string, number> = {};
        if (targetPlayers.length > 0) {
          const tId = targetPlayers[0].tournament_id;
          const { data: auction } = await supabase.from('auctions').select('id').eq('tournament_id', tId).order('created_at', { ascending: false }).limit(1).single();
          if (auction) {
            const { data: aPlayers } = await supabase.from('auction_players').select('player_id, auction_order').eq('auction_id', auction.id);
            if (aPlayers) {
              aPlayers.forEach((ap: any) => { orderMap[ap.player_id] = ap.auction_order; });
            }
          }
        }
        await downloadAllPlayerCardsZip(
          targetPlayers,
          auctionCategories,
          supabase,
          (current, total) => setProgress({ current, total }),
          orderMap
        );
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to generate ZIP:', err);
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
            className="fixed inset-0 z-40 bg-black/60"
            onClick={isDownloading ? undefined : onClose}
          />
          <motion.div
            key="panel-dl"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl border border-glass-border bg-surface shadow-card sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label="Download Player Cards"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                  downloadMode === 'PHOTOS'
                    ? 'bg-info/15 text-info border-info/30'
                    : 'bg-warning/15 text-warning border-warning/30'
                }`}>
                  {downloadMode === 'PHOTOS' ? <ImageIcon className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-primary">
                    {downloadMode === 'PHOTOS' ? 'Download Player Photos' : 'Download Player Cards'}
                  </h2>
                  <p className="text-xs text-text-secondary">
                    {downloadMode === 'PHOTOS'
                      ? 'Download raw player photos as a ZIP bundle'
                      : 'Select which player cards to include in the ZIP bundle'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isDownloading}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:opacity-30"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-2 px-6 pt-4">
              <button
                type="button"
                id="mode-cards-btn"
                onClick={() => setDownloadMode('CARDS')}
                disabled={isDownloading}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  downloadMode === 'CARDS'
                    ? 'border-warning/30 bg-warning/10 text-warning ring-1 ring-warning/30'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                Auction Cards PNG
              </button>
              <button
                type="button"
                id="mode-photos-btn"
                onClick={() => setDownloadMode('PHOTOS')}
                disabled={isDownloading}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  downloadMode === 'PHOTOS'
                    ? 'border-info/30 bg-info/10 text-info ring-1 ring-info/30'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Raw Photos ZIP
              </button>
            </div>

            {/* Options Body */}
            <div className="space-y-4 px-6 py-5">
              {error && (
                <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {/* Option 0: Auction Players */}
                {(() => {
                  const subset = players.filter(p => p.status === 'APPROVED' && p.auction_price_category_id !== null);
                  const count = downloadMode === 'PHOTOS' ? photoCount(subset) : auctionCount;
                  const unit = downloadMode === 'PHOTOS' ? 'photo' : 'card';
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter('AUCTION')}
                      disabled={isDownloading}
                      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                        selectedFilter === 'AUCTION'
                          ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-text-primary text-sm">Main Auction Players Only</div>
                          <div className="text-xs text-text-secondary">Only players assigned to an auction category</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary border border-primary/30">
                        {count} {count === 1 ? unit : `${unit}s`}
                      </span>
                    </button>
                  );
                })()}

                {/* Option 1: Approved Only */}
                {(() => {
                  const subset = players.filter(p => p.status === 'APPROVED');
                  const count = downloadMode === 'PHOTOS' ? photoCount(subset) : approvedCount;
                  const unit = downloadMode === 'PHOTOS' ? 'photo' : 'card';
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter('APPROVED')}
                      disabled={isDownloading}
                      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                        selectedFilter === 'APPROVED'
                          ? 'border-success/30 bg-success/10 ring-1 ring-success/30'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-text-primary text-sm">Approved Players Only</div>
                          <div className="text-xs text-text-secondary">Ready for auction cards &amp; printing</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-black text-success border border-success/30">
                        {count} {count === 1 ? unit : `${unit}s`}
                      </span>
                    </button>
                  );
                })()}

                {/* Option 2: Pending Only */}
                {(() => {
                  const subset = players.filter(p => p.status === 'PENDING');
                  const count = downloadMode === 'PHOTOS' ? photoCount(subset) : pendingCount;
                  const unit = downloadMode === 'PHOTOS' ? 'photo' : 'card';
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter('PENDING')}
                      disabled={isDownloading}
                      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                        selectedFilter === 'PENDING'
                          ? 'border-warning/30 bg-warning/10 ring-1 ring-warning/30'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-text-primary text-sm">Pending Players Only</div>
                          <div className="text-xs text-text-secondary">Unapproved registrations awaiting review</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-black text-warning border border-warning/30">
                        {count} {count === 1 ? unit : `${unit}s`}
                      </span>
                    </button>
                  );
                })()}

                {/* Option 3: All Players */}
                {(() => {
                  const count = downloadMode === 'PHOTOS' ? photoCount(players) : totalCount;
                  const unit = downloadMode === 'PHOTOS' ? 'photo' : 'card';
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter('ALL')}
                      disabled={isDownloading}
                      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                        selectedFilter === 'ALL'
                          ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-text-primary text-sm">All Registered Players</div>
                          <div className="text-xs text-text-secondary">Bundle all players regardless of status</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary border border-primary/30">
                        {count} {count === 1 ? unit : `${unit}s`}
                      </span>
                    </button>
                  );
                })()}
              </div>

              {/* Download Progress Bar */}
              {isDownloading && progress && (
                <div className={`space-y-2 rounded-2xl border p-4 ${
                  downloadMode === 'PHOTOS'
                    ? 'border-info/30 bg-info/10'
                    : 'border-warning/30 bg-warning/10'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-bold ${
                    downloadMode === 'PHOTOS' ? 'text-info' : 'text-warning'
                  }`}>
                    <span className="flex items-center gap-2">
                      <Loader2 className={`h-4 w-4 animate-spin ${
                        downloadMode === 'PHOTOS' ? 'text-info' : 'text-warning'
                      }`} />
                      {downloadMode === 'PHOTOS' ? 'Fetching Photos…' : 'Generating ZIP Bundle…'}
                    </span>
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full transition-all duration-200 ${
                        downloadMode === 'PHOTOS'
                          ? 'bg-info'
                          : 'bg-warning'
                      }`}
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-xs text-text-muted font-medium">
                {selectedCount} {selectedCount === 1 ? (downloadMode === 'PHOTOS' ? 'player' : 'card') : (downloadMode === 'PHOTOS' ? 'players' : 'cards')} selected
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isDownloading}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="download-zip-btn"
                  onClick={handleDownload}
                  disabled={isDownloading || selectedCount === 0}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-text-primary shadow-card transition-all active:scale-95 disabled:opacity-40 ${
                    downloadMode === 'PHOTOS'
                      ? 'bg-info '
                      : 'bg-warning '
                  }`}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-text-primary" />
                      Downloading…
                    </>
                  ) : downloadMode === 'PHOTOS' ? (
                    <>
                      <ImageIcon className="h-4 w-4" />
                      Download Photos ZIP
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
