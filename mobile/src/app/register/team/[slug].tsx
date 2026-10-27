import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Choice, Field } from '@/components/form';
import { FeeNotice, PaymentsDue } from '@/components/payments';
import { PhotoField } from '@/components/photo-field';
import { Body, Button, Card, ErrorText, Heading, Loading, Screen } from '@/components/ui';
import { SECOND, SWATCHES } from '@/lib/colors';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Profile = { id: string; name: string; short_name: string | null; logo_path: string | null; place: string | null; primary_color: string | null; secondary_color: string | null };


/** Team-owner application: name, logo and colours, optionally reusing one of the owner's teams. */
export default function TeamRegistrationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, ready } = useAuth();
  const [tournament, setTournament] = useState<{ id: string; name: string; status: string } | null | undefined>(undefined);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [place, setPlace] = useState('');
  const [primary, setPrimary] = useState('#4f46e5');
  const [secondary, setSecondary] = useState('#ffffff');
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.from('public_tournament_view').select('id,name,status').eq('slug', slug).maybeSingle().then(({ data }) => setTournament((data as typeof tournament) ?? null));
  }, [slug]);
  useEffect(() => {
    if (!session) return;
    api.from('team_profiles').select('id,name,short_name,logo_path,place,primary_color,secondary_color').eq('owner_user_id', session.user.id).order('name')
      .then(({ data }) => setProfiles((data as Profile[]) ?? []));
  }, [session]);

  function chooseProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    setName(p?.name ?? ''); setShortName(p?.short_name ?? ''); setPlace(p?.place ?? ''); setLogo(p?.logo_path ?? null);
    setPrimary(p?.primary_color ?? '#4f46e5'); setSecondary(p?.secondary_color ?? '#ffffff');
  }

  if (!ready || tournament === undefined) return <Screen><Loading /></Screen>;
  if (!tournament) return <Screen><Body muted>Tournament not found.</Body></Screen>;
  if (!session) {
    return <Screen><Heading>Apply with a team</Heading><Body muted>Sign in first to apply to {tournament.name}.</Body><Link href="/login" asChild><Button title="Sign in" onPress={() => {}} /></Link></Screen>;
  }
  if (done) return <Screen><Card><Heading>Application submitted</Heading><Body muted>The organizer will review it.</Body></Card><PaymentsDue tournamentId={tournament.id} title="Registration fee" /><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (tournament.status !== 'REGISTRATION') return <Screen><Body muted>{tournament.name} is not open for team applications.</Body></Screen>;

  async function submit() {
    if (!tournament) return;
    setBusy(true);
    setError(null);
    const { error: e } = await api.rpc('submit_team_owner_application', {
      p_tournament_id: tournament.id, p_proposed_team_name: name.trim(), p_team_short_name: shortName || undefined, p_logo_path: logo ?? undefined,
      p_place: place || undefined, p_primary_color: primary, p_secondary_color: secondary, p_team_profile_id: profileId || undefined,
    });
    setBusy(false);
    if (e) setError(e.message); else setDone(true);
  }

  return (
    <Screen>
      <Heading>Apply to {tournament.name}</Heading>
      <FeeNotice tournamentId={tournament.id} kind="TEAM" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {profiles.length > 0 ? (
        <Choice label="Use one of your teams" value={profileId} options={[{ value: '', label: 'New team' }, ...profiles.map((p) => ({ value: p.id, label: p.name }))]} onChange={chooseProfile} />
      ) : null}
      <PhotoField key={profileId} bucket="logos" userId={session.user.id} label="Team logo" path={logo} onChange={setLogo} />
      <Field label="Team name" value={name} onChangeText={setName} />
      <Field label="Short name (3-4 letters)" value={shortName} onChangeText={(v) => setShortName(v.slice(0, 4))} autoCapitalize="characters" />
      <Field label="City / place" value={place} onChangeText={setPlace} />
      <Choice label="Main colour" value={primary} options={SWATCHES} onChange={setPrimary} />
      <Choice label="Second colour" value={secondary} options={SECOND} onChange={setSecondary} />
      <Button title="Submit application" onPress={() => void submit()} loading={busy} disabled={!name.trim() || !logo} />
    </Screen>
  );
}
