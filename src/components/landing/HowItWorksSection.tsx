import React from 'react';
import { ClipboardList, Gavel, Play, Trophy } from 'lucide-react';
import { DrawLine, Reveal } from './LandingMotion';

const STEPS = [
  { icon: Trophy, title: 'Create', desc: 'Set the format, rules, fees and your tournament’s look.' },
  { icon: ClipboardList, title: 'Register', desc: 'Teams and players sign up online; you approve them.' },
  { icon: Gavel, title: 'Build squads', desc: 'Run the lot draw and live auction, or use registered teams.' },
  { icon: Play, title: 'Play live', desc: 'Fixtures, live scoring, standings and certificates follow.' },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="w-full scroll-mt-20 border-y border-border bg-surface py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-12 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">How it works</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-5xl">From sign-up to final whistle.</h2>
        </Reveal>

        <DrawLine className="mb-6 hidden h-1 rounded-full bg-gradient-to-r from-primary via-info to-success lg:block" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1}>
              <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-background p-6">
                <span className="numeric-display absolute -right-2 -top-4 text-8xl font-black text-primary/10" aria-hidden="true">{i + 1}</span>
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><s.icon className="h-5 w-5" /></span>
                <h3 className="relative mt-5 text-xl font-bold text-text-primary">{i + 1}. {s.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-text-secondary">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
