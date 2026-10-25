'use client';

import React from 'react';
import { MapPin, Ruler } from 'lucide-react';
import Image from 'next/image';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

/** Utility for merging tailwind classes */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type PlayerCardProps = {
  player: {
    id: string;
    display_name: string;
    primary_position: string;
    secondary_position?: string | null;
    photo_path?: string | null;
    height_cm?: number | null;
    place?: string | null;
  };
  classification?: 'ICON_LOT' | 'SETTER_LOT' | 'MAIN_AUCTION' | null;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'WITHDRAWN';
  tournamentColor?: string;
  className?: string;
  children?: React.ReactNode;
};

export function PlayerCard({
  player,
  classification,
  status,
  tournamentColor,
  className,
  children
}: PlayerCardProps) {
  // Format classification for display
  const getClassificationBadge = () => {
    if (!classification) return null;
    const labels: Record<string, string> = {
      ICON_LOT: 'ICON',
      SETTER_LOT: 'SETTER',
      MAIN_AUCTION: 'MAIN AUCTION'
    };
    return (
      <span 
        className="absolute top-2 right-2 z-10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-text-primary rounded-full shadow-sm"
        style={{ backgroundColor: tournamentColor || '#0ea5e9' }}
      >
        {labels[classification] || classification}
      </span>
    );
  };

  const getStatusBadge = () => {
    if (!status) return null;
    const config: Record<string, { label: string; cls: string }> = {
      PENDING: { label: 'PENDING', cls: 'bg-warning/15 text-text-primary' },
      APPROVED: { label: 'APPROVED', cls: 'bg-success/15 text-text-primary' },
      REJECTED: { label: 'REJECTED', cls: 'bg-danger/15 text-text-primary' },
      CHANGES_REQUESTED: { label: 'CHANGES REQ', cls: 'bg-warning/15 text-text-primary' },
      WITHDRAWN: { label: 'WITHDRAWN', cls: 'bg-surface-muted text-text-primary' }
    };
    const mapped = config[status];
    if (!mapped) return null;
    
    return (
      <span className={cn("absolute top-2 right-2 z-10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full shadow-sm ", mapped.cls)}>
        {mapped.label}
      </span>
    );
  };

  const initials = player.display_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border border-border dark:border-border bg-surface-muted dark:bg-surface shadow-sm transition-all ",
        className
      )}
      style={{
        borderTop: tournamentColor ? `3px solid ${tournamentColor}` : undefined
      }}
    >
      {/* Badges */}
      {status ? getStatusBadge() : getClassificationBadge()}

      {/* Photo Area (Approx 55-60% visually via aspect ratio) */}
      <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
        {player.photo_path ? (
          <Image
            src={player.photo_path}
            alt={player.display_name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover object-[center_22%] transition-transform duration-500"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-secondary dark:text-text-muted transition-transform duration-500">
            <span className="text-4xl font-bold tracking-widest opacity-40">{initials}</span>
          </div>
        )}
        {/* Subtle gradient overlay for premium feel at the bottom of the photo */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-slate-900/60 to-transparent pointer-events-none" />
      </div>

      {/* Typography Area */}
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <h3 className="line-clamp-2 text-lg font-bold tracking-tight text-text-primary dark:text-text-primary mb-0.5">
            {player.display_name}
          </h3>
          <p className="text-sm font-medium text-text-muted dark:text-text-secondary">
            {formatVolleyballPosition(player.primary_position)}
          </p>
          {player.secondary_position && (
            <p className="mt-0.5 truncate text-xs text-text-secondary dark:text-text-muted">
              Secondary: {formatVolleyballPosition(player.secondary_position)}
            </p>
          )}
        </div>

        {/* Optional Metadata Grid */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-muted dark:text-text-secondary">
          {player.height_cm && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Ruler size={14} className="opacity-70 shrink-0" />
              <span className="truncate">{player.height_cm} cm</span>
            </div>
          )}
          {player.place && (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <MapPin size={14} className="opacity-70 shrink-0" />
              <span className="truncate">{player.place}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Extension Slot (e.g. for Review Buttons) */}
      {children && (
        <div className="mt-auto border-t border-border dark:border-border bg-surface-muted dark:bg-surface p-4">
          {children}
        </div>
      )}
    </div>
  );
}
