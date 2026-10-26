import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from '@/lib/api';

export const PUSH_KEY = 'tourny-push-token';

/** Forget this device's token on sign-out so the next person on the phone does not get the previous user's messages. */
export async function forgetPushToken() {
  if (Platform.OS === 'web') return;
  const token = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
  if (token) await api.rpc('unregister_push_token', { p_token: token });
}
