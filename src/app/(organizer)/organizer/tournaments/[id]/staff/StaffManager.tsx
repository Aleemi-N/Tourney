'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

type StaffPerson = {
  user_id: string;
  display_name: string;
  email: string | null;
  roles: string[];
  membership_status: string;
  is_primary_organizer: boolean;
  avatarUrl: string | null;
};

type RpcResult = { ok?: boolean; code?: string };

const messages: Record<string, string> = {
  INVALID_EMAIL: 'Enter a valid email address.',
  ACCOUNT_NOT_FOUND: 'No Tourny account was found for this email.',
  ACCOUNT_NOT_AVAILABLE: 'This Tourny account is not available.',
  AMBIGUOUS_EMAIL: 'This email cannot be used for staff access. Contact support.',
  ROLE_ALREADY_ASSIGNED: 'This person already has that role.',
  ROLE_NOT_ASSIGNED: 'That role is no longer assigned.',
  PRIMARY_ORGANIZER_PROTECTED: "The primary organizer's Organizer role cannot be removed.",
  UNSUPPORTED_ROLE: 'Choose Organizer or Scorer.',
  UNAUTHORIZED: 'You do not have permission to manage this tournament.',
};

export function StaffManager({ tournamentId, initialStaff }: { tournamentId: string; initialStaff: StaffPerson[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ORGANIZER' | 'SCORER'>('SCORER');
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; role: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const explain = (result: RpcResult | null, fallback: string) =>
    result?.code ? (messages[result.code] ?? fallback) : fallback;

  async function addStaff(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('add_tournament_staff_role', {
      p_tournament_id: tournamentId,
      p_email: email,
      p_role: role,
    });
    const result = data as RpcResult | null;
    if (error || !result?.ok) {
      setMessage({ type: 'error', text: explain(result, 'Unable to add staff right now.') });
    } else {
      setEmail('');
      setShowAdd(false);
      setMessage({ type: 'success', text: `${role === 'ORGANIZER' ? 'Organizer' : 'Scorer'} role added.` });
      router.refresh();
    }
    setPending(false);
  }

  async function removeRole() {
    if (!confirmRemove) return;
    setPending(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('remove_tournament_staff_role', {
      p_tournament_id: tournamentId,
      p_target_user_id: confirmRemove.userId,
      p_role: confirmRemove.role,
    });
    const result = data as RpcResult | null;
    if (error || !result?.ok) {
      setMessage({ type: 'error', text: explain(result, 'Unable to remove this role right now.') });
    } else {
      setMessage({ type: 'success', text: 'Staff role removed.' });
      setConfirmRemove(null);
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="mt-6 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Tournament Staff</h1>
          <p className="mt-1 text-text-secondary">Manage organizers and scorers who can access this tournament.</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary-hover">
          <PlusIcon className="h-5 w-5" /> Add Staff
        </button>
      </div>

      {message && <div role="status" className={`mt-5 rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}>{message.text}</div>}

      {showAdd && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 className="font-semibold text-text-primary">Add tournament staff</h2><p className="mt-1 text-sm text-text-secondary">Enter the exact email used by an existing Tourny account.</p></div>
            <button type="button" aria-label="Close add staff form" onClick={() => setShowAdd(false)} className="rounded-lg p-1 text-text-secondary hover:bg-surface-muted"><XMarkIcon className="h-5 w-5" /></button>
          </div>
          <form onSubmit={addStaff} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <label className="min-w-0 text-sm font-medium text-text-primary">Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
            </label>
            <label className="text-sm font-medium text-text-primary">Role
              <select value={role} onChange={(e) => setRole(e.target.value as 'ORGANIZER' | 'SCORER')} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                <option value="SCORER">Scorer</option><option value="ORGANIZER">Organizer</option>
              </select>
            </label>
            <button disabled={pending} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{pending ? 'Adding…' : 'Confirm'}</button>
          </form>
        </section>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {initialStaff.map((person) => (
          <article key={person.user_id} className="min-w-0 rounded-2xl border border-border bg-surface p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-bold text-primary">
                {person.avatarUrl ? <Image src={person.avatarUrl} alt="" fill sizes="44px" className="object-cover" unoptimized /> : person.display_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0"><h2 className="truncate font-semibold text-text-primary">{person.display_name}</h2><p className="truncate text-sm text-text-secondary">{person.email}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {person.is_primary_organizer && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">Primary Organizer</span>}
              {person.roles.map((item) => <span key={item} className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{item === 'ORGANIZER' ? 'Organizer' : 'Scorer'}</span>)}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              {person.roles.map((item) => {
                const protectedRole = person.is_primary_organizer && item === 'ORGANIZER';
                return <button key={item} type="button" disabled={protectedRole || pending} onClick={() => setConfirmRemove({ userId: person.user_id, role: item })} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40">{protectedRole ? 'Organizer protected' : `Remove ${item === 'ORGANIZER' ? 'Organizer' : 'Scorer'}`}</button>;
              })}
            </div>
          </article>
        ))}
      </div>

      {confirmRemove && <div className="mt-6 rounded-xl border border-danger/30 bg-danger/10 p-4"><p className="text-sm text-text-primary">Remove only this {confirmRemove.role === 'ORGANIZER' ? 'Organizer' : 'Scorer'} role? Any other tournament role remains active.</p><div className="mt-3 flex gap-2"><button type="button" disabled={pending} onClick={removeRole} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Removing…' : 'Remove role'}</button><button type="button" onClick={() => setConfirmRemove(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary">Cancel</button></div></div>}
    </div>
  );
}
