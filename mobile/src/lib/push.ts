import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PUSH_KEY } from '@/lib/push-token';

// Push notifications (match started, auction on the block, outbid, lot draw turn). The server queues
// messages in push_outbox and the API sends them to the Expo push token this device registers here.
// Remote push needs a development or store build (Expo Go on Android does not receive it) and an EAS project id.

const supported = Platform.OS !== 'web';

/** Show a notification banner even while the app is open. Call once at startup. */
export function setupNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

type PushData = { kind?: string; matchId?: string; teamId?: string; tournamentId?: string };

/** Open the screen a notification is about. */
export function openFromNotification(data: PushData | undefined) {
  if (!data?.kind) return;
  if ((data.kind === 'MATCH_LIVE' || data.kind === 'MATCH_FINAL' || data.kind === 'MATCH_SCHEDULE') && data.matchId) router.push({ pathname: '/match/[id]', params: { id: data.matchId } });
  else if ((data.kind === 'AUCTION_PLAYER_LIVE' || data.kind === 'AUCTION_OUTBID') && data.teamId) router.push({ pathname: '/owner/team/[teamId]/auction', params: { teamId: data.teamId } });
  else if (data.kind === 'ANNOUNCEMENT' && data.tournamentId) {
    api.from('public_tournament_view').select('slug').eq('id', data.tournamentId).maybeSingle().then(({ data: row }) => { if (row?.slug) router.push({ pathname: '/t/[slug]', params: { slug: row.slug as string } }); });
  } else if (data.kind === 'LOT_TURN' && data.teamId) router.push({ pathname: '/owner/team/[teamId]', params: { teamId: data.teamId } });
}

/** Routes taps on notifications, including the one that launched the app. Mount once under the router. */
export function useNotificationTaps() {
  useEffect(() => {
    if (!supported) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => openFromNotification(response.notification.request.content.data as PushData));
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromNotification(response.notification.request.content.data as PushData);
    }).catch(() => {});
    return () => sub.remove();
  }, []);
}

async function deviceToken(): Promise<string> {
  if (!Device.isDevice) throw new Error('Push notifications need a real phone.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('This build has no EAS project id yet, so it cannot receive push notifications.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Tourny', importance: Notifications.AndroidImportance.HIGH });
  }
  let status = (await Notifications.getPermissionsAsync()).status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Notifications are turned off for Tourny in the phone settings.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

const platform = Platform.OS === 'ios' ? 'ios' : 'android';

/** Gets permission and a push token, registers the device (signed in or not) and remembers the token. */
async function registerDevice(): Promise<string> {
  const token = await deviceToken();
  const { error } = await api.rpc('register_push_token', { p_token: token, p_platform: platform });
  if (error) throw new Error(error.message);
  await AsyncStorage.setItem(PUSH_KEY, token);
  return token;
}

/** Whether this device gets notifications, with switches for the Account screen. Works signed out too. */
export function usePush() {
  const { session } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the registration fresh (and linked to the user after signing in) once notifications were turned on.
  useEffect(() => {
    if (!supported) return;
    (async () => {
      const stored = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
      setEnabled(stored !== null);
      if (!stored) return;
      try { await registerDevice(); } catch { /* offline or permission revoked: the switch stays as the user left it */ }
    })();
  }, [session]);

  const enable = useCallback(async () => {
    setBusy(true); setError(null);
    try { await registerDevice(); setEnabled(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not turn on notifications.'); } finally { setBusy(false); }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true); setError(null);
    const token = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
    if (token) await api.rpc('forget_push_device', { p_token: token });
    await AsyncStorage.removeItem(PUSH_KEY).catch(() => {});
    setEnabled(false);
    setBusy(false);
  }, []);

  return { supported, enabled, busy, error, enable, disable };
}

export type FollowKind = 'TEAM' | 'MATCH' | 'TOURNAMENT';

/** Follow a team, match or tournament on this device. The first follow asks for notification permission. */
export function useFollow(kind: FollowKind, targetId: string | undefined) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported || !targetId) return;
    (async () => {
      const token = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
      if (!token) return setFollowing(false);
      const { data } = await api.rpc('get_push_follows', { p_token: token });
      setFollowing(((data ?? []) as { kind: string; target_id: string }[]).some((f) => f.kind === kind && f.target_id === targetId));
    })();
  }, [kind, targetId]);

  const toggle = useCallback(async () => {
    if (!targetId) return;
    setBusy(true); setError(null);
    try {
      const token = (await AsyncStorage.getItem(PUSH_KEY).catch(() => null)) ?? (await registerDevice());
      const { error: e } = await api.rpc(following ? 'unfollow_target' : 'follow_target', { p_token: token, p_kind: kind, p_target_id: targetId });
      if (e) throw new Error(e.message);
      setFollowing(!following);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
    } finally { setBusy(false); }
  }, [following, kind, targetId]);

  return { supported, following, busy, error, toggle };
}
