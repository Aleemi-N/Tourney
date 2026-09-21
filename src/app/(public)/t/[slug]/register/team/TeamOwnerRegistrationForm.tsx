'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { Loader2 } from 'lucide-react';

export function TeamOwnerRegistrationForm({ userId, tournamentId, tournamentSlug }: { userId: string, tournamentId: string, tournamentSlug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

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
      
      // Navigate to the actual tournament page — slug comes from the tournament record
      router.push(`/t/${tournamentSlug}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit application');
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col gap-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-2">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Team Application Form</h2>
        <p className="text-sm text-slate-500 mt-1">Please provide details for your proposed team.</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg">
          {error}
        </div>
      )}

      <ImageUpload 
        userId={userId} 
        bucket="logos" 
        currentPhotoUrl={logoUrl}
        onUploadSuccess={(url, path) => setLogoUrl(path)}
        label="Team Logo"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor="proposedTeamName" className="text-sm font-medium text-slate-700 dark:text-slate-300">Proposed Team Name *</label>
          <input 
            id="proposedTeamName"
            name="proposedTeamName"
            type="text"
            required
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="teamShortName" className="text-sm font-medium text-slate-700 dark:text-slate-300">Short Name (3-4 letters)</label>
          <input 
            id="teamShortName"
            name="teamShortName"
            type="text"
            maxLength={4}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place" className="text-sm font-medium text-slate-700 dark:text-slate-300">City / Location</label>
          <input 
            id="place"
            name="place"
            type="text"
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Contact Email</label>
          <input 
            id="email"
            name="email"
            type="email"
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Contact Phone</label>
          <input 
            id="phone"
            name="phone"
            type="tel"
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-6 flex items-center justify-center gap-2 p-3.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}
        {pending ? 'Submitting...' : 'Submit Application'}
      </button>
    </form>
  );
}
