import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { Volleyball } from 'lucide-react-native';
import { Text } from '@/components/text';
import { palettes, radius, tint } from '@/theme';

// Animated pieces of the home screen, matching the website's landing page. Built on React Native's own Animated API;
// every loop stops when the phone asks for reduced motion.

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Fades and lifts its children in after `delay` ms. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Counts from 0 up to `value`; screen readers get the real number. */
export function CountUp({ value, style }: { value: number; style?: object }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value: n }) => setShown(Math.round(n)));
    Animated.timing(v, { toValue: value, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => { v.removeListener(id); v.stopAnimation(); };
  }, [value, reduce]);
  return <Text accessibilityLabel={String(value)} style={style}>{reduce ? value : shown}</Text>;
}

/** The app icon's volleyball, shaded. Decorative. */
export function Ball({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="ballShade" cx="35%" cy="30%" r="75%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="70%" stopColor="#e0e7ff" />
          <Stop offset="100%" stopColor="#a5b4fc" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="47" fill="url(#ballShade)" />
      <G fill="none" stroke="#3730a3" strokeWidth={3} strokeLinecap="round">
        <Circle cx="50" cy="50" r="47" />
        <Path d="M50 50 C 40 30, 42 14, 56 4" />
        <Path d="M50 50 C 70 46, 86 52, 94 66" />
        <Path d="M50 50 C 44 70, 28 84, 12 82" />
        <Path d="M38 22 C 24 32, 14 48, 4 52" />
        <Path d="M72 30 C 84 22, 92 28, 96 38" />
        <Path d="M60 74 C 62 86, 56 94, 46 97" />
      </G>
    </Svg>
  );
}

type Side = 0 | 1;
type Match = { points: [number, number]; sets: [number, number]; set: number; serving: Side };
const START: Match = { points: [18, 16], sets: [1, 0], set: 2, serving: 0 };
const TEAMS = ['Blue Spikers', 'Coast Smash'];

/** One rally: the winner scores and serves; 25 points with a 2-point lead takes the set; 3 sets take the match. */
export function playRally(m: Match, winner: Side): Match {
  const points: [number, number] = [...m.points];
  points[winner]++;
  if (points[winner] < 25 || points[winner] - points[winner === 0 ? 1 : 0] < 2) return { ...m, points, serving: winner };
  const sets: [number, number] = [...m.sets];
  sets[winner]++;
  if (sets[winner] === 3) return START;
  return { points: [0, 0], sets, set: m.set + 1, serving: winner };
}

