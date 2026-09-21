'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { HeroTournamentCard } from './HeroTournamentCard';
import { HeroPlayerCard } from './HeroPlayerCard';
import { HeroMatchScoreCard } from './HeroMatchScoreCard';

export function HeroProductComposition() {
  return (
    <div className="relative w-full h-[400px] md:h-[500px] flex items-center justify-center pointer-events-none mt-8 md:mt-0">
      
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-primary/20 rounded-full blur-[80px] md:blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
        className="relative w-full max-w-lg mx-auto"
      >
        {/* Tournament Card (Top Left) */}
        <motion.div 
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-24 sm:-top-32 md:-top-40 left-0 sm:left-4 md:-left-12 z-0 scale-[0.65] sm:scale-75 md:scale-90 origin-bottom-left sm:origin-bottom-right"
          style={{ rotate: '-6deg' }}
        >
          <HeroTournamentCard />
        </motion.div>

        {/* Player Card (Center, most prominent) */}
        <motion.div 
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 5.1, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          className="relative z-10 mx-auto w-max scale-[0.85] sm:scale-90 md:scale-105"
          style={{ rotate: '2deg' }}
        >
          <HeroPlayerCard />
        </motion.div>

        {/* Match Score (Bottom Right) */}
        <motion.div 
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute -bottom-16 sm:-bottom-20 right-0 sm:right-4 md:-right-8 z-20 scale-[0.65] sm:scale-75 md:scale-90 origin-top-right sm:origin-top-left"
          style={{ rotate: '4deg' }}
        >
          <HeroMatchScoreCard />
        </motion.div>
      </motion.div>

    </div>
  );
}
