'use client';

import React from 'react';
import { motion } from 'framer-motion';

const LINES = [
  { words: ['Run', 'the', 'tournament.'], className: 'text-text-primary' },
  { words: ['Own', 'every', 'point.'], className: 'landing-shimmer bg-gradient-to-r from-primary via-info to-primary bg-clip-text text-transparent' },
];

/** The hero headline, word by word. */
export function HeroHeadline() {
  let n = 0;
  return (
    <h1 className="text-[clamp(2.5rem,8vw,4.25rem)] font-black leading-[1.02] tracking-tight">
      {LINES.map((line) => (
        <span key={line.words[0]} className="block">
          {line.words.map((w) => (
            <motion.span
              key={w}
              className={`mr-[0.25em] inline-block ${line.className}`}
              initial={{ opacity: 0, y: 40, rotateX: -60 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.1 + n++ * 0.08, type: 'spring', stiffness: 140, damping: 16 }}
            >
              {w}
            </motion.span>
          ))}
        </span>
      ))}
    </h1>
  );
}
