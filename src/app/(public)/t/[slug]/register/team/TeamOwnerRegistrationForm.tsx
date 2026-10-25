'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { Loader2 } from 'lucide-react';

export function TeamOwnerRegistrationForm({ userId, tournamentId }: { userId: string, tournamentId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const fieldClass = 'min-h-11 min-w-0 w-full rounded-xl border border-border bg-surface-muted  px-3 py-2.5 text-text-primary scheme-dark transition-all duration-300 placeholder:text-text-muted focus:border-primary focus:bg-surface-raised focus:outline-none focus:ring-4 focus:ring-primary/20 hover:border-border-strong';
  const labelClass = 'text-sm font-medium text-text-secondary ml-1';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const proposedTeamName = formData.get('proposedTeamName') as string;
    const teamShortName = formData.get('teamShortName') as string;
    const place = formData.get('place') as string;
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;

    if (!logoUrl) {
      setError('Team Logo is required.');
      setPending(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc('submit_team_owner_application', {
        p_tournament_id: tournamentId,
        p_proposed_team_name: proposedTeamName,
        p_team_short_name: teamShortName || undefined,
        p_logo_path: logoUrl || undefined,
        p_place: place || undefined,
        p_phone: phone || undefined,
        p_email: email || undefined
      });

      if (rpcError) throw rpcError;
      
      // Force Next.js to refresh the RSC payload for this route so the 
      // page.tsx layout switches from the Form to the Success UI.
      router.refresh();
    } catch (err: any) {
      console.error('Registration error:', err);
      
      if (err?.code === '23503') {
        setError('Unable to submit application. Your profile is not fully initialized. Please try signing out and signing back in.');
      } else if (err?.code && typeof err.code === 'string' && err.code.startsWith('PT')) {
        setError(err.message || 'Validation failed.');
      } else {
        setError(err?.message || 'Failed to submit application. Please try again.');
      }
      
      setPending(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl border border-glass-border bg-surface-raised p-5 shadow-card dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] sm:p-8 transition-all duration-500 hover:border-border-strong">
      <div className="mb-2 border-b border-border pb-4">
        <h2 className="text-xl font-semibold text-text-primary">Team Application Form</h2>
        <p className="mt-1 text-sm text-text-secondary">Please provide details for your proposed team.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <ImageUpload 
        userId={userId} 
        bucket="logos" 
        currentPhotoUrl={logoUrl}
        onUploadSuccess={(url, path) => setLogoUrl(path)}
        label="Team Logo *"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor="proposedTeamName" className={labelClass}>Proposed Team Name *</label>
          <input 
            id="proposedTeamName"
            name="proposedTeamName"
            type="text"
            required
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="teamShortName" className={labelClass}>Short Name (3-4 letters)</label>
          <input 
            id="teamShortName"
            name="teamShortName"
            type="text"
            maxLength={4}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place" className={labelClass}>City / Location</label>
          <input 
            id="place"
            name="place"
            type="text"
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={labelClass}>Contact Email</label>
          <input 
            id="email"
            name="email"
            type="email"
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClass}>Contact Phone</label>
          <input 
            id="phone"
            name="phone"
            type="tel"
            className={fieldClass}
          />
        </div>
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary p-3.5 font-semibold text-primary-foreground transition-all duration-300 hover:shadow-primary/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}
        {pending ? 'Submitting...' : 'Submit Application'}
      </button>
    </form>
  );
}
