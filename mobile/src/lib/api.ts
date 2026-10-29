import AsyncStorage from '@react-native-async-storage/async-storage';
import { Api, type StoredSession } from './client';

// One backend for web and mobile: the client in ./client.ts (a copy of the web app's src/lib/api/core.ts) talks to the
// Spring Boot API in ../api. Set EXPO_PUBLIC_API_URL (see .env.example).
// Android emulators reach the host machine at 10.0.2.2; iOS simulators and web use localhost.
const url = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

const SESSION_KEY = 'tourny-session';

export const api = new Api(url, {
  store: {
    get: async () => {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    },
    set: async (session) => {
      if (session) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else await AsyncStorage.removeItem(SESSION_KEY);
    },
  },
});

export const apiUrl = url;

/** Public URL of a stored image (logos, avatars, player photos), or null. */
export function imageUrl(bucket: 'logos' | 'avatars' | 'player-photos', path: string | null | undefined): string | null {
  return path ? api.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
}

/** The website, for pages that must open in a browser (password reset). */
export const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000';
