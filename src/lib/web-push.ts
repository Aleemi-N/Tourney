'use client';

import { createClient } from '@/lib/supabase/client';

const STORE = 'tourny-web-push';
export const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Whether this browser can get web push alerts at all (and the site has the key for it). */
export function webPushSupported() {
  return typeof window !== 'undefined' && !!vapidKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

const toBytes = (base64Url: string) => {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Calls a database function that the generated types do not list yet. */
export const callRpc = (name: string, args: Record<string, unknown>) =>
  (createClient() as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }).rpc(name, args);

/** The endpoint this browser registered earlier, if any. */
export const storedEndpoint = () => { try { return localStorage.getItem(STORE); } catch { return null; } };

/** Asks for permission, subscribes this browser and registers the subscription. Returns its endpoint (the device token). */
export async function ensureWebPush(): Promise<string> {
  const existing = storedEndpoint();
  if (existing && Notification.permission === 'granted') return existing;
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site in the browser settings.');
  const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(vapidKey) }));
  const json = subscription.toJSON();
  const { error } = await callRpc('register_web_push', { p_endpoint: json.endpoint ?? '', p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '' });
  if (error) throw new Error(error.message);
  try { localStorage.setItem(STORE, json.endpoint ?? ''); } catch { /* private mode: follows still work for this visit */ }
  return json.endpoint ?? '';
}
