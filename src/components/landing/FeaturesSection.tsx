import React from 'react';
import { Trophy, Users, UserCircle, DollarSign, Shuffle, Calendar, Edit3, BarChart2, Palette, Smartphone } from 'lucide-react';
import { HeroMatchScoreCard } from './HeroMatchScoreCard';

export function FeaturesSection() {
  const features = [
    { icon: Trophy, title: 'Tournament Management' },
    { icon: Users, title: 'Team & Player Registration' },
    { icon: UserCircle, title: 'Player Profiles' },
    { icon: DollarSign, title: 'Live Auction' },
    { icon: Shuffle, title: 'Digital Lot Draw' },
    { icon: Calendar, title: 'Fixtures & Schedule' },
    { icon: Edit3, title: 'Volleyball Scoring' },
    { icon: BarChart2, title: 'Standings & Results' },
    { icon: Palette, title: 'Tournament Branding' },
    { icon: Smartphone, title: 'Mobile-First PWA' }
  ];

  return (
    <section id="features" className="w-full py-16 lg:py-24 bg-[#0d0d13] relative z-10 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Built for serious volleyball.</h2>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Featured Tile */}
          <div className="w-full lg:w-2/5 rounded-3xl bg-[#131318] border border-white/5 p-8 flex flex-col justify-between overflow-hidden relative shadow-2xl group">
            <div className="absolute inset-0 bg-gradient-to-br from-live/5 to-transparent opacity-50" />
            <div className="relative z-10 mb-12">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-live bg-live/10 border border-live/20 rounded-full inline-flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                Live Experience
              </span>
              <h3 className="text-2xl font-bold text-white mb-2">Live Tournament Experience</h3>
              <p className="text-text-secondary leading-relaxed">
                Follow the action as it happens with live scores, set progress, and real-time match timelines.
              </p>
            </div>
            
            <div className="relative z-10 w-full flex justify-center lg:justify-start transition-transform duration-500 group-hover:scale-105 origin-bottom-left">
              <HeroMatchScoreCard />
            </div>
          </div>

          {/* Icon Grid */}
          <div className="w-full lg:w-3/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <div key={i} className="bg-[#131318] border border-white/5 rounded-2xl p-6 flex items-center gap-4 hover:border-white/10 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors shrink-0">
                  <feature.icon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                </div>
                <h4 className="font-semibold text-text-primary text-base">{feature.title}</h4>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
