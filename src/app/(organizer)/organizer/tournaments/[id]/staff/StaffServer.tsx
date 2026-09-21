import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { StaffManager } from './StaffManager';

export async function StaffServer({ tournamentId }: { tournamentId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_tournament_staff', { p_tournament_id: tournamentId });

  if (error) notFound();

  const staff = (data ?? []).map((person) => ({
    ...person,
    avatarUrl: person.avatar_path
      ? supabase.storage.from('avatars').getPublicUrl(person.avatar_path).data.publicUrl
      : null,
  }));

  return <StaffManager tournamentId={tournamentId} initialStaff={staff} />;
}
