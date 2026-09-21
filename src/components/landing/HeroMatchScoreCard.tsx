import React from 'react';

export function HeroMatchScoreCard() {
  return (
    <div className="w-[260px] sm:w-[280px] bg-[#131318] rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
      <div className="bg-white/5 px-4 py-2 flex justify-between items-center border-b border-white/5">
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Set 2</span>
        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-live bg-live/10 border border-live/20 rounded-full flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
          IN PROGRESS
        </span>
      </div>
      
      <div className="p-4 flex flex-col gap-3 font-mono text-lg">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-text-primary font-sans">TEAM ALPHA</span>
          <span className="font-bold text-2xl text-text-primary numeric-display">24</span>
        </div>
        <div className="flex justify-between items-center text-text-muted">
          <span className="font-semibold font-sans">TEAM BETA</span>
          <span className="font-bold text-2xl numeric-display">18</span>
        </div>
      </div>
    </div>
  );
}
