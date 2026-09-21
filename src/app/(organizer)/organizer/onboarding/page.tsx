import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrganizerOnboardingForm } from './OrganizerOnboardingForm';

export const metadata: Metadata = { title: 'Organizer Setup' };

export default function OrganizerOnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<div className="w-full max-w-md h-96 bg-surface rounded-2xl animate-pulse" />}>
        <OrganizerOnboardingForm />
      </Suspense>
    </main>
  );
}
