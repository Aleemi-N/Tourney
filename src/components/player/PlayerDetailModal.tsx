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
          className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#141726] via-[#0f111c] to-[#0a0b12] shadow-[0_0_80px_rgba(229,169,60,0.25)] text-white font-sans my-auto max-h-[90vh] flex flex-col"
        >
          {/* Header Bar */}
          <div className="relative flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <SparklesIcon className="h-5 w-5 text-[#e5a93c]" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-[#e5a93c]">
                Player Profile Card
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white transition-colors focus:outline-none"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
            {/* Upper Profile Hero Section */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Photo Frame */}
              <div className="relative h-32 w-32 sm:h-36 sm:w-36 shrink-0 overflow-hidden rounded-3xl border-2 border-[#e5a93c] bg-gradient-to-tr from-[#1a1409] to-[#0c0d14] shadow-[0_0_30px_rgba(229,169,60,0.3)] flex items-center justify-center">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt={player.display_name}
                    fill
                    unoptimized
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="text-5xl font-black text-[#e5a93c]">
                    {initial}
                  </span>
                )}
              </div>

              {/* Player Title & Positions */}
              <div className="flex-1 text-center sm:text-left space-y-2">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white drop-shadow-md">
                    {player.display_name}
                  </h2>
                  {player.id && (
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#e5a93c]">
                      ID: VCA-{player.id.substring(0, 6).toUpperCase()}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-300">
                    {primaryPosFormatted}
                  </span>
                  {secondaryPosFormatted && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/80">
                      {secondaryPosFormatted}
                    </span>
                  )}
                  {player.category_code && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-fuchsia-200">
                      Category {player.category_code}
                    </span>
                  )}
                </div>

                {player.team_name && (
                  <p className="text-xs font-semibold text-emerald-400/90 pt-1">
                    Squad: <span className="text-white font-bold">{player.team_name}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Jersey Details Banner (If present) */}
            {(player.jersey_name || player.jersey_number || player.jersey_size) && (
              <div className="rounded-2xl border border-[#e5a93c]/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5a93c]/20 text-[#e5a93c] border border-[#e5a93c]/40 font-black text-lg">
                    #{player.jersey_number || '—'}
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wider text-white/50">
                      JERSEY NAME & NUMBER
                    </span>
                    <span className="block text-base font-black uppercase text-white tracking-wide">
                      {player.jersey_name || player.display_name}
                    </span>
                  </div>
                </div>
                {player.jersey_size && (
                  <div className="text-right">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-white/50">
                      JERSEY SIZE
                    </span>
                    <span className="inline-block mt-0.5 rounded-lg border border-amber-400/40 bg-amber-400/20 px-2.5 py-0.5 text-xs font-black text-amber-300">
                      {player.jersey_size}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Information Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Phone Number */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  <PhoneIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Phone Number
                  </span>
                  <span className="block text-sm font-bold text-white truncate">
                    {player.phone ? (
                      <a href={`tel:${player.phone}`} className="hover:underline text-blue-300">
                        {player.phone}
                      </a>
                    ) : (
                      'Not specified'
                    )}
                  </span>
                </div>
              </div>

              {/* Location / Place */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <MapPinIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Place / Hometown
                  </span>
                  <span className="block text-sm font-bold text-white truncate">
                    {player.place || 'Not specified'}
                  </span>
                </div>
              </div>

              {/* Height */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Height
                  </span>
                  <span className="block text-sm font-bold text-white">
                    {player.height_cm ? `${player.height_cm} cm` : 'Not specified'}
                  </span>
                </div>
              </div>

              {/* Acquisition / Price */}
              {(player.acquisition_type || player.acquisition_amount != null || player.base_price != null) && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <TagIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-white/40">
                      {player.acquisition_type ? 'Acquisition & Price' : 'Base Price'}
                    </span>
                    <span className="block text-sm font-bold text-amber-300 truncate">
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
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                <div className="flex items-center gap-2 text-white/60">
                  <AcademicCapIcon className="h-4 w-4 text-[#e5a93c]" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Playing History & Experience
                  </span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed whitespace-pre-line">
                  {player.playing_history}
                </p>
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="border-t border-white/10 p-4 bg-white/[0.02] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void downloadCardPNG()}
              className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-500/30 transition-all flex items-center gap-1.5"
            >
              📥 Download Auction Card PNG
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 bg-white/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
