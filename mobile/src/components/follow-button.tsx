import { Bell, BellRing } from 'lucide-react-native';
import { View } from 'react-native';
import { Button, ErrorText } from '@/components/ui';
import { useFollow, type FollowKind } from '@/lib/push';
import { useTheme } from '@/theme';

/** Follow (or stop following) a team, match or tournament for push alerts. Hidden on the web. */
export function FollowButton({ kind, targetId, name }: { kind: FollowKind; targetId: string | undefined; name: string }) {
  const t = useTheme();
  const { supported, following, busy, error, toggle } = useFollow(kind, targetId);
  if (!supported || !targetId) return null;
  return (
    <View style={{ gap: 6 }}>
      <Button tone={following ? 'secondary' : 'primary'} title={following ? `Following ${name}` : `Follow ${name}`} accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`} loading={busy}
        icon={following ? <BellRing size={16} color={t.text} /> : <Bell size={16} color={t.primaryText} />} onPress={() => void toggle()} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}
