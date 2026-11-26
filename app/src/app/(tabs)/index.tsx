import { decodeVinLocal, detectQuery, parseSpanishPlate } from '@workshop/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, SectionTitle, TabTopInset } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { HistoryItem, openVehicle } from '@/components/history-item';
import { getHistory, type HistoryEntry } from '@/lib/storage';

export default function SearchScreen() {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getHistory().then((h) => setRecent(h.slice(0, 3)));
    }, []),
  );

  const detected = query.trim() ? detectQuery(query) : null;
  const hint = (() => {
    if (!query.trim()) return null;
    if (detected?.type === 'vin') return { label: 'VIN válido', color: 'success' as const };
    if (detected?.type === 'plate') {
      const p = parseSpanishPlate(query);
      return { label: `Matrícula ${p.type}${p.province ? ` · ${p.province}` : ''}`, color: 'success' as const };
    }
    const v = decodeVinLocal(query);
    if (v.vin.length > 8) return { label: v.warnings[0] ?? 'VIN incompleto', color: 'warning' as const };
    return { label: 'Escribe una matrícula o un VIN', color: 'textSecondary' as const };
  })();

  const submit = () => {
    if (!detected) return;
    openVehicle(detected.type === 'vin' ? { vin: detected.value } : { plate: detected.value });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">Workshop</ThemedText>
          <ThemedText themeColor="textSecondary">
            Identifica un vehículo por matrícula o bastidor y consulta su ficha técnica, documentación y esquemas.
          </ThemedText>
        </View>

        <View style={styles.scanRow}>
          <ScanTile title="Matrícula" subtitle="Foto de la placa" icon="🚘" onPress={() => router.push({ pathname: '/scan', params: { kind: 'plate' } })} />
          <ScanTile title="VIN" subtitle="Parabrisas o ficha técnica" icon="🔎" onPress={() => router.push({ pathname: '/scan', params: { kind: 'vin' } })} />
        </View>

        <Card>
          <ThemedText type="smallBold">Introducir a mano</ThemedText>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="1234 BCD  ·  VSSZZZ5FZKR123456"
            placeholderTextColor={t.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submit}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.background, fontFamily: Fonts?.mono }]}
          />
          {hint && <Badge label={hint.label} color={hint.color} />}
          <Button title="Buscar" onPress={submit} disabled={!detected} />
        </Card>

        {recent.length > 0 && (
          <View>
            <SectionTitle>Recientes</SectionTitle>
            <View style={{ gap: Spacing.two }}>
              {recent.map((h) => (
                <HistoryItem key={`${h.vin ?? h.plate}-${h.at}`} entry={h} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScanTile({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Escanear ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 }]}>
      <ThemedText style={{ fontSize: 32, lineHeight: 40 }}>{icon}</ThemedText>
      <ThemedText style={{ color: t.accentText, fontWeight: 800, fontSize: 18 }}>Escanear {title}</ThemedText>
      <ThemedText type="small" style={{ color: t.accentText, opacity: 0.85 }}>
        {subtitle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    paddingTop: Spacing.three + TabTopInset,
    gap: Spacing.three,
    paddingBottom: Spacing.six * 2,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scanRow: { flexDirection: 'row', gap: Spacing.three },
  tile: { flex: 1, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.one, minHeight: 140, justifyContent: 'flex-end' },
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.three, fontSize: 18, letterSpacing: 1 },
});
