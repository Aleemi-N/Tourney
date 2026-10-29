import { getUser, createClient } from '@/lib/api/server';
import { resolvePublicStorageUrl } from '@/lib/api/storage-url';
import { LandingNav } from './LandingNav';

export async function PublicLandingNav() {
  const api = await createClient();
  const { data: { user } } = await getUser();

  if (!user) return <LandingNav />;

  const [{ data: profile }, { data: organizerMemberships }, { data: createdTournament }, { data: playerProfile }] = await Promise.all([
    api.from('profiles').select('full_name, avatar_path').eq('id', user.id).single(),
    api.from('tournament_members').select('tournament_id').eq('user_id', user.id).eq('role', 'ORGANIZER').eq('status', 'ACTIVE').limit(1),
    api.from('tournaments').select('id').eq('created_by', user.id).limit(1).maybeSingle(),
    api.from('player_profiles').select('photo_path').eq('user_id', user.id).maybeSingle(),
  ]);

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Tourny User';
  const photoUrl = resolvePublicStorageUrl(api, 'avatars', playerProfile?.photo_path || profile?.avatar_path);

  return (
    <LandingNav
      isAuthenticated
      isOrganizer={Boolean(organizerMemberships?.length || createdTournament)}
      userProfile={{ full_name: fullName, photo_url: photoUrl }}
    />
  );
}
