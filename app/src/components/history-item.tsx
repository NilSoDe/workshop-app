import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import type { HistoryEntry } from '@/lib/storage';

export function openVehicle(q: { vin?: string; plate?: string }) {
  router.push({ pathname: '/vehicle', params: q });
}

export function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const s = entry.summary;
  const title = [s.make, s.model].filter(Boolean).join(' ') || 'Vehículo sin identificar';
  return (
    <Pressable onPress={() => openVehicle(entry.vin ? { vin: entry.vin, ...(entry.plate ? { plate: entry.plate } : {}) } : { plate: entry.plate ?? entry.value })}>
      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText type="smallBold">
            {title}
            {s.year ? ` · ${s.year}` : ''}
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            {[entry.plate, entry.vin].filter(Boolean).join('  ·  ')}
          </ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">›</ThemedText>
      </Card>
    </Pressable>
  );
}
