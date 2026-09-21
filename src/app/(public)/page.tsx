import React from 'react';
import { LandingNav } from '@/components/landing/LandingNav';
import { createClient } from '@/lib/supabase/server';
import { HeroSection } from '@/components/landing/HeroSection';
import { TournamentDiscoverySection } from '@/components/landing/TournamentDiscoverySection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { RoleExperienceSection } from '@/components/landing/RoleExperienceSection';
import { ProductShowcaseSection } from '@/components/landing/ProductShowcaseSection';
import { CtaSection } from '@/components/landing/CtaSection';
import { LandingFooter } from '@/components/landing/LandingFooter';

export const metadata = {
  title: 'Tournament Platform | Run Your Tournament. Own Every Moment.',
  description: 'Create and manage volleyball tournaments — registrations, teams, players, lot draw, auction, live scoring and standings — from one platform.',
};

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let isOrganizer = false;
  let userProfile = null;
  if (user) {
    const { data: orgs } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1);
    
    isOrganizer = !!(orgs && orgs.length > 0);
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    
    userProfile = profile || { full_name: user.user_metadata?.full_name || 'User' };
  }

  return (
    <div className="dark min-h-screen bg-[#09090e] text-text-primary selection:bg-primary/30 selection:text-white">
      <LandingNav isAuthenticated={!!user} isOrganizer={isOrganizer} userProfile={userProfile} />
      <main>
        <HeroSection />
        <TournamentDiscoverySection />
        <HowItWorksSection />
        <FeaturesSection />
        <RoleExperienceSection />
        <ProductShowcaseSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
