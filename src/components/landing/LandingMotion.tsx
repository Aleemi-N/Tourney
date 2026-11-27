'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useInView, useReducedMotion } from 'framer-motion';

/** Turns every landing animation off for visitors who ask their device for reduced motion. */
export function LandingMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

/** A bar that draws itself from left to right when it scrolls into view. */
export function DrawLine({ className }: { className?: string }) {
  return (
    <motion.div
      className={`origin-left ${className ?? ''}`}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
    />
  );
}

/** Counts from 0 up to `value` once it is on screen; screen readers get the real number straight away. */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, { duration: 1.4, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return (
    <span ref={ref} aria-label={String(value)} className="numeric-display">
      <span aria-hidden="true">{reduce ? value : shown}</span>
    </span>
  );
}

/** A number that slides up when it changes, like a scoreboard flip. */
export function TickNumber({ value, className }: { value: number | string; className?: string }) {
  return (
    <span className={`relative inline-flex overflow-hidden ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="numeric-display"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Runs `step` every `ms` while the element is on screen, unless the visitor asked for reduced motion. */
export function useTicker(step: () => void, ms: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; });

  useEffect(() => {
    if (!inView || reduce) return;
    const id = window.setInterval(() => stepRef.current(), ms);
    return () => window.clearInterval(id);
  }, [inView, reduce, ms]);

  return ref;
}
