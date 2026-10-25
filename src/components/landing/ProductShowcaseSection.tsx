import React from 'react';
import { HeroTournamentCard } from './HeroTournamentCard';
import { HeroPlayerCard } from './HeroPlayerCard';
import { HeroMatchScoreCard } from './HeroMatchScoreCard';

export function ProductShowcaseSection() {
  return (
    <section className="w-full py-16 lg:py-24 bg-background relative z-10 overflow-hidden border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12 lg:mb-16 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight">This is what your tournament looks like.</h2>
        <p className="text-text-secondary mt-4 text-lg">Real UI. Real experience.</p>
      </div>

      <div className="relative w-full max-w-[1400px] mx-auto">
        {/* Desktop Composition */}
        <div className="hidden xl:flex items-center justify-center py-20 px-8 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-[400px] bg-primary/10 rounded-[100px] blur-[120px] pointer-events-none" />
          
          <div className="relative z-10 hover:z-50 group cursor-default" style={{ transform: 'rotate(-4deg) translateY(20px)' }}>
            <div className="transition-transform duration-500 group-hover:-translate-y-8 group-hover:rotate-[4deg] shadow-card">
              <HeroPlayerCard />
            </div>
          </div>
          
          <div className="relative z-20 -ml-20 hover:z-50 group cursor-default" style={{ transform: 'rotate(2deg) translateY(-30px)' }}>
            <div className="transition-transform duration-500 group-hover:-translate-y-8 group-hover:rotate-[-2deg] shadow-card">
              <HeroTournamentCard />
            </div>
          </div>
          
          <div className="relative z-30 -ml-20 hover:z-50 group cursor-default" style={{ transform: 'rotate(-2deg) translateY(40px)' }}>
            <div className="transition-transform duration-500 group-hover:-translate-y-8 group-hover:rotate-[2deg] shadow-card">
              <HeroMatchScoreCard />
            </div>
          </div>
          
          <div className="relative z-40 -ml-20 hover:z-50 group cursor-default" style={{ transform: 'rotate(4deg) translateY(-10px)' }}>
            <div className="transition-transform duration-500 group-hover:-translate-y-8 group-hover:rotate-[-4deg] shadow-card">
              <div className="w-[300px] bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
                <div className="grid grid-cols-4 bg-surface px-4 py-2 text-xs font-bold text-text-muted uppercase tracking-wider border-b border-border">
                  <span className="col-span-2">Team</span>
                  <span className="text-center">W-L</span>
                  <span className="text-right">Pts</span>
                </div>
                <div className="flex flex-col divide-y divide-border">
                  <div className="grid grid-cols-4 px-4 py-3 items-center">
                    <span className="col-span-2 font-bold text-sm text-text-primary">Team Alpha</span>
                    <span className="text-center text-xs text-text-secondary">4-0</span>
                    <span className="text-right font-bold text-sm text-primary">12</span>
                  </div>
                  <div className="grid grid-cols-4 px-4 py-3 items-center">
                    <span className="col-span-2 font-bold text-sm text-text-primary">Team Beta</span>
                    <span className="text-center text-xs text-text-secondary">3-1</span>
                    <span className="text-right font-bold text-sm text-text-primary">9</span>
                  </div>
                  <div className="grid grid-cols-4 px-4 py-3 items-center bg-surface">
                    <span className="col-span-2 font-bold text-sm text-text-primary">Team Gamma</span>
                    <span className="text-center text-xs text-text-secondary">2-2</span>
                    <span className="text-right font-bold text-sm text-text-primary">6</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet Scrollable */}
        <div className="xl:hidden relative">
          <div className="absolute top-0 bottom-0 left-0 w-8 md:w-32 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
          <div className="absolute top-0 bottom-0 right-0 w-8 md:w-32 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none" />

          <div className="flex overflow-x-auto gap-6 px-12 md:px-24 pb-12 snap-x snap-mandatory scrollbar-none items-center">
            <div className="flex flex-col items-center gap-6 shrink-0 snap-center">
              <HeroPlayerCard />
            </div>

            <div className="flex flex-col items-center gap-6 shrink-0 snap-center">
              <HeroTournamentCard />
            </div>

            <div className="flex flex-col items-center gap-6 shrink-0 snap-center">
              <HeroMatchScoreCard />
            </div>

            <div className="flex flex-col items-center gap-6 shrink-0 snap-center">
              <div className="w-[280px] sm:w-[300px] bg-surface rounded-2xl border border-border shadow-card overflow-hidden">
                <div className="grid grid-cols-4 bg-surface px-4 py-2 text-xs font-bold text-text-muted uppercase tracking-wider border-b border-border">
                  <span className="col-span-2">Team</span>
                  <span className="text-center">W-L</span>
                  <span className="text-right">Pts</span>
                </div>
                <div className="flex flex-col divide-y divide-border">
                  <div className="grid grid-cols-4 px-4 py-3 items-center">
                    <span className="col-span-2 font-bold text-sm text-text-primary">Team Alpha</span>
                    <span className="text-center text-xs text-text-secondary">4-0</span>
                    <span className="text-right font-bold text-sm text-primary">12</span>
                  </div>
                  <div className="grid grid-cols-4 px-4 py-3 items-center">
                    <span className="col-span-2 font-bold text-sm text-text-primary">Team Beta</span>
                    <span className="text-center text-xs text-text-secondary">3-1</span>
                    <span className="text-right font-bold text-sm text-text-primary">9</span>
                  </div>
                  <div className="grid grid-cols-4 px-4 py-3 items-center bg-surface">
                    <span className="col-span-2 font-bold text-sm text-text-primary">Team Gamma</span>
                    <span className="text-center text-xs text-text-secondary">2-2</span>
                    <span className="text-right font-bold text-sm text-text-primary">6</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
