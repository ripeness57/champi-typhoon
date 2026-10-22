import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { C, S } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[S.card, style]}>{children}</View>;
}

export function CardHead({ label, src }: { label: string; src?: string | null }) {
  return (
    <View style={[S.between, { marginBottom: 10 }]}>
      <Text style={S.label}>{label}</Text>
      {src ? <Text style={[S.label, { fontSize: 10.5, letterSpacing: 0 }]}>{src}</Text> : null}
    </View>
  );
}

export function Btn({ on, label, onPress }: { on?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[S.btn, on && S.btnOn]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={[S.btnText, on && { color: C.cyan }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ text, color }: { text: string; color?: string }) {
  return (
    <View style={[S.chip, color ? { borderColor: color } : null]}>
      <Text style={[S.chipText, color ? { color } : null]}>{text}</Text>
    </View>
  );
}

export function Stat({ label, value, unit, sub, color }: { label: string; value: string | number | null | undefined; unit?: string; sub?: string | null; color?: string }) {
  return (
    <View style={{ width: '50%', paddingRight: 8, marginBottom: 12 }}>
      <Text style={S.label}>{label}</Text>
      <Text style={{ color: color || C.fg, fontFamily: 'monospace', fontSize: 22, fontWeight: '600' }}>
        {value ?? '-'}
        {unit ? <Text style={{ fontSize: 12, color: C.mute, fontWeight: '400' }}> {unit}</Text> : null}
      </Text>
      {sub ? <Text style={{ color: C.mute, fontSize: 12 }}>{sub}</Text> : null}
    </View>
  );
}
