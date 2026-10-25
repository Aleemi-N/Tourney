import React from 'react';
import Link from 'next/link';
import { CourtLineBackground } from './CourtLineBackground';
import { PwaInstallAction } from '@/components/pwa/PwaInstallAction';

export function CtaSection() {
  return (
    <section className="w-full relative py-16 lg:py-24 overflow-hidden bg-background">
      <CourtLineBackground className="opacity-50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[800px] h-[400px] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-text-primary tracking-tight mb-10">
          Ready to run your next tournament?
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/organizer/tournaments/new"
            className="px-8 py-4 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-xl transition-colors text-center shadow-card"
          >
            Create Tournament
          </Link>
          <Link 
            href="#tournaments"
            className="px-8 py-4 bg-transparent border border-border-strong hover:bg-surface-muted text-text-primary font-bold rounded-xl transition-colors text-center"
          >
            Explore Tournaments
          </Link>
          <PwaInstallAction className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-8 py-4 text-center font-bold text-primary-foreground transition-colors hover:bg-primary/20" />
        </div>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-text-secondary">Install Tourny for quicker access on supported Android and desktop browsers. On iPhone and iPad, use Share → Add to Home Screen.</p>
      </div>
    </section>
  );
}
