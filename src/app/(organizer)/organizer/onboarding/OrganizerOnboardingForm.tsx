'use client';

import { useState } from 'react';
import { completeOrganizerOnboarding } from '@/app/actions/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export function OrganizerOnboardingForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await completeOrganizerOnboarding(formData);

    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md bg-surface p-6 rounded-2xl shadow-sm border border-border">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Become an Organizer</h1>
      <p className="text-text-secondary text-sm mb-4">Set up your primary organization to start creating tournaments.</p>

      {error && (
        <div className="p-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      <input type="hidden" name="nextUrl" value={nextUrl} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary" htmlFor="orgName">Organization Name</label>
        <input 
          id="orgName"
          name="orgName" 
          type="text" 
          required 
          className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary" htmlFor="orgSlug">Organization URL Slug</label>
        <input 
          id="orgSlug"
          name="orgSlug" 
          type="text" 
          pattern="^[a-z0-9-]+$"
          title="Lowercase letters, numbers, and hyphens only"
          required 
          className="p-3 rounded-lg border border-border bg-surface-muted text-text-primary focus:outline-none focus:border-primary transition-colors"
        />
        <span className="text-xs text-text-muted mt-1">e.g., my-sports-org</span>
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-4 p-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors flex justify-center items-center h-12"
      >
        {pending ? 'Setting up...' : 'Create Organization'}
      </button>

      <div className="mt-2 text-center">
        <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
          Cancel and return home
        </Link>
      </div>
    </form>
  );
}
