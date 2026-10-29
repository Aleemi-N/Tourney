import { createClient } from '@/lib/api/server';
import { notFound } from 'next/navigation';
import { StaffManager } from './StaffManager';

export async function StaffServer({ tournamentId }: { tournamentId: string }) {
  const api = await createClient();
  const { data, error } = await api.rpc('get_tournament_staff', { p_tournament_id: tournamentId });

  if (error) notFound();

  const staff = (data ?? []).map((person) => ({
    ...person,
    avatarUrl: person.avatar_path
      ? api.storage.from('avatars').getPublicUrl(person.avatar_path).data.publicUrl
      : null,
  }));

  return <StaffManager tournamentId={tournamentId} initialStaff={staff} />;
}
