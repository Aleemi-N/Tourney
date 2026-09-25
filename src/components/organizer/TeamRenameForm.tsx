'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function TeamRenameForm({ teamId, currentName }: { teamId: string; currentName: string }) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setMessage('');
    const { data, error } = await createClient().rpc('rename_tournament_team', { p_team_id: teamId, p_name: name });
    setPending(false);
    if (error) return setMessage(error.message);
    const result = data as { name?: string; renamed?: boolean } | null;
    if (result?.name) setName(result.name);
    setMessage(result?.renamed ? 'Team renamed.' : 'Name unchanged.'); router.refresh();
  }
  return <form onSubmit={submit} className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`team-name-${teamId}`}>Team name</label><input id={`team-name-${teamId}`} value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} className="min-h-10 min-w-48 rounded-lg border border-border bg-background px-3 text-sm font-bold text-text-primary" /><button disabled={pending || name.trim() === currentName} className="min-h-10 rounded-lg border border-border px-3 text-xs font-bold text-text-secondary disabled:opacity-40">{pending ? 'Saving…' : 'Rename'}</button>{message ? <span role="status" className="w-full text-xs text-text-secondary">{message}</span> : null}</form>;
}
