'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CourtLineBackground } from './CourtLineBackground';
import { HeroProductComposition } from './HeroProductComposition';

export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden min-h-[100svh] flex items-center pt-16 md:pt-0 bg-[#09090e]">
      <CourtLineBackground />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10 py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 items-center">
          
          {/* Text Content */}
          <div className="flex flex-col gap-6 md:pr-8 text-center lg:text-left z-20">
            <motion.h1 
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-[clamp(2.25rem,10vw,5rem)] font-extrabold tracking-tight text-white leading-[1.05]"
            >
              Run Your Tournament.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tournament-accent">
                Own Every Moment.
              </span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
              className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto lg:mx-0"
            >
              Create and manage volleyball tournaments — registrations, teams, players, lot draw, auction, live scoring and standings — from one platform.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 mt-4 justify-center lg:justify-start w-full"
            >
              <Link 
                href="/organizer/tournaments/new"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-primary to-primary-hover shadow-[0_4px_15px_rgb(79,70,229,0.3)] hover:shadow-[0_8px_25px_rgb(79,70,229,0.4)] hover:-translate-y-0.5 active:scale-95 text-primary-foreground font-bold rounded-xl transition-all duration-300 flex justify-center items-center h-14"
              >
                Create Tournament
              </Link>
              <a 
                href="#tournaments"
                className="w-full sm:w-auto px-8 py-4 bg-surface-muted/30 border border-glass-border hover:bg-surface/60 hover:-translate-y-0.5 active:scale-95 text-text-primary font-bold rounded-xl transition-all duration-300 flex justify-center items-center h-14 backdrop-blur-sm"
              >
                Find Tournament
              </a>
            </motion.div>
          </div>

          {/* Visual Content */}
          <div className="w-full flex justify-center lg:justify-end mt-[-20px] md:mt-0 relative z-10">
            <HeroProductComposition />
          </div>

        </div>
      </div>
    </section>
  );
}
