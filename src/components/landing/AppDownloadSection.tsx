'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bell, Smartphone } from 'lucide-react';
import Image from 'next/image';
import { Reveal } from './LandingMotion';
import { APP_CONFIG } from '@/lib/config';


const NOTIFICATIONS = [
  { title: 'Set 2 to Blue Spikers', body: '25–23 · Blue Spikers lead 2–0' },
  { title: 'You were picked!', body: 'Sold to Coast Smash in the auction' },
  { title: 'Match starts in 15 min', body: 'Court 1 · Quarter-final' },
];

export function AppDownloadSection() {
  return (
    <section id="app" className="w-full scroll-mt-20 bg-background px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div data-theme="dark" className="relative mx-auto grid max-w-7xl items-center gap-10 overflow-hidden rounded-[2rem] border border-border bg-surface p-8 text-text-primary sm:p-12 lg:grid-cols-2">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/25 blur-[100px]" />

        <Reveal className="relative z-10 flex flex-col gap-5 text-center lg:text-left">
          <span className="mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary lg:mx-0">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Android app
          </span>
          <h2 className="text-3xl font-black tracking-tight md:text-5xl">Your tournament, in your pocket.</h2>
          <p className="text-lg text-text-secondary">
            Follow live scores, get notified when your match starts or you are picked in the auction, and keep every certificate — on the Tourny app for Android.
          </p>
          <a href={APP_CONFIG.playStoreUrl} target="_blank" rel="noopener noreferrer" className="mx-auto inline-flex h-14 w-fit items-center gap-3 rounded-xl bg-primary px-6 font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary-hover lg:mx-0">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
            Get it on Google Play
          </a>
        </Reveal>

        {/* Phone with notifications dropping in */}
        <div className="relative z-10 mx-auto w-[260px]" aria-hidden="true">
          <div className="rounded-[2.5rem] border-4 border-border-strong bg-background p-4 shadow-overlay">
            <div className="mx-auto mb-6 h-1.5 w-16 rounded-full bg-border-strong" />
            <div className="mb-6 flex flex-col items-center gap-2">
              <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" />
              <span className="text-sm font-bold">Tourny</span>
            </div>
            <div className="flex min-h-[230px] flex-col gap-2.5">
              {NOTIFICATIONS.map((n, i) => (
                <motion.div
                  key={n.title}
                  initial={{ opacity: 0, y: -16, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.45, type: 'spring', stiffness: 260, damping: 22 }}
                  className="flex gap-3 rounded-2xl border border-border bg-surface-raised p-3"
                >
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{n.title}</p>
                    <p className="truncate text-xs text-text-muted">{n.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
