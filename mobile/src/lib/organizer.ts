import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type OrganizerTournament = { id: string; name: string; status: string };

/** Tournaments the user created or organizes (the same rule the web dashboard uses). */
export function useOrganizerTournaments(userId: string | undefined) {
  const [tournaments, setTournaments] = useState<OrganizerTournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return setTournaments(null);
    (async () => {
      const [members, created] = await Promise.all([
        api.from('tournament_members').select('tournament_id').eq('user_id', userId).eq('role', 'ORGANIZER').eq('status', 'ACTIVE'),
        api.from('tournaments').select('id,name,status').eq('created_by', userId),
      ]);
      if (members.error || created.error) return setError((members.error ?? created.error)!.message);
      const memberIds = (members.data ?? []).map((m) => m.tournament_id as string);
      const viaMembership = memberIds.length ? (await api.from('tournaments').select('id,name,status').in('id', memberIds)).data ?? [] : [];
      const all = new Map<string, OrganizerTournament>();
      for (const t of [...(created.data ?? []), ...viaMembership] as OrganizerTournament[]) all.set(t.id, t);
      setTournaments([...all.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, [userId]);

  return { tournaments, error };
}
