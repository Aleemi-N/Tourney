'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/api/client';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { Loader2 } from 'lucide-react';
import { VOLLEYBALL_POSITIONS, formatVolleyballPosition } from '@/lib/volleyball-positions';

export function PlayerRegistrationForm({ userId, tournamentId, initialProfile }: { userId: string, tournamentId: string, initialProfile: any }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialProfile?.photo_path || null);
  const [primaryPosition, setPrimaryPosition] = useState(initialProfile?.primary_position || '');
  const [secondaryPosition, setSecondaryPosition] = useState(initialProfile?.secondary_position || '');
  const api = createClient();
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
    const submittedPrimaryPosition = formData.get('primaryPosition') as string;
    const submittedSecondaryPosition = formData.get('secondaryPosition') as string;
    const jerseyName = formData.get('jerseyName') as string;
    const jerseyNumber = formData.get('jerseyNumber') as string;
    const jerseySize = formData.get('jerseySize') as string;

    if (submittedSecondaryPosition && submittedSecondaryPosition === submittedPrimaryPosition) {
      setError('Secondary Position must be different from Primary Position.');
      setPending(false);
      return;
    }

    if (!photoUrl) {
      setError('Profile Photo is required.');
      setPending(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      const { error: rpcError } = await api.rpc('submit_player_registration', {
        p_tournament_id: tournamentId,
        p_display_name: displayName,
        p_primary_position: submittedPrimaryPosition,
        p_photo_path: photoUrl || undefined,
        p_date_of_birth: dob || undefined,
        p_phone: phone || undefined,
        p_place: place || undefined,
        p_height_cm: height ? parseFloat(height) : undefined,
        p_secondary_position: submittedSecondaryPosition || undefined,
        p_playing_history: initialProfile?.playing_history || undefined,
        p_jersey_name: jerseyName || undefined,
        p_jersey_number: jerseyNumber || undefined,
        p_jersey_size: jerseySize || undefined,
      });

      if (rpcError) throw rpcError;

      const previousPhotoPath = initialProfile?.photo_path as string | null | undefined;
      if (previousPhotoPath && photoUrl !== previousPhotoPath && previousPhotoPath.startsWith(`${userId}/`)) {
        const { error: cleanupError } = await api.storage.from('avatars').remove([previousPhotoPath]);
        if (cleanupError) console.error('Previous profile photo cleanup failed:', cleanupError);
      }
      
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

  const fieldClass = 'min-h-11 min-w-0 w-full rounded-xl border border-border bg-surface-muted  px-3 py-2.5 text-text-primary scheme-dark transition-all duration-300 placeholder:text-text-muted focus:border-primary focus:bg-surface-raised focus:outline-none focus:ring-4 focus:ring-primary/20 hover:border-border-strong';
  const labelClass = 'text-sm font-medium text-text-secondary ml-1';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl border border-glass-border bg-surface-raised p-5 shadow-card dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] sm:p-8 transition-all duration-500 hover:border-border-strong">
      <div className="mb-2 border-b border-border pb-4">
        <h2 className="text-xl font-semibold text-text-primary">Registration Form</h2>
        <p className="mt-1 text-sm text-text-secondary">Please provide your player details to register for this tournament.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <ImageUpload 
        userId={userId} 
        bucket="avatars" 
        currentPhotoUrl={photoUrl}
        onUploadSuccess={(url, path) => setPhotoUrl(path)}
        label="Profile Photo *"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className={labelClass}>Full Name *</label>
          <input 
            id="displayName"
            name="displayName"
            type="text"
            required
            defaultValue={initialProfile?.display_name || ''}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="dob" className={labelClass}>Date of Birth</label>
          <input 
            id="dob"
            name="dob"
            type="date"
            defaultValue={initialProfile?.date_of_birth || ''}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input 
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialProfile?.phone || ''}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place" className={labelClass}>Club / Location</label>
          <input 
            id="place"
            name="place"
            type="text"
            defaultValue={initialProfile?.place || ''}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="height" className={labelClass}>Height (cm)</label>
          <input 
            id="height"
            name="height"
            type="number"
            step="0.01"
            defaultValue={initialProfile?.height_cm || ''}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="primaryPosition" className={labelClass}>Primary Position *</label>
          <select 
            id="primaryPosition"
            name="primaryPosition"
            required
            value={primaryPosition}
            onChange={(event) => {
              const nextPrimary = event.target.value;
              setPrimaryPosition(nextPrimary);
              if (secondaryPosition === nextPrimary) setSecondaryPosition('');
            }}
            className={fieldClass}
          >
            <option value="" disabled>Select a position...</option>
            {VOLLEYBALL_POSITIONS.map(p => (
              <option key={p} value={p}>{formatVolleyballPosition(p)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="secondaryPosition" className={labelClass}>Secondary Position (Optional)</label>
          <select 
            id="secondaryPosition"
            name="secondaryPosition"
            value={secondaryPosition}
            onChange={(event) => setSecondaryPosition(event.target.value)}
            className={fieldClass}
          >
            <option value="">None</option>
            {VOLLEYBALL_POSITIONS.filter((position) => position !== primaryPosition).map(p => (
              <option key={p} value={p}>{formatVolleyballPosition(p)}</option>
            ))}
          </select>
        </div>

        {/* Kit / Jersey Details */}
        <div className="col-span-1 md:col-span-2 pt-3 border-t border-border mt-1">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Jersey & Kit Preferences</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="jerseyName" className={labelClass}>Jersey Name (Back Print)</label>
              <input 
                id="jerseyName"
                name="jerseyName"
                type="text"
                maxLength={20}
                placeholder="e.g. ALEX"
                defaultValue={initialProfile?.jersey_name || ''}
                className={`${fieldClass} uppercase`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jerseyNumber" className={labelClass}>Jersey Number</label>
              <input 
                id="jerseyNumber"
                name="jerseyNumber"
                type="text"
                maxLength={4}
                placeholder="e.g. 10"
                defaultValue={initialProfile?.jersey_number || ''}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jerseySize" className={labelClass}>Jersey Size</label>
              <select 
                id="jerseySize"
                name="jerseySize"
                defaultValue={initialProfile?.jersey_size || ''}
                className={fieldClass}
              >
                <option value="">Select size...</option>
                {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={pending}
        className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary p-3.5 font-semibold text-primary-foreground transition-all duration-300 hover:shadow-primary/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}
        {pending ? 'Submitting...' : 'Submit Registration'}
      </button>
    </form>
  );
}
