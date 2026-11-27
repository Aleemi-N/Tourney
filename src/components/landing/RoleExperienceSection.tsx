import React from 'react';
import { ClipboardCheck, Eye, Shield, Star, Users } from 'lucide-react';
import { Reveal } from './LandingMotion';

const ROLES = [
  { icon: Shield, title: 'Organizer', caps: ['Create and run tournaments', 'Approve teams and players', 'Lot draw, auction, fixtures'] },
  { icon: Users, title: 'Team owner', caps: ['Register your team', 'Bid in the live auction', 'Manage your squad'] },
  { icon: Star, title: 'Player', caps: ['One profile, every season', 'Register in a few taps', 'Certificates and history'] },
  { icon: ClipboardCheck, title: 'Scorer', caps: ['Score rally by rally', 'Works on any phone', 'Undo mistakes safely'] },
  { icon: Eye, title: 'Fan', caps: ['Live scores and sets', 'Fixtures and standings', 'Follow from anywhere'] },
];

export function RoleExperienceSection() {
  return (
    <section className="w-full bg-background py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-12 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">For everyone on court</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-5xl">One platform. Five roles.</h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.06}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:border-primary/40">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground"><r.icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-lg font-bold text-text-primary">{r.title}</h3>
                <ul className="mt-3 space-y-2">
                  {r.caps.map((c) => (
                    <li key={c} className="flex gap-2 text-sm text-text-secondary">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
