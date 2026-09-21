import React from 'react';
import { Shield, Layers, Star, Play, Check } from 'lucide-react';

export function RoleExperienceSection() {
  const roles = [
    {
      title: 'Organizer',
      icon: Shield,
      color: 'text-primary',
      borderColor: 'border-primary/20',
      bgColor: 'bg-primary/5',
      caps: ['Create tournaments', 'Manage participants', 'Control operations']
    },
    {
      title: 'Team Owner',
      icon: Layers,
      color: 'text-[#a5b4fc]',
      borderColor: 'border-[#a5b4fc]/20',
      bgColor: 'bg-[#a5b4fc]/5',
      caps: ['Register team', 'Manage roster', 'Auction & squad']
    },
    {
      title: 'Player',
      icon: Star,
      color: 'text-info',
      borderColor: 'border-info/20',
      bgColor: 'bg-info/5',
      caps: ['Reusable profile', 'Tournament registration', 'Track status']
    },
    {
      title: 'Spectator',
      icon: Play,
      color: 'text-success',
      borderColor: 'border-success/20',
      bgColor: 'bg-success/5',
      caps: ['Live scores', 'Fixtures', 'Standings']
    }
  ];

  return (
    <section className="w-full py-16 lg:py-24 bg-[#09090e] relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">One platform. Every perspective.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {roles.map((role, i) => (
            <div key={i} className={`bg-[#131318] rounded-3xl p-8 border ${role.borderColor} shadow-lg relative overflow-hidden group hover:border-opacity-40 transition-colors h-full flex flex-col`}>
              <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${role.bgColor} blur-2xl group-hover:scale-150 transition-transform duration-700`} />
              
              <div className="relative z-10 flex-1 flex flex-col">
                <div className={`w-12 h-12 rounded-2xl ${role.bgColor} flex items-center justify-center mb-6`}>
                  <role.icon className={`w-6 h-6 ${role.color}`} />
                </div>
                
                <h3 className="text-xl font-bold text-white mb-6">{role.title}</h3>
                
                <ul className="space-y-4">
                  {role.caps.map((cap, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <div className={`mt-0.5 rounded-full p-0.5 ${role.bgColor}`}>
                        <Check className={`w-3 h-3 ${role.color}`} />
                      </div>
                      <span className="text-sm text-text-secondary leading-snug">{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
