'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';

const NOTIFICATIONS = [
  { title: 'Set 2 to Blue Spikers', body: '25–23 · Blue Spikers lead 2–0' },
  { title: 'You were picked!', body: 'Sold to Coast Smash in the auction' },
  { title: 'Match starts in 15 min', body: 'Court 1 · Quarter-final' },
];

/** Sample notifications dropping onto the phone in the Android app section. */
export function AppPhoneNotifications() {
  return (
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
  );
}
