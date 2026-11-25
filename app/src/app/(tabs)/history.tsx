import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryItem } from '@/components/history-item';
import { ThemedText } from '@/components/themed-text';
import { Button, TabTopInset } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clearHistory, getHistory, type HistoryEntry } from '@/lib/storage';

export default function HistoryScreen() {
  const t = useTheme();
  const [items, setItems] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setItems);
    }, []),
  );

  const onClear = () => {
    const doClear = () => clearHistory().then(() => setItems([]));
    if (Platform.OS === 'web') return doClear();
    Alert.alert('Borrar historial', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: doClear },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.vin ?? i.plate}-${i.at}`}
        contentContainerStyle={styles.container}
        ListHeaderComponent={<ThemedText type="subtitle">Historial</ThemedText>}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary">Aún no has consultado ningún vehículo.</ThemedText>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        renderItem={({ item }) => <HistoryItem entry={item} />}
        ListFooterComponent={
          items.length ? <Button title="Borrar historial" variant="ghost" onPress={onClear} style={{ marginTop: Spacing.three }} /> : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    paddingTop: Spacing.three + TabTopInset,
    gap: Spacing.two,
    paddingBottom: Spacing.six * 2,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
