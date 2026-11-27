import React from 'react';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeatureMarquee } from '@/components/landing/FeatureMarquee';
import { TournamentDiscoverySection } from '@/components/landing/TournamentDiscoverySection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { RoleExperienceSection } from '@/components/landing/RoleExperienceSection';
import { AppDownloadSection } from '@/components/landing/AppDownloadSection';
import { CtaSection } from '@/components/landing/CtaSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingMotionConfig } from '@/components/landing/LandingMotion';

export const metadata = {
  title: { absolute: 'Tourny — Run the tournament. Own every point.' },
  description: 'Create and run volleyball tournaments — registrations, live player auctions, lot draw, fixtures, point-by-point live scoring, standings and certificates — on the web and the Android app.',
};

export default async function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-text-primary selection:bg-primary/30 selection:text-text-primary">
      <PublicLandingNav />
      <LandingMotionConfig>
        <main>
          <HeroSection />
          <FeatureMarquee />
          <TournamentDiscoverySection />
          <HowItWorksSection />
          <FeaturesSection />
          <RoleExperienceSection />
          <AppDownloadSection />
          <CtaSection />
        </main>
      </LandingMotionConfig>
      <LandingFooter />
    </div>
  );
}
