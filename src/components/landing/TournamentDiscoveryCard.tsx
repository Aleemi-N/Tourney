import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Calendar, ArrowRight } from 'lucide-react';

export type DiscoveryTournamentProps = {
  tournament: {
    id: string;
    slug: string;
    name: string;
    status: string;
    start_date: string | null;
    venue: string | null;
    format: string;
    league_mode: string;
    tournament_branding?: { logo_path: string | null } | Array<{ logo_path: string | null }>;
    tournament_settings?: { player_registration_enabled: boolean; team_registration_enabled: boolean } | Array<{ player_registration_enabled: boolean; team_registration_enabled: boolean }>;
  };
};

export function TournamentDiscoveryCard({ tournament }: DiscoveryTournamentProps) {
  const branding = Array.isArray(tournament.tournament_branding) ? tournament.tournament_branding[0] : tournament.tournament_branding;
  const logoUrl = branding?.logo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${branding.logo_path}`
    : null;
  const getStatusDisplay = (tournament: DiscoveryTournamentProps['tournament']) => {
    const { status, tournament_settings, format } = tournament;
    
    switch(status) {
      case 'LIVE':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-live bg-live/10 border border-live/20 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            LIVE
          </span>
        );
      case 'REGISTRATION':
        const settings = Array.isArray(tournament_settings) ? tournament_settings[0] : tournament_settings;
        const playerOpen = settings?.player_registration_enabled;
        const teamOpen = settings?.team_registration_enabled;
        
        let display = 'REGISTRATION CLOSED';
        let colorClass = 'text-unsold bg-unsold/10 border-unsold/20';

        if (format === 'AUCTION_LEAGUE' || format === 'LEAGUE') {
          if (teamOpen) {
            display = 'TEAM REGISTRATION OPEN';
            colorClass = 'text-primary bg-primary/10 border-primary/20';
          } else if (playerOpen) {
            display = 'PLAYER REGISTRATION OPEN';
            colorClass = 'text-primary bg-primary/10 border-primary/20';
          }
        } else {
          if (playerOpen) {
            display = 'REGISTRATION OPEN';
            colorClass = 'text-primary bg-primary/10 border-primary/20';
          }
        }

        return (
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-full ${colorClass}`}>
            {display}
          </span>
        );
      case 'PREPARATION':
      case 'UPCOMING':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning bg-warning/10 border border-warning/20 rounded-full">
            PREPARATION
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-unsold bg-unsold/10 border border-unsold/20 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <Link 
      href={`/t/${tournament.slug}`}
      className="group w-full max-w-[340px] min-w-[280px] bg-[#131318] hover:bg-[#18181f] rounded-2xl border border-white/5 hover:border-white/10 transition-all shadow-lg hover:shadow-xl overflow-hidden relative flex flex-col snap-start shrink-0"
    >
      <div className="absolute top-0 right-0 left-0 h-24 bg-gradient-to-br from-primary/10 to-transparent opacity-50 pointer-events-none group-hover:from-primary/20 transition-all" />
      <div className="p-5 flex flex-col flex-1 relative z-10 gap-4">
        <div className="flex justify-between items-start">
          <div className="relative w-12 h-12 overflow-hidden rounded-xl bg-[#1c1c21] flex items-center justify-center border border-white/5">
            {logoUrl ? <Image src={logoUrl} alt="" fill sizes="48px" className="object-contain p-1.5" unoptimized /> : <span className="text-text-muted font-bold text-sm">{tournament.name.substring(0, 2).toUpperCase()}</span>}
          </div>
          {getStatusDisplay(tournament)}
        </div>
        
        <div className="flex-1">
          <h3 className="font-bold text-lg text-text-primary leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {tournament.name}
          </h3>
          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex items-center gap-1.5 text-text-secondary text-sm">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tournament.venue || 'Location TBA'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-text-secondary text-sm">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{tournament.start_date ? new Date(tournament.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'TBD'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 pb-4 border-b border-white/5">
          <span className="px-2 py-1 bg-white/5 text-text-secondary text-[10px] font-semibold rounded-md uppercase tracking-wider">{tournament.format}</span>
          <span className="px-2 py-1 bg-white/5 text-text-secondary text-[10px] font-semibold rounded-md uppercase tracking-wider">{tournament.league_mode}</span>
        </div>

        <div className="flex items-center text-primary text-sm font-semibold mt-1 group-hover:translate-x-1 transition-transform">
          View Tournament <ArrowRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </Link>
  );
}
