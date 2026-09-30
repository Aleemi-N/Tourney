import React from 'react';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
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
  return (
    <div className="dark min-h-screen bg-[#09090e] text-text-primary selection:bg-primary/30 selection:text-white">
      <PublicLandingNav />
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
 
 
