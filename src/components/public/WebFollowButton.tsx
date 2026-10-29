'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { callRpc, ensureWebPush, storedEndpoint, webPushSupported } from '@/lib/web-push';

type Kind = 'TEAM' | 'MATCH' | 'TOURNAMENT';

/** Follow a team, match or tournament for browser notifications. Hidden when the browser or the site cannot do push. */
export function WebFollowButton({ kind, targetId, slug, label }: { kind: Kind; targetId?: string; slug?: string; label: string }) {
  // Browser capability is only known on the client; the server render and first paint show nothing.
  const supported = useSyncExternalStore(() => () => {}, webPushSupported, () => false);
  const [id, setId] = useState<string | null>(targetId ?? null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A tournament is followed by its slug in the address; find its id.
  useEffect(() => {
    if (targetId || !slug) return;
    createClient().from('public_tournament_view').select('id').eq('slug', slug).maybeSingle().then(({ data }) => setId((data?.id as string | undefined) ?? null));
  }, [targetId, slug]);

  useEffect(() => {
    const endpoint = storedEndpoint();
    if (!supported || !id || !endpoint) return;
    callRpc('get_push_follows', { p_token: endpoint }).then(({ data }) => {
      setFollowing(((data ?? []) as { kind: string; target_id: string }[]).some((f) => f.kind === kind && f.target_id === id));
    });
  }, [supported, id, kind]);

  if (!supported || !id) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const endpoint = await ensureWebPush();
      const { error: e } = await callRpc(following ? 'unfollow_target' : 'follow_target', { p_token: endpoint, p_kind: kind, p_target_id: id! });
      if (e) throw new Error(e.message);
      setFollowing(!following);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  }

  const Icon = following ? BellRing : Bell;
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={following} aria-label={following ? `Stop following ${label}` : `Follow ${label}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-50">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{following ? 'Following' : 'Follow'}</span>
      </button>
      {error ? <span role="alert" className="max-w-48 text-right text-xs text-danger">{error}</span> : null}
    </span>
  );
}
