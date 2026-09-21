import { getUser, createClient } from '@/lib/supabase/server';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { LandingNav } from './LandingNav';

export async function PublicLandingNav() {
  const supabase = await createClient();
  const { data: { user } } = await getUser();

  if (!user) return <LandingNav />;

  const [{ data: profile }, { data: organizerMemberships }, { data: playerProfile }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_path').eq('id', user.id).single(),
    supabase.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'ACTIVE').limit(1),
    supabase.from('player_profiles').select('photo_path').eq('user_id', user.id).maybeSingle(),
  ]);

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Tourny User';
  const photoUrl = resolvePublicStorageUrl(supabase, 'avatars', playerProfile?.photo_path || profile?.avatar_path);

  return (
    <LandingNav
      isAuthenticated
      isOrganizer={Boolean(organizerMemberships?.length)}
      userProfile={{ full_name: fullName, photo_url: photoUrl }}
    />
  );
}
