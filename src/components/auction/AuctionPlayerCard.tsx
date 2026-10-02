'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { User, Hand, Award, Phone, Gavel, Shield } from 'lucide-react';
import Image from 'next/image';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';
import { PlayerDetailModal, PlayerDetailData } from '@/components/player/PlayerDetailModal';

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `₹${Math.max(0, amount).toLocaleString('en-IN')}`;
}

export interface AuctionPlayerCardProps {
  player: {
    auction_player_id?: string;
    base_price: number;
    category_code?: string | null;
    attempt_number?: number;
    player: {
      id?: string;
      display_name: string;
      photo_path: string | null;
      primary_position: string | null;
      secondary_position: string | null;
      phone?: string | null;
      place?: string | null;
      height_cm?: number | null;
      date_of_birth?: string | null;
      playing_history?: string | null;
      jersey_name?: string | null;
      jersey_number?: string | null;
      jersey_size?: string | null;
    };
  };
  highestBid?: {
    amount: number;
    team: {
      name: string;
      short_name?: string | null;
    };
  } | null;
  recentBidsCount?: number;
  supabase: any;
  isFullscreen?: boolean;
  tournamentName?: string;
  tournamentLogoUrl?: string | null;
  currentlyBiddingTeamName?: string | null;
}

export function AuctionPlayerCard({
  player,
  highestBid,
  recentBidsCount,
  supabase,
  isFullscreen,
  tournamentName,
  tournamentLogoUrl,
  currentlyBiddingTeamName,
}: AuctionPlayerCardProps) {
  const reduceMotion = useReducedMotion();
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<PlayerDetailData | null>(null);

  const photoUrl = resolvePublicStorageUrl(supabase, 'avatars', player.player.photo_path);
  const initial = player.player.display_name.trim().charAt(0).toUpperCase();

  async function downloadPlayerCardPoster() {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background Gradient (Dark Gold Sheen)
    const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, '#1c150a');
    bg.addColorStop(0.5, '#0d0e17');
    bg.addColorStop(1, '#05060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1350);

    // Glowing Outer Frame
    ctx.strokeStyle = '#e5a93c';
    ctx.lineWidth = 12;
    ctx.strokeRect(30, 30, 1020, 1290);

    ctx.strokeStyle = 'rgba(229, 169, 60, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 45, 990, 1260);

    // Header Text
    ctx.fillStyle = '#e5a93c';
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LIVE PLAYER AUCTION', 540, 110);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px sans-serif';
    ctx.fillText((tournamentName || 'OFFICIAL TOURNAMENT').toUpperCase(), 540, 160);

    // Player Photo Frame
    const photoRadius = 180;
    const photoCenterX = 540;
    const photoCenterY = 410;

    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#1c150a';
    ctx.fillRect(photoCenterX - photoRadius, photoCenterY - photoRadius, photoRadius * 2, photoRadius * 2);

    if (photoUrl) {
      try {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.src = photoUrl;
        await img.decode();
        ctx.drawImage(img, photoCenterX - photoRadius, photoCenterY - photoRadius, photoRadius * 2, photoRadius * 2);
      } catch {
        ctx.fillStyle = '#e5a93c';
        ctx.font = '900 120px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(initial, photoCenterX, photoCenterY + 40);
      }
    } else {
      ctx.fillStyle = '#e5a93c';
      ctx.font = '900 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(initial, photoCenterX, photoCenterY + 40);
    }
    ctx.restore();

    // Circle Frame Border
    ctx.strokeStyle = '#e5a93c';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(photoCenterX, photoCenterY, photoRadius + 5, 0, Math.PI * 2);
    ctx.stroke();

    // Player Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.player.display_name.toUpperCase(), 540, 670);

    // Position & Category Box
    ctx.fillStyle = 'rgba(229, 169, 60, 0.15)';
    ctx.strokeStyle = 'rgba(229, 169, 60, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(140, 720, 800, 110, 16);
    ctx.fill();
    ctx.stroke();

    const posStr = player.player.primary_position
      ? formatVolleyballPosition(player.player.primary_position)
      : 'SPIKER';

    ctx.fillStyle = '#e5a93c';
    ctx.font = '800 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRIMARY POSITION', 340, 755);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px sans-serif';
    ctx.fillText(posStr, 340, 795);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(540, 740);
    ctx.lineTo(540, 810);
    ctx.stroke();

    ctx.fillStyle = '#e5a93c';
    ctx.font = '800 18px sans-serif';
    ctx.fillText('CATEGORY', 740, 755);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px sans-serif';
    ctx.fillText(player.category_code || 'A', 740, 795);

    // Price Card Box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(140, 860, 800, 180, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '800 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BASE PRICE', 340, 905);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px sans-serif';
    ctx.fillText(formatMoney(player.base_price), 340, 960);

    // Current Bid Pill
    ctx.fillStyle = '#e5a93c';
    ctx.beginPath();
    ctx.roundRect(570, 890, 330, 90, 12);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = '900 16px sans-serif';
    ctx.fillText('HIGHEST / CURRENT BID', 735, 920);
    ctx.font = '900 38px sans-serif';
    ctx.fillText(highestBid ? formatMoney(highestBid.amount) : 'NO BIDS', 735, 965);

    if (highestBid?.team?.name) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 20px sans-serif';
      ctx.fillText(`CURRENT WINNER: ${highestBid.team.name.toUpperCase()}`, 540, 1010);
    }

    // Additional Stats
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 20px sans-serif';
    ctx.textAlign = 'center';
    const extraDetails = [
      player.player.place ? `📍 ${player.player.place}` : null,
      player.player.jersey_number ? `👕 #${player.player.jersey_number}` : null,
      player.player.height_cm ? `📏 ${player.player.height_cm} cm` : null
    ].filter(Boolean).join('   ·   ');

    if (extraDetails) {
      ctx.fillText(extraDetails, 540, 1100);
    }

    // Footer Watermark
    ctx.fillStyle = '#e5a93c';
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VOLLEYBALL TOURNAMENT PLATFORM', 70, 1280);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('POWERED BY TOURNY', 1010, 1280);

    const link = document.createElement('a');
    link.download = `${player.player.display_name.toLowerCase().replace(/\s+/g, '-')}-auction-card.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const handleOpenModal = async () => {
    const baseDetail: PlayerDetailData = {
      id: player.player.id || player.auction_player_id,
      display_name: player.player.display_name,
      photo_path: player.player.photo_path,
      primary_position: player.player.primary_position,
      secondary_position: player.player.secondary_position,
      phone: player.player.phone,
      place: player.player.place,
      height_cm: player.player.height_cm,
      date_of_birth: player.player.date_of_birth,
      playing_history: player.player.playing_history,
      jersey_name: player.player.jersey_name,
      jersey_number: player.player.jersey_number,
      jersey_size: player.player.jersey_size,
      category_code: player.category_code,
      base_price: player.base_price,
    };

    setModalData(baseDetail);
    setShowModal(true);

    // If extra fields missing, fetch on demand
    const targetId = player.player.id;
    if (targetId && supabase) {
      try {
        const { data } = await supabase
          .from('player_profiles')
          .select('place, height_cm, phone, date_of_birth, playing_history, jersey_name, jersey_number, jersey_size')
          .eq('id', targetId)
          .maybeSingle();

        if (data) {
          setModalData((prev) => (prev ? { ...prev, ...data } : prev));
        }
      } catch (err) {
        // Fallback to provided state
      }
    }
  };

  return (
    <motion.div
      key={player.auction_player_id || player.player.id}
      initial={!reduceMotion ? { opacity: 0, scale: 0.95 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={!reduceMotion ? { opacity: 0, scale: 0.95 } : undefined}
      transition={{ duration: 0.4 }}
      className={`relative mx-auto overflow-hidden rounded-[2rem] border-2 border-[#e5a93c]/60 bg-gradient-to-b from-[#0f121d] via-[#141826] to-[#0a0c14] shadow-[0_0_80px_rgba(229,169,60,0.2)] font-sans select-none transition-all duration-300 w-full
        ${isFullscreen ? 'max-w-5xl my-auto p-10' : 'max-w-3xl p-5'}`}
    >
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-amber-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Header Bar */}
      <div className={`relative z-10 flex items-center justify-between border-b border-white/10 ${isFullscreen ? 'pb-4 mb-6' : 'pb-3 mb-4'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 p-0.5 shadow-lg ${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <div className="relative flex h-full w-full items-center justify-center rounded-[14px] bg-black overflow-hidden">
              {tournamentLogoUrl ? (
                <Image src={tournamentLogoUrl} alt={tournamentName || ''} fill unoptimized className="object-cover" />
              ) : (
                <span className={isFullscreen ? 'text-xl' : 'text-base'}>🏐</span>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <span className={`block font-black uppercase tracking-[0.2em] text-white truncate max-w-[200px] sm:max-w-[320px] ${isFullscreen ? 'text-xs' : 'text-[10px]'}`}>
              {tournamentName || 'VOLLEYBALL'}
            </span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.3em] text-[#e5a93c]">
              {tournamentName ? 'OFFICIAL AUCTION' : 'TOURNAMENT'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadPlayerCardPoster()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e5a93c]/50 bg-[#e5a93c]/15 px-2.5 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#e5a93c] hover:bg-[#e5a93c]/30 transition-colors shadow-md"
            title="Download high-resolution player auction poster card"
          >
            📥 Card PNG
          </button>
          <div className={`flex shrink-0 items-center gap-2 rounded-full border border-red-500/60 bg-gradient-to-r from-red-600 to-rose-600 font-black uppercase tracking-wider text-white shadow-lg ${isFullscreen ? 'px-4 py-1.5 text-xs' : 'px-2.5 py-1 text-[10px]'}`}>
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
        </div>
      </div>

      {/* Upper Section: Photo + Details */}
      <div className={`relative z-10 flex flex-row items-center justify-between ${isFullscreen ? 'gap-8 mb-7' : 'gap-4 mb-5'}`}>
        {/* Left: Photo */}
        <div className={`relative flex justify-center shrink-0 ${isFullscreen ? 'w-[40%] max-w-[280px]' : 'w-[120px] sm:w-[140px]'}`}>
          <div className={`absolute z-20 ${isFullscreen ? '-top-4 -left-3' : '-top-2 -left-2'}`}>
            <span className={`font-black italic text-[#e5a93c] drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] tracking-tighter ${isFullscreen ? 'text-6xl' : 'text-4xl'}`}>
              {String(player.attempt_number || 1).padStart(2, '0')}
            </span>
          </div>
          <div className="relative w-full aspect-square overflow-hidden rounded-[1.5rem] border-2 sm:border-4 border-[#e5a93c] bg-gradient-to-tr from-[#1a1409] to-[#0c0d14] shadow-xl flex items-center justify-center">
            {photoUrl ? (
              <Image src={photoUrl} alt={player.player.display_name} fill unoptimized className="object-cover object-top" sizes="256px" />
            ) : (
              <span className={`font-black tracking-widest text-[#e5a93c] ${isFullscreen ? 'text-8xl' : 'text-5xl'}`}>{initial}</span>
            )}
          </div>
        </div>

        {/* Right: Details */}
        <div className="flex-1 w-full text-left min-w-0">
          <div className="min-w-0 mb-3">
            <h2 className={`font-black uppercase tracking-tight text-white italic drop-shadow-md break-words leading-[1.1] line-clamp-2 ${isFullscreen ? 'text-5xl' : 'text-2xl sm:text-3xl'}`}>
              {player.player.display_name}
            </h2>
            <p className={`mt-1 font-bold uppercase tracking-[0.2em] text-[#e5a93c]/80 truncate ${isFullscreen ? 'text-sm' : 'text-[10px]'}`}>
              ID: VCA-{String(player.auction_player_id || player.player.id).substring(0, 4).toUpperCase()}
            </p>
          </div>

          <div className={`grid ${isFullscreen ? 'grid-cols-2 gap-y-5 gap-x-4 mt-2' : 'grid-cols-1 gap-2'}`}>
            <div className="flex items-center gap-2.5">
              <div className={`flex shrink-0 items-center justify-center rounded-full border border-[#e5a93c]/50 bg-[#e5a93c]/15 text-[#e5a93c] ${isFullscreen ? 'h-10 w-10' : 'h-8 w-8'}`}>
                <User className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
              </div>
              <div className="text-left min-w-0">
                <span className={`block font-black uppercase tracking-wider text-white/50 ${isFullscreen ? 'text-[10px]' : 'text-[8px]'}`}>POSITION</span>
                <span className={`block font-black uppercase text-white truncate ${isFullscreen ? 'text-lg' : 'text-xs'}`}>
                  {player.player.primary_position ? formatVolleyballPosition(player.player.primary_position) : 'SPIKER'}
                </span>
              </div>
            </div>

            {isFullscreen && (
              <div className="flex items-center gap-2.5">
                <div className="flex shrink-0 items-center justify-center rounded-full border border-[#e5a93c]/50 bg-[#e5a93c]/15 text-[#e5a93c] h-10 w-10">
                  <Hand className="h-5 w-5" />
                </div>
                <div className="text-left min-w-0">
                  <span className="block font-black uppercase tracking-wider text-white/50 text-[10px]">PLAYING STYLE</span>
                  <span className="block font-black uppercase text-white truncate text-lg">
                    {player.player.secondary_position ? formatVolleyballPosition(player.player.secondary_position) : 'ATTACKER'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2.5">
              <div className={`flex shrink-0 items-center justify-center rounded-full border border-[#e5a93c]/50 bg-[#e5a93c]/15 text-[#e5a93c] ${isFullscreen ? 'h-10 w-10' : 'h-8 w-8'}`}>
                <Award className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
              </div>
              <div className="text-left min-w-0">
                <span className={`block font-black uppercase tracking-wider text-white/50 ${isFullscreen ? 'text-[10px]' : 'text-[8px]'}`}>CATEGORY</span>
                <span className={`block font-black uppercase text-white truncate ${isFullscreen ? 'text-lg' : 'text-xs'}`}>{player.category_code || 'A'}</span>
              </div>
            </div>

            {isFullscreen && (
              <div className="flex items-center gap-2.5">
                <div className="flex shrink-0 items-center justify-center rounded-full border border-[#e5a93c]/50 bg-[#e5a93c]/15 text-[#e5a93c] h-10 w-10">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="text-left min-w-0">
                  <span className="block font-black uppercase tracking-wider text-white/50 text-[10px]">PHONE NO.</span>
                  <span className="block font-black uppercase text-white truncate text-lg">
                    {player.player.phone || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle Section: Price & Bidding */}
      <div className={`relative z-10 rounded-xl border border-[#e5a93c]/40 bg-black/70 backdrop-blur-md shadow-xl ${isFullscreen ? 'p-6 mb-6' : 'p-3 mb-4'}`}>
        <div className="flex items-center justify-between text-center gap-2">
          <div className="flex-1 border-r border-white/10 pr-2">
            <span className={`block font-black uppercase tracking-wider text-white/50 ${isFullscreen ? 'text-xs' : 'text-[8px]'}`}>BASE</span>
            <span className={`block font-black text-white mt-1 ${isFullscreen ? 'text-3xl' : 'text-sm sm:text-base'}`}>{formatMoney(player.base_price)}</span>
          </div>

          <div className="flex-[2] px-2">
            <span className={`block font-black uppercase tracking-[0.2em] text-[#e5a93c] mb-1.5 ${isFullscreen ? 'text-xs' : 'text-[8px]'}`}>CURRENT BID</span>
            <div className={`inline-block w-full rounded-lg bg-gradient-to-r from-[#e5a93c] via-[#fcd34d] to-[#e5a93c] shadow-lg transform -skew-x-6 ${isFullscreen ? 'py-3 px-4' : 'py-1.5 px-2'}`}>
              <span className={`font-black text-black tracking-tight transform skew-x-6 block ${isFullscreen ? 'text-5xl' : 'text-lg sm:text-xl'}`}>
                {highestBid ? formatMoney(highestBid.amount) : 'NO BIDS'}
              </span>
            </div>
          </div>

          <div className="flex-1 border-l border-white/10 pl-2">
            <span className={`block font-black uppercase tracking-wider text-white/50 ${isFullscreen ? 'text-xs' : 'text-[8px]'}`}>BIDS</span>
            <span className={`flex items-center justify-center gap-1 font-black text-white mt-1 ${isFullscreen ? 'text-3xl' : 'text-sm sm:text-base'}`}>
              <Gavel className={`text-[#e5a93c] ${isFullscreen ? 'h-6 w-6' : 'h-3.5 w-3.5'}`} />
              <span>{recentBidsCount ?? (highestBid ? 1 : 0)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Highest Bidder / Team Card */}
      <div className="relative z-10 rounded-2xl border border-[#e5a93c]/40 bg-black/50 p-4 sm:p-5 backdrop-blur-md shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Highest Bidder */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#e5a93c]/50 bg-[#e5a93c]/20 text-[#e5a93c] shadow-md">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-white/50">
                HIGHEST BIDDER
              </span>
              <span className="block text-base sm:text-lg font-black uppercase text-[#e5a93c] truncate max-w-[200px]">
                {highestBid ? (highestBid.team.short_name ?? highestBid.team.name) : '—'}
              </span>
            </div>
          </div>

          {/* Currently Bidding */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white">
              <User className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-white/50">
                CURRENTLY BIDDING
              </span>
              <span className="block text-base sm:text-lg font-black uppercase text-white truncate max-w-[200px]">
                {currentlyBiddingTeamName || (highestBid ? (highestBid.team.short_name ?? highestBid.team.name) : '—')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
