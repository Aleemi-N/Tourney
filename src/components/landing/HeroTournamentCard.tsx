import React from 'react';
import { MapPin } from 'lucide-react';

export function HeroTournamentCard() {
  return (
    <div className="w-[280px] sm:w-[320px] bg-[#131318] rounded-2xl border border-white/5 overflow-hidden shadow-2xl relative">
      <div className="absolute top-0 right-0 left-0 h-24 bg-gradient-to-br from-primary/30 to-transparent opacity-50 pointer-events-none" />
      <div className="p-5 flex flex-col gap-4 relative z-10">
        <div className="flex justify-between items-start">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold">VC</span>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-live bg-live/10 border border-live/20 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            LIVE
          </span>
        </div>
        
        <div>
          <h3 className="font-bold text-lg text-text-primary leading-tight uppercase">VOLLEYBALL CHAMPIONSHIP</h3>
          <div className="flex items-center gap-1.5 text-text-secondary text-sm mt-1">
            <MapPin className="w-3.5 h-3.5" />
            <span className="uppercase">VENUE · DATE</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="px-2 py-1 bg-white/5 text-text-secondary text-[10px] font-semibold rounded-md uppercase tracking-wider">League</span>
          <span className="px-2 py-1 bg-white/5 text-text-secondary text-[10px] font-semibold rounded-md uppercase tracking-wider">Auction</span>
        </div>
      </div>
    </div>
  );
}
