import React from 'react';
import Link from 'next/link';
import { CourtLineBackground } from './CourtLineBackground';

export function CtaSection() {
  return (
    <section className="w-full relative py-16 lg:py-24 overflow-hidden bg-[#09090e]">
      <CourtLineBackground className="opacity-50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[800px] h-[400px] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-10">
          Ready to run your next tournament?
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/organizer/tournaments/new"
            className="px-8 py-4 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-xl transition-colors text-center shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)]"
          >
            Create Tournament
          </Link>
          <Link 
            href="#tournaments"
            className="px-8 py-4 bg-transparent border border-border-strong hover:bg-white/5 text-text-primary font-bold rounded-xl transition-colors text-center"
          >
            Explore Tournaments
          </Link>
        </div>
      </div>
    </section>
  );
}
