'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { Loader2 } from 'lucide-react';

export function PlayerRegistrationForm({ userId, tournamentId, initialProfile }: { userId: string, tournamentId: string, initialProfile: any }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialProfile?.photo_path || null);
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const displayName = formData.get('displayName') as string;
    const phone = formData.get('phone') as string;
    const dob = formData.get('dob') as string;
    const place = formData.get('place') as string;
    const height = formData.get('height') as string;
    const primaryPosition = formData.get('primaryPosition') as string;
    const secondaryPosition = formData.get('secondaryPosition') as string;

    try {
      const { error: rpcError } = await supabase.rpc('submit_player_registration', {
        p_tournament_id: tournamentId,
        p_display_name: displayName,
        p_primary_position: primaryPosition,
        p_photo_path: photoUrl || undefined,
        p_date_of_birth: dob || undefined,
        p_phone: phone || undefined,
        p_place: place || undefined,
        p_height_cm: height ? parseFloat(height) : undefined,
        p_secondary_position: secondaryPosition || undefined,
        p_playing_history: initialProfile?.playing_history || undefined
      });

      if (rpcError) throw rpcError;
      
      // Force Next.js to refresh the RSC payload for this route so the 
      // page.tsx layout switches from the Form to the Success UI.
      router.refresh();
    } catch (err: any) {
      console.error('Registration error:', err);
      
      if (err?.code === '23503') {
        setError('Unable to submit registration. Your profile is not fully initialized. Please try signing out and signing back in.');
      } else if (err?.code && typeof err.code === 'string' && err.code.startsWith('PT')) {
        setError(err.message || 'Validation failed.');
      } else {
        setError(err?.message || 'Failed to submit registration. Please try again.');
      }
      
      setPending(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const positions = [
    'SETTER', 'LIBERO', 'MIDDLE_BLOCKER', 
    'OUTSIDE_HITTER', 'OPPOSITE', 'UNIVERSAL'
  ];

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col gap-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-2">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Registration Form</h2>
        <p className="text-sm text-slate-500 mt-1">Please provide your player details to register for this tournament.</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg">
          {error}
        </div>
      )}

      <ImageUpload 
        userId={userId} 
        bucket="avatars" 
        currentPhotoUrl={photoUrl}
        onUploadSuccess={(url, path) => setPhotoUrl(path)}
        label="Profile Photo"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
          <input 
            id="displayName"
            name="displayName"
            type="text"
            required
            defaultValue={initialProfile?.display_name || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="dob" className="text-sm font-medium text-slate-700 dark:text-slate-300">Date of Birth</label>
          <input 
            id="dob"
            name="dob"
            type="date"
            defaultValue={initialProfile?.date_of_birth || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
          <input 
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialProfile?.phone || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place" className="text-sm font-medium text-slate-700 dark:text-slate-300">Club / Location</label>
          <input 
            id="place"
            name="place"
            type="text"
            defaultValue={initialProfile?.place || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="height" className="text-sm font-medium text-slate-700 dark:text-slate-300">Height (cm)</label>
          <input 
            id="height"
            name="height"
            type="number"
            step="0.01"
            defaultValue={initialProfile?.height_cm || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="primaryPosition" className="text-sm font-medium text-slate-700 dark:text-slate-300">Primary Position *</label>
          <select 
            id="primaryPosition"
            name="primaryPosition"
            required
            defaultValue={initialProfile?.primary_position || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="" disabled>Select a position...</option>
            {positions.map(p => (
              <option key={p} value={p}>{p.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="secondaryPosition" className="text-sm font-medium text-slate-700 dark:text-slate-300">Secondary Position</label>
          <select 
            id="secondaryPosition"
            name="secondaryPosition"
            defaultValue={initialProfile?.secondary_position || ''}
            className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">None</option>
            {positions.map(p => (
              <option key={p} value={p}>{p.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-6 flex items-center justify-center gap-2 p-3.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}
        {pending ? 'Submitting...' : 'Submit Registration'}
      </button>
    </form>
  );
}