/** A sample scoreboard that plays itself point by point — always in the dark TV look. */
export function LiveScoreboard() {
  const d = palettes.dark;
  const reduce = useReduceMotion();
  const [m, setM] = useState(START);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setM((x) => playRally(x, Math.random() < 0.55 ? x.serving : (x.serving === 0 ? 1 : 0))), 1800);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { clearInterval(id); loop.stop(); };
  }, [reduce, pulse]);

  return (
    <View accessibilityLabel="Sample live scoreboard" style={{ backgroundColor: d.surface, borderColor: d.border, borderWidth: 1, borderRadius: 24, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: tint(d.live, 0.3), backgroundColor: tint(d.live, 0.1), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: d.live, opacity: pulse }} />
          <Text style={{ color: d.live, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>LIVE</Text>
        </View>
        <Text style={{ color: d.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>SAMPLE MATCH · SET {m.set}</Text>
      </View>
      {TEAMS.map((team, i) => {
        const side = i as Side;
        const leading = m.points[side] > m.points[side === 0 ? 1 : 0];
        return (
          <View key={team} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, borderColor: leading ? tint(d.primary, 0.5) : d.border, backgroundColor: leading ? tint(d.primary, 0.12) : d.surfaceMuted }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: m.serving === side ? d.warning : 'transparent' }} />
              <Text numberOfLines={1} style={{ color: d.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{team}</Text>
              <View style={{ backgroundColor: d.background, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: d.textSecondary, fontSize: 12, fontWeight: '700' }}>Sets {m.sets[side]}</Text>
              </View>
            </View>
            <Text style={{ color: d.text, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{m.points[side]}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A court in perspective with a rally going over the net, and a "Sold" auction card. Decorative. */
export function CourtScene({ primary, text, surface, border, success, muted }: { primary: string; text: string; surface: string; border: string; success: string; muted: string }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) { t.setValue(0.5); stamp.setValue(1); return; }
    const rally = Animated.loop(Animated.timing(t, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }));
    const sold = Animated.loop(Animated.sequence([
      Animated.timing(stamp, { toValue: 1, duration: 350, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(stamp, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.delay(600),
    ]));
    rally.start(); sold.start();
    return () => { rally.stop(); sold.stop(); };
  }, [reduce, t, stamp]);

  // The ball's path: served from the left, over the net, dug on the right, back over.
  const steps = [0, 0.25, 0.5, 0.75, 1];
  const x = t.interpolate({ inputRange: steps, outputRange: [-120, -15, 105, 15, -120] });
  const y = t.interpolate({ inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], outputRange: [0, -120, -150, -90, 0, -110, -140, -80, 0] });
  const spin = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
  const shadow = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.5, 1, 0.55, 1] });

  return (
    <View style={{ height: 300, alignItems: 'center', justifyContent: 'flex-end' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Court */}
      <View style={{ width: '100%', height: 200, borderWidth: 2, borderColor: tint(primary, 0.5), backgroundColor: tint(primary, 0.1), borderRadius: 8, transform: [{ perspective: 700 }, { rotateX: '58deg' }], marginBottom: -30 }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, backgroundColor: tint(primary, 0.7) }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: '33%', height: 1, backgroundColor: tint(primary, 0.4) }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: '67%', height: 1, backgroundColor: tint(primary, 0.4) }} />
      </View>
      {/* Net */}
      <View style={{ position: 'absolute', bottom: 70, width: '86%', height: 54, borderTopWidth: 4, borderTopColor: text, opacity: 0.8, flexDirection: 'row', justifyContent: 'space-between' }}>
        {Array.from({ length: 22 }, (_, i) => <View key={i} style={{ width: 1, backgroundColor: border }} />)}
      </View>
      <View style={{ position: 'absolute', bottom: 70, width: '86%', top: undefined, height: 54, justifyContent: 'space-between' }}>
        {Array.from({ length: 5 }, (_, i) => <View key={i} style={{ height: 1, backgroundColor: border }} />)}
      </View>
      {/* Ball shadow, then the ball */}
      <Animated.View style={{ position: 'absolute', bottom: 46, width: 48, height: 12, borderRadius: 24, backgroundColor: tint(text, 0.2), transform: [{ translateX: x }, { scale: shadow }] }} />
      <Animated.View style={{ position: 'absolute', bottom: 52, transform: [{ translateX: x }, { translateY: y }, { rotate: spin }] }}>
        <Ball size={52} />
      </Animated.View>
      {/* Sold card */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: 200, backgroundColor: surface, borderColor: border, borderWidth: 1, borderRadius: radius['2xl'], padding: 12, gap: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>AK</Text>
          </View>
          <View>
            <Text style={{ color: text, fontSize: 15, fontWeight: '700' }}>Arjun K.</Text>
            <Text style={{ color: muted, fontSize: 12 }}>Setter · Icon lot</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: muted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>FINAL BID</Text>
            <Text style={{ color: text, fontSize: 20, fontWeight: '800' }}>₹12,500</Text>
          </View>
          <Animated.View style={{ borderWidth: 2, borderColor: success, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, opacity: stamp, transform: [{ rotate: '-12deg' }, { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [2, 1] }) }] }}>
            <Text style={{ color: success, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 }}>SOLD</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const TICKER = ['Live scoring', 'Player auctions', 'Lot draw', 'Fixtures', 'Standings', 'Certificates', 'Jersey export', 'Notifications'];

/** An endless strip of feature names, drawn twice so the loop has no seam. */
export function Marquee({ background, color }: { background: string; color: string }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !width) return;
    const loop = Animated.loop(Animated.timing(x, { toValue: -width, duration: width * 25, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, width, x]);

  const row = (key: string, measure?: boolean) => (
    <View key={key} onLayout={measure ? (e) => setWidth(e.nativeEvent.layout.width) : undefined} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {TICKER.map((item) => (
        <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14 }}>
          <Text style={{ color, fontSize: 18, fontWeight: '800', letterSpacing: 1 }}>{item.toUpperCase()}</Text>
          <Volleyball size={18} color={color} opacity={0.7} />
        </View>
      ))}
    </View>
  );

  return (
    <View accessibilityLabel={TICKER.join(', ')} style={{ backgroundColor: background, paddingVertical: 12, overflow: 'hidden', transform: [{ rotate: '-1.5deg' }], marginHorizontal: -8 }}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }] }}>
        {row('a', true)}
        {row('b')}
      </Animated.View>
    </View>
  );
}
