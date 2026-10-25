import React from 'react';
import { Trophy, Users, ClipboardList, Play, BarChart2 } from 'lucide-react';
import Link from 'next/link';

export function HowItWorksSection() {
  const steps = [
    { num: '01', title: 'Create Tournament', icon: Trophy, desc: 'Set format, rules, and branding' },
    { num: '02', title: 'Register Teams & Players', icon: Users, desc: 'Reusable profiles, team applications' },
    { num: '03', title: 'Manage Competition', icon: ClipboardList, desc: 'Lot draw, auction, squad building' },
    { num: '04', title: 'Go Live', icon: Play, desc: 'Fixtures, live scoring, real-time updates' },
    { num: '05', title: 'Results & Standings', icon: BarChart2, desc: 'Automatic standings, match history' }
  ];

  return (
    <section id="how-it-works" className="w-full py-16 lg:py-24 bg-background relative z-10 overflow-hidden scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight">Everything in one place.</h2>
          <p className="text-text-secondary mt-4 text-lg">From creation to final whistle — managed end to end.</p>
        </div>

        <div className="relative">
          {/* Connecting Line Desktop */}
          <div className="hidden lg:block absolute top-[44px] left-[10%] right-[10%] h-[2px] bg-surface" />
          {/* Connecting Line Mobile */}
          <div className="lg:hidden absolute top-[10%] bottom-[10%] left-[39px] w-[2px] bg-surface" />

          <div className="flex flex-col lg:flex-row gap-12 lg:gap-4 justify-between relative z-10">
            {steps.map((step, i) => (
              <div key={i} className="flex lg:flex-col items-center lg:items-center text-left lg:text-center gap-6 lg:gap-4 lg:w-1/5 relative group">
                <div className="w-20 h-20 shrink-0 rounded-2xl bg-surface border border-border flex items-center justify-center relative shadow-card group-hover:border-primary/50 transition-colors">
                  <step.icon className="w-8 h-8 text-primary" />
                  <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-surface border border-border text-xs font-bold flex items-center justify-center text-text-muted group-hover:text-text-primary group-hover:border-primary/50 transition-colors">
                    {step.num}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary mb-1">{step.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed max-w-[200px] lg:mx-auto">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border text-xs sm:text-xs text-text-muted mb-8 tracking-wider">
            <span className="text-primary font-semibold uppercase">Auction Leagues:</span> Player Registration &rarr; Lot Draw &rarr; Auction &rarr; Squad
          </div>
          <Link 
            href="/organizer/tournaments/new"
            className="text-primary font-bold hover:text-primary-hover flex items-center gap-1"
          >
            Create Tournament &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
