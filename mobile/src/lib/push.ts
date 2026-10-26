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

type PushData = { kind?: string; matchId?: string; teamId?: string };

/** Open the screen a notification is about. */
export function openFromNotification(data: PushData | undefined) {
  if (!data?.kind) return;
  if (data.kind === 'MATCH_LIVE' && data.matchId) router.push({ pathname: '/match/[id]', params: { id: data.matchId } });
  else if ((data.kind === 'AUCTION_PLAYER_LIVE' || data.kind === 'AUCTION_OUTBID') && data.teamId) router.push({ pathname: '/owner/team/[teamId]/auction', params: { teamId: data.teamId } });
  else if (data.kind === 'LOT_TURN' && data.teamId) router.push({ pathname: '/owner/team/[teamId]', params: { teamId: data.teamId } });
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

/** Whether this device gets notifications, with switches for the Account screen. */
export function usePush() {
  const { session } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the registration fresh for a signed-in user who already turned notifications on.
  useEffect(() => {
    if (!supported || !session) return setEnabled(false);
    (async () => {
      const stored = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
      setEnabled(stored !== null);
      if (!stored) return;
      try {
        const token = await deviceToken();
        await api.rpc('register_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' });
        if (token !== stored) await AsyncStorage.setItem(PUSH_KEY, token);
      } catch { /* offline or permission revoked: the switch stays as the user left it */ }
    })();
  }, [session]);

  const enable = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const token = await deviceToken();
      const { error: e } = await api.rpc('register_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' });
      if (e) throw new Error(e.message);
      await AsyncStorage.setItem(PUSH_KEY, token);
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on notifications.');
    } finally { setBusy(false); }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true); setError(null);
    const token = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
    if (token) await api.rpc('unregister_push_token', { p_token: token });
    await AsyncStorage.removeItem(PUSH_KEY).catch(() => {});
    setEnabled(false);
    setBusy(false);
  }, []);

  return { supported, enabled, busy, error, enable, disable };
}

