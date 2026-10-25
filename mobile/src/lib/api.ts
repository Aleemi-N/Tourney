import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// One backend for web and mobile: the Spring Boot API speaks the supabase-js protocol, so the
// client only needs its address. Set EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_KEY (see .env.example).
// Android emulators reach the host machine at 10.0.2.2; iOS simulators and web use localhost.
const url = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';
const key = process.env.EXPO_PUBLIC_API_KEY ?? 'anon';

export const api = createClient(url, key, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export const apiUrl = url;

/** Public URL of a stored image (logos, avatars, player photos), or null. */
export function imageUrl(bucket: 'logos' | 'avatars' | 'player-photos', path: string | null | undefined): string | null {
  return path ? api.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
}

/** The website, for pages that must open in a browser (password reset). */
export const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000';
