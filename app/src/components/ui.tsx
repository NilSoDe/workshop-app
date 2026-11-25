import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** En web las pestañas van arriba: deja hueco para no tapar el contenido. */
export const TabTopInset = Platform.OS === 'web' ? 64 : 0;

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.backgroundElement }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'secondary' ? t.backgroundSelected : 'transparent';
  const fg = variant === 'primary' ? t.accentText : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <ThemedText style={{ color: fg, fontWeight: 700 }}>
          {icon ? `${icon}  ` : ''}
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Badge({ label, color = 'textSecondary' }: { label: string; color?: ThemeColor }) {
  const t = useTheme();
  return (
    <View style={[styles.badge, { borderColor: t[color] }]}>
      <ThemedText type="small" style={{ color: t[color], fontSize: 12, lineHeight: 16 }}>
        {label}
      </ThemedText>
    </View>
  );
}

export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: t.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText type={mono ? 'code' : 'small'} style={styles.rowValue} selectable>
        {value}
      </ThemedText>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {children}
      </ThemedText>
      {right}
    </View>
  );
}

export function Notice({ text, tone = 'warning' }: { text: string; tone?: 'warning' | 'danger' | 'success' }) {
  const t = useTheme();
  return (
    <View style={[styles.notice, { borderLeftColor: t[tone], backgroundColor: t.backgroundElement }]}>
      <ThemedText type="small">{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  button: {
    minHeight: 52,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flexShrink: 0, maxWidth: '45%' },
  rowValue: { flex: 1, textAlign: 'right' },
  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  notice: { borderLeftWidth: 4, borderRadius: Radius.sm, padding: Spacing.three },
});
