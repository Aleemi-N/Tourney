import QRCode from 'qrcode';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { shareView, type ViewHandle } from '@/lib/share';
import { radius, useTheme } from '@/theme';

/** A QR code drawn as vector squares, always dark on white so every scanner reads it. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const rects = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) out.push({ x, y });
    return { n, cells: out };
  }, [value]);
  const quiet = 2;
  const total = rects.n + quiet * 2;
  return (
    <Svg accessibilityLabel={`QR code for ${value}`} width={size} height={size} viewBox={`0 0 ${total} ${total}`}>
      <Rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      {rects.cells.map((c) => <Rect key={`${c.x}-${c.y}`} x={c.x + quiet} y={c.y + quiet} width={1.02} height={1.02} fill="#0b1020" />)}
    </Svg>
  );
}

/** A printable QR card: title, QR and the address under it, with a button that shares it as an image. */
export function QrCard({ title, subtitle, value, fileName }: { title: string; subtitle?: string; value: string; fileName: string }) {
  const t = useTheme();
  const card = useRef<ViewHandle>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ gap: 10 }}>
      <View ref={card} collapsable={false} style={{ alignItems: 'center', gap: 10, padding: 20, borderRadius: radius['2xl'], backgroundColor: '#ffffff', borderWidth: 1, borderColor: t.border }}>
        <Text style={{ color: '#0b1020', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
        {subtitle ? <Text style={{ color: '#475569', fontSize: 13, textAlign: 'center' }}>{subtitle}</Text> : null}
        <QrCode value={value} />
        <Text style={{ color: '#475569', fontSize: 11, textAlign: 'center' }}>{value}</Text>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button tone="secondary" title="Share or print QR" accessibilityLabel={`Share QR for ${title}`} onPress={() => { setError(null); shareView(card.current, fileName, title).catch((e) => setError(e instanceof Error ? e.message : 'Could not share.')); }} />
    </View>
  );
}
