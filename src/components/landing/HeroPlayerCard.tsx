import React from 'react';
import { Ruler, MapPin, User } from 'lucide-react';

export function HeroPlayerCard() {
  return (
    <div className="w-[240px] sm:w-[260px] bg-surface rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col relative aspect-[3/4]">
      {/* Photo Area Mock */}
      <div className="relative h-[60%] w-full bg-[#1a1a24] overflow-hidden flex items-center justify-center">
        {/* Abstract player silhouette */}
        <User className="w-32 h-32 text-white/5 translate-y-6" strokeWidth={1} />
        {/* Gradient Transition */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface to-transparent" />
        
        {/* Mock Classification Badge */}
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white bg-indigo-500 rounded-full shadow-sm backdrop-blur-md">
          ICON
        </span>
      </div>

      {/* Info Area */}
      <div className="relative z-10 flex-1 bg-surface p-4 flex flex-col justify-between -mt-6">
        <div>
          <h3 className="font-bold text-xl text-text-primary tracking-tight uppercase">PLAYER</h3>
          
          <div className="flex gap-2 items-center mt-2">
            <span className="px-2 py-0.5 bg-white/10 text-white rounded text-[10px] font-bold w-fit uppercase">
              Outside Hitter
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mt-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Ruler className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-medium">188 CM</span>
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-medium truncate uppercase">LOCATION</span>
          </div>
        </div>
      </div>
    </div>
  );
}
