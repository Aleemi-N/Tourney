'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ImageUpload } from '@/components/forms/ImageUpload';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { VOLLEYBALL_POSITIONS, formatVolleyballPosition } from '@/lib/volleyball-positions';

export function ProfileForm({ userId, initialProfile }: { userId: string, initialProfile: any }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialProfile?.photo_path || null);
  const [primaryPosition, setPrimaryPosition] = useState(initialProfile?.primary_position || '');
  const [secondaryPosition, setSecondaryPosition] = useState(initialProfile?.secondary_position || '');
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);

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
      const { error: rpcError } = await supabase.rpc('update_player_profile', {
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
        const { error: cleanupError } = await supabase.storage.from('avatars').remove([previousPhotoPath]);
        if (cleanupError) console.error('Previous profile photo cleanup failed:', cleanupError);
      }
      
      setSuccess(true);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-border bg-surface-raised p-4 shadow-lg shadow-black/10 sm:gap-6 sm:p-6">
      
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      
      {success && (
        <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          Profile updated successfully.
        </div>
      )}

      <ImageUpload 
        userId={userId} 
        bucket="avatars" 
        currentPhotoUrl={photoUrl}
        onUploadSuccess={(url, path) => setPhotoUrl(path)} // We store path, not public URL in DB
        label="Profile Photo *"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className="text-sm font-medium text-text-secondary">Full Name *</label>
          <input 
            id="displayName"
            name="displayName"
            type="text"
            required
            defaultValue={initialProfile?.display_name || ''}
            className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="dob" className="text-sm font-medium text-text-secondary">Date of Birth</label>
          <input 
            id="dob"
            name="dob"
            type="date"
            defaultValue={initialProfile?.date_of_birth || ''}
            className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-text-secondary">Phone</label>
          <input 
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialProfile?.phone || ''}
            className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place" className="text-sm font-medium text-text-secondary">Club / Location</label>
          <input 
            id="place"
            name="place"
            type="text"
            defaultValue={initialProfile?.place || ''}
            className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="height" className="text-sm font-medium text-text-secondary">Height (cm)</label>
          <input 
            id="height"
            name="height"
            type="number"
            step="0.01"
            defaultValue={initialProfile?.height_cm || ''}
            className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="primaryPosition" className="text-sm font-medium text-text-secondary">Primary Position *</label>
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
            className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="" disabled>Select a position...</option>
            {VOLLEYBALL_POSITIONS.map(p => (
              <option key={p} value={p}>{formatVolleyballPosition(p)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="secondaryPosition" className="text-sm font-medium text-text-secondary">Secondary Position (Optional)</label>
          <select 
            id="secondaryPosition"
            name="secondaryPosition"
            value={secondaryPosition}
            onChange={(event) => setSecondaryPosition(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              <label htmlFor="jerseyName" className="text-sm font-medium text-text-secondary">Jersey Name (Back Print)</label>
              <input 
                id="jerseyName"
                name="jerseyName"
                type="text"
                maxLength={20}
                placeholder="e.g. ALEX"
                defaultValue={initialProfile?.jersey_name || ''}
                className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary placeholder:text-text-muted uppercase focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jerseyNumber" className="text-sm font-medium text-text-secondary">Jersey Number</label>
              <input 
                id="jerseyNumber"
                name="jerseyNumber"
                type="text"
                maxLength={4}
                placeholder="e.g. 10"
                defaultValue={initialProfile?.jersey_number || ''}
                className="min-h-11 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="jerseySize" className="text-sm font-medium text-text-secondary">Jersey Size</label>
              <select 
                id="jerseySize"
                name="jerseySize"
                defaultValue={initialProfile?.jersey_size || ''}
                className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
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
        className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
