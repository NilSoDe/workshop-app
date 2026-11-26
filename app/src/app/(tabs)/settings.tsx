import type { ProviderStatus } from '@workshop/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Notice, SectionTitle, TabTopInset } from '@/components/ui';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, getApiUrl } from '@/lib/api';
import { clearSession, useSession } from '@/lib/session';
import { getApiUrlOverride, setApiUrlOverride } from '@/lib/storage';

const KIND_LABEL: Record<ProviderStatus['kind'], string> = {
  ocr: 'Lectura de fotos (OCR)',
  vin_decode: 'Decodificación VIN',
  plate_lookup: 'Matrícula → VIN',
  recalls: 'Llamadas a revisión',
  workshop_data: 'Datos de taller (esquemas, manuales)',
};

export default function SettingsScreen() {
  const t = useTheme();
  const session = useSession();
  const [url, setUrl] = useState(getApiUrlOverride() ?? '');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      await api.health();
      setProviders(await api.providers());
      setStatus({ ok: true, msg: `Conectado a ${getApiUrl()}` });
    } catch (e) {
      setProviders(null);
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check]),
  );

  const save = async () => {
    await setApiUrlOverride(url.trim() || null);
    check();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Ajustes</ThemedText>

        <Card>
          <ThemedText type="smallBold">Cuenta</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {session?.user.name ? `${session.user.name} · ` : ''}
            {session?.user.email}
          </ThemedText>
          <Button title="Cerrar sesión" variant="secondary" onPress={() => clearSession()} />
        </Card>

        <Card>
          <ThemedText type="smallBold">Servidor API</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Déjalo vacío para usar el automático ({getApiUrl()}).
          </ThemedText>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.1.50:8787"
            placeholderTextColor={t.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: t.text, borderColor: t.border, fontFamily: Fonts?.mono }]}
          />
          <Button title="Guardar y probar" onPress={save} loading={busy} />
          {status && <Notice text={status.msg} tone={status.ok ? 'success' : 'danger'} />}
        </Card>

        {providers && (
          <View>
            <SectionTitle>Fuentes de datos</SectionTitle>
            <Card>
              {providers.map((p) => (
                <View key={p.id} style={[styles.row, { borderBottomColor: t.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText type="smallBold">{p.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {KIND_LABEL[p.kind]} · {p.description}
                    </ThemedText>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Badge label={p.configured ? 'Activo' : 'Sin configurar'} color={p.configured ? 'success' : 'textSecondary'} />
                    <Badge label={p.free ? 'Gratis' : 'De pago'} />
                  </View>
                </View>
              ))}
            </Card>
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              Las claves se configuran en el servidor (server/.env), nunca en la app.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.three, fontSize: 16 },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
});
