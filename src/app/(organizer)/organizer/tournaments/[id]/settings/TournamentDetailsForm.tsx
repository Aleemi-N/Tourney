'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';

type TournamentDetails = {
  id: string;
  name: string;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  format: string;
  league_mode: string | null;
};

type RpcResult = { ok?: boolean; code?: string };
const detailErrors: Record<string, string> = {
  INVALID_NAME: 'Tournament name is required and must be 120 characters or fewer.',
  INVALID_VENUE: 'Venue must be 200 characters or fewer.',
  INVALID_DESCRIPTION: 'Description must be 2,000 characters or fewer.',
  INVALID_DATE_RANGE: 'End date cannot be before the start date.',
  INVALID_LOGO_PATH: 'The selected logo path is invalid.',
  UNAUTHORIZED: 'You do not have permission to update this tournament.',
};

export function TournamentDetailsForm({ tournament, initialLogoPath, initialLogoUrl }: { tournament: TournamentDetails; initialLogoPath: string | null; initialLogoUrl: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(tournament.name);
  const [venue, setVenue] = useState(tournament.venue ?? '');
  const [startDate, setStartDate] = useState(tournament.start_date ?? '');
  const [endDate, setEndDate] = useState(tournament.end_date ?? '');
  const [description, setDescription] = useState(tournament.description ?? '');
  const [logoPath, setLogoPath] = useState<string | null>(initialLogoPath);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => () => {
    if (logoUrl?.startsWith('blob:')) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  function chooseLogo(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Use a JPG, PNG, or WebP image.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Logo must be 2 MB or smaller.' });
      return;
    }
    setLogoFile(file);
    setLogoUrl(URL.createObjectURL(file));
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const previousLogoPath = logoPath;
    let nextLogoPath = logoPath;
    let uploadedPath: string | null = null;

    try {
      if (logoFile) {
        const extension = logoFile.name.split('.').pop()?.toLowerCase() || 'webp';
        uploadedPath = `${tournament.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(uploadedPath, logoFile, { contentType: logoFile.type, upsert: false });
        if (uploadError) throw new Error('Logo upload failed. Please try again.');
        nextLogoPath = uploadedPath;
      }

      const { data, error } = await supabase.rpc('update_tournament_details', {
        p_tournament_id: tournament.id,
        p_name: name,
        p_venue: venue || undefined,
        p_start_date: startDate || undefined,
        p_end_date: endDate || undefined,
        p_description: description || undefined,
        p_logo_path: nextLogoPath || undefined,
      });
      const result = data as RpcResult | null;
      if (error || !result?.ok) throw new Error(result?.code ? (detailErrors[result.code] ?? 'Unable to save tournament details.') : 'Unable to save tournament details.');

      if (previousLogoPath && previousLogoPath !== nextLogoPath) await supabase.storage.from('logos').remove([previousLogoPath]);
      setLogoPath(nextLogoPath);
      setLogoFile(null);
      if (nextLogoPath) setLogoUrl(supabase.storage.from('logos').getPublicUrl(nextLogoPath).data.publicUrl);
      setMessage({ type: 'success', text: 'Tournament details updated.' });
      router.refresh();
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('logos').remove([uploadedPath]);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save tournament details.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-4 py-5 sm:px-6"><h2 className="text-lg font-semibold text-text-primary">Tournament Details</h2><p className="mt-1 text-sm text-text-secondary">Update the tournament&apos;s basic information and branding.</p></div>
      <div className="space-y-6 p-4 sm:p-6">
        {message && <div role="status" className={`rounded-lg border p-3 text-sm ${message.type === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/10 text-success'}`}>{message.text}</div>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background">
            {logoUrl ? <Image src={logoUrl} alt="Tournament logo preview" fill sizes="96px" className="object-contain p-2" unoptimized /> : <PhotoIcon className="h-9 w-9 text-text-muted" />}
          </div>
          <div className="min-w-0 space-y-2">
            <label className="inline-flex cursor-pointer rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-text-primary hover:border-primary/50">{logoUrl ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseLogo(event.target.files?.[0])} /></label>
            {logoUrl && <button type="button" onClick={() => { setLogoFile(null); setLogoPath(null); setLogoUrl(null); }} className="ml-2 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"><TrashIcon className="h-4 w-4" /> Remove</button>}
            <p className="text-xs text-text-muted">JPG, PNG, or WebP. Maximum 2 MB.</p>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-text-primary sm:col-span-2">Tournament Name<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" /></label>
          <label className="text-sm font-medium text-text-primary sm:col-span-2">Location / Venue<input maxLength={200} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="SFA Ground, Edava" className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" /></label>
          <label className="text-sm font-medium text-text-primary">Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-text-primary [color-scheme:dark] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" /></label>
          <label className="text-sm font-medium text-text-primary">End Date<input type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-text-primary [color-scheme:dark] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" /></label>
          <label className="text-sm font-medium text-text-primary sm:col-span-2">Description<textarea maxLength={2000} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-4 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" /></label>
        </div>
        <div className="rounded-lg border border-border bg-background p-4 text-sm"><span className="text-text-secondary">Format:</span> <span className="font-medium text-text-primary">{tournament.format}</span>{tournament.league_mode && <><span className="mx-2 text-text-muted">·</span><span className="text-text-secondary">League mode:</span> <span className="font-medium text-text-primary">{tournament.league_mode}</span></>}</div>
        <div className="flex justify-end"><button disabled={saving} className="min-h-11 rounded-lg bg-primary px-6 py-2 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{saving ? 'Saving…' : 'Save Tournament Details'}</button></div>
      </div>
    </form>
  );
}
