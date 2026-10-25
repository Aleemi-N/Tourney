'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  SparklesIcon,
  TagIcon,
  AcademicCapIcon,
  InformationCircleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { createClient } from '@/lib/supabase/client';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';
import { downloadSinglePlayerCardPNG } from '@/lib/generate-player-card';

export interface PlayerDetailData {
  id?: string;
  display_name: string;
  photo_path?: string | null;
  primary_position?: string | null;
  secondary_position?: string | null;
  place?: string | null;
  height_cm?: number | null;
  phone?: string | null;
  date_of_birth?: string | null;
  playing_history?: string | null;
  jersey_name?: string | null;
  jersey_number?: string | null;
  jersey_size?: string | null;
  // Optional acquisition/auction metrics
  category_code?: string | null;
  base_price?: number | null;
  acquisition_type?: string | null;
  acquisition_amount?: number | null;
  joined_at?: string | null;
  team_name?: string | null;
}

export interface PlayerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerDetailData | null;
}

export function PlayerDetailModal({ isOpen, onClose, player }: PlayerDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !player) return null;

  const supabase = createClient();
  const photoUrl = resolvePublicStorageUrl(supabase, 'avatars', player.photo_path);
  const initial = player.display_name.trim().charAt(0).toUpperCase();

  async function downloadCardPNG() {
    if (!player) return;
    await downloadSinglePlayerCardPNG(player, supabase);
  }

  async function downloadPhoto() {
    if (!photoUrl) return;
    try {
      const res = await fetch(photoUrl);
      if (!res.ok) throw new Error('Failed to fetch photo');
      const blob = await res.blob();
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const safeName = player?.display_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() ?? 'player';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_photo.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* silently ignore — photo may be cross-origin restricted */
    }
  }

  const primaryPosFormatted = player.primary_position
    ? formatVolleyballPosition(player.primary_position)
    : 'Position Pending';

  const secondaryPosFormatted = player.secondary_position
    ? formatVolleyballPosition(player.secondary_position)
    : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 transition-opacity"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-warning/30 bg-surface shadow-card text-text-primary font-sans my-auto max-h-[90vh] flex flex-col"
        >
          {/* Header Bar */}
          <div className="relative flex items-center justify-between border-b border-border px-6 py-4 bg-surface">
            <div className="flex items-center gap-2.5">
              <SparklesIcon className="h-5 w-5 text-warning" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-warning">
                Player Profile Card
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors focus:outline-none"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
            {/* Upper Profile Hero Section */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Photo Frame */}
              <div className="relative h-32 w-32 sm:h-36 sm:w-36 shrink-0 overflow-hidden rounded-3xl border-2 border-warning bg-surface shadow-card flex items-center justify-center">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt={player.display_name}
                    fill
                    unoptimized
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="text-5xl font-black text-warning">
                    {initial}
                  </span>
                )}
              </div>

              {/* Player Title & Positions */}
              <div className="flex-1 text-center sm:text-left space-y-2">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-text-primary">
                    {player.display_name}
                  </h2>
                  {player.id && (
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-warning">
                      ID: VCA-{player.id.substring(0, 6).toUpperCase()}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-warning">
                    {primaryPosFormatted}
                  </span>
                  {secondaryPosFormatted && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-muted px-3 py-1 text-xs font-bold uppercase tracking-wider text-text-secondary">
                      {secondaryPosFormatted}
                    </span>
                  )}
                  {player.category_code && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
                      Category {player.category_code}
                    </span>
                  )}
                </div>

                {player.team_name && (
                  <p className="text-xs font-semibold text-success pt-1">
                    Squad: <span className="text-text-primary font-bold">{player.team_name}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Jersey Details Banner (If present) */}
            {(player.jersey_name || player.jersey_number || player.jersey_size) && (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/20 text-warning border border-warning/40 font-black text-lg">
                    #{player.jersey_number || '—'}
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase tracking-wider text-text-secondary">
                      JERSEY NAME & NUMBER
                    </span>
                    <span className="block text-base font-black uppercase text-text-primary tracking-wide">
                      {player.jersey_name || player.display_name}
                    </span>
                  </div>
                </div>
                {player.jersey_size && (
                  <div className="text-right">
                    <span className="block text-xs font-black uppercase tracking-wider text-text-secondary">
                      JERSEY SIZE
                    </span>
                    <span className="inline-block mt-0.5 rounded-lg border border-warning/30 bg-warning/15 px-2.5 py-0.5 text-xs font-black text-warning">
                      {player.jersey_size}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Information Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Phone Number */}
              <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info border border-info/30">
                  <PhoneIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                    Phone Number
                  </span>
                  <span className="block text-sm font-bold text-text-primary truncate">
                    {player.phone ? (
                      <a href={`tel:${player.phone}`} className="hover:underline text-info">
                        {player.phone}
                      </a>
                    ) : (
                      'Not specified'
                    )}
                  </span>
                </div>
              </div>

              {/* Location / Place */}
              <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success border border-success/30">
                  <MapPinIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                    Place / Hometown
                  </span>
                  <span className="block text-sm font-bold text-text-primary truncate">
                    {player.place || 'Not specified'}
                  </span>
                </div>
              </div>

              {/* Height */}
              <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/30">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                    Height
                  </span>
                  <span className="block text-sm font-bold text-text-primary">
                    {player.height_cm ? `${player.height_cm} cm` : 'Not specified'}
                  </span>
                </div>
              </div>

              {/* Acquisition / Price */}
              {(player.acquisition_type || player.acquisition_amount != null || player.base_price != null) && (
                <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning border border-warning/30">
                    <TagIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                      {player.acquisition_type ? 'Acquisition & Price' : 'Base Price'}
                    </span>
                    <span className="block text-sm font-bold text-warning truncate">
                      {player.acquisition_amount != null
                        ? `₹${Number(player.acquisition_amount).toLocaleString('en-IN')}`
                        : player.base_price != null
                        ? `Base: ₹${Number(player.base_price).toLocaleString('en-IN')}`
                        : '—'}
                      {player.acquisition_type ? ` (${player.acquisition_type.replaceAll('_', ' ')})` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Playing History & Bio Section */}
            {player.playing_history && (
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
                <div className="flex items-center gap-2 text-text-secondary">
                  <AcademicCapIcon className="h-4 w-4 text-warning" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Playing History & Experience
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                  {player.playing_history}
                </p>
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="border-t border-border p-4 bg-surface flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadCardPNG()}
                className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-warning hover:bg-warning/15 transition-all flex items-center gap-1.5"
              >
                📥 Download Auction Card PNG
              </button>
              {photoUrl && (
                <button
                  type="button"
                  id="download-player-photo-btn"
                  onClick={() => void downloadPhoto()}
                  className="rounded-xl border border-info/30 bg-info/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-info hover:bg-info/15 transition-all flex items-center gap-1.5"
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                  Download Photo
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-strong bg-surface-muted px-5 py-2 text-xs font-bold uppercase tracking-wider text-text-primary hover:bg-surface-muted transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
