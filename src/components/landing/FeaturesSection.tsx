import React from 'react';
import { Bell, CalendarDays, ClipboardList, Gavel, Trophy, Zap } from 'lucide-react';
import { Reveal } from './LandingMotion';
import { AuctionBidTicker } from './AuctionBidTicker';
import { CertificateVisual, JerseyVisual, LotDrawVisual, StandingsVisual } from './FeatureVisuals';

const VISUAL_FEATURES = [
  { title: 'Digital lot draw', desc: 'Fair, visible draws for icon and setter lots.', Visual: LotDrawVisual },
  { title: 'Standings', desc: 'Tables update themselves after every match.', Visual: StandingsVisual },
  { title: 'Jersey export', desc: 'Names, numbers and sizes ready for the printer.', Visual: JerseyVisual },
  { title: 'Certificates', desc: 'Printable certificates for players and winners.', Visual: CertificateVisual },
];

const FEATURES = [
  { icon: Trophy, title: 'Tournament management', desc: 'Format, rules, branding and every setting in one place.' },
  { icon: ClipboardList, title: 'Team & player registration', desc: 'Online forms, fees and approvals — profiles reused every season.' },
  { icon: CalendarDays, title: 'Fixtures', desc: 'League and knockout schedules built for you.' },
  { icon: Bell, title: 'Notifications', desc: 'Players and owners hear about what matters to them.' },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative w-full scroll-mt-20 bg-background py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-12 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Features</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-5xl">Everything game day needs.</h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal className="sm:col-span-2">
            <div className="flex h-full flex-col justify-between gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
              <div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-live/10 text-live"><Zap className="h-5 w-5" /></span>
                <h3 className="mt-4 text-2xl font-bold text-text-primary">Point-by-point live scoring</h3>
                <p className="mt-2 text-text-secondary">Scorers tap each rally on a phone. Fans see the score, sets and server change instantly — on the web, the app or a TV screen.</p>
              </div>
              <div className="flex items-center gap-2" aria-hidden="true">
                {[25, 23, 25, 19].map((p, i) => (
                  <div key={i} className="flex-1 rounded-xl bg-surface-muted p-3 text-center">
                    <p className="text-xs font-semibold text-text-muted">Set {i + 1}</p>
                    <p className="numeric-display text-xl font-black text-text-primary">{p}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal className="sm:col-span-2" delay={0.08}>
            <div className="flex h-full flex-col justify-between gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
              <div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gavel className="h-5 w-5" /></span>
                <h3 className="mt-4 text-2xl font-bold text-text-primary">Live player auctions</h3>
                <p className="mt-2 text-text-secondary">Team owners bid in real time with budgets enforced. Everyone watches the paddle go up together.</p>
              </div>
              <AuctionBidTicker />
            </div>
          </Reveal>

          {VISUAL_FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.06}>
              <div className="flex h-full flex-col justify-between gap-5 rounded-3xl border border-border bg-surface p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:border-primary/40">
                <div className="flex min-h-28 items-center justify-center"><f.Visual /></div>
                <div>
                  <h3 className="font-bold text-text-primary">{f.title}</h3>
                  <p className="mt-1 text-sm text-text-secondary">{f.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}

          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.06}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-5 shadow-card transition duration-300 hover:-translate-y-1 hover:border-primary/40">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:scale-110"><f.icon className="h-5 w-5" /></span>
                <h3 className="mt-4 font-bold text-text-primary">{f.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
