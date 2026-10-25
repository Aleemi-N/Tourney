import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Choice, Field } from '@/components/form';
import { PhotoField } from '@/components/photo-field';
import { Body, Button, Card, ErrorText, Heading, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const POSITIONS = [
  { value: 'SETTER', label: 'Setter' }, { value: 'OUTSIDE_HITTER', label: 'Outside hitter' }, { value: 'MIDDLE_BLOCKER', label: 'Middle blocker' },
  { value: 'OPPOSITE', label: 'Opposite' }, { value: 'LIBERO', label: 'Libero' }, { value: 'UNIVERSAL', label: 'Universal' },
] as const;

/** Player registration for a tournament that is open for it. */
export default function PlayerRegistrationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, ready } = useAuth();
  const [tournament, setTournament] = useState<{ id: string; name: string; status: string } | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]['value'] | ''>('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [height, setHeight] = useState('');
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.from('public_tournament_view').select('id,name,status').eq('slug', slug).maybeSingle().then(({ data }) => setTournament(data as typeof tournament ?? null));
  }, [slug]);

  if (!ready || tournament === undefined) return <Screen><Loading /></Screen>;
  if (!tournament) return <Screen><Body muted>Tournament not found.</Body></Screen>;
  if (!session) {
    return <Screen><Heading>Register as a player</Heading><Body muted>Sign in first to register for {tournament.name}.</Body><Link href="/login" asChild><Button title="Sign in" onPress={() => {}} /></Link></Screen>;
  }
  if (done) {
    return <Screen><Card><Heading>Registration submitted</Heading><Body muted>The organizer will review it. You will see the result in your account.</Body></Card><Button title="Back" onPress={() => router.back()} /></Screen>;
  }
  if (tournament.status !== 'REGISTRATION') return <Screen><Body muted>{tournament.name} is not open for registration.</Body></Screen>;

  async function submit() {
    if (!tournament) return;
    setBusy(true);
    setError(null);
    const { error: e } = await api.rpc('submit_player_registration', {
      p_tournament_id: tournament.id, p_display_name: name.trim(), p_primary_position: position,
      p_photo_path: photo ?? undefined, p_date_of_birth: dob || undefined, p_phone: phone || undefined, p_place: place || undefined,
      p_height_cm: height ? parseFloat(height) : undefined,
    });
    setBusy(false);
    if (e) setError(e.message); else setDone(true);
  }

  return (
    <Screen>
      <Heading>Register for {tournament.name}</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PhotoField bucket="avatars" userId={session.user.id} label="Photo" path={photo} onChange={setPhoto} />
      <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
      <Choice label="Main position" value={position} options={[...POSITIONS]} onChange={setPosition} />
      <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="1999-05-05" keyboardType="numbers-and-punctuation" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Field label="City / place" value={place} onChangeText={setPlace} />
      <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
      <Button title="Submit registration" onPress={() => void submit()} loading={busy} disabled={!name.trim() || !position} />
    </Screen>
  );
}
