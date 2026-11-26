import { decodeVinLocal, type DocumentKind, type LibraryScope } from '@workshop/core';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Notice, SectionTitle } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

const KINDS: [DocumentKind, string][] = [
  ['esquema_electrico', 'Esquema eléctrico'],
  ['manual_taller', 'Manual de taller'],
  ['mantenimiento', 'Mantenimiento'],
  ['boletin_tecnico', 'Boletín técnico'],
  ['manual_usuario', 'Manual del propietario'],
  ['otro', 'Otro'],
];

type Picked = DocumentPicker.DocumentPickerAsset;

export default function UploadScreen() {
  const t = useTheme();
  const p = useLocalSearchParams<{ vin?: string; make?: string; model?: string; kind?: string }>();
  const platform = p.vin ? decodeVinLocal(p.vin).platform : undefined;

  const scopes: [LibraryScope, string][] = [];
  if (p.vin) scopes.push(['vin', `Solo este VIN (${p.vin.slice(-6)})`]);
  if (platform) scopes.push(['platform', `Toda la plataforma ${platform.searchTerm}${platform.label ? ` · ${platform.label}` : ''}`]);
  if (p.make && p.model) scopes.push(['model', `Todos los ${p.make} ${p.model}`]);
  if (p.make) scopes.push(['make', `Toda la marca ${p.make}`]);

  const initialKind = (KINDS.find(([k]) => k === p.kind)?.[0] ?? 'esquema_electrico') as DocumentKind;
  const [kind, setKind] = useState<DocumentKind>(initialKind);
  const [scope, setScope] = useState<LibraryScope | undefined>(
    (initialKind === 'esquema_electrico' && platform ? 'platform' : scopes[0]?.[0]) as LibraryScope | undefined,
  );
  const [file, setFile] = useState<Picked | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setFile(a);
    if (!title) setTitle(a.name.replace(/\.pdf$/i, ''));
    setError(null);
  };

  const send = async () => {
    if (!file || !scope) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (Platform.OS === 'web' && file.file) {
        form.append('file', file.file, file.name);
      } else {
        // React Native sube el archivo a partir de su uri
        form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/pdf' } as unknown as Blob);
      }
      form.append('title', title);
      form.append('kind', kind);
      form.append('scope', scope);
      if (p.vin) form.append('vin', p.vin);
      if (p.make) form.append('make', p.make);
      if (p.model) form.append('model', p.model);
      await api.uploadPdf(form);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!scopes.length) {
    return (
      <View style={[styles.container, { backgroundColor: t.background, flex: 1 }]}>
        <Notice text="No sé a qué vehículo vincular el PDF: hace falta el VIN o al menos la marca." />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ThemedText themeColor="textSecondary">
        Guarda aquí los manuales y esquemas que ya tengas (por ejemplo, los que descargues del portal oficial). Aparecerán cada vez
        que consultes un vehículo al que apliquen.
      </ThemedText>

      <Card>
        <Button title={file ? 'Cambiar PDF' : 'Elegir PDF'} variant={file ? 'secondary' : 'primary'} onPress={pick} />
        {file && (
          <ThemedText type="small" themeColor="textSecondary">
            {file.name}
            {file.size
              ? ` · ${file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}`
              : ''}
          </ThemedText>
        )}
        <ThemedText type="smallBold">Título</ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ej.: Esquema cierre centralizado"
          placeholderTextColor={t.textSecondary}
          style={[styles.input, { color: t.text, borderColor: t.border }]}
        />
      </Card>

      <SectionTitle>Tipo</SectionTitle>
      <View style={styles.chips}>
        {KINDS.map(([k, label]) => (
          <Chip key={k} label={label} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      <SectionTitle>¿A qué vehículos aplica?</SectionTitle>
      <View style={{ gap: Spacing.two }}>
        {scopes.map(([s, label]) => (
          <Chip key={s} label={label} selected={scope === s} onPress={() => setScope(s)} wide />
        ))}
      </View>

      {error && <Notice text={error} tone="danger" />}
      <Button title="Guardar en la biblioteca" onPress={send} loading={busy} disabled={!file || !scope} />
    </ScrollView>
  );
}

function Chip({ label, selected, onPress, wide }: { label: string; selected: boolean; onPress: () => void; wide?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        wide && { alignSelf: 'stretch' },
        { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.backgroundSelected : 'transparent' },
      ]}>
      <ThemedText type="small" style={{ fontWeight: selected ? 700 : 400 }}>
        {selected ? '● ' : '○ '}
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  input: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.three, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
